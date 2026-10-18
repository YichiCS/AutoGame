import { useState } from 'preact/hooks';
import type { Player } from '../../core/types';
import { POS_ABBR, POS_NAME, BAT_ATTRS, PIT_ATTRS } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { Panel, Btn, Bar, Tabs, Stars, Emblem, Portrait, Grade, Tip, Empty } from '../components/common';
import {
  shownAttr, shownOverall, shownPot, myInterest, rivals, scoutVisit, inviteVisit, homeVisit, offerScholarship, recruitSeason,
  scholarshipsOffered, ACTION_COST, poachTargets, poachChance, poachCost, poachPlayer, committedTo, attract,
} from '../../core/recruit';
import { ATTR_NAME, fullName, isPitcher, overall, PERS_NAME, traitList } from '../../core/attrs';
import { refresh, toast, openModal, revealOnNarrow } from '../store';
import { PREFS } from '../../data/prefectures';
import { sortBy } from '../../core/util';
import { SCHED, shortDate } from '../../core/calendar';

type T = 'prospects' | 'committed' | 'transfer' | 'policy';

function ProspectDetail(p: { pl: Player }) {
  const pl = p.pl;
  const lv = pl.scout ?? 0;
  const attrs = isPitcher(pl) ? PIT_ATTRS : BAT_ATTRS;
  return (
    <div>
      <div class="row">
        <Portrait player={pl} />
        <div>
          <div class="accent">{fullName(pl)}</div>
          <div class="small muted">
            {pl.middle} · {PREFS[pl.homePref ?? 0].name} · {POS_NAME[pl.pos]} · {pl.throws === 'L' ? '左投' : '右投'}
            {pl.bats === 'L' ? '左打' : pl.bats === 'S' ? '两打' : '右打'}
          </div>
          <div class="small">情报等级：{'■'.repeat(lv)}{'□'.repeat(5 - lv)}</div>
        </div>
      </div>
      <div class="grid2 mt8 small">
        {attrs.map((k) => {
          const v = shownAttr(pl, k);
          return (
            <div key={k} class="row between">
              <span class="muted">{ATTR_NAME[k]}</span>
              {v === null ? <span class="dim">？</span> : k === 'velocity' ? <span>{v}km/h{lv < 5 ? '前后' : ''}</span> : <Grade v={v} />}
            </div>
          );
        })}
      </div>
      <div class="small mt8">性格：{lv >= 3 ? PERS_NAME[pl.pers] : '？'} · 学力：{lv >= 2 ? Math.round(pl.academics) : '？'}</div>
      <div class="row wrap gap4 small mt8">
        {lv >= 4 ? traitList(pl).map((t) => <span key={t.id} class={`tag ${t.good ? 'good' : 'bad'}`}>{t.name}</span>) : <span class="dim">特殊能力需要情报等级 4</span>}
      </div>
    </div>
  );
}

