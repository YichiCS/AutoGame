// 每天：训练、疲劳、伤病、调子、干劲
import type { ExpPool, Injury, Player, TrainFocus } from './types';
import { EXP_KINDS } from './types';
import { G, log, myPlayers, note } from './state';
import { chance, gauss, pick, randInt, weightedPick } from './rng';
import { clamp } from './util';
import { fullName, has, isPitcher, overall } from './attrs';
import { autoSpend, curveMult, ethicMult, progressLearning, talentMult } from './growth';
import { isOffseason, monthOf, weekday } from './calendar';
import { PITCH_DEFS } from '../data/pitches';
import { queue } from './queue';

/** 每个训练日的基础经验（会再乘以天赋、成长期、态度、强度、设施……） */
export const TRAIN = { base: 2.5 };

export const INTENSITY = [
  { name: '轻松', exp: 0.75, fat: 2.5, inj: 0.55, mor: 0.12 },
  { name: '普通', exp: 1.0, fat: 5, inj: 1, mor: 0 },
  { name: '严格', exp: 1.25, fat: 8, inj: 1.55, mor: -0.12 },
  { name: '地狱', exp: 1.5, fat: 11.5, inj: 2.4, mor: -0.32 },
];

export const FOCUS_NAME: Record<TrainFocus, string> = {
  balanced: '均衡',
  batting: '打击',
  pitching: '投手',
  defense: '守备走垒',
  physical: '体能',
  mental: '精神',
  practical: '实战',
};

export const FOCUS_DESC: Record<TrainFocus, string> = {
  balanced: '各项均衡发展',
  batting: '野手专攻打击，技术、力量经验多；投手练得少一些',
  pitching: '投手重点练习，变化经验多、学球种快；野手练得少一些',
  defense: '守备与跑垒，敏捷、技术经验多',
  physical: '跑步与重训，力量、敏捷经验多，但更累',
  mental: '冥想、研究录像，精神经验多，疲劳少',
  practical: '以分组对抗为主，经验均衡，战术熟练度和默契上升快',
};

const DIST_BAT: Record<TrainFocus, Partial<ExpPool>> = {
  balanced: { str: 0.26, agi: 0.25, tech: 0.33, men: 0.16 },
  batting: { str: 0.32, agi: 0.13, tech: 0.43, men: 0.12 },
  pitching: { str: 0.26, agi: 0.25, tech: 0.33, men: 0.16 },
  defense: { str: 0.14, agi: 0.38, tech: 0.34, men: 0.14 },
  physical: { str: 0.45, agi: 0.35, tech: 0.08, men: 0.12 },
  mental: { str: 0.15, agi: 0.15, tech: 0.25, men: 0.45 },
  practical: { str: 0.22, agi: 0.24, tech: 0.34, men: 0.2 },
};
const DIST_PIT: Record<TrainFocus, Partial<ExpPool>> = {
  balanced: { str: 0.24, agi: 0.14, tech: 0.18, brk: 0.26, men: 0.18 },
  batting: { str: 0.24, agi: 0.14, tech: 0.18, brk: 0.26, men: 0.18 },
  pitching: { str: 0.26, agi: 0.1, tech: 0.16, brk: 0.32, men: 0.16 },
  defense: { str: 0.2, agi: 0.22, tech: 0.2, brk: 0.2, men: 0.18 },
  physical: { str: 0.45, agi: 0.25, tech: 0.05, brk: 0.1, men: 0.15 },
  mental: { str: 0.15, agi: 0.1, tech: 0.15, brk: 0.2, men: 0.4 },
  practical: { str: 0.22, agi: 0.12, tech: 0.2, brk: 0.26, men: 0.2 },
};
/** 方针对野手 / 投手总量的倍率 */
const ROLE_MULT: Record<TrainFocus, [number, number]> = {
  balanced: [1, 1],
  batting: [1.12, 0.88],
  pitching: [0.88, 1.15],
  defense: [1.04, 0.96],
  physical: [1.05, 1.05],
  mental: [0.95, 0.95],
  practical: [1, 1],
};

/** 今天每个人在干什么（画面用，不存档） */
export type Act = 'bat' | 'pitch' | 'catch' | 'field' | 'run' | 'weight' | 'rest' | 'injured' | 'study' | 'mental';
export const activity = new Map<number, Act>();

