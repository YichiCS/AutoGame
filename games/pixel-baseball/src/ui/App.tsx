import { useEffect } from 'preact/hooks';
import { G, myPlayers, mySchool } from '../core/state';
import { dateStr, daysText, seasonOf, mdStr } from '../core/calendar';
import { strengthOf, strengthLetter } from '../core/team';
import { repTier } from '../core/career';
import { nextOfficial } from '../core/season';
import { moneyStr } from '../core/economy';
import { SPEEDS, loop, setSpeed, togglePause } from './loop';
import { settings, saveSettings } from './settings';
import { refresh, ui, useStore, type Tab } from './store';
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

function Topbar() {
  const s = mySchool();
  const st = strengthOf(myPlayers(), G.dh);
  const nx = nextOfficial();
  const waiting = G.queue.length > 0;
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
        {(waiting || loop.paused) && <span class="tb-wait">{waiting ? '等你决定' : '已暂停'}</span>}
        {ui.match && <span class="tb-wait live">比赛中</span>}
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
        <button type="button" class="sp" title="怎么玩" onClick={() => { ui.modal = { kind: 'help' }; refresh(); }}>
          ?
        </button>
        <button type="button" class="sp" title="设置 / 存档" onClick={() => { ui.modal = { kind: 'settings' }; refresh(); }}>
          ⚙
        </button>
      </span>
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
          class="chip"
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

function Game() {
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
              <button
                type="button"
                key={t.id}
                class={`tab ${ui.tab === t.id ? 'on' : ''}`}
                onClick={() => {
                  if (ui.tab === t.id && t.id === 'players') ui.playerId = null;
                  ui.tab = t.id;
                  refresh();
                }}
              >
                <span class="ti">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
          <div class="tabbody">
            <TabBody />
          </div>
        </aside>
      </div>
      {ui.match && <MatchScreen />}
      <EventModal />
      <UIModal />
      <Toasts />
    </div>
  );
}

export function App() {
  useStore();
  if (ui.screen === 'start') return (
    <>
      <StartScreen />
      <UIModal />
      <Toasts />
    </>
  );
  return <Game />;
}
