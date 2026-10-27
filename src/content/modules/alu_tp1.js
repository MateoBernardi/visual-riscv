import { githubUrl } from '../repo.js';

const F = 'pipeline/3_execute/alu.v';
const g = (s, t = s, f = F) => `<a href="${githubUrl(f, s)}" target="_blank" rel="noopener"><code>${t}</code></a>`;
const P = (id, kind, label, width, at, size, desc, o = {}) => ({
  id, kind, label, width, symbol: 'symbol' in o ? o.symbol : id, at, size, desc,
  ...(o.live ? { live: o.live } : {}),
});
const N = (id, from, to, name, width, desc, live) => ({ id, from, to, name, width, desc, ...(live ? { live } : {}) });

export default {
  id: 'alu_tp1',
  module: 'alu_tp1',
  file: F,
  instance: 'u_alu',
  parent: null,
  within: 'riscv_pipeline',
  instancePath: 'u_cpu.u_alu',
  blockIds: ['alu'],
  title: 'ALU',
  stage: 'EX',
  kind: 'comb',
  explain: {
    firstPrinciples: `
      <p>Todo programa termina reduciéndose a unas pocas operaciones sobre números: sumar, restar, operaciones bit a bit (AND, OR, XOR), desplazar bits y comparar. En lugar de tener un circuito distinto por instrucción, se construye una única <b>unidad aritmético-lógica</b>: un circuito combinacional con dos entradas de datos, un código que dice qué operación hacer y una salida.</p>
      <p>La suma es la operación más importante. No solo implementa ADD: las direcciones de loads y stores son <code>base + offset</code>, el destino de JALR es <code>rs1 + imm</code>, y una resta (sumar el complemento a dos) sirve para comparar: si <code>a − b</code> da cero, son iguales. Por eso muchas instrucciones "distintas" comparten el mismo hardware con códigos diferentes.</p>
      <p>Además del resultado, es habitual que la ALU entregue <b>banderas</b>: si el resultado es cero, si hubo desbordamiento con signo, o si <code>a &lt; b</code>. Con esas banderas una unidad separada puede decidir un salto condicional sin repetir la comparación.</p>
      <p>Un aspecto sutil es el de los desplazamientos: en RV32I solo importan los 5 bits bajos de la cantidad a desplazar, porque no tiene sentido desplazar 32 o más lugares en un registro de 32 bits. Y hay dos clases de desplazamiento a la derecha: lógico (rellena con ceros) y aritmético (replica el signo).</p>`,
    inThisProject: `
      <p>Es ${g('module:alu_tp1', 'alu_tp1')} (el nombre viene del TP1 y fue adaptado a RV32I), con parámetros <code>NB_DATA = 32</code> y <code>NB_OP = 4</code>. Es puramente combinacional y los códigos de operación vienen de <code>alu_ops.vh</code>: ADD 0000, SUB 0001, AND 0010, OR 0011, XOR 0100, SLT 0101, SLTU 0110, SLL 0111, SRL 1000, SRA 1001 y NOR 1010 (este último no lo genera el decodificador).</p>
      <ul>
        <li>${g('alu_result')}: <code>case (i_data_op)</code> dentro de un <code>always @(*)</code>; el <code>default</code> y cualquier código no definido dan 0.</li>
        <li>${g('shamt')} <code>= i_data_b[NB_SH-1:0]</code>: solo los 5 bits bajos de B, como pide RV32I. Esto es lo que permite que SRAI (cuyo inmediato lleva <code>0100000</code> en los bits altos) funcione bien.</li>
        <li>${g('o_lt')} y ${g('o_ltu')} se calculan <b>siempre</b>, sin depender de <code>i_data_op</code>: la primera compara con signo (los puertos están declarados <code>signed</code>), la segunda usa <code>$unsigned</code>. Las usan SLT/SLTU y branch_unit (BLT/BGE/BLTU/BGEU).</li>
        <li>${g('o_z')} <code>= (alu_result == 0)</code>: el cero se evalúa sobre el resultado final. En un branch la ALU hace SUB, de modo que <code>zero</code> significa "rs1 == rs2".</li>
        <li>${g('o_o')}: overflow con signo, solo definido para ADD y SUB; no lo usa ninguna instrucción, pero se vuelca en el mapa de debug (bit 6 de la palabra 13).</li>
      </ul>
      <p>Para las instrucciones que no pasan por la ALU (LUI, JAL) el resultado de la ALU simplemente se ignora: el valor sale de <code>wb_sel</code> en MEM.</p>`,
    whyThisChoice: `
      <p>La ALU está descripta con operadores de Verilog (<code>+</code>, <code>-</code>, <code>&lt;&lt;</code>, <code>&gt;&gt;&gt;</code>) y es la herramienta de síntesis la que elige la estructura: en la Artix-7 el sumador usa la cadena de carry dedicada (CARRY4), mucho mejor que cualquier sumador hecho a mano con LUTs. Frente a un <b>ripple-carry explícito</b> (mínima área, retardo O(n)), un <b>carry-lookahead / carry-select</b> o un <b>Kogge-Stone</b> (retardo logarítmico a costa de área y cableado) el diseño elige no pensar en la implementación del sumador y confiar en el mapeo a carry chains.</p>
      <p>Un <b>barrel shifter</b> (desplazar cualquier cantidad en un ciclo con 5 niveles de mux) es lo que sintetiza <code>&lt;&lt; shamt</code>; un shifter serial ahorraría área pero obligaría a instrucciones multiciclo (SERV, PicoRV32). Una <b>extensión M</b> añadiría multiplicador (usando los DSP48) y un divisor iterativo, que no existen acá. En esta implementación se calculan lt/ltu aunque no se pida una comparación: cuesta dos comparadores siempre activos, pero evita multiplexar la salida de branch_unit.</p>`,
  },
  refs: [
    { label: 'alu_tp1', sym: 'module:alu_tp1' },
    { label: 'alu_result', sym: 'alu_result' },
    { label: 'shamt', sym: 'shamt' },
    { label: 'o_lt', sym: 'assign:o_lt' },
    { label: 'o_ltu', sym: 'assign:o_ltu' },
    { label: 'o_z', sym: 'o_z' },
  ],
  grid: [10, 7],
  ports: [
    { name: 'i_data_a', dir: 'in', width: 'NB_DATA', side: 'l', ext: 'aluSrcMux', desc: 'Operando A (<code>alu_a</code>): registro con forwarding, o PC si es AUIPC.' },
    { name: 'i_data_b', dir: 'in', width: 'NB_DATA', side: 'l', ext: 'aluSrcMux', desc: 'Operando B (<code>alu_b</code>): registro con forwarding o inmediato.' },
    { name: 'i_data_op', dir: 'in', width: 'NB_OP', side: 'b', ext: 'idex', desc: 'Código de operación (<code>ex_alu_op</code>).' },
    { name: 'o_data', dir: 'out', width: 'NB_DATA', side: 'r', ext: 'exmem', desc: 'Resultado: valor aritmético, dirección de memoria o base de JALR.' },
    { name: 'o_z', dir: 'out', width: 1, side: 'r', ext: 'branch', desc: 'Resultado == 0.' },
    { name: 'o_o', dir: 'out', width: 1, side: 'r', ext: 'debug', desc: 'Overflow con signo (solo ADD/SUB).' },
    { name: 'o_lt', dir: 'out', width: 1, side: 'r', ext: 'branch', desc: 'a &lt; b con signo, siempre calculado.' },
    { name: 'o_ltu', dir: 'out', width: 1, side: 'r', ext: 'branch', desc: 'a &lt; b sin signo, siempre calculado.' },
  ],
  parts: [
    P('o_lt', 'cmp', 'a < b (signed)', 1, [2, 0], [2, 1], 'Comparador con signo: <code>assign o_lt = (i_data_a &lt; i_data_b)</code>. Los puertos son <code>signed</code>, por eso la comparación es con signo. Se calcula siempre.'),
    P('o_ltu', 'cmp', 'a < b (unsigned)', 1, [2, 2], [2, 1], 'Comparador sin signo: <code>$unsigned(i_data_a) &lt; $unsigned(i_data_b)</code>. Se calcula siempre.'),
    P('shamt', 'logic', 'shamt = b[4:0]', 5, [2, 4], [2, 1], 'Cantidad de bits a desplazar: solo los 5 bits bajos de B (<code>$clog2(32)</code> = 5).'),
    P('alu_result', 'mux', 'case (i_data_op)', 32, [5, 1], [2, 4], 'Selección de la operación: ADD, SUB, AND, OR, XOR, SRA (<code>&gt;&gt;&gt;</code>), SRL (<code>&gt;&gt;</code>), NOR, SLL, SLT, SLTU. SLT/SLTU copian <code>o_lt</code>/<code>o_ltu</code> en el bit 0.', { live: 'snap.signals.aluOut' }),
    P('o_o', 'logic', 'overflow', 1, [8, 0], [2, 1], 'Overflow con signo: en ADD, A y B del mismo signo y resultado de signo distinto; en SUB, A y B de signo distinto y resultado distinto al de A. Para el resto de las operaciones queda en 0.'),
    P('o_z', 'cmp', 'zero (== 0)', 1, [8, 5], [2, 1], '<code>o_z = (alu_result == 0)</code>: NOR reductor sobre los 32 bits del resultado.', { live: 'snap.signals.zero' }),
    P('o_data', 'logic', 'o_data', 32, [8, 3], [2, 1], '<code>assign o_data = alu_result</code>.', { live: 'snap.signals.aluOut' }),
  ],
  nets: [
    N('n_a_lt', 'port:i_data_a', 'o_lt', 'i_data_a', 'NB_DATA', 'Operando A al comparador con signo.', 'snap.signals.aluA'),
    N('n_b_lt', 'port:i_data_b', 'o_lt', 'i_data_b', 'NB_DATA', 'Operando B al comparador con signo.', 'snap.signals.aluB'),
    N('n_a_ltu', 'port:i_data_a', 'o_ltu', 'i_data_a', 'NB_DATA', 'Operando A al comparador sin signo.', 'snap.signals.aluA'),
    N('n_b_ltu', 'port:i_data_b', 'o_ltu', 'i_data_b', 'NB_DATA', 'Operando B al comparador sin signo.', 'snap.signals.aluB'),
    N('n_b_shamt', 'port:i_data_b', 'shamt', 'i_data_b', 'NB_DATA', 'De B solo importan los 5 bits bajos para los desplazamientos.', 'snap.signals.aluB'),
    N('n_a_res', 'port:i_data_a', 'alu_result', 'i_data_a', 'NB_DATA', 'A entra a todas las operaciones.', 'snap.signals.aluA'),
    N('n_b_res', 'port:i_data_b', 'alu_result', 'i_data_b', 'NB_DATA', 'B entra a todas las operaciones (menos como cantidad de shift).', 'snap.signals.aluB'),
    N('n_op', 'port:i_data_op', 'alu_result', 'i_data_op', 'NB_OP', 'Selecciona la operación que se copia a <code>alu_result</code>.', 'snap.signals.aluOp'),
    N('n_shamt', 'shamt', 'alu_result', 'shamt', 5, 'Cantidad de desplazamiento para SLL, SRL y SRA.'),
    N('n_lt_res', 'o_lt', 'alu_result', 'o_lt', 1, 'SLT reutiliza este bit como resultado (extendido con ceros).', 'snap.signals.lt'),
    N('n_ltu_res', 'o_ltu', 'alu_result', 'o_ltu', 1, 'SLTU reutiliza este bit.', 'snap.signals.ltu'),
    N('n_res_o', 'alu_result', 'o_o', 'alu_result', 32, 'El bit de signo del resultado interviene en la detección de overflow.', 'snap.signals.aluOut'),
    N('n_res_z', 'alu_result', 'o_z', 'alu_result', 32, 'El resultado se compara contra cero.', 'snap.signals.aluOut'),
    N('n_res_data', 'alu_result', 'o_data', 'alu_result', 32, 'Resultado de la operación elegida.', 'snap.signals.aluOut'),
    N('n_data_out', 'o_data', 'port:o_data', 'o_data', 32, 'Sale a EX/MEM (y a <code>redirect_target</code> si es JALR).', 'snap.signals.aluOut'),
    N('n_z_out', 'o_z', 'port:o_z', 'o_z', 1, 'Bandera que branch_unit usa en BEQ/BNE.', 'snap.signals.zero'),
    N('n_o_out', 'o_o', 'port:o_o', 'o_o', 1, 'Overflow: solo se ve en el bus de debug.'),
    N('n_lt_out', 'o_lt', 'port:o_lt', 'o_lt', 1, 'Bandera para BLT/BGE.', 'snap.signals.lt'),
    N('n_ltu_out', 'o_ltu', 'port:o_ltu', 'o_ltu', 1, 'Bandera para BLTU/BGEU.', 'snap.signals.ltu'),
  ],
};
