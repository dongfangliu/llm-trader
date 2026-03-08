const puppeteer = require('puppeteer');

(async () => {
  const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // Login
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  const emailSel = 'input[type="email"], input[name="email"]';
  const passSel  = 'input[type="password"], input[name="password"]';
  await p.waitForSelector(emailSel, { timeout: 5000 });
  await p.click(emailSel); await p.keyboard.type('1062970273@qq.com');
  await p.click(passSel);  await p.keyboard.type('123456');
  await p.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));

  // Go to Results tab
  const tabs = await p.$$('.bottom-nav-item');
  if (tabs[1]) { await tabs[1].click(); await new Promise(r => setTimeout(r, 1000)); }
  await p.screenshot({ path: 'shot_r3_01_gallery.png' });

  // Tap first card to open ResultSheet
  const firstCard = await p.$('.rg-card');
  if (firstCard) { await firstCard.click(); await new Promise(r => setTimeout(r, 1000)); }
  await p.screenshot({ path: 'shot_r3_02_sheet_top.png' });

  // Scroll down in ResultSheet to see bottom
  await p.evaluate(() => {
    const panel = document.querySelector('.rs-panel');
    if (panel) panel.scrollTop = 400;
  });
  await new Promise(r => setTimeout(r, 400));
  await p.screenshot({ path: 'shot_r3_03_sheet_bottom.png' });

  // Empty state screenshot (no-login fresh)
  await b.close();
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });
