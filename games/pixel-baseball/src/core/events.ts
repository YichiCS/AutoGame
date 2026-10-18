// 随机事件
import type { ActiveEvent, Player, PitchType } from './types';
import { PITCH_TYPES } from './types';
import { G, mySchool, myPlayers } from './state';
import { chance, pick, randInt, weightedPick } from './rng';
import { clamp, sortBy } from './util';
import { fullName, has, isPitcher, overall, PERS_NAME } from './attrs';
import { addMoney } from './finance';
import { myStaff, ROLE_NAME, genStaff } from './staff';
import { PITCH_DEFS, TRAIT_BY_ID } from '../data/traits';
import { monthOf } from './calendar';
import { addExp } from './growth';
import { generatePlayer } from './player';
import { PREFS } from '../data/prefectures';
import { MIDDLE_SUFFIX } from '../data/names';

type Ctx = Record<string, number | string>;

/** 球探发现的、尚未被人注意到的高潜力中学生 */
function hiddenGem(): Player {
  const me = mySchool();
  const p = generatePlayer({ quality: randInt(30, 40), grade: 0, enrollYear: G.year + 1, potBias: 40 });
  p.homePref = me.prefId;
  p.middle = `${pick(PREFS[me.prefId].cities)}${pick(MIDDLE_SUFFIX)}`;
  p.fame = 3;
  p.scout = 0;
  p.interest = { [me.id]: 15 };
  p.offers = [];
  G.players[p.id] = p;
  G.prospects.push(p.id);
  return p;
}

interface Choice {
  label: string;
  hint?: string;
  enabled?: (c: Ctx) => boolean;
  run: (c: Ctx) => string;
}

interface EventDef {
  id: string;
  weight: number;
  cooldown?: number;
  once?: boolean;
  cond?: () => boolean;
  ctx?: () => Ctx | null;
  title: string | ((c: Ctx) => string);
  text: (c: Ctx) => string;
  choices: (c: Ctx) => Choice[];
}

const P = (c: Ctx, k = 'pid'): Player => G.players[c[k] as number];
const nameOf = (c: Ctx, k = 'pid') => fullName(P(c, k));
const active = () => myPlayers().filter((p) => !p.retired && p.grade >= 1 && p.grade <= 3);
const mor = (p: Player, d: number) => (p.morale = clamp(p.morale + d, 0, 100));
const allMor = (d: number) => active().forEach((p) => mor(p, d));
const club = () => G.club;
const ok: Choice['run'] = () => '';

function pickPlayer(f: (p: Player) => boolean, w: (p: Player) => number = () => 1): Player | null {
  const list = active().filter(f);
  if (!list.length) return null;
  return weightedPick(list, w);
}

function starters(): Player[] {
  return sortBy(active().filter((p) => !p.injury), overall).slice(0, 10);
}

