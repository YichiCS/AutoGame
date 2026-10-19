// 亲自指挥的比赛画面：一球一球地下指令。
// 投球：选球种（质量 0-100），在网格上点要投的位置；对方跑者离垒太大时可以牵制。
// 打击：看投手这一球的热区图，点要打的那一格（或不挥棒），决定垒上的跑者要不要提前跑。
// 手机上一屏操作：上面比分，中间画面和网格，下面这一球的选择和开始按钮（贴底，画面按剩下的高度缩放）。
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { PitchType, Player, Pos } from '../../core/types';
import { POS_NAME, POS_SHORT } from '../../core/types';
import { G } from '../../core/state';
import { batterOffense, fieldAt, fullName, has, posRating } from '../../core/attrs';
import { PITCH_DEFS } from '../../data/pitches';
import { mySetupFull, oppSetup, rulesFor, tourOf } from '../../core/matchday';
import { schoolById } from '../../core/world';
import { strengthOf, strengthLetter } from '../../core/team';
import { todayStarter } from '../../core/lineup';
import { available } from '../../core/player';
import { myPlayers } from '../../core/state';
import { HOT_NAME, hotType } from '../../sim/pitching';
import { Btn, Emblem, Num, Portrait } from '../components/common';
import { refresh, ui, useStore } from '../store';
import { sfx } from '../sound';
import { AUTO_NAME, type AlignKey, type AutoMode, type MatchSession, type MuView } from './session';
import type { HumanTac } from '../../sim/types';
import { LineupEditor } from '../tabs/Lineup';
import { SHAPE_GLYPH, SW, SH, pitchShape } from '../../render/stage';
import { useIsPhone } from '../layout';

type Dlg = { kind: 'ph' } | { kind: 'pr' } | { kind: 'pc' } | { kind: 'ds' } | null;

const BASE = ['一垒', '二垒', '三垒'];

export function MatchScreen() {
  useStore();
  const S = ui.match;
  // 比赛画面打开时，后面的页面不要跟着滚动
  useEffect(() => {
    document.body.classList.add('in-match');
    return () => document.body.classList.remove('in-match');
  }, []);
  if (!S) return null;
  if (S.state === 'pregame') return <Pregame S={S} />;
  return <MatchView S={S} />;
}

