// 比赛日：组建队伍、AI 间比赛、结算到球员
import type { Player, Pos, School, Tournament } from './types';
import type { MatchRules, MatchSummary, TeamSetup } from '../sim/types';
import { G } from './state';
import { chance } from './rng';
import { clamp } from './util';
import { Match } from '../sim/match';
import { autoBench, autoLineup, pickStarter } from './team';
import { available, generatePlayer } from './player';
import { rosterPlayers } from './world';
import { addBat, addPit, emptyBat, emptyPit, has, isPitcher } from './attrs';
import { roleSkill } from './staff';

export const STADIUMS = {
  koshien: { name: '阪神甲子园球场', line: 95, center: 118 },
  jingu: { name: '明治神宫野球场', line: 97, center: 120 },
  pref: { name: '县营球场', line: 92, center: 116 },
  school: { name: '学校球场', line: 90, center: 112 },
};

export function rulesFor(t: Tournament | null, r: number): MatchRules {
  const final = !!t && r === t.rounds.length - 1;
  const st = !t ? STADIUMS.school : t.koshien ? STADIUMS.koshien : t.kind === 'jingu' ? STADIUMS.jingu : STADIUMS.pref;
  return {
    innings: 9,
    mercy: !!t && t.mercy && !final,
    dh: G.dh,
    koshien: !!t && t.koshien,
    bigGame: (!!t && t.koshien) || final,
    official: !!t,
    tiebreakFrom: 10,
    maxInnings: 20,
    pitchLimit: 500,
    moundVisits: 3,
    fence: { line: st.line, center: st.center },
    stadium: st.name,
  };
}

export function availableOf(s: School): Player[] {
  return rosterPlayers(s).filter((p) => available(p, G.absWeek));
}

/** 我方：从登录名单与保存的阵容构建 */
export function myLineup(rules: MatchRules): { players: Player[]; order: number[]; defense: Partial<Record<Pos, number>> } {
  const s = G.schools[G.club.schoolId];
  const avail = availableOf(s);
  const lu = G.club.lineup;
  let bench = lu.autoBench ? autoBench(avail, 20, rules.dh) : lu.bench.filter((id) => avail.some((p) => p.id === id));
  if (bench.length < 9) bench = autoBench(avail, 20, rules.dh);
  const players = bench.map((id) => G.players[id]).filter(Boolean);
  if (!lu.auto && validLineup(players, lu.order, lu.defense, rules.dh)) {
    return { players, order: lu.order.slice(), defense: { ...lu.defense } };
  }
  const starter = pickStarter(players, lu.rotation);
  const auto = autoLineup(players, rules.dh, starter);
  return { players, order: auto.order, defense: auto.defense };
}

