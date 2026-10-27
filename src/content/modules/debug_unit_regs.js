import { githubUrl } from '../repo.js';

const F = 'debug/debug_unit_regs.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;

// [nombre del reg (o_X), ancho, descripción, live]
const REGS = [
  ['o_state', 4, 'Estado de la FSM. Se reinicia a 0 = IDLE.', 'dbg.stateCode'],
  ['o_run', 1, 'Modo de ejecución continua (comando R).', 'dbg.run'],
  ['o_step', 1, 'Pulso de un ciclo del comando S: habilita un único flanco del CPU.', 'dbg.step'],
  ['o_cpu_rst', 1, 'Pulso de un ciclo del comando X: resetea el CPU.', null],
  ['o_len', 16, 'Cantidad de instrucciones a cargar (n), recibida en dos bytes.', null],
  ['o_byte_cnt', 18, 'Cuenta de bytes del programa y del relleno. Es también la dirección de imem.', null],
  ['o_overflow', 1, 'El programa no entra: la carga contesta E en vez de K.', null],
  ['o_reply', 8, 'Último código de respuesta (K, E, H o ?) a transmitir en REPLY.', null],
  ['o_imem_we', 1, 'Write-enable de imem, registrado: la escritura llega un ciclo después de la decisión.', null],
  ['o_imem_addr', 10, 'Dirección en bytes de imem (IMEM_ADDR_W bits).', null],
  ['o_imem_data', 8, 'Byte a escribir en imem.', null],
  ['o_dbg_addr', 16, 'Dirección de la palabra de debug que se está volcando (0..85).', null],
  ['o_dbg_word', 32, 'Palabra capturada, que se va desplazando byte a byte hacia TX.', null],
  ['o_byte_idx', 2, 'Cuál de los 4 bytes de la palabra se está enviando.', null],
];

const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });
const ports = [
  P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj; todos los registros capturan en <code>posedge i_clk</code>.'),
  P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset <b>sincrónico</b> activo en alto: todo a 0.'),
  ...REGS.map(([r, w, d]) => P('i_' + r.slice(2) + '_next', 'in', w, 'l', 'COMB / FSM', 'Próximo valor de <code>' + r + '</code>.')),
  ...REGS.map(([r, w, d]) => P(r, 'out', w, 'r', r === 'o_state' ? 'FSM' : (r.startsWith('o_imem') ? 'imem' : (r === 'o_dbg_addr' ? 'pc' : 'FSM / COMB')), d)),
];

const parts = REGS.map(([r, w, d, live], i) => {
  const col = i < 7 ? 1 : 7; const row = i % 7;
  const p = { id: r, kind: 'reg', label: r + (w > 1 ? ' [' + (w === 10 ? 'IMEM_ADDR_W' : w) + ']' : ''), width: w, symbol: r, at: [col, row], size: [4, 1], desc: '<p>' + d + '</p>' };
  if (live) p.live = live;
  return p;
});

const nets = [
  { id: 'n_clk', from: 'port:i_clk', to: 'o_state', name: 'i_clk', width: 1, desc: '<p>El mismo reloj entra a los 14 registros: un único <code>always @(posedge i_clk)</code>.</p>' },
  { id: 'n_reset', from: 'port:i_reset', to: 'o_state', name: 'i_reset', width: 1, desc: '<p>Reset sincrónico: en el flanco, si vale 1, <b>todos</b> los registros toman 0 (y el estado queda en IDLE).</p>' },
  ...REGS.map(([r, w]) => ({ id: 'n_in_' + r, from: 'port:i_' + r.slice(2) + '_next', to: r, name: 'i_' + r.slice(2) + '_next', width: w, desc: '<p>Próximo valor, calculado por la FSM o por COMB. Se captura en el flanco si no hay reset.</p>' })),
  ...REGS.map(([r, w, d, live]) => { const n = { id: 'n_out_' + r, from: r, to: 'port:' + r, name: r, width: w, desc: '<p>' + d + '</p>' }; if (live) n.live = live; return n; }),
];

