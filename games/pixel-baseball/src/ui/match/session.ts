// 亲自指挥的比赛（界面这一层）：开赛前确认阵容、每个打席的指令、托管、逐事件的演出
import type { LiveAct, PendingMatch, PitchType, Player, Pos } from '../../core/types';
import { PITCH_DEFS } from '../../data/pitches';
import type { BatCmd, BipInfo, PitchInfo, PitchPlan, PitchResult, PlayEvent, Snap } from '../../sim/types';
import { LiveGame, type Intel } from '../../core/live';
import type { PAMemo } from '../../sim/types';
import { G } from '../../core/state';
import { finishPending } from '../../core/sim';
import { simulatePending } from '../../core/matchday';
import { RES_NAME } from '../../sim/adapt';
import { MatchStage, type StageScene, type Swing } from '../../render/stage';
import { FieldRenderer } from '../../render/field';
import type { Look } from '../../render/figure';
import { faceColors } from '../../render/portrait';
import { PAL } from '../../render/pix';
import { settings, saveSettings } from '../settings';
import { refresh, toast, ui } from '../store';
import { sfx } from '../sound';
import { saveGame } from '../../core/save';

export type MState = 'pregame' | 'ready' | 'playing' | 'over';
/** 打席自动化：全部亲自 / 关键时刻才问我 / 只指挥进攻 / 只指挥防守 / 全部交给教练 */
export type AutoMode = 'off' | 'key' | 'bat' | 'pitch' | 'all';

export const AUTO_NAME: Record<AutoMode, string> = { off: '每个打席都亲自指挥', key: '关键时刻才问我', bat: '只指挥进攻', pitch: '只指挥防守', all: '全部交给教练' };

export const DEFAULT_BAT: BatCmd = { app: 'normal', sit: 'none', zone: 'none', run: 'none', agg: 0 };
export const DEFAULT_PLAN: PitchPlan = { mix: 'auto', finisher: null, focus: 'auto', approach: 'normal', align: 'normal', ibb: false, hold: false, pitchout: false };

const POS_NUM: Record<Pos, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
const HITS = new Set(['1B', '2B', '3B', 'HR', 'IH']);

export interface Disp {
  snap: Snap;
  line: [number[], number[]];
  runs: [number, number];
  hits: [number, number];
  err: [number, number];
}

/** 对决信息（演出中用打席开始时的快照，免得提前剧透结果） */
export interface MuView {
  phase: 'bat' | 'pitch';
  b: Player;
  pt: Player;
  off: 0 | 1;
  slot: number;
  pos: Pos | 'DH' | null;
  bseq: string[];
  np: number;
  outs: number;
  r: number;
  so: number;
  energy: number;
  vs: PAMemo[];
  intel: Intel;
  advice: string[];
}

export interface PitchRow {
  n: number;
  text: string;
  col: string;
}

function swingOf(res: PitchResult, bip: BipInfo | null): Swing {
  if (bip) return bip.kind === 'BU' ? 'bunt' : 'hit';
  switch (res) {
    case 'swinging':
      return 'miss';
    case 'foul':
      return 'foul';
    case 'hbp':
      return 'hbp';
    case 'bunt_foul':
      return 'buntFoul';
    case 'bunt_miss':
      return 'buntMiss';
    default:
      return 'take';
  }
}

const RES_TEXT: Partial<Record<PitchResult, string>> = { ball: '坏球', called: '好球', swinging: '挥空', foul: '界外', hbp: '触身球', bunt_foul: '触击界外', bunt_miss: '触击落空', pitchout: '吊球', inplay: '击中' };
const RES_COL: Partial<Record<PitchResult, string>> = { ball: PAL.lime, called: PAL.yellow, swinging: PAL.orange, foul: PAL.silver, hbp: PAL.red, bunt_foul: PAL.silver, bunt_miss: PAL.orange, pitchout: PAL.lime, inplay: PAL.sky };

