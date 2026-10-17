/* 模拟主循环：每天一个 tick；决策队列的处理与托管 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G, S = RS.Sys;
  const Sim = (RS.Sim = {});

  Sim.blocked = g => !g || g.queue.length > 0 || (!!g.ended && !g.flags.continued);

  Sim.tick = function (g) {
    g.day++;
    const doy = G.doy(g);
    if (doy % 30 === 0) {
      S.monthly(g);
      S.trendsMonthly(g);
      g.stats.h = S.hIndex(g);
      if (g.flags.gpuPriceUntil && g.flags.gpuPriceUntil <= g.day) { g.flags.gpuPriceMult = 1; g.flags.gpuPriceUntil = 0; }
    }
    Sim.runSchedule(g);
    Sim.calendar(g, doy);
    const ctx = S.dayContext(g);
    for (const m of g.members.slice()) S.memberDaily(g, m, ctx);
    for (const m of g.members.slice()) S.memberWork(g, m, ctx);
    S.piDaily(g, ctx);
    if (g.phd) S.phdDaily(g);
    S.proposalsDaily(g);
    S.projectsDaily(g);
    S.checkRush(g);
    if (g.day % 7 === 0) {
      S.citationsUpdate(g, 7);
      S.checkAchievements(g);
    }
    Sim.rollEvents(g);
    Sim.autoResolve(g);
    RS.bus.emit('tick', g);
  };

  Sim.calendar = function (g, doy) {
    const R = G.region(g);
    R.semesters.forEach(s => {
      const st = G.dayOf(s.start[0], s.start[1]);
      if (doy === st) S.semesterStart(g, s);
      if (doy === (st + s.len) % 360) S.semesterEnd(g, s);
    });
    R.holidays.forEach(h => { if (doy === G.dayOf(h.date[0], h.date[1])) S.holidayStart(g, h); });
    R.recruit.forEach(c => { if (doy === G.dayOf(c.open[0], c.open[1])) S.openRecruit(g, c); });
    S.checkGrantCalls(g);
    if (doy === G.dayOf(R.gradDate[0], R.gradDate[1])) S.graduationSeason(g);
    if (doy === G.dayOf(R.evalDate[0], R.evalDate[1])) S.annualCheck(g);
    if (doy === 359) S.yearEnd(g);
  };

  Sim.runSchedule = function (g) {
    if (!g.schedule.length) return;
    const due = g.schedule.filter(x => x.day <= g.day);
    if (!due.length) return;
    g.schedule = g.schedule.filter(x => x.day > g.day);
    for (const it of due) {
      try {
        if (it.kind === 'recruitResult') S.recruitResult(g, it.data);
        else if (it.kind === 'join') S.joinCandidate(g, it.data.cand);
        else if (it.kind === 'postdocPool') S.postdocPool(g);
        else if (it.kind === 'scandal') Sim.scandal(g, it.data);
        else if (it.kind === 'phdMarket') S.phdMarketResult(g);
      } catch (e) {
        console.error('schedule error', it, e);
      }
    }
  };

  Sim.scandal = function (g, data) {
    const pa = g.papers.find(p => p.id === data.paperId);
    if (!pa || pa.retracted) return;
    pa.retracted = true;
    g.stats.pubs[pa.tier] = Math.max(0, (g.stats.pubs[pa.tier] || 0) - 1);
    g.stats.cites = Math.max(0, g.stats.cites - pa.cites);
    S.addRep(g, -(RS.TIERS[pa.tier].rep * 2 + 10));
    S.labMood(g, -8);
    G.log(g, `《${S.short(pa.title)}》被发现结果无法复现，已被撤稿！`, 'bad');
    G.milestone(g, `论文《${pa.title}》被撤稿`);
    G.queue(g, { type: 'notice', tone: 'bad', icon: 'warn', title: '撤稿丑闻', text: `有人发现《${U.esc(pa.title)}》的结果无法复现，一路追查，找到了那个被你“装作没看见”的 bug。<br>论文被撤稿，你的声望大受打击。` });
  };

  // ---------- 随机事件 ----------
  Sim.eventWeight = (g, e) => {
    try { return typeof e.weight === 'function' ? e.weight(g) : e.weight || 0; } catch (err) { return 0; }
  };
  Sim.rollEvents = function (g) {
    if (Sim.blocked(g)) return;
    if (g.day - g.lastBlockDay < 10) return;
    if (!U.chance(1 / 20)) return;
    const phd = !!g.phd;
    const ids = Object.keys(RS.EVENTS).filter(id => RS.EVENTS[id].weight && !!RS.EVENTS[id].phd === phd && (g.cooldowns['ev_' + id] || 0) <= g.day);
    for (let tries = 0; tries < 6 && ids.length; tries++) {
      const id = U.weighted(ids, k => Sim.eventWeight(g, RS.EVENTS[k]));
      if (!id) return;
      ids.splice(ids.indexOf(id), 1);
      const e = RS.EVENTS[id];
      let ctx = null;
      try { ctx = e.ctx ? e.ctx(g) : {}; } catch (err) { console.error('event ctx', id, err); ctx = null; }
      if (!ctx) continue;
      g.cooldowns['ev_' + id] = g.day + (e.cd || 120);
      if (e.instant && e.instant(g, ctx)) return;
      if (!e.build) return;
      let ev = null;
      try { ev = e.build(g, ctx); } catch (err) { console.error('event build', id, err); }
      if (!ev) continue;
      G.queue(g, { type: 'event', id, ctx });
      return;
    }
  };

  Sim.buildEvent = function (g, item) {
    const def = RS.EVENTS[item.id];
    if (!def) return null;
    try { return def.build(g, item.ctx); } catch (e) { console.error('build', item.id, e); return null; }
  };

  // ---------- 决策处理 ----------
  Sim.resolve = function (g, item, payload) {
    const i = g.queue.indexOf(item);
    if (i < 0) return;
    g.queue.splice(i, 1);
    try {
      switch (item.type) {
        case 'event': {
          const ev = Sim.buildEvent(g, item);
          const ch = ev && ev.choices[payload];
          if (ch && !ch.disabled && ch.apply) ch.apply(g, item.ctx);
          break;
        }
        case 'grants':
          for (const id of item.ids) {
            const eff = payload && payload[id];
            if (eff === 'full' || eff === 'normal') S.applyGrant(g, id, eff, item.deadlines[id]);
          }
          break;
        case 'recruit':
          S.confirmOffers(g, item);
          break;
        case 'pool':
          S.hirePool(g, item, payload || []);
          break;
        case 'venue': {
          const p = G.project(g, item.pid);
          if (!p) break;
          p.asking = false;
          if (payload && payload.v) S.setTarget(g, p, payload.v, payload.day);
          else {
            const t = S.autoTarget(g, p);
            if (t) p.target = t;
          }
          break;
        }
        case 'ending':
          if (payload === 'continue') g.flags.continued = true;
          break;
        case 'jobmarket':
          S.phdMarketResolve(g, item, payload);
          break;
        default:
          break;
      }
    } catch (e) {
      console.error('resolve error', item, e);
    }
    g.lastBlockDay = g.day;
    Sim.autoResolve(g);
  };

  // ---------- 托管 ----------
  Sim.canAuto = function (g, item, mode) {
    // 博士阶段：导师实验室里的事都由导师处理，只有和你有关的才会问你
    if (g.phd && !S.playerFacing(g, item)) return true;
    if (item.type === 'jobmarket') return false;
    if (mode === 'off') return false;
    if (item.type === 'eval' || item.type === 'ending') return false;
    if (item.type === 'event') {
      const def = RS.EVENTS[item.id];
      if (!def) return true;
      if (item.id === 'welcome') return false;
      return def.minor || mode === 'all';
    }
    if (item.type === 'summary') return true;
    return mode === 'all';
  };

  Sim.autoChoice = function (ev) {
    let i = ev.choices.findIndex(c => c.def && !c.disabled);
    if (i < 0) i = ev.choices.findIndex(c => !c.disabled);
    return Math.max(0, i);
  };

  Sim.autoOne = function (g, item) {
    // 博士阶段：导师的事由导师按自己的风格（带点随机）决定，不写进你的托管日志
    if (g.phd && !S.playerFacing(g, item)) { S.advisorDecide(g, item); return; }
    const quiet = false;
    const log = (text, kind) => { if (!quiet) G.log(g, text, kind); };
    switch (item.type) {
      case 'event': {
        const ev = Sim.buildEvent(g, item);
        if (!ev) { Sim.resolve(g, item, 0); return; }
        const i = Sim.autoChoice(ev);
        log(`[托管] ${ev.title} → ${ev.choices[i].label}`, 'auto');
        Sim.resolve(g, item, i);
        return;
      }
      case 'grants': {
        const pay = {};
        const groups = {};
        const effort = g.pi.energy > 45 ? 'full' : 'normal';
        item.ids.map(id => G.grantDef(g, id)).filter(d => !S.grantElig(g, d))
          .sort((a, b) => b.amount - a.amount)
          .forEach(d => {
            if (d.group) { if (groups[d.group]) return; groups[d.group] = true; }
            pay[d.id] = effort;
          });
        log(`[托管] 基金申请：${Object.keys(pay).map(id => G.grantDef(g, id).name).join('、') || '不申请'}`, 'auto');
        Sim.resolve(g, item, pay);
        return;
      }
      case 'recruit': {
        const free = Math.max(1, G.desks(g) - g.members.length + 1);
        const left = Object.assign({}, item.quota);
        item.offers = [];
        item.cands.slice().sort((a, b) => b.q * b.accept - a.q * a.accept).forEach(c => {
          if (item.offers.length >= free || left[c.role] <= 0) return;
          left[c.role]--;
          item.offers.push(c.cid);
        });
        Sim.resolve(g, item);
        return;
      }
      case 'pool': {
        const best = item.cands.slice().sort((a, b) => b.q - a.q)[0];
        const ok = best && g.members.length < G.desks(g) && (item.role !== 'postdoc' || S.runway(g) > 18);
        Sim.resolve(g, item, ok ? [best.cid] : []);
        return;
      }
      default:
        Sim.resolve(g, item);
    }
  };

  Sim.autoResolve = function (g) {
    const mode = g.policies.auto;
    // 博士阶段：导师的事不管你开没开托管，都由导师自己拿主意
    if (Sim._autoBusy || (mode === 'off' && !g.phd)) return;
    Sim._autoBusy = true;
    try {
      let guard = 0;
      let item;
      while (guard++ < 30 && (item = g.queue.find(q => Sim.canAuto(g, q, mode)))) Sim.autoOne(g, item);
    } finally {
      Sim._autoBusy = false;
    }
  };

  // 离线进度：从上次存档到现在，按 1 倍速推进，遇到需要决定的事就停
  Sim.catchUp = function (g, days) {
    let n = 0;
    while (n < days && !Sim.blocked(g)) {
      Sim.tick(g);
      n++;
    }
    return n;
  };
})();