/** 下雨（梅雨、台风）：没有室内练习场时训练打折 */
export function rainy(): boolean {
  return (G.flags.rainUntil ?? -1) >= G.day;
}

function moraleMult(p: Player): number {
  return p.morale < 35 ? 0.82 : p.morale < 50 ? 0.93 : p.morale > 80 ? 1.08 : 1;
}

function actFor(p: Player, focus: TrainFocus): Act {
  if (isPitcher(p)) {
    if (focus === 'physical') return pick(['run', 'weight', 'pitch']);
    if (focus === 'mental') return pick(['mental', 'pitch']);
    return chance(0.7) ? 'pitch' : pick(['run', 'field']);
  }
  if (p.pos === 'C' && chance(0.4)) return 'catch';
  switch (focus) {
    case 'batting':
      return chance(0.75) ? 'bat' : 'field';
    case 'defense':
      return chance(0.7) ? 'field' : 'run';
    case 'physical':
      return pick(['run', 'weight', 'run']);
    case 'mental':
      return pick(['mental', 'bat', 'field']);
    default:
      return pick(['bat', 'field', 'bat', 'field', 'run']);
  }
}

/** 一个训练日的经验 */
export function dailyExp(p: Player): number {
  const pol = G.policies;
  let e = TRAIN.base * talentMult(p) * curveMult(p) * ethicMult(p);
  e *= INTENSITY[pol.intensity].exp;
  e *= 1 + G.facilities.field * 0.05;
  e *= moraleMult(p) * (1 + p.cond * 0.03);
  if (isOffseason(G.day)) e *= G.facilities.indoor ? 1 + G.facilities.indoor * 0.04 : 0.82;
  else if (rainy() && !G.facilities.indoor) e *= 0.6;
  if (has(p, 'student')) e *= 1.03;
  e *= pol.study === 'baseball' ? 1.05 : pol.study === 'academic' ? 0.92 : 1;
  e *= G.difficulty === 'easy' ? 1.15 : G.difficulty === 'hard' ? 0.9 : 1;
  if (p.fatigue > 70) e *= 0.8;
  e *= ROLE_MULT[pol.focus][isPitcher(p) ? 1 : 0];
  return e;
}

/** 按方针、设施和监督能力把经验分到五种经验池 */
export function expSplit(p: Player, e: number): ExpPool {
  const pol = G.policies;
  const pit = isPitcher(p);
  const dist = (pit ? DIST_PIT : DIST_BAT)[pol.focus];
  const f = G.facilities;
  const sk = G.mgr.skills;
  const winter = isOffseason(G.day);
  const out = { str: 0, agi: 0, tech: 0, brk: 0, men: 0 } as ExpPool;
  for (const k of EXP_KINDS) {
    let v = e * (dist[k] ?? 0);
    if (k === 'tech') v *= (1 + (pit ? f.bullpen * 0.08 : f.cage * 0.1)) * (0.85 + (pit ? sk.pitching : sk.batting) / 333);
    if (k === 'str') v *= (1 + f.weight * 0.1) * (winter ? 1.2 : 1);
    if (k === 'brk') v *= (1 + f.bullpen * 0.08) * (0.85 + sk.pitching / 333);
    if (k === 'agi') v *= 0.85 + sk.fielding / 333;
    if (k === 'men') v *= (1 + f.analysis * 0.05) * (0.9 + sk.leadership / 500) * (winter ? 1.1 : 1);
    out[k] = v;
  }
  return out;
}

function injuryFor(p: Player): Injury {
  const pit = isPitcher(p);
  const sev = weightedPick<[1 | 2 | 3, number]>([[1, 65], [2, 28], [3, 7]], (x) => x[1])[0];
  const parts: [Injury['part'], string[], number][] = pit
    ? [['elbow', ['肘部炎症', '肘部疲劳性损伤', '肘内侧韧带损伤'], 32], ['shoulder', ['肩部炎症', '肩膀疲劳', '肩袖损伤'], 28], ['leg', ['腿部拉伤', '脚踝扭伤', '膝盖疼痛'], 20], ['back', ['腰痛', '腰部扭伤', '腰椎分离症'], 14], ['hand', ['指甲破裂', '手指水泡', '手腕挫伤'], 6]]
    : [['leg', ['大腿拉伤', '脚踝扭伤', '膝韧带损伤'], 38], ['hand', ['手指骨折', '手腕挫伤', '手掌裂伤'], 22], ['back', ['腰痛', '腰部扭伤', '腰椎分离症'], 18], ['shoulder', ['肩膀疼痛', '肩部扭伤', '肩关节脱臼'], 12], ['other', ['死球造成的挫伤', '中暑', '肋骨骨裂'], 10]];
  const [part, names] = weightedPick(parts, (x) => x[2]);
  const days = sev === 1 ? randInt(3, 12) : sev === 2 ? randInt(15, 40) : randInt(60, 150);
  return { name: names[sev - 1], part, days, severity: sev };
}

