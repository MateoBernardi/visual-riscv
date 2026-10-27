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
      <p>Un programa es una lista de instrucciones que tiene que estar guardada en algún lado antes de ejecutarse. El procesador necesita, en cada ciclo, acceder a "la instrucción número N" casi instantáneamente: eso es una <b>memoria</b>, un arreglo de palabras direccionable. Como el PC habla en bytes pero cada instrucción mide 4 bytes, la memoria se organiza en palabras de 32 bits y se indexa descartando los 2 bits bajos de la dirección.</p>
      <p>Hay un segundo problema: alguien tiene que <i>poner</i> el programa en esa memoria. Un procesador dedicado podría tenerlo grabado, pero un sistema de desarrollo necesita cargar programas nuevos sin resintetizar la FPGA. Hace falta un segundo acceso, de escritura, que no tenga nada que ver con el camino de ejecución del CPU.</p>
      <p>Una cuestión más sutil es qué ve el CPU antes de que haya un programa. Si la memoria arranca con valores arbitrarios, el procesador ejecutaría basura. Conviene que el contenido inicial sea inofensivo: una instrucción que no haga nada, el NOP.</p>
      <p>Finalmente, separar la memoria de instrucciones de la de datos (arquitectura Harvard) permite que IF lea una instrucción y MEM acceda a un dato en el mismo ciclo, evitando un riesgo estructural.</p>`,
    inThisProject: `
      <p>Es ${g('module:imem', 'imem')} (instancia <code>u_imem</code>), parametrizada por <code>ADDR_W</code> (por defecto 10, o sea 2<sup>10</sup> bytes = 1 KB = 256 palabras) y un <code>INIT_FILE</code> opcional para simulación.</p>
      <ul>
        <li><b>Lectura combinacional</b>: <code>assign instr = mem[addr[ADDR_W-1:2]]</code>. No hay registro de salida; la instrucción aparece en el mismo ciclo en que el PC cambia. Se descartan los 2 bits bajos y también los bits altos del PC: un PC fuera del rango <i>da la vuelta</i> (wrap-around) sin error.</li>
        <li><b>Arranque</b>: un bloque <code>initial</code> llena todo con ${g('NOP')} (<code>0x00000013</code>) y, si hay <code>INIT_FILE</code>, lo pisa con <code>$readmemh</code>.</li>
        <li><b>Puerto de escritura de bytes</b>: <code>wr_en</code>, <code>wr_addr</code>, <code>wr_data[7:0]</code>. La palabra se calcula con ${g('wr_word')} (<code>wr_addr[ADDR_W-1:2]</code>) y un <code>case (wr_addr[1:0])</code> escribe uno de los 4 bytes (little-endian: el byte k del programa cae en la dirección k). Lo usa la debug unit para cargar el programa que llega por UART, de a un byte.</li>
        <li>La escritura <b>no depende de <code>en</code></b> (el pausado del CPU): el CPU está en reset mientras se carga.</li>
      </ul>`,
    whyThisChoice: `
      <p>La lectura combinacional (distribuida en LUTRAM) mantiene el fetch en un solo ciclo y evita una etapa extra; la contrapartida es que consume LUTs de la FPGA y limita el tamaño (1 KB). La alternativa es una <b>BRAM síncrona</b>: más capacidad por área, pero la instrucción llega un ciclo después de presentar la dirección, y el pipeline tiene que adelantar la dirección o aceptar una etapa más (así lo hacen VexRiscv y Rocket). Con esa BRAM además hay que decidir cómo congelar IF durante un stall.</p>
      <p>Otras variantes: una <b>memoria unificada</b> Von Neumann (hazard estructural entre IF y MEM, ver la memoria de datos), una <b>I-cache con prefetch</b> para memorias externas lentas (Cortex-A, Ibex) y el soporte de <b>instrucciones comprimidas (C)</b>, que complicaría el fetch por el desalineamiento. El puerto de escritura es de bytes porque la UART entrega de a un byte; a cambio hay que decodificar 4 casos de carril.</p>`,
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
