// 游戏主循环：按周推进
import type { Notice, PendingChoice, PendingMatch, School, TourKind, Tournament, WeekReport } from './types';
import { G, mySchool, myPlayers, addRep } from './state';
import { chance, gauss, weightedPick } from './rng';
import { clamp, sortBy } from './util';
import { SCHED, WEEKS, dateLabel, isOffseason } from './calendar';
import { PREFS, REGIONS, REGION_BY_ID, springRegionOf } from '../data/prefectures';
import { makeTournament, playRoundAI, quickBracket, recordResult } from './tournament';
import {
  schoolsInPref, schoolStrength, materialize, dematerialize, rosterPlayers, aiMonthlyGrowth, aiEnroll, peakStrength, entryQ, clearStrengthCache,
} from './world';
import { applySummary, rulesFor, setupFor } from './matchday';
import { Match } from '../sim/match';
import { runTraining, healWeek, runExams, gainText, campAvailable } from './training';
import { weeklyFinance, sponsorsWeekly, sponsorAP, addMoney, koshienFundraise, koshienTravel, regionTravel, onOfficialWin } from './finance';
import { weeklyRecruiting, decideRecruits, enrollAll, genProspects } from './recruit';
import { refreshMarket } from './staff';
import { rollWeeklyEvents, queueEvent } from './events';
import { runDraft, graduate, progressPros } from './draft';
import {
  addMgrExp, apMaxOf, contractYearEnd, evaluateSummer, genOffers, setYearGoal, switchSchool, unlock, LADDER, summerLadder, offerWindow,
} from './career';
import { emptyBlock, fullName, overall, has } from './attrs';
import { addExp } from './growth';

export type Halt =
  | { t: 'event' }
  | { t: 'notice'; notice: Notice }
  | { t: 'choice'; choice: PendingChoice }
  | { t: 'match'; pm: PendingMatch }
  | { t: 'report'; report: WeekReport }
  | { t: 'idle' };

const KIND_ORDER: TourKind[] = ['springPref', 'springRegion', 'summerPref', 'koshien', 'fallPref', 'fallRegion', 'jingu', 'senbatsu'];

function report(): WeekReport {
  return G.flow!.report;
}
export function line(text: string, tone?: 'good' | 'bad' | 'info'): void {
  if (G.flow) report().lines.push({ text, tone });
}
function news(text: string, kind: 'result' | 'world' | 'draft' | 'school' | 'pro' | 'recruit' = 'world'): void {
  G.news.unshift({ absWeek: G.absWeek, text, kind });
  if (G.news.length > 250) G.news.length = 250;
}
export function notify(title: string, lines: string[], kind: Notice['kind'] = 'info'): void {
  G.notices.push({ title, lines, kind });
}
export function mail(title: string, body: string, kind: 'info' | 'good' | 'bad' | 'offer' | 'event' = 'info'): void {
  G.inbox.unshift({ id: G.nextId++, absWeek: G.absWeek, title, body, kind, read: false });
  if (G.inbox.length > 120) G.inbox.length = 120;
}

// ======================= 推进 =======================
export function startWeek(): void {
  if (G.flow) return;
  // 代言占用的行动力按「每月 n 点」折算到每周，零头累计到满 1 点再扣
  const owed = (G.manager.apOwed ?? 0) + sponsorAP();
  const apCost = Math.floor(owed + 1e-9);
  G.manager.apOwed = Math.max(0, owed - apCost);
  G.manager.ap = Math.max(0, apMaxOf(G.manager) - apCost);
  G.manager.apMax = apMaxOf(G.manager);
  for (const p of Object.values(G.players)) {
    p.pitchesLast = p.pitchesWeek;
    p.pitchesWeek = 0;
  }
  G.flow = {
    steps: [{ k: 'specials' }, { k: 'events' }, { k: 'training' }, { k: 'matches' }, { k: 'practice' }, { k: 'weekly' }, { k: 'report' }],
    idx: 0,
    report: { title: dateLabel(G.year, G.week), lines: [], growth: [], money: G.club.funds },
    pendingMatch: null,
  };
}

export function weekInProgress(): boolean {
  return !!G.flow;
}

export function advance(): Halt {
  if (!G.flow) startWeek();
  for (let guard = 0; guard < 60; guard++) {
    if (G.choice) return { t: 'choice', choice: G.choice };
    if (G.notices.length) return { t: 'notice', notice: G.notices[0] };
    if (G.eventQueue.length) return { t: 'event' };
    const f = G.flow;
    if (!f) return { t: 'idle' };
    if (f.pendingMatch) return { t: 'match', pm: f.pendingMatch };
    const step = f.steps[f.idx];
    if (!step) {
      endWeek();
      return { t: 'idle' };
    }
    switch (step.k) {
      case 'specials':
        f.idx++;
        doSpecials();
        break;
      case 'events':
        f.idx++;
        rollWeeklyEvents();
        break;
      case 'training':
        f.idx++;
        doTraining();
        break;
      case 'matches': {
        const pm = doMatches();
        if (pm) {
          f.pendingMatch = pm;
          return { t: 'match', pm };
        }
        f.idx++;
        break;
      }
      case 'practice': {
        f.idx++;
        const pm = doPractice();
        if (pm) {
          f.pendingMatch = pm;
          return { t: 'match', pm };
        }
        break;
      }
      case 'weekly':
        f.idx++;
        doWeekly();
        break;
      case 'report':
        f.idx++;
        report().money = G.club.funds - report().money;
        G.reports.unshift(report());
        if (G.reports.length > 12) G.reports.length = 12;
        return { t: 'report', report: report() };
    }
  }
  return { t: 'idle' };
}

export function dismissNotice(): void {
  G.notices.shift();
}

