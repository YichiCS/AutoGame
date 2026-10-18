// 本队每周训练
import type { AttrKey, ExpKind, ExpPool, MenuId, Player, StaffRole } from './types';
import { EXP_KINDS, MENU_IDS } from './types';
import { G, myPlayers } from './state';
import { chance, gauss, pick, randInt } from './rng';
import { clamp } from './util';
import { ATTR_COST, ATTR_NAME, has, isPitcher } from './attrs';
import { autoSpend, curveMult, ethicMult, progressLearning, talentMult } from './growth';
import { anyTrait, coachMult, hasTrait, roleSkill } from './staff';
import { monthOf, isOffseason } from './calendar';
import { PITCH_DEFS } from '../data/traits';

export interface MenuDef {
  name: string;
  desc: string;
  bat: Partial<ExpPool>;
  pit: Partial<ExpPool>;
  fatigue: number;
  coach: StaffRole | null;
}

export const MENUS: Record<MenuId, MenuDef> = {
  bat: { name: '打击练习', desc: '自由打击、发球机、挥棒。提升技术与力量', bat: { tech: 4.2, str: 1.8, men: 0.6 }, pit: { tech: 1.4, str: 0.8 }, fatigue: 10, coach: 'batting' },
  pitch: { name: '投球练习', desc: '牛棚投球、变化球研究（投手与捕手）', bat: {}, pit: { brk: 4.2, tech: 2.0, str: 1.2, men: 0.8 }, fatigue: 12, coach: 'pitching' },
  field: { name: '守备练习', desc: '千本捕球、连携、传球', bat: { agi: 2.6, tech: 2.4, men: 0.6 }, pit: { agi: 1.5, tech: 1.0, men: 0.3 }, fatigue: 11, coach: 'fielding' },
  run: { name: '跑垒练习', desc: '冲刺、起跑、盗垒技术', bat: { agi: 3.8, men: 1.0, str: 0.6 }, pit: { agi: 2.6, str: 1.0, men: 0.6 }, fatigue: 13, coach: 'fielding' },
  power: { name: '体能训练', desc: '重量训练、长跑、核心。大幅提升力量但很累', bat: { str: 4.6, agi: 1.0 }, pit: { str: 4.2, agi: 1.0, men: 0.4 }, fatigue: 18, coach: 'trainer' },
  game: { name: '实战练习', desc: '红白战、情景练习。均衡成长，提升默契', bat: { tech: 1.5, agi: 1.0, str: 0.8, men: 2.2 }, pit: { brk: 1.2, tech: 1.2, str: 0.8, men: 2.2 }, fatigue: 13, coach: null },
  tactic: { name: '战术练习', desc: '触击、打带跑、牵制配合。提升战术熟练度', bat: { men: 1.6, tech: 1.2 }, pit: { men: 1.6, tech: 1.0 }, fatigue: 7, coach: 'fielding' },
  rest: { name: '休养', desc: '恢复疲劳，提升干劲', bat: {}, pit: {}, fatigue: -22, coach: null },
  study: { name: '学习', desc: '课业辅导，提升学力，避免考试不及格', bat: { men: 0.6 }, pit: { men: 0.6 }, fatigue: 3, coach: null },
};

export const INTENSITY = [
  { name: '轻松', exp: 0.7, fat: 0.55, risk: 0.6, morale: 1 },
  { name: '普通', exp: 1.0, fat: 1.0, risk: 1.0, morale: 0 },
  { name: '严格', exp: 1.3, fat: 1.55, risk: 1.6, morale: -1 },
  { name: '地狱', exp: 1.6, fat: 2.3, risk: 2.6, morale: -3 },
];

export const TRAIN_SCALE = 2.6;

export const FACILITY_DEFS = {
  field: { name: '球场', desc: '照明与草皮。所有训练效率提升', max: 5, base: 400 },
  indoor: { name: '室内练习场', desc: '雨天与冬季也能正常训练', max: 3, base: 900 },
  weight: { name: '力量训练室', desc: '力量经验提升，体能训练受伤率降低', max: 5, base: 300 },
  bullpen: { name: '投球练习场', desc: '投手训练效率提升', max: 5, base: 250 },
  cage: { name: '打击笼/发球机', desc: '打击训练效率提升', max: 5, base: 280 },
  dorm: { name: '宿舍', desc: '可招募外县新生，恢复与默契提升（需伙食费）', max: 3, base: 1500 },
  medical: { name: '医务理疗室', desc: '受伤率降低、伤愈加快', max: 3, base: 500 },
  analysis: { name: '影像分析室', desc: '对手情报、战术熟练度提升', max: 3, base: 450 },
} as const;
export type FacKey = keyof typeof FACILITY_DEFS;

