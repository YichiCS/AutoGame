// 事件结果预览不能影响游戏：同一个开局玩两遍——一遍每件事处理之前都先算一次全部选项的预览，一遍不算——
// 最后的游戏状态（JSON）和随机数状态必须完全一样。顺便打印一些事件的预览，看看写得对不对。
//   node scripts/run-ts.mjs tests/preview.ts [年数] [种子] [县 id]
import { prepareWorld, startGame } from '../src/core/newgame';
import { G, idSnapshot } from '../src/core/state';
import { resolvePendingNow, tick } from '../src/core/sim';
import { buildView, resolve } from '../src/core/queue';
import { getRngState, hash32 } from '../src/core/rng';
import { loadState, snapshot } from '../src/core/save';
import { previewEvent, type ChoicePreview } from '../src/core/preview';
import { YEAR } from '../src/core/calendar';

const years = Number(process.argv[2] ?? 2);
const seed = Number(process.argv[3] ?? 7);
const prefId = Number(process.argv[4] ?? 30);

const { state, offers } = prepareWorld({ mgrName: '测试 监督', bg: 'teacher', age: 35, prefId, difficulty: 'normal', dh: true, seed });
startGame(state, offers[0].id);
// 什么都不托管：每件事都排进队列，由下面的循环先预览、再处理
G.policies.auto = 'off';
const init = snapshot();
const resetIds = idSnapshot();

/** 选哪个选项：按日期和事件算一个固定的数（不动游戏的随机数），两遍选得一样，也能走到各种选项 */
function pick(n: number, enabled: boolean[], salt: number): number {
  const ok = enabled.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return 0;
  return ok[hash32(G.day, salt, n) % ok.length];
}

interface Result {
  json: string;
  rng: number[];
  events: number;
  previewed: number;
  tagged: number;
  ms: number;
}

const samples: string[] = [];

function play(withPreview: boolean): Result {
  resetIds();
  loadState(JSON.parse(init));
  let events = 0;
  let previewed = 0;
  let tagged = 0;
  let ms = 0;
  for (let d = 0; d < years * YEAR; d++) {
    if (G.pending) resolvePendingNow();
    let guard = 0;
    while (G.queue.length && guard++ < 200) {
      const item = G.queue[0];
      events++;
      let pv: (ChoicePreview | null)[] = [];
      if (withPreview) {
        const t0 = performance.now();
        pv = previewEvent(item);
        ms += performance.now() - t0;
        previewed++;
        if (pv.some((x) => x && x.tags.length)) tagged++;
      }
      const v = buildView(item);
      const ci = v ? pick(v.choices.length, v.choices.map((c) => !c.disabled), events) : 0;
      if (withPreview && v && v.choices.length > 1 && samples.length < 40 && !samples.some((s) => s.startsWith(`【${v.title}】`))) {
        samples.push(
          `【${v.title}】\n` +
            v.choices.map((c, i) => `   ${i === ci ? '→' : ' '} ${c.label}：${pv[i] ? (pv[i]!.tags.map((t) => `[${t.text}]`).join(' ') || '（没有直接影响）') + (pv[i]!.runs > 1 ? `  〔模拟 ${pv[i]!.runs} 次〕` : '') : '（不能选）'}`).join('\n'),
        );
      }
      resolve(item, ci, true);
    }
    tick();
  }
  // 队列里的 qid 带有时间戳，不参与比较
  const json = JSON.stringify(G, (k, v) => (k === 'qid' ? 0 : v));
  return { json, rng: getRngState(), events, previewed, tagged, ms };
}

const a = play(false);
const b = play(true);
console.log(samples.join('\n'));
console.log(`\n${years} 年，事件 ${b.events} 件（预览 ${b.previewed} 件，其中 ${b.tagged} 件有结果标签），预览共耗时 ${b.ms.toFixed(0)} ms（平均 ${(b.ms / Math.max(1, b.previewed)).toFixed(1)} ms / 件）`);
let fails = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? '✓' : '✗'} ${m}`);
  if (!c) fails++;
};
ok(a.events === b.events, `两遍处理的事件一样多（${a.events} / ${b.events}）`);
ok(a.json === b.json, `最后的游戏状态完全一样（${(a.json.length / 1024).toFixed(0)} KB）`);
ok(JSON.stringify(a.rng) === JSON.stringify(b.rng), '随机数状态完全一样');
if (a.json !== b.json) {
  let i = 0;
  while (i < a.json.length && a.json[i] === b.json[i]) i++;
  console.log('第一处不同：\n  不预览：', a.json.slice(Math.max(0, i - 120), i + 120), '\n  预览：  ', b.json.slice(Math.max(0, i - 120), i + 120));
}
ok(b.tagged > b.previewed * 0.3, '相当一部分事件算出了结果标签');
console.log(fails ? `\n✗ ${fails} 项失败` : '\n✓ 全部通过');
if (fails) process.exit(1);
