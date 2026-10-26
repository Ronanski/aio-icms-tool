/* MT PLC Studio UI tests: the Studio 5000 File, Edit, Search and Communications menus (Close, the save-changes
   prompt, recent projects, New Component, Select All, Properties, Find Previous / Next Result, Replace, Select Recent
   Path, Go To Faults). Mouse on the desktop, touch on the tablet and the phone. Called from mtps-ui.test.js. */
'use strict';
module.exports = async function menus({ browser, page, URL, check }) {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const wait = ms => page.waitForTimeout(ms);
  const dlgTitle = () => page.$eval('#layer .dlg .dh b', b => b.textContent).catch(() => '');
  const dlgText = () => page.$eval('#layer .dlg .db', b => b.textContent).catch(() => '');
  const dlgBtns = () => page.$$eval('#layer .dlg .df .btn', b => b.map(x => x.textContent)).catch(() => []);
  const clickBtn = async (label, pg = page) => { await pg.evaluate(l => { const b = [...document.querySelectorAll('#layer .dlg .df .btn')].find(x => x.textContent === l); if (b) b.dataset.wapick = '1'; }, label); await pg.click('#layer [data-wapick]'); await pg.waitForTimeout(150); };
  // the items of the open menu: [label, disabled]; a header row is ['#Header']
  const items = (pg = page) => pg.$$eval('#layer .menu > *', r => r.filter(x => !x.hidden).map(x => (x.classList.contains('hd') ? ['#' + x.textContent] : x.tagName === 'HR' ? ['-'] : [x.querySelector('span:not(.k):not(.ck)') ? x.querySelector('span:not(.k):not(.ck)').textContent : x.textContent, x.classList.contains('dis')])));
  // click (or tap) the item of the open menu with this label
  async function pick(label, pg = page, tap = false) {
    const ok = await pg.evaluate(l => { const it = [...document.querySelectorAll('#layer .menu .it')].find(x => !x.hidden && x.querySelector('span:not(.k):not(.ck)') && x.querySelector('span:not(.k):not(.ck)').textContent === l); if (it) it.dataset.wapick = '1'; return !!it; }, label);
    if (!ok) return false;
    if (tap) await pg.tap('#layer [data-wapick]'); else await pg.click('#layer [data-wapick]');
    await pg.waitForTimeout(150);
    return true;
  }
  async function menu(name, label) { await page.click(`.dmenu [data-menu="${name}"]`); await wait(120); return label ? pick(label) : items(); }
  const st = () => ev(() => { const s = MTPS.App.state; return { noProj: s.noProj, dirty: s.dirty, name: s.p.controller.name, file: s.file && s.file.name, sel: s.sel, selRung: s.selRung, view: s.view, routine: s.routine }; });
  async function fresh() {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL); await ev(() => localStorage.clear()); await page.reload(); await wait(300);
    await page.keyboard.press('Escape'); await wait(80);
  }
  async function example() { await ev(() => MTPS.App.openProject(MTPS.App.example())); await wait(120); }
  async function dirty() { await page.click('#ladwrap rect.tap[data-rn][data-ri="0"]'); await wait(60); await page.keyboard.press('Control+r'); await wait(120); }

  console.log('Studio 5000 menus: save-changes prompt (Logix Designer help v37: Close / Exit command)');
  await fresh(); await example(); await dirty();
  check('a change marks the project changed', (await st()).dirty === true);
  await menu('File', 'New Project…');
  check('New Project with changes: "Save changes to Motor_Demo?" with Yes, No, Cancel', (await dlgTitle()) === 'MT PLC Studio' && (await dlgText()).trim() === 'Save changes to Motor_Demo?' && (await dlgBtns()).join(',') === 'Yes,No,Cancel', `${await dlgText()} ${await dlgBtns()}`);
  await clickBtn('Cancel');
  check('Cancel stays in the project, with its changes', (await page.$('#layer .dlg')) === null && (await st()).dirty === true && (await st()).name === 'Motor_Demo');
  await menu('File', 'Open… (.mtp, .L5X)');
  check('Open with changes asks too', (await dlgText()).trim() === 'Save changes to Motor_Demo?');
  await clickBtn('No');
  await page.waitForFunction(() => document.querySelector('#layer .fbi, #layer .fbl .empty'), null, { timeout: 3000 }).catch(() => {});
  check('No goes on without saving: the Open Project file browser', (await dlgTitle()) === 'Open Project' && (await st()).dirty === true);
  await page.keyboard.press('Escape'); await wait(80);
  await menu('File', 'New Project…');
  await clickBtn('Yes');
  await page.waitForFunction(() => document.querySelector('#layer #fbn'), null, { timeout: 3000 }).catch(() => {});
  check('Yes on a project without a file: Save As first', (await dlgTitle()) === 'Save As');
  await page.fill('#fbn', 'WA_Saved'); await clickBtn('Save'); await wait(250);
  check('then the project is saved and New Project opens', (await dlgTitle()) === 'New Project' && (await st()).dirty === false && /WA_Saved\.mtp$/.test(await ev(() => MTPS.App.state.file.path)));
  await page.keyboard.press('Escape'); await wait(80);
  await dirty();
  await menu('File', 'New Project…'); await clickBtn('Yes'); await wait(250);
  check('Yes on a project with a file saves it in place and goes on', (await dlgTitle()) === 'New Project' && (await st()).dirty === false);
  await page.keyboard.press('Escape'); await wait(80);
  await menu('File', 'New Project…');
  check('no changes: no prompt', (await dlgTitle()) === 'New Project');
  await page.keyboard.press('Escape'); await wait(80);
};
