import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx_regs.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx_regs',
  module: 'uart_rx_regs',
  file: F,
  instance: 'REGS',
  parent: 'uart_rx',
  blockIds: [],
  title: 'uart_rx_regs (registros)',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Todo lo que el receptor "recuerda" entre ciclos vive en cuatro registros: en qué estado está, cuántos ticks lleva dentro del bit, cuántos bits del byte ya leyó, y los bits ya acumulados. Sin ellos cada ciclo empezaría de cero. Un registro es un grupo de flip-flops que, en cada flanco de reloj, copia su entrada; si la entrada es el "próximo valor" calculado por lógica combinacional, el registro implementa el paso de un ciclo al siguiente.</p>
      <p>Al aislar los registros en su propio módulo queda a la vista todo el estado del receptor: 2 + 4 + 3 + 8 = 17 bits. Cualquier cosa que no esté acá es combinacional y no guarda nada, lo que simplifica razonar sobre latches y sobre el reset.</p>
      <p>El reset es <b>sincrónico</b>: se evalúa solo en el flanco. Lleva el estado a 00 (IDLE), los contadores y el byte a 0. Se elige el reset sincrónico porque todo el sistema tiene un único dominio de reloj y el reset ya llega sincronizado.</p>`,
    inThisProject: `
      <p>Un solo <code>always @(posedge i_clk)</code>: con <code>i_reset</code>, ${L('o_state')} = <code>2'b00</code> (IDLE), ${L('o_s')} = 0, ${L('o_n')} = 0, ${L('o_byte')} = 0; si no, cada uno toma su <code>*_next</code>. Sus anchos dependen de los parámetros: <code>o_s</code> es <code>$clog2(N_TICKS)</code> = 4 bits, <code>o_n</code> es <code>$clog2(NB_DATA)</code> = 3 bits.</p>
      <p>Observación: <code>o_byte</code> se limpia con el reset pero <b>no</b> entre bytes; cada byte nuevo reemplaza los 8 bits por desplazamiento, así que no hace falta limpiarlo. <code>o_byte</code> conserva el último byte recibido hasta que llegue otro, y es la salida <code>o_dout</code> del receptor.</p>`,
    whyThisChoice: `
      <p><b>Registrar el byte aunque se desplace.</b> El byte completo se estabiliza recién al terminar los 8 desplazamientos; mientras tanto <code>o_dout</code> cambia. Es correcto porque el consumidor (el FIFO) solo lo captura cuando <code>rx_done = 1</code>, es decir cuando el byte ya está completo.</p>
      <p><b>Un solo bloque secuencial para los cuatro registros.</b> Permite un único chequeo de reset y evita inferir latches. Cuesta nada.</p>`,
  },
  refs: [{ label: 'o_state', sym: 'o_state' }, { label: 'o_byte', sym: 'o_byte' }],
  grid: [10, 5],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico.'),
    P('i_state_next', 'in', 2, 'l', 'FSM', 'Próximo estado.'),
    P('i_s_next', 'in', 4, 'l', 'COMB', 'Próximo <code>s</code>.'),
    P('i_n_next', 'in', 3, 'l', 'COMB', 'Próximo <code>n</code>.'),
    P('i_byte_next', 'in', 8, 'l', 'COMB', 'Próximo byte.'),
    P('o_state', 'out', 2, 'r', 'FSM', 'Estado actual.'),
    P('o_s', 'out', 4, 'r', 'COMB', 'Ticks dentro del bit.'),
    P('o_n', 'out', 3, 'r', 'COMB', 'Bits ya leídos.'),
    P('o_byte', 'out', 8, 'r', 'COMB y o_dout', 'Byte en construcción / recibido.'),
  ],
  parts: [
    { id: 'o_state', kind: 'reg', label: 'o_state [1:0]', width: 2, symbol: 'o_state', at: [3, 0], size: [3, 1], live: 'uart.rx.state', desc: '<p>Estado de la FSM. Reset: 00 = IDLE.</p>' },
    { id: 'o_s', kind: 'reg', label: 'o_s [3:0]', width: 4, symbol: 'o_s', at: [3, 1], size: [3, 1], live: 'uart.rx.s', desc: '<p>Contador de ticks en el bit actual (0..15).</p>' },
    { id: 'o_n', kind: 'reg', label: 'o_n [2:0]', width: 3, symbol: 'o_n', at: [3, 2], size: [3, 1], live: 'uart.rx.n', desc: '<p>Cantidad de bits de datos ya leídos (0..7).</p>' },
    { id: 'o_byte', kind: 'reg', label: 'o_byte [7:0]', width: 8, symbol: 'o_byte', at: [3, 3], size: [3, 1], live: 'uart.rx.byte', desc: '<p>Registro de desplazamiento con el byte recibido.</p>' },
  ],
  nets: [
    { id: 'n_clk', from: 'port:i_clk', to: 'o_state', name: 'i_clk', width: 1, desc: '<p>Reloj común a los cuatro registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'o_state', name: 'i_reset', width: 1, desc: '<p>Reset sincrónico común.</p>' },
    { id: 'n_i_state', from: 'port:i_state_next', to: 'o_state', name: 'i_state_next', width: 2, desc: '<p>Próximo estado desde la FSM.</p>' },
    { id: 'n_i_s', from: 'port:i_s_next', to: 'o_s', name: 'i_s_next', width: 4, desc: '<p>Próximo <code>s</code> desde COMB.</p>' },
    { id: 'n_i_n', from: 'port:i_n_next', to: 'o_n', name: 'i_n_next', width: 3, desc: '<p>Próximo <code>n</code> desde COMB.</p>' },
    { id: 'n_i_byte', from: 'port:i_byte_next', to: 'o_byte', name: 'i_byte_next', width: 8, desc: '<p>Próximo byte desde COMB.</p>' },
    { id: 'n_o_state', from: 'o_state', to: 'port:o_state', name: 'o_state', width: 2, live: 'uart.rx.state', desc: '<p>Estado hacia la FSM.</p>' },
    { id: 'n_o_s', from: 'o_s', to: 'port:o_s', name: 'o_s', width: 4, live: 'uart.rx.s', desc: '<p>Ticks hacia COMB.</p>' },
    { id: 'n_o_n', from: 'o_n', to: 'port:o_n', name: 'o_n', width: 3, live: 'uart.rx.n', desc: '<p>Bits hacia COMB.</p>' },
    { id: 'n_o_byte', from: 'o_byte', to: 'port:o_byte', name: 'o_byte', width: 8, live: 'uart.rx.byte', desc: '<p>Byte hacia COMB y hacia <code>o_dout</code>.</p>' },
  ],
};
