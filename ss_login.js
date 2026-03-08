const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1000));
  
  await page.focus("input[type=email]");
  await page.keyboard.type("1062970273@qq.com");
  await page.focus("input[type=password]");
  await page.keyboard.type("123456");
  await new Promise(r => setTimeout(r, 400));
  
  const btn = await page.$("button[type=submit]");
  if (btn) {
    await btn.click();
    await new Promise(r => setTimeout(r, 4000));
  }
  
  console.log("url:", page.url());
  await page.screenshot({ path: "shot_loggedin2.png" });
  
  // If logged in, take results screenshot
  if (!page.url().includes("/login")) {
    await new Promise(r => setTimeout(r, 1500));
    await page.evaluate(() => {
      const items = document.querySelectorAll(".bottom-nav-item");
      if (items[1]) items[1].click();
    });
    await new Promise(r => setTimeout(r, 1000));
    await page.screenshot({ path: "shot_results_after_login.png" });
    console.log("results screenshot done");
  }

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
