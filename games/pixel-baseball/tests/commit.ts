// 玩家「一定挥」的打击（挥棒范围 = 好球带 9×9 里的 3×3）校准：
//   node scripts/run-ts.mjs tests/commit.ts [场数]
// 我方打击分别交给：会看热区的玩家（挑期望最好的范围，没把握就不挥）、乱挥的玩家、教练（AI：看到球来到附近才挥）；
// 防守都交给教练。比较我方的打率、三振率、保送率、每场得分，和对方 AI 打者的数字。
import { prepareWorld, startGame } from '../src/core/newgame';
import { G } from '../src/core/state';
import { runDays } from '../src/core/sim';
import { LiveGame } from '../src/core/live';
import { hash32 } from '../src/core/rng';
import type { LiveAct, PendingMatch } from '../src/core/types';
import { GRID, SWING_K, cellCenter, commitFit, inZone, rangeCenter } from '../src/sim/pitching';
import { batterView } from '../src/sim/brain';

// 调参：K='{"cFitH":0.8}' 覆盖挥棒模型的参数
if (process.env.K) Object.assign(SWING_K, JSON.parse(process.env.K));

const N = Number(process.argv[2] ?? 60);
let s = 4242;
const r = (): number => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);

const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId: 13, difficulty: 'normal', dh: true, seed: 77 });
startGame(state, offers[1].id);
G.policies.auto = 'all';
runDays(12);
G.pending = null;
const opps = Object.values(G.schools).filter((x) => x.id !== G.schoolId);

type Style = 'smart' | 'peak' | 'random' | 'coach';

function zoneOf(x: number, y: number): number {
  const col = x < -1 / 3 ? 0 : x > 1 / 3 ? 2 : 1;
  const row = y > 1 / 3 ? 0 : y < -1 / 3 ? 2 : 1;
  return row * 3 + col;
}

/** 会看热区的玩家：每个挥棒范围的期望「合」，挑最大的；没把握（期望低、多半是坏球）就不挥 */
function smartSwing(g: LiveGame): LiveAct {
  const m = g.m;
  const con = m.batter().a.contact;
  const sp = m.mindSp;
  // 玩家看到的是打者眼里的热区图（选球眼越好越准）
  const heat = sp ? batterView(m, g.pm.seed, g.step) : null;
  if (!heat) return { k: 'swing', z: 4, run: [false, false, false], commit: true, c: [4, 4] };
  let best = -1;
  let bc: [number, number] = [4, 4];
  let pStrike = 0;
  for (let j = 0; j < GRID; j++)
    for (let i = 0; i < GRID; i++) {
      const [x, y] = cellCenter(i, j);
      if (inZone(x, y)) pStrike += heat[j * GRID + i];
    }
  for (let cj = -1; cj <= 9; cj++)
    for (let ci = -1; ci <= 9; ci++) {
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
  if (best < thr && !(m.strikes === 2 && pStrike > 0.55)) return { k: 'swing', z: -1, run: [false, false, false] };
  const [hx, hy] = rangeCenter(bc);
  return { k: 'swing', z: zoneOf(hx, hy), run: [false, false, false], commit: true, c: bc };
}

/** 一般玩家：对准热区图最热的那一格挥（3-0 才等一球） */
function peakSwing(g: LiveGame): LiveAct {
  const m = g.m;
  const sp = m.mindSp;
  // 玩家看到的是打者眼里的热区图（选球眼越好越准）
  const heat = sp ? batterView(m, g.pm.seed, g.step) : null;
  if (m.balls === 3 && m.strikes === 0) return { k: 'swing', z: -1, run: [false, false, false] };
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
  // 11×11 的格 → 好球带 9×9 的格（外圈算到最近的），中心夹在 1..7
  const c: [number, number] = [Math.max(1, Math.min(7, bi - 1)), Math.max(1, Math.min(7, bj - 1))];
  const [hx, hy] = rangeCenter(c);
  return { k: 'swing', z: zoneOf(hx, hy), run: [false, false, false], commit: true, c };
}

function randomSwing(): LiveAct {
  const c: [number, number] = [1 + Math.floor(r() * 7), 1 + Math.floor(r() * 7)];
  const [hx, hy] = rangeCenter(c);
  return { k: 'swing', z: zoneOf(hx, hy), run: [false, false, false], commit: true, c };
}

interface Tot {
  pa: number;
  ab: number;
  h: number;
  so: number;
  bb: number;
  hr: number;
  runs: number;
  sw: number;
  whiff: number;
  pitches: number;
}
const zero = (): Tot => ({ pa: 0, ab: 0, h: 0, so: 0, bb: 0, hr: 0, runs: 0, sw: 0, whiff: 0, pitches: 0 });

function play(style: Style): { me: Tot; opp: Tot; wins: number } {
  const me = zero();
  const opp = zero();
  let wins = 0;
  s = 4242;
  for (let k = 0; k < N; k++) {
    const pm: PendingMatch = { tour: null, round: 0, idx: 0, oppId: opps[k % opps.length].id, home: k % 2 === 0, seed: 5000 + k * 7919, label: '校准' };
    const g = new LiveGame(pm);
    let guard = 0;
    while (g.phase() !== 'over' && guard++ < 2000) {
      g.ready();
      if (g.phase() === 'bat' && style !== 'coach') g.act(style === 'smart' ? smartSwing(g) : style === 'peak' ? peakSwing(g) : randomSwing());
      else g.coachTurn();
      g.pitch();
    }
    for (const e of g.events) {
      if (e.k !== 'pitch' && !e.pitch) continue;
      const p = e.pitch;
      if (!p) continue;
      const t = e.side === g.mySide ? me : opp;
      t.pitches++;
      if (p.res === 'swinging' || p.res === 'foul' || p.res === 'inplay') t.sw++;
      if (p.res === 'swinging') t.whiff++;
    }
    for (const side of [0, 1] as const) {
      const t = side === g.mySide ? me : opp;
      const T = g.m.T[side];
      t.runs += T.runs;
      for (const bx of T.bat.values()) {
        t.ab += bx.ab;
        t.h += bx.h;
        t.so += bx.so;
        t.bb += bx.bb + bx.hbp;
        t.hr += bx.hr;
        t.pa += bx.ab + bx.bb + bx.hbp + bx.sac + bx.sf;
      }
    }
    if (g.m.winner === g.mySide) wins++;
  }
  return { me, opp, wins };
}

const f3 = (v: number) => v.toFixed(3).replace(/^0/, '');
const pct = (v: number) => (v * 100).toFixed(1) + '%';
const line = (name: string, t: Tot) =>
  `${name.padEnd(10)} 打率 ${f3(t.h / Math.max(1, t.ab))}  三振 ${pct(t.so / t.pa)}  保送 ${pct(t.bb / t.pa)}  本垒打 ${pct(t.hr / t.pa)}  每场得分 ${(t.runs / N).toFixed(2)}  挥棒率 ${pct(t.sw / t.pitches)}  挥空/挥棒 ${pct(t.whiff / Math.max(1, t.sw))}  每打席用球 ${(t.pitches / t.pa).toFixed(2)}`;

for (const st of (process.argv[3] ? process.argv[3].split(',') : ['coach', 'smart', 'peak', 'random']) as Style[]) {
  const { me, opp, wins } = play(st);
  console.log(`== 我方打击：${st === 'coach' ? '教练（AI）' : st === 'smart' ? '会看热区的玩家' : st === 'peak' ? '对准最热的格挥的玩家' : '乱挥的玩家'}   胜率 ${(wins / N).toFixed(3)}`);
  console.log(line('  我方', me));
  console.log(line('  对方 AI', opp));
}
