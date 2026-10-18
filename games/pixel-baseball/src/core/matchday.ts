// 本校的比赛：组队、模拟（按存下来的种子，可以重演）、把结果写回球员和记录
import type { GameRecord, LiveRecord, PendingMatch, Player, Pos, SchoolLite, Tour, TourKind } from './types';
import { POS_ABBR } from './types';
import type { MatchRules, MatchSummary, PlayEvent, TeamSetup } from '../sim/types';
import { Match } from '../sim/match';
import { G, addRep, log, milestone, mySchool, myPlayers, note } from './state';
import { chance, withSeed } from './rng';
import { clamp } from './util';
import { addBat, addPit, emptyBat, emptyPit, fullName, has, isPitcher, overall } from './attrs';
import { autoBench, autoLineup } from './team';
import { benchFor, todayLineup, todayStarter } from './lineup';
import { available } from './player';
import { opponentRoster, schoolById } from './world';
import { addExp } from './growth';
import { yearIdx } from './calendar';
import { recordResult } from './tournament';

export const STADIUMS = {
  koshien: { name: '阪神甲子园球场', line: 95, center: 118 },
  jingu: { name: '明治神宫野球场', line: 97, center: 120 },
  pref: { name: '县营球场', line: 92, center: 116 },
  school: { name: '学校球场', line: 90, center: 112 },
};

