/* Free-draw Electrical Diagram: place IEC symbols anywhere on a grid, rotate them and wire terminal to terminal.
   Every symbol stands for a real device in the Wiring (found by its tag, or added there), and every drawn wire
   becomes a wire between the device terminals, so the electrical simulator runs the drawing. */
(function () {
  'use strict';
  const esc = UI.esc;
  const { DEFS } = Circuit;
  const FD = {};
  const TAG = /^[A-Za-z0-9_-]{1,20}$/;

  /* ---------- symbol library: device type, terminals (local, symbol upright) and how it is drawn ---------- */
  const two = (type, a, b, look, pre, extra) => ({ type, pre, look, terms: [{ id: a, x: 0, y: -30 }, { id: b, x: 0, y: 30 }], ...extra });
  const poles = (type, ins, outs, look, pre, extra) => ({
    type, pre, look, np: ins.length,
    terms: [...ins.map((t, i) => ({ id: t, x: (i - (ins.length - 1) / 2) * 20, y: -30, pole: i })), ...outs.map((t, i) => ({ id: t, x: (i - (outs.length - 1) / 2) * 20, y: 30, pole: i }))],
    ...extra,
  });
  const sens = (type, out, n, photo) => ({ type, pre: 'B', look: 'sens', label: out, photo, part: 'tgt', n, terms: [{ id: 'BN', x: 0, y: -30 }, { id: 'BU', x: 0, y: 30 }, { id: 'BK', x: 30, y: 0 }] });
  const row = (ids, y, gap = 20) => ids.map((t, i) => ({ id: t, x: (i - (ids.length - 1) / 2) * gap, y, src: true }));
  // a changeover contact: common on top, N.C. bottom left, N.O. bottom right
  const co = (type, c, nc, no, pre, extra) => ({ type, pre, look: 'co', terms: [{ id: c, x: 0, y: -30 }, { id: nc, x: -10, y: 30 }, { id: no, x: 10, y: 30 }], ...extra });
  // N.C. + N.O. in one symbol (one actuator): N.C. on the left, N.O. on the right
  const nonc = (type, nc1, nc2, no1, no2, pre, extra) => ({ type, pre, look: 'nonc', terms: [{ id: nc1, x: -10, y: -30 }, { id: nc2, x: -10, y: 30 }, { id: no1, x: 10, y: -30 }, { id: no2, x: 10, y: 30 }], ...extra });
  // a crossover (reversing) contact: 1-4 and 3-2 at rest, 1-2 and 3-4 operated
  const xov = (type, extra) => ({ type, pre: 'S', look: 'xover', terms: [{ id: '1', x: -10, y: -30 }, { id: '3', x: 10, y: -30 }, { id: '2', x: -10, y: 30 }, { id: '4', x: 10, y: 30 }], ...extra });
  // a potential point (L1, N, +24 V…): a junction wired to that conductor of the supply in the Wiring
  const pot = (p, n) => ({ n, type: 'jct', pre: 'XP', look: 'pot', pot: p, jct: true, auto: true, terms: [{ id: 'J', x: 0, y: ['L1', 'L2', 'L3', '+'].includes(p) ? 30 : -30 }] });
  // wire pieces: junctions with several ends (all one point); a link arrow joins every arrow with the same tag
  const wire = (n, ends, extra) => ({ n, type: 'jct', pre: 'J', look: 'wire', jct: true, auto: true, terms: ends.map(([x, y], i) => ({ id: 'J' + i, x, y })), ...extra });
  /* PLC I/O: one symbol per point of the real controller or I/O card in the Wiring, found by its tag (`types`: the devices
     it may be). The diagram never adds a controller. Only point 0 is in the library; the others are picked in its form. */
  const plcIO = (base, n, name, types, d, terms, look) => [base + n, { n: name, type: types[0], types, io: { d, n }, pre: 'PLC', look, hide: n > 0, terms }];
  const PLCLIB = Object.fromEntries([
    ['plcpw', { n: 'PLC power supply L1 / N', type: 'plc', types: ['plc', 'plc16', 'mpsu'], pre: 'PLC', look: 'plcpw', terms: [{ id: 'L1', x: 0, y: -30 }, { id: 'N', x: 0, y: 30 }] }],
    ...Array.from({ length: 16 }, (_, n) => plcIO('plcq', n, 'PLC relay output', ['plc', 'plc16', 'mdo8', 'mdo16'], 'O', [{ id: 'VAC' + (n >> 2), x: 0, y: -30 }, { id: 'O' + n, x: 0, y: 30 }], 'no')),
    ...Array.from({ length: 16 }, (_, n) => plcIO('plct', n, 'PLC transistor output 24 VDC', ['mdo8t', 'mdo16t'], 'O', [{ id: 'VP', x: 0, y: -30 }, { id: 'O' + n, x: 0, y: 30 }], 'no')),
    ...Array.from({ length: 16 }, (_, n) => plcIO('plci', n, 'PLC input', ['plc', 'plc16', 'mdi8', 'mdi8ac', 'mdi16', 'mdi16ac'], 'I', [{ id: 'I' + n, x: 0, y: -30 }, { id: 'COM', x: 0, y: 30 }], 'plcin')),
  ]);
  const LIB = {
    Sources: {
      // supply terminals line up with the poles of the devices under them (L1 L2 L3 at -20 0 20)
      src3: { n: '3-phase supply', type: 'supply3', pre: 'Q', look: 'src', label: '3~ 400/230V', terms: ['L1', 'L2', 'L3', 'N', 'PE'].map((t, i) => ({ id: t, x: -20 + i * 20, y: 20, src: true })), part: 'sw' },
      src1: { n: '1-phase supply 230V', type: 'supply1', pre: 'Q', look: 'src', label: '1~ 230V', terms: ['L', 'N', 'PE'].map((t, i) => ({ id: t, x: -10 + i * 20, y: 20, src: true })), part: 'sw' },
      psu: { n: 'AC/DC converter 230V~ / 24V= (power supply)', type: 'psu24', pre: 'G', look: 'conv', terms: [...row(['L', 'N'], -30), ...row(['P1', 'M1'], 30)] },
      gen: { n: 'Generator 3~ (GS), C1-C2 remote start', type: 'gen3', pre: 'G', look: 'gen', label: 'GS\n3~', terms: [...row(['L1', 'L2', 'L3', 'N'], 34), { id: 'PE', x: 44, y: 0, src: true }, { id: 'C1', x: -10, y: -34 }, { id: 'C2', x: 10, y: -34 }], part: 'run' },
      batt: { n: 'Battery 24 V', type: 'battery', pre: 'GB', look: 'batt', terms: [{ id: 'P', x: 0, y: -30, src: true }, { id: 'M', x: 0, y: 30, src: true }] },
      // several conductors in one symbol (each terminal is wired to that conductor of the supply)
      p3: { n: 'Points L1 L2 L3', type: null, pre: 'XP', look: 'pots', auto: true, pots: { L1: 'L1', L2: 'L2', L3: 'L3' }, terms: ['L1', 'L2', 'L3'].map((t, i) => ({ id: t, x: -20 + i * 20, y: 30 })) },
      p3n: { n: 'Points L1 L2 L3 N', type: null, pre: 'XP', look: 'pots', auto: true, pots: { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N' }, terms: ['L1', 'L2', 'L3', 'N'].map((t, i) => ({ id: t, x: -30 + i * 20, y: 30 })) },
      pL1: pot('L1', 'Point L1'), pL2: pot('L2', 'Point L2'), pL3: pot('L3', 'Point L3'), pN: pot('N', 'Point N'), pPE: pot('PE', 'Point PE'),
      pP: pot('+', 'Point +24 V'), pM: pot('-', 'Point 0 V'),
    },
    Switches: {
      pbno: two('pb_no', '13', '14', 'no', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button N.O.' }),
      pbnc: two('pb_nc', '11', '12', 'nc', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button N.C.' }),
      selno: two('sel2', '13', '14', 'no', 'S', { act: 'turn', part: 'knob', n: 'Selector N.O.' }),
      selnc: two('sel2_nc', '11', '12', 'nc', 'S', { act: 'turn', part: 'knob', n: 'Selector N.C.' }),
      keyno: two('selkey', '13', '14', 'no', 'S', { act: 'key', part: 'key', n: 'Key switch N.O.' }),
      estop: two('estop', '11', '12', 'nc', 'S', { act: 'mush', part: 'btn', n: 'Emergency stop' }),
      lsno: two('limit', '13', '14', 'no', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch N.O.' }),
      lsnc: two('limit', '21', '22', 'nc', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch N.C.' }),
      pbcono: two('pb_co', '13', '14', 'no', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button NO+NC — N.O. 13-14' }),
      pbconc: two('pb_co', '21', '22', 'nc', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button NO+NC — N.C. 21-22' }),
      footno: two('foot', '13', '14', 'no', 'S', { act: 'foot', part: 'btn', mom: true, n: 'Foot switch N.O.' }),
      footnc: two('foot', '21', '22', 'nc', 'S', { act: 'foot', part: 'btn', mom: true, n: 'Foot switch N.C.' }),
      sel3h: two('sel3', '13', '14', 'no', 'S', { act: 'turn', part: 'l', n: 'Selector H-O-A — HAND 13-14' }),
      sel3a: two('sel3', '23', '24', 'no', 'S', { act: 'turn', part: 'r', n: 'Selector H-O-A — AUTO 23-24' }),
      esno: two('estop', '13', '14', 'no', 'S', { act: 'mush', part: 'btn', n: 'Emergency stop N.O. 13-14' }),
      pbcx: co('pb_cx', '11', '12', '14', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button changeover 11-12 / 11-14' }),
      selcx: co('sel_cx', '11', '12', '14', 'S', { act: 'turn', part: 'knob', n: 'Selector changeover 11-12 / 11-14' }),
      selcono: two('sel_co', '13', '14', 'no', 'S', { act: 'turn', part: 'knob', n: 'Selector NO+NC — N.O. 13-14' }),
      selconc: two('sel_co', '21', '22', 'nc', 'S', { act: 'turn', part: 'knob', n: 'Selector NO+NC — N.C. 21-22' }),
      pbx: xov('pb_x', { act: 'push', part: 'btn', mom: true, n: 'Push button crossover' }),
      pbnonc: nonc('pb_co', '21', '22', '13', '14', 'S', { act: 'push', part: 'btn', mom: true, n: 'Push button N.C. + N.O. (21-22 / 13-14)' }),
      selnonc: nonc('sel_co', '21', '22', '13', '14', 'S', { act: 'turn', part: 'knob', n: 'Selector N.C. + N.O. (21-22 / 13-14)' }),
      esnonc: nonc('estop', '11', '12', '13', '14', 'S', { act: 'mush', part: 'btn', n: 'Emergency stop N.C. + N.O. (11-12 / 13-14)' }),
      esco: co('estop_co', '11', '12', '14', 'S', { act: 'mush', part: 'btn', n: 'Emergency stop changeover 11-12 / 11-14' }),
      lsnonc: nonc('limit', '21', '22', '13', '14', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch N.C. + N.O. (21-22 / 13-14)' }),
      lsco: co('limit_co', '11', '12', '14', 'SQ', { act: 'roll', part: 'lever', n: 'Limit switch changeover 11-12 / 11-14' }),
      selx: xov('sel_x', { act: 'turn', part: 'knob', n: 'Selector crossover' }),
      // rotary selectors: common 1 on top, one output per position below
      sel3i: { n: 'Selector 3 positions I-II-III (1-2 / 1-3 / 1-4)', type: 'sel3p', pre: 'S', look: 'rot', act: 'turn', part: 'knob', terms: [{ id: '1', x: 0, y: -30 }, { id: '2', x: -20, y: 30 }, { id: '3', x: 0, y: 30 }, { id: '4', x: 20, y: 30 }] },
      sel3o: { n: 'Selector 3 positions I-0-II (1-2 / – / 1-3)', type: 'sel3p0', pre: 'S', look: 'rot', act: 'turn', part: 'knob', terms: [{ id: '1', x: 0, y: -30 }, { id: '2', x: -14, y: 30 }, { id: '3', x: 14, y: 30 }] },
    },
    Sensors: {
      pswno: two('pswitch', '13', '14', 'no', 'SP', { act: 'press', part: 'pv', n: 'Pressure switch N.O.' }),
      pswnc: two('pswitch_nc', '11', '12', 'nc', 'SP', { act: 'press', part: 'pv', n: 'Pressure switch N.C.' }),
      fltno: two('float', '13', '14', 'no', 'SL', { act: 'float', part: 'pv', n: 'Float (level) switch N.O.' }),
      fltnc: two('float_nc', '11', '12', 'nc', 'SL', { act: 'float', part: 'pv', n: 'Float (level) switch N.C.' }),
      tswno: two('tswitch', '13', '14', 'no', 'ST', { act: 'temp', part: 'pv', n: 'Thermostat N.O.' }),
      tswnc: two('tswitch_nc', '11', '12', 'nc', 'ST', { act: 'temp', part: 'pv', n: 'Thermostat N.C.' }),
      fswno: two('flowsw', '13', '14', 'no', 'SF', { act: 'flow', part: 'pv', n: 'Flow switch N.O.' }),
      fswnc: two('flowsw_nc', '11', '12', 'nc', 'SF', { act: 'flow', part: 'pv', n: 'Flow switch N.C.' }),
      // 3-wire DC sensors: BN brown +24 V, BU blue 0 V, BK black output
      prox: sens('prox', 'PNP', 'Inductive proximity sensor PNP'),
      proxn: sens('prox_npn', 'NPN', 'Inductive proximity sensor NPN'),
      photo: sens('photo', 'PNP', 'Photoelectric sensor PNP', true),
      photon: sens('photo_npn', 'NPN', 'Photoelectric sensor NPN', true),
    },
    Auxiliaries: {
      kmno: two('contactor', '13', '14', 'no', 'KM', { n: 'Contactor aux N.O.' }),
      kmnc: two('contactor', '21', '22', 'nc', 'KM', { n: 'Contactor aux N.C.' }),
      // the front auxiliary block of a contactor: a second / third N.O. or N.C. of the same contactor
      kxno1: two('contactor_aux', '53', '54', 'no', 'KM', { n: 'Contactor aux block N.O. 53-54' }),
      kxnc1: two('contactor_aux', '61', '62', 'nc', 'KM', { n: 'Contactor aux block N.C. 61-62' }),
      kxnc2: two('contactor_aux', '71', '72', 'nc', 'KM', { n: 'Contactor aux block N.C. 71-72' }),
      kxno2: two('contactor_aux', '83', '84', 'no', 'KM', { n: 'Contactor aux block N.O. 83-84' }),
      ka1no: two('relay', '11', '14', 'no', 'K', { n: 'Relay contact 1 N.O.' }),
      ka1nc: two('relay', '11', '12', 'nc', 'K', { n: 'Relay contact 1 N.C.' }),
      ka2no: two('relay', '21', '24', 'no', 'K', { n: 'Relay contact 2 N.O.' }),
      ka2nc: two('relay', '21', '22', 'nc', 'K', { n: 'Relay contact 2 N.C.' }),
      ktno: two('timer', '15', '18', 'no', 'KT', { act: 'delay', n: 'On-delay contact N.O.' }),
      ktnc: two('timer', '15', '16', 'nc', 'KT', { act: 'delay', n: 'On-delay contact N.C.' }),
      kfno: two('timer_off', '15', '18', 'no', 'KT', { act: 'delayoff', n: 'Off-delay contact N.O.' }),
      kfnc: two('timer_off', '15', '16', 'nc', 'KT', { act: 'delayoff', n: 'Off-delay contact N.C.' }),
      olnc: two('olr', '95', '96', 'nc', 'F', { act: 'therm', n: 'Overload contact N.C.', part: 'ol' }),
      olno: two('olr', '97', '98', 'no', 'F', { act: 'therm', n: 'Overload contact N.O.', part: 'ol' }),
      qmaux: two('mpcb', '13', '14', 'no', 'QM', { n: 'Motor breaker aux N.O.' }),
      km4no: two('contactor4', '13', '14', 'no', 'KM', { n: 'Contactor 4P aux N.O.' }),
      kino: two('impulse', '1', '2', 'no', 'KI', { n: 'Impulse relay contact N.O.', part: 'lever' }),
      kinc: two('impulse', '3', '4', 'nc', 'KI', { n: 'Impulse relay contact N.C.', part: 'lever' }),
      ltno: two('latch', '11', '14', 'no', 'K', { n: 'Latching relay contact N.O.' }),
      ltnc: two('latch', '11', '12', 'nc', 'K', { n: 'Latching relay contact N.C.' }),
      ka1co: co('relay', '11', '12', '14', 'K', { n: 'Relay changeover contact 1 (11-12 / 11-14)' }),
      ka2co: co('relay', '21', '22', '24', 'K', { n: 'Relay changeover contact 2 (21-22 / 21-24)' }),
      ktco: co('timer', '15', '16', '18', 'KT', { act: 'delay', n: 'On-delay changeover contact (15-16 / 15-18)' }),
      kfco: co('timer_off', '15', '16', '18', 'KT', { act: 'delayoff', n: 'Off-delay changeover contact (15-16 / 15-18)' }),
      ltco: co('latch', '11', '12', '14', 'K', { n: 'Latching relay changeover contact (11-12 / 11-14)' }),
      kmnonc: nonc('contactor', '21', '22', '13', '14', 'KM', { n: 'Contactor aux N.C. + N.O. (21-22 / 13-14)' }),
      kanonc: nonc('relay', '11', '12', '21', '24', 'K', { n: 'Relay N.C. + N.O. (11-12 / 21-24)' }),
      olco: co('olr', '95', '96', '98', 'F', { act: 'therm', part: 'ol', olco: true, n: 'Overload changeover 95-96-98' }),
      // the time-delay contact block on a contactor: 55-56 N.C., 67-68 N.O., 55-56-58 changeover (coil and main poles: the contactor's own symbols)
      ...Object.fromEntries([['kbon', 'contactor_ton', 'delay', 'On'], ['kbof', 'contactor_tof', 'delayoff', 'Off']].flatMap(([p, type, act, w]) => [
        [p + 'nc', two(type, '55', '56', 'nc', 'KM', { act, n: `${w}-delay block N.C. 55-56` })],
        [p + 'no', two(type, '67', '68', 'no', 'KM', { act, n: `${w}-delay block N.O. 67-68` })],
        [p + 'co', co(type, '55', '56', '58', 'KM', { act, n: `${w}-delay block changeover 55-56 / 55-58` })],
        [p + 'nonc', nonc(type, '55', '56', '67', '68', 'KM', { act, n: `${w}-delay block N.C. + N.O. (55-56 / 67-68)` })],
      ])),
      kdno: two('timer_onoff', '15', '18', 'no', 'KT', { act: 'delayboth', n: 'On/off-delay contact N.O.' }),
      kdnc: two('timer_onoff', '15', '16', 'nc', 'KT', { act: 'delayboth', n: 'On/off-delay contact N.C.' }),
      kdco: co('timer_onoff', '15', '16', '18', 'KT', { act: 'delayboth', n: 'On/off-delay changeover contact (15-16 / 15-18)' }),
      flno: two('flasher', '15', '18', 'no', 'KT', { act: 'flash', n: 'Flasher contact N.O.' }),
      flnc: two('flasher', '15', '16', 'nc', 'KT', { act: 'flash', n: 'Flasher contact N.C.' }),
      flco: co('flasher', '15', '16', '18', 'KT', { act: 'flash', n: 'Flasher changeover contact (15-16 / 15-18)' }),
      kpno: two('phasemon', '11', '14', 'no', 'KF', { n: 'Phase failure relay contact N.O.' }),
      kpnc: two('phasemon', '11', '12', 'nc', 'KF', { n: 'Phase failure relay contact N.C.' }),
      kpco: co('phasemon', '11', '12', '14', 'KF', { n: 'Phase failure relay changeover contact (11-12 / 11-14)' }),
    },
    Coils: {
      kmcoil: two('contactor', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor coil' }),
      kacoil: two('relay', 'A1', 'A2', 'coil', 'K', { n: 'Relay coil' }),
      ktcoil: two('timer', 'A1', 'A2', 'tcoil', 'KT', { n: 'On-delay timer coil' }),
      kfcoil: two('timer_off', 'A1', 'A2', 'tcoiloff', 'KT', { n: 'Off-delay timer coil' }),
      kdcoil: two('timer_onoff', 'A1', 'A2', 'tcoilboth', 'KT', { n: 'On/off-delay timer coil' }),
      flcoil: two('flasher', 'A1', 'A2', 'tcoilfl', 'KT', { n: 'Flasher timer coil' }),
      kpmon: poles('phasemon', ['L1', 'L2', 'L3'], [], 'phm', 'KF', { n: 'Phase failure relay (monitors L1 L2 L3)' }),
      km4coil: two('contactor4', 'A1', 'A2', 'coil', 'KM', { n: 'Contactor 4P coil' }),
      kicoil: two('impulse', 'A1', 'A2', 'icoil', 'KI', { n: 'Impulse relay coil' }),
      ltset: two('latch', 'A1', 'A2', 'coil', 'K', { n: 'Latching relay SET coil', label: 'S' }),
      ltrst: two('latch', 'B1', 'B2', 'coil', 'K', { n: 'Latching relay RESET coil', label: 'R' }),
    },
    Loads: {
      lamp: two('lamp', 'X1', 'X2', 'lamp', 'H', { n: 'Pilot lamp' }),
      lampfl: two('lamp_fl', 'X1', 'X2', 'lamp', 'H', { n: 'Flashing pilot lamp', label: 'FL' }),
      horn: two('buzzer', 'X1', 'X2', 'horn', 'HA', { n: 'Buzzer / horn' }),
      valve: two('valve', 'A1', 'A2', 'coil', 'Y', { n: 'Solenoid valve' }),
      heater: two('heater', 'X1', 'X2', 'heat', 'EH', { n: 'Heater' }),
      hmeter: two('hourmeter', 'X1', 'X2', 'meter', 'P', { n: 'Hour meter', label: 'h' }),
      vmeter: two('vmeter', 'V1', 'V2', 'meter', 'PV', { n: 'Voltmeter', label: 'V' }),
      bell: two('bell', 'X1', 'X2', 'bell', 'HA', { n: 'Bell' }),
      siren: two('siren', 'X1', 'X2', 'siren', 'HA', { n: 'Siren' }),
      fan: { n: 'Fan 1~ 230V', type: 'fan', pre: 'M', look: 'motor', label: 'FAN\n1~', terms: [...row(['L', 'N'], -34), { id: 'PE', x: 40, y: 0 }] },
    },
    Contactors: {
      km3: poles('contactor', ['1', '3', '5'], ['2', '4', '6'], 'km', 'KM', { n: 'Contactor main contacts 3P' }),
      km2: poles('contactor', ['1', '3'], ['2', '4'], 'km', 'KM', { n: 'Contactor main contacts 2P' }),
      km4: poles('contactor4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'km', 'KM', { n: 'Contactor main contacts 4P' }),
      km1: poles('contactor', ['1'], ['2'], 'km', 'KM', { n: 'Contactor main contact 1P' }),
      ...Object.fromEntries([1, 2, 3, 4].map(n => ['kmn' + n, poles('contactor_nc', ['1', '3', '5', '7'].slice(0, n), ['2', '4', '6', '8'].slice(0, n), 'kmn', 'KM', { n: `Contactor N.C. main contacts ${n}P` })])),
    },
    Protections: {
      fu1: poles('fuse', ['1'], ['2'], 'fuse', 'FU', { n: 'Fuse 1P', part: 'f' }),
      fu2: poles('fuse2', ['1', '3'], ['2', '4'], 'fuse', 'FU', { n: 'Fuse 2P', part: 'f' }),
      fu3: poles('fuse3', ['1', '3', '5'], ['2', '4', '6'], 'fuse', 'FU', { n: 'Fuse 3P', part: 'f' }),
      fu4: poles('fuse4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'fuse', 'FU', { n: 'Fuse 4P', part: 'f' }),
      mcb1: poles('mcb1', ['1'], ['2'], 'brk', 'QF', { n: 'MCB 1P', part: 'h' }),
      mcb2: poles('mcb2', ['1', '3'], ['2', '4'], 'brk', 'QF', { n: 'MCB 2P', part: 'h' }),
      mcb3: poles('mcb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'QF', { n: 'MCB 3P', part: 'h' }),
      mcb4: poles('mcb4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'brk', 'QF', { n: 'MCB 4P', part: 'h' }),
      qf3: poles('mccb3', ['1', '3', '5'], ['2', '4', '6'], 'brk', 'Q', { n: 'MCCB 3P', part: 'h' }),
      qm3: poles('mpcb', ['1', '3', '5'], ['2', '4', '6'], 'qm', 'QM', { n: 'Motor protection breaker 3P', part: 'h' }),
      ol3: poles('olr', ['1', '3', '5'], ['2', '4', '6'], 'ol', 'F', { n: 'Overload relay (heaters)', part: 'ol' }),
      qs3: poles('isol3', ['1', '3', '5'], ['2', '4', '6'], 'isol', 'QS', { n: 'Disconnector 3P', part: 'h' }),
      qs4: poles('isol4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'isol', 'QS', { n: 'Disconnector 4P', part: 'h' }),
      fsw3: poles('fsw3', ['1', '3', '5'], ['2', '4', '6'], 'fsw', 'QS', { n: 'Fuse disconnector 3P', part: 'h' }),
      rcd: poles('rcd', ['1', '3'], ['2', '4'], 'rcd', 'FI', { n: 'RCD 2P 30 mA', part: 'h' }),
      rcd4: poles('rcd4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'rcd', 'FI', { n: 'RCD 4P 30 mA', part: 'h' }),
      rcbo: poles('rcbo', ['1', '3'], ['2', '4'], 'rcd', 'QF', { n: 'RCBO 2P (RCD + MCB)', part: 'h' }),
      rcbo4: poles('rcbo4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'rcd', 'QF', { n: 'RCBO 4P (RCD + MCB)', part: 'h' }),
      qs1: poles('isol1', ['1'], ['2'], 'isol', 'QS', { n: 'Disconnector 1P', part: 'h' }),
      qs2: poles('isol2', ['1', '3'], ['2', '4'], 'isol', 'QS', { n: 'Disconnector 2P', part: 'h' }),
      // 1-, 2- and 4-pole devices of their own (a drawing from before, with the 3-pole device under the symbol, still works)
      ol1: poles('olr1', ['1'], ['2'], 'ol', 'F', { n: 'Overload relay 1P', part: 'ol' }),
      ol2: poles('olr2', ['1', '3'], ['2', '4'], 'ol', 'F', { n: 'Overload relay 2P', part: 'ol' }),
      qm1: poles('mpcb1', ['1'], ['2'], 'qm', 'QM', { n: 'Motor protection breaker 1P', part: 'h' }),
      qm2: poles('mpcb2', ['1', '3'], ['2', '4'], 'qm', 'QM', { n: 'Motor protection breaker 2P', part: 'h' }),
      qm4: poles('mpcb4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'qm', 'QM', { n: 'Motor protection breaker 4P', part: 'h' }),
      fsw1: poles('fsw1', ['1'], ['2'], 'fsw', 'QS', { n: 'Fuse disconnector 1P', part: 'h' }),
      fsw2: poles('fsw2', ['1', '3'], ['2', '4'], 'fsw', 'QS', { n: 'Fuse disconnector 2P', part: 'h' }),
      fsw1n: poles('fsw1n', ['1', '3'], ['2', '4'], 'fsw', 'QS', { n: 'Fuse disconnector 1P+N (3-4 = N, no fuse)', part: 'h' }),
      fsw3n: poles('fsw3n', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'fsw', 'QS', { n: 'Fuse disconnector 3P+N (7-8 = N, no fuse)', part: 'h' }),
      fsw4: poles('fsw4', ['1', '3', '5', '7'], ['2', '4', '6', '8'], 'fsw', 'QS', { n: 'Fuse disconnector 4P', part: 'h' }),
    },
    Others: {
      node: { n: 'Junction (wire branch)', type: 'jct', pre: 'J', look: 'node', jct: true, auto: true, terms: [{ id: 'J', x: 0, y: 0 }] },
      wline: wire('Wire (straight)', [[0, -30], [0, 30]]),
      wcorner: wire('Wire corner', [[0, -30], [30, 0]]),
      wtee: wire('Wire T (junction)', [[-30, 0], [30, 0], [0, 30]]),
      wcross: wire('Wire cross (junction)', [[-30, 0], [30, 0], [0, -30], [0, 30]]),
      wlink: wire('Link arrow (same tag = connected)', [[0, -30]], { pre: 'W', auto: false, arrow: true }),
      // a source and a destination arrow: arrows with the same tag are connected, as with the link arrow; the arrow shows the way
      wsrc: wire('Link arrow — source (same tag = connected)', [[0, -30]], { pre: 'W', auto: false, arrow: 'src' }),
      wdst: wire('Link arrow — destination (same tag = connected)', [[0, -30]], { pre: 'W', auto: false, arrow: 'dst' }),
      // protective earth: wired to the PE of the supply
      gnd: { n: 'Protective earth (PE)', type: 'jct', pre: 'PE', look: 'gnd', jct: true, auto: true, pot: 'PE', terms: [{ id: 'J', x: 0, y: -20 }] },
      // a note on the drawing, no device
      text: { n: 'Text', type: null, pre: 'TXT', look: 'text', terms: [] },
    },
    Motors: {
      m1: { n: 'Motor 1~ 230V', type: 'motor1', pre: 'M', look: 'motor', label: 'M\n1~', terms: [...row(['L', 'N'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m3: { n: 'Motor 3~', type: 'motor', pre: 'M', look: 'motor', label: 'M\n3~', terms: [...row(['U1', 'V1', 'W1'], -34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m6: { n: 'Motor star-delta', type: 'motor6', pre: 'M', look: 'motor', label: 'M 3~\nY-Δ', terms: [...row(['U1', 'V1', 'W1'], -34), ...row(['W2', 'U2', 'V2'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      m2s: { n: 'Motor two speeds', type: 'motor2s', pre: 'M', look: 'motor', label: 'M 3~\n2 speeds', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
      mdc: { n: 'Motor DC 24 V', type: 'motordc', pre: 'M', look: 'motor', label: 'M\n=', terms: row(['A1', 'A2'], -34), part: 'jam' },
      mdh: { n: 'Motor Dahlander', type: 'dahlander', pre: 'M', look: 'motor', label: 'M 3~\nDahlander', terms: [...row(['1U', '1V', '1W'], -34), ...row(['2U', '2V', '2W'], 34), { id: 'PE', x: 40, y: 0 }], part: 'jam' },
    },
    PLC: PLCLIB,
  };
  const ORDER_G = ['Sources', 'Switches', 'Auxiliaries', 'Coils', 'Loads', 'Contactors', 'Protections', 'Motors', 'Others', 'Sensors', 'PLC'];
  Object.keys(LIB).sort((a, b) => ORDER_G.indexOf(a) - ORDER_G.indexOf(b)).forEach(g => { const v = LIB[g]; delete LIB[g]; LIB[g] = v; });
  const K = {};
  Object.entries(LIB).forEach(([g, o]) => Object.entries(o).forEach(([k, v]) => { K[k] = { ...v, g, n: v.n || k }; }));
  FD.KINDS = K;
  /* TYPE: switch symbols of the same contact (N.O. or N.C.) can be swapped for another actuator */
  const TYPES = [['pbno', 'selno', 'keyno', 'lsno', 'pbcono', 'footno', 'pswno', 'fltno', 'tswno', 'fswno'], ['pbnc', 'selnc', 'estop', 'lsnc', 'pbconc', 'footnc', 'pswnc', 'fltnc', 'tswnc', 'fswnc'],
    ['prox', 'proxn', 'photo', 'photon']];

  /* ---------- data ---------- */
  const ID = /^d\d{1,6}$/;
  /* keep (optional, from App.buildProject): symbols of a kind this version does not know, and the wires on them or on
     terminals it does not know, are put aside in keep.free unchanged (saved back by App.serialize); damaged ones are counted */
  FD.clean = function (f, keep) {
    const o = f && typeof f === 'object' ? f : {};
    const num = v => (Number.isFinite(v) ? Math.round(v / 10) * 10 : 0);
    const kp = keep || { free: { items: [], wires: [] }, dropped: 0, kinds: [], fits: () => true };
    const raw = Array.isArray(o.items) ? o.items : [], ids = new Set();
    const unique = i => i && typeof i === 'object' && ID.test(i.id) && !ids.has(i.id) && (ids.add(i.id), true);
    const items = [];
    for (const i of raw) {
      if (!unique(i)) { kp.dropped++; continue; }
      if (Object.prototype.hasOwnProperty.call(K, i.k)) {
        if (typeof i.tag !== 'string' || !TAG.test(i.tag) || items.length >= 400) { kp.dropped++; continue; }
        items.push({ id: i.id, k: i.k, tag: i.tag, x: num(i.x), y: num(i.y), r: [0, 90, 180, 270].includes(i.r) ? i.r : 0, ...(i.k === 'text' ? { txt: typeof i.txt === 'string' ? i.txt.slice(0, 80) : '' } : {}),
          // a comment on the symbol (Properties), drawn under its tag
          ...(typeof i.c === 'string' && i.c.trim() ? { c: i.c.trim().slice(0, 80) } : {}),
          // numbers written beside terminals in place of their own (property bar)
          ...(() => { const tn = {}; if (i.tn && typeof i.tn === 'object') for (const t of K[i.k].terms) if (typeof i.tn[t.id] === 'string' && i.tn[t.id].trim()) tn[t.id] = i.tn[t.id].trim().slice(0, 6); return Object.keys(tn).length ? { tn } : {}; })() });
      } else if (typeof i.k === 'string' && i.k && kp.free.items.length < 400 && kp.fits(i)) { kp.free.items.push(JSON.parse(JSON.stringify(i))); kp.kinds.push(i.k); }
      else kp.dropped++;
    }
    const parked = new Set(kp.free.items.map(i => i.id));
    // an end is known (a known symbol and terminal), kept (a kept symbol, or a terminal this version does not know) or broken
    const end = e => {
      if (typeof e !== 'string') return 'bad';
      const [id, t] = e.split(':'); const it = items.find(i => i.id === id);
      if (it) return K[it.k].terms.some(x => x.id === t) ? 'ok' : 'keep';
      return parked.has(id) ? 'keep' : 'bad';
    };
    const wires = [], wids = new Set();
    for (const w of Array.isArray(o.wires) ? o.wires : []) {
      if (!w || typeof w !== 'object' || !/^fw\d{1,6}$/.test(w.id) || wids.has(w.id) || w.a === w.b) { kp.dropped++; continue; }
      const a = end(w.a), b = end(w.b);
      if (a === 'bad' || b === 'bad') { kp.dropped++; continue; }
      wids.add(w.id);
      if (a === 'ok' && b === 'ok') {
        if (wires.length >= 2000) { kp.dropped++; continue; }
        const pts = (Array.isArray(w.pts) ? w.pts : []).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).slice(0, 20).map(q => [num(q[0]), num(q[1])]);
        wires.push(pts.length ? { id: w.id, a: w.a, b: w.b, pts } : { id: w.id, a: w.a, b: w.b });
      } else if (kp.free.wires.length < 2000 && kp.fits(w)) kp.free.wires.push(JSON.parse(JSON.stringify(w)));
      else kp.dropped++;
    }
    const n = s => Number(String(s).replace(/\D/g, '')) || 0;
    // new symbols and wires never reuse the id of one that was put aside
    const seq = Math.max(Number.isInteger(o.seq) && o.seq >= 0 && o.seq < 999999 ? o.seq : 0, ...items.map(i => n(i.id)), ...wires.map(w => n(w.id)), ...kp.free.items.map(i => n(i.id)), ...kp.free.wires.map(w => n(w.id)), 0);
    return { items, wires, seq };
  };

  let H = null;   // hooks from the Schematic view: sch(), circ(), devOf(), snap(), changed(), mode()
  const fr = () => { const s = H.sch(); if (!s.free) s.free = FD.clean(null); return s.free; };
  FD.has = () => !!(H && H.sch() && H.sch().free && H.sch().free.items.length);

  /* ---------- geometry ---------- */
  const rot = (x, y, r) => (r === 90 ? [-y, x] : r === 180 ? [-x, -y] : r === 270 ? [y, -x] : [x, y]);
  function termPos(it, tid) {
    const t = K[it.k].terms.find(q => q.id === tid); if (!t) return null;
    const [x, y] = rot(t.x, t.y, it.r);
    return { x: it.x + x, y: it.y + y };
  }
  const itemOf = id => fr().items.find(i => i.id === id);
  const endPos = e => { const [id, t] = e.split(':'); const it = itemOf(id); return it ? termPos(it, t) : null; };
  /* square wire route: straight if lined up, else down-across-down; with bends, an L between each pair of points */
  function wirePath(a, b, pts) {
    if (pts && pts.length) {
      const P = [a, ...pts.map(([x, y]) => ({ x, y })), b];
      let d = `M${a.x} ${a.y}`;
      for (let i = 1; i < P.length; i++) d += ` L${P[i - 1].x} ${P[i].y} L${P[i].x} ${P[i].y}`;
      return d;
    }
    const my = Math.round((a.y + b.y) / 20) * 10;
    return a.x === b.x || a.y === b.y ? `M${a.x} ${a.y} L${b.x} ${b.y}` : `M${a.x} ${a.y} L${a.x} ${my} L${b.x} ${my} L${b.x} ${b.y}`;
  }
  /* ---------- automatic wire routes ----------
     every wire without bends of its own is routed on a 10-unit grid (A*): it leaves each terminal straight out, never
     crosses a symbol or passes over a terminal it does not connect (that would look connected), never runs on top of
     another circuit's wire or touches it with a corner (it may cross one), and takes as few bends as it can. Wires of one
     circuit may share a line; where they branch, a junction dot is drawn. Routes are kept until a symbol or wire changes. */
  const G = 10;
  function termDir(it, tid) {
    const t = K[it.k].terms.find(q => q.id === tid); if (!t) return [0, 0];
    const [x, y] = rot(t.x, t.y, it.r);
    return Math.abs(y) >= Math.abs(x) ? [0, Math.sign(y) || 1] : [Math.sign(x), 0];
  }
  // the grid points a symbol's body covers: between its terminals, 20 to each side (the actuator side of a switch: 40)
  function bodyCells(it, out) {
    const S = K[it.k]; if (['node', 'wire', 'text'].includes(S.look)) return;
    let x1 = -20, x2 = 20, y1 = -20, y2 = 20;
    for (const t of S.terms) {
      const [x, y] = rot(t.x, t.y, it.r), [dx, dy] = termDir(it, t.id);
      if (dy) { x1 = Math.min(x1, x - 20); x2 = Math.max(x2, x + 20); if (dy > 0) y2 = Math.max(y2, y - 10); else y1 = Math.min(y1, y + 10); }
      else { y1 = Math.min(y1, y - 20); y2 = Math.max(y2, y + 20); if (dx > 0) x2 = Math.max(x2, x - 10); else x1 = Math.min(x1, x + 10); }
    }
    if (S.act) { const [ax, ay] = rot(-40, 0, it.r); if (ax) x1 = Math.min(x1, ax); if (ay) y1 = Math.min(y1, ay); }
    for (let gx = Math.ceil((it.x + x1) / G); gx <= Math.floor((it.x + x2) / G); gx++)
      for (let gy = Math.ceil((it.y + y1) / G); gy <= Math.floor((it.y + y2) / G); gy++) out.add(gx + ',' + gy);
  }
  /* a simple connector (as Simurelay draws one): out of terminal a in its direction, across, into terminal b in its
     direction. Straight when the two terminals face each other on one line. */
  // off moves the part that runs across (a lane beside it, like dragging the middle of a Simurelay connector)
  function simplePath(a, da, b, db, off = 0) {
    const m = 20, S = { x: a.x + da[0] * m, y: a.y + da[1] * m }, E = { x: b.x + db[0] * m, y: b.y + db[1] * m };
    const faces = (p, d, q) => (d[0] ? Math.sign(q.x - p.x) === d[0] : Math.sign(q.y - p.y) === d[1]);
    if (a.x === b.x && !da[0] && !db[0] && faces(a, da, b) && faces(b, db, a)) return [a, b];
    if (a.y === b.y && !da[1] && !db[1] && faces(a, da, b) && faces(b, db, a)) return [a, b];
    const mid = (u, v) => Math.round((u + v) / 20) * 10;
    let P;
    if (!da[0] && !db[0]) {
      // both terminals point up or down: across at the middle height when they face each other, else beyond both
      let Y;
      if (da[1] !== db[1] && faces(a, da, b) && faces(b, db, a)) Y = mid(a.y, b.y) + off;
      else if (da[1] === db[1]) Y = (da[1] > 0 ? Math.max(S.y, E.y) : Math.min(S.y, E.y)) + da[1] * Math.abs(off);
      else { const X = (a.x !== b.x ? mid(a.x, b.x) : a.x + 40) + off; P = [a, S, { x: X, y: S.y }, { x: X, y: E.y }, E, b]; }
      if (!P) P = [a, { x: a.x, y: Y }, { x: b.x, y: Y }, b];
    } else if (!da[1] && !db[1]) {
      let X;
      if (da[0] !== db[0] && faces(a, da, b) && faces(b, db, a)) X = mid(a.x, b.x) + off;
      else if (da[0] === db[0]) X = (da[0] > 0 ? Math.max(S.x, E.x) : Math.min(S.x, E.x)) + da[0] * Math.abs(off);
      else { const Y = (a.y !== b.y ? mid(a.y, b.y) : a.y + 40) + off; P = [a, S, { x: S.x, y: Y }, { x: E.x, y: Y }, E, b]; }
      if (!P) P = [a, { x: X, y: a.y }, { x: X, y: b.y }, b];
    } else {
      // one up/down, one sideways: one corner when it lies ahead of both terminals, else out of each first
      const c = !da[0] ? { x: a.x, y: b.y } : { x: b.x, y: a.y };
      P = faces(a, da, c) && faces(b, db, c) ? [a, c, b] : [a, S, !da[0] ? { x: S.x, y: E.y } : { x: E.x, y: S.y }, E, b];
    }
    const out = [];
    for (const p of P) { const q = out[out.length - 1]; if (q && q.x === p.x && q.y === p.y) continue; if (out.length > 1) { const r = out[out.length - 2]; if ((r.x === q.x && q.x === p.x) || (r.y === q.y && q.y === p.y)) out.pop(); } out.push(p); }
    return out;
  }
  // how wires without bends of their own are drawn: simple connectors (like Simurelay), or routed around the symbols
  const ROUTINGS = { simple: 'Simple (straight connectors)', around: 'Around the symbols' };
  let routing = (() => { try { const v = localStorage.getItem('plc-trainer.fdRouting'); return ROUTINGS[v] ? v : 'simple'; } catch (e) { return 'simple'; } })();
  FD.setRouting = function (v) { if (!ROUTINGS[v]) return; routing = v; routeSig = ''; try { localStorage.setItem('plc-trainer.fdRouting', v); } catch (e) { /* private mode */ } if (body) FD.render(body); };
  FD.routing = () => routing;
  let routeSig = '', routeCache = null;
  function routeAll() {
    const F = fr();
    const sig = routing + JSON.stringify([F.items.map(i => [i.id, i.k, i.x, i.y, i.r]), F.wires.map(w => [w.id, w.a, w.b, w.pts])]);
    if (sig === routeSig && routeCache) return routeCache;
    // circuits: wires joined at a terminal, or through a junction / wire piece, are one net
    const up = new Map(), find = k => { while (up.has(k) && up.get(k) !== k) k = up.get(k); return k; }, join = (a, b) => { const x = find(a), y = find(b); if (x !== y) up.set(x, y); };
    F.wires.forEach(w => join(w.a, w.b));
    F.items.forEach(it => { if (['node', 'wire'].includes(K[it.k].look)) K[it.k].terms.forEach(t => join(it.id + ':' + t.id, it.id + ':' + K[it.k].terms[0].id)); });
    const blocked = new Set(), nodes = new Set(), front = new Set(), tnet = new Map(), legs = [];
    F.items.forEach(it => bodyCells(it, blocked));
    const body = new Set(blocked);
    F.items.forEach(it => K[it.k].terms.forEach(t => {
      const p = termPos(it, t.id), [dx, dy] = termDir(it, t.id);
      if (p.x % G === 0 && p.y % G === 0) {
        const c = p.x / G + ',' + p.y / G, net = find(it.id + ':' + t.id);
        blocked.add(c); tnet.set(c, tnet.has(c) && tnet.get(c) !== net ? null : net);
        if (K[it.k].look === 'node') nodes.add(c); else legs.push({ x: p.x / G, y: p.y / G, dx: -dx, dy: -dy, net });
      }
      front.add(Math.round(p.x / G + dx) + ',' + Math.round(p.y / G + dy));
    }));
    // does a path pass through a symbol body, or over a terminal of another circuit (its own two ends aside)? Over a
    // terminal of its own circuit it may (as in Simurelay: the seal-in branch joins at the button's terminal, with a dot)
    const taken = new Map();   // unit steps of the simple wires already placed → their circuit
    const stepKey = (x, y, dx, dy) => dx ? Math.min(x, x + dx * G) + ',' + y + ',h' : x + ',' + Math.min(y, y + dy * G) + ',v';
    // strict: no terminal at all on the way (a moved lane must not touch even a terminal of its own circuit)
    const clear = (P, net, strict) => {
      for (let i = 1; i < P.length; i++) {
        const p = P[i - 1], q = P[i], n = Math.round((Math.abs(q.x - p.x) + Math.abs(q.y - p.y)) / G);
        for (let k = 0; k <= n; k++) {
          const x = p.x + Math.sign(q.x - p.x) * k * G, y = p.y + Math.sign(q.y - p.y) * k * G;
          if ((x === P[0].x && y === P[0].y) || (x === P[P.length - 1].x && y === P[P.length - 1].y)) continue;
          const c = Math.round(x / G) + ',' + Math.round(y / G);
          if (body.has(c) || (tnet.has(c) && (strict || tnet.get(c) !== net))) return false;
          const dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y), o = k < n && taken.get(stepKey(x, y, dx, dy));
          if (o && o !== net) return false;
        }
      }
      return true;
    };
    const wires = [], netOf = new Map();
    for (const w of F.wires) {
      const a = endPos(w.a), b = endPos(w.b); if (!a || !b) continue;
      const net = find(w.a); netOf.set(w.id, net);
      if (w.pts && w.pts.length) { const P = [a]; [...w.pts.map(([x, y]) => ({ x, y })), b].forEach(q => { const p = P[P.length - 1]; P.push({ x: p.x, y: q.y }, q); }); wires.push({ id: w.id, net, fixed: P }); continue; }
      const da = termDir(itemOf(w.a.split(':')[0]), w.a.split(':')[1]), db = termDir(itemOf(w.b.split(':')[0]), w.b.split(':')[1]);
      // a simple connector, unless it would run over another terminal or through a symbol (then it goes around)
      // the part across moves to the next free lane (10, 20, 30… either side) before the wire is routed around
      let sp = null;
      if (routing === 'simple') for (const off of [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60]) { const c = simplePath(a, da, b, db, off); if (clear(c, net, off !== 0)) { sp = c; break; } }
      if (sp) {
        for (let i = 1; i < sp.length; i++) { const p = sp[i - 1], q = sp[i], n = Math.round((Math.abs(q.x - p.x) + Math.abs(q.y - p.y)) / G), dx = Math.sign(q.x - p.x), dy = Math.sign(q.y - p.y); for (let k = 0; k < n; k++) taken.set(stepKey(p.x + dx * k * G, p.y + dy * k * G, dx, dy), net); }
        wires.push({ id: w.id, net, fixed: sp });
      } else wires.push({ id: w.id, net, a, b, da, db });
    }
    const r = GridRoute.solve({ G, blocked, front, wires, legs }), d = new Map();
    for (const w of F.wires) if (!(w.pts && w.pts.length) && r.paths.has(w.id)) d.set(w.id, 'M' + r.paths.get(w.id).map(p => `${p.x} ${p.y}`).join(' L'));
    // a junction dot where three or more lines of one circuit meet (a terminal's leg counts), not on a junction point
    const dots = r.dots.filter(j => !nodes.has(j.x / G + ',' + j.y / G));
    routeSig = sig; routeCache = { d, dots, netOf };
    return routeCache;
  }
  const routeLen = (a, pts, b) => { const P = [a, ...pts.map(([x, y]) => ({ x, y })), b]; let n = 0; for (let i = 1; i < P.length; i++) n += Math.abs(P[i].x - P[i - 1].x) + Math.abs(P[i].y - P[i - 1].y); return n; };

  /* ---------- checks and wiring into the circuit ---------- */
  // the supply terminal a potential point is wired to: [device type, terminal] in order of preference
  const POT = {
    L1: [['supply3', 'L1'], ['supply1', 'L'], ['gen3', 'L1']], L2: [['supply3', 'L2'], ['gen3', 'L2']], L3: [['supply3', 'L3'], ['gen3', 'L3']],
    N: [['supply3', 'N'], ['supply1', 'N'], ['gen3', 'N']], PE: [['supply3', 'PE'], ['supply1', 'PE'], ['gen3', 'PE']],
    '+': [['psu24', 'P1'], ['mpsu', 'V24'], ['plc', 'V24'], ['plc16', 'V24'], ['battery', 'P']], '-': [['psu24', 'M1'], ['mpsu', 'C24'], ['plc', 'C24'], ['plc16', 'C24'], ['battery', 'M']],
  };
  const POTNAME = { '+': '+24 V', '-': '0 V' };
  function potKey(p) {
    for (const [t, term] of POT[p] || []) { const c = H.circ().comps.find(x => x.type === t); if (c) return c.id + ':' + term; }
    return null;
  }
  /* typeErr(tag, type, what) and take(tag, terminals, view, dry) come from the Schematic, which checks the whole diagram:
     one type per tag, and a device terminal wired by one view only (the current paths, the power circuit or this drawing) */
  const SRC = ['src', 'conv', 'gen', 'batt'];
  /* a PLC symbol needs the controller or I/O card in the Wiring already, of a fitting type, with the terminals of its point */
  function plcErr(it, S) {
    const d = H.devOf(it.tag), R = H.circ().reserved;
    if (!d) return R && R.has(it.tag) ? window.Schematic.reservedMsg(it.tag) : `${it.tag}: there is no PLC or I/O card with this tag in the Wiring — add it there first (the diagram does not add controllers)`;
    if (!S.types.includes(d.type)) return `${it.tag} is a ${DEFS[d.type].name}, not a ${S.types.map(t => DEFS[t].name).join(' or ')}`;
    const miss = S.terms.find(t => !DEFS[d.type].terms.some(x => x.id === t.id));
    return miss ? `${it.tag} (${DEFS[d.type].name}) has no terminal ${miss.id}` : null;
  }
  /* a symbol on a device of another type of the same family (a 1-pole overload relay under the overload contact):
     the terminals it uses must exist there; the overload changeover 95-96-98 needs the relay set that way */
  function devErr(it, S) {
    const d = H.devOf(it.tag); if (!d || !DEFS[d.type]) return null;
    return Circuit.fitErr(d, S.type, S.terms.map(t => t.id), S.olco ? 'olco' : S.look);
  }
  FD.check = function (typeErr, take) {
    const errs = new Map(), used = new Map();
    if (!H) return errs;
    const te = typeErr || ((tag, type, what) => {
      const d = H.devOf(tag), R = H.circ().reserved;
      if (!d && R && R.has(tag)) return window.Schematic.reservedMsg(tag);
      return d && !Circuit.sameKind(d.type, type) ? `${tag} is a ${DEFS[d.type].name} in the Wiring, not a ${what || DEFS[type].name}` : null;
    });
    for (const it of fr().items) {
      const S = K[it.k];
      if (S.pots) { const miss = Object.values(S.pots).find(p => !potKey(p)); if (miss) errs.set(it, `${miss}: no supply with this conductor in the Wiring (add one from Sources)`); continue; }
      if (!S.type) continue;
      if (S.pot && !potKey(S.pot)) { errs.set(it, `${POTNAME[S.pot] || S.pot}: no supply with this conductor in the Wiring (add one from Sources)`); continue; }
      if (S.jct) { const m = te(it.tag, 'jct', 'wire point'); if (m) errs.set(it, m); continue; }
      const m = S.types ? plcErr(it, S) : te(it.tag, S.type) || devErr(it, S); if (m) { errs.set(it, m); continue; }
      // a terminal pair of a device is drawn once (one N.O. aux on a contactor, one coil, one set of main contacts…)
      const key = it.tag + '|' + S.terms.map(t => t.id).join(',');
      if (used.has(key) && !SRC.includes(S.look)) errs.set(it, `${it.tag}: this part of the device is already drawn (${S.terms.map(t => t.id).join('-')})`);
      else if (!SRC.includes(S.look) && !S.jct) {
        const ids = S.terms.map(t => t.id), twin = [...used.values()].find(o => o.tag === it.tag && !SRC.includes(K[o.k].look) && (() => { const os = K[o.k].terms.map(t => t.id); return ids.every(t => os.includes(t)) || os.every(t => ids.includes(t)); })());
        if (twin) errs.set(it, `${it.tag}: this contact is already drawn in another symbol (${K[twin.k].n})`);
      }
      used.set(key, it);
    }
    // terminals the other views wire (a supply may be drawn in every view): this symbol is not wired
    if (take) for (const it of fr().items) {
      const S = K[it.k]; if (!S.type || S.jct || SRC.includes(S.look) || errs.has(it)) continue;
      const ids = S.terms.map(t => t.id), m = take(it.tag, ids, 'f', true);
      if (m) errs.set(it, m); else take(it.tag, ids, 'f');
    }
    return errs;
  };
  const check = () => (H.checks ? H.checks() : FD.check());
  FD.sync = function (addWire, ensureType, ctlColor) {
    if (!H) return;
    const F = fr(), col = Circuit.POT_COLORS;
    renumber();
    // devices first (a supply drawn on this sheet must exist before a potential point looks for it), then the checks
    const e0 = check();
    // a tag's device is made from its most specific symbol (a 1-pole overload relay rather than the contact's generic one);
    // an overload relay made for the changeover symbol is set that way
    const pref = new Map();
    for (const it of F.items) { const t = K[it.k].type; if (!t || K[it.k].jct || K[it.k].types) continue; const p = pref.get(it.tag); if (!p || (!DEFS[p].family && DEFS[t].family)) pref.set(it.tag, t); }
    const made = new Set();
    for (const it of F.items) {
      if (!K[it.k].type || K[it.k].pot || e0.has(it)) continue;
      if (!H.devOf(it.tag)) made.add(it.tag);
      ensureType(K[it.k].jct || K[it.k].types ? K[it.k].type : pref.get(it.tag) || K[it.k].type, it.tag);
    }
    // a + / − or L / N point with no supply of its conductor brings one into the Wiring (in Simurelay + and − work on their
    // own): a 24 V battery, or a 1-phase (3-phase when L2 or L3 is drawn) supply. It leaves with the last point (unwired).
    const pots = new Set(F.items.flatMap(i => (K[i.k].pots ? Object.values(K[i.k].pots) : K[i.k].pot ? [K[i.k].pot] : [])));
    const nextTag = pre => { const t = taken(); let n = 1; while (t.has(pre + n)) n++; return pre + n; };
    const supplied = [];
    if ([...pots].some(p => ['+', '-'].includes(p) && !potKey(p))) supplied.push(ensureType('battery', nextTag('GB')));
    if ([...pots].some(p => !['+', '-'].includes(p) && !potKey(p))) supplied.push(ensureType(pots.has('L2') || pots.has('L3') ? 'supply3' : 'supply1', nextTag('Q')));
    // coils drawn before that supply get its voltage too
    if (supplied.length) F.items.forEach(i => { const c = K[i.k].type && H.devOf(i.tag); if (c && c.schAuto) made.add(i.tag); });
    const dc = F.items.some(i => ['+', '-'].includes(K[i.k].pot) || ['batt'].includes(K[i.k].look) || K[i.k].type === 'psu24');
    const ac = F.items.some(i => ['L1', 'L2', 'L3', 'N'].includes(K[i.k].pot) || K[i.k].pots || ['src'].includes(K[i.k].look));
    if (dc !== ac) for (const tag of made) { const c = H.devOf(tag); if (c && (DEFS[c.type].pdefs || []).some(p => p.k === 'coil' && p.opts && p.opts.includes('24VDC'))) c.props.coil = dc ? '24VDC' : '230VAC'; }
    for (const tag of made) { const c = H.devOf(tag), P = c && DEFS[c.type].pdefs || []; for (const k of ['t', 't2']) if (P.some(p => p.k === k)) c.props[k] = 2; }
    for (const it of F.items) if (K[it.k].olco && made.has(it.tag)) { const c = H.devOf(it.tag); if (c && (DEFS[c.type].pdefs || []).some(p => p.k === 'aux')) c.props.aux = '95-96-98 changeover'; }
    const errs = check();
    FD.errs = errs;
    const key = e => {
      const [id, t] = e.split(':'), it = itemOf(id);
      if (!it || errs.has(it)) return null;
      if (K[it.k].pots) { const pk = potKey(K[it.k].pots[t]); return pk ? { k: pk, src: K[it.k].pots[t] } : null; }
      const S = K[it.k], c = ensureType(S.type, it.tag);
      const tm = S.terms.find(q => q.id === t);
      // every end of a wire piece or potential point is the one terminal J of its junction
      const src = S.pot ? { '+': 'P1', '-': 'M1' }[S.pot] || S.pot : tm && tm.src ? t : null;
      return { k: c.id + ':' + (S.jct ? 'J' : t), pole: tm && tm.pole, src };
    };
    // a placed symbol is a device in the Wiring even before it is wired; a potential point (earth, L1, +24 V…) is wired to that supply conductor
    const ok = F.items.filter(it => !errs.has(it) && K[it.k].type);
    for (const it of ok) ensureType(K[it.k].type, it.tag);
    for (const it of ok) {
      const p = K[it.k].pot, sk = p && potKey(p);
      if (sk) addWire(ensureType('jct', it.tag).id + ':J', sk, col[{ '+': 'DC+', '-': 'DC-' }[p] || p]);
    }
    for (const w of F.wires) {
      const a = key(w.a), b = key(w.b);
      if (!a || !b) continue;
      // colour: the supply conductor it starts from, a pole of a 3-pole device (L1 L2 L3), else control wiring
      const s = a.src || b.src, p = a.pole != null && K[itemOf(w.a.split(':')[0]).k].np === 3 ? a.pole : b.pole != null && K[itemOf(w.b.split(':')[0]).k].np === 3 ? b.pole : null;
      const ph = s === 'L' ? 'L1' : s === 'P1' || s === 'P' ? 'DC+' : s === 'M1' || s === 'M' ? 'DC-' : s;
      addWire(a.k, b.k, (ph && col[ph]) || (p != null ? col[['L1', 'L2', 'L3'][p]] : ctlColor));
    }
  };

  /* ---------- view ---------- */
  let body = null, svg = null, gv = null, view = { x: 60, y: 60, k: 1 }, sel = null, wiring = null, drag = null, lastSig = '', needFit = true;
  // several symbols selected (Shift+click, Shift+drag a box, Ctrl+A); sel.i stays the one the side panel shows
  let group = new Set(), clip = null;
  const many = () => (group.size ? [...group] : sel && sel.i ? [sel.i] : []).filter(id => itemOf(id));
  FD.init = function (hooks) {
    H = hooks;
    window.addEventListener('pointerup', () => { if (held) { held(); held = null; } });
    // a finger lifted off the drawing (it was redrawn, or a form opened under the finger) must not count as still down,
    // or every later tap would look like the second finger of a pinch
    const lift = ev => { if (ev.pointerType === 'touch') { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; } };
    window.addEventListener('pointerup', lift); window.addEventListener('pointercancel', lift);
  };
  const live = k => { const api = App.api; if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (/^L[123]$/.test(p) || p.startsWith('DC+')) return true; return false; };
  /* which conductor reaches a terminal (Simurelay colours each one while running): L1 L2 L3 N PE, P (+) or M (0 V) */
  const POTC = p => (/^L[123]$|^N$|^PE$/.test(p) ? p : p.startsWith('DC+') ? 'P' : p.startsWith('DC-') ? 'M' : null);
  const potOf = k => { const api = App.api; if (!api || !k) return ''; const ps = [...api.potsR(api.rootK(k))].map(POTC).filter(Boolean); return ['L1', 'L2', 'L3', 'P', 'N', 'M', 'PE'].find(c => ps.includes(c)) || ''; };
  const neg = k => { const api = App.api; if (!api || !k) return false; for (const p of api.potsR(api.rootK(k))) if (p === 'N' || p.startsWith('DC-')) return true; return false; };
  function devKey(it, t) { const d = H.devOf(it.tag); return d ? d.id + ':' + (K[it.k].jct ? 'J' : t) : null; }
  /* a contact of a device whose coil (A1) is drawn nowhere and wired nowhere never switches by itself */
  function coilless(it) {
    const S = K[it.k], d = S.type && !S.jct && H.devOf(it.tag);
    return !!d && (DEFS[d.type].pdefs || []).some(p => p.k === 'coil') && DEFS[d.type].terms.some(t => t.id === 'A1') && !S.terms.some(t => t.id === 'A1')
      && !fr().items.some(i => i.tag === it.tag && K[i.k].terms.some(t => t.id === 'A1')) && !H.circ().wires.some(w => w.a === d.id + ':A1' || w.b === d.id + ':A1');
  }
  function stateOf(it) {
    const st = stateOf0(it);
    if (!st.miss && !st.low && !(FD.errs && FD.errs.has(it)) && coilless(it)) st.nocoil = true;
    return st;
  }
  function stateOf0(it) {
    const S = K[it.k];
    if (!S.type) return { on: false };
    const d = H.devOf(it.tag);
    if (!d || (FD.errs && FD.errs.has(it))) return { on: false, miss: !d };
    const st = d.state;
    if (st.lowV && ['coil', 'tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl', 'icoil', 'lamp', 'horn', 'bell', 'siren'].includes(S.look)) return { on: false, low: true };
    if (d.type === 'lamp_fl') return { on: !!st.lit };
    if (S.look === 'phm') return { on: !!st.ok };
    if (['coil', 'tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl', 'icoil', 'lamp', 'horn', 'bell', 'siren', 'heat', 'meter'].includes(S.look)) return { on: !!(st.pulled || st.on || st.pw || st.v || (it.k === 'ltset' && st.set)) };
    if (S.jct) return { on: live(d.id + ':J') };
    if (S.look === 'motor') return { on: st.drive === 'run' || (S.type === 'fan' && !!st.on) };
    if (S.look === 'sens') return { on: !!st.act };
    if (['src', 'conv', 'gen', 'batt'].includes(S.look)) return { on: !!(st.on || st.ok || S.look === 'batt') };
    if (S.look === 'plcpw') return { on: !!st.pw };
    // a PLC input is ON when the controller reads it (this tick's input word: the compact PLC's, or the card's slot)
    if (S.look === 'plcin') {
      const c = App.ctx, w = DEFS[d.type].compact ? (c.plcId === d.id ? c.plcInRaw : 0) : ((c.plcInX || [])[Number(d.props.slot)] || 0);
      return { on: !!((w >> S.io.n) & 1) };
    }
    const pr = DEFS[d.type].conduct ? DEFS[d.type].conduct(d, App.ctx) || [] : [];
    // a changeover is operated when common and N.O. are joined; a crossover when 1-2 is
    const has = (a, b) => pr.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
    if (S.look === 'co') return { on: has(S.terms[0].id, S.terms[2].id) };
    if (S.look === 'xover') return { on: has('1', '2') };
    if (S.look === 'nonc') return { on: has(S.terms[2].id, S.terms[3].id) };
    if (S.look === 'rot') { const o = S.terms.find(t => t.y > 0 && has('1', t.id)); return { on: !!o, out: o && o.id }; }
    const ins = S.terms.filter(t => t.y < 0).map(t => t.id), outs = S.terms.filter(t => t.y > 0).map(t => t.id);
    // each pole on its own (a fuse switch with a neutral: the fuses blow, the neutral pole stays closed)
    const poles = ins.map((a, i) => pr.some(([x, y]) => (x === a && y === outs[i]) || (y === a && x === outs[i])));
    return { on: poles.some(Boolean), poles, known: true };
  }
  /* IEC drawing of one symbol, upright, centred on 0,0 */
  function shape(it, st) {
    const S = K[it.k], o = [];
    const stub = (x, y1, y2) => `<path d="M${x} ${y1} V${y2}"/>`;
    const actMark = (a, ax) => ({
      push: `<path class="thin" d="M${ax} -6 V6 M${ax} -6 h-4 M${ax} 6 h-4"/>`,
      turn: `<path class="thin" d="M${ax - 4} -6 H${ax} V6 H${ax + 4}"/>`,
      key: `<circle class="thin" cx="${ax - 4}" cy="0" r="4"/><path class="thin" d="M${ax} 0 h4"/>`,
      mush: `<path class="thin" d="M${ax} -7 V7 M${ax} -7 a7 7 0 0 0 0 14"/>`,
      roll: `<path class="thin" d="M${ax} 0 l-7 -5 v10 z"/>`,
      therm: `<path class="thin" d="M${ax} -6 h-5 v6 h5 v6"/>`,
      delay: `<path class="thin" d="M${ax} -7 a7 7 0 0 0 0 14"/>`,
      delayoff: `<path class="thin" d="M${ax - 7} -7 a7 7 0 0 1 0 14"/>`,
      delayboth: `<path class="thin" d="M${ax} -7 a7 7 0 0 0 0 14 M${ax - 9} -7 a7 7 0 0 1 0 14"/>`,
      flash: `<path class="thin" d="M${ax} 4 h-3 v-8 h-4 v8 h-4 v-8 h-3"/>`,
      foot: `<path class="thin" d="M${ax} -6 V5 h-7 l-2 -4"/>`,
      press: `<rect class="thin" x="${ax - 10}" y="-5" width="10" height="10"/><path class="thin" d="M${ax - 7} 3 V-3 h3 a1.5 1.5 0 0 1 0 3 h-3"/>`,
      float: `<path class="thin" d="M${ax} 0 h-4"/><circle class="thin" cx="${ax - 8}" cy="0" r="4"/><path class="thin" d="M${ax - 14} 6 h12"/>`,
      temp: `<rect class="thin" x="${ax - 10}" y="-5" width="10" height="10"/><ellipse class="thin" cx="${ax - 5}" cy="0" rx="2.5" ry="3.5"/><path class="thin" d="M${ax - 7.5} 0 h5"/>`,
      flow: `<path class="thin" d="M${ax} -6 V6 M${ax} -6 l-8 3 l8 3"/>`,
    })[a] || '';
    if (S.look === 'no' || S.look === 'nc') {
      o.push(stub(0, -30, -14), stub(0, 14, 30));
      const shut = S.look === 'nc' ? !(st.known && !st.on) : !!st.on;
      o.push(S.look === 'nc' ? (shut ? `<path d="M0 -14 H10 M0 14 L13 -17"/>` : `<path d="M0 -14 H10 M0 14 L-11 -13"/>`) : (shut ? `<path d="M0 14 L2 -16"/>` : `<path d="M0 14 L-11 -13"/>`));
      if (S.act) o.push(`<path class="thin dash" d="M${S.look === 'nc' ? 6 : -6} 0 H-26"/>`, actMark(S.act, -26));
    } else if (S.look === 'co') {
      // changeover: the blade rests on the N.C. side and moves to the N.O. side when operated
      o.push(stub(0, -30, -14), stub(-10, 12, 30), stub(10, 12, 30), `<path class="thin" d="M-10 12 H-5"/>`, `<path d="M0 -14 L${st.on ? 10 : -9} 12"/>`);
      if (S.act) o.push(`<path class="thin dash" d="M-4 -1 H-26"/>`, actMark(S.act, -26));
    } else if (S.look === 'rot') {
      // rotary selector: the blade joins the common to the output of the position (none in 0)
      const outs = S.terms.filter(t => t.y > 0), to = st.out && outs.find(t => t.id === st.out);
      o.push(stub(0, -30, -14), ...outs.map(t => stub(t.x, 14, 30)), `<path class="thin" d="M${outs[0].x - 4} 14 H${outs[outs.length - 1].x + 4}"/>`);
      o.push(to ? `<path d="M0 -14 L${to.x} 14"/>` : `<path d="M0 -14 L-6 6"/>`);
      o.push(`<path class="thin dash" d="M-3 -4 H-30"/>`, actMark(S.act, -30));
    } else if (S.look === 'pots') {
      // supply points in one symbol: a bar with one point per conductor
      o.push(...S.terms.map(t => `<path d="M${t.x} 0 V30"/><circle cx="${t.x}" cy="0" r="7"/>`));
    } else if (S.look === 'nonc') {
      // N.C. (left) and N.O. (right) contacts on one actuator, drawn as they are now
      o.push(stub(-10, -30, -14), stub(-10, 14, 30), stub(10, -30, -14), stub(10, 14, 30));
      o.push(st.on ? `<path d="M-10 -14 H-4 M-10 14 L-15 -12"/><path d="M10 14 L10 -14"/>` : `<path d="M-10 -14 H-4 M-10 14 L-3 -16"/><path d="M10 14 L3 -13"/>`);
      if (S.act) o.push(`<path class="thin dash" d="M-12 0 H-30"/>`, actMark(S.act, -30));
    } else if (S.look === 'xover') {
      o.push(stub(-10, -30, -14), stub(10, -30, -14), stub(-10, 14, 30), stub(10, 14, 30));
      o.push(st.on ? `<path d="M-10 -14 V14 M10 -14 V14"/>` : `<path d="M-10 -14 L10 14 M10 -14 L-10 14"/>`);
      if (S.act) o.push(`<path class="thin dash" d="M-10 0 H-30"/>`, actMark(S.act, -30));
    } else if (S.look === 'bell') {
      o.push(stub(0, -30, -8), stub(0, 8, 30), `<path d="M-12 8 a12 14 0 0 1 24 0 Z"/><circle cx="0" cy="11" r="2.5" class="jdot"/>`);
    } else if (S.look === 'siren') {
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<path d="M-12 -6 H-2 L10 -12 V12 L-2 6 H-12 Z"/><path class="thin" d="M14 -6 q4 6 0 12"/>`);
    } else if (S.look === 'phm') {
      // phase failure relay: a box on L1 L2 L3 (its measuring circuit); its contacts are drawn on their own
      o.push(...S.terms.map(t => stub(t.x, -30, -12)), `<rect x="-30" y="-12" width="60" height="24"/>`);
    } else if (S.look === 'node') {
      o.push(`<circle cx="0" cy="0" r="3.5" class="jdot"/>`);
    } else if (S.look === 'pot') {
      o.push(S.terms[0].y > 0 ? stub(0, 11, 30) : stub(0, -30, -11), `<circle cx="0" cy="0" r="11"/>`);
    } else if (S.look === 'wire') {
      o.push(...S.terms.map(t => `<path d="M0 0 L${t.x} ${t.y}"/>`));
      if (S.terms.length > 2) o.push(`<circle cx="0" cy="0" r="3.5" class="jdot"/>`);
      if (S.arrow === 'dst') o.push(`<path d="M-8 14 L8 14 L0 0 Z" class="fill"/>`);
      else if (S.arrow === 'src') o.push(`<path d="M-8 0 L8 0 L0 14 Z" class="fill"/><path class="thin" d="M-8 18 H8"/>`);
      else if (S.arrow) o.push(`<path d="M-8 0 L8 0 L0 14 Z" class="fill"/>`);
    } else if (S.look === 'conv') {
      o.push(stub(-10, -30, -18), stub(10, -30, -18), stub(-10, 18, 30), stub(10, 18, 30), `<rect x="-24" y="-18" width="48" height="36"/><path class="thin" d="M-24 18 L24 -18 M-18 -8 q3 -5 6 0 t6 0 M6 8 h12 M6 12 h12"/>`);
    } else if (S.look === 'batt') {
      o.push(stub(0, -30, -6), stub(0, 4, 30), `<path d="M-14 -6 H14"/><path d="M-7 4 H7" stroke-width="4"/><path class="thin" d="M10 -16 h6 M13 -19 v6"/>`);
    } else if (S.look === 'gen') {
      o.push(`<circle cx="0" cy="0" r="22"/>`, ...S.terms.filter(t => t.id !== 'PE').map(t => `<path d="M${t.x} ${t.y} L${t.x * 0.4} ${t.y < 0 ? -20 : 20}"/>`), `<path class="pe" d="M22 0 H44"/>`);
    } else if (S.look === 'gnd') {
      o.push(`<path class="pe" d="M0 -20 V0 M-10 0 H10 M-6 4 H6 M-2 8 H2"/>`);
    } else if (S.look === 'plcin') {
      // a PLC input: a box with an arrow into the controller
      o.push(stub(0, -30, -10), stub(0, 10, 30), `<rect x="-16" y="-10" width="32" height="20"/><path class="thin" d="M-9 0 H7 M3 -4 L7 0 L3 4"/>`);
    } else if (S.look === 'plcpw') {
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<rect x="-20" y="-12" width="40" height="24" rx="3"/>`);
    } else if (S.look === 'text') {
      // drawn by labels()
    } else if (S.look === 'heat') {
      o.push(stub(0, -30, -14), stub(0, 14, 30), `<rect x="-7" y="-14" width="14" height="28"/><path class="thin" d="M-7 -7 H7 M-7 0 H7 M-7 7 H7"/>`);
    } else if (S.look === 'meter') {
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<circle cx="0" cy="0" r="12"/>`);
    } else if (S.look === 'sens') {
      // 3-wire sensor: a square body with the sensing symbol (diamond = proximity, arrows = light beam)
      o.push(stub(0, -30, -12), stub(0, 12, 30), `<path d="M12 0 H30"/><rect x="-12" y="-12" width="24" height="24"/>`);
      o.push(S.photo ? `<path class="thin" d="M-22 -10 l8 6 m-4 0 h4 v-3 M-22 2 l8 6 m-4 0 h4 v-3"/>` : `<path class="thin" d="M-7 0 L0 -7 L7 0 L0 7 Z"/>`);
      if (st.on) o.push(`<path class="thin" d="M3 9 L9 3"/>`);
    } else if (['coil', 'tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl', 'icoil'].includes(S.look)) {
      o.push(stub(0, -30, -9), stub(0, 9, 30), `<rect x="-14" y="-9" width="28" height="18"/>`);
      if (S.look === 'icoil') o.push(`<path class="thin" d="M-8 5 V-5 H0 V5 H8 V-5"/>`);
      // the timing box beside the coil: on/off delay half filled, flasher a square wave
      if (S.look === 'tcoilfl') o.push(`<rect x="-26" y="-9" width="12" height="18"/><path class="thin" d="M-25 4 h2 v-8 h4 v8 h2 v-8"/>`);
      else if (S.look === 'tcoilboth') o.push(`<rect x="-26" y="-9" width="6" height="18" class="fill"/><rect x="-26" y="-9" width="12" height="18"/><path class="thin" d="M-26 -9 L-14 9 M-14 -9 L-26 9"/>`);
      else if (S.look !== 'coil') o.push(`<rect x="-26" y="-9" width="12" height="18"${S.look === 'tcoiloff' ? ' class="fill"' : ''}/><path class="thin" d="M-26 -9 L-14 9 M-14 -9 L-26 9"/>`);
    } else if (S.look === 'lamp') {
      o.push(stub(0, -30, -11), stub(0, 11, 30), `<circle cx="0" cy="0" r="11"/><path class="thin" d="M-8 -8 L8 8 M8 -8 L-8 8"/>`);
    } else if (S.look === 'horn') {
      o.push(stub(0, -30, -4), stub(0, 8, 30), `<path d="M-12 8 H12 M-9 8 a9 11 0 0 1 18 0"/>`);
    } else if (S.look === 'src') {
      const xs = S.terms.map(t => t.x), x1 = Math.min(...xs) - 14, x2 = Math.max(...xs) + 14;
      o.push(`<rect x="${x1}" y="-12" width="${x2 - x1}" height="24" rx="4"/>`, ...S.terms.map(t => stub(t.x, t.y < 0 ? -20 : 12, t.y < 0 ? -12 : 20)));
    } else if (S.look === 'motor') {
      o.push(`<circle cx="0" cy="0" r="22" class="${st.on ? 'mon' : ''}"/>`, ...S.terms.filter(t => t.id !== 'PE').map(t => `<path d="M${t.x} ${t.y} L${t.x * 0.4} ${t.y < 0 ? -20 : 20}"/>`));
      if (S.terms.some(t => t.id === 'PE')) o.push(`<path class="pe" d="M22 0 H40 M40 0 V8 M33 8 H47 M36 12 H44 M39 16 H41"/>`);
    } else {
      // multi-pole power device: one symbol per pole and a dashed link
      S.terms.filter(t => t.y < 0).forEach((t, pi) => {
        const x = t.x, st1 = st.poles ? { ...st, on: !!st.poles[pi] } : st;
        if (S.look === 'fsw') o.push(stub(x, -30, -14), stub(x, 14, 30), st1.on ? `<path d="M${x} 14 L${x + 2} -16"/><rect class="thin" x="${x - 2}" y="-7" width="6" height="14"/>` : `<path d="M${x} 14 L${x - 10} -12"/><rect class="thin" x="${x - 8}" y="-7" width="6" height="14" transform="rotate(21 ${x - 5} 0)"/>`);
        else if (S.look === 'fuse') o.push(stub(x, -30, -12), stub(x, 12, 30), `<rect x="${x - 5}" y="-12" width="10" height="24"/>${st1.known && !st1.on ? `<path class="thin" d="M${x} -12 V-3 M${x} 3 V12 M${x - 4} -3 l8 6"/>` : `<path class="thin" d="M${x} -12 V12"/>`}`);
        else if (S.look === 'ol') o.push(stub(x, -30, -10), stub(x, 10, 30), `<path d="M${x} -10 h-4 v8 h8 v8 h-4 V10"/>`);
        else if (S.look === 'kmn') o.push(stub(x, -30, -14), stub(x, 14, 30), `<path d="M${x} -14 H${x + 8} M${x} 14 ${st1.known && !st1.on ? `L${x - 10} -12` : `L${x + 10} -16`}"/><path class="thin" d="M${x - 4} -14 a4 4 0 0 0 8 0"/>`);
        else {
          o.push(stub(x, -30, -14), stub(x, 14, 30), st1.on ? `<path d="M${x} 14 L${x + 2} -16"/>` : `<path d="M${x} 14 L${x - 10} -12"/>`);
          if (S.look === 'km') o.push(`<path class="thin" d="M${x - 4} -14 a4 4 0 0 0 8 0"/>`);
          if (S.look === 'brk' || S.look === 'qm' || S.look === 'rcd') o.push(`<path class="thin" d="M${x - 3} -17 l6 6 M${x + 3} -17 l-6 6"/>`);
        }
      });
      const ps = S.terms.filter(t => t.y < 0).map(t => t.x), x1 = Math.min(...ps), x2 = Math.max(...ps);
      if (S.look === 'ol') o.push(`<rect x="${x1 - 9}" y="-14" width="${x2 - x1 + 18}" height="28" class="thin"/>`);
      else if (S.look !== 'fuse') o.push(`<path class="thin dash" d="M${x1 - 5} 0 H${x2 + 2}"/>`, `<path class="thin" d="M${x1 - 5} 0 h-10 m0 -6 v12"/>`);
      if (S.look === 'qm') o.push(`<path class="thin" d="M${x2 + 6} -6 h6 v6 h-6 v6"/>`);
      if (S.look === 'rcd') o.push(`<ellipse class="thin" cx="${(x1 + x2) / 2}" cy="20" rx="${(x2 - x1) / 2 + 12}" ry="5"/>`);
    }
    return o.join('');
  }
  /* the address of a PLC I/O symbol: the compact PLC is slot 0, a card its own slot */
  function addrOf(it) {
    const S = K[it.k], d = H && it.tag ? H.devOf(it.tag) : null;
    const a = `${S.io.d}:${d && d.type !== 'plc' ? Number(d.props.slot) || 0 : 0}/${S.io.n}`;
    return App.fmt ? App.fmt(a) : a;
  }
  function labels(it, S) {
    if (S.look === 'node' || (S.look === 'wire' && !S.arrow)) return '';
    const L = lbl, o0 = labelsAll(it, S);
    return L.tags && L.terms ? o0 : o0.replace(L.tags ? /$^/ : /<text class="ftag(?! fcmt)[^"]*"[^>]*>[^<]*<\/text>/g, '').replace(L.terms ? /$^/ : /<text class="sterm"[^>]*>[^<]*<\/text>/g, '');
  }
  function labelsAll(it, S) {
    if (S.look === 'pot') return `<text class="mtxt sm" x="${it.x}" y="${it.y + 4}">${esc(POTNAME[S.pot] ? (S.pot === '+' ? '+' : '−') : S.pot)}</text>`;
    if (S.arrow) { const [x, y] = rot(14, 10, it.r); return `<text class="ftag start" x="${it.x + x}" y="${it.y + y}">${esc(it.tag)}</text>`; }
    if (S.look === 'text') return `<text class="ftext" x="${it.x}" y="${it.y + 4}">${esc(it.txt || '')}</text>`;
    // upright text at rotated positions
    const at = (x, y) => { const [a, b] = rot(x, y, it.r); return [it.x + a, it.y + b]; };
    const o = [];
    if (S.look === 'gnd') { const [x, y] = at(14, 10); return `<text class="sterm" x="${x}" y="${y}">PE</text>`; }
    const isPole = !['no', 'nc', 'co', 'nonc', 'rot', 'pots', 'xover', 'coil', 'tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl', 'icoil', 'lamp', 'horn', 'bell', 'siren', 'heat', 'meter', 'sens', 'plcin', 'plcpw'].includes(S.look);
    const [tx, ty] = S.look === 'src' ? at(0, -22) : S.look === 'motor' || S.look === 'gen' ? at(-30, -14) : S.look === 'conv' ? at(-28, -20) : at(isPole ? -((S.np || 1) * 10) - 22 : -30, -12);
    const upright = (it.r === 0 || it.r === 180) && !S.io && ['no', 'nc', 'co', 'nonc', 'coil', 'tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl', 'icoil', 'lamp', 'horn', 'bell', 'siren', 'heat'].includes(S.look);
    // left of the contact, and of its push button / knob head when it has one (not on top of it)
    if (upright) { const ux = it.x - (S.act && it.r === 0 ? 38 : S.look === 'co' || S.look === 'nonc' || /^tcoil/.test(S.look) ? 34 : 22); o.push(`<text class="ftag up" x="${ux}" y="${it.y}" transform="rotate(-90 ${ux} ${it.y})">-${esc(it.tag)}</text>`); }
    else o.push(`<text class="ftag" x="${tx}" y="${ty}">-${esc(it.tag)}</text>`);
    if (S.look === 'motor' || S.look === 'gen') { const [mx, my] = at(0, 0); S.label.split('\n').forEach((l, i, a) => o.push(`<text class="mtxt" x="${mx}" y="${my + 4 + (i - (a.length - 1) / 2) * 12}">${esc(l)}</text>`)); }
    if (S.look === 'src') { const [mx, my] = at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    if (S.look === 'plcpw') { const [mx, my] = at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">PLC ~</text>`); }
    if (S.look === 'pots') S.terms.forEach(t => { const [px, py] = at(t.x, 4); o.push(`<text class="mtxt sm" x="${px}" y="${py}">${esc(t.id)}</text>`); });
    if (S.look === 'phm') { const [mx, my] = at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">3~ L1-L2-L3</text>`); }
    if (S.look === 'lamp' && S.label) { const [mx, my] = at(20, -12); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    // the PLC address of an I/O point, in the project's address style (I:0/3, I0.3…)
    if (S.io) { const [ax, ay] = at(-30, 4); o.push(`<text class="ftag faddr" x="${ax}" y="${ay}">${esc(addrOf(it))}</text>`); }
    // the comment: a line under the tag (two when the address is there)
    if (it.c) o.push(`<text class="ftag fcmt" x="${tx}" y="${ty + (S.io ? 28 : 14)}">${esc(it.c)}</text>`);
    // meter letter, S/R of a latching coil (in the symbol), PNP/NPN of a sensor (beside it)
    if (S.label && ['meter', 'coil', 'sens'].includes(S.look)) { const [mx, my] = S.look === 'sens' ? at(26, -16) : at(0, 0); o.push(`<text class="mtxt sm" x="${mx}" y="${my + 4}">${esc(S.label)}</text>`); }
    S.terms.forEach(t => {
      const lx = t.x + (t.id === 'PE' && (S.look === 'motor' || S.look === 'gen') ? 2 : 5), ly = t.y + (t.y < 0 ? -2 : t.y > 0 ? 10 : -6);
      const [x, y] = at(lx, ly);
      o.push(`<text class="sterm" x="${x}" y="${y}">${esc((it.tn && it.tn[t.id]) || t.id)}</text>`);
    });
    return o.join('');
  }
  /* ---------- library panel (icon grid by group) and zoom buttons around the drawing ---------- */
  const GROUPS = Object.keys(LIB);
  let libUi = { open: innerWidth > 760, grp: 'All' };
  try { const v = JSON.parse(localStorage.getItem('plc-trainer.fdLib') || 'null'); if (v && typeof v === 'object') libUi = { open: v.open !== false, grp: GROUPS.includes(v.grp) ? v.grp : 'All' }; } catch (e) { /* private mode */ }
  const saveLib = () => { try { localStorage.setItem('plc-trainer.fdLib', JSON.stringify(libUi)); } catch (e) { /* private mode */ } };
  const slug = g => g.toLowerCase();
  /* a short name for a library tile, in two lines: the device prefix and the kind of contact, then its timing and terminals
     (KA N.O. / 11-14, KT N.C. / T-on 15-16); other symbols keep their name */
  const ACT = { delay: 'T-on', delayoff: 'T-off', delayboth: 'T-on/off', flash: 'flash' };
  const nb = t => t.replace(/-/g, '‑');
  function shortName(S) {
    const t = S.terms.map(x => x.id), a = ACT[S.act] ? ACT[S.act] + ' ' : '';
    const two = (l1, l2) => `${esc(l1)}<br>${esc(a + nb(l2))}`;
    if (S.look === 'no' || S.look === 'nc') return two(`${S.pre} ${S.look === 'no' ? 'N.O.' : 'N.C.'}`, t.join('-'));
    if (S.look === 'co') return two(`${S.pre} C/O`, `${t[0]}-${t[1]}/${t[2]}`);
    if (S.look === 'nonc') return two(`${S.pre} NC+NO`, `${t[0]}-${t[1]}/${t[2]}-${t[3]}`);
    return esc(S.n);
  }
  function icon(k) {
    const S = K[k], it = { id: 'i', k, tag: '', x: 0, y: 0, r: 0, txt: 'Text' };
    const xs = S.terms.map(t => t.x), ys = S.terms.map(t => t.y);
    const big = ['motor', 'gen'].includes(S.look) ? 48 : 30;
    const x1 = Math.min(-big, ...xs) - 10, x2 = Math.max(big, ...xs) + 10, y1 = Math.min(-30, ...ys) - 10, y2 = Math.max(30, ...ys) + 10;
    return `<button class="fd-ico g-${slug(S.g)}" data-fk="${k}" draggable="true" title="${esc(S.n)}"><svg class="sch-svg iec-svg" viewBox="${x1} ${y1} ${x2 - x1} ${y2 - y1}"><g class="ssym">${shape(it, { on: false })}</g>${labels(it, S)}</svg><span class="fd-nm">${shortName(S)}</span></button>`;
  }
  // search: words in the symbol's name or group, in every group (the group choice applies when the box is empty)
  let libQ = '';
  const libKeys = () => {
    const q = libQ.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return Object.keys(K).filter(k => !K[k].hide && (q.length ? q.every(w => (K[k].n + ' ' + K[k].g).toLowerCase().includes(w)) : libUi.grp === 'All' || K[k].g === libUi.grp));
  };
  const gridHtml = () => { const ks = libKeys(); return ks.length ? ks.map(icon).join('') : '<p class="help">No symbol matches.</p>'; };
  function libHtml() {
    return `<input class="fd-search" type="search" placeholder="Search symbols" aria-label="Search symbols" value="${esc(libQ)}"><select class="fd-grp" aria-label="Symbol group"><option value="All">All</option>${GROUPS.map(g => `<option value="${g}" ${g === libUi.grp ? 'selected' : ''}>${g}</option>`).join('')}</select><div class="fd-grid">${gridHtml()}</div>`;
  }
  FD.search = function (q) { libQ = String(q || ''); const g = body && body.querySelector('.fd-grid'); if (g) g.innerHTML = gridHtml(); };
  function shell(el) {
    el.innerHTML = `<div class="fd-wrap${libUi.open ? '' : ' nolib'}"><aside class="fd-lib">${libHtml()}</aside><div class="fd-canvas"><div class="fd-host"></div><div class="fd-stop"><button data-fstop title="Stop (back to editing)" aria-label="Stop">■</button></div>
      <div class="fd-zoom"><button class="tbtn" data-fz="out" title="Zoom out" aria-label="Zoom out">−</button><button class="tbtn" data-fz="fit" title="Fit the drawing">⤢</button><button class="tbtn" data-fz="in" title="Zoom in" aria-label="Zoom in">＋</button></div></div></div>`;
    const lib = el.querySelector('.fd-lib'), host = el.querySelector('.fd-host');
    lib.addEventListener('change', ev => { if (ev.target.matches('.fd-grp')) { libUi.grp = ev.target.value; saveLib(); lib.innerHTML = libHtml(); } });
    lib.addEventListener('input', ev => { if (ev.target.matches('.fd-search')) FD.search(ev.target.value); });
    // a long press on a tile (touch) shows the symbol's full name and terminals and does not place it
    let tilePress = null, tileShown = false;
    lib.addEventListener('pointerdown', ev => {
      const b = ev.target.closest('[data-fk]'); tileShown = false; clearTimeout(tilePress);
      if (!b || ev.pointerType !== 'touch') return;
      tilePress = setTimeout(() => { const S = K[b.dataset.fk]; tileShown = true; UI.toast(`${S.n} — terminals ${S.terms.map(t => t.id).join(', ') || 'none'}`, 'info', 4000); }, 500);
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(e => lib.addEventListener(e, () => clearTimeout(tilePress)));
    lib.addEventListener('contextmenu', ev => { if (ev.target.closest('[data-fk]')) ev.preventDefault(); });
    lib.addEventListener('click', ev => {
      const b = ev.target.closest('[data-fk]'); if (!b || H.mode() !== 'edit') return;
      if (tileShown) { tileShown = false; return; }
      FD.add(b.dataset.fk);
      if (window.matchMedia && matchMedia('(max-width: 760px)').matches && libUi.open) { FD.toggleLib(); const lb = document.querySelector('#view-schematic [data-fdact="lib"]'); if (lb) lb.classList.remove('on'); }
    });
    lib.addEventListener('dragstart', ev => { const b = ev.target.closest('[data-fk]'); if (b) { ev.dataTransfer.setData('text/fd-sym', b.dataset.fk); ev.dataTransfer.effectAllowed = 'copy'; } });
    host.addEventListener('dragover', ev => { if (ev.dataTransfer.types.includes('text/fd-sym')) ev.preventDefault(); });
    host.addEventListener('drop', ev => { const k = ev.dataTransfer.getData('text/fd-sym'); if (!K[k] || !svg) return; ev.preventDefault(); const p = world(ev); FD.add(k, undefined, snap10(p.x), snap10(p.y)); });
    // the property bar lies over the toolbar row of the view (nothing moves when it opens)
    const vw0 = el.closest('.view') || el; if (!vw0.querySelector(':scope > .fd-pbar')) { const pb = document.createElement('div'); pb.className = 'fd-pbar'; pb.hidden = true; vw0.prepend(pb); bindBar(pb); }
    el.querySelector('.fd-stop').addEventListener('click', () => { const v = el.closest('.view'), b = v && v.querySelector('[data-fdact="play"]'); if (b) b.click(); });
    el.querySelector('.fd-zoom').addEventListener('click', ev => { const b = ev.target.closest('[data-fz]'); if (b) FD.zoom(b.dataset.fz); });
  }
  FD.toggleLib = function () { libUi.open = !libUi.open; saveLib(); const w = body && body.querySelector('.fd-wrap'); if (w) w.classList.toggle('nolib', !libUi.open); return libUi.open; };
  FD.libOpen = () => libUi.open;
  FD.zoom = function (how, most = 2) {
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    if (how === 'fit') {
      const its = fr().items;
      if (!its.length) { view = { x: 60, y: 60, k: 1 }; }
      else {
        const x1 = Math.min(...its.map(i => i.x)) - 70, x2 = Math.max(...its.map(i => i.x)) + 70, y1 = Math.min(...its.map(i => i.y)) - 70, y2 = Math.max(...its.map(i => i.y)) + 110; // a symbol hangs below its anchor; the zoom buttons sit at the bottom
        const k = Math.max(0.3, Math.min(most, Math.min(r.width / (x2 - x1), r.height / (y2 - y1))));
        view = { k, x: (r.width - (x2 - x1) * k) / 2 - x1 * k, y: (r.height - (y2 - y1) * k) / 2 - y1 * k };
      }
    } else {
      const k = Math.max(0.3, Math.min(3, view.k * (how === 'in' ? 1.2 : 1 / 1.2))), mx = r.width / 2, my = r.height / 2;
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k;
    }
    gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
  };
  /* Values: the voltage on a load, open/closed for a contact, the conductor on a wire point */
  FD.values = false;
  const vText = v => (!v ? '0 V' : v.kind === 'AC' ? `${v.v} V~` : `${v.rev ? '−' : ''}24 V=`);
  function valueOf(it) {
    const S = K[it.k], d = S.type && H.devOf(it.tag), api = App.api;
    if (!d || !api || (FD.errs && FD.errs.has(it))) return '';
    if (S.jct) { const set = api.potsR(api.rootK(d.id + ':J')); return set && set.size ? Circuit.potText(set) : '—'; }
    const st = stateOf(it);
    if (['no', 'nc', 'km', 'brk', 'qm', 'rcd', 'isol', 'fsw', 'fuse', 'ol'].includes(S.look)) return st.on ? 'closed' : 'open';
    if (['co', 'xover', 'nonc'].includes(S.look)) return st.on ? 'operated' : 'at rest';
    if (['src', 'gen', 'conv', 'batt'].includes(S.look)) return st.on ? 'on' : 'off';
    const a = S.terms[0], b = S.terms.find(t => t !== a && t.id !== 'PE');
    return a && b ? vText(api.v(d, a.id, b.id)) : '';
  }
  /* the time left on a timer relay that is timing, shown beside its coil (one decimal, so the drawing redraws ten times a second) */
  const TIMERS = ['tcoil', 'tcoiloff', 'tcoilboth', 'tcoilfl'];
  function countOf(it) {
    const S = K[it.k], d = TIMERS.includes(S.look) && H.devOf(it.tag);
    if (!d || !DEFS[d.type] || (FD.errs && FD.errs.has(it))) return '';
    const s = d.state, p = d.props;
    const t = d.type === 'timer' ? (s.pw && !s.done ? p.t : null)
      : d.type === 'timer_off' ? (!s.pw && s.on ? p.t : null)
      : d.type === 'timer_onoff' ? (s.pw !== s.on ? (s.pw ? p.t : p.t2) : null)
      : d.type === 'flasher' ? (s.pw ? (s.on ? p.t : p.t2) : null) : null;
    return t == null ? '' : `${Math.max(0, (Number(t) || 0) - (s.el || 0)).toFixed(1)} s`;
  }
  /* conductor colours: a wire takes the colour of what its net carries (L1 L2 L3 N PE, +24 V, 0 V), as in the Wiring */
  FD.colors = false;
  try { FD.colors = localStorage.getItem('plc-trainer.fdColors') === '1'; } catch (e) { /* private mode */ }
  FD.setColors = function (on) { FD.colors = !!on; try { localStorage.setItem('plc-trainer.fdColors', FD.colors ? '1' : '0'); } catch (e) { /* private mode */ } if (body) FD.render(body); };
  const PC = { L1: 'L1', L2: 'L2', L3: 'L3', N: 'N', PE: 'PE', 'DC+': 'dcp', 'DC-': 'dcm' };
  function wireCls(w) {
    const api = App.api, ia = itemOf(w.a.split(':')[0]), k = ia && devKey(ia, w.a.split(':')[1]);
    if (!FD.colors || !api || !k) return '';
    const p = PC[Circuit.potClass(api.potsR(api.rootK(k)))];
    return p ? ' pc-' + p : '';
  }
  /* label settings (Simurelay: tag and terminal visibility, tag colour), kept in this browser */
  const TAG_COLORS = { auto: 'Like the drawing', red: 'Red', blue: 'Blue', green: 'Green', orange: 'Orange', purple: 'Purple' };
  let lbl = { tags: true, terms: true, color: 'auto', ask: false };
  try { lbl = { ...lbl, ...JSON.parse(localStorage.getItem('plc-trainer.fdLabels') || '{}') }; } catch (e) { /* private mode */ }
  FD.labelSettings = () => ({ ...lbl });
  FD.setLabels = function (o) { lbl = { ...lbl, ...o }; if (!TAG_COLORS[lbl.color]) lbl.color = 'auto'; try { localStorage.setItem('plc-trainer.fdLabels', JSON.stringify(lbl)); } catch (e) { /* private mode */ } if (body) FD.render(body); H.side(); };
  const flips = new Map();
  FD.render = function (el) {
    body = el;
    if (!el.querySelector('.fd-host')) shell(el);
    const host = el.querySelector('.fd-host');
    const F = fr();
    FD.errs = check();
    const o = [];
    o.push(`<svg class="rung-svg sch-svg iec-svg free-svg${H.mode() === 'run' ? ' run' : ''}${lbl.color !== 'auto' ? ' tagc-' + lbl.color : ''}" width="100%" height="100%"><defs><pattern id="fdGrid" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.7" class="gridDot"/></pattern><pattern id="fdGridS" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M10 0 H0 V10" class="gridLine minor"/></pattern><pattern id="fdGrid2" width="40" height="40" patternUnits="userSpaceOnUse"><rect width="40" height="40" fill="url(#fdGridS)"/><path d="M40 0 H0 V40" class="gridLine"/></pattern></defs><g class="fv" transform="translate(${view.x} ${view.y}) scale(${view.k})"><rect class="fbg" x="-5000" y="-5000" width="10000" height="10000" fill="${grid === 'lines' ? 'url(#fdGrid2)' : grid === 'dots' ? 'url(#fdGrid)' : 'transparent'}"/>`);
    const R = routeAll(), liveNets = new Set(), netPot = new Map();
    for (const w of F.wires) {
      const a = endPos(w.a), b = endPos(w.b); if (!a || !b) continue;
      const ia = itemOf(w.a.split(':')[0]), dk = devKey(ia, w.a.split(':')[1]), on = live(dk), lo = !on && neg(dk), pc = potOf(dk);
      if (pc) netPot.set(R.netOf.get(w.id), pc);
      if (on) liveNets.add(R.netOf.get(w.id));
      const d = R.d.get(w.id) || wirePath(a, b, w.pts);
      o.push(`<g class="fwire${sel && sel.w === w.id ? ' sel' : ''}" data-fw="${w.id}"><path class="fwh" d="${d}"/><path class="w${on ? ' on' : lo ? ' neg' : ''}${pc ? ' p-' + pc : ''}${wireCls(w)}" d="${d}"/>${on ? `<path class="wflow" d="${d}"/>` : ''}</g>`);
      // the selected wire: a handle round its middle part, the one to drag (Simurelay's centre segment)
      if (sel && sel.w === w.id) { const P = d.replace('M', '').split(' L').map(q => q.trim().split(' ').map(Number)), i = Math.max(0, Math.floor((P.length - 2) / 2)), p = P[i], q = P[i + 1] || p; o.push(`<rect class="fseg" x="${Math.min(p[0], q[0]) - 5}" y="${Math.min(p[1], q[1]) - 5}" width="${Math.abs(q[0] - p[0]) + 10}" height="${Math.abs(q[1] - p[1]) + 10}" rx="2"/>`); }
      if (sel && sel.w === w.id) (w.pts || []).forEach(([x, y], i) => o.push(`<circle class="fbend" data-fb="${w.id}:${i}" cx="${x}" cy="${y}" r="5"><title>Drag to move · double-click to remove</title></circle>`));
    }
    const used = new Set(F.wires.flatMap(w => [w.a, w.b]));
    for (const j of R.dots) o.push(`<circle class="fjdot${liveNets.has(j.net) ? ' on' : ''}${netPot.has(j.net) ? ' p-' + netPot.get(j.net) : ''}" cx="${j.x}" cy="${j.y}" r="3.5"/>`);
    for (const it of F.items) {
      const S = K[it.k], st = stateOf(it), err = FD.errs.has(it);
      // a symbol that just switched flashes once
      const was = flips.get(it.id); if (!was || was.on !== st.on) flips.set(it.id, { on: st.on, t: was ? Date.now() : 0 });
      const flip = Date.now() - flips.get(it.id).t < 400;
      const hit = S.look === 'node' ? `<rect class="hit" x="${it.x - 8}" y="${it.y - 8}" width="16" height="16" rx="8"/>`
        : S.look === 'text' ? `<rect class="hit" x="${it.x - 6}" y="${it.y - 12}" width="${(it.txt || '').length * 7.5 + 12}" height="22" rx="4"/>`
        : S.look === 'gnd' ? `<rect class="hit" x="${it.x - 14}" y="${it.y - 24}" width="28" height="36" rx="4"/>`
        : `<rect class="hit" x="${it.x - 34}" y="${it.y - 34}" width="68" height="68" rx="6"/>`;
      o.push(`<g class="fitem${(sel && sel.i === it.id) || group.has(it.id) ? ' sel' : ''}" data-fi="${it.id}">${hit}`);
      o.push(`<g data-look="${S.look}" class="ssym${st.on ? ' on' : ''}${flip ? ' flip' : ''}${err ? ' err' : ''}${st.miss ? ' miss' : ''}${st.low || st.nocoil ? ' lowv' : ''}" transform="translate(${it.x} ${it.y}) rotate(${it.r})">${err ? `<title>${esc(FD.errs.get(it))}</title>` : st.low ? `<title>${esc(it.tag)}: coil voltage too low — see Properties</title>` : st.nocoil ? `<title>${esc(it.tag)}: its coil (A1-A2) is drawn nowhere, so this contact never switches — draw the coil or give this contact the tag of a contactor that has one</title>` : ''}${shape(it, st)}</g>`);
      o.push(labels(it, S));
      if (FD.values) { const v = valueOf(it); if (v) o.push(`<text class="fval" x="${it.x + 26}" y="${it.y + 40}">${esc(v)}</text>`); }
      const cd = countOf(it); if (cd) o.push(`<text class="fval fcount" data-fc="${it.id}" x="${it.x + 20}" y="${it.y - 14}">${esc(cd)}</text>`);
      S.terms.forEach(t => { const p = termPos(it, t.id), key = it.id + ':' + t.id; o.push(`<rect class="fterm${wiring && wiring.from === key ? ' on' : ''}${used.has(key) ? ' used' : ''}" data-ft="${it.id}:${t.id}" data-x="${p.x}" data-y="${p.y}" x="${p.x - 4}" y="${p.y - 4}" width="8" height="8"/>`); });
      o.push('</g>');
    }
    // as in Simurelay: guides through the terminals of the selected symbol (or the one being moved)
    const gIt = drag && drag.item && drag.moved ? drag.item : sel && sel.i && !group.size && H.mode() === 'edit' ? itemOf(sel.i) : null, gOthers = drag && drag.others ? drag.others : [];
    if (gIt && !['node', 'text'].includes(K[gIt.k].look)) {
      const mine = K[gIt.k].terms.map(t => termPos(gIt, t.id)), xs = new Set(), ys = new Set();
      for (const it of F.items) if (it !== gIt && !gOthers.some(q => q.o === it)) for (const t of K[it.k].terms) { const p = termPos(it, t.id); for (const m of mine) { if (m.x === p.x) xs.add(p.x); if (m.y === p.y) ys.add(p.y); } }
      // as in Simurelay: a guide through every terminal of the symbol being moved; a line it shares with another terminal is marked
      new Set(mine.map(m => m.x)).forEach(x => o.push(`<line class="fguide${xs.has(x) ? ' hit' : ''}" x1="${x}" y1="-5000" x2="${x}" y2="5000"/>`));
      new Set(mine.map(m => m.y)).forEach(y => o.push(`<line class="fguide${ys.has(y) ? ' hit' : ''}" x1="-5000" y1="${y}" x2="5000" y2="${y}"/>`));
    }
    if (wiring && (wiring.cur || (wiring.pts && wiring.pts.length))) { const a = endPos(wiring.from); if (a) o.push(`<path class="wtemp" d="${tempPath(a)}"/>`); }
    if (drag && drag.box) { const b = boxOf(drag); o.push(`<rect class="fbox" x="${b.x1}" y="${b.y1}" width="${b.x2 - b.x1}" height="${b.y2 - b.y1}"/>`); }
    o.push('</g></svg>');
    if (!F.items.length) {
      // a project with devices in the Wiring but no drawing says so: the drawing is not made from the Wiring by itself.
      // Plain HTML over the drawing, so the text wraps on a phone instead of running off the edge
      const wired = ((App.project && App.project.circuit && App.project.circuit.comps) || []).length;
      o.push(`<div class="fd-empty"><b>${wired ? 'This project has no Electrical Diagram yet — its devices are only in the Wiring.' : 'Empty drawing.'}</b>
        <span>Add symbols from ▦ Library, then tap two terminals to wire them.${wired ? ' Finished diagrams: Examples → Star-delta starter, Three motors.' : ''}</span></div>`);
    }
    host.innerHTML = o.join('');
    applyPalette(el.querySelector('.fd-wrap'));
    const vw = el.closest('.view') || el, pb = vw.querySelector(':scope > .fd-pbar'), ph = pbar && H.mode() === 'edit' ? barHtml() : '';
    if (!ph) pbar = null;
    pb.hidden = !ph; if (pb.innerHTML !== ph && !(pb.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName))) pb.innerHTML = ph;
    vw.classList.toggle('fd-barred', !!ph);
    svg = host.querySelector('svg'); gv = svg.querySelector('.fv');
    // an opened project shows its whole drawing (no bigger than 100 %), not the corner the last one was looking at
    if (needFit && svg.clientWidth) { needFit = false; FD.zoom('fit', 1); }
    bind();
    lastSig = sig();
  };
  // a countdown only redraws the drawing when it appears or goes away; its value is written in place by FD.update
  const sig = () => { const F = fr(); return (FD.values ? F.items.map(valueOf).join(',') : '') + F.items.map(it => (countOf(it) ? 1 : 0)).join('') + F.items.map(it => { const s = stateOf(it); return s.on ? 1 : 0; }).join('') + '|' + F.wires.map(w => { const ia = itemOf(w.a.split(':')[0]); return (ia ? potOf(devKey(ia, w.a.split(':')[1])) : '') + wireCls(w); }).join('') + H.mode(); };
  /* ▶ Play / ■ Stop, as Simurelay: protections work by hand only, and every device drawn here starts from its rest
     state (buttons out, switches and breakers off, timers cleared, coils out); Stop puts them back there */
  FD.playChanged = function (on) {
    Circuit.setManual(on);
    const seen = new Set();
    for (const it of fr().items) {
      const S = K[it.k]; if (!S.type || S.jct || S.types || S.pot) continue;
      const d = H.devOf(it.tag); if (!d || seen.has(d) || ['supply1', 'supply3', 'battery', 'psu24', 'gen3'].includes(d.type)) continue;
      seen.add(d);
      const D = DEFS[d.type]; d.state = D.init ? D.init() : {};
    }
    shortShown = false;
    if (body) FD.render(body);
  };
  let shortShown = false;
  // a short circuit while playing stops the simulation (Simurelay: "Short circuit detected! Simulation stopped.")
  function shortStop() {
    const api = App.api; if (!api || !api.net || !api.net.short || !api.net.short.size || H.mode() !== 'run' || !Circuit.isManual() || shortShown) return false;
    shortShown = true;
    UI.toast('Short circuit detected! Simulation stopped.', 'danger', 5000);
    App.log('alarm', 'Short circuit detected in the Electrical Diagram: simulation stopped');
    const b = body && body.closest('.view') && body.closest('.view').querySelector('[data-fdact="play"]'); if (b) b.click();
    return true;
  }
  FD.update = function () {
    if (!body) return;
    if (shortStop()) return;
    if (sig() !== lastSig) { FD.render(body); return; }
    if (svg) svg.querySelectorAll('[data-fc]').forEach(e => { const it = itemOf(e.dataset.fc), t = it ? countOf(it) : ''; if (e.textContent !== t) e.textContent = t; });
  };
  const world = ev => { const r = svg.getBoundingClientRect(); return { x: (ev.clientX - r.left - view.x) / view.k, y: (ev.clientY - r.top - view.y) / view.k }; };
  const snap10 = v => Math.round(v / 10) * 10;
  const boxOf = d => ({ x1: Math.min(d.x0, d.x1), y1: Math.min(d.y0, d.y1), x2: Math.max(d.x0, d.x1), y2: Math.max(d.y0, d.y1) });
  let held = null, lastTap = { k: '', t: 0 };
  // touch: two fingers on the drawing zoom it (pinch) around their middle
  // pointer capture keeps a drag going outside the drawing; a pointer that is already gone cannot be captured, which is harmless
  const capture = ev => { try { svg.setPointerCapture(ev.pointerId); } catch (e) { /* pointer already released */ } };
  const touches = new Map();
  let pinch = null, longT = null;
  /* the wire being drawn ends on terminal key, or on wire wEl at p (a junction dot there, and both wires meet on it) */
  // the wire being drawn: its corners so far, then to the pointer
  function tempPath(a) {
    const pts = wiring.pts || [], last = wiring.cur || (pts.length ? { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] } : a);
    if (wiring.over && !pts.length && routing === 'simple') {
      const [fi, ft] = wiring.from.split(':'), [oi, ot] = wiring.over.split(':'), b = endPos(wiring.over);
      if (b) return 'M' + simplePath(a, termDir(itemOf(fi), ft), b, termDir(itemOf(oi), ot)).map(p => `${p.x} ${p.y}`).join(' L');
    }
    return wirePath(a, last, pts);
  }
  /* where a symbol at (nx, ny) would snap so one of its wired terminals lines up with the other end of the wire */
  function alignTo(it, nx, ny) {
    let bx = null, by = null, dx = 13, dy = 13;
    for (const w of fr().wires) {
      const mine = w.a.startsWith(it.id + ':') ? w.a : w.b.startsWith(it.id + ':') ? w.b : null; if (!mine) continue;
      const other = mine === w.a ? w.b : w.a; if (other.startsWith(it.id + ':')) continue;
      const o = endPos(other), t = K[it.k].terms.find(q => q.id === mine.split(':')[1]); if (!o || !t) continue;
      const [rx, ry] = rot(t.x, t.y, it.r), ex = Math.abs(nx + rx - o.x), ey = Math.abs(ny + ry - o.y);
      if (ex < dx) { dx = ex; bx = o.x - rx; }
      if (ey < dy) { dy = ey; by = o.y - ry; }
    }
    return { x: bx != null ? bx : nx, y: by != null && bx == null ? by : ny };
  }
  function endWire(key, wEl, p) {
    if (key) {
      if (key !== wiring.from && !fr().wires.some(w => (w.a === wiring.from && w.b === key) || (w.b === wiring.from && w.a === key))) {
        H.snap(); const F = fr(); F.seq++; F.wires.push({ id: 'fw' + F.seq, a: wiring.from, b: key, ...(wiring.pts && wiring.pts.length ? { pts: wiring.pts } : {}) });
        wiring = null; H.changed(); return true;
      }
      wiring = null; FD.render(body); return true;
    }
    const w = fr().wires.find(x => x.id === wEl.dataset.fw);
    if (!w || w.a === wiring.from || w.b === wiring.from) return false;
    if (full()) { wiring = null; FD.render(body); return true; }
    H.snap();
    const j = splitWire(w, { x: snap10(p.x), y: snap10(p.y) }), F = fr();
    F.seq++; F.wires.push({ id: 'fw' + F.seq, a: wiring.from, b: j, ...(wiring.pts && wiring.pts.length ? { pts: wiring.pts } : {}) });
    wiring = null; H.changed(); return true;
  }
  function bind() {
    // right-click on a symbol or a terminal opens its property bar (as Simurelay)
    svg.addEventListener('contextmenu', ev => {
      if (H.mode() !== 'edit') return;
      const term = ev.target.closest('[data-ft]'), itEl = ev.target.closest('[data-fi]'); if (!term && !itEl) return;
      ev.preventDefault(); drag = null; FD.openBar(term ? term.dataset.ft : itemOf(itEl.dataset.fi));
    });
    svg.addEventListener('pointerdown', ev => {
      if (ev.button === 2) return;
      if (ev.pointerType === 'touch') {
        touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (touches.size === 2) {
          const [a, b] = [...touches.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, vx: view.x, vy: view.y, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
          // a symbol the first finger already moved is kept (synced and saved) before the pinch takes over
          if (drag && drag.snapped) H.changed();
          drag = null; wiring = null; clearTimeout(longT); if (held) { held(); held = null; }
          return;
        }
      }
      const p = world(ev), term = ev.target.closest('[data-ft]'), itEl = ev.target.closest('[data-fi]'), wEl = ev.target.closest('[data-fw]'), bEl = ev.target.closest('[data-fb]');
      // double click / double tap (the drawing is redrawn between the two clicks, so the browser's dblclick is not used)
      // a tap on a terminal is never half of a double tap (wiring taps one terminal of a symbol, then its other one)
      const tapKey = term ? '' : bEl ? 'b' + bEl.dataset.fb : wEl ? 'w' + wEl.dataset.fw : itEl ? 'i' + itEl.dataset.fi : '';
      const dbl = tapKey && lastTap.k === tapKey && Date.now() - lastTap.t < 400;
      lastTap = { k: tapKey, t: Date.now() };
      if (dbl && H.mode() === 'edit' && !wiring) {
        lastTap = { k: '', t: 0 };
        if (bEl) { const [wid, i] = bEl.dataset.fb.split(':'), w = fr().wires.find(x => x.id === wid); if (w) { H.snap(); w.pts.splice(Number(i), 1); if (!w.pts.length) delete w.pts; H.changed(); } return; }
        if (wEl) { const w = fr().wires.find(x => x.id === wEl.dataset.fw); if (w) { sel = { w: w.id }; addBend(w, [snap10(p.x), snap10(p.y)]); } return; }
        if (itEl && K[itemOf(itEl.dataset.fi).k].look !== 'node') { drag = null; FD.openBar(itemOf(itEl.dataset.fi)); return; }
      }
      if (bEl && H.mode() === 'edit') {
        const [wid, i] = bEl.dataset.fb.split(':'), w = fr().wires.find(x => x.id === wid);
        if (w) { drag = { bend: w, i: Number(i), moved: false, snapped: false }; capture(ev); }
        return;
      }
      if (H.mode() === 'run') {
        if (itEl) {
          const it = itemOf(itEl.dataset.fi), S = K[it.k], d = H.devOf(it.tag);
          // a fuse: one tap blows it, the next replaces it (as Simurelay, protections are operated by hand)
          if (d && S.look === 'fuse') { d.state.tripped = !d.state.tripped; App.log('operator', `${d.props.label}: fuse ${d.state.tripped ? 'blown' : 'replaced'}`); FD.render(body); }
          else if (d && S.part === 'ol') App.operate(d, d.state.tripped ? 'reset' : 'test')();
          else if (d && S.part) { ev.preventDefault(); held = App.operate(d, S.part); }
          return;
        }
        drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; capture(ev); return;
      }
      if (term) {
        // a wire starts on a terminal: drag to the other terminal, or let go and tap it
        if (!wiring) { wiring = { from: term.dataset.ft, cur: null, down: { x: ev.clientX, y: ev.clientY } }; sel = null; group.clear(); capture(ev); FD.render(body); return; }
        endWire(term.dataset.ft); return;
      }
      if (wiring && wEl && endWire(null, wEl, p)) return;
      // as in Simurelay: a click anywhere else cancels the wire being drawn
      if (wiring) { wiring = null; FD.render(body); return; }
      if (itEl) {
        const it = itemOf(itEl.dataset.fi);
        // Shift+click adds the symbol to the selection, or takes it out
        if (ev.shiftKey) {
          if (sel && sel.i && !group.size) group.add(sel.i);
          if (group.has(it.id)) group.delete(it.id); else group.add(it.id);
          sel = group.size ? { i: group.has(it.id) ? it.id : [...group][0] } : null;
          FD.render(body); H.side(); return;
        }
        if (!group.has(it.id)) group.clear();
        sel = { i: it.id };
        // dragging one symbol of the selection moves them all
        const others = [...group].filter(id => id !== it.id).map(id => itemOf(id)).filter(Boolean).map(o => ({ o, dx: o.x - it.x, dy: o.y - it.y }));
        drag = { item: it, others, ox: p.x - it.x, oy: p.y - it.y, moved: false, snapped: false };
        // a long press on a touch screen opens the symbol's property bar (as a double click does)
        if (ev.pointerType === 'touch' && K[it.k].look !== 'node') { clearTimeout(longT); longT = setTimeout(() => { if (drag && drag.item === it && !drag.moved) { drag = null; FD.openBar(it); } }, 600); }
        capture(ev); FD.render(body); H.side(); return;
      }
      if (wEl) {
        sel = { w: wEl.dataset.fw }; group.clear();
        const w = fr().wires.find(x => x.id === wEl.dataset.fw), dd = wEl.querySelector('.w').getAttribute('d');
        // its corners (repeated points and points that make no turn dropped)
        const P = [];
        for (const t of dd.replace('M', '').split(' L')) {
          const [x, y] = t.trim().split(' ').map(Number), q = P[P.length - 1];
          if (q && q.x === x && q.y === y) continue;
          if (P.length > 1) { const r = P[P.length - 2]; if ((r.x === q.x && q.x === x) || (r.y === q.y && q.y === y)) P.pop(); }
          P.push({ x, y });
        }
        // the segment under the pointer
        let i = 0, bd = Infinity;
        for (let k = 1; k < P.length; k++) { const a = P[k - 1], b = P[k], x = Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x)), y = Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y)), dd2 = Math.hypot(p.x - x, p.y - y); if (dd2 < bd) { bd = dd2; i = k - 1; } }
        if (w && P.length >= 2 && (P[i].x === P[i + 1].x || P[i].y === P[i + 1].y)) { drag = { seg: w, P, i, moved: false, snapped: false }; capture(ev); }
        FD.render(body); H.side(); return;
      }
      // Shift+drag on the background selects the symbols inside a box
      if (ev.shiftKey) { drag = { box: true, x0: p.x, y0: p.y, x1: p.x, y1: p.y }; capture(ev); return; }
      sel = null; group.clear(); pbar = null; H.side();
      drag = { pan: true, sx: ev.clientX, sy: ev.clientY, vx: view.x, vy: view.y }; capture(ev);
      FD.render(body);
    });
    svg.addEventListener('pointermove', ev => {
      if (ev.pointerType === 'touch' && touches.has(ev.pointerId)) {
        touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pinch && touches.size === 2) {
          const [a, b] = [...touches.values()], r = svg.getBoundingClientRect(), mx = pinch.mx - r.left, my = pinch.my - r.top;
          const k = Math.max(0.3, Math.min(3, pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d));
          view = { k, x: mx - (mx - pinch.vx) * k / pinch.k, y: my - (my - pinch.vy) * k / pinch.k };
          gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
          return;
        }
      }
      if (drag && drag.box) { const q = world(ev); drag.x1 = q.x; drag.y1 = q.y; FD.render(body); return; }
      if (wiring) { const p = world(ev), ot = document.elementFromPoint(ev.clientX, ev.clientY), oe = ot && ot.closest && ot.closest('[data-ft]'); wiring.over = oe && oe.dataset.ft !== wiring.from ? oe.dataset.ft : null; wiring.cur = { x: snap10(p.x), y: snap10(p.y) }; const t = svg.querySelector('.wtemp'); const a = endPos(wiring.from); if (t && a) t.setAttribute('d', tempPath(a)); else if (a) FD.render(body); }
      if (!drag) return;
      if (drag.seg) {
        const q = world(ev), { seg: w } = drag;
        let P = drag.P.map(o => ({ ...o })), i = drag.i;
        const vert = P[i].x === P[i + 1].x && P[i].y !== P[i + 1].y;
        // the first and the last segment start on a terminal: moving one adds a short piece from the terminal
        if (i === 0) { P.unshift({ ...P[0] }); i++; }
        if (i + 1 === P.length - 1) P.push({ ...P[P.length - 1] });
        const v = vert ? snap10(q.x) : snap10(q.y);
        if (vert) { P[i].x = v; P[i + 1].x = v; } else { P[i].y = v; P[i + 1].y = v; }
        const pts = P.slice(1, -1).map(o => [o.x, o.y]).filter((o, k, A) => !k || o[0] !== A[k - 1][0] || o[1] !== A[k - 1][1]);
        if (JSON.stringify(pts) !== JSON.stringify(w.pts || [])) { if (!drag.snapped) { H.snap(); drag.snapped = true; } w.pts = pts; drag.moved = true; FD.render(body); }
        return;
      }
      if (drag.bend) {
        const q = world(ev), pt = [snap10(q.x), snap10(q.y)], cur = drag.bend.pts[drag.i];
        if (cur && (cur[0] !== pt[0] || cur[1] !== pt[1])) { if (!drag.snapped) { H.snap(); drag.snapped = true; } drag.bend.pts[drag.i] = pt; drag.moved = true; FD.render(body); }
        return;
      }
      if (drag.pan) { view.x = drag.vx + ev.clientX - drag.sx; view.y = drag.vy + ev.clientY - drag.sy; gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`); return; }
      const p = world(ev); let nx = snap10(p.x - drag.ox), ny = snap10(p.y - drag.oy);
      if (!drag.others.length) { const s = alignTo(drag.item, nx, ny); nx = s.x; ny = s.y; }
      if (nx !== drag.item.x || ny !== drag.item.y) {
        if (!drag.snapped) { H.snap(); drag.snapped = true; }
        drag.item.x = nx; drag.item.y = ny; drag.others.forEach(q => { q.o.x = nx + q.dx; q.o.y = ny + q.dy; });
        drag.moved = true; clearTimeout(longT); FD.render(body);
      }
    });
    const up = ev => {
      // a wire dragged out of a terminal ends where it is let go: on a terminal, on a wire, or nowhere (cancelled)
      if (wiring && wiring.down && ev) {
        const d0 = wiring.down; wiring.down = null;
        if (Math.hypot(ev.clientX - d0.x, ev.clientY - d0.y) > 8) {
          const el = document.elementFromPoint(ev.clientX, ev.clientY), t = el && el.closest('[data-ft]'), we = el && el.closest('[data-fw]');
          if (t) endWire(t.dataset.ft); else if (!(we && endWire(null, we, world(ev)))) { wiring = null; FD.render(body); }
        }
      }
      if (ev && ev.pointerType === 'touch') { touches.delete(ev.pointerId); if (touches.size < 2) pinch = null; }
      clearTimeout(longT);
      if (held) { held(); held = null; }
      if (drag && drag.box) {
        const b = boxOf(drag), ins = fr().items.filter(i => i.x >= b.x1 && i.x <= b.x2 && i.y >= b.y1 && i.y <= b.y2).map(i => i.id);
        drag = null; group = new Set(ins); sel = ins.length ? { i: ins[0] } : null; FD.render(body); H.side(); return;
      }
      if (drag && drag.moved) { drag = null; H.changed(); return; }
      drag = null;
    };
    svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
    svg.addEventListener('wheel', ev => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top, k = Math.max(0.3, Math.min(3, view.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      view.x = mx - (mx - view.x) * k / view.k; view.y = my - (my - view.y) * k / view.k; view.k = k;
      gv.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.k})`);
    }, { passive: false });
  }

  /* ---------- editing ---------- */
  // tags in use: the Wiring's, this drawing's and those of parts a newer version made (kept in the project)
  const taken = () => new Set([...H.circ().comps.map(c => c.props.label), ...fr().items.map(i => i.tag), ...(H.circ().reserved || [])]);
  /* the contacts of one contactor in numbering order: the contactor's own 13-14 / 21-22, then its aux block */
  const AUX = { kmno: ['kmno', 'kxno1', 'kxno2'], kxno1: ['kmno', 'kxno1', 'kxno2'], kxno2: ['kmno', 'kxno1', 'kxno2'],
    kmnc: ['kmnc', 'kxnc1', 'kxnc2'], kxnc1: ['kmnc', 'kxnc1', 'kxnc2'], kxnc2: ['kmnc', 'kxnc1', 'kxnc2'] };
  // the aux block fits a plain contactor (or one already given the block), not the 4-pole or time-delay ones
  const auxDev = tag => { const d = H.devOf(tag); return !d || d.type === 'contactor' || d.type === 'contactor_aux'; };
  // the first contact of this kind the device has free (skipping the item itself)
  const nextAux = (k, tag, self) => AUX[k].find(a => !fr().items.some(i => i !== self && i.tag === tag && K[i.k].terms.some(t => K[a].terms.some(q => q.id === t.id))));
  /* a second N.O. (or N.C.) drawn for a contactor takes the next free contact of its aux block (53-54, 83-84 / 61-62,
     71-72); the wires on it follow, terminal by terminal */
  function renumber() {
    const F = fr();
    for (const it of F.items) {
      if (!AUX[it.k] || !auxDev(it.tag)) continue;
      const clash = F.items.some(i => i !== it && i.tag === it.tag && K[i.k].terms.some(t => K[it.k].terms.some(q => q.id === t.id)) && F.items.indexOf(i) < F.items.indexOf(it));
      if (!clash) continue;
      const nk = nextAux(it.k, it.tag, it); if (!nk || nk === it.k) continue;
      const map = Object.fromEntries(K[it.k].terms.map((t, i) => [t.id, K[nk].terms[i].id]));
      for (const w of F.wires) for (const e of ['a', 'b']) { const [id, t] = w[e].split(':'); if (id === it.id && map[t]) w[e] = id + ':' + map[t]; }
      it.k = nk;
    }
    // a contactor that has aux block contacts drawn gets the block
    for (const it of F.items) if (K[it.k].type === 'contactor_aux') { const d = H.devOf(it.tag); if (d && d.type === 'contactor') { Circuit.retype(d, 'contactor_aux', H.circ()); d.state.pulled = false; } }
  }
  function suggest(k) {
    const S = K[k], used = taken();
    const same = H.circ().comps.filter(c => (S.types ? S.types.includes(c.type) : Circuit.sameKind(c.type, S.type) && !Circuit.fitErr(c, S.type, S.terms.map(t => t.id), S.look))).map(c => c.props.label);
    // contacts, coils and poles suggest the last device of that kind that does not have this part drawn yet (a second coil
    // makes the next contactor, a contact goes to the contactor whose 13-14 is free); none free: the next new tag
    if (!['Sources', 'Switches', 'Sensors', 'Loads', 'Motors', 'Others'].includes(S.g) && same.length) {
      const ids = S.terms.map(t => t.id), drawn = tag => (AUX[k] && auxDev(tag) ? !nextAux(k, tag) : fr().items.some(i => i.tag === tag && K[i.k] && K[i.k].terms.some(t => ids.includes(t.id))));
      // first a device already on this drawing (its coil or another contact), then one the Wiring does not wire elsewhere
      // (the PLC motor example's KM1 is the motor contactor): never grab a device that belongs to another circuit
      const onSheet = tag => fr().items.some(i => i.tag === tag);
      const elsewhere = tag => { const d = H.devOf(tag); return !!d && H.circ().wires.some(w => !w.sch && (w.a.startsWith(d.id + ':') || w.b.startsWith(d.id + ':'))); };
      const free = same.filter(t => !drawn(t)), mine = free.filter(onSheet), spare = free.filter(t => !onSheet(t) && !elsewhere(t));
      const def = mine.length ? mine[mine.length - 1] : spare[spare.length - 1];
      if (def) return { def, list: same };
    }
    let n = 1; while (used.has(S.pre + n)) n++;
    return { def: S.pre + n, list: same };
  }
  /* a bend goes where it makes the route shortest */
  function addBend(w, pt) {
    const a = endPos(w.a), b = endPos(w.b), pts = w.pts || [];
    let best = 0, bl = Infinity;
    for (let i = 0; i <= pts.length; i++) { const t = [...pts.slice(0, i), pt, ...pts.slice(i)], l = routeLen(a, t, b); if (l < bl) { bl = l; best = i; } }
    H.snap(); w.pts = [...pts.slice(0, best), pt, ...pts.slice(best)]; H.changed();
  }
  function splitWire(w, pt) {
    const F = fr(), used = taken();
    let n = 1; while (used.has('J' + n)) n++;
    F.seq++;
    const node = { id: 'd' + F.seq, k: 'node', tag: 'J' + n, x: pt.x, y: pt.y, r: 0 }, j = node.id + ':J';
    F.items.push(node);
    F.seq++;
    F.wires.push({ id: 'fw' + F.seq, a: j, b: w.b });
    w.b = j; delete w.pts;
    return j;
  }
  // a saved drawing keeps 400 symbols (FD.clean)
  const MAXI = 400, full = () => { if (fr().items.length < MAXI) return false; UI.toast(`The drawing is full (${MAXI} symbols)`, 'warn'); return true; };
  FD.add = function (k, tag, x, y) {
    if (full()) return undefined;
    const go = t => {
      if (k === 'text') { if (!t) return 'Type some text'; } else if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      if (full()) return undefined;
      H.snap();
      const F = fr(); F.seq++;
      const r = svg ? svg.getBoundingClientRect() : { width: 600, height: 400 };
      // as in Simurelay: a symbol from the library lands in the middle of the view (selected, ready to drag into place)
      const c = x != null ? { x, y } : { x: snap10((r.width / 2 - view.x) / view.k), y: snap10((r.height / 2 - view.y) / view.k) };
      // the middle is taken (the symbol placed just before): the next free spot to the right, then the rows below,
      // so a new symbol never hides one that is already there
      if (x == null) {
        const taken = (px, py) => F.items.some(o => Math.abs(o.x - px) < 60 && Math.abs(o.y - py) < 60);
        let n = 0; const x0 = c.x, y0 = c.y;
        while (taken(c.x, c.y) && n < 40) { n++; c.x = x0 + (n % 8) * 80; c.y = y0 + Math.floor(n / 8) * 100; }
      }
      const cx = c.x, cy = c.y;
      const it = k === 'text' ? { id: 'd' + F.seq, k, tag: 'TXT', x: snap10(cx), y: snap10(cy), r: 0, txt: t.slice(0, 80) } : { id: 'd' + F.seq, k, tag: t, x: snap10(cx), y: snap10(cy), r: 0 };
      F.items.push(it); sel = { i: it.id }; group.clear();
      H.changed();
      return undefined;
    };
    if (tag) return go(tag);
    // a PLC symbol: the controller or card from the Wiring, and the point (its kind)
    if (K[k].types) return plcForm(K[k], null, (t, nk) => FD.add(nk, t, x, y));
    // wire pieces, junctions and potential points need no tag of their own
    if (K[k].auto) return go(suggest(k).def);
    if (k === 'text') { UI.form('Text', [{ key: 't', label: 'Text', value: '' }], v => go(v.t.trim())); return undefined; }
    const sg = suggest(k);
    // the tag is drawn on the symbol and shown in Properties: no message for every symbol placed
    if (!lbl.ask) return go(sg.def);
    UI.form(K[k].n, [{ key: 't', label: 'Device tag', value: sg.def, list: sg.list }], v => go(v.t.trim()),
      '<p class="help">Use the tag of a device in the Wiring (its contacts and coil share the tag), or a new tag: the device is added to the Wiring for you.</p>');
  };
  /* form for a PLC symbol: which PLC or I/O card (from the Wiring) and, for an I/O point, which point. done(tag, kind) */
  const base = k => k.replace(/\d+$/, '');
  function plcForm(S, it, done) {
    const devs = H.circ().comps.filter(c => S.types.includes(c.type)).map(c => c.props.label);
    if (!devs.length && !it) { UI.toast(`Add a ${S.types.map(t => DEFS[t].name).join(' or ')} in the Wiring first: the diagram uses the real controller`, 'warn', 6000); return undefined; }
    const b = it ? base(it.k) : base(Object.keys(K).find(k => K[k] === S)), pts = Object.keys(K).filter(k => base(k) === b && K[k].io).map(k => K[k].io.n);
    const fields = [{ key: 't', label: 'PLC or I/O card tag (from the Wiring)', value: it ? it.tag : devs[0], list: devs }];
    if (S.io) fields.push({ key: 'p', label: 'Point', value: String(it ? S.io.n : 0), options: pts.map(n => ({ v: String(n), l: `${S.io.d}${n}` })) });
    UI.form(S.n, fields, v => {
      const t = String(v.t || '').trim(); if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      return done(t, S.io ? b + Number(v.p) : (it ? it.k : b));
    }, '<p class="help">A PLC symbol is a terminal of the controller or I/O card placed in the Wiring: its wires are wired to that terminal, and it shows the live state of the point.</p>');
    return undefined;
  }
  /* a symbol gets another kind with terminals in the same order: its drawn wires follow (first terminal to first…) */
  function setKind(it, nk) {
    const S0 = K[it.k], S1 = K[nk], map = Object.fromEntries(S0.terms.map((t, i) => [t.id, S1.terms[i] ? S1.terms[i].id : t.id]));
    fr().wires.forEach(w => ['a', 'b'].forEach(e => { const [id, t] = w[e].split(':'); if (id === it.id && map[t]) w[e] = id + ':' + map[t]; }));
    it.k = nk;
  }
  FD.retag = function (it) {
    if (!it) return;
    if (K[it.k].types) return plcForm(K[it.k], it, (t, nk) => { H.snap(); if (nk !== it.k) setKind(it, nk); it.tag = t; H.changed(); return undefined; });
    if (it.k === 'text') {
      UI.form('Edit text', [{ key: 't', label: 'Text', value: it.txt || '' }], v => { const t = v.t.trim(); if (!t) return 'Type some text'; H.snap(); it.txt = t.slice(0, 80); H.changed(); return undefined; });
      return;
    }
    UI.form(`${K[it.k].n} — tag`, [{ key: 't', label: 'Device tag', value: it.tag, list: suggest(it.k).list }], v => {
      const t = v.t.trim(); if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      H.snap(); it.tag = t; H.changed();
    });
  };
  /* rename the device of a symbol: its coil, contacts and poles everywhere (and the Wiring device) take the new tag */
  FD.renameDevice = function (it) {
    if (!it || !K[it.k].type || K[it.k].jct || K[it.k].types) return;
    const old = it.tag, d = H.devOf(old);
    UI.form(`Rename -${old}`, [{ key: 't', label: 'New tag', value: old }], v => {
      const t = v.t.trim(); if (t === old) return undefined;
      if (!TAG.test(t)) return 'Use letters, numbers, - or _ (up to 20)';
      if (d) return window.Workspace.renameDevice(d, t) || undefined;
      // no device yet (a symbol not synced): the symbols with this tag take the new one
      if (H.devOf(t)) return `${t} is already the tag of another device`;
      window.Schematic.renameTag(old, t); return undefined;
    }, `<p class="help">Every symbol of -${esc(old)} (coil, contacts, poles) and the device in the Wiring take the new tag. To move only this symbol to another device, change its Tag in Properties.</p>`);
  };
  /* ---------- property bar (as Simurelay's): double-click, right-click or Values on a symbol opens it at the top of the
     drawing in place of the toolbar and the library. TAG steps the letter(s) of the tag, NUM1 its number (numbers
     another kind of device has are skipped); a comment; for a terminal, the number written beside it. A click on the
     drawing closes it. ---------- */
  // the prefixes TAG steps through, as Simurelay's lists (coils, timer coils, contactors, switches, breakers, fuses, loads, motors…)
  const COILS = ['K', 'KA', 'KM', 'KV', 'R', 'RA'], SW = ['S', 'SL'], BRK = ['Q', 'QA'], FUS = ['F', 'FA', 'FU'];
  const ALT = { K: COILS, KA: COILS, KM: ['K', 'KA', 'KM'], KT: ['KT', 'RT', 'T'], KF: ['KF', 'U'], S: SW, SB: SW, SA: SW, SF: SW, SJ: SW, SL: SW, SP: SW, SQ: SW, ST: SW, B: SW,
    Q: BRK, QF: BRK, QM: BRK, QS: BRK, QA: BRK, F: FUS, FU: FUS, FR: FUS, FC: FUS, FA: FUS, H: ['H', 'L'], HL: ['H', 'L'], HA: ['H', 'L'], M: ['M', 'MA', 'MP'], G: ['G'], GB: ['V'], Y: ['EV', 'Y'] };
  const ONLY_FREE = ['Sources', 'Switches', 'Sensors', 'Loads', 'Motors', 'Others'];
  let pbar = null, pbTab = 'num';
  const splitTag = t => { const m = /^(.*?)(\d+)$/.exec(t || ''); return m ? { pre: m[1], n: Number(m[2]) } : { pre: t || '', n: 0 }; };
  // may this symbol take that tag? a free tag, or a device of its kind whose part is not drawn yet (a contact of K2)
  function tagOk(it, t) {
    if (t === it.tag) return true;
    if (!TAG.test(t)) return false;
    const S = K[it.k], d = H.devOf(t), R = H.circ().reserved;
    if (R && R.has(t)) return false;
    if (!d) return !fr().items.some(i => i !== it && i.tag === t);
    if (ONLY_FREE.includes(S.g) || !S.type || !Circuit.sameKind(d.type, S.type) || Circuit.fitErr(d, S.type, S.terms.map(q => q.id), S.look)) return false;
    const ids = S.terms.map(q => q.id);
    return !fr().items.some(i => i !== it && i.tag === t && K[i.k].terms.some(q => ids.includes(q.id)));
  }
  FD.barStep = function (dir) {
    const it = pbar && pbar.i && itemOf(pbar.i); if (!it) return false;
    const { pre, n } = splitTag(it.tag);
    let t = null;
    if (pbTab === 'tag') {
      const list = ALT[K[it.k].pre] || [K[it.k].pre], i = list.indexOf(pre);
      for (let s = 1; s <= list.length && !t; s++) {
        const p = list[(((i < 0 ? 0 : i) + dir * s) % list.length + list.length) % list.length];
        for (let m = Math.max(1, n); m < 1000 && !t; m++) if (tagOk(it, p + m)) t = p + m;
      }
    } else for (let m = n + dir; m >= 1 && m < 1000; m += dir) if (tagOk(it, pre + m)) { t = pre + m; break; }
    if (!t || t === it.tag) return false;
    FD.setProp(it, 'tag', t); return true;
  };
  FD.openBar = function (target) {
    if (!target) return;
    pbar = typeof target === 'string' ? { t: target } : { i: target.id };
    if (pbar.i) { sel = { i: pbar.i }; group.clear(); } wiring = null;
    if (body) FD.render(body);
  };
  /* Values (toolbar): the property bar of the selected symbol, or of the terminal just picked; with nothing selected, the values on the drawing */
  FD.valuesAct = function () { if (wiring && wiring.from) { FD.openBar(wiring.from); return true; } const it = sel && sel.i && itemOf(sel.i); if (it) { FD.openBar(it); return true; } return false; };
  FD.closeBar = function () { if (!pbar) return; pbar = null; if (body) FD.render(body); };
  FD.barOpen = () => pbar;
  function barHtml() {
    if (pbar && pbar.t) {
      const [id, tid] = pbar.t.split(':'), it = itemOf(id); if (!it) return '';
      return `<span class="fpb-name">Terminal ${esc(tid)} — -${esc(it.tag)}</span><input class="fpb-in" data-pbterm maxlength="6" value="${esc((it.tn && it.tn[tid]) || tid)}" aria-label="Terminal number">`;
    }
    const it = pbar && itemOf(pbar.i); if (!it) return '';
    const S = K[it.k], tagged = S.type && !S.jct && !S.types && S.look !== 'text';
    const { pre, n } = splitTag(it.tag);
    return `<span class="fpb-name">${esc(S.n)}${S.look === 'text' ? '' : ': -' + esc(it.tag)}</span>` +
      (S.look === 'text' ? `<input class="fpb-in fpb-cmt" data-pbtext maxlength="80" value="${esc(it.txt || '')}" aria-label="Text">` : `<input class="fpb-in fpb-cmt" data-pbcmt maxlength="80" placeholder="Enter a comment" value="${esc(it.c || '')}" aria-label="Comment">`) +
      (tagged ? `<span class="fpb-tabs"><button data-pbt="tag" class="${pbTab === 'tag' ? 'on' : ''}">TAG</button><button data-pbt="num" class="${pbTab === 'num' ? 'on' : ''}"><b>1</b>NUM1</button></span><button class="fpb-step" data-pbs="-1" aria-label="Previous">&lt;</button><span class="fpb-val">${esc(pbTab === 'tag' ? '-' + pre : String(n))}</span><button class="fpb-step" data-pbs="1" aria-label="Next">&gt;</button>` : '') +
      // the device's own settings (coil voltage, time…), the same ones as in the Wiring
      (() => { const d = tagged && H.devOf(it.tag); return d ? (DEFS[d.type].pdefs || []).map(p => `<label class="fpb-dev">${esc(p.n)} ${/^t2?$/.test(p.k) ? `<button class="fpb-step" data-pbn="${p.k}" data-d="-1" aria-label="Less">&lt;</button><span class="fpb-val">${(Number(d.props[p.k]) || 0).toFixed(1)}</span><button class="fpb-step" data-pbn="${p.k}" data-d="1" aria-label="More">&gt;</button>` : p.opts ? `<select data-pbd="${p.k}">${p.opts.map(o => `<option ${String(d.props[p.k]) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : `<input data-pbd="${p.k}" type="${p.type || 'text'}" value="${esc(d.props[p.k] ?? '')}">`}</label>`).join('') : ''; })();
  }
  function bindBar(el) {
    el.addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.pbt) { pbTab = b.dataset.pbt; FD.render(body); }
      else if (b.dataset.pbs) FD.barStep(Number(b.dataset.pbs));
      // a time: steps of 1 s from 0 to 60 s, round (as Simurelay)
      else if (b.dataset.pbn) { const it = itemOf(pbar.i), d = it && H.devOf(it.tag); if (d) { const v = Math.round(Number(d.props[b.dataset.pbn]) || 0) + Number(b.dataset.d); FD.setDevProp(it, b.dataset.pbn, String(v > 60 ? 0 : v < 0 ? 60 : v)); FD.render(body); } }
    });
    el.addEventListener('change', ev => {
      const t = ev.target;
      if (t.dataset.pbcmt != null) FD.setProp(itemOf(pbar.i), 'c', t.value);
      else if (t.dataset.pbtext != null) { const it = itemOf(pbar.i), v = t.value.trim(); if (it && v) { H.snap(); it.txt = v.slice(0, 80); H.changed(); } }
      else if (t.dataset.pbterm != null) FD.setTermLabel(pbar.t, t.value);
      else if (t.dataset.pbd) FD.setDevProp(itemOf(pbar.i), t.dataset.pbd, t.value);
    });
    el.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Enter') ev.target.blur(); else if (ev.key === 'Escape') FD.closeBar(); });
  }
  /* the number written beside a terminal (Simurelay: select the terminal, VALUES); the terminal itself stays the same */
  FD.setTermLabel = function (key, v) {
    const [id, tid] = String(key).split(':'), it = itemOf(id); if (!it || !K[it.k].terms.some(q => q.id === tid)) return false;
    const s = String(v).trim().slice(0, 6); H.snap();
    if (s && s !== tid) it.tn = { ...(it.tn || {}), [tid]: s }; else if (it.tn) { delete it.tn[tid]; if (!Object.keys(it.tn).length) delete it.tn; }
    H.changed(); return true;
  };
  /* ---------- ⋯ menu and Settings (as Simurelay's): grid, zoom panel, dark mode and the drawing colours ---------- */
  const PAL = [['tag', 'Element Tag'], ['cmt', 'Element Comment'], ['term', 'Terminal Tag'], ['N', 'Neutral'], ['L1', 'Power Supply L1'], ['L2', 'Power Supply L2'], ['L3', 'Power Supply L3'], ['PE', 'Protection Earth PE'], ['P', 'Positive Power'], ['M', 'Negative Power']];
  const darkNow = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : !!(window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches); };
  let palette = (() => { try { const v = JSON.parse(localStorage.getItem('plc-trainer.fdPalette')); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } })();
  let zoomPanel = (() => { try { return localStorage.getItem('plc-trainer.fdZoomPanel') !== '0'; } catch (e) { return true; } })();
  const HEX = /^#[0-9a-f]{6}$/i;
  // the colours changed in Settings, for the current theme, as CSS variables on the drawing
  function applyPalette(wrap) {
    if (!wrap) return;
    const p = palette[darkNow() ? 'dark' : 'light'] || {};
    PAL.forEach(([k]) => { if (HEX.test(p[k] || '')) wrap.style.setProperty('--fd-' + k, p[k]); else wrap.style.removeProperty('--fd-' + k); });
    wrap.classList.toggle('nozoom', !zoomPanel);
  }
  FD.setPalette = function (k, v) {
    const th = darkNow() ? 'dark' : 'light';
    if (k == null) palette = {}; else { palette[th] = { ...(palette[th] || {}) }; if (HEX.test(v || '')) palette[th][k] = v; else delete palette[th][k]; }
    try { localStorage.setItem('plc-trainer.fdPalette', JSON.stringify(palette)); } catch (e) { /* private mode */ }
    if (body) FD.render(body);
  };
  FD.setZoomPanel = function (on) { zoomPanel = !!on; try { localStorage.setItem('plc-trainer.fdZoomPanel', zoomPanel ? '1' : '0'); } catch (e) { /* private mode */ } if (body) FD.render(body); };
  FD.settings = function () {
    const wrap = body && body.querySelector('.fd-wrap'), cs = wrap ? getComputedStyle(wrap) : null;
    const col = k => { const v = cs ? cs.getPropertyValue('--fd-' + k).trim() : ''; return HEX.test(v) ? v : '#000000'; };
    const sw = (k, on, label) => `<label class="fds-row"><input type="checkbox" data-fds="${k}" ${on ? 'checked' : ''}> ${label}</label>`;
    UI.modal({ title: 'Settings', body: `<div class="fds"><h4>General</h4>${sw('grid', grid !== 'none', 'Show Grid')}${sw('zoom', zoomPanel, 'Show Zoom Panel')}${sw('dark', darkNow(), 'Dark Mode')}
      <h4>Drawing</h4><label class="fds-row">Wires <select data-fds="routing">${Object.entries(ROUTINGS).map(([k, n]) => `<option value="${k}" ${k === routing ? 'selected' : ''}>${n}</option>`).join('')}</select></label>${sw('tags', lbl.tags, 'Show tags (-KM1)')}${sw('terms', lbl.terms, 'Show terminal numbers')}${sw('ask', lbl.ask, 'Ask for a tag when placing a symbol')}
      <h4>Colors</h4>${PAL.map(([k, n]) => `<label class="fds-row"><input type="color" data-fdc="${k}" value="${col(k)}"> ${n}</label>`).join('')}
      <button class="btn" data-fdreset>Reset to Default Settings</button></div>`,
    onOpen: el => {
      el.addEventListener('change', ev => {
        const t = ev.target;
        if (t.dataset.fds === 'grid') FD.setGrid(t.checked ? 'lines' : 'none');
        else if (t.dataset.fds === 'zoom') FD.setZoomPanel(t.checked);
        else if (t.dataset.fds === 'dark') { App.setTheme(t.checked ? 'dark' : 'light'); if (body) FD.render(body); el.querySelectorAll('[data-fdc]').forEach(c => { c.value = col(c.dataset.fdc); }); }
        else if (t.dataset.fdc) FD.setPalette(t.dataset.fdc, t.value);
        else if (t.dataset.fds === 'routing') FD.setRouting(t.value);
        else if (['tags', 'terms', 'ask'].includes(t.dataset.fds)) FD.setLabels({ [t.dataset.fds]: t.checked });
      });
      el.querySelector('[data-fdreset]').addEventListener('click', () => { FD.setPalette(null); FD.setGrid('lines'); FD.setZoomPanel(true); el.querySelectorAll('[data-fdc]').forEach(c => { c.value = col(c.dataset.fdc); }); el.querySelector('[data-fds="grid"]').checked = true; el.querySelector('[data-fds="zoom"]').checked = true; });
    } });
  };
  FD.menu = function (x, y) {
    // the drawing tools that are not on the short toolbar, then the file commands
    const act = a => () => { const b = document.querySelector(`#view-schematic [data-fdact="${a}"]`); if (b) b.click(); };
    UI.menu(x, y, [
      { label: (FD.values ? '✓ ' : '') + 'Show values', onClick: act('values') },
      { label: (FD.colors ? '✓ ' : '') + 'Wire colours by conductor', onClick: act('colors') },
      { label: 'Duplicate', onClick: act('copy') },
      { label: 'Change type…', onClick: act('type') },
      { label: 'Bring to front', onClick: act('front') },
      { label: 'Send to back', onClick: act('back') },
      { sep: true },
      { label: 'New', onClick: () => App.newProject() },
      { label: 'Open', onClick: () => App.openDialog() },
      { label: 'Capture', onClick: () => FD.exportImage('png') },
      { label: 'Save', onClick: () => App.saveNow() },
      { label: 'Save As', onClick: () => App.saveAs() },
      { sep: true },
      { label: 'Settings', onClick: () => FD.settings() },
    ]);
  };
  FD.rotate = function () {
    const ids = many(); if (!ids.length) { UI.toast('Select a symbol first'); return; }
    H.snap(); ids.forEach(id => { const it = itemOf(id); it.r = (it.r + 90) % 360; }); H.changed();
  };
  /* move the selection by a grid step (arrow keys; with Shift five steps) */
  FD.nudge = function (dx, dy) {
    const ids = many(); if (!ids.length) return false;
    H.snap(); ids.forEach(id => { const it = itemOf(id); it.x += dx; it.y += dy; }); H.changed();
    return true;
  };
  FD.selectAll = function () { group = new Set(fr().items.map(i => i.id)); sel = group.size ? { i: [...group][0] } : null; if (body) FD.render(body); H.side(); };
  FD.selection = () => many();
  /* clipboard: the selected symbols and the wires between them */
  FD.copySel = function () {
    const ids = many(); if (!ids.length) { UI.toast('Select a symbol first'); return false; }
    const set = new Set(ids), F = fr();
    clip = { items: ids.map(id => JSON.parse(JSON.stringify(itemOf(id)))), wires: F.wires.filter(w => set.has(w.a.split(':')[0]) && set.has(w.b.split(':')[0])).map(w => JSON.parse(JSON.stringify(w))) };
    return true;
  };
  FD.hasClip = () => !!(clip && clip.items.length);
  /* paste a copy beside the original: new devices with new tags, but a coil and its contacts copied together stay one
     device (one new tag for one old tag); a PLC symbol stays on its controller, a text keeps its text */
  FD.paste = function (dx = 40, dy = 40) {
    if (!FD.hasClip()) return false;
    const F = fr();
    if (F.items.length + clip.items.length > MAXI) { UI.toast(`The drawing is full (${MAXI} symbols)`, 'warn'); return false; }
    H.snap();
    const used = taken(), tags = new Map(), ids = new Map(), added = [];
    for (const it of clip.items) {
      const S = K[it.k]; if (!S) continue;
      let tag = it.tag;
      if (S.type && !S.types) {
        if (!tags.has(it.tag)) { let n = 1; while (used.has(S.pre + n)) n++; used.add(S.pre + n); tags.set(it.tag, S.pre + n); }
        tag = tags.get(it.tag);
      }
      F.seq++; ids.set(it.id, 'd' + F.seq);
      F.items.push({ ...it, id: 'd' + F.seq, tag, x: it.x + dx, y: it.y + dy }); added.push('d' + F.seq);
    }
    for (const w of clip.wires) {
      const [a, ta] = w.a.split(':'), [b, tb] = w.b.split(':'); if (!ids.has(a) || !ids.has(b)) continue;
      F.seq++; const nw = { id: 'fw' + F.seq, a: ids.get(a) + ':' + ta, b: ids.get(b) + ':' + tb };
      if (w.pts && w.pts.length) nw.pts = w.pts.map(([x, y]) => [x + dx, y + dy]);
      F.wires.push(nw);
    }
    // a pasted PLC I/O symbol keeps its controller and takes the next point of it that is not drawn yet (I0 → I1…);
    // with every point drawn it stays as it is, shows the problem and says so
    let noPoint = 0;
    for (const id of added) {
      const it = itemOf(id), S = K[it.k]; if (!S.io) continue;
      const d = H.devOf(it.tag), b = base(it.k), D = d && DEFS[d.type];
      const drawn = new Set(F.items.filter(x => x !== it && x.tag === it.tag && K[x.k].io && base(x.k) === b).map(x => K[x.k].io.n));
      if (!drawn.has(S.io.n)) continue;
      const nk = Object.keys(K).filter(k => base(k) === b && K[k].io).sort((p, q) => K[p].io.n - K[q].io.n)
        .find(k => !drawn.has(K[k].io.n) && (!D || D.terms.some(t => t.id === S.io.d + K[k].io.n)));
      if (nk) setKind(it, nk); else noPoint++;
    }
    if (noPoint) UI.toast(`Every ${K[itemOf(added.find(id => K[itemOf(id).k].io)).k].io.d === 'I' ? 'input' : 'output'} of that controller is drawn already: pick another PLC or card for the copy`, 'warn', 5000);
    // the next paste lands further on
    clip.items.forEach(i => { i.x += dx; i.y += dy; }); clip.wires.forEach(w => (w.pts || []).forEach(q => { q[0] += dx; q[1] += dy; }));
    group = new Set(added); sel = added.length ? { i: added[0] } : null;
    H.changed();
    return true;
  };
  /* another actuator for the same contact. Its device follows: one the diagram added for this symbol alone changes type;
     a device you placed in the Wiring, or one other symbols use too, is left as it is and this symbol gets a new tag */
  FD.cycleType = function () {
    const it = sel && sel.i && itemOf(sel.i); if (!it) return;
    const list = TYPES.find(l => l.includes(it.k)); if (!list) { UI.toast('Only switch contacts and sensors have types'); return; }
    const nk = list[(list.indexOf(it.k) + 1) % list.length], S0 = K[it.k], S1 = K[nk], d = H.devOf(it.tag), C = H.circ();
    H.snap();
    // the drawn wires keep their place: first terminal to first, second to second (11-12 → 21-22…)
    const map = Object.fromEntries(S0.terms.map((t, i) => [t.id, S1.terms[i] ? S1.terms[i].id : t.id]));
    fr().wires.forEach(w => ['a', 'b'].forEach(e => { const [id, t] = w[e].split(':'); if (id === it.id && map[t]) w[e] = id + ':' + map[t]; }));
    it.k = nk;
    if (d && d.type !== S1.type) {
      if (d.schAuto && H.refs(it.tag) === 1) {
        Circuit.retype(d, S1.type, C); Circuit.normalize(d);
        // a hand-made wire on a terminal the new type does not have is dropped (it would point nowhere)
        const ok = new Set(DEFS[S1.type].terms.map(t => t.id));
        C.wires = C.wires.filter(w => [w.a, w.b].every(k => { const [id, t] = k.split(':'); return id !== d.id || ok.has(t); }));
        App.log('system', `Electrical Diagram: ${it.tag} is now a ${DEFS[S1.type].name}`);
      } else {
        const used = taken(), old = it.tag;
        let n = 1; while (used.has(S1.pre + n)) n++;
        it.tag = S1.pre + n;
        UI.toast(`${old} ${d.schAuto ? 'is also used by other symbols' : 'is a device placed in the Wiring'}, so it stays a ${DEFS[d.type].name}: this symbol is now ${it.tag}, a new ${DEFS[S1.type].name}`, 'warn', 5000);
      }
    }
    H.changed();
  };
  /* a copy of the selected symbols next to them (D): the clipboard's rules (FD.paste); the clipboard itself is kept */
  FD.copy = function () {
    if (!many().length) { UI.toast('Select a symbol first'); return; }
    if (full()) return;
    const keep = clip;
    if (FD.copySel()) FD.paste();
    clip = keep;
  };
  /* drawing order: to the front (drawn last) or to the back */
  FD.order = function (front) {
    const it = sel && sel.i && itemOf(sel.i); if (!it) return;
    const F = fr(); H.snap();
    F.items = F.items.filter(i => i !== it); if (front) F.items.push(it); else F.items.unshift(it);
    H.changed();
  };
  FD.del = function () {
    const F = fr();
    if (group.size > 1) {
      const ids = new Set(many()); H.snap();
      F.items = F.items.filter(i => !ids.has(i.id)); F.wires = F.wires.filter(w => !ids.has(w.a.split(':')[0]) && !ids.has(w.b.split(':')[0]));
      group.clear(); sel = null; H.changed(); return true;
    }
    group.clear();
    if (sel && sel.i) { H.snap(); F.items = F.items.filter(i => i.id !== sel.i); F.wires = F.wires.filter(w => !w.a.startsWith(sel.i + ':') && !w.b.startsWith(sel.i + ':')); sel = null; H.changed(); return true; }
    if (sel && sel.w) { H.snap(); F.wires = F.wires.filter(w => w.id !== sel.w); sel = null; H.changed(); return true; }
    return false;
  };
  const STEP = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  FD.onKey = function (ev) {
    const k = ev.key, c = ev.ctrlKey || ev.metaKey, lk = k.toLowerCase();
    // ▶ Play operates the drawing: no editing keys there (Escape still clears the selection)
    if (H.mode() === 'run' && k !== 'Escape') return;
    if (c) {
      // Ctrl+C copies text selected on the page as usual; it copies symbols only when symbols are selected
      if (lk === 'c') { if (String(window.getSelection ? window.getSelection() : '') || !many().length) return; if (FD.copySel()) { ev.preventDefault(); UI.toast(`${clip.items.length} symbol${clip.items.length === 1 ? '' : 's'} copied`, 'ok', 1500); } }
      // Ctrl+V: paste what was copied; nothing copied, the property bar of the selected symbol (Simurelay's Ctrl+V = VALUES)
      else if (lk === 'v') { ev.preventDefault(); if (FD.hasClip()) FD.paste(); else FD.valuesAct(); }
      // Simurelay's keys (all with Ctrl): R rotate, B back, F front, D duplicate, Delete, arrows move one step
      else if (lk === 'r') { ev.preventDefault(); FD.rotate(); }
      else if (lk === 'b') { ev.preventDefault(); FD.order(false); }
      else if (lk === 'f') { ev.preventDefault(); FD.order(true); }
      else if (lk === 'd') { ev.preventDefault(); FD.copy(); }
      else if (k === 'Delete') { ev.preventDefault(); FD.del(); }
      else if (STEP[k]) { ev.preventDefault(); FD.nudge(STEP[k][0] * 10, STEP[k][1] * 10); }
      else if (lk === 'a') { ev.preventDefault(); FD.selectAll(); }
      return;
    }
    if (STEP[k]) { const s = ev.shiftKey ? 50 : 10; if (FD.nudge(STEP[k][0] * s, STEP[k][1] * s)) ev.preventDefault(); }
    else if (k === 'Delete' || k === 'Backspace') { ev.preventDefault(); FD.del(); }
    else if (k === 'r' || k === 'R') { ev.preventDefault(); FD.rotate(); }
    else if (k === 'd' || k === 'D') { ev.preventDefault(); FD.copy(); }
    else if (k === 'Escape') { wiring = null; pbar = null; sel = null; group.clear(); if (body) FD.render(body); H.side(); }
  };
  FD.resetSel = () => { sel = null; group.clear(); wiring = null; drag = null; lastSig = ''; needFit = true; };
  FD.selected = () => (sel && sel.i ? itemOf(sel.i) : null);
  /* Properties of the selected symbol: its tag (and PLC point), a comment, and the settings of its device — the same
     settings the Wiring shows (one place: the device's props), so a delay or coil voltage changed here is the Wiring's too */
  const field = (n, html) => `<label class="field"><span>${esc(n)}</span>${html}</label>`;
  function propsHtml(it, S, d) {
    if (it.k === 'text') return '';
    const f = [];
    if (S.type && !S.jct) f.push(field('Tag', `<input data-fp="tag" value="${esc(it.tag)}" maxlength="20" list="fd-tags" autocomplete="off"><datalist id="fd-tags">${suggest(it.k).list.map(t => `<option value="${esc(t)}">`).join('')}</datalist>`));
    if (S.io) {
      // only the points the placed controller or card has (an 8-input card has no I8–I11)
      const b = base(it.k), pts = Object.keys(K).filter(k => base(k) === b && K[k].io).map(k => K[k].io.n)
        .filter(n => n === S.io.n || !d || !DEFS[d.type] || DEFS[d.type].terms.some(t => t.id === S.io.d + n));
      f.push(field('Point', `<select data-fp="point">${pts.map(n => `<option value="${n}" ${n === S.io.n ? 'selected' : ''}>${S.io.d}${n}</option>`).join('')}</select>`));
    }
    f.push(field('Comment', `<input data-fp="c" value="${esc(it.c || '')}" maxlength="80" placeholder="e.g. Pump 1 start">`));
    // a PLC or I/O card keeps its settings (slot…) in the Wiring and the I/O Configuration
    if (d && !S.types) for (const p of DEFS[d.type].pdefs || []) {
      f.push(field(p.n, p.opts ? `<select data-fpd="${p.k}">${p.opts.map(o => `<option ${String(d.props[p.k]) === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`
        : `<input data-fpd="${p.k}" type="${p.type || 'text'}" value="${esc(d.props[p.k] ?? '')}">`));
    }
    return `<div class="props fd-props">${f.join('')}</div>`;
  }
  /* grid: lines and dots, dots only, or none (this browser) */
  const GRIDS = { lines: 'Lines and dots', dots: 'Dots', none: 'None' };
  let grid = 'lines';
  try { const g = localStorage.getItem('plc-trainer.fdGrid'); if (GRIDS[g]) grid = g; } catch (e) { /* private mode */ }
  FD.setGrid = function (g) { if (!GRIDS[g]) return; grid = g; try { localStorage.setItem('plc-trainer.fdGrid', g); } catch (e) { /* private mode */ } if (body) FD.render(body); };
  FD.grid = () => grid;
  /* the drawing as a picture: an SVG of the symbols and wires with their colours written in (no grid, no handles) */
  FD.imageSvg = function () {
    if (!svg || !gv) return null;
    const its = fr().items; if (!its.length) return null;
    const PROPS = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor'];
    const src = gv.querySelectorAll('*'), copy = gv.cloneNode(true), dst = copy.querySelectorAll('*');
    src.forEach((e, i) => { const cs = getComputedStyle(e); dst[i].setAttribute('style', PROPS.map(p => `${p}:${cs.getPropertyValue(p)}`).join(';')); dst[i].removeAttribute('class'); });
    copy.querySelectorAll('[data-ft], [data-fb], [x="-5000"], [x1="-5000"], [y1="-5000"]').forEach(e => e.remove());
    // the background and the click areas (filled with the grid pattern or nothing visible) are not part of the picture
    [...copy.querySelectorAll('rect')].filter(e => { const o = e.getAttribute('style') || ''; return /fill:\s*(url|transparent|rgba\(0, 0, 0, 0\))/.test(o) && !/stroke:\s*rgb/.test(o); }).forEach(e => e.remove());
    copy.removeAttribute('transform');
    const x1 = Math.min(...its.map(i => i.x)) - 80, x2 = Math.max(...its.map(i => i.x)) + 80, y1 = Math.min(...its.map(i => i.y)) - 60, y2 = Math.max(...its.map(i => i.y)) + 60;
    const bg = getComputedStyle(body.querySelector('.fd-wrap') || document.documentElement).getPropertyValue('--fd-bg').trim() || '#fff';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${x2 - x1}" height="${y2 - y1}" viewBox="${x1} ${y1} ${x2 - x1} ${y2 - y1}"><rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="${bg}"/>${copy.innerHTML}</svg>`;
  };
  const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };
  FD.exportImage = function (kind) {
    const s = FD.imageSvg(); if (!s) { UI.toast('The drawing is empty', 'warn'); return; }
    const name = (App.project.name || 'diagram').replace(/[^\w-]+/g, '_');
    if (kind === 'svg') { download(new Blob([s], { type: 'image/svg+xml' }), name + '.svg'); return; }
    const img = new Image(), url = URL.createObjectURL(new Blob([s], { type: 'image/svg+xml' }));
    img.onload = () => {
      const c = document.createElement('canvas'); c.width = img.width * 2; c.height = img.height * 2;
      const g = c.getContext('2d'); g.scale(2, 2); g.drawImage(img, 0, 0); URL.revokeObjectURL(url);
      c.toBlob(b => { if (b) download(b, name + '.png'); }, 'image/png');
    };
    img.src = url;
  };
  /* side panel for the free drawing */
  FD.side = function () {
    const it = FD.selected(), errs = FD.errs ? [...FD.errs.values()] : [], ids = many();
    const d = it && H.devOf(it.tag), S = it && K[it.k];
    const head = ids.length > 1 ? `<h5>${ids.length} symbols selected</h5>
      <div class="btn-row"><button class="btn" data-fd="rot">⟳ Rotate (R)</button><button class="btn" data-fd="copy">⧉ Duplicate (D)</button><button class="btn" data-fd="clip">Copy (Ctrl+C)</button><button class="btn danger" data-fd="del">Delete</button></div>
      <p class="help">Drag one of them to move them all. Arrow keys move them one grid step (Shift: five).</p>`
      : it ? `<h5>${esc(S.n)} <code>-${esc(it.tag)}</code></h5>
      ${propsHtml(it, S, d)}
      <div class="btn-row">${it.k === 'text' ? '<button class="btn" data-fd="retag">Edit text…</button>' : ''}${S.type && !S.jct && !S.types ? '<button class="btn" data-fd="rename">Rename device…</button>' : ''}<button class="btn" data-fd="rot">⟳ Rotate (R)</button>${TYPES.some(l => l.includes(it.k)) ? '<button class="btn" data-fd="type">Type ⇄</button>' : ''}<button class="btn" data-fd="copy">⧉ Duplicate (D)</button><button class="btn" data-fd="front">To front</button><button class="btn" data-fd="back">To back</button><button class="btn danger" data-fd="del">Delete</button></div>
      <p class="help">${it.k === 'text' ? 'A note on the drawing.' : d ? esc(Circuit.status(d, App.ctx) || '') : 'Not in the Wiring yet.'}</p>`
      : `<p class="help">Select a symbol to change its tag, comment and settings. Shift+click or Shift+drag selects several.</p>
      ${FD.hasClip() ? '<div class="btn-row"><button class="btn" data-fd="paste">Paste (Ctrl+V)</button></div>' : ''}
      <div class="props fd-props">${field('Wires', `<select data-frouting>${Object.entries(ROUTINGS).map(([k, n]) => `<option value="${k}" ${k === routing ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}${field('Grid', `<select data-fgrid>${Object.entries(GRIDS).map(([k, n]) => `<option value="${k}" ${k === grid ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
      ${field('Tag colour', `<select data-flbl="color">${Object.entries(TAG_COLORS).map(([k, n]) => `<option value="${k}" ${k === lbl.color ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}
      <label class="chk"><input type="checkbox" data-flbl="tags" ${lbl.tags ? 'checked' : ''}> Show tags (-KM1)</label>
      <label class="chk"><input type="checkbox" data-flbl="terms" ${lbl.terms ? 'checked' : ''}> Show terminal numbers</label>
      <label class="chk"><input type="checkbox" data-flbl="ask" ${lbl.ask ? 'checked' : ''}> Ask for a tag when placing a symbol</label></div>
      <div class="btn-row"><button class="btn" data-fd="png">Save as PNG</button><button class="btn" data-fd="svg">Save as SVG</button></div>`;
    return `${head}
      ${errs.length ? `<h5>Problems</h5><ul class="verify">${errs.map(m => `<li class="e">${esc(m)}</li>`).join('')}</ul>` : ''}
      <ul class="tips"><li><b>▦ Library</b>: pick a group, then click a symbol or drag it onto the drawing. Drag to move, <b>R</b> to rotate, <b>Del</b> to delete.</li>
      <li>Click a terminal ■ then another to draw a wire (or drag from one to the other); a click anywhere else cancels it. Select a wire and drag its middle (orange) to move it. Every drawn wire is wired in the Wiring for you.</li><li>Double-click or right-click a symbol (or select it and press Values) for its bar at the top: TAG and NUM1 &lt; &gt; step its tag, a comment, and its settings (time…); on a terminal, the number written beside it.</li>
      <li>End a wire on another wire to branch it (a junction dot). Double-click a wire to add a bend, drag the bend, double-click it to remove it.</li>
      <li>Symbols with the same tag are the same device: draw its coil and its contacts anywhere.</li>
      <li><b>Shift</b>+click or Shift+drag a box selects several symbols; <b>Ctrl+A</b> selects all. Arrow keys move the selection (Shift: five steps).</li>
      <li><b>D</b> duplicates the selection; <b>Ctrl+C</b> / <b>Ctrl+V</b> copy and paste it — a pasted coil and its contacts become one new device. Others › Text adds a note, Others › PE an earth symbol wired to the supply PE.</li>
      <li>Properties (on the right when one symbol is selected): its tag, a comment, and the settings of its device — the same ones as in the Wiring. On a touch screen, a long press opens the tag form; pinch to zoom.</li>
      <li>Sources › Point L1, N, PE, +24 V… is wired to that conductor of the supply. Others › wire pieces (straight, corner, T, cross) join wires; link arrows with the same tag are connected.</li>
      <li>PLC › outputs, inputs and power are terminals of the PLC or I/O card placed in the Wiring: pick its tag and the point. They show the live state of the point; the ladder decides the outputs.</li>
      <li>▶ Play: everything starts at rest (breakers off, buttons out, timers cleared) and protections work by hand: tap a breaker to switch it, a fuse to blow or replace it, an overload to trip or reset it. A short circuit stops the simulation. ■ Stop puts everything back. Wires show their conductor: L1 brown, L2 grey, L3 cyan, N blue, PE yellow, + red, 0 V blue.</li><li>Keys: Ctrl+R rotate, Ctrl+B back, Ctrl+F front, Ctrl+D duplicate, Ctrl+Delete delete, Ctrl+arrows move, Ctrl+V values (or paste), Ctrl+Z / Ctrl+Y undo / redo. ⋯ has New, Open, Capture, Save, Save As and Settings (grid, zoom panel, dark mode, colours).</li></ul>`;
  };
  FD.bindSide = function (sideEl) {
    sideEl.querySelectorAll('[data-fd]').forEach(b => { b.onclick = () => ({ retag: () => FD.retag(FD.selected()), rename: () => FD.renameDevice(FD.selected()), rot: FD.rotate, type: FD.cycleType, copy: FD.copy, front: () => FD.order(true), back: () => FD.order(false), del: FD.del,
      clip: () => { if (FD.copySel()) UI.toast('Copied', 'ok', 1500); }, paste: () => FD.paste(), png: () => FD.exportImage('png'), svg: () => FD.exportImage('svg') })[b.dataset.fd](); });
    const gs = sideEl.querySelector('[data-fgrid]'); if (gs) gs.onchange = () => FD.setGrid(gs.value);
    const rs = sideEl.querySelector('[data-frouting]'); if (rs) rs.onchange = () => FD.setRouting(rs.value);
    sideEl.querySelectorAll('[data-flbl]').forEach(i => { i.onchange = () => FD.setLabels({ [i.dataset.flbl]: i.type === 'checkbox' ? i.checked : i.value }); });
    const it = FD.selected(); if (!it) return;
    sideEl.querySelectorAll('[data-fp]').forEach(i => { i.onchange = () => FD.setProp(it, i.dataset.fp, i.value); });
    sideEl.querySelectorAll('[data-fpd]').forEach(i => { i.onchange = () => FD.setDevProp(it, i.dataset.fpd, i.value); });
  };
  /* Properties: the symbol's tag (another tag = another device, as Tag… does), PLC point or comment */
  FD.setProp = function (it, k, v) {
    if (!it) return false;
    if (k === 'tag') {
      const t = String(v).trim();
      if (t === it.tag) return true;
      if (!TAG.test(t)) { UI.toast('Use letters, numbers, - or _ (up to 20)', 'warn'); H.side(); return false; }
      H.snap(); it.tag = t; H.changed(); return true;
    }
    if (k === 'point') { const nk = base(it.k) + Number(v); if (!K[nk] || nk === it.k) return false; H.snap(); setKind(it, nk); H.changed(); return true; }
    if (k === 'c') { const c = String(v).trim().slice(0, 80); H.snap(); if (c) it.c = c; else delete it.c; H.changed(); return true; }
    return false;
  };
  /* a device setting from the Properties: written to the device itself, as the Wiring does */
  FD.setDevProp = function (it, k, v) {
    const d = it && H.devOf(it.tag), p = d && (DEFS[d.type].pdefs || []).find(f => f.k === k);
    if (!p) return false;
    if (p.opts && !p.opts.includes(v)) return false;
    d.props[k] = p.type === 'number' ? Number(v) : v;
    App.circuitChanged(); if (body) FD.render(body); H.side();
    return true;
  };
  window.FreeDraw = FD;
})();
