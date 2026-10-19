import type { AttrKey, DevPlan, Player, Pos } from '../../core/types';
import { POSITIONS, POS_ABBR, POS_NAME, EXP_KINDS } from '../../core/types';
import { G } from '../../core/state';
import {
  ATTR_DESC, ATTR_NAME, EXP_NAME, GROWTH_NAME, PERS_DESC, PERS_NAME, WISH_NAME, avgOf, bestPos, eraOf, fullName, gradeLetter, GRADE_COLOR, has, ipStr, isPitcher, obpOf, overall, posRating, slgOf, stars, velScore,
} from '../../core/attrs';
import { rate3 } from '../../core/util';
import { learnNeed, maxPitchCount, maxPitchLv } from '../../core/growth';
import { fbQuality, pitchQuality } from '../../sim/pitching';
import { PITCH_DEFS, type PitchDir } from '../../data/pitches';
import { TRAIT_BY_ID } from '../../data/traits';
import { dateStr } from '../../core/calendar';
import { Bar, Btn, Cond, Fatigue, Gain, Lv, Morale, Num, Ovr, Panel, Portrait, Stars, recentGain } from '../components/common';
import { refresh, ui } from '../store';

/** 慧眼够高（或有影像分析室）才看得到潜力和能力上限 */
export function insightLevel(): number {
  return G.mgr.skills.insight + G.facilities.analysis * 6;
}

const BAT_KEYS: AttrKey[] = ['contact', 'power', 'eye', 'speed', 'arm', 'fielding', 'catching', 'bunt', 'baserun'];
const PIT_KEYS: AttrKey[] = ['control', 'stamina', 'stuff'];

/** 一项能力：名字 | 数值 | 条（竖线是上限） | 附注（上限 / 球速） | 最近成长，每一列宽度固定 */
function AttrRow(p: { pl: Player; k: AttrKey }) {
  const { pl, k } = p;
  const showCap = insightLevel() >= 62;
  const v = pl.a[k];
  const cap = pl.caps[k];
  const vel = k === 'velocity';
  const score = vel ? velScore(v) : v;
  return (
    <div class="arow" title={ATTR_DESC[k]}>
      <span class="an">{ATTR_NAME[k]}</span>
      <span class="av">
        <Num v={score} />
      </span>
      <Bar v={score} mark={showCap ? (vel ? velScore(cap) : cap) : undefined} color={vel ? 'var(--accent2)' : undefined} />
      <span class="ax dim">{vel ? `${Math.round(v)}km/h` : showCap ? `上限 ${Math.round(cap)}` : ''}</span>
      <span class="ag">
        <Gain n={recentGain(pl, k)} />
      </span>
    </div>
  );
}

const DIR_LABEL: Record<PitchDir, string> = { L: '←', DL: '↙', D: '↓', DR: '↘', R: '→', X: '？' };

