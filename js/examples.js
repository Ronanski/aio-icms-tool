/* Example projects (wired circuits + ladder + HMI) and guided lessons. */
(function () {
  'use strict';
  const C = { L1: '#8B4513', L2: '#1d1d1d', L3: '#8a8f96', N: '#2f6fd6', PE: '#58a83a', AC: '#d33a2c', DC: '#1f4fa8', DC0: '#5aa0e6' };

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
  const proj = (name, circ, rungs = [], desc = {}, hmi = []) => ({
    version: 1, name,
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

  EX.blank = {
    title: 'Empty project', desc: 'Start from scratch: empty workspace and program.',
    build: () => proj('Untitled', { comps: [], wires: [], seq: 0 }, []),
  };

  /* ---------- Lessons ---------- */
  const LESSONS = [
    {
      id: 'l1', level: 'Basics', title: '1 · Your first rung: XIC → OTE', ex: 'practice',
      body: `<p>Inputs are read into the <b>input image</b> (<code>I:0/x</code>), the ladder is solved left to right, top to bottom, and the <b>output image</b> (<code>O:0/x</code>) is written to the relay outputs. That cycle is the <b>scan</b>.</p>
      <ol><li>Go to <b>Ladder</b>. Click <b>＋ Rung</b>, then the <code>XIC</code> button and set the address to <code>I:0/0</code>.</li>
      <li>Click <code>OTE</code> and set it to <code>O:0/0</code>.</li>
      <li>Switch the PLC to <b>RUN</b> (top bar). Open <b>Panel &amp; Plant</b> (or turn on <b>Split</b>) and hold <b>S1 START</b>. Lamp H1 lights — and the instructions turn green.</li></ol>`,
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
      <ol><li>Press START in the Panel view. KM1 pulls in and seals itself.</li><li>Click <b>JAM</b> on the motor: after a few seconds F1 trips, 95-96 opens and the motor stops, the amber lamp lights via 97-98.</li><li>Reset F1 (blue R) and restart.</li><li>Use the <b>Meter</b> in Wiring to measure 230 V across the coil.</li></ol>`,
    },
    {
      id: 'l9', level: 'Circuits', title: '9 · PLC motor control + HMI', ex: 'plcmotor',
      body: `<p>The same motor, now controlled by the PLC. The contactor coil is switched by relay output <code>O:0/0</code>. The overload’s NC contact is wired to input <code>I:0/2</code>.</p>
      <ol><li>Put the PLC in RUN. Start the motor from the panel <i>and</i> from the HMI tab.</li><li>Jam the motor and watch the HMI alarm banner.</li><li>Open the HMI in <b>Edit</b> mode and add a numeric entry for <code>T4:0.ACC</code>.</li></ol>`,
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
  ];

  window.Examples = { EX, LESSONS };
})();
