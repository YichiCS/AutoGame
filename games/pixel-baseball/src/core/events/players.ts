// 随机事件：球员个人、伤病、训练与球种
import type { AttrKey, Delivery, PitchType, Player, Pos } from '../types';
import { FIELD_POS, POS_NAME } from '../types';
import { G, log, milestone, mySchool, note } from '../state';
import { chance, hash32, pick, randInt } from '../rng';
import { clamp } from '../util';
import { ATTR_NAME, fullName, has, isPitcher, overall, PERS_NAME, pitchable, posKeyAttrs, posRating, refreshPos } from '../attrs';
import { addExp, maxPitchCount, maxPitchLv } from '../growth';
import { pickNewPitch } from '../player';
import { injure } from '../daily';
import { spend, earn } from '../economy';
import { doy, monthOf, doyOf, yearIdx } from '../calendar';
import { PITCH_DEFS, SIG_PREFIX, SIG_SUFFIX } from '../../data/pitches';
import { TRAITS, TRAIT_BY_ID } from '../../data/traits';
import { EVENTS, def } from './registry';
import { F, N, P, active, alive, allMor, board, chem, fans, fat, lines, mor, pickPlayer, starters, trust } from './util';

/** 让一名球员离队（退部、转学） */
export function leaveTeam(p: Player, why: string): void {
  G.roster = G.roster.filter((id) => id !== p.id);
  if (G.club.captainId === p.id) G.club.captainId = null;
  G.alumni.unshift({ id: p.id, name: fullName(p), pos: p.pos, gradYear: yearIdx(G.day), schoolName: mySchool().name, path: 'left', ovr: Math.round(overall(p)), summary: why, face: p.face });
  delete G.players[p.id];
  log(`${fullName(p)} ${why}`, 'bad');
}

const month = () => monthOf(G.day);

// ================= 球员个人 =================
def('slump', {
  cat: 'player', weight: 5, cd: 25,
  ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && !x.injury && x.cond <= 0, overall); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '低潮', pid: P(c)?.id,
    text: `主力打者 ${N(c)} 最近完全打不出好球，打击练习时也显得心不在焉。`,
    choices: [
      { label: '找他个别谈话', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 8); trust(p, 5); if (chance(0.6 + G.mgr.skills.leadership / 300)) p.cond = Math.max(p.cond, 1); return `谈完之后，${p.fam}的表情明朗了许多。`; } },
      { label: '让他加练', apply: () => { const p = P(c); if (!alive(c)) return ''; addExp(p, { tech: 15 }); fat(p, 12); return `${p.fam}默默地挥了几百次棒。`; } },
      { label: '暂时不管', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.4)) p.cond = Math.max(-2, p.cond - 1); return '你决定等他自己走出来。'; } },
    ],
  }),
});

def('love', {
  cat: 'player', weight: 3, cd: 50,
  ctx: () => { const p = pickPlayer((x) => x.grade >= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '青春', pid: P(c)?.id,
    text: `听说 ${N(c)} 交了女朋友。最近练习一结束，他总是第一个离开。`,
    choices: [
      { label: '默默祝福', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 10); p.cond = Math.min(2, Math.max(-2, p.cond + (chance(0.5) ? 1 : -1))); return `${p.fam}看起来干劲十足。`; } },
      { label: '"棒球部禁止恋爱！"', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, -12); trust(p, -10); return `${p.fam}低下了头，看得出来心里很不服气。`; } },
    ],
  }),
});

def('transferWish', {
  cat: 'player', weight: 3, cd: 60,
  ctx: () => { const p = pickPlayer((x) => x.morale < 40 && (x.pers === 'proud' || x.pers === 'hot') && x.grade <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '转学的念头', pid: P(c)?.id,
    text: `${N(c)}（${P(c) ? PERS_NAME[P(c).pers] : ''}）对出场机会不满，私下说想转学去别的学校。`,
    choices: [
      { label: '挽留，承诺给他机会', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 18); trust(p, 8); chem(-2); return `${p.fam}决定留下来。`; } },
      { label: '尊重他的决定', apply: () => { if (!alive(c)) return ''; leaveTeam(P(c), '转学离开了球队'); return '他离开了。'; } },
      { label: '严厉批评他的软弱', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.35)) { leaveTeam(p, '一气之下退部了'); return ''; } mor(p, -5); trust(p, -10); return `${p.fam}咬着牙留了下来。`; } },
    ],
  }),
});

