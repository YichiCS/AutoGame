// 事件选项的「潜在结果」：把每个选项在复制出来的游戏状态上模拟若干次，汇总会发生哪些变化。
// 不影响真正的游戏：
//   · 先记下真正的状态 G、随机数状态、世界缓存、id 计数器、事件统计和练习场的活动表，最后原样放回；
//   · 每次模拟都换上一份 structuredClone 的副本，并且在换上副本之后才重新生成弹窗——
//     选项的 apply 闭包只能抓到副本里的对象（例如 gripTip 在 build 时就取出了变化球对象）；
//   · 随机数改用分层抽样（拉丁超立方）：24 次模拟里每一次抽到的数均匀铺满 0～1，
//     「30% 受伤」这类概率和「80～200 万円」这类范围都比较准；
//     第一次模拟就没用到随机数的选项，结果是确定的，只模拟一次；
//   · 模拟期间动态不通知界面（不弹提示、不放音效）。
import type { GameState, Player, QueueItem } from './types';
import { ALL_ATTRS, EXP_KINDS, FACILITY_IDS, MGR_SKILLS, POS_NAME } from './types';
import { G, idSnapshot, muteLog, setG } from './state';
import { getRngState, hash32, localRng, setRandSource, setRngState } from './rng';
import { buildView, queueStats } from './queue';
import { worldCacheSnapshot } from './world';
import { activity, INTENSITY } from './daily';
import { ATTR_NAME, WISH_NAME } from './attrs';
import { MGR_SKILL_NAME } from './career';
import { FACILITY_DEFS } from './economy';
import { PITCH_DEFS } from '../data/pitches';
import { TRAIT_BY_ID } from '../data/traits';
import './events';

/** 有随机性的选项模拟几次 */
export const PREVIEW_RUNS = 24;

export type OutcomeTone = 'good' | 'bad' | 'info';

export interface OutcomeTag {
  text: string;
  tone: OutcomeTone;
}

export interface ChoicePreview {
  tags: OutcomeTag[];
  /** 模拟了几次（1 = 结果是确定的） */
  runs: number;
}

// ---------- 一次模拟的变化 ----------
type Unit = '' | 'money' | 'kmh' | 'days' | 'lv';

interface Fx {
  /** 排在第几组：0 跳槽 1 部费 2 球员个人 4 全队 / 一部分人 5 球队 6 监督、方针、其他 */
  sec: number;
  /** 组内的顺序 */
  o: number;
  label: string;
  /** 数值；只表示「发生了」的为 1 */
  v: number;
  flag?: boolean;
  unit?: Unit;
  /** 数值不带正负号（天数、时长） */
  plain?: boolean;
  /** +1 越多越好，-1 越少越好，0 无所谓好坏 */
  pol: 1 | -1 | 0;
  /** 个人的变化：哪名球员、显示时用的名字 */
  pid?: number;
  who?: string;
  /** 同一类变化（落在不同人身上时合并成「某人」） */
  metric?: string;
  /** 附加说明（伤病名、球种名） */
  note?: string;
}

type Run = Map<string, Fx>;

interface PMetric {
  k: string;
  label: string;
  get: (p: Player) => number;
  pol: 1 | -1;
  unit?: Unit;
  o: number;
}

const expSum = (p: Player): number => EXP_KINDS.reduce((s, e) => s + p.exp[e] + (p.xo?.[e] ?? 0), 0);

/** 球员身上会看的数值 */
const P_METRICS: PMetric[] = [
  { k: 'morale', label: '干劲', get: (p) => p.morale, pol: 1, o: 10 },
  { k: 'trust', label: '信赖', get: (p) => p.trust, pol: 1, o: 11 },
  { k: 'fatigue', label: '疲劳', get: (p) => p.fatigue, pol: -1, o: 12 },
  { k: 'cond', label: '调子', get: (p) => p.cond, pol: 1, o: 13 },
  ...ALL_ATTRS.map((k, i): PMetric => ({ k: `a.${k}`, label: k === 'velocity' ? '球速' : ATTR_NAME[k], get: (p) => p.a[k], pol: 1, unit: k === 'velocity' ? 'kmh' : '', o: 20 + i })),
  { k: 'traj', label: '弹道', get: (p) => p.traj, pol: 1, o: 40 },
  { k: 'exp', label: '经验', get: expSum, pol: 1, o: 41 },
  { k: 'academics', label: '学力', get: (p) => p.academics, pol: 1, o: 42 },
  { k: 'pop', label: '人气', get: (p) => p.pop, pol: 1, o: 43 },
  { k: 'ethic', label: '练习态度', get: (p) => p.ethic, pol: 1, o: 44 },
];

