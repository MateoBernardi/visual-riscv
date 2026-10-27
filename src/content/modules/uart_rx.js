import { githubUrl } from '../repo.js';

const F = 'uart/uart_rx.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_rx',
  module: 'uart_rx',
  file: F,
  instance: 'RX',
  parent: 'uart_core',
  blockIds: [],
  title: 'uart_rx (receptor)',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Recibir un byte serie es reconstruir una palabra de 8 bits a partir de una señal que cambia en el tiempo, sin tener el reloj del emisor. Se necesitan tres cosas: <b>saber cuándo empieza</b> (el flanco de bajada del bit de start), <b>saber cuándo mirar</b> (el centro de cada bit, usando el contador de ticks a 16&times; el baud rate) y <b>dónde guardar</b> lo que se va viendo (un registro de desplazamiento que va acomodando los bits a medida que llegan).</p>
      <p>Como los bits llegan menos significativo primero, el truco es desplazar hacia la derecha e insertar cada bit nuevo por la izquierda: después de 8 desplazamientos, el primero que llegó (LSB) quedó en la posición 0 y el último (MSB) en la 7. No hace falta contar posiciones para ubicarlo; solo contar cuántos bits se leyeron.</p>
      <p>Hay entonces dos contadores: uno de <b>ticks dentro de un bit</b> (<code>s</code>, 0 a 15) y uno de <b>bits dentro del byte</b> (<code>n</code>, 0 a 7). Y una pequeña máquina de estados (IDLE, START, DATA, STOP) que sabe qué tipo de bit se está recibiendo y cuándo avanzar. Por último, el receptor valida la trama: si el bit de stop no vale 1, el byte es basura (la línea estaba desalineada) y se descarta.</p>`,
    inThisProject: `
      <p>Siguiendo el patrón del proyecto, <code>uart_rx</code> es estructural y se parte en tres módulos: ${L('FSM')} (estado y señales de control, combinacional), ${L('COMB')} (próximos valores de contadores y byte, y banderas) y ${L('REGS')} (estado, <code>s</code>, <code>n</code> y <code>received_byte</code>). La salida ${L('o_dout')} es directamente el registro <code>received_byte</code>, y ${L('o_rx_done')} es un pulso combinacional de la FSM.</p>
      <p><b>Cronología de un byte</b> (<code>N_TICKS = 16</code>, <code>NB_DATA = 8</code>): en IDLE, cuando <code>i_rx = 0</code> pasa a START y limpia <code>s</code>; en START cuenta ticks hasta <code>s == 7</code> (mitad del bit) y entonces pasa a DATA, limpiando <code>s</code> y <code>n</code>; en DATA, cada 16 ticks (<code>s == 15</code>) hace <code>shift</code> de <code>i_rx</code> en <code>received_byte</code> y suma <code>n</code>; con <code>n == 7</code> pasa a STOP; en STOP, a los 16 ticks, vuelve a IDLE y emite <code>o_rx_done = i_rx</code> (solo si el stop vale 1).</p>
      <p><b>Detalles del RTL.</b> En START no se vuelve a comprobar que la línea siga en 0 en el punto medio: un pulso de ruido de menos de medio bit que baje la línea se interpretaría como un start y produciría un byte basura (que el stop bit validaría o no). Tampoco hay señal de error de framing: un byte con stop incorrecto se descarta sin avisar. Y el receptor vuelve a IDLE a mitad del bit de stop, lo que le permite detectar el start siguiente sin perder el flanco.</p>`,
    whyThisChoice: `
      <p><b>FSM + contadores vs. un registro de desplazamiento con bit centinela.</b> Una alternativa es cargar un 1 en una posición y detectar cuándo llega al final del registro para saber que se leyó todo. Evita el contador <code>n</code> pero hace menos legible la FSM.</p>
      <p><b>Muestrear una sola vez en el centro vs. votar 3 muestras.</b> Algunas UART (como la 16550) toman 3 muestras alrededor del centro y votan por mayoría para filtrar ruido. Acá se usa una única muestra por bit: menos lógica, suficiente para un cable USB corto.</p>
      <p><b>Reloj del sistema + tick vs. reloj dedicado de 16&times;.</b> Usar un <code>tick</code> habilitando una FSM sincrónica (en lugar de crear otro reloj) mantiene un solo dominio de reloj y permite que Vivado haga el análisis de timing completo. Es la técnica estándar en FPGAs.</p>
      <p><b>Sin verificación en START.</b> Chequear que <code>i_rx</code> siga en 0 en <code>s == 7</code> (que sí hacen los receptores completos) costaría una condición más; ya hay un filtro parcial: el stop bit debe ser 1.</p>`,
  },
  refs: [
    { label: 'FSM', sym: 'FSM' },
    { label: 'COMB', sym: 'COMB' },
    { label: 'REGS', sym: 'REGS' },
    { label: 'o_dout', sym: 'o_dout' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico (lo usa REGS).'),
    P('i_rx', 'in', 1, 'l', 'rx_sync (línea serie sincronizada)', 'Línea serie. Reposo = 1.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Pulso a 16&times; el baud rate.'),
    P('o_rx_done', 'out', 1, 'r', 'RX_FIFO (i_write_fifo)', 'Pulso de un ciclo: llegó un byte válido.'),
    P('o_dout', 'out', 8, 'r', 'RX_FIFO (i_data_to_write)', 'Byte recibido.'),
  ],
  parts: [
    { id: 'FSM', kind: 'submodule', label: 'FSM (uart_rx_fsm)', width: 2, symbol: 'FSM', at: [4, 0], size: [4, 4], drill: 'uart_rx_fsm', live: 'uart.rx.state',
      desc: '<p>Máquina de estados IDLE / START / DATA / STOP. Decide cuándo limpiar o incrementar los contadores, cuándo desplazar un bit y cuándo avisar <code>o_rx_done</code>.</p>' },
    { id: 'COMB', kind: 'submodule', label: 'COMB (uart_rx_comb)', width: 1, symbol: 'COMB', at: [4, 5], size: [4, 4], drill: 'uart_rx_comb',
      desc: '<p>Próximos valores de <code>s</code>, <code>n</code> y <code>received_byte</code> y las banderas <code>s_half</code>, <code>s_last</code>, <code>n_last</code>.</p>' },
    { id: 'REGS', kind: 'submodule', label: 'REGS (uart_rx_regs)', width: 1, symbol: 'REGS', at: [10, 2], size: [3, 5], drill: 'uart_rx_regs', live: 'uart.rx.state',
      desc: '<p>Registros: estado (2 bits), <code>s</code> (4 bits), <code>n</code> (3 bits) y <code>received_byte</code> (8 bits).</p>' },
  ],
  nets: [
    { id: 'n_rx_fsm', from: 'port:i_rx', to: 'FSM', name: 'i_rx', width: 1, desc: '<p>La FSM la mira para detectar el start (IDLE) y para validar el stop (<code>o_rx_done = i_rx</code>).</p>' },
    { id: 'n_rx_comb', from: 'port:i_rx', to: 'COMB', name: 'i_rx', width: 1, desc: '<p>COMB inserta este bit por la izquierda al desplazar el byte.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'FSM', name: 'i_tick', width: 1, desc: '<p>Solo se cuenta o se avanza de estado cuando <code>i_tick = 1</code>.</p>' },
    { id: 'n_clk', from: 'port:i_clk', to: 'REGS', name: 'i_clk', width: 1, desc: '<p>Reloj de los registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'REGS', name: 'i_reset', width: 1, desc: '<p>Reset: IDLE, contadores y byte en 0.</p>' },
    { id: 'n_state', from: 'REGS', to: 'FSM', name: 'state', width: 2, live: 'uart.rx.state', desc: '<p>Estado actual, de REGS a la FSM.</p>' },
    { id: 'n_state_next', from: 'FSM', to: 'REGS', name: 'state_next', width: 2, desc: '<p>Estado siguiente.</p>' },
    { id: 'n_s', from: 'REGS', to: 'COMB', name: 's', width: 4, live: 'uart.rx.s', desc: '<p>Contador de ticks dentro del bit (0..15).</p>' },
    { id: 'n_n', from: 'REGS', to: 'COMB', name: 'n', width: 3, live: 'uart.rx.n', desc: '<p>Contador de bits del byte (0..7).</p>' },
    { id: 'n_byte', from: 'REGS', to: 'COMB', name: 'received_byte', width: 8, live: 'uart.rx.byte', desc: '<p>Byte en construcción.</p>' },
    { id: 'n_s_next', from: 'COMB', to: 'REGS', name: 's_next', width: 4, desc: '<p>Próximo valor de <code>s</code>.</p>' },
    { id: 'n_n_next', from: 'COMB', to: 'REGS', name: 'n_next', width: 3, desc: '<p>Próximo valor de <code>n</code>.</p>' },
    { id: 'n_byte_next', from: 'COMB', to: 'REGS', name: 'received_byte_next', width: 8, desc: '<p>Próximo valor del byte (desplazado o igual).</p>' },
    { id: 'n_s_ctl', from: 'FSM', to: 'COMB', name: 's_clear', width: 1, desc: '<p>Grupo de control del contador de ticks: <code>s_clear</code>, <code>s_inc</code>.</p>' },
    { id: 'n_n_ctl', from: 'FSM', to: 'COMB', name: 'n_clear', width: 1, desc: '<p>Grupo de control del contador de bits: <code>n_clear</code>, <code>n_inc</code>.</p>' },
    { id: 'n_shift', from: 'FSM', to: 'COMB', name: 'shift', width: 1, desc: '<p>Desplazar <code>i_rx</code> dentro del byte (una vez por bit de datos).</p>' },
    { id: 'n_flags_half', from: 'COMB', to: 'FSM', name: 's_half', width: 1, desc: '<p><code>s == 7</code>: mitad del bit de start.</p>' },
    { id: 'n_flags_last', from: 'COMB', to: 'FSM', name: 's_last', width: 1, desc: '<p><code>s == 15</code>: bit completo.</p>' },
    { id: 'n_flags_nlast', from: 'COMB', to: 'FSM', name: 'n_last', width: 1, desc: '<p><code>n == 7</code>: último bit de datos.</p>' },
    { id: 'n_done', from: 'FSM', to: 'port:o_rx_done', name: 'o_rx_done', width: 1, desc: '<p>Pulso: byte completo con stop bit válido.</p>' },
    { id: 'n_dout', from: 'REGS', to: 'port:o_dout', name: 'o_dout', width: 8, live: 'uart.rx.byte', desc: '<p><code>assign o_dout = received_byte</code>.</p>' },
  ],
};
