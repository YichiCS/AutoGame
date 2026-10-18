// 会经营的机器人监督：长期生涯测试  node scripts/run-ts.mjs tests/career.ts [年数] [县id] [选校0-2] [种子]
import { generateWorld, beginCareer } from '../src/core/newgame';
import { advance, dismissNotice, resolveChoice, buildPlayerMatch, finishPlayerMatch, acceptOffer } from '../src/core/game';
import { resolveEvent } from '../src/core/events';
import { G, mySchool, myPlayers } from '../src/core/state';
import { schoolStrength } from '../src/core/world';
import { overall, isPitcher, pitcherOverall } from '../src/core/attrs';
import { LADDER, summerLadder, offerWindow } from '../src/core/career';
import { PREFS } from '../src/data/prefectures';
import { homeVisit, inviteVisit, scoutVisit, offerScholarship, recruitSeason, myInterest, scholarshipsOffered } from '../src/core/recruit';
import { upgradeCost, startUpgrade, acceptSponsor } from '../src/core/finance';
import { FACILITY_DEFS, type FacKey } from '../src/core/training';
import { hireStaff, myStaff, signingCost, ROLES } from '../src/core/staff';
import { addMoney } from '../src/core/finance';
import { snapshot, loadState } from '../src/core/save';
import type { FacilityId, GameState } from '../src/core/types';

const years = Number(process.argv[2] ?? 10);
const prefId = Number(process.argv[3] ?? 12);
const pick = Number(process.argv[4] ?? 0);
const seed = Number(process.argv[5] ?? 99);

const cands = generateWorld({ mgrName: '机器人', bg: 'koshien', age: 32, prefId, difficulty: (process.env.PB_DIFF as 'easy' | 'normal' | 'hard') ?? 'normal', dh: process.env.PB_DH !== '0', seed, year: 2026 });
beginCareer(cands[Math.min(pick, cands.length - 1)].id);
console.log(`就任 ${mySchool().name}（${PREFS[mySchool().prefId].name}，名门度 ${mySchool().prestige.toFixed(0)}）`);

function manage(): void {
  const me = mySchool();
  // 训练强度
  const ps = myPlayers().filter((p) => !p.retired);
  const fat = ps.reduce((a, p) => a + p.fatigue, 0) / Math.max(1, ps.length);
  G.club.training.intensity = fat > 45 ? 1 : 2;
  // 招募
  if (recruitSeason()) {
    const pros = G.prospects.map((id) => G.players[id]).filter((p) => p && p.grade === 0).sort((a, b) => overall(b) - overall(a));
    const targets = pros.filter((p) => overall(p) <= overall(p) + 0 && overall(p) < 25 + me.prestige * 0.5 + 25).slice(0, 8);
    for (const p of targets.slice(0, 6)) if ((p.scout ?? 0) < 2 && G.club.funds > 50) scoutVisit(p);
    for (const p of targets.slice(0, 3)) if (G.manager.ap > 0 && myInterest(p) < 75) homeVisit(p);
    if (G.week % 3 === 0) for (const p of targets.slice(0, 4)) if (G.club.funds > 120 && myInterest(p) < 80) inviteVisit(p);
    if (me.type === 'private') for (const p of targets) if (scholarshipsOffered() < G.club.scholarshipSlots) offerScholarship(p);
  }
  // 设施
  if (!G.club.construction) {
    const order: FacKey[] = ['field', 'bullpen', 'cage', 'weight', 'medical', 'indoor', 'analysis', 'dorm'];
    for (const k of order) {
      const lv = G.club.facilities[k as FacilityId];
      if (lv >= FACILITY_DEFS[k].max) continue;
      if (k === 'dorm' && me.type === 'public') continue;
      const c = upgradeCost(k as FacilityId);
      if (G.club.funds > c * 1.6 + 200) {
        startUpgrade(k as FacilityId);
        break;
      }
    }
  }
  // 教练
  const have = new Set(myStaff().map((s) => s.role));
  if (myStaff().length < 5 && G.club.funds > 500) {
    for (const r of ROLES) {
      if (have.has(r)) continue;
      const best = G.freeStaff.map((id) => G.staff[id]).filter((s) => s && s.role === r && s.schoolId === -1).sort((a, b) => b.skill - a.skill)[0];
      if (best && best.salary < G.club.funds / 3) {
        if (!hireStaff(best, best.salary, 2)) addMoney(-signingCost(best), 'staff', '签约金');
        break;
      }
    }
  }
  // 赞助
  for (const d of G.club.sponsorOffers.slice()) if (d.kind !== 'gray' && d.kind !== 'media') acceptSponsor(d);
  // 跳槽：名门度更高就接受
  if (offerWindow() && !G.flow) {
    const best = G.manager.offers.slice().sort((a, b) => G.schools[b.schoolId].prestige - G.schools[a.schoolId].prestige)[0];
    if (best && G.schools[best.schoolId].prestige > me.prestige + 12) {
      const from = me.name;
      const err = acceptOffer(best.id);
      if (!err) console.log(`  >>> ${G.year}-${G.week} 跳槽：${from} → ${mySchool().name}（${PREFS[mySchool().prefId].name}，名门度 ${mySchool().prestige.toFixed(0)}）`);
    }
  }
}

