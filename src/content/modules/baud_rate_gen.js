import { githubUrl } from '../repo.js';

const F = 'uart/baud_rate_gen.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'baud_rate_gen',
  module: 'baud_rate_gen',
  file: F,
  instance: 'BAUD_GEN',
  parent: 'uart_core',
  blockIds: [],
  title: 'baud_rate_gen',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>La UART no manda reloj: el receptor cuenta ciclos para saber cuándo muestrear. Como el start llega en cualquier instante, se sobremuestrea: un <code>tick</code> a 16 veces el baud rate. Con 8 ticks se llega al centro del start y desde ahí, cada 16, al centro de cada bit.</p>`,
    inThisProject: `
      <ul>
        <li>${L('MODULUS')} = 70 000 000 / (19 200 &times; 16) = 227 (truncado). Da 19 273 baud: +0,38 %, una deriva de 0,04 bit en una trama, lejos del medio bit que haría fallar.</li>
        <li>RX y TX comparten el mismo <code>tick</code>.</li>
      </ul>`,
    whyThisChoice: `
      <p>Un contador módulo-N es trivial y, con un divisor tan grande, el error de truncar es chico. Un acumulador de fase daría frecuencias fraccionarias pero con un sumador más ancho y jitter, sin beneficio a 19200 baud. <code>MODULUS</code> se recalcula solo si cambia la frecuencia del sistema.</p>`,
  },
  refs: [
    { label: 'MODULUS', sym: 'MODULUS' },
    { label: 'counter_reg', sym: 'counter_reg' },
    { label: 'o_tick', sym: 'o_tick' },
  ],
  grid: [10, 5],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico: el contador vuelve a 0.'),
    P('o_tick', 'out', 1, 'r', 'RX y TX', 'Pulso de un ciclo cada MODULUS ciclos (16&times; el baud rate).'),
  ],
  parts: [
    { id: 'counter_reg', kind: 'reg', label: 'counter_reg [NB_COUNTER]', width: 8, symbol: 'counter_reg', at: [1, 1], size: [3, 2],
      desc: '<p>Contador de <code>$clog2(MODULUS)</code> = 8 bits. En cada flanco suma 1; al llegar a <code>MODULUS - 1</code> (161) vuelve a 0. Es el único estado del módulo.</p>' },
    { id: 'MODULUS', kind: 'const', label: 'MODULUS = 227', width: 8, symbol: 'MODULUS', at: [1, 3], size: [3, 1],
      desc: '<p>Parámetro derivado: <code>CLK_FREQ / (BAUD_RATE * N_TICKS)</code> (aritmética entera, truncada).</p>' },
    { id: 'o_tick', kind: 'cmp', label: 'counter_reg == MODULUS-1', width: 1, symbol: 'o_tick', at: [6, 1], size: [3, 2],
      desc: '<p>Comparador de igualdad: 1 cuando el contador llegó al final. El mismo comparador decide el wrap del contador.</p>' },
  ],
  nets: [
    { id: 'n_clk', from: 'port:i_clk', to: 'counter_reg', name: 'i_clk', width: 1, desc: '<p>Reloj de captura del contador.</p>' },
    { id: 'n_reset', from: 'port:i_reset', to: 'counter_reg', name: 'i_reset', width: 1, desc: '<p>Pone el contador en 0 (sincrónico).</p>' },
    { id: 'n_count', from: 'counter_reg', to: 'o_tick', name: 'counter_reg', width: 8, desc: '<p>Valor actual del contador, comparado contra <code>MODULUS - 1</code>.</p>' },
    { id: 'n_mod', from: 'MODULUS', to: 'o_tick', name: 'MODULUS', width: 8, desc: '<p>Límite de cuenta.</p>' },
    { id: 'n_tick', from: 'o_tick', to: 'port:o_tick', name: 'o_tick', width: 1, desc: '<p>El tick de 16&times; que usan RX y TX.</p>' },
  ],
};
