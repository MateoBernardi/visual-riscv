import { githubUrl } from '../repo.js';

const F = 'uart/fifo.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'fifo',
  module: 'fifo',
  file: F,
  instance: 'RX_FIFO',
  parent: 'uart_core',
  blockIds: [],
  title: 'fifo (cola circular)',
  stage: null,
  kind: 'mixed',
  explain: {
    firstPrinciples: `
      <p>Cuando un productor y un consumidor trabajan a ritmos distintos (acá, una UART que entrega un byte cada 520 &micro;s y una FSM que lo consume en un ciclo de 20 ns, o al revés al transmitir), hace falta un <b>buffer</b> en el medio. La cola FIFO (First In, First Out) respeta el orden: el primero que entra es el primero que sale. Con ella el productor no necesita que el consumidor esté listo en el mismo instante.</p>
      <p>Implementarla con un arreglo de N palabras y dos punteros es barato: <code>write_ptr</code> indica dónde se guardará el próximo dato; <code>read_ptr</code>, de dónde se sacará el próximo. Al escribir se incrementa <code>write_ptr</code>; al leer, <code>read_ptr</code>. Cuando un puntero pasa de la última posición, vuelve a la primera: es un buffer <b>circular</b>. Si el arreglo tiene 2<sup>k</sup> posiciones y los punteros k bits, el "dar la vuelta" ocurre solo por desbordamiento del contador, sin comparadores.</p>
      <p>Queda un problema clásico: cuando <code>write_ptr == read_ptr</code>, ¿la cola está vacía o llena? Los punteros no lo distinguen. Tres soluciones: un bit extra por puntero, un contador de ocupación, o <b>dos flags registrados</b> (<code>full</code> y <code>empty</code>) que se actualizan según la última operación. Este diseño usa la tercera: es una pequeña máquina de estados implícita.</p>
      <p>Las banderas no son un lujo: son el <b>handshake</b> de la cola. El productor consulta <code>full</code> para no pisar datos; el consumidor consulta <code>empty</code> para no leer basura.</p>`,
    inThisProject: `
      <p>Parámetros: <code>NB_DATA = 8</code> y <code>PTR_LEN = 2</code> (el top lo pasa así; el default del módulo es 4): ${L('array')} de 2<sup>2</sup> = 4 bytes. Se instancia <b>dos veces</b> en <code>uart_core</code>: <code>RX_FIFO</code> (escribe <code>rx_done</code> con el byte recibido; lee la debug unit) y <code>TX_FIFO</code> (escribe la debug unit; lee <code>tx_done</code>). Esta vista describe el módulo; las dos instancias son idénticas.</p>
      <p><b>Escritura.</b> ${L('write_enable')} = <code>i_write_fifo &amp; ~full</code> habilita la escritura síncrona en <code>array[write_ptr]</code>: si está llena, el byte nuevo se pierde. <b>Lectura.</b> ${L('o_data_to_read')} = <code>array[read_ptr]</code>, lectura asincrónica ("show-ahead"): la cabeza ya está en el puerto de salida antes de pedirla; <code>i_read_fifo</code> solo hace el pop.</p>
      <p><b>Estados implícitos.</b> Los flags registrados ${L('full')} y ${L('empty')} definen tres estados: VACÍA (<code>empty = 1</code>, reset), INTERMEDIA y LLENA (<code>full = 1</code>). El bloque combinacional examina <code>{i_write_fifo, i_read_fifo}</code> con un <code>case</code> (<code>READ</code> = 01, <code>WRITE</code> = 10, <code>READWRITE</code> = 11):</p>
      <ul>
        <li><b>READ</b> y no vacía: <code>read_ptr_next = read_ptr + 1</code>, <code>full_next = 0</code>, y si <code>read_ptr_ok == write_ptr</code> entonces <code>empty_next = 1</code> (se leyó el último).</li>
        <li><b>WRITE</b> y no llena: <code>write_ptr_next = write_ptr + 1</code>, <code>empty_next = 0</code>, y si <code>write_ptr_ok == read_ptr</code> entonces <code>full_next = 1</code>.</li>
        <li><b>READWRITE</b>: ambos punteros avanzan y los flags no cambian (la ocupación no varía).</li>
      </ul>
      <p><b>Observación de fidelidad.</b> En <code>READWRITE</code> no se mira <code>full</code> ni <code>empty</code>. En este sistema nunca se pide leer una cola vacía (la debug unit lee con <code>~rx_empty</code> y TX hace pop solo después de haber tomado un byte), pero con la cola de RX llena y un byte llegando justo al mismo tiempo que se lee, <code>write_enable</code> es 0 y el dato se pierde mientras <code>write_ptr</code> avanza. Para el protocolo (un comando y su respuesta) no ocurre.</p>`,
    whyThisChoice: `
      <p><b>Flags registrados vs. comparar punteros combinacionalmente.</b> Los flags registrados salen directo de un flip-flop (rápidos y sin glitches) y son las señales que cruzan al otro módulo. A cambio, cada caso debe calcular el flag siguiente con un <code>case</code> explícito.</p>
      <p><b>Arreglo con lectura asincrónica.</b> 4 &times; 8 bits cabe en lógica distribuida (LUT RAM): no consume BRAM. La lectura asincrónica evita un ciclo de latencia en la cabeza; con una BRAM síncrona haría falta un paso extra.</p>
      <p><b>4 posiciones.</b> Sobra para un protocolo de pedido/respuesta. La profundidad es un parámetro (<code>PTR_LEN</code>), así que subirla es cambiar un número. La alternativa de FIFO profundo con almacenamiento de un dump completo (346 bytes) evitaría la contrapresión pero cuesta una BRAM.</p>
      <p><b>Un solo reloj.</b> No es un FIFO asincrónico (con punteros Gray): productor y consumidor comparten <code>i_clk</code>, porque ya se sincronizó la entrada de la UART.</p>`,
  },
  refs: [
    { label: 'array', sym: 'array' },
    { label: 'write_enable', sym: 'write_enable' },
    { label: 'case READ', sym: 'case:READ' },
    { label: 'case WRITE', sym: 'case:WRITE' },
    { label: 'case READWRITE', sym: 'case:READWRITE' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj.'),
    P('i_reset', 'in', 1, 'b', 'sys_reset', 'Reset sincrónico: punteros a 0, <code>full</code>=0, <code>empty</code>=1.'),
    P('i_read_fifo', 'in', 1, 'l', 'RX_FIFO: i_read_uart (debug) / TX_FIFO: tx_done (TX)', 'Pop de la cabeza.'),
    P('i_write_fifo', 'in', 1, 'l', 'RX_FIFO: rx_done (RX) / TX_FIFO: i_write_uart (debug)', 'Push de <code>i_data_to_write</code>.'),
    P('i_data_to_write', 'in', 8, 'l', 'RX_FIFO: rx_data_out (RX) / TX_FIFO: i_data_to_write (debug)', 'Dato a guardar.'),
    P('o_fifo_is_empty', 'out', 1, 'r', 'RX_FIFO: debug / TX_FIFO: tx_not_empty (TX)', 'Cola vacía.'),
    P('o_fifo_is_full', 'out', 1, 'r', 'RX_FIFO: sin uso / TX_FIFO: debug', 'Cola llena.'),
    P('o_data_to_read', 'out', 8, 'r', 'RX_FIFO: debug / TX_FIFO: TX', 'Dato de la cabeza.'),
  ],
  parts: [
    { id: 'array', kind: 'regArray', label: 'array[4]', width: 8, depth: 4, symbol: 'array', at: [5, 3], size: [3, 3],
      desc: '<p>Almacenamiento: 2<sup>PTR_LEN</sup> palabras de <code>NB_DATA</code> bits. Escritura síncrona; lectura asincrónica en <code>read_ptr</code>.</p>' },
    { id: 'write_enable', kind: 'logic', label: 'i_write & ~full', width: 1, symbol: 'write_enable', at: [1, 0], size: [3, 1],
      desc: '<p>Habilita la escritura sólo si hay lugar: el dato que llega con la cola llena se descarta.</p>' },
    { id: 'write_ptr', kind: 'reg', label: 'write_ptr', width: 2, symbol: 'write_ptr', at: [1, 3], size: [3, 1],
      desc: '<p>Dónde se guardará el próximo dato. Con <code>PTR_LEN</code> bits, vuelve a 0 por desborde.</p>' },
    { id: 'read_ptr', kind: 'reg', label: 'read_ptr', width: 2, symbol: 'read_ptr', at: [1, 5], size: [3, 1],
      desc: '<p>De dónde se lee la cabeza. Apunta al dato más viejo.</p>' },
    { id: 'write_ptr_ok', kind: 'adder', label: 'write_ptr + 1', width: 2, symbol: 'write_ptr_ok', at: [1, 7], size: [2, 1],
      desc: '<p>Candidato a puntero de escritura siguiente; también se compara con <code>read_ptr</code> para detectar "llena".</p>' },
    { id: 'read_ptr_ok', kind: 'adder', label: 'read_ptr + 1', width: 2, symbol: 'read_ptr_ok', at: [4, 7], size: [2, 1],
      desc: '<p>Candidato a puntero de lectura siguiente; se compara con <code>write_ptr</code> para detectar "vacía".</p>' },
    { id: 'full_next', kind: 'fsm', label: 'case {write,read} → *_next', width: 1, symbol: 'full_next', at: [9, 3], size: [3, 3],
      desc: '<p>El bloque combinacional que calcula <code>write_ptr_next</code>, <code>read_ptr_next</code>, <code>full_next</code> y <code>empty_next</code> según <code>READ</code> / <code>WRITE</code> / <code>READWRITE</code>. Es la FSM implícita de tres estados (vacía / intermedia / llena).</p>' },
    { id: 'full', kind: 'ff', label: 'full', width: 1, symbol: 'full', at: [11, 0], size: [2, 1],
      desc: '<p>Flag registrado "cola llena" (reset 0).</p>' },
    { id: 'empty', kind: 'ff', label: 'empty', width: 1, symbol: 'empty', at: [11, 7], size: [2, 1],
      desc: '<p>Flag registrado "cola vacía" (reset 1).</p>' },
    { id: 'o_data_to_read', kind: 'mux', label: 'array[read_ptr]', width: 8, symbol: 'o_data_to_read', at: [9, 7], size: [1, 1],
      desc: '<p>Mux de lectura asincrónico: la cabeza siempre está en la salida.</p>' },
  ],
  nets: [
    { id: 'n_write_in', from: 'port:i_write_fifo', to: 'write_enable', name: 'i_write_fifo', width: 1, desc: '<p>Pedido de escritura del productor.</p>' },
    { id: 'n_full_we', from: 'full', to: 'write_enable', name: 'full', width: 1, desc: '<p>Bloquea la escritura con la cola llena.</p>' },
    { id: 'n_we', from: 'write_enable', to: 'array', name: 'write_enable', width: 1, desc: '<p>Habilita escribir <code>array[write_ptr]</code> en el flanco.</p>' },
    { id: 'n_data_in', from: 'port:i_data_to_write', to: 'array', name: 'i_data_to_write', width: 8, desc: '<p>Dato a guardar.</p>' },
    { id: 'n_wptr_array', from: 'write_ptr', to: 'array', name: 'write_ptr', width: 2, desc: '<p>Posición de escritura.</p>' },
    { id: 'n_rptr_mux', from: 'read_ptr', to: 'o_data_to_read', name: 'read_ptr', width: 2, desc: '<p>Posición de lectura.</p>' },
    { id: 'n_array_mux', from: 'array', to: 'o_data_to_read', name: 'array', width: 8, desc: '<p>Contenido del arreglo hacia el mux de lectura.</p>' },
    { id: 'n_data_out', from: 'o_data_to_read', to: 'port:o_data_to_read', name: 'o_data_to_read', width: 8, desc: '<p>La cabeza de la cola, sin necesidad de pedirla.</p>' },
    { id: 'n_wptr_ok', from: 'write_ptr', to: 'write_ptr_ok', name: 'write_ptr', width: 2, desc: '<p>Para calcular <code>write_ptr + 1</code>.</p>' },
    { id: 'n_rptr_ok', from: 'read_ptr', to: 'read_ptr_ok', name: 'read_ptr', width: 2, desc: '<p>Para calcular <code>read_ptr + 1</code>.</p>' },
    { id: 'n_wok_next', from: 'write_ptr_ok', to: 'full_next', name: 'write_ptr_ok', width: 2, desc: '<p>Si tras escribir <code>write_ptr_ok == read_ptr</code>, la cola queda llena.</p>' },
    { id: 'n_rok_next', from: 'read_ptr_ok', to: 'full_next', name: 'read_ptr_ok', width: 2, desc: '<p>Si tras leer <code>read_ptr_ok == write_ptr</code>, la cola queda vacía.</p>' },
    { id: 'n_read_in', from: 'port:i_read_fifo', to: 'full_next', name: 'i_read_fifo', width: 1, desc: '<p>Junto con <code>i_write_fifo</code> forma el selector <code>{write, read}</code> del <code>case</code>.</p>' },
    { id: 'n_next_full', from: 'full_next', to: 'full', name: 'full_next', width: 1, desc: '<p>Próximo valor del flag de lleno.</p>' },
    { id: 'n_next_empty', from: 'full_next', to: 'empty', name: 'empty_next', width: 1, desc: '<p>Próximo valor del flag de vacío.</p>' },
    { id: 'n_next_wptr', from: 'full_next', to: 'write_ptr', name: 'write_ptr_next', width: 2, desc: '<p>Próximo puntero de escritura (avanza en WRITE y READWRITE).</p>' },
    { id: 'n_next_rptr', from: 'full_next', to: 'read_ptr', name: 'read_ptr_next', width: 2, desc: '<p>Próximo puntero de lectura (avanza en READ y READWRITE).</p>' },
    { id: 'n_full_out', from: 'full', to: 'port:o_fifo_is_full', name: 'o_fifo_is_full', width: 1, desc: '<p><code>assign o_fifo_is_full = full</code>. Para el productor.</p>' },
    { id: 'n_empty_out', from: 'empty', to: 'port:o_fifo_is_empty', name: 'o_fifo_is_empty', width: 1, desc: '<p><code>assign o_fifo_is_empty = empty</code>. Para el consumidor.</p>' },
  ],
};