def('proScout', {
  cat: 'player', weight: 4, cd: 30,
  ctx: () => { const p = pickPlayer((x) => x.grade >= 2 && overall(x) >= 58, overall); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '职业球探来访', pid: P(c)?.id,
    text: `职业球队的球探专程来看 ${N(c)} 的练习，在本子上写个不停。`,
    choices: [
      { label: '欢迎，并介绍他的优点', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 10); p.pop = clamp(p.pop + 10, 0, 100); if (overall(p) > 60) p.wish = 'pro'; return `${p.fam}知道后兴奋得睡不着。`; } },
      { label: '谢绝，以免影响他', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, -3); if (chance(0.5)) p.cond = Math.min(2, p.cond + 1); return '你保护了他免受外界干扰。'; } },
    ],
  }),
});

def('awaken', {
  cat: 'player', weight: 2, cd: 45,
  ctx: () => { const p = pickPlayer((x) => x.morale > 55 && x.pot < 85, (x) => x.ethic); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '开窍', pid: P(c)?.id, tone: 'good',
    text: `一直不起眼的 ${N(c)} 最近练习时的眼神完全不一样了。似乎抓住了什么诀窍。`,
    choices: [{ label: '真令人期待！', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; p.pot = clamp(p.pot + 15, 0, 99); for (const k in p.caps) p.caps[k as AttrKey] += 6; addExp(p, { tech: 20, str: 15, men: 10 }); note(p, '开窍，潜力觉醒'); return `${p.fam}的潜力觉醒了！`; } }],
  }),
});

def('nightPractice', {
  cat: 'player', weight: 4, cd: 30,
  ctx: () => { const p = pickPlayer((x) => !x.injury && (x.pers === 'diligent' || x.pers === 'hot' || x.ethic > 70)); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '自主夜练', pid: P(c)?.id,
    text: `晚上路过球场，发现 ${N(c)} 一个人在照明灯下挥棒。看来他每天都练到很晚。`,
    choices: [
      { label: '陪他练一会儿', def: true, hint: '经验增加，但会更累', apply: () => { const p = P(c); if (!alive(c)) return ''; addExp(p, isPitcher(p) ? { brk: 10, men: 8, str: 4 } : { tech: 12, men: 8, str: 4 }); fat(p, 12); trust(p, 6); return `${p.fam}的眼睛亮了。两人一直练到深夜。`; } },
      { label: '劝他早点休息', apply: () => { const p = P(c); if (!alive(c)) return ''; fat(p, -8); mor(p, -2); return '"身体也是实力的一部分。"他点了点头。'; } },
    ],
  }),
});

def('eatTraining', {
  cat: 'player', weight: () => (G.facilities.dorm ? 3 : 0), cd: 40,
  ctx: () => { const p = pickPlayer((x) => x.grade <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '饭量训练的成果', pid: P(c)?.id,
    text: `在宿舍营养餐的支持下，${N(c)} 一个月长了 4 公斤肌肉！`,
    choices: [{ label: '继续加油', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; p.a.power = Math.min(p.caps.power, p.a.power + 2); p.a.durability = Math.min(99, p.a.durability + 2); return `${p.fam}的力量与体质提升了。`; } }],
  }),
});

def('bigHead', {
  cat: 'player', weight: 3, cd: 40,
  ctx: () => { const p = pickPlayer((x) => x.pop >= 40 && x.grade >= 2, (x) => x.pop); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '骄傲自满', pid: P(c)?.id,
    text: `被报纸夸了几次之后，${N(c)} 开始不认真练习了，还对学弟们指手画脚。`,
    choices: [
      { label: '当众批评，杀杀他的锐气', def: P(c)?.pers !== 'proud', apply: () => { const p = P(c); if (!alive(c)) return ''; if (p.pers === 'proud') { mor(p, -12); trust(p, -8); return `${p.fam}脸色铁青，一句话也不说。`; } mor(p, -4); p.ethic = clamp(p.ethic + 6, 0, 99); chem(2); return `${p.fam}低头认错，第二天第一个到球场。`; } },
      { label: '私下提醒', def: P(c)?.pers === 'proud', apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 4); if (chance(0.6)) { p.ethic = clamp(p.ethic + 4, 0, 99); return '他听进去了。'; } return '他嘴上答应，态度却没什么变化。'; } },
      { label: '让他自己摔一跤就明白了', apply: () => { const p = P(c); if (!alive(c)) return ''; p.cond = Math.max(-2, p.cond - 1); chem(-3); return '队里有人开始不满了。'; } },
    ],
  }),
});

