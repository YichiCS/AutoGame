// 逐球比赛模拟引擎
import type { Player, Pos, PitchType } from '../core/types';
import { POS_NAME } from '../core/types';
import type {
  BipInfo, BipKind, BoxBat, BoxPit, DefTactic, EventKind, MatchRules, MatchSummary, OffTactic, PAMemo, PAResult,
  PitchInfo, PitchResult, PitchSpot, PitchUse, PlayEvent, RunnerMove, RunnerSlot, SeenPitches, Snap, TeamSetup, Zone,
} from './types';
import { chance, gauss, rand, weightedPick } from '../core/rng';
import { clamp, z } from '../core/util';
import { aptOf, has } from '../core/attrs';
import { PITCH_DEFS } from '../data/pitches';
import * as AI from './ai';
import { hotZones, locOf, nearZone, pickoffSkill, pitchQuality, rangeCenter, sampleLanding, spreadOf, swingOutcome, type Loc, type PitcherNow, type Rng, type Spread } from './pitching';
import { batterHunt, coachThrow, leadFor, mindSpreads, pickOpt, pitcherMind, type Mind } from './brain';

/** 比赛用全局随机数（LiveGame 会把它换成比赛自己的状态） */
const RNG: Rng = { rand, gauss };

/** 玩家（或教练）这一球的打击指令：狙哪一格（-1 不挥棒）、各垒跑者提前跑不跑 */
export interface SwingCall {
  z: number;
  run: [boolean, boolean, boolean];
  /** 玩家按了「挥棒」：一定挥，朝着挥棒范围（好球带 9×9 里的 3×3，c 是中心格的列、行 1..7） */
  commit?: boolean;
  c?: [number, number];
}

/** 玩家（或教练）这一球的投球指令：球种与瞄准点（好球带坐标） */
export interface ThrowCall {
  type: PitchType | 'FB';
  x: number;
  y: number;
}

/** 一球的位置相对打者的分类（x>0 是一垒侧；右打者站三垒侧，内角在 x<0） */
export function spotOf(x: number, y: number, side: 'R' | 'L'): PitchSpot {
  const inside = side === 'R' ? -x : x;
  return {
    hz: inside > 0.33 ? 'in' : inside < -0.33 ? 'out' : 'mid',
    vz: y > 0.33 ? 'high' : y < -0.33 ? 'low' : 'mid',
  };
}

/** 直球系（四缝线、二缝线、卡特、伸卡、内飘）算「直球」，其余算「变化球」 */
export function famOf(t: PitchType | 'FB'): 'FB' | 'BR' {
  return t === 'FB' || PITCH_DEFS[t]?.family === 'fast' ? 'FB' : 'BR';
}

export function spotIn(spot: PitchSpot, zone: Zone): boolean {
  return zone === 'in' || zone === 'out' ? spot.hz === zone : spot.vz === zone;
}

/** 打席开始时各项打者成绩的快照（用来判定这个打席的结果） */
type BoxSnap = { h: number; d: number; t: number; hr: number; bb: number; hbp: number; so: number; sac: number; sf: number; e: number; ab: number };

const EMPTY_USE = (): PitchUse => ({ n: 0, fb: 0, br: 0, in: 0, out: 0, high: 0, low: 0, two: {}, twoN: 0, tn: {}, rt: {}, rz: new Array<number>(9).fill(0), tw: 0 });

/** 记下一球（旧的分量按 decay 打折）：越近的球分量越重 */
function rememberPitch(o: SeenPitches, type: string, zone: number, decay: number): void {
  for (const k of Object.keys(o.rt)) o.rt[k] *= decay;
  for (let i = 0; i < 9; i++) o.rz[i] *= decay;
  o.tw = o.tw * decay + 1;
  o.rt[type] = (o.rt[type] ?? 0) + 1;
  o.rz[zone] += 1;
}

export class TeamState {
  s: TeamSetup;
  side: 0 | 1;
  roster = new Map<number, Player>();
  order: number[];
  slotPos: (Pos | 'DH')[];
  pitcher: number;
  used = new Set<number>();
  appeared = new Set<number>();
  starters = new Set<number>();
  batIdx = 0;
  runs = 0;
  hits = 0;
  errors = 0;
  line: number[] = [];
  bat = new Map<number, BoxBat>();
  pit = new Map<number, BoxPit>();
  pitchers: number[] = [];
  visits: number;
  energy = new Map<number, number>();
  pool = new Map<number, number>();
  rattle = 0;
  /** 投手的信心 0..1（三振、尤其是连续三振会涨，被打、保送会跌）；kRun：连续三振数 */
  conf = 0;
  kRun = 0;
  tactic: OffTactic = 'auto';
  def: DefTactic = { approach: 'normal', align: 'normal', ibb: false, pitchout: false };
  auto: boolean;
  halfRuns = 0; // 本半局失分（作为守方）
  /** 进攻方：跑垒积极度 -1 稳健 / 0 普通 / 1 积极 */
  runAgg = 0;
  /** 守方：注意跑者（快速投球） */
  hold = false;
  /** 玩家一方：下一球的投球指令 / 打击指令（用一次就收回；没有就交给教练） */
  callNext: ThrowCall | null = null;
  swingNext: SwingCall | null = null;

  constructor(s: TeamSetup, side: 0 | 1, rules: MatchRules) {
    this.s = s;
    this.side = side;
    for (const p of s.players) this.roster.set(p.id, p);
    this.auto = !s.human;
    this.visits = rules.moundVisits;
    this.pitcher = s.defense.P!;
    const posOf = new Map<number, Pos>();
    for (const [pos, id] of Object.entries(s.defense)) if (id !== undefined) posOf.set(id, pos as Pos);
    this.order = s.order.slice(0, 9);
    this.slotPos = this.order.map((id) => posOf.get(id) ?? 'DH');
  }

  get(pid: number): Player {
    return this.roster.get(pid)!;
  }

  fielder(pos: Pos): Player {
    if (pos === 'P') return this.get(this.pitcher);
    const i = this.slotPos.indexOf(pos);
    if (i >= 0) return this.get(this.order[i]);
    return this.get(this.pitcher);
  }

  bbox(pid: number): BoxBat {
    let b = this.bat.get(pid);
    if (!b) {
      b = { pid, pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sb: 0, cs: 0, sac: 0, sf: 0, e: 0, seq: [] };
      this.bat.set(pid, b);
    }
    return b;
  }

  pbox(pid: number): BoxPit {
    let b = this.pit.get(pid);
    if (!b) {
      b = { pid, outs: 0, h: 0, r: 0, er: 0, bb: 0, so: 0, hr: 0, np: 0, bf: 0, start: false };
      this.pit.set(pid, b);
    }
    return b;
  }

  ensurePool(pid: number): void {
    if (this.pool.has(pid)) return;
    const p = this.get(pid);
    const pool = (55 + 1.25 * p.a.stamina) * (1 - p.fatigue / 160) * (has(p, 'recovery') ? 1.04 : 1) * (has(p, 'stamina2') ? 1.08 : 1);
    this.pool.set(pid, pool);
    this.energy.set(pid, pool);
  }

  fatigueRatio(pid: number): number {
    this.ensurePool(pid);
    return 1 - this.energy.get(pid)! / this.pool.get(pid)!;
  }

  /** 可出场的替补 */
  bench(): Player[] {
    const inGame = new Set([...this.order, this.pitcher]);
    return this.s.players.filter((p) => !inGame.has(p.id) && !this.used.has(p.id));
  }

  pitcherSlot(): number {
    return this.slotPos.indexOf('P');
  }

  posOf(pid: number): Pos | 'DH' | null {
    if (pid === this.pitcher) return 'P';
    const i = this.order.indexOf(pid);
    return i >= 0 ? this.slotPos[i] : null;
  }
}

const FIELD_NAME: Record<Pos, string> = { P: '投手', C: '捕手', '1B': '一垒手', '2B': '二垒手', '3B': '三垒手', SS: '游击手', LF: '左外野手', CF: '中外野手', RF: '右外野手' };
const DP_CODE: Partial<Record<Pos, string>> = { P: '1-6-3', '1B': '3-6-3', '2B': '4-6-3', SS: '6-4-3', '3B': '5-4-3' };
const SEQ_GB: Partial<Record<Pos, string>> = { P: '投滚', C: '捕滚', '1B': '一滚', '2B': '二滚', '3B': '三滚', SS: '游滚' };
const SEQ_OF: Partial<Record<Pos, string>> = { LF: '左', CF: '中', RF: '右' };

export function nm(p: Player): string {
  return p.fam;
}

export class Match {
  rules: MatchRules;
  T: [TeamState, TeamState];
  inning = 1;
  half: 0 | 1 = 0;
  outs = 0;
  balls = 0;
  strikes = 0;
  bases: (RunnerSlot | null)[] = [null, null, null];
  over = false;
  winner: 0 | 1 = 0;
  called = false;
  log: PlayEvent[] = [];
  highlights: string[] = [];
  needPA = true;
  needHalf = true;
  stealers: number[] = [];
  private leadPenalty = 0;
  private leader: -1 | 0 | 1 = -1;
  private candW: [number | null, number | null] = [null, null];
  private candL: [number | null, number | null] = [null, null];
  private out: PlayEvent[] = [];
  lastPitch: PitchInfo | null = null;
  momentum = 0; // 当前进攻方的气势（甲子园的魔物）
  /** 这场比赛所有打席的记录 */
  memo: PAMemo[] = [];
  /** 每个投手的用球统计 */
  use = new Map<number, PitchUse>();
  /** 每个打者看过每个投手的配球（键：投手-打者） */
  seen = new Map<string, SeenPitches>();
  /** 第几个打席（从 0 开始，打完一个加一） */
  paNo = 0;
  private paSnap: BoxSnap | null = null;
  private paBat = -1;
  private paPit = -1;
  private paNp = 0;
  /** 本打席投过的球种（同一球种连投会被打者看准） */
  private paTypes: (PitchType | 'FB')[] = [];
  /** 本打席牵制次数 */
  private pickoffs = 0;
  private lastSpot: PitchSpot | null = null;
  private lastSide: 'R' | 'L' = 'R';
  /** 这一球之前已经定好（AI 的打算、跑者的离垒）；投完一球就作废 */
  pitchReady = false;
  /** AI 守方这一球的打算（玩家打击时看到的热区图）与每个打算的散布 */
  mind: Mind | null = null;
  mindSp: Spread[] | null = null;
  /** 玩家（或教练）投球时，AI 打者看不到真正的打算：按一般投手在这个局面会怎么配球去猜 */
  readMind: Mind | null = null;
  readSp: Spread[] | null = null;
  /** AI 攻方这一球各垒跑者的离垒（玩家投球时看到的离垒警告）和真正要跑的跑者 */
  leads: ('big' | 'normal' | null)[] = [null, null, null];
  goAI: boolean[] = [false, false, false];

  constructor(away: TeamSetup, home: TeamSetup, rules: MatchRules) {
    this.rules = rules;
    this.T = [new TeamState(away, 0, rules), new TeamState(home, 1, rules)];
    for (const t of this.T) {
      for (const pid of t.order) {
        t.appeared.add(pid);
        t.starters.add(pid);
      }
      t.appeared.add(t.pitcher);
      t.pitchers.push(t.pitcher);
      t.pbox(t.pitcher).start = true;
      t.ensurePool(t.pitcher);
    }
  }

  get off(): TeamState {
    return this.T[this.half];
  }
  get dfn(): TeamState {
    return this.T[(1 - this.half) as 0 | 1];
  }

  batter(): Player {
    const t = this.off;
    return t.get(t.order[t.batIdx]);
  }
  pitcher(): Player {
    const t = this.dfn;
    return t.get(t.pitcher);
  }
  onDeck(n = 1): Player {
    const t = this.off;
    return t.get(t.order[(t.batIdx + n) % 9]);
  }

  snap(): Snap {
    return {
      inning: this.inning,
      half: this.half,
      outs: this.outs,
      balls: this.balls,
      strikes: this.strikes,
      bases: this.bases.map((b) => (b ? b.pid : null)),
      score: [this.T[0].runs, this.T[1].runs],
    };
  }

  scoreDiffFor(side: 0 | 1): number {
    return this.T[side].runs - this.T[(1 - side) as 0 | 1].runs;
  }

  weeklyPitches(t: TeamState, pid: number): number {
    return t.get(pid).pitchesWeek + (t.pit.get(pid)?.np ?? 0);
  }

  risp(): boolean {
    return !!(this.bases[1] || this.bases[2]);
  }

  isKeyMoment(): boolean {
    const diff = Math.abs(this.T[0].runs - this.T[1].runs);
    if (this.inning >= 7 && diff <= 2 && (this.risp() || this.outs === 2)) return true;
    return this.risp() && diff <= 1;
  }

  // ======================= 公开推进接口 =======================
  /** 准备下一打席（触发换局、AI 换人与战术），不投球 */
  prepare(): PlayEvent[] {
    this.out = [];
    if (this.over) return this.flush();
    if (this.needHalf) this.startHalf();
    if (!this.over && this.needPA) {
      this.startPA();
      // AI 决定敬远：打席一开始就申告，不让玩家白选一球
      if (!this.over && !this.needPA && this.dfn.def.ibb) {
        this.dfn.def.ibb = false;
        this.walkIntentional();
      }
    }
    if (!this.over && !this.needPA && !this.needHalf) this.prepPitch();
    return this.flush();
  }

  /** 申告敬远（玩家）：不投球，直接保送打者 */
  intentionalWalk(): PlayEvent[] {
    this.out = [];
    if (this.over || this.needHalf || this.needPA) return this.out;
    this.walkIntentional();
    return this.flush();
  }

