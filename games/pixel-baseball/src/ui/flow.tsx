// 推进一周的界面流程
import { useState } from 'preact/hooks';
import type { Notice, PendingChoice, PendingMatch, WeekReport } from '../core/types';
import { G, mySchool } from '../core/state';
import { advance, dismissNotice, resolveChoice, buildPlayerMatch, finishPlayerMatch } from '../core/game';
import { resolveEvent } from '../core/events';
import { ui, refresh, openModal, setBusy, toast } from './store';
import { Btn, Emblem, Portrait, Money, Grade } from './components/common';
import type { Match } from '../sim/match';
import { saveGame } from '../core/save';
import { schoolStrength, rosterPlayers } from '../core/world';
import { strengthLetter } from '../core/team';
import { PREFS } from '../data/prefectures';
import { fullName, isPitcher, pitcherOverall, batterOffense, PERS_NAME } from '../core/attrs';
import { POS_ABBR } from '../core/types';
import { PITCH_DEFS } from '../data/traits';
import { roleSkill } from '../core/staff';
import { fac } from '../core/training';
import { BoxScore, LineScore } from './screens/MatchScreen';
import { sfx } from './sound';
import { openSchool } from './components/SchoolModal';
import { liveState } from './live';
import { myLineup, rulesFor } from '../core/matchday';
import { LineupScreen } from './screens/Lineup';

export async function runWeek(): Promise<void> {
  if (ui.busy) return;
  setBusy(true);
  try {
    for (let guard = 0; guard < 300; guard++) {
      const h = advance();
      refresh();
      if (h.t === 'idle') break;
      if (h.t === 'event') {
        await showEvent();
        continue;
      }
      if (h.t === 'notice') {
        await showNotice(h.notice);
        dismissNotice();
        continue;
      }
      if (h.t === 'choice') {
        const v = await showChoice(h.choice);
        const lines = resolveChoice(v);
        if (lines.length) toast(lines[0], 'good');
        continue;
      }
      if (h.t === 'match') {
        await runMatchFlow(h.pm);
        continue;
      }
      if (h.t === 'report') {
        await showReport(h.report);
        continue;
      }
    }
    try {
      await saveGame('auto');
    } catch {
      toast('自动存档失败', 'bad');
    }
  } catch (e) {
    console.error(e);
    toast(`发生错误：${(e as Error).message}`, 'bad');
  } finally {
    setBusy(false);
    refresh();
  }
}

/** 进入游戏画面时，显示尚未阅读的通知（例如就任时的欢迎信息） */
export async function showPendingNotices(): Promise<void> {
  if (ui.busy) return;
  while (G.notices.length && !G.flow) {
    await showNotice(G.notices[0]);
    dismissNotice();
  }
  refresh();
}

// ---------------- 事件 ----------------
function EventView(p: { close: (v?: unknown) => void }) {
  // 打开时锁定当前事件：选择后队列会前移，不能再读取 eventQueue[0]
  const [ev] = useState(() => G.eventQueue[0]);
  const [result, setResult] = useState<string | null>(null);
  if (!ev) return null;
  const pl = ev.pid !== undefined ? G.players[ev.pid] : undefined;
  return (
    <div class="panel modal">
      <div class="mtitle">{ev.title}</div>
      <div class="row top">
        {pl && <Portrait player={pl} size="big" />}
        <div class="grow" style={{ whiteSpace: 'pre-line' }}>{result === null ? ev.text : result || '……'}</div>
      </div>
      {result === null ? (
        <div class="choices">
          {ev.choices.map((c, i) => (
            <Btn
              key={i}
              disabled={c.disabled}
              onClick={() => {
                sfx('click');
                const r = resolveEvent(i);
                setResult(r);
              }}
            >
              <div>
                <div>▶ {c.label}</div>
                {c.hint && <div class="small muted">{c.hint}</div>}
              </div>
            </Btn>
          ))}
        </div>
      ) : (
        <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
          <Btn kind="primary" onClick={() => p.close()}>
            确定
          </Btn>
        </div>
      )}
    </div>
  );
}

export function showEvent(): Promise<unknown> {
  sfx('event');
  return openModal((close) => <EventView close={close} />);
}

// ---------------- 通知 ----------------
export function showNotice(n: Notice): Promise<unknown> {
  if (n.kind === 'celebrate') sfx('fanfare');
  return openModal((close) => (
    <div class={`panel modal ${n.kind === 'celebrate' ? 'celebrate' : ''}`}>
      <div class="mtitle">{n.kind === 'celebrate' ? '★ ' : ''}{n.title}</div>
      {n.lines.map((l, i) => (
        <div key={i} style={{ padding: '2px 0' }}>{l}</div>
      ))}
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn kind="primary" onClick={() => close()}>
          确定
        </Btn>
      </div>
    </div>
  ));
}

