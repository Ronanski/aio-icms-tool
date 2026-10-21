/* Exercises: 100 graded practice tasks, easy → hard, by topic, across every module (Ladder, Wiring, Electrical Diagram,
   HMI). A ladder exercise is graded like a lesson: its steps press inputs on a simulated PLC and look at the outputs. An
   exercise on the drawing, the wiring or the HMI is graded on the user's own project: the checker presses its buttons
   and looks at what happens. Every exercise has a hint and a solution (a ladder program, or steps the checker can do). */
(function () {
  'use strict';
  const X = [];
  const st = (inp, t, expect, say, set) => ({ in: inp, t, ...(expect ? { expect } : {}), say, ...(set ? { set } : {}) });
  const R = { 1: 1 };   // the STOP button (wired N.C.) is released: its input is ON
  const on = (...b) => Object.fromEntries([1, ...b].map(k => [k, 1]));   // STOP released and these inputs ON
  // a ladder exercise: board 'practice' (4 in / 4 lamps) or 'practice16' (8 in / 8 lamps)
  const lad = (diff, topic, board, title, body, hint, solution, test) => X.push({ diff, topic, ex: board, title, body, hint, solution, test });
  // an exercise on the user's project (drawing, wiring, HMI): check(A) → [{say, ok}], solve(A) does it the reference way
  const prj = (diff, topic, start, title, body, hint, check, solve, extra) => X.push({ diff, topic, ex: typeof start === 'string' ? start : null, build: typeof start === 'function' ? start : null, title, body, hint, check, solve, ...(extra || {}) });
  const P4 = '<p class="help">Board: <b>Practice board</b> — S1 START <code>I:0/0</code>, S2 STOP <code>I:0/1</code> (N.C.: ON while released), S3 JOG <code>I:0/2</code>, S4 MAN/AUTO <code>I:0/3</code>; lamps H1 green <code>O:0/0</code>, H2 red <code>O:0/1</code>, H3 amber <code>O:0/2</code>, H4 blue <code>O:0/3</code>.</p>';
  const P16 = '<p class="help">Board: <b>Practice board 16</b> — S1 START <code>I:0/0</code>, S2 STOP <code>I:0/1</code> (N.C.), S3–S6 push buttons <code>I:0/2</code>–<code>I:0/5</code>, S7 and S8 selectors <code>I:0/6</code>, <code>I:0/7</code>; lamps H1–H8 on <code>O:0/0</code>–<code>O:0/7</code>.</p>';
  const press = (b, t, expect, say, also = {}) => st({ ...R, [b]: 1, ...also }, t, expect, say);
  const seal = (o, start = 0) => [
    st(R, 0.1, { [o]: 0 }, 'Idle: the lamp is off'),
    press(start, 0.1, { [o]: 1 }, 'Press START: the lamp turns on'),
    st(R, 0.3, { [o]: 1 }, 'Release START: it stays on'),
    st({}, 0.1, { [o]: 0 }, 'Press STOP: it turns off'),
    st(R, 0.3, { [o]: 0 }, 'Release STOP: it stays off'),
  ];

  /* ================= EASY (25) ================= */
  lad('easy', 'Contacts & coils', 'practice', 'Lamp follows a button',
    `<p>Make the green lamp H1 light while S1 is held, and go out when it is released.</p>${P4}`,
    'One rung: a normally open contact (XIC) on the button, an output (OTE) on the lamp.',
    ['XIC I:0/0 OTE O:0/0'],
    [st(R, 0.1, { 0: 0 }, 'S1 released: H1 off'), press(0, 0.1, { 0: 1 }, 'Hold S1: H1 on'), st(R, 0.1, { 0: 0 }, 'Release S1: H1 off')]);
  lad('easy', 'Contacts & coils', 'practice', 'NOT: on until you press',
    `<p>The red lamp H2 is on while S1 is <b>not</b> pressed, and goes out while you hold S1.</p>${P4}`,
    'XIO is true while its bit is OFF.',
    ['XIO I:0/0 OTE O:0/1'],
    [st(R, 0.1, { 1: 1 }, 'S1 released: H2 on'), press(0, 0.1, { 1: 0 }, 'Hold S1: H2 off'), st(R, 0.1, { 1: 1 }, 'Release S1: H2 on again')]);
  lad('easy', 'Contacts & coils', 'practice', 'A normally closed STOP button',
    `<p>S2 STOP is wired normally closed: its input is ON while nobody presses it. Light the red lamp H2 <b>while STOP is pressed</b>.</p>${P4}`,
    'Pressed means the input is OFF — which contact is true when a bit is OFF?',
    ['XIO I:0/1 OTE O:0/1'],
    [st(R, 0.1, { 1: 0 }, 'STOP released: H2 off'), st({}, 0.1, { 1: 1 }, 'STOP pressed: H2 on'), st(R, 0.1, { 1: 0 }, 'STOP released: H2 off')]);
  lad('easy', 'Contacts & coils', 'practice', 'Selector switch',
    `<p>Light the blue lamp H4 while the selector S4 is in AUTO.</p>${P4}`,
    'A selector holds its position: its input stays ON in AUTO.',
    ['XIC I:0/3 OTE O:0/3'],
    [st(R, 0.1, { 3: 0 }, 'MAN: H4 off'), st(on(3), 0.1, { 3: 1 }, 'AUTO: H4 on'), st(R, 0.1, { 3: 0 }, 'Back to MAN: H4 off')]);
  lad('easy', 'Logic', 'practice', 'AND: two buttons together',
    `<p>H1 lights only while S1 <b>and</b> S3 are both held.</p>${P4}`,
    'Two contacts in series on one rung.',
    ['XIC I:0/0 XIC I:0/2 OTE O:0/0'],
    [press(0, 0.1, { 0: 0 }, 'Only S1: H1 off'), press(2, 0.1, { 0: 0 }, 'Only S3: H1 off'), st(on(0, 2), 0.1, { 0: 1 }, 'S1 and S3: H1 on'), st(R, 0.1, { 0: 0 }, 'Both released: H1 off')]);
  lad('easy', 'Logic', 'practice', 'OR: either button',
    `<p>The amber lamp H3 lights while S1 <b>or</b> S3 is held (or both).</p>${P4}`,
    'Two contacts in parallel: a branch (BST … NXB … BND).',
    ['BST XIC I:0/0 NXB XIC I:0/2 BND OTE O:0/2'],
    [st(R, 0.1, { 2: 0 }, 'None: H3 off'), press(0, 0.1, { 2: 1 }, 'S1: H3 on'), press(2, 0.1, { 2: 1 }, 'S3: H3 on'), st(on(0, 2), 0.1, { 2: 1 }, 'Both: H3 on')]);
  lad('easy', 'Logic', 'practice', 'Only in manual mode',
    `<p>H1 lights while S1 is held, but only while the selector S4 is in MAN.</p>${P4}`,
    'S4 in AUTO turns I:0/3 ON — block H1 with an XIO.',
    ['XIC I:0/0 XIO I:0/3 OTE O:0/0'],
    [press(0, 0.1, { 0: 1 }, 'MAN, S1: H1 on'), st(on(0, 3), 0.1, { 0: 0 }, 'AUTO, S1: H1 off'), st(on(3), 0.1, { 0: 0 }, 'AUTO, no button: H1 off')]);
  lad('easy', 'Logic', 'practice', 'XOR: exactly one',
    `<p>H4 lights when exactly one of S1 and S3 is held — not when both are.</p>${P4}`,
    'Two branches: S1 and not S3, or not S1 and S3.',
    ['BST XIC I:0/0 XIO I:0/2 NXB XIO I:0/0 XIC I:0/2 BND OTE O:0/3'],
    [st(R, 0.1, { 3: 0 }, 'None: H4 off'), press(0, 0.1, { 3: 1 }, 'S1: H4 on'), press(2, 0.1, { 3: 1 }, 'S3: H4 on'), st(on(0, 2), 0.1, { 3: 0 }, 'Both: H4 off')]);
  lad('easy', 'Contacts & coils', 'practice', 'Lamp test',
    `<p>While S3 JOG is held, all four lamps light (a lamp test).</p>${P4}`,
    'One contact, then a branch with four outputs.',
    ['XIC I:0/2 BST OTE O:0/0 NXB OTE O:0/1 NXB OTE O:0/2 NXB OTE O:0/3 BND'],
    [st(R, 0.1, { 0: 0, 1: 0, 2: 0, 3: 0 }, 'Released: all off'), press(2, 0.1, { 0: 1, 1: 1, 2: 1, 3: 1 }, 'Hold S3: all four on'), st(R, 0.1, { 0: 0, 3: 0 }, 'Release: all off')]);
  lad('easy', 'Logic', 'practice', 'MAN and AUTO lamps',
    `<p>The selector S4 shows its position: blue H4 in AUTO, red H2 in MAN.</p>${P4}`,
    'Two rungs, one XIC and one XIO on the same input.',
    ['XIC I:0/3 OTE O:0/3', 'XIO I:0/3 OTE O:0/1'],
    [st(R, 0.1, { 1: 1, 3: 0 }, 'MAN: H2 on, H4 off'), st(on(3), 0.1, { 1: 0, 3: 1 }, 'AUTO: H4 on, H2 off')]);
  lad('easy', 'Contacts & coils', 'practice', 'Internal bit',
    `<p>Use an internal bit: S1 turns <code>B3:0/0</code> on, and H1 and H3 both follow <code>B3:0/0</code>.</p>${P4}`,
    'B3 bits are memory: write one with OTE, read it with XIC.',
    ['XIC I:0/0 OTE B3:0/0', 'XIC B3:0/0 BST OTE O:0/0 NXB OTE O:0/2 BND'],
    [press(0, 0.1, { 0: 1, 2: 1 }, 'S1: H1 and H3 on'), st(R, 0.1, { 0: 0, 2: 0 }, 'Released: both off')]);
  lad('easy', 'Seal-in & latches', 'practice', 'Start / stop with seal-in',
    `<p>Momentary START S1 and STOP S2: H1 stays on after START is released, until STOP.</p>${P4}`,
    'A branch around the START contact with H1’s own contact. STOP is N.C.: use XIC for it (fail-safe).',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0'], seal(0));
  lad('easy', 'Seal-in & latches', 'practice', 'Running and stopped lamps',
    `<p>Start/stop H1 as before, and light the red H2 whenever H1 is off.</p>${P4}`,
    'Second rung: XIO on H1’s output.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIO O:0/0 OTE O:0/1'],
    [st(R, 0.1, { 0: 0, 1: 1 }, 'Stopped: H2 on'), press(0, 0.1, { 0: 1, 1: 0 }, 'START: H1 on, H2 off'), st(R, 0.2, { 0: 1, 1: 0 }, 'Still running'), st({}, 0.1, { 0: 0, 1: 1 }, 'STOP: H2 on')]);
  lad('easy', 'Seal-in & latches', 'practice', 'Latch and unlatch',
    `<p>Use OTL / OTU: S1 latches the amber H3 on, pressing STOP unlatches it.</p>${P4}`,
    'XIC on START → OTL; XIO on STOP (pressed = OFF) → OTU.',
    ['XIC I:0/0 OTL O:0/2', 'XIO I:0/1 OTU O:0/2'],
    [press(0, 0.1, { 2: 1 }, 'S1: H3 on'), st(R, 0.3, { 2: 1 }, 'Released: H3 stays on'), st({}, 0.1, { 2: 0 }, 'STOP: H3 off'), st(R, 0.2, { 2: 0 }, 'Stays off')]);
  lad('easy', 'Seal-in & latches', 'practice', 'STOP wins',
    `<p>A start/stop for H1 where pressing START and STOP together keeps H1 off.</p>${P4}`,
    'Put the STOP contact in series after the START / seal-in branch.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0'],
    [st({ 0: 1 }, 0.2, { 0: 0 }, 'START and STOP together: H1 off'), press(0, 0.1, { 0: 1 }, 'START alone: H1 on'), st({ 0: 1 }, 0.1, { 0: 0 }, 'STOP while START held: H1 off')]);
  lad('easy', 'Seal-in & latches', 'practice', 'Start only in AUTO',
    `<p>H1 is a start/stop, but it can run only while S4 is in AUTO; switching to MAN stops it.</p>${P4}`,
    'Add the selector contact in series with STOP.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/3 OTE O:0/0'],
    [press(0, 0.1, { 0: 0 }, 'MAN + START: H1 stays off'), st(on(0, 3), 0.1, { 0: 1 }, 'AUTO + START: H1 on'), st(on(3), 0.2, { 0: 1 }, 'Released: runs'), st(R, 0.1, { 0: 0 }, 'MAN: H1 stops')]);
  lad('easy', 'Timers', 'practice', 'On-delay lamp',
    `<p>Two seconds after S4 is switched to AUTO, the amber H3 lights. Back to MAN: off at once.</p>${P4}`,
    'TON T4:0, time base 1.0, preset 2; H3 on its DN bit.',
    ['XIC I:0/3 TON T4:0 1.0 2 0', 'XIC T4:0/DN OTE O:0/2'],
    [st(on(3), 1.5, { 2: 0 }, 'AUTO for 1.5 s: H3 off'), st(on(3), 1, { 2: 1 }, 'After 2 s: H3 on'), st(R, 0.1, { 2: 0 }, 'MAN: H3 off')]);
  lad('easy', 'Timers', 'practice', 'Off-delay lamp',
    `<p>H4 lights while S3 is held and stays on 3 seconds after it is released.</p>${P4}`,
    'TOF: DN is ON while the rung is true and for the preset after it goes false.',
    ['XIC I:0/2 TOF T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/3'],
    [press(2, 0.2, { 3: 1 }, 'Hold S3: H4 on'), st(R, 2, { 3: 1 }, 'Released 2 s: still on'), st(R, 1.5, { 3: 0 }, 'After 3 s: off')]);
  lad('easy', 'Timers', 'practice', 'Timing lamp',
    `<p>AUTO starts a 3 s timer T4:0. Amber H3 is on while it times, green H1 when it is done.</p>${P4}`,
    'Use the TT (timing) and DN (done) bits of T4:0.',
    ['XIC I:0/3 TON T4:0 1.0 3 0', 'XIC T4:0/TT OTE O:0/2', 'XIC T4:0/DN OTE O:0/0'],
    [st(on(3), 1, { 2: 1, 0: 0 }, 'Timing: H3 on, H1 off'), st(on(3), 2.5, { 2: 0, 0: 1 }, 'Done: H1 on, H3 off'), st(R, 0.1, { 0: 0, 2: 0 }, 'MAN: both off')]);
  lad('easy', 'Counters', 'practice', 'Count to three',
    `<p>Count presses of S3. After the third, blue H4 lights. STOP resets the count.</p>${P4}`,
    'CTU C5:0 preset 3 on S3; H4 on C5:0/DN; RES C5:0 on STOP.',
    ['XIC I:0/2 CTU C5:0 3 0', 'XIC C5:0/DN OTE O:0/3', 'XIO I:0/1 RES C5:0'],
    [press(2, 0.05), st(R, 0.05, { 3: 0 }, 'One press: off'), press(2, 0.05), st(R, 0.05, { 3: 0 }, 'Two presses: off'), press(2, 0.05), st(R, 0.05, { 3: 1 }, 'Three presses: H4 on'), st({}, 0.1, { 3: 0 }, 'STOP: reset, off')]);
  lad('easy', 'Counters', 'practice', 'Compare a count',
    `<p>Count S3 presses with C5:0 (preset 4). Red H2 lights from the second press, blue H4 at the fourth.</p>${P4}`,
    'GEQ C5:0.ACC 2 for H2; the DN bit for H4.',
    ['XIC I:0/2 CTU C5:0 4 0', 'GEQ C5:0.ACC 2 OTE O:0/1', 'XIC C5:0/DN OTE O:0/3', 'XIO I:0/1 RES C5:0'],
    [press(2, 0.05), st(R, 0.05, { 1: 0 }, 'One press: H2 off'), press(2, 0.05), st(R, 0.05, { 1: 1, 3: 0 }, 'Two: H2 on'), press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05, { 3: 1 }, 'Four: H4 on')]);
  lad('easy', 'Compare & math', 'practice', 'Move a number',
    `<p>S1 moves 25 into <code>N7:0</code>, STOP moves 0. Green H1 lights while <code>N7:0</code> equals 25.</p>${P4}`,
    'MOV 25 N7:0, MOV 0 N7:0, EQU N7:0 25.',
    ['XIC I:0/0 MOV 25 N7:0', 'XIO I:0/1 MOV 0 N7:0', 'EQU N7:0 25 OTE O:0/0'],
    [st(R, 0.1, { 0: 0 }, 'Start: H1 off'), press(0, 0.1, { 0: 1 }, 'S1: H1 on'), st(R, 0.2, { 0: 1 }, 'Released: stays on (N7:0 keeps 25)'), st({}, 0.1, { 0: 0 }, 'STOP: H1 off')]);
  lad('easy', 'Compare & math', 'practice', 'Greater than',
    `<p>S1 moves 5 into <code>N7:0</code>, S3 moves 15. Amber H3 lights while <code>N7:0</code> is greater than 10.</p>${P4}`,
    'Two MOV rungs and a GRT.',
    ['XIC I:0/0 MOV 5 N7:0', 'XIC I:0/2 MOV 15 N7:0', 'GRT N7:0 10 OTE O:0/2'],
    [press(2, 0.1, { 2: 1 }, 'S3 (15): H3 on'), st(R, 0.1, { 2: 1 }, 'Released: on'), press(0, 0.1, { 2: 0 }, 'S1 (5): H3 off')]);
  prj('easy', 'Electrical Diagram', 'blank', 'Draw a lamp circuit',
    `<p>In the <b>Electrical Diagram</b>, draw: a <b>+24 V</b> point, push button <b>S5</b> (N.O.), lamp <b>H5</b>, a <b>0 V</b> point, and wire them in a column. Press <b>▶ Play</b> and S5 to test it.</p><p class="help">Starts from an empty project. Symbols: Library → Sources (Point +24 V, Point 0 V), Switches, Loads.</p>`,
    'Library → Sources → Point +24 V; Switches → Push button N.O.; Loads → Lamp; Point 0 V. Click a terminal, then the next one.',
    async A => { const r = await A.pressTest('S5', 'H5'); return [{ say: 'The drawing has S5 and H5', ok: A.has('S5') && A.has('H5') }, { say: 'Pressing S5 lights H5', ok: r.on }, { say: 'Releasing S5 turns H5 off', ok: r.off }]; },
    A => { A.draw([['pP', 'XP1', 200, 40], ['pbno', 'S5', 200, 160], ['lamp', 'H5', 200, 280], ['pM', 'XP2', 200, 400]], [[0, 'J', 1, '13'], [1, '14', 2, 'X1'], [2, 'X2', 3, 'J']]); });
  prj('easy', 'HMI', 'practice', 'An HMI lamp and button',
    `<p>On the <b>HMI</b> screen add a <b>Push Button</b> on <code>B3:0/0</code> and a <b>Pilot Light</b> on <code>O:0/0</code>. In the ladder, make <code>B3:0/0</code> light H1. RUN the PLC and press the HMI button.</p>${P4}`,
    'HMI → Studio: Push Button (tag B3:0/0), Pilot Light (tag O:0/0). Ladder: XIC B3:0/0 OTE O:0/0.',
    async A => [{ say: 'HMI push button on B3:0/0', ok: A.hmi('pb', 'B3:0/0') }, { say: 'HMI pilot light on O:0/0', ok: A.hmi('lamp', 'O:0/0') },
      ...A.grade([st(R, 0.1, { 0: 0 }, 'HMI button released: H1 off', { 'B3:0/0': 0 }), st(R, 0.1, { 0: 1 }, 'HMI button pressed: H1 on', { 'B3:0/0': 1 })])],
    A => { A.addHmi('pb', { label: 'H1', tag: 'B3:0/0' }); A.addHmi('lamp', { label: 'H1', tag: 'O:0/0' }); A.setLadder(['XIC B3:0/0 OTE O:0/0']); });

  /* ================= MEDIUM (40) ================= */
  lad('medium', 'Seal-in & latches', 'practice', 'Jog and run',
    `<p>H1 is a start/stop motor (S1 / S2). S3 JOG runs it only while held, and does not latch it.</p>${P4}`,
    'Latch an internal bit B3:0/0 with START/STOP; H1 = B3:0/0 OR JOG.',
    ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0', 'BST XIC B3:0/0 NXB XIC I:0/2 BND OTE O:0/0'],
    [press(2, 0.1, { 0: 1 }, 'Hold JOG: H1 on'), st(R, 0.2, { 0: 0 }, 'Release JOG: H1 off'), press(0, 0.1, { 0: 1 }, 'START: H1 on'), st(R, 0.2, { 0: 1 }, 'Released: runs'), st({}, 0.1, { 0: 0 }, 'STOP: off')]);
  lad('medium', 'Seal-in & latches', 'practice', 'Push on, push off',
    `<p>Each press of S3 toggles blue H4: first press on, next press off, and so on.</p>${P4}`,
    'A one-shot (ONS) makes a one-scan pulse; H4 = pulse XOR H4.',
    ['XIC I:0/2 ONS B3:1/0 OTE B3:0/0', 'BST XIC B3:0/0 XIO O:0/3 NXB XIO B3:0/0 XIC O:0/3 BND OTE O:0/3'],
    [press(2, 0.1, { 3: 1 }, 'Press 1: on'), st(R, 0.1, { 3: 1 }, 'Released: on'), press(2, 0.1, { 3: 0 }, 'Press 2: off'), st(R, 0.1, { 3: 0 }, 'Released: off'), press(2, 0.1, { 3: 1 }, 'Press 3: on')]);
  lad('medium', 'Timers', 'practice', 'Flasher',
    `<p>In AUTO, amber H3 blinks (0.5 s on, 0.5 s off) for as long as S4 stays in AUTO.</p>${P4}`,
    'Two TON timers that restart each other, base 0.01, preset 50.',
    ['XIC I:0/3 XIO T4:2/DN TON T4:1 0.01 50 0', 'XIC T4:1/DN TON T4:2 0.01 50 0', 'XIC T4:1/DN OTE O:0/2'],
    [{ in: on(3), t: 3, toggles: { bit: 2, min: 4 }, say: 'AUTO: H3 blinks' }, st(R, 0.5, { 2: 0 }, 'MAN: H3 off')]);
  lad('medium', 'Timers', 'practice', 'Flasher with one timer',
    `<p>Same blink as before but with one timer: T4:0 runs 0 → 1 s and restarts itself; H3 is on in the first half.</p>${P4}`,
    'TON with XIO on its own DN restarts; compare its ACC with LES.',
    ['XIC I:0/3 XIO T4:0/DN TON T4:0 0.01 100 0', 'XIC I:0/3 LES T4:0.ACC 50 OTE O:0/2'],
    [{ in: on(3), t: 3, toggles: { bit: 2, min: 4 }, say: 'AUTO: H3 blinks' }, st(R, 0.5, { 2: 0 }, 'MAN: H3 off')]);
  lad('medium', 'Timers', 'practice', 'Delayed start with warning',
    `<p>START: amber H3 (warning) lights at once; after 3 s green H1 (motor) starts and H3 goes out. STOP stops everything.</p>${P4}`,
    'Seal a run request B3:0/0; time it with TON; H3 while requested and not done.',
    ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0', 'XIC B3:0/0 TON T4:0 1.0 3 0', 'XIC B3:0/0 XIO T4:0/DN OTE O:0/2', 'XIC T4:0/DN OTE O:0/0'],
    [press(0, 0.1, { 2: 1, 0: 0 }, 'START: warning on'), st(R, 2, { 2: 1, 0: 0 }, '2 s: still warning'), st(R, 1.5, { 2: 0, 0: 1 }, 'After 3 s: motor on'), st({}, 0.1, { 0: 0, 2: 0 }, 'STOP: all off')]);
  lad('medium', 'Timers', 'practice', 'Run for a set time',
    `<p>START runs green H1 for 4 s; then it stops by itself. STOP stops it early.</p>${P4}`,
    'Seal-in with the timer’s DN in series (XIO) breaks the seal when time is up.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO T4:0/DN OTE O:0/0', 'XIC O:0/0 TON T4:0 1.0 4 0'],
    [press(0, 0.1, { 0: 1 }, 'START: on'), st(R, 3, { 0: 1 }, '3 s: still on'), st(R, 1.5, { 0: 0 }, 'After 4 s: off'), press(0, 0.1, { 0: 1 }, 'START again: on'), st({}, 0.1, { 0: 0 }, 'STOP: off')]);
  lad('medium', 'Timers', 'practice', 'Staircase light',
    `<p>Each press of S3 lights H1 for 5 s. A new press starts the 5 s again.</p>${P4}`,
    'TOF on the button: DN stays on for the preset after release, and restarts on every press.',
    ['XIC I:0/2 TOF T4:0 1.0 5 0', 'XIC T4:0/DN OTE O:0/0'],
    [press(2, 0.1, { 0: 1 }, 'Press: on'), st(R, 3.5, { 0: 1 }, '3.5 s: on'), press(2, 0.1, { 0: 1 }, 'Press again'), st(R, 3.5, { 0: 1 }, '3.5 s later: still on (restarted)'), st(R, 2, { 0: 0 }, 'After 5 s: off')]);
  lad('medium', 'Timers', 'practice', 'Retentive run timer',
    `<p>Count how long S4 is in AUTO in total (RTO). After 3 s altogether, blue H4 lights. STOP resets.</p>${P4}`,
    'RTO keeps its time when the rung goes false; RES clears it.',
    ['XIC I:0/3 RTO T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/3', 'XIO I:0/1 RES T4:0'],
    [st(on(3), 2, { 3: 0 }, 'AUTO 2 s: off'), st(R, 1, { 3: 0 }, 'MAN 1 s: off, time kept'), st(on(3), 1.5, { 3: 1 }, 'AUTO again: on after 3 s in total'), st({}, 0.1, { 3: 0 }, 'STOP: reset, off')]);
  lad('medium', 'Counters', 'practice', 'Up / down counter',
    `<p>S1 counts up, S3 counts down (same counter C5:0). Blue H4 lights while the count is 3 or more.</p>${P4}`,
    'CTU and CTD on the same counter; GEQ C5:0.ACC 3.',
    ['XIC I:0/0 CTU C5:0 99 0', 'XIC I:0/2 CTD C5:0 99 0', 'GEQ C5:0.ACC 3 OTE O:0/3'],
    [press(0, 0.05), st(R, 0.05), press(0, 0.05), st(R, 0.05), press(0, 0.05), st(R, 0.05, { 3: 1 }, 'Up ×3: on'), press(2, 0.05), st(R, 0.05, { 3: 0 }, 'Down ×1: off'), press(0, 0.05), st(R, 0.05, { 3: 1 }, 'Up again: on')]);
  lad('medium', 'Compare & math', 'practice', 'Add on every press',
    `<p>Every press of S3 adds 5 to <code>N7:0</code>. Amber H3 lights from 15. STOP clears <code>N7:0</code>.</p>${P4}`,
    'ONS so a press adds only once; ADD N7:0 5 N7:0; GEQ N7:0 15; CLR on STOP.',
    ['XIC I:0/2 ONS B3:1/0 ADD N7:0 5 N7:0', 'GEQ N7:0 15 OTE O:0/2', 'XIO I:0/1 CLR N7:0'],
    [press(2, 0.2), st(R, 0.1, { 2: 0 }, '5: off'), press(2, 0.2), st(R, 0.1, { 2: 0 }, '10: off'), press(2, 0.2), st(R, 0.1, { 2: 1 }, '15: on'), st({}, 0.1, { 2: 0 }, 'STOP: cleared, off')]);
  lad('medium', 'Compare & math', 'practice', 'Window with LIM',
    `<p>Count S3 presses. Amber H3 lights while the count is between 2 and 4.</p>${P4}`,
    'LIM 2 C5:0.ACC 4.',
    ['XIC I:0/2 CTU C5:0 99 0', 'LIM 2 C5:0.ACC 4 OTE O:0/2', 'XIO I:0/1 RES C5:0'],
    [press(2, 0.05), st(R, 0.05, { 2: 0 }, '1: off'), press(2, 0.05), st(R, 0.05, { 2: 1 }, '2: on'), press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05, { 2: 1 }, '4: on'), press(2, 0.05), st(R, 0.05, { 2: 0 }, '5: off')]);
  lad('medium', 'Compare & math', 'practice', 'Exactly three',
    `<p>Count S3 presses; red H2 lights only while the count is exactly 3.</p>${P4}`,
    'EQU C5:0.ACC 3.',
    ['XIC I:0/2 CTU C5:0 99 0', 'EQU C5:0.ACC 3 OTE O:0/1', 'XIO I:0/1 RES C5:0'],
    [press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05, { 1: 0 }, '2: off'), press(2, 0.05), st(R, 0.05, { 1: 1 }, '3: on'), press(2, 0.05), st(R, 0.05, { 1: 0 }, '4: off')]);
  lad('medium', 'Sequences', 'practice16', 'Traffic light',
    `<p>While S7 is in AUTO: green H1 3 s, amber H3 1 s, red H2 3 s, then green again.</p>${P16}`,
    'Three timers in a chain; the last one restarts the first.',
    ['XIC I:0/6 XIO T4:2/DN TON T4:0 1.0 3 0', 'XIC T4:0/DN TON T4:1 1.0 1 0', 'XIC T4:1/DN TON T4:2 1.0 3 0', 'XIC I:0/6 XIO T4:0/DN OTE O:0/0', 'XIC T4:0/DN XIO T4:1/DN OTE O:0/2', 'XIC T4:1/DN OTE O:0/1'],
    [st(on(6), 2, { 0: 1, 2: 0, 1: 0 }, '2 s: green'), st(on(6), 1.5, { 0: 0, 2: 1, 1: 0 }, '3.5 s: amber'), st(on(6), 1, { 2: 0, 1: 1 }, '4.5 s: red'), st(on(6), 3.3, { 0: 1, 1: 0 }, '7.8 s: green again'), st(R, 0.2, { 0: 0, 1: 0, 2: 0 }, 'MAN: all off')]);
  lad('medium', 'Sequences', 'practice16', 'Lamp chaser',
    `<p>While S7 is in AUTO, H1 → H2 → H3 → H4 light one after the other, 1 s each, and repeat.</p>${P16}`,
    'Four 1 s timers in a chain; each lamp between two DN bits.',
    ['XIC I:0/6 XIO T4:3/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN TON T4:1 1.0 1 0', 'XIC T4:1/DN TON T4:2 1.0 1 0', 'XIC T4:2/DN TON T4:3 1.0 1 0',
      'XIC I:0/6 XIO T4:0/DN OTE O:0/0', 'XIC T4:0/DN XIO T4:1/DN OTE O:0/1', 'XIC T4:1/DN XIO T4:2/DN OTE O:0/2', 'XIC T4:2/DN OTE O:0/3'],
    [st(on(6), 0.5, { 0: 1, 1: 0 }, '0.5 s: H1'), st(on(6), 1, { 0: 0, 1: 1 }, '1.5 s: H2'), st(on(6), 1, { 1: 0, 2: 1 }, '2.5 s: H3'), st(on(6), 1, { 2: 0, 3: 1 }, '3.5 s: H4'), st(on(6), 1.1, { 0: 1, 3: 0 }, '4.6 s: H1 again')]);
  lad('medium', 'Sequences', 'practice16', 'Sequential start',
    `<p>START: H1 on at once, H2 after 2 s, H3 after 4 s. STOP: all off.</p>${P16}`,
    'Seal a run bit; two timers (2 s and 4 s) on it.',
    ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0', 'XIC B3:0/0 TON T4:0 1.0 2 0', 'XIC B3:0/0 TON T4:1 1.0 4 0', 'XIC B3:0/0 OTE O:0/0', 'XIC T4:0/DN OTE O:0/1', 'XIC T4:1/DN OTE O:0/2'],
    [press(0, 0.1, { 0: 1, 1: 0 }, 'START: H1'), st(R, 2.4, { 1: 1, 2: 0 }, '2.5 s: H2'), st(R, 2, { 2: 1 }, '4.5 s: H3'), st({}, 0.1, { 0: 0, 1: 0, 2: 0 }, 'STOP: all off')]);
  lad('medium', 'Motor control', 'practice16', 'Forward / reverse interlock',
    `<p>S1 FORWARD starts H1, S3 REVERSE starts H2, S2 STOP stops both. Each direction must block the other.</p>${P16}`,
    'Two seal-ins; XIO on the other direction’s output in each.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO O:0/1 OTE O:0/0', 'BST XIC I:0/2 NXB XIC O:0/1 BND XIC I:0/1 XIO O:0/0 OTE O:0/1'],
    [press(0, 0.1, { 0: 1 }, 'FORWARD: H1'), st(R, 0.1), press(2, 0.1, { 0: 1, 1: 0 }, 'REVERSE while forward: blocked'), st({}, 0.1, { 0: 0 }, 'STOP'), st(R, 0.1), press(2, 0.1, { 1: 1, 0: 0 }, 'REVERSE: H2')]);
  lad('medium', 'Motor control', 'practice16', 'Star-delta timing',
    `<p>START: main H1 and star H3 on; after 3 s star off and delta H2 on. STOP: all off.</p>${P16}`,
    'Main seal-in; TON 3 s on the main; star while not done, delta when done.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIC O:0/0 TON T4:0 1.0 3 0', 'XIC O:0/0 XIO T4:0/DN XIO O:0/1 OTE O:0/2', 'XIC T4:0/DN XIO O:0/2 OTE O:0/1'],
    [press(0, 0.1, { 0: 1, 2: 1, 1: 0 }, 'START: main + star'), st(R, 2, { 2: 1, 1: 0 }, '2 s: star'), st(R, 1.5, { 2: 0, 1: 1 }, '3.5 s: delta'), st({}, 0.1, { 0: 0, 1: 0, 2: 0 }, 'STOP: all off')]);
  lad('medium', 'Motor control', 'practice16', 'Three-station start / stop',
    `<p>H1 starts from S1, S3 or S4 and stops from S2 (N.C.) or S5 (N.O., pressed = stop).</p>${P16}`,
    'Starts in parallel, stops in series (XIC for N.C. S2, XIO for N.O. S5).',
    ['BST XIC I:0/0 NXB XIC I:0/2 NXB XIC I:0/3 NXB XIC O:0/0 BND XIC I:0/1 XIO I:0/4 OTE O:0/0'],
    [press(2, 0.1, { 0: 1 }, 'Start from S3'), st(R, 0.1, { 0: 1 }, 'Runs'), press(4, 0.1, { 0: 0 }, 'Stop from S5'), press(3, 0.1, { 0: 1 }, 'Start from S4'), st({}, 0.1, { 0: 0 }, 'Stop from S2')]);
  lad('medium', 'Motor control', 'practice16', 'Overload trip lamp',
    `<p>Motor H1 start/stop (S1/S2). S3 is the overload contact, wired N.C. (ON = healthy). A trip stops H1 and lights amber H3.</p>${P16}`,
    'The overload contact in series like STOP; a second rung with XIO on it.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0', 'XIO I:0/2 OTE O:0/2'],
    [st(on(0, 2), 0.1, { 0: 1, 2: 0 }, 'START: runs'), st(on(2), 0.2, { 0: 1 }, 'Running'), st(R, 0.1, { 0: 0, 2: 1 }, 'Overload trips: stops, amber on'), st(on(2, 0), 0.1, { 0: 1, 2: 0 }, 'Reset and START: runs')]);
  lad('medium', 'Motor control', 'practice16', 'Fan with run-on',
    `<p>Motor H1 start/stop (S1/S2). Cooling fan H2 runs with the motor and 3 s after it stops.</p>${P16}`,
    'TOF on the motor output.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIC O:0/0 TOF T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/1'],
    [press(0, 0.1, { 0: 1, 1: 1 }, 'START: motor + fan'), st({}, 0.1, { 0: 0, 1: 1 }, 'STOP: fan still on'), st(R, 2, { 1: 1 }, '2 s: fan on'), st(R, 1.5, { 1: 0 }, 'After 3 s: fan off')]);
  lad('medium', 'Process', 'practice16', 'Pump alternation',
    `<p>Each time demand S7 goes to AUTO, the other pump runs: pump 1 (H1), then pump 2 (H2), then pump 1…</p>${P16}`,
    'A one-shot on the demand toggles a memory bit; the bit picks the pump.',
    ['XIC I:0/6 ONS B3:1/0 OTE B3:0/1', 'BST XIC B3:0/1 XIO B3:0/0 NXB XIO B3:0/1 XIC B3:0/0 BND OTE B3:0/0', 'XIC I:0/6 XIC B3:0/0 OTE O:0/0', 'XIC I:0/6 XIO B3:0/0 OTE O:0/1'],
    [st(on(6), 0.2, { 0: 1, 1: 0 }, 'Demand 1: pump 1'), st(R, 0.2, { 0: 0, 1: 0 }, 'No demand'), st(on(6), 0.2, { 0: 0, 1: 1 }, 'Demand 2: pump 2'), st(R, 0.2), st(on(6), 0.2, { 0: 1 }, 'Demand 3: pump 1')]);
  lad('medium', 'Process', 'practice16', 'Tank filling',
    `<p>S3 is the low level switch (ON = below low), S4 the high level switch (ON = full). The fill valve H1 opens at low and closes at full.</p>${P16}`,
    'OTL on low, OTU on high.',
    ['XIC I:0/2 OTL O:0/0', 'XIC I:0/3 OTU O:0/0'],
    [st(on(2), 0.1, { 0: 1 }, 'Low: valve opens'), st(R, 0.3, { 0: 1 }, 'Between: stays open'), st(on(3), 0.1, { 0: 0 }, 'Full: closes'), st(R, 0.3, { 0: 0 }, 'Level falls: stays closed until low')]);
  lad('medium', 'Counters', 'practice16', 'Parking garage',
    `<p>S3 counts a car in, S4 a car out (C5:0). With 3 cars inside, red H2 FULL lights; otherwise green H1 FREE.</p>${P16}`,
    'CTU and CTD on C5:0, preset 3; DN = full.',
    ['XIC I:0/2 CTU C5:0 3 0', 'XIC I:0/3 CTD C5:0 3 0', 'XIC C5:0/DN OTE O:0/1', 'XIO C5:0/DN OTE O:0/0'],
    [st(R, 0.1, { 0: 1, 1: 0 }, 'Empty: FREE'), press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05, { 1: 1, 0: 0 }, '3 in: FULL'), press(3, 0.05), st(R, 0.05, { 1: 0, 0: 1 }, 'One out: FREE')]);
  lad('medium', 'Compare & math', 'practice16', 'Speed ranges',
    `<p>S3, S4, S5 set a speed in <code>N7:0</code> (10, 50, 90). Green H1 below 30, amber H3 from 30 to 70, red H2 above 70.</p>${P16}`,
    'Three MOV; LES, LIM, GRT.',
    ['XIC I:0/2 MOV 10 N7:0', 'XIC I:0/3 MOV 50 N7:0', 'XIC I:0/4 MOV 90 N7:0', 'LES N7:0 30 OTE O:0/0', 'LIM 30 N7:0 70 OTE O:0/2', 'GRT N7:0 70 OTE O:0/1'],
    [press(2, 0.1, { 0: 1, 2: 0, 1: 0 }, '10: green'), press(3, 0.1, { 0: 0, 2: 1, 1: 0 }, '50: amber'), press(4, 0.1, { 2: 0, 1: 1 }, '90: red')]);
  lad('medium', 'Compare & math', 'practice16', 'Multiply a count',
    `<p>Each S3 press adds 1 to <code>N7:0</code>; <code>N7:1</code> = <code>N7:0</code> × 4. Red H2 lights when <code>N7:1</code> reaches 12.</p>${P16}`,
    'ONS + ADD; MUL N7:0 4 N7:1; GEQ N7:1 12.',
    ['XIC I:0/2 ONS B3:1/0 ADD N7:0 1 N7:0', 'MUL N7:0 4 N7:1', 'GEQ N7:1 12 OTE O:0/1'],
    [press(2, 0.2), st(R, 0.1), press(2, 0.2), st(R, 0.1, { 1: 0 }, '8: off'), press(2, 0.2), st(R, 0.1, { 1: 1 }, '12: on')]);
  lad('medium', 'Counters', 'practice16', 'Batches',
    `<p>Count S3 presses in batches of 4 (C5:0). At each full batch, C5:0 resets itself and C5:1 counts the batch. Blue H4 lights after 2 batches.</p>${P16}`,
    'One-shot on the button (a reset while it is held must not count again); CTU C5:1 on C5:0/DN, then RES C5:0 on C5:0/DN.',
    ['XIC I:0/2 ONS B3:1/0 CTU C5:0 4 0', 'XIC C5:0/DN CTU C5:1 2 0', 'XIC C5:0/DN RES C5:0', 'XIC C5:1/DN OTE O:0/3'],
    [...Array.from({ length: 7 }, () => [press(2, 0.05), st(R, 0.05)]).flat(), st(R, 0.05, { 3: 0 }, '7 presses: 1 batch, off'), press(2, 0.05), st(R, 0.1, { 3: 1 }, '8 presses: 2 batches, on')]);
  lad('medium', 'Seal-in & latches', 'practice16', 'Emergency stop with reset',
    `<p>S5 is the emergency stop: pressing it latches a fault (red H2) and stops motor H1 (S1/S2). H1 can start again only after S6 RESET with S5 released.</p>${P16}`,
    'OTL a fault bit on S5, OTU it on S6 when S5 is released; the fault blocks the motor.',
    ['XIC I:0/4 OTL B3:0/0', 'XIC I:0/5 XIO I:0/4 OTU B3:0/0', 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO B3:0/0 OTE O:0/0', 'XIC B3:0/0 OTE O:0/1'],
    [press(0, 0.1, { 0: 1 }, 'START: runs'), press(4, 0.1, { 0: 0, 1: 1 }, 'E-STOP: stops, fault'), press(0, 0.1, { 0: 0 }, 'START: blocked'), press(5, 0.1, { 1: 0 }, 'RESET: fault cleared'), press(0, 0.1, { 0: 1 }, 'START: runs again')]);
  lad('medium', 'Timers', 'practice16', 'Two-hand start',
    `<p>H1 runs only while S3 and S4 are both held, and only if they were pressed within 0.5 s of each other.</p>${P16}`,
    'Time each button (0.5 s); start only while both timers are still running; seal with H1 while both are held.',
    ['XIC I:0/2 TON T4:0 0.01 50 0', 'XIC I:0/3 TON T4:1 0.01 50 0', 'XIC I:0/2 XIC I:0/3 BST XIO T4:0/DN XIO T4:1/DN NXB XIC O:0/0 BND OTE O:0/0'],
    [press(2, 0.2, { 0: 0 }, 'S3 only'), st(on(2, 3), 0.3, { 0: 1 }, 'S4 within 0.5 s: on'), st(on(2, 3), 1, { 0: 1 }, 'Held: on'), st(R, 0.2, { 0: 0 }, 'Released'), press(2, 1, { 0: 0 }, 'S3 held 1 s'), st(on(2, 3), 0.3, { 0: 0 }, 'S4 too late: off')]);
  lad('medium', 'Sequences', 'practice16', 'Car wash',
    `<p>START runs: soap H1 2 s, brush H2 3 s, rinse H3 2 s, then the done lamp H4 until STOP.</p>${P16}`,
    'A run bit, then three timers in a chain; each step lamp between two DN bits.',
    ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0', 'XIC B3:0/0 TON T4:0 1.0 2 0', 'XIC T4:0/DN TON T4:1 1.0 3 0', 'XIC T4:1/DN TON T4:2 1.0 2 0',
      'XIC B3:0/0 XIO T4:0/DN OTE O:0/0', 'XIC T4:0/DN XIO T4:1/DN OTE O:0/1', 'XIC T4:1/DN XIO T4:2/DN OTE O:0/2', 'XIC T4:2/DN OTE O:0/3'],
    [press(0, 0.1, { 0: 1 }, 'START: soap'), st(R, 2.4, { 0: 0, 1: 1 }, '2.5 s: brush'), st(R, 3, { 1: 0, 2: 1 }, '5.5 s: rinse'), st(R, 2, { 2: 0, 3: 1 }, '7.5 s: done'), st({}, 0.1, { 3: 0 }, 'STOP')]);
  lad('medium', 'Process', 'practice16', 'Alarm horn with silence',
    `<p>S3 held = a fault. The horn H5 sounds while the fault is on, until S4 SILENCE is pressed. A new fault sounds it again.</p>${P16}`,
    'Latch "silenced" on S4 while the fault is on; clear it when the fault goes.',
    ['XIC I:0/2 XIC I:0/3 OTL B3:0/0', 'XIO I:0/2 OTU B3:0/0', 'XIC I:0/2 XIO B3:0/0 OTE O:0/4'],
    [press(2, 0.2, { 4: 1 }, 'Fault: horn'), st(on(2, 3), 0.1, { 4: 0 }, 'SILENCE: off'), press(2, 0.3, { 4: 0 }, 'Fault still on: stays silent'), st(R, 0.2, { 4: 0 }, 'Fault gone'), press(2, 0.2, { 4: 1 }, 'New fault: horn again')]);
  lad('medium', 'Process', 'practice16', 'Conveyor with photo-eye count',
    `<p>Conveyor H1 runs in AUTO (S7). S3 is a photo-eye: after 5 boxes the conveyor stops and the batch lamp H4 lights. S4 RESET clears the batch.</p>${P16}`,
    'CTU on the eye; the conveyor needs AUTO and not DN; RES on S4.',
    ['XIC I:0/6 XIO C5:0/DN OTE O:0/0', 'XIC I:0/2 CTU C5:0 5 0', 'XIC C5:0/DN OTE O:0/3', 'XIC I:0/3 RES C5:0'],
    [st(on(6), 0.1, { 0: 1 }, 'AUTO: conveyor runs'), ...Array.from({ length: 5 }, () => [st(on(6, 2), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.1, { 0: 0, 3: 1 }, '5 boxes: stops, batch lamp'), st(on(6, 3), 0.1, { 0: 1, 3: 0 }, 'RESET: runs again')]);
  lad('medium', 'Timers', 'practice16', 'Watchdog',
    `<p>A pulse S3 must come at least every 3 s while S7 is in AUTO. If it does not, the alarm H2 lights (until the next pulse).</p>${P16}`,
    'A TON that the pulse resets: XIO on the pulse in the timer rung.',
    ['XIC I:0/6 XIO I:0/2 TON T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/1'],
    [st(on(6), 2, { 1: 0 }, '2 s: ok'), st(on(6, 2), 0.1), st(on(6), 2, { 1: 0 }, 'Pulse came: still ok'), st(on(6), 1.5, { 1: 1 }, 'No pulse for 3.5 s: alarm'), st(on(6, 2), 0.1, { 1: 0 }, 'Pulse: alarm clears')]);
  lad('medium', 'Process', 'practice16', 'Lift up and down',
    `<p>S3 UP runs H1 until the top limit S5; S4 DOWN runs H2 until the bottom limit S6. Never both. S2 STOP stops it.</p>${P16}`,
    'Two seal-ins with interlocks; each stops at its limit switch (XIO).',
    ['BST XIC I:0/2 NXB XIC O:0/0 BND XIC I:0/1 XIO I:0/4 XIO O:0/1 OTE O:0/0', 'BST XIC I:0/3 NXB XIC O:0/1 BND XIC I:0/1 XIO I:0/5 XIO O:0/0 OTE O:0/1'],
    [press(2, 0.1, { 0: 1 }, 'UP: runs up'), st(R, 0.2, { 0: 1 }, 'Going up'), press(4, 0.1, { 0: 0 }, 'Top limit: stops'), press(3, 0.1, { 1: 1 }, 'DOWN: runs down'), press(5, 0.1, { 1: 0 }, 'Bottom limit: stops')]);
  prj('medium', 'Electrical Diagram', 'blank', 'Hardwired start / stop',
    `<p>Draw a hardwired start/stop in the Electrical Diagram: +24 V → <b>S2</b> STOP (N.C.) → <b>S1</b> START (N.O.) with a <b>KM1</b> N.O. 13-14 in parallel (seal-in) → <b>KM1</b> coil → 0 V.</p>`,
    'Library → Switches (N.O., N.C.), Auxiliaries (KM N.O. 13-14), Coils (contactor coil). Wire the KM1 contact across S1.',
    async A => { const r = await A.sealTest('S1', 'S2', 'KM1'); return [{ say: 'START pulls KM1 in', ok: r.start }, { say: 'KM1 stays in after START is released (seal-in)', ok: r.hold }, { say: 'STOP drops KM1', ok: r.stop }]; },
    A => { A.draw([['pP', 'XP1', 200, 40], ['pbnc', 'S2', 200, 160], ['pbno', 'S1', 200, 280], ['kmno', 'KM1', 300, 280], ['kmcoil', 'KM1', 200, 400], ['pM', 'XP2', 200, 520]],
      [[0, 'J', 1, '11'], [1, '12', 2, '13'], [2, '13', 3, '13'], [2, '14', 3, '14'], [2, '14', 4, 'A1'], [4, 'A2', 5, 'J']]); });
  prj('medium', 'Electrical Diagram', 'blank', 'Run lamp on the contactor',
    `<p>Draw the start/stop of the previous exercise and add a run lamp <b>H1</b> lit by a second contact of KM1 (it becomes KM1 53-54).</p>`,
    'Draw a second KM N.O.: the app numbers it 53-54 on KM1’s auxiliary block.',
    async A => { const r = await A.sealTest('S1', 'S2', 'KM1', 'H1'); return [{ say: 'START pulls KM1 in and lights H1', ok: r.start && r.lamp }, { say: 'KM1 holds (seal-in)', ok: r.hold }, { say: 'STOP: KM1 drops and H1 goes out', ok: r.stop && r.lampOff }]; },
    A => { A.draw([['pP', 'XP1', 200, 40], ['pbnc', 'S2', 200, 160], ['pbno', 'S1', 200, 280], ['kmno', 'KM1', 300, 280], ['kmcoil', 'KM1', 200, 400], ['pM', 'XP2', 200, 520], ['pP', 'XP3', 420, 40], ['kxno1', 'KM1', 420, 200], ['lamp', 'H1', 420, 320], ['pM', 'XP4', 420, 440]],
      [[0, 'J', 1, '11'], [1, '12', 2, '13'], [2, '13', 3, '13'], [2, '14', 3, '14'], [2, '14', 4, 'A1'], [4, 'A2', 5, 'J'], [6, 'J', 7, '53'], [7, '54', 8, 'X1'], [8, 'X2', 9, 'J']]); });
  prj('medium', 'Wiring', () => unwired(), 'Wire an output lamp',
    `<p>The practice board’s blue lamp <b>H4</b> is not wired. In the <b>Wiring</b>, wire PLC output <b>O3</b> to H4 X1, and H4 X2 back to the 0 V (COM) of the PLC and to the other lamps’ return (H3 X2). The ladder already lights H4 from S3.</p>`,
    'Click PLC terminal 3 on the output row, then H4 X1. The lamps’ X2 are chained and the chain returns to 0 V through H4: wire H4 X2 to the PLC COM (0 V) and to H3 X2.',
    async A => { const r = await A.plcPressTest('S3', 'H4'); return [{ say: 'With the PLC in RUN, pressing S3 lights H4', ok: r.on }, { say: 'Releasing S3 turns H4 off', ok: r.off }]; },
    A => { A.wire('PLC', 'O3', 'H4', 'X1'); A.wire('H4', 'X2', 'PLC', 'C24'); A.wire('H4', 'X2', 'H3', 'X2'); });
  prj('medium', 'Wiring', () => withKm(), 'PLC output to a contactor',
    `<p>A contactor <b>KM1</b> (24 V DC coil) is in the Wiring, not wired. Wire PLC output <b>O1</b> to KM1 <b>A1</b>, and KM1 <b>A2</b> to 0 V. The ladder turns O:0/1 on while S1 is held.</p>`,
    'O1 is on the PLC’s output row (its common VAC0 is fed from +24 V). A2 goes to COM (0 V).',
    async A => { const r = await A.plcPressTest('S1', 'KM1'); return [{ say: 'PLC in RUN, S1 held: KM1 pulls in', ok: r.on }, { say: 'S1 released: KM1 drops out', ok: r.off }]; },
    A => { A.wire('PLC', 'O1', 'KM1', 'A1'); A.wire('KM1', 'A2', 'PLC', 'C24'); });
  prj('medium', 'HMI', 'practice', 'Start / stop from the HMI',
    `<p>Run H1 from the HMI: an HMI <b>START</b> button on <code>B3:0/0</code>, a <b>STOP</b> button on <code>B3:0/1</code> and a pilot light on <code>O:0/0</code>. Ladder: a seal-in on these bits.</p>${P4}`,
    'BST XIC B3:0/0 NXB XIC O:0/0 BND XIO B3:0/1 OTE O:0/0',
    async A => [{ say: 'HMI START on B3:0/0', ok: A.hmi('pb', 'B3:0/0') }, { say: 'HMI STOP on B3:0/1', ok: A.hmi('pb', 'B3:0/1') }, { say: 'Pilot light on O:0/0', ok: A.hmi('lamp', 'O:0/0') },
      ...A.grade([st(R, 0.1, { 0: 1 }, 'HMI START: H1 on', { 'B3:0/0': 1 }), st(R, 0.2, { 0: 1 }, 'Released: holds', { 'B3:0/0': 0 }), st(R, 0.1, { 0: 0 }, 'HMI STOP: off', { 'B3:0/1': 1 }), st(R, 0.1, { 0: 0 }, 'Released: stays off', { 'B3:0/1': 0 })])],
    A => { A.addHmi('pb', { label: 'START', tag: 'B3:0/0' }); A.addHmi('pb', { label: 'STOP', tag: 'B3:0/1', color: '#c62828' }); A.addHmi('lamp', { label: 'RUN', tag: 'O:0/0' }); A.setLadder(['BST XIC B3:0/0 NXB XIC O:0/0 BND XIO B3:0/1 OTE O:0/0']); });
  prj('medium', 'HMI', 'practice', 'Count on the HMI',
    `<p>Count S3 presses with C5:0 and show the count on the HMI with a <b>Numeric Display</b> on <code>C5:0.ACC</code>. Add a <b>Numeric Entry</b> on <code>C5:0.PRE</code>; blue H4 lights at the preset (start with 3).</p>${P4}`,
    'XIC I:0/2 CTU C5:0 3 0 ; XIC C5:0/DN OTE O:0/3 ; XIO I:0/1 RES C5:0',
    async A => [{ say: 'Numeric display on C5:0.ACC', ok: A.hmi('num', 'C5:0.ACC') }, { say: 'Numeric entry on C5:0.PRE', ok: A.hmi('entry', 'C5:0.PRE') },
      ...A.grade([press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05), press(2, 0.05), st(R, 0.05, { 3: 1 }, 'Three presses: H4 on')])],
    A => { A.addHmi('num', { label: 'COUNT', tag: 'C5:0.ACC' }); A.addHmi('entry', { label: 'PRESET', tag: 'C5:0.PRE' }); A.setLadder(['XIC I:0/2 CTU C5:0 3 0', 'XIC C5:0/DN OTE O:0/3', 'XIO I:0/1 RES C5:0']); });

  lad('medium', 'Logic', 'practice16', 'Two out of three',
    `<p>H1 lights when at least two of S3, S4 and S5 are held (a 2-out-of-3 vote).</p>${P16}`,
    'Three branches: S3·S4, S3·S5, S4·S5.',
    ['BST XIC I:0/2 XIC I:0/3 NXB XIC I:0/2 XIC I:0/4 NXB XIC I:0/3 XIC I:0/4 BND OTE O:0/0'],
    [press(2, 0.1, { 0: 0 }, 'One: off'), st(on(2, 4), 0.1, { 0: 1 }, 'S3 + S5: on'), st(on(3, 4), 0.1, { 0: 1 }, 'S4 + S5: on'), st(on(2, 3, 4), 0.1, { 0: 1 }, 'All three: on'), press(3, 0.1, { 0: 0 }, 'One: off')]);

  /* ================= HARD (35) ================= */
  lad('hard', 'Process', 'practice16', 'High alarm with hysteresis',
    `<p>S3, S4, S5 set a level in <code>N7:0</code> (95, 85, 10). The high alarm H2 comes on at 90 or more and goes off only below 80. The low alarm H3 is on below 20.</p>${P16}`,
    'OTL at GEQ 90, OTU at LES 80; LES 20 for the low alarm.',
    ['XIC I:0/2 MOV 95 N7:0', 'XIC I:0/3 MOV 85 N7:0', 'XIC I:0/4 MOV 10 N7:0', 'GEQ N7:0 90 OTL O:0/1', 'LES N7:0 80 OTU O:0/1', 'LES N7:0 20 OTE O:0/2'],
    [press(2, 0.1, { 1: 1 }, '95: high alarm'), press(3, 0.1, { 1: 1 }, '85: still on (hysteresis)'), press(4, 0.1, { 1: 0, 2: 1 }, '10: high off, low on')]);
  lad('hard', 'Timers', 'practice16', 'Debounced input',
    `<p>S3 is a bouncing contact. H1 follows it only after it has been ON for 0.3 s, and goes off only after it has been OFF for 0.3 s.</p>${P16}`,
    'Two TON (base 0.01, preset 30): one on ON, one on OFF; OTL / OTU from their DN bits.',
    ['XIC I:0/2 TON T4:0 0.01 30 0', 'XIO I:0/2 TON T4:1 0.01 30 0', 'XIC T4:0/DN OTL O:0/0', 'XIC T4:1/DN OTU O:0/0'],
    [press(2, 0.1, { 0: 0 }, 'Short ON (0.1 s): ignored'), st(R, 0.5), press(2, 0.5, { 0: 1 }, 'ON 0.5 s: on'), st(R, 0.1, { 0: 1 }, 'Short OFF: still on'), press(2, 0.2), st(R, 0.5, { 0: 0 }, 'OFF 0.5 s: off')]);
  lad('hard', 'Motor control', 'practice16', 'Conveyors: start downstream first, stop upstream first',
    `<p>Three conveyors in a line. START: H3 (last) at once, H2 after 1 s, H1 after 2 s. STOP: H1 at once, H2 1 s later, H3 2 s later (so the belts empty).</p>${P16}`,
    'TON for the start delays, TOF (on the run bit) for the stop delays.',
    ['BST XIC I:0/0 NXB XIC B3:0/0 BND XIC I:0/1 OTE B3:0/0', 'XIC B3:0/0 TON T4:0 1.0 1 0', 'XIC B3:0/0 TON T4:1 1.0 2 0', 'XIC B3:0/0 TOF T4:2 1.0 1 0', 'XIC B3:0/0 TOF T4:3 1.0 2 0',
      'XIC T4:1/DN OTE O:0/0', 'BST XIC T4:0/DN NXB XIO B3:0/0 XIC T4:2/DN BND OTE O:0/1', 'XIC T4:3/DN OTE O:0/2'],
    [press(0, 0.1, { 2: 1, 1: 0, 0: 0 }, 'START: H3'), st(R, 1.2, { 1: 1, 0: 0 }, '1.3 s: H2'), st(R, 1, { 0: 1 }, '2.3 s: H1'), st({}, 0.1, { 0: 0, 1: 1, 2: 1 }, 'STOP: H1 off'), st(R, 1.2, { 1: 0, 2: 1 }, '1.3 s: H2 off'), st(R, 1, { 2: 0 }, '2.3 s: H3 off')]);
  lad('hard', 'Compare & math', 'practice16', 'Check weigher',
    `<p>S3, S4, S5 put a weight in <code>N7:0</code> (500, 520, 450). Green H1 = good (490 to 510), red H2 = reject. Each press of S6 counts the item: good in C5:0, reject in C5:1. H8 lights after 2 rejects.</p>${P16}`,
    'LIM 490 N7:0 510; one-shot on S6 with LIM (good) or a branch of LES/GRT (reject).',
    ['XIC I:0/2 MOV 500 N7:0', 'XIC I:0/3 MOV 520 N7:0', 'XIC I:0/4 MOV 450 N7:0', 'LIM 490 N7:0 510 OTE O:0/0', 'XIO O:0/0 OTE O:0/1',
      'XIC I:0/5 ONS B3:1/0 OTE B3:0/0', 'XIC B3:0/0 XIC O:0/0 CTU C5:0 99 0', 'XIC B3:0/0 XIC O:0/1 CTU C5:1 2 0', 'XIC C5:1/DN OTE O:0/7'],
    [press(2, 0.1, { 0: 1, 1: 0 }, '500: good'), press(5, 0.1), st(R, 0.1), press(3, 0.1, { 1: 1 }, '520: reject'), press(5, 0.1), st(R, 0.1, { 7: 0 }, 'One reject'), press(4, 0.1, { 1: 1 }, '450: reject'), press(5, 0.1), st(R, 0.1, { 7: 1 }, 'Two rejects: H8')]);
  lad('hard', 'Process', 'practice16', 'Heater with deadband',
    `<p>Temperature in <code>N7:0</code>: S3 adds 5, S4 takes 5 off (each press). In AUTO (S7) heater H1 switches on below 60 and off above 70; H5 = too hot (above 80).</p>${P16}`,
    'One-shots for the buttons; OTL below 60, OTU above 70 or in MAN.',
    ['XIC I:0/2 ONS B3:1/0 ADD N7:0 5 N7:0', 'XIC I:0/3 ONS B3:1/1 SUB N7:0 5 N7:0', 'XIC I:0/6 LES N7:0 60 OTL O:0/0', 'BST GRT N7:0 70 NXB XIO I:0/6 BND OTU O:0/0', 'GRT N7:0 80 OTE O:0/4'],
    [st(on(6), 0.1, { 0: 1 }, 'Cold: heater on'), ...Array.from({ length: 13 }, () => [st(on(6, 2), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.1, { 0: 1 }, '65: still heating'), ...Array.from({ length: 2 }, () => [st(on(6, 2), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.1, { 0: 0 }, '75: heater off'),
      ...Array.from({ length: 2 }, () => [st(on(6, 3), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.1, { 0: 0 }, '65: stays off (deadband)')]);
  lad('hard', 'Timers', 'practice16', 'Pulse counter',
    `<p>While S7 is in AUTO, make a short pulse on H5 every 0.5 s and count the pulses (C5:0). After 6 pulses H8 lights. MAN resets the count.</p>${P16}`,
    'A self-restarting TON (base 0.01, preset 50); its DN is the one-scan pulse; CTU on it.',
    ['XIC I:0/6 XIO T4:0/DN TON T4:0 0.01 50 0', 'XIC T4:0/DN OTE O:0/4', 'XIC T4:0/DN CTU C5:0 6 0', 'XIO I:0/6 RES C5:0', 'XIC C5:0/DN OTE O:0/7'],
    [st(on(6), 2.7, { 7: 0 }, '2.7 s: 5 pulses'), st(on(6), 0.5, { 7: 1 }, '3.2 s: 6 pulses, H8'), st(R, 0.1, { 7: 0 }, 'MAN: reset')]);
  prj('hard', 'HMI', 'practice', 'Timer preset from the HMI',
    `<p>Let the operator set the delay: an HMI <b>Numeric Entry</b> on <code>T4:0.PRE</code>. In the ladder, S4 AUTO starts T4:0 (base 1.0) and H3 lights when it is done. The check sets the preset to 2 s.</p>${P4}`,
    'XIC I:0/3 TON T4:0 1.0 5 0 ; XIC T4:0/DN OTE O:0/2 — the HMI entry overwrites the preset.',
    async A => [{ say: 'Numeric entry on T4:0.PRE', ok: A.hmi('entry', 'T4:0.PRE') },
      ...A.grade([st(R, 0.1, null, 'The HMI sets the preset to 2', { 'T4:0.PRE': 2 }), st(on(3), 1.5, { 2: 0 }, 'AUTO 1.5 s: off'), st(on(3), 1, { 2: 1 }, 'After 2 s: on')])],
    A => { A.addHmi('entry', { label: 'DELAY s', tag: 'T4:0.PRE', min: 0, max: 60 }); A.setLadder(['XIC I:0/3 TON T4:0 1.0 5 0', 'XIC T4:0/DN OTE O:0/2']); });
  prj('hard', 'Integration', 'practice16', 'PLC output in the drawing',
    `<p>In the <b>Electrical Diagram</b>, draw PLC relay output <b>O0</b> (tag PLC) driving a new lamp <b>H9</b> to 0 V. In the ladder, S3 turns <code>O:0/0</code> on. RUN and press S3: H9 lights.</p>${P16}`,
    'Library → PLC → relay output (pick O0), then Loads → Lamp, Point 0 V. Its common VAC0 is already fed in the Wiring.',
    async A => { const r = await A.plcPressTest('S3', 'H9'); return [{ say: 'H9 is in the drawing', ok: A.has('H9') }, { say: 'PLC in RUN, S3: H9 lights', ok: r.on }, { say: 'S3 released: H9 off', ok: r.off }]; },
    A => { A.draw([['plcq0', 'PLC', 200, 160], ['lamp', 'H9', 200, 280], ['pM', 'XP9', 200, 400]], [[0, 'O0', 1, 'X1'], [1, 'X2', 2, 'J']]); A.setLadder(['XIC I:0/2 OTE O:0/0']); });
  lad('hard', 'Sequences', 'practice16', 'Mixing tank',
    `<p>START (S1): fill valve H1 until the high level S4; then mixer H2 for 3 s; then drain H3 until the low level S3 goes OFF (empty); then the cycle ends (H4 DONE until STOP). STOP aborts.</p>${P16}`,
    'Use step bits B3:0/1…/4 latched in turn (OTL/OTU), with the mixer timer between steps 2 and 3.',
    ['XIC I:0/0 XIC I:0/1 XIO B3:0/2 XIO B3:0/3 XIO B3:0/4 OTL B3:0/1', 'XIC B3:0/1 XIC I:0/3 BST OTU B3:0/1 NXB OTL B3:0/2 BND', 'XIC B3:0/2 TON T4:0 1.0 3 0', 'XIC T4:0/DN BST OTU B3:0/2 NXB OTL B3:0/3 BND',
      'XIC B3:0/3 XIO I:0/2 BST OTU B3:0/3 NXB OTL B3:0/4 BND', 'XIO I:0/1 BST OTU B3:0/1 NXB OTU B3:0/2 NXB OTU B3:0/3 NXB OTU B3:0/4 BND', 'XIC B3:0/1 OTE O:0/0', 'XIC B3:0/2 OTE O:0/1', 'XIC B3:0/3 OTE O:0/2', 'XIC B3:0/4 OTE O:0/3'],
    [st(on(0, 2), 0.1, { 0: 1 }, 'START: filling'), st(on(2), 0.5, { 0: 1 }, 'Filling'), st(on(2, 3), 0.1, { 0: 0, 1: 1 }, 'High level: mixing'), st(on(2, 3), 2, { 1: 1 }, 'Mixing 2 s'), st(on(2), 1.5, { 1: 0, 2: 1 }, 'After 3 s: draining'), st(R, 0.1, { 2: 0, 3: 1 }, 'Empty: done'), st({}, 0.1, { 3: 0 }, 'STOP')]);
  lad('hard', 'Sequences', 'practice16', 'Pedestrian crossing',
    `<p>Cars green H1 normally. A walk request S3 (remembered): after 2 s cars amber H3 for 1 s, then cars red H2 and walk green H6 for 4 s, then back to cars green.</p>${P16}`,
    'Latch the request; three timers in a chain on it; the last one unlatches the request.',
    ['XIC I:0/2 OTL B3:0/0', 'XIC B3:0/0 TON T4:0 1.0 2 0', 'XIC T4:0/DN TON T4:1 1.0 1 0', 'XIC T4:1/DN TON T4:2 1.0 4 0', 'XIC T4:2/DN OTU B3:0/0',
      'XIO T4:0/DN OTE O:0/0', 'XIC T4:0/DN XIO T4:1/DN OTE O:0/2', 'XIC T4:1/DN BST OTE O:0/1 NXB OTE O:0/5 BND'],
    [st(R, 0.1, { 0: 1, 5: 0 }, 'Cars green'), press(2, 0.1, { 0: 1 }, 'Walk request'), st(R, 2.2, { 0: 0, 2: 1 }, '2.3 s: cars amber'), st(R, 1, { 2: 0, 1: 1, 5: 1 }, '3.3 s: cars red, walk'), st(R, 4.2, { 0: 1, 1: 0, 5: 0 }, 'After 4 s: cars green again')]);
  lad('hard', 'Sequences', 'practice16', 'Bottle filling line',
    `<p>Conveyor H1 runs in AUTO (S7) until a bottle is at the filler (S3 eye). Then fill valve H2 for 2 s, then the conveyor moves on (the eye must clear before the next bottle stops it). Count bottles in C5:0; H8 after 3 bottles.</p>${P16}`,
    'A fill timer started by the eye; the conveyor runs when there is no bottle or the bottle is full; one-shot count when filling ends.',
    ['XIC I:0/6 XIC I:0/2 XIO B3:0/0 TON T4:0 1.0 2 0', 'XIC T4:0/DN OTL B3:0/0', 'XIO I:0/2 OTU B3:0/0', 'XIC I:0/6 BST XIO I:0/2 NXB XIC B3:0/0 BND OTE O:0/0',
      'XIC I:0/6 XIC I:0/2 XIO B3:0/0 OTE O:0/1', 'XIC B3:0/0 ONS B3:1/0 CTU C5:0 3 0', 'XIC C5:0/DN OTE O:0/7'],
    [st(on(6), 0.2, { 0: 1, 1: 0 }, 'AUTO: conveyor runs'), ...[1, 2, 3].map(n => [st(on(6, 2), 1, { 0: 0, 1: 1 }, `Bottle ${n}: stops, fills`), st(on(6, 2), 1.3, { 0: 1, 1: 0 }, `Bottle ${n} full: moves on`), st(on(6), 0.2, { 0: 1 }, 'Eye clear')]).flat(), st(on(6), 0.1, { 7: 1 }, '3 bottles: H8 on')]);
  lad('hard', 'Motor control', 'practice16', 'Reversing with a pause',
    `<p>Forward H1 (S1) and reverse H2 (S3) with interlock. Changing direction needs STOP first, and a new start is refused for 2 s after any stop (H5 WAIT lamp meanwhile).</p>${P16}`,
    'TOF on "running" (either direction) gives the 2 s block after a stop.',
    ['BST XIC O:0/0 NXB XIC O:0/1 BND TOF T4:0 1.0 2 0', 'XIC T4:0/DN XIO O:0/0 XIO O:0/1 OTE O:0/4',
      'BST XIC I:0/0 XIO T4:0/DN NXB XIC O:0/0 BND XIC I:0/1 XIO O:0/1 OTE O:0/0', 'BST XIC I:0/2 XIO T4:0/DN NXB XIC O:0/1 BND XIC I:0/1 XIO O:0/0 OTE O:0/1'],
    [press(0, 0.1, { 0: 1 }, 'FORWARD'), st(R, 0.2), st({}, 0.1, { 0: 0, 4: 1 }, 'STOP: wait lamp'), press(2, 0.5, { 1: 0 }, 'REVERSE at once: refused'), st(R, 2, { 4: 0 }, 'After 2 s: wait over'), press(2, 0.1, { 1: 1 }, 'REVERSE: runs')]);
  lad('hard', 'Motor control', 'practice16', 'Star-delta with changeover pause',
    `<p>START: main H1 + star H3. After 3 s star off, then 0.3 s later delta H2 on (never star and delta together). STOP all off.</p>${P16}`,
    'Two timers: 3 s for star, then 0.3 s pause (base 0.01, preset 30) before delta.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIC O:0/0 TON T4:0 1.0 3 0', 'XIC T4:0/DN TON T4:1 0.01 30 0', 'XIC O:0/0 XIO T4:0/DN XIO O:0/1 OTE O:0/2', 'XIC T4:1/DN XIO O:0/2 OTE O:0/1'],
    [press(0, 0.1, { 0: 1, 2: 1 }, 'START: star'), st(R, 3.05, { 2: 0, 1: 0 }, 'Just after 3 s: pause (neither)'), st(R, 0.4, { 1: 1 }, 'Delta'), st({}, 0.1, { 0: 0, 1: 0 }, 'STOP')]);
  lad('hard', 'Process', 'practice16', 'Duty / standby pumps',
    `<p>Pump 1 H1 runs while demand S7 is in AUTO. If pump 1 trips (S3, N.C. healthy contact goes OFF), standby pump 2 H2 takes over at once and the alarm H7 lights.</p>${P16}`,
    'Pump 1 needs its healthy contact; pump 2 runs on demand when pump 1 is not healthy.',
    ['XIC I:0/6 XIC I:0/2 OTE O:0/0', 'XIC I:0/6 XIO I:0/2 OTE O:0/1', 'XIO I:0/2 OTE O:0/6'],
    [st(on(6, 2), 0.1, { 0: 1, 1: 0, 6: 0 }, 'Demand: pump 1'), st(on(6), 0.1, { 0: 0, 1: 1, 6: 1 }, 'Pump 1 trips: pump 2 + alarm'), st(on(6, 2), 0.1, { 0: 1, 1: 0, 6: 0 }, 'Pump 1 back')]);
  lad('hard', 'Process', 'practice16', 'Level from pulses',
    `<p>Simulate a tank: while fill valve H1 is on, <code>N7:0</code> rises by 10 every second; while drain S4 is held it falls by 10 a second. H1 opens below 20 and closes at 80 (in AUTO S7). H8 shows 80 or more.</p>${P16}`,
    'A 1 s pulse timer; ADD / SUB on the pulse; OTL below 20, OTU at 80 (GEQ).',
    ['XIO T4:0/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN XIC O:0/0 ADD N7:0 10 N7:0', 'XIC T4:0/DN XIC I:0/3 SUB N7:0 10 N7:0', 'XIC I:0/6 LES N7:0 20 OTL O:0/0', 'BST GEQ N7:0 80 NXB XIO I:0/6 BND OTU O:0/0', 'GEQ N7:0 80 OTE O:0/7'],
    [st(on(6), 0.3, { 0: 1 }, 'Low: valve opens'), st(on(6), 8.5, { 0: 0, 7: 1 }, 'After ~8 s: 80, valve closes'), st(on(6, 3), 7, { 0: 1, 7: 0 }, 'Draining below 20: opens again')]);
  lad('hard', 'Process', 'practice16', 'First-out alarm',
    `<p>Three faults S3, S4, S5 (held = fault). The first one to come lights its lamp steady (H2, H3, H4); later ones are recorded but their lamps stay off. S6 RESET clears when no fault is on.</p>${P16}`,
    'Latch "first" bits only while no first bit is set yet.',
    ['XIC I:0/2 XIO B3:0/1 XIO B3:0/2 OTL B3:0/0', 'XIC I:0/3 XIO B3:0/0 XIO B3:0/2 OTL B3:0/1', 'XIC I:0/4 XIO B3:0/0 XIO B3:0/1 OTL B3:0/2',
      'XIC I:0/5 XIO I:0/2 XIO I:0/3 XIO I:0/4 BST OTU B3:0/0 NXB OTU B3:0/1 NXB OTU B3:0/2 BND', 'XIC B3:0/0 OTE O:0/1', 'XIC B3:0/1 OTE O:0/2', 'XIC B3:0/2 OTE O:0/3'],
    [press(3, 0.1, { 2: 1 }, 'Fault 2 first: H3'), st(on(3, 2), 0.1, { 1: 0, 2: 1 }, 'Fault 1 later: H2 stays off'), st(R, 0.1, { 2: 1 }, 'Faults gone: still shown'), press(5, 0.1, { 2: 0 }, 'RESET: cleared'), press(4, 0.1, { 3: 1 }, 'Fault 3 first now: H4')]);
  lad('hard', 'Process', 'practice16', 'Alarm acknowledge',
    `<p>S3 held = fault. Alarm lamp H2 flashes while the fault is new; S4 ACK makes it steady; when the fault clears after ACK the lamp goes off. A fault that clears before ACK keeps flashing until ACK.</p>${P16}`,
    'Latch "alarm" on the fault, "acked" on ACK; flash = alarm and not acked; unlatch both when acked and no fault.',
    ['XIC I:0/2 OTL B3:0/0', 'XIC B3:0/0 XIC I:0/3 OTL B3:0/1', 'XIC B3:0/1 XIO I:0/2 BST OTU B3:0/0 NXB OTU B3:0/1 BND', 'XIO T4:1/DN TON T4:0 0.01 25 0', 'XIC T4:0/DN TON T4:1 0.01 25 0',
      'XIC B3:0/0 BST XIC B3:0/1 NXB XIO T4:0/DN BND OTE O:0/1'],
    [{ in: on(2), t: 2, toggles: { bit: 1, min: 4 }, say: 'Fault: H2 flashes' }, st(on(2, 3), 0.1, { 1: 1 }, 'ACK: steady'), st(on(2), 1, { 1: 1 }, 'Still steady'), st(R, 0.1, { 1: 0 }, 'Fault clears: off')]);
  lad('hard', 'Sequences', 'practice16', 'Sequencer output (SQO)',
    `<p>Each press of S3 steps a sequencer through 4 patterns on the lamps: H1, H1+H2, H3, all four. Use SQO with <code>#N7:20</code> (the app fills the table: write 1, 3, 4, 15 into N7:21–N7:24 on the first scan).</p>${P16}`,
    'S:1/15 (first scan) with MOV into N7:21…24; SQO #N7:20 mask 15 dest O:0, control R6:0, length 4, on a one-shot of S3.',
    ['XIC S:1/15 BST MOV 1 N7:21 NXB MOV 3 N7:22 NXB MOV 4 N7:23 NXB MOV 15 N7:24 BND', 'XIC I:0/2 ONS B3:1/0 SQO #N7:20 15 O:0 R6:0 4 0'],
    [press(2, 0.1, { 0: 1, 1: 0, 2: 0 }, 'Step 1: H1'), st(R, 0.1), press(2, 0.1, { 0: 1, 1: 1 }, 'Step 2: H1+H2'), st(R, 0.1), press(2, 0.1, { 0: 0, 2: 1 }, 'Step 3: H3'), st(R, 0.1), press(2, 0.1, { 0: 1, 1: 1, 2: 1, 3: 1 }, 'Step 4: all')]);
  lad('hard', 'Compare & math', 'practice16', 'Average of two values',
    `<p>S3 sets <code>N7:0</code> = 40, S4 sets <code>N7:1</code> = 80, S5 sets <code>N7:1</code> = 20. Always compute <code>N7:2</code> = (N7:0 + N7:1) / 2. H5 lights when the average is 50 or more.</p>${P16}`,
    'ADD into N7:3, DIV N7:3 2 N7:2, GEQ N7:2 50.',
    ['XIC I:0/2 MOV 40 N7:0', 'XIC I:0/3 MOV 80 N7:1', 'XIC I:0/4 MOV 20 N7:1', 'ADD N7:0 N7:1 N7:3', 'DIV N7:3 2 N7:2', 'GEQ N7:2 50 OTE O:0/4'],
    [press(2, 0.1), press(3, 0.1, { 4: 1 }, '(40+80)/2 = 60: on'), press(4, 0.1, { 4: 0 }, '(40+20)/2 = 30: off')]);
  lad('hard', 'Counters', 'practice16', 'Production shift totals',
    `<p>S3 counts parts (C5:0). Every 10 parts add 1 to <code>N7:0</code> (boxes) and restart C5:0. Blue H4 lights when there are 2 boxes; S6 RESET clears everything.</p>${P16}`,
    'One-shot on the part input; CTU C5:0 10; on DN: ADD N7:0 1 N7:0 (one-shot) and RES C5:0.',
    ['XIC I:0/2 ONS B3:1/1 CTU C5:0 10 0', 'XIC C5:0/DN ONS B3:1/0 ADD N7:0 1 N7:0', 'XIC C5:0/DN RES C5:0', 'GEQ N7:0 2 OTE O:0/3', 'XIC I:0/5 BST CLR N7:0 NXB RES C5:0 BND'],
    [...Array.from({ length: 19 }, () => [press(2, 0.03), st(R, 0.03)]).flat(), st(R, 0.05, { 3: 0 }, '19 parts: 1 box'), press(2, 0.03), st(R, 0.1, { 3: 1 }, '20 parts: 2 boxes'), press(5, 0.1, { 3: 0 }, 'RESET')]);
  lad('hard', 'Motor control', 'practice16', 'Two-speed motor',
    `<p>S1 LOW (H1) and S3 HIGH (H2), STOP S2. High is allowed only after running in low for 2 s; low and high are never on together; going from high to low needs STOP.</p>${P16}`,
    'TON on low; high needs its DN; interlocks both ways; low is blocked while high runs.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO O:0/1 XIO B3:0/0 OTE O:0/0', 'XIC O:0/0 TON T4:0 1.0 2 0', 'BST XIC I:0/2 XIC T4:0/DN NXB XIC O:0/1 BND XIC I:0/1 OTE O:0/1', 'XIC O:0/1 OTE B3:0/0'],
    [press(2, 0.1, { 1: 0 }, 'HIGH first: refused'), press(0, 0.1, { 0: 1 }, 'LOW'), press(2, 0.5, { 1: 0, 0: 1 }, 'HIGH at 0.6 s: refused'), st(R, 1.6), press(2, 0.1, { 1: 1, 0: 0 }, 'HIGH after 2 s: runs, low off'), press(0, 0.2, { 0: 0, 1: 1 }, 'LOW while high: refused'), st({}, 0.1, { 1: 0 }, 'STOP')]);
  lad('hard', 'Sequences', 'practice16', 'Garage door',
    `<p>S3 OPEN runs H1 (open) until the open limit S5; S4 CLOSE runs H2 until the closed limit S6. The photo-eye S7 (AUTO = beam blocked) stops closing and reopens the door. Amber H3 flashes while moving.</p>${P16}`,
    'Remember “beam blocked while closing” in a bit: closing stops at once, the next scan the bit starts opening.',
    ['XIC I:0/6 XIC O:0/1 OTL B3:0/0', 'BST XIC I:0/2 NXB XIC B3:0/0 NXB XIC O:0/0 BND XIO I:0/4 XIO O:0/1 OTE O:0/0', 'XIC O:0/0 OTU B3:0/0', 'BST XIC I:0/3 NXB XIC O:0/1 BND XIO I:0/5 XIO I:0/6 XIO O:0/0 OTE O:0/1',
      'XIO T4:1/DN TON T4:0 0.01 25 0', 'XIC T4:0/DN TON T4:1 0.01 25 0', 'BST XIC O:0/0 NXB XIC O:0/1 BND XIO T4:0/DN OTE O:0/2'],
    [press(3, 0.1, { 1: 1 }, 'CLOSE: closing'), st(R, 0.2, { 1: 1 }, 'Closing'), st(on(6), 0.1, { 1: 0, 0: 1 }, 'Beam blocked: reopens'), st(R, 0.3, { 0: 1 }, 'Opening'), press(4, 0.1, { 0: 0 }, 'Open limit: stops'), press(3, 0.1, { 1: 1 }, 'CLOSE'), { in: R, t: 2, toggles: { bit: 2, min: 3 }, say: 'Amber flashes while moving' }, press(5, 0.1, { 1: 0 }, 'Closed limit: stops')]);
  lad('hard', 'Sequences', 'practice16', 'Elevator, two floors',
    `<p>Call buttons S3 (floor 1) and S4 (floor 2); floor switches S5 (at floor 1) and S6 (at floor 2). UP H1 runs to floor 2 when called there, DOWN H2 to floor 1. A call is remembered (H5 / H6 call lamps) until the car arrives.</p>${P16}`,
    'Latch each call; clear it at its floor; up = call 2 and not at 2, down = call 1 and not at 1, interlocked.',
    ['XIC I:0/2 OTL O:0/4', 'XIC I:0/4 OTU O:0/4', 'XIC I:0/3 OTL O:0/5', 'XIC I:0/5 OTU O:0/5', 'XIC O:0/5 XIO I:0/5 XIO O:0/1 OTE O:0/0', 'XIC O:0/4 XIO I:0/4 XIO O:0/0 XIO O:0/5 OTE O:0/1'],
    [st(on(4), 0.1, { 0: 0, 1: 0 }, 'At floor 1'), st(on(3), 0.1, { 5: 1, 0: 1 }, 'Call floor 2: up'), st(R, 1, { 0: 1 }, 'Travelling'), st(on(5), 0.1, { 0: 0, 5: 0 }, 'At floor 2: stops, call cleared'), st(on(5, 2), 0.1, { 1: 1, 4: 1 }, 'Call floor 1: down'), st(on(4), 0.1, { 1: 0, 4: 0 }, 'At floor 1')]);
  lad('hard', 'Timers', 'practice16', 'Hours meter',
    `<p>Count how long motor H1 (S1/S2 start/stop) has run, in seconds, in <code>N7:0</code> — keep counting across stops. H8 lights from 5 s. S6 RESET clears it.</p>${P16}`,
    'A 1 s pulse timer that runs only while the motor runs; ADD 1 on its DN.',
    ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIC O:0/0 XIO T4:0/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN ADD N7:0 1 N7:0', 'GEQ N7:0 5 OTE O:0/7', 'XIC I:0/5 CLR N7:0'],
    [press(0, 0.1), st(R, 3.2, { 7: 0 }, '3 s run: under 5'), st({}, 0.1), st(R, 1, { 7: 0 }, 'Stopped 1 s: kept'), press(0, 0.1), st(R, 2.2, { 7: 1 }, '5 s in total: H8 on'), press(5, 0.1, { 7: 0 }, 'RESET')]);
  lad('hard', 'Seal-in & latches', 'practice16', 'Safety relay logic',
    `<p>Machine H1 may start (S1) only when both guard switches S3 and S4 are closed (ON) and E-stop S5 is released; opening any guard or pressing E-stop stops it and needs S6 RESET (with everything safe) before START works again. H2 = SAFE lamp.</p>${P16}`,
    'A "safe" latch: set by RESET when guards closed and E-stop released; cleared by any unsafe input.',
    ['XIC I:0/5 XIC I:0/2 XIC I:0/3 XIO I:0/4 OTL B3:0/0', 'BST XIO I:0/2 NXB XIO I:0/3 NXB XIC I:0/4 BND OTU B3:0/0', 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC B3:0/0 OTE O:0/0', 'XIC B3:0/0 OTE O:0/1'],
    [st(on(2, 3, 0), 0.1, { 0: 0 }, 'START without RESET: refused'), st(on(2, 3, 5), 0.1, { 1: 1 }, 'RESET: safe'), st(on(2, 3, 0), 0.1, { 0: 1 }, 'START: runs'), st(on(3), 0.1, { 0: 0, 1: 0 }, 'Guard opens: stops'), st(on(2, 3, 0), 0.1, { 0: 0 }, 'Guard closed, START: refused until RESET')]);
  lad('hard', 'Compare & math', 'practice16', 'Scaling',
    `<p>S3 sets a raw value 6553 in <code>N7:0</code>, S4 sets 32767. Scale it to 0–100 % in <code>N7:1</code> (<code>N7:1 = N7:0 × 100 / 32767</code>; first divide by 327). H5 lights at 90 % or more.</p>${P16}`,
    'DIV N7:0 327 N7:1 keeps the numbers small (16-bit).',
    ['XIC I:0/2 MOV 6553 N7:0', 'XIC I:0/3 MOV 32767 N7:0', 'DIV N7:0 327 N7:1', 'GEQ N7:1 90 OTE O:0/4'],
    [press(2, 0.1, { 4: 0 }, '6553 → 20 %: off'), press(3, 0.1, { 4: 1 }, '32767 → 100 %: on')]);
  lad('hard', 'Sequences', 'practice16', 'Drilling station',
    `<p>START (with the part present, S7 in AUTO): clamp H1, after 1 s drill down H2 until the depth switch S3, then drill up H3 until the top switch S4, then unclamp (H1 off) and count the part in C5:0 (H8 after 2 parts).</p>${P16}`,
    'Step bits latched in turn; the clamp holds through steps 1–3.',
    ['XIC I:0/0 XIC I:0/6 XIO B3:0/1 XIO B3:0/2 XIO B3:0/3 OTL B3:0/1', 'XIC B3:0/1 TON T4:0 1.0 1 0', 'XIC T4:0/DN XIC B3:0/1 BST OTU B3:0/1 NXB OTL B3:0/2 BND',
      'XIC B3:0/2 XIC I:0/2 BST OTU B3:0/2 NXB OTL B3:0/3 BND', 'XIC B3:0/3 XIC I:0/3 BST OTU B3:0/3 NXB OTL B3:0/4 BND', 'XIC B3:0/4 CTU C5:0 2 0', 'XIC B3:0/4 OTU B3:0/4',
      'BST XIC B3:0/1 NXB XIC B3:0/2 NXB XIC B3:0/3 BND OTE O:0/0', 'XIC B3:0/2 OTE O:0/1', 'XIC B3:0/3 OTE O:0/2', 'XIC C5:0/DN OTE O:0/7'],
    [...[1, 2].map(n => [st(on(6, 0, 3), 0.1, { 0: 1, 1: 0 }, `Part ${n}: clamp`), st(on(6, 3), 1.2, { 1: 1 }, 'Drill down'), st(on(6, 2), 0.1, { 1: 0, 2: 1 }, 'Depth: drill up'), st(on(6, 3), 0.2, { 2: 0, 0: 0 }, 'Top: unclamped')]).flat(), st(on(6, 3), 0.1, { 7: 1 }, '2 parts: H8')]);
  lad('hard', 'Timers', 'practice16', 'Long timer (minutes)',
    `<p>Make a 3-minute delay with timers that only go up to 60: H1 lights 3 minutes after S7 goes to AUTO. (Hint: a 1-minute timer counted by a counter.) For the check, the minute is shortened: use preset 1 s on T4:0 and count 3 of them.</p>${P16}`,
    'A self-restarting TON T4:0 (1 s here), a CTU counting its DN, preset 3; reset the counter in MAN.',
    ['XIC I:0/6 XIO T4:0/DN TON T4:0 1.0 1 0', 'XIC T4:0/DN CTU C5:0 3 0', 'XIO I:0/6 RES C5:0', 'XIC C5:0/DN OTE O:0/0'],
    [st(on(6), 2.5, { 0: 0 }, '2.5 "minutes": off'), st(on(6), 1, { 0: 1 }, '3 "minutes": on'), st(R, 0.1, { 0: 0 }, 'MAN: reset')]);
  lad('hard', 'Process', 'practice16', 'Compressor with pressure band',
    `<p>Pressure in <code>N7:0</code> (S3 = +10 per press, S4 = −10). In AUTO (S7) the compressor H1 starts below 60 and stops at 100; it must stay off at least 2 s after stopping (anti-short-cycle, H5 lamp).</p>${P16}`,
    'OTL below 60 (when the off-timer is done), OTU at 100; TOF on the compressor for the minimum off time.',
    ['XIC I:0/2 ONS B3:1/0 ADD N7:0 10 N7:0', 'XIC I:0/3 ONS B3:1/1 SUB N7:0 10 N7:0', 'XIC O:0/0 TOF T4:0 1.0 2 0', 'XIC I:0/6 LES N7:0 60 XIO T4:0/DN OTL O:0/0', 'BST GEQ N7:0 100 NXB XIO I:0/6 BND OTU O:0/0', 'XIC T4:0/DN XIO O:0/0 OTE O:0/4'],
    [st(on(6), 0.1, { 0: 1 }, 'Pressure 0: starts'), ...Array.from({ length: 10 }, () => [st(on(6, 2), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.1, { 0: 0, 4: 1 }, '100: stops, anti-short-cycle'),
      ...Array.from({ length: 5 }, () => [st(on(6, 3), 0.05), st(on(6), 0.05)]).flat(), st(on(6), 0.3, { 0: 0 }, '50 within 2 s: waits'), st(on(6), 2, { 0: 1 }, 'After 2 s: starts again')]);
  prj('hard', 'Integration', () => integ(), 'Start / stop through the PLC, end to end',
    `<p>Everything connected: in the <b>Electrical Diagram</b> draw PLC input symbols <b>I8</b> fed by START S9 and <b>I9</b> fed by STOP S10 (N.C.), from +24 V (I0–I7 are taken by the board); in the <b>Ladder</b> write a seal-in for <code>O:0/0</code> on <code>I:0/8</code> / <code>I:0/9</code>; the PLC output O0 already drives contactor KM1 in the Wiring. On the <b>HMI</b> add a pilot light on <code>O:0/0</code>. RUN, press S9: KM1 pulls in.</p>`,
    'Diagram: + → S9 N.O. → PLC input I8; + → S10 N.C. → PLC input I9 (tag the PLC symbols PLC; pick the input number in the symbol form). Ladder: BST XIC I:0/8 NXB XIC O:0/0 BND XIC I:0/9 OTE O:0/0.',
    async A => { const r = await A.plcSealTest('S9', 'S10', 'KM1'); return [{ say: 'HMI pilot light on O:0/0', ok: A.hmi('lamp', 'O:0/0') }, { say: 'S9 starts KM1 through the PLC', ok: r.start }, { say: 'KM1 holds after S9 is released', ok: r.hold }, { say: 'S10 stops KM1', ok: r.stop }]; },
    A => { A.draw([['pP', 'XP1', 200, 40], ['pbno', 'S9', 200, 160], ['plci8', 'PLC', 200, 280], ['pP', 'XP2', 320, 40], ['pbnc', 'S10', 320, 160], ['plci9', 'PLC', 320, 280]], [[0, 'J', 1, '13'], [1, '14', 2, 'I8'], [3, 'J', 4, '11'], [4, '12', 5, 'I9']]);
      A.setLadder(['BST XIC I:0/8 NXB XIC O:0/0 BND XIC I:0/9 OTE O:0/0']); A.addHmi('lamp', { label: 'KM1', tag: 'O:0/0' }); });
  prj('hard', 'Electrical Diagram', 'blank', 'Forward / reverse, hardwired',
    `<p>Draw a hardwired reversing control: STOP S2 (N.C.) feeds two columns. Forward: S1 N.O. with KM1 13-14 seal-in, KM2 21-22 N.C. interlock, KM1 coil. Reverse: S3 N.O. with KM2 13-14 seal-in, KM1 21-22 interlock, KM2 coil.</p>`,
    'Each coil’s column passes through the other contactor’s N.C. 21-22 (electrical interlock).',
    async A => {
      const f = await A.sealTest('S1', 'S2', 'KM1'), r = await A.sealTest('S3', 'S2', 'KM2');
      const lock = await A.interlockTest('S1', 'S3', 'KM1', 'KM2');
      return [{ say: 'Forward: S1 starts and holds KM1, STOP drops it', ok: f.start && f.hold && f.stop }, { say: 'Reverse: S3 starts and holds KM2, STOP drops it', ok: r.start && r.hold && r.stop }, { say: 'Interlock: with KM1 in, S3 cannot pull KM2 in', ok: lock }];
    },
    A => { A.draw([['pP', 'XP1', 260, 40], ['pbnc', 'S2', 260, 140], ['pbno', 'S1', 200, 260], ['kmno', 'KM1', 120, 260], ['kmnc', 'KM2', 200, 380], ['kmcoil', 'KM1', 200, 500], ['pM', 'XP2', 200, 620],
      ['pbno', 'S3', 340, 260], ['kmno', 'KM2', 420, 260], ['kmnc', 'KM1', 340, 380], ['kmcoil', 'KM2', 340, 500], ['pM', 'XP3', 340, 620]],
    [[0, 'J', 1, '11'], [1, '12', 2, '13'], [2, '13', 3, '13'], [2, '14', 3, '14'], [2, '14', 4, '21'], [4, '22', 5, 'A1'], [5, 'A2', 6, 'J'],
      [1, '12', 7, '13'], [7, '13', 8, '13'], [7, '14', 8, '14'], [7, '14', 9, '21'], [9, '22', 10, 'A1'], [10, 'A2', 11, 'J']]); });
  prj('hard', 'Electrical Diagram', 'blank', 'Timed stop (off-delay relay)',
    `<p>Draw: START S1 / STOP S2 seal-in for relay KA1; a lamp H1 on KA1; and an off-delay timer KT1 whose coil is on KA1, with its N.O. 15-18 lighting a fan lamp H2 that stays on for the timer’s time after STOP.</p>`,
    'Coils: relay coil, off-delay timer coil; contacts: KA N.O. 11-14 for the seal and the lamp, KT N.O. 15-18 (off-delay).',
    async A => {
      const r = await A.sealTest('S1', 'S2', 'KA1', 'H1'), off = await A.offDelayTest('S1', 'S2', 'H2');
      return [{ say: 'START latches KA1 and lights H1', ok: r.start && r.hold && r.lamp }, { say: 'STOP drops KA1', ok: r.stop }, { say: 'H2 stays on for a while after STOP, then goes out', ok: off }];
    },
    A => { A.draw([['pP', 'XP1', 200, 40], ['pbnc', 'S2', 200, 160], ['pbno', 'S1', 200, 280], ['ka1no', 'KA1', 300, 280], ['kacoil', 'KA1', 200, 400], ['pM', 'XP2', 200, 520],
      ['pP', 'XP3', 420, 40], ['ka2no', 'KA1', 420, 160], ['lamp', 'H1', 420, 280], ['pM', 'XP4', 420, 400], ['kfcoil', 'KT1', 540, 160], ['pM', 'XP5', 540, 280], ['pP', 'XP6', 660, 40], ['kfno', 'KT1', 660, 160], ['lamp', 'H2', 660, 280], ['pM', 'XP7', 660, 400]],
    [[0, 'J', 1, '11'], [1, '12', 2, '13'], [2, '13', 3, '11'], [2, '14', 3, '14'], [2, '14', 4, 'A1'], [4, 'A2', 5, 'J'], [6, 'J', 7, '21'], [7, '24', 8, 'X1'], [8, 'X2', 9, 'J'], [7, '24', 10, 'A1'], [10, 'A2', 11, 'J'], [12, 'J', 13, '15'], [13, '18', 14, 'X1'], [14, 'X2', 15, 'J']]); },
    { setup: A => { const d = A.dev('KT1'); if (d && d.props) d.props.t = 2; } });
  prj('hard', 'HMI', 'practice16', 'Machine screen',
    `<p>Build an operator screen for a conveyor: START (<code>B3:0/0</code>) and STOP (<code>B3:0/1</code>) buttons, a motor graphic on <code>O:0/0</code>, a numeric display of the box count <code>C5:0.ACC</code>, a numeric entry for the batch size <code>C5:0.PRE</code>, and an alarm banner on <code>B3:0/15</code> (batch done). Ladder: HMI start/stop of O:0/0, count S3 boxes while running, batch done stops the conveyor.</p>${P16}`,
    'Seal-in on B3:0/0 / B3:0/1 with XIO C5:0/DN; CTU on S3 while running; C5:0/DN → B3:0/15; RES from HMI START.',
    async A => [{ say: 'START and STOP buttons', ok: A.hmi('pb', 'B3:0/0') && A.hmi('pb', 'B3:0/1') }, { say: 'Motor graphic on O:0/0', ok: A.hmi('motor', 'O:0/0') }, { say: 'Count display and batch entry', ok: A.hmi('num', 'C5:0.ACC') && A.hmi('entry', 'C5:0.PRE') }, { say: 'Alarm banner on B3:0/15', ok: A.hmi('alarm', 'B3:0/15') },
      ...A.grade([st(R, 0.1, { 0: 1 }, 'HMI START: runs', { 'B3:0/0': 1 }), st(R, 0.1, { 0: 1 }, 'Released', { 'B3:0/0': 0 }), ...Array.from({ length: 3 }, () => [press(2, 0.05), st(R, 0.05)]).flat(), st(R, 0.1, { 0: 0 }, 'Batch of 3 done: stops')])],
    A => { A.addHmi('pb', { label: 'START', tag: 'B3:0/0' }); A.addHmi('pb', { label: 'STOP', tag: 'B3:0/1', color: '#c62828' }); A.addHmi('motor', { label: 'M1', tag: 'O:0/0' }); A.addHmi('num', { label: 'BOXES', tag: 'C5:0.ACC' }); A.addHmi('entry', { label: 'BATCH', tag: 'C5:0.PRE' }); A.addHmi('alarm', { label: 'BATCH DONE', tag: 'B3:0/15' });
      A.setLadder(['BST XIC B3:0/0 NXB XIC O:0/0 BND XIO B3:0/1 XIO C5:0/DN OTE O:0/0', 'XIC O:0/0 XIC I:0/2 CTU C5:0 3 0', 'XIC C5:0/DN OTE B3:0/15', 'XIC B3:0/0 RES C5:0']); });
  prj('hard', 'Wiring', () => motorKit(), 'Wire a DOL motor starter',
    `<p>In the <b>Wiring</b>, complete a direct-on-line starter: supply Q0 → breaker QF1 → contactor KM1 main poles → overload F1 → motor M1 (L1, L2, L3), and the control: 24 V supply → S2 STOP (N.C.) → S1 START (N.O.) with KM1 13-14 across it → KM1 coil A1, A2 → 0 V. Then start the motor with S1.</p>`,
    'Power: pole by pole 1→2, 3→4, 5→6. Control: the PSU + to S2 11, S2 12 to S1 13 and KM1 13, S1 14 and KM1 14 to A1, A2 to the PSU −.',
    async A => { const r = await A.sealTest('S1', 'S2', 'KM1'); const m = await A.motorTest('S1', 'M1'); return [{ say: 'S1 starts KM1 and it holds', ok: r.start && r.hold }, { say: 'S2 stops KM1', ok: r.stop }, { say: 'The motor runs with KM1 in', ok: m }]; },
    A => { const w = (a, ta, b, tb) => A.wire(a, ta, b, tb);
      w('Q0', 'L1', 'QF1', '1'); w('Q0', 'L2', 'QF1', '3'); w('Q0', 'L3', 'QF1', '5'); w('QF1', '2', 'KM1', '1'); w('QF1', '4', 'KM1', '3'); w('QF1', '6', 'KM1', '5'); w('KM1', '2', 'F1', '1'); w('KM1', '4', 'F1', '3'); w('KM1', '6', 'F1', '5');
      w('F1', '2', 'M1', 'U1'); w('F1', '4', 'M1', 'V1'); w('F1', '6', 'M1', 'W1');
      w('G1', 'P1', 'S2', '11'); w('S2', '12', 'S1', '13'); w('S1', '13', 'KM1', '13'); w('S1', '14', 'KM1', '14'); w('S1', '14', 'KM1', 'A1'); w('KM1', 'A2', 'G1', 'M1'); });
  prj('hard', 'Integration', 'practice16', 'Commissioning: force and test',
    `<p>Commission the practice board with the PLC in RUN: <b>force</b> output <code>O:0/7</code> ON (H8 lights with an empty program), then remove the force. Then write a rung so S3 lights H8 and test it from the Wiring.</p>${P16}`,
    'Ladder → right-click the address (or the data table) → Force ON; remove the force; then XIC I:0/2 OTE O:0/7.',
    async A => [{ say: 'Output O:0/7 was forced ON (seen in the Events)', ok: A.ev('Force ON installed on O:0/7') }, { say: 'No force is left on', ok: A.noForces() }, ...A.grade([press(2, 0.1, { 7: 1 }, 'S3: H8 on'), st(R, 0.1, { 7: 0 }, 'Released: off')])],
    async A => { App.setMode('RUN'); A.force('O:0/7', 1); await A.wait(400); A.force('O:0/7', null); await A.wait(300); App.setMode('PROG'); A.setLadder(['XIC I:0/2 OTE O:0/7']); });

  /* the starting projects of some exercises: a board with something left to do */
  function unwired() {
    const p = Examples.EX.practice.build(), C = p.circuit, h4 = C.comps.find(c => c.props.label === 'H4');
    C.wires = C.wires.filter(w => !(w.a.startsWith(h4.id + ':') || w.b.startsWith(h4.id + ':')));
    p.name = 'Exercise: wire H4'; p.ladder.rungs = [{ text: 'XIC I:0/2 OTE O:0/3', comment: 'Given: S3 lights H4' }];
    return p;
  }
  function withKm() {
    const p = Examples.EX.practice.build(), C = p.circuit;
    const km = Circuit.create('contactor', 600, 560, C); km.props.label = 'KM1'; km.props.coil = '24VDC'; C.comps.push(km);
    p.name = 'Exercise: PLC output to KM1'; p.ladder.rungs = [{ text: 'XIC I:0/0 OTE O:0/1', comment: 'Given: S1 turns O:0/1 on' }];
    return p;
  }
  function integ() {
    const p = Examples.EX.practice16.build(), C = p.circuit;
    const km = Circuit.create('contactor', 900, 560, C); km.props.label = 'KM1'; km.props.coil = '24VDC'; C.comps.push(km);
    const plc = C.comps.find(c => c.type === 'plc16'), lamp = C.comps.find(c => c.props.label === 'H1');
    C.wires = C.wires.filter(w => !(w.a === plc.id + ':O0' || w.b === plc.id + ':O0' || w.a.startsWith(lamp.id + ':') || w.b.startsWith(lamp.id + ':')));
    C.comps = C.comps.filter(c => c !== lamp);
    C.seq = (C.seq || 0) + 2; C.wires.push({ id: 'wx1', a: plc.id + ':O0', b: km.id + ':A1', pts: [] }, { id: 'wx2', a: km.id + ':A2', b: plc.id + ':C24', pts: [] });
    p.name = 'Exercise: end to end'; return p;
  }
  function motorKit() {
    const B = { comps: [], wires: [], seq: 0 }, add = (t, x, y, props, state) => { const c = Circuit.create(t, x, y, B); Object.assign(c.props, props); Object.assign(c.state, state || {}); B.comps.push(c); return c; };
    add('supply3', 40, 20, { label: 'Q0' }, { on: true }); add('mccb3', 60, 200, { label: 'QF1' }, { on: true }); add('contactor', 60, 400, { label: 'KM1', coil: '24VDC' }); add('olr', 60, 620, { label: 'F1' }); add('motor', 60, 820, { label: 'M1' });
    add('supply1', 420, 20, { label: 'Q1' }, { on: true }); add('psu24', 420, 200, { label: 'G1' }); add('pb_nc', 420, 420, { label: 'S2', text: 'STOP', color: 'red' }); add('pb_no', 520, 420, { label: 'S1', text: 'START', color: 'green' });
    const q1 = B.comps.find(c => c.props.label === 'Q1'), g1 = B.comps.find(c => c.props.label === 'G1');
    B.wires.push({ id: 'w1', a: q1.id + ':L', b: g1.id + ':L', pts: [] }, { id: 'w2', a: q1.id + ':N', b: g1.id + ':N', pts: [] }); B.seq = 2;
    return { version: 1, name: 'Exercise: DOL starter', circuit: B, ladder: { rungs: [], desc: {} }, hmi: { objects: [], seq: 0 } };
  }

  /* the checker's view of the open project. It presses buttons as an operator would (the circuit simulates live),
     switches the PLC to RUN for the PLC tests and back, grades the ladder like a lesson, and looks at the HMI. */
  function api() {
    const P = App.project, C = P.circuit;
    const dev = tag => C.comps.find(c => c.props.label === tag);
    const wait = ms => new Promise(r => setTimeout(r, ms));
    const lit = tag => { const d = dev(tag); return !!d && !!(d.state.on || d.state.pulled || d.state.lit); };
    const hold = tag => { const d = dev(tag); if (!d) return () => {}; const up = App.operate(d, 'btn'); return typeof up === 'function' ? up : () => {}; };
    const hmiObjs = () => (P.hmi && P.hmi.objects) || [];
    const A = {
      project: P, dev, wait, lit,
      has: tag => !!dev(tag) || ((P.schematic.free || {}).items || []).some(i => i.tag === tag),
      async pressTest(btn, out) { await wait(300); const up = hold(btn); await wait(400); const on = lit(out); up(); await wait(400); return { on, off: !lit(out) }; },
      async sealTest(start, stop, coil, lamp) {
        await wait(300); let up = hold(start); await wait(400); const r = { start: lit(coil), lamp: lamp ? lit(lamp) : true }; up(); await wait(400); r.hold = lit(coil);
        up = hold(stop); await wait(400); r.stop = !lit(coil); r.lampOff = lamp ? !lit(lamp) : true; up(); await wait(300); return r;
      },
      async interlockTest(s1, s3, km1, km2, stop = 'S2') {
        await wait(300); let up = hold(s1); await wait(400); up(); await wait(300); const in1 = lit(km1); up = hold(s3); await wait(400); const blocked = !lit(km2); up(); await wait(200);
        up = hold(stop); await wait(300); up(); await wait(200); return in1 && blocked;
      },
      async offDelayTest(start, stop, lamp) {
        await wait(300); let up = hold(start); await wait(300); up(); await wait(300); up = hold(stop); await wait(300); up(); const still = lit(lamp); await wait(2600); return still && !lit(lamp);
      },
      async motorTest(start, motor) { await wait(300); const up = hold(start); await wait(400); up(); await wait(800); const m = dev(motor); const run = !!m && (m.state.drive === 'run' || Math.abs(m.state.spd || 0) > 0.05); const s = hold('S2'); await wait(300); s(); return run; },
      async plcPressTest(btn, out) { App.setMode('RUN'); try { return await A.pressTest(btn, out); } finally { App.setMode('PROG'); } },
      async plcSealTest(start, stop, coil) { App.setMode('RUN'); try { return await A.sealTest(start, stop, coil); } finally { App.setMode('PROG'); } },
      grade(test) {
        const res = Examples.gradeLesson({ test }, P.ladder.rungs.map(r => Ladder.serialize(r.elems)));
        return res.error ? [{ say: res.error, ok: false }] : res.map(r => ({ say: r.say + (r.ok ? '' : ` (${r.got})`), ok: r.ok }));
      },
      hmi: (type, tag) => hmiObjs().some(o => o.type === type && String(o.tag || '').toUpperCase() === tag.toUpperCase()),
      hmiText: txt => hmiObjs().some(o => String(o.label || '').toUpperCase().includes(txt.toUpperCase())),
      ev: txt => App.events().some(e => String(e.msg).includes(txt)),
      noForces: () => App.plc.forceCount() === 0,
      // the reference solutions
      setLadder(texts) { App.plc.setMode('PROG'); P.ladder.rungs = texts.map(t => Ladder.newRung(Ladder.parseRung(t))); App.loadProgram(); App.plc.applyAll(true); App.dirty.ladder = true; App.save(); },
      addHmi(type, props) {
        const t = HMI.TYPES[type], h = P.hmi; h.seq = (h.seq || 0) + 1; const n = h.objects.length % 8;
        h.objects.push({ id: 'h' + h.seq, type, scr: 's1', x: 40 + n * 30, y: 60 + n * 30, w: t.w, h: t.h, ...JSON.parse(JSON.stringify(t.d)), vis: '', ...props }); App.dirty.hmi = true; App.save();
      },
      draw(items, wires) {
        const F = P.schematic.free; let n = F.seq || 0;
        const ids = items.map(([k, tag, x, y]) => { const it = { id: 'd' + (++n), k, tag, x, y, r: 0 }; F.items.push(it); return it.id; });
        wires.forEach(([a, ta, b, tb]) => F.wires.push({ id: 'fw' + (++n), a: ids[a] + ':' + ta, b: ids[b] + ':' + tb }));
        F.seq = n + 1; Schematic.sync(); App.save();
      },
      wire(a, ta, b, tb) { const x = dev(a), y = dev(b); if (!x || !y) return; C.seq = (C.seq || 0) + 1; C.wires.push({ id: 'w' + C.seq, a: x.id + ':' + ta, b: y.id + ':' + tb, pts: [] }); App.circuitChanged(); App.save(); },
      force(addr, v) { App.plc.forcesEnabled = true; App.force(addr, v); },
    };
    return A;
  }

  // ids, numbering, the level of each
  const ORDER = { easy: 0, medium: 1, hard: 2 };
  X.forEach((e, i) => { e.id = 'x' + String(i + 1).padStart(3, '0'); e.kind = 'ex'; e.level = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }[e.diff]; });
  // numbered in learning order: by difficulty, then by topic, then as written
  const TOPICS = ['Contacts & coils', 'Logic', 'Seal-in & latches', 'Timers', 'Counters', 'Compare & math', 'Sequences', 'Motor control', 'Process', 'Electrical Diagram', 'Wiring', 'HMI', 'Integration'];
  X.forEach((e, i) => { e.w = i; });
  X.sort((a, b) => ORDER[a.diff] - ORDER[b.diff] || TOPICS.indexOf(a.topic) - TOPICS.indexOf(b.topic) || a.w - b.w);
  X.forEach((e, i) => { e.n = i + 1; e.title = `${e.n} · ${e.title}`; });
  window.Exercises = { LIST: X, TOPICS: TOPICS.filter(t => X.some(e => e.topic === t)), api };
})();
