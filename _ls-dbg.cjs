const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const ctx = await b.newContext();
  const p = await ctx.newPage();
  const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
  await p.goto(url); await p.waitForTimeout(300);
  const r1 = await p.evaluate(() => {
    try { localStorage.setItem('_probe', '1'); return { set: localStorage.getItem('_probe'), keys: Object.keys(localStorage) }; }
    catch (e) { return { err: e.name + ': ' + e.message }; }
  });
  await p.reload(); await p.waitForTimeout(300);
  const r2 = await p.evaluate(() => { try { return { probe: localStorage.getItem('_probe') }; } catch (e) { return { err: e.message }; } });
  console.log(JSON.stringify({ r1, r2 }, null, 2));
  await b.close();
})();
