// 阵容编排与队伍战力
import type { Player, Pos } from './types';
import { FIELD_POS } from './types';
import { batterOffense, batterOverall, fieldAt, isPitcher, pitchable, pitcherOverall } from './attrs';
import { avg, clamp } from './util';

export interface Lineup {
  order: number[];
  defense: Partial<Record<Pos, number>>;
  dh: number | null;
}

export interface Strength {
  off: number;
  def: number;
  pit: number;
  total: number;
}

/** 投手登板适合度（考虑疲劳与周投球数） */
export function starterScore(p: Player, limit = 500): number {
  const left = limit - p.pitchesWeek;
  if (left < 40) return -1;
  const fresh = clamp(1 - p.fatigue / 100, 0.1, 1) * clamp(left / 140, 0.2, 1);
  return pitcherOverall(p) * fresh;
}

/** 先发评分：freshW 越大越看重体力（轮换），越小越倾向于王牌 */
export function starterScoreW(p: Player, limit: number, freshW: number): number {
  const left = limit - p.pitchesWeek;
  if (left < 40) return -1;
  const fresh = clamp(1 - p.fatigue / 100, 0.1, 1) * clamp(left / 140, 0.2, 1);
  return pitcherOverall(p) * Math.pow(fresh, freshW);
}

export function pickStarter(players: Player[], rotation: number[] = [], limit = 500, freshW = 1): Player | null {
  const pitchers = players.filter(pitchable);
  if (!pitchers.length) return players.length ? players.reduce((a, b) => (pitcherOverall(a) > pitcherOverall(b) ? a : b)) : null;
  // 按轮换顺位：第一个状态可以的投手
  for (const id of rotation) {
    const p = pitchers.find((x) => x.id === id);
    if (p && p.fatigue < 55 && limit - p.pitchesWeek >= 100) return p;
  }
  let best: Player | null = null;
  let bv = -Infinity;
  for (const p of pitchers) {
    const v = starterScoreW(p, limit, freshW);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  return best;
}

const POS_ORDER: Pos[] = ['C', 'SS', '2B', 'CF', '3B', 'RF', 'LF', '1B'];

/** 自动编排守备与打线 */
/** bias：起用方针带来的加分（重视高年级 / 培养新人），只影响谁上场，不影响守备位置的判断 */
export function autoLineup(players: Player[], dh: boolean, starter?: Player | null, bias: (p: Player) => number = () => 0): Lineup {
  const sp = starter ?? pickStarter(players);
  const val = (p: Player, pos: Pos) => batterOverall(p, pos) - (isPitcher(p) ? 8 : 0) + bias(p);
  const pool = players.filter((p) => p.id !== sp?.id);
  // 野手不足时投手也可以守备（带惩罚）
  const fielders = pool;
  const assign = new Map<Pos, Player>();
  const used = new Set<number>();
  for (const pos of POS_ORDER) {
    let best: Player | null = null;
    let bv = -Infinity;
    for (const p of fielders) {
      if (used.has(p.id)) continue;
      const v = val(p, pos);
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (best) {
      assign.set(pos, best);
      used.add(best.id);
    }
  }
  // 交换优化
  for (let iter = 0; iter < 3; iter++) {
    let improved = false;
    const poss = [...assign.keys()];
    for (let i = 0; i < poss.length; i++) {
      for (let j = i + 1; j < poss.length; j++) {
        const a = assign.get(poss[i])!;
        const b = assign.get(poss[j])!;
        const cur = batterOverall(a, poss[i]) + batterOverall(b, poss[j]);
        const sw = batterOverall(a, poss[j]) + batterOverall(b, poss[i]);
        if (sw > cur + 0.5) {
          assign.set(poss[i], b);
          assign.set(poss[j], a);
          improved = true;
        }
      }
      // 用板凳替换
      const cur = assign.get(poss[i])!;
      for (const p of fielders) {
        if (used.has(p.id)) continue;
        if (val(p, poss[i]) > val(cur, poss[i]) + 0.5) {
          used.delete(cur.id);
          used.add(p.id);
          assign.set(poss[i], p);
          improved = true;
          break;
        }
      }
    }
    if (!improved) break;
  }
  const defense: Partial<Record<Pos, number>> = {};
  for (const [pos, p] of assign) defense[pos] = p.id;
  if (sp) defense.P = sp.id;
  const hitters = [...assign.values()];
  let dhId: number | null = null;
  if (dh) {
    let best: Player | null = null;
    for (const p of pool) {
      if (used.has(p.id)) continue;
      if (!best || batterOffense(p) + bias(p) > batterOffense(best) + bias(best)) best = p;
    }
    if (best) {
      hitters.push(best);
      dhId = best.id;
    }
  } else if (sp) hitters.push(sp);
  return { order: battingOrder(hitters, dh ? null : sp?.id ?? null), defense, dh: dhId };
}

export function battingOrder(hitters: Player[], pitcherId: number | null): number[] {
  const rest = hitters.slice();
  const take = (score: (p: Player) => number, exclude?: number): Player | null => {
    let best: Player | null = null;
    let bv = -Infinity;
    for (const p of rest) {
      if (p.id === exclude) continue;
      const v = score(p);
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (best) rest.splice(rest.indexOf(best), 1);
    return best;
  };
  const slots: (Player | null)[] = new Array(9).fill(null);
  slots[3] = take((p) => p.a.power * 0.6 + p.a.contact * 0.4, pitcherId ?? undefined);
  slots[2] = take((p) => p.a.contact * 0.6 + p.a.power * 0.3 + p.a.eye * 0.1, pitcherId ?? undefined);
  slots[0] = take((p) => p.a.speed * 0.4 + p.a.eye * 0.3 + p.a.contact * 0.3, pitcherId ?? undefined);
  slots[4] = take((p) => p.a.power * 0.5 + p.a.contact * 0.5, pitcherId ?? undefined);
  slots[1] = take((p) => p.a.bunt * 0.3 + p.a.contact * 0.4 + p.a.speed * 0.3, pitcherId ?? undefined);
  for (let i = 5; i < 9; i++) slots[i] = take((p) => (p.id === pitcherId ? -999 : batterOffense(p)));
  return slots.filter((p): p is Player => !!p).map((p) => p.id);
}

/** 选出登录名单（默认 20 人） */
export function autoBench(players: Player[], size = 20, dh = true): number[] {
  const avail = players.slice();
  if (avail.length <= size) return avail.map((p) => p.id);
  const chosen = new Set<number>();
  const lu = autoLineup(avail, dh);
  for (const id of lu.order) chosen.add(id);
  if (lu.defense.P) chosen.add(lu.defense.P);
  const pitchers = avail.filter((p) => isPitcher(p) && !chosen.has(p.id)).sort((a, b) => pitcherOverall(b) - pitcherOverall(a));
  for (const p of pitchers.slice(0, 4)) if (chosen.size < size) chosen.add(p.id);
  const catchers = avail.filter((p) => !chosen.has(p.id)).sort((a, b) => fieldAt(b, 'C') - fieldAt(a, 'C'));
  if (catchers.length && chosen.size < size) chosen.add(catchers[0].id);
  const rest = avail.filter((p) => !chosen.has(p.id)).sort((a, b) => benchValue(b) - benchValue(a));
  const byId = new Map(avail.map((p) => [p.id, p]));
  const pitcherCount = () => [...chosen].filter((id) => isPitcher(byId.get(id)!)).length;
  for (const p of rest) {
    if (chosen.size >= size) break;
    if (isPitcher(p) && pitcherCount() >= 7) continue;
    chosen.add(p.id);
  }
  // 野手不足时仍用投手补满
  for (const p of rest) {
    if (chosen.size >= size) break;
    chosen.add(p.id);
  }
  return [...chosen];
}

export function benchValue(p: Player): number {
  if (isPitcher(p)) return pitcherOverall(p) * 0.9;
  let bestField = 0;
  for (const pos of FIELD_POS) bestField = Math.max(bestField, fieldAt(p, pos));
  return Math.max(batterOffense(p), p.a.speed * 0.9, bestField * 0.85);
}

/** 队伍战力（0..100） */
export function strengthOf(players: Player[], dh = true): Strength {
  const ps = players.filter((p) => !p.injury && !p.retired);
  if (ps.length < 9) return { off: 20, def: 20, pit: 20, total: 20 };
  const pitchers = ps.filter((p) => isPitcher(p)).map(pitcherOverall).sort((a, b) => b - a);
  while (pitchers.length < 3) pitchers.push(20);
  const pit = pitchers[0] * 0.55 + pitchers[1] * 0.3 + pitchers[2] * 0.15;
  const lu = autoLineup(ps, dh);
  const byId = new Map(ps.map((p) => [p.id, p]));
  const hitters = lu.order.map((id) => byId.get(id)!).filter(Boolean);
  const off = avg(hitters.map(batterOffense));
  const defs: number[] = [];
  for (const [pos, id] of Object.entries(lu.defense)) {
    if (pos === 'P' || id === undefined) continue;
    defs.push(fieldAt(byId.get(id)!, pos as Pos));
  }
  const def = avg(defs);
  return { off, def, pit, total: 0.38 * off + 0.22 * def + 0.4 * pit };
}

export function strengthLetter(v: number): string {
  if (v >= 72) return 'S';
  if (v >= 64) return 'A';
  if (v >= 56) return 'B';
  if (v >= 48) return 'C';
  if (v >= 40) return 'D';
  if (v >= 32) return 'E';
  return 'F';
}
