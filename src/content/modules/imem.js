import { githubUrl } from '../repo.js';

const F = 'pipeline/1_fetch/imem.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.depth ? { depth: o.depth } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'imem',
  module: 'imem',
  file: F,
  instance: 'u_imem',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_imem',
  blockIds: ['imem'],
  title: 'Memoria de instrucciones',
  stage: 'IF',
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>El programa tiene que estar en una memoria que IF pueda leer cada ciclo. Separarla de la de datos (Harvard) evita que IF y MEM se peleen por el mismo puerto. Y hace falta un segundo acceso, de escritura, para cargar programas sin resintetizar.</p>`,
    inThisProject: `
      <ul>
        <li>Arranca llena de ${g('NOP')}: un CPU sin programa no ejecuta basura.</li>
        <li>Un PC fuera de la imem no se ejecuta: ID lo marca como trap (causa 1).</li>
        <li>La escritura no depende de <code>en</code>: el CPU está en reset mientras se carga.</li>
      </ul>`,
    whyThisChoice: `
      <p><b>Lectura combinacional</b> (LUTRAM): la instrucción sale en el mismo ciclo, así el fetch es una sola etapa. Con una BRAM síncrona llegaría un ciclo tarde y habría que adelantar la dirección o sumar una etapa. El costo es el tamaño: 1 KB.</p>
      <p><b>Escritura por bytes</b> porque la UART entrega de a un byte; ensamblar palabras afuera agregaría estado a la debug unit.</p>`,
  },
  refs: [
    { label: 'imem', sym: 'module:imem' },
    { label: 'instr', sym: 'assign:instr' },
    { label: 'NOP', sym: 'NOP' },
    { label: 'wr_word', sym: 'wr_word' },
    { label: 'mem', sym: 'reg:mem' },
  ],
  grid: [9, 6],
  ports: [
    { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'reloj', desc: 'Reloj. Solo se usa para la escritura; la lectura no depende del reloj.' },
    { name: 'addr', dir: 'in', width: 32, side: 'l', ext: 'pc', desc: 'Dirección de byte del PC.' },
    { name: 'instr', dir: 'out', width: 32, side: 'r', ext: 'ifid', desc: 'Instrucción leída (combinacional).' },
    { name: 'wr_en', dir: 'in', width: 1, side: 'b', ext: 'debug', desc: 'Escribe un byte en este ciclo.' },
    { name: 'wr_addr', dir: 'in', width: 'ADDR_W', side: 'b', ext: 'debug', desc: 'Dirección de byte a escribir.' },
    { name: 'wr_data', dir: 'in', width: 8, side: 'b', ext: 'debug', desc: 'Byte a escribir.' },
  ],
  parts: [
    P('NOP', 'const', 'NOP 0x13', 32, [0, 4], [2, 1], 'Localparam con <code>32\'h0000_0013</code> (<code>addi x0, x0, 0</code>). La memoria arranca llena de NOPs, así que ejecutar "más allá" del programa no hace nada.'),
    P('wr_word', 'logic', 'wr_word', 8, [2, 3], [2, 1], 'Índice de palabra para la escritura: <code>wr_addr[ADDR_W-1:2]</code>. Convierte la dirección de byte en dirección de palabra.'),
    P('wr_lane', 'decoder', 'case wr_addr[1:0]', 2, [2, 5], [2, 1], 'Selecciona cuál de los 4 bytes de la palabra se escribe (0 → [7:0], 1 → [15:8], 2 → [23:16], 3 → [31:24]). Es un <code>case</code> dentro del <code>always @(posedge clk)</code>.', { symbol: null }),
    P('mem', 'regArray', 'mem[256]', 32, [5, 1], [2, 4], 'Arreglo de <code>DEPTH</code> palabras de 32 bits (<code>DEPTH = 1 &lt;&lt; (ADDR_W-2)</code>). Little-endian: el byte 0 del programa es el [7:0] de la palabra 0.', { depth: 256 }),
    P('instr', 'logic', 'instr', 32, [8, 2], [1, 1], '<code>assign instr = mem[addr[ADDR_W-1:2]]</code>: la lectura asincrónica por palabra.', { live: 'snap.signals.ifInst' }),
  ],
  nets: [
    N('n_addr', 'port:addr', 'mem', 'addr', 32, 'Dirección de byte que viene del PC. Solo se usan los bits <code>[ADDR_W-1:2]</code> para indexar el arreglo.', 'snap.pc'),
    N('n_instr_read', 'mem', 'instr', 'instr', 32, 'Palabra seleccionada del arreglo.', 'snap.signals.ifInst'),
    N('n_instr', 'instr', 'port:instr', 'instr', 32, 'Va al registro IF/ID, que la captura en el próximo flanco.', 'snap.signals.ifInst'),
    N('n_wr_en', 'port:wr_en', 'wr_lane', 'wr_en', 1, 'La debug unit habilita la escritura de un byte.'),
    N('n_wr_addr', 'port:wr_addr', 'wr_word', 'wr_addr', 'ADDR_W', 'Dirección de byte; sus 2 bits bajos eligen el carril y el resto la palabra.'),
    N('n_wr_data', 'port:wr_data', 'wr_lane', 'wr_data', 8, 'Byte del programa que se escribe en el carril elegido.'),
    N('n_wr_word', 'wr_word', 'mem', 'wr_word', 8, 'Índice de palabra donde se escribe el byte.'),
    N('n_wr_lane', 'wr_lane', 'mem', 'wr_data', 8, 'El byte escrito en la posición elegida de la palabra (sin tocar los otros tres).'),
    N('n_nop', 'NOP', 'mem', 'NOP', 32, 'Valor con el que se inicializan todas las palabras al arrancar.'),
  ],
};
