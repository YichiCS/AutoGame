import type { FacilityId } from '../../core/types';
import { FACILITY_IDS } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { FACILITY_DEFS, IN_CAT, MAX_LV, OUT_CAT, canUpgrade, monthlyNet, schoolBudget, startUpgrade, upgradeCost, upgradeDays } from '../../core/economy';
import { yearIdx } from '../../core/calendar';
import { catAuto } from '../../core/queue';
import { Bar, Btn, Money, Panel } from '../components/common';
import { refresh } from '../store';

/** 一项设施：图标 | 名字 | 等级 | 升级按钮，下面是说明。各列宽度固定 */
function FacilityRow(p: { id: FacilityId }) {
  const id = p.id;
  const def = FACILITY_DEFS[id];
  const lv = G.facilities[id];
  const b = G.building?.id === id ? G.building : null;
  const why = canUpgrade(id);
  const cost = upgradeCost(id);
  const publicDorm = id === 'dorm' && mySchool().type === 'public';
  return (
    <div class="fac">
      <span class="ficon">{def.icon}</span>
      <b class="fname">{def.name}</b>
      <span class="flv">
        <span class="lvdots">
          {'■'.repeat(lv)}
          <span class="dim">{'■'.repeat(MAX_LV - lv)}</span>
        </span>
        <span class="dim">
          {lv}/{MAX_LV}
        </span>
      </span>
      <span class="fbtn">
        {lv < MAX_LV && !b && (
          <Btn
            small
            kind="primary"
            disabled={!!why}
            title={why ?? ''}
            onClick={() => {
              startUpgrade(id);
              refresh();
            }}
          >
            {lv ? '升级' : '修建'} {Math.round(cost)} 万
          </Btn>
        )}
        {lv >= MAX_LV && <span class="gold small">最高等级</span>}
      </span>
      <div class="fdesc small">
        <div class="dim">{def.desc}</div>
        <div>{lv ? `现在：${def.effect(lv)}` : '尚未修建'}</div>
        {lv < MAX_LV && (
          <div class="dim">
            下一级：{def.effect(lv + 1)}（工期 {upgradeDays(id)} 天）
          </div>
        )}
        {b && (
          <div class="row gap6 mt4">
            施工中 <Bar v={b.total - b.left} max={b.total} w={120} color="var(--accent2)" /> 还要 {b.left} 天
          </div>
        )}
        {lv < MAX_LV && !b && why && <div class="orange">{why}</div>}
        {publicDorm && lv === 0 && <div class="dim">公立学校也可以修宿舍，但花费不菲。</div>}
      </div>
    </div>
  );
}

function BookList(p: { title: string; rows: Record<string, number>; names: Record<string, string> }) {
  const list = Object.entries(p.rows).sort((a, b) => b[1] - a[1]);
  const sum = list.reduce((a, [, v]) => a + v, 0);
  return (
    <div>
      <div class="sect row">
        <span class="grow">{p.title}</span>
        <Money v={sum} />
      </div>
      <div class="glist">
        {list.map(([k, v]) => (
          <div key={k} class="lrow lr-book small">
            <span class="ell">{p.names[k] ?? k}</span>
            <span class="n">{Math.round(v).toLocaleString('en-US')} 万</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function Facilities() {
  const y = yearIdx(G.day);
  const book = G.books.find((b) => b.year === y);
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
            <BookList title="今年收入" rows={book.in} names={IN_CAT} />
            <BookList title="今年支出" rows={book.out} names={OUT_CAT} />
          </div>
        )}
        <div class="small dim mt6">收入来自学校拨款、OB 会、后援会，以及打出成绩后的奖励和甲子园募款。{catAuto('build') ? '设施升级已交给托管。' : '在「方针 → 托管」里可以把设施升级交给托管。'}</div>
      </Panel>
      <Panel title="设施">
        {FACILITY_IDS.map((id) => (
          <FacilityRow key={id} id={id} />
        ))}
      </Panel>
    </div>
  );
}
