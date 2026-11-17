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
      <p>Al energizar, los flip-flops arrancan con cualquier valor: hace falta un reset de power-on. El botón, en cambio, cambia en cualquier instante respecto del reloj, así que hay que sincronizarlo antes de repartirlo, o partes del diseño saldrían del reset en ciclos distintos.</p>`,
    inThisProject: `
      <ul>
        <li>${L('por_reg')}: 4 bits que arrancan en <code>1111</code> (valor del bitstream) y van metiendo ceros. Dan 4 ciclos de reset sin botón.</li>
        <li>El botón llega como <code>i_reset | ~locked</code>: el sistema también queda en reset hasta que el ${L('u_mmcm', 'MMCM')} engancha. Pasa por ${L('u_btn_sync', 'u_btn_sync')}.</li>
        <li>El reloj de 70 MHz no sale de acá: lo genera el MMCM del top (100 &times; 7 / 10).</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Desplazador y no contador</b>: para unos pocos ciclos alcanzan 4 flip-flops sin sumador.</p>
      <p><b>Reset sincrónico</b> en todo el diseño: más fácil de cerrar en timing, y este módulo garantiza que <code>sys_reset</code> cambie alineado con el reloj. Una sola fuente para UART y debug unit, para que salgan del reset en el mismo ciclo.</p>`,
  },
  refs: [
    { label: 'por_reg', sym: 'por_reg' },
    { label: 'u_btn_sync', sym: 'u_btn_sync' },
    { label: 'o_reset', sym: 'o_reset' },
  ],
  grid: [13, 5],
  ports: [
    P('i_clk', 'in', 1, 'l', 'clk (70 MHz)', 'Reloj del sistema; con este reloj se desplaza <code>por_reg</code> y se sincroniza el botón.'),
    P('i_btn_reset', 'in', 1, 'l', 'botón BTNC | ~locked', 'Reset asincrónico, activo en alto. En el top llega como <code>i_reset | ~locked</code>.'),
    P('o_reset', 'out', 1, 'r', 'sys_reset &rarr; uart_core y debug_unit', 'Reset sincrónico, activo en alto.'),
  ],
  parts: [
    {
      id: 'u_mmcm', kind: 'submodule', label: 'MMCM 100 → 70 MHz', width: 1, symbol: 'u_mmcm', file: 'top/top_riscv.v', at: [0, 1], size: [3, 3],
      desc: '<p>Vive en <code>top_riscv</code>, no dentro de <code>reset_gen</code>: <code>MMCME2_BASE</code> con VCO = 100 MHz &times; 7 = 700 MHz y divisor 10 &rarr; <code>clk</code> = 70 MHz (pasa por el BUFG <code>u_out</code>). Su salida <code>locked</code> sube cuando el PLL enganchó y se mezcla con el botón (<code>i_reset | ~locked</code>), así que mientras no hay reloj estable, hay reset.</p>',
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
    { id: 'n_mmcm_clk', from: 'u_mmcm', to: 'port:i_clk', name: 'i_clk', width: 1, desc: '<p>De: <code>CLKOUT0</code> del MMCM (por el BUFG <code>u_out</code>). A: <code>i_clk</code> de <code>reset_gen</code>. Para: que reset_gen, la UART, la debug unit y el CPU compartan los mismos 70 MHz.</p>' },
    { id: 'n_clk_por', from: 'port:i_clk', to: 'por_reg', name: 'i_clk', width: 1, desc: '<p>Reloj que desplaza el registro de power-on.</p>' },
    { id: 'n_clk_sync', from: 'port:i_clk', to: 'u_btn_sync', name: 'i_clk', width: 1, desc: '<p>El mismo reloj va al sincronizador del botón.</p>' },
    { id: 'n_btn', from: 'port:i_btn_reset', to: 'u_btn_sync', name: 'i_btn_reset', width: 1, desc: '<p>De: botón (asincrónico). A: <code>i_async</code> del sincronizador. Para: alinear el flanco del botón con <code>i_clk</code>.</p>' },
    { id: 'n_btn_sync', from: 'u_btn_sync', to: 'btn_reset', name: 'btn_reset', width: 1, desc: '<p>De: <code>o_sync</code> del sincronizador. A: el OR de salida. Para: reset por botón, sincrónico.</p>' },
    { id: 'n_btn_or', from: 'btn_reset', to: 'o_reset', name: 'btn_reset', width: 1, desc: '<p>Entrada "botón" del OR.</p>' },
    { id: 'n_por', from: 'por_reg', to: 'o_reset', name: 'por_reg', width: 1, desc: '<p>De: bit <code>por_reg[POR_CYCLES-1]</code> (el MSB). A: el OR. Para: mantener el reset durante el power-on.</p>' },
    { id: 'n_out', from: 'o_reset', to: 'port:o_reset', name: 'o_reset', width: 1, desc: '<p>Sale como <code>sys_reset</code> hacia <code>uart_core</code> y <code>debug_unit</code>.</p>' },
  ],
};
