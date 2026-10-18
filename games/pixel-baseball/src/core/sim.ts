// 模拟主循环：每天一个 tick
import type { Player, TourKind, YearRecord } from './types';
import { G, addRep, log, milestone, mySchool, myPlayers, seniors } from './state';
import { chance, randInt } from './rng';
import { clamp, sortBy } from './util';
import { SCHED, doy, doyOf, domOf, schoolYear, yearIdx } from './calendar';
import { emptyBlock, eraOf, fullName, isPitcher, avgOf } from './attrs';
import { dailyTeam, exams, weatherDaily } from './daily';
import { buildingDaily, monthlyMoney, autoBuildPick, startUpgrade, moneyStr } from './economy';
import { seasonDaily, newSeason, afterMyMatch, TOUR_ORDER, championNews } from './season';
import { simulatePending, applyResult, tourOf, type SimResult } from './matchday';
import { decideClass, enrollClass } from './recruit';
import { graduate, runDraft, proYearly, PATH_NAME } from './draft';
import { checkAchievements, checkLevelUp, goalMet, makeOffers, prestigeDrift, setGoal, unlock, ACHIEVEMENTS } from './career';
import { autoResolve, blocked, catAuto, queue, resolveAll } from './queue';
import { rollRandomEvent } from './events';
import { PITCH_DEFS } from '../data/pitches';

export { blocked };

/** 推进一天 */
export function tick(): void {
  G.day++;
  const t = doy(G.day);
  if (t === SCHED.newYear) newYear();
  if (domOf(G.day) === 1) monthly();
  buildingDaily();
  weatherDaily();
  runSchedule();
  calendar(t);
  const pm = seasonDaily();
  dailyTeam(!!pm);
  if (pm) G.pending = pm;
  rollRandomEvent();
  if (catAuto('build') && !G.building) {
    const id = autoBuildPick();
    if (id) startUpgrade(id);
  }
  G.mgr.exp += 0.06;
  if (checkLevelUp()) queue('mgrLevel', { level: G.mgr.level });
  if (G.day % 7 === 0) checkAchievements();
  autoResolve();
}

/** 待打的比赛直接出结果（不观战） */
export function resolvePendingNow(): SimResult | null {
  const pm = G.pending;
  if (!pm) return null;
  const res = simulatePending(pm);
  finishPending(res);
  return res;
}

/** 观战结束（或跳过）后写入结果 */
export function finishPending(res: SimResult): void {
  if (!G.pending || G.pending.seed !== res.pm.seed) return;
  applyResult(res);
  G.pending = null;
  afterMyMatch(tourOf(res.pm));
  checkAchievements();
  if (checkLevelUp()) queue('mgrLevel', { level: G.mgr.level });
  G.lastBlockDay = G.day;
  autoResolve();
}

/** 离线进度：按 1 倍速补上，遇到需要决定的事就停（比赛直接出结果） */
export function catchUp(days: number): number {
  let n = 0;
  while (n < days) {
    if (G.pending) resolvePendingNow();
    if (blocked()) break;
    tick();
    n++;
  }
  if (G.pending) resolvePendingNow();
  return n;
}

/** 测试用：一路推进，所有决定都按推荐处理 */
export function runDays(days: number): void {
  for (let i = 0; i < days; i++) {
    if (G.pending) resolvePendingNow();
    resolveAll();
    tick();
  }
  if (G.pending) resolvePendingNow();
  resolveAll();
}

// ---------- 日程 ----------
function runSchedule(): void {
  const due = G.schedule.filter((x) => x.d <= G.day);
  if (!due.length) return;
  G.schedule = G.schedule.filter((x) => x.d > G.day);
  for (const it of due) {
    try {
      if (it.kind === 'summerOver') summerOver(!!it.data?.koshien, String(it.data?.finish ?? ''));
    } catch (e) {
      console.error('schedule', it, e);
    }
  }
}

