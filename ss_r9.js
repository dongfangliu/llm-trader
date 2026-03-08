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

  // 1. Analyze tab — scroll to bottom to see FAB
  const main = await page.$('.mobile-main, main, [class*="panel"], [class*="content"]');
  await page.evaluate(() => {
    const el = document.querySelector('.panel-scroll, .analyze-scroll, main') || document.body;
    el.scrollTop = el.scrollHeight;
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'ss_r9_01_analyze_fab.png', fullPage: false });
  console.log('Shot 1: analyze tab bottom (FAB area)');

  // 2. Gallery
  const navBtns = await page.$$('.bottom-nav-item');
  if (navBtns[1]) {
    await navBtns[1].click();
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.screenshot({ path: 'ss_r9_02_gallery.png', fullPage: false });
  console.log('Shot 2: gallery');

  // 3. First card — hero with ring glow
  const cards = await page.$$('.rg-card');
  if (cards[0]) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 900));
  }
  await page.screenshot({ path: 'ss_r9_03_sheet_hero.png', fullPage: false });
  console.log('Shot 3: sheet hero (ring glow)');

  // 4. Scroll inside sheet
  await page.evaluate(() => {
    // Try all likely scrollable containers inside the sheet
    const targets = [
      document.querySelector('.rs-panel'),
      document.querySelector('.rs-body'),
      document.querySelector('[class*="rs-"]'),
    ].filter(Boolean);
    targets.forEach(el => { if (el) el.scrollTop += 500; });
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'ss_r9_04_sheet_scrolled.png', fullPage: false });
  console.log('Shot 4: sheet scrolled');

  await browser.close();
  console.log('Done — R9 screenshots');
})();
