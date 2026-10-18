// 决策队列：需要监督拿主意的事排在这里，时间会暂停；托管的类别按推荐选项自动处理
import type { Ctx, QueueItem } from './types';
import { G, log } from './state';
import { EVENTS, type EventView } from './events/registry';

export interface AutoCat {
  id: string;
  group: string;
  name: string;
  desc: string;
  /** 「小事托管」预设里托管 */
  minor: boolean;
}

export const AUTO_CATS: readonly AutoCat[] = [
  { id: 'player', group: '球员', name: '球员的个人事', desc: '低潮、恋爱、夜练、骄傲自满、想转学……', minor: true },
  { id: 'injury', group: '球员', name: '伤病', desc: '受伤后怎么处理、想提前复出、带伤上场', minor: false },
  { id: 'training', group: '训练', name: '训练与球种', desc: '学新球种、魔球、转位置、改投法、合宿、特训', minor: true },
  { id: 'team', group: '球队', name: '队内的事', desc: '队内气氛、争执、主将、学长与新人', minor: true },
  { id: 'school', group: '学校与地方', name: '学校与地方', desc: '考试、文化祭、家长、OB 会、媒体、地方活动', minor: true },
  { id: 'match', group: '比赛', name: '比赛相关', desc: '练习赛邀请、天气、对手情报', minor: true },
  { id: 'recruit', group: '招生', name: '招生', desc: '中学生来访、特待生、转学生', minor: false },
  { id: 'money', group: '经营', name: '部费', desc: '赞助、捐款、电视台、赤字', minor: false },
  { id: 'build', group: '经营', name: '自动升级设施', desc: '部费宽裕、又没有在施工时，自动升级一项设施', minor: false },
  { id: 'career', group: '监督', name: '监督成长与生涯', desc: '升级时提升哪项能力、其他学校的邀请', minor: false },
  { id: 'notice', group: '消息', name: '通知', desc: '出场决定、夺冠、选秀、毕业、评价（托管就只记在动态里）', minor: false },
  { id: 'summary', group: '消息', name: '年度总结', desc: '每年 3 月底的总结', minor: true },
];

export const AUTO_PRESETS = [
  { id: 'off', name: '全部问我' },
  { id: 'minor', name: '小事托管' },
  { id: 'all', name: '全部托管' },
] as const;

let qid = 1;

/** 每种事件出现的次数（测试、统计用，不存档） */
export const queueStats: Record<string, number> = {};

/** 排一件事进队列 */
export function queue(id: string, ctx: Ctx = {}): void {
  if (!EVENTS[id]) {
    console.warn('unknown event', id);
    return;
  }
  G.queue.push({ qid: Date.now() % 1e9 + qid++, id, ctx });
  queueStats[id] = (queueStats[id] ?? 0) + 1;
}

export function blocked(): boolean {
  return G.queue.length > 0 || !!G.pending;
}

export function buildView(item: QueueItem): EventView | null {
  const def = EVENTS[item.id];
  if (!def) return null;
  try {
    return def.build(item.ctx);
  } catch (e) {
    console.error('event build', item.id, e);
    return null;
  }
}

/** 某一类现在是否托管 */
export function catAuto(cat: string): boolean {
  const mode = G.policies.auto;
  if (mode === 'all') return true;
  if (mode === 'custom') return !!G.policies.autoCats[cat];
  if (mode === 'minor') return !!AUTO_CATS.find((c) => c.id === cat)?.minor;
  return false;
}

export function canAuto(item: QueueItem): boolean {
  const def = EVENTS[item.id];
  if (!def) return true;
  if (def.never) return false;
  return catAuto(def.cat);
}

export function defaultChoice(v: EventView): number {
  let i = v.choices.findIndex((c) => c.def && !c.disabled);
  if (i < 0) i = v.choices.findIndex((c) => !c.disabled);
  return Math.max(0, i);
}

/** 处理一件事。返回选项的结果文字 */
export function resolve(item: QueueItem, choice: number, auto = false): string {
  const i = G.queue.indexOf(item);
  if (i < 0) return '';
  G.queue.splice(i, 1);
  let out = '';
  const v = buildView(item);
  if (v) {
    const ch = v.choices[choice] ?? v.choices[defaultChoice(v)];
    if (ch && !ch.disabled && ch.apply) {
      try {
        out = ch.apply() ?? '';
      } catch (e) {
        console.error('event apply', item.id, e);
      }
    }
    const def = EVENTS[item.id];
    if (auto) {
      const quiet = def?.cat === 'notice' || def?.cat === 'summary';
      log(quiet ? `${v.title}${out ? `：${out}` : ''}` : `[托管] ${v.title} → ${ch?.label ?? ''}${out ? `：${out}` : ''}`, quiet ? 'info' : 'auto');
    } else if (out) log(`${v.title}：${out}`, 'event');
  }
  G.lastBlockDay = G.day;
  autoResolve();
  return out;
}

let busy = false;
export function autoResolve(): void {
  if (busy) return;
  busy = true;
  try {
    let guard = 0;
    let item: QueueItem | undefined;
    while (guard++ < 40 && (item = G.queue.find(canAuto))) {
      const v = buildView(item);
      resolve(item, v ? defaultChoice(v) : 0, true);
    }
  } finally {
    busy = false;
  }
}

/** 测试与离线进度用：全部按推荐处理 */
export function resolveAll(): void {
  let guard = 0;
  while (G.queue.length && guard++ < 100) {
    const item = G.queue[0];
    const v = buildView(item);
    resolve(item, v ? defaultChoice(v) : 0, true);
  }
}
