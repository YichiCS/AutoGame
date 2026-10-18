// 亲自指挥的比赛：以打席为单位推进。
// 比赛用自己的随机数；玩家（或教练）的每一个操作都记进 pm.live，读档时从头按记录重演，结果完全一样。
import type { LiveAct, LiveRecord, PendingMatch, Pos } from './types';
import type { BatCmd, MatchRules, PitchPlan, PlayEvent, TeamSetup } from '../sim/types';
import { Match, type TeamState } from '../sim/match';
import * as Adapt from '../sim/adapt';
import { G } from './state';
import { getRngState, seedRng, setRngState, withSeed } from './rng';
import { mySetupFull, oppSetup, rulesFor, tourOf, type SimResult } from './matchday';
import { schoolById } from './world';

export type Phase = 'bat' | 'pitch' | 'over';

/** 对方这个打席的打算，玩家看得到多少 */
export interface Intel {
  seen: boolean;
  why: string[];
  plan: PitchPlan | null;
  cmd: BatCmd | null;
}

export class LiveGame {
  readonly pm: PendingMatch;
  readonly rules: MatchRules;
  readonly away: TeamSetup;
  readonly home: TeamSetup;
  readonly mySide: 0 | 1;
  readonly m: Match;
  /** 开赛前自动补位的说明 */
  readonly notes: string[];
  readonly rec: LiveRecord;
  private rng: number[];
  /** 第几个打席步（每打完一个打席加一） */
  step = 0;
  /** 本场到目前为止的全部事件 */
  events: PlayEvent[] = [];
  /** 重演中（读档恢复） */
  replaying = false;

  constructor(pm: PendingMatch, forcedStarter: number | null = null) {
    this.pm = pm;
    this.rules = rulesFor(tourOf(pm), pm.round);
    const opp = schoolById(pm.oppId)!;
    const rec0 = pm.live;
    const built = withSeed(pm.seed, () => ({
      mine: mySetupFull(this.rules, { human: true, forced: forcedStarter, rec: rec0 }),
      theirs: oppSetup(opp, this.rules, G.day),
    }));
    this.notes = rec0 ? [] : built.mine.notes;
    const mine = built.mine.setup;
    this.mySide = pm.home ? 1 : 0;
    this.away = pm.home ? built.theirs : mine;
    this.home = pm.home ? mine : built.theirs;
    this.rec = rec0 ?? { order: mine.order.slice(), defense: { ...mine.defense }, players: mine.players.map((p) => p.id), log: [], played: 0 };
    pm.live = this.rec;
    // 比赛自己的随机数（和全局的分开，读档重演时才能一模一样）
    const saved = getRngState();
    seedRng((pm.seed ^ 0x6a09e667) >>> 0);
    this.rng = getRngState();
    setRngState(saved);
    this.m = this.run(() => new Match(this.away, this.home, this.rules));
    this.myTeam.defAI = false;
    if (rec0 && (rec0.log.length || rec0.played)) this.replay(rec0);
    else this.ready();
  }

  get myTeam(): TeamState {
    return this.m.T[this.mySide];
  }

  get oppTeam(): TeamState {
    return this.m.T[(1 - this.mySide) as 0 | 1];
  }

  private run<T>(fn: () => T): T {
    const saved = getRngState();
    setRngState(this.rng);
    try {
      return fn();
    } finally {
      this.rng = getRngState();
      setRngState(saved);
    }
  }

  /** 准备好下一个打席（换局、对方换人等），返回新产生的事件 */
  ready(): PlayEvent[] {
    const out: PlayEvent[] = [];
    let guard = 0;
    while (!this.m.over && this.m.needPA && guard++ < 10) out.push(...this.run(() => this.m.prepare()));
    this.events.push(...out);
    return out;
  }

  phase(): Phase {
    if (this.m.over) return 'over';
    return this.m.half === this.mySide ? 'bat' : 'pitch';
  }

  /** 执行一个操作并记下来（没有生效就不记） */
  act(a: LiveAct): PlayEvent[] {
    const ev = this.apply(a);
    if (ev === null) return [];
    this.rec.log.push({ n: this.step, a });
    this.events.push(...ev);
    return [...ev, ...this.ready()];
  }