// ======================= 开赛前 =======================
function Pregame(p: { S: MatchSession }) {
  const S = p.S;
  const pm = S.pm;
  const [edit, setEdit] = useState(false);
  const rules = rulesFor(tourOf(pm), pm.round);
  const opp = schoolById(pm.oppId)!;
  const mine = mySetupFull(rules, { human: true, forced: S.starter });
  const theirs = oppSetup(opp, rules, G.day);
  const myStr = strengthOf(mine.setup.players, rules.dh);
  const opStr = strengthOf(theirs.players, rules.dh);
  const avail = myPlayers().filter(available);
  // 谁都可以先发：按投手评价排
  const pitchers = avail.slice().sort((a, b) => posRating(b, 'P') - posRating(a, 'P'));
  const auto = todayStarter(avail, rules.pitchLimit, null);
  const starter = mine.setup.defense.P;
  const byId = new Map(mine.setup.players.map((x) => [x.id, x]));
  const posOf = new Map<number, Pos>();
  for (const [pos, id] of Object.entries(mine.setup.defense)) if (id !== undefined) posOf.set(id, pos as Pos);
  const oppAce = theirs.players.find((x) => x.id === theirs.defense.P);
  const oppTop = theirs.order.map((id) => theirs.players.find((x) => x.id === id)!).filter(Boolean).sort((a, b) => batterOffense(b) - batterOffense(a)).slice(0, 2);
  return (
    <div class="mscreen pre">
      <div class="pre-box">
        <div class="pre-head">
          <div class="pre-title">{pm.label}</div>
          <div class="dim small">{rules.stadium} · {pm.home ? '后攻（主队）' : '先攻（客队）'}{rules.dh ? ' · 指定打击制' : ''}</div>
          <div class="vs">
            <span class="vs-team">
              <Emblem school={schoolById(G.schoolId)} /> <b>{mine.setup.short}</b> <span class="gold">{strengthLetter(myStr.total)}</span>
            </span>
            <span class="dim">VS</span>
            <span class="vs-team">
              <Emblem school={opp} /> <b>{opp.short}</b> <span class="gold">{strengthLetter(opStr.total)}</span>
            </span>
          </div>
          <div class="small dim">
            对手情报：王牌 {oppAce ? `${fullName(oppAce)}（${Math.round(oppAce.a.velocity)}km/h，${oppAce.pitches.map((x) => PITCH_DEFS[x.type].short).join(' ') || '只有直球'}）` : '?'}
            {oppTop.length ? ` · 强打者 ${oppTop.map((x) => `${fullName(x)}（力量 ${Math.round(x.a.power)}）`).join('、')}` : ''}
          </div>
        </div>
        {edit ? (
          <div class="pre-edit">
            <LineupEditor />
            <Btn kind="primary" onClick={() => setEdit(false)}>
              完成
            </Btn>
          </div>
        ) : (
          <div class="pre-cols">
            <div>
              <div class="sect">今天的打线</div>
              <div class="pre-order">
                <div class="po-row po-head">
                  <span>棒</span>
                  <span>位置</span>
                  <span>姓名</span>
                  <span class="r">击球</span>
                  <span class="r">力量</span>
                  <span class="r">跑速</span>
                </div>
                {mine.setup.order.map((id, i) => {
                  const x = byId.get(id);
                  if (!x) return null;
                  const pos = posOf.get(id);
                  return (
                    <div key={id} class="po-row">
                      <span class="ord">{i + 1}</span>
                      <span class="pos">{pos ? POS_SHORT[pos] : '指'}</span>
                      <b class="nm">{fullName(x)}</b>
                      <span class="r"><Num v={x.a.contact} /></span>
                      <span class="r"><Num v={x.a.power} /></span>
                      <span class="r"><Num v={x.a.speed} /></span>
                    </div>
                  );
                })}
              </div>
              {mine.notes.length > 0 && (
                <div class="notes">
                  {mine.notes.map((n, i) => (
                    <div key={i} class="small orange">
                      {n}
                    </div>
                  ))}
                </div>
              )}
              <Btn small onClick={() => setEdit(true)}>
                调整阵容…
              </Btn>
            </div>
            <div>
              <div class="sect">先发投手</div>
              <div class="pre-pitchers">
                <div class="pp pp-head">
                  <span>姓名</span>
                  <span class="r">投手评价</span>
                  <span class="r">球速</span>
                  <span class="r">控球</span>
                  <span class="r">球威</span>
                  <span class="r">本周</span>
                  <span class="r">疲劳</span>
                </div>
                {pitchers.map((x) => (
                  <button
                    type="button"
                    key={x.id}
                    class={`pp ${starter === x.id ? 'on' : ''}`}
                    onClick={() => {
                      S.starter = x.id === auto?.id ? null : x.id;
                      refresh();
                    }}
                  >
                    <b class="nm">{fullName(x)}</b>
                    <span class="r"><Num v={posRating(x, 'P')} /></span>
                    <span class="r">{Math.round(x.a.velocity)}</span>
                    <span class="r"><Num v={x.a.control} /></span>
                    <span class="r"><Num v={x.a.stuff} /></span>
                    <span class="r">{x.pitchesWeek}</span>
                    <span class={`r ${x.fatigue >= 70 ? 'bad' : x.fatigue >= 45 ? 'orange' : 'good'}`}>{Math.round(x.fatigue)}</span>
                  </button>
                ))}
              </div>
              <div class="sect">自动指挥</div>
              <AutoSelect S={S} />
              <div class="small dim mt4">比赛中随时可以改。「关键时刻才问我」：得点圈有人、后半段比分接近、满垒时才停下来等你，其余每一球由教练决定。</div>
            </div>
          </div>
        )}
        <div class="pre-go">
          <Btn kind="primary" big onClick={() => { sfx('siren'); S.begin(); }}>
            ▶ 开始比赛
          </Btn>
          <Btn onClick={() => S.simNow()} title="不看过程，按阵容和方针直接打完">
            交给教练，直接出结果
          </Btn>
        </div>
      </div>
    </div>
  );
}

function AutoSelect(p: { S: MatchSession }) {
  return (
    <div class="row wrap gap4">
      {(Object.keys(AUTO_NAME) as AutoMode[]).map((k) => (
        <button type="button" key={k} class={`chip ${p.S.auto === k ? 'on' : ''}`} onClick={() => p.S.setAuto(k)}>
          {AUTO_NAME[k]}
        </button>
      ))}
    </div>
  );
}

// ======================= 比赛中 =======================
function MatchView(p: { S: MatchSession }) {
  const S = p.S;
  const L = S.live!;
  const stageRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLCanvasElement>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    if (stageRef.current && fieldRef.current) S.attach(stageRef.current, fieldRef.current);
    return () => S.detach();
  }, [S]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || dlg || menu) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (S.state === 'playing') S.skip();
        else S.go();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [S, dlg, menu]);
  const onTap = (e: PointerEvent) => {
    const cv = stageRef.current;
    if (!cv) return;
    const r = cv.getBoundingClientRect();
    S.tap(((e.clientX - r.left) * SW) / r.width, ((e.clientY - r.top) * SH) / r.height);
  };
  const ph = S.muView()?.phase ?? (L.phase() === 'over' ? null : L.phase());
  const phone = useIsPhone();
  return (
    <div class="mscreen">
      <Scorebar S={S} onMenu={() => setMenu(true)} />
      <div class="mgrid">
        <div class="mleft">
          <div class="mcanvas">
            <canvas ref={stageRef} class={`stage ${S.view === 'stage' ? '' : 'hide'} ${S.state === 'ready' && !S.coaching ? 'tappable' : ''}`} onPointerDown={onTap} />
            <canvas ref={fieldRef} class={`field ${S.view === 'field' ? '' : 'hide'}`} />
            {S.state === 'playing' && (
              <button type="button" class="mskip" onClick={() => S.skip()}>
                跳过 ▶▶
              </button>
            )}
            {S.lastRes && S.state !== 'playing' && <div class="msit">上一打席：{S.lastRes}</div>}
            {phone && S.state === 'ready' && ph !== 'over' && ph && <SideCol S={S} side="left" ph={ph} setDlg={setDlg} />}
            {phone && S.state === 'ready' && ph !== 'over' && ph && <SideCol S={S} side="right" ph={ph} setDlg={setDlg} />}
          </div>
          <div class="mlog">
            {S.lines
              .slice(-8)
              .reverse()
              .map((l, i) => (
                <div key={i} class={`ml ${l.big ? 'big' : ''} ${l.side === L.mySide ? 'mine' : ''}`}>
                  {l.t}
                </div>
              ))}
          </div>
        </div>
        <aside class="mside">
          {S.state === 'over' ? (
            <Postgame S={S} />
          ) : (
            <>
              <Matchup S={S} />
              {ph === 'pitch' ? <PitchControls S={S} setDlg={setDlg} /> : <BatControls S={S} setDlg={setDlg} />}
            </>
          )}
        </aside>
      </div>
      {menu && <MatchMenu S={S} close={() => setMenu(false)} setDlg={(d) => { setMenu(false); setDlg(d); }} />}
      {dlg && <SubDialog S={S} dlg={dlg} close={() => setDlg(null)} />}
    </div>
  );
}