export class MatchSession {
  readonly pm: PendingMatch;
  live: LiveGame | null = null;
  state: MState = 'pregame';
  stage: MatchStage | null = null;
  field: FieldRenderer | null = null;
  view: 'stage' | 'field' = 'stage';
  bat: BatCmd = { ...DEFAULT_BAT };
  plan: PitchPlan = { ...DEFAULT_PLAN };
  /** 开赛前指定的先发 */
  starter: number | null = null;
  /** 本局交给教练：记下是哪个半局 */
  halfAuto: string | null = null;
  lines: { t: string; big: boolean; side: 0 | 1 }[] = [];
  pitches: PitchRow[] = [];
  disp: Disp | null = null;
  /** 上一个打席的结果（大字） */
  lastRes = '';
  /** 这一打席教练已经替你下了指令（托管中） */
  coaching = false;
  /** 演出中的打席快照 */
  mu: MuView | null = null;
  private skipPA = false;
  private autoTimer = 0;
  private nums = new Map<number, number>();

  constructor(pm: PendingMatch) {
    this.pm = pm;
    if (pm.live) this.begin();
  }

  get speed(): number {
    return settings.matchSpeed ?? 2;
  }

  setSpeed(v: number): void {
    settings.matchSpeed = v;
    saveSettings();
    if (this.stage) this.stage.speed = v;
    if (this.field) this.field.speed = v;
    refresh();
  }

  get auto(): AutoMode {
    return (settings.matchAuto as AutoMode) ?? 'off';
  }

  setAuto(a: AutoMode): void {
    settings.matchAuto = a;
    saveSettings();
    refresh();
    this.maybeAuto();
  }

  // ---------------- 开始 / 结束 ----------------
  /** 开赛（读档时直接按记录恢复） */
  begin(): void {
    this.live = new LiveGame(this.pm, this.starter);
    this.numberPlayers();
    this.state = this.live.phase() === 'over' ? 'over' : 'ready';
    this.syncDisp();
    for (const e of this.live.events.slice(-40)) this.pushLine(e);
    this.prepareScene();
    saveGame();
    refresh();
    this.maybeAuto();
  }

  /** 不亲自指挥，直接出结果 */
  simNow(): void {
    const res = simulatePending(this.pm);
    finishPending(res);
    this.close();
    const win = res.summary.winner === res.mySide;
    toast(`${this.pm.label}：${win ? '胜' : '负'} ${res.summary.score[res.mySide]} - ${res.summary.score[1 - res.mySide]}`, win ? 'good' : 'bad', 4500);
  }

  /** 比赛打完：写回结果，回到主画面 */
  finish(): void {
    if (!this.live || !this.live.m.over) return;
    finishPending(this.live.result());
    this.close();
  }

  close(): void {
    window.clearTimeout(this.autoTimer);
    this.stage?.stop();
    this.field?.stop();
    ui.match = null;
    saveGame();
    refresh();
  }

  attach(stageCv: HTMLCanvasElement, fieldCv: HTMLCanvasElement): void {
    const L = this.live;
    if (!L) return;
    const away = L.away.colors;
    const home = L.home.colors;
    this.stage = new MatchStage(stageCv, { koshien: L.rules.koshien, home, away });
    this.stage.speed = this.speed;
    this.field = new FieldRenderer(fieldCv, { koshien: L.rules.koshien, fence: L.rules.fence, homeColors: home, awayColors: away, seed: this.pm.seed });
    this.field.speed = this.speed;
    this.prepareScene();
  }

  detach(): void {
    this.stage?.stop();
    this.field?.stop();
    this.stage = null;
    this.field = null;
  }

  // ---------------- 显示用的状态 ----------------
  private syncDisp(): void {
    const L = this.live;
    if (!L) return;
    const T = L.m.T;
    this.disp = {
      snap: L.m.snap(),
      line: [T[0].line.slice(), T[1].line.slice()],
      runs: [T[0].runs, T[1].runs],
      hits: [T[0].hits, T[1].hits],
      err: [T[0].errors, T[1].errors],
    };
    this.board();
  }

