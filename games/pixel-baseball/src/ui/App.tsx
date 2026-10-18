import { useEffect, useRef, useState } from 'preact/hooks';
import { ui, useRefresh, refresh, closeModal, go, openModal, toast, type Tab } from './store';
import { G, hasG, mySchool } from '../core/state';
import { Btn, Emblem, Money, Bar } from './components/common';
import { dateLabel, seasonOf, SCHED } from '../core/calendar';
import { runWeek, showPendingNotices } from './flow';
import { MatchScreen } from './screens/MatchScreen';
import { Dashboard } from './screens/Dashboard';
import { Roster } from './screens/Roster';
import { PlayerDetail } from './screens/PlayerDetail';
import { Training } from './screens/Training';
import { LineupScreen } from './screens/Lineup';
import { Schedule } from './screens/Schedule';
import { Recruit } from './screens/Recruit';
import { StaffScreen } from './screens/Staff';
import { Finance } from './screens/Finance';
import { ManagerScreen } from './screens/Manager';
import { NewsScreen } from './screens/News';
import { Records } from './screens/Records';
import { SystemScreen } from './screens/System';
import { NewGame } from './screens/NewGame';
import { drawStadium } from '../render/field';
import { listSaves, loadGame, type SaveMeta } from '../core/save';
import { weekInProgress } from '../core/game';
import { sfx } from './sound';