export function validLineup(players: Player[], order: number[], defense: Partial<Record<Pos, number>>, dh: boolean): boolean {
  const ids = new Set(players.map((p) => p.id));
  if (order.length !== 9 || new Set(order).size !== 9) return false;
  if (!order.every((id) => ids.has(id))) return false;
  const poss: Pos[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  const defIds = poss.map((p) => defense[p]);
  if (defIds.some((id) => id === undefined || !ids.has(id))) return false;
  if (new Set(defIds).size !== 9) return false;
  const fielders = poss.filter((p) => p !== 'P').map((p) => defense[p]!);
  if (!fielders.every((id) => order.includes(id))) return false;
  const pInOrder = order.includes(defense.P!);
  if (!dh && !pInOrder) return false;
  if (dh && pInOrder) return false;
  return true;
}

export function setupFor(s: School, human: boolean, rules: MatchRules): TeamSetup {
  let players: Player[];
  let order: number[];
  let defense: Partial<Record<Pos, number>>;
  if (human) {
    ({ players, order, defense } = myLineup(rules));
  } else {
    const avail = availableOf(s);
    players = avail.length > 20 ? autoBench(avail, 20, rules.dh).map((id) => G.players[id]) : avail;
    const lu = autoLineup(players, rules.dh);
    order = lu.order;
    defense = lu.defense;
  }
  if (order.length < 9 || Object.keys(defense).length < 9) {
    // 人数不足：临时借用选手（不写入存档）
    players = players.slice();
    while (players.length < 10) {
      const f = generatePlayer({ quality: 15, grade: 2, enrollYear: G.year - 1, schoolId: -1, pos: players.some((p) => isPitcher(p)) ? 'RF' : 'P' });
      f.fam = '借用';
      players.push(f);
    }
    const lu = autoLineup(players, rules.dh);
    order = lu.order;
    defense = lu.defense;
  }
  const me = s.id === G.club.schoolId;
  const crowd = rules.koshien ? clamp((me ? G.club.fans / 30000 : 0) + s.prestige / 200, 0, 1) : 0;
  return {
    schoolId: s.id,
    name: s.name,
    short: s.short,
    colors: s.colors,
    players,
    order,
    defense,
    human,
    style: me ? 'balanced' : s.style,
    mgrTactics: me ? clamp(G.manager.skills.tactics + roleSkill('analyst') / 8, 0, 100) : s.mgrSkill,
    teamTactics: me ? G.club.tacticsSkill + roleSkill('analyst') / 10 : clamp(30 + s.prestige * 0.4, 0, 100),
    chemistry: me ? G.club.chemistry : clamp(45 + s.prestige * 0.2, 0, 100),
    crowd,
  };
}

/** AI 与 AI 的完整模拟（双方均有名单） */
export function simulateAIMatch(A: School, B: School, t: Tournament | null, r: number): { sa: number; sb: number; inn: number; called: boolean } {
  const rules = rulesFor(t, r);
  const aAway = chance(0.5);
  const away = aAway ? A : B;
  const home = aAway ? B : A;
  const m = new Match(setupFor(away, false, rules), setupFor(home, false, rules), rules);
  m.toEnd();
  const sum = m.summary();
  applySummary(m, sum, rules);
  const sa = aAway ? sum.score[0] : sum.score[1];
  const sb = aAway ? sum.score[1] : sum.score[0];
  return { sa, sb, inn: sum.innings, called: sum.called };
}

/** 把比赛结果写入球员数据 */
export function applySummary(m: Match, sum: MatchSummary, rules: MatchRules): void {
  for (const side of [0, 1] as const) {
    const t = m.T[side];
    const won = sum.winner === side;
    for (const pid of t.appeared) {
      const p = G.players[pid];
      if (!p) continue;
      const bl = emptyBat();
      const box = sum.bat[side].find((b) => b.pid === pid);
      if (box) {
        bl.pa = box.pa; bl.ab = box.ab; bl.h = box.h; bl.d = box.d; bl.t = box.t; bl.hr = box.hr; bl.rbi = box.rbi; bl.r = box.r;
        bl.bb = box.bb; bl.hbp = box.hbp; bl.so = box.so; bl.sb = box.sb; bl.cs = box.cs; bl.sac = box.sac; bl.sf = box.sf; bl.e = box.e;
      }
      bl.g = 1;
      const pl = emptyPit();
      const pbox = sum.pit[side].find((b) => b.pid === pid);
      if (pbox) {
        pl.g = 1;
        pl.gs = pbox.start ? 1 : 0;
        pl.outs = pbox.outs; pl.h = pbox.h; pl.r = pbox.r; pl.er = pbox.er; pl.bb = pbox.bb; pl.so = pbox.so; pl.hr = pbox.hr; pl.np = pbox.np; pl.bf = pbox.bf;
        if (sum.wp === pid) pl.w = 1;
        if (sum.lp === pid) pl.l = 1;
        if (pbox.start && t.pitchers.length === 1) {
          pl.cg = 1;
          if (pbox.r === 0) pl.sho = 1;
        }
        p.pitchesWeek += pbox.np;
        p.fatigue = clamp(p.fatigue + pbox.np * 0.32, 0, 100);
      } else {
        p.fatigue = clamp(p.fatigue + 5, 0, 100);
      }
      if (rules.official) {
        addBat(p.stats.season.bat, bl);
        addBat(p.stats.career.bat, bl);
        addPit(p.stats.season.pit, pl);
        addPit(p.stats.career.pit, pl);
        if (rules.koshien) {
          addBat(p.stats.koshien.bat, bl);
          addPit(p.stats.koshien.pit, pl);
        }
      }
      // 干劲与调子
      let dm = won ? 3 : -2;
      if (sum.mvp === pid) dm += 5;
      if (bl.hr) dm += 2;
      if (pbox && pbox.er >= 5) dm -= 3;
      if (p.pers === 'hot') dm *= 1.6;
      if (p.pers === 'calm') dm *= 0.6;
      if (has(p, 'mood') && !won) dm += 1;
      p.morale = clamp(p.morale + dm, 0, 100);
      if (sum.mvp === pid && chance(0.4)) p.cond = Math.min(2, p.cond + 1);
      if (rules.koshien) {
        p.pop = clamp(p.pop + (bl.hr ? 6 : 0) + (sum.mvp === pid ? 5 : 0) + 1, 0, 100);
      } else if (rules.bigGame) p.pop = clamp(p.pop + (sum.mvp === pid ? 2 : 0), 0, 100);
    }
  }
}

export function teamPitchersRested(s: School): Player[] {
  return availableOf(s).filter(isPitcher).sort((a, b) => a.fatigue - b.fatigue);
}