  private board(): void {
    const d = this.disp;
    const L = this.live;
    if (!d || !L || !this.stage) return;
    this.stage.setBoard({ away: L.away.short, home: L.home.short, score: [d.runs[0], d.runs[1]], balls: d.snap.balls, strikes: d.snap.strikes, outs: d.snap.outs });
  }

  private applyEvent(e: PlayEvent): void {
    const d = this.disp;
    if (!d) return;
    if (e.snap) d.snap = e.snap;
    if (e.runs) {
      const inn = (e.snap?.inning ?? 1) - 1;
      const ln = d.line[e.side];
      for (let k = ln.length; k <= inn; k++) ln[k] = 0;
      ln[inn] += e.runs;
      d.runs[e.side] += e.runs;
    }
    if (e.bip && HITS.has(e.bip.res)) d.hits[e.side]++;
    if (e.bip?.res === 'E') d.err[(1 - e.side) as 0 | 1]++;
    this.pushLine(e);
    this.board();
  }

  private pushLine(e: PlayEvent): void {
    if (e.k === 'pitch' && !e.big) return;
    this.lines.push({ t: e.text, big: !!e.big, side: e.side });
    if (this.lines.length > 80) this.lines.shift();
  }

  // ---------------- 人物外观 ----------------
  private numberPlayers(): void {
    const L = this.live!;
    for (const t of L.m.T) {
      const used = new Set<number>();
      for (const [pos, id] of Object.entries(t.s.defense)) {
        if (id === undefined) continue;
        this.nums.set(id, POS_NUM[pos as Pos]);
        used.add(id);
      }
      let n = 10;
      for (const p of t.s.players) if (!used.has(p.id)) this.nums.set(p.id, n++);
    }
  }

  numOf(pid: number): number {
    return this.nums.get(pid) ?? 0;
  }

  lookOf(p: Player, side: 0 | 1, role: 'bat' | 'pitch' | 'field', glove: 'a' | 'b' | null = null): Look {
    const t = this.live!.m.T[side];
    const c = t.s.colors;
    const fc = faceColors(p.face);
    const home = side === 1;
    return {
      skin: fc.skin,
      hair: fc.hair,
      cap: c.cap || c.primary,
      helmet: role === 'bat',
      shirt: home ? PAL.white : '#c3c9d4',
      sleeve: c.primary,
      sock: c.primary,
      numCol: c.primary,
      num: this.numOf(p.id) || null,
      glove,
    };
  }

  /** 设定画面：现在是谁打、谁投 */
  prepareScene(): void {
    const L = this.live;
    if (!L || !this.stage || L.phase() === 'over') return;
    const m = L.m;
    const b = m.batter();
    const p = m.pitcher();
    const off = m.half;
    const dfn = (1 - off) as 0 | 1;
    const mode = L.phase() === 'bat' ? 'bat' : 'pitch';
    const side: 'R' | 'L' = b.bats === 'S' ? (p.throws === 'R' ? 'L' : 'R') : (b.bats as 'R' | 'L');
    const hand: 'R' | 'L' = p.throws === 'L' ? 'L' : 'R';
    const glove: 'a' | 'b' = mode === 'bat' ? (hand === 'R' ? 'b' : 'a') : hand === 'R' ? 'a' : 'b';
    const offCmd = m.T[off].cmd ?? (L.phase() === 'bat' ? this.bat : null);
    const scene: StageScene = {
      mode,
      batter: { look: this.lookOf(b, off, 'bat'), side },
      pitcher: { look: this.lookOf(p, dfn, 'pitch', glove), side: hand },
      fielder: this.lookOf(m.T[dfn].get(m.T[dfn].order[0]) ?? p, dfn, 'field', 'b'),
      runner: this.lookOf(b, off, 'bat'),
      bases: [!!m.bases[0], !!m.bases[1], !!m.bases[2]],
      align: m.T[dfn].def.align,
      bunting: !!offCmd && (offCmd.app === 'bunt' || offCmd.app === 'squeeze' || offCmd.app === 'buntHit'),
    };
    this.stage.setScene(scene);
    this.board();
    this.view = 'stage';
  }

