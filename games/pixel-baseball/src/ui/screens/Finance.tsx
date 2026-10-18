import { useState } from 'preact/hooks';
import type { FacilityId, SponsorDeal } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { Panel, Btn, Money, Tabs, Bar, Empty, Tip } from '../components/common';
import {
  INCOME_NAME, EXPENSE_NAME, yearlyBudget, obMonthly, boosterMonthly, upgradeCost, startUpgrade, upkeepMonthly, weeklyEquipCost, weeklyMealCost, dormCapacity, SPONSOR_KIND_NAME, acceptSponsor, rejectSponsor, addMoney,
} from '../../core/finance';
import { FACILITY_DEFS, type FacKey } from '../../core/training';
import { payroll } from '../../core/staff';
import { refresh, toast, openModal } from '../store';
import { shortDate, WEEKS } from '../../core/calendar';
import { money } from '../../core/util';

const EQUIP = ['普通', '良好', '顶级'];
const MEAL = ['普通伙食', '营养餐', '豪华营养餐'];

export function Finance() {
  const [tab, setTab] = useState<'book' | 'facility' | 'sponsor'>('book');
  const me = mySchool();
  const books = G.club.books.slice(-6);
  const cats = (k: 'income' | 'expense') => [...new Set(books.flatMap((b) => Object.keys(b[k])))];
  const monthlyIn = yearlyBudget() / 12 + obMonthly() + boosterMonthly() + G.club.sponsors.reduce((a, d) => a + d.monthly, 0);
  const monthlyOut = payroll() / 12 + upkeepMonthly() + (weeklyEquipCost() + weeklyMealCost()) * 4;
  return (
    <div class="col">
      <div class="page-title">
        经营
        <span class="sub">部费 {money(G.club.funds)} · 球迷 {G.club.fans.toLocaleString()} 人</span>
      </div>
      <div class="grid3">
        <Panel title="收支概况（每月估算）">
          <div class="kv small">
            <span class="k">学校拨款</span>
            <span>{Math.round(yearlyBudget() / 12)} 万（年 {yearlyBudget()}）</span>
            <span class="k">OB会捐款</span>
            <span>约 {obMonthly()} 万</span>
            <span class="k">后援会</span>
            <span>{boosterMonthly()} 万</span>
            <span class="k">赞助</span>
            <span>{G.club.sponsors.reduce((a, d) => a + d.monthly, 0)} 万</span>
            <span class="k">教练薪水</span>
            <span class="bad">-{Math.round(payroll() / 12)} 万</span>
            <span class="k">用具/伙食</span>
            <span class="bad">-{Math.round((weeklyEquipCost() + weeklyMealCost()) * 4)} 万</span>
            <span class="k">设施维护</span>
            <span class="bad">-{upkeepMonthly()} 万</span>
          </div>
          <div class="mt8">
            每月净额约 <Money v={Math.round(monthlyIn - monthlyOut)} signed />
          </div>
        </Panel>
        <Panel title="运营设定">
          <div class="row">
            <span class="muted" style={{ width: '64px' }}>用具等级</span>
            {EQUIP.map((n, i) => (
              <Btn key={i} small on={G.club.equipment === i} onClick={() => ((G.club.equipment = i), refresh())}>
                {n}
              </Btn>
            ))}
          </div>
          <div class="small dim">更好的用具会略微提升干劲，但用具费增加。</div>
          <div class="row mt8">
            <span class="muted" style={{ width: '64px' }}>宿舍伙食</span>
            {MEAL.map((n, i) => (
              <Btn key={i} small disabled={!G.club.facilities.dorm} on={G.club.meal === i} onClick={() => ((G.club.meal = i), refresh())}>
                {n}
              </Btn>
            ))}
          </div>
          <div class="small dim">{G.club.facilities.dorm ? `宿舍容量 ${dormCapacity()} 人。营养餐提升力量成长与恢复（「食训」）。` : '需要先建设宿舍。'}</div>
          <div class="row mt8">
            <Btn
              small
              onClick={() =>
                void openModal<number>((close) => {
                  let v = 100;
                  return (
                    <div class="panel modal">
                      <div class="mtitle">监督自掏腰包</div>
                      <div>个人资产：{money(G.manager.money)}</div>
                      <div class="row mt8">
                        <input class="px" type="number" min={10} step={10} value={v} onInput={(e) => (v = Number((e.target as HTMLInputElement).value))} />
                        <span>万円</span>
                      </div>
                      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
                        <Btn onClick={() => close(undefined)}>取消</Btn>
                        <Btn kind="primary" onClick={() => close(v)}>
                          捐给部费
                        </Btn>
                      </div>
                    </div>
                  );
                }).then((v) => {
                  if (!v || v <= 0) return;
                  if (v > G.manager.money) return toast('个人资产不足', 'bad');
                  G.manager.money -= v;
                  addMoney(v, 'personal', '监督个人捐助');
                  G.club.ob = Math.min(100, G.club.ob + v / 100);
                  toast(`向部费捐出 ${v} 万円`, 'good');
                  refresh();
                })
              }
            >
              用个人资产捐助部费
            </Btn>
          </div>
        </Panel>
        <Panel title="满意度">
          <div class="kv small">
            <span class="k">校方</span>
            <Bar v={G.club.board} color="var(--green)" />
            <span class="k">OB会</span>
            <Bar v={G.club.ob} color="var(--accent2)" />
            <span class="k">地方期待</span>
            <Bar v={G.club.supporters} color="var(--pink)" />
          </div>
          <div class="small dim mt8">部费长期赤字会降低校方满意度。OB 会满意度影响每月捐款；甲子园出场时会发起大规模募款。</div>
          {me.type === 'private' && <div class="small mt8">特待生名额：{G.club.scholarshipSlots} 人/年</div>}
        </Panel>
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'book', label: '账簿' },
          { id: 'facility', label: '设施' },
          { id: 'sponsor', label: `赞助与代言${G.club.sponsorOffers.length ? `（${G.club.sponsorOffers.length}）` : ''}` },
        ]}
      />
      {tab === 'book' && (
        <div class="grid2">
          <Panel title="月度收支">
            {books.length ? (
              <table class="px">
                <thead>
                  <tr>
                    <th>项目</th>
                    {books.map((b) => (
                      <th key={b.label} class="num">
                        {b.label.replace(/^\d+年/, '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cats('income').map((c) => (
                    <tr key={`i${c}`}>
                      <td class="good">{INCOME_NAME[c] ?? c}</td>
                      {books.map((b) => (
                        <td key={b.label} class="num">
                          {b.income[c] ? Math.round(b.income[c]) : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {cats('expense').map((c) => (
                    <tr key={`e${c}`}>
                      <td class="bad">{EXPENSE_NAME[c] ?? c}</td>
                      {books.map((b) => (
                        <td key={b.label} class="num">
                          {b.expense[c] ? `-${Math.round(b.expense[c])}` : ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty>还没有账目</Empty>
            )}
          </Panel>
          <Panel title="最近的流水">
            <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
              {G.club.ledger
                .slice(-40)
                .reverse()
                .map((l, i) => (
                  <div key={i} class="row listitem small">
                    <span class="dim">{shortDate(l.absWeek % WEEKS)}</span>
                    <span class="grow ellipsis">{l.note}</span>
                    <Money v={l.amount} signed />
                  </div>
                ))}
            </div>
          </Panel>
        </div>
      )}
      {tab === 'facility' && (
        <div class="grid4">
          {(Object.keys(FACILITY_DEFS) as FacKey[]).map((k) => {
            const def = FACILITY_DEFS[k];
            const lv = G.club.facilities[k as FacilityId];
            const building = G.club.construction?.id === k;
            const cost = upgradeCost(k as FacilityId);
            return (
              <Panel key={k} title={`${def.name} Lv${lv}/${def.max}`}>
                <div class="small muted" style={{ minHeight: '36px' }}>{def.desc}</div>
                <Bar v={lv} max={def.max} color="var(--accent2)" />
                {building ? (
                  <div class="accent small mt8">施工中：剩余 {G.club.construction!.weeksLeft} 周</div>
                ) : lv >= def.max ? (
                  <div class="good small mt8">已达最高等级</div>
                ) : (
                  <div class="mt8">
                    <Tip tip={`工期约 ${4 + lv * 2} 周`}>
                      <Btn
                        small
                        kind="primary"
                        disabled={!!G.club.construction || G.club.funds < cost}
                        onClick={() => {
                          const err = startUpgrade(k as FacilityId);
                          toast(err ?? `${def.name}开始扩建！`, err ? 'bad' : 'good');
                          refresh();
                        }}
                      >
                        扩建 {cost} 万
                      </Btn>
                    </Tip>
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
      )}
      {tab === 'sponsor' && (
        <div class="grid2">
          <Panel title="新的提案">
            {G.club.sponsorOffers.length ? (
              G.club.sponsorOffers.map((d) => <DealCard key={d.id} d={d} offer />)
            ) : (
              <Empty>暂时没有提案。人气与名声越高，越容易收到赞助邀请。</Empty>
            )}
          </Panel>
          <Panel title="合作中">
            {G.club.sponsors.length ? G.club.sponsors.map((d) => <DealCard key={d.id} d={d} />) : <Empty>没有进行中的合约</Empty>}
          </Panel>
        </div>
      )}
    </div>
  );
}

function DealCard(p: { d: SponsorDeal; offer?: boolean }) {
  const d = p.d;
  return (
    <div class="panel flat mb8">
      <div class="row between">
        <span class={d.kind === 'gray' ? 'bad' : 'accent'}>
          {d.name} · {SPONSOR_KIND_NAME[d.kind]}
        </span>
        <span class="small dim">{p.offer ? `${d.weeksLeft} 周合约` : `剩余 ${d.weeksLeft} 周`}</span>
      </div>
      <div class="small mt8">{d.desc}</div>
      <div class="row wrap gap4 small mt8">
        {d.monthly > 0 && <span class="tag good">每月 +{d.monthly}万</span>}
        {d.lump > 0 && d.kind !== 'endorse' && <span class="tag good">签约 +{d.lump}万</span>}
        {d.kind === 'endorse' && <span class="tag gold">监督年收入 +{d.lump}万</span>}
        {d.winBonus > 0 && <span class="tag">胜利奖金 {d.winBonus}万</span>}
        {d.koshienBonus > 0 && <span class="tag">甲子园奖励 {d.koshienBonus}万</span>}
        {d.apPerMonth > 0 && <span class="tag bad">行动力 -{d.apPerMonth}/月</span>}
        {d.fatigue > 0 && <span class="tag bad">球员疲劳 +{d.fatigue}/周</span>}
        {d.risk > 0.02 && <span class="tag bad">丑闻风险 高</span>}
      </div>
      {p.offer && (
        <div class="row mt8">
          <Btn
            small
            kind={d.kind === 'gray' ? 'red' : 'primary'}
            onClick={() => {
              acceptSponsor(d);
              toast(`与${d.name}签约`, d.kind === 'gray' ? 'bad' : 'good');
              refresh();
            }}
          >
            签约
          </Btn>
          <Btn
            small
            onClick={() => {
              rejectSponsor(d);
              refresh();
            }}
          >
            拒绝
          </Btn>
        </div>
      )}
    </div>
  );
}
