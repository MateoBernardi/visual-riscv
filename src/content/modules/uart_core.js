import { githubUrl } from '../repo.js';

const F = 'uart/uart_core.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_core',
  module: 'uart_core',
  file: F,
  instance: 'u_uart',
  parent: null,
  within: 'top_riscv',
  instancePath: 'u_uart',
  blockIds: ['uart'],
  title: 'uart_core',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>PC y FPGA tienen relojes independientes y un cable por sentido. Con UART 8N1 acuerdan de antemano la velocidad: reposo en 1, un start en 0, 8 bits de datos (el menos significativo primero) y un stop en 1. El receptor reconstruye el tiempo muestreando 16 veces por bit para caer en el centro. Las FIFOs absorben la diferencia de ritmo entre un byte cada 520 &micro;s y una FSM que lo consume en un ciclo.</p>`,
    inThisProject: `
      <ul>
        <li>Cinco módulos: ${L('BAUD_GEN')}, ${L('RX')}, ${L('RX_FIFO')}, ${L('TX_FIFO')} y ${L('TX')}.</li>
        <li>RX llega ya sincronizada por un <code>sync_2ff</code> del top.</li>
        <li>La TX_FIFO se vacía sola: <code>tx_done</code> hace el pop, así los bytes salen uno detrás de otro.</li>
        <li><code>o_rx_full</code> queda sin conectar: no hay aviso de overrun ni de error de framing.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Interfaz de bytes con handshake</b> (<code>empty</code>/<code>read</code>, <code>full</code>/<code>write</code>): la UART no sabe del CPU y la debug unit no sabe de bits.</p>
      <p><b>TX autodrenante</b>: la FSM escribe mientras no esté llena, sin esperar cada <code>tx_done</code>.</p>
      <p><b>19200 baud</b>: es lento (el volcado tarda &asymp; 190 ms), pero el divisor es grande y el error queda en 0,38 %. A 115200 llegaría al 3,7 %, cerca del límite de una UART. Sin paridad: es un canal de depuración corto.</p>`,
  },
  refs: [
    { label: 'BAUD_GEN', sym: 'BAUD_GEN' },
    { label: 'RX', sym: 'RX' },
    { label: 'RX_FIFO', sym: 'RX_FIFO' },
    { label: 'TX_FIFO', sym: 'TX_FIFO' },
    { label: 'TX', sym: 'TX' },
    { label: 'tx_not_empty', sym: 'tx_not_empty' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico.'),
    P('i_rx', 'in', 1, 'l', 'sync_2ff (rx_sync) &larr; pin FPGA C4', 'Línea RX ya sincronizada con <code>i_clk</code>.'),
    P('o_tx', 'out', 1, 'l', 'pin FPGA D4 (UART_RXD_OUT)', 'Línea TX hacia la PC. Registrada, en reposo vale 1.'),
    P('i_read_uart', 'in', 1, 'r', 'debug', 'Pop del FIFO de RX.'),
    P('i_write_uart', 'in', 1, 'r', 'debug', 'Push al FIFO de TX.'),
    P('i_data_to_write', 'in', 8, 'r', 'debug', 'Byte a encolar en TX.'),
    P('o_tx_full', 'out', 1, 'r', 'debug', 'FIFO de TX lleno.'),
    P('o_rx_empty', 'out', 1, 'r', 'debug', 'FIFO de RX vacío.'),
    P('o_rx_full', 'out', 1, 'r', 'sin conectar en el top', 'FIFO de RX lleno (no se usa).'),
    P('o_data_to_read', 'out', 8, 'r', 'debug', 'Byte en la cabeza del FIFO de RX.'),
  ],
  parts: [
    { id: 'BAUD_GEN', kind: 'submodule', label: 'BAUD_GEN', width: 1, symbol: 'BAUD_GEN', at: [5, 0], size: [3, 1], drill: 'baud_rate_gen',
      desc: '<p>Contador módulo 227 que emite <code>tick</code> (un ciclo de reloj) cada 227 ciclos = 16 veces por bit. Lo comparten RX y TX.</p>' },
    { id: 'RX', kind: 'submodule', label: 'RX (uart_rx)', width: 1, symbol: 'RX', at: [1, 2], size: [3, 2], drill: 'uart_rx', live: 'uart.rx.state',
      desc: '<p>Receptor: detecta el start, toma 8 muestras en el centro de cada bit y entrega el byte en <code>rx_data_out</code> con un pulso <code>rx_done</code>.</p>' },
    { id: 'RX_FIFO', kind: 'submodule', label: 'RX_FIFO (fifo)', width: 8, symbol: 'RX_FIFO', at: [6, 2], size: [3, 2], drill: 'fifo',
      desc: '<p>Cola de 4 bytes entre el receptor y la debug unit. Escribe con <code>rx_done</code>, lee con <code>i_read_uart</code>.</p>' },
    { id: 'tx_not_empty', kind: 'logic', label: '~tx_empty', width: 1, symbol: 'tx_not_empty', at: [5, 6], size: [1, 1],
      desc: '<p><code>assign tx_not_empty = ~tx_empty</code>: "hay un byte para enviar". Es el <code>i_tx_ready</code> del transmisor.</p>' },
    { id: 'TX', kind: 'submodule', label: 'TX (uart_tx)', width: 1, symbol: 'TX', at: [1, 6], size: [3, 2], drill: 'uart_tx', live: 'uart.tx.state',
      desc: '<p>Transmisor: toma el byte de la cabeza de <code>TX_FIFO</code>, lo serializa (start, 8 bits LSB primero, stop) y avisa con <code>tx_done</code>.</p>' },
    { id: 'TX_FIFO', kind: 'submodule', label: 'TX_FIFO (fifo)', width: 8, symbol: 'TX_FIFO', at: [7, 6], size: [3, 2], drill: 'fifo',
      desc: '<p>Cola de 4 bytes entre la debug unit y el transmisor. Escribe con <code>i_write_uart</code>; hace pop con <code>tx_done</code>.</p>' },
  ],
  nets: [
    { id: 'n_tick_rx', from: 'BAUD_GEN', to: 'RX', name: 'tick', width: 1, desc: '<p>Pulso a 16&times; el baud rate: da la unidad de tiempo con la que RX cuenta medio bit (8 ticks) y bit completo (16 ticks).</p>' },
    { id: 'n_tick_tx', from: 'BAUD_GEN', to: 'TX', name: 'tick', width: 1, desc: '<p>El mismo pulso, para que TX mida 16 ticks por bit.</p>' },
    { id: 'n_i_rx', from: 'port:i_rx', to: 'RX', name: 'i_rx', width: 1, desc: '<p>Línea serie sincronizada. En reposo 1; el flanco descendente anuncia un start.</p>' },
    { id: 'n_rx_done', from: 'RX', to: 'RX_FIFO', name: 'rx_done', width: 1, desc: '<p>Pulso de un ciclo: llegó un byte con stop bit válido. Es el <code>i_write_fifo</code> del FIFO.</p>' },
    { id: 'n_rx_data_out', from: 'RX', to: 'RX_FIFO', name: 'rx_data_out', width: 8, live: 'uart.rx.byte', desc: '<p>El byte recibido (registro del receptor), que el FIFO guarda cuando <code>rx_done = 1</code>.</p>' },
    { id: 'n_read', from: 'port:i_read_uart', to: 'RX_FIFO', name: 'i_read_uart', width: 1, desc: '<p>De: debug unit. Para: sacar el byte de la cabeza del FIFO.</p>' },
    { id: 'n_rx_empty', from: 'RX_FIFO', to: 'port:o_rx_empty', name: 'o_rx_empty', width: 1, desc: '<p>Flag registrado. La debug unit solo lee con <code>~o_rx_empty</code>.</p>' },
    { id: 'n_rx_full', from: 'RX_FIFO', to: 'port:o_rx_full', name: 'o_rx_full', width: 1, desc: '<p>Flag de lleno (4 bytes sin leer). No conectado en el top.</p>' },
    { id: 'n_data_read', from: 'RX_FIFO', to: 'port:o_data_to_read', name: 'o_data_to_read', width: 8, desc: '<p>El byte más viejo (lectura asincrónica de la posición <code>read_ptr</code>): disponible sin esperar un ciclo.</p>' },
    { id: 'n_write', from: 'port:i_write_uart', to: 'TX_FIFO', name: 'i_write_uart', width: 1, desc: '<p>De: debug unit. Para: encolar <code>i_data_to_write</code>.</p>' },
    { id: 'n_data_write', from: 'port:i_data_to_write', to: 'TX_FIFO', name: 'i_data_to_write', width: 8, desc: '<p>Byte a transmitir.</p>' },
    { id: 'n_tx_full', from: 'TX_FIFO', to: 'port:o_tx_full', name: 'o_tx_full', width: 1, desc: '<p>Contrapresión hacia la debug unit.</p>' },
    { id: 'n_tx_empty', from: 'TX_FIFO', to: 'tx_not_empty', name: 'tx_empty', width: 1, desc: '<p>Flag de vacío del FIFO de TX.</p>' },
    { id: 'n_tx_ready', from: 'tx_not_empty', to: 'TX', name: 'tx_not_empty', width: 1, desc: '<p>Hay un byte: TX puede arrancar. Es la razón por la que no hace falta que nadie "dispare" el envío.</p>' },
    { id: 'n_tx_fifo_out', from: 'TX_FIFO', to: 'TX', name: 'tx_fifo_out', width: 8, desc: '<p>Byte de la cabeza del FIFO, que TX copia a su registro al iniciar.</p>' },
    { id: 'n_tx_done', from: 'TX', to: 'TX_FIFO', name: 'tx_done', width: 1, desc: '<p>Pulso al terminar el stop bit. Es el <code>i_read_fifo</code> del FIFO: descarta el byte ya enviado. Cierra el lazo autodrenante.</p>' },
    { id: 'n_o_tx', from: 'TX', to: 'port:o_tx', name: 'o_tx', width: 1, live: 'uart.tx.tx', desc: '<p>Línea de salida (registrada) hacia el pin D4.</p>' },
  ],
};
