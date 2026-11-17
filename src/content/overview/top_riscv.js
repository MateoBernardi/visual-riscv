import { githubUrl } from '../repo.js';

const F = 'top/top_riscv.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'top_riscv',
  module: 'top_riscv',
  file: F,
  instance: null,
  parent: null,
  blockIds: [],
  title: 'top_riscv · módulo top (FPGA)',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Un CPU solo no sirve: necesita reloj, reset y una forma de cargarle un programa y mirar qué hizo. El top es estructural: instancia módulos y los conecta a los pines de la placa. Para pausar el CPU no se gatea el reloj (glitches, skew): el reloj corre siempre y cada flip-flop tiene un <i>enable</i>.</p>`,
    inThisProject: `
      <ul>
        <li>Cadena ${L('u_uart')} &harr; ${L('u_debug')} &harr; ${L('u_cpu')}: la debug unit maneja <code>cpu_enable</code> y <code>cpu_reset</code>, escribe la imem y lee el bus de debug.</li>
        <li>El ${L('u_mmcm', 'MMCM')} pasa los 100 MHz de la placa a 70 MHz; hasta que engancha, todo queda en reset.</li>
        <li>LD0..LD2: habilitado, reset, detenido. LD10..LD15: forwarding, stall, flush, excepción. Con SW0 el display muestra la última escritura en un registro.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>70 MHz</b> es el paso de 10 MHz más alto que cierra timing en el peor caso; a 80 MHz el camino forwarding &rarr; ALU &rarr; decisión del salto ya no entra.</p>
      <p><b>Un solo dominio de reloj</b>: lo único asíncrono (RX, botón, switch) pasa por <code>sync_2ff</code>, sin FIFOs asíncronas.</p>
      <p><b>El CPU tiene su propio reset</b> (<code>cpu_reset</code>), así <code>X</code> o una carga lo reinician sin cortar la UART. Y el dump trae un <code>BUILD_ID</code> para que la prueba en la placa sepa qué bitstream está midiendo.</p>`,
  },
  refs: [
    { label: 'MMCM', sym: 'u_mmcm' },
    { label: 'SYS_FREQ', sym: 'SYS_FREQ' },
    { label: 'Reset', sym: 'u_reset' },
    { label: 'UART', sym: 'u_uart' },
    { label: 'Debug unit', sym: 'u_debug' },
    { label: 'CPU', sym: 'u_cpu' },
    { label: 'LEDs', sym: 'o_led' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'l', 'pin FPGA E3 (oscilador de 100 MHz)', 'Reloj de la placa. Entra solo al MMCM (no al resto del diseño).'),
    P('i_reset', 'in', 1, 'l', 'pin FPGA N17 (botón BTNC, activo en alto)', 'Botón de reset. Es asincrónico: lo sincroniza <code>reset_gen</code>.'),
    P('i_rx', 'in', 1, 'l', 'pin FPGA C4 (UART_TXD_IN: el TX de la PC)', 'Línea serie que llega de la PC. En reposo vale 1.'),
    P('o_tx', 'out', 1, 'r', 'pin FPGA D4 (UART_RXD_OUT: el RX de la PC)', 'Línea serie hacia la PC.'),
    P('o_led', 'out', 16, 'r', 'LD0..LD15', 'Estado del CPU (LD0..LD2), registro de la última escritura (LD3..LD7) y eventos del pipeline (LD10..LD15).'),
  ],
  parts: [
    {
      id: 'u_mmcm', kind: 'submodule', label: 'MMCME2_BASE 100 &rarr; 70 MHz', width: 1, symbol: 'u_mmcm', at: [0, 0], size: [2, 2],
      desc: `<p>Primitiva de Xilinx. Un oscilador interno (VCO) se engancha al reloj de entrada y lo multiplica por 7 (700 MHz); la salida lo divide por 10: <b>70 MHz</b>.</p>
        <p><b>¿Por qué?</b> Es la frecuencia más alta a la que el CPU cierra timing. Cambiarla es tocar <code>MMCM_MULT</code> y <code>MMCM_DIV_X8</code>: la UART recalcula su divisor y Vivado deriva la restricción.</p>
        <p><code>locked</code> = 1 cuando el VCO está estable; hasta entonces el sistema queda en reset.</p>`,
    },
    {
      id: 'u_out', kind: 'submodule', label: 'BUFG u_out', width: 1, symbol: 'u_out', at: [2, 0], size: [1, 1],
      desc: '<p>Buffer de reloj global. La salida del MMCM tiene que entrar al árbol de relojes de la FPGA para llegar con poco skew a todos los flip-flops; Vivado lo exige. (El otro BUFG, <code>u_fb</code>, cierra el lazo de realimentación <code>CLKFBOUT &rarr; CLKFBIN</code> del MMCM.)</p>',
    },
    {
      id: 'u_reset', kind: 'submodule', label: 'u_reset', width: 1, symbol: 'u_reset', at: [0, 3], size: [2, 2], drill: 'reset_gen',
      desc: '<p><code>reset_gen</code>: reset de power-on más el botón sincronizado. Recibe <code>i_reset | ~locked</code> y entrega <code>sys_reset</code>, sincrónico con <code>clk</code>.</p>',
    },
    {
      id: 'u_rx_sync', kind: 'submodule', label: 'u_rx_sync', width: 1, symbol: 'u_rx_sync', at: [0, 6], size: [2, 2], drill: 'sync_2ff',
      desc: '<p><code>sync_2ff</code> con <code>INIT = 1</code>: lleva la línea RX (que cambia sin relación con <code>clk</code>) al dominio de reloj del sistema sin riesgo de metaestabilidad. Arranca en 1 porque el reposo de la UART es 1; si arrancara en 0 se vería un falso start bit.</p>',
    },
    {
      id: 'u_uart', kind: 'submodule', label: 'u_uart', width: 1, symbol: 'u_uart', at: [4, 4], size: [3, 4], drill: 'uart_core',
      desc: '<p><code>uart_core</code>: serializa y deserializa bytes (8N1, 19200 baud) y los encola en dos FIFOs de 4 entradas. Del lado de la debug unit solo muestra una interfaz de bytes: <code>rx_read / rx_empty / rx_data</code> y <code>tx_write / tx_full / tx_data</code>.</p>',
    },
    {
      id: 'u_debug', kind: 'submodule', label: 'u_debug', width: 1, symbol: 'u_debug', at: [7, 2], size: [3, 5], drill: 'debug_unit', live: 'dbg.state',
      desc: '<p><code>debug_unit</code>: la FSM que entiende el protocolo del host. Carga la imem, controla <code>cpu_enable</code> / <code>cpu_reset</code>, y vuelca el estado del CPU. Es lo único que el CPU "ve" del mundo exterior.</p>',
    },
    {
      id: 'u_cpu', kind: 'submodule', label: 'u_cpu (riscv_pipeline)', width: 1, symbol: 'u_cpu', at: [11, 1], size: [3, 6], drill: 'riscv_pipeline',
      desc: '<p>El pipeline RV32I de 5 etapas. Hacia afuera tiene: <code>clk</code>, <code>i_rst</code>, <code>i_enable</code> (si vale 0 el CPU se congela), <code>o_halt</code>, el puerto de escritura de la imem y el bus de debug.</p>',
    },
  ],
  nets: [
    { id: 'n_i_clk', from: 'port:i_clk', to: 'u_mmcm', name: 'i_clk', width: 1, desc: '<p>De: pin E3. A: <code>CLKIN1</code> del MMCM. Para: generar el reloj interno de 70 MHz.</p>' },
    { id: 'n_clk_buf', from: 'u_mmcm', to: 'u_out', name: 'clk_out', width: 1, desc: '<p>De: <code>CLKOUT0</code> del MMCM. A: el BUFG <code>u_out</code>. Para: entrar al árbol de relojes global.</p>' },
    { id: 'n_clk', from: 'u_out', to: 'u_cpu', name: 'clk', width: 1, desc: '<p>De: <code>u_out</code> (70 MHz). A: el CPU, y también <b>los mismos</b> 70 MHz a <code>u_reset</code>, <code>u_rx_sync</code>, <code>u_uart</code> y <code>u_debug</code> (para no dibujar cinco cables iguales se muestra uno). Para: que todo el sistema sea un único dominio sincrónico.</p>' },
    { id: 'n_i_reset', from: 'port:i_reset', to: 'u_reset', name: 'i_reset', width: 1, desc: '<p>De: botón BTNC (activo en alto). A: <code>i_btn_reset</code> de <code>reset_gen</code>, OR-eado con <code>~locked</code>. Para: poder resetear todo a mano.</p>' },
    { id: 'n_locked', from: 'u_mmcm', to: 'u_reset', name: 'locked', width: 1, desc: '<p>De: <code>LOCKED</code> del MMCM. A: <code>i_btn_reset</code> (negado y OR-eado con el botón). Para: mantener el sistema en reset hasta que el reloj sea estable.</p>' },
    { id: 'n_sys_reset_uart', from: 'u_reset', to: 'u_uart', name: 'sys_reset', width: 1, desc: '<p>De: <code>reset_gen</code>. A: <code>i_reset</code> de la UART. Para: vaciar FIFOs y llevar los contadores/FSMs de la UART a IDLE.</p>' },
    { id: 'n_sys_reset_dbg', from: 'u_reset', to: 'u_debug', name: 'sys_reset', width: 1, desc: '<p>De: <code>reset_gen</code>. A: <code>i_reset</code> de la debug unit. Para: dejarla en IDLE; además la debug unit lo incluye en <code>o_cpu_reset</code>, así que el CPU también se resetea con el reset del sistema.</p>' },
    { id: 'n_i_rx', from: 'port:i_rx', to: 'u_rx_sync', name: 'i_rx', width: 1, desc: '<p>De: pin C4 (el TX de la PC). A: <code>i_async</code> del sincronizador. Para: evitar metaestabilidad.</p>' },
    { id: 'n_rx_sync', from: 'u_rx_sync', to: 'u_uart', name: 'rx_sync', width: 1, desc: '<p>De: <code>o_sync</code> del sincronizador. A: <code>i_rx</code> de la UART. Para: que el receptor lea una señal ya alineada con <code>clk</code> (a costo de 2 ciclos de retardo, despreciables frente a un bit de 2600 ciclos).</p>' },
    { id: 'n_o_tx', from: 'u_uart', to: 'port:o_tx', name: 'o_tx', width: 1, live: 'uart.tx.tx', desc: '<p>De: registro de salida del transmisor. A: pin D4 (RX de la PC). Para: enviar respuestas y volcados.</p>' },
    { id: 'n_rx_data', from: 'u_uart', to: 'u_debug', name: 'rx_data', width: 8, desc: '<p>De: cabeza del FIFO de RX. A: <code>i_data_to_read</code>. Para: que la debug unit vea el próximo byte recibido (se consume con <code>rx_read</code>).</p>' },
    { id: 'n_rx_empty', from: 'u_uart', to: 'u_debug', name: 'rx_empty', width: 1, desc: '<p>De: flag <code>empty</code> del FIFO de RX. A: <code>i_fifo_rx_empty</code>. Para: la FSM solo lee cuando <code>~rx_empty</code>.</p>' },
    { id: 'n_rx_read', from: 'u_debug', to: 'u_uart', name: 'rx_read', width: 1, desc: '<p>De: <code>o_fifo_rx_read</code> (combinacional desde la FSM). A: <code>i_read_uart</code>. Para: sacar un byte del FIFO de RX en ese mismo ciclo.</p>' },
    { id: 'n_tx_data', from: 'u_debug', to: 'u_uart', name: 'tx_data', width: 8, desc: '<p>De: <code>o_data_to_write</code> (respuesta o byte del dump). A: <code>i_data_to_write</code>. Para: el byte que se encola en el FIFO de TX.</p>' },
    { id: 'n_tx_write', from: 'u_debug', to: 'u_uart', name: 'tx_write', width: 1, desc: '<p>De: <code>o_fifo_tx_write</code>. A: <code>i_write_uart</code>. Para: encolar <code>tx_data</code> en el FIFO de TX.</p>' },
    { id: 'n_tx_full', from: 'u_uart', to: 'u_debug', name: 'tx_full', width: 1, desc: '<p>De: flag <code>full</code> del FIFO de TX. A: <code>i_fifo_tx_full</code>. Para: contrapresión: durante un volcado la FSM espera cuando el FIFO se llena, porque la UART es mucho más lenta que el reloj.</p>' },
    { id: 'n_cpu_enable', from: 'u_debug', to: 'u_cpu', name: 'cpu_enable', width: 1, live: 'dbg.cpuEnable', desc: '<p>De: <code>o_cpu_enable = (run | step) &amp; ~cpu_halt &amp; ~dumping</code>. A: <code>i_enable</code>. Para: avanzar el CPU: continuo con <code>R</code>, un ciclo con <code>S</code>, congelado durante un dump.</p>' },
    { id: 'n_cpu_reset', from: 'u_debug', to: 'u_cpu', name: 'cpu_reset', width: 1, live: 'dbg.cpuReset', desc: '<p>De: <code>o_cpu_reset = i_reset | cpu_rst | loading</code>. A: <code>i_rst</code>. Para: tener el CPU en reset durante la carga, tras <code>X</code> o tras un reset del sistema.</p>' },
    { id: 'n_cpu_halt', from: 'u_cpu', to: 'u_debug', name: 'cpu_halt', width: 1, live: 'snap.halted', desc: '<p>De: <code>o_halt</code> del CPU. A: <code>i_cpu_halt</code> (y a los LEDs LD2 y LD15). Para: que la FSM conteste <code>H</code> (incluso espontáneamente en modo <code>R</code>) y no avance más el CPU.</p>' },
    { id: 'n_imem_we', from: 'u_debug', to: 'u_cpu', name: 'imem_we', width: 1, desc: '<p>De: <code>o_imem_write_enable</code> (sale de un registro). A: <code>i_imem_we</code>. Para: habilitar la escritura de un byte en la memoria de instrucciones.</p>' },
    { id: 'n_imem_waddr', from: 'u_debug', to: 'u_cpu', name: 'imem_waddr', width: 10, desc: '<p>De: <code>o_imem_write_addr</code> (dirección <b>en bytes</b>, <code>IMEM_ADDR_W = 10</code>: 1 KB). A: <code>i_imem_waddr</code>. Para: elegir qué byte de la imem se escribe.</p>' },
    { id: 'n_imem_wdata', from: 'u_debug', to: 'u_cpu', name: 'imem_wdata', width: 8, desc: '<p>De: <code>o_imem_write_data</code>. A: <code>i_imem_wdata</code>. Para: el byte a escribir (o 0x13/0x00 al rellenar con NOP).</p>' },
    { id: 'n_dbg_addr', from: 'u_debug', to: 'u_cpu', name: 'dbg_addr', width: 16, desc: '<p>De: <code>o_dbg_addr</code>. A: <code>i_dbg_addr</code>. Para: elegir qué palabra del mapa de debug (0..89) se lee durante un dump.</p>' },
    { id: 'n_dbg_data', from: 'u_cpu', to: 'u_debug', name: 'dbg_data', width: 32, desc: '<p>De: <code>o_dbg_data</code> (PC, latches, registros, dmem). A: <code>i_dbg_data</code>. Para: la palabra que la debug unit serializa a la PC.</p>' },
    { id: 'n_dbg_count', from: 'u_cpu', to: 'u_debug', name: 'dbg_count', width: 16, desc: '<p>De: <code>o_dbg_count</code> (= 89, lo define el CPU; el top le suma 1 por la palabra de versión). A: <code>i_dbg_count</code>. Para: que el dump sepa cuántas palabras mandar sin tener el mapa cableado en la debug unit.</p>' },
    { id: 'n_led_dbg', from: 'u_debug', to: 'port:o_led', name: 'o_led', width: 2, desc: '<p>Bits [1:0] de <code>o_led</code>: <code>cpu_enable</code> (LD0) y <code>cpu_reset</code> (LD1), tomados de la debug unit.</p>' },
    { id: 'n_led_halt', from: 'u_cpu', to: 'port:o_led', name: 'o_led', width: 1, desc: '<p>Bit [2] de <code>o_led</code>: <code>cpu_halt</code> (LD2), directo del CPU.</p>' },
  ],
};
