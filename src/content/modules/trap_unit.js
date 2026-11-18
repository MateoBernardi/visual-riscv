import { githubUrl } from '../repo.js';

const F = 'pipeline/flow/trap_unit.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'trap_unit',
  module: 'trap_unit',
  file: F,
  instance: 'u_trap',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_trap',
  blockIds: ['trap'],
  title: 'Unidad de traps',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Algunas instrucciones son válidas pero no se pueden ejecutar con ciertos datos: un load de palabra en una dirección que no es múltiplo de 4, un store fuera de la memoria, un salto a un destino desalineado. Eso recién se sabe cuando está calculada la dirección, en EX. La instrucción tiene que detener el CPU sin escribir nada, para que la excepción sea <b>precisa</b>.</p>`,
    inThisProject: `
      <ul>
        <li>Causas de mcause: 0 salto desalineado, 4/6 load/store desalineado, 5/7 load/store fuera de la dmem. Si hay salto desalineado, gana sobre la de memoria.</li>
        <li>En riscv_pipeline.v, <code>ex_exc</code> anula <code>reg_write</code>, <code>mem_read</code> y <code>mem_write</code> antes de EX/MEM, y activa <code>halting</code>.</li>
        <li>Las causas de ID (ilegal, fuera de la imem, ecall, ebreak) no pasan por acá: viajan con la instrucción desde illegal_check.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Detectar donde está la dirección.</b> EX es la primera etapa en la que se conocen la dirección del acceso y el destino del salto; esperar a MEM dejaría que el acceso ocurra. Es lógica chica, sin estado: comparar dos bits bajos y un rango.</p>
      <p><b>Fuera del camino crítico.</b> El flush no espera el chequeo de salto desalineado (${g('exc_mem')} va al flush, no ${g('exc')}): un salto desalineado ya vacía IF/ID e ID/EX por ser un salto. Es la misma lógica, pero saca la comparación del camino ALU &rarr; decisión del salto &rarr; flush.</p>`,
  },
  refs: [
    { label: 'trap_unit', sym: 'module:trap_unit' },
    { label: 'pc_misaligned', sym: 'pc_misaligned' },
    { label: 'mem_misaligned', sym: 'mem_misaligned' },
    { label: 'mem_fault', sym: 'mem_fault' },
  ],
  grid: [10, 7],
  ports: [
    { name: 'redirect', dir: 'in', width: 1, side: 'l', ext: 'branch', desc: 'Hay un salto tomado en EX.' },
    { name: 'redirect_target', dir: 'in', width: 32, side: 'l', ext: 'branch', desc: 'Destino del salto.' },
    { name: 'mem_read', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es un load.' },
    { name: 'mem_write', dir: 'in', width: 1, side: 'l', ext: 'idex', desc: 'La instrucción en EX es un store.' },
    { name: 'funct3', dir: 'in', width: 3, side: 'l', ext: 'idex', desc: 'Tamaño del acceso: <code>[1:0]</code> = 00 byte, 01 media palabra, 10 palabra.' },
    { name: 'addr', dir: 'in', width: 32, side: 'l', ext: 'alu', desc: 'Dirección del load o store (salida de la ALU).' },
    { name: 'exc', dir: 'out', width: 1, side: 'r', ext: 'exmem', desc: 'Hay excepción: anula las escrituras y detiene el CPU.' },
    { name: 'exc_mem', dir: 'out', width: 1, side: 'r', ext: 'flush', desc: 'Solo la parte de load/store; es la que va al flush.' },
    { name: 'cause', dir: 'out', width: 4, side: 'r', ext: 'debug', desc: 'Código de mcause, que queda en el mapa de debug.' },
    { name: 'tval', dir: 'out', width: 32, side: 'r', ext: 'debug', desc: 'Dirección que falló.' },
  ],
  parts: [
    P('pc_misaligned', 'logic', 'target[1:0] != 0', 1, [2, 0], [3, 1], 'Salto tomado a una dirección que no es múltiplo de 4. Es un trap del salto: el PC nunca llega a quedar desalineado.', { live: 'snap.signals.redirect' }),
    P('mem', 'logic', 'mem_read || mem_write', 1, [2, 2], [3, 1], 'La instrucción accede a memoria.'),
    P('mem_misaligned', 'logic', 'desalineado', 1, [2, 3], [3, 1], 'Palabra con <code>addr[1:0] != 0</code> o media palabra con <code>addr[0] != 0</code>. Un byte nunca está desalineado.'),
    P('mem_fault', 'logic', 'addr >= 1 KB', 1, [2, 5], [3, 1], '<code>addr >= DMEM_BYTES</code>: acceso fuera de la dmem (1 KB).'),
    P('exc', 'logic', 'exc', 1, [6, 1], [2, 1], '<code>exc_mem = mem_misaligned || mem_fault</code> y <code>exc = pc_misaligned || exc_mem</code>.', { symbol: null, live: 'snap.signals.exc' }),
    P('cause', 'mux', 'cause / tval', 4, [6, 4], [2, 2], 'Salto desalineado: causa 0 y <code>tval = redirect_target</code>. Si no: 4/6 desalineado o 5/7 fuera de rango, según sea load o store, con <code>tval = addr</code>.', { live: 'snap.signals.excCause' }),
  ],
  nets: [
    N('n_redirect', 'port:redirect', 'pc_misaligned', 'redirect', 1, 'Solo un salto tomado puede estar desalineado.', 'snap.signals.redirect'),
    N('n_target', 'port:redirect_target', 'pc_misaligned', 'redirect_target', 32, 'Se miran los dos bits bajos.', 'snap.signals.redirectTarget'),
    N('n_rd', 'port:mem_read', 'mem', 'mem_read', 1, 'Load en EX.', 'snap.latches.idex.mem_read'),
    N('n_wr', 'port:mem_write', 'mem', 'mem_write', 1, 'Store en EX.', 'snap.latches.idex.mem_write'),
    N('n_mem_mis', 'mem', 'mem_misaligned', 'mem', 1, 'Solo cuenta si hay acceso.'),
    N('n_mem_fault', 'mem', 'mem_fault', 'mem', 1, 'Solo cuenta si hay acceso.'),
    N('n_f3', 'port:funct3', 'mem_misaligned', 'funct3', 3, 'Tamaño del acceso.', 'snap.latches.idex.funct3'),
    N('n_addr_mis', 'port:addr', 'mem_misaligned', 'addr', 32, 'Bits bajos de la dirección.', 'snap.signals.aluOut'),
    N('n_addr_fault', 'port:addr', 'mem_fault', 'addr', 32, 'Se compara con el tamaño de la dmem.', 'snap.signals.aluOut'),
    N('n_pc_exc', 'pc_misaligned', 'exc', 'pc_misaligned', 1, 'Parte del salto.'),
    N('n_mis_exc', 'mem_misaligned', 'exc', 'mem_misaligned', 1, 'Parte de memoria.'),
    N('n_fault_exc', 'mem_fault', 'exc', 'mem_fault', 1, 'Parte de memoria.'),
    N('n_pc_cause', 'pc_misaligned', 'cause', 'pc_misaligned', 1, 'Tiene prioridad en la causa.'),
    N('n_mis_cause', 'mem_misaligned', 'cause', 'mem_misaligned', 1, 'Desalineado (4/6) o fuera de rango (5/7).'),
    N('n_exc', 'exc', 'port:exc', 'exc', 1, 'Va a riscv_pipeline.v como <code>ex_exc</code>.', 'snap.signals.exc'),
    N('n_exc_mem', 'exc', 'port:exc_mem', 'exc_mem', 1, 'Va al flush como <code>ex_exc_mem</code>.', 'snap.signals.excMem'),
    N('n_cause', 'cause', 'port:cause', 'cause', 4, 'Se registra en <code>trap_cause</code>.', 'snap.signals.excCause'),
    N('n_tval', 'cause', 'port:tval', 'tval', 32, 'Se registra en <code>trap_tval</code>.', 'snap.signals.excTval'),
  ],
};
