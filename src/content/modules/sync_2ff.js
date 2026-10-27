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
      <p>Un flip-flop captura su entrada en el flanco del reloj. Para hacerlo bien, la entrada tiene que estar <b>quieta</b> un poquito antes (tiempo de <i>setup</i>) y un poquito después (tiempo de <i>hold</i>) del flanco. Dentro del diseño, el síntesis y el ruteo verifican que esto se cumpla, porque todas las señales nacen de flip-flops del mismo reloj.</p>
      <p>Una señal que viene de <b>afuera</b> (el botón, la línea RX de la PC) cambia en cualquier instante, sin relación con nuestro reloj. A veces va a cambiar justo dentro de la ventana prohibida de setup/hold. Entonces el flip-flop queda en un estado intermedio, ni 0 ni 1: es la <b>metaestabilidad</b>. No es un error de diseño, es física: como una bolita en la punta de una colina, termina cayendo para algún lado, pero tarda un tiempo impredecible (a veces más que un ciclo).</p>
      <p>Si ese valor dudoso llega a lógica que lo reparte a muchos flip-flops, cada uno puede interpretarlo distinto: unos ven 0 y otros 1, y la FSM se rompe. La solución no elimina el problema, lo hace <b>improbable</b>: se pone un segundo flip-flop detrás del primero. El primero puede quedar metaestable, pero tiene un ciclo entero para resolverse antes de que el segundo lo capture. La probabilidad de que siga indeciso tras un ciclo completo es astronómicamente baja (años entre fallas). Y toda la lógica usa solo la salida del segundo.</p>`,
    inThisProject: `
      <p>Dos flip-flops en cadena: ${L('sync_reg')} <code>[1:0]</code>, con <code>sync_reg &lt;= {sync_reg[0], i_async}</code>. La salida ${L('o_sync')} es <code>sync_reg[1]</code>. El costo es 2 ciclos de latencia (40 ns a 50 MHz), irrelevante frente al bit de la UART (~52 &micro;s).</p>
      <p>El atributo <code>(* ASYNC_REG = "TRUE" *)</code> le avisa a Vivado que ese par es un sincronizador: lo coloca en el mismo slice (cableado corto, más tiempo para resolver) y no hace análisis de timing sobre la entrada asincrónica.</p>
      <p>No tiene reset: arranca en <code>INIT</code> (valor cargado por el bitstream). Se lo usa dos veces: en el top con <code>INIT = 1</code> para la línea RX (el reposo de la UART es 1), y dentro de <code>reset_gen</code> como <code>u_btn_sync</code> (también <code>INIT = 1</code>, para que el reset arranque activo).</p>`,
    whyThisChoice: `
      <p><b>2 FFs vs 3.</b> Con reloj de 50 MHz y una entrada a 19200 baud, dos etapas dan un MTBF enorme; una tercera etapa solo se justifica a frecuencias mucho mayores. <b>1 FF no alcanza</b> porque ese único FF alimentaría lógica directamente.</p>
      <p><b>Sin reset en los FFs.</b> Un reset sincrónico sobre un sincronizador agregaría una compuerta delante del primer FF, justo en el camino que se quiere corto; por eso se usa <code>INIT</code>.</p>
      <p><b>Solo vale para señales de 1 bit.</b> Un bus asincrónico no se puede sincronizar bit a bit (los bits podrían resolverse en ciclos distintos); haría falta un handshake o un FIFO asincrónico.</p>`,
  },
  refs: [
    { label: 'sync_reg', sym: 'sync_reg' },
    { label: 'o_sync', sym: 'o_sync' },
    { label: 'INIT', sym: 'param:INIT' },
  ],
  grid: [9, 4],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del dominio destino.'),
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
