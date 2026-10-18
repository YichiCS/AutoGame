// 随机事件：球队、学校与地方、比赛、部费、招生
import type { Player } from '../types';
import { G, addRep, log, mySchool } from '../state';
import { chance, pick, rand, randInt } from '../rng';
import { clamp } from '../util';
import { fullName, has, isPitcher, overall } from '../attrs';
import { addExp } from '../growth';
import { earn, spend, moneyStr } from '../economy';
import { doy, doyOf, isOffseason, monthOf, yearIdx } from '../calendar';
import { schoolById, extSchools } from '../world';
import { pickRival } from '../season';
import { notableProspect, commit, prospectBrief } from '../recruit';
import { generatePlayer } from '../player';
import { PREFS } from '../../data/prefectures';
import { EVENTS, def } from './registry';
import { N, P, active, alive, allMor, board, chem, fans, fat, lines, mor, ob, pickPlayer, starters, trust } from './util';

const month = () => monthOf(G.day);
const club = () => G.club;
const inSeason = () => !isOffseason(G.day);

// ================= 球队 =================
def('bully', {
  cat: 'team', weight: () => (club().chemistry < 55 ? 2 : 0.4), cd: 120,
  build: () => ({
    title: '霸凌传闻', tone: 'bad',
    text: '有低年级部员的家长匿名反映：队内存在高年级欺负新生的情况。如果属实并被外界知道，后果不堪设想。',
    choices: [
      { label: '彻底调查并严肃处理', def: true, hint: '默契短期下降，但消除隐患', apply: () => { chem(-6); club().scandal = Math.max(0, club().scandal - 25); board(3); return '调查查明了事实，相关部员被停止活动并道歉。队伍风气为之一新。'; } },
      { label: '私下警告了事', apply: () => { if (chance(0.5)) return '私下谈话之后，情况似乎有所好转。'; club().scandal += 25; return '表面上平息了，但不满的种子依然存在……'; } },
      { label: '不予理会', hint: '风险很高', apply: () => { club().scandal += 45; allMor(-3); return '你选择了沉默。部分部员对此感到失望。'; } },
    ],
  }),
  ctx: () => ({}),
});

def('meeting', {
  cat: 'team', weight: () => (club().chemistry < 45 ? 4 : 0), cd: 40,
  ctx: () => ({}),
  build: () => {
    const cap = club().captainId ? G.players[club().captainId!] : null;
    return {
      title: '队内气氛低迷', tone: 'bad',
      text: '最近队内气氛很差，部员之间争吵不断。',
      choices: [
        { label: '交给主将召开队会', def: !!cap && (has(cap, 'captain') || cap.pers === 'leader'), apply: () => { const good = cap && (has(cap, 'captain') || cap.pers === 'leader'); chem(good ? 10 : 3); return good ? `主将${cap!.fam}的一番话让大家重新团结起来！` : '队会开了，但效果一般。'; } },
        { label: '监督亲自训话', def: !cap || !(has(cap, 'captain') || cap.pers === 'leader'), apply: () => { chem(4 + G.mgr.skills.leadership / 15); return '你的话打动了大家。'; } },
        { label: '组织全队去海边玩一天（30 万）', disabled: G.funds < 30, apply: () => { spend(30, 'other'); chem(12); allMor(6); return '在海边奔跑、吃西瓜……大家又笑了。'; } },
      ],
    };
  },
});

def('charm', {
  cat: 'team', weight: 3, cd: 100,
  ctx: () => ({}),
  build: () => ({
    title: '经理的护身符', tone: 'good',
    text: '女子经理们熬夜为每一位部员缝制了护身符，上面绣着「必胜」二字。',
    choices: [{ label: '谢谢你们！', def: true, apply: () => { allMor(6); chem(3); return '全队士气高涨！'; } }],
  }),
});

def('seniorMentor', {
  cat: 'team', weight: () => (club().chemistry >= 55 ? 3 : 0), cd: 50,
  ctx: () => (active().some((p) => p.grade === 3) ? {} : null),
  build: () => ({
    title: '学长的指导', tone: 'good',
    text: '练习结束后，三年级生们自发留下来，手把手地教一年级生守备和挥棒的诀窍。',
    choices: [{ label: '真是好风气', def: true, apply: () => { active().filter((p) => p.grade === 1).forEach((p) => addExp(p, { tech: 6, men: 4 })); chem(2); return '一年级生们获益良多。'; } }],
  }),
});