export function fac(id: FacKey): number {
  return G.club.facilities[id] ?? 0;
}

export interface TrainResult {
  gains: Map<number, Partial<Record<AttrKey | 'pitch', number>>>;
  injuries: { pid: number; text: string }[];
  learned: { pid: number; pitch: string }[];
  notes: string[];
}

function addTo(pool: ExpPool, src: Partial<ExpPool>, m: number): void {
  for (const k in src) pool[k as ExpKind] += (src[k as ExpKind] ?? 0) * m;
}

/** 本周的环境系数（天气、季节） */
function environment(): { mult: number; note: string | null } {
  const m = monthOf(G.week);
  const indoor = fac('indoor');
  if (m === 6 && chance(0.4)) return indoor ? { mult: 1, note: null } : { mult: 0.8, note: '梅雨季节连日降雨，训练受到影响。' };
  if ((m === 12 || m === 1 || m === 2) && !indoor) return { mult: 0.88, note: null };
  return { mult: 1, note: null };
}

export function hasOfficialGameThisWeek(): boolean {
  for (const t of Object.values(G.tournaments)) {
    if (t.done || !t.teams.includes(G.club.schoolId)) continue;
    if (t.finish[G.club.schoolId] !== undefined) continue;
    if (t.roundWeeks.includes(G.week)) return true;
  }
  return false;
}

export function campAvailable(): boolean {
  const w = G.week;
  return w === 19 || w === 20 || w === 35 || w === 43 || w === 31;
}

