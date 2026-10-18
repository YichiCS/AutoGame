import { useState } from 'preact/hooks';
import type { Tournament, School } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { Panel, Btn, Emblem, Empty } from '../components/common';
import { shortDate, isOffseason } from '../../core/calendar';
import { schoolStrength, schoolsInPref } from '../../core/world';
import { strengthLetter } from '../../core/team';
import { refresh, toast } from '../store';
import { sortBy } from '../../core/util';
import { PREFS } from '../../data/prefectures';
import { weekInProgress } from '../../core/game';
import { hasOfficialGameThisWeek } from '../../core/training';
import { Calendar } from './Dashboard';
import { openSchool } from '../components/SchoolModal';

const KIND_LABEL: Record<Tournament['kind'], string> = {
  springPref: '春季县大会', springRegion: '春季地区大会', summerPref: '夏季县大会', koshien: '夏季甲子园', fallPref: '秋季县大会', fallRegion: '秋季地区大会', jingu: '明治神宫大会', senbatsu: '春季选拔',
};

function short(id: number | null): string {
  if (id === null) return '—';
  return G.schools[id]?.short ?? '?';
}

function Bracket(p: { t: Tournament; mineOnly: boolean }) {
  const me = G.club.schoolId;
  const t = p.t;
  // 我方路线：只显示与本校相关的比赛 + 后面的轮次
  return (
    <div class="bracket">
      {t.rounds.map((ms, r) => {
        let list = ms.map((m, i) => ({ m, i }));
        if (p.mineOnly) list = list.filter(({ m }) => m.a === me || m.b === me || r >= t.rounds.length - 3);
        return (
          <div key={r} class="rcol">
            <div class="accent center small rhead">
              {t.roundNames[r]}
              <div class="dim">{shortDate(t.roundWeeks[r])}</div>
            </div>
            <div class="rbody">
            {list.map(({ m, i }) => {
              if (m.note === '轮空' && r === 0 && p.mineOnly) return null;
              const aw = m.played && m.winner === m.a && m.a !== null;
              const bw = m.played && m.winner === m.b && m.b !== null;
              return (
                <div key={i} class="bm" title={m.note ?? ''}>
                  <div class={`t ${aw ? 'w' : ''} ${m.a === me ? 'me' : ''}`} style={{ cursor: 'pointer' }} onClick={() => m.a !== null && openSchool(m.a)}>
                    <span class="ellipsis">{short(m.a)}</span>
                    <span>{m.played && m.note !== '轮空' ? m.sa : ''}</span>
                  </div>
                  <div class={`t ${bw ? 'w' : ''} ${m.b === me ? 'me' : ''}`} style={{ cursor: 'pointer' }} onClick={() => m.b !== null && openSchool(m.b)}>
                    <span class="ellipsis">{m.note === '轮空' && m.b === null ? '（轮空）' : short(m.b)}</span>
                    <span>{m.played && m.note !== '轮空' ? m.sb : ''}</span>
                  </div>
                </div>
              );
            })}
            </div>
          </div>
        );
      })}
      {t.champion !== null && (
        <div class="rcol">
          <div class="accent center rhead">冠军</div>
          <div class="rbody">
            <div class="bm" style={{ padding: '6px', borderColor: 'var(--accent2)' }}>
              <div class="center accent big-text">{short(t.champion)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PracticePanel() {
  const me = mySchool();
  const blocked = isOffseason(G.week) || weekInProgress() || hasOfficialGameThisWeek() || G.club.banUntil > G.absWeek;
  const local = sortBy(schoolsInPref(me.prefId).filter((s) => s.id !== me.id), (s) => schoolStrength(s).total).slice(0, 14);
  const far = sortBy(Object.values(G.schools).filter((s) => s.prefId !== me.prefId && s.prestige >= 70), (s) => s.prestige).slice(0, 6);
  const book = (s: School) => {
    G.club.practice = { week: G.week, opponentId: s.id };
    toast(`本周将与${s.name}进行练习赛`, 'good');
    refresh();
  };
  return (
    <Panel title="练习赛">
      {G.club.practice ? (
        <div class="row">
          <span>已安排：{shortDate(G.club.practice.week)} vs {G.schools[G.club.practice.opponentId]?.name}</span>
          <Btn small onClick={() => ((G.club.practice = null), refresh())}>
            取消
          </Btn>
        </div>
      ) : blocked ? (
        <div class="dim small">
          {isOffseason(G.week) ? '冬季（12 月~3 月上旬）禁止对外比赛。' : hasOfficialGameThisWeek() ? '本周有公式战。' : G.club.banUntil > G.absWeek ? '处分期间禁止对外比赛。' : '本周流程进行中，无法安排。'}
        </div>
      ) : (
        <div>
          <div class="small muted mb8">练习赛能让球员积累实战经验（经验约为公式战的 6 成），也能观察对手。客场需要远征费。</div>
          <div class="accent small">县内学校（远征费约 8 万）</div>
          <div class="row wrap gap4 mb8">
            {local.map((s) => (
              <Btn key={s.id} small onClick={() => book(s)}>
                <Emblem school={s} />
                {s.short} {strengthLetter(schoolStrength(s).total)}
              </Btn>
            ))}
          </div>
          <div class="accent small">外县名门（远征费约 25 万）</div>
          <div class="row wrap gap4">
            {far.map((s) => (
              <Btn key={s.id} small onClick={() => book(s)}>
                <Emblem school={s} />
                {s.short}（{PREFS[s.prefId].name}）{strengthLetter(schoolStrength(s).total)}
              </Btn>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function Schedule() {
  const ts = sortBy(Object.values(G.tournaments).filter((t) => t.year >= G.year - 1), (t) => t.year * 100 + t.roundWeeks[0], true);
  const me = G.club.schoolId;
  const mineFirst = [...ts].sort((a, b) => Number(b.teams.includes(me)) - Number(a.teams.includes(me)) || b.year - a.year || b.roundWeeks[0] - a.roundWeeks[0]);
  const [sel, setSel] = useState<string | null>(mineFirst[0]?.id ?? null);
  const [mineOnly, setMineOnly] = useState(true);
  const cur = sel ? G.tournaments[sel] : null;
  return (
    <div class="col">
      <div class="page-title">赛程与大会</div>
      <Panel title="年度日程">
        <Calendar />
        <div class="small muted mt8">绿：春季县大会　橙：夏季县大会　红：夏季甲子园　黄：秋季县大会　蓝：神宫大会　粉：春季选拔　深蓝：禁止对外比赛期</div>
      </Panel>
      <PracticePanel />
      <Panel title="大会">
        <div class="row wrap gap4 mb8">
          {ts.map((t) => (
            <Btn key={t.id} small on={sel === t.id} onClick={() => setSel(t.id)}>
              {t.teams.includes(me) ? '★ ' : ''}
              {t.year}
              {KIND_LABEL[t.kind]}
              {t.done ? '' : '（进行中）'}
            </Btn>
          ))}
          {!ts.length && <span class="dim">本年度还没有大会开始。</span>}
        </div>
        {cur && (
          <div>
            <div class="row between mb8">
              <div>
                <span class="big-text accent">{cur.name}</span>
                <span class="muted"> · {cur.teams.length} 校参加{cur.mercy ? ' · 有提前结束规则' : ''}</span>
              </div>
              <div class="row gap4">
                <Btn small on={mineOnly} onClick={() => setMineOnly(true)}>
                  我方路线
                </Btn>
                <Btn small on={!mineOnly} onClick={() => setMineOnly(false)}>
                  全部对阵
                </Btn>
              </div>
            </div>
            {cur.teams.includes(me) && (
              <div class="mb8">
                本校成绩：<span class="accent">{cur.finish[me] ?? (cur.champion === me ? '冠军' : '比赛中')}</span>
              </div>
            )}
            <Bracket t={cur} mineOnly={mineOnly && cur.teams.includes(me)} />
          </div>
        )}
      </Panel>
      <Panel title="历代甲子园冠军">
        {G.records.koshienChamps.length ? (
          G.records.koshienChamps
            .slice()
            .reverse()
            .slice(0, 20)
            .map((c, i) => (
              <div key={i} class="listitem small">
                {c.year}年 {c.kind === 'summer' ? '夏' : '春'}：<span class={c.schoolId === me ? 'accent' : ''}>{c.schoolName}</span>
                <span class="dim">（亚军 {c.runnerUp}）</span>
              </div>
            ))
        ) : (
          <Empty>还没有记录</Empty>
        )}
      </Panel>
    </div>
  );
}