function calendar(t: number): void {
  if (t === doyOf(5, 3)) queue('gwCamp');
  if (t === SCHED.exam1 || t === SCHED.exam2) exams();
  if (t === SCHED.newTeam) newTeam();
  if (t === doyOf(9, 5)) offersSeason();
  if (t === SCHED.draft) {
    const { picks, passed } = runDraft();
    if (picks.length || passed.length) {
      queue('draftResult', {
        picks: picks.map((d) => `${d.name}：${d.team}${d.ikusei ? '育成' : ''}第 ${d.round} 轮`),
        passed: passed.map(fullName),
      });
      if (picks.some((d) => d.round === 1 && !d.ikusei)) unlock('draft1');
    }
  }
  if (t === SCHED.winterCamp) queue('winterCamp');
  if (t === SCHED.newYearDay) queue('newYearShrine');
  if (t === doyOf(2, 1)) decideClass();
  if (t === SCHED.graduation) {
    const grads = graduate();
    if (grads.length) queue('graduation', { lines: grads.map((a) => `${a.name}（${a.summary.split(' · ')[0]}）→ ${PATH_NAME[a.path]}${a.proTeam ? `（${a.proTeam}）` : ''}`) });
    for (const n of proYearly()) log(`OB 近况：${n}`, 'info');
  }
  if (t === SCHED.yearEnd) yearEnd();
}

function monthly(): void {
  monthlyMoney();
  const c = G.club;
  c.board = clamp(c.board + (55 - c.board) * 0.05, 0, 100);
  c.ob = clamp(c.ob + (50 - c.ob) * 0.05, 0, 100);
  c.fans = Math.round(c.fans * 0.985);
  c.scandal = Math.max(0, c.scandal - 2);
  if (G.funds < 0 && (G.cooldowns.deficit ?? -1) <= G.day) {
    G.cooldowns.deficit = G.day + 60;
    queue('deficit');
  }
}

/** 4 月 1 日：新学年 */
function newYear(): void {
  for (const id of G.roster) {
    const p = G.players[id];
    if (!p) continue;
    p.grade = Math.min(3, p.grade + 1);
    p.stats.season = emptyBlock();
    p.gains = 0;
  }
  const fresh = enrollClass();
  newSeason();
  setGoal();
  G.mgr.totals.seasons++;
  // 名声慢慢向中间回归（不常出成绩就会被淡忘）
  addRep(-(G.mgr.rep - 20) * 0.04);
  if (fresh.length) queue('newClass', { ids: fresh.map((p) => p.id) });
}

/** 夏天结束：三年级引退 */
function summerOver(koshien: boolean, finish: string): void {
  const third = myPlayers().filter((p) => p.grade === 3);
  for (const p of third) p.retired = true;
  if (G.club.captainId && G.players[G.club.captainId]?.retired) G.club.captainId = null;
  if (third.length) {
    log(`三年级生（${third.length} 人）引退了`, 'info');
    queue('summerOver', { koshien, finish });
  }
}

/** 8 月 28 日：新队伍。评价今年的目标、任命主将 */
function newTeam(): void {
  // 还没打完夏天（比如本校没进县大会）也在这一天引退
  if (myPlayers().some((p) => p.grade === 3)) summerOver(false, G.tours.summerPref?.myFinish ?? '');
  prestigeDrift();
  const met = goalMet();
  const goal = G.club.goal;
  if (goal) {
    const priv = mySchool().type === 'private';
    G.club.board = clamp(G.club.board + (met ? 12 : priv ? -14 : -9), 0, 100);
    queue('evaluation', { met, goal: goal.text, board: G.club.board });
    G.flags.missed = met ? 0 : (G.flags.missed ?? 0) + 1;
    if (!met && G.club.board < (priv ? 15 : 8) && (G.flags.missed ?? 0) >= 2) {
      const offers = makeOffers(3, false);
      if (offers.length) queue('dismissal', { offers: offers.map((o) => JSON.stringify(o)) });
    }
  }
  const cands = sortBy(myPlayers().filter((p) => p.grade === 2), (p) => p.trust + p.a.mental + (p.pers === 'leader' ? 20 : 0) + (p.traits.includes('captain') ? 30 : 0)).slice(0, 3);
  if (cands.length) queue('captain', { cands: cands.map((p) => p.id) });
}

/** 9 月：其他学校的邀请 */
function offersSeason(): void {
  if (G.mgr.rep < 25 || !chance(0.25 + G.mgr.rep / 200)) return;
  const offers = makeOffers(G.mgr.rep >= 60 ? 2 : 1, true);
  if (offers.length) queue('offers', { offers: offers.map((o) => JSON.stringify(o)) });
}

// ---------- 年度总结 ----------
function bestBy(ps: Player[], f: (p: Player) => number): Player | null {
  let best: Player | null = null;
  let bv = -Infinity;
  for (const p of ps) {
    const v = f(p);
    if (v > bv) {
      bv = v;
      best = p;
    }
  }
  return best;
}

