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

export type PitchApproach = 'normal' | 'max' | 'contact' | 'careful';
export type Alignment = 'normal' | 'infieldIn' | 'dp' | 'noDoubles' | 'buntShift';

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
