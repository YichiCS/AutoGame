import { useState } from 'preact/hooks';
import type { Player } from '../../core/types';
import { POS_ABBR } from '../../core/types';
import { G, myPlayers } from '../../core/state';
import { DataTable, Grade, Portrait, Cond, Fatigue, Morale, Tabs, type Col } from '../components/common';
import { overall, isPitcher, fullName, pitcherOverall, batterOffense, breakingScore, avgOf, obpOf, slgOf, eraOf, ipStr } from '../../core/attrs';
import { openPlayer } from '../store';
import { PITCH_DEFS } from '../../data/traits';

type Filter = 'all' | 'bat' | 'pit' | 'g1' | 'g2' | 'g3' | 'retired' | 'stats';

export function statusText(p: Player): { text: string; cls: string } {
  if (p.injury) return { text: `伤(${p.injury.weeks}周)`, cls: 'bad' };
  if (p.retired) return { text: '已引退', cls: 'dim' };
  if (p.supplementary > 0) return { text: '补习', cls: 'warn' };
  if (p.ineligibleUntil > G.absWeek) return { text: '转学禁赛', cls: 'warn' };
  if (p.fatigue >= 70) return { text: '疲劳', cls: 'warn' };
  return { text: '正常', cls: 'muted' };
}

export function Roster() {
  const [f, setF] = useState<Filter>('all');
  const all = myPlayers();
  const rows = all.filter((p) => {
    if (f === 'retired') return p.retired;
    if (p.retired) return false;
    if (f === 'bat') return !isPitcher(p);
    if (f === 'pit') return isPitcher(p);
    if (f === 'g1') return p.grade === 1;
    if (f === 'g2') return p.grade === 2;
    if (f === 'g3') return p.grade === 3;
    return true;
  });
  const showPit = f === 'pit';
  const base: Col<Player>[] = [
    { key: 'face', label: '', render: (p) => <Portrait player={p} size="sm" /> },
    { key: 'name', label: '姓名', render: (p) => <span class={G.club.captainId === p.id ? 'accent' : ''}>{fullName(p)}{G.club.captainId === p.id ? ' (主将)' : ''}</span>, sort: (p) => p.fam },
    { key: 'grade', label: '年', render: (p) => p.grade, sort: (p) => p.grade, num: true },
    { key: 'pos', label: '位置', render: (p) => POS_ABBR[p.pos], sort: (p) => 'PC1234SLCR'.indexOf(p.pos[0]) },
    { key: 'hand', label: '投打', render: (p) => `${p.throws === 'L' ? '左' : '右'}投${p.bats === 'S' ? '两' : p.bats === 'L' ? '左' : '右'}打` },
    { key: 'ov', label: '综合', render: (p) => <Grade v={overall(p)} />, sort: overall, num: true },
  ];
  const batCols: Col<Player>[] = [
    { key: 'con', label: '击球', render: (p) => <Grade v={p.a.contact} />, sort: (p) => p.a.contact },
    { key: 'pow', label: '力量', render: (p) => <Grade v={p.a.power} />, sort: (p) => p.a.power },
    { key: 'eye', label: '选球', render: (p) => <Grade v={p.a.eye} />, sort: (p) => p.a.eye },
    { key: 'spd', label: '跑速', render: (p) => <Grade v={p.a.speed} />, sort: (p) => p.a.speed },
    { key: 'arm', label: '肩力', render: (p) => <Grade v={p.a.arm} />, sort: (p) => p.a.arm },
    { key: 'fld', label: '守备', render: (p) => <Grade v={p.a.fielding} />, sort: (p) => p.a.fielding },
    { key: 'cat', label: '捕球', render: (p) => <Grade v={p.a.catching} />, sort: (p) => p.a.catching },
  ];
  const pitCols: Col<Player>[] = [
    { key: 'vel', label: '球速', render: (p) => `${Math.round(p.a.velocity)}km`, sort: (p) => p.a.velocity, num: true },
    { key: 'ctl', label: '控球', render: (p) => <Grade v={p.a.control} />, sort: (p) => p.a.control },
    { key: 'sta', label: '耐力', render: (p) => <Grade v={p.a.stamina} />, sort: (p) => p.a.stamina },
    { key: 'stf', label: '球威', render: (p) => <Grade v={p.a.stuff} />, sort: (p) => p.a.stuff },
    { key: 'brk', label: '变化球', render: (p) => <span class="small">{p.pitches.map((x) => `${PITCH_DEFS[x.type].short}${x.lv}`).join(' ') || '-'}</span>, sort: (p) => breakingScore(p.pitches) },
  ];
  const mixedCols: Col<Player>[] = [
    { key: 'main', label: '主要能力', render: (p) => isPitcher(p)
      ? <span class="small">{Math.round(p.a.velocity)}km 控<Grade v={p.a.control} showV={false} /> 耐<Grade v={p.a.stamina} showV={false} /> {p.pitches.map((x) => `${PITCH_DEFS[x.type].short}${x.lv}`).join('')}</span>
      : <span class="small">击<Grade v={p.a.contact} showV={false} /> 力<Grade v={p.a.power} showV={false} /> 速<Grade v={p.a.speed} showV={false} /> 肩<Grade v={p.a.arm} showV={false} /> 守<Grade v={p.a.fielding} showV={false} /></span>,
      sort: (p) => (isPitcher(p) ? pitcherOverall(p) : batterOffense(p)) },
  ];
  const tail: Col<Player>[] = [
    { key: 'cond', label: '调子', render: (p) => <Cond v={p.cond} />, sort: (p) => p.cond },
    { key: 'fat', label: '疲劳', render: (p) => <Fatigue v={p.fatigue} />, sort: (p) => p.fatigue },
    { key: 'mor', label: '干劲', render: (p) => <Morale v={p.morale} />, sort: (p) => p.morale },
    { key: 'st', label: '状态', render: (p) => { const s = statusText(p); return <span class={s.cls}>{s.text}</span>; } },
  ];
  const statCols: Col<Player>[] = [
    { key: 'g', label: '试合', render: (p) => p.stats.season.bat.g, sort: (p) => p.stats.season.bat.g, num: true },
    { key: 'avg', label: '打率', render: (p) => (p.stats.season.bat.ab ? avgOf(p.stats.season.bat).toFixed(3).replace(/^0/, '') : '-'), sort: (p) => avgOf(p.stats.season.bat), num: true },
    { key: 'hr', label: '本垒打', render: (p) => p.stats.season.bat.hr, sort: (p) => p.stats.season.bat.hr, num: true },
    { key: 'rbi', label: '打点', render: (p) => p.stats.season.bat.rbi, sort: (p) => p.stats.season.bat.rbi, num: true },
    { key: 'sb', label: '盗垒', render: (p) => p.stats.season.bat.sb, sort: (p) => p.stats.season.bat.sb, num: true },
    { key: 'ops', label: 'OPS', render: (p) => (p.stats.season.bat.ab ? (obpOf(p.stats.season.bat) + slgOf(p.stats.season.bat)).toFixed(3).replace(/^0/, '') : '-'), sort: (p) => obpOf(p.stats.season.bat) + slgOf(p.stats.season.bat), num: true },
    { key: 'ip', label: '投球局', render: (p) => (p.stats.season.pit.outs ? ipStr(p.stats.season.pit.outs) : '-'), sort: (p) => p.stats.season.pit.outs, num: true },
    { key: 'wl', label: '胜-败', render: (p) => (p.stats.season.pit.g ? `${p.stats.season.pit.w}-${p.stats.season.pit.l}` : '-'), sort: (p) => p.stats.season.pit.w, num: true },
    { key: 'era', label: '防御率', render: (p) => (p.stats.season.pit.outs ? eraOf(p.stats.season.pit).toFixed(2) : '-'), sort: (p) => (p.stats.season.pit.outs ? -eraOf(p.stats.season.pit) : -99), num: true },
    { key: 'so', label: '三振', render: (p) => p.stats.season.pit.so, sort: (p) => p.stats.season.pit.so, num: true },
  ];
  const cols = f === 'stats' ? [...base, ...statCols] : [...base, ...(f === 'bat' ? batCols : showPit ? pitCols : mixedCols), ...tail];
  return (
    <div class="col">
      <div class="page-title">
        球队名单
        <span class="sub">
          部员 {all.filter((p) => !p.retired).length} 人（投手 {all.filter((p) => !p.retired && isPitcher(p)).length}）
        </span>
      </div>
      <Tabs
        value={f}
        onChange={setF}
        tabs={[
          { id: 'all', label: '全员' },
          { id: 'bat', label: '野手' },
          { id: 'pit', label: '投手' },
          { id: 'g3', label: '3年级' },
          { id: 'g2', label: '2年级' },
          { id: 'g1', label: '1年级' },
          { id: 'retired', label: '引退' },
          { id: 'stats', label: '本季成绩' },
        ]}
      />
      <DataTable rows={rows} cols={cols} rowKey={(p) => p.id} onRow={(p) => openPlayer(p.id, 'roster')} initialSort="ov" rowClass={(p) => (p.injury ? 'dim' : '')} />
      <div class="small dim">点击球员查看详细能力、加点、学习特殊能力与设置个别练习。</div>
    </div>
  );
}
