const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  const page = await browser.newPage();

  // Login
  await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  await page.waitForSelector('input[type="email"], input[type="text"]', { timeout: 8000 });
  const inputs = await page.$$('input');
  await inputs[0].click(); await inputs[0].type('1062970273@qq.com');
  await inputs[1].click(); await inputs[1].type('123456');
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // 1. Analyze tab (home)
  await page.screenshot({ path: 'ss_r6_01_analyze.png', fullPage: false });
  console.log('Shot 1: analyze tab');

  // 2. Click Results tab
  const navBtns = await page.$$('.bottom-nav-item');
  if (navBtns[1]) {
    await navBtns[1].click();
    await new Promise(r => setTimeout(r, 600));
  }
  await page.screenshot({ path: 'ss_r6_02_gallery.png', fullPage: false });
  console.log('Shot 2: results gallery');

  // 3. Tap first card
  const cards = await page.$$('.rg-card');
  if (cards[0]) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 700));
  }
  await page.screenshot({ path: 'ss_r6_03_sheet.png', fullPage: false });
  console.log('Shot 3: result sheet open');

  // 4. Scroll sheet down
  const panel = await page.$('.rs-panel');
  if (panel) {
    await page.evaluate(el => { el.scrollTop = 400; }, panel);
    await new Promise(r => setTimeout(r, 400));
  }
  await page.screenshot({ path: 'ss_r6_04_sheet_scroll.png', fullPage: false });
  console.log('Shot 4: sheet scrolled');

  await browser.close();
  console.log('Done');
})();
