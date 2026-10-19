// 实力悬殊的比赛：看看弱队投手被打成什么样（检查有没有失控的比分）
//   node scripts/run-ts.mjs tests/mismatch.ts [强队素质] [弱队素质] [场数]
import { seedRng, randInt } from '../src/core/rng';
import { generatePlayer } from '../src/core/player';
import { autoLineup } from '../src/core/team';
import { Match } from '../src/sim/match';
import type { MatchRules, TeamSetup } from '../src/sim/types';
import type { Player, Pos } from '../src/core/types';
import { fullName } from '../src/core/attrs';

seedRng(777);
const qa = Number(process.argv[2] ?? 60);
const qb = Number(process.argv[3] ?? 30);
const N = Number(process.argv[4] ?? 20);
const rules: MatchRules = {
  innings: 9, mercy: false, dh: true, koshien: false, bigGame: false, official: true, tiebreakFrom: 10, maxInnings: 20,
  pitchLimit: 500, moundVisits: 3, fence: { line: 95, center: 118 }, stadium: 'test',
};
function makeTeam(q: number): Player[] {
  const plan: Pos[] = ['P', 'P', 'P', 'P', 'P', 'C', 'C', '1B', '2B', '2B', '3B', 'SS', 'SS', 'LF', 'CF', 'CF', 'RF', 'RF', '3B', 'LF'];
  return plan.map((pos, i) => {
    const grade = i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1;
    return generatePlayer({ quality: q + randInt(-6, 6), grade, pos, enrollYear: 2026 - grade + 1 });
  });
}
function setup(players: Player[], name: string): TeamSetup {
  for (const p of players) {
    p.fatigue = 0;
    p.pitchesWeek = 0;
  }
  const lu = autoLineup(players, rules.dh);
  return { schoolId: 0, name, short: name, colors: { primary: '#000', secondary: '#fff', cap: '#000', letter: name[0] }, players, order: lu.order, defense: lu.defense, human: false, style: 'balanced', mgrTactics: 50, teamTactics: 50, chemistry: 50, crowd: 0 };
}
const tot = { r: 0, h: 0, bb: 0, hbp: 0, so: 0, hr: 0, np: 0, pa: 0 };
for (let g = 0; g < N; g++) {
  const A = makeTeam(qa);
  const B = makeTeam(qb);
  const m = new Match(setup(A, 'A'), setup(B, 'B'), rules);
  m.toEnd();
  const s = m.summary();
  const bat = s.bat[0];
  const sum = (k: 'h' | 'bb' | 'so' | 'hr' | 'pa') => bat.reduce((a, b) => a + b[k], 0);
  const hbp = bat.reduce((a, b) => a + b.hbp, 0);
  tot.r += s.score[0];
  tot.h += sum('h');
  tot.bb += sum('bb');
  tot.hbp += hbp;
  tot.so += sum('so');
  tot.hr += sum('hr');
  tot.pa += sum('pa');
  if (g < 3) {
    console.log(`第${g + 1}场 ${s.score[0]}-${s.score[1]}  安打 ${sum('h')} 四球 ${sum('bb')} 死球 ${hbp} 三振 ${sum('so')} 本垒打 ${sum('hr')} 打席 ${sum('pa')}`);
    for (const pb of s.pit[1]) {
      const p = m.T[1].get(pb.pid);
      console.log(`   投手 ${fullName(p)} 控${Math.round(p.a.control)} 速${Math.round(p.a.velocity)} 威${Math.round(p.a.stuff)} 球数 ${pb.np} 出局 ${pb.outs} 失分 ${pb.r} 四球 ${pb.bb} 安打 ${pb.h}`);
    }
  }
}
const k = (v: number) => (v / N).toFixed(1);
console.log(`\n平均每场：得分 ${k(tot.r)} 安打 ${k(tot.h)} 四球 ${k(tot.bb)} 死球 ${k(tot.hbp)} 三振 ${k(tot.so)} 本垒打 ${k(tot.hr)} 打席 ${k(tot.pa)}`);
