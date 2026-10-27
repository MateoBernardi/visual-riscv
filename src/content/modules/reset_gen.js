import { githubUrl } from '../repo.js';

const F = 'common/reset_gen.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'reset_gen',
  module: 'reset_gen',
  file: F,
  instance: 'u_reset',
  parent: null,
  within: 'top_riscv',
  instancePath: 'u_reset',
  blockIds: ['clkrst'],
  title: 'Reloj y reset',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Un circuito digital recién energizado tiene flip-flops con valores arbitrarios: la FSM podría arrancar en cualquier estado. Hace falta una señal de <b>reset</b> que, durante unos ciclos, fuerce todo a un estado conocido. Dos fuentes naturales: (1) el <b>power-on</b>, que no depende de nadie, y (2) un <b>botón</b> para reiniciar a mano.</p>
      <p>El botón plantea un problema: lo aprieta una persona, en cualquier instante, sin relación con el reloj. Si su flanco cae justo cuando un flip-flop está capturando, ese flip-flop puede quedar <i>metaestable</i> (ver <code>sync_2ff</code>) y el reset llegaría a unas partes del diseño en un ciclo y a otras en el siguiente. Por eso el botón se <b>sincroniza</b> antes de usarlo y se distribuye ya alineado con el reloj.</p>
      <p>Para el power-on, las FPGAs ofrecen algo cómodo: los flip-flops pueden tener un valor inicial que se carga al configurar el chip (el bitstream lo fija). Un registro que arranca en unos y va metiendo ceros dura exactamente N ciclos en alto: es un reset de duración conocida sin botón.</p>`,
    inThisProject: `
      <p>${L('por_reg')} es un registro de desplazamiento de <code>POR_CYCLES = 4</code> bits que se inicializa en <code>1111</code> y en cada flanco desplaza un 0 por la derecha (<code>{por_reg[POR_CYCLES-2:0], 1'b0}</code>). Su bit más alto vale 1 durante 4 ciclos tras la configuración y después queda en 0 para siempre.</p>
      <p>El botón (que en el top llega como <code>i_reset | ~locked</code>, o sea también reset mientras el MMCM no enganchó) pasa por ${L('u_btn_sync', 'u_btn_sync')} (un <code>sync_2ff</code> con <code>INIT = 1</code>, el mismo módulo que usa el top para la línea RX).</p>
      <p>La salida es ${L('o_reset')} = <code>por_reg[POR_CYCLES-1] | btn_reset</code>: reset activo en alto, sincrónico con <code>i_clk</code>. Con <code>INIT = 1</code> el reset también está activo durante los primeros ciclos después de configurar, aunque el botón no se toque.</p>
      <p><b>Reloj.</b> Este bloque de la placa agrupa lo que le da reloj y reset al sistema. El reloj de 50 MHz no sale de <code>reset_gen</code>: lo genera el ${L('u_mmcm', 'MMCME2_BASE')} del top (100 MHz &times; 10 / 20) y lo reparte el BUFG <code>u_out</code>. Se lo dibuja acá como parte (sin entrar) porque <code>locked</code> se mezcla con el botón antes de llegar a <code>i_btn_reset</code>: el sistema queda en reset hasta que el reloj es estable. El top también usa un <code>sync_2ff</code> (<code>u_rx_sync</code>) para la línea RX de la UART.</p>
      <p>Nota: el README de <code>common/</code> habla de "un contador"; el RTL usa este shift register, que es más barato (sin sumador) y cumple lo mismo.</p>`,
    whyThisChoice: `
      <p><b>Shift register vs. contador.</b> Un contador de N bits cuenta hasta 2<sup>N</sup>; para "unos pocos ciclos" basta un desplazador de 4 FFs sin lógica. Contra: la duración es lineal en bits (para 1 ms a 50 MHz haría falta un contador).</p>
      <p><b>Reset sincrónico.</b> Todos los registros del diseño usan <code>if (i_reset)</code> dentro de <code>always @(posedge clk)</code>. Es más fácil de cerrar en timing que el reset asincrónico y el cambio de <code>sys_reset</code> está alineado con el reloj gracias a este módulo. Alternativa: reset asincrónico con deassert sincronizado (el estándar de Xilinx), que además resetea sin reloj activo; no hace falta acá porque el reloj ya está corriendo cuando se aprieta el botón.</p>
      <p><b>Una sola fuente.</b> Un solo <code>sys_reset</code> para UART y debug unit evita que partes del sistema salgan del reset en ciclos distintos.</p>`,
  },
  refs: [
    { label: 'por_reg', sym: 'por_reg' },
    { label: 'u_btn_sync', sym: 'u_btn_sync' },
    { label: 'o_reset', sym: 'o_reset' },
  ],
  grid: [13, 5],
  ports: [
    P('i_clk', 'in', 1, 'l', 'clk (50 MHz)', 'Reloj del sistema; con este reloj se desplaza <code>por_reg</code> y se sincroniza el botón.'),
    P('i_btn_reset', 'in', 1, 'l', 'botón BTNC | ~locked', 'Reset asincrónico, activo en alto. En el top llega como <code>i_reset | ~locked</code>.'),
    P('o_reset', 'out', 1, 'r', 'sys_reset &rarr; uart_core y debug_unit', 'Reset sincrónico, activo en alto.'),
  ],
  parts: [
    {
      id: 'u_mmcm', kind: 'submodule', label: 'MMCM 100 → 50 MHz', width: 1, symbol: 'u_mmcm', file: 'top/top_riscv.v', at: [0, 1], size: [3, 3],
      desc: '<p>Vive en <code>top_riscv</code>, no dentro de <code>reset_gen</code>: <code>MMCME2_BASE</code> con VCO = 100 MHz &times; 10 = 1000 MHz y divisor 20 &rarr; <code>clk</code> = 50 MHz (pasa por el BUFG <code>u_out</code>). Su salida <code>locked</code> sube cuando el PLL enganchó y se mezcla con el botón (<code>i_reset | ~locked</code>), así que mientras no hay reloj estable, hay reset.</p>',
    },
    {
      id: 'por_reg', kind: 'reg', label: 'por_reg (POR_CYCLES bits)', width: 4, symbol: 'por_reg', at: [4, 0], size: [3, 2],
      desc: '<p>Registro de power-on. Valor inicial <code>{POR_CYCLES{1\'b1}}</code> (se carga con el bitstream, sin necesidad de reset). Cada flanco desplaza un 0: <code>1111 &rarr; 1110 &rarr; 1100 &rarr; 1000 &rarr; 0000</code>. El MSB se queda en 1 durante <code>POR_CYCLES = 4</code> ciclos. <b>POR_CYCLES &ge; 2</b> porque el rango <code>[POR_CYCLES-2:0]</code> necesita al menos un bit.</p>',
    },
    {
      id: 'u_btn_sync', kind: 'submodule', label: 'u_btn_sync', width: 1, symbol: 'u_btn_sync', at: [4, 3], size: [3, 2], drill: 'sync_2ff',
      desc: '<p><code>sync_2ff</code> con <code>INIT = 1</code>: sincroniza el botón con el reloj. Arranca en 1, o sea que el reset está "pedido" justo después de configurar la FPGA; se libera dos ciclos después si el botón no está apretado.</p>',
    },
    {
      id: 'btn_reset', kind: 'logic', label: 'btn_reset', width: 1, symbol: 'btn_reset', at: [8, 3], size: [2, 1],
      desc: '<p>Cable con el botón ya sincronizado (<code>o_sync</code> del sincronizador).</p>',
    },
    {
      id: 'o_reset', kind: 'logic', label: 'OR &rarr; o_reset', width: 1, symbol: 'o_reset', at: [10, 1], size: [2, 2],
      desc: '<p><code>assign o_reset = por_reg[POR_CYCLES-1] | btn_reset</code>. Reset si el power-on todavía no terminó <b>o</b> si el botón está apretado.</p>',
    },
  ],
  nets: [
    { id: 'n_mmcm_clk', from: 'u_mmcm', to: 'port:i_clk', name: 'i_clk', width: 1, desc: '<p>De: <code>CLKOUT0</code> del MMCM (por el BUFG <code>u_out</code>). A: <code>i_clk</code> de <code>reset_gen</code>. Para: que reset_gen, la UART, la debug unit y el CPU compartan los mismos 50 MHz.</p>' },
    { id: 'n_clk_por', from: 'port:i_clk', to: 'por_reg', name: 'i_clk', width: 1, desc: '<p>Reloj que desplaza el registro de power-on.</p>' },
    { id: 'n_clk_sync', from: 'port:i_clk', to: 'u_btn_sync', name: 'i_clk', width: 1, desc: '<p>El mismo reloj va al sincronizador del botón.</p>' },
    { id: 'n_btn', from: 'port:i_btn_reset', to: 'u_btn_sync', name: 'i_btn_reset', width: 1, desc: '<p>De: botón (asincrónico). A: <code>i_async</code> del sincronizador. Para: alinear el flanco del botón con <code>i_clk</code>.</p>' },
    { id: 'n_btn_sync', from: 'u_btn_sync', to: 'btn_reset', name: 'btn_reset', width: 1, desc: '<p>De: <code>o_sync</code> del sincronizador. A: el OR de salida. Para: reset por botón, sincrónico.</p>' },
    { id: 'n_btn_or', from: 'btn_reset', to: 'o_reset', name: 'btn_reset', width: 1, desc: '<p>Entrada "botón" del OR.</p>' },
    { id: 'n_por', from: 'por_reg', to: 'o_reset', name: 'por_reg', width: 1, desc: '<p>De: bit <code>por_reg[POR_CYCLES-1]</code> (el MSB). A: el OR. Para: mantener el reset durante el power-on.</p>' },
    { id: 'n_out', from: 'o_reset', to: 'port:o_reset', name: 'o_reset', width: 1, desc: '<p>Sale como <code>sys_reset</code> hacia <code>uart_core</code> y <code>debug_unit</code>.</p>' },
  ],
};