const CLUB_METRICS: { k: 'chemistry' | 'tactics' | 'board' | 'ob' | 'fans' | 'scandal'; label: string; pol: 1 | -1; o: number }[] = [
  { k: 'chemistry', label: '默契', pol: 1, o: 1 },
  { k: 'tactics', label: '战术熟练度', pol: 1, o: 2 },
  { k: 'board', label: '校方', pol: 1, o: 3 },
  { k: 'ob', label: 'OB 会', pol: 1, o: 4 },
  { k: 'fans', label: '球迷', pol: 1, o: 5 },
  { k: 'scandal', label: '不祥事隐患', pol: -1, o: 7 },
];

const DELIVERY_NAME: Record<Player['delivery'], string> = { over: '上手投法', three: '四分之三投法', side: '侧投', under: '下勾投法' };
const BATS_NAME: Record<Player['bats'], string> = { R: '右打', L: '左打', S: '左右开弓' };
const USE_NAME: Record<GameState['policies']['pitcherUse'], string> = { ace: '王牌主义', rotation: '轮换', bullpen: '继投' };
const GRADE_NAME = ['', '一年级', '二年级', '三年级'];

const isActive = (p: Player | undefined): p is Player => !!p && p.grade >= 1 && p.grade <= 3 && !p.retired;

