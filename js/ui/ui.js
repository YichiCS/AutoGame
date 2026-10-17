/* 界面：顶栏、侧边面板、弹窗、开始界面、提示框 */
(function () {
  'use strict';
  const RS = window.RS;
  const U = RS.U, G = RS.G, S = RS.Sys, SP = RS.Sprites;
  const UI = (RS.UI = {});
  const esc = U.esc;

  let g = null;
  let tab = 'lab';
  let modal = null; // { kind: 'queue', qid } | { kind: 'local', type, data }
  let dirty = true;
  let lastRender = 0;
  let confirmDismiss = null;
  let confirmGroupDel = null;
  let paperFilter = 'all';
  let paperLimit = 30;
  let selMember = null;
  let ng = null;
  let titleBlink = null;
  let modalOpenedAt = 0; // 新弹窗刚出现的一小段时间内忽略点击，防止双击误选下一个决定
  // 可折叠区块的展开状态由这里记录（界面每次刷新都按它来渲染，不会被自动收起）
  const openState = {};
  let ledgerYear = 0; // 经费页查看哪一年的明细（0 = 今年）

  const $ = id => document.getElementById(id);
  const ico = name => `<img class="ico" src="${SP.iconURL(name, 2, 'ui')}" alt="">`;
  const money = v => G.money(g, v);
  const pct = U.pct;
  const clamp01 = v => U.clamp(v, 0, 1);

  // ---------- DOM 差量更新（保留悬停状态，避免按钮在点击时被替换） ----------
  function morph(el, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morphChildren(el, tpl.content);
  }
  function morphChildren(from, to) {
    const fc = Array.from(from.childNodes), tc = Array.from(to.childNodes);
    for (let i = 0; i < tc.length; i++) {
      const t = tc[i], f = fc[i];
      if (!f) { from.appendChild(t); continue; }
      if (f.nodeType !== t.nodeType || f.nodeName !== t.nodeName || (f.nodeType === 1 && f.getAttribute('data-key') !== t.getAttribute('data-key'))) {
        from.replaceChild(t, f);
        continue;
      }
      if (f.nodeType !== 1) {
        if (f.nodeValue !== t.nodeValue) f.nodeValue = t.nodeValue;
        continue;
      }
      const fa = f.attributes, ta = t.attributes;
      for (let j = fa.length - 1; j >= 0; j--) if (!t.hasAttribute(fa[j].name)) f.removeAttribute(fa[j].name);
      for (let j = 0; j < ta.length; j++) if (f.getAttribute(ta[j].name) !== ta[j].value) f.setAttribute(ta[j].name, ta[j].value);
      morphChildren(f, t);
    }
    for (let i = fc.length - 1; i >= tc.length; i--) from.removeChild(fc[i]);
  }

  // ---------- 小组件 ----------
  function bar(v, cls, label) {
    return `<div class="bar ${cls || ''}"><i style="width:${(clamp01(v) * 100).toFixed(1)}%"></i>${label ? `<span>${label}</span>` : ''}</div>`;
  }
  function mini(v, cls) {
    return `<span class="mini ${cls || ''}"><i style="width:${U.clamp(v, 0, 100).toFixed(0)}%"></i></span><b class="num">${Math.round(v)}</b>`;
  }
  function tag(text, cls, tip) {
    return `<span class="tag ${cls || ''}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(text)}</span>`;
  }
  function moodCls(v) { return v < 25 ? 'bad' : v < 50 ? 'warn' : 'good'; }
  function traitTags(m, list) {
    return (list || m.traits).map(t => {
      const d = RS.TRAITS[t];
      return d ? tag(d.name, d.good > 0 ? 't-good' : d.good < 0 ? 't-bad' : 't-mid', d.desc) : '';
    }).join('');
  }
  function seg(key, opts, cur, act) {
    return `<div class="seg">${opts.map(o => `<button class="${o[0] === cur ? 'on' : ''}" data-act="${act || 'policy'}" data-k="${key}" data-v="${o[0]}"${o[2] ? ` data-tip="${esc(o[2])}"` : ''}>${esc(o[1])}</button>`).join('')}</div>`;
  }
  function tierTag(t) {
    return `<span class="tier t${t}">${t === 'P' ? 'arXiv' : t === 'W' ? 'WS' : t}</span>`;
  }
  function portraitHTML(p, size) {
    const cls = `portrait ${size || ''}`;
    if (!p) return '';
    const sc = size === 'big' ? 4 : 3;
    if (p.pi) return `<img class="${cls}" src="${SP.portraitURL(Object.assign({ suit: true }, g.pi.avatar), 'pi', sc)}" alt="">`;
    if (p.member) {
      const m = G.member(g, p.member) || g.alumni.find(a => a.id === p.member);
      if (m) return `<img class="${cls}" src="${SP.portraitURL(m.avatar, m.role, sc)}" alt="">`;
    }
    return `<div class="${cls} icon-port"><img src="${SP.iconURL(p.icon || 'mail', 4)}" alt=""></div>`;
  }
  function repTitle(r) {
    return r < 20 ? '学术新人' : r < 60 ? '崭露头角' : r < 150 ? '小有名气' : r < 350 ? '领域新星' : r < 700 ? '知名学者' : r < 1300 ? '领军人物' : r < 2500 ? '学术泰斗' : '一代宗师';
  }
  function heatIcons(h) {
    const n = h >= 2.2 ? 3 : h >= 1.5 ? 2 : h >= 1.1 ? 1 : 0;
    return n ? `<span class="heat" data-tip="热度 ${h.toFixed(2)}">${ico('fire').repeat(n)}</span>` : `<span class="dim small">冷门</span>`;
  }
  const GROUP_COLORS = ['#ef7d57', '#41a6f6', '#38b764', '#ffcd75', '#e05a7a', '#a7f070'];
  const gcolor = gr => GROUP_COLORS[gr.color % GROUP_COLORS.length];
  function groupTag(gr, tip) {
    return `<span class="tag grp" style="--gc:${gcolor(gr)}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(S.groupName(g, gr))}</span>`;
  }
  const computeWord = c => (c >= 1.2 ? '很高' : c >= 0.8 ? '较高' : c >= 0.4 ? '中等' : '很低');
  const topicName = tid => (tid ? G.topic(g, tid).name : '还没想好');

  const POLICIES = [
    { k: 'focus', name: 'PI 精力分配', opts: [
      ['mentor', '指导学生', '学生效率 +7%、成长速度 +30%；每天精力 -0.30'],
      ['grant', '写基金', '撰写中的基金申请书质量更高；写作能力提升；每天精力 -0.25'],
      ['research', '亲自科研', '你亲自参与最落后的课题，研究能力提升；每天精力 -0.40'],
      ['rest', '休养', '精力恢复 +1.0/天，但学生缺少指导'],
    ] },
    { k: 'intensity', name: '工作强度', opts: [
      ['chill', '佛系', '效率 -15%，大家心情持续变好'],
      ['normal', '正常', '不加干预'],
      ['crunch', '内卷', '效率 +20%，但心情持续下降，你也更累'],
    ] },
    { k: 'meeting', name: '组会频率', opts: [
      ['weekly', '每周', '效率 +5%、成长更快；学生有点压力，你也更累'],
      ['biweekly', '两周', '平衡'],
      ['monthly', '每月', '学生更轻松，但效率 -5%'],
    ] },
    { k: 'topic', name: '选题倾向', opts: [
      ['core', '深耕积累', '优先做核心方向和积累深的方向；同一方向积累越多，论文质量越高'],
      ['hot', '追热点', '优先做热门方向：引用高，但竞争激烈、录用门槛更高、容易撞车'],
      ['free', '尊重兴趣', '优先做学生自己感兴趣的方向：心情和效率更好，但方向容易分散'],
    ] },
    { k: 'consult', name: '学生做完课题后', opts: [
      ['ask', '来找我商量', '每做完一个课题，学生都会来找你商量下一个方向（也可以托管给“小事托管”）'],
      ['auto', '自动安排', '按「选题倾向」在学生所属小组的方向里自动选题，不再来问你'],
    ] },
    { k: 'submit', name: '投稿策略', opts: [
      ['top', '只冲顶会', '前 4 次只投 A 类'],
      ['balanced', '稳健', '先冲 A 类，被拒两次后考虑 B 类'],
      ['volume', '求数量', '优先投录用率高的会议期刊'],
      ['ask', '每次问我', '论文写完时暂停，由你决定投哪里'],
    ] },
    { k: 'rebuttal', name: 'Rebuttal', opts: [
      ['auto', '自动处理', '自动写一份中规中矩的 rebuttal'],
      ['ask', '每次问我', '收到初审意见时暂停，由你决定怎么回'],
    ] },
    { k: 'travel', name: '会议出差', opts: [
      ['student', '学生去', '论文被接收后，第一作者去开会（花差旅费，学生开心）'],
      ['both', '一起去', '你也一起去：声望、人脉提升，花费翻倍，你会更累'],
      ['none', '都不去', '省钱，但学生有点失落'],
    ] },
    { k: 'auto', name: '托管', opts: [
      ['off', '关闭', '所有决定都由你来做'],
      ['minor', '小事托管', '排课、审稿邀请、Rebuttal 之类的日常小事，自动按推荐选项处理'],
      ['all', '全部托管', '除了考核结果，所有事情都自动处理——真正的挂机模式'],
    ] },
  ];
  const policyDesc = (k, v) => { const p = POLICIES.find(x => x.k === k); const o = p && p.opts.find(x => x[0] === v); return o ? o[2] : ''; };

  // ---------- 顶栏 ----------
  function renderTop() {
    if (!g) return '';
    const sem = S.currentSemester(g);
    const hol = S.isHoliday(g);
    const incD = S.income(g), exD = S.expenses(g);
    const inc = incD.total, ex = exD.total, net = inc - ex;
    const M = RS.Main;
    const speeds = ['1x', '2x', '4x', '10x'];
    const blocked = g.queue.length > 0;
    const moneyTip = `经费余额与每月净收支\n收入：基金拨款 +${money(incD.grants)}${incD.dept ? `，学院补贴 +${money(incD.dept)}` : ''}\n支出：工资 -${money(exD.salaries)}，算力 -${money(exD.compute)}，设施 -${money(exD.facilities)}，杂费 -${money(exD.supplies)}\n（「经费」页有逐项明细和年度账本）`;
    return `
      ${g.phd ? `<div class="brand" data-tip="${esc(g.school)} · ${esc(g.pi.name)} 的 ${esc(g.labName)}">${ico('cap')}<b>博士生 · 第 ${S.phdYear(g)} 年</b></div>` : `<div class="brand" data-tip="${esc(g.labName)} · ${esc(g.school)} · ${esc(G.titleName(g))}">${ico('flask')}<b>${esc(g.labName)}</b></div>`}
      <div class="date">${ico('calendar')}<b>${G.dateStr(g.day)}</b><span class="dim">${hol ? '假期' : sem ? sem.name : '假期'}</span></div>
      <div class="speed">
        <button class="${M.paused ? 'on' : ''}" data-act="pause" data-tip="暂停 / 继续（空格键）">${ico(M.paused ? 'play' : 'pause')}</button>
        ${speeds.map((s, i) => `<button class="${!M.paused && M.speedIdx === i ? 'on' : ''}" data-act="speed" data-arg="${i}" data-tip="${['每天 1.5 秒', '每天 0.75 秒', '每天 0.4 秒', '每天 0.15 秒'][i]}（数字键 ${i + 1}）">${s}</button>`).join('')}
        ${blocked ? `<button class="alert" data-act="openQueue" data-tip="有事情等待你决定">${ico('exclam')}</button>` : ''}
      </div>
      <div class="chips">${g.phd ? phdChips() : `
        <span class="chip" data-tip="${esc(moneyTip)}">${ico('money')}<b class="${g.funds < 0 ? 'bad' : ''}">${money(g.funds)}</b><small class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${money(net)}/月</small></span>
        <span class="chip" data-tip="PI 精力：太低会病倒，还会影响学生">${ico('energy')}<span class="mini ${g.pi.energy < 25 ? 'bad' : g.pi.energy < 50 ? 'warn' : 'good'}"><i style="width:${g.pi.energy.toFixed(0)}%"></i></span><b>${Math.round(g.pi.energy)}</b></span>
        <span class="chip" data-tip="学术声望：${repTitle(g.rep)}">${ico('star')}<b>${Math.floor(g.rep)}</b></span>
        <span class="chip" data-tip="已发表论文（A 类）">${ico('paper')}<b>${g.papers.filter(p => !p.retracted && !p.phd).length}</b><small>A ${g.stats.pubs.A}</small></span>
        <span class="chip" data-tip="总引用 · h-index">${ico('quote')}<b>${U.compact(g.stats.cites)}</b><small>h ${g.stats.h}</small></span>`}
      </div>
      <div class="sys">
        <button data-act="compact" data-tip="迷你模式：只保留实验室画面，适合挂在桌面角落">迷你</button>
        <button data-act="settings" data-tip="设置 / 存档">${ico('gear')}</button>
        <button data-act="help" data-tip="玩法说明">${ico('question')}</button>
      </div>`;
  }

  // 博士阶段的顶栏：你自己的状态
  function phdChips() {
    const m = S.me(g);
    if (!m) return '';
    const mine = S.myPapers(g);
    const trust = Math.round(m.trust == null ? 55 : m.trust);
    return `
        <span class="chip" data-tip="你的心情：长期太低会陷入读博的低谷">${ico('heart')}<span class="mini ${moodCls(m.mood)}"><i style="width:${m.mood.toFixed(0)}%"></i></span><b>${Math.round(m.mood)}</b></span>
        <span class="chip" data-tip="导师对你的信任：决定推荐信的分量">${ico('star')}<b>${trust}</b><small>信任</small></span>
        <span class="chip" data-tip="我的论文（一作 · 一作 A 类）">${ico('paper')}<b>${m.pubs}</b><small>一作 ${m.first || 0} · A ${m.firstA || 0}</small></span>
        <span class="chip" data-tip="我的论文总引用">${ico('quote')}<b>${U.compact(U.sum(mine, p => p.cites))}</b></span>`;
  }

  // ---------- 概览 ----------
  function upcoming() {
    const out = [];
    const add = (day, text, icon) => { if (day >= g.day) out.push({ day, text, icon }); };
    S.venuesFor(g).filter(v => v.tier === 'A' && v.dl).map(v => ({ v, d: S.nextDeadline(v, g.day) }))
      .sort((a, b) => a.d - b.d).slice(0, 3).forEach(x => add(x.d, `${x.v.name} 截稿`, 'paper'));
    g.proposals.forEach(p => add(p.status === 'writing' ? p.deadline : p.resultDay, p.status === 'writing' ? `${p.name} 申请截止` : `${p.name} 公布结果`, 'money'));
    const R = G.region(g);
    R.recruit.forEach(c => add(G.nextDate(g.day + 1, c.open[0], c.open[1]), c.name, 'people'));
    const calls = {};
    R.grants.filter(x => x.open && !x.special && !S.grantElig(g, x)).forEach(x => {
      const d = G.nextDate(g.day + 1, x.open[0], x.open[1]);
      (calls[d] = calls[d] || []).push(x.name);
    });
    Object.keys(calls).map(Number).sort((a, b) => a - b).slice(0, 2).forEach(d => add(d, `基金开放申请：${calls[d].join('、')}`, 'money'));
    const ev = S.nextEval(g);
    if (ev) add(ev.day, ev.name, 'star');
    add(G.nextDate(g.day + 1, 12, 30), '年度总结', 'calendar');
    return out.sort((a, b) => a.day - b.day).slice(0, 7);
  }

  function evalCard() {
    const ev = S.nextEval(g);
    if (!ev) {
      const R = G.region(g);
      const pr = R.promotions.find(p => p.to === g.pi.title + 1);
      if (!pr) return `<div class="card"><h3>${ico('trophy')} 职业生涯</h3><p class="dim">你已经站在了学术生涯的顶峰。继续培养学生、冲击更高的荣誉吧。</p></div>`;
      const since = (g.day - (g.pi.title === 1 ? g.pi.tenureDay : g.pi.promoDay)) / 360;
      const rows = [
        ['任职年限', since.toFixed(1) + ' 年', pr.after + ' 年', since >= pr.after, since / pr.after],
        ['学术声望', Math.floor(g.rep), pr.rep, g.rep >= pr.rep, g.rep / pr.rep],
        ['A 类论文', g.stats.pubs.A, pr.papersA, g.stats.pubs.A >= pr.papersA, g.stats.pubs.A / pr.papersA],
      ];
      if (pr.ugCourses) rows.push(['本科课程（门次）', g.teaching.ug || 0, pr.ugCourses, (g.teaching.ug || 0) >= pr.ugCourses, (g.teaching.ug || 0) / pr.ugCourses]);
      return `<div class="card"><h3>${ico('star')} 晋升${esc(R.titles[pr.to])}</h3>${rows.map(r => critRow(r[0], r[1], r[2], r[3], r[4])).join('')}<p class="small dim">每年 ${G.mdStr(G.dayOf(R.evalDate[0], R.evalDate[1]))} 自动评估。</p></div>`;
    }
    const crit = S.evalCriteria(g, ev.kind);
    return `<div class="card"><h3>${ico('star')} ${esc(ev.name)}</h3>
      <p class="small dim">${G.dateStr(ev.day)}（${G.daysText(ev.day - g.day)}）</p>
      ${crit.map(c => critRow(c.name, G.metricFmt(g, c.key, c.cur), G.metricFmt(g, c.key, c.need), c.ok, c.cur / c.need)).join('')}
      ${ev.kind === 'final' ? `<p class="small ${crit.every(c => c.ok) ? 'good' : 'warn'}">${crit.every(c => c.ok) ? '目前所有指标都已达标，保持住！' : '全部达标才能通过。差一点点的话，可能会有一年延期。'}</p>` : ''}
    </div>`;
  }
  function critRow(name, cur, need, ok, ratio) {
    return `<div class="crit"><span class="cname">${ok ? ico('check') : ico('dots')}${esc(name)}</span>${bar(ratio, ok ? 'good' : ratio > 0.7 ? 'warn' : 'bad')}<span class="cval">${esc(String(cur))} / ${esc(String(need))}</span></div>`;
  }

  function tabLab() {
    const pi = g.pi, pol = g.policies;
    const ctx = S.dayContext(g);
    const net = S.income(g).total - S.expenses(g).total;
    const topics = G.area(g).topics.slice().sort((a, b) => g.topics[b.id].heat - g.topics[a.id].heat);
    const piStat = (k, n) => `<div class="pstat"><label>${n}</label>${mini(pi.stats[k])}</div>`;
    const resting = g.flags.restUntil > g.day;
    return `
      <div class="card pi-card">
        ${portraitHTML({ pi: true }, 'big')}
        <div class="grow">
          <div class="row"><b class="name">${esc(pi.name)}</b>${tag(G.titleName(g), 'gold')}</div>
          <div class="small dim">${esc(g.school)}（${esc(G.tierCfg(g).name)}）· ${esc(G.area(g).name)} · ${G.piAge(g)} 岁 · 入职第 ${G.careerYear(g)} 年</div>
          ${bar(pi.energy / 100, pi.energy < 25 ? 'bad' : pi.energy < 50 ? 'warn' : 'good', `精力 ${Math.round(pi.energy)} / 100${resting ? '（休养中）' : ''}`)}
          <div class="row small">${tag(repTitle(g.rep), 't-mid')}${g.titles.map(t => tag(t, 'gold')).join('')}${g.honors.map(h => tag(h.name, 'gold')).join('')}</div>
        </div>
      </div>
      <div class="card"><div class="pstats">${piStat('research', '研究')}${piStat('writing', '写作')}${piStat('network', '人脉')}${piStat('teaching', '教学')}</div></div>
      <div class="card"><h3>${ico('energy')} 精力分配</h3>${seg('focus', POLICIES[0].opts, pol.focus)}<p class="hint">${esc(policyDesc('focus', pol.focus))}</p></div>
      ${evalCard()}
      <div class="card"><h3>${ico('flask')} 实验室</h3>
        <div class="kvline"><span>成员 / 工位</span><b class="${g.members.length > G.desks(g) ? 'bad' : ''}">${g.members.length} / ${G.desks(g)}</b></div>
        <div class="kvline" data-tip="PI 一个人能精心指导的学生有限。博士后可以帮你带学生（每位 +2.5），小组组长也能分担（每位 +1.5，博士后组长 +1）。"><span>指导负担</span><b class="${ctx.mentor.factor < 1 ? 'warn' : ''}">${ctx.mentor.load.toFixed(1)} / ${ctx.mentor.cap.toFixed(1)}${ctx.mentor.factor < 1 ? `（效率 ${Math.round((ctx.mentor.factor - 1) * 100)}%）` : ''}</b></div>
        <div class="kvline"><span>算力 / 需求</span><b class="${ctx.demand > 0 && ctx.ratio < 0.8 ? 'bad' : ''}">${ctx.units} / ${ctx.demand.toFixed(0)}</b></div>
        <div class="kvline"><span>平均心情</span><b>${g.members.length ? Math.round(U.avg(g.members, m => m.mood)) : '-'}</b></div>
        <div class="kvline"><span>每月净收支</span><b class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${money(net)}</b></div>
      </div>
      <div class="card"><h3>${ico('calendar')} 近期日程</h3>${upcoming().map(u => `<div class="kvline">${ico(u.icon)}<span class="grow">${esc(u.text)}</span><span class="dim small">${G.mdStr(u.day)} · ${G.daysText(u.day - g.day)}</span></div>`).join('')}</div>
      <div class="card"><h3>${ico('fire')} 领域热点</h3>
        ${topics.map(t => { const gr = S.groupOfTopic(g, t.id); return `<div class="kvline"><span class="grow">${esc(t.name)}${t.id === pol.coreTopic ? tag('核心', 'gold') : ''}${gr ? ` <i class="gdot" style="--gc:${gcolor(gr)}" data-tip="${esc(S.groupName(g, gr))}：${S.groupMembers(g, gr).length} 人"></i>` : ''}</span>${heatIcons(g.topics[t.id].heat)}<span class="small dim" data-tip="实验室在这个方向的积累，越高论文质量越好">积累 ${(g.expertise[t.id] || 0).toFixed(1)}</span></div>`; }).join('')}
      </div>`;
  }

  // ---------- 成员 ----------
  function taskText(m) {
    if (m.status === 'intern') return `${ico('mail')}在 ${esc(m.awayWhy)}（${G.daysText(m.awayUntil - g.day)}回来）`;
    if (m.status === 'away') return `${ico('zz')}${esc(m.awayWhy || '请假')}中（${G.daysText(m.awayUntil - g.day)}回来）`;
    const p = m.projectId ? G.project(g, m.projectId) : null;
    if (!p) return `${ico('bulb')}正在构思新课题…`;
    const lead = p.lead === m.id;
    const ph = p.phase;
    const prog = S.WORK_PHASES.includes(ph) ? ` ${Math.round((p.prog / p.need[ph]) * 100)}%` : '';
    return `${ico({ idea: 'bulb', exp: 'gear', write: 'pen' }[ph] || 'paper')}${lead ? '负责' : '协助'}《${esc(S.short(p.title))}》· ${S.PHASE_NAMES[ph]}${prog}`;
  }
  // 可折叠区块：用按钮切换、状态记在 openState 里，界面刷新时不会被自动收起
  function fold(key, head, body, cls) {
    const open = !!openState[key];
    return `<div class="fold ${cls || ''}" data-key="fold-${key}">
      <button class="fold-head ${open ? 'open' : ''}" data-act="fold" data-arg="${key}"><span class="caret">${open ? '▾' : '▸'}</span>${head}</button>
      ${open ? `<div class="fold-body">${body}</div>` : ''}
    </div>`;
  }

  function memberDetail(m) {
    const bio = m.bio || {};
    const base = m.base || {};
    const grow = (k, n) => {
      const b = base[k] == null ? Math.round(m.stats[k]) : base[k];
      const d = Math.round(m.stats[k]) - b;
      return `<span>${n} ${b}→${Math.round(m.stats[k])}${d > 0 ? ` <b class="good">+${d}</b>` : ''}</span>`;
    };
    const papers = g.papers.filter(p => p.authors.includes(m.id));
    return `<div class="mdetail">
      <div class="kvline"><span>来自</span><b>${esc([m.school, bio.major].filter(Boolean).join(' · ') || '—')}</b></div>
      <div class="kvline"><span>职业理想</span><b>${esc(RS.GOALS[bio.goal] || '还没想好')}</b></div>
      <div class="kvline" data-tip="做自己感兴趣的方向：心情更好、效率 +5%。做完一个课题后，兴趣有时会转向刚做的方向。"><span>感兴趣的方向</span><b>${esc(topicName(bio.interest))}</b></div>
      <div class="kvline"><span>爱好</span><b>${esc((bio.hobbies || []).join('、') || '—')}</b></div>
      <div class="kvline"><span>口头禅</span><b>“${esc(bio.motto || '……')}”</b></div>
      <div class="kvline" data-tip="入组时的能力 → 现在"><span>成长</span><b class="growline">${grow('idea', '想法')}${grow('code', '编程')}${grow('write', '写作')}</b></div>
      <div class="sub">成长轨迹</div>
      ${(m.story || []).slice().reverse().map(s => `<div class="story"><span class="dim">${G.monthStr(s.d)}</span>${esc(s.t)}</div>`).join('') || '<div class="dim small">还没有什么故事。</div>'}
      <div class="sub">发表的论文（${papers.length}）</div>
      ${papers.slice(0, 8).map(p => `<div class="story">${tierTag(p.tier)}<span>${esc(S.short(p.title))} <span class="dim">${esc(RS.VENUES[p.venue].name)} ${p.year} · </span><b class="${/一作/.test(S.authorPos(p, m.id)) ? 'good' : ''}">${S.authorPos(p, m.id)}</b></span></div>`).join('') || '<div class="dim small">还没有论文。</div>'}
    </div>`;
  }

  function memberCard(m) {
    const R = G.region(g);
    const sal = S.salary(g, m);
    const fund = m.funding !== 'self' || m.role === 'phd' ? tag(S.fundName(g, m.funding), m.funding === 'fellow' ? 'gold' : 'fund') : '';
    const canTA = R.hasTA && m.role === 'phd' && m.funding !== 'fellow';
    const talkCd = m.talkCd > g.day, bonusCd = m.bonusCd > g.day;
    const bio = m.bio || {};
    const trust = Math.round(m.trust == null ? 55 : m.trust);
    const key = 'm-' + m.id;
    const open = !!openState[key];
    return `<div class="mcard ${selMember === m.id ? 'sel' : ''}" data-key="${m.id}" id="m-${m.id}">
      <img class="portrait" src="${SP.portraitURL(m.avatar, m.role, 3)}" alt="" data-act="locate" data-arg="${m.id}" data-tip="在画面中找到 TA">
      <div class="grow">
        <div class="row"><b class="name">${esc(m.name)}</b>${tag(S.ROLE_NAMES[m.role], 'role-' + m.role)}${tag(S.memberYearLabel(g, m), 'dim')}${fund}${bio.goal ? tag('想' + RS.GOALS[bio.goal].replace('还没想好', '再看看'), 't-mid', '职业理想：会影响 TA 对实习、跳槽和毕业去向的选择') : ''}</div>
        <div class="row traits">${traitTags(m)}</div>
        <div class="row small">${S.memberGroups(g, m).map(gr => groupTag(gr) + (gr.lead === m.id ? tag('组长', 'gold') : '')).join('') || '<span class="dim">未分组</span>'}<span class="dim">想做「${esc(topicName(bio.interest))}」</span></div>
        ${bio.motto ? `<div class="motto small">“${esc(bio.motto)}”</div>` : ''}
        <div class="stats3"><label>想法</label>${mini(m.stats.idea)}<label>编程</label>${mini(m.stats.code)}<label>写作</label>${mini(m.stats.write)}</div>
        <div class="row"><label class="small">心情</label>${bar(m.mood / 100, moodCls(m.mood))}<b class="num">${Math.round(m.mood)}</b></div>
        <div class="row" data-tip="师生信任：谈心、发奖金、一起发论文、支持实习会增加；内卷、拒绝实习、延期毕业会减少。&#10;信任高的学生更扛压、不容易被挖走，毕业时你的推荐信也更有分量。"><label class="small">信任</label>${bar(trust / 100, trust < 35 ? 'bad' : trust < 60 ? 'warn' : 'good')}<b class="num">${trust}</b></div>
        <div class="task small">${taskText(m)}</div>
        <div class="small dim">论文 ${m.pubs}（一作 ${m.first || 0} · A 类 ${m.pubsA}）· ${esc(m.school || '—')}${sal ? ` · 月薪 ${money(sal)}` : ''}</div>
        <div class="actions">
          <button data-act="talk" data-arg="${m.id}" ${talkCd || m.status !== 'active' ? 'disabled' : ''} data-tip="${talkCd ? '最近刚谈过' : '精力 -4，心情 +10~16，信任 +6'}">谈心</button>
          <button data-act="bonus" data-arg="${m.id}" ${bonusCd ? 'disabled' : ''} data-tip="${bonusCd ? '最近刚发过' : `经费 -${money(S.bonusCost(g, m))}，心情 +18，信任 +4`}">发奖金</button>
          ${canTA ? `<button data-act="fund" data-arg="${m.id}" data-tip="${m.funding === 'ta' ? '改回 RA：由你发工资，效率恢复' : `当助教：系里发工资，但效率 -35%（名额 ${S.taUsed(g)}/${G.tierCfg(g).taSlots}）`}">${m.funding === 'ta' ? '改回 RA' : '去当助教'}</button>` : ''}
          <button data-act="memberGroups" data-arg="${m.id}" data-tip="把 TA 分到某个（最多两个）子方向小组">分组</button>
          <button data-act="grad" data-arg="${m.id}" data-tip="查看毕业要求和去向预估，由你安排毕业">毕业</button>
          <button data-act="fold" data-arg="${key}">${open ? '收起档案' : '档案'}</button>
          <button class="danger" data-act="dismiss" data-arg="${m.id}" data-tip="让 TA 离开实验室（声望 -1，全组心情 -5）">${confirmDismiss === m.id ? '确定劝退？' : '劝退'}</button>
        </div>
        ${open ? memberDetail(m) : ''}
      </div>
    </div>`;
  }
  function tabMembers() {
    const ugCd = (g.cooldowns.ug || 0) > g.day;
    const roleOrder = { postdoc: 0, phd: 1, ms: 2, visit: 3, ug: 4 };
    const list = g.members.slice().sort((a, b) => roleOrder[a.role] - roleOrder[b.role] || a.startDay - b.startDay);
    const reasons = { graduated: '毕业', quit: '退出', poached: '被挖走', dismissed: '劝退', visit_end: '访问结束' };
    return `
      <div class="toolbar">
        <span>成员 <b>${g.members.length}</b> / 工位 ${G.desks(g)}</span>
        <button data-act="ugPool" ${ugCd ? 'disabled' : ''} data-tip="${ugCd ? G.daysText(g.cooldowns.ug - g.day) + '后可以再招' : '本科生不用发工资，会给博士生打下手'}">招本科生</button>
        <button data-act="postdoc" ${g.flags.postdocSearch ? 'disabled' : ''} data-tip="${g.flags.postdocSearch ? '招聘中，等待申请' : `博士后能力强，还能分担指导工作；月薪 ${money(G.region(g).costs.postdoc)}`}">招博士后</button>
      </div>
      ${g.members.length > G.desks(g) ? `<p class="warn small">工位不够了！挤在一起会让大家心情变差、效率下降。去「设施」页扩建实验室吧。</p>` : ''}
      ${list.map(memberCard).join('') || '<p class="dim">实验室空空荡荡……</p>'}
      ${g.alumni.length ? fold('alumni', `已离开的成员（${g.alumni.length}）`, g.alumni.slice(0, 60).map(a => `<div class="kvline alum"><img class="portrait tiny" src="${SP.portraitURL(a.avatar, a.role, 2)}" alt=""><span class="grow">${esc(a.name)}<span class="dim small"> ${S.ROLE_NAMES[a.role]} · ${reasons[a.reason] || a.reason} · ${G.yearOfDay(a.leftDay)} · 论文 ${a.pubs || 0}（一作 ${a.first || 0} · A ${a.pubsA || 0}）</span></span><span class="small">${esc(a.dest || '')}</span></div>`).join(''), 'card') : ''}`;
  }

  // ---------- 小组 ----------
  function mchip(m, gr) {
    const it = S.interestOf(m);
    const lead = gr && gr.lead === m.id;
    const tip = `${m.name}（${S.ROLE_NAMES[m.role]}）\n想做「${topicName(it)}」${lead ? '\n本组组长' : ''}\n点击调整 TA 的小组`;
    return `<span class="mchip" data-key="${m.id}" data-act="memberGroups" data-arg="${m.id}" data-tip="${esc(tip)}"><img class="portrait mini" src="${SP.portraitURL(m.avatar, m.role, 2)}" alt="">${esc(RS.shortName(m.name))}${lead ? '<b class="gold">★</b>' : ''}${gr && it === gr.topic ? '<span class="good" data-tip="TA 对这个方向最感兴趣">♥</span>' : ''}${gr ? `<button class="x" data-act="groupKick" data-arg="${gr.id}" data-k="${m.id}" data-tip="移出本组">×</button>` : ''}</span>`;
  }
  function groupCard(gr, al) {
    const t = G.topic(g, gr.topic);
    const mem = S.groupMembers(g, gr);
    const lead = G.member(g, gr.lead);
    const projs = g.projects.filter(p => p.topic === gr.topic);
    const cnt = (...phs) => projs.filter(p => phs.includes(p.phase)).length;
    const papers = g.papers.filter(p => p.topic === gr.topic && !p.retracted);
    const dem = al.dem[gr.id] || 0, got = al.got[gr.id] || 0, own = al.own[gr.id] || 0;
    const ratio = dem > 0 ? got / dem : 1;
    const f = dem > 0 ? U.clamp(Math.pow(ratio, 0.6), 0.25, 1.15) : 1;
    const owned = Object.keys(g.gpus).map(id => ({ s: G.gpuSpec(g, id), n: g.gpus[id] })).filter(x => x.s);
    const a = g.gpuAlloc[gr.id] || {};
    const compLabel = dem > 0
      ? `需求 ${dem.toFixed(0)} · 可用 ${got.toFixed(0)}（专用 ${own}${got - own >= 0.5 ? ` + 共享 ${(got - own).toFixed(0)}` : ''}）· 实验效率 ×${f.toFixed(2)}`
      : `现在没有课题在做实验${own ? ` · 专用 ${own} 闲置` : ''}`;
    return `<div class="card gcard" data-key="${gr.id}" style="--gc:${gcolor(gr)}">
      <div class="row"><b class="gname">${esc(S.groupName(g, gr))}</b>${gr.topic === g.policies.coreTopic ? tag('核心', 'gold') : ''}${heatIcons(g.topics[gr.topic].heat)}<span class="small dim" data-tip="实验室在这个方向的积累，越高论文质量越好">积累 ${(g.expertise[gr.topic] || 0).toFixed(1)}</span><span class="grow"></span>
        <button class="mini-btn danger" data-act="groupDel" data-arg="${gr.id}" data-tip="解散小组：组员改为自由选题，专用服务器回到共享池">${confirmGroupDel === gr.id ? '确定解散？' : '解散'}</button></div>
      <div class="kvline"><span>组长</span><b>${lead ? esc(lead.name) : '<span class="dim">暂无（由你直接管理）</span>'}</b><button class="mini-btn" data-act="groupLead" data-arg="${gr.id}" data-tip="组长帮你带组员：指导容量 +1.5，组员成长 +12%，组里的构思更有把握；组长自己效率 -8%">${lead ? '更换' : '任命'}</button></div>
      <div class="sub">成员（${mem.length}）</div>
      <div class="chips-wrap">${mem.map(m => mchip(m, gr)).join('')}<button class="chip-btn" data-act="groupAdd" data-arg="${gr.id}">+ 添加成员</button></div>
      <div class="kvline small"><span>在研课题</span><b>构思 ${cnt('idea')} · 实验 ${cnt('exp')} · 写作 ${cnt('write')} · 投稿/审稿 ${cnt('ready', 'review')}</b></div>
      <div class="kvline small"><span>已发表</span><b>${papers.length} 篇（A 类 ${papers.filter(p => p.tier === 'A').length}）</b></div>
      ${G.area(g).compute >= 0.3 || owned.length ? `<div class="sub">算力 <span class="small dim">· 这个方向算力需求${computeWord(t.compute)}</span></div>
      ${bar(dem > 0 ? ratio : 1, f < 0.8 ? 'bad' : f < 1 ? 'warn' : 'good', compLabel)}
      ${owned.map(x => {
        const n = a[x.s.id] || 0;
        const free = x.n - S.allocCount(g, x.s.id);
        return `<div class="kvline small"><span class="grow">专用 ${esc(x.s.name)} <span class="dim">（每台 ${x.s.units} 算力，还有 ${free} 台没分配）</span></span><div class="stepper"><button data-act="alloc" data-arg="${gr.id}" data-k="${x.s.id}" data-v="-1" ${n <= 0 ? 'disabled' : ''}>-</button><b>${n}</b><button data-act="alloc" data-arg="${gr.id}" data-k="${x.s.id}" data-v="1" ${free <= 0 ? 'disabled' : ''}>+</button></div></div>`;
      }).join('')}` : ''}
    </div>`;
  }
  function tabGroups() {
    const ctx = S.dayContext(g);
    const al = ctx.alloc;
    const max = S.maxGroups(g);
    const free = g.members.filter(m => !(m.groups || []).length);
    const pol = POLICIES.find(p => p.k === 'consult'), tpol = POLICIES.find(p => p.k === 'topic');
    const noLead = g.groups.filter(gr => !G.member(g, gr.lead)).length;
    return `
      <div class="card"><h3>${ico('branch')} 课题组 · 子方向（${g.groups.length} / ${max}）</h3>
        <p class="small dim">把实验室分成几个子方向：每个学生可以加入一两个小组，新课题在所属小组的方向里选；同组的人越多，讨论越充分。服务器可以专门分给某个小组。小组太多方向就分散了，而且没有组长的小组要你亲自协调。</p>
        ${noLead > 1 ? `<p class="small warn">有 ${noLead} 个小组没有组长，你每天要多花 ${(S.groupEnergyCost(g)).toFixed(2)} 精力协调。</p>` : ''}
        <div class="sub">学生做完课题后</div>${seg('consult', pol.opts, g.policies.consult)}<p class="hint">${esc(policyDesc('consult', g.policies.consult))}</p>
        <div class="sub">选题倾向</div>${seg('topic', tpol.opts, g.policies.topic)}<p class="hint">${esc(policyDesc('topic', g.policies.topic))}</p>
        <button class="wide" data-act="groupNew" ${g.groups.length >= max ? 'disabled' : ''} data-tip="${g.groups.length >= max ? '扩建实验室后可以设更多小组' : '选一个方向成立新的小组'}">成立新小组</button>
      </div>
      ${g.groups.map(gr => groupCard(gr, al)).join('')}
      <div class="card"><h3>${ico('gpu')} 共享算力池</h3>
        <div class="kvline"><span>共享算力（没分配的服务器 + 云）</span><b>${al.pool}</b></div>
        ${al.dem._pool > 0 ? `<div class="kvline"><span>不属于任何小组的课题在用</span><b>${al.got._pool.toFixed(0)} / 需求 ${al.dem._pool.toFixed(0)}</b></div>` : ''}
        ${al.idle >= 0.5 ? `<div class="kvline" data-tip="专用服务器只给本组用，本组用不完也不会借给别人"><span>专用但闲置</span><b class="warn">${al.idle.toFixed(0)}</b></div>` : ''}
        <p class="small dim">专用服务器保证本组的实验不被别的组挤占，但闲着也不外借；共享池按各组的缺口分配。云算力始终共享。</p>
      </div>
      <div class="card"><h3>${ico('people')} 未分组的成员（${free.length}）</h3>
        <div class="chips-wrap">${free.map(m => mchip(m, null)).join('') || '<span class="dim small">所有人都有小组了。</span>'}</div>
        ${free.length ? '<p class="small dim">未分组的成员按「选题倾向」自由选题，用共享算力。点击可以给 TA 分组。</p>' : ''}
      </div>`;
  }

  // ---------- 研究 ----------
  function projCard(p) {
    const lead = G.member(g, p.lead);
    const topic = G.topic(g, p.topic);
    const phases = ['idea', 'exp', 'write', 'ready', 'review'];
    const ci = phases.indexOf(p.phase);
    const helpers = p.helpers.map(id => G.member(g, id)).filter(Boolean).map(m => RS.shortName(m.name));
    const est = S.estQuality(g, p);
    let target = '';
    if (p.phase === 'ready') {
      if (p.target) {
        const v = RS.VENUES[p.target.v];
        const prob = S.acceptProb(g, p, v, est);
        target = `<div class="small">→ <b>${esc(v.name)}</b> ${tierTag(v.tier)} · ${v.type === 'jour' ? '即将投出' : `截稿 ${G.mdStr(p.target.day)}（${G.daysText(p.target.day - g.day)}）`} · 录用率约 ${pct(prob)}</div>`;
      } else target = `<div class="small warn">等待选择投稿目标</div>`;
    } else if (p.phase === 'review') {
      const v = RS.VENUES[p.venue];
      target = `<div class="small">审稿中：<b>${esc(v.name)}</b> ${tierTag(v.tier)} · 预计 ${G.mdStr(p.notifyDay)} 出结果</div>`;
    }
    const work = S.WORK_PHASES.includes(p.phase);
    const gr = S.groupOfTopic(g, p.topic);
    const mine = !!g.phd && (p.lead === g.player || p.authors.includes(g.player));
    const canEdit = !g.phd || p.lead === g.player; // 博士阶段只能动你自己负责的课题
    return `<div class="pcard ${mine ? 'mine' : ''}" data-key="${p.id}">
      <div class="ptitle">${esc(p.title)}</div>
      <div class="row small">${gr ? groupTag(gr, `方向：${topic.name}`) : tag(topic.name, 't-mid', '这个方向没有对应的小组，用共享算力')}${heatIcons(g.topics[p.topic].heat)}<span class="dim">${lead ? esc(lead.name) : '前成员'}${helpers.length ? ' + ' + esc(helpers.join('、')) : ''}</span></div>
      <div class="pipeline">${phases.map((ph, i) => `<span class="${i === ci ? 'cur' : i < ci ? 'done' : ''}">${S.PHASE_NAMES[ph]}</span>`).join('')}</div>
      ${work ? bar(p.prog / p.need[p.phase], p.rush > 0 ? 'warn' : '', `${S.PHASE_NAMES[p.phase]} ${Math.round((p.prog / p.need[p.phase]) * 100)}%${p.rush > 0 ? ' · DDL 冲刺中！' : ''}`) : ''}
      ${['write', 'ready', 'review'].includes(p.phase) ? (() => { const ao = S.authorOrder(g, p); return `<div class="small authors" data-tip="按目前的实际工作量排序">署名：${authorsHTML(S.authorList(g, { authors: ao.order, co: ao.co, ext: p.collab ? p.collab.who : null, guest: p.guest }))}</div>`; })() : ''}
      <div class="row small"><span data-tip="基于当前进度的估计，有误差">预估质量 <b>${Math.round(est)}</b></span>${p.attempts ? `<span class="bad">已被拒 ${p.attempts} 次</span>` : ''}${p.collab ? `<span class="good">合作：${esc(p.collab.who)}</span>` : ''}${p.bold ? '<span class="gold">大胆的想法</span>' : ''}</div>
      ${target}
      <div class="actions">${canEdit && p.phase === 'ready' ? `<button data-act="venue" data-arg="${p.id}">选择投稿目标</button>` : ''}${canEdit && p.phase === 'idea' ? `<button data-act="topic" data-arg="${p.id}">换方向</button>` : ''}${mine ? '<span class="tag gold">我的</span>' : ''}</div>
    </div>`;
  }
  // 署名：* 共同一作，✉ 通讯作者；你自己的名字金色，外单位的合作者灰色
  function authorsHTML(list) {
    return list.map(a => {
      const tip = a.corr ? (a.me ? '通讯作者（你）' : '通讯作者（导师）') : a.me ? (a.co ? '你（共同一作）' : '你') : a.co ? '共同一作' : a.guest ? '挂名' : a.ext ? '外单位合作者' : '';
      return `<span class="${a.me ? 'gold' : a.ext && !a.corr ? 'dim' : ''}"${tip ? ` data-tip="${tip}"` : ''}>${esc(a.n)}${a.co ? '*' : ''}${a.corr ? '✉' : ''}</span>`;
    }).join(', ');
  }
  function paperRow(pa) {
    const v = RS.VENUES[pa.venue];
    return `<div class="paper ${pa.retracted ? 'retracted' : ''}" data-key="${pa.id}">
      ${tierTag(pa.tier)}
      <div class="grow"><div class="ptitle">${esc(pa.title)}${pa.phd ? ' <span class="tag dim" data-tip="读博期间发表的论文：算进引用和 h-index，不算进考核">博士期间</span>' : ''}</div>
      <div class="small authors">${authorsHTML(S.authorList(g, pa))}</div>
      <div class="small dim">${esc(v.name)} ${pa.year}${pa.best ? ` · <span class="gold">${ico('trophy')}最佳论文</span>` : ''}${pa.oral ? ' · Oral' : ''}${pa.viral ? ' · <span class="good">出圈</span>' : ''}${pa.retracted ? ' · <span class="bad">已撤稿</span>' : ''} · 引用 ${pa.cites}</div></div>
    </div>`;
  }
  function tabResearch() {
    const order = { idea: 0, exp: 1, write: 2, ready: 3, review: 4 };
    const phd = !!g.phd;
    // 博士阶段：你参与的课题排在最前面
    const mineP = p => p.lead === g.player || p.helpers.includes(g.player) || p.authors.includes(g.player);
    const projs = g.projects.slice().sort((a, b) => (phd ? (mineP(b) ? 1 : 0) - (mineP(a) ? 1 : 0) : 0) || order[b.phase] - order[a.phase]);
    let papers = g.papers;
    if (paperFilter === 'mine') papers = S.myPapers(g);
    if (paperFilter === 'A') papers = papers.filter(p => p.tier === 'A');
    if (paperFilter === 'best') papers = papers.filter(p => p.best || p.oral);
    if (paperFilter === 'cite') papers = papers.slice().sort((a, b) => b.cites - a.cites);
    const inReview = g.projects.filter(p => p.phase === 'review').length;
    const labPapers = g.papers.filter(p => !p.retracted && !p.phd);
    const filters = [['all', '最新'], ['A', 'A 类'], ['best', '获奖/Oral'], ['cite', '高引']];
    if (phd) filters.unshift(['mine', '我的论文']);
    return `
      <div class="statline">
        ${phd ? '<span class="gold">导师实验室</span>' : ''}
        <span>论文 <b>${labPapers.length}</b></span><span>A 类 <b>${g.stats.pubs.A}</b></span><span>最佳论文 <b>${g.stats.bestPapers}</b></span>
        <span>引用 <b>${U.fmtInt(g.stats.cites)}</b></span><span>h-index <b>${g.stats.h}</b></span><span>审稿中 <b>${inReview}</b></span>
        <span>投稿 ${g.stats.submissions} · 被拒 ${g.stats.rejects}</span>
      </div>
      <h3 class="sec">${ico('bulb')} 进行中的课题（${projs.length}）</h3>
      ${projs.map(projCard).join('') || '<p class="dim">还没有课题。</p>'}
      <h3 class="sec">${ico('paper')} 已发表论文（${g.papers.length}）</h3>
      ${seg('paperFilter', filters, paperFilter, 'paperFilter')}
      ${papers.slice(0, paperLimit).map(paperRow).join('') || '<p class="dim">还没有发表论文。</p>'}
      ${papers.length > paperLimit ? `<button class="wide" data-act="paperMore">显示更多（还有 ${papers.length - paperLimit} 篇）</button>` : ''}`;
  }

  // ---------- 经费 ----------
  function sparkline() {
    const h = g.history.slice(-48);
    if (h.length < 2) return '';
    const vals = h.map(x => x.f);
    const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals);
    const W = 300, H = 50;
    const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - ((v - lo) / (hi - lo)) * H).toFixed(1)}`).join(' ');
    const zero = H - ((0 - lo) / (hi - lo)) * H;
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="0" y1="${zero}" x2="${W}" y2="${zero}" class="zero"/><polyline points="${pts}"/></svg><div class="small dim">近 ${h.length} 个月经费余额走势</div>`;
  }
  const LEDGER_COLORS = ['#3b5dc9', '#ef7d57', '#38b764', '#94b0c2', '#b13e53', '#ffcd75', '#41a6f6', '#a7f070', '#5d275d', '#73eff7', '#566c86'];
  function itemList(items, sign) {
    return items.map(x => `<div class="kvline item"><span class="grow">${esc(x.name)}${x.left != null ? `<span class="dim small"> · 剩 ${x.left} 个月</span>` : ''}</span><b class="${sign > 0 ? 'good' : 'bad'}">${sign > 0 ? '+' : '-'}${money(x.v)}</b></div>`).join('') || '<div class="dim small">暂无</div>';
  }
  function ledgerRows(dir, data) {
    const entries = Object.keys(data || {}).map(k => ({ k, v: data[k] })).filter(x => x.v > 0).sort((a, b) => b.v - a.v);
    const total = U.sum(entries, x => x.v);
    if (!entries.length) return '<div class="dim small">暂无记录</div>';
    return entries.map((x, i) => `<div class="lrow"><span class="lname">${esc(G.ledgerName(g, dir, x.k))}</span><span class="lbar"><i style="width:${((x.v / total) * 100).toFixed(1)}%;background:${LEDGER_COLORS[i % LEDGER_COLORS.length]}"></i></span><b class="${dir === 'in' ? 'good' : 'bad'}">${money(x.v)}</b><span class="dim small lpct">${Math.round((x.v / total) * 100)}%</span></div>`).join('');
  }
  function tabFunding() {
    const ex = S.expenses(g), inc = S.income(g), net = inc.total - ex.total;
    const run = S.runway(g);
    const R = G.region(g);
    const regular = R.grants.filter(x => x.open && !x.special);
    const seekCd = (g.cooldowns.seek || 0) > g.day;
    const items = S.monthlyItems(g);
    // 每月支出构成条
    const parts = [['人员工资', ex.salaries, '#3b5dc9'], ['算力维护', ex.compute, '#ef7d57'], ['设施维护', ex.facilities, '#38b764'], ['耗材杂费', ex.supplies, '#94b0c2']].filter(x => x[1] > 0);
    const stack = ex.total > 0 ? `<div class="stack">${parts.map(p => `<i style="width:${((p[1] / ex.total) * 100).toFixed(1)}%;background:${p[2]}" data-tip="${p[0]} ${money(p[1])}/月（${Math.round((p[1] / ex.total) * 100)}%）"></i>`).join('')}</div>
      <div class="legend">${parts.map(p => `<span><i style="background:${p[2]}"></i>${p[0]} ${Math.round((p[1] / ex.total) * 100)}%</span>`).join('')}</div>` : '';
    // 年度账本
    const years = Object.keys(g.ledger || {}).map(Number).sort((a, b) => b - a);
    const cy = G.calYear(g);
    const ly = ledgerYear && years.includes(ledgerYear) ? ledgerYear : cy;
    const L = (g.ledger || {})[ly] || { in: {}, out: {} };
    const tin = U.sum(Object.values(L.in)), tout = U.sum(Object.values(L.out));
    const grantGroups = {};
    items.inc.grants.forEach(x => { (grantGroups[x.cat] = grantGroups[x.cat] || []).push(x); });
    return `
      <div class="card">
        <div class="money-big ${g.funds < 0 ? 'bad' : ''}">${money(g.funds)}</div>
        <div class="row small">月收入 <b class="good">+${money(inc.total)}</b>　月支出 <b class="bad">-${money(ex.total)}</b>　净 <b class="${net >= 0 ? 'good' : 'bad'}">${net >= 0 ? '+' : ''}${money(net)}</b></div>
        <div class="small ${run < 12 ? 'warn' : 'dim'}">${run === Infinity ? '收支平衡，经费可持续。' : `按当前开销，经费还能撑 ${Math.floor(run)} 个月。`}</div>
        ${sparkline()}
      </div>
      <div class="card"><h3>${ico('list')} 每月固定收支</h3>
        <div class="sub">收入 <b class="good">+${money(inc.total)}</b></div>
        ${Object.keys(grantGroups).map(cat => fold('fin-in-' + cat, `<span class="grow">${esc(G.ledgerName(g, 'in', cat))}（${grantGroups[cat].length} 项）</span><b class="good">+${money(U.sum(grantGroups[cat], x => x.v))}</b>`, itemList(grantGroups[cat], 1), 'line')).join('') || '<div class="dim small">目前没有基金拨款，经费只出不进。</div>'}
        ${inc.dept ? fold('fin-in-dept', `<span class="grow">学院补贴</span><b class="good">+${money(inc.dept)}</b>`, itemList(items.inc.dept, 1), 'line') : ''}
        <div class="sub">支出 <b class="bad">-${money(ex.total)}</b></div>
        ${fold('fin-salary', `<span class="grow">人员工资（${items.out.salary.length} 人领工资）</span><b class="bad">-${money(ex.salaries)}</b>`, itemList(items.out.salary, -1) + '<div class="dim small">本科生、访问学生、自费硕士、拿奖学金或当助教的学生不由你发工资。</div>', 'line')}
        ${fold('fin-compute', `<span class="grow">算力维护与云服务</span><b class="bad">-${money(ex.compute)}</b>`, itemList(items.out.compute, -1), 'line')}
        ${fold('fin-facility', `<span class="grow">设施维护</span><b class="bad">-${money(ex.facilities)}</b>`, itemList(items.out.facility, -1), 'line')}
        ${fold('fin-supplies', `<span class="grow">耗材与杂费</span><b class="bad">-${money(ex.supplies)}</b>`, itemList(items.out.supplies, -1), 'line')}
        ${stack}
      </div>
      <div class="card"><h3>${ico('chart')} 年度收支明细</h3>
        ${years.length > 1 ? `<div class="seg">${years.slice(0, 4).map(y => `<button class="${y === ly ? 'on' : ''}" data-act="ledgerYear" data-arg="${y}">${y === cy ? '今年' : y + ' 年'}</button>`).join('')}</div>` : ''}
        <p class="small dim">${ly} 年${ly === cy ? '至今' : '全年'}：收入 <b class="good">${money(tin)}</b>，支出 <b class="bad">${money(tout)}</b>，结余 <b class="${tin - tout >= 0 ? 'good' : 'bad'}">${tin - tout >= 0 ? '+' : ''}${money(tin - tout)}</b>。买设备、扩建、差旅、发奖金这些一次性花销也都记在这里。</p>
        <div class="sub">钱从哪里来</div>
        ${ledgerRows('in', L.in)}
        <div class="sub">钱花在哪里</div>
        ${ledgerRows('out', L.out)}
      </div>
      <div class="card"><h3>${ico('money')} 在研项目（${g.grants.length}）</h3>
        ${g.grants.map(x => `<div class="grant-row"><div class="row"><b>${esc(x.name)}</b><span class="small dim">总额 ${money(x.total)}${x.net && x.net < x.total ? `，到账 ${money(x.net)}` : ''}</span></div>${bar(x.monthsLeft / x.months, 'good', `${money(x.monthly)}/月 · 剩 ${x.monthsLeft} 个月`)}</div>`).join('') || '<p class="dim small">暂无。</p>'}
      </div>
      <div class="card"><h3>${ico('pen')} 申请中（${g.proposals.length}）</h3>
        ${g.proposals.map(p => `<div class="kvline"><span class="grow"><b>${esc(p.name)}</b> <span class="small dim">${p.effort === 'full' ? '全力以赴' : '正常投入'}</span></span><span class="small">${p.status === 'writing' ? `撰写中，${G.mdStr(p.deadline)} 截止` : `评审中，${G.monthStr(p.resultDay)} 出结果`}</span></div>`).join('') || '<p class="dim small">暂无。</p>'}
      </div>
      <div class="card"><h3>${ico('calendar')} 基金日历</h3>
        <p class="small dim">每到开放日期会弹窗询问是否申请。</p>
        ${regular.map(d => {
          const el = S.grantElig(g, d);
          const day = G.nextDate(g.day + 1, d.open[0], d.open[1]);
          return `<div class="kvline" data-tip="${esc(d.full)}"><span class="grow"><b>${esc(d.name)}</b> <span class="small dim">${d.kind === 'gpu' ? '捐赠服务器' : money(d.amount)}</span></span><span class="small ${el ? 'dim' : ''}">${el ? esc(el) : `${G.mdStr(day)} 开放 · 约 ${pct(S.grantProb(g, d, 'full'))}`}</span></div>`;
        }).join('')}
      </div>
      <div class="card"><h3>${ico('people')} ${g.region === 'cn' ? '横向课题' : '企业合作'}</h3>
        <p class="small dim">主动去找企业谈合作（精力 -8）。成功率取决于声望和人脉；企业项目会占用学生时间。</p>
        <button data-act="seek" ${seekCd ? 'disabled' : ''}>${seekCd ? G.daysText(g.cooldowns.seek - g.day) + '后可以再去' : '去企业跑一圈'}</button>
      </div>
      <div class="card"><h3>${ico('list')} 申请记录</h3>
        ${g.grantLog.slice(-12).reverse().map(x => `<div class="kvline"><span class="grow">${esc(x.name)}</span><span class="small dim">${G.monthStr(x.d)}</span>${x.won ? tag('获批', 't-good') : tag('未中', 't-bad')}</div>`).join('') || '<p class="dim small">暂无。</p>'}
      </div>`;
  }

  // ---------- 设施 ----------
  function tabFacility() {
    const ctx = S.dayContext(g);
    const R = G.region(g);
    const room = RS.ROOMS[g.room], next = RS.ROOMS[g.room + 1];
    const owned = Object.keys(g.gpus).map(id => ({ s: G.gpuSpec(g, id), n: g.gpus[id] })).filter(x => x.s);
    const shop = S.gpuAvailable(g);
    const factor = ctx.demand > 0 ? U.clamp(Math.pow(ctx.ratio, 0.6), 0.25, 1.15) : 1;
    return `
      <div class="card"><h3>${ico('home')} 实验室空间</h3>
        <div class="kvline"><span>当前</span><b>${esc(room.name)}（${room.desks} 个工位，已用 ${g.members.length}）</b></div>
        ${next ? `<button class="wide" data-act="expand" ${g.rep < next.rep || g.funds < S.roomCost(g, next) ? 'disabled' : ''}>扩建为「${esc(next.name)}」· ${next.desks} 工位 · ${money(S.roomCost(g, next))}${g.rep < next.rep ? `（需要声望 ${next.rep}）` : ''}</button>` : '<p class="dim small">已经是最大的实验室了。</p>'}
      </div>
      <div class="card"><h3>${ico('gpu')} 算力</h3>
        ${bar(ctx.demand > 0 ? ctx.units / ctx.demand : 1, factor < 0.8 ? 'bad' : factor < 1 ? 'warn' : 'good', `算力 ${ctx.units} / 当前需求 ${ctx.demand.toFixed(0)}`)}
        <p class="small dim">${G.area(g).compute < 0.3 ? '你的方向基本不需要算力。' : `实验阶段的速度和质量取决于算力是否够用（当前实验效率 ×${factor.toFixed(2)}）。模型越来越大，需求每年增长约 15%。`}${owned.length ? '可以在「小组」页把服务器专门分给某个小组。' : ''}</p>
        ${owned.length ? `<div class="sub">已拥有</div>${owned.map(x => `<div class="kvline"><span class="grow">${esc(x.s.name)} ×${x.n}</span><span class="small dim">+${x.s.units * x.n} 算力 · 维护 ${money(x.s.maint * x.n)}/月</span><button class="mini-btn" data-act="sellGpu" data-arg="${x.s.id}" data-tip="二手价 ${money(x.s.price * 0.25)}">卖</button></div>`).join('')}` : ''}
        <div class="sub">商店</div>
        ${shop.map(s => { const price = S.gpuPrice(g, s); return `<div class="shop-row"><div class="grow"><b>${esc(s.name)}</b> <span class="small dim">${esc(s.desc)}</span><div class="small">+${s.units} 算力 · 维护 ${money(s.maint)}/月</div></div><button data-act="buyGpu" data-arg="${s.id}" ${g.funds < price ? 'disabled' : ''}>${money(price)}</button></div>`; }).join('')}
        <div class="shop-row"><div class="grow"><b>${esc(R.cloud.name)}</b> <span class="small dim">按月付费，随时退订</span><div class="small">每份 +${R.cloud.units} 算力 · ${money(R.cloud.price)}/月</div></div>
          <div class="stepper"><button data-act="cloud" data-arg="-1" ${g.cloud <= 0 ? 'disabled' : ''}>-</button><b>${g.cloud}</b><button data-act="cloud" data-arg="1">+</button></div></div>
      </div>
      <div class="card"><h3>${ico('trophy')} 大型投资</h3>
        ${S.BIG.map(b => { const st = S.bigState(g, b); const done = (g.flags.big || {})[b.id]; return `<div class="shop-row"><div class="grow"><b>${esc(b.name)}</b>${b.once && done ? tag('已完成', 't-good') : ''}<div class="small dim">${esc(b.desc)}</div></div><button data-act="big" data-arg="${b.id}" ${st ? 'disabled' : ''} data-tip="${esc(st || '')}">${b.once && done ? '✓' : money(S.bigCost(g, b))}</button></div>`; }).join('')}
      </div>
      <div class="card"><h3>${ico('shop')} 设施</h3>
        <div class="fac-grid">
        ${RS.FACILITIES.map(f => {
          const has = !!g.facilities[f.id];
          const cost = S.facilityCost(g, f);
          const need = f.req && !g.facilities[f.req];
          return `<div class="fac ${has ? 'owned' : ''}"><div class="row"><b>${esc(f.name)}</b></div><div class="small dim">${esc(f.desc)}</div>
            <div class="small">${f.maint ? `维护 ${money(f.maint * R.ppp)}/月` : '无维护费'}</div>
            ${has ? `<span class="good small">${ico('check')}已拥有</span>` : `<button data-act="buyFac" data-arg="${f.id}" ${g.funds < cost || need ? 'disabled' : ''}>${need ? '需要' + esc(RS.FACILITIES.find(x => x.id === f.req).name) : money(cost)}</button>`}</div>`;
        }).join('')}
        </div>
      </div>`;
  }

  // ---------- 方针 ----------
  function tabPolicy() {
    const pol = g.policies;
    const A = G.area(g);
    return POLICIES.map(p => `<div class="card"><h3>${esc(p.name)}</h3>${seg(p.k, p.opts, pol[p.k])}<p class="hint">${esc(policyDesc(p.k, pol[p.k]))}</p>
      ${p.k === 'topic' ? `<div class="sub">核心方向</div><div class="chips-wrap">${A.topics.map(t => `<button class="chip-btn ${t.id === pol.coreTopic ? 'on' : ''}" data-act="core" data-arg="${t.id}">${esc(t.name)}</button>`).join('')}</div>` : ''}</div>`).join('');
  }

  // ---------- 档案 ----------
  function tabRecord() {
    const st = g.stats;
    const ach = RS.ACHIEVEMENTS;
    const got = ach.filter(a => g.achievements[a.id]).length;
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    return `
      <div class="card"><h3>${ico('chart')} 学术档案</h3>
        ${kv('入职年限', G.careerYear(g) + ' 年')}${kv('发表论文', `${g.papers.filter(p => !p.retracted && !p.phd).length}（A ${st.pubs.A} · B ${st.pubs.B} · C ${st.pubs.C} · W ${st.pubs.W}）`)}
        ${kv('最佳论文', st.bestPapers)}${kv('总引用 / h-index', `${U.fmtInt(st.cites)} / ${st.h}`)}${kv('投稿 / 被拒', `${st.submissions} / ${st.rejects}`)}
        ${kv('获批基金', `${st.grantsWon} 项 · 累计 ${money(st.grantTotal)}`)}${kv('毕业博士', `${st.phdGrads}（成为教授 ${st.profGrads}）`)}${kv('学术声望', `${Math.floor(g.rep)} · ${repTitle(g.rep)}`)}
        ${kv('综合评分', S.score(g))}
      </div>
      ${g.pi.phd ? phdRecordCard(g.pi.phd) : ''}
      <div class="card"><h3>${ico('trophy')} 成就（${got} / ${ach.length}）</h3>
        <div class="ach-grid">${ach.map(a => { const d = g.achievements[a.id]; return `<div class="ach ${d ? 'got' : ''}" data-tip="${esc(a.desc)}${d ? '\n' + G.dateStr(d) + ' 解锁' : ''}">${ico(d ? 'trophy' : 'question')}<span>${esc(d ? a.name : '？？？')}</span></div>`; }).join('')}</div>
      </div>
      <div class="card"><h3>${ico('list')} 大事记</h3>${g.timeline.slice().reverse().map(t => `<div class="kvline"><span class="small dim">${G.dateStr(t.d)}</span><span class="grow">${esc(t.t)}</span></div>`).join('')}</div>`;
  }

  // ---------- 博士阶段的页面 ----------
  const PHD_POLICIES = [
    { k: 'pace', name: '工作节奏', opts: Object.keys(S.PACE).map(id => [id, S.PACE[id].name, S.PACE[id].desc]) },
    { k: 'consult', name: '做完一个课题后', opts: [['ask', '自己想下一步', '每做完一个课题，停下来想想下一个做什么（也可以交给托管）'], ['auto', '听导师安排', '直接做导师建议的方向']] },
    { k: 'submit', name: '我的论文投哪里', opts: [['auto', '导师决定', '导师按经验挑会议和期刊'], ['ask', '每次问我', '论文写完时暂停，由你来挑投哪里']] },
    { k: 'rebuttal', name: 'Rebuttal', opts: [['auto', '导师帮忙回', '自动写一份中规中矩的 rebuttal'], ['ask', '自己来写', '收到初审意见时暂停，由你决定怎么回']] },
  ];
  function tabMe() {
    const m = S.me(g);
    if (!m) return '';
    const P = g.phd;
    const yrs = S.memberYears(g, m);
    const st = S.gradStatus(g, m);
    const sc = S.marketScore(g);
    const trust = Math.round(m.trust == null ? 55 : m.trust);
    const cd = x => x > g.day;
    const helpers = S.phdHelpers(g);
    const mine = S.myPapers(g);
    const firstA = m.firstA || 0, first = m.first || 0;
    const chances = Object.keys(RS.REGIONS).map(rid => {
      const R = RS.REGIONS[rid];
      const note = rid === g.region ? '' : g.region === 'us' ? '（海归加分）' : '（跨国申请更难）';
      return `<div class="sub">${esc(R.name)}${note}</div>` + R.tiers.map((T, t) => {
        const p = S.marketTierChance(g, rid, t, sc.total);
        return `<div class="kvline small"><span class="grow">${esc(T.name)}</span>${bar(p, p >= 0.6 ? 'good' : p >= 0.25 ? 'warn' : 'bad', `拿到 offer 约 ${pct(p)}`)}</div>`;
      }).join('');
    }).join('');
    const canMarket = !P.market && st.ok && yrs >= 3;
    return `
      <div class="card pi-card">
        <img class="portrait big" src="${SP.portraitURL(m.avatar, 'phd', 4)}" alt="" data-act="locate" data-arg="${m.id}" data-tip="在画面中找到自己">
        <div class="grow">
          <div class="row"><b class="name">${esc(m.name)}</b>${tag('博士生', 'role-phd')}${tag(`第 ${Math.floor(yrs) + 1} 年`, 'dim')}</div>
          <div class="small dim">${esc(g.school)} · 导师 ${esc(g.pi.name)}（${esc(S.advisorType(g).name)}）</div>
          <div class="row traits">${traitTags(m)}</div>
          <div class="row small">${S.memberGroups(g, m).map(gr => groupTag(gr)).join('')}<span class="dim">最想做「${esc(topicName(S.interestOf(m)))}」</span></div>
        </div>
      </div>
      <div class="card">
        <div class="stats3"><label>想法</label>${mini(m.stats.idea)}<label>编程</label>${mini(m.stats.code)}<label>写作</label>${mini(m.stats.write)}</div>
        <div class="row"><label class="small">心情</label>${bar(m.mood / 100, moodCls(m.mood))}<b class="num">${Math.round(m.mood)}</b></div>
        <div class="row" data-tip="导师对你的信任：决定推荐信的分量。一起发论文、帮导师做事、主动沟通都会增加。"><label class="small">导师信任</label>${bar(trust / 100, trust < 35 ? 'bad' : trust < 60 ? 'warn' : 'good')}<b class="num">${trust}</b></div>
        <div class="task small">${taskText(m)}</div>
        <div class="actions">
          <button data-act="phdTalk" ${cd(P.talkCd) ? 'disabled' : ''} data-tip="${cd(P.talkCd) ? G.daysText(P.talkCd - g.day) + '后可以再约' : '心情 +6、导师信任 +4，有机会得到新思路'}">约导师聊聊</button>
          <button data-act="phdVacation" ${cd(P.vacCd) || m.status !== 'active' ? 'disabled' : ''} data-tip="${cd(P.vacCd) ? G.daysText(P.vacCd - g.day) + '后可以再休' : '离开 10 天，心情 +22'}">放个假</button>
          <button data-act="phdHelper" ${cd(P.helpCd) || !helpers.length ? 'disabled' : ''} data-tip="${cd(P.helpCd) ? G.daysText(P.helpCd - g.day) + '后可以再找' : helpers.length ? '找一位学弟学妹来帮你做课题（带过学生对求职有帮助，将来 TA 可能跟你走）' : '组里暂时没有合适的人，或者你手上没有自己负责的课题'}">找学弟学妹帮忙</button>
        </div>
      </div>
      <div class="card"><h3>${ico('cap')} 毕业进度</h3>
        <div class="kvline"><span>资格考试</span><b class="${P.qual ? 'good' : ''}">${P.qual ? '✓ 已通过' : yrs < 1.1 ? '第二年进行' : '等待考试'}</b></div>
        <div class="kvline"><span>开题答辩</span><b class="${P.proposal ? 'good' : ''}">${P.proposal ? `✓ ${esc(topicName(P.thesis))}` : '第三年进行'}</b></div>
        ${critRow('读博年限', yrs.toFixed(1) + ' 年', '3 年', yrs >= 3, yrs / 3)}
        ${critRow('一作 A 类论文', firstA, 2, firstA >= 2, firstA / 2)}
        ${critRow('或：一作论文', first, 4, first >= 4, first / 4)}
        <p class="small ${st.ok ? 'good' : 'dim'}">${esc(st.text)}${st.ok ? '' : '（读满 5.5 年也可以毕业）'}</p>
        ${P.market
          ? `<p class="small gold">${P.offers && !P.market.wait ? '求职结果出来了' : P.market.wait > g.day ? `已经投出申请，${G.mdStr(P.market.wait)} 左右出结果` : '正在求职'}</p>`
          : `<button class="wide primary" data-act="phdMarket" ${canMarket ? '' : 'disabled'} data-tip="${canMarket ? '投出教职申请（之后照常做研究，大约三个月后出结果）' : '达到毕业要求、读满三年后才能开始找教职'}">开始找教职</button>`}
      </div>
      <div class="card"><h3>${ico('star')} 求职竞争力 <b class="gold">${sc.total.toFixed(1)}</b></h3>
        ${sc.parts.filter(x => Math.abs(x[1]) >= 0.05).map(x => `<div class="kvline small"><span>${x[0]}</span><b class="${x[1] < 0 ? 'bad' : ''}">${x[1] >= 0 ? '+' : ''}${x[1].toFixed(1)}</b></div>`).join('')}
        ${chances}
        <p class="small dim">每档学校各投 5~7 所。竞争力主要来自一作论文，其次是导师的推荐信、引用、人脉和奖项。</p>
      </div>
      <div class="card"><h3>${ico('paper')} 我的论文（${mine.length}）</h3>
        ${mine.slice(0, 12).map(p => `<div class="story">${tierTag(p.tier)}<span>${esc(S.short(p.title))} <span class="dim">${esc(RS.VENUES[p.venue].name)} ${p.year} · 引用 ${p.cites} · </span><b class="${/一作/.test(S.authorPos(p, m.id)) ? 'good' : ''}">${S.authorPos(p, m.id)}</b></span></div>`).join('') || '<p class="dim small">还没有论文。</p>'}
      </div>`;
  }
  function labmateCard(x) {
    return `<div class="mcard" data-key="${x.id}">
      <img class="portrait" src="${SP.portraitURL(x.avatar, x.role, 3)}" alt="" data-act="locate" data-arg="${x.id}" data-tip="在画面中找到 TA">
      <div class="grow">
        <div class="row"><b class="name">${esc(x.name)}</b>${tag(S.ROLE_NAMES[x.role], 'role-' + x.role)}${tag(S.memberYearLabel(g, x), 'dim')}${g.phd.mentees.includes(x.id) ? tag('你带过', 'gold') : ''}</div>
        <div class="row small">${S.memberGroups(g, x).map(gr => groupTag(gr) + (gr.lead === x.id ? tag('组长', 'gold') : '')).join('')}<span class="dim">想做「${esc(topicName(S.interestOf(x)))}」</span></div>
        ${x.bio && x.bio.motto ? `<div class="motto small">“${esc(x.bio.motto)}”</div>` : ''}
        <div class="task small">${taskText(x)}</div>
        <div class="small dim">论文 ${x.pubs}（一作 ${x.first || 0}）· ${esc(x.school || '—')}</div>
      </div>
    </div>`;
  }
  function tabPhdLab() {
    const a = S.advisorType(g);
    const order = { postdoc: 0, phd: 1, ms: 2, visit: 3, ug: 4 };
    const list = g.members.filter(x => x.id !== g.player).sort((x, y) => order[x.role] - order[y.role] || x.startDay - y.startDay);
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    const thisYear = g.papers.filter(p => !p.retracted && G.yearOfDay(p.day) === G.calYear(g)).length;
    return `
      <div class="card pi-card">
        ${portraitHTML({ pi: true }, 'big')}
        <div class="grow">
          <div class="row"><b class="name">${esc(g.pi.name)}</b>${tag(G.titleName(g), 'gold')}${tag(a.name, 't-mid', a.desc)}</div>
          <div class="small dim">${esc(g.school)} · ${esc(g.labName)} · 声望 ${Math.floor(g.rep)}（${repTitle(g.rep)}）</div>
          <div class="small">${esc(a.desc)}</div>
        </div>
      </div>
      <div class="card"><h3>${ico('flask')} 实验室</h3>
        ${kv('成员', `${g.members.length} 人（含你）`)}${kv('在研课题', g.projects.length)}${kv('今年发表', thisYear + ' 篇')}
        ${kv('组会', { weekly: '每周', biweekly: '两周一次', monthly: '每月一次' }[g.policies.meeting])}${kv('工作氛围', { chill: '佛系', normal: '正常', crunch: '内卷' }[g.policies.intensity])}
        ${kv('算力 / 需求', `${S.dayContext(g).units} / ${S.computeDemand(g).toFixed(0)}`)}
      </div>
      <div class="card"><h3>${ico('branch')} 小组</h3>
        ${g.groups.map(gr => { const ld = G.member(g, gr.lead); return `<div class="kvline"><span class="grow">${groupTag(gr)} <span class="small dim">${S.groupMembers(g, gr).length} 人${ld ? ' · 组长 ' + esc(ld.name) : ''}</span></span></div>`; }).join('') || '<p class="dim small">没有分小组。</p>'}
      </div>
      <h3 class="sec">${ico('people')} 同门（${list.length}）</h3>
      ${list.map(labmateCard).join('') || '<p class="dim">实验室里只有你一个学生。</p>'}`;
  }
  function tabPhdPolicy() {
    return PHD_POLICIES.map(p => `<div class="card"><h3>${esc(p.name)}</h3>${seg(p.k, p.opts, g.phd[p.k], 'phdPolicy')}<p class="hint">${esc((p.opts.find(o => o[0] === g.phd[p.k]) || [])[2] || '')}</p></div>`).join('') +
      `<div class="card"><h3>托管</h3>${seg('auto', POLICIES.find(p => p.k === 'auto').opts, g.policies.auto)}<p class="hint">${esc(policyDesc('auto', g.policies.auto))}。只影响和你有关的事，导师实验室里的事一直由导师处理。</p></div>`;
  }
  function phdRecordCard(r) {
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    return `<div class="card"><h3>${ico('cap')} 读博经历</h3>
      ${kv('博士学校 / 导师', `${esc(r.school)} · ${esc(r.advisor)}`)}${kv('读博年限', r.years + ' 年')}
      ${kv('读博期间论文', `${r.papers} 篇（一作 ${r.first} · 一作 A 类 ${r.firstA}）`)}${kv('博士论文方向', esc(topicName(r.thesis)))}
      ${r.path ? kv(r.path === 'postdoc' ? '博士后' : '工业界', esc(r.pathPlace)) : ''}${kv('求职竞争力', r.score)}
    </div>`;
  }
  function tabPhdRecord() {
    const m = S.me(g), P = g.phd;
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    const mine = S.myPapers(g);
    return `
      <div class="card"><h3>${ico('chart')} 我的读博档案</h3>
        ${kv('学校 / 导师', `${esc(g.school)} · ${esc(g.pi.name)}`)}${kv('读博年限', S.memberYears(g, m).toFixed(1) + ' 年')}
        ${kv('论文', `${m.pubs} 篇（一作 ${m.first || 0} · 一作 A 类 ${m.firstA || 0}）`)}${kv('引用', U.fmtInt(U.sum(mine, p => p.cites)))}
        ${kv('人脉', Math.round(P.network))}${kv('开会做报告', P.conf + ' 次')}${kv('当助教', P.ta + ' 学期')}
        ${kv('实习', esc(P.interns.join('、')) || '—')}${kv('奖项', esc(P.awards.join('、')) || '—')}
        ${kv('带过的学弟学妹', esc(P.mentees.map(id => G.personName(g, id)).join('、')) || '—')}
      </div>
      <div class="card"><h3>${ico('list')} 成长轨迹</h3>${(m.story || []).slice().reverse().map(s => `<div class="story"><span class="dim">${G.monthStr(s.d)}</span>${esc(s.t)}</div>`).join('') || '<p class="dim small">还没有什么故事。</p>'}</div>
      <div class="card"><h3>${ico('list')} 大事记</h3>${g.timeline.slice().reverse().map(t => `<div class="kvline"><span class="small dim">${G.dateStr(t.d)}</span><span class="grow">${esc(t.t)}</span></div>`).join('')}</div>`;
  }
  // 求职：选地区和学校档次 → 等结果 → 挑 offer
  function renderJobMarket(item) {
    const sc = S.marketScore(g);
    if (item.stage === 'apply') {
      const sel = item.sel;
      const rows = [];
      let n = 0;
      Object.values(RS.REGIONS).forEach(R => {
        if (!sel.regions[R.id]) return;
        R.tiers.forEach((T, t) => {
          const on = !!sel.tiers[t];
          if (on) n += S.MARKET_APPS[t];
          const p1 = S.marketChance(g, R.id, t, sc.total), pT = S.marketTierChance(g, R.id, t, sc.total);
          rows.push(`<div class="venue-row"><div class="grow"><b>${esc(R.name)} · ${esc(T.name)}</b><div class="small dim">${esc((T.schools || []).slice(0, 5).join('、'))}……</div></div>
            <span class="small">每所约 ${pct(p1)} · 投 ${S.MARKET_APPS[t]} 所拿到 offer 约 <b>${pct(pT)}</b></span><button class="${on ? 'on' : ''}" data-act="jmTier" data-arg="${t}">${on ? '✓ 投' : '不投'}</button></div>`);
        });
      });
      return modalShell(`${head('cap', item.round > 1 ? '重新找教职' : '找教职')}
        <p>你的求职竞争力 <b class="gold">${sc.total.toFixed(1)}</b>（「我」页面有明细）。选好要投的地区和学校档次，每档会投 5~7 所。</p>
        <div class="sub">地区</div>
        <div class="chips-wrap">${Object.values(RS.REGIONS).map(R => `<button class="chip-btn ${sel.regions[R.id] ? 'on' : ''}" data-act="jmRegion" data-arg="${R.id}">${esc(R.name)} · ${esc(R.sub)}${R.id === g.region ? '' : g.region === 'us' ? '（海归加分）' : '（跨国申请更难）'}</button>`).join('')}</div>
        <div class="venue-list">${rows.join('') || '<p class="dim">先选一个地区。</p>'}</div>
        <div class="mfoot"><span>一共投 ${n} 所学校${item.round > 1 ? '' : '，大约三个月后出结果（这期间照常做研究）'}</span><button class="primary" data-act="jmApply" ${n ? '' : 'disabled'}>投出申请</button></div>`, 'wide');
    }
    const offers = item.offers || [];
    const fac = offers.filter(o => o.kind === 'faculty');
    const row = (o, i) => {
      if (o.kind === 'faculty') {
        const R = RS.REGIONS[o.region];
        return `<div class="venue-row"><div class="grow"><b>${esc(o.school)}</b> ${tag(R.tiers[o.tier].name, o.tier === 0 ? 'gold' : 't-mid')}<div class="small dim">${esc(R.name)} · ${esc(R.titles[0])} · 起步经费 ${R.money(o.startup)}</div></div><button class="primary" data-act="jmAccept" data-arg="${i}">接受 offer</button></div>`;
      }
      if (o.kind === 'postdoc') return `<div class="venue-row"><div class="grow"><b>去 ${esc(o.school)} 做博士后</b><div class="small dim">两年后再找教职：多发几篇论文、认识更多人，背景变成「名校博后」</div></div><button data-act="jmAccept" data-arg="${i}">先做博后</button></div>`;
      return `<div class="venue-row"><div class="grow"><b>去 ${esc(o.company)} 做${esc(o.role)}</b><div class="small dim">两年后再回学术界找教职：人脉和工程能力更强，背景变成「大厂回归」</div></div><button data-act="jmAccept" data-arg="${i}">先去业界</button></div>`;
    };
    const lab = g.phd.labName || `${RS.shortName(S.me(g).name).replace(/\s/g, '')} Lab`;
    return modalShell(`${head('cap', '求职结果')}
      <p>${fac.length ? `你投了 ${item.apps} 所学校，拿到了 <b class="gold">${fac.length}</b> 个教职 offer！选一所开始你的 PI 生涯吧。` : `你投了 ${item.apps} 所学校，这一轮没有拿到教职 offer……可以先去做博后或去业界，两年后再试。`}</p>
      ${fac.length ? `<div class="frow"><label>实验室名（英文）</label><input id="jm-lab" maxlength="18" value="${esc(/^[\x20-\x7e]+$/.test(lab) ? lab : 'NOVA Lab')}"></div>` : ''}
      <div class="venue-list">${offers.map(row).join('')}</div>`, 'wide');
  }

  const PHD_TABS = [['me', '我', 'cap', tabMe], ['labmates', '实验室', 'flask', tabPhdLab], ['research', '研究', 'paper', tabResearch], ['policy', '方针', 'list', tabPhdPolicy], ['record', '档案', 'trophy', tabPhdRecord]];
  const curTabs = () => (g && g.phd ? PHD_TABS : TABS);

  const TABS = [
    ['lab', '概览', 'home', tabLab], ['members', '成员', 'people', tabMembers], ['groups', '小组', 'branch', tabGroups], ['research', '研究', 'paper', tabResearch],
    ['funding', '经费', 'money', tabFunding], ['facility', '设施', 'gpu', tabFacility], ['policy', '方针', 'list', tabPolicy], ['record', '档案', 'trophy', tabRecord],
  ];

  function renderTabs() {
    return curTabs().map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-act="tab" data-arg="${t[0]}">${ico(t[2])}<span>${t[1]}</span></button>`).join('');
  }
  function renderLog() {
    return g.logs.slice(0, 80).map((l, i) => `<div class="log ${l.k}" data-key="${l.d}-${g.logs.length - i}"><span class="d">${G.mdStr(l.d)}</span>${esc(l.t)}</div>`).join('');
  }

  // ---------- 弹窗 ----------
  function modalShell(inner, cls) {
    return `<div class="modal-back"><div class="modal ${cls || ''}">${inner}</div></div>`;
  }
  let headMin = false; // 渲染决策弹窗时，标题栏带“收起”按钮
  function head(icon, title) {
    return `<div class="mhead">${ico(icon)}<span class="grow">${esc(title)}</span>${headMin ? '<button class="mmin" data-act="minModal" data-tip="先收起弹窗，去看看其他信息、调整方针或买设备（游戏保持暂停，按 Esc 也可以收起）">收起 ▾</button>' : ''}</div>`;
  }
  function queueTitle(item) {
    if (item.type === 'event') { const ev = RS.Sim.buildEvent(g, item); return ev ? ev.title : '事件'; }
    return { grants: '基金申请季', recruit: item.name, pool: item.title, venue: '选择投稿目标', notice: item.title, summary: `${item.data ? item.data.year : ''} 年度总结`, eval: '考核结果', ending: '人生的终章', jobmarket: item.stage === 'apply' ? '找教职' : '求职结果' }[item.type] || '待决定的事';
  }

  function renderEvent(item) {
    const ev = RS.Sim.buildEvent(g, item);
    if (!ev) return null;
    const def = RS.EVENTS[item.id] || {};
    return modalShell(`${head(ev.portrait && ev.portrait.icon ? ev.portrait.icon : 'mail', ev.title)}
      <div class="mbody">${portraitHTML(ev.portrait, 'big')}<div class="mtext">${ev.text}</div></div>
      <div class="choices">${ev.choices.map((c, i) => `<button class="choice ${c.def ? 'def' : ''}" data-act="choose" data-arg="${i}" ${c.disabled ? 'disabled' : ''}><b>${esc(c.label)}</b><small>${esc(c.disabled || c.hint || '')}</small></button>`).join('')}</div>
      ${def.minor ? '<div class="mnote">提示：可以在「方针 → 托管」里让这类小事自动处理。</div>' : ''}`, 'event');
  }

  function renderGrants(item) {
    item.sel = item.sel || {};
    let energy = 0;
    const rows = item.ids.map(id => {
      const d = G.grantDef(g, id);
      const el = S.grantElig(g, d);
      const dl = item.deadlines[id];
      const cur = item.sel[id] || '';
      if (cur) energy += S.grantEnergy(d, cur);
      const amount = d.kind === 'gpu' ? '一台服务器' : `${money(d.amount)} · ${Math.round(d.months / 12 * 10) / 10} 年`;
      return `<div class="grant-pick ${el ? 'off' : ''}">
        <div class="row"><b>${esc(d.name)}</b>${d.title ? tag(d.title + '称号', 'gold') : ''}<span class="small dim">${esc(d.full)}</span></div>
        <div class="small">${amount} · 截止 ${G.mdStr(dl)}（${G.daysText(dl - g.day)}）· 结果约 ${G.monthStr(dl + d.result)}</div>
        ${el ? `<div class="small bad">${esc(el)}</div>` : `
          <div class="small">成功率估计：正常 <b>${pct(S.grantProb(g, d, 'normal'))}</b> / 全力 <b>${pct(S.grantProb(g, d, 'full'))}</b></div>
          <div class="seg">
            <button class="${!cur ? 'on' : ''}" data-act="gsel" data-k="${id}" data-v="">不申请</button>
            <button class="${cur === 'normal' ? 'on' : ''}" data-act="gsel" data-k="${id}" data-v="normal">正常（精力 -${S.grantEnergy(d, 'normal')}）</button>
            <button class="${cur === 'full' ? 'on' : ''}" data-act="gsel" data-k="${id}" data-v="full">全力（精力 -${S.grantEnergy(d, 'full')}）</button>
          </div>`}
      </div>`;
    }).join('');
    return modalShell(`${head('money', '基金申请季')}
      <p>以下项目开放申请了。写申请书会在截止日前<b>持续消耗你的精力</b>；全力以赴消耗更多，但成功率更高。成功率还取决于你的声望、写作能力和近三年的论文。</p>
      ${rows}
      <div class="mfoot"><span>预计总精力消耗 <b class="${energy > g.pi.energy ? 'bad' : ''}">${energy}</b>（当前精力 ${Math.round(g.pi.energy)}，会在截止前慢慢扣除）</span><button class="primary" data-act="grantsOk">确认</button></div>`, 'wide');
  }

  function candStats(c, exact) {
    const row = (k, n) => {
      if (exact) return `<label>${n}</label>${mini(c.stats[k])}`;
      const r = c.est[k];
      return `<label>${n}</label><span class="mini range"><i style="left:${r.lo}%;width:${Math.max(2, r.hi - r.lo)}%"></i></span><b class="num">${r.lo}~${r.hi}</b>`;
    };
    return `<div class="stats3">${row('idea', '想法')}${row('code', '编程')}${row('write', '写作')}</div>`;
  }
  function potStars(p) {
    const n = p >= 1.25 ? 3 : p >= 1.05 ? 2 : 1;
    return '★'.repeat(n) + '☆'.repeat(3 - n);
  }
  function candCard(c, mode, selected) {
    const exact = mode !== 'recruit' || c.interviewed;
    const traits = exact ? c.traits : c.shown;
    const hidden = !exact && c.traits.length > c.shown.length;
    return `<div class="ccard ${selected ? 'sel' : ''}" data-key="${c.cid}">
      <div class="row"><img class="portrait" src="${SP.portraitURL(c.avatar, c.role, 3)}" alt=""><div class="grow"><b>${esc(c.name)}</b><div class="row">${tag(S.ROLE_NAMES[c.role], 'role-' + c.role)}${c.own ? tag('本校', 'gold', `来自你所在的 ${g.school}`) : ''}${c.fellow ? tag('自带奖学金', 'gold', '前三年不用你发工资') : ''}</div><div class="small dim">${esc(c.school)}${c.bio ? ' · ' + esc(c.bio.major) : ''}${c.pubs ? ` · 已有 ${c.pubs} 篇论文` : ''}</div></div></div>
      ${candStats(c, exact)}
      <div class="row small"><span>潜力 <b class="gold">${exact ? potStars(c.pot) : '？？？'}</b></span>${c.bio ? `<span>职业理想 <b>${exact ? esc(RS.GOALS[c.bio.goal]) : '？'}</b></span>` : ''}</div>
      ${c.bio && c.bio.interest ? `<div class="row small" data-tip="研究计划里写的方向。分到对应的小组、做这个方向时更开心、效率更高"><span>想做 <b>${esc(topicName(c.bio.interest))}</b></span>${S.groupOfTopic(g, c.bio.interest) ? groupTag(S.groupOfTopic(g, c.bio.interest)) : '<span class="dim">（还没有这个方向的小组）</span>'}</div>` : ''}
      ${c.bio && exact ? `<div class="small dim">爱好：${esc(c.bio.hobbies.join('、'))} · “${esc(c.bio.motto)}”</div>` : ''}
      <div class="row traits">${traitTags(c, traits)}${hidden ? tag('？', 't-mid', '面试后才能看到全部特质') : ''}</div>
      ${mode === 'recruit' ? `<div class="small">接受 offer 的可能性：<b>${U.probWord(c.accept)}</b>（约 ${pct(c.accept)}）</div>` : ''}
      <div class="actions">
        ${mode === 'recruit' ? `<button data-act="interview" data-arg="${c.cid}" ${c.interviewed || g.pi.energy < 2 ? 'disabled' : ''}>${c.interviewed ? '已面试' : '面试（精力 -2）'}</button>` : ''}
        <button class="${selected ? 'on' : ''}" data-act="${mode === 'recruit' ? 'offer' : 'pick'}" data-arg="${c.cid}">${selected ? '✓ 已选择' : mode === 'recruit' ? '发 Offer' : '录用'}</button>
      </div>
    </div>`;
  }
  function renderRecruit(item) {
    const used = { phd: 0, ms: 0 };
    item.offers.forEach(cid => { const c = item.cands.find(x => x.cid === cid); if (c) used[c.role]++; });
    const cost = U.sum(item.offers.map(cid => item.cands.find(x => x.cid === cid)).filter(Boolean), c => (c.fellow ? 0 : G.region(g).costs[c.role] || 0) * 12);
    const free = G.desks(g) - g.members.length;
    return modalShell(`${head('people', item.name)}
      <p>${esc(item.text)}<br><span class="small dim">面试可以看清能力和全部特质。优秀的学生更抢手，接受 offer 的概率更低；你的声望和人脉越高，越容易招到人。</span></p>
      <div class="cgrid">${item.cands.map(c => candCard(c, 'recruit', item.offers.includes(c.cid))).join('')}</div>
      <div class="mfoot"><span>名额：博士 <b>${used.phd}/${item.quota.phd}</b> · 硕士 <b>${used.ms}/${item.quota.ms}</b> · 空余工位 ${free} · 全部接受后每年约 ${money(cost)}</span><button class="primary" data-act="recruitOk">${item.offers.length ? `发出 ${item.offers.length} 个 offer` : '今年不招了'}</button></div>`, 'wide');
  }
  function renderPool(item) {
    item.pick = item.pick || [];
    return modalShell(`${head('people', item.title)}
      <p>${esc(item.text)}</p>
      <div class="cgrid">${item.cands.map(c => candCard(c, 'pool', item.pick.includes(c.cid))).join('')}</div>
      <div class="mfoot"><span>最多录用 ${item.max} 人 · 空余工位 ${G.desks(g) - g.members.length}</span><button class="primary" data-act="poolOk">${item.pick.length ? `录用 ${item.pick.length} 人` : '都不要'}</button></div>`, 'wide');
  }
  function renderVenue(pid, local) {
    const p = G.project(g, pid);
    if (!p) return null;
    const opts = S.venueOptions(g, p);
    const q = S.estQuality(g, p);
    return modalShell(`${head('paper', '选择投稿目标')}
      <p>《${esc(p.title)}》${p.attempts ? `（已被拒 ${p.attempts} 次）` : ''}<br>预估质量 <b>${Math.round(q)}</b>。要投到哪里？</p>
      <div class="venue-list">${opts.map(o => `<div class="venue-row">${tierTag(o.v.tier)}<div class="grow"><b>${esc(o.v.name)}</b>${o.v.type === 'jour' ? '<span class="small dim"> 期刊</span>' : ''}<div class="small dim">${o.v.type === 'jour' ? '随时可投' : `截稿 ${G.mdStr(o.day)}（${G.daysText(o.day - g.day)}）`} · 审稿约 ${o.v.review} 天</div></div><span class="small">录用率约 <b>${pct(o.prob)}</b></span><button data-act="venuePick" data-arg="${o.v.id}" data-k="${o.day}">投这个</button></div>`).join('')}</div>
      <div class="choices row">
        <button class="choice" data-act="venuePick" data-arg="arxiv"><b>直接挂 arXiv</b><small>不经审稿，马上公开（预印本，价值很低）</small></button>
        <button class="choice def" data-act="venueAuto"><b>交给自动策略</b><small>按「方针 → 投稿策略」自动选择</small></button>
        ${local ? '<button class="choice" data-act="closeLocal"><b>先不改</b><small>保持原计划</small></button>' : ''}
      </div>`, 'wide');
  }
  function renderTopic(pid) {
    const p = G.project(g, pid);
    if (!p) return null;
    const A = G.area(g);
    return modalShell(`${head('bulb', '换个研究方向')}
      <p>《${esc(p.title)}》还在构思阶段，可以换个方向（构思进度减半）。</p>
      <div class="venue-list">${A.topics.map(t => `<div class="venue-row"><div class="grow"><b>${esc(t.name)}</b>${t.id === g.policies.coreTopic ? tag('核心', 'gold') : ''}<div class="small dim">积累 ${(g.expertise[t.id] || 0).toFixed(1)} · 算力需求 ${t.compute >= 1.2 ? '很高' : t.compute >= 0.8 ? '较高' : t.compute >= 0.4 ? '中等' : '很低'}</div></div>${heatIcons(g.topics[t.id].heat)}<button data-act="topicPick" data-arg="${t.id}" ${t.id === p.topic ? 'disabled' : ''}>${t.id === p.topic ? '当前' : '选这个'}</button></div>`).join('')}</div>
      <div class="choices"><button class="choice" data-act="closeLocal"><b>算了</b><small>保持原方向</small></button></div>`, 'wide');
  }
  // ---------- 小组相关的弹窗 ----------
  const memberRowHead = m => `<img class="portrait tiny" src="${SP.portraitURL(m.avatar, m.role, 2)}" alt=""><div class="grow"><b>${esc(m.name)}</b> ${tag(S.ROLE_NAMES[m.role], 'role-' + m.role)}${tag(S.memberYearLabel(g, m), 'dim')}`;
  function renderGroupNew() {
    const rows = G.area(g).topics.map(t => {
      const has = S.groupOfTopic(g, t.id);
      const fans = g.members.filter(m => S.interestOf(m) === t.id);
      return `<div class="venue-row" data-key="${t.id}"><div class="grow"><b>${esc(t.name)}</b>${t.id === g.policies.coreTopic ? tag('核心', 'gold') : ''}
        <div class="small dim">积累 ${(g.expertise[t.id] || 0).toFixed(1)} · 算力需求${computeWord(t.compute)}${fans.length ? ` · <span class="good">${fans.length} 人想做（${esc(fans.map(m => RS.shortName(m.name)).join('、'))}）</span>` : ''}</div></div>
        ${heatIcons(g.topics[t.id].heat)}<button data-act="groupCreate" data-arg="${t.id}" ${has ? 'disabled' : ''}>${has ? '已有小组' : '成立'}</button></div>`;
    }).join('');
    return modalShell(`${head('branch', '成立新小组')}
      <p class="small">选一个方向成立小组（现有 ${g.groups.length} / ${S.maxGroups(g)}）。成立之后把成员加进来、任命组长、分配服务器。</p>
      <div class="venue-list">${rows}</div>
      <div class="choices"><button class="choice" data-act="closeLocal"><b>算了</b></button></div>`, 'wide');
  }
  function renderGroupAdd(gid) {
    const gr = S.group(g, gid);
    if (!gr) return null;
    const rows = g.members.map(m => {
      const inG = S.inGroup(m, gid);
      const others = S.memberGroups(g, m).filter(x => x.id !== gid);
      const it = S.interestOf(m);
      const full = !inG && (m.groups || []).length >= S.MAX_MEMBER_GROUPS;
      return `<div class="venue-row" data-key="${m.id}">${memberRowHead(m)}
        <div class="small dim">想做「${esc(topicName(it))}」${it === gr.topic ? ' <span class="good">♥</span>' : ''} · ${others.length ? '已在 ' + others.map(x => esc(S.groupName(g, x))).join('、') : '未分组'}</div></div>
        <button class="${inG ? 'on' : ''}" data-act="groupToggle" data-arg="${gid}" data-k="${m.id}" ${full ? 'disabled' : ''}>${inG ? '✓ 在组里' : full ? '已在两个组' : '加入'}</button></div>`;
    }).join('') || '<p class="dim">实验室还没有成员。</p>';
    return modalShell(`${head('people', `「${S.groupName(g, gr)}」的成员`)}
      <p class="small dim">每人最多同时在两个小组。做自己感兴趣的方向（♥）心情更好、效率更高。</p>
      <div class="venue-list">${rows}</div>
      <div class="choices"><button class="choice def" data-act="closeLocal"><b>完成</b></button></div>`, 'wide');
  }
  function renderGroupLead(gid) {
    const gr = S.group(g, gid);
    if (!gr) return null;
    const rows = S.groupMembers(g, gr).map(m => {
      const ok = S.canLead(g, m);
      const other = S.leadsGroup(g, m);
      const why = !ok ? '资历不够' : other && other !== gr ? `已是${S.groupName(g, other)}组长` : '';
      return `<div class="venue-row" data-key="${m.id}">${memberRowHead(m)}
        <div class="small dim">想法 ${Math.round(m.stats.idea)} · 论文 ${m.pubs}（一作 ${m.first || 0}）· 信任 ${Math.round(m.trust == null ? 55 : m.trust)}</div></div>
        <button data-act="leadPick" data-arg="${gid}" data-k="${m.id}" ${why || gr.lead === m.id ? 'disabled' : ''}>${gr.lead === m.id ? '现任组长' : why ? esc(why) : '任命'}</button></div>`;
    }).join('') || '<p class="dim">组里还没有成员。</p>';
    return modalShell(`${head('star', `任命「${S.groupName(g, gr)}」组长`)}
      <p class="small">组长需要是博士后，或三年级以上的博士生。组长帮你带组员：你的指导容量 +1.5（博士后组长 +1），组员成长速度 +12%，组里的课题构思更有把握，也省去你协调的精力。组长自己要花时间带人（效率 -8%，有点压力），但毕业找工作时这段经历是加分项。</p>
      <div class="venue-list">${rows}</div>
      <div class="choices row">${gr.lead ? `<button class="choice" data-act="leadPick" data-arg="${gid}" data-k=""><b>撤销组长</b><small>这个小组由你直接管理</small></button>` : ''}<button class="choice def" data-act="closeLocal"><b>关闭</b></button></div>`, 'wide');
  }
  function renderMemberGroups(mid) {
    const m = G.member(g, mid);
    if (!m) return null;
    const it = S.interestOf(m);
    const rows = g.groups.map(gr => {
      const inG = S.inGroup(m, gr.id);
      const full = !inG && (m.groups || []).length >= S.MAX_MEMBER_GROUPS;
      const lead = G.member(g, gr.lead);
      return `<div class="venue-row" data-key="${gr.id}"><div class="grow">${groupTag(gr)}${gr.topic === it ? ' <span class="good small">♥ TA 想做这个</span>' : ''}
        <div class="small dim">${S.groupMembers(g, gr).length} 人 · ${lead ? '组长 ' + esc(lead.name) : '暂无组长'} · 积累 ${(g.expertise[gr.topic] || 0).toFixed(1)}</div></div>
        <button class="${inG ? 'on' : ''}" data-act="groupToggle" data-arg="${gr.id}" data-k="${m.id}" ${full ? 'disabled' : ''}>${inG ? '✓ 已加入' : full ? '已满两个' : '加入'}</button></div>`;
    }).join('') || '<p class="dim">还没有小组，去「小组」页成立一个吧。</p>';
    return modalShell(`${head('branch', `${m.name} 的小组`)}
      <p class="small dim">TA 最想做「<b>${esc(topicName(it))}</b>」。每人最多同时在两个小组；新课题会在所属小组的方向里选。</p>
      <div class="venue-list">${rows}</div>
      <div class="choices"><button class="choice def" data-act="closeLocal"><b>完成</b></button></div>`, '');
  }
  function renderGrad(mid) {
    const m = G.member(g, mid);
    if (!m) return null;
    const st = S.gradStatus(g, m);
    const yrs = Math.max(0, S.memberYears(g, m));
    const leading = g.projects.filter(x => x.lead === m.id && S.WORK_PHASES.includes(x.phase));
    const label = { phd: '安排答辩，博士毕业', ms: '安排毕业', postdoc: '推荐出站', ug: '结束科研训练', visit: '结束访问' }[m.role];
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    return modalShell(`${head('cap', `${m.name} 的毕业规划`)}
      <div class="mbody">${portraitHTML({ member: m.id }, 'big')}<div class="mtext grow">
        ${kv('身份', `${S.ROLE_NAMES[m.role]} · ${S.memberYearLabel(g, m)}（已 ${yrs.toFixed(1)} 年）`)}
        ${kv('论文', `${m.pubs} 篇（一作 ${m.first || 0}，一作 A 类 ${m.firstA || 0}）`)}
        ${kv('职业理想 / 信任', `${esc(RS.GOALS[(m.bio || {}).goal] || '还没想好')} / ${Math.round(m.trust == null ? 55 : m.trust)}`)}
        ${kv('去向预估', esc(S.placementOutlook(g, m)))}
        <p class="${st.ok ? 'good' : 'warn'}">${esc(st.text)}</p>
        ${leading.length ? `<p class="small dim">TA 负责的《${esc(S.short(leading[0].title))}》${leading.length > 1 ? `等 ${leading.length} 个课题` : ''}会交给合作者；没有合作者的话只能中止。已经写完的论文会继续投稿。</p>` : ''}
      </div></div>
      <div class="choices">
        <button class="choice ${st.ok ? 'def' : ''}" data-act="gradDo" data-arg="${m.id}" ${st.ok ? '' : 'disabled'}><b>${label}</b><small>${st.ok ? '马上离组；去向越好，你的声望提升越多' : esc(st.text)}</small></button>
        ${st.early ? `<button class="choice" data-act="gradEarly" data-arg="${m.id}"><b>以硕士学位提前毕业</b><small>不读完博士，直接去工作 · 声望 -1</small></button>` : ''}
        <button class="choice ${st.ok ? '' : 'def'}" data-act="closeLocal"><b>再等等</b><small>继续留在组里做研究</small></button>
      </div>`, '');
  }

  function renderNotice(item) {
    return modalShell(`${head(item.icon || 'mail', item.title)}<div class="mtext center">${item.text}</div><div class="choices"><button class="choice def" data-act="ok"><b>好的</b></button></div>`, 'tone-' + (item.tone || 'info'));
  }
  function renderSummary(item) {
    const d = item.data;
    const comment = { S: '辉煌的一年！整个学院都在谈论你的实验室。', A: '非常扎实的一年，继续保持！', B: '中规中矩的一年，还有进步空间。', C: '有点艰难的一年……明年会更好的。', 新: '入职的第一个年头，一切才刚刚开始。' }[d.grade];
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    return modalShell(`${head('calendar', `${d.year} 年度总结`)}
      <div class="summary"><div class="grade g${d.grade}">${d.grade}</div><div class="grow">
        ${kv('发表论文', `${d.papers} 篇（A 类 ${d.papersA}）`)}${kv('投稿 / 被拒', `${d.subs} / ${d.rejects}`)}${kv('新增引用', U.fmtInt(d.cites))}
        ${kv('新获基金', money(d.grants))}${kv('全年收入 / 支出', `${money(d.income)} / ${money(d.expense)}`)}${kv('新成员 / 毕业博士', `${d.joined} / ${d.grads}`)}
        ${kv('年末经费', money(d.funds))}${kv('声望 / h-index', `${Math.floor(d.rep)} / ${d.h}`)}
      </div></div>
      ${d.ledger ? `<div class="small dim center">主要花销：${Object.keys(d.ledger.out).sort((a, b) => d.ledger.out[b] - d.ledger.out[a]).slice(0, 3).map(k => `${esc(G.ledgerName(g, 'out', k))} ${money(d.ledger.out[k])}`).join('、') || '—'}</div>` : ''}
      <p class="center">${comment}</p>
      <div class="choices"><button class="choice def" data-act="ok"><b>新的一年，继续加油</b></button></div>`, 'tone-info');
  }
  function renderEval(item) {
    const title = item.kind === 'mid' ? (g.region === 'cn' ? '三年中期考核' : '三年中期评估') : g.region === 'cn' ? '预聘期终期考核' : 'Tenure 评审';
    const tone = item.result === 'pass' ? 'gold' : item.result === 'fail' ? 'bad' : 'info';
    return modalShell(`${head('star', title + '结果')}
      <div class="crit-table">${item.crit.map(c => critRow(c.name, G.metricFmt(g, c.key, c.cur), G.metricFmt(g, c.key, c.need), c.ok, c.cur / c.need)).join('')}</div>
      <p class="center">${esc(item.text)}</p>
      <div class="choices"><button class="choice def" data-act="ok"><b>${item.result === 'pass' ? '太好了！' : '知道了'}</b></button></div>`, 'tone-' + tone);
  }
  function rankTitle(sc) {
    return sc < 200 ? '默默无闻的学者' : sc < 500 ? '合格的教授' : sc < 1000 ? '领域知名学者' : sc < 2000 ? '学术大牛' : sc < 4000 ? '一代宗师' : '传奇';
  }
  function renderEnding(item) {
    const st = g.stats;
    const sc = S.score(g);
    const fail = item.kind === 'fail';
    const kv = (k, v) => `<div class="kvline"><span>${k}</span><b>${v}</b></div>`;
    return modalShell(`${head(fail ? 'rain' : 'trophy', fail ? '学术生涯落幕' : '光荣退休')}
      <p class="center">${fail ? (g.region === 'cn' ? '“非升即走”的规则没有例外。你收拾好办公室，和学生们一一道别。' : '没有拿到 Tenure，你收拾好办公室，和学生们一一道别。') + '<br>也许工业界会是一片新天地。' : `${G.piAge(g)} 岁的你，在学生们的掌声中走下了讲台。<br>这是一段漫长而精彩的科研人生。`}</p>
      <div class="summary"><div class="grow">
        ${kv('科研生涯', `${G.careerYear(g)} 年`)}${kv('最终职称', esc(G.titleName(g)))}${kv('论文', `${g.papers.length} 篇（A 类 ${st.pubs.A}，最佳论文 ${st.bestPapers}）`)}
        ${kv('总引用 / h-index', `${U.fmtInt(st.cites)} / ${st.h}`)}${kv('累计经费', money(st.grantTotal))}${kv('培养博士', `${st.phdGrads}（成为教授 ${st.profGrads}）`)}
        ${kv('荣誉', g.honors.map(h => h.name).concat(g.titles).join('、') || '—')}${kv('综合评分', `${sc} · ${rankTitle(sc)}`)}
      </div></div>
      <div class="choices row"><button class="choice def" data-act="restart"><b>开始新的人生</b><small>回到开始界面</small></button>
      ${fail ? '' : '<button class="choice" data-act="continueGame"><b>继续挂机</b><small>荣休之后继续经营实验室</small></button>'}</div>`, 'wide tone-' + (fail ? 'bad' : 'gold'));
  }

  function renderSettings() {
    const s = RS.settings;
    const onoff = (k, label, tip) => `<div class="kvline"><span class="grow" ${tip ? `data-tip="${esc(tip)}"` : ''}>${label}</span><div class="seg"><button class="${s[k] ? 'on' : ''}" data-act="set" data-k="${k}" data-v="1">开</button><button class="${!s[k] ? 'on' : ''}" data-act="set" data-k="${k}" data-v="0">关</button></div></div>`;
    const desk = window.desktop && window.desktop.isDesktop;
    return modalShell(`${head('gear', '设置')}
      ${onoff('sound', '音效')}
      <div class="kvline"><span class="grow">音量</span><div class="seg">${[[0.25, '小'], [0.5, '中'], [1, '大']].map(v => `<button class="${s.volume === v[0] ? 'on' : ''}" data-act="set" data-k="volume" data-v="${v[0]}">${v[1]}</button>`).join('')}</div></div>
      ${desk ? `<div class="kvline"><span class="grow">界面缩放</span><div class="seg">${[1, 1.25, 1.5, 2].map(z => `<button class="${s.zoom === z ? 'on' : ''}" data-act="set" data-k="zoom" data-v="${z}">${z * 100}%</button>`).join('')}</div></div>` : '<div class="kvline"><span class="grow">界面缩放</span><span class="small dim">浏览器里用 Ctrl + / Ctrl - 缩放</span></div>'}
      ${onoff('offline', '离线进度', '关闭游戏期间，实验室按 1 倍速继续运转（遇到需要决定的事会停下，最多 120 天）')}
      ${onoff('yearSummary', '年度总结弹窗')}
      ${onoff('notify', '需要决定时发系统通知', '窗口不在前台时，用系统通知提醒你')}
      ${desk ? onoff('onTop', '窗口置顶') : ''}
      <div class="sub">存档</div>
      <div class="row wrap"><button data-act="export">导出存档</button><button data-act="import">导入存档</button><button class="danger" data-act="reset">删除存档，重新开始</button></div>
      <p class="small dim">游戏每 15 秒自动保存到本地。</p>
      <div class="choices"><button class="choice def" data-act="closeLocal"><b>关闭</b></button></div>`, '');
  }
  function renderHelp() {
    return modalShell(`${head('question', '玩法说明')}
      <div class="help">
        <p><b>两种开局</b>：从博士一年级开始，读完博士凭成果找教职（学校和背景由读博经历决定）；或者直接从刚入职的助理教授开始。</p>
        <p><b>读博阶段</b>：你是导师实验室里的一名博士生，实验室由导师管理。你要做的是选课题、过资格考试和开题、决定要不要实习、和导师处好关系，在「我」页面关注毕业进度和求职竞争力。</p>
        <p><b>你是一位刚入职的计算机系 PI。</b>实验室会自动运转：学生们自己选题 → 构思 → 做实验 → 写论文 → 投稿 → 审稿，被拒了就改投。你要做的是在关键节点做出决定。</p>
        <p><b>时间</b>：左上角控制速度（空格暂停，数字键 1~4 调速）。遇到需要你决定的事情（基金申请、招生、学生危机、考核……）时间会自动暂停。</p>
        <p><b>论文质量</b>由学生的想法 / 编程 / 写作能力、你的研究和写作能力、算力、方向积累决定。A 类会议门槛高、审稿有运气成分，而且整个领域的门槛每年都在上涨。</p>
        <p><b>经费</b>：起步经费会被学生工资、算力维护慢慢花掉。及时申请基金（会消耗精力）、找企业合作，别让账户透支。</p>
        <p><b>精力</b>：教学、指导、写基金都消耗精力；精力太低会病倒。可以在「方针」里切换精力分配，或者放个假。</p>
        <p><b>学生</b>：注意心情，长期低落会想退出。招生季面试能看清学生的真实能力。博士后能帮你分担指导工作。每个学生都有自己想做的方向，做感兴趣的课题更开心、效率更高。</p>
        <p><b>小组</b>：在「小组」页把实验室分成几个子方向，给每个学生分组、任命组长、把服务器专门分给某个组。学生每做完一个课题都会来找你商量下一个方向（可以在方针里改成自动安排）。学生达到毕业要求后，可以在成员卡片上点「毕业」安排答辩。</p>
        <p><b>考核</b>：第 3 年中期、第 6 年终期。在「概览」页可以随时查看各项指标的进度。通过之后，继续冲击正教授、Fellow、院士，甚至图灵奖！</p>
        <p><b>挂机</b>：「方针 → 托管」可以让小事甚至所有事自动处理；「迷你」模式只保留画面，适合放在屏幕角落。</p>
        <p class="dim small">截稿日期、基金名称等参考了真实世界，但数值都是游戏化的，请勿当真。</p>
      </div>
      <div class="choices"><button class="choice def" data-act="closeLocal"><b>明白了</b></button></div>`, 'wide');
  }
  function renderConfirmReset() {
    return modalShell(`${head('warn', '确定要重新开始吗？')}<p class="center">当前存档会被删除，无法恢复。<br>（可以先在设置里导出存档）</p>
      <div class="choices row"><button class="choice danger" data-act="resetYes"><b>删除并重新开始</b></button><button class="choice def" data-act="closeLocal"><b>取消</b></button></div>`, 'tone-bad');
  }

  function currentQueueItem() {
    if (!g || !g.queue.length) return null;
    return g.queue[0];
  }
  function renderModal() {
    const layer = $('modalLayer');
    if (!modal) { if (layer.innerHTML) layer.innerHTML = ''; return; }
    let html = null;
    if (modal.kind === 'queue') {
      const item = g.queue.find(q => q.qid === modal.qid);
      if (!item) { modal = null; layer.innerHTML = ''; return; }
      if (modal.min) {
        // 收起状态：只显示一条提示，玩家可以自由查看其他页面
        const more = g.queue.length - 1;
        html = `<div class="pending-bar">${ico('exclam')}<span class="grow">待你决定：<b>${esc(queueTitle(item))}</b>${more > 0 ? `<small class="dim">（之后还有 ${more} 件）</small>` : ''}<small class="dim"> · 游戏已暂停</small></span><button class="primary" data-act="restoreModal">展开</button></div>`;
        if (!layer.firstChild || !layer.querySelector('.pending-bar')) layer.innerHTML = html;
        else morph(layer, html);
        return;
      }
      headMin = true;
      html = { event: renderEvent, grants: renderGrants, recruit: renderRecruit, pool: renderPool, notice: renderNotice, summary: renderSummary, eval: renderEval, ending: renderEnding, jobmarket: renderJobMarket }[item.type];
      html = item.type === 'venue' ? renderVenue(item.pid, false) : html ? html(item) : null;
      headMin = false;
      if (html === null) {
        // 内容失效（比如事件主角已经离开），直接跳过
        RS.Sim.resolve(g, item, 0);
        modal = null;
        layer.innerHTML = '';
        return;
      }
    } else {
      const t = modal.type;
      const LOCAL = {
        settings: renderSettings, help: renderHelp, reset: renderConfirmReset,
        venue: d => renderVenue(d, true), topic: renderTopic,
        groupNew: renderGroupNew, groupAdd: renderGroupAdd, groupLead: renderGroupLead, memberGroups: renderMemberGroups, grad: renderGrad,
      };
      html = LOCAL[t] ? LOCAL[t](modal.data) : '';
      if (!html) { modal = null; layer.innerHTML = ''; return; }
    }
    if (!layer.firstChild) layer.innerHTML = html;
    else morph(layer, html);
  }

  function openNextQueue() {
    if (modal || !g) return;
    let item = currentQueueItem();
    // 博士阶段：不是你的事（导师的决定）不弹给你，交给导师处理
    while (item && g.phd && !S.playerFacing(g, item)) {
      RS.Sim.autoOne(g, item);
      dirty = true;
      item = currentQueueItem();
    }
    if (!item) return;
    modal = { kind: 'queue', qid: item.qid };
    modalOpenedAt = performance.now();
    renderModal();
    if (!modal) return openNextQueue();
    const tone = item.type === 'notice' ? item.tone : item.type === 'eval' ? (item.result === 'pass' ? 'gold' : item.result === 'fail' ? 'bad' : 'info') : null;
    RS.SFX.play(tone === 'gold' ? 'fanfare' : tone === 'bad' ? 'bad' : tone === 'good' ? 'good' : 'popup');
    if (item.fx === 'confetti') RS.bus.emit('expand', {});
    notifyAttention(item);
    G.save(g);
  }
  function closeModal() {
    modal = null;
    $('modalLayer').innerHTML = '';
    dirty = true;
    setTimeout(openNextQueue, 120);
  }
  function resolveCurrent(payload) {
    const item = modal && modal.kind === 'queue' ? g.queue.find(q => q.qid === modal.qid) : null;
    if (item) RS.Sim.resolve(g, item, payload);
    closeModal();
  }

  function notifyAttention(item) {
    const away = document.hidden || !document.hasFocus();
    if (!away) return;
    if (window.desktop && window.desktop.attention) window.desktop.attention();
    if (RS.settings.notify && 'Notification' in window && Notification.permission === 'granted') {
      let title = '实验室需要你做决定';
      if (item.type === 'event') { const ev = RS.Sim.buildEvent(g, item); if (ev) title = ev.title; }
      else title = { grants: '基金申请季开始了', recruit: '招生季开始了', pool: '有新的申请', venue: '论文写完了，投哪里？', notice: item.title, summary: '年度总结', eval: '考核结果出来了', ending: '人生的终章', jobmarket: '求职季' }[item.type] || title;
      try { new Notification('科研模拟器', { body: title, silent: true }); } catch (e) { /* ignore */ }
    }
    if (!titleBlink) {
      const base = document.title;
      let on = false;
      titleBlink = setInterval(() => {
        on = !on;
        document.title = on ? '【需要你的决定】' : base;
        if (!document.hidden && document.hasFocus()) { clearInterval(titleBlink); titleBlink = null; document.title = base; }
      }, 1000);
    }
  }

  // ---------- 提示条 / 工具提示 ----------
  UI.toast = function (text, kind) {
    const box = $('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = text;
    box.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3800);
    setTimeout(() => el.remove(), 4300);
    while (box.children.length > 5) box.firstChild.remove();
  };
  function showTip(text, x, y) {
    const tip = $('tooltip');
    tip.innerHTML = esc(text).replace(/\n/g, '<br>');
    tip.style.display = 'block';
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 4) left = x - r.width - 10;
    if (top + r.height > window.innerHeight - 4) top = y - r.height - 10;
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
  }
  function hideTip() { $('tooltip').style.display = 'none'; }

  function sceneTip(info) {
    if (!info) return null;
    if (info.kind === 'member') {
      const m = G.member(g, info.id);
      if (!m) return null;
      const t = document.createElement('div');
      t.innerHTML = taskText(m);
      return `${m.name}（${S.ROLE_NAMES[m.role]} · ${S.memberYearLabel(g, m)}）\n${t.textContent}\n心情 ${Math.round(m.mood)} · 想法 ${Math.round(m.stats.idea)} / 编程 ${Math.round(m.stats.code)} / 写作 ${Math.round(m.stats.write)}`;
    }
    if (info.kind === 'pi') return `${g.pi.name}（${G.titleName(g)}）\n精力 ${Math.round(g.pi.energy)} · ${POLICIES[0].opts.find(o => o[0] === g.policies.focus)[1]}`;
    if (info.kind === 'gpu') { const c = S.dayContext(g); return `服务器机柜\n算力 ${c.units} / 需求 ${c.demand.toFixed(0)}`; }
    if (info.kind === 'honor') return `荣誉墙\nA 类论文 ${g.stats.pubs.A} 篇 · 最佳论文 ${g.stats.bestPapers} 篇（金框）`;
    if (info.kind === 'cat') return '实验室的猫\n全员心情 +，偶尔捣乱';
    if (info.kind === 'door') return `${g.labName} 的大门`;
    if (info.kind === 'fac') return (RS.FACILITIES.find(f => f.id === info.id) || {}).name || '';
    return null;
  }

  // ---------- 开始界面 ----------
  function defaultNg() {
    return { path: 'phd', name: '', lab: U.pick(RS.LAB_NAMES), region: 'us', tier: 1, school: G.defaultSchool('us', 1), customSchool: '', area: 'ml', topic: RS.AREAS.ml.topics[0].id, perk: 'postdoc', advisor: 'solid', ugbg: 'elite', avatar: RS.randomAvatar() };
  }
  function renderStart(save) {
    if (!ng) ng = defaultNg();
    const R = RS.REGIONS[ng.region];
    const A = RS.AREAS[ng.area];
    const perk = RS.PERKS.find(p => p.id === ng.perk);
    const phd = ng.path === 'phd';
    const adv = RS.ADVISORS.find(a => a.id === ng.advisor) || RS.ADVISORS[0];
    const ugbg = RS.UG_BG.find(b => b.id === ng.ugbg) || RS.UG_BG[0];
    const chip = (act, v, label, on, tip) => `<button class="chip-btn ${on ? 'on' : ''}" data-act="${act}" data-arg="${v}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${esc(label)}</button>`;
    return `<div class="start-inner">
      <div class="logo"><div class="t1">科研模拟器</div><div class="t2">RESEARCH  SIMULATOR</div><div class="t3">一个计算机方向 PI 的挂机人生</div></div>
      ${save ? (save.phd
        ? `<div class="card continue"><div class="row"><img class="portrait" src="${SP.portraitURL(save.phd.avatar, 'phd', 3)}" alt=""><div class="grow"><b>${esc(save.phd.name)}</b> · 读博中<div class="small dim">${esc(save.school)} · 导师 ${esc(save.pi.name)} · ${esc(RS.AREAS[save.areaId].name)} · ${G.dateStr(save.day)} · 我的论文 ${save.papers.filter(p => (p.authors || []).includes(save.player)).length} 篇</div></div><button class="primary" data-act="continue">继续游戏</button></div></div>`
        : `<div class="card continue"><div class="row"><img class="portrait" src="${SP.portraitURL(Object.assign({ suit: true }, save.pi.avatar), 'pi', 3)}" alt=""><div class="grow"><b>${esc(save.pi.name)}</b> · ${esc(save.labName)}<div class="small dim">${esc(save.school || RS.REGIONS[save.region].name)} · ${esc(RS.AREAS[save.areaId].name)} · ${G.dateStr(save.day)} · 论文 ${save.papers.filter(p => !p.phd).length} 篇${save.ended && !save.flags.continued ? ' · 已结束' : ''}</div></div><button class="primary" data-act="continue">继续游戏</button></div></div>`) : ''}
      <div class="card form">
        <h3>${save ? '或者，开始新的人生' : '开始你的科研人生'}</h3>
        <div class="frow"><label>人生起点</label><div class="chips-wrap">${chip('ngPath', 'phd', '从博士一年级开始', phd, '先读博：发论文、过资格考试、实习、开会……毕业后凭成果找教职')}${chip('ngPath', 'pi', '直接当 PI（快速开局）', !phd, '跳过读博，直接从刚入职的助理教授开始')}</div></div>
        <p class="hint">${phd ? '从博士生做起。五年后带着你的论文、推荐信和人脉去找教职：能去什么学校、带着什么背景开实验室，都由读博的经历决定。' : '直接从刚入职的助理教授开始，学校和背景自己选。'}</p>
        <div class="frow"><label>你的名字</label><input id="ng-name" maxlength="12" placeholder="${phd ? '比如：张三' : '比如：张教授'}" value="${esc(ng.name)}"></div>
        ${phd ? '' : `<div class="frow"><label>实验室名（英文）</label><input id="ng-lab" maxlength="18" value="${esc(ng.lab)}"></div>`}
        <div class="frow"><label>形象</label><img class="portrait" src="${phd ? SP.portraitURL(ng.avatar, 'phd', 3) : SP.portraitURL(Object.assign({ suit: true }, ng.avatar), 'pi', 3)}" alt=""><button data-act="ngAvatar">换一个</button></div>
        <div class="frow"><label>${phd ? '读博地区' : '地区'}</label><div class="chips-wrap">${Object.values(RS.REGIONS).map(r => chip('ngRegion', r.id, `${r.name} · ${r.sub}`, ng.region === r.id)).join('')}</div></div>
        <p class="hint">${esc(R.desc)}</p>
        <div class="frow"><label>${phd ? '博士学校档次' : '学校档次'}</label><div class="chips-wrap">${R.tiers.map((t, i) => chip('ngTier', i, t.name, ng.tier === i, t.desc)).join('')}</div></div>
        <p class="hint">${phd ? `学校越好，同门越强、导师资源越多，找教职时也更有优势（博士学校加分）。` : `${esc(R.tiers[ng.tier].desc)}。起步经费 ${R.money(R.tiers[ng.tier].startup)}。`}</p>
        <div class="frow"><label>${phd ? '你的博士学校' : '你的学校'}</label><div class="chips-wrap" id="ng-school-list">${(R.tiers[ng.tier].schools || []).map(s => chip('ngSchool', s, s, !ng.customSchool && ng.school === s)).join('')}</div></div>
        <div class="frow"><label></label><input id="ng-school" maxlength="24" placeholder="输入校名：筛选上面的列表，或直接用列表里没有的学校" value="${esc(ng.customSchool)}"><span class="small dim" id="ng-school-none"></span></div>
        <p class="hint">${phd ? '你会在这所学校读博。' : '学校名字会出现在游戏里：你课上和学院群里招到的学生都来自这所学校。档次决定经费、生源和考核标准。'}（${esc(R.tiers[R.tiers.length - 1].name)}用的是虚构校名）</p>
        <div class="frow"><label>研究方向</label><div class="chips-wrap">${Object.values(RS.AREAS).map(a => chip('ngArea', a.id, a.name, ng.area === a.id)).join('')}</div></div>
        <p class="hint">${esc(A.desc)}</p>
        <div class="frow"><label>核心课题</label><div class="chips-wrap">${A.topics.map(t => chip('ngTopic', t.id, t.name, ng.topic === t.id)).join('')}</div></div>
        ${phd
          ? `<div class="frow"><label>导师</label><div class="chips-wrap">${RS.ADVISORS.map(a => chip('ngAdvisor', a.id, a.name, ng.advisor === a.id, a.desc)).join('')}</div></div>
        <p class="hint">${esc(adv.desc)}</p>
        <div class="frow"><label>本科背景</label><div class="chips-wrap">${RS.UG_BG.map(b => chip('ngUg', b.id, b.name, ng.ugbg === b.id, b.desc)).join('')}</div></div>
        <p class="hint">${esc(ugbg.desc)}</p>`
          : `<div class="frow"><label>背景</label><div class="chips-wrap">${RS.PERKS.map(p => chip('ngPerk', p.id, p.name, ng.perk === p.id, p.desc)).join('')}</div></div>
        <p class="hint">${esc(perk.desc)}</p>`}
        <button class="primary big" data-act="start">${phd ? '开始读博' : '开始科研人生'}</button>
      </div>
      <p class="small dim center">像素字体：Fusion Pixel Font（OFL-1.1）</p>
    </div>`;
  }
  UI.showStart = function (save) {
    const el = $('startScreen');
    el.style.display = 'block';
    el.innerHTML = renderStart(save);
    UI._save = save;
    const input = $('ng-school');
    if (input) {
      input.addEventListener('input', filterSchools);
      filterSchools();
    }
  };
  // 输入校名时筛选学校列表；列表里没有的话就用输入的名字
  function filterSchools() {
    const input = $('ng-school'), none = $('ng-school-none');
    if (!input) return;
    const q = input.value.trim().toLowerCase();
    let shown = 0;
    document.querySelectorAll('#ng-school-list [data-act="ngSchool"]').forEach(b => {
      const hit = !q || b.textContent.toLowerCase().includes(q);
      b.style.display = hit ? '' : 'none';
      if (hit) shown++;
    });
    if (none) none.textContent = q && !shown ? '列表里没有，就用这个名字' : '';
  }
  // 输入的名字和列表里的某所学校一样（不分大小写）时，用列表里的写法
  function typedSchool() {
    const typed = (ng.customSchool || '').trim();
    if (!typed) return '';
    const list = RS.REGIONS[ng.region].tiers[ng.tier].schools || [];
    return list.find(s => s.toLowerCase() === typed.toLowerCase()) || typed;
  }
  function hideStart() {
    const el = $('startScreen');
    el.style.display = 'none';
    el.innerHTML = '';
  }
  function readNgInputs() {
    const n = $('ng-name'), l = $('ng-lab'), s = $('ng-school');
    if (n) ng.name = n.value;
    if (l) ng.lab = l.value;
    if (s) ng.customSchool = s.value;
  }

  // ---------- 动作 ----------
  function act(a, el) {
    const arg = el.getAttribute('data-arg');
    const k = el.getAttribute('data-k');
    const v = el.getAttribute('data-v');
    const M = RS.Main;
    const fail = msg => { if (msg) UI.toast(msg, 'bad'); };
    RS.SFX.play('click');
    switch (a) {
      // 开始界面
      case 'ngAvatar': readNgInputs(); ng.avatar = RS.randomAvatar(); UI.showStart(UI._save); return;
      case 'ngRegion': readNgInputs(); ng.region = arg; ng.school = G.defaultSchool(arg, ng.tier); UI.showStart(UI._save); return;
      case 'ngTier': readNgInputs(); ng.tier = +arg; ng.school = G.defaultSchool(ng.region, ng.tier); UI.showStart(UI._save); return;
      case 'ngSchool': readNgInputs(); ng.school = arg; ng.customSchool = ''; UI.showStart(UI._save); return;
      case 'ngArea': readNgInputs(); ng.area = arg; ng.topic = RS.AREAS[arg].topics[0].id; UI.showStart(UI._save); return;
      case 'ngTopic': readNgInputs(); ng.topic = arg; UI.showStart(UI._save); return;
      case 'ngPerk': readNgInputs(); ng.perk = arg; UI.showStart(UI._save); return;
      case 'ngPath': readNgInputs(); ng.path = arg; UI.showStart(UI._save); return;
      case 'ngAdvisor': readNgInputs(); ng.advisor = arg; UI.showStart(UI._save); return;
      case 'ngUg': readNgInputs(); ng.ugbg = arg; UI.showStart(UI._save); return;
      case 'start': {
        readNgInputs();
        const lab = (ng.lab || '').trim() || 'PIXEL Lab';
        const school = typedSchool() || ng.school;
        if (ng.path === 'phd') {
          const name = (ng.name || '').trim() || RS.randomName(ng.region);
          const game = G.newPhdGame({ name, avatar: ng.avatar, region: ng.region, tier: ng.tier, school, areaId: ng.area, coreTopic: ng.topic, advisor: ng.advisor, ugbg: ng.ugbg });
          hideStart();
          M.start(game, true);
          return;
        }
        const game = G.newGame({ piName: (ng.name || '').trim() || (ng.region === 'cn' ? '张老师' : 'Prof. Zhang'), labName: lab, school, region: ng.region, tier: ng.tier, areaId: ng.area, coreTopic: ng.topic, perk: ng.perk, avatar: ng.avatar });
        hideStart();
        M.start(game, true);
        return;
      }
      case 'continue': {
        const save = G.load();
        if (!save) return fail('存档读取失败');
        hideStart();
        M.start(save, false);
        return;
      }
    }
    if (!g) return;
    switch (a) {
      case 'pause': M.togglePause(); break;
      case 'speed': M.setSpeed(+arg); break;
      case 'openQueue':
        if (modal && modal.kind === 'queue' && modal.min) { modal.min = false; modalOpenedAt = performance.now(); }
        else openNextQueue();
        break;
      case 'minModal': if (modal && modal.kind === 'queue') modal.min = true; break;
      case 'restoreModal': if (modal && modal.kind === 'queue') { modal.min = false; modalOpenedAt = performance.now(); } break;
      case 'fold': openState[arg] = !openState[arg]; break;
      case 'ledgerYear': ledgerYear = +arg; break;
      case 'tab': tab = arg; confirmDismiss = null; confirmGroupDel = null; $('tabBody').scrollTop = 0; break;
      case 'compact': UI.setCompact(!document.body.classList.contains('compact')); break;
      case 'settings': modal = { kind: 'local', type: 'settings' }; break;
      case 'help': modal = { kind: 'local', type: 'help' }; break;
      case 'closeLocal': closeModal(); return;
      case 'policy':
        g.policies[k] = v;
        if (k === 'auto') RS.Sim.autoResolve(g);
        break;
      case 'core': g.policies.coreTopic = arg; break;
      // 博士阶段
      case 'phdTalk': fail(S.phdTalk(g)); break;
      case 'phdVacation': fail(S.phdVacation(g)); break;
      case 'phdHelper': fail(S.phdHelper(g)); break;
      case 'phdPolicy': g.phd[k] = v; break;
      case 'phdMarket': if (!g.phd.market) S.openMarket(g); break;
      case 'jmRegion': { const item = g.queue.find(q => modal && q.qid === modal.qid); if (item && item.sel) item.sel.regions[arg] = !item.sel.regions[arg]; break; }
      case 'jmTier': { const item = g.queue.find(q => modal && q.qid === modal.qid); if (item && item.sel) item.sel.tiers[arg] = !item.sel.tiers[arg]; break; }
      case 'jmApply': { const item = g.queue.find(q => modal && q.qid === modal.qid); if (item) resolveCurrent({ sel: item.sel }); return; }
      case 'jmAccept': {
        const item = g.queue.find(q => modal && q.qid === modal.qid);
        const o = item && item.offers && item.offers[+arg];
        if (!o) break;
        if (o.kind === 'faculty') {
          const input = $('jm-lab');
          const name = input ? input.value.trim() : '';
          const pg = S.startFaculty(g, o, /^[\x20-\x7e]+$/.test(name) ? name : '');
          modal = null;
          $('modalLayer').innerHTML = '';
          RS.Main.start(pg, true);
          UI.toast(`你接受了 ${o.school} 的 offer！`, 'gold');
          return;
        }
        resolveCurrent({ accept: +arg });
        return;
      }
      case 'locate': selMember = arg; RS.Scene.ping(arg); break;
      case 'talk': { const m = G.member(g, arg); if (m) fail(S.talk(g, m)); break; }
      case 'bonus': { const m = G.member(g, arg); if (m) fail(S.giveBonus(g, m)); break; }
      case 'fund': { const m = G.member(g, arg); if (m) fail(S.setFunding(g, m, m.funding === 'ta' ? 'ra' : 'ta')); break; }
      case 'dismiss': {
        const m = G.member(g, arg);
        if (!m) break;
        if (confirmDismiss !== arg) { confirmDismiss = arg; break; }
        confirmDismiss = null;
        S.dismiss(g, m);
        break;
      }
      case 'ugPool': fail(S.ugPool(g)); setTimeout(openNextQueue, 50); break;
      case 'postdoc': fail(S.postdocSearch(g)); break;
      case 'venue': modal = { kind: 'local', type: 'venue', data: arg }; break;
      case 'topic': modal = { kind: 'local', type: 'topic', data: arg }; break;
      case 'topicPick': { const p = G.project(g, modal && modal.data); if (p) fail(S.changeTopic(g, p, arg)); closeModal(); return; }
      // 小组
      case 'groupNew': modal = { kind: 'local', type: 'groupNew' }; break;
      case 'groupCreate': {
        const why = S.canCreateGroup(g, arg);
        if (why) { fail(why); break; }
        const gr = S.createGroup(g, arg);
        modal = { kind: 'local', type: 'groupAdd', data: gr.id };
        break;
      }
      case 'groupAdd': modal = { kind: 'local', type: 'groupAdd', data: arg }; break;
      case 'groupToggle': { const m = G.member(g, k); if (m) fail(S.setMemberGroup(g, m, arg, !S.inGroup(m, arg))); break; }
      case 'groupKick': { const m = G.member(g, k); if (m) fail(S.setMemberGroup(g, m, arg, false)); break; }
      case 'groupLead': modal = { kind: 'local', type: 'groupLead', data: arg }; break;
      case 'leadPick': {
        const why = S.setGroupLead(g, arg, k || null);
        if (why) { fail(why); break; }
        closeModal();
        return;
      }
      case 'groupDel':
        if (confirmGroupDel !== arg) { confirmGroupDel = arg; break; }
        confirmGroupDel = null;
        fail(S.deleteGroup(g, arg));
        break;
      case 'alloc': fail(S.allocGpu(g, arg, k, +v)); break;
      case 'memberGroups': modal = { kind: 'local', type: 'memberGroups', data: arg }; break;
      case 'grad': modal = { kind: 'local', type: 'grad', data: arg }; break;
      case 'gradDo':
      case 'gradEarly': {
        const m = G.member(g, arg);
        const why = m ? S.piGraduate(g, m, a === 'gradEarly') : null;
        if (why) { fail(why); break; }
        closeModal();
        return;
      }
      case 'venuePick': {
        if (modal && modal.kind === 'local') {
          const p = G.project(g, modal.data);
          if (p) S.setTarget(g, p, arg, +k || g.day);
          closeModal();
          return;
        }
        resolveCurrent({ v: arg, day: +k || g.day });
        return;
      }
      case 'venueAuto': {
        if (modal && modal.kind === 'local') {
          const p = G.project(g, modal.data);
          if (p) { const t = S.autoTarget(g, p); if (t) p.target = t; }
          closeModal();
          return;
        }
        resolveCurrent(null);
        return;
      }
      case 'buyGpu': fail(S.buyGpu(g, arg)); break;
      case 'sellGpu': fail(S.sellGpu(g, arg)); break;
      case 'cloud': S.setCloud(g, g.cloud + +arg); break;
      case 'buyFac': fail(S.buyFacility(g, arg)); break;
      case 'expand': fail(S.expandRoom(g)); break;
      case 'big': fail(S.doBig(g, arg)); break;
      case 'seek': fail(S.seekContract(g)); setTimeout(openNextQueue, 50); break;
      case 'paperFilter': paperFilter = v; paperLimit = 30; break;
      case 'paperMore': paperLimit += 30; break;
      // 队列弹窗
      case 'choose': resolveCurrent(+arg); return;
      case 'ok': resolveCurrent(null); return;
      case 'gsel': {
        const item = g.queue.find(q => modal && q.qid === modal.qid);
        if (!item) break;
        item.sel = item.sel || {};
        const d = G.grantDef(g, k);
        if (v && d.group) item.ids.forEach(id => { if (id !== k && G.grantDef(g, id).group === d.group) item.sel[id] = ''; });
        item.sel[k] = v;
        break;
      }
      case 'grantsOk': { const item = g.queue.find(q => modal && q.qid === modal.qid); resolveCurrent(item ? item.sel || {} : {}); return; }
      case 'interview': { const item = g.queue.find(q => modal && q.qid === modal.qid); if (item) S.interview(g, item, arg); break; }
      case 'offer': {
        const item = g.queue.find(q => modal && q.qid === modal.qid);
        if (!item) break;
        const c = item.cands.find(x => x.cid === arg);
        const i = item.offers.indexOf(arg);
        if (i >= 0) item.offers.splice(i, 1);
        else {
          const used = item.offers.filter(cid => (item.cands.find(x => x.cid === cid) || {}).role === c.role).length;
          if (used >= item.quota[c.role]) { fail(`${S.ROLE_NAMES[c.role]}名额已满`); break; }
          item.offers.push(arg);
        }
        break;
      }
      case 'recruitOk': resolveCurrent(null); return;
      case 'pick': {
        const item = g.queue.find(q => modal && q.qid === modal.qid);
        if (!item) break;
        item.pick = item.pick || [];
        const i = item.pick.indexOf(arg);
        if (i >= 0) item.pick.splice(i, 1);
        else if (item.pick.length < item.max) item.pick.push(arg);
        else if (item.max === 1) item.pick = [arg];
        break;
      }
      case 'poolOk': { const item = g.queue.find(q => modal && q.qid === modal.qid); resolveCurrent(item ? item.pick || [] : []); return; }
      case 'restart': resolveCurrent('stop'); G.clearSave(); RS.Main.stop(); ng = null; UI.showStart(null); return;
      case 'continueGame': resolveCurrent('continue'); return;
      // 设置
      case 'set': {
        const s = RS.settings;
        if (k === 'volume' || k === 'zoom') s[k] = parseFloat(v);
        else s[k] = v === '1';
        if (k === 'zoom') UI.applyZoom();
        if (k === 'notify' && s.notify && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        if (k === 'onTop' && window.desktop) window.desktop.setOnTop(s.onTop);
        G.saveSettings(s);
        break;
      }
      case 'export': exportSave(); break;
      case 'import': $('importFile').click(); break;
      case 'reset': modal = { kind: 'local', type: 'reset' }; break;
      case 'resetYes': G.clearSave(); RS.Main.stop(); modal = null; $('modalLayer').innerHTML = ''; ng = null; UI.showStart(null); return;
      default: break;
    }
    dirty = true;
    if (modal) renderModal();
  }

  function exportSave() {
    G.save(g);
    const blob = new Blob([JSON.stringify(g)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `research-sim-${G.calYear(g)}-${(g.labName || 'lab').replace(/\W+/g, '_')}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function importSave(file) {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        const game = G.migrate(JSON.parse(fr.result));
        if (!game) throw new Error('bad');
        game.savedAt = Date.now(); // 导入不算“离线”，不要快进
        modal = null;
        $('modalLayer').innerHTML = '';
        hideStart();
        RS.Main.start(game, false);
        UI.toast('存档导入成功', 'good');
      } catch (e) {
        UI.toast('这不是有效的存档文件', 'bad');
      }
    };
    fr.readAsText(file);
  }

  // ---------- 公共接口 ----------
  UI.init = function () {
    document.addEventListener('click', e => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (modal && modal.kind === 'queue' && el.closest('#modalLayer') && performance.now() - modalOpenedAt < 300) return;
      act(el.getAttribute('data-act'), el);
    });
    document.addEventListener('mouseover', e => {
      const el = e.target.closest('[data-tip]');
      if (el) showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
    });
    document.addEventListener('mousemove', e => {
      const el = e.target.closest('[data-tip]');
      if (el) showTip(el.getAttribute('data-tip'), e.clientX, e.clientY);
      else if (e.target.id !== 'scene') hideTip();
    });
    document.addEventListener('mouseleave', hideTip);
    const cv = $('scene');
    cv.addEventListener('mousemove', e => {
      if (!g) return;
      const r = cv.getBoundingClientRect();
      const info = RS.Scene.hitTest(((e.clientX - r.left) / r.width) * RS.Scene.W, ((e.clientY - r.top) / r.height) * RS.Scene.H);
      const t = sceneTip(info);
      cv.style.cursor = info && (info.kind === 'member' || info.kind === 'pi') ? 'pointer' : 'default';
      if (t) showTip(t, e.clientX, e.clientY);
      else hideTip();
    });
    cv.addEventListener('mouseleave', hideTip);
    cv.addEventListener('click', e => {
      if (!g) return;
      const r = cv.getBoundingClientRect();
      const info = RS.Scene.hitTest(((e.clientX - r.left) / r.width) * RS.Scene.W, ((e.clientY - r.top) / r.height) * RS.Scene.H);
      if (!info) return;
      if (info.kind === 'member') {
        selMember = info.id;
        tab = 'members';
        if (document.body.classList.contains('compact')) UI.setCompact(false);
        dirty = true;
        UI.frame(true);
        const el = $('m-' + info.id);
        if (el) el.scrollIntoView({ block: 'center' });
      } else if (info.kind === 'pi') { tab = 'lab'; dirty = true; }
      else if (info.kind === 'gpu') { tab = 'facility'; dirty = true; }
      else if (info.kind === 'honor') { tab = 'research'; paperFilter = 'A'; dirty = true; }
    });
    document.addEventListener('keydown', e => {
      if (!g || e.target.tagName === 'INPUT') return;
      if (e.code === 'Space') { e.preventDefault(); if (!modal) RS.Main.togglePause(); dirty = true; }
      else if (/^Digit[1-4]$/.test(e.code) && !modal) { RS.Main.setSpeed(+e.code.slice(5) - 1); }
      else if (e.code === 'Escape' && modal && modal.kind === 'local') closeModal();
      else if (e.code === 'Escape' && modal && modal.kind === 'queue' && !modal.min) { modal.min = true; renderModal(); }
    });
    $('importFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (f) importSave(f);
      e.target.value = '';
    });
    window.addEventListener('resize', () => UI.layout());
    RS.bus.on('toast', d => UI.toast(d.text, d.kind));
    RS.bus.on('achievement', a => { UI.toast(`成就解锁：${a.name}`, 'gold'); RS.SFX.play('good'); });
    RS.bus.on('accept', d => RS.SFX.play(d.best ? 'fanfare' : 'good'));
    RS.bus.on('reject', () => RS.SFX.play('bad'));
    RS.bus.on('grant', () => RS.SFX.play('coin'));
    RS.bus.on('member_join', () => RS.SFX.play('door'));
    RS.bus.on('log', () => { dirty = true; });
    RS.bus.on('queue', () => { if (g) setTimeout(openNextQueue, 60); });
    const fav = $('favicon');
    if (fav) fav.href = SP.iconURL('flask', 4);
    UI.applyZoom();
    UI.layout();
  };

  UI.setGame = function (game) {
    g = game;
    tab = game && game.phd ? 'me' : 'lab';
    paperFilter = game && game.phd ? 'mine' : 'all';
    selMember = null;
    modal = null;
    $('modalLayer').innerHTML = '';
    $('app').style.visibility = game ? 'visible' : 'hidden';
    dirty = true;
    UI.layout();
    UI.frame(true);
    setTimeout(openNextQueue, 300);
  };
  UI.isBlocking = () => !!modal || !!(g && g.queue.length);
  UI.dirty = () => { dirty = true; };
  UI.applyZoom = function () {
    if (window.desktop && window.desktop.setZoom) window.desktop.setZoom(RS.settings.zoom || 1);
    setTimeout(() => UI.layout(), 100);
  };
  UI.setCompact = function (on) {
    document.body.classList.toggle('compact', on);
    if (window.desktop && window.desktop.setCompact) window.desktop.setCompact(on);
    setTimeout(() => UI.layout(), 50);
    setTimeout(() => UI.layout(), 400);
  };
  UI.layout = function () {
    const wrap = $('sceneWrap'), cv = $('scene');
    if (!wrap || !cv) return;
    const compact = document.body.classList.contains('compact');
    const availW = wrap.clientWidth - 8;
    const availH = compact ? window.innerHeight - $('topbar').offsetHeight - 8 : Math.max(200, (window.innerHeight - $('topbar').offsetHeight) * 0.68);
    let s = Math.min(availW / RS.Scene.W, availH / RS.Scene.H);
    if (s >= 1 && !compact) s = Math.floor(s * 2) / 2;
    s = Math.max(0.5, s);
    cv.style.width = Math.round(RS.Scene.W * s) + 'px';
    cv.style.height = Math.round(RS.Scene.H * s) + 'px';
  };

  UI.frame = function (force) {
    if (!g) return;
    const now = performance.now();
    if (!force && !dirty && now - lastRender < 700) return;
    if (!force && now - lastRender < 120) return;
    if (document.querySelector('#tabBody :active') && !force) return;
    lastRender = now;
    dirty = false;
    morph($('topbar'), renderTop());
    morph($('tabs'), renderTabs());
    const t = curTabs().find(x => x[0] === tab) || curTabs()[0];
    morph($('tabBody'), t[3]());
    morph($('log'), renderLog());
    if (modal && modal.kind === 'queue') {
      const item = g.queue.find(q => q.qid === modal.qid);
      if (item && (item.type === 'grants' || item.type === 'recruit')) renderModal();
    }
    if (!modal && g.queue.length) openNextQueue();
  };
})();
