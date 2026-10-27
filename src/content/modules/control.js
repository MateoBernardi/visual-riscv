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
  parent: 'riscv_pipeline',
  blockIds: ['control'],
  title: 'Unidad de control',
  stage: 'ID',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El hardware del datapath es siempre el mismo: una ALU, una memoria, un banco de registros, un puñado de multiplexores. Lo que cambia entre una instrucción y otra es <i>cómo</i> se configuran: qué operación hace la ALU, si el segundo operando viene de un registro o de la instrucción, si hay que escribir memoria, de dónde sale el resultado, a dónde apunta el PC. Esas "perillas" son las señales de control.</p>
      <p>Alguien tiene que traducir los 32 bits de la instrucción en esas perillas. La información está en pocos bits: el opcode (7 bits) dice la familia de la instrucción, y funct3 y funct7 la afinan. La traducción es una función fija de esos bits, así que se hace con lógica <b>combinacional</b>: no necesita memoria, solo una tabla de verdad.</p>
      <p>Se puede diseñar esa tabla de dos maneras. Un único decodificador gigante, o <b>dos niveles</b>: un control principal por opcode y un sub-control para la ALU que mira funct3/funct7 (el "ALUOp" de los libros). La separación ahorra lógica porque solo las instrucciones de tipo R e I necesitan distinguir la operación de la ALU; para el resto la operación está implícita en el opcode (siempre suma para calcular direcciones).</p>
      <p>Un detalle de diseño es el valor por defecto de cada señal: si llega un opcode que el procesador no implementa, las señales deben quedar en un estado seguro, con ninguna escritura de registro ni de memoria.</p>`,
    inThisProject: `
      <p>Es ${g('module:control', 'control')}, un único <code>always @(*)</code> con un <code>case (opcode)</code> sobre las constantes ${g('R', 'R / I / LOAD / STOR / BR / JAL / JALR / LUI / AUIP / SYS')}. Empieza poniendo <b>todo en cero</b> (<code>{reg_write,alu_src,mem_read,mem_write,branch,jump,halt}=7'b0</code>, <code>wb_sel=00</code>, <code>alu_op=OP_ADD</code>, <code>imm_sel=000</code>), así que un opcode desconocido se comporta como un NOP.</p>
      <ul>
        <li><b>Sub-decodificación de ALU</b>: en tipo R, <code>case ({funct7[5], funct3})</code> (ADD/SUB/AND/OR/XOR/SLT/SLTU/SLL/SRL/SRA); en tipo I, <code>case (funct3)</code>, y para <code>funct3 = 5</code> usa <code>funct7[5]</code> para elegir SRAI o SRLI. Los códigos son los de <code>alu_ops.vh</code>.</li>
        <li><b>Branches</b>: <code>alu_op = (funct3==4 || funct3==5) ? OP_SLT : OP_SUB</code>. BLT/BGE usan SLT; todos los demás SUB. Igual la condición real la decide branch_unit con las banderas <code>zero/lt/ltu</code> de la ALU.</li>
        <li><b>halt</b>: <code>SYS: halt=1</code> para cualquier SYSTEM. No hay CSRs ni excepciones.</li>
        <li><b>is_jalr / is_auipc no salen de acá</b>: se derivan en riscv_pipeline.v comparando el opcode.</li>
        <li>JAL y JALR llevan <code>wb_sel = 10</code> (PC+4) y <code>jump = 1</code>; LUI lleva <code>wb_sel = 11</code> con <code>imm_sel = 011</code>, y no usa la ALU.</li>
      </ul>`,
    whyThisChoice: `
      <p>Un <code>case</code> plano con las salidas escritas por opcode es lo más legible para un core chico: cada línea es la fila de una tabla de verdad. El sub-case de ALU adentro de R/I es, en la práctica, la decodificación en dos niveles de Patterson-Hennessy. Las alternativas más relevantes: <b>control microprogramado</b> (ROM indexada por opcode, como los 8086/68000: fácil de modificar pero más lento y grande), <b>decodificar además <code>uses_rs1</code> / <code>uses_rs2</code></b> (Rocket, Ibex) para corregir los falsos stalls de hazard_unit, <b>soporte de CSR y traps</b> (ecall → excepción en lugar de frenar el CPU) y <b>decodificar instrucciones comprimidas</b> (extensión C).</p>
      <p>Aclaración sobre esta implementación: otros procesadores colocan la decodificación de control en la misma etapa que la lectura de registros, igual que acá, pero aprovechan que la lectura es paralela a la decodificación (los campos rs1/rs2 están siempre en el mismo lugar).</p>`,
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
