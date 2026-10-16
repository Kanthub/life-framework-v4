const { chromium } = require('C:/Users/Kant/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 500 } });
  await page.goto('file:///' + path.join(__dirname, 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(250);
  const result = await page.evaluate(() => {
    const sidebar = document.querySelector('.sidebar');
    const quote = sidebar.querySelector('blockquote');
    const lastTool = sidebar.querySelector('.side-tools button:last-child');
    const quoteBox = quote.getBoundingClientRect();
    const toolBox = lastTool.getBoundingClientRect();
    return {
      scrollHeight: sidebar.scrollHeight,
      clientHeight: sidebar.clientHeight,
      quoteFont: getComputedStyle(quote).fontSize,
      overlap: toolBox.bottom > quoteBox.top,
      toolLabels: [...sidebar.querySelectorAll('.side-tools button')].map(button => button.textContent.trim())
    };
  });
  await page.screenshot({ path: path.join(__dirname, 'preview-sidebar-zoom.png') });
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
  if (result.overlap || result.toolLabels.some(label => !['搜索', '收纳箱', '设置'].includes(label))) process.exitCode = 1;
})();
