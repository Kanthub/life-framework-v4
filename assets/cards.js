/* 空我人生 · 节点卡片（册页弹窗）
   在 app.js 之后加载。负责：
   1. 用 FRAMEWORK_SEED 迁移旧的示例领域（只迁移一次）
   2. 罗盘节点点击 → 弹出卡片（动态展开），可翻页、跳转关联、返回
   3. 卡片原地编辑：主张 / 数字 / 为什么 / 形式 / 关联，拖动排序，增删，递进 ↔ 并列
   数据：localStorage 'kongwo-cards'（经 local-store.js 自动写入本机文件） */
(function () {
  'use strict';
  var CARD_KEY = 'kongwo-cards';
  var MIGRATED_KEY = 'kongwo-fw-v';
  var SEED = window.FRAMEWORK_SEED;
  if (!SEED) return;

  /* ———————— 数据 ———————— */
  var cards = {};
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function loadCards() {
    try { var v = JSON.parse(localStorage.getItem(CARD_KEY)); if (v && typeof v === 'object') cards = v; } catch (e) {}
    // 种子节点：没有卡，或只是自动建的空卡（用户从未编辑过），用种子内容补上
    Object.keys(SEED.nodes).forEach(function (id) {
      var c = cards[id], seed = SEED.nodes[id];
      if (!c || (!c.touched && !(c.items || []).length && (seed.items.length || seed.mode !== c.mode))) cards[id] = clone(seed);
    });
    Object.keys(cards).forEach(function (id) { normCard(cards[id]); });
  }
  function normCard(c) {
    c.items = (c.items || []).map(function (it) {
      return { t: it.t || '', nums: (it.nums || []).filter(function (n) { return n && (n.v || n.u); }),
               why: it.why || '', forms: (it.forms || []).filter(Boolean), links: (it.links || []).filter(function (l) { return l && l.to; }) };
    });
    if (['chain', 'list', 'gate'].indexOf(c.mode) < 0) c.mode = 'list';
  }
  /* 条目顺序变了（移动/删除）后，修正所有指向这张卡条目的关联。
     order[新位置] = 旧位置；被删的条目，关联改为指向整张卡 */
  function remapLinks(id, order) {
    var map = {}; order.forEach(function (oldI, newI) { map[oldI] = newI; });
    Object.keys(cards).forEach(function (k) {
      (cards[k].items || []).forEach(function (it) {
        (it.links || []).forEach(function (l) {
          if (l.to === id && l.item != null) { if (map[l.item] != null) l.item = map[l.item]; else delete l.item; }
        });
      });
    });
  }
  function moveItem(c, from, to) {
    var order = c.items.map(function (_, i) { return i; });
    order.splice(to, 0, order.splice(from, 1)[0]);
    c.items.splice(to, 0, c.items.splice(from, 1)[0]);
    remapLinks(state.id, order);
  }
  function saveCards() { try { localStorage.setItem(CARD_KEY, JSON.stringify(cards)); } catch (e) {} }
  function uid() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

  /* 旧示例领域 → 新框架（一次性）。原来的原则/实践示例一并清空 */
  function migrate() {
    if (localStorage.getItem(MIGRATED_KEY) === String(SEED.version)) return;
    domains.length = 0;
    SEED.domains.forEach(function (d) {
      domains.push({ id: d.id, name: d.name, sub: d.sub, icon: d.icon, desc: d.desc,
        nodes: d.nodes.map(function (nid) { return { id: nid, t: SEED.nodes[nid].name, s: SEED.nodes[nid].sub || '' }; }),
        principles: [], practices: [] });
    });
    domains.forEach(normDomain);
    SEED.domains.forEach(function (d) { d.nodes.forEach(function (nid) { if (!cards[nid] || !cards[nid].touched) cards[nid] = clone(SEED.nodes[nid]); }); });
    active = 0;
    saveDomains();
    localStorage.setItem(MIGRATED_KEY, String(SEED.version));
  }

  /* 节点 id 保持稳定：旧节点没有 id 时补一个，并建一张空卡 */
  function ensureIds() {
    var changed = false;
    domains.forEach(function (d) {
      (d.nodes || []).forEach(function (n) {
        if (!n.id) { n.id = uid(); changed = true; }
        if (!cards[n.id]) { cards[n.id] = { name: n.t, sub: n.s, mode: 'list', items: [] }; changed = true; }
      });
    });
    if (changed) { saveDomains(); saveCards(); }
  }

  function findNode(id) {
    for (var di = 0; di < domains.length; di++) {
      var ns = domains[di].nodes || [];
      for (var ni = 0; ni < ns.length; ni++) if (ns[ni].id === id) return { di: di, ni: ni, d: domains[di], n: ns[ni] };
    }
    return null;
  }
  function label(id) { var f = findNode(id); return f ? f.n.t : ((cards[id] && cards[id].name) || '未知节点'); }
  function fullLabel(id, item) {
    var f = findNode(id), c = cards[id];
    var s = (f ? f.d.name + ' · ' : '') + label(id);
    if (item != null && c && c.items[item]) s += ' · ' + c.items[item].t;
    return s;
  }
  /* 反向关联：哪些条目连到了这张卡 */
  function backlinks(id) {
    var out = [];
    Object.keys(cards).forEach(function (cid) {
      if (cid === id || !findNode(cid)) return;
      (cards[cid].items || []).forEach(function (it, i) {
        (it.links || []).forEach(function (l) { if (l.to === id) out.push({ from: cid, item: i, t: it.t }); });
      });
      if (cards[cid].mode === 'gate' && cards[cid].gate === id) out.push({ from: cid, item: null, t: '' });
    });
    return out;
  }

  /* ———————— 卡片 DOM ———————— */
  var root, sheet, state = { id: null, edit: false, stack: [], origin: null };

  function build() {
    root = document.createElement('div');
    root.id = 'cardLayer';
    root.innerHTML = '<div class="cl-veil" data-x></div><article class="cl-sheet" role="dialog" aria-modal="true" aria-labelledby="clTitle" tabindex="-1"></article>';
    document.body.appendChild(root);
    sheet = root.querySelector('.cl-sheet');
    root.addEventListener('click', onClick);
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    document.addEventListener('keydown', onKey);
    addEventListener('resize', function () { if (root.classList.contains('is-open')) unzoom(); });
    bindDrag();
  }

  function esc2(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var CN = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
  function seq(i) { return CN[i] || String(i + 1); }

  function siblings(id) { var f = findNode(id); return f ? f.d.nodes.map(function (n) { return n.id; }) : [id]; }

  function render(flash) {
    var id = state.id, c = cards[id], f = findNode(id);
    if (!c || !f) { close(); return; }
    var sib = siblings(id), pos = sib.indexOf(id);
    var prev = sib[(pos - 1 + sib.length) % sib.length], next = sib[(pos + 1) % sib.length];
    var back = state.stack.length ? state.stack[state.stack.length - 1] : null;
    var E = state.edit;

    var head =
      '<header class="cl-top">' +
        (back ? '<button class="cl-crumb" data-back>‹ 返回 ' + esc2(label(back.id)) + '</button>'
              : '<button class="cl-crumb" data-x>‹ 罗盘</button>') +
        '<span class="cl-path"><button data-domain="' + f.di + '">' + esc2(f.d.name) + '</button> › ' + esc2(f.n.t) + '</span>' +
        (sib.length > 1 ? '<span class="cl-turn"><button data-go="' + prev + '" aria-label="上一页">‹</button><i>' + (pos + 1) + ' / ' + sib.length + '</i><button data-go="' + next + '" aria-label="下一页">›</button></span>' : '') +
        '<button class="cl-close" data-x aria-label="关闭">×</button>' +
      '</header>';

    var modeTxt = c.mode === 'chain' ? '递进' : c.mode === 'gate' ? '入口' : '并列';
    var meta = modeTxt + (c.mode !== 'gate' ? ' · ' + c.items.length + ' 条' : '') + (c.settled ? ' · ' + c.settled + ' 落定' : '');
    var title =
      '<div class="cl-head">' +
        '<div><h2 id="clTitle">' + esc2(f.n.t).split('').join('<span class="cl-gap"></span>') + '</h2>' +
        (E ? '<div class="cl-meta-edit">' +
               '<label>模式 <select data-f="mode"><option value="chain"' + (c.mode === 'chain' ? ' selected' : '') + '>递进</option><option value="list"' + (c.mode === 'list' ? ' selected' : '') + '>并列</option><option value="gate"' + (c.mode === 'gate' ? ' selected' : '') + '>入口</option></select></label>' +
               (c.mode === 'gate' ? '<label>指向 ' + nodeSelect('gate', c.gate, id) + '</label>' : '') +
               '<label>落定 <input data-f="settled" value="' + esc2(c.settled || '') + '" placeholder="如 2026-09"></label>' +
             '</div>'
           : '<p class="cl-meta">' + esc2(meta) + '</p>') +
        '</div>' +
        '<div class="cl-head-r"><span class="seal seal-inline" aria-hidden="true"></span>' +
          '<button class="cl-edit" data-edit>' + (E ? '完成' : '编辑') + '</button></div>' +
      '</div>';

    var lead = E ? '<textarea class="cl-lead-in" data-f="lead" rows="2" placeholder="一句总纲（可选），如：未来一年的训练哲学 —— 身体重塑">' + esc2(c.lead || '') + '</textarea>'
                 : (c.lead ? '<p class="cl-lead">' + esc2(c.lead) + '</p>' : '');

    var body = '';
    if (c.mode === 'gate' && !E) {
      body = '<div class="cl-gate">' +
             (c.gate && cards[c.gate] ? '<button class="cl-gate-go" data-jump="' + c.gate + '">前往 ' + esc2(fullLabel(c.gate)) + ' ›</button>' : '<p class="cl-empty">还没有设置指向的节点，点「编辑」选择。</p>') +
             '</div>';
    } else if (c.mode !== 'gate') {
      body = '<ol class="cl-items ' + (c.mode === 'chain' ? 'is-chain' : 'is-list') + (E ? ' is-edit' : '') + '">' +
        c.items.map(function (it, i) { return E ? itemEdit(it, i, id) : itemView(it, i, c.mode === 'chain' && i < c.items.length - 1); }).join('') +
        '</ol>';
      if (!c.items.length && !E) body += '<p class="cl-empty">这一页还是空的。点右上角「编辑」写下第一条。</p>';
      if (E) body += '<button class="cl-add" data-additem>＋ 再加一条</button>';
    }

    var bl = backlinks(id);
    var foot = bl.length && !E ? '<footer class="cl-back"><span>关联到这里</span>' +
      bl.map(function (b) { return '<button data-jump="' + b.from + '"' + (b.item != null ? ' data-item="' + b.item + '"' : '') + '>' + esc2(fullLabel(b.from, b.item)) + ' ›</button>'; }).join('') +
      '</footer>' : '';

    sheet.innerHTML = head + '<div class="cl-scroll">' + title + lead + body + foot + '</div>';
    if (flash != null) {
      var el = sheet.querySelector('.cl-item[data-i="' + flash + '"]');
      if (el) { el.classList.add('is-flash'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); setTimeout(function () { el.classList.remove('is-flash'); }, 1600); }
    }
  }

  function itemView(it, i, arrow) {
    var nums = it.nums.length ? '<div class="cl-nums">' + it.nums.map(function (n) { return '<span class="cl-num"><b>' + esc2(n.v) + '</b><small>' + esc2(n.u) + '</small></span>'; }).join('') + '</div>' : '';
    var forms = it.forms.length ? '<div class="cl-forms">' + it.forms.map(function (x) { return '<span>' + esc2(x) + '</span>'; }).join('') + '</div>' : '';
    var live = it.links.filter(function (l) { return findNode(l.to); });   // 指向已删除节点的关联不显示
    var links = live.length ? '<div class="cl-links">' + live.map(function (l) {
      return '<button data-jump="' + l.to + '"' + (l.item != null ? ' data-item="' + l.item + '"' : '') + '>关联 → ' + esc2(fullLabel(l.to, l.item)) + '</button>';
    }).join('') + '</div>' : '';
    var why = it.why ? '<details class="cl-why"><summary>为什么</summary><p>' + esc2(it.why) + '</p></details>' : '';
    return '<li class="cl-item" data-i="' + i + '"><span class="cl-seq">' + seq(i) + '</span>' +
      '<div class="cl-body"><h3>' + esc2(it.t || '（未命名）') + '</h3>' + nums + forms + why + links + '</div></li>' +
      (arrow ? '<li class="cl-arrow" aria-hidden="true">在此基础上</li>' : '');
  }

  function itemEdit(it, i, selfId) {
    var nums = it.nums.map(function (n, k) {
      return '<span class="cl-num-in"><input data-f="num.v" data-k="' + k + '" value="' + esc2(n.v) + '" placeholder="300"><input data-f="num.u" data-k="' + k + '" value="' + esc2(n.u) + '" placeholder="单位，如 大卡缺口"><button data-delnum="' + k + '" aria-label="删除数字">×</button></span>';
    }).join('');
    var links = it.links.map(function (l, k) {
      return '<span class="cl-link-in">' + nodeSelect('link', l.to, selfId, k) + '<button data-dellink="' + k + '" aria-label="删除关联">×</button></span>';
    }).join('');
    return '<li class="cl-item is-edit" data-i="' + i + '" draggable="true">' +
      '<span class="cl-handle" title="拖动调整顺序" aria-hidden="true">⠿</span><span class="cl-seq">' + seq(i) + '</span>' +
      '<div class="cl-body">' +
        '<label class="cl-fld"><span>主张</span><input data-f="t" value="' + esc2(it.t) + '" placeholder="一句话主张"></label>' +
        '<div class="cl-fld"><span>数字</span><div class="cl-row">' + nums + '<button class="cl-mini" data-addnum>＋ 数字</button></div></div>' +
        '<label class="cl-fld"><span>为什么</span><textarea data-f="why" rows="2" placeholder="可选">' + esc2(it.why) + '</textarea></label>' +
        '<label class="cl-fld"><span>形式</span><input data-f="forms" value="' + esc2(it.forms.join('、')) + '" placeholder="用顿号或逗号分隔，如 跑步、篮球、游泳"></label>' +
        '<div class="cl-fld"><span>关联</span><div class="cl-row">' + links + '<button class="cl-mini" data-addlink>＋ 关联</button></div></div>' +
        '<div class="cl-item-ops"><button data-move="-1" aria-label="上移">↑</button><button data-move="1" aria-label="下移">↓</button><button class="cl-del" data-delitem>删除这一条</button></div>' +
      '</div></li>';
  }

  function nodeSelect(kind, val, selfId, k) {
    var opts = '<option value="">选择节点…</option>' + domains.map(function (d) {
      return '<optgroup label="' + esc2(d.name) + '">' + d.nodes.filter(function (n) { return n.id !== selfId; }).map(function (n) {
        return '<option value="' + n.id + '"' + (n.id === val ? ' selected' : '') + '>' + esc2(n.t) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
    return '<select data-f="' + kind + '"' + (k != null ? ' data-k="' + k + '"' : '') + '>' + opts + '</select>';
  }

  /* ———————— 打开 / 关闭（从节点位置展开的动效） ———————— */
  function open(id, fromEl, flash) {
    if (!root) build();
    state.id = id; state.edit = false; state.stack = [];
    state.origin = fromEl || null;
    render(flash);
    aimAt(fromEl);
    root.classList.remove('is-closing');
    // 重新触发进场动画
    sheet.style.animation = 'none'; void sheet.offsetWidth; sheet.style.animation = '';
    root.classList.add('is-open');
    document.documentElement.classList.add('cl-lock');
    setTimeout(function () { sheet.focus({ preventScroll: true }); }, 30);
  }
  /* 记下节点相对屏幕中心的偏移，动画从这里飞出、收回到这里。
     页面整体 zoom 缩放时，弹层在 zoom 之内，坐标要换算回同一坐标系 */
  /* 页面整体按设计宽度 zoom 缩放（窄屏会缩得很小），弹层反向抵消，始终按真实像素显示 */
  function unzoom() {
    var z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
    root.style.zoom = z < 0.998 ? String(1 / z) : '';
  }
  function aimAt(el) {
    unzoom();
    if (!el || !document.contains(el)) { sheet.style.setProperty('--dx', '0px'); sheet.style.setProperty('--dy', '0px'); return; }
    var r = el.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var vw = innerWidth, vh = innerHeight;
    sheet.style.setProperty('--dx', Math.round(cx - vw / 2) + 'px');
    sheet.style.setProperty('--dy', Math.round(cy - vh / 2) + 'px');
  }
  function originFor(id) {
    var f = findNode(id); if (!f || f.di !== active) return null;
    return mapNodes.querySelectorAll('.map-node')[f.ni] || null;
  }
  function close() {
    if (!root || !root.classList.contains('is-open')) return;
    // 收回到当前这一页对应的节点（翻页、跳转后也一样）
    state.origin = originFor(state.id) || state.origin;
    aimAt(state.origin);
    root.classList.add('is-closing');
    setTimeout(function () {
      root.classList.remove('is-open', 'is-closing');
      document.documentElement.classList.remove('cl-lock');
      if (state.origin && document.contains(state.origin)) state.origin.focus({ preventScroll: true });
    }, 260);
    state.edit = false;
  }
  function go(id, flash, push) {
    if (push) state.stack.push({ id: state.id });
    var f = findNode(id);
    if (f && f.di !== active) { active = f.di; renderAll(); }
    state.id = id; state.edit = false;
    sheet.classList.remove('is-turn'); void sheet.offsetWidth; sheet.classList.add('is-turn');
    render(flash);
    var sc = sheet.querySelector('.cl-scroll'); if (sc && flash == null) sc.scrollTop = 0;
  }

  /* ———————— 交互 ———————— */
  function itemIndex(el) { var li = el.closest('.cl-item'); return li ? +li.dataset.i : -1; }

  function onClick(e) {
    var t = e.target, c = cards[state.id];
    var b = t.closest('button, [data-x]');
    if (!b) return;
    if (b.hasAttribute('data-x')) return close();
    if (b.hasAttribute('data-back')) { var last = state.stack.pop(); if (last) go(last.id, null, false); return; }
    if (b.dataset.go) return go(b.dataset.go, null, false);
    if (b.dataset.jump) return go(b.dataset.jump, b.dataset.item != null ? +b.dataset.item : null, true);
    if (b.dataset.domain != null) { active = +b.dataset.domain; renderAll(); return close(); }
    if (b.hasAttribute('data-edit')) {
      state.edit = !state.edit;
      if (state.edit) c.touched = 1;   // 用户动过的卡，以后不再被种子覆盖
      if (!state.edit) { tidy(c); saveCards(); syncNodeName(); toast('已保存'); }
      return render();
    }
    if (!state.edit) return;
    var i = itemIndex(b);
    if (b.hasAttribute('data-additem')) { c.items.push({ t: '', nums: [], why: '', forms: [], links: [] }); render(); focusLast(); return; }
    if (b.hasAttribute('data-delitem')) { if (confirm('删除「' + (c.items[i].t || '这一条') + '」？')) { var order = c.items.map(function (_, k) { return k; }); order.splice(i, 1); c.items.splice(i, 1); remapLinks(state.id, order); saveCards(); render(); } return; }
    if (b.dataset.move) { var j = i + (+b.dataset.move); if (j >= 0 && j < c.items.length) { moveItem(c, i, j); saveCards(); render(); } return; }
    if (b.hasAttribute('data-addnum')) { c.items[i].nums.push({ v: '', u: '' }); render(); return; }
    if (b.dataset.delnum != null) { c.items[i].nums.splice(+b.dataset.delnum, 1); saveCards(); render(); return; }
    if (b.hasAttribute('data-addlink')) { c.items[i].links.push({ to: '' }); render(); return; }
    if (b.dataset.dellink != null) { c.items[i].links.splice(+b.dataset.dellink, 1); saveCards(); render(); return; }
  }
  function focusLast() { var ins = sheet.querySelectorAll('.cl-item:last-of-type input[data-f="t"]'); if (ins.length) ins[ins.length - 1].focus(); }

  function onInput(e) {
    var el = e.target, f = el.dataset && el.dataset.f; if (!f || !state.edit) return;
    var c = cards[state.id], i = itemIndex(el), k = el.dataset.k != null ? +el.dataset.k : null;
    if (f === 'mode') { c.mode = el.value; saveCards(); return render(); }
    if (f === 'gate') { c.gate = el.value || undefined; return saveCards(); }
    if (f === 'settled' || f === 'lead') { c[f] = el.value; return saveCards(); }
    if (i < 0) return;
    var it = c.items[i];
    if (f === 't' || f === 'why') it[f] = el.value;
    else if (f === 'forms') it.forms = el.value.split(/[、,，;；\n]+/).map(function (s) { return s.trim(); }).filter(Boolean);
    else if (f === 'num.v') it.nums[k].v = el.value.trim();
    else if (f === 'num.u') it.nums[k].u = el.value.trim();
    else if (f === 'link') it.links[k] = { to: el.value };
    saveCards();
  }
  function tidy(c) {
    c.items = c.items.filter(function (it) { return it.t.trim() || it.why.trim() || it.nums.length || it.forms.length; });
    c.items.forEach(function (it) {
      it.t = it.t.trim(); it.why = it.why.trim();
      it.nums = it.nums.filter(function (n) { return n.v || n.u; });
      it.links = it.links.filter(function (l) { return l.to; });
    });
  }
  function syncNodeName() { var f = findNode(state.id); if (f) { cards[state.id].name = f.n.t; } }

  function onKey(e) {
    if (!root || !root.classList.contains('is-open')) return;
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
    if (e.key === 'Escape') { e.preventDefault(); if (state.edit) { state.edit = false; tidy(cards[state.id]); saveCards(); render(); } else close(); return; }
    if (typing || state.edit) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      var sib = siblings(state.id), pos = sib.indexOf(state.id);
      if (sib.length > 1) { e.preventDefault(); go(sib[(pos + (e.key === 'ArrowRight' ? 1 : -1) + sib.length) % sib.length], null, false); }
    }
    if (e.key === 'Tab') trapFocus(e);
  }
  function trapFocus(e) {
    var f = sheet.querySelectorAll('button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])');
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* 拖动排序（编辑态） */
  function bindDrag() {
    var from = -1;
    root.addEventListener('dragstart', function (e) {
      var li = e.target.closest && e.target.closest('.cl-item.is-edit'); if (!li) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && li.contains(document.activeElement)) { e.preventDefault(); return; }
      from = +li.dataset.i; li.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(from)); } catch (x) {}
    });
    root.addEventListener('dragover', function (e) { if (from < 0) return; var li = e.target.closest('.cl-item.is-edit'); if (li) { e.preventDefault(); li.classList.add('is-over'); } });
    root.addEventListener('dragleave', function (e) { var li = e.target.closest && e.target.closest('.cl-item'); if (li) li.classList.remove('is-over'); });
    root.addEventListener('drop', function (e) {
      var li = e.target.closest('.cl-item.is-edit'); if (!li || from < 0) return; e.preventDefault();
      var to = +li.dataset.i, c = cards[state.id];
      if (to !== from) { moveItem(c, from, to); saveCards(); }
      from = -1; render();
    });
    root.addEventListener('dragend', function () { from = -1; sheet.querySelectorAll('.is-drag,.is-over').forEach(function (x) { x.classList.remove('is-drag', 'is-over'); }); });
  }

  /* ———————— 接入现有页面 ———————— */
  // 节点点击 → 打开卡片（编辑/删除小按钮、添加按钮保持原有行为）
  mapNodes.addEventListener('click', function (e) {
    if (e.target.closest('[data-edit],[data-del],[data-add]')) return;
    var btn = e.target.closest('.map-node'); if (!btn) return;
    e.stopImmediatePropagation();
    var i = [].indexOf.call(mapNodes.querySelectorAll('.map-node'), btn);
    var n = domains[active].nodes[i]; if (!n) return;
    ensureIds();
    open(n.id, btn);
  }, true);

  // 删除节点时一并删除它的卡片；新增节点时建空卡
  var _save = saveDomains;
  saveDomains = function () {
    _save();
    var alive = {};
    domains.forEach(function (d) { (d.nodes || []).forEach(function (n) { if (!n.id) n.id = uid(); alive[n.id] = 1; if (!cards[n.id]) cards[n.id] = { name: n.t, sub: n.s, mode: 'list', items: [] }; }); });
    Object.keys(cards).forEach(function (id) { if (!alive[id] && !SEED.nodes[id]) delete cards[id]; });
    _save();
    saveCards();
  };

  // 领域图标：按领域自带的 icon 键，而不是固定顺序
  var _polish = window.polishIcons;
  function paintDomainIcons() {
    document.querySelectorAll('.domain>span').forEach(function (e, i) { var d = domains[i]; if (d && d.icon && /^[a-z]+$/.test(d.icon)) e.innerHTML = svgIcon(d.icon); });
  }
  var _renderAll2 = renderAll;
  renderAll = function () { _renderAll2(); paintDomainIcons(); };

  /* ———————— 启动 ———————— */
  loadCards();
  migrate();
  Object.keys(cards).forEach(function (id) { normCard(cards[id]); });
  saveCards();
  ensureIds();
  renderAll();
  // ?card=节点id 直接打开某张卡
  var q = /[?&]card=([\w-]+)/.exec(location.search);
  if (q && findNode(q[1])) { var fq = findNode(q[1]); if (fq.di !== active) { active = fq.di; renderAll(); } open(q[1], originFor(q[1])); }
  window.KongwoCards = { open: function (id) { open(id, null); }, cards: function () { return cards; } };
})();
