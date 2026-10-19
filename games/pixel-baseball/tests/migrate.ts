// 旧存档迁移测试：读一个旧版存档，看位置和投球能力怎么变，再推进几天确认不出错
//   node scripts/run-ts.mjs tests/migrate.ts <存档.json>
import { readFileSync } from 'node:fs';
import { loadState } from '../src/core/save';
import { G, myPlayers } from '../src/core/state';
import { runDays } from '../src/core/sim';
import { bestPos, fullName, overall, posRating } from '../src/core/attrs';
import { SAVE_VERSION } from '../src/core/newgame';

const file = process.argv[2];
if (!file) throw new Error('用法：tests/migrate.ts <存档.json>');
const raw = JSON.parse(readFileSync(file, 'utf8'));
const before = new Map<number, { pos: string; pit: number; vel: number }>();
for (const id of raw.roster as number[]) {
  const p = raw.players[id];
  before.set(id, { pos: p.pos, pit: (p.a.control + p.a.stamina + p.a.stuff) / 3, vel: p.a.velocity });
}
console.log(`存档版本 v${raw.v} → 迁移到 v${SAVE_VERSION}，比赛进行中：${raw.pending?.live ? '是' : '否'}`);
loadState(raw);
let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
ok(G.v === SAVE_VERSION, '版本号更新');
ok(Object.values(G.players).every((p) => !('apt' in p)), '守备适性 apt 已删除');
ok(!G.pending?.live, '没有残留的比赛进行记录');
console.log('\n姓名        原位置→现在  投球均值(原→现)  球速(原→现)  投手评价  总评  最适合');
for (const p of myPlayers()) {
  const b = before.get(p.id);
  if (!b) continue;
  const pit = (p.a.control + p.a.stamina + p.a.stuff) / 3;
  console.log(
    `${fullName(p).padEnd(8)} ${b.pos.padStart(3)}→${p.pos.padEnd(3)}  ${b.pit.toFixed(0).padStart(3)}→${pit.toFixed(0).padEnd(3)}        ${b.vel.toFixed(0)}→${p.a.velocity.toFixed(0)}     ${posRating(p, 'P').toFixed(0).padStart(3)}     ${overall(p).toFixed(0).padStart(3)}  ${bestPos(p)}`,
  );
}
const fielders = myPlayers().filter((p) => before.get(p.id)?.pos !== 'P');
ok(fielders.every((p) => p.a.control >= 20 && p.a.stamina >= 15), '野手的投球能力补到了正常水平');
ok(myPlayers().every((p) => p.a.control >= before.get(p.id)!.pit - 40), '没有人的能力被降低（只升不降）');
const d0 = G.day;
runDays(14);
ok(G.day > d0, `推进 14 天没有出错（${d0} → ${G.day}）`);
console.log(fails ? `\n✗ ${fails} 项失败` : '\n✓ 全部通过');
if (fails) process.exit(1);
