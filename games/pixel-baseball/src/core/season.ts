// 赛季：每年的大会日程、晋级链、比赛日、练习赛
import type { PendingMatch, SchoolLite, Tour, TourKind } from './types';
import { G, addPrestige, addRep, log, milestone, mySchool, myPlayers } from './state';
import { chance, hash32, randInt, weightedPick, withSeed } from './rng';
import { clamp } from './util';
import { SCHED, doy, isOffseason, weekday, yearIdx } from './calendar';
import { makeTour, myMatch, playAIRound, finishOrder, alive } from './tournament';
import { extSchools, prefRepresentative, schoolById, schoolRating } from './world';
import { PREFS, REGIONS, REGION_BY_ID, springRegionOf, type RegionId } from '../data/prefectures';
import { queue } from './queue';
import { earn } from './economy';
import { myTourWins, unlock } from './career';
import { matchLabel } from './matchday';

export const TOUR_NAME_SHORT: Record<TourKind, string> = {
  springPref: '春季县大会',
  springRegion: '春季地区大会',
  summerPref: '夏季县大会',
  koshien: '夏季甲子园',
  fallPref: '秋季县大会',
  fallRegion: '秋季地区大会',
  jingu: '明治神宫大会',
  senbatsu: '春季选拔',
};

/** 大会结果的排序（用于成绩显示） */
export const TOUR_ORDER: TourKind[] = ['springPref', 'springRegion', 'summerPref', 'koshien', 'fallPref', 'fallRegion', 'jingu', 'senbatsu'];

const pref = () => PREFS[G.prefId];

function prefTeams(districtOnly: boolean): number[] {
  const me = mySchool();
  return Object.values(G.schools)
    .filter((s) => !districtOnly || !pref().districts || s.district === me.district)
    .map((s) => s.id);
}

function seedsOf(ids: number[], n: number): number[] {
  return ids
    .map((id) => G.schools[id])
    .filter(Boolean)
    .sort((a, b) => b.prestige - a.prestige)
    .slice(0, n)
    .map((s) => s.id);
}

const banned = () => G.club.banUntil > G.day;

function prefTourName(kind: 'springPref' | 'summerPref' | 'fallPref'): string {
  const p = pref();
  if (kind === 'summerPref' && p.districts) return `夏季${p.districts[mySchool().district]}大会`;
  if (kind === 'fallPref' && (p.region === 'tokyo' || p.region === 'hokkaido')) return p.region === 'tokyo' ? '秋季东京都大会' : '秋季北海道大会';
  return `${kind === 'springPref' ? '春季' : kind === 'summerPref' ? '夏季' : '秋季'}${p.name}大会`;
}

function createPrefTour(kind: 'springPref' | 'summerPref' | 'fallPref'): Tour {
  const teams = prefTeams(kind === 'summerPref').filter((id) => id !== G.schoolId || !banned());
  const gaps = kind === 'summerPref' ? [3, 3, 3, 2, 2, 2, 1] : [3, 3, 3, 3, 2, 2, 2];
  const t = makeTour(kind, prefTourName(kind), teams, G.day, gaps, { seeds: seedsOf(teams, 8), mercy: true, koshien: false });
  G.tours[kind] = t;
  if (t.myFinish) log(`${t.name}开幕（${teams.length} 校参加）`, 'info');
  return t;
}

/** 地区大会：本县按上一个县大会的名次派出前几名，其他县派代表 */
function createRegionTour(kind: 'springRegion' | 'fallRegion'): Tour | null {
  const src = kind === 'fallRegion' ? G.tours.fallPref : G.tours.springPref;
  if (!src) return null;
  const regionId: RegionId = kind === 'springRegion' ? springRegionOf(pref().region) : pref().region;
  const region = REGION_BY_ID[regionId];
  const slots = kind === 'springRegion' ? 2 : region.fallSlots;
  if (slots <= 0) return null; // 北海道 / 东京：秋季县大会就是地区大会
  const order = finishOrder(src);
  const mine = order.slice(0, slots);
  if (!mine.includes(G.schoolId)) return null;
  const ext: SchoolLite[] = [];
  const teams = [...mine];
  for (const p of PREFS) {
    if (p.id === G.prefId) continue;
    const r = kind === 'springRegion' ? springRegionOf(p.region) : p.region;
    if (r !== regionId) continue;
    const used: number[] = [];
    for (let k = 0; k < slots; k++) {
      const s = prefRepresentative(p.id, G.day, 300 + k + (kind === 'fallRegion' ? 50 : 0), used);
      used.push(s.id);
      ext.push(s);
      teams.push(s.id);
    }
  }
  const name = kind === 'fallRegion' ? region.tourName : `春季${region.name}大会`;
  const t = makeTour(kind, name, teams, G.day, kind === 'fallRegion' ? [3, 3, 2, 2, 2] : [2, 2, 2, 1], { mercy: true, koshien: false, ext });
  G.tours[kind] = t;
  log(`${t.name}开幕：本校以${PREFS[G.prefId].name}第 ${mine.indexOf(G.schoolId) + 1} 名的身份参加`, 'good');
  return t;
}