  private walkIntentional(): void {
    const b = this.batter();
    this.emit('ibb', `${this.dfn.s.short}申告敬远，${nm(b)}被故意保送。`);
    this.walk(b, true);
  }

  /** 投手的动摇程度（有效值）：被连续打、保送会动摇（控球、球威下降），抓到出局慢慢平复；沉着、「临危不乱」的人影响小 */
  rattleNow(p: Player = this.pitcher()): number {
    const comp = has(p, 'composed') ? 0.35 : 1;
    return this.dfn.rattle * comp * (1.25 - p.a.mental / 100);
  }

  /** 投手的心态 -1..1：正的是有信心（连续三振越来越有气势），负的是动摇 */
  moodNow(p: Player = this.pitcher()): number {
    return clamp(this.dfn.conf - this.rattleNow(p), -1, 1);
  }

  step(): PlayEvent[] {
    this.out = [];
    if (this.over) return this.out;
    if (this.needHalf) this.startHalf();
    if (this.over) return this.flush();
    if (this.needPA) this.startPA();
    if (this.over) return this.flush();
    this.pitchOnce();
    return this.flush();
  }

  stepPA(): PlayEvent[] {
    const all: PlayEvent[] = [];
    let guard = 0;
    do {
      all.push(...this.step());
    } while (!this.needPA && !this.over && guard++ < 60);
    return all;
  }

  stepHalf(): PlayEvent[] {
    const all: PlayEvent[] = [];
    const key = `${this.inning}-${this.half}`;
    let guard = 0;
    do {
      all.push(...this.stepPA());
    } while (!this.over && `${this.inning}-${this.half}` === key && guard++ < 80);
    return all;
  }

  toEnd(): PlayEvent[] {
    const all: PlayEvent[] = [];
    let guard = 0;
    while (!this.over && guard++ < 3000) all.push(...this.stepPA());
    if (!this.over) this.finish();
    return all;
  }

  private flush(): PlayEvent[] {
    const o = this.out;
    this.out = [];
    return o;
  }

  emit(k: EventKind, text: string, extra: Partial<PlayEvent> = {}): PlayEvent {
    const e: PlayEvent = { k, text, side: this.half, ...extra };
    e.snap = this.snap();
    this.log.push(e);
    this.out.push(e);
    return e;
  }

  private lastEv(): PlayEvent | undefined {
    return this.out[this.out.length - 1];
  }

  /** 更新最后一个事件的跑者移动与快照 */
  private patchLast(moves: RunnerMove[], runs: number): void {
    const e = this.lastEv();
    if (!e) return;
    e.moves = moves;
    e.runs = (e.runs ?? 0) + runs;
    if (runs) e.big = true;
    e.snap = this.snap();
  }

  // ======================= 换人（人类 & AI 共用） =======================
  pinchHit(t: TeamState, slot: number, pid: number): boolean {
    const p = t.get(pid);
    if (!p || t.used.has(pid) || t.order.includes(pid) || pid === t.pitcher) return false;
    const old = t.get(t.order[slot]);
    t.used.add(old.id);
    t.order[slot] = pid;
    t.appeared.add(pid);
    this.emit('sub', `${t.s.short}代打：${nm(p)}（替换${nm(old)}）`, { side: t.side });
    return true;
  }

  pinchRun(t: TeamState, base: number, pid: number): boolean {
    const r = this.bases[base];
    const p = t.get(pid);
    if (!r || !p || t.used.has(pid) || t.order.includes(pid) || pid === t.pitcher) return false;
    const slot = t.order.indexOf(r.pid);
    if (slot < 0) return false;
    const old = t.get(r.pid);
    t.used.add(old.id);
    t.order[slot] = pid;
    t.appeared.add(pid);
    this.bases[base] = { ...r, pid };
    this.emit('sub', `${t.s.short}代跑：${nm(p)}（替换${['一', '二', '三'][base]}垒跑者${nm(old)}）`, { side: t.side });
    return true;
  }

  changePitcher(t: TeamState, pid: number): boolean {
    const p = t.get(pid);
    if (!p || t.used.has(pid) || pid === t.pitcher || t.order.includes(pid)) return false;
    const old = t.get(t.pitcher);
    const ps = t.pitcherSlot();
    if (ps >= 0 && t.order[ps] === old.id) t.order[ps] = pid;
    t.used.add(old.id);
    t.pitcher = pid;
    t.appeared.add(pid);
    t.pitchers.push(pid);
    t.ensurePool(pid);
    t.rattle = 0;
    t.conf = 0;
    t.kRun = 0;
    t.halfRuns = 0;
    this.emit('pitcher', `${t.s.short}更换投手：${nm(old)} → ${nm(p)}`, { side: (1 - t.side) as 0 | 1 });
    return true;
  }

  defensiveSub(t: TeamState, pos: Pos, pid: number): boolean {
    if (pos === 'P') return this.changePitcher(t, pid);
    const p = t.get(pid);
    if (!p || t.used.has(pid) || t.order.includes(pid) || pid === t.pitcher) return false;
    const slot = t.slotPos.indexOf(pos);
    if (slot < 0) return false;
    const old = t.get(t.order[slot]);
    t.used.add(old.id);
    t.order[slot] = pid;
    t.appeared.add(pid);
    this.emit('sub', `${t.s.short}守备调整：${POS_NAME[pos]} ${nm(old)} → ${nm(p)}`, { side: (1 - t.side) as 0 | 1 });
    return true;
  }

  /** 交换两名场上野手的守备位置 */
  swapPositions(t: TeamState, a: number, b: number): boolean {
    const ia = t.order.indexOf(a);
    const ib = t.order.indexOf(b);
    if (ia < 0 || ib < 0) return false;
    const pa = t.slotPos[ia];
    const pb = t.slotPos[ib];
    if (pa === 'P' || pb === 'P' || pa === 'DH' || pb === 'DH') return false;
    t.slotPos[ia] = pb;
    t.slotPos[ib] = pa;
    return true;
  }

  /** 供界面调用：执行一个指令并返回其产生的事件 */
  ui(fn: () => unknown): PlayEvent[] {
    this.out = [];
    fn();
    return this.flush();
  }

  /** 执行一个操作，返回操作的结果和它产生的事件 */
  act<T>(fn: () => T): { r: T; ev: PlayEvent[] } {
    this.out = [];
    const r = fn();
    return { r, ev: this.flush() };
  }

  /** 打席开始后有人被替换（代打 / 换投）：重新记录这个打席，并让 AI 针对新的对决重新打算 */
  rePlanPA(): void {
    if (this.needPA || this.over) return;
    const off = this.off;
    const dfn = this.dfn;
    if (dfn.auto) AI.defenseBeforePA(this, dfn);
    // 对决换了人：这一球的打算重新定
    this.pitchReady = false;
    const b = this.batter();
    const bx = off.bbox(b.id);
    this.paSnap = { h: bx.h, d: bx.d, t: bx.t, hr: bx.hr, bb: bx.bb, hbp: bx.hbp, so: bx.so, sac: bx.sac, sf: bx.sf, e: off.errors, ab: bx.ab };
    this.paBat = b.id;
    this.paPit = dfn.pitcher;
  }

  moundVisit(t: TeamState): boolean {
    if (t.visits <= 0) return false;
    t.visits--;
    t.rattle = Math.max(0, t.rattle - 0.45);
    const p = t.get(t.pitcher);
    this.emit('visit', `${t.s.short}请求暂停，传令员跑向投手丘。${nm(p)}深呼吸调整。（剩余${t.visits}次）`, { side: (1 - t.side) as 0 | 1 });
    return true;
  }

  /** 这个打席还能牵制几次（每个打席最多 3 次） */
  pickoffsLeft(): number {
    if (this.over || !this.bases.some(Boolean) || this.needPA) return 0;
    return Math.max(0, 3 - this.pickoffs);
  }

  /** 牵制 idx 垒（0 一垒、1 二垒、2 三垒；不给就牵制领先的跑者） */
  pickoff(idx = -1): PlayEvent[] {
    this.out = [];
    if (idx < 0) idx = this.bases[1] && !this.bases[2] ? 1 : this.bases[0] ? 0 : this.bases[1] ? 1 : this.bases[2] ? 2 : -1;
    this.doPickoff(idx, false);
    return this.flush();
  }

  /**
   * 牵制：投手的牵制能力越高、跑者离垒越大、跑者本来就打算跑，越容易抓到；离垒正常的跑者很难抓。
   * read：AI 投手看穿了玩家的跑者要跑。同一个打席里牵制得越多越没有效果。
   */
  private doPickoff(idx: number, read: boolean): void {
    const t = this.dfn;
    const p = t.get(t.pitcher);
    if (idx < 0 || !this.bases[idx] || this.over || this.pickoffs >= 3) return;
    this.pickoffs++;
    const r = this.off.get(this.bases[idx]!.pid);
    const big = read || this.leads[idx] === 'big';
    const going = read || !!this.goAI[idx];
    const pk = pickoffSkill(p);
    const pOut = ((0.03 + (0.22 * pk) / 100) * (big ? (going ? 2.2 : 1.3) : 0.45) * (1 - 0.35 * z(r.a.baserun))) / Math.sqrt(this.pickoffs);
    if (chance(0.006 + 0.004 * this.pickoffs)) {
      this.emit('pickoff', `牵制球暴传！${nm(r)}趁机推进！`);
      this.advanceRunnersBy(1, true);
      return;
    }
    if (chance(clamp(pOut, 0.005, 0.6))) {
      this.bases[idx] = null;
      this.outs++;
      t.pbox(t.pitcher).outs++;
      this.emit('pickoff', `牵制出局！${nm(p)}的牵制球让${nm(r)}来不及回垒！`, { big: true, moves: [{ pid: r.id, from: idx + 1, to: idx + 1, out: true }] });
      t.rattle = Math.max(0, t.rattle - 0.1);
      if (this.outs >= 3) this.endHalf(false);
    } else {
      this.leadPenalty = Math.min(0.14, this.leadPenalty + 0.06);
      // 被牵制过的跑者收小离垒，原本想跑的也可能打消念头
      this.leads[idx] = this.leads[idx] ? 'normal' : null;
      if (this.goAI[idx] && chance(0.6)) this.goAI[idx] = false;
      this.emit('pickoff', `${nm(p)}投出牵制球，${nm(r)}安全回垒。`);
    }
  }

  // ======================= 半局 / 打席 =======================
  private startHalf(): void {
    this.needHalf = false;
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [null, null, null];
    this.momentum = 0;
    this.pitchReady = false;
    this.leads = [null, null, null];
    const off = this.off;
    const dfn = this.dfn;
    off.line[this.inning - 1] = off.line[this.inning - 1] ?? 0;
    dfn.rattle *= 0.5;
    dfn.conf *= 0.7;
    dfn.halfRuns = 0;
    this.fixDefense(dfn);
    if (dfn.auto) AI.betweenInnings(this, dfn);
    this.emit('half', `${this.inning}局${this.half ? '下' : '上'}　${off.s.short}的进攻`);
    // 甲子园的魔物
    const diff = this.scoreDiffFor(this.half);
    if (this.rules.koshien && this.inning >= 7 && diff < 0 && diff >= -4 && chance(0.1 + off.s.crowd * 0.08)) {
      this.momentum = 0.25;
      this.emit('info', `甲子园的魔物苏醒了！阿尔卑斯看台的应援声震耳欲聋，${off.s.short}的气势高涨！`, { big: true });
    }
    if (this.inning >= this.rules.tiebreakFrom) {
      const n = off.order.length;
      const r1 = off.order[(off.batIdx + n - 1) % n];
      const r2 = off.order[(off.batIdx + n - 2) % n];
      this.bases[0] = { pid: r1, resp: dfn.pitcher, unearned: true };
      this.bases[1] = { pid: r2, resp: dfn.pitcher, unearned: true };
      this.emit('info', `【抢分决胜】无人出局，一、二垒有人开始（${nm(off.get(r2))}、${nm(off.get(r1))}）`);
    }
  }

  /** 代打/代跑后，守备时补全位置；为投手代打后需换投 */
  fixDefense(t: TeamState): void {
    const ps = t.pitcherSlot();
    if (ps >= 0 && t.order[ps] !== t.pitcher) {
      const ph = t.order[ps];
      const rel = AI.pickReliever(this, t);
      if (rel !== null) {
        t.order[ps] = rel;
        t.used.add(ph);
        t.pitcher = rel;
        t.appeared.add(rel);
        t.pitchers.push(rel);
        t.ensurePool(rel);
        t.rattle = 0;
        t.conf = 0;
        t.kRun = 0;
        this.emit('pitcher', `${t.s.short}更换投手：${nm(t.get(rel))}登板`, { side: (1 - t.side) as 0 | 1 });
      } else {
        t.pitcher = ph;
        t.pitchers.push(ph);
        t.ensurePool(ph);
      }
    }
    if (!t.auto) return;
    for (let i = 0; i < 9; i++) {
      const pos = t.slotPos[i];
      if (pos === 'DH' || pos === 'P') continue;
      const p = t.get(t.order[i]);
      if (t.starters.has(p.id)) continue;
      if (aptOf(p, pos) < 45) {
        const sub = AI.bestBenchFor(this, t, pos);
        if (sub !== null && aptOf(t.get(sub), pos) >= 55) {
          t.used.add(p.id);
          t.order[i] = sub;
          t.appeared.add(sub);
          this.emit('sub', `${t.s.short}守备调整：${POS_NAME[pos]}由${nm(t.get(sub))}担任`, { side: (1 - t.side) as 0 | 1 });
        }
      }
    }
  }

