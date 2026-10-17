/* 博士阶段：从博士一年级开始，读完博士找教职，再开始自己的 PI 生涯
 * 实现方式：你是导师实验室里的一名博士生（g.player），实验室照常运转，由导师（g.pi）自动管理；
 * 只有和你有关的决定才会停下来问你。拿到教职 offer 后，按你读博的成果生成新的 PI 存档。
 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G, S = RS.Sys;
  const short = S.short;

  S.PACE = {
    chill: { name: '佛系', desc: '效率 -15%，心情持续变好', work: 0.85, mood: 0.05, grow: 0.95 },
    normal: { name: '正常', desc: '劳逸结合', work: 1, mood: 0, grow: 1 },
    grind: { name: '卷', desc: '效率 +25%、成长更快，但心情持续下降', work: 1.25, mood: -0.07, grow: 1.1 },
  };
  S.me = g => (g && g.player ? G.member(g, g.player) : null);
  S.advisorType = g => RS.ADVISORS.find(a => a.id === (g.phd && g.phd.advisor)) || RS.ADVISORS[1];
  S.phdYear = g => { const m = S.me(g); return m ? Math.floor(S.memberYears(g, m)) + 1 : 0; };
  S.myPapers = g => g.papers.filter(p => !p.retracted && (p.authors || []).includes(g.player));
  // 只记一次的个人里程碑
  S.phdMilestone = function (g, key, text) {
    const P = g.phd;
    P.ms = P.ms || {};
    if (P.ms[key]) return;
    P.ms[key] = g.day;
    G.milestone(g, text, true);
  };

  // ---------- 新开一局博士生涯 ----------
  // o: { name, avatar, region, tier, school, areaId, coreTopic, coreSub, advisor, ugbg }
  G.newPhdGame = function (o) {
    const R = RS.REGIONS[o.region];
    const nm = RS.randomName(o.region);
    // 中文名直接叫“某某”（北美叫“某某 教授”），英文名叫 Prof. 姓
    const zh = /^[一-龥]+$/.test(nm);
    const piName = zh ? (o.region === 'cn' ? nm : `${nm} 教授`) : `Prof. ${nm.split(' ').slice(-1)[0]}`;
    const g = G.newGame({
      piName, labName: `${U.pick(RS.TITLE_PARTS.acr)} Lab`, school: o.school, region: o.region, tier: o.tier,
      areaId: o.areaId, coreTopic: o.coreTopic, coreSub: o.coreSub, perk: 'star', avatar: RS.randomAvatar(),
    });
    g.mode = 'phd';
    g.phd = {
      name: o.name, avatar: o.avatar, advisor: o.advisor || 'solid', ugbg: o.ugbg || 'blank',
      pace: 'normal', consult: 'ask', submit: 'auto', rebuttal: 'auto',
      network: 0, ta: 0, taEval: [], conf: 0, contacts: 0, interns: [], awards: [], mentees: [], bond: {},
      qual: false, qualTry: 0, qualAfter: 0, proposal: false, thesis: null,
      talkCd: 0, vacCd: 0, helpCd: 0, readyAsk: 0,
      round: 0, market: null, offers: null, path: null, pathPlace: '', bonus: 0, extraYears: 0,
    };
    return g;
  };

  // 课题已经做到一半的样子（给师兄师姐用）
  S.seedProject = function (g, m, phase, frac) {
    const p = S.newProject(g, m, S.pickSubFor(g, m));
    const st = m.stats, pi = g.pi.stats, exp = g.expertise[p.topic] || 0;
    if (phase !== 'idea') p.sc.nov = 0.72 * st.idea + 0.28 * pi.research + exp * 0.5 + U.normal(0, 4);
    if (phase === 'write') p.sc.sol = 0.78 * st.code + 0.22 * pi.research + exp * 0.3 + U.normal(0, 4);
    p.phase = phase;
    p.prog = Math.round(p.need[phase] * frac);
    p.acc[phase] = p.prog * S.phaseStat(m, phase);
    p.wsum[phase] = p.prog;
    p.contrib[m.id] = (phase === 'idea' ? 0 : p.need.idea) + (phase === 'write' ? p.need.exp : 0) + p.prog;
    return p;
  };

  S.setupPhd = function (g) {
    const adv = S.advisorType(g);
    const R = G.region(g), A = G.area(g), T = G.tierCfg(g);
    // 导师
    g.pi.title = adv.title;
    g.pi.tenured = adv.title >= 1;
    g.pi.stats = { research: adv.research, writing: adv.writing, network: adv.network, teaching: 55 };
    g.pi.energy = 85;
    g.rep = U.int(adv.rep[0], adv.rep[1]);
    g.room = adv.room;
    Object.assign(g.policies, { intensity: adv.intensity, meeting: adv.meeting, focus: adv.focus, auto: 'off', consult: 'auto' });
    for (let i = 0; i < adv.fac && i < RS.FACILITIES.length; i++) {
      const f = RS.FACILITIES[i];
      if (!f.req || g.facilities[f.req]) g.facilities[f.id] = g.day;
    }
    if (A.compute >= 0.3) {
      const av = S.gpuAvailable(g).filter(x => x.id !== 'ws');
      for (let i = 0; i < adv.gpu && av.length; i++) { const s = av[Math.min(av.length - 1, i % 2)]; g.gpus[s.id] = (g.gpus[s.id] || 0) + 1; }
    }
    // 小组和师兄师姐：你进的是导师核心方向下你选的那个子方向；人多的组还有别的子方向
    const core = S.createGroup(g, g.startSub, true);
    const n = U.int(adv.lab[0], adv.lab[1]);
    const sibling = () => {
      const same = G.topic(g, core.topic).subs.filter(s => !S.groupOfSub(g, s.id));
      const far = A.subs.filter(s => s.topic !== core.topic && !S.groupOfSub(g, s.id));
      return (same.length && (U.chance(0.7) || !far.length) ? U.pick(same) : U.pick(far)).id;
    };
    const second = n >= 5 ? S.createGroup(g, sibling(), true) : null;
    if (n >= 8) S.createGroup(g, sibling(), true);
    for (let i = 0; i < n; i++) {
      const role = i === 0 && adv.postdoc ? 'postdoc' : U.weighted(['phd', 'ms', 'ug'], r => ({ phd: 5, ms: R.id === 'cn' ? 2.5 : 1, ug: 1 }[r]));
      const yrs = role === 'phd' ? U.range(0.6, 4.6) : role === 'ms' ? U.range(0.3, 1.5) : role === 'postdoc' ? U.range(0.2, 1.4) : U.range(0.1, 1);
      const m = S.createMember(g, role, { q: 50 + T.cand * 0.6, startDay: g.day - Math.round(yrs * 360) });
      if (role === 'phd' || role === 'postdoc') {
        // 资深的已经发过几篇
        const k = Math.floor((role === 'postdoc' ? 4 : yrs) * U.range(0.6, 1.2));
        m.pubs = k; m.first = Math.round(k * 0.7); m.pubsA = Math.round(k * 0.6); m.firstA = Math.min(m.first, Math.round(m.pubsA * 0.7));
      }
      S.addMember(g, m, true);
      const gr = second && i % 3 === 2 ? second : g.groups.length > 2 && i % 3 === 1 ? g.groups[2] : core;
      if (U.chance(0.6)) m.bio.interest = gr.sub;
      S.setMemberGroup(g, m, gr.id, true);
      if (role !== 'ug') S.seedProject(g, m, U.pick(['idea', 'exp', 'exp', 'write']), U.range(0.1, 0.85));
    }
    if (n >= 4) {
      g.groups.forEach(gr => {
        const c = S.groupMembers(g, gr).filter(m => S.canLead(g, m) && !S.leadsGroup(g, m)).sort((a, b) => S.memberYears(g, b) - S.memberYears(g, a))[0];
        if (c) gr.lead = c.id;
      });
    }
    // 你
    const ug = RS.UG_BG.find(b => b.id === g.phd.ugbg) || RS.UG_BG[RS.UG_BG.length - 1];
    const stats = S.genStats(54 + T.cand * 0.5);
    for (const k in ug.stats || {}) stats[k] = U.clamp(Math.round(stats[k] + ug.stats[k]), 15, 95);
    const me = S.createMember(g, 'phd', { name: g.phd.name, avatar: g.phd.avatar, stats, startDay: g.day, trust: 60 });
    me.isPlayer = true;
    me.pot = U.clamp(me.pot + (ug.pot || 0), 0.85, 1.5);
    me.bio.goal = 'academia';
    me.bio.interest = core.sub;
    me.funding = 'ra';
    g.phd.network = ug.network || 0;
    S.addMember(g, me, true);
    g.player = me.id;
    S.setMemberGroup(g, me, core.id, true);
    S.story(g, me, `进入 ${g.school} 读博，导师是 ${g.pi.name}`);
    S.newProject(g, me, core.sub);
    // 导师手上的项目经费，够实验室撑过你读博的这几年
    const burn = Math.max(1000, S.expenses(g).total);
    const monthly = Math.round(burn * adv.funds);
    g.grants.push({ id: 'lab', name: R.id === 'cn' ? '导师的国家级项目' : '导师的 NSF 项目', kind: 'grant', group: null, total: monthly * 72, net: monthly * 72, monthly, months: 72, monthsLeft: 72, start: g.day });
    g.funds = g.startup = Math.round(burn * 18);
    g.year = G.freshYear(g);
    g.stats.peak = g.members.length;
    G.log(g, `你来到 ${g.school}，加入了 ${g.pi.name} 的 ${g.labName}，开始读博。`, 'good');
    G.milestone(g, `进入 ${g.school} 攻读博士学位，导师是 ${g.pi.name}`, true);
    if (S.currentSemester(g)) g.flags.firstSem = true;
    G.queue(g, { type: 'event', id: 'phd_welcome', ctx: {} });
  };

  // 导师每月管一管实验室：买卡、扩建、找经费、累了就歇歇；作风也会随机变化
  S.advisorAI = function (g) {
    const adv = S.advisorType(g);
    if (g.pi.energy < 25) g.policies.focus = 'rest';
    else if (g.policies.focus === 'rest') g.policies.focus = adv.focus;
    if (U.chance(0.1)) S.advisorDrift(g);
    const ctx = S.dayContext(g);
    if (G.area(g).compute >= 0.3 && ctx.ratio < 0.9 && g.funds > 0 && U.chance(0.6)) {
      const av = S.gpuAvailable(g).filter(x => x.id !== 'ws' && S.gpuPrice(g, x) < g.funds * 0.25);
      if (av.length) S.buyGpu(g, U.pick(av).id);
    }
    const next = RS.ROOMS[g.room + 1];
    if (next && g.members.length > G.desks(g) && g.funds > S.roomCost(g, next) * 2) {
      S.spend(g, S.roomCost(g, next), 'build');
      g.room++;
      S.assignDesks(g);
    }
    if (S.runway(g) < 12) S.seekContract(g);
  };

  // 导师的作风会变：组会频率、工作强度、精力放在哪。一半回到自己的习惯，一半随机
  const DRIFT = {
    meeting: { opts: ['weekly', 'biweekly', 'monthly'], text: { weekly: '把组会改成了每周一次', biweekly: '把组会改成了两周一次', monthly: '把组会改成了一个月一次' } },
    intensity: { opts: ['chill', 'normal', 'crunch'], text: { chill: '最近对大家很宽松，不怎么催进度了', normal: '恢复了正常的节奏', crunch: '开始天天催进度，实验室越来越卷了' } },
    focus: { opts: ['mentor', 'grant', 'research'], text: { mentor: '最近花很多时间指导学生', grant: '最近忙着写基金，没空管大家', research: '最近亲自下场做研究' } },
  };
  S.advisorDrift = function (g) {
    const adv = S.advisorType(g);
    const k = U.pick(Object.keys(DRIFT));
    const v = U.chance(0.5) ? adv[k] : U.pick(DRIFT[k].opts);
    if (!v || g.policies[k] === v || (k === 'focus' && g.policies.focus === 'rest')) return;
    g.policies[k] = v;
    G.log(g, `导师 ${g.pi.name} ${DRIFT[k].text[v]}`, k === 'intensity' && v === 'crunch' ? 'bad' : 'info');
  };
  // 导师自己拿主意：大体有自己的风格（偏向稳妥的默认选项），但带着随机性
  S.advisorDecide = function (g, item) {
    const adv = S.advisorType(g);
    const Sim = RS.Sim;
    switch (item.type) {
      case 'event': {
        const ev = Sim.buildEvent(g, item);
        const ok = ev ? ev.choices.map((c, i) => ({ c, i })).filter(x => !x.c.disabled) : [];
        const pick = ok.length ? U.weighted(ok, x => (x.c.def ? adv.stick : 1)) : null;
        Sim.resolve(g, item, pick ? pick.i : 0);
        return;
      }
      case 'grants': {
        // 每个能申请的项目随机决定申不申、花多少力气
        const pay = {}, groups = {};
        U.shuffle(item.ids).forEach(id => {
          const d = G.grantDef(g, id);
          if (S.grantElig(g, d) || (d.group && groups[d.group]) || !U.chance(adv.grantRate)) return;
          if (d.group) groups[d.group] = true;
          pay[id] = g.pi.energy > 40 && U.chance(0.6) ? 'full' : 'normal';
        });
        Sim.resolve(g, item, pay);
        return;
      }
      case 'recruit': {
        // 看人有自己的眼光：能力为主，但带点主观
        const free = Math.max(1, G.desks(g) - g.members.length + 1);
        const left = Object.assign({}, item.quota);
        const score = {};
        item.cands.forEach(c => { score[c.cid] = c.q * c.accept + U.normal(0, 12); });
        item.offers = [];
        if (U.chance(0.9)) {
          item.cands.slice().sort((a, b) => score[b.cid] - score[a.cid]).forEach(c => {
            if (item.offers.length >= free || left[c.role] <= 0) return;
            left[c.role]--;
            item.offers.push(c.cid);
          });
        }
        Sim.resolve(g, item);
        return;
      }
      case 'pool': {
        const c = U.pick(item.cands);
        const take = c && g.members.length < G.desks(g) + 1 && U.chance(item.role === 'postdoc' ? 0.45 : 0.6);
        Sim.resolve(g, item, take ? [c.cid] : []);
        return;
      }
      default:
        Sim.resolve(g, item);
    }
  };

  // 博士阶段：哪些事要问你（其余都由导师处理）
  S.playerFacing = function (g, item) {
    if (!g.phd) return true;
    if (item.type === 'jobmarket') return true;
    if (item.type === 'notice') return !!item.player;
    if (item.type === 'venue') { const p = G.project(g, item.pid); return !!p && p.lead === g.player; }
    if (item.type !== 'event') return false;
    const def = RS.EVENTS[item.id];
    if (def && def.phd) return true;
    if (item.id === 'ddl_rush' || item.id === 'rebuttal') { const p = G.project(g, (item.ctx || {}).pid); return !!p && p.lead === g.player; }
    return false;
  };

  // ---------- 每天 ----------
  S.phdDaily = function (g) {
    const m = S.me(g), P = g.phd;
    if (!m) return;
    const yrs = S.memberYears(g, m);
    const doy = G.doy(g);
    if (doy % 30 === 15) S.advisorAI(g);
    if (P.market) return; // 求职中，不再触发新的里程碑
    const queued = id => g.queue.some(q => q.type === 'event' && q.id === id);
    if (!P.qual && yrs >= 1.1 && g.day >= P.qualAfter && !queued('phd_qual')) {
      G.queue(g, { type: 'event', id: 'phd_qual', ctx: { roll: Math.random() } });
    } else if (P.qual && !P.proposal && yrs >= 2.4 && !queued('phd_proposal')) {
      G.queue(g, { type: 'event', id: 'phd_proposal', ctx: { opts: S.thesisOptions(g) } });
    }
    if (doy === G.dayOf(3, 1) && yrs >= 0.5 && m.status === 'active') {
      G.queue(g, { type: 'event', id: 'phd_intern', ctx: { company: U.pick(G.region(g).companies) } });
    }
    if (g.day >= P.readyAsk && !queued('phd_ready')) {
      const ok = S.gradStatus(g, m).ok;
      if ((ok && yrs >= 3.8) || yrs >= 5.8) {
        P.readyAsk = g.day + 360;
        G.queue(g, { type: 'event', id: 'phd_ready', ctx: { forced: yrs >= 5.8 } });
      }
    }
  };
  // 开题方向的候选：发过论文的方向、最感兴趣的方向、导师的核心方向
  S.thesisOptions = function (g) {
    const m = S.me(g);
    const cnt = {};
    S.myPapers(g).forEach(p => {
      const s = p.sub || (p.topic && G.asSub(g, p.topic));
      if (s) cnt[s] = (cnt[s] || 0) + (/一作/.test(S.authorPos(p, m.id)) ? 2 : 1);
    });
    const out = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
    [S.interestOf(m), g.startSub].forEach(s => { if (s && g.subs[s] && !out.includes(s)) out.push(s); });
    return out.slice(0, 3);
  };
  // 新学期：低年级可能要当助教
  S.phdSemester = function (g, sem) {
    const m = S.me(g);
    if (!m || g.phd.market || S.memberYears(g, m) >= 2.5) return;
    if (g.region === 'cn' && sem.id !== 'fall') return;
    if (!U.chance(g.region === 'us' ? 0.55 : 0.7)) return;
    G.queue(g, { type: 'event', id: 'phd_ta', ctx: { course: U.pick(G.region(g).courses), roll: Math.random() } });
  };
  // 你的论文发表了
  S.phdOnPublish = function (g, paper, v) {
    const m = S.me(g);
    if (!m || !paper.authors.includes(m.id) || v.tier === 'P') return;
    const pos = S.authorPos(paper, m.id);
    const first = /一作/.test(pos);
    if (first && v.tier === 'A') S.phdMilestone(g, 'firstA', `第一篇一作 A 类论文：${v.name} ${paper.year}`);
    if (paper.best) { g.phd.awards.push(`${v.name} 最佳论文`); S.phdMilestone(g, 'best-' + paper.id, `《${paper.title}》获 ${v.name} 最佳论文奖`); }
    if (first && v.type === 'conf' && v.tier !== 'W') {
      const gain = v.tier === 'A' ? 3 : 1.5;
      g.phd.network += gain;
      g.phd.conf++;
      G.log(g, `你去 ${v.name} 做了报告，认识了不少同行（人脉 +${gain}）`, 'good');
      if (U.chance(0.3)) G.queue(g, { type: 'event', id: 'phd_bigshot', ctx: { v: v.id, who: U.pick(['一位你读过很多论文的大牛', `${U.pick(G.region(g).univsTop || G.region(g).univs)} 的一位教授`, `${U.pick(G.region(g).companies)} 的研究总监`, '一位刚拿到 Tenure 的青年教授']) } });
    }
  };
  // 年终：你自己的年度小结
  S.phdYearEnd = function (g) {
    g.year = G.freshYear(g);
    const m = S.me(g);
    if (!m || g.phd.market) return;
    const yr = Math.max(1, Math.round(S.memberYears(g, m)));
    const mine = S.myPapers(g);
    const thisYear = mine.filter(p => p.day > g.day - 360);
    const firsts = thisYear.filter(p => /一作/.test(S.authorPos(p, m.id)));
    const cites = U.sum(mine, p => p.cites);
    const comment = firsts.some(p => p.tier === 'A') ? '这一年收获满满！' : thisYear.length ? '稳步前进。' : yr <= 1 ? '第一年主要在打基础，别着急。' : '这一年颗粒无收……明年加油。';
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    G.queue(g, {
      type: 'notice', player: true, tone: 'info', icon: 'calendar', title: `${G.calYear(g)} 年 · 读博第 ${yr} 年`,
      text: `<div class="summary"><div class="grow">${kv('今年发表', `${thisYear.length} 篇（一作 ${firsts.length}）`)}${kv('累计论文', `${m.pubs} 篇（一作 ${m.first || 0}，一作 A 类 ${m.firstA || 0}）`)}${kv('论文总引用', U.fmtInt(cites))}${kv('人脉', Math.round(g.phd.network))}${kv('导师信任', Math.round(m.trust))}</div></div><p class="center">${comment}</p>`,
    });
  };

  // ---------- 你能主动做的事 ----------
  S.phdTalk = function (g) {
    const m = S.me(g), P = g.phd;
    if (P.talkCd > g.day) return `${G.daysText(P.talkCd - g.day)}才能再约导师`;
    P.talkCd = g.day + 45;
    S.addMood(m, 6);
    S.addTrust(m, 4);
    if (U.chance(S.advisorType(g).id === 'star' ? 0.5 : 0.85)) {
      S.bumpStat(m, 'idea', 1);
      G.log(g, `你和 ${g.pi.name} 聊了一个小时，收获了不少新思路（想法 +1）`, 'good');
    } else G.log(g, `${g.pi.name} 太忙了，只聊了五分钟就被叫去开会了`, 'info');
    return null;
  };
  S.phdVacation = function (g) {
    const m = S.me(g), P = g.phd;
    if (P.vacCd > g.day) return `${G.daysText(P.vacCd - g.day)}才能再休假`;
    if (m.status !== 'active') return '你现在不在实验室';
    P.vacCd = g.day + 150;
    m.status = 'away';
    m.awayUntil = g.day + 10;
    m.awayWhy = '休假';
    S.addMood(m, 22);
    G.log(g, '你给自己放了十天假，出去走走', 'info');
    return null;
  };
  // 带一个学弟学妹做你的课题
  S.phdMentor = function (g, j, p) {
    S.joinProject(g, j, p);
    const P = g.phd;
    if (!P.mentees.includes(j.id)) P.mentees.push(j.id);
    P.bond[j.id] = (P.bond[j.id] || 0) + 2;
    S.addMood(j, 3);
    G.log(g, `${j.name} 跟着你做《${short(p.title)}》`, 'info');
  };
  S.phdHelpers = function (g) {
    const m = S.me(g);
    const p = m && m.projectId && G.project(g, m.projectId);
    if (!p || p.lead !== m.id || !S.WORK_PHASES.includes(p.phase) || p.helpers.length >= 2) return [];
    return g.members.filter(x => {
      if (x.id === m.id || x.status !== 'active' || x.role === 'postdoc' || p.helpers.includes(x.id)) return false;
      const q = x.projectId && G.project(g, x.projectId);
      if (q && q.lead === x.id && S.WORK_PHASES.includes(q.phase)) return false;
      return x.role !== 'phd' || S.memberYears(g, x) < S.memberYears(g, m) - 0.5;
    });
  };
  S.phdHelper = function (g) {
    const m = S.me(g), P = g.phd;
    if (P.helpCd > g.day) return `${G.daysText(P.helpCd - g.day)}才能再找人帮忙`;
    const p = m.projectId && G.project(g, m.projectId);
    if (!p || p.lead !== m.id || !S.WORK_PHASES.includes(p.phase)) return '你手上没有自己负责、正在做的课题';
    if (p.helpers.length >= 2) return '你的课题已经有两个人在帮忙了';
    const c = S.phdHelpers(g);
    if (!c.length) return '组里暂时没有能来帮你的学弟学妹';
    const j = c.sort((a, b) => (P.bond[b.id] || 0) - (P.bond[a.id] || 0) || (b.stats.code - a.stats.code))[0];
    P.helpCd = g.day + 90;
    S.phdMentor(g, j, p);
    return null;
  };

  // ---------- 奖学金 ----------
  S.phdFellowName = function (g) {
    const m = S.me(g);
    if (!m) return null;
    const yrs = S.memberYears(g, m);
    let name;
    if (g.region === 'us') {
      if (m.funding === 'fellow') return null;
      name = yrs < 1.5 ? 'NSF 研究生奖学金（GRFP）' : (m.first || 0) >= 1 ? '大厂博士生奖学金' : null;
    } else name = (m.first || 0) >= 1 ? '博士研究生国家奖学金' : null;
    return name && !g.phd.awards.includes(name) ? name : null;
  };

  // ---------- 求职 ----------
  S.MARKET_BARS = [44, 30, 18]; // 顶尖 / 中等 / 新兴学校大致需要的竞争力
  S.MARKET_APPS = [5, 7, 6]; // 每档各投几所
  S.marketScore = function (g) {
    const m = S.me(g), P = g.phd;
    const mine = S.myPapers(g);
    const cites = U.sum(mine, p => p.cites);
    const best = mine.filter(p => p.best && /一作/.test(S.authorPos(p, m.id))).length;
    const adv = S.advisorType(g);
    const first = m.first || 0, firstA = m.firstA || 0;
    const coA = Math.max(0, m.pubsA - firstA), co = Math.max(0, m.pubs - first - coA);
    const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
    const parts = [
      ['一作论文', firstA * 3.5 + (first - firstA) * 1.2],
      ['合作论文', coA * 1 + co * 0.3],
      ['引用', Math.min(6, cites / 60)],
      ['最佳论文', best * 5],
      ['导师推荐信', Math.min(6, (g.rep / 120) * adv.letter) + ((m.trust == null ? 55 : m.trust) - 50) / 12],
      ['人脉', Math.min(4, P.network / 12) + Math.min(3, P.contacts * 1.5)],
      ['奖项', Math.min(4.5, P.awards.length * 1.5)],
      ['教学经验', Math.min(1.5, P.ta * 0.5)],
      ['研究能力', (avg - 50) / 8],
      ['博士学校', [3, 1.5, 0][g.tier] || 0],
      ['带过学弟学妹', Math.min(1.5, P.mentees.length * 0.5)],
      ['博后 / 业界经历', P.bonus],
    ];
    return { total: U.sum(parts, x => x[1]), parts, cites, best };
  };
  S.marketAdj = (g, region) => (region === g.region ? 0 : g.region === 'us' ? 2 : -4); // 海归加分；国内博士申北美更难
  S.marketChance = (g, region, tier, score) => {
    const d = score + S.marketAdj(g, region) - S.MARKET_BARS[tier];
    let p = 0.9 * U.sigmoid(d / 3.5);
    if (d > 12) p *= 0.55; // 远超这档学校的要求：对方觉得你多半不会来
    return U.clamp(p, 0.02, 0.9);
  };
  // 某一档至少拿到一个 offer 的概率
  S.marketTierChance = (g, region, tier, score) => 1 - Math.pow(1 - S.marketChance(g, region, tier, score), S.MARKET_APPS[tier]);

  S.openMarket = function (g) {
    const P = g.phd;
    P.round++;
    P.market = P.market || { start: g.day };
    G.queue(g, { type: 'jobmarket', stage: 'apply', round: P.round, sel: { regions: { [g.region]: true }, tiers: { 0: true, 1: true, 2: true } } });
  };
  S.applyJobs = function (g, sel) {
    const P = g.phd;
    const sc = S.marketScore(g).total;
    const offers = [];
    let apps = 0;
    Object.keys(RS.REGIONS).forEach(rid => {
      if (!sel.regions[rid]) return;
      RS.REGIONS[rid].tiers.forEach((T, t) => {
        if (!sel.tiers[t]) return;
        // 北美一般不留本校博士；国内偶尔可以留校
        const pool = (T.schools || []).filter(s => s !== g.school || (rid === 'cn' && U.chance(0.15)));
        const list = U.sample(pool, S.MARKET_APPS[t]);
        apps += list.length;
        const p = S.marketChance(g, rid, t, sc);
        // 面试之后，每档最多拿到两个 offer
        list.filter(() => U.chance(p)).slice(0, 2).forEach(school => {
          offers.push({ kind: 'faculty', region: rid, tier: t, school, startup: Math.round((T.startup * U.range(0.9, 1.2)) / 1000) * 1000 });
        });
      });
    });
    // 一个求职季最多同时手握六个教职 offer（好学校优先）
    offers.sort((a, b) => a.tier - b.tier);
    offers.splice(6);
    // 第二轮起保底：总有一所学校愿意要你
    if (P.round >= 2 && !offers.some(o => o.kind === 'faculty')) {
      const rid = Object.keys(sel.regions).find(r => sel.regions[r]) || g.region;
      const T = RS.REGIONS[rid].tiers[2];
      offers.push({ kind: 'faculty', region: rid, tier: 2, school: U.pick(T.schools), startup: T.startup });
    }
    // 博后和工业界的机会（最多绕两次路）
    if (P.round <= 2) {
      const R = G.region(g);
      const pd = (sc >= 14 ? R.univsTop || R.univs : R.univs).filter(s => s !== g.school);
      offers.push({ kind: 'postdoc', region: g.region, school: U.pick(pd.length ? pd : R.univs) });
      offers.push({ kind: 'industry', company: U.pick(R.companies), role: sc >= 12 ? '研究科学家' : '算法工程师' });
    }
    offers.sort((a, b) => (a.kind === 'faculty' ? a.tier : 9) - (b.kind === 'faculty' ? b.tier : 9));
    P.offers = offers;
    P.apps = apps;
    if (P.round >= 2) { S.phdMarketResult(g); return; }
    P.market.wait = g.day + 100;
    G.schedule(g, P.market.wait, 'phdMarket', {});
    G.log(g, `你投出了 ${apps} 份教职申请。接下来是漫长的面试和等待……`, 'info');
    S.phdMilestone(g, 'market', `开始找教职，投出 ${apps} 份申请`);
  };
  S.phdMarketResult = function (g) {
    const P = g.phd;
    if (!P.offers) return;
    const fac = P.offers.filter(o => o.kind === 'faculty').length;
    G.log(g, fac ? `求职季结束：你拿到了 ${fac} 个教职 offer！` : '求职季结束：这一轮没有拿到教职 offer……', fac ? 'gold' : 'bad');
    G.queue(g, { type: 'jobmarket', stage: 'offers', round: P.round, offers: P.offers, apps: P.apps });
  };
  S.phdMarketResolve = function (g, item, payload) {
    if (!payload) return;
    if (item.stage === 'apply') { S.applyJobs(g, payload.sel || item.sel); return; }
    const o = item.offers && item.offers[payload.accept];
    if (o && o.kind !== 'faculty') S.phdDetour(g, o);
  };
  // 先去做两年博后 / 去业界，再回来找教职
  S.phdDetour = function (g, o) {
    const P = g.phd, m = S.me(g);
    P.path = o.kind;
    P.extraYears += 2;
    let text;
    if (o.kind === 'postdoc') {
      P.pathPlace = o.school;
      P.bonus += 6;
      P.network += 6;
      S.bumpStat(m, 'idea', 4);
      S.bumpStat(m, 'write', 4);
      m.pubs += 3; m.first += 2; m.pubsA += 2; m.firstA += 1;
      S.phdMilestone(g, 'postdoc', `去 ${o.school} 做博士后`);
      text = `你在 <b>${U.esc(o.school)}</b> 做了两年博士后，又发了三篇论文（两篇一作），认识了更多同行。<br>现在，你重新回到了求职市场。`;
    } else {
      P.pathPlace = o.company;
      P.bonus += 3;
      P.network += 10;
      S.bumpStat(m, 'code', 8);
      S.phdMilestone(g, 'industry', `加入 ${o.company} 做${o.role}`);
      text = `你在 <b>${U.esc(o.company)}</b> 做了两年${U.esc(o.role)}，见识了工业界的大规模系统，也攒下了不少人脉。<br>但你还是想回到学术界，于是重新投出了教职申请。`;
    }
    G.queue(g, { type: 'notice', player: true, tone: 'info', icon: 'calendar', title: '两年之后', text });
    S.openMarket(g);
  };

  // 读博经历决定 PI 的背景
  S.derivePerk = function (g, sc) {
    const P = g.phd, m = S.me(g);
    let id = 'iron';
    if (P.path === 'postdoc') id = 'postdoc';
    else if (P.path === 'industry') id = 'industry';
    else if ((m.firstA || 0) >= 5 || sc.best > 0) id = 'star';
    else if (P.network >= 45) id = 'social';
    else if ((P.ta >= 4 && U.avg(P.taEval) >= 3.9) || P.mentees.length >= 3) id = 'teacher';
    return RS.PERKS.find(p => p.id === id) || RS.PERKS[0];
  };

  // 接受教职 offer：生成新的 PI 存档
  S.startFaculty = function (g, offer, labName) {
    const P = g.phd, m = S.me(g);
    const R = RS.REGIONS[offer.region];
    const sc = S.marketScore(g);
    const perk = S.derivePerk(g, sc);
    const phdYears = Math.round(S.memberYears(g, m) * 10) / 10;
    const day = G.nextDate(g.day + P.extraYears * 360 + 1, R.start[0], R.start[1]);
    const mine = S.myPapers(g);
    const cnt = {}, subCnt = {};
    mine.forEach(p => {
      if (p.topic) cnt[p.topic] = (cnt[p.topic] || 0) + 1;
      if (p.sub) subCnt[p.sub] = (subCnt[p.sub] || 0) + 1;
    });
    // 博士论文的子方向决定你实验室的核心方向，也是第一个小组的方向
    const thesis = P.thesis ? G.asSub(g, P.thesis) : Object.keys(subCnt).sort((a, b) => subCnt[b] - subCnt[a])[0] || S.interestOf(m) || g.startSub;
    const core = RS.SUBS[thesis].topic;
    const pg = G.newGame({
      piName: m.name, labName: (labName || '').trim() || `${U.pick(RS.TITLE_PARTS.acr)} Lab`, school: offer.school, region: offer.region, tier: offer.tier,
      areaId: g.areaId, coreTopic: core, coreSub: thesis, perk: perk.id, avatar: m.avatar, day,
    });
    pg.startup = pg.funds = offer.startup;
    pg.epoch = G.yearOfDay(day); // 领域门槛和算力需求从你入职那年开始算，和直接开局一样难
    // PI 的能力来自读博期间
    const st = m.stats;
    // 读得好的博士起点高一些，但不会高到让考核变得太轻松
    const base = {
      research: U.clamp(45 + (st.idea - 50) * 0.4 + (st.code - 50) * 0.1 + (m.firstA || 0), 38, 75),
      writing: U.clamp(42 + (st.write - 50) * 0.45 + (m.first || 0) * 0.8, 35, 75),
      network: U.clamp(25 + P.network * 0.35, 20, 50),
      teaching: U.clamp(35 + P.ta * 4 + P.mentees.length * 2, 30, 65),
    };
    for (const k in base) pg.pi.stats[k] = Math.round(base[k] + ((perk.stats || {})[k] || 0));
    pg.rep = Math.round(10 + (perk.rep || 0) + Math.min(40, Math.max(0, sc.total) * 0.6));
    pg.pi.age0 = 23 + Math.round(phdYears) + P.extraYears;
    // 世界是连续的：方向热度延续，读博时积累的方向经验带过来
    Object.keys(g.subs).forEach(s => { if (pg.subs[s]) pg.subs[s].heat = g.subs[s].heat; });
    Object.keys(cnt).forEach(t => { pg.expertise[t] = Math.min(4, (pg.expertise[t] || 0) + cnt[t] * 0.6); });
    pg.expertise[core] = Math.max(pg.expertise[core] || 0, 2);
    // 读博期间的论文：算进引用和 h-index，但不算进考核
    mine.forEach(p => {
      const names = S.authorList(g, p).map(a => ({ n: a.n, co: a.co, ext: a.ext || a.corr, corr: a.corr, me: a.id === m.id }));
      pg.papers.push(Object.assign({}, p, { id: G.nid(pg, 'pa'), authors: [], names, phd: true, viral: p.viral }));
    });
    pg.papers.sort((a, b) => b.day - a.day);
    pg.stats.cites = U.sum(mine, p => p.cites);
    pg.stats.h = S.hIndex(pg);
    pg.year = G.freshYear(pg);
    pg.pi.phd = {
      school: g.school, region: g.region, advisor: g.pi.name, advisorType: P.advisor, years: phdYears,
      papers: m.pubs, first: m.first || 0, firstA: m.firstA || 0, cites: pg.stats.cites, thesis,
      path: P.path, pathPlace: P.pathPlace, score: Math.round(sc.total * 10) / 10, perk: perk.id,
    };
    // 读博时带得最多、关系最好的学弟学妹可能跟着你走
    const mentee = P.mentees.map(id => G.member(g, id)).filter(x => x && x.role !== 'postdoc').sort((a, b) => (P.bond[b.id] || 0) - (P.bond[a.id] || 0))[0];
    const follow = mentee && (P.bond[mentee.id] || 0) >= 2 && P.extraYears === 0;
    pg.flags.fromPhd = {
      school: g.school, advisor: g.pi.name, path: P.path, pathPlace: P.pathPlace,
      mentee: follow ? { name: mentee.name, avatar: mentee.avatar, stats: Object.assign({}, mentee.stats), traits: mentee.traits.slice(), pot: mentee.pot, role: mentee.role, bio: mentee.bio } : null,
    };
    // 大事记：读博期间的经历都带过来
    pg.timeline = g.timeline.slice();
    if (P.path === 'postdoc') pg.timeline.push({ d: day - 1, t: `在 ${P.pathPlace} 做了两年博士后` });
    if (P.path === 'industry') pg.timeline.push({ d: day - 1, t: `在 ${P.pathPlace} 工作了两年` });
    pg.timeline.push({ d: day - 1, t: `博士毕业于 ${g.school}（导师：${g.pi.name}），拿到 ${offer.school} 的教职` });
    return pg;
  };
})();
