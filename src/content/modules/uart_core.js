import { githubUrl } from '../repo.js';

const F = 'uart/uart_core.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_core',
  module: 'uart_core',
  file: F,
  instance: 'u_uart',
  parent: 'top_riscv',
  blockIds: ['uart'],
  title: 'uart_core',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>La PC y la FPGA son dos dispositivos con relojes independientes; entre ellos hay un único cable por sentido. <b>UART</b> (Universal Asynchronous Receiver/Transmitter) es el acuerdo más simple para mandar bytes así: como no hay reloj compartido, ambos acuerdan <i>de antemano</i> la velocidad (baud rate) y el formato de la trama. Con 8N1 la línea está en 1 en reposo, un bit de start en 0 avisa que empieza un byte, siguen 8 bits de datos (el menos significativo primero) y un bit de stop en 1 cierra la trama: 10 tiempos de bit por byte.</p>
      <p>Como el receptor no tiene el reloj del emisor, tiene que reconstruir la temporización: detecta el flanco descendente del start y, a partir de ahí, toma muestras en el <b>centro de cada bit</b>, donde la señal es más estable. Para ubicar ese centro con precisión muestrea 16 veces más rápido que el baud rate (sobremuestreo). Eso lo hace un generador de baud rate que emite un pulso <code>tick</code> a 16&times; la velocidad.</p>
      <p>Una UART a 19200 baud entrega un byte cada ~520 &micro;s, mientras que el sistema corre a 50 MHz (20 ns por ciclo): el hardware que consume los bytes es unas 26 000 veces más rápido. La velocidad dispar y la llegada impredecible se absorben con <b>colas (FIFOs)</b>: el receptor deja el byte en una cola y quien lo consume lo saca cuando puede; en la otra dirección, quien quiere transmitir deja bytes en la cola de TX y el transmisor los saca a su ritmo. Sin cola, si la PC mandara un byte mientras la debug unit está ocupada, el byte se perdería.</p>
      <p>Una buena práctica de diseño es separar capas: la UART no sabe nada del procesador y la debug unit no sabe nada de bits seriales. La frontera entre ambas es una interfaz de <b>bytes con handshake</b>: <code>empty</code>/<code>read</code> del lado de recepción y <code>full</code>/<code>write</code> del lado de transmisión.</p>`,
    inThisProject: `
      <p>${L('uart_core')} instancia cinco módulos: ${L('BAUD_GEN')} (genera <code>tick</code>), ${L('RX')} (deserializa), ${L('RX_FIFO')} (cola de recepción), ${L('TX_FIFO')} (cola de transmisión) y ${L('TX')} (serializa). Los dos FIFOs son el mismo módulo <code>fifo</code> instanciado dos veces, con <code>PTR_LEN = 2</code> (4 entradas de 8 bits).</p>
      <p><b>Baud rate.</b> El top le pasa <code>CLK_FREQ = SYS_FREQ</code> = 50 MHz, no 100 MHz. Así <code>MODULUS = 50 000 000 / (19 200 &times; 16) = 162</code> (el README de <code>uart/</code> dice 325, que es el valor para 100 MHz; el RTL real usa 162).</p>
      <p><b>Recepción.</b> Cuando <code>RX</code> termina un byte válido emite <code>rx_done</code>, que escribe <code>rx_data_out</code> en <code>RX_FIFO</code>. La debug unit mira <code>o_rx_empty</code>, y con <code>i_read_uart</code> saca el byte de la cabeza (<code>o_data_to_read</code>).</p>
      <p><b>Transmisión.</b> La debug unit escribe con <code>i_write_uart</code>/<code>i_data_to_write</code> en <code>TX_FIFO</code>. El FIFO <b>se vacía solo</b>: <code>tx_not_empty = ~tx_empty</code> alimenta <code>i_tx_ready</code> de <code>TX</code>, y cuando <code>TX</code> termina un byte emite <code>tx_done</code>, que a su vez es el <code>i_read_fifo</code> del FIFO (hace el pop). Así los bytes encolados salen uno detrás de otro, sin hueco entre tramas. <code>o_tx_full</code> avisa a la debug unit cuándo debe esperar.</p>
      <p>Dato: <code>o_rx_full</code> existe en el puerto pero el top lo deja sin conectar; no se usa, y no hay señal de overrun ni de error de framing.</p>`,
    whyThisChoice: `
      <p><b>FIFOs de 4 entradas.</b> Con un host que respeta el protocolo (un comando y espera la respuesta) un solo byte alcanza; los FIFOs dan margen si llegan varios bytes seguidos (por ejemplo los datos de una carga: 4n bytes, a razón de uno cada 520 &micro;s, que la debug unit consume en un ciclo). Más profundidad costaría más lógica sin ganancia: durante la carga la FSM tarda microsegundos entre bytes. Sin FIFO la debug unit tendría que leer cada byte en la ventana exacta en que <code>rx_done</code> pulsa un ciclo.</p>
      <p><b>FIFO autodrenante en TX.</b> Alternativa: que la debug unit mande un byte, espere <code>tx_done</code> y recién mande el siguiente. Eso acopla la FSM a la UART. Con el FIFO, la FSM simplemente escribe mientras no esté lleno.</p>
      <p><b>19200 baud.</b> Es lento (el dump de ~346 bytes tarda ~180 ms) pero tolera cualquier cable/convertidor y deja margen de error de baud. Subir a 115200 o más reduce el tiempo, a costa de un divisor más chico (peor resolución del baud: con 50 MHz y 115200&times;16 el divisor sería 27, con ~0,5 % de error similar) y menos margen. El error actual: 50 MHz/(162&times;16) = 19 290 baud, +0,47 %.</p>
      <p><b>Sin paridad ni detección de errores.</b> Es un canal de depuración corto; se acepta la pérdida silenciosa a cambio de menos lógica.</p>`,
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
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del sistema.'),
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
      desc: '<p>Contador módulo 162 que emite <code>tick</code> (un ciclo de reloj) cada 162 ciclos = 16 veces por bit. Lo comparten RX y TX.</p>' },
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
