import type { AttrKey, DevPlan, MenuId, Player, Pos, PitchType, StaffRole } from '../../core/types';
import { MENU_IDS, POS_ABBR, BAT_ATTRS, PIT_ATTRS, PITCH_TYPES, POSITIONS, POS_NAME } from '../../core/types';
import { G, myPlayers } from '../../core/state';
import { Panel, Btn, Bar, Grade, Portrait, Fatigue, Morale, Tip, PName } from '../components/common';
import { MENUS, INTENSITY, PRESETS, allocShare, previewWeek, campAvailable, FACILITY_DEFS, fac } from '../../core/training';
import { setCamp } from '../../core/game';
import { refresh, toast } from '../store';
import { ATTR_NAME, isPitcher, overall } from '../../core/attrs';
import { roleSkill, ROLE_NAME, coachMult } from '../../core/staff';
import { PITCH_DEFS } from '../../data/traits';
import { sortBy } from '../../core/util';

function roleOfFocus(p: Player): StaffRole | null {
  const f = p.focus;
  if (!f || f.kind === 'rest' || f.kind === 'study') return null;
  if (f.kind === 'pitch') return 'pitching';
  if (f.kind === 'pos') return 'fielding';
  const a = f.attr;
  if (a === 'velocity' || a === 'control' || a === 'stamina' || a === 'stuff') return 'pitching';
  if (a === 'contact' || a === 'power' || a === 'eye' || a === 'bunt') return 'batting';
  if (a === 'durability') return 'trainer';
  return 'fielding';
}

function FocusSelect(p: { pl: Player }) {
  const pl = p.pl;
  const pitcher = isPitcher(pl);
  const val = !pl.focus ? 'none' : pl.focus.kind === 'attr' ? `attr:${pl.focus.attr}` : pl.focus.kind === 'pitch' ? `pitch:${pl.focus.pitch}` : pl.focus.kind === 'pos' ? `pos:${pl.focus.pos}` : pl.focus.kind;
  return (
    <select
      class="px"
      value={val}
      onChange={(e) => {
        const v = (e.target as HTMLSelectElement).value;
        if (v === 'none') pl.focus = null;
        else if (v === 'rest' || v === 'study') pl.focus = { kind: v };
        else {
          const [k, x] = v.split(':');
          if (k === 'attr') pl.focus = { kind: 'attr', attr: x as AttrKey };
          if (k === 'pitch') {
            pl.focus = { kind: 'pitch', pitch: x as PitchType };
            if (!pl.learning || pl.learning.pitch !== x) pl.learning = { pitch: x as PitchType, progress: 0 };
          }
          if (k === 'pos') pl.focus = { kind: 'pos', pos: x as Pos };
        }
        refresh();
      }}
    >
      <option value="none">无</option>
      {(pitcher ? PIT_ATTRS : BAT_ATTRS).map((k) => (
        <option key={k} value={`attr:${k}`}>
          {ATTR_NAME[k]}
        </option>
      ))}
      <option value="attr:mental">精神</option>
      <option value="attr:durability">体质</option>
      {pitcher &&
        PITCH_TYPES.filter((t) => !pl.pitches.some((x) => x.type === t)).map((t) => (
          <option key={t} value={`pitch:${t}`}>
            新球:{PITCH_DEFS[t].name}
          </option>
        ))}
      {POSITIONS.filter((x) => x !== pl.pos).map((x) => (
        <option key={x} value={`pos:${x}`}>
          转{POS_NAME[x]}
        </option>
      ))}
      <option value="rest">休养</option>
      <option value="study">学习</option>
    </select>
  );
}

const PLAN_OPTS: [DevPlan, string][] = [
  ['auto', '自动'], ['balanced', '均衡'], ['contact', '巧打'], ['power', '长打'], ['speed', '速度'], ['defense', '守备'],
  ['pit_velo', '速球派'], ['pit_ctrl', '技巧派'], ['pit_brk', '变化球派'], ['pit_stam', '耐力派'], ['manual', '手动'],
];

