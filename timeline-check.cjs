const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(400);

  const info = await p.evaluate(() => {
    const panel = document.querySelector('.timeline');
    const arts = [...document.querySelectorAll('.timeline-list article')];
    const a0 = arts[0], a3 = arts.find(a => a.classList.contains('group-start')) || arts[arts.length - 1];
    const cs = (el, pe) => getComputedStyle(el, pe);
    const box = el => { const r = el.getBoundingClientRect(); return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) }; };
    return {
      panel: box(panel),
      rows: arts.length,
      rowH: arts.map(a => +a.getBoundingClientRect().height.toFixed(1)),
      cols: cs(a0).gridTemplateColumns,
      lineLeft: cs(a0, '::before').left,
      lineBg: cs(a0, '::before').backgroundColor,
      firstLineTop: cs(a0, '::before').top,
      lastLineBottom: cs(arts[arts.length - 1], '::before').bottom,
      groupStartBorder: cs(a3).borderTopStyle + ' ' + cs(a3).borderTopColor,
      groupStartClasses: arts.filter(a => a.classList.contains('group-start')).length,
      dashedTail: cs(arts[arts.length - 1].querySelector('i'), '::after').borderLeftStyle,
      oldTailHidden: cs(a0.querySelector('i'), '::after').display,
      times: [...document.querySelectorAll('.evt-time')].map(e => e.textContent),
      timeStyle: cs(document.querySelector('.evt-time')).fontStyle,
      monthBtns: [...document.querySelectorAll('.month-nav button')].map(x => x.textContent.trim() + ':' + Math.round(x.getBoundingClientRect().width)),
      monthBorder: cs(document.querySelector('.month')).borderBottomStyle,
      titleBtnBorder: cs(document.querySelector('.timeline .panel-title>button')).borderTopStyle,
      overflowX: panel.scrollWidth - panel.clientWidth,
      docOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  await p.locator('.timeline').screenshot({ path: path.join(__dirname, 'check-timeline.png') });
  await p.screenshot({ path: path.join(__dirname, 'current-full.png'), fullPage: true });
  console.log(JSON.stringify({ ...info, errors }, null, 2));
  await b.close();
})();
