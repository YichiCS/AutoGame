// 以打席为单位的打算：AI 参考这场比赛之前的打席（上一个打席怎么被打、怎么被解决、对方今天的配球）调整策略；
// 教练（替玩家出主意、托管时代为指挥）用同样的思路，但只依据玩家看得到的情报，而且不消耗比赛的随机数。
import type { Match, TeamState } from './match';
import { famOf } from './match';
import type { BatCmd, OffTactic, PAMemo, PAResult, PitchPlan, PitchSpot, Zone } from './types';
import type { PitchType, Player } from '../core/types';
import { batterOffense, has, pitchable, pitcherOverall } from '../core/attrs';
import { chance, hash32 } from '../core/rng';
import { PITCH_DEFS } from '../data/pitches';

export const ZONE_NAME: Record<Zone, string> = { in: '内角', out: '外角', high: '高球', low: '低球' };
export const FAM_NAME = { FB: '直球', BR: '变化球' } as const;
export const RES_NAME: Record<PAResult, string> = {
  K: '三振', BB: '四坏球', IBB: '敬远', HBP: '触身球', '1B': '安打', '2B': '二垒打', '3B': '三垒打', HR: '本垒打',
  OUT: '出局', DP: '双杀', SAC: '牺牲触击', SF: '牺牲飞球', E: '对方失误上垒', FC: '野选',
};

export function pitchName(t: PitchType | 'FB'): string {
  return t === 'FB' ? '直球' : PITCH_DEFS[t].name;
}

export const isHit = (r: PAResult): boolean => r === '1B' || r === '2B' || r === '3B' || r === 'HR';

/** 这个打者本场上一个打席（作为进攻方 side） */
export function lastPA(m: Match, bat: number, side: 0 | 1): PAMemo | null {
  for (let i = m.memo.length - 1; i >= 0; i--) {
    const x = m.memo[i];
    if (x.bat === bat && x.side === side) return x;
  }
  return null;
}

/** 某一方本场打直球 / 变化球的安打数 */
export function famHits(m: Match, side: 0 | 1): { fb: number; br: number; n: number } {
  let fb = 0;
  let br = 0;
  let n = 0;
  for (const x of m.memo) {
    if (x.side !== side) continue;
    n++;
    if (x.last && isHit(x.res)) {
      if (x.last.fam === 'FB') fb++;
      else br++;
    }
  }
  return { fb, br, n };
}

const spotZone = (s: PitchSpot): Zone | null => (s.hz !== 'mid' ? s.hz : s.vz !== 'mid' ? s.vz : null);
const opposite: Record<Zone, Zone> = { in: 'out', out: 'in', high: 'low', low: 'high' };

/** 投手最会三振人的球种 */
export function bestFinisher(p: Player): PitchType | 'FB' {
  let best: PitchType | 'FB' = 'FB';
  let bv = p.a.velocity >= 145 ? 30 + (p.a.velocity - 145) * 2 : 0;
  for (const ps of p.pitches) {
    const v = ps.lv * 8 * PITCH_DEFS[ps.type].whiff + (ps.sig ? 12 : 0);
    if (v > bv) {
      bv = v;
      best = ps.type;
    }
  }
  return best;
}

