// 总评校准：同样素质的投手型和野手型，总评应该差不多；看看各类型最后守什么位置、能力有没有断层
//   node scripts/run-ts.mjs tests/rating.ts [每档人数]
import { prepareWorld, startGame } from '../src/core/newgame';
import { generatePlayer } from '../src/core/player';
import { batterOffense, bestPos, fieldAt, overall, pitcherOverall, posRating } from '../src/core/attrs';
import type { Player, Pos } from '../src/core/types';
import { FIELD_POS, POSITIONS } from '../src/core/types';

const N = Number(process.argv[2] ?? 400);
const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId: 12, difficulty: 'normal', dh: true, seed: 7 });
startGame(state, offers[0].id);

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const bestField = (p: Player) => Math.max(...FIELD_POS.map((pos) => posRating(p, pos)));
const pitAvg = (p: Player) => (p.a.control + p.a.stamina + p.a.stuff) / 3;
const batAvg = (p: Player) => (p.a.contact + p.a.power + p.a.eye + p.a.speed) / 4;

const QS = [25, 35, 45, 55, 65];
const rowsP: [number, number][] = [];
const rowsF: [number, number][] = [];
console.log('素质 年级 | 投手型: 投球评价 最佳野手位 打击均值 投球均值 最后守投手% | 野手型: 最佳野手位 投球评价 打击均值 投球均值 最后守投手%');
for (const grade of [1, 3]) {
  for (const q of QS) {
    const ps: Player[] = [];
    const fs: Player[] = [];
    for (let i = 0; i < N; i++) {
      ps.push(generatePlayer({ quality: q, grade, pos: 'P', enrollYear: 0, id: 1e6 + i }));
      fs.push(generatePlayer({ quality: q, grade, pos: FIELD_POS[i % FIELD_POS.length], enrollYear: 0, id: 2e6 + i }));
    }
    const pP = avg(ps.map(pitcherOverall));
    const fF = avg(fs.map(bestField));
    rowsP.push([pP, fF]);
    rowsF.push([q, fF]);
    console.log(
      `${String(q).padStart(4)} ${grade}年 | ${pP.toFixed(1).padStart(5)} ${avg(ps.map(bestField)).toFixed(1).padStart(5)} ${avg(ps.map(batAvg)).toFixed(1).padStart(5)} ${avg(ps.map(pitAvg)).toFixed(1).padStart(5)} ${((100 * ps.filter((p) => bestPos(p) === 'P').length) / N).toFixed(0).padStart(4)}% | ` +
        `${fF.toFixed(1).padStart(5)} ${avg(fs.map(pitcherOverall)).toFixed(1).padStart(5)} ${avg(fs.map(batAvg)).toFixed(1).padStart(5)} ${avg(fs.map(pitAvg)).toFixed(1).padStart(5)} ${((100 * fs.filter((p) => bestPos(p) === 'P').length) / N).toFixed(0).padStart(4)}%`,
    );
  }
}
// 线性拟合：k * 投手型的投球评价 + c ≈ 同素质野手型的最佳野手评价
const xs = rowsP.map((r) => r[0]);
const ys = rowsP.map((r) => r[1]);
const mx = avg(xs);
const my = avg(ys);
let num = 0;
let den = 0;
for (let i = 0; i < xs.length; i++) {
  num += (xs[i] - mx) * (ys[i] - my);
  den += (xs[i] - mx) ** 2;
}
const k = num / den;
const c = my - k * mx;
console.log(`\n拟合 P_SCALE ≈ { k: ${k.toFixed(3)}, c: ${c.toFixed(2)} }`);

// 位置分布（当前 P_SCALE 下）
const dist: Record<string, number> = {};
const mixed: Player[] = [];
for (let i = 0; i < N * 3; i++) mixed.push(generatePlayer({ quality: 45, grade: 2, enrollYear: 0, id: 3e6 + i }));
for (const p of mixed) dist[bestPos(p)] = (dist[bestPos(p)] ?? 0) + 1;
console.log('随机类型、素质 45、2 年级 的最佳位置分布：', POSITIONS.map((pos: Pos) => `${pos} ${((100 * (dist[pos] ?? 0)) / mixed.length).toFixed(0)}%`).join(' '));
console.log('总评均值', avg(mixed.map(overall)).toFixed(1), '打击', avg(mixed.map(batterOffense)).toFixed(1), '捕手守备', avg(mixed.map((p) => fieldAt(p, 'C'))).toFixed(1));