/** 执行一周训练 */
export function runTraining(camp: boolean): TrainResult {
  const res: TrainResult = { gains: new Map(), injuries: [], learned: [], notes: [] };
  const plan = G.club.training;
  const inten = INTENSITY[plan.intensity];
  const env = environment();
  if (env.note) res.notes.push(env.note);
  const gameWeek = hasOfficialGameThisWeek();
  const tuneMult = gameWeek ? 0.6 : 1;
  const winter = isOffseason(G.week);
  const campMult = camp ? 1.6 : 1;
  const players = myPlayers().filter((p) => !p.retired && p.grade >= 1 && p.grade <= 3);
  const mgr = G.manager.skills;
  const diff = G.difficulty === 'easy' ? 1.15 : G.difficulty === 'hard' ? 0.9 : 1;
  const meal = G.club.meal;

  // 个别指导：教练精力分配
  const focusCount: Record<string, number> = {};
  for (const p of players) if (p.focus && p.focus.kind !== 'rest' && p.focus.kind !== 'study') focusCount[focusRole(p)] = (focusCount[focusRole(p)] ?? 0) + 1;

  for (const p of players) {
    if (p.injury) {
      // 伤病期间不参加练习，疲劳按休养恢复
      p.fatigue = clamp(p.fatigue * 0.75 - recoveryOf(p, true), 0, 100);
      p.morale = clamp(p.morale - 1, 0, 100);
      continue;
    }
    const pitcher = isPitcher(p);
    const isC = p.pos === 'C';
    const pool: ExpPool = { str: 0, agi: 0, tech: 0, brk: 0, men: 0 };
    let fatigue = 0;
    const resting = p.focus?.kind === 'rest';
    if (!resting) {
      for (const id of Object.keys(plan.alloc) as MenuId[]) {
        const share = allocShare(id);
        if (share <= 0) continue;
        const def = MENUS[id];
        let src = pitcher ? def.pit : def.bat;
        if (id === 'pitch' && isC) src = { tech: 1.2, men: 1.0 };
        const cm = def.coach ? coachMult(def.coach) : 1;
        let fm = 1 + fac('field') * 0.03;
        if (id === 'bat') fm += fac('cage') * 0.05;
        if (id === 'pitch') fm += fac('bullpen') * 0.05;
        if (id === 'power') fm += fac('weight') * 0.05;
        if (id === 'tactic' || id === 'game') fm += fac('analysis') * 0.03;
        let mm = 1;
        if (id === 'bat') mm += (mgr.batting - 50) / 300;
        if (id === 'pitch') mm += (mgr.pitching - 50) / 300;
        if (id === 'field' || id === 'run') mm += (mgr.fielding - 50) / 300;
        addTo(pool, src, share * cm * fm * mm);
        fatigue += def.fatigue * share * (def.fatigue > 0 ? inten.fat : 1);
      }
    }
    // 个体系数
    let m = TRAIN_SCALE * inten.exp * talentMult(p) * curveMult(p) * ethicMult(p) * env.mult * tuneMult * campMult * diff;
    m *= 0.75 + p.morale / 240;
    if (p.fatigue > 60) m *= 1 - (p.fatigue - 60) / 120;
    if (p.supplementary > 0) m *= 0.5;
    if (hasTrait('batting', 'strict') || hasTrait('pitching', 'strict')) m *= 1.06;
    if (anyTrait('gentle')) m *= 0.97;
    for (const k of EXP_KINDS) pool[k] *= m;
    if (anyTrait('theory')) pool.tech *= 1.08;
    if (anyTrait('veteran')) pool.men *= 1.08;
    if (meal > 0) pool.str *= 1 + meal * 0.07;
    if (winter) {
      pool.str *= 1.12;
      pool.agi *= 1.06;
    }
    // 个别练习
    if (p.focus && !resting) {
      const role = focusRole(p);
      const crowd = focusCount[role] ?? 1;
      const eff = (crowd > 5 ? 5 / crowd : 1) * (roleSkill(role) ? coachMult(role) : 0.85);
      const totalWeek = EXP_KINDS.reduce((a, k) => a + pool[k], 0);
      if (p.focus.kind === 'attr') {
        const cost = ATTR_COST[p.focus.attr];
        const sumW = Object.values(cost).reduce((a, b) => a + (b ?? 0), 0);
        for (const k in cost) pool[k as ExpKind] += (totalWeek * 0.35 * eff * (cost[k as ExpKind] ?? 0)) / sumW;
        fatigue += 2;
      } else if (p.focus.kind === 'pitch') {
        if (!p.learning || p.learning.pitch !== p.focus.pitch) {
          if (!p.pitches.some((x) => x.type === (p.focus as { pitch: string }).pitch)) p.learning = { pitch: p.focus.pitch, progress: 0 };
        }
        if (p.learning) {
          const learned = progressLearning(p, (pool.brk * 0.6 + 3) * eff * (pitcher ? 1 : 0.4));
          if (learned) {
            res.learned.push({ pid: p.id, pitch: PITCH_DEFS[learned].name });
            p.focus = null;
          }
        } else pool.brk += totalWeek * 0.3 * eff;
      } else if (p.focus.kind === 'pos') {
        const pos = p.focus.pos;
        const cur = p.apt[pos] ?? 15;
        if (cur < 95) p.apt[pos] = Math.min(95, cur + (2.2 + mgr.fielding / 60) * eff);
      } else if (p.focus.kind === 'study') {
        p.academics = clamp(p.academics + 2.5, 0, 100);
        pool.men += 1;
      }
    }
    for (const k of EXP_KINDS) p.exp[k] += pool[k];
    if (p.plan !== 'manual') {
      const g = autoSpend(p, p.plan, 80);
      if (Object.keys(g).length) res.gains.set(p.id, g);
    }
    // 学力
    const study = allocShare('study');
    p.academics = clamp(p.academics + study * 6 - 0.25, 0, 100);
    if (p.supplementary > 0) {
      p.academics = clamp(p.academics + 2, 0, 100);
    }
    // 疲劳
    if (camp) fatigue *= 1.3;
    fatigue *= gameWeek ? 0.5 : 1;
    p.fatigue = clamp(p.fatigue * 0.75 + fatigue - recoveryOf(p, resting), 0, 100);
    // 伤病
    const risk = injuryRisk(p, inten.risk * (camp ? 1.3 : 1));
    if (chance(risk)) {
      const inj = rollInjury(p);
      p.injury = inj;
      res.injuries.push({ pid: p.id, text: `${p.fam}${p.given}受伤：${inj.name}（约${inj.weeks}周）` });
    }
    // 干劲
    let dm = inten.morale;
    if (plan.intensity >= 2) {
      if (p.pers === 'lazy') dm -= 3;
      if (p.pers === 'diligent') dm += 1;
    }
    dm += allocShare('rest') * 6;
    if (resting) dm += 2;
    if (hasTrait('batting', 'strict') && (p.pers === 'lazy' || p.pers === 'proud')) dm -= 1;
    if (anyTrait('gentle')) dm += 0.5;
    dm += (60 - p.morale) * 0.06 + (G.club.chemistry - 50) * 0.02;
    if (camp) dm -= 1;
    dm += G.club.equipment * 0.4;
    p.morale = clamp(p.morale + dm, 0, 100);
    // 调子
    updateCondition(p);
  }
  // 团队层面
  const tac = allocShare('tactic') * 4 + allocShare('game') * 1.2;
  G.club.tacticsSkill = clamp(G.club.tacticsSkill + tac * coachMult('fielding') * (0.7 + mgr.tactics / 150) * inten.exp * (1 + fac('analysis') * 0.05) - 0.12, 0, 100);
  const avgMorale = players.reduce((a, p) => a + p.morale, 0) / Math.max(1, players.length);
  const cap = G.club.captainId ? G.players[G.club.captainId] : null;
  let target = 45 + (avgMorale - 60) * 0.7 + allocShare('game') * 20 + fac('dorm') * 3 + (mgr.leadership - 50) * 0.25;
  if (cap && !cap.retired) target += has(cap, 'captain') ? 8 : cap.pers === 'leader' ? 5 : 2;
  if (plan.intensity === 3) target -= 12;
  const chem = (target - G.club.chemistry) * 0.1 + (camp ? 4 : 0);
  G.club.chemistry = clamp(G.club.chemistry + chem, 0, 100);
  return res;
}

