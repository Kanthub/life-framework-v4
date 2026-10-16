const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const p = await b.newPage({ viewport: { width: 1536, height: 864 }, deviceScaleFactor: 2 });
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await p.waitForTimeout(400);
  const pa = p.locator('.panel-actions button').first();
  const r = {};

  r.label0 = await p.textContent('#domainFilter');
  await pa.click();                                   // 打开
  r.open1 = await p.locator('.pop-menu').count();
  r.items = await p.locator('.pop-menu button').count();
  r.activeIdx = await p.evaluate(() => [...document.querySelectorAll('.pop-menu button')].findIndex(b => b.classList.contains('on')));
  await pa.click();                                   // 再点同一个按钮 → 收起
  r.closedByToggle = (await p.locator('.pop-menu').count()) === 0;

  await pa.click();                                   // 打开
  await p.mouse.click(400, 500);                      // 点外部 → 收起
  r.closedByOutside = (await p.locator('.pop-menu').count()) === 0;

  await pa.click();                                   // 打开
  await p.keyboard.press('Escape');                   // Esc → 收起
  r.closedByEsc = (await p.locator('.pop-menu').count()) === 0;

  await pa.click();                                   // 打开，选第 3 项（工作创造）
  await p.locator('.pop-menu button').nth(2).click();
  await p.waitForTimeout(150);
  r.activeAfterPick = await p.evaluate(() => document.getElementById('domainTitle').textContent.trim());
  r.labelAfterPick = await p.textContent('#domainFilter');

  // 添加第 7 个领域 → 标签应自动变为「七大领域」，菜单含 7 项
  await p.locator('.panel-actions button').nth(1).click();
  await p.fill('#newDomain', ' Testing ');
  await p.locator('#modal [data-ok]').click();
  await p.waitForTimeout(150);
  r.labelAfterAdd = await p.textContent('#domainFilter');
  await pa.click();
  r.itemsAfterAdd = await p.locator('.pop-menu button').count();
  r.menuOpenAfterAdd = await p.locator('.pop-menu').count();
  await p.keyboard.press('Escape');

  await p.locator('.framework .panel-title').screenshot({ path: path.join(__dirname, 'check-dropdown.png') });
  console.log(JSON.stringify({ ...r, errors }, null, 2));
  await b.close();
})();