export default {
  id: 'debug_unit_regs',
  module: 'debug_unit_regs',
  file: F,
  instance: 'REGS',
  parent: 'debug_unit',
  blockIds: [],
  title: 'debug_unit_regs (registros)',
  stage: null,
  kind: 'seq',
  explain: {
    firstPrinciples: `
      <p>La lógica combinacional no recuerda nada: si cambian sus entradas, cambia su salida. Para que una FSM recuerde "en qué paso estoy" o para que un contador conserve su cuenta, hace falta <b>memoria</b>: flip-flops que copian su entrada en cada flanco del reloj y la mantienen hasta el siguiente. Un conjunto de flip-flops que guardan un valor se llama <b>registro</b>.</p>
      <p>En el patrón "próximo valor / valor actual", la lógica combinacional calcula <code>x_next</code> a partir de <code>x</code> y de las entradas, y un bloque secuencial hace <code>x &lt;= x_next</code> en cada flanco. Esto da al diseño un ritmo claro: dentro de un ciclo todo es cálculo, y el cambio de estado ocurre de golpe en el flanco. Como la lógica nunca escribe el registro directamente, no hay lazos combinacionales.</p>
      <p>Hay que decidir además qué pasa al arrancar. Un registro sin reset arranca en un valor desconocido; con un <b>reset sincrónico</b>, el flanco de reloj con <code>i_reset = 1</code> fuerza un valor conocido. Acá todos se reinician a cero y esa elección está pensada: el valor 0 de <code>o_state</code> es IDLE, así la máquina siempre arranca esperando un comando.</p>`,
    inThisProject: `
      <p>Un único <code>always @(posedge i_clk)</code>: si ${L('i_reset')} todos los registros valen 0 (incluido ${L('o_state')} = IDLE y ${L('o_imem_we')} = 0, para no escribir la imem al arrancar); si no, cada uno toma su valor <code>*_next</code>.</p>
      <p>Hay 14 registros: la FSM (<code>o_state</code>, 4 bits), tres de modo (<code>o_run</code>, <code>o_step</code>, <code>o_cpu_rst</code>), y datos de la carga (<code>o_len</code> 16, <code>o_byte_cnt</code> 18, <code>o_overflow</code>, <code>o_reply</code> 8, y el puerto de imem registrado <code>o_imem_we / o_imem_addr / o_imem_data</code>) y del dump (<code>o_dbg_addr</code> 16, <code>o_dbg_word</code> 32, <code>o_byte_idx</code> 2).</p>
      <p><code>o_step</code> y <code>o_cpu_rst</code> son pulsos de un ciclo: la FSM los pone en 0 por defecto, así que al ciclo siguiente vuelven solos a 0. <code>o_run</code>, en cambio, se mantiene hasta que la FSM lo baje. El puerto hacia la imem y <code>o_dbg_addr</code> salen directo de estos registros, por eso son estables todo el ciclo.</p>`,
    whyThisChoice: `
      <p><b>Reset sincrónico vs. asincrónico.</b> El sincrónico no necesita una conexión especial en la FPGA y deja el timing más sencillo; el costo es que se necesita reloj corriendo para que el reset surta efecto, algo que acá siempre ocurre.</p>
      <p><b>Registrar el puerto de imem.</b> Si <code>imem_we/addr/data</code> salieran directo de la FSM (combinacional), el write-enable podría tener glitches y el camino hacia la memoria sumaría retardo. Registrarlos agrega un ciclo de latencia pero garantiza señales limpias; la FSM lo compensa porque se mueve a la velocidad de la UART, muy inferior al reloj.</p>
      <p><b>Un módulo solo con registros.</b> Parece trivial, pero es la forma de dejar visible en un solo lugar <i>todo lo que la debug unit recuerda</i> (estado, modo, datos) y de que todo el resto sea combinacional sin latches.</p>`,
  },
  refs: [{ label: 'always (reset)', sym: 'o_state' }, { label: 'o_imem_we', sym: 'o_imem_we' }],
  grid: [12, 8],
  ports,
  parts,
  nets,
};
