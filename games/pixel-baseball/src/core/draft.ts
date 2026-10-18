// 职业选秀与毕业
import type { AlumniEntry, Player } from './types';
import { POS_NAME } from './types';
import { G, mySchool, addRep } from './state';
import { chance, gauss, pick, randInt } from './rng';
import { clamp } from './util';
import { fullName, isPitcher, overall, velScore } from './attrs';
import { PRO_TEAMS, FAMILY_NAMES, GIVEN_NAMES } from '../data/names';
import { addMgrExp, unlock } from './career';

export interface DraftPick {
  round: number;
  team: string;
  name: string;
  school: string;
  pos: string;
  mine: boolean;
  pid?: number;
  ikusei: boolean;
}

function draftValue(p: Player): number {
  let v = overall(p) + p.pot * 0.15 + p.pop * 0.08;
  if (isPitcher(p)) v += Math.max(0, velScore(p.a.velocity) - 70) * 0.25;
  v += Math.min(10, p.stats.koshien.bat.hr * 2 + p.stats.koshien.pit.w * 2);
  return v + gauss(0, 3);
}

export function runDraft(): { picks: DraftPick[]; mine: DraftPick[]; lines: string[] } {
  const me = G.club.schoolId;
  const cands: { p: Player | null; v: number; name: string; school: string; pos: string }[] = [];
  for (const s of Object.values(G.schools)) {
    if (s.roster) {
      for (const id of s.roster) {
        const p = G.players[id];
        if (!p || p.grade !== 3) continue;
        const ov = overall(p);
        const submit = (p.wish === 'pro' && ov >= 56) || ov >= 65;
        if (!submit) continue;
        cands.push({ p, v: draftValue(p), name: fullName(p), school: s.name, pos: POS_NAME[p.pos] });
      }
    } else if (s.strength >= 54) {
      // 未具象化的强校：虚拟候选
      const n = s.strength >= 66 ? randInt(1, 2) : chance(0.4) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const v = s.strength + 6 + gauss(0, 6);
        cands.push({ p: null, v, name: `${pick(FAMILY_NAMES)} ${pick(GIVEN_NAMES)}`, school: s.name, pos: chance(0.45) ? '投手' : pick(['游击手', '中外野手', '捕手', '三垒手', '右外野手']) });
      }
    }
  }
  cands.sort((a, b) => b.v - a.v);
  const nHS = randInt(24, 30);
  const picks: DraftPick[] = [];
  const teams = [...PRO_TEAMS];
  cands.slice(0, nHS + 6).forEach((c, k) => {
    const ikusei = k >= nHS;
    if (c.v < (ikusei ? 65 : 70)) return;
    const round = ikusei ? 0 : Math.min(7, 1 + Math.floor(k / 5));
    const team = teams[(k * 5 + randInt(0, 11)) % 12];
    const mine = !!c.p && c.p.schoolId === me;
    picks.push({ round, team, name: c.name, school: c.school, pos: c.pos, mine, pid: c.p?.id, ikusei });
    if (c.p) {
      c.p.proTeam = team;
      c.p.draftRound = round;
      c.p.path = `${team} ${ikusei ? '育成' : `第${round}轮`}`;
    }
  });
  const mine = picks.filter((p) => p.mine);
  const lines: string[] = [];
  for (const d of mine) {
    lines.push(`🎉 ${d.name} 被 ${d.team} ${d.ikusei ? '以育成选秀' : `第 ${d.round} 轮`}指名！`);
    addRep(d.round === 1 ? 4 : d.ikusei ? 0.5 : 2);
    G.manager.totals.drafted++;
    mySchool().prestige = clamp(mySchool().prestige + (d.round === 1 ? 2 : 0.8), 0, 99);
    G.club.fans += d.round === 1 ? 3000 : 800;
    addMgrExp(40);
    const a = unlock('first_pro');
    if (a) lines.push(a);
    if (G.manager.totals.drafted >= 10) {
      const b = unlock('ten_pros');
      if (b) lines.push(b);
    }
  }
  return { picks, mine, lines };
}

/** 毕业：三年级离队，本校毕业生写入 OB 名鉴 */
export function graduate(): string[] {
  const lines: string[] = [];
  const me = G.club.schoolId;
  for (const s of Object.values(G.schools)) {
    if (!s.roster) continue;
    const keep: number[] = [];
    for (const id of s.roster) {
      const p = G.players[id];
      if (!p) continue;
      if (p.grade !== 3) {
        keep.push(id);
        continue;
      }
      if (s.id === me) {
        const path = p.path ?? (p.wish === 'pro' || overall(p) >= 55 ? (chance(0.7) ? '大学' : '社会人') : p.wish === 'univ' ? '大学' : p.wish === 'corp' ? '社会人' : '就业');
        const bat = p.stats.career.bat;
        const pit = p.stats.career.pit;
        const summary = isPitcher(p)
          ? `通算 ${pit.w}胜${pit.l}败 防御率 ${pit.outs ? ((pit.er * 27) / pit.outs).toFixed(2) : '-'} 三振 ${pit.so}`
          : `通算 ${bat.ab ? (bat.h / bat.ab).toFixed(3).replace(/^0/, '') : '-'} ${bat.hr}本垒打 ${bat.rbi}打点`;
        const entry: AlumniEntry = {
          pid: p.id,
          name: fullName(p),
          pos: p.pos,
          schoolName: s.name,
          gradYear: G.year + 1,
          path,
          pro: !!p.proTeam,
          proTeam: p.proTeam,
          round: p.draftRound,
          proStatus: p.proTeam ? '二军' : undefined,
          proYears: 0,
          summary,
        };
        G.records.alumni.push(entry);
      }
      delete G.players[id];
    }
    s.roster = keep;
  }
  const n = G.records.alumni.filter((a) => a.gradYear === G.year + 1).length;
  if (n) lines.push(`${n} 名三年级生毕业了。他们的名字将被记录在 OB 名鉴中。`);
  if (G.club.captainId && !G.players[G.club.captainId]) G.club.captainId = null;
  return lines;
}

/** 每年一次：职业 OB 的发展 */
export function progressPros(): string[] {
  const lines: string[] = [];
  for (const a of G.records.alumni) {
    if (!a.pro || a.proStatus === '退役') continue;
    a.proYears = (a.proYears ?? 0) + 1;
    const r = a.round ?? 6;
    const talent = (8 - Math.min(7, r || 7)) / 7;
    if (a.proStatus === '二军' && chance(0.18 + talent * 0.3)) {
      a.proStatus = '一军';
      lines.push(`OB ${a.name}（${a.proTeam}）升上一军！`);
    } else if (a.proStatus === '一军' && chance(0.15 + talent * 0.25)) {
      a.proStatus = '一军主力';
      lines.push(`OB ${a.name}在${a.proTeam}站稳了主力位置！`);
    } else if (a.proStatus === '一军主力' && chance(0.05 + talent * 0.06)) {
      a.proStatus = '明星球员';
      lines.push(`OB ${a.name}入选了职业棒球全明星赛！母校与有荣焉。`);
      addRep(2);
    }
    if ((a.proYears ?? 0) > 3 && a.proStatus === '二军' && chance(0.35)) {
      a.proStatus = '退役';
      lines.push(`OB ${a.name}结束了职业生涯。`);
    } else if ((a.proYears ?? 0) > 9 && chance(0.25)) {
      a.proStatus = '退役';
      lines.push(`OB ${a.name}宣布引退。`);
    }
  }
  return lines;
}
