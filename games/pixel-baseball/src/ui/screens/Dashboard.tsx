import { G, mySchool, myPlayers } from '../../core/state';
import { Panel, Bar, Btn, Emblem, Money, Grade, Portrait, PName, Empty } from '../components/common';
import { schoolStrength, schoolsInPref } from '../../core/world';
import { strengthLetter } from '../../core/team';
import { LADDER, repTier } from '../../core/career';
import { monthOf, SCHED, WEEKS, shortDate, isOffseason } from '../../core/calendar';
import { go, openModal, refresh, type Tab } from '../store';
import { fullName, overall } from '../../core/attrs';
import { sortBy } from '../../core/util';
import { PREFS } from '../../data/prefectures';
import type { StaffRole, Tournament } from '../../core/types';
import { openSchool } from '../components/SchoolModal';
import { recruitSeason } from '../../core/recruit';
import { roleSkill, ROLE_NAME } from '../../core/staff';
import { campAvailable, hasOfficialGameThisWeek } from '../../core/training';
import { costTotal } from '../../core/growth';
import { weekInProgress } from '../../core/game';

interface Todo {
  text: string;
  tab: Tab;
  tone?: 'good' | 'bad';
}

/** 首页上的待办提示，帮助玩家注意需要处理的事情 */
function todos(): Todo[] {
  const out: Todo[] = [];
  const ps = myPlayers().filter((p) => !p.retired);
  if (G.manager.offers.length) out.push({ text: `收到 ${G.manager.offers.length} 份监督邀请`, tab: 'manager', tone: 'good' });
  if (G.manager.points > 0) out.push({ text: `有 ${G.manager.points} 个监督技能点可以分配`, tab: 'manager', tone: 'good' });
  if (G.club.sponsorOffers.length) out.push({ text: `${G.club.sponsorOffers.length} 个赞助提案等待回复`, tab: 'finance' });
  if (recruitSeason() && G.manager.ap > 0 && G.prospects.length) out.push({ text: `招募期：还有 ${G.manager.ap} 点行动力，可以家访中学生`, tab: 'recruit' });
  const roles: StaffRole[] = ['pitching', 'batting', 'fielding', 'trainer'];
  const missing = roles.filter((r) => !roleSkill(r));
  if (missing.length) out.push({ text: `教练空缺：${missing.map((r) => ROLE_NAME[r]).join('、')}`, tab: 'staff' });
  const inj = ps.filter((p) => p.injury).length;
  if (inj) out.push({ text: `${inj} 名球员伤病中`, tab: 'roster', tone: 'bad' });
  const tired = ps.filter((p) => p.fatigue >= 65).length;
  if (tired >= 3) out.push({ text: `${tired} 名球员疲劳过度，考虑降低强度或安排休养`, tab: 'training', tone: 'bad' });
  if (campAvailable() && G.flags.campAbs !== G.absWeek) out.push({ text: '本周可以举行集训合宿', tab: 'training' });
  if ((G.week >= 10 && G.week <= 13) || (G.week >= 31 && G.week <= 34)) {
    const low = ps.filter((p) => p.academics < 35).length;
    if (low) out.push({ text: `期末考试临近，${low} 名球员学力偏低`, tab: 'training', tone: 'bad' });
  }
  const manual = ps.filter((p) => p.plan === 'manual' && costTotal(p.exp) > 60).length;
  if (manual) out.push({ text: `${manual} 名「手动加点」球员积攒了大量经验`, tab: 'roster' });
  if (!G.club.construction && G.club.funds > 900) out.push({ text: '资金充裕，可以考虑扩建设施', tab: 'finance', tone: 'good' });
  if (!G.club.practice && !isOffseason(G.week) && !weekInProgress() && !hasOfficialGameThisWeek() && G.club.banUntil <= G.absWeek) {
    out.push({ text: '本周没有比赛，可以安排练习赛', tab: 'schedule' });
  }
  if (G.club.funds < 0) out.push({ text: '部费赤字！请削减开支或寻找赞助', tab: 'finance', tone: 'bad' });
  return out;
}

function TodoPanel() {
  const list = todos();
  return (
    <Panel title="待办与提示">
      {list.length ? (
        list.map((t, i) => (
          <div key={i} class={`listitem row ${t.tone ?? ''}`} style={{ cursor: 'pointer' }} onClick={() => go(t.tab)}>
            <span>▸</span>
            <span class="grow">{t.text}</span>
          </div>
        ))
      ) : (
        <Empty>一切就绪，推进一周吧！</Empty>
      )}
    </Panel>
  );
}

const CAL_MARKS: { weeks: readonly number[]; label: string; color: string }[] = [
  { weeks: SCHED.springPref, label: '春县', color: '#38b764' },
  { weeks: SCHED.springRegion, label: '春地区', color: '#257179' },
  { weeks: SCHED.summerPref, label: '夏县', color: '#ef7d57' },
  { weeks: SCHED.koshien, label: '夏甲', color: '#e43b44' },
  { weeks: SCHED.fallPref, label: '秋县', color: '#ffcd75' },
  { weeks: SCHED.fallRegion, label: '秋地区', color: '#ffa300' },
  { weeks: SCHED.jingu, label: '神宫', color: '#41a6f6' },
  { weeks: SCHED.senbatsu, label: '春甲', color: '#ff77a8' },
];

