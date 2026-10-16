const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 1024 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file:///' + path.resolve(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(400);
  const log = [];

  // 1. 按天导航
  await p.locator('.day-prev').click(); await p.waitForTimeout(150);
  log.push(['day-prev 标题', await p.locator('.month b').innerText()]);
  log.push(['day 视图记录数', String(await p.locator('.timeline-list article').count())]);
  // 2. 回到今天，day-next 应禁用
  await p.locator('.month-today').click(); await p.waitForTimeout(150);
  log.push(['今天 day-next 禁用', String(await p.locator('.day-next').isDisabled())]);
  // 3. 编辑记录：••• → 编辑记录 → 改标题 → 确认
  await p.locator('.timeline-list article').nth(0).locator('button.event-more').click(); await p.waitForTimeout(150);
  await p.locator('.pop-menu button').nth(0).click(); await p.waitForTimeout(150);
  log.push(['编辑弹窗出现', String(await p.locator('#modal.open').count())]);
  await p.fill('#editTitle', '晨跑 6.0 公里（改）');
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  log.push(['编辑后首条', (await p.locator('.timeline-list article div b').first().innerText())]);
  // 4. 删除记录
  const before = await p.locator('.timeline-list article').count();
  await p.locator('.timeline-list article').nth(1).locator('button.event-more').click(); await p.waitForTimeout(120);
  await p.locator('.pop-menu button').nth(2).click(); await p.waitForTimeout(120);
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  log.push(['删除前后条数', `${before}→${await p.locator('.timeline-list article').count()}`]);
  // 5. 月导航
  await p.locator('.month-prev').click(); await p.waitForTimeout(150);
  log.push(['month-prev 标题', await p.locator('.month b').innerText()]);
  await p.locator('.month-next').click(); await p.waitForTimeout(150);
  log.push(['month-next 回当月', await p.locator('.month b').innerText()]);
  log.push(['当月 month-next 禁用', String(await p.locator('.month-next').isDisabled())]);
  // 6. 记一笔真实保存
  await p.fill('#quickText', '写了一页笔记');
  await p.click('#saveRecord'); await p.waitForTimeout(200);
  log.push(['保存后今天条数', String(await p.locator('.timeline-list article').count())]);
  log.push(['最新一条', await p.locator('.timeline-list article div b').last().innerText()]);
  console.log(JSON.stringify(log, null, 1));
  console.log('errors:', errs);
  await p.screenshot({ path: 'current-full.png', fullPage: true });
  await b.close();
  if (errs.length) process.exitCode = 1;
})();
