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
export type PitchType = 'SL' | 'CB' | 'FK' | 'CH' | 'CT' | 'SH' | 'SK';
export const PITCH_TYPES: readonly PitchType[] = ['SL', 'CB', 'FK', 'CH', 'CT', 'SH', 'SK'];
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
}

export interface Injury {
  name: string;
  part: 'shoulder' | 'elbow' | 'leg' | 'back' | 'hand' | 'other';
  weeks: number;
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

export type DevPlan =
  | 'auto' | 'balanced' | 'contact' | 'power' | 'speed' | 'defense'
  | 'pit_velo' | 'pit_ctrl' | 'pit_brk' | 'pit_stam' | 'manual';

export type Focus =
  | { kind: 'attr'; attr: AttrKey }
  | { kind: 'pitch'; pitch: PitchType }
  | { kind: 'pos'; pos: Pos }
  | { kind: 'rest' }
  | { kind: 'study' };

export interface Player {
  id: number;
  fam: string;
  given: string;
  schoolId: number; // -1 = 无所属
  grade: number; // 0 中学生, 1..3 高中生, 9 已毕业
  enrollYear: number;
  throws: Hand;
  bats: BatSide;
  pos: Pos;
  apt: Partial<Record<Pos, number>>;
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
  plan: DevPlan;
  focus: Focus | null;
  learning: { pitch: PitchType; progress: number } | null;
  wish: CareerWish;
  pitchesWeek: number;
  /** 上周投球数（周初练习、事件判断用） */
  pitchesLast?: number;
  retired: boolean;
  ineligibleUntil: number; // absWeek
  face: number;
  joined: 'recruit' | 'walkon' | 'transfer' | 'scholar' | 'gen';
  scholarship: boolean;
  supplementary: number; // 补习剩余周数
  stats: { season: StatBlock; career: StatBlock; koshien: StatBlock };
  // 中学生
  scout?: number;
  interest?: Record<number, number>;
  committed?: number;
  fame?: number;
  middle?: string;
  homePref?: number;
  offers?: number[]; // 我方做过的招募动作次数等
  // 履历
  notes: string[];
  proTeam?: string;
  draftRound?: number;
  path?: string;
}

// ============ 学校 ============
export interface TeamColors {
  primary: string;
  secondary: string;
  cap: string;
  letter: string;
}

export type AIStyle = 'balanced' | 'smallball' | 'power' | 'pitching' | 'speed';

export interface SchoolYearResult {
  year: number;
  springPref?: string;
  springRegion?: string;
  summerPref?: string;
  koshien?: string;
  fallPref?: string;
  fallRegion?: string;
  jingu?: string;
  senbatsu?: string;
}

export interface School {
  id: number;
  name: string;
  short: string;
  prefId: number;
  district: number;
  type: 'public' | 'private';
  prestige: number;
  strength: number;
  style: AIStyle;
  mgrName: string;
  mgrSkill: number;
  facility: number;
  academic: number;
  colors: TeamColors;
  roster: number[] | null;
  staff: number[];
  koshienApps: number;
  koshienWins: number;
  summerTitles: number;
  springTitles: number;
  lastKoshien: number;
  history: SchoolYearResult[];
  rivalry: number;
  seen: number;
  profile: { off: number; pit: number; def: number };
}

// ============ 教练 ============
export type StaffRole = 'pitching' | 'batting' | 'fielding' | 'trainer' | 'scout' | 'analyst' | 'director';
export type StaffTrait = 'strict' | 'gentle' | 'theory' | 'veteran' | 'young' | 'network' | 'medic';

export interface Staff {
  id: number;
  name: string;
  age: number;
  role: StaffRole;
  skill: number;
  salary: number; // 年薪（万円）
  years: number;
  loyalty: number;
  schoolId: number;
  bg: string;
  trait: StaffTrait | null;
}

// ============ 监督 ============
export type MgrSkill = 'batting' | 'pitching' | 'fielding' | 'tactics' | 'leadership' | 'recruiting' | 'negotiation' | 'insight';
export const MGR_SKILLS: readonly MgrSkill[] = ['batting', 'pitching', 'fielding', 'tactics', 'leadership', 'recruiting', 'negotiation', 'insight'];

export interface CareerYear {
  year: number;
  schoolId: number;
  schoolName: string;
  summary: string;
  w: number;
  l: number;
}

export interface JobOffer {
  id: number;
  schoolId: number;
  salary: number;
  years: number;
  goal: number;
  budgetHint: number;
  expires: number; // absWeek
  note: string;
}

export interface Manager {
  name: string;
  age: number;
  bg: string;
  skills: Record<MgrSkill, number>;
  level: number;
  exp: number;
  points: number;
  reputation: number;
  money: number;
  salary: number;
  schoolId: number;
  contractYears: number;
  ap: number;
  apMax: number;
  /** 代言等占用行动力的零头（按周累计，满 1 点才扣） */
  apOwed?: number;
  /** 年度中途就任的新合同：第一个年度末不计入合同年数 */
  contractFresh?: boolean;
  history: CareerYear[];
  achievements: string[];
  offers: JobOffer[];
  totals: { w: number; l: number; koshienApps: number; koshienWins: number; summerTitles: number; springTitles: number; drafted: number; seasons: number };
  unemployedWeeks: number;
  seasonW: number;
  seasonL: number;
}

// ============ 俱乐部（本队经营） ============
export type FacilityId = 'field' | 'indoor' | 'weight' | 'bullpen' | 'cage' | 'dorm' | 'medical' | 'analysis';
export type MenuId = 'bat' | 'pitch' | 'field' | 'run' | 'power' | 'game' | 'tactic' | 'rest' | 'study';
export const MENU_IDS: readonly MenuId[] = ['bat', 'pitch', 'field', 'run', 'power', 'game', 'tactic', 'rest', 'study'];

export interface TrainingPlan {
  alloc: Record<MenuId, number>;
  intensity: number; // 0 轻松 1 普通 2 严格 3 地狱
}

export interface LineupConfig {
  auto: boolean;
  order: number[];
  defense: Partial<Record<Pos, number>>;
  dh: number | null;
  bench: number[];
  rotation: number[];
  autoBench: boolean;
}

export interface SponsorDeal {
  id: number;
  name: string;
  kind: 'equipment' | 'local' | 'media' | 'endorse' | 'drink' | 'gray';
  monthly: number;
  lump: number;
  winBonus: number;
  koshienBonus: number;
  weeksLeft: number;
  apPerMonth: number;
  fatigue: number; // 对球员的额外负担
  popBoost: number;
  equipDiscount: number;
  risk: number; // 丑闻风险
  desc: string;
}

export interface LedgerEntry {
  absWeek: number;
  amount: number;
  cat: string;
  note: string;
}

export interface MonthBook {
  label: string;
  income: Record<string, number>;
  expense: Record<string, number>;
}

export interface ClubState {
  schoolId: number;
  funds: number;
  ledger: LedgerEntry[];
  books: MonthBook[];
  facilities: Record<FacilityId, number>;
  construction: { id: FacilityId; weeksLeft: number } | null;
  training: TrainingPlan;
  lineup: LineupConfig;
  autoManage: boolean;
  sponsors: SponsorDeal[];
  sponsorOffers: SponsorDeal[];
  meal: number; // 0 普通 1 营养 2 豪华
  equipment: number; // 0 普通 1 良好 2 顶级
  walkonPolicy: 'open' | 'select';
  captainId: number | null;
  chemistry: number;
  tacticsSkill: number;
  fans: number;
  practice: { week: number; opponentId: number; invited?: boolean } | null;
  scholarshipSlots: number;
  goal: number; // 目标名次（夏）
  /** 跳槽时合同约定的目标：就任后第一个年度的目标不低于它 */
  contractGoal?: number;
  board: number; // 校方满意度
  ob: number; // OB 会满意度
  supporters: number; // 球迷/地方期待
  scandal: number; // 丑闻风险累积
  banUntil: number; // 对外比赛禁止（处分）到 absWeek
  koshienFund: number; // 本次甲子园募款
}

// ============ 大会 ============
export type TourKind = 'springPref' | 'springRegion' | 'summerPref' | 'koshien' | 'fallPref' | 'fallRegion' | 'jingu' | 'senbatsu';

export interface BracketMatch {
  a: number | null;
  b: number | null;
  winner: number | null;
  sa: number;
  sb: number;
  inn: number;
  played: boolean;
  note?: string;
}

export interface Tournament {
  id: string;
  kind: TourKind;
  name: string;
  year: number;
  pref: number; // -1 不限
  region: string; // '' 不限
  district: number; // -1 不限
  teams: number[];
  rounds: BracketMatch[][];
  roundWeeks: number[];
  roundNames: string[];
  mercy: boolean;
  koshien: boolean;
  done: boolean;
  champion: number | null;
  runnerUp: number | null;
  finish: Record<number, string>;
  rank: Record<number, number>; // 数值名次: 越大越好
}

// ============ 消息 ============
export interface Message {
  id: number;
  absWeek: number;
  title: string;
  body: string;
  kind: 'info' | 'good' | 'bad' | 'offer' | 'event';
  read: boolean;
}

export interface NewsItem {
  absWeek: number;
  text: string;
  kind: 'result' | 'world' | 'draft' | 'school' | 'pro' | 'recruit';
}

export interface EventChoice {
  label: string;
  hint?: string;
  disabled?: boolean;
}

export interface ActiveEvent {
  defId: string;
  title: string;
  text: string;
  ctx: Record<string, number | string>;
  choices: EventChoice[];
  pid?: number; // 主角球员（显示头像）
}

export interface AlumniEntry {
  pid: number;
  name: string;
  pos: Pos;
  schoolName: string;
  gradYear: number;
  path: string;
  pro: boolean;
  proTeam?: string;
  round?: number;
  proStatus?: string;
  proYears?: number;
  summary: string;
}

export interface Records {
  seasons: SeasonRecord[];
  alumni: AlumniEntry[];
  koshienChamps: { year: number; kind: 'summer' | 'spring'; schoolId: number; schoolName: string; runnerUp: string }[];
  bestBatAvg: { name: string; v: number; year: number } | null;
}

export interface SeasonRecord {
  year: number;
  schoolId: number;
  schoolName: string;
  results: SchoolYearResult;
  w: number;
  l: number;
  bestPlayer: string;
}

export interface WeekReport {
  title: string;
  lines: { text: string; tone?: 'good' | 'bad' | 'info' }[];
  growth: { pid: number; name: string; gains: string }[];
  money: number;
}

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Settings {
  sound: boolean;
  animSpeed: number; // 1 普通 2 快 3 极速
  stopAtKey: boolean;
  zoom: number;
}

export interface GameState {
  version: number;
  saveName: string;
  rng: number[];
  nextId: number;
  year: number;
  week: number;
  absWeek: number;
  startYear: number;
  difficulty: Difficulty;
  dh: boolean;
  manager: Manager;
  schools: Record<number, School>;
  players: Record<number, Player>;
  staff: Record<number, Staff>;
  prospects: number[];
  transfers: number[];
  freeStaff: number[];
  tournaments: Record<string, Tournament>;
  club: ClubState;
  inbox: Message[];
  news: NewsItem[];
  eventQueue: ActiveEvent[];
  flow: FlowState | null;
  records: Records;
  flags: Record<string, number>;
  cooldowns: Record<string, number>;
  reports: WeekReport[];
  summerReps: number[];
  senbatsuReps: number[];
  nationalLog: { year: number; kind: string; text: string }[];
  notices: Notice[];
  choice: PendingChoice | null;
  regionRank: Record<string, number[]>;
  draftLog: { year: number; picks: { round: number; team: string; name: string; school: string; pos: string; mine: boolean; ikusei: boolean }[] }[];
}

export interface Notice {
  title: string;
  lines: string[];
  kind: 'celebrate' | 'info' | 'bad';
}

export interface PendingChoice {
  id: string;
  title: string;
  text: string;
  options: { label: string; value: number; hint?: string }[];
}

// ============ 周流程 ============
export interface FlowStep {
  k: 'specials' | 'events' | 'training' | 'matches' | 'practice' | 'weekly' | 'report';
}

export interface FlowState {
  steps: FlowStep[];
  idx: number;
  report: WeekReport;
  pendingMatch: PendingMatch | null;
}

export interface PendingMatch {
  tid: string | null; // null = 练习赛
  round: number;
  matchIdx: number;
  oppId: number;
  home: boolean;
  label: string;
}
