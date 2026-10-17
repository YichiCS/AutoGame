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
  const alumniIndustry = g => g.alumni.filter(a => a.reason === 'poached' || (a.reason === 'graduated' && RS.G.region(g).companies.some(co => (a.dest || '').indexOf(co) >= 0)));
  const activeOf = (g, pred) => g.members.filter(m => m.status === 'active' && (!pred || pred(m)));

  RS.EVENTS = {
    // ================= 系统事件 =================
    welcome: {
      build: g => {
        const R = G().region(g), A = G().area(g);
        const tip = A.compute >= 0.3 ? '你的方向很依赖算力，记得去「设施」页面买几台 GPU，不然实验会慢得像蜗牛。' : '你的方向不太依赖算力，可以把钱花在人身上。';
        return {
          title: `欢迎来到${G().tierCfg(g).name}！`, portrait: { pi: true },
          text: `${R.startText}<br><br>研究方向：<b>${A.name}</b>　起步经费：<b>${money(g, g.startup)}</b><br><br>实验室会自己运转——学生们会选题、做实验、写论文、投稿。你的工作是在<b>关键节点做决定</b>（申请基金、招生、处理突发状况），以及在右侧面板里调整方针、购置设备。遇到需要决定的事情，时间会自动暂停。<br><br><span class="dim">提示：${tip}</span>`,
          choices: [{ label: '开始我的科研人生！', def: true, apply: nop }],
        };
      },
    },

    teaching: {
      minor: true,
      build: (g, c) => {
        const cost = G().region(g).costs.buyout;
        const ch = [
          { label: `本科大课《${c.big}》`, hint: '每天精力 -0.42 · 评教难度较高', apply: g => S().setTeaching(g, c.sem, { name: c.big, energy: 0.42, mod: -0.15 }) },
          { label: `研究生课《${c.grad}》`, hint: '每天精力 -0.28 · 评教 +0.15 · 可能发现好苗子', def: true, apply: g => S().setTeaching(g, c.sem, { name: c.grad, energy: 0.28, mod: 0.15, scout: true }) },
        ];
        if (cost > 0) {
          ch.push({ label: `用经费买断教学（${money(g, cost)}）`, hint: '本学期不用上课，也没有评教成绩', disabled: g.funds < cost ? '经费不足' : null,
            apply: g => { S().spend(g, cost); S().setTeaching(g, c.sem, null); G().log(g, '用经费买断了本学期的教学任务', 'info'); } });
        }
        return { title: `${c.semName}排课`, portrait: { icon: 'book' }, text: '新学期快开始了，教务处发来了排课通知。这学期你想上哪门课？<br><span class="dim">教学评分会计入考核。</span>', choices: ch };
      },
    },

    rebuttal: {
      minor: true,
      build: (g, c) => {
        const p = G().project(g, c.pid);
        if (!p || p.phase !== 'review') return null;
        const v = RS.VENUES[p.venue];
        const lead = M(g, p.lead);
        return {
          title: 'Rebuttal 时间', portrait: lead ? { member: lead.id } : { icon: 'paper' },
          text: `《${U.esc(p.title)}》在 <b>${v.name}</b> 收到了初审意见：<b>${c.scores.join(' / ')}</b><br>Reviewer 2：“${c.quote}”<br>要怎么回复？`,
          choices: [
            { label: '逐条认真回复', hint: '论文质量 +4 · 你的精力 -6 · 学生心情 -3', def: true, apply: g => { p.q += 4; S().addEnergy(g, -6); S().addMood(M(g, p.lead), -3); } },
            { label: '简单回复一下', hint: '论文质量 +1.5 · 精力 -1', apply: g => { p.q += 1.5; S().addEnergy(g, -1); } },
            { label: '撤稿，改投别处', hint: '论文退回待投稿状态', apply: g => {
              p.attempts++;
              p.history.push({ v: v.id, d: g.day, scores: c.scores, withdrawn: true });
              p.phase = 'ready'; p.venue = null; p.target = null;
              G().log(g, `《${S().short(p.title)}》从 ${v.name} 撤稿`, 'info');
              S().retarget(g, p);
            } },
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
          text: `《${U.esc(p.title)}》已经写了 ${pct}%。${lead ? U.esc(lead.name) : '学生'}眼巴巴地看着你：要不要冲一下 <b>${v.name}</b>？`,
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
        return {
          title: '博士毕业季', portrait: { member: m.id },
          text: `${U.esc(m.name)} 读博 ${yrs.toFixed(1)} 年，发表论文 ${m.pubs} 篇（A 类 ${m.pubsA} 篇），觉得自己可以毕业了。<br>要让${U.esc(sn(m.name))}答辩吗？`,
          choices: [
            { label: '同意答辩，恭喜毕业！', hint: '学生毕业离组；去向越好，你的声望提升越多', def: true,
              apply: g => {
                const pl = S().graduate(g, m);
                G().queue(g, { type: 'notice', tone: 'good', icon: 'cap', fx: 'confetti', title: `${m.name} 博士毕业！`, text: `${U.esc(m.name)} 顺利通过了答辩，成为了 <b>${U.esc(m.name)} 博士</b>！<br>去向：<b>${U.esc(pl.text)}</b>` });
              } },
            { label: '再留一年，多发几篇', hint: '学生心情 -15', disabled: yrs >= 6.5 ? '已经读了太久，不能再拖了' : null,
              apply: g => { S().addMood(m, -15); m.extended++; G().log(g, `${m.name} 被要求延期一年毕业，有点郁闷`, 'bad'); } },
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
              apply: g => { m.role = 'phd'; m.startDay = g.day; m.endDay = 0; m.funding = 'ra'; S().addMood(m, 15); G().log(g, `${m.name} 转为博士生，继续留在实验室`, 'good'); } },
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
              apply: g => { m.role = 'phd'; m.startDay = g.day; m.endDay = 0; m.funding = 'ra'; S().addMood(m, 15); G().log(g, `${m.name} 留下来读博了`, 'good'); } },
            { label: '收为硕士生', hint: R.costs.ms ? `每月开销 ${money(g, R.costs.ms)}` : '硕士自费，不用你发钱', def: avg < 56,
              apply: g => { m.role = 'ms'; m.startDay = g.day; m.endDay = g.day + 720; m.funding = S().defaultFunding(g, 'ms'); S().addMood(m, 10); G().log(g, `${m.name} 留下来读硕士了`, 'good'); } },
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
          { label: '促膝长谈', hint: '你的精力 -8 · 学生心情 +25', def: true, disabled: g.pi.energy < 8 ? '你自己都快撑不住了' : null,
            apply: g => { S().addEnergy(g, -8); S().addMood(m, 25); G().log(g, `你和 ${m.name} 谈了很久，${sn(m.name)}决定再坚持一下`, 'info'); } },
          { label: '放两周假，回去休息', hint: '离开 14 天 · 心情 +35', apply: g => { m.status = 'away'; m.awayUntil = g.day + 14; m.awayWhy = '休假'; S().addMood(m, 35); } },
        ];
        if (m.funding === 'ra') ch.push({ label: '提高补贴 20%', hint: '每月开销增加 · 心情 +20', apply: g => { m.salaryMult *= 1.2; S().addMood(m, 20); } });
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
            apply: g => { S().earn(g, ex * 3); S().addRep(g, -3); g.cooldowns.bridge = g.day + 3 * 360; G().log(g, '学院批了一笔过渡经费，但系主任的脸色不太好看', 'info'); } },
          { label: '先用自己的工资垫上', hint: `获得 ${money(g, ex)} · 你的精力 -10（心累）`, def: bridgeUsed, apply: g => { S().earn(g, ex); S().addEnergy(g, -10); } },
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
        const t = G().topic(g, c.tid);
        const ideas = g.projects.filter(p => p.phase === 'idea' && p.topic !== c.tid);
        return {
          title: '热点爆发！', portrait: { icon: 'fire' },
          text: `「<b>${t.name}</b>」方向突然爆火！大佬们纷纷入场，相关论文的引用和基金都水涨船高（当然竞争也更激烈了）。<br>要不要跟进？`,
          choices: [
            { label: '构思中的课题全部转向', hint: `${ideas.length} 个构思中的课题转向（构思进度减半）`, disabled: ideas.length ? null : '目前没有构思中的课题',
              apply: g => { ideas.forEach(p => S().changeTopic(g, p, c.tid)); } },
            { label: '新课题优先做这个方向', hint: '一年内一半的新课题会选这个方向', def: true, apply: g => { g.flags.trendTopic = c.tid; g.flags.trendUntil = g.day + 360; } },
            { label: '不追热点，坚持自己的方向', hint: '核心方向的积累 +0.5', apply: g => { const k = g.policies.coreTopic; g.expertise[k] = Math.min(10, (g.expertise[k] || 0) + 0.5); } },
          ],
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
        const m = U.weighted(c, x => S().tMul(x, 'intern'));
        return { mid: m.id, company: U.pick(G().region(g).companies) };
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        return {
          title: '暑期实习邀请', portrait: { member: m.id },
          text: `${U.esc(m.name)} 拿到了 <b>${c.company}</b> 的暑期实习 offer，想去实习三个月。<br><span class="dim">实习期间不用你发工资，但也不会干实验室的活。</span>`,
          choices: [
            { label: '去吧，见见世面', hint: '离开 90 天 · 回来编程 +4 · 心情 +20', def: true,
              apply: g => { m.status = 'intern'; m.awayUntil = g.day + 90; m.awayWhy = c.company + '实习'; m.internYear = G().calYear(g); S().addMood(m, 20); G().log(g, `${m.name} 去 ${c.company} 实习了`, 'info'); } },
            { label: '只能远程兼职', hint: '90 天内效率 -30% · 心情 +5', apply: g => { m.remoteUntil = g.day + 90; m.internYear = G().calYear(g); S().addMood(m, 5); } },
            { label: '不行，论文要紧', hint: '心情 -12', apply: g => { S().addMood(m, -12); m.internYear = G().calYear(g); } },
          ],
        };
      },
    },

    poach: {
      weight: 1, cd: 200,
      ctx: g => {
        const c = activeOf(g, m => (m.role === 'phd' && S().memberYears(g, m) >= 2.5 && m.pubsA >= 1) || m.role === 'postdoc');
        if (!c.length) return null;
        const m = U.weighted(c, x => S().tMul(x, 'intern') * (1 + x.pubsA));
        return { mid: m.id, company: U.pick(G().region(g).companies), chance: U.clamp(0.35 + m.mood / 200 + S().tAdd(m, 'academia'), 0.2, 0.9) };
      },
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return null;
        const leave = g => { S().removeMember(g, m, 'poached', c.company); G().log(g, `${m.name} 加入了 ${c.company}`, 'bad'); };
        const ch = [
          { label: '动之以情，晓之以理', hint: `你的精力 -8 · 成功率约 ${U.pct(c.chance)}`, def: true,
            apply: g => { S().addEnergy(g, -8); if (Math.random() < c.chance) { S().addMood(m, 8); G().log(g, `${m.name} 被你说服，决定留下来`, 'good'); } else leave(g); } },
        ];
        if (m.funding === 'ra') ch.push({ label: '提高补贴 30% 挽留', hint: '每月开销增加 · 成功率约 85%',
          apply: g => { m.salaryMult *= 1.3; if (Math.random() < 0.85) { S().addMood(m, 12); G().log(g, `${m.name} 决定留下来`, 'good'); } else leave(g); } });
        ch.push({ label: '尊重选择，祝福他', hint: '学生离开 · 将来可能回馈实验室', apply: leave });
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
        return { pid: U.weighted(c, x => g.topics[x.topic].heat).id };
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
            { label: '花钱找数据恢复', hint: `经费 -${money(g, c.cost)}，数据救回来`, def: true, disabled: g.funds < c.cost ? '经费不足' : null, apply: g => S().spend(g, c.cost) },
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
            { label: '豪华大餐！', hint: `经费 -${money(g, big)} · 全组心情 +12`, disabled: g.funds < big ? '经费不足' : null, apply: g => { S().spend(g, big); S().labMood(g, 12); } },
            { label: '简单吃个火锅', hint: `经费 -${money(g, small)} · 全组心情 +6`, def: true, apply: g => { S().spend(g, small); S().labMood(g, 6); } },
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
          { label: '签授权协议', hint: `经费 +${money(g, c.v)}`, def: true, apply: g => S().earn(g, c.v) },
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
            apply: g => { S().earn(g, c.v); g.pi.stats.network = Math.min(100, g.pi.stats.network + 8); S().addEnergy(g, 100); g.flags.sabbaticalUntil = g.day + 360; g.flags.lastSabbatical = g.day; G().milestone(g, `前往 ${c.co} 学术休假一年`); } },
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
      ctx: g => ({ cand: S().genCandidate(g, 'ug', 4) }),
      build: (g, c) => {
        const full = g.members.length >= G().desks(g);
        return {
          title: '有人敲门', portrait: { icon: 'people' },
          text: `一位叫 <b>${U.esc(c.cand.name)}</b> 的本科生（${c.cand.school}）敲开了你的门：“老师，我读了您的论文，想跟着您做科研！”`,
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
            { label: '撤稿，修好再投', hint: '论文质量 -3 · 学生心情 -5 · 问心无愧', def: true,
              apply: g => { p.q -= 3; p.phase = 'ready'; p.venue = null; p.target = null; S().addMood(lead, -5); G().log(g, `《${S().short(p.title)}》撤稿修复 bug`, 'info'); S().retarget(g, p); } },
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
        const a = alumniIndustry(g);
        return a.length ? { name: U.pick(a).name, v: Math.round(15000 * G().region(g).ppp * U.range(0.8, 2)) } : null;
      },
      instant: (g, c) => {
        S().earn(g, c.v);
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
      weight: g => (g.members.some(m => m.role === 'phd' && m.pubsA >= 2 && m.funding === 'ra') ? 0.6 : 0), cd: 360,
      ctx: g => {
        const c = g.members.filter(m => m.role === 'phd' && m.pubsA >= 2 && m.funding === 'ra');
        return c.length ? { mid: U.pick(c).id } : null;
      },
      instant: (g, c) => {
        const m = M(g, c.mid);
        if (!m) return true;
        m.funding = 'fellow';
        m.fellowUntil = g.day + 2 * 360;
        S().addMood(m, 15);
        S().addRep(g, 1);
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
          { label: '马上修！', hint: `经费 -${money(g, c.cost)}`, def: true, disabled: g.funds < c.cost ? '经费不足' : null, apply: g => S().spend(g, c.cost) },
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
          { label: '拿 offer 和学院谈条件', hint: `学院给一笔留任经费 ${money(g, c.v)} · 声望 +2`, def: true, apply: g => { S().earn(g, c.v); S().addRep(g, 2); G().log(g, '学院为了留住你，追加了一笔经费', 'gold'); } },
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
  };
})();
