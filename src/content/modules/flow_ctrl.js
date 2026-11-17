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
      <p>Cada evento pide otra mezcla de <b>congelar</b> el PC, congelar un registro y <b>anular</b> lo que entra a una etapa. Un salto anula y redirige, un load-use congela y mete una burbuja, una pausa congela todo, y un halt corta el fetch pero deja terminar lo anterior. Como el halt sigue avanzando, hace falta un bit "pegajoso" que recuerde que ya no se busca nada.</p>`,
    inThisProject: `
      <ul>
        <li>Está en línea en riscv_pipeline.v: ${g('redirect')}, ${g('redirect_target')}, ${g('halting_r')}, ${g('stop_fetch')}, ${g('flush_if_id')}, ${g('flush_id_ex')} y ${g('pc_en')}.</li>
        <li>${g('halting_r')} se pone en 1 cuando un halt llega a EX y solo lo borra el reset. ${g('stop_fetch')} <code>= ex_halt | halting</code> cubre también el primer ciclo.</li>
        <li>Stall y salto nunca coinciden (un load y un branch no ocupan EX a la vez). Halt y stall sí, y <code>stop_fetch</code> ya anula todo.</li>
      </ul>`,
    whyThisChoice: `
      <p>Un flip-flop pegajoso es lo mínimo para garantizar que "nada posterior a un halt se ejecuta". Un trap completo (CSRs <code>mtvec</code>, <code>mepc</code>) permitiría manejarlo y seguir, pero acá no hay sistema operativo: quien atiende el halt es la debug unit, que lee la causa del volcado.</p>`,
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
