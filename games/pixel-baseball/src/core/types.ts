// ============ 基础 ============
export type Pos = 'P' | 'C' | '1B' | '2B' | '3B' | 'SS' | 'LF' | 'CF' | 'RF';
export const POSITIONS: readonly Pos[] = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const FIELD_POS: readonly Pos[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
export const POS_NAME: Record<Pos, string> = {
  P: '投手', C: '捕手', '1B': '一垒手', '2B': '二垒手', '3B': '三垒手', SS: '游击手', LF: '左外野手', CF: '中外野手', RF: '右外野手',
};
export const POS_SHORT: Record<Pos, string> = { P: '投', C: '捕', '1B': '一', '2B': '二', '3B': '三', SS: '游', LF: '左', CF: '中', RF: '右' };
export const POS_ABBR: Record<Pos, string> = { P: '投手', C: '捕手', '1B': '一垒', '2B': '二垒', '3B': '三垒', SS: '游击', LF: '左外', CF: '中外', RF: '右外' };
export const POS_NUM: Record<Pos, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };

export type Hand = 'R' | 'L';
export type BatSide = 'R' | 'L' | 'S';
/** 变化球（直球 FB 不在其中，每个投手都会） */
export type PitchType =
  | 'TS' | 'CT' | 'SI' | 'SHU'
  | 'SL' | 'HSL' | 'SW' | 'VSL'
  | 'CB' | 'SCB' | 'KCB' | 'PCB' | 'FK' | 'SFF'
  | 'CH' | 'CCH' | 'PALM'
  | 'SK' | 'SCR'
  | 'KN' | 'GYRO';
export type Delivery = 'over' | 'three' | 'side' | 'under';
export type GrowthType = 'early' | 'normal' | 'late';
export type Personality = 'hot' | 'calm' | 'diligent' | 'genius' | 'lazy' | 'proud' | 'shy' | 'leader' | 'cheerful';
export type CareerWish = 'pro' | 'univ' | 'corp' | 'job';

export type BatAttr = 'contact' | 'power' | 'eye' | 'speed' | 'arm' | 'fielding' | 'catching' | 'bunt' | 'baserun';
export type PitAttr = 'velocity' | 'control' | 'stamina' | 'stuff';
export type MiscAttr = 'mental' | 'durability';
export type AttrKey = BatAttr | PitAttr | MiscAttr;
export const BAT_ATTRS: readonly BatAttr[] = ['contact', 'power', 'eye', 'speed', 'arm', 'fielding', 'catching', 'bunt', 'baserun'];
export const PIT_ATTRS: readonly PitAttr[] = ['velocity', 'control', 'stamina', 'stuff'];
export const MISC_ATTRS: readonly MiscAttr[] = ['mental', 'durability'];
export const ALL_ATTRS: readonly AttrKey[] = [...BAT_ATTRS, ...PIT_ATTRS, ...MISC_ATTRS];

export type ExpKind = 'str' | 'agi' | 'tech' | 'brk' | 'men';
export const EXP_KINDS: readonly ExpKind[] = ['str', 'agi', 'tech', 'brk', 'men'];
export type ExpPool = Record<ExpKind, number>;

export interface PitchSkill {
  type: PitchType;
  lv: number; // 1..7
  /** 魔球：独创的名字，威力额外加成 */
  sig?: string;
}

export interface Injury {
  name: string;
  part: 'shoulder' | 'elbow' | 'leg' | 'back' | 'hand' | 'other';
  days: number;
  severity: 1 | 2 | 3;
}

export interface BatLine {
  g: number; pa: number; ab: number; h: number; d: number; t: number; hr: number; rbi: number; r: number;
  bb: number; hbp: number; so: number; sb: number; cs: number; sac: number; sf: number; e: number;
}
export interface PitLine {
  g: number; gs: number; outs: number; h: number; r: number; er: number; bb: number; so: number; hr: number;
  np: number; bf: number; w: number; l: number; sv: number; cg: number; sho: number;
}
export interface StatBlock {
  bat: BatLine;
  pit: PitLine;
}