// ========================= AI：守方 =========================
export function aiDefense(m: Match, t: TeamState): void {
  const b = m.batter();
  const p = m.pitcher();
  const offSide = m.half;
  const read = 0.35 + t.s.mgrTactics / 160; // 越会读比赛，调整越果断
  const plan: PitchPlan = { mix: 'auto', finisher: null, focus: 'auto', approach: t.def.approach, align: t.def.align, ibb: t.def.ibb, hold: false, pitchout: false };
  const why: string[] = [];
  const prev = lastPA(m, b.id, offSide);
  if (prev?.last) {
    const L = prev.last;
    const z = spotZone(L.spot);
    if (isHit(prev.res)) {
      if (chance(0.4 + 0.45 * read)) {
        plan.mix = L.fam === 'FB' ? 'BR' : 'FB';
        why.push(`上个打席的${FAM_NAME[L.fam]}被打成${RES_NAME[prev.res]}，这次想多投${FAM_NAME[plan.mix]}`);
      }
      if (z && chance(0.3 + 0.4 * read)) {
        plan.focus = opposite[z];
        why.push(`${ZONE_NAME[z]}被打了，改攻${ZONE_NAME[plan.focus]}`);
      }
      if (prev.res === 'HR' && plan.approach === 'normal' && chance(0.55)) {
        plan.approach = 'careful';
        why.push('被他打过全垒打，这次投得很谨慎');
      }
    } else if (prev.res === 'K' && chance(0.45 + 0.4 * read)) {
      plan.finisher = L.t;
      why.push(`上个打席用${pitchName(L.t)}三振了他，还想用它决胜`);
      if (z && chance(0.45)) plan.focus = z;
    } else if ((prev.res === 'BB' || prev.res === 'HBP') && plan.approach === 'normal' && chance(0.5)) {
      plan.approach = 'contact';
      why.push('上个打席保送了他，这次要抢好球数');
    } else if ((prev.res === 'OUT' || prev.res === 'DP') && chance(0.3 + 0.35 * read)) {
      plan.mix = L.fam;
      if (z) plan.focus = z;
      why.push(`上个打席用${z ? ZONE_NAME[z] + '的' : ''}${FAM_NAME[L.fam]}解决了他，想如法炮制`);
    }
  } else {
    // 第一次对决：看打者的类型
    if (b.a.power >= 68 && chance(0.55)) {
      plan.focus = chance(0.5) ? 'low' : 'out';
      why.push(`长打型打者，攻${ZONE_NAME[plan.focus]}`);
    } else if (b.a.contact >= 68 && b.a.power < 50 && chance(0.45)) {
      plan.mix = 'FB';
      plan.focus = 'in';
      why.push('巧打型打者，用直球塞内角');
    } else if (b.a.eye < 40 && chance(0.5)) {
      plan.mix = 'BR';
      why.push('选球眼差，用变化球引诱他出棒');
    }
  }
  // 全队层面：对方打线今天是直球还是变化球打得好
  const tl = famHits(m, offSide);
  if (plan.mix === 'auto' && tl.n >= 5) {
    if (tl.fb >= tl.br + 2 && chance(0.3 + 0.4 * read)) {
      plan.mix = 'BR';
      why.push(`对方打线今天已经打出 ${tl.fb} 支直球安打`);
    } else if (tl.br >= tl.fb + 2 && chance(0.3 + 0.4 * read)) {
      plan.mix = 'FB';
      why.push(`对方打线今天变化球打得好（${tl.br} 支安打）`);
    }
  }
  // 投手累了：少投耗体力的变化球，靠直球抢好球数
  const f = t.fatigueRatio(p.id);
  if (f > 0.85 && plan.mix === 'auto' && chance(0.4)) {
    plan.mix = 'FB';
    why.push('投手累了，多用直球抢好球数');
  }
  // 快腿跑者在一垒：注意跑者
  const r1 = m.bases[0];
  if (r1 && !m.bases[1]) {
    const rp = m.off.get(r1.pid);
    if (rp.a.speed + (has(rp, 'steal') ? 10 : 0) >= 65 && chance(0.35 + 0.35 * read)) {
      plan.hold = true;
      why.push(`一垒跑者${rp.fam}脚程快，注意盗垒`);
    }
  }
  if (plan.ibb) why.unshift('申告敬远');
  t.plan = plan;
  t.def.approach = plan.approach;
  t.hold = plan.hold;
  t.intent = { why };
}

// ========================= AI：攻方 =========================
const TAC_APP: Partial<Record<OffTactic, BatCmd['app']>> = { bunt: 'bunt', buntHit: 'buntHit', squeeze: 'squeeze', swing: 'normal', auto: 'normal' };
const APP_TAC: Record<BatCmd['app'], OffTactic> = {
  normal: 'swing', power: 'power', contact: 'contact', aggressive: 'aggressive', wait: 'wait', bunt: 'bunt', buntHit: 'buntHit', squeeze: 'squeeze',
};

