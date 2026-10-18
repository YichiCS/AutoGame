import type { AttrKey, DevPlan, Player, Pos } from '../../core/types';
import { POSITIONS, POS_SHORT, POS_NAME, EXP_KINDS } from '../../core/types';
import { G } from '../../core/state';
import {
  ATTR_DESC, ATTR_NAME, EXP_NAME, GROWTH_NAME, PERS_DESC, PERS_NAME, WISH_NAME, avgOf, eraOf, fullName, has, ipStr, isPitcher, obpOf, overall, slgOf, stars, velScore,
} from '../../core/attrs';
import { rate3 } from '../../core/util';
import { learnNeed, maxPitchCount, maxPitchLv } from '../../core/growth';
import { PITCH_DEFS, type PitchDir } from '../../data/pitches';
import { TRAIT_BY_ID } from '../../data/traits';
import { dateStr } from '../../core/calendar';
import { Bar, Btn, Cond, Fatigue, Grade, Letter, Morale, Panel, Portrait, Stars } from '../components/common';
import { refresh, ui } from '../store';

/** 慧眼够高（或有影像分析室）才看得到潜力和能力上限 */
export function insightLevel(): number {
  return G.mgr.skills.insight + G.facilities.analysis * 6;
}

const BAT_KEYS: AttrKey[] = ['contact', 'power', 'eye', 'speed', 'arm', 'fielding', 'catching', 'bunt', 'baserun'];
const PIT_KEYS: AttrKey[] = ['control', 'stamina', 'stuff'];

function AttrRow(p: { pl: Player; k: AttrKey }) {
  const { pl, k } = p;
  const showCap = insightLevel() >= 62;
  const v = pl.a[k];
  const cap = pl.caps[k];
  if (k === 'velocity') {
    const vs = velScore(v);
    return (
      <div class="arow" title={ATTR_DESC[k]}>
        <span class="an">{ATTR_NAME[k]}</span>
        <span class="av">
          <Letter v={vs} /> <b>{Math.round(v)}</b>
        </span>
        <Bar v={vs} mark={showCap ? velScore(cap) : undefined} color="var(--accent2)" />
        <small class="dim">{showCap ? `km/h · 上限 ${Math.round(cap)}` : 'km/h'}</small>
      </div>
    );
  }
  return (
    <div class="arow" title={ATTR_DESC[k]}>
      <span class="an">{ATTR_NAME[k]}</span>
      <span class="av">
        <Grade v={v} />
      </span>
      <Bar v={v} mark={showCap ? cap : undefined} />
      {showCap && <small class="dim">{Math.round(cap)}</small>}
    </div>
  );
}

const DIR_LABEL: Record<PitchDir, string> = { L: '←', DL: '↙', D: '↓', DR: '↘', R: '→', X: '？' };