/** 比较模拟后的副本和真正的状态，列出变化。mainPid：弹窗里的那名球员 */
function diffRun(real: GameState, sim: GameState, mainPid: number | undefined): Run {
  const fx: Run = new Map();
  // 跳槽：其他变化都是换学校带来的，不再细看
  if (sim.schoolId !== real.schoolId) {
    fx.set('move', { sec: 0, o: 0, label: `转任${sim.schools[sim.schoolId]?.name ?? '其他学校'}`, v: 1, flag: true, pol: 0 });
    return fx;
  }
  const num = (key: string, f: Omit<Fx, 'v'>, d: number) => {
    if (Math.abs(d) >= 0.5) fx.set(key, { ...f, v: d });
  };
  num('funds', { sec: 1, o: 0, label: '部费', unit: 'money', pol: 1 }, sim.funds - real.funds);

  // ---- 球员 ----
  const insight = real.mgr.skills.insight + real.facilities.analysis * 6;
  const active = real.roster.filter((id) => isActive(real.players[id]));
  // 名字：姓；队里有同姓的就用全名
  const famCount = new Map<string, number>();
  for (const id of real.roster) {
    const p = real.players[id];
    if (p) famCount.set(p.fam, (famCount.get(p.fam) ?? 0) + 1);
  }
  const nameOf = (p: Player) => ((famCount.get(p.fam) ?? 0) > 1 ? `${p.fam} ${p.given}` : p.fam);
  const solo = (p: Player, key: string, f: Omit<Fx, 'pid' | 'who' | 'sec'>) => fx.set(`p:${p.id}:${key}`, { ...f, sec: 2, pid: p.id, who: nameOf(p), metric: f.metric ?? key });

  const ids = new Set<number>([...real.roster, ...sim.roster, ...real.incoming, ...sim.incoming]);
  const realRoster = new Set(real.roster);
  const simRoster = new Set(sim.roster);
  const realIn = new Set(real.incoming);
  const simIn = new Set(sim.incoming);
  /** 数值变化：metric → (pid → 变化量)，之后判断是不是全队一起变 */
  const deltas = new Map<string, Map<number, number>>();
  for (const id of ids) {
    const a = real.players[id];
    const b = sim.players[id];
    const who = a ?? b;
    if (!who) continue;
    if (realRoster.has(id) && !simRoster.has(id)) {
      solo(who, 'left', { o: 0, label: '离队', v: 1, flag: true, pol: -1 });
      continue;
    }
    if (!realRoster.has(id) && simRoster.has(id)) {
      solo(who, 'join', { o: 0, label: '入部', v: 1, flag: true, pol: 1 });
      continue;
    }
    if (!realIn.has(id) && simIn.has(id)) {
      solo(who, 'commit', { o: 0, label: '4 月入学', v: 1, flag: true, pol: 1 });
      continue;
    }
    if (!a || !b) continue;
    for (const m of P_METRICS) {
      const d = m.get(b) - m.get(a);
      if (Math.abs(d) < 0.5) continue;
      let t = deltas.get(m.k);
      if (!t) deltas.set(m.k, (t = new Map()));
      t.set(id, d);
    }
    // 伤病
    if (!a.injury && b.injury) solo(b, 'inj', { o: 1, label: '受伤', v: b.injury.days, unit: 'days', plain: true, pol: -1, note: b.injury.name });
    else if (a.injury && !b.injury) solo(b, 'heal', { o: 1, label: '伤愈', v: 1, flag: true, pol: 1 });
    else if (a.injury && b.injury && Math.abs(b.injury.days - a.injury.days) >= 0.5) solo(b, 'injd', { o: 2, label: '伤病', v: b.injury.days - a.injury.days, unit: 'days', pol: -1 });
    const bench = Math.max(0, b.benched) - Math.max(0, a.benched);
    if (bench >= 0.5) solo(b, 'bench', { o: 3, label: '停赛', v: bench, unit: 'days', plain: true, pol: -1 });
    // 能力上限、潜力（慧眼不够时只说升降，不给数字）
    const capD = ALL_ATTRS.map((k) => b.caps[k] - a.caps[k]).filter((d) => Math.abs(d) >= 0.5);
    if (capD.length) {
      const up = capD.every((d) => d > 0);
      const same = capD.every((d) => Math.round(d) === Math.round(capD[0]));
      if (insight >= 62 && same) solo(b, 'caps', { o: 50, label: '能力上限', v: capD[0], pol: 1 });
      else solo(b, up ? 'caps+' : 'caps-', { o: 50, label: up ? '能力上限提升' : '能力上限下降', v: 1, flag: true, pol: up ? 1 : -1 });
    }
    const potD = b.pot - a.pot;
    if (Math.abs(potD) >= 0.5) {
      if (insight >= 45) solo(b, 'pot', { o: 51, label: '潜力', v: potD, pol: 1 });
      else solo(b, potD > 0 ? 'pot+' : 'pot-', { o: 51, label: potD > 0 ? '潜力提升' : '潜力下降', v: 1, flag: true, pol: potD > 0 ? 1 : -1 });
    }
    // 特殊能力
    for (const t of b.traits) {
      if (a.traits.includes(t)) continue;
      const good = TRAIT_BY_ID[t]?.good ?? true;
      solo(b, `tr+:${t}`, { o: 60, label: `获得「${TRAIT_BY_ID[t]?.name ?? t}」`, v: 1, flag: true, pol: good ? 1 : -1, metric: 'tr+' });
    }
    for (const t of a.traits) {
      if (b.traits.includes(t)) continue;
      const good = TRAIT_BY_ID[t]?.good ?? true;
      solo(b, `tr-:${t}`, { o: 61, label: `失去「${TRAIT_BY_ID[t]?.name ?? t}」`, v: 1, flag: true, pol: good ? -1 : 1, metric: 'tr-' });
    }
    // 变化球
    for (const ps of b.pitches) {
      const old = a.pitches.find((x) => x.type === ps.type);
      if (!old) {
        solo(b, `pt+:${ps.type}`, { o: 62, label: `学会${PITCH_DEFS[ps.type].name}`, v: 1, flag: true, pol: 1, metric: 'pt+', note: PITCH_DEFS[ps.type].name });
        continue;
      }
      if (ps.lv !== old.lv) solo(b, `plv:${ps.type}`, { o: 63, label: ps.sig ?? PITCH_DEFS[ps.type].name, v: ps.lv - old.lv, unit: 'lv', pol: 1, metric: 'plv' });
      if (ps.sig && !old.sig) solo(b, `sig:${ps.type}`, { o: 64, label: `魔球「${ps.sig}」`, v: 1, flag: true, pol: 1, metric: 'sig' });
    }
    if (b.learning && (!a.learning || a.learning.pitch !== b.learning.pitch)) solo(b, 'learn', { o: 65, label: `开始练习${PITCH_DEFS[b.learning.pitch].name}`, v: 1, flag: true, pol: 1 });
    if (a.pos !== b.pos) solo(b, 'pos', { o: 66, label: `位置改为${POS_NAME[b.pos]}`, v: 1, flag: true, pol: 0 });
    if (a.bats !== b.bats) solo(b, 'bats', { o: 67, label: `改为${BATS_NAME[b.bats]}`, v: 1, flag: true, pol: 0 });
    if (a.delivery !== b.delivery) solo(b, 'deliv', { o: 68, label: `改为${DELIVERY_NAME[b.delivery]}`, v: 1, flag: true, pol: 0 });
    if (a.wish !== b.wish) solo(b, 'wish', { o: 69, label: `志愿改为${WISH_NAME[b.wish]}`, v: 1, flag: true, pol: 0 });
  }

  // 数值：三人以上一起朝同一个方向变（同样多）的，算成全队 / 某个年级 / 投手 / 野手 / 几个人
  const groups: [string, number[]][] = [
    ['全队', active],
    ...[1, 2, 3].map((g): [string, number[]] => [GRADE_NAME[g], active.filter((id) => real.players[id].grade === g)]),
    ['投手', active.filter((id) => real.players[id].pos === 'P')],
    ['野手', active.filter((id) => real.players[id].pos !== 'P')],
  ];
  for (const m of P_METRICS) {
    const t = deltas.get(m.k);
    if (!t) continue;
    const list = [...t.entries()];
    // 最常见的变化量（数值相同的人最多的那个；一样多时取绝对值大的）
    const freq = new Map<number, number>();
    for (const [, d] of list) freq.set(Math.round(d), (freq.get(Math.round(d)) ?? 0) + 1);
    const mode = [...freq.entries()].sort((x, y) => y[1] - x[1] || Math.abs(y[0]) - Math.abs(x[0]))[0][0];
    // 和大家同方向的算进群体（到了上下限、变得少一点的也算）；方向不同的、以及变化量和大家不一样的主角单独列出
    const crowd = new Set(list.filter(([id, d]) => Math.sign(Math.round(d)) === Math.sign(mode) && !(id === mainPid && Math.round(d) !== mode)).map(([id]) => id));
    let label: string | null = null;
    if (crowd.size >= 3) {
      for (const [name, g] of groups) {
        if (g.length < 2 || ![...crowd].every((id) => g.includes(id))) continue;
        const missing = g.filter((id) => !crowd.has(id)).length;
        if (missing <= Math.max(1, Math.floor(g.length * 0.15))) {
          label = name;
          break;
        }
      }
      label ??= `${crowd.size} 人`;
      fx.set(`g:${label}:${m.k}`, { sec: 4, o: m.o, label: `${label}${m.label}`, v: mode, unit: m.unit, pol: m.pol });
    }
    for (const [id, d] of list) {
      if (label && crowd.has(id)) continue;
      const p = real.players[id];
      fx.set(`p:${id}:${m.k}`, { sec: 2, o: m.o, label: m.label, v: d, unit: m.unit, pol: m.pol, pid: id, who: nameOf(p), metric: m.k });
    }
  }

  // ---- 球队 ----
  for (const c of CLUB_METRICS) num(`club:${c.k}`, { sec: 5, o: c.o, label: c.label, pol: c.pol }, sim.club[c.k] - real.club[c.k]);
  num('rep', { sec: 5, o: 6, label: '名声', pol: 1 }, sim.mgr.rep - real.mgr.rep);
  const ban = Math.max(0, sim.club.banUntil - Math.max(real.day, real.club.banUntil));
  num('ban', { sec: 5, o: 8, label: '禁止对外比赛', unit: 'days', plain: true, pol: -1 }, ban);
  // ---- 监督、设施、方针 ----
  for (const k of MGR_SKILLS) num(`skill:${k}`, { sec: 6, o: 0, label: MGR_SKILL_NAME[k], pol: 1 }, sim.mgr.skills[k] - real.mgr.skills[k]);
  for (const id of FACILITY_IDS) num(`fac:${id}`, { sec: 6, o: 1, label: `${FACILITY_DEFS[id].name}等级`, pol: 1 }, sim.facilities[id] - real.facilities[id]);
  if (real.building && sim.building && real.building.id === sim.building.id) {
    num('build', { sec: 6, o: 2, label: `${FACILITY_DEFS[sim.building.id].name}工期`, unit: 'days', pol: -1 }, sim.building.left - real.building.left);
  }
  if (sim.policies.intensity !== real.policies.intensity) {
    fx.set('pol:int', { sec: 6, o: 3, label: `训练强度改为「${INTENSITY[sim.policies.intensity]?.name ?? ''}」`, v: 1, flag: true, pol: 0 });
  }
  if (sim.policies.pitcherUse !== real.policies.pitcherUse) {
    fx.set('pol:use', { sec: 6, o: 4, label: `投手起用改为「${USE_NAME[sim.policies.pitcherUse]}」`, v: 1, flag: true, pol: 0 });
  }
  const flagUp = (k: string) => (sim.flags[k] ?? 0) > (real.flags[k] ?? 0) && (sim.flags[k] ?? 0) > real.day;
  if (flagUp('healthBless')) fx.set('flag:bless', { sec: 6, o: 5, label: '受伤风险降低', v: sim.flags.healthBless - real.day, unit: 'days', plain: true, pol: 1 });
  if (flagUp('austerity')) fx.set('flag:aus', { sec: 6, o: 6, label: '训练用具降级', v: sim.flags.austerity - real.day, unit: 'days', plain: true, pol: -1 });
  if ((sim.flags.invite ?? -1) !== (real.flags.invite ?? -1)) fx.set('flag:invite', { sec: 6, o: 7, label: '本周末打招待赛', v: 1, flag: true, pol: 0 });
  return fx;
}