  private startPA(): void {
    this.needPA = false;
    this.balls = 0;
    this.strikes = 0;
    this.stealers = [];
    this.leadPenalty = 0;
    const off = this.off;
    const dfn = this.dfn;
    if (this.weeklyPitches(dfn, dfn.pitcher) >= this.rules.pitchLimit) {
      const rel = AI.pickReliever(this, dfn);
      if (rel !== null) {
        this.emit('info', `${nm(dfn.get(dfn.pitcher))}达到一周${this.rules.pitchLimit}球的用球数限制，必须退场。`);
        this.changePitcher(dfn, rel);
      }
    }
    if (dfn.auto) AI.defenseBeforePA(this, dfn);
    if (off.auto) AI.offenseBeforePA(this, off, false);
    this.pitchReady = false;
    this.leads = [null, null, null];
    const b = this.batter();
    const bx = off.bbox(b.id);
    this.paSnap = { h: bx.h, d: bx.d, t: bx.t, hr: bx.hr, bb: bx.bb, hbp: bx.hbp, so: bx.so, sac: bx.sac, sf: bx.sf, e: off.errors, ab: bx.ab };
    this.paBat = b.id;
    this.paPit = dfn.pitcher;
    this.paNp = 0;
    this.paTypes = [];
    this.lastSpot = null;
    this.pickoffs = 0;
    // AI 投手看到快腿跑者，偶尔会牵制
    if (dfn.auto && this.bases[0] && !this.bases[1] && this.outs < 2) {
      const r = off.get(this.bases[0].pid);
      if (r.a.speed >= 60 && chance(0.12 + (has(r, 'steal') ? 0.08 : 0))) this.doPickoff(0, false);
    }
  }

  /** 某投手的用球统计 */
  useOf(pid: number): PitchUse {
    let u = this.use.get(pid);
    if (!u) {
      u = EMPTY_USE();
      this.use.set(pid, u);
    }
    return u;
  }

  /**
   * 打者从这场比赛里学到的：这个球种、这个位置最近出现得多不多（0..1）。
   * 板凳上看到的算一半、自己打席里看到的全算；看得越多、选球眼越好越有把握。
   */
  familiar(pid: number, b: Player, type: string, zone: number): { ft: number; fz: number } {
    const u = this.useOf(pid);
    const sv = this.seen.get(`${pid}-${b.id}`);
    const w0 = u.tw * 0.5 + (sv?.tw ?? 0);
    if (w0 < 3) return { ft: 0, fz: 0 };
    const conf = clamp((w0 - 3) / 12, 0, 1) * (0.6 + 0.6 * clamp(b.a.eye / 100, 0, 1));
    const ft = (((u.rt[type] ?? 0) * 0.5 + (sv?.rt[type] ?? 0)) / w0) * conf;
    const fz = ((u.rz[zone] * 0.5 + (sv?.rz[zone] ?? 0)) / w0) * conf;
    return { ft: Math.min(1, ft), fz: Math.min(1, fz) };
  }

  /** 打者学到的这个投手的落点分布（九宫格的比例）和把握 L（0..0.6）：狙哪一格时参考 */
  learnedZones(pid: number, b: Player): { z: number[]; L: number } | null {
    const u = this.useOf(pid);
    const sv = this.seen.get(`${pid}-${b.id}`);
    const w0 = u.tw * 0.5 + (sv?.tw ?? 0);
    if (w0 < 3) return null;
    const z = u.rz.map((v, i) => (v * 0.5 + (sv?.rz[i] ?? 0)) / w0);
    return { z, L: clamp((w0 - 3) / 12, 0, 1) * (0.25 + 0.35 * clamp(b.a.eye / 100, 0, 1)) };
  }

  /** 投手今天的配球（给玩家看）：各球种的比例（多的在前）、偏内外角（+ 是外角多）、偏高低（+ 是高球多） */
  tendency(pid: number, bats: 'R' | 'L'): { n: number; types: [string, number][]; side: number; height: number } {
    const u = this.useOf(pid);
    const n = Math.max(1, u.n);
    const types = Object.entries(u.tn)
      .map(([t, c]) => [t, c / n] as [string, number])
      .sort((a, c) => c[1] - a[1]);
    void bats;
    return { n: u.n, types, side: (u.out - u.in) / n, height: (u.high - u.low) / n };
  }

  /** 这个打者本场之前面对这个投手的打席数 */
  timesFaced(bid: number, pid: number): number {
    let n = 0;
    for (const m of this.memo) if (m.bat === bid && m.pit === pid) n++;
    return n;
  }

  /** 打席结束：分类结果并记下来 */
  private recordPA(): void {
    const snap = this.paSnap;
    if (!snap || this.paBat < 0) return;
    const off = this.off;
    const bx = off.bbox(this.paBat);
    let res: PAResult = 'OUT';
    const last = bx.seq[bx.seq.length - 1] ?? '';
    if (bx.hr > snap.hr) res = 'HR';
    else if (bx.t > snap.t) res = '3B';
    else if (bx.d > snap.d) res = '2B';
    else if (bx.h > snap.h) res = '1B';
    else if (bx.so > snap.so) res = 'K';
    else if (bx.bb > snap.bb) res = last === '敬远' ? 'IBB' : 'BB';
    else if (bx.hbp > snap.hbp) res = 'HBP';
    else if (bx.sac > snap.sac) res = 'SAC';
    else if (bx.sf > snap.sf) res = 'SF';
    else if (last === '失误') res = 'E';
    else if (last === '野选') res = 'FC';
    else if (last === '双杀') res = 'DP';
    else if (bx.ab === snap.ab) {
      // 跑者出局导致打席延续到下一局：不记
      this.paSnap = null;
      return;
    }
    const lp = this.lastPitch;
    const memo: PAMemo = {
      no: this.paNo,
      side: off.side,
      bat: this.paBat,
      pit: this.paPit,
      inning: this.inning,
      res,
      np: this.paNp,
      last: lp && this.lastSpot ? { t: lp.type, fam: famOf(lp.type), spot: this.lastSpot, res: lp.res } : null,
      cmd: null,
      plan: null,
    };
    this.memo.push(memo);
    this.paSnap = null;
    this.moodAfterPA(res);
  }

  /** 打席结束后投手的心态：三振（连续的更多）给信心，被打、保送打击信心 */
  private moodAfterPA(res: PAResult): void {
    const t = this.dfn;
    if (t.pitcher !== this.paPit) return;
    if (res === 'K') {
      t.kRun++;
      t.conf = clamp(t.conf + 0.1 + 0.08 * Math.min(3, t.kRun - 1), 0, 1);
      if (t.kRun === 3) this.emit('info', `${nm(t.get(t.pitcher))}连续三个三振，越投越有气势！`);
      return;
    }
    t.kRun = 0;
    if (res === 'HR') t.conf = Math.max(0, t.conf - 0.4);
    else if (res === '1B' || res === '2B' || res === '3B') t.conf = Math.max(0, t.conf - 0.2);
    else if (res === 'BB' || res === 'HBP' || res === 'E') t.conf = Math.max(0, t.conf - 0.12);
  }

  /** 打席结束：轮到下一棒 */
  private endPA(): void {
    const off = this.off;
    this.recordPA();
    this.paNo++;
    off.batIdx = (off.batIdx + 1) % 9;
    this.needPA = true;
    off.tactic = 'auto';
    off.runAgg = 0;
    off.swingNext = null;
    this.dfn.callNext = null;
    this.dfn.def.ibb = false;
    this.dfn.def.pitchout = false;
    this.dfn.hold = false;
    this.pitchReady = false;
    this.mind = null;
    this.leads = [null, null, null];
    if (this.outs >= 3 && !this.over) this.endHalf(true);
  }

  private endHalf(_paDone: boolean): void {
    const a = this.T[0].runs;
    const h = this.T[1].runs;
    this.needPA = true;
    this.off.tactic = 'auto';
    const mercyMargin = this.rules.mercy ? (this.inning >= 7 ? 7 : this.inning >= 5 ? 10 : 99) : 99;
    if (this.half === 0) {
      if (this.inning >= this.rules.innings && h > a) return this.finish();
      if (h - a >= mercyMargin) return this.finish(true);
      this.half = 1;
      this.needHalf = true;
    } else {
      if (this.inning >= this.rules.innings && a !== h) return this.finish();
      if (Math.abs(a - h) >= mercyMargin) return this.finish(true);
      if (this.inning >= this.rules.maxInnings) {
        // 安全阀（抢分决胜下几乎不会发生）：按安打数判定，记入最后一局
        const w = this.T[1].hits >= this.T[0].hits ? 1 : 0;
        this.T[w].runs++;
        this.T[w].line[this.inning - 1] = (this.T[w].line[this.inning - 1] ?? 0) + 1;
        return this.finish();
      }
      this.inning++;
      this.half = 0;
      this.needHalf = true;
    }
  }

  private checkWalkoff(): boolean {
    if (this.half !== 1 || this.over) return false;
    const a = this.T[0].runs;
    const h = this.T[1].runs;
    if (this.inning >= this.rules.innings && h > a) {
      this.emit('info', `再见！${this.T[1].s.short}再见胜利！！`, { big: true });
      this.highlights.push(`${this.inning}局下 ${this.T[1].s.short}再见胜利`);
      this.finish();
      return true;
    }
    if (this.rules.mercy && this.inning >= 5 && h - a >= (this.inning >= 7 ? 7 : 10)) {
      this.finish(true);
      return true;
    }
    return false;
  }

  finish(called = false): void {
    if (this.over) return;
    this.over = true;
    this.called = called;
    this.needPA = true;
    this.winner = this.T[1].runs > this.T[0].runs ? 1 : 0;
    const w = this.winner;
    const l = (1 - w) as 0 | 1;
    this.candW[w] = this.candW[w] ?? this.T[w].pitchers[0];
    this.candL[l] = this.candL[l] ?? this.T[l].pitchers[0];
    this.emit('end', `比赛结束！${this.T[w].s.short} ${this.T[w].runs} - ${this.T[l].runs} ${this.T[l].s.short}${called ? '（提前结束）' : ''}`, { big: true });
  }

  // ======================= 计分 =======================
  /**
   * 跑者得分。最终局以后的后攻一旦超前，致胜分回到本垒时比赛即结束，
   * 同一个打球中后面的跑者不再计分（本垒打除外）。返回是否计分。
   */
  private scoreRun(r: RunnerSlot, batterId: number | null, homeRun = false): boolean {
    const off = this.off;
    const dfn = this.dfn;
    if (!homeRun && this.half === 1 && this.inning >= this.rules.innings && this.T[1].runs > this.T[0].runs) return false;
    off.runs++;
    off.line[this.inning - 1] = (off.line[this.inning - 1] ?? 0) + 1;
    off.bbox(r.pid).r++;
    if (batterId !== null) off.bbox(batterId).rbi++;
    const pb = dfn.pbox(r.resp);
    pb.r++;
    if (!r.unearned) pb.er++;
    dfn.halfRuns++;
    dfn.rattle = clamp(dfn.rattle + 0.15, 0, 1);
    const diff = this.T[0].runs - this.T[1].runs;
    const lead: -1 | 0 | 1 = diff > 0 ? 0 : diff < 0 ? 1 : -1;
    if (lead !== this.leader) {
      if (lead >= 0) {
        const L = lead as 0 | 1;
        this.candW[L] = this.T[L].pitcher;
        this.candL[(1 - L) as 0 | 1] = r.resp;
      }
      this.leader = lead;
    }
    return true;
  }

  // ======================= 有效能力 =======================
  batterEff(b: Player, p: Player): { con: number; pow: number; eye: number; side: 'R' | 'L' } {
    const off = this.off;
    let con = b.a.contact;
    let pow = b.a.power;
    let eye = b.a.eye;
    const c = b.cond * 2.5;
    con += c;
    pow += c;
    if (b.fatigue > 55) {
      const f = (b.fatigue - 55) * 0.2;
      con -= f;
      pow -= f;
    }
    const side: 'R' | 'L' = b.bats === 'S' ? (p.throws === 'R' ? 'L' : 'R') : (b.bats as 'R' | 'L');
    if (side === p.throws) {
      con -= 3;
      pow -= 2;
    } else {
      con += 1.5;
      pow += 1;
    }
    if (p.throws === 'L' && has(b, 'vsLHP')) {
      con += 6;
      pow += 4;
    }
    if (side === 'L' && has(p, 'vsLHB')) {
      con -= 5;
      pow -= 3;
    }
    if (this.risp()) {
      if (has(b, 'clutch')) {
        con += 7;
        pow += 5;
      }
      if (has(b, 'clutchX')) {
        con -= 7;
        pow -= 4;
      }
    }
    if (this.rules.bigGame) {
      if (has(b, 'bigStage')) {
        con += 5;
        pow += 4;
      }
      if (has(b, 'nerves')) {
        con -= 6;
        pow -= 4;
      }
      if (b.pers === 'shy') con -= 2;
    }
    if (this.inning >= 7 && this.scoreDiffFor(this.half) < 0 && has(b, 'comeback')) {
      con += 6;
      pow += 4;
    }
    if (this.balls === 0 && this.strikes === 0 && has(b, 'firstPitch')) {
      con += 5;
      pow += 4;
    }
    con += (b.morale - 60) * 0.05 + (off.s.chemistry - 50) * 0.03;
    pow += (b.morale - 60) * 0.04;
    con += this.momentum * 24;
    pow += this.momentum * 16;
    switch (off.tactic) {
      case 'contact':
        con += 7;
        pow -= 18;
        break;
      case 'power':
        con -= 9;
        pow += 9;
        break;
      case 'aggressive':
        con -= 2;
        pow += 2;
        break;
      case 'hitRun':
        con += 4;
        pow -= 12;
        break;
    }
    if (has(b, 'eyeX')) eye -= 10;
    return { con, pow, eye, side };
  }

