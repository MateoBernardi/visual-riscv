import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx_comb.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx_comb',
  module: 'uart_rx_comb',
  file: F,
  instance: 'COMB',
  parent: 'uart_rx',
  blockIds: [],
  title: 'uart_rx_comb (datapath)',
  stage: null,
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>El receptor necesita dos contadores y un registro de desplazamiento. Un contador que "puede limpiarse, incrementarse o quedarse igual" se escribe como un mux con prioridad: <code>clear ? 0 : inc ? valor + 1 : valor</code>. El tercer caso, "quedarse igual", es lo que hace que un registro recuerde. La FSM no calcula nada: solo levanta <code>clear</code> o <code>inc</code> y este módulo hace la cuenta.</p>
      <p>El registro de desplazamiento se arma con concatenación: <code>{i_rx, i_byte[7:1]}</code> descarta el bit 0 (el más viejo) y mete el bit nuevo por la izquierda. Aplicado ocho veces, el primer bit recibido (el LSB, que viaja primero en una UART) termina en la posición 0.</p>
      <p>Por último, el módulo calcula tres comparaciones sobre los contadores y se las devuelve a la FSM: así la FSM se limita a decidir con bits, sin comparar números. Estas comparaciones salen de los parámetros (<code>N_TICKS</code>, <code>NB_DATA</code>), por lo que cambiar el sobremuestreo o el largo del dato no obliga a tocar la FSM.</p>`,
    inThisProject: `
      <p>${L('o_s_next')} = <code>s_clear ? 0 : s_inc ? s + 1 : s</code> (4 bits: <code>$clog2(N_TICKS)</code>); ${L('o_n_next')} igual para <code>n</code> (3 bits: <code>$clog2(NB_DATA)</code>); ${L('o_byte_next')} = <code>i_shift ? {i_rx, i_byte[NB_DATA-1:1]} : i_byte</code>.</p>
      <p>Banderas: ${L('o_s_half')} = <code>(i_s == HALF_TICK)</code> con ${L('HALF_TICK')} = <code>(N_TICKS / 2) - 1</code> = 7; ${L('o_s_last')} = <code>(i_s == N_TICKS - 1)</code> = 15; ${L('o_n_last')} = <code>(i_n == NB_DATA - 1)</code> = 7. Que <code>HALF_TICK</code> valga 7 (y no 8) tiene que ver con que <code>s</code> arranca en 0: cuando <code>s == 7</code> ya se contaron 8 ticks.</p>
      <p>Como los contadores son de 4 y 3 bits, desbordan naturalmente (15 + 1 = 0); la FSM los limpia explícitamente antes de que eso importe.</p>`,
    whyThisChoice: `
      <p><b>Parametrizar umbrales.</b> Los valores 7, 15 y 7 se derivan de <code>N_TICKS</code> y <code>NB_DATA</code> en lugar de ser literales: se puede pasar a 8N1 con 8 ticks o a 7 bits de datos sin reescribir la FSM. La versión original del proyecto tenía 16 y 8 fijos.</p>
      <p><b>Comparar contra una constante vs. contar hacia atrás.</b> Un contador descendente con detección de cero ahorra un comparador, pero hace menos obvia la relación con "mitad del bit". Acá la claridad pesa más que los LUTs.</p>
      <p><b>Desplazar a la derecha vs. indexar por <code>n</code>.</b> Con desplazamiento, el registro se escribe completo con una concatenación; con indexación (<code>byte[n] &lt;= i_rx</code>) haría falta un decodificador de escritura por bit.</p>`,
  },
  refs: [
    { label: 'HALF_TICK', sym: 'HALF_TICK' },
    { label: 'o_byte_next', sym: 'o_byte_next' },
  ],
  grid: [12, 7],
  ports: [
    P('i_rx', 'in', 1, 'l', 'rx_sync', 'Bit que se inserta al desplazar.'),
    P('i_s', 'in', 4, 'l', 'REGS', 'Contador de ticks (<code>$clog2(N_TICKS)</code>).'),
    P('i_n', 'in', 3, 'l', 'REGS', 'Contador de bits (<code>$clog2(NB_DATA)</code>).'),
    P('i_byte', 'in', 8, 'l', 'REGS', 'Byte en construcción.'),
    P('i_s_clear', 'in', 1, 'l', 'FSM', 'Limpiar <code>s</code>.'),
    P('i_s_inc', 'in', 1, 'l', 'FSM', 'Incrementar <code>s</code>.'),
    P('i_n_clear', 'in', 1, 'l', 'FSM', 'Limpiar <code>n</code>.'),
    P('i_n_inc', 'in', 1, 'l', 'FSM', 'Incrementar <code>n</code>.'),
    P('i_shift', 'in', 1, 'l', 'FSM', 'Desplazar el byte.'),
    P('o_s_next', 'out', 4, 'r', 'REGS', 'Próximo <code>s</code>.'),
    P('o_n_next', 'out', 3, 'r', 'REGS', 'Próximo <code>n</code>.'),
    P('o_byte_next', 'out', 8, 'r', 'REGS', 'Próximo byte.'),
    P('o_s_half', 'out', 1, 'r', 'FSM', '<code>s == 7</code>.'),
    P('o_s_last', 'out', 1, 'r', 'FSM', '<code>s == 15</code>.'),
    P('o_n_last', 'out', 1, 'r', 'FSM', '<code>n == 7</code>.'),
  ],
  parts: [
    { id: 'o_s_next', kind: 'mux', label: 'o_s_next', width: 4, symbol: 'o_s_next', at: [3, 0], size: [3, 1], live: 'uart.rx.s', desc: '<p><code>clear ? 0 : inc ? s+1 : s</code>.</p>' },
    { id: 'o_n_next', kind: 'mux', label: 'o_n_next', width: 3, symbol: 'o_n_next', at: [3, 2], size: [3, 1], live: 'uart.rx.n', desc: '<p><code>clear ? 0 : inc ? n+1 : n</code>.</p>' },
    { id: 'o_byte_next', kind: 'mux', label: 'o_byte_next', width: 8, symbol: 'o_byte_next', at: [3, 4], size: [3, 1], live: 'uart.rx.byte', desc: '<p><code>shift ? {i_rx, byte[7:1]} : byte</code>.</p>' },
    { id: 'HALF_TICK', kind: 'const', label: 'HALF_TICK = 7', width: 4, symbol: 'HALF_TICK', at: [7, 0], size: [2, 1], desc: '<p><code>(N_TICKS / 2) - 1</code>.</p>' },
    { id: 'o_s_half', kind: 'cmp', label: 's == HALF_TICK', width: 1, symbol: 'o_s_half', at: [9, 0], size: [2, 1], desc: '<p>Centro del bit de start.</p>' },
    { id: 'o_s_last', kind: 'cmp', label: 's == N_TICKS-1', width: 1, symbol: 'o_s_last', at: [9, 1], size: [2, 1], desc: '<p>Fin de un bit.</p>' },
    { id: 'o_n_last', kind: 'cmp', label: 'n == NB_DATA-1', width: 1, symbol: 'o_n_last', at: [9, 3], size: [2, 1], desc: '<p>Último bit de datos.</p>' },
  ],
  nets: [
    { id: 'n_s_in', from: 'port:i_s', to: 'o_s_next', name: 'i_s', width: 4, live: 'uart.rx.s', desc: '<p>Valor actual de <code>s</code>.</p>' },
    { id: 'n_s_half', from: 'port:i_s', to: 'o_s_half', name: 'i_s', width: 4, live: 'uart.rx.s', desc: '<p><code>s</code> hacia el comparador de mitad de bit.</p>' },
    { id: 'n_s_last', from: 'port:i_s', to: 'o_s_last', name: 'i_s', width: 4, live: 'uart.rx.s', desc: '<p><code>s</code> hacia el comparador de fin de bit.</p>' },
    { id: 'n_half_const', from: 'HALF_TICK', to: 'o_s_half', name: 'HALF_TICK', width: 4, desc: '<p>Umbral de mitad de bit.</p>' },
    { id: 'n_n_in', from: 'port:i_n', to: 'o_n_next', name: 'i_n', width: 3, live: 'uart.rx.n', desc: '<p>Valor actual de <code>n</code>.</p>' },
    { id: 'n_n_last', from: 'port:i_n', to: 'o_n_last', name: 'i_n', width: 3, live: 'uart.rx.n', desc: '<p><code>n</code> hacia el comparador de último bit.</p>' },
    { id: 'n_byte_in', from: 'port:i_byte', to: 'o_byte_next', name: 'i_byte', width: 8, live: 'uart.rx.byte', desc: '<p>Byte actual, a desplazar o mantener.</p>' },
    { id: 'n_rx_in', from: 'port:i_rx', to: 'o_byte_next', name: 'i_rx', width: 1, desc: '<p>Bit nuevo, entra por la izquierda.</p>' },
    { id: 'n_s_ctl', from: 'port:i_s_clear', to: 'o_s_next', name: 'i_s_clear', width: 1, desc: '<p>Control del contador de ticks (<code>i_s_clear</code>, <code>i_s_inc</code>).</p>' },
    { id: 'n_n_ctl', from: 'port:i_n_clear', to: 'o_n_next', name: 'i_n_clear', width: 1, desc: '<p>Control del contador de bits (<code>i_n_clear</code>, <code>i_n_inc</code>).</p>' },
    { id: 'n_shift', from: 'port:i_shift', to: 'o_byte_next', name: 'i_shift', width: 1, desc: '<p>Selecciona desplazar el byte.</p>' },
    { id: 'n_o_s', from: 'o_s_next', to: 'port:o_s_next', name: 'o_s_next', width: 4, desc: '<p>A REGS.</p>' },
    { id: 'n_o_n', from: 'o_n_next', to: 'port:o_n_next', name: 'o_n_next', width: 3, desc: '<p>A REGS.</p>' },
    { id: 'n_o_byte', from: 'o_byte_next', to: 'port:o_byte_next', name: 'o_byte_next', width: 8, desc: '<p>A REGS.</p>' },
    { id: 'n_o_half', from: 'o_s_half', to: 'port:o_s_half', name: 'o_s_half', width: 1, desc: '<p>A la FSM.</p>' },
    { id: 'n_o_last', from: 'o_s_last', to: 'port:o_s_last', name: 'o_s_last', width: 1, desc: '<p>A la FSM.</p>' },
    { id: 'n_o_nlast', from: 'o_n_last', to: 'port:o_n_last', name: 'o_n_last', width: 1, desc: '<p>A la FSM.</p>' },
  ],
};