export function Calendar() {
  const months = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div class="calendar">
      {months.map((mi) => (
        <div key={mi} class="m">
          <div class="h">{monthOf(mi * 4)}月</div>
          {[0, 1, 2, 3].map((wi) => {
            const w = mi * 4 + wi;
            const mark = CAL_MARKS.find((c) => (c.weeks as readonly number[]).includes(w));
            const off = isOffseason(w);
            return (
              <div
                key={wi}
                class={`w ${w === G.week ? 'now' : ''} ${w < G.week ? 'past' : ''}`}
                style={{ background: mark ? mark.color : off ? '#1d2b53' : undefined }}
                title={`${shortDate(w)}${mark ? ' ' + mark.label : off ? ' 禁止对外比赛' : ''}`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function myNextMatch(): { t: Tournament; round: number; opp: number | null } | null {
  const me = G.club.schoolId;
  for (const t of Object.values(G.tournaments)) {
    if (t.done || !t.teams.includes(me) || t.finish[me] !== undefined) continue;
    for (let r = 0; r < t.rounds.length; r++) {
      const m = t.rounds[r].find((x) => (x.a === me || x.b === me) && !x.played);
      if (m) return { t, round: r, opp: m.a === me ? m.b : m.a };
    }
  }
  return null;
}

export function Dashboard() {
  const me = mySchool();
  const st = schoolStrength(me);
  const ps = myPlayers().filter((p) => !p.retired);
  const injured = ps.filter((p) => p.injury);
  const avgF = ps.reduce((a, p) => a + p.fatigue, 0) / Math.max(1, ps.length);
  const avgM = ps.reduce((a, p) => a + p.morale, 0) / Math.max(1, ps.length);
  const cap = G.club.captainId ? G.players[G.club.captainId] : null;
  const next = myNextMatch();
  const rivals = sortBy(schoolsInPref(me.prefId), (s) => schoolStrength(s).total).slice(0, 8);
  const stars = sortBy(ps.slice(), overall).slice(0, 4);
  const book = G.club.books[G.club.books.length - 1];
  const inc = book ? Object.values(book.income).reduce((a, b) => a + b, 0) : 0;
  const exp = book ? Object.values(book.expense).reduce((a, b) => a + b, 0) : 0;
  const mails = G.inbox.slice(0, 5);
  const national = Object.values(G.tournaments).find((t) => (t.kind === 'koshien' || t.kind === 'senbatsu') && !t.done && t.teams.includes(me.id));
  return (
    <div class="col">
      <div class="page-title">
        <Emblem school={me} lg />
        {me.name}
        <span class="sub">
          {PREFS[me.prefId].name} · {me.type === 'public' ? '公立' : '私立'} · 名门度 {me.prestige.toFixed(0)} · 第 {Math.floor(G.absWeek / WEEKS) + 1} 年
        </span>
        {national && <span class="tag gold">★ {national.kind === 'koshien' ? '夏季甲子园' : '春季选拔'}出场中</span>}
      </div>
      <Panel title="年度日程">
        <Calendar />
      </Panel>
      <TodoPanel />
      <div class="grid3">
        <Panel title="接下来">
          {next ? (
            <div>
              <div class="accent">{next.t.name}</div>
              <div>{next.t.roundNames[next.round]}（{shortDate(next.t.roundWeeks[next.round])}）</div>
              {next.opp !== null ? (
                <div class="row mt8" style={{ cursor: 'pointer' }} onClick={() => openSchool(next.opp!)}>
                  <Emblem school={G.schools[next.opp]} />
                  <span>
                    对手：{G.schools[next.opp].name}（战力 {strengthLetter(schoolStrength(G.schools[next.opp]).total)}）
                  </span>
                </div>
              ) : (
                <div class="muted mt8">对手待定</div>
              )}
              <Btn small class="mt8" onClick={() => go('schedule')}>
                查看对阵表
              </Btn>
            </div>
          ) : (
            <div>
              <div class="muted">近期没有公式战。</div>
              {G.club.practice ? (
                <div class="mt8">已安排练习赛：{G.schools[G.club.practice.opponentId]?.name}（{shortDate(G.club.practice.week)}）</div>
              ) : !isOffseason(G.week) ? (
                <Btn small class="mt8" onClick={() => go('schedule')}>
                  安排练习赛
                </Btn>
              ) : (
                <div class="small dim mt8">冬季禁止对外比赛，专心冬训吧。</div>
              )}
            </div>
          )}
        </Panel>
        <Panel title="球队状态">
          <div class="row between">
            <span>综合战力</span>
            <span class="big-text accent">{strengthLetter(st.total)}</span>
          </div>
          <div class="row between small">
            <span>打击 <Grade v={st.off} /></span>
            <span>投手 <Grade v={st.pit} /></span>
            <span>守备 <Grade v={st.def} /></span>
          </div>
          <div class="kv mt8 small">
            <span class="k">团队默契</span>
            <Bar v={G.club.chemistry} color="var(--blue)" />
            <span class="k">战术熟练</span>
            <Bar v={G.club.tacticsSkill} color="var(--accent2)" />
            <span class="k">平均干劲</span>
            <Bar v={avgM} color="var(--green)" />
            <span class="k">平均疲劳</span>
            <Bar v={avgF} color={avgF > 50 ? 'var(--red)' : 'var(--orange)'} />
          </div>
          <div class="small mt8">
            部员 {ps.length} 人 · 伤病 <span class={injured.length ? 'bad' : ''}>{injured.length}</span> 人 · 主将 {cap ? fullName(cap) : '未定'}
          </div>
        </Panel>
        <Panel title="目标与评价">
          <div>
            今年目标：<span class="accent">{LADDER[G.club.goal]}</span>
          </div>
          <div class="kv mt8 small">
            <span class="k">校方</span>
            <Bar v={G.club.board} color={G.club.board >= 50 ? 'var(--green)' : 'var(--red)'} />
            <span class="k">OB会</span>
            <Bar v={G.club.ob} color="var(--accent2)" />
            <span class="k">地方期待</span>
            <Bar v={G.club.supporters} color="var(--pink)" />
          </div>
          <div class="small mt8">
            名声：{repTier(G.manager.reputation)}（{G.manager.reputation.toFixed(0)}） · 合同剩余 {G.manager.contractYears} 年
          </div>
          <div class="small">
            通算 {G.manager.totals.w} 胜 {G.manager.totals.l} 败 · 甲子园 {G.manager.totals.koshienApps} 次
          </div>
        </Panel>
      </div>
      <div class="grid3">
        <Panel title="主力球员" right={<Btn small onClick={() => go('roster')}>全部</Btn>}>
          {stars.map((p) => (
            <div key={p.id} class="row listitem">
              <Portrait player={p} size="sm" />
              <div class="grow">
                <PName player={p} />
                <div class="small muted">
                  {p.grade}年 · {p.pos} · 综合 <Grade v={overall(p)} />
                </div>
              </div>
            </div>
          ))}
        </Panel>
        <Panel title="资金" right={<Btn small onClick={() => go('finance')}>经营</Btn>}>
          <div class="big-text">
            <Money v={G.club.funds} />
          </div>
          {book && (
            <div class="small mt8">
              本月（{book.label}）收入 <span class="good">{Math.round(inc)}</span> 万 · 支出 <span class="bad">{Math.round(exp)}</span> 万
            </div>
          )}
          <div class="small muted mt8">
            球迷 {G.club.fans.toLocaleString()} 人 · 赞助 {G.club.sponsors.length} 家{G.club.sponsorOffers.length ? ` · 新提案 ${G.club.sponsorOffers.length}` : ''}
          </div>
          {G.club.construction && <div class="small accent mt8">施工中：剩余 {G.club.construction.weeksLeft} 周</div>}
        </Panel>
        <Panel title="县内强豪">
          {rivals.map((s) => (
            <div key={s.id} class="row small" style={{ padding: '1px 0', cursor: 'pointer' }} onClick={() => openSchool(s.id)}>
              <Emblem school={s} />
              <span class={`grow ellipsis ${s.id === me.id ? 'accent' : ''}`}>{s.name}</span>
              <span>{strengthLetter(schoolStrength(s).total)}</span>
              <span class="dim" style={{ width: '28px', textAlign: 'right' }}>{schoolStrength(s).total.toFixed(0)}</span>
            </div>
          ))}
        </Panel>
      </div>
      <div class="grid2">
        <Panel title="信件" right={<Btn small onClick={() => go('news')}>全部</Btn>}>
          {mails.length ? (
            mails.map((m) => (
              <div
                key={m.id}
                class="listitem row"
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  m.read = true;
                  refresh();
                  void openModal((close) => (
                    <div class="panel modal">
                      <div class="mtitle">{m.title}</div>
                      <div style={{ whiteSpace: 'pre-line' }}>{m.body}</div>
                      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                        <Btn onClick={() => close()}>关闭</Btn>
                      </div>
                    </div>
                  ));
                }}
              >
                <span class={m.read ? 'dim' : 'accent'}>{m.read ? '○' : '●'}</span>
                <span class={`grow ellipsis ${m.kind === 'offer' ? 'good' : ''}`}>{m.title}</span>
              </div>
            ))
          ) : (
            <Empty>没有信件</Empty>
          )}
        </Panel>
        <Panel title="新闻">
          {G.news.slice(0, 7).map((n, i) => (
            <div key={i} class="listitem small">
              <span class="dim">[{shortDate(n.absWeek % WEEKS)}]</span> {n.text}
            </div>
          ))}
          {!G.news.length && <Empty>暂无新闻</Empty>}
        </Panel>
      </div>
    </div>
  );
}