export function aiOffense(m: Match, t: TeamState): void {
  const b = m.batter();
  const p = m.pitcher();
  const read = 0.35 + t.s.mgrTactics / 160;
  const cmd: BatCmd = { app: TAC_APP[t.tactic] ?? 'normal', sit: 'none', zone: 'none', run: 'none', agg: 0 };
  const why: string[] = [];
  if (cmd.app === 'bunt') why.push('准备牺牲触击');
  else if (cmd.app === 'squeeze') why.push('可能要抢分触击');
  else if (cmd.app === 'buntHit') why.push('想用触击偷一个安打');
  const prev = lastPA(m, b.id, t.side);
  if (prev?.last && cmd.app === 'normal') {
    const L = prev.last;
    const z = spotZone(L.spot);
    if (prev.res === 'K' && chance(0.4 + 0.4 * read)) {
      if (chance(0.6)) {
        cmd.sit = L.fam;
        why.push(`上个打席被${pitchName(L.t)}三振，这次在等${FAM_NAME[L.fam]}`);
      } else {
        cmd.app = 'contact';
        why.push(`上个打席被三振，这次缩短挥棒、专心碰球`);
      }
      if (z && chance(0.3)) cmd.zone = z;
    } else if (isHit(prev.res) && chance(0.35 + 0.3 * read)) {
      cmd.sit = L.fam;
      why.push(`上个打席打中了${FAM_NAME[L.fam]}，还在等它`);
    } else if ((prev.res === 'OUT' || prev.res === 'DP') && z && chance(0.3 + 0.3 * read)) {
      cmd.zone = z;
      why.push(`上个打席${ZONE_NAME[z]}的球没打好，这次专等${ZONE_NAME[z]}`);
    } else if (prev.res === 'BB' && chance(0.3)) {
      cmd.app = 'wait';
      why.push('上个打席选到了保送，继续耐心等球');
    }
  }
  // 读投手今天的配球
  const u = m.useOf(p.id);
  if (cmd.app === 'normal' || cmd.app === 'contact' || cmd.app === 'wait') {
    if (cmd.sit === 'none' && u.n >= 15) {
      const fbr = u.fb / u.n;
      if (fbr > 0.62 && chance(0.25 + 0.45 * read)) {
        cmd.sit = 'FB';
        why.push(`对方投手今天 ${Math.round(fbr * 100)}% 是直球，在等直球`);
      } else if (fbr < 0.45 && chance(0.25 + 0.45 * read)) {
        cmd.sit = 'BR';
        why.push(`对方投手今天变化球占 ${Math.round((1 - fbr) * 100)}%，在等变化球`);
      }
    }
    if (cmd.zone === 'none' && u.n >= 15) {
      const tops: [Zone, number][] = [['out', u.out / u.n], ['in', u.in / u.n], ['low', u.low / u.n], ['high', u.high / u.n]];
      tops.sort((a, b2) => b2[1] - a[1]);
      if (tops[0][1] > 0.42 && chance(0.2 + 0.4 * read)) {
        cmd.zone = tops[0][0];
        why.push(`对方投手爱攻${ZONE_NAME[tops[0][0]]}（${Math.round(tops[0][1] * 100)}%）`);
      }
    }
    // 两好球后的决胜球被看穿
    if (u.twoN >= 6) {
      let best = '';
      let bn = 0;
      for (const [k, n] of Object.entries(u.two)) if (n > bn) [best, bn] = [k, n];
      if (best && bn / u.twoN >= 0.5 && chance(0.3 + 0.5 * read)) {
        t.sit2 = best as PitchType | 'FB';
        why.push(`看穿了对方两好球后爱用${pitchName(best as PitchType | 'FB')}`);
      }
    }
    // 打法：看局面和打者类型
    if (cmd.app === 'normal') {
      const diff = m.scoreDiffFor(t.side);
      if (b.a.power >= 65 && (m.risp() || (m.inning >= 7 && diff < 0)) && chance(0.35)) {
        cmd.app = 'power';
        why.push('长打者，大棒一挥');
      } else if (b.a.contact >= 58 && b.a.power < 45 && chance(0.3)) cmd.app = 'contact';
      else if (u.n >= 25 && m.dfn.fatigueRatio(p.id) > 0.9 && chance(0.4)) {
        cmd.app = 'wait';
        why.push('对方投手累了，多等几球');
      } else if (m.balls === 0 && has(b, 'firstPitch') && chance(0.5)) cmd.app = 'aggressive';
    }
  }
  // 跑垒积极度
  const st = t.s.style;
  cmd.agg = st === 'speed' || st === 'smallball' ? 1 : st === 'power' ? 0 : m.inning >= 8 && m.scoreDiffFor(t.side) < 0 ? 1 : 0;
  if (cmd.agg > 0 && m.bases.some(Boolean)) why.push('跑垒很积极');
  t.cmd = cmd;
  if (!(t.tactic === 'bunt' || t.tactic === 'buntHit' || t.tactic === 'squeeze')) t.tactic = APP_TAC[cmd.app];
  t.guess = cmd.sit === 'none' ? null : cmd.sit;
  t.zoneGuess = cmd.zone === 'none' ? null : cmd.zone;
  t.runAgg = cmd.agg;
  t.intent = { why };
}

// ========================= 情报：玩家能看到多少 =========================
/** 看穿对方意图的概率：监督的慧眼与影像分析室决定 */
export function readChance(insight: number, analysis: number): number {
  return Math.min(0.95, 0.4 + insight / 200 + analysis * 0.06);
}

