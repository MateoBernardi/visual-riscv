import { githubUrl } from '../repo.js';

const F = 'uart/uart_tx.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'uart_tx',
  module: 'uart_tx',
  file: F,
  instance: 'TX',
  parent: 'uart_core',
  blockIds: [],
  title: 'uart_tx (transmisor)',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Transmitir es el problema inverso a recibir, y más simple: el emisor <i>manda</i> el reloj de la trama, así que sabe exactamente cuándo cambiar la línea. Hay que sacar, durante 16 ticks cada uno, un bit de start (0), los 8 bits del byte (LSB primero) y un bit de stop (1), y volver a reposo (1). Para eso se carga el byte en un registro de desplazamiento y se saca el bit 0; después de cada bit, se desplaza a la derecha para que el siguiente quede en la posición 0.</p>
      <p>La línea tiene que ser <b>limpia</b>: si la salida cambiara combinacionalmente al ritmo de una FSM, podría tener pequeños glitches justo cuando el receptor la mira. La solución estándar es pasar la salida por un flip-flop: el valor de la línea se calcula en un ciclo (<code>tx_next</code>) y se registra, de modo que el pin cambia solo en los flancos de reloj y se mantiene estable el resto del ciclo.</p>
      <p>Como en el receptor, hacen falta un contador de ticks (cuándo termina cada bit), un contador de bits (cuándo termina el byte) y una máquina de estados con la fase de la trama. Además, el transmisor tiene que coordinarse con quien le da los bytes: necesita una señal "tengo un byte listo" (<code>i_tx_ready</code>) y avisar "terminé de enviarlo" (<code>o_tx_done</code>) para que se pase al siguiente.</p>`,
    inThisProject: `
      <p>Misma estructura que el receptor: ${L('FSM')}, ${L('COMB')} y ${L('REGS')}. La salida ${L('o_tx')} es el registro <code>tx</code> (<code>assign o_tx = tx</code>), que reinicia en 1 (reposo). ${L('o_tx_done')} es un pulso combinacional que sale de la FSM.</p>
      <p><b>Handshake con el FIFO.</b> Desde <code>uart_core</code>: <code>i_tx_ready = ~tx_empty</code> del <code>TX_FIFO</code>, <code>i_din</code> es la cabeza del FIFO y <code>o_tx_done</code> es el pop. En IDLE, apenas <code>i_tx_ready = 1</code>, la FSM carga <code>i_din</code> en <code>send_byte</code> (<code>o_load</code>) y pasa a START sin esperar un tick; el byte permanece en el FIFO hasta <code>o_tx_done</code>. Por eso el FIFO queda "ocupado" durante la transmisión y <code>tx_full</code> avisa a la debug unit con anticipación.</p>
      <p><b>Cronología.</b> START: línea = 0 durante 16 ticks. DATA: ocho bits, 16 ticks cada uno, con <code>tx_data = 1</code> (la línea toma <code>send_byte[0]</code>) y desplazando el byte a la derecha al final de cada bit. STOP: línea = 1 durante 16 ticks; al final, <code>o_tx_done = 1</code> y vuelve a IDLE. Si el FIFO ya tiene otro byte, la siguiente trama arranca inmediatamente: no hay hueco entre bytes (el stop de un byte es seguido sin espera por el start del siguiente).</p>
      <p><b>Detalle de fase.</b> Como el estado START arranca en el ciclo en que se ve <code>i_tx_ready</code> y no en un tick, la duración efectiva del primer bit es entre 15 y 16 períodos de tick más una fracción: una variación de a lo sumo 1/16 de bit que el receptor absorbe sin problema. Además, la línea refleja el estado con un ciclo de retardo, porque <code>o_tx</code> está registrado.</p>`,
    whyThisChoice: `
      <p><b>Registrar la salida.</b> Cuesta un flip-flop y 1 ciclo de latencia, pero garantiza un pin sin glitches y simplifica el análisis de timing del pin de salida.</p>
      <p><b>Cargar el byte al comenzar vs. leer el FIFO directamente.</b> Se copia <code>i_din</code> a <code>send_byte</code> porque el byte se va a desplazar; la cabeza del FIFO no debe modificarse hasta el <code>o_tx_done</code>. La alternativa, un mux de 8:1 indexado por <code>n</code> sobre <code>i_din</code>, ahorraría el registro de 8 bits pero obliga a mantener estable la cabeza durante toda la transmisión (lo cual sí ocurre acá), con un mux de 8 entradas en el camino hacia el pin.</p>
      <p><b>Sin paridad ni control de flujo.</b> RTS/CTS o XON/XOFF evitarían que la PC sature al transmisor, pero acá el que transmite más es la FPGA (el dump), y es la propia debug unit la que se frena con <code>tx_full</code>. Del lado de la PC, el sistema operativo siempre acepta bytes.</p>`,
  },
  refs: [
    { label: 'FSM', sym: 'FSM' },
    { label: 'COMB', sym: 'COMB' },
    { label: 'REGS', sym: 'REGS' },
    { label: 'o_tx', sym: 'o_tx' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico; la línea vuelve a 1.'),
    P('i_tx_ready', 'in', 1, 'l', 'TX_FIFO (~tx_empty)', 'Hay un byte para enviar.'),
    P('i_tick', 'in', 1, 'l', 'BAUD_GEN', 'Pulso a 16&times; el baud rate.'),
    P('i_din', 'in', 8, 'l', 'TX_FIFO (o_data_to_read)', 'Byte de la cabeza del FIFO.'),
    P('o_tx_done', 'out', 1, 'r', 'TX_FIFO (i_read_fifo)', 'Pulso: se terminó de enviar el byte.'),
    P('o_tx', 'out', 1, 'r', 'pin FPGA D4 (UART_RXD_OUT)', 'Línea serie hacia la PC (registrada).'),
  ],
  parts: [
    { id: 'FSM', kind: 'submodule', label: 'FSM (uart_tx_fsm)', width: 2, symbol: 'FSM', at: [4, 0], size: [4, 4], drill: 'uart_tx_fsm', live: 'uart.tx.state',
      desc: '<p>Máquina de estados IDLE / START / DATA / STOP; decide el nivel de la línea (<code>tx_level</code>, <code>tx_data</code>), cuándo cargar y desplazar el byte y cuándo avisar <code>tx_done</code>.</p>' },
    { id: 'COMB', kind: 'submodule', label: 'COMB (uart_tx_comb)', width: 1, symbol: 'COMB', at: [4, 5], size: [4, 4], drill: 'uart_tx_comb',
      desc: '<p>Próximos <code>s</code>, <code>n</code>, <code>send_byte</code> y <code>tx</code>, más las banderas <code>s_last</code> y <code>n_last</code>.</p>' },
    { id: 'REGS', kind: 'submodule', label: 'REGS (uart_tx_regs)', width: 1, symbol: 'REGS', at: [10, 2], size: [3, 5], drill: 'uart_tx_regs', live: 'uart.tx.state',
      desc: '<p>Registros: estado, <code>s</code>, <code>n</code>, <code>send_byte</code> y <code>tx</code> (la línea).</p>' },
  ],
  nets: [
    { id: 'n_ready', from: 'port:i_tx_ready', to: 'FSM', name: 'i_tx_ready', width: 1, desc: '<p>Si vale 1 en IDLE, empieza la transmisión.</p>' },
    { id: 'n_tick', from: 'port:i_tick', to: 'FSM', name: 'i_tick', width: 1, desc: '<p>Las cuentas sólo avanzan con tick.</p>' },
    { id: 'n_din', from: 'port:i_din', to: 'COMB', name: 'i_din', width: 8, desc: '<p>Byte a copiar en <code>send_byte</code> cuando <code>load = 1</code>.</p>' },
    { id: 'n_clk', from: 'port:i_clk', to: 'REGS', name: 'i_clk', width: 1, desc: '<p>Reloj de los registros.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'REGS', name: 'i_reset', width: 1, desc: '<p>Reset: IDLE y línea en 1.</p>' },
    { id: 'n_state', from: 'REGS', to: 'FSM', name: 'state', width: 2, live: 'uart.tx.state', desc: '<p>Estado actual.</p>' },
    { id: 'n_state_next', from: 'FSM', to: 'REGS', name: 'state_next', width: 2, desc: '<p>Próximo estado.</p>' },
    { id: 'n_s', from: 'REGS', to: 'COMB', name: 's', width: 4, live: 'uart.tx.s', desc: '<p>Ticks dentro del bit.</p>' },
    { id: 'n_n', from: 'REGS', to: 'COMB', name: 'n', width: 3, live: 'uart.tx.n', desc: '<p>Bits ya enviados.</p>' },
    { id: 'n_byte', from: 'REGS', to: 'COMB', name: 'send_byte', width: 8, live: 'uart.tx.byte', desc: '<p>Byte en transmisión (se desplaza a la derecha).</p>' },
    { id: 'n_s_next', from: 'COMB', to: 'REGS', name: 's_next', width: 4, desc: '<p>Próximo <code>s</code>.</p>' },
    { id: 'n_n_next', from: 'COMB', to: 'REGS', name: 'n_next', width: 3, desc: '<p>Próximo <code>n</code>.</p>' },
    { id: 'n_byte_next', from: 'COMB', to: 'REGS', name: 'send_byte_next', width: 8, desc: '<p>Próximo byte.</p>' },
    { id: 'n_tx_next', from: 'COMB', to: 'REGS', name: 'tx_next', width: 1, desc: '<p>Nivel que tomará la línea en el próximo flanco.</p>' },
    { id: 'n_s_ctl', from: 'FSM', to: 'COMB', name: 's_clear', width: 1, desc: '<p>Control del contador de ticks (<code>s_clear</code>, <code>s_inc</code>).</p>' },
    { id: 'n_n_ctl', from: 'FSM', to: 'COMB', name: 'n_clear', width: 1, desc: '<p>Control del contador de bits (<code>n_clear</code>, <code>n_inc</code>).</p>' },
    { id: 'n_load', from: 'FSM', to: 'COMB', name: 'load', width: 1, desc: '<p>Cargar <code>i_din</code> en <code>send_byte</code> (en IDLE).</p>' },
    { id: 'n_shift', from: 'FSM', to: 'COMB', name: 'shift', width: 1, desc: '<p>Desplazar <code>send_byte</code> a la derecha (al fin de cada bit de datos).</p>' },
    { id: 'n_tx_data', from: 'FSM', to: 'COMB', name: 'tx_data', width: 1, desc: '<p>1: la línea toma el bit de datos actual.</p>' },
    { id: 'n_tx_level', from: 'FSM', to: 'COMB', name: 'tx_level', width: 1, desc: '<p>Nivel de la línea cuando <code>tx_data = 0</code> (0 en START, 1 en IDLE/STOP).</p>' },
    { id: 'n_s_last', from: 'COMB', to: 'FSM', name: 's_last', width: 1, desc: '<p><code>s == 15</code>.</p>' },
    { id: 'n_n_last', from: 'COMB', to: 'FSM', name: 'n_last', width: 1, desc: '<p><code>n == 7</code>.</p>' },
    { id: 'n_done', from: 'FSM', to: 'port:o_tx_done', name: 'o_tx_done', width: 1, desc: '<p>Pulso al final del stop bit: el FIFO descarta el byte.</p>' },
    { id: 'n_tx', from: 'REGS', to: 'port:o_tx', name: 'o_tx', width: 1, live: 'uart.tx.tx', desc: '<p><code>assign o_tx = tx</code>: sale del flip-flop.</p>' },
  ],
};