def('hotStreak', {
  cat: 'player', weight: 4, cd: 20,
  ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && x.cond >= 1 && !x.injury, overall); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '手感火热', pid: P(c)?.id, tone: 'good',
    text: `${N(c)} 这几天的打击练习几乎球球打中球芯，连投打击练习的投手都怕了。`,
    choices: [
      { label: '趁热打铁，多给他打席', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; addExp(p, { tech: 14, men: 4 }); p.cond = 2; return `${p.fam}的状态好得吓人。`; } },
      { label: '保持平常心', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 4); return '"保持住这个感觉。"'; } },
    ],
  }),
});

def('speedGun', {
  cat: 'player', weight: 4, cd: 25,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && !x.injury && x.a.velocity < x.caps.velocity - 1, (x) => x.a.velocity - 120); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '测速枪', pid: P(c)?.id,
    text: `牛棚的测速枪上，${N(c)} 的直球跳出了一个从没见过的数字。全队都围了过来。`,
    choices: [
      { label: '"再投一球看看！"', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; p.a.velocity = Math.min(p.caps.velocity, p.a.velocity + 1); mor(p, 6); fat(p, 6); return `最快球速 ${Math.round(p.a.velocity)} km/h！`; } },
      { label: '"别投了，肩膀要紧"', apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 4); return '他有点不甘心地收起了手套。'; } },
    ],
  }),
});

def('gameAddict', {
  cat: 'player', weight: 3, cd: 50,
  ctx: () => { const p = pickPlayer((x) => x.grade <= 2 && (x.pers === 'lazy' || x.pers === 'genius' || x.pers === 'cheerful')); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '黑眼圈', pid: P(c)?.id,
    text: `${N(c)} 最近天天顶着黑眼圈来练习。一问才知道，每晚都打游戏打到凌晨三点。`,
    choices: [
      { label: '没收手机一周', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; fat(p, -10); mor(p, -6); return `${p.fam}哀嚎了一整天，第二天精神好多了。`; } },
      { label: '"游戏可以，觉也要睡"', apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 6); if (chance(0.5)) { fat(p, -6); return '他答应了，似乎也做到了。'; } fat(p, 6); return '答应得很爽快，黑眼圈却没有消失。'; } },
    ],
  }),
});

def('partTime', {
  cat: 'player', weight: 2, cd: 80,
  ctx: () => { const p = pickPlayer((x) => x.grade >= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '偷偷打工', pid: P(c)?.id,
    text: `有人看到 ${N(c)} 深夜在便利店打工。校规是禁止打工的。一问才知道，家里最近经济很困难。`,
    choices: [
      { label: '帮他申请助学金', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 15); mor(p, 10); return `${p.fam}红着眼眶向你鞠了一躬。`; } },
      { label: '和学校商量，允许他周末打工', apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 8); fat(p, 10); board(-2); return '学校勉强同意了。'; } },
      { label: '按校规处理', apply: () => { const p = P(c); if (!alive(c)) return ''; p.benched = Math.max(p.benched, 10); mor(p, -15); trust(p, -15); return `${p.fam}被停止活动十天。`; } },
    ],
  }),
});

def('freshmanNerves', {
  cat: 'player', weight: () => (month() >= 4 && month() <= 7 ? 4 : 1), cd: 40,
  ctx: () => { const p = pickPlayer((x) => x.grade === 1 && x.morale < 60); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '一年级生的烦恼', pid: P(c)?.id,
    text: `一年级的 ${N(c)} 在器材室里偷偷哭。"学长们都太厉害了，我是不是根本不适合打棒球……"`,
    choices: [
      { label: '请一位学长带带他', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 12); chem(2); addExp(p, { tech: 6, men: 6 }); return '学长手把手地教他，两人成了好朋友。'; } },
      { label: '亲自跟他聊聊', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 8); trust(p, 12); return `"每个人都是从这里开始的。"${p.fam}用力地点了点头。`; } },
    ],
  }),
});

