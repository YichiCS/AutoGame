/* 事件：随机事件（带 weight）与系统事件（由模拟逻辑触发）
 * ctx(g)   -> 生成上下文（随机性都在这里），返回 null 表示条件不满足
 * build()  -> 根据上下文生成弹窗内容，必须是确定性的（读档后会重新调用）
 * instant  -> 不弹窗、直接生效的事件，返回 true 表示已处理
 * minor    -> “托管”模式下可自动处理
 */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const U = RS.U;
  const G = () => RS.G;
  const S = () => RS.Sys;
  const M = (g, id) => RS.G.member(g, id);
  const money = (g, v) => RS.G.money(g, v);
  const sn = n => RS.shortName(n);
  const nop = () => {};
  const alumniIndustry = g => g.alumni.filter(a => a.reason === 'poached' || (a.reason === 'graduated' && (/创办|量化/.test(a.dest || '') || RS.G.region(g).companies.some(co => (a.dest || '').indexOf(co) >= 0))));
  const activeOf = (g, pred) => g.members.filter(m => m.status === 'active' && (!pred || pred(m)));
  // 在读的研究生和博士后（会独立负责课题的人）
  const seniorOf = (g, pred) => activeOf(g, m => RS.Sys.CONSULT_ROLES.includes(m.role) && (!pred || pred(m)));
  // 要用真人数据、做用户实验的方向（要过伦理审查）
  const HUMAN_TOPICS = ['med', 'access', 'haic', 'wear', 'social', 'edu', 'xr', 'vis', 'rec', 'dialog', 'sensing'];
  const humanProjects = g => g.projects.filter(p => (p.phase === 'idea' || p.phase === 'exp') && !p.irb && (g.areaId === 'hci' || HUMAN_TOPICS.includes(p.topic)));
  // 可以申请奖学金的学生
  const fellowCands = g => (g.region === 'us'
    ? activeOf(g, m => m.role === 'phd' && m.funding === 'ra' && (RS.Sys.memberYears(g, m) < 1.5 || (m.first || 0) >= 1))
    : activeOf(g, m => (m.role === 'phd' || m.role === 'ms') && (m.first || 0) >= 1 && !m.natAward));

  RS.EVENTS = {
    // ================= 系统事件 =================
    welcome: {
      build: g => {
        const R = G().region(g), A = G().area(g);
        const tip = A.compute >= 0.3 ? '你的方向很依赖算力，记得去「设施」页面买几台 GPU，不然实验会慢得像蜗牛。' : '你的方向不太依赖算力，可以把钱花在人身上。';
        const ph = g.pi.phd;
        const back = ph ? `你在 <b>${U.esc(ph.school)}</b> 读完了博士（导师 ${U.esc(ph.advisor)}）${ph.path === 'postdoc' ? `，又在 ${U.esc(ph.pathPlace)} 做了两年博后` : ph.path === 'industry' ? `，又在 ${U.esc(ph.pathPlace)} 工作了两年` : ''}，带着 ${ph.papers} 篇论文（一作 ${ph.first} 篇）拿到了这份教职。读博的经历让你成了一位「${U.esc((RS.PERKS.find(p => p.id === ph.perk) || {}).name || '')}」。<br><br>` : '';
        return {
          title: `欢迎来到 ${g.school}！`, portrait: { pi: true },
          text: `${back}${R.startText}<br><br>研究方向：<b>${A.name}</b>　起步经费：<b>${money(g, g.startup)}</b><br><br>实验室会自己运转——学生们会选题、做实验、写论文、投稿。你的工作是在<b>关键节点做决定</b>（申请基金、招生、处理突发状况），以及在右侧面板里调整方针、购置设备。遇到需要决定的事情，时间会自动暂停。<br><br><span class="dim">提示：${tip}</span>`,
          choices: [{ label: '开始我的科研人生！', def: true, apply: nop }],
        };
      },
    },

    teaching: {
      minor: true,
      build: (g, c) => {
        const cost = G().region(g).costs.buyout;
        const ug = g.teaching.ug || 0, target = S().ugTarget(g);
        const ev = S().nextEval(g);
        const slots = ev ? Math.max(1, Math.floor((ev.day - g.day) / 180)) : 6;
        // 本科课进度落后时，推荐（也是托管时的默认）选本科课
        const behind = target > ug && target - ug >= slots * 0.45;
        const ch = [
          { label: `本科大课《${c.big}》`, def: behind,
            hint: '每天精力 -0.42 · 评教难度较高 · 计入本科课程门次（考核要求）· 学生多，容易发掘本科生 · 评教 4.3 以上可获教学奖',
            apply: g => S().setTeaching(g, c.sem, { name: c.big, kind: 'ug', energy: 0.42, mod: -0.15 }) },
          { label: `研究生课《${c.grad}》`, def: !behind,
            hint: '每天精力 -0.28 · 评教 +0.15 · 不计入本科课程门次 · 结课时方向积累 +0.4 · 可能吸引本校硕士生',
            apply: g => S().setTeaching(g, c.sem, { name: c.grad, kind: 'grad', topic: c.gradTopic, energy: 0.28, mod: 0.15 }) },
        ];
        if (cost > 0) {
          ch.push({ label: `用经费买断教学（${money(g, cost)}）`, hint: '本学期不用上课：没有评教成绩，也不计入本科课程门次', disabled: g.funds < cost ? '经费不足' : null,
            apply: g => { S().spend(g, cost, 'teaching'); S().setTeaching(g, c.sem, null); G().log(g, '用经费买断了本学期的教学任务', 'info'); } });
        }
        const prog = target
          ? `本科课程已上 <b>${ug}</b> 门，${g.pi.tenured ? '下一次晋升' : '考核'}要求 <b>${target}</b> 门${behind ? '，<b class="warn">进度落后了</b>' : ''}。`
          : `你已经上过 ${ug} 门本科课程。`;
        return {
          title: `${c.semName}排课`, portrait: { icon: 'book' },
          text: `新学期快开始了，教务处发来了排课通知。这学期你想上哪门课？<br>${prog}<br><span class="dim">本科大课更累、评教更难，但学校考核看重本科教学；研究生课轻松，还能顺便深耕自己的方向。</span>`,
          choices: ch,
        };
      },
    },

    rebuttal: {
      minor: true,
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'review') return null;
        const v = RS.VENUES[p.venue];
        const lead = M(g, p.lead);
        const withdraw = { label: '撤稿，改投别处', hint: '按审稿意见改完再投（要占用负责人一段时间）', apply: g => {
          p.attempts++;
          p.history.push({ v: v.id, d: g.day, scores: c.scores, withdrawn: true });
          G().log(g, `《${S().short(p.title)}》从 ${v.name} 撤稿`, 'info');
          S().startRevision(g, p);
        } };
        return {
          title: 'Rebuttal 时间', portrait: lead ? { member: lead.id } : { icon: 'paper' },
          text: `《${U.esc(p.title)}》在 <b>${v.name}</b> 收到了初审意见：<b>${c.scores.join(' / ')}</b><br>Reviewer 2：“${c.quote}”<br>要怎么回复？`,
          choices: lead && lead.isPlayer ? [
            // 博士阶段：你自己的论文，rebuttal 由你来写
            { label: '熬夜逐条认真回复', hint: '论文质量 +4 · 你的心情 -5', def: true, apply: () => { p.q += 4; S().addMood(lead, -5); } },
            { label: '简单回复一下', hint: '论文质量 +1.5', apply: () => { p.q += 1.5; } },
            withdraw,
          ] : [
            { label: '逐条认真回复', hint: '论文质量 +4 · 你的精力 -6 · 学生心情 -3', def: true, apply: g => { p.q += 4; S().addEnergy(g, -6); S().addMood(M(g, p.lead), -3); } },
            { label: '简单回复一下', hint: '论文质量 +1.5 · 精力 -1', apply: g => { p.q += 1.5; S().addEnergy(g, -1); } },
            withdraw,
          ],
        };
      },
    },

    ddl_rush: {
      minor: true,
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'write') return null;
        const v = RS.VENUES[c.v];
        const left = c.day - g.day;
        if (left < 1) return null;
        const lead = M(g, p.lead);
        const pct = Math.round((p.prog / p.need.write) * 100);
        return {
          title: `${v.name} 截稿倒计时 ${left} 天！`, portrait: lead ? { member: lead.id } : { icon: 'clock' },
          text: lead && lead.isPlayer
            ? `你的《${U.esc(p.title)}》已经写了 ${pct}%。要不要通宵冲一下 <b>${v.name}</b>？`
            : `《${U.esc(p.title)}》已经写了 ${pct}%。${lead ? U.esc(lead.name) : '学生'}眼巴巴地看着你：要不要冲一下 <b>${v.name}</b>？`,
          choices: [
            { label: '冲！通宵也要赶上', hint: '写作速度 ×1.6 · 参与者心情 -6 · 你的精力 -4 · 赶出来的稿子表达分 -3', def: true,
              apply: g => {
                p.rush = left; p.rushTarget = { v: v.id, day: c.day };
                [p.lead].concat(p.helpers).forEach(id => S().addMood(M(g, id), -6));
                S().addEnergy(g, -4);
              } },
            { label: '不赶了，慢工出细活', hint: '写完再按计划投稿', apply: nop },
          ],
        };
      },
    },

    phd_grad: {
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const yrs = S().memberYears(g, m);
        const goal = m.bio ? RS.GOALS[m.bio.goal] : '还没想好';
        const trust = Math.round(m.trust == null ? 55 : m.trust);
        const moodHit = Math.round(15 * (1.5 - trust / 100));
        return {
          title: '博士毕业季', portrait: { member: m.id },
          text: `${U.esc(m.name)} 读博 ${yrs.toFixed(1)} 年，发表论文 ${m.pubs} 篇（一作 ${m.first || 0} 篇，其中 A 类 ${m.firstA || 0} 篇），觉得自己可以毕业了。<br>${U.esc(sn(m.name))}的职业理想是「${goal}」，和你的信任度 ${trust}。要让${U.esc(sn(m.name))}答辩吗？`,
          choices: [
            { label: '同意答辩，恭喜毕业！', hint: '学生毕业离组；去向越好，你的声望提升越多（信任越高，推荐信越有分量）', def: true,
              apply: g => {
                const pl = S().graduate(g, m);
                G().queue(g, { type: 'notice', tone: 'good', icon: 'cap', fx: 'confetti', title: `${m.name} 博士毕业！`, text: `${U.esc(m.name)} 顺利通过了答辩，成为了 <b>${U.esc(m.name)} 博士</b>！<br>去向：<b>${U.esc(pl.text)}</b>` });
              } },
            { label: '再留一年，多发几篇', hint: `学生心情 -${moodHit} · 信任 -15`, disabled: yrs >= 6.5 ? '已经读了太久，不能再拖了' : null,
              apply: g => { S().addMood(m, -moodHit); S().addTrust(m, -15); m.extended++; S().story(g, m, '被要求延期一年毕业'); G().log(g, `${m.name} 被要求延期一年毕业，有点郁闷`, 'bad'); } },
          ],
        };
      },
    },

    ms_to_phd: {
      minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const cost = G().region(g).costs.phd;
        return {
          title: '硕士生想读博', portrait: { member: m.id },
          text: `${U.esc(m.name)} 硕士快毕业了。${U.esc(sn(m.name))}在你这里做得不错，想继续留下来跟你读博。`,
          choices: [
            { label: '欢迎留下！', hint: `转为博士生 · 每月开销 ${money(g, cost)}`, def: true,
              apply: g => { m.role = 'phd'; m.startDay = g.day; m.endDay = 0; m.funding = 'ra'; S().addMood(m, 15); S().addTrust(m, 5); S().story(g, m, '硕士毕业，留下来读博'); G().log(g, `${m.name} 转为博士生，继续留在实验室`, 'good'); } },
            { label: '还是去工作吧', hint: '正常毕业', apply: g => { S().graduate(g, m); } },
          ],
        };
      },
    },

    ug_to_phd: {
      minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const R = G().region(g);
        const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
        return {
          title: '本科生想读研', portrait: { member: m.id },
          text: `${U.esc(m.name)} 马上本科毕业了，在组里做了不少事情，想继续读你的研究生。`,
          choices: [
            { label: '收为博士生', hint: `每月开销 ${money(g, R.costs.phd)} · 能力已经知根知底`, def: avg >= 56,
              apply: g => { m.role = 'phd'; m.startDay = g.day; m.endDay = 0; m.funding = 'ra'; S().addMood(m, 15); S().addTrust(m, 5); S().story(g, m, '本科毕业，留下来读博'); G().log(g, `${m.name} 留下来读博了`, 'good'); } },
            { label: '收为硕士生', hint: R.costs.ms ? `每月开销 ${money(g, R.costs.ms)}` : '硕士自费，不用你发钱', def: avg < 56,
              apply: g => { m.role = 'ms'; m.startDay = g.day; m.endDay = g.day + 720; m.funding = S().defaultFunding(g, 'ms'); S().addMood(m, 10); S().addTrust(m, 3); S().story(g, m, '本科毕业，留下来读硕士'); G().log(g, `${m.name} 留下来读硕士了`, 'good'); } },
            { label: '祝前程似锦', hint: '学生毕业离开', apply: g => { S().graduate(g, m); } },
          ],
        };
      },
    },

    quit_threat: {
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const ch = [
          { label: '促膝长谈', hint: '你的精力 -8 · 学生心情 +25 · 信任 +10', def: true, disabled: g.pi.energy < 8 ? '你自己都快撑不住了' : null,
            apply: g => { S().addEnergy(g, -8); S().addMood(m, 25); S().addTrust(m, 10); S().story(g, m, '一度想退出，和你长谈后决定坚持'); G().log(g, `你和 ${m.name} 谈了很久，${sn(m.name)}决定再坚持一下`, 'info'); } },
          { label: '放两周假，回去休息', hint: '离开 14 天 · 心情 +35', apply: g => { m.status = 'away'; m.awayUntil = g.day + 14; m.awayWhy = '休假'; S().addMood(m, 35); } },
        ];
        if (m.funding === 'ra') ch.push({ label: '提高补贴 20%', hint: '每月开销增加 · 心情 +20 · 信任 +8', apply: g => { m.salaryMult *= 1.2; S().addMood(m, 20); S().addTrust(m, 8); } });
        ch.push({ label: '尊重选择，好聚好散', hint: '学生离开 · 声望 -2 · 实验室心情 -3',
          apply: g => { S().removeMember(g, m, 'quit', '中途退出'); S().addRep(g, -2); S().labMood(g, -3); G().log(g, `${m.name} 离开了实验室`, 'bad'); } });
        return {
          title: '学生想退出', portrait: { member: m.id },
          text: `${U.esc(m.name)} 最近状态非常差，今天敲开你办公室的门，说想退出实验室……<br><span class="dim">当前心情 ${Math.round(m.mood)} / 100</span>`,
          choices: ch,
        };
      },
    },

    deficit: {
      build: g => {
        const ex = Math.max(1000, S().expenses(g).total);
        const bridgeUsed = (g.cooldowns.bridge || 0) > g.day;
        const ch = [
          { label: '向学院申请过渡经费', hint: `获得 ${money(g, ex * 3)} · 声望 -3 · 三年只能用一次`, def: !bridgeUsed, disabled: bridgeUsed ? '三年内已经申请过了' : null,
            apply: g => { S().earn(g, ex * 3, 'bridge'); S().addRep(g, -3); g.cooldowns.bridge = g.day + 3 * 360; G().log(g, '学院批了一笔过渡经费，但系主任的脸色不太好看', 'info'); } },
          { label: '先用自己的工资垫上', hint: `获得 ${money(g, ex)} · 你的精力 -10（心累）`, def: bridgeUsed, apply: g => { S().earn(g, ex, 'bridge'); S().addEnergy(g, -10); } },
        ];
        if (G().region(g).hasTA) {
          const slots = G().tierCfg(g).taSlots - S().taUsed(g);
          const ra = g.members.filter(m => m.role === 'phd' && m.funding === 'ra');
          ch.push({ label: '让博士生去当助教', hint: '把 RA 学生转为 TA（系里出钱，但效率 -35%）', disabled: slots <= 0 ? '助教名额已满' : !ra.length ? '没有可转的学生' : null,
            apply: g => { ra.slice(0, Math.max(0, slots)).forEach(m => { m.funding = 'ta'; G().log(g, `${m.name} 转为助教`, 'info'); }); } });
        }
        ch.push({ label: '我自己想办法', hint: '赤字期间学生心情会持续下降', apply: nop });
        return {
          title: '经费赤字！', portrait: { icon: 'money' },
          text: `实验室账户已经透支了（余额 <b class="bad">${money(g, g.funds)}</b>），每月支出 ${money(g, ex)}。财务处打电话来催了。<br><span class="dim">可以去「经费」页看看开销，或者在「成员」页调整资助方式。</span>`,
          choices: ch,
        };
      },
    },

    burnout_pi: {
      build: () => ({
        title: '你病倒了', portrait: { pi: true },
        text: '连续的高强度工作让你的身体亮起了红灯。医生要求你至少休息两周。<br><span class="dim">休息期间你没法指导学生，但精力会快速恢复。记得在「方针」里调整精力分配。</span>',
        choices: [{ label: '只能听医生的了', def: true, apply: g => { g.flags.restUntil = g.day + 14; S().addEnergy(g, 25); } }],
      }),
    },

    hot_trend: {
      minor: true,
      build: (g, c) => {
        const sid = G().asSub(g, c.sid || c.tid);
        const s = G().sub(g, sid);
        const t = G().topic(g, s.topic);
        const ideas = g.projects.filter(p => p.phase === 'idea' && p.sub !== sid);
        const ch = [
          { label: '构思中的课题全部转向', hint: `${ideas.length} 个构思中的课题转向（同一方向的保留七成构思进度，其他的减半）`, disabled: ideas.length ? null : '目前没有构思中的课题',
            apply: g => { ideas.forEach(p => S().changeTopic(g, p, sid)); } },
          { label: '新课题优先做这个子方向', hint: '一年内约三分之一的新课题会选它', def: true, apply: g => { g.flags.trendTopic = sid; g.flags.trendUntil = g.day + 360; } },
        ];
        if (!S().groupOfSub(g, sid)) {
          ch.push({ label: `成立「${s.name}组」专门做`, hint: '新开一个子方向小组，之后去「小组」页把人加进来、分服务器', disabled: S().canCreateGroup(g, sid),
            apply: g => { if (!S().canCreateGroup(g, sid)) S().createGroup(g, sid); } });
        }
        ch.push({ label: '不追热点，坚持自己的方向', hint: '核心方向的积累 +0.5', apply: g => { const k = g.policies.coreTopic; g.expertise[k] = Math.min(10, (g.expertise[k] || 0) + 0.5); } });
        return {
          title: '热点爆发！', portrait: { icon: 'fire' },
          text: `「${t.name}」方向下的「<b>${s.name}</b>」突然爆火！大佬们纷纷入场，相关论文的引用和基金都水涨船高（当然竞争也更激烈了）。<br>${s.topic === g.policies.coreTopic ? '这正是你的核心方向。' : ''}要不要跟进？`,
          choices: ch,
        };
      },
    },

    // 学生做完一个课题后，来找你商量下一个方向
    next_topic: {
      minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.status !== 'active' || m.projectId) return null;
        const interest = S().interestOf(m);
        const mine = S().memberSubs(g, m);
        const alloc = S().computeAlloc(g);
        const heatWord = h => (h >= 2.2 ? '很热门' : h >= 1.5 ? '较热门' : h >= 1.1 ? '热度一般' : '冷门');
        const last = c.sub || (c.topic ? G().asSub(g, c.topic) : null);
        const lastTopic = last ? G().sub(g, last).topic : null;
        const def = c.def ? G().asSub(g, c.def) : null;
        const opts = (c.opts || []).map(x => G().asSub(g, x)).filter((x, i, a) => a.indexOf(x) === i);
        const ch = opts.map(sid => {
          const s = G().sub(g, sid);
          const t = G().topic(g, s.topic);
          const gr = S().groupOfSub(g, sid);
          const fit = S().interestFit(m, sid);
          const tags = [];
          if (sid === last) tags.push('接着做');
          if (fit === 1) tags.push('TA 想做');
          if (!gr) tags.push('没有对应小组');
          const r = gr ? alloc.ratio[gr.id] : 9;
          const comp = gr ? (alloc.dem[gr.id] > 0 ? (r >= 1 ? `${S().groupName(g, gr)}算力充足` : `${S().groupName(g, gr)}算力只够 ${Math.round(r * 100)}%`) : `${S().groupName(g, gr)}算力空闲`) : '用共享算力';
          const hint = [
            `${t.name}${s.topic === g.policies.coreTopic ? '（核心方向）' : ''} · 积累 ${(g.expertise[s.topic] || 0).toFixed(1)} · ${heatWord(S().heat(g, sid))} · ${comp}`,
            sid === last ? '构思快很多' : s.topic === lastTopic ? '同一方向，构思稍快' : null,
            fit === 1 ? '心情 +6 · 信任 +2 · 效率 +5%' : fit ? 'TA 有点兴趣：心情 +2' : interest ? 'TA 不太想做：心情 -3' : null,
            gr && !mine.includes(sid) && (m.groups || []).length < 2 ? `顺便加入${S().groupName(g, gr)}` : null,
          ].filter(Boolean).join(' · ');
          return { label: `做「${s.name}」${tags.length ? `（${tags.join('，')}）` : ''}`, hint, def: sid === def, apply: g => { S().startNext(g, m, sid, 'pi'); } };
        });
        const help = S().helpTarget(g, m);
        if (help) {
          const hl = M(g, help.lead);
          ch.push({ label: `先帮 ${hl ? sn(hl.name) : '同门'} 做《${S().short(help.title)}》`, hint: `作为合作者加入（${S().PHASE_NAMES[help.phase]}阶段，完成 ${Math.round(S().projectPct(help) * 100)}%），做完再来商量`,
            apply: g => S().helpWith(g, m, help) });
        }
        const self = interest || def;
        if (self) ch.push({ label: '让 TA 自己决定', hint: `TA 会选「${S().subName(g, self)}」· 信任 +3 · 心情 +4`, apply: g => { S().startNext(g, m, self, 'self'); } });
        if (!ch.length) return null;
        if (!ch.some(x => x.def)) ch[0].def = true;
        const groups = S().memberGroups(g, m).map(gr => S().groupName(g, gr)).join('、') || '未分组';
        return {
          title: `${m.name} 来商量下一个课题`, portrait: { member: m.id },
          text: `${c.title ? `《${U.esc(c.title)}》写完了，进入投稿流程。<br>` : ''}${U.esc(m.name)} 来办公室找你：“老师，我接下来做什么方向好？”<br><span class="dim">所在小组：${U.esc(groups)} · 最感兴趣：${U.esc(S().dirName(g, interest))} · 想法 ${Math.round(m.stats.idea)} / 编程 ${Math.round(m.stats.code)} / 写作 ${Math.round(m.stats.write)}</span>`,
          choices: ch,
        };
      },
    },

    // 新成员进组时，决定分到哪个小组
    join_group: {
      minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || !g.groups.length || (m.groups || []).length) return null;
        const interest = S().interestOf(m);
        const ch = g.groups.map(gr => {
          const lead = M(g, gr.lead);
          const fit = S().interestFit(m, gr.sub);
          const hint = [fit === 1 ? 'TA 想做这个 · 心情 +4' : fit ? '同一个方向 · 心情 +2' : null, `${S().groupMembers(g, gr).length} 人`, lead ? `组长 ${lead.name}` : '暂无组长', `积累 ${(g.expertise[gr.topic] || 0).toFixed(1)}`].filter(Boolean).join(' · ');
          return { label: `加入「${S().groupName(g, gr)}」`, hint, def: gr.id === c.def,
            apply: g => { S().setMemberGroup(g, m, gr.id, true); G().log(g, `${m.name} 加入了「${S().groupName(g, gr)}」`, 'info'); } };
        });
        if (interest && !S().groupOfSub(g, interest)) {
          ch.push({ label: `为 TA 成立「${S().subName(g, interest)}组」`, hint: '新开一个子方向小组，TA 是第一个成员 · 心情 +4 · 信任 +3', disabled: S().canCreateGroup(g, interest),
            apply: g => {
              if (S().canCreateGroup(g, interest)) return;
              const gr = S().createGroup(g, interest);
              S().setMemberGroup(g, m, gr.id, true);
              S().addTrust(m, 3);
            } });
        }
        ch.push({ label: '先不分组', hint: '按「选题倾向」自由选题，用共享算力；以后可以随时在成员卡片上分组', apply: nop });
        if (!ch.some(x => x.def && !x.disabled)) ch[0].def = true;
        return {
          title: `${m.name} 加入哪个小组？`, portrait: { member: m.id },
          text: `新成员 ${U.esc(m.name)}（${S().ROLE_NAMES[m.role]}）进组了，TA 对「<b>${U.esc(S().dirName(g, interest))}</b>」最感兴趣。<br>要把 TA 分到哪个小组？<span class="dim">之后可以在「成员」或「小组」页再加入第二个小组。</span>`,
          choices: ch,
        };
      },
    },

    postdoc_end: {
      minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        return {
          title: '博士后合同到期', portrait: { member: m.id },
          text: `${U.esc(m.name)} 的博士后合同快到期了。${U.esc(sn(m.name))}在这里发表了 ${m.pubs} 篇论文（A 类 ${m.pubsA} 篇）。`,
          choices: [
            { label: '续约一年', hint: `继续支付工资 ${money(g, S().salary(g, m))}/月`, apply: g => { m.endDay = g.day + 360; S().addMood(m, 5); } },
            { label: '祝前程似锦', hint: '博后离开，去找教职或工作', def: true, apply: g => { S().graduate(g, m); } },
          ],
        };
      },
    },

    // ================= 随机事件 =================
    intern: {
      weight: 3, cd: 60, minor: true,
      ctx: g => {
        const mth = G().month(g);
        if (mth < 2 || mth > 4) return null;
        const yr = G().calYear(g);
        const c = activeOf(g, m => m.role === 'phd' && S().memberYears(g, m) >= 1 && m.internYear !== yr);
        if (!c.length) return null;
        const goalW = { industry: 1.8, quant: 1.8, startup: 1.4, academia: 0.6, undecided: 1 };
        const m = U.weighted(c, x => S().tMul(x, 'intern') * (goalW[x.bio && x.bio.goal] || 1));
        return { mid: m.id, company: U.pick(G().region(g).companies) };
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const goal = m.bio ? RS.GOALS[m.bio.goal] : '还没想好';
        return {
          title: '暑期实习邀请', portrait: { member: m.id },
          text: `${U.esc(m.name)} 拿到了 <b>${c.company}</b> 的暑期实习 offer，想去实习三个月。<span class="dim">（${U.esc(sn(m.name))}的职业理想：${goal}）</span><br><span class="dim">实习期间不用你发工资，但也不会干实验室的活。</span>`,
          choices: [
            { label: '去吧，见见世面', hint: '离开 90 天 · 回来编程 +4 · 心情 +20 · 信任 +6', def: true,
              apply: g => { m.status = 'intern'; m.awayUntil = g.day + 90; m.awayWhy = c.company + '实习'; m.internYear = G().calYear(g); S().addMood(m, 20); S().addTrust(m, 6); S().story(g, m, `去 ${c.company} 暑期实习`); G().log(g, `${m.name} 去 ${c.company} 实习了`, 'info'); } },
            { label: '只能远程兼职', hint: '90 天内效率 -30% · 心情 +5', apply: g => { m.remoteUntil = g.day + 90; m.internYear = G().calYear(g); S().addMood(m, 5); S().addTrust(m, 1); } },
            { label: '不行，论文要紧', hint: '心情 -12 · 信任 -10', apply: g => { S().addMood(m, -12); S().addTrust(m, -10); m.internYear = G().calYear(g); } },
          ],
        };
      },
    },

    poach: {
      weight: 1, cd: 200,
      ctx: g => {
        const c = activeOf(g, m => (m.role === 'phd' && S().memberYears(g, m) >= 2.5 && m.pubsA >= 1) || m.role === 'postdoc');
        if (!c.length) return null;
        const goalW = { industry: 1.5, quant: 1.5, startup: 1.3, academia: 0.6, undecided: 1 };
        const m = U.weighted(c, x => S().tMul(x, 'intern') * (1 + x.pubsA) * (goalW[x.bio && x.bio.goal] || 1));
        const trust = m.trust == null ? 55 : m.trust;
        const goalB = { academia: 0.15, industry: -0.1, quant: -0.1, startup: -0.05, undecided: 0 }[m.bio && m.bio.goal] || 0;
        return { mid: m.id, company: U.pick(G().region(g).companies), chance: U.clamp(0.3 + m.mood / 250 + (trust - 50) / 150 + S().tAdd(m, 'academia') + goalB, 0.15, 0.9) };
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const leave = g => { S().removeMember(g, m, 'poached', c.company); G().log(g, `${m.name} 加入了 ${c.company}`, 'bad'); };
        const ch = [
          { label: '动之以情，晓之以理', hint: `你的精力 -8 · 成功率约 ${U.pct(c.chance)}（取决于心情、信任和 TA 的职业理想）`, def: true,
            apply: g => { S().addEnergy(g, -8); if (Math.random() < c.chance) { S().addMood(m, 8); S().addTrust(m, 5); S().story(g, m, `拒绝了 ${c.company} 的高薪，留在实验室`); G().log(g, `${m.name} 被你说服，决定留下来`, 'good'); } else leave(g); } },
        ];
        if (m.funding === 'ra') ch.push({ label: '提高补贴 30% 挽留', hint: '每月开销增加 · 成功率约 85% · 信任 +8',
          apply: g => { m.salaryMult *= 1.3; if (Math.random() < 0.85) { S().addMood(m, 12); S().addTrust(m, 8); S().story(g, m, `拒绝了 ${c.company} 的高薪，留在实验室`); G().log(g, `${m.name} 决定留下来`, 'good'); } else leave(g); } });
        ch.push({ label: '尊重选择，祝福 TA', hint: '学生离开 · 将来可能回馈实验室', apply: leave });
        return {
          title: '大厂挖人', portrait: { member: m.id },
          text: `<b>${c.company}</b> 给 ${U.esc(m.name)} 开出了一个难以拒绝的 offer，想让${U.esc(sn(m.name))}${m.role === 'phd' ? '直接退学' : '马上'}入职。${U.esc(sn(m.name))}有些心动……`,
          choices: ch,
        };
      },
    },

    scooped: {
      weight: g => 1.2 * S().areaHeat(g), cd: 150,
      ctx: g => {
        const c = g.projects.filter(p => p.phase === 'exp' || (p.phase === 'idea' && p.prog > p.need.idea * 0.5));
        if (!c.length) return null;
        return { pid: U.weighted(c, x => S().heat(g, x.sub)).id };
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || !S().WORK_PHASES.includes(p.phase)) return null;
        const lead = M(g, p.lead);
        return {
          title: '撞车了！', portrait: lead ? { member: lead.id } : { icon: 'paper' },
          text: `arXiv 上刚刚挂出一篇论文，和你们正在做的《${U.esc(p.title)}》几乎一模一样！${lead ? U.esc(sn(lead.name)) + '盯着屏幕发呆。' : ''}`,
          choices: [
            { label: '换个角度继续做', hint: '当前阶段进度减半 · 论文质量 +1', def: true, apply: g => { p.prog *= 0.5; p.bonus += 1; g.flags.scooped = true; } },
            { label: '加速抢发', hint: '30 天内效率 ×1.6 · 论文质量 -5 · 参与者心情 -8',
              apply: g => { p.rush = 30; p.bonus -= 5; [p.lead].concat(p.helpers).forEach(id => S().addMood(M(g, id), -8)); g.flags.scooped = true; } },
            { label: '放弃这个课题', hint: '课题作废，学生重新选题 · 心情 -10',
              apply: g => { S().addMood(lead, -10); S().abandonProject(g, p, '因撞车被放弃'); g.flags.scooped = true; } },
          ],
        };
      },
    },

    server_crash: {
      weight: g => (RS.G.computeUnits(g) > 0 ? 1 : 0), cd: 300,
      ctx: g => ({ cost: Math.round(5000 * G().region(g).ppp) }),
      instant: g => {
        if (!S().facilityTotals(g).backup) return false;
        G().log(g, '服务器硬盘坏了一块，好在有 NAS 备份，数据毫发无损', 'info');
        return true;
      },
      build: (g, c) => {
        const exps = g.projects.filter(p => p.phase === 'exp');
        return {
          title: '服务器硬盘坏了！', portrait: { icon: 'gpu' },
          text: `机房传来一阵异响——服务器的硬盘坏了。${exps.length ? exps.length + ' 个正在做实验的课题，数据可能全丢了。' : '还好目前没有正在跑的实验。'}<br><span class="dim">（买一台备份 NAS 就不怕这种事了）</span>`,
          choices: [
            { label: '花钱找数据恢复', hint: `经费 -${money(g, c.cost)}，数据救回来`, def: true, disabled: g.funds < c.cost ? '经费不足' : null, apply: g => S().spend(g, c.cost, 'misc') },
            { label: '认了，重跑实验', hint: '实验阶段的课题进度 -40%', apply: g => { exps.forEach(p => { p.prog *= 0.6; }); S().labMood(g, -4); } },
          ],
        };
      },
    },

    pc_invite: {
      weight: g => (g.rep >= 15 ? 2 : 0), cd: 120, minor: true,
      ctx: g => {
        const vs = S().venuesFor(g).filter(v => v.tier === 'A' && v.type === 'conf');
        return vs.length ? { v: U.pick(vs).id } : null;
      },
      build: (g, c) => {
        const v = RS.VENUES[c.v];
        return {
          title: '程序委员会邀请', portrait: { icon: 'mail' },
          text: `<b>${v.name}</b> 邀请你担任今年的程序委员会委员（PC Member），需要审十几篇稿子、参加线上讨论。`,
          choices: [
            { label: '接受，为社区做贡献', hint: '声望 +1.5 · 人脉 +1 · 半年内每天精力 -0.12', def: g.pi.energy > 40,
              apply: g => { S().addRep(g, 1.5); g.pi.stats.network = Math.min(100, g.pi.stats.network + 1); g.services.push({ name: v.name + ' PC', until: g.day + 180 }); } },
            { label: '婉拒', hint: '没有影响', def: g.pi.energy <= 40, apply: nop },
          ],
        };
      },
    },

    keynote: {
      weight: g => (g.rep >= 150 ? 1 : 0), cd: 240, minor: true,
      ctx: g => ({ v: U.pick(S().venuesFor(g).filter(v => v.type === 'conf')).id }),
      build: (g, c) => ({
        title: '特邀报告', portrait: { icon: 'star' },
        text: `<b>${RS.VENUES[c.v].name}</b> 邀请你做大会特邀报告（Keynote），主办方承担全部差旅。`,
        choices: [
          { label: '欣然前往', hint: '声望 +6 · 人脉 +3 · 精力 -6', def: true, apply: g => { S().addRep(g, 6); g.pi.stats.network = Math.min(100, g.pi.stats.network + 3); S().addEnergy(g, -6); } },
          { label: '太忙了，婉拒', hint: '没有影响', apply: nop },
        ],
      }),
    },

    collab: {
      weight: g => (g.rep >= 25 ? 1.5 : 0), cd: 200, minor: true,
      ctx: g => {
        const c = g.projects.filter(p => p.phase === 'idea' || p.phase === 'exp');
        if (!c.length) return null;
        return { pid: U.pick(c).id, who: U.pick(['MIT 的 K 教授', '图灵奖得主 L 教授', '工业界大牛 D 博士', '隔壁系的 W 教授', '欧洲名校的 M 教授', '你的博士导师', '你的博士同门 Z 教授']) };
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || !S().WORK_PHASES.includes(p.phase) || p.collab) return null;
        return {
          title: '合作邀请', portrait: { icon: 'people' },
          text: `<b>${c.who}</b> 对你们的课题《${U.esc(p.title)}》很感兴趣，希望一起合作。`,
          choices: [
            { label: '合作共赢', hint: '这篇论文质量 +5 · 人脉 +2 · 精力 -4', def: true,
              apply: g => { p.collab = { who: c.who, bonus: 5 }; g.pi.stats.network = Math.min(100, g.pi.stats.network + 2); S().addEnergy(g, -4); } },
            { label: '婉拒，自己做', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    media: {
      weight: g => (g.papers.some(p => p.cites >= 80 || p.best) ? 1 : 0), cd: 300, minor: true,
      ctx: g => {
        const c = g.papers.filter(p => (p.cites >= 80 || p.best) && !p.retracted);
        return c.length ? { pid: U.pick(c).id } : null;
      },
      build: (g, c) => {
        const pa = g.papers.find(p => p.id === c.pid);
        if (!pa) return null;
        return {
          title: '媒体采访', portrait: { icon: 'mail' },
          text: `一家科技媒体想就你们的论文《${U.esc(pa.title)}》做个专访。`,
          choices: [
            { label: '接受采访', hint: '声望 +2 · 精力 -3 · 这篇论文引用速度 +15%', def: true, apply: g => { S().addRep(g, 2); S().addEnergy(g, -3); pa.rate *= 1.15; } },
            { label: '低调做人', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    viral: {
      weight: g => (g.papers.length ? 0.8 : 0), cd: 300,
      ctx: g => {
        const c = g.papers.filter(p => g.day - p.day < 540 && p.tier !== 'P' && !p.viral && !p.retracted);
        return c.length ? { pid: U.weighted(c, p => p.q).id } : null;
      },
      instant: (g, c) => {
        const pa = g.papers.find(p => p.id === c.pid);
        if (!pa) return true;
        pa.viral = true;
        pa.rate *= 3;
        g.flags.viral = true;
        S().addRep(g, 3);
        G().log(g, `《${S().short(pa.title)}》在社交媒体上爆火了！转发破万，引用速度暴涨`, 'gold');
        RS.bus.emit('toast', { text: '论文出圈了！引用速度 ×3', kind: 'gold' });
        return true;
      },
    },

    committee: {
      weight: 1, cd: 300, minor: true,
      ctx: () => ({ name: U.pick(['招生委员会', '课程委员会', '研究生学位委员会', '人才引进委员会', '实验室安全委员会', '本科教学督导组']) }),
      build: (g, c) => ({
        title: '学院服务', portrait: { icon: 'book' },
        text: `系主任请你担任<b>${c.name}</b>委员，任期一年。<br><span class="dim">“年轻人多为学院做点贡献嘛。”</span>`,
        choices: [
          { label: '服从安排', hint: '声望 +1 · 一年内每天精力 -0.12', def: true, apply: g => { S().addRep(g, 1); g.services.push({ name: c.name, until: g.day + 360 }); } },
          { label: '找借口推掉', hint: g.pi.tenured ? '没有影响' : '系主任对你印象变差（声望 -1）', apply: g => { if (!g.pi.tenured) S().addRep(g, -1); } },
        ],
      }),
    },

    wedding: {
      weight: g => (g.members.some(m => m.role === 'phd' || m.role === 'postdoc') ? 0.6 : 0), cd: 360, minor: true,
      ctx: g => {
        const c = g.members.filter(m => m.role === 'phd' || m.role === 'postdoc');
        return c.length ? { mid: U.pick(c).id } : null;
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        return {
          title: '喜事临门', portrait: { member: m.id },
          text: `${U.esc(m.name)} 要结婚了！${U.esc(sn(m.name))}给实验室每个人都发了喜糖。`,
          choices: [
            { label: '包个大红包', hint: '心情 +15 · 全组心情 +3（红包你自己掏）', def: true, apply: g => { S().addMood(m, 15); S().labMood(g, 3); } },
            { label: '送上真诚的祝福', hint: '心情 +5', apply: () => S().addMood(m, 5) },
          ],
        };
      },
    },

    party: {
      weight: g => (G().month(g) === 12 && g.members.length >= 2 ? 6 : 0), cd: 300, minor: true,
      ctx: () => ({}),
      build: g => {
        const ppp = G().region(g).ppp, n = g.members.length;
        const big = Math.round(120 * n * ppp), small = Math.round(40 * n * ppp);
        return {
          title: '年终聚餐', portrait: { icon: 'heart' },
          text: '又到年底了，大家辛苦了一年。要不要组织一次实验室聚餐？',
          choices: [
            { label: '豪华大餐！', hint: `经费 -${money(g, big)} · 全组心情 +12`, disabled: g.funds < big ? '经费不足' : null, apply: g => { S().spend(g, big, 'welfare'); S().labMood(g, 12); } },
            { label: '简单吃个火锅', hint: `经费 -${money(g, small)} · 全组心情 +6`, def: true, apply: g => { S().spend(g, small, 'welfare'); S().labMood(g, 6); } },
            { label: '今年就算了', hint: '全组心情 -3', apply: g => S().labMood(g, -3) },
          ],
        };
      },
    },

    cat_chaos: {
      weight: g => (g.facilities.cat ? 1.5 : 0), cd: 90,
      ctx: () => ({ r: Math.random() }),
      instant: (g, c) => {
        const act = g.projects.filter(p => S().WORK_PHASES.includes(p.phase));
        if (c.r < 0.4 && act.length) {
          const p = U.pick(act);
          p.prog += 5;
          G().log(g, `实验室的猫踩过《${S().short(p.title)}》作者的键盘，居然意外修好了一个 bug`, 'good');
        } else if (c.r < 0.7) {
          S().labMood(g, 3);
          G().log(g, '实验室的猫在组会上睡着了，打呼噜的声音让大家笑成一团', 'good');
        } else {
          G().log(g, '实验室的猫把咖啡打翻在了键盘上……还好不是服务器', 'info');
        }
        return true;
      },
    },

    review_req: {
      weight: g => (g.rep >= 8 ? 1.5 : 0), cd: 90, minor: true,
      ctx: g => ({ v: U.pick(S().venuesFor(g)).id }),
      build: (g, c) => {
        const v = RS.VENUES[c.v];
        const phd = activeOf(g, m => m.role === 'phd');
        return {
          title: '审稿邀请', portrait: { icon: 'mail' },
          text: `<b>${v.name}</b> 的编辑 / AC 发来邮件，请你审 3 篇稿子。`,
          choices: [
            { label: '认真审完', hint: '精力 -4 · 声望 +0.5 · 写作 +0.5', def: true,
              apply: g => { S().addEnergy(g, -4); S().addRep(g, 0.5); g.pi.stats.writing = Math.min(100, g.pi.stats.writing + 0.5); } },
            { label: '交给博士生审', hint: '学生写作 +1 · 心情 -3', disabled: phd.length ? null : '组里没有博士生',
              apply: () => { const m = U.pick(phd); if (m) { S().bumpStat(m, 'write', 1); S().addMood(m, -3); } } },
            { label: '婉拒', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    tech_transfer: {
      weight: g => (g.rep >= 80 && g.papers.length >= 5 ? 0.6 : 0), cd: 500, minor: true,
      ctx: g => ({ co: U.pick(G().region(g).companies), v: Math.round(60000 * G().region(g).ppp * U.range(0.7, 1.5)) }),
      build: (g, c) => ({
        title: '技术转化', portrait: { icon: 'money' },
        text: `<b>${c.co}</b> 想获得你们一项研究成果的专利授权，开价 <b>${money(g, c.v)}</b>。`,
        choices: [
          { label: '签授权协议', hint: `经费 +${money(g, c.v)}`, def: true, apply: g => S().earn(g, c.v, 'transfer') },
          { label: '直接开源，造福社区', hint: '声望 +4', apply: g => S().addRep(g, 4) },
        ],
      }),
    },

    sabbatical: {
      weight: g => (g.pi.tenured && (g.flags.lastSabbatical || -9999) + 6 * 360 < g.day && G().careerYear(g) >= 8 ? 0.8 : 0), cd: 720,
      ctx: g => ({ co: U.pick(G().region(g).companies), v: Math.round(120000 * G().region(g).ppp) }),
      build: (g, c) => ({
        title: '学术休假', portrait: { pi: true },
        text: `你已经连续工作很多年了，可以申请一年的学术休假（Sabbatical）。<b>${c.co}</b> 邀请你去做访问科学家。`,
        choices: [
          { label: '去大厂访问一年', hint: `实验室获得 ${money(g, c.v)} 合作经费 · 人脉 +8 · 精力回满 · 一年内无法亲自指导学生`,
            apply: g => { S().earn(g, c.v, 'gift'); g.pi.stats.network = Math.min(100, g.pi.stats.network + 8); S().addEnergy(g, 100); g.flags.sabbaticalUntil = g.day + 360; g.flags.lastSabbatical = g.day; G().milestone(g, `前往 ${c.co} 学术休假一年`); } },
          { label: '在家休养一阵', hint: '精力回满', def: true, apply: g => { S().addEnergy(g, 100); g.flags.lastSabbatical = g.day; } },
          { label: '不休了，学生需要我', hint: '没有影响', apply: nop },
        ],
      }),
    },

    visitor: {
      weight: g => (g.members.length < RS.G.desks(g) ? 1 : 0.2), cd: 240, minor: true,
      ctx: g => ({ cand: S().genCandidate(g, 'visit') }),
      build: (g, c) => {
        const full = g.members.length >= G().desks(g);
        return {
          title: '访问学生申请', portrait: { icon: 'people' },
          text: `${g.region === 'us' ? '一位由国家留学基金委（CSC）资助的博士生' : '一位海外高校的博士生'} <b>${U.esc(c.cand.name)}</b>（${c.cand.school}）想来你的实验室访问一年，费用自理。`,
          choices: [
            { label: '欢迎！', hint: full ? '工位已满，会有点挤' : '不用发工资的帮手', def: !full, apply: g => S().addMember(g, S().memberFromCandidate(g, c.cand, g.day)) },
            { label: '婉拒', hint: '没有影响', def: full, apply: nop },
          ],
        };
      },
    },

    ug_walkin: {
      weight: g => (g.members.length < RS.G.desks(g) ? 1.2 : 0.2), cd: 180, minor: true,
      ctx: g => ({ cand: Object.assign(S().genCandidate(g, 'ug', 4, { own: true }), { from: '读了你的论文，主动敲门加入' }) }),
      build: (g, c) => {
        const full = g.members.length >= G().desks(g);
        return {
          title: '有人敲门', portrait: { icon: 'people' },
          text: `一位叫 <b>${U.esc(c.cand.name)}</b> 的本校本科生（${U.esc(c.cand.school)} · ${U.esc(c.cand.bio ? c.cand.bio.major : '计算机')}专业）敲开了你的门：“老师，我读了您的论文，想跟着您做科研！”`,
          choices: [
            { label: '收下这个学生', hint: full ? '工位已满，会有点挤' : '本科生不用发工资', def: !full, apply: g => S().addMember(g, S().memberFromCandidate(g, c.cand, g.day)) },
            { label: '婉拒', hint: '没有影响', def: full, apply: nop },
          ],
        };
      },
    },

    bold_idea: {
      weight: 1, cd: 200, minor: true,
      ctx: g => {
        const c = g.projects.filter(p => p.phase === 'idea' && !p.bold && RS.G.member(g, p.lead));
        return c.length ? { pid: U.pick(c).id } : null;
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'idea') return null;
        const m = M(g, p.lead);
        if (!m) return null;
        return {
          title: '一个大胆的想法', portrait: { member: m.id },
          text: `${U.esc(m.name)} 兴奋地跑进你的办公室：“老师，我想到一个非常大胆的点子！如果做成了绝对能中顶会，但实验量会大很多……”`,
          choices: [
            { label: '支持你，放手去做！', hint: '新意大幅提升 · 实验工作量 +40% · 心情 +8', def: true, apply: () => { p.bold = true; S().addMood(m, 8); } },
            { label: '还是稳一点吧', hint: '心情 -4', apply: () => S().addMood(m, -4) },
          ],
        };
      },
    },

    gpu_fight: {
      weight: g => (G().area(g).compute >= 0.3 && g.members.filter(m => m.role === 'phd').length >= 2 ? 1 : 0), cd: 200, minor: true,
      ctx: g => {
        const c = U.sample(activeOf(g, m => m.role === 'phd'), 2);
        return c.length === 2 ? { a: c[0].id, b: c[1].id } : null;
      },
      build: (g, c) => {
        const a = M(g, c.a), b = M(g, c.b);
        if (!a || !b) return null;
        const ws = G().gpuSpec(g, 'ws');
        const price = S().gpuPrice(g, ws);
        const canBuy = S().gpuAvailable(g).includes(ws);
        return {
          title: '抢卡大战', portrait: { member: a.id },
          text: `${U.esc(a.name)} 和 ${U.esc(b.name)} 因为抢 GPU 吵起来了！一个说自己的实验更急，另一个说自己先排的队。`,
          choices: [
            { label: `再买一台${ws.name}`, hint: `经费 -${money(g, price)} · 两人心情 +5`, disabled: !canBuy ? '这款已经停产了' : g.funds < price ? '经费不足' : null,
              apply: g => { if (!S().buyGpu(g, 'ws')) { S().addMood(a, 5); S().addMood(b, 5); } } },
            { label: '排个使用时间表', hint: '两人心情 -2，公平公正', def: true, apply: () => { S().addMood(a, -2); S().addMood(b, -2); } },
            { label: `优先给${sn(a.name)}`, hint: `${sn(a.name)}心情 +4 · ${sn(b.name)}心情 -8`, apply: () => { S().addMood(a, 4); S().addMood(b, -8); } },
          ],
        };
      },
    },

    bug_found: {
      weight: g => (g.projects.some(p => p.phase === 'review') ? 0.7 : 0), cd: 300,
      ctx: g => {
        const c = g.projects.filter(p => p.phase === 'review' && !p.fake);
        return c.length ? { pid: U.pick(c).id } : null;
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'review') return null;
        const lead = M(g, p.lead);
        return {
          title: '代码里有 Bug！', portrait: lead ? { member: lead.id } : { icon: 'warn' },
          text: `${lead ? U.esc(lead.name) : '学生'}紧张地告诉你：已经投出去的《${U.esc(p.title)}》实验代码里有个 bug，修复之后效果会变差不少……`,
          choices: [
            { label: '撤稿，修好再投', hint: '论文质量 -3 · 学生心情 -5 · 要花时间修改 · 问心无愧', def: true,
              apply: g => { p.q -= 3; S().addMood(lead, -5); G().log(g, `《${S().short(p.title)}》撤稿修复 bug`, 'info'); S().startRevision(g, p); } },
            { label: '装作没看见', hint: '暂时没有影响……', apply: () => { p.fake = true; } },
          ],
        };
      },
    },

    gpu_market: {
      weight: g => (G().area(g).compute >= 0.3 ? 0.8 : 0), cd: 360,
      ctx: () => ({ up: U.chance(0.6) }),
      instant: (g, c) => {
        g.flags.gpuPriceMult = c.up ? 1.35 : 0.75;
        g.flags.gpuPriceUntil = g.day + 180;
        const t = c.up ? '显卡缺货，GPU 价格上涨 35%（持续半年）' : '新品发布，GPU 价格下降 25%（持续半年）';
        G().log(g, t, c.up ? 'bad' : 'good');
        RS.bus.emit('toast', { text: t, kind: c.up ? 'bad' : 'good' });
        return true;
      },
    },

    donation: {
      weight: g => (g.rep >= 60 && G().area(g).compute >= 0.3 ? 0.5 : 0), cd: 720,
      ctx: g => ({ co: U.pick(G().region(g).companies) }),
      instant: (g, c) => {
        const s = S().bestGpu(g);
        g.gpus[s.id] = (g.gpus[s.id] || 0) + 1;
        G().log(g, `${c.co} 向实验室捐赠了一台 ${s.name}！`, 'gold');
        RS.bus.emit('toast', { text: `获赠 ${s.name}（+${s.units} 算力）`, kind: 'gold' });
        return true;
      },
    },

    alumni_gift: {
      weight: g => (alumniIndustry(g).length ? 0.6 : 0), cd: 500,
      ctx: g => {
        const a = U.pick(alumniIndustry(g));
        if (!a) return null;
        const rich = /创办|量化/.test(a.dest || '') ? 2.5 : 1;
        return { name: a.name, v: Math.round(15000 * G().region(g).ppp * U.range(0.8, 2) * rich) };
      },
      instant: (g, c) => {
        S().earn(g, c.v, 'gift');
        G().log(g, `毕业生 ${c.name} 在公司里促成了一笔给实验室的捐赠：${money(g, c.v)}`, 'gold');
        RS.bus.emit('toast', { text: `校友捐赠 +${money(g, c.v)}`, kind: 'gold' });
        return true;
      },
    },

    industry_contract: {
      weight: g => (g.grants.filter(x => x.kind === 'contract').length >= 2 ? 0 : 0.7 * (G().perk(g).contract || 1)), cd: 300,
      ctx: g => ({ company: U.pick(G().region(g).companies), mult: U.range(0.8, 1.4) }),
      build: (g, c) => {
        const def = G().grantDef(g, 'contract');
        const amount = Math.round((def.amount * c.mult) / 1000) * 1000;
        const n = g.grants.filter(x => x.kind === 'contract').length;
        return {
          title: g.region === 'cn' ? '横向课题' : '企业合作项目', portrait: { icon: 'money' },
          text: `<b>${c.company}</b> 希望和你签一个为期两年的合作项目，经费 <b>${money(g, amount)}</b>。不过需要学生投入时间做交付，全组科研效率会下降约 7%。${n ? `<br><span class="dim">（你已经有 ${n} 个企业项目在执行）</span>` : ''}`,
          choices: [
            { label: '签！', hint: `经费 +${money(g, amount)}（按月拨付）· 全组效率 -7%`, def: true, apply: g => S().awardGrant(g, def, amount) },
            { label: '不签，专心科研', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    darpa: {
      weight: g => (g.region === 'us' && g.rep >= 50 && ['ml', 'cv', 'nlp', 'sys', 'sec', 'robo', 'arch'].includes(g.areaId) ? 0.6 : 0), cd: 500,
      ctx: g => (RS.Sys.grantElig(g, RS.G.grantDef(g, 'darpa')) ? null : {}),
      build: g => {
        const def = G().grantDef(g, 'darpa');
        if (S().grantElig(g, def)) return null;
        const dl = g.day + 45;
        return {
          title: 'DARPA 项目征集', portrait: { icon: 'money' },
          text: `DARPA 发布了一个新的项目征集（BAA），方向和你的研究高度契合！总额 <b>${money(g, def.amount)}</b>，为期 ${def.months / 12} 年。<br>截止日期：${G().dateStr(dl)}`,
          choices: [
            { label: '全力申请', hint: `精力 -${def.effort}（分摊到 45 天）· 成功率约 ${U.pct(S().grantProb(g, def, 'full'))}`, def: true, apply: g => { S().applyGrant(g, 'darpa', 'full', dl); } },
            { label: '正常申请', hint: `精力 -${def.effort / 2} · 成功率约 ${U.pct(S().grantProb(g, def, 'normal'))}`, apply: g => { S().applyGrant(g, 'darpa', 'normal', dl); } },
            { label: '不申请', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    student_award: {
      weight: g => (g.members.some(m => m.role === 'phd' && (m.firstA || 0) >= 2 && m.funding === 'ra') ? 0.6 : 0), cd: 360,
      ctx: g => {
        const c = g.members.filter(m => m.role === 'phd' && (m.firstA || 0) >= 2 && m.funding === 'ra');
        return c.length ? { mid: U.pick(c).id } : null;
      },
      instant: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return true;
        m.funding = 'fellow';
        m.fellowUntil = g.day + 2 * 360;
        S().addMood(m, 15);
        S().addRep(g, 1);
        S().story(g, m, '获得企业博士生奖学金');
        G().log(g, `${m.name} 获得了企业博士生奖学金！接下来两年不用你发工资了`, 'gold');
        RS.bus.emit('toast', { text: `${m.name} 获得奖学金`, kind: 'gold' });
        return true;
      },
    },

    pi_family: {
      weight: g => (g.pi.energy < 50 ? 1 : 0.3), cd: 300, minor: true,
      ctx: () => ({}),
      build: g => ({
        title: '家人的抱怨', portrait: { pi: true },
        text: '“你已经三个周末没回家吃饭了。”家人在电话那头叹了口气。',
        choices: [
          { label: '陪家人度假一周', hint: '精力 +25 · 这一周学生们没人管', def: g.pi.energy < 60, apply: g => { S().addEnergy(g, 25); g.flags.restUntil = g.day + 7; } },
          { label: '这周末一定回去', hint: '精力 +8', def: g.pi.energy >= 60, apply: g => S().addEnergy(g, 8) },
        ],
      }),
    },

    reimburse: {
      weight: g => (g.region === 'cn' ? 1.2 : 0), cd: 150, minor: true,
      ctx: () => ({}),
      build: g => {
        const ms = activeOf(g, m => m.role !== 'postdoc');
        return {
          title: '报销噩梦', portrait: { icon: 'paper' },
          text: '财务处又把你的报销单退回来了：发票抬头少了一个字，附件缺一张验收单，还要补三个签字……',
          choices: [
            { label: '亲自跑一趟财务处', hint: '精力 -5', def: true, apply: g => S().addEnergy(g, -5) },
            { label: '让学生去跑', hint: '随机一名学生心情 -6', disabled: ms.length ? null : '组里没人', apply: () => S().addMood(U.pick(ms), -6) },
          ],
        };
      },
    },

    twitter: {
      weight: g => (g.rep >= 40 && g.papers.length ? 0.7 : 0), cd: 300, minor: true,
      ctx: () => ({ good: U.chance(0.55) }),
      build: (g, c) => ({
        title: '网络争议', portrait: { icon: 'warn' },
        text: '有人在社交媒体上发长文，阴阳怪气地质疑你们最近的一篇论文“只是调参调出来的”，转发还不少。',
        choices: [
          { label: '发文逐条回应', hint: '精力 -3 · 结果难料',
            apply: g => { S().addEnergy(g, -3); if (c.good) { S().addRep(g, 2); G().log(g, '你的回应条理清晰，赢得了不少同行的支持', 'good'); } else { S().addRep(g, -2); G().log(g, '回应引发了更大的争论……', 'bad'); } } },
          { label: '清者自清，不理他', hint: '没有影响', def: true, apply: nop },
        ],
      }),
    },

    coffee_broken: {
      weight: g => (g.facilities.coffee ? 0.6 : 0), cd: 360, minor: true,
      ctx: g => ({ cost: Math.round(250 * G().region(g).ppp) }),
      build: (g, c) => ({
        title: '咖啡机罢工了', portrait: { icon: 'coffee' },
        text: '咖啡机发出一声惨叫，然后就不动了。整个实验室陷入了恐慌。',
        choices: [
          { label: '马上修！', hint: `经费 -${money(g, c.cost)}`, def: true, disabled: g.funds < c.cost ? '经费不足' : null, apply: g => S().spend(g, c.cost, 'misc') },
          { label: '不修了，喝速溶吧', hint: '失去咖啡机 · 全组心情 -5', apply: g => { delete g.facilities.coffee; S().labMood(g, -5); } },
        ],
      }),
    },

    poach_pi: {
      weight: g => (g.rep >= 120 && g.pi.tenured ? 0.5 : 0), cd: 720,
      ctx: g => ({ univ: U.pick(G().region(g).univs), v: Math.round(G().tierCfg(g).startup * 0.5) }),
      build: (g, c) => ({
        title: '挖角', portrait: { icon: 'mail' },
        text: `<b>${c.univ}</b> 向你抛出了橄榄枝，开出了非常优厚的条件。你可以拿着这个 offer 和学院谈谈……`,
        choices: [
          { label: '拿 offer 和学院谈条件', hint: `学院给一笔留任经费 ${money(g, c.v)} · 声望 +2`, def: true, apply: g => { S().earn(g, c.v, 'dept'); S().addRep(g, 2); G().log(g, '学院为了留住你，追加了一笔经费', 'gold'); } },
          { label: '婉拒，这里就是我的家', hint: '全组心情 +5', apply: g => S().labMood(g, 5) },
        ],
      }),
    },

    proctor: {
      weight: g => (g.region === 'cn' && [1, 6, 12].includes(G().month(g)) ? 1.5 : 0), cd: 150,
      ctx: () => ({}),
      instant: g => { S().addEnergy(g, -5); G().log(g, '学院安排你监考 + 阅卷，改了三百份试卷，精力 -5', 'info'); return true; },
    },

    workshop_org: {
      weight: g => (g.rep >= 60 ? 0.6 : 0), cd: 360, minor: true,
      ctx: g => ({ v: U.pick(S().venuesFor(g).filter(v => v.type === 'conf')).id }),
      build: (g, c) => ({
        title: '组织研讨会', portrait: { icon: 'people' },
        text: `几位同行邀请你一起在 <b>${RS.VENUES[c.v].name}</b> 上组织一个 Workshop。`,
        choices: [
          { label: '一起组织', hint: '声望 +3 · 人脉 +3 · 三个月内每天精力 -0.12', def: true,
            apply: g => { S().addRep(g, 3); g.pi.stats.network = Math.min(100, g.pi.stats.network + 3); g.services.push({ name: 'Workshop 组织', until: g.day + 90 }); } },
          { label: '没空', hint: '没有影响', apply: nop },
        ],
      }),
    },

    open_source: {
      weight: g => (g.papers.length >= 2 ? 0.6 : 0), cd: 300,
      ctx: g => {
        const c = g.papers.filter(p => g.day - p.day < 720 && p.tier !== 'P' && !p.retracted);
        return c.length ? { pid: U.pick(c).id, stars: U.pick([1000, 2000, 5000, 10000]) } : null;
      },
      instant: (g, c) => {
        const pa = g.papers.find(p => p.id === c.pid);
        if (!pa) return true;
        pa.rate *= 1.3;
        S().addRep(g, 1 + c.stars / 5000);
        G().log(g, `《${S().short(pa.title)}》的开源代码在 GitHub 上收获了 ${c.stars / 1000}k star！`, 'good');
        return true;
      },
    },

    // 学生的日常：根据爱好生成一点生活气息
    hobby: {
      weight: g => (g.members.some(m => m.status === 'active' && m.bio && m.bio.hobbies && m.bio.hobbies.length) ? 1.5 : 0), cd: 40,
      ctx: g => {
        const c = activeOf(g, m => m.bio && m.bio.hobbies && m.bio.hobbies.length);
        if (!c.length) return null;
        const m = U.pick(c);
        return { mid: m.id, hobby: U.pick(m.bio.hobbies) };
      },
      instant: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return true;
        const act = RS.HOBBIES[c.hobby] || `享受了一下${c.hobby}`;
        S().addMood(m, 5);
        G().log(g, `${m.name}（爱好：${c.hobby}）${act}，心情不错`, 'info');
        return true;
      },
    },

    student_sick: {
      weight: 0.6, cd: 200, minor: true,
      ctx: g => {
        const c = activeOf(g);
        return c.length ? { mid: U.pick(c).id } : null;
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.status !== 'active') return null;
        return {
          title: '学生生病了', portrait: { member: m.id },
          text: `${U.esc(m.name)} 发烧了，还硬撑着来实验室跑实验。`,
          choices: [
            { label: '赶回家休息！', hint: '离开 7 天 · 心情 +10', def: true, apply: g => { m.status = 'away'; m.awayUntil = g.day + 7; m.awayWhy = '病假'; S().addMood(m, 10); } },
            { label: '轻伤不下火线', hint: '心情 -10', apply: () => S().addMood(m, -10) },
          ],
        };
      },
    },

    // ================= 随机事件（第二批）：署名、小组、学生、校园 =================

    // 署名之争：快写完的论文，第二作者的工作量不小
    author_dispute: {
      weight: g => (S().disputeCands(g).length ? 1.2 : 0), cd: 200,
      ctx: g => {
        const c = S().disputeCands(g);
        if (!c.length) return null;
        const x = U.pick(c);
        return { pid: x.p.id, a: x.a, b: x.b };
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.authorPlan || !(p.phase === 'write' || p.phase === 'ready')) return null;
        const a = M(g, c.a), b = M(g, c.b);
        if (!a || !b) return null;
        const ca = (p.contrib || {})[a.id] || 0, cb = (p.contrib || {})[b.id] || 0;
        const pa = Math.round((ca / (ca + cb || 1)) * 100);
        const close = cb >= ca * 0.75;
        const why = b.role === 'ug' ? '申请研究生需要一篇拿得出手的论文' : b.role === 'ms' ? '找工作想要一篇一作' : '毕业要看一作论文';
        return {
          title: '署名之争', portrait: { member: b.id },
          text: `《${U.esc(p.title)}》${p.phase === 'write' ? '快写完了' : '已经写完了'}。${U.esc(b.name)} 私下找到你：“这篇我做了不少实验，能不能给我共同一作？${why}……”<br><span class="dim">按实验记录，两人的工作量大约是 ${U.esc(sn(a.name))} ${pa}% : ${U.esc(sn(b.name))} ${100 - pa}%。</span>`,
          choices: [
            { label: '同意共同一作', hint: `两人都算一作 · ${sn(b.name)}心情 +6、信任 +3 · ${sn(a.name)}觉得功劳被分走：心情 -4`, def: close,
              apply: g => { p.authorPlan = [a.id, b.id]; S().addMood(b, 6); S().addTrust(b, 3); S().addMood(a, -4); S().addTrust(a, -1); S().story(g, b, `争取到了《${S().short(p.title)}》的共同一作`); } },
            { label: `按贡献来，${sn(a.name)}一作`, hint: `${sn(b.name)}二作：心情 -6、信任 -3 · ${sn(a.name)}信任 +2`, def: !close,
              apply: () => { p.authorPlan = [a.id]; S().addMood(b, -6); S().addTrust(b, -3); S().addTrust(a, 2); } },
            { label: `让 ${sn(b.name)} 当一作`, hint: `${sn(a.name)}心情 -12、信任 -8 · ${sn(b.name)}心情 +8、信任 +3`,
              apply: g => { p.authorPlan = [b.id]; S().addMood(a, -12); S().addTrust(a, -8); S().addMood(b, 8); S().addTrust(b, 3); S().story(g, a, `《${S().short(p.title)}》的一作让给了 ${b.name}`); } },
          ],
        };
      },
    },

    // 挂名请求
    guest_author: {
      weight: g => (g.projects.some(p => (p.phase === 'ready' || p.phase === 'review') && !p.guest) ? 0.5 : 0), cd: 400,
      ctx: g => {
        const c = g.projects.filter(p => (p.phase === 'ready' || p.phase === 'review') && !p.guest);
        if (!c.length) return null;
        const who = U.pick(g.region === 'cn'
          ? [['学院的一位领导', '某院领导'], ['合作单位的一位大佬', '合作单位 W 教授'], ['一位头衔很多的老教授', 'L 教授'], ['学校分管科研的副校长', '某副校长']]
          : [['系主任', 'Dept. Chair'], ['隔壁组的大牛教授', 'Prof. K'], ['合作公司的一位副总裁', 'VP Chen'], ['一位资深院士', 'Prof. H']]);
        return { pid: U.pick(c).id, who: who[0], as: who[1] };
      },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.guest || !(p.phase === 'ready' || p.phase === 'review')) return null;
        const lead = M(g, S().authorOrder(g, p).order[0]);
        const ln = lead ? sn(lead.name) : '一作';
        return {
          title: '挂名请求', portrait: { icon: 'mail' },
          text: `${c.who}委婉地表示，想在《${U.esc(p.title)}》上“挂个名”：“我的名字放上去，审稿人也会多看两眼嘛。”<br><span class="dim">这篇论文是 ${lead ? U.esc(lead.name) : '学生们'}一手做出来的。</span>`,
          choices: [
            { label: '婉拒，论文是学生做的', hint: `精力 -2（有点尴尬）· ${ln}信任 +4${g.pi.tenured ? '' : ' · 对方有点不高兴：声望 -1'}`, def: true,
              apply: g => { S().addEnergy(g, -2); S().addTrust(lead, 4); if (!g.pi.tenured) S().addRep(g, -1); } },
            { label: '加上吧，以后好办事', hint: `人脉 +3 · 这篇论文引用 +10% · ${ln}心情 -4、信任 -5`,
              apply: g => { p.guest = c.as; g.pi.stats.network = Math.min(100, g.pi.stats.network + 3); S().addMood(lead, -4); S().addTrust(lead, -5); G().log(g, `《${S().short(p.title)}》的作者列表里多了一位 ${c.as}`, 'info'); } },
          ],
        };
      },
    },

    // 想换组
    group_switch: {
      weight: g => (S().switchCands(g).length ? 0.9 : 0), cd: 150, minor: true,
      ctx: g => {
        const c = S().switchCands(g);
        if (!c.length) return null;
        const m = U.pick(c);
        return { mid: m.id, to: S().groupOfSub(g, S().interestOf(m)).id };
      },
      build: (g, c) => {
        const m = M(g, c.mid), to = S().group(g, c.to);
        if (!m || !to || S().inGroup(m, to.id)) return null;
        const from = S().memberGroups(g, m);
        const fromName = from.map(x => S().groupName(g, x)).join('、') || '未分组';
        const toName = S().groupName(g, to);
        const leads = S().leadsGroup(g, m);
        const full = (m.groups || []).length >= S().MAX_MEMBER_GROUPS;
        const ch = [
          { label: `同意转到「${toName}」`, hint: `${from.length ? `离开${fromName}${leads ? '（会卸任组长）' : ''} · ` : ''}心情 +8 · 信任 +3`, def: full,
            apply: g => {
              (m.groups || []).slice().forEach(id => S().setMemberGroup(g, m, id, false));
              S().setMemberGroup(g, m, to.id, true);
              S().addMood(m, 8); S().addTrust(m, 3);
              S().story(g, m, `转到了「${toName}」`);
              G().log(g, `${m.name} 转到了「${toName}」`, 'info');
            } },
        ];
        if (!full && from.length) {
          ch.push({ label: '两个组都参加', hint: `同时在${fromName}和${toName} · 心情 +5`, def: true,
            apply: g => { S().setMemberGroup(g, m, to.id, true); S().addMood(m, 5); G().log(g, `${m.name} 也加入了「${toName}」`, 'info'); } });
        }
        ch.push({ label: '先把手上的课题做完再说', hint: '心情 -4 · 信任 -2', apply: () => { S().addMood(m, -4); S().addTrust(m, -2); } });
        if (!ch.some(x => x.def)) ch[0].def = true;
        return {
          title: `${m.name} 想换个小组`, portrait: { member: m.id },
          text: `${U.esc(m.name)} 来找你：“老师，我还是对「${U.esc(S().subName(g, to.sub))}」最感兴趣，能不能去${U.esc(toName)}？”<br><span class="dim">TA 现在在：${U.esc(fromName)}</span>`,
          choices: ch,
        };
      },
    },

    // 迷上了新方向
    interest_change: {
      weight: g => (activeOf(g, m => m.role !== 'visit').length ? 0.8 : 0), cd: 200, minor: true,
      ctx: g => {
        const c = activeOf(g, m => m.role !== 'visit');
        if (!c.length) return null;
        const m = U.pick(c);
        // 多半是同一个方向里的相邻子方向，也可能跨到别的方向
        const it = S().interestOf(m);
        const cur = it && RS.SUBS[it];
        const s = U.weighted(G().area(g).subs.filter(x => x.id !== it), x => Math.pow(S().heat(g, x.id), 1.5) * (cur && x.topic === cur.topic ? 3 : 1));
        return s ? { mid: m.id, sid: s.id } : null;
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        const sid = G().asSub(g, c.sid || c.tid);
        if (!m || !m.bio || S().interestOf(m) === sid) return null;
        const t = G().sub(g, sid);
        const gr = S().groupOfSub(g, sid);
        const ch = [
          { label: '支持 TA 往这个方向发展', hint: `兴趣变成「${t.name}」· 心情 +5 · 信任 +2${gr ? `（可以加入${S().groupName(g, gr)}）` : ''}`, def: true,
            apply: g => { m.bio.interest = sid; S().addMood(m, 5); S().addTrust(m, 2); S().story(g, m, `迷上了「${t.name}」`); } },
        ];
        if (!gr && !S().canCreateGroup(g, sid)) {
          ch.push({ label: `干脆成立「${t.name}组」`, hint: 'TA 是第一个成员 · 心情 +8 · 信任 +4',
            apply: g => {
              if (S().canCreateGroup(g, sid)) return;
              m.bio.interest = sid;
              const ng = S().createGroup(g, sid);
              if ((m.groups || []).length >= S().MAX_MEMBER_GROUPS) S().setMemberGroup(g, m, m.groups[0], false);
              S().setMemberGroup(g, m, ng.id, true);
              S().addMood(m, 8); S().addTrust(m, 4);
              S().story(g, m, `牵头成立了「${S().groupName(g, ng)}」`);
            } });
        }
        ch.push({ label: '先专注眼前的方向', hint: '兴趣不变 · 心情 -3', apply: () => S().addMood(m, -3) });
        return {
          title: '迷上了新方向', portrait: { member: m.id },
          text: `${U.esc(m.name)} 最近一口气读了十几篇「${U.esc(S().dirName(g, sid))}」的论文，越看越着迷，跑来说想往这个方向发展。<br><span class="dim">TA 原来最想做的是「${U.esc(S().dirName(g, S().interestOf(m)))}」。</span>`,
          choices: ch,
        };
      },
    },

    // 组长有点撑不住了
    leader_burnout: {
      weight: g => {
        const ls = g.groups.map(gr => M(g, gr.lead)).filter(Boolean);
        return !ls.length ? 0 : ls.some(m => m.mood < 50) ? 1.5 : 0.3;
      },
      cd: 200,
      ctx: g => {
        const gs = g.groups.filter(gr => M(g, gr.lead));
        if (!gs.length) return null;
        return { gid: gs.reduce((a, b) => (M(g, b.lead).mood < M(g, a.lead).mood ? b : a)).id };
      },
      build: (g, c) => {
        const gr = S().group(g, c.gid);
        const m = gr && M(g, gr.lead);
        if (!m) return null;
        const cost = S().bonusCost(g, m);
        const n = Math.max(0, S().groupMembers(g, gr).length - 1);
        return {
          title: '组长有点撑不住了', portrait: { member: m.id },
          text: `「${U.esc(S().groupName(g, gr))}」组长 ${U.esc(m.name)} 最近黑眼圈很重：“又要带 ${n} 个师弟师妹，又要赶自己的论文，实在有点顾不过来了……”`,
          choices: [
            { label: '好好聊一聊', hint: '你的精力 -6 · 心情 +14 · 信任 +5', def: g.pi.energy >= 20, disabled: g.pi.energy < 6 ? '你自己也没精力了' : null,
              apply: g => { S().addEnergy(g, -6); S().addMood(m, 14); S().addTrust(m, 5); } },
            { label: '发一笔组长补贴', hint: `经费 -${money(g, cost)} · 心情 +12 · 信任 +3`, def: g.pi.energy < 20, disabled: g.funds < cost ? '经费不足' : null,
              apply: g => { S().spend(g, cost, 'welfare'); S().addMood(m, 12); S().addTrust(m, 3); } },
            { label: '卸下组长的担子', hint: '心情 +10 · 这个小组暂时没有组长（你要亲自协调）',
              apply: g => { S().setGroupLead(g, gr.id, null); S().addMood(m, 10); S().story(g, m, `卸任了「${S().groupName(g, gr)}」组长`); } },
          ],
        };
      },
    },

    // DDL 前抢算力
    compute_rush: {
      weight: g => (S().rushPair(g) ? 1 : 0), cd: 240,
      ctx: g => { const pr = S().rushPair(g); return pr ? { a: pr[0], b: pr[1] } : null; },
      build: (g, c) => {
        const A = S().group(g, c.a), B = S().group(g, c.b);
        if (!A || !B) return null;
        const R = G().region(g);
        const n = 4, cost = R.cloud.price * n;
        const mood = (gr, v) => S().groupMembers(g, gr).forEach(m => S().addMood(m, v));
        const prio = (X, Y) => g => {
          g.flags.prio = X.id; g.flags.prioUntil = g.day + 30;
          mood(X, 3); mood(Y, -4);
          G().log(g, `接下来一个月优先保证「${S().groupName(g, X)}」的算力`, 'info');
        };
        const rich = g.funds > cost * 8;
        return {
          title: 'DDL 前的算力争夺', portrait: { icon: 'gpu' },
          text: `截稿日越来越近，「${U.esc(S().groupName(g, A))}」和「${U.esc(S().groupName(g, B))}」的实验都在排队，服务器根本不够分。两边的人都来找你要卡。`,
          choices: [
            { label: `优先保证「${S().groupName(g, A)}」`, hint: '一个月内这个组算力 ×1.5、其他组 ×0.8 · 这组心情 +3，那组 -4', apply: prio(A, B) },
            { label: `优先保证「${S().groupName(g, B)}」`, hint: '一个月内这个组算力 ×1.5、其他组 ×0.8 · 这组心情 +3，那组 -4', apply: prio(B, A) },
            { label: `临时租 ${n} 份${R.cloud.name}`, hint: `经费 -${money(g, cost)} · 一个月内共享算力 +${R.cloud.units * n}`, def: rich, disabled: g.funds < cost ? '经费不足' : null,
              apply: g => { S().spend(g, cost, 'compute'); g.flags.tempUnits = R.cloud.units * n; g.flags.tempUntil = g.day + 30; } },
            { label: '一视同仁，按缺口分', hint: '两组心情 -1', def: !rich, apply: () => { mood(A, -1); mood(B, -1); } },
          ],
        };
      },
    },

    // 校内种子基金
    seed_grant: {
      weight: 0.6, cd: 360, minor: true,
      ctx: g => ({ v: Math.round((G().region(g).ppp * U.range(30000, 60000)) / 1000) * 1000, roll: Math.random() }),
      build: (g, c) => {
        const p = U.clamp(0.35 + g.rep / 400 + (g.pi.stats.writing - 50) / 150, 0.3, 0.85);
        return {
          title: '校内种子基金', portrait: { icon: 'money' },
          text: `学校设立了一批${g.region === 'cn' ? '交叉学科种子基金' : '内部种子基金（Seed Grant）'}，鼓励老师们探索新方向，每项 <b>${money(g, c.v)}</b>，评审很快。`,
          choices: [
            { label: '写个申请试试', hint: `精力 -8 · 成功率约 ${U.pct(p)}`, def: g.pi.energy > 35,
              apply: g => {
                S().addEnergy(g, -8);
                if (c.roll < p) {
                  S().earn(g, c.v, 'dept');
                  G().log(g, `校内种子基金获批：${money(g, c.v)}`, 'good');
                  RS.bus.emit('toast', { text: `种子基金 +${money(g, c.v)}`, kind: 'good' });
                } else G().log(g, '校内种子基金没有评上', 'bad');
              } },
            { label: '这次就算了', hint: '没有影响', def: g.pi.energy <= 35, apply: nop },
          ],
        };
      },
    },

    // 跨学科合作
    interdisc: {
      weight: g => (seniorOf(g).length >= 2 ? 0.6 : 0), cd: 400,
      ctx: g => {
        const c = seniorOf(g);
        if (c.length < 2) return null;
        // 派手上的课题进度最早期的人，损失最小
        const load = m => { const p = m.projectId && G().project(g, m.projectId); return p ? S().projectPct(p) : 0; };
        const m = c.reduce((a, b) => (load(b) < load(a) ? b : a));
        const x = U.pick(RS.CROSS);
        return { mid: m.id, who: x.who, title: U.pick(x.titles), prof: RS.randomName(g.region) };
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.status !== 'active') return null;
        const many = seniorOf(g).length >= 3;
        return {
          title: '跨学科合作', portrait: { icon: 'people' },
          text: `${U.esc(c.who)}的 ${U.esc(c.prof)} 教授想用 AI 方法解决他们领域的一个难题，希望你派一个学生过去合作两个月。<br><span class="dim">看下来 ${U.esc(m.name)} 手上的课题刚起步，走开影响最小。</span>`,
          choices: [
            { label: `派 ${sn(m.name)} 过去`, hint: 'TA 离开 60 天（自己的课题暂停）· 回来想法 +3 · 署名一篇对方牵头的交叉学科论文 · 声望 +1', def: many,
              apply: g => {
                m.status = 'away'; m.awayUntil = g.day + 60; m.awayWhy = `在${c.who}合作`;
                m.awayReward = { idea: 3, partner: c.who, paper: c.title, lead: `${c.prof}（${c.who}）` };
                S().addRep(g, 1);
                S().story(g, m, `去${c.who}做跨学科合作`);
                G().log(g, `${m.name} 去${c.who}做跨学科合作了`, 'info');
              } },
            { label: '组里实在抽不出人', hint: '没有影响', def: !many, apply: nop },
          ],
        };
      },
    },

    // 凌晨两点的实验室
    late_night: {
      weight: g => (seniorOf(g, m => m.projectId).length ? 0.9 : 0), cd: 120, minor: true,
      ctx: g => { const c = seniorOf(g, m => m.projectId); return c.length ? { mid: U.pick(c).id } : null; },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.status !== 'active') return null;
        const p = m.projectId ? G().project(g, m.projectId) : null;
        const working = p && S().WORK_PHASES.includes(p.phase);
        const cost = Math.round(15 * G().region(g).ppp);
        return {
          title: '凌晨两点的实验室', portrait: { member: m.id },
          text: `你半夜回办公室拿东西，发现 ${U.esc(m.name)} 还在${working && p.phase === 'write' ? '改论文' : working && p.phase === 'exp' ? '盯着训练曲线' : '对着白板画来画去'}，桌上摆着三罐空咖啡。`,
          choices: [
            { label: '赶 TA 回去睡觉', hint: '心情 +6 · 信任 +2', def: true, apply: () => { S().addMood(m, 6); S().addTrust(m, 2); } },
            { label: '点份夜宵一起吃', hint: `经费 -${money(g, cost)} · 心情 +8 · 信任 +3`, apply: g => { S().spend(g, cost, 'welfare'); S().addMood(m, 8); S().addTrust(m, 3); } },
            { label: '拍拍肩膀：加油！', hint: '课题进度 +5% · 心情 -4', disabled: working ? null : '手上没有在做的课题',
              apply: () => { if (working) p.prog = Math.min(p.need[p.phase] - 0.01, p.prog + p.need[p.phase] * 0.05); S().addMood(m, -4); } },
          ],
        };
      },
    },

    // 组会上吵起来了
    meeting_debate: {
      weight: g => (seniorOf(g, m => m.projectId).length >= 2 ? 1 : 0), cd: 150, minor: true,
      ctx: g => {
        const c = U.sample(seniorOf(g, m => m.projectId), 2);
        return c.length === 2 ? { a: c[0].id, b: c[1].id, method: U.pick(G().area(g).methods) } : null;
      },
      build: (g, c) => {
        const a = M(g, c.a), b = M(g, c.b);
        if (!a || !b) return null;
        const pa = a.projectId ? G().project(g, a.projectId) : null, pb = b.projectId ? G().project(g, b.projectId) : null;
        const bonus = (p, v) => { if (p && S().WORK_PHASES.includes(p.phase)) p.bonus += v; };
        return {
          title: '组会上吵起来了', portrait: { member: a.id },
          text: `组会上，${U.esc(a.name)} 坚持 ${U.esc(c.method)} 才是未来，${U.esc(b.name)} 觉得那只是炒作。两人越说越激动，大家都看向你。`,
          choices: [
            { label: `支持 ${sn(a.name)}`, hint: `${sn(a.name)}心情 +5、课题质量 +1.5 · ${sn(b.name)}心情 -6`, apply: () => { S().addMood(a, 5); bonus(pa, 1.5); S().addMood(b, -6); } },
            { label: `支持 ${sn(b.name)}`, hint: `${sn(b.name)}心情 +5、课题质量 +1.5 · ${sn(a.name)}心情 -6`, apply: () => { S().addMood(b, 5); bonus(pb, 1.5); S().addMood(a, -6); } },
            { label: '各自跑实验，用数据说话', hint: '你的精力 -3 · 两人课题质量 +1 · 心情 -1（又多了实验要跑）', def: true,
              apply: g => { S().addEnergy(g, -3); bonus(pa, 1); bonus(pb, 1); S().addMood(a, -1); S().addMood(b, -1); } },
          ],
        };
      },
    },

    // AI 写的审稿意见
    llm_review: {
      weight: g => (g.projects.some(p => p.phase === 'review') ? 0.8 : 0), cd: 200, minor: true,
      ctx: g => { const c = g.projects.filter(p => p.phase === 'review'); return c.length ? { pid: U.pick(c).id, roll: Math.random() } : null; },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'review') return null;
        const v = RS.VENUES[p.venue];
        return {
          title: '这份审稿意见是 AI 写的吧？', portrait: { icon: 'warn' },
          text: `《${U.esc(p.title)}》在 ${v.name} 收到一份审稿意见：“This paper delves into an intricate tapestry of ...”，还把你们方法的名字写错了三次，最后给了个低分。`,
          choices: [
            { label: '写信向 AC 反映', hint: '精力 -3 · 一半的可能这份意见被作废（论文质量 +3）', def: g.pi.energy >= 20,
              apply: g => {
                S().addEnergy(g, -3);
                if (c.roll < 0.5) { p.q += 3; G().log(g, `AC 认可了你的申诉，《${S().short(p.title)}》那份 AI 审稿意见被作废`, 'good'); }
                else G().log(g, '你写给 AC 的信石沉大海……', 'info');
              } },
            { label: '算了，不节外生枝', hint: '没有影响', def: g.pi.energy < 20, apply: nop },
          ],
        };
      },
    },

    // 帮学生申请奖学金
    student_fellowship: {
      weight: g => (fellowCands(g).length ? 0.6 : 0), cd: 360, minor: true,
      ctx: g => { const c = fellowCands(g); return c.length ? { mid: U.pick(c).id, roll: Math.random() } : null; },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.funding === 'fellow') return null;
        const us = g.region === 'us';
        const grfp = us && S().memberYears(g, m) < 1.5;
        const name = us ? (grfp ? 'NSF 研究生奖学金（GRFP）' : '大厂博士生奖学金') : `${S().ROLE_NAMES[m.role]}国家奖学金`;
        const avg = (m.stats.idea + m.stats.code + m.stats.write) / 3;
        const p = U.clamp(0.15 + (avg - 50) / 80 + (m.firstA || 0) * 0.12 + (m.first || 0) * 0.04 + g.rep / 800, 0.08, 0.85);
        const win = g => {
          if (us) { m.funding = 'fellow'; m.fellowUntil = g.day + (grfp ? 3 : 2) * 360; } else m.natAward = true;
          S().addMood(m, 15); S().addTrust(m, 5); S().addRep(g, 0.5);
          S().story(g, m, `获得${name}`);
          G().log(g, `${m.name} 获得了${name}！${us ? '接下来几年 TA 的工资由奖学金来付' : ''}`, 'gold');
          RS.bus.emit('toast', { text: `${m.name} 获得${name}`, kind: 'gold' });
        };
        const lose = (g, v) => { S().addMood(m, v); G().log(g, `${m.name} 的${name}申请没有成功`, 'info'); };
        return {
          title: '奖学金申请', portrait: { member: m.id },
          text: `${U.esc(m.name)} 想申请<b>${name}</b>，需要你写推荐信、帮忙改材料。${us ? '拿到的话，奖学金会替你付 TA 的工资。' : '评上的话，对 TA 以后找工作、申请博后都很有帮助。'}`,
          choices: [
            { label: '认真写推荐信、帮 TA 改材料', hint: `你的精力 -6 · 成功率约 ${U.pct(p)} · 不管结果如何信任 +3`, def: g.pi.energy >= 25,
              apply: g => { S().addEnergy(g, -6); S().addTrust(m, 3); if (c.roll < p) win(g); else lose(g, -3); } },
            { label: '写封简短的推荐信', hint: `精力 -1 · 成功率约 ${U.pct(p * 0.5)}`, def: g.pi.energy < 25,
              apply: g => { S().addEnergy(g, -1); if (c.roll < p * 0.5) win(g); else lose(g, -5); } },
            { label: '今年先别申请了', hint: '心情 -4 · 信任 -2', apply: () => { S().addMood(m, -4); S().addTrust(m, -2); } },
          ],
        };
      },
    },

    // 系里来了新同事
    new_colleague: {
      weight: 0.35, cd: 900, minor: true,
      ctx: g => ({ name: RS.randomName(g.region), from: U.pick(G().region(g).univsTop || G().region(g).univs) }),
      build: (g, c) => {
        const ideas = g.projects.filter(p => (p.phase === 'idea' || p.phase === 'exp') && !p.collab);
        const target = ideas.length ? ideas.reduce((a, b) => (S().projectPct(b) > S().projectPct(a) ? b : a)) : null;
        return {
          title: '系里来了新同事', portrait: { icon: 'people' },
          text: `刚从 ${U.esc(c.from)} 博士后出站的 ${U.esc(c.name)} 入职了你们系，研究方向和你挺接近。`,
          choices: [
            { label: '主动约饭，聊聊合作', hint: `精力 -3 · 人脉 +2${target ? ` ·《${S().short(target.title)}》多一位合作者（质量 +3）` : ''}`, def: true,
              apply: g => {
                S().addEnergy(g, -3);
                g.pi.stats.network = Math.min(100, g.pi.stats.network + 2);
                if (target && !target.collab && G().project(g, target.id)) target.collab = { who: `${c.name} 教授`, bonus: 3 };
              } },
            { label: '帮 TA 熟悉学院的情况', hint: '精力 -5 · 声望 +1（同事们都说你人好）', apply: g => { S().addEnergy(g, -5); S().addRep(g, 1); } },
            { label: '各做各的', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    // 机房热到报警
    heatwave: {
      weight: g => (RS.G.computeUnits(g) > 0 && [7, 8].includes(G().month(g)) ? 1.5 : 0), cd: 300, minor: true,
      ctx: g => ({ cost: Math.round(8000 * G().region(g).ppp) }),
      build: (g, c) => ({
        title: '机房热到报警', portrait: { icon: 'gpu' },
        text: '连续高温，机房的空调扛不住了，服务器温度直逼 90 度，频繁过热降频。',
        choices: [
          { label: '加装一台工业空调', hint: `经费 -${money(g, c.cost)} · 问题解决`, def: g.funds > c.cost * 6, disabled: g.funds < c.cost ? '经费不足' : null, apply: g => S().spend(g, c.cost, 'facility') },
          { label: '限功率运行', hint: '20 天内算力 -40%', def: g.funds <= c.cost * 6, apply: g => { g.flags.computeCut = 0.6; g.flags.cutUntil = g.day + 20; } },
          { label: '让大家半夜再跑实验', hint: '20 天内算力 -15% · 全组心情 -4', apply: g => { g.flags.computeCut = 0.85; g.flags.cutUntil = g.day + 20; S().labMood(g, -4); } },
        ],
      }),
    },

    // 伦理审查
    ethics_review: {
      weight: g => (humanProjects(g).length ? 0.8 : 0), cd: 300, minor: true,
      ctx: g => { const c = humanProjects(g); return c.length ? { pid: U.pick(c).id } : null; },
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || !S().WORK_PHASES.includes(p.phase)) return null;
        return {
          title: '伦理审查', portrait: { icon: 'paper' },
          text: `《${U.esc(p.title)}》要用到真人的数据、做用户实验，${g.region === 'us' ? 'IRB（伦理审查委员会）' : '学校的伦理审查委员会'}要求补充知情同意书、数据脱敏方案和一大堆表格。`,
          choices: [
            { label: '老老实实补材料', hint: '精力 -3 · 当前阶段进度 -15%（等审批）', def: true, apply: g => { p.irb = true; S().addEnergy(g, -3); p.prog *= 0.85; } },
            { label: '改用公开数据集', hint: '不用等审批 · 论文质量 -2', apply: () => { p.irb = true; p.bonus -= 2; } },
          ],
        };
      },
    },

    // 本科生科研双选会（直接弹出录用窗口）
    ug_fair: {
      weight: g => ([9, 10].includes(G().month(g)) && g.members.length < G().desks(g) + 1 ? 2 : 0), cd: 300,
      ctx: g => {
        const ts = g.groups.map(gr => gr.sub);
        const from = g.region === 'cn' ? '在本科生导师双选会上选了你' : '在本科生科研招募会上找到了你';
        const cands = [];
        for (let i = U.int(2, 3); i > 0; i--) cands.push(Object.assign(S().genCandidate(g, 'ug', 2, { own: true, interest: ts.length && U.chance(0.7) ? U.pick(ts) : undefined }), { from }));
        return { cands };
      },
      instant: (g, c) => {
        const name = g.region === 'cn' ? '本科生导师双选会' : '本科生科研招募会';
        G().queue(g, { type: 'pool', role: 'ug', title: name, text: `学院办了一场${name}，有几位 ${g.school} 的本科生对你们组的方向很感兴趣。`, cands: c.cands, max: 2 });
        return true;
      },
    },

    // 校友回来做报告
    alumni_talk: {
      weight: g => (g.alumni.some(a => a.reason === 'graduated' && a.dest && a.role !== 'ug') ? 0.6 : 0), cd: 300,
      ctx: g => { const c = g.alumni.filter(a => a.reason === 'graduated' && a.dest && a.role !== 'ug'); return c.length ? { aid: U.pick(c).id } : null; },
      instant: (g, c) => {
        const a = g.alumni.find(x => x.id === c.aid);
        if (!a) return true;
        S().labMood(g, 4);
        let t;
        if (/教授/.test(a.dest)) { S().addRep(g, 1); t = `如今已是${a.dest}的 ${a.name} 回来做了场报告，师弟师妹们听得热血沸腾`; }
        else if (/创办/.test(a.dest)) t = `自己创业的 ${a.name} 回来分享创业故事，还给大家带了公司的周边`;
        else t = `在${a.dest.split(' ')[0]}工作的 ${a.name} 回来分享经验，还请大家喝了奶茶`;
        G().log(g, t, 'good');
        return true;
      },
    },

    // 小组读书会
    paper_reading: {
      weight: g => (g.groups.some(gr => S().groupMembers(g, gr).filter(m => m.status === 'active').length >= 2) ? 1 : 0), cd: 90,
      ctx: g => {
        const c = g.groups.filter(gr => S().groupMembers(g, gr).filter(m => m.status === 'active').length >= 2);
        return c.length ? { gid: U.pick(c).id } : null;
      },
      instant: (g, c) => {
        const gr = S().group(g, c.gid);
        if (!gr) return true;
        g.expertise[gr.topic] = Math.min(10, (g.expertise[gr.topic] || 0) + 0.1);
        S().groupMembers(g, gr).forEach(m => S().addMood(m, 2));
        G().log(g, `「${S().groupName(g, gr)}」办了一次读书会，把最近的论文过了一遍（方向积累 +0.1）`, 'info');
        return true;
      },
    },

    // 生日
    birthday: {
      weight: g => (g.members.length ? 0.8 : 0), cd: 60,
      ctx: g => {
        const c = activeOf(g);
        return c.length ? { mid: U.pick(c).id, wish: U.pick(['这次投稿一定要中！', '希望 Reviewer 2 对我好一点', '早日毕业！', '实验一次就跑通', '显卡管够', '论文引用破百', '老师少催一点稿（小声）', '世界和平，代码没有 bug']) } : null;
      },
      instant: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return true;
        S().addMood(m, 6);
        S().labMood(g, 1);
        G().log(g, `今天是 ${m.name} 的生日，大家凑钱买了个蛋糕。${sn(m.name)}许愿：“${c.wish}”`, 'good');
        return true;
      },
    },

    // 奇怪的邮件
    spam_mail: {
      weight: 0.7, cd: 120,
      ctx: () => ({ i: U.int(0, 5) }),
      instant: (g, c) => {
        const t = [
          '收到一封邮件：“Dear Esteemed Professor，诚邀您担任《国际前沿科学与工程评论》主编……”，直接删了',
          '一个从没听说过的“国际会议”邀请你做大会报告，只要交 999 美元注册费。你笑着点了删除',
          '有人发邮件说能“保证三周内录用”，版面费另议。你顺手点了举报',
          g.region === 'cn' ? '收到“全国杰出科技创新人物”评选通知，交 3800 元评审费即可入选……' : '收到一封“Who’s Who in Science”入选通知，只要买一本 299 美元的纪念册……',
          '邮箱里躺着第 37 封“Call for Papers: International Conference on Everything”',
          '一家“学术服务公司”问你要不要代写基金申请书，你直接拉黑了',
        ][c.i] || '';
        if (t) G().log(g, t, 'info');
        return true;
      },
    },

    // 暴雪 / 台风停课
    weather: {
      weight: g => { const mo = G().month(g); return g.region === 'us' ? ([12, 1, 2].includes(mo) ? 0.8 : 0) : [7, 8, 9].includes(mo) ? 0.6 : 0; },
      cd: 300,
      ctx: () => ({}),
      instant: g => {
        g.flags.closedUntil = g.day + 3;
        S().labMood(g, 2);
        G().log(g, g.region === 'us' ? '暴风雪来袭，学校停课三天。大家在家远程办公（其实主要在打雪仗）' : '台风过境，学校停课三天。大家在宿舍远程办公，顺便补了补觉', 'info');
        RS.bus.emit('toast', { text: g.region === 'us' ? '暴风雪停课 3 天' : '台风停课 3 天', kind: 'info' });
        return true;
      },
    },

    // 大佬点赞
    big_shot_praise: {
      weight: g => (g.papers.some(p => g.day - p.day < 360 && !p.retracted && p.tier !== 'P' && !p.praised) ? 0.5 : 0), cd: 360,
      ctx: g => {
        const c = g.papers.filter(p => g.day - p.day < 360 && !p.retracted && p.tier !== 'P' && !p.praised);
        return c.length ? { pid: U.weighted(c, p => p.q).id, who: U.pick(['图灵奖得主 B 教授', '领域泰斗 L 教授', '某大厂的首席科学家', '一位你很崇拜的前辈']) } : null;
      },
      instant: (g, c) => {
        const pa = g.papers.find(p => p.id === c.pid);
        if (!pa) return true;
        pa.praised = true;
        pa.rate *= 1.5;
        S().addRep(g, 2);
        const first = M(g, (pa.authors || [])[0]);
        if (first) { S().addMood(first, 10); S().addTrust(first, 2); S().story(g, first, `《${S().short(pa.title)}》被${c.who}公开点赞`); }
        G().log(g, `${c.who}在社交媒体上推荐了你们的《${S().short(pa.title)}》：“今年读到最有意思的工作之一。”${first ? `${first.name} 激动得一晚上没睡着` : ''}`, 'gold');
        RS.bus.emit('toast', { text: '大佬点赞！引用速度 ×1.5', kind: 'gold' });
        return true;
      },
    },
  };
})();
