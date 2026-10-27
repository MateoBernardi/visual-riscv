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
      <p>Una UART no manda reloj, así que el receptor tiene que fabricarse su propia noción de tiempo. Cada bit dura un tiempo fijo (a 19200 baud, 1/19200 &asymp; 52 &micro;s). Con un reloj de sistema de 50 MHz, eso son unos 2600 ciclos por bit. Hace falta un circuito que cuente ciclos y avise "pasó un intervalo": un <b>divisor de frecuencia</b>, es decir, un contador que llega a un valor y vuelve a cero emitiendo un pulso.</p>
      <p>¿Por qué no un pulso por bit? Porque el receptor no sabe cuándo empieza el bit: el start llega en cualquier instante respecto de su reloj. Si solo tuviera un pulso por bit, podría quedar muestreando justo en el borde del bit, donde la señal cambia. La solución es el <b>sobremuestreo</b>: un pulso <code>tick</code> a <code>N_TICKS = 16</code> veces la velocidad en baudios. Al detectar el flanco de bajada del start, el receptor cuenta ticks: 8 ticks lo ubican en el centro del bit de start, y desde ahí cada 16 ticks cae exactamente en el centro del bit siguiente. El error de ubicación nunca pasa de 1/16 de bit.</p>
      <p>El centro del bit es lo ideal porque da margen para los dos lados: aunque el reloj del emisor y el del receptor difieran un poco, la muestra sigue cayendo dentro del bit correcto a lo largo de los 10 bits de la trama. El emisor también usa estos ticks para durar exactamente 16 ticks por bit.</p>
      <p>El divisor no necesita ser exacto: <code>CLK_FREQ / (BAUD_RATE &times; N_TICKS)</code> se trunca a un entero y el error de baud resultante (menos del 1 %) es tolerable porque a lo largo de una trama de 10 bits la deriva acumulada queda muy por debajo de medio bit.</p>`,
    inThisProject: `
      <p>${L('MODULUS')} = <code>CLK_FREQ / (BAUD_RATE * N_TICKS)</code>. El top pasa <code>CLK_FREQ = SYS_FREQ</code> = 50 MHz (el sistema corre a 50 MHz gracias al MMCM), así que <b>MODULUS = 50 000 000 / (19 200 &times; 16) = 162</b> (162,76 truncado). El README de <code>uart/</code> menciona 325: es el valor que saldría con 100 MHz, que no es la frecuencia real. ${L('NB_COUNTER')} = <code>$clog2(MODULUS)</code> = 8 bits.</p>
      <p>${L('counter_reg')} cuenta de 0 a <code>MODULUS - 1</code> y vuelve a 0 (con <code>i_reset</code>, también a 0). ${L('o_tick')} = <code>(counter_reg == MODULUS - 1)</code>: un pulso de un ciclo cada 162 ciclos. Frecuencia real de ticks: 50 MHz / 162 = 308 642 Hz, o sea una UART a 308 642 / 16 = <b>19 290 baud</b> (error de +0,47 %: a lo largo de los 10 bits de una trama la deriva acumulada es de 0,047 bit, muy lejos de los 0,5 bit que se necesitan para equivocarse de muestra).</p>
      <p>El pulso es <b>combinacional</b> sobre el registro (no hay registro extra para <code>o_tick</code>), por eso dura exactamente un ciclo y está alineado con el valor 161 del contador.</p>`,
    whyThisChoice: `
      <p><b>Contador módulo-N vs. acumulador de fase (NCO).</b> El contador módulo entero es trivial pero el error de truncamiento es fijo (0,47 % acá). Un acumulador de fase (suma una constante y usa el desbordamiento) permite frecuencias fraccionarias y error mucho menor, a costa de un sumador más ancho y de un tick con jitter de un ciclo. Para 19200 baud no hace falta.</p>
      <p><b>Un solo generador compartido.</b> RX y TX usan el mismo <code>tick</code>; es más barato que dos contadores, pero la fase del TX no se alinea con el bit del RX (no importa: son independientes).</p>
      <p><b>Dependencia del reloj.</b> Si se cambia <code>USE_MMCM</code> o <code>CLK_FREQ</code>, <code>MODULUS</code> se recalcula solo (el top pasa <code>SYS_FREQ</code>), pero el error de truncamiento cambia: a 100 MHz sería 325,52 &rarr; 325 (0,16 %); a 50 MHz 162,76 &rarr; 162 (0,47 %).</p>`,
  },
  refs: [
    { label: 'MODULUS', sym: 'MODULUS' },
    { label: 'counter_reg', sym: 'counter_reg' },
    { label: 'o_tick', sym: 'o_tick' },
  ],
  grid: [10, 5],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del sistema.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico: el contador vuelve a 0.'),
    P('o_tick', 'out', 1, 'r', 'RX y TX', 'Pulso de un ciclo cada MODULUS ciclos (16&times; el baud rate).'),
  ],
  parts: [
    { id: 'counter_reg', kind: 'reg', label: 'counter_reg [NB_COUNTER]', width: 8, symbol: 'counter_reg', at: [1, 1], size: [3, 2],
      desc: '<p>Contador de <code>$clog2(MODULUS)</code> = 8 bits. En cada flanco suma 1; al llegar a <code>MODULUS - 1</code> (161) vuelve a 0. Es el único estado del módulo.</p>' },
    { id: 'MODULUS', kind: 'const', label: 'MODULUS = 162', width: 8, symbol: 'MODULUS', at: [1, 3], size: [3, 1],
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