  /** 当前打席的对决信息 */
  captureMu(): MuView | null {
    const L = this.live;
    if (!L || L.phase() === 'over') return null;
    const m = L.m;
    const b = m.batter();
    const pt = m.pitcher();
    const off = m.half;
    const dfn = (1 - off) as 0 | 1;
    const pb = m.T[dfn].pbox(pt.id);
    const phase = L.phase() === 'bat' ? 'bat' : 'pitch';
    return {
      phase,
      b,
      pt,
      off,
      slot: m.T[off].batIdx + 1,
      pos: m.T[off].posOf(b.id),
      bseq: m.T[off].bbox(b.id).seq.slice(),
      np: pb.np,
      outs: pb.outs,
      r: pb.r,
      so: pb.so,
      energy: m.T[dfn].fatigueRatio(pt.id),
      vs: m.memo.filter((x) => x.bat === b.id && x.side === off),
      intel: L.intel(),
      advice: (phase === 'bat' ? L.adviceBat() : L.advicePitch()).why,
    };
  }

  /** 演出中用快照，否则用现在的 */
  muView(): MuView | null {
    return this.state === 'playing' && this.mu ? this.mu : this.captureMu();
  }

  // ---------------- 托管 ----------------
  /** 这个打席要不要问玩家 */
  needsHuman(): boolean {
    const L = this.live;
    if (!L || L.phase() === 'over') return false;
    const key = `${L.m.inning}-${L.m.half}`;
    if (this.halfAuto && this.halfAuto === key) return false;
    this.halfAuto = null;
    const ph = L.phase();
    switch (this.auto) {
      case 'all':
        return false;
      case 'bat':
        return ph === 'bat';
      case 'pitch':
        return ph === 'pitch';
      case 'key':
        return isKey(L);
      default:
        return true;
    }
  }

  /** 交给教练的打席：稍等一下再自动开始（让玩家看清教练的指示，也可以随时接手） */
  maybeAuto(): void {
    window.clearTimeout(this.autoTimer);
    if (this.state !== 'ready' || !this.live || this.live.phase() === 'over') return;
    if (this.needsHuman()) {
      this.coaching = false;
      refresh();
      return;
    }
    this.coaching = true;
    refresh();
    this.autoTimer = window.setTimeout(() => {
      if (this.state !== 'ready' || this.needsHuman()) {
        this.coaching = false;
        refresh();
        return;
      }
      this.live!.coachTurn();
      this.prepareScene();
      void this.runPA();
    }, Math.max(150, 900 / this.speed));
  }

  /** 本局剩下的打席交给教练 */
  autoHalf(): void {
    const L = this.live;
    if (!L) return;
    this.halfAuto = `${L.m.inning}-${L.m.half}`;
    this.maybeAuto();
  }

  /** 交给教练直接打完（不看过程） */
  toEnd(): void {
    const L = this.live;
    if (!L || this.state === 'playing') return;
    window.clearTimeout(this.autoTimer);
    L.coachToEnd();
    this.syncDisp();
    for (const e of L.events.slice(-30)) this.pushLine(e);
    this.state = 'over';
    saveGame();
    refresh();
  }

  // ---------------- 玩家的操作 ----------------
  /** 代打、代跑、换投、守备替换、牵制 */
  act(a: LiveAct): void {
    const L = this.live;
    if (!L || this.state !== 'ready') return;
    const ev = L.act(a);
    if (!ev.length && a.k !== 'bat' && a.k !== 'pitch') {
      toast('这个操作现在不行', 'bad');
      return;
    }
    for (const e of ev) this.applyEvent(e);
    if (a.k === 'po') {
      const last = ev[ev.length - 1];
      if (last) toast(last.text, last.big ? 'good' : 'info');
    }
    if (L.phase() === 'over') this.state = 'over';
    this.syncDisp();
    this.prepareScene();
    saveGame();
    refresh();
  }