export const EVENTS: EventDef[] = [
  {
    id: 'aceElbow', weight: 5, cooldown: 10,
    ctx: () => {
      const p = pickPlayer((x) => isPitcher(x) && !x.injury && (x.fatigue > 45 || (x.pitchesLast ?? 0) > 200), (x) => x.fatigue);
      return p ? { pid: p.id } : null;
    },
    title: '肘部的异样',
    text: (c) => `投手 ${nameOf(c)} 在牛棚练投后表示右肘有些发麻。他本人坚持说"没问题，还能投！"`,
    choices: (c) => [
      { label: '让他休养两周', hint: '安全第一', run: () => { const p = P(c); p.focus = { kind: 'rest' }; p.fatigue = Math.max(0, p.fatigue - 25); mor(p, -3); return `${p.fam}进入休养调整。`; } },
      { label: '去大医院精密检查（15万）', run: () => {
        addMoney(-15, 'medical', '精密检查');
        const p = P(c);
        if (chance(0.6)) { p.fatigue = Math.max(0, p.fatigue - 15); return '检查结果只是轻微疲劳，休息几天就好。'; }
        p.injury = { name: '肘部炎症', part: 'elbow', weeks: randInt(3, 5), severity: 2 };
        return `检查发现肘部发炎，需要休养约 ${p.injury.weeks} 周。好在发现得早。`;
      } },
      { label: '打止痛针继续投', hint: '有重伤风险', run: () => {
        const p = P(c);
        mor(p, 6);
        if (chance(0.35)) { p.injury = { name: '肘内侧韧带损伤', part: 'elbow', weeks: randInt(12, 22), severity: 3 }; return `勉强投球的结果……${p.fam}的肘部韧带受了重伤，需要长期休养。`; }
        return `${p.fam}忍着疼痛继续练投，暂时没有出现问题。`;
      } },
    ],
  },
  {
    id: 'bully', weight: 2, cooldown: 30,
    cond: () => club().chemistry < 55,
    title: '霸凌传闻',
    text: () => '有低年级部员的家长匿名反映：队内存在高年级欺负新生的情况。如果属实并被外界知道，后果不堪设想。',
    choices: () => [
      { label: '彻底调查并严肃处理', hint: '默契短期下降，但消除隐患', run: () => { club().chemistry = clamp(club().chemistry - 6, 0, 100); club().scandal = Math.max(0, club().scandal - 25); club().board = clamp(club().board + 3, 0, 100); return '调查查明了事实，相关部员被停止活动并道歉。队伍风气为之一新。'; } },
      { label: '私下警告了事', run: () => { if (chance(0.5)) return '私下谈话之后，情况似乎有所好转。'; club().scandal += 25; return '表面上平息了，但不满的种子依然存在……'; } },
      { label: '不予理会', hint: '风险很高', run: () => { club().scandal += 45; allMor(-3); return '你选择了沉默。部分部员对此感到失望。'; } },
    ],
  },
  {
    id: 'obSon', weight: 3, cooldown: 40,
    ctx: () => {
      const p = pickPlayer((x) => overall(x) < 45 && x.grade >= 2);
      return p ? { pid: p.id } : null;
    },
    title: 'OB会长的请求',
    text: (c) => `OB会长找到你，委婉地表示希望他的儿子 ${nameOf(c)} 能在下一场比赛中先发出场。"今年的捐款，我们OB会可是很用心的……"`,
    choices: (c) => [
      { label: '答应他', hint: 'OB满意，但队内不满', run: () => { club().ob = clamp(club().ob + 15, 0, 100); club().chemistry = clamp(club().chemistry - 8, 0, 100); starters().forEach((p) => mor(p, -4)); mor(P(c), 8); return 'OB会长满意地离开了。但主力们对此议论纷纷。'; } },
      { label: '婉言拒绝', run: () => { club().ob = clamp(club().ob - 10, 0, 100); return '"实力至上"——你坚持了原则。OB会长脸色不太好看。'; } },
      { label: '让他在练习赛中证明自己', run: () => { club().ob = clamp(club().ob + 4, 0, 100); mor(P(c), 5); return '你答应给他机会。双方都还算满意。'; } },
    ],
  },
  {
    id: 'tvDoc', weight: 2, cooldown: 48,
    cond: () => club().fans > 5000,
    title: '电视台的纪录片企划',
    text: () => '地方电视台希望跟拍球队一个月，制作"夏天之前"的纪录片。出镜费相当可观，但镜头前的压力也不小。',
    choices: () => [
      { label: '接受拍摄', hint: '资金与人气↑，球员疲劳↑', run: () => { const m = randInt(80, 200); addMoney(m, 'other', '纪录片出镜费'); club().fans += randInt(2000, 5000); active().forEach((p) => (p.fatigue = clamp(p.fatigue + 8, 0, 100))); return `纪录片播出后反响热烈！获得 ${m} 万円。`; } },
      { label: '谢绝', run: () => '你以"集中精力训练"为由谢绝了。' },
    ],
  },
  {
    id: 'heat', weight: 6, cooldown: 4,
    cond: () => monthOf(G.week) >= 7 && monthOf(G.week) <= 8,
    ctx: () => { const p = pickPlayer((x) => !x.injury); return p ? { pid: p.id } : null; },
    title: '酷暑',
    text: (c) => `连日的高温中，${nameOf(c)} 在练习时出现了中暑症状。`,
    choices: (c) => [
      { label: '立刻送医并调整全队训练', run: () => { const p = P(c); p.fatigue = clamp(p.fatigue + 10, 0, 100); active().forEach((x) => (x.fatigue = Math.max(0, x.fatigue - 6))); return '你缩短了白天的训练时间，增加补水。处置得当。'; } },
      { label: '让他在树荫下休息就好', hint: '有危险', run: () => { const p = P(c); if (chance(0.3)) { p.injury = { name: '重度中暑', part: 'other', weeks: 2, severity: 2 }; club().board = clamp(club().board - 5, 0, 100); return '情况恶化，被紧急送往医院……校方对你的处理很不满。'; } return '休息之后恢复了，有惊无险。'; } },
    ],
  },
  {
    id: 'slump', weight: 5, cooldown: 6,
    ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && !x.injury && x.cond <= 0, (x) => overall(x)); return p ? { pid: p.id } : null; },
    title: '低潮',
    text: (c) => `主力打者 ${nameOf(c)} 最近完全打不出好球，在打击练习中也显得心不在焉。`,
    choices: (c) => [
      { label: '找他个别谈话（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; const p = P(c); mor(p, 8); p.trust = clamp(p.trust + 5, 0, 100); if (chance(0.6 + G.manager.skills.leadership / 300)) p.cond = Math.max(p.cond, 1); return `谈话之后，${p.fam}的表情明朗了许多。`; } },
      { label: '让他加练', run: () => { const p = P(c); addExp(p, { tech: 15 }); p.fatigue = clamp(p.fatigue + 12, 0, 100); return `${p.fam}默默地挥了几百次棒。`; } },
      { label: '暂时不管', run: () => { const p = P(c); if (chance(0.4)) p.cond = Math.max(-2, p.cond - 1); return '你决定等他自己走出来。'; } },
    ],
  },
  {
    id: 'love', weight: 3, cooldown: 12,
    ctx: () => { const p = pickPlayer((x) => x.grade >= 2); return p ? { pid: p.id } : null; },
    title: '青春',
    text: (c) => `听说 ${nameOf(c)} 交了女朋友。最近练习结束后总是第一个离开。`,
    choices: (c) => [
      { label: '默默祝福', run: () => { const p = P(c); mor(p, 10); p.cond = Math.min(2, p.cond + (chance(0.5) ? 1 : -1)); return `${p.fam}看起来干劲十足。`; } },
      { label: '"棒球部禁止恋爱！"', run: () => { const p = P(c); mor(p, -12); p.trust = clamp(p.trust - 10, 0, 100); return `${p.fam}低下了头，但看得出来心里很不服气。`; } },
    ],
  },
  {
    id: 'transferWish', weight: 3, cooldown: 16,
    ctx: () => { const p = pickPlayer((x) => x.morale < 40 && (x.pers === 'proud' || x.pers === 'hot') && x.grade <= 2); return p ? { pid: p.id } : null; },
    title: '转学的念头',
    text: (c) => `${nameOf(c)}（${PERS_NAME[P(c).pers]}）对出场机会不满，私下说想转学去别的学校。`,
    choices: (c) => [
      { label: '挽留，承诺给他机会', run: () => { const p = P(c); mor(p, 18); p.trust = clamp(p.trust + 8, 0, 100); club().chemistry = clamp(club().chemistry - 2, 0, 100); return `${p.fam}决定留下来。你得兑现承诺了。`; } },
      { label: '尊重他的决定', run: () => { removePlayer(P(c)); return '他离开了球队。'; } },
      { label: '严厉批评他的软弱', run: () => { const p = P(c); if (chance(0.35)) { removePlayer(p); return `${p.fam}一气之下退部了。`; } mor(p, -5); p.trust = clamp(p.trust - 10, 0, 100); return `${p.fam}咬着牙留了下来。`; } },
    ],
  },
  {
    id: 'obDonation', weight: 3, cooldown: 20,
    cond: () => club().ob > 55,
    title: 'OB会的心意',
    text: () => '看到球队的努力，OB会决定追加一笔捐款。会长问你希望怎么使用。',
    choices: () => [
      { label: '充作部费', run: () => { const v = randInt(80, 200) + Math.round(mySchool().prestige * 2); addMoney(v, 'ob', 'OB会特别捐款'); return `获得 ${v} 万円。`; } },
      { label: '设立奖学金（特待名额+1）', enabled: () => mySchool().type === 'private', run: () => { club().scholarshipSlots++; club().ob = clamp(club().ob + 5, 0, 100); return '今年的特待生名额增加了 1 个。'; } },
      { label: '用来请队员吃烤肉', run: () => { allMor(8); club().chemistry = clamp(club().chemistry + 5, 0, 100); return '全队吃得心满意足！'; } },
    ],
  },
  {
    id: 'spy', weight: 3, cooldown: 12,
    cond: () => G.week >= 8 && G.week <= 15,
    title: '可疑的人影',
    text: () => '有人发现某强校的分析员在球场外用摄像机拍摄你们的练习。',
    choices: () => [
      { label: '加强保密，练习暗号', run: () => { club().tacticsSkill = clamp(club().tacticsSkill + 3, 0, 100); return '你们更换了全部暗号。战术熟练度上升。'; } },
      { label: '故意演练假的战术', run: () => { club().tacticsSkill = clamp(club().tacticsSkill + (G.manager.skills.tactics > 55 ? 5 : 1), 0, 100); return '对方会收到一堆错误情报吧。'; } },
      { label: '无所谓', run: () => '正面堂堂地战斗就好。' },
    ],
  },
  {
    id: 'proScout', weight: 4, cooldown: 8,
    ctx: () => { const p = pickPlayer((x) => x.grade >= 2 && overall(x) >= 58, (x) => overall(x)); return p ? { pid: p.id } : null; },
    title: '职业球探来访',
    text: (c) => `职业球队的球探专程来看 ${nameOf(c)} 的练习，在本子上写个不停。`,
    choices: (c) => [
      { label: '欢迎并介绍他的优点', run: () => { const p = P(c); mor(p, 10); p.pop = clamp(p.pop + 10, 0, 100); if (overall(p) > 60) p.wish = 'pro'; return `${p.fam}知道后兴奋得睡不着。`; } },
      { label: '谢绝采访，以免影响他', run: () => { const p = P(c); mor(p, -3); if (chance(0.5)) p.cond = Math.min(2, p.cond + 1); return '你保护了他免受外界干扰。'; } },
    ],
  },
  {
    id: 'typhoon', weight: 3, cooldown: 6,
    cond: () => monthOf(G.week) >= 7 && monthOf(G.week) <= 9,
    title: '台风来袭',
    text: () => '强台风过境，练习与比赛暂停数日。',
    choices: () => [{ label: '趁机让大家好好休息', run: () => { active().forEach((p) => (p.fatigue = Math.max(0, p.fatigue - 15))); return '全员的疲劳得到恢复。'; } }],
  },
  {
    id: 'obPro', weight: 3, cooldown: 30,
    cond: () => G.records.alumni.some((a) => a.pro && a.schoolName === mySchool().name),
    ctx: () => { const a = pick(G.records.alumni.filter((x) => x.pro && x.schoolName === mySchool().name)); return { name: a.name, team: a.proTeam ?? '' }; },
    title: '职业OB回校',
    text: (c) => `效力于${c.team}的 OB ${c.name} 利用休赛期回到母校，主动提出指导学弟们。`,
    choices: () => [{ label: '热烈欢迎！', run: () => { active().forEach((p) => { addExp(p, { tech: 8, men: 6 }); mor(p, 6); }); club().fans += 500; return '在职业球员的指导下，全员获益良多！'; } }],
  },
  {
    id: 'festival', weight: 2, cooldown: 24,
    title: '地方祭典的邀请',
    text: () => '商店街邀请棒球部参加夏日祭典的抬神轿活动。',
    choices: () => [
      { label: '全员参加（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; club().fans += randInt(500, 1500); club().supporters = clamp(club().supporters + 6, 0, 100); allMor(3); return '在地方上的人气大增！'; } },
      { label: '以训练为由谢绝', run: () => { club().supporters = clamp(club().supporters - 3, 0, 100); return '商店街的大叔们有点失望。'; } },
    ],
  },
  {
    id: 'theft', weight: 2, cooldown: 40,
    title: '器材被盗',
    text: () => '一早来到器材室，发现球棒和捕手护具被偷了不少。',
    choices: () => [
      { label: '用部费重新购买', run: () => { const v = randInt(20, 50); addMoney(-v, 'other', '补购被盗器材'); return `花费 ${v} 万円。`; } },
      { label: '监督自掏腰包', run: () => { const v = randInt(20, 50); G.manager.money -= v; allMor(5); return `你自己出了 ${v} 万円。队员们很感动。`; } },
    ],
  },
  {
    id: 'parents', weight: 4, cooldown: 12,
    cond: () => club().training.intensity >= 2,
    title: '家长的投诉',
    text: () => '有家长向学校投诉："棒球部的训练强度太大了，孩子每天回家都累得说不出话。"',
    choices: () => [
      { label: '降低训练强度', run: () => { club().training.intensity = Math.max(0, club().training.intensity - 1); club().board = clamp(club().board + 2, 0, 100); return '训练强度下调了一级。'; } },
      { label: '坚持现在的方针', run: () => { club().board = clamp(club().board - 5, 0, 100); club().chemistry = clamp(club().chemistry + 2, 0, 100); return '你顶住了压力。校方有些不满。'; } },
      { label: '召开说明会（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; return '你耐心地解释了训练计划与安全措施，家长们接受了。'; } },
    ],
  },
  {
    id: 'newPitch', weight: 3, cooldown: 10,
    ctx: () => { const p = pickPlayer((x) => isPitcher(x) && x.pitches.length < 5); if (!p) return null; const t = pick(PITCH_TYPES.filter((t) => !p.pitches.some((x) => x.type === t))); return { pid: p.id, pitch: t }; },
    title: '灵光一闪',
    text: (c) => `投手 ${nameOf(c)} 在投接球时偶然投出了一个奇妙的${PITCH_DEFS[c.pitch as PitchType].name}！`,
    choices: (c) => [
      { label: '鼓励他继续钻研', run: () => { const p = P(c); p.pitches.push({ type: c.pitch as PitchType, lv: 1 }); return `${p.fam}掌握了${PITCH_DEFS[c.pitch as PitchType].name}！`; } },
      { label: '先专注现有球种', run: () => { const p = P(c); if (p.pitches.length) p.pitches[0].lv = Math.min(7, p.pitches[0].lv + 1); return `${p.fam}的${PITCH_DEFS[p.pitches[0].type].name}更加锋利了。`; } },
    ],
  },
  {
    id: 'awaken', weight: 2, cooldown: 12,
    ctx: () => { const p = pickPlayer((x) => x.morale > 55 && x.pot < 85, (x) => x.ethic); return p ? { pid: p.id } : null; },
    title: '开窍',
    text: (c) => `一直不起眼的 ${nameOf(c)} 最近练习时的眼神完全不一样了。似乎抓住了什么诀窍。`,
    choices: (c) => [{ label: '真令人期待！', run: () => { const p = P(c); p.pot = clamp(p.pot + 15, 0, 99); for (const k in p.caps) p.caps[k as keyof typeof p.caps] += 6; addExp(p, { tech: 20, str: 15, men: 10 }); return `${p.fam}的潜力觉醒了！`; } }],
  },
  {
    id: 'meeting', weight: 3, cooldown: 10,
    cond: () => club().chemistry < 45,
    title: '队内气氛低迷',
    text: () => '最近队内气氛很差，部员之间争吵不断。',
    choices: () => [
      { label: '交给主将召开队会', run: () => { const cap = club().captainId ? G.players[club().captainId!] : null; const good = cap && (has(cap, 'captain') || cap.pers === 'leader'); club().chemistry = clamp(club().chemistry + (good ? 10 : 3), 0, 100); return good ? `主将${cap!.fam}的一番话让大家重新团结起来！` : '队会开了，但效果一般。'; } },
      { label: '监督亲自训话（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; const v = 4 + G.manager.skills.leadership / 15; club().chemistry = clamp(club().chemistry + v, 0, 100); return '你的话打动了大家。'; } },
      { label: '组织全队去海边合宿一天（30万）', run: () => { addMoney(-30, 'camp', '团建'); club().chemistry = clamp(club().chemistry + 12, 0, 100); allMor(6); return '在海边奔跑、吃西瓜……大家又笑了。'; } },
    ],
  },
  {
    id: 'examWarn', weight: 5, cooldown: 20,
    cond: () => G.week === 12 || G.week === 33,
    title: '考试前的危机',
    text: () => `班主任提醒你：有好几名部员的学力岌岌可危，期末考试很可能不及格（不及格者需补习，无法参加比赛）。`,
    choices: () => [
      { label: '本周安排学习会（训练效率下降）', run: () => { active().forEach((p) => { if (p.academics < 45) p.academics += 12; addExp(p, { tech: -3 }); }); return '大家在活动室埋头苦读。'; } },
      { label: '让他们自己想办法', run: () => '希望他们能挺过去……' },
    ],
  },
  {
    id: 'media', weight: 3, cooldown: 8,
    ctx: () => { const p = pickPlayer((x) => x.pop >= 45, (x) => x.pop); return p ? { pid: p.id } : null; },
    title: '媒体追捧',
    text: (c) => `体育报纸希望对 ${nameOf(c)} 进行专访，标题都想好了："令和的怪物"。`,
    choices: (c) => [
      { label: '接受采访', run: () => { const p = P(c); club().fans += 1500; p.pop = clamp(p.pop + 8, 0, 100); if (p.pers === 'proud' || chance(0.3)) { p.cond = Math.max(-2, p.cond - 1); return `报道很成功，但${p.fam}似乎有点飘飘然。`; } mor(p, 6); return '报道很成功，人气上升。'; } },
      { label: '谢绝，保护球员', run: () => { club().fans = Math.max(0, club().fans - 300); return '你挡下了采访。'; } },
    ],
  },
  {
    id: 'coachPoached', weight: 3, cooldown: 20,
    ctx: () => { const st = myStaff().filter((s) => s.loyalty < 60 && s.skill >= 50); if (!st.length) return null; const s = pick(st); const from = pick(Object.values(G.schools).filter((x) => x.id !== mySchool().id && x.prestige > mySchool().prestige - 5)); return from ? { sid: s.id, from: from.name } : null; },
    title: '教练被挖角',
    text: (c) => `${c.from}向你的${ROLE_NAME[G.staff[c.sid as number].role]} ${G.staff[c.sid as number].name} 开出了高薪，想挖走他。`,
    choices: (c) => [
      { label: '加薪 25% 挽留', run: () => { const s = G.staff[c.sid as number]; s.salary = Math.round(s.salary * 1.25); s.loyalty = clamp(s.loyalty + 25, 0, 100); return `${s.name}决定留下。`; } },
      { label: '打感情牌（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; const s = G.staff[c.sid as number]; if (chance(0.45 + G.manager.skills.leadership / 250)) { s.loyalty = clamp(s.loyalty + 20, 0, 100); return `${s.name}被你的诚意打动，留了下来。`; } leaveStaff(s.id); return `${s.name}还是离开了。`; } },
      { label: '祝他前程似锦', run: () => { leaveStaff(c.sid as number); return '教练离开了球队。'; } },
    ],
  },
  {
    id: 'monsterVisit', weight: 3, cooldown: 12,
    cond: () => G.week >= 4 && G.week <= 38,
    ctx: () => { const ps = G.prospects.map((id) => G.players[id]).filter((p) => p && overall(p) >= 52); if (!ps.length) return null; return { pid: pick(ps).id }; },
    title: '中学生来访',
    text: (c) => `${G.players[c.pid as number].middle}的 ${nameOf(c)} 和父亲一起来参观练习了。`,
    choices: (c) => [
      { label: '监督亲自接待（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; const p = P(c); p.interest![G.club.schoolId] = clamp((p.interest![G.club.schoolId] ?? 0) + 14, 0, 100); p.scout = Math.max(p.scout ?? 0, 3); return `${p.fam}对学校的印象非常好！`; } },
      { label: '交给教练接待', run: () => { const p = P(c); p.interest![G.club.schoolId] = clamp((p.interest![G.club.schoolId] ?? 0) + 5, 0, 100); return '接待顺利结束。'; } },
    ],
  },
  {
    id: 'smoking', weight: 2, cooldown: 40,
    cond: () => club().chemistry < 60 || G.manager.skills.leadership < 50,
    ctx: () => { const p = pickPlayer((x) => x.pers === 'lazy' || x.pers === 'proud'); return p ? { pid: p.id } : null; },
    title: '不祥事',
    text: (c) => `有人目击 ${nameOf(c)} 在校外吸烟。这件事如果被高野联知道……`,
    choices: (c) => [
      { label: '主动向高野联报告', hint: '球队受到轻微处分', run: () => { const p = P(c); p.supplementary = 6; club().scandal = Math.max(0, club().scandal - 15); club().board = clamp(club().board - 4, 0, 100); club().banUntil = Math.max(club().banUntil, G.absWeek + 2); return `${p.fam}被停止活动 6 周，球队被禁止对外比赛 2 周。诚实的处理获得了谅解。`; } },
      { label: '内部处理，不对外公开', hint: '暴露风险极高', run: () => { P(c).supplementary = 3; club().scandal += 40; return '你选择了隐瞒……'; } },
    ],
  },
  {
    id: 'charm', weight: 3, cooldown: 24,
    title: '经理的护身符',
    text: () => '女子经理们熬夜为每一位部员缝制了护身符，上面绣着"必胜"二字。',
    choices: () => [{ label: '谢谢你们！', run: () => { allMor(6); club().chemistry = clamp(club().chemistry + 3, 0, 100); return '全队士气高涨！'; } }],
  },
  {
    id: 'invitational', weight: 3, cooldown: 16,
    cond: () => G.week < 30 && !club().practice,
    ctx: () => { const s = pick(Object.values(G.schools).filter((x) => x.roster && x.id !== mySchool().id && x.prestige > 60)); return s ? { sid: s.id } : null; },
    title: '招待赛邀请',
    text: (c) => `名门${G.schools[c.sid as number].name}邀请你们下周进行练习赛，并承担全部远征费用。`,
    choices: (c) => [
      { label: '欣然接受', run: () => { club().practice = { week: G.week + 1, opponentId: c.sid as number, invited: true }; return '下周将与名门交手！'; } },
      { label: '婉拒', run: ok },
    ],
  },
  {
    id: 'eatTraining', weight: 3, cooldown: 8,
    cond: () => club().meal >= 1,
    ctx: () => { const p = pickPlayer((x) => x.grade <= 2); return p ? { pid: p.id } : null; },
    title: '饭量训练的成果',
    text: (c) => `在宿舍营养餐的支持下，${nameOf(c)} 一个月长了 4 公斤肌肉！`,
    choices: (c) => [{ label: '继续加油', run: () => { const p = P(c); p.a.power = Math.min(99, p.a.power + 2); p.a.durability = Math.min(99, p.a.durability + 2); return `${p.fam}的力量与体质提升了。`; } }],
  },
  {
    id: 'rain', weight: 4, cooldown: 3,
    cond: () => (G.week >= 12 && G.week <= 18) || (G.week >= 45),
    title: '雨天顺延',
    text: () => '大雨导致比赛顺延一天。意外的休息日。',
    choices: () => [{ label: '让投手好好休息', run: () => { active().filter(isPitcher).forEach((p) => (p.fatigue = Math.max(0, p.fatigue - 18))); return '投手们的疲劳恢复了不少。'; } }],
  },
  {
    id: 'coachApply', weight: 2, cooldown: 24,
    title: '自荐的教练',
    text: () => '一位曾在名门执教的教练写信自荐，表示愿意以较低的薪水加入。',
    choices: () => [
      { label: '面谈看看', run: () => { const st = genStaff(undefined, 62); st.salary = Math.round(st.salary * 0.7); G.staff[st.id] = st; G.freeStaff.push(st.id); return `${st.name}（${ROLE_NAME[st.role]}，能力 ${st.skill}）已加入自由教练名单，请在"教练"页面签约。`; } },
      { label: '暂不需要', run: ok },
    ],
  },
  {
    id: 'nightPractice', weight: 4, cooldown: 8,
    ctx: () => { const p = pickPlayer((x) => !x.injury && (x.pers === 'diligent' || x.pers === 'hot' || x.ethic > 70)); return p ? { pid: p.id } : null; },
    title: '自主夜练',
    text: (c) => `晚上路过球场，发现 ${nameOf(c)} 一个人在照明灯下挥棒。看来他每天都练到很晚。`,
    choices: (c) => [
      { label: '陪他练一会儿', hint: '经验增加，但会更累', run: () => { const p = P(c); addExp(p, { tech: 12, men: 8, str: 4 }); p.fatigue = clamp(p.fatigue + 12, 0, 100); p.trust = clamp(p.trust + 6, 0, 100); return `${p.fam}的眼睛亮了。两人一直练到深夜。`; } },
      { label: '劝他早点休息', run: () => { const p = P(c); p.fatigue = Math.max(0, p.fatigue - 8); mor(p, -2); return '"身体也是实力的一部分。"他点了点头。'; } },
    ],
  },
  {
    id: 'earlyReturn', weight: 3, cooldown: 10,
    ctx: () => { const p = pickPlayer((x) => !!x.injury && x.injury.weeks >= 2 && x.injury.severity <= 2); return p ? { pid: p.id } : null; },
    title: '想提前复出',
    text: (c) => `正在养伤的 ${nameOf(c)}（${P(c).injury?.name}）恳求道："我已经没事了，请让我回来练习！"`,
    choices: (c) => [
      { label: '允许他提前复出', hint: '有复发风险', run: () => {
        const p = P(c);
        if (!p.injury) return '他已经伤愈了。';
        if (chance(0.3)) { p.injury.weeks += 4; p.injury.severity = Math.min(3, p.injury.severity + 1) as 1 | 2 | 3; mor(p, -6); return `勉强练习的结果，${p.fam}的伤势加重了……`; }
        p.injury.weeks = Math.max(0, p.injury.weeks - 2);
        if (p.injury.weeks === 0) p.injury = null;
        mor(p, 8);
        return `${p.fam}比预期更早地回到了球场。`;
      } },
      { label: '"完全治好再说"', run: () => { const p = P(c); p.trust = clamp(p.trust + 5, 0, 100); mor(p, -2); return '他有些不甘心，但还是接受了。'; } },
    ],
  },
  {
    id: 'snow', weight: 4, cooldown: 4,
    cond: () => G.week >= 32 && G.week <= 43,
    title: '大雪',
    text: () => (G.club.facilities.indoor ? '一夜大雪，操场被积雪覆盖。幸好有室内练习场，训练可以照常进行。' : '一夜大雪，操场被积雪覆盖，没有室内练习场的我们只能另想办法。'),
    choices: () => [
      { label: '全员除雪 + 体能训练', run: () => { active().forEach((p) => { addExp(p, { str: 4, men: 3 }); p.fatigue = clamp(p.fatigue + 5, 0, 100); }); club().chemistry = clamp(club().chemistry + 2, 0, 100); return '大家一边除雪一边打雪仗，意外地很开心。'; } },
      { label: '放假一天', run: () => { active().forEach((p) => { p.fatigue = Math.max(0, p.fatigue - 10); mor(p, 3); }); return '难得的休息日。'; } },
    ],
  },
  {
    id: 'scoutTip', weight: 3, cooldown: 30,
    cond: () => G.week >= 4 && G.week <= 36 && myStaff().some((s) => s.role === 'scout'),
    title: '球探的情报',
    text: () => '球探神秘兮兮地说："我在一所不起眼的中学发现了一个原石。现在还没人注意到他……"',
    choices: () => [
      { label: '立刻去看看（行动力1）', enabled: () => G.manager.ap >= 1, run: () => { G.manager.ap--; const p = hiddenGem(); p.scout = 3; p.interest![G.club.schoolId] = 25; return `你见到了${p.middle}的${fullName(p)}——确实是块璞玉！（已加入招募名单）`; } },
      { label: '先记下名字', run: () => { const p = hiddenGem(); p.scout = 1; return `${p.middle}的${p.fam}……记住了。（已加入招募名单）`; } },
    ],
  },
  {
    id: 'aceOveruse', weight: 4, cooldown: 12,
    ctx: () => { const p = pickPlayer((x) => isPitcher(x) && x.fatigue >= 70, (x) => x.fatigue); return p ? { pid: p.id } : null; },
    title: '媒体的批评',
    text: (c) => `体育报纸批评你过度使用投手 ${nameOf(c)}："高中生的手臂不是消耗品！"`,
    choices: (c) => [
      { label: '公开表示会保护球员', hint: '该投手进入休养', run: () => { const p = P(c); p.focus = { kind: 'rest' }; club().board = clamp(club().board + 2, 0, 100); return '你的表态获得了好评。'; } },
      { label: '"这是我们的方针"', run: () => { club().fans = Math.max(0, club().fans - 600); club().board = clamp(club().board - 3, 0, 100); return '舆论对你不太友好。'; } },
    ],
  },
  {
    id: 'seniorMentor', weight: 3, cooldown: 12,
    cond: () => club().chemistry >= 55 && active().some((p) => p.grade === 3),
    title: '学长的指导',
    text: () => '练习结束后，三年级生们自发留下来，手把手地教一年级生守备和挥棒的诀窍。',
    choices: () => [{ label: '真是好风气', run: () => { active().filter((p) => p.grade === 1).forEach((p) => addExp(p, { tech: 6, men: 4 })); club().chemistry = clamp(club().chemistry + 2, 0, 100); return '一年级生们获益良多。'; } }],
  },
  {
    id: 'managerSick', weight: 2, cooldown: 30,
    title: '监督病倒了？',
    text: () => '连续熬夜研究对手录像，你感到头晕目眩，体温也有点高。',
    choices: () => [
      { label: '休息两天', hint: '行动力 -2', run: () => { G.manager.ap = Math.max(0, G.manager.ap - 2); return '你在家好好休息了两天。'; } },
      { label: '坚持到练习场', run: () => { if (chance(0.3)) { G.manager.ap = 0; club().board = clamp(club().board - 2, 0, 100); return '你在练习中晕倒了，被送进了医院……本周的行动力全部用尽。'; } club().chemistry = clamp(club().chemistry + 3, 0, 100); allMor(2); return '监督带病指导的身影，让部员们很受触动。'; } },
    ],
  },
  {
    id: 'rivalTaunt', weight: 3, cooldown: 16,
    ctx: () => { const s = Object.values(G.schools).filter((x) => x.prefId === mySchool().prefId && x.id !== mySchool().id).sort((a, b) => b.rivalry + b.prestige - (a.rivalry + a.prestige))[0]; return s ? { sid: s.id } : null; },
    title: '宿敌的挑衅',
    text: (c) => `${G.schools[c.sid as number].name}的队员在采访中说："今年的${mySchool().short}？根本不是对手。"`,
    choices: () => [
      { label: '"用实力说话！"', run: () => { allMor(5); club().chemistry = clamp(club().chemistry + 2, 0, 100); return '部员们憋着一股劲，练习气氛空前高涨。'; } },
      { label: '冷静对待', run: () => '你只是笑了笑。' },
    ],
  },
  {
    id: 'parentDonation', weight: 2, cooldown: 30,
    cond: () => club().fans > 2500,
    title: '家长会的心意',
    text: () => '家长会决定集资，为棒球部添置一些器材。',
    choices: () => [{ label: '心怀感激地收下', run: () => { const v = randInt(30, 80); addMoney(v, 'other', '家长会捐赠'); return `获得 ${v} 万円。`; } }],
  },
  {
    id: 'festival2', weight: 4, cooldown: 40,
    cond: () => G.week >= 24 && G.week <= 27,
    title: '文化祭',
    text: () => '一年一度的文化祭到了。班级都在准备节目，部员们也想参加。',
    choices: () => [
      { label: '放一天假，好好享受', run: () => { active().forEach((p) => { mor(p, 6); p.fatigue = Math.max(0, p.fatigue - 8); }); return '棒球部的烤章鱼烧摊位大受欢迎！'; } },
      { label: '照常训练', run: () => { active().filter((p) => p.pers === 'cheerful' || p.pers === 'hot').forEach((p) => mor(p, -4)); return '训练照常进行，但有些人心不在焉。'; } },
    ],
  },
  {
    id: 'shrine', weight: 0,
    title: '新年参拜',
    text: () => '新年第一天，全队一起去神社参拜。你在许愿时祈祷的是——',
    choices: () => [
      { label: '无病无灾', run: () => { G.flags.healthBless = G.absWeek + 12; return '愿大家平安健康。（12 周内受伤风险降低）'; } },
      { label: '必胜', run: () => { allMor(8); return '"今年一定要去甲子园！"'; } },
      { label: '学业进步', run: () => { active().forEach((p) => (p.academics = clamp(p.academics + 6, 0, 100))); return '希望大家期末都能过关。'; } },
    ],
  },
  {
    id: 'koshienSoil', weight: 0,
    title: '甲子园之土',
    text: () => '比赛结束了。三年级生们跪在甲子园的黑土上，含泪把泥土装进袋子里。"明年，一定要再回到这里……"',
    choices: () => [{ label: '把这份心情传承下去', run: () => { active().filter((p) => p.grade <= 2).forEach((p) => mor(p, 8)); return '低年级生们暗暗发誓。'; } }],
  },
  {
    id: 'grayExposed', weight: 0,
    title: '丑闻曝光！',
    text: () => '周刊杂志刊登了独家新闻：棒球部收受不正当赞助，并让球员参与商业宣传——严重违反学生棒球宪章！',
    choices: () => [{ label: '公开道歉', run: () => { scandalPenalty(true); return '高野联做出处分：对外比赛禁止 3 个月。校方与 OB 会的信任跌到谷底，赞助全部解约。'; } }],
  },
  {
    id: 'scandalExposed', weight: 0,
    title: '不祥事曝光',
    text: () => '被隐瞒的部内问题终究还是曝光了。媒体蜂拥而至，学校电话被打爆。',
    choices: () => [{ label: '召开记者会道歉', run: () => { scandalPenalty(false); return '高野联做出处分：对外比赛禁止 2 个月。'; } }],
  },
];

export const EVENT_BY_ID: Record<string, EventDef> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

function removePlayer(p: Player): void {
  const s = mySchool();
  s.roster = (s.roster ?? []).filter((id) => id !== p.id);
  p.schoolId = -1;
  p.grade = 9;
  delete G.players[p.id];
  G.club.lineup.bench = G.club.lineup.bench.filter((id) => id !== p.id);
}

function leaveStaff(id: number): void {
  const s = mySchool();
  s.staff = s.staff.filter((x) => x !== id);
  const st = G.staff[id];
  if (st) st.schoolId = -1;
  delete G.staff[id];
}

function scandalPenalty(gray: boolean): void {
  const c = G.club;
  c.board = clamp(c.board - (gray ? 35 : 25), 0, 100);
  c.ob = clamp(c.ob - 20, 0, 100);
  c.fans = Math.round(c.fans * 0.7);
  c.banUntil = Math.max(c.banUntil, G.absWeek + (gray ? 12 : 8));
  c.scandal = 0;
  G.manager.reputation = clamp(G.manager.reputation - (gray ? 15 : 10), 0, 100);
  if (gray) {
    c.sponsors = [];
    addMoney(-300, 'fine', '违约赔偿');
  } else {
    c.sponsors = c.sponsors.filter((d) => d.kind !== 'drink');
  }
}

export function makeActive(def: EventDef, ctx: Ctx): ActiveEvent {
  const choices = def.choices(ctx).map((ch) => ({ label: ch.label, hint: ch.hint, disabled: ch.enabled ? !ch.enabled(ctx) : false }));
  return {
    defId: def.id,
    title: typeof def.title === 'function' ? def.title(ctx) : def.title,
    text: def.text(ctx),
    ctx,
    choices,
    pid: typeof ctx.pid === 'number' ? ctx.pid : undefined,
  };
}

export function queueEvent(id: string, ctx: Ctx = {}): void {
  const def = EVENT_BY_ID[id];
  if (def) G.eventQueue.push(makeActive(def, ctx));
}

/** 每周随机事件抽选 */
export function rollWeeklyEvents(): void {
  // 丑闻暴露检定
  if (G.club.scandal > 30 && chance((G.club.scandal - 30) / 400)) {
    queueEvent('scandalExposed');
    return;
  }
  G.club.scandal = Math.max(0, G.club.scandal - 0.5);
  if (!chance(0.42)) return;
  const cands: { def: EventDef; ctx: Ctx }[] = [];
  for (const def of EVENTS) {
    if (def.weight <= 0) continue;
    if ((G.cooldowns[def.id] ?? -1) > G.absWeek) continue;
    if (def.once && G.flags[`ev_${def.id}`]) continue;
    if (def.cond && !def.cond()) continue;
    const ctx = def.ctx ? def.ctx() : {};
    if (!ctx) continue;
    cands.push({ def, ctx });
  }
  if (!cands.length) return;
  const { def, ctx } = weightedPick(cands, (x) => x.def.weight);
  G.cooldowns[def.id] = G.absWeek + (def.cooldown ?? 8);
  if (def.once) G.flags[`ev_${def.id}`] = 1;
  G.eventQueue.push(makeActive(def, ctx));
}

/** 玩家做出选择 */
export function resolveEvent(choice: number): string {
  const ev = G.eventQueue.shift();
  if (!ev) return '';
  const def = EVENT_BY_ID[ev.defId];
  if (!def) return '';
  const ch = def.choices(ev.ctx)[choice];
  if (!ch) return '';
  try {
    return ch.run(ev.ctx);
  } catch {
    return '';
  }
}

export function traitLabel(id: string): string {
  return TRAIT_BY_ID[id]?.name ?? id;
}
