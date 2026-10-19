import type { Tour, TourKind } from '../../core/types';
import { G } from '../../core/state';
import { TOUR_ORDER, TOUR_NAME_SHORT } from '../../core/season';
import { alive } from '../../core/tournament';
import { schoolById } from '../../core/world';
import { mdStr, schoolYear } from '../../core/calendar';
import { Empty, Panel, SubTabs } from '../components/common';
import { refresh, setSub, ui } from '../store';

type Sub = 'tours' | 'bracket' | 'results';

function short(id: number | null): string {
  if (id === null) return '（轮空）';
  const s = schoolById(id);
  return s ? s.short || s.name : '某校';
}

function MyPath(p: { t: Tour }) {
  const t = p.t;
  const me = G.schoolId;
  const rows: { r: number; name: string; opp: number | null; my: number; their: number; done: boolean; win: boolean; note?: string; day: number }[] = [];
  t.rounds.forEach((ms, r) => {
    const m = ms.find((x) => x.a === me || x.b === me);
    if (!m) return;
    const isA = m.a === me;
    rows.push({ r, name: t.roundNames[r], opp: isA ? m.b : m.a, my: isA ? m.sa : m.sb, their: isA ? m.sb : m.sa, done: m.done, win: m.w === me, note: m.note, day: t.roundDays[r] });
  });
  return (
    <div class="glist">
      {rows.map((x) => (
        <div key={x.r} class="lrow lr-path">
          <span class="dim">{mdStr(x.day)}</span>
          <span class="ell">{x.name}</span>
          <span class="ell">{x.note === '轮空' && x.opp === null ? '轮空' : `对 ${short(x.opp)}`}</span>
          {x.done && x.note !== '轮空' ? (
            <b class={`n ${x.win ? 'win' : 'lose'}`}>
              {x.win ? '胜' : '负'} {x.my}-{x.their}
            </b>
          ) : (
            <span class="n dim">{x.done ? '' : '未开始'}</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Bracket(p: { t: Tour }) {
  const t = p.t;
  const me = G.schoolId;
  return (
    <div>
      <div class="kv mb6">
        <span>参赛</span>
        <span>{t.teams.length} 校</span>
        <span>本校</span>
        <span>{t.myFinish ?? '未参加'}</span>
        {t.done && (
          <>
            <span>冠军</span>
            <span class="gold">{schoolById(t.champion!)?.name ?? '—'}</span>
            <span>亚军</span>
            <span>{schoolById(t.runnerUp!)?.name ?? '—'}</span>
          </>
        )}
      </div>
      {t.myFinish && (
        <Panel title="本校的路线">
          <MyPath t={t} />
        </Panel>
      )}
      {t.rounds
        .map((ms, r) => ({ ms, r }))
        .reverse()
        .map(({ ms, r }) => {
          const shown = ms.filter((m) => m.a !== null || m.b !== null);
          if (!shown.length) return null;
          const open = r >= t.rounds.length - 3 || ms.some((m) => m.a === me || m.b === me);
          return (
            <details key={r} open={open} class="round">
              <summary>
                {t.roundNames[r]} <span class="dim small">{mdStr(t.roundDays[r])}</span>
              </summary>
              <div class="bms">
                {shown.map((m, i) => {
                  const mine = m.a === me || m.b === me;
                  return (
                    <div key={i} class={`bm ${mine ? 'mine' : ''}`}>
                      <span class={`ell ${m.done && m.w === m.a ? 'w' : ''}`}>{short(m.a)}</span>
                      <span class="sc">{m.done ? (m.note === '轮空' ? '—' : `${m.sa}-${m.sb}`) : 'vs'}</span>
                      <span class={`ell ${m.done && m.w === m.b ? 'w' : ''}`}>{short(m.b)}</span>
                      {m.note && m.note !== '轮空' && <small class="dim">{m.note}</small>}
                    </div>
                  );
                })}
              </div>
            </details>
          );
        })}
    </div>
  );
}

export function Games() {
  const sub = (ui.sub.games as Sub) ?? 'tours';
  const tours = TOUR_ORDER.map((k) => G.tours[k]).filter((t): t is Tour => !!t);
  const selKind = (ui.sub.gamesTour as TourKind) ?? tours.filter((t) => t.myFinish)[tours.filter((t) => t.myFinish).length - 1]?.kind ?? tours[tours.length - 1]?.kind;
  const sel = selKind ? G.tours[selKind] : undefined;
  return (
    <div>
      <div class="stick">
        <SubTabs
          value={sub}
          onChange={(v) => setSub('games', v)}
          tabs={[
            { id: 'tours', label: '今年的大会' },
            { id: 'bracket', label: '对阵表' },
            { id: 'results', label: `比赛记录 ${G.games.length}` },
          ]}
        />
      </div>
      {sub === 'tours' && (
        <div>
          <div class="small dim mb6">
            {schoolYear(G.day, G.startYear)} 学年 · 正式比赛 {G.seasonWL[0]} 胜 {G.seasonWL[1]} 负
          </div>
          <div class="glist">
            {TOUR_ORDER.map((k) => {
              const t = G.tours[k];
              return (
                <div key={k} class="lrow lr-tour">
                  <span class="ell">{t ? t.name : TOUR_NAME_SHORT[k]}</span>
                  <span class="n">
                    {!t && <span class="dim">{k === 'koshien' || k === 'springRegion' || k === 'fallRegion' || k === 'jingu' || k === 'senbatsu' ? '需要晋级' : '未开幕'}</span>}
                    {t && !t.myFinish && <span class="dim">未参加</span>}
                    {t && t.myFinish && (alive(t, G.schoolId) && !t.done ? <span class="good">晋级中</span> : <b class={t.myFinish === '冠军' ? 'gold' : ''}>{t.myFinish}</b>)}
                  </span>
                  <span class="n">
                    {t && (
                      <button
                        type="button"
                        class="chip"
                        onClick={() => {
                          ui.sub.games = 'bracket';
                          ui.sub.gamesTour = k;
                          refresh();
                        }}
                      >
                        对阵
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <div class="small dim mt6">晋级规则：夏季县大会冠军 → 甲子园；秋季县大会前几名 → 地区大会 → 冠军去明治神宫大会，地区大会成绩好的学校 1 月入选春季选拔。</div>
        </div>
      )}
      {sub === 'bracket' && (
        <div>
          <div class="btnrow mb6">
            {tours.map((t) => (
              <button type="button" key={t.kind} class={`chip ${t.kind === selKind ? 'on' : ''}`} onClick={() => setSub('gamesTour', t.kind)}>
                {t.name}
              </button>
            ))}
          </div>
          {sel ? <Bracket t={sel} /> : <Empty>今年还没有大会开幕。</Empty>}
        </div>
      )}
      {sub === 'results' && (
        <div>
          {G.games.length ? (
            <div class="glist">
              {G.games.map((g) => (
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
                    {g.inn !== 9 && <small class="dim">{g.called ? '（提前结束）' : `（${g.inn} 局）`}</small>}
                  </span>
                  <b class="n">
                    {g.my}-{g.opp}
                  </b>
                </div>
              ))}
            </div>
          ) : (
            <Empty>还没有比赛记录。</Empty>
          )}
        </div>
      )}
    </div>
  );
}
