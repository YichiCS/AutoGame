// 校准：按需生成的对手名单，实际战力和它的「战力评分」是否一致
//   node scripts/run-ts.mjs tests/calib.ts
import { prepareWorld, startGame } from '../src/core/newgame';
import { G } from '../src/core/state';
import { opponentRoster, schoolRating } from '../src/core/world';
import { strengthOf } from '../src/core/team';
import { doyOf } from '../src/core/calendar';

const { state, offers } = prepareWorld({ mgrName: 'x', bg: 'teacher', age: 35, prefId: 12, difficulty: 'normal', dh: true, seed: 3 });
startGame(state, offers[0].id);
const schools = Object.values(G.schools).sort((a, b) => b.prestige - a.prestige);
for (const day of [doyOf(4, 20), doyOf(7, 10), doyOf(9, 15)]) {
  let diff = 0;
  let n = 0;
  const rows: string[] = [];
  for (const s of schools.filter((_, i) => i % 6 === 0)) {
    const r = schoolRating(s, day);
    const st = strengthOf(opponentRoster(s, day), G.dh).total;
    diff += st - r;
    n++;
    rows.push(`${s.short}(${Math.round(s.prestige)}) 评分 ${r.toFixed(1)} 实际 ${st.toFixed(1)}`);
  }
  console.log(`day ${day}: 平均偏差 ${(diff / n).toFixed(2)}`);
  console.log('  ' + rows.join(' | '));
}
