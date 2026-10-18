// 背景：低分辨率画布上闪烁的像素星星。系统开启「减少动态效果」时只画静止的一帧。
const COLORS = ['#f4f4f4', '#94b0c2', '#73eff7', '#41a6f6', '#ffcd75', '#a7f070'];
const SCALE = 3; // 一个“像素”占 3×3 个屏幕像素

export function startStarfield(canvas) {
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let stars = [];
  let w = 0;
  let h = 0;
  let last = 0;

  function resize() {
    w = Math.ceil(innerWidth / SCALE);
    h = Math.ceil(innerHeight / SCALE);
    canvas.width = w;
    canvas.height = h;
    const n = Math.round((w * h) / 700);
    stars = Array.from({ length: n }, () => ({
      x: Math.floor(Math.random() * w),
      y: Math.floor(Math.random() * h),
      c: COLORS[Math.floor(Math.random() * COLORS.length)],
      phase: Math.random() * Math.PI * 2,
      speed: 0.4 + Math.random() * 1.6,
      big: Math.random() < 0.07,
    }));
    draw(performance.now());
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const tw = reduce.matches ? 0.6 : 0.5 + 0.5 * Math.sin(s.phase + (t / 1000) * s.speed);
      ctx.fillStyle = s.c;
      ctx.globalAlpha = 0.15 + 0.6 * tw;
      ctx.fillRect(s.x, s.y, 1, 1);
      if (s.big && tw > 0.75) {
        ctx.globalAlpha = 0.35 * tw;
        ctx.fillRect(s.x - 1, s.y, 1, 1);
        ctx.fillRect(s.x + 1, s.y, 1, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 1);
        ctx.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    if (!reduce.matches && t - last > 120) {
      draw(t);
      last = t;
    }
    requestAnimationFrame(loop);
  }

  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(resize, 150);
  });
  resize();
  requestAnimationFrame(loop);
}
