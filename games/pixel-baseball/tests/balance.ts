// 无界面平衡性测试：node scripts/run-ts.mjs tests/balance.ts
import { seedRng, randInt } from '../src/core/rng';
import { generatePlayer } from '../src/core/player';
import { autoLineup, strengthOf } from '../src/core/team';
import { Match } from '../src/sim/match';
import type { MatchRules, TeamSetup } from '../src/sim/types';
import type { Player, Pos } from '../src/core/types';
import { quickGame } from '../src/sim/quick';
import { overall, isPitcher, pitcherOverall, batterOffense } from '../src/core/attrs';

seedRng(12345);

const rules: MatchRules = {
  innings: 9, mercy: false, dh: true, koshien: false, bigGame: false, official: true, tiebreakFrom: 10, maxInnings: 20,
  pitchLimit: 500, moundVisits: 3, fence: { line: 95, center: 118 }, stadium: 'test',
};

function makeTeam(q: number): Player[] {
  const ps: Player[] = [];
  const plan: Pos[] = ['P', 'P', 'P', 'P', 'P', 'C', 'C', '1B', '2B', '2B', '3B', 'SS', 'SS', 'LF', 'CF', 'CF', 'RF', 'RF', '3B', 'LF'];
  plan.forEach((pos, i) => {
    const grade = i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1;
    ps.push(generatePlayer({ quality: q + randInt(-6, 6), grade, pos, enrollYear: 2026 - grade + 1 }));
  });
  return ps;
}

function setup(players: Player[], name: string): TeamSetup {
  for (const p of players) {
    p.fatigue = 0;
    p.pitchesWeek = 0;
  }
  const lu = autoLineup(players, rules.dh);
  return {
    schoolId: 0, name, short: name, colors: { primary: '#000', secondary: '#fff', cap: '#000', letter: name[0] },
    players, order: lu.order, defense: lu.defense, human: false, style: 'balanced', mgrTactics: 50, teamTactics: 50, chemistry: 50, crowd: 0,
  };
}

interface Agg { g: number; pa: number; ab: number; h: number; d: number; t: number; hr: number; bb: number; hbp: number; so: number; sb: number; cs: number; sac: number; sf: number; r: number; e: number; np: number; inn: number; pitchers: number; called: number }
const agg: Agg = { g: 0, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, sac: 0, sf: 0, r: 0, e: 0, np: 0, inn: 0, pitchers: 0, called: 0 };

const pd = { n: 0, zone: 0, swing: 0, zswing: 0, oswing: 0, contact: 0, zcontact: 0, ocontact: 0, foul: 0, inplay: 0, called: 0, ball: 0, o: 0 };
const bk: Record<string, number> = {};
const br: Record<string, number> = {};

function playGame(a: Player[], b: Player[], r = rules) {
  const m = new Match(setup(a, 'A'), setup(b, 'B'), r);
  m.toEnd();
  for (const e of m.log) {
    if (e.pitch && e.pitch.res !== 'pitchout') {
      const p = e.pitch;
      const inz = Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
      const sw = p.res === 'swinging' || p.res === 'foul' || p.res === 'inplay' || p.res === 'bunt_foul' || p.res === 'bunt_miss';
      const ct = p.res === 'foul' || p.res === 'inplay' || p.res === 'bunt_foul';
      pd.n++;
      if (inz) pd.zone++;
      else pd.o++;
      if (sw) {
        pd.swing++;
        if (inz) pd.zswing++;
        else pd.oswing++;
        if (ct) {
          pd.contact++;
          if (inz) pd.zcontact++;
          else pd.ocontact++;
        }
      }
      if (p.res === 'foul') pd.foul++;
      if (p.res === 'inplay') pd.inplay++;
      if (p.res === 'called') pd.called++;
      if (p.res === 'ball') pd.ball++;
    }
    if (e.bip) {
      bk[e.bip.kind] = (bk[e.bip.kind] ?? 0) + 1;
      const key = `${e.bip.kind}:${e.bip.res}`;
      br[key] = (br[key] ?? 0) + 1;
    }
  }
  const s = m.summary();
  agg.g++;
  agg.inn += s.innings;
  if (s.called) agg.called++;
  for (const side of [0, 1] as const) {
    for (const bb of s.bat[side]) {
      agg.pa += bb.pa; agg.ab += bb.ab; agg.h += bb.h; agg.d += bb.d; agg.t += bb.t; agg.hr += bb.hr; agg.bb += bb.bb; agg.hbp += bb.hbp;
      agg.so += bb.so; agg.sb += bb.sb; agg.cs += bb.cs; agg.sac += bb.sac; agg.sf += bb.sf; agg.r += bb.r; agg.e += bb.e;
    }
    for (const pp of s.pit[side]) agg.np += pp.np;
    agg.pitchers += s.pit[side].length;
  }
  return s;
}