function endWeek(): void {
  G.flow = null;
  G.absWeek++;
  G.week++;
  if (G.week >= WEEKS) {
    G.week = 0;
    G.year++;
  }
}

// ======================= 日程事件 =======================
function doSpecials(): void {
  const w = G.week;
  if (w === 0 && G.flags.started) newYear();
  G.flags.started = 1;
  if (w === SCHED.springPref[0]) createSpringPref();
  if (w === SCHED.springRegion[0]) createSpringRegion();
  if (w === SCHED.summerDraw) createSummerPref();
  if ((SCHED.exams as readonly number[]).includes(w)) for (const t of runExams()) line(t, 'bad');
  if (w === SCHED.koshien[0]) createKoshien();
  if (w === SCHED.newTeam) newTeam();
  if (w === SCHED.fallPref[0]) createFallPref();
  if (w === SCHED.fallRegion[0]) createFallRegion();
  if (w === SCHED.draft + 1) {
    computeRegionRanks();
  }
  if (w === SCHED.draft) doDraft();
  if (w === SCHED.jingu[0]) createJingu();
  if (w === SCHED.offStart) line('进入冬季：12 月至 3 月上旬禁止对外比赛，专心冬训吧。', 'info');
  if (w === 36) queueEvent('shrine');
  if (w === SCHED.senbatsuAnnounce) senbatsuSelection();
  if (w === SCHED.recruitDecision) recruitDecision();
  if (w === SCHED.graduation) graduation();
  if (w === SCHED.senbatsu[0]) createSenbatsu();
  if (offerWindow() && (w === 19 || w === 31 || w === 40)) {
    const offers = genOffers();
    for (const o of offers) {
      G.manager.offers.push(o);
      mail('监督邀请', `${G.schools[o.schoolId].name}（${PREFS[G.schools[o.schoolId].prefId].name}）希望聘请你担任监督。年薪 ${o.salary} 万円，合同 ${o.years} 年。请在「监督」页面查看。`, 'offer');
      line(`收到了来自${G.schools[o.schoolId].name}的监督邀请！`, 'good');
    }
  }
  if (campAvailable() && w % 4 === 0) line('本周可以举行集训合宿（训练页面）。', 'info');
}

function rankOf(t: Tournament): number[] {
  const ids = t.teams.slice();
  return ids.sort((a, b) => (t.rank[b] ?? 0) - (t.rank[a] ?? 0) || schoolStrength(G.schools[b]).total - schoolStrength(G.schools[a]).total);
}

function findTour(kind: TourKind, year = G.year, pred?: (t: Tournament) => boolean): Tournament | undefined {
  return Object.values(G.tournaments).find((t) => t.kind === kind && t.year === year && (!pred || pred(t)));
}

function myPref() {
  return PREFS[mySchool().prefId];
}

function addTour(t: Tournament): Tournament {
  G.tournaments[t.id] = t;
  return t;
}

function createSpringPref(): void {
  const pref = myPref();
  const teams = schoolsInPref(pref.id).map((s) => s.id);
  const lastFall = findTour('fallPref', G.year - 1, (t) => t.pref === pref.id);
  const seeds = lastFall ? rankOf(lastFall).slice(0, 4) : sortBy(teams.slice(), (id) => schoolStrength(G.schools[id]).total).slice(0, 4);
  const t = addTour(makeTournament('springPref', `春季${pref.name}大会`, teams, SCHED.springPref, { seeds, pref: pref.id, mercy: true, koshien: false }));
  line(`${t.name}开幕！共 ${teams.length} 校参加。`, 'info');
}

function quickPrefOrder(prefId: number, district = -1): number[] {
  const ss = schoolsInPref(prefId).filter((s) => district < 0 || s.district === district);
  return quickBracket(ss, true).order;
}

function createSpringRegion(): void {
  const region = springRegionOf(myPref().region);
  if (region === 'hokkaido') return;
  const prefs = PREFS.filter((p) => springRegionOf(p.region) === region);
  const teams: number[] = [];
  for (const p of prefs) {
    if (p.id === myPref().id) {
      const sp = findTour('springPref', G.year, (t) => t.pref === p.id);
      if (sp) teams.push(...rankOf(sp).slice(0, 2));
    } else teams.push(...quickPrefOrder(p.id).slice(0, 2));
  }
  const t = addTour(makeTournament('springRegion', `春季${REGION_BY_ID[region].name}大会`, teams, SCHED.springRegion, { region, mercy: true, koshien: false }));
  if (teams.includes(G.club.schoolId)) line(`获得${t.name}出场资格！`, 'good');
}

function createSummerPref(): void {
  const pref = myPref();
  const sp = findTour('springPref', G.year, (t) => t.pref === pref.id);
  const springRank = sp ? rankOf(sp) : [];
  const ds = pref.districts ? [0, 1] : [-1];
  for (const d of ds) {
    const teams = schoolsInPref(pref.id).filter((s) => d < 0 || s.district === d).map((s) => s.id);
    const seeds = springRank.filter((id) => teams.includes(id)).slice(0, 8);
    const name = d < 0 ? `夏季${pref.name}大会` : `夏季${pref.districts![d]}大会`;
    const t = addTour(makeTournament('summerPref', name, teams, SCHED.summerPref, { seeds, pref: pref.id, district: d, mercy: true, koshien: false }));
    if (teams.includes(G.club.schoolId)) {
      const first = t.rounds.map((ms) => ms.find((m) => (m.a === G.club.schoolId || m.b === G.club.schoolId) && m.note !== '轮空')).find(Boolean);
      const opp = first ? (first.a === G.club.schoolId ? first.b : first.a) : null;
      const seeded = seeds.includes(G.club.schoolId);
      const bye = t.rounds[0].some((m) => (m.a === G.club.schoolId || m.b === G.club.schoolId) && m.note === '轮空');
      notify('夏季大会抽签', [
        `${name}共有 ${teams.length} 校参加，${t.rounds.length} 轮淘汰赛。`,
        seeded ? (bye ? '我们作为种子校，首轮轮空。' : '我们是本次大会的种子校。') : bye ? '抽签结果：首轮轮空。' : '',
        opp !== null && opp !== undefined ? `首战对手：${G.schools[opp].name}（战力 ${schoolStrength(G.schools[opp]).total.toFixed(0)}）` : '',
        '三年级生最后的夏天，即将开始。',
      ].filter(Boolean));
    }
  }
}

