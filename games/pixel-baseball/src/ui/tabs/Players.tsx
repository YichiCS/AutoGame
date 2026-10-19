import type { Player } from '../../core/types';
import { POS_ABBR, POSITIONS } from '../../core/types';
import { G, myPlayers, seniors } from '../../core/state';
import { batterOffense, fieldAt, fullName, isPitcher, overall, pitcherOverall } from '../../core/attrs';
import { PITCH_DEFS } from '../../data/pitches';
import { strengthOf, strengthLetter } from '../../core/team';
import { Cond, Empty, Fatigue, Gain, Num, Ovr, Portrait, SubTabs, recentGain } from '../components/common';
import { refresh, setSub, ui } from '../store';
import { PlayerDetail } from './PlayerDetail';
import { prospectBrief } from '../../core/recruit';

type Sub = 'all' | 'pit' | 'bat' | 'hurt' | 'other';
type Sort = 'ovr' | 'grade' | 'pos' | 'fatigue';

/** 能力格：「控 36」（名字 + 按档位上色的数字），固定宽度 */
function Cell(p: { k: string; v: number }) {
  return (
    <span class="sc">
      <i>{p.k}</i>
      <Num v={p.v} />
    </span>
  );
}

function openRow(pl: Player): void {
  ui.playerId = pl.id;
  refresh();
}

/** 名单的一行（两行高）：照片 | 名字、标签 / 主要能力 | 年级 / 调子 | 位置 / 疲劳 | 总评 */
function PlayerRow(p: { pl: Player }) {
  const pl = p.pl;
  const pit = isPitcher(pl);
  const gain = recentGain(pl);
  return (
    <div class={`plr ${pl.injury ? 'hurt' : ''}`} role="button" tabIndex={0} onClick={() => openRow(pl)} onKeyDown={(e) => e.key === 'Enter' && openRow(pl)}>
      <Portrait player={pl} size="sm" />
      <span class="nm">
        <b>{fullName(pl)}</b>
        {G.club.captainId === pl.id && <span class="tag">主将</span>}
        {pl.injury && <span class="tag bad">伤</span>}
        {pl.benched > 0 && <span class="tag">停</span>}
        {pl.learning && <span class="tag blue">学{PITCH_DEFS[pl.learning.pitch].short}</span>}
        {gain > 0 && <Gain n={gain} />}
      </span>
      <span class="gr">{pl.grade ? `${pl.grade}年` : '新生'}</span>
      <span class="ps">{POS_ABBR[pl.pos]}</span>
      <span class="ov">
        <Ovr v={overall(pl)} big />
      </span>
      <span class="st">
        {pit ? (
          <>
            <span class="sc kmh">
              <b>{Math.round(pl.a.velocity)}</b>
              <i>km</i>
            </span>
            <Cell k="控" v={pl.a.control} />
            <Cell k="耐" v={pl.a.stamina} />
            <Cell k="威" v={pl.a.stuff} />
            <span class="sc pits">{pl.pitches.map((x) => (x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].short) + x.lv).join(' ') || '只有直球'}</span>
          </>
        ) : (
          <>
            <Cell k="击" v={pl.a.contact} />
            <Cell k="力" v={pl.a.power} />
            <Cell k="速" v={pl.a.speed} />
            <Cell k="肩" v={pl.a.arm} />
            <Cell k="守" v={pl.a.fielding} />
          </>
        )}
      </span>
      <span class="cd">
        <Cond v={pl.cond} />
      </span>
      <span class="ft">
        <Fatigue v={pl.fatigue} />
      </span>
    </div>
  );
}

/** 表头：和每一行一样分成两行，每一列都有名字 */
function ListHead() {
  return (
    <div class="plr head" aria-hidden="true">
      <span class="pic" />
      <span class="nm">球员</span>
      <span class="gr">年级</span>
      <span class="ps">位置</span>
      <span class="ov">总评</span>
      <span class="st">主要能力</span>
      <span class="cd">调子</span>
      <span class="ft">疲劳</span>
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
  list = list.slice().sort((a, b) => {
    if (sort === 'grade') return b.grade - a.grade || overall(b) - overall(a);
    if (sort === 'pos') return POSITIONS.indexOf(a.pos) - POSITIONS.indexOf(b.pos) || overall(b) - overall(a);
    if (sort === 'fatigue') return b.fatigue - a.fatigue || overall(b) - overall(a);
    return overall(b) - overall(a);
  });
  const st = strengthOf(all, G.dh);
  const pitchers = all.filter(isPitcher);
  return (
    <div>
      <div class="stick">
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
          <div class="sortbar">
            <span class="dim">排序</span>
            {([['ovr', '总评'], ['grade', '年级'], ['pos', '位置'], ['fatigue', '疲劳']] as [Sort, string][]).map(([id, n]) => (
              <button type="button" key={id} class={`chip ${sort === id ? 'on' : ''}`} onClick={() => setSub('playersSort', id)}>
                {n}
              </button>
            ))}
            <span class="grow" />
            <span class="dim small nowrap">
              打 {strengthLetter(st.off)} · 投 {strengthLetter(st.pit)} · 守 {strengthLetter(st.def)}
            </span>
          </div>
        )}
        {sub !== 'other' && list.length > 0 && <ListHead />}
      </div>
      {sub !== 'other' && (list.length ? <div class="plist">{list.map((pl) => <PlayerRow key={pl.id} pl={pl} />)}</div> : <Empty>这里没有人。</Empty>)}
      {sub === 'other' && <Others />}
    </div>
  );
}

function Others() {
  const sen = seniors().sort((a, b) => overall(b) - overall(a));
  const inc = G.incoming.map((id) => G.players[id]).filter(Boolean);
  return (
    <div>
      <div class="sect">已引退的三年级（{sen.length}）</div>
      {sen.length ? (
        <div class="plist">
          <ListHead />
          {sen.map((pl) => (
            <PlayerRow key={pl.id} pl={pl} />
          ))}
        </div>
      ) : (
        <Empty>还没有人引退。</Empty>
      )}
      <div class="sect">明年 4 月入部的新生（{inc.length}）</div>
      {inc.length ? (
        <div class="plist">
          {inc.map((pl) => (
            <div key={pl.id} class="plr prospect" role="button" tabIndex={0} onClick={() => openRow(pl)} onKeyDown={(e) => e.key === 'Enter' && openRow(pl)}>
              <Portrait player={pl} size="sm" />
              <span class="nm">
                <b>{fullName(pl)}</b>
                {pl.joined === 'scholar' && <span class="tag">特待生</span>}
                {pl.joined === 'gem' && <span class="tag">璞玉</span>}
              </span>
              <span class="gr">新生</span>
              <span class="ps">{POS_ABBR[pl.pos]}</span>
              <span class="ov">
                <Ovr v={overall(pl)} big />
              </span>
              <span class="st brief dim">{prospectBrief(pl)}</span>
            </div>
          ))}
        </div>
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
