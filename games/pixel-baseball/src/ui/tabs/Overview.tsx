import { G, myPlayers, mySchool } from '../../core/state';
import { isPitcher, overall, posRating, batterOffense } from '../../core/attrs';
import { strengthOf, strengthLetter } from '../../core/team';
import { repTier, mgrExpNeed, expectedRank } from '../../core/career';
import { nextOfficial, TOUR_ORDER } from '../../core/season';
import { alive } from '../../core/tournament';
import { schoolById, schoolRating } from '../../core/world';
import { SCHED, YEAR, daysText, doy, mdStr, yearIdx } from '../../core/calendar';
import { monthlyNet } from '../../core/economy';
import { PREFS } from '../../data/prefectures';
import { Bar, Emblem, Money, Ovr, Panel, PName } from '../components/common';
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

/** 一行「名字 · 档位字母 · 数字 · 条」：数字和条都对齐 */
function Meter(p: { label: string; v: number; color: string; letter?: boolean; max?: number }) {
  return (
    <div class="meter">
      <span class="m-l">{p.label}</span>
      {p.letter !== undefined && <b class="m-g">{p.letter ? strengthLetter(p.v) : ''}</b>}
      <span class="m-n">{Math.round(p.v)}</span>
      <Bar v={p.v} max={p.max} color={p.color} />
    </div>
  );
}

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
  const ace = ps.filter(isPitcher).sort((a, b) => posRating(b, 'P') - posRating(a, 'P'))[0];
  const slugger = ps.filter((p) => !isPitcher(p)).sort((a, b) => batterOffense(b) - batterOffense(a))[0];
  const cap = G.club.captainId ? G.players[G.club.captainId] : null;
  const rank = expectedRank();
  const active = TOUR_ORDER.map((k) => G.tours[k]).filter((t) => t && t.myFinish !== null);
  const need = mgrExpNeed(m.level);
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
            {m.name} · <b class="gold">{repTier(m.rep)}</b>（名声 {Math.round(m.rep)}）
          </span>
          <span>等级</span>
          <span class="row gap6">
            Lv {m.level}
            <Bar v={m.exp} max={need} w={64} color="var(--blue)" />
            <span class="dim">经验 {Math.floor(m.exp)}/{need}</span>
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
          <div class="meters">
            <Meter label="打击" v={st.off} letter color="var(--orange)" />
            <Meter label="投手" v={st.pit} letter color="var(--blue)" />
            <Meter label="守备" v={st.def} letter color="var(--green)" />
            <Meter label="默契" v={G.club.chemistry} letter={false} color="var(--pink)" />
            <Meter label="战术熟练" v={G.club.tactics} letter={false} color="var(--accent2)" />
          </div>
        </div>
        <div class="kv mt6">
          <span>主将</span>
          <span>{cap && !cap.retired ? <PName player={cap} /> : <span class="dim">（新队伍成立时任命）</span>}</span>
          <span>王牌</span>
          <span class="row gap6">
            {ace ? (
              <>
                <PName player={ace} /> <Ovr v={overall(ace)} label /> <span class="dim small">{Math.round(ace.a.velocity)}km/h</span>
              </>
            ) : (
              '—'
            )}
          </span>
          <span>主炮</span>
          <span class="row gap6">
            {slugger ? (
              <>
                <PName player={slugger} /> <Ovr v={overall(slugger)} label />
              </>
            ) : (
              '—'
            )}
          </span>
        </div>
      </Panel>

      <Panel title="今年">
        <div class="meters nl">
          <div class="meter">
            <span class="m-l">校方目标</span>
            <span class="m-t">{G.club.goal?.text ?? '—'}</span>
          </div>
          <Meter label="校方满意度" v={G.club.board} color={G.club.board < 30 ? 'var(--red)' : 'var(--green)'} />
          <Meter label="OB 会" v={G.club.ob} color="var(--accent2)" />
          <div class="meter">
            <span class="m-l">正式比赛</span>
            <span class="m-t">
              {G.seasonWL[0]} 胜 {G.seasonWL[1]} 负
            </span>
          </div>
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
          <div class="glist">
            {G.games.slice(0, 6).map((g) => (
              <div
                key={g.id}
                class="lrow lr-game click"
                onClick={() => {
                  ui.modal = { kind: 'box', gameId: g.id };
                  refresh();
                }}
              >
                <span class={g.win ? 'win' : 'lose'}>{g.win ? '胜' : '负'}</span>
                <span class="dim">{mdStr(g.d)}</span>
                <span class="ell">
                  {g.label} · {g.oppName}
                </span>
                <b class="n">
                  {g.my}-{g.opp}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <div class="dim small">还没有比赛。周六有练习赛，4 月中旬是春季县大会。</div>
        )}
      </Panel>

      <Panel title="日程">
        <div class="glist">
          {upcoming.map((u) => (
            <div key={u.name} class="lrow lr-cal">
              <span class="dim">{mdStr(u.at + yearIdx(G.day) * YEAR)}</span>
              <span class="ell">{u.name}</span>
              <span class="dim n">{daysText(u.d)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
