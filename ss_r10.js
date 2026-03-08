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

  // 1. Analyze tab full
  await page.screenshot({ path: 'ss_r10_01_analyze.png', fullPage: false });
  console.log('Shot 1: analyze tab');

  // 2. Gallery
  const navBtns = await page.$$('.bottom-nav-item');
  if (navBtns[1]) {
    await navBtns[1].click();
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.screenshot({ path: 'ss_r10_02_gallery.png', fullPage: false });
  console.log('Shot 2: gallery');

  // 3. First card — ring glow test
  const cards = await page.$$('.rg-card');
  if (cards[0]) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 1000));
  }
  await page.screenshot({ path: 'ss_r10_03_sheet_hero.png', fullPage: false });
  console.log('Shot 3: sheet hero');

  // 4. Scroll sheet with touch events (simulate finger swipe)
  await page.touchscreen.tap(390 / 2, 600);
  await page.mouse.wheel({ deltaY: 600 });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'ss_r10_04_sheet_body.png', fullPage: false });
  console.log('Shot 4: sheet body scrolled');

  // 5. Scroll more to see profit section
  await page.mouse.wheel({ deltaY: 600 });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: 'ss_r10_05_sheet_deep.png', fullPage: false });
  console.log('Shot 5: sheet deep scroll');

  await browser.close();
  console.log('Done — R10 screenshots');
})();
