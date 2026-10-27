import { githubUrl } from '../repo.js';

const F = 'pipeline/regs/pipe_reg.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;

// [campo, ancho, grupo, descripción, live]
const FIELDS = [
  ['reg_write', 1, 'c', 'La instrucción escribe un registro. forward_unit lo mira para decidir si vale la pena reenviar este resultado.', 'snap.latches.exmem.reg_write'],
  ['mem_read', 1, 'c', 'Es un load.', 'snap.latches.exmem.mem_read'],
  ['mem_write', 1, 'c', 'Es un store: habilita la escritura de la dmem (junto con <code>en</code>).', 'snap.latches.exmem.mem_write'],
  ['halt', 1, 'c', 'Viaja hacia WB; ahí levanta <code>o_halt</code>.', 'snap.latches.exmem.halt'],
  ['wb_sel', 2, 'c', 'Selector del mux de resultado que está en MEM: 00 ALU, 01 dmem, 10 PC+4, 11 inmediato.', 'snap.latches.exmem.wb_sel'],
  ['alu_out', 32, 'd', 'Resultado de la ALU. En loads y stores es la dirección de byte; en el resto, el valor a escribir.', 'snap.latches.exmem.alu_out'],
  ['rdata2', 32, 'd', 'Dato de un store: el valor de rs2 <i>ya con forwarding</i> (sale del mux <code>fwd_b_val</code>, no del regfile).', 'snap.latches.exmem.rdata2'],
  ['pc4', 32, 'd', 'PC+4 que viene desde ID; JAL/JALR lo escriben en rd.', 'snap.latches.exmem.pc4'],
  ['imm', 32, 'd', 'Inmediato; LUI lo escribe en rd tal cual.', 'snap.latches.exmem.imm'],
  ['rd', 5, 'd', 'Registro destino. forward_unit lo compara con rs1/rs2 de EX.', 'snap.latches.exmem.rd'],
  ['funct3', 3, 'd', 'Ancho y signo del acceso a memoria (LB/LH/LW/LBU/LHU, SB/SH/SW).', 'snap.latches.exmem.funct3'],
];

