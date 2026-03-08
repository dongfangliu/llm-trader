const puppeteer = require('puppeteer');

(async () => {
  const b = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // Anonymous home
  await p.goto('http://localhost:3000', { waitUntil: 'networkidle2' });
  await p.screenshot({ path: 'shot_r2_01_anon.png' });

  // Login
  await p.goto('http://localhost:3000/login', { waitUntil: 'networkidle2' });
  const emailSel = 'input[type="email"], input[name="email"]';
  const passSel  = 'input[type="password"], input[name="password"]';
  await p.waitForSelector(emailSel, { timeout: 5000 });
  await p.click(emailSel); await p.keyboard.type('1062970273@qq.com');
  await p.click(passSel);  await p.keyboard.type('123456');
  await p.keyboard.press('Enter');
  await new Promise(r => setTimeout(r, 4000));
  await p.screenshot({ path: 'shot_r2_02_loggedin_analyze.png' });

  // Click Results tab (index 1)
  const tabs = await p.$$('.bottom-nav-item');
  console.log('tabs found:', tabs.length);
  if (tabs[1]) { await tabs[1].click(); await new Promise(r => setTimeout(r, 1200)); }
  await p.screenshot({ path: 'shot_r2_03_result_gallery.png' });

  // Close any overlay and view gallery
  await p.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 600));
  await p.screenshot({ path: 'shot_r2_04_gallery_bare.png' });

  await b.close();
  console.log('Done');
})().catch(e => { console.error(e); process.exit(1); });
