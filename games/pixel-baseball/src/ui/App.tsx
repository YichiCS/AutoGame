import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { G, myPlayers, mySchool } from '../core/state';
import { dateStr, daysText, domOf, monthOf, seasonOf, mdStr } from '../core/calendar';
import { strengthOf, strengthLetter } from '../core/team';
import { repTier } from '../core/career';
import { nextOfficial } from '../core/season';
import { moneyStr } from '../core/economy';
import { SPEEDS, loop, setSpeed, togglePause } from './loop';
import { settings, saveSettings } from './settings';
import { refresh, ui, useStore, type Tab } from './store';
import { useIsPhone } from './layout';
import { SceneView } from './Scene';
import { EventModal, UIModal } from './Modals';
import { StartScreen } from './StartScreen';
import { Overview } from './tabs/Overview';
import { Players } from './tabs/Players';
import { Games } from './tabs/Games';
import { Facilities } from './tabs/Facilities';
import { Policies } from './tabs/Policies';
import { Records } from './tabs/Records';
import { Lineup } from './tabs/Lineup';
import { MatchScreen } from './match/MatchScreen';
import { Emblem } from './components/common';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'overview', label: '概览', icon: '◆' },
  { id: 'players', label: '球员', icon: '●' },
  { id: 'lineup', label: '阵容', icon: '▦' },
  { id: 'games', label: '比赛', icon: '★' },
  { id: 'facilities', label: '设施', icon: '■' },
  { id: 'policies', label: '方针', icon: '▲' },
  { id: 'records', label: '档案', icon: '♛' },
];

function goTab(id: Tab): void {
  if (ui.tab === id && id === 'players') ui.playerId = null;
  ui.tab = id;
  refresh();
}

const openHelp = () => {
  ui.modal = { kind: 'help' };
  refresh();
};
const openSettings = () => {
  ui.modal = { kind: 'settings' };
  refresh();
};

/** 现在的状态：等你决定 / 已暂停 / 比赛中 */
function statusText(): { text: string; cls: string } | null {
  if (ui.match) return { text: '比赛中', cls: 'live' };
  if (G.queue.length > 0) return { text: '等你决定', cls: '' };
  if (loop.paused) return { text: '已暂停', cls: '' };
  return null;
}

function Topbar() {
  const s = mySchool();
  const st = strengthOf(myPlayers(), G.dh);
  const nx = nextOfficial();
  const status = statusText();
  return (
    <header class="topbar">
      <span class="tb-school">
        <Emblem school={s} />
        <b>{s.short || s.name}</b>
      </span>
      <span class="tb-date">
        {dateStr(G.day, G.startYear)} <span class="dim">{seasonOf(G.day)}</span>
      </span>
      <span class="tb-speed">
        <button type="button" class={`sp ${loop.paused ? 'on' : ''}`} title="暂停 / 继续（空格）" onClick={togglePause}>
          {loop.paused ? '▶' : '❚❚'}
        </button>
        {SPEEDS.map((v, i) => (
          <button type="button" key={v} class={`sp ${!loop.paused && settings.speedIdx === i ? 'on' : ''}`} title={`${v} 倍速（数字键 ${i + 1}）`} onClick={() => setSpeed(i)}>
            {v}x
          </button>
        ))}
        {status && <span class={`tb-wait ${status.cls}`}>{status.text}</span>}
      </span>
      <span class="tb-stats">
        <span title="部费">¥ {moneyStr(G.funds)}</span>
        <span title="监督名声">★ {repTier(G.mgr.rep)}</span>
        <span title="综合战力">战力 <b>{strengthLetter(st.total)}</b></span>
        {nx && (
          <span class="tb-next" title={nx.label}>
            下一战 {mdStr(nx.day)}（{daysText(nx.day - G.day)}）
          </span>
        )}
      </span>
      <span class="tb-sys">
        <button type="button" class="sp" title="怎么玩" onClick={openHelp}>
          ?
        </button>
        <button type="button" class="sp" title="设置 / 存档" onClick={openSettings}>
          ⚙
        </button>
      </span>
    </header>
  );
}

/** 手机的顶栏：学校和日期、暂停 / 继续、速度（点一下换一档）、帮助、设置 */
function PhoneTopbar() {
  const s = mySchool();
  const status = statusText();
  const speedIdx = settings.speedIdx;
  return (
    <header class="topbar ptop">
      <span class="pt-id">
        <Emblem school={s} />
        <span class="pt-txt">
          <b class="pt-name">{s.short || s.name}</b>
          <span class="pt-date">
            {monthOf(G.day)}月{domOf(G.day)}日 <span class="dim">{seasonOf(G.day)}</span>
            {status && <span class={`tb-wait ${status.cls}`}>{status.text}</span>}
          </span>
        </span>
      </span>
      <button type="button" class={`pt-btn ${loop.paused ? 'on' : ''}`} aria-label={loop.paused ? '继续' : '暂停'} onClick={togglePause}>
        {loop.paused ? '▶' : '❚❚'}
      </button>
      <button type="button" class="pt-btn speed" aria-label="切换速度" title="点一下换一档速度" onClick={() => setSpeed((speedIdx + 1) % SPEEDS.length)}>
        {SPEEDS[speedIdx] ?? 1}x
      </button>
      <button type="button" class="pt-btn sys" aria-label="怎么玩" onClick={openHelp}>
        ?
      </button>
      <button type="button" class="pt-btn sys" aria-label="设置 / 存档" onClick={openSettings}>
        ⚙
      </button>
    </header>
  );
}

function LogPanel() {
  return (
    <section class={`logpanel ${settings.logOpen ? 'open' : ''}`}>
      <div class="ptitle">
        <span>球队动态</span>
        <span class="grow" />
        <button
          type="button"
          class="chip logtog"
          onClick={() => {
            settings.logOpen = !settings.logOpen;
            saveSettings();
            refresh();
          }}
        >
          {settings.logOpen ? '收起 ▴' : '展开 ▾'}
        </button>
      </div>
      <div class="log">
        {G.logs.slice(0, 120).map((l, i) => (
          <div key={i} class={`lg ${l.k}`}>
            <span class="d">{mdStr(l.d)}</span>
            <span>{l.t}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Toasts() {
  return (
    <div class="toasts" role="status" aria-live="polite">
      {ui.toasts.map((t) => (
        <div key={t.id} class={`toast ${t.kind}`}>
          {t.text}
        </div>
      ))}
    </div>
  );
}

function TabBody() {
  switch (ui.tab) {
    case 'players':
      return <Players />;
    case 'games':
      return <Games />;
    case 'facilities':
      return <Facilities />;
    case 'policies':
      return <Policies />;
    case 'records':
      return <Records />;
    case 'lineup':
      return <Lineup />;
    default:
      return <Overview />;
  }
}

/** 内容区的滚动位置：换页回到顶部；从名单点进球员详情再返回时，回到原来看到的地方 */
function useScrollMemory() {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef({ tab: ui.tab, pid: ui.playerId });
  const listTop = useRef(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const p = prev.current;
    if (!el || (p.tab === ui.tab && p.pid === ui.playerId)) return;
    if (p.tab === ui.tab && p.pid === null && ui.playerId !== null) listTop.current = el.scrollTop;
    el.scrollTop = p.tab === ui.tab && p.pid !== null && ui.playerId === null ? listTop.current : 0;
    prev.current = { tab: ui.tab, pid: ui.playerId };
  });
  return ref;
}

function Game() {
  const phone = useIsPhone();
  const bodyRef = useScrollMemory();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || ui.modal || ui.match) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePause();
      } else if (/^Digit[1-4]$/.test(e.code)) setSpeed(Number(e.code.slice(5)) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const overlays = (
    <>
      {ui.match && <MatchScreen />}
      <EventModal />
      <UIModal />
      <Toasts />
    </>
  );
  if (phone) {
    // 手机：顶栏和底部导航固定，中间的内容区自己滚动；练习场和球队动态放在「概览」的最上面
    return (
      <div class="game phone">
        <PhoneTopbar />
        <main class="tabbody" ref={bodyRef}>
          {ui.tab === 'overview' && (
            <div class="ov-scene">
              <SceneView />
              <LogPanel />
            </div>
          )}
          <div class="tabinner">
            <TabBody />
          </div>
        </main>
        <nav class="bnav" aria-label="页面">
          {TABS.map((t) => (
            <button type="button" key={t.id} class={`bn ${ui.tab === t.id ? 'on' : ''}`} aria-current={ui.tab === t.id ? 'page' : undefined} onClick={() => goTab(t.id)}>
              <span class="bn-i">{t.icon}</span>
              <span class="bn-l">{t.label}</span>
            </button>
          ))}
        </nav>
        {overlays}
      </div>
    );
  }
  return (
    <div class="game">
      <Topbar />
      <div class="main">
        <div class="left">
          <SceneView />
          <LogPanel />
        </div>
        <aside class="side">
          <nav class="tabs">
            {TABS.map((t) => (
              <button type="button" key={t.id} class={`tab ${ui.tab === t.id ? 'on' : ''}`} onClick={() => goTab(t.id)}>
                <span class="ti">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div class="tabbody" ref={bodyRef}>
            <TabBody />
          </div>
        </aside>
      </div>
      {overlays}
    </div>
  );
}

export function App() {
  useStore();
  if (ui.screen === 'start')
    return (
      <>
        <StartScreen />
        <UIModal />
        <Toasts />
      </>
    );
  return <Game />;
}
