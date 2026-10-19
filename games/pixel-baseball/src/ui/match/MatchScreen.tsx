// 亲自指挥的比赛画面：以打席为单位下指令，打者视角 / 投手视角演出
import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Player, Pos } from '../../core/types';
import { POS_NAME, POS_SHORT } from '../../core/types';
import type { Alignment, BatCmd, PitchPlan, Zone } from '../../sim/types';
import { G } from '../../core/state';
import { batterOffense, fieldAt, fullName, has, isPitcher, pitcherOverall, posRating, traitList, velScore } from '../../core/attrs';
import { PITCH_DEFS } from '../../data/pitches';
import { mySetupFull, oppSetup, rulesFor, tourOf } from '../../core/matchday';
import { schoolById } from '../../core/world';
import { strengthOf, strengthLetter } from '../../core/team';
import { todayStarter } from '../../core/lineup';
import { available } from '../../core/player';
import { myPlayers } from '../../core/state';
import { FAM_NAME, RES_NAME, ZONE_NAME, isHit, pitchName } from '../../sim/adapt';
import { Btn, Emblem, Fatigue, Num, Portrait } from '../components/common';
import { refresh, ui, useStore } from '../store';
import { sfx } from '../sound';
import { AUTO_NAME, type AutoMode, type MatchSession } from './session';
import { LineupEditor } from '../tabs/Lineup';

type Dlg = { kind: 'ph' } | { kind: 'pr' } | { kind: 'pc' } | { kind: 'ds' } | null;

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
  const pitchers = avail.slice().sort((a, b) => posRating(b, 'P') - posRating(a, 'P'));
  const auto = todayStarter(avail, rules.pitchLimit, null);
  const starter = mine.setup.defense.P;
  const byId = new Map(mine.setup.players.map((x) => [x.id, x]));
  const posOf = new Map<number, Pos>();
  for (const [pos, id] of Object.entries(mine.setup.defense)) if (id !== undefined) posOf.set(id, pos as Pos);
  const oppAce = theirs.players.find((x) => x.id === theirs.defense.P);
  const oppTop = theirs.order.map((id) => theirs.players.find((x) => x.id === id)!).filter(Boolean).sort((a, b) => batterOffense(b) - batterOffense(a)).slice(0, 2);
  return (
    <div class="match pre">
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
            {oppTop.length ? ` · 强打者 ${oppTop.map((x) => `${fullName(x)}（力 ${Math.round(x.a.power)}）`).join('、')}` : ''}
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
              <ol class="pre-order">
                {mine.setup.order.map((id, i) => {
                  const x = byId.get(id);
                  if (!x) return null;
                  const pos = posOf.get(id);
                  return (
                    <li key={id}>
                      <span class="ord">{i + 1}</span>
                      <span class="pos">{pos ? POS_SHORT[pos] : '指'}</span>
                      <b>{fullName(x)}</b>
                      <span class="dim small">
                        击 <Num v={x.a.contact} /> 力 <Num v={x.a.power} /> 速 <Num v={x.a.speed} />
                      </span>
                    </li>
                  );
                })}
              </ol>
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
                    <b>{fullName(x)}</b>
                    {x.id === auto?.id && <span class="tag">推荐</span>}
                    <span class="small dim">
                      {Math.round(x.a.velocity)}km · 控 <Num v={x.a.control} /> · 威 <Num v={x.a.stuff} /> · 本周 {x.pitchesWeek} 球
                    </span>
                    <Fatigue v={x.fatigue} w={60} />
                  </button>
                ))}
              </div>
              <div class="sect">打席自动化</div>
              <AutoSelect S={S} />
              <div class="small dim mt4">比赛中随时可以改。「关键时刻才问我」：得点圈有人、后半段比分接近、满垒时才停下来等你下指令，其余交给教练。</div>
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
  useEffect(() => {
    if (stageRef.current && fieldRef.current) S.attach(stageRef.current, fieldRef.current);
    return () => S.detach();
  }, [S]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || dlg) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (S.state === 'playing') S.skip();
        else if (S.state === 'ready' && !S.coaching) S.go();
      } else if (e.code === 'Digit1') S.setSpeed(1);
      else if (e.code === 'Digit2') S.setSpeed(2);
      else if (e.code === 'Digit3') S.setSpeed(4);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [S, dlg]);
  const ph = S.muView()?.phase ?? L.phase();
  return (
    <div class="match">
      <Scoreboard S={S} />
      <div class="mgrid">
        <div class="mleft">
          <div class="mcanvas">
            <canvas ref={stageRef} class={S.view === 'stage' ? '' : 'hide'} />
            <canvas ref={fieldRef} class={S.view === 'field' ? '' : 'hide'} />
            <Situation S={S} />
            {S.state === 'playing' && (
              <button type="button" class="mskip" onClick={() => S.skip()}>
                跳过 ▶▶
              </button>
            )}
          </div>
          <div class="mstrip">
            <PitchList S={S} />
          </div>
          <div class="mlog">
            {S.lines
              .slice(-14)
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
              <Intel S={S} />
              {ph === 'bat' ? <BatPanel S={S} setDlg={setDlg} /> : <PitchPanel S={S} setDlg={setDlg} />}
            </>
          )}
        </aside>
      </div>
      {dlg && <SubDialog S={S} dlg={dlg} close={() => setDlg(null)} />}
    </div>
  );
}

