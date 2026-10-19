// 落点散布的形状：每个球种从同一个目标点抽很多球，看平均偏移和散布方向是不是顺着变化方向
//   node scripts/run-ts.mjs tests/spread.ts
import { PITCH_DEFS } from '../src/data/pitches';
import type { PitchType } from '../src/core/types';
import { density, makeRng, sampleLanding, spreadOf, GRID, cellCenter } from '../src/sim/pitching';

const r = makeRng(42);
const N = 20000;
let fails = 0;
for (const throws of ['R', 'L'] as const) {
  for (const t of ['FB', 'SL', 'CB', 'FK', 'SK', 'CH', 'TS', 'KN'] as (PitchType | 'FB')[]) {
    const sp = spreadOf(t, throws, 50, 55, 0.2);
    let mx = 0;
    let my = 0;
    for (let i = 0; i < N; i++) {
      const l = sampleLanding(0, 0, sp, r);
      mx += l.x;
      my += l.y;
    }
    mx /= N;
    my /= N;
    const dir = t === 'FB' ? '' : PITCH_DEFS[t].dir;
    // 变化方向（捕手视角，右投手）：R = +x，L = -x，D = -y
    const ex = dir.includes('R') ? 1 : dir.includes('L') ? -1 : 0;
    const wantX = throws === 'L' ? -ex : ex;
    const wantY = dir.includes('D') ? -1 : 0;
    const okX = wantX === 0 ? true : Math.sign(mx) === wantX;
    const okY = wantY === 0 ? true : Math.sign(my) === wantY;
    const okAll = t === 'KN' || t === 'TS' || (okX && okY);
    if (!okAll) fails++;
    console.log(`${throws}投 ${t.padEnd(3)} ${dir.padEnd(2)} 平均偏移 x ${mx.toFixed(3).padStart(7)} y ${my.toFixed(3).padStart(7)}  ${okAll ? '✓' : '✗ 方向不对'}`);
  }
}
// 网格概率的重心也要一致
const sp = spreadOf('SK', 'R', 50, 55, 0.2);
const d = density([{ x: 0, y: 0, w: 1, sp }], 3, 6000);
let cx = 0;
let cy = 0;
for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
  const [x, y] = cellCenter(i, j);
  cx += x * d[j * GRID + i];
  cy += y * d[j * GRID + i];
}
console.log(`右投手下沉球的网格重心 x ${cx.toFixed(3)} y ${cy.toFixed(3)}（应该在左下：x<0, y<0）`);
if (!(cx < 0 && cy < 0)) fails++;
console.log(fails ? `✗ ${fails} 项不对` : '✓ 方向都对');
