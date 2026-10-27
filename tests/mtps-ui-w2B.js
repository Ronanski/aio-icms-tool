/* MT PLC Studio UI tests, Wave 2 (B): the Data Type Editor, Strings, LINT / LREAL, the Add-On-Defined folder, the tag
   editor's Show filter and columns, the Watch tab, the Quick View pane and Trends. Mouse on the desktop, touch on the
   tablet and the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function w2b({ browser, page, URL, check }) {
  const ev = (fn, arg, pg = page) => pg.evaluate(fn, arg);
  const wait = (ms, pg = page) => pg.waitForTimeout(ms);
  const shots = '/tmp/claude-0/shots-w2/B/';
  try { require('fs').mkdirSync(shots, { recursive: true }); } catch (e) { /* no screenshots */ }
  const shot = async (n, pg = page) => { try { await pg.screenshot({ path: shots + n + '.png' }); } catch (e) { /* ignore */ } };
  const dlgTitle = (pg = page) => pg.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const items = (pg = page) => pg.$$eval('#layer .menu .it', r => r.map(x => [x.querySelector('span:not(.k):not(.ck)') ? x.querySelector('span:not(.k):not(.ck)').textContent : x.textContent, x.classList.contains('dis')]));
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const it = [...document.querySelectorAll('#layer .menu .it')].find(x => x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  const clickBtn = async (label, pg = page, tap = false) => { await pg.evaluate(l => { document.querySelectorAll('[data-wapick]').forEach(x => delete x.dataset.wapick); const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  async function fresh(pg = page, vp = { width: 1440, height: 900 }) {
    if (pg === page) await pg.setViewportSize(vp);
    await pg.goto(URL); await ev(() => localStorage.clear(), null, pg); await pg.reload(); await wait(300, pg);
    await pg.keyboard.press('Escape'); await wait(80, pg);
    await ev(() => MTPS.App.openProject(MTPS.App.example()), null, pg); await wait(150, pg);
  }
  const touchPage = async (w, h) => { const c = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true }); const p = await c.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message)); p._errs = errs; return p; };
  const dt = (pg = page) => ev(() => JSON.parse(JSON.stringify(MTPS.App.state.p.dataTypes)), null, pg);
  const verifyErrs = (pg = page) => ev(() => { MTPS.App.run('verifyc'); return MTPS.App.state.verify.errors.map(e => e.text); }, null, pg);
  // a member row of the Data Type Editor: type in its Name and Data Type cells, as a user does
  async function member(i, name, type, pg = page, tap = false) {
    const row = `#dterows tr:nth-child(${i + 1})`;
    if (tap) await pg.tap(`${row} [data-mf="name"]`); else await pg.click(`${row} [data-mf="name"]`);
    await pg.keyboard.type(name);
    if (tap) await pg.tap(`${row} [data-mf="type"]`); else await pg.click(`${row} [data-mf="type"]`);
    await pg.keyboard.type(type);
    await wait(50, pg);
  }

  // Go Online through its dialogs (Connected To Go Online > Download > Download), as a user answers them
  async function online(pg = page) {
    await ev(() => MTPS.App.run('online'), null, pg);
    for (let k = 0; k < 10 && !(await ev(() => MTPS.App.state.online && !document.querySelector('#layer .dlg'), null, pg)); k++) {
      await wait(150, pg);
      const b = await pg.$('#layer .dlg .btn.pri'); if (b && !(await pg.$('#layer .dlg .prog'))) await b.click(); else await wait(400, pg);
    }
    return ev(() => MTPS.App.state.online, null, pg);
  }
  const addTag = (name, type, pg = page) => ev(([n, t]) => { MTPS.App.state.p.tags.push({ name: n, type: t }); MTPS.App.render(); }, [name, type], pg);
  const cellText = (sel, pg = page) => pg.$eval(sel, e => e.textContent).catch(() => null);

  /* ---------- 1. Data Type Editor ---------- */
  console.log('Wave 2 B: Data Type Editor (v37 help: Using user-defined data types; Data Type Editor)');
  await fresh();
  await shot('1-udt-before');
  await page.click('.org [data-org="dts"]', { button: 'right' }); await wait(120);
  check('right-click Data Types: New Data Type…', (await items()).some(x => x[0] === 'New Data Type…' && !x[1]), JSON.stringify(await items()));
  await pick('New Data Type…');
  check('the Data Type Editor opens: Name, Description, the members grid (Name, Data Type, Style, Description, External Access), Size',
    (await dlgTitle()) === 'New Data Type' && (await page.$$eval('.dtegrid th', t => t.map(x => x.textContent).join('|'))) === 'Name|Data Type|Style|Description|External Access|' && (await page.$('#dtes')) !== null);
  await page.fill('#dten', 'Motor'); await page.fill('#dted', 'A motor with its speed');
  await member(0, 'Run', 'BOOL');
  check('typing in the new-member row adds the next blank row', (await page.$$('#dterows tr')).length === 2);
  await member(1, 'Speed', 'REAL');
  await page.selectOption('#dterows tr:nth-child(2) [data-mf="style"]', 'Exponential');
  await page.fill('#dterows tr:nth-child(2) [data-mf="desc"]', 'rpm');
  await member(2, 'Count', 'DINT[4]');
  await page.selectOption('#dterows tr:nth-child(3) [data-mf="access"]', 'Read Only');
  check('Style lists the styles of the member type (REAL: Float, Exponential)', (await page.$$eval('#dterows tr:nth-child(2) [data-mf="style"] option', o => o.map(x => x.textContent).join(','))) === 'Float,Exponential');
  check('the Size is not worked out until the type is saved', /worked out when the type is saved/.test(await page.$eval('#dtes', e => e.textContent)));
  await clickBtn('Apply');
  check('Apply saves and keeps the editor open, with the size: BOOL (1 byte, padded), REAL, DINT[4] = 24 bytes', (await dlgTitle()) === 'Data Type: Motor' && (await page.$eval('#dtes', e => e.textContent)) === 'Data Type Size: 24 bytes');
  const d1 = await dt();
  check('the type is saved with its members, styles, descriptions and External Access', d1.length === 1 && d1[0].name === 'Motor' && d1[0].desc === 'A motor with its speed' && JSON.stringify(d1[0].members) === JSON.stringify([{ name: 'Run', type: 'BOOL' }, { name: 'Speed', type: 'REAL', desc: 'rpm', style: 'Exponential' }, { name: 'Count', type: 'DINT', dim: 4, access: 'Read Only' }]), JSON.stringify(d1));
  await member(3, 'Bad', 'NOPE');
  await clickBtn('OK');
  check('an undefined member type is refused, the editor stays open', (await dlgTitle()) === 'Data Type: Motor' && /'NOPE' is not a data type/.test(await page.$eval('#dtee', e => e.textContent)));
  await page.click('#dterows tr:nth-child(4) [data-mdel]'); await wait(50);
  await shot('1-udt-editor');
  await clickBtn('OK');
  check('OK saves and closes', (await page.$('#layer .dlg')) === null && (await dt())[0].members.length === 3);
  // the type in the organizer, in New Tag, in logic and in Monitor Tags
  await page.click('.org [data-org="dts"] [data-tw]'); await wait(80);
  check('the organizer lists Motor under Data Types > User-Defined', (await page.$('.org [data-org="dt:u:Motor"]')) !== null);
  await ev(() => MTPS.App.run('newtag')); await wait(120);
  await page.fill('#tn', 'M1'); await page.fill('#tt', 'Motor'); await page.selectOption('#ts', 'MainProgram'); await clickBtn('Create');
  await ev(() => { MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.push({ t: 'XIC(M1.Run)MOV(7,M1.Count[2]);' }); MTPS.App.render(); });
  check('a tag of the type is used in logic and verifies', (await verifyErrs()).length === 0, JSON.stringify(await verifyErrs()));
  await page.dblclick('.org [data-org="dt:u:Motor"]'); await wait(150);
  check('double-click the type opens it in the Data Type Editor', (await dlgTitle()) === 'Data Type: Motor' && (await page.$$('#dterows tr')).length === 4);
  await page.fill('#dten', 'Drive'); await clickBtn('OK');
  check('renaming the type renames it in the tags that use it', (await ev(() => MTPS.App.state.p.tasks[0].programs[0].tags.find(t => t.name === 'M1').type)) === 'Drive' && (await verifyErrs()).length === 0);
  await page.click('.org [data-org="dt:u:Drive"]', { button: 'right' }); await wait(120);
  await pick('Delete');
  check('a type in use cannot be deleted', (await dt()).length === 1 && /cannot be deleted/.test(await ev(() => MTPS.App.state.msg)));
  await ev(() => MTPS.App.run('tagsmon')); await wait(150);
  await page.selectOption('#tscope', 'MainProgram'); await wait(120);
  await page.click('#tagrows tr[data-tag="M1"] [data-texp]'); await wait(80);
  check('Monitor Tags opens the tag to its members (Run, Speed, Count)', (await page.$$eval('#tagrows tr.mem', r => r.map(x => x.dataset.tag).join(','))) === 'M1.Run,M1.Speed,M1.Count');
  // L5X: the type goes out and comes back
  const back = await ev(() => { const x = MTPS.App.toL5X(MTPS.App.state.p), p = MTPS.App.fromL5X(x); return { x: /<DataType Name="Drive" Family="NoFamily" Class="User">/.test(x) && /DataType="BIT"[^>]*Target="ZZZZZZZZZZDrive0" BitNumber="0"/.test(x), m: p.dataTypes[0] }; });
  check('L5X export and import keep the type (BOOL members as bits of a hidden SINT)', back.x && JSON.stringify(back.m.members) === JSON.stringify((await dt())[0].members), JSON.stringify(back));
  // tablet (touch): File > New Component > New Data Type, and a tap in the grid
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await tp.tap('[data-allmenu]'); await wait(150, tp); await tp.tap('[data-fold="File"]'); await wait(150, tp);
    await pick('New Data Type…', tp, true);
    check('tablet (touch): File > New Data Type… opens the Data Type Editor', (await dlgTitle(tp)) === 'New Data Type');
    await tp.tap('#dten'); await tp.keyboard.type('Valve');
    await member(0, 'Open', 'BOOL', tp, true);
    await clickBtn('OK', tp, true);
    check('tablet (touch): the type is saved', (await dt(tp)).map(d => d.name).join() === 'Valve');
    await shot('1-udt-tablet', tp);
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
  // phone (touch): More > New Data Type…
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await pp.tap('[data-go="more"]'); await wait(150, pp);
    await pp.tap('.page [data-cmd="newdt"]'); await wait(200, pp);
    check('phone (touch): More > New Data Type… opens the editor full screen', (await dlgTitle(pp)) === 'New Data Type' && (await ev(() => document.documentElement.scrollWidth <= innerWidth + 1, null, pp)));
    await pp.tap('#dten'); await pp.keyboard.type('Tank');
    await member(0, 'Level', 'REAL', pp, true);
    await shot('1-udt-phone', pp);
    await clickBtn('OK', pp, true);
    check('phone (touch): the type is saved', (await dt(pp)).map(d => d.name).join() === 'Tank');
    check('phone: no JS errors', pp._errs.length === 0, pp._errs.join(' | '));
    await pp.context().close();
  }

  /* ---------- 2. STRING and Data Types > Strings ---------- */
  console.log('Wave 2 B: STRING and the Strings folder (1756-PM004; v37 help: String Browser, Using user-defined data types)');
  await fresh();
  await page.click('.org [data-org="dts"] [data-tw]'); await wait(80);
  const dtFolders = () => page.$$eval('.org [data-org^="dt:"]', r => r.filter(x => !/^dt:[usmp]:/.test(x.dataset.org)).map(x => x.textContent.trim()).join('|'));
  check('Data Types lists User-Defined, Strings, then Predefined and Module-Defined', (await dtFolders()).startsWith('User-Defined|Strings|'), await dtFolders());
  await page.click('.org [data-org="dt:str"]', { button: 'right' }); await wait(120);
  await pick('New String Type…');
  check('New String Type: Name, Description, Maximum Characters, Data Type Size', (await dlgTitle()) === 'New String Type' && (await page.$('#stl')) !== null && (await page.$('#sts')) !== null);
  await page.fill('#stn', 'STR20'); await page.fill('#stl', '0'); await clickBtn('OK');
  check('Maximum Characters 0 is refused (1 to 65535)', /1 to 65535/.test(await cellText('#ste')));
  await page.fill('#stl', '20'); await clickBtn('OK');
  check('the string type is saved', JSON.stringify(await dt()) === JSON.stringify([{ name: 'STR20', family: 'string', len: 20 }]));
  if (!(await page.$('.org [data-org="dt:s:STRING"]'))) { await page.click('.org [data-org="dt:str"] [data-tw]'); await wait(80); }
  check('Strings lists STRING and STR20', (await page.$$eval('.org [data-org^="dt:s:"]', r => r.map(x => x.textContent.trim()).join(','))) === 'STRING,STR20');
  await page.dblclick('.org [data-org="dt:s:STRING"]'); await wait(150);
  check('STRING opens read-only: 82 characters, 88 bytes', (await dlgTitle()) === 'String Type: STRING' && (await page.$eval('#stl', i => i.value + (i.readOnly ? ' ro' : ''))) === '82 ro' && (await cellText('#sts')) === '88 bytes');
  await clickBtn('Close');
  await addTag('Msg', 'STRING');
  await ev(() => MTPS.App.run('tagsmon')); await wait(150);
  check('Monitor Tags: a STRING shows its text in Value', (await cellText('#tagrows tr[data-tag="Msg"] td.val')) === "''");
  await page.click('#tagrows tr[data-tag="Msg"] td.val'); await wait(150);
  check("a click on the value opens the String Browser (the tag's name, Count n of 82)", (await dlgTitle()) === 'Msg' && /0 of 82/.test(await cellText('#sbc')));
  await page.fill('#sbx', "It's"); await clickBtn('OK');
  check("a quote inside the string must be written $'", /\$'/.test(await cellText('#sbe')) && (await dlgTitle()) === 'Msg *');
  await page.fill('#sbx', "It$'s ok$R"); await wait(50);
  check("Count follows the text ($' and $R are one character each)", /8 of 82/.test(await cellText('#sbc')), await cellText('#sbc'));
  await clickBtn('OK');
  check("offline it is the start value: 'It$'s ok$R'", (await cellText('#tagrows tr[data-tag="Msg"] td.val')) === "'It$'s ok$R'" && (await ev(() => MTPS.App.state.p.tags.find(t => t.name === 'Msg').value.LEN)) === 8);
  await page.click('#tagrows tr[data-tag="Msg"] [data-texp]'); await wait(80);
  check('the string opens to LEN (8) and DATA', (await page.$$eval('#tagrows tr.mem', r => r.map(x => x.dataset.tag).join(','))) === 'Msg.LEN,Msg.DATA' && (await cellText('#tagrows tr[data-tag="Msg.LEN"] td.val')) === '8');
  await page.click('#tagrows tr[data-tag="Msg.DATA"] [data-texp]'); await wait(80);
  check("DATA shows each character in ASCII ('I', '$'')", (await cellText('#tagrows tr[data-tag="Msg.DATA[0]"] td.val')) === "'I'" && (await cellText('#tagrows tr[data-tag="Msg.DATA[2]"] td.val')) === "'$''");
  await shot('2-string-offline');
  check('online: Go Online with the string', await online());
  await page.click('#tagrows tr[data-tag="Msg"] td.val'); await wait(150);
  await page.fill('#sbx', 'Hello'); await clickBtn('OK'); await wait(200);
  check("online the String Browser writes the controller: 'Hello'", (await ev(() => MTPS.App.racks[0].controller(0).read('Msg').LEN)) === 5 && (await cellText('#tagrows tr[data-tag="Msg"] td.val')) === "'Hello'");
  await shot('2-string-online');
  await ev(() => MTPS.App.run('offline')); await wait(100);
  const sx = await ev(() => { const x = MTPS.App.toL5X(MTPS.App.state.p), p = MTPS.App.fromL5X(x); return { x: /<DataType Name="STR20" Family="StringFamily" Class="User">.*Name="DATA" DataType="SINT" Dimension="20" Radix="ASCII"/.test(x), d: p.dataTypes[0] }; });
  check('L5X: the string type goes out as a StringFamily type and comes back', sx.x && JSON.stringify(sx.d) === JSON.stringify({ name: 'STR20', family: 'string', len: 20 }), JSON.stringify(sx));
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await addTag('Txt', 'STRING', tp);
    await ev(() => MTPS.App.run('tagsmon'), null, tp); await wait(200, tp);
    await tp.tap('#tagrows [data-tag="Txt"] [data-tv]'); await wait(200, tp);
    await tp.tap('#sbx'); await tp.keyboard.type('Tap'); await clickBtn('OK', tp, true);
    check("tablet (touch): tap the value, type, OK: 'Tap'", (await cellText('#tagrows [data-tag="Txt"] [data-tv]', tp)) === "'Tap'");
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await addTag('Txt', 'STRING', pp);
    await pp.tap('[data-go="tags"]'); await wait(200, pp);
    check("phone: the Tags page shows the string's text", (await cellText('#tagrows [data-tag="Txt"] [data-tv]', pp)) === "''");
    await pp.tap('#tagrows [data-tag="Txt"]'); await wait(200, pp);
    await pp.tap('#sbx'); await pp.keyboard.type('Ok'); await clickBtn('OK', pp, true);
    check("phone (touch): tap the string, type, OK: 'Ok'", (await cellText('#tagrows [data-tag="Txt"] [data-tv]', pp)) === "'Ok'");
    await pp.tap('[data-go="more"]'); await wait(150, pp); await pp.tap('.page [data-cmd="newstr"]'); await wait(150, pp);
    check('phone: More > New String Type…', (await dlgTitle(pp)) === 'New String Type');
    check('phone: no JS errors', pp._errs.length === 0, pp._errs.join(' | '));
    await pp.context().close();
  }

  /* ---------- 3. LINT and LREAL ---------- */
  console.log('Wave 2 B: LINT and LREAL (v37 help: Elementary data types; About the Tag Editor, Date/Time styles)');
  await fresh();
  await ev(() => MTPS.App.run('newtag')); await wait(120);
  await page.fill('#tn', 'Stamp'); await page.fill('#tt', 'LINT'); await page.dispatchEvent('#tt', 'input'); await wait(50);
  check('New Tag: LINT offers Binary, Octal, Decimal, Hex, ASCII, Date/Time, Date/Time (ns)', (await page.$$eval('#tsty option', o => o.map(x => x.textContent).join(','))) === 'Binary,Octal,Decimal,Hex,ASCII,Date/Time,Date/Time (ns)');
  await page.selectOption('#tsty', 'Date/Time'); await page.selectOption('#ts', ''); await clickBtn('Create');
  await ev(() => MTPS.App.run('newtag')); await wait(120);
  await page.fill('#tn', 'Ratio'); await page.fill('#tt', 'LREAL'); await page.dispatchEvent('#tt', 'input'); await wait(50);
  check('New Tag: LREAL offers Float and Exponential', (await page.$$eval('#tsty option', o => o.map(x => x.textContent).join(','))) === 'Float,Exponential');
  await page.selectOption('#ts', ''); await clickBtn('Create');
  await ev(() => { MTPS.App.state.p.tags.push({ name: 'Wide', type: 'LINT', style: 'Hex' }); MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.push({ t: 'MOV(1401303601200000,Stamp)DIV(1,3,Ratio)ADD(Wide,1,Wide);' }); MTPS.App.render(); });
  check('LINT and LREAL tags in logic verify', (await verifyErrs()).length === 0, JSON.stringify(await verifyErrs()));
  await ev(() => MTPS.App.run('tagsmon')); await wait(150);
  check('offline: an LREAL shows 0.0, a LINT in Hex 16#0000_0000_0000_0000', (await cellText('#tagrows tr[data-tag="Ratio"] td.val')) === '0.0' && (await cellText('#tagrows tr[data-tag="Wide"] td.val')) === '16#0000_0000_0000_0000');
  check('online with LINT and LREAL', await online());
  await ev(() => MTPS.App.run('runm')); await wait(400);
  const dtv = await cellText('#tagrows tr[data-tag="Stamp"] td.val');
  check('a LINT in Date/Time: DT#2014-05-28-…:00:01.200_000 (UTC…) in this computer\'s time zone', /^DT#2014-05-(28|29)-\d\d:\d\d:01\.200_000 \(UTC[+-]\d\d:\d\d\)$/.test(dtv), dtv);
  check('an LREAL keeps 64-bit precision (1/3)', (await ev(() => MTPS.App.racks[0].controller(0).read('Ratio'))) === 1 / 3);
  await page.click('#tagrows tr[data-tag="Wide"] [data-texp]'); await wait(80);
  check('a LINT opens to its 64 bits', (await page.$$('#tagrows tr[data-tag^="Wide."]')).length === 64);
  await shot('3-lint-lreal');
  await ev(() => MTPS.App.run('offline')); await wait(100);
  check('L5X: DataType LINT with Radix Date/Time, LREAL', /<Tag Name="Stamp" TagType="Base" DataType="LINT" Radix="Date\/Time"/.test(await ev(() => MTPS.App.toL5X(MTPS.App.state.p))) && /DataType="LREAL" Radix="Float"/.test(await ev(() => MTPS.App.toL5X(MTPS.App.state.p))));
  // the Data Type Editor: an LREAL member
  await ev(() => MTPS.App.run('newdt')); await wait(120);
  await page.fill('#dten', 'Meas'); await member(0, 'Value', 'LREAL'); await member(1, 'Ok', 'BOOL');
  await clickBtn('Apply');
  check('a type with an LREAL member is 8-byte aligned: LREAL + BOOL = 16 bytes', (await cellText('#dtes')) === 'Data Type Size: 16 bytes');
  await clickBtn('Cancel');
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await ev(() => { MTPS.App.state.p.tags.push({ name: 'Big', type: 'LINT' }); MTPS.App.render(); }, null, tp);
    check('tablet: online', await online(tp));
    await ev(() => MTPS.App.run('tagsmon'), null, tp); await wait(200, tp);
    await tp.tap('#tagrows [data-tag="Big"] [data-tv]'); await wait(200, tp);
    await tp.tap('#p1'); await tp.keyboard.press('Control+a'); await tp.keyboard.type('5000000000'); await clickBtn('OK', tp, true);
    check('tablet (touch): a LINT takes a value past 32 bits (5000000000)', (await ev(() => MTPS.App.racks[0].controller(0).read('Big'), null, tp)) === 5000000000 && (await cellText('#tagrows [data-tag="Big"] [data-tv]', tp)) === '5000000000');
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
};
