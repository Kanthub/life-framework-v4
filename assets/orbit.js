/* 罗盘节点：天体式公转 + 鼠标拖动定位
   - 节点位置用极坐标保存在节点上：a 角度（度，上方为 0，顺时针），r 半径（占罗盘边长的比例）
   - 所有节点一起沿轨道缓慢公转；鼠标在罗盘上时减速停下，方便点击
   - 拖动节点到新位置，靠近轨道环时自动吸附；松手即保存 */
(function () {
  var map = document.getElementById('lifeMap');
  var box = document.getElementById('mapNodes');
  if (!map || !box) return;

  var VIEW = 435;                       // 罗盘 svg 的 viewBox 边长
  var RINGS = [119, 156];               // 可吸附的两条轨道（node-ring / dot-ring）
  var R_MIN = 104, R_MAX = 172;         // 不压中心圆、不出外环
  var SNAP = 11;
  var PERIOD = 360;                     // 公转一周的秒数
  var PHASE_KEY = 'kongwo-orbit';

  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var phase = parseFloat(localStorage.getItem(PHASE_KEY)) || 0;
  var speed = 1, target = 1;            // 0..1，悬停时缓停
  var drag = null, justDragged = false;

  function hash(s) { var h = 0; s = String(s || ''); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }
  function nodeEls() { return box.querySelectorAll('.map-node'); }
  function baseOf(n, i) {
    return { a: typeof n.a === 'number' ? n.a : i * 60, r: typeof n.r === 'number' ? n.r : RINGS[0] / VIEW };
  }
  function place(el, a, r) {
    var t = (a + phase) * Math.PI / 180;
    el.style.left = (50 + Math.sin(t) * r * 100) + '%';
    el.style.top = (50 - Math.cos(t) * r * 100) + '%';
  }

  // 每次重绘罗盘后：给节点挂上各自的自转/卫星节奏，并摆到位置上
  function decorate() {
    var d = domains[active]; if (!d) return;
    // 这个领域已经拖过位置，新加的节点就落在「新增」原来所在的空位
    if (d.nodes.some(function (n) { return typeof n.a === 'number'; })) {
      var fresh = d.nodes.filter(function (n) { return typeof n.a !== 'number'; });
      if (fresh.length) {
        fresh.forEach(function (n) { n.a = -1; });
        var placed = { nodes: d.nodes.filter(function (n) { return n.a >= 0; }) };
        fresh.forEach(function (n) { n.a = Math.round(gapAngle(placed) % 360 * 10) / 10; n.r = RINGS[0] / VIEW; placed.nodes.push(n); });
        saveDomains();
      }
    }
    nodeEls().forEach(function (el, i) {
      var n = d.nodes[i]; if (!n) return;
      var h = hash(n.id || n.t);
      el.classList.add('orb');
      el.style.setProperty('--spin', (70 + h % 50) + 's');
      el.style.setProperty('--tex', (h % 100) + '%');
      el.style.setProperty('--moon', (16 + h % 13) * (h % 2 ? 1 : -1) + 's');
      el.style.setProperty('--moon0', (h % 360) + 'deg');
      el.title = '点击打开 · 拖动调整位置 · 拖到左侧领域可移过去';
      // 名字一行放不下时缩字，而不是折行
      var b = el.querySelector('b'); b.style.fontSize = '';
      var room = el.clientWidth - 2, w = b.scrollWidth;
      if (w > room) b.style.fontSize = (parseFloat(getComputedStyle(b).fontSize) * room / w).toFixed(1) + 'px';
    });
    layout();
  }
  function layout() {
    var d = domains[active]; if (!d) return;
    nodeEls().forEach(function (el, i) {
      var n = d.nodes[i]; if (!n || (drag && drag.el === el)) return;
      var b = baseOf(n, i); place(el, b.a, b.r);
    });
    var add = box.querySelector('.map-add');
    if (add) place(add, gapAngle(d), RINGS[0] / VIEW);
  }

  // 「新增」放在轨道上最空的那段弧中间
  function gapAngle(d) {
    var as = d.nodes.map(function (n, i) { return (baseOf(n, i).a % 360 + 360) % 360; }).sort(function (x, y) { return x - y; });
    if (!as.length) return 0;
    var best = 0, at = 0;
    as.forEach(function (a, k) { var nx = k + 1 < as.length ? as[k + 1] : as[0] + 360; if (nx - a > best) { best = nx - a; at = a + best / 2; } });
    return at;
  }

  var last = 0, saved = 0;
  function tick(now) {
    var dt = last ? Math.min(.1, (now - last) / 1000) : 0; last = now;
    var t = reduce.matches || document.getElementById('cardLayer') && document.getElementById('cardLayer').classList.contains('is-open') ? 0 : target;
    speed += (t - speed) * Math.min(1, dt * 3);
    if (speed > .001) { phase = (phase + speed * dt * 360 / PERIOD) % 360; layout(); }
    if (now - saved > 10000) { saved = now; try { localStorage.setItem(PHASE_KEY, phase.toFixed(2)); } catch (e) {} }
    requestAnimationFrame(tick);
  }

  map.addEventListener('pointerenter', function () { target = 0; });
  map.addEventListener('pointerleave', function () { if (!drag) target = 1; });
  addEventListener('pagehide', function () { try { localStorage.setItem(PHASE_KEY, phase.toFixed(2)); } catch (e) {} });

  /* ———— 拖动 ———— */
  function toPolar(e) {
    var rc = map.getBoundingClientRect();
    var x = (e.clientX - rc.left) / rc.width - .5, y = (e.clientY - rc.top) / rc.height - .5;
    var r = Math.sqrt(x * x + y * y) * VIEW;
    var a = Math.atan2(x, -y) * 180 / Math.PI;
    var snapped = null;
    RINGS.forEach(function (R) { if (Math.abs(r - R) < SNAP) snapped = R; });
    r = snapped || Math.max(R_MIN, Math.min(R_MAX, r));
    return { a: a, r: r / VIEW, ring: snapped };
  }
  function trace(r, ring) {
    var g = map.querySelector('.orbit-trace');
    if (!g) { g = document.createElement('i'); g.className = 'orbit-trace'; map.appendChild(g); }
    if (r == null) { g.remove(); return; }
    g.style.width = g.style.height = (r * 200) + '%';
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
    drag.el.style.left = (50 + Math.sin(p.a * Math.PI / 180) * p.r * 100) + '%';
    drag.el.style.top = (50 - Math.cos(p.a * Math.PI / 180) * p.r * 100) + '%';
    trace(p.r, p.ring);
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
      domains[active].nodes.forEach(function (m, k) { var b = baseOf(m, k); m.a = (b.a % 360 + 360) % 360; m.r = b.r; });
      n.a = Math.round(((dr.pos.a - phase) % 360 + 360) % 360 * 10) / 10;
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

  // 键盘：选中节点后 Shift+←/→ 沿轨道挪动，Shift+↑/↓ 换内外
  box.addEventListener('keydown', function (e) {
    if (!e.shiftKey || !/^Arrow/.test(e.key)) return;
    var el = e.target.closest('.map-node'); if (!el) return;
    var i = [].indexOf.call(nodeEls(), el), n = domains[active].nodes[i]; if (!n) return;
    var b = baseOf(n, i);
    if (e.key === 'ArrowLeft') b.a -= 5; else if (e.key === 'ArrowRight') b.a += 5;
    else b.r = Math.max(R_MIN / VIEW, Math.min(R_MAX / VIEW, b.r + (e.key === 'ArrowUp' ? 1 : -1) * 4 / VIEW));
    n.a = (b.a % 360 + 360) % 360; n.r = b.r;
    e.preventDefault(); saveDomains(); layout();
  });

  var _render = renderAll;
  renderAll = function () { _render(); decorate(); };
  decorate();
  requestAnimationFrame(tick);
})();
