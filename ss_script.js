const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await new Promise(r => setTimeout(r, 1500));
  
  const inputs = await page.evaluate(() =>
    Array.from(document.querySelectorAll("input")).map(i => ({ type: i.type, placeholder: i.placeholder, id: i.id }))
  );
  console.log("inputs:", JSON.stringify(inputs));

  await page.evaluate(() => {
    const inputs = document.querySelectorAll("input");
    inputs[0].value = "1062970273@qq.com";
    inputs[0].dispatchEvent(new Event("input", { bubbles: true }));
    if (inputs[1]) {
      inputs[1].value = "123456";
      inputs[1].dispatchEvent(new Event("input", { bubbles: true }));
    }
  });
  
  await new Promise(r => setTimeout(r, 500));
  const btn = await page.$("button[type=submit]");
  if (btn) await btn.click();
  await new Promise(r => setTimeout(r, 3500));
  
  console.log("url after login:", page.url());
  const headerText = await page.evaluate(() => document.querySelector("header")?.innerText || "no header");
  console.log("header:", headerText.slice(0, 100));

  await page.screenshot({ path: "shot_loggedin.png" });
  
  // Navigate to results
  await page.evaluate(() => {
    const items = document.querySelectorAll(".bottom-nav-item");
    if (items[1]) items[1].click();
  });
  await new Promise(r => setTimeout(r, 1200));
  await page.screenshot({ path: "shot_results_loggedin.png" });
  
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