def('rivalTaunt', {
  cat: 'team', weight: 3, cd: 70,
  ctx: () => { const s = pickRival(); return s ? { sid: s.id } : null; },
  build: (c) => {
    const s = schoolById(c.sid as number);
    return {
      title: '宿敌的挑衅',
      text: `${s?.name ?? '宿敌'}的队员在采访中说："今年的${mySchool().short}？根本不是对手。"`,
      choices: [
        { label: '"用实力说话！"', def: true, apply: () => { allMor(5); chem(2); return '部员们憋着一股劲，练习气氛空前高涨。'; } },
        { label: '冷静对待', apply: () => '你只是笑了笑。' },
      ],
    };
  },
});

def('fight', {
  cat: 'team', weight: 3, cd: 50,
  ctx: () => {
    const a = pickPlayer((x) => x.pers === 'hot' || x.pers === 'proud');
    if (!a) return null;
    const b = pickPlayer((x) => x.id !== a.id && x.pos === a.pos);
    return b ? { pid: a.id, pid2: b.id } : null;
  },
  build: (c) => ({
    title: '争执', pid: P(c)?.id,
    text: `${N(c)} 和 ${N(c, 'pid2')} 为了争${P(c)?.pos === 'P' ? '王牌' : '先发'}的位置，在更衣室里吵了起来，差点动手。`,
    choices: [
      { label: '让两人公平竞争，用表现说话', def: true, apply: () => { if (!alive(c) || !alive(c, 'pid2')) return ''; addExp(P(c), { men: 6, tech: 4 }); addExp(P(c, 'pid2'), { men: 6, tech: 4 }); chem(-1); return '两人憋着劲较量，练习质量反而上去了。'; } },
      { label: '各打五十大板，罚跑操场', apply: () => { if (!alive(c) || !alive(c, 'pid2')) return ''; fat(P(c), 12); fat(P(c, 'pid2'), 12); chem(3); return '跑完二十圈，两人瘫在地上笑了起来。'; } },
      { label: '把他们叫到一起谈谈', apply: () => { if (!alive(c) || !alive(c, 'pid2')) return ''; trust(P(c), 4); trust(P(c, 'pid2'), 4); chem(4); return '误会解开了。'; } },
    ],
  }),
});

def('captainPressure', {
  cat: 'team', weight: () => (club().captainId ? 2 : 0), cd: 90,
  ctx: () => { const p = club().captainId ? G.players[club().captainId!] : null; return p && !p.retired ? { pid: p.id } : null; },
  build: (c) => ({
    title: '主将的压力', pid: P(c)?.id,
    text: `主将 ${N(c)} 最近一个人扛下了太多。他坦白说："我是不是不适合当主将……"`,
    choices: [
      { label: '设立副主将分担', def: true, apply: () => { if (!alive(c)) return ''; mor(P(c), 8); chem(3); return '副主将上任，主将的担子轻了不少。'; } },
      { label: '"正因为是你，大家才跟着你"', apply: () => { if (!alive(c)) return ''; trust(P(c), 10); mor(P(c), chance(0.6) ? 10 : -4); return '他沉默了很久，然后用力点了点头。'; } },
    ],
  }),
});

def('jinx', {
  cat: 'team', weight: 2, cd: 80,
  ctx: () => (G.games.slice(0, 3).every((g) => g.win) && G.games.length >= 3 ? {} : null),
  build: () => ({
    title: '连胜的「秘密」',
    text: '队里流行起一个说法：连胜期间谁都不能洗球帽，不然运气就会溜走。更衣室的味道已经……',
    choices: [
      { label: '尊重传统', def: true, apply: () => { allMor(4); chem(2); return '帽子很臭，士气很高。'; } },
      { label: '"洗！"', apply: () => { allMor(-2); return '大家哀嚎着把帽子丢进了洗衣机。'; } },
    ],
  }),
});

