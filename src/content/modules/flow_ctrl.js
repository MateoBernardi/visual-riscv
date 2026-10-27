import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'flow_ctrl',
  module: 'riscv_pipeline',
  file: F,
  pseudo: true,
  instance: null,
  parent: 'flush_unit',
  within: 'riscv_pipeline',
  instancePath: 'u_cpu',
  blockIds: [],
  title: 'Control de flujo (stop_fetch, redirect, halt)',
  stage: 'EX',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>Un pipeline tiene varias razones para dejar de avanzar normalmente, y cada una exige una combinación distinta de tres acciones: <b>congelar</b> el PC, <b>congelar</b> un registro de pipeline y <b>anular</b> (convertir en burbuja) lo que entra a una etapa. Un salto tomado anula las instrucciones traídas por error y cambia el PC. Un load-use congela el PC y IF/ID, y mete una burbuja. Una pausa externa congela todo. Un <b>halt</b> (ECALL/EBREAK) tiene que dejar de buscar instrucciones y anular las que ya entraron, pero dejar terminar las anteriores.</p>
      <p>Las tres razones pueden coincidir en el mismo ciclo, así que alguien tiene que combinar las señales (con ORs y ANDs) y decidir qué registro recibe qué. Esa lógica "de pegamento" no pertenece a una etapa en particular: lee señales de EX y actúa sobre IF, ID y EX.</p>
      <p>El halt tiene una dificultad particular: cuando llega a EX hay que cortar el fetch inmediatamente, pero en los ciclos siguientes el halt ya no está en EX (avanzó a MEM y WB) y el procesador tiene que <i>recordar</i> que no debe seguir. Eso requiere un bit de memoria "pegajoso" (un flip-flop que se pone en 1 y solo un reset lo borra).</p>`,
    inThisProject: `
      <p>Esta lógica está en línea en riscv_pipeline.v, no en un módulo propio. Tiene cuatro piezas:</p>
      <ul>
        <li>${g('branch_taken')} <code>= ex_branch &amp; bu_taken</code> y ${g('redirect')} <code>= branch_taken | ex_jump</code>. El destino es ${g('redirect_target')} <code>= ex_is_jalr ? (alu_out &amp; ~1) : bu_target</code>: JALR usa la suma de la ALU con el bit 0 forzado a 0, el resto el sumador de branch_unit.</li>
        <li>${g('halting_r')}: <code>if (rst) 0; else if (en &amp;&amp; ex_halt) 1</code>. Pegajoso desde que un halt llega a EX hasta el reset. ${g('halting')} es solo un alias (<code>assign halting = halting_r</code>).</li>
        <li>${g('stop_fetch')} <code>= ex_halt | halting</code>: cubre el ciclo en que el halt está en EX (todavía no registrado) y todos los siguientes.</li>
        <li>Los flush finales: ${g('flush_if_id')} <code>= flush_if_id_r | stop_fetch</code> y ${g('flush_id_ex')} <code>= flush_id_ex_r | stop_fetch | stall</code>; y ${g('pc_en')} <code>= en &amp; ~stall &amp; ~stop_fetch</code>.</li>
      </ul>
      <p>La consecuencia es que "ninguna instrucción posterior al halt puede ejecutarse": las instrucciones más viejas siguen su camino y retiran normalmente. Cuando el halt llega a WB, <code>wb_halt</code> sube <code>o_halt</code>. Detalles de esta implementación: con <code>en = 0</code> el halt no se registra; no hay prioridad explícita entre stall y flush por salto porque no pueden coincidir (un load y un branch no ocupan EX a la vez); sí pueden coincidir un halt y un stall, y en ese caso <code>stop_fetch</code> ya anula todo.</p>`,
    whyThisChoice: `
      <p>Dejar esta lógica en riscv_pipeline.v como asignaciones de una línea la hace fácil de leer, pero mezcla política de control con el cableado. La alternativa es un módulo central de "pipeline control" que centralice stall, flush y halt (como hacen muchos diseños en la práctica). Para el halt, otra solución común es una <b>FSM</b> con estados RUN/DRAIN/HALTED en lugar de un único flip-flop; otra es tratar ECALL/EBREAK como <b>trap</b> con CSRs (mepc, mcause, mtvec) en vez de frenar, que es lo que haría un RISC-V completo con modo M y permite sistemas operativos.</p>
      <p>Resolver el salto en EX hace que esta lógica quede cerca de la ALU y no necesite forwarding hacia ID; si se resolviera en ID, la penalidad bajaría a 1 ciclo a costa de un comparador y de bypass extra. La predicción de saltos (estática, bimodal, gshare, BTB) añadiría un camino de corrección además de este.</p>`,
  },
  refs: [
    { label: 'stop_fetch', sym: 'stop_fetch' },
    { label: 'halting_r', sym: 'halting_r' },
    { label: 'redirect', sym: 'redirect' },
    { label: 'redirect_target', sym: 'redirect_target' },
    { label: 'flush_id_ex', sym: 'flush_id_ex' },
    { label: 'pc_en', sym: 'pc_en' },
  ],
  grid: [11, 7],
  ports: [
    { name: 'ex_branch', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es un branch.' },
    { name: 'bu_taken', dir: 'in', width: 1, side: 'l', ext: 'branch', desc: 'Condición evaluada por branch_unit.' },
    { name: 'ex_jump', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es JAL o JALR.' },
    { name: 'ex_is_jalr', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'Es JALR: usar la ALU como destino.' },
    { name: 'alu_out', dir: 'in', width: 32, side: 'l', ext: 'alu', desc: 'rs1 + imm para JALR.' },
    { name: 'bu_target', dir: 'in', width: 32, side: 'l', ext: 'branch', desc: 'pc + imm para branches y JAL.' },
    { name: 'ex_halt', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es ECALL/EBREAK.' },
    { name: 'stall', dir: 'in', width: 1, side: 'b', ext: 'hazard', desc: 'Load-use.' },
    { name: 'en', dir: 'in', width: 1, side: 'b', ext: 'debug', desc: 'Alias de <code>i_enable</code>.' },
    { name: 'rst', dir: 'in', width: 1, side: 't', ext: 'debug', desc: 'Alias de <code>i_rst</code>.' },
    { name: 'flush_if_id_r', dir: 'in', width: 1, side: 't', ext: 'flush', desc: 'Salida de flush_unit para IF/ID.' },
    { name: 'flush_id_ex_r', dir: 'in', width: 1, side: 't', ext: 'flush', desc: 'Salida de flush_unit para ID/EX.' },
    { name: 'redirect', dir: 'out', width: 1, side: 'r', ext: 'pc / flush', desc: 'Orden de cambiar el PC; entra al mux del PC y a flush_unit.' },
    { name: 'redirect_target', dir: 'out', width: 32, side: 'r', ext: 'pc', desc: 'Destino del salto.' },
    { name: 'pc_en', dir: 'out', width: 1, side: 'r', ext: 'pc', desc: 'Enable del registro PC.' },
    { name: 'flush_if_id', dir: 'out', width: 1, side: 'r', ext: 'ifid', desc: 'Flush final de IF/ID.' },
    { name: 'flush_id_ex', dir: 'out', width: 1, side: 'r', ext: 'idex', desc: 'Flush final de ID/EX.' },
  ],
  parts: [
    P('branch_taken', 'logic', 'ex_branch & bu_taken', 1, [2, 0], [2, 1], 'AND que descarta el resultado de branch_unit si la instrucción en EX no es un branch.', { live: 'snap.signals.branchTaken' }),
    P('redirect', 'logic', 'redirect', 1, [5, 0], [2, 1], 'OR de branch tomado y jump: EX cambia el PC.', { live: 'snap.signals.redirect' }),
    P('redirect_target', 'mux', 'redirect_target', 32, [3, 2], [2, 1], 'Mux 2:1: JALR → <code>alu_out &amp; ~1</code>; el resto → <code>bu_target</code>.', { live: 'snap.signals.redirectTarget' }),
    P('halting_r', 'ff', 'halting_r', 1, [2, 4], [2, 1], 'Flip-flop pegajoso: <code>if (rst) 0 else if (en &amp;&amp; ex_halt) 1</code>.', { live: 'snap.halting' }),
    P('stop_fetch', 'logic', 'stop_fetch', 1, [5, 4], [2, 1], '<code>ex_halt | halting</code>: ninguna instrucción posterior al halt puede ejecutarse.', { live: 'snap.signals.stopFetch' }),
    P('pc_en', 'logic', 'pc_en', 1, [8, 1], [2, 1], '<code>en &amp; ~stall &amp; ~stop_fetch</code>.'),
    P('flush_if_id', 'logic', 'flush_if_id', 1, [8, 3], [2, 1], '<code>flush_if_id_r | stop_fetch</code>.', { live: 'snap.signals.flushIfId' }),
    P('flush_id_ex', 'logic', 'flush_id_ex', 1, [8, 5], [2, 1], '<code>flush_id_ex_r | stop_fetch | stall</code>.', { live: 'snap.signals.flushIdEx' }),
  ],
  nets: [
    N('n_ex_branch', 'port:ex_branch', 'branch_taken', 'ex_branch', 1, 'Marca que la instrucción en EX es un branch.', 'snap.latches.idex.branch'),
    N('n_bu_taken', 'port:bu_taken', 'branch_taken', 'bu_taken', 1, 'Condición del branch según funct3 y las banderas de la ALU.'),
    N('n_branch_taken', 'branch_taken', 'redirect', 'branch_taken', 1, 'Branch realmente tomado.', 'snap.signals.branchTaken'),
    N('n_ex_jump', 'port:ex_jump', 'redirect', 'ex_jump', 1, 'JAL y JALR siempre redirigen.', 'snap.latches.idex.jump'),
    N('n_redirect_out', 'redirect', 'port:redirect', 'redirect', 1, 'Sale hacia el mux <code>pc_next</code> y hacia flush_unit.', 'snap.signals.redirect'),
    N('n_ex_is_jalr', 'port:ex_is_jalr', 'redirect_target', 'ex_is_jalr', 1, 'Selector del mux de destino.', 'snap.latches.idex.is_jalr'),
    N('n_alu_out', 'port:alu_out', 'redirect_target', 'alu_out', 32, 'rs1 + imm calculado por la ALU; se enmascara con <code>~32\'h1</code> para dejar el bit 0 en cero.', 'snap.signals.aluOut'),
    N('n_bu_target', 'port:bu_target', 'redirect_target', 'bu_target', 32, 'pc + imm calculado por branch_unit.'),
    N('n_target_out', 'redirect_target', 'port:redirect_target', 'redirect_target', 32, 'Destino del salto, hacia el mux del PC.', 'snap.signals.redirectTarget'),
    N('n_rst', 'port:rst', 'halting_r', 'rst', 1, 'El reset borra el halt pegajoso.'),
    N('n_en_halt', 'port:en', 'halting_r', 'en', 1, 'Con el CPU pausado no se registra el halt.'),
    N('n_ex_halt_ff', 'port:ex_halt', 'halting_r', 'ex_halt', 1, 'Primer ciclo con un halt en EX: el flip-flop se pone en 1.', 'snap.latches.idex.halt'),
    N('n_ex_halt_stop', 'port:ex_halt', 'stop_fetch', 'ex_halt', 1, 'Corte inmediato, antes de que el flip-flop lo registre.', 'snap.latches.idex.halt'),
    N('n_halting', 'halting_r', 'stop_fetch', 'halting', 1, 'Halt memorizado, para los ciclos posteriores.', 'snap.halting'),
    N('n_stop_pc', 'stop_fetch', 'pc_en', 'stop_fetch', 1, 'Frena el PC.', 'snap.signals.stopFetch'),
    N('n_stop_if', 'stop_fetch', 'flush_if_id', 'stop_fetch', 1, 'Anula lo que entra a IF/ID.', 'snap.signals.stopFetch'),
    N('n_stop_ex', 'stop_fetch', 'flush_id_ex', 'stop_fetch', 1, 'Anula lo que entra a ID/EX.', 'snap.signals.stopFetch'),
    N('n_stall_pc', 'port:stall', 'pc_en', 'stall', 1, 'Load-use: el PC no avanza.', 'snap.signals.stall'),
    N('n_en_pc', 'port:en', 'pc_en', 'en', 1, 'Pausa externa.'),
    N('n_stall_ex', 'port:stall', 'flush_id_ex', 'stall', 1, 'Load-use: burbuja en ID/EX.', 'snap.signals.stall'),
    N('n_flush_if_r', 'port:flush_if_id_r', 'flush_if_id', 'flush_if_id_r', 1, 'Flush por salto tomado.', 'snap.signals.redirect'),
    N('n_flush_ex_r', 'port:flush_id_ex_r', 'flush_id_ex', 'flush_id_ex_r', 1, 'Flush por salto tomado.', 'snap.signals.redirect'),
    N('n_pc_en_out', 'pc_en', 'port:pc_en', 'pc_en', 1, 'Enable del registro PC.'),
    N('n_flush_if_out', 'flush_if_id', 'port:flush_if_id', 'flush_if_id', 1, 'Va a IF/ID.', 'snap.signals.flushIfId'),
    N('n_flush_ex_out', 'flush_id_ex', 'port:flush_id_ex', 'flush_id_ex', 1, 'Va a ID/EX.', 'snap.signals.flushIdEx'),
  ],
};
