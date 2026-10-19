// 比赛中的 AI 指挥
import type { Match, TeamState } from './match';
import type { OffTactic } from './types';
import type { Player, Pos } from '../core/types';
import { batterOffense, fieldAt, aptOf, has, isPitcher, pitchable, pitcherOverall } from '../core/attrs';
import { chance } from '../core/rng';

const STYLE = {
  balanced: { bunt: 1, steal: 1, squeeze: 1, hook: 1 },
  smallball: { bunt: 1.6, steal: 1.3, squeeze: 1.6, hook: 1 },
  power: { bunt: 0.45, steal: 0.6, squeeze: 0.4, hook: 1 },
  pitching: { bunt: 1.2, steal: 0.9, squeeze: 1.2, hook: 0.85 },
  speed: { bunt: 1.1, steal: 2.0, squeeze: 1.2, hook: 1 },
} as const;

function style(t: TeamState) {
  return STYLE[t.s.style] ?? STYLE.balanced;
}

const canPitch = pitchable;

export function pickReliever(m: Match, t: TeamState): number | null {
  let cands = t.bench().filter(canPitch);
  if (!cands.length) cands = t.bench();
  let best: Player | null = null;
  let bv = -Infinity;
  for (const p of cands) {
    const left = m.rules.pitchLimit - m.weeklyPitches(t, p.id);
    if (left <= 10) continue;
    const fresh = (1 - p.fatigue / 120) * (left >= 60 ? 1 : 0.4);
    const v = pitcherOverall(p) * fresh + (canPitch(p) ? 10 : 0);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  return best ? best.id : null;
}

export function bestBenchFor(m: Match, t: TeamState, pos: Pos): number | null {
  let best: Player | null = null;
  let bv = -Infinity;
  for (const p of t.bench()) {
    if (isPitcher(p) && aptOf(p, pos) < 50) continue;
    const v = fieldAt(p, pos);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  return best ? best.id : null;
}

function shouldReplace(m: Match, t: TeamState): boolean {
  const p = t.get(t.pitcher);
  const f = t.fatigueRatio(p.id);
  const box = t.pbox(p.id);
  const hook = style(t).hook * (t.s.hook ?? 1) * (0.9 + t.s.mgrTactics / 500);
  const diff = m.scoreDiffFor(t.side);
  if (m.weeklyPitches(t, p.id) >= m.rules.pitchLimit - 5) return true;
  const relId = pickReliever(m, t);
  if (relId === null) return false;
  const rel = t.get(relId);
  const relOv = pitcherOverall(rel) * (1 - rel.fatigue / 150);
  const curOv = pitcherOverall(p) * (1 - Math.max(0, f - 0.6));
  if (f >= 1.05 / hook) return true;
  if (f >= 0.85 / hook && (m.risp() || t.halfRuns >= 2) && relOv > curOv - 15) return true;
  if (t.halfRuns >= 4 && m.inning <= 7 && relOv > curOv - 20) return true;
  if (t.rattle > 0.75 && t.visits === 0 && m.risp() && relOv > curOv - 10) return true;
  if (diff >= 7 && f > 0.55 && box.np > 70 && relOv > 25) return true;
  return false;
}

export function betweenInnings(m: Match, t: TeamState): void {
  if (shouldReplace(m, t)) {
    const r = pickReliever(m, t);
    if (r !== null) m.changePitcher(t, r);
  }
}

export function defenseBeforePA(m: Match, t: TeamState): void {
  if (shouldReplace(m, t)) {
    const r = pickReliever(m, t);
    if (r !== null) m.changePitcher(t, r);
  }
  if (t.rattle > 0.55 && t.visits > 0 && (m.risp() || m.inning >= 7) && chance(0.6)) m.moundVisit(t);
  const b = m.batter();
  const next = m.onDeck(1);
  const diff = m.scoreDiffFor(t.side);
  const bOff = batterOffense(b);
  t.def.ibb = false;
  if (!m.bases[0] && (m.bases[1] || m.bases[2]) && m.inning >= 6 && Math.abs(diff) <= 2 && bOff >= batterOffense(next) + 15 && bOff >= 58) {
    t.def.ibb = chance(0.5);
  }
  defenseTactics(m, t);
}

/** 只决定守备阵型与投球方针（人类玩家可以把这部分交给 AI） */
export function defenseTactics(m: Match, t: TeamState): void {
  const b = m.batter();
  const diff = m.scoreDiffFor(t.side);
  const late = m.inning >= 7;
  const bOff = batterOffense(b);
  // 守备阵型
  if (m.bases[2] && m.outs < 2 && m.inning >= 6 && diff >= -1 && diff <= 1) t.def.align = 'infieldIn';
  else if (m.outs === 0 && (m.bases[0] || m.bases[1]) && !m.bases[2] && bOff < 50 && Math.abs(diff) <= 2 && chance(0.5)) t.def.align = 'buntShift';
  else if (m.bases[0] && m.outs < 2) t.def.align = 'dp';
  else if (late && diff >= 1 && diff <= 3) t.def.align = 'noDoubles';
  else t.def.align = 'normal';
  // 投球方针
  if (late && Math.abs(diff) <= 2 && m.risp()) t.def.approach = 'max';
  else if (diff >= 5) t.def.approach = 'contact';
  else if (bOff >= 68 && !m.bases[0] && (m.bases[1] || m.bases[2])) t.def.approach = 'careful';
  else t.def.approach = 'normal';
}

export function defenseBeforePitch(m: Match, t: TeamState): void {
  const offT = m.off.tactic;
  const read = t.s.mgrTactics / 100;
  if (m.balls >= 2) return;
  if (offT === 'squeeze' && m.bases[2] && chance(0.08 + read * 0.15)) t.def.pitchout = true;
  else if (offT === 'steal' && chance(0.04 + read * 0.08)) t.def.pitchout = true;
}

export function offenseBeforePA(m: Match, t: TeamState, tacticOnly: boolean): void {
  const diff = m.scoreDiffFor(t.side);
  const late = m.inning >= 7;
  if (!tacticOnly) {
    const b = m.batter();
    if (late && diff <= 0 && diff >= -4) {
      const bOff = batterOffense(b);
      const isP = t.posOf(b.id) === 'P';
      let best: Player | null = null;
      for (const p of t.bench()) {
        if (isPitcher(p) && batterOffense(p) < 50) continue;
        if (!best || batterOffense(p) > batterOffense(best)) best = p;
      }
      if (best && batterOffense(best) >= bOff + (isP ? 6 : 12)) m.pinchHit(t, t.batIdx, best.id);
    }
    if (late && Math.abs(diff) <= 1) {
      for (let i = 2; i >= 0; i--) {
        const r = m.bases[i];
        if (!r) continue;
        const rp = t.get(r.pid);
        if (rp.a.speed >= 45 || (i === 0 && diff > 0)) continue;
        let fast: Player | null = null;
        for (const p of t.bench()) {
          if (isPitcher(p) || p.a.speed < 65) continue;
          if (!fast || p.a.speed > fast.a.speed) fast = p;
        }
        if (fast) {
          m.pinchRun(t, i, fast.id);
          break;
        }
      }
    }
  }
  t.tactic = chooseTactic(m, t);
}

function chooseTactic(m: Match, t: TeamState): OffTactic {
  const b = m.batter();
  const diff = m.scoreDiffFor(t.side);
  const late = m.inning >= 7;
  const st = style(t);
  const bOff = batterOffense(b);
  const slot = t.batIdx;
  const topHitter = slot >= 2 && slot <= 4 && bOff >= 55;
  const [r1, r2, r3] = m.bases.map(Boolean);
  const outs = m.outs;
  if (r3 && outs === 1 && m.inning >= 5 && Math.abs(diff) <= 2 && bOff < 58 && !topHitter && chance(0.2 * st.squeeze)) return 'squeeze';
  if (outs === 0 && (r1 || r2) && !r3 && Math.abs(diff) <= 3) {
    let p = 0.38 * st.bunt;
    if (bOff < 45) p *= 1.4;
    else if (bOff > 62) p *= 0.35;
    if (topHitter) p *= 0.25;
    if (late && Math.abs(diff) <= 1) p *= 1.4;
    if (r2 && !r1) p *= 0.5;
    if (m.inning >= m.rules.tiebreakFrom) p = 0.7 * st.bunt;
    if (chance(Math.min(0.85, p))) return 'bunt';
  }
  if (!r2 && !r3 && b.a.speed >= 75 && b.a.bunt >= 50 && chance(0.05)) return 'buntHit';
  return 'swing';
}

export function offenseBeforePitch(m: Match, t: TeamState): void {
  // 这个打席有既定的狙球就照做；否则打者有利的球数时常常锁定直球
  if (t.cmd && t.cmd.sit !== 'none') t.guess = t.cmd.sit;
  else t.guess = m.balls >= 2 && m.balls > m.strikes && chance(0.4) ? 'FB' : null;
  if (t.tactic !== 'swing' && t.tactic !== 'auto') return;
  const st = style(t);
  const [r1, r2, r3] = m.bases.map(Boolean);
  const cat = m.dfn.fielder('C');
  const b = m.batter();
  if (r1 && !r2 && m.outs < 2) {
    const rp = t.get(m.bases[0]!.pid);
    const spd = rp.a.speed + (has(rp, 'steal') ? 10 : 0);
    if (spd >= 62 && cat.a.arm <= 72) {
      const p = 0.1 * st.steal * (m.balls > m.strikes ? 1.3 : 1) * ((spd - 55) / 20);
      if (chance(p)) {
        t.tactic = 'steal';
        return;
      }
    }
  }
  if (r2 && !r3 && !r1 && m.outs === 1) {
    const rp = t.get(m.bases[1]!.pid);
    if (rp.a.speed >= 75 && chance(0.03 * st.steal)) {
      t.tactic = 'steal';
      return;
    }
  }
  if (r1 && !r2 && m.outs < 2 && b.a.contact >= 55 && m.strikes <= 1 && (m.balls === 1 || m.balls === 2) && chance(0.07 * st.bunt)) {
    t.tactic = 'hitRun';
  }
}

/** 给人类玩家的战术建议（文字） */
export function suggest(m: Match, t: TeamState): string {
  const saved = t.tactic;
  const tac = chooseTactic(m, t);
  t.tactic = saved;
  const names: Record<OffTactic, string> = {
    auto: 'AI判断', swing: '自由打击', aggressive: '积极打击', wait: '待球', contact: '轻打', power: '强振',
    bunt: '牺牲触击', buntHit: '触击安打', squeeze: '抢分触击', hitRun: '打带跑', steal: '盗垒', doubleSteal: '双盗垒',
  };
  return names[tac];
}
