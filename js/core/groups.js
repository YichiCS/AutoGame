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
  // 小组上限：每 3 个人才能撑起一个小组（不然全是一两个人的“光杆组”），同时受实验室空间限制
  S.GROUP_PER = 3;
  S.groupRoomCap = g => 2 + g.room;
  S.groupCapWhy = function (g) {
    const max = S.maxGroups(g);
    if (g.groups.length < max) return null;
    if (max >= G.area(g).subs.length) return '每个子方向都已经有小组了';
    return max < S.groupRoomCap(g) ? `实验室现在 ${g.members.length} 人，最多设 ${max} 个小组（每 ${S.GROUP_PER} 人一个）` : `现在的实验室最多设 ${max} 个小组，扩建实验室后可以设更多`;
  };
  S.maxGroups = g => Math.max(1, Math.min(G.area(g).subs.length, S.groupRoomCap(g), Math.floor(g.members.length / S.GROUP_PER)));
  S.group = (g, id) => g.groups.find(x => x.id === id) || null;
  S.groupOfSub = (g, sid) => g.groups.find(x => x.sub === sid) || null;
  S.groupName = (g, gr) => G.sub(g, gr.sub).name + '组';
  S.inGroup = (m, gid) => !!(m.groups && m.groups.includes(gid));
  S.groupMembers = (g, gr) => g.members.filter(m => S.inGroup(m, gr.id));
  S.memberGroups = (g, m) => (m.groups || []).map(id => S.group(g, id)).filter(Boolean);
  S.memberSubs = (g, m) => S.memberGroups(g, m).map(x => x.sub);
  S.interestOf = m => (m && m.bio && m.bio.interest) || null;
  S.leadsGroup = (g, m) => g.groups.find(x => x.lead === m.id) || null;
  S.canLead = (g, m) => m.role === 'postdoc' || m.role === 'jpi' || (m.role === 'phd' && S.memberYears(g, m) >= 2);
  // 组内互助时算一整个人的：研究生、博士后、青年教师（本科生、访问学生算半个）
  S.fullHelper = x => S.CONSULT_ROLES.includes(x.role) || x.role === 'jpi';

  // ---------- 成立 / 解散 / 分组 ----------
  S.canCreateGroup = function (g, sid) {
    if (!G.area(g).subs.some(s => s.id === sid)) return '没有这个子方向';
    if (S.groupOfSub(g, sid)) return '这个子方向已经有小组了';
    return S.groupCapWhy(g);
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
  // 组长自动任命：组里资历够的人里，博士后 / 青年教师优先；同等资历选总评最高的
  const LEAD_RANK = { jpi: 2, postdoc: 2, phd: 1 };
  S.bestLeader = function (g, gr) {
    const c = S.groupMembers(g, gr).filter(m => !m.isPlayer && S.canLead(g, m) && !S.leadsGroup(g, m) && !(m.leadCd > g.day));
    c.sort((a, b) => (LEAD_RANK[b.role] || 0) - (LEAD_RANK[a.role] || 0) || S.overall(b.stats) - S.overall(a.stats));
    return c[0] || null;
  };
  S.autoLeaders = function (g) {
    if (!g.phd && (g.policies.autoLead || 'auto') !== 'auto') return;
    g.groups.forEach(gr => {
      if (G.member(g, gr.lead)) return;
      const b = S.bestLeader(g, gr);
      if (b) S.setGroupLead(g, gr.id, b.id);
    });
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
  S.leaderCap = g => U.sum(g.groups, gr => { const l = G.member(g, gr.lead); return l ? (l.role === 'postdoc' || l.role === 'jpi' ? 1 : 1.5) : 0; });
  // 单干：不在任何小组、自己负责课题的研究生 / 博士后。可以做自己想做的方向，但没人讨论、也没有组长带
  S.isSolo = m => !!m && !(m.groups || []).length && S.CONSULT_ROLES.includes(m.role);
  S.SOLO_WORK = 0.88;
  S.SOLO_GROW = 0.85;
  // 成长：在小组里有人讨论 +5%，有组长带再 +7%；单干少了指导 -15%
  S.groupGrowth = (g, m) => {
    if (S.isSolo(m)) return S.SOLO_GROW;
    const gs = S.memberGroups(g, m);
    if (!gs.length) return 1;
    const leads = gs.map(gr => (gr.lead && gr.lead !== m.id ? G.member(g, gr.lead) : null)).filter(Boolean);
    return 1.05 + (leads.length ? 0.07 * (0.5 + Math.max(...leads.map(l => S.st(l, 'team'))) / 100) : 0);
  };
  // 组内互助：在小组的方向上做课题时，组里其他在岗的人帮着讨论、调代码、跑实验——
  // 研究生 / 博士后每人 +5%，本科生 / 访问学生每人 +2.5%，最多 +20%；有组长（不是自己）再 +5%
  S.teamHelpers = (g, m, p) => {
    const gr = S.groupOfSub(g, p.sub);
    if (!gr || !S.inGroup(m, gr.id)) return [];
    return S.groupMembers(g, gr).filter(x => x.id !== m.id && x.status === 'active');
  };
  S.teamMult = function (g, m, p) {
    const gr = S.groupOfSub(g, p.sub);
    if (gr && S.inGroup(m, gr.id)) {
      const n = U.sum(S.teamHelpers(g, m, p), x => (S.fullHelper(x) ? 1 : 0.5));
      return 1 + Math.min(0.2, 0.05 * n) + (gr.lead && gr.lead !== m.id ? 0.05 : 0);
    }
    // 单干的学生做自己的课题：效率打折
    if (S.isSolo(m) && p.lead === m.id) return S.SOLO_WORK;
    return 1;
  };
  // 每个课题在组里有一两位主要帮忙的人（固定下来，人走了再换）：互助多出来的工作量记在他们头上
  S.teamMates = function (g, m, p) {
    const hs = S.teamHelpers(g, m, p);
    if (!hs.length) return [];
    let mates = (p.mates || []).map(id => hs.find(x => x.id === id)).filter(Boolean);
    if (!mates.length) {
      mates = U.shuffle(hs.slice()).sort((a, b) => S.fullHelper(b) - S.fullHelper(a)).slice(0, 2);
      p.mates = mates.map(x => x.id);
    }
    return mates;
  };
  // 帮得多的组员会挂上名字（按工作量排在后面，每篇最多加两位）
  S.teamAuthors = function (g, p) {
    if (!p.contrib) return;
    const total = U.sum(Object.keys(p.contrib), id => p.contrib[id]);
    Object.keys(p.contrib)
      .filter(id => !p.authors.includes(id) && G.member(g, id) && p.contrib[id] >= total * 0.04)
      .sort((a, b) => p.contrib[b] - p.contrib[a]).slice(0, 2)
      .forEach(id => p.authors.push(id));
  };
  // 小组成员只能做小组的子方向；单干的什么方向都能做
  S.canDoSub = (g, m, sid) => !m || !(m.groups || []).length || S.memberSubs(g, m).includes(sid);
  // 选某个子方向会带来的组内互助 / 单干效果（给选项的提示用）
  S.teamPreview = function (g, m, sid) {
    const gr = S.groupOfSub(g, sid);
    const inIt = gr && (S.inGroup(m, gr.id) || (m.groups || []).length < S.MAX_MEMBER_GROUPS);
    if (inIt) {
      const others = S.groupMembers(g, gr).filter(x => x.id !== m.id && x.status === 'active');
      const n = U.sum(others, x => (S.fullHelper(x) ? 1 : 0.5));
      const pct = Math.round((Math.min(0.2, 0.05 * n) + (gr.lead && gr.lead !== m.id ? 0.05 : 0)) * 100);
      return pct ? `组内互助：效率 +${pct}%` : '组里暂时没有别人，还没有互助';
    }
    return `单干：效率 -${Math.round((1 - S.SOLO_WORK) * 100)}%、成长 -${Math.round((1 - S.SOLO_GROW) * 100)}%`;
  };
  // 退出所有小组，开始单干
  S.goSolo = function (g, m) {
    if (!(m.groups || []).length) return;
    S.memberGroups(g, m).forEach(gr => S.setMemberGroup(g, m, gr.id, false));
    S.story(g, m, '退出小组，开始单干');
    G.log(g, `${m.name} 退出了小组，开始单干`, 'info');
  };
  // 调组：退出现在的小组，换到另一个
  S.switchGroup = function (g, m, gid) {
    const gr = S.group(g, gid);
    if (!gr) return '没有这个小组';
    const old = S.memberGroups(g, m).filter(x => x.id !== gid);
    old.forEach(x => S.setMemberGroup(g, m, x.id, false));
    S.setMemberGroup(g, m, gid, true);
    if (old.length) S.story(g, m, `从「${old.map(x => S.groupName(g, x)).join('、')}」调到「${S.groupName(g, gr)}」`);
    G.log(g, `${m.name} ${old.length ? '调到' : '加入'}了「${S.groupName(g, gr)}」`, 'info');
    return null;
  };
  // 让学生自由选方向：选最想做的；那个方向有小组就加入（已经在两个组里就调过去），没有小组就单干
  S.freePick = function (g, m) {
    const sid = S.interestOf(m) || S.pickSubFor(g, m);
    if (S.memberSubs(g, m).includes(sid)) return { sid, how: 'stay' };
    const gr = S.groupOfSub(g, sid);
    if (gr) return { sid, gr, how: (m.groups || []).length < S.MAX_MEMBER_GROUPS ? 'join' : 'switch' };
    return { sid, how: (m.groups || []).length ? 'solo' : 'free' };
  };
  S.doFreePick = function (g, m) {
    const f = S.freePick(g, m);
    if (f.how === 'switch') S.switchGroup(g, m, f.gr.id);
    else if (f.how === 'solo') S.goSolo(g, m);
    return S.startNext(g, m, f.sid, 'self');
  };
  // 同组的人多，讨论起来想法更多；组长也会帮着把关。单干的课题少了讨论
  S.groupSynergy = function (g, p) {
    const gr = S.groupOfSub(g, p.sub);
    if (!gr) return S.isSolo(G.member(g, p.lead)) ? -1.5 : 0;
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
  // ---------- 算力像水 ----------
  // 每个在做实验的课题是一根水管，「需求」是让它按正常速度跑要流过的水。实验速度 = 流进来的水 / 需求：
  // 水多流得快，但一根管子最多只能快到 PIPE_MAX 倍（再多的卡也得有人改代码、看结果）；一滴水都没有，也能用自己的电脑和学校的公共算力平台以 PIPE_MIN 倍慢慢跑。
  S.PIPE_MAX = 1.5;
  S.PIPE_MIN = 0.35;
  // 专用服务器的好处：环境、数据都为这个组配好了，不用排队抢卡——同样一台，给专门的小组用能顶 1.25 台。
  // 代价是闲着的时候也不外借，所以要分给实验一直排得满的组
  S.DEDICATED_BONUS = 1.25;
  S.computeSpeed = r => U.clamp(r, S.PIPE_MIN, S.PIPE_MAX);
  // 注水：水先流向水位最低的水管，填平以后再一起往上涨。tanks: [{ dem, lv }]，返回最终水位
  function fillLevel(tanks, water) {
    const t = tanks.filter(x => x.dem > 0 && x.lv < S.PIPE_MAX).sort((a, b) => a.lv - b.lv);
    if (!t.length) return S.PIPE_MAX;
    let width = 0, level = t[0].lv, left = water;
    for (let i = 0; i < t.length; i++) {
      width += t[i].dem;
      const next = i + 1 < t.length ? t[i + 1].lv : S.PIPE_MAX;
      const room = width * (next - level);
      if (left <= room) return level + left / width;
      left -= room;
      level = next;
    }
    return S.PIPE_MAX;
  }
  // 每个小组的水位：专用服务器只往本组的水管里流（多出来的闲着，不外借）；
  // 没分配的服务器和云算力是共享水箱，先流向最缺水的组，再一起往上涨
  S.computeAlloc = function (g) {
    S.fixAlloc(g);
    const f = g.flags;
    // 机房过热限功率时所有服务器都打折；临时租的云算力进共享池
    const cut = f.cutUntil > g.day ? f.computeCut || 1 : 1;
    const temp = f.tempUntil > g.day ? f.tempUnits || 0 : 0;
    const own = {}, dem = { _pool: 0 };
    let raw = 0;
    g.groups.forEach(gr => { const u = S.allocUnits(g, gr.id) * cut; raw += u; own[gr.id] = u * S.DEDICATED_BONUS; dem[gr.id] = 0; });
    for (const p of g.projects) {
      if (p.phase !== 'exp') continue;
      const gr = S.groupOfSub(g, p.sub);
      dem[gr ? gr.id : '_pool'] += S.projectDemand(g, p);
    }
    const pool = Math.max(0, G.computeUnits(g) * cut - raw) + temp;
    const dedicated = raw * S.DEDICATED_BONUS;
    const total = pool + dedicated;
    const keys = Object.keys(dem).filter(k => dem[k] > 0);
    const lv = {};
    keys.forEach(k => { lv[k] = k === '_pool' ? 0 : Math.min(S.PIPE_MAX, own[k] / dem[k]); });
    const ownUsed = U.sum(keys, k => (k === '_pool' ? 0 : lv[k] * dem[k]));
    const base = Object.assign({}, lv);
    let water = pool;
    // DDL 前你指定优先保证的小组：共享水箱先灌满它的水管，剩下的再分给别人
    if (f.prioUntil > g.day && dem[f.prio] > 0) {
      const add = Math.min(water, dem[f.prio] * (S.PIPE_MAX - lv[f.prio]));
      lv[f.prio] += add / dem[f.prio];
      water -= add;
    }
    const level = fillLevel(keys.map(k => ({ dem: dem[k], lv: lv[k] })), water);
    keys.forEach(k => { lv[k] = Math.max(lv[k], Math.min(S.PIPE_MAX, level)); });
    const got = {}, ratio = {};
    Object.keys(dem).forEach(k => {
      ratio[k] = dem[k] > 0 ? lv[k] : 9;
      got[k] = dem[k] > 0 ? lv[k] * dem[k] : 0;
    });
    const poolUsed = U.sum(keys, k => (lv[k] - base[k]) * dem[k]);
    return {
      total, pool, dedicated, own, dem, got, ratio, level,
      idle: Math.max(0, dedicated - ownUsed), // 专用但闲着的
      spare: Math.max(0, pool - poolUsed), // 共享水箱里没流出去的
    };
  };
  // 全实验室的平均实验速度（按需求加权）
  S.avgSpeed = al => {
    const keys = Object.keys(al.dem).filter(k => al.dem[k] > 0);
    const d = U.sum(keys, k => al.dem[k]);
    return d > 0 ? U.sum(keys, k => al.dem[k] * S.computeSpeed(al.ratio[k])) / d : 1;
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
  // 新课题的子方向：小组成员只在小组的方向里选；单干的多半做自己感兴趣的
  S.pickSubFor = function (g, m) {
    const ss = m ? S.memberSubs(g, m) : [];
    if (ss.length) return U.weighted(ss, s => S.subScore(g, m, s)) || ss[0];
    if (g.flags.trendTopic && g.flags.trendUntil > g.day && U.chance(0.35)) return G.asSub(g, g.flags.trendTopic);
    const it = S.interestOf(m);
    if (it && U.chance({ free: 0.9, core: 0.7, hot: 0.6 }[g.policies.topic] || 0.7)) return it;
    return S.pickSub(g);
  };
  const argmax = (list, f) => list.reduce((a, b) => (f(b) > f(a) ? b : a));
  // 商量时给出的几个子方向：小组成员只能在所属小组的方向里选；
  // 单干的可以选 TA 感兴趣的、上一个课题的、核心方向里最热的、整个领域最热的
  S.subOptions = function (g, m, last) {
    const out = [];
    const add = s => { if (s && g.subs[s] && !out.includes(s)) out.push(s); };
    const mine = S.memberSubs(g, m);
    if (mine.length) {
      mine.sort((a, b) => S.subScore(g, m, b) - S.subScore(g, m, a)).forEach(add);
      return out;
    }
    add(S.interestOf(m));
    add(last);
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
    const it = S.interestOf(m);
    // 默认：小组成员做小组里最合适的；单干的做自己感兴趣的
    const def = mine.length ? argmax(mine, s => S.subScore(g, m, s)) : it && opts.includes(it) ? it : argmax(opts, s => S.subScore(g, m, s));
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
    if (m.status !== 'active' || m.role === 'visit' || m.role === 'jpi') return false;
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
    // 只有一个小组、TA 也愿意做这个方向，就直接进组；否则问你（进组 / 单干 / 新开一组）
    if (g.groups.length === 1 && !canNew && (S.interestFit(m, g.groups[0].sub) > 0 || !S.CONSULT_ROLES.includes(m.role))) {
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
      const ok = (yrs >= 3 && ((m.firstA || 0) >= 2 || (m.first || 0) >= 3)) || yrs >= 5.5;
      return { ok, text: ok ? '已经达到博士毕业要求' : '博士毕业要求：读满 3 年，并且有 2 篇一作 A 类或 3 篇一作论文', early: !ok && yrs >= 1.5 };
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
    // 一篇论文要做大半年，每篇都很有分量
    const papers = firstA * 4.5 + Math.max(0, m.pubsA - firstA) * 2.25 + first * 1.5 + Math.max(0, m.pubs - first) * 0.75;
    return papers + (avg - 50) / 5 + (S.st(m, 'talk') - 50) / 15 + g.rep / 80 + (trust - 50) / 12 + (m.ledGroup ? 2 : 0);
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
