/* 核心系统（二）：基金、招生、教学、考核、毕业、年度总结、热点、成就、日常 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G, S = RS.Sys;
  const short = S.short;

  // ---------- 新游戏初始化 ----------
  S.setupNewGame = function (g) {
    const fromPool = RS.SCHOOLS[g.region][1].filter(s => s !== g.school);
    const phd = S.createMember(g, 'phd', { q: 52 + G.tierCfg(g).cand * 0.5, startDay: g.day - 360, trust: 70, school: U.pick(fromPool) });
    S.addMember(g, phd, true);
    S.story(g, phd, '跟着你从原来的学校转了过来');
    const ug = S.createMember(g, 'ug', { q: 58, school: g.school, trust: 60 });
    S.addMember(g, ug, true);
    // 第一个小组：你的核心方向，转来的博士生本来就做这个
    const core = S.createGroup(g, g.policies.coreTopic, true);
    phd.bio.interest = g.policies.coreTopic;
    S.setMemberGroup(g, phd, core.id, true);
    S.setMemberGroup(g, ug, core.id, true);
    // 转来的学生带着一篇快写完的论文；PI 自己也有一篇博后期间的存稿
    const p1 = S.newProject(g, phd, g.policies.coreTopic);
    p1.phase = 'write';
    p1.sc = { nov: 56 + U.normal(0, 3), sol: 55 + U.normal(0, 3) };
    p1.prog = Math.round(p1.need.write * 0.45);
    p1.acc.write = p1.prog * phd.stats.write;
    p1.wsum.write = p1.prog;
    const p2 = S.newProject(g, phd, g.policies.coreTopic);
    p2.sc = { nov: 60 + U.normal(0, 3), sol: 58 + U.normal(0, 3), cla: g.pi.stats.writing + U.normal(0, 3) };
    p2.q = S.calcQuality(g, p2);
    p2.phase = 'ready';
    phd.projectId = p1.id;
    g.year.joined = 0;
    G.log(g, `${phd.name} 跟着你从原来的学校转了过来，成为实验室的第一位博士生。`, 'good');
    G.log(g, `${g.school} 的本科生 ${ug.name} 主动找上门来，想跟你做科研。`, 'good');
    if (S.currentSemester(g)) g.flags.firstSem = true;
    G.milestone(g, `入职 ${g.school}，成为${G.titleName(g)}`);
    G.queue(g, { type: 'event', id: 'welcome', ctx: {} });
  };

  // ---------- PI 每日 ----------
  S.piDaily = function (g, ctx) {
    const pi = g.pi, pol = g.policies, perk = G.perk(g);
    let d = 0.95 * (perk.energyRegen || 1);
    const resting = ctx.resting;
    if (pol.focus === 'rest' || g.flags.restUntil > g.day) d += 1.0;
    d += ctx.fac.energy;
    if (S.isHoliday(g)) d += 1.2;
    const sem = S.currentSemester(g);
    const T = g.teaching.current;
    if (T && sem && sem.id === T.sem) {
      d -= T.energy * (perk.teachCost || 1);
      T.eSum += pi.energy;
      T.eN++;
    }
    if (!resting) {
      const nStud = g.members.filter(m => m.status === 'active').length;
      const meet = ({ weekly: 1.2, biweekly: 0.9, monthly: 0.6 }[pol.meeting] || 1) * (1 - ctx.fac.meeting);
      d -= 0.025 * nStud * meet;
      d -= { mentor: 0.3, grant: 0.25, research: 0.4, rest: 0 }[pol.focus] || 0;
      if (pol.intensity === 'crunch') d -= 0.1;
    }
    g.services = g.services.filter(s => s.until > g.day);
    d -= 0.12 * g.services.length;
    if (!resting) d -= S.groupEnergyCost(g);
    for (const prop of g.proposals) {
      if (prop.status !== 'writing') continue;
      d -= prop.perDay;
      prop.eSum += pi.energy;
      prop.eN++;
      if (pol.focus === 'grant') prop.fN++;
    }
    S.addEnergy(g, d);
    if (pi.energy <= 0 && (g.cooldowns.burnout || 0) <= g.day) {
      g.cooldowns.burnout = g.day + 60;
      g.flags.burnout = true;
      G.queue(g, { type: 'event', id: 'burnout_pi', ctx: {} });
    }
    if (!resting && pol.focus === 'research' && pi.energy > 15) {
      S.piResearch(g, ctx);
      pi.stats.research = Math.min(100, pi.stats.research + 0.004 * S.soft(pi.stats.research));
    }
    if (!resting && pol.focus === 'mentor') pi.stats.research = Math.min(100, pi.stats.research + 0.0015 * S.soft(pi.stats.research));
    if (!resting && pol.focus === 'grant') pi.stats.writing = Math.min(100, pi.stats.writing + 0.003 * S.soft(pi.stats.writing));
  };

  // ---------- 成员每日 ----------
  S.memberDaily = function (g, m, ctx) {
    if (m.status !== 'active') {
      if (g.day >= m.awayUntil) {
        if (m.status === 'intern') {
          S.bumpStat(m, 'code', 4);
          S.bumpStat(m, 'write', 1);
          S.addMood(m, 12);
          G.log(g, `${m.name} 实习归来，带回了不少工程经验`, 'info');
        } else {
          G.log(g, `${m.name} 回到了实验室`, 'info');
        }
        m.status = 'active';
        m.awayWhy = '';
      } else {
        S.addMood(m, 0.12);
        return;
      }
    }
    const pol = g.policies;
    let d = (65 - m.mood) * 0.006;
    d += { chill: 0.05, normal: 0, crunch: -0.07 }[pol.intensity] || 0;
    d += { weekly: -0.01, biweekly: 0, monthly: 0.01 }[pol.meeting] || 0;
    d += ctx.fac.mood + Math.min(0.02, ctx.teamMood) + (G.perk(g).moodBonus || 0);
    d += S.tAdd(m, 'mood');
    if (m.traits.includes('gamer') && g.facilities.console) d += 0.02;
    if (m.funding === 'ta') d -= 0.015;
    if (g.funds < 0) d -= 0.04;
    if (g.pi.energy < 20) d -= 0.03;
    if (g.members.length > G.desks(g)) d -= 0.02;
    if (S.isHoliday(g)) d += 0.1;
    // 信任高的学生更扛得住压力
    const trust = m.trust == null ? 55 : m.trust;
    d += (trust - 50) * 0.0004;
    // 做自己感兴趣的方向更开心；当组长有压力，但也更快成长
    const cur = m.projectId ? G.project(g, m.projectId) : null;
    if (cur && cur.topic === S.interestOf(m)) d += 0.01;
    if (S.leadsGroup(g, m)) { d -= 0.004; S.bumpStat(m, 'idea', 0.004); }
    S.addMood(m, d + U.normal(0, 0.15));
    if (pol.intensity === 'crunch') S.addTrust(m, -0.01);
    else if (pol.intensity === 'chill') S.addTrust(m, 0.004);
    if (pol.focus === 'mentor' && g.pi.energy >= 25) S.addTrust(m, 0.003);
    if (m.mood < 18) m.lowMood++;
    else m.lowMood = Math.max(0, m.lowMood - 2);
    if (m.lowMood >= 20 + trust * 0.3 && m.quitCd <= g.day && m.role !== 'visit') {
      m.quitCd = g.day + 120;
      m.lowMood = 0;
      G.queue(g, { type: 'event', id: 'quit_threat', ctx: { mid: m.id } });
    }
    if (m.funding === 'fellow' && m.fellowUntil && g.day >= m.fellowUntil) {
      m.funding = 'ra';
      m.fellowUntil = 0;
      G.log(g, `${m.name} 的奖学金到期了，转为由你资助`, 'info');
    }
    if (m.endDay && g.day >= m.endDay && (m.role === 'postdoc' || m.role === 'visit')) S.termEnd(g, m);
  };

  S.termEnd = function (g, m) {
    if (m.role === 'visit') {
      G.log(g, `访问学生 ${m.name} 结束访问，回国了`, 'info');
      S.removeMember(g, m, 'visit_end', '结束访问');
      return;
    }
    if (m.role === 'postdoc') {
      m.endDay = g.day + 30;
      if (!g.queue.some(q => q.id === 'postdoc_end' && q.ctx.mid === m.id)) G.queue(g, { type: 'event', id: 'postdoc_end', ctx: { mid: m.id } });
    }
  };

  // ---------- 基金 ----------
  S.prelimScore = g => {
    const since = g.day - 3 * 360;
    let s = 0;
    for (const p of g.papers) {
      if (p.day < since) break;
      s += { A: 14, B: 6, C: 3, W: 1, P: 0.5 }[p.tier] || 0;
    }
    return Math.min(100, s);
  };
  S.areaHeat = g => U.avg(G.area(g).topics, t => g.topics[t.id].heat);
  S.grantScore = function (g, def, effort, avgEnergy, focusShare) {
    const pi = g.pi.stats;
    const effortB = effort === 'full' ? 22 : 10;
    const energyF = avgEnergy == null ? 1 : U.clamp(0.75 + avgEnergy / 200, 0.75, 1.15);
    const quality = (pi.writing * 0.6 + effortB + 9 * (focusShare || 0)) * energyF;
    const repS = (100 * g.rep) / (g.rep + 120);
    return 0.45 * quality + 0.3 * repS + 0.25 * S.prelimScore(g) + (S.areaHeat(g) - 1) * 4 + (G.area(g).grantMult - 1) * 20 + (pi.network - 35) * 0.08;
  };
  S.grantProb = (g, def, effort, avgEnergy, focusShare) =>
    U.clamp(U.sigmoid((S.grantScore(g, def, effort, avgEnergy, focusShare) - def.bar) / 10), 0.03, 0.92);

  S.grantElig = function (g, def) {
    const r = def.elig ? def.elig(g) : null;
    if (r) return r;
    if (def.maxWins && G.hasWon(g, def.id)) return '已经获得过';
    if (def.maxApply && G.timesApplied(g, def.id) >= def.maxApply) return `最多只能申请 ${def.maxApply} 次`;
    if (g.proposals.some(p => p.id === def.id)) return '已有同类申请在评审中';
    if ((def.group === 'nsfc' || def.maxWins) && g.grants.some(x => x.id === def.id)) return '同类项目在研中';
    if (def.group === 'nsfc' && G.activeInGroup(g, 'nsfc') >= 2) return '限项：在研 + 在审的国自然项目已达 2 项';
    if (def.group === 'nsf_core' && G.activeInGroup(g, 'nsf_core') >= 2) return '在研 + 在审的 NSF 核心项目已达 2 项';
    if (def.maxActive && g.grants.filter(x => x.id === def.id).length >= def.maxActive) return '同类项目还在执行中';
    return null;
  };
  S.grantDeadline = (g, def) => G.nextDate(g.day + 1, def.deadline[0], def.deadline[1]);
  S.grantEnergy = (def, effort) => def.effort * (effort === 'full' ? 1 : 0.5);

  S.checkGrantCalls = function (g) {
    const doy = G.doy(g);
    const ids = G.region(g).grants.filter(x => x.open && !x.special && G.dayOf(x.open[0], x.open[1]) === doy).map(x => x.id);
    if (!ids.length) return;
    if (!ids.some(id => !S.grantElig(g, G.grantDef(g, id)))) {
      G.log(g, `${ids.map(id => G.grantDef(g, id).name).join('、')} 开放申请（你目前不符合申请条件）`, 'info');
      return;
    }
    const deadlines = {};
    ids.forEach(id => { deadlines[id] = S.grantDeadline(g, G.grantDef(g, id)); });
    G.queue(g, { type: 'grants', ids, deadlines });
  };

  S.applyGrant = function (g, id, effort, deadline) {
    const def = G.grantDef(g, id);
    if (!def || S.grantElig(g, def)) return false;
    const days = Math.max(10, deadline - g.day);
    g.proposals.push({
      id, name: def.name, effort, group: def.group || null, start: g.day, deadline,
      perDay: S.grantEnergy(def, effort) / days, eSum: 0, eN: 0, fN: 0,
      status: 'writing', resultDay: deadline + def.result,
    });
    G.log(g, `开始撰写 ${def.name} 申请书（${effort === 'full' ? '全力以赴' : '正常投入'}），截止 ${G.mdStr(deadline)}`, 'info');
    return true;
  };

  S.proposalsDaily = function (g) {
    for (const prop of g.proposals.slice()) {
      if (prop.status === 'writing' && g.day >= prop.deadline) {
        prop.status = 'submitted';
        G.log(g, `${prop.name} 申请书已提交，预计 ${G.monthStr(prop.resultDay)} 出结果`, 'info');
      } else if (prop.status === 'submitted' && g.day >= prop.resultDay) {
        S.grantResult(g, prop);
      }
    }
  };

  S.grantResult = function (g, prop) {
    const def = G.grantDef(g, prop.id);
    g.proposals.splice(g.proposals.indexOf(prop), 1);
    const avgE = prop.eN ? prop.eSum / prop.eN : g.pi.energy;
    const p = S.grantProb(g, def, prop.effort, avgE, prop.eN ? prop.fN / prop.eN : 0);
    const won = Math.random() < p;
    g.grantLog.push({ id: def.id, name: def.name, d: g.day, won, amount: def.amount, nsfc: !!def.nsfc });
    g.pi.stats.writing = Math.min(100, g.pi.stats.writing + 0.6 * S.soft(g.pi.stats.writing));
    const big = def.amount >= g.startup * 0.25 || def.title || def.kind === 'gpu';
    if (won) {
      S.awardGrant(g, def);
      const what = def.kind === 'gpu' ? '一台算力服务器' : `${G.money(g, def.amount)}（${Math.round(def.months / 12 * 10) / 10} 年）`;
      if (big) G.queue(g, { type: 'notice', tone: 'gold', icon: 'money', fx: 'coins', title: `${def.name} 获批！`, text: `恭喜！你的 <b>${def.name}</b> 申请获得资助：${what}。<br>${def.title ? `你获得了「${def.title}」称号！` : '经费会按月拨付到账户。'}` });
      else RS.bus.emit('toast', { text: `${def.name} 获批：${what}`, kind: 'good' });
    } else {
      G.log(g, `${def.name} 申请未获资助`, 'bad');
      S.addEnergy(g, -3);
      if (big) G.queue(g, { type: 'notice', tone: 'bad', icon: 'cross', title: `${def.name} 未获资助`, text: `很遗憾，<b>${def.name}</b> 没有中。评审意见写着：“${U.pick(['研究基础尚显薄弱', '创新性论证不足', '技术路线不够清晰', '与已有工作区别不大', '预期成果过于乐观', 'Very Good, but not Excellent'])}”。<br>明年再战！` });
      else RS.bus.emit('toast', { text: `${def.name} 未获资助`, kind: 'bad' });
    }
  };

  S.awardGrant = function (g, def, amountOverride) {
    if (def.kind === 'gpu') {
      const spec = S.bestGpu(g);
      g.gpus[spec.id] = (g.gpus[spec.id] || 0) + 1;
      G.log(g, `获得捐赠：${spec.name}（+${spec.units} 算力）`, 'gold');
    } else {
      const amount = amountOverride || def.amount;
      const oh = G.overhead(g, def.kind);
      const net = amount * (1 - oh);
      g.grants.push({ id: def.id, name: def.name, kind: def.kind || 'grant', group: def.group || null, total: amount, net, monthly: net / def.months, months: def.months, monthsLeft: def.months, start: g.day });
      g.stats.grantTotal += amount;
      g.year.grants += amount;
      G.log(g, `${def.name} 获批，总额 ${G.money(g, amount)}${oh > 0 ? `（扣除 ${Math.round(oh * 100)}% 管理费后实际到账 ${G.money(g, net)}）` : ''}`, 'gold');
    }
    g.stats.grantsWon++;
    S.addRep(g, def.prestige || 0);
    if (def.title && !g.titles.includes(def.title)) g.titles.push(def.title);
    G.milestone(g, `获得 ${def.name}`);
    RS.bus.emit('grant', { def });
  };

  // 主动寻找企业合作
  S.seekContract = function (g) {
    if ((g.cooldowns.seek || 0) > g.day) return '最近刚联系过企业，过段时间再试';
    if (g.grants.filter(x => x.kind === 'contract').length >= 2) return '手上的企业项目已经够多了';
    if (g.pi.energy < 10) return '精力不足';
    g.cooldowns.seek = g.day + 150;
    S.addEnergy(g, -8);
    const p = U.clamp(0.3 + g.rep / 300 + (g.pi.stats.network - 35) / 150, 0.2, 0.85) * (G.perk(g).contract || 1);
    if (Math.random() < p) {
      G.queue(g, { type: 'event', id: 'industry_contract', ctx: { company: U.pick(G.region(g).companies), mult: U.range(0.8, 1.4) } });
      return null;
    }
    G.log(g, '跑了几家企业，暂时没有谈成合作', 'bad');
    return null;
  };

  // ---------- 招生 ----------
  const ROLE_Q = { phd: 0, ms: -8, ug: -14, postdoc: 12, visit: -4 };
  function noisyRange(v) {
    return { lo: U.clamp(Math.round(v - U.int(4, 12)), 1, 99), hi: U.clamp(Math.round(v + U.int(4, 12)), 1, 99) };
  }
  // opts.own: 来自你自己学校（课堂发掘、本科生招募、敲门的学生）
  S.genCandidate = function (g, role, qBonus, opts) {
    opts = opts || {};
    const T = G.tierCfg(g);
    const repB = Math.min(10, g.rep / 25);
    const fellowB = g.flags.fellowship && (role === 'phd' || role === 'ms') ? 6 : 0;
    let q = U.clamp(46 + T.cand + repB + fellowB + (qBonus || 0) + U.normal(0, 11), 18, 92);
    const st = U.clamp((q > 64 ? 2 : q > 50 ? 1 : 0) + (U.chance(0.15) ? U.pick([-1, 1]) : 0), 0, 2);
    const own = !!opts.own || ((role === 'phd' || role === 'ms') && U.chance(0.15));
    const pool = RS.SCHOOLS[g.region][st].filter(s => s !== g.school);
    const school = own ? g.school : U.pick(pool.length ? pool : RS.SCHOOLS[g.region][st]);
    const stats = S.genStats(q + ROLE_Q[role]);
    const traits = RS.randomTraits(q);
    if (traits.includes('mathy')) stats.idea = U.clamp(stats.idea + 6, 8, 95);
    const fellow = g.region === 'us' && role === 'phd' && q > 66 && U.chance(0.35);
    const bio = RS.genBio(role, traits, school);
    bio.interest = opts.interest || S.randomInterest(g);
    const accept = role === 'phd' || role === 'ms'
      ? U.clamp(0.58 + T.offer + g.rep / 500 + (g.pi.stats.network - 35) / 300 - Math.max(0, q - 55) / 70 + (fellowB ? 0.1 : 0), 0.12, 0.95)
      : 1;
    return {
      cid: G.nid(g, 'c'), name: RS.randomName(g.region), role, avatar: RS.randomAvatar(),
      school, own, q, stats, traits, bio,
      pot: U.clamp(U.normal(1 + (q - 50) / 200, 0.15), 0.65, 1.45), fellow,
      pubs: q > 70 ? U.int(1, 3) : q > 58 ? U.int(0, 2) : U.chance(0.2) ? 1 : 0, accept,
      est: { idea: noisyRange(stats.idea), code: noisyRange(stats.code), write: noisyRange(stats.write) },
      shown: traits.filter(() => U.chance(0.5)), interviewed: false,
    };
  };

  S.recruitQuota = (g, cyc) => ({ phd: cyc.quota.phd[g.pi.title] || 0, ms: cyc.quota.ms[g.pi.title] || 0 });

  S.openRecruit = function (g, cyc) {
    const quota = S.recruitQuota(g, cyc);
    if (quota.phd + quota.ms <= 0) return;
    const n = U.clamp(4 + Math.floor(g.rep / 45) + (2 - g.tier), 4, 10);
    const cands = [];
    for (let i = 0; i < n; i++) {
      const role = quota.phd > 0 && (quota.ms === 0 || U.chance(0.55)) ? 'phd' : 'ms';
      cands.push(S.genCandidate(g, role));
    }
    G.queue(g, { type: 'recruit', cycle: cyc.id, name: cyc.name, text: cyc.text, quota, cands, offers: [] });
  };

  S.interview = function (g, item, cid) {
    const c = item.cands.find(x => x.cid === cid);
    if (!c || c.interviewed) return;
    if (g.pi.energy < 2) return;
    c.interviewed = true;
    c.accept = Math.min(0.97, c.accept + 0.05);
    S.addEnergy(g, -2);
  };

  S.confirmOffers = function (g, item) {
    const cyc = G.region(g).recruit.find(c => c.id === item.cycle);
    const offered = item.cands.filter(c => item.offers.includes(c.cid));
    if (!offered.length) { G.log(g, `${item.name}：本轮没有发放 offer`, 'info'); return; }
    const resultDay = G.nextDate(g.day + 1, cyc.result[0], cyc.result[1]);
    G.schedule(g, resultDay, 'recruitResult', { cycle: cyc.id, cands: offered });
    G.log(g, `${item.name}：向 ${offered.map(c => c.name).join('、')} 发放了 offer，${G.mdStr(resultDay)} 揭晓结果`, 'info');
  };

  S.memberFromCandidate = function (g, c, startDay) {
    const m = S.createMember(g, c.role, { name: c.name, avatar: c.avatar, stats: c.stats, traits: c.traits, pot: c.pot, school: c.school, startDay, trust: c.own ? 62 : undefined });
    if (c.bio) m.bio = c.bio;
    if (c.fellow) { m.funding = 'fellow'; m.fellowUntil = startDay + 3 * 360; }
    if (c.from) S.story(g, m, c.from);
    return m;
  };

  S.recruitResult = function (g, data) {
    const cyc = G.region(g).recruit.find(c => c.id === data.cycle);
    const joinDay = G.nextDate(g.day + 1, cyc.join[0], cyc.join[1]);
    const yes = [], no = [];
    data.cands.forEach(c => (Math.random() < c.accept ? yes : no).push(c));
    yes.forEach(c => {
      if (cyc.early) {
        const m = S.memberFromCandidate(g, c, joinDay);
        m.preUntil = joinDay;
        S.addMember(g, m);
      } else {
        G.schedule(g, joinDay, 'join', { cand: c });
      }
    });
    const others = G.region(g).univs.filter(u => u !== g.school).concat(G.region(g).companies.slice(0, 2));
    const lines = [];
    yes.forEach(c => lines.push(`<span class="good">✔ ${U.esc(c.name)}（${S.ROLE_NAMES[c.role]}）接受了 offer</span>`));
    no.forEach(c => lines.push(`<span class="bad">✘ ${U.esc(c.name)} 去了 ${U.esc(U.pick(others))}</span>`));
    const when = cyc.early ? '他们会以“预备生”身份提前进组，' + G.monthStr(joinDay) + '正式入学。' : `他们将在 ${G.dateStr(joinDay)} 入学。`;
    G.queue(g, { type: 'notice', tone: yes.length ? 'good' : 'bad', icon: 'people', title: `${cyc.name}：结果揭晓`, text: lines.join('<br>') + (yes.length ? `<br><br>${when}` : '<br><br>今年颗粒无收……明年继续努力。') });
    G.log(g, `${cyc.name}：${yes.length} 人接受、${no.length} 人拒绝`, yes.length ? 'good' : 'bad');
  };

  S.joinCandidate = function (g, c) {
    const m = S.memberFromCandidate(g, c, g.day);
    S.addMember(g, m);
  };

  S.ugPool = function (g) {
    if ((g.cooldowns.ug || 0) > g.day) return `${G.daysText(g.cooldowns.ug - g.day)}才能再次招募`;
    g.cooldowns.ug = g.day + 120;
    const cands = [0, 1, 2].map(() => Object.assign(S.genCandidate(g, 'ug', -2, { own: true }), { from: '响应招募通知加入' }));
    G.queue(g, { type: 'pool', role: 'ug', title: '招募本科生科研助理', text: `在 ${g.school} 的学院群里发了招募通知，有几位本科生报名。本科生不需要发工资，可以给博士生打下手；表现好的话还能留下来读研。`, cands, max: 2 });
    return null;
  };
  S.postdocSearch = function (g) {
    if (g.flags.postdocSearch) return '招聘广告已经发出，请耐心等待';
    g.flags.postdocSearch = true;
    const day = g.day + U.int(25, 45);
    G.schedule(g, day, 'postdocPool', {});
    G.log(g, `发布了博士后招聘广告，预计 ${G.mdStr(day)} 前后收到申请`, 'info');
    return null;
  };
  S.postdocPool = function (g) {
    g.flags.postdocSearch = false;
    const n = U.clamp(2 + Math.floor(g.rep / 120), 2, 4);
    const cands = [];
    for (let i = 0; i < n; i++) cands.push(S.genCandidate(g, 'postdoc', 4));
    const cost = G.money(g, G.region(g).costs.postdoc);
    G.queue(g, { type: 'pool', role: 'postdoc', title: '博士后申请', text: `收到了 ${n} 份博士后申请。博士后能力强、可以独立带课题，但每月需要 ${cost} 的工资，合同两年。`, cands, max: 1 });
  };
  S.hirePool = function (g, item, cids) {
    const picked = item.cands.filter(c => cids.includes(c.cid)).slice(0, item.max);
    picked.forEach(c => S.joinCandidate(g, c));
    if (!picked.length) G.log(g, `${item.title}：这次没有录用`, 'info');
  };

  // ---------- 教学 ----------
  S.semesterStart = function (g, sem) {
    if (!g.flags.firstSem) {
      g.flags.firstSem = true;
      G.log(g, `${sem.name}开始了。新教师的第一个学期免教学任务，专心搭建实验室吧`, 'info');
      return;
    }
    const ugCourse = U.pick(G.region(g).courses);
    const t = U.chance(0.6) ? G.topic(g, g.policies.coreTopic) : U.pick(G.area(g).topics);
    G.queue(g, { type: 'event', id: 'teaching', ctx: { sem: sem.id, semName: sem.name, big: ugCourse, grad: `${t.name}专题研讨`, gradTopic: t.id } });
  };
  // 本科课程的考核要求（还没拿到终身教职时看考核，之后看下一次晋升）
  S.ugTarget = function (g) {
    if (!g.pi.tenured) return G.tierCfg(g).req.ugCourses || 0;
    const pr = G.region(g).promotions.find(p => p.to === g.pi.title + 1);
    return pr ? pr.ugCourses || 0 : 0;
  };
  S.setTeaching = function (g, sem, c) {
    g.teaching.current = c ? Object.assign({ sem, eSum: 0, eN: 0 }, c) : null;
  };
  S.semesterEnd = function (g, sem) {
    const T = g.teaching.current;
    if (!T || T.sem !== sem.id) return;
    const pi = g.pi.stats;
    const avgE = T.eN ? T.eSum / T.eN : g.pi.energy;
    const ev = U.clamp(3.2 + (pi.teaching - 45) / 45 + (avgE - 50) / 120 + T.mod + U.normal(0, 0.22), 1.5, 5);
    g.teaching.evals.push(Math.round(ev * 100) / 100);
    g.teaching.count++;
    pi.teaching = Math.min(100, pi.teaching + 3 * S.soft(pi.teaching));
    g.teaching.current = null;
    G.log(g, `《${T.name}》课程结束，学生评教 ${ev.toFixed(2)} / 5`, ev >= 4 ? 'good' : ev < 3 ? 'bad' : 'info');
    const room = g.members.length < G.desks(g) + 2;
    const kind = T.kind || (T.mod < 0 ? 'ug' : 'grad'); // 兼容旧存档
    if (kind === 'ug') {
      g.teaching.ug = (g.teaching.ug || 0) + 1;
      // 大课学生多：更容易发掘本科生；评教高还可能拿教学奖
      if (ev >= 4.3) {
        S.addRep(g, 2);
        G.log(g, `《${T.name}》评教优秀，你获得了学院的本科教学优秀奖`, 'gold');
        RS.bus.emit('toast', { text: '获得本科教学优秀奖！', kind: 'gold' });
      }
      if (room && U.chance(0.55)) {
        const n = U.chance(0.4) ? 2 : 1;
        const cands = [];
        for (let i = 0; i < n; i++) cands.push(Object.assign(S.genCandidate(g, 'ug', 8, { own: true }), { from: `在你的本科课《${T.name}》上被发掘` }));
        G.queue(g, { type: 'pool', role: 'ug', title: '课堂上的好苗子', text: `《${T.name}》是一门 ${g.school} 的本科大课，期末有 ${n} 位表现出色的学生来问能不能加入你的实验室。`, cands, max: n });
      }
    } else {
      g.teaching.grad = (g.teaching.grad || 0) + 1;
      // 研究生专题课：备课和讨论让你对这个方向理解更深
      const tid = T.topic || g.policies.coreTopic;
      g.expertise[tid] = Math.min(10, (g.expertise[tid] || 0) + 0.4);
      G.log(g, `准备《${T.name}》让你对「${G.topic(g, tid).name}」的理解更深了（方向积累 +0.4）`, 'info');
      if (room && U.chance(0.3)) {
        const c = Object.assign(S.genCandidate(g, 'ms', 8, { own: true, interest: tid }), { from: `在你的研究生课《${T.name}》上被发掘` });
        G.queue(g, { type: 'pool', role: 'ms', title: '课堂上的好苗子', text: `《${T.name}》课上有位 ${g.school} 的硕士生对你的方向特别感兴趣，想加入你的实验室。`, cands: [c], max: 1 });
      }
    }
  };

  // ---------- 假期 ----------
  S.holidayStart = function (g, h) {
    if (h.away) {
      g.members.forEach(m => {
        if (m.status === 'active' && !/^[A-Za-z]/.test(m.name)) {
          m.status = 'away';
          m.awayUntil = g.day + Math.min(h.len, 10);
          m.awayWhy = '回家过年';
        }
      });
      G.log(g, `${h.name}到了，大部分学生回家过年，实验室安静了下来`, 'info');
    } else {
      G.log(g, `${h.name}开始了，大家的效率都下降了一些`, 'info');
    }
  };

  // ---------- 毕业 ----------
  S.graduationSeason = function (g) {
    for (const m of g.members.slice()) {
      const yrs = S.memberYears(g, m);
      if (m.role === 'phd') {
        const ready = (yrs >= 3.8 && (m.pubsA >= 3 || m.pubs >= 5)) || yrs >= 5.6;
        if (ready) G.queue(g, { type: 'event', id: 'phd_grad', ctx: { mid: m.id } });
      } else if (m.role === 'ms' && yrs >= 1.7) {
        const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
        if (avg >= 55 && m.pubs >= 1 && G.region(g).recruit.length) G.queue(g, { type: 'event', id: 'ms_to_phd', ctx: { mid: m.id } });
        else S.graduate(g, m);
      } else if (m.role === 'ug' && g.day >= m.endDay - 40) {
        const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
        if (avg >= 50) G.queue(g, { type: 'event', id: 'ug_to_phd', ctx: { mid: m.id } });
        else S.graduate(g, m);
      }
    }
  };

  // 毕业去向：看成果、能力、你的声望，也看学生自己的职业理想和你们之间的信任（推荐信写得好不好）
  S.placement = function (g, m) {
    const R = G.region(g);
    const trust = m.trust == null ? 55 : m.trust;
    const goal = m.bio ? m.bio.goal : 'undecided';
    const score = S.placementScore(g, m) + U.normal(0, 3);
    let acad = 0.3 + S.tAdd(m, 'academia') - (m.traits.includes('industry') ? 0.25 : 0);
    acad += { academia: 0.35, industry: -0.2, startup: -0.25, quant: -0.25, undecided: 0 }[goal] || 0;
    if (m.role === 'ms' || m.role === 'ug') acad = 0;
    const univs = R.univs.filter(u => u !== g.school);
    const univ = U.pick(univs.length ? univs : R.univs);
    if ((m.role === 'phd' || m.role === 'postdoc') && score > 15 && U.chance(U.clamp(acad + 0.15, 0, 0.95))) {
      const top = score > 24;
      if (trust >= 70 && U.chance(0.12)) return { text: `${g.school} 助理教授（留校任教）`, kind: 'prof', rep: top ? 10 : 6 };
      return { text: `${univ} 助理教授`, kind: 'prof', rep: top ? 10 : 5 };
    }
    if (m.role === 'phd' && score > 9 && U.chance(U.clamp(acad, 0, 0.9))) return { text: `${univ} 博士后`, kind: 'postdoc', rep: 2 };
    const co = U.pick(R.companies);
    if (m.role === 'ug') return { text: score > 4 ? `${univ} 读研` : `${co} 工程师`, kind: 'other', rep: 0.5 };
    if (goal === 'startup' && score > 8 && U.chance(0.6)) return { text: `创办了一家${U.pick(['AI', '芯片', '机器人', '数据', '安全'])}初创公司`, kind: 'industry', rep: 2 };
    if (goal === 'quant' && U.chance(0.7)) return { text: `${R.companies.find(c => /量化/.test(c)) || co} 研究员`, kind: 'industry', rep: 1 };
    return { text: `${co} ${score > 12 ? '研究科学家' : '算法工程师'}`, kind: 'industry', rep: score > 12 ? 2 : 1 };
  };

  S.graduate = function (g, m) {
    const pl = S.placement(g, m);
    if (m.role === 'phd') {
      g.stats.phdGrads++;
      g.year.grads++;
      G.milestone(g, `博士生 ${m.name} 毕业，去向：${pl.text}`);
    }
    if (m.role === 'ms') g.stats.msGrads++;
    if (pl.kind === 'prof') g.stats.profGrads++;
    S.addRep(g, pl.rep);
    G.log(g, `${m.name}（${S.ROLE_NAMES[m.role]}）毕业了！去向：${pl.text}`, 'good');
    S.removeMember(g, m, 'graduated', pl.text);
    RS.bus.emit('graduate', { m, pl });
    return pl;
  };

  // ---------- 考核 ----------
  S.evalCriteria = function (g, kind) {
    const R = G.region(g), req = G.tierCfg(g).req;
    const out = [];
    R.evalKeys.forEach(k => {
      let need = req[k];
      if (kind === 'mid') {
        if (k === 'teaching') need = Math.round((need - 0.2) * 10) / 10;
        else if (k === 'nsfc') need = 0;
        else if (k === 'funding') need = Math.round(need * 0.35);
        else need = Math.max(1, Math.round(need * 0.4));
      }
      if (need <= 0) return;
      const cur = G.metric(g, k);
      out.push({ key: k, name: G.METRIC_NAMES[k], cur, need, ok: cur >= need });
    });
    return out;
  };
  S.evalDay = function (g, kind) {
    const R = G.region(g);
    const year = kind === 'mid' ? R.midYear : R.finalYear + (g.flags.extended ? 1 : 0);
    return G.nextDate(g.startDay + 360 * (year - 1), R.evalDate[0], R.evalDate[1]);
  };
  S.nextEval = function (g) {
    if (g.pi.tenured) return null;
    if (!g.evalDone.mid) return { kind: 'mid', day: S.evalDay(g, 'mid'), name: g.region === 'cn' ? '三年中期考核' : '三年中期评估' };
    if (!g.evalDone.final) return { kind: 'final', day: S.evalDay(g, 'final'), name: g.region === 'cn' ? '六年终期考核（非升即走）' : 'Tenure 评审' };
    return null;
  };

  S.runEvaluation = function (g, kind) {
    const crit = S.evalCriteria(g, kind);
    const ratio = U.avg(crit, c => Math.min(1, c.cur / c.need));
    const all = crit.every(c => c.ok);
    g.evalDone[kind] = true;
    let result, text;
    if (kind === 'mid') {
      if (all) { result = 'pass'; S.addRep(g, 2); S.addEnergy(g, 10); text = '中期考核顺利通过！系主任拍了拍你的肩膀：“继续保持。”'; }
      else if (ratio >= 0.7) { result = 'warn'; text = '中期考核勉强通过，但评审委员会指出了几项明显短板。后三年要加油了。'; }
      else { result = 'fail'; S.addRep(g, -3); S.addEnergy(g, -10); text = '中期考核结果很不理想，系里对你的进展表示担忧。如果终期考核还是这样，恐怕……'; }
      G.milestone(g, `中期考核：${{ pass: '通过', warn: '有条件通过', fail: '不理想' }[result]}`);
    } else {
      if (all) {
        result = 'pass';
        g.pi.tenured = true;
        g.pi.title = 1;
        g.pi.tenureDay = g.day;
        S.addRep(g, 15);
        S.addEnergy(g, 30);
        text = g.region === 'cn' ? '恭喜！你通过了预聘期考核，获得长聘，晋升为长聘副教授！“非升即走”的达摩克利斯之剑终于落下了——落在了别人头上。' : '恭喜！你获得了终身教职（Tenure），晋升为副教授！从此再也没人能赶你走了。';
        G.milestone(g, g.region === 'cn' ? '通过终期考核，获得长聘' : '获得终身教职（Tenure）');
      } else if (ratio >= 0.85 && !g.flags.extended) {
        result = 'extend';
        g.flags.extended = true;
        g.evalDone.final = false;
        text = '评审委员会认为你“非常接近标准”，决定给你一年延长期，明年再评一次。最后的机会了！';
        G.milestone(g, '终期考核延期一年');
      } else {
        result = 'fail';
        text = g.region === 'cn' ? '很遗憾，你没有通过预聘期考核。按照“非升即走”的规定，你需要离开学校了……' : '很遗憾，你没有拿到 Tenure。按照惯例，你还有一年的“终止年”，之后就要离开学校了……';
      }
    }
    G.queue(g, { type: 'eval', kind, crit, result, text });
    if (kind === 'final' && result === 'fail') S.endGame(g, 'fail');
  };

  S.checkPromotion = function (g) {
    const R = G.region(g);
    const pr = R.promotions.find(p => p.to === g.pi.title + 1);
    if (!pr) return;
    const since = (g.day - (g.pi.title === 1 ? g.pi.tenureDay : g.pi.promoDay)) / 360;
    if (since >= pr.after && g.rep >= pr.rep && g.stats.pubs.A >= pr.papersA && (g.teaching.ug || 0) >= (pr.ugCourses || 0)) {
      g.pi.title = pr.to;
      g.pi.promoDay = g.day;
      S.addRep(g, 10);
      G.milestone(g, `晋升为${R.titles[pr.to]}`);
      G.queue(g, { type: 'notice', tone: 'gold', icon: 'star', fx: 'confetti', title: '晋升！', text: `学校批准了你的晋升申请，你现在是 <b>${R.titles[pr.to]}</b> 了！招生名额也增加了。` });
    }
  };
  S.checkHonors = function (g) {
    for (const h of G.region(g).honors) {
      if (g.honors.some(x => x.id === h.id)) continue;
      if (!h.cond(g) || !U.chance(h.chance)) continue;
      g.honors.push({ id: h.id, name: h.name, d: g.day });
      S.addRep(g, h.rep);
      G.milestone(g, `获得荣誉：${h.name}`);
      G.queue(g, { type: 'notice', tone: 'gold', icon: 'trophy', fx: 'confetti', title: h.name, text: `你当选 / 获得了 <b>${h.name}</b>！<br>这是对你多年来学术贡献的高度认可。声望 +${h.rep}。` });
      break;
    }
  };
  S.annualCheck = function (g) {
    const cy = G.careerYear(g);
    const R = G.region(g);
    if (!g.pi.tenured) {
      if (cy === R.midYear && !g.evalDone.mid) S.runEvaluation(g, 'mid');
      if (cy === R.finalYear + (g.flags.extended ? 1 : 0) && !g.evalDone.final) S.runEvaluation(g, 'final');
    } else {
      S.checkPromotion(g);
    }
    if (!g.ended || g.flags.continued) S.checkHonors(g);
    if (G.piAge(g) >= 65 && !g.flags.retired && !g.ended) S.endGame(g, 'retire');
  };

  S.endGame = function (g, kind) {
    if (kind === 'retire') g.flags.retired = true;
    g.ended = { kind, day: g.day };
    G.queue(g, { type: 'ending', kind });
  };

  S.score = function (g) {
    return Math.round(g.rep + g.stats.pubs.A * 5 + g.stats.cites / 50 + g.stats.phdGrads * 20 + g.stats.profGrads * 40 + g.honors.length * 50);
  };

  // ---------- 年度总结 ----------
  S.yearEnd = function (g) {
    const y = g.year;
    const cites = g.stats.cites - y.cites0;
    const score = y.papersA * 3 + y.papers + y.grants / (g.startup * 0.2) + cites / 200 + y.grads * 2;
    const first = g.day - g.startDay < 200;
    const grade = first ? '新' : score >= 18 ? 'S' : score >= 10 ? 'A' : score >= 5 ? 'B' : 'C';
    if (y.papersA >= 5) g.flags.harvest = true;
    if (grade === 'S') { S.addEnergy(g, 10); S.addRep(g, 3); }
    else if (grade === 'A') S.addEnergy(g, 5);
    const L = (g.ledger || {})[G.calYear(g)];
    const data = Object.assign({}, y, { year: G.calYear(g), cites, grade, funds: g.funds, rep: g.rep, h: g.stats.h, members: g.members.length,
      ledger: L ? JSON.parse(JSON.stringify(L)) : null });
    g.year = G.freshYear(g);
    if (RS.settings && RS.settings.yearSummary === false) {
      G.log(g, `${data.year} 年度总结：评级 ${grade}，A 类论文 ${data.papersA} 篇，新增引用 ${cites}`, 'info');
      return;
    }
    G.queue(g, { type: 'summary', data });
  };

  // ---------- 热点 ----------
  S.trendsMonthly = function (g) {
    const A = G.area(g);
    A.topics.forEach(t => {
      const s = g.topics[t.id];
      s.heat = U.clamp(s.heat + (t.heat - s.heat) * 0.03 + U.normal(0, 0.05), 0.3, 4);
    });
    if (U.chance(1 / 20)) {
      const t = U.weighted(A.topics, x => 1 / g.topics[x.id].heat);
      const s = g.topics[t.id];
      s.heat = Math.min(4, Math.max(s.heat, t.heat) * U.range(1.6, 2.1));
      G.queue(g, { type: 'event', id: 'hot_trend', ctx: { tid: t.id } });
    }
  };

  // ---------- 成就 ----------
  S.checkAchievements = function (g) {
    for (const a of RS.ACHIEVEMENTS) {
      if (g.achievements[a.id]) continue;
      let ok = false;
      try { ok = a.check(g); } catch (e) { ok = false; }
      if (ok) {
        g.achievements[a.id] = g.day;
        G.log(g, `成就解锁：${a.name}——${a.desc}`, 'gold');
        RS.bus.emit('achievement', a);
      }
    }
  };

  // ---------- 大型投资（后期花钱的地方，价格以美元计，中国区乘以 ppp） ----------
  S.BIG = [
    { id: 'outreach', name: '科普公开课', desc: '面向公众开一系列科普讲座。声望 +3，你的精力 -10', cost: 20000, cd: 360,
      req: g => (g.pi.energy < 10 ? '精力不足' : null), apply: g => { S.addRep(g, 3); S.addEnergy(g, -10); } },
    { id: 'host', name: '举办国际研讨会', desc: '在本校举办一场国际学术研讨会。声望 +12，人脉 +5', cost: 150000, cd: 720,
      req: g => (g.pi.tenured ? null : '需要终身教职'), apply: g => { S.addRep(g, 12); g.pi.stats.network = Math.min(100, g.pi.stats.network + 5); } },
    { id: 'fellowship', name: '设立实验室奖学金', desc: '以实验室名义设立博士生奖学金。之后招生时候选人质量 +6，接受 offer 的概率 +10%', cost: 400000, once: true,
      req: g => (g.rep >= 120 ? null : '需要声望 ≥ 120'), apply: g => { g.flags.fellowship = true; } },
    { id: 'center', name: '成立联合研究中心', desc: '与企业共建研究中心。之后五年每月都有一笔分成到账（总计约投入的 1.6 倍），声望 +20', cost: 1000000, once: true,
      req: g => (g.pi.title >= 2 ? null : '需要正教授职称'),
      apply: g => {
        const total = Math.round(S.bigCost(g, S.BIG.find(b => b.id === 'center')) * 1.6);
        g.grants.push({ id: 'center', name: '联合研究中心分成', kind: 'center', group: null, total, net: total, monthly: total / 60, months: 60, monthsLeft: 60, start: g.day });
        S.addRep(g, 20);
      } },
  ];
  S.bigCost = (g, b) => Math.round(b.cost * G.region(g).ppp);
  S.bigState = function (g, b) {
    const done = (g.flags.big || {})[b.id];
    if (b.once && done) return '已完成';
    if (b.cd && done && g.day - done < b.cd) return `${G.daysText(done + b.cd - g.day)}后可以再办`;
    const r = b.req(g);
    if (r) return r;
    if (g.funds < S.bigCost(g, b)) return '经费不足';
    return null;
  };
  S.doBig = function (g, id) {
    const b = S.BIG.find(x => x.id === id);
    if (!b) return '没有这个项目';
    const st = S.bigState(g, b);
    if (st) return st;
    S.spend(g, S.bigCost(g, b), 'invest');
    g.flags.big = g.flags.big || {};
    g.flags.big[id] = g.day;
    b.apply(g);
    G.log(g, `${b.name}（${G.money(g, S.bigCost(g, b))}）`, 'gold');
    G.milestone(g, b.name);
    RS.bus.emit('expand', {});
    return null;
  };

  // ---------- 玩家对成员的操作 ----------
  S.talk = function (g, m) {
    if (m.talkCd > g.day) return `${G.daysText(m.talkCd - g.day)}才能再谈心`;
    if (g.pi.energy < 4) return '你自己都没精力了';
    m.talkCd = g.day + 30;
    S.addEnergy(g, -4);
    S.addMood(m, U.int(10, 16));
    S.addTrust(m, 6);
    G.log(g, `你和 ${m.name} 聊了聊人生和科研，${RS.shortName(m.name)}的心情好多了`, 'info');
    return null;
  };
  S.bonusCost = (g, m) => {
    const c = G.region(g).costs;
    return Math.round(Math.max(c[m.role] || 0, c.phd * 0.5));
  };
  S.giveBonus = function (g, m) {
    if (m.bonusCd > g.day) return `${G.daysText(m.bonusCd - g.day)}才能再发`;
    const cost = S.bonusCost(g, m);
    if (g.funds < cost) return '经费不足';
    m.bonusCd = g.day + 90;
    S.spend(g, cost, 'welfare');
    S.addMood(m, 18);
    S.addTrust(m, 4);
    G.log(g, `给 ${m.name} 发了 ${G.money(g, cost)} 的奖金，${RS.shortName(m.name)}笑开了花`, 'info');
    return null;
  };
  S.taUsed = g => g.members.filter(m => m.funding === 'ta').length;
  S.setFunding = function (g, m, f) {
    if (m.role !== 'phd') return '只有博士生可以切换资助方式';
    if (f === 'ta') {
      if (!G.region(g).hasTA) return '这里没有助教岗位';
      if (S.taUsed(g) >= G.tierCfg(g).taSlots) return `系里只给了 ${G.tierCfg(g).taSlots} 个助教名额`;
    }
    if (m.funding === 'fellow') return '奖学金学生无需切换';
    m.funding = f;
    G.log(g, `${m.name} 的资助方式改为 ${S.fundName(g, f)}`, 'info');
    return null;
  };
  S.dismiss = function (g, m) {
    S.removeMember(g, m, 'dismissed', '离开实验室');
    S.addRep(g, -1);
    S.labMood(g, -5);
    G.log(g, `${m.name} 离开了实验室。大家的心情都有些低落`, 'bad');
  };
  S.changeTopic = function (g, p, tid) {
    if (p.phase !== 'idea') return '只有构思阶段的课题可以换方向';
    p.topic = tid;
    p.title = S.uniqueTitle(g, tid);
    p.prog = Math.floor(p.prog * 0.5);
    p.acc.idea *= 0.5;
    p.wsum.idea *= 0.5;
    G.log(g, `课题转向「${G.topic(g, tid).name}」：${short(p.title)}`, 'info');
    return null;
  };
})();