function createKoshien(): void {
  const reps: number[] = [];
  for (const p of PREFS) {
    const ds = p.districts ? [0, 1] : [-1];
    for (const d of ds) {
      if (p.id === myPref().id) {
        const t = findTour('summerPref', G.year, (x) => x.pref === p.id && x.district === d);
        if (t?.champion !== null && t?.champion !== undefined) reps.push(t.champion);
        else reps.push(quickPrefOrder(p.id, d)[0]);
      } else reps.push(quickPrefOrder(p.id, d)[0]);
    }
  }
  G.summerReps = reps;
  const n = G.year - 1918;
  const t = addTour(makeTournament('koshien', `第${n}回全国高校棒球选手权大会`, reps, SCHED.koshien, { mercy: false, koshien: true }));
  for (const id of reps) {
    const s = G.schools[id];
    s.koshienApps++;
    s.lastKoshien = G.year;
  }
  news(`夏季甲子园开幕！${reps.length} 所代表校齐聚阪神甲子园球场。`, 'result');
  if (reps.includes(G.club.schoolId)) {
    const m = t.rounds.flat().find((x) => (x.a === G.club.schoolId || x.b === G.club.schoolId) && x.note !== '轮空');
    const opp = m ? (m.a === G.club.schoolId ? m.b : m.a) : null;
    notify('甲子园组合抽签', [`${t.name}开幕式在晴空下举行。`, opp !== null && opp !== undefined ? `首战对手：${G.schools[opp].name}（${PREFS[G.schools[opp].prefId].name}代表）` : '我们首轮轮空。'], 'celebrate');
  }
}

function newTeam(): void {
  // 三年级引退
  for (const s of Object.values(G.schools)) {
    if (!s.roster) continue;
    for (const p of rosterPlayers(s)) if (p.grade === 3) p.retired = true;
  }
  const ev = evaluateSummer();
  for (const l of ev.lines) line(l, 'info');
  mail('夏季总结', ev.lines.join('\n'), 'info');
  if (ev.fired) {
    fire();
    return;
  }
  // 选择新主将
  const cands = sortBy(myPlayers().filter((p) => !p.retired && p.grade === 2), (p) => overall(p) + (has(p, 'captain') ? 25 : 0) + (p.pers === 'leader' ? 15 : 0)).slice(0, 5);
  if (cands.length) {
    G.choice = {
      id: 'captain',
      title: '新队伍成立',
      text: '三年级生引退，新队伍正式成立。请选择新的主将（主将的性格与特性会影响全队的默契）。',
      options: cands.map((p) => ({ label: `${fullName(p)}（${p.pos}·${overall(p).toFixed(0)}）`, value: p.id, hint: has(p, 'captain') ? '领袖气质' : p.pers === 'leader' ? '领袖型性格' : '' })),
    };
  }
  G.club.lineup.auto = true;
  G.club.lineup.autoBench = true;
}

function createFallPref(): void {
  const pref = myPref();
  const teams = schoolsInPref(pref.id).map((s) => s.id);
  const summer = Object.values(G.tournaments).filter((t) => t.kind === 'summerPref' && t.year === G.year && t.pref === pref.id);
  const seeds = summer.flatMap((t) => rankOf(t).slice(0, 2));
  const name = pref.districts && pref.region === 'tokyo' ? '秋季东京都大会' : `秋季${pref.name}大会`;
  addTour(makeTournament('fallPref', name, teams, SCHED.fallPref, { seeds, pref: pref.id, mercy: true, koshien: false }));
  line(`${name}开幕。新队伍的第一战，也是通往选拔的第一步！`, 'info');
}

function createFallRegion(): void {
  const region = myPref().region;
  if (region === 'tokyo' || region === 'hokkaido') return;
  const rd = REGION_BY_ID[region];
  const teams: number[] = [];
  for (const p of PREFS.filter((x) => x.region === region)) {
    if (p.id === myPref().id) {
      const t = findTour('fallPref', G.year, (x) => x.pref === p.id);
      if (t) teams.push(...rankOf(t).slice(0, rd.fallSlots));
    } else teams.push(...quickPrefOrder(p.id).slice(0, rd.fallSlots));
  }
  const t = addTour(makeTournament('fallRegion', rd.tourName, teams, SCHED.fallRegion, { region, mercy: true, koshien: false }));
  if (teams.includes(G.club.schoolId)) notify('晋级地区大会', [`获得${t.name}出场资格！`, `本地区选拔名额为 ${rd.senbatsu} 校，在地区大会取得好成绩就有机会入选春季选拔。`], 'celebrate');
}

function computeRegionRanks(): void {
  const myRegion = myPref().region;
  for (const r of REGIONS) {
    let order: number[];
    if (r.id === 'tokyo' || r.id === 'hokkaido') {
      const p = PREFS.find((x) => x.region === r.id)!;
      const t = p.id === myPref().id ? findTour('fallPref', G.year, (x) => x.pref === p.id) : undefined;
      order = t ? rankOf(t) : quickPrefOrder(p.id);
    } else if (r.id === myRegion) {
      const t = findTour('fallRegion', G.year, (x) => x.region === r.id);
      order = t ? rankOf(t) : [];
    } else {
      const parts: number[] = [];
      for (const p of PREFS.filter((x) => x.region === r.id)) parts.push(...quickPrefOrder(p.id).slice(0, r.fallSlots));
      const qb = quickBracket(parts.map((id) => G.schools[id]), true);
      order = [...qb.order, ...parts.filter((id) => !qb.order.includes(id))];
    }
    G.regionRank[r.id] = order;
  }
}

