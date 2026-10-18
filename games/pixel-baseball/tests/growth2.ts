// 本队训练 vs AI 成长对比（1 学年）
import { generateWorld, beginCareer } from '../src/core/newgame';
import { advance, dismissNotice, resolveChoice, buildPlayerMatch, finishPlayerMatch } from '../src/core/game';
import { resolveEvent } from '../src/core/events';
import { G, mySchool } from '../src/core/state';
import { overall } from '../src/core/attrs';
import { rosterPlayers } from '../src/core/world';

const intensity = Number(process.argv[2] ?? 1);
const cands = generateWorld({ mgrName: 'T', bg: 'teacher', age: 35, prefId: 12, difficulty: 'normal', dh: true, seed: 7, year: 2026 });
beginCareer(cands[1].id);
G.club.training.intensity = intensity;
const snap = new Map<number, number>();
for (const p of Object.values(G.players)) if (p.grade >= 1 && p.grade <= 2) snap.set(p.id, overall(p));
let guard = 0;
while (G.absWeek < 44 && guard++ < 20000) {
  const h = advance();
  if (h.t === 'event') { const ev = G.eventQueue[0]; resolveEvent(Math.max(0, ev.choices.findIndex((c) => !c.disabled))); }
  else if (h.t === 'notice') dismissNotice();
  else if (h.t === 'choice') resolveChoice(h.choice.options[0].value);
  else if (h.t === 'match') { const { match, mySide } = buildPlayerMatch(h.pm); match.T[mySide].auto = true; match.toEnd(); finishPlayerMatch(match); }
}
const me = mySchool();
const mine: number[] = [];
const ai: number[] = [];
for (const [id, v] of snap) {
  const p = G.players[id];
  if (!p) continue;
  const d = overall(p) - v;
  if (p.schoolId === me.id) mine.push(d);
  else if (G.schools[p.schoolId]?.prefId === me.prefId && Math.abs(G.schools[p.schoolId].prestige - me.prestige) < 15) ai.push(d);
}
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2);
console.log(`intensity ${intensity}: my players Δov ${avg(mine)} (n=${mine.length})  | AI similar-prestige Δov ${avg(ai)} (n=${ai.length}) | injuries now ${rosterPlayers(me).filter((p) => p.injury).length} | avg fatigue ${avg(rosterPlayers(me).map((p) => p.fatigue))} | chem ${G.club.chemistry.toFixed(0)} tac ${G.club.tacticsSkill.toFixed(0)}`);