/** 让某人受伤（事件里也用） */
export function injure(p: Player, inj?: Injury): Injury {
  const i = inj ?? injuryFor(p);
  i.days = Math.round(i.days * (1 - G.facilities.medical * 0.1));
  p.injury = i;
  note(p, `受伤：${i.name}（约 ${i.days} 天）`);
  log(`${fullName(p)} ${i.name}，预计休养 ${i.days} 天`, i.severity >= 2 ? 'bad' : 'info');
  // 重伤：手术还是保守治疗交给监督决定（保守治疗可能留下后遗症）
  if (i.severity === 3) queue('injurySerious', { pid: p.id, seed: G.day });
  return i;
}

function injuryChance(p: Player): number {
  const pol = G.policies;
  let c = 0.0007 * (1 + Math.max(0, p.fatigue - 45) / 20) ** 2 * INTENSITY[pol.intensity].inj * (1.35 - p.a.durability / 100);
  if (has(p, 'fragile')) c *= 1.8;
  if (has(p, 'durable')) c *= 0.5;
  c *= 1 - G.facilities.medical * 0.11;
  if ((G.flags.healthBless ?? 0) > G.day) c *= 0.6;
  if (G.difficulty === 'hard') c *= 1.15;
  if (isPitcher(p) && p.pitchesWeek > 350) c *= 1.6;
  return c;
}

function trackVelocity(p: Player, before: number): void {
  for (const mark of [140, 145, 150, 155, 160]) {
    if (before < mark && p.a.velocity >= mark) {
      log(`${fullName(p)} 的最快球速突破 ${mark} km/h！`, mark >= 150 ? 'gold' : 'good');
      note(p, `最快球速突破 ${mark} km/h`);
      if (mark >= 150) G.flags.v150 = Math.max(G.flags.v150 ?? 0, mark);
    }
  }
}

/** 每天：所有在籍球员的训练与状态 */
export function dailyTeam(matchToday: boolean): void {
  const pol = G.policies;
  const wd = weekday(G.day);
  const sunday = wd === 6;
  activity.clear();
  const players = myPlayers();
  for (const p of players) {
    p.pw.shift();
    p.pw.push(0);
    p.pitchesWeek = p.pw.reduce((a, b) => a + b, 0);
    if (p.benched > 0) p.benched--;
    // 学业
    p.academics = clamp(p.academics + (pol.study === 'academic' ? 0.04 : pol.study === 'baseball' ? -0.02 : 0.005), 0, 100);
    if (p.injury) {
      p.injury.days -= 1 + G.facilities.medical * 0.1;
      p.fatigue = Math.max(0, p.fatigue - 6);
      activity.set(p.id, 'injured');
      if (p.injury.days <= 0) {
        log(`${fullName(p)} 伤愈归队`, 'good');
        p.injury = null;
      }
      continue;
    }
    if (p.benched > 0) {
      activity.set(p.id, 'study');
      continue;
    }
    const rest = sunday || (pol.autoRest && p.fatigue >= 75) || (matchToday && p.pw[6] > 0);
    if (rest) {
      p.fatigue = Math.max(0, p.fatigue - (15 + G.facilities.dorm * 1.2 + G.facilities.medical * 0.5 + (has(p, 'recovery') ? 4 : 0)));
      p.morale = clamp(p.morale + 0.6, 0, 100);
      activity.set(p.id, 'rest');
      continue;
    }
    // 训练
    const e = dailyExp(p) * (matchToday ? 0.5 : 1);
    const gain = expSplit(p, e);
    for (const k of EXP_KINDS) p.exp[k] += gain[k];
    const velBefore = p.a.velocity;
    const got = autoSpend(p, p.plan, 30);
    const pts = Object.values(got).reduce((a, b) => a + (b ?? 0), 0);
    if (pts) {
      p.gains = (p.gains ?? 0) + pts;
      const gw = (p.gw ??= {});
      for (const [k, v] of Object.entries(got)) gw[k as keyof typeof gw] = (gw[k as keyof typeof gw] ?? 0) + (v ?? 0);
    }
    if (isPitcher(p)) trackVelocity(p, velBefore);
    // 学新球种
    if (p.learning) {
      const t = progressLearning(p, gain.brk * 0.9 * (1 + G.facilities.bullpen * 0.12) + 0.15);
      if (t) {
        log(`${fullName(p)} 学会了${PITCH_DEFS[t].name}！`, 'good');
        note(p, `学会${PITCH_DEFS[t].name}`);
      }
    }
    // 疲劳
    const winter = isOffseason(G.day);
    const fatGain = INTENSITY[pol.intensity].fat * (pol.focus === 'physical' ? 1.2 : pol.focus === 'mental' ? 0.7 : 1) * (winter ? 1.1 : 1);
    const recover = 4.8 + G.facilities.dorm * 0.4 + G.facilities.medical * 0.3 + (has(p, 'recovery') ? 1.5 : 0) + p.a.durability / 60;
    p.fatigue = clamp(p.fatigue + fatGain - recover, 0, 100);
    if (chance(injuryChance(p))) {
      injure(p);
      continue;
    }
    // 干劲
    let dm = (58 + G.club.chemistry * 0.2 - p.morale) * 0.02 + INTENSITY[pol.intensity].mor;
    if (p.pers === 'lazy' && pol.intensity >= 2) dm -= 0.25;
    if (p.pers === 'cheerful') dm += 0.08;
    p.morale = clamp(p.morale + dm, 0, 100);
    activity.set(p.id, actFor(p, pol.focus));
  }

  // 队伍
  const c = G.club;
  c.tactics = clamp(c.tactics + 0.03 * (pol.focus === 'practical' ? 3 : 1) * (1 + G.facilities.analysis * 0.1) - 0.006, 0, 100);
  if (wd === 0) weekly(players);
}