function doDraft(): void {
  const res = runDraft();
  G.draftLog.unshift({ year: G.year, picks: res.picks.map((p) => ({ round: p.round, team: p.team, name: p.name, school: p.school, pos: p.pos, mine: p.mine, ikusei: p.ikusei })) });
  if (G.draftLog.length > 10) G.draftLog.length = 10;
  const top = res.picks.filter((p) => p.round === 1).slice(0, 4);
  news(`职业棒球选秀会议举行。高中生 ${res.picks.length} 人被指名${top.length ? `，第 1 轮包括：${top.map((p) => `${p.name}（${p.school}）`).join('、')}` : ''}。`, 'draft');
  if (res.mine.length) notify('选秀会议', res.lines, 'celebrate');
  else {
    const mineCands = myPlayers().filter((p) => p.grade === 3 && p.wish === 'pro');
    if (mineCands.length) line(`${mineCands.map((p) => p.fam).join('、')}未被指名，将升学或进入社会人球队继续追梦。`, 'bad');
  }
}

function createJingu(): void {
  if (!Object.keys(G.regionRank).length) computeRegionRanks();
  const teams = REGIONS.map((r) => G.regionRank[r.id]?.[0]).filter((x): x is number => x !== undefined);
  addTour(makeTournament('jingu', '明治神宫野球大会', teams, SCHED.jingu, { mercy: true, koshien: false }));
  if (teams.includes(G.club.schoolId)) notify('明治神宫大会', ['作为地区冠军，我们将出战明治神宫大会！', '夺冠的话，本地区的选拔名额将增加 1 个（神宫枠）。'], 'celebrate');
}

function senbatsuSelection(): void {
  const chosen: number[] = [];
  const jingu = findTour('jingu');
  const jinguRegion = jingu?.champion !== null && jingu?.champion !== undefined ? PREFS[G.schools[jingu.champion].prefId].region : null;
  for (const r of REGIONS) {
    const slots = r.senbatsu + (jinguRegion === r.id ? 1 : 0);
    const ranked = G.regionRank[r.id] ?? [];
    let k = 0;
    for (const id of ranked) {
      if (k >= slots) break;
      if (chosen.includes(id)) continue;
      chosen.push(id);
      k++;
    }
  }
  // 21 世纪枠
  const me = mySchool();
  const fp = findTour('fallPref', G.year, (t) => t.pref === me.prefId);
  const myFall = fp?.rank[me.id] ?? 0;
  const pool = Object.values(G.schools).filter((s) => s.type === 'public' && s.prestige < 55 && !chosen.includes(s.id));
  for (let i = 0; i < 2 && pool.length; i++) {
    const s = weightedPick(pool, (x) => {
      if (x.id === me.id) {
        const ok = myFall >= (fp ? fp.rounds.length - 2 : 99) && G.club.scandal < 20 && G.club.board > 40;
        return ok ? 30 + G.club.supporters / 3 : 0;
      }
      return 1;
    });
    chosen.push(s.id);
    pool.splice(pool.indexOf(s), 1);
    if (s.id === me.id) line('我们因为在地区上的贡献与文武两道的表现，被选入"21世纪枠"！', 'good');
  }
  G.senbatsuReps = chosen.slice(0, 32);
  for (const id of G.senbatsuReps) {
    const s = G.schools[id];
    s.koshienApps++;
    s.lastKoshien = G.year;
  }
  news(`选拔高校棒球大会出场校公布：共 ${G.senbatsuReps.length} 校。`, 'result');
  if (G.senbatsuReps.includes(me.id)) {
    G.manager.totals.koshienApps++;
    const fund = koshienFundraise();
    addMoney(fund, 'koshien', '选拔出场募款');
    G.club.fans += 4000;
    G.club.board = clamp(G.club.board + 10, 0, 100);
    G.club.ob = clamp(G.club.ob + 10, 0, 100);
    addRep(5);
    const u = unlock('koshien_debut');
    notify('选拔出场决定！', ['樱花盛开的季节，我们将站上甲子园的舞台！', `地方上发起了募款，共筹得 ${fund} 万円。`, ...(u ? [u] : [])], 'celebrate');
  } else if (myFall >= 3) line('很遗憾，我们未能入选今年的春季选拔。', 'bad');
}

function recruitDecision(): void {
  const { mine, news: ns } = decideRecruits();
  for (const n of ns.slice(0, 6)) news(n, 'recruit');
  if (mine.length) {
    const lines = mine.map((p) => `${fullName(p)}（${p.middle}·${p.pos}）${p.offers?.includes(-1) ? ' [特待生]' : ''}`);
    notify('新生入学确定', [`以下 ${mine.length} 名中学生决定在春天加入我们：`, ...lines], 'celebrate');
    if (mine.some((p) => has(p, 'monster'))) {
      const u = unlock('monster');
      if (u) line(u, 'good');
    }
  } else line('今年没有招募到中学生……春天只能期待一般入部的新生了。', 'bad');
}

function graduation(): void {
  for (const l of graduate()) line(l, 'info');
  const c = contractYearEnd();
  for (const l of c.lines) line(l, c.expired ? 'bad' : 'info');
  if (c.renew) {
    G.choice = {
      id: 'renew',
      title: '续约',
      text: `合同即将到期。校方提出续约 3 年，年薪 ${Math.round(G.manager.salary * 1.1)} 万円。`,
      options: [
        { label: '续约', value: 1 },
        { label: '不续约，寻找新的挑战', value: 0 },
      ],
    };
  } else if (c.expired) {
    forcedJob('合同到期，你需要寻找新的学校。');
  }
}

