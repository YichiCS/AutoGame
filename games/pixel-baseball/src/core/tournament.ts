// 大会（单败淘汰）
import type { BracketMatch, School, TourKind, Tournament } from './types';
import { G } from './state';
import { chance, shuffle } from './rng';
import { spreadRounds } from './calendar';
import { quickGame } from '../sim/quick';
import { schoolStrength } from './world';
import { simulateAIMatch } from './matchday';

function nextPow2(n: number): number {
  let s = 1;
  while (s < n) s *= 2;
  return s;
}

function seedOrder(n: number): number[] {
  if (n === 1) return [1];
  const prev = seedOrder(n / 2);
  const out: number[] = [];
  for (const s of prev) out.push(s, n + 1 - s);
  return out;
}

export function roundNameFor(teamsLeft: number, r: number): string {
  if (teamsLeft === 2) return '决赛';
  if (teamsLeft === 4) return '半决赛';
  if (teamsLeft === 8) return '八强战';
  return `第${r + 1}轮`;
}

export interface TourOpts {
  seeds?: number[];
  pref?: number;
  region?: string;
  district?: number;
  mercy: boolean;
  koshien: boolean;
}

export function makeTournament(kind: TourKind, name: string, teams: number[], weeks: readonly number[], o: TourOpts): Tournament {
  const size = nextPow2(Math.max(2, teams.length));
  const seeds = (o.seeds ?? []).filter((id) => teams.includes(id));
  const others = shuffle(teams.filter((id) => !seeds.includes(id)));
  const ranked = [...seeds, ...others];
  const order = seedOrder(size);
  const slots: (number | null)[] = order.map((s) => ranked[s - 1] ?? null);
  const nRounds = Math.log2(size);
  const rounds: BracketMatch[][] = [];
  for (let r = 0; r < nRounds; r++) {
    const cnt = size / 2 ** (r + 1);
    const ms: BracketMatch[] = [];
    for (let i = 0; i < cnt; i++) {
      ms.push({ a: r === 0 ? slots[2 * i] : null, b: r === 0 ? slots[2 * i + 1] : null, winner: null, sa: 0, sb: 0, inn: 0, played: false });
    }
    rounds.push(ms);
  }
  const roundNames = rounds.map((ms, r) => roundNameFor(ms.length * 2, r));
  const t: Tournament = {
    id: `${G.year}-${kind}-${o.pref ?? o.region ?? 'all'}-${o.district ?? 0}`,
    kind,
    name,
    year: G.year,
    pref: o.pref ?? -1,
    region: o.region ?? '',
    district: o.district ?? -1,
    teams: teams.slice(),
    rounds,
    roundWeeks: spreadRounds(nRounds, weeks),
    roundNames,
    mercy: o.mercy,
    koshien: o.koshien,
    done: false,
    champion: null,
    runnerUp: null,
    finish: {},
    rank: {},
  };
  // 第一轮轮空直接晋级
  rounds[0].forEach((m, i) => {
    if (m.a === null || m.b === null) {
      m.played = true;
      m.winner = m.a ?? m.b;
      m.note = '轮空';
      if (rounds.length > 1) placeWinner(t, 0, i);
    }
  });
  return t;
}

function placeWinner(t: Tournament, r: number, i: number): void {
  const w = t.rounds[r][i].winner;
  if (r + 1 >= t.rounds.length) return;
  const nm = t.rounds[r + 1][Math.floor(i / 2)];
  if (i % 2 === 0) nm.a = w;
  else nm.b = w;
}

export function isFinalRound(t: Tournament, r: number): boolean {
  return r === t.rounds.length - 1;
}

/** 记录一场比赛的结果（a 为 match.a） */
export function recordResult(t: Tournament, r: number, i: number, sa: number, sb: number, inn: number, note?: string): void {
  const m = t.rounds[r][i];
  m.sa = sa;
  m.sb = sb;
  m.inn = inn;
  m.played = true;
  m.winner = sa > sb ? m.a : m.b;
  if (note) m.note = note;
  const loser = sa > sb ? m.b : m.a;
  if (loser !== null) {
    t.finish[loser] = loseLabel(t, r, loser);
    t.rank[loser] = r + 1;
  }
  if (isFinalRound(t, r)) {
    t.done = true;
    t.champion = m.winner;
    t.runnerUp = loser;
    if (m.winner !== null) {
      t.finish[m.winner] = '冠军';
      t.rank[m.winner] = t.rounds.length + 1;
    }
    if (loser !== null) t.finish[loser] = '亚军';
  } else placeWinner(t, r, i);
}