  /** 玩家按下「开始打席」 */
  go(): void {
    const L = this.live;
    if (!L || this.state !== 'ready') return;
    window.clearTimeout(this.autoTimer);
    if (L.phase() === 'bat') L.act({ k: 'bat', c: { ...this.bat } });
    else if (L.phase() === 'pitch') L.act({ k: 'pitch', c: { ...this.plan } });
    // 一次性的指示用过就收回
    this.bat.run = 'none';
    this.plan.ibb = false;
    this.plan.pitchout = false;
    void this.runPA();
  }

  /** 跳过这个打席的动画 */
  skip(): void {
    this.skipPA = true;
    this.stage?.skip();
    this.field?.stop();
  }

  // ---------------- 打一个打席 ----------------
  private async runPA(): Promise<void> {
    const L = this.live;
    if (!L || this.state !== 'ready') return;
    this.state = 'playing';
    this.coaching = false;
    const memoN = L.m.memo.length;
    this.pitches = [];
    this.mu = this.captureMu();
    this.prepareScene();
    refresh();
    const events = L.play();
    try {
      await this.animate(events);
    } catch (e) {
      console.error('animate', e);
    }
    this.skipPA = false;
    this.mu = null;
    this.stage?.resume();
    // 打席结果
    const mm = L.m.memo.length > memoN ? L.m.memo[L.m.memo.length - 1] : null;
    this.lastRes = mm ? RES_NAME[mm.res] : '';
    this.syncDisp();
    this.state = L.phase() === 'over' ? 'over' : 'ready';
    if (this.state === 'over') {
      const win = L.m.winner === L.mySide;
      sfx(win ? 'win' : 'lose');
    }
    this.prepareScene();
    saveGame();
    refresh();
    this.maybeAuto();
  }

  private lvOf(t: PitchInfo['type']): number {
    if (t === 'FB') return 0;
    const p = this.live!.m.pitcher();
    return p.pitches.find((x) => x.type === t)?.lv ?? 3;
  }