/** 甲子园：各县代表（北海道、东京各两校） */
function createKoshien(): Tour {
  const ext: SchoolLite[] = [];
  const teams: number[] = [G.schoolId];
  for (const p of PREFS) {
    const n = p.districts ? 2 : 1;
    for (let k = 0; k < n; k++) {
      if (p.id === G.prefId) {
        if (k === mySchool().district) continue;
        // 本县另一个地区的代表：从本县学校里按实力抽
        const others = Object.values(G.schools).filter((s) => s.district === k && s.id !== G.schoolId);
        const s = withSeed(hash32(G.seed, yearIdx(G.day), 17), () => weightedPick(others, (x) => Math.exp((schoolRating(x, G.day) - 50) / 6)));
        teams.push(s.id);
        continue;
      }
      const s = prefRepresentative(p.id, G.day, 500 + k);
      ext.push(s);
      teams.push(s.id);
    }
  }
  const t = makeTour('koshien', '夏季甲子园', teams, G.day, [3, 2, 2, 2, 2, 1], { mercy: false, koshien: true, ext });
  G.tours.koshien = t;
  return t;
}

function nationalField(n: number, salt: number): SchoolLite[] {
  const out: SchoolLite[] = [];
  const used = new Set<number>();
  for (let k = 0; out.length < n && k < 400; k++) {
    const p = withSeed(hash32(G.seed, yearIdx(G.day), salt, k), () => randInt(0, PREFS.length - 1));
    if (p === G.prefId && chance(0.8)) continue;
    const pool = p === G.prefId ? Object.values(G.schools).filter((s) => s.id !== G.schoolId) : extSchools(p);
    const s = withSeed(hash32(G.seed, yearIdx(G.day), salt, k, 1), () => weightedPick(pool, (x) => Math.exp((schoolRating(x, G.day) - 55) / 5)));
    if (used.has(s.id)) continue;
    used.add(s.id);
    out.push(s);
  }
  return out;
}

function createJingu(): Tour {
  const field = nationalField(9, 700);
  const ext = field.filter((s) => !(s.id in G.schools));
  const t = makeTour('jingu', '明治神宫大会', [G.schoolId, ...field.map((s) => s.id)], G.day, [1, 2, 1, 1], { mercy: true, koshien: false, ext });
  G.tours.jingu = t;
  return t;
}

function createSenbatsu(): Tour {
  const field = nationalField(31, 800);
  const ext = field.filter((s) => !(s.id in G.schools));
  const t = makeTour('senbatsu', '春季选拔', [G.schoolId, ...field.map((s) => s.id)], G.day, [2, 2, 2, 1, 1], { mercy: false, koshien: true, ext });
  G.tours.senbatsu = t;
  return t;
}

/** 1 月：选拔出场校发表（看秋季地区大会的成绩） */
function senbatsuSelection(): boolean {
  const reg = REGION_BY_ID[pref().region];
  const fallReg = G.tours.fallRegion;
  const fallPref = G.tours.fallPref;
  let selected = false;
  let reason = '';
  if (fallReg && fallReg.myRank > 0) {
    const order = finishOrder(fallReg);
    const pos = order.indexOf(G.schoolId) + 1;
    if (pos > 0 && pos <= reg.senbatsu) selected = true;
    else if (pos > 0 && pos <= reg.senbatsu + 2 && chance(0.4)) selected = true;
    reason = `秋季地区大会${fallReg.myFinish}`;
  } else if (fallPref && reg.fallSlots === 0 && fallPref.myRank > 0) {
    const order = finishOrder(fallPref);
    const pos = order.indexOf(G.schoolId) + 1;
    if (pos > 0 && pos <= reg.senbatsu) selected = true;
    else if (pos === reg.senbatsu + 1 && chance(0.35)) selected = true;
    reason = `${fallPref.name}${fallPref.myFinish}`;
  }
  // 21 世纪枠：公立学校、秋季县大会打得不错、在地方上有好口碑
  if (!selected && mySchool().type === 'public' && fallPref && fallPref.myRank >= Math.max(3, fallPref.rounds.length - 2) && chance(0.12 + G.club.fans / 100000)) {
    selected = true;
    reason = '21 世纪枠';
  }
  G.flags.senbatsu = selected ? yearIdx(G.day) + 1 : 0;
  queue('senbatsuResult', { selected, reason });
  return selected;
}