def('familyTrouble', {
  cat: 'player', weight: 2, cd: 90,
  ctx: () => { const p = pickPlayer((x) => x.grade >= 1); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '家里的变故', pid: P(c)?.id,
    text: `${N(c)} 的父亲病倒了。他说想退部去打工，帮家里分担。`,
    choices: [
      { label: '和家长、学校一起想办法', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 15); mor(p, 6); board(2); return '学校介绍了补助，他可以继续打球了。'; } },
      { label: '尊重他的决定', apply: () => { if (!alive(c)) return ''; leaveTeam(P(c), '为了家人退部了'); return ''; } },
    ],
  }),
});

def('topStudent', {
  cat: 'player', weight: 2, cd: 60,
  ctx: () => { const p = pickPlayer((x) => x.academics >= 70, (x) => x.academics); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '学年第一', pid: P(c)?.id, tone: 'good',
    text: `${N(c)} 在期中考试里拿了学年第一！班主任特意跑来球场告诉你。`,
    choices: [{ label: '真了不起', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 6); board(2); if (!has(p, 'student') && chance(0.4)) { p.traits.push('student'); note(p, '获得「文武双全」'); return `${p.fam}获得了特殊能力「文武双全」！`; } return '文武双全，说的就是他吧。'; } }],
  }),
});

def('copyPro', {
  cat: 'player', weight: 3, cd: 50,
  ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && x.grade <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '模仿职业球员', pid: P(c)?.id,
    text: `${N(c)} 看了职业比赛的录像，开始模仿某位强打者夸张的抬腿打法。`,
    choices: [
      { label: '让他试试看', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.5)) { p.a.power = Math.min(p.caps.power, p.a.power + 3); p.a.contact = Math.max(5, p.a.contact - 1); return '长打变多了，但三振也多了。'; } p.a.contact = Math.max(5, p.a.contact - 2); return '完全不适合他……'; } },
      { label: '"先打好基础"', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; addExp(p, { tech: 8 }); return '他乖乖回到了基本的挥棒。'; } },
    ],
  }),
});

def('secretPitch', {
  cat: 'training', weight: 2, cd: 80,
  ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && x.a.arm >= 62 && !pitchable(x)); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '偷偷练投球', pid: P(c)?.id,
    text: `野手 ${N(c)} 每天练习结束后都在牛棚偷偷练投球。他的肩膀很强，球速居然有模有样。`,
    choices: [
      { label: '让他兼任投手', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; for (const [k, d] of [['control', 10], ['stamina', 10], ['stuff', 8]] as const) { p.caps[k] = Math.max(p.caps[k], p.a[k] + d + 8); p.a[k] = Math.min(95, p.a[k] + d); } p.a.velocity = Math.min(p.caps.velocity, p.a.velocity + 2); if (!p.pitches.length) p.pitches.push({ type: pickNewPitch([], 'three', 1) ?? 'SL', lv: 1 }); note(p, '开始兼任投手'); return `${p.fam}成了「二刀流」！`; } },
      { label: '"专心守备"', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, -3); return '他有点失落。'; } },
    ],
  }),
});

def('switchHit', {
  cat: 'training', weight: 2, cd: 80,
  ctx: () => { const p = pickPlayer((x) => !isPitcher(x) && x.bats === 'R' && x.a.speed >= 60 && x.grade <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '改左打？', pid: P(c)?.id,
    text: `${N(c)} 脚程很快。有人建议他改成左打——离一垒近一步，内野安打会多很多。`,
    choices: [
      { label: '改左打', apply: () => { const p = P(c); if (!alive(c)) return ''; p.bats = 'L'; p.a.contact = Math.max(5, p.a.contact - 4); if (!has(p, 'infHit') && p.a.speed >= 60) p.traits.push('infHit'); note(p, '改为左打'); return `${p.fam}改成了左打，暂时还不太习惯。`; } },
      { label: '挑战左右开弓', hint: '更难，但成了就很强', apply: () => { const p = P(c); if (!alive(c)) return ''; p.bats = 'S'; p.a.contact = Math.max(5, p.a.contact - 6); addExp(p, { tech: 20 }); note(p, '挑战左右开弓'); return '左右开弓的特训开始了。'; } },
      { label: '维持现状', def: true, apply: () => '' },
    ],
  }),
});

