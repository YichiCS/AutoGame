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
  S.PHASE_NAMES = { idea: '构思', exp: '实验', write: '写作', revise: '修改', ready: '待投稿', review: '审稿中' };
  S.WORK_PHASES = ['idea', 'exp', 'write'];
  const STAT_OF = { idea: 'idea', exp: 'code', write: 'write', revise: 'write' };
  const GROW = { idea: 0.04, exp: 0.016, write: 0.035, revise: 0.035 };
  const NEED_MULT = 1.3;
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

  // 账本：按自然年、分类记录每一笔收支（经费明细页用）
  S.book = function (g, dir, cat, v) {
    if (!v) return;
    if (!g.ledger) g.ledger = {};
    const y = G.calYear(g);
    const L = g.ledger[y] || (g.ledger[y] = { in: {}, out: {} });
    L[dir][cat] = (L[dir][cat] || 0) + v;
    const years = Object.keys(g.ledger).map(Number).sort((a, b) => a - b);
    while (years.length > 4) delete g.ledger[years.shift()];
  };
  S.spend = (g, v, cat) => { g.funds -= v; g.year.expense += v; S.book(g, 'out', cat || 'misc', v); };
  S.earn = (g, v, cat) => { g.funds += v; g.year.income += v; S.book(g, 'in', cat || 'other', v); };
  S.addRep = (g, v) => { g.rep = Math.max(0, g.rep + v); };
  S.addEnergy = (g, v) => { g.pi.energy = U.clamp(g.pi.energy + v, 0, 100); };
  S.addMood = (m, v) => { if (m) m.mood = U.clamp(m.mood + v, 0, 100); };
  S.labMood = (g, v) => g.members.forEach(m => S.addMood(m, v));
  // 师生信任：谈心、发奖金、一起发论文会增加；拒绝实习、延期毕业会减少
  S.addTrust = (m, v) => { if (m) m.trust = U.clamp((m.trust == null ? 55 : m.trust) + v, 0, 100); };
  // 学生的成长轨迹
  S.story = (g, m, text) => {
    if (!m) return;
    if (!m.story) m.story = [];
    m.story.push({ d: g.day, t: text });
    if (m.story.length > 16) m.story.shift();
  };

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
      pubs: 0, pubsA: 0, first: 0, firstA: 0, school: o.school || '',
      lowMood: 0, quitCd: 0, salaryMult: 1, desk: -1,
      endDay: ROLE_YEARS[role] ? startDay + Math.round(ROLE_YEARS[role] * 360) : 0,
      internYear: 0, talkCd: 0, bonusCd: 0, extended: 0,
      bio: RS.genBio(role, traits, o.school || ''),
      trust: o.trust != null ? o.trust : U.int(45, 60),
      base: { idea: stats.idea, code: stats.code, write: stats.write },
      story: [],
      groups: [], lastDone: null, ledGroup: false,
    };
    m.bio.interest = o.interest || S.randomInterest(g);
    return m;
  };
  // ---------- 研究方向（领域 → 方向 → 子方向） ----------
  // 热度记在子方向上；方向的热度取它所有子方向的平均
  S.heat = (g, id) => {
    const s = g.subs && g.subs[id];
    if (s) return s.heat;
    const t = G.area(g).topics.find(x => x.id === id);
    return t ? U.avg(t.subs, x => (g.subs[x.id] || x).heat) : 1;
  };
  S.subName = (g, sid) => (sid ? G.sub(g, sid).name : '还没想好');
  S.dirName = (g, sid) => (sid ? `${G.topicOf(g, sid).name} · ${G.sub(g, sid).name}` : '还没想好');
  // 兴趣和子方向的契合度：正好想做 1，同一个方向下的其他子方向 0.5
  S.interestFit = (m, sid) => {
    const it = S.interestOf(m);
    if (!it || !sid) return 0;
    if (it === sid) return 1;
    const a = RS.SUBS[it], b = RS.SUBS[sid];
    return a && b && a.topic === b.topic ? 0.5 : 0;
  };
  // 学生感兴趣的子方向：热门的更受欢迎；冲着实验室来的学生多半想做核心方向，或者已经有小组的方向
  S.randomInterest = g => U.weighted(G.area(g).subs, s =>
    (0.5 + S.heat(g, s.id)) * (s.topic === g.policies.coreTopic ? 3 : 1) * ((g.groups || []).some(gr => gr.sub === s.id) ? 1.6 : 1)).id;
  // 给旧存档里的成员补上个性档案
  S.normalize = function (g) {
    g.members.forEach(m => {
      if (!m.bio) m.bio = RS.genBio(m.role, m.traits, m.school || '');
      if (m.trust == null) m.trust = 55;
      if (!m.base) m.base = { idea: Math.round(m.stats.idea), code: Math.round(m.stats.code), write: Math.round(m.stats.write) };
      if (!m.story) m.story = [];
      if (m.first == null) {
        // 旧存档没有记录一作，从已发表的论文里数（旧论文的作者顺序就是负责人在前）
        m.first = 0;
        m.firstA = 0;
        g.papers.forEach(pa => {
          if (pa.tier === 'P' || pa.pre) return;
          const i = (pa.authors || []).indexOf(m.id);
          if (i >= 0 && i < (pa.co == null ? 1 : pa.co)) { m.first++; if (pa.tier === 'A') m.firstA++; }
        });
      }
    });
    S.normalizeGroups(g);
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
    S.story(g, m, `以${S.ROLE_NAMES[m.role]}身份加入实验室`);
    if (!silent) {
      G.log(g, `${m.name}（${S.ROLE_NAMES[m.role]}）加入了实验室！`, 'good');
      S.onJoin(g, m);
    }
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
    if (i < 0 || m.isPlayer) return; // 博士阶段的“你”不会被移出实验室
    g.members.splice(i, 1);
    S.releaseMemberProjects(g, m);
    S.groupsOnLeave(g, m);
    g.alumni.unshift({
      id: m.id, name: m.name, role: m.role, avatar: m.avatar, joinDay: m.joinDay, startDay: m.startDay,
      leftDay: g.day, reason, dest: dest || '', pubs: m.pubs, pubsA: m.pubsA, first: m.first || 0, goal: m.bio ? m.bio.goal : '',
    });
    if (g.alumni.length > 100) g.alumni.length = 100;
    S.assignDesks(g);
    RS.bus.emit('member_leave', { m, reason });
  };

  // ---------- 课题 ----------
  // 没有小组的人按「选题倾向」挑一个子方向
  S.pickSub = function (g) {
    const A = G.area(g);
    const pol = g.policies.topic;
    if (g.flags.trendTopic && g.flags.trendUntil > g.day && U.chance(0.5)) return G.asSub(g, g.flags.trendTopic);
    if (pol === 'core') {
      if (U.chance(0.7)) return U.weighted(G.topic(g, g.policies.coreTopic).subs, s => 0.6 + S.heat(g, s.id)).id;
      return U.weighted(A.subs, s => ((1 + (g.expertise[s.topic] || 0) * 0.5) * (0.6 + S.heat(g, s.id))) / G.topic(g, s.topic).subs.length).id;
    }
    if (pol === 'hot') return U.weighted(A.subs, s => Math.pow(S.heat(g, s.id), 2.2)).id;
    return U.pick(A.subs).id;
  };

  // 论文标题：领域自己的风格、通用模板，偶尔来个“标题党”；研究任务来自子方向
  S.genTitle = function (g, sid) {
    const A = G.area(g);
    const T = G.sub(g, sid);
    const P = RS.TITLE_PARTS;
    const r = Math.random();
    const tpl = r < 0.04 ? U.pick(P.fun) : A.templates && r < 0.5 ? U.pick(A.templates) : U.pick(P.templates);
    const adj = U.pick(P.adj);
    let adj2 = U.pick(P.adj);
    for (let i = 0; i < 5 && adj2 === adj; i++) adj2 = U.pick(P.adj);
    const fill = {
      Adj: adj, Adj2: adj2, Method: U.pick(A.methods), Task: U.pick(T.en), Noun: U.pick(P.noun), Verb: U.pick(P.verb),
      Thing: U.pick(P.thing), Num: U.pick(P.num), Barrier: U.pick(P.barrier),
      Acr: U.pick(P.acr) + (U.chance(0.12) ? U.pick(P.acrSuffix) : ''),
    };
    return tpl.replace(/\{(\w+)\}/g, (all, k) => (fill[k] != null ? fill[k] : all));
  };

  // 尽量不和在研课题、已发表论文重名
  S.uniqueTitle = function (g, sid) {
    const used = t => g.projects.some(p => p.title === t) || g.papers.some(p => p.title === t);
    let t = S.genTitle(g, sid);
    for (let i = 0; i < 8 && used(t); i++) t = S.genTitle(g, sid);
    return t;
  };

  // sid：子方向（也可以传方向，取它的第一个子方向）
  S.newProject = function (g, lead, sid) {
    const A = G.area(g);
    sid = G.asSub(g, sid || S.pickSub(g));
    const scale = { phd: 1, postdoc: 1, ms: 0.9, ug: 0.75, visit: 0.85 }[lead.role] || 1;
    const need = {};
    S.WORK_PHASES.forEach(ph => { need[ph] = Math.round(A.need[ph] * NEED_MULT * U.range(0.85, 1.15) * scale); });
    const p = {
      id: G.nid(g, 'p'), title: S.uniqueTitle(g, sid), topic: RS.SUBS[sid].topic, sub: sid,
      lead: lead.id, helpers: [], authors: [lead.id],
      phase: 'idea', prog: 0, need,
      acc: { idea: 0, exp: 0, write: 0 }, wsum: { idea: 0, exp: 0, write: 0 }, cf: { sum: 0, n: 0 },
      sc: {}, q: 0, bonus: 0, polish: 0, est: U.normal(0, 3),
      target: null, venue: null, submitDay: 0, notifyDay: 0, rebuttalDay: 0, attempts: 0, history: [],
      startDay: g.day, rush: 0, rushTarget: null, rushAsked: {}, collab: null, asking: false,
      contrib: {}, // 每个人的实际工作量，决定作者顺序
    };
    g.projects.push(p);
    lead.projectId = p.id;
    return p;
  };

  // 本科生/访问学生默认去给高年级学生打下手（优先本组的课题）；其他人在所属小组的方向里开新课题
  S.assignWork = function (g, m) {
    if (m.role === 'ug' || m.role === 'visit') {
      const mine = S.memberSubs(g, m);
      const cands = g.projects.filter(p => S.WORK_PHASES.includes(p.phase) && p.helpers.length < 2 && p.lead !== m.id &&
        (G.member(g, p.lead) || {}).role !== 'ug');
      if (cands.length) {
        const cost = p => p.helpers.length * 2 - (mine.includes(p.sub) ? 1 : 0);
        const p = cands.reduce((a, b) => (cost(a) <= cost(b) ? a : b));
        p.helpers.push(m.id);
        if (!p.authors.includes(m.id)) p.authors.push(m.id);
        m.projectId = p.id;
        m.lastDone = null;
        return p;
      }
    }
    const p = S.newProject(g, m, S.pickSubFor(g, m));
    S.continuity(m, p);
    return p;
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
    // 假期效率低；暴雪/台风停课的那几天也差不多
    const holiday = S.isHoliday(g) ? 0.45 : g.flags.closedUntil > g.day ? 0.6 : 1;
    const mentor = S.mentorLoad(g);
    const labMult = intensity * meeting * piMentor * (1 + fac.prod) * crowd * Math.pow(0.93, contracts) * holiday * mentor.factor;
    const units = G.computeUnits(g);
    const demand = S.computeDemand(g);
    const teamMood = U.sum(g.members, m => (m.status === 'active' ? tAdd(m, 'teamMood') : 0));
    return {
      fac, labMult, units, demand, teamMood, resting, mentor,
      alloc: S.computeAlloc(g),
      ratio: demand > 0 ? units / demand : 9,
      phaseBonus: { idea: fac.phase.idea, exp: fac.phase.exp + fac.areaBonus, write: fac.phase.write },
    };
  };

  // 指导负担：PI 的精力有限，学生太多时每个人得到的指导变少；博士后和组长可以帮忙带学生
  S.mentorLoad = function (g) {
    const postdocs = g.members.filter(m => m.role === 'postdoc').length;
    const load = U.sum(g.members, m => (m.role === 'postdoc' ? 0 : m.role === 'ug' || m.role === 'visit' ? 0.5 : 1));
    const leaders = S.leaderCap(g);
    const cap = 6 + 2.5 * postdocs + leaders + (g.pi.title >= 2 ? 2 : 0) + (g.policies.focus === 'mentor' ? 1 : 0);
    return { load, cap, leaders, factor: load > cap ? Math.sqrt(cap / load) : 1 };
  };

  // 能力越强干得越快，而且越往上越明显：在管理得好的组里，顶尖的学生三四个月出一篇，普通学生要八九个月，能力差的一年多
  S.statSpeed = s => 0.1 + 0.9 * Math.pow(Math.max(0, s) / 80, 3);
  // 成长看投入的功夫，不看产出：能力差的学生虽然做得慢，但一样在进步
  const effort = (m, ph, w) => (w * 0.88) / S.statSpeed(S.phaseStat(m, ph));
  S.workRate = function (g, m, ph, ctx) {
    let w = S.statSpeed(S.phaseStat(m, ph));
    w *= 0.6 + (0.6 * m.mood) / 100;
    w *= ctx.labMult * (1 + (ctx.phaseBonus[ph] || 0));
    w *= tMul(m, 'prod') * tPhase(m, ph) * ROLE_WORK[m.role];
    if (m.funding === 'ta') w *= 0.65;
    if (m.traits.includes('coffee')) w *= g.facilities.coffee ? 1.1 : 0.95;
    if (m.preUntil && g.day < m.preUntil) w *= 0.6;
    if (m.remoteUntil > g.day) w *= 0.7;
    if (m.isPlayer && g.phd) w *= S.PACE[g.phd.pace].work; // 博士阶段：你自己的工作节奏
    if (m.busyUntil > g.day) w *= m.busyMult || 0.9; // 当助教之类的杂事
    return w;
  };

  // 难度随“你的职业生涯开始以后”的年份增长（读完博士再当 PI 的存档，起点是入职那一年）
  S.epoch = g => g.epoch || G.BASE_YEAR;
  S.projectDemand = (g, p) => 6 * G.area(g).compute * G.sub(g, p.sub).compute * Math.pow(1.15, Math.max(0, G.calYear(g) - S.epoch(g)));
  S.computeDemand = g => U.sum(g.projects, p => (p.phase === 'exp' ? S.projectDemand(g, p) : 0));
  // 课题用所在小组的算力（没有对应小组的课题用共享池）
  S.computeFactor = (g, p, ctx) => (S.projectDemand(g, p) < 0.3 ? 1 : U.clamp(Math.pow(S.projRatio(g, p, ctx), 0.6), 0.25, 1.15));

  S.grow = function (g, m, ph, w) {
    const key = STAT_OF[ph];
    const s = m.stats[key];
    const mentor = (g.policies.focus === 'mentor' ? 1.3 : 1) * ({ weekly: 1.1, biweekly: 1, monthly: 0.9 }[g.policies.meeting] || 1) * S.groupGrowth(g, m) *
      (m.isPlayer && g.phd ? S.PACE[g.phd.pace].grow : 1);
    m.stats[key] = Math.min(100, s + GROW[ph] * w * m.pot * tMul(m, 'growth') * mentor * S.soft(s));
  };
  S.bumpStat = function (m, key, v) {
    const s = m.stats[key];
    m.stats[key] = Math.min(100, s + v * S.soft(s));
  };

  S.memberWork = function (g, m, ctx) {
    if (m.status !== 'active') return;
    // 被拒的论文要按审稿意见改完才能再投：改稿会占掉一部分精力，堆得越多，手上的新课题做得越慢
    const revs = S.revisionsOf(g, m);
    let p = m.projectId ? G.project(g, m.projectId) : null;
    if (!p || !S.WORK_PHASES.includes(p.phase)) {
      m.projectId = null;
      // 做完一个课题，先来找你商量下一个方向
      if (S.wantsConsult(g, m)) { S.queueConsult(g, m); return; }
      p = S.assignWork(g, m);
    }
    const share = S.reviseShare(revs.length, !!p);
    if (share > 0) S.reviseWork(g, m, revs[0], ctx, share);
    if (!p) return;
    const ph = p.phase;
    const lead = p.lead === m.id;
    let w = S.workRate(g, m, ph, ctx) * (1 - share);
    if (!lead) w *= 0.5 * tMul(m, 'helper');
    else if (!p.helpers.length) w *= tMul(m, 'solo');
    w *= 1 + 0.05 * S.interestFit(m, p.sub); // 做自己感兴趣的方向，更有干劲
    if (S.leadsGroup(g, m)) w *= 0.92; // 组长要花时间带组员
    if (ph === 'exp') {
      const cf = S.computeFactor(g, p, ctx);
      w *= cf;
      p.cf.sum += cf; p.cf.n++;
    }
    if (p.rush > 0) w *= 1.6 * tMul(m, 'ddl');
    p.prog += w;
    p.acc[ph] += w * S.phaseStat(m, ph);
    p.wsum[ph] += w;
    if (p.contrib) p.contrib[m.id] = (p.contrib[m.id] || 0) + w;
    S.grow(g, m, ph, effort(m, ph, w));
    if (p.prog >= p.need[ph]) S.completePhase(g, p);
  };

  // ---------- 改稿 ----------
  // 谁来改：负责人还在就是负责人，否则是还在组里的其他作者（本科生除外）；都不在了就是 PI 自己改
  S.reviser = function (g, p) {
    const lead = G.member(g, p.lead);
    if (lead) return lead;
    for (const id of p.authors || []) { const m = G.member(g, id); if (m && m.role !== 'ug') return m; }
    return null;
  };
  S.revisionsOf = (g, m) => g.projects.filter(p => p.phase === 'revise' && S.reviser(g, p) === m).sort((a, b) => (a.revSince || 0) - (b.revSince || 0));
  // 改稿占用的精力：手上还有新课题时，1 篇约 3 成、2 篇一半多、3 篇六成多……没有新课题就全力改
  S.reviseShare = (n, busy) => (!n ? 0 : busy ? 1 - 1 / (1 + 0.6 * n) : 1);
  S.reviseWork = function (g, m, p, ctx, share) {
    const w = S.workRate(g, m, 'revise', ctx) * share * (p.rush > 0 ? 1.4 : 1);
    p.revProg = (p.revProg || 0) + w;
    if (p.contrib) p.contrib[m.id] = (p.contrib[m.id] || 0) + w;
    S.grow(g, m, 'revise', effort(m, 'revise', w));
    if (p.revProg >= p.revNeed) S.finishRevision(g, p, 1);
  };
  // 被拒（或撤稿）之后先按审稿意见改，工作量是写作量的三到四成半；投太多次的直接挂 arXiv
  S.startRevision = function (g, p) {
    p.venue = null;
    p.target = null;
    const maxTry = g.policies.submit === 'top' ? 6 : 5;
    if (p.attempts >= maxTry) { p.phase = 'ready'; S.retarget(g, p); return; }
    p.phase = 'revise';
    p.revNeed = Math.round(p.need.write * U.range(0.3, 0.45));
    p.revProg = 0;
    p.revSince = g.day;
  };
  // 改完了：论文变好一些，进入待投稿，挑下一个会议
  S.finishRevision = function (g, p, k) {
    const gain = U.range(2, 4.5) * k;
    p.q += gain;
    p.phase = 'ready';
    p.revNeed = 0;
    p.revProg = 0;
    const who = S.reviser(g, p);
    G.log(g, `${who ? who.name : '你'}按审稿意见改完了《${short(p.title)}》，准备重新投稿`, 'info');
    S.retarget(g, p);
  };
  // 不改了：直接挂到 arXiv
  S.giveUpPaper = function (g, p) {
    if (!['revise', 'ready'].includes(p.phase)) return '只有待投稿或修改中的论文可以直接挂 arXiv';
    p.asking = false;
    G.log(g, `《${short(p.title)}》不再改投，直接挂到了 arXiv 上`, 'info');
    S.publish(g, p, RS.VENUES.arxiv, {});
    return null;
  };

  // PI 亲自下场做科研
  S.piResearch = function (g, ctx) {
    const cands = g.projects.filter(p => S.WORK_PHASES.includes(p.phase));
    if (!cands.length) return;
    const p = cands.reduce((a, b) => (a.prog / a.need[a.phase] <= b.prog / b.need[b.phase] ? a : b));
    const pi = g.pi.stats;
    const stat = p.phase === 'idea' ? pi.research : p.phase === 'exp' ? pi.research * 0.8 : pi.writing;
    let w = 0.5 * (0.5 + stat / 100);
    if (p.phase === 'exp') w *= S.computeFactor(g, p, ctx);
    p.prog += w;
    p.acc[p.phase] += w * stat;
    p.wsum[p.phase] += w;
    if (p.contrib) p.contrib.pi = (p.contrib.pi || 0) + w;
    if (p.prog >= p.need[p.phase]) S.completePhase(g, p);
  };

  // ---------- 作者顺序 ----------
  // 学生按实际工作量排（课题负责人略有加成），前两位贡献接近时共同一作；
  // 贡献太少的只出现在致谢里。PI 是通讯作者，排在最后。
  S.authorOrder = function (g, p) {
    const ids = p.authors.slice();
    const c = p.contrib;
    if (!c) return { order: ids, co: 1 }; // 旧存档：保持原来的顺序
    const score = id => (c[id] || 0) * (id === p.lead ? 1.15 : 1);
    let order = ids.slice().sort((a, b) => score(b) - score(a) || ids.indexOf(a) - ids.indexOf(b));
    const top = score(order[0]) || 1;
    const plan = p.authorPlan && p.authorPlan.filter(id => ids.includes(id));
    order = order.filter((id, i) => i === 0 || score(id) >= top * 0.03 || (plan && plan.includes(id)));
    let co = 1;
    if (plan && plan.length) {
      order = plan.concat(order.filter(id => !plan.includes(id)));
      co = plan.length;
    } else if (order.length > 1 && score(order[1]) >= top * 0.8) co = 2;
    return { order, co };
  };
  // 可能闹署名纠纷的论文：写作后期或刚写完，第二作者的工作量不小、但还没到自动共一的程度
  S.disputeCands = function (g) {
    const out = [];
    g.projects.forEach(p => {
      if (p.authorPlan || !p.contrib) return;
      if (!(p.phase === 'ready' || (p.phase === 'write' && p.prog >= p.need.write * 0.5))) return;
      const ao = S.authorOrder(g, p);
      if (ao.co > 1 || ao.order.length < 2) return;
      const a = G.member(g, ao.order[0]), b = G.member(g, ao.order[1]);
      if (a && b && (p.contrib[b.id] || 0) >= (p.contrib[a.id] || 0) * 0.35) out.push({ p, a: a.id, b: b.id });
    });
    return out;
  };
  S.POS_NAMES = ['一作', '二作', '三作', '四作', '五作', '六作'];
  // 某位成员在一篇论文里的署名位置
  S.authorPos = function (pa, id) {
    const i = (pa.authors || []).indexOf(id);
    if (i < 0) return '';
    const co = pa.co == null ? 1 : pa.co;
    if (i < co) return co > 1 ? '共同一作' : '一作';
    const k = i + (pa.pre ? pa.pre.length : 0);
    return S.POS_NAMES[k] || `第 ${k + 1} 作者`;
  };
  // 署名列表（给界面显示）：外单位牵头的在前，然后是学生、合作者、挂名的人，最后是你（通讯作者）
  // 每一项：{ n 名字, co 共同一作, ext 外单位, guest 挂名, corr 通讯作者, me 你自己 }
  S.authorList = function (g, pa) {
    if (pa.names) return pa.names; // 读博期间的论文：署名在毕业时就定下来了
    const co = pa.co == null ? 1 : pa.co;
    const out = (pa.pre || []).map(n => ({ n, ext: true }));
    (pa.authors || []).forEach((id, i) => out.push({ n: G.personName(g, id), id, co: co > 1 && i < co, me: !!g.phd && id === g.player }));
    if (pa.ext) out.push({ n: pa.ext, ext: true });
    if (pa.guest) out.push({ n: pa.guest, ext: true, guest: true });
    out.push({ n: g.pi.name, corr: true, me: !g.phd });
    return out;
  };

  S.completePhase = function (g, p) {
    const pi = g.pi.stats;
    const lead = G.member(g, p.lead);
    const avg = ph => (p.wsum[ph] > 0 ? p.acc[ph] / p.wsum[ph] : 40);
    const exp = g.expertise[p.topic] || 0;
    const ph = p.phase;
    if (ph === 'idea') {
      p.sc.nov = 0.72 * avg('idea') + 0.28 * pi.research + exp * 0.5 + S.groupSynergy(g, p) + (p.bold ? 10 : 0) + U.normal(0, 5);
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
      [p.lead].concat(p.helpers).forEach(id => {
        const m = G.member(g, id);
        if (!m || m.projectId !== p.id) return;
        // 做完之后会来找你商量下一个方向；做着做着也可能喜欢上这个方向
        if (S.CONSULT_ROLES.includes(m.role)) m.lastDone = { title: p.title, topic: p.topic, sub: p.sub };
        if (m.bio && m.bio.interest !== p.sub && U.chance(0.15)) {
          m.bio.interest = p.sub;
          S.story(g, m, `做完《${short(p.title)}》后，喜欢上了「${G.sub(g, p.sub).name}」`);
        }
      });
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
  S.fieldBar = g => Math.min(14, 0.8 * Math.max(0, G.calYear(g) - S.epoch(g)));

  S.releaseProject = function (g, p) {
    [p.lead].concat(p.helpers).forEach(id => {
      const m = G.member(g, id);
      if (m && m.projectId === p.id) m.projectId = null;
    });
    p.helpers = [];
  };

  // 给玩家看的质量估计（带一点误差）
  S.estQuality = function (g, p) {
    if (p.phase === 'ready' || p.phase === 'review' || p.phase === 'revise') return p.q + p.est;
    const pi = g.pi.stats;
    const lead = G.member(g, p.lead);
    const st = lead ? lead.stats : { idea: 45, code: 45, write: 45 };
    const exp = g.expertise[p.topic] || 0;
    const nov = p.sc.nov != null ? p.sc.nov : 0.72 * st.idea + 0.28 * pi.research + exp * 0.5 + S.groupSynergy(g, p);
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
  // 能投的地方：给了课题就按它的子方向算（本领域的会议期刊 + 收这个方向 / 子方向的跨方向会议）；没给就是本领域的
  S.venuesFor = (g, p) => {
    if (p && p.sub) return Object.values(RS.VENUES).filter(v => RS.venueFits(v, p.sub));
    return Object.values(RS.VENUES).filter(v => v.areas && v.areas.includes(g.areaId));
  };
  // 跨方向投稿：会议属于别的领域，但也收我们这个方向的论文（比如视觉的论文投 NeurIPS）
  S.crossVenue = (g, v) => !!v.home && v.home !== g.areaId;
  // 实验室眼下关心的会议：在研课题、各个小组、开局子方向能投的地方
  S.labVenues = g => {
    const subs = [...new Set(g.projects.map(p => p.sub).concat(g.groups.map(gr => gr.sub), [g.startSub]).filter(Boolean))];
    return Object.values(RS.VENUES).filter(v => subs.some(s => RS.venueFits(v, s)));
  };
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
    let thr = RS.TIERS[v.tier].thr + (v.type === 'jour' ? 2 : 0) + (v.bar || 0) + S.fieldBar(g);
    if (p && p.sub) thr += (S.heat(g, p.sub) - 1) * 1.5; // 越热的子方向，同行投稿越多，越难中
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
    for (const v of S.venuesFor(g, p)) {
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
      // 先冲 A 类；只有录用把握很大的 B 类（比如业内公认的顶会）才会提前考虑
      if (p.attempts < 2) return t === 'A' || (t === 'B' && o.prob > 0.6);
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
    // 博士阶段只有你自己负责的论文会来问你，其余的导师说了算
    const ask = g.phd ? p.lead === g.player && g.phd.submit === 'ask' : g.policies.submit === 'ask';
    if (ask && g.policies.auto !== 'all') {
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
    const ask = g.phd ? p.lead === g.player && g.phd.rebuttal === 'ask' : g.policies.rebuttal === 'ask';
    if (ask && g.policies.auto === 'off') {
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
    const heat = p.sub ? S.heat(g, p.sub) : 1;
    const lead = G.member(g, p.lead);
    let r = RS.TIERS[v.tier].cite * (v.cm || 1) * Math.pow(Math.max(25, p.q) / 72, 3) * Math.pow(heat, 0.5) * A.citeMult;
    r *= lead ? tMul(lead, 'cite') : 1;
    r *= Math.exp(U.normal(-0.3, 1.0));
    r *= 1 + Math.min(0.5, g.rep / 1000);
    if (best) r *= 2.5;
    return r;
  };

  S.publish = function (g, p, v, info) {
    const margin = info.margin || 0;
    let best = false, oral = false;
    const nm = G.month(g);
    const year = G.calYear(g) + (v.type === 'conf' && nm >= 10 ? 1 : 0);
    if (v.tier === 'A' && v.type === 'conf') {
      g.flags.bestAt = g.flags.bestAt || {};
      const key = v.id + year;
      if (margin > 18 && !g.flags.bestAt[key] && U.chance(Math.min(0.12, 0.01 + (margin - 18) * 0.006))) { best = true; g.flags.bestAt[key] = 1; }
      else if (margin > 10 && U.chance(0.5)) oral = true;
    }
    const ao = S.authorOrder(g, p);
    const paper = {
      id: G.nid(g, 'pa'), title: p.title, topic: p.topic, sub: p.sub, venue: v.id, tier: v.tier, year, day: g.day,
      q: Math.round(p.q * 10) / 10, cites: 0, acc: 0, rate: S.citeRate(g, p, v, best) * (p.guest ? 1.1 : 1), best, oral,
      authors: ao.order, co: ao.co, lead: ao.order[0], ext: p.collab ? p.collab.who : null, guest: p.guest || null,
      scores: info.scores || null, pid: p.id,
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
    ao.order.forEach((id, i) => {
      const m = G.member(g, id);
      if (!m) return;
      const first = i < ao.co;
      const pos = S.authorPos(paper, id);
      if (v.tier !== 'P') {
        if (m.pubs === 0) S.story(g, m, `第一篇论文（${pos}）：${v.name} ${year}`);
        else if (first && !m.first) S.story(g, m, `第一篇${pos}论文：${v.name} ${year}`);
        m.pubs++;
        if (first) m.first = (m.first || 0) + 1;
      }
      if (v.tier === 'A') {
        if (first && !m.firstA && m.pubs > 1) S.story(g, m, `第一篇${pos} A 类论文：${v.name} ${year}`);
        m.pubsA++;
        if (first) m.firstA = (m.firstA || 0) + 1;
      }
      if (best) S.story(g, m, `获得 ${v.name} ${year} 最佳论文奖（${pos}）！`);
      S.addMood(m, first ? (v.tier === 'P' ? 2 : 6) : 3);
      if (v.tier !== 'P') S.addTrust(m, first ? 5 : 2);
    });
    // 被挤到致谢里的人会有点失落
    p.authors.filter(id => !ao.order.includes(id)).forEach(id => S.addMood(G.member(g, id), -2));
    g.pi.stats.research = Math.min(100, g.pi.stats.research + (v.tier === 'A' ? 0.3 : 0.1) * S.soft(g.pi.stats.research));
    g.pi.stats.writing = Math.min(100, g.pi.stats.writing + 0.1 * S.soft(g.pi.stats.writing));
    const lead = G.member(g, ao.order[0]) || G.member(g, p.lead); // 一作去开会
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
      G.queue(g, { type: 'notice', player: !g.phd || paper.authors.includes(g.player), tone: 'gold', icon: 'trophy', fx: 'confetti', title: '最佳论文奖！', text: `《${p.title}》获得了 <b>${v.name} ${year}</b> 的最佳论文奖！<br>这是整个领域的最高认可之一。声望 +15，引用量将大幅提升。` });
    } else if (v.tier === 'A' && g.stats.pubs.A === 1) {
      G.milestone(g, `第一篇 A 类论文被 ${v.name} 接收`);
    }
    if (g.phd) S.phdOnPublish(g, paper, v);
    RS.bus.emit('accept', { paper, lead: p.lead, best });
    return paper;
  };

  // 外单位牵头的交叉学科论文：学生署名靠前，你是通讯作者之一
  S.sidePaper = function (g, m, partner, title, extLead) {
    const v = RS.VENUES.cross;
    const pa = {
      id: G.nid(g, 'pa'), title, topic: null, venue: v.id, tier: v.tier, year: G.calYear(g), day: g.day, q: 60, cites: 0, acc: 0,
      rate: RS.TIERS[v.tier].cite * U.range(0.8, 1.6) * (1 + Math.min(0.5, g.rep / 1000)), best: false, oral: false,
      authors: [m.id], co: 0, lead: null, pre: [extLead], scores: null, pid: null,
    };
    g.papers.unshift(pa);
    g.stats.pubs[v.tier] = (g.stats.pubs[v.tier] || 0) + 1;
    g.year.papers++;
    S.addRep(g, RS.TIERS[v.tier].rep);
    const pos = S.authorPos(pa, m.id);
    S.story(g, m, m.pubs === 0 ? `第一篇论文（${pos}）：和${partner}合作的交叉学科论文` : `和${partner}合作发表交叉学科论文（${pos}）`);
    m.pubs++;
    S.addTrust(m, 2);
    G.log(g, `${m.name} 和${partner}合作的论文《${short(title)}》发表了（${pos}）`, 'good');
    return pa;
  };
  // 外出合作归来
  S.awayReturn = function (g, m) {
    const r = m.awayReward;
    m.awayReward = null;
    if (r.idea) S.bumpStat(m, 'idea', r.idea);
    S.addMood(m, 6);
    G.log(g, `${m.name} 结束了在${r.partner}的合作，回到了实验室`, 'info');
    if (r.paper) S.sidePaper(g, m, r.partner, r.paper, r.lead);
  };

  S.travel = function (g, v, lead) {
    if (v.type !== 'conf' || v.tier === 'W') return;
    const pol = g.policies.travel;
    const cost = G.region(g).costs.travel;
    if (pol === 'none') { S.addMood(lead, -4); return; }
    S.spend(g, cost, 'travel');
    S.addMood(lead, 6);
    if (pol === 'both') {
      S.spend(g, cost, 'travel');
      S.addRep(g, 0.8);
      g.pi.stats.network = Math.min(100, g.pi.stats.network + 0.8);
      S.addEnergy(g, -4);
    }
  };

  S.reject = function (g, p, v, scores) {
    p.attempts++;
    p.history.push({ v: v.id, d: g.day, scores });
    g.stats.rejects++;
    g.year.rejects++;
    const lead = G.member(g, p.lead);
    if (lead) S.addMood(lead, -8 * tMul(lead, 'rejectMood'));
    const quote = U.pick(RS.REVIEWS.bad);
    G.log(g, `《${short(p.title)}》被 ${v.name} 拒稿（评分 ${scores.join('/')}）。Reviewer 2：“${quote}”`, 'bad');
    if (lead && lead.bio && U.chance(0.35)) G.log(g, `${lead.name} 叹了口气：“${lead.bio.motto}”`, 'info');
    RS.bus.emit('reject', { p, lead: p.lead });
    S.startRevision(g, p);
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
      } else if (p.phase === 'revise' && !S.reviser(g, p)) {
        // 作者都离开了：你自己抽空改，改得慢一些、也没那么用心
        p.revProg = (p.revProg || 0) + 0.6;
        S.addEnergy(g, -0.04);
        if (p.revProg >= p.revNeed) S.finishRevision(g, p, 0.6);
      }
    }
  };

  // DDL 冲刺：A 类截稿前一周，写作快完成的课题会问你要不要冲
  S.checkRush = function (g) {
    const cands = g.projects.filter(p => p.phase === 'write' && p.prog / p.need.write >= 0.6 && !p.rushTarget);
    if (!cands.length) return;
    for (const p of cands) {
      for (const v of S.venuesFor(g, p)) {
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
    S.spend(g, cost, 'build');
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
    S.spend(g, price, 'equip');
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
    S.fixAlloc(g);
    S.earn(g, v, 'sale');
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
    S.spend(g, cost, 'build');
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
  S.grantCat = x => (x.kind === 'contract' ? 'contract' : x.kind === 'gift' || x.kind === 'award' ? 'gift' : x.kind === 'center' ? 'center' : 'grant');
  // 每月固定收支的逐项明细（经费页展开用）
  S.monthlyItems = function (g) {
    const R = G.region(g), c = R.costs;
    const out = {
      salary: g.members.filter(m => S.salary(g, m) > 0).map(m => ({ name: `${m.name}（${S.ROLE_NAMES[m.role]}${m.salaryMult > 1.01 ? '，已加薪' : ''}）`, v: S.salary(g, m) })),
      compute: Object.keys(g.gpus).map(id => ({ s: G.gpuSpec(g, id), n: g.gpus[id] })).filter(x => x.s).map(x => ({ name: `${x.s.name} ×${x.n} 维护电费`, v: x.s.maint * x.n })),
      facility: RS.FACILITIES.filter(f => g.facilities[f.id] && f.maint).map(f => ({ name: f.name, v: f.maint * R.ppp })),
      supplies: [{ name: '实验室基础耗材', v: c.supplies }, { name: `人均杂费 × ${g.members.length} 人`, v: c.suppliesPer * g.members.length }],
    };
    if (g.cloud) out.compute.push({ name: `${R.cloud.name} ×${g.cloud}`, v: g.cloud * R.cloud.price });
    const inc = {
      grants: g.grants.map(x => ({ name: x.name, v: x.monthly, left: x.monthsLeft, cat: S.grantCat(x) })),
      dept: c.dept ? [{ name: '学院基本科研补贴', v: c.dept }] : [],
    };
    return { out, inc };
  };
  S.monthly = function (g) {
    const ex = S.expenses(g), inc = S.income(g);
    g.funds += inc.total - ex.total;
    g.year.income += inc.total;
    g.year.expense += ex.total;
    S.book(g, 'out', 'salary', ex.salaries);
    S.book(g, 'out', 'compute', ex.compute);
    S.book(g, 'out', 'facility', ex.facilities);
    S.book(g, 'out', 'supplies', ex.supplies);
    g.grants.forEach(x => S.book(g, 'in', S.grantCat(x), x.monthly));
    S.book(g, 'in', 'dept', inc.dept);
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
    if (g.policies.auto === 'all' && !g.phd) S.autoCompute(g);
  };
  // 全部托管时，算力明显不够、经费又宽裕，就添一台性价比最高的服务器
  S.autoCompute = function (g) {
    if (G.area(g).compute < 0.3) return;
    const ctx = S.dayContext(g);
    if (ctx.demand <= 0 || ctx.ratio >= 0.8 || S.runway(g) < 18) return;
    const av = S.gpuAvailable(g).filter(x => x.id !== 'ws' && S.gpuPrice(g, x) < g.funds * 0.2);
    if (!av.length) return;
    const best = av.reduce((a, b) => (b.units / S.gpuPrice(g, b) > a.units / S.gpuPrice(g, a) ? b : a));
    S.buyGpu(g, best.id);
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
