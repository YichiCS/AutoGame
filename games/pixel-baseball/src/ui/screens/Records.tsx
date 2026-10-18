import { useState } from 'preact/hooks';
import { G, mySchool } from '../../core/state';
import { Panel, Tabs, Empty, Emblem } from '../components/common';
import { POS_NAME } from '../../core/types';
import { PREFS } from '../../data/prefectures';
import { sortBy } from '../../core/util';
import type { Player } from '../../core/types';
import { avgOf, eraOf, fullName, ipStr } from '../../core/attrs';
import { openPlayer } from '../store';

interface Board {
  title: string;
  rows: Player[];
  value: (p: Player) => string;
}

/** 本县个人成绩排行（本季公式战） */
function Leaders() {
  const me = mySchool();
  const pool = Object.values(G.players).filter((p) => p.grade >= 1 && p.grade <= 3 && G.schools[p.schoolId]?.prefId === me.prefId);
  const top = (list: Player[], key: (p: Player) => number, asc = false) => sortBy(list.slice(), key, !asc).slice(0, 10);
  const batters = pool.filter((p) => p.stats.season.bat.ab >= 20);
  const pitchers = pool.filter((p) => p.stats.season.pit.outs >= 36);
  const boards: Board[] = [
    { title: '打率', rows: top(batters, (p) => avgOf(p.stats.season.bat)), value: (p) => avgOf(p.stats.season.bat).toFixed(3).replace(/^0/, '') },
    { title: '本垒打', rows: top(pool.filter((p) => p.stats.season.bat.hr > 0), (p) => p.stats.season.bat.hr), value: (p) => String(p.stats.season.bat.hr) },
    { title: '打点', rows: top(pool.filter((p) => p.stats.season.bat.rbi > 0), (p) => p.stats.season.bat.rbi), value: (p) => String(p.stats.season.bat.rbi) },
    { title: '盗垒', rows: top(pool.filter((p) => p.stats.season.bat.sb > 0), (p) => p.stats.season.bat.sb), value: (p) => String(p.stats.season.bat.sb) },
    { title: '防御率', rows: top(pitchers, (p) => eraOf(p.stats.season.pit), true), value: (p) => `${eraOf(p.stats.season.pit).toFixed(2)}（${ipStr(p.stats.season.pit.outs)}局）` },
    { title: '三振', rows: top(pool.filter((p) => p.stats.season.pit.so > 0), (p) => p.stats.season.pit.so), value: (p) => String(p.stats.season.pit.so) },
  ];
  return (
    <div class="grid3">
      {boards.map((b) => (
        <Panel key={b.title} title={b.title}>
          {b.rows.length ? (
            b.rows.map((p, i) => (
              <div
                key={p.id}
                class={`row small listitem ${p.schoolId === me.id ? 'accent' : ''}`}
                style={{ cursor: 'pointer' }}
                onClick={() => openPlayer(p.id, 'records')}
              >
                <span class="dim" style={{ width: '16px' }}>{i + 1}</span>
                <span class="grow ellipsis">{fullName(p)}</span>
                <span class="muted">{G.schools[p.schoolId]?.short}</span>
                <span style={{ minWidth: '44px', textAlign: 'right' }}>{b.value(p)}</span>
              </div>
            ))
          ) : (
            <Empty>暂无数据</Empty>
          )}
        </Panel>
      ))}
    </div>
  );
}

const KEYS: [keyof import('../../core/types').SchoolYearResult, string][] = [
  ['springPref', '春县'],
  ['springRegion', '春地区'],
  ['summerPref', '夏县'],
  ['koshien', '夏甲'],
  ['fallPref', '秋县'],
  ['fallRegion', '秋地区'],
  ['jingu', '神宫'],
  ['senbatsu', '春甲'],
];

export function Records() {
  const [tab, setTab] = useState<'school' | 'leaders' | 'alumni' | 'famous'>('school');
  const me = mySchool();
  const hist = me.history.slice().sort((a, b) => b.year - a.year);
  const alumni = G.records.alumni.slice().reverse();
  const famous = sortBy(Object.values(G.schools), (s) => s.summerTitles * 30 + s.springTitles * 20 + s.koshienApps).slice(0, 30);
  return (
    <div class="col">
      <div class="page-title">记录</div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'school', label: '本校战绩' },
          { id: 'alumni', label: `OB名鉴（${G.records.alumni.length}）` },
          { id: 'leaders', label: '县内个人排行' },
          { id: 'famous', label: '全国名门' },
        ]}
      />
      {tab === 'school' && (
        <Panel title={`${me.name} · 甲子园出场 ${me.koshienApps} 次 · 胜利 ${me.koshienWins} · 夏冠 ${me.summerTitles} · 春冠 ${me.springTitles}`}>
          {hist.length ? (
            <table class="px">
              <thead>
                <tr>
                  <th>年度</th>
                  {KEYS.map(([, l]) => (
                    <th key={l}>{l}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hist.map((h) => (
                  <tr key={h.year}>
                    <td>{h.year}</td>
                    {KEYS.map(([k]) => {
                      const v = h[k] as string | undefined;
                      return (
                        <td key={k} class={v === '冠军' ? 'accent' : v ? '' : 'dim'}>
                          {v ?? '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>还没有大会成绩</Empty>
          )}
        </Panel>
      )}
      {tab === 'alumni' && (
        <Panel title="OB名鉴（你执教过的毕业生）">
          {alumni.length ? (
            <table class="px">
              <thead>
                <tr>
                  <th>毕业</th>
                  <th>姓名</th>
                  <th>学校</th>
                  <th>位置</th>
                  <th>进路</th>
                  <th>职业现况</th>
                  <th>高中通算</th>
                </tr>
              </thead>
              <tbody>
                {alumni.map((a) => (
                  <tr key={a.pid} class={a.pro ? 'sel' : ''}>
                    <td>{a.gradYear}</td>
                    <td class={a.pro ? 'accent' : ''}>{a.name}</td>
                    <td class="small">{a.schoolName}</td>
                    <td>{POS_NAME[a.pos]}</td>
                    <td>{a.path}</td>
                    <td>{a.pro ? `${a.proTeam} · ${a.proStatus}（${a.proYears ?? 0}年）` : '—'}</td>
                    <td class="small muted">{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>每年 3 月毕业的三年级生会被记录在这里</Empty>
          )}
        </Panel>
      )}
      {tab === 'leaders' && <Leaders />}
      {tab === 'famous' && (
        <Panel title="全国名门校">
          <table class="px">
            <thead>
              <tr>
                <th />
                <th>学校</th>
                <th>都道府县</th>
                <th>名门度</th>
                <th>甲子园出场</th>
                <th>胜利</th>
                <th>夏冠</th>
                <th>春冠</th>
              </tr>
            </thead>
            <tbody>
              {famous.map((s) => (
                <tr key={s.id} class={s.id === me.id ? 'sel' : ''}>
                  <td>
                    <Emblem school={s} />
                  </td>
                  <td>{s.name}</td>
                  <td>{PREFS[s.prefId].name}</td>
                  <td>{s.prestige.toFixed(0)}</td>
                  <td>{s.koshienApps}</td>
                  <td>{s.koshienWins}</td>
                  <td class={s.summerTitles ? 'accent' : ''}>{s.summerTitles}</td>
                  <td class={s.springTitles ? 'accent' : ''}>{s.springTitles}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
