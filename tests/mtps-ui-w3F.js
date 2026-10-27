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
  console.log('Wave 3 F: Logic > Produced Tags and Map PLC/SLC Messages (v37 help, Logic menu; 1756-RM094 Map Tags)');
  await fresh();
  await ev(() => { const p = MTPS.App.blank('Line_C'); p.tags = [{ name: 'Out_A', type: 'DINT', prod: { max: 1 } }, { name: 'Out_B', type: 'REAL', dim: 4, prod: { max: 3 } }, { name: 'N7', type: 'INT', dim: 20 }, { name: 'F8', type: 'REAL', dim: 10 }, { name: 'Single', type: 'DINT' }]; MTPS.App.openProject(p, true); MTPS.App.render(); });
  await wait(150);
  await page.click('.dmenu [data-menu="Logic"]'); await wait(120);
  const lg = await page.$$eval('#layer .menu .it span:not(.k):not(.ck)', s => s.map(x => x.textContent));
  check('the Logic menu has Produced Tags… and Map PLC/SLC Messages… after Monitor Tags / Edit Tags', lg.indexOf('Produced Tags…') === lg.indexOf('Edit Tags') + 1 && lg.indexOf('Map PLC/SLC Messages…') === lg.indexOf('Produced Tags…') + 1, lg.join(','));
  await pick('Produced Tags…'); await wait(150);
  check('Produced Tags lists every produced tag with its Max Consumers', (await dlgTitle()) === 'Produced Tags' && (await page.$$eval('#layer [data-pct]', r => r.map(x => x.dataset.pct).join())) === 'Out_A,Out_B' && (await page.$$eval('#layer [data-pcmax]', i => i.map(x => x.value).join())) === '1,3');
  await shot('produced-tags');
  await page.fill('#layer [data-pcmax="0"]', '0'); await clickBtn('OK');
  check('… Max Consumers 0 is refused', /1 to 255/.test(await page.$eval('#pct-e', e => e.textContent)));
  await page.fill('#layer [data-pcmax="0"]', '4'); await clickBtn('OK'); await wait(120);
  check('… OK keeps the new Max Consumers', (await P()).tags.find(t => t.name === 'Out_A').prod.max === 4 && (await page.$('#layer .dlg')) === null);
  await page.click('.dmenu [data-menu="Logic"]'); await wait(120); await pick('Map PLC/SLC Messages…'); await wait(150);
  check('Map PLC/SLC Messages opens PLC/SLC Mapping: File Number, Tag Name, PLC 2 Mapping', (await dlgTitle()) === 'PLC/SLC Mapping' && /File Number.*Tag Name/.test(await page.$eval('#layer .mapt thead', t => t.textContent)) && (await page.$('#map2')) !== null);
  await page.click('#mapadd'); await wait(60);
  check('Add File: a row with file 7', (await page.$$eval('#layer [data-mapf]', i => i.map(x => x.value).join())) === '7');
  await page.fill('#layer [data-mapt]', 'Single'); await clickBtn('OK');
  check('a tag that is not an array of INT, DINT or REAL is refused', /array tag of INT, DINT or REAL/.test(await page.$eval('#map-e', e => e.textContent)));
  await page.fill('#layer [data-mapf]', '2'); await page.fill('#layer [data-mapt]', 'N7'); await clickBtn('OK');
  check('files 0, 1 and 2 are refused (Output, Input and Status files of a PLC-5)', /0, 1 and 2/.test(await page.$eval('#map-e', e => e.textContent)));
  await page.fill('#layer [data-mapf]', '7');
  await page.click('#mapadd'); await wait(60);
  await page.fill('#layer tr[data-maprow]:nth-child(2) [data-mapf]', '8'); await page.fill('#layer tr[data-maprow]:nth-child(2) [data-mapt]', 'f8');
  await shot('map-plc-slc');
  await clickBtn('OK'); await wait(120);
  check('OK keeps the map: N7 in file 7, F8 in file 8 (names as the tags)', JSON.stringify((await P()).plcMap) === '{"files":[{"file":7,"tag":"N7"},{"file":8,"tag":"F8"}]}', JSON.stringify((await P()).plcMap));
  await ev(() => MTPS.App.run('verifyc')); await wait(120);
  check('the map verifies', !(await ev(() => MTPS.App.state.verify.errors.some(e => /PLC\/SLC/.test(e.text)))));
  await ev(() => MTPS.App.run('tagsedit')); await wait(150);
  await page.click('#tshow'); await wait(100); await pick('Configure…'); await wait(120);
  await page.selectOption('#dfon', 'Mapped'); await clickBtn('OK'); await wait(150);
  check('Show: Filter On Mapped lists the tags of the PLC/SLC mapping', (await page.$$eval('#tagrows tr[data-tag]:not(.mem)', r => r.map(x => x.dataset.tag).join())) === 'N7,F8');
  await page.click('#tshow'); await wait(100); await pick('All Tags'); await wait(100);
  await page.click('.dmenu [data-menu="Logic"]'); await wait(120); await pick('Map PLC/SLC Messages…'); await wait(150);
  await page.click('#layer tr[data-maprow]:nth-child(1) [data-mapx]'); await wait(60);
  await clickBtn('OK'); await wait(120);
  check('Delete Map takes a file out of the map', JSON.stringify((await P()).plcMap) === '{"files":[{"file":8,"tag":"F8"}]}');
  {
    const c2 = await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true });
    const tp = await c2.newPage();
    await tp.goto(URL); await tp.evaluate(() => localStorage.clear()); await tp.reload(); await tp.waitForTimeout(300); await tp.keyboard.press('Escape');
    await tp.evaluate(() => { const p = MTPS.App.blank('Tab_C'); p.tags = [{ name: 'N10', type: 'INT', dim: 5 }]; MTPS.App.openProject(p, true); MTPS.App.run('mapplc'); });
    await tp.waitForTimeout(200);
    await tp.tap('#mapadd'); await tp.waitForTimeout(60); await tp.fill('#layer [data-mapf]', '10'); await tp.fill('#layer [data-mapt]', 'N10');
    check('tablet: PLC/SLC Mapping fits the screen', await inView('#layer .dlg', tp));
    await shot('map-plc-slc-tablet', tp);
    await clickBtn('OK', tp, true);
    check('tablet: a tap on OK keeps the map', await tp.evaluate(() => JSON.stringify(MTPS.App.state.p.plcMap) === '{"files":[{"file":10,"tag":"N10"}]}'));
    await c2.close();
  }
};