// ================= 伤病 =================
def('aceElbow', {
  cat: 'injury', weight: 5, cd: 40,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && !x.injury && (x.fatigue > 45 || x.pitchesWeek > 200), (x) => x.fatigue); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '肘部的异样', pid: P(c)?.id,
    text: `投手 ${N(c)} 在牛棚练投后表示右肘有些发麻。他本人坚持说："没问题，还能投！"`,
    choices: [
      { label: '让他休养两周', def: true, hint: '安全第一', apply: () => { const p = P(c); if (!alive(c)) return ''; p.benched = Math.max(p.benched, 14); fat(p, -30); mor(p, -3); return `${F(c)}进入休养调整。`; } },
      { label: '去大医院精密检查（15 万）', apply: () => { const p = P(c); if (!alive(c)) return ''; spend(15, 'medical'); if (chance(0.6)) { fat(p, -15); return '检查结果只是轻微疲劳，休息几天就好。'; } injure(p, { name: '肘部炎症', part: 'elbow', days: randInt(20, 35), severity: 2 }); return '发现肘部发炎。好在发现得早。'; } },
      { label: '打止痛针继续投', hint: '有重伤风险', apply: () => { const p = P(c); if (!alive(c)) return ''; mor(p, 6); if (chance(0.35)) { injure(p, { name: '肘内侧韧带损伤', part: 'elbow', days: randInt(90, 150), severity: 3 }); return '勉强投球的结果……肘部韧带受了重伤。'; } return `${F(c)}忍着疼痛继续练投，暂时没有出现问题。`; } },
    ],
  }),
});

def('earlyReturn', {
  cat: 'injury', weight: 3, cd: 30,
  ctx: () => { const p = pickPlayer((x) => !!x.injury && x.injury.days >= 10 && x.injury.severity <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '想提前复出', pid: P(c)?.id,
    text: `正在养伤的 ${N(c)}（${P(c)?.injury?.name ?? '伤'}）恳求道："我已经没事了，请让我回来练习！"`,
    choices: [
      { label: '允许他提前复出', hint: '有复发风险', apply: () => { const p = P(c); if (!alive(c) || !p.injury) return '他已经伤愈了。'; if (chance(0.3)) { p.injury.days += 20; p.injury.severity = Math.min(3, p.injury.severity + 1) as 1 | 2 | 3; mor(p, -6); return '勉强练习的结果，伤势加重了……'; } p.injury.days = Math.max(0, p.injury.days - 10); mor(p, 8); return '他比预期更早地回到了球场。'; } },
      { label: '"完全治好再说"', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; trust(p, 5); mor(p, -2); return '他有些不甘心，但还是接受了。'; } },
    ],
  }),
});

def('heat', {
  cat: 'injury', weight: () => (month() >= 7 && month() <= 8 ? 6 : 0), cd: 20,
  ctx: () => { const p = pickPlayer((x) => !x.injury); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '酷暑', pid: P(c)?.id,
    text: `连日的高温中，${N(c)} 在练习时出现了中暑症状。`,
    choices: [
      { label: '立刻送医，全队调整训练时间', def: true, apply: () => { if (!alive(c)) return ''; fat(P(c), 10); active().forEach((x) => fat(x, -6)); return '你把训练改到了早晚凉快的时候，增加补水。'; } },
      { label: '让他在树荫下休息就好', hint: '有危险', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.3)) { injure(p, { name: '重度中暑', part: 'other', days: 12, severity: 2 }); board(-5); return '情况恶化，被紧急送往医院……校方对你的处理很不满。'; } return '休息之后恢复了，有惊无险。'; } },
    ],
  }),
});

def('blister', {
  cat: 'injury', weight: 3, cd: 30,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && !x.injury && x.pitches.length > 0); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '指尖的水泡', pid: P(c)?.id,
    text: `${N(c)} 的中指磨出了水泡。变化球的旋转明显不对劲。`,
    choices: [
      { label: '休息三天', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; p.benched = Math.max(p.benched, 3); return '三天后，水泡好了。'; } },
      { label: '贴上胶布继续投', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.25)) { injure(p, { name: '指甲破裂', part: 'hand', days: randInt(8, 14), severity: 1 }); return '指甲裂开了……'; } return '似乎没什么影响。'; } },
    ],
  }),
});

