// 手动指挥能多赢多少：node scripts/run-ts.mjs tests/manual.ts [场数] [打法,...]
// 一边由模拟的玩家一球一球地指挥（换投、守备阵型、敬远照教练的办法），另一边是 AI。
// 打法：coach = 全部交给教练；skilled = 会玩的玩家（看热区定挥棒范围、没把握就不挥；投冷区、配球有变化）；
//       casual = 随便玩的玩家（对准热区最热的格挥；往好球带里随便投）。
// 目标：完全相同的两队，会玩的玩家赢八成；战力低 10 的队，会玩的玩家赢五成五；交给教练还是五五开。
import { seedRng, randInt, hash32 } from '../src/core/rng';
import { generatePlayer } from '../src/core/player';
import { autoLineup, strengthOf } from '../src/core/team';
import { Match, type TeamState } from '../src/sim/match';
import type { Alignment, MatchRules, TeamSetup } from '../src/sim/types';
import type { PitchType, Player, Pos } from '../src/core/types';
import { GRID, arsenal, batSide, cellCenter, commitFit, hotAt, hotZones, inZone, makeRng, nearZone, rangeCenter, spreadOf, zoneCenter, type Rng } from '../src/sim/pitching';
import { VIEW_K, batterView, coachHunt, coachRun, coachThrow, strikeProb } from '../src/sim/brain';
import { SWING_K } from '../src/sim/pitching';
import { coachAlign, coachWantsChange, wantsIBB } from '../src/sim/ai';
import type { SwingCall, ThrowCall } from '../src/sim/match';

const N = Number(process.argv[2] ?? 200);
// 调参：K='{"cSit":0.1}' 覆盖挥棒模型的参数，V='{"err1":0.15}' 覆盖热区图的准确度
if (process.env.K) Object.assign(SWING_K, JSON.parse(process.env.K));
if (process.env.V) Object.assign(VIEW_K, JSON.parse(process.env.V));
const MODES = (process.argv[3] ?? 'coach,casual,skilled').split(',') as Mode[];
type Mode = 'ai' | 'coach' | 'skilled' | 'casual';

const rules: MatchRules = {
  innings: 9, mercy: false, dh: true, koshien: false, bigGame: false, official: true, tiebreakFrom: 10, maxInnings: 20,
  pitchLimit: 500, moundVisits: 3, fence: { line: 95, center: 118 }, stadium: 'test',
};
const ALIGN: Record<string, Alignment> = { close: 'close', normal: 'normal', deep: 'noDoubles' };

function makeTeam(q: number): Player[] {
  const ps: Player[] = [];
  const plan: Pos[] = ['P', 'P', 'P', 'P', 'P', 'C', 'C', '1B', '2B', '2B', '3B', 'SS', 'SS', 'LF', 'CF', 'CF', 'RF', 'RF', '3B', 'LF'];
  plan.forEach((pos, i) => {
    const grade = i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1;
    ps.push(generatePlayer({ quality: q + randInt(-6, 6), grade, pos, enrollYear: 2026 - grade + 1 }));
  });
  return ps;
}

/** 完全相同的另一队（编号错开，免得和这一队混在一起） */
function cloneTeam(a: Player[]): Player[] {
  return (JSON.parse(JSON.stringify(a)) as Player[]).map((p) => ({ ...p, id: p.id + 100000 }));
}

function setup(players: Player[], name: string, human: boolean): TeamSetup {
  for (const p of players) {
    p.fatigue = 0;
    p.pitchesWeek = 0;
  }
  const lu = autoLineup(players, rules.dh);
  return {
    schoolId: 0, name, short: name, colors: { primary: '#000', secondary: '#fff', cap: '#000', letter: name[0] },
    players, order: lu.order, defense: lu.defense, human, style: 'balanced', mgrTactics: 50, teamTactics: 50, chemistry: 50, crowd: 0,
  };
}

// ---------------- 打击 ----------------
function heatOf(m: Match, seed: number, step: number): number[] | null {
  return batterView(m, seed, step);
}