let guard = 0;
let matches = 0;
let wins = 0;
const t0 = Date.now();
while (G.absWeek < years * 48 && guard++ < 400000) {
  if (!G.flow) manage();
  const h = advance();
  if (h.t === 'event') {
    const ev = G.eventQueue[0];
    resolveEvent(Math.max(0, ev.choices.findIndex((c) => !c.disabled)));
  } else if (h.t === 'notice') {
    if (h.notice.kind === 'celebrate') console.log(`  [${G.year}-${G.week}] ★ ${h.notice.title}`);
    dismissNotice();
  } else if (h.t === 'choice') {
    if (h.choice.id !== 'captain') console.log(`  [${G.year}-${G.week}] 选择 ${h.choice.title}: ${h.choice.options[0]?.label}`);
    resolveChoice(h.choice.options[0].value);
  } else if (h.t === 'match') {
    const { match, mySide } = buildPlayerMatch(h.pm);
    match.T[mySide].auto = true;
    match.toEnd();
    matches++;
    if (match.summary().winner === mySide) wins++;
    finishPlayerMatch(match);
  }
  if (h.t === 'idle' && G.week === 20) {
    const me = mySchool();
    const ps = myPlayers().filter((p) => !p.retired);
    const ace = ps.filter(isPitcher).sort((a, b) => pitcherOverall(b) - pitcherOverall(a))[0];
    console.log(
      `${G.year} ${me.short.padEnd(5)} 夏:${LADDER[summerLadder(me.id)].padEnd(7)} 目标:${LADDER[G.club.goal].padEnd(6)} 战力${schoolStrength(me).total.toFixed(0)} 部员${ps.length} 资金${Math.round(G.club.funds)} 校方${G.club.board.toFixed(0)} 名声${G.manager.reputation.toFixed(0)} Lv${G.manager.level} 教练${myStaff().length} 设施${Object.values(G.club.facilities).reduce((a, b) => a + b, 0)} 王牌${ace ? Math.round(ace.a.velocity) + 'km' : '-'}`,
    );
  }
  if (h.t === 'idle' && G.week === 0 && G.absWeek % (48 * 3) === 0) {
    // 存读档往返测试
    const json = snapshot();
    loadState(JSON.parse(json) as GameState);
  }
}
const m = G.manager;
console.log(`\n${years} 年 用时 ${((Date.now() - t0) / 1000).toFixed(1)}s · 比赛 ${matches} 胜 ${wins} · 通算 ${m.totals.w}-${m.totals.l} · 甲子园 ${m.totals.koshienApps} 次 ${m.totals.koshienWins} 胜 · 冠军 夏${m.totals.summerTitles} 春${m.totals.springTitles} · 职业 ${m.totals.drafted}`);
console.log(`成就：${m.achievements.join(', ')}`);
console.log(`存档大小 ${(snapshot().length / 1024 / 1024).toFixed(2)}MB · 球员 ${Object.keys(G.players).length} · 具象化学校 ${Object.values(G.schools).filter((s) => s.roster).length}`);
