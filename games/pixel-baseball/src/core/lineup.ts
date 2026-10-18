// 自定义阵容：打线（每一棒的人和守位）与先发投手顺位。
// 每场比赛前按当天能上场的人检查：有人受伤、停赛或已经引退时自动补位，并说明谁代替了谁。
import type { LineupPlan, Player, Pos, Slot } from './types';
import { FIELD_POS, POS_NAME } from './types';
import { G, myPlayers } from './state';
import { available } from './player';
import { autoBench, autoLineup, pickStarter } from './team';
import { batterOffense, fieldAt, fullName, isPitcher, pitcherOverall } from './attrs';

export type { LineupPlan, Slot };

/** 当天实际的阵容 */
export interface TodayLineup {
  order: number[];
  defense: Partial<Record<Pos, number>>;
  starter: number | null;
  /** 自动补位的说明 */
  notes: string[];
}

/** 用自动排阵生成一份阵容 */
export function autoPlan(players: Player[] = myPlayers().filter(available)): LineupPlan {
  const lu = autoLineup(players, G.dh);
  const posOf = new Map<number, Pos>();
  for (const [pos, id] of Object.entries(lu.defense)) if (id !== undefined && pos !== 'P') posOf.set(id, pos as Pos);
  const bat: Slot[] = lu.order.map((pid) => ({ pid, pos: pid === lu.defense.P ? 'P' : posOf.get(pid) ?? 'DH' }));
  const rotation = players
    .filter(isPitcher)
    .sort((a, b) => pitcherOverall(b) - pitcherOverall(a))
    .slice(0, 3)
    .map((p) => p.id);
  return { bat, rotation, practice: false };
}

/** 阵容里的问题（编辑阵容时提示用）：空着的守位、重复的人 */
export function planProblems(plan: LineupPlan, dh: boolean): string[] {
  const out: string[] = [];
  const need: (Pos | 'DH')[] = [...FIELD_POS, dh ? 'DH' : 'P'];
  for (const pos of need) {
    const n = plan.bat.filter((s) => s.pos === pos).length;
    if (n === 0) out.push(`没有人守${pos === 'DH' ? '指定打击' : POS_NAME[pos as Pos]}`);
    else if (n > 1) out.push(`${pos === 'DH' ? '指定打击' : POS_NAME[pos as Pos]}排了 ${n} 个人`);
  }
  const ids = plan.bat.filter((s) => s.pos !== 'P').map((s) => s.pid);
  if (new Set(ids).size !== ids.length) out.push('同一个人排了两棒');
  if (plan.bat.length !== 9) out.push('打线不是 9 个人');
  return out;
}

/** 今天的先发投手：手动指定的优先，否则按先发顺位 / 起用方针 */
export function todayStarter(players: Player[], limit: number, forced: number | null = null): Player | null {
  if (forced !== null) {
    const p = players.find((x) => x.id === forced);
    if (p) return p;
  }
  const pol = G.policies.pitcherUse;
  const freshW = pol === 'ace' ? 0.35 : pol === 'rotation' ? 2.2 : 1.1;
  return pickStarter(players, G.lineup?.rotation ?? [], limit, freshW);
}

/** 按当天能上场的人，把阵容落实成比赛用的打线与守备（缺人自动补位） */
export function todayLineup(players: Player[], dh: boolean, starter: Player | null, plan: LineupPlan | null, bias: (p: Player) => number = () => 0): TodayLineup {
  const auto = (): TodayLineup => {
    const lu = autoLineup(players, dh, starter, bias);
    return { order: lu.order, defense: lu.defense, starter: lu.defense.P ?? null, notes: [] };
  };
  if (!plan || plan.bat.length !== 9) return auto();
  const byId = new Map(players.map((p) => [p.id, p]));
  const notes: string[] = [];
  const used = new Set<number>();
  if (starter) used.add(starter.id);
  const slots: Slot[] = plan.bat.map((s) => ({ ...s }));
  // DH 规则和阵容不一致时：P ↔ DH
  for (const s of slots) {
    if (dh && s.pos === 'P') s.pos = 'DH';
    if (!dh && s.pos === 'DH') s.pos = 'P';
  }
  // 先确定能上场的人
  const keep: boolean[] = slots.map((s) => {
    if (s.pos === 'P') return true;
    const p = byId.get(s.pid);
    if (!p || used.has(s.pid)) return false;
    used.add(s.pid);
    return true;
  });
  // 补位
  slots.forEach((s, i) => {
    if (keep[i] || s.pos === 'P') return;
    const old = G.players[s.pid];
    let best: Player | null = null;
    let bv = -Infinity;
    for (const p of players) {
      if (used.has(p.id)) continue;
      const v = (s.pos === 'DH' ? batterOffense(p) : fieldAt(p, s.pos as Pos)) - (isPitcher(p) ? 12 : 0) + bias(p);
      if (v > bv) {
        bv = v;
        best = p;
      }
    }
    if (!best) return;
    used.add(best.id);
    const why = !old ? '' : old.injury ? '受伤' : old.benched > 0 ? '停赛' : old.retired ? '已经引退' : starter && old.id === starter.id ? '今天先发投球' : '不能上场';
    notes.push(`${old ? fullName(old) : '空缺'}${why ? `（${why}）` : ''}→ 由${fullName(best)}${s.pos === 'DH' ? '担任指定打击' : `守${POS_NAME[s.pos as Pos]}`}`);
    s.pid = best.id;
  });
  const defense: Partial<Record<Pos, number>> = {};
  const order: number[] = [];
  for (const s of slots) {
    const pid = s.pos === 'P' ? starter?.id ?? -1 : s.pid;
    order.push(pid);
    if (s.pos !== 'DH') defense[s.pos as Pos] = pid;
  }
  if (starter) defense.P = starter.id;
  // 校验：每个守位一个人、打线 9 个不同的人
  const ok = FIELD_POS.every((pos) => defense[pos] !== undefined && defense[pos]! >= 0) && defense.P !== undefined && new Set(order).size === 9 && order.every((id) => id >= 0);
  if (!ok) {
    const a = auto();
    a.notes.unshift('阵容不完整，今天按自动排阵');
    return a;
  }
  return { order, defense, starter: starter?.id ?? null, notes };
}

/** 登录名单（20 人）：阵容里的人一定在里面 */
export function benchFor(avail: Player[], must: number[], dh: boolean, size = 20): Player[] {
  if (avail.length <= size) return avail;
  const set = new Set(must.filter((id) => avail.some((p) => p.id === id)));
  const rest = avail.filter((p) => !set.has(p.id));
  for (const id of autoBench(rest, size - set.size, dh)) set.add(id);
  return avail.filter((p) => set.has(p.id));
}

/** 阵容里已经不在队上的人清理掉（毕业、引退之后） */
export function cleanPlan(): void {
  const plan = G.lineup;
  if (!plan) return;
  plan.rotation = plan.rotation.filter((id) => G.players[id] && G.roster.includes(id) && !G.players[id].retired);
}
