import type { AIStyle, PitchType, Player, Pos, TeamColors } from '../core/types';

export type OffTactic =
  | 'auto' // 交给 AI（或自由打击）
  | 'swing' // 自由打击
  | 'aggressive' // 积极打击
  | 'wait' // 待球
  | 'contact' // 轻打
  | 'power' // 强振
  | 'bunt' // 牺牲触击
  | 'buntHit' // 触击安打
  | 'squeeze' // 抢分触击
  | 'hitRun' // 打带跑
  | 'steal' // 盗垒（前方跑者）
  | 'doubleSteal'; // 双盗垒

/** 玩家这一球发动的进攻战术：盗垒、双盗、牺牲触击、抢分（强迫取分）、打带跑 */
export type HumanTac = 'steal' | 'doubleSteal' | 'bunt' | 'squeeze' | 'hitRun';

export type PitchApproach = 'normal' | 'max' | 'contact' | 'careful';
/** 守备阵型；close = 趋近（一三垒手前压防触击、二游站双杀位置，玩家用），noDoubles = 防长打（外野后退） */
export type Alignment = 'normal' | 'infieldIn' | 'dp' | 'noDoubles' | 'buntShift' | 'close';

// ---------- 打席指令（一个打席有效） ----------
/** 打法 */
export type BatApproach = 'normal' | 'power' | 'contact' | 'aggressive' | 'wait' | 'bunt' | 'buntHit' | 'squeeze';
/** 狙球种：直球系 / 变化球 */
export type SitPitch = 'none' | 'FB' | 'BR';
/** 球路区域（相对打者：内角 / 外角，高 / 低） */
export type Zone = 'in' | 'out' | 'high' | 'low';
export type RunPlay = 'none' | 'steal' | 'hitRun' | 'doubleSteal';

/** 进攻方的打席指令 */
export interface BatCmd {
  app: BatApproach;
  sit: SitPitch;
  zone: Zone | 'none';
  run: RunPlay;
  /** 跑垒积极度：-1 稳健（小离垒、不冒险）/ 0 普通 / 1 积极（大离垒、多抢一个垒） */
  agg: -1 | 0 | 1;
}

/** 守方的配球计划 */
export interface PitchPlan {
  /** 配球比重：交给捕手 / 直球为主 / 变化球为主 */
  mix: 'auto' | 'FB' | 'BR';
  /** 决胜球：两好球后优先使用 */
  finisher: PitchType | 'FB' | null;
  /** 主攻区域 */
  focus: Zone | 'auto';
  approach: PitchApproach;
  align: Alignment;
  /** 申告敬远 */
  ibb: boolean;
  /** 注意跑者：快速投球，盗垒更难，但球质略降 */
  hold: boolean;
  /** 第一球投外角吊球（识破盗垒、抢分） */
  pitchout: boolean;
}

/** 一个打席的结果分类 */
export type PAResult = 'K' | 'BB' | 'IBB' | 'HBP' | '1B' | '2B' | '3B' | 'HR' | 'OUT' | 'DP' | 'SAC' | 'SF' | 'E' | 'FC';

/** 一球的位置分类（相对打者） */
export interface PitchSpot {
  hz: 'in' | 'mid' | 'out';
  vz: 'high' | 'mid' | 'low';
}

/** 比赛中的打席记录：双方 AI 都会参考「上一个打席」调整策略 */
export interface PAMemo {
  no: number;
  side: 0 | 1; // 进攻方
  bat: number;
  pit: number;
  inning: number;
  res: PAResult;
  np: number;
  /** 决定结果的那一球 */
  last: { t: PitchType | 'FB'; fam: 'FB' | 'BR'; spot: PitchSpot; res: PitchResult } | null;
  cmd: BatCmd | null;
  plan: PitchPlan | null;
}

/** 某个投手在这场比赛里的用球统计（对手打者据此调整） */
export interface PitchUse {
  n: number;
  fb: number;
  br: number;
  in: number;
  out: number;
  high: number;
  low: number;
  /** 两好球时用的球种 */
  two: Record<string, number>;
  twoN: number;
  /** 各球种用了几球 */
  tn: Record<string, number>;
  /** 最近的配球（越近分量越重）：各球种、九宫格（落点最近的那一格）的分量，tw 是总分量 */
  rt: Record<string, number>;
  rz: number[];
  tw: number;
}