function yearEnd(): void {
  const y = yearIdx(G.day);
  const sy = schoolYear(G.day, G.startYear);
  const ps = [...myPlayers(), ...seniors()];
  const results: Partial<Record<TourKind, string>> = {};
  for (const k of TOUR_ORDER) {
    const t = G.tours[k];
    if (t && t.myFinish) results[k] = t.myFinish;
  }
  const ace = bestBy(ps.filter((p) => isPitcher(p) && p.stats.season.pit.outs >= 27), (p) => p.stats.season.pit.w * 3 - eraOf(p.stats.season.pit) * 2 + p.stats.season.pit.so * 0.1);
  const bat = bestBy(ps.filter((p) => p.stats.season.bat.ab >= 20), (p) => p.stats.season.bat.hr * 4 + avgOf(p.stats.season.bat) * 100);
  const grower = sortBy(myPlayers().filter((p) => (p.gains ?? 0) > 0), (p) => p.gains ?? 0).slice(0, 3);
  const met = goalMet();
  const rec: YearRecord = {
    year: sy,
    schoolName: mySchool().name,
    results,
    w: G.seasonWL[0],
    l: G.seasonWL[1],
    goal: G.club.goal?.text ?? '',
    goalMet: met,
    best: ace ? `${fullName(ace)}（${ace.stats.season.pit.w} 胜）` : bat ? `${fullName(bat)}（${bat.stats.season.bat.hr} 本垒打）` : '',
  };
  G.history.push(rec);
  if (G.history.length > 60) G.history.shift();
  const book = G.books.find((b) => b.year === y);
  const sum = (o?: Record<string, number>) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);
  const newAch = ACHIEVEMENTS.filter((a) => G.achievements[a.id] !== undefined && yearIdx(G.achievements[a.id]) === y);
  const res = TOUR_ORDER.filter((k) => results[k]).map((k) => `${G.tours[k]!.name}：${results[k]}`);
  const lines = [
    `${sy} 学年，${mySchool().name}的正式比赛战绩：${G.seasonWL[0]} 胜 ${G.seasonWL[1]} 负。`,
    `校方的目标「${rec.goal}」：${met ? '达成' : '未达成'}`,
    '',
    '各大会成绩：',
    ...(res.length ? res.map((x) => `· ${x}`) : ['· （没有参加正式大会）']),
    '',
    ace ? `王牌：${fullName(ace)}　${ace.stats.season.pit.w} 胜 ${ace.stats.season.pit.l} 负 · 防御率 ${eraOf(ace.stats.season.pit).toFixed(2)} · ${ace.stats.season.pit.so} 三振` : '',
    bat ? `主炮：${fullName(bat)}　打率 ${avgOf(bat.stats.season.bat).toFixed(3).replace(/^0/, '')} · ${bat.stats.season.bat.hr} 本垒打 · ${bat.stats.season.bat.rbi} 打点` : '',
    grower.length ? `成长最多：${grower.map((p) => `${fullName(p)}（+${p.gains}）`).join('、')}` : '',
    '',
    book ? `部费：收入 ${moneyStr(sum(book.in))}，支出 ${moneyStr(sum(book.out))}，结余 ${moneyStr(G.funds)}` : '',
    `监督名声：${Math.round(G.mgr.rep)}　通算 ${G.mgr.totals.w} 胜 ${G.mgr.totals.l} 负`,
    newAch.length ? `今年解锁的成就：${newAch.map((a) => a.name).join('、')}` : '',
  ].filter((x, i, a) => x !== '' || (a[i - 1] !== '' && i > 0));
  // 其他大会的冠军（新闻）
  const news = TOUR_ORDER.map((k) => G.tours[k]).filter((t) => t && t.done && t.champion !== G.schoolId && t.koshien).map((t) => championNews(t!));
  if (news.length) lines.push('', ...news);
  queue('yearSummary', { year: sy, lines });
  milestone(`${sy} 学年：${G.seasonWL[0]} 胜 ${G.seasonWL[1]} 负${res.length ? '，' + res.join('，') : ''}`);
}

/** 显示用：变化球的一句话 */
export function pitchList(p: Player): string {
  return p.pitches.map((x) => `${x.sig ? `「${x.sig}」` : PITCH_DEFS[x.type].name}${x.lv}`).join(' ');
}

