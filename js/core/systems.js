/* 核心系统（一）：成员、课题、投稿审稿、引用、算力、设施、财务 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G;
  const S = (RS.Sys = {});

  S.ROLE_NAMES = { phd: '博士生', ms: '硕士生', ug: '本科生', postdoc: '博士后', visit: '访问学生' };
  const ROLE_OFFSET = { phd: 0, ms: -8, ug: -16, postdoc: 14, visit: -4 };
  const ROLE_WORK = { phd: 1, ms: 0.9, ug: 0.6, postdoc: 1.1, visit: 0.85 };
  const ROLE_YEARS = { ms: 2, ug: 1.5, postdoc: 2, visit: 1 };
  S.PHASE_NAMES = { idea: '构思', exp: '实验', write: '写作', ready: '待投稿', review: '审稿中' };
  S.WORK_PHASES = ['idea', 'exp', 'write'];
  const STAT_OF = { idea: 'idea', exp: 'code', write: 'write' };
  const GROW = { idea: 0.04, exp: 0.016, write: 0.035 };
  const NEED_MULT = 1.7;
  S.soft = s => Math.max(0.03, Math.pow(Math.max(0, (100 - s) / 50), 1.5));

  S.fundName = (g, f) => (g.region === 'cn' ? { ra: '助研补贴', ta: '助教', fellow: '奖学金', self: '无需资助' } : { ra: 'RA', ta: 'TA', fellow: 'Fellowship', self: '无需资助' })[f] || f;

  // ---------- 特质 ----------
  const tMul = (m, key) => {
    let v = 1;
    for (const t of m.traits) { const d = RS.TRAITS[t]; if (d && typeof d[key] === 'number') v *= d[key]; }
    return v;
  };
  const tAdd = (m, key) => {
    let v = 0;
    for (const t of m.traits) { const d = RS.TRAITS[t]; if (d && typeof d[key] === 'number') v += d[key]; }
    return v;
  };
  const tPhase = (m, ph) => {
    let v = 1;
    for (const t of m.traits) { const d = RS.TRAITS[t]; if (d && d.phase && d.phase[ph]) v *= d.phase[ph]; }
    return v;
  };
  S.tMul = tMul; S.tAdd = tAdd;
  const short = t => (t.length > 34 ? t.slice(0, 32) + '…' : t);
  S.short = short;

  S.spend = (g, v) => { g.funds -= v; g.year.expense += v; };
  S.earn = (g, v) => { g.funds += v; g.year.income += v; };
  S.addRep = (g, v) => { g.rep = Math.max(0, g.rep + v); };
  S.addEnergy = (g, v) => { g.pi.energy = U.clamp(g.pi.energy + v, 0, 100); };
  S.addMood = (m, v) => { if (m) m.mood = U.clamp(m.mood + v, 0, 100); };
  S.labMood = (g, v) => g.members.forEach(m => S.addMood(m, v));

  // ---------- 成员 ----------
  const clampStat = v => U.clamp(Math.round(v), 8, 95);
  S.genStats = q => ({ idea: clampStat(q + U.normal(0, 9)), code: clampStat(q + U.normal(0, 9)), write: clampStat(q + U.normal(0, 9)) });

  S.defaultFunding = (g, role) => {
    if (role === 'phd' || role === 'postdoc') return 'ra';
    if (role === 'ms') return g.region === 'cn' ? 'ra' : 'self';
    return 'self';
  };

  S.createMember = function (g, role, o) {
    o = o || {};
    const q = (o.q != null ? o.q : 50) + (o.stats ? 0 : ROLE_OFFSET[role]);
    const traits = o.traits || RS.randomTraits(q);
    const stats = o.stats ? Object.assign({}, o.stats) : S.genStats(q);
    if (!o.stats && traits.includes('mathy')) stats.idea = clampStat(stats.idea + 6);
    const startDay = o.startDay != null ? o.startDay : g.day;
    const m = {
      id: G.nid(g, 'm'), name: o.name || RS.randomName(g.region), role,
      avatar: o.avatar || RS.randomAvatar(),
      joinDay: g.day, startDay,
      stats, pot: o.pot || U.range(0.8, 1.25), mood: o.mood || U.int(68, 85),
      traits, funding: o.funding || S.defaultFunding(g, role), fellowUntil: o.fellowUntil || 0,
      projectId: null, status: 'active', awayUntil: 0, awayWhy: '', remoteUntil: 0, preUntil: o.preUntil || 0,
      pubs: 0, pubsA: 0, school: o.school || '',
      lowMood: 0, quitCd: 0, salaryMult: 1, desk: -1,
      endDay: ROLE_YEARS[role] ? startDay + Math.round(ROLE_YEARS[role] * 360) : 0,
      internYear: 0, talkCd: 0, bonusCd: 0, extended: 0,
    };
    return m;
  };

  S.memberYears = (g, m) => Math.max(0, (g.day - m.startDay) / 360);
  S.memberYearLabel = (g, m) => {
    if (m.preUntil && g.day < m.preUntil) return '预备生';
    return `第 ${Math.floor(S.memberYears(g, m)) + 1} 年`;
  };

  S.salary = (g, m) => {
    if (m.status === 'intern') return 0;
    if (m.funding !== 'ra') return 0;
    if (m.preUntil && g.day < m.preUntil) return 0;
    return Math.round((G.region(g).costs[m.role] || 0) * m.salaryMult);
  };

  S.addMember = function (g, m, silent) {
    g.members.push(m);
    S.assignDesks(g);
    g.stats.peak = Math.max(g.stats.peak, g.members.length);
    g.year.joined++;
    if (!silent) G.log(g, `${m.name}（${S.ROLE_NAMES[m.role]}）加入了实验室！`, 'good');
    RS.bus.emit('member_join', m);
  };

  S.assignDesks = function (g) {
    const n = G.desks(g);
    const used = new Set();
    g.members.forEach(m => {
      if (m.desk >= 0 && m.desk < n && !used.has(m.desk)) used.add(m.desk);
      else m.desk = -1;
    });
    g.members.forEach(m => {
      if (m.desk !== -1) return;
      for (let i = 0; i < n; i++) if (!used.has(i)) { m.desk = i; used.add(i); return; }
    });
  };

  S.releaseMemberProjects = function (g, m) {
    for (const p of g.projects.slice()) {
      if (p.helpers.includes(m.id)) p.helpers = p.helpers.filter(x => x !== m.id);
      if (p.lead !== m.id) continue;
      if (!S.WORK_PHASES.includes(p.phase)) continue; // 已完成的论文继续走投稿流程
      const heir = p.helpers.map(id => G.member(g, id)).find(h => h && (h.role === 'phd' || h.role === 'postdoc' || h.role === 'ms'));
      if (heir) {
        p.lead = heir.id;
        p.helpers = p.helpers.filter(x => x !== heir.id);
        heir.projectId = p.id;
        G.log(g, `${heir.name} 接手了课题《${short(p.title)}》`, 'info');
      } else {
        S.abandonProject(g, p, `因 ${m.name} 离开而中止`);
      }
    }
  };

  S.abandonProject = function (g, p, why) {
    const i = g.projects.indexOf(p);
    if (i >= 0) g.projects.splice(i, 1);
    [p.lead].concat(p.helpers).forEach(id => {
      const mm = G.member(g, id);
      if (mm && mm.projectId === p.id) mm.projectId = null;
    });
    G.log(g, `课题《${short(p.title)}》${why || '被放弃了'}`, 'bad');
  };

  S.removeMember = function (g, m, reason, dest) {
    const i = g.members.indexOf(m);
    if (i < 0) return;
    g.members.splice(i, 1);
    S.releaseMemberProjects(g, m);
    g.alumni.unshift({
      id: m.id, name: m.name, role: m.role, avatar: m.avatar, joinDay: m.joinDay, startDay: m.startDay,
      leftDay: g.day, reason, dest: dest || '', pubs: m.pubs, pubsA: m.pubsA,
    });
    if (g.alumni.length > 100) g.alumni.length = 100;
    S.assignDesks(g);
    RS.bus.emit('member_leave', { m, reason });
  };

  // ---------- 课题 ----------
  S.pickTopic = function (g) {
    const A = G.area(g);
    const pol = g.policies.topic;
    if (g.flags.trendTopic && g.flags.trendUntil > g.day && U.chance(0.5)) return g.flags.trendTopic;
    if (pol === 'core') {
      if (U.chance(0.7)) return g.policies.coreTopic;
      return U.weighted(A.topics, t => 1 + (g.expertise[t.id] || 0) * 0.5).id;
    }
    if (pol === 'hot') return U.weighted(A.topics, t => Math.pow(g.topics[t.id].heat, 2.2)).id;
    return U.pick(A.topics).id;
  };

  S.genTitle = function (g, tid) {
    const A = G.area(g);
    const T = G.topic(g, tid);
    const P = RS.TITLE_PARTS;
    const tpl = A.templates && U.chance(0.7) ? U.pick(A.templates) : U.pick(P.templates);
    return tpl.replace('{Adj}', U.pick(P.adj)).replace('{Method}', U.pick(A.methods)).replace('{Task}', U.pick(T.en))
      .replace('{Acr}', U.pick(P.acr)).replace('{Noun}', U.pick(P.noun));
  };

  S.newProject = function (g, lead, tid) {
    const A = G.area(g);
    tid = tid || S.pickTopic(g);
    const scale = { phd: 1, postdoc: 1, ms: 0.9, ug: 0.75, visit: 0.85 }[lead.role] || 1;
    const need = {};
    S.WORK_PHASES.forEach(ph => { need[ph] = Math.round(A.need[ph] * NEED_MULT * U.range(0.85, 1.15) * scale); });
    const p = {
      id: G.nid(g, 'p'), title: S.genTitle(g, tid), topic: tid,
      lead: lead.id, helpers: [], authors: [lead.id],
      phase: 'idea', prog: 0, need,
      acc: { idea: 0, exp: 0, write: 0 }, wsum: { idea: 0, exp: 0, write: 0 }, cf: { sum: 0, n: 0 },
      sc: {}, q: 0, bonus: 0, polish: 0, est: U.normal(0, 3),
      target: null, venue: null, submitDay: 0, notifyDay: 0, rebuttalDay: 0, attempts: 0, history: [],
      startDay: g.day, rush: 0, rushTarget: null, rushAsked: {}, collab: null, asking: false,
    };
    g.projects.push(p);
    lead.projectId = p.id;
    return p;
  };

  // 本科生/访问学生默认去给高年级学生打下手
  S.assignWork = function (g, m) {
    if (m.role === 'ug' || m.role === 'visit') {
      const cands = g.projects.filter(p => S.WORK_PHASES.includes(p.phase) && p.helpers.length < 2 && p.lead !== m.id &&
        (G.member(g, p.lead) || {}).role !== 'ug');
      if (cands.length) {
        const p = cands.reduce((a, b) => (a.helpers.length <= b.helpers.length ? a : b));
        p.helpers.push(m.id);
        if (!p.authors.includes(m.id)) p.authors.push(m.id);
        m.projectId = p.id;
        return p;
      }
    }
    return S.newProject(g, m);
  };

  S.joinProject = function (g, m, p) {
    const old = m.projectId ? G.project(g, m.projectId) : null;
    if (old && old.lead === m.id && S.WORK_PHASES.includes(old.phase)) return false; // 自己负责的课题不能丢
    if (old) old.helpers = old.helpers.filter(x => x !== m.id);
    if (!p.helpers.includes(m.id) && p.lead !== m.id) p.helpers.push(m.id);
    if (!p.authors.includes(m.id)) p.authors.push(m.id);
    m.projectId = p.id;
    return true;
  };

  S.phaseStat = (m, ph) => m.stats[STAT_OF[ph]] || 40;

  // 每天的实验室整体系数，只算一次
  S.dayContext = function (g) {
    const pol = g.policies;
    const fac = S.facilityTotals(g);
    const intensity = { chill: 0.85, normal: 1, crunch: 1.2 }[pol.intensity] || 1;
    const meeting = { weekly: 1.05, biweekly: 1.0, monthly: 0.95 }[pol.meeting] || 1;
    const resting = g.flags.restUntil > g.day || g.flags.sabbaticalUntil > g.day;
    const piMentor = resting ? 0.93 : pol.focus === 'mentor' && g.pi.energy >= 25 ? 1.07 : g.pi.energy < 15 ? 0.92 : 1;
    const crowd = g.members.length > G.desks(g) ? 0.93 : 1;
    const contracts = g.grants.filter(x => x.kind === 'contract').length;
    const holiday = S.isHoliday(g) ? 0.45 : 1;
    const mentor = S.mentorLoad(g);
    const labMult = intensity * meeting * piMentor * (1 + fac.prod) * crowd * Math.pow(0.93, contracts) * holiday * mentor.factor;
    const units = G.computeUnits(g);
    const demand = S.computeDemand(g);
    const teamMood = U.sum(g.members, m => (m.status === 'active' ? tAdd(m, 'teamMood') : 0));
    return {
      fac, labMult, units, demand, teamMood, resting, mentor,
      ratio: demand > 0 ? units / demand : 9,
      phaseBonus: { idea: fac.phase.idea, exp: fac.phase.exp + fac.areaBonus, write: fac.phase.write },
    };
  };

  // 指导负担：PI 的精力有限，学生太多时每个人得到的指导变少；博士后可以帮忙带学生
  S.mentorLoad = function (g) {
    const postdocs = g.members.filter(m => m.role === 'postdoc').length;
    const load = U.sum(g.members, m => (m.role === 'postdoc' ? 0 : m.role === 'ug' || m.role === 'visit' ? 0.5 : 1));
    const cap = 6 + 2.5 * postdocs + (g.pi.title >= 2 ? 2 : 0) + (g.policies.focus === 'mentor' ? 1 : 0);
    return { load, cap, factor: load > cap ? Math.sqrt(cap / load) : 1 };
  };

  S.workRate = function (g, m, ph, ctx) {
    let w = 0.4 + S.phaseStat(m, ph) / 125;
    w *= 0.6 + (0.6 * m.mood) / 100;
    w *= ctx.labMult * (1 + (ctx.phaseBonus[ph] || 0));
    w *= tMul(m, 'prod') * tPhase(m, ph) * ROLE_WORK[m.role];
    if (m.funding === 'ta') w *= 0.65;
    if (m.traits.includes('coffee')) w *= g.facilities.coffee ? 1.1 : 0.95;
    if (m.preUntil && g.day < m.preUntil) w *= 0.6;
    if (m.remoteUntil > g.day) w *= 0.7;
    return w;
  };

  S.projectDemand = (g, p) => 6 * G.area(g).compute * G.topic(g, p.topic).compute * Math.pow(1.15, Math.max(0, G.calYear(g) - G.BASE_YEAR));
  S.computeDemand = g => U.sum(g.projects, p => (p.phase === 'exp' ? S.projectDemand(g, p) : 0));
  S.computeFactor = (g, p, ctx) => (S.projectDemand(g, p) < 0.3 ? 1 : U.clamp(Math.pow(ctx.ratio, 0.6), 0.25, 1.15));

  S.grow = function (g, m, ph, w) {
    const key = STAT_OF[ph];
    const s = m.stats[key];
    const mentor = (g.policies.focus === 'mentor' ? 1.3 : 1) * ({ weekly: 1.1, biweekly: 1, monthly: 0.9 }[g.policies.meeting] || 1);
    m.stats[key] = Math.min(100, s + GROW[ph] * w * m.pot * tMul(m, 'growth') * mentor * S.soft(s));
  };
  S.bumpStat = function (m, key, v) {
    const s = m.stats[key];
    m.stats[key] = Math.min(100, s + v * S.soft(s));
  };

  S.memberWork = function (g, m, ctx) {
    if (m.status !== 'active') return;
    let p = m.projectId ? G.project(g, m.projectId) : null;
    if (!p || !S.WORK_PHASES.includes(p.phase)) {
      m.projectId = null;
      p = S.assignWork(g, m);
    }
    if (!p) return;
    const ph = p.phase;
    const lead = p.lead === m.id;
    let w = S.workRate(g, m, ph, ctx);
    if (!lead) w *= 0.5 * tMul(m, 'helper');
    else if (!p.helpers.length) w *= tMul(m, 'solo');
    if (ph === 'exp') {
      const cf = S.computeFactor(g, p, ctx);
      w *= cf;
      p.cf.sum += cf; p.cf.n++;
    }
    if (p.rush > 0) w *= 1.6 * tMul(m, 'ddl');
    p.prog += w;
    p.acc[ph] += w * S.phaseStat(m, ph);
    p.wsum[ph] += w;
    S.grow(g, m, ph, w);
    if (p.prog >= p.need[ph]) S.completePhase(g, p);
  };

  // PI 亲自下场做科研
  S.piResearch = function (g, ctx) {
    const cands = g.projects.filter(p => S.WORK_PHASES.includes(p.phase));
    if (!cands.length) return;
    const p = cands.reduce((a, b) => (a.prog / a.need[a.phase] <= b.prog / b.need[b.phase] ? a : b));
    const pi = g.pi.stats;
    const stat = p.phase === 'idea' ? pi.research : p.phase === 'exp' ? pi.research * 0.8 : pi.writing;
    let w = 0.65 * (0.5 + stat / 100);
    if (p.phase === 'exp') w *= S.computeFactor(g, p, ctx);
    p.prog += w;
    p.acc[p.phase] += w * stat;
    p.wsum[p.phase] += w;
    if (p.prog >= p.need[p.phase]) S.completePhase(g, p);
  };

  S.completePhase = function (g, p) {
    const pi = g.pi.stats;
    const lead = G.member(g, p.lead);
    const avg = ph => (p.wsum[ph] > 0 ? p.acc[ph] / p.wsum[ph] : 40);
    const exp = g.expertise[p.topic] || 0;
    const ph = p.phase;
    if (ph === 'idea') {
      p.sc.nov = 0.72 * avg('idea') + 0.28 * pi.research + exp * 0.5 + (p.bold ? 10 : 0) + U.normal(0, 5);
      p.phase = 'exp';
      if (p.bold) p.need.exp = Math.round(p.need.exp * 1.4);
      if (lead) S.bumpStat(lead, 'idea', 0.8 * lead.pot);
    } else if (ph === 'exp') {
      const cf = p.cf.n ? p.cf.sum / p.cf.n : 1;
      p.sc.sol = 0.78 * avg('exp') + 0.22 * pi.research + (Math.min(cf, 1.15) - 0.85) * 18 + exp * 0.3 + U.normal(0, 5);
      p.phase = 'write';
      if (lead) S.bumpStat(lead, 'code', 0.8 * lead.pot);
    } else if (ph === 'write') {
      p.sc.cla = 0.62 * avg('write') + 0.38 * pi.writing + (lead ? tAdd(lead, 'cla') : 0) + (p.rush > 0 ? -3 : 0) + U.normal(0, 4);
      p.q = S.calcQuality(g, p);
      if (lead) S.bumpStat(lead, 'write', 0.8 * lead.pot);
      p.phase = 'ready';
      p.readyDay = g.day;
      S.releaseProject(g, p);
      G.log(g, `《${short(p.title)}》完成了写作，准备投稿`, 'info');
      if (p.rushTarget && p.rushTarget.day >= g.day) {
        p.target = p.rushTarget;
        p.rushTarget = null;
        if (p.target.day === g.day) S.submit(g, p);
      } else {
        S.retarget(g, p);
      }
    }
    p.prog = 0;
    RS.bus.emit('phase', { p, from: ph });
  };

  S.calcQuality = function (g, p) {
    const lead = G.member(g, p.lead);
    const sc = p.sc;
    const q = 0.36 * (sc.nov || 40) + 0.38 * (sc.sol || 40) + 0.26 * (sc.cla || 40);
    return S.squash(q) + p.bonus + (lead ? tAdd(lead, 'quality') : 0) + (p.collab ? p.collab.bonus : 0);
  };
  // 高分段边际递减：好论文很多，但“完美论文”很少
  S.squash = q => (q > 70 ? 70 + (q - 70) * 0.5 : q);
  // 整个领域的门槛逐年水涨船高
  S.fieldBar = g => Math.min(14, 0.8 * Math.max(0, G.calYear(g) - G.BASE_YEAR));

  S.releaseProject = function (g, p) {
    [p.lead].concat(p.helpers).forEach(id => {
      const m = G.member(g, id);
      if (m && m.projectId === p.id) m.projectId = null;
    });
    p.helpers = [];
  };

  // 给玩家看的质量估计（带一点误差）
  S.estQuality = function (g, p) {
    if (p.phase === 'ready' || p.phase === 'review') return p.q + p.est;
    const pi = g.pi.stats;
    const lead = G.member(g, p.lead);
    const st = lead ? lead.stats : { idea: 45, code: 45, write: 45 };
    const exp = g.expertise[p.topic] || 0;
    const nov = p.sc.nov != null ? p.sc.nov : 0.72 * st.idea + 0.28 * pi.research + exp * 0.5;
    const sol = p.sc.sol != null ? p.sc.sol : 0.78 * st.code + 0.22 * pi.research + exp * 0.3;
    const cla = 0.62 * st.write + 0.38 * pi.writing;
    return S.squash(0.36 * nov + 0.38 * sol + 0.26 * cla) + p.bonus + (p.collab ? p.collab.bonus : 0) + p.est;
  };

  S.projectPct = p => {
    const order = { idea: 0, exp: 1, write: 2 };
    if (!(p.phase in order)) return 1;
    return (order[p.phase] + Math.min(1, p.prog / p.need[p.phase])) / 3;
  };

  // ---------- 投稿 ----------
  S.venuesFor = g => G.area(g).venues.map(id => RS.VENUES[id]).filter(Boolean);
  S.nextDeadline = function (v, from) {
    if (!v.dl) return null;
    let best = null;
    for (const [m, d] of v.dl) {
      let day = G.nextDate(from, m, d);
      if (v.parity) {
        for (let k = 0; k < 3; k++) {
          const yr = G.yearOfDay(day);
          if ((v.parity === 'odd') === (yr % 2 === 1)) break;
          day += 360;
        }
      }
      if (best === null || day < best) best = day;
    }
    return best;
  };
  S.venueThr = (g, v, p) => {
    let thr = RS.TIERS[v.tier].thr + (v.type === 'jour' ? 2 : 0) + S.fieldBar(g);
    if (p && g.topics[p.topic]) thr += (g.topics[p.topic].heat - 1) * 1.5;
    return thr;
  };
  S.acceptProb = function (g, p, v, q) {
    if (v.tier === 'P') return 1;
    const lead = G.member(g, p.lead);
    const Q = (q != null ? q : p.q) + (lead ? tAdd(lead, 'luck') : 0);
    return Math.min(0.8, U.sigmoid((Q - S.venueThr(g, v, p)) / 7));
  };
  S.venueOptions = function (g, p) {
    const out = [];
    const q = S.estQuality(g, p);
    for (const v of S.venuesFor(g)) {
      const day = v.type === 'jour' ? g.day + 1 : S.nextDeadline(v, g.day + 2);
      if (day == null || day - g.day > 330) continue;
      out.push({ v, day, prob: S.acceptProb(g, p, v, q), value: RS.TIERS[v.tier].value });
    }
    return out.sort((a, b) => a.day - b.day);
  };
  S.autoTarget = function (g, p) {
    const pol = g.policies.submit;
    const opts = S.venueOptions(g, p);
    if (!opts.length) return null;
    const ok = o => {
      const t = o.v.tier;
      if (pol === 'top') return p.attempts < 4 ? t === 'A' : t !== 'W';
      if (pol === 'volume') return t !== 'A' || o.prob > 0.55;
      // balanced
      if (p.attempts < 2) return t === 'A' || (t === 'B' && o.prob > 0.45);
      if (p.attempts < 4) return t !== 'W';
      return true;
    };
    let pool = opts.filter(ok);
    if (!pool.length) pool = opts;
    let best = null, bs = -1;
    for (const o of pool) {
      const wait = o.day - g.day + o.v.review;
      const tried = p.history.filter(h => h.v === o.v.id).length;
      const s = o.prob * o.value * Math.pow(0.996, wait) * (o.v.type === 'jour' ? 0.85 : 1) * Math.pow(0.75, tried);
      if (s > bs) { bs = s; best = o; }
    }
    return { v: best.v.id, day: best.day };
  };

  S.retarget = function (g, p) {
    const maxTry = g.policies.submit === 'top' ? 6 : 5;
    if (p.attempts >= maxTry) {
      G.log(g, `《${short(p.title)}》屡投不中，挂到了 arXiv 上`, 'info');
      S.publish(g, p, RS.VENUES.arxiv, {});
      return;
    }
    if (g.policies.submit === 'ask' && g.policies.auto !== 'all') {
      if (!p.asking) {
        p.asking = true;
        G.queue(g, { type: 'venue', pid: p.id });
      }
      return;
    }
    const t = S.autoTarget(g, p);
    if (t) {
      p.target = t;
      const v = RS.VENUES[t.v];
      G.log(g, `《${short(p.title)}》计划投稿 ${v.name}（${v.type === 'jour' ? '期刊随时可投' : '截稿 ' + G.mdStr(t.day)}）`, 'info');
    }
  };

  S.setTarget = function (g, p, vid, day) {
    p.asking = false;
    if (vid === 'arxiv') { S.publish(g, p, RS.VENUES.arxiv, {}); return; }
    p.target = { v: vid, day };
    if (day <= g.day) S.submit(g, p);
  };

  S.submit = function (g, p) {
    const v = RS.VENUES[p.target.v];
    if (!v || v.id === 'arxiv') { S.publish(g, p, RS.VENUES.arxiv, {}); return; }
    p.phase = 'review';
    p.venue = v.id;
    p.submitDay = g.day;
    p.notifyDay = g.day + v.review + U.int(-4, 4);
    p.rebuttalDay = v.rebuttal ? g.day + Math.round(v.review * 0.65) : 0;
    p.target = null;
    g.stats.submissions++;
    g.year.subs++;
    G.log(g, `《${short(p.title)}》投稿至 ${v.name}`, 'info');
    RS.bus.emit('submit', p);
  };

  S.genScores = function (v, margin, ok) {
    const base = ok ? 6.1 + margin / 10 : 4.5 + margin / 12;
    const n = v.type === 'jour' ? 3 : U.chance(0.5) ? 4 : 3;
    const out = [];
    for (let i = 0; i < n; i++) out.push(U.clamp(Math.round(base + U.normal(0, 1.1) - (i === 1 ? 1.5 : 0)), 1, 10));
    return out;
  };

  S.rebuttal = function (g, p) {
    const v = RS.VENUES[p.venue];
    const lead = G.member(g, p.lead);
    const margin = p.q + (lead ? tAdd(lead, 'luck') : 0) - S.venueThr(g, v, p);
    const scores = S.genScores(v, margin + U.normal(0, 3), margin > 0);
    if (g.policies.rebuttal === 'ask' && g.policies.auto === 'off') {
      G.queue(g, { type: 'event', id: 'rebuttal', ctx: { pid: p.id, scores, quote: U.pick(RS.REVIEWS.bad) } });
    } else {
      p.q += 2.5;
      S.addEnergy(g, -3);
    }
  };

  S.decide = function (g, p) {
    const v = RS.VENUES[p.venue];
    const lead = G.member(g, p.lead);
    const luck = lead ? tAdd(lead, 'luck') : 0;
    const qe = p.q + luck + U.normal(0, 5);
    const margin = qe - S.venueThr(g, v, p);
    const ok = Math.random() < Math.min(0.8, U.sigmoid(margin / 5.5));
    const scores = S.genScores(v, margin, ok);
    if (ok) S.publish(g, p, v, { margin, scores });
    else S.reject(g, p, v, scores);
  };

  S.citeRate = function (g, p, v, best) {
    const A = G.area(g);
    const heat = g.topics[p.topic] ? g.topics[p.topic].heat : 1;
    const lead = G.member(g, p.lead);
    let r = RS.TIERS[v.tier].cite * Math.pow(Math.max(25, p.q) / 72, 3) * Math.pow(heat, 0.5) * A.citeMult;
    r *= lead ? tMul(lead, 'cite') : 1;
    r *= Math.exp(U.normal(-0.3, 1.0));
    r *= 1 + Math.min(0.5, g.rep / 1000);
    if (best) r *= 2.5;
    return r;
  };

  S.publish = function (g, p, v, info) {
    const margin = info.margin || 0;
    let best = false, oral = false;
    const nm = Math.floor((g.day % 360) / 30) + 1;
    const year = G.calYear(g) + (v.type === 'conf' && nm >= 10 ? 1 : 0);
    if (v.tier === 'A' && v.type === 'conf') {
      g.flags.bestAt = g.flags.bestAt || {};
      const key = v.id + year;
      if (margin > 18 && !g.flags.bestAt[key] && U.chance(Math.min(0.12, 0.01 + (margin - 18) * 0.006))) { best = true; g.flags.bestAt[key] = 1; }
      else if (margin > 10 && U.chance(0.5)) oral = true;
    }
    const paper = {
      id: G.nid(g, 'pa'), title: p.title, topic: p.topic, venue: v.id, tier: v.tier, year, day: g.day,
      q: Math.round(p.q * 10) / 10, cites: 0, acc: 0, rate: S.citeRate(g, p, v, best), best, oral,
      authors: p.authors.slice(), lead: p.lead, scores: info.scores || null, pid: p.id,
    };
    g.papers.unshift(paper);
    if (p.fake && v.tier !== 'P' && U.chance(0.45)) G.schedule(g, g.day + U.int(120, 540), 'scandal', { paperId: paper.id });
    const i = g.projects.indexOf(p);
    if (i >= 0) g.projects.splice(i, 1);
    S.releaseProject(g, p);
    g.stats.pubs[v.tier] = (g.stats.pubs[v.tier] || 0) + 1;
    g.year.papers++;
    if (v.tier === 'A') g.year.papersA++;
    S.addRep(g, RS.TIERS[v.tier].rep + (best ? 15 : 0) + (oral ? 1.5 : 0));
    if (v.tier !== 'P') g.expertise[p.topic] = Math.min(10, (g.expertise[p.topic] || 0) + (v.tier === 'A' ? 1 : 0.5));
    p.authors.forEach(id => {
      const m = G.member(g, id);
      if (!m) return;
      if (v.tier !== 'P') m.pubs++;
      if (v.tier === 'A') m.pubsA++;
      S.addMood(m, id === p.lead ? (v.tier === 'P' ? 2 : 6) : 3);
    });
    g.pi.stats.research = Math.min(100, g.pi.stats.research + (v.tier === 'A' ? 0.3 : 0.1) * S.soft(g.pi.stats.research));
    g.pi.stats.writing = Math.min(100, g.pi.stats.writing + 0.1 * S.soft(g.pi.stats.writing));
    const lead = G.member(g, p.lead);
    if (v.tier === 'P') {
      RS.bus.emit('arxiv', { paper });
      return paper;
    }
    S.travel(g, v, lead);
    const tag = best ? '（最佳论文奖！）' : oral ? '（Oral）' : '';
    G.log(g, `论文《${short(p.title)}》被 ${v.name} ${year} 接收${tag}${info.scores ? '，评分 ' + info.scores.join('/') : ''}`, best ? 'gold' : 'good');
    if (best) {
      g.stats.bestPapers++;
      G.milestone(g, `《${p.title}》获 ${v.name} ${year} 最佳论文奖`);
      G.queue(g, { type: 'notice', tone: 'gold', icon: 'trophy', fx: 'confetti', title: '最佳论文奖！', text: `《${p.title}》获得了 <b>${v.name} ${year}</b> 的最佳论文奖！<br>这是整个领域的最高认可之一。声望 +15，引用量将大幅提升。` });
    } else if (v.tier === 'A' && g.stats.pubs.A === 1) {
      G.milestone(g, `第一篇 A 类论文被 ${v.name} 接收`);
    }
    RS.bus.emit('accept', { paper, lead: p.lead, best });
    return paper;
  };

  S.travel = function (g, v, lead) {
    if (v.type !== 'conf' || v.tier === 'W') return;
    const pol = g.policies.travel;
    const cost = G.region(g).costs.travel;
    if (pol === 'none') { S.addMood(lead, -4); return; }
    S.spend(g, cost);
    S.addMood(lead, 6);
    if (pol === 'both') {
      S.spend(g, cost);
      S.addRep(g, 0.8);
      g.pi.stats.network = Math.min(100, g.pi.stats.network + 0.8);
      S.addEnergy(g, -4);
    }
  };

  S.reject = function (g, p, v, scores) {
    p.attempts++;
    p.history.push({ v: v.id, d: g.day, scores });
    p.q += U.range(2, 4.5);
    p.phase = 'ready';
    p.venue = null;
    p.target = null;
    g.stats.rejects++;
    g.year.rejects++;
    const lead = G.member(g, p.lead);
    if (lead) S.addMood(lead, -8 * tMul(lead, 'rejectMood'));
    const quote = U.pick(RS.REVIEWS.bad);
    G.log(g, `《${short(p.title)}》被 ${v.name} 拒稿（评分 ${scores.join('/')}）。Reviewer 2：“${quote}”`, 'bad');
    RS.bus.emit('reject', { p, lead: p.lead });
    S.retarget(g, p);
  };

  S.projectsDaily = function (g) {
    for (const p of g.projects.slice()) {
      if (p.rush > 0) p.rush--;
      if (p.rushTarget && p.rushTarget.day < g.day && p.phase === 'write') {
        G.log(g, `《${short(p.title)}》没赶上 ${RS.VENUES[p.rushTarget.v].name} 的截稿，大家白熬了几个通宵`, 'bad');
        p.rushTarget = null;
      }
      if (p.phase === 'ready') {
        if (p.polish < 4) { p.q += 0.02; p.polish += 0.02; }
        p.q -= 0.003;
        if (p.asking) continue;
        if (!p.target || p.target.day < g.day) S.retarget(g, p);
        else if (p.target.day === g.day) S.submit(g, p);
      } else if (p.phase === 'review') {
        p.q -= 0.003;
        if (p.rebuttalDay && p.rebuttalDay === g.day) S.rebuttal(g, p);
        if (p.notifyDay <= g.day) S.decide(g, p);
      }
    }
  };

  // DDL 冲刺：A 类截稿前一周，写作快完成的课题会问你要不要冲
  S.checkRush = function (g) {
    const cands = g.projects.filter(p => p.phase === 'write' && p.prog / p.need.write >= 0.6 && !p.rushTarget);
    if (!cands.length) return;
    for (const p of cands) {
      for (const v of S.venuesFor(g)) {
        if (v.tier !== 'A' || !v.dl) continue;
        const day = S.nextDeadline(v, g.day + 1);
        const left = day - g.day;
        if (left < 3 || left > 7) continue;
        const key = v.id + day;
        if (p.rushAsked[key]) continue;
        p.rushAsked[key] = true;
        // 托管模式下会自动按推荐选项（冲！）处理
        G.queue(g, { type: 'event', id: 'ddl_rush', ctx: { pid: p.id, v: v.id, day } });
        return;
      }
    }
  };

  // ---------- 引用 ----------
  S.citationsUpdate = function (g, days) {
    let total = 0;
    for (const pa of g.papers) {
      if (pa.retracted) continue;
      const age = (g.day - pa.day) / 360;
      const f = age < 1.5 ? 0.25 + (0.75 * age) / 1.5 : age < 4 ? 1 : Math.exp(-(age - 4) / 6);
      pa.acc += (pa.rate * f * days) / 360;
      if (pa.acc >= 1) {
        const add = Math.floor(pa.acc);
        pa.cites += add;
        pa.acc -= add;
        total += add;
      }
    }
    if (total > 0) {
      g.stats.cites += total;
      S.addRep(g, total * 0.01);
    }
  };
  S.hIndex = g => {
    const c = g.papers.filter(p => !p.retracted).map(p => p.cites).sort((a, b) => b - a);
    let h = 0;
    while (h < c.length && c[h] >= h + 1) h++;
    return h;
  };

  // ---------- 设施与算力 ----------
  S.facilityCost = (g, f) => Math.round(f.cost * G.region(g).ppp);
  S.facilityTotals = function (g) {
    const t = { prod: 0, mood: 0, phase: { idea: 0, exp: 0, write: 0 }, energy: 0, meeting: 0, backup: false, areaBonus: 0 };
    RS.FACILITIES.forEach(f => {
      if (!g.facilities[f.id]) return;
      t.prod += f.prod || 0;
      t.mood += f.mood || 0;
      t.energy += f.energy || 0;
      t.meeting += f.meeting || 0;
      if (f.backup) t.backup = true;
      if (f.phase) for (const k in f.phase) t.phase[k] += f.phase[k];
      if (f.area || f.areaDefault) t.areaBonus += (f.area && f.area[g.areaId]) || f.areaDefault || 0;
    });
    return t;
  };
  S.buyFacility = function (g, id) {
    const f = RS.FACILITIES.find(x => x.id === id);
    if (!f || g.facilities[id]) return '已经有了';
    if (f.req && !g.facilities[f.req]) return '需要先购买' + RS.FACILITIES.find(x => x.id === f.req).name;
    const cost = S.facilityCost(g, f);
    if (g.funds < cost) return '经费不足';
    S.spend(g, cost);
    g.facilities[id] = g.day;
    G.log(g, `购置了${f.name}（${G.money(g, cost)}）`, 'info');
    RS.bus.emit('buy', { id });
    return null;
  };
  S.gpuAvailable = g => G.region(g).gpus.filter(x => G.calYear(g) >= x.from && G.calYear(g) <= x.to);
  S.gpuPrice = (g, spec) => Math.round(spec.price * (g.flags.gpuPriceUntil > g.day ? g.flags.gpuPriceMult || 1 : 1));
  S.buyGpu = function (g, id) {
    const spec = G.gpuSpec(g, id);
    if (!spec || !S.gpuAvailable(g).includes(spec)) return '买不到';
    const price = S.gpuPrice(g, spec);
    if (g.funds < price) return '经费不足';
    S.spend(g, price);
    g.gpus[id] = (g.gpus[id] || 0) + 1;
    G.log(g, `购入 ${spec.name}（+${spec.units} 算力，${G.money(g, price)}）`, 'info');
    RS.bus.emit('buy', { id: 'gpu' });
    return null;
  };
  S.sellGpu = function (g, id) {
    const spec = G.gpuSpec(g, id);
    if (!spec || !g.gpus[id]) return '没有可出售的';
    const v = Math.round(spec.price * 0.25);
    g.gpus[id]--;
    if (!g.gpus[id]) delete g.gpus[id];
    S.earn(g, v);
    G.log(g, `二手出售了 ${spec.name}，回收 ${G.money(g, v)}`, 'info');
    return null;
  };
  // 捐赠给的是当前还在售的最老一代服务器
  S.bestGpu = g => {
    const av = S.gpuAvailable(g).filter(x => x.id !== 'ws');
    return av.length ? av[0] : G.region(g).gpus[0];
  };
  S.setCloud = (g, n) => { g.cloud = U.clamp(n, 0, 30); };
  S.roomCost = (g, r) => Math.round(r.cost * G.region(g).ppp);
  S.expandRoom = function (g) {
    const r = RS.ROOMS[g.room + 1];
    if (!r) return '已经是最大的实验室了';
    if (g.rep < r.rep) return `需要声望 ≥ ${r.rep}`;
    const cost = S.roomCost(g, r);
    if (g.funds < cost) return '经费不足';
    S.spend(g, cost);
    g.room++;
    S.assignDesks(g);
    G.log(g, `实验室扩建为「${r.name}」，工位增加到 ${r.desks} 个`, 'good');
    G.milestone(g, `实验室扩建为「${r.name}」`);
    RS.bus.emit('expand', {});
    return null;
  };

  // ---------- 财务 ----------
  S.expenses = function (g) {
    const R = G.region(g);
    const c = R.costs;
    const salaries = U.sum(g.members, m => S.salary(g, m));
    let compute = 0;
    for (const id in g.gpus) { const s = G.gpuSpec(g, id); if (s) compute += s.maint * g.gpus[id]; }
    compute += g.cloud * R.cloud.price;
    let facilities = 0;
    RS.FACILITIES.forEach(f => { if (g.facilities[f.id]) facilities += f.maint * R.ppp; });
    const supplies = c.supplies + c.suppliesPer * g.members.length;
    return { salaries, compute, facilities, supplies, total: salaries + compute + facilities + supplies };
  };
  S.income = function (g) {
    const grants = U.sum(g.grants, x => x.monthly);
    const dept = G.region(g).costs.dept;
    return { grants, dept, total: grants + dept };
  };
  S.monthly = function (g) {
    const ex = S.expenses(g), inc = S.income(g);
    g.funds += inc.total - ex.total;
    g.year.income += inc.total;
    g.year.expense += ex.total;
    for (const x of g.grants) x.monthsLeft--;
    const done = g.grants.filter(x => x.monthsLeft <= 0);
    if (done.length) {
      g.grants = g.grants.filter(x => x.monthsLeft > 0);
      done.forEach(x => G.log(g, `${x.name} 执行期结束，顺利结题`, 'info'));
    }
    g.history.push({ d: g.day, f: Math.round(g.funds), r: Math.round(g.rep), c: g.stats.cites });
    if (g.history.length > 600) g.history.shift();
    if (g.funds < 0 && (g.cooldowns.deficit || 0) <= g.day) {
      g.cooldowns.deficit = g.day + 90;
      G.queue(g, { type: 'event', id: 'deficit', ctx: {} });
    }
  };
  S.runway = g => {
    const net = S.income(g).total - S.expenses(g).total;
    if (net >= 0) return Infinity;
    return Math.max(0, g.funds / -net);
  };

  // ---------- 假期 ----------
  S.inRange = (doy, start, len) => {
    const e = start + len;
    return (doy >= start && doy < e) || (e > 360 && doy < e - 360);
  };
  S.isHoliday = g => G.region(g).holidays.some(h => S.inRange(G.doy(g), G.dayOf(h.date[0], h.date[1]), h.len));
  S.currentSemester = g => G.region(g).semesters.find(s => S.inRange(G.doy(g), G.dayOf(s.start[0], s.start[1]), s.len)) || null;
})();