/** 大会结束（或本校出局）时的善后 */
function onMyTourChange(t: Tour, wasAlive: boolean): void {
  const me = G.schoolId;
  const nowAlive = alive(t, me);
  if (!wasAlive || nowAlive && !t.done) return;
  const champ = t.champion === me;
  const tot = G.mgr.totals;
  if (champ) {
    const big = t.kind === 'koshien' || t.kind === 'senbatsu';
    G.mgr.exp += big ? 60 : t.kind === 'summerPref' ? 30 : 15;
    addRep(big ? 18 : t.kind === 'summerPref' ? 6 : t.kind === 'jingu' ? 8 : t.kind.endsWith('Region') ? 4 : 3);
    G.club.board = clamp(G.club.board + (big ? 20 : 5), 0, 100);
    G.club.ob = clamp(G.club.ob + (big ? 20 : 6), 0, 100);
    G.club.fans += big ? 15000 : 2500;
    earn(big ? 600 : t.kind === 'summerPref' ? 0 : 60, 'prize');
    addPrestige(big ? 5 : t.kind === 'summerPref' ? 1 : 2);
    if (t.kind === 'summerPref' || t.kind === 'springPref' || t.kind === 'fallPref') tot.prefTitles++;
    if (t.kind === 'koshien') tot.summerTitles++;
    if (t.kind === 'senbatsu') tot.springTitles++;
    if (t.kind === 'jingu') unlock('jinguChamp');
    if (t.kind === 'springRegion' || t.kind === 'fallRegion') unlock('regionChamp');
    if (t.kind === 'koshien' && G.flags.senbatsuChamp === yearIdx(G.day)) unlock('double');
    if (t.kind === 'senbatsu') G.flags.senbatsuChamp = yearIdx(G.day) + 1;
    milestone(`${t.name}优胜`);
    queue('tourWon', { kind: t.kind, name: t.name });
  }
  if (t.kind === 'summerPref' && champ) {
    // 甲子园出场
    tot.koshienApps++;
    mySchool().koshienApps++;
    mySchool().lastKoshien = yearIdx(G.day);
    const fund = Math.round(250 + G.club.fans / 25 + mySchool().prestige * 3);
    earn(fund, 'koshien');
    queue('koshienQualified', { fund });
  }
  // 晋级带来的名声（冠军另算）
  if (!champ && t.myRank > 0) {
    const R = t.rounds.length;
    const deep = t.myRank - (R - 3); // 八强 = 1，四强 = 2，亚军 = 3
    const w = t.kind === 'summerPref' ? 1 : t.koshien ? 0 : 0.5;
    if (deep > 0) addRep(deep * w + (t.kind === 'fallRegion' || t.kind === 'springRegion' ? 0.5 : 0));
    else if (t.myRank <= 1 && mySchool().prestige >= 60 && t.kind === 'summerPref') addRep(-1);
    // 春、秋季大会和全国大会的成绩也会提高学校的名气（夏季县大会和甲子园在 8 月底一起结算）
    if (t.kind !== 'summerPref' && t.kind !== 'koshien') {
      const pg = myTourWins(t) * 0.25 + Math.max(0, deep) * 0.3 + (t.kind.endsWith('Region') ? 0.8 : t.kind === 'jingu' ? 1.5 : t.kind === 'senbatsu' ? 2.5 : 0);
      if (pg) addPrestige(pg);
    }
  }
  if (t.koshien && !champ && t.myRank > 0) {
    // 甲子园上的胜场
    const wins = Math.max(0, t.myRank - 1 - (firstRoundBye(t) ? 1 : 0));
    if (t.myRank >= t.rounds.length - 2) unlock('koshien8');
    addRep(2 + wins * 2);
    G.club.fans += 4000 + wins * 2000;
  }
  if (t.koshien) {
    const wins = myTourWins(t);
    tot.koshienWins += wins;
    mySchool().koshienWins += wins;
  }
  // 夏天结束：三年级引退（甲子园出场的，等甲子园打完）
  if (t.kind === 'koshien' || (t.kind === 'summerPref' && !champ)) {
    G.schedule.push({ d: G.day + 1, kind: 'summerOver', data: { koshien: t.kind === 'koshien', finish: t.myFinish ?? '' } });
  }
}

function firstRoundBye(t: Tour): boolean {
  return t.rounds[0].some((m) => m.note === '轮空' && m.w === G.schoolId);
}

/** 本校比赛的结果写入后调用（大会推进与善后） */
export function afterMyMatch(t: Tour | null): void {
  if (!t) return;
  onMyTourChange(t, true);
}

