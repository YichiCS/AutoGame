// 球种目录。方向以右投手、从捕手位置看：R = 向右（滑球方向），L = 向左（内飘方向），D = 下坠
import type { PitchType } from '../core/types';

export type PitchFamily = 'fast' | 'slide' | 'drop' | 'off' | 'reverse' | 'special';
export type PitchDir = 'L' | 'DL' | 'D' | 'DR' | 'R' | 'X';

export interface PitchDef {
  name: string;
  short: string;
  family: PitchFamily;
  dir: PitchDir;
  /** 相对直球的球速 */
  speed: number;
  /** 挥空倾向（1 = 普通） */
  whiff: number;
  /** 滚地倾向（加到滚地率上） */
  gb: number;
  /** 控球难度（降低进好球带的概率） */
  ctrl: number;
  /** 暴投风险倍率 */
  wp: number;
  /** 对同侧打者更有效（滑球、曲球一类）；false 则对异侧打者更有效 */
  same: boolean;
  /** 威力里球速所占的比重 0..1（直球系高，慢速变化球为 0） */
  velW: number;
  /** 稀有度：生成和学习的难易 */
  rarity: 1 | 2 | 3 | 4;
  desc: string;
}

export const PITCH_DEFS: Record<PitchType, PitchDef> = {
  // ---- 直球系：球速快、变化小，靠球速和尾劲取胜 ----
  TS: { name: '二缝线', short: '二缝', family: 'fast', dir: 'L', speed: 0.97, whiff: 0.55, gb: 0.09, ctrl: 0.012, wp: 0.5, same: false, velW: 0.8, rarity: 1, desc: '握法改成二缝线的速球，带一点向投手手臂方向的偏移，容易诱发滚地' },
  CT: { name: '卡特球', short: '卡特', family: 'fast', dir: 'R', speed: 0.93, whiff: 0.7, gb: 0.05, ctrl: 0.018, wp: 0.6, same: true, velW: 0.6, rarity: 1, desc: '快速而小幅的横向变化，打者以为是直球，球却从球棒的芯上溜走' },
  SI: { name: '伸卡球', short: '伸卡', family: 'fast', dir: 'DL', speed: 0.92, whiff: 0.6, gb: 0.14, ctrl: 0.028, wp: 0.8, same: false, velW: 0.6, rarity: 2, desc: '一边下沉一边向手臂方向跑的快速球，滚地球制造机' },
  SHU: { name: '内飘球', short: '内飘', family: 'fast', dir: 'L', speed: 0.9, whiff: 0.65, gb: 0.08, ctrl: 0.03, wp: 0.8, same: false, velW: 0.5, rarity: 2, desc: '日本特有的シュート：向投手手臂方向切入，专门对付异侧打者的内角' },
  // ---- 横向变化 ----
  SL: { name: '滑球', short: '滑', family: 'slide', dir: 'R', speed: 0.86, whiff: 1.0, gb: 0.02, ctrl: 0.03, wp: 1.0, same: true, velW: 0.2, rarity: 1, desc: '最常见的横向变化球，向投球手套一侧滑开' },
  HSL: { name: '高速滑球', short: '高滑', family: 'slide', dir: 'R', speed: 0.91, whiff: 0.95, gb: 0.03, ctrl: 0.035, wp: 0.9, same: true, velW: 0.4, rarity: 2, desc: '接近直球速度的滑球，变化晚、打者来不及反应' },
  SW: { name: '横扫球', short: '横扫', family: 'slide', dir: 'R', speed: 0.82, whiff: 1.15, gb: 0.0, ctrl: 0.05, wp: 1.1, same: true, velW: 0.15, rarity: 3, desc: '横向位移极大的扫荡型滑球，同侧打者几乎够不着' },
  VSL: { name: '纵向滑球', short: '纵滑', family: 'slide', dir: 'DR', speed: 0.87, whiff: 1.1, gb: 0.06, ctrl: 0.045, wp: 1.2, same: true, velW: 0.25, rarity: 2, desc: '向斜下方急坠的滑球，三振的决胜球' },
  // ---- 纵向下坠 ----
  CB: { name: '曲球', short: '曲', family: 'drop', dir: 'DR', speed: 0.78, whiff: 0.9, gb: 0.04, ctrl: 0.05, wp: 1.3, same: true, velW: 0.1, rarity: 1, desc: '大弧度的下坠变化，打乱打者的节奏' },
  SCB: { name: '慢速曲球', short: '慢曲', family: 'drop', dir: 'DR', speed: 0.68, whiff: 0.8, gb: 0.03, ctrl: 0.04, wp: 1.0, same: true, velW: 0, rarity: 2, desc: '球速极慢、抛物线极高的曲球，用来摘掉打者的时机' },
  KCB: { name: '指关节曲球', short: '指曲', family: 'drop', dir: 'DR', speed: 0.83, whiff: 1.08, gb: 0.06, ctrl: 0.06, wp: 1.5, same: true, velW: 0.2, rarity: 3, desc: '用指关节扣住球投出的快速曲球，转速高、下坠犀利' },
  PCB: { name: '强力曲球', short: '力曲', family: 'drop', dir: 'DR', speed: 0.84, whiff: 1.0, gb: 0.05, ctrl: 0.055, wp: 1.4, same: true, velW: 0.3, rarity: 2, desc: '球速与落差兼具的曲球，被打中也很难打远' },
  FK: { name: '指叉球', short: '叉', family: 'drop', dir: 'D', speed: 0.85, whiff: 1.2, gb: 0.1, ctrl: 0.07, wp: 2.2, same: false, velW: 0.2, rarity: 1, desc: '用食指和中指夹住投出，在本垒前突然下坠，挥空率极高' },
  SFF: { name: '快速指叉球', short: '快叉', family: 'drop', dir: 'D', speed: 0.92, whiff: 1.1, gb: 0.12, ctrl: 0.06, wp: 1.8, same: false, velW: 0.45, rarity: 2, desc: '浅握的指叉球，球速快、落差小一些，容易控制' },
  // ---- 变速 ----
  CH: { name: '变速球', short: '变', family: 'off', dir: 'DL', speed: 0.82, whiff: 0.95, gb: 0.06, ctrl: 0.04, wp: 1.0, same: false, velW: 0.1, rarity: 1, desc: '手臂动作和直球一样、球速却慢下来的球，专打时机' },
  CCH: { name: '圈指变速球', short: '圈变', family: 'off', dir: 'DL', speed: 0.84, whiff: 1.05, gb: 0.08, ctrl: 0.045, wp: 1.1, same: false, velW: 0.15, rarity: 2, desc: '拇指与食指圈成 OK 手势握球，下沉并向手臂方向跑' },
  PALM: { name: '掌心球', short: '掌', family: 'off', dir: 'D', speed: 0.74, whiff: 1.0, gb: 0.08, ctrl: 0.06, wp: 1.4, same: false, velW: 0, rarity: 3, desc: '用整个手掌压住球投出，几乎不旋转、软软地坠下去' },
  // ---- 反向 ----
  SK: { name: '下沉球', short: '沉', family: 'reverse', dir: 'DL', speed: 0.85, whiff: 0.85, gb: 0.12, ctrl: 0.05, wp: 1.4, same: false, velW: 0.2, rarity: 1, desc: '日式シンカー：向手臂方向下沉，侧投、下勾投手的看家本领' },
  SCR: { name: '螺旋球', short: '螺旋', family: 'reverse', dir: 'L', speed: 0.8, whiff: 1.05, gb: 0.1, ctrl: 0.06, wp: 1.5, same: false, velW: 0.15, rarity: 3, desc: '逆向旋转的反手变化球，对异侧打者是噩梦' },
  // ---- 特殊 ----
  KN: { name: '蝴蝶球', short: '蝶', family: 'special', dir: 'X', speed: 0.7, whiff: 1.3, gb: 0.05, ctrl: 0.1, wp: 3.0, same: false, velW: 0, rarity: 4, desc: '几乎没有旋转、在空中乱飘的魔幻之球，连捕手都接不住' },
  GYRO: { name: '陀螺球', short: '陀螺', family: 'special', dir: 'R', speed: 0.95, whiff: 1.2, gb: 0.02, ctrl: 0.05, wp: 0.8, same: false, velW: 0.6, rarity: 4, desc: '以子弹般的螺旋轴旋转、几乎不下坠的传说之球' },
};

