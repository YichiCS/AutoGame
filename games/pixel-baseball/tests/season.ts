// 无界面的多年度自动推进测试：node scripts/run-ts.mjs tests/season.ts [年数] [县id] [选校0-2]
import { generateWorld, beginCareer } from '../src/core/newgame';
import { advance, dismissNotice, resolveChoice, buildPlayerMatch, finishPlayerMatch } from '../src/core/game';
import { resolveEvent } from '../src/core/events';
import { G, mySchool, myPlayers } from '../src/core/state';
import { schoolStrength, schoolsInPref } from '../src/core/world';
import { overall, isPitcher, pitcherOverall, batterOffense, fullName } from '../src/core/attrs';
import { LADDER, summerLadder } from '../src/core/career';
import { PREFS } from '../src/data/prefectures';
import { snapshot } from '../src/core/save';

const years = Number(process.argv[2] ?? 3);
const prefId = Number(process.argv[3] ?? 12);
const pickIdx = Number(process.argv[4] ?? 1);

const t0 = Date.now();
const cands = generateWorld({ mgrName: '测试监督', bg: 'teacher', age: 35, prefId, difficulty: 'normal', dh: true, seed: 2026, year: 2026 });
console.log(`world generated in ${Date.now() - t0}ms; schools ${Object.keys(G.schools).length}, players ${Object.keys(G.players).length}`);
for (const s of cands) console.log(`  候选: ${s.name} ${s.type} prestige ${s.prestige.toFixed(0)} str ${schoolStrength(s).total.toFixed(1)}`);
beginCareer(cands[Math.min(pickIdx, cands.length - 1)].id);
console.log(`就任 ${mySchool().name}，部员 ${myPlayers().length}`);

const prefSchools = schoolsInPref(prefId).map((s) => schoolStrength(s).total).sort((a, b) => b - a);
console.log(`县内战力: top ${prefSchools.slice(0, 5).map((x) => x.toFixed(0)).join(',')} median ${prefSchools[Math.floor(prefSchools.length / 2)].toFixed(0)} bottom ${prefSchools[prefSchools.length - 1].toFixed(0)}`);

let matches = 0;
let wins = 0;
const t1 = Date.now();
const endAbs = years * 48;
let guard = 0;
while (G.absWeek < endAbs && guard++ < 100000) {
  const h = advance();
  switch (h.t) {
    case 'event': {
      const ev = G.eventQueue[0];
      const idx = ev.choices.findIndex((c) => !c.disabled);
      resolveEvent(Math.max(0, idx));
      break;
    }
    case 'notice':
      if (h.notice.kind === 'celebrate') console.log(`  [${G.year}-${G.week}] ★ ${h.notice.title}: ${h.notice.lines[0]}`);
      dismissNotice();
      break;
    case 'choice':
      console.log(`  [${G.year}-${G.week}] 选择 ${h.choice.title}: ${h.choice.options[0]?.label}`);
      resolveChoice(h.choice.options[0].value);
      break;
    case 'match': {
      const { match, mySide } = buildPlayerMatch(h.pm);
      match.T[mySide].auto = true;
      match.toEnd();
      const sum = match.summary();
      matches++;
      if (sum.winner === mySide) wins++;
      finishPlayerMatch(match);
      break;
    }
    case 'report':
    case 'idle':
      break;
  }
  if (h.t === 'idle' && G.week === 19) {
    const me = mySchool();
    const lad = summerLadder(me.id);
    console.log(`== ${G.year} 夏 ${me.name}: ${LADDER[lad]} (目标 ${LADDER[G.club.goal]}) 战力 ${schoolStrength(me).total.toFixed(1)}  资金 ${Math.round(G.club.funds)} 校方 ${G.club.board.toFixed(0)} 名声 ${G.manager.reputation.toFixed(0)} 球迷 ${G.club.fans}`);
    const champ = Object.values(G.tournaments).find((t) => t.kind === 'koshien' && t.year === G.year)?.champion;
    if (champ !== undefined && champ !== null) console.log(`   夏甲冠军: ${G.schools[champ].name} (${PREFS[G.schools[champ].prefId].name})`);
  }
  if (h.t === 'idle' && G.week === 0) {
    const ps = myPlayers().filter((p) => !p.retired);
    const pit = ps.filter(isPitcher).sort((a, b) => pitcherOverall(b) - pitcherOverall(a))[0];
    const bat = ps.filter((p) => !isPitcher(p)).sort((a, b) => batterOffense(b) - batterOffense(a))[0];
    console.log(`-- ${G.year}年度 部员 ${ps.length} 伤 ${ps.filter((p) => p.injury).length} | 王牌 ${pit ? fullName(pit) + ' ' + pit.a.velocity.toFixed(0) + 'km 控' + pit.a.control.toFixed(0) + ' ov' + pitcherOverall(pit).toFixed(0) : '-'} | 主砲 ${bat ? fullName(bat) + ' 击' + bat.a.contact.toFixed(0) + ' 力' + bat.a.power.toFixed(0) + ' ov' + overall(bat).toFixed(0) : '-'} | 中学生 ${G.prospects.length} 选拔: ${G.senbatsuReps.includes(G.club.schoolId) ? '入选' : '-'}`);
  }
}
console.log(`\n${years} 年完成，用时 ${((Date.now() - t1) / 1000).toFixed(1)}s，本队比赛 ${matches} 场 胜 ${wins}`);
console.log(`players in world: ${Object.keys(G.players).length}, schools materialized: ${Object.values(G.schools).filter((s) => s.roster).length}`);
console.log(`save size: ${(snapshot().length / 1024 / 1024).toFixed(2)} MB`);
console.log(`achievements: ${G.manager.achievements.join(', ')}`);
console.log(`alumni: ${G.records.alumni.length}, pros: ${G.records.alumni.filter((a) => a.pro).length}`);
console.log(`news sample:\n  ${G.news.slice(0, 8).map((n) => n.text).join('\n  ')}`);
