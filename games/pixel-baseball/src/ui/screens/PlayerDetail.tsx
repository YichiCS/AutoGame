import { useState } from 'preact/hooks';
import type { AttrKey, DevPlan, ExpKind, Focus, Pos, PitchType, StatBlock } from '../../core/types';
import { BAT_ATTRS, PIT_ATTRS, MISC_ATTRS, POSITIONS, POS_NAME, POS_SHORT, EXP_KINDS, PITCH_TYPES } from '../../core/types';
import { G } from '../../core/state';
import { Btn, Panel, Grade, Bar, Portrait, Cond, Tabs, Tip, Stars } from '../components/common';
import {
  ATTR_NAME, ATTR_DESC, EXP_NAME, fullName, isPitcher, overall, PERS_NAME, PERS_DESC, GROWTH_NAME, WISH_NAME, velScore, avgOf, obpOf, slgOf, eraOf, ipStr, aptOf, stars, traitList,
} from '../../core/attrs';
import { attrCost, canAfford, raiseAttr, raisePitch, pitchCost, learnTrait, canLearnTrait, traitCost, costTotal, LEARN_NEED, maxPitchLv } from '../../core/growth';
import { TRAITS, TRAIT_BY_ID, PITCH_DEFS } from '../../data/traits';
import { ui, go, refresh, toast } from '../store';
import { clamp } from '../../core/util';
import { statusText } from './Roster';
import { sfx } from '../sound';
import { intelLevel } from '../components/SchoolModal';

const PLAN_BAT: [DevPlan, string][] = [['auto', '自动（按位置）'], ['balanced', '均衡'], ['contact', '巧打型'], ['power', '长打型'], ['speed', '速度型'], ['defense', '守备型'], ['manual', '手动加点']];
const PLAN_PIT: [DevPlan, string][] = [['auto', '自动'], ['balanced', '均衡'], ['pit_velo', '速球派'], ['pit_ctrl', '技巧派'], ['pit_brk', '变化球派'], ['pit_stam', '耐力派'], ['manual', '手动加点']];

function costStr(c: Partial<Record<ExpKind, number>>): string {
  return Object.entries(c)
    .filter(([, v]) => v)
    .map(([k, v]) => `${EXP_NAME[k as ExpKind]}${v}`)
    .join(' ');
}

