/* MT PLC Studio in-app updates, end to end: the Beta channel finds a new Beta build (every merge into main) and
   loads it, from the hosted Beta copy and from the built-in copy of the exe / APK. The hosted copies are made with
   scripts/copy-mtps.sh, as the Pages workflow makes them, and served through a route in place of GitHub Pages.
   Nothing here uses GitHub Releases: Beta is only /mtps/beta/ on Pages. Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
module.exports = async function update({ browser, check }) {
  console.log('In-app update, end to end: Beta finds and loads every new Beta build; Stable only a newer release');
  const root = path.resolve(__dirname, '..'), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mtps-up-'));
  const copy = (dir, build) => { execFileSync('bash', [path.join(root, 'scripts/copy-mtps.sh'), path.join(tmp, dir), build], { stdio: 'pipe' }); return path.join(tmp, dir); };
  const builtIn = copy('builtin', 'mtps-v0.5.0'), old = copy('old', 'beta.1111111'), neu = copy('new', 'beta.2222222');
  const PAGES = 'https://ronanski.github.io/aio-icms-tool/mtps/';
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
  let beta = old;   // what Pages serves at /mtps/beta/
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await ctx.route(PAGES + '**', r => {
    const u = new URL(r.request().url()), rel = decodeURIComponent(u.pathname.replace('/aio-icms-tool/mtps/', ''));
    const [dir, p] = rel.startsWith('beta/') ? [beta, rel.slice(5)] : [builtIn, rel];
    const f = path.join(dir, p || 'index.html');
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: MIME[path.extname(f)] || 'application/octet-stream', headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(f) });
  });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const ready = () => page.waitForFunction(() => window.MTPS && MTPS.App && window.MTPSUpdater, null, { timeout: 15000 });
  const bar = () => page.$eval('.upbar', b => b.textContent).catch(() => '');
  const restart = async () => { await Promise.all([page.waitForNavigation({ timeout: 15000 }), page.click('.upbar [data-up="go"]')]); await ready(); };

  // 1. the hosted Beta copy: a merge into main publishes beta.2222222; the open app finds it and loads it
  await page.goto(PAGES + 'beta/index.html?fastcomm=1'); await ready();
  check('the hosted Beta copy runs build beta.1111111 on the Beta channel', await page.evaluate(() => MTPS.App.BUILD === 'beta.1111111' && MTPSUpdater.channel() === 'beta'));
  await page.evaluate(() => MTPSUpdater.check(true)); await page.waitForTimeout(200);
  check('no update while Pages serves the same build', !(await bar()));
  beta = neu;
  await page.evaluate(() => MTPSUpdater.check(true)); await page.waitForSelector('.upbar', { timeout: 5000 }).catch(() => {});
  const b1 = await bar();
  check('a new Beta build of the same version shows "Restart to update" with its build', /v0\.\d+\.\d+ \(beta, beta\.2222222\) is ready/.test(b1) && /Restart to update/.test(b1), b1);
  if (b1) await restart();
  check('Restart to update loads the new build in the app (no download)', await page.evaluate(() => MTPS.App.BUILD === 'beta.2222222' && location.href.startsWith('https://ronanski.github.io/aio-icms-tool/mtps/beta/')));
  await page.evaluate(() => MTPSUpdater.check(true)); await page.waitForTimeout(200);
  check('after the update: no update offered again', !(await bar()));

  // 2. the built-in copy of the exe / APK (a Stable release), switched to Beta: it finds the Beta build and loads it
  beta = neu;
  await page.goto('file://' + path.join(builtIn, 'index.html') + '?fastcomm=1'); await ready();
  await page.evaluate(() => { localStorage.setItem('mtps.channel', 'stable'); localStorage.removeItem('mtps.upSkip'); });
  await page.evaluate(() => MTPSUpdater.check(true)); await page.waitForTimeout(200);
  check('built-in copy on Stable: the Beta build is not offered (Stable gets only a newer release)', !(await bar()));
  await page.evaluate(() => localStorage.setItem('mtps.channel', 'beta'));
  await page.evaluate(() => MTPSUpdater.check(true)); await page.waitForSelector('.upbar', { timeout: 5000 }).catch(() => {});
  const b2 = await bar();
  check('built-in copy on Beta: the new Beta build of the same version is offered', /beta\.2222222/.test(b2), b2);
  if (b2) await restart();
  check('Restart to update opens the hosted Beta copy, new build', await page.evaluate(() => MTPS.App.BUILD === 'beta.2222222'));
  check('no JS errors (update flow)', errors.length === 0, errors.join(' | '));
  await ctx.close();
  fs.rmSync(tmp, { recursive: true, force: true });
};
