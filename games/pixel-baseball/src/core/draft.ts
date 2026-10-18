// 选秀会议与毕业
import type { Alumni, Player } from './types';
import { POS_NAME } from './types';
import { G, log, milestone, mySchool, note, seniors } from './state';
import { chance, pick, randInt } from './rng';
import { clamp } from './util';
import { eraOf, fullName, isPitcher, overall, avgOf } from './attrs';
import { yearIdx } from './calendar';
import { PRO_TEAMS } from '../data/names';

export interface DraftPick {
  pid: number;
  name: string;
  team: string;
  round: number;
  ikusei: boolean;
}

/** 10 月：本校三年级（已引退）里有没有人被职业球队指名 */
export function runDraft(): { picks: DraftPick[]; passed: Player[] } {
  const picks: DraftPick[] = [];
  const passed: Player[] = [];
  const scoreOf = (p: Player): number => {
    const fame = p.pop + (isPitcher(p) ? Math.max(0, p.a.velocity - 140) * 3 : 0) + p.stats.koshien.bat.hr * 4 + p.stats.koshien.pit.w * 5;
    return overall(p) + fame * 0.12 + (p.traits.includes('monster') ? 15 : 0);
  };
  // 评价高的先看；同一所学校一年最多 4 人被指名
  const cands = seniors().filter((p) => p.wish === 'pro').sort((a, b) => scoreOf(b) - scoreOf(a));
  for (const p of cands) {
    const score = scoreOf(p);
    if (picks.length >= 4) {
      passed.push(p);
      continue;
    }
    let round = 0;
    let ikusei = false;
    if (score >= 82) round = 1;
    else if (score >= 76) round = randInt(1, 3);
    else if (score >= 70) round = randInt(2, 5);
    else if (score >= 64 && chance(0.6)) round = randInt(4, 7);
    else if (score >= 60 && chance(0.3)) {
      round = randInt(1, 4);
      ikusei = true;
    }
    if (!round) {
      passed.push(p);
      continue;
    }
    const team = pick(PRO_TEAMS);
    p.draft = { team, round: ikusei ? 0 : round };
    picks.push({ pid: p.id, name: fullName(p), team, round, ikusei });
    note(p, `选秀会议：${team} ${ikusei ? `育成第 ${round} 轮` : `第 ${round} 轮`}指名`);
    G.mgr.totals.drafted++;
    if (!ikusei && round === 1) G.flags.draft1 = (G.flags.draft1 ?? 0) + 1;
  }
  for (const d of picks) log(`选秀会议：${d.name} 被${d.team}${d.ikusei ? '育成' : ''}第 ${d.round} 轮指名！`, 'gold');
  if (picks.length) milestone(`选秀会议：${picks.map((d) => `${d.name}（${d.team}${d.ikusei ? '育成' : ''}第${d.round}轮）`).join('、')}`);
  return { picks, passed };
}

function careerSummary(p: Player): string {
  const s = p.stats.career;
  const parts: string[] = [POS_NAME[p.pos]];
  if (isPitcher(p)) {
    parts.push(`最速 ${Math.round(p.a.velocity)} km/h`);
    if (s.pit.outs) parts.push(`${s.pit.w} 胜 ${s.pit.l} 负 · 防御率 ${eraOf(s.pit).toFixed(2)}`);
    if (p.pitches.length) parts.push(p.pitches.map((x) => x.sig ?? '').filter(Boolean).join('') || `${p.pitches.length} 种变化球`);
  } else if (s.bat.ab) {
    parts.push(`打率 ${avgOf(s.bat).toFixed(3).replace(/^0/, '')} · ${s.bat.hr} 本垒打`);
  }
  const k = p.stats.koshien;
  if (k.bat.g || k.pit.g) parts.push(`甲子园 ${Math.max(k.bat.g, k.pit.g)} 场`);
  return parts.join(' · ');
}

/** 3 月 1 日：三年级毕业 */
export function graduate(): Alumni[] {
  const out: Alumni[] = [];
  const s = mySchool();
  const y = yearIdx(G.day);
  for (const p of G.roster.map((id) => G.players[id]).filter((x) => x && x.grade === 3)) {
    const ov = overall(p);
    let path: Alumni['path'];
    if (p.draft) path = 'pro';
    else if (p.wish === 'job') path = 'job';
    else if (p.wish === 'corp' || (ov >= 55 && chance(0.3))) path = 'corp';
    else path = p.academics > 40 || ov >= 50 ? 'univ' : chance(0.5) ? 'univ' : 'job';
    const a: Alumni = {
      id: p.id,
      name: fullName(p),
      pos: p.pos,
      gradYear: y,
      schoolName: s.name,
      path,
      proTeam: p.draft?.team,
      round: p.draft?.round,
      ovr: Math.round(ov),
      summary: careerSummary(p),
      face: p.face,
      proYears: 0,
    };
    if (path === 'pro') a.proStatus = p.draft?.round ? '新人' : '育成选手';
    out.push(a);
    G.alumni.unshift(a);
    G.roster = G.roster.filter((id) => id !== p.id);
    delete G.players[p.id];
  }
  if (G.alumni.length > 150) {
    // 职业球员的记录永远保留，其余只留最近的
    const pros = G.alumni.filter((a) => a.path === 'pro');
    const rest = G.alumni.filter((a) => a.path !== 'pro').slice(0, 150 - Math.min(100, pros.length));
    G.alumni = [...pros, ...rest].sort((a, b) => b.gradYear - a.gradYear);
  }
  if (out.length) log(`毕业典礼：${out.length} 名三年级毕业了`, 'info');
  return out;
}

/** 每年：已经是职业球员的 OB 们的近况 */
export function proYearly(): string[] {
  const news: string[] = [];
  for (const a of G.alumni) {
    if (a.path !== 'pro' || a.proStatus === '已退役') continue;
    a.proYears = (a.proYears ?? 0) + 1;
    // 职业生涯：选秀顺位越高、高中时越强，越可能出头（每个人的「天花板」由 id 决定，年年一样）
    const ceiling = a.ovr + (a.round ? 7 - a.round * 1.5 : -6) + ((a.id * 7919) % 13) - 6;
    const yrs = a.proYears;
    const peak = ceiling + Math.min(yrs, 5) * 1.5 - Math.max(0, yrs - 9) * 2;
    let st = a.proStatus ?? '新人';
    if (yrs >= 3 && peak < 64 && chance(0.3)) st = '已退役';
    else if (yrs >= 13 && chance(0.3)) st = '已退役';
    else if (peak >= 86 && yrs >= 3) st = chance(0.35) ? '日本代表' : '一军主力';
    else if (peak >= 78 && yrs >= 2) st = '一军主力';
    else if (peak >= 70 && yrs >= 2) st = '一军';
    else st = '二军';
    if (st !== a.proStatus) {
      if (st === '一军主力' || st === '日本代表') news.push(`${a.name}（${a.proTeam}）成为${st}！`);
      if (st === '已退役') news.push(`${a.name} 结束了 ${yrs} 年的职业生涯`);
      a.proStatus = st;
    }
  }
  return news;
}

export function proAlumni(): Alumni[] {
  return G.alumni.filter((a) => a.path === 'pro');
}

export const PATH_NAME: Record<Alumni['path'], string> = { pro: '职业', univ: '大学', corp: '社会人', job: '就业', left: '退部' };

export function clampPop(v: number): number {
  return clamp(v, 0, 100);
}