  pitcherEff(p: Player): { vel: number; ctl: number; stuff: number; f: number } {
    const t = this.dfn;
    const f = t.fatigueRatio(p.id);
    // 体力：从第一球起一点点下降，用掉六成以后明显下降
    const over = Math.max(0, f - 0.6);
    let vel = p.a.velocity + p.cond * 0.8 - f * 1.5 - over * 14 - Math.max(0, p.fatigue - 50) * 0.06;
    let ctl = p.a.control + p.cond * 2.5 - f * 3 - over * 32;
    let stuff = p.a.stuff + p.cond * 2.5 - f * 4 - over * 22;
    // 心态：被连续打、保送会动摇，控球和球威下降；连续三振有了信心，越投越顺
    const rattle = this.rattleNow(p);
    ctl -= rattle * 22;
    stuff -= rattle * 8;
    ctl += t.conf * 8;
    stuff += t.conf * 9;
    vel += t.conf * 1.2;
    switch (t.def.approach) {
      case 'max':
        vel += 2.5;
        stuff += 5;
        ctl -= 3;
        break;
      case 'contact':
        stuff -= 4;
        ctl += 4;
        break;
      case 'careful':
        ctl -= 2;
        break;
    }
    const c = t.fielder('C');
    if (has(c, 'leader')) {
      ctl += 4;
      stuff += 3;
    }
    if (has(c, 'leaderX')) {
      ctl -= 4;
      stuff -= 3;
    }
    ctl += (c.a.catching - 50) * 0.04;
    if (this.inning <= 2 && has(p, 'slowStart')) {
      ctl -= 7;
      stuff -= 6;
      vel -= 1.5;
    }
    if (this.risp()) {
      if (has(p, 'pinch')) {
        ctl += 6;
        stuff += 5;
      }
      if (has(p, 'pinchX')) {
        ctl -= 6;
        stuff -= 5;
      }
    }
    if (this.rules.bigGame) {
      if (has(p, 'bigStage')) {
        ctl += 4;
        stuff += 4;
      }
      if (has(p, 'nerves')) {
        ctl -= 5;
        stuff -= 4;
      }
    }
    if (has(p, 'wild')) ctl -= 6;
    ctl += (p.morale - 60) * 0.04 + (t.s.chemistry - 50) * 0.02;
    return { vel, ctl, stuff, f };
  }

  // ======================= 投球 =======================
  private chargePitch(p: Player, cost: number): void {
    const t = this.dfn;
    t.ensurePool(p.id);
    t.energy.set(p.id, t.energy.get(p.id)! - cost * (1 + t.rattle * 0.15));
    t.pbox(p.id).np++;
  }

  /** 投手此刻的有效能力（疲劳、调子之后），给打算、球种质量和散布用 */
  pitcherNow(): PitcherNow {
    const pe = this.pitcherEff(this.pitcher());
    return { vel: pe.vel, ctl: pe.ctl, stuff: pe.stuff };
  }

  /**
   * 这一球之前：AI 攻方定下跑者跑不跑（决定离垒大小），AI 守方定下这一球的打算（玩家打击时看到的热区图）。
   * 用比赛的随机数，同一球只算一次（玩家下指令、牵制之后不重算）。
   */
  prepPitch(): void {
    if (this.over || this.needHalf || this.needPA || this.pitchReady) return;
    const off = this.off;
    const dfn = this.dfn;
    this.goAI = [false, false, false];
    this.leads = [null, null, null];
    if (off.auto) {
      AI.offenseBeforePitch(this, off);
      const tac = off.tactic;
      const [r1, r2, r3] = this.bases.map(Boolean);
      if ((tac === 'steal' || tac === 'hitRun') && r1 && !r2) this.goAI[0] = true;
      else if (tac === 'steal' && r2 && !r3 && !r1) this.goAI[1] = true;
      else if ((tac === 'steal' || tac === 'doubleSteal') && r1 && r2 && !r3) this.goAI = [true, true, false];
      for (let i = 0; i < 2; i++) {
        const r = this.bases[i];
        if (r) this.leads[i] = leadFor(this.goAI[i], off.get(r.pid), RNG);
      }
    }
    if (dfn.auto) {
      const now = this.pitcherNow();
      this.mind = pitcherMind(this, dfn, now, RNG);
      this.mindSp = mindSpreads(this.mind, dfn.get(dfn.pitcher), now, dfn.fatigueRatio(dfn.pitcher));
      AI.defenseBeforePitch(this, dfn);
    } else {
      this.mind = null;
      this.mindSp = null;
      if (off.auto) {
        const now = this.pitcherNow();
        this.readMind = pitcherMind(this, dfn, now, RNG);
        this.readSp = mindSpreads(this.readMind, dfn.get(dfn.pitcher), now, dfn.fatigueRatio(dfn.pitcher));
      }
    }
    this.pitchReady = true;
  }

  private pitchOnce(): void {
    if (!this.pitchReady) this.prepPitch();
    this.pitchReady = false;
    const off = this.off;
    const dfn = this.dfn;
    const b = this.batter();
    const p = this.pitcher();
    // 玩家（或替玩家拿主意的教练）这一球的指令：用一次就收回
    const human = off.auto ? null : off.swingNext;
    off.swingNext = null;
    const call = dfn.auto ? null : dfn.callNext;
    dfn.callNext = null;

    // 申告敬远（AI；逐球指挥时在打席一开始就申告了）
    if (dfn.def.ibb) {
      dfn.def.ibb = false;
      this.walkIntentional();
      return;
    }

    // 玩家让跑者提前跑：AI 投手有可能看穿，先牵制（这一球就不投了）
    if (dfn.auto && human && human.run.some(Boolean) && this.pickoffs < 3) {
      const idx = human.run[1] && this.bases[1] ? 1 : human.run[0] && this.bases[0] ? 0 : -1;
      if (idx >= 0 && chance(0.1 + (0.15 * pickoffSkill(p)) / 100 + dfn.s.mgrTactics / 1000)) {
        this.doPickoff(idx, true);
        return;
      }
    }

    let tac = off.tactic;
    if (tac === 'auto') tac = 'swing';
    // 两好球后不再牺牲触击（触击界外就是三振），改为轻打
    if (tac === 'bunt' && this.strikes === 2) {
      tac = 'contact';
      off.tactic = 'contact';
    }
    // 跑者启动：玩家按自己的指示，AI 按这一球之前定下的打算
    this.stealers = [];
    const go = human ? human.run : this.goAI;
    if (go[1] && this.bases[1] && !this.bases[2]) this.stealers.push(1);
    if (go[0] && this.bases[0] && (!this.bases[1] || this.stealers.includes(1))) this.stealers.push(0);
    // 三垒跑者提前跑：打出去就冲本垒
    const goHome = !!human?.run[2] && !!this.bases[2];
    const squeeze = tac === 'squeeze' && !!this.bases[2];
    const bunting = tac === 'bunt' || tac === 'buntHit' || squeeze;
    const hitRun = tac === 'hitRun' && this.stealers.length > 0;
    if (tac === 'steal' || tac === 'doubleSteal' || tac === 'hitRun' || tac === 'squeeze' || tac === 'buntHit') off.tactic = 'swing';

    const pe = this.pitcherEff(p);
    const be = this.batterEff(b, p);
    // 同一场里第几次面对这个投手：看得越多越有感觉
    const seen = Math.min(3, this.timesFaced(b.id, p.id));
    be.con += seen * 2;
    be.pow += seen * 1.5;
    const now: PitcherNow = { vel: pe.vel, ctl: pe.ctl, stuff: pe.stuff };

    // 这一球投什么、瞄哪里：玩家的指令 / AI 的打算 / 交给教练
    let aim: { type: PitchType | 'FB'; x: number; y: number };
    if (call) aim = call;
    else if (this.mind) aim = pickOpt(this.mind, RNG);
    else aim = coachThrow(this, dfn, now, RNG);
    const owned = aim.type === 'FB' ? null : p.pitches.find((x) => x.type === aim.type) ?? null;
    const type: PitchType | 'FB' = owned ? owned.type : 'FB';
    const sig = owned?.sig;
    const isFB = type === 'FB';
    const def = isFB ? null : PITCH_DEFS[type as PitchType];
    const kmh = Math.round(pe.vel * (isFB ? 1 : def!.speed) + gauss(0, 1.2));
    const tname = isFB ? '直球' : sig ?? def!.name;
    const fam = famOf(type);
    // 同一球种在这个打席里连续投，打者会慢慢对上时机
    let rep = 0;
    for (let i = this.paTypes.length - 1; i >= 0 && this.paTypes[i] === type; i--) rep++;
    if (rep >= 2) be.con += (rep - 1) * 3;
    this.paTypes.push(type);

    // 外角吊球（AI 识破盗垒 / 抢分）
    if (dfn.def.pitchout) {
      dfn.def.pitchout = false;
      this.chargePitch(p, 0.9);
      const info: PitchInfo = { type: 'FB', kmh: kmh - 4, x: 1.9, y: 0.2, res: 'pitchout', tx: 1.9, ty: 0.2 };
      this.lastPitch = info;
      this.balls++;
      if (squeeze) {
        const r = this.bases[2]!;
        this.bases[2] = null;
        this.outs++;
        dfn.pbox(p.id).outs++;
        this.emit('pitch', `识破抢分！外角吊球，三垒跑者${nm(off.get(r.pid))}被夹杀出局！`, { pitch: info, big: true, moves: [{ pid: r.pid, from: 3, to: 4, out: true }] });
        dfn.rattle = Math.max(0, dfn.rattle - 0.15);
      } else if (this.stealers.length) {
        this.emit('pitch', `外角吊球！${dfn.s.short}看穿了跑者的动向！`, { pitch: info });
        this.resolveSteals(true, true);
      } else {
        this.emit('pitch', `外角吊球，坏球。`, { pitch: info });
      }
      this.afterNonContact(b);
      return;
    }

    // 打者狙哪一格：投出之前就定好（看不到这一球的实际落点）
    const hunt = human ? human.z : batterHunt(this, off, this.mind ?? this.readMind, this.mindSp ?? this.readSp, RNG);

    // 球种质量与落点
    const f = dfn.fatigueRatio(p.id);
    // 这一球的质量：体力、心态都已经算在 now 里；每一球再有一点手感上的起伏
    let q = clamp(pitchQuality(p, type, now) + gauss(0, 3), 0, 100);
    if (dfn.hold && this.bases.some(Boolean)) q -= 3;
    const sp = spreadOf(type, p.throws, pe.ctl, q, f);
    if (has(p, 'wild')) sp.s *= 1.15;
    const land = sampleLanding(aim.x, aim.y, sp, RNG);
    const info: PitchInfo = { type, sig, kmh, x: land.x, y: land.y, res: 'ball', tx: aim.x, ty: aim.y, q: Math.round(q), hang: land.hang, hunt };
    const spot = spotOf(info.x, info.y, be.side);
    this.lastSpot = spot;
    this.lastSide = be.side;
    this.lastPitch = info;
    // 打者从这场比赛里学到的（这一球之前看过的）：同一个球种、同一个位置投得越多，越容易被抓住
    const zone = nearZone(info.x, info.y);
    const known = this.familiar(p.id, b, type, zone);
    // 用球统计（对手会据此调整）
    const u = this.useOf(p.id);
    u.n++;
    u.tn[type] = (u.tn[type] ?? 0) + 1;
    rememberPitch(u, type, zone, 0.93);
    const seenKey = `${p.id}-${b.id}`;
    let sv = this.seen.get(seenKey);
    if (!sv) {
      sv = { rt: {}, rz: new Array<number>(9).fill(0), tw: 0 };
      this.seen.set(seenKey, sv);
    }
    rememberPitch(sv, type, zone, 0.9);
    if (fam === 'FB') u.fb++;
    else u.br++;
    if (spot.hz === 'in') u.in++;
    else if (spot.hz === 'out') u.out++;
    if (spot.vz === 'high') u.high++;
    else if (spot.vz === 'low') u.low++;
    if (this.strikes === 2) {
      u.twoN++;
      u.two[type] = (u.two[type] ?? 0) + 1;
    }
    this.paNp++;
    this.chargePitch(p, (isFB ? 1 : 1.12) * (dfn.def.approach === 'max' ? 1.45 : dfn.def.approach === 'contact' ? 0.85 : 1) + (this.risp() ? 0.18 : 0));
    const loc = locOf(info.x, info.y);

    // 这一球的威力（打中以后、触击用）
    let nasty = q;
    if (def && (def.same ? be.side === p.throws : be.side !== p.throws)) nasty += 5;
    if (p.delivery === 'side' || p.delivery === 'under') nasty += be.side === p.throws ? 4 : -2;
    if (has(p, 'mix') && p.pitches.length >= 4) nasty += 3;
    // 被打者看熟了的球种、位置：威力打折
    nasty -= 20 * Math.max(0, known.ft - 0.3) + 12 * Math.max(0, known.fz - 0.18);

    if (bunting) {
      this.doBunt(b, p, info, loc, nasty, tac === 'buntHit', squeeze, tname);
      return;
    }

    // 挥棒：打者狙的那一格附近来球才出棒；挥空倾向高的球种、两好球后的「三振王」更难碰到
    let qSwing = nasty + (def ? (def.whiff - 1) * 12 : 0) + (this.strikes === 2 && has(p, 'kArtist') ? 7 : 0);
    if (isFB && pe.vel > 145) qSwing += (pe.vel - 145) * 0.6;
    if (isFB && spot.vz === 'high' && pe.vel > 138) qSwing += (pe.vel - 138) * 0.5 + (has(p, 'nobi') ? 4 : 0);
    if (has(b, 'kProne')) qSwing += 6;
    if (this.strikes === 2 && has(b, 'tough')) qSwing -= 5;
    qSwing -= 6 * Math.max(0, known.ft - 0.3) + 6 * Math.max(0, known.fz - 0.18);
    const out = swingOutcome(
      {
        hunt,
        force: hitRun,
        commit: !!human?.commit,
        blind: !human && !this.mind && !!this.readMind,
        balls: this.balls,
        at: human?.commit && human.c ? rangeCenter(human.c) : undefined,
        x: info.x,
        y: info.y,
        q: qSwing,
        hang: land.hang,
        breaking: !!def && def.family !== 'fast',
        con: be.con,
        eye: be.eye,
        strikes: this.strikes,
        hot: hotZones(b, be.side),
        insideSign: be.side === 'R' ? -1 : 1,
        framing: dfn.fielder('C').a.catching,
      },
      RNG,
    );
    const res: PitchResult = out.res;
    info.res = res;

    if (res === 'inplay') {
      this.ballInPlay(b, p, be, pe, nasty, loc, info, hitRun || this.stealers.length > 0 || goHome, out.solid, out.lift ?? 0);
      return;
    }
    if (res === 'hbp') {
      this.emit('pitch', `${tname}，触身球！${nm(b)}上一垒。`, { pitch: info });
      const ob = off.bbox(b.id);
      ob.hbp++;
      ob.seq.push('死球');
      dfn.pbox(p.id).bf++;
      dfn.rattle = clamp(dfn.rattle + 0.12, 0, 1);
      this.forceWalk(b);
      return;
    }

    // 暴投/捕逸判定
    let wpText = '';
    if (this.bases.some(Boolean) && res !== 'foul' && (loc === 'waste' || loc === 'shadow') && !this.stealers.length) {
      const cat = dfn.fielder('C');
      const pr = 0.011 * (def ? def.wp : 0.5) * (1 + (50 - cat.a.catching) / 50) * (has(cat, 'block') ? 0.5 : 1) * (loc === 'waste' ? 1.4 : 1);
      if (chance(pr)) wpText = chance(0.6) ? '暴投' : '捕逸';
    }
    switch (res) {
      case 'ball':
        this.balls++;
        this.emit('pitch', `${tname} ${kmh}km/h，坏球。`, { pitch: info });
        break;
      case 'called':
        this.strikes++;
        this.emit('pitch', `${tname} ${kmh}km/h，好球！`, { pitch: info });
        break;
      case 'swinging':
        this.strikes++;
        this.emit('pitch', `${tname} ${kmh}km/h，挥棒落空！`, { pitch: info });
        break;
      case 'foul':
        if (this.strikes < 2) this.strikes++;
        this.emit('pitch', `${tname} ${kmh}km/h，界外球。`, { pitch: info });
        this.stealers = [];
        break;
    }
    if (wpText && this.balls < 4 && this.strikes < 3) {
      this.emit('wp', `${wpText}！跑者各推进一个垒。`, { big: !!this.bases[2] });
      // 暴投的失分算自责分，捕逸不算
      this.advanceRunnersBy(1, wpText === '捕逸');
      if (this.over) return;
    }
    // 不死三振
    if (this.strikes >= 3 && res === 'swinging' && loc === 'waste' && def && def.wp > 1 && (!this.bases[0] || this.outs === 2) && chance(0.06)) {
      const ob = off.bbox(b.id);
      ob.ab++;
      ob.so++;
      ob.seq.push('振逃');
      const pb = dfn.pbox(p.id);
      pb.so++;
      pb.bf++;
      this.emit('play', `三振不死！球漏接，${nm(b)}冲上一垒安全！`, { big: true });
      this.stealers = [];
      this.forceAdvanceBatter(b, [], true);
      return;
    }
    this.afterNonContact(b, res === 'called', tname);
  }