def('tacticIdea', {
  cat: 'team', weight: 3, cd: 60,
  ctx: () => { const p = pickPlayer((x) => x.a.mental >= 55 || x.pers === 'genius' || x.pers === 'calm'); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '新战术的提案', pid: P(c)?.id,
    text: `${N(c)} 画了一张图来找你：一套跑者一三垒时的特殊暗号战术。`,
    choices: [
      { label: '采用，全队练习', def: true, apply: () => { club().tactics = clamp(club().tactics + 5, 0, 100); trust(P(c), 6); return '战术熟练度上升。'; } },
      { label: '"太复杂了"', apply: () => { mor(P(c), -3); return ''; } },
    ],
  }),
});

def('smoking', {
  cat: 'team', weight: () => (club().chemistry < 60 || G.mgr.skills.leadership < 50 ? 2 : 0.5), cd: 150,
  ctx: () => { const p = pickPlayer((x) => x.pers === 'lazy' || x.pers === 'proud'); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '不祥事', pid: P(c)?.id, tone: 'bad',
    text: `有人目击 ${N(c)} 在校外吸烟。这件事如果被高野联知道……`,
    choices: [
      { label: '主动向高野联报告', def: true, hint: '球队受到轻微处分', apply: () => { if (alive(c)) P(c).benched = 40; club().scandal = Math.max(0, club().scandal - 15); board(-4); club().banUntil = Math.max(club().banUntil, G.day + 14); return '他被停止活动 40 天，球队被禁止对外比赛两周。诚实的处理获得了谅解。'; } },
      { label: '内部处理，不对外公开', hint: '暴露风险极高', apply: () => { if (alive(c)) P(c).benched = 20; club().scandal += 40; return '你选择了隐瞒……'; } },
    ],
  }),
});

def('scandalExposed', {
  cat: 'team', never: true, weight: () => (club().scandal > 30 ? (club().scandal - 30) / 8 : 0), cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: '不祥事曝光', tone: 'bad',
    text: '被隐瞒的部内问题终究还是曝光了。媒体蜂拥而至，学校的电话被打爆。',
    choices: [{ label: '召开记者会道歉', def: true, apply: () => { board(-25); ob(-20); fans(-club().fans * 0.3); club().banUntil = Math.max(club().banUntil, G.day + 60); club().scandal = 0; addRep(-10); return '高野联做出处分：对外比赛禁止两个月。'; } }],
  }),
});

def('obPro', {
  cat: 'team', weight: () => (G.alumni.some((a) => a.path === 'pro' && a.proStatus !== '已退役') ? 3 : 0), cd: 120,
  ctx: () => { const a = pick(G.alumni.filter((x) => x.path === 'pro' && x.proStatus !== '已退役')); return a ? { name: a.name, team: a.proTeam ?? '', st: a.proStatus ?? '' } : null; },
  build: (c) => ({
    title: '职业 OB 回校', tone: 'good',
    text: `效力于${c.team}的 OB ${c.name}（${c.st}）利用休赛期回到母校，主动提出指导学弟们。`,
    choices: [{ label: '热烈欢迎！', def: true, apply: () => { active().forEach((p) => { addExp(p, { tech: 8, men: 6 }); mor(p, 6); }); fans(500); return '在职业球员的指导下，全员获益良多！'; } }],
  }),
});

// ================= 学校与地方 =================
def('obSon', {
  cat: 'school', weight: 3, cd: 150,
  ctx: () => { const p = pickPlayer((x) => overall(x) < 45 && x.grade >= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: 'OB 会长的请求', pid: P(c)?.id,
    text: `OB 会长找到你，委婉地表示希望他的儿子 ${N(c)} 能在比赛里多出场。"今年的捐款，我们 OB 会可是很用心的……"`,
    choices: [
      { label: '答应他', hint: 'OB 满意，但队内不满', apply: () => { ob(15); chem(-8); starters().forEach((p) => mor(p, -4)); mor(P(c), 8); return 'OB 会长满意地离开了。但主力们对此议论纷纷。'; } },
      { label: '婉言拒绝', apply: () => { ob(-10); return '"实力至上"——你坚持了原则。OB 会长脸色不太好看。'; } },
      { label: '让他在练习赛中证明自己', def: true, apply: () => { ob(4); mor(P(c), 5); return '你答应给他机会。双方都还算满意。'; } },
    ],
  }),
});