function createSenbatsu(): void {
  const n = G.year + 1 - 1928;
  addTour(makeTournament('senbatsu', `第${n}回选拔高校棒球大会`, G.senbatsuReps, SCHED.senbatsu, { mercy: false, koshien: true }));
  news('春季选拔大会在甲子园开幕！', 'result');
}

// ======================= 新年度 =======================
function newYear(): void {
  const me = mySchool();
  // 赛季记录
  const res = me.history.find((h) => h.year === G.year - 1);
  G.records.seasons.push({
    year: G.year - 1,
    schoolId: me.id,
    schoolName: me.name,
    results: res ?? { year: G.year - 1 },
    w: G.manager.seasonW,
    l: G.manager.seasonL,
    bestPlayer: '',
  });
  G.manager.history.push({ year: G.year - 1, schoolId: me.id, schoolName: me.name, summary: summaryOf(res), w: G.manager.seasonW, l: G.manager.seasonL });
  G.manager.seasonW = 0;
  G.manager.seasonL = 0;
  G.manager.totals.seasons++;
  G.manager.age++;
  // 升年级
  for (const s of Object.values(G.schools)) {
    if (!s.roster) continue;
    for (const p of rosterPlayers(s)) {
      if (p.grade >= 1 && p.grade <= 2) p.grade++;
      p.retired = false;
      p.stats.season = emptyBlock();
    }
  }
  // 入学
  const { mine, walkons, counts } = enrollAll();
  for (const s of Object.values(G.schools)) {
    if (!s.roster || s.id === me.id) continue;
    aiEnroll(s, counts[s.id] ?? 0, G.year);
  }
  const lines = [`新学年开始！${mine.length} 名招募生与 ${walkons.length} 名一般入部生加入了棒球部。`];
  const gem = walkons.find((p) => p.pot >= 75);
  if (gem) lines.push(`一般入部生 ${fullName(gem)} 似乎是个璞玉……`);
  // 中学生
  for (const n of genProspects()) news(n, 'recruit');
  // 清理远方的具象化学校
  for (const s of Object.values(G.schools)) {
    if (s.roster && s.prefId !== me.prefId && s.id !== me.id && G.absWeek - s.seen > 40) dematerialize(s);
  }
  // 被动学校战力与名门度变动
  for (const s of Object.values(G.schools)) {
    const ks = s.lastKoshien === G.year - 1;
    s.prestige = clamp(s.prestige + (ks ? 2.5 : -0.5) + (45 - s.prestige) * 0.02 + gauss(0, 1.2), 3, 99);
    if (!s.roster) s.strength = s.strength + (peakStrength(entryQ(s.prestige)) - s.strength) * 0.35 + gauss(0, 4);
  }
  // 大会清理
  for (const [id, t] of Object.entries(G.tournaments)) if (t.year < G.year - 1) delete G.tournaments[id];
  // 校方
  G.club.board = clamp(G.club.board + (55 - G.club.board) * 0.15, 0, 100);
  if (me.type === 'private') G.club.scholarshipSlots = clamp(Math.round(1 + me.prestige / 20), 1, 6);
  const goal = setYearGoal();
  lines.push(`今年的目标：${LADDER[goal]}。`);
  for (const l of progressPros()) news(l, 'pro');
  notify(`${G.year}年度开始`, lines, 'info');
  if (G.club.captainId && !G.players[G.club.captainId]) G.club.captainId = null;
}

function summaryOf(r: { summerPref?: string; koshien?: string; senbatsu?: string; fallPref?: string } | undefined): string {
  if (!r) return '—';
  const parts: string[] = [];
  if (r.senbatsu) parts.push(`春甲 ${r.senbatsu}`);
  if (r.summerPref) parts.push(`夏县 ${r.summerPref}`);
  if (r.koshien) parts.push(`夏甲 ${r.koshien}`);
  if (r.fallPref) parts.push(`秋县 ${r.fallPref}`);
  return parts.join(' / ') || '—';
}

function myHistory(): import('./types').SchoolYearResult {
  const me = mySchool();
  let h = me.history.find((x) => x.year === G.year);
  if (!h) {
    h = { year: G.year };
    me.history.push(h);
  }
  return h;
}

// ======================= 训练 =======================
function doTraining(): void {
  const camp = G.flags.campAbs === G.absWeek;
  if (camp) {
    const cost = 60 + myPlayers().length * 3;
    addMoney(-cost, 'camp', '集训合宿');
    line(`集训合宿！花费 ${cost} 万円，训练效率大幅提升。`, 'info');
  }
  if (G.flags.healthBless && G.flags.healthBless < G.absWeek) delete G.flags.healthBless;
  const res = runTraining(camp);
  for (const n of res.notes) line(n, 'info');
  const gains = [...res.gains.entries()]
    .map(([pid, g]) => ({ pid, g, n: Object.values(g).reduce((a, b) => a + (b ?? 0), 0) }))
    .sort((a, b) => b.n - a.n);
  report().growth = gains.slice(0, 8).map((x) => ({ pid: x.pid, name: fullName(G.players[x.pid]), gains: gainText(x.g) }));
  for (const l of res.learned) line(`${fullName(G.players[l.pid])}学会了新球种「${l.pitch}」！`, 'good');
  for (const i of res.injuries) line(i.text, 'bad');
}

