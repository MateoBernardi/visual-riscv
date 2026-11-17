import { githubUrl } from '../repo.js';

const F = 'common/sync_2ff.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'sync_2ff',
  module: 'sync_2ff',
  file: F,
  instance: 'u_btn_sync',
  parent: 'reset_gen',
  blockIds: [],
  title: 'sync_2ff (sincronizador)',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>Una señal externa (botón, RX) cambia sin relación con el reloj, y a veces cae justo en la ventana de setup/hold: el flip-flop queda <b>metaestable</b>, ni 0 ni 1, por un tiempo impredecible. Si ese valor se reparte, cada destino puede leer algo distinto. Un segundo flip-flop le da un ciclo entero para resolverse, y la lógica usa solo la salida del segundo.</p>`,
    inThisProject: `
      <ul>
        <li><code>(* ASYNC_REG = "TRUE" *)</code>: Vivado pone los dos FFs juntos y no analiza timing sobre la entrada.</li>
        <li>Se usa para RX (en el top) y para el botón (en reset_gen), las dos veces con <code>INIT = 1</code>.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Dos FFs</b>: a 70 MHz y con una entrada a 19200 baud, el tiempo medio entre fallas ya es enorme; una tercera etapa sobra. Los 29 ns de latencia no importan frente a los 52 &micro;s de un bit.</p>
      <p><b>Sin reset</b>, con <code>INIT</code>: un reset agregaría una compuerta justo en el camino que conviene corto. Y solo sirve para señales de 1 bit; un bus necesitaría un handshake o una FIFO asíncrona.</p>`,
  },
  refs: [
    { label: 'sync_reg', sym: 'sync_reg' },
    { label: 'o_sync', sym: 'o_sync' },
    { label: 'INIT', sym: 'param:INIT' },
  ],
  grid: [9, 4],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj del dominio destino.'),
    P('i_async', 'in', 1, 'l', 'u_rx_sync: pin FPGA C4 (UART_TXD_IN) / u_btn_sync: botón | ~locked', 'Entrada asincrónica de 1 bit.'),
    P('o_sync', 'out', 1, 'r', 'u_uart.i_rx / reset_gen.btn_reset', 'Salida alineada con <code>i_clk</code>, con 2 ciclos de latencia.'),
  ],
  parts: [
    {
      id: 'ff0', kind: 'ff', label: 'sync_reg[0] (puede ser metaestable)', width: 1, symbol: 'sync_reg', at: [1, 1], size: [3, 2],
      desc: '<p>Primera etapa. Captura <code>i_async</code>; si el dato cambió dentro de la ventana de setup/hold puede quedar metaestable. Tiene un ciclo completo para resolverse antes de que la segunda etapa lo mire.</p>',
    },
    {
      id: 'ff1', kind: 'ff', label: 'sync_reg[1] (estable)', width: 1, symbol: 'sync_reg', at: [5, 1], size: [3, 2],
      desc: '<p>Segunda etapa. Captura <code>sync_reg[0]</code> ya resuelto. Su salida es <code>o_sync</code> y es la única que usa el resto del diseño. Valor inicial <code>INIT</code>.</p>',
    },
  ],
  nets: [
    { id: 'n_async', from: 'port:i_async', to: 'ff0', name: 'i_async', width: 1, desc: '<p>De: afuera (botón o línea RX). A: primer FF. Para: entrar al dominio de reloj; es el único cable "peligroso".</p>' },
    { id: 'n_mid', from: 'ff0', to: 'ff1', name: 'sync_reg', width: 1, desc: '<p><code>sync_reg[0]</code> hacia la entrada de <code>sync_reg[1]</code> (el desplazamiento <code>{sync_reg[0], i_async}</code>). Para: dar un ciclo entero de tiempo de resolución.</p>' },
    { id: 'n_sync', from: 'ff1', to: 'port:o_sync', name: 'o_sync', width: 1, desc: '<p><code>assign o_sync = sync_reg[1]</code>. Para: entregar al diseño una señal limpia y sincrónica.</p>' },
    { id: 'n_clk0', from: 'port:i_clk', to: 'ff0', name: 'i_clk', width: 1, desc: '<p>Mismo reloj en ambas etapas.</p>' },
    { id: 'n_clk1', from: 'port:i_clk', to: 'ff1', name: 'i_clk', width: 1, desc: '<p>Mismo reloj en ambas etapas.</p>' },
  ],
};
