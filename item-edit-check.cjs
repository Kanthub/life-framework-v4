/* item-edit-check.cjs — 领域条目可编辑化校验：节点/原则/实践 增删改 + 持久化 + 回归 */
const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch({ headless: true, executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' });
  const ctx = await b.newContext({ viewport: { width: 1536, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  const url = 'file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/');
  await p.goto(url); await p.waitForTimeout(400);
  const R = {};

  // —— 节点：满 6 时无空位；删 1 个出现「＋」；再加回变 6 ——
  R.nodes0 = await p.locator('.map-node').count();
  R.noAddSlotAt6 = await p.locator('.map-add').count() === 0;
  await p.locator('.map-node').first().hover();
  await p.locator('.map-node').first().locator('[data-del]').click();
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.nodesAfterDel = await p.locator('.map-node').count();
  R.addSlotAfterDel = await p.locator('.map-add').count();
  await p.locator('.map-add').click();
  await p.fill('#nTitle', '拉伸'); await p.fill('#nSub', '睡前放松');
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.nodesAfterAdd = await p.locator('.map-node').count();
  R.newNodeText = await p.locator('.map-node').last().locator('b').textContent();
  // 编辑节点：改名
  await p.locator('.map-node').last().hover();
  await p.locator('.map-node').last().locator('[data-edit]').click();
  await p.fill('#nTitle', '筋膜放松'); await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.nodeEdited = await p.locator('.map-node').last().locator('b').textContent();

  // —— 原则：新增 / 编辑 / 删除，计数徽标同步 ——
  R.pr0 = await p.locator('.lists #principles h4 i').textContent();
  await p.locator('.lists #principles header button').click();
  await p.fill('#pTitle', '测试原则X'); await p.fill('#pSub', '用于校验');
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.prAfterAdd = await p.locator('.lists #principles h4 i').textContent();
  R.prHasNew = (await p.locator('#principleList').textContent()).includes('测试原则X');
  await p.locator('#principleList li').first().locator('.li-more').click();
  await p.locator('.pop-menu button').first().click(); // 编辑原则
  await p.fill('#pTitle', '身体是唯一的1');
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.prEdited = (await p.locator('#principleList li').first().locator('b').textContent()) === '身体是唯一的1';
  await p.locator('#principleList li').last().locator('.li-more').click();
  await p.locator('.pop-menu button').nth(1).click(); // 删除原则
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.prAfterDel = await p.locator('.lists #principles h4 i').textContent();

  // —— 实践：新增（含节奏下拉）/ 勾选切换 / 删除 ——
  R.pt0 = await p.locator('.lists #practices h4 i').textContent();
  await p.locator('.lists #practices header button').click();
  await p.fill('#prTitle', '晚上拉伸10分钟');
  await p.selectOption('#prCad', '每日');
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.ptAfterAdd = await p.locator('.lists #practices h4 i').textContent();
  R.ptCad = await p.locator('#practiceList li').last().locator('small').textContent();
  const lastCb = p.locator('#practiceList li').last().locator('input[type=checkbox]');
  await p.locator('#practiceList li').last().locator('label').click(); await p.waitForTimeout(100);
  R.ptChecked = await lastCb.isChecked();
  await p.locator('#practiceList li').last().locator('.li-more').click();
  await p.locator('.pop-menu button').nth(1).click();
  await p.locator('#modal [data-ok]').click(); await p.waitForTimeout(150);
  R.ptAfterDel = await p.locator('.lists #practices h4 i').textContent();

  // —— 节点点击旧交互仍在（带入快速记录） ——
  await p.locator('.map-node').first().click(); await p.waitForTimeout(100);
  R.quickFilled = ((await p.locator('#quickText').inputValue()) || '').length > 0;

  // —— 持久化：刷新后编辑过的原则与节点仍在 ——
  await p.reload(); await p.waitForTimeout(400);
  R.persistAfterReload = (await p.locator('#principleList li').first().locator('b').textContent()) === '身体是唯一的1' &&
    (await p.locator('.map-node').last().locator('b').textContent()) === '筋膜放松' &&
    (await p.locator('.lists #principles h4 i').textContent()) === '3';
  // 恢复示例数据 → 回到种子状态
  await p.locator('.panel-actions button').nth(2).click();
  await p.locator('.pop-menu button', { hasText: '恢复示例数据' }).click(); await p.waitForTimeout(150);
  R.seedRestored = await p.locator('.map-node').count() === 6 &&
    (await p.locator('#principleList li').first().locator('b').textContent()) === '身体是1，其他都是0';

  await p.locator('.framework').screenshot({ path: 'check-edit.png' });
  console.log(JSON.stringify({ R, errors }, null, 2));
  const pass = R.nodes0 === 6 && R.noAddSlotAt6 && R.nodesAfterDel === 5 && R.addSlotAfterDel === 1 &&
    R.nodesAfterAdd === 6 && R.newNodeText === '拉伸' && R.nodeEdited === '筋膜放松' &&
    R.pr0 === '3' && R.prAfterAdd === '4' && R.prHasNew && R.prEdited && R.prAfterDel === '3' &&
    R.pt0 === '4' && R.ptAfterAdd === '5' && R.ptCad.includes('每日') && R.ptChecked && R.ptAfterDel === '4' &&
    R.quickFilled && R.persistAfterReload && R.seedRestored && !errors.length;
  await b.close(); if (!pass) process.exitCode = 1;
})();