function focusRole(p: Player): StaffRole {
  const f = p.focus;
  if (!f) return 'batting';
  if (f.kind === 'pitch') return 'pitching';
  if (f.kind === 'pos') return 'fielding';
  if (f.kind === 'attr') {
    const a = f.attr;
    if (a === 'velocity' || a === 'control' || a === 'stamina' || a === 'stuff') return 'pitching';
    if (a === 'contact' || a === 'power' || a === 'eye' || a === 'bunt') return 'batting';
    if (a === 'durability') return 'trainer';
    return 'fielding';
  }
  return 'trainer';
}

/** 每周的疲劳恢复量 */
function recoveryOf(p: Player, resting: boolean): number {
  const r = 4 + roleSkill('trainer') / 25 + fac('medical') + fac('dorm') * 0.8 + G.club.meal + (has(p, 'recovery') ? 3 : 0) + p.a.durability / 40;
  return resting ? r + 12 : r;
}

export function injuryRisk(p: Player, mult: number): number {
  let r = 0.0018 + Math.pow(Math.max(0, p.fatigue - 45), 1.6) * 0.0001;
  r *= mult;
  r *= 1 - p.a.durability / 220;
  if (has(p, 'fragile')) r *= 1.8;
  if (has(p, 'durable')) r *= 0.5;
  r *= 1 - roleSkill('trainer') / 320;
  r *= 1 - fac('medical') * 0.08;
  const recent = p.pitchesLast ?? 0;
  if (isPitcher(p) && recent > 300) r *= 1 + (recent - 300) / 200;
  if ((G.flags.healthBless ?? 0) > G.absWeek) r *= 0.6;
  return clamp(r, 0, 0.25);
}

const INJ_MINOR = ['肌肉拉伤', '脚踝扭伤', '手指挫伤', '腰部疼痛', '感冒发烧', '大腿肌肉疲劳', '膝盖不适'];
const INJ_MOD = ['腿后肌拉伤', '肩膀发炎', '肘部疼痛', '肋骨挫伤', '手腕扭伤', '腰椎疲劳性损伤'];
const INJ_SEVERE = ['肘内侧韧带损伤', '肩关节唇损伤', '手指骨折', '脚踝骨折', '前十字韧带损伤'];

export function rollInjury(p: Player): NonNullable<Player['injury']> {
  const roll = chance(0.66) ? 1 : chance(0.8) ? 2 : 3;
  const arm = isPitcher(p) && chance(0.5);
  let name: string;
  let part: NonNullable<Player['injury']>['part'] = 'other';
  if (roll === 1) name = pick(INJ_MINOR);
  else if (roll === 2) name = arm ? pick(['肩膀发炎', '肘部疼痛']) : pick(INJ_MOD);
  else name = arm ? pick(['肘内侧韧带损伤', '肩关节唇损伤']) : pick(INJ_SEVERE);
  if (name.includes('肘')) part = 'elbow';
  else if (name.includes('肩')) part = 'shoulder';
  else if (name.includes('脚') || name.includes('腿') || name.includes('膝') || name.includes('大腿')) part = 'leg';
  else if (name.includes('腰') || name.includes('肋')) part = 'back';
  else if (name.includes('手')) part = 'hand';
  const weeks = roll === 1 ? randInt(1, 2) : roll === 2 ? randInt(3, 6) : randInt(8, 22);
  return { name, part, weeks, severity: roll as 1 | 2 | 3 };
}

