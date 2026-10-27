// isa.js - contenido didáctico del set de instrucciones RV32I tal como lo implementa
// el RTL de este repo (control.v / immgen.v). Sin DOM, sin imports.

export const FIELD_COLORS = {
  opcode: '#1aa3a1',
  rd: '#e5533d',
  rs1: '#4a7bd0',
  rs2: '#9b6ad6',
  funct3: '#f0a53a',
  funct7: '#157f7d',
  imm: '#c4892a',
};

// ---------------------------------------------------------------- control.v
const C = (o) => ({
  reg_write: 0, alu_src: 0, mem_read: 0, mem_write: 0, branch: 0, jump: 0, halt: 0,
  wb_sel: 0, alu_op: 'OP_ADD', imm_sel: 0, is_jalr: 0, is_auipc: 0, ...o,
});
const cR = (op) => C({ reg_write: 1, alu_src: 0, wb_sel: 0, alu_op: op });
const cI = (op) => C({ reg_write: 1, alu_src: 1, wb_sel: 0, imm_sel: 0, alu_op: op });
const cL = () => C({ reg_write: 1, alu_src: 1, mem_read: 1, wb_sel: 1, imm_sel: 0, alu_op: 'OP_ADD' });
const cS = () => C({ alu_src: 1, mem_write: 1, imm_sel: 1, alu_op: 'OP_ADD' });
const cB = (op) => C({ branch: 1, imm_sel: 2, alu_op: op });
const cSYS = () => C({ halt: 1 });

