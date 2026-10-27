/* MT PLC Studio UI tests, Wave 3 F: produced and consumed tags (1756-PM011, LGEM5K-GR016M chapter 10): New Tag /
   Tag Properties Type Produced / Consumed and the Connection dialogs, the producer in the I/O Configuration, the tag
   filter. Mouse on the desktop, touch on the tablet and the phone. Called from mtps-ui.test.js. */
'use strict';
const fs = require('fs');
module.exports = async function w3F({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const SHOTS = '/tmp/claude-0/shots-w3/F';
  try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (e) { /* no shots */ }
  const shot = (name, pg = page) => pg.screenshot({ path: `${SHOTS}/${name}.png` }).catch(() => {});
  const dlgTitle = (pg = page) => pg.$$eval('#layer .dlg .dh b', b => (b.length ? b[b.length - 1].textContent : '')).catch(() => '');
  const clickBtn = async (label, pg = page, tap = false) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const ds = [...document.querySelectorAll('#layer .dlg')], d = ds[ds.length - 1]; const b = d && [...d.querySelectorAll('.df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  const P = () => ev(() => JSON.parse(JSON.stringify(MTPS.App.state.p)));
  async function fresh(w = 1440, h = 900) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(URL); await ev(() => localStorage.clear()); await page.reload(); await wait(300);
    await page.keyboard.press('Escape'); await wait(80);
  }
  const inView = (sel, pg = page) => pg.$eval(sel, e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; }).catch(() => false);

  console.log('Wave 3 F: New Tag Type Produced / Consumed and the Connection dialogs (1756-PM011)');
  await fresh();
  await ev(() => { MTPS.App.openProject(MTPS.App.blank('Line_B'), true); MTPS.App.render(); });
  await wait(150);
  // the producer is a module of the consumer's I/O Configuration (LGEM5K-GR016M: Make the producer an I/O module)
  await page.click('.nd[data-org="io"]', { button: 'right' }); await wait(100);
  await pick('New Module…'); await wait(150);
  check('Select Module Type lists the emulated controller PLC-CPU (category Controller)', (await page.$('#layer tr[data-smt="PLC-CPU"]')) !== null && (await page.$eval('#layer tr[data-smt="PLC-CPU"]', r => r.lastElementChild.textContent)) === 'Controller');
  await page.click('#layer tr[data-smt="PLC-CPU"]'); await clickBtn('Create'); await wait(150);
  check('Create opens New Module for the controller: Type PLC-CPU, Name, Description, the free slots', (await dlgTitle()) === 'New Module' && (await page.$eval('#nm-t', e => e.textContent)) === 'PLC-CPU' && (await page.$$eval('#pcm-s option', o => o.map(x => x.textContent).join())) === '3,4,5,6,7');
  await page.fill('#pcm-n', 'Line_A'); await page.selectOption('#pcm-s', '4'); await clickBtn('OK'); await wait(150);
  check('the producer is in the I/O Configuration as [4] PLC-CPU Line_A', (await page.$eval('.nd[data-org="pcm:4"]', n => n.textContent)).includes('[4] PLC-CPU Line_A') && JSON.stringify((await P()).rack.ctls) === '[{"slot":4,"name":"Line_A"}]');
  // New Tag, Type Consumed
  await page.click('.nd[data-org="ctags"]', { button: 'right' }); await wait(100);
  await pick('New Tag…'); await wait(150);
  check('New Tag: Type lists Base, Alias, Produced, Consumed', (await page.$$eval('#tk option', o => o.map(x => x.textContent).join())) === 'Base,Alias,Produced,Consumed');
  await shot('newtag-type-list');
  await page.fill('#tn', 'Part_Count');
  await page.selectOption('#tk', 'consumed'); await wait(80);
  check('Consumed: the Connection… button shows and the Scope is the controller (controller scope only)', !(await page.$eval('#tpc', r => r.hidden)) && (await page.$eval('#ts', s => s.disabled && s.value === '')) && !(await page.$eval('#rt', r => r.hidden)));
  await clickBtn('Create');
  check('Create without a producer: "click Connection… and select the Producer"', /select the Producer/.test(await page.$eval('#te', e => e.textContent)));
  await page.click('#tpcb'); await wait(120);
  check('Connection… opens Consumed Tag Connection over New Tag (Connection and Status tabs)', (await dlgTitle()) === 'Consumed Tag Connection' && (await page.$$eval('#layer .pcdlg [data-dt]', t => t.map(x => x.textContent).join())) === 'Connection,Status' && (await page.$$('#layer .dlg')).length === 2);
  check('Producer lists the controllers of the I/O Configuration; RPI 20 ms by default; Unicast checked', (await page.$$eval('#pc-p option', o => o.map(x => x.textContent).join())) === 'Line_A' && (await page.$eval('#pc-rpi', i => i.value)) === '20' && (await page.$eval('#pc-uni', c => c.checked)));
  await page.fill('#pc-r', 'Count_Out'); await page.fill('#pc-rpi', '0.1'); await clickBtn('OK');
  check('RPI out of the range (0.196 - 536870.911 ms) is refused', /0\.196 to 536870\.911/.test(await page.$eval('#pc-e', e => e.textContent)));
  await page.fill('#pc-rpi', '50');
  await page.click('#layer .pcdlg [data-dt="st"]'); await wait(60);
  check('Status tab: Connection Status Included, Data Type, Connected to Producer, Producer in Run Mode (online only)', /Connection Status Included/.test(await page.$eval('#layer .pcdlg', d => d.textContent)) && /Producer in Run Mode/.test(await page.$eval('#layer .pcdlg', d => d.textContent)) && /work online/.test(await page.$eval('#layer .pcdlg', d => d.textContent)));
  await shot('consumed-connection-status');
  await page.click('#layer .pcdlg [data-dt="conn"]'); await wait(60);
  await shot('consumed-connection');
  await clickBtn('OK');
  check('OK closes the Connection dialog only; New Tag shows the connection', (await dlgTitle()) === 'New Tag' && (await page.$eval('#tpcs', e => e.textContent)) === 'Line_A: Count_Out, RPI 50 ms');
  await clickBtn('Create'); await wait(120);
  const pc = (await P()).tags.find(t => t.name === 'Part_Count');
  check('the consumed tag is a controller tag with its connection', !!pc && pc.type === 'DINT' && JSON.stringify(pc.cons) === '{"producer":"Line_A","remote":"Count_Out","rpi":50}', JSON.stringify(pc));
  // New Tag, Type Produced
  await page.click('.nd[data-org="ctags"]', { button: 'right' }); await wait(100);
  await pick('New Tag…'); await wait(150);
  await page.fill('#tn', 'Line_State'); await page.fill('#tt', 'INT'); await page.selectOption('#tk', 'produced'); await wait(60);
  await page.click('#tpcb'); await wait(120);
  check('Produced Tag Connection: Max Consumers 1 by default; Send Data State Change Event (IOT) is not available', (await dlgTitle()) === 'Produced Tag Connection' && (await page.$eval('#pc-max', i => i.value)) === '1' && (await page.$eval('#pc-iot', c => c.disabled)));
  await page.fill('#pc-max', '256'); await clickBtn('OK');
  check('Max Consumers above 255 is refused', /1 to 255/.test(await page.$eval('#pc-e', e => e.textContent)));
  await page.fill('#pc-max', '2'); await clickBtn('OK');
  await shot('produced-newtag');
  await clickBtn('Create'); await wait(120);
  check('a produced INT is created (Max Consumers 2)', JSON.stringify((await P()).tags.find(t => t.name === 'Line_State').prod) === '{"max":2}');
  await ev(() => MTPS.App.run('verifyc')); await wait(150);
  check('Verify: a produced tag of less than 32 bits does not verify (v37 help, Tag Editor columns)', await ev(() => MTPS.App.state.verify.errors.some(e => /Line_State.*less than 32 bits/.test(e.text))));
  // Tag Properties: Type Produced selected; change to DINT
  await ev(() => MTPS.App.run('tagsedit')); await wait(150);
  await page.click('#tagrows tr[data-tag="Line_State"] td.nm'); await wait(150);
  check('Tag Properties of a produced tag: Type Produced, Connection shows Max Consumers 2', /^Tag Properties/.test(await dlgTitle()) && (await page.$eval('#tk', s => s.value)) === 'produced' && (await page.$eval('#tpcs', e => e.textContent)) === 'Max Consumers: 2');
  await page.fill('#tt', 'DINT'); await clickBtn('OK'); await wait(150);
  await ev(() => MTPS.App.run('verifyc')); await wait(150);
  check('as a DINT it verifies (no tag errors)', !(await ev(() => MTPS.App.state.verify.errors.some(e => /Tag '/.test(e.text)))), await ev(() => MTPS.App.state.verify.lines.join(' | ')));
  // the tag filter: Filter On Produced / Consumed (v37 help, Filter the tag list)
  await page.click('#tshow'); await wait(100); await pick('Configure…'); await wait(120);
  await page.selectOption('#dfon', 'Consumed'); await clickBtn('OK'); await wait(150);
  check('Show: Filter On Consumed lists only the consumed tag', (await page.$$eval('#tagrows tr[data-tag]:not(.mem)', r => r.map(x => x.dataset.tag).join())) === 'Part_Count');
  await page.click('#tshow'); await wait(100); await pick('Configure…'); await wait(120);
  await page.selectOption('#dfon', 'Produced'); await clickBtn('OK'); await wait(150);
  check('Filter On Produced lists only the produced tag', (await page.$$eval('#tagrows tr[data-tag]:not(.mem)', r => r.map(x => x.dataset.tag).join())) === 'Line_State');
  await page.click('#tshow'); await wait(100); await pick('All Tags'); await wait(100);
  // a program tag cannot be produced
  await page.click('.nd[data-org="ctags"]', { button: 'right' }); await wait(100);
  await pick('New Tag…'); await wait(150);
  await page.fill('#tn', 'Local_P'); await page.selectOption('#ts', 'MainProgram'); await page.selectOption('#tk', 'produced'); await wait(60);
  check('Type Produced puts the Scope back to the controller', (await page.$eval('#ts', s => s.value)) === '');
  await page.keyboard.press('Escape'); await wait(80);
  // the producer's Module Properties and Delete
  await page.click('.nd[data-org="pcm:4"]', { button: 'right' }); await wait(100);
  await pick('Properties'); await wait(150);
  check('Module Properties of the producer: General (Name, Description, Slot, the consumed tags) and Connection', /Local:4/.test(await dlgTitle()) && (await page.$eval('#pcp-n', i => i.value)) === 'Line_A' && /Part_Count/.test(await page.$eval('#layer .dlg .db', d => d.textContent)));
  await page.fill('#pcp-n', 'Line_A2'); await clickBtn('OK'); await wait(120);
  check('renaming the producer renames the Producer of its consumed tags', (await P()).tags.find(t => t.name === 'Part_Count').cons.producer === 'Line_A2' && (await P()).rack.ctls[0].name === 'Line_A2');
  await page.click('.nd[data-org="io"]', { button: 'right' }); await wait(100);
  await pick('New Module…'); await wait(150);
  await page.click('#layer tr[data-smt="PLC-DI16-24V"]'); await clickBtn('Create'); await wait(150);
  check('… its slot is not offered to another module', !(await page.$$eval('#ms option', o => o.map(x => x.textContent))).includes('4'));
  await page.keyboard.press('Escape'); await wait(80);

  console.log('Wave 3 F: the Connection dialog with touch (tablet 800 × 1280, phone 390 × 844)');
  for (const [w, h, nm] of [[800, 1280, 'tablet'], [390, 844, 'phone']]) {
    const c2 = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: nm === 'phone' });
    const tp = await c2.newPage();
    await tp.goto(URL); await tp.evaluate(() => localStorage.clear()); await tp.reload(); await tp.waitForTimeout(300);
    await tp.keyboard.press('Escape'); await tp.waitForTimeout(80);
    await tp.evaluate(() => { const p = MTPS.App.blank('Touch_B'); p.rack.ctls = [{ slot: 5, name: 'Line_A' }]; MTPS.App.openProject(p, true); MTPS.App.run('newtag'); });
    await tp.waitForTimeout(200);
    await tp.fill('#tn', 'From_A'); await tp.selectOption('#tk', 'consumed'); await tp.waitForTimeout(80);
    await tp.tap('#tpcb'); await tp.waitForTimeout(150);
    check(`${nm}: the Consumed Tag Connection dialog fits the screen, with its OK button`, (await dlgTitle(tp)) === 'Consumed Tag Connection' && (await inView('#layer .pcdlg', tp)) && (await inView('#layer .pcdlg .df .btn.pri', tp)));
    await tp.fill('#pc-r', 'Count_Out');
    await shot(`consumed-connection-${nm}`, tp);
    await clickBtn('OK', tp, true);
    await clickBtn('Create', tp, true); await tp.waitForTimeout(150);
    check(`${nm}: tapping OK and Create makes the consumed tag`, await tp.evaluate(() => { const t = MTPS.App.state.p.tags.find(x => x.name === 'From_A'); return !!t && t.cons.producer === 'Line_A' && t.cons.remote === 'Count_Out'; }));
    await c2.close();
  }
};
