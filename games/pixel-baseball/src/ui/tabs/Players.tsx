import type { Player } from '../../core/types';
import { POS_SHORT } from '../../core/types';
import { G, myPlayers, seniors } from '../../core/state';
import { batterOffense, fieldAt, fullName, isPitcher, overall, pitcherOverall } from '../../core/attrs';
import { PITCH_DEFS } from '../../data/pitches';
import { strengthOf, strengthLetter } from '../../core/team';
import { Cond, Empty, Fatigue, Grade, Letter, Portrait, SubTabs } from '../components/common';
import { refresh, setSub, ui } from '../store';
import { PlayerDetail } from './PlayerDetail';
import { prospectBrief } from '../../core/recruit';

type Sub = 'all' | 'pit' | 'bat' | 'hurt' | 'other';
type Sort = 'ovr' | 'grade' | 'pos' | 'fatigue';

function PlayerRow(p: { pl: Player }) {
  const pl = p.pl;
  const pit = isPitcher(pl);
  return (
    <div
      class={`prow-item ${pl.injury ? 'hurt' : ''}`}
      onClick={() => {
        ui.playerId = pl.id;
        refresh();
      }}
    >
      <Portrait player={pl} size="sm" />
      <div class="pmain">
        <div class="pline">
          <b>{fullName(pl)}</b>
          <span class="dim">{pl.grade ? `${pl.grade}年` : '新生'}</span>
          <span class="pos">{POS_SHORT[pl.pos]}</span>
          {G.club.captainId === pl.id && <span class="tag">主将</span>}
          {pl.injury && <span class="tag bad">伤</span>}
          {pl.benched > 0 && <span class="tag">停</span>}
          {pl.learning && <span class="tag blue">学{PITCH_DEFS[pl.learning.pitch].short}</span>}
        </div>
        <div class="pline small">
          {pit ? (
            <>
              <span class="kmh">{Math.round(pl.a.velocity)}km</span>
              <span>控<Letter v={pl.a.control} /></span>
              <span>耐<Letter v={pl.a.stamina} /></span>
              <span>威<Letter v={pl.a.stuff} /></span>
              <span class="pits">{pl.pitches.map((x) => (x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].short) + x.lv).join(' ')}</span>
            </>
          ) : (
            <>
              <span>弹{pl.traj}</span>
              <span>击<Letter v={pl.a.contact} /></span>
              <span>力<Letter v={pl.a.power} /></span>
              <span>速<Letter v={pl.a.speed} /></span>
              <span>肩<Letter v={pl.a.arm} /></span>
              <span>守<Letter v={pl.a.fielding} /></span>
            </>
          )}
        </div>
      </div>
      <div class="pside">
        <Grade v={overall(pl)} />
        <div class="row gap4">
          <Cond v={pl.cond} />
          <Fatigue v={pl.fatigue} w={30} />
        </div>
      </div>
    </div>
  );
}

export function Players() {
  const sel = ui.playerId !== null ? G.players[ui.playerId] : null;
  if (sel) return <PlayerDetail pl={sel} onBack={() => { ui.playerId = null; refresh(); }} />;
  const sub = (ui.sub.players as Sub) ?? 'all';
  const sort = (ui.sub.playersSort as Sort) ?? 'ovr';
  const all = myPlayers();
  let list: Player[];
  switch (sub) {
    case 'pit':
      list = all.filter(isPitcher);
      break;
    case 'bat':
      list = all.filter((p) => !isPitcher(p));
      break;
    case 'hurt':
      list = all.filter((p) => p.injury || p.benched > 0);
      break;
    case 'other':
      list = [];
      break;
    default:
      list = all;
  }
  const order = ['P', 'C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];
  list = list.slice().sort((a, b) => {
    if (sort === 'grade') return b.grade - a.grade || overall(b) - overall(a);
    if (sort === 'pos') return order.indexOf(a.pos) - order.indexOf(b.pos) || overall(b) - overall(a);
    if (sort === 'fatigue') return b.fatigue - a.fatigue;
    return overall(b) - overall(a);
  });
  const st = strengthOf(all, G.dh);
  const pitchers = all.filter(isPitcher);
  return (
    <div>
      <SubTabs
        value={sub}
        onChange={(v) => setSub('players', v)}
        tabs={[
          { id: 'all', label: `全部 ${all.length}` },
          { id: 'pit', label: `投手 ${pitchers.length}` },
          { id: 'bat', label: `野手 ${all.length - pitchers.length}` },
          { id: 'hurt', label: `伤病 ${all.filter((p) => p.injury || p.benched > 0).length}` },
          { id: 'other', label: '引退 / 新生' },
        ]}
      />
      {sub !== 'other' && (
        <>
          <div class="row wrap gap4 small mb6">
            <span class="dim">排序：</span>
            {([['ovr', '综合'], ['grade', '年级'], ['pos', '位置'], ['fatigue', '疲劳']] as [Sort, string][]).map(([id, n]) => (
              <button type="button" key={id} class={`chip ${sort === id ? 'on' : ''}`} onClick={() => setSub('playersSort', id)}>
                {n}
              </button>
            ))}
            <span class="grow" />
            <span class="dim">
              打 {strengthLetter(st.off)} · 投 {strengthLetter(st.pit)} · 守 {strengthLetter(st.def)}
            </span>
          </div>
          {list.length ? list.map((pl) => <PlayerRow key={pl.id} pl={pl} />) : <Empty>这里没有人。</Empty>}
        </>
      )}
      {sub === 'other' && <Others />}
    </div>
  );
}

function Others() {
  const sen = seniors();
  const inc = G.incoming.map((id) => G.players[id]).filter(Boolean);
  return (
    <div>
      <div class="sect">已引退的三年级（{sen.length}）</div>
      {sen.length ? sen.map((pl) => <PlayerRow key={pl.id} pl={pl} />) : <Empty>还没有人引退。</Empty>}
      <div class="sect">明年 4 月入部的新生（{inc.length}）</div>
      {inc.length ? (
        inc.map((pl) => (
          <div key={pl.id} class="prow-item" onClick={() => { ui.playerId = pl.id; refresh(); }}>
            <Portrait player={pl} size="sm" />
            <div class="pmain">
              <div class="pline">
                <b>{fullName(pl)}</b>
                {pl.joined === 'scholar' && <span class="tag">特待生</span>}
                {pl.joined === 'gem' && <span class="tag">璞玉</span>}
              </div>
              <div class="pline small dim">{prospectBrief(pl)}</div>
            </div>
          </div>
        ))
      ) : (
        <Empty>新生名单要到 2 月才确定（特待生会提前内定）。</Empty>
      )}
    </div>
  );
}

/** 一句话：投手 / 野手的主要价值（概览用） */
export function valueLine(p: Player): string {
  if (isPitcher(p)) return `${Math.round(p.a.velocity)}km/h · ${p.pitches.length} 种变化球 · 投 ${Math.round(pitcherOverall(p))}`;
  return `打 ${Math.round(batterOffense(p))} · 守 ${Math.round(fieldAt(p, p.pos))}`;
}