def('backPain', {
  cat: 'injury', weight: 3, cd: 40,
  ctx: () => { const p = pickPlayer((x) => !x.injury && x.fatigue > 40, (x) => x.fatigue); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '腰痛', pid: P(c)?.id,
    text: `${N(c)} 弯腰捡球时皱了一下眉。他说腰有点酸，"应该没事"。`,
    choices: [
      { label: '请训练师看看，减轻训练', def: true, apply: () => { const p = P(c); if (!alive(c)) return ''; fat(p, -20); p.benched = Math.max(p.benched, 4); return '只是肌肉疲劳，调整几天就好。'; } },
      { label: '照常训练', apply: () => { const p = P(c); if (!alive(c)) return ''; if (chance(0.3)) { injure(p, { name: '腰部扭伤', part: 'back', days: randInt(15, 30), severity: 2 }); return '第二天，他连床都起不来了。'; } return '忍了几天，似乎好了。'; } },
    ],
  }),
});

def('aceOveruse', {
  cat: 'injury', weight: 4, cd: 45,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && (x.fatigue >= 70 || x.pitchesWeek >= 350), (x) => x.fatigue); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '媒体的批评', pid: P(c)?.id,
    text: `体育报纸批评你过度使用投手 ${N(c)}："高中生的手臂不是消耗品！"`,
    choices: [
      { label: '公开表示会保护球员', def: true, hint: '该投手休养一周', apply: () => { const p = P(c); if (!alive(c)) return ''; p.benched = Math.max(p.benched, 7); fat(p, -25); board(2); return '你的表态获得了好评。'; } },
      { label: '"这是我们的方针"', apply: () => { fans(-600); board(-3); return '舆论对你不太友好。'; } },
      { label: '改成继投策略', apply: () => { G.policies.pitcherUse = 'bullpen'; board(3); return '投手起用改为「继投」。'; } },
    ],
  }),
});

// ================= 训练与球种 =================
def('inspiration', {
  cat: 'training', weight: 3, cd: 40,
  ctx: () => {
    const p = pickPlayer((x) => isPitcher(x) && x.pitches.length < maxPitchCount(x) && !x.learning);
    if (!p) return null;
    const t = pickNewPitch(p.pitches.map((x) => x.type), p.delivery, 3);
    return t ? { pid: p.id, pitch: t } : null;
  },
  build: (c) => {
    const t = c.pitch as PitchType;
    return {
      title: '灵光一闪', pid: P(c)?.id, tone: 'good',
      text: `投手 ${N(c)} 在投接球时，偶然投出了一个奇妙的${PITCH_DEFS[t].name}！（${PITCH_DEFS[t].desc}）`,
      choices: [
        { label: '鼓励他继续钻研', def: true, apply: () => { const p = P(c); if (!alive(c) || p.pitches.some((x) => x.type === t) || p.pitches.length >= maxPitchCount(p)) return ''; p.pitches.push({ type: t, lv: 1 }); note(p, `学会${PITCH_DEFS[t].name}`); return `${p.fam}掌握了${PITCH_DEFS[t].name}！`; } },
        { label: '先专注现有球种', apply: () => { const p = P(c); if (!alive(c) || !p.pitches.length) return ''; const ps = p.pitches[0]; ps.lv = Math.min(maxPitchLv(p), ps.lv + 1); return `${p.fam}的${ps.sig ?? PITCH_DEFS[ps.type].name}更加锋利了。`; } },
      ],
    };
  },
});

// 想学新球种：系统事件 learnPitch 也可以随机出现
Object.assign(EVENTS.learnPitch, {
  weight: 4,
  cd: 30,
  ctx: () => {
    const p = pickPlayer((x) => isPitcher(x) && !x.learning && x.pitches.length < maxPitchCount(x) && x.exp.brk > 20, (x) => x.exp.brk);
    if (!p) return null;
    const owned = p.pitches.map((x) => x.type);
    const opts: PitchType[] = [];
    for (let k = 0; k < 8 && opts.length < 3; k++) {
      const t = pickNewPitch([...owned, ...opts], p.delivery, p.pot >= 70 ? 3 : 2);
      if (t && !opts.includes(t)) opts.push(t);
    }
    return opts.length ? { pid: p.id, opts } : null;
  },
});