// ======================= 比赛 =======================
function doMatches(): PendingMatch | null {
  const me = G.club.schoolId;
  const ts = Object.values(G.tournaments)
    .filter((t) => !t.done && t.roundWeeks.includes(G.week))
    .sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  for (const t of ts) {
    for (let r = 0; r < t.rounds.length; r++) {
      if (t.roundWeeks[r] !== G.week) continue;
      if (r > 0 && t.rounds[r - 1].some((m) => !m.played)) break;
      const idx = playRoundAI(t, r);
      if (idx !== null) {
        const m = t.rounds[r][idx];
        const opp = (m.a === me ? m.b : m.a)!;
        if (G.club.banUntil > G.absWeek) {
          const aIsMe = m.a === me;
          recordResult(t, r, idx, aIsMe ? 0 : 9, aIsMe ? 9 : 0, 0, '出场辞退');
          line(`因处分期间，我们不得不辞退${t.name}。`, 'bad');
          afterMyResult(t, false);
          continue;
        }
        materialize(G.schools[opp]);
        G.schools[opp].seen = G.absWeek;
        return { tid: t.id, round: r, matchIdx: idx, oppId: opp, home: chance(0.5), label: `${t.name} ${t.roundNames[r]}` };
      }
      if (t.done) onTournamentDone(t);
    }
    if (t.done) onTournamentDone(t);
  }
  return null;
}

function doPractice(): PendingMatch | null {
  const pr = G.club.practice;
  if (!pr || pr.week !== G.week) return null;
  const opp = G.schools[pr.opponentId];
  const blocked = isOffseason(G.week) || G.club.banUntil > G.absWeek || hasMyOfficialGame();
  if (blocked || !opp) {
    line('本周无法进行练习赛，已取消。', 'info');
    G.club.practice = null;
    return null;
  }
  materialize(opp);
  opp.seen = G.absWeek;
  return { tid: null, round: 0, matchIdx: 0, oppId: opp.id, home: opp.prefId === mySchool().prefId ? chance(0.5) : false, label: `练习赛 vs ${opp.name}` };
}

function hasMyOfficialGame(): boolean {
  return Object.values(G.tournaments).some((t) => t.roundWeeks.includes(G.week) && t.teams.includes(G.club.schoolId) && (t.finish[G.club.schoolId] === undefined || t.champion === G.club.schoolId));
}

/** 为玩家的比赛创建 Match 对象 */
export function buildPlayerMatch(pm: PendingMatch): { match: Match; mySide: 0 | 1 } {
  const t = pm.tid ? G.tournaments[pm.tid] : null;
  const rules = rulesFor(t, pm.round);
  const me = mySchool();
  const opp = G.schools[pm.oppId];
  const mine = setupFor(me, true, rules);
  const theirs = setupFor(opp, false, rules);
  const mySide: 0 | 1 = pm.home ? 1 : 0;
  const match = mySide === 0 ? new Match(mine, theirs, rules) : new Match(theirs, mine, rules);
  match.T[mySide].auto = G.club.autoManage;
  return { match, mySide };
}

/** 玩家比赛结束后的结算，返回结果说明 */
export function finishPlayerMatch(m: Match): string[] {
  const f = G.flow;
  if (!f || !f.pendingMatch) return [];
  const pm = f.pendingMatch;
  const sum = m.summary();
  applySummary(m, sum, m.rules);
  const mySide: 0 | 1 = m.T[0].s.schoolId === G.club.schoolId ? 0 : 1;
  const my = sum.score[mySide];
  const op = sum.score[(1 - mySide) as 0 | 1];
  const won = sum.winner === mySide;
  const opp = G.schools[pm.oppId];
  const out: string[] = [];
  matchExp(m, mySide, pm.tid ? (G.tournaments[pm.tid].koshien ? 2 : 1.2) : 0.7);
  out.push(`${won ? '胜利' : '败北'}：${mySchool().short} ${my} - ${op} ${opp.short}${sum.called ? '（提前结束）' : ''}`);
  if (pm.tid) {
    const t = G.tournaments[pm.tid];
    const bm = t.rounds[pm.round][pm.matchIdx];
    const aIsMe = bm.a === G.club.schoolId;
    recordResult(t, pm.round, pm.matchIdx, aIsMe ? my : op, aIsMe ? op : my, sum.innings, sum.called ? '提前结束' : undefined);
    if (won) {
      G.manager.totals.w++;
      G.manager.seasonW++;
      onOfficialWin();
      if (!t.koshien) addRep(0.15);
      addMgrExp(t.koshien ? 30 : 10);
      const a = unlock('first_win');
      if (a) out.push(a);
      if (G.manager.totals.w >= 100) {
        const b = unlock('wins100');
        if (b) out.push(b);
      }
      if (opp.prestige >= 80 && mySchool().prestige <= 45) {
        const c = unlock('giant_killer');
        if (c) out.push(c);
      }
      if (sum.hits[(1 - mySide) as 0 | 1] === 0) {
        const d = unlock('no_hitter');
        if (d) out.push(d);
      }
      let worst = 0;
      for (const e of m.log) if (e.snap) worst = Math.min(worst, e.snap.score[mySide] - e.snap.score[(1 - mySide) as 0 | 1]);
      if (worst <= -5) {
        const c = unlock('comeback');
        if (c) out.push(c);
      }
    } else {
      G.manager.totals.l++;
      G.manager.seasonL++;
      addMgrExp(4);
    }
    if (t.koshien) {
      G.club.fans += won ? 2500 : 900;
      if (won) {
        G.manager.totals.koshienWins++;
        mySchool().koshienWins++;
        addRep(1.5);
        const k = unlock('koshien_win');
        if (k) out.push(k);
      }
    } else if (won && (t.kind === 'summerPref' || t.kind === 'fallRegion')) G.club.fans += 300;
    afterMyResult(t, won);
    if (t.done) onTournamentDone(t);
  } else {
    // 招待赛由对方承担远征费
    const invited = !!G.club.practice?.invited;
    G.club.practice = null;
    if (!pm.home && !invited) {
      const cost = opp.prefId === mySchool().prefId ? 8 : 25;
      addMoney(-cost, 'travel', `练习赛远征（${opp.short}）`);
    }
    addMgrExp(3);
  }
  f.pendingMatch = null;
  line(out[0], won ? 'good' : 'bad');
  return out;
}

