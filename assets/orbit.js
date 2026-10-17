/* 罗盘：三种样式（甲 太极星盘 / 乙 阴阳昼夜 / 丙 浑天仪）+ 节点公转 + 鼠标拖动定位
   - 节点位置用极坐标保存在节点上：a 角度（度，上方为 0，顺时针），r 半径（占 435 罗盘边长的比例）
     r 的取值范围、含义与旧版完全一致（0.239～0.395，0.2736 / 0.3586 为两条吸附环）；
     每种样式把这段「标准半径」映射到自己的轨道上，所以切换样式不会改写数据
   - 节点按所在轨道公转，内快外慢；鼠标压在节点上时减速停下，方便点击（指针静止几秒后自动恢复）
   - 拖动节点到新位置，靠近轨道时自动吸附；松手即保存
   - 运行模式（同步 / 呼吸 / 星轨 / 潮汐 / 对转 / 摆荡，design/orbit-motion-options.html）与底图样式互相独立，可任意组合
   - 丙（浑天仪）的竖直子午圈也是一条可吸附轨道：在它上面的节点额外存 o: 'm'（a 为椭圆上的角度，r 仍是外圈的标准半径），
     旧数据没有 o，位置不变；甲、乙忽略 o，照 a / r 摆
   - 样式选择存在 localStorage「kongwo-compass-style」，转速档位存在「kongwo-compass-speed」，运行模式存在「kongwo-compass-motion」 */