export function App() {
  useRefresh();
  return (
    <>
      {ui.screen === 'title' && <Title />}
      {ui.screen === 'newgame' && <NewGame />}
      {ui.screen === 'game' && hasG() && <GameShell />}
      {ui.screen === 'match' && <MatchScreen />}
      {ui.modals.map((m) => (
        <div class="overlay" key={m.id}>
          {m.render((v) => closeModal(m.id, v))}
        </div>
      ))}
      <div class="toast-box">
        {ui.toasts.map((t) => (
          <div key={t.id} class={`toast ${t.tone}`}>
            {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

function TitleArt() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    c.width = 360;
    c.height = 240;
    const bg = drawStadium({
      koshien: true,
      fence: { line: 95, center: 118 },
      homeColors: { primary: '#b13e53', secondary: '#f4f4f4', cap: '#b13e53', letter: '' },
      awayColors: { primary: '#29366f', secondary: '#ffcd75', cap: '#29366f', letter: '' },
      seed: 1915,
    });
    let raf = 0;
    let t = 0;
    const loop = () => {
      t += 1;
      ctx.drawImage(bg, 0, 0);
      // 夕阳滤镜
      ctx.fillStyle = 'rgba(239,125,87,0.18)';
      ctx.fillRect(0, 0, 360, 240);
      ctx.fillStyle = 'rgba(18,19,31,0.35)';
      ctx.fillRect(0, 0, 360, 240);
      // 飞球
      const k = (t % 240) / 240;
      const x = 180 + (k * 140 - 70) * 0.9;
      const y = 200 - k * 150;
      const h = Math.sin(k * Math.PI) * 60;
      ctx.fillStyle = 'rgba(0,0,0,.4)';
      ctx.fillRect(Math.round(x), Math.round(y), 2, 1);
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.round(x), Math.round(y - h), 2, 2);
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} class="bgart" />;
}

function Title() {
  const [latest, setLatest] = useState<SaveMeta | null>(null);
  useEffect(() => {
    listSaves()
      .then((s) => setLatest(s.filter((x): x is SaveMeta => !!x).sort((a, b) => b.savedAt - a.savedAt)[0] ?? null))
      .catch(() => setLatest(null));
  }, []);
  const cont = async () => {
    if (!latest) return;
    if (await loadGame(latest.slot)) {
      ui.screen = 'game';
      ui.tab = 'home';
      refresh();
      toast(`读取存档：${latest.school} ${latest.date}`, 'good');
      await showPendingNotices();
    }
  };
  return (
    <div class="title-screen">
      <TitleArt />
      <div class="title-logo">像素甲子园</div>
      <div class="title-sub">～ 监督之路 ～</div>
      <div class="blink accent" style={{ marginTop: '12px' }}>
        PRESS START
      </div>
      <div class="col" style={{ marginTop: '18px', width: '240px' }}>
        <Btn
          kind="primary"
          big
          onClick={() => {
            sfx('click');
            ui.screen = 'newgame';
            refresh();
          }}
        >
          新的生涯
        </Btn>
        <Btn big disabled={!latest} onClick={() => void cont()}>
          继续游戏
        </Btn>
        {latest && (
          <div class="small center" style={{ textShadow: '1px 1px 0 var(--shadow)' }}>
            {latest.school} · {latest.date}
          </div>
        )}
        <Btn
          onClick={() =>
            void openModal((close) => (
              <div class="panel modal">
                <div class="mtitle">关于</div>
                <p>像素甲子园：监督之路 —— 一款以日本高中棒球为题材的像素风经营模拟游戏。</p>
                <p class="muted">你将以监督的身份，从一所学校开始执教生涯：招募新生、指导训练、指挥比赛、经营球队，向甲子园发起挑战。当名声提升，更多名门学校会向你抛出橄榄枝。</p>
                <p class="muted">字体：Fusion Pixel Font（SIL Open Font License 1.1）。所有校名、人名、企业名均为虚构。</p>
                <div class="row" style={{ justifyContent: 'flex-end' }}>
                  <Btn onClick={() => close()}>关闭</Btn>
                </div>
              </div>
            ))
          }
        >
          关于
        </Btn>
      </div>
    </div>
  );
}

const NAV: { id: Tab; label: string; icon: string }[] = [
  { id: 'home', label: '首页', icon: '◆' },
  { id: 'roster', label: '球队', icon: '●' },
  { id: 'training', label: '训练', icon: '▲' },
  { id: 'lineup', label: '阵容', icon: '■' },
  { id: 'schedule', label: '赛程', icon: '★' },
  { id: 'recruit', label: '招募', icon: '◎' },
  { id: 'staff', label: '教练', icon: '♦' },
  { id: 'finance', label: '经营', icon: '¥' },
  { id: 'manager', label: '监督', icon: '♛' },
  { id: 'news', label: '资讯', icon: '✉' },
  { id: 'records', label: '记录', icon: '▣' },
  { id: 'system', label: '系统', icon: '⚙' },
];

function nextEventText(): string {
  const w = G.week;
  const items: [number, string][] = [
    [SCHED.springPref[0], '春季县大会'],
    [SCHED.springRegion[0], '春季地区大会'],
    [SCHED.summerPref[0], '夏季县大会'],
    [SCHED.koshien[0], '夏季甲子园'],
    [SCHED.fallPref[0], '秋季县大会'],
    [SCHED.fallRegion[0], '秋季地区大会'],
    [SCHED.jingu[0], '明治神宫大会'],
    [SCHED.senbatsuAnnounce, '选拔出场校发表'],
    [SCHED.recruitDecision, '新生入学决定'],
    [SCHED.senbatsu[0], '春季选拔'],
  ];
  const next = items.filter(([wk]) => wk >= w).sort((a, b) => a[0] - b[0])[0];
  if (!next) return '新学年';
  const d = next[0] - w;
  return d === 0 ? `本周：${next[1]}` : `${d} 周后：${next[1]}`;
}

function GameShell() {
  const me = mySchool();
  const inProgress = weekInProgress();
  const unread = G.inbox.filter((m) => !m.read).length;
  const offers = G.manager.offers.length;
  return (
    <div class="app">
      <div class="topbar">
        <div class="logo hide-sm">像素甲子园</div>
        <div class="stat first">
          <span class="k">{seasonOf(G.week)} · {nextEventText()}</span>
          <span>{dateLabel(G.year, G.week)}</span>
        </div>
        <div class="stat hide-sm">
          <span class="k">执教学校</span>
          <span class="row gap4">
            <Emblem school={me} />
            {me.name}
          </span>
        </div>
        <div class="stat compact">
          <span class="k">部费</span>
          <Money v={G.club.funds} />
        </div>
        <div class="stat compact" title="行动力">
          <span class="k">行动力</span>
          <span class="accent">{'●'.repeat(G.manager.ap)}<span class="dim">{'○'.repeat(Math.max(0, G.manager.apMax - G.manager.ap))}</span></span>
        </div>
        <div class="stat hide-sm" style={{ minWidth: '90px' }}>
          <span class="k">校方满意度</span>
          <Bar v={G.club.board} color={G.club.board >= 50 ? 'var(--green)' : G.club.board >= 25 ? 'var(--orange)' : 'var(--red)'} />
        </div>
        <span class="grow" />
        <Btn kind="primary" big disabled={ui.busy} onClick={() => void runWeek()}>
          {ui.busy ? '进行中…' : inProgress ? '继续本周 ▶' : '推进一周 ▶'}
        </Btn>
      </div>
      <div class="body">
        <div class="sidenav">
          {NAV.map((n) => (
            <div key={n.id} class={`nav ${ui.tab === n.id || (ui.tab === 'player' && n.id === 'roster') ? 'on' : ''}`} onClick={() => go(n.id)}>
              <span>{n.icon}</span>
              <span>{n.label}</span>
              {n.id === 'news' && unread > 0 && <span class="badge">{unread}</span>}
              {n.id === 'manager' && offers > 0 && <span class="badge">{offers}</span>}
              {n.id === 'finance' && G.club.sponsorOffers.length > 0 && <span class="badge">{G.club.sponsorOffers.length}</span>}
            </div>
          ))}
        </div>
        <div class="main">
          <TabContent />
        </div>
      </div>
    </div>
  );
}

function TabContent() {
  switch (ui.tab) {
    case 'home':
      return <Dashboard />;
    case 'roster':
      return <Roster />;
    case 'player':
      return <PlayerDetail />;
    case 'training':
      return <Training />;
    case 'lineup':
      return <LineupScreen />;
    case 'schedule':
      return <Schedule />;
    case 'recruit':
      return <Recruit />;
    case 'staff':
      return <StaffScreen />;
    case 'finance':
      return <Finance />;
    case 'manager':
      return <ManagerScreen />;
    case 'news':
      return <NewsScreen />;
    case 'records':
      return <Records />;
    case 'system':
      return <SystemScreen />;
  }
  return null;
}
