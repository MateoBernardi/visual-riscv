import { githubUrl } from '../repo.js';

const F = 'pipeline/regs/pipe_reg.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;

// [campo sin prefijo, ancho, grupo, descripción, ruta live]
const FIELDS = [
  ['reg_write', 1, 'c', 'La instrucción escribe un registro destino. En una burbuja vale 0: es lo que impide que escriba nada.', 'snap.latches.idex.reg_write'],
  ['alu_src', 1, 'c', 'Segundo operando de la ALU: 1 = inmediato, 0 = registro.', 'snap.latches.idex.alu_src'],
  ['mem_read', 1, 'c', 'Es un load. Lo usa hazard_unit para detectar load-use y viaja hasta MEM.', 'snap.latches.idex.mem_read'],
  ['mem_write', 1, 'c', 'Es un store. Habilita la escritura de la dmem en MEM.', 'snap.latches.idex.mem_write'],
  ['branch', 1, 'c', 'Es un branch condicional: EX combina esto con la condición de branch_unit.', 'snap.latches.idex.branch'],
  ['jump', 1, 'c', 'Es JAL o JALR: siempre redirigen el PC.', 'snap.latches.idex.jump'],
  ['is_jalr', 1, 'c', 'Es JALR: el destino sale de la ALU (rs1 + imm) en vez de pc + imm.', 'snap.latches.idex.is_jalr'],
  ['is_auipc', 1, 'c', 'Es AUIPC: el operando A de la ALU es el PC.', 'snap.latches.idex.is_auipc'],
  ['halt', 1, 'c', 'Es ECALL/EBREAK (cualquier opcode SYSTEM). Viaja hasta WB, donde frena el CPU; en EX dispara <code>stop_fetch</code>.', 'snap.latches.idex.halt'],
  ['wb_sel', 2, 'c', 'Fuente del resultado: 00 ALU, 01 dmem, 10 PC+4, 11 inmediato. Se consume en MEM.', 'snap.latches.idex.wb_sel'],
  ['alu_op', 4, 'c', 'Código de operación de la ALU (ADD, SUB, AND, ...), decodificado en ID.', 'snap.latches.idex.alu_op'],
  ['pc', 32, 'd', 'PC de la instrucción. Lo usan branch_unit (pc + imm) y AUIPC.', 'snap.latches.idex.pc'],
  ['pc4', 32, 'd', 'PC + 4 calculado en ID. Es el valor que JAL/JALR escriben en rd; viaja hasta MEM.', 'snap.latches.idex.pc4'],
  ['rdata1', 32, 'd', 'Valor leído de rs1 en ID. Puede quedar viejo: el forwarding lo corrige en EX.', 'snap.latches.idex.rdata1'],
  ['rdata2', 32, 'd', 'Valor leído de rs2 en ID (también es el dato de un store).', 'snap.latches.idex.rdata2'],
  ['imm', 32, 'd', 'Inmediato ya extendido. Sirve a la ALU, a branch_unit y a LUI.', 'snap.latches.idex.imm'],
  ['rs1', 5, 'd', 'Índice de rs1. forward_unit lo compara con los destinos de MEM y WB; por eso no alcanza con guardar el valor.', 'snap.latches.idex.rs1'],
  ['rs2', 5, 'd', 'Índice de rs2, con el mismo propósito de forwarding.', 'snap.latches.idex.rs2'],
  ['rd', 5, 'd', 'Registro destino. Viaja hasta WB; hazard_unit lo compara con rs1/rs2 de ID.', 'snap.latches.idex.rd'],
  ['funct3', 3, 'd', 'funct3 de la instrucción: lo usa branch_unit (tipo de branch) y la dmem (ancho del acceso).', 'snap.latches.idex.funct3'],
];