export function updateCondition(p: Player): void {
  const calm = p.pers === 'calm' ? 0.5 : p.pers === 'hot' ? 1.4 : 1;
  const up = (0.17 + (p.morale - 60) / 400 - p.fatigue / 600) * calm;
  const down = (0.17 + p.fatigue / 400 - (p.morale - 60) / 500) * calm;
  if (p.cond > 0 && chance(0.18)) p.cond--;
  else if (p.cond < 0 && chance(0.18)) p.cond++;
  if (chance(Math.max(0.02, up))) p.cond = Math.min(2, p.cond + 1);
  else if (chance(Math.max(0.02, down))) p.cond = Math.max(-2, p.cond - 1);
}

/** 每周伤病恢复（本队） */
export function healWeek(p: Player): string | null {
  if (!p.injury) return null;
  const speed = 1 + (anyTrait('medic') ? 0.3 : 0) + fac('medical') * 0.1;
  p.injury.weeks -= chance(speed - 1) ? 2 : 1;
  if (p.injury.weeks <= 0) {
    const inj = p.injury;
    p.injury = null;
    if (inj.severity === 3) {
      // 重伤后遗症
      if (inj.part === 'elbow' || inj.part === 'shoulder') {
        p.a.velocity = Math.max(100, p.a.velocity - randInt(1, 4));
        p.a.control = clamp(p.a.control - randInt(0, 4), 1, 99);
      } else if (inj.part === 'leg') p.a.speed = clamp(p.a.speed - randInt(1, 5), 1, 99);
    }
    return `${p.fam}${p.given}伤愈归队。`;
  }
  return null;
}

/** 期末考试 */
export function runExams(): string[] {
  const out: string[] = [];
  for (const p of myPlayers()) {
    if (p.retired) continue;
    const score = p.academics + gauss(0, 10);
    if (score < 28) {
      p.supplementary = 3;
      p.morale = clamp(p.morale - 8, 0, 100);
      out.push(`${p.fam}${p.given}期末考试不及格，需要参加 3 周补习（期间训练效率减半且不能参加比赛）。`);
    }
  }
  return out;
}

export function gainText(g: Partial<Record<AttrKey | 'pitch', number>>): string {
  return Object.entries(g)
    .map(([k, v]) => `${k === 'pitch' ? '变化球' : ATTR_NAME[k as AttrKey]}+${v}`)
    .join(' ');
}

/** 某菜单在本周训练中所占比例（自动归一化） */
export function allocShare(id: MenuId): number {
  const a = G.club.training.alloc;
  const total = Object.values(a).reduce((x, y) => x + (y ?? 0), 0);
  return total > 0 ? (a[id] ?? 0) / total : 0;
}

/** 训练预设 */
export const PRESETS: { name: string; alloc: Record<MenuId, number> }[] = [
  { name: '均衡', alloc: { bat: 25, pitch: 15, field: 20, run: 10, power: 10, game: 10, tactic: 5, rest: 5, study: 0 } },
  { name: '打击强化', alloc: { bat: 45, pitch: 10, field: 10, run: 5, power: 15, game: 10, tactic: 0, rest: 5, study: 0 } },
  { name: '投手强化', alloc: { bat: 15, pitch: 40, field: 10, run: 5, power: 15, game: 10, tactic: 0, rest: 5, study: 0 } },
  { name: '守备走垒', alloc: { bat: 15, pitch: 10, field: 35, run: 20, power: 5, game: 5, tactic: 5, rest: 5, study: 0 } },
  { name: '冬季体能', alloc: { bat: 15, pitch: 10, field: 10, run: 15, power: 40, game: 0, tactic: 0, rest: 10, study: 0 } },
  { name: '实战调整', alloc: { bat: 20, pitch: 15, field: 10, run: 5, power: 0, game: 30, tactic: 15, rest: 5, study: 0 } },
  { name: '休养周', alloc: { bat: 10, pitch: 5, field: 5, run: 0, power: 0, game: 5, tactic: 5, rest: 70, study: 0 } },
  { name: '考前学习', alloc: { bat: 15, pitch: 10, field: 10, run: 5, power: 5, game: 5, tactic: 5, rest: 5, study: 40 } },
];

/** 估算一名普通球员本周的经验与疲劳（用于界面预览） */
export function previewWeek(): { exp: number; fatigue: number } {
  const plan = G.club.training;
  const inten = INTENSITY[plan.intensity];
  let exp = 0;
  let fat = 0;
  for (const id of MENU_IDS) {
    const s = allocShare(id);
    const def = MENUS[id];
    const src = def.bat;
    exp += Object.values(src).reduce((a, b) => a + (b ?? 0), 0) * s * (def.coach ? coachMult(def.coach) : 1);
    fat += def.fatigue * s * (def.fatigue > 0 ? inten.fat : 1);
  }
  return { exp: exp * TRAIN_SCALE * inten.exp, fatigue: fat };
}
