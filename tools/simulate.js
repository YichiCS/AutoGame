// 无界面数值模拟：自动玩若干局，用来调平衡。
// 用法：node tools/simulate.js [地区 us|cn] [方向 ml|cv|...] [学校 0|1|2] [年数] [局数] [策略 smart|lazy]
// 例：  node tools/simulate.js us ml 1 8 5 smart
const fs = require('fs');
const path = require('path');
const vm = require('vm');

global.window = global;
global.localStorage = { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } };
const root = path.join(__dirname, '..');
['js/core/util.js', 'js/data/areas.js', 'js/data/regions.js', 'js/data/content.js', 'js/data/events.js', 'js/core/state.js', 'js/core/systems.js', 'js/core/career.js', 'js/core/sim.js']
  .forEach(f => vm.runInThisContext(fs.readFileSync(path.join(root, f), 'utf8'), { filename: f }));
const { G, Sys: S, Sim } = global.RS;

const [region = 'us', areaId = 'ml', tierArg = '1', yearsArg = '8', runsArg = '3', mode = 'smart'] = process.argv.slice(2);
const tier = +tierArg, years = +yearsArg, runs = +runsArg;

// 一个“认真玩”的简单策略：管精力、买算力和设施、扩建、缺钱时找企业
function strategy(g) {
  if (mode !== 'smart') return;
  const ctx = S.dayContext(g);
  if (g.pi.energy < 25) g.policies.focus = 'rest';
  else if (g.pi.energy > 65) g.policies.focus = 'mentor';
  if (G.area(g).compute >= 0.3 && ctx.ratio < 1 && g.funds > g.startup * 0.25) {
    const pick = S.gpuAvailable(g).filter(x => S.gpuPrice(g, x) < g.funds * 0.3).sort((a, b) => b.units / b.price - a.units / a.price)[0];
    if (pick) S.buyGpu(g, pick.id);
  }
  RS.FACILITIES.forEach(f => { if (!g.facilities[f.id] && S.facilityCost(g, f) < g.funds * 0.05) S.buyFacility(g, f.id); });
  const next = RS.ROOMS[g.room + 1];
  if (g.members.length >= G.desks(g) - 1 && next && g.funds > S.roomCost(g, next) * 3) S.expandRoom(g);
  if (S.runway(g) < 12) S.seekContract(g);
  if (g.members.length < G.desks(g) - 1) S.ugPool(g);
}

function play() {
  const g = G.newGame({ piName: 'Sim', labName: 'SIM Lab', region, tier, areaId, perk: 'postdoc' });
  g.policies.auto = 'all';
  S.setupNewGame(g);
  const end = g.day + years * 360;
  let tenure = '-';
  while (g.day < end) {
    let guard = 0;
    while (g.queue.length && guard++ < 50) {
      const it = g.queue[0];
      if (it.type === 'eval') { if (it.kind === 'final') tenure = it.result; Sim.resolve(g, it); }
      else if (it.type === 'ending') { Sim.resolve(g, it, it.kind === 'retire' ? 'continue' : 'stop'); if (it.kind === 'fail') return { g, tenure: 'fail' }; }
      else Sim.autoOne(g, it);
    }
    Sim.tick(g);
    if (G.dom(g) === 1) strategy(g);
  }
  return { g, tenure };
}

const rows = [];
for (let i = 0; i < runs; i++) {
  const { g, tenure } = play();
  rows.push({ tenure, A: g.stats.pubs.A, papers: g.papers.length, cites: g.stats.cites, h: g.stats.h, rep: Math.round(g.rep), funds: G.money(g, g.funds), members: g.members.length, grants: g.stats.grantsWon });
}
console.log(`${region} / ${areaId} / ${RS.REGIONS[region].tiers[tier].name} / ${years} 年 / 策略 ${mode}`);
console.table(rows);