def('festival', {
  cat: 'school', weight: () => (month() === 7 || month() === 8 ? 3 : 0), cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: '夏日祭典的邀请',
    text: '商店街邀请棒球部参加夏日祭典的抬神轿活动。',
    choices: [
      { label: '全员参加', def: true, apply: () => { fans(randInt(500, 1500)); allMor(3); active().forEach((p) => fat(p, 4)); return '在地方上的人气大增！'; } },
      { label: '以训练为由谢绝', apply: () => '商店街的大叔们有点失望。' },
    ],
  }),
});

def('culturalFest', {
  cat: 'school', weight: () => (doy(G.day) >= doyOf(9, 20) && doy(G.day) <= doyOf(10, 31) ? 4 : 0), cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: '文化祭',
    text: '一年一度的文化祭到了。各班都在准备节目，部员们也想参加。',
    choices: [
      { label: '放一天假，好好享受', def: true, apply: () => { active().forEach((p) => { mor(p, 6); fat(p, -8); }); fans(300); return '棒球部的炒面摊大受欢迎！'; } },
      { label: '照常训练', apply: () => { active().filter((p) => p.pers === 'cheerful' || p.pers === 'hot').forEach((p) => mor(p, -4)); return '训练照常进行，但有些人心不在焉。'; } },
    ],
  }),
});

def('parents', {
  cat: 'school', weight: () => (G.policies.intensity >= 2 ? 4 : 0), cd: 60,
  ctx: () => ({}),
  build: () => ({
    title: '家长的投诉',
    text: '有家长向学校投诉："棒球部的训练强度太大了，孩子每天回家都累得说不出话。"',
    choices: [
      { label: '降低训练强度', apply: () => { G.policies.intensity = Math.max(0, G.policies.intensity - 1); board(2); return '训练强度下调了一级。'; } },
      { label: '坚持现在的方针', apply: () => { board(-5); chem(2); return '你顶住了压力。校方有些不满。'; } },
      { label: '召开说明会', def: true, apply: () => { board(1); return '你耐心地解释了训练计划与安全措施，家长们接受了。'; } },
    ],
  }),
});

def('examWarn', {
  cat: 'school', weight: () => { const t = doy(G.day); return (t >= doyOf(6, 15) && t < doyOf(7, 2)) || (t >= doyOf(11, 25) && t < doyOf(12, 10)) ? 8 : 0; }, cd: 60,
  ctx: () => { const n = active().filter((p) => p.academics < 35 && !has(p, 'student')).length; return n >= 2 ? { n } : null; },
  build: (c) => ({
    title: '考试前的危机', tone: 'bad',
    text: `班主任提醒你：有 ${c.n} 名部员的学力岌岌可危，期末考试很可能不及格（不及格要补习两周，不能参加比赛）。`,
    choices: [
      { label: '安排学习会（训练效率暂时下降）', def: true, apply: () => { active().forEach((p) => { if (p.academics < 45) p.academics += 12; p.exp.tech = Math.max(0, p.exp.tech - 3); }); return '大家在活动室埋头苦读。'; } },
      { label: '让他们自己想办法', apply: () => '希望他们能挺过去……' },
    ],
  }),
});

def('media', {
  cat: 'school', weight: 3, cd: 40,
  ctx: () => { const p = pickPlayer((x) => x.pop >= 45, (x) => x.pop); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '媒体追捧', pid: P(c)?.id,
    text: `体育报纸希望对 ${N(c)} 进行专访，标题都想好了：「令和的怪物」。`,
    choices: [
      { label: '接受采访', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; fans(1500); p.pop = clamp(p.pop + 8, 0, 100); if (p.pers === 'proud' || chance(0.3)) { p.cond = Math.max(-2, p.cond - 1); return `报道很成功，但${p.fam}似乎有点飘飘然。`; } mor(p, 6); return '报道很成功，人气上升。'; } },
      { label: '谢绝，保护球员', apply: () => { fans(-300); return '你挡下了采访。'; } },
    ],
  }),
});

def('managerSick', {
  cat: 'school', weight: 2, cd: 150,
  ctx: () => ({}),
  build: () => ({
    title: '监督病倒了？',
    text: '连续熬夜研究对手录像，你感到头晕目眩，体温也有点高。',
    choices: [
      { label: '休息两天', def: true, apply: () => '你在家好好休息了两天。' },
      { label: '坚持到练习场', apply: () => { if (chance(0.3)) { board(-2); return '你在练习中晕倒了，被送进了医院……'; } chem(3); allMor(2); return '监督带病指导的身影，让部员们很受触动。'; } },
    ],
  }),
});