const Q = Number(process.argv[2] ?? 42);
const t1 = makeTeam(Q);
const t2 = makeTeam(Q);
const s1 = strengthOf(t1);
const s2 = strengthOf(t2);
console.log(`Team quality ${Q}: str A ${s1.total.toFixed(1)} (off ${s1.off.toFixed(1)} def ${s1.def.toFixed(1)} pit ${s1.pit.toFixed(1)}), B ${s2.total.toFixed(1)}`);
const ace = t1.filter(isPitcher).sort((a, b) => pitcherOverall(b) - pitcherOverall(a))[0];
console.log(`A ace: ${ace.a.velocity.toFixed(0)}km/h ctl ${ace.a.control.toFixed(0)} sta ${ace.a.stamina.toFixed(0)} stuff ${ace.a.stuff.toFixed(0)} pitches ${ace.pitches.map((x) => x.type + x.lv).join(',')} ov ${pitcherOverall(ace).toFixed(1)}`);
const bats = t1.filter((p) => !isPitcher(p)).sort((a, b) => batterOffense(b) - batterOffense(a)).slice(0, 3);
for (const p of bats) console.log(`  bat g${p.grade} ${p.pos} con ${p.a.contact.toFixed(0)} pow ${p.a.power.toFixed(0)} eye ${p.a.eye.toFixed(0)} spd ${p.a.speed.toFixed(0)} fld ${p.a.fielding.toFixed(0)} ov ${overall(p).toFixed(1)}`);