// ---------------- 选择 ----------------
export function showChoice(c: PendingChoice): Promise<number> {
  return openModal<number>((close) => (
    <div class="panel modal">
      <div class="mtitle">{c.title}</div>
      <div style={{ whiteSpace: 'pre-line' }}>{c.text}</div>
      <div class="choices">
        {c.options.map((o) => (
          <Btn key={o.value} onClick={() => close(o.value)}>
            <div>
              <div>▶ {o.label}</div>
              {o.hint && <div class="small muted">{o.hint}</div>}
            </div>
          </Btn>
        ))}
      </div>
    </div>
  )).then((v) => v ?? c.options[0].value);
}

// ---------------- 周报 ----------------
export function showReport(r: WeekReport): Promise<unknown> {
  if (!r.lines.length && !r.growth.length) return Promise.resolve();
  return openModal((close) => (
    <div class="panel modal wide">
      <div class="mtitle">周报 · {r.title}</div>
      <div class="grid2">
        <div>
          <div class="accent mb8">本周动态</div>
          {r.lines.length ? (
            r.lines.map((l, i) => (
              <div key={i} class={l.tone === 'good' ? 'good' : l.tone === 'bad' ? 'bad' : ''} style={{ padding: '1px 0' }}>
                · {l.text}
              </div>
            ))
          ) : (
            <div class="dim">平静的一周。</div>
          )}
          <div class="mt8">
            资金变动：<Money v={r.money} signed />
          </div>
        </div>
        <div>
          <div class="accent mb8">训练成长</div>
          {r.growth.length ? (
            r.growth.map((g) => (
              <div key={g.pid} class="listitem">
                <span class="accent">{g.name}</span> <span class="good">{g.gains}</span>
              </div>
            ))
          ) : (
            <div class="dim">没有能力变化。</div>
          )}
        </div>
      </div>
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn kind="primary" onClick={() => close()}>
          继续
        </Btn>
      </div>
    </div>
  ));
}

// ---------------- 比赛 ----------------
async function runMatchFlow(pm: PendingMatch): Promise<void> {
  const mode = await openModal<'play' | 'watch' | 'auto'>((close) => <PreMatch pm={pm} close={close} />);
  const { match, mySide } = buildPlayerMatch(pm);
  if (mode === 'auto' || !mode) {
    match.T[mySide].auto = true;
    match.toEnd();
  } else {
    if (mode === 'watch') match.T[mySide].auto = true;
    await new Promise<void>((resolve) => {
      liveState.cur = { match, mySide, pm, watch: mode === 'watch', done: resolve };
      ui.screen = 'match';
      refresh();
    });
    liveState.cur = null;
    ui.screen = 'game';
    refresh();
  }
  const sum = match.summary();
  const lines = finishPlayerMatch(match);
  sfx(sum.winner === mySide ? 'win' : 'lose');
  await openModal((close) => <ResultView match={match} mySide={mySide} lines={lines} pm={pm} close={close} />);
}

function OppReport(p: { oppId: number }) {
  const s = G.schools[p.oppId];
  const st = schoolStrength(s);
  const intel = roleSkill('analyst') + fac('analysis') * 15 + G.manager.skills.insight / 3;
  const ps = rosterPlayers(s).filter((x) => !x.retired && !x.injury);
  const ace = ps.filter(isPitcher).sort((a, b) => pitcherOverall(b) - pitcherOverall(a))[0];
  const bats = ps.filter((x) => !isPitcher(x)).sort((a, b) => batterOffense(b) - batterOffense(a)).slice(0, 3);
  const showDetail = intel >= 25;
  return (
    <div>
      <div class="row">
        <Emblem school={s} lg />
        <div>
          <div class="big-text">{s.name}</div>
          <div class="muted">
            {PREFS[s.prefId].name} · {s.type === 'public' ? '公立' : '私立'} · 名门度 {s.prestige.toFixed(0)} · 甲子园 {s.koshienApps} 次
          </div>
        </div>
      </div>
      <div class="row mt8 wrap">
        <span>综合战力 <b class="accent">{strengthLetter(st.total)}</b></span>
        <span>打击 <Grade v={st.off} /></span>
        <span>投手 <Grade v={st.pit} /></span>
        <span>守备 <Grade v={st.def} /></span>
      </div>
      {showDetail ? (
        <div class="mt8">
          {ace && (
            <div>
              王牌：<span class="accent">{fullName(ace)}</span>（{ace.throws === 'L' ? '左投' : '右投'}）{Math.round(ace.a.velocity)}km/h，
              {ace.pitches.map((x) => PITCH_DEFS[x.type].name).join('、') || '只有直球'}，疲劳 {Math.round(ace.fatigue)}
            </div>
          )}
          {bats.map((b) => (
            <div key={b.id} class="muted">
              要注意的打者：{fullName(b)}（{POS_ABBR[b.pos]}·{PERS_NAME[b.pers]}）击球 {Math.round(b.a.contact)} 力量 {Math.round(b.a.power)}
            </div>
          ))}
        </div>
      ) : (
        <div class="hint-box mt8">情报不足。聘请数据分析员或建设影像分析室可以获得对手的详细情报。</div>
      )}
    </div>
  );
}