  private async animate(events: PlayEvent[]): Promise<void> {
    const st = this.stage;
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!st || this.skipPA) {
        this.applyEvent(e);
        if (e.pitch) this.pitches.push({ n: this.pitches.length + 1, text: pitchText(e.pitch), col: RES_COL[e.pitch.res] ?? PAL.white });
        continue;
      }
      if (e.pitch) {
        const bip = e.bip ?? null;
        const swing = swingOf(e.pitch.res, bip);
        const n = this.pitches.length + 1;
        if (swing === 'hit' || swing === 'bunt' || swing === 'foul') sfx('bat');
        await st.pitch(e.pitch, swing, bip, n, this.lvOf(e.pitch.type));
        if (swing === 'take' || swing === 'miss') sfx('mitt');
        this.pitches.push({ n, text: pitchText(e.pitch), col: RES_COL[e.pitch.res] ?? PAL.white });
        if (bip && e.k === 'play') {
          await this.fieldPlay(e);
          if (bip.res === 'HR') sfx('hr');
        } else if (e.moves?.length) await this.fieldMoves(e);
        this.applyEvent(e);
        refresh();
        continue;
      }
      if ((e.k === 'steal' || e.k === 'wp' || e.k === 'pickoff' || e.k === 'play') && e.moves?.length) {
        await this.fieldMoves(e);
        this.applyEvent(e);
        refresh();
        continue;
      }
      this.applyEvent(e);
      if (e.k === 'play' && !e.bip) {
        // 三振、四坏球等打席结果
        const t = e.text.includes('三振') ? '三振' : e.text.includes('四坏') ? '四坏球' : e.text.includes('触身') ? '触身球' : '';
        if (t) await st.banner(t, t === '三振' ? (e.side === this.live!.mySide ? PAL.orange : PAL.yellow) : PAL.lime, '', 0.7);
      }
      if (e.k === 'ibb') await st.banner('敬远', PAL.lime, '', 0.8);
      refresh();
    }
  }

  /** 打出去的球：切到俯视球场看球路和跑垒 */
  private async fieldPlay(e: PlayEvent): Promise<void> {
    const fd = this.field;
    const L = this.live!;
    if (!fd || !e.bip) return;
    const prev = this.disp?.snap.bases ?? [null, null, null];
    const dfn = (1 - e.side) as 0 | 1;
    fd.setDefense(dfn === 1);
    fd.setAlignment(L.m.T[dfn].def.align);
    fd.resetPositions();
    fd.setBases(prev);
    fd.batterSide = L.m.batter().bats === 'L' ? 'L' : 'R';
    fd.speed = this.speed;
    this.view = 'field';
    refresh();
    await fd.playBip(e.bip, e.moves ?? []);
    const big = e.bip.res === 'HR' ? '本垒打！！' : HITS.has(e.bip.res) ? '安打！' : e.bip.res === 'E' ? '失误！' : e.bip.res === 'DP' ? '双杀！' : '';
    if (big) {
      fd.showFlash(big, e.bip.res === 'HR' ? PAL.yellow : e.side === L.mySide ? PAL.lime : PAL.orange, 1.1);
      await sleep(900 / this.speed);
    } else await sleep(450 / this.speed);
    this.view = 'stage';
    refresh();
  }

  private async fieldMoves(e: PlayEvent): Promise<void> {
    const fd = this.field;
    const L = this.live!;
    if (!fd || !e.moves?.length) return;
    const prev = this.disp?.snap.bases ?? [null, null, null];
    const dfn = (1 - e.side) as 0 | 1;
    fd.setDefense(dfn === 1);
    fd.setAlignment(L.m.T[dfn].def.align);
    fd.resetPositions();
    fd.setBases(prev);
    fd.speed = this.speed;
    this.view = 'field';
    refresh();
    await fd.playMoves(e.moves, 0.7);
    await sleep(350 / this.speed);
    this.view = 'stage';
    this.stage?.setBases([!!e.snap?.bases[0], !!e.snap?.bases[1], !!e.snap?.bases[2]]);
    refresh();
  }
}

/** 关键时刻：后半段比分接近且有跑者、满垒、九局以后一分差 */
export function isKey(L: LiveGame): boolean {
  const m = L.m;
  const diff = Math.abs(m.T[0].runs - m.T[1].runs);
  if (m.isKeyMoment()) return true;
  if (m.inning >= 7 && diff <= 3 && m.bases.some(Boolean)) return true;
  if (m.bases.every(Boolean)) return true;
  if (m.inning >= 9 && diff <= 1) return true;
  return false;
}

export function pitchText(p: PitchInfo): string {
  const name = p.sig ?? (p.type === 'FB' ? '直球' : undefined);
  return `${name ?? pitchNameOf(p.type)} ${p.kmh}km/h ${RES_TEXT[p.res] ?? ''}`;
}

function pitchNameOf(t: PitchType | 'FB'): string {
  return t === 'FB' ? '直球' : PITCH_DEFS[t].name;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 这场比赛要不要亲自指挥 */
export function shouldCommand(pm: PendingMatch): boolean {
  const c = settings.command ?? 'official';
  if (c === 'off') return false;
  if (c === 'all') return true;
  if (!pm.tour) return false;
  if (c === 'official') return true;
  const t = G.tours[pm.tour];
  if (!t) return false;
  if (pm.tour === 'koshien' || pm.tour === 'senbatsu' || pm.tour === 'jingu') return true;
  if (pm.tour === 'summerPref') return pm.round >= t.rounds.length - 3;
  return pm.round >= t.rounds.length - 2;
}
