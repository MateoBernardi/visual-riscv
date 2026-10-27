import { githubUrl } from '../repo.js';

const F = 'pipeline/riscv_pipeline.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: o.symbol ?? id, at, size, desc,
  ...(o.drill ? { drill: o.drill } : {}), ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'riscv_pipeline',
  module: 'riscv_pipeline',
  file: F,
  instance: 'u_cpu',
  parent: 'top_riscv',
  blockIds: [],
  title: 'Núcleo RISC-V de 5 etapas',
  stage: null,
  kind: 'struct',
  explain: {
    firstPrinciples: `
      <p>Una instrucción necesita varias cosas en secuencia: buscarla en memoria, decodificarla y leer los registros, calcular con la ALU, acceder a memoria y escribir el resultado. Si todo eso ocurre en un único ciclo, el período del reloj tiene que alcanzar para sumar los retardos de <b>todas</b> las etapas y gran parte del hardware está ocioso casi todo el tiempo (mientras la ALU calcula, la memoria de instrucciones no hace nada).</p>
      <p>La idea del pipeline es la de una línea de montaje: se parte el camino en etapas de largo parecido y se pone un <b>registro</b> entre una etapa y la siguiente. Así, en cada flanco de clock entra una instrucción nueva y hay cinco instrucciones "en vuelo" a la vez. El período solo tiene que cubrir la etapa más lenta, no la suma.</p>
      <p>El costo son los <b>hazards</b>: una instrucción puede necesitar un valor que la anterior todavía no escribió (dependencia de datos), y un salto cambia el PC cuando ya entraron instrucciones del camino equivocado (dependencia de control). Por eso un pipeline real necesita, además de las etapas, lógica para <b>reenviar</b> resultados (forwarding), <b>frenar</b> (stall) y <b>descartar</b> (flush).</p>`,
    inThisProject: `
      <p>Este es el módulo ${g('module:riscv_pipeline', 'riscv_pipeline')} (instanciado como <code>u_cpu</code> desde <code>top_riscv</code>). Une los módulos de cada etapa con cuatro registros de pipeline: ${g('u_if_id')}, ${g('u_id_ex')}, ${g('u_ex_mem')} y ${g('u_mem_wb')}, todos definidos en <code>pipeline/regs/pipe_reg.v</code>.</p>
      <ul>
        <li><b>IF</b>: el registro ${g('pc')} (con enable ${g('pc_en')}), el mux ${g('pc_next')} y la memoria ${g('u_imem')}.</li>
        <li><b>ID</b>: ${g('u_ctrl')}, ${g('u_immgen')}, ${g('u_rf')} (con <code>BYPASS=1</code>) y ${g('u_hazard')}. El sumador ${g('id_pc4')} calcula PC+4 acá, en ID, y lo lleva hasta MEM para JAL/JALR.</li>
        <li><b>EX</b>: ${g('u_fwd')} elige los muxes ${g('fwd_a_val')} / ${g('fwd_b_val')}; después ${g('alu_a')} / ${g('alu_b')} eligen PC o inmediato; ${g('u_alu')} y ${g('u_bu')} resuelven el salto. <code>redirect</code> se deriva de <code>branch_taken</code> y <code>ex_jump</code>.</li>
        <li><b>MEM</b>: ${g('u_dmem')} y el mux ${g('mem_result_r')} (<code>mem_result</code>), que también alimenta el forwarding hacia EX.</li>
        <li><b>WB</b>: ${g('u_mem_wb')} guarda <code>wb_result</code> ya seleccionado y lo entrega al regfile.</li>
      </ul>
      <p>Las dependencias de control se resuelven en EX: un salto tomado o un jump anula las dos instrucciones siguientes (2 burbujas). El <b>halt</b> (ECALL/EBREAK) es pegajoso: ${g('halting_r')} y ${g('stop_fetch')} impiden que ninguna instrucción posterior al halt avance, y <code>o_halt</code> sube cuando el halt llega a WB.</p>
      <p>Hacia afuera expone la interfaz con la debug unit: <code>i_rst</code> (reset sincrónico), <code>i_enable</code> (congela todo sin gatear el clock), el puerto de carga de la imem y el bus de debug combinacional ${g('o_dbg_data')} de 86 palabras.</p>`,
    whyThisChoice: `
      <p>Un pipeline clásico de 5 etapas con forwarding es el punto de equilibrio didáctico: CPI cercano a 1 con poca lógica extra. Frente a un core de 2-3 etapas (Ibex, Cortex-M0+) rinde más por ciclo de reloj, pero obliga a manejar hazards; frente a un pipeline más profundo o con <b>predicción de saltos</b> (BTB, gshare, como BOOM) es mucho más simple, a costa de pagar 2 burbujas por cada salto tomado porque se resuelve en EX y no se predice.</p>
      <p>Mantener hazards, forwarding y flush como módulos separados (carpeta <code>flow/</code>) deja visible cada política y permite reemplazar una sin tocar las demás (por ejemplo, agregar un predictor sería cambiar ${g('pc_next')} y ${g('module:flush_unit', 'flush_unit', 'pipeline/flow/flush_unit.v')}).</p>`,
  },
  refs: [
    { label: 'riscv_pipeline', sym: 'module:riscv_pipeline' },
    { label: 'pc_next', sym: 'pc_next' },
    { label: 'stop_fetch', sym: 'stop_fetch' },
    { label: 'mem_result_r', sym: 'mem_result_r' },
    { label: 'halting_r', sym: 'halting_r' },
    { label: 'o_dbg_data', sym: 'o_dbg_data' },
  ],
  grid: [20, 10],
  ports: [
    { name: 'clk', dir: 'in', width: 1, side: 't', ext: 'top_riscv (reloj del sistema)', desc: 'Reloj. Todos los registros (<code>pc</code>, los cuatro de pipeline, el regfile, la dmem, la imem y <code>halting_r</code>) actualizan en el flanco de subida.' },
    { name: 'i_rst', dir: 'in', width: 1, side: 't', ext: 'debug', desc: 'Reset sincrónico: PC=0, pipeline vacío, x1..x31 en 0. No borra la dmem y conserva la imem.' },
    { name: 'i_enable', dir: 'in', width: 1, side: 't', ext: 'debug', desc: 'Si vale 0 se congela todo el estado (no hay clock gating): los registros mantienen su valor y se ignoran flush y stall.' },
    { name: 'i_imem_we', dir: 'in', width: 1, side: 'l', ext: 'debug', desc: 'Habilita la escritura de un byte en la imem (carga de programa).' },
    { name: 'i_imem_waddr', dir: 'in', width: 'IMEM_ADDR_W', side: 'l', ext: 'debug', desc: 'Dirección de byte donde se escribe en la imem.' },
    { name: 'i_imem_wdata', dir: 'in', width: 8, side: 'l', ext: 'debug', desc: 'Byte a escribir en la imem.' },
    { name: 'i_dbg_addr', dir: 'in', width: 16, side: 'b', ext: 'debug', desc: 'Selecciona qué palabra del mapa de debug se lee (0..85).' },
    { name: 'o_dbg_data', dir: 'out', width: 32, side: 'r', ext: 'debug', desc: 'Palabra del mapa de debug seleccionada, combinacional.' },
    { name: 'o_dbg_count', dir: 'out', width: 16, side: 'r', ext: 'debug', desc: 'Cantidad de palabras del mapa de debug (86).' },
    { name: 'o_halt', dir: 'out', width: 1, side: 'r', ext: 'debug', desc: 'Nivel: 1 cuando un ECALL/EBREAK llegó a WB.' },
  ],
  parts: [
    // ---------------------------------------------------------------- IF
    P('pc_next', 'mux', 'pc_next', 32, [0, 4], [1, 1], 'Mux de dos entradas que elige el próximo PC: <code>redirect ? redirect_target : pc + 4</code>. Existe porque el PC normalmente avanza de a 4 bytes pero un salto lo reemplaza. El detalle está en la vista <b>PC</b>.', { drill: 'if_pc', live: 'snap.signals.redirect' }),
    P('pc_en', 'logic', 'pc_en', 1, [1, 2], [1, 1], '<code>pc_en = en &amp; ~stall &amp; ~stop_fetch</code>: el PC solo carga cuando el CPU no está pausado, no hay load-use ni halt en camino. Sin esto, el PC avanzaría mientras IF/ID está congelado y se perdería una instrucción.', { drill: 'if_pc' }),
    P('pc', 'ff', 'pc', 32, [1, 4], [1, 1], 'Registro del program counter: dirección de byte de la instrucción en fetch. Reset a 0; carga <code>pc_next</code> si <code>pc_en</code>.', { drill: 'if_pc', live: 'snap.pc' }),
    P('u_imem', 'submodule', 'imem', 32, [2, 4], [1, 1], 'Memoria de instrucciones: lectura combinacional por <code>pc</code> y puerto de escritura de bytes para cargar el programa.', { drill: 'imem', live: 'snap.signals.ifInst' }),
    P('u_if_id', 'submodule', 'if_id_reg', 64, [3, 4], [1, 2], 'Registro IF/ID: guarda <code>pc</code> e instrucción para ID. Se congela con stall y se vuelve NOP con flush.', { drill: 'if_id_reg', live: 'snap.latches.ifid.inst' }),
    // ---------------------------------------------------------------- ID
    P('u_ctrl', 'submodule', 'control', 1, [5, 1], [1, 1], 'Decodificador de control: del opcode (y funct3/funct7) saca las banderas de la instrucción.', { drill: 'control' }),
    P('u_immgen', 'submodule', 'immgen', 32, [5, 3], [1, 1], 'Generador de inmediatos: arma el inmediato de 32 bits según <code>id_imm_sel</code>.', { drill: 'immgen', live: 'snap.signals.idImm' }),
    P('u_rf', 'submodule', 'regfile', 32, [5, 5], [1, 1], 'Banco de 32 registros con dos lecturas asincrónicas, una escritura desde WB (con bypass) y un puerto de debug.', { drill: 'regfile', live: 'snap.signals.idRdata1' }),
    P('id_pc4', 'adder', 'id_pc + 4', 32, [5, 7], [1, 1], 'Sumador que calcula <code>id_pc + 4</code>, la dirección de retorno que guardan JAL/JALR. Se calcula en ID y viaja con la instrucción hasta MEM.'),
    P('id_is_jalr', 'logic', 'is_jalr / is_auipc', 1, [5, 9], [1, 1], 'Dos comparadores de opcode (<code>id_is_jalr</code> e <code>id_is_auipc</code>) que se calculan en riscv_pipeline.v y no en control.v. EX los necesita para elegir el destino del salto y el operando A.'),
    P('u_hazard', 'submodule', 'hazard_unit', 1, [7, 0], [1, 1], 'Detecta load-use: un load en EX cuyo destino coincide con rs1 o rs2 de la instrucción en ID.', { drill: 'hazard_unit', live: 'snap.signals.stall' }),
    P('u_id_ex', 'submodule', 'id_ex_reg', 190, [7, 2], [1, 6], 'Registro ID/EX: el más ancho, lleva el control decodificado, los operandos, el inmediato y los índices rs1/rs2/rd. Un flush mete una burbuja (todo en 0).', { drill: 'id_ex_reg', live: 'snap.latches.idex.rd' }),
    // ---------------------------------------------------------------- EX
    P('u_fwd', 'submodule', 'forward_unit', 4, [8, 0], [1, 1], 'Compara rs1/rs2 de EX con los destinos de MEM y WB y genera los selectores <code>forward_a</code> y <code>forward_b</code>.', { drill: 'forward_unit', live: 'snap.signals.fwdA' }),
    P('fwd_a_val', 'mux', 'fwd_a_val', 32, [8, 2], [1, 1], 'Mux 3:1 del operando A con forwarding: <code>00</code> ex_rdata1, <code>10</code> mem_result, <code>01</code> wb_result.', { drill: 'fwd_mux', live: 'snap.signals.fwdAVal' }),
    P('fwd_b_val', 'mux', 'fwd_b_val', 32, [8, 6], [1, 1], 'Mux 3:1 del operando B con forwarding. Su salida también es el dato de los stores (va a EX/MEM como <code>ex_rdata2</code>).', { drill: 'fwd_mux', live: 'snap.signals.fwdBVal' }),
    P('alu_a', 'mux', 'alu_a', 32, [9, 2], [1, 1], '<code>ex_is_auipc ? ex_pc : fwd_a_val</code>: AUIPC suma el PC, el resto usa el operando reenviado.', { drill: 'alu_operands', live: 'snap.signals.aluA' }),
    P('alu_b', 'mux', 'alu_b', 32, [9, 6], [1, 1], '<code>ex_alu_src ? ex_imm : fwd_b_val</code>: inmediato para I/load/store/JALR/AUIPC, registro para R-type y branches.', { drill: 'alu_operands', live: 'snap.signals.aluB' }),
    P('u_alu', 'submodule', 'alu_tp1', 32, [10, 3], [1, 3], 'ALU de 32 bits. Además del resultado entrega las banderas <code>zero</code>, <code>lt</code> y <code>ltu</code> para los branches.', { drill: 'alu_tp1', live: 'snap.signals.aluOut' }),
    P('u_bu', 'submodule', 'branch_unit', 1, [11, 1], [1, 1], 'Evalúa la condición del branch (según funct3 y las banderas de la ALU) y calcula <code>pc + imm</code> con su propio sumador.', { drill: 'branch_unit' }),
    P('branch_taken', 'logic', 'branch_taken', 1, [12, 1], [1, 1], '<code>ex_branch &amp; bu_taken</code>: la condición solo cuenta si la instrucción en EX es realmente un branch.', { live: 'snap.signals.branchTaken' }),
    P('redirect', 'logic', 'redirect', 1, [13, 1], [1, 1], '<code>branch_taken | ex_jump</code>: EX ordena cambiar el PC. Alimenta el mux del PC y el flush_unit.', { drill: 'flow_ctrl', live: 'snap.signals.redirect' }),
    P('redirect_target', 'mux', 'redirect_target', 32, [12, 3], [1, 1], '<code>ex_is_jalr ? (alu_out &amp; ~1) : bu_target</code>: JALR usa rs1+imm con el bit 0 en cero; branch y JAL usan pc+imm.', { drill: 'flow_ctrl', live: 'snap.signals.redirectTarget' }),
    P('u_flush', 'submodule', 'flush_unit', 1, [14, 1], [1, 1], 'Convierte <code>redirect</code> en las dos señales de flush (es un passthrough).', { drill: 'flush_unit', live: 'snap.signals.redirect' }),
    P('halting_r', 'ff', 'halting_r', 1, [11, 8], [1, 1], 'Flip-flop pegajoso: se pone en 1 cuando un halt llega a EX y solo vuelve a 0 con reset. Memoriza que hay que dejar de buscar instrucciones.', { drill: 'flow_ctrl', live: 'snap.halting' }),
    P('stop_fetch', 'logic', 'stop_fetch', 1, [12, 8], [1, 1], '<code>ex_halt | halting</code>: nada más joven que un halt puede ejecutarse.', { drill: 'flow_ctrl', live: 'snap.signals.stopFetch' }),
    P('flush_if_id', 'logic', 'flush_if_id', 1, [13, 8], [1, 1], '<code>flush_if_id_r | stop_fetch</code>: vacía IF/ID por salto tomado o por halt.', { drill: 'flow_ctrl', live: 'snap.signals.flushIfId' }),
    P('flush_id_ex', 'logic', 'flush_id_ex', 1, [14, 8], [1, 1], '<code>flush_id_ex_r | stop_fetch | stall</code>: mete una burbuja en ID/EX por salto, halt o load-use.', { drill: 'flow_ctrl', live: 'snap.signals.flushIdEx' }),
    P('u_ex_mem', 'submodule', 'ex_mem_reg', 142, [15, 2], [1, 6], 'Registro EX/MEM: guarda <code>alu_out</code>, el dato del store, PC+4, el inmediato (para LUI), rd, funct3 y el control restante.', { drill: 'ex_mem_reg', live: 'snap.latches.exmem.alu_out' }),
    // ---------------------------------------------------------------- MEM / WB
    P('u_dmem', 'submodule', 'dmem', 32, [16, 3], [1, 2], 'Memoria de datos de 1 KB en cuatro carriles de byte: escritura con byte-enables y lectura con extensión de signo según funct3.', { drill: 'dmem', live: 'snap.signals.memRData' }),
    P('mem_result_r', 'mux', 'mem_result', 32, [17, 5], [1, 1], 'Mux 4:1 <code>mem_wb_sel</code>: ALU, dato de dmem, PC+4 o inmediato (LUI). Su salida <code>mem_result</code> va a MEM/WB y también vuelve a EX como forwarding.', { drill: 'wb_mux', live: 'snap.signals.memResult' }),
    P('u_mem_wb', 'submodule', 'mem_wb_reg', 39, [18, 2], [1, 6], 'Registro MEM/WB: guarda el resultado final, rd, reg_write y halt. Su salida alimenta la escritura del regfile y el forwarding "01".', { drill: 'mem_wb_reg', live: 'snap.latches.memwb.result' }),
    // ---------------------------------------------------------------- debug
    P('o_dbg_data', 'mux', 'debug read mux', 32, [16, 9], [2, 1], 'Gran <code>case (i_dbg_addr)</code> combinacional que elige una de las 86 palabras del mapa de debug: PC, latches, señales de EX, registros x0..x31 y 32 palabras de dmem. Lo usa la debug unit para el comando de volcado.'),
    P('DBG_COUNT', 'const', 'DBG_COUNT', 16, [19, 9], [1, 1], 'Localparam con la cantidad de palabras del mapa (22 + 32 + 32 = 86). La debug unit lo usa para saber cuántas pedir.'),
  ],
  nets: [
    // ---- IF
    N('n_pc_next', 'pc_next', 'pc', 'pc_next', 32, 'Sale del mux de próximo PC y entra al registro <code>pc</code>: es lo que el PC va a valer después del flanco.'),
    N('n_pc_en', 'pc_en', 'pc', 'pc_en', 1, 'Enable del registro PC. Combina <code>en</code>, <code>stall</code> y <code>stop_fetch</code>.'),
    N('n_pc_imem', 'pc', 'u_imem', 'pc', 32, 'El PC actual es la dirección de byte que se presenta a la imem (la imem usa <code>addr[ADDR_W-1:2]</code>).', 'snap.pc'),
    N('n_pc_ifid', 'pc', 'u_if_id', 'pc', 32, 'El PC de la instrucción buscada viaja a IF/ID junto con la instrucción (entra como <code>if_pc</code>).', 'snap.pc'),
    N('n_if_inst', 'u_imem', 'u_if_id', 'if_inst', 32, 'Palabra de instrucción leída de la imem; se captura en IF/ID en el próximo flanco.', 'snap.signals.ifInst'),
    N('n_rst_pc', 'port:i_rst', 'pc', 'rst', 1, 'El reset sincrónico (alias <code>rst</code> de <code>i_rst</code>) llega a todos los registros; en el PC lo lleva a 0.'),
    N('n_en_pc', 'port:i_enable', 'pc_en', 'en', 1, 'El enable externo (alias <code>en</code> de <code>i_enable</code>) pausa el core. También entra a cada registro de pipeline, al <code>we</code> del regfile y de la dmem y a <code>halting_r</code>.'),
    N('n_imem_we', 'port:i_imem_we', 'u_imem', 'i_imem_we', 1, 'Puerto de carga de programa: la debug unit escribe la imem de a un byte mientras el CPU está en reset.'),
    N('n_imem_waddr', 'port:i_imem_waddr', 'u_imem', 'i_imem_waddr', 'IMEM_ADDR_W', 'Dirección de byte donde cae <code>i_imem_wdata</code>.'),
    N('n_imem_wdata', 'port:i_imem_wdata', 'u_imem', 'i_imem_wdata', 8, 'Byte del programa que se escribe en la imem (little-endian).'),
    // ---- ID
    N('n_id_opcode', 'u_if_id', 'u_ctrl', 'id_opcode', 7, 'Bits <code>[6:0]</code> de la instrucción en ID: el opcode que decodifica control (junto con funct3 y funct7).'),
    N('n_id_inst_imm', 'u_if_id', 'u_immgen', 'id_inst', 32, 'La instrucción completa entra al generador de inmediatos, que extrae y extiende los bits según el formato.'),
    N('n_id_imm_sel', 'u_ctrl', 'u_immgen', 'id_imm_sel', 3, 'Selector de formato (I/S/B/U/J) que decide control según el opcode.'),
    N('n_id_rs1', 'u_if_id', 'u_rf', 'id_rs1', 5, 'Campo <code>inst[19:15]</code>: índice del primer registro fuente, que va a la lectura 1 del regfile. Se extrae siempre, sin mirar el formato.'),
    N('n_id_rs2', 'u_if_id', 'u_rf', 'id_rs2', 5, 'Campo <code>inst[24:20]</code>: índice del segundo registro fuente, a la lectura 2 del regfile.'),
    N('n_id_rs1_hz', 'u_if_id', 'u_hazard', 'id_rs1', 5, 'Los mismos campos crudos (y también <code>id_rs2</code>) entran a hazard_unit. Como no se mira el formato, pueden coincidir bits de inmediato con <code>ex_rd</code> y causar un stall falso.'),
    N('n_id_pc', 'u_if_id', 'id_pc4', 'id_pc', 32, 'PC de la instrucción en ID, que entra al sumador +4. También viaja a ID/EX para calcular saltos y AUIPC.'),
    N('n_id_jalr', 'u_if_id', 'id_is_jalr', 'id_opcode', 7, 'El opcode también se compara en riscv_pipeline.v para derivar <code>id_is_jalr</code> e <code>id_is_auipc</code>.'),
    N('n_id_alu_op', 'u_ctrl', 'u_id_ex', 'id_alu_op', 4, 'Código de operación de la ALU, decodificado en ID, que viaja a EX por ID/EX.'),
    N('n_id_ctrl', 'u_ctrl', 'u_id_ex', 'id_reg_write', 1, 'Representa las banderas de control de la instrucción (<code>reg_write</code>, <code>alu_src</code>, <code>mem_read</code>, <code>mem_write</code>, <code>branch</code>, <code>jump</code>, <code>halt</code> y <code>wb_sel</code>). Cada una viaja por su registro de pipeline hasta la etapa donde se usa.'),
    N('n_id_imm', 'u_immgen', 'u_id_ex', 'id_imm', 32, 'Inmediato de 32 bits ya extendido en signo, para la ALU, el cálculo del destino de salto y LUI.', 'snap.signals.idImm'),
    N('n_id_rdata1', 'u_rf', 'u_id_ex', 'id_rdata1', 32, 'Valor leído de rs1 (con x0=0 y bypass desde WB), que entra al registro ID/EX como candidato al operando A.', 'snap.signals.idRdata1'),
    N('n_id_rdata2', 'u_rf', 'u_id_ex', 'id_rdata2', 32, 'Valor leído de rs2, candidato al operando B y dato de los stores.', 'snap.signals.idRdata2'),
    N('n_id_pc4', 'id_pc4', 'u_id_ex', 'id_pc4', 32, 'PC+4 calculado en ID. Lo usan JAL/JALR como valor a escribir en rd (<code>wb_sel = 10</code>).'),
    N('n_id_is_jalr', 'id_is_jalr', 'u_id_ex', 'id_is_jalr', 1, 'Banderas derivadas del opcode que EX necesita para elegir destino de salto (JALR) y operando A (AUIPC).'),
    N('n_wb_result', 'u_mem_wb', 'u_rf', 'wb_result', 32, 'Resultado final registrado en MEM/WB que entra como <code>wdata</code> al regfile. También es la fuente "01" del forwarding.', 'snap.signals.wbData'),
    N('n_wb_rd', 'u_mem_wb', 'u_rf', 'wb_rd', 5, 'Registro destino de la instrucción en WB (<code>waddr</code> del regfile).', 'snap.signals.wbRd'),
    N('n_wb_reg_write', 'u_mem_wb', 'u_rf', 'wb_reg_write', 1, 'Indica si la instrucción en WB escribe un registro. En el regfile se combina con <code>en</code> para formar <code>we</code>.', 'snap.signals.regWrite'),
    // ---- hazard
    N('n_ex_rd_hz', 'u_id_ex', 'u_hazard', 'ex_rd', 5, 'Destino de la instrucción que está en EX. Si esa instrucción es un load y coincide con rs1/rs2 de ID, hay load-use.', 'snap.latches.idex.rd'),
    N('n_ex_mem_read', 'u_id_ex', 'u_hazard', 'ex_mem_read', 1, 'Indica que la instrucción en EX es un load (el dato recién existe al final de MEM, no se puede reenviar a tiempo).', 'snap.latches.idex.mem_read'),
    N('n_stall_pc', 'u_hazard', 'pc_en', 'stall', 1, 'Si hay load-use el PC no debe avanzar este ciclo.', 'snap.signals.stall'),
    N('n_stall_ifid', 'u_hazard', 'u_if_id', 'stall', 1, 'Congela IF/ID: la instrucción dependiente se repite en ID un ciclo más.', 'snap.signals.stall'),
    N('n_stall_idex', 'u_hazard', 'flush_id_ex', 'stall', 1, 'Mientras IF/ID está congelado, ID/EX recibe una burbuja para que la instrucción dependiente no se ejecute con el dato viejo.', 'snap.signals.stall'),
    // ---- EX forwarding
    N('n_ex_rs1', 'u_id_ex', 'u_fwd', 'ex_rs1', 5, 'Fuente 1 de la instrucción en EX, para compararla con los destinos de MEM y WB.', 'snap.latches.idex.rs1'),
    N('n_ex_rs2', 'u_id_ex', 'u_fwd', 'ex_rs2', 5, 'Fuente 2 de la instrucción en EX.', 'snap.latches.idex.rs2'),
    N('n_mem_rd_fwd', 'u_ex_mem', 'u_fwd', 'mem_rd', 5, 'Destino de la instrucción en MEM. Si coincide con rs1/rs2, el valor se reenvía por <code>10</code>.', 'snap.latches.exmem.rd'),
    N('n_mem_rw_fwd', 'u_ex_mem', 'u_fwd', 'mem_reg_write', 1, 'La instrucción de MEM solo se reenvía si realmente escribe un registro.', 'snap.latches.exmem.reg_write'),
    N('n_wb_rd_fwd', 'u_mem_wb', 'u_fwd', 'wb_rd', 5, 'Destino de la instrucción en WB (reenvío "01"; <code>wb_reg_write</code> acompaña).', 'snap.latches.memwb.rd'),
    N('n_forward_a', 'u_fwd', 'fwd_a_val', 'forward_a', 2, 'Selector del mux A: <code>00</code> regfile, <code>10</code> EX/MEM, <code>01</code> MEM/WB.', 'snap.signals.fwdA'),
    N('n_forward_b', 'u_fwd', 'fwd_b_val', 'forward_b', 2, 'Selector del mux B con la misma codificación.', 'snap.signals.fwdB'),
    N('n_ex_rdata1', 'u_id_ex', 'fwd_a_val', 'ex_rdata1', 32, 'Valor de rs1 leído en ID: se usa cuando no hay hazard (<code>forward_a = 00</code>).', 'snap.latches.idex.rdata1'),
    N('n_ex_rdata2', 'u_id_ex', 'fwd_b_val', 'ex_rdata2', 32, 'Valor de rs2 leído en ID, por defecto del mux B.', 'snap.latches.idex.rdata2'),
    N('n_mem_result_a', 'mem_result_r', 'fwd_a_val', 'mem_result', 32, 'Sale del mux de MEM (<code>mem_result</code>) y vuelve al mux A de EX: es el camino de forwarding "10", un ciclo antes de que el dato llegue al regfile.', 'snap.signals.memResult'),
    N('n_mem_result_b', 'mem_result_r', 'fwd_b_val', 'mem_result', 32, 'El mismo <code>mem_result</code> vuelve al mux B (forwarding "10").', 'snap.signals.memResult'),
    N('n_wb_result_a', 'u_mem_wb', 'fwd_a_val', 'wb_result', 32, 'Resultado de MEM/WB reenviado al mux A (camino "01", instrucción de hace 2).', 'snap.signals.wbData'),
    N('n_wb_result_b', 'u_mem_wb', 'fwd_b_val', 'wb_result', 32, 'Resultado de MEM/WB reenviado al mux B.', 'snap.signals.wbData'),
    N('n_fwd_a_val', 'fwd_a_val', 'alu_a', 'fwd_a_val', 32, 'Operando A ya reenviado, candidato para la ALU (salvo AUIPC).', 'snap.signals.fwdAVal'),
    N('n_fwd_b_val', 'fwd_b_val', 'alu_b', 'fwd_b_val', 32, 'Operando B ya reenviado, candidato para la ALU (salvo que <code>alu_src</code> elija el inmediato).', 'snap.signals.fwdBVal'),
    N('n_fwd_b_store', 'fwd_b_val', 'u_ex_mem', 'fwd_b_val', 32, 'El dato de un store sale del mux B (entra a EX/MEM como <code>ex_rdata2</code>): así <code>sw x2, 0(x1)</code> guarda el valor correcto aunque x2 se acabe de calcular.', 'snap.signals.fwdBVal'),
    N('n_ex_pc', 'u_id_ex', 'alu_a', 'ex_pc', 32, 'PC de la instrucción en EX: se usa como operando A en AUIPC.', 'snap.latches.idex.pc'),
    N('n_ex_is_auipc', 'u_id_ex', 'alu_a', 'ex_is_auipc', 1, 'Selector del mux <code>alu_a</code>.', 'snap.latches.idex.is_auipc'),
    N('n_ex_imm', 'u_id_ex', 'alu_b', 'ex_imm', 32, 'Inmediato de la instrucción en EX, candidato a operando B.', 'snap.latches.idex.imm'),
    N('n_ex_alu_src', 'u_id_ex', 'alu_b', 'ex_alu_src', 1, 'Selector del mux <code>alu_b</code>: 1 = inmediato.', 'snap.latches.idex.alu_src'),
    N('n_alu_a', 'alu_a', 'u_alu', 'alu_a', 32, 'Operando A final de la ALU.', 'snap.signals.aluA'),
    N('n_alu_b', 'alu_b', 'u_alu', 'alu_b', 32, 'Operando B final de la ALU.', 'snap.signals.aluB'),
    N('n_ex_alu_op', 'u_id_ex', 'u_alu', 'ex_alu_op', 4, 'Operación de la ALU decodificada en ID.', 'snap.latches.idex.alu_op'),
    N('n_alu_out', 'u_alu', 'u_ex_mem', 'alu_out', 32, 'Resultado de la ALU: dirección en loads/stores, valor en operaciones aritméticas. Entra a EX/MEM.', 'snap.signals.aluOut'),
    N('n_alu_out_rt', 'u_alu', 'redirect_target', 'alu_out', 32, 'Para JALR, <code>rs1 + imm</code> sale de la ALU y se enmascara con <code>~1</code> para formar el destino del salto.', 'snap.signals.aluOut'),
    N('n_alu_zero', 'u_alu', 'u_bu', 'alu_zero', 1, 'Bandera "resultado cero" (en un branch la ALU resta, así que indica rs1 == rs2). También salen <code>alu_lt</code> y <code>alu_ltu</code>.', 'snap.signals.zero'),
    N('n_ex_funct3_bu', 'u_id_ex', 'u_bu', 'ex_funct3', 3, 'funct3 de la instrucción en EX: dice qué condición de branch evaluar (BEQ, BNE, BLT...).', 'snap.latches.idex.funct3'),
    // ---- control de flujo
    N('n_bu_taken', 'u_bu', 'branch_taken', 'bu_taken', 1, 'Condición del branch evaluada por branch_unit, sin saber si la instrucción es realmente un branch.'),
    N('n_ex_branch', 'u_id_ex', 'branch_taken', 'ex_branch', 1, 'Marca que la instrucción en EX es un branch. Se multiplica con <code>bu_taken</code>.', 'snap.latches.idex.branch'),
    N('n_ex_jump', 'u_id_ex', 'redirect', 'ex_jump', 1, 'JAL y JALR siempre redirigen, por eso van directo al OR de <code>redirect</code>.', 'snap.latches.idex.jump'),
    N('n_branch_taken', 'branch_taken', 'redirect', 'branch_taken', 1, 'Branch tomado: junto con <code>ex_jump</code> forma <code>redirect</code>.', 'snap.signals.branchTaken'),
    N('n_bu_target', 'u_bu', 'redirect_target', 'bu_target', 32, '<code>pc + imm</code> calculado en branch_unit: destino de branches y JAL.'),
    N('n_ex_is_jalr', 'u_id_ex', 'redirect_target', 'ex_is_jalr', 1, 'Selector del mux de destino: JALR usa la ALU, el resto usa <code>bu_target</code>.', 'snap.latches.idex.is_jalr'),
    N('n_redirect_pc', 'redirect', 'pc_next', 'redirect', 1, 'EX ordena al mux del PC que tome <code>redirect_target</code> en vez de PC+4.', 'snap.signals.redirect'),
    N('n_redirect_target', 'redirect_target', 'pc_next', 'redirect_target', 32, 'Destino del salto que vuelve a la etapa IF.', 'snap.signals.redirectTarget'),
    N('n_redirect_flush', 'redirect', 'u_flush', 'redirect', 1, 'Entrada de flush_unit: avisa que hay que anular las instrucciones del camino equivocado.', 'snap.signals.redirect'),
    N('n_flush_if_id_r', 'u_flush', 'flush_if_id', 'flush_if_id_r', 1, 'Salida de flush_unit para IF/ID (copia de <code>redirect</code>). Se une con <code>stop_fetch</code>.', 'snap.signals.redirect'),
    N('n_flush_id_ex_r', 'u_flush', 'flush_id_ex', 'flush_id_ex_r', 1, 'Salida de flush_unit para ID/EX (copia de <code>redirect</code>). Se une con <code>stop_fetch</code> y <code>stall</code>.', 'snap.signals.redirect'),
    N('n_flush_ifid', 'flush_if_id', 'u_if_id', 'flush_if_id', 1, 'Si vale 1 el registro IF/ID carga NOP (<code>0x13</code>) y PC=0 en vez de la instrucción buscada.', 'snap.signals.flushIfId'),
    N('n_flush_idex', 'flush_id_ex', 'u_id_ex', 'flush_id_ex', 1, 'Si vale 1 el registro ID/EX carga una burbuja (control y datos en cero).', 'snap.signals.flushIdEx'),
    N('n_ex_halt_stop', 'u_id_ex', 'stop_fetch', 'ex_halt', 1, 'Un halt (SYSTEM) en EX corta el fetch ya mismo, sin esperar a que <code>halting_r</code> lo registre.', 'snap.latches.idex.halt'),
    N('n_ex_halt_ff', 'u_id_ex', 'halting_r', 'ex_halt', 1, 'La primera vez que un halt llega a EX, <code>halting_r</code> se pone en 1 (si <code>en</code>).', 'snap.latches.idex.halt'),
    N('n_halting', 'halting_r', 'stop_fetch', 'halting', 1, 'Versión registrada del halt: mantiene el fetch detenido en los ciclos siguientes.', 'snap.halting'),
    N('n_stop_pc', 'stop_fetch', 'pc_en', 'stop_fetch', 1, 'Con un halt en camino el PC se congela.', 'snap.signals.stopFetch'),
    N('n_stop_ifid', 'stop_fetch', 'flush_if_id', 'stop_fetch', 1, 'Con un halt, lo que entre a IF/ID se anula igual que en un salto.', 'snap.signals.stopFetch'),
    N('n_stop_idex', 'stop_fetch', 'flush_id_ex', 'stop_fetch', 1, 'Con un halt, lo que entre a ID/EX se convierte en burbuja.', 'snap.signals.stopFetch'),
    // ---- MEM
    N('n_mem_alu_out', 'u_ex_mem', 'u_dmem', 'mem_alu_out', 32, 'Resultado de la ALU de la instrucción en MEM: es la dirección de byte de loads y stores.', 'snap.latches.exmem.alu_out'),
    N('n_mem_rdata2', 'u_ex_mem', 'u_dmem', 'mem_rdata2', 32, 'Dato a escribir en un store (rs2 con forwarding).', 'snap.latches.exmem.rdata2'),
    N('n_mem_funct3', 'u_ex_mem', 'u_dmem', 'mem_funct3', 3, 'funct3 de la instrucción en MEM: define el ancho (byte/half/word) y el signo del acceso.', 'snap.latches.exmem.funct3'),
    N('n_mem_write', 'u_ex_mem', 'u_dmem', 'mem_mem_write', 1, 'Habilita la escritura de la dmem (se combina con <code>en</code>).', 'snap.latches.exmem.mem_write'),
    N('n_mem_rdata', 'u_dmem', 'mem_result_r', 'mem_rdata', 32, 'Dato leído y extendido de la dmem; es la entrada "01" del mux de resultado (loads).', 'snap.signals.memRData'),
    N('n_mem_wb_sel', 'u_ex_mem', 'mem_result_r', 'mem_wb_sel', 2, 'Selector del mux de resultado: 00 ALU, 01 dmem, 10 PC+4, 11 inmediato. También entran <code>mem_alu_out</code>, <code>mem_pc4</code> y <code>mem_imm</code>.', 'snap.latches.exmem.wb_sel'),
    N('n_mem_result', 'mem_result_r', 'u_mem_wb', 'mem_result', 32, 'Resultado ya elegido que se registra en MEM/WB; por eso WB no necesita otro mux.', 'snap.signals.memResult'),
    N('n_mem_rd_wb', 'u_ex_mem', 'u_mem_wb', 'mem_rd', 5, 'Destino que acompaña al resultado hasta WB (junto con <code>mem_reg_write</code> y <code>mem_halt</code>).', 'snap.latches.exmem.rd'),
    N('n_wb_halt', 'u_mem_wb', 'port:o_halt', 'wb_halt', 1, 'Cuando el halt llega a WB, <code>o_halt</code> sube y la debug unit sabe que el programa terminó.', 'snap.halted'),
    // ---- debug
    N('n_dbg_addr', 'port:i_dbg_addr', 'o_dbg_data', 'i_dbg_addr', 16, 'Índice de la palabra que pide la debug unit.'),
    N('n_dbg_reg', 'u_rf', 'o_dbg_data', 'dbg_reg_data', 32, 'Puerto de debug del regfile: una de las 32 lecturas x0..x31 del volcado (x0 se fuerza a 0 en el mux).'),
    N('n_dbg_dmem', 'u_dmem', 'o_dbg_data', 'dbg_dmem_data', 32, 'Puerto de debug de la dmem: 32 palabras del volcado.'),
    N('n_dbg_out', 'o_dbg_data', 'port:o_dbg_data', 'o_dbg_data', 32, 'Palabra elegida, que sale hacia la debug unit.'),
    N('n_dbg_count', 'DBG_COUNT', 'port:o_dbg_count', 'o_dbg_count', 16, 'Constante con la cantidad de palabras del mapa.'),
  ],
};
