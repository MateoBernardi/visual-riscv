import { githubUrl } from '../repo.js';

const F = 'pipeline/2_decode/control.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

const OUTS = [
  ['reg_write', 1, 'La instrucción escribe rd. Vale 1 en R, I, LOAD, JAL, JALR, LUI y AUIPC.', 'snap.signals.ctrl.reg_write'],
  ['alu_src', 1, 'Segundo operando de la ALU: 1 = inmediato. Vale 1 en I, LOAD, STORE, JALR y AUIPC.', 'snap.signals.ctrl.alu_src'],
  ['mem_read', 1, 'Es un load (solo LOAD).', 'snap.signals.ctrl.mem_read'],
  ['mem_write', 1, 'Es un store (solo STORE).', 'snap.signals.ctrl.mem_write'],
  ['branch', 1, 'Es un branch condicional (BR).', 'snap.signals.ctrl.branch'],
  ['jump', 1, 'Es JAL o JALR.', 'snap.signals.ctrl.jump'],
  ['halt', 1, 'Cualquier opcode SYSTEM (ECALL/EBREAK) levanta halt: el RTL no distingue entre ellos.', 'snap.signals.ctrl.halt'],
  ['wb_sel', 2, 'Origen del resultado: 00 ALU, 01 dmem (LOAD), 10 PC+4 (JAL/JALR), 11 inmediato (LUI).', 'snap.signals.ctrl.wb_sel'],
  ['imm_sel', 3, 'Formato del inmediato: 000 I, 001 S, 010 B, 011 U, 100 J.', 'snap.signals.ctrl.imm_sel'],
];

const ports = [
  { name: 'opcode', dir: 'in', width: 7, side: 'l', ext: 'ifid', desc: 'Bits [6:0] de la instrucción.' },
  { name: 'funct3', dir: 'in', width: 3, side: 'l', ext: 'ifid', desc: 'Bits [14:12]: distingue operaciones dentro de un mismo opcode.' },
  { name: 'funct7', dir: 'in', width: 7, side: 'l', ext: 'ifid', desc: 'Bits [31:25]. Solo se mira el bit 5 (instrucción[30]), que separa ADD/SUB y SRL/SRA.' },
  ...OUTS.map(([n, w, d]) => ({ name: n, dir: 'out', width: w, side: 'r', ext: n === 'imm_sel' ? 'immgen' : 'idex', desc: d })),
  { name: 'alu_op', dir: 'out', width: 4, side: 'r', ext: 'idex', desc: 'Operación de la ALU (códigos de alu_ops.vh: ADD 0000, SUB 0001, AND 0010, OR 0011, XOR 0100, SLT 0101, SLTU 0110, SLL 0111, SRL 1000, SRA 1001).' },
];

const nets = [
  N('n_opcode', 'port:opcode', 'dec_main', 'opcode', 7, 'El opcode entra al decodificador principal (<code>case (opcode)</code>).'),
  N('n_opcode_alu', 'port:opcode', 'alu_sub', 'opcode', 7, 'El mismo opcode decide si hay que mirar funct3/funct7 (R e I) o poner ADD/SUB fijo.'),
  N('n_funct3', 'port:funct3', 'alu_sub', 'funct3', 3, 'Selecciona la operación en R e I (y la comparación en branches).'),
  N('n_funct7', 'port:funct7', 'alu_sub', 'funct7', 7, 'Solo se usa <code>funct7[5]</code>: 1 = SUB o SRA, 0 = ADD o SRL.'),
  N('n_opcodes', 'opcodes', 'dec_main', 'R', 7, 'Constantes de opcode con las que compara el <code>case</code>.'),
  ...OUTS.map(([n, w, d, live]) => N(`n_${n}`, 'dec_main', `port:${n}`, n, w, d, live)),
  N('n_alu_op', 'alu_sub', 'port:alu_op', 'alu_op', 4, 'Código de operación elegido por el sub-decodificador. Para LOAD, STORE, JALR y AUIPC es siempre ADD (dirección = base + offset); para BR es SUB (BEQ/BNE/BLTU/BGEU) o SLT (BLT/BGE); para LUI y JAL queda en el valor por defecto ADD.', 'snap.signals.ctrl.alu_op'),
];

export default {
  id: 'control',
  module: 'control',
  file: F,
  instance: 'u_ctrl',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_ctrl',
  blockIds: ['control'],
  title: 'Unidad de control',
  stage: 'ID',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El datapath es siempre el mismo; lo que cambia por instrucción es cómo se configuran sus muxes, la ALU y las escrituras. El control traduce opcode, funct3 y funct7 a esas señales con lógica combinacional. Si llega un opcode desconocido, todo tiene que quedar en un estado seguro: sin escrituras.</p>`,
    inThisProject: `
      <ul>
        <li>Todo arranca en cero, así que un opcode desconocido se comporta como NOP. Quien lo detecta como ilegal es <code>illegal_check</code>, aparte.</li>
        <li>BLT/BGE piden SLT a la ALU y el resto de los branches SUB, pero la condición la decide branch_unit con <code>zero/lt/ltu</code>.</li>
        <li>Cualquier SYSTEM pone <code>halt</code>; <code>is_jalr</code> e <code>is_auipc</code> se derivan en riscv_pipeline.v, no acá.</li>
      </ul>`,
    whyThisChoice: `
      <p>Un <code>case (opcode)</code> plano con un sub-case de ALU dentro de R/I es la decodificación en dos niveles de libro escrita como tabla de verdad: cada línea se lee como una fila. Sumar una instrucción es sumar una línea.</p>`,
  },
  refs: [
    { label: 'control', sym: 'module:control' },
    { label: 'opcodes (R)', sym: 'R' },
    { label: 'LOAD', sym: 'LOAD' },
    { label: 'SYS', sym: 'SYS' },
    { label: 'alu_op', sym: 'port:alu_op' },
  ],
  grid: [9, 6],
  ports,
  parts: [
    P('opcodes', 'const', 'opcodes', 7, [0, 0], [2, 1], 'Localparams de 7 bits (<code>R, I, LOAD, STOR, BR, JAL, JALR, LUI, AUIP, SYS</code>) con los opcodes RV32I implementados.', { symbol: 'R' }),
    P('dec_main', 'decoder', 'case (opcode)', 7, [3, 0], [2, 3], 'Decodificador principal: según el opcode asigna las banderas de control, <code>wb_sel</code> e <code>imm_sel</code>. Es la tabla de verdad central. Todas las salidas parten en un valor seguro (0).', { symbol: null }),
    P('alu_sub', 'decoder', 'alu_op (funct3, funct7[5])', 4, [3, 4], [2, 2], 'Sub-decodificador de la operación de la ALU. En R usa <code>{funct7[5], funct3}</code>; en I, <code>funct3</code> (más <code>funct7[5]</code> para SRAI/SRLI); en branches elige SLT o SUB; el resto, ADD.', { symbol: null }),
  ],
  nets,
};