/** 每天：开幕、选拔、比赛日。返回今天要打的本校比赛 */
export function seasonDaily(): PendingMatch | null {
  const t = doy(G.day);
  if (t === SCHED.springPref) createPrefTour('springPref');
  if (t === SCHED.springRegion) createRegionTour('springRegion');
  if (t === SCHED.summerPref) createPrefTour('summerPref');
  if (t === SCHED.koshien) {
    const sp = G.tours.summerPref;
    if (sp && sp.champion === G.schoolId) createKoshien();
  }
  if (t === SCHED.fallPref) createPrefTour('fallPref');
  if (t === SCHED.fallRegion) createRegionTour('fallRegion');
  if (t === SCHED.jingu) {
    const reg = REGION_BY_ID[pref().region];
    const src = reg.fallSlots > 0 ? G.tours.fallRegion : G.tours.fallPref;
    if (src && src.champion === G.schoolId) createJingu();
  }
  if (t === SCHED.senbatsuAnnounce) senbatsuSelection();
  // flags.senbatsu 存「入选的学年 + 1」，0 表示落选
  if (t === SCHED.senbatsu && G.flags.senbatsu === yearIdx(G.day) + 1) createSenbatsu();

  // 比赛日
  let mine: PendingMatch | null = null;
  for (const kind of TOUR_ORDER) {
    const tour = G.tours[kind];
    if (!tour || tour.done) continue;
    for (let r = 0; r < tour.roundDays.length; r++) {
      if (tour.roundDays[r] !== G.day) continue;
      const wasAlive = alive(tour, G.schoolId);
      playAIRound(tour, r, G.day, schoolById);
      const mm = myMatch(tour, r);
      if (mm && !mine) mine = { tour: kind, round: r, idx: mm.idx, oppId: mm.oppId, home: mm.home, seed: randInt(1, 2 ** 31 - 2), label: matchLabel(kind, tour, r) };
      else if (wasAlive) onMyTourChange(tour, wasAlive);
    }
  }
  return mine ?? practiceGame();
}

/** 周六的练习赛（4~11 月，不在大会期间） */
function practiceGame(): PendingMatch | null {
  if (weekday(G.day) !== 5 || isOffseason(G.day) || G.club.banUntil > G.day) return null;
  const t = doy(G.day);
  if (t >= SCHED.summerPref - 3 && t <= SCHED.newTeam) return null; // 夏天的大会期间
  for (const tour of Object.values(G.tours)) {
    if (!tour || tour.done || !alive(tour, G.schoolId)) continue;
    if (tour.roundDays.some((d) => d >= G.day - 1 && d <= G.day + 3)) return null;
  }
  if (myPlayers().filter((p) => !p.injury).length < 9) return null;
  const invited = G.flags.invite && G.flags.invite >= G.day - 7 ? G.flags.inviteId : 0;
  let opp: SchoolLite | null = invited ? schoolById(invited) : null;
  if (!opp) {
    const me = mySchool();
    const pool = chance(0.7) ? Object.values(G.schools).filter((s) => s.id !== me.id) : extSchools(PREFS[randInt(0, PREFS.length - 1)].id);
    opp = weightedPick(pool, (s) => Math.exp(-Math.abs(s.prestige - me.prestige - 5) / 15));
  }
  G.flags.invite = 0;
  return { tour: null, round: 0, idx: 0, oppId: opp.id, home: chance(0.5), seed: randInt(1, 2 ** 31 - 2), label: invited ? '招待赛' : '练习赛' };
}

/** 新学年：清空上一学年的大会 */
export function newSeason(): void {
  G.tours = {};
  G.seasonWL = [0, 0];
}

/** 下一场本校的正式比赛（显示用） */
export function nextOfficial(): { day: number; label: string; oppId: number | null } | null {
  let best: { day: number; label: string; oppId: number | null } | null = null;
  for (const kind of TOUR_ORDER) {
    const tour = G.tours[kind];
    if (!tour || tour.done || !alive(tour, G.schoolId)) continue;
    tour.roundDays.forEach((d, r) => {
      if (d < G.day) return;
      if (tour.rounds[r].every((m) => m.done)) return;
      const m = tour.rounds[r].find((x) => x.a === G.schoolId || x.b === G.schoolId);
      const opp = m ? (m.a === G.schoolId ? m.b : m.a) : null;
      if (!best || d < best.day) best = { day: d, label: `${tour.name} ${tour.roundNames[r]}`, oppId: opp };
    });
  }
  return best;
}

export const REGION_LIST = REGIONS;

/** 没有参加的大会里，冠军是谁（新闻用） */
export function championNews(t: Tour): string {
  if (!t.done || t.champion === null) return '';
  const s = schoolById(t.champion);
  return s ? `${t.name}：${s.name}夺冠` : '';
}

export function pickRival(): SchoolLite | null {
  const others = Object.values(G.schools).filter((s) => s.id !== G.schoolId);
  if (!others.length) return null;
  return others.sort((a, b) => b.rival + b.prestige * 0.5 - (a.rival + a.prestige * 0.5))[0];
}

