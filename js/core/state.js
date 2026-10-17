/* 游戏状态：新建、日期换算、常用查询、存档 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U;
  const G = (RS.G = {});

  G.BASE_YEAR = 2026;
  G.SAVE_KEY = 'research-sim-save-v1';
  G.SETTINGS_KEY = 'research-sim-settings-v1';
  G.VERSION = 1;

  // ---------- 日期（每月 30 天、每年 360 天；day=0 为 2026 年 1 月 1 日） ----------
  G.dayOf = (m, d) => (m - 1) * 30 + (d - 1);
  G.doy = g => g.day % 360;
  G.month = g => Math.floor((g.day % 360) / 30) + 1;
  G.dom = g => (g.day % 30) + 1;
  G.yearOfDay = day => G.BASE_YEAR + Math.floor(day / 360);
  G.calYear = g => G.yearOfDay(g.day);
  G.careerYear = g => Math.floor((g.day - g.startDay) / 360) + 1;
  G.piAge = g => g.pi.age0 + Math.floor((g.day - g.startDay) / 360);
  G.dateStr = day => `${G.yearOfDay(day)}年${Math.floor((day % 360) / 30) + 1}月${(day % 30) + 1}日`;
  G.monthStr = day => `${G.yearOfDay(day)}年${Math.floor((day % 360) / 30) + 1}月`;
  G.mdStr = day => `${Math.floor((day % 360) / 30) + 1}月${(day % 30) + 1}日`;
  // 从 fromDay（含）开始，下一个 m 月 d 日对应的绝对日
  G.nextDate = (fromDay, m, d) => {
    const doy = G.dayOf(m, d);
    let x = Math.floor(fromDay / 360) * 360 + doy;
    if (x < fromDay) x += 360;
    return x;
  };
  G.daysText = n => (n <= 0 ? '今天' : n < 30 ? `${n} 天后` : n < 360 ? `${Math.round(n / 30)} 个月后` : `${(n / 360).toFixed(1)} 年后`);

  // ---------- 配置查询 ----------
  G.region = g => RS.REGIONS[g.region];
  G.area = g => RS.AREAS[g.areaId];
  G.tierCfg = g => G.region(g).tiers[g.tier];
  G.money = (g, v) => G.region(g).money(v);
  G.topic = (g, id) => G.area(g).topics.find(t => t.id === id) || G.area(g).topics[0];
  G.titleName = g => G.region(g).titles[g.pi.title];
  G.perk = g => RS.PERKS.find(p => p.id === g.perk) || RS.PERKS[0];
  G.grantDef = (g, id) => G.region(g).grants.find(x => x.id === id);
  G.gpuSpec = (g, id) => G.region(g).gpus.find(x => x.id === id);
  G.nid = (g, prefix) => prefix + g.nextId++;

  G.member = (g, id) => g.members.find(m => m.id === id) || null;
  G.project = (g, id) => g.projects.find(p => p.id === id) || null;
  G.personName = (g, id) => {
    const m = G.member(g, id) || g.alumni.find(a => a.id === id);
    return m ? m.name : '前成员';
  };
  G.desks = g => RS.ROOMS[g.room].desks;
  G.computeUnits = g => {
    let u = 0;
    for (const id in g.gpus) {
      const s = G.gpuSpec(g, id);
      if (s) u += s.units * g.gpus[id];
    }
    return u + g.cloud * G.region(g).cloud.units;
  };
  G.hasWon = (g, id) => g.grantLog.some(x => x.id === id && x.won);
  G.wonWithin = (g, id, days) => g.grantLog.some(x => x.id === id && x.won && g.day - x.d < days);
  // 管理费比例：到账金额 = 总额 × (1 - 管理费)
  G.overhead = (g, kind) => {
    const oh = G.region(g).overhead || {};
    return oh[kind || 'grant'] != null ? oh[kind || 'grant'] : oh.grant || 0;
  };
  G.timesApplied = (g, id) => g.grantLog.filter(x => x.id === id).length + g.proposals.filter(p => p.id === id).length;
  G.activeInGroup = (g, group) => g.grants.filter(x => x.group === group).length + g.proposals.filter(p => p.group === group).length;

  // ---------- 考核指标 ----------
  G.METRIC_NAMES = {
    papersA: 'A 类论文', funding: '累计获批经费', phd: '博士生（含毕业）', students: '研究生（含毕业）',
    teaching: '平均教学评分', rep: '学术声望', nsfc: '主持国自然项目',
  };
  G.metric = (g, key) => {
    switch (key) {
      case 'papersA': return g.stats.pubs.A;
      case 'funding': return g.stats.grantTotal;
      case 'phd': return g.members.filter(m => m.role === 'phd').length + g.stats.phdGrads;
      case 'students': return g.members.filter(m => m.role === 'phd' || m.role === 'ms').length + g.stats.phdGrads + g.stats.msGrads;
      case 'teaching': return g.teaching.evals.length ? U.avg(g.teaching.evals) : 3.0;
      case 'rep': return g.rep;
      case 'nsfc': return g.grantLog.filter(x => x.won && x.nsfc).length;
      default: return 0;
    }
  };
  G.metricFmt = (g, key, v) => (key === 'funding' ? G.money(g, v) : key === 'teaching' ? v.toFixed(2) : key === 'rep' ? String(Math.floor(v)) : String(v));

  // ---------- 日志 ----------
  G.log = (g, text, kind) => {
    g.logs.unshift({ d: g.day, t: text, k: kind || 'info' });
    if (g.logs.length > 150) g.logs.length = 150;
    RS.bus.emit('log', { text, kind: kind || 'info' });
  };
  G.milestone = (g, text) => {
    g.timeline.push({ d: g.day, t: text });
  };
  G.queue = (g, item) => {
    item.qid = G.nid(g, 'q');
    g.queue.push(item);
    g.lastBlockDay = g.day;
    RS.bus.emit('queue', item);
  };
  G.schedule = (g, day, kind, data) => {
    g.schedule.push({ day, kind, data: data || {} });
  };

  // ---------- 新游戏 ----------
  G.newGame = function (o) {
    const R = RS.REGIONS[o.region];
    const T = R.tiers[o.tier];
    const A = RS.AREAS[o.areaId];
    const perk = RS.PERKS.find(p => p.id === o.perk) || RS.PERKS[0];
    const startDay = G.dayOf(R.start[0], R.start[1]);
    const g = {
      version: G.VERSION, nextId: 1, created: Date.now(), savedAt: Date.now(),
      region: o.region, tier: o.tier, areaId: o.areaId, perk: perk.id,
      labName: o.labName || 'PIXEL Lab',
      day: startDay, startDay,
      startup: T.startup, funds: T.startup, rep: 10 + (perk.rep || 0),
      pi: {
        name: o.piName || '你', age0: R.piAge, avatar: o.avatar || RS.randomAvatar(),
        stats: { research: 55, writing: 50, network: 35, teaching: 40 },
        energy: 90, title: 0, tenured: false, tenureDay: 0, promoDay: 0,
      },
      members: [], alumni: [], projects: [], papers: [],
      grants: [], proposals: [], grantLog: [],
      facilities: {}, room: 0, gpus: {}, cloud: 0,
      policies: {
        focus: 'mentor', intensity: 'normal', meeting: 'weekly', topic: 'core',
        coreTopic: o.coreTopic || A.topics[0].id, submit: 'balanced', rebuttal: 'auto', travel: 'student', auto: 'off',
      },
      topics: {}, expertise: {},
      queue: [], schedule: [], cooldowns: {}, flags: {},
      stats: { cites: 0, h: 0, pubs: { A: 0, B: 0, C: 0, W: 0, P: 0 }, bestPapers: 0, submissions: 0, rejects: 0, grantsWon: 0, grantTotal: 0, phdGrads: 0, msGrads: 0, profGrads: 0, peak: 0 },
      year: null,
      history: [],
      teaching: { current: null, evals: [], count: 0 },
      services: [],
      logs: [], achievements: {}, titles: [], honors: [], timeline: [],
      lastBlockDay: startDay, evalDone: {}, ended: null,
    };
    g.year = G.freshYear(g);
    for (const k in perk.stats || {}) g.pi.stats[k] += perk.stats[k];
    if (perk.gpu) g.gpus[perk.gpu] = 1;
    A.topics.forEach(t => {
      g.topics[t.id] = { heat: U.clamp(t.heat * U.range(0.85, 1.15), 0.3, 4) };
      g.expertise[t.id] = 0;
    });
    g.expertise[g.policies.coreTopic] = 2;
    return g;
  };
  G.freshYear = g => ({ papersA: 0, papers: 0, cites0: g.stats.cites, grants: 0, income: 0, expense: 0, rejects: 0, subs: 0, joined: 0, grads: 0 });

  // ---------- 存档 ----------
  G.save = g => {
    if (!g) return false;
    g.savedAt = Date.now();
    try {
      localStorage.setItem(G.SAVE_KEY, JSON.stringify(g));
      return true;
    } catch (e) {
      console.error('存档失败', e);
      return false;
    }
  };
  G.load = () => {
    try {
      const s = localStorage.getItem(G.SAVE_KEY);
      return s ? G.migrate(JSON.parse(s)) : null;
    } catch (e) {
      console.error('读档失败', e);
      return null;
    }
  };
  G.migrate = g => {
    if (!g || typeof g !== 'object' || g.version !== G.VERSION || !RS.REGIONS[g.region] || !RS.AREAS[g.areaId]) return null;
    return g;
  };
  G.clearSave = () => {
    try { localStorage.removeItem(G.SAVE_KEY); } catch (e) { /* ignore */ }
  };

  // ---------- 设置（与存档分开保存） ----------
  G.DEFAULT_SETTINGS = { sound: true, volume: 0.5, zoom: 1, offline: true, yearSummary: true, speed: 1, notify: true };
  G.loadSettings = () => {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(G.SETTINGS_KEY) || '{}') || {}; } catch (e) { s = {}; }
    return Object.assign({}, G.DEFAULT_SETTINGS, s);
  };
  G.saveSettings = s => {
    try { localStorage.setItem(G.SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* ignore */ }
  };
})();