def('brassBand', {
  cat: 'school', weight: () => (month() >= 5 && month() <= 7 ? 3 : 1), cd: 150,
  ctx: () => ({}),
  build: () => ({
    title: '吹奏乐部的应援曲',
    text: '吹奏乐部的部长来找你："我们为棒球部编了一首新的应援曲，想在大会上演奏！"',
    choices: [
      { label: '太好了，一起排练！', def: true, apply: () => { fans(800); allMor(5); return '激昂的旋律在球场上回荡。'; } },
      { label: '谢谢，交给你们了', apply: () => { fans(300); return ''; } },
    ],
  }),
});

def('fanLetter', {
  cat: 'school', weight: 3, cd: 80,
  ctx: () => { const p = pickPlayer(() => true, (x) => x.pop + 5); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '小球迷的来信', pid: P(c)?.id, tone: 'good',
    text: `一位住院的小学生寄来了一封信："${N(c)} 哥哥，我在电视上看到你了！等我病好了，我也要打棒球！"`,
    choices: [
      { label: '让他写回信', def: true, apply: () => { if (!alive(c)) return ''; mor(P(c), 12); return `${P(c).fam}认认真真写了三页纸。`; } },
      { label: '全队一起去医院探望', apply: () => { allMor(6); fans(400); return '孩子开心得不得了。'; } },
    ],
  }),
});

def('schoolTrip', {
  cat: 'school', weight: () => (month() === 11 || month() === 2 ? 4 : 0), cd: 300,
  ctx: () => (active().some((p) => p.grade === 2) ? {} : null),
  build: () => ({
    title: '修学旅行',
    text: '二年级要去京都修学旅行一周。有人提议棒球部的二年级生留下来继续练习。',
    choices: [
      { label: '去吧，高中只有一次', def: true, apply: () => { active().filter((p) => p.grade === 2).forEach((p) => { mor(p, 10); fat(p, -20); }); chem(3); return '大家带回了满满的回忆和八桥饼。'; } },
      { label: '留下来练习', apply: () => { active().filter((p) => p.grade === 2).forEach((p) => { addExp(p, { tech: 10, str: 8 }); mor(p, -10); }); return '训练是练了，但大家都有点怨言。'; } },
    ],
  }),
});

def('sportsDay', {
  cat: 'school', weight: () => (month() === 10 ? 3 : 0), cd: 300,
  ctx: () => ({}),
  build: () => ({
    title: '运动会',
    text: '运动会的接力赛，各班都在找棒球部的人当最后一棒。',
    choices: [
      { label: '尽情去跑', def: true, apply: () => { allMor(4); fans(200); if (chance(0.15)) { const p = pickPlayer((x) => !x.injury); if (p) { p.injury = { name: '大腿拉伤', part: 'leg', days: 10, severity: 1 }; return `${p.fam}在接力赛中拉伤了大腿……`; } } return '棒球部包揽了接力赛冠军！'; } },
      { label: '"别受伤就好"', apply: () => '大家都跑得小心翼翼。' },
    ],
  }),
});

def('groundKeeper', {
  cat: 'school', weight: 2, cd: 200,
  ctx: () => (G.facilities.field < 5 ? {} : null),
  build: () => ({
    title: '校工的好意', tone: 'good',
    text: '退休前的校工大叔说："我在这所学校最后一年了，让我帮你们把球场好好整一整吧。"',
    choices: [{ label: '感激不尽', def: true, apply: () => { if (G.building?.id === 'field') { G.building.left = Math.max(1, G.building.left - 10); return '球场的施工进度加快了！'; } earn(40, 'other'); return '球场焕然一新（相当于省下了 40 万円的维护费）。'; } }],
  }),
});

def('principal', {
  cat: 'school', weight: 2, cd: 120,
  ctx: () => ({}),
  build: () => ({
    title: '校长视察',
    text: '校长突然来球场视察，看了一个小时的练习。',
    choices: [
      { label: '请他做个开球式', def: true, apply: () => { board(4); return '校长的开球投到了一垒方向，全场大笑。'; } },
      { label: '让他看看我们的训练成果', apply: () => { board(G.club.chemistry > 55 ? 6 : 1); return '校长频频点头。'; } },
    ],
  }),
});

