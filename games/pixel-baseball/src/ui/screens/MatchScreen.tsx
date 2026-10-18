// 比赛画面：现场指挥
import { useEffect, useRef, useState } from 'preact/hooks';
import type { Match, TeamState } from '../../sim/match';
import type { Alignment, OffTactic, PitchApproach, PlayEvent, Snap } from '../../sim/types';
import type { Player, Pos } from '../../core/types';
import { POS_ABBR } from '../../core/types';
import { G } from '../../core/state';
import { FieldRenderer, FW, FH, type FieldAlign } from '../../render/field';
import { liveState, settings, saveSettings } from '../live';
import { ui } from '../store';
import { Btn, Portrait, Grade, Bar, Cond, Tip } from '../components/common';
import { fullName, isPitcher, pitcherOverall, batterOffense, traitList, avgOf, ipStr } from '../../core/attrs';
import { PITCH_DEFS } from '../../data/traits';
import { suggest } from '../../sim/ai';
import { sfx } from '../sound';

const OFF_LIST: { id: OffTactic; label: string; tip: string }[] = [
  { id: 'auto', label: 'AI判断', tip: '由 AI 决定本打席的战术' },
  { id: 'swing', label: '自由打击', tip: '正常击球' },
  { id: 'aggressive', label: '积极', tip: '积极挥棒，长打略增，三振与追打坏球增加' },
  { id: 'wait', label: '待球', tip: '两好球前多看球，消耗投手用球数、争取四坏' },
  { id: 'contact', label: '轻打', tip: '缩短挥棒，提高击中率，牺牲力量' },
  { id: 'power', label: '强振', tip: '全力挥棒，力量提升，击中率下降' },
  { id: 'bunt', label: '牺牲触击', tip: '推进一、二垒跑者（三垒跑者不起跑，想抢分请用抢分触击；持续到打席结束或你改变指令）' },
  { id: 'buntHit', label: '触击安打', tip: '出其不意的触击，适合快脚打者' },
  { id: 'squeeze', label: '抢分触击', tip: '三垒跑者起跑，打者必须触击（下一球）' },
  { id: 'hitRun', label: '打带跑', tip: '一垒跑者起跑，打者必须挥棒（下一球）' },
  { id: 'steal', label: '盗垒', tip: '领先跑者盗垒（下一球）' },
  { id: 'doubleSteal', label: '双盗垒', tip: '一二垒跑者同时起跑（下一球）' },
];
const APPROACH: { id: PitchApproach; label: string; tip: string }[] = [
  { id: 'normal', label: '普通', tip: '标准配球' },
  { id: 'max', label: '力投', tip: '球速球威提升，控球略降，体力消耗大' },
  { id: 'contact', label: '诱打', tip: '多投好球带让对方打出去，节省用球' },
  { id: 'careful', label: '慎重', tip: '多投边角，减少被长打，但四坏球增加' },
];
const ALIGN: { id: Alignment; label: string; tip: string }[] = [
  { id: 'normal', label: '普通守备', tip: '标准站位' },
  { id: 'infieldIn', label: '前进守备', tip: '内野前移阻止三垒跑者得分，但滚地球更容易穿越' },
  { id: 'dp', label: '双杀阵型', tip: '二游靠近二垒，提高双杀率' },
  { id: 'noDoubles', label: '防长打', tip: '外野后退，减少长打，但小飞球更容易落地' },
  { id: 'buntShift', label: '触击防备', tip: '一三垒手冲前，压制触击' },
];

function speedMs(): number {
  return settings.animSpeed >= 3 ? 999 : settings.animSpeed === 2 ? 2.2 : 1;
}

