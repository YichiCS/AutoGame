import type { FacilityId } from '../../core/types';
import { FACILITY_IDS } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { FACILITY_DEFS, IN_CAT, MAX_LV, OUT_CAT, canUpgrade, monthlyNet, schoolBudget, startUpgrade, upgradeCost, upgradeDays } from '../../core/economy';
import { yearIdx } from '../../core/calendar';
import { catAuto } from '../../core/queue';
import { Bar, Btn, Money, Panel } from '../components/common';
import { refresh } from '../store';
import { sfx } from '../sound';

function FacilityCard(p: { id: FacilityId }) {
  const id = p.id;
  const def = FACILITY_DEFS[id];
  const lv = G.facilities[id];
  const b = G.building?.id === id ? G.building : null;
  const why = canUpgrade(id);
  const cost = upgradeCost(id);
  const publicDorm = id === 'dorm' && mySchool().type === 'public';
  return (
    <div class="fac">
      <div class="row gap6">
        <span class="ficon">{def.icon}</span>
        <b>{def.name}</b>
        <span class="lvdots">
          {'■'.repeat(lv)}
          <span class="dim">{'■'.repeat(MAX_LV - lv)}</span>
        </span>
        <span class="grow" />
        {lv < MAX_LV && !b && (
          <Btn
            small
            kind="primary"
            disabled={!!why}
            title={why ?? ''}
            onClick={() => {
              if (startUpgrade(id)) sfx('click');
              refresh();
            }}
          >
            {lv ? '升级' : '修建'} {Math.round(cost)} 万
          </Btn>
        )}
      </div>
      <div class="small dim">{def.desc}</div>
      <div class="small">{lv ? def.effect(lv) : '尚未修建'}</div>
      {lv < MAX_LV && <div class="small dim">下一级：{def.effect(lv + 1)}（工期 {upgradeDays(id)} 天）</div>}
      {b && (
        <div class="small mt4">
          施工中 <Bar v={b.total - b.left} max={b.total} w={120} color="var(--accent2)" /> 还要 {b.left} 天
        </div>
      )}
      {publicDorm && lv === 0 && <div class="small dim">公立学校也可以修宿舍，但花费不菲。</div>}
    </div>
  );
}

export function Facilities() {
  const y = yearIdx(G.day);
  const book = G.books.find((b) => b.year === y);
  const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div>
      <Panel title="部费">
        <div class="kv">
          <span>现有</span>
          <span class="big">
            <Money v={G.funds} />
          </span>
          <span>每月预计</span>
          <span>
            <Money v={monthlyNet()} signed />（学校拨款约 {Math.round(schoolBudget())} 万）
          </span>
        </div>
        {book && (
          <div class="books mt6">
            <div>
              <div class="sect">今年收入 <Money v={sum(book.in)} /></div>
              {Object.entries(book.in).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} class="gline small">
                  <span class="grow">{IN_CAT[k] ?? k}</span>
                  <span>{Math.round(v)}</span>
                </div>
              ))}
            </div>
            <div>
              <div class="sect">今年支出 <Money v={sum(book.out)} /></div>
              {Object.entries(book.out).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} class="gline small">
                  <span class="grow">{OUT_CAT[k] ?? k}</span>
                  <span>{Math.round(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <div class="small dim mt6">收入来自学校拨款、OB 会、后援会，以及打出成绩后的奖励和甲子园募款。{catAuto('build') ? '设施升级已交给托管。' : '在「方针 → 托管」里可以把设施升级交给托管。'}</div>
      </Panel>
      <Panel title="设施">
        {FACILITY_IDS.map((id) => (
          <FacilityCard key={id} id={id} />
        ))}
      </Panel>
    </div>
  );
}