def('cat', {
  cat: 'school', weight: 2, cd: 300,
  ctx: () => (G.flags.cat ? null : {}),
  build: () => ({
    title: '球场的猫', tone: 'good',
    text: '一只三花猫最近每天都来看练习，蹲在长凳上一动不动。部员们给它取名叫「甲子」。',
    choices: [
      { label: '收留它当球队吉祥物', def: true, apply: () => { G.flags.cat = G.day; allMor(5); chem(3); return '「甲子」成了棒球部的一员。'; } },
      { label: '交给动物保护中心', apply: () => { allMor(-2); return ''; } },
    ],
  }),
});

def('localPaper', {
  cat: 'school', weight: 3, cd: 90,
  ctx: () => ({}),
  build: () => ({
    title: '地方报纸的专栏',
    text: `地方报纸想做一期专栏，介绍${mySchool().name}棒球部的日常。`,
    choices: [
      { label: '欢迎采访', def: true, apply: () => { fans(randInt(400, 1200)); return '报道刊出后，来看练习的人多了起来。'; } },
      { label: '婉拒', apply: () => '' },
    ],
  }),
});

// ================= 比赛 =================
def('spy', {
  cat: 'match', weight: () => (doy(G.day) >= doyOf(6, 1) && doy(G.day) <= doyOf(7, 20) ? 3 : 0.5), cd: 60,
  ctx: () => ({}),
  build: () => ({
    title: '可疑的人影',
    text: '有人发现某强校的分析员在球场外用摄像机拍摄你们的练习。',
    choices: [
      { label: '加强保密，更换暗号', def: true, apply: () => { club().tactics = clamp(club().tactics + 3, 0, 100); return '战术熟练度上升。'; } },
      { label: '故意演练假的战术', apply: () => { club().tactics = clamp(club().tactics + (G.mgr.skills.tactics > 55 ? 5 : 1), 0, 100); return '对方会收到一堆错误情报吧。'; } },
      { label: '无所谓', apply: () => '正面堂堂地战斗就好。' },
    ],
  }),
});

def('invitational', {
  cat: 'match', weight: () => (inSeason() ? 3 : 0), cd: 60,
  ctx: () => {
    const pool = [...Object.values(G.schools).filter((s) => s.id !== G.schoolId), ...extSchools(randInt(0, PREFS.length - 1))].filter((s) => s.prestige > mySchool().prestige + 10);
    if (!pool.length) return null;
    return { sid: pick(pool).id };
  },
  build: (c) => {
    const s = schoolById(c.sid as number);
    return {
      title: '招待赛邀请',
      text: `名门${s?.name ?? ''}邀请你们这周末去打练习赛，并承担全部远征费用。`,
      choices: [
        { label: '欣然接受', def: true, apply: () => { G.flags.invite = G.day; G.flags.inviteId = c.sid as number; return '这周末将与名门交手！'; } },
        { label: '婉拒', apply: () => '' },
      ],
    };
  },
});

def('rain', {
  cat: 'match', weight: () => (month() === 6 ? 5 : month() === 7 ? 2 : 0), cd: 15,
  ctx: () => ({}),
  build: () => ({
    title: '梅雨',
    text: G.facilities.indoor ? '连日的雨。好在有室内练习场，训练照常进行。' : '连日的雨，操场变成了泥塘。没有室内练习场的我们只能另想办法。',
    choices: [
      { label: '让投手们好好休息', def: true, apply: () => { active().filter(isPitcher).forEach((p) => fat(p, -18)); G.flags.rainUntil = G.day + 2; return '投手们的疲劳恢复了不少。'; } },
      { label: '在走廊里练挥棒和体能', apply: () => { active().forEach((p) => addExp(p, { str: 4, tech: 2 })); G.flags.rainUntil = G.day + 2; return '走廊里全是挥棒的声音。'; } },
    ],
  }),
});

def('typhoon', {
  cat: 'match', weight: () => (month() >= 8 && month() <= 9 ? 3 : 0), cd: 30,
  ctx: () => ({}),
  build: () => ({
    title: '台风来袭',
    text: '强台风过境，练习暂停两天。',
    choices: [{ label: '趁机让大家好好休息', def: true, apply: () => { active().forEach((p) => fat(p, -15)); G.flags.rainUntil = G.day + 2; return '全员的疲劳得到恢复。'; } }],
  }),
});

