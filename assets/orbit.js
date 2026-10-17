/* 罗盘：三种样式（甲 太极星盘 / 乙 阴阳昼夜 / 丙 浑天仪）+ 节点公转 + 鼠标拖动定位
   - 节点位置用极坐标保存在节点上：a 角度（度，上方为 0，顺时针），r 半径（占 435 罗盘边长的比例）
     r 的取值范围、含义与旧版完全一致（0.239～0.395，0.2736 / 0.3586 为两条吸附环）；
     每种样式把这段「标准半径」映射到自己的轨道上，所以切换样式不会改写数据
   - 节点按所在轨道公转，内快外慢；鼠标压在节点上时减速停下，方便点击（指针静止几秒后自动恢复）
   - 拖动节点到新位置，靠近轨道时自动吸附；松手即保存。拖动中罗盘右上角显示读数（轨道、本位角度、与同轨前后节点的间距）；
     Shift 精细（指针角度位移 ×1/4）、Alt 整步吸附（5°）、靠近其它节点的同角 / 对向 / 同轨等分时朱砂辅助线 + 轻微磁吸（Ctrl / Cmd 暂时关闭）；
     拖动时公转时钟冻结，节点按「本位」角度（扣掉运行模式的偏移）计算，读数即保存值，松手不跳
   - 键盘：聚焦节点后 ←/→ ±1°、Shift ±0.1°、Alt ±5°；Shift+↑/↓ 换内外
   - 运行模式（同步 / 呼吸 / 星轨 / 潮汐 / 对转 / 摆荡，design/orbit-motion-options.html）与底图样式互相独立，可任意组合
   - 丙（浑天仪）的竖直子午圈也是一条可吸附轨道：在它上面的节点额外存 o: 'm'（a 为椭圆上的角度，r 仍是外圈的标准半径），
     旧数据没有 o，位置不变；甲、乙忽略 o，照 a / r 摆
   - 底图、运行模式、转速、各轨道方向按领域各自保存在 localStorage「kongwo-compass-prefs」：{ 领域 id: { style, motion, speed, dirs: { a: [..], b: [..], c: [.., 子午圈] } } }；
     领域没有自己的设置时沿用旧的全局值「kongwo-compass-style / -speed / -motion」（只读不再写），再没有就用默认值；
     领域 id 存在领域数据的 id 上，第一次改设置时才生成 */
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
  var PREFS_KEY = 'kongwo-compass-prefs';
  /* 转速档位：键、字、倍率。倍率乘在公转时钟上，时钟 1 秒 = 设计稿（orbit-motion-options.html）滑块 ×1 时的 1 秒；
     「快」= 中 ×2；「极快」名义 ×5，但按模式封顶：节点峰值角速度不超过 PEAK_CAP（见 rateNow）。旧版存的键名不变，直接沿用 */
  var RATES = [['slow', '慢', .5], ['mid', '中', 1], ['fast', '快', 2], ['max', '极快', 5], ['stop', '停', 0]];
  var PEAK_CAP = 60;                    // 度 / 秒
  /* 运行模式：键、按钮上的字、完整说明、面板里的简短说明 */
  var MOTIONS = [
    ['sync', '同步', '同步旋转（原样）：节点按底图的轨道公转，内快外慢', '随底图公转，原样'],
    ['breath', '呼吸', '壹 呼吸 · 一进一出：慢慢公转，同时沿半径一收一放，节点依次起伏', '一进一出，依次起伏'],
    ['kepler', '星轨', '贰 星轨 · 各安其位：像行星，内圈快、外圈慢（周期 ∝ 半径^1.5）', '各安其位，内快外慢'],
    ['tide', '潮汐', '叁 潮汐 · 张弛有度：整盘转速按 30 秒一周涨落，退潮时几乎停住', '张弛有度，30 秒涨落'],
    ['duet', '对转', '肆 阴阳对转 · 一顺一逆：相邻节点一顺一逆 —— 第 1、3、5 个节点按所在轨道设定的方向走，第 2、4、6 个反着走', '一顺一逆，阴阳相间'],
    ['pendulum', '摆荡', '伍 摆荡 · 傅科摆：节点在本位左右摆动，本位极慢漂移，最容易点中', '本位摆动，最易点中']
  ];
  var NS = 'http://www.w3.org/2000/svg';
  var INK = '#14211f', TEAL = '#07575a', RED = '#b64b35', PAPER = '#f0ebdf';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var clock = parseFloat(localStorage.getItem(PHASE_KEY));        // 公转时钟（秒）
  if (!isFinite(clock) || clock < 0) clock = 0;
  var speed = reduce.matches ? 0 : 1;                             // 0..1，悬停时缓停
  var rate = 1, rateKey = 'mid';                                  // 用户选的转速档位（倍率乘在 speed 上）
  var motion = 'sync';
  var dirSet = {}, curDirs = [1, -1, 1, -1];                      // 当前领域各样式的轨道方向（未设的样式用默认）；当前样式实际生效的方向
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
  // 各轨道方向：1 顺时针、-1 逆时针；丙多一项子午圈。默认甲 / 丙全顺，乙阳顺阴逆
  function defDirs() { return S.dirs.concat(S.meridian ? [1] : []); }
  function dirsOf() {
    var def = defDirs(), u = dirSet[style];
    return Array.isArray(u) && u.length === def.length ? u.map(function (v) { return v < 0 ? -1 : 1; }) : def;
  }
  function dirAt(d, mer) { return mer && S.meridian ? curDirs[S.orbits.length] : curDirs[nearest(d)]; }
  // 同步模式下某条轨道上的公转相位：内圈快、外圈慢，方向按轨道设定
  function phaseAt(d) {
    var T = interp(S.orbits, S.periods, d);
    return ((curDirs[nearest(d)] * clock * 360 / T) % 360 + 360) % 360;
  }
  /* 运行模式：第 i 个节点、本位半径 d（设计稿单位）此刻的偏移 —— da 角度偏移、dd 半径偏移、dir 运动方向（0 = 往复）
     偏移只取决于 i、d 和时钟，与本位角度无关，所以拖动松手时可以反推本位 */
  function moved(i, d, mer) {
    var t = clock, w, sd = dirAt(d, mer);   // 主旋转方向跟随所在轨道的设定（乙的轨道箭头同步显示）
    switch (motion) {
      case 'breath':     // 半径 ±20、8 秒一呼吸，相邻相位差 0.7；公转一圈 120 秒。贴近内外界时收窄幅度，不出罗盘
        var lo = Math.max(dMin() - 8, d - 20), hi = Math.min(mer ? S.meridian.ry : dMax(), d + 20);
        return { da: norm(sd * t * 3), dd: (lo + hi) / 2 - d + (hi - lo) / 2 * Math.sin(2 * Math.PI * t / 8 - i * .7), dir: sd };
      case 'kepler':     // 开普勒：周期 = 24 秒 ×（d / 96）^1.5
        return { da: norm(sd * t * 360 / (24 * Math.pow(d / 96, 1.5))), dd: 0, dir: sd };
      case 'tide':       // 倍率在 0.12～1.6 间 30 秒一周涨落（这里是它的积分）；外圈稍慢
        w = 2 * Math.PI * t / 30;
        return { da: norm(sd * 360 / 70 * (.86 * t - .74 * 30 / (2 * Math.PI) * Math.sin(w)) * interp([dMin(), dMax()], [1, .65], d)), dd: 0, dir: sd };
      case 'duet':       // 相邻节点一顺一逆，50 秒一圈：双数序号的跟随轨道方向，单数序号的反之
        w = (i % 2 ? -1 : 1) * sd;
        return { da: norm(w * t * 360 / 50), dd: 0, dir: w };
      case 'pendulum':   // 本位 ±28°、8 秒一摆、相位错开 90°；本位每分钟漂移 6°
        return { da: norm(sd * t * .1 + 28 * Math.sin(2 * Math.PI * t / 8 - i * Math.PI / 2)), dd: 0, dir: 0, home: norm(sd * t * .1) };
    }
    if (mer) return { da: norm(sd * clock * 360 / S.meridian.period), dd: 0, dir: sd };   // 子午圈按自己的周期绕行
    return { da: phaseAt(d), dd: 0, dir: sd };
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
    // 每条轨道一个小箭头标出顺逆（随方向设定更新，见 markArrows）
    art.arrows = S.orbits.map(function (r, i) { var a = 200 + i * 8, q = pt(a, r); return svg('path', { fill: 'none', stroke: i % 2 ? TEAL : INK, 'stroke-opacity': .6, transform: 'translate(' + q[0] + ' ' + q[1] + ') rotate(' + a + ')' }, s); });
    markArrows();
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
  function markArrows() { (art.arrows || []).forEach(function (p, i) { p.setAttribute('d', curDirs[i] < 0 ? 'M3,-3L-2,0L3,3' : 'M-3,-3L2,0L-3,3'); }); }

  function applyStyle(key) {
    art.layers.forEach(function (l) { l.remove(); });
    art = { layers: [], wash: 0, frame: null, trails: null };
    style = key; S = STYLES[key]; curDirs = dirsOf();
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
    savePrefs();
    markDir();
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
  // 运行模式：和「方向」一样，点开左侧小面板，列出全部模式，点一行即切换
  var mover = document.createElement('button');
  mover.type = 'button'; mover.className = 'compass-cycle compass-motion';
  mover.setAttribute('aria-haspopup', 'true'); mover.setAttribute('aria-expanded', 'false');
  mover.innerHTML = '<small>运行</small><b></b>';
  dock.appendChild(mover);
  var speeder = cycler('compass-speed', '转速', RATES, function () { return rateKey; }, setRate);
  var motionPanel = document.createElement('div');
  motionPanel.className = 'compass-dirs compass-motions'; motionPanel.hidden = true;
  motionPanel.setAttribute('role', 'listbox'); motionPanel.setAttribute('aria-label', '运行模式');
  motionPanel.innerHTML = '<p>运行模式</p>' + MOTIONS.map(function (q) {
    return '<button type="button" role="option" data-m="' + q[0] + '" title="' + q[2] + '"><span><b>' + q[1] + '</b><small>' + q[3] + '</small></span></button>';
  }).join('');
  dock.appendChild(motionPanel);
  function markMotion() {
    MOTIONS.forEach(function (q) {
      if (q[0] !== motion) return;
      mover.querySelector('b').textContent = q[1];
      mover.dataset.motion = q[0];
      mover.title = '运行模式：' + q[2] + '\n点击展开，选择运行模式';
      mover.setAttribute('aria-label', '运行模式：' + q[1] + '，点击展开');
    });
    [].forEach.call(motionPanel.querySelectorAll('[data-m]'), function (b) { b.setAttribute('aria-selected', b.dataset.m === motion ? 'true' : 'false'); });
    map.dataset.motion = motion;
  }
  function openMotions(on) {
    if (on && typeof openDirs === 'function') openDirs(false);
    motionPanel.hidden = !on; mover.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) { var cur = motionPanel.querySelector('[aria-selected="true"]'); if (cur) cur.focus(); }
  }
  mover.addEventListener('click', function () { openMotions(motionPanel.hidden); });
  mover.addEventListener('keydown', function (e) {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && motionPanel.hidden) { e.preventDefault(); openMotions(true); }
  });
  motionPanel.addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b) return;
    setMotion(b.dataset.m); openMotions(false); mover.focus();
  });
  motionPanel.addEventListener('keydown', function (e) {
    var k = { ArrowDown: 1, ArrowUp: -1 }[e.key]; if (!k) return;
    e.preventDefault();
    var bs = [].slice.call(motionPanel.querySelectorAll('[data-m]')), i = bs.indexOf(document.activeElement);
    bs[(i < 0 ? 0 : i + k + bs.length) % bs.length].focus();
  });
  document.addEventListener('pointerdown', function (e) { if (!motionPanel.hidden && !motionPanel.contains(e.target) && !mover.contains(e.target)) openMotions(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !motionPanel.hidden) { openMotions(false); mover.focus(); } });
  function setMotion(key) {
    motion = key;
    savePrefs();
    markMotion();
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
    savePrefs(); saveClock();
    markRate();
  }

  /* ———— 轨道方向：停靠栏里「方向」按钮，点开左侧小面板，每条轨道一个 顺 / 逆 切换 ———— */
  var dirBtn = document.createElement('button');
  dirBtn.type = 'button'; dirBtn.className = 'compass-cycle compass-dir';
  dirBtn.setAttribute('aria-haspopup', 'true'); dirBtn.setAttribute('aria-expanded', 'false');
  dirBtn.innerHTML = '<small>方向</small><b></b>';
  dock.appendChild(dirBtn);
  var dirPanel = document.createElement('div');
  dirPanel.className = 'compass-dirs'; dirPanel.hidden = true;
  dirPanel.setAttribute('role', 'group'); dirPanel.setAttribute('aria-label', '各轨道运行方向');
  dock.appendChild(dirPanel);
  function orbitNames() {
    var n = S.orbits.length, names = n === 3 ? ['内圈', '中圈', '外圈'] : ['一圈', '二圈', '三圈', '四圈'].slice(0, n);
    return S.meridian ? names.concat('子午圈') : names;
  }
  function markDir() {
    var def = defDirs(), same = curDirs.every(function (v, i) { return v === def[i]; });
    dirBtn.querySelector('b').textContent = same ? '默认' : curDirs.every(function (v) { return v > 0; }) ? '全顺' : curDirs.every(function (v) { return v < 0; }) ? '全逆' : '自定';
    dirBtn.title = '轨道方向（本领域 · ' + STYLES[style].name + '）：' + orbitNames().map(function (t, i) { return t + (curDirs[i] > 0 ? '顺' : '逆'); }).join(' ') + '\n点击展开，逐条切换顺 / 逆时针';
    dirBtn.setAttribute('aria-label', '轨道方向：' + dirBtn.querySelector('b').textContent + '，点击展开');
    dirPanel.innerHTML = '<p>轨道方向</p>' + orbitNames().map(function (t, i) {
      var cw = curDirs[i] > 0;
      return '<button type="button" data-k="' + i + '" aria-pressed="' + (cw ? 'false' : 'true') + '" title="' + t + '：' + (cw ? '顺时针，点击改为逆时针' : '逆时针，点击改为顺时针') + '"><span>' + t + '</span><b>' + (cw ? '↻ 顺' : '↺ 逆') + '</b></button>';
    }).join('') + (same ? '' : '<button type="button" class="dirs-reset" data-reset title="恢复这个底图默认的方向">复原</button>');
  }
  function openDirs(on) {
    if (on) openMotions(false);
    dirPanel.hidden = !on; dirBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (!on) trace(null);
  }
  // 改方向时屏幕上的节点不跳：先记下此刻显示的角度，换方向后反推本位
  function setDirs(arr) {
    var d = domains[active]; if (!d) return;
    var shown = d.nodes.map(function (n, i) { var b = baseOf(n, i); return { b: b, a: b.a + moved(i, homeD(b), b.mer).da }; });
    dirSet[style] = arr; curDirs = dirsOf();
    d.nodes.forEach(function (n, i) { var b = shown[i].b; n.a = Math.round(norm(shown[i].a - moved(i, homeD(b), b.mer).da) * 10) / 10; n.r = b.r; });
    saveDomains(); savePrefs();
    markArrows(); markDir(); layout();
  }
  dirBtn.addEventListener('click', function () { openDirs(dirPanel.hidden); });
  dirPanel.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-reset')) { setDirs(defDirs()); trace(null); return; }
    var k = +b.dataset.k, arr = curDirs.slice(); arr[k] = -arr[k];
    setDirs(arr);
    var nb = dirPanel.querySelector('[data-k="' + k + '"]'); if (nb) nb.focus();
  });
  // 悬停某一行：在罗盘上描出那条轨道
  dirPanel.addEventListener('mouseover', function (e) {
    var b = e.target.closest('[data-k]'); if (!b) { trace(null); return; }
    var k = +b.dataset.k, mer = k >= S.orbits.length; trace(mer ? S.meridian.ry : S.orbits[k], true, mer);
  });
  dirPanel.addEventListener('mouseleave', function () { trace(null); });
  document.addEventListener('pointerdown', function (e) { if (!dirPanel.hidden && !dirPanel.contains(e.target) && !dirBtn.contains(e.target)) openDirs(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !dirPanel.hidden) { openDirs(false); dirBtn.focus(); } });

  /* ———— 按领域保存 / 读取设置 ———— */
  function readPrefs() {
    try { var o = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; }
  }
  function getLS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function pick(list, k) { return list.some(function (q) { return q[0] === k; }) ? k : null; }
  // 切到当前领域自己的设置；没有的项沿用旧的全局值，再没有用默认
  function loadPrefs() {
    var d = domains[active], p = (d && d.id && readPrefs()[d.id]) || {};
    var st = STYLES[p.style] ? p.style : STYLES[getLS(STYLE_KEY)] ? getLS(STYLE_KEY) : 'b';
    motion = pick(MOTIONS, p.motion) || pick(MOTIONS, getLS(MOTION_KEY)) || 'sync';
    rateKey = pick(RATES, p.speed) || pick(RATES, getLS(SPEED_KEY)) || 'mid';
    RATES.forEach(function (q) { if (q[0] === rateKey) rate = q[2]; });
    dirSet = p.dirs && typeof p.dirs === 'object' && !Array.isArray(p.dirs) ? p.dirs : {};
    if (st !== style || !art.layers.length) applyStyle(st);
    else { curDirs = dirsOf(); markArrows(); }
    markMotion(); markRate(); markDir();
  }
  // 只写当前领域（第一次写时给领域分配 id）；旧的全局 key 不再改，没有自己设置的领域照旧读它们
  function savePrefs() {
    var d = domains[active]; if (!d) return;
    if (!d.id) {
      var ids = domains.map(function (x) { return x.id; });
      do { d.id = 'dm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); } while (ids.indexOf(d.id) >= 0);
      saveDomains();
    }
    var all = readPrefs(), p = { style: style, motion: motion, speed: rateKey }, dirs = {};
    Object.keys(dirSet).forEach(function (k) { if (STYLES[k] && Array.isArray(dirSet[k])) dirs[k] = dirSet[k]; });
    if (Object.keys(dirs).length) p.dirs = dirs;
    all[d.id] = p;
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(all)); } catch (e) {}
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
    // 这个领域已经拖过位置，新加的节点落在默认轨道上最空的那段弧
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
      el.title = '点击打开 · 拖动调整位置（Shift 精细 · Alt 整 5° · Ctrl 关磁吸 · 按住 R 相对前一节点、Tab 换参照）· ←/→ 微调 · Ctrl+←/→ 调间距 · E 等距 · 拖到左侧领域可移过去';
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
  var off = [], offA = [], AVOID_MAX = 24, AVOID_ANG = 9, shown = [], pin = -1;
  // pin 记在本机（不进数据文件）：刷新后避让照旧由别的节点承担，最后摆过的节点仍停在它的读数位置
  var PIN_KEY = 'kongwo-orbit-pin';
  function setPin(i) {
    pin = i; var n = i >= 0 && domains[active] && domains[active].nodes[i];
    try { if (n) localStorage.setItem(PIN_KEY, JSON.stringify({ d: active, i: i, t: n.t })); else localStorage.removeItem(PIN_KEY); } catch (e) {}
  }
  function readPin() {
    var q = null; try { q = JSON.parse(localStorage.getItem(PIN_KEY)); } catch (e) {}
    var n = q && q.d === active && domains[active] && domains[active].nodes[q.i];
    pin = n && n.t === q.t ? q.i : -1;
  }
  function nodeSize() { return 54 * D / (map.clientWidth || 435); }        // 节点直径（设计稿单位）
  function avoid(ms, dt) {
    var need = nodeSize() * 1.04, tgt = ms.map(function () { return 0; }), tga = tgt.slice(), big = tgt.map(function () { return 1; });
    if (motion !== 'sync' && motion !== 'breath') {
      for (var i = 0; i < ms.length; i++) for (var j = i + 1; j < ms.length; j++) {
        var p = ms[i], q = ms[j]; if (!p || !q) continue;
        var dist = Math.hypot(p.x - q.x, p.y - q.y); if (dist >= need) continue;
        var amt = Math.min(AVOID_MAX, (need - dist) / 2 + 2), inI = p.d < q.d || (p.d === q.d && i < j);
        // 刚放下 / 刚微调的节点（pin）留在读数给的位置不让，避让全由对方承担
        var ki = i === pin ? 0 : j === pin ? 2 : 1, kj = 2 - ki;
        if (ki === 2) big[i] = 2; if (kj === 2) big[j] = 2;     // 替 pin 节点让位的一方：避让上限加倍，两节点仍能完全错开
        tgt[i] += (inI ? -amt : amt) * ki; tgt[j] += (inI ? amt : -amt) * kj;
        // 再沿轨道前后各让几度（浑天仪的扁椭圆在交叉处光靠半径错不开）：角度在前的稍往前、在后的稍往后
        var aw = Math.min(AVOID_ANG, (need - dist) / need * AVOID_ANG * 1.5), ahead = norm(p.ang - q.ang + 180) - 180 >= 0;
        tga[i] += (ahead ? aw : -aw) * ki; tga[j] += (ahead ? -aw : aw) * kj;
      }
    }
    ms.forEach(function (m, i) {
      if (!m) { off[i] = 0; offA[i] = 0; return; }
      var g = Math.max(-AVOID_MAX * big[i], Math.min(AVOID_MAX * big[i], tgt[i]));
      g = m.mer ? Math.max(S.meridian.ry - 30, Math.min(S.meridian.ry, m.d + g)) - m.d     // 子午圈：只往里让，两极不顶出罗盘
                : Math.max(dMin() - 6, Math.min(dMax() + 6, m.d + g)) - m.d;   // 不出罗盘、不压中心
      off[i] = dt == null || off[i] == null ? g : off[i] + (g - off[i]) * Math.min(1, dt * 4);
      m.d += off[i];
      var ga = Math.max(-AVOID_ANG * big[i], Math.min(AVOID_ANG * big[i], tga[i]));
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
      if (drag && drag.el === el) { off[i] = 0; offA[i] = 0; return; }
      var b = baseOf(n, i), hd = homeD(b), m = moved(i, hd, b.mer); m.home0 = b.a; m.mer = b.mer;
      m.ang = b.a + m.da; m.d = hd + m.dd; var p = point(m.ang, m.d, m.mer); m.x = p.x; m.y = p.y;
      ms[i] = m;
    });
    avoid(ms, dt); shown = ms;
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
    // 「新增」停在罗盘左下角的泊位：刻度环之外、方框之内，任何底图、模式下节点（连同呼吸、避让、摆荡、子午圈）都扫不到，
    // 也不压中心领域名、上下进守和右侧控制条；位置只随罗盘尺寸变，所以不再追着空隙滑动
    var k = berth(add);
    if (add.style.left !== k.left || add.style.top !== k.top) { add.style.left = k.left; add.style.top = k.top; }
  }
  // 泊位（百分比）：按钮外沿离方框留 6 个设计稿单位；方框太小时至少离开节点的最大活动半径
  function berth(add) {
    var h = (add.offsetWidth || 54) / 2 * D / (map.clientWidth || 435), reach = dMax() + 6 + nodeSize() / 2;
    var c = Math.max(D / 2 - h - 6, (reach + h + 4) / Math.SQRT2);
    return { left: (50 - c / D * 100).toFixed(3) + '%', top: (50 + c / D * 100).toFixed(3) + '%' };
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

  // 新加的节点落在默认轨道上最空的那段弧中间
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
  function forget() { ptr = null; relHeld = false; cancelDrag(); }
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
  function saveClock() { try { localStorage.setItem(PHASE_KEY, clock.toFixed(3)); } catch (e) {} }
  function tick(now) {
    requestAnimationFrame(tick);             // 先排下一帧：这一帧哪怕抛错，公转也不会断
    var dt = last && now > last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    try {
      // 停下要快（档位高时缓停期间节点会滑出指针），起步慢一些
      var hold = paused(now);
      if (drag && drag.moved) speed = 0;     // 拖动中时钟冻结：读数、辅助线、松手反推都用同一刻的运行偏移
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

  /* ———— 精确定位：读数、整步、对齐磁吸 ————
     一切按「本位」角度（= 屏幕角度 − 运行模式偏移，即存进数据的 a）计算；拖动时时钟冻结，所以读数就是松手后保存的值 */
  var STEP = 5, MAG = 2.5, MAG_FINE = .8, FINE = 4;
  var readout = document.createElement('div');
  readout.className = 'orbit-readout'; readout.setAttribute('aria-live', 'polite');
  map.appendChild(readout);
  var guides = svg('svg', { 'class': 'compass-art orbit-guides', viewBox: '-262 -262 524 524', 'aria-hidden': 'true', focusable: 'false' });
  map.appendChild(guides);
  var roTimer = 0;
  function cdist(x, y) { return Math.abs(norm(x - y + 180) - 180); }
  function r1(v) { return Math.round(norm(v) * 10) / 10 % 360; }      // 规整到 0.1°，不带浮点尾巴
  function f1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function trackKey(hd, mer) { return mer ? 'm' : nearest(hd); }
  // 第 i 个节点放在本位 h、轨道 (hd, mer) 时：同轨的其它节点（本位角）、全部其它节点
  function peers(i, hd, mer) {
    var d = domains[active], key = trackKey(hd, mer), same = [], all = [];
    d.nodes.slice(0, 6).forEach(function (n, k) {
      if (k === i) return;
      var b = baseOf(n, k), o = { k: k, a: norm(b.a), t: n.t };
      all.push(o); if (trackKey(homeD(b), b.mer) === key) same.push(o);
    });
    return { same: same, all: all };
  }
  function gapsAt(h, same) {
    if (!same.length) return null;
    var prev = 360, next = 360, P = null, N = null;
    same.forEach(function (o) { var f = norm(o.a - h), b = norm(h - o.a); if (f < next) { next = f; N = o; } if (b < prev) { prev = b; P = o; } });
    return { prev: prev, next: next, P: P, N: N };
  }
  // 磁吸候选：同角、对向（任意轨道的节点）、同轨前后两节点的中点（等分）
  function targets(h, pr) {
    var c = [];
    pr.all.forEach(function (o) { c.push({ a: o.a, kind: '同角', refs: [o] }, { a: norm(o.a + 180), kind: '对向', refs: [o] }); });
    var g = gapsAt(h, pr.same);
    if (g && pr.same.length >= 2 && g.P !== g.N) {
      var span = norm(g.N.a - g.P.a);
      c.push({ a: norm(g.P.a + span / 2), kind: '等分', half: span / 2, refs: [g.P, g.N] });
    }
    return c;
  }
  // 朱砂细虚线：从中心气环外（不压领域名）连到节点中心
  function svgLine(p, x, y) {
    var L = Math.hypot(x, y) || 1, k = Math.min(.95, 62 / L);
    svg('line', { x1: (x * k).toFixed(1), y1: (y * k).toFixed(1), x2: x.toFixed(1), y2: y.toFixed(1), stroke: RED, 'stroke-width': 1.3, 'stroke-dasharray': '4 3', 'stroke-opacity': .75, 'stroke-linecap': 'round' }, p);
  }
  // 读数 + 辅助线。st = { i, h, hd, mer, ring, fine, alt, noMag, hits }
  function showReadout(st) {
    clearTimeout(roTimer);
    var names = orbitNames(), key = trackKey(st.hd, st.mer), pr = peers(st.i, st.hd, st.mer), g = gapsAt(st.h, pr.same);
    var name = st.mer ? names[S.orbits.length] : names[key] + (st.ring ? '' : '附近');
    var tags = (st.hits || []).map(function (c) {
      return c.kind === '等分' ? '<em>等分 ' + f1(c.half) + '°</em>' : '<em>' + c.kind + ' · ' + esc(c.refs[0].t) + '</em>';
    });
    var mode = [st.fine ? '<i class="on">精细 ¼</i>' : '<i>Shift 精细</i>', st.alt ? '<i class="on">整步 ' + STEP + '°</i>' : '<i>Alt 整 ' + STEP + '°</i>',
                st.noMag ? '<i class="on">磁吸关</i>' : '<i>Ctrl 关磁吸</i>', st.rel ? '<i class="on">相对 · Tab 换参照</i>' : '<i>R 相对</i>'];
    var rel = st.rel ? '<p class="rel">参照：' + esc(st.rel.ref.t) + ' · 间距 <span>' + f1(st.rel.gap) + '°</span></p>' : '';
    readout.innerHTML = '<b>' + name + ' <span>' + f1(norm(st.h)) + '°</span></b>' +
      '<p>' + (g ? '前 ' + f1(g.prev) + '° · 后 ' + f1(g.next) + '°' : '本圈仅此一个') + '</p>' +
      rel + (st.note ? '<p class="hit"><em>' + st.note + '</em></p>' : '') +
      (tags.length ? '<p class="hit">' + tags.join('') + '</p>' : '') +
      (st.keys ? '<p class="keys">←/→ 1° · Shift 0.1° · Alt 5° · Ctrl+←/→ 间距 · E 等距 · Ctrl+Z 撤销</p>' : '<p class="keys">' + mode.join('') + '</p>');
    readout.classList.add('is-on');
    // 辅助线：中心 → 被拖节点，中心 → 参照节点（取它们此刻显示的位置）
    guides.textContent = '';
    if (st.hits && st.hits.length) {
      var m = moved(st.i, st.hd, st.mer), q = point(st.h + m.da, st.hd + m.dd, st.mer);
      svgLine(guides, q.x, q.y);
      st.hits.forEach(function (c) { c.refs.forEach(function (o) { var s = shown[o.k]; if (s) svgLine(guides, s.x, s.y); }); });
    }
    if (g) gapArcs(st, g);
  }
  // 被拖节点与同轨前后相邻节点之间：沿轨道的朱砂细弧 + 角度差（数据里的本位差）
  function gapArcs(st, g) {
    var m = moved(st.i, st.hd, st.mer), hs = st.h + m.da, dd = st.hd + m.dd, ins = (nodeSize() / 2 + 4) / dd * 180 / Math.PI;
    [[g.P, -1, g.prev], [g.N, 1, g.next]].forEach(function (q) {
      var s = shown[q[0].k]; if (!s) return;
      var span = q[1] < 0 ? norm(hs - s.ang) : norm(s.ang - hs); if (span < 2 * ins + 3) return;
      var a0 = hs + q[1] * ins, a1 = hs + q[1] * (span - ins), mid = hs + q[1] * span / 2;
      var isRef = st.rel && st.rel.ref.k === q[0].k;
      svg('path', { d: arcPath(a0, a1, dd, st.mer), fill: 'none', stroke: RED, 'stroke-width': isRef ? 1.3 : .9, 'stroke-opacity': isRef ? .85 : .6, 'stroke-linecap': 'round' }, guides);
      var lp = point(mid, dd + 13, st.mer);
      txt(guides, f1(q[2]) + '°', { x: lp.x.toFixed(1), y: (lp.y + 3).toFixed(1), 'font-size': 9.5, fill: RED, 'fill-opacity': .9, 'class': 'gap-label' });
    });
  }
  function hideReadout(later) {
    clearTimeout(roTimer);
    var go = function () { readout.classList.remove('is-on'); guides.textContent = ''; };
    if (later) roTimer = setTimeout(go, later); else go();
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // 指针在轨道 (d, mer) 上最近点的角度（精细模式锁定轨道时用）
  function angleOn(e, d, mer) {
    var rc = map.getBoundingClientRect();
    var x = ((e.clientX - rc.left) / rc.width - .5) * D, y = ((e.clientY - rc.top) / rc.height - .5) * D;
    if (!S.ellipse) return Math.atan2(x, -y) * 180 / Math.PI;
    var best = 0, near = Infinity, step, a, q, dist;
    for (a = 0; a < 360; a += 2) { q = point(a, d, mer); dist = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y); if (dist < near) { near = dist; best = a; } }
    for (a = best - 2, step = best; a <= step + 2; a += .1) { q = point(a, d, mer); dist = (q.x - x) * (q.x - x) + (q.y - y) * (q.y - y); if (dist < near) { near = dist; best = a; } }
    return best;
  }

  addEventListener('pointerdown', function () { justDragged = false; }, true);
  var lastNode = -1;           // 最近点选 / 拖动 / 微调过的节点：「等距」按钮作用在它所在的轨道
  box.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || e.target.closest('[data-edit],[data-del],[data-add],.map-add')) return;
    var el = e.target.closest('.map-node'); if (!el) return;
    var i = [].indexOf.call(nodeEls(), el);
    // 不让浏览器开始选字 / 原生拖拽（Shift+按下会扩展选区，再从选中的字上拖就成了原生拖拽：浏览器发 pointercancel，
    // 节点停在刚起步处，之后的移动全是拖拽幻影 —— 松手后看起来就是「跳回原位」）。焦点手动给上，键盘微调照常
    e.preventDefault();
    try { el.focus({ preventScroll: true }); } catch (er) {}
    lastNode = i;
    drag = { el: el, i: i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, pos: null, off: 0, raw: null, trk: null, wasFine: false, rel: relHeld, refK: -1 };
  });
  box.addEventListener('dragstart', function (e) { if (e.target.closest && e.target.closest('.map-node')) e.preventDefault(); });
  box.addEventListener('selectstart', function (e) { if (e.target.closest && e.target.closest('.map-node')) e.preventDefault(); });
  box.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('.map-node'); if (el) lastNode = [].indexOf.call(nodeEls(), el); });
  function mods(e) { return { shift: e.shiftKey, alt: e.altKey, ctrl: e.ctrlKey || e.metaKey }; }
  // 相对模式的参照候选：同轨节点（没有就用全部），按「在它后面多远」排序，第一个就是最近的前一个节点
  function refList(h, pr) {
    var c = (pr.same.length ? pr.same : pr.all).slice();
    return c.sort(function (x, y) { return norm(h - x.a) - norm(h - y.a); });
  }
  function relRef(h, pr) {
    var c = refList(h, pr), k = drag.refK;
    var o = c.filter(function (q) { return q.k === k; })[0] || c[0] || null;
    drag.refK = o ? o.k : -1; return o;
  }
  // 按当前指针与修饰键算出本位角 h、本位半径 hd，摆好节点、更新读数
  function dragUpdate() {
    var e = drag.last, k = drag.mods, i = drag.i, fine = k.shift && drag.trk, t, p;
    if (fine) {
      t = drag.trk;
      var pa = angleOn(e, t.d, t.mer);
      if (!drag.wasFine) drag.pa = pa;
      drag.raw = norm(drag.raw + (norm(pa - drag.pa + 180) - 180) / FINE); drag.pa = pa;
    } else {
      // 松开 Shift 时指针往往已离开轨道（精细模式下节点只走 ¼）：仍锁在原轨道上，角度 1:1 跟指针，
      // 直到指针移开 12px 以上、且明确吸到了另一条轨道 / 子午圈才换轨 —— 否则松开 Shift 的一瞬节点会跳到指针所在的半径
      if (drag.wasFine) drag.hold = { x: e.clientX, y: e.clientY, pa: null };
      p = toPolar(e);
      var lock = drag.hold && drag.trk, far = lock && Math.hypot(e.clientX - drag.hold.x, e.clientY - drag.hold.y) >= 12;
      if (lock && !(far && (p.mer ? !drag.trk.mer : p.ring && (drag.trk.mer || Math.abs(p.d - drag.trk.d) > .5)))) {
        t = drag.trk;
        var pa2 = angleOn(e, t.d, t.mer);
        if (drag.hold.pa != null) drag.raw = norm(drag.raw + norm(pa2 - drag.hold.pa + 180) - 180);
        drag.hold.pa = pa2;
      } else {
        var cont = drag.wasFine || !!drag.hold; drag.hold = null;
        var mer = !!p.mer, hd = p.ring ? p.d : Math.max(dMin(), Math.min(dMax(), p.d - moved(i, p.d, mer).dd));
        var home = norm(p.a - moved(i, hd, mer).da);
        if (cont) drag.off = norm(drag.raw - home + 180) - 180;    // 离开精细 / 锁轨：保持节点不动，之后跟着指针走
        if (drag.raw == null) drag.off = 0;
        drag.raw = norm(home + drag.off);
        t = drag.trk = { d: hd, mer: mer, ring: p.ring };
      }
    }
    drag.wasFine = !!fine;
    var h = drag.raw, hits = [], pr = peers(i, t.d, t.mer), lim = fine ? MAG_FINE : MAG, rel = null;
    var ref = drag.rel ? relRef(h, pr) : null;
    if (ref) {
      // 相对模式：以「与参照节点的角度差」为主；Alt 整步、磁吸（15° 的倍数）都作用在角度差上
      var gap = norm(h - ref.a);
      if (k.alt) gap = Math.round(gap / STEP) * STEP;
      else if (!k.ctrl && cdist(gap, Math.round(gap / 15) * 15) < lim) gap = Math.round(gap / 15) * 15;
      h = norm(ref.a + gap);
    } else if (k.alt) h = norm(Math.round(h / STEP) * STEP);
    else if (!k.ctrl) {
      var best = null;
      targets(h, pr).forEach(function (c) { var dd = cdist(h, c.a); if (dd < lim && (!best || dd < best.dd)) best = { a: c.a, dd: dd }; });
      if (best) h = best.a;
    }
    h = r1(h);
    if (ref) rel = { ref: ref, gap: Math.round(norm(h - ref.a) * 10) / 10 % 360 };
    targets(h, pr).forEach(function (c) { if (cdist(h, c.a) < .051 && !hits.some(function (x) { return x.kind === c.kind; })) hits.push(c); });
    drag.h = h;
    var m = moved(i, t.d, t.mer);
    placeAt(drag.el, h + m.da, t.d + m.dd, t.mer);
    trace(t.d, t.ring, t.mer);
    showReadout({ i: i, h: h, hd: t.d, mer: t.mer, ring: t.ring, fine: !!fine, alt: k.alt, noMag: k.ctrl && !k.alt, hits: hits, rel: rel });
  }
  addEventListener('pointermove', function (e) {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 5) return;
      drag.moved = true;
      try { drag.el.setPointerCapture(drag.id); } catch (er) {}
      drag.el.classList.add('is-dragging'); map.classList.add('is-dragging');
      off[drag.i] = 0; offA[drag.i] = 0;     // 拖动中时钟冻结、layout 不跑：先清掉被拖节点原来的避让偏移
      setPin(drag.i);
    }
    e.preventDefault();
    drag.last = { clientX: e.clientX, clientY: e.clientY }; drag.mods = mods(e);
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
    if (dom) {
      var p = toPolar(e); placeAt(drag.el, p.a, p.d, p.mer);
      trace(null); hideReadout(); return;
    }
    dragUpdate();
  });
  // 拖动中按下 / 松开修饰键：不等指针动就重算（Alt 不让浏览器去聚焦菜单栏）；R 按住 = 相对模式，Tab / Shift+Tab 换参照
  var relHeld = false;          // R 是否按着（拖动起步前、甚至按下鼠标前就按住也算）
  function onMod(e) {
    var isR = (e.code === 'KeyR' || e.key === 'r' || e.key === 'R') && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (isR) {
      var t = e.target; if (t && t.closest && t.closest('input,textarea,select,[contenteditable]')) return;
      relHeld = e.type === 'keydown';
      if (drag) { drag.rel = relHeld; e.preventDefault(); }
    }
    if (!drag || !drag.moved || drag.dom || !drag.last) return;
    if (isR) { if (e.repeat) return; }
    else if (e.key === 'Tab') {
      e.preventDefault(); if (e.type !== 'keydown' || !drag.rel || !drag.trk) return;
      var c = refList(drag.raw, peers(drag.i, drag.trk.d, drag.trk.mer)); if (!c.length) return;
      var at = c.map(function (q) { return q.k; }).indexOf(drag.refK);
      drag.refK = c[(at + (e.shiftKey ? -1 : 1) + c.length) % c.length].k;
      dragUpdate(); return;      // Shift+Tab 只换参照，不当作精细模式的切换
    } else if (!/^(Shift|Alt|Control|Meta)$/.test(e.key)) return;
    else e.preventDefault();
    drag.mods = mods(e); dragUpdate();
  }
  addEventListener('keydown', onMod, true);
  addEventListener('keyup', onMod, true);
  addEventListener('contextmenu', function (e) { if (drag && drag.moved) e.preventDefault(); }, true);

  /* ———— 撤销：拖动、键盘微调、等距排列前各记一份当前领域全部节点的位置 ———— */
  var undo = [];
  function snapshot() {
    var d = domains[active]; if (!d) return;
    undo.push({ d: d, list: d.nodes.map(function (n) { return { n: n, a: n.a, r: n.r, o: n.o }; }) });
    if (undo.length > 30) undo.shift();
  }
  function undoLast() {
    var u = undo.pop(); if (!u) return false;
    u.list.forEach(function (x) {
      ['a', 'r', 'o'].forEach(function (k) { if (x[k] === undefined) delete x.n[k]; else x.n[k] = x[k]; });
    });
    saveDomains();
    if (u.d === domains[active]) { setPin(-1); layout(0); readout.innerHTML = '<b>已撤销上一次位置调整</b>'; guides.textContent = ''; readout.classList.add('is-on'); hideReadout(1400); }
    return true;
  }
  addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || !(e.key === 'z' || e.key === 'Z') || drag) return;
    var t = e.target;
    if (t && t !== document.body && t !== document.documentElement && !map.contains(t)) return;   // 输入框、弹窗里的撤销照旧
    if (undo.length && undoLast()) e.preventDefault();
  });

  // 松手（或拖动被打断）：节点落在最后一次读数的位置 —— 不再用 pointerup 的坐标反推，修饰键在松手时怎么变都不影响
  function commit(dr) {
    var n = domains[active].nodes[dr.i];
    if (!(n && dr.trk && dr.h != null)) return;
    snapshot();
    // 同领域其它节点也落定当前位置，之后增删节点不会让它们跳位
    domains[active].nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = norm(b.a); m.r = b.r; });
    n.a = dr.h;
    n.r = Math.round(toR(dr.trk.d) * 10000) / 10000;
    if (dr.trk.mer) n.o = 'm'; else delete n.o;
    saveDomains();
    setPin(dr.i); lastNode = dr.i;
    saveClock();              // 公转时钟一并记下：刷新后节点出现在同一处（原来只在 10 秒定时 / 关页时记）
  }
  function end(e) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    var dr = drag; drag = null;
    if (!dr.moved) return;
    ptr = null;               // 松手处正压着刚放下的节点：指针再动之前不算悬停，放下就接着转
    dr.el.classList.remove('is-dragging'); map.classList.remove('is-dragging');
    trace(null); hideReadout(900);
    justDragged = true; setTimeout(function () { justDragged = false; }, 0);
    if (dr.dom) {
      dr.dom.classList.remove('is-drop'); dr.el.classList.remove('is-leaving'); hideReadout();
      if (!moveNode(dr.i, +dr.dom.dataset.i)) layout();
      return;
    }
    commit(dr);
    layout(0);                // dt=0：其它节点的避让偏移从当前值缓动；被拖节点 pin 住不让位
  }
  // 拖动被打断（丢了 pointerup、窗口失焦、切后台）：同样落在最后读数的位置，不再弹回拖动前的原位
  function cancelDrag() {
    if (!drag) return;
    var dr = drag; drag = null;
    if (!dr.moved) return;
    dr.el.classList.remove('is-dragging', 'is-leaving'); map.classList.remove('is-dragging');
    justDragged = true;       // 回来松手时浏览器补发的 click 不要打开卡片（下一次按下时清掉）
    if (dr.dom) dr.dom.classList.remove('is-drop'); else commit(dr);
    trace(null); hideReadout(900);
    layout(0);
  }
  addEventListener('pointerup', end);
  addEventListener('pointercancel', end);
  // 拖动结束时浏览器还会补发一次 click：拦在卡片弹出之前
  addEventListener('click', function (e) {
    if (justDragged && e.target.closest && e.target.closest('#mapNodes')) { e.stopPropagation(); e.preventDefault(); justDragged = false; }
  }, true);

  function hitsAt(i, h, hd, mer) {
    var hits = [];
    targets(h, peers(i, hd, mer)).forEach(function (c) { if (cdist(h, c.a) < .051 && !hits.some(function (x) { return x.kind === c.kind; })) hits.push(c); });
    return hits;
  }
  function onRing(hd, mer) { return mer || S.orbits.some(function (R) { return Math.abs(R - hd) < .5; }); }
  // 等距排列：第 i 个节点不动，同轨其它节点按当前顺序（从它往前数）等距分布
  function equalize(i) {
    var d = domains[active], n = d && d.nodes[i]; if (!n || i > 5) return false;
    var b0 = baseOf(n, i), key = trackKey(homeD(b0), b0.mer), list = [];
    d.nodes.slice(0, 6).forEach(function (m, k) { var b = baseOf(m, k); if (trackKey(homeD(b), b.mer) === key) list.push({ k: k, a: norm(b.a) }); });
    var h0 = norm(b0.a);
    if (list.length < 2) { showReadout({ i: i, h: h0, hd: homeD(b0), mer: b0.mer, ring: onRing(homeD(b0), b0.mer), keys: true, note: '本圈只有这一个节点，无需等距' }); hideReadout(1800); return false; }
    snapshot();
    d.nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = norm(b.a); m.r = b.r; });
    list.sort(function (x, y) { return norm(x.a - h0) - norm(y.a - h0); });
    var step = 360 / list.length;
    list.forEach(function (q, j) { d.nodes[q.k].a = r1(h0 + j * step); });
    saveDomains(); setPin(i); layout(0);
    var hd = homeD(b0);
    showReadout({ i: i, h: n.a, hd: hd, mer: b0.mer, ring: onRing(hd, b0.mer), hits: hitsAt(i, n.a, hd, b0.mer), keys: true, note: '已等距 ' + f1(step) + '° · ' + list.length + ' 个 · Ctrl+Z 撤销' });
    hideReadout(2400);
    return true;
  }
  var evenBtn = document.createElement('button');
  evenBtn.type = 'button'; evenBtn.className = 'compass-cycle compass-even';
  evenBtn.title = '等距排列（聚焦节点后按 E）：把最近选中节点所在轨道的节点按当前顺序等距分布 · Ctrl/Cmd+Z 撤销';
  evenBtn.innerHTML = '<small>排列</small><b>等距</b>';
  dock.appendChild(evenBtn);
  evenBtn.addEventListener('click', function () {
    var els = nodeEls(), i = lastNode >= 0 && lastNode < els.length ? lastNode : 0;
    if (!els.length) return;
    equalize(i);
  });

  // 键盘：聚焦节点后 ←/→ 沿轨道 ±1°（Shift ±0.1°、Alt ±5°），Ctrl/Cmd+←/→ 调「与前一节点的间距」，
  // Shift+↑/↓ 换内外（屏幕上的角度保持不跳），E 等距排列
  box.addEventListener('keydown', function (e) {
    var el = e.target.closest && e.target.closest('.map-node'); if (!el) return;
    var i = [].indexOf.call(nodeEls(), el), n = domains[active].nodes[i]; if (!n) return;
    var cm = e.ctrlKey || e.metaKey;
    if ((e.key === 'e' || e.key === 'E') && !cm && !e.altKey) { e.preventDefault(); equalize(i); return; }
    if (!/^Arrow/.test(e.key)) return;
    var lr = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
    if (!lr && (!e.shiftKey || cm)) return;
    var b = baseOf(n, i), home = b.a, rel = null, stp = (e.key === 'ArrowLeft' ? -1 : 1) * (e.altKey ? 5 : e.shiftKey ? .1 : 1);
    snapshot();
    if (lr && cm) {
      var g = gapsAt(norm(b.a), peers(i, homeD(b), b.mer).same);
      if (g) {
        var gap = Math.max(.1, Math.min(359.9, Math.round((g.prev + stp) * 10) / 10));
        home = g.P.a + gap; rel = { ref: g.P, gap: gap };
      } else home += stp;
    } else if (lr) home += stp;
    else {
      var shownA = b.a + moved(i, homeD(b), b.mer).da;
      b.r = Math.max(R_MIN / VIEW, Math.min(R_MAX / VIEW, b.r + (e.key === 'ArrowUp' ? 1 : -1) * 4 / VIEW)); b.mer = false; delete n.o;   // 换内外即离开子午圈
      home = shownA - moved(i, homeD(b), b.mer).da;
    }
    n.a = r1(home); n.r = Math.round(b.r * 10000) / 10000;
    e.preventDefault(); saveDomains(); setPin(i); lastNode = i; layout(0);
    var hd = homeD(b);
    showReadout({ i: i, h: n.a, hd: hd, mer: b.mer, ring: onRing(hd, b.mer), hits: hitsAt(i, n.a, hd, b.mer), keys: true, rel: rel });
    hideReadout(1800);
  });

  var _render = renderAll;
  renderAll = function () { _render(); readPin(); lastNode = -1; loadPrefs(); decorate(); };
  readPin();
  loadPrefs();
  decorate();
  requestAnimationFrame(tick);
})();
