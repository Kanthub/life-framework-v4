/* 本地文件存储桥（在 app.js 之前加载）
   - 通过 server.py 打开时：启动先从 data/kongwo-data.json 读回数据，之后每次保存自动写回文件
   - 直接双击 index.html 打开时：没有服务器，照旧只存浏览器，并在页面角落提示
   app.js 仍然用 localStorage 读写，这里只负责“镜像到文件”，不改动业务代码 */
(function () {
  var KEYS = ['lf4-domains', 'kongwo-records', 'kongwo-paper', 'kongwo-geo', 'kongwo-cards', 'kongwo-fw-v'];
  var API = '/api/data';
  var SYNC_MARK = 'kongwo-file-synced';   // 标记：这个浏览器已经和数据文件同步过

  // 合并两份时间线记录（按 日期+时间+内容 去重），避免任何一边的记录丢失
  function mergeRecords(a, b) {
    var list = [], seen = {};
    [a, b].forEach(function (s) {
      var arr; try { arr = JSON.parse(s || '[]'); } catch (e) { arr = []; }
      if (!Array.isArray(arr)) return;
      arr.forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        var id = [r.date, r.time, r.title, r.desc].join('\u0001');
        if (!seen[id]) { seen[id] = 1; list.push(r); }
      });
    });
    list.sort(function (x, y) { return (x.date + ' ' + x.time).localeCompare(y.date + ' ' + y.time); });
    return JSON.stringify(list);
  }
  var online = location.protocol === 'http:' || location.protocol === 'https:';
  var status = { mode: 'browser', savedAt: null, file: null, error: null };
  window.KongwoStore = status;

  /* 1. 启动：同步读取文件数据（必须在 app.js 读取 localStorage 之前完成） */
  if (online) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', API + '?t=' + Date.now(), false);
      xhr.send(null);
      if (xhr.status === 200) {
        var res = JSON.parse(xhr.responseText);
        var data = (res && res.data) || {};
        var synced = localStorage.getItem(SYNC_MARK) === '1';
        var push = {};
        KEYS.forEach(function (k) {
          var fv = typeof data[k] === 'string' ? data[k] : null;
          var bv = localStorage.getItem(k);
          if (synced) {
            // 这个浏览器已经和文件同步过：文件为准
            if (fv != null) localStorage.setItem(k, fv);
            return;
          }
          // 第一次连接文件：不覆盖浏览器里的数据，而是合并
          if (k === 'kongwo-records') {
            var merged = mergeRecords(fv, bv);
            localStorage.setItem(k, merged);
            if (merged !== fv) push[k] = merged;
          } else if (bv != null) {
            if (bv !== fv) push[k] = bv;      // 浏览器里的设置保留，并写进文件
          } else if (fv != null) {
            localStorage.setItem(k, fv);
          }
        });
        localStorage.setItem(SYNC_MARK, '1');
        status.mode = 'file';
        status.file = res.file;
        status.savedAt = data._savedAt || null;
        status.initialPush = push;
      }
    } catch (e) { status.error = String(e); }
  }

  if (status.mode !== 'file') return;

  /* 2. 之后的每次写入：合并 400ms 内的改动，一次性写回文件 */
  var pending = {}, timer = null, inflight = false;
  function flush() {
    timer = null;
    if (inflight) { timer = setTimeout(flush, 200); return; }
    var body = pending; pending = {};
    if (!Object.keys(body).length) return;
    inflight = true;
    fetch(API, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Kongwo': '1' },
      body: JSON.stringify(body),
      keepalive: true
    }).then(function (r) { return r.json(); }).then(function (r) {
      inflight = false;
      if (r && r.ok) { status.savedAt = r.savedAt; status.error = null; paint('saved'); }
      else throw new Error((r && r.error) || 'save failed');
    }).catch(function (e) {
      inflight = false;
      // 失败的改动放回队列，下次再试
      Object.keys(body).forEach(function (k) { if (!(k in pending)) pending[k] = body[k]; });
      status.error = String(e); paint('error');
      timer = setTimeout(flush, 3000);
    });
  }
  function queue(k, v) {
    if (KEYS.indexOf(k) < 0) return;
    pending[k] = v;
    paint('saving');
    clearTimeout(timer); timer = setTimeout(flush, 400);
  }

  var rawSet = Storage.prototype.setItem, rawRemove = Storage.prototype.removeItem;
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === window.localStorage) queue(String(k), String(v));
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === window.localStorage) queue(String(k), null);
  };

  // 关闭页面前把没写完的改动发出去
  addEventListener('pagehide', function () { if (Object.keys(pending).length) flush(); });

  // 首次连接：把合并后的结果写回文件
  var init = status.initialPush || {};
  Object.keys(init).forEach(function (k) { pending[k] = init[k]; });
  if (Object.keys(pending).length) timer = setTimeout(flush, 600);

  /* 3. 页面角落的保存状态 */
  var badge;
  function paint(state) {
    if (!badge) return;
    var t = status.savedAt ? status.savedAt.slice(11, 16) : '';
    badge.dataset.state = state;
    badge.textContent = state === 'saving' ? '正在保存…'
      : state === 'error' ? '保存失败，稍后重试'
      : '已存到本机' + (t ? ' · ' + t : '');
    badge.title = '数据文件：' + (status.file || '') + (status.error ? '\n' + status.error : '');
  }
  document.addEventListener('DOMContentLoaded', function () {
    badge = document.createElement('div');
    badge.className = 'store-badge';
    badge.setAttribute('role', 'status');
    badge.setAttribute('aria-live', 'polite');
    document.body.appendChild(badge);
    paint(status.error ? 'error' : 'saved');
  });
})();

/* 没有通过 server.py 打开时，提示数据只在浏览器里 */
(function () {
  if (window.KongwoStore && window.KongwoStore.mode === 'file') return;
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.className = 'store-badge';
    b.dataset.state = 'browser';
    b.setAttribute('role', 'status');
    b.textContent = '仅存于浏览器 · 用「启动空我人生」打开可存到本机';
    b.title = '双击项目文件夹里的「启动空我人生.bat」，数据会自动保存到 data/kongwo-data.json';
    document.body.appendChild(b);
  });
})();
