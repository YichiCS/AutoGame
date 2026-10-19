// 亲自指挥的比赛（界面这一层）：开赛前确认阵容；之后一球一球地下指令——
// 投球时选球种、在网格上点瞄准点；打击时看投手这一球的热区图，选狙哪一格（或不挥棒）、跑者要不要提前跑。
// 也可以交给教练（整场、本局、或者只在关键时刻问我），逐事件演出。
import type { LiveAct, PendingMatch, PitchType, Player, Pos } from '../../core/types';
import { PITCH_DEFS } from '../../data/pitches';
import type { Alignment, BipInfo, PitchInfo, PitchResult, PlayEvent, Snap } from '../../sim/types';
import { LiveGame } from '../../core/live';
import { G } from '../../core/state';
import { finishPending } from '../../core/sim';
import { simulatePending } from '../../core/matchday';
import { RES_NAME } from '../../sim/labels';
import { CELL, arsenal, batSide, clampRange, coverMap, density, hotZones, nearZone, pickoffSkill, rangeCenter, spreadOf, type PitchOpt } from '../../sim/pitching';
import { batterView, eyeAccuracy } from '../../sim/brain';
import { fullName } from '../../core/attrs';
import { hash32 } from '../../core/rng';
import { HEAT_BAT, MatchStage, type Hud, type StageScene, type Swing } from '../../render/stage';
import { FieldRenderer } from '../../render/field';
import type { Look } from '../../render/figure';
import { faceColors } from '../../render/portrait';
import { PAL } from '../../render/pix';
import { settings, saveSettings } from '../settings';
import { refresh, toast, ui } from '../store';
import { cueSound, sfx } from '../sound';
import { saveGame } from '../../core/save';

export type MState = 'pregame' | 'ready' | 'playing' | 'over';
/** 自动指挥：每一球都亲自 / 关键时刻才问我 / 只指挥进攻 / 只指挥防守 / 全部交给教练 */
export type AutoMode = 'off' | 'key' | 'bat' | 'pitch' | 'all';

export const AUTO_NAME: Record<AutoMode, string> = { off: '每一球都亲自指挥', key: '关键时刻才问我', bat: '只指挥进攻', pitch: '只指挥防守', all: '全部交给教练' };

const POS_NUM: Record<Pos, number> = { P: 1, C: 2, '1B': 3, '2B': 4, '3B': 5, SS: 6, LF: 7, CF: 8, RF: 9 };
const HITS = new Set(['1B', '2B', '3B', 'HR', 'IH']);

export interface Disp {
  snap: Snap;
  line: [number[], number[]];
  runs: [number, number];
  hits: [number, number];
  err: [number, number];
}

/** 这一球的对决（演出中用这一球之前的快照，免得提前剧透） */
export interface MuView {
  phase: 'bat' | 'pitch';
  b: Player;
  pt: Player;
  off: 0 | 1;
  slot: number;
  pos: Pos | 'DH' | null;
  bseq: string[];
  /** 打者面对这个投手站哪边 */
  side: 'R' | 'L';
  hot: number[];
  np: number;
  outs: number;
  r: number;
  so: number;
  /** 投手剩下的体力 0..1 */
  stamina: number;
  /** 投手各球种此刻的质量 */
  ars: PitchOpt[];
  pickoff: number;
  /** 投手的心态 -1..1（正 = 有信心，负 = 动摇） */
  mood: number;
  /** 打者读投手的准确度 0..1（选球眼） */
  eyeAcc: number;
  /** 这一球之前的垒上跑者、离垒、还能牵制几次、守方阵型（演出中用这个快照：按钮的多少不变，画面不跟着缩放，不剧透） */
  runners: ({ pid: number; name: string; speed: number; lead: 'big' | 'normal' | null } | null)[];
  pickLeft: number;
  align: Alignment;
  /** 投手今天的配球：球数、各球种比例（多的在前）、偏内外角（+ 外角多）、偏高低（+ 高球多） */
  tend: { n: number; types: [string, number][]; side: number; height: number };
}

