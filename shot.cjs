const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 1024 }, deviceScaleFactor: 2 });
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(500);
  await p.screenshot({ path: path.join(__dirname, 'current-full.png'), fullPage: true });
  const fonts = await p.evaluate(() => {
    const q = s => { const el = document.querySelector(s); return el ? getComputedStyle(el).fontFamily : 'N/A'; };
    const probe = (fam) => document.fonts.check(`16px "${fam}"`);
    return {
      title: q('.title-text'),
      body: q('body'),
      motto: q('.motto'),
      notoSerifSC: probe('Noto Serif SC'),
      notoSansSC: probe('Noto Sans SC'),
      songti: probe('Songti SC'),
      simsun: probe('SimSun'),
      lxgw: probe('LXGW WenKai Local'),
    };
  });
  console.log(JSON.stringify(fonts, null, 2));
  await b.close();
})();
