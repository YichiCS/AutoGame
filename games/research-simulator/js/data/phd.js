/* 博士阶段的数据：导师类型、本科背景，以及以“你”的视角发生的事件（phd: true 的事件只在博士阶段出现） */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const U = RS.U;
  const G = () => RS.G;
  const S = () => RS.Sys;
  const M = (g, id) => RS.G.member(g, id);
  const sn = n => RS.shortName(n);
  const nop = () => {};

  // 导师类型：决定实验室规模、资源、指导风格和推荐信的分量
  RS.ADVISORS = [
    { id: 'star', name: '大牛导师', desc: '领域大牛：名气大、资源足、人脉广，推荐信很有分量；但组里人多，导师很忙，指导你的时间少',
      rep: [320, 520], title: 3, lab: [7, 10], postdoc: true, gpu: 4, room: 2, fac: 9, funds: 1.4,
      meeting: 'monthly', intensity: 'normal', focus: 'grant', research: 78, writing: 72, network: 75, letter: 1.5, stick: 3, grantRate: 0.8,
      tip: '大牛很忙，想让导师多关注你，得自己多出成果、主动约导师聊。' },
    { id: 'solid', name: '中坚导师', desc: '小有名气的副教授：节奏稳定，指导和资源都中规中矩，适合大多数人',
      rep: [110, 200], title: 1, lab: [4, 6], postdoc: false, gpu: 2, room: 1, fac: 6, funds: 1.2,
      meeting: 'biweekly', intensity: 'normal', focus: 'mentor', research: 64, writing: 60, network: 50, letter: 1.15, stick: 2.5, grantRate: 0.65 },
    { id: 'young', name: '青年导师', desc: '刚入职的助理教授：亲力亲为、每周组会、指导很多，成长快；但名气小、压力大，组里人少',
      rep: [20, 50], title: 0, lab: [1, 2], postdoc: false, gpu: 1, room: 0, fac: 3, funds: 1.1,
      meeting: 'weekly', intensity: 'crunch', focus: 'mentor', research: 66, writing: 62, network: 35, letter: 0.85, stick: 2, grantRate: 0.85,
      tip: '青年导师自己也在赶 Tenure，会很拼，也会盯得很紧。' },
    { id: 'free', name: '放养型导师', desc: '兴趣广泛、很少管你：自由度高，全靠自己；组会一个月一次',
      rep: [150, 260], title: 2, lab: [4, 6], postdoc: false, gpu: 2, room: 1, fac: 6, funds: 1.2,
      meeting: 'monthly', intensity: 'chill', focus: 'research', research: 72, writing: 56, network: 55, letter: 1.0, stick: 1.2, grantRate: 0.4 },
  ];

  // 本科背景：影响你刚入学时的能力
  RS.UG_BG = [
    { id: 'elite', name: '名校本科', desc: '想法 +5、写作 +3', stats: { idea: 5, write: 3 } },
    { id: 'contest', name: '竞赛选手', desc: '编程 +10，但写作 -3', stats: { code: 10, write: -3 } },
    { id: 'cross', name: '跨专业转来', desc: '想法 +8、编程 -5，潜力 +1', stats: { idea: 8, code: -5 }, pot: 1 },
    { id: 'intern', name: '实习过的', desc: '编程 +5，人脉 +8', stats: { code: 5 }, network: 8 },
    { id: 'blank', name: '科研小白', desc: '各项一般，但潜力最高（+1.6）', stats: {}, pot: 1.6 },
  ];

  // ---------- 小工具 ----------
  const me = g => RS.G.member(g, g.player);
  const work = p => p && RS.Sys.WORK_PHASES.includes(p.phase);
  // 你自己负责、正在做的课题
  const myLead = g => { const m = me(g); const p = m && m.projectId ? RS.G.project(g, m.projectId) : null; return work(p) && p.lead === g.player ? p : null; };
  const shift = (p, f) => { if (work(p)) p.prog = U.clamp(p.prog + p.need[p.phase] * f, 0, p.need[p.phase] - 0.01); };
  const adv = g => RS.Sys.advisorType(g);
  // 在负责课题的师兄师姐 / 博后
  const seniors = g => g.members.filter(x => x.id !== g.player && x.status === 'active' && (x.role === 'phd' || x.role === 'postdoc') && (() => {
    const p = x.projectId && RS.G.project(g, x.projectId);
    return work(p) && p.lead === x.id && !p.authors.includes(g.player);
  })());
  // 比你资历浅、手上没有自己负责的课题的人
  const juniors = g => {
    const m = me(g);
    if (!m) return [];
    return g.members.filter(x => {
      if (x.id === g.player || x.status !== 'active' || x.role === 'postdoc') return false;
      const p = x.projectId && RS.G.project(g, x.projectId);
      if (work(p) && p.lead === x.id) return false;
      return x.role !== 'phd' || RS.Sys.memberYears(g, x) < RS.Sys.memberYears(g, m) - 0.5;
    });
  };
  const labmates = g => g.members.filter(x => x.id !== g.player && x.status === 'active');
  const avg = m => (m.stats.idea + m.stats.code + m.stats.write) / 3;

  Object.assign(RS.EVENTS, {
    // ================= 博士阶段：系统事件 =================
    phd_welcome: {
      phd: true,
      build: g => {
        const a = adv(g), m = me(g);
        if (!m) return null;
        return {
          title: `欢迎来到 ${g.school}！`, portrait: { member: m.id },
          text: `你成为了 <b>${U.esc(g.pi.name)}</b>（${a.name}）门下的一名博士生，研究方向是 <b>${G().area(g).name} · ${U.esc(S().dirName(g, S().interestOf(m) || g.startSub))}</b>。<br><br>接下来的五年里，你要发论文、过资格考试和开题、去实习和开会、和导师处好关系……然后带着这些成果去<b>找教职</b>。能去什么学校、带着什么背景开始自己的实验室，都取决于这几年。<br><br><span class="dim">提示：「我」页面能看到你的毕业进度和求职竞争力；「方针」里可以调整自己的工作节奏。${a.tip || ''}</span>`,
          choices: [{ label: '开始读博！', def: true, apply: nop }],
        };
      },
    },

    // 做完一个课题，想下一个做什么
    phd_next: {
      phd: true, minor: true,
      build: (g, c) => {
        const m = M(g, c.mid);
        if (!m || m.status !== 'active' || m.projectId) return null;
        const interest = S().interestOf(m);
        const alloc = S().computeAlloc(g);
        const heatWord = h => (h >= 2.2 ? '很热门' : h >= 1.5 ? '较热门' : h >= 1.1 ? '热度一般' : '冷门');
        const last = c.sub || (c.topic ? G().asSub(g, c.topic) : null);
        const lastTopic = last ? G().sub(g, last).topic : null;
        const mine = S().memberSubs(g, m);
        let opts = (c.opts || []).map(x => G().asSub(g, x)).filter((x, i, a) => a.indexOf(x) === i);
        // 在小组里只能做小组的方向
        if (mine.length) { opts = opts.filter(s => mine.includes(s)); if (!opts.length) opts = mine.slice(); }
        const def = c.def && opts.includes(G().asSub(g, c.def)) ? G().asSub(g, c.def) : opts[0];
        const ch = opts.map(sid => {
          const s = G().sub(g, sid);
          const t = G().topic(g, s.topic);
          const gr = S().groupOfSub(g, sid);
          const fit = S().interestFit(m, sid);
          const join = gr && !mine.includes(sid) && (m.groups || []).length < S().MAX_MEMBER_GROUPS;
          const tags = [];
          if (sid === def) tags.push('导师建议');
          if (sid === last) tags.push('接着做');
          if (fit === 1) tags.push('你最想做');
          const r = gr ? alloc.ratio[gr.id] : 9;
          const comp = gr ? (alloc.dem[gr.id] > 0 ? `组里${r >= 1 ? '算力充足' : '算力紧张'}（实验 ×${S().speedOf(g, sid, r).toFixed(1)}）` : '组里算力空闲') : '组里没人做，用共享算力';
          const hint = [
            `${t.name} · 实验室积累 ${(g.expertise[s.topic] || 0).toFixed(1)} · ${heatWord(S().heat(g, sid))} · ${comp}`,
            S().teamPreview(g, m, sid),
            sid === last ? '构思快很多' : s.topic === lastTopic ? '同一方向，构思稍快' : null,
            fit === 1 ? '心情 +6 · 效率 +5%' : fit ? '你有点兴趣：心情 +2' : '不是你想做的：心情 -3',
            sid === def ? '导师信任 +3' : null,
          ].filter(Boolean).join(' · ');
          const label = join ? `加入「${S().groupName(g, gr)}」，做「${s.name}」` : mine.length || gr ? `做「${s.name}」` : `单干做「${s.name}」`;
          return { label: `${label}${tags.length ? `（${tags.join('，')}）` : ''}`, hint, def: sid === def,
            apply: g => { S().startNext(g, m, sid, 'pi'); if (sid === def) S().addTrust(m, 3); } };
        });
        // 单干时：也可以申请加入最合适的小组
        if (!mine.length && g.groups.length) {
          const best = g.groups.filter(gr => !opts.includes(gr.sub)).sort((a, b) => S().interestFit(m, b.sub) - S().interestFit(m, a.sub) || S().groupMembers(g, b).length - S().groupMembers(g, a).length)[0];
          if (best) ch.push({ label: `申请加入「${S().groupName(g, best)}」，做「${S().subName(g, best.sub)}」`, hint: `${S().teamPreview(g, m, best.sub)} · 导师信任 +2`,
            apply: g => { S().startNext(g, m, best.sub, 'pi'); S().addTrust(m, 2); } });
        }
        // 在小组里想做组外的方向：那个方向有小组就申请也加入；没有就只能退出小组单干
        if (mine.length && interest && !mine.includes(interest)) {
          const gi = S().groupOfSub(g, interest);
          if (gi && (m.groups || []).length < S().MAX_MEMBER_GROUPS) {
            ch.push({ label: `申请也加入「${S().groupName(g, gi)}」，做「${S().subName(g, interest)}」`, hint: `你最想做的方向：心情 +6 · ${S().teamPreview(g, m, interest)} · 同时在两个小组`,
              apply: g => { S().startNext(g, m, interest, 'pi'); } });
          } else if (!gi) {
            ch.push({ label: `退出小组，单干做「${S().subName(g, interest)}」`, hint: `你最想做的方向：心情 +6 · 但没有组内互助和组长指导：效率 -${Math.round((1 - S().SOLO_WORK) * 100)}%、成长 -${Math.round((1 - S().SOLO_GROW) * 100)}% · 导师信任 -2`,
              apply: g => { S().goSolo(g, m); S().startNext(g, m, interest, 'pi'); S().addTrust(m, -2); } });
          }
        }
        const help = S().helpTarget(g, m);
        if (help) {
          const hl = M(g, help.lead);
          ch.push({ label: `先去帮 ${hl ? sn(hl.name) : '同门'} 做《${S().short(help.title)}》`, hint: `作为合作者加入（${S().PHASE_NAMES[help.phase]}阶段，完成 ${Math.round(S().projectPct(help) * 100)}%），多半是二作；做完再想下一步`,
            apply: g => S().helpWith(g, m, help) });
        }
        if (!ch.length) return null;
        if (!ch.some(x => x.def)) ch[0].def = true;
        const defT = def ? S().subName(g, def) : '';
        return {
          title: '下一个课题做什么？', portrait: { member: m.id },
          text: `${c.title ? `《${U.esc(c.title)}》写完了，交给导师去投稿了。<br>` : ''}你在想下一个课题做什么。${defT ? `${U.esc(g.pi.name)} 的意见是做「${U.esc(defT)}」。` : ''}<br><span class="dim">你最感兴趣的是「${U.esc(S().dirName(g, interest))}」· 想法 ${Math.round(m.stats.idea)} / 编程 ${Math.round(m.stats.code)} / 写作 ${Math.round(m.stats.write)}<br>${mine.length ? `你在${U.esc(S().memberGroups(g, m).map(gr => S().groupName(g, gr)).join('、'))}：只能做小组的方向，但有组里的人互相帮忙。` : '你在单干：可以做自己想做的方向，但没有组内互助和组长指导。'}</span>`,
          choices: ch,
        };
      },
    },

    phd_qual: {
      phd: true,
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const pFull = U.clamp(0.75 + (avg(m) - 50) / 120, 0.6, 0.97);
        const pSide = U.clamp(0.45 + (avg(m) - 50) / 80, 0.25, 0.9);
        const pass = g => { g.phd.qual = true; S().addMood(m, 10); S().phdMilestone(g, 'qual', '通过博士资格考试'); S().story(g, m, '通过了博士资格考试'); G().log(g, '你通过了博士资格考试！', 'good'); RS.bus.emit('toast', { text: '通过资格考试！', kind: 'good' }); };
        const fail = g => { g.phd.qualAfter = g.day + 180; S().addMood(m, -12); S().addTrust(m, -3); G().log(g, '资格考试没过……半年后还有一次机会', 'bad'); };
        return {
          title: g.phd.qualTry ? '资格考试补考' : '博士资格考试', portrait: { icon: 'book' },
          text: `${g.phd.qualTry ? '半年过去了，补考的日子到了。' : '读博一年多，系里的资格考试（Qualifying Exam）要来了。'}要考 ${G().area(g).name} 的核心课程，还要讲清楚你的研究计划。`,
          choices: [
            { label: '停下科研，专心备考两周', hint: `离开实验室 14 天 · 通过率约 ${U.pct(pFull)} · 想法 +2`, def: true,
              apply: g => { g.phd.qualTry++; m.status = 'away'; m.awayUntil = g.day + 14; m.awayWhy = '备考'; S().bumpStat(m, 'idea', 2); (c.roll < pFull ? pass : fail)(g); } },
            { label: '边做科研边准备', hint: `不耽误进度 · 通过率约 ${U.pct(pSide)}`, apply: g => { g.phd.qualTry++; (c.roll < pSide ? pass : fail)(g); } },
          ],
        };
      },
    },

    phd_proposal: {
      phd: true,
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const mine = S().myPapers(g);
        const opts = (c.opts || []).map(x => G().asSub(g, x)).filter((x, i, a) => a.indexOf(x) === i);
        const ch = opts.map((sid, i) => {
          const s = G().sub(g, sid);
          const t = G().topic(g, s.topic);
          const n = mine.filter(p => (p.sub || G().asSub(g, p.topic)) === sid).length;
          const fav = sid === S().interestOf(m);
          return { label: `博士论文做「${s.name}」`, hint: `${t.name} · 你在这个子方向发过 ${n} 篇论文 · 方向积累 +0.5${fav ? ' · 你最感兴趣：心情 +5' : ''} · 将来自己实验室的核心方向和第一个小组`, def: i === 0,
            apply: g => {
              g.phd.proposal = true;
              g.phd.thesis = sid;
              g.expertise[s.topic] = Math.min(10, (g.expertise[s.topic] || 0) + 0.5);
              if (fav) S().addMood(m, 5);
              S().addTrust(m, 3);
              S().phdMilestone(g, 'proposal', `通过开题答辩，博士论文方向：${t.name} · ${s.name}`);
              S().story(g, m, `开题：${s.name}`);
            } };
        });
        if (!ch.length) return null;
        return {
          title: '开题答辩', portrait: { icon: 'paper' },
          text: '读博第三年，该开题了：你要定下博士论文的方向，向答辩委员会讲清楚接下来两三年要做什么。<br><span class="dim">博士论文所在的方向会成为你将来自己实验室的核心方向，这个子方向就是你实验室的第一个小组。</span>',
          choices: ch,
        };
      },
    },

    phd_intern: {
      phd: true, minor: true,
      build: (g, c) => {
        const m = me(g);
        if (!m || m.status !== 'active') return null;
        const strict = adv(g).id === 'young';
        const late = S().memberYears(g, m) >= 4;
        return {
          title: '暑期实习', portrait: { icon: 'mail' },
          text: `<b>${U.esc(c.company)}</b> 给了你一个暑期实习的机会，三个月，工资比博士生补贴高好几倍。${strict ? `<br><span class="dim">不过 ${U.esc(g.pi.name)} 刚入职、压力很大，未必乐意你走开。</span>` : ''}`,
          choices: [
            { label: '去实习', hint: `离开 90 天 · 回来编程 +4 · 人脉 +4 · 心情 +12 · 导师信任 ${strict ? -6 : -1}`, def: !strict && !late,
              apply: g => {
                m.status = 'intern'; m.awayUntil = g.day + 90; m.awayWhy = c.company + '实习';
                g.phd.network += 4; g.phd.interns.push(c.company);
                S().addMood(m, 12); S().addTrust(m, strict ? -6 : -1);
                S().story(g, m, `去 ${c.company} 暑期实习`);
                G().log(g, `你去 ${c.company} 实习了`, 'info');
              } },
            { label: '留在实验室赶论文', hint: '心情 -4 · 导师信任 +3', def: strict || late, apply: () => { S().addMood(m, -4); S().addTrust(m, 3); } },
          ],
        };
      },
    },

    phd_ta: {
      phd: true, minor: true,
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        return {
          title: '当助教', portrait: { icon: 'book' },
          text: `这学期系里安排你给本科课《${U.esc(c.course)}》当助教：批作业、带习题课、坐班答疑。`,
          choices: [
            { label: '认真带课', hint: '这学期效率 -10% · 心情 -2 · 教学经验 +1，学生评价好（找教职时加分）', def: true,
              apply: g => { g.phd.ta++; g.phd.taEval.push(4.2 + c.roll * 0.6); m.busyUntil = g.day + 100; m.busyMult = 0.9; S().addMood(m, -2); } },
            { label: '应付一下', hint: '这学期效率 -4% · 教学经验 +1，评价一般', apply: g => { g.phd.ta++; g.phd.taEval.push(3.2 + c.roll * 0.6); m.busyUntil = g.day + 100; m.busyMult = 0.96; } },
          ],
        };
      },
    },

    phd_slump: {
      phd: true,
      build: g => {
        const m = me(g);
        if (!m) return null;
        return {
          title: '读博的低谷', portrait: { member: m.id },
          text: `你已经好几周提不起劲了：实验不顺，论文被拒，看着本科同学都工作赚钱了……你开始怀疑自己是不是适合读博。<br><span class="dim">当前心情 ${Math.round(m.mood)} / 100</span>`,
          choices: [
            { label: '去找导师聊聊', hint: '心情 +20 · 导师信任 +6', def: true, apply: g => { S().addMood(m, 20); S().addTrust(m, 6); S().story(g, m, '经历了读博的低谷，和导师长谈后走了出来'); } },
            { label: '回家休息两周', hint: '离开 14 天 · 心情 +35', apply: g => { m.status = 'away'; m.awayUntil = g.day + 14; m.awayWhy = '回家休息'; S().addMood(m, 35); } },
            { label: '咬牙坚持', hint: '心情 +5 · 想法 +1（痛苦使人成长）', apply: () => { S().addMood(m, 5); S().bumpStat(m, 'idea', 1); } },
          ],
        };
      },
    },

    phd_ready: {
      phd: true,
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const sc = S().marketScore(g);
        const yrs = S().memberYears(g, m);
        const ch = [{ label: '开始找教职！', hint: `现在的求职竞争力 ${sc.total.toFixed(1)}（「我」页面可以看到各类学校的机会）`, def: true, apply: g => S().openMarket(g) }];
        if (!c.forced) ch.push({ label: '再读一年，多发几篇', hint: '一年后再说 · 导师信任 -2', apply: () => S().addTrust(m, -2) });
        return {
          title: c.forced ? '该毕业了' : '可以毕业了', portrait: { pi: true },
          text: c.forced
            ? `你已经读了 ${yrs.toFixed(1)} 年，学校规定博士最多读六年。是时候带着你的成果去找工作了。`
            : `${U.esc(g.pi.name)} 翻了翻你的成果：论文 ${m.pubs} 篇（一作 ${m.first || 0} 篇，其中 A 类 ${m.firstA || 0} 篇）。“我觉得你可以毕业了，今年就去找教职吧？”`,
          choices: ch,
        };
      },
    },

    // 开会时遇到大佬（论文被接收、去开会时触发）
    phd_bigshot: {
      phd: true, minor: true,
      build: (g, c) => {
        const v = RS.VENUES[c.v];
        return {
          title: '会场偶遇', portrait: { icon: 'people' },
          text: `在 ${v ? v.name : '会议'} 的茶歇上，你和 ${U.esc(c.who)} 聊了很久。对方对你的工作很感兴趣，临走前说：“毕业了记得来找我。”`,
          choices: [
            { label: '加个联系方式，保持联系', hint: '人脉 +3 · 求职时多一位“熟人”', def: true, apply: g => { g.phd.network += 3; g.phd.contacts++; } },
            { label: '太害羞了，算了', hint: '人脉 +1', apply: g => { g.phd.network += 1; } },
          ],
        };
      },
    },

    // ================= 博士阶段：随机事件 =================
    phd_collab: {
      phd: true, weight: g => (seniors(g).length ? 1 : 0), cd: 150, minor: true,
      ctx: g => { const c = seniors(g); return c.length ? { mid: U.pick(c).id } : null; },
      build: (g, c) => {
        const s = M(g, c.mid), m = me(g);
        if (!s || !m) return null;
        const p = s.projectId && G().project(g, s.projectId);
        if (!work(p) || p.lead !== s.id || p.authors.includes(m.id)) return null;
        const mine = myLead(g);
        return {
          title: `${s.role === 'postdoc' ? '博后' : '师兄师姐'}拉你合作`, portrait: { member: s.id },
          text: `${U.esc(s.name)} 在做《${U.esc(p.title)}》，想请你帮忙跑一部分实验，论文上给你署名。`,
          choices: [
            { label: '帮忙，多一篇合作论文', hint: `这篇论文会署上你的名字（多半是二作）${mine ? ' · 你自己的课题进度 -10%' : ''} · 人脉 +1`, def: true,
              apply: g => {
                p.authors.push(m.id);
                if (p.contrib) p.contrib[m.id] = (p.contrib[s.id] || 0) * 0.3 + 1;
                shift(mine, -0.1);
                g.phd.network += 1;
                S().addMood(s, 5);
                G().log(g, `你加入了 ${s.name} 的课题《${S().short(p.title)}》`, 'info');
              } },
            { label: '婉拒，专心做自己的', hint: `${sn(s.name)}有点失望`, apply: () => S().addMood(s, -3) },
          ],
        };
      },
    },

    phd_mentee: {
      phd: true, weight: g => (juniors(g).length && myLead(g) && myLead(g).helpers.length < 2 ? 0.8 : 0), cd: 200, minor: true,
      ctx: g => { const c = juniors(g); return c.length ? { mid: U.pick(c).id } : null; },
      build: (g, c) => {
        const j = M(g, c.mid), m = me(g), p = myLead(g);
        if (!j || !m || !p || p.helpers.length >= 2 || p.helpers.includes(j.id)) return null;
        return {
          title: '带一带新人', portrait: { pi: true },
          text: `${U.esc(g.pi.name)} 找到你：“${U.esc(j.name)}（${S().ROLE_NAMES[j.role]}）还没上手，你带带 TA，让 TA 跟着你做《${U.esc(S().short(p.title))}》。”`,
          choices: [
            { label: '好，带着 TA 一起做', hint: 'TA 加入你的课题帮忙 · 导师信任 +3 · 带学生的经验（找教职加分，将来 TA 可能跟你走）', def: true,
              apply: g => { S().phdMentor(g, j, p); S().addTrust(m, 3); } },
            { label: '我自己的事都忙不过来', hint: '导师信任 -3', apply: () => S().addTrust(m, -3) },
          ],
        };
      },
    },

    phd_advisor_task: {
      phd: true, weight: 0.8, cd: 240,
      ctx: g => ({ what: g.region === 'cn'
        ? U.pick(['帮忙写国自然的申请书', '整理项目结题报告', '准备项目中期检查的材料', '做横向项目的交付'])
        : U.pick(['帮忙写 NSF 的申请书', '准备项目年度报告', '给合作公司做演示', '帮忙准备一个讲座的材料']) }),
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const mine = myLead(g);
        return {
          title: '导师有事找你', portrait: { pi: true },
          text: `${U.esc(g.pi.name)} 想让你${c.what}，大概要占用你一个月。`,
          choices: [
            { label: '没问题', hint: `${mine ? '自己的课题进度 -12% · ' : ''}导师信任 +8 · 写作 +1 · 人脉 +1`, def: true,
              apply: g => { shift(mine, -0.12); S().addTrust(m, 8); S().bumpStat(m, 'write', 1); g.phd.network += 1; } },
            { label: '委婉推掉，论文要紧', hint: '导师信任 -6', apply: () => S().addTrust(m, -6) },
          ],
        };
      },
    },

    phd_review: {
      phd: true, weight: 0.8, cd: 180, minor: true,
      ctx: g => ({ v: U.pick(S().venuesFor(g)).id }),
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        return {
          title: '帮导师审稿', portrait: { pi: true },
          text: `${U.esc(g.pi.name)} 把 ${RS.VENUES[c.v].name} 的两篇审稿任务转给了你：“你先写初稿，我来把关。”`,
          choices: [
            { label: '认真审', hint: '写作 +1.5 · 想法 +0.5 · 心情 -2 · 导师信任 +2', def: true,
              apply: () => { S().bumpStat(m, 'write', 1.5); S().bumpStat(m, 'idea', 0.5); S().addMood(m, -2); S().addTrust(m, 2); } },
            { label: '随便写写', hint: '导师信任 -2', apply: () => S().addTrust(m, -2) },
          ],
        };
      },
    },

    phd_summer_school: {
      phd: true, weight: g => ([6, 7].includes(G().month(g)) ? 1.5 : 0), cd: 300, minor: true,
      ctx: g => ({ where: U.pick(G().region(g).univsTop || G().region(g).univs) }),
      build: (g, c) => {
        const m = me(g);
        if (!m || m.status !== 'active') return null;
        return {
          title: '暑期学校', portrait: { icon: 'book' },
          text: `${U.esc(c.where)} 办了一期${G().area(g).name}暑期学校，讲者都是领域里的大牛，还有学生海报环节。`,
          choices: [
            { label: '报名参加', hint: '离开 7 天 · 想法 +2 · 人脉 +3 · 心情 +6', def: true,
              apply: g => { m.status = 'away'; m.awayUntil = g.day + 7; m.awayWhy = '暑期学校'; S().bumpStat(m, 'idea', 2); g.phd.network += 3; S().addMood(m, 6); } },
            { label: '不去了', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    phd_impostor: {
      phd: true, weight: g => { const m = me(g); return m && m.mood < 60 ? 1 : 0.4; }, cd: 240, minor: true,
      ctx: () => ({}),
      build: g => {
        const m = me(g);
        if (!m) return null;
        return {
          title: '冒充者综合征', portrait: { member: m.id },
          text: '组会上听完师兄师姐的报告，你突然觉得自己什么都不会，好像随时会被人发现“其实是混进来的”。',
          choices: [
            { label: '和同学聊聊', hint: '心情 +8（原来大家都这么觉得）', def: true, apply: () => S().addMood(m, 8) },
            { label: '去学校的心理咨询中心', hint: '离开 3 天 · 心情 +15', apply: g => { m.status = 'away'; m.awayUntil = g.day + 3; m.awayWhy = '休息'; S().addMood(m, 15); } },
            { label: '化焦虑为动力', hint: '课题进度 +5% · 心情 -5', apply: g => { shift(myLead(g), 0.05); S().addMood(m, -5); } },
          ],
        };
      },
    },

    phd_money: {
      phd: true, weight: 0.6, cd: 360, minor: true,
      ctx: () => ({ roll: Math.random() }),
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const a = adv(g);
        const p = a.id === 'star' ? 0.6 : a.id === 'young' ? 0.3 : 0.45;
        return {
          title: '补贴不够花', portrait: { member: m.id },
          text: g.region === 'cn' ? '房租又涨了，每个月的博士生补贴交完房租就不剩多少了。' : '房租又涨了，你的 stipend 交完房租，只够天天吃泡面。',
          choices: [
            { label: '接点家教 / 外包', hint: '课题进度 -5% · 心情 +2（手头宽裕点）', apply: g => { shift(myLead(g), -0.05); S().addMood(m, 2); } },
            { label: '跟导师提涨补贴', hint: `成功率约 ${U.pct(p)} · 成功心情 +10，失败导师信任 -2`, def: true,
              apply: g => { if (c.roll < p) { S().addMood(m, 10); G().log(g, `${g.pi.name} 给你涨了补贴`, 'good'); } else { S().addTrust(m, -2); G().log(g, '导师说经费紧张，涨补贴的事以后再说', 'info'); } } },
            { label: '省着点花', hint: '心情 -4', apply: () => S().addMood(m, -4) },
          ],
        };
      },
    },

    phd_life: {
      phd: true, weight: 0.6, cd: 300, minor: true,
      ctx: () => ({ i: U.int(0, 2) }),
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        const away = (days, why, mood) => g => { m.status = 'away'; m.awayUntil = g.day + days; m.awayWhy = why; S().addMood(m, mood); };
        const V = [
          { title: '异地恋', text: '你和异地的另一半已经两个月没见面了，电话里对方的语气有点低落。',
            choices: [{ label: '周末飞过去', hint: '离开 4 天 · 心情 +12', def: true, apply: away(4, '探亲', 12) }, { label: '每天视频', hint: '心情 +3', apply: () => S().addMood(m, 3) }] },
          { title: '家里来电', text: '家里打来电话：“读这么久博士，什么时候才能工作？隔壁家孩子都买房了……”',
            choices: [{ label: '耐心解释读博在做什么', hint: '心情 -2', def: true, apply: () => S().addMood(m, -2) }, { label: '报喜不报忧', hint: '心情 +2', apply: () => S().addMood(m, 2) }] },
          { title: '老友的婚礼', text: '本科室友要结婚了，邀请你去当伴郎 / 伴娘。',
            choices: [{ label: '去！', hint: '离开 3 天 · 心情 +10', def: true, apply: away(3, '参加婚礼', 10) }, { label: '包个红包，人就不去了', hint: '心情 -1', apply: () => S().addMood(m, -1) }] },
        ];
        const v = V[c.i] || V[0];
        return { title: v.title, portrait: { member: m.id }, text: v.text, choices: v.choices };
      },
    },

    phd_fellow: {
      phd: true, weight: g => (S().phdFellowName(g) ? 0.7 : 0), cd: 360, minor: true,
      ctx: () => ({ roll: Math.random() }),
      build: (g, c) => {
        const m = me(g);
        const name = S().phdFellowName(g);
        if (!m || !name) return null;
        const p = U.clamp(0.12 + (avg(m) - 50) / 80 + (m.firstA || 0) * 0.12 + (m.first || 0) * 0.05 + g.rep / 1500 + ((m.trust == null ? 55 : m.trust) - 50) / 200, 0.06, 0.8);
        return {
          title: '奖学金申请', portrait: { icon: 'star' },
          text: `<b>${name}</b> 开始申请了。需要研究计划、推荐信和你的论文清单。${g.region === 'us' ? '拿到的话，接下来几年你的工资由奖学金来付，导师会很高兴。' : '评上的话，简历上就多了一行分量很重的经历。'}`,
          choices: [
            { label: '认真准备材料', hint: `心情 -3 · 成功率约 ${U.pct(p)} · 找教职时加分`, def: true,
              apply: g => {
                S().addMood(m, -3);
                if (c.roll < p) {
                  g.phd.awards.push(name);
                  if (g.region === 'us') { m.funding = 'fellow'; m.fellowUntil = g.day + 2 * 360; }
                  S().addMood(m, 15); S().addTrust(m, 3);
                  S().phdMilestone(g, 'fellow-' + name, `获得${name}`);
                  G().log(g, `你获得了${name}！`, 'gold');
                  RS.bus.emit('toast', { text: `获得${name}`, kind: 'gold' });
                } else G().log(g, `${name}没有申请上`, 'info');
              } },
            { label: '今年不申请了', hint: '没有影响', apply: nop },
          ],
        };
      },
    },

    phd_scooped: {
      phd: true, weight: g => { const p = myLead(g); return p && (p.phase === 'idea' || p.phase === 'exp') ? 0.45 * S().areaHeat(g) : 0; }, cd: 360,
      ctx: () => ({}),
      build: g => {
        const p = myLead(g), m = me(g);
        if (!p || !m || !(p.phase === 'idea' || p.phase === 'exp')) return null;
        return {
          title: '撞车了！', portrait: { member: m.id },
          text: `arXiv 上刚挂出一篇论文，和你正在做的《${U.esc(p.title)}》几乎一模一样！你盯着屏幕发了半天呆。`,
          choices: [
            { label: '换个角度继续做', hint: '当前阶段进度减半 · 论文质量 +1', def: true, apply: () => { p.prog *= 0.5; p.bonus += 1; } },
            { label: '加速抢发', hint: '30 天内效率 ×1.6 · 论文质量 -5 · 心情 -8', apply: () => { p.rush = 30; p.bonus -= 5; S().addMood(m, -8); } },
            { label: '放弃，重新选题', hint: '课题作废 · 心情 -10', apply: g => { S().addMood(m, -10); m.lastDone = { title: '', topic: p.topic }; S().abandonProject(g, p, '因撞车被放弃'); } },
          ],
        };
      },
    },

    phd_advisor_away: {
      phd: true, weight: g => (adv(g).id !== 'young' && !(g.flags.sabbaticalUntil > g.day) ? 0.3 : 0), cd: 900,
      ctx: g => ({ where: U.pick(G().region(g).companies) }),
      build: (g, c) => {
        const m = me(g);
        if (!m) return null;
        return {
          title: '导师要去学术休假', portrait: { pi: true },
          text: `${U.esc(g.pi.name)} 宣布：下学期起去 ${U.esc(c.where)} 学术休假一年，组会改成线上，一个月一次。`,
          choices: [
            { label: '正好可以自由探索', hint: '这一年导师指导变少 · 心情 +6', def: true, apply: g => { g.flags.sabbaticalUntil = g.day + 360; S().addMood(m, 6); } },
            { label: '申请跟着去访问三个月', hint: '离开 90 天 · 人脉 +6 · 编程 +3 · 导师信任 +3',
              apply: g => { g.flags.sabbaticalUntil = g.day + 360; m.status = 'away'; m.awayUntil = g.day + 90; m.awayWhy = `在 ${c.where} 访问`; g.phd.network += 6; S().bumpStat(m, 'code', 3); S().addTrust(m, 3); } },
          ],
        };
      },
    },

    phd_gpu_queue: {
      phd: true, minor: true, cd: 150,
      weight: g => { const p = myLead(g); return G().area(g).compute >= 0.3 && p && p.phase === 'exp' && S().dayContext(g).ratio < 1 ? 1 : 0; },
      ctx: () => ({}),
      build: g => {
        const p = myLead(g), m = me(g);
        if (!p || !m) return null;
        const R = G().region(g);
        return {
          title: '抢不到卡', portrait: { icon: 'gpu' },
          text: `组里的服务器排满了，你的《${U.esc(S().short(p.title))}》的实验已经排了三天队。`,
          choices: [
            { label: '半夜起来跑实验', hint: '实验进度 +5% · 心情 -4', def: true, apply: () => { shift(p, 0.05); S().addMood(m, -4); } },
            { label: '找导师要钱租云服务器', hint: `导师花 ${G().money(g, R.cloud.price)} · 一个月内算力 +${R.cloud.units} · 导师信任 -1`,
              apply: g => { S().spend(g, R.cloud.price, 'compute'); g.flags.tempUnits = R.cloud.units; g.flags.tempUntil = g.day + 30; S().addTrust(m, -1); } },
            { label: '等着排队', hint: '实验进度 -3%', apply: () => shift(p, -0.03) },
          ],
        };
      },
    },

    phd_labmate: {
      phd: true, weight: g => (labmates(g).length ? 0.4 : 0), cd: 150, minor: true,
      ctx: g => { const c = labmates(g); return c.length ? { mid: U.pick(c).id, i: U.int(0, 2) } : null; },
      build: (g, c) => {
        const x = M(g, c.mid), m = me(g);
        if (!x || !m) return null;
        const V = [
          { title: '同门的低谷', text: `${U.esc(x.name)} 的论文又被拒了，一个人在工位上发呆。`,
            choices: [{ label: '拉 TA 去吃顿好的', hint: '你和 TA 心情 +5', def: true, apply: () => { S().addMood(x, 5); S().addMood(m, 5); } }, { label: '不打扰了', hint: '没有影响', apply: nop }] },
          { title: '好用的工具', text: `${U.esc(x.name)} 半夜在群里分享了一个自己写的实验管理工具，大家都说好用。`,
            choices: [{ label: '学一学', hint: '编程 +1', def: true, apply: () => S().bumpStat(m, 'code', 1) }, { label: '先收藏，回头再看', hint: '没有影响', apply: nop }] },
          { title: '散伙饭', text: `${U.esc(x.name)} 要${x.role === 'ug' ? '本科毕业' : '离开实验室'}了，请大家吃饭。`,
            choices: [{ label: '去，好好道个别', hint: '心情 +4 · 人脉 +1', def: true, apply: g => { S().addMood(m, 4); g.phd.network += 1; } }, { label: '在赶 DDL，去不了', hint: '心情 -2', apply: () => S().addMood(m, -2) }] },
        ];
        const v = V[c.i] || V[0];
        return { title: v.title, portrait: { member: x.id }, text: v.text, choices: v.choices };
      },
    },

    // 你的论文火了
    phd_viral: {
      phd: true, weight: g => (S().myPapers(g).some(p => g.day - p.day < 360 && !p.viral && p.tier !== 'P') ? 0.4 : 0), cd: 400,
      ctx: g => { const c = S().myPapers(g).filter(p => g.day - p.day < 360 && !p.viral && p.tier !== 'P'); return c.length ? { pid: U.pick(c).id } : null; },
      instant: (g, c) => {
        const pa = g.papers.find(p => p.id === c.pid);
        if (!pa) return true;
        pa.viral = true;
        pa.rate *= 2;
        g.phd.network += 2;
        G().log(g, `你的论文《${S().short(pa.title)}》在社交媒体上火了，好多人来加你好友（人脉 +2）`, 'gold');
        RS.bus.emit('toast', { text: '你的论文出圈了！', kind: 'gold' });
        return true;
      },
    },

    // 系里 / 学院的博士生奖项
    phd_award: {
      phd: true, cd: 360,
      weight: g => { const m = me(g); return m && (m.firstA || 0) >= 2 && !g.phd.awards.some(a => /学术之星|优秀博士生/.test(a)) ? 0.5 : 0; },
      ctx: () => ({}),
      instant: g => {
        const name = g.region === 'cn' ? '学院“学术之星”' : '系里的优秀博士生研究奖';
        g.phd.awards.push(name);
        S().addMood(me(g), 10);
        S().phdMilestone(g, 'award', `获得${name}`);
        G().log(g, `你获得了${name}！`, 'gold');
        RS.bus.emit('toast', { text: `获得${name}`, kind: 'gold' });
        return true;
      },
    },
  });
})();
