import { G, myPlayers, mySchool } from '../../core/state';
import { isPitcher, overall, pitcherOverall, batterOffense } from '../../core/attrs';
import { strengthOf, strengthLetter } from '../../core/team';
import { repTier, mgrExpNeed, expectedRank } from '../../core/career';
import { nextOfficial, TOUR_ORDER } from '../../core/season';
import { alive } from '../../core/tournament';
import { schoolById, schoolRating } from '../../core/world';
import { SCHED, YEAR, daysText, doy, mdStr, yearIdx } from '../../core/calendar';
import { monthlyNet } from '../../core/economy';
import { PREFS } from '../../data/prefectures';
import { Bar, Emblem, Money, Panel, PName } from '../components/common';
import { refresh, ui } from '../store';

const CAL: [number, string][] = [
  [SCHED.springPref, '春季县大会'],
  [SCHED.summerPref, '夏季县大会'],
  [SCHED.koshien, '夏季甲子园'],
  [SCHED.newTeam, '新队伍 · 校方评价'],
  [SCHED.fallPref, '秋季县大会'],
  [SCHED.draft, '职业选秀会议'],
  [SCHED.winterCamp, '冬季合宿'],
  [SCHED.senbatsuAnnounce, '春季选拔发表'],
  [SCHED.graduation, '毕业典礼'],
  [SCHED.senbatsu, '春季选拔'],
];

export function Overview() {
  const s = mySchool();
  const ps = myPlayers();
  const st = strengthOf(ps, G.dh);
  const m = G.mgr;
  const nx = nextOfficial();
  const opp = nx?.oppId ? schoolById(nx.oppId) : null;
  const pref = PREFS[G.prefId];
  const today = doy(G.day);
  const upcoming = CAL.map(([d, name]) => ({ d: d >= today ? d - today : d + YEAR - today, name, at: d })).sort((a, b) => a.d - b.d).slice(0, 5);
  const ace = ps.filter(isPitcher).sort((a, b) => pitcherOverall(b) - pitcherOverall(a))[0];
  const slugger = ps.filter((p) => !isPitcher(p)).sort((a, b) => batterOffense(b) - batterOffense(a))[0];
  const cap = G.club.captainId ? G.players[G.club.captainId] : null;
  const rank = expectedRank();
  const active = TOUR_ORDER.map((k) => G.tours[k]).filter((t) => t && t.myFinish !== null);
  return (
    <div>
      <Panel title="学校">
        <div class="row gap8">
          <Emblem school={s} lg />
          <div class="grow">
            <div class="big">{s.name}</div>
            <div class="dim small">
              {pref.name} · {s.type === 'public' ? '公立' : '私立'} · 名门度 {Math.round(s.prestige)} · 甲子园出场 {s.koshienApps} 次
            </div>
          </div>
        </div>
        <div class="kv mt6">
          <span>监督</span>
          <span>
            {m.name} · <b class="gold">{repTier(m.rep)}</b>（名声 {Math.round(m.rep)}）· Lv {m.level} <Bar v={m.exp} max={mgrExpNeed(m.level)} w={50} color="var(--blue)" />
          </span>
          <span>部费</span>
          <span>
            <Money v={G.funds} />（每月约 <Money v={monthlyNet()} signed />）
          </span>
          <span>球迷</span>
          <span>{G.club.fans.toLocaleString()} 人</span>
        </div>
      </Panel>

      <Panel title="球队" right={<span>县内预期第 {rank} 名</span>}>
        <div class="strength">
          <div class="sbig">
            <span class="dim small">综合战力</span>
            <b>{strengthLetter(st.total)}</b>
            <small>{st.total.toFixed(0)}</small>
          </div>
          <div class="grow">
            <div class="kv">
              <span>打击</span>
              <span><b>{strengthLetter(st.off)}</b> <Bar v={st.off} w={110} color="var(--orange)" /></span>
              <span>投手</span>
              <span><b>{strengthLetter(st.pit)}</b> <Bar v={st.pit} w={110} color="var(--blue)" /></span>
              <span>守备</span>
              <span><b>{strengthLetter(st.def)}</b> <Bar v={st.def} w={110} color="var(--green)" /></span>
              <span>默契</span>
              <span><Bar v={G.club.chemistry} w={110} color="var(--pink)" /></span>
              <span>战术熟练</span>
              <span><Bar v={G.club.tactics} w={110} color="var(--accent2)" /></span>
            </div>
          </div>
        </div>
        <div class="kv mt6">
          <span>主将</span>
          <span>{cap && !cap.retired ? <PName player={cap} /> : <span class="dim">（新队伍成立时任命）</span>}</span>
          <span>王牌</span>
          <span>{ace ? <><PName player={ace} /> <span class="dim small">{Math.round(ace.a.velocity)}km/h · 综合 {Math.round(overall(ace))}</span></> : '—'}</span>
          <span>主炮</span>
          <span>{slugger ? <><PName player={slugger} /> <span class="dim small">综合 {Math.round(overall(slugger))}</span></> : '—'}</span>
        </div>
      </Panel>

      <Panel title="今年">
        <div class="kv">
          <span>校方目标</span>
          <span>{G.club.goal?.text ?? '—'}</span>
          <span>校方满意度</span>
          <span><Bar v={G.club.board} w={110} color={G.club.board < 30 ? 'var(--red)' : 'var(--green)'} /></span>
          <span>OB 会</span>
          <span><Bar v={G.club.ob} w={110} color="var(--accent2)" /></span>
          <span>正式比赛</span>
          <span>{G.seasonWL[0]} 胜 {G.seasonWL[1]} 负</span>
        </div>
        {nx && (
          <div class="next mt6">
            下一场：<b>{nx.label}</b>（{daysText(nx.day - G.day)}）
            {opp && (
              <span>
                {' '}对 <Emblem school={opp} /> {opp.name} <span class="dim">（战力 {strengthLetter(schoolRating(opp, G.day))}）</span>
              </span>
            )}
          </div>
        )}
        {active.map((t) => (
          <div key={t!.kind} class="small mt4">
            {t!.name}：{alive(t!, G.schoolId) && !t!.done ? <span class="good">晋级中</span> : <b>{t!.myFinish}</b>}
          </div>
        ))}
      </Panel>

      <Panel title="近期比赛">
        {G.games.length ? (
          G.games.slice(0, 6).map((g) => (
            <div
              key={g.id}
              class="gline"
              onClick={() => {
                ui.modal = { kind: 'box', gameId: g.id };
                refresh();
              }}
            >
              <span class={g.win ? 'win' : 'lose'}>{g.win ? '胜' : '负'}</span>
              <span class="dim">{mdStr(g.d)}</span>
              <span class="grow">{g.label} · {g.oppName}</span>
              <b>
                {g.my} - {g.opp}
              </b>
            </div>
          ))
        ) : (
          <div class="dim small">还没有比赛。周六有练习赛，4 月中旬是春季县大会。</div>
        )}
      </Panel>

      <Panel title="日程">
        {upcoming.map((u) => (
          <div key={u.name} class="gline">
            <span class="dim">{mdStr(u.at + yearIdx(G.day) * YEAR)}</span>
            <span class="grow">{u.name}</span>
            <span class="dim">{daysText(u.d)}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
