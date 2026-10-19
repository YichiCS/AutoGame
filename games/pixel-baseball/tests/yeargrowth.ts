// 一年下来我方球员涨了多少（成长系统改动前后比较）：node scripts/run-ts.mjs tests/yeargrowth.ts [种子数]
import { prepareWorld, startGame } from '../src/core/newgame';
import { G, myPlayers } from '../src/core/state';
import { runDays } from '../src/core/sim';
import { overall } from '../src/core/attrs';

const N = Number(process.argv[2] ?? 4);
let tot = 0;
let cnt = 0;
for (let k = 0; k < N; k++) {
  const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId: 13, difficulty: 'normal', dh: true, seed: 300 + k });
  startGame(state, offers[1].id);
  G.policies.auto = 'all';
  const start = new Map(myPlayers().map((p) => [p.id, overall(p)]));
  runDays(330);
  for (const p of myPlayers()) {
    const s = start.get(p.id);
    if (s === undefined) continue;
    tot += overall(p) - s;
    cnt++;
  }
}
console.log(`${N} 个存档，${cnt} 人，330 天平均总评 +${(tot / cnt).toFixed(2)}`);