  private apply(a: LiveAct): PlayEvent[] | null {
    const m = this.m;
    const t = this.myTeam;
    if (m.over || m.needPA) return null;
    const mine = m.half === this.mySide;
    switch (a.k) {
      case 'bat':
        if (!mine) return null;
        this.run(() => m.setBatCmd(a.c));
        return [];
      case 'pitch':
        if (mine) return null;
        this.run(() => m.setPitchPlan(a.c));
        return [];
      case 'ph': {
        if (!mine) return null;
        const r = this.run(() => m.act(() => m.pinchHit(t, a.slot, a.pid) && (m.rePlanPA(), true)));
        return r.r ? r.ev : null;
      }
      case 'pr': {
        if (!mine) return null;
        const r = this.run(() => m.act(() => m.pinchRun(t, a.base, a.pid)));
        return r.r ? r.ev : null;
      }
      case 'pc': {
        if (mine) return null;
        const r = this.run(() => m.act(() => m.changePitcher(t, a.pid) && (m.rePlanPA(), true)));
        return r.r ? r.ev : null;
      }
      case 'ds': {
        if (mine) return null;
        const r = this.run(() => m.act(() => m.defensiveSub(t, a.pos as Pos, a.pid)));
        return r.r ? r.ev : null;
      }
      case 'po': {
        if (mine || m.pickoffsLeft() <= 0) return null;
        return this.run(() => m.pickoff());
      }
    }
  }

  /** 打这个打席（玩家的指令应已下达），返回这个打席的全部事件 */
  play(): PlayEvent[] {
    if (this.m.over) return [];
    this.ready();
    if (this.m.over) return [];
    const ev = this.run(() => this.m.stepPA());
    this.events.push(...ev);
    this.step++;
    this.rec.played = this.step;
    // 马上准备好下一个打席（换局、对方换人），读档重演后的局面才和现在一模一样
    return [...ev, ...this.ready()];
  }

  /** 读档：按记录从头重演 */
  private replay(rec: LiveRecord): void {
    this.replaying = true;
    const log = rec.log.slice();
    const played = rec.played;
    rec.log = [];
    rec.played = 0;
    let i = 0;
    while (!this.m.over) {
      this.ready();
      while (i < log.length && log[i].n === this.step) this.act(log[i++].a);
      if (this.step >= played) break;
      this.play();
    }
    this.replaying = false;
  }

  // ---------------- 情报与教练 ----------------
  /** 这个打席能不能看穿对方（同一个打席结果固定） */
  scouted(): boolean {
    return Adapt.scouted(this.pm.seed, this.step, Adapt.readChance(G.mgr.skills.insight, G.facilities.analysis));
  }

  intel(): Intel {
    const ph = this.phase();
    if (ph === 'over') return { seen: false, why: [], plan: null, cmd: null };
    const opp = this.oppTeam;
    const seen = this.scouted();
    return {
      seen,
      why: seen ? opp.intent.why : [],
      plan: seen && ph === 'bat' ? opp.plan : null,
      cmd: seen && ph === 'pitch' ? opp.cmd : null,
    };
  }

  /** 教练的建议 */
  adviceBat(): Adapt.Advice<BatCmd> {
    return Adapt.coachBat(this.m, this.myTeam, this.intel().plan);
  }

  advicePitch(): Adapt.Advice<PitchPlan> {
    return Adapt.coachPitch(this.m, this.myTeam, this.intel().cmd);
  }

  /** 教练代为指挥这个打席（托管）：必要时换投，然后下达建议的指令 */
  coachTurn(): PlayEvent[] {
    const out: PlayEvent[] = [];
    const ph = this.phase();
    if (ph === 'pitch') {
      const rel = Adapt.coachWantsChange(this.m, this.myTeam);
      if (rel !== null) out.push(...this.act({ k: 'pc', pid: rel }));
      if (this.phase() === 'pitch' && !this.m.needPA) out.push(...this.act({ k: 'pitch', c: this.advicePitch().cmd }));
    } else if (ph === 'bat') {
      out.push(...this.act({ k: 'bat', c: this.adviceBat().cmd }));
    }
    return out;
  }

  /** 交给教练直接打到比赛结束（不看过程） */
  coachToEnd(): void {
    let guard = 0;
    while (!this.m.over && guard++ < 400) {
      this.ready();
      if (this.m.over) break;
      this.coachTurn();
      this.play();
    }
  }

  /** 比赛结束后交给 applyResult 写回 */
  result(): SimResult {
    return { pm: this.pm, rules: this.rules, away: this.away, home: this.home, mySide: this.mySide, events: this.events, summary: this.m.summary(), match: this.m };
  }
}
