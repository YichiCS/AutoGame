// 所有事件在这里汇总（导入即注册），以及每天的随机事件抽选
import './system';
import './players';
import './club';
import { G } from '../state';
import { chance, weightedPick } from '../rng';
import { EVENTS, type EventDef } from './registry';
import { blocked, queue } from '../queue';

export { EVENTS };

function weightOf(d: EventDef): number {
  try {
    return typeof d.weight === 'function' ? d.weight() : d.weight ?? 0;
  } catch {
    return 0;
  }
}

/** 随机事件的平均间隔（天） */
export const EVENT_EVERY = 8;

/** 每天：有一定机会发生一件随机事件 */
export function rollRandomEvent(): void {
  if (blocked()) return;
  if (G.day - G.lastBlockDay < 3) return;
  if (!chance(1 / EVENT_EVERY)) return;
  const ids = Object.keys(EVENTS).filter((id) => weightOf(EVENTS[id]) > 0 && (G.cooldowns[`ev_${id}`] ?? -1) <= G.day);
  for (let tries = 0; tries < 8 && ids.length; tries++) {
    const id = weightedPick(ids, (k) => weightOf(EVENTS[k]));
    ids.splice(ids.indexOf(id), 1);
    const d = EVENTS[id];
    let ctx = null;
    try {
      ctx = d.ctx ? d.ctx() : {};
    } catch (e) {
      console.error('event ctx', id, e);
    }
    if (!ctx) continue;
    G.cooldowns[`ev_${id}`] = G.day + (d.cd ?? 60);
    queue(id, ctx);
    return;
  }
}

/** 随机事件的数量（帮助页面显示用） */
export function eventCount(): { random: number; total: number } {
  const all = Object.values(EVENTS);
  return { random: all.filter((d) => d.weight !== undefined).length, total: all.length };
}