// --------------------------------------------------------------- tabla INSTR
// [mnemónico, fmt, nombre, semántica, descripción, ctrl, related]
// Las descripciones dicen siempre qué hace ESTA implementación (control.v, alu.v, dmem.v...), no una ISA genérica.
const T = [
  // ---- R
  ['add', 'R', 'Suma', 'rd ← rs1 + rs2',
    '<p>Suma dos registros y deja el resultado en <code>rd</code>. Codificación: opcode <code>0110011</code>, <code>funct3=000</code>, <code>funct7=0000000</code>. En esta implementación la ALU opera en <code>OP_ADD</code> y el desbordamiento se ignora: la aritmética es módulo 2<sup>32</sup> (la ALU calcula un flag de overflow, pero ninguna instrucción RV32I lo consulta).</p><p>Uso típico: <code>add x3, x1, x2</code> para sumar dos variables. Si el destino es <code>x0</code> el resultado se descarta, que es la forma de escribir un NOP "caro".</p>',
    cR('OP_ADD'), ['addi', 'sub', 'mv']],
  ['sub', 'R', 'Resta', 'rd ← rs1 − rs2',
    '<p>Resta <code>rs2</code> a <code>rs1</code>. Comparte opcode y <code>funct3</code> con <code>add</code>; solo se distinguen por el bit 30 de la instrucción (<code>funct7[5]=1</code>). control.v lo decodifica con <code>{funct7[5],funct3} = 4\'b1000</code>.</p><p>No existe un "subi": para restar una constante se usa <code>addi</code> con un inmediato negativo. <code>neg rd, rs</code> es <code>sub rd, x0, rs</code>.</p>',
    cR('OP_SUB'), ['add', 'neg']],
  ['and', 'R', 'AND bit a bit', 'rd ← rs1 & rs2',
    '<p>AND lógico bit a bit entre dos registros (<code>funct3=111</code>). Se usa para enmascarar bits, por ejemplo quedarse con los 8 bits bajos de una palabra o comprobar si un bit está encendido.</p>',
    cR('OP_AND'), ['andi', 'or', 'xor']],
  ['or', 'R', 'OR bit a bit', 'rd ← rs1 | rs2',
    '<p>OR lógico bit a bit (<code>funct3=110</code>). Sirve para encender bits o para combinar campos que ya fueron desplazados a su lugar dentro de una misma palabra.</p>',
    cR('OP_OR'), ['ori', 'and', 'xor']],
  ['xor', 'R', 'XOR bit a bit', 'rd ← rs1 ^ rs2',
    '<p>OR exclusivo bit a bit (<code>funct3=100</code>). Es la forma barata de comprobar igualdad (el resultado es 0 si los dos valores son iguales) y de invertir bits: <code>xori rd, rs, -1</code> es <code>not</code>.</p>',
    cR('OP_XOR'), ['xori', 'not']],
  ['slt', 'R', 'Set if less than (con signo)', 'rd ← (rs1 <s rs2) ? 1 : 0',
    '<p>Deja 1 en <code>rd</code> si <code>rs1</code> es menor que <code>rs2</code> interpretando ambos con signo, y 0 si no. En esta ALU la comparación sale de <code>o_lt</code>, una salida que se calcula siempre y que el <code>branch_unit</code> reutiliza para <code>blt</code>/<code>bge</code>.</p><p>Con esto el compilador implementa expresiones como <code>a &lt; b</code> sin necesidad de saltar.</p>',
    cR('OP_SLT'), ['slti', 'sltu', 'blt']],
  ['sltu', 'R', 'Set if less than (sin signo)', 'rd ← (rs1 <u rs2) ? 1 : 0',
    '<p>Igual que <code>slt</code> pero tratando los operandos como enteros sin signo (usa <code>o_ltu</code>). <code>sltu rd, x0, rs</code> es <code>snez</code>: 1 si <code>rs</code> es distinto de cero (nada es menor que 0 sin signo, así que 0 &lt; rs solo falla cuando rs es 0).</p>',
    cR('OP_SLTU'), ['sltiu', 'snez', 'bltu']],
  ['sll', 'R', 'Shift lógico a la izquierda', 'rd ← rs1 << rs2[4:0]',
    '<p>Desplaza <code>rs1</code> a la izquierda rellenando con ceros por la derecha. Solo cuentan los 5 bits bajos de <code>rs2</code> (en alu.v, <code>shamt = i_data_b[4:0]</code>): desplazar más de 31 no tiene sentido. Equivale a multiplicar por una potencia de 2.</p>',
    cR('OP_SLL'), ['slli', 'srl', 'sra']],
  ['srl', 'R', 'Shift lógico a la derecha', 'rd ← rs1 >>u rs2[4:0]',
    '<p>Desplaza a la derecha rellenando con ceros por la izquierda. Divide por una potencia de 2 si el número se interpreta sin signo. Usa solo los 5 bits bajos de <code>rs2</code>.</p>',
    cR('OP_SRL'), ['srli', 'sll', 'sra']],
  ['sra', 'R', 'Shift aritmético a la derecha', 'rd ← rs1 >>s rs2[4:0]',
    '<p>Desplaza a la derecha replicando el bit de signo. Divide por una potencia de 2 preservando el signo (con redondeo hacia −∞: <code>−8 &gt;&gt; 1 = −4</code>, <code>−7 &gt;&gt; 1 = −4</code>). Se distingue de <code>srl</code> por <code>funct7[5]=1</code>.</p>',
    cR('OP_SRA'), ['srai', 'srl', 'sll']],

  // ---- I (ALU)
  ['addi', 'I', 'Suma con inmediato', 'rd ← rs1 + sext(imm12)',
    '<p>Suma un inmediato de 12 bits con signo (−2048..2047) a <code>rs1</code>. Es la instrucción más versátil del conjunto: <code>addi x1, x0, 5</code> es <code>li x1, 5</code>, <code>addi rd, rs, 0</code> es <code>mv</code> y <code>addi x0, x0, 0</code> (<code>0x00000013</code>) es el <code>nop</code>.</p><p>En esta implementación el NOP es además la "instrucción vacía" con la que se rellenan la imem y IF/ID cuando se descarta algo.</p>',
    cI('OP_ADD'), ['li', 'mv', 'nop', 'add']],
  ['andi', 'I', 'AND con inmediato', 'rd ← rs1 & sext(imm12)',
    '<p>AND bit a bit con un inmediato extendido en signo. Atención: <code>andi x1, x2, -1</code> es un AND con 32 unos (copia <code>x2</code>), porque el inmediato se extiende en signo incluso en las operaciones lógicas. Típico: <code>andi x5, x5, 0xFF</code> para aislar un byte.</p>',
    cI('OP_AND'), ['and']],
  ['ori', 'I', 'OR con inmediato', 'rd ← rs1 | sext(imm12)',
    '<p>OR bit a bit con inmediato extendido en signo. Se usa para activar flags y, junto con <code>lui</code>, para armar constantes (aunque el compilador prefiere <code>lui</code> + <code>addi</code>).</p>',
    cI('OP_OR'), ['or', 'lui']],
  ['xori', 'I', 'XOR con inmediato', 'rd ← rs1 ^ sext(imm12)',
    '<p>XOR con inmediato. Con <code>imm = −1</code> invierte todos los bits (<code>not</code>), porque −1 extendido en signo son 32 unos.</p>',
    cI('OP_XOR'), ['xor', 'not']],
  ['slti', 'I', 'Set if less than inmediato (con signo)', 'rd ← (rs1 <s sext(imm12)) ? 1 : 0',
    '<p>Compara <code>rs1</code> con un inmediato con signo y deja 0 o 1. Sirve para evaluar <code>x &lt; 10</code> sin saltar.</p>',
    cI('OP_SLT'), ['slt']],
  ['sltiu', 'I', 'Set if less than inmediato (sin signo)', 'rd ← (rs1 <u sext(imm12)) ? 1 : 0',
    '<p>Como <code>slti</code> pero comparando sin signo. Trampa clásica: el inmediato primero se <b>extiende en signo</b> a 32 bits y recién después se compara como sin signo, así que <code>sltiu rd, rs, -1</code> compara contra 0xFFFFFFFF. <code>sltiu rd, rs, 1</code> es <code>seqz</code> (1 si <code>rs</code> es 0).</p>',
    cI('OP_SLTU'), ['sltu', 'seqz']],
  ['slli', 'I', 'Shift lógico izq. inmediato', 'rd ← rs1 << shamt',
    '<p>Desplaza a la izquierda una cantidad fija <code>shamt = inst[24:20]</code>; los 7 bits altos (<code>funct7</code>) valen 0. Se usa para calcular índices de arreglos: <code>slli x6, x5, 2</code> multiplica por 4, el tamaño de una palabra.</p>',
    cI('OP_SLL'), ['sll']],
  ['srli', 'I', 'Shift lógico der. inmediato', 'rd ← rs1 >>u shamt',
    '<p>Desplaza a la derecha rellenando con ceros una cantidad fija (<code>funct7 = 0000000</code>).</p>',
    cI('OP_SRL'), ['srl']],
  ['srai', 'I', 'Shift aritmético der. inmediato', 'rd ← rs1 >>s shamt',
    '<p>Desplaza a la derecha copiando el signo. Se distingue de <code>srli</code> porque <code>inst[30]=1</code> (<code>funct7 = 0100000</code>); control.v lo detecta con <code>funct7[5]</code>. Fijate que esos 7 bits son parte del campo del inmediato I: por eso la ALU enmascara <code>shamt</code> a 5 bits (<code>i_data_b[4:0]</code>), si no el <code>0100000</code> contaminaría la cantidad de desplazamiento.</p>',
    cI('OP_SRA'), ['sra']],

  // ---- Loads
  ['lb', 'I', 'Load byte (con signo)', 'rd ← sext(mem8[rs1 + sext(imm)])',
    '<p>Lee 1 byte de la dirección <code>rs1 + imm</code> y lo extiende en signo a 32 bits. En esta implementación dmem lee la palabra completa, elige el byte con <code>addr[1:0]</code> y lo rellena con <code>{{24{b[7]}}, b}</code>. El dato recién existe al final de MEM, por eso un consumidor inmediato provoca un load-use stall.</p>',
    cL(), ['lbu', 'sb', 'lw']],
  ['lh', 'I', 'Load halfword (con signo)', 'rd ← sext(mem16[rs1 + sext(imm)])',
    '<p>Lee 2 bytes y extiende el signo del bit 15. La dirección debe ser par: <b>en esta implementación no hay trap por acceso desalineado</b>, simplemente usa <code>addr[1]</code> para elegir la mitad de la palabra, así que una dirección impar daría un resultado sin sentido (otros diseños la tratan como excepción o la parten en dos accesos).</p>',
    cL(), ['lhu', 'sh']],
  ['lw', 'I', 'Load word', 'rd ← mem32[rs1 + sext(imm)]',
    '<p>Lee una palabra de 32 bits (dirección múltiplo de 4). La ALU calcula la dirección en EX, dmem lee en MEM y el mux <code>wb_sel=01</code> pone el dato en el camino de escritura. Es la causa del único stall de datos "legítimo" del pipeline (load-use).</p>',
    cL(), ['sw', 'lb', 'lhu']],
  ['lbu', 'I', 'Load byte (sin signo)', 'rd ← zext(mem8[rs1 + sext(imm)])',
    '<p>Lee 1 byte y lo extiende con ceros (<code>{24\'b0, b}</code>). Es la forma correcta de leer caracteres o datos <code>unsigned char</code>: con <code>lb</code>, el byte 0xFE se convertiría en 0xFFFFFFFE.</p>',
    cL(), ['lb', 'sb']],
  ['lhu', 'I', 'Load halfword (sin signo)', 'rd ← zext(mem16[rs1 + sext(imm)])',
    '<p>Lee 2 bytes y los extiende con ceros. Es la versión sin signo de <code>lh</code>.</p>',
    cL(), ['lh', 'sh']],

  // ---- Stores
  ['sb', 'S', 'Store byte', 'mem8[rs1 + sext(imm)] ← rs2[7:0]',
    '<p>Escribe el byte bajo de <code>rs2</code>. En dmem se activa un solo byte-enable (<code>be = 4\'b0001 &lt;&lt; addr[1:0]</code>) y el dato se replica en los carriles para que llegue al correcto. No escribe ningún registro, y los otros tres bytes de la palabra quedan intactos.</p>',
    cS(), ['lb', 'lbu', 'sh']],
  ['sh', 'S', 'Store halfword', 'mem16[rs1 + sext(imm)] ← rs2[15:0]',
    '<p>Escribe 2 bytes. <code>be</code> vale <code>0011</code> o <code>1100</code> según <code>addr[1]</code>. Requiere dirección par (en esta implementación no hay trap si no lo es).</p>',
    cS(), ['lh', 'lhu', 'sb', 'sw']],
  ['sw', 'S', 'Store word', 'mem32[rs1 + sext(imm)] ← rs2',
    '<p>Escribe los 32 bits de <code>rs2</code> (<code>be = 1111</code>). El inmediato está partido en dos (<code>imm[11:5]</code> arriba y <code>imm[4:0]</code> en el lugar donde otros formatos tienen <code>rd</code>) para que <code>rs1</code> y <code>rs2</code> queden siempre en las mismas posiciones. Típico: guardar una variable en el stack.</p><p>Un detalle de pipeline: el dato <code>rs2</code> no pasa por la ALU, pero igual puede depender de la instrucción anterior; el forwarding lo cubre porque el mux de rs2 está antes del mux del inmediato.</p>',
    cS(), ['lw', 'sb', 'sh']],

  // ---- Branches
  ['beq', 'B', 'Branch if equal', 'if (rs1 == rs2) PC ← PC + sext(imm)',
    '<p>Salta si los registros son iguales. La ALU resta (<code>OP_SUB</code>) y la bandera <code>zero</code> alimenta a <code>branch_unit</code>. El destino es <code>PC + imm</code>, donde PC es la dirección del propio branch (no la de la siguiente instrucción).</p><p>En esta implementación se resuelve en EX: si salta, se descartan las 2 instrucciones que ya se habían buscado después del branch (penalidad de 2 ciclos); si no salta, no cuesta nada.</p>',
    cB('OP_SUB'), ['bne', 'beqz']],
  ['bne', 'B', 'Branch if not equal', 'if (rs1 != rs2) PC ← PC + sext(imm)',
    '<p>Salta si son distintos (<code>~zero</code>). Típico para cerrar un loop: <code>bne x1, x2, loop</code>. Mismo costo que <code>beq</code>: 2 burbujas si se toma, ninguna si no.</p>',
    cB('OP_SUB'), ['beq', 'bnez']],
  ['blt', 'B', 'Branch if less than (con signo)', 'if (rs1 <s rs2) PC ← PC + sext(imm)',
    '<p>Salta si <code>rs1 &lt; rs2</code> con signo. control.v elige <code>OP_SLT</code> para <code>funct3=100/101</code> y branch_unit usa la salida <code>alu_lt</code>, que la ALU calcula siempre.</p>',
    cB('OP_SLT'), ['bge', 'bgt']],
  ['bge', 'B', 'Branch if greater or equal (con signo)', 'if (rs1 >=s rs2) PC ← PC + sext(imm)',
    '<p>Salta si <code>rs1 ≥ rs2</code> con signo (<code>~alu_lt</code>). RV32I no tiene "menor o igual" ni "mayor": se obtienen invirtiendo los operandos (<code>ble</code> y <code>bgt</code> son pseudoinstrucciones).</p>',
    cB('OP_SLT'), ['blt', 'ble']],
  ['bltu', 'B', 'Branch if less than (sin signo)', 'if (rs1 <u rs2) PC ← PC + sext(imm)',
    '<p>Como <code>blt</code> pero sin signo (<code>alu_ltu</code>). Útil para comparar direcciones o índices. Detalle de esta implementación: control.v deja <code>alu_op=OP_SUB</code> para BLTU/BGEU, porque la decisión no sale del resultado de la ALU sino de la salida <code>o_ltu</code>, que existe siempre.</p>',
    cB('OP_SUB'), ['bgeu', 'bgtu']],
  ['bgeu', 'B', 'Branch if greater or equal (sin signo)', 'if (rs1 >=u rs2) PC ← PC + sext(imm)',
    '<p>Como <code>bge</code> pero sin signo (<code>~alu_ltu</code>).</p>',
    cB('OP_SUB'), ['bltu', 'bleu']],

  // ---- Jumps
  ['jal', 'J', 'Jump and link', 'rd ← PC + 4; PC ← PC + sext(imm21)',
    '<p>Salto incondicional relativo al PC con alcance de ±1 MiB. Guarda la dirección de retorno <code>PC+4</code> en <code>rd</code> (en esta implementación viaja por <code>wb_sel=10</code>). <code>jal x0, off</code> es el <code>j</code> común (no guarda nada) y <code>jal ra, f</code> es una llamada a función.</p><p>Aunque su destino se conoce apenas se decodifica (no depende de ningún registro), <b>este core lo resuelve en EX</b> igual que un branch y descarta 2 instrucciones; otros diseños lo resuelven en ID y pierden solo 1.</p>',
    C({ reg_write: 1, jump: 1, wb_sel: 2, imm_sel: 4, alu_op: 'OP_ADD' }), ['jalr', 'j', 'call']],
  ['jalr', 'I', 'Jump and link register', 'rd ← PC + 4; PC ← (rs1 + sext(imm)) & ~1',
    '<p>Salto indirecto: el destino sale de un registro más un offset, con el bit 0 forzado a 0. En esta implementación la ALU suma <code>rs1 + imm</code> (<code>alu_src=1</code>) y <code>redirect_target = alu_out &amp; ~1</code>. <code>jalr x0, 0(ra)</code> es <code>ret</code>.</p><p>Es un hazard doble: de control (el destino no se sabe hasta EX) y de datos (necesita <code>rs1</code>, que puede venir por forwarding). Trampa de la ISA: si <code>rd == rs1</code>, el destino se calcula con el valor <b>viejo</b> de <code>rs1</code>; en el pipeline sale natural porque el destino se calcula en EX y <code>rd</code> se escribe recién en WB.</p>',
    C({ reg_write: 1, alu_src: 1, jump: 1, wb_sel: 2, imm_sel: 0, alu_op: 'OP_ADD', is_jalr: 1 }), ['jal', 'ret', 'jr']],

  // ---- U
  ['lui', 'U', 'Load upper immediate', 'rd ← imm20 << 12',
    '<p>Carga los 20 bits altos de una constante y deja los 12 bajos en cero. En esta implementación <b>la ALU no interviene</b>: <code>wb_sel=11</code> hace que el mux de MEM entregue directamente el inmediato (<code>mem_imm</code>), así que no hace falta agregar una operación "pasa B" a la ALU. Combinado con <code>addi</code> arma cualquier constante de 32 bits.</p>',
    C({ reg_write: 1, wb_sel: 3, imm_sel: 3 }), ['auipc', 'li', 'addi']],
  ['auipc', 'U', 'Add upper immediate to PC', 'rd ← PC + (imm20 << 12)',
    '<p>Suma un inmediato de 20 bits desplazado al PC de <b>esta</b> instrucción. Con él se calculan direcciones relativas al PC (código independiente de la posición). En el RTL el mux del operando A de la ALU elige <code>ex_pc</code> en lugar de <code>rs1</code> cuando <code>is_auipc=1</code>.</p>',
    C({ reg_write: 1, alu_src: 1, wb_sel: 0, imm_sel: 3, alu_op: 'OP_ADD', is_auipc: 1 }), ['lui', 'la', 'jalr']],

  // ---- System
  ['ecall', 'I', 'Llamada al entorno', 'halt ← 1',
    '<p>En un sistema completo genera una excepción hacia el sistema operativo (escribe CSRs y salta al vector de trap). Esta implementación no tiene CSRs ni modo privilegiado: <b>cualquier</b> opcode SYSTEM (<code>1110011</code>) activa <code>halt</code>. El CPU deja de buscar instrucciones, retira todo lo anterior y levanta <code>o_halt</code> cuando la instrucción llega a WB.</p>',
    cSYS(), ['ebreak']],
  ['ebreak', 'I', 'Breakpoint', 'halt ← 1',
    '<p>Pensada en la ISA para que un depurador tome el control. Acá se comporta igual que <code>ecall</code> y es la forma estándar de terminar un programa: detiene el pipeline y la debug unit responde <code>H</code> por UART. Cada programa de ejemplo termina con <code>ebreak</code>; sin él, el PC seguiría recorriendo la imem llena de NOPs.</p>',
    cSYS(), ['ecall']],
  ['fence', 'I', 'Fence (NOP en este core)', '(sin efecto)',
    '<p>Ordena accesos a memoria en sistemas con varios agentes o cachés. Como este core es in-order, con una sola memoria de datos y sin caché, control.v cae en <code>default</code> (todas las señales en 0) y se ejecuta como un NOP.</p>',
    C({}), ['nop']],
];