export function Training() {
  const plan = G.club.training;
  const total = MENU_IDS.reduce((a, id) => a + (plan.alloc[id] ?? 0), 0);
  const pv = previewWeek();
  const ps = sortBy(myPlayers().filter((p) => !p.retired), (p) => p.grade * 1000 + overall(p));
  const crowd: Record<string, number> = {};
  for (const p of ps) {
    const r = roleOfFocus(p);
    if (r) crowd[r] = (crowd[r] ?? 0) + 1;
  }
  const camp = G.flags.campAbs === G.absWeek;
  return (
    <div class="col">
      <div class="page-title">
        训练
        <span class="sub">设定全队练习菜单、强度与个别练习。每周推进时自动执行。</span>
      </div>
      <div class="grid2" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,1fr)' }}>
        <Panel title="全队练习菜单" right={<span class="small muted">合计 {total}%（自动按比例换算）</span>}>
          <div class="row wrap gap4 mb8">
            {PRESETS.map((p) => (
              <Btn
                key={p.name}
                small
                onClick={() => {
                  plan.alloc = { ...p.alloc };
                  refresh();
                }}
              >
                {p.name}
              </Btn>
            ))}
          </div>
          {MENU_IDS.map((id) => {
            const m = MENUS[id];
            const v = plan.alloc[id] ?? 0;
            return (
              <div key={id} class="row" style={{ padding: '2px 0' }}>
                <Tip tip={m.desc}>
                  <span style={{ width: '64px', display: 'inline-block' }}>{m.name}</span>
                </Tip>
                <input
                  type="range"
                  class="px grow"
                  min={0}
                  max={60}
                  step={5}
                  value={v}
                  onInput={(e) => {
                    plan.alloc[id as MenuId] = Number((e.target as HTMLInputElement).value);
                    refresh();
                  }}
                />
                <span style={{ width: '36px' }} class="right">{v}</span>
                <span class="small dim" style={{ width: '40px' }}>{Math.round(allocShare(id) * 100)}%</span>
                <span class="small muted" style={{ width: '96px' }}>
                  {m.coach ? `${ROLE_NAME[m.coach].replace('教练', '')}×${coachMult(m.coach).toFixed(2)}` : ''}
                </span>
              </div>
            );
          })}
        </Panel>
        <div class="col">
          <Panel title="训练强度">
            <div class="row wrap gap4">
              {INTENSITY.map((it, i) => (
                <Btn
                  key={i}
                  on={plan.intensity === i}
                  kind={i === 3 ? 'red' : ''}
                  onClick={() => {
                    plan.intensity = i;
                    refresh();
                  }}
                >
                  {it.name}
                </Btn>
              ))}
            </div>
            <div class="small muted mt8">
              经验 ×{INTENSITY[plan.intensity].exp} · 疲劳 ×{INTENSITY[plan.intensity].fat} · 受伤风险 ×{INTENSITY[plan.intensity].risk}
              {plan.intensity === 3 ? ' · 默契与干劲会持续下降' : ''}
            </div>
            <div class="kv mt8 small">
              <span class="k">预计经验/周</span>
              <span class="accent">约 {pv.exp.toFixed(1)}（普通球员，未计个人系数）</span>
              <span class="k">训练负荷</span>
              <span class={pv.fatigue > 15 ? 'bad' : ''}>{pv.fatigue.toFixed(1)}（恢复力约 6~10）</span>
            </div>
          </Panel>
          <Panel title="集训合宿">
            {campAvailable() ? (
              <div>
                <div class="small">本周可举行合宿：经验 ×1.6、默契大幅提升，但疲劳与受伤风险增加。费用约 {60 + myPlayers().length * 3} 万円。</div>
                <Btn
                  class="mt8"
                  kind={camp ? 'green' : 'primary'}
                  onClick={() => {
                    setCamp(!camp);
                    toast(camp ? '取消了合宿' : '本周将举行合宿！', 'good');
                    refresh();
                  }}
                >
                  {camp ? '✔ 已安排本周合宿（点击取消）' : '安排本周合宿'}
                </Btn>
              </div>
            ) : (
              <div class="small dim">合宿可在 8 月下旬、11 月下旬、12 月下旬、2 月下旬举行。</div>
            )}
          </Panel>
          <Panel title="团队">
            <div class="kv small">
              <span class="k">团队默契</span>
              <Bar v={G.club.chemistry} color="var(--blue)" />
              <span class="k">战术熟练</span>
              <Bar v={G.club.tacticsSkill} color="var(--accent2)" />
            </div>
            <div class="small muted mt8">
              设施：{(Object.keys(FACILITY_DEFS) as (keyof typeof FACILITY_DEFS)[]).map((k) => `${FACILITY_DEFS[k].name}Lv${fac(k)}`).join(' · ')}
            </div>
          </Panel>
        </div>
      </div>
      <Panel
        title="个别练习与培养方针"
        right={
          <span class="small muted">
            教练指导人数：{(['batting', 'pitching', 'fielding', 'trainer'] as StaffRole[])
              .map((r) => `${ROLE_NAME[r].slice(0, 2)} ${crowd[r] ?? 0}/5${roleSkill(r) ? '' : '(无)'}`)
              .join(' · ')}
          </span>
        }
      >
        <div class="hint-box small mb8">每位教练最多能有效指导 5 名球员的个别练习，超过时效率下降；没有对应教练时效率较低。</div>
        <div class="table-wrap" style={{ maxHeight: '420px' }}>
          <table class="px">
            <thead>
              <tr>
                <th />
                <th>姓名</th>
                <th>年</th>
                <th>位置</th>
                <th>综合</th>
                <th>疲劳</th>
                <th>干劲</th>
                <th>个别练习</th>
                <th>培养方针</th>
              </tr>
            </thead>
            <tbody>
              {ps.map((p) => (
                <tr key={p.id} class={p.injury ? 'dim' : ''}>
                  <td>
                    <Portrait player={p} size="sm" />
                  </td>
                  <td>
                    <PName player={p} />
                    {p.injury ? <span class="bad small"> 伤</span> : ''}
                  </td>
                  <td>{p.grade}</td>
                  <td>{POS_ABBR[p.pos]}</td>
                  <td>
                    <Grade v={overall(p)} />
                  </td>
                  <td>
                    <Fatigue v={p.fatigue} />
                  </td>
                  <td>
                    <Morale v={p.morale} />
                  </td>
                  <td>
                    <FocusSelect pl={p} />
                  </td>
                  <td>
                    <select
                      class="px"
                      value={p.plan}
                      onChange={(e) => {
                        p.plan = (e.target as HTMLSelectElement).value as DevPlan;
                        refresh();
                      }}
                    >
                      {PLAN_OPTS.filter(([v]) => (isPitcher(p) ? !['contact', 'power', 'speed', 'defense'].includes(v) : !v.startsWith('pit_'))).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