(function () {
  var map = document.getElementById('lifeMap');
  var box = document.getElementById('mapNodes');
  if (!map || !box) return;

  var VIEW = 435;                       // 数据里 r 的基准边长（旧罗盘 svg 的 viewBox）
  var D = 524;                          // 设计稿画布边长（viewBox -262 -262 524 524）
  var R_MIN = 104, R_MAX = 172, R_HOME = 119;   // 标准半径（VIEW 单位）：上下限、默认轨道
  var SNAP = 13;                        // 吸附距离（设计稿单位）
  var SLOW = 3;                         // 底图（太极、八卦、阴阳鱼）的自转比设计稿慢 3 倍
  var PHASE_KEY = 'kongwo-orbit';
  var STYLE_KEY = 'kongwo-compass-style';
  var SPEED_KEY = 'kongwo-compass-speed';
  var MOTION_KEY = 'kongwo-compass-motion';
  /* 转速档位：键、字、倍率。倍率乘在公转时钟上，时钟 1 秒 = 设计稿（orbit-motion-options.html）滑块 ×1 时的 1 秒；
     「快」= 中 ×2；「极快」名义 ×5，但按模式封顶：节点峰值角速度不超过 PEAK_CAP（见 rateNow）。旧版存的键名不变，直接沿用 */
  var RATES = [['slow', '慢', .5], ['mid', '中', 1], ['fast', '快', 2], ['max', '极快', 5], ['stop', '停', 0]];
  var PEAK_CAP = 60;                    // 度 / 秒
  /* 运行模式：键、按钮上的字、完整说明 */
  var MOTIONS = [
    ['sync', '同步', '同步旋转（原样）：节点按底图的轨道公转，内快外慢'],
    ['breath', '呼吸', '壹 呼吸 · 一进一出：慢慢公转，同时沿半径一收一放，节点依次起伏'],
    ['kepler', '星轨', '贰 星轨 · 各安其位：像行星，内圈快、外圈慢（周期 ∝ 半径^1.5）'],
    ['tide', '潮汐', '叁 潮汐 · 张弛有度：整盘转速按 30 秒一周涨落，退潮时几乎停住'],
    ['duet', '对转', '肆 阴阳对转 · 一顺一逆：相邻节点一顺时针、一逆时针'],
    ['pendulum', '摆荡', '伍 摆荡 · 傅科摆：节点在本位左右摆动，本位极慢漂移，最容易点中']
  ];
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#14211f', TEAL = '#07575a', RED = '#b64b35', PAPER = '#f0ebdf';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var clock = parseFloat(localStorage.getItem(PHASE_KEY));        // 公转时钟（秒）
  if (!isFinite(clock) || clock < 0) clock = 0;
  var speed = reduce.matches ? 0 : 1;                             // 0..1，悬停时缓停
  var rate = 1, rateKey = 'mid';                                  // 用户选的转速档位（倍率乘在 speed 上）
  try { RATES.forEach(function (q) { if (q[0] === localStorage.getItem(SPEED_KEY)) { rateKey = q[0]; rate = q[2]; } }); } catch (e) {}
  var motion = 'sync';
  try { MOTIONS.forEach(function (q) { if (q[0] === localStorage.getItem(MOTION_KEY)) motion = q[0]; }); } catch (e) {}
  var drag = null, justDragged = false;

  /* ———— 三种样式的几何：knots 把标准半径映射到设计稿半径；orbits 为可吸附的轨道 ———— */
  var STYLES = {
    a: { name: '太极星盘', knots: [[104, 112], [119, 150], [156, 188], [172, 194]], orbits: [112, 150, 188], periods: [50, 85, 130], dirs: [1, 1, 1],
         seat: function (i) { return { k: i % 3, a: i * 67 + (i % 3) * 23 }; } },
    b: { name: '阴阳昼夜', knots: [[104, 96], [119, 130], [137.5, 164], [156, 198], [172, 200]], orbits: [96, 130, 164, 198], periods: [60, 80, 105, 135], dirs: [1, -1, 1, -1],
         seat: function (i) { var k = [0, 1, 1, 2, 2, 3][i % 6]; return { k: k, a: i * 61 + k * 30 }; } },
    c: { name: '浑天仪', knots: [[104, 118], [119, 162], [156, 204], [172, 210]], orbits: [118, 162, 204], periods: [45, 70, 100], dirs: [1, 1, 1],
         ry: [44, 60, 78], tilt: [-20, 15, -5], ellipse: true, meridian: { rx: 34, ry: 204, period: 90 },
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
  // 同步模式下某条轨道上的公转相位：内圈快、外圈慢；乙样式一顺一逆
  function phaseAt(d) {
    var T = interp(S.orbits, S.periods, d);
    return ((S.dirs[nearest(d)] * clock * 360 / T) % 360 + 360) % 360;
  }
  /* 运行模式：第 i 个节点、本位半径 d（设计稿单位）此刻的偏移 —— da 角度偏移、dd 半径偏移、dir 运动方向（0 = 往复）
     偏移只取决于 i、d 和时钟，与本位角度无关，所以拖动松手时可以反推本位 */
  function moved(i, d, mer) {
    var t = clock, w, sd = style === 'b' ? S.dirs[nearest(d)] : 1;   // 乙：主旋转方向跟随轨道箭头（阳顺阴逆）
    switch (motion) {
      case 'breath':     // 半径 ±20、8 秒一呼吸，相邻相位差 0.7；公转一圈 120 秒。贴近内外界时收窄幅度，不出罗盘
        var lo = Math.max(dMin() - 8, d - 20), hi = Math.min(mer ? S.meridian.ry : dMax(), d + 20);
        return { da: norm(sd * t * 3), dd: (lo + hi) / 2 - d + (hi - lo) / 2 * Math.sin(2 * Math.PI * t / 8 - i * .7), dir: sd };
      case 'kepler':     // 开普勒：周期 = 24 秒 ×（d / 96）^1.5
        return { da: norm(sd * t * 360 / (24 * Math.pow(d / 96, 1.5))), dd: 0, dir: sd };
      case 'tide':       // 倍率在 0.12～1.6 间 30 秒一周涨落（这里是它的积分）；外圈稍慢
        w = 2 * Math.PI * t / 30;
        return { da: norm(sd * 360 / 70 * (.86 * t - .74 * 30 / (2 * Math.PI) * Math.sin(w)) * interp([dMin(), dMax()], [1, .65], d)), dd: 0, dir: sd };
      case 'duet':       // 相邻节点一顺一逆，50 秒一圈（乙：顺行的那个跟随轨道箭头，逆行的反之）
        w = (i % 2 ? -1 : 1) * sd;
        return { da: norm(w * t * 360 / 50), dd: 0, dir: w };
      case 'pendulum':   // 本位 ±28°、8 秒一摆、相位错开 90°；本位每分钟漂移 6°
        return { da: norm(sd * t * .1 + 28 * Math.sin(2 * Math.PI * t / 8 - i * Math.PI / 2)), dd: 0, dir: 0, home: norm(sd * t * .1) };
    }
    if (mer) return { da: norm(clock * 360 / S.meridian.period), dd: 0, dir: 1 };   // 子午圈按自己的周期绕行
    return { da: phaseAt(d), dd: 0, dir: S.dirs[nearest(d)] };
  }
  // 各模式在 ×1 时的峰值角速度（度 / 秒），「极快」按它封顶
  function peak() {
    switch (motion) {
      case 'breath': return 3;
      case 'kepler': return 360 / (24 * Math.pow(dMin() / 96, 1.5));
      case 'tide': return 1.6 * 360 / 70;
      case 'duet': return 360 / 50;
      case 'pendulum': return 28 * 2 * Math.PI / 8 + .1;
    }
    return 360 / Math.min.apply(null, S.periods);
  }
  function rateNow() { return rateKey === 'max' ? Math.min(rate, PEAK_CAP / peak()) : rate; }
  // 浑天仪：半径 d 处的椭圆（rx = d，ry 与倾角按轨道插值）；mer = 子午圈，d 是它的竖半轴，横半轴按比例缩
  function shape(d, mer) {
    if (mer && S.meridian) return { rx: S.meridian.rx * d / S.meridian.ry, ry: d, tilt: 0 };
    if (!S.ellipse) return { rx: d, ry: d, tilt: 0 };
    var ratio = interp(S.orbits, S.ry.map(function (y, i) { return y / S.orbits[i]; }), d);
    return { rx: d, ry: d * ratio, tilt: interp(S.orbits, S.tilt, d) };
  }
  // 屏幕角度（0=上，顺时针）+ 设计稿半径 → 坐标（设计稿单位，原点在中心）与纵深
  // 子午圈是竖着的环：右半在前、左半在后，上下两极在侧面
  function point(ang, d, mer) {
    if (!S.ellipse) { var t = ang * Math.PI / 180; return { x: Math.sin(t) * d, y: -Math.cos(t) * d, depth: 0 }; }
    var e = shape(d, mer), th = (ang - 90) * Math.PI / 180, tl = e.tilt * Math.PI / 180;
    var x = e.rx * Math.cos(th), y = e.ry * Math.sin(th);
    return { x: x * Math.cos(tl) - y * Math.sin(tl), y: x * Math.sin(tl) + y * Math.cos(tl), depth: mer ? Math.cos(th) : Math.sin(th) };
  }

  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function nodeEls() { return box.querySelectorAll('.map-node'); }
  function baseOf(n, i) {
    var st = S.seat(i);
    return { a: typeof n.a === 'number' ? n.a : st.a, r: typeof n.r === 'number' ? n.r : toR(S.orbits[st.k]), mer: isMer(n) };
  }
  function isMer(n) { return !!(S.meridian && n && n.o === 'm'); }
  function homeD(b) { return b.mer ? S.meridian.ry : toD(b.r); }      // 本位半径（设计稿单位）；子午圈上取它的竖半轴
  function norm(a) { return (a % 360 + 360) % 360; }

  // 把节点摆到屏幕角度 ang、设计稿半径 d 处（不含公转相位）
  function placeAt(el, ang, d, mer) {
    var p = point(ang, d, mer);
    el.style.left = (50 + p.x / D * 100) + '%';
    el.style.top = (50 + p.y / D * 100) + '%';
    if (S.ellipse) {
      // 转到后方变小变淡、被太极球遮住；前方变大
      var f = (p.depth + 1) / 2, pole = mer ? 1 - .16 * (1 - p.depth * p.depth) : 1;   // 子午圈两极再缩一点，不压外圈和上 / 下字
      el.style.setProperty('--k', ((.74 + .26 * f) * pole).toFixed(3));
      el.style.setProperty('--dop', (.5 + .5 * f).toFixed(2));
      el.classList.toggle('is-front', p.depth > 0);
      el.classList.toggle('is-back', p.depth <= 0);
    }
    if (style === 'b') {
      el.style.setProperty('--out', norm(ang).toFixed(1) + 'deg');      // 背光面朝外
      el.classList.toggle('is-night', norm(ang - art.wash) < 180);      // 进入大阴阳鱼的深色半边
    }
  }
  function place(el, i, a, r) { var d = toD(r), m = moved(i, d); m.ang = a + m.da; m.d = d + m.dd; placeAt(el, m.ang, m.d); return m; }

  /* ———— 罗盘底图（SVG，按样式重建） ———— */
  var art = { layers: [], wash: 0, frame: null, trails: null, deco: null };
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
    svg('ellipse', { rx: S.meridian.rx, ry: S.meridian.ry, fill: 'none', stroke: INK, 'stroke-opacity': .22 }, s);   // 子午圈（可吸附）
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
    art.deco = svg('g', {}, layer('deco'));
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

  /* ———— 罗盘右侧靠下的竖排停靠栏：样式切换（甲 乙 丙）+ 运行模式按钮 + 转速按钮 ———— */
  var dock = map.querySelector('.compass-dock');
  if (!dock) { dock = document.createElement('div'); dock.className = 'compass-dock'; map.appendChild(dock); }
  var switcher = map.querySelector('.compass-switch');
  if (!switcher) {
    switcher = document.createElement('div');
    switcher.className = 'compass-switch';
    switcher.setAttribute('role', 'radiogroup');
    switcher.setAttribute('aria-label', '罗盘样式');
    switcher.innerHTML = ORDER.map(function (k, i) {
      return '<button type="button" role="radio" data-compass="' + k + '" title="' + '甲乙丙'[i] + ' · ' + STYLES[k].name + '"><b>' + '甲乙丙'[i] + '</b><small>' + STYLES[k].name.slice(0, 2) + '</small></button>';
    }).join('');
  }
  dock.appendChild(switcher);
  // 运行模式、转速各一个按钮：点击（或回车 / 空格）切到下一档，↑ / ← 回上一档
  function cycler(cls, label, list, cur, set) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'compass-cycle ' + cls;
    b.innerHTML = '<small>' + label + '</small><b></b>';
    b.addEventListener('click', function () { step(1); });
    b.addEventListener('keydown', function (e) {
      var k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!k) return;
      e.preventDefault(); step(k);
    });
    function step(k) {
      var keys = list.map(function (q) { return q[0]; });
      set(keys[(keys.indexOf(cur()) + k + keys.length) % keys.length]);
    }
    dock.appendChild(b);
    return b;
  }
  var mover = cycler('compass-motion', '运行', MOTIONS, function () { return motion; }, setMotion);
  var speeder = cycler('compass-speed', '转速', RATES, function () { return rateKey; }, setRate);
  function markMotion() {
    MOTIONS.forEach(function (q, i) {
      if (q[0] !== motion) return;
      mover.querySelector('b').textContent = q[1];
      mover.dataset.motion = q[0];
      mover.title = '运行模式：' + q[2] + '\n点击切换到「' + MOTIONS[(i + 1) % MOTIONS.length][1] + '」';
      mover.setAttribute('aria-label', '运行模式：' + q[1] + '，点击切换');
    });
    map.dataset.motion = motion;
  }
  function setMotion(key) {
    motion = key;
    try { localStorage.setItem(MOTION_KEY, key); } catch (e) {}
    markMotion();
    addAng = null;
    layout();
  }
  function markRate() {
    RATES.forEach(function (q, i) {
      if (q[0] !== rateKey) return;
      speeder.querySelector('b').textContent = q[1];
      speeder.dataset.rate = q[0];
      speeder.title = '公转转速：' + (q[2] ? q[1] + (q[0] === 'max' ? '（峰值不超过 ' + PEAK_CAP + '°/秒）' : '（×' + q[2] + '）') : '停') + '\n点击切换到「' + RATES[(i + 1) % RATES.length][1] + '」';
      speeder.setAttribute('aria-label', '公转转速：' + q[1] + '，点击切换');
    });
  }
  function setRate(key) {
    RATES.forEach(function (q) { if (q[0] === key) { rateKey = key; rate = q[2]; } });
    try { localStorage.setItem(SPEED_KEY, rateKey); } catch (e) {}
    markRate();
  }
  markRate();
  markMotion();
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
      // 副标题（如「热量·碳脂比·断食」）字已经很小，不再缩：放不下就只留前几段，全文放进悬停提示
      var s = el.querySelector('small'); if (!s) return;
      var full = n.s == null ? s.textContent : String(n.s), parts = full.split(/\s*[·・、，,/]\s*/), k = parts.length;
      s.textContent = full;
      while (k > 1 && s.scrollWidth > room + 4) s.textContent = parts.slice(0, --k).join('·') + (k < parts.length ? '…' : '');
      if (s.scrollWidth > room + 4) { s.style.maxWidth = room + 'px'; s.style.overflow = 'hidden'; s.style.textOverflow = 'ellipsis'; }
      if (s.textContent !== full) el.title = n.t + ' · ' + full + '\n' + el.title;
    });
    // 甲：每个节点后面拖一小段墨色轨迹
    if (art.trails) {
      art.trails.textContent = '';
      nodeEls().forEach(function () { svg('circle', { fill: 'none', stroke: TEAL, 'stroke-width': 2.2, 'stroke-opacity': .35, 'stroke-linecap': 'round' }, art.trails); });
    }
    layout();
  }
  /* 节点避让（星轨 / 潮汐 / 对转 / 摆荡）：两个节点在屏幕上近到不足一个直径时，内侧的往里、外侧的往外各让一点；
     目标偏移只按「未避让的位置」算，再逐帧缓动过去，所以不会跳，也不会来回抖。只改显示位置，不改数据、不影响拖动反推 */
  var off = [], offA = [], AVOID_MAX = 24, AVOID_ANG = 9;
  function nodeSize() { return 54 * D / (map.clientWidth || 435); }        // 节点直径（设计稿单位）
  function avoid(ms, dt) {
    var need = nodeSize() * 1.04, tgt = ms.map(function () { return 0; }), tga = tgt.slice();
    if (motion !== 'sync' && motion !== 'breath') {
      for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
        var p = ms[i], q = ms[j]; if (!p || !q) continue;
        var dist = Math.hypot(p.x - q.x, p.y - q.y); if (dist >= need) continue;
        var amt = Math.min(AVOID_MAX, (need - dist) / 2 + 2), inI = p.d < q.d || (p.d === q.d && i < j);
        tgt[i] += inI ? -amt : amt; tgt[j] += inI ? amt : -amt;
        // 再沿轨道前后各让几度（浑天仪的扁椭圆在交叉处光靠半径错不开）：角度在前的稍往前、在后的稍往后
        var aw = Math.min(AVOID_ANG, (need - dist) / need * AVOID_ANG * 1.5), ahead = norm(p.ang - q.ang + 180) - 180 >= 0;
        tga[i] += ahead ? aw : -aw; tga[j] += ahead ? -aw : aw;
      }
    }
    ms.forEach(function (m, i) {
      if (!m) { off[i] = 0; offA[i] = 0; return; }
      var g = Math.max(-AVOID_MAX, Math.min(AVOID_MAX, tgt[i]));
      g = m.mer ? Math.max(S.meridian.ry - 30, Math.min(S.meridian.ry, m.d + g)) - m.d     // 子午圈：只往里让，两极不顶出罗盘
                : Math.max(dMin() - 6, Math.min(dMax() + 6, m.d + g)) - m.d;   // 不出罗盘、不压中心
      off[i] = dt == null || off[i] == null ? g : off[i] + (g - off[i]) * Math.min(1, dt * 4);
      m.d += off[i];
      var ga = Math.max(-AVOID_ANG, Math.min(AVOID_ANG, tga[i]));
      offA[i] = dt == null || offA[i] == null ? ga : offA[i] + (ga - offA[i]) * Math.min(1, dt * 3);
      m.ang += offA[i];
    });
  }
  function layout(dt) {
    var d = domains[active]; if (!d) return;
    if (art.frame) art.frame(clock);
    var trails = art.trails ? art.trails.children : [], els = nodeEls(), ms = [];
    els.forEach(function (el, i) {
      var n = d.nodes[i]; if (!n) return;
      if (drag && drag.el === el) { off[i] = 0; return; }
      var b = baseOf(n, i), hd = homeD(b), m = moved(i, hd, b.mer); m.home0 = b.a; m.mer = b.mer;
      m.ang = b.a + m.da; m.d = hd + m.dd; var p = point(m.ang, m.d, m.mer); m.x = p.x; m.y = p.y;
      ms[i] = m;
    });
    avoid(ms, dt);
    els.forEach(function (el, i) {
      var m = ms[i], tr = trails[i];
      if (!m) { if (tr) tr.setAttribute('stroke-opacity', 0); return; }
      placeAt(el, m.ang, m.d, m.mer); var p = point(m.ang, m.d, m.mer); m.x = p.x; m.y = p.y;
      el.classList.toggle('is-yin', motion === 'duet' && m.dir < 0);
      if (tr) {
        // 墨色轨迹拖在运动方向的后面；摆荡模式不画，星轨模式改用渐淡尾迹（见 deco）
        var C = 2 * Math.PI * m.d;
        tr.setAttribute('r', m.d.toFixed(1));
        tr.setAttribute('stroke-dasharray', (C * 34 / 360).toFixed(1) + ' ' + C.toFixed(1));
        tr.setAttribute('stroke-opacity', m.dir && motion !== 'kepler' ? .35 : 0);
        tr.setAttribute('transform', 'rotate(' + (m.ang - 90 - (m.dir < 0 ? 0 : 34)).toFixed(2) + ')');
      }
    });
    drawDeco(ms);
    var add = box.querySelector('.map-add');
    if (!add) return;
    if (motion === 'sync') { place(add, -1, gapAngle(d), R_HOME / VIEW); return; }
    // 其它模式下节点快慢不一：「新增」在默认轨道上找离所有节点（含拖动中的）最远的位置，缓缓滑过去；
    // 当前位置仍够宽敞就不挪，免得来回追
    var R0 = toD(R_HOME / VIEW), need = nodeSize() * 1.15, pts = ms.filter(Boolean);
    if (drag && drag.pos) pts.push(point(drag.pos.a, drag.pos.d, drag.pos.mer));
    var zone = centerZone(add);
    var clear = function (a) {
      var q = point(a, R0), c = Infinity; pts.forEach(function (p) { c = Math.min(c, Math.hypot(p.x - q.x, p.y - q.y)); });
      // 中心领域名当作禁区：按钮与名称框有交叠就算不可用
      if (zone && q.x > zone.l && q.x < zone.r && q.y > zone.t && q.y < zone.b) c = -1;
      return c;
    };
    if (addAng == null || clear(addAng) < need) {
      var best = addAng == null ? 0 : addAng, bc = -1;
      for (var g = 0; g < 360; g += 4) { var c = clear(g) - (addAng == null ? 0 : Math.abs(norm(g - addAng + 180) - 180) * .05); if (c > bc) { bc = c; best = g; } }
      addGoal = best;
      if (addAng == null) addAng = best;
    }
    addAng += (norm(addGoal - addAng + 180) - 180) * Math.min(1, (dt || .016) * 6);
    placeAt(add, addAng, R0);
  }
  var addAng = null, addGoal = 0, zoneKey = '', zoneVal = null;
  // 中心领域名的范围（设计稿单位，已按「新增」按钮半径外扩）；样式、宽度、名称不变就复用
  function centerZone(add) {
    var b = map.querySelector('.map-center b'); if (!b) return null;
    var key = style + '|' + map.clientWidth + '|' + b.textContent;
    if (key === zoneKey) return zoneVal;
    var mr = map.getBoundingClientRect(), r = b.getBoundingClientRect(), k = D / (mr.width || 1), h = (add.offsetWidth || 40) / 2 + 4;
    zoneKey = key;
    zoneVal = r.width ? { l: (r.left - mr.left - h) * k - D / 2, r: (r.right - mr.left + h) * k - D / 2, t: (r.top - mr.top - h) * k - D / 2, b: (r.bottom - mr.top + h) * k - D / 2 } : null;
    return zoneVal;
  }

  /* ———— 运行模式的装饰（SVG，水墨淡笔，pointer-events:none）：每种样式重建一次图层，切模式时清空重画 ————
     呼吸：中心气环随呼吸胀缩 + 吸 / 呼；星轨：渐淡墨色尾迹 + 近乎一线时的朱砂细虚线；
     潮汐：外圈小月亮标潮相 + 盘面淡青水色；对转：阴阳两节点相遇时的朱砂细线；摆荡：细杆 + 摆幅弧 */
  var CORE = { a: [70, -104], b: [68, 84], c: [60, -70] };   // 各样式中心气环半径、吸 / 呼字的 y
  var deco = { mode: null, n: -1, g: null, parts: {} };
  function buildDeco(n) {
    var g = art.deco; if (!g) return;
    g.textContent = ''; deco = { mode: motion, n: n, style: style, g: g, parts: {} };
    var P = deco.parts, k;
    if (motion === 'breath') {
      P.ring = svg('circle', { fill: 'none', stroke: TEAL, 'stroke-width': 1.2, 'stroke-opacity': .35 }, g);
      P.ring2 = svg('circle', { fill: 'none', stroke: TEAL, 'stroke-width': 5, 'stroke-opacity': .06 }, g);
      P.word = txt(g, '吸', { y: CORE[style][1] + 3, 'font-size': 9.5, fill: TEAL, 'fill-opacity': .6, 'letter-spacing': '.1em' });
    } else if (motion === 'kepler') {
      P.tails = [];
      for (k = 0; k < n; k++) { var seg = []; for (var j = 0; j < 7; j++) seg.push(svg('path', { fill: 'none', stroke: INK, 'stroke-linecap': 'round', 'stroke-width': 2.4 - j * .25, 'stroke-opacity': (.22 * (1 - j / 7)).toFixed(3) }, g)); P.tails.push(seg); }
      P.lines = [0, 1, 2].map(function () { return svg('line', { stroke: RED, 'stroke-width': .9, 'stroke-dasharray': '2 3', 'stroke-opacity': 0 }, g); });
    } else if (motion === 'tide') {
      P.water = svg('circle', { r: 225, fill: TEAL, 'fill-opacity': 0 }, g);
      var m = P.moon = svg('g', { transform: 'translate(' + pt(45, 236).join(' ') + ')' }, g);
      svg('circle', { r: 11, fill: PAPER, 'fill-opacity': .55 }, m);                                       // 淡淡的月晕
      svg('circle', { r: 7.5, fill: '#2b3b38', 'fill-opacity': .32 }, m);                                  // 暗面：淡墨
      P.lit = svg('path', { fill: '#fbf8f0' }, m);                                                           // 亮面：纸白
      svg('circle', { r: 7.5, fill: 'none', stroke: INK, 'stroke-width': .7, 'stroke-opacity': .55 }, m);
      P.phase = txt(m, '', { y: 21, 'font-size': 8, fill: '#626964' });
    } else if (motion === 'duet') {
      P.links = [];
      for (k = 0; k < n * (n - 1) / 2; k++) P.links.push(svg('line', { stroke: RED, 'stroke-width': 1, 'stroke-linecap': 'round', 'stroke-opacity': 0 }, g));
    } else if (motion === 'pendulum') {
      P.rods = []; P.arcs = [];
      for (k = 0; k < n; k++) {
        P.arcs.push(svg('path', { fill: 'none', stroke: INK, 'stroke-width': 1, 'stroke-opacity': .38, 'stroke-dasharray': '2 3' }, g));
        P.rods.push(svg('line', { stroke: INK, 'stroke-width': 1, 'stroke-opacity': .4 }, g));
      }
    }
  }
  function arcPath(a0, a1, d, mer) {
    var s = '', n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 3));
    for (var k = 0; k <= n; k++) { var p = point(a0 + (a1 - a0) * k / n, d, mer); s += (k ? 'L' : 'M') + p.x.toFixed(1) + ',' + p.y.toFixed(1); }
    return s;
  }
  function drawDeco(ms) {
    if (!art.deco) return;
    if (deco.mode !== motion || deco.n !== ms.length || deco.style !== style || deco.g !== art.deco) buildDeco(ms.length);
    var P = deco.parts, t = clock, w, k;
    if (motion === 'breath') {
      w = 2 * Math.PI * t / 8; var R = CORE[style][0] + 4 * Math.sin(w), e = shape(R);
      [P.ring, P.ring2].forEach(function (c) { c.setAttribute('r', R.toFixed(2)); });
      P.ring.setAttribute('stroke-opacity', (.25 + .15 * Math.sin(w)).toFixed(3));
      P.word.textContent = Math.cos(w) >= 0 ? '吸' : '呼';
    } else if (motion === 'kepler') {
      ms.forEach(function (m, i) {
        var seg = P.tails[i]; if (!seg) return;
        seg.forEach(function (s, j) {
          if (!m) { s.setAttribute('d', ''); return; }
          var a0 = m.ang - m.dir * (8 + j * 5), a1 = a0 - m.dir * 5;   // 节点身后（半径约 4°）起，每段 5°
          s.setAttribute('d', arcPath(a0, a1, m.d, m.mer));
        });
      });
      // 两节点（不同半径）与中心近乎一线：中心到外侧节点画朱砂细虚线，越正越清楚
      var pairs = [];
      ms.forEach(function (p, i) { ms.forEach(function (q, j) { if (!p || !q || j <= i || Math.abs(p.d - q.d) < 20) return; var df = Math.abs(norm(p.ang - q.ang + 180) - 180); if (df < 7) pairs.push([df, p.d > q.d ? p : q, p.d > q.d ? q : p]); }); });
      pairs.sort(function (x, y) { return x[0] - y[0]; });
      P.lines.forEach(function (l, k) {
        var pr = pairs[k]; if (!pr) { l.setAttribute('stroke-opacity', 0); return; }
        var o = pr[1], s0 = point(o.ang, CORE[style][0] + 4);
        l.setAttribute('x1', s0.x.toFixed(1)); l.setAttribute('y1', s0.y.toFixed(1));
        l.setAttribute('x2', o.x.toFixed(1)); l.setAttribute('y2', o.y.toFixed(1));
        l.setAttribute('stroke-opacity', (.6 * (1 - pr[0] / 7)).toFixed(3));
      });
    } else if (motion === 'tide') {
      // 潮相 p：0 = 朔（退潮最低）→ .5 = 望（涨潮最高），与 moved() 里的 30 秒涨落同步
      var ph = ((t / 30) % 1 + 1) % 1, f = (1 - Math.cos(2 * Math.PI * ph)) / 2;
      P.water.setAttribute('fill-opacity', (.012 + .05 * f).toFixed(4));
      var r = 7.5, c = Math.cos(2 * Math.PI * ph), rx = (r * Math.abs(c)).toFixed(2), wax = ph < .5;
      // 亮面 = 亮侧半圆 + 明暗交界的半椭圆；新月 / 残月时交界线凸向亮侧，盈凸 / 亏凸时凸向暗侧
      P.lit.setAttribute('d', f < .004 ? '' : 'M0,' + -r + 'A' + r + ' ' + r + ' 0 0 ' + (wax ? 1 : 0) + ' 0,' + r +
        'A' + rx + ' ' + r + ' 0 0 ' + ((c > 0) === wax ? 0 : 1) + ' 0,' + -r + 'Z');
      P.phase.textContent = ph < .0625 || ph >= .9375 ? '朔' : ph < .4375 ? '上弦' : ph < .5625 ? '望' : '下弦';
    } else if (motion === 'duet') {
      var near = nodeSize() * 1.9, idx = 0;
      for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
        var l = P.links[idx++], p = ms[i], q = ms[j]; if (!l) continue;
        var dist = p && q && p.dir !== q.dir ? Math.hypot(p.x - q.x, p.y - q.y) : Infinity;
        if (dist >= near) { l.setAttribute('stroke-opacity', 0); continue; }
        l.setAttribute('x1', p.x.toFixed(1)); l.setAttribute('y1', p.y.toFixed(1));
        l.setAttribute('x2', q.x.toFixed(1)); l.setAttribute('y2', q.y.toFixed(1));
        l.setAttribute('stroke-opacity', (.65 * Math.min(1, (near - dist) / (near * .5))).toFixed(3));
      }
    } else if (motion === 'pendulum') {
      ms.forEach(function (m, i) {
        var rod = P.rods[i], arc = P.arcs[i]; if (!rod) return;
        if (!m) { rod.setAttribute('stroke-opacity', 0); arc.setAttribute('d', ''); return; }
        var s0 = point(m.ang, CORE[style][0] + 4), h = m.home0 + m.home;
        rod.setAttribute('x1', s0.x.toFixed(1)); rod.setAttribute('y1', s0.y.toFixed(1));
        rod.setAttribute('x2', m.x.toFixed(1)); rod.setAttribute('y2', m.y.toFixed(1)); rod.setAttribute('stroke-opacity', .4);
        arc.setAttribute('d', arcPath(h - 28, h + 28, m.d, m.mer));
      });
    }
  }

  // 「新增」放在默认轨道上最空的那段弧中间
  function gapAngle(d) { return gapOf(d.nodes.map(function (n, i) { return norm(baseOf(n, i).a); })); }
  function gapOf(as) {
    as = as.slice().sort(function (x, y) { return x - y; });
    if (!as.length) return 0;
    var best = 0, at = 0;
    as.forEach(function (a, k) { var nx = k + 1 < as.length ? as[k + 1] : as[0] + 360; if (nx - a > best) { best = nx - a; at = a + best / 2; } });
    return at;
  }

  /* ———— 悬停减速 ————
     旧做法：pointerenter 置 0、pointerleave 置 1。指针只要停在罗盘方框里（哪怕是空白角落）就一直不转；
     切走标签页、窗口失焦时浏览器又常常不补发 pointerleave，回来后就永远停着。
     现在每帧按「最近一次指针位置」现算：只有指针压在节点 / 新增上、且 HOVER_HOLD 内动过，才减速停下 */
  var HOVER_PAD = 10, HOVER_HOLD = 4000;   // 节点外扩的感应距离（px）、指针静止多久后恢复公转（ms）
  var ptr = null;                          // { x, y, at }：最近一次鼠标 / 触控笔位置
  addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') return;
    ptr = { x: e.clientX, y: e.clientY, at: performance.now() };
    // 按住时丢了 pointerup（例如在窗口外松手）：再动时发现键已松开，就当拖动取消
    if (drag && !e.buttons) cancelDrag();
  }, true);
  function forget() { ptr = null; cancelDrag(); }
  document.documentElement.addEventListener('mouseleave', function () { ptr = null; });
  addEventListener('blur', forget);
  document.addEventListener('visibilitychange', function () { if (document.hidden) forget(); last = 0; });
  function hovering(now) {
    if (!ptr || now - ptr.at > HOVER_HOLD) return false;
    var els = box.querySelectorAll('.map-node, .map-add');
    for (var i = 0; i < els.length; i++) {
      var r = els[i].getBoundingClientRect();
      if (ptr.x > r.left - HOVER_PAD && ptr.x < r.right + HOVER_PAD && ptr.y > r.top - HOVER_PAD && ptr.y < r.bottom + HOVER_PAD) return true;
    }
    return false;
  }
  function paused(now) {
    if (reduce.matches || (drag && drag.moved)) return true;
    var cl = document.getElementById('cardLayer');
    if (cl && cl.classList.contains('is-open')) return true;
    return hovering(now);
  }

  var last = 0, saved = 0, failed = false;
  function saveClock() { try { localStorage.setItem(PHASE_KEY, clock.toFixed(2)); } catch (e) {} }
  function tick(now) {
    requestAnimationFrame(tick);             // 先排下一帧：这一帧哪怕抛错，公转也不会断
    var dt = last && now > last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    try {
      // 停下要快（档位高时缓停期间节点会滑出指针），起步慢一些
      var hold = paused(now);
      speed += ((hold ? 0 : 1) - speed) * Math.min(1, dt * (hold ? 15 * Math.max(1, rate) / 2.5 : 3));
      if (!(speed >= 0 && speed <= 1)) speed = 0;
      // speed 管悬停缓停（0..1），rate 是用户选的档位；「停」时 rate=0，时钟不走、节点和底图都不动
      var rn = rateNow();
      if (speed * rn > .001) { clock += speed * rn * dt; layout(dt); }
    } catch (err) {
      if (!failed) { failed = true; console.error('[orbit] tick', err); }
    }
    if (now - saved > 10000) { saved = now; saveClock(); }
  }
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
      // 吸附到轨道 / 指针跑出最外圈时，fit 给的角度会偏离指针很远（椭圆很扁）：改取椭圆上离指针最近的点
      for (var g = 0, near = Infinity, a0 = a; g < 360; g += 2) {
        var q = point(a0 + g, d), dist = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y);
        if (dist < near) { near = dist; a = a0 + g; }
      }
    }
    // 丙：竖直子午圈 —— 指针离它（屏幕距离）在 SNAP 内、且比离吸附到的椭圆轨道更近，就吸到子午圈上
    if (S.meridian) {
      var M = S.meridian, mb = Infinity, ma = 0, od = snapped ? Math.hypot(point(a, d).x - x, point(a, d).y - y) : Infinity;
      for (var h = 0; h < 360; h += 1) { var mp = point(h, M.ry, true), md = Math.hypot(mp.x - x, mp.y - y); if (md < mb) { mb = md; ma = h; } }
      for (var h2 = ma - 1; h2 <= ma + 1; h2 += .1) { var mp2 = point(h2, M.ry, true), md2 = Math.hypot(mp2.x - x, mp2.y - y); if (md2 < mb) { mb = md2; ma = h2; } }
      if (mb < SNAP && mb < od) return { a: ma, d: M.ry, r: toR(M.ry), ring: M.ry, mer: true };
    }
    return { a: a, d: d, r: toR(d), ring: snapped };
  }
  function trace(d, ring, mer) {
    var g = map.querySelector('.orbit-trace');
    if (!g) { g = document.createElement('i'); g.className = 'orbit-trace'; map.appendChild(g); }
    if (d == null) { g.remove(); return; }
    var e = shape(d, mer);
    g.style.width = (e.rx * 2 / D * 100) + '%';
    g.style.height = (e.ry * 2 / D * 100) + '%';
    g.style.transform = 'translate(-50%,-50%) rotate(' + e.tilt + 'deg)';
    g.classList.toggle('on-ring', !!ring);
  }

  addEventListener('pointerdown', function () { justDragged = false; }, true);
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
      drag.moved = true;
      try { drag.el.setPointerCapture(drag.id); } catch (er) {}
      drag.el.classList.add('is-dragging'); map.classList.add('is-dragging');
    }
    e.preventDefault();
    var p = toPolar(e); drag.pos = p;
    placeAt(drag.el, p.a, p.d, p.mer);
    trace(p.d, p.ring, p.mer);
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
    ptr = null;               // 松手处正压着刚放下的节点：指针再动之前不算悬停，放下就接着转
    dr.el.classList.remove('is-dragging'); map.classList.remove('is-dragging');
    trace(null);
    justDragged = true; setTimeout(function () { justDragged = false; }, 0);
    if (dr.dom) {
      dr.dom.classList.remove('is-drop'); dr.el.classList.remove('is-leaving');
      if (!moveNode(dr.i, +dr.dom.dataset.i)) layout();
      return;
    }
    var n = domains[active].nodes[dr.i];
    if (n && dr.pos) {
      // 同领域其它节点也落定当前位置，之后增删节点不会让它们跳位
      domains[active].nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = norm(b.a); m.r = b.r; });
      // 松手处就是屏幕上的位置：扣掉运行模式此刻的偏移，反推本位（吸附到轨道时本位就是那条轨道）
      var hd = dr.pos.d, mer = !!dr.pos.mer;
      if (!dr.pos.ring) hd = Math.max(dMin(), Math.min(dMax(), hd - moved(dr.i, hd).dd));
      n.a = Math.round(norm(dr.pos.a - moved(dr.i, hd, mer).da) * 10) / 10;
      n.r = Math.round(toR(hd) * 10000) / 10000;
      if (mer) n.o = 'm'; else delete n.o;
      saveDomains();
    }
    layout();
  }
  // 拖动被打断（丢了 pointerup、窗口失焦、切后台）：放弃这次拖动，节点回原位继续公转
  function cancelDrag() {
    if (!drag) return;
    var dr = drag; drag = null;
    if (!dr.moved) return;
    dr.el.classList.remove('is-dragging', 'is-leaving'); map.classList.remove('is-dragging');
    justDragged = true;       // 回来松手时浏览器补发的 click 不要打开卡片（下一次按下时清掉）
    if (dr.dom) dr.dom.classList.remove('is-drop');
    trace(null);
    layout();
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
    var b = baseOf(n, i), shown = b.a + moved(i, homeD(b), b.mer).da;
    if (e.key === 'ArrowLeft') shown -= 5; else if (e.key === 'ArrowRight') shown += 5;
    else { b.r = Math.max(R_MIN / VIEW, Math.min(R_MAX / VIEW, b.r + (e.key === 'ArrowUp' ? 1 : -1) * 4 / VIEW)); b.mer = false; delete n.o; }   // 换内外即离开子午圈
    n.a = Math.round(norm(shown - moved(i, homeD(b), b.mer).da) * 10) / 10; n.r = Math.round(b.r * 10000) / 10000;
    e.preventDefault(); saveDomains(); layout();
  });

  var _render = renderAll;
  renderAll = function () { _render(); decorate(); };
  applyStyle(style);
  decorate();
  requestAnimationFrame(tick);
})();
