const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(400);
  const info = await p.evaluate(() => {
    const btn = document.querySelector('.panel-actions button');
    const caret = btn.querySelector('.caret-icon');
    const r = btn.getBoundingClientRect(), c = caret.getBoundingClientRect();
    return {
      font: getComputedStyle(btn).fontFamily.slice(0, 30),
      fontSize: getComputedStyle(btn).fontSize,
      caretSize: c.width.toFixed(1) + 'x' + c.height.toFixed(1),
      gap: (c.left - (r.left + btn.clientWidth - parseFloat(getComputedStyle(btn).paddingRight))) .toFixed(1),
      caretCenterY: +(c.top + c.height / 2).toFixed(1),
      btnCenterY: +(r.top + r.height / 2).toFixed(1),
    };
  });
  const panel = await p.locator('.framework .panel-title').screenshot({ path: path.join(__dirname, 'check-header.png') });
  console.log(JSON.stringify({ ...info, errors }, null, 2));
  await b.close();
})();
