const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
const SIZES = [[1920, 1080], [1536, 864], [1440, 900], [1280, 640], [1152, 720], [1024, 768]];
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 864 } });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(400);
  const rows = [];
  for (const [w, h] of SIZES) {
    await p.setViewportSize({ width: w, height: h });
    await p.waitForTimeout(250);
    rows.push(await p.evaluate(([vw, vh]) => {
      const de = document.documentElement;
      const tl = document.querySelector('.timeline').getBoundingClientRect();
      return {
        vp: vw + 'x' + vh,
        zoom: +(parseFloat(getComputedStyle(de).zoom) || 1).toFixed(3),
        canvas: de.scrollWidth,
        inner: innerWidth,
        overflow: de.scrollWidth - innerWidth,
        timelineRight: +tl.right.toFixed(1),
        timelineVisible: tl.right <= innerWidth + 1,
      };
    }, [w, h]));
  }
  // 回到用户常见尺寸，验证弹层在缩放下的定位
  await p.setViewportSize({ width: 1280, height: 640 });
  await p.waitForTimeout(250);
  await p.locator('.timeline .panel-title>button').click();
  await p.waitForTimeout(150);
  const pop = await p.evaluate(() => {
    const m = document.querySelector('.pop-menu');
    if (!m) return null;
    const r = m.getBoundingClientRect(), a = document.querySelector('.timeline .panel-title>button').getBoundingClientRect();
    return { menuLeft: +r.left.toFixed(1), menuTop: +r.top.toFixed(1), anchorLeft: +a.left.toFixed(1), anchorBottom: +a.bottom.toFixed(1), inViewport: r.left >= 0 && r.right <= innerWidth + 1 && r.top >= 0 };
  });
  await p.screenshot({ path: path.join(__dirname, 'check-fit-1280.png'), fullPage: false });
  console.log(JSON.stringify({ rows, pop, errors }, null, 2));
  await b.close();
})();
