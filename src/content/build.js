// build.js - material práctico para "Construí tu propio RISC-V". Sin DOM.
//
// BUILD_CHECKLIST: la lista de decisiones y preparativos que conviene tener resueltos ANTES de escribir la primera línea de Verilog.
//   [{ id, group: 'Entender'|'Diseñar'|'Preparar', title, detail: html, step: id de la lección 'construir' relacionada }]
//
// TEST_CATEGORIES: programas de prueba por categoría, cada uno con su resultado esperado (verificado con el simulador de
//   esta página y, salvo el caso marcado, contra el modelo de referencia host/tests/rv32i_model.py).
//   [{ id, title, what: html, why: html,
//      programs: [{ title, code, expect: { regs, mem }, stats?: { retired, stalls, redirects, cycles }, note?: html,
//                   knownIssue?: { html, simulated: { regs, mem } }, neverHalts?: true }] }]
//   - `expect.regs`: valores finales (también los ceros que importan: "esta instrucción NO debe ejecutarse").
//   - `expect.mem`: índice de PALABRA de dmem -> valor.
//   - `stats`: con forwarding activado. cycles = 4 + retired + stalls + 2·redirects (4 de llenado, 2 burbujas por salto tomado).
//   Cualquiera de estos programas se puede pegar en el editor de ensamblador de la web y ejecutar.
import { githubUrl } from './repo.js';

const TB = 'https://github.com/MateoBernardi/arquitectura-de-computadoras/blob/tp3-RISCV/project_4/project_4.srcs/sim_1/new/';
const HOST = 'https://github.com/MateoBernardi/arquitectura-de-computadoras/blob/tp3-RISCV/project_4/host/';
const a = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;
const gh = (file, sym, text) => a(githubUrl(file, sym), text);