def('snow', {
  cat: 'match', weight: () => (month() === 12 || month() === 1 || month() === 2 ? 4 : 0), cd: 20,
  ctx: () => ({}),
  build: () => ({
    title: '大雪',
    text: G.facilities.indoor ? '一夜大雪，操场被积雪覆盖。好在有室内练习场。' : '一夜大雪，操场被积雪覆盖。',
    choices: [
      { label: '全员除雪 + 体能训练', def: true, apply: () => { active().forEach((p) => { addExp(p, { str: 4, men: 3 }); fat(p, 5); }); chem(2); return '大家一边除雪一边打雪仗，意外地很开心。'; } },
      { label: '放假一天', apply: () => { active().forEach((p) => { fat(p, -10); mor(p, 3); }); return '难得的休息日。'; } },
    ],
  }),
});

// ================= 部费 =================
def('tvDoc', {
  cat: 'money', weight: () => (club().fans > 4000 ? 2 : 0), cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: '电视台的纪录片企划',
    text: '地方电视台希望跟拍球队一个月，制作「夏天之前」的纪录片。出镜费相当可观，但镜头前的压力也不小。',
    choices: [
      { label: '接受拍摄', def: true, hint: '部费与人气增加，球员疲劳增加', apply: () => { const m = randInt(80, 200); earn(m, 'media'); fans(randInt(2000, 5000)); active().forEach((p) => fat(p, 8)); return `纪录片播出后反响热烈！获得 ${m} 万円。`; } },
      { label: '谢绝', apply: () => '你以「集中精力训练」为由谢绝了。' },
    ],
  }),
});

def('obDonation', {
  cat: 'money', weight: () => (club().ob > 55 ? 3 : 0.5), cd: 90,
  ctx: () => ({}),
  build: () => ({
    title: 'OB 会的心意', tone: 'good',
    text: '看到球队的努力，OB 会决定追加一笔捐款。会长问你希望怎么使用。',
    choices: [
      { label: '充作部费', def: true, apply: () => { const v = randInt(80, 200) + Math.round(mySchool().prestige * 2); earn(v, 'ob'); return `获得 ${v} 万円。`; } },
      { label: '请队员吃烤肉', apply: () => { allMor(8); chem(5); return '全队吃得心满意足！'; } },
    ],
  }),
});

def('theft', {
  cat: 'money', weight: 2, cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: '器材被盗', tone: 'bad',
    text: '一早来到器材室，发现球棒和捕手护具被偷了不少。',
    choices: [
      { label: '用部费重新购买', def: true, apply: () => { const v = randInt(20, 50); spend(v, 'gear'); return `花费 ${v} 万円。`; } },
      { label: '监督自掏腰包', apply: () => { allMor(5); return '你自己掏了钱。队员们很感动。'; } },
    ],
  }),
});

def('parentDonation', {
  cat: 'money', weight: () => (club().fans > 2500 ? 2 : 0.5), cd: 150,
  ctx: () => ({}),
  build: () => ({
    title: '家长会的心意', tone: 'good',
    text: '家长会决定集资，为棒球部添置一些器材。',
    choices: [{ label: '心怀感激地收下', def: true, apply: () => { const v = randInt(30, 80); earn(v, 'other'); return `获得 ${v} 万円。`; } }],
  }),
});

def('sponsor', {
  cat: 'money', weight: () => 1.5 + club().fans / 8000, cd: 120,
  ctx: () => ({ name: pick(['丸三运输', '富岳食品', '龙虎拉面', '七星便利店', '大和建设', '樱花信用金库', '朝阳乳业', '港町酒造', '松风温泉旅馆', '东洋电器']), v: randInt(60, 160) + Math.round(club().fans / 200) }),
  build: (c) => ({
    title: '地方企业的赞助',
    text: `${c.name}的社长是棒球部的老球迷，提出赞助 ${moneyStr(c.v as number)}，条件是在球场挂一块广告牌。`,
    choices: [
      { label: '接受', def: true, apply: () => { earn(c.v as number, 'media'); return `获得 ${c.v} 万円。`; } },
      { label: '婉拒（学生棒球不搞商业）', apply: () => { board(2); ob(2); return ''; } },
    ],
  }),
});

