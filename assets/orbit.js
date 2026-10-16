/* 罗盘：三种样式（甲 太极星盘 / 乙 阴阳昼夜 / 丙 浑天仪）+ 节点公转 + 鼠标拖动定位
   - 节点位置用极坐标保存在节点上：a 角度（度，上方为 0，顺时针），r 半径（占 435 罗盘边长的比例）
     r 的取值范围、含义与旧版完全一致（0.239～0.395，0.2736 / 0.3586 为两条吸附环）；
     每种样式把这段「标准半径」映射到自己的轨道上，所以切换样式不会改写数据
   - 节点按所在轨道公转，内快外慢；鼠标在罗盘上时减速停下，方便点击
   - 拖动节点到新位置，靠近轨道时自动吸附；松手即保存
   - 样式选择存在 localStorage「kongwo-compass-style」 */
(function () {
  var map = document.getElementById('lifeMap');
  var box = document.getElementById('mapNodes');
  if (!map || !box) return;

  var VIEW = 435;                       // 数据里 r 的基准边长（旧罗盘 svg 的 viewBox）
  var D = 524;                          // 设计稿画布边长（viewBox -262 -262 524 524）
  var R_MIN = 104, R_MAX = 172, R_HOME = 119;   // 标准半径（VIEW 单位）：上下限、默认轨道
  var SNAP = 13;                        // 吸附距离（设计稿单位）
  var SLOW = 3;                         // 设计稿里的转速是演示用的，实际放慢 3 倍
  var PHASE_KEY = 'kongwo-orbit';
  var STYLE_KEY = 'kongwo-compass-style';
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#14211f', TEAL = '#07575a', RED = '#b64b35', PAPER = '#f0ebdf';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var clock = parseFloat(localStorage.getItem(PHASE_KEY)) || 0;   // 公转时钟（秒）
  var speed = reduce.matches ? 0 : 1, target = 1;                 // 0..1，悬停时缓停
  var drag = null, justDragged = false;

  /* ———— 三种样式的几何：knots 把标准半径映射到设计稿半径；orbits 为可吸附的轨道 ———— */
  var STYLES = {
    a: { name: '太极星盘', knots: [[104, 112], [119, 150], [156, 188], [172, 194]], orbits: [112, 150, 188], periods: [50, 85, 130], dirs: [1, 1, 1],
         seat: function (i) { return { k: i % 3, a: i * 67 + (i % 3) * 23 }; } },
    b: { name: '阴阳昼夜', knots: [[104, 96], [119, 130], [137.5, 164], [156, 198], [172, 200]], orbits: [96, 130, 164, 198], periods: [60, 80, 105, 135], dirs: [1, -1, 1, -1],
         seat: function (i) { var k = [0, 1, 1, 2, 2, 3][i % 6]; return { k: k, a: i * 61 + k * 30 }; } },
    c: { name: '浑天仪', knots: [[104, 118], [119, 162], [156, 204], [172, 210]], orbits: [118, 162, 204], periods: [45, 70, 100], dirs: [1, 1, 1],
         ry: [44, 60, 78], tilt: [-20, 15, -5], ellipse: true,
         seat: function (i) { return { k: i % 3, a: i * 70 + 90 }; } }
  };
  var ORDER = ['a', 'b', 'c'];
  var style = 'b', S = STYLES.b;
  try { var saved0 = localStorage.getItem(STYLE_KEY); if (STYLES[saved0]) style = saved0; } catch (e) {}
  S = STYLES[style];

  // 分段线性插值（xs 递增），超出两端时取端点值
  function interp(xs, ys, x) {
    if (x <= xs[0]) return ys[0];
    for (var i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
    return ys[ys.length - 1];
  }
  function col(arr, j) { return arr.map(function (p) { return p[j]; }); }
  function toD(r) { return interp(col(S.knots, 0), col(S.knots, 1), r * VIEW); }      // 标准 r（比例）→ 设计稿半径
  function toR(d) { return interp(col(S.knots, 1), col(S.knots, 0), d) / VIEW; }      // 设计稿半径 → 标准 r（比例）
  function dMin() { return S.knots[0][1]; }
  function dMax() { return S.knots[S.knots.length - 1][1]; }
  function nearest(d) { var k = 0; S.orbits.forEach(function (o, i) { if (Math.abs(o - d) < Math.abs(S.orbits[k] - d)) k = i; }); return k; }
  // 某条轨道上的公转相位：内圈快、外圈慢；乙样式一顺一逆
  function phaseAt(d) {
    var T = interp(S.orbits, S.periods, d) * SLOW;
    return ((S.dirs[nearest(d)] * clock * 360 / T) % 360 + 360) % 360;
  }
  // 浑天仪：半径 d 处的椭圆（rx = d，ry 与倾角按轨道插值）
  function shape(d) {
    if (!S.ellipse) return { rx: d, ry: d, tilt: 0 };
    var ratio = interp(S.orbits, S.ry.map(function (y, i) { return y / S.orbits[i]; }), d);
    return { rx: d, ry: d * ratio, tilt: interp(S.orbits, S.tilt, d) };
  }
  // 屏幕角度（0=上，顺时针）+ 设计稿半径 → 坐标（设计稿单位，原点在中心）与纵深
  function point(ang, d) {
    if (!S.ellipse) { var t = ang * Math.PI / 180; return { x: Math.sin(t) * d, y: -Math.cos(t) * d, depth: 0 }; }
    var e = shape(d), th = (ang - 90) * Math.PI / 180, tl = e.tilt * Math.PI / 180;
    var x = e.rx * Math.cos(th), y = e.ry * Math.sin(th);
    return { x: x * Math.cos(tl) - y * Math.sin(tl), y: x * Math.sin(tl) + y * Math.cos(tl), depth: Math.sin(th) };
  }

  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function nodeEls() { return box.querySelectorAll('.map-node'); }
  function baseOf(n, i) {
    var st = S.seat(i);
    return { a: typeof n.a === 'number' ? n.a : st.a, r: typeof n.r === 'number' ? n.r : toR(S.orbits[st.k]) };
  }
  function norm(a) { return (a % 360 + 360) % 360; }

  // 把节点摆到屏幕角度 ang、设计稿半径 d 处（不含公转相位）
  function placeAt(el, ang, d) {
    var p = point(ang, d);
    el.style.left = (50 + p.x / D * 100) + '%';
    el.style.top = (50 + p.y / D * 100) + '%';
    if (S.ellipse) {
      // 转到后方变小变淡、被太极球遮住；前方变大
      var f = (p.depth + 1) / 2;
      el.style.setProperty('--k', (.74 + .26 * f).toFixed(3));
      el.style.setProperty('--dop', (.5 + .5 * f).toFixed(2));
      el.classList.toggle('is-front', p.depth > 0);
      el.classList.toggle('is-back', p.depth <= 0);
    }
    if (style === 'b') {
      el.style.setProperty('--out', norm(ang).toFixed(1) + 'deg');      // 背光面朝外
      el.classList.toggle('is-night', norm(ang - art.wash) < 180);      // 进入大阴阳鱼的深色半边
    }
  }
  function place(el, a, r) { var d = toD(r); placeAt(el, a + phaseAt(d), d); return d; }

  /* ———— 罗盘底图（SVG，按样式重建） ———— */
  var art = { layers: [], wash: 0, frame: null, trails: null };
  function svg(tag, at, p) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); if (p) p.appendChild(e); return e; }
  function txt(p, s, at) { var t = svg('text', Object.assign({ 'text-anchor': 'middle' }, at), p); t.textContent = s; return t; }
  function pt(a, r) { var t = (a - 90) * Math.PI / 180; return [Math.cos(t) * r, Math.sin(t) * r]; }
  function layer(cls) {
    var s = svg('svg', { 'class': 'compass-art ' + cls, viewBox: '-262 -262 524 524', 'aria-hidden': 'true', focusable: 'false' });
    map.insertBefore(s, box); art.layers.push(s); return s;
  }
  function taiji(p, R, dark, light) {
    var g = svg('g', {}, p);
    svg('circle', { r: R, fill: light }, g);
    svg('path', { d: 'M0,' + -R + 'A' + R + ' ' + R + ' 0 0 1 0,' + R + 'A' + R / 2 + ' ' + R / 2 + ' 0 0 1 0,0A' + R / 2 + ' ' + R / 2 + ' 0 0 0 0,' + -R + 'Z', fill: dark }, g);
    svg('circle', { cy: -R / 2, r: R / 7, fill: dark }, g);
    svg('circle', { cy: R / 2, r: R / 7, fill: light }, g);
    return g;
  }
  function ticks(p, R, n, long) {
    for (var i = 0; i < n; i++) {
      var a = i * 360 / n, L = i % long ? 5 : 10, o = pt(a, R), q = pt(a, R - L);
      svg('line', { x1: o[0], y1: o[1], x2: q[0], y2: q[1], stroke: INK, 'stroke-opacity': i % long ? .35 : .7 }, p);
    }
  }
  function dirs(p, R) {
    [['上', '精力', 0], ['守', '平衡', 90], ['下', '恢复', 180], ['进', '行动', 270]].forEach(function (d) {
      var q = pt(d[2], R);
      txt(p, d[0], { x: q[0], y: q[1] + 2, 'font-size': 16, 'font-weight': 700, fill: INK });
      txt(p, d[1], { x: q[0], y: q[1] + 15, 'font-size': 9.5, fill: '#626964' });
      var m = pt(d[2], R - 18); svg('circle', { cx: m[0], cy: m[1], r: 2.4, fill: RED }, p);
    });
  }
  function rot(g, deg) { g.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ')'); }

  // 甲：太极星盘 —— 太极自转、先天八卦逆转、三条轨道、节点拖墨色轨迹、二十四节气刻度
  function buildA() {
    var s = layer('back');
    svg('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .75 }, s);
    svg('circle', { r: 212, fill: 'none', stroke: INK, 'stroke-opacity': .3 }, s);
    ticks(s, 226, 72, 3);
    var terms = ['立春', '雨水', '惊蛰', '春分', '清明', '谷雨', '立夏', '小满', '芒种', '夏至', '小暑', '大暑', '立秋', '处暑', '白露', '秋分', '寒露', '霜降', '立冬', '小雪', '大雪', '冬至', '小寒', '大寒'];
    terms.forEach(function (t, i) { if (i % 3) return; var a = i * 15 + 7.5, q = pt(a, 203); txt(s, t, { x: q[0], y: q[1] + 3, 'font-size': 8.5, fill: '#898c85', transform: 'rotate(' + a + ' ' + q[0] + ' ' + q[1] + ')' }); });
    S.orbits.forEach(function (r, i) { svg('circle', { r: r, fill: 'none', stroke: i == 1 ? INK : TEAL, 'stroke-opacity': i == 1 ? .35 : .4, 'stroke-dasharray': i == 0 ? '3 4' : i == 2 ? '1 5' : 'none' }, s); });
    dirs(s, 246);
    var gua = svg('g', {}, s);
    svg('circle', { r: 79, fill: 'none', stroke: INK, 'stroke-opacity': .5 }, gua);
    svg('circle', { r: 98, fill: 'none', stroke: INK, 'stroke-opacity': .5 }, gua);
    [[1, 1, 1], [0, 1, 1], [0, 1, 0], [0, 0, 1], [0, 0, 0], [1, 0, 0], [1, 0, 1], [1, 1, 0]].forEach(function (lines, k) {
      var g = svg('g', { transform: 'rotate(' + k * 45 + ')' }, gua);
      lines.forEach(function (yang, j) {
        var y = -(83 + j * 5.5);
        if (yang) svg('line', { x1: -7, x2: 7, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g);
        else { svg('line', { x1: -7, x2: -1.6, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g); svg('line', { x1: 1.6, x2: 7, y1: y, y2: y, stroke: INK, 'stroke-width': 2.4 }, g); }
      });
      svg('circle', { cy: -88, r: 1.6, fill: RED, transform: 'rotate(22.5)' }, g);
    });
    svg('circle', { r: 66, fill: PAPER, stroke: INK, 'stroke-opacity': .6 }, s);
    var tj = taiji(s, 62, TEAL, '#f6f2e8');
    art.trails = svg('g', {}, s);
    art.frame = function (t) { rot(tj, t * 6 / SLOW); rot(gua, -t * 2.5 / SLOW); };
  }

  // 乙：阴阳昼夜 —— 淡阴阳鱼铺满盘面缓慢旋转，中心青绿太阳，四条轨道阳顺阴逆
  function buildB() {
    var s = layer('back');
    var cl = svg('clipPath', { id: 'cmpBclip' }, svg('defs', {}, s)); svg('circle', { r: 226 }, cl);
    var wash = svg('g', { 'clip-path': 'url(#cmpBclip)' }, s);
    var big = taiji(wash, 226, 'rgba(7,87,90,.085)', 'rgba(255,255,255,0)');
    svg('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .75 }, s);
    ticks(s, 226, 48, 4);
    dirs(s, 246);
    S.orbits.forEach(function (r, i) { svg('circle', { r: r, fill: 'none', stroke: i % 2 ? TEAL : INK, 'stroke-opacity': i % 2 ? .45 : .35, 'stroke-dasharray': i % 2 ? '1.5 4' : 'none' }, s); });
    // 每条轨道一个小箭头标出顺逆
    S.orbits.forEach(function (r, i) { var a = 200 + i * 8, q = pt(a, r); svg('path', { d: i % 2 ? 'M3,-3L-2,0L3,3' : 'M-3,-3L2,0L-3,3', fill: 'none', stroke: i % 2 ? TEAL : INK, 'stroke-opacity': .6, transform: 'translate(' + q[0] + ' ' + q[1] + ') rotate(' + a + ')' }, s); });
    svg('circle', { r: 64, fill: 'none', stroke: TEAL, 'stroke-opacity': .25, 'stroke-width': 10 }, s);
    svg('circle', { r: 58, fill: TEAL, stroke: PAPER, 'stroke-width': 4 }, s);
    svg('circle', { r: 62, fill: 'none', stroke: TEAL }, s);
    art.frame = function (t) { art.wash = norm(t * 4 / SLOW); rot(big, art.wash); };
  }

  // 丙：浑天仪 —— 三条倾斜椭圆轨道，后半在太极球之下、前半在其上，节点随纵深缩放
  function buildC() {
    var s = layer('back'), core = layer('core'), front = layer('front');
    var b = svg('radialGradient', { id: 'cmpCball', cx: '.35', cy: '.3', r: '.8' }, svg('defs', {}, core));
    svg('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': .45 }, b);
    svg('stop', { offset: '.55', 'stop-color': '#fff', 'stop-opacity': 0 }, b);
    svg('stop', { offset: '1', 'stop-color': '#061c1c', 'stop-opacity': .45 }, b);
    svg('circle', { r: 226, fill: 'none', stroke: INK, 'stroke-opacity': .7 }, s);
    svg('circle', { r: 219, fill: 'none', stroke: INK, 'stroke-opacity': .25 }, s);
    ticks(s, 226, 72, 6);
    dirs(s, 246);
    svg('ellipse', { rx: 34, ry: 204, fill: 'none', stroke: INK, 'stroke-opacity': .18 }, s);   // 子午圈
    S.orbits.forEach(function (rx, i) {
      var ry = S.ry[i], g = 'rotate(' + S.tilt[i] + ')';
      svg('path', { d: 'M' + -rx + ',0A' + rx + ' ' + ry + ' 0 0 1 ' + rx + ',0', fill: 'none', stroke: INK, 'stroke-opacity': .22, 'stroke-dasharray': '2 4', transform: g }, s);
      svg('path', { d: 'M' + rx + ',0A' + rx + ' ' + ry + ' 0 0 1 ' + -rx + ',0', fill: 'none', stroke: i == 1 ? TEAL : INK, 'stroke-opacity': .6, 'stroke-width': 1.3, transform: g }, front);
    });
    var tj = taiji(core, 56, TEAL, '#f6f2e8');
    svg('circle', { r: 56, fill: 'url(#cmpCball)', stroke: INK, 'stroke-opacity': .5 }, core);
    svg('ellipse', { rx: 74, ry: 16, fill: 'none', stroke: RED, 'stroke-opacity': .55, transform: 'rotate(-8)' }, core);
    art.frame = function (t) { rot(tj, t * 7 / SLOW); };
  }
  var BUILD = { a: buildA, b: buildB, c: buildC };

  function applyStyle(key) {
    art.layers.forEach(function (l) { l.remove(); });
    art = { layers: [], wash: 0, frame: null, trails: null };
    style = key; S = STYLES[key];
    map.dataset.compass = key;
    BUILD[key]();
    if (art.frame) art.frame(clock);
    switcher.querySelectorAll('[data-compass]').forEach(function (b) {
      var on = b.dataset.compass === key;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
  }
  function setStyle(key) {
    if (!STYLES[key] || key === style) return;
    applyStyle(key);
    try { localStorage.setItem(STYLE_KEY, key); } catch (e) {}
    decorate();
  }

  /* ———— 样式切换控件（罗盘左上角：甲 乙 丙） ———— */
  var switcher = map.querySelector('.compass-switch');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.className = 'compass-switch';
    switcher.setAttribute('role', 'radiogroup');
    switcher.setAttribute('aria-label', '罗盘样式');
    switcher.innerHTML = ORDER.map(function (k, i) {
      return '<button type="button" role="radio" data-compass="' + k + '" title="' + '甲乙丙'[i] + ' · ' + STYLES[k].name + '"><b>' + '甲乙丙'[i] + '</b><small>' + STYLES[k].name.slice(0, 2) + '</small></button>';
    }).join('');
    map.appendChild(switcher);
  }
  switcher.addEventListener('click', function (e) {
    var b = e.target.closest('[data-compass]'); if (b) setStyle(b.dataset.compass);
  });
  switcher.addEventListener('keydown', function (e) {
    var step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!step) return;
    e.preventDefault();
    var k = ORDER[(ORDER.indexOf(style) + step + ORDER.length) % ORDER.length];
    setStyle(k);
    var b = switcher.querySelector('[data-compass="' + k + '"]'); if (b) b.focus();
  });

  // 每次重绘罗盘后：给节点挂上样式，并摆到位置上
  function decorate() {
    var d = domains[active]; if (!d) return;
    // 这个领域已经拖过位置，新加的节点就落在「新增」原来所在的空位
    if (d.nodes.some(function (n) { return typeof n.a === 'number'; })) {
      var fresh = d.nodes.filter(function (n) { return typeof n.a !== 'number'; });
      if (fresh.length) {
        fresh.forEach(function (n) { n.a = -1; });
        var placed = { nodes: d.nodes.filter(function (n) { return n.a >= 0; }) };
        fresh.forEach(function (n) { n.a = Math.round(gapAngle(placed) % 360 * 10) / 10; n.r = R_HOME / VIEW; placed.nodes.push(n); });
        saveDomains();
      }
    }
    nodeEls().forEach(function (el, i) {
      var n = d.nodes[i]; if (!n) return;
      el.classList.add('orb');
      el.title = '点击打开 · 拖动调整位置 · 拖到左侧领域可移过去';
      // 名字一行放不下时缩字，而不是折行
      var b = el.querySelector('b'); b.style.fontSize = '';
      var room = el.clientWidth - 2, w = b.scrollWidth;
      if (w > room) b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * room / w).toFixed(1) + 'px';
    });
    // 甲：每个节点后面拖一小段墨色轨迹
    if (art.trails) {
      art.trails.textContent = '';
      nodeEls().forEach(function () { svg('circle', { fill: 'none', stroke: TEAL, 'stroke-width': 2.2, 'stroke-opacity': .35, 'stroke-linecap': 'round' }, art.trails); });
    }
    layout();
  }
  function layout() {
    var d = domains[active]; if (!d) return;
    if (art.frame) art.frame(clock);
    var trails = art.trails ? art.trails.children : [];
    nodeEls().forEach(function (el, i) {
      var n = d.nodes[i], tr = trails[i]; if (!n) return;
      if (drag && drag.el === el) { if (tr) tr.setAttribute('stroke-opacity', 0); return; }
      var b = baseOf(n, i), dd = place(el, b.a, b.r);
      if (tr) {
        var C = 2 * Math.PI * dd;
        tr.setAttribute('r', dd.toFixed(1));
        tr.setAttribute('stroke-dasharray', (C * 34 / 360).toFixed(1) + ' ' + C.toFixed(1));
        tr.setAttribute('stroke-opacity', .35);
        tr.setAttribute('transform', 'rotate(' + (b.a + phaseAt(dd) - 90 - 34).toFixed(2) + ')');
      }
    });
    var add = box.querySelector('.map-add');
    if (add) place(add, gapAngle(d), R_HOME / VIEW);
  }

  // 「新增」放在默认轨道上最空的那段弧中间
  function gapAngle(d) {
    var as = d.nodes.map(function (n, i) { return norm(baseOf(n, i).a); }).sort(function (x, y) { return x - y; });
    if (!as.length) return 0;
    var best = 0, at = 0;
    as.forEach(function (a, k) { var nx = k + 1 < as.length ? as[k + 1] : as[0] + 360; if (nx - a > best) { best = nx - a; at = a + best / 2; } });
    return at;
  }

  var last = 0, saved = 0;
  function saveClock() { try { localStorage.setItem(PHASE_KEY, clock.toFixed(2)); } catch (e) {} }
  function tick(now) {
    var dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    var t = reduce.matches || document.getElementById('cardLayer') && document.getElementById('cardLayer').classList.contains('is-open') ? 0 : target;
    speed += (t - speed) * Math.min(1, dt * 3);
    if (speed > .001) { clock += speed * dt; layout(); }
    if (now - saved > 10000) { saved = now; saveClock(); }
    requestAnimationFrame(tick);
  }

  map.addEventListener('pointerenter', function () { target = 0; });
  map.addEventListener('pointerleave', function () { if (!drag) target = 1; });
  addEventListener('pagehide', saveClock);

  /* ———— 拖动 ———— */
  // 指针 → 屏幕角度 a、设计稿半径 d、标准半径 r；靠近轨道时吸附
  function toPolar(e) {
    var rc = map.getBoundingClientRect();
    var x = ((e.clientX - rc.left) / rc.width - .5) * D, y = ((e.clientY - rc.top) / rc.height - .5) * D;
    var d, a, snapped = null;
    if (!S.ellipse) {
      d = Math.sqrt(x * x + y * y);
      a = Math.atan2(x, -y) * 180 / Math.PI;
      S.orbits.forEach(function (R) { if (Math.abs(d - R) < SNAP) snapped = R; });
      d = snapped || Math.max(dMin(), Math.min(dMax(), d));
    } else {
      // 浑天仪：找经过指针的那一圈椭圆（逐档扫描半径），再求椭圆上的角度
      var fit = function (s) {
        var e = shape(s), tl = -e.tilt * Math.PI / 180;
        var u = (x * Math.cos(tl) - y * Math.sin(tl)) / e.rx, v = (x * Math.sin(tl) + y * Math.cos(tl)) / e.ry;
        return { q: Math.sqrt(u * u + v * v), th: Math.atan2(v, u) };
      };
      var best = dMin(), err = Infinity;
      for (var s = dMin(); s <= dMax() + .01; s += 1) { var f = fit(s), m = Math.abs(f.q - 1) * s; if (m < err) { err = m; best = s; } }
      S.orbits.forEach(function (R) { if (Math.abs(best - R) < SNAP) snapped = R; });
      d = snapped || best;
      a = fit(d).th * 180 / Math.PI + 90;
    }
    return { a: a, d: d, r: toR(d), ring: snapped };
  }
  function trace(d, ring) {
    var g = map.querySelector('.orbit-trace');
    if (!g) { g = document.createElement('i'); g.className = 'orbit-trace'; map.appendChild(g); }
    if (d == null) { g.remove(); return; }
    var e = shape(d);
    g.style.width = (e.rx * 2 / D * 100) + '%';
    g.style.height = (e.ry * 2 / D * 100) + '%';
    g.style.transform = 'translate(-50%,-50%) rotate(' + e.tilt + 'deg)';
    g.classList.toggle('on-ring', !!ring);
  }

  box.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('[data-edit],[data-del],[data-add],.map-add')) return;
    var el = e.target.closest('.map-node'); if (!el) return;
    var i = [].indexOf.call(nodeEls(), el);
    drag = { el: el, i: i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, pos: null };
  });
  addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      drag.moved = true; target = 0;
      try { drag.el.setPointerCapture(drag.id); } catch (er) {}
      drag.el.classList.add('is-dragging'); map.classList.add('is-dragging');
    }
    e.preventDefault();
    var p = toPolar(e); drag.pos = p;
    placeAt(drag.el, p.a, p.d);
    trace(p.d, p.ring);
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
    var n = domains[active].nodes[dr.i];
    if (n && dr.pos) {
      // 同领域其它节点也落定当前位置，之后增删节点不会让它们跳位
      domains[active].nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = norm(b.a); m.r = b.r; });
      n.a = Math.round(norm(dr.pos.a - phaseAt(dr.pos.d)) * 10) / 10;
      n.r = Math.round(dr.pos.r * 10000) / 10000;
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

  // 键盘：选中节点后 Shift+←/→ 沿轨道挪动，Shift+↑/↓ 换内外（屏幕上的角度保持不跳）
  box.addEventListener('keydown', function (e) {
    if (!e.shiftKey || !/^Arrow/.test(e.key)) return;
    var el = e.target.closest('.map-node'); if (!el) return;
    var i = [].indexOf.call(nodeEls(), el), n = domains[active].nodes[i]; if (!n) return;
    var b = baseOf(n, i), shown = b.a + phaseAt(toD(b.r));
    if (e.key === 'ArrowLeft') shown -= 5; else if (e.key === 'ArrowRight') shown += 5;
    else b.r = Math.max(R_MIN / VIEW, Math.min(R_MAX / VIEW, b.r + (e.key === 'ArrowUp' ? 1 : -1) * 4 / VIEW));
    n.a = Math.round(norm(shown - phaseAt(toD(b.r))) * 10) / 10; n.r = Math.round(b.r * 10000) / 10000;
    e.preventDefault(); saveDomains(); layout();
  });

  var _render = renderAll;
  renderAll = function () { _render(); decorate(); };
  applyStyle(style);
  decorate();
  requestAnimationFrame(tick);
})();
