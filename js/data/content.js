/* 内容数据：姓名、性格特质、PI 背景、设施、成就、审稿意见 */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const U = RS.U;

  // ---------- 姓名 ----------
  const CN_SUR = '王李张刘陈杨黄赵吴周徐孙马朱胡郭何高林罗郑梁谢宋唐许韩冯邓曹彭曾肖田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤'.split('');
  const CN_GIVEN = ['子涵', '浩然', '欣怡', '雨桐', '梓轩', '思远', '一鸣', '嘉怡', '宇航', '诗涵', '俊杰', '晨曦', '天佑', '若曦', '博文', '子墨', '佳琪', '明哲', '雅琪', '泽宇', '心怡', '文轩', '可馨', '皓轩', '梦瑶', '致远', '语嫣', '昊天', '安琪', '志强', '晓东', '晓燕', '海洋', '振宇', '静怡', '嘉豪', '婉婷', '思琪', '鹏飞', '一凡', '星辰', '子豪', '乐言', '书瑶', '景行', '知秋', '沐阳', '清扬', '睿', '涛', '磊', '婷', '悦', '航', '洋', '琳', '晗', '骁', '玥', '哲'];
  const EN_FIRST = ['Alex', 'Emily', 'Michael', 'Sarah', 'David', 'Jessica', 'Daniel', 'Olivia', 'Ryan', 'Sophia', 'Kevin', 'Emma', 'Jason', 'Hannah', 'Brian', 'Grace', 'Tyler', 'Chloe', 'Ethan', 'Mia', 'Noah', 'Ava', 'Lucas', 'Zoe', 'Nathan', 'Lily', 'Jacob', 'Ella', 'Owen', 'Nora'];
  const EN_LAST = ['Smith', 'Johnson', 'Brown', 'Miller', 'Davis', 'Wilson', 'Anderson', 'Taylor', 'Moore', 'Martin', 'Thompson', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Hill', 'Campbell', 'Mitchell', 'Carter', 'Turner', 'Parker', 'Collins', 'Evans', 'Morgan', 'Cooper', 'Reed', 'Bell', 'Ward', 'Brooks', 'Foster'];
  const IN_FIRST = ['Priya', 'Rahul', 'Ananya', 'Arjun', 'Vikram', 'Sneha', 'Aditya', 'Kavya', 'Rohan', 'Ishaan', 'Neha', 'Karthik', 'Divya', 'Siddharth', 'Meera', 'Varun', 'Pooja', 'Nikhil'];
  const IN_LAST = ['Sharma', 'Gupta', 'Iyer', 'Patel', 'Reddy', 'Nair', 'Kumar', 'Rao', 'Mehta', 'Singh', 'Joshi', 'Krishnan', 'Menon', 'Bose', 'Agarwal', 'Das'];
  const KR_FIRST = ['Minjun', 'Jiwoo', 'Seoyeon', 'Hyunwoo', 'Jiho', 'Soyeon', 'Dohyun', 'Yuna'];
  const KR_LAST = ['Kim', 'Park', 'Lee', 'Choi', 'Jung', 'Kang', 'Cho', 'Yoon'];
  const OTHER = ['Lukas Müller', 'Sofia Rossi', 'Mateo García', 'Elena Petrova', 'Jonas Schmidt', 'Chiara Bianchi', 'Pierre Dubois', 'Anna Kowalska', 'Yuki Tanaka', 'Haruto Sato', 'Aoi Suzuki', 'Ahmed Hassan', 'Fatima Rahimi', 'Omar Haddad', 'Nguyen Minh An', 'Tran Thu Linh', 'Lars Eriksen', 'Ines Silva'];

  function cnName() {
    let s = U.pick(CN_SUR);
    if (U.chance(0.02)) s = U.pick(['欧阳', '司马', '上官', '诸葛']);
    return s + U.pick(CN_GIVEN);
  }
  RS.randomName = function (region) {
    if (region === 'cn') return cnName();
    const r = Math.random();
    if (r < 0.45) return cnName();
    if (r < 0.65) return U.pick(IN_FIRST) + ' ' + U.pick(IN_LAST);
    if (r < 0.85) return U.pick(EN_FIRST) + ' ' + U.pick(EN_LAST);
    if (r < 0.91) return U.pick(KR_FIRST) + ' ' + U.pick(KR_LAST);
    return U.pick(OTHER);
  };
  // 界面上显示的短名（中文名取名，英文名取 first name）
  RS.shortName = function (name) {
    if (/^[一-龥]+$/.test(name)) return name.length >= 3 ? name.slice(-2) : name;
    return name.split(' ')[0];
  };

  // ---------- 生源学校（按层次） ----------
  RS.SCHOOLS = {
    cn: [
      ['某双非一本', '深圳大学', '杭州电子科技大学', '南京邮电大学', '北京工业大学', '重庆邮电大学', '燕山大学', '江南大学', '广东工业大学'],
      ['哈尔滨工业大学', '华中科技大学', '西安交通大学', '北京航空航天大学', '武汉大学', '中山大学', '东南大学', '同济大学', '电子科技大学', '北京邮电大学', '西安电子科技大学', '四川大学', '山东大学', '厦门大学', '天津大学', '大连理工大学', '华南理工大学'],
      ['清华大学', '北京大学', '浙江大学', '上海交通大学', '中国科学技术大学', '南京大学', '复旦大学'],
    ],
    us: [
      ['深圳大学', '杭州电子科技大学', 'VIT', 'Anna University', 'Arizona State', 'UT Dallas', 'Rutgers', 'NC State', 'Penn State'],
      ['武汉大学', '华中科技大学', '北京邮电大学', '南京大学', '复旦大学', 'IIT Madras', 'BITS Pilani', 'UIUC', 'Georgia Tech', 'UW', 'UCLA', 'UMich', 'Purdue', 'NUS', 'NTU'],
      ['清华大学', '北京大学', '浙江大学', '上海交通大学', '中国科学技术大学', 'IIT Bombay', 'IIT Delhi', 'MIT', 'Stanford', 'UC Berkeley', 'CMU', 'KAIST', 'Seoul National University', 'University of Toronto', 'ETH Zurich'],
    ],
  };

  // ---------- 性格特质 ----------
  RS.TRAITS = {
    grinder: { name: '卷王', good: 1, desc: '工作效率 +25%，但心情会慢慢变差', prod: 1.25, mood: -0.05 },
    slacker: { name: '摸鱼达人', good: -1, desc: '工作效率 -20%，但心态极好', prod: 0.8, mood: 0.05 },
    genius: { name: '天赋异禀', good: 1, desc: '能力成长速度 +60%', growth: 1.6 },
    ideas: { name: '点子王', good: 1, desc: '构思阶段效率 +35%', phase: { idea: 1.35 } },
    coder: { name: '代码狂魔', good: 1, desc: '实验阶段效率 +30%', phase: { exp: 1.3 } },
    writer: { name: '妙笔生花', good: 1, desc: '写作阶段效率 +30%，论文表达 +4', phase: { write: 1.3 }, cla: 4 },
    perfect: { name: '完美主义', good: 0, desc: '论文质量 +5，但效率 -15%', prod: 0.85, quality: 5 },
    procrast: { name: '拖延症', good: 0, desc: '平时效率 -20%，DDL 冲刺时效率翻倍', prod: 0.8, ddl: 2 },
    optimist: { name: '乐天派', good: 1, desc: '心情恢复更快，被拒稿也不太难过', mood: 0.04, rejectMood: 0.5 },
    fragile: { name: '玻璃心', good: -1, desc: '被拒稿时心情大幅下降', rejectMood: 2 },
    social: { name: '社牛', good: 1, desc: '带动实验室气氛，协作效率更高', teamMood: 0.012, helper: 1.3 },
    loner: { name: '独狼', good: 0, desc: '独立工作效率 +15%，但不擅长协作', solo: 1.15, helper: 0.7 },
    nightowl: { name: '夜猫子', good: 0, desc: '深夜效率极高，白天昏昏欲睡（总体略有提升）', prod: 1.06 },
    industry: { name: '心向大厂', good: 0, desc: '更容易被大厂实习和高薪吸引', intern: 2.2 },
    academic: { name: '学术理想', good: 1, desc: '毕业后更想留在学术界', academia: 0.35 },
    influencer: { name: '学术网红', good: 1, desc: '擅长社交媒体宣传，论文引用 +35%', cite: 1.35 },
    lucky: { name: '欧皇', good: 1, desc: '总能遇到温柔的审稿人', luck: 3 },
    unlucky: { name: '非酋', good: -1, desc: '总能遇到 Reviewer 2', luck: -3 },
    mathy: { name: '数学系出身', good: 1, desc: '理论功底扎实，想法分 +6', ideaBonus: 6 },
    gamer: { name: '游戏高手', good: 0, desc: '实验室有游戏机时心情更好', game: true },
    coffee: { name: '咖啡续命', good: 0, desc: '有咖啡机时效率 +10%，没有时 -5%', coffee: true },
  };
  RS.randomTraits = function (q) {
    const ids = Object.keys(RS.TRAITS);
    const n = U.chance(0.35) ? 2 : 1;
    const out = [];
    while (out.length < n) {
      const id = U.weighted(ids, k => {
        const t = RS.TRAITS[k];
        if (out.includes(k)) return 0;
        if (out.includes('lucky') && k === 'unlucky') return 0;
        if (out.includes('unlucky') && k === 'lucky') return 0;
        if (out.includes('grinder') && k === 'slacker') return 0;
        if (out.includes('slacker') && k === 'grinder') return 0;
        if (out.includes('social') && k === 'loner') return 0;
        if (out.includes('loner') && k === 'social') return 0;
        if (out.includes('optimist') && k === 'fragile') return 0;
        if (out.includes('fragile') && k === 'optimist') return 0;
        // 优秀的候选人更可能有好特质
        return t.good > 0 ? 1 + (q - 50) / 60 : t.good < 0 ? Math.max(0.2, 1 - (q - 50) / 60) : 1;
      });
      if (!id) break;
      out.push(id);
    }
    return out;
  };

  // ---------- PI 背景 ----------
  RS.PERKS = [
    { id: 'star', name: '学术新星', desc: '博士期间拿过最佳论文。初始声望 +15，研究 +8', rep: 15, stats: { research: 8 } },
    { id: 'industry', name: '大厂回归', desc: '在工业界做过研究员。人脉 +12，自带一台工作站，企业合作更容易谈成', stats: { network: 12 }, gpu: 'ws', contract: 1.6 },
    { id: 'postdoc', name: '名校博后', desc: '在顶尖实验室做过博后。写作 +10，研究 +5', stats: { writing: 10, research: 5 } },
    { id: 'teacher', name: '教学能手', desc: '热爱讲台。教学 +20，上课消耗的精力 -30%', stats: { teaching: 20 }, teachCost: 0.7 },
    { id: 'social', name: '社交达人', desc: '和谁都聊得来。人脉 +15，学生心情更好', stats: { network: 15 }, moodBonus: 0.012 },
    { id: 'iron', name: '铁人', desc: '精力旺盛，恢复速度 +25%', energyRegen: 1.25 },
  ];

  // ---------- 设施（价格以美元计，中国区乘以 ppp 系数） ----------
  RS.FACILITIES = [
    { id: 'coffee', name: '咖啡机', cost: 1500, maint: 40, desc: '全员效率 +4%', prod: 0.04, mood: 0.002 },
    { id: 'plants', name: '绿植', cost: 300, maint: 10, desc: '心情 +', mood: 0.004 },
    { id: 'snack', name: '零食柜', cost: 800, maint: 120, desc: '心情 ++', mood: 0.008 },
    { id: 'whiteboard', name: '白板墙', cost: 1200, maint: 0, desc: '构思效率 +10%', phase: { idea: 0.1 } },
    { id: 'bookshelf', name: '专业书架', cost: 1000, maint: 0, desc: '构思 +5%，写作 +5%', phase: { idea: 0.05, write: 0.05 } },
    { id: 'chairs', name: '人体工学椅', cost: 4000, maint: 0, desc: '全员效率 +3%，心情 +', prod: 0.03, mood: 0.002 },
    { id: 'monitors', name: '双屏显示器', cost: 3000, maint: 0, desc: '实验效率 +8%', phase: { exp: 0.08 } },
    { id: 'sofa', name: '休息沙发', cost: 2000, maint: 0, desc: '心情 +，PI 精力恢复 +0.1/天', mood: 0.004, energy: 0.1 },
    { id: 'console', name: '游戏机', cost: 600, maint: 0, desc: '心情 ++，效率 -1%', mood: 0.008, prod: -0.01 },
    { id: 'booth', name: '静音电话亭', cost: 6000, maint: 0, desc: '写作效率 +10%', phase: { write: 0.1 } },
    { id: 'projector', name: '会议投影仪', cost: 3500, maint: 0, desc: '组会更高效：指导学生消耗的精力 -25%', meeting: 0.25 },
    { id: 'nas', name: '备份 NAS', cost: 5000, maint: 50, desc: '服务器硬盘损坏时不会丢数据', backup: true },
    { id: 'cat', name: '实验室猫', cost: 500, maint: 100, desc: '全员心情 +++（偶尔捣乱）。需要先有沙发', mood: 0.012, req: 'sofa' },
    { id: 'printer3d', name: '3D 打印机', cost: 4000, maint: 30, desc: '机器人 / 人机交互 / 图形学实验效率 +10%', area: { robo: 0.1, hci: 0.1, graphics: 0.08 } },
    { id: 'robotarm', name: '机械臂平台', cost: 60000, maint: 300, desc: '机器人方向实验效率 +30%（其他方向 +3%）', area: { robo: 0.3 }, areaDefault: 0.03 },
    { id: 'vr', name: 'VR 设备', cost: 5000, maint: 20, desc: '人机交互 / 图形学 / 视觉实验效率 +10%', area: { hci: 0.12, graphics: 0.1, cv: 0.05 } },
  ];
  RS.ROOMS = [
    { name: '小实验室', desks: 4, cost: 0, rep: 0 },
    { name: '标准实验室', desks: 8, cost: 20000, rep: 30 },
    { name: '大实验室', desks: 12, cost: 80000, rep: 100 },
    { name: '整层楼', desks: 16, cost: 250000, rep: 250 },
  ];

  // ---------- 审稿意见 ----------
  RS.REVIEWS = {
    bad: ['The novelty is limited.', 'The experiments are not convincing.', 'Why not compare with [my own paper]?', 'The method is too simple.', 'The method is too complicated.', 'Missing related work (see the 47 references below).', 'I did not fully understand the paper, so I lean towards rejection.', 'Please run experiments on a dataset ten times larger.', 'The writing needs significant improvement.', 'Strengths: none. Weaknesses: see above.', 'The theorem is trivial.', 'The improvement is marginal.', 'This is more suitable for a workshop.', 'I am an expert in this area (confidence: 5).'],
    good: ['Well-written and clearly motivated.', 'The idea is simple yet effective.', 'Strong empirical results.', 'This paper will have a significant impact.', 'I enjoyed reading this paper.', 'Solid theoretical analysis.'],
  };

  // ---------- 头像 ----------
  RS.AVATAR = {
    skin: ['#f6d5b8', '#eabf98', '#c99167', '#8d5a3b'],
    hair: ['#1a1c2c', '#2e2433', '#4a3328', '#6e4a2b', '#b08a52', '#b13e53', '#5d275d', '#94b0c2'],
    shirt: ['#b13e53', '#ef7d57', '#ffcd75', '#38b764', '#257179', '#3b5dc9', '#41a6f6', '#5d275d', '#f4f4f4', '#566c86', '#a7f070', '#73eff7'],
    pants: ['#29366f', '#333c57', '#566c86', '#4a3328'],
    styles: 6,
  };
  RS.randomAvatar = function () {
    const A = RS.AVATAR;
    return {
      skin: U.weighted([0, 1, 2, 3], i => [5, 4, 2, 1][i]),
      hair: U.weighted([0, 1, 2, 3, 4, 5, 6, 7], i => [8, 5, 4, 2, 1, 0.5, 0.4, 0.4][i]),
      style: U.int(0, A.styles - 1),
      shirt: U.int(0, A.shirt.length - 1),
      pants: U.int(0, A.pants.length - 1),
      glasses: U.chance(0.45),
    };
  };

  RS.LAB_NAMES = ['PIXEL Lab', 'BYTE Lab', 'NOVA Lab', 'ORCA Lab', 'LUMEN Lab', 'SPARK Lab', 'ECHO Lab', 'ATLAS Lab', 'MOCHI Lab', 'HALO Lab'];

  // ---------- 成就 ----------
  RS.ACHIEVEMENTS = [
    { id: 'first_paper', name: '处女作', desc: '发表第一篇论文', check: g => g.papers.length >= 1 },
    { id: 'first_a', name: '顶会初体验', desc: '发表第一篇 A 类论文', check: g => g.stats.pubs.A >= 1 },
    { id: 'a10', name: '顶会常客', desc: '累计发表 10 篇 A 类论文', check: g => g.stats.pubs.A >= 10 },
    { id: 'a50', name: '顶会收割机', desc: '累计发表 50 篇 A 类论文', check: g => g.stats.pubs.A >= 50 },
    { id: 'best', name: '最佳论文', desc: '获得一次最佳论文奖', check: g => g.stats.bestPapers >= 1 },
    { id: 'h10', name: 'h 指数 10', desc: 'h-index 达到 10', check: g => g.stats.h >= 10 },
    { id: 'h30', name: 'h 指数 30', desc: 'h-index 达到 30', check: g => g.stats.h >= 30 },
    { id: 'h60', name: 'h 指数 60', desc: 'h-index 达到 60', check: g => g.stats.h >= 60 },
    { id: 'c1k', name: '千次引用', desc: '总引用达到 1,000', check: g => g.stats.cites >= 1000 },
    { id: 'c10k', name: '万次引用', desc: '总引用达到 10,000', check: g => g.stats.cites >= 10000 },
    { id: 'c100k', name: '十万引用', desc: '总引用达到 100,000', check: g => g.stats.cites >= 100000 },
    { id: 'grant1', name: '第一桶金', desc: '第一次拿到基金', check: g => g.stats.grantsWon >= 1 },
    { id: 'grant10', name: '基金达人', desc: '累计拿到 10 个基金项目', check: g => g.stats.grantsWon >= 10 },
    { id: 'rich', name: '经费自由', desc: '账户余额达到起步经费的 3 倍', check: g => g.funds >= 3 * g.startup },
    { id: 'tenure', name: '终身教职', desc: '通过终期考核', check: g => g.pi.tenured },
    { id: 'full', name: '正教授', desc: '晋升为正教授', check: g => g.pi.title >= 2 },
    { id: 'grad1', name: '桃李初成', desc: '第一位博士生毕业', check: g => g.stats.phdGrads >= 1 },
    { id: 'grad10', name: '桃李满天下', desc: '培养 10 位博士', check: g => g.stats.phdGrads >= 10 },
    { id: 'prof', name: '青出于蓝', desc: '有学生成为大学教授', check: g => g.stats.profGrads >= 1 },
    { id: 'lab8', name: '小有规模', desc: '实验室成员达到 8 人', check: g => g.members.length >= 8 },
    { id: 'lab16', name: '人丁兴旺', desc: '实验室成员达到 16 人', check: g => g.members.length >= 16 },
    { id: 'compute100', name: '算力自由', desc: '拥有 100 单位以上算力', check: g => RS.G.computeUnits(g) >= 100 },
    { id: 'cat', name: '猫猫教授', desc: '实验室养了一只猫', check: g => !!g.facilities.cat },
    { id: 'r10', name: 'Reviewer 2 受害者', desc: '累计被拒稿 10 次', check: g => g.stats.rejects >= 10 },
    { id: 'r50', name: '百折不挠', desc: '累计被拒稿 50 次', check: g => g.stats.rejects >= 50 },
    { id: 'broke', name: '入不敷出', desc: '经费出现赤字', check: g => g.funds < 0 },
    { id: 'burnout', name: '燃尽了', desc: 'PI 精力耗尽', check: g => !!g.flags.burnout },
    { id: 'scooped', name: '撞车了', desc: '课题被别人抢先发表', check: g => !!g.flags.scooped },
    { id: 'harvest', name: '丰收年', desc: '一个自然年内发表 5 篇以上 A 类论文', check: g => !!g.flags.harvest },
    { id: 'hat', name: '戴上帽子', desc: '获得 CAREER / Sloan / 优青 / 杰青等人才称号', check: g => g.titles.length >= 1 },
    { id: 'fellow', name: 'Fellow', desc: '当选 IEEE / ACM / CCF Fellow', check: g => g.honors.some(h => /fellow/.test(h.id)) },
    { id: 'academician', name: '院士', desc: '当选院士', check: g => g.honors.some(h => h.id === 'nae' || h.id === 'cas') },
    { id: 'turing', name: '图灵奖', desc: '计算机科学的最高荣誉', check: g => g.honors.some(h => h.id === 'turing') },
    { id: 'viral', name: '出圈了', desc: '论文在社交媒体上爆火', check: g => !!g.flags.viral },
    { id: 'zen', name: '佛系导师', desc: '3 人以上实验室平均心情达到 90', check: g => g.members.length >= 3 && U.avg(g.members, m => m.mood) >= 90 },
  ];
})();
