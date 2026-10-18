/* 实验室场景：480x240 像素画布。角色走动、显示器内容、昼夜（跟随现实时间）、四季（跟随游戏月份） */
(function () {
  'use strict';
  const RS = window.RS;
  const SP = RS.Sprites, P = SP.PAL, U = RS.U;
  const Scene = (RS.Scene = {});
  const W = 480, H = 240;
  Scene.W = W;
  Scene.H = H;

  const WALL_B = 86;
  const LANES = { back: 99, mid: 152, front: 218 };
  const CORR = [62, 402];
  const DESK_X0 = 70, DESK_DX = 41;
  const ROW_Y = [102, 158];
  const DOOR = { x: 47, y: 94 };
  const PI_DESK = { x: 406, y: 150 };
  const PI_STAND = { x: 398, y: 160 };
  const SOFA_SEATS = [{ x: 18, y: 216 }, { x: 40, y: 216 }];
  const SPOTS = {
    coffee: { x: 16, y: 106 }, whiteboard: { x: 168, y: 99 }, window1: { x: 96, y: 99 }, window2: { x: 280, y: 99 },
    honor: { x: 356, y: 99 }, snack: { x: 32, y: 140 },
  };
  const THEMES = [
    { wall: '#c9bea6', line: '#bdb199', trim: '#8a7d6b', base: '#7a6a55', ceil: '#e6dcc6', floor: '#9b6a45', floorL: '#a8774f', floorD: '#86593a' },
    { wall: '#b4c3ad', line: '#a8b8a1', trim: '#6f7f68', base: '#5d6b57', ceil: '#dde6d6', floor: '#8a5a3b', floorL: '#986745', floorD: '#764c31' },
    { wall: '#aebbd2', line: '#a1aec6', trim: '#6b7894', base: '#56627c', ceil: '#dfe6f1', floor: '#cfc8b6', floorL: '#dbd5c4', floorD: '#b9b19c' },
    { wall: '#d8c9a2', line: '#cbbc95', trim: '#8f7f57', base: '#6e5f3d', ceil: '#efe5cb', floor: '#4f6a91', floorL: '#5a77a0', floorD: '#435b7d' },
    { wall: '#c7d3cf', line: '#bac7c3', trim: '#5f7470', base: '#4c5f5b', ceil: '#e8efed', floor: '#6d5a7e', floorL: '#7a6790', floorD: '#5c4b6b' },
    { wall: '#e2ddd3', line: '#d6d0c4', trim: '#7d7466', base: '#5e564a', ceil: '#f4f1ea', floor: '#d8d4cc', floorL: '#e6e3dc', floorD: '#bdb8ad' },
  ];
  // 一层画得下 16 个工位；更大的实验室分成两层，画面左上角切换
  const FLOOR_N = 16;
  let floor = 0;
  const floorPing = [0, 0];

  let cv = null, ctx = null, g = null;
  let T = 0;
  const actors = new Map();
  let ghosts = [];
  let pi = null, cat = null;
  let parts = [], floats = [], emotes = [], glows = [];
  let hits = [];
  let doorOpen = 0;
  const sofaUsed = [null, null];

  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const hash = n => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };

  // ---------- 布局 ----------
  function deskPos(d) {
    const k = d % FLOOR_N;
    const col = Math.floor(k / 2), row = k % 2;
    return { col, row, x: DESK_X0 + col * DESK_DX, y: ROW_Y[row] };
  }
  function deskSeat(d) {
    const p = deskPos(d);
    return { kind: 'desk', d, fl: d >= FLOOR_N ? 1 : 0, x: p.x + 17, y: p.y + 36 };
  }
  const twoFloors = () => !!g && RS.G.desks(g) > FLOOR_N;
  // 没有工位的人坐在地上：实验室分两层时都挤在二楼
  function floorSeat(i) {
    return { kind: 'floor', d: -1 - i, fl: twoFloors() ? 1 : 0, x: 84 + (i % 12) * 26, y: 236 };
  }
  const flOf = a => (!a || a.isPI ? 0 : a.seat.fl || 0);
  const here = a => flOf(a) === floor;
  function laneOf(pt) {
    if (pt.y <= 112) return LANES.back;
    if (pt.y <= 160) return LANES.mid;
    return LANES.front;
  }
  function route(a, b) {
    const pts = [];
    const la = laneOf(a), lb = laneOf(b);
    pts.push({ x: a.x, y: la });
    if (la !== lb) {
      const c0 = Math.abs(a.x - CORR[0]) + Math.abs(b.x - CORR[0]);
      const c1 = Math.abs(a.x - CORR[1]) + Math.abs(b.x - CORR[1]);
      const cx = c0 <= c1 ? CORR[0] : CORR[1];
      pts.push({ x: cx, y: la }, { x: cx, y: lb });
    }
    pts.push({ x: b.x, y: lb }, { x: b.x, y: b.y });
    return pts;
  }

  // ---------- 角色 ----------
  // 青年教师穿西装
  const suitCache = new Map();
  function jpiAvatar(m) {
    let av = suitCache.get(m.id);
    if (!av || av.src !== m.avatar) { av = Object.assign({ suit: true }, m.avatar); av.src = m.avatar; suitCache.set(m.id, av); }
    return av;
  }
  function newActor(m, seat, how) {
    const a = {
      id: m.id, m, av: m.role === 'jpi' ? jpiAvatar(m) : m.avatar, role: m.role, seat, state: 'sit', x: seat.x, y: seat.y,
      path: [], after: 'sit', timer: U.range(4, 20), stay: 0, face: 1, walkT: 0, jumpT: 0, cheerT: 0, sofa: -1, pendingEmote: null,
    };
    if (how === 'enter') {
      a.x = DOOR.x; a.y = DOOR.y;
      a.path = route(DOOR, seat);
      a.state = 'walk';
      doorOpen = 1.2;
    }
    return a;
  }
  function emote(a, icon, dur) {
    a.emote = icon;
    a.emoteT = dur || 2.5;
  }
  function goTo(a, target, after, stay, em) {
    if (a.state === 'sit') { a.x = a.seat.x; a.y = a.seat.y; }
    a.path = route({ x: a.x, y: a.y }, target);
    a.state = 'walk';
    a.after = after;
    a.stay = stay;
    a.pendingEmote = em;
  }
  function goHome(a) {
    freeSofa(a);
    a.path = route({ x: a.x, y: a.y }, a.seat);
    a.state = 'walk';
    a.after = 'sit';
  }
  function freeSofa(a) {
    if (a.sofa >= 0 && sofaUsed[a.sofa] === a) sofaUsed[a.sofa] = null;
    a.sofa = -1;
  }

  function sync(initial) {
    if (!g) return;
    const ids = new Set();
    let ov = 0;
    for (const m of g.members) {
      ids.add(m.id);
      const seat = m.desk >= 0 ? deskSeat(m.desk) : floorSeat(ov++);
      let a = actors.get(m.id);
      if (!a) {
        a = newActor(m, seat, initial || m.status !== 'active' ? 'sit' : 'enter');
        actors.set(m.id, a);
      }
      a.m = m;
      a.av = m.role === 'jpi' ? jpiAvatar(m) : m.avatar;
      a.role = m.role;
      if (a.seat.d !== seat.d || (a.seat.fl || 0) !== seat.fl) {
        const moved = (a.seat.fl || 0) !== seat.fl;
        a.seat = seat;
        if (moved && a.state !== 'hidden') {
          // 换了楼层：从那一层的门口走进来
          freeSofa(a);
          a.x = DOOR.x; a.y = DOOR.y;
          a.path = route(DOOR, seat);
          a.state = 'walk';
          a.after = 'sit';
        } else if (a.state === 'sit') { a.state = 'walk'; a.path = route({ x: a.x, y: a.y }, seat); a.after = 'sit'; }
      }
      const away = m.status !== 'active';
      if (away && a.state !== 'hidden') { freeSofa(a); a.state = 'hidden'; a.path = []; }
      else if (!away && a.state === 'hidden') { a.state = 'sit'; a.x = seat.x; a.y = seat.y; }
    }
    for (const id of Array.from(actors.keys())) if (!ids.has(id)) { freeSofa(actors.get(id)); actors.delete(id); }
    // PI
    if (!pi) pi = { id: 'pi', isPI: true, av: Object.assign({ suit: true }, g.pi.avatar), seat: { kind: 'pi', x: PI_STAND.x, y: PI_STAND.y }, state: 'sit', x: PI_STAND.x, y: PI_STAND.y, path: [], timer: 8, face: 1, walkT: 0, jumpT: 0, cheerT: 0, sofa: -1 };
    // 猫
    if (g.facilities.cat && !cat) cat = { x: 300, y: 200, tx: 300, ty: 200, state: 'walk', timer: 3, face: 1, t: 0 };
    if (!g.facilities.cat) cat = null;
  }

  function decide(a) {
    a.timer = U.range(10, 26);
    if (Math.random() < 0.55) {
      workEmote(a);
      return;
    }
    const f = g.facilities;
    const m = a.m;
    const p = m.projectId ? RS.G.project(g, m.projectId) : null;
    // 沙发、零食柜、荣誉墙和猫都在一楼；二楼只有窗户、白板和咖啡机
    const up = flOf(a) === 1;
    const opts = [['window', 1]];
    if (f.coffee) opts.push(['coffee', 3]);
    if (p && p.phase === 'idea') opts.push(['whiteboard', 3]);
    if (!up && f.sofa && sofaUsed.some(x => !x)) opts.push(['sofa', m.mood < 60 ? 3 : 1]);
    if (!up && f.snack) opts.push(['snack', 1.2]);
    if (!up && g.papers.length) opts.push(['honor', 0.5]);
    if (!up && cat) opts.push(['cat', 1.2]);
    const others = Array.from(actors.values()).filter(o => o !== a && o.state === 'sit' && o.seat.kind === 'desk' && flOf(o) === flOf(a));
    if (others.length) opts.push(['chat', 2]);
    const pick = U.weighted(opts, o => o[1]);
    if (!pick) return;
    switch (pick[0]) {
      case 'coffee': goTo(a, SPOTS.coffee, 'stand', U.range(3, 6), 'coffee'); break;
      case 'whiteboard': goTo(a, { x: SPOTS.whiteboard.x + U.int(-24, 24), y: 99 }, 'stand', U.range(5, 9), U.pick(['bulb', 'question'])); break;
      case 'window': goTo(a, U.pick([SPOTS.window1, SPOTS.window2]), 'stand', U.range(3, 6), null); break;
      case 'snack': goTo(a, SPOTS.snack, 'stand', U.range(2, 4), 'heart'); break;
      case 'honor': goTo(a, SPOTS.honor, 'stand', U.range(3, 5), 'star'); break;
      case 'cat': goTo(a, { x: U.clamp(cat.x + 10, 4, 470), y: U.clamp(cat.y, 100, 230) }, 'stand', U.range(3, 5), 'heart'); break;
      case 'chat': {
        const o = U.pick(others);
        goTo(a, { x: o.seat.x + 13, y: o.seat.y }, 'stand', U.range(4, 7), 'dots');
        emote(o, 'dots', 6);
        break;
      }
      case 'sofa': {
        const i = sofaUsed.findIndex(x => !x);
        if (i < 0) return;
        sofaUsed[i] = a;
        a.sofa = i;
        goTo(a, SOFA_SEATS[i], 'sofa', U.range(6, 12), f.console && m.mood > 50 ? 'music' : 'zz');
        break;
      }
      default: break;
    }
  }

  function workEmote(a) {
    const m = a.m;
    if (!m || Math.random() < 0.55) return;
    const p = m.projectId ? RS.G.project(g, m.projectId) : null;
    if (m.mood < 25) return emote(a, U.pick(['sweat', 'rain']), 3);
    if (p && p.rush > 0) return emote(a, 'exclam', 2.5);
    if (m.mood > 85 && Math.random() < 0.4) return emote(a, 'music', 2.5);
    if (!p) return;
    emote(a, { idea: 'bulb', exp: 'gear', write: 'pen' }[p.phase] || 'dots', 2.2);
  }

  function step(a, dt, speed) {
    if (!a.path.length) return true;
    const t = a.path[0];
    const dx = t.x - a.x, dy = t.y - a.y;
    const d = Math.hypot(dx, dy);
    const s = speed * dt;
    if (dx) a.face = dx > 0 ? 1 : -1;
    if (d <= s) { a.x = t.x; a.y = t.y; a.path.shift(); }
    else { a.x += (dx / d) * s; a.y += (dy / d) * s; }
    a.walkT += dt;
    return !a.path.length;
  }

  function updateActor(a, dt) {
    if (a.emoteT > 0) a.emoteT -= dt;
    if (a.jumpT > 0) a.jumpT -= dt;
    if (a.cheerT > 0) a.cheerT -= dt;
    switch (a.state) {
      case 'hidden':
        return;
      case 'walk':
        if (step(a, dt, 34)) {
          a.state = a.after;
          if (a.state === 'sit') { a.x = a.seat.x; a.y = a.seat.y; a.timer = U.range(8, 20); }
          else { a.timer = a.stay; if (a.pendingEmote) emote(a, a.pendingEmote, Math.min(4, a.stay)); a.pendingEmote = null; }
        }
        return;
      case 'sit':
        a.timer -= dt;
        if (a.timer <= 0) decide(a);
        return;
      case 'stand':
      case 'sofa':
        a.timer -= dt;
        if (a.timer <= 0) goHome(a);
        return;
      default:
        a.state = 'sit';
    }
  }

  function updatePI(dt) {
    const a = pi;
    if (!a) return;
    if (a.emoteT > 0) a.emoteT -= dt;
    if (a.jumpT > 0) a.jumpT -= dt;
    if (a.cheerT > 0) a.cheerT -= dt;
    const resting = g.flags.restUntil > g.day || g.policies.focus === 'rest';
    if (a.state === 'walk') {
      if (step(a, dt, 30)) {
        a.state = a.after;
        a.timer = a.stay;
        if (a.pendingEmote) emote(a, a.pendingEmote, 3);
        a.pendingEmote = null;
        if (a.state === 'sit') { a.x = PI_STAND.x; a.y = PI_STAND.y; }
      }
      return;
    }
    a.timer -= dt;
    if (a.timer > 0) return;
    if (a.state !== 'sit') {
      freeSofa(a);
      a.path = route({ x: a.x, y: a.y }, PI_STAND);
      a.state = 'walk';
      a.after = 'sit';
      a.stay = 0;
      return;
    }
    a.timer = U.range(10, 22);
    if (g.flags.sabbaticalUntil > g.day) return;
    if (resting && g.facilities.sofa) {
      const i = sofaUsed.findIndex(x => !x);
      if (i >= 0) {
        sofaUsed[i] = a;
        a.sofa = i;
        a.path = route(PI_STAND, SOFA_SEATS[i]);
        a.state = 'walk';
        a.after = 'sofa';
        a.stay = U.range(10, 18);
        a.pendingEmote = 'zz';
        return;
      }
    }
    if (resting) return emote(a, 'zz', 3);
    if (g.pi.energy < 20) return emote(a, 'sweat', 3);
    const f = g.policies.focus;
    if (f === 'mentor' && Math.random() < 0.6) {
      const c = Array.from(actors.values()).filter(o => o.state === 'sit' && o.seat.kind === 'desk' && flOf(o) === 0);
      if (c.length) {
        const o = U.pick(c);
        a.path = route(PI_STAND, { x: o.seat.x + 13, y: o.seat.y });
        a.state = 'walk';
        a.after = 'stand';
        a.stay = U.range(4, 6);
        a.pendingEmote = 'dots';
        emote(o, 'bulb', 7);
        return;
      }
    }
    emote(a, f === 'grant' ? U.pick(['money', 'pen']) : f === 'research' ? U.pick(['gear', 'bulb']) : 'dots', 2.5);
  }

  function updateCat(dt) {
    if (!cat) return;
    cat.t += dt;
    cat.timer -= dt;
    if (cat.state === 'walk') {
      const dx = cat.tx - cat.x, dy = cat.ty - cat.y, d = Math.hypot(dx, dy);
      if (dx) cat.face = dx > 0 ? 1 : -1;
      if (d < 1) { cat.state = U.chance(0.5) ? 'sleep' : 'sit'; cat.timer = U.range(6, 18); }
      else { cat.x += (dx / d) * 16 * dt; cat.y += (dy / d) * 16 * dt; }
    } else if (cat.timer <= 0) {
      cat.state = 'walk';
      const spot = U.pick([{ x: U.range(70, 390), y: U.pick([146, 210, 226]) }, { x: 455, y: 100 }, { x: U.range(10, 50), y: 226 }, { x: U.range(80, 380), y: 99 }]);
      cat.tx = spot.x;
      cat.ty = spot.y;
    }
  }

  // ---------- 特效 ----------
  function burst(x, y, kind, n) {
    const cols = kind === 'coin' ? [P.yellow, P.gold, '#fff1b0'] : kind === 'spark' ? [P.white, P.yellow, P.cyan] : [P.red, P.yellow, P.lime, P.sky, P.orange, P.cyan, P.white];
    for (let i = 0; i < n; i++) {
      parts.push({ x, y, vx: U.range(-45, 45), vy: U.range(-95, -35), life: U.range(1, 2.2), c: U.pick(cols), s: kind === 'coin' ? 2 : 1, gy: kind === 'spark' ? 40 : 140 });
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
  }
  function floatText(x, y, text, color) {
    x = U.clamp(x, 1, W - SP.textWidth(text) - 1);
    floats.push({ x, y, text, color: color || P.yellow, life: 2.2, vy: -10 });
    if (floats.length > 6) floats.shift();
  }
  function floatIcon(x, y, icon) {
    floats.push({ x, y, icon, life: 2, vy: -12 });
    if (floats.length > 6) floats.shift();
  }
  function actorOf(id) {
    return id === 'pi' ? pi : actors.get(id);
  }
  // 楼层切换按钮的位置：别的楼层发生的事，特效画在按钮旁边，按钮也会闪一会儿
  const TAB_POS = f => ({ x: 4 + f * 17, y: 1 });
  function headPos(a) {
    if (!a) return { x: W / 2, y: 120 };
    if (!here(a)) {
      const f = flOf(a);
      floorPing[f] = T + 4;
      return { x: TAB_POS(f).x + 7, y: 16 };
    }
    if (a.state === 'sit' && a.seat.kind === 'desk') { const p = deskPos(a.seat.d); return { x: p.x + 17, y: p.y + 6 }; }
    if (a.isPI && a.state === 'sit') return { x: PI_DESK.x + 29, y: PI_DESK.y - 14 };
    return { x: a.x, y: a.y - 19 };
  }

  let bound = false;
  function bindBus() {
    if (bound) return;
    bound = true;
    RS.bus.on('accept', d => {
      const a = actorOf(d.lead);
      const h = headPos(a);
      burst(h.x, h.y, 'confetti', d.best ? 70 : 32);
      floatText(h.x - SP.textWidth(d.best ? 'BEST PAPER!' : 'ACCEPT!') / 2, h.y - 6, d.best ? 'BEST PAPER!' : 'ACCEPT!', d.best ? P.yellow : P.lime);
      if (a) { a.jumpT = 1.2; a.cheerT = 2.5; emote(a, 'star', 3); }
      actors.forEach(o => { if (o !== a && o.state === 'sit' && Math.random() < 0.5) emote(o, 'heart', 2.5); });
    });
    RS.bus.on('reject', d => { const a = actorOf(d.lead); if (a) emote(a, 'rain', 4); });
    RS.bus.on('submit', p => { const a = actorOf(p.lead); const h = headPos(a); floatIcon(h.x - 4, h.y - 4, 'paper'); });
    RS.bus.on('arxiv', d => { const a = actorOf(d.paper.lead); const h = headPos(a); floatText(h.x - 10, h.y - 4, 'ARXIV', P.silver); });
    RS.bus.on('phase', d => {
      const a = actorOf(d.p.lead);
      if (!a) return;
      const h = headPos(a);
      burst(h.x, h.y, 'spark', 8);
      emote(a, { idea: 'gear', exp: 'pen', write: 'sparkle' }[d.from] || 'sparkle', 2);
    });
    RS.bus.on('grant', () => {
      const h = floor === 0 ? { x: PI_DESK.x + 29, y: PI_DESK.y - 10 } : headPos(pi || { isPI: true });
      burst(h.x, h.y, 'coin', 26);
      floatText(h.x - 15, h.y - 12, 'GRANT!', P.yellow);
      if (pi) { pi.cheerT = 2; pi.jumpT = 1; }
    });
    RS.bus.on('member_leave', d => {
      const a = actors.get(d.m.id);
      if (!a) return;
      actors.delete(d.m.id);
      freeSofa(a);
      if (a.state === 'hidden') return;
      if (a.state === 'sit') { a.x = a.seat.x; a.y = a.seat.y; }
      a.path = route({ x: a.x, y: a.y }, DOOR);
      a.state = 'walk';
      a.after = 'gone';
      if (d.reason === 'graduated') {
        a.grad = true;
        a.cheerT = 1.5;
        emote(a, 'cap', 6);
        const h = headPos(a);
        burst(h.x, h.y, 'confetti', 30);
      } else if (d.reason === 'quit' || d.reason === 'dismissed') {
        emote(a, 'rain', 6);
      }
      ghosts.push(a);
    });
    RS.bus.on('buy', () => burst(W / 2, 140, 'spark', 16));
    RS.bus.on('expand', () => burst(W / 2, 160, 'confetti', 40));
    RS.bus.on('achievement', () => { burst(356, 50, 'spark', 20); floatIcon(352, 40, 'trophy'); });
  }

  // ---------- 公共接口 ----------
  Scene.init = function (canvas) {
    cv = canvas;
    cv.width = W;
    cv.height = H;
    ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    bindBus();
  };
  Scene.setGame = function (game) {
    g = game;
    actors.clear();
    ghosts = []; parts = []; floats = [];
    pi = null; cat = null;
    sofaUsed[0] = sofaUsed[1] = null;
    floor = 0;
    floorPing[0] = floorPing[1] = 0;
    if (g) sync(true);
  };
  Scene.setFloor = function (f) {
    if (!twoFloors()) f = 0;
    if (f === floor) return;
    floor = f;
    parts = []; floats = [];
  };
  Scene.floor = () => floor;
  Scene.update = function (dt) {
    T += dt;
    if (!g) return;
    sync(false);
    actors.forEach(a => updateActor(a, dt));
    updatePI(dt);
    updateCat(dt);
    ghosts = ghosts.filter(a => {
      if (a.emoteT > 0) a.emoteT -= dt;
      if (step(a, dt, 34)) { doorOpen = 1; return false; }
      return true;
    });
    if (doorOpen > 0) doorOpen -= dt;
    parts = parts.filter(p => {
      p.vy += p.gy * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      return p.life > 0 && p.y < H;
    });
    floats = floats.filter(f => { f.y += f.vy * dt; f.life -= dt; return f.life > 0; });
  };

  // ---------- 光照 ----------
  function lighting() {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    if (h >= 7 && h < 17) return { sky: ['#41a6f6', '#8fd3ff'], dark: 0, night: false, sun: true, h };
    if (h >= 17 && h < 19.5) return { sky: ['#5d275d', '#ef7d57'], dark: 0.12, night: false, sun: true, h };
    if (h >= 5 && h < 7) return { sky: ['#3b5dc9', '#ffcd75'], dark: 0.1, night: false, sun: true, h };
    return { sky: ['#1a1c2c', '#29366f'], dark: 0.36, night: true, sun: false, h };
  }
  function season() {
    const m = RS.G.month(g);
    return m <= 2 || m === 12 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
  }
  function rainy() {
    const s = season();
    if (s === 'winter') return false;
    return hash(Math.floor(g.day / 3) + 77) % 6 === 0;
  }

  // ---------- 墙面 ----------
  function drawWall(th, L) {
    R(0, 0, W, WALL_B, th.wall);
    for (let x = 6; x < W; x += 12) R(x, 12, 1, WALL_B - 16, th.line);
    R(0, 0, W, 9, th.ceil);
    R(0, 9, W, 2, th.trim);
    R(0, WALL_B - 4, W, 4, th.base);
    R(0, WALL_B, W, 1, '#00000033');
    // 吊灯
    [120, 236, 352].forEach(x => {
      R(x, 11, 1, 3, P.dark);
      R(x - 4, 14, 9, 3, P.dark);
      R(x - 3, 17, 7, 1, L.night ? P.yellow : '#e8e0c0');
    });
    // 实验室门牌
    const name = ((g.labName || 'LAB').toUpperCase().replace(/[^A-Z0-9 &+\-!.#]/g, '').slice(0, 18) || 'LAB') + (twoFloors() ? ` ${floor + 1}F` : '');
    const tw = SP.textWidth(name);
    R(236 - tw / 2 - 4, 1, tw + 8, 8, P.dark);
    R(236 - tw / 2 - 3, 2, tw + 6, 6, P.navy);
    SP.text(ctx, name, Math.round(236 - tw / 2), 2, P.yellow);
  }

  function drawWindow(x, y, w, h, L) {
    R(x - 3, y - 3, w + 6, h + 6, '#e8e2d2');
    R(x - 2, y - 2, w + 4, h + 4, '#8a7d6b');
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    const s = season();
    const rain = rainy();
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      R(x, y + (i * h) / bands, w, h / bands + 1, mix(L.sky[0], L.sky[1], i / (bands - 1)));
    }
    if (rain && !L.night) R(x, y, w, h, 'rgba(86,108,134,0.45)');
    if (L.night) {
      for (let i = 0; i < 9; i++) {
        const sx = x + (hash(i * 31 + x) % w), sy = y + (hash(i * 17 + x) % (h - 16));
        if ((T * 2 + i) % 7 > 0.4) R(sx, sy, 1, 1, P.white);
      }
      R(x + w - 14, y + 6, 6, 6, '#f4eecf');
      R(x + w - 12, y + 6, 4, 4, L.sky[0]);
    } else if (L.sun && !rain) {
      R(x + 6, y + 6, 6, 6, '#fff1b0');
      R(x + 7, y + 5, 4, 8, '#fff1b0');
    }
    // 云
    if (!L.night) {
      const cx = x + ((T * 3 + x) % (w + 30)) - 20;
      R(cx, y + 12, 14, 3, rain ? '#94b0c2' : '#ffffff');
      R(cx + 3, y + 10, 8, 2, rain ? '#94b0c2' : '#ffffff');
    }
    // 远处的楼
    const bc = L.night ? '#20263a' : '#7d8fa8';
    R(x, y + h - 14, 12, 14, bc);
    R(x + 14, y + h - 20, 10, 20, bc);
    R(x + w - 16, y + h - 12, 16, 12, bc);
    if (L.night) [[3, -10], [5, -6], [17, -16], [19, -10], [x % 2 ? 36 : 38, -8]].forEach(([dx, dy]) => R(x + dx, y + h + dy, 1, 1, P.yellow));
    // 树
    const tx = x + w / 2 + 6;
    R(tx, y + h - 14, 3, 14, '#5d3b26');
    const leaf = { spring: ['#f2a7c3', '#ffd0e0'], summer: ['#38b764', '#a7f070'], autumn: ['#ef7d57', '#ffcd75'], winter: ['#c9d6e3', '#f4f4f4'] }[s];
    R(tx - 8, y + h - 26, 19, 10, leaf[0]);
    R(tx - 5, y + h - 30, 13, 5, leaf[0]);
    R(tx - 4, y + h - 27, 4, 3, leaf[1]);
    R(tx + 3, y + h - 24, 4, 2, leaf[1]);
    if (s === 'winter') R(x, y + h - 2, w, 2, P.white);
    // 天气粒子
    for (let i = 0; i < 10; i++) {
      const seed = hash(i * 97 + x);
      const px = x + ((seed % w) + T * (s === 'winter' ? 3 : 6) * ((seed % 3) - 1)) % w;
      const speed = rain ? 60 : s === 'winter' ? 8 : 10;
      const py = y + ((seed >>> 8) % h + T * speed) % h;
      if (rain) R(px, py, 1, 3, '#9fc6e8');
      else if (s === 'winter') R(px, py, 1, 1, P.white);
      else if (s === 'spring' && i < 4) R(px, py, 1, 1, '#ffd0e0');
      else if (s === 'autumn' && i < 4) R(px, py, 1, 1, i % 2 ? P.orange : P.yellow);
    }
    ctx.restore();
    R(x + w / 2 - 1, y, 2, h, '#e8e2d2');
    R(x, y + h / 2 - 1, w, 2, '#e8e2d2');
    R(x - 4, y + h + 2, w + 8, 3, '#d6cdb8');
  }

  function mix(a, b, t) {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
    const gg = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
    const bb = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
    return `rgb(${r},${gg},${bb})`;
  }

  function drawWhiteboard() {
    const big = !!g.facilities.whiteboard;
    const x = 130, y = 18, w = big ? 112 : 76, h = 46;
    R(x - 2, y - 2, w + 4, h + 4, P.gray);
    R(x, y, w, h, '#f4f4f4');
    R(x, y + h, w, 3, P.silver);
    R(x + 6, y + h + 1, 6, 1, P.red);
    R(x + 14, y + h + 1, 6, 1, P.blue);
    // 随课题变化的涂鸦
    const seed0 = Math.floor(g.day / 30) * 7 + g.projects.length + floor * 101;
    const cols = [P.blue, P.black, P.red, P.teal];
    for (let i = 0; i < (big ? 14 : 9); i++) {
      const s = hash(seed0 * 13 + i);
      const lx = x + 4 + (s % (w - 24)), ly = y + 4 + ((s >>> 8) % (h - 10));
      const c = cols[(s >>> 4) % cols.length];
      const kind = (s >>> 12) % 4;
      if (kind === 0) { for (let k = 0; k < 4; k++) R(lx + k * 4, ly, 3, 1, c); }
      else if (kind === 1) { R(lx, ly, 1, 6, c); R(lx, ly + 6, 10, 1, c); for (let k = 0; k < 4; k++) R(lx + 1 + k * 2, ly + 5 - k - ((s >>> k) & 1), 2, 1, c); }
      else if (kind === 2) { R(lx, ly, 6, 1, c); R(lx, ly + 3, 6, 1, c); R(lx + 7, ly, 1, 4, c); R(lx + 9, ly + 1, 3, 1, c); }
      else { R(lx, ly + 2, 7, 1, c); R(lx + 3, ly, 1, 5, c); R(lx + 9, ly + 2, 4, 1, c); }
    }
    return x + w;
  }

  function drawClock(x, y) {
    R(x, y, 11, 11, P.dark);
    R(x + 1, y + 1, 9, 9, P.white);
    const now = new Date();
    const mAng = (now.getMinutes() / 60) * Math.PI * 2;
    const hAng = (((now.getHours() % 12) + now.getMinutes() / 60) / 12) * Math.PI * 2;
    const cx = x + 5, cy = y + 5;
    for (let r = 1; r <= 3; r++) R(Math.round(cx + Math.sin(mAng) * r), Math.round(cy - Math.cos(mAng) * r), 1, 1, P.black);
    for (let r = 1; r <= 2; r++) R(Math.round(cx + Math.sin(hAng) * r), Math.round(cy - Math.cos(hAng) * r), 1, 1, P.red);
    R(cx, cy, 1, 1, P.black);
  }

  function drawCalendar(x, y) {
    R(x, y, 13, 15, P.white);
    R(x, y, 13, 4, P.red);
    R(x + 3, y - 1, 1, 2, P.dark);
    R(x + 9, y - 1, 1, 2, P.dark);
    const mo = String(RS.G.month(g));
    SP.text(ctx, mo, x + 7 - SP.textWidth(mo) / 2, y + 7, P.black);
    R(x, y + 15, 13, 1, '#00000040');
  }

  function drawHonorWall() {
    const x0 = 315, y0 = 15, cols = 8, cap = 40;
    // 软木板
    R(x0 - 5, y0 - 5, 94, 64, P.woodD);
    R(x0 - 4, y0 - 4, 92, 62, '#b98b57');
    for (let i = 0; i < 30; i++) { const s = hash(i * 13 + 5); R(x0 - 3 + (s % 90), y0 - 3 + ((s >>> 8) % 60), 1, 1, '#a57746'); }
    const label = 'HALL OF FAME', tw = SP.textWidth(label);
    R(x0 + 42 - tw / 2 - 3, y0 + 60, tw + 6, 8, P.dark);
    SP.text(ctx, label, Math.round(x0 + 42 - tw / 2), y0 + 61, P.yellow);
    const list = g.papers.filter(p => p.tier === 'A' && !p.retracted).slice().reverse();
    const n = Math.min(cap, list.length);
    for (let i = 0; i < cap; i++) {
      const cx = x0 + (i % cols) * 11, cy = y0 + Math.floor(i / cols) * 11;
      if (i >= n) {
        if (i === n) { R(cx + 3, cy + 2, 3, 3, P.red); R(cx + 4, cy + 5, 1, 2, P.dark); }
        continue;
      }
      const p = list[i];
      R(cx, cy, 9, 10, p.tot ? P.cyan : p.best ? P.yellow : P.woodD);
      R(cx + 1, cy + 1, 7, 8, p.tot ? '#d8fbff' : p.best ? '#fff1b0' : P.white);
      R(cx + 2, cy + 2, 5, 1, P.gray);
      R(cx + 2, cy + 4, 4, 1, P.silver);
      R(cx + 2, cy + 6, 5, 1, P.silver);
      if (p.best) R(cx + 6, cy + 7, 2, 2, P.red);
    }
    if (list.length > cap) SP.text(ctx, '+' + (list.length - cap), x0 + 62, y0 + 50, P.white, P.black);
    hits.push({ x: x0 - 5, y: y0 - 5, w: 94, h: 74, info: { kind: 'honor' } });
  }

  function drawDoor() {
    const x = 36, y = 38, w = 22, h = WALL_B - 38;
    R(x - 2, y - 2, w + 4, h + 2, P.woodD);
    if (doorOpen > 0) {
      R(x, y, w, h, '#2a2233');
      R(x, y, 3, h, P.wood);
    } else {
      R(x, y, w, h, P.wood);
      R(x + 3, y + 4, w - 6, 12, P.woodL);
      R(x + 3, y + 22, w - 6, 16, P.woodL);
      R(x + w - 5, y + 24, 2, 2, P.yellow);
    }
    hits.push({ x: x - 2, y, w: w + 4, h, info: { kind: 'door' } });
  }

  function drawCounter() {
    R(2, 76, 30, 20, P.woodD);
    R(2, 74, 30, 3, P.woodL);
    R(4, 79, 12, 1, '#00000040');
    R(4, 86, 12, 1, '#00000040');
    if (g.facilities.coffee) {
      R(9, 56, 15, 18, P.dark);
      R(10, 57, 13, 4, P.gray);
      R(13, 63, 7, 6, P.black);
      R(15, 69, 3, 3, P.white);
      R(20, 58, 2, 1, Math.floor(T * 2) % 2 ? P.red : '#6b1e2c');
      if (Math.floor(T * 1.5) % 3 === 0) { R(15, 52, 1, 2, '#ffffff80'); R(17, 50, 1, 2, '#ffffff60'); }
      hits.push({ x: 8, y: 54, w: 17, h: 22, info: { kind: 'fac', id: 'coffee' } });
    } else {
      R(12, 66, 8, 8, P.silver);
      R(19, 68, 3, 2, P.silver);
      R(13, 64, 6, 2, P.gray);
    }
  }

  // ---------- 显示器 ----------
  function drawScreen(x, y, w, h, mode, seed) {
    if (mode === 'off') { R(x, y, w, h, '#252b40'); return; }
    if (mode === 'idea') {
      R(x, y, w, h, P.navy);
      const pts = [[2, 2], [9, 1], [5, 4], [11, 5], [2, 6]];
      pts.forEach(([px, py], i) => {
        const on = (Math.floor(T * 2) + i + seed) % 5 !== 0;
        R(x + px, y + py, 2, 1, on ? P.yellow : P.orange);
      });
      R(x + 3, y + 3, 6, 1, '#73eff780');
      R(x + 6, y + 5, 5, 1, '#73eff780');
    } else if (mode === 'exp') {
      R(x, y, w, h, P.black);
      const off = Math.floor(T * 3) + seed;
      for (let i = 0; i < 4; i++) {
        const len = 2 + (hash(off + i) % (w - 4));
        R(x + 1, y + 1 + i * 2, len, 1, i === 3 ? P.lime : P.green);
      }
    } else if (mode === 'write') {
      R(x, y, w, h, P.white);
      R(x + 2, y + 1, w - 6, 1, P.dark);
      for (let i = 0; i < 3; i++) R(x + 1, y + 3 + i * 2, w - 3 - ((hash(seed + i) % 4)), 1, P.silver);
      if (Math.floor(T * 2) % 2) R(x + w - 3, y + 7, 1, 1, P.black);
    } else {
      R(x, y, w, h, P.dark);
      const px = Math.floor(T * 4 + seed) % (w - 2), py = Math.floor(T * 3 + seed) % (h - 1);
      R(x + 1 + px, y + py, 2, 1, P.cyan);
    }
    glows.push({ x, y, w, h, mode, seed });
  }

  function screenMode(a) {
    if (!a || a.state === 'hidden') return 'off';
    const m = a.m;
    const p = m && m.projectId ? RS.G.project(g, m.projectId) : null;
    if (a.state !== 'sit') return p ? p.phase : 'idle';
    return p && ['idea', 'exp', 'write'].includes(p.phase) ? p.phase : 'idle';
  }

  // ---------- 桌子 ----------
  function drawDesk(d, a) {
    const p = deskPos(d), x = p.x, y = p.y;
    const s = hash(d * 7 + 3);
    // 显示器
    R(x + 9, y, 16, 11, P.black);
    drawScreen(x + 10, y + 1, 14, 8, screenMode(a), d * 5);
    R(x + 16, y + 11, 3, 2, P.dark);
    if (g.facilities.monitors) {
      R(x + 25, y + 2, 9, 9, P.black);
      drawScreen(x + 26, y + 3, 7, 6, a && a.state !== 'hidden' ? 'write' : 'off', d * 11);
    }
    // 桌面
    R(x, y + 12, 34, 3, P.woodL);
    R(x, y + 15, 34, 6, P.wood);
    R(x, y + 20, 34, 1, P.woodD);
    R(x + 1, y + 21, 2, 6, P.woodD);
    R(x + 31, y + 21, 2, 6, P.woodD);
    R(x + 11, y + 13, 12, 1, P.dark);
    // 小物件
    if (s % 3 === 0) { R(x + 2, y + 9, 3, 4, P.white); R(x + 5, y + 10, 1, 2, P.white); }
    else if (s % 3 === 1) { R(x + 2, y + 8, 2, 5, P.red); R(x + 4, y + 9, 2, 4, P.blue); R(x + 6, y + 10, 2, 3, P.yellow); }
    else { R(x + 2, y + 10, 4, 3, P.woodD); R(x + 1, y + 6, 6, 4, P.green); }
    // 人（背影）
    if (a && a.state === 'sit') {
      const sp = SP.character(a.av, 'back');
      const typing = screenMode(a) !== 'idle';
      const bob = typing && Math.floor(T * 5 + d) % 2 ? 1 : 0;
      ctx.drawImage(sp, x + 11, y + 6 + bob);
      if (isMe(a)) youMark(x + 17, y + 5);
      hits.push({ x: x + 9, y: y + 4, w: 16, h: 24, info: { kind: 'member', id: a.id } });
      if (a.emoteT > 0) emotes.push({ x: x + 17, y: y + 4, icon: a.emote });
    } else if (a && a.state === 'hidden') {
      R(x + 22, y + 10, 6, 5, P.yellow);
      R(x + 23, y + 11, 4, 1, P.gold);
      hits.push({ x: x + 9, y: y, w: 20, h: 26, info: { kind: 'member', id: a.id } });
    }
    // 椅子靠背
    const cc = g.facilities.chairs ? '#2b2f45' : P.gray;
    R(x + 11, y + 20, 12, 8, cc);
    R(x + 12, y + 21, 10, 1, g.facilities.chairs ? P.dark : P.silver);
    R(x + 16, y + 28, 2, 3, P.black);
    R(x + 12, y + 31, 10, 1, P.black);
  }

  function drawBoxes(d) {
    const p = deskPos(d), x = p.x, y = p.y;
    R(x + 3, y + 14, 14, 12, '#c8a165');
    R(x + 3, y + 19, 14, 1, '#a07c45');
    R(x + 15, y + 8, 14, 18, '#b88f55');
    R(x + 15, y + 15, 14, 1, '#93703f');
    R(x + 8, y + 6, 10, 8, '#d1ad72');
    R(x + 12, y + 6, 2, 8, '#a07c45');
  }

  function drawRacks() {
    const units = RS.G.computeUnits(g);
    const n = units <= 0 ? 0 : Math.min(4, Math.ceil(units / 40));
    const busy = g.projects.some(p => p.phase === 'exp');
    for (let i = 0; i < 4; i++) {
      const x = 406 + i * 18, y = 30;
      if (i >= n) {
        if (i === n) { R(x, y + 46, 16, 20, '#00000014'); }
        continue;
      }
      R(x, y, 16, 66, P.black);
      R(x + 1, y + 1, 14, 64, '#262b44');
      for (let k = 0; k < 9; k++) {
        R(x + 2, y + 3 + k * 7, 12, 5, P.dark);
        const on = busy ? (hash(Math.floor(T * 6) + i * 9 + k) % 3) : Math.floor(T + k + i) % 4 === 0 ? 1 : 0;
        R(x + 3, y + 5 + k * 7, 1, 1, on ? P.lime : '#1f5a35');
        R(x + 5, y + 5 + k * 7, 1, 1, on === 2 ? P.sky : '#20406b');
        R(x + 9, y + 4 + k * 7, 4, 3, '#1d2133');
      }
    }
    if (n) hits.push({ x: 406, y: 30, w: n * 18, h: 66, info: { kind: 'gpu' } });
    if (g.facilities.nas) {
      R(406 + n * 18, 84, 10, 12, P.dark);
      R(408 + n * 18, 86, 6, 1, Math.floor(T * 3) % 2 ? P.sky : P.navy);
    }
  }

  function drawPIDesk(drawList) {
    const x = PI_DESK.x, y = PI_DESK.y;
    drawList.push({
      z: y + 26, fn: () => {
        // 高背椅
        R(x + 21, y - 24, 17, 22, '#4a2f2f');
        R(x + 22, y - 23, 15, 2, '#6b4444');
        if (pi && pi.state === 'sit') {
          const sp = SP.character(pi.av, pi.cheerT > 0 ? 'cheer' : 'front');
          const jump = pi.jumpT > 0 ? -Math.round(Math.abs(Math.sin(pi.jumpT * 8)) * 3) : 0;
          ctx.drawImage(sp, x + 23, y - 15 + jump);
          hits.push({ x: x + 22, y: y - 16, w: 14, h: 18, info: { kind: 'pi' } });
          if (pi.emoteT > 0) emotes.push({ x: x + 29, y: y - 17, icon: pi.emote });
        }
        R(x, y, 62, 4, P.woodL);
        R(x, y + 4, 62, 20, P.wood);
        R(x + 2, y + 7, 58, 1, P.woodD);
        R(x + 2, y + 15, 58, 1, P.woodD);
        R(x + 28, y + 10, 6, 2, P.yellow);
        R(x + 1, y + 24, 3, 2, P.woodD);
        R(x + 58, y + 24, 3, 2, P.woodD);
        // 桌上：显示器背面、台灯、文件
        R(x + 44, y - 12, 14, 11, P.dark);
        R(x + 50, y - 1, 3, 1, P.black);
        R(x + 4, y - 6, 9, 6, P.white);
        R(x + 5, y - 7, 9, 1, P.silver);
        R(x + 16, y - 9, 1, 9, P.dark);
        R(x + 14, y - 11, 5, 3, P.yellow);
        R(x + 26, y + 1, 10, 2, P.dark);
        SP.text(ctx, 'PI', x + 27, y + 17, P.yellow);
      },
    });
  }

  function drawSofaArea(list) {
    const f = g.facilities;
    if (f.console) {
      list.push({
        z: 186, fn: () => {
          R(6, 178, 34, 8, P.woodD);
          R(8, 160, 30, 18, P.black);
          const playing = sofaUsed.some(a => a && !a.isPI);
          if (playing) {
            R(9, 161, 28, 16, P.navy);
            R(9 + (Math.floor(T * 8) % 24), 170, 4, 4, P.lime);
            R(30 - (Math.floor(T * 6) % 20), 164, 3, 3, P.red);
          } else R(9, 161, 28, 16, '#20263a');
          R(14, 180, 8, 3, P.white);
        },
      });
    }
    if (f.sofa) {
      sofaUsed.forEach((a, i) => {
        if (!a || a.state !== 'sofa') return;
        list.push({
          z: 219, fn: () => {
            const sp = SP.character(a.av, 'back');
            ctx.drawImage(sp, SOFA_SEATS[i].x - 6, 196);
            if (a.emoteT > 0) emotes.push({ x: SOFA_SEATS[i].x, y: 194, icon: a.emote });
          },
        });
      });
      list.push({
        z: 224, fn: () => {
          R(2, 206, 56, 16, '#b13e53');
          R(2, 204, 56, 3, '#d65a6e');
          R(0, 202, 5, 20, '#8e2f42');
          R(55, 202, 5, 20, '#8e2f42');
          R(4, 222, 3, 3, P.woodD);
          R(51, 222, 3, 3, P.woodD);
          R(20, 210, 1, 10, '#8e2f42');
          R(38, 210, 1, 10, '#8e2f42');
        },
      });
    }
  }

  function drawGadgets(list) {
    const f = g.facilities;
    if (f.snack) list.push({ z: 146, fn: () => {
      R(2, 116, 22, 30, '#5d6b8a');
      R(4, 118, 18, 26, '#b9d3e6');
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) R(5 + c * 6, 120 + r * 6, 4, 4, [P.red, P.yellow, P.orange, P.lime, P.sky][(r * 3 + c) % 5]);
    } });
    if (f.booth) list.push({ z: 148, fn: () => {
      R(30, 100, 26, 48, P.dark);
      R(32, 102, 22, 40, '#73eff755');
      R(32, 102, 22, 2, P.white);
      R(52, 120, 1, 6, P.yellow);
    } });
    if (f.plants) {
      list.push({ z: 100, fn: () => plant(61, 92) });
      list.push({ z: 236, fn: () => plant(462, 230) });
    }
    if (f.bookshelf) list.push({ z: 146, fn: () => {
      R(448, 100, 30, 46, P.woodD);
      for (let r = 0; r < 4; r++) {
        R(450, 103 + r * 11, 26, 9, '#3b2a1f');
        for (let k = 0; k < 6; k++) R(451 + k * 4, 104 + r * 11 + ((k + r) % 3), 3, 8 - ((k + r) % 3), [P.red, P.blue, P.green, P.yellow, P.purple, P.orange][(k + r * 2) % 6]);
      }
    } });
    if (f.printer3d) list.push({ z: 214, fn: () => {
      R(406, 196, 20, 18, P.dark);
      R(408, 198, 16, 12, '#ffcd7533');
      const nx = 409 + Math.round((Math.sin(T * 3) + 1) * 6);
      R(nx, 199, 2, 3, P.silver);
      R(412, 206, 8, 3, P.orange);
    } });
    if (f.robotarm) list.push({ z: 226, fn: () => {
      const bx = 446, by = 222;
      R(bx - 8, by, 16, 4, P.dark);
      R(bx - 2, by - 6, 4, 6, P.gray);
      const a1 = -1.2 + Math.sin(T * 0.8) * 0.6, a2 = a1 + 0.9 + Math.sin(T * 1.3) * 0.5;
      const jx = bx + Math.cos(a1) * 12, jy = by - 6 + Math.sin(a1) * 12;
      line(bx, by - 6, jx, jy, P.orange);
      line(jx, jy, jx + Math.cos(a2) * 9, jy + Math.sin(a2) * 9, P.yellow);
      R(Math.round(jx) - 1, Math.round(jy) - 1, 3, 3, P.dark);
    } });
    if (f.vr) list.push({ z: 222, fn: () => {
      R(470, 200, 2, 22, P.gray);
      R(466, 220, 10, 2, P.dark);
      R(465, 196, 12, 5, P.black);
      R(466, 197, 4, 3, '#5d275d');
      R(472, 197, 4, 3, '#5d275d');
    } });
  }
  function plant(x, y) {
    R(x - 3, y - 6, 7, 6, '#b06a3b');
    R(x - 4, y - 7, 9, 2, '#c47c48');
    R(x - 5, y - 14, 4, 7, P.green);
    R(x + 1, y - 16, 4, 9, P.green);
    R(x - 2, y - 18, 4, 6, P.lime);
  }
  function line(x0, y0, x1, y1, c) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0;
    for (let i = 0; i <= n; i++) R(Math.round(x0 + ((x1 - x0) * i) / (n || 1)), Math.round(y0 + ((y1 - y0) * i) / (n || 1)), 2, 2, c);
  }

  const CAT = {
    a: ['......o.o', 'o.....ooo', '.o....oko', '.ooooooo.', '.ooooooo.', '.o.o.o.o.'],
    b: ['......o.o', 'o.....ooo', '.o....oko', '.ooooooo.', '.ooooooo.', '..o.o.o.o'],
    sleep: ['.........', '.........', '...ooo...', '.ooooooo.', 'oooooooko', '.ooooooo.'],
  };
  let catCanvas = null;
  function catSprite(kind) {
    if (!catCanvas) catCanvas = {};
    if (!catCanvas[kind]) {
      const c = SP.makeCanvas(9, 6);
      SP.paint(c.getContext('2d'), CAT[kind], { o: P.orange, k: P.black }, 0, 0);
      catCanvas[kind] = c;
    }
    return catCanvas[kind];
  }
  function drawCat(list) {
    if (!cat) return;
    list.push({
      z: cat.y + 1, fn: () => {
        const kind = cat.state === 'sleep' ? 'sleep' : cat.state === 'walk' && Math.floor(cat.t * 6) % 2 ? 'b' : 'a';
        const sp = catSprite(kind);
        ctx.save();
        if (cat.face < 0) { ctx.translate(Math.round(cat.x) + 5, 0); ctx.scale(-1, 1); ctx.drawImage(sp, 0, Math.round(cat.y) - 6); }
        else ctx.drawImage(sp, Math.round(cat.x) - 4, Math.round(cat.y) - 6);
        ctx.restore();
        if (cat.state === 'sleep' && Math.floor(cat.t) % 3 === 0) SP.text(ctx, 'Z', Math.round(cat.x) + 4, Math.round(cat.y) - 12, P.white);
        hits.push({ x: cat.x - 5, y: cat.y - 7, w: 11, h: 8, info: { kind: 'cat' } });
      },
    });
  }

  function drawWalker(a, list) {
    list.push({
      z: a.y, fn: () => {
        let pose = 'front';
        if (a.cheerT > 0) pose = 'cheer';
        else if (a.state === 'walk') pose = Math.floor(a.walkT * 6) % 2 ? 'walk1' : 'walk2';
        const sp = SP.character(a.av, pose);
        const bob = a.state === 'walk' && Math.floor(a.walkT * 6) % 2 ? -1 : 0;
        const jump = a.jumpT > 0 ? -Math.round(Math.abs(Math.sin(a.jumpT * 8)) * 4) : 0;
        const x = Math.round(a.x) - 6, y = Math.round(a.y) - 18 + bob + jump;
        ctx.fillStyle = '#00000030';
        ctx.fillRect(x + 2, Math.round(a.y) - 1, 8, 2);
        ctx.drawImage(sp, x, y);
        if (isMe(a)) youMark(x + 6, y);
        if (a.grad) { R(x + 2, y - 1, 8, 2, P.black); R(x + 4, y - 2, 4, 1, P.black); R(x + 9, y, 1, 3, P.yellow); }
        if (!a.isPI || true) hits.push({ x, y, w: 12, h: 18, info: a.isPI ? { kind: 'pi' } : { kind: 'member', id: a.id } });
        if (a.emoteT > 0) emotes.push({ x: Math.round(a.x), y: y - 1, icon: a.emote });
      },
    });
  }

  function drawFloorSeat(a, list) {
    list.push({
      z: a.seat.y, fn: () => {
        const x = a.seat.x;
        R(x - 8, 228, 16, 8, P.purple);
        R(x - 7, 227, 14, 2, '#7a3a7a');
        if (a.state === 'sit') {
          ctx.drawImage(SP.character(a.av, 'back'), x - 6, 212);
          if (isMe(a)) youMark(x, 211);
          R(x - 4, 224, 8, 1, '#73eff7');
          hits.push({ x: x - 6, y: 212, w: 12, h: 18, info: { kind: 'member', id: a.id } });
          if (a.emoteT > 0) emotes.push({ x, y: 210, icon: a.emote });
        }
      },
    });
  }

  // 博士阶段：在“你”头顶画一个上下跳动的小箭头
  const isMe = a => !!(g && g.phd && a && a.id === g.player);
  function youMark(x, y) {
    const b = Math.floor(T * 2.5) % 2;
    R(x - 3, y - 7 + b, 7, 1, P.black);
    R(x - 2, y - 6 + b, 5, 1, P.yellow);
    R(x - 1, y - 5 + b, 3, 1, P.yellow);
    R(x, y - 4 + b, 1, 1, P.yellow);
  }

  function drawEmote(e) {
    const x = Math.round(e.x) - 6, y = Math.round(e.y) - 13;
    R(x, y + 1, 12, 9, P.black);
    R(x + 1, y, 10, 11, P.black);
    R(x + 1, y + 1, 10, 9, P.white);
    R(x + 5, y + 11, 2, 1, P.black);
    R(x + 5, y + 10, 2, 1, P.white);
    ctx.drawImage(SP.icon(e.icon), x + 2, y + 2, 8, 8);
  }

  // 地板花纹画一次存起来，换房间时再重画
  let floorCv = null, floorKey = '';
  function drawFloor(th) {
    const key = g.room + '|' + th.floor;
    if (!floorCv || floorKey !== key) {
      floorKey = key;
      floorCv = SP.makeCanvas(W, H);
      const main = ctx;
      ctx = floorCv.getContext('2d');
      floorPattern(th);
      ctx = main;
    }
    ctx.drawImage(floorCv, 0, WALL_B, W, H - WALL_B, 0, WALL_B, W, H - WALL_B);
    // 地毯（休息区）
    if (floor === 0 && g.facilities.sofa) {
      R(0, 188, 62, 44, '#00000018');
    }
  }
  function floorPattern(th) {
    R(0, WALL_B, W, H - WALL_B, th.floor);
    if (g.room === 5) {
      // 研究中心：大块石材地砖
      for (let r = 0, y = WALL_B; y < H; r++, y += 24) {
        R(0, y, W, 1, th.floorD);
        for (let x = r % 2 ? 0 : 24; x < W; x += 48) R(x, y, 1, 24, th.floorD);
        for (let x = r % 2 ? 6 : 30; x < W; x += 48) R(x, y + 3, 10, 1, th.floorL);
      }
    } else if (g.room === 4) {
      // 两层楼：地毯
      for (let r = 0, y = WALL_B + 2; y < H; r++, y += 4) for (let x = r % 2 ? 0 : 3; x < W; x += 6) R(x, y, 1, 1, th.floorL);
    } else if (g.room === 3) {
      for (let y = WALL_B + 4; y < H; y += 8) for (let x = (y / 8) % 2 ? 0 : 8; x < W; x += 16) R(x, y, 2, 2, th.floorL);
    } else if (g.room === 2) {
      for (let y = WALL_B; y < H; y += 16) R(0, y, W, 1, th.floorD);
      for (let x = 0; x < W; x += 16) R(x, WALL_B, 1, H - WALL_B, th.floorD);
    } else {
      for (let y = WALL_B + 7; y < H; y += 8) {
        R(0, y, W, 1, th.floorD);
        const off = (y / 8) % 2 ? 0 : 24;
        for (let x = off; x < W; x += 48) R(x, y - 7, 1, 7, th.floorD);
      }
      for (let y = WALL_B + 2; y < H; y += 16) R(0, y, W, 1, th.floorL);
    }
  }

  function drawGlows(L) {
    // 夜晚：显示器和吊灯发光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [120, 236, 352].forEach(x => {
      ctx.fillStyle = 'rgba(255,205,117,0.05)';
      ctx.beginPath();
      ctx.moveTo(x - 4, 18);
      ctx.lineTo(x + 5, 18);
      ctx.lineTo(x + 60, 236);
      ctx.lineTo(x - 60, 236);
      ctx.closePath();
      ctx.fill();
    });
    glows.forEach(s => {
      ctx.fillStyle = s.mode === 'write' ? 'rgba(244,244,244,0.10)' : 'rgba(115,239,247,0.08)';
      ctx.fillRect(s.x - 4, s.y - 3, s.w + 8, s.h + 10);
    });
    ctx.restore();
    glows.forEach(s => drawScreen(s.x, s.y, s.w, s.h, s.mode, s.seed));
    glows = [];
  }

  Scene.draw = function () {
    if (!ctx) return;
    hits = [];
    emotes = [];
    glows = [];
    if (!g) {
      R(0, 0, W, H, P.black);
      return;
    }
    if (floor && !twoFloors()) floor = 0;
    const up = floor === 1;
    const th = THEMES[g.room] || THEMES[0];
    const L = lighting();
    drawWall(th, L);
    drawWindow(76, 18, 44, 44, L);
    const wbEnd = drawWhiteboard();
    drawClock(wbEnd + 6, 16);
    drawCalendar(wbEnd + 5, 34);
    drawWindow(266, 18, 40, 44, L);
    if (up) drawNoticeBoard(); else drawHonorWall();
    drawDoor();
    drawCounter();
    if (up) drawShelves(); else drawRacks();
    if (!up && g.facilities.projector) { R(200, 11, 12, 5, P.silver); R(202, 16, 3, 2, P.dark); R(206, 13, 2, 2, P.sky); }
    drawFloor(th);
    const list = [];
    const desks = RS.G.desks(g);
    const bySeat = new Map();
    actors.forEach(a => bySeat.set(a.seat.d, a));
    for (let d = floor * FLOOR_N; d < (floor + 1) * FLOOR_N; d++) {
      const p = deskPos(d);
      if (d >= desks) { list.push({ z: p.y + 26, fn: () => drawBoxes(d) }); continue; }
      const a = bySeat.get(d);
      list.push({ z: p.y + 32, fn: () => drawDesk(d, a) });
    }
    actors.forEach(a => {
      if (!here(a)) return;
      if (a.seat.kind === 'floor' && (a.state === 'sit' || a.state === 'hidden')) drawFloorSeat(a, list);
      if (a.state === 'walk' || a.state === 'stand') drawWalker(a, list);
    });
    ghosts.forEach(a => { if (here(a)) drawWalker(a, list); });
    if (up) {
      drawMeetingCorner(list);
    } else {
      if (pi && (pi.state === 'walk' || pi.state === 'stand')) drawWalker(pi, list);
      drawPIDesk(list);
      drawSofaArea(list);
      drawGadgets(list);
      drawCat(list);
    }
    list.sort((a, b) => a.z - b.z);
    for (const it of list) it.fn();
    parts.forEach(p => R(p.x, p.y, p.s, p.s, p.c));
    if (L.dark > 0) {
      R(0, 0, W, H, `rgba(14,16,40,${L.dark})`);
      drawGlows(L);
    }
    emotes.forEach(drawEmote);
    floats.forEach(f => {
      const a = Math.min(1, f.life);
      ctx.globalAlpha = a;
      if (f.icon) ctx.drawImage(SP.icon(f.icon), Math.round(f.x), Math.round(f.y));
      else SP.text(ctx, f.text, Math.round(f.x), Math.round(f.y), f.color, P.black);
      ctx.globalAlpha = 1;
    });
    drawFloorTabs();
  };

  // ---------- 两层楼 ----------
  // 左上角的楼层按钮：另一层有人中稿、毕业时按钮会闪
  function drawFloorTabs() {
    if (!twoFloors()) return;
    for (let f = 0; f < 2; f++) {
      const p = TAB_POS(f), on = f === floor;
      const ping = !on && floorPing[f] > T;
      R(p.x, p.y, 15, 9, P.black);
      R(p.x + 1, p.y + 1, 13, 7, on ? P.navy : P.dark);
      SP.text(ctx, (f + 1) + 'F', p.x + 4, p.y + 2, on || (ping && Math.floor(T * 4) % 2) ? P.yellow : P.silver);
      if (ping) R(p.x + 12, p.y + 1, 2, 2, P.red);
      hits.push({ x: p.x - 1, y: 0, w: 17, h: 12, info: { kind: 'floor', f } });
    }
  }
  // 二楼：荣誉墙换成公告板，机柜换成书架，PI 办公桌的位置是讨论区
  function drawNoticeBoard() {
    const x0 = 310, y0 = 10;
    R(x0, y0, 94, 64, P.woodD);
    R(x0 + 1, y0 + 1, 92, 62, '#b98b57');
    for (let i = 0; i < 30; i++) { const s = hash(i * 13 + 9); R(x0 + 2 + (s % 90), y0 + 2 + ((s >>> 8) % 60), 1, 1, '#a57746'); }
    [[x0 + 6, y0 + 5, 22, 30, P.sky], [x0 + 35, y0 + 7, 20, 26, P.orange], [x0 + 63, y0 + 5, 24, 31, P.green]].forEach(([x, y, w, h, c], i) => {
      R(x, y, w, h, P.white);
      R(x + 2, y + 2, w - 4, 8, c);
      for (let k = 0; k < 4; k++) R(x + 2, y + 13 + k * 4, w - 4 - (hash(i * 7 + k) % 6), 1, P.silver);
      R(x + Math.floor(w / 2) - 1, y - 1, 2, 2, P.red);
    });
    for (let i = 0; i < 6; i++) {
      const s = hash(i * 31 + Math.floor(g.day / 60));
      const x = x0 + 6 + (i % 3) * 29 + (s % 6), y = y0 + 41 + Math.floor(i / 3) * 10;
      R(x, y, 9, 8, [P.yellow, '#ffd0e0', P.lime, P.cyan][s % 4]);
      R(x + 1, y + 2, 6, 1, '#00000040');
      R(x + 1, y + 4, 5, 1, '#00000040');
    }
    const label = 'NOTICE', tw = SP.textWidth(label);
    R(x0 + 47 - tw / 2 - 3, y0 + 65, tw + 6, 8, P.dark);
    SP.text(ctx, label, Math.round(x0 + 47 - tw / 2), y0 + 66, P.yellow);
  }
  function drawShelves() {
    for (let i = 0; i < 2; i++) {
      const x = 408 + i * 35, y = 28;
      R(x, y, 32, 68, P.woodD);
      for (let r = 0; r < 5; r++) {
        R(x + 2, y + 3 + r * 13, 28, 11, '#3b2a1f');
        for (let k = 0; k < 7; k++) {
          const s = hash(i * 50 + r * 7 + k);
          if (s % 9 === 0) continue;
          const h = 7 + (s % 4);
          R(x + 3 + k * 4, y + 14 + r * 13 - h, 3, h, [P.red, P.blue, P.green, P.yellow, P.purple, P.orange, P.teal][s % 7]);
        }
      }
    }
  }
  function drawMeetingCorner(list) {
    list.push({ z: 176, fn: () => {
      const x = 404, y = 150;
      [[x + 8, y - 8], [x + 30, y - 8], [x + 52, y - 8]].forEach(([cx, cy]) => { R(cx, cy, 10, 8, P.gray); R(cx + 1, cy + 1, 8, 1, P.silver); });
      R(x, y, 70, 4, P.woodL);
      R(x, y + 4, 70, 18, P.wood);
      R(x + 2, y + 21, 3, 5, P.woodD);
      R(x + 65, y + 21, 3, 5, P.woodD);
      R(x + 10, y - 3, 12, 3, P.silver);
      R(x + 11, y - 6, 10, 3, P.dark);
      R(x + 40, y - 2, 4, 3, P.white);
      R(x + 52, y - 2, 4, 3, P.white);
      R(x + 53, y - 1, 2, 1, '#6b4423');
    } });
    list.push({ z: 236, fn: () => plant(462, 230) });
    list.push({ z: 100, fn: () => plant(61, 92) });
  }

  Scene.hitTest = function (x, y) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return h.info;
    }
    return null;
  };

  // 外部触发：比如点击成员时让他冒个气泡
  Scene.ping = function (id) {
    const a = actorOf(id);
    if (!a) return;
    if (!here(a)) Scene.setFloor(flOf(a));
    emote(a, 'exclam', 1.5);
  };
})();
