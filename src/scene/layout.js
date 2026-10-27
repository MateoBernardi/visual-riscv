// Layout compartido de la escena 3D: etapas, bloques y colores.
export const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
export const STAGE_COLORS = { IF: '#1aa3a1', ID: '#4a7bd0', EX: '#f0a53a', MEM: '#9b6ad6', WB: '#e5533d' };
export const STAGE_NAMES = { IF: 'Búsqueda', ID: 'Decodificación', EX: 'Ejecución', MEM: 'Memoria', WB: 'Escritura' };
export const STAGE_RANGE = { IF: [-30, -17], ID: [-17, -6], EX: [-6, 11], MEM: [11, 24], WB: [24, 31] };
export const STRIP_Z = [-14, 10];
export const BASE_Y = 0.5; // altura de la cara superior del chip FPGA
export const WIRE_Y = 0.85;
export const BOARD = { cx: -1, cz: 0, w: 70, d: 42 };
export const DEFAULT_TARGET = [-1, 0, 0];

// kind: slab | box | mem | regfile | mux | alu | unit | conn
export const BLOCKS = {
  pc:        { title: 'PC',       stage: 'IF',  kind: 'unit',    x: -27,   z: 0,    w: 2.6, d: 3.2, h: 1.2 },
  imem:      { title: 'IMEM',     stage: 'IF',  kind: 'mem',     x: -22,   z: 0,    w: 5,   d: 7,   h: 1.8 },
  ifid:      { title: 'IF/ID',    stage: 'ID',  kind: 'slab',    x: -16.5, z: -2,   w: 0.9, d: 22,  h: 3 },
  control:   { title: 'CONTROL',  stage: 'ID',  kind: 'unit',    x: -12,   z: -6.5,   w: 4,   d: 3,   h: 1.2 },
  regfile:   { title: 'REGFILE',  stage: 'ID',  kind: 'regfile', x: -11.5, z: 1,    w: 5,   d: 5.5, h: 2 },
  immgen:    { title: 'IMM GEN',  stage: 'ID',  kind: 'unit',    x: -12,   z: 7,    w: 4,   d: 2.6, h: 1.2 },
  hazard:    { title: 'HAZARD',   stage: 'ID',  kind: 'unit',    x: -12,   z: -12,  w: 4,   d: 2.6, h: 1.2 },
  idex:      { title: 'ID/EX',    stage: 'EX',  kind: 'slab',    x: -5.2,  z: -2,   w: 0.9, d: 22,  h: 3 },
  fwdMuxA:   { title: 'MUX A',    stage: 'EX',  kind: 'mux',     x: -1.5,  z: -4,   w: 1.6, d: 3,   h: 1.2 },
  fwdMuxB:   { title: 'MUX B',    stage: 'EX',  kind: 'mux',     x: -1.5,  z: 2,    w: 1.6, d: 3,   h: 1.2 },
  aluSrcMux: { title: 'MUX ALU',  stage: 'EX',  kind: 'mux',     x: 2.5,   z: 5,    w: 1.6, d: 3,   h: 1.2 },
  alu:       { title: 'ALU',      stage: 'EX',  kind: 'alu',     x: 6.5,   z: -1.5, w: 4.2, d: 5,   h: 1.4 },
  branch:    { title: 'BRANCH',   stage: 'EX',  kind: 'unit',    x: 6.5,   z: -7.5, w: 3.2, d: 2.4, h: 1.1 },
  forward:   { title: 'FORWARD',  stage: 'EX',  kind: 'unit',    x: -2,    z: -12,  w: 4,   d: 2.6, h: 1.2 },
  flush:     { title: 'FLUSH',    stage: 'EX',  kind: 'unit',    x: 4.6,   z: -12,  w: 3.2, d: 2.4, h: 1.2 },
  exmem:     { title: 'EX/MEM',   stage: 'MEM', kind: 'slab',    x: 11.5,  z: -2,   w: 0.9, d: 22,  h: 3 },
  dmem:      { title: 'DMEM',     stage: 'MEM', kind: 'mem',     x: 16.5,  z: 0,    w: 5.5, d: 7,   h: 1.8 },
  wbMux:     { title: 'MUX WB',   stage: 'MEM', kind: 'mux',     x: 21,    z: 0,    w: 1.6, d: 3,   h: 1.2 },
  memwb:     { title: 'MEM/WB',   stage: 'WB',  kind: 'slab',    x: 24.6,  z: -2,   w: 0.9, d: 22,  h: 3 },
  debug:     { title: 'DEBUG',    stage: null,  kind: 'conn',    x: -22,   z: 15.5, w: 5,   d: 3.4, h: 1.4 },
  uart:      { title: 'UART',     stage: null,  kind: 'conn',    x: -29.5, z: 15.5, w: 4,   d: 3,   h: 1.2 },
};
export const BLOCK_IDS = Object.keys(BLOCKS);

export const THEME = {
  light: { bg: '#f6edde', hemiSky: '#fff4dd', hemiGround: '#7c8a7a', hemiI: 1.0, dirI: 1.5, wireIdle: '#d8b46e', wireIdleOpacity: 0.55 },
  dark:  { bg: '#18213d', hemiSky: '#9fb2e0', hemiGround: '#2a3350', hemiI: 0.75, dirI: 1.1, wireIdle: '#b69a62', wireIdleOpacity: 0.5 },
};
