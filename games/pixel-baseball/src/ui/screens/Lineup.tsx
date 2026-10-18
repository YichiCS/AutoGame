import type { Player, Pos } from '../../core/types';
import { POS_ABBR, POS_NAME } from '../../core/types';
import { G, mySchool } from '../../core/state';
import { Panel, Btn, Grade, Portrait, PName, Fatigue, Cond } from '../components/common';
import { availableOf, myLineup, rulesFor, validLineup } from '../../core/matchday';
import { autoBench, autoLineup, pickStarter } from '../../core/team';
import { aptOf, batterOffense, fullName, isPitcher, overall, pitcherOverall } from '../../core/attrs';
import { refresh, toast } from '../store';
import { sortBy } from '../../core/util';
import { PITCH_DEFS } from '../../data/traits';

const FPOS: Pos[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

function ensureManual(): void {
  const lu = G.club.lineup;
  if (!lu.auto && lu.order.length === 9) return;
  const r = myLineup(rulesFor(null, 0));
  lu.order = r.order;
  lu.defense = r.defense;
  lu.dh = G.dh ? r.order.find((id) => !Object.values(r.defense).includes(id)) ?? null : null;
  lu.auto = false;
}

export function LineupScreen() {
  const me = mySchool();
  const lu = G.club.lineup;
  const avail = availableOf(me);
  if (lu.autoBench) lu.bench = autoBench(avail, 20, G.dh);
  const reg = lu.bench.map((id) => G.players[id]).filter((p): p is Player => !!p && avail.includes(p));
  const regSet = new Set(reg.map((p) => p.id));
  const preview = myLineup(rulesFor(null, 0));
  const order = lu.auto ? preview.order : lu.order;
  const defense = lu.auto ? preview.defense : lu.defense;
  const valid = validLineup(reg, lu.order, lu.defense, G.dh);
  const posOf = (id: number): string => {
    for (const [k, v] of Object.entries(defense)) if (v === id && k !== 'P') return k;
    if (defense.P === id) return 'P';
    return G.dh ? 'DH' : '—';
  };
  const pitchers = sortBy(reg.filter((p) => isPitcher(p) || (p.apt.P ?? 0) >= 50), pitcherOverall);
  const rotation = [...lu.rotation.filter((id) => pitchers.some((p) => p.id === id)), ...pitchers.map((p) => p.id).filter((id) => !lu.rotation.includes(id))];
  const starter = pickStarter(reg, lu.rotation);

  const setSlotPlayer = (i: number, id: number) => {
    ensureManual();
    const j = lu.order.indexOf(id);
    if (j >= 0) [lu.order[i], lu.order[j]] = [lu.order[j], lu.order[i]];
    else {
      const old = lu.order[i];
      lu.order[i] = id;
      for (const k of Object.keys(lu.defense) as Pos[]) if (lu.defense[k] === old) lu.defense[k] = id;
      if (lu.dh === old) lu.dh = id;
    }
    refresh();
  };
  const setSlotPos = (i: number, pos: string) => {
    ensureManual();
    const id = lu.order[i];
    for (const k of Object.keys(lu.defense) as Pos[]) if (lu.defense[k] === id && k !== 'P') delete lu.defense[k];
    if (pos === 'DH') lu.dh = id;
    else lu.defense[pos as Pos] = id;
    refresh();
  };
  const move = (i: number, d: number) => {
    ensureManual();
    const j = i + d;
    if (j < 0 || j > 8) return;
    [lu.order[i], lu.order[j]] = [lu.order[j], lu.order[i]];
    refresh();
  };

  return (
    <div class="col">
      <div class="page-title">
        阵容
        <span class="sub">比赛时使用此处的设定（自动编排会在每场比赛前根据状态重新排出最佳阵容）</span>
      </div>
      <div class="grid2" style={{ gridTemplateColumns: 'minmax(0,1.3fr) minmax(0,1fr)' }}>
        <Panel
          title="打线与守备"
          right={
            <div class="row gap4">
              <Btn small on={lu.auto} onClick={() => ((lu.auto = true), refresh())}>
                自动编排
              </Btn>
              <Btn small on={!lu.auto} onClick={() => (ensureManual(), refresh())}>
                手动
              </Btn>
            </div>
          }
        >
          {!lu.auto && !valid && <div class="bad small mb8">⚠ 阵容不完整或有球员不在登录名单内（比赛时将改用自动编排）。需要 9 名打者、8 个守备位置各 1 人{G.dh ? '、DH 1 人，投手不入打线' : '，投手也要排入打线'}。</div>}
          <table class="px">
            <thead>
              <tr>
                <th>棒</th>
                <th>守位</th>
                <th>球员</th>
                <th>适性</th>
                <th>打击</th>
                <th>调子</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {order.map((id, i) => {
                const p = G.players[id];
                if (!p) return null;
                const pos = posOf(id);
                return (
                  <tr key={i}>
                    <td class="accent">{i + 1}</td>
                    <td>
                      {lu.auto ? (
                        pos === 'DH' ? 'DH' : POS_ABBR[pos as Pos] ?? pos
                      ) : (
                        <select class="px" value={pos} onChange={(e) => setSlotPos(i, (e.target as HTMLSelectElement).value)}>
                          {FPOS.map((x) => (
                            <option key={x} value={x}>
                              {POS_ABBR[x]}
                            </option>
                          ))}
                          {G.dh ? <option value="DH">DH</option> : <option value="P">投</option>}
                          <option value="—">—</option>
                        </select>
                      )}
                    </td>
                    <td>
                      {lu.auto ? (
                        <PName player={p} />
                      ) : (
                        <select class="px" value={id} onChange={(e) => setSlotPlayer(i, Number((e.target as HTMLSelectElement).value))}>
                          {reg.map((x) => (
                            <option key={x.id} value={x.id}>
                              {fullName(x)}（{POS_ABBR[x.pos]}）
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>{pos !== 'DH' && pos !== '—' ? <Grade v={aptOf(p, pos as Pos)} /> : '-'}</td>
                    <td>
                      <Grade v={batterOffense(p)} />
                    </td>
                    <td>
                      <Cond v={p.cond} />
                    </td>
                    <td>
                      {!lu.auto && (
                        <span class="row gap4">
                          <Btn small onClick={() => move(i, -1)}>
                            ▲
                          </Btn>
                          <Btn small onClick={() => move(i, 1)}>
                            ▼
                          </Btn>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div class="row mt8">
            <span class="muted">先发投手</span>
            {lu.auto ? (
              <span class="accent">{starter ? `${fullName(starter)}（按轮换与疲劳自动选择）` : '—'}</span>
            ) : (
              <select
                class="px"
                value={lu.defense.P ?? ''}
                onChange={(e) => {
                  const id = Number((e.target as HTMLSelectElement).value);
                  if (G.dh && lu.order.includes(id)) {
                    toast('DH 制下投手不能同时在打线中', 'bad');
                    return;
                  }
                  lu.defense.P = id;
                  if (!G.dh) {
                    const slot = lu.order.findIndex((x) => posOf(x) === 'P');
                    if (slot >= 0) lu.order[slot] = id;
                  }
                  refresh();
                }}
              >
                {pitchers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}（疲劳{Math.round(p.fatigue)}）
                  </option>
                ))}
              </select>
            )}
          </div>
          <div class="row mt8">
            <Btn
              onClick={() => {
                const r = autoLineup(reg, G.dh, pickStarter(reg, lu.rotation));
                lu.order = r.order;
                lu.defense = r.defense;
                lu.dh = r.dh;
                lu.auto = false;
                refresh();
                toast('已生成推荐阵容，可以在此基础上调整', 'good');
              }}
            >
              以推荐阵容为基础手动调整
            </Btn>
          </div>
        </Panel>
        <Panel title="投手轮换（先发优先顺序）">
          {rotation.map((id, i) => {
            const p = G.players[id];
            return (
              <div key={id} class="row listitem">
                <span class="accent" style={{ width: '16px' }}>{i + 1}</span>
                <Portrait player={p} size="sm" />
                <div class="grow">
                  <PName player={p} />
                  <div class="small muted">
                    {Math.round(p.a.velocity)}km · 控<Grade v={p.a.control} showV={false} /> 耐<Grade v={p.a.stamina} showV={false} /> · {p.pitches.map((x) => PITCH_DEFS[x.type].short + x.lv).join(' ')}
                  </div>
                </div>
                <Fatigue v={p.fatigue} />
                <Btn
                  small
                  onClick={() => {
                    const r = rotation.slice();
                    if (i > 0) [r[i - 1], r[i]] = [r[i], r[i - 1]];
                    lu.rotation = r;
                    refresh();
                  }}
                >
                  ▲
                </Btn>
              </div>
            );
          })}
          <div class="small dim mt8">自动编排时，会选择轮换中第一个疲劳 &lt; 55 且本周还能投 100 球以上的投手。一周 500 球的限制请注意！</div>
        </Panel>
      </div>
      <Panel
        title={`登录名单（${reg.length}/20）`}
        right={
          <Btn small on={lu.autoBench} onClick={() => ((lu.autoBench = !lu.autoBench), refresh())}>
            {lu.autoBench ? '自动选择中' : '手动选择'}
          </Btn>
        }
      >
        <div class="small muted mb8">
          投手 {reg.filter(isPitcher).length} 人 · 捕手 {reg.filter((p) => (p.apt.C ?? 0) >= 60).length} 人。未登录的球员无法出场，干劲可能下降。
        </div>
        <div class="grid4">
          {sortBy(avail.slice(), overall).map((p) => {
            const on = regSet.has(p.id);
            return (
              <div
                key={p.id}
                class="row panel flat"
                style={{ padding: '3px 6px', cursor: lu.autoBench ? 'default' : 'pointer', opacity: on ? 1 : 0.55 }}
                onClick={() => {
                  if (lu.autoBench) return;
                  if (on) lu.bench = lu.bench.filter((x) => x !== p.id);
                  else if (lu.bench.length < 20) lu.bench = [...lu.bench, p.id];
                  else toast('登录名单最多 20 人', 'bad');
                  refresh();
                }}
              >
                <span>{on ? '☑' : '☐'}</span>
                <span class="grow ellipsis">{fullName(p)}</span>
                <span class="small muted">{p.grade}年{POS_ABBR[p.pos]}</span>
                <Grade v={overall(p)} showV={false} />
              </div>
            );
          })}
        </div>
      </Panel>
      <div class="small dim">守位说明：{FPOS.map((x) => `${POS_ABBR[x]}=${POS_NAME[x]}`).join('　')}。适性低的位置守备能力会大幅下降（可在训练中进行守位转换）。</div>
    </div>
  );
}
