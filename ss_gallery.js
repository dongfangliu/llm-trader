const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  // Login
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle2" });
  await page.focus("input[type=email]"); await page.keyboard.type("1062970273@qq.com");
  await page.focus("input[type=password]"); await page.keyboard.type("123456");
  await page.$("button[type=submit]").then(b => b.click());
  await new Promise(r => setTimeout(r, 3500));

  // Go to results
  await page.evaluate(() => document.querySelectorAll(".bottom-nav-item")[1].click());
  await new Promise(r => setTimeout(r, 600));
  // Immediately close the ResultSheet by clicking its close/overlay if open
  await page.evaluate(() => {
    // Try to find and close the result sheet
    const closeBtn = document.querySelector(".rs-close-btn, .rs-sheet-close, [aria-label='\u5173\u95ed']");
    if (closeBtn) closeBtn.click();
    // Also try the overlay
    const overlay = document.querySelector(".rs-overlay");
    if (overlay) overlay.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: "shot_05_gallery.png" });
  console.log("gallery shot done");

  // Scroll down if needed to see more cards
  await page.evaluate(() => window.scrollBy(0, 200));
  await new Promise(r => setTimeout(r, 300));
  await page.screenshot({ path: "shot_06_gallery_scroll.png" });

  // Now click a card to open the detail sheet and screenshot that
  await page.evaluate(() => {
    const card = document.querySelector(".rg-card");
    if (card) card.click();
  });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: "shot_07_card_detail.png" });
  console.log("card detail shot done");

  // Scroll down in the result sheet to see more content
  await page.evaluate(() => {
    const sheet = document.querySelector(".rs-sheet-body, .rs-body, .rs-content");
    if (sheet) sheet.scrollBy(0, 300);
    else window.scrollBy(0, 300);
  });
  await new Promise(r => setTimeout(r, 400));
  await page.screenshot({ path: "shot_08_card_detail_scroll.png" });

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