/** 会玩的玩家：每个挥棒范围的期望「合」，挑最大的；没把握（多半是坏球）就不挥 */
function skilledSwing(m: Match, seed: number, step: number): SwingCall {
  const heat = heatOf(m, seed, step);
  const con = m.batter().a.contact;
  if (!heat) return { z: 4, run: [false, false, false], commit: true, c: [4, 4] };
  let best = -1;
  let bc: [number, number] = [4, 4];
  let pStrike = 0;
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const [x, y] = cellCenter(i, j);
      if (inZone(x, y)) pStrike += heat[j * GRID + i];
    }
  for (let cj = 1; cj <= 7; cj++)
    for (let ci = 1; ci <= 7; ci++) {
      const [hx, hy] = rangeCenter([ci, cj]);
      let e = 0;
      for (let j = 0; j < GRID; j++)
        for (let i = 0; i < GRID; i++) {
          const v = heat[j * GRID + i];
          if (v < 1e-4) continue;
          const [x, y] = cellCenter(i, j);
          e += v * commitFit(x - hx, y - hy, con);
        }
      if (e > best) {
        best = e;
        bc = [ci, cj];
      }
    }
  const thr = m.strikes === 2 ? 0.3 : m.balls === 3 ? 0.6 : 0.45;
  if (best < thr && !(m.strikes === 2 && pStrike > 0.55)) return { z: -1, run: [false, false, false] };
  const [hx, hy] = rangeCenter(bc);
  return { z: nearZone(hx, hy), run: [false, false, false], commit: true, c: bc };
}

/** 随便玩的玩家：对准热区最热的那一格挥（3-0 才等一球） */
function casualSwing(m: Match, seed: number, step: number): SwingCall {
  if (m.balls === 3 && m.strikes === 0) return { z: -1, run: [false, false, false] };
  const heat = heatOf(m, seed, step);
  let bi = 5;
  let bj = 5;
  if (heat) {
    let top = -1;
    for (let j = 0; j < GRID; j++)
      for (let i = 0; i < GRID; i++)
        if (heat[j * GRID + i] > top) {
          top = heat[j * GRID + i];
          bi = i;
          bj = j;
        }
  }
  const c: [number, number] = [Math.max(1, Math.min(7, bi - 1)), Math.max(1, Math.min(7, bj - 1))];
  const [hx, hy] = rangeCenter(c);
  return { z: nearZone(hx, hy), run: [false, false, false], commit: true, c };
}

// ---------------- 投球 ----------------


/** 好球带里的目标：九宫格中心和它们之间 */
const INSIDE: [number, number][] = [];
for (const v of [-0.62, -0.31, 0, 0.31, 0.62]) for (const w of [-0.62, -0.31, 0, 0.31, 0.62]) INSIDE.push([v, w]);
/** 引诱球：刚出好球带的低角、外侧 */
const CHASE: [number, number][] = [[-1.12, -0.9], [1.12, -0.9], [0, -1.15], [-1.15, 0], [1.15, 0]];

/**
 * 会玩的玩家投球：主要往好球带里投（坏球多了更要投好球），挑打者冷的位置，避开热区；
 * 两好球、还没三坏球时引诱出好球带；球种在质量好的几种里轮换，同一个位置、同一个球种不连着用。
 */
function skilledThrow(m: Match, T: TeamState, r: Rng, last: { t: string; z: number }[]): ThrowCall {
  const p = m.pitcher();
  const b = m.batter();
  const now = m.pitcherNow();
  const hot = hotZones(b, batSide(b, p.throws));
  const ars = arsenal(p, now).sort((x, y) => y.q - x.q).slice(0, 3);
  const chase = m.strikes === 2 && m.balls < 3;
  const prev = last.slice(-2);
  let best: ThrowCall | null = null;
  let bv = -1e9;
  for (const o of ars) {
    for (const [x, y] of chase ? [...INSIDE, ...CHASE] : INSIDE) {
      const ba = hotAt(hot, x, y);
      let v = -ba * 4 + (o.q - 50) / 60;
      if (chase && !inZone(x, y)) v += 0.35;
      // 三坏球：往中间一点投，别保送
      if (m.balls === 3) v -= (Math.abs(x) + Math.abs(y)) * 0.4;
      const zn = nearZone(x, y);
      for (const l of prev) {
        if (l.t === o.type) v -= 0.12;
        if (l.z === zn) v -= 0.15;
      }
      v += r.gauss(0, 0.12);
      if (v > bv) {
        bv = v;
        best = { type: o.type as PitchType | 'FB', x, y };
      }
    }
  }
  return best!;
}