const N = Number(process.argv[3] ?? 400);
let winsA = 0;
for (let i = 0; i < N; i++) {
  const s = playGame(t1, t2);
  if (s.winner === 0) winsA++;
}
const g = agg.g * 2;
const avg = agg.h / agg.ab;
const obp = (agg.h + agg.bb + agg.hbp) / (agg.ab + agg.bb + agg.hbp + agg.sf);
const slg = (agg.h + agg.d + 2 * agg.t + 3 * agg.hr) / agg.ab;
console.log(`games ${agg.g}  R/G/team ${(agg.r / g).toFixed(2)}  AVG ${avg.toFixed(3)} OBP ${obp.toFixed(3)} SLG ${slg.toFixed(3)}`);
console.log(`K% ${((agg.so / agg.pa) * 100).toFixed(1)}  BB% ${((agg.bb / agg.pa) * 100).toFixed(1)}  HBP% ${((agg.hbp / agg.pa) * 100).toFixed(1)}  HR/G(both) ${((agg.hr / agg.g)).toFixed(2)}  2B/G ${(agg.d / agg.g).toFixed(2)} 3B/G ${(agg.t / agg.g).toFixed(2)}`);
console.log(`SB/G ${(agg.sb / agg.g).toFixed(2)} CS/G ${(agg.cs / agg.g).toFixed(2)} SAC/G ${(agg.sac / agg.g).toFixed(2)} SF/G ${(agg.sf / agg.g).toFixed(2)} E/G/team ${(agg.e / g).toFixed(2)}  pitches/G/team ${(agg.np / g).toFixed(0)}  pitchers/G/team ${(agg.pitchers / g).toFixed(2)}  inn ${(agg.inn / agg.g).toFixed(2)}`);
console.log(`A win% ${(winsA / N).toFixed(3)}`);
const f = (a: number, b: number) => ((a / b) * 100).toFixed(1) + '%';
console.log(`pitches/PA ${(pd.n / agg.pa).toFixed(2)} zone ${f(pd.zone, pd.n)} swing ${f(pd.swing, pd.n)} z-swing ${f(pd.zswing, pd.zone)} o-swing ${f(pd.oswing, pd.o)} contact ${f(pd.contact, pd.swing)} z-con ${f(pd.zcontact, pd.zswing)} o-con ${f(pd.ocontact, pd.oswing)} foul ${f(pd.foul, pd.n)} inplay ${f(pd.inplay, pd.n)} called ${f(pd.called, pd.n)} ball ${f(pd.ball, pd.n)}`);
const babip = (agg.h - agg.hr) / (agg.ab - agg.so - agg.hr + agg.sf);
console.log(`BABIP ${babip.toFixed(3)}  BIP kinds ${Object.entries(bk).map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log(Object.entries(br).sort().map(([k, v]) => `${k}=${v}`).join(' '));

// 快速模拟标定：得分 ~ base*exp(d/scale)，d = 攻 - (0.62投 + 0.38守)
if (process.argv[4] === 'fit') {
  const pts: { d: number; r: number }[] = [];
  for (let k = 0; k < 60; k++) {
    const qa = randInt(25, 62);
    const qb = randInt(25, 62);
    const A = makeTeam(qa);
    const B = makeTeam(qb);
    const sa = strengthOf(A);
    const sb = strengthOf(B);
    let ra = 0;
    let rb = 0;
    let inn = 0;
    const n = 40;
    for (let i = 0; i < n; i++) {
      const s = playGame(A, B);
      ra += s.score[0];
      rb += s.score[1];
      inn += s.innings;
    }
    const per9 = 9 / (inn / n);
    pts.push({ d: sa.off - (0.62 * sb.pit + 0.38 * sb.def), r: (ra / n) * per9 });
    pts.push({ d: sb.off - (0.62 * sa.pit + 0.38 * sa.def), r: (rb / n) * per9 });
  }
  // 最小二乘拟合 ln(r) = a + b d
  const xs = pts.map((p) => p.d);
  const ys = pts.map((p) => Math.log(Math.max(0.2, p.r)));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  console.log(`FIT: runs/9 = ${Math.exp(a).toFixed(3)} * exp(d / ${(1 / b).toFixed(2)})  → per-inning base ${(Math.exp(a) / 9).toFixed(3)}; d range ${Math.min(...xs).toFixed(1)}..${Math.max(...xs).toFixed(1)}`);
}

// 强弱差测试：完整引擎 vs 快速模拟
for (const [qa, qb] of [[50, 40], [55, 35], [45, 42], [60, 30]] as const) {
  const A = makeTeam(qa);
  const B = makeTeam(qb);
  const sa = strengthOf(A);
  const sb = strengthOf(B);
  let w = 0;
  let wq = 0;
  let runsA = 0;
  let runsB = 0;
  let qra = 0;
  let qrb = 0;
  const n = 200;
  for (let i = 0; i < n; i++) {
    const s = playGame(A, B);
    if (s.winner === 0) w++;
    runsA += s.score[0];
    runsB += s.score[1];
    const q = quickGame(sa, sb, false);
    if (q.sa > q.sb) wq++;
    qra += q.sa;
    qrb += q.sb;
  }
  console.log(`q${qa} vs q${qb}: str ${sa.total.toFixed(1)} vs ${sb.total.toFixed(1)} | engine win ${(w / n).toFixed(2)} runs ${(runsA / n).toFixed(1)}-${(runsB / n).toFixed(1)} | quick win ${(wq / n).toFixed(2)} runs ${(qra / n).toFixed(1)}-${(qrb / n).toFixed(1)}`);
}
