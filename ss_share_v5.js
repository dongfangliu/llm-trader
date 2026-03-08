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
  await page.waitForSelector('input', { timeout: 8000 });
  const inputs = await page.$$('input');
  await inputs[0].click(); await inputs[0].type('1062970273@qq.com');
  await inputs[1].click(); await inputs[1].type('123456');
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  // Go to gallery tab
  const navBtns = await page.$$('.bottom-nav-item');
  if (navBtns[1]) {
    await navBtns[1].click();
    await new Promise(r => setTimeout(r, 1200));
  }

  // Open first card's result sheet
  const cards = await page.$$('.rg-card');
  if (cards[0]) {
    await cards[0].click();
    await new Promise(r => setTimeout(r, 1200));
  }

  // Shot 1: sheet hero
  await page.screenshot({ path: 'ss_share_v5_sheet_hero.png', fullPage: false });
  console.log('Shot 1: sheet hero');

  // Shot 2: footer (scroll to bottom)
  await page.evaluate(() => {
    const panel = document.querySelector('.rs-panel');
    if (panel) panel.scrollTop = 9999;
  });
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: 'ss_share_v5_footer.png', fullPage: false });
  console.log('Shot 2: footer with bookmark + share CTA');

  // Shot 3: tap bookmark button
  const bookmark = await page.$('.rs-btn-bookmark');
  if (bookmark) {
    await bookmark.click();
    await new Promise(r => setTimeout(r, 800));
  }
  await page.screenshot({ path: 'ss_share_v5_bookmarked.png', fullPage: false });
  console.log('Shot 3: bookmarked state');

  // Shot 4: tap share button → generates viral card
  const shareBtn = await page.$('.rs-btn-share-cta');
  if (shareBtn) {
    await shareBtn.click();
    await new Promise(r => setTimeout(r, 3000)); // wait for canvas
  }
  await page.screenshot({ path: 'ss_share_v5_share_preview.png', fullPage: false });
  console.log('Shot 4: share preview sheet open');

  // Shot 5: scroll share preview if needed
  const spsPanel = await page.$('.sps-sheet');
  if (spsPanel) {
    await page.evaluate(() => {
      const s = document.querySelector('.sps-sheet');
      if (s) s.scrollTop = 300;
    });
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: 'ss_share_v5_share_preview_bottom.png', fullPage: false });
    console.log('Shot 5: share preview bottom (platform row)');
  }

  await browser.close();
  console.log('Done — Share V5 screenshots');
})();
