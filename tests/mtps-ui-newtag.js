/* MT PLC Studio UI tests: New Tag goes to the scope the user is looking at (owner bug 2026-10-27: a tag made with New
   Tag from Controller Tags went to MainProgram, so it never showed in the tag editor). Every path that makes a tag,
   base and alias, clicked as a user: mouse on the desktop, touch on the tablet and the phone. Called from
   mtps-ui.test.js. */
'use strict';
const fs = require('fs');
module.exports = async function newtag({ browser, URL, check }) {
  const SHOTS = '/tmp/claude-0/shots-tagfix';
  fs.mkdirSync(SHOTS, { recursive: true });
  console.log('New Tag: the scope of the tag editor, base and alias tags, every path (owner bug 2026-10-27)');
  for (const [n, vp, touch] of [['desktop', { width: 1440, height: 900 }, false], ['tablet', { width: 800, height: 1280 }, true], ['phone', { width: 390, height: 844 }, true]]) {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: touch, isMobile: touch });
    const pg = await ctx.newPage(), errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    const wait = ms => pg.waitForTimeout(ms);
    const hit = async sel => { if (touch) await pg.tap(sel); else await pg.click(sel); await wait(200); };
    const create = async () => { const b = (await pg.$$('#layer .dlg .df .btn')).pop(); if (touch) await b.tap(); else await b.click(); await wait(300); };
    const where = name => pg.evaluate(nm => { const P = MTPS.App.state.p; if (P.tags.some(t => t.name === nm)) return 'controller'; const g = P.tasks.flatMap(t => t.programs).find(x => x.tags.some(t => t.name === nm)); return g ? g.name : 'nowhere'; }, name);
    const shown = name => pg.$(`#tagrows [data-tag="${name}"], [data-tag="${name}"]`).then(x => !!x);
    const shot = name => pg.screenshot({ path: `${SHOTS}/${n}-${name}.png` }).catch(() => {});
    await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await wait(400);
    await pg.evaluate(() => MTPS.App.openProject(MTPS.App.example())); await wait(200);
    await pg.evaluate(() => MTPS.App.run('tagsedit')); await wait(300);

    // 1. the tag editor's New Tag button, Controller Tags: a base tag, then an alias picked in the tag browser
    await hit('[data-cmd="newtag"]');
    check(`${n}: New Tag from Controller Tags: Scope is the controller`, (await pg.$eval('#layer #ts', s => s.value)) === '');
    await pg.fill('#layer #tn', 'Pump_Run'); await pg.fill('#layer #tt', 'BOOL'); await create();
    check(`${n}: the base tag is a controller tag and shows in the open tag editor`, (await where('Pump_Run')) === 'controller' && (await shown('Pump_Run')));
    await hit('[data-cmd="newtag"]');
    await pg.fill('#layer #tn', 'Pump_Start');
    await pg.selectOption('#layer #tk', 'alias'); await wait(200);
    await hit('#layer #asg [data-abx="Local:1:I"]'); await hit('#layer #asg [data-abb="Local:1:I.Data"]'); await hit('#layer #asg [data-abp="Local:1:I.Data.4"]');
    check(`${n}: the tag browser writes Alias For, and its data type shows`, (await pg.$eval('#layer #ta', x => x.value)) === 'Local:1:I.Data.4' && (await pg.$eval('#layer #tat', x => x.textContent)) === 'BOOL');
    await shot('newtag-alias'); await create();
    check(`${n}: the alias is a controller tag, shows in the tag editor`, (await where('Pump_Start')) === 'controller' && (await shown('Pump_Start')));
    check(`${n}: the alias points at Local:1:I.Data.4`, await pg.evaluate(() => (MTPS.App.state.p.tags.find(t => t.name === 'Pump_Start') || {}).alias === 'Local:1:I.Data.4'));
    // an alias of the base tag just made, typed in Alias For
    await hit('[data-cmd="newtag"]');
    await pg.fill('#layer #tn', 'Run_Alias'); await pg.selectOption('#layer #tk', 'alias'); await pg.fill('#layer #ta', 'Pump_Run'); await wait(150); await create();
    check(`${n}: an alias of a controller tag is made there too`, (await where('Run_Alias')) === 'controller' && (await shown('Run_Alias')));
    await shot('controller-tags-after');

    // 2. the tag editor on the program scope: New Tag takes the program
    await pg.selectOption('#tscope', 'MainProgram'); await wait(300);
    await hit('[data-cmd="newtag"]');
    check(`${n}: New Tag from the program's tags: Scope is MainProgram`, (await pg.$eval('#layer #ts', s => s.value)) === 'MainProgram');
    await pg.fill('#layer #tn', 'Local_Count'); await pg.fill('#layer #tt', 'DINT'); await create();
    check(`${n}: the program tag shows in the program's tag editor`, (await where('Local_Count')) === 'MainProgram' && (await shown('Local_Count')));
    await pg.selectOption('#tscope', ''); await wait(300);

    // 3. Edit Tags: the blank last row, then Alias For in its cell with the browser (desktop and tablet have the grid)
    if (await pg.$('#tnew')) {
      await hit('#tnew'); await pg.fill('#tnew', 'Grid_Alias'); await pg.keyboard.press('Enter'); await wait(300);
      await hit('#tagrows [data-tag="Grid_Alias"] [data-tcell="alias"]');
      await pg.fill('#tagrows [data-tag="Grid_Alias"] [data-tcell="alias"] input', 'Local:1:I.Data.6'); await pg.keyboard.press('Enter'); await wait(300);
      check(`${n}: Edit Tags: a name in the last row, then Alias For in its cell makes an alias`, await pg.evaluate(() => (MTPS.App.state.p.tags.find(t => t.name === 'Grid_Alias') || {}).alias === 'Local:1:I.Data.6') && (await shown('Grid_Alias')));
      await shot('grid-alias');
    }

    // 4. the organizer: Controller Tags > New Tag… (desktop right-click) makes a controller tag
    if (n === 'desktop') {
      await pg.click('[data-org="ctags"]', { button: 'right' }); await wait(200);
      const it = await pg.evaluateHandle(() => [...document.querySelectorAll('#layer .menu .it')].find(x => /New Tag/.test(x.textContent)));
      await it.click(); await wait(250);
      check('desktop: Controller Tags > New Tag…: Scope is the controller', (await pg.$eval('#layer #ts', s => s.value)) === '');
      await pg.keyboard.press('Escape'); await wait(150);
    }

    // 5. from the ladder (New Tag on an operand) the program of the routine stays the default, as before
    await pg.evaluate(() => { MTPS.App.state.view = 'ladder'; MTPS.App.state.area = 'ladder'; MTPS.App.render(); MTPS.App.run('newtag'); }); await wait(250);
    check(`${n}: New Tag from the ladder: Scope is the routine's program`, (await pg.$eval('#layer #ts', s => s.value)) === 'MainProgram');
    await pg.keyboard.press('Escape'); await wait(150);
    check(`${n}: no JS errors (New Tag scopes)`, !errs.length, errs.join(' | '));
    await ctx.close();
  }
};