export const BUILD_CHECKLIST = [
  // ---- Entender
  {
    id: 'etapas-y-registros', group: 'Entender', step: 'build-3-segmentar',
    title: 'Puedo explicar qué hace cada etapa y qué viaja en cada registro de pipeline',
    detail: `<p>Test rápido: ¿qué pasaría si en WB usaras el <code>rd</code> que está hoy en IF/ID? Pertenece a otra instrucción, tres posiciones más atrás. El número de registro destino tiene que viajar desde ID hasta MEM/WB junto con el dato. En este repo, ${gh('pipeline/regs/pipe_reg.v', 'module:id_ex_reg', 'pipe_reg.v')} lista exactamente qué lleva cada frontera.</p>`,
  },
  {
    id: 'tabla-codificacion', group: 'Entender', step: 'build-1-subconjunto',
    title: 'Tengo mi propia tabla de codificación: opcode, funct3 y funct7 de cada instrucción',
    detail: `<p>Armala vos desde la especificación oficial, no copiada de otro lado: te sirve tres veces (decodificador, ensamblador y desensamblador). Referencia de cómo queda en este repo: ${gh('pipeline/2_decode/control.v', 'module:control', 'control.v')}.</p>`,
  },
  {
    id: 'tabla-inmediatos', group: 'Entender', step: 'build-2-monociclo',
    title: 'Tengo la tabla de armado del inmediato para I, S, B, U y J',
    detail: `<p>Una tabla con los 32 bits del inmediato final en columnas y los cinco formatos en filas; en cada celda, qué bit de la instrucción va ahí (o "signo", o "0"). Esa tabla <i>es</i> el diseño del módulo. Ver ${gh('pipeline/2_decode/immgen.v', 'module:immgen', 'immgen.v')}.</p>`,
  },
  {
    id: 'tabla-control', group: 'Entender', step: 'build-2-monociclo',
    title: 'Tengo la tabla de señales de control para cada instrucción',
    detail: '<p>Filas = instrucciones, columnas = señales (<code>reg_write</code>, <code>alu_src</code>, <code>mem_read</code>, <code>mem_write</code>, <code>branch</code>, <code>jump</code>, <code>wb_sel</code>, <code>alu_op</code>, <code>imm_sel</code>...). Incluí las que no existen en el libro y tu diseño necesita (por ejemplo, una bandera de halt). Las fichas de instrucción de esta web muestran la tabla de este repo.</p>',
  },
  // ---- Diseñar
  {
    id: 'datapath-dibujado', group: 'Diseñar', step: 'build-4-hazards-datos',
    title: 'Dibujé el datapath completo con registros de pipeline, forwarding y detección de riesgos',
    detail: '<p>En papel, antes del código. Dibujá la unidad de forwarding y la de detección de riesgos como bloques separados y anotá qué entradas necesita cada una y de qué registros salen. El tablero 3D de esta web es el dibujo de este repo.</p>',
  },
  {
    id: 'saltos-etapa', group: 'Diseñar', step: 'build-5-hazards-control',
    title: 'Decidí en qué etapa resuelvo branches, jal y jalr, y lo justifiqué',
    detail: '<p>Justificalo con la tabla de costos: resolver en EX descarta 2 instrucciones y no cuesta hardware; resolver en ID descarta 1 pero necesita comparador, sumador y forwarding hacia ID. JAL, JALR y los branches no tienen por qué resolverse en la misma etapa. Este repo resuelve todo en EX.</p>',
  },
  {
    id: 'memorias-lectura', group: 'Diseñar', step: 'build-6-memorias-fpga',
    title: 'Decidí cómo encaja la lectura de las memorias (combinacional o síncrona) en IF y MEM',
    detail: `<p>Una BRAM de lectura síncrona entrega el dato un ciclo después de presentar la dirección; una LUTRAM, en el mismo ciclo. Esta decisión cambia el diseño de IF y de MEM. Este repo usa memorias de lectura combinacional (${gh('pipeline/1_fetch/imem.v', 'module:imem', 'imem.v')}, ${gh('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v')}), que caben como RAM distribuida por ser de 1 KB.</p>`,
  },
  {
    id: 'pausa-sin-reloj', group: 'Diseñar', step: 'build-8-debug-unit',
    title: 'Decidí cómo se detiene y avanza el procesador sin tocar el reloj',
    detail: `<p>Lista qué módulos obedecen la señal de habilitación (pipeline, regfile, memoria de datos) y cuáles tienen que seguir funcionando siempre (UART, debug unit). Este repo usa un <code>enable</code> síncrono en todos los registros del CPU: ${gh('pipeline/regs/pipe_reg.v', 'module:if_id_reg', 'pipe_reg.v')}.</p>`,
  },
  {
    id: 'halt-codificacion', group: 'Diseñar', step: 'build-8-debug-unit',
    title: 'Elegí la codificación de HALT y cómo se vacía el pipeline',
    detail: '<p>Tres opciones: un opcode no usado, <code>ebreak</code> o la palabra 0. Y la pregunta de fondo: ¿en qué etapa lo detectás para no detenerte por una instrucción especulativa (la que sigue a un branch tomado)? Este repo usa ebreak/ecall (cualquier opcode SYSTEM) y lo detecta en EX.</p>',
  },
  {
    id: 'protocolo-fsm', group: 'Diseñar', step: 'build-8-debug-unit',
    title: 'Definí el protocolo UART y dibujé el diagrama de estados de la debug unit',
    detail: `<p>Comandos, delimitación de mensajes, confirmaciones (ACK/NAK), orden de bytes y qué pasa con un comando desconocido. Dibujá los estados antes de escribir una línea. Este repo: ${gh('debug/debug_unit.v', 'module:debug_unit', 'debug_unit.v')} documenta el protocolo en su cabecera.</p>`,
  },
  {
    id: 'casos-borde', group: 'Diseñar', step: 'build-1-subconjunto',
    title: 'Decidí qué hace el procesador con un acceso desalineado, con un PC fuera de memoria y con un programa sin HALT',
    detail: '<p>Son decisiones tuyas (la ISA permite trap o soporte por hardware), pero hay que tomarlas y documentarlas. Este repo no soporta accesos desalineados, deja que el PC dé la vuelta por la imem (que está llena de NOPs) y requiere un <code>ebreak</code> para terminar.</p>',
  },
  // ---- Preparar
  {
    id: 'plan-de-pruebas', group: 'Preparar', step: 'build-11-verificacion',
    title: 'Sé cómo voy a probar cada módulo antes de integrarlo',
    detail: '<p>Un testbench por módulo (ALU, immgen, regfile, control, UART), luego pipeline con programas cortos, luego sistema completo con una PC simulada mandando bytes, y recién después hardware (empezando por un loopback de la UART).</p>',
  },
  {
    id: 'golden-model', group: 'Preparar', step: 'build-11-verificacion',
    title: 'Tengo un modelo de referencia que ejecuta una instrucción por vez',
    detail: `<p>Un simulador simple, en el lenguaje que prefieras, que genere el estado final esperado para cualquier programa. En este repo: ${a(HOST + 'tests/rv32i_model.py', 'host/tests/rv32i_model.py')}.</p>`,
  },
  {
    id: 'placa-y-pines', group: 'Preparar', step: 'build-10-timing',
    title: 'Identifiqué la placa, su oscilador y los pines de la UART',
    detail: `<p>Sin la restricción de reloj y los pines correctos en el archivo <code>.xdc</code> la herramienta no puede verificar timing ni conectar nada. En este repo: ${a('https://github.com/MateoBernardi/arquitectura-de-computadoras/blob/tp3-RISCV/project_4/project_4.srcs/constrs_1/imports/Downloads/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc')} (oscilador de 100 MHz, UART, LEDs y reset).</p>`,
  },
  {
    id: 'camino-critico-predicho', group: 'Preparar', step: 'build-10-timing',
    title: 'Anoté mi predicción del camino crítico y de la frecuencia objetivo',
    detail: '<p>Antes de mirar el reporte de timing: ¿qué creés que tarda más, leer una memoria, sumar 32 bits o pasar por un mux grande? Anotalo y comparalo después. Si tu WNS es negativo, la alternativa es bajar la frecuencia o agregar un registro en ese camino.</p>',
  },
  {
    id: 'git', group: 'Preparar', step: 'build-11-verificacion',
    title: 'Uso control de versiones desde el primer día',
    detail: '<p>Cuando algo que funcionaba se rompa, vas a querer saber qué cambió. Un commit por cada módulo que pasa su testbench es una buena regla.</p>',
  },
];