/** 变化球表：按变化方向排开（左投手左右对调） */
export function PitchChart(p: { pl: Player }) {
  const pl = p.pl;
  const flip = pl.throws === 'L';
  const cell = (dir: PitchDir) => {
    const d: PitchDir = flip ? (({ L: 'R', R: 'L', DL: 'DR', DR: 'DL' } as Record<string, PitchDir>)[dir] ?? dir) : dir;
    const ps = pl.pitches.filter((x) => PITCH_DEFS[x.type].dir === d);
    return (
      <div class={`pcell ${ps.length ? 'has' : ''}`}>
        <span class="pdir">{DIR_LABEL[dir]}</span>
        {ps.map((x) => (
          <div key={x.type} class={`pitem ${x.sig ? 'sig' : ''}`} title={`${PITCH_DEFS[x.type].name}：${PITCH_DEFS[x.type].desc}`}>
            <span>{x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}</span>
            <span class="lv">{'●'.repeat(x.lv)}<span class="dim">{'●'.repeat(Math.max(0, 7 - x.lv))}</span></span>
          </div>
        ))}
      </div>
    );
  };
  const knuckle = pl.pitches.filter((x) => PITCH_DEFS[x.type].dir === 'X');
  return (
    <div class="pchart">
      <div class="prow">
        {cell('L')}
        <div class="pcell fb">
          <span class="pdir">直球</span>
          <b>{Math.round(pl.a.velocity)}</b>
          <small>km/h</small>
        </div>
        {cell('R')}
      </div>
      <div class="prow">
        {cell('DL')}
        {cell('D')}
        {cell('DR')}
      </div>
      {knuckle.length > 0 && (
        <div class="prow">
          <div class="pcell has wide">
            <span class="pdir">？</span>
            {knuckle.map((x) => (
              <div key={x.type} class="pitem">
                <span>{x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}</span>
                <span class="lv">{'●'.repeat(x.lv)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="small dim mt4">
        球种 {pl.pitches.length} / {maxPitchCount(pl)} · 变化等级上限 {maxPitchLv(pl)} · {flip ? '左投' : '右投'}{' '}
        {pl.delivery === 'over' ? '上手' : pl.delivery === 'three' ? '四分之三' : pl.delivery === 'side' ? '侧投' : '下勾'}
      </div>
      {pl.learning && (
        <div class="small mt4">
          正在练习：<b>{PITCH_DEFS[pl.learning.pitch].name}</b>{' '}
          <Bar v={pl.learning.progress} max={learnNeed(pl.learning.pitch)} w={80} color="var(--blue)" /> {Math.round((pl.learning.progress / learnNeed(pl.learning.pitch)) * 100)}%
        </div>
      )}
    </div>
  );
}

const PLAN_BAT: [DevPlan, string][] = [['auto', '自动'], ['balanced', '均衡'], ['contact', '巧打'], ['power', '长打'], ['speed', '速度'], ['defense', '守备']];
const PLAN_PIT: [DevPlan, string][] = [['auto', '自动'], ['balanced', '均衡'], ['pit_velo', '球速'], ['pit_ctrl', '控球'], ['pit_brk', '变化球'], ['pit_stam', '耐力']];

function aptMark(v: number | undefined): string {
  if (!v || v < 25) return '—';
  if (v >= 80) return '◎';
  if (v >= 60) return '○';
  if (v >= 40) return '△';
  return '▽';
}

function StatTables(p: { pl: Player }) {
  const s = p.pl.stats;
  const rows: [string, typeof s.season][] = [['本赛季', s.season], ['高中通算', s.career], ['甲子园', s.koshien]];
  const pit = isPitcher(p.pl);
  return (
    <table class="stbl">
      <thead>
        {pit ? (
          <tr><th /><th>场</th><th>胜</th><th>负</th><th>局数</th><th>防御率</th><th>三振</th><th>四坏</th></tr>
        ) : (
          <tr><th /><th>场</th><th>打率</th><th>安打</th><th>本垒打</th><th>打点</th><th>盗垒</th><th>OPS</th></tr>
        )}
      </thead>
      <tbody>
        {rows.map(([name, b]) =>
          pit ? (
            <tr key={name}><td>{name}</td><td>{b.pit.g}</td><td>{b.pit.w}</td><td>{b.pit.l}</td><td>{ipStr(b.pit.outs)}</td><td>{b.pit.outs ? eraOf(b.pit).toFixed(2) : '-'}</td><td>{b.pit.so}</td><td>{b.pit.bb}</td></tr>
          ) : (
            <tr key={name}><td>{name}</td><td>{b.bat.g}</td><td>{b.bat.ab ? rate3(avgOf(b.bat)) : '-'}</td><td>{b.bat.h}</td><td>{b.bat.hr}</td><td>{b.bat.rbi}</td><td>{b.bat.sb}</td><td>{b.bat.ab ? rate3(obpOf(b.bat) + slgOf(b.bat)) : '-'}</td></tr>
          ),
        )}
      </tbody>
    </table>
  );
}

export function PlayerDetail(p: { pl: Player; onBack?: () => void }) {
  const pl = p.pl;
  const pit = isPitcher(pl);
  const ins = insightLevel();
  const potStars = ins >= 45 ? stars(pl.pot) : null;
  const tags: string[] = [];
  if (G.club.captainId === pl.id) tags.push('主将');
  if (pl.joined === 'scholar') tags.push('特待生');
  if (pl.joined === 'gem') tags.push('璞玉');
  if (pl.joined === 'transfer') tags.push('转学生');
  if (pl.retired) tags.push('已引退');
  if (pl.grade === 0) tags.push('内定新生');
  if (pl.benched > 0) tags.push(`停赛 ${pl.benched} 天`);
  const plans = pit ? PLAN_PIT : PLAN_BAT;
  return (
    <div class="pdetail">
      {p.onBack && (
        <Btn small onClick={p.onBack}>
          ◀ 返回名单
        </Btn>
      )}
      <div class="phead">
        <Portrait player={pl} size="big" />
        <div class="grow">
          <div class="pname">
            {fullName(pl)}
            {tags.map((t) => (
              <span key={t} class="tag">{t}</span>
            ))}
          </div>
          <div class="dim">
            {pl.grade ? `${pl.grade} 年级` : '中学三年级'} · {POS_NAME[pl.pos]} · {pl.throws === 'R' ? '右投' : '左投'}{pl.bats === 'R' ? '右打' : pl.bats === 'L' ? '左打' : '左右开弓'} · {pl.height} cm
            {pl.middle ? ` · 出身 ${pl.middle}` : ''}
          </div>
          <div class="mt4">
            综合 <Grade v={overall(pl)} /> · 潜力 <Stars n={potStars} /> · <span title={PERS_DESC[pl.pers]}>{PERS_NAME[pl.pers]}</span> · {GROWTH_NAME[pl.growth]} · 志愿：{WISH_NAME[pl.wish]}
            {pl.draft && <span class="gold"> · {pl.draft.team} {pl.draft.round ? `${pl.draft.round} 位` : '育成'}指名</span>}
          </div>
        </div>
      </div>
      <div class="pstatus">
        <span>调子 <Cond v={pl.cond} text /></span>
        <span>疲劳 <Fatigue v={pl.fatigue} w={56} /></span>
        <span>干劲 <Morale v={pl.morale} w={56} /></span>
        <span>信赖 <Bar v={pl.trust} w={56} color="var(--blue)" /></span>
        <span>学力 <Bar v={pl.academics} w={56} color="var(--muted)" /></span>
        {pl.injury && <span class="bad">伤：{pl.injury.name}（还要 {Math.ceil(pl.injury.days)} 天）</span>}
      </div>

      {pit && (
        <Panel title="投手能力">
          <AttrRow pl={pl} k="velocity" />
          {PIT_KEYS.map((k) => <AttrRow key={k} pl={pl} k={k} />)}
          <PitchChart pl={pl} />
        </Panel>
      )}
      <Panel title={pit ? '打击与守备' : '野手能力'} right={<span class="small">弹道 {'↗'.repeat(pl.traj)}<span class="dim">{'↗'.repeat(4 - pl.traj)}</span></span>}>
        {BAT_KEYS.map((k) => <AttrRow key={k} pl={pl} k={k} />)}
        <AttrRow pl={pl} k="mental" />
        <AttrRow pl={pl} k="durability" />
        {insightLevel() < 62 && <div class="small dim mt4">提升「慧眼」或升级影像分析室，就能看到能力上限（竖线）。</div>}
      </Panel>

      <Panel title="特殊能力">
        {pl.traits.length ? (
          <div class="traits">
            {pl.traits.map((id) => {
              const t = TRAIT_BY_ID[id];
              return (
                <span key={id} class={`trait ${t?.good ? 'good' : 'badt'} ${id === 'monster' ? 'gold' : ''}`} title={t?.desc}>
                  {t?.name ?? id}
                </span>
              );
            })}
          </div>
        ) : (
          <div class="dim small">还没有特殊能力。训练、比赛和事件中都有机会获得。</div>
        )}
      </Panel>

      <Panel title="守备适性">
        <div class="apt">
          {POSITIONS.map((pos: Pos) => (
            <span key={pos} class={pos === pl.pos ? 'on' : ''} title={`${POS_NAME[pos]}：${Math.round(pl.apt[pos] ?? 0)}`}>
              <small>{POS_SHORT[pos]}</small>
              {aptMark(pl.apt[pos])}
            </span>
          ))}
        </div>
      </Panel>

      {pl.grade >= 1 && !pl.retired && (
        <Panel title="培养方针">
          <div class="row wrap gap4">
            {plans.map(([id, name]) => (
              <Btn
                key={id}
                small
                on={pl.plan === id}
                onClick={() => {
                  pl.plan = id;
                  refresh();
                }}
              >
                {name}
              </Btn>
            ))}
          </div>
          <div class="small dim mt4">
            经验：{EXP_KINDS.map((k) => `${EXP_NAME[k]} ${Math.floor(pl.exp[k])}`).join(' · ')}
          </div>
        </Panel>
      )}

      <Panel title="成绩">
        <StatTables pl={pl} />
      </Panel>

      {pl.notes.length > 0 && (
        <Panel title="个人档案">
          <ul class="notes">
            {pl.notes
              .slice()
              .reverse()
              .slice(0, 12)
              .map((n, i) => (
                <li key={i}>
                  <span class="dim">{dateStr(n.d, G.startYear)}</span> {n.t}
                </li>
              ))}
          </ul>
        </Panel>
      )}
      {has(pl, 'monster') && <div class="small gold mt4">「怪物」：百年一遇的天才。</div>}
    </div>
  );
}

export function closePlayer(): void {
  ui.playerId = null;
  refresh();
}