/** 本队在比赛中获得的经验 */
function matchExp(m: Match, side: 0 | 1, mult: number): void {
  const t = m.T[side];
  for (const pid of t.appeared) {
    const p = G.players[pid];
    if (!p) continue;
    addExp(p, { tech: 3 * mult, men: 4 * mult, agi: 1 * mult, str: 1 * mult, brk: t.pitchers.includes(pid) ? 3 * mult : 0 });
  }
  for (const p of t.s.players) if (!t.appeared.has(p.id)) addExp(p, { men: 1 * mult });
}

/** 本队一场公式战结束后：淘汰处理 */
function afterMyResult(t: Tournament, won: boolean): void {
  const me = mySchool();
  const h = myHistory();
  const fin = t.finish[me.id] ?? (t.champion === me.id ? '冠军' : undefined);
  if (fin) {
    const key = t.kind as keyof typeof h;
    (h as unknown as Record<string, string>)[key] = fin;
  }
  if (won) return;
  if (t.kind === 'summerPref' || t.kind === 'koshien') {
    const seniors = myPlayers().filter((p) => p.grade === 3 && !p.retired);
    for (const p of seniors) p.retired = true;
    if (seniors.length) notify('夏天结束了', [`${t.name}止步${fin ?? ''}。`, `${seniors.length} 名三年级生的高中棒球生涯画上了句号。`, '谢谢你们，辛苦了。'], 'bad');
    if (t.kind === 'koshien') queueEvent('koshienSoil');
  }
  if (t.koshien) {
    const games = t.rounds.flat().filter((m) => (m.a === me.id || m.b === me.id) && m.note !== '轮空' && m.played).length;
    // 辞退出场（一场未打）不产生远征费
    if (games > 0) addMoney(-koshienTravel(games), 'travel', `${t.name}远征费`);
  } else if (t.kind === 'springRegion' || t.kind === 'fallRegion' || t.kind === 'jingu') {
    addMoney(-regionTravel(), 'travel', `${t.name}远征费`);
  }
}

function onTournamentDone(t: Tournament): void {
  const key = `done_${t.id}`;
  if (G.flags[key]) return;
  G.flags[key] = 1;
  const me = G.club.schoolId;
  const champ = t.champion !== null ? G.schools[t.champion] : null;
  if (!champ) return;
  news(`${t.name}：${champ.name}夺得冠军！${t.runnerUp !== null ? `（亚军 ${G.schools[t.runnerUp].name}）` : ''}`, 'result');
  if (t.kind === 'koshien' || t.kind === 'senbatsu') {
    G.records.koshienChamps.push({ year: G.year, kind: t.kind === 'koshien' ? 'summer' : 'spring', schoolId: champ.id, schoolName: champ.name, runnerUp: t.runnerUp !== null ? G.schools[t.runnerUp].name : '' });
    if (t.kind === 'koshien') champ.summerTitles++;
    else champ.springTitles++;
    champ.prestige = clamp(champ.prestige + 4, 0, 99);
  }
  if (t.champion !== me) return;
  // 地区大会、神宫大会夺冠时同样要付远征费（失利时在 afterMyResult 中支付）
  if (t.kind === 'springRegion' || t.kind === 'fallRegion' || t.kind === 'jingu') addMoney(-regionTravel(), 'travel', `${t.name}远征费`);
  const h = myHistory();
  (h as unknown as Record<string, string>)[t.kind] = '冠军';
  switch (t.kind) {
    case 'summerPref': {
      const fund = koshienFundraise();
      addMoney(fund, 'koshien', '甲子园出场募款');
      G.club.koshienFund = fund;
      G.club.fans += 6000;
      G.club.board = clamp(G.club.board + 8, 0, 100);
      G.club.ob = clamp(G.club.ob + 12, 0, 100);
      G.manager.totals.koshienApps++;
      for (const d of G.club.sponsors) if (d.koshienBonus) addMoney(d.koshienBonus, 'sponsor', `${d.name}出场奖励`);
      const lines = [`夺得${t.name}冠军！我们将代表${PREFS[mySchool().prefId].name}出战夏季甲子园！`, `OB会与地方各界发起募款，共筹得 ${fund} 万円。`];
      const u = unlock('koshien_debut');
      if (u) lines.push(u);
      if (mySchool().type === 'public') {
        const v = unlock('public_koshien');
        if (v) lines.push(v);
      }
      notify('甲子园出场决定！！', lines, 'celebrate');
      break;
    }
    case 'koshien': {
      G.manager.totals.summerTitles++;
      addRep(15);
      G.club.fans += 20000;
      G.club.board = clamp(G.club.board + 20, 0, 100);
      mySchool().prestige = clamp(mySchool().prestige + 6, 0, 99);
      const lines = ['全国制霸！！深红的大旗终于来到了我们手中！', '这个夏天，将永远被铭记。'];
      const u = unlock('summer_champ');
      if (u) lines.push(u);
      const sb = Object.values(G.tournaments).find((x) => x.kind === 'senbatsu' && x.year === G.year - 1 && x.champion === me);
      if (sb) {
        const v = unlock('haru_natsu');
        if (v) lines.push(v);
      }
      addMoney(-koshienTravel(6), 'travel', `${t.name}远征费`);
      for (const p of myPlayers()) if (p.grade === 3) p.retired = true;
      notify('全国制霸！！', lines, 'celebrate');
      break;
    }
    case 'senbatsu': {
      G.manager.totals.springTitles++;
      addRep(12);
      G.club.fans += 15000;
      mySchool().prestige = clamp(mySchool().prestige + 5, 0, 99);
      const lines = ['选拔大会优胜！紫红的大旗属于我们！'];
      const u = unlock('spring_champ');
      if (u) lines.push(u);
      addMoney(-koshienTravel(5), 'travel', `${t.name}远征费`);
      notify('选拔优胜！', lines, 'celebrate');
      break;
    }
    case 'jingu': {
      const u = unlock('jingu');
      notify('神宫大会冠军！', ['明治神宫大会夺冠！本地区获得额外一个选拔名额。', ...(u ? [u] : [])], 'celebrate');
      addRep(4);
      break;
    }
    default:
      notify(`${t.name}冠军！`, [`我们在${t.name}中夺冠！`], 'celebrate');
      addRep(1.5);
      G.club.fans += 1500;
  }
}

