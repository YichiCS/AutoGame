// 招生：每年 4 月新生入部；特待生、怪物、璞玉等可以由事件提前内定
import type { Player, Pos } from './types';
import { G, log, milestone, mySchool, note } from './state';
import { chance, gauss, pick, randInt, weightedPick } from './rng';
import { clamp } from './util';
import { generatePlayer } from './player';
import { fullName, isPitcher, overall } from './attrs';
import { yearIdx } from './calendar';
import { PREFS } from '../data/prefectures';
import { MIDDLE_SUFFIX } from '../data/names';

export const ROSTER_MAX = 48;

/** 本校今年招生的平均素质 */
export function recruitQuality(): number {
  const s = mySchool();
  const m = G.mgr;
  const raw = 18 + s.prestige * 0.36 + m.rep * 0.2 + (m.skills.recruiting - 50) * 0.1 + G.facilities.dorm * 1.5 + (G.difficulty === 'easy' ? 2 : G.difficulty === 'hard' ? -2 : 0);
  // 再有名，好苗子也有限：高处收敛
  return raw <= 45 ? raw : 45 + (raw - 45) * 0.35;
}

/** 本校今年大约能招到几个人 */
export function classSize(): number {
  const s = mySchool();
  return Math.round(clamp(7 + s.prestige / 14 + G.mgr.rep / 25 + G.facilities.dorm * 0.8 + (G.mgr.skills.recruiting - 50) / 20, 6, 18));
}

function middleName(): string {
  return `${pick(PREFS[G.prefId].cities)}${pick(MIDDLE_SUFFIX)}`;
}

/** 生成一个中学三年级的新生（grade 0，4 月入学） */
export function makeProspect(o: { quality: number; pos?: Pos; potBias?: number; monster?: boolean; joined?: Player['joined'] }): Player {
  const p = generatePlayer({ quality: o.quality, grade: 0, pos: o.pos, potBias: o.potBias, monster: o.monster, enrollYear: yearIdx(G.day) + 1 });
  p.middle = middleName();
  p.joined = o.joined ?? 'regular';
  return p;
}

/** 内定一个新生 */
export function commit(p: Player): void {
  G.players[p.id] = p;
  if (!G.incoming.includes(p.id)) G.incoming.push(p.id);
}

/** 2 月：确定今年的新生名单（加上之前通过事件内定的） */
export function decideClass(): Player[] {
  const pol = G.policies.recruit;
  const n = Math.max(0, Math.min(classSize(), ROSTER_MAX - (G.roster.length - countGraduating()) - G.incoming.length));
  const base = recruitQuality();
  const out: Player[] = [];
  for (let i = 0; i < n; i++) {
    // 一般入部：最后几个是自愿加入的普通学生
    const walkon = i >= n - Math.max(1, Math.round(n * 0.3));
    let q = base + gauss(0, 6) - (walkon ? 9 : 0);
    let potBias = 0;
    if (pol === 'ready') {
      q += 4;
      potBias = -8;
    } else if (pol === 'potential') {
      q -= 4;
      potBias = 12;
    }
    const gem = walkon && chance(0.06);
    const p = makeProspect({ quality: q, potBias: gem ? potBias + 28 : potBias, joined: gem ? 'gem' : walkon ? 'walkon' : 'regular' });
    commit(p);
    out.push(p);
  }
  return out;
}

function countGraduating(): number {
  return G.roster.filter((id) => G.players[id]?.grade === 3).length;
}

/** 4 月 1 日：新生入部 */
export function enrollClass(): Player[] {
  const ps = G.incoming.map((id) => G.players[id]).filter(Boolean);
  for (const p of ps) {
    p.grade = 1;
    p.enrollYear = yearIdx(G.day);
    note(p, `从${p.middle ?? '中学'}入部`);
    if (!G.roster.includes(p.id)) G.roster.push(p.id);
  }
  G.incoming = [];
  if (ps.length) log(`新生入部：${ps.length} 人`, 'info');
  const monster = ps.find((p) => p.traits.includes('monster'));
  if (monster) milestone(`「怪物」${fullName(monster)} 入部`);
  return ps;
}

/** 有名的中学生（事件用）：素质比本校平均高一截 */
export function notableProspect(kind: 'star' | 'gem' | 'monster'): Player {
  const base = recruitQuality();
  if (kind === 'monster') return makeProspect({ quality: base + 14, monster: true, joined: 'scholar' });
  if (kind === 'gem') return makeProspect({ quality: base - 6, potBias: 34, joined: 'gem' });
  const pos: Pos = chance(0.45) ? 'P' : weightedPick<[Pos, number]>([['SS', 3], ['CF', 3], ['C', 2], ['3B', 2], ['2B', 1], ['RF', 1]], (x) => x[1])[0];
  return makeProspect({ quality: base + randInt(8, 14), pos, potBias: 6, joined: 'scholar' });
}

/** 一句话描述中学生 */
export function prospectBrief(p: Player): string {
  const pit = isPitcher(p);
  const key = pit ? `最快 ${Math.round(p.a.velocity)} km/h，${p.pitches.length} 种变化球` : `击球 ${Math.round(p.a.contact)} · 力量 ${Math.round(p.a.power)} · 跑速 ${Math.round(p.a.speed)}`;
  return `${p.middle} · ${pit ? '投手' : '野手'} · 综合 ${Math.round(overall(p))} · ${key}`;
}