/** 培养方针（自动加点的倾向） */
export type DevPlan =
  | 'auto' | 'balanced' | 'contact' | 'power' | 'speed' | 'defense'
  | 'pit_velo' | 'pit_ctrl' | 'pit_brk' | 'pit_stam';

export interface Player {
  id: number;
  fam: string;
  given: string;
  grade: number; // 0 内定的中学生, 1..3 高中生
  enrollYear: number;
  throws: Hand;
  bats: BatSide;
  pos: Pos;
  a: Record<AttrKey, number>;
  caps: Record<AttrKey, number>;
  traj: number; // 弹道 1..4
  pitches: PitchSkill[];
  delivery: Delivery;
  traits: string[];
  pot: number; // 潜力 0..100（隐藏）
  growth: GrowthType;
  pers: Personality;
  ethic: number; // 练习态度
  height: number;
  fatigue: number; // 0..100
  cond: number; // 调子 -2..2
  morale: number; // 干劲 0..100
  trust: number; // 对监督的信赖 0..100
  injury: Injury | null;
  academics: number;
  pop: number; // 人气
  exp: ExpPool;
  /** 留给「另一边」的经验（投手练打击、野手练投球），见 growth.ts 的 autoSpend */
  xo?: ExpPool;
  plan: DevPlan;
  /** 正在学的新球种 */
  learning: { pitch: PitchType; progress: number } | null;
  wish: CareerWish;
  /** 最近 7 天每天的投球数（高中棒球：一周 500 球） */
  pw: number[];
  /** 引擎读取的「本周投球数」= pw 之和 */
  pitchesWeek: number;
  /** 补习 / 停赛剩余天数 */
  benched: number;
  /** 三年级夏天打完后引退（还在籍，等毕业 / 选秀） */
  retired: boolean;
  face: number;
  joined: 'regular' | 'scholar' | 'walkon' | 'transfer' | 'gem';
  middle?: string;
  stats: { season: StatBlock; career: StatBlock; koshien: StatBlock };
  /** 个人大事记 */
  notes: { d: number; t: string }[];
  /** 本赛季成长统计（年度总结用） */
  gains?: number;
  /** 这一周 / 上一周各项能力涨了多少（显示「最近成长」用） */
  gw?: Partial<Record<AttrKey | 'pitch', number>>;
  gwp?: Partial<Record<AttrKey | 'pitch', number>>;
  draft?: { team: string; round: number };
}

// ============ 学校 ============
export interface TeamColors {
  primary: string;
  secondary: string;
  cap: string;
  letter: string;
}

export type AIStyle = 'balanced' | 'smallball' | 'power' | 'pitching' | 'speed';

export interface SchoolLite {
  id: number;
  name: string;
  short: string;
  prefId: number;
  district: number;
  type: 'public' | 'private';
  prestige: number;
  style: AIStyle;
  colors: TeamColors;
  koshienApps: number;
  koshienWins: number;
  titles: number;
  lastKoshien: number;
  /** 和本校的宿敌度 */
  rival: number;
}

// ============ 大会 ============
export type TourKind = 'springPref' | 'springRegion' | 'summerPref' | 'koshien' | 'fallPref' | 'fallRegion' | 'jingu' | 'senbatsu';

export interface BracketMatch {
  a: number | null;
  b: number | null;
  w: number | null;
  sa: number;
  sb: number;
  inn: number;
  done: boolean;
  note?: string;
}

export interface Tour {
  kind: TourKind;
  name: string;
  year: number;
  teams: number[];
  rounds: BracketMatch[][];
  roundDays: number[];
  roundNames: string[];
  mercy: boolean;
  koshien: boolean;
  done: boolean;
  champion: number | null;
  runnerUp: number | null;
  /** 本校在这项大会的成绩，没参加为 null */
  myFinish: string | null;
  myRank: number;
  /** 外县学校（不在 g.schools 里的）的资料 */
  ext: Record<number, SchoolLite>;
}