// ---------- 汇总多次模拟 ----------
interface Agg {
  f: Fx;
  /** 出现在第几次模拟里 */
  runs: Set<number>;
  vals: number[];
  notes: Set<string>;
}

const UNIT_TEXT: Record<Unit, string> = { '': '', money: ' 万円', kmh: ' km/h', days: ' 天', lv: ' 级' };

/** 整齐一点的步长：1、2、5、10、20、50…… */
function niceStep(x: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, x))));
  for (const m of [1, 2, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

function numText(n: number, unit: Unit, plain: boolean): string {
  const abs = Math.abs(n);
  const s = unit === 'money' ? abs.toLocaleString('en-US') : String(abs);
  if (plain) return s;
  return n > 0 ? `+${s}` : n < 0 ? `−${s}` : '±0';
}

function valueText(vals: number[], unit: Unit, plain: boolean, sampled: boolean): string {
  const rs = vals.map((v) => Math.round(v));
  let lo = Math.min(...rs);
  let hi = Math.max(...rs);
  // 抽样得到的范围往外取整（抽样不一定正好抽到两端）
  if (sampled && hi - lo >= 20) {
    const st = niceStep((hi - lo) / PREVIEW_RUNS);
    lo = Math.floor(lo / st) * st;
    hi = Math.ceil(hi / st) * st;
  }
  // 负数从小到大写（−20～−50）
  if (hi < 0) [lo, hi] = [hi, lo];
  const body = lo === hi ? numText(lo, unit, plain) : `${numText(lo, unit, plain)}～${numText(hi, unit, plain)}`;
  return body + UNIT_TEXT[unit];
}

function summarize(runs: Run[], mainPid: number | undefined, choiceLabel: string): OutcomeTag[] {
  const N = runs.length;
  if (!N) return [];
  const agg = new Map<string, Agg>();
  runs.forEach((r, i) => {
    for (const [k, f] of r) {
      // 有正有负的数值拆成两条，各算各的概率
      const key = f.flag ? k : `${k}|${f.v > 0 ? '+' : '-'}`;
      let a = agg.get(key);
      if (!a) agg.set(key, (a = { f, runs: new Set(), vals: [], notes: new Set() }));
      a.runs.add(i);
      a.vals.push(f.v);
      if (f.note) a.notes.add(f.note);
    }
  });

  // 每次落在不同人身上的个人变化（比如随机某人受伤）合并成「某人」
  const byMetric = new Map<string, string[]>();
  for (const [k, a] of agg) {
    if (a.f.pid === undefined || a.f.pid === mainPid || a.runs.size >= N) continue;
    const mk = `${a.f.metric}|${k.endsWith('|-') ? '-' : '+'}`;
    byMetric.set(mk, [...(byMetric.get(mk) ?? []), k]);
  }
  for (const [mk, keys] of byMetric) {
    const pids = new Set(keys.map((k) => agg.get(k)!.f.pid));
    if (pids.size < 2) continue;
    const first = agg.get(keys[0])!;
    const m: Agg = { f: { ...first.f, pid: undefined, who: undefined, label: `某人${first.f.label}`, sec: 3 }, runs: new Set(), vals: [], notes: new Set() };
    for (const k of keys) {
      const a = agg.get(k)!;
      a.runs.forEach((x) => m.runs.add(x));
      m.vals.push(...a.vals);
      a.notes.forEach((x) => m.notes.add(x));
      agg.delete(k);
    }
    agg.set(`some:${mk}`, m);
  }
  // 同一个人学会的新球种每次不一样：合并成「学会新球种」
  const ptByPid = new Map<number, string[]>();
  for (const [k, a] of agg) if (a.f.metric === 'pt+' && a.f.pid !== undefined && a.runs.size < N) ptByPid.set(a.f.pid, [...(ptByPid.get(a.f.pid) ?? []), k]);
  for (const [pid, keys] of ptByPid) {
    if (keys.length < 2) continue;
    const first = agg.get(keys[0])!;
    const m: Agg = { f: { ...first.f, label: '学会新球种' }, runs: new Set(), vals: [1], notes: new Set() };
    for (const k of keys) {
      const a = agg.get(k)!;
      a.runs.forEach((x) => m.runs.add(x));
      a.notes.forEach((x) => m.notes.add(x));
      agg.delete(k);
    }
    agg.set(`pt+:${pid}`, m);
  }

  // 名字：只涉及一个人，而且他就是弹窗里那名球员、或者选项文字里已经写了他的名字时，不再写名字
  const people = new Map<number, string>();
  for (const a of agg.values()) if (a.f.pid !== undefined) people.set(a.f.pid, a.f.who ?? '');
  const [onlyPid, onlyName] = people.size === 1 ? [...people.entries()][0] : [undefined, ''];
  const named = people.size > 1 || (people.size === 1 && onlyPid !== mainPid && !(onlyName && choiceLabel.includes(onlyName.split(' ')[0])));

  const list = [...agg.values()].sort((x, y) => {
    const sx = x.f.sec + (x.f.pid !== undefined && x.f.pid !== mainPid ? 0.5 : 0);
    const sy = y.f.sec + (y.f.pid !== undefined && y.f.pid !== mainPid ? 0.5 : 0);
    return sx - sy || (x.f.pid ?? 0) - (y.f.pid ?? 0) || x.f.o - y.f.o;
  });
  return list.map((a) => {
    const f = a.f;
    const k = a.runs.size;
    const prob = k < N ? `约 ${Math.min(95, Math.max(5, Math.round((k / N) * 20) * 5))}% ` : '';
    const who = named && f.who ? `${f.who} ` : '';
    let label = f.label;
    if (f.metric === 'inj' || f.label.endsWith('受伤')) {
      if (a.notes.size === 1) label += `·${[...a.notes][0]}`;
    } else if (f.label === '学会新球种' && a.notes.size <= 3) label += `（${[...a.notes].join('、')}）`;
    const text = f.flag ? `${prob}${who}${label}` : `${prob}${who}${label} ${valueText(a.vals, f.unit ?? '', !!f.plain, N > 1)}`;
    const sign = f.flag || f.plain ? 1 : Math.sign(a.vals[0]);
    const s = f.pol * sign;
    return { text, tone: s > 0 ? 'good' : s < 0 ? 'bad' : 'info' };
  });
}

// ---------- 模拟 ----------
/** 字符串 → 整数种子 */
function strSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** 前 64 个质数的平方根的小数部分：各次抽取用不同的无理数步长，互不相关 */
const STEPS: number[] = (() => {
  const out: number[] = [];
  for (let x = 2; out.length < 64; x++) {
    let prime = true;
    for (let d = 2; d * d <= x; d++) if (x % d === 0) prime = false;
    if (prime) out.push(Math.sqrt(x) % 1);
  }
  return out;
})();

/**
 * 分层抽样的随机数（n 次模拟一起用）：
 *   · 第 1 次抽取：n 次模拟各分到 0～1 的一层（顺序打乱）——「30% 受伤」这类一次判定的概率很准；
 *   · 之后的第 j 次抽取：按「走到这一步的第几次模拟」取低差异数列 frac(偏移 + k·√质数)，
 *     只有一部分模拟走到的分支（比如受伤之后的天数）也能均匀铺开；
 *   · 抽得很多的（比如生成一整校的球员）后面改用普通的伪随机数。
 */
function stratified(seed: number, n: number): (run: number) => () => number {
  const r = localRng(seed);
  const first = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const k = Math.floor(r() * (i + 1));
    [first[i], first[k]] = [first[k], first[i]];
  }
  const offset = STEPS.map(() => r());
  const reached = STEPS.map(() => 0);
  return (run) => {
    let j = 0;
    const tail = localRng(hash32(seed, run, 77));
    return () => {
      const d = j++;
      if (d === 0) return (first[run] + 0.5) / n;
      if (d >= STEPS.length) return tail();
      return (offset[d] + reached[d]++ * STEPS[d]) % 1;
    };
  };
}

/** 记下所有会被模拟动到的东西，返回原样放回的函数 */
function saveAll(): () => void {
  const real = G;
  const rng = getRngState();
  const stats = { ...queueStats };
  const world = worldCacheSnapshot();
  const ids = idSnapshot();
  const act = new Map(activity);
  muteLog(true);
  return () => {
    setRandSource(null);
    setG(real);
    setRngState(rng);
    for (const k of Object.keys(queueStats)) if (!(k in stats)) delete queueStats[k];
    Object.assign(queueStats, stats);
    world();
    ids();
    activity.clear();
    for (const [k, v] of act) activity.set(k, v);
    muteLog(false);
  };
}

/**
 * 预览队列里一件事的第 ci 个选项：在副本上模拟（有随机性的模拟 PREVIEW_RUNS 次），汇总成几条标签。
 * 选项不能选、没有效果，或者这件事已经不在队列里时返回 null。
 */
export function previewChoice(item: QueueItem, ci: number): ChoicePreview | null {
  const real = G;
  const idx = real?.queue.indexOf(item) ?? -1;
  if (idx < 0) return null;
  const restore = saveAll();
  const rng = getRngState();
  try {
    const draws = stratified(hash32(strSeed(item.id), ci, 0x5eed), PREVIEW_RUNS);
    const results: Run[] = [];
    let mainPid: number | undefined;
    let label = '';
    let n = PREVIEW_RUNS;
    for (let r = 0; r < n; r++) {
      const sim = structuredClone(real);
      setG(sim);
      setRngState(rng);
      // 弹窗在副本上重新生成：选项闭包抓到的对象（build 时取出的球员、变化球……）都属于副本
      const v = buildView(sim.queue[idx]);
      const ch = v?.choices[ci];
      if (!v || !ch || ch.disabled || !ch.apply) return null;
      mainPid = v.pid;
      label = ch.label;
      let used = 0;
      const next = draws(r);
      setRandSource(() => {
        used++;
        return next();
      });
      let ok = true;
      try {
        ch.apply();
      } catch {
        ok = false;
      }
      setRandSource(null);
      setG(real);
      if (!ok) continue;
      const fx = diffRun(real, sim, mainPid);
      results.push(fx);
      // 没用到随机数（或者是跳槽）：结果是确定的，一次就够
      if (r === 0 && (used === 0 || fx.has('move'))) n = 1;
    }
    return { tags: summarize(results, mainPid, label), runs: results.length };
  } finally {
    restore();
  }
}

/** 一件事的全部选项（测试用；界面里一个选项一个选项地算，不卡画面） */
export function previewEvent(item: QueueItem): (ChoicePreview | null)[] {
  const rng = getRngState();
  const v = buildView(item);
  setRngState(rng);
  if (!v) return [];
  return v.choices.map((_, i) => previewChoice(item, i));
}