export const INSTR = {};
for (const [m, fmt, name, semantics, description, ctrl, related] of T) {
  INSTR[m] = { mnemonic: m, fmt, name, semantics, description, ctrl, related };
}

// ---------------------------------------------------------------- FORMATOS
const lay = (parts) => parts;
export const FORMATS = {
  R: {
    name: 'Tipo R (registro-registro)',
    layout: lay(['funct7[31:25]', 'rs2[24:20]', 'rs1[19:15]', 'funct3[14:12]', 'rd[11:7]', 'opcode[6:0]']),
    imm_sel: null,
    html: '<p>Dos registros fuente y uno destino. No lleva inmediato. <code>funct3</code> y <code>funct7</code> eligen la operación dentro del opcode <code>0110011</code>; control.v los junta como <code>{funct7[5],funct3}</code> para fijar <code>alu_op</code>.</p>',
    why: 'No hay inmediato, así que no hay bits que reacomodar.',
  },
  I: {
    name: 'Tipo I (inmediato / loads / jalr)',
    layout: lay(['imm[11:0] (31:20)', 'rs1[19:15]', 'funct3[14:12]', 'rd[11:7]', 'opcode[6:0]']),
    imm_sel: 0,
    html: '<p>Un registro fuente, un inmediato de 12 bits con signo y un destino. Lo usan las operaciones ALU con inmediato, los loads, <code>jalr</code> y SYSTEM. En <code>slli/srli/srai</code> los 7 bits altos del inmediato actúan como <code>funct7</code> y los 5 bajos son <code>shamt</code>.</p><p>immgen: <code>{{20{instr[31]}}, instr[31:20]}</code>.</p>',
    why: 'El inmediato ocupa un bloque contiguo, es el formato "natural". El bit 31 siempre es el signo.',
  },
  S: {
    name: 'Tipo S (stores)',
    layout: lay(['imm[11:5] (31:25)', 'rs2[24:20]', 'rs1[19:15]', 'funct3[14:12]', 'imm[4:0] (11:7)', 'opcode[6:0]']),
    imm_sel: 1,
    html: '<p>Dos registros fuente (base y dato) y un inmediato de 12 bits partido en dos trozos. No hay <code>rd</code>: un store no escribe registros.</p><p>immgen: <code>{{20{instr[31]}}, instr[31:25], instr[11:7]}</code>.</p>',
    why: 'Como no hay <code>rd</code>, el hardware reutiliza esos 5 bits (11:7) para la parte baja del inmediato. Así <code>rs1</code> y <code>rs2</code> quedan en las mismas posiciones que en tipo R y el regfile se puede leer sin esperar a decodificar.',
  },
  B: {
    name: 'Tipo B (branches)',
    layout: lay(['imm[12|10:5] (31:25)', 'rs2[24:20]', 'rs1[19:15]', 'funct3[14:12]', 'imm[4:1|11] (11:7)', 'opcode[6:0]']),
    imm_sel: 2,
    html: '<p>Igual que S pero el inmediato representa un offset <b>en bytes</b> múltiplo de 2 (el bit 0 es siempre 0 y no se guarda), con alcance ±4 KiB. Orden de bits: <code>imm[12], imm[10:5]</code> arriba y <code>imm[4:1], imm[11]</code> abajo.</p><p>immgen: <code>{{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1\'b0}</code>.</p>',
    why: 'Se partió el inmediato para mantener cada bit en la posición más parecida a la de S y J: el bit de signo siempre es <code>inst[31]</code> (extensión de signo rápida) y el bit 11 de S pasó a la posición 7 en B porque el bit 0 ya no hace falta. Es una decisión de costo en hardware, no de legibilidad: el mux de immgen necesita muy pocos cables distintos.',
  },
  U: {
    name: 'Tipo U (constantes altas)',
    layout: lay(['imm[31:12] (31:12)', 'rd[11:7]', 'opcode[6:0]']),
    imm_sel: 3,
    html: '<p>Un destino y un inmediato de 20 bits que se coloca directamente en los bits 31:12. Lo usan <code>lui</code> y <code>auipc</code>.</p><p>immgen: <code>{instr[31:12], 12\'b0}</code>.</p>',
    why: 'No hace falta reacomodar: los 20 bits se copian en el mismo lugar y los 12 bajos se rellenan con ceros.',
  },
  J: {
    name: 'Tipo J (jal)',
    layout: lay(['imm[20|10:1|11|19:12] (31:12)', 'rd[11:7]', 'opcode[6:0]']),
    imm_sel: 4,
    html: '<p>Un destino y un offset de 21 bits con signo (múltiplo de 2) con alcance ±1 MiB. Los bits aparecen en el orden <code>imm[20], imm[10:1], imm[11], imm[19:12]</code>.</p><p>immgen: <code>{{11{instr[31]}}, instr[31], instr[19:12], instr[20], instr[30:21], 1\'b0}</code>.</p>',
    why: 'Los bits <code>19:12</code> quedan en la misma posición que en U (12..19), el bit 11 ocupa el lugar del antiguo bit 0 de B (posición 20) y el signo sigue en el 31. Se sacrifica legibilidad para que immgen comparta casi todos sus cables entre formatos.',
  },
};