/** 随便玩的玩家投球：最好的两个球种里挑一个，往好球带里随便投 */
function casualThrow(m: Match, r: Rng): ThrowCall {
  const p = m.pitcher();
  const ars = arsenal(p, m.pitcherNow()).sort((a, c) => c.q - a.q);
  const o = ars[Math.floor(r.rand() * Math.min(2, ars.length))];
  return { type: o.type as PitchType | 'FB', x: (r.rand() - 0.5) * 1.6, y: (r.rand() - 0.5) * 1.6 };
}

// ---------------- 一场 ----------------
function play(A: Player[], B: Player[], humanSide: 0 | 1, mode: Mode, seed: number): { win: boolean; rf: number; ra: number } {
  // 玩家的队（A）放在 humanSide 那一边（先攻 / 后攻轮流）
  const sa = setup(A, 'A', mode !== 'ai');
  const sb = setup(B, 'B', false);
  const m = humanSide === 0 ? new Match(sa, sb, rules) : new Match(sb, sa, rules);
  if (mode === 'ai') m.toEnd();
  const T = m.T[humanSide];
  const r = makeRng(seed);
  const last: { t: string; z: number }[] = [];
  let step = 0;
  let guard = 0;
  while (!m.over && guard++ < 5000) {
    let g2 = 0;
    while (!m.over && (m.needHalf || m.needPA || !m.pitchReady) && g2++ < 10) m.prepare();
    if (m.over) break;
    const cr = makeRng(hash32(seed, step, 1));
    if (m.half === humanSide) {
      if (mode === 'coach') T.swingNext = { z: coachHunt(m, T, m.mind, m.mindSp, cr), run: coachRun(m, T, cr) };
      else T.swingNext = mode === 'skilled' ? skilledSwing(m, seed, step) : casualSwing(m, seed, step);
    } else {
      // 换投、阵型、敬远：照教练的办法
      if (m.balls === 0 && m.strikes === 0) {
        const rel = coachWantsChange(m, T);
        if (rel !== null) {
          m.changePitcher(T, rel);
          m.rePlanPA();
        }
        T.def.align = ALIGN[coachAlign(m, T)];
        if (wantsIBB(m, T) && cr.rand() < 0.5) {
          m.intentionalWalk();
          step++;
          continue;
        }
      }
      if (mode === 'coach') {
        const c = coachThrow(m, T, m.pitcherNow(), makeRng(hash32(seed, step, 2)));
        T.callNext = c;
        m.coachRead(c.mind);
      } else T.callNext = mode === 'skilled' ? skilledThrow(m, T, r, last) : casualThrow(m, r);
      const c = T.callNext!;
      last.push({ t: c.type, z: nearZone(c.x, c.y) });
      if (last.length > 4) last.shift();
    }
    m.step();
    step++;
  }
  const me = m.T[humanSide].runs;
  const op = m.T[(1 - humanSide) as 0 | 1].runs;
  return { win: m.winner === humanSide, rf: me, ra: op };
}

function run(label: string, qMe: number, qOp: number, same: boolean, mode: Mode): void {
  seedRng(777);
  let w = 0;
  let rf = 0;
  let ra = 0;
  let sMe = 0;
  let sOp = 0;
  for (let k = 0; k < N; k++) {
    const A = makeTeam(qMe);
    const B = same ? cloneTeam(A) : makeTeam(qOp);
    sMe += strengthOf(A).total;
    sOp += strengthOf(B).total;
    const res = play(A, B, (k % 2) as 0 | 1, mode, 9000 + k * 7919);
    if (res.win) w++;
    rf += res.rf;
    ra += res.ra;
  }
  console.log(`${label.padEnd(16)} ${mode.padEnd(8)} 战力 ${(sMe / N).toFixed(1)} 对 ${(sOp / N).toFixed(1)}  胜率 ${(w / N).toFixed(3)}  得分 ${(rf / N).toFixed(2)}  失分 ${(ra / N).toFixed(2)}`);
}

for (const mode of MODES) {
  run('完全相同', 50, 50, true, mode);
  run('低 10（q50 对 q60）', 50, 60, false, mode);
}
