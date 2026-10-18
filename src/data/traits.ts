import type { ExpPool, Player, PitchType } from '../core/types';

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
  kind: 'bat' | 'pit' | 'field' | 'gen';
  good: boolean;
  rare?: boolean;
  /** 学习/消除所需经验 */
  cost?: Partial<ExpPool>;
  /** 学习条件 */
  req?: (p: Player) => boolean;
  /** 对立特性（获得一方会移除另一方） */
  opp?: string;
  pitcherOnly?: boolean;
  catcherOnly?: boolean;
}

const isP = (p: Player) => p.pos === 'P' || (p.apt.P ?? 0) >= 60;

export const TRAITS: readonly TraitDef[] = [
  // ---- 打击 ----
  { id: 'clutch', name: '关键时刻○', desc: '得分圈有人时击球能力提升', kind: 'bat', good: true, cost: { men: 60, tech: 30 }, opp: 'clutchX' },
  { id: 'clutchX', name: '关键时刻×', desc: '得分圈有人时击球能力下降', kind: 'bat', good: false, opp: 'clutch' },
  { id: 'vsLHP', name: '对左投○', desc: '面对左投手时击球能力提升', kind: 'bat', good: true, cost: { tech: 50, men: 20 } },
  { id: 'pull', name: '拉打型', desc: '更多拉打方向的强劲打球，长打增加', kind: 'bat', good: true, cost: { str: 50, tech: 30 }, req: (p) => p.a.power >= 55 },
  { id: 'spray', name: '广角打法', desc: '能把球打向各个方向，安打率提升', kind: 'bat', good: true, cost: { tech: 70 }, req: (p) => p.a.contact >= 55 },
  { id: 'arch', name: '本垒打型', desc: '打球更容易飞出外野看台', kind: 'bat', good: true, cost: { str: 80, tech: 30 }, req: (p) => p.a.power >= 65 },
  { id: 'firstPitch', name: '初球○', desc: '第一球击球时能力提升', kind: 'bat', good: true, cost: { men: 40, tech: 20 } },
  { id: 'tough', name: '难以三振', desc: '两好球后依然能缠斗，三振减少', kind: 'bat', good: true, cost: { tech: 50, men: 30 }, opp: 'kProne' },
  { id: 'kProne', name: '三振王', desc: '挥空较多，容易三振', kind: 'bat', good: false, opp: 'tough' },
  { id: 'infHit', name: '内野安打○', desc: '内野滚地球更容易跑成安打', kind: 'bat', good: true, cost: { agi: 50 }, req: (p) => p.a.speed >= 60 },
  { id: 'steal', name: '盗垒○', desc: '盗垒成功率提升', kind: 'bat', good: true, cost: { agi: 50, men: 20 }, req: (p) => p.a.speed >= 60 },
  { id: 'runner', name: '跑垒○', desc: '安打时更容易多推进一个垒', kind: 'bat', good: true, cost: { agi: 40, men: 20 } },
  { id: 'buntMaster', name: '触击名人', desc: '牺牲触击几乎不会失败', kind: 'bat', good: true, cost: { tech: 50 }, req: (p) => p.a.bunt >= 55 },
  { id: 'comeback', name: '逆境○', desc: '比赛后半落后时击球能力提升', kind: 'bat', good: true, cost: { men: 50 } },
  { id: 'eyeX', name: '选球差', desc: '容易追打坏球', kind: 'bat', good: false },
  // ---- 守备 ----
  { id: 'glove', name: '守备职人', desc: '守备范围更广，失误更少', kind: 'field', good: true, cost: { agi: 40, tech: 50 }, req: (p) => p.a.fielding >= 60, opp: 'errorProne' },
  { id: 'errorProne', name: '失误多', desc: '容易出现守备失误', kind: 'field', good: false, opp: 'glove' },
  { id: 'laser', name: '激光肩', desc: '外野传球威胁大，跑者不敢多跑', kind: 'field', good: true, cost: { str: 50 }, req: (p) => p.a.arm >= 70 },
  { id: 'leader', name: '配球高手', desc: '担任捕手时，投手的控球与球威提升', kind: 'field', good: true, cost: { men: 60, tech: 40 }, catcherOnly: true, req: (p) => (p.apt.C ?? 0) >= 60, opp: 'leaderX' },
  { id: 'leaderX', name: '配球不佳', desc: '担任捕手时，投手的表现下降', kind: 'field', good: false, opp: 'leader' },
  { id: 'block', name: '拦截○', desc: '担任捕手时，暴投与捕逸减少', kind: 'field', good: true, cost: { agi: 30, men: 20 }, catcherOnly: true, req: (p) => (p.apt.C ?? 0) >= 60 },
  // ---- 投手 ----
  { id: 'pinch', name: '对危机○', desc: '得分圈有人时投球能力提升', kind: 'pit', good: true, cost: { men: 60, brk: 20 }, pitcherOnly: true, req: isP, opp: 'pinchX' },
  { id: 'pinchX', name: '对危机×', desc: '得分圈有人时投球能力下降', kind: 'pit', good: false, pitcherOnly: true, opp: 'pinch' },
  { id: 'vsLHB', name: '对左打者○', desc: '面对左打者时投球能力提升', kind: 'pit', good: true, cost: { brk: 40, men: 20 }, pitcherOnly: true, req: isP },
  { id: 'kArtist', name: '夺三振', desc: '决胜球的挥空率提升', kind: 'pit', good: true, cost: { brk: 60, str: 30 }, pitcherOnly: true, req: isP },
  { id: 'grounder', name: '诱发滚地', desc: '更容易让打者打出滚地球', kind: 'pit', good: true, cost: { brk: 50, tech: 20 }, pitcherOnly: true, req: isP },
  { id: 'nobi', name: '尾劲○', desc: '直球的尾劲出色，难以击中', kind: 'pit', good: true, cost: { str: 60, brk: 20 }, pitcherOnly: true, req: isP },
  { id: 'heavy', name: '重球', desc: '被击中也难以飞远，长打减少', kind: 'pit', good: true, cost: { str: 60 }, pitcherOnly: true, req: isP },
  { id: 'pickoff', name: '牵制○', desc: '牵制球犀利，跑者难以起跑', kind: 'pit', good: true, cost: { agi: 30, men: 20 }, pitcherOnly: true, req: isP },
  { id: 'quick', name: '快速投球○', desc: '固定式投球快，盗垒难以成功', kind: 'pit', good: true, cost: { agi: 40 }, pitcherOnly: true, req: isP },
  { id: 'lowBall', name: '低球○', desc: '擅长投低球，被本垒打减少', kind: 'pit', good: true, cost: { tech: 40, brk: 20 }, pitcherOnly: true, req: isP },
  { id: 'composed', name: '稳如泰山', desc: '不容易因失分而动摇', kind: 'pit', good: true, cost: { men: 70 }, pitcherOnly: true, req: isP },
  { id: 'slowStart', name: '慢热', desc: '比赛开始的1、2局表现较差', kind: 'pit', good: false, pitcherOnly: true },
  { id: 'wild', name: '四球多', desc: '控球忽好忽坏，四坏球较多', kind: 'pit', good: false, pitcherOnly: true },
  { id: 'hrProne', name: '一发被打', desc: '失投容易被打成本垒打', kind: 'pit', good: false, pitcherOnly: true },
  // ---- 通用 ----
  { id: 'bigStage', name: '大舞台○', desc: '在甲子园与决赛中能力提升', kind: 'gen', good: true, cost: { men: 80 }, opp: 'nerves' },
  { id: 'nerves', name: '怯场', desc: '在甲子园与决赛中能力下降', kind: 'gen', good: false, opp: 'bigStage' },
  { id: 'durable', name: '不易受伤', desc: '受伤的概率降低', kind: 'gen', good: true, cost: { str: 50, men: 20 }, opp: 'fragile' },
  { id: 'fragile', name: '易受伤', desc: '受伤的概率提高', kind: 'gen', good: false, opp: 'durable' },
  { id: 'recovery', name: '恢复快', desc: '疲劳恢复速度更快', kind: 'gen', good: true, cost: { str: 40, men: 30 } },
  { id: 'captain', name: '领袖气质', desc: '担任主将时全队干劲与凝聚力提升', kind: 'gen', good: true, cost: { men: 90 } },
  { id: 'mood', name: '气氛制造者', desc: '在队中时全队的干劲不容易下降', kind: 'gen', good: true, cost: { men: 50 } },
  { id: 'monster', name: '怪物', desc: '百年一遇的天才，成长速度惊人', kind: 'gen', good: true, rare: true },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function traitName(id: string): string {
  return TRAIT_BY_ID[id]?.name ?? id;
}

export interface PitchDef {
  name: string;
  short: string;
  speed: number; // 相对直球速度
  whiff: number; // 挥空倾向
  gb: number; // 滚地倾向
  ctrl: number; // 控球难度
  wp: number; // 暴投风险
  same: boolean; // 对同侧打者更有效
}

export const PITCH_DEFS: Record<PitchType, PitchDef> = {
  SL: { name: '滑球', short: '滑', speed: 0.86, whiff: 1.0, gb: 0.02, ctrl: 0.03, wp: 1.0, same: true },
  CB: { name: '曲球', short: '曲', speed: 0.78, whiff: 0.9, gb: 0.04, ctrl: 0.05, wp: 1.3, same: true },
  FK: { name: '指叉球', short: '叉', speed: 0.85, whiff: 1.2, gb: 0.1, ctrl: 0.07, wp: 2.2, same: false },
  CH: { name: '变速球', short: '变', speed: 0.82, whiff: 0.95, gb: 0.06, ctrl: 0.04, wp: 1.0, same: false },
  CT: { name: '卡特球', short: '卡', speed: 0.93, whiff: 0.7, gb: 0.05, ctrl: 0.02, wp: 0.6, same: true },
  SH: { name: '伸卡球', short: '伸', speed: 0.92, whiff: 0.6, gb: 0.1, ctrl: 0.03, wp: 0.8, same: true },
  SK: { name: '下沉球', short: '沉', speed: 0.85, whiff: 0.85, gb: 0.12, ctrl: 0.05, wp: 1.4, same: false },
};
