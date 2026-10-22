/* Example projects (wired circuits + ladder + HMI) and guided lessons. */
(function () {
  'use strict';
  // wire colours, Philippine practice: L1 red, L2 yellow, L3 blue, N white, PE green; control 230 V black; 24 V DC + red, 0 V blue
  const C = { L1: '#b3261e', L2: '#f2c230', L3: '#2b6fe0', N: '#f4f4f0', PE: '#58a83a', AC: '#1d1d1d', DC: '#d33a2c', DC0: '#1f4fa8' };

  function builder() {
    const circ = { comps: [], wires: [], seq: 0 };
    const add = (type, x, y, props = {}, state = {}) => {
      const c = Circuit.create(type, x, y, circ);
      Object.assign(c.props, props); Object.assign(c.state, state);
      circ.comps.push(c);
      return c.id;
    };
    const w = (a, ta, b, tb, color, pts = []) => { circ.seq++; circ.wires.push({ id: 'w' + circ.seq, a: a + ':' + ta, b: b + ':' + tb, pts, color }); };
    return { circ, add, w };
  }
  const proj = (name, circ, rungs = [], desc = {}, hmi = [], io) => ({
    version: 1, name, ...(io ? { io } : {}),
    ladder: { rungs: rungs.map(r => typeof r === 'string' ? { text: r, comment: '' } : r), desc },
    circuit: circ,
    hmi: { objects: hmi.map((o, i) => ({ id: 'h' + (i + 1), ...o })), seq: hmi.length },
  });

  /* Shared 3-phase power column: Q0 → QF1 → KM1 → (F1) → load */
  function powerColumn(B, withOl, loadType = 'motor') {
    const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
    const qf1 = B.add('mccb3', 55, 150, { label: 'QF1' }, { on: true });
    const km1 = B.add('contactor', 50, 320, { label: 'KM1', coil: '230VAC' });
    B.w(q0, 'L1', qf1, '1', C.L1); B.w(q0, 'L2', qf1, '3', C.L2); B.w(q0, 'L3', qf1, '5', C.L3);
    B.w(qf1, '2', km1, '1', C.L1); B.w(qf1, '4', km1, '3', C.L2); B.w(qf1, '6', km1, '5', C.L3);
    let f1 = null, m1;
    if (withOl) {
      f1 = B.add('olr', 60, 540, { label: 'F1' });
      B.w(km1, '2', f1, '1', C.L1); B.w(km1, '4', f1, '3', C.L2); B.w(km1, '6', f1, '5', C.L3);
      m1 = B.add(loadType, 50, 710, { label: 'M1' });
      B.w(f1, '2', m1, 'U1', C.L1); B.w(f1, '4', m1, 'V1', C.L2); B.w(f1, '6', m1, 'W1', C.L3);
      B.w(q0, 'PE', m1, 'PE', C.PE, [[210, 102], [210, 690], [150, 690]]);
    }
    return { q0, qf1, km1, f1, m1 };
  }

  const EX = {};

  EX.practice = {
    title: 'Practice board (PLC + buttons + lamps)', desc: 'PLC pre-wired to 4 input devices and 4 lamps. Empty program — perfect for the ladder lessons.',
    build() {
      const B = builder();
      const q0 = B.add('supply1', 60, 20, { label: 'Q0' });
      const qf = B.add('mcb2', 60, 150, { label: 'QF1' }, { on: true });
      const plc = B.add('plc', 60, 360, { label: 'PLC' });
      B.w(q0, 'L', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', plc, 'L1', C.L1); B.w(qf, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      const s1 = B.add('pb_no', 220, 150, { label: 'S1', color: 'green', text: 'START' });
      const s2 = B.add('pb_nc', 290, 150, { label: 'S2', color: 'red', text: 'STOP' });
      const s3 = B.add('pb_no', 360, 150, { label: 'S3', color: 'yellow', text: 'JOG' });
      const s4 = B.add('sel2', 430, 150, { label: 'S4', text: 'MAN  AUTO' });
      B.w(plc, 'V24', s1, '13', C.DC);
      B.w(s1, '13', s2, '11', C.DC, [[235, 262], [305, 262]]);
      B.w(s2, '11', s3, '13', C.DC, [[305, 262], [375, 262]]);
      B.w(s3, '13', s4, '13', C.DC, [[375, 262], [445, 262]]);
      B.w(s1, '14', plc, 'I0', C.DC, [[265, 310], [234, 310]]);
      B.w(s2, '12', plc, 'I1', C.DC, [[335, 318], [256, 318]]);
      B.w(s3, '14', plc, 'I2', C.DC, [[405, 326], [278, 326]]);
      B.w(s4, '14', plc, 'I3', C.DC, [[475, 334], [300, 334]]);
      const cols = ['green', 'red', 'amber', 'blue'];
      const H = cols.map((col, k) => B.add('lamp', 100 + k * 70, 620, { label: 'H' + (k + 1), color: col, coil: '24VDC' }));
      B.w(plc, 'V24', plc, 'VAC0', C.DC, [[150, 330], [40, 330], [40, 580], [80, 580]]);
      H.forEach((h, k) => {
        const x0 = 100 + k * 70, o = 110 + k * 22;
        B.w(plc, 'O' + k, h, 'X1', C.DC, [[o, 586 + k * 8], [x0 - 8, 586 + k * 8], [x0 - 8, 716], [x0 + 13, 716]]);
        if (k > 0) B.w(H[k - 1], 'X2', h, 'X2', C.DC0, [[x0 - 70 + 37, 724], [x0 + 37, 724]]);
      });
      B.w(H[3], 'X2', plc, 'C24', C.DC0, [[347, 724], [540, 724], [540, 340], [172, 340]]);
      return proj('Practice board', B.circ, [], {
        'I:0/0': 'S1 START PB', 'I:0/1': 'S2 STOP PB (NC)', 'I:0/2': 'S3 JOG PB', 'I:0/3': 'S4 AUTO SEL',
        'O:0/0': 'H1 GREEN', 'O:0/1': 'H2 RED', 'O:0/2': 'H3 AMBER', 'O:0/3': 'H4 BLUE',
      });
    },
  };

  EX.practice16 = {
    title: 'Practice board 16 (16 in / 12 out PLC, 8 buttons, 8 lamps)', desc: 'The 16 in / 12 out compact PLC pre-wired to START, STOP, four push buttons, two selectors and eight lamps. Empty program — for the medium and hard exercises.',
    build() {
      const B = builder();
      const q0 = B.add('supply1', 40, 20, { label: 'Q0' }, { on: true });
      const qf = B.add('mcb2', 40, 180, { label: 'QF1' }, { on: true });
      const plc = B.add('plc16', 160, 400, { label: 'PLC' });
      B.w(q0, 'L', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', plc, 'L1', C.L1); B.w(qf, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      const ins = [['pb_no', 'S1', { color: 'green', text: 'START' }, '13', '14'], ['pb_nc', 'S2', { color: 'red', text: 'STOP' }, '11', '12'], ['pb_no', 'S3', { color: 'yellow', text: 'S3' }, '13', '14'], ['pb_no', 'S4', { color: 'yellow', text: 'S4' }, '13', '14'],
        ['pb_no', 'S5', { color: 'black', text: 'S5' }, '13', '14'], ['pb_no', 'S6', { color: 'black', text: 'S6' }, '13', '14'], ['sel2', 'S7', { text: 'MAN  AUTO' }, '13', '14'], ['sel2', 'S8', { text: 'OFF  ON' }, '13', '14']];
      let prev = null;
      ins.forEach(([t, l, props, a, b], k) => {
        const s = B.add(t, 200 + k * 80, 160, { label: l, ...props });
        B.w(prev ? prev.s : plc, prev ? prev.a : 'V24', s, a, C.DC);
        B.w(s, b, plc, 'I' + k, C.DC); prev = { s, a };
      });
      B.w(plc, 'V24', plc, 'VAC0', C.DC); B.w(plc, 'VAC0', plc, 'VAC1', C.DC);
      const cols = ['green', 'red', 'amber', 'blue', 'white', 'green', 'red', 'amber'];
      const H = cols.map((col, k) => B.add('lamp', 180 + k * 70, 720, { label: 'H' + (k + 1), color: col, coil: '24VDC' }));
      H.forEach((h, k) => { B.w(plc, 'O' + k, h, 'X1', C.DC); B.w(h, 'X2', k ? H[k - 1] : plc, k ? 'X2' : 'C24', C.DC0); });
      const io = { 'I:0/0': 'S1 START', 'I:0/1': 'S2 STOP (NC)', 'I:0/2': 'S3', 'I:0/3': 'S4', 'I:0/4': 'S5', 'I:0/5': 'S6', 'I:0/6': 'S7 MAN/AUTO', 'I:0/7': 'S8 OFF/ON' };
      for (let k = 0; k < 8; k++) io['O:0/' + k] = 'H' + (k + 1) + ' ' + cols[k].toUpperCase();
      return proj('Practice board 16', B.circ, [], io);
    },
  };

  EX.dol = {
    title: 'Hardwired DOL starter (no PLC)', desc: 'Classic 3-wire start/stop: stop NC, start NO with KM1 13-14 seal-in, overload 95-96 in the coil circuit, run & trip lamps.',
    build() {
      const B = builder();
      const { q0, km1, f1 } = powerColumn(B, true);
      const qf2 = B.add('mcb2', 300, 150, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 110], [320, 110]]);
      B.w(q0, 'N', qf2, '3', C.N, [[150, 120], [350, 120]]);
      const s0 = B.add('pb_nc', 300, 300, { label: 'S0', color: 'red', text: 'STOP' });
      const s1 = B.add('pb_no', 400, 300, { label: 'S1', color: 'green', text: 'START' });
      const h1 = B.add('lamp', 500, 310, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 580, 310, { label: 'H2', color: 'amber', coil: '230VAC' });
      B.w(qf2, '2', s0, '11', C.AC, [[280, 262], [280, 410]]);
      B.w(s0, '12', s1, '13', C.AC);
      B.w(s1, '13', km1, '13', C.AC, [[415, 420], [240, 420], [240, 296], [142, 296]]);
      B.w(s1, '14', km1, '14', C.AC, [[445, 432], [250, 432], [250, 480], [142, 480]]);
      B.w(km1, '14', km1, 'A1', C.AC, [[142, 474], [36, 474], [36, 300], [60, 300]]);
      B.w(km1, 'A2', f1, '95', C.AC, [[60, 486], [145, 486]]);
      B.w(f1, '96', qf2, '4', C.N, [[160, 500], [230, 500], [230, 270], [350, 270]]);
      B.w(qf2, '2', f1, '97', C.AC, [[270, 262], [270, 512], [175, 512]]);
      B.w(f1, '98', h2, 'X1', C.AC, [[190, 520], [650, 520], [650, 420], [593, 420]]);
      B.w(s1, '14', h1, 'X1', C.AC);
      B.w(qf2, '4', h1, 'X2', C.N, [[350, 280], [560, 280], [560, 416], [537, 416]]);
      B.w(h1, 'X2', h2, 'X2', C.N, [[537, 410], [617, 410]]);
      return proj('Hardwired DOL starter', B.circ, [{ comment: 'This project is hardwired — no PLC. Study the control circuit in the Wiring tab.', text: '' }]);
    },
  };

  EX.plcmotor = {
    title: 'PLC motor start/stop + HMI', desc: 'DOL motor controlled by the PLC: start/stop push buttons, overload contact to an input, contactor on a relay output, HMI with start/stop, start counter and run time.',
    build() {
      const B = builder();
      const { q0, km1, f1 } = powerColumn(B, true);
      const qf2 = B.add('mcb2', 300, 150, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 110], [320, 110]]);
      B.w(q0, 'N', qf2, '3', C.N, [[150, 120], [350, 120]]);
      const plc = B.add('plc', 300, 560, { label: 'PLC' });
      B.w(qf2, '2', plc, 'L1', C.L1); B.w(qf2, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      const s1 = B.add('pb_no', 440, 300, { label: 'S1', color: 'green', text: 'START' });
      const s0 = B.add('pb_nc', 520, 300, { label: 'S0', color: 'red', text: 'STOP' });
      const h1 = B.add('lamp', 620, 310, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 690, 310, { label: 'H2', color: 'amber', coil: '230VAC' });
      B.w(plc, 'V24', s1, '13', C.DC);
      B.w(s1, '13', s0, '11', C.DC, [[455, 412], [535, 412]]);
      B.w(s1, '14', plc, 'I0', C.DC);
      B.w(s0, '12', plc, 'I1', C.DC);
      B.w(plc, 'V24', f1, '95', C.DC, [[390, 516], [145, 516]]);
      B.w(f1, '96', plc, 'I2', C.DC, [[160, 500], [250, 500], [250, 530], [518, 530]]);
      B.w(plc, 'O0', km1, 'A1', C.AC, [[350, 850], [24, 850], [24, 300], [60, 300]]);
      B.w(plc, 'L1', plc, 'VAC0', C.AC, [[290, 548], [290, 772], [320, 772]]);
      B.w(km1, 'A2', plc, 'N', C.N, [[60, 484], [270, 484], [270, 544], [340, 544]]);
      B.w(plc, 'O1', h1, 'X1', C.AC, [[372, 800], [760, 800], [760, 420], [633, 420]]);
      B.w(plc, 'O2', h2, 'X1', C.AC, [[394, 810], [770, 810], [770, 430], [703, 430]]);
      B.w(h1, 'X2', h2, 'X2', C.N, [[657, 410], [727, 410]]);
      B.w(h1, 'X2', plc, 'N', C.N, [[657, 450], [600, 450]]);
      return proj('PLC motor control', B.circ, [
        { comment: 'Motor start/stop with seal-in. S0 STOP and F1 overload are wired NC, so their inputs are ON when healthy → use XIC.', text: 'BST XIC I:0/0 NXB XIC B3:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO B3:0/1 XIC I:0/2 OTE O:0/0' },
        { comment: 'Run lamp', text: 'XIC O:0/0 OTE O:0/1' },
        { comment: 'Overload tripped: amber lamp + HMI alarm', text: 'XIO I:0/2 BST OTE O:0/2 NXB OTE B3:0/15 BND' },
        { comment: 'Count motor starts (one shot on the rising edge)', text: 'XIC O:0/0 ONS B3:1/0 CTU C5:0 9999 0' },
        { comment: 'Running time in seconds (retentive)', text: 'XIC O:0/0 RTO T4:0 1.0 32767 0' },
        { comment: 'HMI reset of counter and run time', text: 'XIC B3:0/2 BST RES C5:0 NXB RES T4:0 BND' },
      ], {
        'I:0/0': 'S1 START PB', 'I:0/1': 'S0 STOP PB (NC)', 'I:0/2': 'F1 OVERLOAD OK (NC)',
        'O:0/0': 'KM1 MOTOR CONTACTOR', 'O:0/1': 'H1 RUN LAMP', 'O:0/2': 'H2 TRIP LAMP',
        'B3:0/0': 'HMI START', 'B3:0/1': 'HMI STOP', 'B3:0/2': 'HMI RESET', 'B3:0/15': 'OL ALARM', 'B3:1/0': 'START ONS',
        'C5:0': 'START COUNTER', 'T4:0': 'RUN TIME',
      }, [
        { type: 'text', x: 24, y: 16, w: 560, h: 40, label: 'MOTOR M1 — DOL STARTER', size: 24, color: '#ffffff' },
        { type: 'motor', x: 30, y: 80, w: 130, h: 130, label: 'M1', tag: 'O:0/0' },
        { type: 'ind', x: 190, y: 86, w: 170, h: 64, label: 'MOTOR', tag: 'O:0/0', onText: 'RUNNING', offText: 'STOPPED', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' },
        { type: 'num', x: 390, y: 86, w: 170, h: 64, label: 'STARTS', tag: 'C5:0.ACC', units: '', scale: 1, dec: 0 },
        { type: 'num', x: 590, y: 86, w: 180, h: 64, label: 'RUN TIME', tag: 'T4:0.ACC', units: 's', scale: 1, dec: 0 },
        { type: 'pb', x: 190, y: 180, w: 170, h: 80, label: 'START', tag: 'B3:0/0', mode: 'momentary', color: '#2fa84f' },
        { type: 'pb', x: 390, y: 180, w: 170, h: 80, label: 'STOP', tag: 'B3:0/1', mode: 'momentary', color: '#d33a2c' },
        { type: 'pb', x: 590, y: 180, w: 180, h: 80, label: 'RESET COUNTS', tag: 'B3:0/2', mode: 'momentary', color: '#7a7770' },
        { type: 'lamp', x: 40, y: 290, w: 90, h: 100, label: 'OL OK', tag: 'I:0/2', onColor: '#2fa84f', offColor: '#3a3833' },
        { type: 'lamp', x: 150, y: 290, w: 90, h: 100, label: 'STOP PB', tag: 'I:0/1', onColor: '#2fa84f', offColor: '#3a3833' },
        { type: 'alarm', x: 260, y: 300, w: 510, h: 56, label: 'MOTOR OVERLOAD TRIPPED — reset F1', tag: 'B3:0/15' },
      ]);
    },
  };

  /* The HMI shows what the motor really does: KM1's own 13-14 is wired back to a PLC input. The coil is fed after QF1 and through
     F1 95-96 (hardwired), so a main breaker that is off, a tripped overload or a contactor that does not close shows "not running";
     commanded and not running (or running without a command) for 2 s latches a discrepancy alarm. */
  EX.plcfeedback = {
    title: 'PLC motor with running feedback + HMI', desc: 'DOL motor run by the PLC with real feedback: F1 95-96 hardwired in the coil circuit, the coil fed after QF1, KM1 13-14 to input I:0/3. The HMI shows the real running status, not the command, and a discrepancy alarm (commanded but not running, or running without a command) stops the motor until RESET.',
    build() {
      const B = builder();
      const { q0, qf1, km1, f1 } = powerColumn(B, true);
      const qf2 = B.add('mcb2', 300, 150, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 110], [320, 110]]);
      B.w(q0, 'N', qf2, '3', C.N, [[150, 120], [350, 120]]);
      const plc = B.add('plc', 300, 560, { label: 'PLC' });
      B.w(qf2, '2', plc, 'L1', C.L1); B.w(qf2, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      const s1 = B.add('pb_no', 440, 300, { label: 'S1', color: 'green', text: 'START' });
      const s0 = B.add('pb_nc', 520, 300, { label: 'S0', color: 'red', text: 'STOP' });
      const h1 = B.add('lamp', 620, 310, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 690, 310, { label: 'H2', color: 'red', coil: '230VAC' });
      B.w(plc, 'V24', s1, '13', C.DC);
      B.w(s1, '13', s0, '11', C.DC, [[455, 412], [535, 412]]);
      B.w(s1, '14', plc, 'I0', C.DC);
      B.w(s0, '12', plc, 'I1', C.DC);
      // feedback: F1 97-98 (closes on trip) to I:0/2, KM1 13-14 (closed = contactor in) to I:0/3
      B.w(plc, 'V24', f1, '97', C.DC, [[390, 516], [175, 516]]);
      B.w(f1, '98', plc, 'I2', C.DC, [[190, 500], [250, 500], [250, 530], [518, 530]]);
      B.w(plc, 'V24', km1, '13', C.DC, [[390, 290], [142, 290]]);
      B.w(km1, '14', plc, 'I3', C.DC, [[142, 470], [262, 470], [262, 538], [540, 538]]);
      // coil circuit: L1 after QF1 → PLC output contact O0 → F1 95-96 → KM1 A1-A2 → N
      B.w(qf1, '2', plc, 'VAC0', C.AC, [[75, 280], [280, 280], [280, 772], [320, 772]]);
      B.w(plc, 'O0', f1, '95', C.AC, [[350, 850], [230, 850], [230, 520], [145, 520]]);
      B.w(f1, '96', km1, 'A1', C.AC, [[160, 508], [24, 508], [24, 300], [60, 300]]);
      B.w(km1, 'A2', plc, 'N', C.N, [[60, 484], [270, 484], [270, 544], [340, 544]]);
      B.w(plc, 'L1', plc, 'VAC1', C.AC);
      B.w(plc, 'O4', h1, 'X1', C.AC, [[438, 800], [760, 800], [760, 420], [633, 420]]);
      B.w(plc, 'O5', h2, 'X1', C.AC, [[460, 810], [770, 810], [770, 430], [703, 430]]);
      B.w(h1, 'X2', h2, 'X2', C.N, [[657, 410], [727, 410]]);
      B.w(h1, 'X2', plc, 'N', C.N, [[657, 450], [600, 450]]);
      return proj('PLC motor with running feedback', B.circ, [
        { comment: 'Start/stop with seal-in. S0 STOP is wired NC (ON when healthy). The command drops on an overload trip (I:0/2) or a discrepancy alarm.', text: 'BST XIC I:0/0 NXB XIC B3:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIO B3:0/1 XIO I:0/2 XIO B3:0/14 OTE O:0/0' },
        { comment: 'Discrepancy: commanded but KM1 13-14 is not closed, or closed without a command, for 2 s', text: 'BST XIC O:0/0 XIO I:0/3 NXB XIO O:0/0 XIC I:0/3 BND TON T4:1 1.0 2 0' },
        { comment: 'Latch the discrepancy alarm (the HMI shows it; RESET clears it)', text: 'XIC T4:1/DN OTL B3:0/14' },
        { comment: 'HMI RESET clears the discrepancy alarm', text: 'XIC B3:0/2 OTU B3:0/14' },
        { comment: 'Run lamp from the feedback, not from the command', text: 'XIC I:0/3 OTE O:0/4' },
        { comment: 'Fault lamp: discrepancy or overload', text: 'BST XIC B3:0/14 NXB XIC I:0/2 BND OTE O:0/5' },
        { comment: 'Overload alarm bit for the HMI', text: 'XIC I:0/2 OTE B3:0/15' },
        { comment: 'Running time in seconds, counted from the feedback (retentive)', text: 'XIC I:0/3 RTO T4:0 1.0 32767 0' },
      ], {
        'I:0/0': 'S1 START PB', 'I:0/1': 'S0 STOP PB (NC)', 'I:0/2': 'F1 OVERLOAD TRIPPED (97-98)', 'I:0/3': 'KM1 RUNNING FEEDBACK (13-14)',
        'O:0/0': 'KM1 RUN COMMAND', 'O:0/4': 'H1 RUN LAMP', 'O:0/5': 'H2 FAULT LAMP',
        'B3:0/0': 'HMI START', 'B3:0/1': 'HMI STOP', 'B3:0/2': 'HMI RESET', 'B3:0/14': 'DISCREPANCY ALARM', 'B3:0/15': 'OL ALARM',
        'T4:0': 'RUN TIME', 'T4:1': 'DISCREPANCY TIME',
      }, [
        { type: 'text', x: 24, y: 16, w: 600, h: 40, label: 'MOTOR M1 — RUNNING FEEDBACK', size: 24, color: '#ffffff' },
        { type: 'motor', x: 30, y: 80, w: 130, h: 130, label: 'M1', tag: 'I:0/3' },
        { type: 'ind', x: 190, y: 86, w: 170, h: 64, label: 'MOTOR', tag: 'I:0/3', onText: 'RUNNING', offText: 'NOT RUNNING', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' },
        { type: 'ind', x: 390, y: 86, w: 170, h: 64, label: 'COMMAND', tag: 'O:0/0', onText: 'ON', offText: 'OFF', onColor: '#2f6fd6', offColor: '#5b5953', shape: 'box' },
        { type: 'num', x: 590, y: 86, w: 180, h: 64, label: 'RUN TIME', tag: 'T4:0.ACC', units: 's', scale: 1, dec: 0 },
        { type: 'pb', x: 190, y: 180, w: 170, h: 80, label: 'START', tag: 'B3:0/0', mode: 'momentary', color: '#2fa84f' },
        { type: 'pb', x: 390, y: 180, w: 170, h: 80, label: 'STOP', tag: 'B3:0/1', mode: 'momentary', color: '#d33a2c' },
        { type: 'pb', x: 590, y: 180, w: 180, h: 80, label: 'RESET', tag: 'B3:0/2', mode: 'momentary', color: '#7a7770' },
        { type: 'alarm', x: 40, y: 290, w: 730, h: 56, label: 'DISCREPANCY — KM1 did not follow the command (check QF1, F1, KM1), then RESET', tag: 'B3:0/14' },
        { type: 'alarm', x: 40, y: 360, w: 730, h: 56, label: 'MOTOR OVERLOAD TRIPPED — reset F1', tag: 'B3:0/15' },
      ]);
    },
  };

  EX.conveyor = {
    title: 'Conveyor batch counter', desc: 'Conveyor motor via KM1, two PNP photo-eyes. Counts boxes at the discharge, stops for 4 s after every batch of 5, infeed jam alarm.',
    build() {
      const B = builder();
      const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
      const qf1 = B.add('mccb3', 55, 150, { label: 'QF1' }, { on: true });
      const km1 = B.add('contactor', 50, 320, { label: 'KM1', coil: '230VAC' });
      const cv = B.add('conveyor', 60, 540, { label: 'CV1' }, { auto: true });
      B.w(q0, 'L1', qf1, '1', C.L1); B.w(q0, 'L2', qf1, '3', C.L2); B.w(q0, 'L3', qf1, '5', C.L3);
      B.w(qf1, '2', km1, '1', C.L1); B.w(qf1, '4', km1, '3', C.L2); B.w(qf1, '6', km1, '5', C.L3);
      B.w(km1, '2', cv, 'U1', C.L1); B.w(km1, '4', cv, 'V1', C.L2); B.w(km1, '6', cv, 'W1', C.L3);
      B.w(q0, 'PE', cv, 'PE', C.PE, [[190, 102], [190, 520], [142, 520]]);
      const qf2 = B.add('mcb2', 500, 380, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 110], [440, 110], [440, 360], [520, 360]]);
      B.w(q0, 'N', qf2, '3', C.N, [[150, 120], [460, 120], [460, 350], [550, 350]]);
      const plc = B.add('plc', 500, 600, { label: 'PLC' });
      B.w(qf2, '2', plc, 'L1', C.L1); B.w(qf2, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      B.w(cv, 'S1BN', plc, 'V24', C.DC, [[200, 500], [590, 500]]);
      B.w(cv, 'S1BU', plc, 'C24', C.DC0, [[240, 508], [612, 508]]);
      B.w(cv, 'S1BK', plc, 'I2', C.DC, [[220, 516], [718, 516]]);
      B.w(cv, 'S2BN', plc, 'V24', C.DC, [[350, 500], [590, 500]]);
      B.w(cv, 'S2BU', plc, 'C24', C.DC0, [[390, 508], [612, 508]]);
      B.w(cv, 'S2BK', plc, 'I3', C.DC, [[370, 524], [740, 524]]);
      const s1 = B.add('pb_no', 620, 380, { label: 'S1', color: 'green', text: 'START' });
      const s0 = B.add('pb_nc', 700, 380, { label: 'S0', color: 'red', text: 'STOP' });
      const h1 = B.add('lamp', 800, 390, { label: 'H1', color: 'amber', coil: '24VDC' });
      B.w(plc, 'V24', s1, '13', C.DC);
      B.w(s1, '13', s0, '11', C.DC, [[635, 492], [715, 492]]);
      B.w(s1, '14', plc, 'I0', C.DC);
      B.w(s0, '12', plc, 'I1', C.DC);
      B.w(plc, 'O4', h1, 'X1', C.DC, [[690, 836], [960, 836], [960, 500], [813, 500]]);
      B.w(h1, 'X2', plc, 'C24', C.DC0, [[837, 560], [612, 560]]);
      B.w(plc, 'V24', plc, 'VAC1', C.DC, [[590, 566], [480, 566], [480, 850], [660, 850]]);
      B.w(qf2, '2', plc, 'VAC0', C.AC, [[470, 492], [470, 830], [520, 830]]);
      B.w(plc, 'O0', km1, 'A1', C.AC, [[550, 870], [24, 870], [24, 300], [60, 300]]);
      B.w(km1, 'A2', plc, 'N', C.N, [[60, 484], [456, 484], [456, 540]]);
      return proj('Conveyor batch counter', B.circ, [
        { comment: 'System run latch (field or HMI start). S0 STOP is NC.', text: 'BST XIC I:0/0 NXB XIC B3:0/0 NXB XIC B3:0/10 BND XIC I:0/1 XIO B3:0/1 OTE B3:0/10' },
        { comment: 'Conveyor runs while system is on, except during the batch pause', text: 'XIC B3:0/10 XIO C5:0/DN OTE O:0/0' },
        { comment: 'Count boxes leaving the conveyor (B2 discharge eye)', text: 'XIC I:0/3 ONS B3:1/0 CTU C5:0 5 0' },
        { comment: 'Batch complete lamp', text: 'XIC C5:0/DN OTE O:0/4' },
        { comment: 'Pause 4 s, then start the next batch', text: 'XIC C5:0/DN TON T4:0 1.0 4 0' },
        { text: 'XIC T4:0/DN RES C5:0' },
        { comment: 'Total boxes produced', text: 'XIC I:0/3 ONS B3:1/1 ADD N7:0 1 N7:0' },
        { comment: 'Jam alarm: infeed eye blocked for 6 s while running', text: 'XIC O:0/0 XIC I:0/2 TON T4:1 1.0 6 0' },
        { text: 'XIC T4:1/DN OTE B3:0/14' },
        { comment: 'HMI reset total', text: 'XIC B3:0/2 CLR N7:0' },
      ], {
        'I:0/0': 'S1 START PB', 'I:0/1': 'S0 STOP PB (NC)', 'I:0/2': 'B1 INFEED EYE', 'I:0/3': 'B2 DISCHARGE EYE',
        'O:0/0': 'KM1 CONVEYOR', 'O:0/4': 'H1 BATCH DONE', 'B3:0/10': 'SYSTEM RUN', 'B3:0/0': 'HMI START', 'B3:0/1': 'HMI STOP', 'B3:0/2': 'HMI RESET',
        'B3:0/14': 'JAM ALARM', 'C5:0': 'BATCH COUNT', 'T4:0': 'BATCH PAUSE', 'T4:1': 'JAM TIMER', 'N7:0': 'TOTAL BOXES',
      }, [
        { type: 'text', x: 24, y: 16, w: 560, h: 40, label: 'CONVEYOR CV1 — BATCHING', size: 24, color: '#ffffff' },
        { type: 'motor', x: 30, y: 80, w: 120, h: 120, label: 'CONVEYOR', tag: 'O:0/0' },
        { type: 'ind', x: 180, y: 80, w: 170, h: 64, label: 'SYSTEM', tag: 'B3:0/10', onText: 'RUNNING', offText: 'STOPPED', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' },
        { type: 'num', x: 370, y: 80, w: 130, h: 64, label: 'BATCH', tag: 'C5:0.ACC' },
        { type: 'entry', x: 520, y: 80, w: 130, h: 64, label: 'BATCH SIZE', tag: 'C5:0.PRE', min: 1, max: 99 },
        { type: 'num', x: 670, y: 80, w: 110, h: 64, label: 'TOTAL', tag: 'N7:0' },
        { type: 'pb', x: 180, y: 170, w: 150, h: 76, label: 'START', tag: 'B3:0/0', mode: 'momentary', color: '#2fa84f' },
        { type: 'pb', x: 350, y: 170, w: 150, h: 76, label: 'STOP', tag: 'B3:0/1', mode: 'momentary', color: '#d33a2c' },
        { type: 'pb', x: 520, y: 170, w: 150, h: 76, label: 'RESET TOTAL', tag: 'B3:0/2', mode: 'momentary', color: '#7a7770' },
        { type: 'lamp', x: 40, y: 270, w: 80, h: 96, label: 'B1', tag: 'I:0/2', onColor: '#f2c230', offColor: '#3a3833' },
        { type: 'lamp', x: 130, y: 270, w: 80, h: 96, label: 'B2', tag: 'I:0/3', onColor: '#f2c230', offColor: '#3a3833' },
        { type: 'lamp', x: 220, y: 270, w: 80, h: 96, label: 'BATCH', tag: 'O:0/4', onColor: '#f39c1e', offColor: '#3a3833' },
        { type: 'alarm', x: 320, y: 290, w: 450, h: 56, label: 'BOX JAM AT INFEED', tag: 'B3:0/14' },
      ]);
    },
  };

  EX.tank = {
    title: 'Tank level control', desc: 'Fill valve opens below LSL and closes at LSH (OTL/OTU), drain valve on push button or HMI, fill timeout alarm. The consumer outlet is open, so the tank cycles.',
    build() {
      const B = builder();
      const q0 = B.add('supply1', 60, 20, { label: 'Q0' });
      const qf = B.add('mcb2', 60, 150, { label: 'QF1' }, { on: true });
      const plc = B.add('plc', 60, 360, { label: 'PLC' });
      B.w(q0, 'L', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', plc, 'L1', C.L1); B.w(qf, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      const s1 = B.add('sel2', 220, 150, { label: 'S1', text: 'MAN  AUTO' }, { pos: 1 });
      const s2 = B.add('pb_no', 290, 150, { label: 'S2', color: 'blue', text: 'DRAIN' });
      B.w(plc, 'V24', s1, '13', C.DC);
      B.w(s1, '13', s2, '13', C.DC, [[235, 262], [305, 262]]);
      B.w(s1, '14', plc, 'I0', C.DC, [[265, 310], [234, 310]]);
      B.w(s2, '14', plc, 'I3', C.DC, [[335, 318], [300, 318]]);
      const tk = B.add('tank', 620, 160, { label: 'TK1', coil: '24VDC' }, { lvl: 45, use: true });
      B.w(s2, '13', tk, 'H1', C.DC, [[305, 262], [520, 262], [520, 130], [745, 130]]);
      B.w(tk, 'H1', tk, 'L1', C.DC, [[745, 140], [795, 140]]);
      B.w(tk, 'H2', plc, 'I2', C.DC, [[765, 120], [540, 120], [540, 328], [278, 328]]);
      B.w(tk, 'L2', plc, 'I1', C.DC, [[815, 112], [550, 112], [550, 336], [256, 336]]);
      B.w(plc, 'O4', tk, 'FV1', C.DC, [[250, 600], [860, 600], [860, 100], [635, 100]]);
      B.w(plc, 'O5', tk, 'DV1', C.DC, [[272, 610], [870, 610], [870, 92], [685, 92]]);
      B.w(tk, 'FV2', tk, 'DV2', C.DC0, [[655, 144], [705, 144]]);
      B.w(tk, 'DV2', plc, 'C24', C.DC0, [[705, 84], [880, 84], [880, 620], [40, 620], [40, 340], [172, 340]]);
      B.w(plc, 'V24', plc, 'VAC1', C.DC, [[150, 330], [30, 330], [30, 580], [220, 580]]);
      return proj('Tank level control', B.circ, [
        { comment: 'AUTO: open fill valve Y1 when the level drops below LSL', text: 'XIC I:0/0 XIO I:0/1 OTL O:0/4' },
        { comment: 'Close fill valve at high level, or when switched to MAN', text: 'BST XIC I:0/2 NXB XIO I:0/0 BND OTU O:0/4' },
        { comment: 'Drain valve Y2 while S2 or HMI DRAIN is pressed', text: 'BST XIC I:0/3 NXB XIC B3:0/0 BND OTE O:0/5' },
        { comment: 'Count fill cycles', text: 'XIC O:0/4 ONS B3:1/0 CTU C5:0 9999 0' },
        { comment: 'Fill timeout: Y1 open for more than 15 s = alarm', text: 'XIC O:0/4 TON T4:0 1.0 15 0' },
        { text: 'XIC T4:0/DN OTE B3:0/15' },
      ], {
        'I:0/0': 'S1 AUTO SELECTOR', 'I:0/1': 'LSL LOW LEVEL', 'I:0/2': 'LSH HIGH LEVEL', 'I:0/3': 'S2 DRAIN PB',
        'O:0/4': 'Y1 FILL VALVE', 'O:0/5': 'Y2 DRAIN VALVE', 'B3:0/0': 'HMI DRAIN', 'B3:0/15': 'FILL TIMEOUT', 'C5:0': 'FILL CYCLES', 'T4:0': 'FILL TIMER',
      }, [
        { type: 'text', x: 24, y: 16, w: 560, h: 40, label: 'TANK TK1 — LEVEL CONTROL', size: 24, color: '#ffffff' },
        { type: 'ind', x: 30, y: 80, w: 170, h: 64, label: 'MODE', tag: 'I:0/0', onText: 'AUTO', offText: 'MANUAL', onColor: '#2f6fd6', offColor: '#5b5953', shape: 'box' },
        { type: 'ind', x: 220, y: 80, w: 170, h: 64, label: 'Y1 FILL', tag: 'O:0/4', onText: 'OPEN', offText: 'CLOSED', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' },
        { type: 'ind', x: 410, y: 80, w: 170, h: 64, label: 'Y2 DRAIN', tag: 'O:0/5', onText: 'OPEN', offText: 'CLOSED', onColor: '#2fa84f', offColor: '#5b5953', shape: 'box' },
        { type: 'num', x: 600, y: 80, w: 170, h: 64, label: 'FILL CYCLES', tag: 'C5:0.ACC' },
        { type: 'lamp', x: 40, y: 170, w: 90, h: 100, label: 'LSH', tag: 'I:0/2', onColor: '#f2c230', offColor: '#3a3833' },
        { type: 'lamp', x: 140, y: 170, w: 90, h: 100, label: 'LSL', tag: 'I:0/1', onColor: '#f2c230', offColor: '#3a3833' },
        { type: 'num', x: 250, y: 180, w: 170, h: 64, label: 'FILL TIME', tag: 'T4:0.ACC', units: 's' },
        { type: 'pb', x: 440, y: 176, w: 170, h: 76, label: 'DRAIN', tag: 'B3:0/0', mode: 'momentary', color: '#2f6fd6' },
        { type: 'alarm', x: 40, y: 300, w: 730, h: 56, label: 'FILL TIMEOUT — check fill valve Y1', tag: 'B3:0/15' },
      ]);
    },
  };

  /* Star-delta power circuit: Q0 → QM1 → KM1 (main, to U1 V1 W1) + KM2 (delta, to W2 U2 V2) + KM3 (star point) → M1.
     Delta check: U1=L1/U2=L2, V1=L2/V2=L3, W1=L3/W2=L1. KM2 and KM3 together short the phases: QM1 trips. */
  function starDeltaPower(B) {
    const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
    const qm1 = B.add('mpcb', 60, 140, { label: 'QM1', ir: '10' }, { on: true });
    const km1 = B.add('contactor', 40, 340, { label: 'KM1', coil: '230VAC' });
    const km2 = B.add('contactor', 230, 340, { label: 'KM2', coil: '230VAC' });
    const km3 = B.add('contactor', 420, 340, { label: 'KM3', coil: '230VAC' });
    const m1 = B.add('motor6', 40, 640, { label: 'M1' });
    B.w(q0, 'L1', qm1, '1', C.L1); B.w(q0, 'L2', qm1, '3', C.L2); B.w(q0, 'L3', qm1, '5', C.L3);
    B.w(qm1, '2', km1, '1', C.L1); B.w(qm1, '4', km1, '3', C.L2); B.w(qm1, '6', km1, '5', C.L3);
    B.w(qm1, '2', km2, '1', C.L1, [[78, 300], [260, 300]]); B.w(qm1, '4', km2, '3', C.L2, [[100, 310], [280, 310]]); B.w(qm1, '6', km2, '5', C.L3, [[122, 320], [300, 320]]);
    B.w(km1, '2', m1, 'U1', C.L1); B.w(km1, '4', m1, 'V1', C.L2); B.w(km1, '6', m1, 'W1', C.L3);
    B.w(km2, '2', m1, 'W2', C.L1, [[260, 540], [120, 540]]); B.w(km2, '4', m1, 'U2', C.L2, [[280, 560], [140, 560]]); B.w(km2, '6', m1, 'V2', C.L3, [[300, 580], [160, 580]]);
    B.w(m1, 'W2', km3, '1', C.L2, [[120, 600], [450, 600], [450, 320]]); B.w(m1, 'U2', km3, '3', C.L2, [[140, 610], [470, 610], [470, 325]]); B.w(m1, 'V2', km3, '5', C.L2, [[160, 620], [490, 620], [490, 330]]);
    B.w(km3, '2', km3, '4', C.L2); B.w(km3, '4', km3, '6', C.L2);
    B.w(q0, 'PE', m1, 'PE', C.PE, [[180, 110], [560, 110], [560, 680]]);
    const qf2 = B.add('mcb2', 640, 140, { label: 'QF2' }, { on: true });
    B.w(q0, 'L1', qf2, '1', C.L1, [[80, 120], [660, 120]]); B.w(q0, 'N', qf2, '3', C.N, [[150, 130], [690, 130]]);
    return { q0, qm1, km1, km2, km3, m1, qf2 };
  }
  EX.stardelta = {
    title: 'Star-delta starter (hardwired, Electrical Diagram)', desc: 'Star-delta starter drawn in the Electrical Diagram, power and control: QM1 → KM1 → motor Y-Δ with KM2 delta and KM3 star; KA1 start/stop with seal-in, KM1 main, KM3 star, KT1 star time, KA2 changeover, KM2 delta, with KM2/KM3 interlocks. The Diagram wires the control circuit for you.',
    build() {
      // the power circuit is drawn in the Electrical Diagram (feeder QM1 → KM1 → motor Y-Δ with KM2/KM3), which wires it
      const B = builder();
      const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
      const qf2 = B.add('mcb2', 640, 140, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 120], [660, 120]]); B.w(q0, 'N', qf2, '3', C.N, [[150, 130], [690, 130]]);
      B.add('pb_nc', 640, 330, { label: 'S0', color: 'red', text: 'STOP' });
      B.add('pb_no', 720, 330, { label: 'S1', color: 'green', text: 'START' });
      B.add('relay', 800, 330, { label: 'KA1', coil: '230VAC' });
      B.add('timer', 910, 330, { label: 'KT1', coil: '230VAC', t: 5 });
      B.add('relay', 1020, 330, { label: 'KA2', coil: '230VAC' });
      const p = proj('Star-delta starter (hardwired)', B.circ, [{ comment: 'This project is hardwired — no PLC. The control circuit is in the Electrical Diagram tab.', text: '' }]);
      const e = (k, tag) => ({ k, tag });
      p.schematic = {
        L: qf2 + ':2', N: qf2 + ':4',
        rungs: [
          { comment: 'Start/stop: S1 starts KA1, KA1 seals in, S0 stops', elems: [e('pbnc', 'S0'), { k: 'br', legs: [[e('pbno', 'S1')], [e('kano', 'KA1')]] }, e('kacoil', 'KA1')] },
          { comment: 'Main contactor KM1', elems: [e('kano', 'KA1'), e('kmcoil', 'KM1')] },
          { comment: 'Star KM3 (until KA2 changes over, not with KM2) and the star timer KT1', elems: [e('kmno', 'KM1'), { k: 'br', legs: [[e('kanc', 'KA2'), e('kmnc', 'KM2'), e('kmcoil', 'KM3')], [e('ktcoil', 'KT1')]] }] },
          { comment: 'Star time over: changeover relay KA2', elems: [e('ktno', 'KT1'), e('kacoil', 'KA2')] },
          { comment: 'Delta KM2 (not with KM3)', elems: [e('kano', 'KA2'), e('kmnc', 'KM3'), e('kmcoil', 'KM2')] },
        ],
        power: { src: 'Q0', main: [], feeders: [{ elems: [e('qm3', 'QM1'), e('km3', 'KM1'), { k: 'm6', tag: 'M1', delta: 'KM2', star: 'KM3' }] }] },
      };
      return p;
    },
  };
  EX.stardeltaplc = {
    title: 'Star-delta starter (PLC)', desc: 'Star-delta starter run by the PLC: O:0/0 KM1 main, O:0/1 KM3 star, O:0/2 KM2 delta, T4:0 star time; KM2/KM3 also interlocked by their N.C. contacts.',
    build() {
      const B = builder();
      const { qm1, km1, km2, km3, qf2 } = starDeltaPower(B);
      const plc = B.add('plc', 640, 560, { label: 'PLC' });
      const s1 = B.add('pb_no', 760, 330, { label: 'S1', color: 'green', text: 'START' });
      const s0 = B.add('pb_nc', 840, 330, { label: 'S0', color: 'red', text: 'STOP' });
      B.w(qf2, '2', plc, 'L1', C.L1); B.w(qf2, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      B.w(plc, 'V24', s1, '13', C.DC); B.w(s1, '13', s0, '11', C.DC, [[775, 440], [855, 440]]);
      B.w(s1, '14', plc, 'I0', C.DC); B.w(s0, '12', plc, 'I1', C.DC);
      B.w(plc, 'V24', qm1, '13', C.DC, [[730, 530], [620, 530], [620, 126], [146, 126]]); B.w(qm1, '14', plc, 'I2', C.DC, [[146, 290], [600, 290], [600, 540], [858, 540]]);
      B.w(plc, 'L1', plc, 'VAC0', C.AC, [[630, 548], [630, 780], [660, 780]]);
      B.w(plc, 'O0', km1, 'A1', C.AC, [[690, 800], [20, 800], [20, 330], [50, 330]]);
      B.w(plc, 'O1', km2, '21', C.AC, [[712, 810], [380, 810], [380, 320], [340, 320]]);
      B.w(km2, '22', km3, 'A1', C.AC, [[340, 500], [410, 500], [410, 326], [430, 326]]);
      B.w(plc, 'O2', km3, '21', C.AC, [[734, 820], [580, 820], [580, 315], [530, 315]]);
      B.w(km3, '22', km2, 'A1', C.AC, [[530, 495], [220, 495], [220, 328], [240, 328]]);
      B.w(km1, 'A2', km2, 'A2', C.N); B.w(km2, 'A2', km3, 'A2', C.N); B.w(km3, 'A2', plc, 'N', C.N, [[430, 520], [740, 520]]);
      return proj('Star-delta starter (PLC)', B.circ, [
        { comment: 'Start/stop with seal-in. S0 STOP is N.C. and QM1 aux 13-14 is closed while QM1 is ON → both XIC.', text: 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 XIC I:0/2 OTE O:0/0' },
        { comment: 'Star time', text: 'XIC O:0/0 TON T4:0 1.0 5 0' },
        { comment: 'Star KM3 until the star time is over, never with delta', text: 'XIC O:0/0 XIO T4:0/DN XIO O:0/2 OTE O:0/1' },
        { comment: 'Delta KM2 after the star time, never with star', text: 'XIC O:0/0 XIC T4:0/DN XIO O:0/1 OTE O:0/2' },
      ], {
        'I:0/0': 'S1 START PB', 'I:0/1': 'S0 STOP PB (NC)', 'I:0/2': 'QM1 MOTOR BREAKER ON',
        'O:0/0': 'KM1 MAIN', 'O:0/1': 'KM3 STAR', 'O:0/2': 'KM2 DELTA', 'T4:0': 'STAR TIME',
      });
    },
  };
  EX.fwdrev = {
    title: 'Forward / reverse (PLC)', desc: 'Reversing starter: KM1 forward, KM2 reverse (L1 and L3 swapped). Interlocked twice: in the ladder and by the contactors\' N.C. contacts. Press STOP before changing direction.',
    build() {
      const B = builder();
      const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
      const qm1 = B.add('mpcb', 60, 140, { label: 'QM1', ir: '6.3' }, { on: true });
      const km1 = B.add('contactor', 40, 340, { label: 'KM1', coil: '230VAC' });
      const km2 = B.add('contactor', 230, 340, { label: 'KM2', coil: '230VAC' });
      const m1 = B.add('motor', 90, 640, { label: 'M1' });
      B.w(q0, 'L1', qm1, '1', C.L1); B.w(q0, 'L2', qm1, '3', C.L2); B.w(q0, 'L3', qm1, '5', C.L3);
      B.w(qm1, '2', km1, '1', C.L1); B.w(qm1, '4', km1, '3', C.L2); B.w(qm1, '6', km1, '5', C.L3);
      B.w(qm1, '2', km2, '5', C.L1, [[78, 320], [300, 320]]); B.w(qm1, '4', km2, '3', C.L2, [[100, 310], [280, 310]]); B.w(qm1, '6', km2, '1', C.L3, [[122, 300], [260, 300]]);
      B.w(km1, '2', m1, 'U1', C.L1); B.w(km1, '4', m1, 'V1', C.L2); B.w(km1, '6', m1, 'W1', C.L3);
      B.w(km2, '2', m1, 'U1', C.L3, [[260, 560], [120, 560]]); B.w(km2, '4', m1, 'V1', C.L2, [[280, 570], [140, 570]]); B.w(km2, '6', m1, 'W1', C.L1, [[300, 580], [160, 580]]);
      B.w(q0, 'PE', m1, 'PE', C.PE, [[180, 110], [420, 110], [420, 620], [190, 620]]);
      const qf2 = B.add('mcb2', 640, 140, { label: 'QF2' }, { on: true });
      B.w(q0, 'L1', qf2, '1', C.L1, [[80, 120], [660, 120]]); B.w(q0, 'N', qf2, '3', C.N, [[150, 130], [690, 130]]);
      const plc = B.add('plc', 640, 560, { label: 'PLC' });
      const s1 = B.add('pb_no', 640, 330, { label: 'S1', color: 'green', text: 'FWD' });
      const s2 = B.add('pb_no', 720, 330, { label: 'S2', color: 'blue', text: 'REV' });
      const s0 = B.add('pb_nc', 800, 330, { label: 'S0', color: 'red', text: 'STOP' });
      B.w(qf2, '2', plc, 'L1', C.L1); B.w(qf2, '4', plc, 'N', C.N);
      B.w(plc, 'C24', plc, 'COM', C.DC0);
      B.w(plc, 'V24', s1, '13', C.DC); B.w(s1, '13', s2, '13', C.DC, [[655, 440], [735, 440]]); B.w(s2, '13', s0, '11', C.DC, [[735, 440], [815, 440]]);
      B.w(s1, '14', plc, 'I0', C.DC); B.w(s2, '14', plc, 'I1', C.DC); B.w(s0, '12', plc, 'I2', C.DC);
      B.w(plc, 'V24', qm1, '13', C.DC, [[730, 530], [620, 530], [620, 126], [146, 126]]); B.w(qm1, '14', plc, 'I3', C.DC, [[146, 290], [600, 290], [600, 540], [880, 540]]);
      B.w(plc, 'L1', plc, 'VAC0', C.AC, [[630, 548], [630, 780], [660, 780]]);
      B.w(plc, 'O0', km2, '21', C.AC, [[690, 800], [380, 800], [380, 320], [340, 320]]);
      B.w(km2, '22', km1, 'A1', C.AC, [[340, 500], [20, 500], [20, 330], [50, 330]]);
      B.w(plc, 'O1', km1, '21', C.AC, [[712, 810], [200, 810], [200, 320], [150, 320]]);
      B.w(km1, '22', km2, 'A1', C.AC, [[150, 510], [220, 510], [220, 328], [240, 328]]);
      B.w(km1, 'A2', km2, 'A2', C.N); B.w(km2, 'A2', plc, 'N', C.N, [[240, 520], [740, 520]]);
      return proj('Forward / reverse (PLC)', B.circ, [
        { comment: 'Forward: FWD starts and seals in; STOP (N.C.) and QM1 ON allow it; blocked while reversing (press STOP first)', text: 'BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/2 XIC I:0/3 XIO O:0/1 OTE O:0/0' },
        { comment: 'Reverse: the mirror of forward', text: 'BST XIC I:0/1 NXB XIC O:0/1 BND XIC I:0/2 XIC I:0/3 XIO O:0/0 OTE O:0/1' },
      ], {
        'I:0/0': 'S1 FORWARD PB', 'I:0/1': 'S2 REVERSE PB', 'I:0/2': 'S0 STOP PB (NC)', 'I:0/3': 'QM1 MOTOR BREAKER ON',
        'O:0/0': 'KM1 FORWARD', 'O:0/1': 'KM2 REVERSE',
      });
    },
  };

  EX.threemotors = {
    title: 'Three motors (IEC Electrical Diagram)', desc: 'Three DOL motors drawn the IEC way: main breaker Q4, motor feeders Q1-Q3 → KM1-KM3 → F1-F3 → M1-M3, and the control current paths with stop/start, seal-in, run lamps and pilot lamps. The diagram wires everything in the Wiring for you.',
    build() {
      const B = builder();
      const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
      const q4 = B.add('mccb3', 60, 140, { label: 'Q4' }, { on: true });
      B.add('lamp', 900, 40, { label: 'H7', color: 'blue', coil: '230VAC' });
      const p = proj('Three motors (IEC diagram)', B.circ, [{ comment: 'This project is hardwired — no PLC. See the Electrical Diagram tab.', text: '' }]);
      const e = (k, tag) => ({ k, tag });
      const motor = n => ({ comment: `Motor M${n}: stop S${n}, start S${n + 4}, seal-in KM${n} 13-14, overload F${n}, run lamp H${n}`,
        elems: [e('olnc', 'F' + n), e('pbnc', 'S' + n), { k: 'br', legs: [[e('pbno', 'S' + (n + 4))], [e('kmno', 'KM' + n)]] }, { k: 'br', legs: [[e('kmcoil', 'KM' + n)], [e('lamp', 'H' + n)]] }] });
      p.schematic = {
        L: q4 + ':2', N: q0 + ':N',
        rungs: [motor(1), motor(2), motor(3),
          { comment: 'Pilot lamp test', elems: [e('pbno', 'S8'), e('lamp', 'H4')] },
          { comment: 'Pilot lamp test', elems: [e('pbno', 'S9'), e('lamp', 'H5')] },
          { comment: 'Pilot lamp test', elems: [e('pbno', 'S11'), e('lamp', 'H6')] },
          { comment: 'Control voltage present', elems: [e('lamp', 'H7')] }],
        power: { src: 'Q0', main: [e('qf3', 'Q4')], feeders: [1, 2, 3].map(n => ({ elems: [e('qm3', 'Q' + n), e('km3', 'KM' + n), e('ol3', 'F' + n), e('m3', 'M' + n)] })) },
      };
      return p;
    },
  };

  EX.rack = {
    title: 'Modular PLC rack (PSU, CPU, I/O cards)', desc: 'Rack power supply, CPU in slot 0, a 24 VDC input card in slot 1 and a relay output card in slot 2 on a DIN rail. START/STOP with a seal-in: addresses follow the slots (I:1/0, O:2/0).',
    build() {
      const B = builder();
      const q0 = B.add('supply1', 60, 20, { label: 'Q0' });
      const qf = B.add('mcb2', 220, 20, { label: 'QF1' }, { on: true });
      B.add('din', 50, 252, { label: 'RAIL1', len: '600' });
      const ps = B.add('mpsu', 60, 190, { label: 'PS1' });
      B.add('mcpu', 170, 190, { label: 'CPU1' });
      const di = B.add('mdi8', 300, 190, { label: 'DI1', slot: '1' });
      const dq = B.add('mdo8', 500, 190, { label: 'DO1', slot: '2' });
      B.w(q0, 'L', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', ps, 'L1', C.L1); B.w(qf, '4', ps, 'N', C.N); B.w(q0, 'PE', ps, 'PE', C.PE);
      const s1 = B.add('pb_no', 330, 20, { label: 'S1', color: 'green', text: 'START' });
      const s2 = B.add('pb_nc', 400, 20, { label: 'S2', color: 'red', text: 'STOP' });
      B.w(ps, 'V24', s1, '13', C.DC); B.w(s1, '13', s2, '11', C.DC);
      B.w(s1, '14', di, 'I0', C.DC); B.w(s2, '12', di, 'I1', C.DC); B.w(ps, 'C24', di, 'COM', C.DC0);
      const h1 = B.add('lamp', 520, 430, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 590, 430, { label: 'H2', color: 'red', coil: '230VAC' });
      B.w(qf, '2', dq, 'VAC0', C.AC); B.w(dq, 'O0', h1, 'X1', C.AC); B.w(dq, 'O1', h2, 'X1', C.AC);
      B.w(h1, 'X2', h2, 'X2', C.N); B.w(h2, 'X2', qf, '4', C.N);
      return proj('Modular PLC rack', B.circ, [
        { text: 'BST XIC I:1/0 NXB XIC O:2/0 BND XIC I:1/1 OTE O:2/0', comment: 'START (I:1/0) with seal-in, STOP (N.C., I:1/1) — run lamp on the relay card in slot 2' },
        { text: 'XIO O:2/0 OTE O:2/1', comment: 'Stopped lamp' },
      ], { 'I:1/0': 'START', 'I:1/1': 'STOP (N.C.)', 'O:2/0': 'RUN lamp', 'O:2/1': 'STOPPED lamp' }, [], { slots: { 1: 'mdi8', 2: 'mdo8' } });
    },
  };

  /* the same machine in a 1756-style chassis, programmed as with real software: Realistic connection, an engineering PC
     wired to the controller's USB port, Who Active → Set Project Path → Download */
  EX.chassis = {
    title: '1756-style chassis: Who Active and Download', desc: 'A 7-slot chassis with power supply, controller (slot 0), a 16-input module (slot 1) and a 16-relay-output module (slot 2), and an engineering PC on the controller’s USB port. Start the PC’s comms driver, then in the Ladder: Who Active → Set Project Path → Download, and RUN. Tag-based addresses (Local:1:I.Data.0) and alias tags.',
    build() {
      const B = builder();
      const q0 = B.add('supply1', 60, 20, { label: 'Q0' });
      const qf = B.add('mcb2', 220, 20, { label: 'QF1' }, { on: true });
      B.add('chassis', 50, 150, { label: 'RACK1', slots: '7' });
      const ps = B.add('mpsu', 60, 202, { label: 'PS1' });
      const cpu = B.add('mcpu', 152, 202, { label: 'CPU1' });
      const di = B.add('mdi16', 226, 202, { label: 'DI1', slot: '1' });
      const dq = B.add('mdo16', 300, 202, { label: 'DO1', slot: '2' });
      const pc = B.add('epc', 120, 620, { label: 'PC1' });
      B.w(q0, 'L', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', ps, 'L1', C.L1); B.w(qf, '4', ps, 'N', C.N); B.w(q0, 'PE', ps, 'PE', C.PE);
      B.w(pc, 'USB', cpu, 'PRG', C.DC0);
      const s1 = B.add('pb_no', 760, 20, { label: 'S1', color: 'green', text: 'START' });
      const s2 = B.add('pb_nc', 840, 20, { label: 'S2', color: 'red', text: 'STOP' });
      B.w(ps, 'V24', s1, '13', C.DC); B.w(s1, '13', s2, '11', C.DC);
      B.w(s1, '14', di, 'I0', C.DC); B.w(s2, '12', di, 'I1', C.DC); B.w(ps, 'C24', di, 'COM', C.DC0);
      const h1 = B.add('lamp', 760, 560, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 840, 560, { label: 'H2', color: 'red', coil: '230VAC' });
      B.w(qf, '2', dq, 'VAC0', C.AC); B.w(dq, 'O0', h1, 'X1', C.AC); B.w(dq, 'O1', h2, 'X1', C.AC);
      B.w(h1, 'X2', h2, 'X2', C.N); B.w(h2, 'X2', qf, '4', C.N);
      const p = proj('1756-style chassis', B.circ, [
        { text: 'BST XIC START_PB NXB XIC RUN_LAMP BND XIC STOP_PB OTE RUN_LAMP', comment: 'START with seal-in, STOP (N.C.) — alias tags on the modules’ data' },
        { text: 'XIO RUN_LAMP OTE STOPPED_LAMP', comment: 'Stopped lamp' },
      ], {}, [], { slots: { 1: 'mdi16', 2: 'mdo16' }, chassis: '7' });
      p.target = 'tag'; p.addr = 'tag'; p.conn = { mode: 'real' };
      p.tags = [{ name: 'START_PB', type: 'ALIAS', addr: 'I:1/0', desc: 'START' }, { name: 'STOP_PB', type: 'ALIAS', addr: 'I:1/1', desc: 'STOP (N.C.)' },
        { name: 'RUN_LAMP', type: 'ALIAS', addr: 'O:2/0', desc: 'Run lamp' }, { name: 'STOPPED_LAMP', type: 'ALIAS', addr: 'O:2/1', desc: 'Stopped lamp' }];
      return p;
    },
  };

  EX.analog = {
    title: 'Analog: tank level transmitter and VFD pump', desc: 'Modular PLC with an analog input card (level transmitter LT1 on tank TK1, 4–20 mA) and an analog output card (0–10 V speed reference to a VFD). The fill valve keeps the level between 30 % and 80 %; with S1 on, the pump runs at a speed that follows the level.',
    build() {
      const B = builder();
      const q0 = B.add('supply3', 60, 20, { label: 'Q0' });
      const qf = B.add('mcb2', 200, 20, { label: 'QF1' }, { on: true });
      B.add('din', 50, 252, { label: 'RAIL1', len: '1000' });
      const ps = B.add('mpsu', 60, 190, { label: 'PS1' });
      B.add('mcpu', 170, 190, { label: 'CPU1' });
      const di = B.add('mdi8', 300, 190, { label: 'DI1', slot: '1' });
      const dq = B.add('mdo8', 500, 190, { label: 'DO1', slot: '2' });
      const ai = B.add('mai4', 720, 190, { label: 'AI1', slot: '3' });
      const ao = B.add('mao2', 880, 190, { label: 'AO1', slot: '4' });
      B.w(q0, 'L1', qf, '1', C.L1); B.w(q0, 'N', qf, '3', C.N);
      B.w(qf, '2', ps, 'L1', C.L1); B.w(qf, '4', ps, 'N', C.N); B.w(q0, 'PE', ps, 'PE', C.PE);
      const s1 = B.add('sel2', 330, 20, { label: 'S1', text: 'PUMP' });
      B.w(ps, 'V24', s1, '13', C.DC); B.w(s1, '14', di, 'I0', C.DC); B.w(ps, 'C24', di, 'COM', C.DC0);
      const tk = B.add('tank', 720, 470, { label: 'TK1', coil: '24VDC' }, { lvl: 40, use: true });
      const lt = B.add('ltx', 980, 470, { label: 'LT1', tank: 'TK1' });
      B.w(ps, 'V24', dq, 'VAC0', C.DC); B.w(dq, 'O0', tk, 'FV1', C.DC); B.w(tk, 'FV2', ps, 'C24', C.DC0);
      B.w(ps, 'V24', lt, 'P', C.DC); B.w(lt, 'M', ps, 'C24', C.DC0); B.w(lt, 'OUT', ai, 'CH0', C.DC); B.w(ai, 'COM', ps, 'C24', C.DC0);
      const vfd = B.add('vfd', 300, 470, { label: 'VFD1' });
      const m1 = B.add('motor', 300, 760, { label: 'M1' });
      B.w(q0, 'L1', vfd, 'L1', C.L1); B.w(q0, 'L2', vfd, 'L2', C.L2); B.w(q0, 'L3', vfd, 'L3', C.L3); B.w(q0, 'PE', vfd, 'PE', C.PE);
      B.w(vfd, 'U', m1, 'U1', C.L1); B.w(vfd, 'V', m1, 'V1', C.L2); B.w(vfd, 'W', m1, 'W1', C.L3); B.w(vfd, 'PE', m1, 'PE', C.PE);
      B.w(dq, 'O1', vfd, 'FWD', C.DC); B.w(vfd, 'DCOM', ps, 'C24', C.DC0);
      B.w(ao, 'AO0', vfd, 'AI', C.DC); B.w(ao, 'COM', vfd, 'ACOM', C.DC0);
      return proj('Analog tank and VFD pump', B.circ, [
        { text: 'BST LES I:3.0 6554 NXB XIC O:2/0 BND LES I:3.0 24576 OTE O:2/0', comment: 'Fill valve: opens below 30 % (I:3.0 < 6554 = 4 + 0.3·16 mA) and closes at 80 % (24576)' },
        { text: 'XIC I:1/0 OTE O:2/1', comment: 'Pump: VFD FWD while S1 is on' },
        { text: 'MOV I:3.0 O:4.0', comment: 'Pump speed follows the level: 0–100 % → 0–10 V → 0–60 Hz' },
      ], { 'I:1/0': 'PUMP S1', 'O:2/0': 'FILL VALVE', 'O:2/1': 'VFD FWD', 'I:3.0': 'LEVEL LT1', 'O:4.0': 'VFD SPEED' }, [], { slots: { 1: 'mdi8', 2: 'mdo8', 3: 'mai4', 4: 'mao2' } });
    },
  };

  EX.cabinet = {
    title: 'Motor starter cabinet (modular PLC, door with HMI)', desc: 'A 2D control cabinet: inside, DIN rails and cable ducts with breakers, the modular PLC, contactor, overload and terminal block; on the door, START/STOP, pilot lamps and an HMI terminal that runs the HMI screen.',
    build() {
      const B = builder();
      const q0 = B.add('supply3', 60, -200, { label: 'Q0' });
      B.add('encl', 0, 0, { label: '+CP1', w: '1200', h: '800', title: 'CONTROL CABINET +CP1' });
      B.add('duct', 40, 60, { label: 'WD1', len: '1000' });
      B.add('din', 40, 260, { label: 'RAIL1', len: '1000' });
      B.add('duct', 40, 380, { label: 'WD2', len: '1000' });
      B.add('din', 40, 540, { label: 'RAIL2', len: '600' });
      B.add('duct', 40, 700, { label: 'WD3', len: '1000' });
      const qf1 = B.add('mccb3', 50, 218, { label: 'QF1' }, { on: true });
      const qf2 = B.add('mcb2', 160, 228, { label: 'QF2' }, { on: true });
      const ps = B.add('mpsu', 250, 198, { label: 'PS1' });
      B.add('mcpu', 360, 198, { label: 'CPU1' });
      const di = B.add('mdi8', 490, 198, { label: 'DI1', slot: '1' });
      const dq = B.add('mdo8', 690, 198, { label: 'DO1', slot: '2' });
      const km = B.add('contactor', 60, 488, { label: 'KM1', coil: '230VAC' });
      const f1 = B.add('olr', 220, 503, { label: 'F1' });
      const x1 = B.add('tb5', 420, 518, { label: 'X1' });
      const m1 = B.add('motor', 400, 880, { label: 'M1' });
      B.add('door', 1300, 0, { label: '+CD1', w: '600', h: '800', title: 'MOTOR M1' });
      const hmi = B.add('hmiterm', 1450, 90, { label: 'HMI1' });
      const s1 = B.add('pb_no', 1380, 420, { label: 'S1', color: 'green', text: 'START' });
      const s0 = B.add('pb_nc', 1470, 420, { label: 'S0', color: 'red', text: 'STOP' });
      const h1 = B.add('lamp', 1580, 425, { label: 'H1', color: 'green', coil: '230VAC' });
      const h2 = B.add('lamp', 1660, 425, { label: 'H2', color: 'amber', coil: '230VAC' });
      // power circuit
      B.w(q0, 'L1', qf1, '1', C.L1); B.w(q0, 'L2', qf1, '3', C.L2); B.w(q0, 'L3', qf1, '5', C.L3);
      B.w(qf1, '2', km, '1', C.L1); B.w(qf1, '4', km, '3', C.L2); B.w(qf1, '6', km, '5', C.L3);
      B.w(km, '2', f1, '1', C.L1); B.w(km, '4', f1, '3', C.L2); B.w(km, '6', f1, '5', C.L3);
      B.w(f1, '2', x1, 'L1', C.L1); B.w(f1, '4', x1, 'L2', C.L2); B.w(f1, '6', x1, 'L3', C.L3);
      B.w(x1, 'L1b', m1, 'U1', C.L1); B.w(x1, 'L2b', m1, 'V1', C.L2); B.w(x1, 'L3b', m1, 'W1', C.L3);
      B.w(q0, 'PE', x1, 'PE', C.PE); B.w(x1, 'PEb', m1, 'PE', C.PE);
      // control supply and PLC power
      B.w(q0, 'L1', qf2, '1', C.L1); B.w(q0, 'N', qf2, '3', C.N);
      B.w(qf2, '2', ps, 'L1', C.L1); B.w(qf2, '4', ps, 'N', C.N); B.w(q0, 'PE', ps, 'PE', C.PE);
      // inputs: START, STOP (N.C.), overload 95-96 (N.C.)
      B.w(ps, 'V24', s1, '13', C.DC); B.w(s1, '14', di, 'I0', C.DC);
      B.w(ps, 'V24', s0, '11', C.DC); B.w(s0, '12', di, 'I1', C.DC);
      B.w(ps, 'V24', f1, '95', C.DC); B.w(f1, '96', di, 'I2', C.DC);
      B.w(ps, 'C24', di, 'COM', C.DC0);
      // outputs: contactor coil, run lamp, trip lamp
      B.w(qf2, '2', dq, 'VAC0', C.AC);
      B.w(dq, 'O0', km, 'A1', C.AC); B.w(km, 'A2', qf2, '4', C.N);
      B.w(dq, 'O1', h1, 'X1', C.AC); B.w(h1, 'X2', qf2, '4', C.N);
      B.w(dq, 'O2', h2, 'X1', C.AC); B.w(h2, 'X2', qf2, '4', C.N);
      // HMI terminal on 24 VDC
      B.w(ps, 'V24', hmi, 'P', C.DC); B.w(ps, 'C24', hmi, 'M', C.DC0);
      return proj('Motor starter cabinet', B.circ, [
        { text: 'BST XIC I:1/0 NXB XIC B3:0/0 NXB XIC O:2/0 BND XIC I:1/1 XIO B3:0/1 XIC I:1/2 OTE O:2/0', comment: 'START (door or HMI) with seal-in; STOP (door N.C. or HMI) and the overload 95-96 (N.C.) stop it' },
        { text: 'XIC O:2/0 OTE O:2/1', comment: 'Run lamp on the door' },
        { text: 'XIO I:1/2 OTE O:2/2', comment: 'Overload tripped lamp on the door' },
      ], { 'I:1/0': 'START', 'I:1/1': 'STOP (N.C.)', 'I:1/2': 'OVERLOAD (N.C.)', 'B3:0/0': 'HMI START', 'B3:0/1': 'HMI STOP', 'O:2/0': 'KM1 MOTOR', 'O:2/1': 'RUN LAMP', 'O:2/2': 'TRIP LAMP' }, [
        { type: 'text', x: 30, y: 20, w: 400, h: 40, label: 'MOTOR M1', size: 26 },
        { type: 'motor', x: 560, y: 40, w: 160, h: 160, label: 'M1', tag: 'O:2/0' },
        { type: 'ind', x: 30, y: 90, w: 220, h: 80, label: 'MOTOR', tag: 'O:2/0', onText: 'RUNNING', offText: 'STOPPED' },
        { type: 'pb', x: 30, y: 240, w: 200, h: 90, label: 'START', tag: 'B3:0/0', color: '#2fa84f' },
        { type: 'pb', x: 270, y: 240, w: 200, h: 90, label: 'STOP', tag: 'B3:0/1', color: '#d33a2c' },
        { type: 'alarm', x: 30, y: 380, w: 740, h: 60, label: 'OVERLOAD TRIPPED', tag: 'O:2/2' },
      ], { slots: { 1: 'mdi8', 2: 'mdo8' } });
    },
  };

  EX.blank = {
    title: 'Empty project', desc: 'Start from scratch: empty workspace and program.',
    build: () => proj('Untitled', { comps: [], wires: [], seq: 0 }, []),
  };

  /* ---------- Lessons ---------- */
  const LESSONS = [
    {
      id: 'l1', level: 'Basics', title: '1 · Your first rung: XIC → OTE', ex: 'practice',
      body: `<p>Inputs are read into the <b>input image</b> (<code>I:0/x</code>), the ladder is solved left to right, top to bottom, and the <b>output image</b> (<code>O:0/x</code>) is written to the relay outputs. That cycle is the <b>scan</b>.</p>
      <ol><li>Press <b>Load “Practice board”</b> below: a clean board with buttons and lamps, so your rung is the only one driving <code>O:0/0</code>.</li>
      <li>Go to <b>Ladder</b>. Click <b>＋ Rung</b>, then the <code>XIC</code> button and set the address to <code>I:0/0</code>.</li>
      <li>Click <code>OTE</code> and set it to <code>O:0/0</code>.</li>
      <li>Switch the PLC to <b>RUN</b> (top bar). Open <b>Wiring</b><span class="desk-only"> (or pick <b>▦ View → Workbench</b> to see ladder, wiring and HMI together)</span> and hold the <b>S1 START</b> button there. Lamp H1 lights — and the instructions turn green.</li></ol>`,
      solution: ['XIC I:0/0 OTE O:0/0'],
    },
    {
      id: 'l2', level: 'Basics', title: '2 · Start / Stop with seal-in', ex: 'practice',
      body: `<p>A momentary start button must be “remembered”. Put a branch around the start contact with the output’s own contact (<b>seal-in</b>).</p>
      <p>S2 STOP is wired <b>normally closed</b>, so <code>I:0/1</code> is ON while nobody presses it. Use <b>XIC</b> for it — then a broken wire also stops the machine (fail-safe).</p>
      <pre>BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0</pre>
      <p>Tip: double-click the rung number to type rung text directly.</p>`,
      solution: ['BST XIC I:0/0 NXB XIC O:0/0 BND XIC I:0/1 OTE O:0/0', 'XIO O:0/0 OTE O:0/1'],
    },
    {
      id: 'l3', level: 'Basics', title: '3 · Latch & unlatch (OTL / OTU)', ex: 'practice',
      body: `<p><code>OTL</code> sets a bit and leaves it set; <code>OTU</code> clears it. Unlike OTE, the bit stays even when the rung goes false.</p>
      <ol><li>Rung 0: <code>XIC I:0/0 OTL O:0/0</code></li><li>Rung 1: <code>XIO I:0/1 OTU O:0/0</code></li></ol>
      <p>Press START, release — the lamp stays on. Press STOP to unlatch. Try switching to PROG and back to RUN: latched outputs are cleared on mode change in this trainer.</p>`,
      solution: ['XIC I:0/0 OTL O:0/0', 'XIO I:0/1 OTU O:0/0'],
    },
    {
      id: 'l4', level: 'Timers', title: '4 · On-delay timer (TON)', ex: 'practice',
      body: `<p>A <code>TON</code> accumulates while its rung is true. <code>DN</code> turns on when <code>ACC ≥ PRE</code>. Time base 1.0 means PRE is in seconds (0.01 → hundredths).</p>
      <ol><li><code>XIC I:0/3 TON T4:0 1.0 3 0</code> — selector S4 starts the timer.</li><li><code>XIC T4:0/DN OTE O:0/1</code> — red lamp after 3 s.</li><li><code>XIC T4:0/TT OTE O:0/2</code> — amber while timing.</li></ol>
      <p>Watch <code>T4:0</code> in the Data Files panel (T4 tab).</p>`,
      solution: ['XIC I:0/3 TON T4:0 1.0 3 0', 'XIC T4:0/DN OTE O:0/1', 'XIC T4:0/TT OTE O:0/2'],
    },
    {
      id: 'l5', level: 'Timers', title: '5 · Flasher (two timers)', ex: 'practice',
      body: `<p>A classic: two timers that reset each other make a blinking light.</p>
      <pre>XIC I:0/3 XIO T4:2/DN TON T4:1 0.01 50 0
XIC T4:1/DN TON T4:2 0.01 50 0
XIC T4:1/DN OTE O:0/2</pre>
      <p>Change the presets in the T4 data file while it runs.</p>`,
      solution: ['XIC I:0/3 XIO T4:2/DN TON T4:1 0.01 50 0', 'XIC T4:1/DN TON T4:2 0.01 50 0', 'XIC T4:1/DN OTE O:0/2'],
    },
    {
      id: 'l6', level: 'Counters', title: '6 · Count up (CTU) with reset', ex: 'practice',
      body: `<p><code>CTU</code> adds one on every false→true transition. When <code>ACC ≥ PRE</code>, <code>DN</code> is set. Use <code>RES</code> to clear it.</p>
      <pre>XIC I:0/2 CTU C5:0 5 0
XIC C5:0/DN OTE O:0/3
XIO I:0/1 RES C5:0</pre>
      <p>Press JOG five times, then STOP to reset.</p>`,
      solution: ['XIC I:0/2 CTU C5:0 5 0', 'XIC C5:0/DN OTE O:0/3', 'XIO I:0/1 RES C5:0'],
    },
    {
      id: 'l7', level: 'Commissioning', title: '7 · Forcing I/O', ex: 'practice',
      body: `<p>Forcing overrides real I/O — used to test wiring and logic during commissioning. Forced inputs are seen by the ladder; forced outputs drive the terminal regardless of logic.</p>
      <ol><li>Right-click an <code>XIC I:0/0</code> instruction → <b>Force On</b>. Or use the <b>F1/F0</b> buttons in the I or O data file.</li>
      <li>The <b>FORCE</b> LED on the PLC and the top bar light amber.</li>
      <li>Toggle <b>Forces: Enabled/Disabled</b> to suspend all forces, and remove them when finished.</li></ol>
      <p class="warn-txt">On a real machine, forcing can start equipment unexpectedly. Always remove forces before handing the machine back.</p>`,
    },
    {
      id: 'l8', level: 'Circuits', title: '8 · Hardwired DOL starter', ex: 'dol',
      body: `<p>Study a motor starter without a PLC. <b>Power circuit</b>: Q0 supply → QF1 MCCB → KM1 main poles → F1 overload → M1. <b>Control circuit</b>: QF2 → S0 STOP (NC) → S1 START (NO) ∥ KM1 13-14 → coil A1-A2 → F1 95-96 → N.</p>
      <ol><li>Press START in the Wiring view. KM1 pulls in and seals itself.</li><li>Click <b>JAM</b> on the motor: after a few seconds F1 trips, 95-96 opens and the motor stops, the amber lamp lights via 97-98.</li><li>Reset F1 (blue R) and restart.</li><li>Use the <b>Meter</b> in Wiring to measure 230 V across the coil.</li></ol>`,
    },
    {
      id: 'l9', level: 'Circuits', title: '9 · PLC motor control + HMI', ex: 'plcmotor',
      body: `<p>The same motor, now controlled by the PLC. The contactor coil is switched by relay output <code>O:0/0</code>. The overload’s NC contact is wired to input <code>I:0/2</code>.</p>
      <ol><li>Put the PLC in RUN. Start the motor from the push button in the Wiring <i>and</i> from the HMI tab.</li><li>Jam the motor and watch the HMI alarm banner.</li><li>Open the HMI in <b>✎ Studio</b> mode and add a <b>numeric entry</b> for <code>T4:0.ACC</code>.</li></ol>`,
    },
    {
      id: 'l10', level: 'Circuits', title: '10 · Conveyor batching', ex: 'conveyor',
      body: `<p>Two PNP photo-eyes (B1 infeed, B2 discharge). The PLC counts boxes with an <code>ONS</code> + <code>CTU</code>, pauses for 4 s after every 5, and raises a jam alarm when B1 stays blocked.</p>
      <ol><li>RUN, press START. AUTO feed is on.</li><li>Change the batch size from the HMI numeric entry.</li><li>Click JAM on the conveyor: the overload is not fitted here — notice the motor stalls but nothing trips! Why should a real conveyor have an overload relay?</li></ol>`,
    },
    {
      id: 'l11', level: 'Circuits', title: '11 · Tank level control', ex: 'tank',
      body: `<p>Level switches LSL/LSH are dry contacts fed with +24 V. The fill valve uses <code>OTL</code>/<code>OTU</code> so it stays open between the two levels (hysteresis).</p>
      <ol><li>RUN the PLC. The consumer outlet (USE) drains the tank slowly; watch it refill automatically.</li><li>Switch S1 to MAN: filling stops.</li><li>Force <code>O:0/4</code> OFF while filling and wait for the timeout alarm.</li></ol>`,
    },
    {
      id: 'l12', level: 'Challenge', title: '12 · Challenge: forward / reverse', ex: 'blank',
      body: `<p>Build a reversing starter yourself:</p>
      <ul><li>Two contactors KM1 (forward) and KM2 (reverse). Wire KM2 with <b>L1 and L3 swapped</b> — the motor reverses.</li>
      <li>Add electrical interlocking: KM1 21-22 (NC) in series with KM2’s coil and vice versa. Also interlock in the ladder with <code>XIO</code>.</li>
      <li>If both close at once you get a phase-to-phase short — the MCCB will trip. Try it!</li></ul>
      <p>Hint: place a 3-phase supply, MCCB, two contactors, an overload relay and a motor from the palette.</p>`,
    },
    {
      id: 'l13', level: 'Hardware', title: '13 · Modular PLC rack and I/O Configuration', ex: 'rack',
      body: `<p>A modular PLC is a <b>rack</b>: a power supply, the <b>CPU</b> in slot 0 and I/O cards in slots 1–7. The address follows the slot: a card in slot 1 is <code>I:1/0…7</code>, in slot 2 <code>O:2/0…7</code>.</p>
      <p>The CPU only runs when every card is in its <b>I/O Configuration</b> (Ladder → <b>I/O Config</b>). A card that is installed but not configured, or configured but missing, is a <b>CPU fault</b>: the FLT light is on and the CPU refuses RUN.</p>
      <ol><li>Put the PLC in RUN and press START: <code>O:2/0</code> turns on.</li>
      <li>In the Wiring, add a <b>relay output card</b> from <i>PLC Rack</i> and set its <b>slot</b> to 3. Try RUN: the CPU faults.</li>
      <li>In PROG, open <b>I/O Config</b>, press <b>Read I/O Config</b>, save, and run again.</li>
      <li>Change the <b>Address</b> style in the Ladder toolbar to bit/byte: <code>I:1/0</code> is shown as <code>I0.0</code>.</li></ol>`,
    },
    {
      id: 'l14', level: 'Hardware', title: '14 · Analog input, analog output and a VFD', ex: 'analog',
      body: `<p>An analog input card turns <b>4–20 mA</b> into a number: 4 mA = 0, 20 mA = 32767 (<code>I:3.0</code> is slot 3, channel 0). An analog output card turns a number into <b>0–10 V</b> (<code>O:4.0</code>). The VFD runs the pump at the speed given by that 0–10 V signal.</p>
      <ol><li>Put the PLC in RUN. Watch <code>I:3.0</code> (level LT1) in the data table while the tank fills and drains.</li>
      <li>Switch <b>S1 PUMP</b> on: the VFD starts the motor; its frequency follows the level (<code>MOV I:3.0 O:4.0</code>).</li>
      <li>Click the VFD to see the frequency ramp, and the motor speed follow it.</li></ol>`,
    },
    {
      id: 'l15', level: 'HMI', title: '15 · HMI screens, trends and navigation', ex: 'plcmotor',
      body: `<p>A real HMI has several <b>screens</b> and buttons to move between them. A <b>trend</b> draws a tag over time.</p>
      <ol><li>Open the HMI in <b>✎ Studio</b>. Add a <b>second screen</b> (Screens → ＋).</li>
      <li>On the first screen, add a <b>Go to Screen</b> button that opens the second screen.</li>
      <li>On the second screen, add a <b>Trend</b> of <code>T4:0.ACC</code> (run time).</li>
      <li>Switch to <b>▶ Machine</b>, start the motor and press your Go to Screen button: the trend rises.</li></ol>`,
    },
    {
      id: 'l16', level: 'Online', title: '16 · Download and online edits', ex: 'plcmotor',
      body: `<p>With real PLC software, the controller keeps the program that was last <b>downloaded</b>. Editing the project does not change the running machine until you download, or make an <b>online edit</b>.</p>
      <ol><li>Ladder → <b>Online</b>: choose <b>Realistic</b>.</li>
      <li>In PROG, <b>⇄ Go Online</b> and <b>Download</b>. Then put the PLC in RUN.</li>
      <li>While running, change a rung (for example the run lamp). The edit is pending: press <b>▶ Test edits</b> and check the machine.</li>
      <li>Press <b>✓ Assemble</b> to keep it in the controller.</li></ol>`,
    },
    {
      id: 'l17', level: 'Circuits', title: '17 · Running feedback and a discrepancy alarm', ex: 'plcfeedback',
      body: `<p>A PLC output only says what the program <b>wants</b>. To know what the motor <b>does</b>, wire a contact of the contactor back to an input: here KM1 13-14 goes to <code>I:0/3</code>. The overload F1 95-96 is hardwired in the coil circuit, and the coil is fed after the main breaker QF1, so the feedback drops whenever the motor cannot run.</p>
      <p>The HMI motor and the RUNNING indicator use <code>I:0/3</code>, not <code>O:0/0</code>. If the command and the feedback disagree for 2 s, <code>B3:0/14</code> latches a discrepancy alarm and stops the command until RESET.</p>
      <ol><li>Put the PLC in RUN and press <b>START</b> on the HMI: the motor runs and the HMI shows RUNNING.</li>
      <li>Switch <b>QF1</b> off in the Wiring and press START again: the command is ON but the HMI shows NOT RUNNING, and after 2 s the discrepancy alarm comes on.</li>
      <li>Switch QF1 on, press <b>RESET</b> on the HMI, then START: the motor runs again.</li></ol>`,
    },
  ];

  /* ---------- Lesson goals: checked live while you work (Wiring, Ladder, HMI), one after the other ----------
     G: dev(label), of(type), mode(), read(addr), project, ev(text) (an event since the lesson started), rack(), rungs(), screen() */
  const run = (G, l) => { const m = G.dev(l); return !!m && m.state.drive === 'run'; };
  /* two contactors are interlocked when the N.C. contact 21-22 of each is the only way to feed the other's coil */
  function interlocked(G) {
    const C = G.project.circuit, D = Circuit.DEFS, km = C.comps.filter(c => c.type === 'contactor');
    if (km.length < 2) return false;
    const ctx = { ...App.ctx, plcOut: 0xFF, plcOutX: new Array(40).fill(0xFFFF) };
    // every terminal pair a device can close in some state (a contact pressed or not, a contactor pulled in or not, a breaker on…)
    const pairs = [];
    for (const c of C.comps) {
      const d = D[c.type]; if (!d || !d.conduct) continue;
      const keys = Object.keys(c.state).filter(k => typeof c.state[k] === 'boolean');
      for (const st of [c.state, ...keys.map(k => ({ ...c.state, [k]: !c.state[k] }))]) {
        let p = null; try { p = d.conduct({ ...c, state: st }, { ...ctx, plcId: c.id }); } catch (e) { p = null; }
        (p || []).forEach(([a, b]) => pairs.push([c, a, b]));
      }
    }
    const src = [];
    for (const c of C.comps) {
      const d = D[c.type]; if (!d || !d.sources) continue;
      const m = d.sources({ ...c, state: { ...c.state, on: true } }, ctx) || {};
      for (const t in m) if (/^L[123]$/.test(m[t]) || String(m[t]).startsWith('DC+')) src.push(c.id + ':' + t);
    }
    const fed = (coil, cut) => {
      const P = new Map(), f = k => { while (P.has(k) && P.get(k) !== k) k = P.get(k); return k; }, u = (a, b) => { P.set(f(a), f(b)); };
      C.wires.forEach(w => u(w.a, w.b));
      pairs.forEach(([c, a, b]) => { if (!(c === cut && [a, b].sort().join() === '21,22')) u(c.id + ':' + a, c.id + ':' + b); });
      return ['A1', 'A2'].some(t => src.some(s => f(s) === f(coil.id + ':' + t)));
    };
    for (const a of km) for (const b of km) if (a !== b && fed(a, null) && fed(b, null) && !fed(b, a) && !fed(a, b)) return true;
    return false;
  }
  /* each of two outputs has an XIO of the other in its rung */
  function ladderInterlock(G) {
    const R = G.rungs(), outs = R.map(t => [...t.matchAll(/OTE (\S+)/g)].map(m => m[1]));
    for (let i = 0; i < R.length; i++) for (let j = 0; j < R.length; j++) {
      if (i === j) continue;
      for (const a of outs[i]) for (const b of outs[j]) if (a !== b && R[i].includes('XIO ' + b) && R[j].includes('XIO ' + a)) return true;
    }
    return false;
  }
  const GOALS = {
    l8: [
      { say: 'Press START: KM1 pulls in and stays in after you let go (seal-in 13-14)', ok: G => G.dev('KM1').state.pulled && !G.dev('S1').state.pressed },
      { say: 'Jam the motor: F1 trips and the amber lamp H2 lights (97-98)', ok: G => G.dev('F1').state.tripped && G.dev('H2').state.on },
      { say: 'Reset F1 and start again: the motor runs', ok: G => !G.dev('F1').state.tripped && run(G, 'M1') },
      { say: 'Press STOP: KM1 drops out', ok: G => !G.dev('KM1').state.pulled },
    ],
    l9: [
      { say: 'PLC in RUN and the motor runs', ok: G => G.mode() === 'RUN' && run(G, 'M1') },
      { say: 'Jam the motor: the overload alarm B3:0/15 is on (HMI banner)', ok: G => G.read('B3:0/15') === 1 },
      { say: 'HMI Studio: a numeric entry for T4:0.ACC', ok: G => G.project.hmi.objects.some(o => o.type === 'entry' && String(o.tag).toUpperCase() === 'T4:0.ACC') },
    ],
    l10: [
      { say: 'RUN and START: the conveyor runs (B3:0/10, O:0/0)', ok: G => G.mode() === 'RUN' && G.read('B3:0/10') === 1 && G.read('O:0/0') === 1 },
      { say: 'A batch of 5 boxes is done: the batch lamp lights (C5:0/DN)', ok: G => G.read('C5:0/DN') === 1 },
      { say: 'Change the batch size on the HMI (C5:0.PRE is not 5)', ok: G => G.read('C5:0.PRE') !== 5 },
      { say: 'Jam the infeed: the jam alarm B3:0/14 is on', ok: G => G.read('B3:0/14') === 1 },
    ],
    l11: [
      { say: 'RUN in AUTO: the PLC opens the fill valve Y1 by itself (O:0/4)', ok: G => G.mode() === 'RUN' && G.read('O:0/4') === 1 },
      { say: 'Switch S1 to MAN: the fill valve closes', ok: G => G.read('I:0/0') === 0 && G.read('O:0/4') === 0 },
      { say: 'Back in AUTO, force O:0/4 OFF while filling: the fill timeout alarm B3:0/15 comes on', ok: G => G.read('B3:0/15') === 1 },
    ],
    l12: [
      { say: 'Build it: two contactors and a 3-phase motor in the Wiring', ok: G => G.of('contactor').length >= 2 && G.of('motor').length >= 1 },
      { say: 'The motor runs forward', ok: G => G.of('motor').some(m => m.state.drive === 'run' && m.state.dir > 0) },
      { say: 'The motor runs in reverse (two phases swapped)', ok: G => G.of('motor').some(m => m.state.drive === 'run' && m.state.dir < 0) },
      { say: 'Electrical interlock: the N.C. 21-22 of each contactor is in the other one\'s coil circuit', ok: interlocked },
      { say: 'Ladder interlock (with a PLC): each output rung has an XIO of the other output', ok: ladderInterlock },
    ],
    l13: [
      { say: 'PLC in RUN, START pressed: O:2/0 is on', ok: G => G.mode() === 'RUN' && G.read('O:2/0') === 1 },
      { say: 'A card in slot 3 that is not configured yet: the CPU faults', ok: G => G.rack().bad.some(b => b.slot === '3') },
      { say: 'Slot 3 in the I/O Configuration and the CPU runs again', ok: G => !!G.rack().conf['3'] && !G.rack().bad.length && G.mode() === 'RUN' },
      { say: 'Address style bit/byte (I0.0, Q0.0)', ok: G => G.project.addr === 'bitbyte' },
    ],
    l14: [
      { say: 'PLC in RUN: the level LT1 reads more than 0 in I:3.0', ok: G => G.mode() === 'RUN' && G.read('I:3.0') > 0 },
      { say: 'S1 PUMP on: the VFD runs (frequency above 0 Hz)', ok: G => G.of('vfd').some(v => v.state.hz > 0.5) },
      { say: 'The pump motor turns', ok: G => run(G, 'M1') },
    ],
    l15: [
      { say: 'Studio: a second screen', ok: G => (G.project.hmi.screens || []).length >= 2 },
      { say: 'A Go to Screen button', ok: G => G.project.hmi.objects.some(o => o.type === 'nav') },
      { say: 'A Trend on another screen than the first', ok: G => G.project.hmi.objects.some(o => o.type === 'trend' && o.scr && o.scr !== 's1') },
      { say: 'Machine mode: you went to the other screen', ok: G => !!G.screen() && G.screen() !== 's1' },
    ],
    l16: [
      { say: 'Connection mode Realistic', ok: G => G.project.conn && G.project.conn.mode === 'real' },
      { say: 'Download to the controller', ok: G => G.ev('Download: the project was written to the controller') },
      { say: 'Online edit in RUN: Test edits', ok: G => G.ev('Online edits: testing') },
      { say: 'Assemble the edits', ok: G => G.ev('Online edits assembled') },
    ],
    l17: [
      { say: 'PLC in RUN: the motor runs and the feedback I:0/3 is ON', ok: G => G.mode() === 'RUN' && G.read('I:0/3') === 1 && run(G, 'M1') },
      { say: 'QF1 off: the discrepancy alarm B3:0/14 is ON', ok: G => !!G.dev('QF1') && !G.dev('QF1').state.on && G.read('B3:0/14') === 1 },
      { say: 'QF1 on, RESET and START: the motor runs again, no alarm', ok: G => G.read('B3:0/14') === 0 && G.read('I:0/3') === 1 && run(G, 'M1') },
    ],
  };

  /* ---------- Lesson auto-check ----------
     Each test is a list of steps: hold inputs `in` (I:0 bit → 1) for `t` seconds,
     then compare outputs `expect` (O:0 bit → 0/1), or count `toggles` of one output. */
  const STOP = { 1: 1 };   // practice board: S2 STOP is NC, so I:0/1 is ON when not pressed
  const sealSteps = [
    { in: STOP, t: 0.1, expect: { 0: 0 }, say: 'Idle: H1 is off' },
    { in: { 0: 1, 1: 1 }, t: 0.1, expect: { 0: 1 }, say: 'Press S1 START: H1 turns on' },
    { in: STOP, t: 0.2, expect: { 0: 1 }, say: 'Release START: H1 stays on' },
    { in: {}, t: 0.1, expect: { 0: 0 }, say: 'Press S2 STOP: H1 turns off' },
    { in: STOP, t: 0.2, expect: { 0: 0 }, say: 'Release STOP: H1 stays off' },
  ];
  const TESTS = {
    l1: [
      { in: {}, t: 0.1, expect: { 0: 0 }, say: 'S1 released: H1 is off' },
      { in: { 0: 1 }, t: 0.1, expect: { 0: 1 }, say: 'Hold S1 START: H1 turns on' },
      { in: {}, t: 0.1, expect: { 0: 0 }, say: 'Release S1: H1 turns off again' },
    ],
    l2: sealSteps,
    l3: sealSteps,
    l4: [
      { in: { 3: 1 }, t: 1.5, expect: { 1: 0, 2: 1 }, say: 'S4 on for 1.5 s: amber H3 on (timing), red H2 still off' },
      { in: { 3: 1 }, t: 2, expect: { 1: 1, 2: 0 }, say: 'After 3 s: red H2 on, amber H3 off' },
      { in: {}, t: 0.1, expect: { 1: 0 }, say: 'S4 off: timer resets, H2 off' },
    ],
    l5: [
      { in: { 3: 1 }, t: 3, toggles: { bit: 2, min: 3 }, say: 'S4 on: amber H3 blinks' },
      { in: {}, t: 1, expect: { 2: 0 }, say: 'S4 off: H3 stays off' },
    ],
    l6: [
      ...Array.from({ length: 4 }, (_, i) => [
        { in: { 1: 1, 2: 1 }, t: 0.05, say: `Press S3 JOG (${i + 1})` },
        { in: STOP, t: 0.05, expect: { 3: 0 }, say: `After press ${i + 1}: blue H4 still off` },
      ]).flat(),
      { in: { 1: 1, 2: 1 }, t: 0.05, say: 'Press S3 JOG (5)' },
      { in: STOP, t: 0.05, expect: { 3: 1 }, say: 'After 5 presses: blue H4 on' },
      { in: {}, t: 0.1, expect: { 3: 0 }, say: 'Press S2 STOP: counter resets, H4 off' },
    ],
  };
  LESSONS.forEach(l => { if (TESTS[l.id]) l.test = TESTS[l.id]; if (GOALS[l.id]) l.goals = GOALS[l.id]; });

  /* Runs the steps against a private PLC engine. Returns [{say, ok, got}] or {error}. */
  function gradeLesson(lesson, rungTexts) {
    let rungs;
    try { rungs = rungTexts.map(t => Ladder.newRung(Ladder.parseRung(t))); }
    catch (e) { return { error: 'The program could not be read: ' + e.message }; }
    const plc = new PLCcore.Engine();
    const v = plc.verify(rungs);
    if (v.errs.length) return { error: `Fix the program first: rung ${v.errs[0].ri} — ${v.errs[0].msg}` };
    plc.setProgram(rungs);
    plc.applyAll(true);
    plc.setMode('RUN');
    const DT = 0.01;
    return lesson.test.map(st => {
      let w = 0;
      for (const b in st.in) if (st.in[b]) w |= 1 << b;
      plc.physIn = w;
      for (const a in st.set || {}) plc.write(a, st.set[a]);
      let toggles = 0, prev = null;
      for (let n = Math.round(st.t / DT); n > 0; n--) {
        plc.scan(DT);
        if (st.toggles) { const b = (plc.physOut >> st.toggles.bit) & 1; if (prev !== null && b !== prev) toggles++; prev = b; }
      }
      let ok = true;
      const got = [];
      for (const b in (st.expect || {})) {
        const val = (plc.physOut >> b) & 1;
        if (val !== st.expect[b]) { ok = false; got.push(`O:0/${b} is ${val ? 'ON' : 'OFF'}`); }
      }
      if (st.toggles && toggles < st.toggles.min) { ok = false; got.push(`O:0/${st.toggles.bit} changed ${toggles} time(s)`); }
      return { say: st.say, ok, got: got.join(', '), check: !!(st.expect || st.toggles) };
    }).filter(r => r.check);
  }

  window.Examples = { EX, LESSONS, gradeLesson };
})();