/** 今天要打的本校比赛（打完、写入结果之前一直挂着，读档后可以按同一个种子重演） */
export interface PendingMatch {
  tour: TourKind | null; // null = 练习赛
  round: number;
  idx: number;
  oppId: number;
  home: boolean;
  seed: number;
  label: string;
  /** 亲自指挥中的比赛：开赛时的阵容与玩家（或教练）的每一个指令，读档时按记录重演 */
  live?: LiveRecord;
}

/** 亲自指挥时玩家的一个操作（每一球的投球 / 打击指令、换人、牵制、敬远、交给教练打完） */
export type LiveAct =
  // coach：教练替玩家投的这一球（AI 打者读得到教练的打算）
  | { k: 'throw'; t: PitchType | 'FB'; x: number; y: number; coach?: boolean }
  // commit：玩家按了「挥棒」，不管球来到哪里都挥（教练的指令没有这个标记：看到球来到狙的位置附近才挥）
  | { k: 'swing'; z: number; run: [boolean, boolean, boolean]; commit?: boolean; c?: [number, number] }
  | { k: 'ph'; slot: number; pid: number }
  | { k: 'pr'; base: number; pid: number }
  | { k: 'pc'; pid: number }
  | { k: 'ds'; pos: Pos; pid: number }
  | { k: 'po'; base?: number }
  | { k: 'ibb' }
  // 守备阵型：趋近（防触击、双杀）/ 正常 / 防长打
  | { k: 'al'; a: 'close' | 'normal' | 'deep' }
  | { k: 'end' };

export interface LiveRecord {
  order: number[];
  defense: Partial<Record<Pos, number>>;
  players: number[];
  /** n：第几球（每投一球加一）；a：这一球之前的操作 */
  log: { n: number; a: LiveAct }[];
  /** 已经投了几球 */
  played: number;
  /** 记录时的比赛引擎版本（没有 = 1）；和现在的不一样就没法按记录重演，这场比赛从头开始 */
  eng?: number;
}

/** 打线里的一棒（不用 DH 时，守位是 P 的那一棒由当天的先发投手打） */
export interface Slot {
  pid: number;
  pos: Pos | 'DH';
}

/** 自定义阵容 */
export interface LineupPlan {
  bat: Slot[];
  /** 先发顺位：排在前面、状态可以的投手先发 */
  rotation: number[];
  /** 练习赛也用这套阵容（否则练习赛按起用方针自动排，给替补和新人机会） */
  practice: boolean;
}

// ============ 记录 ============
export type LogKind = 'info' | 'good' | 'bad' | 'game' | 'auto' | 'gold' | 'event' | 'train';

export interface LogEntry {
  d: number;
  t: string;
  k: LogKind;
}

export interface BoxBatLine {
  name: string;
  pos: string;
  pa: number; ab: number; h: number; hr: number; rbi: number; r: number; bb: number; so: number; sb: number; d: number; t: number;
  seq: string[];
}

export interface BoxPitLine {
  name: string;
  outs: number; h: number; r: number; er: number; bb: number; so: number; np: number; hr: number;
  dec?: 'W' | 'L';
}

export interface GameRecord {
  id: number;
  d: number;
  label: string;
  tour: TourKind | null;
  oppId: number;
  oppName: string;
  home: boolean;
  my: number;
  opp: number;
  inn: number;
  called: boolean;
  win: boolean;
  line: [number[], number[]]; // [本校, 对手]
  hits: [number, number];
  errors: [number, number];
  bat: BoxBatLine[];
  pit: BoxPitLine[];
  oppPit: BoxPitLine[];
  mvp: string | null;
  highlights: string[];
}

export interface YearRecord {
  year: number;
  schoolName: string;
  results: Partial<Record<TourKind, string>>;
  w: number;
  l: number;
  goal: string;
  goalMet: boolean;
  best: string;
}

export interface Alumni {
  id: number;
  name: string;
  pos: Pos;
  gradYear: number;
  schoolName: string;
  path: 'pro' | 'univ' | 'corp' | 'job' | 'left';
  proTeam?: string;
  round?: number;
  ovr: number;
  summary: string;
  proStatus?: string;
  proYears?: number;
  face: number;
}

