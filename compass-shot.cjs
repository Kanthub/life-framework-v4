const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 2 });
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(500);
  const map = await p.$('.life-map');
  await map.screenshot({ path: path.join(__dirname, 'compass-check.png') });
  await b.close();
})();