  /** 未击中（坏球/好球）后的结算：三振、保送、盗垒 */
  private afterNonContact(b: Player, looking = false, tname = ''): void {
    const off = this.off;
    const dfn = this.dfn;
    const p = this.pitcher();
    if (this.outs >= 3) {
      // 跑者出局造成三出局：本打席延续到下一局
      this.stealers = [];
      if (!this.over && !this.needHalf) this.endHalf(false);
      return;
    }
    if (this.strikes >= 3) {
      const ob = off.bbox(b.id);
      ob.ab++;
      ob.so++;
      ob.seq.push('三振');
      const pb = dfn.pbox(p.id);
      pb.so++;
      pb.bf++;
      this.outs++;
      pb.outs++;
      dfn.rattle = Math.max(0, dfn.rattle - 0.1);
      this.emit('play', looking ? `${nm(b)}看着好球三振出局。` : `${nm(b)}挥空三振！${tname ? nm(p) + '的' + tname + '！' : ''}`, { big: this.risp() });
      if (this.stealers.length && this.outs < 3) this.resolveSteals(false, false);
      this.stealers = [];
      this.endPA();
      return;
    }
    if (this.balls >= 4) {
      this.stealers = [];
      this.walk(b, false);
      return;
    }
    if (this.stealers.length) this.resolveSteals(false, false);
    if (this.outs >= 3 && !this.over && !this.needHalf) this.endHalf(false);
  }

  private walk(b: Player, ibb: boolean): void {
    const ob = this.off.bbox(b.id);
    ob.bb++;
    ob.seq.push(ibb ? '敬远' : '四球');
    const pb = this.dfn.pbox(this.dfn.pitcher);
    pb.bb++;
    pb.bf++;
    if (!ibb) {
      this.dfn.rattle = clamp(this.dfn.rattle + 0.12, 0, 1);
      this.emit('play', `四坏球，${nm(b)}保送上垒。`);
    }
    this.forceWalk(b);
  }