export const PITCH_LIST = Object.keys(PITCH_DEFS) as PitchType[];

export const FAMILY_NAME: Record<PitchFamily, string> = {
  fast: '直球系',
  slide: '横向变化',
  drop: '纵向下坠',
  off: '变速',
  reverse: '反向变化',
  special: '特殊',
};

export const RARITY_NAME = ['', '常见', '进阶', '稀有', '传说'];

export function pitchName(t: PitchType | 'FB'): string {
  return t === 'FB' ? '直球' : PITCH_DEFS[t].name;
}

/** 新学一个球种时，和已有球种的亲缘关系（会更容易学会） */
export const PITCH_KIN: Partial<Record<PitchType, PitchType[]>> = {
  SL: ['HSL', 'SW', 'VSL', 'CT'],
  HSL: ['SL', 'CT', 'GYRO'],
  CT: ['HSL', 'SL', 'TS'],
  CB: ['SCB', 'KCB', 'PCB', 'VSL'],
  FK: ['SFF', 'PALM'],
  SFF: ['FK', 'TS'],
  CH: ['CCH', 'PALM', 'SK'],
  CCH: ['CH', 'SK'],
  SK: ['SCR', 'SI', 'CCH'],
  SI: ['TS', 'SK', 'SHU'],
  TS: ['SI', 'CT', 'SFF'],
  SHU: ['SI', 'SCR', 'TS'],
  SCR: ['SK', 'SHU'],
  PALM: ['CH', 'FK', 'KN'],
};