export function rulesFor(t: Tour | null, r: number): MatchRules {
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

/** 起用方针带来的上场倾向 */
function lineupBias(official: boolean): (p: Player) => number {
  const pol = G.policies.lineup;
  if (pol === 'seniors') return (p) => (p.grade === 3 ? 4 : p.grade === 2 ? 1.5 : 0);
  if (pol === 'youth') return (p) => (p.grade === 1 ? (official ? 2.5 : 7) : p.grade === 2 ? (official ? 1 : 3) : 0);
  return () => 0;
}

export function mySetup(rules: MatchRules): TeamSetup {
  return mySetupFull(rules).setup;
}

/**
 * 本校的出场阵容：按自定义阵容（练习赛默认按起用方针自动排），缺人自动补位。
 * human：亲自指挥；forced：指定的先发投手；rec：读档重演时用开赛时记下的阵容
 */
export function mySetupFull(rules: MatchRules, o: { human?: boolean; forced?: number | null; rec?: LiveRecord } = {}): { setup: TeamSetup; notes: string[] } {
  const s = mySchool();
  const pol = G.policies;
  let avail = myPlayers().filter(available);
  // 人数实在不够时只能借人（不写入存档）
  if (avail.length < 9) avail = fillBorrowed(avail);
  let players: Player[];
  let order: number[];
  let defense: Partial<Record<Pos, number>>;
  let notes: string[] = [];
  if (o.rec) {
    const pool = new Map(avail.map((p) => [p.id, p]));
    players = o.rec.players.map((id) => pool.get(id) ?? G.players[id]).filter(Boolean);
    order = o.rec.order.slice();
    defense = { ...o.rec.defense };
  } else {
    const plan = G.lineup && (rules.official || G.lineup.practice) ? G.lineup : null;
    const starter = todayStarter(avail, rules.pitchLimit, o.forced ?? G.nextStarter);
    const must = plan ? plan.bat.filter((x) => x.pos !== 'P').map((x) => x.pid) : [];
    if (starter) must.push(starter.id);
    players = plan ? benchFor(avail, must, rules.dh) : avail.length > 20 ? autoBench(avail, 20, rules.dh).map((id) => avail.find((p) => p.id === id)!) : avail;
    if (starter && !players.includes(starter)) players = [...players, starter];
    const lu = plan ? todayLineup(players, rules.dh, starter, plan, lineupBias(rules.official)) : (() => {
      const a = autoLineup(players, rules.dh, starter, lineupBias(rules.official));
      return { order: a.order, defense: a.defense, notes: [] as string[] };
    })();
    order = lu.order;
    defense = lu.defense;
    notes = lu.notes;
  }
  const crowd = rules.koshien ? clamp(G.club.fans / 30000 + s.prestige / 200, 0, 1) : rules.bigGame ? 0.3 : 0;
  const setup: TeamSetup = {
    schoolId: s.id,
    name: s.name,
    short: s.short,
    colors: s.colors,
    players,
    order,
    defense,
    human: !!o.human,
    style: pol.style,
    mgrTactics: clamp(G.mgr.skills.tactics + G.facilities.analysis * 3, 0, 100),
    teamTactics: G.club.tactics,
    chemistry: G.club.chemistry,
    crowd,
    hook: pol.pitcherUse === 'ace' ? 0.78 : pol.pitcherUse === 'bullpen' ? 1.35 : 1,
  };
  return { setup, notes };
}

function fillBorrowed(players: Player[]): Player[] {
  const out = players.slice();
  let k = 0;
  while (out.length < 10) {
    const pos: Pos = out.some(isPitcher) ? 'RF' : 'P';
    const f = { ...out[0], id: -900 - k++, fam: '借用', given: `选手${k}`, pos, injury: null, benched: 0, retired: false, traits: [] } as Player;
    out.push(f);
  }
  return out;
}

export function oppSetup(s: SchoolLite, rules: MatchRules, day: number): TeamSetup {
  const ros = opponentRoster(s, day);
  const players = ros.length > 20 ? autoBench(ros, 20, rules.dh).map((id) => ros.find((p) => p.id === id)!) : ros;
  const lu = autoLineup(players, rules.dh);
  return {
    schoolId: s.id,
    name: s.name,
    short: s.short,
    colors: s.colors,
    players,
    order: lu.order,
    defense: lu.defense,
    human: false,
    style: s.style,
    mgrTactics: clamp(30 + s.prestige * 0.5, 10, 95),
    teamTactics: clamp(30 + s.prestige * 0.4, 0, 100),
    chemistry: clamp(45 + s.prestige * 0.2, 0, 100),
    crowd: rules.koshien ? clamp(s.prestige / 200, 0, 1) : 0,
  };
}

export interface SimResult {
  pm: PendingMatch;
  rules: MatchRules;
  away: TeamSetup;
  home: TeamSetup;
  /** 本校是主队（后攻）还是客队 */
  mySide: 0 | 1;
  events: PlayEvent[];
  summary: MatchSummary;
  match: Match;
}

export function tourOf(pm: PendingMatch): Tour | null {
  return pm.tour ? G.tours[pm.tour] ?? null : null;
}

/** 模拟待打的比赛（不写入任何东西；同一个种子总是同样的结果） */
export function simulatePending(pm: PendingMatch): SimResult {
  const t = tourOf(pm);
  const rules = rulesFor(t, pm.round);
  const opp = schoolById(pm.oppId)!;
  return withSeed(pm.seed, () => {
    const mine = mySetup(rules);
    const theirs = oppSetup(opp, rules, G.day);
    const away = pm.home ? theirs : mine;
    const home = pm.home ? mine : theirs;
    const m = new Match(away, home, rules);
    const events: PlayEvent[] = [...m.prepare(), ...m.toEnd()];
    return { pm, rules, away, home, mySide: pm.home ? 1 : 0, events, summary: m.summary(), match: m };
  });
}

const posLabel = (m: Match, side: 0 | 1, pid: number): string => {
  const pos = m.T[side].posOf(pid);
  return pos === null ? '' : pos === 'DH' ? '指' : POS_ABBR[pos as Pos].slice(0, 1);
};

/** 把比赛结果写回：球员成绩、疲劳、干劲、经验；大会；比赛记录；名声 */
export function applyResult(res: SimResult): GameRecord {
  const { pm, summary: sum, match: m, mySide, rules } = res;
  G.nextStarter = null;
  const t = tourOf(pm);
  const opp = schoolById(pm.oppId)!;
  const win = sum.winner === mySide;
  const myScore = sum.score[mySide];
  const oppScore = sum.score[1 - mySide];
  const T = m.T[mySide];
  // 球员
  for (const pid of T.appeared) {
    const p = G.players[pid];
    if (!p) continue;
    const box = sum.bat[mySide].find((b) => b.pid === pid);
    const bl = emptyBat();
    if (box) {
      bl.pa = box.pa; bl.ab = box.ab; bl.h = box.h; bl.d = box.d; bl.t = box.t; bl.hr = box.hr; bl.rbi = box.rbi; bl.r = box.r;
      bl.bb = box.bb; bl.hbp = box.hbp; bl.so = box.so; bl.sb = box.sb; bl.cs = box.cs; bl.sac = box.sac; bl.sf = box.sf; bl.e = box.e;
    }
    bl.g = 1;
    const pl = emptyPit();
    const pbox = sum.pit[mySide].find((b) => b.pid === pid);
    if (pbox) {
      pl.g = 1;
      pl.gs = pbox.start ? 1 : 0;
      pl.outs = pbox.outs; pl.h = pbox.h; pl.r = pbox.r; pl.er = pbox.er; pl.bb = pbox.bb; pl.so = pbox.so; pl.hr = pbox.hr; pl.np = pbox.np; pl.bf = pbox.bf;
      if (sum.wp === pid) pl.w = 1;
      if (sum.lp === pid) pl.l = 1;
      if (pbox.start && T.pitchers.length === 1) {
        pl.cg = 1;
        if (pbox.r === 0) pl.sho = 1;
      }
      p.pw[6] += pbox.np;
      p.pitchesWeek += pbox.np;
      p.fatigue = clamp(p.fatigue + pbox.np * (has(p, 'stamina2') ? 0.26 : 0.32), 0, 100);
    } else p.fatigue = clamp(p.fatigue + 5, 0, 100);
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
    // 实战经验
    const ex = rules.official ? (rules.bigGame ? 7 : 5) : 3.5;
    addExp(p, isPitcher(p) ? { brk: ex * 0.4, men: ex * 0.4, str: ex * 0.2 } : { tech: ex * 0.45, men: ex * 0.35, agi: ex * 0.2 });
    // 干劲与调子
    let dm = win ? 3 : -2;
    if (sum.mvp === pid) dm += 5;
    if (bl.hr) dm += 2;
    if (pbox && pbox.er >= 5) dm -= 3;
    if (p.pers === 'hot') dm *= 1.6;
    if (p.pers === 'calm') dm *= 0.6;
    p.morale = clamp(p.morale + dm, 0, 100);
    if (sum.mvp === pid && chance(0.4)) p.cond = Math.min(2, p.cond + 1);
    if (rules.koshien) p.pop = clamp(p.pop + (bl.hr ? 6 : 0) + (sum.mvp === pid ? 5 : 0) + 1, 0, 100);
    else if (rules.bigGame && sum.mvp === pid) p.pop = clamp(p.pop + 2, 0, 100);
    // 个人纪录
    if (bl.hr >= 2) note(p, `${pm.label}：一场 ${bl.hr} 支本垒打`);
    if (pbox && pbox.start && T.pitchers.length === 1 && pbox.h === 0 && pl.outs >= 27) {
      const perfect = pbox.bb === 0 && sum.errors[mySide] === 0 && pbox.bf === 27;
      note(p, `${pm.label}：${perfect ? '完全比赛' : '无安打无失分'}`);
      log(`${fullName(p)} 投出了${perfect ? '完全比赛' : '无安打比赛'}！`, 'gold');
      milestone(`${fullName(p)} 在${pm.label}投出${perfect ? '完全比赛' : '无安打比赛'}`);
      G.flags[perfect ? 'perfect' : 'nohit'] = (G.flags[perfect ? 'perfect' : 'nohit'] ?? 0) + 1;
    }
    if (pbox && pbox.so >= 15) note(p, `${pm.label}：${pbox.so} 次三振`);
  }
  // 没上场的人也跟着累一点、开心或难过一点
  for (const p of myPlayers()) {
    if (T.appeared.has(p.id)) continue;
    p.morale = clamp(p.morale + (win ? 1 : -1) - (p.pers === 'proud' && p.grade >= 2 && overall(p) > 50 ? 1.5 : 0), 0, 100);
  }

  // 大会
  if (t) {
    const bm = t.rounds[pm.round][pm.idx];
    const meIsA = bm.a === G.schoolId;
    const note2 = sum.called ? '提前结束' : sum.innings > 9 ? `延长 ${sum.innings} 局` : undefined;
    recordResult(t, pm.round, pm.idx, meIsA ? myScore : oppScore, meIsA ? oppScore : myScore, sum.innings, note2);
  }
  if (rules.official) {
    G.seasonWL[win ? 0 : 1]++;
    G.mgr.totals[win ? 'w' : 'l']++;
    if (opp.id in G.schools) opp.rival = clamp(opp.rival + (rules.bigGame ? 6 : 3), 0, 100);
  }
  const rec = makeRecord(res, opp, win, myScore, oppScore);
  G.games.unshift(rec);
  if (G.games.length > 40) G.games.length = 40;

  // 动态
  const score = `${myScore} - ${oppScore}`;
  const how = sum.called ? '（提前结束）' : sum.innings > 9 ? `（延长 ${sum.innings} 局）` : '';
  const mvp = rec.mvp ? `，MVP：${rec.mvp}` : '';
  log(`${pm.label}：${win ? '胜' : '负'} ${opp.short} ${score}${how}${mvp}`, win ? 'good' : 'bad');
  // 球迷与名声
  if (rules.official) {
    const big = rules.koshien ? 3 : rules.bigGame ? 2 : 1;
    G.club.fans = Math.max(0, Math.round(G.club.fans + (win ? 60 : 10) * big * (1 + G.mgr.rep / 50)));
    G.mgr.exp += win ? 4 * big : 1.5;
    if (win) addRep(rules.koshien ? 1 : 0.3);
  } else if (win) {
    G.mgr.exp += 1;
  }
  return rec;
}

function makeRecord(res: SimResult, opp: SchoolLite, win: boolean, my: number, oppScore: number): GameRecord {
  const { summary: sum, match: m, mySide, pm } = res;
  const os = (1 - mySide) as 0 | 1;
  const nameOf = (side: 0 | 1, pid: number) => {
    const p = m.T[side].get(pid);
    return p ? fullName(p) : '?';
  };
  const bat = sum.bat[mySide].map((b) => ({
    name: nameOf(mySide, b.pid),
    pos: posLabel(m, mySide, b.pid),
    pa: b.pa, ab: b.ab, h: b.h, hr: b.hr, rbi: b.rbi, r: b.r, bb: b.bb, so: b.so, sb: b.sb, d: b.d, t: b.t,
    seq: b.seq,
  }));
  const pit = (side: 0 | 1) =>
    sum.pit[side].map((p) => ({
      name: nameOf(side, p.pid),
      outs: p.outs, h: p.h, r: p.r, er: p.er, bb: p.bb, so: p.so, np: p.np, hr: p.hr,
      dec: sum.wp === p.pid ? ('W' as const) : sum.lp === p.pid ? ('L' as const) : undefined,
    }));
  let mvp: string | null = null;
  if (sum.mvp !== null) {
    const side = m.T[0].roster.has(sum.mvp) ? 0 : 1;
    mvp = side === mySide ? nameOf(side, sum.mvp) : `${opp.short} ${nameOf(side, sum.mvp)}`;
  }
  return {
    id: G.nextId++,
    d: G.day,
    label: pm.label,
    tour: pm.tour,
    oppId: opp.id,
    oppName: opp.name,
    home: pm.home,
    my,
    opp: oppScore,
    inn: sum.innings,
    called: sum.called,
    win,
    line: [sum.line[mySide], sum.line[os]],
    hits: [sum.hits[mySide], sum.hits[os]],
    errors: [sum.errors[mySide], sum.errors[os]],
    bat,
    pit: pit(mySide),
    oppPit: pit(os),
    mvp,
    highlights: sum.highlights.slice(0, 8),
  };
}

/** 比赛的标签，比如「夏季神奈川大会 第3轮」 */
export function matchLabel(kind: TourKind | null, t: Tour | null, r: number): string {
  if (!kind || !t) return '练习赛';
  return `${t.name} ${t.roundNames[r]}`;
}

export function yearOf(day: number): number {
  return yearIdx(day);
}