/** 每周一：调子、默契 */
function weekly(players: Player[]): void {
  const c = G.club;
  for (const p of players) {
    // 成长记录往前滚一周
    p.gwp = p.gw ?? {};
    p.gw = {};
    const sd = p.pers === 'calm' ? 0.6 : p.pers === 'hot' ? 1.15 : 0.9;
    p.cond = clamp(Math.round(p.cond * 0.45 + gauss(0, sd) + (p.morale - 60) / 45), -2, 2);
  }
  const cap = c.captainId ? G.players[c.captainId] : null;
  const capBonus = cap && !cap.retired ? (has(cap, 'captain') ? 8 : cap.pers === 'leader' ? 6 : 2) : 0;
  const moods = players.filter((p) => has(p, 'mood')).length;
  const target = 48 + capBonus + moods * 2 + (G.mgr.skills.leadership - 50) / 6 + (G.policies.focus === 'practical' ? 4 : 0) - (G.policies.intensity >= 3 ? 5 : 0);
  c.chemistry = clamp(c.chemistry + (target - c.chemistry) * 0.08, 0, 100);
}

/** 期末考试：学力太差的人要补习，暂时不能比赛 */
export function exams(): void {
  const failed: Player[] = [];
  for (const p of myPlayers()) {
    if (has(p, 'student')) continue;
    const line = 30 + gauss(0, 8);
    if (p.academics < line) {
      p.benched = Math.max(p.benched, 12);
      failed.push(p);
      note(p, '期末考试不及格，补习两周');
    }
  }
  if (failed.length) {
    log(`期末考试：${failed.map(fullName).join('、')} 不及格，要补习两周（不能参加比赛）`, 'bad');
  } else log('期末考试：全员过关！', 'good');
}

/** 当前梅雨 / 台风等天气（6 月梅雨季随机下雨） */
export function weatherDaily(): void {
  const m = monthOf(G.day);
  if ((G.flags.rainUntil ?? -1) >= G.day) return;
  const p = m === 6 ? 0.12 : m === 9 ? 0.05 : m === 7 ? 0.03 : 0.02;
  if (chance(p)) G.flags.rainUntil = G.day + randInt(0, 2);
}

/** 球员综合评价的变化（年度总结用） */
export function ovrSnapshot(): Record<number, number> {
  const out: Record<number, number> = {};
  for (const p of myPlayers()) out[p.id] = Math.round(overall(p));
  return out;
}
