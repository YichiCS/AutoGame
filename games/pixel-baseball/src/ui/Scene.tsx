import { useEffect, useRef } from 'preact/hooks';
import { G, myPlayers, mySchool } from '../core/state';
import { activity, rainy } from '../core/daily';
import { monthOf } from '../core/calendar';
import { PracticeScene, SW, SH } from '../render/scene';
import { openPlayer, ui } from './store';

function sceneData() {
  const ps = myPlayers();
  return {
    month: monthOf(G.day),
    colors: mySchool().colors,
    facilities: G.facilities,
    players: ps.map((p) => ({ p, act: activity.get(p.id) ?? (p.injury ? 'injured' : 'rest') })),
    rain: rainy(),
    cat: !!G.flags.cat,
    matchDay: !!G.pending,
    schoolName: mySchool().name,
  };
}

/** 练习场（比赛在单独的比赛画面里进行） */
export function SceneView() {
  const pRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PracticeScene | null>(null);

  useEffect(() => {
    const scene = new PracticeScene(pRef.current!);
    sceneRef.current = scene;
    scene.setData(sceneData());
    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
      last = now;
      if (!ui.match && !document.hidden) {
        scene.update(dt);
        scene.draw();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const key = `${G.day}|${G.roster.length}|${G.schoolId}|${G.pending ? 1 : 0}|${activity.size}`;
  useEffect(() => {
    sceneRef.current?.setData(sceneData());
  }, [key]);

  return (
    <div class="scene-wrap">
      <canvas
        ref={pRef}
        class="scene"
        width={SW}
        height={SH}
        onClick={(e) => {
          const c = e.currentTarget as HTMLCanvasElement;
          const r = c.getBoundingClientRect();
          const pid = sceneRef.current?.hitTest(((e.clientX - r.left) / r.width) * SW, ((e.clientY - r.top) / r.height) * SH);
          if (pid) openPlayer(pid);
        }}
      />
    </div>
  );
}