/** 投球姿势对球种的偏好 */
export const DELIVERY_PITCH_W: Record<'over' | 'three' | 'side' | 'under', Partial<Record<PitchType, number>>> = {
  over: { CB: 1.6, FK: 1.5, VSL: 1.4, SFF: 1.3, KCB: 1.3, PCB: 1.3, SCB: 1.2, SL: 1.0, CH: 1.0 },
  three: { SL: 1.5, CT: 1.3, HSL: 1.3, CH: 1.2, TS: 1.2, FK: 1.0, CB: 1.0 },
  side: { SHU: 1.8, SK: 1.7, SI: 1.5, SW: 1.6, SL: 1.4, TS: 1.2, CB: 0.7, FK: 0.6, VSL: 0.5 },
  under: { SK: 2.2, SHU: 1.8, SI: 1.5, SCR: 1.6, SW: 1.2, CB: 0.5, FK: 0.4, VSL: 0.3, KCB: 0.3 },
};

/** 某投手学某球种的倾向（0 表示学不了） */
export function pitchAffinity(owned: readonly PitchType[], delivery: keyof typeof DELIVERY_PITCH_W, t: PitchType): number {
  if (owned.includes(t)) return 0;
  const def = PITCH_DEFS[t];
  let w = [0, 10, 5, 1.6, 0.25][def.rarity];
  w *= DELIVERY_PITCH_W[delivery][t] ?? 0.9;
  for (const o of owned) if (PITCH_KIN[o]?.includes(t)) w *= 2.2;
  // 同方向的球种太多就没那么有用
  const sameDir = owned.filter((o) => PITCH_DEFS[o].dir === def.dir).length;
  w /= 1 + sameDir * 0.8;
  return w;
}

/** 魔球的名字素材 */
export const SIG_PREFIX = ['幻影', '雷光', '流星', '苍龙', '鬼', '天狗', '阳炎', '月影', '疾风', '雪月', '不知火', '红莲', '真空', '朧', '蜃气楼'];
export const SIG_SUFFIX: Partial<Record<PitchFamily, string[]>> = {
  fast: ['直球', '速球', '火球'],
  slide: ['滑球', '切球', '刃'],
  drop: ['落球', '坠', '曲球'],
  off: ['变速', '慢球', '魔球'],
  reverse: ['沉球', '螺旋', '回旋'],
  special: ['魔球', '幻球'],
};