export function Recruit() {
  const [tab, setTab] = useState<T>('prospects');
  const [sel, setSel] = useState<number | null>(null);
  const [posF, setPosF] = useState<'all' | 'P' | 'bat'>('all');
  const [localOnly, setLocalOnly] = useState(false);
  const me = mySchool();
  const open = recruitSeason();
  const all = G.prospects.map((id) => G.players[id]).filter((p): p is Player => !!p && p.grade === 0);
  let list = all.filter((p) => (posF === 'all' ? true : posF === 'P' ? isPitcher(p) : !isPitcher(p)));
  if (localOnly) list = list.filter((p) => p.homePref === me.prefId);
  list = sortBy(list, (p) => (shownOverall(p) ?? -1) * 10 + (p.fame ?? 0));
  const selP = sel !== null ? G.players[sel] : null;
  const act = (fn: () => string | null, ok?: string) => {
    const r = fn();
    if (r && !ok) toast(r, r.includes('不足') || r.includes('不能') || r.includes('已') ? 'bad' : 'good');
    else if (ok) toast(r ?? ok, r ? 'bad' : 'good');
    refresh();
  };
  return (
    <div class="col">
      <div class="page-title">
        招募
        <span class="sub">
          {open ? `招募期：至 ${shortDate(SCHED.recruitDecision)} 决定入学` : G.week >= SCHED.recruitDecision ? '入学已决定，4 月入部' : '新一届中学生即将登场'} · 行动力 {G.manager.ap} · 部费 {Math.round(G.club.funds)} 万
        </span>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'prospects', label: `中学生（${all.length}）` },
          { id: 'committed', label: `已确定入学（${committedTo(me.id).length}）` },
          { id: 'transfer', label: '转学挖角' },
          { id: 'policy', label: '入部方针' },
        ]}
      />
      {tab === 'prospects' && (
        <div class="grid2" style={{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
          <Panel
            title="候选名单"
            right={
              <div class="row gap4">
                <Btn small on={posF === 'all'} onClick={() => setPosF('all')}>全部</Btn>
                <Btn small on={posF === 'P'} onClick={() => setPosF('P')}>投手</Btn>
                <Btn small on={posF === 'bat'} onClick={() => setPosF('bat')}>野手</Btn>
                <Btn small on={localOnly} onClick={() => setLocalOnly(!localOnly)}>仅本县</Btn>
              </div>
            }
          >
            <div class="table-wrap" style={{ maxHeight: '560px' }}>
              <table class="px">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>位置</th>
                    <th>出身</th>
                    <th>评价</th>
                    <th>潜力</th>
                    <th>知名度</th>
                    <th>我方意向</th>
                    <th>竞争对手</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((p) => {
                    const ov = shownOverall(p);
                    const rv = rivals(p)[0];
                    const mi = myInterest(p);
                    return (
                      <tr
                        key={p.id}
                        class={`click ${sel === p.id ? 'sel' : ''}`}
                        onClick={() => {
                          setSel(p.id);
                          revealOnNarrow('recruit-detail');
                        }}
                      >
                        <td>
                          {p.offers?.includes(-1) ? <span class="accent">特 </span> : ''}
                          {(p.scout ?? 0) > 0 ? fullName(p) : <span class="dim">{p.fam} ？？</span>}
                        </td>
                        <td>{POS_ABBR[p.pos]}</td>
                        <td class="small">{p.homePref === me.prefId ? '本县' : PREFS[p.homePref ?? 0].name}</td>
                        <td>{ov === null ? <span class="dim">？</span> : <Grade v={ov} />}</td>
                        <td>
                          <Stars n={shownPot(p)} />
                        </td>
                        <td>
                          <Bar v={p.fame ?? 0} w={40} color="var(--pink)" />
                        </td>
                        <td>
                          <Bar v={mi} w={50} color={rv && mi >= rv.v ? 'var(--green)' : 'var(--orange)'} />
                        </td>
                        <td class="small">
                          {rv ? (
                            <span>
                              {rv.school.short} <span class="dim">{Math.round(rv.v)}</span>
                            </span>
                          ) : (
                            <span class="dim">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel id="recruit-detail" title="详情与行动">
            {selP ? (
              <div class="col">
                <ProspectDetail pl={selP} />
                <div class="kv small">
                  <span class="k">我方意向</span>
                  <Bar v={myInterest(selP)} color="var(--green)" />
                  <span class="k">本校吸引力</span>
                  <Bar v={attract(selP)} color="var(--blue)" />
                </div>
                <div class="small">
                  {rivals(selP).map((r) => (
                    <div key={r.school.id} class="row">
                      <Emblem school={r.school} />
                      <span class="grow">{r.school.name}</span>
                      <Bar v={r.v} w={60} color="var(--red)" />
                    </div>
                  ))}
                </div>
                {open ? (
                  <div class="row wrap gap4">
                    <Tip tip={`派人观看比赛，提升情报等级（${ACTION_COST.scout}万円）`}>
                      <Btn small disabled={(selP.scout ?? 0) >= 5} onClick={() => act(() => scoutVisit(selP))}>
                        视察
                      </Btn>
                    </Tip>
                    <Tip tip={`邀请参观练习，意向上升（${ACTION_COST.invite}万円）`}>
                      <Btn small onClick={() => act(() => inviteVisit(selP))}>
                        邀请参观
                      </Btn>
                    </Tip>
                    <Tip tip="监督亲自家访（行动力 1），意向大幅上升">
                      <Btn small kind="blue" disabled={G.manager.ap < 1} onClick={() => act(() => homeVisit(selP))}>
                        家访
                      </Btn>
                    </Tip>
                    {me.type === 'private' && (
                      <Tip tip={`提供特待生名额（学费减免，每月 4 万）。今年 ${scholarshipsOffered()}/${G.club.scholarshipSlots}`}>
                        <Btn small kind="primary" disabled={selP.offers?.includes(-1)} onClick={() => act(() => offerScholarship(selP), '已提出特待生邀请！')}>
                          特待生邀请
                        </Btn>
                      </Tip>
                    )}
                  </div>
                ) : (
                  <div class="dim small">现在不是招募期。</div>
                )}
                <div class="small dim">
                  2 月时，中学生会选择意向最高的学校（我方意向需达到 42 以上）。宿舍可吸引外县中学生；近期的甲子园出场、设施与出场机会都会提高吸引力。
                </div>
              </div>
            ) : (
              <Empty>点击左侧的中学生查看详情</Empty>
            )}
          </Panel>
        </div>
      )}
      {tab === 'committed' && (
        <Panel title="已决定入学的新生（4 月入部）">
          {committedTo(me.id).length ? (
            committedTo(me.id).map((p) => (
              <div key={p.id} class="row listitem">
                <Portrait player={p} size="sm" />
                <span class="grow">
                  {fullName(p)} · {POS_NAME[p.pos]} · {p.middle}
                  {p.offers?.includes(-1) ? <span class="accent"> [特待生]</span> : ''}
                </span>
                <Grade v={overall(p)} />
              </div>
            ))
          ) : (
            <Empty>还没有确定入学的中学生（2 月第 3 周决定）</Empty>
          )}
        </Panel>
      )}
      {tab === 'transfer' && <TransferPanel />}
      {tab === 'policy' && (
        <Panel title="一般入部方针">
          <div class="row">
            <Btn on={G.club.walkonPolicy === 'open'} onClick={() => ((G.club.walkonPolicy = 'open'), refresh())}>
              来者不拒
            </Btn>
            <Btn on={G.club.walkonPolicy === 'select'} onClick={() => ((G.club.walkonPolicy = 'select'), refresh())}>
              选拔入部
            </Btn>
          </div>
          <div class="small muted mt8">来者不拒：所有想加入的新生都能入部（人多，用具费增加，但可能藏着璞玉）。选拔入部：只留下约一半较有前途的新生。</div>
          <div class="small muted mt8">每年 4 月，除了招募生，还会有若干名一般入部生。名门度与球迷人数越高，一般入部生越多。</div>
        </Panel>
      )}
    </div>
  );
}

function TransferPanel() {
  const ts = poachTargets();
  return (
    <Panel title="转学挖角">
      <div class="hint-box small mb8">
        日本高中棒球规定：转学生在转学后一年内不能参加公式战。挖角其他学校的球员会引起对方不满，并累积丑闻风险——请谨慎行事。
      </div>
      <div class="table-wrap" style={{ maxHeight: '520px' }}>
        <table class="px">
          <thead>
            <tr>
              <th>姓名</th>
              <th>学校</th>
              <th>年</th>
              <th>位置</th>
              <th>综合</th>
              <th>干劲</th>
              <th>成功率</th>
              <th>斡旋费</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {ts.map((p) => (
              <tr key={p.id}>
                <td>{fullName(p)}</td>
                <td class="small">{G.schools[p.schoolId]?.short}</td>
                <td>{p.grade}</td>
                <td>{POS_ABBR[p.pos]}</td>
                <td>
                  <Grade v={overall(p)} />
                </td>
                <td>
                  <Bar v={p.morale} w={40} />
                </td>
                <td>{Math.round(poachChance(p) * 100)}%</td>
                <td>{poachCost(p)}万</td>
                <td>
                  <Btn
                    small
                    kind="red"
                    onClick={() =>
                      void openModal<boolean>((close) => (
                        <div class="panel modal">
                          <div class="mtitle">确认挖角</div>
                          <div>
                            要接触{G.schools[p.schoolId]?.name}的{fullName(p)}吗？成功率约 {Math.round(poachChance(p) * 100)}%，无论成败都需要支付 {poachCost(p)} 万円，并增加丑闻风险。
                          </div>
                          <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                            <Btn onClick={() => close(false)}>算了</Btn>
                            <Btn kind="red" onClick={() => close(true)}>
                              接触
                            </Btn>
                          </div>
                        </div>
                      )).then((ok) => {
                        if (!ok) return;
                        const r = poachPlayer(p);
                        toast(r.text, r.ok ? 'good' : 'bad');
                        refresh();
                      })
                    }
                  >
                    挖角
                  </Btn>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}