// 魔球：变化球练到 5 级以上，有很小的机会开发出独创魔球
Object.assign(EVENTS.sigPitch, {
  weight: 0.7,
  cd: 200,
  ctx: () => {
    const p = pickPlayer((x) => isPitcher(x) && x.pitches.some((ps) => ps.lv >= 5 && !ps.sig) && !x.pitches.some((ps) => ps.sig), (x) => x.pot);
    if (!p) return null;
    const idx = p.pitches.findIndex((ps) => ps.lv >= 5 && !ps.sig);
    const fam = PITCH_DEFS[p.pitches[idx].type].family;
    const sufs = SIG_SUFFIX[fam] ?? ['魔球'];
    const h = hash32(p.id, G.day);
    const names = [0, 1, 2].map((i) => `${SIG_PREFIX[(h >> (i * 4)) % SIG_PREFIX.length]}${sufs[(h >> (i * 3 + 1)) % sufs.length]}`);
    return { pid: p.id, idx, names: [...new Set(names)] };
  },
});

def('gripTip', {
  cat: 'training', weight: 3, cd: 35,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && x.pitches.some((ps) => ps.lv < maxPitchLv(x))); return p ? { pid: p.id } : null; },
  build: (c) => {
    const p = P(c);
    const ps = p?.pitches.filter((x) => x.lv < maxPitchLv(p)).sort((a, b) => a.lv - b.lv)[0];
    return {
      title: '新的握法', pid: p?.id,
      text: `${N(c)} 在杂志上看到职业投手的握法，想试着改一改${ps ? ps.sig ?? PITCH_DEFS[ps.type].name : '变化球'}。`,
      choices: [
        { label: '试试看', def: true, apply: () => { if (!alive(c) || !ps) return ''; if (chance(0.7)) { ps.lv = Math.min(7, ps.lv + 1); return `${PITCH_DEFS[ps.type].name}的变化更锐利了！（${ps.lv} 级）`; } return '怎么也找不到感觉，最后还是改了回去。'; } },
        { label: '不要乱改', apply: () => '' },
      ],
    };
  },
});

def('deliveryChange', {
  cat: 'training', weight: 2, cd: 120,
  ctx: () => { const p = pickPlayer((x) => isPitcher(x) && (x.delivery === 'over' || x.delivery === 'three') && x.a.control < 55 && x.grade <= 2); return p ? { pid: p.id } : null; },
  build: (c) => ({
    title: '改成侧投？', pid: P(c)?.id,
    text: `${N(c)} 的控球一直不稳定。有人建议他放低手臂改成侧投——球速会慢一点，但球路会刁钻得多，还适合投下沉球、内飘球。`,
    choices: [
      { label: '改侧投', apply: () => { const p = P(c); if (!alive(c)) return ''; p.delivery = 'side'; p.a.velocity = Math.max(100, p.a.velocity - 3); p.a.control = Math.min(p.caps.control, p.a.control + 6); p.caps.control = Math.min(99, p.caps.control + 5); if (p.pitches.length < maxPitchCount(p)) { const t = pickNewPitch(p.pitches.map((x) => x.type), 'side', 2); if (t) p.pitches.push({ type: t, lv: 1 }); } note(p, '改为侧投'); return `${p.fam}改成了侧投。`; } },
      { label: '改下勾投法', hint: '更极端，变化更大', apply: () => { const p = P(c); if (!alive(c)) return ''; p.delivery = 'under'; p.a.velocity = Math.max(100, p.a.velocity - 6); p.a.control = Math.min(p.caps.control, p.a.control + 4); p.a.stuff = Math.min(p.caps.stuff, p.a.stuff + 6); if (p.pitches.length < maxPitchCount(p)) { const t = pickNewPitch(p.pitches.map((x) => x.type), 'under', 3); if (t) p.pitches.push({ type: t, lv: 1 }); } note(p, '改为下勾投法'); return `${p.fam}成了少见的下勾投手！`; } },
      { label: '维持现在的投法', def: true, apply: () => '' },
    ],
  }),
});

