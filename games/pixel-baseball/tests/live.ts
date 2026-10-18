// 亲自指挥的比赛：随机下指令打完一场，再按记录重演（包括中途读档），结果必须一模一样
//   node scripts/run-ts.mjs tests/live.ts [场数]
import { prepareWorld, startGame } from '../src/core/newgame';
import { G } from '../src/core/state';
import { runDays } from '../src/core/sim';
import { LiveGame } from '../src/core/live';
import { getRngState } from '../src/core/rng';
import type { PendingMatch } from '../src/core/types';
import type { BatCmd, PitchPlan, Zone } from '../src/sim/types';

const N = Number(process.argv[2] ?? 20);
// 测试自己的随机数（和游戏的分开）
let s = 20261018;
const r = (): number => ((s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)];
const ZONES: (Zone | 'none')[] = ['none', 'none', 'in', 'out', 'high', 'low'];

const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId: 13, difficulty: 'normal', dh: true, seed: 99 });
startGame(state, offers[1].id);
G.policies.auto = 'all';
runDays(12);
G.pending = null;
const opps = Object.values(G.schools).filter((x) => x.id !== G.schoolId);

function randBat(): BatCmd {
  return { app: pick(['normal', 'normal', 'power', 'contact', 'aggressive', 'wait', 'bunt', 'buntHit', 'squeeze'] as const), sit: pick(['none', 'none', 'FB', 'BR'] as const), zone: pick(ZONES), run: pick(['none', 'none', 'none', 'steal', 'hitRun', 'doubleSteal'] as const), agg: pick([-1, 0, 0, 1] as const) };
}
function randPlan(g: LiveGame): PitchPlan {
  const p = g.m.pitcher();
  return {
    mix: pick(['auto', 'auto', 'FB', 'BR'] as const),
    finisher: r() < 0.5 ? null : r() < 0.3 || !p.pitches.length ? 'FB' : pick(p.pitches).type,
    focus: pick(['auto', 'auto', 'in', 'out', 'high', 'low'] as const),
    approach: pick(['normal', 'normal', 'max', 'contact', 'careful'] as const),
    align: pick(['normal', 'normal', 'infieldIn', 'dp', 'noDoubles', 'buntShift'] as const),
    ibb: r() < 0.03,
    hold: r() < 0.2,
    pitchout: r() < 0.05,
  };
}

let fails = 0;
const ok = (c: boolean, msg: string, extra?: unknown) => {
  if (!c) {
    fails++;
    console.log('  FAIL', msg, extra === undefined ? '' : JSON.stringify(extra));
  }
};
const rng0 = JSON.stringify(getRngState());
let totalPA = 0;
let coachGames = 0;
for (let k = 0; k < N; k++) {
  const pm: PendingMatch = { tour: null, round: 0, idx: 0, oppId: pick(opps).id, home: r() < 0.5, seed: 1000 + k * 7919, label: '测试赛' };
  const g = new LiveGame(pm);
  const snaps: string[] = [];
  let mid: { step: number; pm: string } | null = null;
  const coach = k % 4 === 3; // 每 4 场有一场整场交给教练
  if (coach) coachGames++;
  let guard = 0;
  while (g.phase() !== 'over' && guard++ < 400) {
    g.ready();
    snaps[g.step] = JSON.stringify(g.m.snap());
    if (!mid && g.step === 25) mid = { step: g.step, pm: JSON.stringify(pm) };
    if (coach) g.coachTurn();
    else {
      const t = g.myTeam;
      if (g.phase() === 'bat' && r() < 0.06) {
        const bench = t.bench();
        if (bench.length) g.act({ k: 'ph', slot: t.batIdx, pid: pick(bench).id });
      }
      if (g.phase() === 'bat' && g.m.bases[0] && r() < 0.05) {
        const bench = t.bench();
        if (bench.length) g.act({ k: 'pr', base: 0, pid: pick(bench).id });
      }
      if (g.phase() === 'pitch' && r() < 0.04) {
        const bench = t.bench();
        if (bench.length) g.act({ k: 'pc', pid: pick(bench).id });
      }
      if (g.phase() === 'pitch' && g.m.pickoffsLeft() > 0 && r() < 0.15) g.act({ k: 'po' });
      if (g.phase() === 'bat') g.act({ k: 'bat', c: randBat() });
      else if (g.phase() === 'pitch') g.act({ k: 'pitch', c: randPlan(g) });
    }
    g.play();
  }
  totalPA += g.step;
  ok(g.phase() === 'over', `第${k + 1}场没有打完`, g.step);
  const sum1 = JSON.stringify(g.m.summary());
  const ev1 = g.events.map((e) => e.text).join('|');
  // 整场重演
  const g2 = new LiveGame(JSON.parse(JSON.stringify(pm)) as PendingMatch);
  ok(JSON.stringify(g2.m.summary()) === sum1, `第${k + 1}场重演的比分 / 成绩不一致`);
  ok(g2.events.map((e) => e.text).join('|') === ev1, `第${k + 1}场重演的事件不一致`);
  // 中途读档
  if (mid) {
    const g3 = new LiveGame(JSON.parse(mid.pm) as PendingMatch);
    ok(g3.step === mid.step, `第${k + 1}场中途读档的打席数不对`, [g3.step, mid.step]);
    ok(JSON.stringify(g3.m.snap()) === snaps[mid.step], `第${k + 1}场中途读档后的局面不一致`, [g3.m.snap(), snaps[mid.step]]);
  }
}
ok(JSON.stringify(getRngState()) === rng0, '亲自指挥的比赛动用了全局随机数');
console.log(`${N} 场（其中 ${coachGames} 场全程交给教练），共 ${totalPA} 个打席`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
