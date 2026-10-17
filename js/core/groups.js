/* 核心系统（三）：课题组（子方向）、服务器分配、选题商量、毕业规划 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G, S = RS.Sys;
  const short = S.short;

  // 做完一个课题后会来找你商量的角色（本科生、访问学生跟着师兄师姐干活，不单独商量）
  S.CONSULT_ROLES = ['phd', 'ms', 'postdoc'];
  S.MAX_MEMBER_GROUPS = 2;

  // ---------- 查询 ----------
  // 每个小组做一个子方向（gr.sub），gr.topic 是它所属的方向
  S.maxGroups = g => Math.min(G.area(g).subs.length, 2 + g.room);
  S.group = (g, id) => g.groups.find(x => x.id === id) || null;
  S.groupOfSub = (g, sid) => g.groups.find(x => x.sub === sid) || null;
  S.groupName = (g, gr) => G.sub(g, gr.sub).name + '组';
  S.inGroup = (m, gid) => !!(m.groups && m.groups.includes(gid));
  S.groupMembers = (g, gr) => g.members.filter(m => S.inGroup(m, gr.id));
  S.memberGroups = (g, m) => (m.groups || []).map(id => S.group(g, id)).filter(Boolean);
  S.memberSubs = (g, m) => S.memberGroups(g, m).map(x => x.sub);
  S.interestOf = m => (m && m.bio && m.bio.interest) || null;
  S.leadsGroup = (g, m) => g.groups.find(x => x.lead === m.id) || null;
  S.canLead = (g, m) => m.role === 'postdoc' || (m.role === 'phd' && S.memberYears(g, m) >= 2);

  // ---------- 成立 / 解散 / 分组 ----------
  S.canCreateGroup = function (g, sid) {
    if (!G.area(g).subs.some(s => s.id === sid)) return '没有这个子方向';
    if (S.groupOfSub(g, sid)) return '这个子方向已经有小组了';
    const max = S.maxGroups(g);
    if (g.groups.length >= max) return `现在的实验室最多设 ${max} 个小组，扩建实验室后可以设更多`;
    return null;
  };
  S.createGroup = function (g, sid, silent) {
    sid = G.asSub(g, sid);
    const used = g.groups.map(x => x.color);
    let color = 0;
    while (used.includes(color)) color++;
    const gr = { id: G.nid(g, 'gr'), sub: sid, topic: RS.SUBS[sid].topic, lead: null, color: color % 6, since: g.day };
    g.groups.push(gr);
    if (!silent) G.log(g, `成立了「${S.groupName(g, gr)}」`, 'info');
    return gr;
  };
  S.deleteGroup = function (g, gid) {
    const gr = S.group(g, gid);
    if (!gr) return '没有这个小组';
    g.groups.splice(g.groups.indexOf(gr), 1);
    g.members.forEach(m => { if (m.groups) m.groups = m.groups.filter(x => x !== gid); });
    delete g.gpuAlloc[gid];
    G.log(g, `「${S.groupName(g, gr)}」解散了，组员们改为自由选题，专用服务器回到共享池`, 'info');
    return null;
  };
  S.setMemberGroup = function (g, m, gid, on) {
    const gr = S.group(g, gid);
    if (!gr || !m) return '没有这个小组';
    if (!m.groups) m.groups = [];
    const has = m.groups.includes(gid);
    if (on && !has) {
      if (m.groups.length >= S.MAX_MEMBER_GROUPS) return `${m.name} 已经在两个小组里了，先退出一个`;
      m.groups.push(gid);
      const fit = S.interestFit(m, gr.sub);
      if (fit) S.addMood(m, fit === 1 ? 4 : 2);
    } else if (!on && has) {
      m.groups = m.groups.filter(x => x !== gid);
      if (gr.lead === m.id) gr.lead = null;
    }
    return null;
  };
  S.setGroupLead = function (g, gid, mid) {
    const gr = S.group(g, gid);
    if (!gr) return '没有这个小组';
    if (!mid) {
      if (gr.lead) G.log(g, `「${S.groupName(g, gr)}」不再设组长，由你直接管理`, 'info');
      gr.lead = null;
      return null;
    }
    const m = G.member(g, mid);
    if (!m) return '找不到这个人';
    if (!S.canLead(g, m)) return '组长需要是博士后，或者三年级以上的博士生';
    if (!S.inGroup(m, gid)) return '组长需要是本组成员';
    const other = S.leadsGroup(g, m);
    if (other && other !== gr) return `${m.name} 已经是「${S.groupName(g, other)}」的组长了`;
    if (gr.lead === mid) return null;
    gr.lead = mid;
    m.ledGroup = true;
    S.addMood(m, 5);
    S.addTrust(m, 4);
    S.story(g, m, `被任命为「${S.groupName(g, gr)}」组长`);
    G.log(g, `${m.name} 被任命为「${S.groupName(g, gr)}」组长`, 'good');
    return null;
  };
  S.groupsOnLeave = function (g, m) {
    g.groups.forEach(gr => {
      if (gr.lead !== m.id) return;
      gr.lead = null;
      G.log(g, `「${S.groupName(g, gr)}」的组长 ${m.name} 离开了，记得任命新的组长`, 'info');
    });
  };

  // ---------- 小组带来的效果 ----------
  // 组长帮你分担指导工作（博士后本来就能分担，额外加得少一些）
  S.leaderCap = g => U.sum(g.groups, gr => { const l = G.member(g, gr.lead); return l ? (l.role === 'postdoc' ? 1 : 1.5) : 0; });
  // 有组长带的组员成长更快
  S.groupGrowth = (g, m) => (g.groups.some(gr => gr.lead && gr.lead !== m.id && S.inGroup(m, gr.id)) ? 1.12 : 1);
  // 同组的人多，讨论起来想法更多；组长也会帮着把关
  S.groupSynergy = function (g, p) {
    const gr = S.groupOfSub(g, p.sub);
    if (!gr) return 0;
    const others = g.members.filter(m => m.id !== p.lead && m.status === 'active' && S.inGroup(m, gr.id)).length;
    return Math.min(2, others * 0.6) + (gr.lead && gr.lead !== p.lead ? 1 : 0);
  };
  // 没有组长的小组要你亲自协调（第一个小组不算）
  S.groupEnergyCost = g => 0.04 * Math.max(0, g.groups.filter(gr => !G.member(g, gr.lead)).length - 1);

  // ---------- 服务器分配 ----------
  // 专用服务器只给本组用（闲着也不外借）；没分配的服务器和云算力组成共享池
  S.allocCount = (g, id) => U.sum(Object.keys(g.gpuAlloc), gid => g.gpuAlloc[gid][id] || 0);
  S.allocUnits = (g, gid) => {
    const a = g.gpuAlloc[gid];
    if (!a) return 0;
    let u = 0;
    for (const id in a) { const s = G.gpuSpec(g, id); if (s) u += s.units * a[id]; }
    return u;
  };
  S.allocGpu = function (g, gid, id, d) {
    if (!S.group(g, gid)) return '没有这个小组';
    if (d > 0 && S.allocCount(g, id) >= (g.gpus[id] || 0)) return '这种服务器已经全部分出去了';
    const a = g.gpuAlloc[gid] || (g.gpuAlloc[gid] = {});
    a[id] = Math.max(0, (a[id] || 0) + d);
    if (!a[id]) delete a[id];
    if (!Object.keys(a).length) delete g.gpuAlloc[gid];
    return null;
  };
  // 服务器卖掉、坏掉或小组解散后，分配数不能超过实际拥有的数量
  S.fixAlloc = function (g) {
    for (const gid of Object.keys(g.gpuAlloc)) if (!S.group(g, gid)) delete g.gpuAlloc[gid];
    const types = new Set();
    Object.values(g.gpuAlloc).forEach(a => Object.keys(a).forEach(id => types.add(id)));
    types.forEach(id => {
      let over = S.allocCount(g, id) - (g.gpus[id] || 0);
      for (const gid of Object.keys(g.gpuAlloc).reverse()) {
        if (over <= 0) break;
        const a = g.gpuAlloc[gid];
        const k = Math.min(over, a[id] || 0);
        if (!k) continue;
        a[id] -= k;
        over -= k;
        if (!a[id]) delete a[id];
        if (!Object.keys(a).length) delete g.gpuAlloc[gid];
      }
    });
  };
  // 每个小组能用的算力：先用本组的专用服务器，不够的部分按缺口比例分共享池
  S.computeAlloc = function (g) {
    S.fixAlloc(g);
    const f = g.flags;
    // 机房过热限功率时所有服务器都打折；临时租的云算力进共享池
    const cut = f.cutUntil > g.day ? f.computeCut || 1 : 1;
    const temp = f.tempUntil > g.day ? f.tempUnits || 0 : 0;
    const total = G.computeUnits(g) * cut + temp;
    const own = {}, dem = { _pool: 0 };
    let dedicated = 0;
    g.groups.forEach(gr => { own[gr.id] = S.allocUnits(g, gr.id) * cut; dedicated += own[gr.id]; dem[gr.id] = 0; });
    for (const p of g.projects) {
      if (p.phase !== 'exp') continue;
      const gr = S.groupOfSub(g, p.sub);
      dem[gr ? gr.id : '_pool'] += S.projectDemand(g, p);
    }
    const pool = Math.max(0, total - dedicated);
    let need = dem._pool, idle = 0;
    const gap = {};
    g.groups.forEach(gr => {
      gap[gr.id] = Math.max(0, dem[gr.id] - own[gr.id]);
      need += gap[gr.id];
      idle += Math.max(0, own[gr.id] - dem[gr.id]);
    });
    const share = need > 0 ? pool / need : 0;
    const got = { _pool: dem._pool * share }, ratio = { _pool: dem._pool > 0 ? share : 9 };
    g.groups.forEach(gr => {
      got[gr.id] = own[gr.id] + gap[gr.id] * share;
      ratio[gr.id] = dem[gr.id] > 0 ? got[gr.id] / dem[gr.id] : 9;
    });
    // DDL 前你指定优先保证的小组：多分一些，其他人让一让
    if (f.prioUntil > g.day && dem[f.prio] > 0) {
      Object.keys(ratio).forEach(k => {
        if (!(dem[k] > 0)) return;
        ratio[k] *= k === f.prio ? 1.5 : 0.8;
        got[k] = ratio[k] * dem[k];
      });
    }
    return { total, pool, dedicated, own, dem, got, ratio, idle };
  };
  S.projRatio = (g, p, ctx) => {
    if (!ctx.alloc) return ctx.ratio;
    const gr = S.groupOfSub(g, p.sub);
    const r = ctx.alloc.ratio[gr ? gr.id : '_pool'];
    return r == null ? ctx.ratio : r;
  };

  // ---------- 选题 ----------
  // 选题倾向：深耕积累 / 追热点 / 尊重兴趣（积累算在方向上，热度和兴趣看子方向）
  S.subScore = function (g, m, sid) {
    const pol = g.policies.topic;
    const s = G.sub(g, sid);
    let w = 1 + (g.expertise[s.topic] || 0) * 0.25;
    if (pol === 'core' && s.topic === g.policies.coreTopic) w *= 1.8;
    if (pol === 'hot') w *= Math.pow(S.heat(g, sid), 2);
    const fit = S.interestFit(m, sid);
    if (fit === 1) w *= pol === 'free' ? 4 : 1.5;
    else if (fit) w *= pol === 'free' ? 2 : 1.2;
    return w;
  };
  S.pickSubFor = function (g, m) {
    if (g.flags.trendTopic && g.flags.trendUntil > g.day && U.chance(0.35)) return G.asSub(g, g.flags.trendTopic);
    const ss = m ? S.memberSubs(g, m) : [];
    if (!ss.length) {
      const it = S.interestOf(m);
      if (it && g.policies.topic === 'free' && U.chance(0.7)) return it;
      return S.pickSub(g);
    }
    return U.weighted(ss, s => S.subScore(g, m, s)) || ss[0];
  };
  const argmax = (list, f) => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  // 商量时给出的几个子方向：所在小组的、上一个课题的、TA 感兴趣的、核心方向里最热的、整个领域最热的
  S.subOptions = function (g, m, last) {
    const out = [];
    const add = s => { if (s && g.subs[s] && !out.includes(s)) out.push(s); };
    S.memberSubs(g, m).sort((a, b) => S.subScore(g, m, b) - S.subScore(g, m, a)).forEach(add);
    add(last);
    add(S.interestOf(m));
    add(argmax(G.topic(g, g.policies.coreTopic).subs, s => S.heat(g, s.id)).id);
    add(argmax(G.area(g).subs, s => S.heat(g, s.id)).id);
    return out.slice(0, 4);
  };
  S.wantsConsult = (g, m) => {
    if (!m.lastDone || !S.CONSULT_ROLES.includes(m.role)) return false;
    // 博士阶段：只有你自己做完课题时会停下来想下一步，师兄师姐的选题导师自动安排
    if (g.phd) return !!m.isPlayer && g.phd.consult !== 'auto' && !g.queue.some(q => q.type === 'event' && q.id === 'phd_next');
    return g.policies.consult !== 'auto' && !g.queue.some(q => q.type === 'event' && q.id === 'next_topic' && q.ctx.mid === m.id);
  };
  S.queueConsult = function (g, m) {
    const last = m.lastDone || {};
    const lastSub = last.sub || (last.topic ? G.asSub(g, last.topic) : null);
    const opts = S.subOptions(g, m, lastSub);
    const mine = S.memberSubs(g, m).filter(s => opts.includes(s));
    const def = argmax(mine.length ? mine : opts, s => S.subScore(g, m, s));
    G.queue(g, { type: 'event', id: m.isPlayer ? 'phd_next' : 'next_topic', ctx: { mid: m.id, title: last.title || '', sub: lastSub, opts, def } });
  };
  // 延续上一个课题：同一个子方向代码和数据都是现成的，构思快很多；同一个方向也能快一点
  S.continuity = function (m, p) {
    const last = m.lastDone;
    if (last && last.sub === p.sub) p.need.idea = Math.round(p.need.idea * 0.75);
    else if (last && last.topic === p.topic) p.need.idea = Math.round(p.need.idea * 0.9);
    m.lastDone = null;
  };
  // 商量的结果：按选定的子方向开一个新课题
  S.startNext = function (g, m, sid, how) {
    sid = G.asSub(g, sid);
    const interest = S.interestOf(m);
    const fit = S.interestFit(m, sid);
    const gr = S.groupOfSub(g, sid);
    if (gr && !S.inGroup(m, gr.id) && (m.groups || []).length < S.MAX_MEMBER_GROUPS) {
      S.setMemberGroup(g, m, gr.id, true);
      G.log(g, `${m.name} 加入了「${S.groupName(g, gr)}」`, 'info');
    }
    const p = S.newProject(g, m, sid);
    S.continuity(m, p);
    if (how === 'self') { S.addTrust(m, 3); S.addMood(m, 4); }
    if (fit === 1) { S.addMood(m, 6); S.addTrust(m, 2); }
    else if (fit) S.addMood(m, 2);
    else if (interest && how !== 'self') S.addMood(m, -3);
    G.log(g, `${m.name} 开始了新课题《${short(p.title)}》（${G.sub(g, sid).name}）`, 'info');
    return p;
  };
  // 先去帮别人：选最接近完成、还缺人手的课题（优先本组）
  S.helpTarget = function (g, m) {
    const mine = S.memberSubs(g, m);
    const c = g.projects.filter(p => S.WORK_PHASES.includes(p.phase) && p.lead !== m.id && p.helpers.length < 2 && G.member(g, p.lead) &&
      (!mine.length || mine.includes(p.sub)));
    return c.length ? argmax(c, p => S.projectPct(p)) : null;
  };
  S.helpWith = function (g, m, p) {
    m.lastDone = null;
    S.joinProject(g, m, p);
    G.log(g, `${m.name} 先去帮 ${G.personName(g, p.lead)} 做《${short(p.title)}》`, 'info');
  };

  // 想换组的人：最感兴趣的子方向有小组，但自己不在里面
  S.switchCands = g => g.members.filter(m => {
    if (m.status !== 'active' || m.role === 'visit') return false;
    const gr = S.groupOfSub(g, S.interestOf(m));
    return !!gr && !S.inGroup(m, gr.id);
  });
  // DDL 前抢算力的两个小组：都有实验在跑、而且算力不够分
  S.rushPair = function (g) {
    if (G.area(g).compute < 0.3) return null;
    const al = S.computeAlloc(g);
    const gs = g.groups.filter(gr => al.dem[gr.id] > 0);
    if (gs.length < 2 || gs.every(gr => al.ratio[gr.id] >= 1)) return null;
    gs.sort((a, b) => al.dem[b.id] - al.dem[a.id]);
    return [gs[0].id, gs[1].id];
  };

  // ---------- 新成员分组 ----------
  // 新人分组：正好做 TA 想做的子方向的组 > 同一个方向的组（人少的优先）> 人最少的组
  S.suggestGroup = function (g, m) {
    const byInterest = S.groupOfSub(g, S.interestOf(m));
    if (byInterest) return byInterest.id;
    const near = g.groups.filter(gr => S.interestFit(m, gr.sub) > 0);
    return argmax(near.length ? near : g.groups, gr => -S.groupMembers(g, gr).length).id;
  };
  S.onJoin = function (g, m) {
    if (!g.groups.length) return;
    const it = S.interestOf(m);
    const canNew = it && !S.groupOfSub(g, it) && !S.canCreateGroup(g, it);
    if (g.groups.length === 1 && !canNew) {
      S.setMemberGroup(g, m, g.groups[0].id, true);
      return;
    }
    G.queue(g, { type: 'event', id: 'join_group', ctx: { mid: m.id, def: S.suggestGroup(g, m) } });
  };

  // ---------- 毕业规划（由你发起） ----------
  S.gradStatus = function (g, m) {
    const yrs = S.memberYears(g, m);
    if (m.preUntil && g.day < m.preUntil) return { ok: false, text: '还没正式入学呢' };
    if (m.role === 'phd') {
      const ok = (yrs >= 3 && ((m.firstA || 0) >= 2 || (m.first || 0) >= 4)) || yrs >= 5.5;
      return { ok, text: ok ? '已经达到博士毕业要求' : '博士毕业要求：读满 3 年，并且有 2 篇一作 A 类或 4 篇一作论文', early: !ok && yrs >= 1.5 };
    }
    if (m.role === 'ms') {
      const ok = yrs >= 1.4;
      return { ok, text: ok ? '学分已经修满，可以毕业' : '硕士至少要读一年半' };
    }
    if (m.role === 'postdoc') return { ok: true, text: '博士后可以随时出站' };
    if (m.role === 'ug') return { ok: true, text: '本科生可以随时结束科研训练' };
    return { ok: true, text: '访问学生可以提前结束访问' };
  };
  // 毕业去向的“底子”：成果（一作的分量是挂名合作的两倍）、能力、你的声望和推荐信（信任），带过组的加分
  S.placementScore = function (g, m) {
    const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
    const trust = m.trust == null ? 55 : m.trust;
    const first = m.first || 0, firstA = m.firstA || 0;
    const papers = firstA * 3 + Math.max(0, m.pubsA - firstA) * 1.5 + first + Math.max(0, m.pubs - first) * 0.5;
    return papers + (avg - 50) / 5 + g.rep / 80 + (trust - 50) / 12 + (m.ledGroup ? 2 : 0);
  };
  S.placementOutlook = function (g, m) {
    const s = S.placementScore(g, m);
    if (m.role === 'ug') return s > 4 ? '大概率继续读研' : '大概率直接工作';
    if (m.role === 'ms') return s > 12 ? '有机会去大厂做研究岗' : '大概率去企业做算法工程师';
    if (m.role === 'visit') return '回原单位继续学业';
    const goal = m.bio ? m.bio.goal : 'undecided';
    const want = goal === 'academia' ? '，TA 也想走学术路线' : goal === 'undecided' ? '' : `，不过 TA 更想${RS.GOALS[goal]}`;
    if (s > 24) return `很有竞争力，有望拿到好学校的教职${want}`;
    if (s > 15) return `有机会拿到教职，也能去大厂做研究科学家${want}`;
    if (s > 9) return m.role === 'phd' ? `大概率去做博士后，或去企业做算法${want}` : `大概率去企业做研究${want}`;
    return '成果偏少，大概率去企业做工程师';
  };
  S.piGraduate = function (g, m, early) {
    const st = S.gradStatus(g, m);
    const esc = U.esc;
    if (early) {
      if (m.role !== 'phd' || !st.early) return '现在还不能这样安排';
      m.role = 'ms';
      S.addRep(g, -1);
      const pl = S.graduate(g, m);
      G.queue(g, { type: 'notice', tone: 'info', icon: 'cap', title: `${m.name} 提前毕业`, text: `${esc(m.name)} 没有读完博士，以硕士学位离开了实验室。<br>去向：<b>${esc(pl.text)}</b>` });
      return null;
    }
    if (!st.ok) return st.text;
    if (m.role === 'visit') {
      S.removeMember(g, m, 'visit_end', '结束访问');
      G.log(g, `访问学生 ${m.name} 提前结束访问，回国了`, 'info');
      return null;
    }
    const role = m.role;
    const pl = S.graduate(g, m);
    if (role === 'phd') {
      G.queue(g, { type: 'notice', tone: 'good', icon: 'cap', fx: 'confetti', title: `${m.name} 博士毕业！`, text: `${esc(m.name)} 顺利通过了答辩，成为了 <b>${esc(m.name)} 博士</b>！<br>去向：<b>${esc(pl.text)}</b>` });
    } else {
      G.queue(g, { type: 'notice', tone: 'good', icon: 'cap', title: `${m.name} ${role === 'postdoc' ? '出站' : '毕业'}了`, text: `${esc(m.name)}（${S.ROLE_NAMES[role]}）离开了实验室。<br>去向：<b>${esc(pl.text)}</b>` });
    }
    return null;
  };

  // ---------- 旧存档 ----------
  S.normalizeGroups = function (g) {
    if (!g.gpuAlloc) g.gpuAlloc = {};
    if (!g.policies.consult) g.policies.consult = 'ask';
    if (!g.groups) {
      g.groups = [];
      if (g.members.length) {
        const gr = S.createGroup(g, g.startSub || g.policies.coreTopic, true);
        g.members.forEach(m => { m.groups = [gr.id]; });
      }
    }
    g.members.forEach(m => {
      if (!m.groups) m.groups = [];
      if (m.bio && !m.bio.interest) m.bio.interest = S.randomInterest(g);
    });
  };
})();
