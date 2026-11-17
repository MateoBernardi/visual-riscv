import { githubUrl } from '../repo.js';

const F = 'pipeline/regs/pipe_reg.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'if_id_reg',
  module: 'if_id_reg',
  file: F,
  instance: 'u_if_id',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_if_id',
  blockIds: ['ifid'],
  title: 'Registro IF/ID',
  stage: 'ID',
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Sin un registro entre etapas, ID vería cambiar la instrucción cada vez que cambia el PC. El registro de pipeline la captura en el flanco y la mantiene un ciclo. Además tiene que poder <b>retener</b> (stall) y <b>anularse</b> (flush: se carga un NOP, <code>0x00000013</code>).</p>`,
    inThisProject: `
      <ul>
        <li>Prioridad: <code>rst</code> &gt; <code>!en</code> (retiene, ignora flush y stall) &gt; <code>flush</code> &gt; <code>stall</code>. El flush gana sobre el stall.</li>
        <li>Su flush es <code>flush_if_id_r | stop_fetch</code>: lo activan un salto tomado y un halt.</li>
      </ul>`,
    whyThisChoice: `
      <p>Anular cargando un NOP real, en vez de llevar un bit de validez, no agrega lógica en ninguna etapa: un NOP ya escribe en x0. La contra es que en el volcado una burbuja no se distingue de un NOP del programa.</p>`,
  },
  refs: [
    { label: 'if_id_reg', sym: 'module:if_id_reg' },
    { label: 'id_inst', sym: 'id_inst' },
    { label: 'id_pc', sym: 'id_pc' },
    { label: 'flush', sym: 'flush' },
    { label: 'stall', sym: 'stall' },
  ],
  grid: [8, 5],
  ports: [
    { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj del sistema. Captura en el flanco de subida.' },
    { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug (i_rst)', desc: 'Reset sincrónico: la etapa queda con un NOP.' },
    { name: 'en', dir: 'in', width: 1, side: 't', ext: 'debug (i_enable)', desc: 'Si es 0, el registro retiene y se ignoran flush y stall.' },
    { name: 'stall', dir: 'in', width: 1, side: 'b', ext: 'hazard', desc: 'Load-use: mantener la instrucción actual para repetir ID.' },
    { name: 'flush', dir: 'in', width: 1, side: 'b', ext: 'flush', desc: 'Anular la instrucción buscada (salto tomado o halt).' },
    { name: 'if_pc', dir: 'in', width: 32, side: 'l', ext: 'pc', desc: 'PC de la instrucción que está en IF.' },
    { name: 'if_inst', dir: 'in', width: 32, side: 'l', ext: 'imem', desc: 'Palabra leída de la memoria de instrucciones.' },
    { name: 'id_pc', dir: 'out', width: 32, side: 'r', ext: 'ID', desc: 'PC de la instrucción en ID.' },
    { name: 'id_inst', dir: 'out', width: 32, side: 'r', ext: 'control / regfile / immgen', desc: 'Instrucción en ID: de acá salen opcode, rs1, rs2, rd, funct3, funct7 e inmediato.' },
  ],
  parts: [
    P('prio', 'logic', 'rst > !en > flush > !stall', 1, [2, 0], [1, 4], 'Lógica de prioridad que rodea a los flip-flops. Decide si el registro se resetea, retiene o carga un valor nuevo. Está escrita como un <code>if / else if</code> dentro del <code>always @(posedge clk)</code>.', { symbol: null }),
    P('nop', 'const', 'NOP 0x13', 32, [0, 4], [2, 1], 'Constante <code>32\'h00000013</code> (<code>addi x0, x0, 0</code>) que se carga en reset y en flush.', { symbol: null }),
    P('id_pc', 'ff', 'id_pc', 32, [4, 0], [2, 1], 'Flip-flops con el PC de la instrucción en ID. Lo necesita ID/EX para calcular PC+4, el destino de saltos y AUIPC.', { live: 'snap.latches.ifid.pc' }),
    P('id_inst', 'ff', 'id_inst', 32, [4, 2], [2, 1], 'Flip-flops con la instrucción de 32 bits. Es la única entrada de todo ID.', { live: 'snap.latches.ifid.inst' }),
  ],
  nets: [
    N('n_rst', 'port:rst', 'prio', 'rst', 1, 'Máxima prioridad: lleva el registro a NOP.'),
    N('n_en', 'port:en', 'prio', 'en', 1, 'Segunda prioridad: con 0 todo queda retenido, aunque haya flush o stall.'),
    N('n_flush', 'port:flush', 'prio', 'flush', 1, 'Si vale 1 (y el CPU no está pausado) se carga el NOP, sin importar si hay stall.', 'snap.signals.flushIfId'),
    N('n_stall', 'port:stall', 'prio', 'stall', 1, 'Si vale 1 y no hay flush, el registro conserva la instrucción: ID la repite.', 'snap.signals.stall'),
    N('n_nop', 'nop', 'prio', null, 32, 'Valor que reemplaza a la instrucción cuando se resetea o se anula.'),
    N('n_if_pc', 'port:if_pc', 'prio', 'if_pc', 32, 'PC de la instrucción buscada: candidato a cargarse si no hay stall ni flush.', 'snap.pc'),
    N('n_if_inst', 'port:if_inst', 'prio', 'if_inst', 32, 'Instrucción leída de la imem: candidata a cargarse.', 'snap.signals.ifInst'),
    N('n_load_pc', 'prio', 'id_pc', 'id_pc', 32, 'Lo que el registro de PC va a tener después del flanco (nuevo valor, 0 o el mismo).'),
    N('n_load_inst', 'prio', 'id_inst', 'id_inst', 32, 'Lo que el registro de instrucción va a tener después del flanco (nueva, NOP o la misma).'),
    N('n_id_pc', 'id_pc', 'port:id_pc', 'id_pc', 32, 'PC estable durante todo el ciclo ID; va a ID/EX y al sumador +4.', 'snap.latches.ifid.pc'),
    N('n_id_inst', 'id_inst', 'port:id_inst', 'id_inst', 32, 'La instrucción en ID, a la que acceden control, regfile, immgen y hazard_unit.', 'snap.latches.ifid.inst'),
  ],
};