/** 变化球表：按变化方向排开（左投手左右对调） */
export function PitchChart(p: { pl: Player }) {
  const pl = p.pl;
  const flip = pl.throws === 'L';
  const cell = (dir: PitchDir) => {
    const d: PitchDir = flip ? (({ L: 'R', R: 'L', DL: 'DR', DR: 'DL' } as Record<string, PitchDir>)[dir] ?? dir) : dir;
    const ps = pl.pitches.filter((x) => PITCH_DEFS[x.type].dir === d);
    return (
      <div class={`pcell ${ps.length ? 'has' : ''}`}>
        <span class="pdir">{DIR_LABEL[dir]}</span>
        {ps.map((x) => (
          <div key={x.type} class={`pitem ${x.sig ? 'sig' : ''}`} title={`${PITCH_DEFS[x.type].name}：${PITCH_DEFS[x.type].desc}`}>
            <span class="pname">
              {x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}
              <span class="pq" title="球种质量（0-100）：等级和球威决定，比赛中累了会下降">
                <Num v={pitchQuality(pl, x.type)} />
              </span>
            </span>
            <span class="lv7" title="练习等级（越高质量越好）">
              {'●'.repeat(x.lv)}
              <span class="dim">{'●'.repeat(Math.max(0, 7 - x.lv))}</span>
              <span class="lvn">{x.lv}</span>
            </span>
          </div>
        ))}
      </div>
    );
  };
  const knuckle = pl.pitches.filter((x) => PITCH_DEFS[x.type].dir === 'X');
  const delivery = pl.delivery === 'over' ? '上手' : pl.delivery === 'three' ? '四分之三' : pl.delivery === 'side' ? '侧投' : '下勾';
  // 还不会变化球（多半是野手）：不摆空表，一行说明就好
  if (!pl.pitches.length && !pl.learning) {
    return (
      <div class="small dim mt4">
        还不会变化球，只有直球（最快 {Math.round(pl.a.velocity)} km/h）· 最多可以学 {maxPitchCount(pl)} 种 · {flip ? '左投' : '右投'} {delivery}
      </div>
    );
  }
  return (
    <div class="pchart">
      <div class="prow">
        {cell('L')}
        <div class="pcell fb">
          <span class="pdir">直球</span>
          <b>{Math.round(pl.a.velocity)}</b>
          <small>km/h · 质量 <Num v={fbQuality(pl)} /></small>
        </div>
        {cell('R')}
      </div>
      <div class="prow">
        {cell('DL')}
        {cell('D')}
        {cell('DR')}
      </div>
      {knuckle.length > 0 && (
        <div class="prow">
          <div class="pcell has wide">
            <span class="pdir">？</span>
            {knuckle.map((x) => (
              <div key={x.type} class="pitem">
                <span class="pname">
                  {x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}
                  <span class="pq">
                    <Num v={pitchQuality(pl, x.type)} />
                  </span>
                </span>
                <span class="lv7">
                  {'●'.repeat(x.lv)}
                  <span class="lvn">{x.lv}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div class="small dim mt4">
        数字是球种质量（0-100），圆点是练习等级 · 球种 {pl.pitches.length} / {maxPitchCount(pl)} · 等级上限 {maxPitchLv(pl)} · {flip ? '左投' : '右投'}{' '}
        {delivery}
      </div>
      {pl.learning && (
        <div class="small mt4 row gap6">
          正在练习：<b>{PITCH_DEFS[pl.learning.pitch].name}</b>
          <Bar v={pl.learning.progress} max={learnNeed(pl.learning.pitch)} w={80} color="var(--blue)" />
          {Math.round((pl.learning.progress / learnNeed(pl.learning.pitch)) * 100)}%
        </div>
      )}
    </div>
  );
}

/** 培养方针：谁都可以往投球或打击守备的方向练 */
const PLAN_GROUPS: { name: string; plans: [DevPlan, string, string][] }[] = [
  {
    name: '通用',
    plans: [
      ['auto', '自动', '按现在的位置自动分配：投手练投球，野手练打击和这个位置的守备'],
      ['balanced', '均衡', '各项平均地练（投手练各项投球能力，野手练各项打击守备能力）'],
    ],
  },
  {
    name: '打击守备',
    plans: [
      ['contact', '巧打', '重点练击球和选球眼'],
      ['power', '长打', '重点练力量'],
      ['speed', '速度', '重点练跑速和跑垒'],
      ['defense', '守备', '重点练守备、捕球和肩力'],
    ],
  },
  {
    name: '投球',
    plans: [
      ['pit_velo', '球速', '重点练球速和球威'],
      ['pit_ctrl', '控球', '重点练控球'],
      ['pit_brk', '变化球', '重点练变化球'],
      ['pit_stam', '耐力', '重点练耐力'],
    ],
  },
];

function StatTable(p: { pl: Player; pit: boolean }) {
  const s = p.pl.stats;
  const rows: [string, typeof s.season][] = [['本赛季', s.season], ['高中通算', s.career], ['甲子园', s.koshien]];
  return (
    <div class="scroll-x">
      <table class="stbl">
        <thead>
          {p.pit ? (
            <tr><th>投球</th><th>场</th><th>胜</th><th>负</th><th>局数</th><th>防御率</th><th>三振</th><th>四坏</th></tr>
          ) : (
            <tr><th>打击</th><th>场</th><th>打率</th><th>安打</th><th>本垒打</th><th>打点</th><th>盗垒</th><th>OPS</th></tr>
          )}
        </thead>
        <tbody>
          {rows.map(([name, b]) =>
            p.pit ? (
              <tr key={name}><td>{name}</td><td>{b.pit.g}</td><td>{b.pit.w}</td><td>{b.pit.l}</td><td>{ipStr(b.pit.outs)}</td><td>{b.pit.outs ? eraOf(b.pit).toFixed(2) : '-'}</td><td>{b.pit.so}</td><td>{b.pit.bb}</td></tr>
            ) : (
              <tr key={name}><td>{name}</td><td>{b.bat.g}</td><td>{b.bat.ab ? rate3(avgOf(b.bat)) : '-'}</td><td>{b.bat.h}</td><td>{b.bat.hr}</td><td>{b.bat.rbi}</td><td>{b.bat.sb}</td><td>{b.bat.ab ? rate3(obpOf(b.bat) + slgOf(b.bat)) : '-'}</td></tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

/** 各位置的总评：9 个位置的评价排成一行，最高的标出来 */
function PosRatings(p: { pl: Player }) {
  const pl = p.pl;
  const best = bestPos(pl);
  return (
    <Panel title="各位置的总评" right={<span class="small">最适合：<b class="gold">{POS_NAME[best]}</b></span>}>
      <div class="posr">
        {POSITIONS.map((pos: Pos) => {
          const v = Math.round(posRating(pl, pos));
          return (
            <div key={pos} class={`pr ${pos === best ? 'best' : ''} ${pos === pl.pos && pos !== best ? 'cur' : ''}`} title={`${POS_NAME[pos]}：总评 ${v}`}>
              <small>{POS_ABBR[pos]}</small>
              <b style={{ color: GRADE_COLOR[gradeLetter(v)] }}>{v}</b>
            </div>
          );
        })}
      </div>
      <div class="small dim mt4">
        谁都可以守任何位置，评价完全由能力决定（左投守捕手和二三游会吃亏）。
        {pl.pos !== best ? ` 现在登记为${POS_NAME[pl.pos]}，${POS_NAME[best]}要再明显好一些才会换过去。` : ''}
      </div>
    </Panel>
  );
}

export function PlayerDetail(p: { pl: Player; onBack?: () => void }) {
  const pl = p.pl;
  const pit = isPitcher(pl);
  const ins = insightLevel();
  const potStars = ins >= 45 ? stars(pl.pot) : null;
  const tags: string[] = [];
  if (G.club.captainId === pl.id) tags.push('主将');
  if (pl.joined === 'scholar') tags.push('特待生');
  if (pl.joined === 'gem') tags.push('璞玉');
  if (pl.joined === 'transfer') tags.push('转学生');
  if (pl.retired) tags.push('已引退');
  if (pl.grade === 0) tags.push('内定新生');
  if (pl.benched > 0) tags.push(`停赛 ${pl.benched} 天`);
  const plan = PLAN_GROUPS.flatMap((g) => g.plans).find(([id]) => id === pl.plan);
  const pitchPanel = (
    <Panel title="投球能力" right={<span class="small">投手总评 <Num v={posRating(pl, 'P')} /></span>}>
      <AttrRow pl={pl} k="velocity" />
      {PIT_KEYS.map((k) => (
        <AttrRow key={k} pl={pl} k={k} />
      ))}
      <PitchChart pl={pl} />
    </Panel>
  );
  const batPanel = (
    <Panel title="打击与守备" right={<span class="small">弹道 {'↗'.repeat(pl.traj)}<span class="dim">{'↗'.repeat(4 - pl.traj)}</span></span>}>
      {BAT_KEYS.map((k) => (
        <AttrRow key={k} pl={pl} k={k} />
      ))}
      <AttrRow pl={pl} k="mental" />
      <AttrRow pl={pl} k="durability" />
      {ins < 62 && <div class="small dim mt4">提升「慧眼」或升级影像分析室，就能看到能力上限（条上的竖线）。</div>}
    </Panel>
  );
  return (
    <div class="pdetail">
      {p.onBack && (
        <div class="pd-back">
          <Btn small onClick={p.onBack}>
            ◀ 返回名单
          </Btn>
        </div>
      )}
      <div class="phead">
        <Portrait player={pl} size="big" />
        <div class="ph-main">
          <div class="pname">
            {fullName(pl)}
            {tags.map((t) => (
              <span key={t} class="tag">
                {t}
              </span>
            ))}
          </div>
          <div class="dim">
            {pl.grade ? `${pl.grade} 年级` : '中学三年级'} · {POS_NAME[pl.pos]} · {pl.throws === 'R' ? '右投' : '左投'}
            {pl.bats === 'R' ? '右打' : pl.bats === 'L' ? '左打' : '左右开弓'} · {pl.height} cm
            {pl.middle ? ` · 出身 ${pl.middle}` : ''}
          </div>
          <div class="ph-badges">
            <div class="ovr-badge">
              <i>总评</i>
              <Ovr v={overall(pl)} big />
            </div>
            <div class="ph-kv">
              <span>
                <i>潜力</i>
                <Stars n={potStars} />
              </span>
              <span title={PERS_DESC[pl.pers]}>
                <i>性格</i>
                {PERS_NAME[pl.pers]}
              </span>
              <span>
                <i>成长</i>
                {GROWTH_NAME[pl.growth]}
              </span>
              <span>
                <i>志愿</i>
                {WISH_NAME[pl.wish]}
              </span>
            </div>
          </div>
          {pl.draft && (
            <div class="gold small mt4">
              {pl.draft.team} {pl.draft.round ? `${pl.draft.round} 位` : '育成'}指名
            </div>
          )}
        </div>
      </div>
      <div class="pstat">
        <div>
          <i>调子</i>
          <Cond v={pl.cond} text />
        </div>
        <div>
          <i>疲劳</i>
          <Fatigue v={pl.fatigue} bare />
        </div>
        <div>
          <i>干劲</i>
          <Morale v={pl.morale} bare />
        </div>
        <div>
          <i>信赖</i>
          <Lv v={pl.trust} />
        </div>
        <div>
          <i>学力</i>
          <Lv v={pl.academics} color={pl.academics < 35 ? 'var(--hot)' : undefined} />
        </div>
      </div>
      {pl.injury && (
        <div class="injline bad">
          伤：{pl.injury.name}（还要 {Math.ceil(pl.injury.days)} 天）
        </div>
      )}

      <PosRatings pl={pl} />
      {pit ? pitchPanel : batPanel}
      {pit ? batPanel : pitchPanel}

      <Panel title="特殊能力">
        {pl.traits.length ? (
          <div class="traits">
            {pl.traits.map((id) => {
              const t = TRAIT_BY_ID[id];
              return (
                <span key={id} class={`trait ${t?.good ? 'good' : 'badt'} ${id === 'monster' ? 'gold' : ''}`} title={t?.desc}>
                  {t?.name ?? id}
                </span>
              );
            })}
          </div>
        ) : (
          <div class="dim small">还没有特殊能力。训练、比赛和事件中都有机会获得。</div>
        )}
      </Panel>

      {pl.grade >= 1 && !pl.retired && (
        <Panel title="培养方针">
          <div class="plans">
            {PLAN_GROUPS.map((g) => (
              <div key={g.name} class="plan-row">
                <span class="plan-l">{g.name}</span>
                <div class="plan-b">
                  {g.plans.map(([id, name, desc]) => (
                    <Btn
                      key={id}
                      small
                      on={pl.plan === id}
                      title={desc}
                      onClick={() => {
                        pl.plan = id;
                        refresh();
                      }}
                    >
                      {name}
                    </Btn>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div class="small dim mt4">{plan ? `「${plan[1]}」：${plan[2]}。` : ''}新经验的两成会留给另一边（练投球的人也练打击守备，反过来也一样）。</div>
          <div class="expgrid mt6">
            {EXP_KINDS.map((k) => (
              <span key={k}>
                <i>{EXP_NAME[k]}经验</i>
                <b>{Math.floor(pl.exp[k])}</b>
              </span>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="成绩">
        <StatTable pl={pl} pit={pit} />
        {(pit ? pl.stats.career.bat.g > 0 : pl.stats.career.pit.g > 0) && (
          <div class="mt6">
            <StatTable pl={pl} pit={!pit} />
          </div>
        )}
      </Panel>

      {pl.notes.length > 0 && (
        <Panel title="个人档案">
          <div class="glist">
            {pl.notes
              .slice()
              .reverse()
              .slice(0, 12)
              .map((n, i) => (
                <div key={i} class="lrow lr-note">
                  <span class="dim">{dateStr(n.d, G.startYear)}</span>
                  <span>{n.t}</span>
                </div>
              ))}
          </div>
        </Panel>
      )}
      {has(pl, 'monster') && <div class="small gold mt4">「怪物」：百年一遇的天才。</div>}
    </div>
  );
}

export function closePlayer(): void {
  ui.playerId = null;
  refresh();
}