/** 某个打者看过这个投手的配球（越近分量越重） */
export interface SeenPitches {
  rt: Record<string, number>;
  rz: number[];
  tw: number;
}

/** AI（或教练）对这个打席的打算，以及理由（给玩家的情报） */
export interface Intent {
  why: string[];
}

export interface DefTactic {
  approach: PitchApproach;
  align: Alignment;
  ibb: boolean;
  pitchout: boolean;
}

export interface MatchRules {
  innings: number;
  mercy: boolean;
  dh: boolean;
  koshien: boolean;
  bigGame: boolean; // 决赛/甲子园
  official: boolean;
  tiebreakFrom: number;
  maxInnings: number;
  pitchLimit: number;
  moundVisits: number;
  fence: { line: number; center: number };
  stadium: string;
}

export interface TeamSetup {
  schoolId: number;
  name: string;
  short: string;
  colors: TeamColors;
  players: Player[]; // 登录名单
  order: number[]; // 9 人
  defense: Partial<Record<Pos, number>>; // 含 P
  human: boolean;
  style: AIStyle;
  mgrTactics: number; // 指挥能力 0..100
  teamTactics: number; // 战术熟练度 0..100
  chemistry: number;
  crowd: number; // 应援 0..1
  /** 换投倾向倍率（>1 更早换投、<1 让先发投更久） */
  hook?: number;
}

export type PitchResult = 'ball' | 'called' | 'swinging' | 'foul' | 'inplay' | 'hbp' | 'bunt_foul' | 'bunt_miss' | 'pitchout';

export interface PitchInfo {
  type: PitchType | 'FB';
  /** 魔球的名字 */
  sig?: string;
  kmh: number;
  x: number; // 好球带坐标 -1..1 为好球带
  y: number;
  res: PitchResult;
  /** 瞄准点 */
  tx?: number;
  ty?: number;
  /** 这一球的质量 0..100 */
  q?: number;
  /** 失投（没变化、留在好打的位置） */
  hang?: boolean;
  /** 打者狙的九宫格（-1 不挥棒） */
  hunt?: number;
}

export type BipKind = 'GB' | 'LD' | 'FB' | 'PU' | 'BU';
export type HitRes = 'out' | '1B' | '2B' | '3B' | 'HR' | 'E' | 'FC' | 'DP' | 'SF' | 'SAC' | 'IH';

export interface BipInfo {
  kind: BipKind;
  angle: number; // -45..45（负=左外野方向）
  dist: number; // 米
  fielder: Pos;
  res: HitRes;
}

export interface RunnerMove {
  pid: number;
  from: number; // 0 = 打者(本垒) 1..3 = 垒
  to: number; // 1..3, 4 = 得分
  out: boolean;
}

export type EventKind = 'pitch' | 'play' | 'steal' | 'wp' | 'pickoff' | 'sub' | 'pitcher' | 'visit' | 'half' | 'end' | 'ibb' | 'info';

export interface Snap {
  inning: number;
  half: 0 | 1;
  outs: number;
  balls: number;
  strikes: number;
  bases: (number | null)[];
  score: [number, number];
}

export interface PlayEvent {
  k: EventKind;
  text: string;
  pitch?: PitchInfo;
  bip?: BipInfo;
  moves?: RunnerMove[];
  runs?: number;
  big?: boolean; // 精彩/关键
  side: 0 | 1; // 进攻方
  snap?: Snap;
}

export interface RunnerSlot {
  pid: number;
  resp: number; // 负责投手
  unearned: boolean;
}

export interface BoxBat {
  pid: number;
  pa: number; ab: number; h: number; d: number; t: number; hr: number; rbi: number; r: number;
  bb: number; hbp: number; so: number; sb: number; cs: number; sac: number; sf: number; e: number;
  seq: string[]; // 每打席结果简写
}

export interface BoxPit {
  pid: number;
  outs: number; h: number; r: number; er: number; bb: number; so: number; hr: number; np: number; bf: number;
  start: boolean;
}

export interface MatchSummary {
  score: [number, number];
  innings: number;
  winner: 0 | 1;
  hits: [number, number];
  errors: [number, number];
  line: [number[], number[]];
  called: boolean;
  bat: [BoxBat[], BoxBat[]];
  pit: [BoxPit[], BoxPit[]];
  wp: number | null; // 胜投
  lp: number | null; // 败投
  mvp: number | null;
  highlights: string[];
}