def('graySponsor', {
  cat: 'money', weight: () => (G.funds < 150 ? 1.5 : 0.3), cd: 300,
  ctx: () => ({ v: randInt(250, 500) }),
  build: (c) => ({
    title: '可疑的赞助', tone: 'bad',
    text: `一位自称「神秘投资人」的人提出赞助 ${moneyStr(c.v as number)}，只要让球员在他的网站上露个脸。这明显违反学生棒球宪章……`,
    choices: [
      { label: '断然拒绝', def: true, apply: () => { board(2); return '你把他请了出去。'; } },
      { label: '收下（有曝光风险）', apply: () => { earn(c.v as number, 'other'); club().scandal += 60; return `获得 ${c.v} 万円……希望不会出事。`; } },
    ],
  }),
});

def('alumniGift', {
  cat: 'money', weight: () => (G.alumni.length >= 10 ? 2 : 0), cd: 200,
  ctx: () => ({}),
  build: () => ({
    title: 'OB 的礼物', tone: 'good',
    text: '一位开公司的 OB 说想为母校做点事：可以送一台最新的发球机，或者直接捐一笔钱。',
    choices: [
      { label: '发球机', def: G.facilities.cage < 5, apply: () => { if (G.building?.id === 'cage') { G.building.left = Math.max(1, G.building.left - 15); return '打击笼的施工进度加快了。'; } active().filter((p) => !isPitcher(p)).forEach((p) => addExp(p, { tech: 8 })); return '新的发球机让打击练习效率大增。'; } },
      { label: '现金（100 万円）', def: G.facilities.cage >= 5, apply: () => { earn(100, 'ob'); return '获得 100 万円。'; } },
    ],
  }),
});

def('equipBreak', {
  cat: 'money', weight: 2, cd: 120,
  ctx: () => ({}),
  build: () => ({
    title: '器材老化',
    text: '发球机坏了，捕手护具也开裂了。修一修还能用，换新的要花不少钱。',
    choices: [
      { label: '全部换新（60 万）', def: G.funds > 200, disabled: G.funds < 60, apply: () => { spend(60, 'gear'); allMor(3); return '崭新的器材让大家精神一振。'; } },
      { label: '修一修凑合用（15 万）', def: G.funds <= 200, apply: () => { spend(15, 'gear'); return ''; } },
    ],
  }),
});

// ================= 招生 =================
const recruitSeason = () => { const t = doy(G.day); return t >= doyOf(9, 1) || t < doyOf(2, 1); };

Object.assign(EVENTS.scholarProspect, {
  weight: () => (recruitSeason() ? 3 : 0),
  cd: 35,
  ctx: () => {
    const r = rand();
    const kind = G.mgr.rep >= 40 && r < 0.04 ? 'monster' : r < 0.25 ? 'gem' : 'star';
    const p = notableProspect(kind);
    G.players[p.id] = p;
    const cost = kind === 'monster' ? 400 : kind === 'gem' ? 40 : 100 + Math.round(overall(p));
    return { pid: p.id, cost };
  },
});

def('transferIn', {
  cat: 'recruit', weight: () => (month() >= 4 && month() <= 6 ? 2 : 0), cd: 200,
  ctx: () => {
    const p = generatePlayer({ quality: 30 + mySchool().prestige * 0.35 + randInt(0, 10), grade: 1, enrollYear: yearIdx(G.day), weeksGrown: randInt(2, 8) });
    p.joined = 'transfer';
    p.middle = `${pick(PREFS[randInt(0, PREFS.length - 1)].cities)}的高中`;
    G.players[p.id] = p;
    return { pid: p.id };
  },
  build: (c) => {
    const p = P(c);
    return {
      title: '转学生', pid: p?.id,
      text: `因为父母工作调动，一名一年级生从外地转学过来，想加入棒球部：${p ? prospectBrief(p) : ''}`,
      choices: [
        { label: '欢迎加入', def: true, apply: () => { if (!p) return ''; if (!G.roster.includes(p.id)) G.roster.push(p.id); return `${fullName(p)} 加入了球队。`; } },
        { label: '名额已满', apply: () => { if (p && !G.roster.includes(p.id)) delete G.players[p.id]; return ''; } },
      ],
    };
  },
});

