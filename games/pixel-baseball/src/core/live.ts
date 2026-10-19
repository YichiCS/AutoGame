// 亲自指挥的比赛：一球一球地推进。
// 比赛用自己的随机数；玩家（或替玩家拿主意的教练）每一球的指令都记进 pm.live，读档时从头按记录重演，结果完全一样。
import type { LiveAct, LiveRecord, PendingMatch, Pos } from './types';
import type { MatchRules, PlayEvent, TeamSetup } from '../sim/types';
import { Match, type TeamState } from '../sim/match';
import { coachHunt, coachRun, coachThrow } from '../sim/brain';
import { makeRng, HALF } from '../sim/pitching';
import { coachWantsChange } from '../sim/ai';
import { G } from './state';
import { getRngState, hash32, seedRng, setRngState, withSeed } from './rng';
import { mySetupFull, oppSetup, rulesFor, tourOf, type SimResult } from './matchday';
import { schoolById } from './world';

export type Phase = 'bat' | 'pitch' | 'over';

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
  /** 第几球（每投一球、或者一次牵制让这一球没投出去，加一） */
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

  /** 准备好下一球（换局、换人、AI 这一球的打算），返回新产生的事件 */
  ready(): PlayEvent[] {
    const out: PlayEvent[] = [];
    let guard = 0;
    while (!this.m.over && (this.m.needHalf || this.m.needPA || !this.m.pitchReady) && guard++ < 10) out.push(...this.run(() => this.m.prepare()));
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
    if (m.over) return null;
    if (a.k === 'end') {
      // 交给教练打完：之后双方都由 AI 决定
      return this.run(() => {
        t.auto = true;
        return m.toEnd();
      });
    }
    if (m.needPA || m.needHalf) return null;
    const mine = m.half === this.mySide;
    switch (a.k) {
      case 'throw': {
        if (mine) return null;
        const p = m.pitcher();
        if (a.t !== 'FB' && !p.pitches.some((x) => x.type === a.t)) return null;
        if (!Number.isFinite(a.x) || !Number.isFinite(a.y) || Math.abs(a.x) > HALF + 0.5 || Math.abs(a.y) > HALF + 0.5) return null;
        t.callNext = { type: a.t, x: a.x, y: a.y };
        return [];
      }
      case 'swing':
        if (!mine || a.z < -1 || a.z > 8) return null;
        t.swingNext = { z: a.z, run: [!!a.run[0], !!a.run[1], !!a.run[2]] };
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
        const base = a.base ?? -1;
        if (base >= 0 && !m.bases[base]) return null;
        return this.run(() => m.pickoff(base));
      }
    }
    return null;
  }

  /** 投这一球（这一球的指令应已下达；没有就交给教练），返回这一球的全部事件 */
  pitch(): PlayEvent[] {
    if (this.m.over) return [];
    this.ready();
    if (this.m.over) return [];
    const ev = this.run(() => this.m.step());
    this.events.push(...ev);
    this.step++;
    this.rec.played = this.step;
    // 马上准备好下一球（换局、对方换人、对方这一球的打算），读档重演后的局面才和现在一模一样
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
      if (this.m.over || this.step >= played) break;
      this.pitch();
    }
    this.replaying = false;
  }

  // ---------------- 教练 ----------------
  /** 教练这一球的随机数：只看比赛种子和第几球，不消耗比赛的随机数 */
  private coachRng(salt: number) {
    return makeRng(hash32(this.pm.seed, this.step, salt));
  }

  /** 教练替玩家拿这一球的主意（必要时先换投） */
  coachActs(): LiveAct[] {
    const m = this.m;
    const ph = this.phase();
    if (ph === 'pitch') {
      const out: LiveAct[] = [];
      if (m.balls === 0 && m.strikes === 0) {
        const rel = coachWantsChange(m, this.myTeam);
        if (rel !== null) out.push({ k: 'pc', pid: rel });
      }
      return out;
    }
    return [];
  }

  /** 教练这一球的指令 */
  coachCall(): LiveAct | null {
    const m = this.m;
    const ph = this.phase();
    if (ph === 'pitch') {
      const c = coachThrow(m, this.myTeam, m.pitcherNow(), this.coachRng(1));
      return { k: 'throw', t: c.type, x: c.x, y: c.y };
    }
    if (ph === 'bat') {
      const r = this.coachRng(2);
      return { k: 'swing', z: coachHunt(m, this.myTeam, m.mind, m.mindSp, r), run: coachRun(m, this.myTeam, r) };
    }
    return null;
  }

  /** 教练代为指挥这一球：必要时换投，然后下达指令（都记下来） */
  coachTurn(): PlayEvent[] {
    const out: PlayEvent[] = [];
    for (const a of this.coachActs()) out.push(...this.act(a));
    const c = this.coachCall();
    if (c) out.push(...this.act(c));
    return out;
  }

  /** 交给教练直接打到比赛结束（不看过程） */
  coachToEnd(): PlayEvent[] {
    return this.act({ k: 'end' });
  }

  /** 比赛结束后交给 applyResult 写回 */
  result(): SimResult {
    return { pm: this.pm, rules: this.rules, away: this.away, home: this.home, mySide: this.mySide, events: this.events, summary: this.m.summary(), match: this.m };
  }
}