// ======================= 每周结算 =======================
function doWeekly(): void {
  const lines = report().lines;
  for (const p of myPlayers()) {
    const h = healWeek(p);
    if (h) line(h, 'good');
    if (p.supplementary > 0) p.supplementary--;
    if (p.ineligibleUntil === G.absWeek + 1) line(`${fullName(p)}的转学禁赛期结束，可以参加公式战了。`, 'good');
    if (p.focus?.kind === 'rest' && p.fatigue <= 5 && !p.injury) p.focus = null;
  }
  // AI 球员恢复
  for (const s of Object.values(G.schools)) {
    if (!s.roster || s.id === G.club.schoolId) continue;
    for (const id of s.roster) {
      const p = G.players[id];
      if (!p) continue;
      p.fatigue = Math.max(0, p.fatigue - 35);
      if (p.injury) {
        p.injury.weeks--;
        if (p.injury.weeks <= 0) p.injury = null;
      }
    }
  }
  weeklyFinance(lines);
  const sc = sponsorsWeekly(lines);
  if (sc) queueEvent(sc);
  const rec = weeklyRecruiting();
  for (const r of rec.slice(0, 2)) line(r, 'info');
  if (G.week % 4 === 3) aiMonthlyGrowth();
  if (G.week % 4 === 0) refreshMarket();
  const lv = addMgrExp(3);
  if (lv) line(lv, 'good');
  if (G.club.funds >= 10000) {
    const u = unlock('rich');
    if (u) line(u, 'good');
  }
  G.manager.offers = G.manager.offers.filter((o) => o.expires > G.absWeek);
  G.club.fans = Math.max(100, Math.round(G.club.fans * 0.997));
  clearStrengthCache();
}

// ======================= 选择 =======================
export function resolveChoice(value: number): string[] {
  const c = G.choice;
  if (!c) return [];
  G.choice = null;
  switch (c.id) {
    case 'captain': {
      G.club.captainId = value;
      const p = G.players[value];
      G.club.chemistry = clamp(G.club.chemistry + 3, 0, 100);
      if (p) p.morale = clamp(p.morale + 10, 0, 100);
      return [`${p ? fullName(p) : ''}成为新主将！`];
    }
    case 'renew': {
      if (value === 1) {
        G.manager.contractYears = 3;
        G.manager.salary = Math.round(G.manager.salary * 1.1);
        return ['续约成功，继续在这里奋斗吧！'];
      }
      forcedJob('你决定离开，寻找新的挑战。', false);
      return [];
    }
    case 'job': {
      const o = G.manager.offers.find((x) => x.id === value);
      if (!o) return [];
      G.manager.offers = [];
      const lines = switchSchool(o);
      notify('就任新学校', lines, 'info');
      return lines;
    }
  }
  return [];
}

/** 被迫寻找新东家 */
function forcedJob(msg: string, firedFlag = true): void {
  const offers = genOffers(true);
  if (!offers.length) offers.push(...genOffers(true));
  G.manager.offers = offers;
  G.choice = {
    id: 'job',
    title: firedFlag ? '离任' : '寻找新学校',
    text: `${msg}以下学校向你发出了邀请：`,
    options: offers.map((o) => {
      const s = G.schools[o.schoolId];
      return { label: `${s.name}（${PREFS[s.prefId].name}·${s.type === 'public' ? '公立' : '私立'}·名门度 ${s.prestige.toFixed(0)}）`, value: o.id, hint: `年薪 ${o.salary} 万 / ${o.years} 年 / 目标 ${LADDER[o.goal]}` };
    }),
  };
}

function fire(): void {
  G.manager.reputation = clamp(G.manager.reputation - 8, 0, 100);
  forcedJob('成绩未达到校方期望，你被解除了监督职务……');
}

/** 主动接受邀请 */
export function acceptOffer(offerId: string | number): string | null {
  if (!offerWindow()) return '只能在夏季大会后（8月下旬）或秋季大会结束后（11月~3月）转任';
  if (G.flow) return '请先完成本周的流程';
  const o = G.manager.offers.find((x) => x.id === Number(offerId));
  if (!o) return '邀请已失效';
  G.manager.offers = [];
  const lines = switchSchool(o);
  notify('就任新学校', lines, 'info');
  return null;
}

export function setCamp(on: boolean): void {
  if (on) G.flags.campAbs = G.absWeek;
  else delete G.flags.campAbs;
}

export function goalText(): string {
  return LADDER[G.club.goal];
}

export function ladderNow(): string {
  return LADDER[summerLadder(G.club.schoolId)];
}

export function strongestInPref(n = 8): School[] {
  return sortBy(schoolsInPref(mySchool().prefId), (s) => schoolStrength(s).total).slice(0, n);
}