function Dots(p: { n: number; max: number; cls: string }) {
  return (
    <span class={`dots ${p.cls}`}>
      {Array.from({ length: p.max }, (_, i) => (
        <i key={i} class={i < p.n ? 'on' : ''} />
      ))}
    </span>
  );
}

function Scorebar(p: { S: MatchSession; onMenu: () => void }) {
  const S = p.S;
  const L = S.live!;
  const d = S.disp;
  if (!d) return null;
  const sn = d.snap;
  const names = [L.away.short, L.home.short];
  return (
    <header class="mtop">
      <div class="sbmini">
        {[0, 1].map((side) => (
          <span key={side} class={`sbt ${side === L.mySide ? 'mine' : ''} ${sn.half === side ? 'atbat' : ''}`}>
            <span class="tn">{names[side]}</span>
            <b>{d.runs[side]}</b>
          </span>
        ))}
      </div>
      <LineScore S={S} cls="sb-wide" />
      <div class="minn">
        {sn.inning}局{sn.half ? '下' : '上'}
        <span class="dim small">{L.m.over ? '' : sn.half === L.mySide ? '进攻' : '防守'}</span>
      </div>
      <div class="bso2">
        <span>B <Dots n={sn.balls} max={3} cls="b" /></span>
        <span>S <Dots n={sn.strikes} max={2} cls="s" /></span>
        <span>O <Dots n={sn.outs} max={2} cls="o" /></span>
      </div>
      <Diamond bases={sn.bases.map((x) => x !== null)} />
      <button type="button" class="mmenu-btn" onClick={p.onMenu} aria-label="比赛菜单">
        ⋯
      </button>
    </header>
  );
}