/** 赛前确认我方的打线与先发投手 */
function MyLineupBrief(p: { pm: PendingMatch }) {
  const t = p.pm.tid ? G.tournaments[p.pm.tid] : null;
  const lu = myLineup(rulesFor(t, p.pm.round));
  const sp = lu.defense.P !== undefined ? G.players[lu.defense.P] : null;
  const posOf = (id: number): string => {
    for (const [k, v] of Object.entries(lu.defense)) if (v === id && k !== 'P') return POS_ABBR[k as keyof typeof POS_ABBR];
    return id === lu.defense.P ? '投手' : 'DH';
  };
  return (
    <div class="panel flat mt8">
      <div class="accent small mb8">我方预定阵容{G.club.lineup.auto ? '（自动编排）' : ''}</div>
      <div class="row wrap small gap4">
        {lu.order.map((id, i) => (
          <span key={id} class="tag fill">
            {i + 1}.{posOf(id)} {G.players[id]?.fam}
          </span>
        ))}
      </div>
      {sp && (
        <div class="small mt8">
          先发投手：<span class="accent">{fullName(sp)}</span>（{Math.round(sp.a.velocity)}km/h · 疲劳 {Math.round(sp.fatigue)} · 本周已投 {sp.pitchesWeek} 球）
          {sp.fatigue >= 55 && <span class="bad"> ⚠ 疲劳较大</span>}
        </div>
      )}
    </div>
  );
}

function PreMatch(p: { pm: PendingMatch; close: (v?: 'play' | 'watch' | 'auto') => void }) {
  const me = mySchool();
  const meStr = schoolStrength(me);
  const t = p.pm.tid ? G.tournaments[p.pm.tid] : null;
  return (
    <div class="panel modal wide">
      <div class="mtitle">{p.pm.label}</div>
      <div class="muted mb8">
        {t?.koshien ? '阪神甲子园球场' : t ? '县营球场' : '练习赛'} · 我方{p.pm.home ? '后攻' : '先攻'} · 我方战力 {strengthLetter(meStr.total)}（{meStr.total.toFixed(0)}）
      </div>
      <OppReport oppId={p.pm.oppId} />
      <MyLineupBrief pm={p.pm} />
      <div class="hint-box mt12">
        亲自指挥：逐球/逐打席下达战术，体验比赛的紧张感。观战：由 AI 代为指挥，可随时接管。快速结束：立即得到比赛结果。
      </div>
      <div class="row mt12 wrap" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => openSchool(p.pm.oppId)}>对手名单</Btn>
        <Btn
          onClick={() =>
            void openModal((close) => (
              <div class="panel modal xwide">
                <LineupScreen />
                <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                  <Btn kind="primary" onClick={() => close()}>
                    完成
                  </Btn>
                </div>
              </div>
            ))
          }
        >
          调整阵容
        </Btn>
        <span class="grow" />
        <Btn onClick={() => p.close('auto')}>⏩ 快速结束</Btn>
        <Btn kind="blue" onClick={() => p.close('watch')}>
          👀 观战
        </Btn>
        <Btn kind="primary" onClick={() => p.close('play')}>
          ⚾ 亲自指挥
        </Btn>
      </div>
    </div>
  );
}

function ResultView(p: { match: Match; mySide: 0 | 1; lines: string[]; pm: PendingMatch; close: () => void }) {
  const [box, setBox] = useState(false);
  const sum = p.match.summary();
  const won = sum.winner === p.mySide;
  const mvp = sum.mvp !== null ? G.players[sum.mvp] : null;
  return (
    <div class={`panel modal ${box ? 'xwide' : 'wide'} ${won ? 'celebrate' : ''}`}>
      <div class="mtitle">{won ? '胜利！' : '败北……'}</div>
      <LineScore match={p.match} />
      {mvp && (
        <div class="row mt8">
          <Portrait player={mvp} />
          <div>
            <div class="accent">本场 MVP</div>
            <div>{fullName(mvp)}（{G.schools[mvp.schoolId]?.short ?? ''}）</div>
          </div>
        </div>
      )}
      {sum.highlights.length > 0 && (
        <div class="mt8">
          {sum.highlights.slice(0, 6).map((h, i) => (
            <div key={i} class="muted">★ {h}</div>
          ))}
        </div>
      )}
      <div class="mt8">
        {p.lines.slice(1).map((l, i) => (
          <div key={i} class="good">{l}</div>
        ))}
      </div>
      {box && <BoxScore match={p.match} />}
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => setBox(!box)}>{box ? '收起成绩表' : '查看成绩表'}</Btn>
        <Btn kind="primary" onClick={() => p.close()}>
          继续
        </Btn>
      </div>
    </div>
  );
}
