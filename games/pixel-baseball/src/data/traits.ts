import type { ExpPool, Player } from '../core/types';

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

const isP = (p: Player) => p.pos === 'P';

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
  { id: 'leader', name: '配球高手', desc: '担任捕手时，投手的控球与球威提升', kind: 'field', good: true, cost: { men: 60, tech: 40 }, catcherOnly: true, req: (p) => p.pos === 'C', opp: 'leaderX' },
  { id: 'leaderX', name: '配球不佳', desc: '担任捕手时，投手的表现下降', kind: 'field', good: false, opp: 'leader' },
  { id: 'block', name: '拦截○', desc: '担任捕手时，暴投与捕逸减少', kind: 'field', good: true, cost: { agi: 30, men: 20 }, catcherOnly: true, req: (p) => p.pos === 'C' },
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
  { id: 'kire', name: '变化球锋利', desc: '所有变化球的威力提升', kind: 'pit', good: true, cost: { brk: 70, tech: 20 }, pitcherOnly: true, req: (p) => isP(p) && p.pitches.some((x) => x.lv >= 4) },
  { id: 'mix', name: '投球组合○', desc: '球种丰富，打者难以锁定，所有球种威力小幅提升（需要 4 种以上变化球）', kind: 'pit', good: true, cost: { brk: 50, men: 30 }, pitcherOnly: true, req: (p) => isP(p) && p.pitches.length >= 4 },
  { id: 'powerPitcher', name: '速球派', desc: '直球的威力提升，配球更多依赖直球', kind: 'pit', good: true, cost: { str: 70 }, pitcherOnly: true, req: (p) => isP(p) && p.a.velocity >= 140 },
  { id: 'stamina2', name: '铁腕', desc: '投球数多了也不容易掉球威，连投恢复更快', kind: 'pit', good: true, cost: { str: 50, men: 40 }, pitcherOnly: true, req: (p) => isP(p) && p.a.stamina >= 60 },
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
  { id: 'student', name: '文武双全', desc: '学业与棒球兼顾，不会因考试不及格而停赛，练习效率小幅提升', kind: 'gen', good: true, cost: { men: 60, tech: 20 } },
  { id: 'hustle', name: '全力疾走', desc: '内野滚地球也拼命冲刺，对方容易慌张失误', kind: 'bat', good: true, cost: { agi: 40, men: 30 } },
  { id: 'monster', name: '怪物', desc: '百年一遇的天才，成长速度惊人', kind: 'gen', good: true, rare: true },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export function traitName(id: string): string {
  return TRAIT_BY_ID[id]?.name ?? id;
}