  private forceWalk(b: Player): void {
    const moves: RunnerMove[] = [];
    const scored: RunnerSlot[] = [];
    if (this.bases[0]) {
      if (this.bases[1]) {
        if (this.bases[2]) {
          scored.push(this.bases[2]);
          moves.push({ pid: this.bases[2].pid, from: 3, to: 4, out: false });
        }
        moves.push({ pid: this.bases[1].pid, from: 2, to: 3, out: false });
        this.bases[2] = this.bases[1];
      }
      moves.push({ pid: this.bases[0].pid, from: 1, to: 2, out: false });
      this.bases[1] = this.bases[0];
    }
    this.bases[0] = { pid: b.id, resp: this.dfn.pitcher, unearned: false };
    moves.push({ pid: b.id, from: 0, to: 1, out: false });
    for (const r of scored) this.scoreRun(r, b.id);
    this.patchLast(moves, scored.length);
    if (scored.length) {
      const e = this.lastEv();
      if (e) e.text += ' 挤回一分！';
    }
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  /** 全体跑者推进 n 个垒（暴投、牵制暴传） */
  private advanceRunnersBy(n: number, unearned: boolean): void {
    const moves: RunnerMove[] = [];
    let runs = 0;
    for (let i = 2; i >= 0; i--) {
      const r = this.bases[i];
      if (!r) continue;
      const to = i + 1 + n;
      this.bases[i] = null;
      if (to >= 4) {
        moves.push({ pid: r.pid, from: i + 1, to: 4, out: false });
        if (this.scoreRun(unearned ? { ...r, unearned: true } : r, null)) runs++;
      } else {
        this.bases[to - 1] = r;
        moves.push({ pid: r.pid, from: i + 1, to, out: false });
      }
    }
    this.patchLast(moves, runs);
    this.checkWalkoff();
  }

  private resolveSteals(pitchout: boolean, _isFB: boolean): void {
    const off = this.off;
    const dfn = this.dfn;
    const cat = dfn.fielder('C');
    const p = dfn.get(dfn.pitcher);
    const order = [...this.stealers].sort((a, b) => b - a);
    const isFB = this.lastPitch?.type === 'FB';
    const moves: RunnerMove[] = [];
    let anyOut = false;
    const texts: string[] = [];
    order.forEach((idx, n) => {
      const r = this.bases[idx];
      if (!r || this.outs >= 3) return;
      const rp = off.get(r.pid);
      let ps = 0.7 + 0.28 * z(rp.a.speed) + 0.12 * z(rp.a.baserun) - 0.22 * z(cat.a.arm);
      if (has(p, 'quick')) ps -= 0.08;
      if (has(p, 'pickoff')) ps -= 0.04;
      if (!isFB) ps += 0.05;
      if (has(rp, 'steal')) ps += 0.08;
      if (has(cat, 'laser')) ps -= 0.05;
      ps += (off.s.teamTactics - 50) / 500;
      ps -= this.leadPenalty;
      if (dfn.hold) ps -= 0.08;
      ps += off.runAgg * 0.04;
      if (pitchout) ps -= 0.35;
      if (idx === 1) ps -= 0.1;
      if (n > 0) ps = 0.97; // 捕手只传领先跑者
      this.bases[idx] = null;
      if (chance(clamp(ps, 0.05, 0.98))) {
        this.bases[idx + 1] = r;
        moves.push({ pid: r.pid, from: idx + 1, to: idx + 2, out: false });
        off.bbox(r.pid).sb++;
        texts.push(`${nm(rp)}${idx === 1 ? '盗三垒' : '盗垒'}成功！`);
      } else {
        this.outs++;
        anyOut = true;
        moves.push({ pid: r.pid, from: idx + 1, to: idx + 2, out: true });
        off.bbox(r.pid).cs++;
        dfn.pbox(dfn.pitcher).outs++;
        texts.push(`${nm(rp)}盗垒失败！${nm(cat)}传球刺杀！`);
        dfn.rattle = Math.max(0, dfn.rattle - 0.08);
      }
    });
    this.stealers = [];
    if (texts.length) this.emit('steal', texts.join(' '), { moves, big: anyOut });
  }

  // ======================= 触击 =======================
  private doBunt(b: Player, p: Player, info: PitchInfo, loc: Loc, nasty: number, forHit: boolean, squeeze: boolean, tname: string): void {
    const off = this.off;
    const dfn = this.dfn;
    const shift = dfn.def.align === 'buntShift' || dfn.def.align === 'close';
    const master = has(b, 'buntMaster');
    if (loc === 'waste' && !squeeze) {
      this.balls++;
      info.res = 'ball';
      this.emit('pitch', `${tname}，${nm(b)}收回球棒，坏球。`, { pitch: info });
      this.afterNonContact(b);
      return;
    }
    let pContact = 0.8 + 0.22 * z(b.a.bunt) - 0.08 * z(nasty) - (loc === 'shadow' ? 0.1 : 0) - (loc === 'waste' ? 0.35 : 0) + (master ? 0.1 : 0);
    pContact += (off.s.teamTactics - 50) / 600;
    if (!chance(clamp(pContact, 0.1, 0.98))) {
      info.res = 'bunt_miss';
      this.strikes++;
      if (squeeze && this.bases[2]) {
        const r = this.bases[2];
        this.bases[2] = null;
        this.outs++;
        dfn.pbox(p.id).outs++;
        this.emit('pitch', `触击落空！抢分失败，三垒跑者${nm(off.get(r.pid))}被夹杀！`, { pitch: info, big: true, moves: [{ pid: r.pid, from: 3, to: 4, out: true }] });
        if (this.outs >= 3) {
          if (this.strikes >= 3) {
            const ob = off.bbox(b.id);
            ob.ab++;
            ob.so++;
            ob.seq.push('三振');
            dfn.pbox(p.id).so++;
            dfn.pbox(p.id).bf++;
            this.endPA();
          } else this.endHalf(false);
          return;
        }
      } else {
        this.emit('pitch', `${tname}，触击落空！`, { pitch: info });
      }
      this.afterNonContact(b);
      return;
    }
    const pFair = 0.74 + 0.15 * z(b.a.bunt) + (master ? 0.1 : 0);
    if (!chance(clamp(pFair, 0.3, 0.97))) {
      info.res = 'bunt_foul';
      this.strikes++;
      this.emit('pitch', `${tname}，触击成界外球。`, { pitch: info });
      if (this.strikes >= 3) {
        const ob = off.bbox(b.id);
        ob.ab++;
        ob.so++;
        ob.seq.push('三振');
        const pb = dfn.pbox(p.id);
        pb.so++;
        pb.bf++;
        pb.outs++;
        this.outs++;
        this.emit('play', `两好球后触击界外，${nm(b)}三振出局。`);
        this.endPA();
      }
      return;
    }
    info.res = 'inplay';
    const ob = off.bbox(b.id);
    const pb = dfn.pbox(p.id);
    pb.bf++;
    const qb = 0.55 + 0.25 * z(b.a.bunt) + gauss(0, 0.2) - (shift ? 0.12 : 0) + (master ? 0.15 : 0) + (off.s.teamTactics - 50) / 400;
    const angle = chance(0.5) ? -25 - rand() * 12 : 22 + rand() * 12;
    const fielder: Pos = qb < 0.3 ? (chance(0.5) ? 'C' : 'P') : angle < 0 ? '3B' : chance(0.5) ? '1B' : 'P';
    const bip: BipInfo = { kind: 'BU', angle, dist: 8 + rand() * 12, fielder, res: 'SAC' };
    const moves: RunnerMove[] = [];

    if (forHit && !squeeze) {
      const pSafe = 0.16 + 0.3 * z(b.a.speed) + 0.25 * (qb - 0.5) - (shift ? 0.1 : 0) + (has(b, 'infHit') ? 0.06 : 0);
      if (chance(clamp(pSafe, 0.03, 0.7))) {
        bip.res = 'IH';
        this.recordHit(ob, pb, 1, '触安');
        this.emit('play', `触击安打！${nm(b)}以惊人的速度冲上一垒！`, { bip, pitch: info, big: true });
        this.forceAdvanceBatter(b, moves, false);
        return;
      }
    }
    if (qb < 0.15) {
      bip.res = 'out';
      bip.fielder = 'P';
      ob.ab++;
      ob.seq.push('投飞');
      this.outs++;
      pb.outs++;
      moves.push({ pid: b.id, from: 0, to: 0, out: true });
      let txt = `触击成小飞球，被投手接住！`;
      if (squeeze && this.bases[2] && this.outs < 3) {
        const r = this.bases[2];
        this.bases[2] = null;
        this.outs++;
        pb.outs++;
        moves.push({ pid: r.pid, from: 3, to: 3, out: true });
        txt += `三垒跑者来不及回垒，双杀！`;
      }
      this.emit('play', txt, { bip, pitch: info, moves, big: true });
      this.endPA();
      return;
    }
    if (squeeze && this.bases[2]) {
      const r = this.bases[2];
      if (qb >= 0.22) {
        bip.res = 'SAC';
        ob.sac++;
        ob.seq.push('抢分');
        this.bases[2] = null;
        moves.push({ pid: r.pid, from: 3, to: 4, out: false });
        if (this.bases[1]) {
          this.bases[2] = this.bases[1];
          this.bases[1] = null;
          moves.push({ pid: this.bases[2].pid, from: 2, to: 3, out: false });
        }
        if (this.bases[0]) {
          this.bases[1] = this.bases[0];
          this.bases[0] = null;
          moves.push({ pid: this.bases[1].pid, from: 1, to: 2, out: false });
        }
        this.outs++;
        pb.outs++;
        moves.push({ pid: b.id, from: 0, to: 1, out: true });
        const counted = this.outs < 3;
        if (counted) this.scoreRun(r, b.id);
        this.emit('play', `抢分触击${counted ? '成功' : ''}！三垒跑者${nm(off.get(r.pid))}冲回本垒！`, { bip, pitch: info, moves, runs: counted ? 1 : 0, big: true });
        if (counted) this.highlights.push(`${this.inning}局 ${off.s.short}抢分触击得分`);
        if (this.checkWalkoff()) return;
        this.endPA();
        return;
      }
      bip.res = 'FC';
      ob.ab++;
      ob.seq.push('野选');
      this.bases[2] = null;
      this.outs++;
      pb.outs++;
      moves.push({ pid: r.pid, from: 3, to: 4, out: true });
      this.emit('play', `触击太强，三垒跑者在本垒前被封杀！`, { bip, pitch: info, moves, big: true });
      this.forceAdvanceBatter(b, moves, false);
      return;
    }
    if (qb < 0.38 && this.bases[0]) {
      // 封杀被迫进垒的最前方跑者（满垒时在本垒封杀）
      const leadIdx = this.bases[1] ? (this.bases[2] ? 2 : 1) : 0;
      const r = this.bases[leadIdx]!;
      bip.res = 'FC';
      ob.ab++;
      ob.seq.push('野选');
      this.bases[leadIdx] = null;
      this.outs++;
      pb.outs++;
      moves.push({ pid: r.pid, from: leadIdx + 1, to: leadIdx + 2, out: true });
      this.emit('play', `触击被抢先处理，${['二', '三', '本'][leadIdx]}垒封杀！`, { bip, pitch: info, moves });
      this.forceAdvanceBatter(b, moves, false);
      return;
    }
    // 牺牲触击成功
    const bunHit = qb > 0.75 && chance(Math.max(0, 0.12 * (1 + z(b.a.speed))));
    if (bunHit) {
      bip.res = 'IH';
      this.recordHit(ob, pb, 1, '触安');
      this.emit('play', `绝妙的触击！跑者推进，${nm(b)}也安全上垒！`, { bip, pitch: info, big: true });
      this.forceAdvanceBatter(b, moves, false);
      return;
    }
    // 三垒跑者没有起跑（那是抢分触击），只有满垒被迫进垒时才回本垒
    let scored: RunnerSlot | null = null;
    if (this.bases[0] && this.bases[1] && this.bases[2]) {
      scored = this.bases[2];
      moves.push({ pid: scored.pid, from: 3, to: 4, out: false });
      this.bases[2] = null;
    }
    if (this.bases[1] && !this.bases[2]) {
      this.bases[2] = this.bases[1];
      this.bases[1] = null;
      moves.push({ pid: this.bases[2].pid, from: 2, to: 3, out: false });
    }
    if (this.bases[0] && !this.bases[1]) {
      this.bases[1] = this.bases[0];
      this.bases[0] = null;
      moves.push({ pid: this.bases[1].pid, from: 1, to: 2, out: false });
    }
    const advanced = moves.length > 0;
    bip.res = advanced ? 'SAC' : 'out';
    if (advanced) ob.sac++;
    else ob.ab++;
    ob.seq.push(advanced ? '牺打' : '触击出局');
    moves.push({ pid: b.id, from: 0, to: 1, out: true });
    this.outs++;
    pb.outs++;
    const counted = !!scored && this.outs < 3;
    if (counted) this.scoreRun(scored!, b.id);
    const txt = advanced ? `${nm(b)}牺牲触击成功，跑者推进！` : `${nm(b)}触击出局，跑者没有推进。`;
    this.emit('play', txt, { bip, pitch: info, moves, runs: counted ? 1 : 0 });
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  /** 打者上一垒，被迫跑者推进（内野安打/野选/不死三振） */
  private forceAdvanceBatter(b: Player, moves: RunnerMove[], unearned: boolean): void {
    const scored: RunnerSlot[] = [];
    if (this.outs < 3) {
      if (this.bases[0]) {
        if (this.bases[1]) {
          if (this.bases[2]) {
            scored.push(this.bases[2]);
            moves.push({ pid: this.bases[2].pid, from: 3, to: 4, out: false });
          }
          this.bases[2] = this.bases[1];
          moves.push({ pid: this.bases[1].pid, from: 2, to: 3, out: false });
        }
        this.bases[1] = this.bases[0];
        moves.push({ pid: this.bases[0].pid, from: 1, to: 2, out: false });
      }
      this.bases[0] = { pid: b.id, resp: this.dfn.pitcher, unearned };
      moves.push({ pid: b.id, from: 0, to: 1, out: false });
      for (const r of scored) this.scoreRun(r, unearned ? null : b.id);
    }
    this.patchLast(moves, scored.length);
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  // ======================= 击球入场 =======================
  private ballInPlay(
    b: Player, p: Player, be: { con: number; pow: number; side: 'R' | 'L' }, pe: { vel: number },
    nasty: number, loc: Loc, info: PitchInfo, running: boolean, solidIn?: number, lift = 0,
  ): void {
    const off = this.off;
    const dfn = this.dfn;
    const locAdj = loc === 'heart' ? 0.06 : loc === 'corner' ? -0.02 : loc === 'shadow' ? -0.08 : -0.18;
    const spot = spotOf(info.x, info.y, be.side);
    let solid = solidIn ?? 0.52 + 0.2 * z(be.con) - 0.16 * z(nasty) + locAdj + gauss(0, 0.19);
    if (has(p, 'heavy')) solid -= 0.03;
    // 内角有威力的球会让打者被塞住；外角的球不容易打得扎实
    if (spot.hz === 'in' && nasty > 55) solid -= 0.04;
    else if (spot.hz === 'out') solid -= 0.015;
    solid = clamp(solid, 0.01, 0.99);
    const ev = solid * (0.72 + (0.6 * clamp(be.pow, 0, 115)) / 100);
    const pdef = info.type !== 'FB' ? PITCH_DEFS[info.type as PitchType] : null;
    const tAdj = (b.traj - 2.5) * 0.06;
    let gbBias = (pdef ? pdef.gb : 0) + (has(p, 'grounder') ? 0.08 : 0) + (has(p, 'heavy') ? 0.03 : 0) + (has(p, 'lowBall') ? 0.03 : 0) + (p.delivery === 'under' ? 0.03 : 0);
    // 低球多滚地，高球多飞球
    if (spot.vz === 'low') gbBias += 0.09;
    else if (spot.vz === 'high') gbBias -= 0.07;
    // 一定挥：挥棒范围比球低（打到球的下半部）容易飞高，比球高（打到上半部）容易打成滚地
    gbBias -= 0.22 * lift;
    const pPU = clamp(0.12 - 0.1 * solid + Math.max(0, tAdj) * 0.3 + 0.08 * Math.max(0, lift), 0.02, 0.22);
    const pLD = 0.11 + 0.2 * solid;
    const pFB = clamp(0.31 + tAdj - gbBias * 0.7, 0.12, 0.5);
    const pGB = Math.max(0.05, 1 - pPU - pLD - pFB);
    const kind = weightedPick<[BipKind, number]>([['PU', pPU], ['LD', pLD], ['FB', pFB], ['GB', pGB]], (x) => x[1])[0];
    const pullDir = be.side === 'R' ? -1 : 1;
    let mean = pullDir * (6 + (has(b, 'pull') ? 8 : 0));
    mean -= pullDir * clamp((pe.vel - 135) / 3, 0, 6);
    // 内角球容易拉打，外角球容易推打
    if (spot.hz === 'in') mean += pullDir * 5;
    else if (spot.hz === 'out') mean -= pullDir * 7;
    const angle = clamp(gauss(mean, has(b, 'spray') ? 25 : 20), -44, 44);
    const ob = off.bbox(b.id);
    const pb = dfn.pbox(p.id);
    pb.bf++;
    switch (kind) {
      case 'GB':
        return this.resolveGB(b, ev, angle, info, running, ob, pb);
      case 'LD':
        return this.resolveLD(b, ev, angle, info, running, ob, pb);
      case 'FB':
        return this.resolveFB(b, p, ev, angle, info, ob, pb);
      default:
        return this.resolvePU(b, angle, info, ob, pb);
    }
  }

  private fieldRange(f: Player, pos: Pos): number {
    let r = pos === 'LF' || pos === 'CF' || pos === 'RF' ? 0.55 * f.a.fielding + 0.45 * f.a.speed : 0.75 * f.a.fielding + 0.25 * f.a.speed;
    const apt = aptOf(f, pos);
    r = r * (0.45 + 0.55 * (apt / 100)) - (1 - apt / 100) * 10;
    if (has(f, 'glove')) r += 6;
    r += (this.dfn.s.teamTactics - 50) * 0.05;
    return r;
  }

  private errMult(f: Player, pos: Pos): number {
    const apt = aptOf(f, pos);
    let m = (1 + (50 - f.a.catching) / 45) * (1 + (100 - apt) / 60);
    if (has(f, 'errorProne')) m *= 1.6;
    if (has(f, 'glove')) m *= 0.5;
    if (this.rules.bigGame && has(f, 'nerves')) m *= 1.3;
    return clamp(m, 0.2, 4);
  }

  private dirText(angle: number, deep: boolean): string {
    if (!deep) {
      if (angle < -30) return '三垒方向';
      if (angle < -8) return '游击方向';
      if (angle < 8) return '投手正面';
      if (angle < 30) return '二垒方向';
      return '一垒方向';
    }
    if (angle < -36) return '左外野线';
    if (angle < -14) return '左外野';
    if (angle < -6) return '左中间';
    if (angle <= 6) return '中外野';
    if (angle <= 14) return '右中间';
    if (angle <= 36) return '右外野';
    return '右外野线';
  }

  private ofPos(angle: number): Pos {
    return angle < -14 ? 'LF' : angle > 14 ? 'RF' : 'CF';
  }

  private recordHit(ob: BoxBat, pb: BoxPit, bases: 1 | 2 | 3 | 4, label: string): void {
    ob.ab++;
    ob.h++;
    if (bases === 2) ob.d++;
    if (bases === 3) ob.t++;
    if (bases === 4) ob.hr++;
    ob.seq.push(label);
    pb.h++;
    if (bases === 4) pb.hr++;
    this.off.hits++;
    this.dfn.rattle = clamp(this.dfn.rattle + (bases >= 2 ? 0.14 : 0.08), 0, 1);
  }

  private fieldError(f: Player, ob: BoxBat): void {
    ob.ab++;
    ob.seq.push('失误');
    this.dfn.bbox(f.id).e++;
    this.dfn.errors++;
    this.dfn.rattle = clamp(this.dfn.rattle + 0.15, 0, 1);
  }

  private resolveGB(b: Player, ev: number, angle: number, info: PitchInfo, running: boolean, ob: BoxBat, pb: BoxPit): void {
    const dfn = this.dfn;
    let pos: Pos;
    if (ev < 0.32 && Math.abs(angle) < 12) pos = 'P';
    else if (angle < -28) pos = '3B';
    else if (angle < -6) pos = 'SS';
    else if (angle < 6) pos = angle < 0 ? 'SS' : '2B';
    else if (angle < 28) pos = '2B';
    else pos = '1B';
    const f = dfn.fielder(pos);
    const range = this.fieldRange(f, pos);
    const infieldIn = dfn.def.align === 'infieldIn';
    let pHit = 0.19 + 0.32 * (ev - 0.5) + 0.07 * z(b.a.speed) - 0.08 * z(range) + (Math.abs(angle) < 6 ? 0.06 : 0) + (infieldIn ? 0.09 : 0);
    if (has(b, 'infHit') && ev < 0.6) pHit += 0.05;
    if (ev < 0.3) pHit = 0.08 + 0.18 * z(b.a.speed) + (has(b, 'infHit') ? 0.06 : 0);
    // 双杀阵型、趋近：二游站得靠中间，两侧的滚地球更容易穿过去
    if (dfn.def.align === 'dp') pHit += 0.02;
    else if (dfn.def.align === 'close') pHit += 0.04;
    const bip: BipInfo = { kind: 'GB', angle, dist: 15 + ev * 30, fielder: pos, res: 'out' };
    const moves: RunnerMove[] = [];
    const dir = this.dirText(angle, false);
    if (chance(clamp(pHit, 0.03, 0.75))) {
      if (Math.abs(angle) > 34 && ev > 0.75 && chance(0.45)) {
        bip.res = '2B';
        bip.fielder = angle < 0 ? 'LF' : 'RF';
        bip.dist = 70;
        this.recordHit(ob, pb, 2, '二安');
        this.emit('play', `强劲滚地球沿着${angle < 0 ? '三垒线' : '一垒线'}穿越！${nm(b)}二垒安打！`, { bip, pitch: info, big: true });
        this.hitAdvance(b, 2, bip.fielder, running);
        return;
      }
      if (ev < 0.45) {
        bip.res = 'IH';
        this.recordHit(ob, pb, 1, '内安');
        this.emit('play', `${dir}的慢滚地球，${nm(b)}全力奔跑——内野安打！`, { bip, pitch: info });
        this.forceAdvanceBatter(b, moves, false);
        return;
      }
      bip.res = '1B';
      bip.fielder = this.ofPos(angle);
      bip.dist = 55 + ev * 10;
      this.recordHit(ob, pb, 1, '安打');
      const through = angle < -8 ? '三游间' : angle > 8 ? '一二垒间' : '二游间';
      this.emit('play', `${nm(b)}的滚地球穿越${through}！安打！`, { bip, pitch: info });
      this.hitAdvance(b, 1, bip.fielder, running);
      return;
    }
    let pErr = 0.05 * this.errMult(f, pos);
    if ((pos === '3B' || pos === 'SS') && f.a.arm < 50) pErr += ((50 - f.a.arm) / 50) * 0.012;
    if (chance(pErr)) {
      bip.res = 'E';
      this.fieldError(f, ob);
      this.emit('play', `${dir}滚地球……${FIELD_NAME[pos]}${nm(f)}失误！${nm(b)}安全上垒！`, { bip, pitch: info, big: true });
      this.errorAdvance(b, moves);
      return;
    }
    ob.ab++;
    // 双杀 / 野选
    if (this.bases[0] && this.outs < 2 && !running) {
      let pDP = 0.42 + 0.3 * (ev - 0.5) - 0.12 * z(b.a.speed) + 0.06 * z(range) + (dfn.def.align === 'dp' || dfn.def.align === 'close' ? 0.1 : 0);
      if (ev < 0.35) pDP *= 0.4;
      if (chance(clamp(pDP, 0.05, 0.85))) {
        bip.res = 'DP';
        ob.seq.push('双杀');
        const r1 = this.bases[0];
        moves.push({ pid: r1.pid, from: 1, to: 2, out: true });
        moves.push({ pid: b.id, from: 0, to: 1, out: true });
        this.bases[0] = null;
        this.outs += 2;
        pb.outs += 2;
        dfn.rattle = Math.max(0, dfn.rattle - 0.15);
        let runs = 0;
        if (this.outs < 3) {
          if (this.bases[2]) {
            const r3 = this.bases[2];
            this.bases[2] = null;
            moves.push({ pid: r3.pid, from: 3, to: 4, out: false });
            if (this.scoreRun(r3, null)) runs++;
          }
          if (this.bases[1]) {
            this.bases[2] = this.bases[1];
            this.bases[1] = null;
            moves.push({ pid: this.bases[2].pid, from: 2, to: 3, out: false });
          }
        }
        this.emit('play', `${dir}滚地球——${DP_CODE[pos] ?? ''}双杀！`, { bip, pitch: info, moves, runs, big: true });
        if (this.checkWalkoff()) return;
        this.endPA();
        return;
      }
      if (chance(0.3)) {
        bip.res = 'FC';
        ob.seq.push('野选');
        const r1 = this.bases[0];
        this.bases[0] = null;
        this.outs++;
        pb.outs++;
        moves.push({ pid: r1.pid, from: 1, to: 2, out: true });
        this.emit('play', `${dir}滚地球，二垒封杀，${nm(b)}跑上一垒。`, { bip, pitch: info, moves });
        if (this.outs >= 3) {
          this.endPA();
          return;
        }
        let runs = 0;
        if (this.bases[2] && this.bases[1]) {
          const r3 = this.bases[2];
          this.bases[2] = this.bases[1];
          this.bases[1] = null;
          moves.push({ pid: r3.pid, from: 3, to: 4, out: false });
          moves.push({ pid: this.bases[2].pid, from: 2, to: 3, out: false });
          if (this.scoreRun(r3, b.id)) runs++;
        } else if (this.bases[2] && !infieldIn && chance(0.6)) {
          const r3 = this.bases[2];
          this.bases[2] = null;
          moves.push({ pid: r3.pid, from: 3, to: 4, out: false });
          if (this.scoreRun(r3, b.id)) runs++;
        } else if (this.bases[1] && !this.bases[2]) {
          this.bases[2] = this.bases[1];
          this.bases[1] = null;
          moves.push({ pid: this.bases[2].pid, from: 2, to: 3, out: false });
        }
        this.bases[0] = { pid: b.id, resp: dfn.pitcher, unearned: false };
        moves.push({ pid: b.id, from: 0, to: 1, out: false });
        this.patchLast(moves, runs);
        if (this.checkWalkoff()) return;
        this.endPA();
        return;
      }
    }
    // 一垒刺杀
    bip.res = 'out';
    ob.seq.push(SEQ_GB[pos] ?? '滚');
    this.outs++;
    pb.outs++;
    dfn.rattle = Math.max(0, dfn.rattle - 0.06);
    moves.push({ pid: b.id, from: 0, to: 1, out: true });
    let runs = 0;
    if (this.outs < 3) {
      const r3 = this.bases[2];
      const r2 = this.bases[1];
      const r1 = this.bases[0];
      const forced3 = !!(r1 && r2 && r3);
      if (r3) {
        let go: boolean;
        let safe = true;
        if (forced3) go = true;
        else if (infieldIn) {
          go = chance(0.25);
          safe = chance(0.3);
        } else go = chance(running ? 0.9 : 0.72);
        if (go) {
          this.bases[2] = null;
          if (safe) {
            moves.push({ pid: r3.pid, from: 3, to: 4, out: false });
            if (this.scoreRun(r3, b.id)) runs++;
          } else {
            moves.push({ pid: r3.pid, from: 3, to: 4, out: true });
            this.outs++;
            pb.outs++;
          }
        }
      }
      if (r2 && this.outs < 3) {
        const forced2 = !!r1;
        if ((forced2 || chance(angle > 0 ? 0.78 : running ? 0.7 : 0.35)) && !this.bases[2]) {
          this.bases[2] = r2;
          this.bases[1] = null;
          moves.push({ pid: r2.pid, from: 2, to: 3, out: false });
        }
      }
      if (r1 && this.outs < 3 && !this.bases[1]) {
        this.bases[1] = r1;
        this.bases[0] = null;
        moves.push({ pid: r1.pid, from: 1, to: 2, out: false });
      }
    }
    this.emit('play', `${nm(b)}击出${dir}滚地球，${FIELD_NAME[pos]}${nm(f)}${pos === '1B' ? '自己踩垒' : '传一垒'}，出局。${runs ? '跑者趁机回本垒！' : ''}`, { bip, pitch: info, moves, runs });
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  private errorAdvance(b: Player, moves: RunnerMove[]): void {
    let runs = 0;
    for (let i = 2; i >= 0; i--) {
      const r = this.bases[i];
      if (!r) continue;
      let to = i + 2;
      if (chance(0.3)) to++;
      if (to <= 3 && this.bases[to - 1]) to--;
      this.bases[i] = null;
      if (to >= 4) {
        moves.push({ pid: r.pid, from: i + 1, to: 4, out: false });
        if (this.scoreRun({ ...r, unearned: true }, null)) runs++;
      } else {
        this.bases[to - 1] = r;
        moves.push({ pid: r.pid, from: i + 1, to, out: false });
      }
    }
    if (chance(0.18) && !this.bases[1] && !this.bases[0]) {
      this.bases[1] = { pid: b.id, resp: this.dfn.pitcher, unearned: true };
      moves.push({ pid: b.id, from: 0, to: 2, out: false });
    } else {
      this.bases[0] = { pid: b.id, resp: this.dfn.pitcher, unearned: true };
      moves.push({ pid: b.id, from: 0, to: 1, out: false });
    }
    this.patchLast(moves, runs);
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  private resolveLD(b: Player, ev: number, angle: number, info: PitchInfo, running: boolean, ob: BoxBat, pb: BoxPit): void {
    const dfn = this.dfn;
    const dist = 20 + 70 * ev + gauss(0, 6);
    const moves: RunnerMove[] = [];
    if (dist < 38) {
      const pos: Pos = angle < -28 ? '3B' : angle < -4 ? 'SS' : angle < 4 ? 'P' : angle < 28 ? '2B' : '1B';
      const f = dfn.fielder(pos);
      const pCatch = 0.72 - 0.25 * (ev - 0.5) + 0.05 * z(this.fieldRange(f, pos));
      const bip: BipInfo = { kind: 'LD', angle, dist, fielder: pos, res: 'out' };
      if (chance(clamp(pCatch, 0.3, 0.92))) {
        ob.ab++;
        ob.seq.push('直飞');
        this.outs++;
        pb.outs++;
        moves.push({ pid: b.id, from: 0, to: 0, out: true });
        let txt = `强劲平飞球！被${FIELD_NAME[pos]}${nm(f)}正面接住。`;
        if (this.outs < 3) {
          const idx = this.stealers.length ? this.stealers[0] : this.bases[0] && ev > 0.8 && chance(0.1) ? 0 : -1;
          const r = idx >= 0 ? this.bases[idx] : null;
          if (r && (running ? chance(0.6) : true)) {
            this.bases[idx] = null;
            this.outs++;
            pb.outs++;
            moves.push({ pid: r.pid, from: idx + 1, to: idx + 1, out: true });
            txt += `跑者来不及回垒，双杀！`;
            bip.res = 'DP';
          }
        }
        this.emit('play', txt, { bip, pitch: info, moves, big: bip.res === 'DP' });
        this.endPA();
        return;
      }
      bip.res = '1B';
      bip.fielder = this.ofPos(angle);
      bip.dist = 50;
      this.recordHit(ob, pb, 1, '安打');
      this.emit('play', `${nm(b)}的平飞球越过内野！安打！`, { bip, pitch: info });
      this.hitAdvance(b, 1, bip.fielder, running);
      return;
    }
    const pos = this.ofPos(angle);
    const f = dfn.fielder(pos);
    let pHit = 0.72 + 0.22 * (ev - 0.6) - 0.07 * z(this.fieldRange(f, pos));
    if (dfn.def.align === 'noDoubles') pHit -= 0.04;
    const bip: BipInfo = { kind: 'LD', angle, dist, fielder: pos, res: 'out' };
    const dir = this.dirText(angle, true);
    if (chance(clamp(pHit, 0.3, 0.93))) {
      const gap = (Math.abs(angle) >= 6 && Math.abs(angle) <= 26) || Math.abs(angle) > 36;
      let bases: 1 | 2 | 3 = 1;
      const p2 = (0.08 + 0.55 * Math.max(0, ev - 0.55)) * (gap ? 1.4 : 0.8) * (dfn.def.align === 'noDoubles' ? 0.5 : 1);
      if (chance(p2)) bases = 2;
      if (bases === 2 && chance(0.08 + Math.max(0, b.a.speed - 55) * 0.008)) bases = 3;
      bip.res = bases === 1 ? '1B' : bases === 2 ? '2B' : '3B';
      this.recordHit(ob, pb, bases, bases === 1 ? '安打' : bases === 2 ? '二安' : '三安');
      const name = bases === 1 ? '安打' : bases === 2 ? '二垒安打' : '三垒安打';
      this.emit('play', `${nm(b)}击出${dir}平飞${name}！`, { bip, pitch: info, big: bases >= 2 });
      this.hitAdvance(b, bases, pos, running);
      return;
    }
    ob.ab++;
    ob.seq.push(`${SEQ_OF[pos] ?? ''}直`);
    this.outs++;
    pb.outs++;
    moves.push({ pid: b.id, from: 0, to: 0, out: true });
    let txt = `${dir}方向的强劲平飞球……${FIELD_NAME[pos]}${nm(f)}飞身接住！`;
    if (running && this.outs < 3 && this.stealers.length) {
      const idx = this.stealers[0];
      const r = this.bases[idx];
      if (r && chance(0.5)) {
        this.bases[idx] = null;
        this.outs++;
        pb.outs++;
        moves.push({ pid: r.pid, from: idx + 1, to: idx + 1, out: true });
        txt += '跑者来不及回垒，双杀！';
        bip.res = 'DP';
      }
    }
    this.emit('play', txt, { bip, pitch: info, moves, big: true });
    this.endPA();
  }

  fenceAt(angle: number): number {
    const { line, center } = this.rules.fence;
    return line + (center - line) * (1 - Math.pow(Math.abs(angle) / 45, 1.5));
  }

  private resolveFB(b: Player, p: Player, ev: number, angle: number, info: PitchInfo, ob: BoxBat, pb: BoxPit): void {
    const dfn = this.dfn;
    let dist = (32 + 80 * ev + gauss(0, 7)) * 0.97;
    if (has(b, 'arch')) dist += 4;
    if (has(p, 'heavy')) dist -= 3;
    if (has(p, 'lowBall')) dist -= 2;
    if (has(p, 'hrProne')) dist += 3;
    const fence = this.fenceAt(angle);
    const moves: RunnerMove[] = [];
    const dir = this.dirText(angle, true);
    if (dist >= fence) {
      const bip: BipInfo = { kind: 'FB', angle, dist, fielder: this.ofPos(angle), res: 'HR' };
      this.recordHit(ob, pb, 4, '本垒打');
      let runs = 0;
      for (let i = 2; i >= 0; i--) {
        const r = this.bases[i];
        if (!r) continue;
        moves.push({ pid: r.pid, from: i + 1, to: 4, out: false });
        if (this.scoreRun(r, b.id, true)) runs++;
        this.bases[i] = null;
      }
      moves.push({ pid: b.id, from: 0, to: 4, out: false });
      if (this.scoreRun({ pid: b.id, resp: p.id, unearned: false }, b.id, true)) runs++;
      const label = runs === 4 ? '满垒本垒打' : runs === 1 ? '个人本垒打' : `${runs}分本垒打`;
      this.emit('play', `本垒打！！${nm(b)}的打球划出漂亮的弧线，飞进了${dir}看台！${label}！`, { bip, pitch: info, moves, runs, big: true });
      this.highlights.push(`${this.inning}局 ${nm(b)}（${this.off.s.short}）${label}`);
      if (this.checkWalkoff()) return;
      this.endPA();
      return;
    }
    const pos: Pos = dist < 45 ? (angle < -20 ? '3B' : angle < 0 ? 'SS' : angle < 20 ? '2B' : '1B') : this.ofPos(angle);
    const f = dfn.fielder(pos);
    const range = this.fieldRange(f, pos);
    const bip: BipInfo = { kind: 'FB', angle, dist, fielder: pos, res: 'out' };
    const gap = Math.abs(angle) >= 10 && Math.abs(angle) <= 32;
    let hitBases: 0 | 1 | 2 | 3 = 0;
    if (dist >= fence - 7) {
      if (!chance(clamp(0.18 + 0.1 * z(range), 0.05, 0.4))) {
        hitBases = chance(0.18 + Math.max(0, b.a.speed - 55) * 0.012) ? 3 : 2;
        if (chance(0.05)) hitBases = 1;
      }
    } else if (dist >= 70) {
      let pCatch = 0.84 + 0.08 * z(range) - (gap ? 0.13 : 0);
      if (dfn.def.align === 'noDoubles') pCatch += 0.06;
      if (dfn.def.align === 'infieldIn') pCatch -= 0.02;
      if (!chance(clamp(pCatch, 0.4, 0.97))) hitBases = gap && dist > 80 ? (chance(0.06 + Math.max(0, b.a.speed - 60) * 0.008) ? 3 : 2) : 1;
    } else if (dist >= 45) {
      const pH = 0.32 - 0.1 * z(range) + (dfn.def.align === 'noDoubles' ? 0.06 : 0);
      if (chance(clamp(pH, 0.05, 0.5))) hitBases = 1;
    }
    if (hitBases > 0) {
      const bases = hitBases as 1 | 2 | 3;
      bip.res = bases === 1 ? '1B' : bases === 2 ? '2B' : '3B';
      bip.fielder = this.ofPos(angle);
      this.recordHit(ob, pb, bases, bases === 1 ? '安打' : bases === 2 ? '二安' : '三安');
      const txt = dist >= fence - 7
        ? `${nm(b)}的${dir}大飞球——直击外野围墙！${bases === 3 ? '三垒安打！' : bases === 2 ? '二垒安打！' : '安打！'}`
        : bases === 2
          ? `${dir}深远的飞球落地！${nm(b)}二垒安打！`
          : `${dir}的飞球落在无人地带，${nm(b)}安打！`;
      this.emit('play', txt, { bip, pitch: info, big: bases >= 2 });
      this.hitAdvance(b, bases, bip.fielder, false);
      return;
    }
    if (chance(0.012 * this.errMult(f, pos))) {
      bip.res = 'E';
      this.fieldError(f, ob);
      this.emit('play', `${dir}飞球……${FIELD_NAME[pos]}${nm(f)}竟然漏接了！`, { bip, pitch: info, big: true });
      this.errorAdvance(b, moves);
      return;
    }
    ob.ab++;
    this.outs++;
    pb.outs++;
    dfn.rattle = Math.max(0, dfn.rattle - 0.06);
    moves.push({ pid: b.id, from: 0, to: 0, out: true });
    let runs = 0;
    let sf = false;
    let txt = dist < 45 ? `${nm(b)}击出内野高飞球，被接杀。` : `${nm(b)}击出${dir}飞球，${FIELD_NAME[pos]}${nm(f)}接杀。`;
    if (this.outs < 3 && dist >= 55) {
      const r3 = this.bases[2];
      if (r3) {
        const rp = this.off.get(r3.pid);
        const arm = f.a.arm + (has(f, 'laser') ? 15 : 0);
        const ps = 0.45 + (dist - 55) * 0.013 + 0.2 * z(rp.a.speed) - 0.15 * z(arm);
        const agg = this.off.runAgg * 0.1;
        if (ps >= 0.5 - agg || (this.outs === 1 && ps > 0.4 - agg && chance(0.5))) {
          this.bases[2] = null;
          if (chance(clamp(ps + 0.15, 0.2, 0.98))) {
            moves.push({ pid: r3.pid, from: 3, to: 4, out: false });
            if (this.scoreRun(r3, b.id)) runs++;
            sf = true;
            txt += `三垒跑者${nm(rp)}触垒后冲回本垒！高飞牺牲打！`;
          } else {
            moves.push({ pid: r3.pid, from: 3, to: 4, out: true });
            this.outs++;
            pb.outs++;
            txt += `三垒跑者冲本垒——${nm(f)}的雷射传球！本垒触杀！`;
          }
        }
      }
      const r2 = this.bases[1];
      if (r2 && !this.bases[2] && dist >= 80 - this.off.runAgg * 12 && this.outs < 3 && chance(0.6 + this.off.runAgg * 0.25)) {
        this.bases[2] = r2;
        this.bases[1] = null;
        moves.push({ pid: r2.pid, from: 2, to: 3, out: false });
      }
    }
    if (sf) {
      ob.ab--;
      ob.sf++;
      ob.seq.push('牺飞');
    } else ob.seq.push(dist < 45 ? '内飞' : `${SEQ_OF[pos] ?? ''}飞`);
    this.emit('play', txt, { bip, pitch: info, moves, runs, big: sf });
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  private resolvePU(b: Player, angle: number, info: PitchInfo, ob: BoxBat, pb: BoxPit): void {
    const dfn = this.dfn;
    const pos: Pos = Math.abs(angle) < 10 ? (chance(0.5) ? 'C' : 'P') : angle < -25 ? '3B' : angle < 0 ? 'SS' : angle < 25 ? '2B' : '1B';
    const f = dfn.fielder(pos);
    const bip: BipInfo = { kind: 'PU', angle, dist: 10 + rand() * 25, fielder: pos, res: 'out' };
    if (chance(0.012 * this.errMult(f, pos))) {
      bip.res = 'E';
      this.fieldError(f, ob);
      this.emit('play', `内野高飞球……${nm(f)}竟然没接住！`, { bip, pitch: info, big: true });
      this.errorAdvance(b, []);
      return;
    }
    ob.ab++;
    ob.seq.push('内飞');
    this.outs++;
    pb.outs++;
    dfn.rattle = Math.max(0, dfn.rattle - 0.06);
    this.emit('play', `${nm(b)}击出内野高飞球，${FIELD_NAME[pos]}${nm(f)}稳稳接住。`, { bip, pitch: info, moves: [{ pid: b.id, from: 0, to: 0, out: true }] });
    this.endPA();
  }

  /** 安打后的跑者推进 */
  private hitAdvance(b: Player, bases: 1 | 2 | 3, ofPos: Pos, running: boolean): void {
    const off = this.off;
    const dfn = this.dfn;
    const f = dfn.fielder(ofPos);
    const arm = f.a.arm + (has(f, 'laser') ? 15 : 0);
    const twoOut = this.outs === 2;
    const moves: RunnerMove[] = [];
    const nb: (RunnerSlot | null)[] = [null, null, null];
    const scored: RunnerSlot[] = [];
    let outAtHome = false;
    for (let i = 2; i >= 0; i--) {
      const r = this.bases[i];
      if (!r) continue;
      const rp = off.get(r.pid);
      const spd = rp.a.speed + (has(rp, 'runner') ? 10 : 0) + (rp.a.baserun - 50) * 0.3;
      const isRunning = running && this.stealers.includes(i);
      const agg = off.runAgg * 0.12;
      let target = i + 1 + bases;
      let out = false;
      if (bases === 1 && i === 1) {
        const ps = 0.52 + 0.25 * z(spd) + (twoOut ? 0.25 : 0) + (isRunning ? 0.15 : 0) - 0.15 * z(arm);
        if (ps >= 0.45 - agg) {
          target = 4;
          out = !chance(Math.min(0.97, ps + 0.25));
        } else target = 3;
      } else if (bases === 1 && i === 0) {
        const ps = 0.22 + 0.2 * z(spd) + (ofPos === 'RF' ? 0.15 : ofPos === 'CF' ? 0.06 : 0) + (isRunning ? 0.25 : 0) + (twoOut ? 0.1 : 0) - 0.12 * z(arm);
        target = chance(clamp(ps + agg * 1.2, 0.02, 0.9)) && !nb[2] ? 3 : 2;
        // 积极跑垒抢三垒，偶尔会被传杀
        if (target === 3 && off.runAgg > 0 && chance(clamp(0.16 - 0.1 * z(spd) + 0.08 * z(arm), 0.02, 0.3))) {
          if (this.outs < 3) {
            this.outs++;
            dfn.pbox(dfn.pitcher).outs++;
            moves.push({ pid: r.pid, from: i + 1, to: 3, out: true });
            continue;
          }
        }
      } else if (bases === 2 && i === 0) {
        const ps = 0.38 + 0.25 * z(spd) + (twoOut ? 0.25 : 0) + (isRunning ? 0.25 : 0) - 0.12 * z(arm);
        if (ps >= 0.45 - agg) {
          target = 4;
          out = !chance(Math.min(0.96, ps + 0.2));
        } else target = 3;
      }
      target = Math.min(4, target);
      while (target <= 3 && nb[target - 1]) target++;
      if (target >= 4) {
        if (this.outs >= 3) continue;
        if (out) {
          this.outs++;
          dfn.pbox(dfn.pitcher).outs++;
          moves.push({ pid: r.pid, from: i + 1, to: 4, out: true });
          outAtHome = true;
        } else {
          moves.push({ pid: r.pid, from: i + 1, to: 4, out: false });
          scored.push(r);
        }
      } else {
        nb[target - 1] = r;
        moves.push({ pid: r.pid, from: i + 1, to: target, out: false });
      }
    }
    nb[bases - 1] = { pid: b.id, resp: dfn.pitcher, unearned: false };
    moves.push({ pid: b.id, from: 0, to: bases, out: false });
    this.bases = nb;
    const runs = scored.filter((r) => this.scoreRun(r, b.id)).length;
    this.patchLast(moves, runs);
    const e = this.lastEv();
    if (e) {
      if (outAtHome) e.text += ` 跑者冲本垒——被${nm(f)}的传球刺杀！`;
      if (runs) e.text += ` ${runs}分入账！`;
      if (runs >= 2) this.highlights.push(`${this.inning}局 ${nm(b)}（${off.s.short}）${runs}分打点安打`);
    }
    if (this.checkWalkoff()) return;
    this.endPA();
  }

  // ======================= 总结 =======================
  summary(): MatchSummary {
    const T = this.T;
    const fix = (b: BoxBat): BoxBat => ({ ...b, pa: b.ab + b.bb + b.hbp + b.sac + b.sf });
    return {
      score: [T[0].runs, T[1].runs],
      innings: this.inning,
      winner: this.winner,
      hits: [T[0].hits, T[1].hits],
      errors: [T[0].errors, T[1].errors],
      line: [T[0].line.slice(), T[1].line.slice()],
      called: this.called,
      bat: [[...T[0].bat.values()].map(fix), [...T[1].bat.values()].map(fix)],
      pit: [[...T[0].pit.values()], [...T[1].pit.values()]],
      wp: this.candW[this.winner] ?? null,
      lp: this.candL[(1 - this.winner) as 0 | 1] ?? null,
      mvp: this.computeMvp(),
      highlights: this.highlights.slice(),
    };
  }

  private computeMvp(): number | null {
    const t = this.T[this.winner];
    let best: number | null = null;
    let bv = -Infinity;
    for (const b of t.bat.values()) {
      const v = b.h * 1.2 + b.d * 0.6 + b.t * 1 + b.hr * 2.2 + b.rbi * 1.1 + b.r * 0.4 + b.sb * 0.5 + b.bb * 0.4;
      if (v > bv) {
        bv = v;
        best = b.pid;
      }
    }
    for (const p of t.pit.values()) {
      const v = p.outs / 3.2 + p.so * 0.35 - p.er * 1.4 - p.bb * 0.2;
      if (v > bv) {
        bv = v;
        best = p.pid;
      }
    }
    return best;
  }
}