def('posChange', {
  cat: 'training', weight: 2, cd: 90,
  ctx: () => {
    const p = pickPlayer((x) => !isPitcher(x) && x.grade <= 2 && x.pos !== 'C');
    if (!p) return null;
    // 除了现在的位置，评价最高的另一个守备位置
    const best = FIELD_POS.filter((pos) => pos !== p.pos).sort((a, b) => posRating(p, b) - posRating(p, a))[0];
    const to: Pos = p.a.arm >= 60 && p.a.catching >= 50 && chance(0.3) ? 'C' : best ?? 'LF';
    return { pid: p.id, to };
  },
  build: (c) => {
    const to = c.to as Pos;
    return {
      title: '转换守备位置', pid: P(c)?.id,
      text: `${N(c)} 现在守${P(c) ? POS_NAME[P(c).pos] : ''}。有人觉得他也能守${POS_NAME[to]}${to === 'C' ? '——队里正缺捕手' : ''}，要不要让他多练练？`,
      choices: [
        { label: `加练${POS_NAME[to]}`, apply: () => { const p = P(c); if (!alive(c)) return ''; const ks = posKeyAttrs(to); for (const k of ks) { p.caps[k] = Math.max(p.caps[k], p.a[k] + 6); p.a[k] = Math.min(95, p.a[k] + 3); } refreshPos(p); note(p, `加练${POS_NAME[to]}`); return `${p.fam}开始加练${POS_NAME[to]}，${ks.map((k) => ATTR_NAME[k]).join('、')}都有提升。${p.pos === to ? `现在他最适合的位置是${POS_NAME[to]}了。` : ''}`; } },
        { label: '维持现在的位置', def: true, apply: () => '' },
      ],
    };
  },
});

def('oldCoach', {
  cat: 'training', weight: 1.5, cd: 150,
  ctx: () => {
    const p = pickPlayer((x) => x.grade <= 2, (x) => x.pot);
    if (!p) return null;
    const pool = TRAITS.filter((t) => t.good && !t.rare && !p.traits.includes(t.id) && !p.traits.includes(t.opp ?? '') && (!t.pitcherOnly || isPitcher(p)) && (!t.catcherOnly || p.pos === 'C') && (isPitcher(p) ? t.kind !== 'bat' : t.kind !== 'pit') && (!t.req || t.req(p)));
    if (!pool.length) return null;
    return { pid: p.id, trait: pick(pool).id };
  },
  build: (c) => {
    const t = TRAIT_BY_ID[c.trait as string];
    return {
      title: '神秘的老人', pid: P(c)?.id, tone: 'good',
      text: lines('一位每天都在球场外看练习的老人，有一天叫住了你。原来他是几十年前带队打进过甲子园决赛的传奇监督。', `"那个孩子（${N(c)}），我来教他一招吧。"`),
      choices: [
        { label: '恭敬地请他指导', def: true, apply: () => { const p = P(c); if (!alive(c) || !t || p.traits.includes(t.id)) return ''; p.traits = p.traits.filter((x) => x !== t.opp); p.traits.push(t.id); note(p, `跟传奇监督学会「${t.name}」`); return `${p.fam}学会了特殊能力「${t.name}」！`; } },
        { label: '婉言谢绝', apply: () => '老人笑了笑，消失在夕阳里。' },
      ],
    };
  },
});

def('videoStudy', {
  cat: 'training', weight: 3, cd: 40,
  ctx: () => (active().length ? {} : null),
  build: () => ({
    title: '录像研究会',
    text: '部员们自发组织了录像研究会，晚上一起看职业比赛和对手的录像。',
    choices: [
      { label: '提供器材和零食（10 万）', def: G.funds > 60, apply: () => { spend(10, 'other'); active().forEach((p) => p.exp.men += 4); G.club.tactics = clamp(G.club.tactics + 3, 0, 100); return '大家讨论得很热烈，战术熟练度上升。'; } },
      { label: '"早点睡觉！"', def: G.funds <= 60, apply: () => { active().forEach((p) => fat(p, -3)); return ''; } },
    ],
  }),
});

def('extraPractice', {
  cat: 'training', weight: () => (doy(G.day) >= doyOf(6, 1) && doy(G.day) < doyOf(7, 8) ? 5 : 0), cd: 60,
  ctx: () => (active().some((p) => p.grade === 3) ? {} : null),
  build: () => ({
    title: '最后的夏天',
    text: '三年级生们来找你："这是我们最后的夏天了。请让我们练得再狠一点！"',
    choices: [
      { label: '加练到大会开始', def: G.policies.intensity < 2, apply: () => { active().forEach((p) => { addExp(p, isPitcher(p) ? { brk: 8, str: 6, men: 6 } : { tech: 9, str: 6, men: 5 }); fat(p, 10); if (p.grade === 3) { p.morale = clamp(p.morale + 10, 0, 100); } }); chem(4); return '球场的灯每天都亮到很晚。'; } },
      { label: '保持节奏，调整状态最重要', def: G.policies.intensity >= 2, apply: () => { active().forEach((p) => fat(p, -8)); return '大家把状态调整到了最好。'; } },
    ],
  }),
});

