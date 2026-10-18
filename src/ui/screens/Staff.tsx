import { useState } from 'preact/hooks';
import type { Staff, StaffRole } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { Panel, Btn, Grade, Bar, Tabs, Tip, Empty, Emblem } from '../components/common';
import {
  myStaff, ROLE_NAME, ROLE_DESC, STAFF_TRAIT_NAME, STAFF_TRAIT_DESC, ROLES, hireStaff, fireStaff, fireCost, poachChance, buyout, MAX_STAFF, coachMult, roleSkill, payroll, signingCost,
} from '../../core/staff';
import { addMoney } from '../../core/finance';
import { refresh, toast, openModal } from '../store';
import { schoolsInPref } from '../../core/world';
import { sortBy, clamp } from '../../core/util';
import { chance } from '../../core/rng';

function StaffRow(p: { s: Staff; actions?: preact.ComponentChildren }) {
  const s = p.s;
  return (
    <tr>
      <td>{ROLE_NAME[s.role]}</td>
      <td>{s.name}</td>
      <td>{s.age}</td>
      <td>
        <Grade v={s.skill} />
      </td>
      <td>{s.trait ? <Tip tip={STAFF_TRAIT_DESC[s.trait]}><span class="tag gold">{STAFF_TRAIT_NAME[s.trait]}</span></Tip> : <span class="dim">—</span>}</td>
      <td class="small muted">{s.bg}</td>
      <td class="num">{s.salary}万</td>
      <td class="num">{s.years}年</td>
      <td>
        <Bar v={s.loyalty} w={40} color="var(--blue)" />
      </td>
      <td>{p.actions}</td>
    </tr>
  );
}

const HEAD = (
  <tr>
    <th>职务</th>
    <th>姓名</th>
    <th>年龄</th>
    <th>能力</th>
    <th>特点</th>
    <th>经历</th>
    <th class="num">年薪</th>
    <th class="num">合同</th>
    <th>忠诚</th>
    <th />
  </tr>
);

async function offerDialog(s: Staff, poach: boolean): Promise<number | undefined> {
  let salary = poach ? Math.round(s.salary * 1.3) : s.salary;
  return openModal<number>((close) => (
    <div class="panel modal">
      <div class="mtitle">{poach ? '挖角报价' : '签约报价'}</div>
      <div>
        {ROLE_NAME[s.role]} {s.name}（能力 {s.skill}，现年薪 {s.salary} 万）
      </div>
      <div class="row mt8">
        <span>报价年薪</span>
        <input
          class="px"
          type="number"
          value={salary}
          min={50}
          max={3000}
          step={10}
          onInput={(e) => (salary = Number((e.target as HTMLInputElement).value))}
          style={{ width: '90px' }}
        />
        <span>万円</span>
      </div>
      {poach && <div class="small muted mt8">需要另付违约金 {buyout(s)} 万円给原学校。成功率取决于报价、两校名门度差距、你的交涉力与对方的忠诚度。</div>}
      {!poach && <div class="small muted mt8">签约时支付签约金（年薪的 15%）。</div>}
      <div class="row mt12" style={{ justifyContent: 'flex-end' }}>
        <Btn onClick={() => close(undefined)}>取消</Btn>
        <Btn kind="primary" onClick={() => close(salary)}>
          提出报价
        </Btn>
      </div>
    </div>
  ));
}