/** 这个打席能不能看穿对方（同一个打席结果固定，读档后不变） */
export function scouted(seed: number, paNo: number, chanceRead: number): boolean {
  return hash32(seed, paNo, 991) % 1000 < chanceRead * 1000;
}

// ========================= 教练：替玩家出主意 =========================
export interface Advice<T> {
  cmd: T;
  why: string[];
}

/** 进攻方的建议。seen：看穿的对方配球计划（看不穿就是 null） */
export function coachBat(m: Match, t: TeamState, seen: PitchPlan | null): Advice<BatCmd> {
  const b = m.batter();
  const p = m.pitcher();
  const [r1, r2, r3] = m.bases.map(Boolean);
  const outs = m.outs;
  const diff = m.scoreDiffFor(t.side);
  const late = m.inning >= 7;
  const bOff = batterOffense(b);
  const cmd: BatCmd = { app: 'normal', sit: 'none', zone: 'none', run: 'none', agg: 0 };
  const why: string[] = [];
  // 小球战术
  if (r3 && outs === 1 && late && Math.abs(diff) <= 1 && bOff < 55 && b.a.bunt >= 50) {
    cmd.app = 'squeeze';
    why.push('一出局三垒有人，比分接近：抢分触击');
  } else if (outs === 0 && (r1 || r2) && !r3 && Math.abs(diff) <= 2 && (bOff < 48 || (late && Math.abs(diff) <= 1 && bOff < 58)) && b.a.bunt >= 40) {
    cmd.app = 'bunt';
    why.push('无人出局有跑者：牺牲触击把跑者送上得点圈');
  } else if (m.inning >= m.rules.tiebreakFrom && outs === 0 && r1 && r2 && b.a.bunt >= 35) {
    cmd.app = 'bunt';
    why.push('抢分决胜：先触击推进');
  }
  if (cmd.app === 'normal') {
    if (seen) {
      if (seen.mix !== 'auto') {
        cmd.sit = seen.mix;
        why.push(`看穿对方想多投${FAM_NAME[seen.mix]}：狙${FAM_NAME[seen.mix]}`);
      }
      if (seen.focus !== 'auto') {
        cmd.zone = seen.focus;
        why.push(`对方要攻${ZONE_NAME[seen.focus]}：狙${ZONE_NAME[seen.focus]}`);
      }
      if (seen.approach === 'careful') {
        cmd.app = 'wait';
        why.push('对方投得很谨慎：多等几球');
      }
    }
    if (cmd.app === 'normal') {
      if (b.a.power >= 65 && (m.risp() || (late && diff < 0))) {
        cmd.app = 'power';
        why.push('长打者在关键时刻：强振');
      } else if (b.a.contact >= 55 && b.a.power < 45) {
        cmd.app = 'contact';
        why.push('巧打型：轻打，先求上垒');
      } else if (m.T[1 - t.side].fatigueRatio(p.id) > 0.9) {
        cmd.app = 'wait';
        why.push('对方投手累了：多等几球');
      }
    }
  }
  // 跑垒
  if (r1 && !r2 && outs < 2 && cmd.app !== 'bunt' && cmd.app !== 'squeeze') {
    const rp = t.get(m.bases[0]!.pid);
    const cat = m.T[1 - t.side].fielder('C');
    const spd = rp.a.speed + (has(rp, 'steal') ? 10 : 0);
    if (spd >= 70 && cat.a.arm <= 65 && !(seen?.hold)) {
      cmd.run = 'steal';
      why.push(`${rp.fam}脚程快、对方捕手肩力一般：盗二垒`);
    } else if (b.a.contact >= 60 && outs < 2 && spd >= 50 && Math.abs(diff) <= 2 && cmd.app === 'contact') {
      cmd.run = 'hitRun';
      why.push('打者擅长碰球：打带跑');
    }
  }
  cmd.agg = t.s.style === 'speed' || t.s.style === 'smallball' || (late && diff < 0) ? 1 : 0;
  if (!why.length) why.push('没有特别的指示，正常打击');
  return { cmd, why };
}

