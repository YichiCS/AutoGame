import { useEffect, useRef } from 'preact/hooks';
import type { PlayEvent } from '../sim/types';
import { G, myPlayers, mySchool } from '../core/state';
import { activity, rainy } from '../core/daily';
import { monthOf } from '../core/calendar';
import { PracticeScene, SW, SH } from '../render/scene';
import { FieldRenderer } from '../render/field';
import { finishLive, loop, speed, type Live } from './loop';
import { openPlayer } from './store';
import { sfx } from './sound';
import { Btn } from './components/common';

function sceneData() {
  const ps = myPlayers();
  return {
    month: monthOf(G.day),
    colors: mySchool().colors,
    facilities: G.facilities,
    players: ps.map((p) => ({ p, act: activity.get(p.id) ?? (p.injury ? 'injured' : 'rest') })),
    rain: rainy(),
    cat: !!G.flags.cat,
    matchDay: !!G.pending && !loop.live,
    schoolName: mySchool().name,
  };
}

async function animate(r: FieldRenderer, e: PlayEvent, backlog: number): Promise<void> {
  r.speed = speed() * (backlog > 3 ? 3 : 1);
  if (backlog > 8) {
    if (e.snap) r.setBases(e.snap.bases);
    return;
  }
  if (e.k === 'half') {
    r.resetPositions();
    r.setDefense(e.side === 0);
    r.setBases(e.snap?.bases ?? [null, null, null]);
  }
  if (e.pitch) await r.playPitch(e.pitch);
  if (e.bip) {
    sfx('bat');
    await r.playBip(e.bip, e.moves ?? []);
    r.resetPositions();
  } else if (e.moves && e.moves.length) await r.playMoves(e.moves);
  if (e.k === 'play' || e.k === 'ibb') r.batterOn = true;
  if (e.snap) r.setBases(e.snap.bases);
  if (e.runs) sfx('cheer');
  if (e.big && e.bip?.res === 'HR') r.showFlash('本垒打!!', '#ffcd75', 1.4);
}

function Scoreboard(p: { L: Live }) {
  const L = p.L;
  const away = L.res.away;
  const home = L.res.home;
  const s = L.snap;
  const n = Math.max(9, L.line[0].length, L.line[1].length);
  const cols = Array.from({ length: n }, (_, i) => i);
  const score = s?.score ?? [0, 0];
  const mine = L.res.mySide;
  const row = (side: 0 | 1, name: string) => (
    <tr class={side === mine ? 'me' : ''}>
      <td class="tn">{name}</td>
      {cols.map((i) => (
        <td key={i}>{L.line[side][i] ?? ''}</td>
      ))}
      <td class="b">{score[side]}</td>
      <td>{L.hits[side]}</td>
    </tr>
  );
  const bases = s?.bases ?? [null, null, null];
  // 四坏、三振、三出局的那一刻计数会超出显示范围
  const dots = (n: number, max: number) => {
    const k = Math.max(0, Math.min(max, n));
    return (
      <>
        <i>{'●'.repeat(k)}</i>
        <i class="dim">{'●'.repeat(max - k)}</i>
      </>
    );
  };
  return (
    <div class="sboard">
      <table>
        <tbody>
          {row(0, away.short)}
          {row(1, home.short)}
        </tbody>
      </table>
      <div class="sstate">
        <span>{s ? `${s.inning} 局${s.half === 0 ? '上' : '下'}` : '比赛开始'}</span>
        <span class="bso">
          B{dots(s?.balls ?? 0, 3)} S{dots(s?.strikes ?? 0, 2)} O{dots(s?.outs ?? 0, 2)}
        </span>
        <span class="bases">
          <b class={bases[1] !== null ? 'on' : ''}>◆</b>
          <span>
            <b class={bases[2] !== null ? 'on' : ''}>◆</b>
            <b class={bases[0] !== null ? 'on' : ''}>◆</b>
          </span>
        </span>
      </div>
    </div>
  );
}

export function SceneView() {
  const pRef = useRef<HTMLCanvasElement>(null);
  const fRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PracticeScene | null>(null);
  const live = loop.live;

  useEffect(() => {
    const scene = new PracticeScene(pRef.current!);
    sceneRef.current = scene;
    scene.setData(sceneData());
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (!loop.live && !document.hidden) {
        scene.update(dt);
        scene.draw();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const key = `${G.day}|${G.roster.length}|${G.schoolId}|${G.pending ? 1 : 0}|${live ? 1 : 0}|${activity.size}`;
  useEffect(() => {
    sceneRef.current?.setData(sceneData());
  }, [key]);

  const seed = live?.res.pm.seed;
  useEffect(() => {
    const L = loop.live;
    const cv = fRef.current;
    if (!L || !cv) return;
    const m = L.res;
    const r = new FieldRenderer(cv, {
      koshien: m.rules.koshien,
      fence: m.rules.fence,
      homeColors: m.home.colors,
      awayColors: m.away.colors,
      seed: m.home.schoolId * 7 + 3,
    });
    r.setDefense(true);
    r.setBases([null, null, null]);
    let chain = Promise.resolve();
    let backlog = 0;
    L.onEvent = (e) => {
      backlog++;
      chain = chain.then(() => animate(r, e, backlog)).catch(() => undefined).then(() => {
        backlog--;
      });
    };
    return () => {
      L.onEvent = null;
      r.stop();
    };
  }, [seed]);

  const tickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (tickerRef.current) tickerRef.current.scrollTop = tickerRef.current.scrollHeight;
  });

  return (
    <div class="scene-wrap">
      <canvas
        ref={pRef}
        class="scene"
        width={SW}
        height={SH}
        style={{ display: live ? 'none' : 'block' }}
        onClick={(e) => {
          const c = e.currentTarget as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          const pid = sceneRef.current?.hitTest(((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH);
          if (pid) openPlayer(pid);
        }}
      />
      {live && (
        <div class="stadium">
          <div class="slabel">
            <span>⚾ {live.res.pm.label} · {live.res.rules.stadium}</span>
            <Btn small kind="primary" onClick={() => finishLive()}>
              跳过 ▶▶
            </Btn>
          </div>
          <div class="fieldbox">
            <canvas ref={fRef} class="field" />
            <Scoreboard L={live} />
          </div>
          <div class="ticker" ref={tickerRef}>
            {live.lines.slice(-30).map((l, i) => (
              <div key={i} class={`${l.big ? 'big' : ''} ${l.side === live.res.mySide ? 'mine' : ''}`}>
                {l.t}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
