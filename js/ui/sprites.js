/* 像素美术：调色板、角色拼装（自动描边）、8x8 图标、3x5 像素字体 */
(function () {
  'use strict';
  const RS = window.RS;
  const SP = (RS.Sprites = {});

  // Sweetie 16 调色板 + 一些木头/皮肤色
  SP.PAL = {
    black: '#1a1c2c', purple: '#5d275d', red: '#b13e53', orange: '#ef7d57', yellow: '#ffcd75', lime: '#a7f070', green: '#38b764', teal: '#257179',
    navy: '#29366f', blue: '#3b5dc9', sky: '#41a6f6', cyan: '#73eff7', white: '#f4f4f4', silver: '#94b0c2', gray: '#566c86', dark: '#333c57',
    wood: '#8a5a3b', woodL: '#b07a4a', woodD: '#5d3b26', gold: '#c48a2c',
  };
  const P = SP.PAL;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  SP.makeCanvas = makeCanvas;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
    const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
    const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  SP.shade = shade;

  // 把字符矩阵画到画布上
  function paint(ctx, rows, map, ox, oy) {
    for (let y = 0; y < rows.length; y++) {
      const row = rows[y];
      for (let x = 0; x < row.length; x++) {
        const col = map[row[x]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + x, oy + y, 1, 1);
      }
    }
  }
  SP.paint = paint;

  // 自动描边：对透明像素，若上下左右有不透明像素则涂成描边色
  function outline(src, color) {
    const w = src.width + 2, h = src.height + 2;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 1, 1);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    const a = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[(y * w + x) * 4 + 3]);
    const n = parseInt(color.slice(1), 16);
    const mark = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (a(x, y)) continue;
        if (a(x - 1, y) || a(x + 1, y) || a(x, y - 1) || a(x, y + 1)) mark.push((y * w + x) * 4);
      }
    }
    for (const i of mark) {
      d[i] = (n >> 16) & 255; d[i + 1] = (n >> 8) & 255; d[i + 2] = n & 255; d[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  // ---------- 角色 ----------
  const FACE = [
    '..........',
    '...ssss...',
    '..ssssss..',
    '.ssssssss.',
    '.ssessess.',
    '.ssssssss.',
    '..ssssss..',
    '...ssss...',
  ];
  // 发型：只写需要覆盖的行（h=头发）
  const HAIR = [
    ['..hhhhhh..', '.hhhhhhhh.', '.hhhhhhhh.', '.hhh..hhh.', '.h......h.'],
    ['..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hhhhhhhhhh', 'hh......hh', 'hh......hh', 'hh......hh', 'hh......hh', 'h........h', 'h........h'],
    ['.h.h.hh.h.', '.hhhhhhhh.', 'hhhhhhhhhh', '.hhhhhhhh.', '.h......h.'],
    ['....hh....', '..hhhhhh..', '.hhhhhhhh.', '.hhhhhhhh.', '.h......h.'],
    ['..........', '..hhhhhh..', '.hhhhhhhh.', 'hhhhhhhhhh', 'hh......hh', 'hh......hh', '.h......h.'],
    ['...hhhhh..', '.hhhhhhhhh', 'hhhhhhhhh.', '.hhhhh.hh.', '.h......h.'],
  ];
  const BODY = {
    front: ['..tttttt..', '.tttttttt.', 'stttttttts', 'stttttttts', '.tttttttt.', '.pppppppp.', '.ppp..ppp.', '.bbb..bbb.'],
    walk1: ['..tttttt..', '.tttttttt.', 'stttttttt.', '.tttttttts', '.tttttttt.', '.pppppppp.', '.ppp...pp.', '.bbb...bb.'],
    walk2: ['..tttttt..', '.tttttttt.', '.tttttttts', 'stttttttt.', '.tttttttt.', '.pppppppp.', '.pp...ppp.', '.bb...bbb.'],
    cheer: ['t.tttttt.t', '.tttttttt.', '.tttttttt.', '.tttttttt.', '.tttttttt.', '.pppppppp.', '.ppp..ppp.', '.bbb..bbb.'],
    back: ['..tttttt..', '.tttttttt.', 'tttttttttt', 'tttttttttt', '.tttttttt.', '.tttttttt.', '..........', '..........'],
  };
  const SUIT = { 0: '..ttwwtt..', 1: '.tttaattt.', 2: 'stttaattts' };

  const cache = new Map();
  SP.avatarKey = av => `${av.skin}|${av.hair}|${av.style}|${av.shirt}|${av.pants}|${av.glasses ? 1 : 0}|${av.suit ? 1 : 0}`;

  // pose: front | walk1 | walk2 | cheer | back
  SP.character = function (av, pose) {
    const key = SP.avatarKey(av) + '|' + pose;
    let c = cache.get(key);
    if (c) return c;
    const A = RS.AVATAR;
    const shirt = av.suit ? '#333c57' : A.shirt[av.shirt % A.shirt.length];
    const map = {
      s: A.skin[av.skin % A.skin.length], h: A.hair[av.hair % A.hair.length], e: P.black,
      t: shirt, p: A.pants[av.pants % A.pants.length], b: '#29243a', g: P.gray, w: P.white,
      a: av.suit ? A.shirt[av.shirt % A.shirt.length] : shirt,
    };
    const grid = [];
    const isBack = pose === 'back';
    for (let y = 0; y < 8; y++) {
      let row = FACE[y];
      if (isBack) row = y === 7 ? row : row.replace(/[se]/g, 'h');
      grid.push(row.split(''));
    }
    const body = BODY[pose] || BODY.front;
    for (let y = 0; y < 8; y++) {
      let row = body[y];
      if (av.suit && !isBack && SUIT[y] && pose !== 'cheer') row = SUIT[y];
      grid.push(row.split(''));
    }
    const hair = HAIR[av.style % HAIR.length];
    for (let y = 0; y < hair.length; y++) {
      for (let x = 0; x < 10; x++) if (hair[y][x] === 'h') grid[y][x] = 'h';
    }
    if (!isBack && av.glasses) {
      [2, 4, 5, 7].forEach(x => { if (grid[4][x] === 's') grid[4][x] = 'g'; });
    }
    if (pose === 'cheer') {
      [5, 6, 7].forEach(y => { grid[y][0] = 's'; grid[y][9] = 's'; });
    }
    const raw = makeCanvas(10, 16);
    const ctx = raw.getContext('2d');
    paint(ctx, grid.map(r => r.join('')), map, 0, 0);
    // 衣服暗部
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(1, 12, 8, 1);
    c = outline(raw, P.black);
    cache.set(key, c);
    return c;
  };

  SP.ROLE_BG = { phd: '#3b5dc9', ms: '#38b764', ug: '#ef7d57', postdoc: '#5d275d', visit: '#257179', pi: '#c48a2c' };
  const urlCache = new Map();
  SP.portraitURL = function (av, role, scale) {
    scale = scale || 3;
    const key = SP.avatarKey(av) + '|' + role + '|' + scale;
    if (urlCache.has(key)) return urlCache.get(key);
    const sp = SP.character(av, 'front');
    const c = makeCanvas(16, 16);
    const ctx = c.getContext('2d');
    ctx.fillStyle = SP.ROLE_BG[role] || P.dark;
    ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 16; i += 2) ctx.fillRect(i, 0, 1, 16);
    ctx.drawImage(sp, 2, 2);
    const out = makeCanvas(16 * scale, 16 * scale);
    const o = out.getContext('2d');
    o.imageSmoothingEnabled = false;
    o.drawImage(c, 0, 0, 16 * scale, 16 * scale);
    const url = out.toDataURL();
    urlCache.set(key, url);
    return url;
  };

  // ---------- 8x8 图标 ----------
  const IC = {
    k: P.black, w: P.white, l: P.silver, g: P.gray, d: P.dark, r: P.red, o: P.orange, y: P.yellow, Y: P.gold,
    e: P.green, G: P.lime, t: P.teal, b: P.blue, B: P.sky, c: P.cyan, p: P.purple, n: P.navy, m: P.wood, s: '#f6d5b8',
  };
  const ICONS = {
    money: ['..kkkk..', '.kyyyyk.', 'kyyYYyyk', 'kyYyyyyk', 'kyyYYyyk', 'kyyyyYyk', '.kyYYyk.', '..kkkk..'],
    energy: ['....kkk.', '...kyyk.', '..kyyk..', '.kyyyykk', 'kkyyyyk.', '..kyyk..', '.kyyk...', '.kkk....'],
    star: ['...kk...', '..kyyk..', 'kkkyykkk', 'kyyyyyyk', '.kyyyyk.', '.kyyyyk.', 'kyykkyyk', 'kkk..kkk'],
    paper: ['.kkkkk..', '.kwwwkk.', '.kwggwkk', '.kwwwwwk', '.kwggggk', '.kwwwwwk', '.kwggggk', '.kkkkkkk'],
    quote: ['........', '.kkk.kkk', '.kbk.kbk', '.kbk.kbk', '.kkk.kkk', '..kk..kk', '.kk..kk.', '........'],
    people: ['..kkkk..', '.kssssk.', '.kssssk.', '..kkkk..', '.kbbbbk.', 'kbbbbbbk', 'kbbbbbbk', 'kkkkkkkk'],
    gpu: ['.k.kk.k.', 'kkkkkkkk', '.kggggk.', 'kkgeegkk', 'kkgeegkk', '.kggggk.', 'kkkkkkkk', '.k.kk.k.'],
    bulb: ['..kkkk..', '.kyyyyk.', 'kyywyyyk', 'kyyyyyyk', '.kyyyyk.', '..kddk..', '..kddk..', '...kk...'],
    gear: ['..k..k..', '.kkkkkk.', 'kkllllkk', '.kl..lk.', '.kl..lk.', 'kkllllkk', '.kkkkkk.', '..k..k..'],
    code: ['kkkkkkkk', 'kddddddk', 'kdGGdddk', 'kddGGGdk', 'kdGddddk', 'kddddddk', 'kkkkkkkk', '..kkkk..'],
    pen: ['......kk', '.....kok', '....kyk.', '...kyk..', '..kyk...', '.kwk....', 'kkk.....', 'k.......'],
    heart: ['.kk..kk.', 'krrkkrrk', 'krwrrrrk', 'krrrrrrk', '.krrrrk.', '..krrk..', '...kk...', '........'],
    trophy: ['kkkkkkkk', 'kyyyyyyk', 'kyyyyyyk', '.kyyyyk.', '..kyyk..', '...kk...', '..kyyk..', '.kkkkkk.'],
    cap: ['........', '...kk...', '.kkddkk.', 'kddddddk', '.kkddkky', '..kddk.y', '..kkkk.y', '........'],
    warn: ['...kk...', '..kyyk..', '.kykkyk.', '.kykkyk.', 'kyyyyyyk', 'kyykkyyk', 'kyyyyyyk', 'kkkkkkkk'],
    check: ['.......k', '......ke', '.....kek', 'k...kek.', 'ek.kek..', 'kekek...', '.kek....', '..k.....'],
    cross: ['kk....kk', 'krk..krk', '.krkkrk.', '..krrk..', '..krrk..', '.krkkrk.', 'krk..krk', 'kk....kk'],
    coffee: ['..k.k...', '.k.k....', 'kkkkkk..', 'kwwwwkkk', 'kwmmwk.k', 'kwmmwkkk', '.kwwk...', 'kkkkkk..'],
    book: ['kkkkkkk.', 'kbbbbbkk', 'kbwwbbkw', 'kbbbbbkw', 'kbbbbbkw', 'kbbbbbkw', 'kkkkkkkw', '.wwwwwww'],
    mail: ['........', 'kkkkkkkk', 'kwkwwkwk', 'kwwkkwwk', 'kwwwwwwk', 'kwwwwwwk', 'kkkkkkkk', '........'],
    fire: ['...k....', '..kok...', '..kook..', '.kooyok.', 'kooyyook', 'koyyyyok', '.kyyyyk.', '..kkkk..'],
    clock: ['..kkkk..', '.kwwkwk.', 'kwwwkwwk', 'kwwwkwwk', 'kwwwkkwk', 'kwwwwwwk', '.kwwwwk.', '..kkkk..'],
    calendar: ['.k....k.', 'kkkkkkkk', 'krrrrrrk', 'kwwwwwwk', 'kwkwkwwk', 'kwwwwkwk', 'kwkwwwwk', 'kkkkkkkk'],
    zz: ['....kkkk', '......k.', '.....k..', '....kkkk', 'kkk.....', '..k.....', '.k......', 'kkk.....'],
    sweat: ['...k....', '..kBk...', '.kBBBk..', 'kBBwBBk.', 'kBBBBBk.', '.kBBBk..', '..kkk...', '........'],
    anger: ['.r....r.', 'rr....rr', '..r..r..', '........', '........', '..r..r..', 'rr....rr', '.r....r.'],
    music: ['...kkkkk', '...kkkkk', '...k...k', '...k...k', '.kkk.kkk', 'kkkkkkkk', '.kk..kk.', '........'],
    exclam: ['...rr...', '...rr...', '...rr...', '...rr...', '...rr...', '........', '...rr...', '...rr...'],
    question: ['..kkkk..', '.kk..kk.', '.....kk.', '....kk..', '...kk...', '........', '...kk...', '...kk...'],
    rain: ['..kkk...', '.klllkk.', 'kllllllk', 'kllllllk', '.kkkkkk.', '.B..B...', 'B..B..B.', '..B..B..'],
    sparkle: ['...y....', '...y....', '..yyy...', 'yyywyyy.', '..yyy...', '...y....', '...y....', '........'],
    cat: ['.k....k.', 'kok..kok', 'kooooook', 'kokookok', 'kooooook', 'kooyyook', '.kooook.', '..kkkk..'],
    home: ['...kk...', '..kook..', '.kooook.', 'kooooook', '.kwwwwk.', '.kwkkwk.', '.kwkkwk.', '.kkkkkk.'],
    flask: ['..kkkk..', '...kk...', '...kk...', '..kcck..', '.kcccck.', 'kcccccck', 'kcccccck', '.kkkkkk.'],
    chart: ['k.......', 'k.....ee', 'k....e..', 'k...e...', 'k..e....', 'k.e.....', 'k.......', 'kkkkkkkk'],
    list: ['........', 'kk.kkkkk', '........', 'kk.kkkkk', '........', 'kk.kkkkk', '........', '........'],
    shop: ['k.......', 'kkkkkkkk', '.kyyyyyk', '.kyyyyk.', '.kkkkkk.', '.k....k.', 'kk....kk', '........'],
    pause: ['........', '.ww..ww.', '.ww..ww.', '.ww..ww.', '.ww..ww.', '.ww..ww.', '.ww..ww.', '........'],
    play: ['..w.....', '..ww....', '..www...', '..wwww..', '..www...', '..ww....', '..w.....', '........'],
    dots: ['........', '........', '........', 'kk.kk.kk', 'kk.kk.kk', '........', '........', '........'],
    branch: ['..kkkk..', '..kyyk..', '..kkkk..', '...kk...', '.kkkkkk.', '.k.kk.k.', 'kkkkkkkk', 'ookbbkee'],
  };
  SP.ICON_NAMES = Object.keys(ICONS);
  const iconCache = new Map();
  SP.icon = function (name) {
    let c = iconCache.get(name);
    if (c) return c;
    c = makeCanvas(8, 8);
    paint(c.getContext('2d'), ICONS[name] || ICONS.question, IC, 0, 0);
    iconCache.set(name, c);
    return c;
  };
  // 界面用的图标：深色背景上把黑色描边换成浅色
  const IC_UI = Object.assign({}, IC, { k: '#c2c9e0' });
  const uiIconCache = new Map();
  SP.uiIcon = function (name) {
    let c = uiIconCache.get(name);
    if (c) return c;
    c = makeCanvas(8, 8);
    paint(c.getContext('2d'), ICONS[name] || ICONS.question, IC_UI, 0, 0);
    uiIconCache.set(name, c);
    return c;
  };
  const iconUrlCache = new Map();
  SP.iconURL = function (name, scale, variant) {
    scale = scale || 2;
    const key = name + '|' + scale + '|' + (variant || '');
    if (iconUrlCache.has(key)) return iconUrlCache.get(key);
    const c = makeCanvas(8 * scale, 8 * scale);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(variant === 'ui' ? SP.uiIcon(name) : SP.icon(name), 0, 0, 8 * scale, 8 * scale);
    const url = c.toDataURL();
    iconUrlCache.set(key, url);
    return url;
  };

  // ---------- 3x5 像素字体（场景里写英文和数字用） ----------
  const FONT = {
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111', F: '111100110100100',
    G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
    M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100', Q: '010101101110011', R: '110101110101101',
    S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
    Y: '101101010010010', Z: '111001010100111', 0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110',
    4: '101101111001001', 5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
    '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', $: '011110010011110', '.': '000000000000010', '%': '101001010100101',
    ':': '000010000010000', ' ': '000000000000000', '?': '110001010000010', '/': '001001010100100', '&': '010101010101011', '#': '101111101111101',
  };
  SP.textWidth = s => String(s).length * 4 - 1;
  SP.text = function (ctx, s, x, y, color, shadow) {
    s = String(s).toUpperCase();
    if (shadow) SP.text(ctx, s, x + 1, y + 1, shadow);
    ctx.fillStyle = color || P.white;
    for (let i = 0; i < s.length; i++) {
      const f = FONT[s[i]];
      if (!f) continue;
      for (let j = 0; j < 15; j++) if (f[j] === '1') ctx.fillRect(x + i * 4 + (j % 3), y + Math.floor(j / 3), 1, 1);
    }
  };
})();
