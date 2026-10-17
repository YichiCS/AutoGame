/* 地区配置：北美 Tenure-Track 与 中国 预聘-长聘（非升即走） */
(function () {
  'use strict';
  const RS = (window.RS = window.RS || {});
  const G = () => RS.G; // 运行时再取，避免加载顺序问题

  function moneyUS(v) {
    const s = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e6) return s + '$' + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
    if (a >= 1e3) return s + '$' + (a / 1e3).toFixed(a >= 1e5 ? 0 : 1).replace(/\.0$/, '') + 'k';
    return s + '$' + Math.round(a);
  }
  function moneyCN(v) {
    const s = v < 0 ? '-' : '';
    const a = Math.abs(v);
    if (a >= 1e8) return s + '¥' + (a / 1e8).toFixed(2) + '亿';
    if (a >= 1e4) return s + '¥' + (a / 1e4).toFixed(a >= 1e6 ? 0 : 1).replace(/\.0$/, '') + '万';
    return s + '¥' + Math.round(a);
  }

  // 本科课程（研究生课的名字由你的研究方向生成）
  const COURSES = ['数据结构', '算法设计与分析', '操作系统', '计算机网络', '机器学习导论', '编译原理', '计算机组成原理', '数据库系统', '人工智能导论', '软件工程', '离散数学', '计算机图形学', '程序设计基础', '信息安全导论'];

  RS.REGIONS = {
    us: {
      id: 'us', name: '北美', sub: 'Tenure-Track',
      desc: '六年 Tenure 考核。经费主要靠 NSF 和企业捐赠，招生季从冬天开始，学生开销不小。',
      money: moneyUS, ppp: 1,
      start: [8, 16], piAge: 31,
      startText: '你拿到了助理教授的 offer，搬进了计算机系大楼里一间空荡荡的实验室。六年后的 Tenure 评审，将决定你能否留在学术界。',
      tiers: [
        { name: '顶尖名校', desc: '起步经费充足、学生优秀，但 Tenure 要求严苛', startup: 900000, cand: 8, offer: 0.12, taSlots: 2,
          schools: ['MIT', 'Stanford', 'CMU', 'UC Berkeley', 'Princeton', 'Cornell', 'UIUC', 'UW', 'Georgia Tech', 'Caltech', 'UT Austin', 'Harvard', 'Columbia', 'UCLA', 'UMich', 'UCSD'],
          req: { papersA: 12, funding: 1600000, phd: 5, teaching: 3.5, ugCourses: 3, rep: 180 } },
        { name: '研究型大学', desc: '中规中矩，推荐新手选择', startup: 650000, cand: 4, offer: 0.04, taSlots: 3,
          schools: ['Penn State', 'Purdue', 'Rutgers', 'Ohio State', 'Virginia Tech', 'UC Irvine', 'UMass Amherst', 'Arizona State', 'UW-Madison', 'UMD', 'USC', 'Northwestern', 'Duke', 'Northeastern', 'Texas A&M', 'Stony Brook', 'UC Davis', 'UC Santa Barbara', 'University of Minnesota', 'University of Utah', 'NC State', 'Boston University', 'Rice', 'Johns Hopkins'],
          req: { papersA: 8, funding: 1000000, phd: 4, teaching: 3.4, ugCourses: 4, rep: 130 } },
        { name: '新兴高校', desc: '经费紧张、生源一般，但考核相对宽松', startup: 400000, cand: -6, offer: -0.05, taSlots: 4,
          schools: ['Lakeside State University', 'Desert Tech', 'New Harbor University', 'Maple Valley College', 'Pine Ridge University', 'Riverbend State University', 'Coastal Plains University', 'Silver Lake Institute of Technology', 'Granite Peak University', 'Prairie State University', 'Red Rock University', 'Bayview Institute of Technology'],
          req: { papersA: 5, funding: 500000, phd: 3, teaching: 3.2, ugCourses: 5, rep: 80 } },
      ],
      evalKeys: ['papersA', 'funding', 'phd', 'teaching', 'ugCourses', 'rep'],
      evalDate: [5, 1], midYear: 3, finalYear: 6,
      titles: ['助理教授', '副教授（终身）', '正教授', '讲席教授'],
      promotions: [
        { to: 2, after: 5, rep: 220, papersA: 18, ugCourses: 8 },
        { to: 3, after: 4, rep: 480, papersA: 35, ugCourses: 12 },
      ],
      costs: { phd: 6000, ms: 0, ug: 0, postdoc: 7000, visit: 0, supplies: 400, suppliesPer: 100, travel: 2500, buyout: 20000, dept: 0 },
      // 学校从基金中提取的管理费（间接费用）比例
      overhead: { grant: 0.35, gift: 0.05, award: 0.05, contract: 0.3 },
      hasTA: true,
      semesters: [
        { id: 'fall', name: '秋季学期', start: [8, 25], len: 108 },
        { id: 'spring', name: '春季学期', start: [1, 12], len: 114 },
      ],
      holidays: [
        { name: '寒假', date: [12, 20], len: 14, away: false },
      ],
      gradDate: [5, 10],
      courses: COURSES,
      companies: ['G家研究院', 'M家 AI 实验室', 'A家云计算', 'N家显卡厂', 'OpenBrain', '某顶级量化基金', '硅谷独角兽 StartupX', 'X家自动驾驶', 'M家社交平台', '某芯片初创公司', '某机器人公司', '某 AI 安全公司'],
      // 毕业生去向、抢学生的对手学校；univsTop 是最好的那一批去处
      univs: ['MIT', 'Stanford', 'CMU', 'UC Berkeley', 'UIUC', 'UW', 'Cornell', 'Princeton', 'Georgia Tech', 'UCSD', 'UMich', 'UT Austin', 'Columbia', 'Caltech', 'Harvard', 'UCLA', 'NYU', 'UW-Madison', 'UMD', 'USC', 'Northwestern', 'Duke', 'Rice', 'Johns Hopkins', 'Penn State', 'Purdue', 'UMass Amherst', 'Northeastern', 'Brown', 'Yale', 'UPenn', 'UC Irvine', 'UC Santa Barbara', 'Stony Brook', 'Rutgers', 'Virginia Tech', 'Ohio State', 'Texas A&M', 'University of Toronto', 'University of Waterloo', 'ETH Zurich', 'EPFL', 'University of Oxford', 'University of Cambridge', 'NUS', 'HKUST', 'KAIST', '清华大学', '北京大学', '上海交通大学', '浙江大学'],
      univsTop: ['MIT', 'Stanford', 'CMU', 'UC Berkeley', 'UIUC', 'UW', 'Cornell', 'Princeton', 'Georgia Tech', 'UCSD', 'UMich', 'UT Austin', 'Columbia', 'Caltech', 'Harvard', 'ETH Zurich', '清华大学'],
      recruit: [
        { id: 'us_phd', name: 'PhD 招生季', text: '申请截止了！系里的招生系统里有一批学生勾选了你作为意向导师。', open: [12, 20], result: [4, 15], join: [8, 15],
          quota: { phd: [2, 3, 3, 4], ms: [2, 2, 3, 3] } },
      ],
      grants: [
        { id: 'crii', name: 'NSF CRII', full: 'NSF 新教师科研启动基金', amount: 175000, months: 24, open: [7, 1], deadline: [8, 25], result: 190, bar: 40, prestige: 4, effort: 25, maxWins: 1,
          elig: g => (G().careerYear(g) <= 3 ? null : '仅限入职 3 年内') },
        { id: 'career', name: 'NSF CAREER', full: 'NSF 杰出青年教师奖（Tenure 前最多申请 3 次）', amount: 550000, months: 60, open: [5, 10], deadline: [7, 25], result: 200, bar: 55, prestige: 15, effort: 40, maxWins: 1, maxApply: 3, title: 'NSF CAREER',
          elig: g => (g.pi.tenured ? '仅限 Tenure 前申请' : null) },
        { id: 'small', name: 'NSF CORE Small', full: 'NSF 核心项目（小型）', amount: 600000, months: 36, open: [9, 1], deadline: [11, 15], result: 180, bar: 51, prestige: 5, effort: 30, group: 'nsf_core',
          elig: () => null },
        { id: 'medium', name: 'NSF CORE Medium', full: 'NSF 核心项目（中型，需要一定声望）', amount: 1200000, months: 48, open: [9, 1], deadline: [11, 15], result: 180, bar: 62, prestige: 8, effort: 40, maxActive: 1, group: 'nsf_core',
          elig: g => (g.rep >= 60 ? null : '需要声望 ≥ 60') },
        { id: 'large', name: 'NSF CORE Large', full: 'NSF 核心项目（大型，多 PI 合作）', amount: 3000000, months: 60, open: [9, 1], deadline: [11, 15], result: 180, bar: 76, prestige: 14, effort: 50, maxActive: 1, group: 'nsf_core',
          elig: g => (g.rep >= 200 && g.pi.tenured ? null : '需要终身教职且声望 ≥ 200') },
        { id: 'gift', name: '科技巨头 Research Award', full: '大厂教职研究奖（企业捐赠，手续简单）', amount: 80000, months: 12, open: [2, 1], deadline: [3, 15], result: 120, bar: 42, prestige: 2, effort: 12, kind: 'gift',
          elig: () => null },
        { id: 'scholar', name: '大厂青年学者奖', full: '面向早期职业教师的企业奖励', amount: 60000, months: 12, open: [10, 1], deadline: [11, 20], result: 110, bar: 42, prestige: 3, effort: 12, kind: 'gift',
          elig: g => (G().careerYear(g) <= 7 ? null : '仅限入职 7 年内') },
        { id: 'sloan', name: 'Sloan Fellowship', full: 'Sloan 研究奖（青年学者最高荣誉之一）', amount: 75000, months: 24, open: [8, 1], deadline: [9, 15], result: 150, bar: 62, prestige: 12, effort: 15, maxWins: 1, kind: 'award', title: 'Sloan Fellow',
          elig: g => (!g.pi.tenured && G().careerYear(g) <= 6 ? null : '仅限 Tenure 前且入职 6 年内') },
        { id: 'gpu', name: 'GPU 厂商学术捐赠', full: '申请成功会直接捐赠一台 GPU 服务器（每三年最多一次）', gpu: true, amount: 0, months: 0, open: [3, 1], deadline: [4, 10], result: 90, bar: 48, prestige: 2, effort: 8, kind: 'gpu',
          elig: g => (G().area(g).compute < 0.3 ? '你的方向用不上 GPU' : G().wonWithin(g, 'gpu', 1080) ? '三年内已经获得过' : null) },
        { id: 'darpa', name: 'DARPA 项目', full: '国防高级研究计划局项目（金额大，要求高）', amount: 1800000, months: 36, deadline: null, result: 150, bar: 66, prestige: 9, effort: 45, maxActive: 1, special: true,
          elig: g => (g.rep >= 50 ? null : '需要声望 ≥ 50') },
        { id: 'contract', name: '企业合作研究项目', full: '企业资助的定向研究，需要学生投入时间做交付', amount: 300000, months: 24, deadline: null, result: 0, bar: 0, prestige: 0, effort: 0, special: true, kind: 'contract',
          elig: () => null },
      ],
      gpus: [
        { id: 'ws', name: 'RTX 工作站', desc: '双卡游戏显卡工作站，入门之选', price: 9000, units: 2, maint: 60, from: 2020, to: 2040 },
        { id: 'a100', name: 'A100 服务器', desc: '8 卡数据中心 GPU，老当益壮', price: 110000, units: 16, maint: 500, from: 2020, to: 2031 },
        { id: 'h100', name: 'H100 服务器', desc: '8 卡，训练大模型的主力', price: 260000, units: 45, maint: 1100, from: 2023, to: 2034 },
        { id: 'b200', name: 'B200 服务器', desc: '8 卡新一代旗舰', price: 420000, units: 100, maint: 1700, from: 2025, to: 2038 },
        { id: 'r200', name: 'R-200 超节点', desc: '液冷整机柜，算力怪兽', price: 620000, units: 230, maint: 2400, from: 2028, to: 2045 },
        { id: 'x1000', name: 'X-1000 光互联集群', desc: '光互联的未来算力', price: 900000, units: 520, maint: 3300, from: 2031, to: 2060 },
        { id: 'qc', name: '量子-经典混合计算机', desc: '据说能跑任何模型', price: 1500000, units: 1300, maint: 5200, from: 2036, to: 2099 },
      ],
      cloud: { name: '云 GPU 包月', price: 4000, units: 8 },
      honors: [
        { id: 'pecase', name: 'PECASE 总统青年科学家奖', rep: 15, chance: 0.1, cond: g => G().hasWon(g, 'career') && G().careerYear(g) <= 10 },
        { id: 'ieee_fellow', name: 'IEEE Fellow', rep: 30, chance: 0.2, cond: g => g.rep >= 500 && G().careerYear(g) >= 12 },
        { id: 'acm_fellow', name: 'ACM Fellow', rep: 40, chance: 0.18, cond: g => g.rep >= 650 && G().careerYear(g) >= 14 },
        { id: 'nae', name: '美国国家工程院院士', rep: 80, chance: 0.12, cond: g => g.rep >= 1200 && G().careerYear(g) >= 15 },
        { id: 'turing', name: '图灵奖', rep: 300, chance: 0.05, cond: g => g.rep >= 3000 && g.stats.bestPapers >= 3 && g.stats.cites >= 60000 },
      ],
    },

    cn: {
      id: 'cn', name: '中国', sub: '预聘-长聘',
      desc: '“非升即走”，三年中期 + 六年终期考核。国自然是重中之重，推免和考研两轮招生。',
      money: moneyCN, ppp: 4,
      start: [9, 1], piAge: 31,
      startText: '你作为青年人才入职了计算机学院，领到了钥匙和一间空实验室。预聘期六年，“非升即走”的倒计时已经开始。',
      tiers: [
        { name: '顶尖高校', desc: '启动经费高、生源好，但考核标准很高', startup: 1000000, cand: 8, offer: 0.12, taSlots: 0,
          schools: ['清华大学', '北京大学', '浙江大学', '上海交通大学', '中国科学技术大学', '南京大学', '复旦大学', '哈尔滨工业大学', '西安交通大学', '中国科学院大学'],
          req: { papersA: 10, nsfc: 2, funding: 2500000, students: 10, teaching: 3.6, ugCourses: 4, rep: 180 } },
        { name: '985/211 高校', desc: '中规中矩，推荐新手选择', startup: 600000, cand: 4, offer: 0.04, taSlots: 0,
          schools: ['华中科技大学', '北京航空航天大学', '武汉大学', '中山大学', '东南大学', '电子科技大学', '同济大学', '北京理工大学', '天津大学', '南开大学', '四川大学', '山东大学', '厦门大学', '大连理工大学', '华南理工大学', '吉林大学', '湖南大学', '中南大学', '重庆大学', '西北工业大学', '中国人民大学', '华东师范大学', '北京邮电大学', '西安电子科技大学', '南京航空航天大学', '南京理工大学', '苏州大学', '北京交通大学'],
          req: { papersA: 7, nsfc: 1, funding: 1500000, students: 8, teaching: 3.4, ugCourses: 5, rep: 130 } },
        { name: '双非高校', desc: '经费少、生源一般，但考核相对宽松', startup: 300000, cand: -6, offer: -0.05, taSlots: 0,
          schools: ['江海理工大学', '南山科技大学', '东湖信息工程大学', '北岭工业大学', '临江大学', '云岭科技大学', '青石理工学院', '海川信息科技大学', '松原工业大学', '西陵师范大学', '滨海科技大学', '长河电子科技大学'],
          req: { papersA: 4, nsfc: 1, funding: 800000, students: 5, teaching: 3.2, ugCourses: 6, rep: 80 } },
      ],
      evalKeys: ['papersA', 'nsfc', 'funding', 'students', 'teaching', 'ugCourses', 'rep'],
      evalDate: [7, 1], midYear: 3, finalYear: 6,
      titles: ['助理教授（预聘）', '长聘副教授', '教授', '讲席教授'],
      promotions: [
        { to: 2, after: 3, rep: 170, papersA: 12, ugCourses: 9 },
        { to: 3, after: 4, rep: 450, papersA: 30, ugCourses: 14 },
      ],
      costs: { phd: 4000, ms: 2000, ug: 0, postdoc: 25000, visit: 0, supplies: 3000, suppliesPer: 600, travel: 12000, buyout: 0, dept: 2000 },
      overhead: { grant: 0.1, gift: 0.05, award: 0.05, contract: 0.15 },
      hasTA: false,
      semesters: [
        { id: 'fall', name: '秋季学期', start: [9, 1], len: 130 },
        { id: 'spring', name: '春季学期', start: [2, 25], len: 120 },
      ],
      holidays: [
        { name: '春节', date: [2, 1], len: 14, away: true },
        { name: '国庆假期', date: [10, 1], len: 7, away: false },
      ],
      gradDate: [6, 15],
      courses: COURSES,
      companies: ['鹅厂', '字节', '阿里', 'H 厂', '度厂', '某量化私募', '某 AI 独角兽', '某自动驾驶公司', '某芯片设计公司', '某大模型创业公司', '某机器人公司', '某手机厂商'],
      univs: ['清华大学', '北京大学', '浙江大学', '上海交通大学', '中国科学技术大学', '南京大学', '复旦大学', '哈尔滨工业大学', '华中科技大学', '北京航空航天大学', '西安交通大学', '武汉大学', '同济大学', '南开大学', '天津大学', '东南大学', '中山大学', '电子科技大学', '北京邮电大学', '北京理工大学', '四川大学', '山东大学', '厦门大学', '大连理工大学', '华南理工大学', '中国科学院大学', '中国人民大学', '南方科技大学', '上海科技大学', '西湖大学', '深圳大学', '香港科技大学', '香港中文大学', '香港大学', '新加坡国立大学', '南洋理工大学'],
      univsTop: ['清华大学', '北京大学', '浙江大学', '上海交通大学', '中国科学技术大学', '南京大学', '复旦大学', '哈尔滨工业大学', '西安交通大学', '香港科技大学', '香港中文大学', '新加坡国立大学'],
      recruit: [
        { id: 'cn_camp', name: '夏令营 · 推免', text: '夏令营开营了！一批优秀的本科生来面试，他们会在九月推免系统里做最终选择。', open: [7, 10], result: [9, 28], join: [9, 1], early: true,
          quota: { phd: [1, 1, 2, 2], ms: [2, 2, 3, 3] } },
        { id: 'cn_exam', name: '考研复试 · 博士考核', text: '考研成绩出来了，复试和博士申请考核同时进行。', open: [3, 25], result: [4, 10], join: [9, 1],
          quota: { phd: [0, 1, 1, 2], ms: [1, 2, 2, 2] } },
      ],
      grants: [
        { id: 'nsfc_youth', name: '国自然青年基金', full: '国家自然科学基金青年科学基金项目（C类）', amount: 300000, months: 36, open: [1, 5], deadline: [3, 20], result: 155, bar: 44, prestige: 5, effort: 30, maxWins: 1, group: 'nsfc', nsfc: true,
          elig: g => (G().piAge(g) <= 35 ? null : '年龄超过 35 岁') },
        { id: 'nsfc_general', name: '国自然面上项目', full: '国家自然科学基金面上项目', amount: 500000, months: 48, open: [1, 5], deadline: [3, 20], result: 155, bar: 54, prestige: 7, effort: 35, group: 'nsfc', nsfc: true,
          elig: () => null },
        { id: 'nsfc_key', name: '国自然重点项目', full: '国家自然科学基金重点项目', amount: 3000000, months: 60, open: [1, 5], deadline: [3, 20], result: 155, bar: 70, prestige: 15, effort: 45, maxActive: 1, group: 'nsfc', nsfc: true,
          elig: g => (g.rep >= 150 && g.pi.title >= 1 ? null : '需要长聘且声望 ≥ 150') },
        { id: 'nsfc_excellent', name: '优青', full: '优秀青年科学基金项目（“小帽子”）', amount: 2000000, months: 36, open: [1, 5], deadline: [3, 20], result: 155, bar: 66, prestige: 30, effort: 40, maxWins: 1, group: 'nsfc_talent', nsfc: true, title: '优青',
          elig: g => (G().piAge(g) > 38 ? '年龄超过 38 岁' : g.rep < 70 ? '需要声望 ≥ 70' : null) },
        { id: 'nsfc_dist', name: '杰青', full: '国家杰出青年科学基金项目（“大帽子”）', amount: 4000000, months: 60, open: [1, 5], deadline: [3, 20], result: 155, bar: 76, prestige: 60, effort: 45, maxWins: 1, group: 'nsfc_talent', nsfc: true, title: '杰青',
          elig: g => (G().piAge(g) > 45 ? '年龄超过 45 岁' : g.rep < 200 ? '需要声望 ≥ 200' : null) },
        { id: 'province', name: '省自然科学基金', full: '省自然科学基金面上项目', amount: 100000, months: 24, open: [4, 1], deadline: [5, 10], result: 120, bar: 40, prestige: 1, effort: 15,
          elig: () => null },
        { id: 'ccf', name: 'CCF-企业青年基金', full: '学会与企业联合设立的青年基金', amount: 150000, months: 12, open: [4, 1], deadline: [5, 15], result: 90, bar: 43, prestige: 3, effort: 12, kind: 'gift',
          elig: g => (G().piAge(g) <= 40 ? null : '年龄超过 40 岁') },
        { id: 'most', name: '重点研发计划课题', full: '国家重点研发计划项目课题（经费多，任务重）', amount: 4000000, months: 48, open: [10, 1], deadline: [11, 15], result: 120, bar: 68, prestige: 12, effort: 45, maxActive: 1,
          elig: g => (g.rep >= 150 ? null : '需要声望 ≥ 150') },
        { id: 'gpu', name: '智算中心算力资助', full: '申请成功会获得一台算力服务器（每三年最多一次）', gpu: true, amount: 0, months: 0, open: [3, 1], deadline: [4, 10], result: 90, bar: 48, prestige: 2, effort: 8, kind: 'gpu',
          elig: g => (G().area(g).compute < 0.3 ? '你的方向用不上算力' : G().wonWithin(g, 'gpu', 1080) ? '三年内已经获得过' : null) },
        { id: 'contract', name: '企业横向课题', full: '企业委托的横向项目，钱多但要学生投入时间', amount: 800000, months: 24, deadline: null, result: 0, bar: 0, prestige: 0, effort: 0, special: true, kind: 'contract',
          elig: () => null },
      ],
      gpus: [
        { id: 'ws', name: '4090 工作站', desc: '双卡工作站，入门之选', price: 45000, units: 2, maint: 300, from: 2020, to: 2040 },
        { id: 'a800', name: 'A800 服务器', desc: '8 卡，库存不多了', price: 1100000, units: 16, maint: 3000, from: 2020, to: 2030 },
        { id: 'h20', name: 'H20 服务器', desc: '8 卡，推理友好', price: 900000, units: 22, maint: 3500, from: 2024, to: 2034 },
        { id: 'dom', name: '国产算力服务器', desc: '8 卡国产 AI 芯片，生态逐渐完善', price: 1300000, units: 40, maint: 4500, from: 2025, to: 2040 },
        { id: 'dom2', name: '新一代国产超节点', desc: '整机柜液冷，自主可控', price: 2200000, units: 120, maint: 7000, from: 2028, to: 2050 },
        { id: 'dom3', name: '光量子智算集群', desc: '传说中的下一代算力', price: 4000000, units: 500, maint: 15000, from: 2033, to: 2099 },
      ],
      cloud: { name: '云算力包月', price: 20000, units: 8 },
      honors: [
        { id: 'qingchang', name: '青年长江学者', rep: 20, chance: 0.2, cond: g => g.rep >= 160 && G().piAge(g) <= 38 },
        { id: 'changjiang', name: '长江学者特聘教授', rep: 40, chance: 0.15, cond: g => g.rep >= 420 && G().piAge(g) <= 55 },
        { id: 'ccf_fellow', name: 'CCF Fellow', rep: 30, chance: 0.2, cond: g => g.rep >= 550 && G().careerYear(g) >= 12 },
        { id: 'cas', name: '中国科学院院士', rep: 100, chance: 0.15, cond: g => g.rep >= 1300 && G().careerYear(g) >= 15 && G().calYear(g) % 2 === 1 },
        { id: 'turing', name: '图灵奖', rep: 300, chance: 0.05, cond: g => g.rep >= 3000 && g.stats.bestPapers >= 3 && g.stats.cites >= 60000 },
      ],
    },
  };
})();
