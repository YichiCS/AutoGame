// 阵容：打线（每一棒的人和守位）、先发顺位、下一场的先发投手
import type { LineupPlan, Player, Pos } from '../../core/types';
import { POS_NAME, POS_SHORT } from '../../core/types';
import { G, myPlayers } from '../../core/state';
import { available } from '../../core/player';
import { batterOffense, fieldAt, fullName, isPitcher, pitcherOverall } from '../../core/attrs';
import { autoPlan, planProblems, todayStarter } from '../../core/lineup';
import { PITCH_DEFS } from '../../data/pitches';
import { Btn, Empty, Fatigue, Num, Panel } from '../components/common';
import { refresh } from '../store';

const POS_LIST: (Pos | 'DH')[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

function why(p: Player): string {
  if (p.injury) return '伤';
  if (p.benched > 0) return '停';
  return '';
}

function setPlan(plan: LineupPlan | null): void {
  G.lineup = plan;
  refresh();
}

export function LineupEditor() {
  const plan = G.lineup;
  const all = myPlayers().slice().sort((a, b) => batterOffense(b) - batterOffense(a));
  if (!plan) {
    return (
      <div>
        <Empty>现在每场比赛按「起用方针」自动排阵。</Empty>
        <Btn kind="primary" onClick={() => setPlan(autoPlan())}>
          以现在的最佳阵容为底，开始自定义
        </Btn>
      </div>
    );
  }
  const dh = G.dh;
  const probs = planProblems(plan, dh);
  const posOpts: (Pos | 'DH')[] = [...POS_LIST, dh ? 'DH' : 'P'];
  const byId = new Map(all.map((p) => [p.id, p]));
  const update = (fn: (p: LineupPlan) => void) => {
    const next: LineupPlan = { bat: plan.bat.map((s) => ({ ...s })), rotation: plan.rotation.slice(), practice: plan.practice };
    fn(next);
    setPlan(next);
  };
  const avail = myPlayers().filter(available);
  const pitchers = all.filter((p) => isPitcher(p) || (p.apt.P ?? 0) >= 50).sort((a, b) => pitcherOverall(b) - pitcherOverall(a));
  const next = todayStarter(avail, 500, G.nextStarter);
  return (
    <div class="lineup">
      <div class="row wrap gap4 mb6">
        <Btn small onClick={() => setPlan(autoPlan())} title="按现在的能力重新排一份最佳阵容">
          自动排阵
        </Btn>
        <Btn small onClick={() => setPlan(null)} title="不用自定义阵容，每场按起用方针自动排">
          改回每场自动排
        </Btn>
        <label class="small row gap4">
          <input type="checkbox" checked={plan.practice} onChange={() => update((p) => (p.practice = !p.practice))} />
          练习赛也用这套阵容
        </label>
      </div>
      <table class="lu">
        <thead>
          <tr>
            <th>棒</th>
            <th>守位</th>
            <th>球员</th>
            <th>能力（0-100）</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {plan.bat.map((s, i) => {
            const p = s.pos === 'P' ? null : byId.get(s.pid);
            return (
              <tr key={i}>
                <td class="ord">{i + 1}</td>
                <td>
                  <select
                    value={s.pos}
                    onChange={(e) =>
                      update((pl) => {
                        const v = (e.target as HTMLSelectElement).value as Pos | 'DH';
                        // 守位互换
                        const j = pl.bat.findIndex((x) => x.pos === v);
                        if (j >= 0) pl.bat[j].pos = pl.bat[i].pos;
                        pl.bat[i].pos = v;
                      })
                    }
                  >
                    {posOpts.map((k) => (
                      <option key={k} value={k}>
                        {k === 'DH' ? '指定打击' : POS_NAME[k as Pos]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {s.pos === 'P' ? (
                    <span class="dim">当天的先发投手</span>
                  ) : (
                    <select
                      value={String(s.pid)}
                      onChange={(e) =>
                        update((pl) => {
                          const v = Number((e.target as HTMLSelectElement).value);
                          // 已经在别的棒次：两人互换
                          const j = pl.bat.findIndex((x) => x.pid === v && x.pos !== 'P');
                          if (j >= 0) pl.bat[j].pid = pl.bat[i].pid;
                          pl.bat[i].pid = v;
                        })
                      }
                    >
                      {all.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {fullName(x)}（{POS_SHORT[x.pos]}·{x.grade}年{why(x) ? `·${why(x)}` : ''}）
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td class="small">
                  {p ? (
                    <>
                      击 <Num v={p.a.contact} /> 力 <Num v={p.a.power} /> 速 <Num v={p.a.speed} />
                      {s.pos !== 'DH' && (
                        <>
                          {' '}
                          守 <Num v={fieldAt(p, s.pos as Pos)} />
                        </>
                      )}
                      {why(p) && <span class="tag bad">{why(p) === '伤' ? '受伤' : '停赛'}</span>}
                    </>
                  ) : (
                    ''
                  )}
                </td>
                <td class="nowrap">
                  <button type="button" class="chip" disabled={i === 0} title="上移" onClick={() => update((pl) => ([pl.bat[i - 1], pl.bat[i]] = [pl.bat[i], pl.bat[i - 1]]))}>
                    ↑
                  </button>
                  <button type="button" class="chip" disabled={i === 8} title="下移" onClick={() => update((pl) => ([pl.bat[i + 1], pl.bat[i]] = [pl.bat[i], pl.bat[i + 1]]))}>
                    ↓
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {probs.length > 0 && (
        <div class="small orange mt4">
          {probs.join('；')}。比赛时这些位置会自动补位。
        </div>
      )}
      <div class="small dim mt4">受伤、停赛的人到比赛那天会自动由板凳上最合适的人代替。</div>
      <div class="sect">先发顺位</div>
      <div class="small dim mb6">排在前面、状态可以（疲劳不高、本周还能投）的投手先发。</div>
      {plan.rotation.map((id, i) => {
        const p = byId.get(id);
        if (!p) return null;
        return (
          <div key={id} class="rot">
            <span class="ord">{i + 1}</span>
            <b>{fullName(p)}</b>
            <span class="small dim">
              {Math.round(p.a.velocity)}km · 控 <Num v={p.a.control} /> · 耐 <Num v={p.a.stamina} /> · {p.pitches.map((x) => PITCH_DEFS[x.type].short + x.lv).join(' ') || '只有直球'}
            </span>
            <Fatigue v={p.fatigue} w={40} />
            <span class="grow" />
            <button type="button" class="chip" disabled={i === 0} onClick={() => update((pl) => ([pl.rotation[i - 1], pl.rotation[i]] = [pl.rotation[i], pl.rotation[i - 1]]))}>
              ↑
            </button>
            <button type="button" class="chip" onClick={() => update((pl) => pl.rotation.splice(i, 1))}>
              ×
            </button>
          </div>
        );
      })}
      <div class="row gap4 mt4">
        <select
          value=""
          onChange={(e) => {
            const v = Number((e.target as HTMLSelectElement).value);
            if (v) update((pl) => pl.rotation.push(v));
          }}
        >
          <option value="">＋ 加入先发顺位…</option>
          {pitchers
            .filter((p) => !plan.rotation.includes(p.id))
            .map((p) => (
              <option key={p.id} value={String(p.id)}>
                {fullName(p)}（{Math.round(p.a.velocity)}km）
              </option>
            ))}
        </select>
      </div>
      <div class="sect">下一场先发</div>
      <div class="row wrap gap4">
        <select
          value={String(G.nextStarter ?? '')}
          onChange={(e) => {
            const v = (e.target as HTMLSelectElement).value;
            G.nextStarter = v ? Number(v) : null;
            refresh();
          }}
        >
          <option value="">按顺位 / 起用方针（现在是 {next ? fullName(next) : '—'}）</option>
          {pitchers.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {fullName(p)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export function Lineup() {
  return (
    <Panel title="阵容">
      <LineupEditor />
    </Panel>
  );
}
