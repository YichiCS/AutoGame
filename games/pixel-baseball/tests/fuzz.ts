// 比赛引擎模糊测试：人类一方随机下达各种指令，检查不变量  node scripts/run-ts.mjs tests/fuzz.ts [场数]
import { seedRng, randInt, rand, pick } from '../src/core/rng';
import { generatePlayer } from '../src/core/player';
import { autoLineup } from '../src/core/team';
import { Match, type TeamState } from '../src/sim/match';
import type { MatchRules, OffTactic, TeamSetup, PitchApproach, Alignment } from '../src/sim/types';
import type { Player, Pos } from '../src/core/types';
import { GRID, cellCenter } from '../src/sim/pitching';

seedRng(4242);
const N = Number(process.argv[2] ?? 300);

function team(q: number): Player[] {
  const plan: Pos[] = ['P', 'P', 'P', 'P', 'C', 'C', '1B', '2B', '2B', '3B', 'SS', 'SS', 'LF', 'CF', 'CF', 'RF', 'RF', 'P', '3B', 'LF'];
  return plan.map((pos, i) => generatePlayer({ quality: q + randInt(-8, 8), grade: (i % 3) + 1, pos, enrollYear: 2026 }));
}

function setup(ps: Player[], name: string, human: boolean, dh: boolean): TeamSetup {
  for (const p of ps) {
    p.fatigue = randInt(0, 60);
    p.pitchesWeek = randInt(0, 420);
  }
  const lu = autoLineup(ps, dh);
  return {
    schoolId: 0, name, short: name, colors: { primary: '#000', secondary: '#fff', cap: '#000', letter: name[0] },
    players: ps, order: lu.order, defense: lu.defense, human, style: pick(['balanced', 'smallball', 'power', 'pitching', 'speed'] as const),
    mgrTactics: 50, teamTactics: randInt(0, 100), chemistry: 50, crowd: rand(),
  };
}

const OFF: OffTactic[] = ['auto', 'swing', 'aggressive', 'wait', 'contact', 'power', 'bunt', 'buntHit', 'squeeze', 'hitRun', 'steal', 'doubleSteal'];
const APP: PitchApproach[] = ['normal', 'max', 'contact', 'careful'];
const ALI: Alignment[] = ['normal', 'infieldIn', 'dp', 'noDoubles', 'buntShift'];
let problems = 0;
const fail = (m: Match, msg: string) => {
  problems++;
  if (problems < 15) console.log(`!! ${msg} @${m.inning}-${m.half} outs ${m.outs}`);
};

function check(m: Match): void {
  for (const t of m.T) {
    if (t.order.length !== 9) fail(m, `${t.s.name} order length ${t.order.length}`);
    if (new Set(t.order).size !== 9) fail(m, `${t.s.name} duplicate in order`);
    for (const id of t.order) {
      if (!t.roster.has(id)) fail(m, `${t.s.name} order has unknown ${id}`);
      if (t.used.has(id)) fail(m, `${t.s.name} used player ${id} still in order`);
    }
    if (t.used.has(t.pitcher) && m.dfn === t && !m.needHalf) fail(m, `${t.s.name} pitcher is used while fielding`);
    const sum = t.line.reduce((a, b) => a + (b ?? 0), 0);
    if (sum !== t.runs) fail(m, `${t.s.name} line sum ${sum} != runs ${t.runs}`);
    const ps = t.pitcherSlot();
    if (m.dfn === t && ps >= 0 && t.order[ps] !== t.pitcher && !m.needHalf) fail(m, `${t.s.name} pitcher slot mismatch`);
  }
  if (!m.over && !m.needHalf && (m.outs < 0 || m.outs > 2)) fail(m, `outs ${m.outs}`);
  const bs = m.bases.filter(Boolean).map((b) => b!.pid);
  if (new Set(bs).size !== bs.length) fail(m, 'duplicate runner');
  if (!m.over && !m.needHalf) for (const pid of bs) if (!m.off.order.includes(pid)) fail(m, `runner ${pid} not in batting order`);
}