const parts = [{
  id: 'prio', kind: 'logic', label: 'rst > en', width: 1, symbol: null, at: [2, 0], size: [1, 6],
  desc: 'Lógica de prioridad: <code>if (rst)</code> pone todo en 0; <code>else if (en)</code> carga lo que viene de EX; con <code>en = 0</code> retiene. No hay <code>flush</code> ni <code>stall</code> en este registro.',
}];
const nets = [
  { id: 'n_rst', from: 'port:rst', to: 'prio', name: 'rst', width: 1, desc: 'Reset sincrónico: todos los campos a 0.' },
  { id: 'n_en', from: 'port:en', to: 'prio', name: 'en', width: 1, desc: 'Pausa del CPU: si vale 0, el registro retiene su contenido.' },
];
const ports = [
  { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj del sistema.' },
  { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico.' },
  { name: 'en', dir: 'in', width: 1, side: 't', ext: 'debug (i_enable)', desc: 'Enable global (pausa).' },
];
const idx = { c: 0, d: 0 };
for (const [n, w, grp, desc, live] of FIELDS) {
  const i = idx[grp]++;
  const col = grp === 'c' ? 4 : 6 + (i < 3 ? 0 : 1);
  const row = grp === 'c' ? i : (i < 3 ? i : i - 3);
  parts.push({
    id: `mem_${n}`, kind: 'ff', label: `mem_${n}`, width: w, symbol: `mem_${n}`, at: [col, row], size: [1, 1],
    desc: `${grp === 'c' ? '<b>Control.</b> ' : '<b>Dato.</b> '}${desc}`, live,
  });
  nets.push({ id: `n_in_${n}`, from: `port:ex_${n}`, to: `mem_${n}`, name: `ex_${n}`, width: w, desc: `Entrada desde EX: ${desc}` });
  nets.push({ id: `n_out_${n}`, from: `mem_${n}`, to: `port:mem_${n}`, name: `mem_${n}`, width: w, desc: `Salida hacia MEM: ${desc}`, live });
  ports.push({ name: `ex_${n}`, dir: 'in', width: w, side: 'l', ext: n === 'alu_out' ? 'alu' : n === 'rdata2' ? 'fwdMuxB' : 'idex', desc: `Entrada: ${desc}` });
  ports.push({ name: `mem_${n}`, dir: 'out', width: w, side: 'r', ext: n === 'rd' || n === 'reg_write' ? 'dmem / forward / wbMux' : 'MEM', desc: `Salida: ${desc}` });
}
nets.push({ id: 'n_prio_c', from: 'prio', to: 'mem_reg_write', name: null, width: 1, desc: 'La decisión (cargar / retener / reset) vale para todos los campos de control.' });
nets.push({ id: 'n_prio_d', from: 'prio', to: 'mem_alu_out', name: null, width: 1, desc: 'Y para todos los campos de datos.' });

export default {
  id: 'ex_mem_reg',
  module: 'ex_mem_reg',
  file: F,
  instance: 'u_ex_mem',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_ex_mem',
  blockIds: ['exmem'],
  title: 'Registro EX/MEM',
  stage: 'MEM',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>La ALU produce su resultado hacia el final del ciclo de EX. Si la etapa de memoria tomara ese valor directamente de la salida de la ALU, sería la salida de lo que la ALU calcula <i>en ese instante</i> para la instrucción que ya entró a EX, no para la que está en MEM. Hacen falta flip-flops que retengan el resultado durante el ciclo siguiente.</p>
      <p>Como en todo registro de pipeline, la regla es que todo lo que el resto del camino necesite debe viajar con la instrucción. Desde EX en adelante ya no hace falta mucho de lo que había en ID/EX: los operandos originales, el control de ALU, branch y jump ya se usaron. Queda solo lo que MEM y WB van a consumir: el resultado de la ALU (que es la dirección para loads y stores), el dato a guardar en un store, el destino y las banderas de control restantes.</p>
      <p>Este registro tiene una particularidad: su contenido es una de las fuentes del <b>forwarding</b>. Un ciclo después de calcularse, el resultado de una instrucción está acá, y la siguiente puede necesitarlo ya mismo; para eso los índices (<code>rd</code>) y el bit <code>reg_write</code> también son visibles para la unidad de forwarding.</p>
      <p>Finalmente, no necesita lógica de flush: si una instrucción del camino equivocado fue anulada, ya se convirtió en burbuja en ID/EX, y al pasar por EX produce un EX/MEM inofensivo (todo en 0).</p>`,
    inThisProject: `
      <p>Es ${g('module:ex_mem_reg', 'ex_mem_reg')}, instanciado como <code>u_ex_mem</code>. Los campos de control son <code>reg_write, mem_read, mem_write, halt, wb_sel[1:0]</code> y los de datos <code>alu_out, rdata2, pc4, imm, rd, funct3</code>. Las entradas llevan prefijo <code>ex_</code> y las salidas <code>mem_</code>.</p>
      <p>La prioridad es la más simple: <code>if (rst)</code> todo en 0; <code>else if (en)</code> carga; si no, retiene. Sin <code>flush</code> ni <code>stall</code>.</p>
      <ul>
        <li>El dato de un store (<code>ex_rdata2</code>) se conecta desde riscv_pipeline.v a <code>fwd_b_val</code>, o sea ya con forwarding. Si el store estuviera usando <code>ex_rdata2</code> del regfile, <code>sw x2, 0(x1)</code> guardaría un valor viejo cuando x2 acaba de calcularse.</li>
        <li>Se guarda <code>imm</code> solo para LUI, cuyo valor se escribe sin pasar por la ALU. Y <code>pc4</code> para JAL/JALR, calculado en ID.</li>
        <li><code>mem_read</code> existe en el registro pero la dmem no lo recibe: la lectura es combinacional y siempre calcula <code>rdata</code> según <code>funct3</code>; solo se usa si <code>wb_sel = 01</code>.</li>
        <li>No se guardan <code>branch</code>, <code>jump</code>, <code>alu_src</code>, <code>alu_op</code>, <code>is_jalr</code>, <code>is_auipc</code>, <code>rs1</code> ni <code>rs2</code>: ya no se usan después de EX.</li>
      </ul>`,
    whyThisChoice: `
      <p>Guardar solamente lo que se sigue necesitando es lo que mantiene este registro en 142 bits en vez de repetir los 190 de ID/EX. La alternativa de <b>guardar más</b> (por ejemplo, el PC de cada instrucción para facilitar la depuración) facilitaría la interfaz pero costaría flip-flops. El hecho de que no haya flush acá es una decisión que depende de dónde se resuelven los saltos: si se resolvieran en MEM, habría que anular también esta etapa.</p>
      <p>En una implementación con <b>menos etapas</b> (2-3, como Ibex) este registro desaparece y la dmem se accede en la misma etapa que la ALU. En una con <b>más etapas</b> (superpipelining, como Pentium 4) se parte la memoria en varios ciclos. En una <b>fuera de orden</b> el resultado se escribiría en un ROB.</p>`,
  },
  refs: [
    { label: 'ex_mem_reg', sym: 'module:ex_mem_reg' },
    { label: 'mem_alu_out', sym: 'mem_alu_out' },
    { label: 'mem_rdata2', sym: 'mem_rdata2' },
    { label: 'mem_rd', sym: 'mem_rd' },
  ],
  grid: [9, 6],
  ports,
  parts,
  nets,
};
