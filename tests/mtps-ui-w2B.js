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

  /* ---------- 4. Data Types > Add-On-Defined ---------- */
  console.log('Wave 2 B: the Add-On-Defined folder (v37 help: Controller Organizer folders)');
  await fresh();
  await page.click('.org [data-org="dts"] [data-tw]'); await wait(80);
  check('Data Types: User-Defined, Strings, Add-On-Defined, Predefined, Module-Defined (the reference order)', (await dtFolders()) === 'User-Defined|Strings|Add-On-Defined|Predefined|Module-Defined', await dtFolders());
  check('Add-On-Defined is empty (no Add-On Instructions): no expand icon, as for an empty User-Defined', (await page.$('.org [data-org="dt:aod"] [data-tw] svg')) === null && (await page.$('.org [data-org="dt:user"] [data-tw] svg')) === null && (await page.$('.org [data-org="dt:str"] [data-tw] svg')) !== null);
  await page.click('.org [data-org="dt:aod"]'); await wait(80);
  check('a click on the empty folder selects it and opens nothing', (await page.$('#layer .dlg')) === null && (await ev(() => MTPS.App.state.orgSel)) === 'dt:aod');
  await shot('4-addon-defined');
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await pp.tap('[data-go="project"]'); await wait(150, pp);
    await pp.tap('.page [data-org="dts"]'); await wait(150, pp);
    check('phone: Project > Data Types shows Add-On-Defined', (await pp.$('.page [data-org="dt:aod"]')) !== null);
    await pp.context().close();
  }

  /* ---------- 5. Tag Editor: Show filter, Filter On, columns ---------- */
  console.log('Wave 2 B: Tag Editor Show filter and columns (v37 help: Tag Editor command bar settings; Filter the tag list; Hide and Show Columns)');
  await fresh();
  await addTag('Spare', 'DINT');
  await ev(() => MTPS.App.run('tagsmon')); await wait(150);
  const rowsTop = (pg = page) => pg.$$eval('#tagrows [data-tag]:not(.mem)', r => r.map(x => x.dataset.tag).join(','));
  check('the command bar: Scope, Show: All Tags, the Filter icon and the filter box', (await cellText('#tshow')) === 'All Tags' && (await page.$('[data-tfon]')) !== null && (await page.$('#tq')) !== null);
  await page.click('#tshow'); await wait(120);
  check('Show offers All Tags and Configure…', JSON.stringify((await items()).map(x => x[0])) === JSON.stringify(['All Tags', 'Configure…']), JSON.stringify(await items()));
  await pick('Configure…');
  check('Configure… opens Define Tag Filter: Filter On (<all>, Unused, Produced, Consumed, Can Be Forced, Alias), Include Data Types, Clear Filter',
    (await dlgTitle()) === 'Define Tag Filter' && (await page.$$eval('#dfon option', o => o.map(x => x.textContent).join(','))) === '<all>,Unused,Produced,Consumed,Can Be Forced,Alias' && (await page.$('#dfclr')) !== null && (await page.$$('#dftl input')).length > 8);
  await page.selectOption('#dfon', 'Alias'); await clickBtn('OK');
  check('Filter On Alias: only the alias tags, Show names the filter', (await rowsTop()) === 'Start_PB,Stop_PB,OL_OK,Motor_Cmd,Run_Lamp' && (await cellText('#tshow')) === 'Alias', await rowsTop());
  await page.click('#tshow'); await wait(120); await pick('Configure…');
  await page.click('#dfclr'); await page.check('#dftl input[value="TIMER"]'); await page.check('#dftl input[value="COUNTER"]'); await clickBtn('OK');
  check('Include Data Types TIMER and COUNTER (after Clear Filter): Run_Timer, Start_Count', (await rowsTop()) === 'Run_Timer,Start_Count' && (await cellText('#tshow')) === 'TIMER, COUNTER', await rowsTop());
  await page.click('#tshow'); await wait(120); await pick('Configure…');
  await page.click('#dfclr'); await page.selectOption('#dfon', 'Unused'); await clickBtn('OK');
  check('Filter On Unused: the tag no logic uses (Spare)', (await rowsTop()) === 'Spare', await rowsTop());
  await page.click('#tshow'); await wait(120); await pick('Configure…');
  await page.selectOption('#dfon', 'Can Be Forced'); await clickBtn('OK');
  check('Filter On Can Be Forced: the I and O module tags and the aliases of I/O points', (await rowsTop()) === 'Local:1:I,Local:2:I,Local:2:O,Start_PB,Stop_PB,OL_OK,Motor_Cmd,Run_Lamp', await rowsTop());
  await page.click('#tshow'); await wait(120);
  check('Filter History: the filters used last, newest first (up to five)', JSON.stringify((await items()).map(x => x[0])) === JSON.stringify(['All Tags', 'Configure…', 'Can Be Forced', 'Unused', 'TIMER, COUNTER', 'Alias']), JSON.stringify(await items()));
  await pick('Alias');
  check('a filter from the history shows its tags again', (await cellText('#tshow')) === 'Alias' && (await rowsTop()).split(',').length === 5);
  await page.click('#tshow'); await wait(120); await pick('All Tags');
  check('All Tags shows every tag again', (await rowsTop()).split(',').length === 15, await rowsTop());
  await page.click('[data-tfon]'); await wait(120);
  check('the Filter icon: Filter On Name, Filter On Description, Filter On Both', JSON.stringify((await items()).map(x => x[0])) === JSON.stringify(['Filter On Name', 'Filter On Description', 'Filter On Both']));
  await pick('Filter On Description');
  await page.fill('#tq', 'lamp'); await wait(120);
  check('Filter On Description: "lamp" finds Run_Timer (Run lamp delay) and Run_Lamp (H1 RUN LAMP)', (await rowsTop()) === 'Run_Timer,Run_Lamp', await rowsTop());
  await page.click('[data-tfon]'); await wait(120); await pick('Filter On Name');
  await page.fill('#tq', 'run'); await wait(120);
  check('Filter On Name: "run" finds only names (Motor_Run, Run_Timer, Run_Lamp)', (await rowsTop()) === 'Motor_Run,Run_Timer,Run_Lamp', await rowsTop());
  await page.fill('#tq', ''); await wait(80);
  // columns
  const heads = (pg = page) => pg.$$eval('#tagpage .tagtbl th', t => t.filter(x => getComputedStyle(x).display !== 'none').map(x => x.textContent).join('|'));
  await page.click('#tagpage .tagtbl th:nth-child(5)', { button: 'right' }); await wait(120);
  check('right-click a column name: Hide Column, then Toggle Column with each column', (await items())[0][0] === 'Hide Column "Style"' && (await items()).map(x => x[0]).slice(1).join(',') === 'Value,Force Mask,Style,Data Type,Description');
  await pick('Hide Column "Style"');
  check('Monitor Tags without the Style column (cells too)', (await heads()) === '|Name|Value|Force Mask|Data Type|Description' && (await page.$eval('#tagrows tr[data-tag="Spare"] td:nth-child(5)', td => getComputedStyle(td).display)) === 'none');
  await ev(() => { MTPS.App.state.tagMode = 'edit'; MTPS.App.render(); }); await wait(120);
  check('Edit Tags keeps its own columns (Style still shown there)', (await heads()).includes('Style'));
  await ev(() => { MTPS.App.state.tagMode = 'mon'; MTPS.App.render(); }); await wait(120);
  await page.click('.dmenu [data-menu="View"]'); await wait(120);
  await pick('Toggle Column…');
  check('View > Toggle Column… lists the columns, Style unticked', (await items()).find(x => x[0] === 'Style') !== undefined && (await page.$$eval('#layer .menu .it', r => r.filter(x => x.textContent.includes('Style')).map(x => x.querySelector('.ck').textContent).join())) === '');
  await pick('Style');
  check('Toggle Column shows it again', (await heads()) === '|Name|Value|Force Mask|Style|Data Type|Description');
  await shot('5-tag-filter');
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await ev(() => MTPS.App.run('tagsmon'), null, tp); await wait(200, tp);
    await tp.tap('#tshow'); await wait(150, tp); await pick('Configure…', tp, true);
    await tp.selectOption('#dfon', 'Alias'); await clickBtn('OK', tp, true);
    check('tablet (touch): Show > Configure… > Alias', (await rowsTop(tp)).split(',').length === 5 && (await cellText('#tshow', tp)) === 'Alias');
    await tp.tap('[data-allmenu]'); await wait(150, tp); await tp.tap('[data-fold="View"]'); await wait(150, tp);
    await pick('Toggle Column…', tp, true);
    await pick('Description', tp, true);
    check('tablet (touch): View > Toggle Column… hides Description', !(await heads(tp)).includes('Description'));
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await pp.tap('[data-go="tags"]'); await wait(200, pp);
    await pp.tap('#tshow'); await wait(150, pp); await pick('Configure…', pp, true);
    await pp.selectOption('#dfon', 'Alias'); await clickBtn('OK', pp, true);
    check('phone (touch): the Tags page has Show too (Alias: 5 tags)', (await rowsTop(pp)).split(',').length === 5 && (await ev(() => document.documentElement.scrollWidth <= innerWidth + 1, null, pp)));
    await shot('5-tag-filter-phone', pp);
    check('phone: no JS errors', pp._errs.length === 0, pp._errs.join(' | '));
    await pp.context().close();
  }

  /* ---------- 6. Watch ---------- */
  console.log('Wave 2 B: the Watch tab (v37 help: About the Output Window; Create and use a Quick Watch list)');
  await fresh();
  await addTag('WBit', 'BOOL'); await addTag('WNum', 'DINT');
  await shot('6-watch-before');
  await page.click('.dmenu [data-menu="View"]'); await wait(120);
  check('View menu: Watch', (await items()).some(x => x[0] === 'Watch' && !x[1]));
  await pick('Watch');
  check('View > Watch opens the Output window on its Watch tab', (await page.$('.derr .wbar #wsel')) !== null && (await cellText('.derr .otab.on')) === 'Watch');
  const wadd = async (n, pg = page, tap = false) => { if (tap) await pg.tap('#wadd'); else await pg.click('#wadd'); await pg.keyboard.type(n); await pg.keyboard.press('Enter'); await wait(120, pg); };
  const wrows = (pg = page) => pg.$$eval('#wrows tr[data-wrow]', r => r.map(x => x.children[0].textContent + '=' + x.children[2].textContent).join(','));
  await wadd('Motor_Run'); await wadd('Run_Timer.PRE'); await wadd('WBit'); await wadd('WNum');
  check('typing tag names adds them to the Quick Watch list; offline the Values are blank', (await wrows()) === 'Motor_Run=,Run_Timer.PRE=,WBit=,WNum=', await wrows());
  await wadd('Nope');
  check('a name that is not a tag is refused', (await page.$$('#wrows tr[data-wrow]')).length === 4 && /not a tag/.test(await cellText('.toast')));
  check('online:', await online());
  await ev(() => MTPS.App.ctl.setMode('remrun')); await wait(400);
  check('online the Values are live (Run_Timer.PRE = 5000)', (await wrows()) === 'Motor_Run=0,Run_Timer.PRE=5000,WBit=0,WNum=0', await wrows());
  await ev(() => MTPS.App.ctl.write('WNum', 7)); await wait(450);
  check('a change in the controller shows in the Value without a click', (await wrows()).includes('WNum=7'), await wrows());
  await page.click('#wrows tr[data-wrow="|WBit"] [data-wval]'); await wait(300);
  check('a click on a BOOL Value toggles it in the controller', (await ev(() => MTPS.App.ctl.read('WBit'))) === 1 && (await wrows()).includes('WBit=1'));
  await page.click('#wrows tr[data-wrow="|WNum"] [data-wval]'); await wait(150);
  await page.fill('#p1', '42'); await clickBtn('OK'); await wait(300);
  check('a click on a DINT Value writes a number', (await ev(() => MTPS.App.ctl.read('WNum'))) === 42 && (await wrows()).includes('WNum=42'));
  await page.click('.wtbl th[data-wsort="Name"]'); await wait(120);
  check('a click on Name sorts the list', (await wrows()) === 'Motor_Run=0,Run_Timer.PRE=5000,WBit=1,WNum=42', await wrows());
  await page.click('#wname'); await page.keyboard.type('Pump_List'); await page.keyboard.press('Enter'); await wait(150);
  check('naming the list saves it with the project', await ev(() => JSON.stringify(MTPS.App.state.p.watch.map(l => [l.name, l.tags.length]))) === '[["Pump_List",4]]' && (await page.$eval('#wsel', s => s.value)) === 'list:Pump_List');
  check('a Quick Watch list is not logic: no online edits are pending', (await page.$('.editbar')) === null && (await cellText('[title="Online edits"]')) === 'No Edits');
  await page.click('#wrows tr[data-wrow="|WNum"] [data-wdel]'); await wait(120);
  check('the remove button takes a tag off the saved list', await ev(() => MTPS.App.state.p.watch[0].tags.length) === 3);
  await page.selectOption('#wsel', 'rt:MainProgram/MainRoutine'); await wait(150);
  check('the Quick Watch menu lists the open routine: its tags (still sorted by Name), a structure as {…}', (await wrows()) === 'Motor_Cmd=0,Motor_Run=0,OL_OK=0,Run_Lamp=0,Run_Timer={…},Start_Count={…},Start_ONS=0,Start_PB=0,Stop_PB=0', await wrows());
  await shot('6-watch');
  await ev(() => MTPS.App.run('offline')); await wait(250);
  await page.selectOption('#wsel', 'list:Pump_List'); await wait(150);
  check('offline the last online Values stay', (await wrows()).includes('WBit=1'), await wrows());
  check('the list is in the saved project', JSON.parse(await ev(() => JSON.stringify(MTPS.App.state.p))).watch[0].tags.length === 3);
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await tp.tap('[data-allmenu]'); await wait(150, tp); await tp.tap('[data-fold="View"]'); await wait(150, tp);
    await pick('Watch', tp, true); await wait(150, tp);
    check('tablet (touch): View > Watch opens the Watch tab', (await tp.$('#wadd')) !== null);
    await wadd('Run_Timer', tp, true);
    check('tablet (touch): a tag is added', (await wrows(tp)) === 'Run_Timer=', await wrows(tp));
    await shot('6-watch-tablet', tp);
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await pp.tap('[data-go="more"]'); await wait(200, pp);
    await pp.tap('[data-otab="watch"]'); await wait(150, pp);
    await wadd('Motor_Run', pp, true);
    check('phone (touch): More > Watch, a tag is added', (await wrows(pp)) === 'Motor_Run=' && (await ev(() => document.documentElement.scrollWidth <= innerWidth + 1, null, pp)));
    await shot('6-watch-phone', pp);
    check('phone: no JS errors', pp._errs.length === 0, pp._errs.join(' | '));
    await pp.context().close();
  }

  /* ---------- 7. Quick View ---------- */
  console.log('Wave 2 B: the Quick View pane (v37 help: Controller Organizer)');
  await fresh();
  const qv = (pg = page) => pg.$eval('#qview', e => e.innerText.replace(/\s+/g, ' ').trim()).catch(() => '');
  check('the Quick View pane is below the Controller Organizer tree', await ev(() => { const q = document.querySelector('.org #qview'), t = document.querySelector('.org .tree'); return !!q && q.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 1; }));
  await page.click('.org [data-org="rt:MainProgram/MainRoutine"]'); await wait(150);
  const nr = await ev(() => MTPS.App.state.p.tasks[0].programs[0].routines[0].rungs.length);
  check('a routine: its type, program and rungs', (await qv()) === `Quick View MainRoutine Type Ladder Diagram routine Program MainProgram Main Routine Yes Rungs ${nr}`, await qv());
  await page.click('.org [data-org="mod:1"]'); await wait(150);
  check('a module: its type, slot', /^Quick View DI_1 Type PLC-DI16-24V Slot 1 Inhibited No/.test(await qv()), await qv());
  await page.keyboard.press('Escape'); await wait(120);
  await ev(() => { MTPS.App.state.p.dataTypes.push({ name: 'Motor', desc: 'A motor', members: [{ name: 'Run', type: 'BOOL' }, { name: 'Speed', type: 'REAL' }] }); MTPS.App.render(); });
  if (!(await page.$('.org [data-org="dt:user"]'))) { await page.click('.org [data-org="dts"]'); await wait(150); }
  await page.click('.org [data-org="dt:user"]'); await wait(150);
  check('a folder: its data types', (await qv()) === 'Quick View User-Defined Type Folder Data types 1', await qv());
  if (!(await page.$('.org [data-org="dt:u:Motor"]'))) { await page.click('.org [data-org="dt:user"]'); await wait(150); }
  await page.click('.org [data-org="dt:u:Motor"]'); await wait(150);
  check('a user-defined data type: description, members and size', (await qv()) === 'Quick View Motor Type User-Defined data type Description A motor Members 2 Size 8 bytes', await qv());
  if (!(await page.$('.org [data-org="dt:p:TIMER"]'))) { await page.click('.org [data-org="dt:pre"]'); await wait(150); }
  await page.click('.org [data-org="dt:p:TIMER"]'); await wait(150);
  check('a predefined data type: TIMER (PRE, ACC, EN, TT, DN), 12 bytes', (await qv()) === 'Quick View TIMER Type Predefined data type Members 5 Size 12 bytes', await qv());
  await shot('7-quick-view');
  await page.click('#qview [data-qv]'); await wait(120);
  check('a click on its header folds it (kept in the preferences)', (await qv()) === 'Quick View' && await ev(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => /pref/i.test(k))) || '{}').qv === false));
  await page.click('#qview [data-qv]'); await wait(120);
  check('a second click opens it again', (await qv()).startsWith('Quick View TIMER'));
  {
    const tp = await touchPage(800, 1280);
    await fresh(tp);
    await tp.tap('[data-drawer="1"]'); await wait(200, tp);
    await tp.tap('.org [data-org="task:MainTask"]'); await wait(200, tp);
    check('tablet (touch): the organizer drawer has Quick View; a task: Continuous', /^Quick View MainTask Type Continuous task Watchdog 500 ms Programs 1/.test(await qv(tp)), await qv(tp));
    await shot('7-quick-view-tablet', tp);
    check('tablet: no JS errors', tp._errs.length === 0, tp._errs.join(' | '));
    await tp.context().close();
  }
  {
    const pp = await touchPage(390, 844);
    await fresh(pp);
    await pp.tap('[data-go="project"]'); await wait(200, pp);
    await pp.tap('[data-org="ctl"]'); await wait(200, pp);
    check('phone (touch): the Project page has Quick View; the controller', /^Quick View Motor_Demo Type PLC-CPU/.test(await qv(pp)) && /Mode Offline/.test(await qv(pp)) && (await ev(() => document.documentElement.scrollWidth <= innerWidth + 1, null, pp)), await qv(pp));
    await shot('7-quick-view-phone', pp);
    check('phone: no JS errors', pp._errs.length === 0, pp._errs.join(' | '));
    await pp.context().close();
  }
};