export function StaffScreen() {
  const [tab, setTab] = useState<'mine' | 'market' | 'poach'>('mine');
  const [roleF, setRoleF] = useState<StaffRole | 'all'>('all');
  const me = mySchool();
  const mine = myStaff();
  const market = G.freeStaff.map((id) => G.staff[id]).filter((s) => s && s.schoolId === -1 && (roleF === 'all' || s.role === roleF));
  const others = sortBy(
    schoolsInPref(me.prefId)
      .filter((s) => s.id !== me.id)
      .flatMap((s) => s.staff.map((id) => G.staff[id]))
      .filter((s) => s && (roleF === 'all' || s.role === roleF)),
    (s) => s.skill,
  ).slice(0, 30);

  const hire = async (s: Staff) => {
    const sal = await offerDialog(s, false);
    if (sal === undefined) return;
    const cost = signingCost(s);
    if (G.club.funds < cost) return toast('资金不足以支付签约金', 'bad');
    const err = hireStaff(s, sal, 2);
    if (err) return toast(err, 'bad');
    addMoney(-cost, 'staff', `${s.name}签约金`);
    toast(`${s.name}加入了教练团队！`, 'good');
    refresh();
  };
  const poach = async (s: Staff) => {
    if (me.staff.length >= MAX_STAFF) return toast('教练团队已满', 'bad');
    const sal = await offerDialog(s, true);
    if (sal === undefined) return;
    const cost = buyout(s);
    if (G.club.funds < cost) return toast('资金不足以支付违约金', 'bad');
    const from = G.schools[s.schoolId];
    const pc = poachChance(s, sal);
    if (!chance(pc)) {
      s.loyalty = clamp(s.loyalty + 5, 0, 100);
      from.rivalry = clamp(from.rivalry + 8, 0, 100);
      toast(`${s.name}拒绝了你的邀请（成功率 ${Math.round(pc * 100)}%）`, 'bad');
      refresh();
      return;
    }
    addMoney(-cost, 'staff', `挖角${s.name}违约金`);
    from.staff = from.staff.filter((x) => x !== s.id);
    from.rivalry = clamp(from.rivalry + 15, 0, 100);
    s.schoolId = me.id;
    s.salary = sal;
    s.years = 2;
    s.loyalty = clamp(s.loyalty + 10, 0, 100);
    me.staff.push(s.id);
    toast(`成功从${from.name}挖来了${s.name}！`, 'good');
    refresh();
  };

  return (
    <div class="col">
      <div class="page-title">
        教练团队
        <span class="sub">
          {mine.length}/{MAX_STAFF} 人 · 年薪总额 {payroll()} 万円
        </span>
      </div>
      <div class="grid4">
        {ROLES.map((r) => (
          <Panel key={r} title={ROLE_NAME[r]}>
            <div class="small muted" style={{ minHeight: '32px' }}>{ROLE_DESC[r]}</div>
            <div class="row between small mt8">
              <span>有效能力</span>
              {roleSkill(r) ? <Grade v={roleSkill(r)} /> : <span class="bad">空缺</span>}
            </div>
            {(r === 'pitching' || r === 'batting' || r === 'fielding' || r === 'trainer') && <div class="small">训练倍率 ×{coachMult(r).toFixed(2)}</div>}
          </Panel>
        ))}
      </div>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'mine', label: '本校教练' },
          { id: 'market', label: '自由教练市场' },
          { id: 'poach', label: '挖角' },
        ]}
      />
      {tab !== 'mine' && (
        <div class="row wrap gap4">
          <Btn small on={roleF === 'all'} onClick={() => setRoleF('all')}>
            全部
          </Btn>
          {ROLES.map((r) => (
            <Btn key={r} small on={roleF === r} onClick={() => setRoleF(r)}>
              {ROLE_NAME[r]}
            </Btn>
          ))}
        </div>
      )}
      {tab === 'mine' && (
        <Panel title="本校教练">
          {mine.length ? (
            <table class="px">
              <thead>{HEAD}</thead>
              <tbody>
                {mine.map((s) => (
                  <StaffRow
                    key={s.id}
                    s={s}
                    actions={
                      <span class="row gap4">
                        <Tip tip="加薪 10% 并延长 1 年合同，忠诚度提升">
                          <Btn
                            small
                            onClick={() => {
                              s.salary = Math.round(s.salary * 1.1);
                              s.years += 1;
                              s.loyalty = clamp(s.loyalty + 12, 0, 100);
                              toast(`与${s.name}续约`, 'good');
                              refresh();
                            }}
                          >
                            续约
                          </Btn>
                        </Tip>
                        <Tip tip={`解雇需支付违约金 ${fireCost(s)} 万円`}>
                          <Btn
                            small
                            kind="red"
                            onClick={() => {
                              const c = fireStaff(s);
                              addMoney(-c, 'staff', `解雇${s.name}`);
                              toast(`解雇了${s.name}`, 'info');
                              refresh();
                            }}
                          >
                            解雇
                          </Btn>
                        </Tip>
                      </span>
                    }
                  />
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>还没有教练。去市场看看吧。</Empty>
          )}
        </Panel>
      )}
      {tab === 'market' && (
        <Panel title="自由教练">
          <table class="px">
            <thead>{HEAD}</thead>
            <tbody>
              {market.map((s) => (
                <StaffRow
                  key={s.id}
                  s={s}
                  actions={
                    <Btn small kind="primary" disabled={mine.length >= MAX_STAFF} onClick={() => void hire(s)}>
                      招聘
                    </Btn>
                  }
                />
              ))}
            </tbody>
          </table>
          {!market.length && <Empty>暂无符合条件的自由教练（每月会有新人进入市场）</Empty>}
        </Panel>
      )}
      {tab === 'poach' && (
        <Panel title="县内其他学校的教练">
          <table class="px">
            <thead>
              <tr>
                <th>学校</th>
                <th>职务</th>
                <th>姓名</th>
                <th>能力</th>
                <th>特点</th>
                <th class="num">年薪</th>
                <th>忠诚</th>
                <th>成功率*</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {others.map((s) => (
                <tr key={s.id}>
                  <td class="small">
                    <Emblem school={G.schools[s.schoolId]} /> {G.schools[s.schoolId]?.short}
                  </td>
                  <td>{ROLE_NAME[s.role]}</td>
                  <td>{s.name}</td>
                  <td>
                    <Grade v={s.skill} />
                  </td>
                  <td>{s.trait ? STAFF_TRAIT_NAME[s.trait] : '—'}</td>
                  <td class="num">{s.salary}万</td>
                  <td>
                    <Bar v={s.loyalty} w={40} color="var(--blue)" />
                  </td>
                  <td>{Math.round(poachChance(s, Math.round(s.salary * 1.3)) * 100)}%</td>
                  <td>
                    <Btn small kind="red" disabled={mine.length >= MAX_STAFF} onClick={() => void poach(s)}>
                      挖角
                    </Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div class="small dim mt8">* 以年薪 1.3 倍报价时的估算成功率。</div>
        </Panel>
      )}
    </div>
  );
}
