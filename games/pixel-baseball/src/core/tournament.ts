// 大会（单败淘汰）
import type { BracketMatch, SchoolLite, Tour, TourKind } from './types';
import { G } from './state';
import { shuffle } from './rng';
import { quickGame } from '../sim/quick';
import { schoolStrength } from './world';
import { yearIdx } from './calendar';

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
  if (teamsLeft === 16) return '十六强战';
  return `第${r + 1}轮`;
}

export interface TourOpts {
  seeds?: number[];
  mercy: boolean;
  koshien: boolean;
  ext?: SchoolLite[];
}

/** 建一个大会。roundDays：每一轮的比赛日（绝对日），轮数不够时最后几轮挤在最后一天之后 */
export function makeTour(kind: TourKind, name: string, teams: number[], firstDay: number, gaps: number[], o: TourOpts): Tour {
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
    for (let i = 0; i < cnt; i++) ms.push({ a: r === 0 ? slots[2 * i] : null, b: r === 0 ? slots[2 * i + 1] : null, w: null, sa: 0, sb: 0, inn: 0, done: false });
    rounds.push(ms);
  }
  const roundDays: number[] = [];
  let d = firstDay;
  for (let r = 0; r < nRounds; r++) {
    roundDays.push(d);
    d += gaps[Math.min(r, gaps.length - 1)];
  }
  const ext: Record<number, SchoolLite> = {};
  for (const s of o.ext ?? []) ext[s.id] = s;
  const t: Tour = {
    kind,
    name,
    year: yearIdx(firstDay),
    teams: teams.slice(),
    rounds,
    roundDays,
    roundNames: rounds.map((ms, r) => roundNameFor(ms.length * 2, r)),
    mercy: o.mercy,
    koshien: o.koshien,
    done: false,
    champion: null,
    runnerUp: null,
    myFinish: teams.includes(G.schoolId) ? '参赛中' : null,
    myRank: teams.includes(G.schoolId) ? 0 : -1,
    ext,
  };
  // 第一轮轮空直接晋级
  rounds[0].forEach((m, i) => {
    if (m.a === null || m.b === null) {
      m.done = true;
      m.w = m.a ?? m.b;
      m.note = '轮空';
      if (rounds.length > 1) placeWinner(t, 0, i);
    }
  });
  return t;
}

function placeWinner(t: Tour, r: number, i: number): void {
  const w = t.rounds[r][i].w;
  if (r + 1 >= t.rounds.length) return;
  const nm = t.rounds[r + 1][Math.floor(i / 2)];
  if (i % 2 === 0) nm.a = w;
  else nm.b = w;
  // 下一轮的对手是轮空（另一侧整个分区都没人）
  const sib = t.rounds[r][i % 2 === 0 ? i + 1 : i - 1];
  if (sib && sib.done && sib.w === null && w !== null) {
    nm.done = true;
    nm.w = w;
    nm.note = '轮空';
    placeWinner(t, r + 1, Math.floor(i / 2));
  }
}

export const isFinalRound = (t: Tour, r: number) => r === t.rounds.length - 1;

function loseLabel(t: Tour, r: number, team: number): string {
  const R = t.rounds.length;
  if (r === R - 1) return '亚军';
  if (r === R - 2) return '四强';
  if (r === R - 3) return '八强';
  if (r === R - 4 && R >= 5) return '十六强';
  let first = true;
  for (let k = 0; k < r; k++) for (const m of t.rounds[k]) if ((m.a === team || m.b === team) && m.note !== '轮空') first = false;
  return first ? '初战败退' : `${t.roundNames[r]}败退`;
}

/** 记录一场比赛（sa 是 match.a 的得分） */
export function recordResult(t: Tour, r: number, i: number, sa: number, sb: number, inn: number, note?: string): void {
  const m = t.rounds[r][i];
  m.sa = sa;
  m.sb = sb;
  m.inn = inn;
  m.done = true;
  m.w = sa > sb ? m.a : m.b;
  if (note) m.note = note;
  const loser = sa > sb ? m.b : m.a;
  if (loser === G.schoolId) {
    t.myFinish = loseLabel(t, r, loser);
    t.myRank = r + 1;
  }
  if (isFinalRound(t, r)) {
    t.done = true;
    t.champion = m.w;
    t.runnerUp = loser;
    if (m.w === G.schoolId) {
      t.myFinish = '冠军';
      t.myRank = t.rounds.length + 1;
    }
  } else placeWinner(t, r, i);
}

/** 本校在这一轮的比赛（还没打的） */
export function myMatch(t: Tour, r: number): { idx: number; oppId: number; home: boolean } | null {
  const me = G.schoolId;
  const i = t.rounds[r].findIndex((m) => !m.done && (m.a === me || m.b === me) && m.a !== null && m.b !== null);
  if (i < 0) return null;
  const m = t.rounds[r][i];
  return { idx: i, oppId: m.a === me ? m.b! : m.a!, home: m.b === me };
}

/** 打完这一轮里 AI 之间的比赛 */
export function playAIRound(t: Tour, r: number, day: number, find: (id: number) => SchoolLite | null): void {
  const me = G.schoolId;
  t.rounds[r].forEach((m, i) => {
    if (m.done) return;
    if (m.a === null || m.b === null) {
      if (m.a === null && m.b === null) {
        m.done = true;
        return;
      }
      m.done = true;
      m.w = m.a ?? m.b;
      m.note = '轮空';
      placeWinner(t, r, i);
      return;
    }
    if (m.a === me || m.b === me) return;
    const A = find(m.a);
    const B = find(m.b);
    if (!A || !B) {
      recordResult(t, r, i, 1, 0, 9);
      return;
    }
    const q = quickGame(schoolStrength(A, day), schoolStrength(B, day), t.mercy && !isFinalRound(t, r));
    recordResult(t, r, i, q.sa, q.sb, q.inn, q.called ? '提前结束' : undefined);
  });
}

export function alive(t: Tour, sid: number): boolean {
  if (!t.teams.includes(sid)) return false;
  if (t.done) return t.champion === sid;
  for (const rnd of t.rounds) for (const m of rnd) if (m.done && m.w !== null && (m.a === sid || m.b === sid) && m.w !== sid) return false;
  return true;
}

/** 大会里第 r 轮还没打完 */
export function roundPending(t: Tour, r: number): boolean {
  return t.rounds[r].some((m) => !m.done);
}

/** 名次：冠军 1、亚军 2、四强 3、八强 5…（用于选拔名额判定） */
export function finishOrder(t: Tour): number[] {
  const out: number[] = [];
  if (t.champion !== null) out.push(t.champion);
  if (t.runnerUp !== null) out.push(t.runnerUp);
  for (let r = t.rounds.length - 2; r >= 0; r--) {
    for (const m of t.rounds[r]) {
      if (!m.done || m.w === null || m.note === '轮空') continue;
      const loser = m.w === m.a ? m.b : m.a;
      if (loser !== null && !out.includes(loser)) out.push(loser);
    }
  }
  return out;
}