function loseLabel(t: Tournament, r: number, team: number): string {
  const R = t.rounds.length;
  if (r === R - 1) return '亚军';
  if (r === R - 2) return '四强';
  if (r === R - 3) return '八强';
  if (r === R - 4 && R >= 5) return '十六强';
  // 是否首战
  let first = true;
  for (let k = 0; k < r; k++) {
    for (const m of t.rounds[k]) if ((m.a === team || m.b === team) && m.note !== '轮空') first = false;
  }
  return first ? '初战败退' : `${t.roundNames[r]}败退`;
}

/** 打完某一轮中所有 AI 之间的比赛，返回玩家比赛的下标（若有） */
export function playRoundAI(t: Tournament, r: number): number | null {
  const me = G.club.schoolId;
  let pending: number | null = null;
  t.rounds[r].forEach((m, i) => {
    if (m.played) return;
    if (m.a === null && m.b === null) {
      m.played = true;
      return;
    }
    if (m.a === null || m.b === null) {
      m.played = true;
      m.winner = m.a ?? m.b;
      m.note = '轮空';
      placeWinner(t, r, i);
      return;
    }
    if (m.a === me || m.b === me) {
      pending = i;
      return;
    }
    const A = G.schools[m.a];
    const B = G.schools[m.b];
    const mercy = t.mercy && !isFinalRound(t, r);
    if (A.roster && B.roster) {
      const res = simulateAIMatch(A, B, t, r);
      recordResult(t, r, i, res.sa, res.sb, res.inn, res.called ? '提前结束' : undefined);
    } else {
      const q = quickGame(schoolStrength(A), schoolStrength(B), mercy);
      recordResult(t, r, i, q.sa, q.sb, q.inn, q.called ? '提前结束' : undefined);
    }
  });
  return pending;
}

/** 本周是否有该大会的比赛轮次 */
export function roundsThisWeek(t: Tournament, week: number): number[] {
  const out: number[] = [];
  t.roundWeeks.forEach((w, r) => {
    if (w === week && !t.done) out.push(r);
  });
  return out;
}

export function teamAlive(t: Tournament, sid: number): boolean {
  if (!t.teams.includes(sid)) return false;
  if (t.done) return t.champion === sid;
  return t.finish[sid] === undefined;
}

/** 快速模拟一个完整的淘汰赛（用于其他县/地区），返回名次表 */
export function quickBracket(teams: School[], mercy: boolean, seeds: number[] = []): { order: number[]; champion: number; runnerUp: number; semis: number[]; quarters: number[] } {
  let alive = [...seeds.filter((id) => teams.some((s) => s.id === id)), ...shuffle(teams.map((s) => s.id).filter((id) => !seeds.includes(id)))];
  const size = nextPow2(alive.length);
  const order = seedOrder(size);
  let slots: (number | null)[] = order.map((s) => alive[s - 1] ?? null);
  const elim: number[][] = [];
  while (slots.length > 1) {
    const next: (number | null)[] = [];
    const lost: number[] = [];
    for (let i = 0; i < slots.length; i += 2) {
      const a = slots[i];
      const b = slots[i + 1];
      if (a === null || b === null) {
        next.push(a ?? b);
        continue;
      }
      const q = quickGame(schoolStrength(G.schools[a]), schoolStrength(G.schools[b]), mercy && slots.length > 2);
      const w = q.sa > q.sb ? a : b;
      next.push(w);
      lost.push(w === a ? b : a);
    }
    elim.push(lost);
    slots = next;
  }
  const champion = slots[0]!;
  const runnerUp = elim[elim.length - 1]?.[0] ?? champion;
  const semis = elim[elim.length - 2] ?? [];
  const quarters = elim[elim.length - 3] ?? [];
  const orderOut = [champion, runnerUp, ...shuffle(semis.slice()), ...shuffle(quarters.slice())];
  alive = [];
  return { order: orderOut, champion, runnerUp, semis, quarters };
}

export function coin(): boolean {
  return chance(0.5);
}
