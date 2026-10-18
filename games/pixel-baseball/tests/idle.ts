// 挂机版无界面测试：开局后一路托管推进 N 年，检查不出错，并打印平衡相关的统计
//   node scripts/run-ts.mjs tests/idle.ts [年数] [县 id] [种子] [开局选第几所学校 0..2] [all = 全部托管（含自动升级设施）]
import { prepareWorld, startGame } from '../src/core/newgame';
import { G, myPlayers } from '../src/core/state';
import { runDays } from '../src/core/sim';
import { overall, isPitcher } from '../src/core/attrs';
import { strengthOf, strengthLetter } from '../src/core/team';
import { TOUR_ORDER } from '../src/core/season';
import { YEAR, doy, doyOf } from '../src/core/calendar';
import { PITCH_DEFS } from '../src/data/pitches';
import { schoolRating } from '../src/core/world';
import { queueStats } from '../src/core/queue';

const years = Number(process.argv[2] ?? 5);
const prefId = Number(process.argv[3] ?? 12);
const seed = Number(process.argv[4] ?? 42);
const pickIdx = Number(process.argv[5] ?? 1);
const allAuto = process.argv[6] === 'all';

const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId, difficulty: 'normal', dh: true, seed });
startGame(state, (offers[pickIdx] ?? offers[0]).id);
if (allAuto) G.policies.auto = 'all';
const me = G.schools[G.schoolId];
console.log(`开局：${me.name}（${me.type === 'public' ? '公立' : '私立'}，名门度 ${me.prestige.toFixed(0)}，县内 ${Object.keys(G.schools).length} 校）托管：${G.policies.auto}`);

const t0 = Date.now();
for (let y = 0; y < years; y++) {
  let summer = '';
  for (let d = 0; d < YEAR; d++) {
    runDays(1);
    if (doy(G.day) === doyOf(7, 7)) {
      const ps = myPlayers();
      const st = strengthOf(ps, G.dh);
      const ratings = Object.values(G.schools).filter((s) => s.id !== G.schoolId).map((s) => schoolRating(s, G.day)).sort((a, b) => b - a);
      const rank = ratings.filter((r) => r > st.total).length + 1;
      const g3 = ps.filter((p) => p.grade === 3);
      const ace = ps.filter(isPitcher).sort((a, b) => overall(b) - overall(a))[0];
      summer = `夏前战力 ${st.total.toFixed(1)}(${strengthLetter(st.total)}) 县内第 ${rank}（最强 ${ratings[0].toFixed(1)}） 三年级均 ${(g3.reduce((a, p) => a + overall(p), 0) / Math.max(1, g3.length)).toFixed(1)} 王牌 ${ace ? `${ace.fam}${Math.round(overall(ace))}/${Math.round(ace.a.velocity)}km` : '-'}`;
    }
  }
  const h = G.history[G.history.length - 1];
  const res = h ? TOUR_ORDER.filter((k) => h.results[k]).map((k) => `${k}:${h.results[k]}`).join(' ') : '';
  console.log(`第${y + 1}年 ${h?.w ?? 0}胜${h?.l ?? 0}负 | ${res}`);
  console.log(`        ${summer} | 人数 ${myPlayers().length} 部费 ${Math.round(G.funds)} 名声 ${G.mgr.rep.toFixed(1)} Lv${G.mgr.level} 校方 ${Math.round(G.club.board)} | ${G.schools[G.schoolId]?.name}`);
}
const ms = Date.now() - t0;
const total = Object.values(queueStats).reduce((a, b) => a + b, 0);
console.log(`\n耗时 ${ms} ms（${(ms / years).toFixed(0)} ms/年），事件 ${total} 件（${(total / years).toFixed(0)} 件/年）`);
console.log('事件分布：', Object.entries(queueStats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' '));
const pit = myPlayers().filter(isPitcher);
console.log('投手球种：', pit.map((p) => `${p.fam}[${Math.round(p.a.velocity)}km ${p.pitches.map((x) => (x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].short) + x.lv).join(',')}]`).join(' '));
console.log('通算：', JSON.stringify(G.mgr.totals));
console.log('成就：', Object.keys(G.achievements).join(' '));
console.log('职业 OB：', G.alumni.filter((a) => a.path === 'pro').map((a) => `${a.name}(${a.proTeam}${a.round}位·${a.proStatus})`).join(' '));
console.log('设施：', JSON.stringify(G.facilities));
console.log('存档大小：', (JSON.stringify(G).length / 1024).toFixed(1), 'KB');
console.log('大事记：');
for (const l of G.timeline.slice(-15)) console.log('  ', l.d, l.t);