// ============ 监督 ============
export type MgrSkill = 'batting' | 'pitching' | 'fielding' | 'tactics' | 'leadership' | 'recruiting' | 'negotiation' | 'insight';
export const MGR_SKILLS: readonly MgrSkill[] = ['batting', 'pitching', 'fielding', 'tactics', 'leadership', 'recruiting', 'negotiation', 'insight'];

export interface Manager {
  name: string;
  age0: number;
  bg: string;
  face: number;
  skills: Record<MgrSkill, number>;
  level: number;
  exp: number;
  rep: number;
  /** 在现在这所学校执教的起始学年 */
  since: number;
  career: { year: number; school: string; summary: string; w: number; l: number }[];
  totals: { w: number; l: number; koshienApps: number; koshienWins: number; summerTitles: number; springTitles: number; drafted: number; seasons: number; prefTitles: number };
}

// ============ 球队经营（挂机版：方针 + 设施） ============
export type FacilityId = 'field' | 'cage' | 'bullpen' | 'weight' | 'indoor' | 'medical' | 'analysis' | 'dorm';
export const FACILITY_IDS: readonly FacilityId[] = ['field', 'cage', 'bullpen', 'weight', 'indoor', 'medical', 'analysis', 'dorm'];

export type TrainFocus = 'balanced' | 'batting' | 'pitching' | 'defense' | 'physical' | 'mental' | 'practical';

export interface Policies {
  focus: TrainFocus;
  intensity: number; // 0 轻松 1 普通 2 严格 3 地狱
  autoRest: boolean;
  style: AIStyle;
  pitcherUse: 'ace' | 'rotation' | 'bullpen';
  lineup: 'merit' | 'seniors' | 'youth';
  recruit: 'balanced' | 'ready' | 'potential';
  study: 'baseball' | 'balanced' | 'academic';
  auto: 'off' | 'minor' | 'all' | 'custom';
  autoCats: Record<string, boolean>;
}

export interface Club {
  chemistry: number; // 默契 0..100
  fans: number;
  board: number; // 校方满意度 0..100
  ob: number; // OB 会满意度 0..100
  captainId: number | null;
  scandal: number;
  banUntil: number; // 对外比赛禁止到这一天（处分）
  tactics: number; // 战术熟练度 0..100
  goal: { kind: 'summerPref' | 'koshien'; rank: number; text: string } | null;
}

export type Ctx = Record<string, string | number | boolean | number[] | string[] | null>;

export interface QueueItem {
  qid: number;
  id: string;
  ctx: Ctx;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface GameState {
  game: 'pixel-baseball';
  v: number;
  seed: number;
  rng: number[];
  nextId: number;
  day: number; // 0 = 开局学年的 4 月 1 日
  startYear: number;
  created: number;
  savedAt: number;
  difficulty: Difficulty;
  dh: boolean;
  prefId: number;
  schoolId: number;
  schools: Record<number, SchoolLite>;
  mgr: Manager;
  players: Record<number, Player>;
  roster: number[];
  incoming: number[];
  alumni: Alumni[];
  club: Club;
  policies: Policies;
  funds: number;
  facilities: Record<FacilityId, number>;
  building: { id: FacilityId; left: number; total: number } | null;
  books: { year: number; in: Record<string, number>; out: Record<string, number> }[];
  tours: Partial<Record<TourKind, Tour>>;
  pending: PendingMatch | null;
  games: GameRecord[];
  seasonWL: [number, number];
  history: YearRecord[];
  queue: QueueItem[];
  schedule: { d: number; kind: string; data?: Ctx }[];
  cooldowns: Record<string, number>;
  flags: Record<string, number>;
  logs: LogEntry[];
  timeline: { d: number; t: string }[];
  achievements: Record<string, number>;
  lastBlockDay: number;
  /** 本学年的选拔出场与名额判定所需 */
  senbatsuPick: number[];
  /** 自定义阵容（null = 每场自动排） */
  lineup: LineupPlan | null;
  /** 下一场指定的先发投手 */
  nextStarter: number | null;
}
