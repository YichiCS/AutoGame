// 阵容：打线（每一棒的人和守位）、先发顺位、下一场的先发投手。
// 谁都可以排在任何守位、谁都可以先发投球：选人时列出每个人在那个位置上的总评（posRating），按它排序。
// 「阵容」页和比赛前的「调整阵容」共用这个编辑器。
import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { LineupPlan, Player, Pos } from '../../core/types';
import { POS_ABBR, POS_NAME } from '../../core/types';
import { G, myPlayers } from '../../core/state';
import { available } from '../../core/player';
import { batterOffense, fullName, posRating } from '../../core/attrs';
import { autoPlan, planProblems, todayStarter } from '../../core/lineup';
import { Btn, Empty, Fatigue, Num, Panel } from '../components/common';
import { Sheet } from '../components/Sheet';
import { refresh } from '../store';

type SlotPos = Pos | 'DH';
const FIELD_ORDER: SlotPos[] = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'];

const posLabel = (pos: SlotPos) => (pos === 'DH' ? '指定打击' : POS_NAME[pos]);
const posShort = (pos: SlotPos) => (pos === 'DH' ? '指打' : POS_ABBR[pos]);

/** 某人排在某个守位上的评价：守位看那个位置的总评，指定打击看打击 */
function slotRating(p: Player, pos: SlotPos): number {
  return pos === 'DH' ? batterOffense(p) : posRating(p, pos);
}

function why(p: Player): string {
  if (p.injury) return '伤';
  if (p.benched > 0) return '停';
  return '';
}

function setPlan(plan: LineupPlan | null): void {
  G.lineup = plan;
  refresh();
}

type Pick = { kind: 'slot'; i: number } | { kind: 'pos'; i: number } | { kind: 'rot' } | { kind: 'next' };

/** 选人 / 选守位的列表：每一行是一个按钮，各列宽度固定、数字右对齐 */
function PickList(p: { title: string; head: ComponentChildren; cls: string; onClose: () => void; children: ComponentChildren; note?: string }) {
  return (
    <Sheet
      title={p.title}
      onClose={p.onClose}
      class="picker"
      foot={
        <div class="mact-row end">
          <Btn onClick={p.onClose}>取消</Btn>
        </div>
      }
    >
      {p.note && <div class="small dim mb6">{p.note}</div>}
      <div class={`pk ${p.cls}`}>
        <div class="pk-row head">{p.head}</div>
        {p.children}
      </div>
    </Sheet>
  );
}

/** 一名候选：名字（带伤 / 停 / 第几棒的标记） */
function Who(p: { pl: Player; extra?: string }) {
  const w = why(p.pl);
  return (
    <span class="pk-name">
      <b>{fullName(p.pl)}</b>
      {w && <span class="tag bad">{w === '伤' ? '受伤' : '停赛'}</span>}
      {p.extra && <span class="tag">{p.extra}</span>}
    </span>
  );
}

/** 投手候选的一行（先发顺位、下一场先发共用） */
function PitcherOption(p: { pl: Player; on?: boolean; extra?: string; onPick: () => void }) {
  const x = p.pl;
  return (
    <button type="button" class={`pk-row ${p.on ? 'on' : ''}`} onClick={p.onPick}>
      <Who pl={x} extra={p.extra} />
      <span class="c">{x.grade}年</span>
      <span class="c">{POS_ABBR[x.pos]}</span>
      <span class="n">
        <Num v={posRating(x, 'P')} />
      </span>
      <span class="n">{Math.round(x.a.velocity)}</span>
      <span class="n">
        <Num v={x.a.control} />
      </span>
      <span class="n">
        <Num v={x.a.stamina} />
      </span>
      <span class="n">
        <Fatigue v={x.fatigue} bare />
      </span>
    </button>
  );
}

const PITCHER_HEAD = (
  <>
    <span>球员</span>
    <span class="c">年级</span>
    <span class="c">本职</span>
    <span class="n">投手评价</span>
    <span class="n">球速</span>
    <span class="n">控球</span>
    <span class="n">耐力</span>
    <span class="n">疲劳</span>
  </>
);

