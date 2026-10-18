/* 核心系统（一）：成员、课题、投稿审稿、引用、算力、设施、财务 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G;
  const S = (RS.Sys = {});

  S.ROLE_NAMES = { phd: '博士生', ms: '硕士生', ug: '本科生', postdoc: '博士后', visit: '访问学生', jpi: '青年教师' };
  // 青年教师（小导师）：带着自己的学生挂靠在你的大组里，工资学校发；自己也做课题，但要上课、带学生，花在科研上的时间少一些
  const ROLE_OFFSET = { phd: 0, ms: -8, ug: -25, postdoc: 14, visit: -4, jpi: 22 };
  const ROLE_WORK = { phd: 1, ms: 0.9, ug: 0.6, postdoc: 1.1, visit: 0.85, jpi: 0.75 };
  const ROLE_YEARS = { ms: 2, ug: 1.5, postdoc: 2, visit: 1 };
  S.PHASE_NAMES = { idea: '构思', exp: '实验', write: '写作', revise: '修改', ready: '待投稿', review: '审稿中' };
  S.WORK_PHASES = ['idea', 'exp', 'write'];
  const STAT_OF = { idea: 'idea', exp: 'code', write: 'write', revise: 'write' };
  S.NEED_MULT = 1.5;
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
  // 属性：研究能力（想法、编程、写作、数理）+ 软实力（协作、表达、抗压）。总评以研究能力为主
  S.STATS = [
    { k: 'idea', n: '想法', tip: '构思阶段的速度，以及想法新不新' },
    { k: 'code', n: '编程', tip: '实验阶段的速度，以及实验做得扎不扎实' },
    { k: 'write', n: '写作', tip: '写作、改稿的速度，以及论文写得清不清楚' },
    { k: 'math', n: '数理', tip: '理论功底：想法更新颖、实验结论更扎实' },
    { k: 'team', n: '协作', soft: true, tip: '给别人帮忙时出力更多；当组长时组员成长更快' },
    { k: 'talk', n: '表达', soft: true, tip: 'Rebuttal 更有说服力，更容易拿 Oral 和最佳论文；讲得好的去开会能给实验室攒声望；毕业找工作也更顺。去开会做报告时会提高一点' },
    { k: 'grit', n: '抗压', soft: true, tip: '心情不容易变差，被拒稿也扛得住，不容易想退出。每次被拒稿都会更扛打一点' },
  ];
  const OVR_W = { idea: 0.24, code: 0.22, write: 0.2, math: 0.12, team: 0.08, talk: 0.07, grit: 0.07 };
  S.st = (m, k) => (m && m.stats && m.stats[k] != null ? m.stats[k] : 50);
  S.overall = st => Math.round(U.sum(Object.keys(OVR_W), k => (st[k] == null ? 50 : st[k]) * OVR_W[k]));
  // 分数：玩家看到的是 0~100 的「显示分数」，学生的能力就按它来生成和成长（正态分布）；
  // 游戏规则内部用的数值和显示分数一一对应（S.disp / S.undisp，一条平滑的单调曲线），
  // 曲线是对着改动前的平衡标定的：本科生、硕士生、博士生各个分数段，干活的效率都和以前差不多
  S.DISP_K = 1.4;
  S.dispRaw = v => 100 * (1 - Math.pow(Math.max(0, 1 - U.clamp(v || 0, 0, 100) / 100), S.DISP_K));
  S.disp = v => Math.round(S.dispRaw(v));
  S.undisp = d => 100 * (1 - Math.pow(Math.max(0, 1 - U.clamp(d, 0, 100) / 100), 1 / S.DISP_K));
  // 总评：各项显示分数的加权平均
  S.dispOvr = st => Math.round(U.sum(Object.keys(OVR_W), k => S.dispRaw(st[k] == null ? 50 : st[k]) * OVR_W[k]));
  S.ovrGrade = v => (v >= 85 ? 'S' : v >= 75 ? 'A' : v >= 65 ? 'B' : v >= 55 ? 'C' : 'D'); // 按显示的分数
  // 研究能力（想法、编程、写作的显示分数平均）；「博士水平」「硕士水平」= 招生时一般的博士生、硕士生
  S.researchLevel = m => U.avg(['idea', 'code', 'write'], k => S.dispRaw(S.st(m, k)));
  S.LEVEL_PHD = 71;
  S.LEVEL_MS = 60;
  // 各身份的平均水平（显示分数）：候选人的质量 q（看学校档次、实验室声望）让它上下浮动，每项能力再各自正态分布
  // ——博士生候选人一般 61~78，硕士生 52~69，进组的本科生 40~60
  const DISP_MID = { phd: 70, ms: 60, ug: 50, postdoc: 78, visit: 64, jpi: 82 };
  // 本科生之间差得更多：有的已经很能干，有的还在入门
  S.levelOf = (role, q) => (DISP_MID[role] || 60) + (role === 'ug' ? 0.8 : 0.55) * ((q == null ? 52 : q) - 52);
  // 性格对能力的影响（显示分数）
  const TRAIT_DISP = { mathy: { idea: 4, math: 10 }, social: { team: 10, talk: 5 }, loner: { team: -10 }, influencer: { talk: 8 }, writer: { talk: 3 }, optimist: { grit: 8 }, fragile: { grit: -12 }, grinder: { grit: 5 }, slacker: { grit: -3 } };
  const toStat = d => Math.round(S.undisp(U.clamp(d, 5, 98)) * 10) / 10;
  // adj：额外的加减（显示分数，比如博士开局的本科背景）
  S.genStats = function (role, q, traits, adj) {
    const B = S.levelOf(role, q);
    const soft = 55 + (B - 55) * 0.35; // 软实力和学业水平关系不大，更多看性格
    const d = { idea: B + U.normal(0, 6), code: B + U.normal(0, 6), write: B + U.normal(0, 6), math: B - 4 + U.normal(0, 8), team: soft + U.normal(0, 9), talk: soft + U.normal(0, 9), grit: soft + U.normal(0, 9) };
    (traits || []).forEach(t => { const x = TRAIT_DISP[t]; if (x) Object.keys(x).forEach(k => { d[k] += x[k]; }); });
    Object.keys(adj || {}).forEach(k => { if (d[k] != null) d[k] += adj[k]; });
    const st = {};
    Object.keys(d).forEach(k => { st[k] = toStat(d[k]); });
    return st;
  };
  // 潜力（0~10）：每年成长时那个「状态」t 的均值。年轻的本科生学得快，博士后、青年教师已经比较定型
  const POT_MID = { ug: 6, ms: 2.8, phd: 4, visit: 4, postdoc: 2.5, jpi: 2 };
  S.genPot = (role, q) => Math.round(U.clamp(U.normal((POT_MID[role] || 4) + 0.03 * ((q == null ? 52 : q) - 52), 1.4), 0.5, 9.5) * 10) / 10;
  // 旧存档的潜力是一个 0.65~1.45 的成长倍数
  S.potFromOld = p => Math.round(U.clamp(4 + ((p || 1) - 1) * 8, 0.5, 9.5) * 10) / 10;
  // 旧存档补属性用（内部数值）：数理跟着整体水平走；软实力更多看性格
  const TRAIT_STATS = { mathy: { math: 12 }, social: { team: 12, talk: 6 }, loner: { team: -12 }, influencer: { talk: 10 }, writer: { talk: 4 }, optimist: { grit: 10 }, fragile: { grit: -15 }, grinder: { grit: 6 }, slacker: { grit: -4 } };
  S.fillStats = function (st, q, traits) {
    const base = q != null ? q : U.avg(['idea', 'code', 'write'], k => (st[k] == null ? 50 : st[k]));
    const gen = { math: () => base + U.normal(0, 10), team: () => 50 + (base - 50) * 0.3 + U.normal(0, 11), talk: () => 50 + (base - 50) * 0.3 + U.normal(0, 11), grit: () => 50 + (base - 50) * 0.2 + U.normal(0, 11) };
    Object.keys(gen).forEach(k => {
      if (st[k] != null) return;
      let v = gen[k]();
      (traits || []).forEach(t => { const d = TRAIT_STATS[t]; if (d && d[k]) v += d[k]; });
      st[k] = clampStat(v);
    });
    return st;
  };
  const statBase = st => { const b = {}; S.STATS.forEach(s => { if (st[s.k] != null) b[s.k] = Math.round(st[s.k]); }); return b; };

  S.defaultFunding = (g, role) => {
    if (role === 'phd' || role === 'postdoc') return 'ra';
    if (role === 'ms') return g.region === 'cn' ? 'ra' : 'self';
    return 'self';
  };

  S.createMember = function (g, role, o) {
    o = o || {};
    const q = o.q != null ? o.q : 52;
    const traits = o.traits || RS.randomTraits(q + (o.stats ? 0 : ROLE_OFFSET[role]));
    const stats = o.stats ? S.fillStats(Object.assign({}, o.stats), null, traits) : S.genStats(role, q, traits);
    const startDay = o.startDay != null ? o.startDay : g.day;
    const potential = o.potential != null ? o.potential : o.pot != null ? S.potFromOld(o.pot) : S.genPot(role, q);
    const m = {
      id: G.nid(g, 'm'), name: o.name || RS.randomName(g.region), role,
      avatar: o.avatar || RS.randomAvatar(),
      joinDay: g.day, startDay,
      stats, potential, gx: { s: 0, n: 0 }, mood: o.mood || U.int(68, 85),
      traits, funding: o.funding || S.defaultFunding(g, role), fellowUntil: o.fellowUntil || 0,
      projectId: null, status: 'active', awayUntil: 0, awayWhy: '', remoteUntil: 0, preUntil: o.preUntil || 0,
      pubs: 0, pubsA: 0, first: 0, firstA: 0, school: o.school || '',
      lowMood: 0, quitCd: 0, salaryMult: 1, desk: -1,
      endDay: ROLE_YEARS[role] ? startDay + Math.round(ROLE_YEARS[role] * 360) : 0,
      internYear: 0, talkCd: 0, bonusCd: 0, extended: 0,
      bio: RS.genBio(role, traits, o.school || ''),
      trust: o.trust != null ? o.trust : U.int(45, 60),
      base: statBase(stats),
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
      // 旧存档只有想法、编程、写作：按现在的水平和性格补上新属性（成长从现在开始算）
      if (m.stats.math == null || m.stats.grit == null) {
        S.fillStats(m.stats, null, m.traits);
        S.STATS.forEach(s => { if (m.base[s.k] == null) m.base[s.k] = Math.round(m.stats[s.k]); });
      }
      if (!m.story) m.story = [];
      // 旧存档没记博士后续约过几次（「出路方针」按它算）：按合同长度估——第一份合同两年，每续约一次加一年
      if (m.role === 'postdoc' && m.renewed == null) m.renewed = Math.max(0, Math.round((m.endDay - m.startDay) / 360) - ROLE_YEARS.postdoc);
      // 旧存档：潜力从成长倍数换算到 0~10
      if (m.potential == null) { m.potential = S.potFromOld(m.pot); delete m.pot; }
      if (!m.gx) m.gx = { s: 0, n: 0 };
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
  // 博士最多读 8 年：再延期一年就会超过的，不能再延期（实验室里的博士生、博士阶段的你都一样）
  S.PHD_MAX_YEARS = 8;
  S.phdCanExtend = yrs => yrs + 1 <= S.PHD_MAX_YEARS + 0.01;
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
    S.reseatDesks(g);
    g.stats.peak = Math.max(g.stats.peak, g.members.length);
    g.year.joined++;
    S.story(g, m, `以${S.ROLE_NAMES[m.role]}身份加入实验室`);
    if (!silent) {
      G.log(g, `${m.name}（${S.ROLE_NAMES[m.role]}）加入了实验室！`, 'good');
      S.onJoin(g, m);
    }
    RS.bus.emit('member_join', m);
  };

  // ---------- 工位 ----------
  // 有固定工位的人效率正常；没有的只能找地方凑合，效率和心情都打折扣。被你收回过工位的人（noDesk）不会自动分到。
  // 谁先坐看「方针 → 工位分配顺序」：
  //   keep 先到先得（默认，也是以前的分法）：已经有工位的人不会被挤掉，空出来的工位按身份、同身份按入学早晚分给还在等的人；
  //   role 职位优先 / ability 能力优先 / senior 资历优先：所有人按这个顺序排，排在前面的人先坐，工位不够时排在后面的人让出来
  const DESK_ORDER = { jpi: 1, postdoc: 2, phd: 3, ms: 4, visit: 5, ug: 6 };
  const deskRank = m => (m.isPlayer ? 0 : DESK_ORDER[m.role] || 9);
  const byRole = (a, b) => deskRank(a) - deskRank(b) || a.startDay - b.startDay;
  const joinOf = m => (m.joinDay != null ? m.joinDay : m.startDay);
  S.DESK_NAMES = { keep: '先到先得', role: '职位优先', ability: '能力优先', senior: '资历优先' };
  const DESK_SORT = {
    role: byRole,
    ability: (a, b) => S.dispOvr(b.stats) - S.dispOvr(a.stats) || byRole(a, b),
    senior: (a, b) => joinOf(a) - joinOf(b) || byRole(a, b),
  };
  S.deskRule = g => (!g.phd && DESK_SORT[g.policies.desk] ? g.policies.desk : 'keep');
  S.NO_DESK_WORK = { ug: 0.92, visit: 0.92 };
  S.noDeskMult = m => (m.desk >= 0 ? 1 : S.NO_DESK_WORK[m.role] || 0.85);
  S.assignDesks = function (g) {
    const n = G.desks(g);
    const used = new Set();
    const sort = DESK_SORT[S.deskRule(g)];
    // 按顺序排的方针：排在前 n 位的人有工位（已经有工位的尽量坐原来的位置），其余的让出来
    const seat = sort ? new Set(g.members.filter(m => !m.noDesk).sort(sort).slice(0, n)) : null;
    g.members.forEach(m => {
      if (!m.noDesk && (!seat || seat.has(m)) && m.desk >= 0 && m.desk < n && !used.has(m.desk)) used.add(m.desk);
      else m.desk = -1;
    });
    const wait = g.members.filter(m => m.desk === -1 && !m.noDesk && (!seat || seat.has(m))).sort(sort || byRole);
    let i = 0;
    for (const m of wait) {
      while (i < n && used.has(i)) i++;
      if (i >= n) break;
      m.desk = i;
      used.add(i);
    }
  };
  // 重新分一次工位，有人因此让出了工位就记在动态里（改了分配顺序、每月初、按顺序排时有人进组）
  S.reseatDesks = function (g) {
    const before = new Set(g.members.filter(m => m.desk >= 0));
    S.assignDesks(g);
    const lost = g.members.filter(m => m.desk < 0 && before.has(m));
    if (!lost.length) return;
    const got = g.members.filter(m => m.desk >= 0 && !before.has(m));
    const names = list => list.slice(0, 5).map(m => m.name).join('、') + (list.length > 5 ? ` 等 ${list.length} 人` : '');
    G.log(g, `工位按「${S.DESK_NAMES[S.deskRule(g)]}」重新分配：${names(lost)} 让出了工位${got.length ? `，${names(got)} 坐上了` : ''}`, 'info');
  };
  S.freeDesks = g => G.desks(g) - g.members.filter(m => m.desk >= 0).length;
  // 给新来的人腾一个工位：资历最浅、来得最晚的人先让出来（按顺序排的方针由排序决定谁坐，不另外腾）
  S.bumpDeskFor = function (g, m) {
    if (m.desk >= 0 || S.deskRule(g) !== 'keep') return null;
    const seated = g.members.filter(x => x !== m && x.desk >= 0 && deskRank(x) > deskRank(m));
    if (!seated.length) return null;
    const v = seated.sort((a, b) => deskRank(b) - deskRank(a) || b.startDay - a.startDay)[0];
    m.desk = v.desk;
    v.desk = -1;
    S.assignDesks(g);
    return v;
  };
  S.giveDesk = function (g, m) {
    if (m.desk >= 0) return 'TA 已经有工位了';
    if (S.freeDesks(g) <= 0) return '工位都满了：先收回别人的工位，或者去「设施」页扩建实验室';
    m.noDesk = false;
    const others = g.members.filter(x => x !== m && x.desk < 0 && !x.noDesk);
    others.forEach(x => { x.noDesk = true; }); // 先让给 TA
    S.assignDesks(g);
    others.forEach(x => { x.noDesk = false; });
    S.assignDesks(g);
    S.addMood(m, 4);
    G.log(g, `给 ${m.name} 安排了工位`, 'info');
    return null;
  };
  S.takeDesk = function (g, m) {
    if (m.desk < 0) return 'TA 本来就没有工位';
    m.desk = -1;
    m.noDesk = true;
    S.addMood(m, -6);
    S.addTrust(m, -2);
    S.assignDesks(g);
    G.log(g, `收回了 ${m.name} 的工位`, 'info');
    return null;
  };

  S.releaseMemberProjects = function (g, m) {
    for (const p of g.projects.slice()) {
      if (p.helpers.includes(m.id)) p.helpers = p.helpers.filter(x => x !== m.id);
      if (p.lead !== m.id) continue;
      if (!S.WORK_PHASES.includes(p.phase)) continue; // 已完成的论文继续走投稿流程
      const heir = p.helpers.map(id => G.member(g, id)).find(h => h && (h.role === 'phd' || h.role === 'postdoc' || h.role === 'ms' || h.role === 'jpi'));
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
    S.WORK_PHASES.forEach(ph => { need[ph] = Math.round(A.need[ph] * S.NEED_MULT * U.range(0.85, 1.15) * scale); });
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
      // 小组里的本科生 / 访问学生只帮本组的课题
      const cands = g.projects.filter(p => S.WORK_PHASES.includes(p.phase) && p.helpers.length < 2 && p.lead !== m.id &&
        (G.member(g, p.lead) || {}).role !== 'ug' && (!mine.length || mine.includes(p.sub)));
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
    // 假期效率低；暴雪/台风停课的那几天也差不多
    const holiday = (S.isHoliday(g) ? 0.45 : g.flags.closedUntil > g.day ? 0.6 : 1) * (g.flags.moveUntil > g.day ? 0.7 : 1);
    const mentor = S.mentorLoad(g);
    const labMult = intensity * meeting * piMentor * (1 + fac.prod) * S.contractDrag(g) * holiday;
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
  // 小导师：每位青年教师能精心带 JPI_CAP 个学生（本科生、访问学生算半个），带的学生不算在你头上
  S.JPI_CAP = 4;
  S.STUDENT_ROLES = ['phd', 'ms', 'ug', 'visit'];
  const loadOf = m => (m.role === 'ug' || m.role === 'visit' ? 0.5 : 1);
  S.supOf = (g, m) => { const s = m && m.sup ? G.member(g, m.sup) : null; return s && s.role === 'jpi' ? s : null; };
  S.mentorLoad = function (g) {
    const sup = {};
    g.members.forEach(m => { if (m.role === 'jpi') sup[m.id] = { load: 0, cap: S.JPI_CAP, factor: 1, n: 0 }; });
    let load = 0;
    g.members.forEach(m => {
      if (!S.STUDENT_ROLES.includes(m.role)) return;
      const s = m.sup && sup[m.sup];
      if (s) { s.load += loadOf(m); s.n++; } else load += loadOf(m);
    });
    Object.values(sup).forEach(s => { s.factor = s.load > s.cap ? Math.sqrt(s.cap / s.load) : 1; });
    const postdocs = g.members.filter(m => m.role === 'postdoc').length;
    const leaders = S.leaderCap(g);
    const cap = 6 + 2.5 * postdocs + leaders + (g.pi.title >= 2 ? 2 : 0) + (g.policies.focus === 'mentor' ? 1 : 0);
    return { load, cap, leaders, factor: load > cap ? Math.sqrt(cap / load) : 1, sup };
  };
  // 每个学生得到的指导：跟着谁就看谁忙不忙；博士后和青年教师自己能独立工作
  S.mentorFactor = (g, m, ctx) => {
    if (!S.STUDENT_ROLES.includes(m.role)) return 1;
    const s = m.sup && ctx.mentor.sup && ctx.mentor.sup[m.sup];
    return s ? s.factor : ctx.mentor.factor;
  };

  // 能力越强干得越快，而且越往上越明显：在管理得好的组里，顶尖的学生三四个月出一篇，普通学生要八九个月，能力差的一年多
  S.statSpeed = s => 0.1 + 0.9 * Math.pow(Math.max(0, s) / 80, 3);
  S.workRate = function (g, m, ph, ctx) {
    let w = S.statSpeed(S.phaseStat(m, ph)) * S.noDeskMult(m);
    w *= 0.6 + (0.6 * m.mood) / 100;
    w *= ctx.labMult * S.mentorFactor(g, m, ctx) * (1 + (ctx.phaseBonus[ph] || 0));
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
  // 模型越来越大：需求每年涨 15%（自己的电脑也跟着升级）
  S.demandGrowth = g => Math.pow(1.15, Math.max(0, G.calYear(g) - S.epoch(g)));
  S.projectDemand = (g, p) => 6 * G.area(g).compute * G.sub(g, p.sub).compute * S.demandGrowth(g);
  S.computeDemand = g => U.sum(g.projects, p => (p.phase === 'exp' ? S.projectDemand(g, p) : 0));
  // 课题用所在小组的算力（没有对应小组的课题用共享池）：实验速度 = 分到的算力 / 需求（见 S.computeAlloc）
  // 算力只加速实验里「跑计算」的那部分：机器学习、视觉、NLP 几乎全是算力，速度就是 流进来的算力 / 需求，没有上下限；
  // 系统、网络这些方向的实验主要靠人搭环境、调系统，算力再多也只能加速其中跑计算的那一截
  S.computeShare = (g, sid) => U.clamp(G.area(g).compute * G.sub(g, sid).compute, 0, 1);
  S.speedOf = (g, sid, r) => {
    const c = S.computeShare(g, sid);
    if (c < 0.05) return 1;
    return 1 / (1 - c + c / Math.max(1e-3, r || 0));
  };
  S.computeFactor = (g, p, ctx) => S.speedOf(g, p.sub, S.projRatio(g, p, ctx));
  // 算力对结果扎不扎实的影响：不够时少跑几组对比实验；够用就行，再多帮助不大
  S.computeQual = (g, p, ctx) => (S.projectDemand(g, p) < 0.3 ? 1 : U.clamp(Math.pow(S.projRatio(g, p, ctx), 0.6), 0.25, 1.15));

  // ---------- 成长：每年一次 ----------
  // 每年年底，先从「均值 = 潜力 × 这一年的带教环境」的正态分布里抽出这一年的状态 t（0~10），
  // 再给七项能力各自独立抽一个 0~t 之间的成长值（正态分布，平均 t/2），加到显示分数上，最后重新算总评；
  // 这一年入组不满一年的，按在组里的时间折算
  // 带教环境：每天记一笔，年底取平均——你的精力花在指导学生上 +30%、每周组会 +10%、小组和组长、青年教师带 +12%、
  // 单干 -15%、指导负担太重、心情差、没有工位、当助教都会拖后腿
  S.growEnv = function (g, m, ctx) {
    // 以默认方针（指导学生、每周组会）为基准：潜力就是正常带教下 t 的均值
    let e = ((g.policies.focus === 'mentor' ? 1.3 : 1) * ({ weekly: 1.1, biweekly: 1, monthly: 0.9 }[g.policies.meeting] || 1)) / 1.43 * S.groupGrowth(g, m) * (S.supOf(g, m) ? 1.12 : 1);
    e *= tMul(m, 'growth') * S.mentorFactor(g, m, ctx) * ((0.6 + (0.6 * m.mood) / 100) / 1.02) * S.noDeskMult(m);
    if (m.funding === 'ta') e *= 0.85;
    if (S.leadsGroup(g, m)) e *= 1.05; // 当组长压力大，但也更快成长
    if (m.isPlayer && g.phd) e *= S.PACE[g.phd.pace].grow;
    return e;
  };
  S.noteGrowEnv = function (g, m, ctx) {
    const x = m.gx || (m.gx = { s: 0, n: 0 });
    x.s += S.growEnv(g, m, ctx);
    x.n++;
  };
  S.T_MAX = 10;
  S.growOne = function (g, m, frac) {
    const env = m.gx && m.gx.n ? m.gx.s / m.gx.n : 1;
    m.gx = { s: 0, n: 0 };
    const t = U.clamp(U.normal(m.potential * env, 1.2), 0, S.T_MAX);
    const before = S.dispOvr(m.stats);
    const gain = {};
    S.STATS.forEach(s => {
      const d = U.clamp(U.normal(t / 2, t / 4), 0, t) * frac;
      const cur = S.dispRaw(S.st(m, s.k));
      const nxt = Math.min(100, cur + d);
      // 已经满分（内部数值比满分对应的还高）就不动，免得被「拉回」满分
      if (nxt > cur) m.stats[s.k] = Math.max(S.st(m, s.k), Math.round(S.undisp(nxt) * 10) / 10);
      gain[s.k] = Math.round(nxt) - Math.round(cur);
    });
    const after = S.dispOvr(m.stats);
    m.lastGrow = { y: G.calYear(g), t: Math.round(t * 10) / 10, env: Math.round(env * 100) / 100, frac: Math.round(frac * 100) / 100, gain, ovr: [before, after] };
    S.story(g, m, `${G.calYear(g)} 年的成长：总评 ${before} → ${after}（这一年的状态 t = ${t.toFixed(1)}）`);
    return { id: m.id, name: m.name, role: m.role, d0: before, d1: after, t: Math.round(t * 10) / 10, me: !!m.isPlayer };
  };
  S.yearlyGrowth = function (g) {
    const y0 = g.day - G.doy(g); // 这一年的第一天
    const out = [];
    g.members.forEach(m => {
      const frac = U.clamp((g.day + 1 - Math.max(m.joinDay != null ? m.joinDay : m.startDay, y0)) / 360, 0, 1);
      if (frac < 0.05) { m.gx = { s: 0, n: 0 }; return; }
      out.push(S.growOne(g, m, frac));
    });
    out.sort((a, b) => b.d1 - b.d0 - (a.d1 - a.d0));
    if (g.year) g.year.growth = out;
    return out;
  };
  S.bumpStat = function (m, key, v) {
    const s = S.st(m, key);
    m.stats[key] = Math.min(100, s + v * S.soft(s));
  };

  S.memberWork = function (g, m, ctx) {
    if (m.status !== 'active') return;
    S.noteGrowEnv(g, m, ctx);
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
    if (!lead) w *= 0.5 * tMul(m, 'helper') * (0.75 + S.st(m, 'team') / 200);
    else if (!p.helpers.length) w *= tMul(m, 'solo');
    w *= 1 + 0.05 * S.interestFit(m, p.sub); // 做自己感兴趣的方向，更有干劲
    if (S.leadsGroup(g, m)) w *= 0.92; // 组长要花时间带组员
    if (ph === 'exp') {
      w *= S.computeFactor(g, p, ctx);
      p.cf.sum += S.computeQual(g, p, ctx); p.cf.n++;
    }
    if (p.rush > 0) w *= 1.6 * tMul(m, 'ddl');
    // 组内互助：组员帮忙多出来的那部分记在他们头上；单干：效率打折
    const team = S.teamMult(g, m, p);
    const extra = team > 1 ? w * (team - 1) : 0;
    if (team < 1) w *= team;
    p.prog += w + extra;
    p.acc[ph] += (w + extra) * S.phaseStat(m, ph);
    p.wsum[ph] += w + extra;
    if (p.contrib) {
      p.contrib[m.id] = (p.contrib[m.id] || 0) + w;
      if (extra) {
        const hs = S.teamMates(g, m, p);
        hs.forEach(x => { p.contrib[x.id] = (p.contrib[x.id] || 0) + extra / hs.length; });
      }
    }
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
    G.log(g, `${who ? who.name + ' ' : '你'}按审稿意见改完了《${short(p.title)}》，准备重新投稿`, 'info');
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
    // 小导师（青年教师）带的学生的论文，导师署在后面
    const sup = S.supOf(g, G.member(g, p.lead));
    if (sup && !order.includes(sup.id)) order.push(sup.id);
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
    S.teamAuthors(g, p); // 组里帮得多的人挂上名字
    const pi = g.pi.stats;
    const lead = G.member(g, p.lead);
    const avg = ph => (p.wsum[ph] > 0 ? p.acc[ph] / p.wsum[ph] : 40);
    const exp = g.expertise[p.topic] || 0;
    const ph = p.phase;
    if (ph === 'idea') {
      p.sc.nov = 0.72 * avg('idea') + 0.28 * pi.research + exp * 0.5 + S.groupSynergy(g, p) + (p.bold ? 10 : 0) + (lead ? (S.st(lead, 'math') - 50) * 0.08 : 0) + U.normal(0, 5);
      p.phase = 'exp';
      if (p.bold) p.need.exp = Math.round(p.need.exp * 1.4);
    } else if (ph === 'exp') {
      const cf = p.cf.n ? p.cf.sum / p.cf.n : 1;
      p.sc.sol = 0.78 * avg('exp') + 0.22 * pi.research + (Math.min(cf, 1.15) - 0.85) * 18 + exp * 0.3 + (lead ? (S.st(lead, 'math') - 50) * 0.1 : 0) + U.normal(0, 5);
      p.phase = 'write';
    } else if (ph === 'write') {
      p.sc.cla = 0.62 * avg('write') + 0.38 * pi.writing + (lead ? tAdd(lead, 'cla') : 0) + (p.rush > 0 ? -3 : 0) + U.normal(0, 4);
      p.q = S.calcQuality(g, p);
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
    if (ask && !RS.Sim.catAuto(g, 'venue')) {
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
    S.vstat(g, v.id, 's');
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
    if (ask && !RS.Sim.catAuto(g, 'paper')) {
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
    S.vstat(g, v.id, ok ? 'a' : 'r');
    if (ok) S.publish(g, p, v, { margin, scores });
    else S.reject(g, p, v, scores);
  };
  // 每个会议 / 期刊的投稿记录（统计页算中稿率）：s 投稿、a 录用、r 拒稿、w 撤稿
  S.vstat = function (g, vid, k) {
    const all = g.venueStats || (g.venueStats = {});
    const x = all[vid] || (all[vid] = { s: 0, a: 0, r: 0, w: 0 });
    x[k]++;
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
      // 讲得好的作者更容易拿 Oral 和最佳论文
      const lt = G.member(g, p.lead);
      const mt = margin + (lt ? (S.st(lt, 'talk') - 50) / 8 : 0);
      if (mt > 18 && !g.flags.bestAt[key] && U.chance(Math.min(0.12, 0.01 + (mt - 18) * 0.006))) { best = true; g.flags.bestAt[key] = 1; }
      else if (mt > 10 && U.chance(0.5)) oral = true;
    }
    const ao = S.authorOrder(g, p);
    const paper = {
      id: G.nid(g, 'pa'), title: p.title, topic: p.topic, sub: p.sub, venue: v.id, tier: v.tier, year, day: g.day,
      q: Math.round(p.q * 10) / 10, cites: 0, acc: 0, rate: S.citeRate(g, p, v, best) * (p.guest ? 1.1 : 1), best, oral,
      authors: ao.order, co: ao.co, lead: ao.order[0], ext: p.collab ? p.collab.who : null, guest: p.guest || null,
      scores: info.scores || null, pid: p.id,
      rej: (p.history || []).map(h => h.v), // 之前被哪些地方拒过 / 撤过稿
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
    S.travel(g, v, lead, paper);
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

  // 只派一个代表时选谁：中稿最多的（数量优先），一样多看资历
  const SENIOR = { jpi: 6, postdoc: 5, phd: 4, ms: 3, visit: 2, ug: 1 };
  S.travelRep = list => list.filter(Boolean).sort((a, b) => (b.pubs || 0) - (a.pubs || 0) || (SENIOR[b.role] || 0) - (SENIOR[a.role] || 0) || a.startDay - b.startDay)[0] || null;
  S.travel = function (g, v, lead, paper) {
    if (v.type !== 'conf' || v.tier === 'W') return;
    const pol = g.policies.travel;
    const cost = G.region(g).costs.travel;
    if (pol === 'none') { S.addMood(lead, -4); return; }
    if (pol === 'one') {
      // 同一个会议同一年只派一个代表，把实验室中的论文都讲了：作者里中稿最多、资历最深的那位
      const year = paper ? paper.year : G.calYear(g);
      const trips = g.flags.trips || (g.flags.trips = {});
      Object.keys(trips).forEach(k => { if (+k.split(':')[1] < G.calYear(g) - 1) delete trips[k]; });
      const key = v.id + ':' + year;
      const going = trips[key] && G.member(g, trips[key]);
      if (going) {
        if (lead && lead !== going) S.addMood(lead, -2); // 代表已经要去了，这篇也交给 TA 讲
        return;
      }
      const rep = S.travelRep((paper ? paper.authors : []).map(id => G.member(g, id)).concat(lead));
      if (!rep) return;
      trips[key] = rep.id;
      S.spend(g, cost, 'travel');
      S.addMood(rep, 6);
      S.bumpStat(rep, 'talk', 1.2);
      if (S.st(rep, 'talk') >= 70) S.addRep(g, 0.3);
      if (lead && lead !== rep) { S.addMood(lead, -2); G.log(g, `${rep.name} 代表实验室去 ${v.name} 讲论文`, 'info'); }
      return;
    }
    S.spend(g, cost, 'travel');
    S.addMood(lead, 6);
    // 去开会讲论文：表达越练越好；讲得好的，大家会记住这个实验室
    if (lead) {
      S.bumpStat(lead, 'talk', 1.2);
      if (S.st(lead, 'talk') >= 70) S.addRep(g, 0.3);
    }
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
    if (lead) { S.addMood(lead, -8 * tMul(lead, 'rejectMood') * (1.4 - S.st(lead, 'grit') / 125)); S.bumpStat(lead, 'grit', 1); }
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
  // 正在施工的扩建（研究中心之后的每一期都要施工一段时间，完工时排在 g.schedule 里）
  S.building = g => g.schedule.find(s => s.kind === 'roomDone') || null;
  S.expandRoom = function (g) {
    if (S.building(g)) return '上一期扩建还在施工';
    const r = G.roomDef(g.room + 1);
    if (g.rep < r.rep) return `需要声望 ≥ ${r.rep}`;
    const cost = S.roomCost(g, r);
    if (g.funds < cost) return '经费不足';
    S.spend(g, cost, 'build');
    if (r.days) {
      G.schedule(g, g.day + r.days, 'roomDone', { room: g.room + 1, cost });
      G.log(g, `「${r.name}」开工了：${r.days} 天后完工，到时工位增加到 ${r.desks} 个`, 'info');
      return null;
    }
    S.finishRoom(g, g.room + 1);
    return null;
  };
  S.finishRoom = function (g, room) {
    if (room <= g.room) return;
    const r = G.roomDef(room);
    g.room = room;
    S.assignDesks(g);
    G.log(g, `实验室扩建为「${r.name}」，工位增加到 ${r.desks} 个`, 'good');
    G.milestone(g, `实验室扩建为「${r.name}」`);
    RS.bus.emit('expand', {});
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
      if (!g.phd) {
        const renew = done.find(x => x.kind === 'contract' && x.company && U.chance(0.5));
        if (renew && S.contracts(g).length < S.contractCap(g)) {
          G.queue(g, { type: 'event', id: 'industry_contract', ctx: S.contractOffer(g, { company: renew.company, type: renew.ctype, mult: U.range(1.05, 1.25), renew: true }) });
        }
      }
    }
    if (!g.phd) S.contractPitch(g);
    g.history.push({ d: g.day, f: Math.round(g.funds), r: Math.round(g.rep), c: g.stats.cites, h: g.stats.h });
    if (g.history.length > 600) g.history.shift();
    if (g.funds < 0 && (g.cooldowns.deficit || 0) <= g.day) {
      g.cooldowns.deficit = g.day + 90;
      G.queue(g, { type: 'event', id: 'deficit', ctx: {} });
    }
    if (!g.phd && RS.Sim.catAuto(g, 'compute')) S.autoCompute(g);
    // 工位按能力 / 职位 / 资历排的：每月初按最新的总评、身份重排一次（年底成长、转读博士之后）
    if (S.deskRule(g) !== 'keep') S.reseatDesks(g);
    S.autoGroups(g);
    S.autoLeaders(g);
    if (!g.phd) S.interestDrift(g);
  };
  // 兴趣会变：每个月都可能有学生迷上别的方向（心情差、方向冷门的时候更容易变），一个月最多一个
  S.interestDrift = function (g) {
    if (g.queue.some(q => q.type === 'event' && q.id === 'interest_change')) return;
    const c = g.members.filter(m => m.status === 'active' && !m.isPlayer && ['phd', 'ms', 'postdoc', 'ug'].includes(m.role) && (m.interestCd || 0) <= g.day);
    for (const m of U.shuffle(c.slice())) {
      const it = S.interestOf(m);
      if (!U.chance(0.022 + (m.mood < 40 ? 0.015 : 0) + (it && S.heat(g, it) < 0.9 ? 0.01 : 0))) continue;
      const ctx = RS.EVENTS.interest_change.mk(g, m);
      if (!ctx) continue;
      m.interestCd = g.day + 240;
      G.queue(g, { type: 'event', id: 'interest_change', ctx });
      return;
    }
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