/** 守方的建议。seen：看穿的对方打者打算（看不穿就是 null） */
export function coachPitch(m: Match, t: TeamState, seen: BatCmd | null): Advice<PitchPlan> {
  const b = m.batter();
  const p = m.pitcher();
  const next = m.onDeck(1);
  const diff = m.scoreDiffFor(t.side);
  const late = m.inning >= 7;
  const bOff = batterOffense(b);
  const plan: PitchPlan = { mix: 'auto', finisher: bestFinisher(p), focus: 'auto', approach: 'normal', align: 'normal', ibb: false, hold: false, pitchout: false };
  const why: string[] = [];
  // 敬远：一垒空着、得点圈有人、后半段比分接近、这棒明显比下一棒强
  if (!m.bases[0] && (m.bases[1] || m.bases[2]) && m.inning >= 6 && Math.abs(diff) <= 2 && bOff >= batterOffense(next) + 15 && bOff >= 60) {
    plan.ibb = true;
    why.push(`${b.fam}比下一棒强得多、一垒空着：敬远`);
  }
  if (seen) {
    if (seen.sit !== 'none') {
      plan.mix = seen.sit === 'FB' ? 'BR' : 'FB';
      why.push(`看穿对方在等${FAM_NAME[seen.sit]}：反其道多投${FAM_NAME[plan.mix]}`);
    }
    if (seen.zone !== 'none') {
      plan.focus = opposite[seen.zone];
      why.push(`对方专等${ZONE_NAME[seen.zone]}：改攻${ZONE_NAME[plan.focus]}`);
    }
    if (seen.app === 'bunt' || seen.app === 'squeeze') {
      plan.align = 'buntShift';
      why.push('对方要触击：防触击守备');
    }
  }
  if (plan.focus === 'auto') {
    if (b.a.power >= 65) {
      plan.focus = 'low';
      why.push('长打者：投低球，打成滚地');
    } else if (b.a.eye < 40) {
      plan.mix = plan.mix === 'auto' ? 'BR' : plan.mix;
      why.push('选球眼差：用变化球引诱');
    }
  }
  if (bOff < 42 && !m.risp()) {
    plan.approach = 'contact';
    why.push('打者不强：放心抢好球数');
  } else if (late && Math.abs(diff) <= 2 && m.risp()) {
    plan.approach = 'max';
    why.push('关键时刻：全力投球');
  } else if (bOff >= 68 && m.risp() && !plan.ibb) {
    plan.approach = 'careful';
    why.push('强打者、得点圈有人：投得谨慎些');
  }
  // 守备阵型
  if (plan.align === 'normal') {
    if (m.bases[2] && m.outs < 2 && m.inning >= 6 && Math.abs(diff) <= 1) {
      plan.align = 'infieldIn';
      why.push('三垒有人、一分必争：内野前进守备');
    } else if (m.bases[0] && m.outs < 2) plan.align = 'dp';
    else if (late && diff >= 1 && diff <= 3) plan.align = 'noDoubles';
  }
  // 跑者
  if (m.bases[0] && !m.bases[1]) {
    const rp = m.off.get(m.bases[0].pid);
    if (rp.a.speed + (has(rp, 'steal') ? 10 : 0) >= 68) {
      plan.hold = true;
      why.push(`一垒的${rp.fam}脚程快：注意跑者`);
    }
  }
  if (plan.finisher && plan.finisher !== 'FB') why.push(`决胜球：${pitchName(plan.finisher)}`);
  return { cmd: plan, why };
}

/** 教练要不要换投（托管时用） */
export function coachWantsChange(m: Match, t: TeamState): number | null {
  const p = t.get(t.pitcher);
  const f = t.fatigueRatio(p.id);
  const box = t.pbox(p.id);
  const close = Math.abs(m.scoreDiffFor(t.side)) <= 3;
  const relId = bestReliever(m, t);
  if (relId === null) return null;
  const rel = t.get(relId);
  const relOv = pitcherOverall(rel) * (1 - rel.fatigue / 150);
  const curOv = pitcherOverall(p) * (1 - Math.max(0, f - 0.6));
  if (m.weeklyPitches(t, p.id) >= m.rules.pitchLimit - 5) return relId;
  if (f >= 1.05) return relId;
  if (f >= 0.85 && (m.risp() || t.halfRuns >= 2) && relOv > curOv - 12) return relId;
  if (t.halfRuns >= 4 && relOv > curOv - 18) return relId;
  if (close && box.np > 110 && relOv > curOv - 8) return relId;
  return null;
}

function bestReliever(m: Match, t: TeamState): number | null {
  let best: Player | null = null;
  let bv = -Infinity;
  for (const p of t.bench()) {
    const canP = pitchable(p);
    if (!canP) continue;
    const left = m.rules.pitchLimit - m.weeklyPitches(t, p.id);
    if (left <= 10) continue;
    const v = pitcherOverall(p) * (1 - p.fatigue / 120) * (left >= 60 ? 1 : 0.4);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  return best ? best.id : null;
}

/** 这一球在玩家眼里的描述（逐球记录用） */
export function pitchLabel(t: PitchType | 'FB', sig?: string): string {
  return sig ?? pitchName(t);
}

export { famOf };
