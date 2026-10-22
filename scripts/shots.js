/* Screenshots of every main view for design reviews: node scripts/shots.js <outDir> [label]
   Uses the same headless browser setup as the tests (CHROMIUM_PATH / NODE_PATH). */
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const OUT = path.resolve(process.argv[2] || 'shots');
const LABEL = process.argv[3] || 'shot';
const URL = 'file://' + path.resolve(__dirname, '..', 'index.html');
const SIZES = { desktop: [1440, 900], tablet: [834, 1112], phone: [390, 844] };
const VIEWS = [
  ['ladder', 'plcmotor'], ['schematic', 'plcmotor'], ['wiring', 'plcmotor'], ['hmi', 'plcmotor'],
  ['learn', null], ['ladder', 'chassis'], ['wiring', 'chassis'],
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  for (const [size, [w, h]] of Object.entries(SIZES)) {
    for (const theme of ['light', 'dark']) {
      const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
      await page.route(/^https?:/, r => r.abort());
      await page.addInitScript(t => { try { localStorage.setItem('plc-trainer.theme', t); localStorage.setItem('plc-trainer.welcomed', '1'); } catch (e) { /* ignore */ } }, theme);
      await page.goto(URL);
      await page.waitForFunction(() => window.App && App.project);
      for (const [view, ex] of VIEWS) {
        if (size === 'phone' && ex === 'chassis') continue;
        await page.evaluate(([v, e]) => {
          document.querySelectorAll('#modal-root .modal-wrap').forEach(m => m.remove());
          if (e && Examples.EX[e]) App.openNew(Examples.EX[e].build());
          App.setLayout && App.setLayout('single');
          App.showView(v);
        }, [view, ex]);
        await page.waitForTimeout(400);
        await page.screenshot({ path: path.join(OUT, `${LABEL}-${size}-${theme}-${view}${ex === 'chassis' ? '-chassis' : ''}.png`) });
      }
      await page.close();
    }
  }
  await browser.close();
  console.log('done', OUT);
})();