function Scoreboard(p: { S: MatchSession }) {
  const S = p.S;
  const L = S.live!;
  const d = S.disp;
  if (!d) return null;
  const inn = Math.max(9, d.line[0].length, d.line[1].length);
  const names = [L.away.short, L.home.short];
  const sn = d.snap;
  const dots = (n: number, max: number, cls: string) => (
    <span class={`dots ${cls}`}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} class={i < n ? 'on' : ''} />
      ))}
    </span>
  );
  return (
    <header class="mtop">
      <table class="sb">
        <thead>
          <tr>
            <th />
            {Array.from({ length: inn }, (_, i) => (
              <th key={i} class={sn.inning === i + 1 ? 'cur' : ''}>
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
      <div class="mstate">
        <div class="minn">
          {sn.inning}局{sn.half ? '下' : '上'} <span class="dim small">{L.m.half === L.mySide ? '进攻' : '防守'}</span>
        </div>
        <div class="bso2">
          <span>B {dots(sn.balls, 3, 'b')}</span>
          <span>S {dots(sn.strikes, 2, 's')}</span>
          <span>O {dots(sn.outs, 2, 'o')}</span>
        </div>
        <Diamond bases={sn.bases.map((x) => x !== null)} />
      </div>
      <div class="mctl">
        <div class="row gap4">
          <span class="dim small">演出</span>
          {[1, 2, 4].map((v) => (
            <button type="button" key={v} class={`chip ${S.speed === v ? 'on' : ''}`} onClick={() => S.setSpeed(v)}>
              {v}x
            </button>
          ))}
        </div>
        <div class="row gap4">
          <select
            value={S.auto}
            onChange={(e) => S.setAuto((e.target as HTMLSelectElement).value as AutoMode)}
            title="打席自动化：哪些打席交给教练"
          >
            {(Object.keys(AUTO_NAME) as AutoMode[]).map((k) => (
              <option key={k} value={k}>
                {AUTO_NAME[k]}
              </option>
            ))}
          </select>
        </div>
        <div class="row gap4">
          <Btn small disabled={S.state !== 'ready'} onClick={() => S.autoHalf()} title="这个半局剩下的打席交给教练">
            本局交给教练
          </Btn>
          <Btn small disabled={S.state === 'playing' || S.state === 'over'} onClick={() => S.toEnd()} title="不看过程，交给教练打到比赛结束">
            打完
          </Btn>
        </div>
      </div>
    </header>
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

function Situation(p: { S: MatchSession }) {
  const S = p.S;
  if (!S.lastRes || S.state === 'playing') return null;
  return <div class="msit">上一打席：{S.lastRes}</div>;
}

function PitchList(p: { S: MatchSession }) {
  const S = p.S;
  if (!S.pitches.length) return <div class="dim small">{S.state === 'playing' ? '投球中…' : '这个打席还没投球'}</div>;
  return (
    <div class="plist">
      {S.pitches.map((x) => (
        <span key={x.n} class="pl">
          <i style={{ background: x.col }}>{x.n}</i>
          {x.text}
        </span>
      ))}
    </div>
  );
}

// ---------------- 对决 ----------------
function Matchup(p: { S: MatchSession }) {
  const S = p.S;
  const v = S.muView();
  if (!v) return null;
  const { b, pt, energy, slot, pos, vs } = v;
  const pb = { np: v.np, outs: v.outs, r: v.r, so: v.so };
  const todayB = v.bseq.length ? v.bseq.join('、') : '还没打';
  return (
    <section class="panel mu">
      <div class="mu-row">
        <div class="mu-card">
          <div class="mu-h">
            <Portrait player={b} size="sm" />
            <div>
              <div>
                <span class="dim small">{slot}棒 {pos ? (pos === 'DH' ? '指' : POS_SHORT[pos]) : ''} #{S.numOf(b.id)}</span>
              </div>
              <b>{fullName(b)}</b> <span class="dim small">{b.bats === 'L' ? '左打' : b.bats === 'S' ? '左右开弓' : '右打'}</span>
            </div>
          </div>
          <div class="mu-a">
            <span>击球 <Num v={b.a.contact} /></span>
            <span>力量 <Num v={b.a.power} /></span>
            <span>选球 <Num v={b.a.eye} /></span>
            <span>跑速 <Num v={b.a.speed} /></span>
          </div>
          <div class="small dim">今天：{todayB}</div>
          <Traits pl={b} />
        </div>
        <div class="mu-card">
          <div class="mu-h">
            <Portrait player={pt} size="sm" />
            <div>
              <div>
                <span class="dim small">投手 #{S.numOf(pt.id)} {pt.throws === 'L' ? '左投' : '右投'}</span>
              </div>
              <b>{fullName(pt)}</b>
            </div>
          </div>
          <div class="mu-a">
            <span>球速 <Num v={velScore(pt.a.velocity)} /> <span class="dim small">{Math.round(pt.a.velocity)}km</span></span>
            <span>控球 <Num v={pt.a.control} /></span>
            <span>球威 <Num v={pt.a.stuff} /></span>
            <span>
              体力 <span class={`stam ${energy > 0.85 ? 'bad' : energy > 0.6 ? 'mid' : ''}`}>{Math.max(0, Math.round((1 - energy) * 100))}%</span>
            </span>
          </div>
          <div class="small dim">
            {pb.np} 球 · {Math.floor(pb.outs / 3)}{pb.outs % 3 ? `.${pb.outs % 3}` : ''} 局 · 失 {pb.r} · 三振 {pb.so}
          </div>
          <div class="small">{pt.pitches.length ? pt.pitches.map((x) => `${x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].short}${x.lv}`).join(' ') : '只有直球'}</div>
        </div>
      </div>
      {vs.length > 0 && (
        <div class="small mu-vs">
          本场对决：
          {vs.map((x, i) => (
            <span key={i} class={isHit(x.res) ? 'good' : x.res === 'K' ? 'bad' : ''}>
              {i ? '、' : ''}
              {RES_NAME[x.res]}
              {x.last ? `（${pitchName(x.last.t)}）` : ''}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Traits(p: { pl: Player }) {
  const t = traitList(p.pl).slice(0, 4);
  if (!t.length) return null;
  return (
    <div class="mu-t">
      {t.map((x) => (
        <span key={x.id} class={`tag ${x.good ? '' : 'bad'}`}>
          {x.name}
        </span>
      ))}
    </div>
  );
}

// ---------------- 情报与教练 ----------------
function Intel(p: { S: MatchSession }) {
  const S = p.S;
  const L = S.live!;
  const v = S.muView();
  if (!v) return null;
  const it = v.intel;
  const bat = v.phase === 'bat';
  const adv = S.state === 'playing' ? { cmd: null, why: v.advice } : bat ? L.adviceBat() : L.advicePitch();
  return (
    <section class="panel intel">
      <div class="it-h">
        <b>{bat ? '对方投手的打算' : '对方打者的打算'}</b>
        <span class="dim small">（慧眼 {Math.round(G.mgr.skills.insight)}{G.facilities.analysis ? ` · 影像分析室 ${G.facilities.analysis} 级` : ''}）</span>
      </div>
      {it.seen ? (
        it.why.length ? (
          <ul class="it-l">
            {it.why.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        ) : (
          <div class="small dim">看起来没有特别的打算。</div>
        )
      ) : (
        <div class="small dim">看不透对方这个打席的意图。</div>
      )}
      <div class="it-h mt4">
        <b>教练建议</b>
        {!S.coaching && S.state === 'ready' && (
          <button
            type="button"
            class="chip"
            onClick={() => {
              if (!adv.cmd) return;
              if (bat) S.bat = { ...(adv.cmd as BatCmd) };
              else S.plan = { ...(adv.cmd as PitchPlan) };
              refresh();
            }}
          >
            采用建议
          </button>
        )}
      </div>
      <ul class="it-l adv">
        {adv.why.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
      </ul>
    </section>
  );
}

// ---------------- 指令 ----------------
function Opt<T extends string | number>(p: { label: string; value: T; opts: [T, string, string?, boolean?][]; set: (v: T) => void }) {
  return (
    <div class="opt">
      <span class="opt-l">{p.label}</span>
      <span class="row wrap gap4">
        {p.opts.map(([v, name, tip, disabled]) => (
          <button type="button" key={String(v)} class={`chip ${p.value === v ? 'on' : ''}`} title={tip} disabled={disabled} onClick={() => p.set(v)}>
            {name}
          </button>
        ))}
      </span>
    </div>
  );
}

function GoBar(p: { S: MatchSession; children?: ComponentChildren }) {
  const S = p.S;
  if (S.coaching) {
    return (
      <div class="gobar">
        <span class="dim small">教练指挥中…</span>
        <span class="grow" />
        <Btn
          small
          onClick={() => {
            S.halfAuto = null;
            if (S.auto !== 'off') S.setAuto('off');
          }}
        >
          我来指挥
        </Btn>
      </div>
    );
  }
  return (
    <div class="gobar">
      {p.children}
      <span class="grow" />
      <Btn kind="primary" disabled={S.state !== 'ready'} onClick={() => S.go()} title="空格键">
        {S.state === 'playing' ? '比赛进行中…' : '▶ 开始打席'}
      </Btn>
    </div>
  );
}

function BatPanel(p: { S: MatchSession; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const m = S.live!.m;
  const c = S.bat;
  const set = <K extends keyof BatCmd>(k: K, v: BatCmd[K]) => {
    S.bat = { ...S.bat, [k]: v };
    refresh();
  };
  const [r1, r2, r3] = m.bases.map(Boolean);
  const anyR = r1 || r2 || r3;
  const b = S.muView()?.b ?? m.batter();
  return (
    <section class="panel cmd">
      <div class="ptitle">
        <span>进攻指令 · {fullName(b)}</span>
      </div>
      <Opt
        label="打法"
        value={c.app}
        set={(v) => set('app', v)}
        opts={[
          ['normal', '普通', '照平常打'],
          ['power', '强振', '大棒一挥：长打更多，但更容易三振'],
          ['contact', '轻打', '缩短挥棒：更容易碰到球，长打变少'],
          ['aggressive', '积极', '早早出棒，不让投手抢好球数'],
          ['wait', '选球', '两好球前多等：多保送、多消耗对方球数，也会多被看着好球'],
          ['bunt', '牺牲触击', '把跑者送上去（两好球后改为轻打）', !anyR],
          ['buntHit', '触击安打', '突袭触击，脚快才有机会'],
          ['squeeze', '抢分', '三垒跑者起跑、打者触击（被识破就很惨）', !r3],
        ]}
      />
      <Opt
        label="狙球种"
        value={c.sit}
        set={(v) => set('sit', v)}
        opts={[
          ['none', '不狙'],
          ['FB', '直球', '直球系（四缝线、二缝线、卡特、伸卡、内飘）来了更好打，变化球来了会被骗'],
          ['BR', '变化球', '变化球来了更好打，直球来了会慢半拍'],
        ]}
      />
      <Opt
        label="狙路线"
        value={c.zone}
        set={(v) => set('zone', v as Zone | 'none')}
        opts={[
          ['none', '不狙'],
          ['in', '内角', '内角来了更好打，其他位置的球两好球前多半不出棒'],
          ['out', '外角'],
          ['high', '高球'],
          ['low', '低球'],
        ]}
      />
      {anyR && (
        <>
          <Opt
            label="跑垒"
            value={c.agg}
            set={(v) => set('agg', v)}
            opts={[
              [-1, '稳健', '小离垒、不冒险多跑'],
              [0, '普通'],
              [1, '积极', '大离垒、安打时多抢一个垒、高飞球敢冲本垒（边缘情况容易出局，也更容易被牵制）'],
            ]}
          />
          <Opt
            label="跑者"
            value={c.run}
            set={(v) => set('run', v)}
            opts={[
              ['none', '不动'],
              ['steal', '盗垒', '第一球起跑（领先的跑者）', !(r1 && !r2) && !(r2 && !r3)],
              ['hitRun', '打带跑', '一垒跑者起跑，打者无论如何都要出棒', !(r1 && !r2)],
              ['doubleSteal', '双盗', '一、二垒跑者同时起跑', !(r1 && r2 && !r3)],
            ]}
          />
        </>
      )}
      <GoBar S={S}>
        <Btn small disabled={S.state !== 'ready'} onClick={() => p.setDlg({ kind: 'ph' })}>
          代打
        </Btn>
        {anyR && (
          <Btn small disabled={S.state !== 'ready'} onClick={() => p.setDlg({ kind: 'pr' })}>
            代跑
          </Btn>
        )}
      </GoBar>
    </section>
  );
}

function PitchPanel(p: { S: MatchSession; setDlg: (d: Dlg) => void }) {
  const S = p.S;
  const m = S.live!.m;
  const c = S.plan;
  const set = <K extends keyof PitchPlan>(k: K, v: PitchPlan[K]) => {
    S.plan = { ...S.plan, [k]: v };
    refresh();
  };
  const pt = m.pitcher();
  const anyR = m.bases.some(Boolean);
  const fin: [string, string, string?][] = [['', '自动'], ['FB', '直球']];
  for (const x of pt.pitches) fin.push([x.type, `${x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}${x.lv}`, PITCH_DEFS[x.type].desc]);
  const left = m.pickoffsLeft();
  return (
    <section class="panel cmd">
      <div class="ptitle">
        <span>防守指令 · {fullName(S.muView()?.b ?? m.batter())}</span>
      </div>
      <Opt
        label="配球"
        value={c.mix}
        set={(v) => set('mix', v)}
        opts={[
          ['auto', '交给捕手'],
          ['FB', '直球为主', '直球（含二缝线、卡特等直球系）多投'],
          ['BR', '变化球为主', '变化球多投'],
        ]}
      />
      <Opt label="决胜球" value={c.finisher ?? ''} set={(v) => set('finisher', (v || null) as PitchPlan['finisher'])} opts={fin} />
      <Opt
        label="攻击区域"
        value={c.focus}
        set={(v) => set('focus', v as Zone | 'auto')}
        opts={[
          ['auto', '自动'],
          ['in', '内角', '塞内角：被打中也不容易打扎实，但容易触身'],
          ['out', '外角', '外角：不容易被打远'],
          ['high', '高球', '高的直球容易挥空，但被打中容易飞远'],
          ['low', '低球', '低球多滚地球，适合双杀'],
        ]}
      />
      <Opt
        label="投球方针"
        value={c.ibb ? 'ibb' : c.approach}
        set={(v) => {
          if (v === 'ibb') S.plan = { ...S.plan, ibb: true };
          else S.plan = { ...S.plan, ibb: false, approach: v as PitchPlan['approach'] };
          refresh();
        }}
        opts={[
          ['normal', '普通'],
          ['max', '全力投球', '球速球威上升，体力消耗大'],
          ['contact', '抢好球数', '多投好球带，少保送，但容易被打'],
          ['careful', '慎重', '攻边角、不给好打的球，保送会变多'],
          ['ibb', '敬远', '申告敬远，直接保送'],
        ]}
      />
      <Opt
        label="守备阵型"
        value={c.align}
        set={(v) => set('align', v as Alignment)}
        opts={[
          ['normal', '普通'],
          ['infieldIn', '前进守备', '内野上前，阻止三垒跑者回本垒（但滚地球更容易穿过）'],
          ['dp', '防双杀', '二游靠近二垒'],
          ['noDoubles', '长打防守', '外野后退，防长打'],
          ['buntShift', '防触击', '一三垒手前冲'],
        ]}
      />
      {anyR && (
        <div class="opt">
          <span class="opt-l">跑者</span>
          <span class="row wrap gap4">
            <button type="button" class={`chip ${c.hold ? 'on' : ''}`} title="快速投球：盗垒更难，但球质略降" onClick={() => set('hold', !c.hold)}>
              注意跑者
            </button>
            <button type="button" class={`chip ${c.pitchout ? 'on' : ''}`} title="第一球投外角吊球，专门对付盗垒和抢分" onClick={() => set('pitchout', !c.pitchout)}>
              外角吊球
            </button>
            <button
              type="button"
              class="chip"
              disabled={left <= 0 || S.state !== 'ready'}
              title="牵制：偶尔能抓到离垒太大的跑者，也让跑者不敢乱跑；每个打席最多 3 次"
              onClick={() => S.act({ k: 'po' })}
            >
              牵制（还能 {left} 次）
            </button>
          </span>
        </div>
      )}
      <GoBar S={S}>
        <Btn small disabled={S.state !== 'ready'} onClick={() => p.setDlg({ kind: 'pc' })}>
          换投
        </Btn>
        <Btn small disabled={S.state !== 'ready'} onClick={() => p.setDlg({ kind: 'ds' })}>
          守备替换
        </Btn>
      </GoBar>
    </section>
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
  let rows: { p: Player; info: ComponentChildren; disabled?: boolean }[] = [];
  let doIt: (pid: number) => void = () => {};
  switch (p.dlg.kind) {
    case 'ph':
      title = `代打：替换 ${fullName(m.batter())}`;
      rows = bench.filter((x) => !isPitcher(x) || batterOffense(x) >= 45).sort((a, b) => batterOffense(b) - batterOffense(a)).map((x) => ({
        p: x,
        info: (
          <>
            {x.bats === 'L' ? '左打' : x.bats === 'S' ? '左右' : '右打'} · 击 <Num v={x.a.contact} /> 力 <Num v={x.a.power} /> 眼 <Num v={x.a.eye} /> 速 <Num v={x.a.speed} />
          </>
        ),
      }));
      doIt = (pid) => S.act({ k: 'ph', slot: t.batIdx, pid });
      break;
    case 'pr':
      title = '代跑';
      rows = bench.filter((x) => !isPitcher(x)).sort((a, b) => b.a.speed - a.a.speed).map((x) => ({
        p: x,
        info: (
          <>
            跑速 <Num v={x.a.speed} /> 跑垒 <Num v={x.a.baserun} />
            {has(x, 'steal') ? ' · 盗垒○' : ''}
          </>
        ),
      }));
      doIt = (pid) => S.act({ k: 'pr', base, pid });
      break;
    case 'pc':
      title = `换投：替换 ${fullName(m.pitcher())}`;
      rows = bench.slice().sort((a, b) => posRating(b, 'P') - posRating(a, 'P')).map((x) => {
        const left = m.rules.pitchLimit - m.weeklyPitches(t, x.id);
        return {
          p: x,
          disabled: left <= 10,
          info: (
            <>
              {x.throws === 'L' ? '左投' : '右投'} · {Math.round(x.a.velocity)}km 控 <Num v={x.a.control} /> 威 <Num v={x.a.stuff} /> 耐 <Num v={x.a.stamina} /> · {x.pitches.map((k) => PITCH_DEFS[k.type].short + k.lv).join(' ') || '只有直球'}
              <Fatigue v={x.fatigue} w={40} />
            </>
          ),
        };
      });
      doIt = (pid) => S.act({ k: 'pc', pid });
      break;
    case 'ds':
      title = '守备替换';
      rows = bench.map((x) => ({
        p: x,
        info: (
          <>
            {POS_NAME[pos]}守备 <Num v={fieldAt(x, pos)} /> · 肩 <Num v={x.a.arm} /> 速 <Num v={x.a.speed} />
          </>
        ),
      })).sort((a, b) => fieldAt(b.p, pos) - fieldAt(a.p, pos));
      doIt = (pid) => S.act({ k: 'ds', pos, pid });
      break;
  }
  return (
    <div class="overlay" onClick={p.close}>
      <div class="modal sub" onClick={(e) => e.stopPropagation()}>
        <div class="mtitle">
          <span>{title}</span>
        </div>
        <div class="mbody2">
          {p.dlg.kind === 'pr' && (
            <div class="row gap4 mb6">
              {m.bases.map((r, i) =>
                r ? (
                  <button type="button" key={i} class={`chip ${base === i ? 'on' : ''}`} onClick={() => setBase(i)}>
                    {['一', '二', '三'][i]}垒 {fullName(t.get(r.pid))}
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
            rows.map((r) => (
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
                <span>
                  <b>{fullName(r.p)}</b> <span class="dim small">{r.p.grade}年</span>
                  <div class="small dim">{r.info}</div>
                </span>
              </button>
            ))
          ) : (
            <div class="dim">板凳上没有合适的人。</div>
          )}
        </div>
        <div class="mfoot">
          <Btn onClick={p.close}>取消</Btn>
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
      <table class="box small">
        <thead>
          <tr>
            <th>打者</th>
            <th>打数</th>
            <th>安打</th>
            <th>打点</th>
            <th>结果</th>
          </tr>
        </thead>
        <tbody>
          {bat.map((b) => (
            <tr key={b.pid}>
              <td>{fullName(L.myTeam.get(b.pid))}</td>
              <td>{b.ab}</td>
              <td>{b.h}</td>
              <td>{b.rbi}</td>
              <td class="dim">{b.seq.join(' ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {sum.highlights.length > 0 && (
        <ul class="small it-l">
          {sum.highlights.slice(0, 5).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      )}
      <Btn kind="primary" big onClick={() => S.finish()}>
        回到学校
      </Btn>
    </section>
  );
}

export { FAM_NAME, ZONE_NAME };