// ------------------------------------------------------------- decodificación
const bitsOf = (w, hi, lo) => (w >>> lo) & (hi - lo === 31 ? 0xffffffff : ((1 << (hi - lo + 1)) - 1));
const toBin = (v, n) => (v >>> 0).toString(2).padStart(n, '0');
const sext = (v, bitsN) => (bitsN >= 32 ? v | 0 : (v << (32 - bitsN)) >> (32 - bitsN));

function mkField(w, name, hi, lo, kind, label) {
  const n = hi - lo + 1;
  const v = bitsOf(w, hi, lo);
  return { name: label || name, kind, hi, lo, bits: toBin(v, n), value: v >>> 0, color: FIELD_COLORS[kind] };
}

const OPC = {
  0b0110011: 'R', 0b0010011: 'I', 0b0000011: 'I', 0b0100011: 'S', 0b1100011: 'B',
  0b1101111: 'J', 0b1100111: 'I', 0b0110111: 'U', 0b0010111: 'U', 0b1110011: 'I', 0b0001111: 'I',
};

function mnemonicOf(w) {
  const op = w & 0x7f, f3 = (w >>> 12) & 7, f7 = (w >>> 25) & 0x7f;
  switch (op) {
    case 0x33: {
      const k = `${f7}-${f3}`;
      return ({ '0-0': 'add', '32-0': 'sub', '0-7': 'and', '0-6': 'or', '0-4': 'xor', '0-2': 'slt', '0-3': 'sltu', '0-1': 'sll', '0-5': 'srl', '32-5': 'sra' })[k] || null;
    }
    case 0x13:
      if (f3 === 1) return f7 === 0 ? 'slli' : null;
      if (f3 === 5) return f7 === 0 ? 'srli' : f7 === 32 ? 'srai' : null;
      return ({ 0: 'addi', 7: 'andi', 6: 'ori', 4: 'xori', 2: 'slti', 3: 'sltiu' })[f3] || null;
    case 0x03: return ({ 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' })[f3] || null;
    case 0x23: return ({ 0: 'sb', 1: 'sh', 2: 'sw' })[f3] || null;
    case 0x63: return ({ 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' })[f3] || null;
    case 0x6f: return 'jal';
    case 0x67: return 'jalr';
    case 0x37: return 'lui';
    case 0x17: return 'auipc';
    case 0x73: return w >>> 20 === 1 ? 'ebreak' : 'ecall';
    case 0x0f: return 'fence';
    default: return null;
  }
}

function immOf(w, fmt) {
  switch (fmt) {
    case 'I': return sext(w >>> 20, 12);
    case 'S': return sext(((w >>> 25) << 5) | ((w >>> 7) & 0x1f), 12);
    case 'B': return sext((((w >>> 31) & 1) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 0x3f) << 5) | (((w >>> 8) & 0xf) << 1), 13);
    case 'U': return (w & 0xfffff000) | 0;
    case 'J': return sext((((w >>> 31) & 1) << 20) | (((w >>> 12) & 0xff) << 12) | (((w >>> 20) & 1) << 11) | (((w >>> 21) & 0x3ff) << 1), 21);
    default: return 0;
  }
}

function fieldsOf(w, fmt, mn) {
  const F = (n, hi, lo, k, l) => mkField(w, n, hi, lo, k, l);
  switch (fmt) {
    case 'R': return [F('funct7', 31, 25, 'funct7'), F('rs2', 24, 20, 'rs2'), F('rs1', 19, 15, 'rs1'), F('funct3', 14, 12, 'funct3'), F('rd', 11, 7, 'rd'), F('opcode', 6, 0, 'opcode')];
    case 'I':
      if (mn === 'slli' || mn === 'srli' || mn === 'srai') {
        return [F('funct7', 31, 25, 'funct7'), F('shamt', 24, 20, 'imm', 'shamt[4:0]'), F('rs1', 19, 15, 'rs1'), F('funct3', 14, 12, 'funct3'), F('rd', 11, 7, 'rd'), F('opcode', 6, 0, 'opcode')];
      }
      return [F('imm', 31, 20, 'imm', 'imm[11:0]'), F('rs1', 19, 15, 'rs1'), F('funct3', 14, 12, 'funct3'), F('rd', 11, 7, 'rd'), F('opcode', 6, 0, 'opcode')];
    case 'S': return [F('imm', 31, 25, 'imm', 'imm[11:5]'), F('rs2', 24, 20, 'rs2'), F('rs1', 19, 15, 'rs1'), F('funct3', 14, 12, 'funct3'), F('imm', 11, 7, 'imm', 'imm[4:0]'), F('opcode', 6, 0, 'opcode')];
    case 'B': return [F('imm', 31, 25, 'imm', 'imm[12|10:5]'), F('rs2', 24, 20, 'rs2'), F('rs1', 19, 15, 'rs1'), F('funct3', 14, 12, 'funct3'), F('imm', 11, 7, 'imm', 'imm[4:1|11]'), F('opcode', 6, 0, 'opcode')];
    case 'U': return [F('imm', 31, 12, 'imm', 'imm[31:12]'), F('rd', 11, 7, 'rd'), F('opcode', 6, 0, 'opcode')];
    case 'J': return [F('imm', 31, 12, 'imm', 'imm[20|10:1|11|19:12]'), F('rd', 11, 7, 'rd'), F('opcode', 6, 0, 'opcode')];
    default: return [F('opcode', 6, 0, 'opcode')];
  }
}

const hex = (v) => '0x' + (v >>> 0).toString(16);

function asmOf(w, mn, fmt, imm, pc) {
  const rd = `x${(w >>> 7) & 31}`, rs1 = `x${(w >>> 15) & 31}`, rs2 = `x${(w >>> 20) & 31}`;
  if (!mn) return `.word ${hex(w)}`;
  switch (mn) {
    case 'ecall': case 'ebreak': case 'fence': return mn;
    case 'lb': case 'lh': case 'lw': case 'lbu': case 'lhu': return `${mn} ${rd}, ${imm}(${rs1})`;
    case 'sb': case 'sh': case 'sw': return `${mn} ${rs2}, ${imm}(${rs1})`;
    case 'jalr': return `jalr ${rd}, ${imm}(${rs1})`;
    case 'jal': return `jal ${rd}, ${imm}`;
    case 'lui': case 'auipc': return `${mn} ${rd}, ${hex(imm >>> 12)}`;
    case 'slli': case 'srli': case 'srai': return `${mn} ${rd}, ${rs1}, ${(w >>> 20) & 31}`;
  }
  if (fmt === 'R') return `${mn} ${rd}, ${rs1}, ${rs2}`;
  if (fmt === 'I') return `${mn} ${rd}, ${rs1}, ${imm}`;
  if (fmt === 'B') return `${mn} ${rs1}, ${rs2}, ${imm}`;
  return mn;
}

function pseudoOf(w, mn) {
  const rd = (w >>> 7) & 31, rs1 = (w >>> 15) & 31, imm = w >> 20;
  if (w === 0x13) return 'nop';
  if (mn === 'addi' && imm === 0 && rd !== 0) return `mv x${rd}, x${rs1}`;
  if (mn === 'addi' && rs1 === 0 && rd !== 0) return `li x${rd}, ${imm}`;
  if (mn === 'jalr' && rd === 0 && rs1 === 1 && imm === 0) return 'ret';
  if (mn === 'jal' && rd === 0) return 'j';
  if (mn === 'jal' && rd === 1) return 'call';
  return null;
}

/** Decodifica una palabra de 32 bits. `pc` es opcional (permite calcular `target`). */
export function isaCard(word, pc) {
  const w = word >>> 0;
  const op = w & 0x7f;
  const fmt = OPC[op] || null;
  const mn = mnemonicOf(w);
  const info = mn ? INSTR[mn] : null;
  const f = fmt || 'R';
  const immValue = fmt ? ((mn === 'slli' || mn === 'srli' || mn === 'srai') ? (w >>> 20) & 31 : immOf(w, fmt)) : 0;
  const card = {
    word: w,
    hex: '0x' + w.toString(16).padStart(8, '0'),
    binary: toBin(w, 32),
    mnemonic: mn || 'desconocida',
    valid: !!info,
    fmt: info ? info.fmt : fmt,
    fields: fmt ? fieldsOf(w, f, mn) : [mkField(w, 'opcode', 6, 0, 'opcode')],
    immValue,
    asm: asmOf(w, mn, fmt, immValue, pc),
    pseudo: mn ? pseudoOf(w, mn) : null,
    semantics: info ? info.semantics : 'Instrucción no soportada: control.v la trata como NOP (todas las señales en 0).',
    description: info ? info.description : '<p>El opcode no corresponde a una instrucción RV32I implementada.</p>',
    name: info ? info.name : 'Desconocida',
    ctrl: info ? info.ctrl : C({}),
    related: info ? info.related : [],
    format: fmt ? FORMATS[fmt] : null,
  };
  if (typeof pc === 'number' && (mn === 'jal' || fmt === 'B')) card.target = (pc + immValue) >>> 0;
  return card;
}