export function LineScore(p: { match: Match; disp?: Disp }) {
  const m = p.match;
  const d = p.disp;
  const n = Math.max(9, m.inning);
  const cols = Array.from({ length: n }, (_, i) => i);
  const rows = [0, 1] as const;
  return (
    <div class="scoreboard">
      <table>
        <thead>
          <tr>
            <th />
            {cols.map((i) => (
              <th key={i}>{i + 1}</th>
            ))}
            <th>R</th>
            <th>H</th>
            <th>E</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const t = m.T[s];
            const line = d ? d.line[s] : t.line;
            const cur = d ? d.snap.inning - 1 : m.inning - 1;
            const curHalf = d ? d.snap.half : m.half;
            return (
              <tr key={s}>
                <td class="team">
                  <span class="emblem" style={{ background: t.s.colors.primary, color: t.s.colors.secondary, width: '16px', height: '16px', marginRight: '4px' }}>
                    {t.s.colors.letter}
                  </span>
                  {t.s.short}
                </td>
                {cols.map((i) => {
                  const v = line[i];
                  const isCur = !m.over && i === cur && curHalf === s;
                  const xMark = m.over && s === 1 && i === m.inning - 1 && v === undefined && m.T[1].runs > m.T[0].runs;
                  return (
                    <td key={i} class={isCur ? 'cur' : ''}>
                      {xMark ? 'X' : v === undefined ? '' : v}
                    </td>
                  );
                })}
                <td class="rhe">{d ? d.snap.score[s] : t.runs}</td>
                <td class="rhe">{d ? d.hits[s] : t.hits}</td>
                <td class="rhe">{d ? d.errors[s] : t.errors}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BoxScore(p: { match: Match }) {
  const m = p.match;
  return (
    <div class="grid2 mt8">
      {[0, 1].map((s) => {
        const t = m.T[s as 0 | 1];
        const bats = [...t.bat.values()];
        return (
          <div key={s} class="panel flat dark">
            <div class="accent">{t.s.name}</div>
            <table class="px">
              <thead>
                <tr>
                  <th>打者</th>
                  <th class="num">打数</th>
                  <th class="num">安打</th>
                  <th class="num">打点</th>
                  <th>结果</th>
                </tr>
              </thead>
              <tbody>
                {bats.map((b) => {
                  const pl = t.get(b.pid);
                  return (
                    <tr key={b.pid}>
                      <td>{pl ? pl.fam : '?'}</td>
                      <td class="num">{b.ab}</td>
                      <td class="num">{b.h}</td>
                      <td class="num">{b.rbi}</td>
                      <td class="small">{b.seq.join(' ')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <table class="px mt8">
              <thead>
                <tr>
                  <th>投手</th>
                  <th class="num">局</th>
                  <th class="num">球数</th>
                  <th class="num">被安</th>
                  <th class="num">三振</th>
                  <th class="num">四球</th>
                  <th class="num">失分</th>
                </tr>
              </thead>
              <tbody>
                {[...t.pit.values()].map((pp) => (
                  <tr key={pp.pid}>
                    <td>{t.get(pp.pid)?.fam}</td>
                    <td class="num">{ipStr(pp.outs)}</td>
                    <td class="num">{pp.np}</td>
                    <td class="num">{pp.h}</td>
                    <td class="num">{pp.so}</td>
                    <td class="num">{pp.bb}</td>
                    <td class="num">{pp.r}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

interface Disp {
  snap: Snap;
  line: [number[], number[]];
  hits: [number, number];
  errors: [number, number];
}

function dispFrom(m: Match): Disp {
  return {
    snap: m.snap(),
    line: [m.T[0].line.slice(), m.T[1].line.slice()],
    hits: [m.T[0].hits, m.T[1].hits],
    errors: [m.T[0].errors, m.T[1].errors],
  };
}

function Lights(p: { n: number; max: number; cls: string; label: string }) {
  return (
    <div class={`lights ${p.cls}`}>
      <span style={{ width: '12px' }}>{p.label}</span>
      {Array.from({ length: p.max }, (_, i) => (
        <i key={i} class={i < p.n ? 'on' : ''} />
      ))}
    </div>
  );
}

function BatterCard(p: { m: Match; b: Player }) {
  const { m, b } = p;
  const box = m.off.bat.get(b.id);
  const season = b.stats.season.bat;
  const side = b.bats === 'S' ? '两打' : b.bats === 'L' ? '左打' : '右打';
  const pos = m.off.posOf(b.id);
  return (
    <div class="panel flat">
      <div class="row">
        <Portrait player={b} />
        <div class="grow">
          <div class="accent">{m.off.batIdx + 1}棒 {pos === 'DH' ? 'DH' : pos ? POS_ABBR[pos as Pos] : ''} {fullName(b)}</div>
          <div class="muted small">{side} · 本季 {avgOf(season).toFixed(3).replace(/^0/, '')} {season.hr}HR · <Cond v={b.cond} /></div>
        </div>
      </div>
      <div class="row wrap mt8 small">
        <span>击<Grade v={b.a.contact} /></span>
        <span>力<Grade v={b.a.power} /></span>
        <span>眼<Grade v={b.a.eye} /></span>
        <span>速<Grade v={b.a.speed} /></span>
      </div>
      {box && box.seq.length > 0 && <div class="small muted">今日：{box.seq.join(' / ')}</div>}
      <div class="row wrap gap4 small">
        {traitList(b).map((t) => (
          <span key={t.id} class={`tag ${t.good ? 'good' : 'bad'}`}>{t.name}</span>
        ))}
      </div>
    </div>
  );
}

function PitcherCard(p: { m: Match; pt: Player; t: TeamState }) {
  const { m, pt, t } = p;
  const f = t.fatigueRatio(pt.id);
  const box = t.pit.get(pt.id);
  const wk = m.weeklyPitches(t, pt.id);
  const stam = Math.max(0, 1 - f);
  return (
    <div class="panel flat">
      <div class="row">
        <Portrait player={pt} />
        <div class="grow">
          <div class="accent">投手 {fullName(pt)}</div>
          <div class="muted small">{pt.throws === 'L' ? '左投' : '右投'} · 最快 {Math.round(pt.a.velocity)}km/h · <Cond v={pt.cond} /></div>
        </div>
      </div>
      <div class="row mt8 small">
        <span style={{ width: '42px' }}>体力</span>
        <div class="grow">
          <Bar v={stam * 100} color={stam > 0.45 ? 'var(--green)' : stam > 0.2 ? 'var(--orange)' : 'var(--red)'} />
        </div>
      </div>
      <div class="row small">
        <span style={{ width: '42px' }}>动摇</span>
        <div class="grow">
          <Bar v={t.rattle * 100} color="var(--pink)" />
        </div>
      </div>
      <div class="small">
        本场 {box?.np ?? 0} 球 · 本周 {wk}/500 球 · {ipStr(box?.outs ?? 0)} 局 {box?.so ?? 0}K
      </div>
      {stam < 0.25 && <div class="small bad">⚠ 体力即将耗尽，球速与控球大幅下降</div>}
      {wk >= 440 && <div class="small warn">⚠ 接近一周 500 球的用球数限制</div>}
      {t.rattle > 0.6 && <div class="small warn">⚠ 投手明显动摇，可以考虑传令</div>}
      <div class="row wrap gap4 small mt8">
        <span class="tag fill">直球</span>
        {pt.pitches.map((x) => (
          <span key={x.type} class="tag fill">
            {PITCH_DEFS[x.type].name}
            {x.lv}
          </span>
        ))}
      </div>
    </div>
  );
}

function Zone(p: { events: PlayEvent[] }) {
  const pitches = p.events.filter((e) => e.pitch).slice(-6);
  return (
    <div class="zone">
      <div class="box" />
      {pitches.map((e, i) => {
        const pi = e.pitch!;
        const col = pi.res === 'ball' || pi.res === 'pitchout' ? '#38b764' : pi.res === 'inplay' ? '#41a6f6' : pi.res === 'hbp' ? '#ff77a8' : '#ffcd75';
        return (
          <div
            key={i}
            class="dot"
            title={`${pi.type === 'FB' ? '直球' : PITCH_DEFS[pi.type].name} ${pi.kmh}km/h`}
            style={{ left: `${60 + pi.x * 30}px`, top: `${70 - pi.y * 40}px`, background: col, opacity: 0.4 + (i / pitches.length) * 0.6 }}
          />
        );
      })}
      {pitches.length > 0 && (
        <div class="small" style={{ position: 'absolute', bottom: '2px', left: '4px', right: '4px' }}>
          {(() => {
            const last = pitches[pitches.length - 1].pitch!;
            return `${last.type === 'FB' ? '直球' : PITCH_DEFS[last.type].name} ${last.kmh}`;
          })()}
        </div>
      )}
    </div>
  );
}

export function MatchScreen() {
  const L = liveState.cur;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendRef = useRef<FieldRenderer | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const [, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [disp, setDisp] = useState<Disp | null>(null);
  const [paEvents, setPaEvents] = useState<PlayEvent[]>([]);
  const [autoRun, setAutoRun] = useState<null | 'key' | 'end'>(L?.watch ? 'key' : null);
  const [panel, setPanel] = useState<'cmd' | 'sub' | 'lineup'>('cmd');
  const [scale, setScale] = useState(2);
  const autoRef = useRef(autoRun);
  autoRef.current = autoRun;
  const force = () => setTick((x) => x + 1);
  const actRef = useRef<((k: 'pitch' | 'pa' | 'half' | 'end') => Promise<void>) | null>(null);
  const zoneKey = useRef('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (ui.modals.length) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        void actRef.current?.('pa');
      } else if (e.code === 'Enter') {
        e.preventDefault();
        void actRef.current?.('pitch');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!L || !canvasRef.current) return;
    const m = L.match;
    const r = new FieldRenderer(canvasRef.current, {
      koshien: m.rules.koshien,
      fence: m.rules.fence,
      homeColors: m.T[1].s.colors,
      awayColors: m.T[0].s.colors,
      seed: m.T[1].s.schoolId * 7 + 3,
    });
    r.speed = speedMs();
    rendRef.current = r;
    const fit = () => {
      const box = canvasRef.current?.parentElement;
      if (!box) return;
      const w = box.clientWidth - 8;
      const s = Math.min(3, Math.floor(w / FW), Math.floor((window.innerHeight - 330) / FH));
      // 手机等窄屏放不下 1 倍时按比例缩小
      setScale(s >= 1 ? s : Math.max(0.5, Math.min(1, w / FW)));
    };
    fit();
    window.addEventListener('resize', fit);
    sfx('siren');
    m.prepare();
    r.setDefense(m.half === 0);
    r.setBases(m.snap().bases);
    setDisp(dispFrom(m));
    force();
    return () => {
      window.removeEventListener('resize', fit);
      r.stop();
    };
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  });

  useEffect(() => {
    if (autoRun && !busy && L && !L.match.over) {
      const id = setTimeout(() => void act('pa'), settings.animSpeed >= 3 ? 10 : 250);
      return () => clearTimeout(id);
    }
    return undefined;
  });

  if (!L) return <div class="panel">没有进行中的比赛</div>;
  const m = L.match;
  const me = m.T[L.mySide];
  const myBat = m.half === L.mySide;


  /** 让球场画面与当前打者、守备阵型一致 */
  function syncField(rd: FieldRenderer): void {
    const bt = m.batter();
    const pt = m.pitcher();
    rd.batterSide = bt.bats === 'S' ? (pt.throws === 'R' ? 'L' : 'R') : bt.bats;
    rd.setAlignment(m.dfn.def.align as FieldAlign);
  }

  async function animate(evs: PlayEvent[]): Promise<void> {
    const rd = rendRef.current;
    if (!rd) return;
    rd.speed = speedMs();
    syncField(rd);
    const d = disp ?? dispFrom(m);
    const cur: Disp = { snap: d.snap, line: [d.line[0].slice(), d.line[1].slice()], hits: [...d.hits] as [number, number], errors: [...d.errors] as [number, number] };
    for (const e of evs) {
      if (e.k === 'half') {
        rd.resetPositions();
        rd.setDefense(e.side === 0);
        rd.setBases(e.snap?.bases ?? [null, null, null]);
        setPaEvents([]);
      }
      if (e.pitch) {
        setPaEvents((xs) => [...xs, e]);
        await rd.playPitch(e.pitch);
        if (e.pitch.res !== 'inplay') sfx('mitt');
      }
      if (e.bip) {
        sfx('bat');
        if (e.bip.res === 'HR') sfx('hr');
        await rd.playBip(e.bip, e.moves ?? []);
        rd.resetPositions();
      } else if (e.moves && e.moves.length) {
        await rd.playMoves(e.moves);
      }
      if (e.k === 'play' || e.k === 'ibb') {
        rd.batterOn = true;
        if (e.moves?.some((mv) => mv.out)) sfx('out');
      }
      if (e.snap) {
        rd.setBases(e.snap.bases);
        if (e.runs) {
          const inn = e.snap.inning - 1;
          cur.line[e.side][inn] = (cur.line[e.side][inn] ?? 0) + e.runs;
          sfx('cheer');
        }
        if (e.k === 'half') cur.line[e.side][e.snap.inning - 1] = cur.line[e.side][e.snap.inning - 1] ?? 0;
        cur.snap = e.snap;
        setDisp({ ...cur, line: [cur.line[0].slice(), cur.line[1].slice()] });
      }
      if (e.big && e.k === 'play' && settings.animSpeed < 3) {
        if (e.bip?.res === 'HR') rd.showFlash('本垒打!!', '#ffcd75', 1.4);
        await new Promise((res) => setTimeout(res, 250 / speedMs()));
      }
    }
    setDisp(dispFrom(m));
  }

  async function act(kind: 'pitch' | 'pa' | 'half' | 'end'): Promise<void> {
    if (busy || m.over) return;
    setBusy(true);
    // 新的打席开始时清空好球带示意
    const key = `${m.inning}-${m.half}-${m.off.batIdx}-${m.batter().id}`;
    if (key !== zoneKey.current) {
      zoneKey.current = key;
      setPaEvents([]);
    }
    try {
      let evs: PlayEvent[] = [];
      if (kind === 'pitch') evs = m.step();
      else if (kind === 'pa') evs = m.stepPA();
      else if (kind === 'half') evs = m.stepHalf();
      else {
        evs = m.toEnd();
        rendRef.current!.speed = 999;
      }
      if (kind === 'end') {
        setDisp(dispFrom(m));
        rendRef.current?.setBases(m.snap().bases);
      } else await animate(evs);
      if (!m.over) {
        const pre = m.prepare();
        if (pre.length) await animate(pre);
      }
      if (autoRef.current === 'key' && settings.stopAtKey && !me.auto && m.isKeyMoment()) setAutoRun(null);
    } finally {
      setBusy(false);
      force();
    }
  }

  actRef.current = act;

  function setOff(t: OffTactic) {
    me.tactic = t;
    sfx('click');
    force();
  }
  function setDef(k: 'approach' | 'align', v: string) {
    if (k === 'align') rendRef.current?.setAlignment(v as FieldAlign);
    (me.def as unknown as Record<string, string>)[k] = v;
    me.defAI = false;
    sfx('click');
    force();
  }
  function uiCmd(fn: () => unknown) {
    const evs = m.ui(fn);
    void animate(evs);
    force();
  }

  const b = m.batter();
  const pit = m.pitcher();
  const dT = m.dfn;
  const finished = m.over;

  return (
    <div class="main match-main">
      <div class="row between mb8">
        <div class="page-title match-title" style={{ margin: 0 }}>
          ⚾ {L.pm.label}
          <span class="sub">{m.rules.stadium}{m.rules.koshien ? ' · 甲子园' : ''}{m.rules.mercy ? ' · 有提前结束规则' : ''}</span>
        </div>
        <div class="row">
          <span class="muted hide-sm">动画速度</span>
          {[1, 2, 3].map((s) => (
            <Btn
              key={s}
              small
              on={settings.animSpeed === s}
              onClick={() => {
                settings.animSpeed = s;
                saveSettings();
                if (rendRef.current) rendRef.current.speed = speedMs();
                force();
              }}
            >
              {s === 1 ? '普通' : s === 2 ? '快' : '瞬间'}
            </Btn>
          ))}
        </div>
      </div>
      <LineScore match={m} disp={disp ?? undefined} />
      <div class="match-wrap mt8">
        <div class="col">
          <div class="fieldbox">
            <canvas ref={canvasRef} width={FW} height={FH} style={{ width: `${FW * scale}px`, height: `${FH * scale}px` }} />
            <div style={{ position: 'absolute', left: '8px', top: '8px', background: 'rgba(11,12,20,.75)', padding: '4px 8px' }}>
              <div>
                {(disp?.snap.inning ?? m.inning)}局{(disp?.snap.half ?? m.half) ? '下' : '上'}
              </div>
              <Lights n={disp?.snap.balls ?? m.balls} max={3} cls="b" label="B" />
              <Lights n={disp?.snap.strikes ?? m.strikes} max={2} cls="s" label="S" />
              <Lights n={disp?.snap.outs ?? m.outs} max={2} cls="o" label="O" />
            </div>
          </div>
          <div class="commentary" ref={logRef}>
            {m.log.slice(-80).map((e, i) => (
              <div key={i} class={`ln ${e.big ? 'big' : ''} ${e.k === 'half' ? 'half' : ''} ${e.k === 'pitch' ? 'pitch' : ''}`}>
                {e.k === 'half' ? '━━ ' : ''}
                {e.text}
              </div>
            ))}
          </div>
          {finished ? (
            <div class="panel">
              <div class="big-text accent">比赛结束</div>
              <div class="mt8">{m.log[m.log.length - 1]?.text}</div>
              <BoxScore match={m} />
              <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                <Btn kind="primary" big onClick={() => L.done()}>
                  返回
                </Btn>
              </div>
            </div>
          ) : (
            <div class="panel">
              <div class="cmdbar">
                <Btn kind="primary" class="hide-sm" disabled={busy} title="快捷键：Enter" onClick={() => void act('pitch')}>
                  ▶ 下一球
                </Btn>
                <Btn kind="primary" class="hide-sm" disabled={busy} title="快捷键：空格" onClick={() => void act('pa')}>
                  ▶▶ 下一打席
                </Btn>
                <Btn disabled={busy} onClick={() => void act('half')}>
                  本半局结束
                </Btn>
                <Btn kind={autoRun === 'key' ? 'blue' : ''} class="hide-sm" on={autoRun === 'key'} disabled={busy && autoRun !== 'key'} onClick={() => setAutoRun(autoRun === 'key' ? null : 'key')}>
                  {autoRun === 'key' ? '⏸ 暂停' : '⏩ 自动(关键时刻停)'}
                </Btn>
                <Btn disabled={busy} onClick={() => void act('end')}>
                  ⏭ 直接到比赛结束
                </Btn>
                <span class="grow" />
                <Btn
                  on={me.auto}
                  onClick={() => {
                    me.auto = !me.auto;
                    force();
                  }}
                  title="委托 AI 指挥我方"
                >
                  {me.auto ? '🤖 AI指挥中' : '🤖 委托AI'}
                </Btn>
              </div>
              <div class="tabs mt8">
                <div class={`tab ${panel === 'cmd' ? 'on' : ''}`} onClick={() => setPanel('cmd')}>
                  {myBat ? '进攻指令' : '守备指令'}
                </div>
                <div class={`tab ${panel === 'sub' ? 'on' : ''}`} onClick={() => setPanel('sub')}>
                  换人
                </div>
                <div class={`tab ${panel === 'lineup' ? 'on' : ''}`} onClick={() => setPanel('lineup')}>
                  双方阵容
                </div>
              </div>
              {panel === 'cmd' && (myBat ? <OffensePanel m={m} t={me} setOff={setOff} force={force} /> : <DefensePanel m={m} t={me} setDef={setDef} uiCmd={uiCmd} />)}
              {panel === 'sub' && <SubPanel m={m} t={me} myBat={myBat} uiCmd={uiCmd} />}
              {panel === 'lineup' && <LineupsPanel m={m} />}
            </div>
          )}
        </div>
        <div class="col">
          <BatterCard m={m} b={b} />
          <div class="row top">
            <Zone events={paEvents} />
            <div class="grow small">
              <div class="muted">下一棒</div>
              <div>{m.onDeck(1).fam}</div>
              <div class="muted mt8">跑者</div>
              {(disp?.snap.bases ?? m.snap().bases).map((pid, i) =>
                pid !== null ? (
                  <div key={i}>
                    {['一', '二', '三'][i]}垒：{m.off.get(pid)?.fam ?? '?'}
                  </div>
                ) : null,
              )}
            </div>
          </div>
          <PitcherCard m={m} pt={pit} t={dT} />
          <div class="hint-box small">
            {myBat ? `进攻中 · AI 建议：${suggest(m, me)}` : '守备中'} · 传令剩余 {me.visits} 次
          </div>
        </div>
      </div>
      {/* 手机：固定在底部的推进按钮 */}
      <div class="mobile-bar mobile-only">
        {finished ? (
          <Btn kind="primary" onClick={() => L.done()}>
            返回
          </Btn>
        ) : (
          <>
            <Btn kind="primary" disabled={busy} onClick={() => void act('pitch')}>
              ▶ 下一球
            </Btn>
            <Btn kind="primary" disabled={busy} onClick={() => void act('pa')}>
              ▶▶ 下一打席
            </Btn>
            <Btn kind={autoRun === 'key' ? 'blue' : ''} on={autoRun === 'key'} disabled={busy && autoRun !== 'key'} onClick={() => setAutoRun(autoRun === 'key' ? null : 'key')}>
              {autoRun === 'key' ? '⏸ 暂停' : '⏩ 自动'}
            </Btn>
          </>
        )}
      </div>
    </div>
  );
}

function OffensePanel(p: { m: Match; t: TeamState; setOff: (t: OffTactic) => void; force: () => void }) {
  const { m, t } = p;
  const [r1, r2, r3] = m.bases.map(Boolean);
  const avail = (id: OffTactic): boolean => {
    switch (id) {
      case 'squeeze':
        return r3 && m.outs < 2;
      case 'hitRun':
        return r1 && !r2;
      case 'steal':
        return (r1 && !r2) || (r2 && !r3);
      case 'doubleSteal':
        return (r1 && r2 && !r3) || (r1 && !r2);
      case 'bunt':
        return true;
      default:
        return true;
    }
  };
  return (
    <div class="col gap4">
      <div class="row wrap gap4">
        {OFF_LIST.map((o) => (
          <Tip key={o.id} tip={o.tip}>
            <Btn small on={t.tactic === o.id} disabled={!avail(o.id)} onClick={() => p.setOff(o.id)}>
              {o.label}
            </Btn>
          </Tip>
        ))}
      </div>
      <div class="row wrap gap4">
        <span class="muted" style={{ width: '56px' }}>狙球</span>
        {(
          [
            [null, '不猜', '自然应对各种球'],
            ['FB', '狙直球', '猜中时击球与力量大幅上升，猜错（变化球）则容易被骗'],
            ['BR', '狙变化球', '等变化球打，来直球就会慢半拍'],
          ] as const
        ).map(([g, label, tip]) => (
          <Tip key={label} tip={tip}>
            <Btn
              small
              on={t.guess === g}
              onClick={() => {
                t.guess = g;
                p.force();
              }}
            >
              {label}
            </Btn>
          </Tip>
        ))}
      </div>
      <div class="small muted">当前指令：{OFF_LIST.find((o) => o.id === t.tactic)?.label ?? '自由打击'}（盗垒/打带跑/抢分只对下一球有效；狙球在本打席内有效）</div>
    </div>
  );
}

function PitchCallRow(p: { m: Match; t: TeamState; uiCmd: (fn: () => unknown) => void }) {
  const { m, t } = p;
  const pt = m.pitcher();
  const call = t.call;
  const setCall = (patch: Partial<NonNullable<TeamState['call']>>) =>
    p.uiCmd(() => {
      const next = { type: call?.type ?? null, intent: call?.intent ?? null, ...patch };
      t.call = next.type === null && next.intent === null ? null : next;
    });
  return (
    <>
      <div class="row wrap gap4">
        <Tip tip="指定下一球的球种（只对一球有效，不指定则由捕手配球）">
          <span class="muted" style={{ width: '56px' }}>配球</span>
        </Tip>
        <Btn small on={!call?.type} onClick={() => setCall({ type: null })}>
          捕手判断
        </Btn>
        <Btn small on={call?.type === 'FB'} onClick={() => setCall({ type: 'FB' })}>
          直球
        </Btn>
        {pt.pitches.map((x) => (
          <Btn key={x.type} small on={call?.type === x.type} onClick={() => setCall({ type: x.type })}>
            {PITCH_DEFS[x.type].name}
          </Btn>
        ))}
      </div>
      <div class="row wrap gap4">
        <span class="muted" style={{ width: '56px' }}>位置</span>
        {(
          [
            [null, '捕手判断'],
            ['zone', '好球带'],
            ['edge', '边角'],
            ['chase', '诱打坏球'],
          ] as const
        ).map(([v, label]) => (
          <Btn key={label} small on={(call?.intent ?? null) === v} onClick={() => setCall({ intent: v })}>
            {label}
          </Btn>
        ))}
      </div>
    </>
  );
}

function DefensePanel(p: { m: Match; t: TeamState; setDef: (k: 'approach' | 'align', v: string) => void; uiCmd: (fn: () => unknown) => void }) {
  const { m, t } = p;
  const anyOn = m.bases.some(Boolean);
  return (
    <div class="col gap4">
      <div class="row wrap gap4">
        <Tip tip="开启后，每个打席由 AI 选择投球方针与守备阵型；手动点选任一选项即切换为手动">
          <Btn small on={t.defAI} onClick={() => p.uiCmd(() => (t.defAI = !t.defAI))}>
            {t.defAI ? '方针/阵型：AI判断中' : '方针/阵型：手动'}
          </Btn>
        </Tip>
      </div>
      <div class="row wrap gap4">
        <span class="muted" style={{ width: '56px' }}>投球方针</span>
        {APPROACH.map((o) => (
          <Tip key={o.id} tip={o.tip}>
            <Btn small on={t.def.approach === o.id} onClick={() => p.setDef('approach', o.id)}>
              {o.label}
            </Btn>
          </Tip>
        ))}
      </div>
      <PitchCallRow m={m} t={t} uiCmd={p.uiCmd} />
      <div class="row wrap gap4">
        <span class="muted" style={{ width: '56px' }}>守备阵型</span>
        {ALIGN.map((o) => (
          <Tip key={o.id} tip={o.tip}>
            <Btn small on={t.def.align === o.id} onClick={() => p.setDef('align', o.id)}>
              {o.label}
            </Btn>
          </Tip>
        ))}
      </div>
      <div class="row wrap gap4">
        <span class="muted" style={{ width: '56px' }}>特殊</span>
        <Tip tip="申告敬远：直接保送打者上一垒">
          <Btn small kind="red" onClick={() => p.uiCmd(() => (t.def.ibb = true))} on={t.def.ibb}>
            申告敬远
          </Btn>
        </Tip>
        <Tip tip="下一球投外角吊球，识破盗垒或抢分（计为坏球）">
          <Btn small on={t.def.pitchout} disabled={!anyOn} onClick={() => p.uiCmd(() => (t.def.pitchout = !t.def.pitchout))}>
            外角吊球
          </Btn>
        </Tip>
        <Tip tip="向垒上跑者投牵制球">
          <Btn small disabled={!anyOn} onClick={() => p.uiCmd(() => m.pickoff())}>
            牵制
          </Btn>
        </Tip>
        <Tip tip={`暂停并派出传令，平复投手的动摇（剩余 ${t.visits} 次）`}>
          <Btn small kind="blue" disabled={t.visits <= 0} onClick={() => p.uiCmd(() => m.moundVisit(t))}>
            传令（{t.visits}）
          </Btn>
        </Tip>
      </div>
    </div>
  );
}

function SubPanel(p: { m: Match; t: TeamState; myBat: boolean; uiCmd: (fn: () => unknown) => void }) {
  const { m, t, myBat } = p;
  const [sel, setSel] = useState<number | null>(null);
  const bench = t.bench();
  const pitchers = bench.filter((x) => isPitcher(x) || (x.apt.P ?? 0) >= 50);
  return (
    <div class="col gap4">
      {myBat ? (
        <>
          <div class="muted small">选择替补球员后，点击「代打」或某个垒上跑者的「代跑」。</div>
          <div class="row wrap gap4">
            {bench.map((x) => (
              <Btn key={x.id} small on={sel === x.id} onClick={() => setSel(x.id)} title={`击${Math.round(x.a.contact)} 力${Math.round(x.a.power)} 速${Math.round(x.a.speed)}`}>
                {x.fam}（{POS_ABBR[x.pos]}·打{Math.round(batterOffense(x))}·速{Math.round(x.a.speed)}）
              </Btn>
            ))}
            {!bench.length && <span class="dim">没有可用的替补</span>}
          </div>
          <div class="row wrap gap4">
            <Btn small kind="primary" disabled={sel === null} onClick={() => sel !== null && p.uiCmd(() => m.pinchHit(t, t.batIdx, sel))}>
              代打（替换 {m.batter().fam}）
            </Btn>
            {m.bases.map((rs, i) =>
              rs ? (
                <Btn key={i} small disabled={sel === null} onClick={() => sel !== null && p.uiCmd(() => m.pinchRun(t, i, sel))}>
                  代跑{['一', '二', '三'][i]}垒（{t.get(rs.pid)?.fam}）
                </Btn>
              ) : null,
            )}
          </div>
        </>
      ) : (
        <>
          <div class="muted small">更换投手（显示本周已投球数与疲劳）：</div>
          <div class="row wrap gap4">
            {pitchers.map((x) => (
              <Btn
                key={x.id}
                small
                kind="blue"
                disabled={m.weeklyPitches(t, x.id) >= m.rules.pitchLimit - 10}
                onClick={() => p.uiCmd(() => m.changePitcher(t, x.id))}
                title={`${Math.round(x.a.velocity)}km/h 控${Math.round(x.a.control)} 耐${Math.round(x.a.stamina)}`}
              >
                {x.fam}（{x.throws === 'L' ? '左' : '右'}·{Math.round(pitcherOverall(x))}·疲劳{Math.round(x.fatigue)}·周{m.weeklyPitches(t, x.id)}球）
              </Btn>
            ))}
            {!pitchers.length && <span class="dim">没有可用的投手</span>}
          </div>
          <div class="muted small mt8">守备替换：选择替补，再点击要替换的位置。</div>
          <div class="row wrap gap4">
            {bench.filter((x) => !isPitcher(x)).map((x) => (
              <Btn key={x.id} small on={sel === x.id} onClick={() => setSel(x.id)}>
                {x.fam}（{POS_ABBR[x.pos]}）
              </Btn>
            ))}
          </div>
          <div class="row wrap gap4">
            {(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'] as Pos[]).map((pos) => (
              <Btn key={pos} small disabled={sel === null} onClick={() => sel !== null && p.uiCmd(() => m.defensiveSub(t, pos, sel))}>
                {POS_ABBR[pos]}:{t.fielder(pos).fam}
              </Btn>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function LineupsPanel(p: { m: Match }) {
  const { m } = p;
  return (
    <div class="grid2">
      {[0, 1].map((s) => {
        const t = m.T[s as 0 | 1];
        return (
          <div key={s}>
            <div class="accent">{t.s.short}</div>
            {t.order.map((id, i) => {
              const pl = t.get(id);
              const box = t.bat.get(id);
              return (
                <div key={id} class={`small ${s === m.half && i === t.batIdx ? 'accent' : ''}`}>
                  {i + 1}. {t.slotPos[i] === 'DH' ? 'DH' : POS_ABBR[t.slotPos[i] as Pos]} {pl?.fam} <span class="muted">{box ? `${box.h}/${box.ab}` : ''}</span>
                </div>
              );
            })}
            <div class="small muted">
              投手：{t.get(t.pitcher)?.fam}（{t.pit.get(t.pitcher)?.np ?? 0}球）
            </div>
          </div>
        );
      })}
    </div>
  );
}

