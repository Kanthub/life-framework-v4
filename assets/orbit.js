/* 罗盘：共享引擎 + 三套风格插件（甲 太极星盘 taiji / 乙 阴阳昼夜 yinyang / 丙 浑天仪 armillary）
   - 盘面画在 #lifeMap 里的 svg.compass-art（viewBox -262 -262 524 524）；切换风格时整张重建
   - 节点仍是 #mapNodes 里的按钮，按百分比定位：left = 50% + x/524
   - 节点坐标存在节点上：r 轨道半径（占边长的比例，旧数据按 r 归到最近的轨道），
     a 相对所在轨道偏移的角度（偏移 = 方向 × 时间 × 360 / 周期）
   - 鼠标在罗盘上时平滑减速停下；拖动松手吸附到最近轨道；拖到左侧领域即移过去 */
(function () {
  var map = document.getElementById('lifeMap');
  var box = document.getElementById('mapNodes');
  if (!map || !box) return;

  var SIZE = 524;                       // 盘面 viewBox 边长
  var SNAP = 14;                        // 离轨道这么近时轨迹线变红，提示会吸附
  var TIME_KEY = 'kongwo-orbit', STYLE_KEY = 'kongwo-compass';
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#14211f', TEAL = '#07575a', RED = '#b64b35', PAPER = '#f0ebdf';

  /* ———— SVG 小工具 ———— */
  function el(tag, at, p) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); if (p) p.appendChild(e); return e; }
  function txt(p, s, at) { var t = el('text', Object.assign({ 'text-anchor': 'middle' }, at), p); t.textContent = s; return t; }
  function rad(a) { return (a - 90) * Math.PI / 180; }            // 0 = 上，顺时针
  function pt(a, r) { return [Math.cos(rad(a)) * r, Math.sin(rad(a)) * r]; }
  function norm(a) { return (a % 360 + 360) % 360; }
  function taiji(p, R, dark, light) {
    var g = el('g', {}, p);
    el('circle', { r: R, fill: light }, g);
    el('path', { d: 'M0,' + -R + 'A' + R + ' ' + R + ' 0 0 1 0,' + R + 'A' + R / 2 + ' ' + R / 2 + ' 0 0 1 0,0A' + R / 2 + ' ' + R / 2 + ' 0 0 0 0,' + -R + 'Z', fill: dark }, g);
    el('circle', { cy: -R / 2, r: R / 7, fill: dark }, g);
    el('circle', { cy: R / 2, r: R / 7, fill: light }, g);
    return g;
  }
  function ticks(p, R, n, long) {
    for (var i = 0; i < n; i++) {
      var a = i * 360 / n, L = i % long ? 5 : 10, o = pt(a, R), q = pt(a, R - L);
      el('line', { x1: o[0], y1: o[1], x2: q[0], y2: q[1], stroke: INK, 'stroke-opacity': i % long ? .35 : .7 }, p);
    }
  }
  function dirs(p, R) {
    [['上', '精力', 0], ['守', '平衡', 90], ['下', '恢复', 180], ['进', '行动', 270]].forEach(function (d) {
      var q = pt(d[2], R); txt(p, d[0], { x: q[0], y: q[1] + 2, 'font-size': 14, 'font-weight': 700, fill: INK });
      txt(p, d[1], { x: q[0], y: q[1] + 14, 'font-size': 7.5, fill: '#626964' });
      var m = pt(d[2], R - 18); el('circle', { cx: m[0], cy: m[1], r: 2.4, fill: RED }, p);
    });
  }

  /* ———— 风格插件 ————
     orbits：轨道列表（R 圆半径；椭圆用 rx/ry/tilt，R=rx 用于归轨）
     build(art, core)：画盘面，返回 { name: 中心文字元素, frame(t) }
     pos(o, a)：轨道 o 上角度 a 的盘面坐标 {x,y[,depth]}
     hit(o, x, y)：指针在轨道 o 上对应的角度和距离 {a,d}
     node(el, i, o, ang, t)：每帧给节点加风格效果（可选） */
  function circlePos(o, a) { var q = pt(a, o.R); return { x: q[0], y: q[1] }; }
  function circleHit(o, x, y) { return { a: norm(Math.atan2(x, -y) * 180 / Math.PI), d: Math.abs(Math.sqrt(x * x + y * y) - o.R) }; }

  var STYLES = {};

  /* 甲：太极星盘 */
  STYLES.taiji = {
    label: '太极星盘',
    orbits: [{ R: 112, T: 50, dir: 1 }, { R: 150, T: 85, dir: 1 }, { R: 188, T: 130, dir: 1 }],
    pos: circlePos, hit: circleHit,
    build: function (s) {
      el('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .75 }, s);
      el('circle', { r: 212, fill: 'none', stroke: INK, 'stroke-opacity': .3 }, s);
      ticks(s, 226, 72, 3);
      var terms = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
      terms.forEach(function (t, i) { if (i % 3) return; var a = i * 15 + 7.5, q = pt(a, 203); txt(s, t, { x: q[0], y: q[1] + 2.5, 'font-size': 7, fill: '#898c85', transform: 'rotate(' + a + ' ' + q[0] + ' ' + q[1] + ')' }); });
      this.orbits.forEach(function (o, i) { el('circle', { r: o.R, fill: 'none', stroke: i == 1 ? INK : TEAL, 'stroke-opacity': i == 1 ? .35 : .4, 'stroke-dasharray': i == 0 ? '3 4' : i == 2 ? '1 5' : 'none' }, s); });
      dirs(s, 246);
      var gua = el('g', {}, s);
      el('circle', { r: 79, fill: 'none', stroke: INK, 'stroke-opacity': .5 }, gua);
      el('circle', { r: 98, fill: 'none', stroke: INK, 'stroke-opacity': .5 }, gua);
      [[1, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 0]].forEach(function (lines, k) {
        var g = el('g', { transform: 'rotate(' + k * 45 + ')' }, gua);
        lines.forEach(function (yang, j) {
          var y = -(83 + j * 5.5);
          if (yang) el('line', { x1: -7, x2: 7, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g);
          else { el('line', { x1: -7, x2: -1.6, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g); el('line', { x1: 1.6, x2: 7, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g); }
        });
        el('circle', { cy: -88, r: 1.6, fill: RED, transform: 'rotate(22.5)' }, g);
      });
      el('circle', { r: 66, fill: PAPER, stroke: INK, 'stroke-opacity': .6 }, s);
      var tj = taiji(s, 62, TEAL, '#f6f2e8');
      var name = txt(s, '', { y: 5, 'font-size': 15, 'font-weight': 700, fill: INK, stroke: '#f6f2e8', 'stroke-width': 4, 'paint-order': 'stroke', 'letter-spacing': '1' });
      // 节点身后的墨色拖尾：每帧按节点数补齐
      var trails = el('g', {}, s), pool = [];
      this.trail = function (i, o, ang) {
        var c = pool[i];
        if (!c) { var C = 2 * Math.PI * o.R; c = pool[i] = el('circle', { fill: 'none', stroke: TEAL, 'stroke-width': 2.2, 'stroke-opacity': .35, 'stroke-linecap': 'round' }, trails); }
        if (c._R !== o.R) { c._R = o.R; c.setAttribute('r', o.R); var L = 2 * Math.PI * o.R; c.setAttribute('stroke-dasharray', (L * 34 / 360) + ' ' + L); }
        c.style.display = ang == null ? 'none' : '';
        if (ang != null) c.setAttribute('transform', 'rotate(' + (ang - 90 - 34) + ')');
      };
      this.trails = pool;
      return {
        name: name,
        frame: function (t) {
          tj.setAttribute('transform', 'rotate(' + t * 6 + ')');
          gua.setAttribute('transform', 'rotate(' + -t * 2.5 + ')');
        }
      };
    },
    node: function (el, i, o, ang) { this.trail(i, o, ang); },
    after: function (count) { for (var i = count; i < this.trails.length; i++) this.trails[i].style.display = 'none'; }
  };

  /* 乙：阴阳昼夜 */
  STYLES.yinyang = {
    label: '阴阳昼夜',
    orbits: [{ R: 96, T: 60, dir: 1 }, { R: 130, T: 80, dir: -1 }, { R: 164, T: 105, dir: 1 }, { R: 198, T: 135, dir: -1 }],
    pos: circlePos, hit: circleHit,
    build: function (s) {
      var d = el('defs', {}, s), cl = el('clipPath', { id: 'cmpClipB' }, d); el('circle', { r: 226 }, cl);
      var wash = el('g', { 'clip-path': 'url(#cmpClipB)' }, s);
      var big = taiji(wash, 226, 'rgba(7,87,90,.085)', 'rgba(255,255,255,0)');
      el('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .75 }, s);
      ticks(s, 226, 48, 4);
      dirs(s, 246);
      var orbits = this.orbits;
      orbits.forEach(function (o, i) { el('circle', { r: o.R, fill: 'none', stroke: i % 2 ? TEAL : INK, 'stroke-opacity': i % 2 ? .45 : .35, 'stroke-dasharray': i % 2 ? '1.5 4' : 'none' }, s); });
      // 每条轨道一个小箭头标出顺逆
      orbits.forEach(function (o, i) { var a = 200 + i * 8, q = pt(a, o.R); el('path', { d: i % 2 ? 'M3,-3L-2,0L3,3' : 'M-3,-3L2,0L-3,3', fill: 'none', stroke: i % 2 ? TEAL : INK, 'stroke-opacity': .6, transform: 'translate(' + q[0] + ' ' + q[1] + ') rotate(' + a + ')' }, s); });
      el('circle', { r: 64, fill: 'none', stroke: TEAL, 'stroke-opacity': .25, 'stroke-width': 10 }, s);
      el('circle', { r: 58, fill: TEAL, stroke: PAPER, 'stroke-width': 4 }, s);
      el('circle', { r: 62, fill: 'none', stroke: TEAL }, s);
      var name = txt(s, '', { y: 2, 'font-size': 16, 'font-weight': 700, fill: '#fff', 'letter-spacing': '1' });
      txt(s, '稳定　清晰　有力', { y: 18, 'font-size': 7.5, fill: '#cfe0dc' });
      return { name: name, frame: function (t) { big.setAttribute('transform', 'rotate(' + t * 4 + ')'); } };
    },
    // 背光面朝外；转进大阴阳鱼的深色半边时染一层青色，像进入黑夜
    node: function (el, i, o, ang, t) {
      el.style.setProperty('--shade', norm(ang) + 'deg');
      el.classList.toggle('is-night', ang != null && norm(ang - t * 4) < 180);
    }
  };

  /* 丙：浑天仪 */
  function tiltOf(o) { var r = o.tilt * Math.PI / 180; return [Math.cos(r), Math.sin(r)]; }
  STYLES.armillary = {
    label: '浑天仪',
    orbits: [{ R: 118, rx: 118, ry: 44, tilt: -20, T: 45, dir: 1 }, { R: 162, rx: 162, ry: 60, tilt: 15, T: 70, dir: 1 }, { R: 204, rx: 204, ry: 78, tilt: -5, T: 100, dir: 1 }],
    pos: function (o, a) {
      var th = a * Math.PI / 180, x = o.rx * Math.cos(th), y = o.ry * Math.sin(th), cs = tiltOf(o);
      return { x: x * cs[0] - y * cs[1], y: x * cs[1] + y * cs[0], depth: Math.sin(th) };   // depth > 0 在前
    },
    // 先把指针按轨道倾角转回去，再按椭圆求参数角
    hit: function (o, x, y) {
      var cs = tiltOf(o), u = x * cs[0] + y * cs[1], v = -x * cs[1] + y * cs[0];
      var th = Math.atan2(v / o.ry, u / o.rx), dx = u - o.rx * Math.cos(th), dy = v - o.ry * Math.sin(th);
      return { a: norm(th * 180 / Math.PI), d: Math.sqrt(dx * dx + dy * dy) };
    },
    build: function (s, core) {
      var d = el('defs', {}, s), b = el('radialGradient', { id: 'cmpBall', cx: '.35', cy: '.3', r: '.8' }, d);
      el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': .45 }, b);
      el('stop', { offset: '.55', 'stop-color': '#fff', 'stop-opacity': 0 }, b);
      el('stop', { offset: '1', 'stop-color': '#061c1c', 'stop-opacity': .45 }, b);
      el('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .7 }, s);
      el('circle', { r: 219, fill: 'none', stroke: INK, 'stroke-opacity': .25 }, s);
      ticks(s, 226, 72, 6);
      dirs(s, 246);
      el('ellipse', { rx: 34, ry: 204, fill: 'none', stroke: INK, 'stroke-opacity': .18 }, s);   // 子午圈
      // 后半圈画在底层（虚线），太极球和前半圈画在节点后层之上
      var ball = el('g', {}, core), front = el('g', {}, core);
      this.orbits.forEach(function (o, i) {
        var g = 'rotate(' + o.tilt + ')';
        el('path', { d: 'M' + -o.rx + ',0A' + o.rx + ' ' + o.ry + ' 0 0 1 ' + o.rx + ',0', fill: 'none', stroke: INK, 'stroke-opacity': .22, 'stroke-dasharray': '2 4', transform: g }, s);
        el('path', { d: 'M' + o.rx + ',0A' + o.rx + ' ' + o.ry + ' 0 0 1 ' + -o.rx + ',0', fill: 'none', stroke: i == 1 ? TEAL : INK, 'stroke-opacity': .6, 'stroke-width': 1.3, transform: g }, front);
      });
      var tj = taiji(ball, 56, TEAL, '#f6f2e8');
      el('circle', { r: 56, fill: 'url(#cmpBall)', stroke: INK, 'stroke-opacity': .5 }, ball);
      el('ellipse', { rx: 74, ry: 16, fill: 'none', stroke: RED, 'stroke-opacity': .55, transform: 'rotate(-8)' }, ball);
      var name = txt(ball, '', { y: 84, 'font-size': 13, 'font-weight': 700, fill: INK, stroke: PAPER, 'stroke-width': 4, 'paint-order': 'stroke' });
      return { name: name, frame: function (t) { tj.setAttribute('transform', 'rotate(' + t * 7 + ')'); } };
    }
  };

  /* ———— 引擎状态 ———— */
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var time = parseFloat(localStorage.getItem(TIME_KEY)) || 0;     // 公转时间（秒），旧的相位值直接沿用
  var speed = 1, target = 1;                                     // 0..1，悬停时缓停
  var drag = null, justDragged = false;
  var style, art, core, scene, switcher;

  function offset(o) { return o.dir * time * 360 / o.T; }
  function nearestOrbit(r) {
    var best = 0, bd = Infinity;
    style.orbits.forEach(function (o, k) { var d = Math.abs(o.R - r * SIZE); if (d < bd) { bd = d; best = k; } });
    return best;
  }
  function baseOf(n, i) {
    var k = typeof n.r === 'number' ? nearestOrbit(n.r) : i % style.orbits.length;
    return { k: k, a: typeof n.a === 'number' ? n.a : i * 60 };
  }
  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function nodeEls() { return box.querySelectorAll('.map-node'); }
  function setXY(e, x, y) { e.style.left = (50 + x / SIZE * 100) + '%'; e.style.top = (50 + y / SIZE * 100) + '%'; }
  function toLocal(e) {
    var rc = map.getBoundingClientRect();
    return { x: ((e.clientX - rc.left) / rc.width - .5) * SIZE, y: ((e.clientY - rc.top) / rc.height - .5) * SIZE };
  }
  // 浑天仪的景深：前大后小、前实后淡，并决定在太极球的前面还是后面
  function depth(e, p) {
    if (p.depth == null) { e.style.removeProperty('--depth-s'); e.style.removeProperty('--depth-o'); e.style.removeProperty('--depth-z'); return; }
    var q = (p.depth + 1) / 2;
    e.style.setProperty('--depth-s', (.74 + .26 * q).toFixed(3));
    e.style.setProperty('--depth-o', (.5 + .5 * q).toFixed(2));
    e.style.setProperty('--depth-z', p.depth > 0 ? 4 : 2);
  }

  /* ———— 盘面 ———— */
  function buildArt(name) {
    style = STYLES[name] || STYLES.taiji;
    if (art) art.remove(); if (core) core.remove();
    art = el('svg', { class: 'compass-art', viewBox: '-262 -262 524 524', 'aria-hidden': 'true' });
    core = el('svg', { class: 'compass-art compass-core', viewBox: '-262 -262 524 524', 'aria-hidden': 'true' });
    map.insertBefore(art, box);
    map.insertBefore(core, box);
    scene = style.build(art, core);
    nodeEls().forEach(function (e) { e.classList.remove('is-night'); e.style.removeProperty('--shade'); depth(e, {}); });
    if (switcher) [].forEach.call(switcher.children, function (b) { b.setAttribute('aria-pressed', b.dataset.compass === name ? 'true' : 'false'); });
  }
  function setStyle(name, persist) {
    if (!STYLES[name]) name = 'taiji';
    document.documentElement.dataset.compass = name;
    if (persist) try { localStorage.setItem(STYLE_KEY, name); } catch (e) {}
    buildArt(name);
    decorate();
  }

  // 罗盘旁边的风格切换
  function buildSwitcher() {
    switcher = document.createElement('div');
    switcher.className = 'compass-switch';
    switcher.setAttribute('role', 'group');
    switcher.setAttribute('aria-label', '罗盘风格');
    Object.keys(STYLES).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.dataset.compass = k; b.textContent = STYLES[k].label;
      b.addEventListener('click', function () { setStyle(k, true); });
      switcher.appendChild(b);
    });
    map.parentNode.insertBefore(switcher, map);
  }

  /* ———— 节点 ———— */
  // 每次重绘罗盘后：中心写上领域名，给节点挂上自转/卫星节奏，摆到位置上
  function decorate() {
    var d = domains[active]; if (!d) return;
    if (scene && scene.name) scene.name.textContent = d.name;
    // 这个领域已经拖过位置，新加的节点就落在最内圈最空的地方
    if (d.nodes.some(function (n) { return typeof n.a === 'number'; })) {
      var fresh = d.nodes.filter(function (n) { return typeof n.a !== 'number'; });
      if (fresh.length) {
        fresh.forEach(function (n) { n.a = Math.round(gapAngle(d, n) * 10) / 10; n.r = style.orbits[0].R / SIZE; });
        saveDomains();
      }
    }
    nodeEls().forEach(function (e, i) {
      var n = d.nodes[i]; if (!n) return;
      var h = hash(n.id || n.t);
      e.classList.add('orb');
      e.style.setProperty('--spin', (70 + h % 50) + 's');
      e.style.setProperty('--tex', (h % 100) + '%');
      e.style.setProperty('--moon', (16 + h % 13) * (h % 2 ? 1 : -1) + 's');
      e.style.setProperty('--moon0', (h % 360) + 'deg');
      e.title = '点击打开 · 拖动调整位置 · 拖到左侧领域可移过去';
      // 名字一行放不下时缩字，而不是折行
      var b = e.querySelector('b'); b.style.fontSize = '';
      var room = e.clientWidth - 2, w = b.scrollWidth;
      if (w > room) b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * room / w).toFixed(1) + 'px';
    });
    layout();
  }
  function layout() {
    var d = domains[active]; if (!d || !style) return;
    if (scene) scene.frame(time);
    var els = nodeEls();
    els.forEach(function (e, i) {
      var n = d.nodes[i]; if (!n) return;
      var b = baseOf(n, i), o = style.orbits[b.k], ang = b.a + offset(o);
      var dragging = drag && drag.el === e && drag.moved;
      if (!dragging) { var p = style.pos(o, ang); setXY(e, p.x, p.y); depth(e, p); }
      if (style.node) style.node(e, i, o, dragging ? null : ang, time);
    });
    if (style.after) style.after(els.length);
    var add = box.querySelector('.map-add');
    if (add) { var o0 = style.orbits[0], p0 = style.pos(o0, gapAngle(d) + offset(o0)); setXY(add, p0.x, p0.y); depth(add, p0); }
  }

  // 「新增」放在最内圈轨道上最空的那段弧中间（角度相对轨道偏移）
  function gapAngle(d, skip) {
    var as = [];
    d.nodes.forEach(function (n, i) { if (n === skip || (skip && typeof n.a !== 'number')) return; var b = baseOf(n, i); if (b.k === 0) as.push(norm(b.a)); });
    as.sort(function (x, y) { return x - y; });
    if (!as.length) return 0;
    var best = 0, at = 0;
    as.forEach(function (a, k) { var nx = k + 1 < as.length ? as[k + 1] : as[0] + 360; if (nx - a > best) { best = nx - a; at = a + best / 2; } });
    return norm(at);
  }

  var last = 0, saved = 0;
  function tick(now) {
    var dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    var layer = document.getElementById('cardLayer');
    var t = reduce.matches || (layer && layer.classList.contains('is-open')) ? 0 : target;
    speed += (t - speed) * Math.min(1, dt * 3);
    if (reduce.matches) speed = 0;
    if (speed > .001) { time += speed * dt; layout(); }
    if (now - saved > 10000) { saved = now; saveTime(); }
    requestAnimationFrame(tick);
  }
  function saveTime() { try { localStorage.setItem(TIME_KEY, time.toFixed(2)); } catch (e) {} }

  map.addEventListener('pointerenter', function () { target = 0; });
  map.addEventListener('pointerleave', function () { if (!drag) target = 1; });
  addEventListener('pagehide', saveTime);

  /* ———— 拖动 ———— */
  // 指针 → 最近的轨道和该轨道上的角度
  function locate(e) {
    var q = toLocal(e), best = null;
    style.orbits.forEach(function (o, k) { var h = style.hit(o, q.x, q.y); if (!best || h.d < best.d) best = { k: k, a: h.a, d: h.d }; });
    best.x = q.x; best.y = q.y; best.on = best.d < SNAP;
    return best;
  }
  function trace(o, on) {
    var g = map.querySelector('.orbit-trace');
    if (!g) { g = document.createElement('i'); g.className = 'orbit-trace'; map.appendChild(g); }
    if (!o) { g.remove(); return; }
    g.style.width = (2 * (o.rx || o.R) / SIZE * 100) + '%';
    g.style.height = (2 * (o.ry || o.R) / SIZE * 100) + '%';
    g.style.transform = 'translate(-50%,-50%) rotate(' + (o.tilt || 0) + 'deg)';
    g.classList.toggle('on-ring', !!on);
  }

  box.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('[data-edit],[data-del],[data-add],.map-add')) return;
    var it = e.target.closest('.map-node'); if (!it) return;
    var i = [].indexOf.call(nodeEls(), it);
    drag = { el: it, i: i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, pos: null };
  });
  addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      drag.moved = true; target = 0;
      try { drag.el.setPointerCapture(drag.id); } catch (er) {}
      drag.el.classList.add('is-dragging'); map.classList.add('is-dragging');
      depth(drag.el, {});
    }
    e.preventDefault();
    var p = locate(e); drag.pos = p;
    // 指针出了盘面就把节点留在最近的轨道上，不跟着盖住左侧领域
    var outside = Math.sqrt(p.x * p.x + p.y * p.y) > 226;
    var q = p.on || outside ? style.pos(style.orbits[p.k], p.a) : p;
    setXY(drag.el, q.x, q.y);
    trace(style.orbits[p.k], p.on);
    // 拖到左边的领域列表上 → 松手即移过去
    var over = document.elementFromPoint(e.clientX, e.clientY);
    var dom = over && over.closest && over.closest('.domain');
    var di = dom ? +dom.dataset.i : -1;
    if (di === active) { dom = null; di = -1; }
    if (drag.dom !== dom) {
      if (drag.dom) drag.dom.classList.remove('is-drop');
      if (dom) dom.classList.add('is-drop');
      drag.dom = dom;
    }
    drag.el.classList.toggle('is-leaving', !!dom);
    if (dom) trace(null);
  });
  function end(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var dr = drag; drag = null;
    if (!dr.moved) return;
    dr.el.classList.remove('is-dragging'); map.classList.remove('is-dragging');
    trace(null);
    justDragged = true; setTimeout(function () { justDragged = false; }, 0);
    if (dr.dom) {
      dr.dom.classList.remove('is-drop'); dr.el.classList.remove('is-leaving');
      if (!moveNode(dr.i, +dr.dom.dataset.i)) layout();
      if (!map.matches(':hover')) target = 1;
      return;
    }
    var nodes = domains[active].nodes, n = nodes[dr.i];
    if (n && dr.pos) {
      // 同领域其它节点也落定当前位置，之后增删节点不会让它们跳位
      nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = Math.round(norm(b.a) * 10) / 10; m.r = style.orbits[b.k].R / SIZE; });
      var o = style.orbits[dr.pos.k];
      n.a = Math.round(norm(dr.pos.a - offset(o)) * 10) / 10;
      n.r = o.R / SIZE;
      saveDomains();
    }
    layout();
    if (!map.matches(':hover')) target = 1;
  }
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  // 拖动结束时浏览器还会补发一次 click：拦在卡片弹出之前
  addEventListener('click', function (e) {
    if (justDragged && e.target.closest && e.target.closest('#mapNodes')) { e.stopPropagation(); e.preventDefault(); justDragged = false; }
  }, true);

  // 键盘：选中节点后 Shift+←/→ 沿轨道挪 5°，Shift+↑/↓ 换到外/内一圈轨道（保持当前方位）
  box.addEventListener('keydown', function (e) {
    if (!e.shiftKey || !/^Arrow/.test(e.key)) return;
    var it = e.target.closest('.map-node'); if (!it) return;
    var i = [].indexOf.call(nodeEls(), it), n = domains[active].nodes[i]; if (!n) return;
    var b = baseOf(n, i), k = b.k, a = b.a;
    if (e.key === 'ArrowLeft') a -= 5;
    else if (e.key === 'ArrowRight') a += 5;
    else {
      k = Math.max(0, Math.min(style.orbits.length - 1, k + (e.key === 'ArrowUp' ? 1 : -1)));
      a = a + offset(style.orbits[b.k]) - offset(style.orbits[k]);
    }
    n.a = Math.round(norm(a) * 10) / 10; n.r = style.orbits[k].R / SIZE;
    e.preventDefault(); saveDomains(); layout();
  });

  var _render = renderAll;
  renderAll = function () { _render(); decorate(); };

  // head 脚本已经按 ?compass= / 本地设置写好 data-compass；文件同步可能晚到，这里再读一次
  var q = (location.search.match(/[?&]compass=([a-z]+)/) || [])[1], saved0;
  try { saved0 = localStorage.getItem(STYLE_KEY); } catch (e) {}
  buildSwitcher();
  setStyle(q && STYLES[q] ? q : STYLES[saved0] ? saved0 : document.documentElement.dataset.compass, false);
  requestAnimationFrame(tick);
})();
