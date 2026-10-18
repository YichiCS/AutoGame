// 成长曲线测试
import { seedRng } from '../src/core/rng';
import { generatePlayer } from '../src/core/player';
import { aiGrow } from '../src/core/growth';
import { pitcherOverall, batterOverall, batterOffense } from '../src/core/attrs';
import type { Pos } from '../src/core/types';

seedRng(7);
for (const pos of ['P', 'SS', 'CF'] as Pos[]) {
  for (const q of [25, 35, 45, 55, 65]) {
    const n = 60;
    const s0: number[] = [];
    const s1: number[] = [];
    let v0 = 0, v1 = 0, c0 = 0, c1 = 0, pw0 = 0, pw1 = 0, pot = 0;
    for (let i = 0; i < n; i++) {
      const p = generatePlayer({ quality: q, grade: 1, pos, enrollYear: 2026 });
      const ov0 = pos === 'P' ? pitcherOverall(p) : batterOverall(p);
      v0 += p.a.velocity; c0 += pos === 'P' ? p.a.control : p.a.contact; pw0 += pos === 'P' ? p.a.stamina : p.a.power; pot += p.pot;
      // 1 年级 44 周 + 2 年级 44 周 + 3 年级 14 周（到夏季大会）
      p.grade = 1; aiGrow(p, 44); p.grade = 2; aiGrow(p, 44); p.grade = 3; aiGrow(p, 14);
      const ov1 = pos === 'P' ? pitcherOverall(p) : batterOverall(p);
      s0.push(ov0); s1.push(ov1);
      v1 += p.a.velocity; c1 += pos === 'P' ? p.a.control : p.a.contact; pw1 += pos === 'P' ? p.a.stamina : p.a.power;
    }
    const m = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);
    if (pos === 'P') console.log(`P q${q}: ov ${m(s0)} → ${m(s1)} | vel ${(v0 / n).toFixed(1)} → ${(v1 / n).toFixed(1)} | ctl ${(c0 / n).toFixed(1)} → ${(c1 / n).toFixed(1)} | sta ${(pw0 / n).toFixed(1)} → ${(pw1 / n).toFixed(1)} | pot ${(pot / n).toFixed(0)}`);
    else console.log(`${pos} q${q}: ov ${m(s0)} → ${m(s1)} | con ${(c0 / n).toFixed(1)} → ${(c1 / n).toFixed(1)} | pow ${(pw0 / n).toFixed(1)} → ${(pw1 / n).toFixed(1)} | pot ${(pot / n).toFixed(0)}`);
  }
}