export const TEST_CATEGORIES = [
  {
    id: 'instrucciones',
    title: 'Cada instrucción por separado',
    what: '<p>Una prueba por instrucción, con valores positivos, negativos y de borde: el mayor y menor inmediato, el entero más negativo (<code>0x80000000</code>), el desborde, comparaciones con y sin signo sobre los mismos bits, y el inmediato extendido en signo en las operaciones lógicas.</p>',
    why: '<p>Antes de tocar el pipeline hay que saber que la ALU, el generador de inmediatos y el control funcionan. Los errores típicos de esta etapa son confundir con signo y sin signo (<code>slt</code> vs <code>sltu</code>), olvidar que <code>sltiu</code> extiende el signo del inmediato antes de comparar sin signo, y que <code>andi</code>/<code>ori</code>/<code>xori</code> también extienden en signo.</p>',
    programs: [
      {
        title: 'Aritmética, lógica y comparaciones en los límites',
        code: `# Instrucciones R e I con valores positivos, negativos y límites
addi x1, x0, 2047       # mayor inmediato positivo de 12 bits
addi x2, x0, -2048      # menor inmediato de 12 bits
add  x3, x1, x1         # 2047 + 2047 = 4094
sub  x4, x2, x1         # -2048 - 2047 = -4095
lui  x5, 0x80000        # 0x80000000 (el entero más negativo)
addi x6, x5, -1         # 0x7FFFFFFF: el desborde no genera trap
add  x7, x6, x6         # 0xFFFFFFFE (se interpreta como -2)
slt  x8, x5, x6         # con signo: INT_MIN < INT_MAX -> 1
sltu x9, x5, x6         # sin signo: 0x80000000 < 0x7FFFFFFF -> 0
slti x10, x2, -1        # -2048 < -1 -> 1
sltiu x11, x2, -1       # 0xFFFFF800 < 0xFFFFFFFF (el -1 se extiende en signo) -> 1
xori x12, x1, -1        # not de 2047 -> 0xFFFFF800
andi x13, x2, -1        # andi con -1 copia el registro -> 0xFFFFF800
ori  x14, x0, 0x7ff     # 0x7FF
and  x15, x3, x1        # 4094 & 2047 = 2046
or   x16, x3, x1        # 4094 | 2047 = 4095
xor  x17, x3, x1        # 4094 ^ 2047 = 2049
ebreak
`,
        expect: { regs: { x1: 0x7ff, x2: 0xfffff800, x3: 0xffe, x4: 0xfffff001, x5: 0x80000000, x6: 0x7fffffff, x7: 0xfffffffe, x8: 0x1, x10: 0x1, x11: 0x1, x12: 0xfffff800, x13: 0xfffff800, x14: 0x7ff, x15: 0x7fe, x16: 0xfff, x17: 0x801, x9: 0 }, mem: {} },
        stats: { retired: 18, stalls: 0, redirects: 0, cycles: 22 },
        note: '<p>Se ejecuta sin saltos, así que cada resultado se puede verificar a mano. <code>x9 = 0</code> (sltu) y <code>x8 = 1</code> (slt) comparan los mismos bits y dan distinto: es la prueba de que la ALU distingue con y sin signo.</p>',
      },
    ],
  },
  {
    id: 'forwarding',
    title: 'Forwarding y bypass',
    what: '<p>Dependencias a distancia 1, 2, 3 y 4, en <code>rs1</code>, en <code>rs2</code> y en el dato de un store (que no pasa por la ALU pero también puede depender de la instrucción anterior). También el mismo registro como fuente y destino.</p>',
    why: '<p>Cada distancia ejercita un mecanismo distinto: 1 = forwarding desde EX/MEM, 2 = desde MEM/WB, 3 = bypass interno del regfile, 4 o más = lectura normal. Un error en un solo operando o una sola distancia casi siempre deja un registro con un valor viejo. Hay que variar también cuál de los dos operandos depende: un bug en el mux B no se ve si solo se prueba el A.</p>',
    programs: [
      {
        title: 'Distancias 1 a 4, rs1, rs2 y dato de store',
        code: `# Dependencias a distancia 1, 2, 3 y 4, en rs1, rs2 y en el dato de un store
addi x1, x0, 10         # x1 = 10
add  x2, x1, x1         # distancia 1 en rs1 y rs2 -> 20
add  x3, x2, x1         # x2 a distancia 1 (rs1), x1 a distancia 2 (rs2) -> 30
add  x4, x1, x3         # x1 a distancia 3 (bypass del regfile), x3 a distancia 1 -> 40
add  x5, x4, x2         # x4 distancia 1, x2 distancia 3 -> 60
addi x6, x0, 1          # relleno
addi x7, x0, 2          # relleno
addi x8, x0, 3          # relleno
add  x9, x5, x0         # x5 a distancia 4: lectura normal -> 60
sw   x9, 0(x0)          # dato del store con distancia 1: forwarding sobre rs2 -> mem[0] = 60
addi x10, x0, 7
sw   x10, 4(x0)         # dato con distancia 1 -> mem[1] = 7
add  x11, x10, x10      # x10 con distancia 2 -> 14
add  x12, x11, x10      # x11 distancia 1, x10 distancia 3 -> 21
add  x12, x12, x12      # mismo registro como fuente y destino -> 42
ebreak
`,
        expect: { regs: { x1: 0xa, x2: 0x14, x3: 0x1e, x4: 0x28, x5: 0x3c, x6: 0x1, x7: 0x2, x8: 0x3, x9: 0x3c, x10: 0x7, x11: 0xe, x12: 0x2a }, mem: { 0: 0x3c, 1: 0x7 } },
        stats: { retired: 16, stalls: 0, redirects: 0, cycles: 20 },
        note: '<p>No debería haber ningún stall (<code>stalls = 0</code>): todo se resuelve con forwarding y bypass. Si en tu diseño aparecen stalls acá, algo está frenando de más.</p>',
      },
    ],
  },
  {
    id: 'load-use',
    title: 'Load-use',
    what: '<p>Un load seguido inmediatamente de una instrucción que usa su resultado: como <code>rs1</code>, como <code>rs2</code> y como dato de un store. Y, de contraste, un load con una instrucción independiente en el medio (no debe haber stall).</p>',
    why: '<p>Es el hazard de datos que el forwarding no resuelve. Un detector que solo mire <code>rs1</code> pasa el primer caso y falla el segundo; uno que ignore los stores falla el tercero. El caso de contraste verifica que el stall no se dispara de más.</p>',
    programs: [
      {
        title: 'Load-use en rs1, en rs2 y en el dato de un store',
        code: `# Load seguido del uso inmediato: en rs1, en rs2, y como dato de un store
addi x1, x0, 40
sw   x1, 0(x0)          # mem[0] = 40
addi x9, x0, 2
lw   x2, 0(x0)          # x2 = 40
add  x3, x2, x9         # usa x2 en rs1 inmediatamente -> stall; x3 = 42
lw   x4, 0(x0)          # x4 = 40
add  x5, x9, x4         # usa x4 en rs2 inmediatamente -> stall; x5 = 42
lw   x6, 0(x0)          # x6 = 40
sw   x6, 4(x0)          # el dato del store depende del load -> stall; mem[1] = 40
lw   x7, 0(x0)          # x7 = 40
addi x10, x0, 5         # instrucción independiente entre el load y su uso: sin stall
add  x8, x7, x10        # x7 llega por forwarding MEM/WB -> 45
ebreak
`,
        expect: { regs: { x1: 0x28, x2: 0x28, x3: 0x2a, x4: 0x28, x5: 0x2a, x6: 0x28, x7: 0x28, x8: 0x2d, x9: 0x2, x10: 0x5 }, mem: { 0: 0x28, 1: 0x28 } },
        stats: { retired: 13, stalls: 3, redirects: 0, cycles: 20 },
        note: '<p>Tres stalls (uno por cada uso inmediato) y ninguno para el cuarto load, que tiene una instrucción independiente en el medio. Para ver la diferencia en ciclos: <code>cycles = 4 + retired + stalls + 2·redirects</code>.</p>',
      },
    ],
  },
  {
    id: 'x0',
    title: 'El registro x0',
    what: '<p>Escribir en <code>x0</code> con una instrucción ALU, con <code>lui</code> y con un load, y luego usar <code>x0</code> como fuente inmediatamente después. Nunca debe haber forwarding de ese valor.</p>',
    why: '<p>En el hardware <code>x0</code> no es "un registro que vale 0": es una excepción en tres lugares. El regfile ignora la escritura y devuelve 0 en la lectura, y la unidad de forwarding (y la de hazards) debe ignorar los destinos iguales a 0. Si falta la condición <code>rd != 0</code> en el forwarding, el valor "escrito" en x0 se cuela en la instrucción siguiente.</p>',
    programs: [
      {
        title: 'Escrituras a x0 y uso inmediato',
        code: `# x0 vale siempre 0: escribirlo no debe tener efecto ni producir forwarding
addi x0, x0, 5         # intento escribir 5 en x0
add  x1, x0, x0        # debe dar 0 (nunca forwarding del 5)
addi x2, x0, 7         # x2 = 7
add  x0, x2, x2        # intento escribir 14 en x0
addi x3, x0, 1         # x0 sigue valiendo 0 -> x3 = 1
lui  x0, 0x12345       # lui sobre x0 tampoco escribe
add  x4, x0, x2        # x4 = 7
sw   x2, 0(x0)         # mem[0] = 7
lw   x0, 0(x0)         # un load hacia x0 tampoco escribe
add  x5, x0, x3        # x5 = 1 (si hubiera forwarding del load daría 8)
ebreak
`,
        expect: { regs: { x2: 0x7, x3: 0x1, x4: 0x7, x5: 0x1, x0: 0, x1: 0 }, mem: { 0: 0x7 } },
        stats: { retired: 11, stalls: 0, redirects: 0, cycles: 15 },
        note: '<p>Los ceros son el resultado interesante: <code>x1 = 0</code> (si hubiera forwarding del 5 daría 10) y <code>x5 = 1</code> (si hubiera forwarding del load daría 8).</p>',
      },
    ],
  },
  {
    id: 'saltos',
    title: 'Saltos y branches',
    what: '<p>Branch tomado y no tomado (con signo y sin signo), <code>jal</code> con y sin guardar la dirección de retorno, <code>jalr</code> con <code>rd == rs1</code>. Y siempre: el camino equivocado no debe dejar rastro.</p>',
    why: '<p>Un flush defectuoso se nota de dos maneras: ejecutar de más (una instrucción del camino equivocado escribe un registro) o descartar de más (un branch no tomado se lleva por delante una instrucción que sí debía ejecutarse). <code>jalr</code> con <code>rd == rs1</code> es una trampa de la ISA: el destino debe usar el valor <i>viejo</i> del registro, aunque la instrucción lo sobrescriba.</p>',
    programs: [
      {
        title: 'Cuatro saltos tomados, dos no tomados, y jalr con rd == rs1',
        code: `# Branch tomado y no tomado, jal y jalr con rd == rs1
addi x1, x0, 3
addi x2, x0, 3
beq  x1, x2, a_tomado   # se toma
addi x10, x0, 111       # camino equivocado: no debe ejecutarse
a_tomado:
bne  x1, x2, b_no       # no se toma
addi x11, x0, 11        # se ejecuta
b_no:
blt  x1, x0, c_no       # 3 < 0 (con signo) -> no se toma
bltu x0, x1, d_tomado   # 0 < 3 (sin signo) -> se toma
addi x12, x0, 222       # camino equivocado
d_tomado:
jal  x5, e_dest         # x5 = pc + 4 y salta
addi x13, x0, 333       # camino equivocado
e_dest:
addi x6, x0, 60         # destino absoluto del jalr (dirección 60)
jalr x6, 0(x6)          # rd == rs1: salta al valor VIEJO de x6; x6 recibe pc + 4
addi x14, x0, 444       # camino equivocado
addi x15, x0, 555       # camino equivocado
c_no:
addi x7, x0, 7          # dirección 60: destino del jalr
ebreak
`,
        expect: { regs: { x1: 0x3, x2: 0x3, x5: 0x28, x6: 0x34, x7: 0x7, x11: 0xb, x10: 0, x12: 0, x13: 0, x14: 0, x15: 0 }, mem: {} },
        stats: { retired: 12, stalls: 0, redirects: 4, cycles: 24 },
        note: '<p>Los registros <code>x10</code>, <code>x12</code>, <code>x13</code>, <code>x14</code> y <code>x15</code> deben quedar en 0: son las instrucciones del camino equivocado. <code>x6 = 52</code> es la dirección de retorno del <code>jalr</code> (la instrucción está en la dirección 48) y <code>x5 = 40</code> la del <code>jal</code>.</p>',
      },
    ],
  },
  {
    id: 'parciales',
    title: 'Loads y stores parciales',
    what: '<p><code>sb</code> y <code>sh</code> en cada desplazamiento posible dentro de la palabra (bytes 0, 1, 2 y 3; mitades baja y alta), y <code>lb</code> vs <code>lbu</code>, <code>lh</code> vs <code>lhu</code> con valores que tienen el bit de signo en 1.</p>',
    why: '<p>La lógica de carriles de byte tiene un caso por cada combinación de tamaño y desplazamiento, y es muy fácil que uno quede mal sin que se note con valores "lindos". Hay que probar cada desplazamiento con datos distintos en cada byte del registro fuente.</p>',
    programs: [
      {
        title: 'Bytes y medias palabras en los desplazamientos 0, 1, 2 (byte) y baja/alta (media palabra)',
        code: `# sb y sh en distintos desplazamientos; lb vs lbu y lh vs lhu con valores negativos
addi x1, x0, 0x81       # 0x81: negativo si se lo mira como byte
sb   x1, 0(x0)          # byte 0
addi x2, x0, 0x22
sb   x2, 1(x0)          # byte 1
addi x3, x0, 0x33
sb   x3, 2(x0)          # byte 2 -> mem[0] = 0x00332281
lw   x5, 0(x0)          # 0x00332281
lb   x6, 0(x0)          # 0xFFFFFF81 (extiende el signo)
lbu  x7, 0(x0)          # 0x81 (extiende con ceros)
lb   x8, 2(x0)          # 0x33
addi x9, x0, -1         # 0xFFFFFFFF
sh   x9, 4(x0)          # media palabra baja de la palabra 1
addi x10, x0, 0x234
sh   x10, 6(x0)         # media palabra alta -> mem[1] = 0x0234FFFF
lh   x11, 4(x0)         # 0xFFFFFFFF
lhu  x12, 4(x0)         # 0xFFFF
lh   x13, 6(x0)         # 0x234
lw   x14, 4(x0)         # 0x0234FFFF
ebreak
`,
        expect: { regs: { x1: 0x81, x2: 0x22, x3: 0x33, x5: 0x332281, x6: 0xffffff81, x7: 0x81, x8: 0x33, x9: 0xffffffff, x10: 0x234, x11: 0xffffffff, x12: 0xffff, x13: 0x234, x14: 0x234ffff }, mem: { 0: 0x332281, 1: 0x234ffff } },
        stats: { retired: 19, stalls: 0, redirects: 0, cycles: 23 },
        note: '<p>Pasa tal cual en el RTL actual y en el modelo de referencia. El siguiente programa completa el caso que falta (byte 3).</p>',
      },
      {
        title: 'sb en el byte 3 de la palabra',
        code: `# sb en el último byte de la palabra (dirección terminada en 11)
addi x4, x0, 0x7AB      # rs2 = 0x000007AB: byte bajo 0xAB, byte siguiente 0x07
sb   x4, 3(x0)          # debe guardar 0xAB en el byte 3
lw   x5, 0(x0)          # esperado: 0xAB000000
lbu  x6, 3(x0)          # esperado: 0xAB
ebreak
`,
        expect: { regs: { x4: 0x7ab, x5: 0xab000000, x6: 0xab }, mem: { 0: 0xab000000 } },
        note: '<p>Resultado esperado según la ISA (y según el modelo de referencia en Python). Elegí a propósito un <code>rs2</code> cuyos bytes 0 y 1 son distintos (<code>0xAB</code> y <code>0x07</code>) para que un error de carril se note.</p>',
        knownIssue: {
          html: '<p><b>Hallazgo en el RTL actual.</b> En <code>dmem.v</code>, el byte que recibe el carril 3 se calcula como <code>d3 = sw ? wdata[31:24] : wdata[15:8]</code>. Eso es correcto para <code>sh</code> (el byte alto de la media palabra) pero no para <code>sb</code>, donde el carril 3 debería recibir <code>wdata[7:0]</code>. Resultado: un <code>sb</code> a una dirección terminada en <code>11</code> guarda <code>rs2[15:8]</code> en vez de <code>rs2[7:0]</code>. El programa de prueba del repo no lo detecta porque su único <code>sb</code> usa la dirección 5 (byte 1). Es justamente el tipo de error que la categoría "cada desplazamiento" existe para encontrar. Arreglo: <code>d3 = sw ? wdata[31:24] : (sb ? wdata[7:0] : wdata[15:8])</code>. Este simulador reproduce el RTL tal cual está.</p>',
          simulated: { regs: { x4: 0x7ab, x5: 0x07000000, x6: 0x07 }, mem: { 0: 0x07000000 } },
        },
      },
    ],
  },
  {
    id: 'shifts',
    title: 'Desplazamientos',
    what: '<p><code>sra</code>/<code>srai</code> con números negativos, desplazamiento de 0 y de 31, y cantidades de desplazamiento en registro mayores que 31 (solo cuentan los 5 bits bajos).</p>',
    why: '<p>El desplazamiento aritmético vs lógico es una fuente clásica de errores en el signo del operando de Verilog (hace falta <code>&gt;&gt;&gt;</code> sobre un operando con signo). Los inmediatos de <code>srai</code> traen <code>0100000</code> en los bits altos, que contaminan la cantidad si no se la enmascara a 5 bits.</p>',
    programs: [
      {
        title: 'Shifts aritméticos y lógicos con negativos, 0, 31 y 33',
        code: `# Desplazamientos con números negativos, cantidades 0 y 31, y cantidades de registro mayores que 31
addi x1, x0, -8        # 0xFFFFFFF8
addi x2, x0, 1
sra  x3, x1, x2        # -8 >> 1 aritmético = -4
srl  x4, x1, x2        # lógico: 0x7FFFFFFC
srai x5, x1, 1         # -4
srli x6, x1, 1         # 0x7FFFFFFC
srai x7, x1, 31        # -1: queda solo el signo
srli x8, x1, 31        # 1
slli x9, x2, 31        # 0x80000000
slli x10, x1, 0        # desplazamiento 0: sin cambios
addi x11, x0, 33       # 33 en el registro: solo cuentan los 5 bits bajos (33 & 31 = 1)
sll  x12, x2, x11      # 1 << 1 = 2
sra  x13, x1, x11      # -8 >> 1 = -4
srai x14, x0, 5        # 0
ebreak
`,
        expect: { regs: { x1: 0xfffffff8, x2: 0x1, x3: 0xfffffffc, x4: 0x7ffffffc, x5: 0xfffffffc, x6: 0x7ffffffc, x7: 0xffffffff, x8: 0x1, x9: 0x80000000, x10: 0xfffffff8, x11: 0x21, x12: 0x2, x13: 0xfffffffc, x14: 0 }, mem: {} },
        stats: { retired: 15, stalls: 0, redirects: 0, cycles: 19 },
        note: '<p><code>x12 = 2</code> y <code>x13 = −4</code> con un desplazamiento de 33 prueban el enmascarado a 5 bits (33 &amp; 31 = 1).</p>',
      },
    ],
  },
  {
    id: 'halt',
    title: 'HALT',
    what: '<p>Tres casos: un HALT normal (lo anterior se completa, lo posterior no tiene efecto), un HALT del camino equivocado justo después de un branch tomado (no debe detener nada), y un programa sin HALT.</p>',
    why: '<p>El segundo caso es el sutil: una instrucción buscada de manera especulativa no puede detener el procesador. Y el tercero obliga a decidir qué ve el usuario cuando un programa no termina nunca, y qué mecanismo de seguridad (límite de ciclos, detección de PC fuera de rango, o simplemente el botón de pausa) agrega.</p>',
    programs: [
      {
        title: 'HALT normal',
        code: `# HALT normal: lo anterior se completa, lo posterior no tiene efecto
addi x1, x0, 1
addi x2, x0, 2
ebreak
addi x3, x0, 3          # nunca debe ejecutarse
sw   x2, 0(x0)          # tampoco
`,
        expect: { regs: { x1: 0x1, x2: 0x2, x3: 0 }, mem: { 0: 0 } },
        stats: { retired: 3, stalls: 0, redirects: 0, cycles: 7 },
        note: '<p><code>x3 = 0</code> y <code>mem[0] = 0</code> prueban que ni la <code>addi</code> ni el <code>sw</code> posteriores al ebreak tuvieron efecto.</p>',
      },
      {
        title: 'ebreak del camino equivocado después de un branch tomado',
        code: `# Un ebreak del camino equivocado (después de un branch tomado) NO debe detener el procesador
addi x1, x0, 1
beq  x1, x1, fin        # se toma
ebreak                  # camino equivocado: ya está en el pipeline pero será descartado
addi x2, x0, 99         # camino equivocado
fin:
addi x3, x0, 3          # debe ejecutarse
ebreak
`,
        expect: { regs: { x1: 0x1, x3: 0x3, x2: 0 }, mem: {} },
        stats: { retired: 4, stalls: 0, redirects: 1, cycles: 10 },
        note: '<p>Si <code>x3</code> queda en 0 es porque el primer <code>ebreak</code> (descartado) detuvo el procesador: el diseño tiene un halt especulativo.</p>',
      },
      {
        title: 'Programa sin HALT',
        code: `# Programa SIN ebreak: no termina nunca
addi x1, x1, 1
addi x2, x2, 2
`,
        expect: { regs: {}, mem: {} },
        neverHalts: true,
        note: '<p>No termina nunca. En esta implementación la memoria de instrucciones tiene 256 palabras y está llena de NOPs después del programa; el PC sigue avanzando, da la vuelta (la imem se indexa con <code>addr[9:2]</code>) y el programa vuelve a ejecutarse: después de N vueltas, <code>x1 = N</code>. Hay que pausarlo desde la debug unit con <code>P</code>.</p>',
      },
    ],
  },
];