/** 下一场的先发：手动指定，或者按先发顺位 / 起用方针 */
function NextStarter(p: { onPick: () => void }) {
  const avail = myPlayers().filter(available);
  const auto = todayStarter(avail, 500, null);
  const forced = G.nextStarter !== null ? G.players[G.nextStarter] : null;
  return (
    <button type="button" class="pickbtn wide" onClick={p.onPick}>
      {forced ? (
        <>
          <b>{fullName(forced)}</b>
          <span class="dim small">（手动指定 · 投手评价 {Math.round(posRating(forced, 'P'))}）</span>
        </>
      ) : (
        <>
          <span>按先发顺位 / 起用方针</span>
          <span class="dim small">（现在是 {auto ? fullName(auto) : '—'}）</span>
        </>
      )}
      <span class="grow" />
      <span class="dim">▾</span>
    </button>
  );
}

export function LineupEditor() {
  const [pick, setPick] = useState<Pick | null>(null);
  const plan = G.lineup;
  const close = () => setPick(null);
  const all = myPlayers();
  const byP = all.slice().sort((a, b) => posRating(b, 'P') - posRating(a, 'P'));
  const nextPicker =
    pick?.kind === 'next' ? (
      <PickList title="下一场的先发投手" cls="pk-pit" head={PITCHER_HEAD} onClose={close} note="谁都可以先发投球。按投手评价排序；投完这一场以后恢复按顺位。">
        <button
          type="button"
          class={`pk-row any ${G.nextStarter === null ? 'on' : ''}`}
          onClick={() => {
            G.nextStarter = null;
            close();
            refresh();
          }}
        >
          <span class="pk-name">按先发顺位 / 起用方针决定</span>
        </button>
        {byP.map((x) => (
          <PitcherOption
            key={x.id}
            pl={x}
            on={G.nextStarter === x.id}
            onPick={() => {
              G.nextStarter = x.id;
              close();
              refresh();
            }}
          />
        ))}
      </PickList>
    ) : null;

  if (!plan) {
    return (
      <div class="lineup">
        <Empty>现在每场比赛按「起用方针」自动排阵。</Empty>
        <Btn kind="primary" onClick={() => setPlan(autoPlan())}>
          以现在的最佳阵容为底，开始自定义
        </Btn>
        <div class="sect">下一场先发</div>
        <NextStarter onPick={() => setPick({ kind: 'next' })} />
        {nextPicker}
      </div>
    );
  }
  const dh = G.dh;
  const probs = planProblems(plan, dh);
  const posOpts: SlotPos[] = [...FIELD_ORDER, dh ? 'DH' : 'P'];
  const byId = new Map(all.map((p) => [p.id, p]));
  const update = (fn: (p: LineupPlan) => void) => {
    const next: LineupPlan = { bat: plan.bat.map((s) => ({ ...s })), rotation: plan.rotation.slice(), practice: plan.practice };
    fn(next);
    setPlan(next);
  };
  /** 打线里的第几棒（不在打线里 -1） */
  const slotOf = (id: number) => plan.bat.findIndex((s) => s.pid === id && s.pos !== 'P');

  let sheet: ComponentChildren = nextPicker;
  if (pick?.kind === 'slot') {
    const i = pick.i;
    const pos = plan.bat[i].pos as SlotPos;
    const cands = all.slice().sort((a, b) => slotRating(b, pos) - slotRating(a, pos));
    sheet = (
      <PickList
        title={`第 ${i + 1} 棒 · ${posLabel(pos)}`}
        cls="pk-bat"
        onClose={close}
        note={`${pos === 'DH' ? '谁都可以当指定打击：按打击排序' : `谁都可以守${posLabel(pos)}：按${posLabel(pos)}的总评排序`}。已经在打线里的人会和这一棒交换。`}
        head={
          <>
            <span>球员</span>
            <span class="c">年级</span>
            <span class="c">本职</span>
            <span class="n">{pos === 'DH' ? '打击' : posShort(pos)}</span>
            <span class="n">打击</span>
            <span class="n">疲劳</span>
          </>
        }
      >
        {cands.map((x) => {
          const j = slotOf(x.id);
          return (
            <button
              type="button"
              key={x.id}
              class={`pk-row ${j === i ? 'on' : ''}`}
              onClick={() => {
                update((pl) => {
                  // 已经在别的棒次：两人互换
                  const k = pl.bat.findIndex((s) => s.pid === x.id && s.pos !== 'P');
                  if (k >= 0) pl.bat[k].pid = pl.bat[i].pid;
                  pl.bat[i].pid = x.id;
                });
                close();
              }}
            >
              <Who pl={x} extra={j >= 0 && j !== i ? `第${j + 1}棒` : undefined} />
              <span class="c">{x.grade}年</span>
              <span class="c">{POS_ABBR[x.pos]}</span>
              <span class="n">
                <Num v={slotRating(x, pos)} />
              </span>
              <span class="n">
                <Num v={batterOffense(x)} />
              </span>
              <span class="n">
                <Fatigue v={x.fatigue} bare />
              </span>
            </button>
          );
        })}
      </PickList>
    );
  } else if (pick?.kind === 'pos') {
    const i = pick.i;
    const me = byId.get(plan.bat[i].pid);
    sheet = (
      <PickList
        title={`第 ${i + 1} 棒的守位`}
        cls="pk-pos"
        onClose={close}
        note={me ? `${fullName(me)} 在各个守位上的总评。换到别人的守位时，两人交换守位。` : undefined}
        head={
          <>
            <span>守位</span>
            <span class="n">总评</span>
            <span>现在是</span>
          </>
        }
      >
        {posOpts.map((k) => {
          const j = plan.bat.findIndex((s) => s.pos === k);
          const holder = j >= 0 && k !== 'P' ? byId.get(plan.bat[j].pid) : null;
          return (
            <button
              type="button"
              key={k}
              class={`pk-row ${plan.bat[i].pos === k ? 'on' : ''}`}
              onClick={() => {
                update((pl) => {
                  // 守位互换
                  const jj = pl.bat.findIndex((x) => x.pos === k);
                  if (jj >= 0) pl.bat[jj].pos = pl.bat[i].pos;
                  pl.bat[i].pos = k;
                });
                close();
              }}
            >
              <span class="pk-name">
                <b>{k === 'P' ? '投手（当天的先发投手打击）' : posLabel(k)}</b>
              </span>
              <span class="n">{me && k !== 'P' ? <Num v={slotRating(me, k)} /> : '—'}</span>
              <span class="dim ell">{k === 'P' ? '' : holder ? `${fullName(holder)}（第${j + 1}棒）` : j >= 0 ? '' : '空着'}</span>
            </button>
          );
        })}
      </PickList>
    );
  } else if (pick?.kind === 'rot') {
    sheet = (
      <PickList title="加入先发顺位" cls="pk-pit" head={PITCHER_HEAD} onClose={close} note="谁都可以先发投球。按投手评价排序。">
        {byP
          .filter((x) => !plan.rotation.includes(x.id))
          .map((x) => (
            <PitcherOption
              key={x.id}
              pl={x}
              onPick={() => {
                update((pl) => pl.rotation.push(x.id));
                close();
              }}
            />
          ))}
      </PickList>
    );
  }

  return (
    <div class="lineup">
      <div class="lu-tools">
        <Btn small onClick={() => setPlan(autoPlan())} title="按现在的能力重新排一份阵容">
          自动排阵
        </Btn>
        <Btn small onClick={() => setPlan(null)} title="不用自定义阵容，每场按起用方针自动排">
          改回每场自动排
        </Btn>
        <label class="lu-check">
          <input type="checkbox" checked={plan.practice} onChange={() => update((p) => (p.practice = !p.practice))} />
          练习赛也用这套阵容
        </label>
      </div>

      <div class="sect">打线</div>
      <div class="lub">
        <div class="lub-row head">
          <span class="c">棒</span>
          <span>守位</span>
          <span>球员</span>
          <span class="n" title="这名球员在这个守位上的总评（指定打击看打击）">评价</span>
          <span class="n">打击</span>
          <span />
        </div>
        {plan.bat.map((s, i) => {
          const pos = s.pos as SlotPos;
          const p = pos === 'P' ? null : byId.get(s.pid);
          const w = p ? why(p) : '';
          return (
            <div key={i} class={`lub-row ${w ? 'warn' : ''}`}>
              <span class="c ord">{i + 1}</span>
              <button type="button" class="pickbtn" onClick={() => setPick({ kind: 'pos', i })}>
                {posShort(pos)}
                <span class="dim">▾</span>
              </button>
              {pos === 'P' ? (
                <span class="dim small">当天的先发投手</span>
              ) : (
                <button type="button" class="pickbtn" onClick={() => setPick({ kind: 'slot', i })}>
                  <span class="ell">{p ? fullName(p) : '（空）'}</span>
                  {w && <span class="tag bad">{w === '伤' ? '受伤' : '停赛'}</span>}
                  <span class="grow" />
                  <span class="dim">▾</span>
                </button>
              )}
              <span class="n">{p ? <Num v={slotRating(p, pos)} /> : ''}</span>
              <span class="n">{p ? <Num v={batterOffense(p)} /> : ''}</span>
              <span class="lu-mv">
                <button type="button" class="chip" disabled={i === 0} aria-label="上移" onClick={() => update((pl) => ([pl.bat[i - 1], pl.bat[i]] = [pl.bat[i], pl.bat[i - 1]]))}>
                  ↑
                </button>
                <button type="button" class="chip" disabled={i === 8} aria-label="下移" onClick={() => update((pl) => ([pl.bat[i + 1], pl.bat[i]] = [pl.bat[i], pl.bat[i + 1]]))}>
                  ↓
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {probs.length > 0 && <div class="small orange mt4">{probs.join('；')}。比赛时这些位置会自动补位。</div>}
      <div class="small dim mt4">受伤、停赛的人到比赛那天会自动由板凳上最合适的人代替。</div>

      <div class="sect">先发顺位</div>
      <div class="small dim mb6">排在前面、状态可以（疲劳不高、本周还能投）的人先发。谁都可以排进来。</div>
      {plan.rotation.length > 0 && (
        <div class="lur">
          <div class="lur-row head">
            <span class="c">#</span>
            <span>投手</span>
            <span class="n">投手评价</span>
            <span class="n">球速</span>
            <span class="n">疲劳</span>
            <span class="n">本周</span>
            <span />
          </div>
          {plan.rotation.map((id, i) => {
            const p = byId.get(id);
            if (!p) return null;
            const w = why(p);
            return (
              <div key={id} class="lur-row">
                <span class="c ord">{i + 1}</span>
                <span class="pk-name">
                  <b>{fullName(p)}</b>
                  {w && <span class="tag bad">{w === '伤' ? '受伤' : '停赛'}</span>}
                </span>
                <span class="n">
                  <Num v={posRating(p, 'P')} />
                </span>
                <span class="n">{Math.round(p.a.velocity)}</span>
                <span class="n">
                  <Fatigue v={p.fatigue} bare />
                </span>
                <span class="n dim">{p.pitchesWeek}</span>
                <span class="lu-mv">
                  <button type="button" class="chip" disabled={i === 0} aria-label="上移" onClick={() => update((pl) => ([pl.rotation[i - 1], pl.rotation[i]] = [pl.rotation[i], pl.rotation[i - 1]]))}>
                    ↑
                  </button>
                  <button type="button" class="chip" aria-label="移出先发顺位" onClick={() => update((pl) => pl.rotation.splice(i, 1))}>
                    ×
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}
      <button type="button" class="pickbtn wide mt4" onClick={() => setPick({ kind: 'rot' })}>
        ＋ 加入先发顺位…
      </button>

      <div class="sect">下一场先发</div>
      <NextStarter onPick={() => setPick({ kind: 'next' })} />
      {sheet}
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
