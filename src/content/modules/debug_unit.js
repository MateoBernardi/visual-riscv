import { githubUrl } from '../repo.js';

const F = 'debug/debug_unit.v';
const L = (sym, t) => `<a href="${githubUrl(F, sym)}" target="_blank" rel="noopener">${t ?? sym}</a>`;
const P = (name, dir, width, side, ext, desc) => ({ name, dir, width, side, ext, desc });

export default {
  id: 'debug_unit',
  module: 'debug_unit',
  file: F,
  instance: 'u_debug',
  parent: null,
  within: 'top_riscv',
  instancePath: 'u_debug',
  blockIds: ['debug'],
  title: 'debug_unit',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Un CPU dentro de una FPGA no tiene pantalla, teclado ni disco. Y no hay un depurador JTAG a mano. Necesitamos entonces, como mínimo, dos cosas: <b>(1)</b> una forma de <b>meterle un programa</b> a la memoria de instrucciones sin volver a sintetizar, y <b>(2)</b> una forma de <b>controlar</b> su ejecución (avanzar de a un ciclo, correr, pausar, reiniciar) y de <b>mirar su estado interno</b>. El único canal con la PC que tenemos es el puerto serie.</p>
      <p>La <b>debug unit</b> es un pequeño "monitor" por hardware: una máquina de estados que lee bytes de la UART, los interpreta como comandos y actúa sobre el CPU a través de puertos dedicados (enable, reset, escritura de imem, bus de lectura de estado). El CPU ni sabe que existe: solo ve que a veces <code>i_enable</code> está en 0.</p>
      <p>Para que el diseño sea legible y no genere latches, el módulo se parte en tres, siguiendo el patrón estándar de dos procesos: <b>FSM</b> (decide el próximo estado y las señales de control, combinacional), <b>COMB</b> (calcula los próximos valores de los registros de datos, combinacional) y <b>REGS</b> (los flip-flops). Separar el "próximo valor" (combinacional) del "registro" (secuencial) hace explícito qué se guarda y qué no, y evita latches por olvidar una rama.</p>
      <p>Hay que diseñar el protocolo, y no hay uno estándar para esto. Las decisiones a tomar son: la <b>codificación</b> de los comandos (un carácter ASCII por comando, fácil de probar con una terminal), la <b>delimitación</b> de cada mensaje (comandos de un byte; la carga lleva su longitud por delante), la <b>confirmación</b> (cada comando contesta un byte, para que la PC sepa si algo se perdió) y el <b>orden de bytes</b> de las palabras de 32 bits (little-endian). Como la UART transporta de a 8 bits y el estado del CPU es mucho más ancho, hace falta también <b>serializar</b>: se recorre el vector de a una palabra, y cada palabra de a un byte con un contador que dice cuál va.</p>
      <p>Por último, la debug unit controla al CPU de manera <i>sincrónica</i>: no corta ni filtra el reloj, solo le da o le quita la habilitación (<code>cpu_enable</code>) y lo resetea (<code>cpu_reset</code>). Cargar un programa nuevo no necesita resintetizar: alcanza con escribir la memoria de instrucciones y reiniciar el pipeline, y por eso se separan dos tipos de reset: el del sistema (que también reinicia la UART) y el del CPU solo.</p>`,
    inThisProject: `
      <p>Este módulo es solo cableado: instancia ${L('FSM')}, ${L('COMB')} y ${L('REGS')} y conecta los puertos. La FSM recibe el estado actual desde REGS (<code>state</code>, <code>run</code>, <code>step</code>, <code>cpu_rst</code>, <code>overflow</code>) y las banderas de COMB (<code>len_zero</code>, <code>load_last</code>, <code>in_range</code>, <code>dbg_count_zero</code>, <code>dbg_last</code>, <code>byte_last</code>); devuelve los próximos valores y las señales de control. COMB aplica esas señales a los registros de datos y devuelve sus próximos valores; REGS los captura en <code>posedge i_clk</code>.</p>
      <p><b>Protocolo</b> (host &rarr; FPGA, un byte de comando, un byte de respuesta): <code>L</code> carga (<code>n_lo n_hi</code> y <code>4n</code> bytes little-endian; contesta <code>K</code>, o <code>E</code> si no entra), <code>S</code> un ciclo, <code>R</code> correr, <code>P</code> pausar, <code>X</code> reset del CPU (todos contestan <code>K</code>, o <code>H</code> si el CPU ya está en halt, <code>S</code> y <code>R</code>), <code>D</code> volcado (<code>count_lo count_hi</code> + <code>count</code> palabras de 32 bits little-endian; el CPU informa <code>count</code> = 86). Cualquier otro byte: <code>?</code>. Una <code>H</code> también puede llegar <b>sola</b> (espontánea) si el CPU llega a halt mientras corre.</p>
      <p><b>Garantías:</b> durante la carga el CPU queda en reset (<code>loading</code>) y al terminar queda detenido con PC = 0; lo que el programa no cubre se rellena con NOP (<code>0x00000013</code>); durante el dump el CPU está congelado (<code>~dumping</code> en <code>o_cpu_enable</code>) y al terminar vuelve al modo previo. Los puertos de salida a la imem (${L('o_imem_write_enable')}, <code>o_imem_write_addr</code>, <code>o_imem_write_data</code>) y ${L('o_dbg_addr')} salen directo de <b>registros</b>: llegan un ciclo después de la decisión de la FSM, y <code>o_dbg_addr</code> se mantiene un ciclo antes de muestrear <code>i_dbg_data</code>, útil si la fuente tuviera latencia (BRAM).</p>`,
    whyThisChoice: `
      <p><b>Monitor propio por UART vs. RISC-V Debug Spec + JTAG.</b> El estándar da halt/resume, breakpoints por hardware y acceso por GDB, pero necesita un Debug Module, un TAP JTAG y CSRs de debug; es mucho más hardware que todo el core. Acá alcanza con cargar, paso a paso, correr y volcar. <b>vs. ILA de Vivado:</b> el ILA ve señales en tiempo real pero consume BRAM, depende de la herramienta y no sirve para cargar un programa.</p>
      <p><b>Volcado completo de 86 palabras vs. lecturas puntuales.</b> Un solo comando <code>D</code> trae PC, latches, registros y dmem: el host siempre tiene una foto coherente (el CPU está congelado). Cuesta ~346 bytes por UART (&asymp; 180 ms a 19200 baud). Subir el baud rate o usar un FIFO más rápido lo bajaría, pero acopla el timing.</p>
      <p><b>FSM + COMB + REGS vs. un solo <code>always</code>.</b> Un único proceso secuencial es más corto, pero mezcla "qué hacer" con "qué se guarda" y es más fácil introducir errores de ciclo. Tres módulos cuestan más líneas pero cada uno se verifica por separado.</p>
      <p><b>CPU y reset.</b> La debug unit aporta el reset del CPU (<code>i_reset | cpu_rst | loading</code>) en lugar de conectarlo al reset del sistema, así <code>X</code> y la carga no tocan la UART.</p>`,
  },
  refs: [
    { label: 'FSM', sym: 'FSM' },
    { label: 'COMB', sym: 'COMB' },
    { label: 'REGS', sym: 'REGS' },
    { label: 'Protocolo (cabecera)', sym: 'module:debug_unit' },
  ],
  grid: [14, 9],
  ports: [
    P('i_clk', 'in', 1, 'b', 'clk (50 MHz)', 'Reloj del sistema; solo lo usa REGS.'),
    P('i_reset', 'in', 1, 'l', 'sys_reset (reset_gen)', 'Reset sincrónico del sistema. REGS lleva todo a 0; la FSM lo suma a <code>o_cpu_reset</code>.'),
    P('i_data_to_read', 'in', 8, 'l', 'uart', 'Byte en la cabeza del FIFO de RX (comando o dato).'),
    P('i_fifo_rx_empty', 'in', 1, 'l', 'uart', 'FIFO de RX vacío: no hay byte que leer.'),
    P('i_fifo_tx_full', 'in', 1, 'l', 'uart', 'FIFO de TX lleno: no se puede escribir.'),
    P('o_fifo_rx_read', 'out', 1, 'r', 'uart', 'Consumir el byte de la cabeza del FIFO de RX.'),
    P('o_fifo_tx_write', 'out', 1, 'r', 'uart', 'Encolar <code>o_data_to_write</code> en el FIFO de TX.'),
    P('o_data_to_write', 'out', 8, 'r', 'uart', 'Byte a transmitir: respuesta, cuenta del dump o byte de una palabra.'),
    P('o_cpu_enable', 'out', 1, 'r', 'pc', '1 = el CPU avanza este ciclo.'),
    P('o_cpu_reset', 'out', 1, 'r', 'pc', '1 = reset del CPU.'),
    P('i_cpu_halt', 'in', 1, 'l', 'pc', 'El CPU llegó a un halt (nivel).'),
    P('o_imem_write_enable', 'out', 1, 'r', 'imem', 'Escribir un byte en la imem (registrado).'),
    P('o_imem_write_addr', 'out', 10, 'r', 'imem', 'Dirección del byte en la imem (<code>IMEM_ADDR_W</code> bits; 10 en el top).'),
    P('o_imem_write_data', 'out', 8, 'r', 'imem', 'Byte a escribir en la imem.'),
    P('o_dbg_addr', 'out', 16, 'r', 'pc', 'Dirección de la palabra del mapa de debug a leer.'),
    P('i_dbg_data', 'in', 32, 'l', 'pc', 'Palabra del mapa de debug en <code>o_dbg_addr</code>.'),
    P('i_dbg_count', 'in', 16, 'l', 'pc', 'Cantidad de palabras del mapa (86). Lo define el CPU.'),
  ],
  parts: [
    {
      id: 'FSM', kind: 'submodule', label: 'FSM (debug_unit_fsm)', width: 4, symbol: 'FSM', at: [4, 0], size: [4, 4], drill: 'debug_unit_fsm', live: 'dbg.state',
      desc: '<p>La máquina de estados del protocolo (11 estados, 4 bits). Decodifica el comando, decide la respuesta y genera todas las señales de control. Es <b>combinacional</b>: no guarda nada, todo lo que "recuerda" está en REGS.</p>',
    },
    {
      id: 'COMB', kind: 'submodule', label: 'COMB (debug_unit_comb)', width: 1, symbol: 'COMB', at: [4, 5], size: [4, 4], drill: 'debug_unit_comb',
      desc: '<p>El camino de datos combinacional: próximos valores de <code>len</code>, <code>byte_cnt</code>, <code>reply</code>, <code>imem_*</code>, <code>dbg_*</code>, el byte que sale por TX y las banderas que la FSM necesita para decidir.</p>',
    },
    {
      id: 'REGS', kind: 'submodule', label: 'REGS (debug_unit_regs)', width: 1, symbol: 'REGS', at: [10, 2], size: [3, 5], drill: 'debug_unit_regs', live: 'dbg.stateCode',
      desc: '<p>Los flip-flops: estado de la FSM, modo (<code>run</code>, <code>step</code>, <code>cpu_rst</code>) y todos los registros de datos. Reset sincrónico: todo a 0 (IDLE = 0).</p>',
    },
  ],
  nets: [
    { id: 'n_rx_empty', from: 'port:i_fifo_rx_empty', to: 'FSM', name: 'i_fifo_rx_empty', width: 1, desc: '<p>De: UART. A: FSM (<code>i_rx_empty</code>). Para: solo leer comandos o datos cuando hay un byte.</p>' },
    { id: 'n_tx_full', from: 'port:i_fifo_tx_full', to: 'FSM', name: 'i_fifo_tx_full', width: 1, desc: '<p>De: UART. A: FSM (<code>i_tx_full</code>). Para: esperar si el FIFO de TX está lleno (contrapresión).</p>' },
    { id: 'n_rx_byte_fsm', from: 'port:i_data_to_read', to: 'FSM', name: 'i_data_to_read', width: 8, desc: '<p>De: cabeza del FIFO de RX. A: FSM (<code>i_rx_byte</code>). Para: decodificar el comando en IDLE (<code>L S R P X D</code>).</p>' },
    { id: 'n_halt', from: 'port:i_cpu_halt', to: 'FSM', name: 'i_cpu_halt', width: 1, live: 'snap.halted', desc: '<p>De: CPU. A: FSM. Para: contestar <code>H</code> en vez de <code>K</code> y apagar <code>o_cpu_enable</code>.</p>' },
    { id: 'n_reset_fsm', from: 'port:i_reset', to: 'FSM', name: 'i_reset', width: 1, desc: '<p>De: <code>sys_reset</code>. A: FSM. Para: sumarse a <code>o_cpu_reset</code> (la FSM es combinacional y no tiene reset propio).</p>' },
    { id: 'n_reset_regs', from: 'port:i_reset', to: 'REGS', name: 'i_reset', width: 1, desc: '<p>De: <code>sys_reset</code>. A: REGS. Para: reset sincrónico de todos los registros.</p>' },
    { id: 'n_clk', from: 'port:i_clk', to: 'REGS', name: 'i_clk', width: 1, desc: '<p>Reloj de los registros. FSM y COMB son combinacionales y no lo usan.</p>' },
    { id: 'n_state', from: 'REGS', to: 'FSM', name: 'state', width: 4, live: 'dbg.stateCode', desc: '<p>De: <code>o_state</code> de REGS. A: <code>i_state</code> de la FSM. Para: que la FSM sepa en qué estado está (realimentación).</p>' },
    { id: 'n_run', from: 'REGS', to: 'FSM', name: 'run', width: 1, live: 'dbg.run', desc: '<p>Grupo de modo/estado registrado hacia la FSM: <code>run</code> (ejecución continua), <code>step</code> (pulso de un ciclo), <code>cpu_rst</code> (pulso de reset de <code>X</code>) y <code>overflow</code> (el programa no entró). Sirven para <code>o_cpu_enable</code>, <code>o_cpu_reset</code> y para elegir <code>E</code>/<code>K</code>.</p>' },
    { id: 'n_state_next', from: 'FSM', to: 'REGS', name: 'state_next', width: 4, desc: '<p>De: <code>o_state_next</code> de la FSM. A: REGS. Para: el estado del próximo ciclo.</p>' },
    { id: 'n_run_next', from: 'FSM', to: 'REGS', name: 'run_next', width: 1, desc: '<p>Grupo: <code>run_next</code>, <code>step_next</code>, <code>cpu_rst_next</code> e <code>imem_we_next</code>. Cada uno entra a su flip-flop en REGS; <code>step</code>, <code>cpu_rst</code> e <code>imem_we</code> son pulsos de un ciclo (la FSM los pone en 0 por defecto).</p>' },
    { id: 'n_ctl_load', from: 'FSM', to: 'COMB', name: 'len_lo_load', width: 1, desc: '<p>Grupo de control de la <b>carga</b>: <code>len_lo_load</code>, <code>len_hi_load</code>, <code>cnt_clear</code>, <code>cnt_inc</code>, <code>ovf_load</code>, <code>imem_load</code>, <code>imem_fill</code>. Le dicen a COMB qué registro de datos actualizar (longitud, contador de bytes, overflow, dirección/dato de imem, relleno de NOP).</p>' },
    { id: 'n_reply_code', from: 'FSM', to: 'COMB', name: 'reply_code', width: 8, desc: '<p>Junto con <code>reply_load</code>: la respuesta (<code>K</code>, <code>E</code>, <code>H</code> o <code>?</code>) que COMB guarda en el registro <code>reply</code> para enviarla en REPLY.</p>' },
    { id: 'n_ctl_dump', from: 'FSM', to: 'COMB', name: 'dbg_addr_clear', width: 1, desc: '<p>Grupo de control del <b>dump</b>: <code>dbg_addr_clear</code>, <code>dbg_addr_inc</code>, <code>word_load</code>, <code>word_shift</code>, <code>byte_idx_clear</code>, <code>byte_idx_inc</code>. Manejan la dirección del bus de debug, la palabra capturada y el índice de byte.</p>' },
    { id: 'n_send', from: 'FSM', to: 'COMB', name: 'send_word', width: 1, desc: '<p>Grupo <code>send_count_lo</code>, <code>send_count_hi</code>, <code>send_word</code>: eligen en COMB qué sale por <code>o_data_to_write</code> (cuenta baja, cuenta alta, byte bajo de la palabra o <code>reply</code>).</p>' },
    { id: 'n_flags', from: 'COMB', to: 'FSM', name: 'len_zero', width: 1, desc: '<p>Grupo de banderas: <code>len_zero</code>, <code>load_last</code>, <code>in_range</code>, <code>dbg_count_zero</code>, <code>dbg_last</code>, <code>byte_last</code>. Son las condiciones de las transiciones (por ejemplo "último byte del programa" o "última palabra del dump").</p>' },
    { id: 'n_regs_load', from: 'REGS', to: 'COMB', name: 'byte_cnt', width: 18, desc: '<p>Registros de la carga hacia COMB: <code>len</code>, <code>byte_cnt</code>, <code>overflow</code>, <code>reply</code>, <code>imem_addr</code>, <code>imem_data</code>. COMB calcula con ellos el próximo valor y las banderas.</p>' },
    { id: 'n_regs_dump', from: 'REGS', to: 'COMB', name: 'dbg_word', width: 32, desc: '<p>Registros del dump hacia COMB: <code>dbg_addr</code>, <code>dbg_word</code>, <code>byte_idx</code>.</p>' },
    { id: 'n_next_load', from: 'COMB', to: 'REGS', name: 'byte_cnt_next', width: 18, desc: '<p>Próximos valores de la carga: <code>len_next</code>, <code>byte_cnt_next</code>, <code>overflow_next</code>, <code>reply_next</code>, <code>imem_addr_next</code>, <code>imem_data_next</code>.</p>' },
    { id: 'n_next_dump', from: 'COMB', to: 'REGS', name: 'dbg_word_next', width: 32, desc: '<p>Próximos valores del dump: <code>dbg_addr_next</code>, <code>dbg_word_next</code>, <code>byte_idx_next</code>.</p>' },
    { id: 'n_rx_byte_comb', from: 'port:i_data_to_read', to: 'COMB', name: 'i_data_to_read', width: 8, desc: '<p>De: FIFO de RX. A: COMB (<code>i_rx_byte</code>). Para: ser el byte de longitud o de programa que se guarda (<code>len</code>, <code>imem_data</code>).</p>' },
    { id: 'n_dbg_data', from: 'port:i_dbg_data', to: 'COMB', name: 'i_dbg_data', width: 32, desc: '<p>De: CPU. A: COMB. Para: capturarla en <code>dbg_word</code> cuando <code>word_load = 1</code> (estado DUMP_LATCH).</p>' },
    { id: 'n_dbg_count', from: 'port:i_dbg_count', to: 'COMB', name: 'i_dbg_count', width: 16, desc: '<p>De: CPU. A: COMB. Para: los dos bytes de cuenta que abren el dump y para detectar la última palabra (<code>dbg_last</code>).</p>' },
    { id: 'n_tx_data', from: 'COMB', to: 'port:o_data_to_write', name: 'o_data_to_write', width: 8, desc: '<p>De: mux <code>o_tx_data</code> de COMB. A: UART. Para: el byte que se encola cuando <code>o_fifo_tx_write = 1</code>.</p>' },
    { id: 'n_rx_read', from: 'FSM', to: 'port:o_fifo_rx_read', name: 'o_fifo_rx_read', width: 1, desc: '<p>De: FSM (combinacional). A: UART. Para: consumir el byte en el mismo ciclo en que se lo decodifica.</p>' },
    { id: 'n_tx_write', from: 'FSM', to: 'port:o_fifo_tx_write', name: 'o_fifo_tx_write', width: 1, desc: '<p>De: FSM. A: UART. Para: escribir <code>o_data_to_write</code> en el FIFO de TX (solo si <code>~tx_full</code>).</p>' },
    { id: 'n_cpu_enable', from: 'FSM', to: 'port:o_cpu_enable', name: 'o_cpu_enable', width: 1, live: 'dbg.cpuEnable', desc: '<p>De: FSM. A: CPU. <code>(run | step) &amp; ~cpu_halt &amp; ~dumping</code>.</p>' },
    { id: 'n_cpu_reset', from: 'FSM', to: 'port:o_cpu_reset', name: 'o_cpu_reset', width: 1, live: 'dbg.cpuReset', desc: '<p>De: FSM. A: CPU. <code>i_reset | cpu_rst | loading</code>.</p>' },
    { id: 'n_imem_we', from: 'REGS', to: 'port:o_imem_write_enable', name: 'o_imem_write_enable', width: 1, desc: '<p>De: registro <code>imem_we</code>. A: imem del CPU. Para: escribir un byte (un ciclo después de que la FSM lo decidió).</p>' },
    { id: 'n_imem_addr', from: 'REGS', to: 'port:o_imem_write_addr', name: 'o_imem_write_addr', width: 10, desc: '<p>De: registro <code>imem_addr</code>. A: imem. Para: dirección en bytes (el byte <i>k</i> del programa va a la dirección <i>k</i>).</p>' },
    { id: 'n_imem_data', from: 'REGS', to: 'port:o_imem_write_data', name: 'o_imem_write_data', width: 8, desc: '<p>De: registro <code>imem_data</code>. A: imem. Para: el byte del programa (o del NOP de relleno).</p>' },
    { id: 'n_dbg_addr_out', from: 'REGS', to: 'port:o_dbg_addr', name: 'o_dbg_addr', width: 16, desc: '<p>De: registro <code>dbg_addr</code>. A: CPU. Para: seleccionar la palabra del mapa de debug; es un registro, así que es estable un ciclo antes de muestrear.</p>' },
  ],
};
