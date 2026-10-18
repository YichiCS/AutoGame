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
    if (!g.phd) S.autoHire(g);
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
    if (doy === 359) { S.yearlyGrowth(g); S.yearEnd(g); }
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
        else if (it.kind === 'postdocPool') S.postdocPool(g, it.data);
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
        case 'offers':
          S.offersResolve(g, item, payload);
          break;
        case 'move':
          if (payload === 'cancel') G.log(g, `想了想，你最后还是留在了 ${g.school}`, 'info');
          else S.movePI(g, item.offer, Array.isArray(payload) ? payload : item.pick);
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
  // 可以逐类决定哪些事交给托管（按推荐选项处理）、哪些每次问你。minor：「小事托管」预设里托管的类别
  Sim.AUTO_CATS = [
    { id: 'consult', group: '学生', name: '选题和分组', desc: '学生做完课题来商量下一个、新人分到哪个组、想换组、兴趣变了、热点来了要不要转向', minor: true },
    { id: 'student', group: '学生', name: '请求和去留', desc: '实习、想退学、被大厂挖、转读博士、毕业答辩、博后合同到期、青年教师要走。本科生 / 硕士生 / 博士生 / 博士后到期时怎么处理，还可以在「方针 → 出路与到期」里按身份单独设置', minor: false },
    { id: 'life', group: '学生', name: '生活', desc: '生病、婚礼、兴趣爱好、获奖、奖学金', minor: true },
    { id: 'people', group: '招人', name: '申请和上门', desc: '本科生、博士后、访问学生的申请，主动上门的学生，想加入的青年教师。本科生、博士后的录用名单还可以在「方针 → 招人名单」里单独设置', minor: false },
    { id: 'recruit', group: '招人', name: '研究生招生季', desc: '给哪些候选人面试、发 offer。也可以在「方针 → 招人名单」里单独设成「从高到低招满」', minor: false },
    { id: 'paper', group: '科研', name: '论文和审稿', desc: 'Rebuttal（「方针」里设成每次问我时）、DDL 冲刺、撞车、发现 bug、署名纠纷、论文出圈', minor: false },
    { id: 'venue', group: '科研', name: '投稿目标', desc: '论文写完投哪里（「方针」里投稿策略设成每次问我时）', minor: false },
    { id: 'grants', group: '科研', name: '基金申请季', desc: '申请哪些基金、投入多少精力', minor: false },
    { id: 'team', group: '团队', name: '小组里的事', desc: '组长撑不住、抢算力、组会争论、聚会、熬夜、读书会', minor: true },
    { id: 'opportunity', group: '机会', name: '学术机会和合作', desc: '审稿 / PC 邀请、特邀报告、合作、媒体采访、企业项目、捐赠、学术休假', minor: true },
    { id: 'contract', group: '机会', name: '企业合作 / 横向', desc: '企业找上门的合作项目、到期续约、共建联合实验室（托管：账上的钱不太宽裕时签，宽裕时不签）', minor: false },
    { id: 'career', group: '机会', name: '跳槽机会', desc: '别的学校来挖你（托管会拿去和学院谈条件）', minor: false },
    { id: 'teaching', group: '日常', name: '排课', desc: '每学期上哪门课', minor: true },
    { id: 'chores', group: '日常', name: '杂事', desc: '报销、监考、咖啡机坏了、机房太热、天气、家里的事', minor: true },
    { id: 'trouble', group: '日常', name: '意外和危机', desc: '经费赤字、精力耗尽、服务器故障、猫捣乱', minor: false },
    { id: 'notice', group: '消息', name: '通知', desc: '获奖、晋升、结果公布之类的消息（托管就只记在动态里）', minor: false },
    { id: 'summary', group: '消息', name: '年度总结', desc: '每年年底的总结', minor: true },
    { id: 'compute', group: '自动操作', name: '自动添置算力', desc: '算力明显不够、经费又宽裕时，自动买一台性价比最高的服务器', minor: false },
  ];
  const EVENT_CAT = {};
  const cat = (c, ids) => ids.split(' ').forEach(id => { EVENT_CAT[id] = c; });
  cat('teaching', 'teaching');
  cat('paper', 'rebuttal ddl_rush scooped bug_found author_dispute guest_author bold_idea llm_review ethics_review viral twitter open_source');
  cat('student', 'phd_grad ms_to_phd ug_to_phd quit_threat postdoc_end intern poach jpi_leave');
  cat('life', 'student_award student_fellowship student_sick wedding hobby');
  cat('consult', 'hot_trend next_topic join_group group_switch interest_change');
  cat('people', 'visitor ug_walkin ug_fair jpi_join');
  cat('team', 'leader_burnout compute_rush gpu_fight meeting_debate late_night party paper_reading birthday');
  cat('opportunity', 'pc_invite keynote collab media committee review_req tech_transfer sabbatical workshop_org interdisc darpa seed_grant new_colleague alumni_talk big_shot_praise donation alumni_gift gpu_market');
  cat('contract', 'industry_contract joint_lab');
  cat('trouble', 'deficit burnout_pi server_crash cat_chaos');
  cat('chores', 'reimburse coffee_broken heatwave proctor weather spam_mail pi_family');
  cat('career', 'poach_pi');
  const TYPE_CAT = { grants: 'grants', recruit: 'recruit', pool: 'people', venue: 'venue', notice: 'notice', summary: 'summary', offers: 'career' };
  Sim.itemCat = item => (item.type === 'event' ? EVENT_CAT[item.id] || ((RS.EVENTS[item.id] || {}).minor ? 'chores' : 'trouble') : TYPE_CAT[item.type] || 'trouble');
  // 某一类事现在交不交给托管（预设：全部问我 / 小事托管 / 全部托管；或者自定义）
  Sim.catAuto = function (g, c) {
    const mode = g.policies.auto;
    if (mode === 'all') return true;
    if (mode === 'custom') return !!(g.policies.autoCats || {})[c];
    if (mode === 'minor') return !!(Sim.AUTO_CATS.find(x => x.id === c) || {}).minor;
    return false;
  };
  // 从预设切到自定义：先按当前的预设填好每一类
  Sim.toCustom = function (g) {
    if (g.policies.auto === 'custom' && g.policies.autoCats) return;
    const cats = {};
    Sim.AUTO_CATS.forEach(c => { cats[c.id] = Sim.catAuto(g, c.id); });
    g.policies.autoCats = cats;
    g.policies.auto = 'custom';
  };

  // ---------- 方针里按身份定的规则（优先于上面的托管类别） ----------
  // 出路与到期：本科生想读研、硕士生想读博、博士生申请答辩、博士后合同到期（各自的事件）。
  // follow 跟随托管设置（「学生 · 请求和去留」）；ask 每次问我；其余是自动规则，用的就是事件里原来的选项（选项的 key 写在事件里）
  Sim.EXIT_EVENTS = { ug_to_phd: 'ug', ms_to_phd: 'ms', phd_grad: 'phd', postdoc_end: 'postdoc' };
  Sim.exitRule = (g, role) => (g.policies.exit || {})[role] || 'follow';
  const EXIT_PICK = {
    ug: (rule, m) => {
      const top = S.researchLevel(m) >= S.LEVEL_PHD; // 和弹窗里的推荐一样：够博士水平
      return { level: top ? 'phd' : 'ms', top: top ? 'phd' : 'leave', phd: 'phd', ms: 'ms', leave: 'leave' }[rule];
    },
    ms: rule => ({ stay: 'phd', leave: 'leave' }[rule]),
    // 先延期 N 年：按这个人已经延期过几次（m.extended）算；读太久、不能再拖的直接答辩
    phd: (rule, m, ev) => {
      const n = { delay1: 1, delay2: 2 }[rule];
      if (!n) return rule === 'grad' ? 'grad' : null;
      const ext = ev.choices.find(c => c.key === 'extend');
      return (m.extended || 0) < n && ext && !ext.disabled ? 'extend' : 'grad';
    },
    // 一直续约（不限次数，和亲手点「续约一年」一样）；续约 N 次：按续约过几次（m.renewed，只用来计数）算，续满就祝前程似锦
    postdoc: (rule, m) => {
      if (rule === 'always') return 'renew';
      const n = { renew1: 1, renew2: 2 }[rule];
      if (!n) return rule === 'leave' ? 'leave' : null;
      return (m.renewed || 0) < n ? 'renew' : 'leave';
    },
  };
  // 按出路方针这件事该怎么办：选项序号（自动处理）；'ask' 一定问你；null 不归它管（按托管设置来）
  Sim.exitPick = function (g, item) {
    const role = !g.phd && item.type === 'event' && Sim.EXIT_EVENTS[item.id];
    if (!role) return null;
    const rule = Sim.exitRule(g, role);
    if (rule === 'follow') return null;
    if (rule === 'ask') return 'ask';
    const ev = Sim.buildEvent(g, item);
    const m = G.member(g, (item.ctx || {}).mid);
    const key = ev && m ? EXIT_PICK[role](rule, m, ev) : null;
    const i = key ? ev.choices.findIndex(c => c.key === key) : -1;
    return i >= 0 && !ev.choices[i].disabled ? i : null; // 规则用不了（选项不在或被禁用）：退回托管设置
  };
  // 招人名单：研究生招生季（博士 / 硕士）、本科生的录用名单、博士后的申请名单。
  // follow 跟随托管设置（「研究生招生季」/「申请和上门」）；ask 我自己挑；fill 从高到低自动招满。
  // 「持续招人」自动发起的名单（item.hire）只有设成「从高到低招满」才自动录用，其余情况都由你来挑
  Sim.pickKey = item => (item.type === 'recruit' ? 'grad' : item.type === 'pool' && (item.role === 'ug' || item.role === 'postdoc') ? item.role : null);
  Sim.pickRule = function (g, item) {
    const k = !g.phd && Sim.pickKey(item);
    return k ? (g.policies.pick || {})[k] || 'follow' : null;
  };
  // 'auto'：按方针自动处理；'ask'：一定问你；null：交给托管设置
  Sim.ruleFor = function (g, item) {
    const ex = Sim.exitPick(g, item);
    if (ex !== null) return ex === 'ask' ? 'ask' : 'auto';
    const pk = Sim.pickRule(g, item);
    if (pk === 'fill') return 'auto';
    if (pk === 'ask' || (pk && item.hire)) return 'ask';
    return null;
  };
  // 有没有设了自动规则的（托管全关时也要去看看队列）
  Sim.hasRules = g => !g.phd && (Object.values(g.policies.exit || {}).some(v => v !== 'follow' && v !== 'ask') || Object.values(g.policies.pick || {}).includes('fill'));

  Sim.canAuto = function (g, item, mode) {
    // 博士阶段：导师实验室里的事都由导师处理，只有和你有关的才会问你
    if (g.phd && !S.playerFacing(g, item)) return true;
    if (item.type === 'jobmarket') return false;
    if (item.type === 'move') return false; // 接受了 offer 以后带谁走，一定由你来定
    const rule = Sim.ruleFor(g, item);
    if (rule) return rule === 'auto';
    if (mode === 'off') return false;
    if (item.type === 'eval' || item.type === 'ending') return false;
    if (item.type === 'event') {
      const def = RS.EVENTS[item.id];
      if (!def) return true;
      if (item.id === 'welcome') return false;
      if (g.phd) return def.minor || mode === 'all';
    } else if (g.phd) return item.type === 'summary' || mode === 'all';
    return Sim.catAuto(g, Sim.itemCat(item));
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
        const ex = Sim.exitPick(g, item);
        if (typeof ex === 'number') {
          log(`[出路方针] ${ev.title}：${G.personName(g, item.ctx.mid)} → ${ev.choices[ex].label}`, 'auto');
          Sim.resolve(g, item, ex);
          return;
        }
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
        if (Sim.pickRule(g, item) === 'fill') { Sim.autoFill(g, item); return; }
        // 空位：现在空着的工位；博士生读五六年，还要算上一年内要毕业离开的人（新生入学时他们差不多也走了）
        const leaving = S.leavingSoon(g);
        const free = Math.max(1, G.desks(g) - g.members.length + 1);
        const left = Object.assign({}, item.quota);
        item.offers = [];
        item.cands.slice().sort((a, b) => b.q * b.accept - a.q * a.accept).forEach(c => {
          if (item.offers.length >= free + (c.role === 'phd' ? leaving : 0) || left[c.role] <= 0) return;
          left[c.role]--;
          item.offers.push(c.cid);
        });
        Sim.resolve(g, item);
        return;
      }
      case 'pool': {
        if (Sim.pickRule(g, item) === 'fill') { Sim.autoFill(g, item); return; }
        const best = item.cands.slice().sort((a, b) => b.q - a.q)[0];
        const ok = best && g.members.length < G.desks(g) && (item.role !== 'postdoc' || S.runway(g) > 18);
        Sim.resolve(g, item, ok ? [best.cid] : []);
        return;
      }
      default:
        Sim.resolve(g, item);
    }
  };

  // ---------- 招人名单：从高到低自动招满 ----------
  // 按总评从高到低（研究生招生季没面试的人只看得到范围，按范围的中间值）录用 / 发 offer，直到名额或经费用满：
  // 本科生、博士后：这次最多录用几个人；研究生招生季：博士 / 硕士各自的名额。不看工位（没工位的人照常凑合）。
  // 要发工资的（博士后、博士生、国内的硕士生；自带奖学金的不算）还要看经费：加上这些人的工资，账上的钱至少还能撑 18 个月
  Sim.autoFill = function (g, item) {
    const recruit = item.type === 'recruit';
    const cost = c => (c.fellow ? 0 : G.region(g).costs[c.role] || 0);
    const list = item.cands.map(c => ({ c, r: S.candRating(c, !recruit || c.interviewed) }))
      .sort((a, b) => b.r.v - a.r.v || (b.c.accept || 0) - (a.c.accept || 0));
    const left = recruit ? Object.assign({}, item.quota) : null;
    let extra = 0;
    const took = [];
    const why = new Set();
    for (const x of list) {
      const c = x.c;
      if (!recruit && took.length >= item.max) { why.add(`这次最多录用 ${item.max} 人`); break; }
      if (recruit && !(left[c.role] > 0)) { why.add(`${S.ROLE_NAMES[c.role]}名额用满了`); continue; }
      if (cost(c) && !S.affordable(g, extra + cost(c))) { why.add('经费撑不起更多人的工资'); continue; }
      took.push(x);
      extra += cost(c);
      if (recruit) left[c.role]--;
    }
    const names = took.map(x => `${x.c.name}（${recruit ? S.ROLE_NAMES[x.c.role] + ' · ' : ''}总评${x.r.text}）`).join('、');
    const what = took.length ? (recruit ? `给 ${names} 发 offer` : `录用 ${names}`) : recruit ? '没有发 offer' : '一个也没录用';
    G.log(g, `[自动招满] ${recruit ? item.name : item.title}：${what}${why.size ? `（${[...why].join('，')}）` : ''}`, 'auto');
    if (recruit) {
      item.offers = took.map(x => x.c.cid);
      Sim.resolve(g, item);
    } else Sim.resolve(g, item, took.map(x => x.c.cid));
  };

  Sim.autoResolve = function (g) {
    const mode = g.policies.auto;
    // 博士阶段：导师的事不管你开没开托管，都由导师自己拿主意；方针里设了自动规则的，托管全关也照样处理
    if (Sim._autoBusy || (mode === 'off' && !g.phd && !Sim.hasRules(g))) return;
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