/** 守备阵型按钮：趋近（防触击、双杀）/ 正常 / 防长打 */
export type AlignKey = 'close' | 'normal' | 'deep';

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
  /** 开赛前指定的先发 */
  starter: number | null = null;
  /** 本局交给教练：记下是哪个半局 */
  halfAuto: string | null = null;
  lines: { t: string; big: boolean; side: 0 | 1 }[] = [];
  pitches: PitchRow[] = [];
  disp: Disp | null = null;
  /** 上一个打席的结果（大字） */
  lastRes = '';
  /** 这一球教练替你下指令（托管中） */
  coaching = false;
  /** 演出中的快照 */
  mu: MuView | null = null;
  // ---- 这一球的选择 ----
  /** 投球：球种、瞄准点 */
  ptype: PitchType | 'FB' = 'FB';
  aim: { x: number; y: number } | null = null;
  /** 打击：挥棒范围（3×3）中心格的列、行（好球带 9×9 的格，-1 和 9 是外面一圈坏球区）；null 还没选。taking：这一球按了「不挥棒」 */
  hunt: [number, number] | null = null;
  taking = false;
  run: [boolean, boolean, boolean] = [false, false, false];
  private skipPA = false;
  private autoTimer = 0;
  private nums = new Map<number, number>();
  private paKey = '';
  private heatCache: { key: string; heat: number[] } | null = null;

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
    if (this.live.restarted) toast('比赛规则更新了，这场比赛从第一局重新开始', 'info', 5000);
    this.numberPlayers();
    this.state = this.live.phase() === 'over' ? 'over' : 'ready';
    this.syncDisp();
    for (const e of this.live.events.slice(-40)) this.pushLine(e);
    this.newPitch();
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
    // 出手、挥棒、碰到球、进手套、接球、传球……在动画的那一刻出声（跳过时不出声）
    this.stage.onCue = (c) => {
      if (!this.skipPA) cueSound(c);
    };
    this.field.onCue = (c) => {
      if (!this.skipPA) cueSound(c);
    };
    this.paKey = '';
    this.prepareScene();
    this.updateHud();
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
    const side = batSide(b, p.throws);
    const hand: 'R' | 'L' = p.throws === 'L' ? 'L' : 'R';
    const glove: 'a' | 'b' = mode === 'bat' ? (hand === 'R' ? 'b' : 'a') : hand === 'R' ? 'a' : 'b';
    const scene: StageScene = {
      mode,
      batter: { look: this.lookOf(b, off, 'bat'), side },
      pitcher: { look: this.lookOf(p, dfn, 'pitch', glove), side: hand },
      fielder: this.lookOf(m.T[dfn].get(m.T[dfn].order[0]) ?? p, dfn, 'field', 'b'),
      runner: this.lookOf(b, off, 'bat'),
      bases: [!!m.bases[0], !!m.bases[1], !!m.bases[2]],
      align: m.T[dfn].def.align,
      bunting: false,
    };
    // 同一个打席的同一个对决就不重设（保留这个打席每一球的落点）
    const key = `${m.inning}-${m.half}-${m.paNo}-${b.id}-${p.id}-${mode}`;
    if (key !== this.paKey) {
      this.paKey = key;
      this.stage.setScene(scene);
    } else this.stage.setBases(scene.bases);
    this.view = 'stage';
  }

  /** 这一球的对决信息 */
  captureMu(): MuView | null {
    const L = this.live;
    if (!L || L.phase() === 'over') return null;
    const m = L.m;
    const b = m.batter();
    const pt = m.pitcher();
    const off = m.half;
    const dfn = (1 - off) as 0 | 1;
    const pb = m.T[dfn].pbox(pt.id);
    const side = batSide(b, pt.throws);
    return {
      phase: L.phase() === 'bat' ? 'bat' : 'pitch',
      b,
      pt,
      off,
      slot: m.T[off].batIdx + 1,
      pos: m.T[off].posOf(b.id),
      bseq: m.T[off].bbox(b.id).seq.slice(),
      side,
      hot: hotZones(b, side),
      np: pb.np,
      outs: pb.outs,
      r: pb.r,
      so: pb.so,
      stamina: Math.max(0, 1 - m.T[dfn].fatigueRatio(pt.id)),
      ars: arsenal(pt, m.pitcherNow()),
      pickoff: Math.round(pickoffSkill(pt)),
      mood: m.moodNow(),
      eyeAcc: eyeAccuracy(b),
      runners: m.bases.map((r, i) => {
        if (!r) return null;
        const rp = m.T[off].get(r.pid);
        return { pid: r.pid, name: fullName(rp), speed: rp.a.speed, lead: m.leads[i] ?? null };
      }),
      pickLeft: m.pickoffsLeft(),
      align: m.T[dfn].def.align,
      tend: m.tendency(pt.id, side),
    };
  }

  muView(): MuView | null {
    return this.state === 'playing' && this.mu ? this.mu : this.captureMu();
  }

  // ---------------- 这一球的选择与网格 ----------------
  /** 新的一球：重设选择（新打席还要清掉落点、瞄准点），刷新画面 */
  private newPitch(): void {
    const L = this.live;
    if (!L) return;
    const m = L.m;
    const prevKey = this.paKey;
    this.prepareScene();
    const newPA = this.paKey !== prevKey;
    if (newPA) {
      this.aim = null;
      this.hunt = null;
      this.pitches = [];
    }
    this.taking = false;
    this.run = [false, false, false];
    if (L.phase() === 'pitch') {
      const p = m.pitcher();
      if (this.ptype !== 'FB' && !p.pitches.some((x) => x.type === this.ptype)) this.ptype = 'FB';
    }
    this.updateHud();
  }

  /** 打击时：打者眼里投手这一球的热区图（选球眼越好越准；按比赛种子和第几球固定，同一球怎么看都一样） */
  heat(): number[] | null {
    const L = this.live;
    if (!L || L.phase() !== 'bat') return null;
    const key = `${L.step}-${L.m.batter().id}`;
    if (this.heatCache?.key === key) return this.heatCache.heat;
    const heat = batterView(L.m, this.pm.seed, L.step);
    if (!heat) return null;
    this.heatCache = { key, heat };
    return heat;
  }

  /** 投球时：瞄准点的散布预览 */
  preview(): number[] | null {
    const L = this.live;
    if (!L || L.phase() !== 'pitch' || !this.aim) return null;
    const m = L.m;
    const p = m.pitcher();
    const now = m.pitcherNow();
    const q = arsenal(p, now).find((a) => a.type === this.ptype)?.q ?? 40;
    const sp = spreadOf(this.ptype, p.throws, now.ctl, q, m.dfn.fatigueRatio(p.id));
    return density([{ x: this.aim.x, y: this.aim.y, w: 1, sp }], hash32(this.pm.seed, L.step, 9), 900);
  }

  updateHud(): void {
    const L = this.live;
    if (!this.stage || !L) return;
    const ph = L.phase();
    const mu = this.captureMu();
    const active = this.state === 'ready' && !this.coaching && ph !== 'over';
    const hud: Hud =
      ph === 'bat'
        ? { heat: this.heat(), heatCol: HEAT_BAT, hot: mu?.hot ?? null, aim: null, hunt: this.huntXY(), cover: this.cover(), take: this.taking, active }
        : ph === 'pitch'
          ? { heat: this.preview(), heatCol: PAL.cyan, hot: mu?.hot ?? null, aim: this.aim, hunt: null, cover: null, take: false, active }
          : { heat: null, heatCol: HEAT_BAT, hot: null, aim: null, hunt: null, cover: null, take: false, active: false };
    this.stage.setHud(hud);
  }

  /** 挥棒热区（121 格的「合」）：以挥棒点为中心，宽窄看这名打者的击球能力 */
  cover(): number[] | null {
    const L = this.live;
    const xy = this.huntXY();
    if (!L || !xy || L.phase() !== 'bat') return null;
    return coverMap(xy.x, xy.y, L.m.batter().a.contact);
  }

  /** 对齐度：投手的热区（打者眼里的）和挥棒热区重合多少（0..1，「这一球合得上」的期望） */
  alignScore(): number | null {
    const heat = this.heat();
    const cov = this.cover();
    if (!heat || !cov) return null;
    let s = 0;
    let t = 0;
    for (let i = 0; i < heat.length; i++) {
      s += heat[i] * cov[i];
      t += heat[i];
    }
    return t > 0 ? s / t : null;
  }

  /** 挥棒点（好球带坐标） */
  huntXY(): { x: number; y: number } | null {
    if (!this.hunt) return null;
    const [x, y] = rangeCenter(this.hunt);
    return { x, y };
  }

  /** 点了画面上的某一点（画布坐标） */
  tap(px: number, py: number): void {
    const L = this.live;
    if (!L || !this.stage || this.state !== 'ready' || this.coaching) return;
    if (L.phase() === 'pitch') {
      const c = this.stage.cellAtPoint(px, py);
      if (!c) return;
      // 点同一格两次：直接投
      if (this.aim && Math.abs(this.aim.x - c.x) < 1e-6 && Math.abs(this.aim.y - c.y) < 1e-6) {
        this.go();
        return;
      }
      this.aim = c;
      sfx('aim');
    } else if (L.phase() === 'bat') {
      const cell = this.stage.cellAtPoint(px, py);
      if (!cell) return;
      // 点到的格子当挥棒点，挥棒热区（宽窄看击球能力）以它为中心（外面一圈坏球区也可以——专等引诱球）。点同一格两次：直接挥
      const c = clampRange((cell.x + 1) / CELL - 0.5, (1 - cell.y) / CELL - 0.5);
      if (this.hunt && this.hunt[0] === c[0] && this.hunt[1] === c[1]) {
        this.go();
        return;
      }
      this.hunt = c;
      sfx('aim');
    }
    this.updateHud();
    refresh();
  }

  setPitchType(t: PitchType | 'FB'): void {
    this.ptype = t;
    this.updateHud();
    refresh();
  }

  /** 这一球不挥棒：马上开始（跑者照「提前跑」的选择） */
  take(): void {
    const L = this.live;
    if (!L || this.state !== 'ready' || this.coaching || L.phase() !== 'bat') return;
    window.clearTimeout(this.autoTimer);
    this.taking = true;
    L.act({ k: 'swing', z: -1, run: [...this.run] as [boolean, boolean, boolean] });
    void this.runPitch();
  }

  /** 申告敬远（防守时） */
  ibb(): void {
    const L = this.live;
    if (!L || this.state !== 'ready' || this.coaching || L.phase() !== 'pitch') return;
    window.clearTimeout(this.autoTimer);
    const mu = this.captureMu();
    const memoN = L.m.memo.length;
    void this.runPlay(() => L.act({ k: 'ibb' }), mu, memoN);
  }

  /** 守备阵型（防守时；一直有效，直到再改） */
  setAlign(a: AlignKey): void {
    const L = this.live;
    if (!L || this.state !== 'ready' || L.phase() !== 'pitch') return;
    L.act({ k: 'al', a });
    saveGame();
    refresh();
  }

  /** 我方现在的守备阵型 */
  get align(): AlignKey {
    const a = this.live?.myTeam.def.align;
    return a === 'close' ? 'close' : a === 'noDoubles' ? 'deep' : 'normal';
  }

  toggleRun(i: number): void {
    this.run[i] = !this.run[i];
    refresh();
  }

  /** 这一球可以开始了吗（投球要有瞄准点；打击要定好挥棒范围） */
  canGo(): boolean {
    const L = this.live;
    if (!L || this.state !== 'ready' || this.coaching) return false;
    return L.phase() === 'pitch' ? !!this.aim : this.hunt !== null;
  }

  // ---------------- 托管 ----------------
  /** 这一球要不要问玩家 */
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

  /** 交给教练的一球：稍等一下再自动开始（随时可以接手） */
  maybeAuto(): void {
    window.clearTimeout(this.autoTimer);
    if (this.state !== 'ready' || !this.live || this.live.phase() === 'over') return;
    if (this.needsHuman()) {
      this.coaching = false;
      this.updateHud();
      refresh();
      return;
    }
    this.coaching = true;
    this.updateHud();
    refresh();
    this.autoTimer = window.setTimeout(() => {
      if (this.state !== 'ready' || this.needsHuman()) {
        this.coaching = false;
        this.updateHud();
        refresh();
        return;
      }
      const L = this.live!;
      const mu = this.captureMu();
      const memoN = L.m.memo.length;
      const ev = L.coachTurn();
      // 教练申告了敬远：演出敬远（这个打席就结束了）
      if (ev.some((e) => e.k === 'ibb')) {
        void this.runPlay(() => ev, mu, memoN);
        return;
      }
      for (const e of ev) this.applyEvent(e);
      this.newPitch();
      void this.runPitch();
    }, Math.max(120, 600 / this.speed));
  }

  /** 我来指挥：停掉托管 */
  takeOver(): void {
    this.halfAuto = null;
    if (this.auto !== 'off') this.setAuto('off');
    else this.maybeAuto();
  }

  /** 本局剩下的交给教练 */
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
    this.updateHud();
    saveGame();
    refresh();
  }

  // ---------------- 玩家的操作 ----------------
  /** 代打、代跑、换投、守备替换、牵制 */
  act(a: LiveAct): void {
    const L = this.live;
    if (!L || this.state !== 'ready') return;
    const ev = L.act(a);
    if (!ev.length) {
      toast('这个操作现在不行', 'bad');
      return;
    }
    for (const e of ev) this.applyEvent(e);
    if (a.k === 'po') {
      sfx('pickoff');
      const last = ev.find((e) => e.k === 'pickoff') ?? ev[ev.length - 1];
      if (last) toast(last.text, last.big ? 'good' : 'info');
    }
    if (L.phase() === 'over') this.state = 'over';
    this.syncDisp();
    this.newPitch();
    saveGame();
    refresh();
    this.maybeAuto();
  }

  /** 玩家下达这一球的指令并开始 */
  go(): void {
    const L = this.live;
    if (!L || !this.canGo()) return;
    window.clearTimeout(this.autoTimer);
    if (L.phase() === 'pitch' && this.aim) L.act({ k: 'throw', t: this.ptype, x: this.aim.x, y: this.aim.y });
    else if (L.phase() === 'bat' && this.hunt) {
      // 一定挥：朝着挥棒范围
      const [hx, hy] = rangeCenter(this.hunt);
      L.act({ k: 'swing', z: nearZone(hx, hy), run: [...this.run] as [boolean, boolean, boolean], commit: true, c: [this.hunt[0], this.hunt[1]] });
    }
    void this.runPitch();
  }

  /** 跳过这一球的动画 */
  skip(): void {
    this.skipPA = true;
    this.stage?.skip();
    this.field?.stop();
  }

  // ---------------- 投一球 ----------------
  private async runPitch(): Promise<void> {
    const L = this.live;
    if (!L) return;
    await this.runPlay(() => L.pitch());
  }

  /** 执行并演出（投一球、敬远）。mu、memoN0：演出期间显示的对决快照、执行前的打席数（事先已经执行了的要传进来） */
  private async runPlay(produce: () => PlayEvent[], mu: MuView | null = null, memoN0 = -1): Promise<void> {
    const L = this.live;
    if (!L || this.state !== 'ready') return;
    this.state = 'playing';
    this.coaching = false;
    const memoN = memoN0 >= 0 ? memoN0 : L.m.memo.length;
    this.mu = mu ?? this.captureMu();
    this.updateHud();
    refresh();
    const events = produce();
    try {
      await this.animate(events);
    } catch (e) {
      console.error('animate', e);
    }
    this.skipPA = false;
    this.mu = null;
    this.stage?.resume();
    const mm = L.m.memo.length > memoN ? L.m.memo[L.m.memo.length - 1] : null;
    if (mm) this.lastRes = RES_NAME[mm.res];
    this.syncDisp();
    this.state = L.phase() === 'over' ? 'over' : 'ready';
    if (this.state === 'over') {
      const win = L.m.winner === L.mySide;
      sfx(win ? 'win' : 'lose');
    }
    this.newPitch();
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
        // 出手、挥棒、碰到球、进手套的声音由动画在那一刻触发（onCue）
        await st.pitch(e.pitch, swing, bip, n, this.lvOf(e.pitch.type));
        this.pitches.push({ n, text: pitchText(e.pitch), col: RES_COL[e.pitch.res] ?? PAL.white });
        if (bip && e.k === 'play') {
          await this.fieldPlay(e);
        } else if (e.moves?.length) await this.fieldMoves(e);
        this.applyEvent(e);
        refresh();
        continue;
      }
      if ((e.k === 'steal' || e.k === 'wp' || e.k === 'pickoff' || e.k === 'play') && e.moves?.length) {
        if (e.k === 'pickoff') {
          sfx('pickoff');
          await st.banner('牵制！', PAL.cyan, '', 0.5);
        }
        await this.fieldMoves(e);
        this.applyEvent(e);
        refresh();
        continue;
      }
      this.applyEvent(e);
      if (e.k === 'pickoff') await st.banner('牵制', PAL.cyan, e.text.includes('安全') ? '安全回垒' : '', 0.7);
      if (e.k === 'play' && !e.bip) {
        // 三振、四坏球等打席结果
        const t = e.text.includes('三振') ? '三振' : e.text.includes('四坏') ? '四坏球' : e.text.includes('触身') ? '触身球' : '';
        if (t) await st.banner(t, t === '三振' ? (e.side === this.live!.mySide ? PAL.orange : PAL.yellow) : PAL.lime, '', 0.7);
      }
      if (e.k === 'ibb') {
        sfx('ibb');
        await st.banner('敬远', PAL.lime, '', 0.8);
      }
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
  const name = p.sig ? `「${p.sig}」` : p.type === 'FB' ? '直球' : PITCH_DEFS[p.type].name;
  return `${name} ${p.kmh}km/h ${RES_TEXT[p.res] ?? ''}`;
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
