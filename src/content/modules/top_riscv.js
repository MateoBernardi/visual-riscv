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
      <p>Un procesador solo no sirve de nada: necesita un <b>reloj</b> que marque el ritmo, un <b>reset</b> que lo deje en un estado conocido, y alguna forma de que una persona le <b>cargue un programa</b> y mire qué hizo. En una FPGA no hay sistema operativo ni monitor: lo único que tenemos son los pines de la placa (un oscilador, un botón, tres LEDs y un puerto serie por USB).</p>
      <p>El módulo <b>top</b> es el que conecta esos pines con el diseño: es puramente <i>estructural</i> (no calcula nada, solo instancia módulos y los cablea). Es el nivel más alto de la jerarquía y, por eso, la raíz de este recorrido: desde acá se puede entrar a cada pieza.</p>
      <p>Tres problemas se resuelven acá y no más adentro: <b>(1)</b> de dónde sale el reloj interno (el CPU no llega a 100 MHz, ver MMCM), <b>(2)</b> cómo se genera un reset limpio, y <b>(3)</b> cómo entra al diseño una señal que no tiene nada que ver con nuestro reloj (la línea RX del puerto serie).</p>
      <p>Una tentación frecuente para el modo "paso a paso" es filtrar el reloj con una compuerta AND para dejar pasar un solo pulso (<i>clock gating</i>). En una FPGA es mala idea: el reloj viaja por redes dedicadas que llegan a todos los flip-flops casi al mismo tiempo, y pasarlo por lógica común introduce skew y glitches, además de romper el análisis de timing. La alternativa sincrónica es dejar el reloj correr siempre y controlar si cada flip-flop acepta o no el valor nuevo (<i>clock enable</i>). Por eso hay un único <code>clk</code> para todo y el CPU se frena con <code>cpu_enable</code>, no tocando el reloj.</p>
      <p>Por último, las FPGAs de Xilinx permiten que los flip-flops arranquen con un valor definido por el bitstream. Eso se usa en dos lugares de este top: el reset de power-on y el valor inicial de los sincronizadores.</p>`,
    inThisProject: `
      <p>La cadena es ${L('u_uart')} &harr; ${L('u_debug')} &harr; ${L('u_cpu')}. La PC habla por la UART; la debug unit interpreta los bytes como comandos (<code>L S R P X D</code>) y maneja al CPU con <code>cpu_enable</code> y <code>cpu_reset</code>, escribe la memoria de instrucciones por <code>imem_we / imem_waddr / imem_wdata</code> y lee el estado del CPU por el bus <code>dbg_addr / dbg_data / dbg_count</code>.</p>
      <p><b>Reloj.</b> Con <code>USE_MMCM = 1</code> (default) el ${L('u_mmcm', 'MMCME2_BASE')} multiplica por 10 (VCO = 100 MHz &times; 10 = 1000 MHz) y divide por 20: <code>clk</code> = 50 MHz. Esa es la frecuencia de <b>todo</b> el sistema; por eso <code>SYS_FREQ</code> = <code>CLK_FREQ / 2</code> es lo que recibe la UART para calcular el baud rate (MODULUS = 162, no 325). <code>locked</code> sube cuando el PLL enganchó y se mezcla con el botón: <code>i_reset | ~locked</code>.</p>
      <p><b>Reset.</b> ${L('u_reset')} genera <code>sys_reset</code>, que resetea la UART y la debug unit. El CPU <b>no</b> recibe <code>sys_reset</code>: su <code>i_rst</code> es <code>cpu_reset</code>, que la debug unit arma como <code>i_reset | cpu_rst | loading</code>. Así el comando <code>X</code> y la carga de programa resetean solo al CPU.</p>
      <p><b>LEDs.</b> ${L('o_led')} = <code>{cpu_halt, cpu_reset, cpu_enable}</code>: LD0 = CPU habilitado, LD1 = CPU en reset (cargando), LD2 = halt.</p>`,
    whyThisChoice: `
      <p><b>Bajar a 50 MHz en vez de arreglar el camino crítico.</b> El camino dmem &rarr; forwarding &rarr; ALU &rarr; branch &rarr; flush tiene un slack de unos &minus;5 ns post-ruteo a 100 MHz. Alternativas: más etapas de pipeline (más hazards, más lógica de flush) o reducir el reloj. Un MMCM dividiendo por 2 es la opción más barata y deja intacto el pipeline de 5 etapas; el costo es la mitad de rendimiento, irrelevante para un sistema que se maneja a 19200 baud.</p>
      <p><b>Mantener el CPU aislado de <code>sys_reset</code>.</b> Si el CPU colgara del reset del sistema, no habría forma de resetearlo sin resetear también la UART (y se perdería la respuesta al comando <code>X</code>).</p>
      <p><b>Un solo dominio de reloj.</b> Todo corre con <code>clk</code>; lo único asíncrono (RX y botón) pasa por <code>sync_2ff</code>. Es más simple que tener FIFOs asíncronos entre dominios.</p>`,
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
    P('o_led', 'out', 3, 'r', 'LD0 H17, LD1 K15, LD2 J13', '<code>{cpu_halt, cpu_reset, cpu_enable}</code>.'),
  ],
  parts: [
    {
      id: 'u_mmcm', kind: 'submodule', label: 'MMCME2_BASE 100 &rarr; 50 MHz', width: 1, symbol: 'u_mmcm', at: [0, 0], size: [2, 2],
      desc: `<p>Primitiva de Xilinx (generate <code>g_mmcm</code>, cuando <code>USE_MMCM = 1</code>). Un oscilador interno (VCO) se engancha al reloj de entrada: <code>CLKFBOUT_MULT_F = 10</code> lo hace trabajar a 100 &times; 10 = 1000 MHz y <code>CLKOUT0_DIVIDE_F = 20</code> lo divide para sacar <b>50 MHz</b>. <code>DIVCLK_DIVIDE = 1</code> no divide la entrada.</p>
        <p><b>¿Por qué?</b> A 100 MHz el camino crítico del CPU no cierra (WNS &asymp; &minus;5 ns). Con 50 MHz hay 20 ns por ciclo.</p>
        <p><code>locked</code> = 1 cuando el VCO ya está estable. Mientras vale 0 el reloj de salida no es confiable, así que se le suma al reset (<code>i_reset | ~locked</code>). Con <code>USE_MMCM = 0</code> (simulación) el generate <code>g_direct</code> hace <code>clk = i_clk</code> y <code>locked = 1</code>.</p>`,
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
    { id: 'n_i_clk', from: 'port:i_clk', to: 'u_mmcm', name: 'i_clk', width: 1, desc: '<p>De: pin E3. A: <code>CLKIN1</code> del MMCM. Para: generar el reloj interno de 50 MHz.</p>' },
    { id: 'n_clk_buf', from: 'u_mmcm', to: 'u_out', name: 'clk_out', width: 1, desc: '<p>De: <code>CLKOUT0</code> del MMCM. A: el BUFG <code>u_out</code>. Para: entrar al árbol de relojes global.</p>' },
    { id: 'n_clk', from: 'u_out', to: 'u_cpu', name: 'clk', width: 1, desc: '<p>De: <code>u_out</code> (50 MHz). A: el CPU, y también <b>los mismos</b> 50 MHz a <code>u_reset</code>, <code>u_rx_sync</code>, <code>u_uart</code> y <code>u_debug</code> (para no dibujar cinco cables iguales se muestra uno). Para: que todo el sistema sea un único dominio sincrónico.</p>' },
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
    { id: 'n_cpu_halt', from: 'u_cpu', to: 'u_debug', name: 'cpu_halt', width: 1, live: 'snap.halted', desc: '<p>De: <code>o_halt</code> del CPU. A: <code>i_cpu_halt</code> (y al LED 2). Para: que la FSM conteste <code>H</code> (incluso espontáneamente en modo <code>R</code>) y no avance más el CPU.</p>' },
    { id: 'n_imem_we', from: 'u_debug', to: 'u_cpu', name: 'imem_we', width: 1, desc: '<p>De: <code>o_imem_write_enable</code> (sale de un registro). A: <code>i_imem_we</code>. Para: habilitar la escritura de un byte en la memoria de instrucciones.</p>' },
    { id: 'n_imem_waddr', from: 'u_debug', to: 'u_cpu', name: 'imem_waddr', width: 10, desc: '<p>De: <code>o_imem_write_addr</code> (dirección <b>en bytes</b>, <code>IMEM_ADDR_W = 10</code>: 1 KB). A: <code>i_imem_waddr</code>. Para: elegir qué byte de la imem se escribe.</p>' },
    { id: 'n_imem_wdata', from: 'u_debug', to: 'u_cpu', name: 'imem_wdata', width: 8, desc: '<p>De: <code>o_imem_write_data</code>. A: <code>i_imem_wdata</code>. Para: el byte a escribir (o 0x13/0x00 al rellenar con NOP).</p>' },
    { id: 'n_dbg_addr', from: 'u_debug', to: 'u_cpu', name: 'dbg_addr', width: 16, desc: '<p>De: <code>o_dbg_addr</code>. A: <code>i_dbg_addr</code>. Para: elegir qué palabra del mapa de debug (0..85) se lee durante un dump.</p>' },
    { id: 'n_dbg_data', from: 'u_cpu', to: 'u_debug', name: 'dbg_data', width: 32, desc: '<p>De: <code>o_dbg_data</code> (PC, latches, registros, dmem). A: <code>i_dbg_data</code>. Para: la palabra que la debug unit serializa a la PC.</p>' },
    { id: 'n_dbg_count', from: 'u_cpu', to: 'u_debug', name: 'dbg_count', width: 16, desc: '<p>De: <code>o_dbg_count</code> (= 86, lo define el CPU). A: <code>i_dbg_count</code>. Para: que el dump sepa cuántas palabras mandar sin tener el mapa cableado en la debug unit.</p>' },
    { id: 'n_led_dbg', from: 'u_debug', to: 'port:o_led', name: 'o_led', width: 2, desc: '<p>Bits [1:0] de <code>o_led</code>: <code>cpu_enable</code> (LD0) y <code>cpu_reset</code> (LD1), tomados de la debug unit.</p>' },
    { id: 'n_led_halt', from: 'u_cpu', to: 'port:o_led', name: 'o_led', width: 1, desc: '<p>Bit [2] de <code>o_led</code>: <code>cpu_halt</code> (LD2), directo del CPU.</p>' },
  ],
};