function StatTable(p: { s: StatBlock; pitcher: boolean }) {
  const b = p.s.bat;
  const t = p.s.pit;
  return (
    <div class="col gap4">
      <table class="px">
        <thead>
          <tr>
            <th>试合</th><th>打席</th><th>打数</th><th>安打</th><th>二垒</th><th>三垒</th><th>本垒</th><th>打点</th><th>得分</th><th>四死</th><th>三振</th><th>盗垒</th><th>牺打</th><th>失误</th><th>打率</th><th>OPS</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{b.g}</td><td>{b.pa}</td><td>{b.ab}</td><td>{b.h}</td><td>{b.d}</td><td>{b.t}</td><td>{b.hr}</td><td>{b.rbi}</td><td>{b.r}</td><td>{b.bb + b.hbp}</td><td>{b.so}</td><td>{b.sb}</td><td>{b.sac + b.sf}</td><td>{b.e}</td>
            <td class="accent">{b.ab ? avgOf(b).toFixed(3).replace(/^0/, '') : '-'}</td>
            <td>{b.ab ? (obpOf(b) + slgOf(b)).toFixed(3).replace(/^0/, '') : '-'}</td>
          </tr>
        </tbody>
      </table>
      {(p.pitcher || t.g > 0) && (
        <table class="px">
          <thead>
            <tr>
              <th>登板</th><th>先发</th><th>胜</th><th>败</th><th>完投</th><th>完封</th><th>投球局</th><th>用球</th><th>被安</th><th>被本</th><th>三振</th><th>四球</th><th>失分</th><th>自责</th><th>防御率</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t.g}</td><td>{t.gs}</td><td>{t.w}</td><td>{t.l}</td><td>{t.cg}</td><td>{t.sho}</td><td>{ipStr(t.outs)}</td><td>{t.np}</td><td>{t.h}</td><td>{t.hr}</td><td>{t.so}</td><td>{t.bb}</td><td>{t.r}</td><td>{t.er}</td>
              <td class="accent">{t.outs ? eraOf(t).toFixed(2) : '-'}</td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

export function PlayerDetail() {
  const p = ui.playerId !== null ? G.players[ui.playerId] : null;
  const [statTab, setStatTab] = useState<'season' | 'career' | 'koshien'>('season');
  if (!p) {
    return (
      <div>
        球员不存在。<Btn onClick={() => go('roster')}>返回</Btn>
      </div>
    );
  }
  const mine = p.schoolId === G.club.schoolId;
  const school = G.schools[p.schoolId];
  const insight = G.manager.skills.insight;
  const showCaps = mine && insight >= 55;
  const showPot = insight >= 45;
  const pitcher = isPitcher(p);
  const st = statusText(p);
  const talkKey = `talk_${p.id}`;
  const talked = (G.flags[talkKey] ?? -1) === G.absWeek;

  const attrRow = (k: AttrKey) => {
    const v = p.a[k];
    const isVel = k === 'velocity';
    const shown = isVel ? velScore(v) : v;
    const cap = p.caps[k];
    const capShown = isVel ? velScore(cap) : cap;
    const c = attrCost(p, k);
    const afford = canAfford(p, c);
    return (
      <div key={k} class="row" style={{ padding: '2px 0' }}>
        <Tip tip={ATTR_DESC[k]}>
          <span style={{ width: '52px', display: 'inline-block' }} class="muted">{ATTR_NAME[k]}</span>
        </Tip>
        <span style={{ width: '64px' }}>
          {isVel ? <span class="accent">{Math.floor(v)}km/h</span> : <Grade v={v} />}
        </span>
        <div class="grow">
          <Bar v={shown} mark={showCaps ? capShown : undefined} color={shown >= capShown && showCaps ? 'var(--orange)' : undefined} />
        </div>
        {showCaps && <span class="small dim" style={{ width: '44px' }}>{isVel ? `${Math.round(cap)}` : `上限${Math.round(cap)}`}</span>}
        {mine && (
          <Tip tip={`消耗：${costStr(c)}${v >= cap ? '\n（已超过潜力上限，消耗3倍）' : ''}`}>
            <Btn
              small
              disabled={!afford}
              onClick={() => {
                if (raiseAttr(p, k)) {
                  sfx('click');
                  refresh();
                }
              }}
            >
              +
            </Btn>
          </Tip>
        )}
      </div>
    );
  };

  const focusValue = (f: Focus | null): string => {
    if (!f) return 'none';
    if (f.kind === 'attr') return `attr:${f.attr}`;
    if (f.kind === 'pitch') return `pitch:${f.pitch}`;
    if (f.kind === 'pos') return `pos:${f.pos}`;
    return f.kind;
  };
  const setFocus = (v: string) => {
    if (v === 'none') p.focus = null;
    else if (v === 'rest' || v === 'study') p.focus = { kind: v };
    else {
      const [k, x] = v.split(':');
      if (k === 'attr') p.focus = { kind: 'attr', attr: x as AttrKey };
      if (k === 'pitch') {
        p.focus = { kind: 'pitch', pitch: x as PitchType };
        if (!p.learning || p.learning.pitch !== x) p.learning = { pitch: x as PitchType, progress: 0 };
      }
      if (k === 'pos') p.focus = { kind: 'pos', pos: x as Pos };
    }
    refresh();
  };

  const learnable = mine ? TRAITS.filter((t) => canLearnTrait(p, t.id)) : [];
  const negatives = traitList(p).filter((t) => !t.good);

  return (
    <div class="col">
      <div class="row">
        <Btn onClick={() => go(ui.backTab === 'player' ? 'roster' : ui.backTab)}>◀ 返回</Btn>
        <div class="page-title" style={{ margin: 0 }}>
          {fullName(p)}
          <span class="sub">
            {school?.name ?? '无所属'} · {p.grade >= 1 && p.grade <= 3 ? `${p.grade}年级` : p.grade === 0 ? '中学生' : 'OB'} · {POS_NAME[p.pos]}
          </span>
        </div>
      </div>
      <div class="grid3" style={{ gridTemplateColumns: '260px minmax(0,1fr) minmax(0,1fr)' }}>
        <div class="col">
          <Panel title="资料">
            <div class="row">
              <Portrait player={p} size="big" />
              <div class="col gap4">
                <div>综合 <Grade v={overall(p)} /></div>
                <div class="small">{p.throws === 'L' ? '左投' : '右投'}{p.bats === 'S' ? '两打' : p.bats === 'L' ? '左打' : '右打'} · {p.height}cm</div>
                {pitcher && <div class="small">{p.delivery === 'over' ? '上手投' : p.delivery === 'three' ? '斜上手' : p.delivery === 'side' ? '侧投' : '下手投'}</div>}
                <div class="small">弹道 {'↗'.repeat(p.traj)}</div>
                <div class={`small ${st.cls}`}>{st.text}</div>
              </div>
            </div>
            <div class="kv mt8 small">
              <span class="k">性格</span>
              <Tip tip={PERS_DESC[p.pers]}>
                <span>{PERS_NAME[p.pers]}</span>
              </Tip>
              <span class="k">潜力</span>
              <span>{showPot ? <Stars n={stars(p.pot)} /> : <span class="dim">？（慧眼不足）</span>}</span>
              <span class="k">成长型</span>
              <span>{insight >= 65 ? GROWTH_NAME[p.growth] : <span class="dim">？</span>}</span>
              <span class="k">练习态度</span>
              <span>
                <Grade v={p.ethic} />
              </span>
              <span class="k">进路志向</span>
              <span>{WISH_NAME[p.wish]}</span>
              <span class="k">入部方式</span>
              <span>{{ recruit: '招募', walkon: '一般入部', transfer: '转学', scholar: '特待生', gen: '—' }[p.joined]}</span>
              {p.middle && (
                <>
                  <span class="k">出身中学</span>
                  <span>{p.middle}</span>
                </>
              )}
            </div>
          </Panel>
          <Panel title="状态">
            <div class="kv small">
              <span class="k">调子</span>
              <Cond v={p.cond} text />
              <span class="k">疲劳</span>
              <Bar v={p.fatigue} color={p.fatigue > 60 ? 'var(--red)' : 'var(--orange)'} />
              <span class="k">干劲</span>
              <Bar v={p.morale} color="var(--green)" />
              <span class="k">信赖</span>
              <Bar v={p.trust} color="var(--blue)" />
              <span class="k">学力</span>
              <Bar v={p.academics} color={p.academics < 35 ? 'var(--red)' : 'var(--purple)'} />
              <span class="k">人气</span>
              <Bar v={p.pop} color="var(--pink)" />
            </div>
            {p.injury && (
              <div class="bad small mt8">
                {p.injury.name}，预计还需 {p.injury.weeks} 周
              </div>
            )}
            {mine && !p.retired && (
              <div class="row wrap gap4 mt8">
                <Tip tip="消耗 1 行动力：提升干劲与信赖（每周一次）">
                  <Btn
                    small
                    disabled={talked || G.manager.ap < 1}
                    onClick={() => {
                      G.manager.ap--;
                      G.flags[talkKey] = G.absWeek;
                      const gain = 6 + G.manager.skills.leadership / 12 + (p.pers === 'shy' ? 4 : 0) + (p.pers === 'hot' ? 3 : 0);
                      p.morale = clamp(p.morale + gain, 0, 100);
                      p.trust = clamp(p.trust + 4, 0, 100);
                      toast(`与${p.fam}促膝长谈，干劲 +${Math.round(gain)}`, 'good');
                      refresh();
                    }}
                  >
                    个别谈话
                  </Btn>
                </Tip>
                <Btn
                  small
                  disabled={G.club.captainId === p.id}
                  onClick={() => {
                    G.club.captainId = p.id;
                    p.morale = clamp(p.morale + 8, 0, 100);
                    toast(`${fullName(p)}被任命为主将`, 'good');
                    refresh();
                  }}
                >
                  任命主将
                </Btn>
                <Btn small onClick={() => setFocus(p.focus?.kind === 'rest' ? 'none' : 'rest')} on={p.focus?.kind === 'rest'}>
                  休养
                </Btn>
              </div>
            )}
          </Panel>
        </div>
        <div class="col">
          <Panel title={pitcher ? '投手能力' : '野手能力'} right={mine ? <span class="small muted">点击 + 消耗经验加点</span> : undefined}>
            {!mine && intelLevel() < 20 ? (
              <div class="hint-box">情报不足，无法得知其他学校球员的详细能力。聘请数据分析员、建设影像分析室或提升慧眼后即可查看。</div>
            ) : (
              <>
                {(pitcher ? PIT_ATTRS : BAT_ATTRS).map(attrRow)}
                <hr class="px" />
                {(pitcher ? BAT_ATTRS.slice(0, 4) : PIT_ATTRS.slice(0, 2)).map(attrRow)}
                {MISC_ATTRS.map(attrRow)}
              </>
            )}
          </Panel>
          {mine && (
            <Panel title="经验点">
              <div class="row wrap">
                {EXP_KINDS.map((k) => (
                  <span key={k} class="tag fill">
                    {EXP_NAME[k]} <span class="accent">{Math.floor(p.exp[k])}</span>
                  </span>
                ))}
              </div>
              <div class="row mt8">
                <span class="muted">培养方针</span>
                <select
                  class="px"
                  value={p.plan}
                  onChange={(e) => {
                    p.plan = (e.target as HTMLSelectElement).value as DevPlan;
                    refresh();
                  }}
                >
                  {(pitcher ? PLAN_PIT : PLAN_BAT).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div class="row mt8">
                <span class="muted">个别练习</span>
                <select class="px" value={focusValue(p.focus)} onChange={(e) => setFocus((e.target as HTMLSelectElement).value)}>
                  <option value="none">无</option>
                  <optgroup label="重点提升能力">
                    {[...(pitcher ? PIT_ATTRS : BAT_ATTRS), ...MISC_ATTRS].map((k) => (
                      <option key={k} value={`attr:${k}`}>
                        {ATTR_NAME[k]}
                      </option>
                    ))}
                  </optgroup>
                  {pitcher && (
                    <optgroup label="学习新变化球">
                      {PITCH_TYPES.filter((t) => !p.pitches.some((x) => x.type === t)).map((t) => (
                        <option key={t} value={`pitch:${t}`}>
                          {PITCH_DEFS[t].name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="守位转换">
                    {POSITIONS.filter((x) => x !== p.pos).map((x) => (
                      <option key={x} value={`pos:${x}`}>
                        {POS_NAME[x]}（{Math.round(aptOf(p, x))}）
                      </option>
                    ))}
                  </optgroup>
                  <option value="rest">休养</option>
                  <option value="study">学习</option>
                </select>
              </div>
              {p.learning && (
                <div class="small mt8">
                  学习{PITCH_DEFS[p.learning.pitch].name}：<Bar v={p.learning.progress} max={LEARN_NEED} color="var(--blue)" />
                </div>
              )}
              <div class="small dim mt8">自动方针会在每周训练后自动消耗经验。设为「手动加点」可自行分配，也可以用来积攒经验学习特殊能力。</div>
            </Panel>
          )}
        </div>
        <div class="col">
          {pitcher && (
            <Panel title="变化球">
              {p.pitches.length === 0 && <div class="dim">只会投直球</div>}
              {p.pitches.map((x, i) => {
                const c = pitchCost(p, i);
                return (
                  <div key={x.type} class="row" style={{ padding: '2px 0' }}>
                    <span style={{ width: '60px' }}>{PITCH_DEFS[x.type].name}</span>
                    <span class="accent" style={{ width: '40px' }}>Lv{x.lv}</span>
                    <div class="grow">
                      <Bar v={x.lv} max={7} mark={showCaps ? maxPitchLv(p) : undefined} color="var(--blue)" />
                    </div>
                    {mine && (
                      <Tip tip={`消耗：${costStr(c)}`}>
                        <Btn small disabled={!canAfford(p, c) || x.lv >= 7} onClick={() => raisePitch(p, i) && refresh()}>
                          +
                        </Btn>
                      </Tip>
                    )}
                  </div>
                );
              })}
            </Panel>
          )}
          <Panel title="特殊能力">
            <div class="row wrap gap4">
              {traitList(p).map((t) => (
                <Tip key={t.id} tip={TRAIT_BY_ID[t.id]?.desc ?? ''}>
                  <span class={`tag ${t.good ? 'good' : 'bad'}`}>{t.name}</span>
                </Tip>
              ))}
              {!p.traits.length && <span class="dim">无</span>}
            </div>
            {mine && (learnable.length > 0 || negatives.length > 0) && (
              <div class="mt8">
                <div class="muted small">可学习 / 克服：</div>
                {negatives.map((t) => {
                  const c = traitCost(p, t.id)!;
                  return (
                    <div key={t.id} class="row small" style={{ padding: '1px 0' }}>
                      <span class="grow">克服「{t.name}」</span>
                      <span class="dim">{costStr(c)}</span>
                      <Btn small disabled={!canAfford(p, c)} onClick={() => learnTrait(p, t.id) && (toast('克服了负面特性！', 'good'), refresh())}>
                        克服
                      </Btn>
                    </div>
                  );
                })}
                {learnable.map((t) => (
                  <div key={t.id} class="row small" style={{ padding: '1px 0' }}>
                    <Tip tip={t.desc} class="grow">
                      <span>{t.name}</span>
                    </Tip>
                    <span class="dim">{costStr(t.cost ?? {})}</span>
                    <Btn small disabled={!canAfford(p, t.cost ?? {})} onClick={() => learnTrait(p, t.id) && (toast(`学会了「${t.name}」！`, 'good'), refresh())}>
                      学习
                    </Btn>
                  </div>
                ))}
                <div class="small dim mt8">提示：学习特殊能力消耗较多经验，可把培养方针设为「手动」来积攒。合计 {Math.floor(costTotal(p.exp))} 点。</div>
              </div>
            )}
          </Panel>
          <Panel title="守备适性">
            <div class="grid3 small">
              {POSITIONS.map((x) => (
                <div key={x} class="row between">
                  <span class={x === p.pos ? 'accent' : 'muted'}>{POS_SHORT[x]}</span>
                  <Grade v={aptOf(p, x)} />
                </div>
              ))}
            </div>
            {mine && (
              <div class="row mt8">
                <span class="muted small">主守位</span>
                <select
                  class="px"
                  value={p.pos}
                  onChange={(e) => {
                    const np = (e.target as HTMLSelectElement).value as Pos;
                    if (aptOf(p, np) < 40) {
                      toast('该位置适性太低，请先进行守位转换练习', 'bad');
                      return;
                    }
                    p.pos = np;
                    refresh();
                  }}
                >
                  {POSITIONS.map((x) => (
                    <option key={x} value={x}>
                      {POS_NAME[x]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </Panel>
        </div>
      </div>
      <Panel title="成绩">
        <Tabs
          value={statTab}
          onChange={setStatTab}
          tabs={[
            { id: 'season', label: '本季公式战' },
            { id: 'career', label: '高中通算' },
            { id: 'koshien', label: '甲子园' },
          ]}
        />
        <StatTable s={p.stats[statTab]} pitcher={pitcher} />
      </Panel>
    </div>
  );
}