const parts = [{
  id: 'prio', kind: 'logic', label: 'rst | en&flush  >  en', width: 1, symbol: null, at: [2, 0], size: [1, 7],
  desc: 'Lógica de prioridad: <code>if (rst || (en &amp;&amp; flush))</code> mete una burbuja (todos los campos en 0); <code>else if (en)</code> carga lo que viene de ID; si <code>en = 0</code> retiene. Es la única diferencia con IF/ID: acá el stall <i>no entra</i>, porque el stall congela IF/ID y la burbuja llega por <code>flush_id_ex</code>.',
}];
const nets = [
  { id: 'n_rst', from: 'port:rst', to: 'prio', name: 'rst', width: 1, desc: 'Reset sincrónico: todos los campos a 0, lo que equivale a una burbuja.' },
  { id: 'n_en', from: 'port:en', to: 'prio', name: 'en', width: 1, desc: 'Pausa del CPU. Con 0 el registro retiene y se ignora el flush.' },
  { id: 'n_flush', from: 'port:flush', to: 'prio', name: 'flush', width: 1, desc: 'Burbuja: viene de <code>flush_id_ex = flush_id_ex_r | stop_fetch | stall</code>, o sea salto tomado, halt o load-use.', live: 'snap.signals.flushIdEx' },
];
const ports = [
  { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj del sistema.' },
  { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico.' },
  { name: 'en', dir: 'in', width: 1, side: 't', ext: 'debug (i_enable)', desc: 'Enable global (pausa).' },
  { name: 'flush', dir: 'in', width: 1, side: 'b', ext: 'flush / hazard', desc: 'Inserta una burbuja.' },
];
const idx = { c: 0, d: 0 };
for (const [n, w, grp, desc, live] of FIELDS) {
  const i = idx[grp]++;
  const col = grp === 'c' ? 4 + (i < 6 ? 0 : 1) : 7 + (i < 5 ? 0 : 1);
  const row = i < (grp === 'c' ? 6 : 5) ? i : i - (grp === 'c' ? 6 : 5);
  parts.push({
    id: `ex_${n}`, kind: 'ff', label: `ex_${n}`, width: w, symbol: `ex_${n}`, at: [col, row], size: [1, 1],
    desc: `${grp === 'c' ? '<b>Control.</b> ' : '<b>Dato.</b> '}${desc}`, live,
  });
  nets.push({ id: `n_in_${n}`, from: `port:id_${n}`, to: `ex_${n}`, name: `id_${n}`, width: w, desc: `Entrada desde ID: ${desc}` });
  nets.push({ id: `n_out_${n}`, from: `ex_${n}`, to: `port:ex_${n}`, name: `ex_${n}`, width: w, desc: `Salida hacia EX (un ciclo después): ${desc}`, live });
  ports.push({ name: `id_${n}`, dir: 'in', width: w, side: 'l', ext: grp === 'c' ? 'control' : 'ID', desc: `Entrada: ${desc}` });
  ports.push({ name: `ex_${n}`, dir: 'out', width: w, side: 'r', ext: 'EX', desc: `Salida: ${desc}` });
}
nets.push({ id: 'n_prio_c', from: 'prio', to: 'ex_reg_write', name: null, width: 1, desc: 'La decisión de la lógica de prioridad (cargar / retener / burbuja) se aplica por igual a los 11 campos de control.' });
nets.push({ id: 'n_prio_d', from: 'prio', to: 'ex_pc', name: null, width: 1, desc: 'Y a los 9 campos de datos: una burbuja también pone en cero los datos.' });

export default {
  id: 'id_ex_reg',
  module: 'id_ex_reg',
  file: F,
  instance: 'u_id_ex',
  parent: 'riscv_pipeline',
  blockIds: ['idex'],
  title: 'Registro ID/EX',
  stage: 'EX',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Cuando una instrucción pasa de ID a EX deja atrás todo lo que la etapa ID calculó: las señales de control que salieron del decodificador, los valores leídos del banco de registros, el inmediato armado a partir de los bits de la instrucción. Si la etapa EX tuviera que leer esas cosas directamente de la salida combinacional de ID, estaría mirando la instrucción <i>siguiente</i> (que entró a ID apenas un ciclo después) y los datos no corresponderían a la instrucción que se está ejecutando.</p>
      <p>La regla de oro del pipeline es que todo lo que una instrucción necesite en una etapa posterior tiene que viajar con ella en los registros de pipeline. Por eso este es el registro más grande: lleva el control completo (que se consume etapa por etapa: EX usa unos bits, MEM otros, WB otros), los operandos, el inmediato, el PC y también los <i>números</i> de registro rs1, rs2 y rd, no solo sus valores.</p>
      <p>Esos números son necesarios porque el valor de rs1/rs2 leído en ID puede quedar desactualizado cuando la instrucción llega a EX (una instrucción anterior todavía no lo escribió). La unidad de forwarding necesita comparar los índices con los destinos de las etapas MEM y WB para saber si hay que reenviar. Y rd tiene que acompañar a la instrucción hasta WB, porque el rd que está en IF/ID en ese momento pertenece a otra instrucción.</p>
      <p>Por último, este registro es donde se inserta la <b>burbuja</b> cuando una instrucción no debe ejecutarse (salto tomado, halt, o la espera de un load-use): un conjunto de señales de control todas en cero equivale a un NOP, que no escribe ni registros ni memoria ni redirige el PC.</p>`,
    inThisProject: `
      <p>Es ${g('module:id_ex_reg', 'id_ex_reg')}, instanciado como <code>u_id_ex</code>. Los campos de control (11) son: <code>reg_write, alu_src, mem_read, mem_write, branch, jump, is_jalr, is_auipc, halt, wb_sel[1:0], alu_op[3:0]</code>. Los de datos (9): <code>pc, pc4, rdata1, rdata2, imm, rs1, rs2, rd, funct3</code>. Los nombres de entrada tienen prefijo <code>id_</code> y los de salida <code>ex_</code>.</p>
      <p>La condición es <code>if (rst || (en &amp;&amp; flush))</code> → burbuja con <b>todo</b> en 0, control y datos; <code>else if (en)</code> → carga. Con <code>en = 0</code> no hace nada. Notá que <code>flush</code> solo se considera si <code>en = 1</code>, y que no existe un puerto <code>stall</code>: el stall congela IF/ID y el pipeline lo convierte en burbuja con <code>flush_id_ex = flush_id_ex_r | stop_fetch | stall</code>.</p>
      <p>Hay detalles que salen de la implementación y no de la teoría general. <code>is_jalr</code> e <code>is_auipc</code> no los produce control.v sino riscv_pipeline.v, comparando el opcode. <code>pc4</code> se calcula en ID y se acarrea hasta MEM. El cero en <code>ex_rd</code>, <code>ex_rs1</code> y <code>ex_rs2</code> de una burbuja es inofensivo porque <code>reg_write = 0</code> y x0 se ignora en forward y hazard. Por último, se guarda también <code>halt</code>: la señal que en EX corta el fetch y, cuando llegue a WB, levanta <code>o_halt</code>.</p>`,
    whyThisChoice: `
      <p>Meter la burbuja "con ceros" evita agregar un bit <code>valid</code> a cada etapa: las señales de efecto lateral en 0 ya la vuelven inerte. Es simple, pero implica que el dato de cualquier burbuja es 0 (se pierde la información de qué descartó), a diferencia de un <b>pipeline con bit de validez</b> (Rocket, Ibex) o de <b>vaciar solo las señales de control</b>, que ahorra lógica de reset en los 175 bits de datos pero deja basura visible al depurar.</p>
      <p>Guardar rs1/rs2 como índices extra cuesta 10 flip-flops, pero es lo que permite forwarding en EX. Un diseño con <b>menos etapas</b> (por ejemplo, ID y EX fusionadas) no tendría este registro ni estos hazards; uno <b>superescalar</b> o fuera de orden reemplaza este registro por estaciones de reserva y un ROB.</p>`,
  },
  refs: [
    { label: 'id_ex_reg', sym: 'module:id_ex_reg' },
    { label: 'ex_halt', sym: 'ex_halt' },
    { label: 'ex_rs1', sym: 'ex_rs1' },
    { label: 'flush', sym: 'flush' },
    { label: 'ex_alu_op', sym: 'ex_alu_op' },
  ],
  grid: [10, 7],
  ports,
  parts,
  nets,
};