function randomCommand(m: Match, me: TeamState): void {
  const batting = m.off === me;
  if (batting) {
    if (rand() < 0.35) me.tactic = pick(OFF);
    // 这一球狙哪一格、跑者跑不跑（有时不下指令，交给教练）
    if (rand() < 0.85) me.swingNext = { z: randInt(-1, 8), run: [rand() < 0.15, rand() < 0.08, rand() < 0.1] };
    if (rand() < 0.03) {
      const b = me.bench();
      if (b.length) m.pinchHit(me, me.batIdx, pick(b).id);
    }
    if (rand() < 0.03) {
      const occ = m.bases.map((b, i) => (b ? i : -1)).filter((i) => i >= 0);
      const b = me.bench();
      if (occ.length && b.length) m.pinchRun(me, pick(occ), pick(b).id);
    }
  } else {
    if (rand() < 0.3) me.def.approach = pick(APP);
    // 这一球投什么、瞄哪一格（有时不下指令，交给教练）
    if (rand() < 0.85) {
      const p = me.get(me.pitcher);
      const [x, y] = cellCenter(randInt(0, GRID - 1), randInt(0, GRID - 1));
      me.callNext = { type: rand() < 0.5 || !p.pitches.length ? 'FB' : pick(p.pitches).type, x, y };
    }
    if (rand() < 0.3) me.def.align = pick(ALI);
    if (rand() < 0.04) me.def.ibb = true;
    if (rand() < 0.04) me.def.pitchout = true;
    if (rand() < 0.04) m.ui(() => m.pickoff(randInt(-1, 2)));
    if (rand() < 0.03) m.moundVisit(me);
    if (rand() < 0.03) {
      const b = me.bench();
      if (b.length) m.changePitcher(me, pick(b).id);
    }
    if (rand() < 0.02) {
      const b = me.bench();
      if (b.length) m.defensiveSub(me, pick(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as Pos[]), pick(b).id);
    }
  }
}

let errors = 0;
let totalRuns = 0;
let walkoffs = 0;
const t0 = Date.now();
for (let g = 0; g < N; g++) {
  const dh = g % 2 === 0;
  const rules: MatchRules = {
    innings: 9, mercy: g % 3 === 0, dh, koshien: g % 5 === 0, bigGame: g % 4 === 0, official: true, tiebreakFrom: 10, maxInnings: 20,
    pitchLimit: 500, moundVisits: 3, fence: { line: 95, center: 118 }, stadium: 'fuzz',
  };
  const humanSide = (g % 2) as 0 | 1;
  const A = setup(team(randInt(25, 60)), 'A', humanSide === 0, dh);
  const B = setup(team(randInt(25, 60)), 'B', humanSide === 1, dh);
  const m = new Match(A, B, rules);
  const me = m.T[humanSide];
  try {
    let guard = 0;
    while (!m.over && guard++ < 5000) {
      m.prepare();
      randomCommand(m, me);
      m.step();
      check(m);
    }
    if (!m.over) fail(m, 'game did not finish');
    const s = m.summary();
    totalRuns += s.score[0] + s.score[1];
    if (s.score[0] === s.score[1]) fail(m, 'tie game');
    // 再见比赛（非本垒打）在致胜分回本垒时结束：只能赢 1 分
    if (s.winner === 1 && m.half === 1 && m.inning >= rules.innings && !s.called) {
      walkoffs++;
      const lastScore = [...m.log].reverse().find((e) => (e.runs ?? 0) > 0);
      if (lastScore?.bip?.res !== 'HR' && s.score[1] - s.score[0] !== 1) fail(m, `walk-off margin ${s.score[1] - s.score[0]}`);
    }
  } catch (e) {
    errors++;
    if (errors < 5) console.log('EXCEPTION', (e as Error).stack?.split('\n').slice(0, 6).join('\n'));
  }
}
console.log(`${N} games in ${((Date.now() - t0) / 1000).toFixed(1)}s, exceptions ${errors}, invariant problems ${problems}, avg total runs ${(totalRuns / N).toFixed(1)}, walk-offs ${walkoffs}`);