function LineScore(p: { S: MatchSession; cls?: string }) {
  const S = p.S;
  const L = S.live!;
  const d = S.disp!;
  const inn = Math.max(9, d.line[0].length, d.line[1].length);
  const names = [L.away.short, L.home.short];
  return (
    <table class={`sb ${p.cls ?? ''}`}>
      <thead>
        <tr>
          <th />
          {Array.from({ length: inn }, (_, i) => (
            <th key={i} class={d.snap.inning === i + 1 ? 'cur' : ''}>
              {i + 1}
            </th>
          ))}
          <th>R</th>
          <th>H</th>
          <th>E</th>
        </tr>
      </thead>
      <tbody>
        {[0, 1].map((side) => (
          <tr key={side} class={side === L.mySide ? 'mine' : ''}>
            <td class="tn">{names[side]}</td>
            {Array.from({ length: inn }, (_, i) => (
              <td key={i}>{d.line[side][i] ?? ''}</td>
            ))}
            <td class="r">{d.runs[side]}</td>
            <td>{d.hits[side]}</td>
            <td>{d.err[side]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Diamond(p: { bases: boolean[] }) {
  const [b1, b2, b3] = p.bases;
  return (
    <span class="diamond" aria-label={`一垒${b1 ? '有' : '无'}人 二垒${b2 ? '有' : '无'}人 三垒${b3 ? '有' : '无'}人`}>
      <i class={`b2 ${b2 ? 'on' : ''}`} />
      <i class={`b3 ${b3 ? 'on' : ''}`} />
      <i class={`b1 ${b1 ? 'on' : ''}`} />
    </span>
  );
}

// ---------------- 对决 ----------------
/** 投手心态的说法和颜色：被连续打、保送会动摇，连续三振越投越有信心 */
function moodOf(v: number): [string, string] {
  if (v <= -0.4) return ['慌乱', 'bad'];
  if (v <= -0.12) return ['动摇', 'orange'];
  if (v < 0.15) return ['平稳', 'dim'];
  if (v < 0.45) return ['有信心', 'good'];
  return ['气势如虹', 'hot'];
}

function Matchup(p: { S: MatchSession }) {
  const S = p.S;
  const v = S.muView();
  if (!v) return null;
  const { b, pt } = v;
  const st = Math.round(v.stamina * 100);
  const stCls = st < 15 ? 'bad' : st < 40 ? 'orange' : 'good';
  const [mood, moodCls] = moodOf(v.mood);
  // 心态 0..100：50 是平稳，越高越有信心，越低越动摇
  const md = Math.round((v.mood + 1) * 50);
  return (
    <section class="mu2">
      <div class="mu2-row">
        <Portrait player={b} size="sm" />
        <span class="mu2-tag">打者</span>
        <b class="nm">{fullName(b)}</b>
        <span class="dim">
          {v.slot}棒 {v.pos ? (v.pos === 'DH' ? '指' : POS_SHORT[v.pos]) : ''} · {v.side === 'L' ? '左打' : '右打'} · {HOT_NAME[hotType(b)]}
        </span>
        <span class="mu2-r">今天 {v.bseq.length ? v.bseq.join(' ') : '—'}</span>
      </div>
      <div class="mu2-row">
        <Portrait player={pt} size="sm" />
        <span class="mu2-tag">投手</span>
        <b class="nm">{fullName(pt)}</b>
        <span class="dim">
          {pt.throws === 'L' ? '左投' : '右投'} · {Math.round(pt.a.velocity)}km/h · 牵制 {v.pickoff}
        </span>
        <span class="mu2-r" />
      </div>
      {/* 投手的体力和心态：累了、动摇了，球种质量下降、落点变散；连续三振越投越有信心 */}
      <div class="mu2-st" title="投手的体力和心态：体力用得越多、心态越差（被连续打、保送），球种质量越低、落点越散；连续三振、牵制会让心态回来（心态 50 是平稳）">
        <span class="dim">体力</span>
        <span class={`stbar ${stCls}`}>
          <i style={{ width: `${st}%` }} />
        </span>
        <b class={stCls}>{st}%</b>
        <span class="dim">心态</span>
        <span class={`stbar ${moodCls}`}>
          <i style={{ width: `${md}%` }} />
        </span>
        <b class={moodCls}>{md}</b>
        <span class={moodCls}>{mood}</span>
        <span class="grow" />
        <span class="dim">{v.np} 球</span>
      </div>
    </section>
  );
}

// ---------------- 手机：画面两侧的窄栏 ----------------
/** 敬远：点一下变成「确认敬远」，3 秒内再点一次才申告（免得误触） */
function IbbButton(p: { S: MatchSession; ready: boolean; narrow?: boolean }) {
  const [arm, setArm] = useState(false);
  useEffect(() => {
    if (!arm) return;
    const t = window.setTimeout(() => setArm(false), 3000);
    return () => window.clearTimeout(t);
  }, [arm]);
  const click = () => {
    if (!arm) return setArm(true);
    setArm(false);
    p.S.ibb();
  };
  if (p.narrow)
    return (
      <button type="button" class={`sbtn ${arm ? 'arm' : ''}`} disabled={!p.ready} onClick={click}>
        {arm ? (
          <>
            <b>确认</b>
            <span>敬远</span>
          </>
        ) : (
          <b>敬远</b>
        )}
      </button>
    );
  return (
    <Btn kind={arm ? 'red' : undefined} disabled={!p.ready} onClick={click}>
      {arm ? '确认敬远' : '敬远'}
    </Btn>
  );
}

const BASE_S = ['一垒', '二垒', '三垒'];

const TACS: [HumanTac, string, string][] = [
  ['steal', '盗垒', '前面的跑者盗下一个垒，打者这一球不挥'],
  ['doubleSteal', '双盗', '一二垒：两人一起盗；一三垒：一垒跑者盗二垒，捕手一传二垒三垒跑者就冲本垒'],
  ['bunt', '触击', '牺牲触击，送跑者往前一个垒（两好球后不能）'],
  ['squeeze', '抢分', '强迫取分：打者触击，三垒跑者同时冲本垒（触击落空跑者多半出局）'],
  ['hitRun', '打带跑', '一垒跑者起跑，打者一定挥（定了挥棒点就朝着它挥）'],
];

/**
 * 手机：小而半透明的按钮叠在画面两侧（不占地方，画面大小固定）。
 * 防守时左边是各垒跑者的牵制（⚠ 是离垒很大），右边是守备阵型和敬远；进攻时左边是战术（这一球就发动），右边是代打、代跑。
 */
function SideCol(p: { S: MatchSession; side: 'left' | 'right'; ph: 'bat' | 'pitch' | null; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const v = S.muView();
  const ready = S.state === 'ready' && !S.coaching;
  if (!v || !p.ph) return <div class={`mcol ${p.side}`} />;
  if (p.side === 'left') {
    if (p.ph === 'bat')
      return (
        <div class="mcol left">
          {TACS.filter(([k]) => S.tacReady(k)).map(([k, t, tip]) => (
            <button type="button" key={k} class="sbtn" disabled={!ready} title={tip} onClick={() => S.tactic(k)}>
              <b>{t}</b>
            </button>
          ))}
        </div>
      );
    return (
      <div class="mcol left">
        {v.runners.map((r, i) =>
          r ? (
            <button type="button" key={i} class={`sbtn ${r.lead === 'big' ? 'warn' : ''}`} disabled={!ready || v.pickLeft <= 0} onClick={() => S.act({ k: 'po', base: i })} title={`${r.name}${r.lead === 'big' ? '：离垒很大' : ''}`}>
              <b>{BASE_S[i]}</b>
              <span>{r.lead === 'big' ? '⚠牵制' : '牵制'}</span>
            </button>
          ) : null,
        )}
      </div>
    );
  }
  if (p.ph === 'pitch') {
    return (
      <div class="mcol right">
        {ALIGNS.map(([k, t, tip]) => (
          <button type="button" key={k} class={`sbtn seg1 ${S.align === k ? 'on' : ''}`} disabled={!ready} title={tip} onClick={() => S.setAlign(k)}>
            <b>{t}</b>
          </button>
        ))}
        <IbbButton S={S} ready={ready} narrow />
      </div>
    );
  }
  return (
    <div class="mcol right">
      <button type="button" class="sbtn" disabled={!ready} onClick={() => p.setDlg({ kind: 'ph' })}>
        <b>代打</b>
      </button>
      <button type="button" class="sbtn" disabled={!ready || !v.runners.some(Boolean)} onClick={() => p.setDlg({ kind: 'pr' })}>
        <b>代跑</b>
      </button>
    </div>
  );
}

// ---------------- 这一球的选择 ----------------
function CoachBar(p: { S: MatchSession }) {
  return (
    <div class="gobar">
      <span class="dim">教练指挥中…</span>
      <span class="grow" />
      <Btn onClick={() => p.S.takeOver()}>我来指挥</Btn>
    </div>
  );
}

const ALIGNS: [AlignKey, string, string][] = [
  ['close', '趋近', '趋近：一三垒手前压防触击，二游站双杀位置（两侧的滚地球更容易穿过去）'],
  ['normal', '正常', '正常站位'],
  ['deep', '防长打', '防长打：外野后退，二垒打少一半（前面落下的安打会多一些）'],
];

function PitchControls(p: { S: MatchSession; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const v = S.muView();
  const ready = S.state === 'ready' && !S.coaching;
  const phone = useIsPhone();
  if (!v) return null;
  // 跑者、离垒、还能牵制几次：用这一球之前的快照（演出中不剧透，按钮的多少不变）
  const runners = v.runners;
  const left = v.pickLeft;
  const al = S.align;
  return (
    <section class="ctl">
      <div class="ctl-h">
        <span>球种</span>
        <span class="dim small">质量 0-100</span>
        {S.intent() && (
          <span class="small" title="橙色：打者这一球在等、会出棒的地方（内角投多了会往内角靠、两好球了更会出棒）。捕手能力越好看得越准">
            打者出棒 <b class="orange">{Math.round(S.intent()!.swing * 100)}%</b>
            <span class="dim">（捕手{readText(S.intent()!.acc)}）</span>
          </span>
        )}
        {!phone && (
          <>
            <span class="grow" />
            <span class="dim small">守备</span>
            <span class="seg" role="group" aria-label="守备阵型">
              {ALIGNS.map(([k, t, tip]) => (
                <button type="button" key={k} class={`seg-b ${al === k ? 'on' : ''}`} disabled={!ready} title={tip} onClick={() => S.setAlign(k)}>
                  {t}
                </button>
              ))}
            </span>
          </>
        )}
      </div>
      <div class="ptypes">
        {v.ars.map((o) => (
          <button type="button" key={o.type} class={`ptype ${S.ptype === o.type ? 'on' : ''}`} disabled={!ready} onClick={() => S.setPitchType(o.type)}>
            <span class="pn">
              <span class="pshape">{SHAPE_GLYPH[pitchShape(o.type)]}</span>
              {o.sig ? `「${o.sig}」` : o.type === 'FB' ? '直球' : PITCH_DEFS[o.type].name}
            </span>
            <Num v={o.q} />
          </button>
        ))}
      </div>
      <div class="tend dim small">
        {v.tend.n >= 5 ? (
          <>
            今天的配球（{v.tend.n} 球）：{tendText(v.tend).text}
          </>
        ) : (
          '投满 5 球后这里显示今天的配球'
        )}
      </div>
      {!phone && runners.some(Boolean) && (
        <div class="runners">
          {phone ? (
            // 手机：每个垒一格排成一行，整格就是牵制按钮
            <div class="rcells">
              {runners.map((r, i) =>
                r ? (
                  <button type="button" key={i} class={`rcell ${r.lead === 'big' ? 'warn' : ''}`} disabled={!ready || left <= 0} onClick={() => S.act({ k: 'po', base: i })}>
                    <span class="rc-t">
                      {BASE[i]}
                      {r.lead === 'big' ? ' ⚠ 离垒大' : ''}
                    </span>
                    <span>牵制</span>
                  </button>
                ) : null,
              )}
            </div>
          ) : (
            runners.map((r, i) =>
              r ? (
                <div key={i} class={`runner ${r.lead === 'big' ? 'warn' : ''}`}>
                  <span class="rb">{BASE[i]}</span>
                  <span class="rn">{r.name}</span>
                  <span class="rl">{r.lead === 'big' ? '⚠ 离垒很大' : i === 2 ? '' : '离垒正常'}</span>
                  <button type="button" class="chip" disabled={!ready || left <= 0} onClick={() => S.act({ k: 'po', base: i })}>
                    牵制
                  </button>
                </div>
              ) : null,
            )
          )}
          <div class="dim small">还能牵制 {left} 次 · 离垒大、想跑的人容易抓到</div>
        </div>
      )}
      {S.coaching ? (
        <CoachBar S={S} />
      ) : (
        <div class="gobar">
          <Btn disabled={!ready} onClick={() => p.setDlg({ kind: 'pc' })}>
            换投
          </Btn>
          {!phone && <IbbButton S={S} ready={ready} />}
          <span class="hint">{S.aim ? '再点同一格也能直接投' : '在网格上点要投的位置'}</span>
          <Btn kind="primary" big disabled={!S.canGo()} onClick={() => S.go()}>
            {S.state === 'playing' ? '投球中…' : '▶ 投球'}
          </Btn>
        </div>
      )}
    </section>
  );
}

/** 投手今天的配球：「直球 61% · 卡特球 39% · 外角多」；single：有没有太单一 */
function tendText(t: MuView['tend']): { text: string; single: boolean } {
  const name = (k: string) => (k === 'FB' ? '直球' : PITCH_DEFS[k as PitchType]?.name ?? k);
  const parts = t.types.slice(0, 3).map(([k, v]) => `${SHAPE_GLYPH[pitchShape(k as PitchType | 'FB')]}${name(k)} ${Math.round(v * 100)}%`);
  if (t.side > 0.25) parts.push('外角多');
  else if (t.side < -0.25) parts.push('内角多');
  if (t.height > 0.25) parts.push('高球多');
  else if (t.height < -0.25) parts.push('低球多');
  const single = (t.types[0]?.[1] ?? 0) > 0.62 || Math.abs(t.side) > 0.4 || Math.abs(t.height) > 0.4;
  return { text: parts.join(' · '), single };
}

/** 捕手读打者准不准 */
function readText(a: number): string {
  return a >= 0.7 ? '读得很准' : a >= 0.4 ? '读得出个大概' : '读不太准';
}

/** 打者读投手准不准（选球眼） */
function eyeText(a: number): string {
  return a >= 0.7 ? '看得很准' : a >= 0.4 ? '看得出个大概' : '不太看得清';
}

// 挥棒范围中心格的说法：-1 和 9 是好球带外面一圈（坏球区）
const H_TXT = ['内角边上', '最内', '内', '偏内', '中', '偏外', '外', '最外', '外角边上', '外侧坏球'];
const V_TXT = ['高边上', '最高', '高', '偏高', '中', '偏低', '低', '最低', '低边上', '低的坏球'];

/** 挥棒范围在哪儿（按打者说内角 / 外角；捕手视角里右打者站左边，左边是内角） */
function rangeText(c: [number, number], side: 'R' | 'L'): string {
  const h = side === 'R' ? c[0] : 8 - c[0];
  if (h === 4 && c[1] === 4) return '正中';
  const ht = h < 0 ? '内侧坏球' : H_TXT[h];
  const vt = c[1] < 0 ? '高的坏球' : V_TXT[c[1]];
  return `${vt} · ${ht}`;
}

function BatControls(p: { S: MatchSession; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const v = S.muView();
  const ready = S.state === 'ready' && !S.coaching;
  const phone = useIsPhone();
  if (!v) return null;
  // 跑者：用这一球之前的快照（演出中不剧透）
  const runners = v.runners;
  const occupied = runners.map(Boolean);
  // 一垒跑者要跑，前面（二垒）得空着或者也跑
  const canRun = (i: number) => occupied[i] && (i === 2 || !occupied[i + 1] || S.run[i + 1]);
  return (
    <section class="ctl">
      <div class="ctl-h">
        <span>这一球</span>
        <span class="dim small">
          选球 {Math.round(v.b.a.eye)}：投手的打算{eyeText(v.eyeAcc)}
        </span>
      </div>
      <div class="tend dim small">{v.tend.n >= 5 ? `投手今天 ${v.tend.n} 球：${tendText(v.tend).text}` : '投手投满 5 球后这里显示他今天的配球'}</div>
      <div class="huntrow">
        <span class={`hunt ${S.hunt ? 'on' : ''}`}>
          {S.hunt ? (
            <>
              挥棒点：{rangeText(S.hunt, v.side)} · 对齐 <b>{Math.round((S.alignScore() ?? 0) * 100)}%</b>
            </>
          ) : (
            '点网格定挥棒点：黄 = 你的挥棒热区（看击球能力），对准洋红的投手热区'
          )}
        </span>
      </div>
      {!phone && TACS.some(([k]) => S.tacReady(k)) && (
        <div class="tacs">
          <span class="dim small">战术（这一球就发动）</span>
          {TACS.filter(([k]) => S.tacReady(k)).map(([k, t, tip]) => (
            <button type="button" key={k} class="chip" disabled={!ready} title={tip} onClick={() => S.tactic(k)}>
              {t}
            </button>
          ))}
        </div>
      )}
      {S.coaching ? (
        <CoachBar S={S} />
      ) : (
        <div class="gobar">
          {!phone && (
            <Btn disabled={!ready} onClick={() => p.setDlg({ kind: 'ph' })}>
              代打
            </Btn>
          )}
          {!phone && occupied.some(Boolean) && (
            <Btn disabled={!ready} onClick={() => p.setDlg({ kind: 'pr' })}>
              代跑
            </Btn>
          )}
          <span class="grow" />
          <Btn disabled={!ready} onClick={() => S.take()}>
            不挥棒
          </Btn>
          <Btn kind="primary" big disabled={!S.canGo()} onClick={() => S.go()}>
            {S.state === 'playing' ? (S.taking ? '看球中…' : '挥棒中…') : '▶ 挥棒'}
          </Btn>
        </div>
      )}
    </section>
  );
}

// ---------------- 菜单（演出速度、自动指挥、交给教练、换人、比分） ----------------
function MatchMenu(p: { S: MatchSession; close: () => void; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const L = S.live!;
  const ph = L.phase();
  const ready = S.state === 'ready';
  return (
    <div class="overlay" onClick={p.close}>
      <div class="modal sheet" onClick={(e) => e.stopPropagation()}>
        <div class="mtitle">
          <span>比赛</span>
          <button type="button" class="x" onClick={p.close} aria-label="关闭">
            ×
          </button>
        </div>
        <div class="mbody2">
          <LineScore S={S} cls="sb-full" />
          <div class="opt">
            <span class="opt-l">演出速度</span>
            <span class="row wrap gap4">
              {[1, 2, 4].map((v) => (
                <button type="button" key={v} class={`chip ${S.speed === v ? 'on' : ''}`} onClick={() => S.setSpeed(v)}>
                  {v}x
                </button>
              ))}
            </span>
          </div>
          <div class="opt">
            <span class="opt-l">自动指挥</span>
            <AutoSelect S={S} />
          </div>
          <div class="opt">
            <span class="opt-l">换人</span>
            <span class="row wrap gap4">
              {ph === 'bat' ? (
                <>
                  <Btn small disabled={!ready} onClick={() => p.setDlg({ kind: 'ph' })}>代打</Btn>
                  <Btn small disabled={!ready || !L.m.bases.some(Boolean)} onClick={() => p.setDlg({ kind: 'pr' })}>代跑</Btn>
                </>
              ) : ph === 'pitch' ? (
                <>
                  <Btn small disabled={!ready} onClick={() => p.setDlg({ kind: 'pc' })}>换投</Btn>
                  <Btn small disabled={!ready} onClick={() => p.setDlg({ kind: 'ds' })}>守备替换</Btn>
                </>
              ) : null}
            </span>
          </div>
          <div class="opt">
            <span class="opt-l">交给教练</span>
            <span class="row wrap gap4">
              <Btn small disabled={!ready || S.state === 'over'} onClick={() => { S.autoHalf(); p.close(); }}>
                这个半局
              </Btn>
              <Btn small disabled={S.state === 'playing' || S.state === 'over'} onClick={() => { S.toEnd(); p.close(); }}>
                直接打完整场
              </Btn>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- 换人 ----------------
function SubDialog(p: { S: MatchSession; dlg: NonNullable<Dlg>; close: () => void }) {
  const S = p.S;
  const L = S.live!;
  const m = L.m;
  const t = L.myTeam;
  const bench = t.bench();
  const [pos, setPos] = useState<Pos>('C');
  const [base, setBase] = useState(m.bases.findIndex(Boolean));
  let title = '';
  let head: ComponentChildren = null;
  let rows: { p: Player; cols: ComponentChildren; disabled?: boolean }[] = [];
  let doIt: (pid: number) => void = () => {};
  switch (p.dlg.kind) {
    case 'ph':
      title = `代打：替换 ${fullName(m.batter())}`;
      head = (
        <>
          <span>击球</span>
          <span>力量</span>
          <span>选球</span>
          <span>跑速</span>
        </>
      );
      rows = bench.slice().sort((a, b) => batterOffense(b) - batterOffense(a)).map((x) => ({
        p: x,
        cols: (
          <>
            <Num v={x.a.contact} />
            <Num v={x.a.power} />
            <Num v={x.a.eye} />
            <Num v={x.a.speed} />
          </>
        ),
      }));
      doIt = (pid) => S.act({ k: 'ph', slot: t.batIdx, pid });
      break;
    case 'pr':
      title = '代跑';
      head = (
        <>
          <span>跑速</span>
          <span>跑垒</span>
          <span />
          <span />
        </>
      );
      rows = bench.slice().sort((a, b) => b.a.speed - a.a.speed).map((x) => ({
        p: x,
        cols: (
          <>
            <Num v={x.a.speed} />
            <Num v={x.a.baserun} />
            <span>{has(x, 'steal') ? '盗垒○' : ''}</span>
            <span />
          </>
        ),
      }));
      doIt = (pid) => S.act({ k: 'pr', base, pid });
      break;
    case 'pc':
      title = `换投：替换 ${fullName(m.pitcher())}`;
      head = (
        <>
          <span>投手评价</span>
          <span>球速</span>
          <span>控球</span>
          <span>疲劳</span>
        </>
      );
      rows = bench.slice().sort((a, b) => posRating(b, 'P') - posRating(a, 'P')).map((x) => {
        const left = m.rules.pitchLimit - m.weeklyPitches(t, x.id);
        return {
          p: x,
          disabled: left <= 10,
          cols: (
            <>
              <Num v={posRating(x, 'P')} />
              <span>{Math.round(x.a.velocity)}</span>
              <Num v={x.a.control} />
              <span class={x.fatigue >= 70 ? 'bad' : x.fatigue >= 45 ? 'orange' : 'good'}>{Math.round(x.fatigue)}</span>
            </>
          ),
        };
      });
      doIt = (pid) => S.act({ k: 'pc', pid });
      break;
    case 'ds':
      title = '守备替换';
      head = (
        <>
          <span>{POS_NAME[pos]}评价</span>
          <span>守备</span>
          <span>肩力</span>
          <span>跑速</span>
        </>
      );
      rows = bench
        .map((x) => ({
          p: x,
          cols: (
            <>
              <Num v={posRating(x, pos)} />
              <Num v={fieldAt(x, pos)} />
              <Num v={x.a.arm} />
              <Num v={x.a.speed} />
            </>
          ),
        }))
        .sort((a, b) => posRating(b.p, pos) - posRating(a.p, pos));
      doIt = (pid) => S.act({ k: 'ds', pos, pid });
      break;
  }
  return (
    <div class="overlay" onClick={p.close}>
      <div class="modal sheet sub" onClick={(e) => e.stopPropagation()}>
        <div class="mtitle">
          <span>{title}</span>
          <button type="button" class="x" onClick={p.close} aria-label="关闭">
            ×
          </button>
        </div>
        <div class="mbody2">
          {p.dlg.kind === 'pr' && (
            <div class="row wrap gap4 mb6">
              {m.bases.map((r, i) =>
                r ? (
                  <button type="button" key={i} class={`chip ${base === i ? 'on' : ''}`} onClick={() => setBase(i)}>
                    {BASE[i]} {fullName(t.get(r.pid))}
                  </button>
                ) : null,
              )}
            </div>
          )}
          {p.dlg.kind === 'ds' && (
            <div class="row wrap gap4 mb6">
              {(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as Pos[]).map((k) => (
                <button type="button" key={k} class={`chip ${pos === k ? 'on' : ''}`} onClick={() => setPos(k)}>
                  {POS_NAME[k]}
                </button>
              ))}
            </div>
          )}
          {rows.length ? (
            <div class="subtable">
              <div class="subrow subhead">
                <span />
                <span>姓名</span>
                {head}
              </div>
              {rows.map((r) => (
                <button
                  type="button"
                  key={r.p.id}
                  class="subrow"
                  disabled={r.disabled}
                  onClick={() => {
                    doIt(r.p.id);
                    p.close();
                  }}
                >
                  <Portrait player={r.p} size="sm" />
                  <span class="nm">
                    <b>{fullName(r.p)}</b> <span class="dim small">{r.p.grade}年</span>
                  </span>
                  {r.cols}
                </button>
              ))}
            </div>
          ) : (
            <div class="dim">板凳上没有人了。</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- 赛后 ----------------
function Postgame(p: { S: MatchSession }) {
  const S = p.S;
  const L = S.live!;
  const sum = L.m.summary();
  const win = sum.winner === L.mySide;
  const mine = L.mySide;
  const mvp = sum.mvp !== null ? (L.m.T[0].roster.has(sum.mvp) ? L.m.T[0].get(sum.mvp) : L.m.T[1].get(sum.mvp)) : null;
  const bat = sum.bat[mine].filter((b) => b.pa > 0);
  return (
    <section class="panel post">
      <div class={`post-r ${win ? 'good' : 'bad'}`}>{win ? '胜利！' : '败北'}</div>
      <div class="post-s">
        {sum.score[mine]} - {sum.score[1 - mine]}
        {sum.called ? '（提前结束）' : sum.innings > 9 ? `（延长 ${sum.innings} 局）` : ''}
      </div>
      {mvp && <div class="gold">MVP：{fullName(mvp)}</div>}
      <Btn kind="primary" big onClick={() => S.finish()}>
        回到学校
      </Btn>
      <div class="box">
        <div class="bx bx-head">
          <span>打者</span>
          <span class="r">打数</span>
          <span class="r">安打</span>
          <span class="r">打点</span>
          <span>结果</span>
        </div>
        {bat.map((b) => (
          <div key={b.pid} class="bx">
            <span class="nm">{fullName(L.myTeam.get(b.pid))}</span>
            <span class="r">{b.ab}</span>
            <span class="r">{b.h}</span>
            <span class="r">{b.rbi}</span>
            <span class="dim seq">{b.seq.join(' ')}</span>
          </div>
        ))}
      </div>
      {sum.highlights.length > 0 && (
        <ul class="small it-l">
          {sum.highlights.slice(0, 5).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
