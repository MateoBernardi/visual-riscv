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
  ['o_dbg_addr', 16, 'Dirección de la palabra de debug que se está volcando (0..88).', null],
  ['o_dbg_word', 32, 'Palabra capturada, que se va desplazando byte a byte hacia TX.', null],
  ['o_byte_idx', 2, 'Cuál de los 4 bytes de la palabra se está enviando.', null],
];

const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });
const ports = [
  P('i_clk', 'in', 1, 'b', 'clk (70 MHz)', 'Reloj; todos los registros capturan en <code>posedge i_clk</code>.'),
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
      <p>Lo combinacional no recuerda nada. En el patrón próximo valor / valor actual, la lógica calcula <code>x_next</code> y un bloque secuencial hace <code>x &lt;= x_next</code> en cada flanco. Con reset a cero, el estado 0 es IDLE: la máquina siempre arranca esperando un comando.</p>`,
    inThisProject: `
      <ul>
        <li>14 registros: el estado, el modo (<code>run</code>, <code>step</code>, <code>cpu_rst</code>), la carga y el volcado.</li>
        <li><code>o_step</code> y <code>o_cpu_rst</code> son pulsos (la FSM los pone en 0 por defecto); <code>o_run</code> se mantiene.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>El puerto de la imem sale de registros</b>: el write-enable no puede tener glitches. El ciclo de latencia no importa, porque la FSM va al ritmo de la UART.</p>
      <p>Un módulo con solo registros deja en un lugar todo lo que la debug unit recuerda; el resto es combinacional.</p>`,
  },
  refs: [{ label: 'always (reset)', sym: 'o_state' }, { label: 'o_imem_we', sym: 'o_imem_we' }],
  grid: [12, 8],
  ports,
  parts,
  nets,
};
