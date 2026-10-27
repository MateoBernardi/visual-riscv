// lessons.js - lecciones guiadas. Sin DOM.
//
// Forma de cada lección (todas las explicaciones hablan de ESTA implementación: otros procesadores tienen más o
// menos etapas, resuelven los saltos en ID, usan predictores, etc.; cuando hace falta se aclara con "en esta implementación"):
//   {
//     id: string,
//     title: string,
//     level: 'Básico' | 'Intermedio' | 'Avanzado',
//     track: 'entender' | 'construir',     // entender = cómo funciona ESTE chip; construir = cómo hacer el tuyo desde cero
//     minutes: number,                     // tiempo estimado de lectura + exploración
//     intro: string,                       // 1-2 oraciones (texto plano)
//     sections: [{ heading: string, html: string }],   // el cuerpo, todo en una sola vista
//     watch: [{ block: blockId, title: string, html: string }],
//                                          // "Qué mirar en la animación": id del bloque 3D + qué se va a ver y por qué importa
//     exampleId: string | null,            // ejemplo de examples.js que ilustra la lección
//     focus: blockId | null,               // bloque que se resalta/centra al abrir la lección
//     repo: [{ label: string, href: string, note: string }],   // links a GitHub (RTL, testbenches, herramientas del host)
//     next: string | null,                 // id de la lección siguiente dentro del mismo track
//   }
// Los bloques 3D son: pc imem ifid control regfile immgen idex fwdMuxA fwdMuxB aluSrcMux alu branch exmem dmem wbMux
// memwb hazard forward flush debug uart (ver CONTRACT.md).
import { githubUrl } from './repo.js';

const BASE = 'https://github.com/MateoBernardi/arquitectura-de-computadoras/blob/tp3-RISCV/project_4/';
const TB = BASE + 'project_4.srcs/sim_1/new/';
const HOST = BASE + 'host/';

// Link a un archivo/símbolo del RTL (ruta relativa a project_4.srcs/sources_1/new/).
const R = (file, sym, label, note) => ({ label, href: githubUrl(file, sym), note });
// Link a un archivo fuera del RTL (testbench, herramientas del host...).
const X = (href, label, note) => ({ label, href, note });
// Link dentro de un texto html.
const gh = (file, sym, text) => `<a href="${githubUrl(file, sym)}" target="_blank" rel="noopener">${text}</a>`;
const ext = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** Los dos recorridos. */
export const TRACKS = {
  entender: {
    id: 'entender',
    title: 'Entender este chip',
    blurb: 'Cómo funciona de punta a punta el RV32I de este repo: el pipeline, los hazards, la memoria, la debug unit y la UART, con las decisiones de diseño y las alternativas.',
  },
  construir: {
    id: 'construir',
    title: 'Construí tu propio RISC-V',
    blurb: 'Una guía práctica, paso a paso, para armar y verificar un RV32I propio en una FPGA, usando este repo como implementación de referencia y sus tests como ejemplos.',
  },
};

export const LESSONS = [
  // ============================================================ TRACK: ENTENDER
  {
    id: 'isa-vs-microarquitectura',
    title: 'ISA vs. microarquitectura: el contrato de RV32I',
    level: 'Básico',
    track: 'entender',
    minutes: 12,
    intro: 'Antes de mirar un solo cable conviene separar dos ideas: lo que promete la ISA (el contrato) y la forma en que esta implementación lo cumple. Todo lo que ves en esta guía es una elección de microarquitectura sobre un contrato que no cambia.',
    sections: [
      {
        heading: 'El contrato: qué es una ISA',
        html: `<p>Una <b>ISA</b> (arquitectura del conjunto de instrucciones) es el acuerdo entre el software y el hardware: define qué instrucciones existen, cómo se codifican en bits y qué efecto tiene cada una sobre los registros y la memoria. RISC-V es una ISA; <b>RV32I</b> es su conjunto base de enteros de 32 bits. Un programa compilado para RV32I tiene que dar exactamente el mismo resultado en cualquier procesador que cumpla el contrato, sea un monociclo didáctico o un núcleo superescalar.</p>
<p>La <b>microarquitectura</b> es cómo se cumple ese contrato: monociclo (una instrucción por ciclo, ciclo largo), multiciclo (varios ciclos por instrucción, reutilizando hardware) o segmentada (varias instrucciones solapadas en etapas). Esta implementación es segmentada, en orden, de 5 etapas. Otros procesadores tienen más etapas, predictores de saltos, ejecución fuera de orden o varias instrucciones por ciclo, y todos obedecen la misma ISA.</p>
<p>La consecuencia práctica es la idea más importante de toda la verificación: <b>el pipeline cambia <i>cuándo</i> pasan las cosas, nunca <i>qué resultado</i> dan</b>. Si un programa deja un estado final distinto en el pipeline y en un modelo simple de una instrucción por vez, el pipeline tiene un bug. Por eso este repo prueba el CPU comparando contra un modelo de referencia en Python.</p>`,
      },
      {
        heading: 'El estado visible del procesador',
        html: `<p>La ISA define qué parte del estado puede observar un programa:</p>
<ul>
<li><b>32 registros</b> <code>x0</code> a <code>x31</code> de 32 bits. <code>x0</code> vale siempre 0 y las escrituras a <code>x0</code> se descartan: más adelante se verá que esa excepción hay que implementarla en tres lugares (el regfile y las dos unidades de hazards).</li>
<li>El <b>PC</b> (program counter), de 32 bits. No es un registro accesible con instrucciones; solo lo modifican la secuencia normal (<code>PC+4</code>), los saltos y los branches.</li>
<li>Una <b>memoria direccionada por byte</b>, little-endian: el byte menos significativo de una palabra va en la dirección más baja. Si se guarda <code>0x12345678</code> en la dirección <code>0x100</code>, queda <code>0x78</code> en <code>0x100</code>, <code>0x56</code> en <code>0x101</code>, <code>0x34</code> en <code>0x102</code> y <code>0x12</code> en <code>0x103</code>.</li>
</ul>
<p>Los registros tienen además nombres de ABI (<code>ra</code> = x1, <code>sp</code> = x2, <code>a0</code>-<code>a7</code> = x10-x17, <code>t0</code>-<code>t6</code>, <code>s0</code>-<code>s11</code>). Son una convención de software, no de hardware, pero un buen ensamblador acepta ambos nombres. El ensamblador de esta web los acepta.</p>`,
      },
      {
        heading: 'Los seis formatos y por qué sus inmediatos están "desordenados"',
        html: `<p>Todas las instrucciones miden 32 bits y hay seis formatos: R (registro-registro), I (inmediato, loads, jalr), S (stores), B (branches), U (constantes altas: lui y auipc) y J (jal). El <code>opcode</code> (bits 6:0) dice cuál es. Los campos <code>rs1</code> (19:15), <code>rs2</code> (24:20) y <code>rd</code> (11:7) están <b>siempre en las mismas posiciones</b>, y esa regularidad no es casual:</p>
<ul>
<li>El banco de registros se puede leer en ID <i>antes</i> de saber qué instrucción es. Si resulta que la instrucción no usaba esos registros, simplemente se ignora lo leído. (Tiene una consecuencia incómoda que se verá en la lección de load-use.)</li>
<li>El <b>bit de signo del inmediato es siempre <code>inst[31]</code></b>, así que la extensión de signo arranca en paralelo con la decodificación.</li>
<li>En B y J no se guarda el bit 0 del desplazamiento, porque los destinos son pares: con los mismos bits se duplica el alcance.</li>
<li>Los bits de cada inmediato se reparten para que cada uno venga de la menor cantidad posible de posiciones distintas entre formatos. Eso reduce el tamaño del multiplexor del generador de inmediatos.</li>
</ul>
<p>Un buen ejercicio antes de diseñar el generador de inmediatos: armá una tabla con los 32 bits del inmediato en columnas y los formatos I, S, B, U y J en filas, y anotá en cada celda qué bit de la instrucción va ahí (o "signo", o "0"). Esa tabla <i>es</i> el diseño del módulo.</p>`,
      },
      {
        heading: 'Qué implementa este repo (y qué no)',
        html: `<p>El decodificador ${gh('pipeline/2_decode/control.v', 'module:control', 'control.v')} reconoce estos opcodes: OP (<code>0110011</code>: add, sub, sll, slt, sltu, xor, srl, sra, or, and), OP-IMM (<code>0010011</code>: addi, slti, sltiu, xori, ori, andi, slli, srli, srai), LOAD (<code>0000011</code>: lb, lh, lw, lbu, lhu), STORE (<code>0100011</code>: sb, sh, sw), BRANCH (<code>1100011</code>: los seis), LUI, AUIPC, JAL, JALR y SYSTEM. Con eso cubre RV32I completo menos FENCE.</p>
<p>Lo que <b>no</b> tiene, y es bueno saberlo para no buscarlo: no hay CSRs, no hay excepciones ni traps, no hay modo privilegiado, no hay extensión M (multiplicar y dividir) ni compresión de instrucciones. Dos detalles de comportamiento que conviene tener presentes:</p>
<ul>
<li><b>Cualquier opcode SYSTEM</b> (<code>ecall</code> o <code>ebreak</code>) detiene el procesador. Es la forma de terminar un programa (se verá en la lección de HALT).</li>
<li><b>Un opcode desconocido se ejecuta como NOP</b>: en el <code>case</code> del control, el caso por defecto deja todas las señales en 0. Eso incluye <code>fence</code> y la palabra <code>0x00000000</code>, que la especificación define como instrucción ilegal pero que acá no genera ninguna excepción.</li>
</ul>`,
      },
      {
        heading: 'Lo que la ISA deja a criterio del diseñador',
        html: `<p>El contrato no lo decide todo. Cada una de estas preguntas tiene una respuesta distinta en cada procesador, y la de este repo está entre paréntesis:</p>
<ul>
<li>¿Qué pasa con un acceso desalineado? (no se soporta ni hay trap: se comporta según los bits bajos de la dirección)</li>
<li>¿Qué pasa si el PC apunta fuera de la memoria de instrucciones? (la imem se indexa con <code>addr[9:2]</code>, así que da la vuelta cada 256 instrucciones)</li>
<li>¿Cuántas etapas tiene el pipeline, y en cuál se resuelven los saltos? (5 etapas; saltos en EX)</li>
<li>¿Cómo se resuelven los hazards de datos? (forwarding más un stall de load-use)</li>
<li>¿Cómo se detiene la máquina? (cualquier SYSTEM; el reloj nunca se toca)</li>
<li>¿De qué tamaño son las memorias? (1 KB de instrucciones y 1 KB de datos)</li>
</ul>
<p>Las lecciones que siguen recorren esas decisiones una por una, con sus alternativas. Cuando veas un texto que dice "en esta implementación", quiere decir que es una elección de este diseño y no algo que impone RISC-V.</p>`,
      },
    ],
    watch: [
      { block: 'control', title: 'Un decodificador que reparte banderas', html: `<p>Mirá cómo, al pasar una instrucción por ID, el bloque de control enciende solo las banderas que ella necesita (<code>reg_write</code>, <code>alu_src</code>, <code>wb_sel</code>...). Ese conjunto de banderas es la traducción del contrato de la ISA a "qué hardware se activa". En el ejemplo, un <code>lui</code> y un <code>addi</code> activan combinaciones distintas: la tabla de control de esta implementación está en cada ficha de instrucción.</p>` },
      { block: 'immgen', title: 'El inmediato se arma a partir de bits dispersos', html: `<p>Seguí el <code>lui</code>: en el formato U los 20 bits altos se copian sin reordenar y los 12 bajos se rellenan con ceros. Compará con una instrucción de salto, donde los bits del inmediato salen de cuatro lugares distintos de la palabra. Lo importante es que el bit de signo es siempre el 31, y por eso la extensión de signo puede empezar sin esperar a decodificar.</p>` },
      { block: 'regfile', title: 'Lectura "ciega" de rs1 y rs2', html: `<p>El banco de registros lee siempre los dos campos fijos de la instrucción, incluso cuando la instrucción no los usa (como el <code>lui</code>, que en esos bits tiene parte de una constante). Es más barato leer de más que decidir antes de leer, y esa es la raíz de dos comportamientos que vas a ver más adelante: los forwardings sin sentido y el "stall falso".</p>` },
    ],
    exampleId: 'lui-auipc',
    focus: 'control',
    repo: [
      R('pipeline/2_decode/control.v', 'module:control', 'control.v', 'El decodificador: una tabla de opcode a banderas de control'),
      R('pipeline/2_decode/immgen.v', 'module:immgen', 'immgen.v', 'El generador de inmediatos para los formatos I, S, B, U y J'),
      R('pipeline/3_execute/alu_ops.vh', null, 'alu_ops.vh', 'Los códigos de operación de la ALU'),
      X(HOST + 'tests/rv32i_model.py', 'host/tests/rv32i_model.py', 'El modelo de referencia: un simulador de una instrucción por vez (tu "contrato" ejecutable)'),
      X(HOST + 'tests/pipeline_test.s', 'host/tests/pipeline_test.s', 'El programa de prueba que recorre casi todas las instrucciones'),
    ],
    next: 'mapa-del-sistema',
  },
  {
    id: 'mapa-del-sistema',
    title: 'Mapa del sistema: PC, UART, debug unit, CPU y memorias',
    level: 'Básico',
    track: 'entender',
    minutes: 12,
    intro: 'El procesador no está solo: vive dentro de una FPGA junto con una UART y una debug unit que lo cargan, lo controlan y lo observan desde una PC. Esta lección dibuja el mapa completo para ubicar cada pieza antes de entrar en detalle.',
    sections: [
      {
        heading: 'El sistema de un vistazo',
        html: `<p>El proyecto tiene tres bloques que cooperan. En la <b>PC</b> corren un ensamblador y una interfaz de debug (<code>host/</code>, en Python). En la <b>FPGA</b> (una Nexys4 DDR) vive el hardware: una UART, la debug unit y el pipeline RISC-V con sus memorias. Entre los dos hay un cable serie.</p>
<pre>PC (host/)                         FPGA (top_riscv)
 programa.s                    ┌─────────────────────────────────────────┐
   │ binutils                  │  UART  ◀──▶  debug_unit ──▶ riscv_pipeline │
   ▼ palabras de 32 bits       │  (RX/TX         (FSM)          │  imem  │
 debug_protocol.py  ◀═ serie ═▶│   FIFOs)          │  cpu_enable │  dmem  │
 gui.py / debug_host.py        │                   │  cpu_reset  │ regfile│
                               └───────────────────┴─────────────┴────────┘</pre>
<p>El flujo de uso es siempre el mismo: escribís un programa en ensamblador; el software lo traduce a palabras de 32 bits y las manda por la UART; la debug unit las escribe en la memoria de instrucciones, lanza la ejecución (continua o paso a paso) y, cuando se le pide, devuelve los registros, las señales internas del pipeline y la memoria de datos para que la interfaz los muestre.</p>`,
      },
      {
        heading: 'Los módulos dentro de la FPGA',
        html: `<p>El módulo de más alto nivel es ${gh('top/top_riscv.v', 'module:top_riscv', 'top_riscv')}. Instancia:</p>
<ul>
<li><b>Un MMCM</b> que toma el oscilador de 100 MHz de la placa y genera el reloj del sistema a <b>50 MHz</b>. Se usa porque el camino crítico del pipeline no cierra a 100 MHz (más en la lección de timing de la guía "Construí tu propio RISC-V").</li>
<li><b>reset_gen</b>: genera un reset de encendido (unos pocos ciclos) y sincroniza el botón de reset de la placa. También mantiene el sistema en reset mientras el MMCM no reporte <code>locked</code>.</li>
<li><b>sync_2ff</b>: un sincronizador de dos flip-flops para la línea RX, que llega del exterior y no está sincronizada con el reloj.</li>
<li><b>uart_core</b>: el receptor, el transmisor, un generador de baud rate y dos FIFOs de 4 bytes (una por sentido). No sabe nada del procesador.</li>
<li><b>debug_unit</b>: una máquina de estados que interpreta los comandos de la PC. No sabe nada de bits seriales: solo ve bytes que salen y entran de las FIFOs.</li>
<li><b>riscv_pipeline</b>: el CPU de 5 etapas con su memoria de instrucciones, su memoria de datos y su banco de registros.</li>
</ul>
<p>Los tres LEDs de la placa muestran el estado: el 0, que el CPU está habilitado; el 1, que el CPU está en reset (por ejemplo mientras se carga un programa); el 2, que el CPU llegó a un halt.</p>`,
      },
      {
        heading: 'Quién controla a quién',
        html: `<p>La relación entre la debug unit y el CPU se reduce a unos pocos cables, y vale la pena aprenderlos de memoria:</p>
<ul>
<li><code>cpu_enable</code> (debug unit → CPU): en 1, el procesador avanza; en 0, está <b>congelado</b>. No es un reloj detenido: es una habilitación que llega a cada registro. El reloj nunca se toca.</li>
<li><code>cpu_reset</code> (debug unit → CPU): vacía el pipeline, pone el PC en 0 y borra los registros x1 a x31. No borra ni la memoria de datos ni la de instrucciones.</li>
<li>El <b>puerto de escritura de la memoria de instrucciones</b> (habilitación, dirección y un byte): así llega el programa. Mientras se carga, el CPU está en reset.</li>
<li>El <b>bus de debug</b> (dirección de 16 bits hacia el CPU, dato de 32 bits de vuelta, más la cantidad de palabras disponibles): así la debug unit lee el PC, los registros de pipeline, los 32 registros y 32 palabras de memoria de datos.</li>
<li><code>halt</code> (CPU → debug unit): se levanta cuando una instrucción de parada llega a WB.</li>
</ul>
<p>Hay una diferencia de dominios de reset que no es obvia: el reset del <i>sistema</i> reinicia la UART y la debug unit; el CPU recibe un reset aparte que viene de la debug unit (que incluye el del sistema, el comando <code>X</code> y las cargas). Por eso el comando <code>X</code> puede reiniciar solo el procesador sin tocar la comunicación.</p>`,
      },
      {
        heading: 'Una sesión típica y cuánto tarda',
        html: `<p>Una sesión de debug típica es: cargar el programa (<code>L</code>), ejecutar (<code>R</code>), esperar el aviso de halt (<code>H</code>) y pedir el volcado de estado (<code>D</code>). La velocidad de la línea es de 19200 baudios con 10 bits por byte, es decir unos <b>521 µs por byte</b>, y eso domina todos los tiempos:</p>
<ul>
<li>Cargar un programa que ocupe toda la imem (256 instrucciones = 1024 bytes): unos 0,53 segundos.</li>
<li>Un volcado completo: 2 bytes de cantidad más 86 palabras de 4 bytes = 346 bytes, unos 180 ms.</li>
<li>Un paso (<code>S</code>) con su confirmación: un par de bytes, alrededor de 1 ms; el procesador ejecuta un solo ciclo de reloj a 50 MHz, o sea 20 ns, y el resto es espera de la línea serie.</li>
</ul>
<p>Conviene hacer esta cuenta para todo lo que se transmite en cada paso al diseñar un protocolo de debug propio. Un volcado tras cada paso es muy cómodo para estudiar, pero ya limita a unos 5 pasos por segundo.</p>`,
      },
      {
        heading: 'Dónde está cada cosa en la web',
        html: `<p>La vista de simulación muestra el pipeline; la vista <b>Debug</b> muestra la otra mitad del mapa: una consola con el protocolo real, la máquina de estados de la debug unit, los LEDs y el tráfico de la UART decodificado. Los bloques <code>debug</code> y <code>uart</code> del tablero 3D representan esas piezas; al hacer clic en ellos se puede entrar a su interior (la debug unit con sus estados, la UART con los de RX y TX). El resto de esta guía profundiza en cada pieza: primero el CPU (lecciones 3 a 9) y después la debug unit y la UART.</p>`,
      },
    ],
    watch: [
      { block: 'debug', title: 'La debug unit decide si el CPU avanza', html: `<p>En el ejemplo de halt, mirá el bloque de la debug unit y el LED de habilitación: mientras la unidad está en modo run, el CPU avanza un ciclo por ciclo de reloj. Cuando el <code>ebreak</code> llega a WB, el CPU levanta su señal de halt y la debug unit deja de habilitarlo. Esa es la única conexión de control: un cable de habilitación hacia el CPU y un cable de halt de vuelta.</p>` },
      { block: 'uart', title: 'El camino de los bytes', html: `<p>Los bytes de cada comando entran por la UART, pasan por la FIFO de recepción y la debug unit los consume de a uno. Las respuestas hacen el camino inverso. La UART no interpreta nada: solo convierte entre bits seriales y bytes.</p>` },
      { block: 'imem', title: 'El programa llega por un puerto de escritura aparte', html: `<p>La memoria de instrucciones tiene dos puertos: uno de lectura que usa el CPU en cada ciclo, y uno de escritura de un byte por vez que usa la debug unit al cargar. Como el CPU está en reset durante la carga, los dos nunca compiten.</p>` },
      { block: 'pc', title: 'El PC y el reset', html: `<p>Al terminar la carga o al recibir <code>X</code>, el PC vuelve a 0 y el pipeline se llena de burbujas: es el estado desde el cual se ve la primera instrucción entrar por IF.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'debug',
    repo: [
      R('top/top_riscv.v', 'module:top_riscv', 'top_riscv.v', 'El top: une MMCM, reset, sincronizador, UART, debug unit y CPU'),
      R('debug/debug_unit.v', 'module:debug_unit', 'debug_unit.v', 'La debug unit: cabecera con el protocolo completo'),
      R('uart/uart_core.v', 'module:uart_core', 'uart_core.v', 'La UART con sus FIFOs'),
      R('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v', 'El CPU y su interfaz de control y de debug'),
      X(BASE + 'README.md', 'project_4/README.md', 'El mapa general del proyecto y la jerarquía de módulos'),
    ],
    next: 'datapath-cinco-etapas',
  },
  {
    id: 'datapath-cinco-etapas',
    title: 'El datapath y las cinco etapas en esta implementación',
    level: 'Básico',
    track: 'entender',
    minutes: 15,
    intro: 'Segmentar no hace más rápida a cada instrucción: hace que terminen más instrucciones por unidad de tiempo. Esta lección explica por qué conviene dividir el trabajo en cinco etapas y qué hace exactamente cada una en este diseño.',
    sections: [
      {
        heading: 'Por qué segmentar: la ecuación de rendimiento',
        html: `<p>El tiempo de ejecución de un programa es <code>T = N × CPI × T_clk</code>: cantidad de instrucciones, por ciclos por instrucción, por el período del reloj. Cada organización ataca un término distinto:</p>
<ul>
<li><b>Monociclo</b>: CPI = 1, pero el período lo fija la instrucción más lenta (un load recorre memoria de instrucciones, registros, ALU, memoria de datos y registros otra vez). Un store desperdicia la parte del ciclo que no usa.</li>
<li><b>Multiciclo</b>: divide la instrucción en pasos y reutiliza hardware; el período es el del paso más lento, pero el CPI sube a 3-5.</li>
<li><b>Segmentado (pipeline)</b>: superpone instrucciones, una por etapa. El período lo fija la etapa más lenta y el CPI ideal vuelve a ser 1, más los ciclos perdidos en stalls.</li>
</ul>
<p>Con números del ejemplo clásico (memoria 200 ps, registros 100 ps, ALU 200 ps): un load tarda 800 ps de punta a punta en un monociclo, así que el reloj es de 800 ps. En un pipeline el reloj es de 200 ps (la etapa más lenta) y cada instrucción tarda 5 × 200 = 1000 ps, <i>más</i> que en el monociclo, pero termina una cada 200 ps. La mejora es de 4×, no de 5×, porque ID y WB solo usan 100 ps de un ciclo de 200: las etapas no están balanceadas. Esa es la diferencia entre <b>latencia</b> (lo que tarda una instrucción) y <b>throughput</b> (cuántas terminan por ciclo).</p>
<p>Un pipeline de k etapas tarda k ciclos en entregar la primera instrucción y después una por ciclo: ejecutar N instrucciones sin stalls lleva <code>k + N − 1</code> ciclos. Por eso, en esta implementación (k = 5), un programa de 9 instrucciones sin hazards tarda 13 ciclos. El speedup ideal de k nunca se alcanza: las etapas no son parejas, los registros de pipeline agregan retardo propio y cada hazard cuesta ciclos.</p>`,
      },
      {
        heading: 'Las cinco etapas de este diseño',
        html: `<p>Cada etapa deja sus resultados en un registro de pipeline y, en cada flanco de reloj, todas las instrucciones avanzan una etapa a la vez:</p>
<ul>
<li><b>IF (fetch).</b> El <code>pc</code> (un registro dentro de ${gh('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v')}, no es un módulo aparte) se presenta a la memoria de instrucciones, que responde en el mismo ciclo (lectura combinacional). El PC siguiente es <code>pc + 4</code>, o el destino de un salto si EX pide una redirección.</li>
<li><b>ID (decode).</b> El control decodifica el opcode, el generador de inmediatos arma la constante y el banco de registros lee <code>rs1</code> y <code>rs2</code> en paralelo. Acá también se calcula <code>pc + 4</code> (para JAL/JALR). El regfile tiene un bypass: si WB está escribiendo el mismo registro que ID lee, entrega el dato nuevo.</li>
<li><b>EX (execute).</b> Dos multiplexores de forwarding eligen los operandos (del regfile o de etapas posteriores), otro elige entre registro e inmediato, un tercero entre <code>rs1</code> y el PC (para AUIPC), y la ALU opera. En la misma etapa branch_unit decide si el salto se toma y calcula su destino. Si hay que redirigir, el PC cambia desde acá.</li>
<li><b>MEM.</b> La memoria de datos se lee o se escribe. Además, un multiplexor (<code>wb_sel</code>) elige qué valor produce la instrucción: resultado de la ALU, dato de memoria, <code>PC+4</code> o el inmediato (LUI).</li>
<li><b>WB (write-back).</b> En esta implementación es solo un registro (MEM/WB) y el cable de vuelta al banco de registros.</li>
</ul>
<p>Dos decisiones de este diseño difieren del esquema de libro y conviene notarlas ya. Primero, <b>el mux <code>wb_sel</code> está en MEM y no en WB</b>: así el valor ya elegido se puede reenviar a EX por forwarding. Segundo, <b>los saltos se resuelven en EX</b>, no antes. Las dos tienen consecuencias que se ven en las lecciones siguientes.</p>`,
      },
      {
        heading: 'Las dos flechas que van hacia atrás',
        html: `<p>El flujo de datos va de izquierda a derecha, salvo en dos lugares: la <b>escritura del resultado</b> en el banco de registros (WB → ID) y el <b>cambio de PC por un salto</b> (EX → IF). Casi todos los riesgos de un pipeline nacen de esas dos flechas: la primera produce los hazards de datos (una instrucción lee un registro que otra, más adelantada, todavía no escribió) y la segunda los hazards de control (ya se buscaron instrucciones que quizá no debían ejecutarse). El resto de la guía es la historia de cómo esta implementación cierra esas dos flechas: forwarding y stall para la primera, flush para la segunda.</p>`,
      },
      {
        heading: 'Cómo leer un pipeline: dos diagramas',
        html: `<p>Hay dos formas de dibujar lo que pasa y conviene saber leer las dos:</p>
<ul>
<li>El <b>diagrama multiciclo</b>: instrucciones en filas, ciclos en columnas, cada celda dice en qué etapa está cada instrucción. Es lo que muestra el diagrama de ciclos que se despliega desde abajo en la simulación. Sirve para ver stalls y burbujas como huecos.</li>
<li>El <b>diagrama de un ciclo</b>: el datapath completo en un instante, indicando qué instrucción ocupa cada etapa. Es el tablero 3D: el número de ciclo manda, y cada etapa muestra su instrucción, una burbuja o un stall.</li>
</ul>
<p>Una regla para ubicarse: en un programa sin hazards, la instrucción número <i>k</i> (contando desde 0) está en IF en el ciclo <i>k</i>, en ID en <i>k+1</i>, en EX en <i>k+2</i>, en MEM en <i>k+3</i> y en WB en <i>k+4</i>. Cada stall o burbuja desplaza todo lo que viene después.</p>`,
      },
      {
        heading: 'Los hazards estructurales: por qué no hay',
        html: `<p>Un riesgo estructural aparece cuando dos instrucciones necesitan el mismo recurso en el mismo ciclo. Los dos candidatos típicos están resueltos así en este diseño. Con una sola memoria, IF y MEM competirían; acá hay <b>dos memorias separadas</b> (arquitectura Harvard). Con un banco de registros, ID lee mientras WB escribe; acá tiene <b>dos puertos de lectura y uno de escritura</b>, más el bypass interno. Hay un tercer candidato propio del sistema: la debug unit también quiere leer registros y memoria. La decisión de este diseño fue darle un puerto de lectura aparte en el regfile y en la dmem (siempre disponible), y además solo hacer dumps con el CPU congelado.</p>`,
      },
    ],
    watch: [
      { block: 'pc', title: 'El PC avanza de a 4', html: `<p>En el primer ciclo del ejemplo el PC vale 0 y cada ciclo siguiente suma 4. La memoria de instrucciones entrega la palabra de esa dirección sin demora, y es la primera instrucción en entrar al pipeline. Mientras no haya un salto o un stall, nada interrumpe este avance.</p>` },
      { block: 'regfile', title: 'ID: tres cosas a la vez', html: `<p>Cuando la primera <code>addi</code> llega a ID, el control, el generador de inmediatos y el banco de registros trabajan en paralelo sobre la misma palabra. Ninguno espera a los otros: se leen los registros antes de saber de qué formato es la instrucción.</p>` },
      { block: 'alu', title: 'EX: la ALU suma registro más inmediato', html: `<p>En el ciclo 2 la ALU recibe 0 y 5 y los suma. El multiplexor de operando B eligió el inmediato (<code>alu_src = 1</code>). Es la misma ALU que más adelante calculará direcciones de memoria y comparará para los branches.</p>` },
      { block: 'wbMux', title: 'MEM: el mux que elige el resultado', html: `<p>Aunque la <code>addi</code> no accede a memoria, pasa por el multiplexor <code>wb_sel</code> y elige la salida de la ALU. En este diseño la selección ocurre acá para que ese valor ya elegido se pueda reenviar al EX de la instrucción siguiente.</p>` },
      { block: 'memwb', title: 'WB: el pipeline está lleno', html: `<p>En el ciclo 4 la primera instrucción escribe su resultado, y para ese momento hay cinco instrucciones distintas en vuelo, una por etapa. De ahí en adelante se retira una instrucción por ciclo, hasta que el <code>ebreak</code> vacíe el pipeline.</p>` },
    ],
    exampleId: 'datapath-etapas',
    focus: 'pc',
    repo: [
      R('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v', 'El módulo que une las cinco etapas, con el comentario del mapa de debug en la cabecera'),
      R('pipeline/1_fetch/imem.v', 'module:imem', 'imem.v', 'Memoria de instrucciones de lectura combinacional'),
      R('pipeline/2_decode/regfile.v', 'module:regfile', 'regfile.v', 'Banco de registros con bypass de escritura a lectura'),
      R('pipeline/3_execute/alu.v', 'module:alu_tp1', 'alu.v', 'La ALU: operaciones, banderas zero/lt/ltu'),
      R('pipeline/riscv_pipeline.v', 'mem_result_r', 'El mux wb_sel (mem_result)', 'Donde se elige el valor que produce la instrucción'),
      R('pipeline/README.md', null, 'pipeline/README.md', 'El diagrama de etapas y la tabla de señales internas'),
    ],
    next: 'registros-de-pipeline',
  },
  {
    id: 'registros-de-pipeline',
    title: 'Registros de pipeline: qué viaja con cada instrucción',
    level: 'Intermedio',
    track: 'entender',
    minutes: 14,
    intro: 'Los cuatro registros que separan las etapas son el corazón del pipeline: guardan todo lo que una instrucción necesitará más adelante. Entender qué lleva cada uno, y bajo qué reglas se actualiza, explica casi todo el comportamiento del resto del diseño.',
    sections: [
      {
        heading: 'El principio: todo viaja con la instrucción',
        html: `<p>En cada flanco de reloj, todas las instrucciones avanzan una etapa a la vez. Lo que la etapa siguiente necesite de la instrucción tiene que estar en el registro que las separa, porque la etapa anterior ya va a estar ocupada con otra instrucción.</p>
<p>El error clásico (el libro lo muestra a propósito) es escribir en WB usando el <code>rd</code> que en ese momento está en IF/ID. Ese <code>rd</code> pertenece a otra instrucción, tres posiciones más atrás. El número de registro destino tiene que viajar desde ID hasta MEM/WB. Lo mismo vale para las señales de control: se generan todas en ID y cada una viaja hasta la etapa donde se usa; ahí se consume y deja de propagarse. Por eso suelen agruparse en señales "de EX", "de MEM" y "de WB".</p>`,
      },
      {
        heading: 'Qué lleva cada registro en esta implementación',
        html: `<p>Los cuatro registros están en ${gh('pipeline/regs/pipe_reg.v', 'module:if_id_reg', 'pipe_reg.v')} y comparten convenciones. Esto es lo que lleva cada uno, y por qué:</p>
<ul>
<li><b>IF/ID</b>: la instrucción (<code>id_inst</code>) y su PC (<code>id_pc</code>). Nada más: todavía no se decodificó nada.</li>
<li><b>ID/EX</b>: es el más grande. Lleva las banderas de control (<code>reg_write</code>, <code>alu_src</code>, <code>mem_read</code>, <code>mem_write</code>, <code>branch</code>, <code>jump</code>, <code>is_jalr</code>, <code>is_auipc</code>, <code>halt</code>, <code>wb_sel</code>, <code>alu_op</code>) y los datos: <code>pc</code>, <code>pc4</code>, los valores leídos <code>rdata1</code> y <code>rdata2</code>, el inmediato, los <b>números</b> de registro <code>rs1</code>, <code>rs2</code> y <code>rd</code> y <code>funct3</code>.</li>
<li><b>EX/MEM</b>: control de MEM y WB (<code>reg_write</code>, <code>mem_read</code>, <code>mem_write</code>, <code>halt</code>, <code>wb_sel</code>), el resultado de la ALU (<code>alu_out</code>: dirección o resultado), el valor de <code>rs2</code> ya reenviado (el dato de un store), <code>pc4</code>, el inmediato (para LUI), <code>rd</code> y <code>funct3</code> (que dmem necesita para el tamaño y el signo).</li>
<li><b>MEM/WB</b>: casi nada: <code>reg_write</code>, <code>halt</code>, el <code>result</code> final ya seleccionado y <code>rd</code>.</li>
</ul>
<p>Algunos campos son menos obvios y valen la pena. Los <b>números</b> <code>rs1</code> y <code>rs2</code> viajan a EX aunque ya se usaron para leer el regfile, porque la unidad de forwarding los compara en EX contra los destinos de MEM y WB. <code>funct3</code> viaja dos veces: lo usa branch_unit en EX (qué condición evaluar) y dmem en MEM (qué tamaño y signo). <code>pc4</code> e <code>imm</code> viajan hasta MEM porque <code>wb_sel</code> puede elegirlos como resultado (JAL/JALR y LUI). En LUI la salida de la ALU se ignora: el valor que llega a WB es el inmediato.</p>
<p>Contando bits: ID/EX tiene 193 flip-flops, EX/MEM 142, IF/ID 64 y MEM/WB 39, unos 440 en total. Ese es el overhead (área y retardo de propagación de cada registro) que hace que el speedup de un pipeline nunca llegue al ideal.</p>`,
      },
      {
        heading: 'Las reglas comunes: rst, en, flush y stall',
        html: `<p>Los cuatro registros obedecen las mismas convenciones:</p>
<ul>
<li><b>rst</b>: reset sincrónico. Vacía la etapa: el registro IF/ID carga un NOP (<code>0x00000013</code>) y los otros ponen todo en 0, que es una "instrucción" que no hace nada.</li>
<li><b>en</b>: habilitación global que viene de la debug unit. Si vale 0, el registro <b>mantiene su valor</b> y además se ignoran <code>flush</code> y <code>stall</code>. Así se pausa el CPU entero sin tocar el reloj. Nótese que el reset tiene prioridad sobre el enable: un CPU pausado igual se resetea.</li>
<li><b>flush</b>: reemplaza la instrucción por una burbuja (en IF/ID un NOP; en ID/EX, ceros en todo el control y los datos). Se usa para descartar el camino equivocado de un salto y para detener la búsqueda en un halt.</li>
<li><b>stall</b>: solo lo tiene IF/ID, y significa "mantené tu valor". El registro ID/EX no tiene entrada de stall: cuando hay un stall de load-use, lo que se hace es <i>forzar un flush en ID/EX</i> (<code>flush_id_ex = ... | stall</code>), y así la instrucción que quedó repetida en ID es seguida por una burbuja.</li>
<li><b>halt</b>: es una señal de control más; viaja con la instrucción hasta WB.</li>
</ul>
<p>EX/MEM y MEM/WB no tienen entradas de flush ni de stall: cuando se descarta algo, la instrucción de EX ya es la burbuja que puso ID/EX, y lo que llega a estos dos registros está limpio.</p>`,
      },
      {
        heading: 'Qué es una burbuja, y otras formas de hacerla',
        html: `<p>Una burbuja es una instrucción que avanza por el pipeline sin hacer nada. En esta implementación se fabrica de dos formas: cargando un NOP en IF/ID, o poniendo a cero todas las señales de control en ID/EX. Sin <code>reg_write</code>, sin <code>mem_write</code>, sin <code>branch</code> ni <code>jump</code>, no puede modificar nada.</p>
<p>La alternativa es un <b>bit de "válida"</b> por etapa: la instrucción sigue ahí, pero marcada como inválida, y cada etapa que escribe estado mira ese bit. Tiene la ventaja de que es fácil saber cuándo el pipeline está vacío (ninguna válida) y de que se distingue una burbuja de un NOP real; el costo es un bit y un AND más en cada habilitación de escritura. Este diseño eligió poner a cero el control. Una consecuencia: una burbuja y un <code>addi x0, x0, 0</code> son indistinguibles para el hardware (y también para el dump).</p>`,
      },
      {
        heading: 'Cómo se relaciona con el dump de debug',
        html: `<p>El mapa de 86 palabras que la debug unit lee del CPU es, en su mayor parte, una foto de estos registros: la palabra 1 y 2 son IF/ID, las 3 a 8 son ID/EX (control, campos <code>rs1</code>/<code>rs2</code>/<code>rd</code>/<code>funct3</code>, pc, rdata1, rdata2 e inmediato), 14 a 17 son EX/MEM y 19 a 21 son MEM/WB. Por eso la tabla de "qué lleva cada registro" también es la lista de qué tiene que mandar la debug unit a la PC. Si se agrega un campo a un registro de pipeline, hay que decidir si va al dump, y se agrega al final del mapa y al decodificador del host (<code>decode_dump</code>) para que el hardware y el software no se desincronicen.</p>`,
      },
    ],
    watch: [
      { block: 'ifid', title: 'IF/ID: se repite durante un stall', html: `<p>En el load-use, mirá el registro IF/ID en el ciclo del stall: conserva la instrucción dependiente (no avanza), mientras IF vuelve a mostrar la misma instrucción siguiente. Es la única vez en que un registro de pipeline retiene su contenido en vez de tomar la instrucción nueva.</p>` },
      { block: 'idex', title: 'ID/EX: la burbuja del stall', html: `<p>Ese mismo ciclo, ID/EX carga ceros. En el ciclo siguiente, la etapa EX queda vacía (una burbuja): es el costo del hazard. Observá que la instrucción dependiente no se pierde: sigue en ID y vuelve a avanzar.</p>` },
      { block: 'exmem', title: 'EX/MEM: lleva el dato de un store y la dirección', html: `<p>Cuando el <code>sw</code> pasa por acá lleva dos valores a la vez: la dirección calculada por la ALU y el dato a guardar (<code>rs2</code> ya reenviado). Por eso este registro tiene dos campos de 32 bits además del resto.</p>` },
      { block: 'memwb', title: 'MEM/WB: ya solo el resultado final', html: `<p>El último registro es el más pequeño porque el mux <code>wb_sel</code> ya resolvió cuál es el valor. A partir de acá solo hay que escribirlo en <code>rd</code>, y de ahí también sale la señal que se reenvía a EX por forwarding MEM/WB.</p>` },
    ],
    exampleId: 'load-use',
    focus: 'idex',
    repo: [
      R('pipeline/regs/pipe_reg.v', 'module:if_id_reg', 'if_id_reg', 'IF/ID: stall (mantiene) y flush (NOP)'),
      R('pipeline/regs/pipe_reg.v', 'module:id_ex_reg', 'id_ex_reg', 'ID/EX: el más grande; el flush mete la burbuja'),
      R('pipeline/regs/pipe_reg.v', 'module:ex_mem_reg', 'ex_mem_reg', 'EX/MEM'),
      R('pipeline/regs/pipe_reg.v', 'module:mem_wb_reg', 'mem_wb_reg', 'MEM/WB'),
      R('pipeline/regs/README.md', null, 'regs/README.md', 'Resumen de convenciones y tabla de campos'),
    ],
    next: 'forwarding',
  },
  {
    id: 'forwarding',
    title: 'Forwarding EX/MEM y MEM/WB, y el bypass del regfile',
    level: 'Intermedio',
    track: 'entender',
    minutes: 18,
    intro: 'Una instrucción suele necesitar el resultado de la anterior antes de que éste llegue al banco de registros. El forwarding lo lleva directo desde donde ya existe hasta la entrada de la ALU. Esta lección cubre las tres distancias de dependencia y el hardware que resuelve cada una en este diseño.',
    sections: [
      {
        heading: 'El problema: leer antes de que se escriba',
        html: `<p>Un riesgo de datos aparece cuando una instrucción necesita un valor que otra anterior todavía no terminó de calcular. Entre dos instrucciones <i>i</i> (anterior) y <i>j</i> (posterior) hay tres tipos:</p>
<ul>
<li><b>RAW</b> (read after write): <i>j</i> lee un registro antes de que <i>i</i> lo escriba. Es el caso central.</li>
<li><b>WAR</b> (write after read) y <b>WAW</b> (write after write): no ocurren en este pipeline, porque todas las instrucciones leen en ID, escriben en WB y siempre en orden de programa. Aparecen en procesadores fuera de orden o con etapas de distinta longitud. Saber explicar por qué no ocurren en un diseño propio es una buena respuesta de defensa.</li>
</ul>
<pre>sub x2, x1, x3     # escribe x2 en WB (ciclo 5)
and x12, x2, x5    # necesita x2 en EX (ciclo 4)
or  x13, x6, x2    # necesita x2 en EX (ciclo 5)
add x14, x2, x2    # lee x2 en ID (ciclo 5)
sw  x15, 100(x2)   # sin problema</pre>
<p>El resultado de <code>sub</code> existe desde el final de su etapa EX (ciclo 3) pero recién llega al banco de registros en el ciclo 5. <code>and</code> y <code>or</code> lo necesitan antes, y <code>add</code> lo lee en el mismo ciclo en que se escribe.</p>
<p>Hay tres formas de resolverlo: por <b>software</b> (el compilador inserta NOPs entre instrucciones dependientes), por <b>stall</b> (el hardware frena la dependiente hasta que el dato esté en el regfile: correcto pero caro) o por <b>forwarding</b> (en vez de esperar, el dato se toma de donde ya existe). Esta implementación usa forwarding y deja el stall para el único caso que no cubre.</p>`,
      },
      {
        heading: 'Tres distancias, tres mecanismos',
        html: `<p>La <i>distancia</i> es cuántas instrucciones separan al productor del consumidor. En este diseño cada una se resuelve en un lugar distinto:</p>
<ul>
<li><b>Distancia 1</b>: el productor está en MEM cuando el consumidor está en EX. El resultado ya existe a la salida del mux <code>wb_sel</code> (<code>mem_result</code>). La unidad de forwarding lo elige con el código <code>2'b10</code> ("EX/MEM").</li>
<li><b>Distancia 2</b>: el productor está en WB. El resultado vive en MEM/WB (<code>wb_result</code>). La unidad elige <code>2'b01</code> ("MEM/WB").</li>
<li><b>Distancia 3</b>: el productor está en WB cuando el consumidor está en <i>ID</i>, leyendo el regfile. Como la escritura es síncrona pero la lectura combinacional, el regfile tiene un <b>bypass interno</b> (<code>BYPASS=1</code>): si la dirección de escritura coincide con la de lectura, entrega el dato que se está escribiendo.</li>
<li><b>Distancia 4 o más</b>: el dato ya está en el regfile y se lee normalmente.</li>
</ul>
<p>Las alternativas al bypass del regfile (el libro escribe en la primera mitad del ciclo y lee en la segunda) son escribir el regfile en el flanco opuesto del reloj, a costa de dejarle medio período a cada operación, o agregar una tercera fuente de forwarding. Acá se eligió el bypass porque es un mux dentro del propio regfile y no toca el reloj.</p>`,
      },
      {
        heading: 'La unidad de forwarding: tres condiciones y una prioridad',
        html: `<p>${gh('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit')} es puramente combinacional. Para cada operando de la instrucción en EX decide de dónde sale su valor, mirando los números de registro que viajan en ID/EX (<code>ex_rs1</code>, <code>ex_rs2</code>) contra los destinos de MEM (<code>mem_rd</code>) y de WB (<code>wb_rd</code>). Para forwardear desde una etapa tienen que cumplirse tres cosas:</p>
<ol>
<li>La instrucción de adelante <b>efectivamente escribe un registro</b> (<code>reg_write</code>). Un store o un branch no producen un valor para <code>rd</code>.</li>
<li>Su <code>rd</code> <b>no es x0</b>. Si escribiera en x0, el valor "producido" no es el que va a quedar en el registro (siempre vale 0), y forwardearlo sería un error.</li>
<li>Su <code>rd</code> <b>coincide</b> con el <code>rs1</code> (o <code>rs2</code>) de la instrucción en EX.</li>
</ol>
<p>Si las dos fuentes coinciden (dos instrucciones seguidas escriben el mismo registro), gana la más reciente: <b>EX/MEM tiene prioridad sobre MEM/WB</b>. El código lo hace explícito: la condición de MEM/WB incluye <code>!(mem_reg_write &amp;&amp; mem_rd == ex_rs1)</code>. Un ejemplo para convencerse: <code>add x1,...</code> dos veces seguidas y luego un uso de <code>x1</code>; el consumidor debe ver el valor de la segunda.</p>
<p>La salida es un código de 2 bits por operando (<code>00</code> = regfile, <code>10</code> = EX/MEM, <code>01</code> = MEM/WB) que maneja los multiplexores <code>fwdMuxA</code> y <code>fwdMuxB</code> en la entrada de la ALU. Después de esos muxes vienen los otros dos: el de <code>alu_src</code> (¿registro o inmediato?) y el de AUIPC (¿rs1 o PC?).</p>`,
      },
      {
        heading: 'Qué se adelanta exactamente',
        html: `<p>Una característica de esta implementación que conviene notar: lo que se reenvía desde la etapa MEM no es solo la salida de la ALU, sino <code>mem_result</code>, o sea el valor <b>después</b> del mux <code>wb_sel</code>. Por eso el forwarding también sirve para el <code>PC+4</code> de un JAL, para el inmediato de un LUI y, como se verá en la lección de load-use, para el dato de un load. Es consecuencia directa de haber puesto ese mux en MEM.</p>
<p>También hay que forwardear el <b>dato de un store</b>. El <code>sw</code> necesita dos valores de registro: la base de la dirección (<code>rs1</code>, que pasa por la ALU) y el dato (<code>rs2</code>, que no). Pero el dato también puede depender de la instrucción anterior. Como el mux de <code>rs2</code> está antes del mux del inmediato, el valor reenviado llega tanto a la ALU como al registro EX/MEM como dato de escritura.</p>`,
      },
      {
        heading: 'Un defecto inofensivo: el forwarding sin sentido',
        html: `<p>Como el regfile lee los campos <code>rs1</code> y <code>rs2</code> aunque la instrucción no los use, la unidad de forwarding también compara siempre esos bits. Si una <code>addi</code> tiene un inmediato cuyos bits 24:20 coinciden con el <code>rd</code> de la instrucción anterior, la unidad igualmente selecciona <code>10</code> para el operando B. Pero ese operando B no se usa (la ALU toma el inmediato), así que no pasa nada: el forwarding "sin sentido" es ruido en el mux, sin consecuencias. Se puede ver en la animación cuando aparece un forwarding sobre una instrucción que no tiene segundo registro. En el hazard de load-use, en cambio, el mismo defecto sí cuesta un ciclo.</p>`,
      },
      {
        heading: 'Costo y alternativas',
        html: `<p>El forwarding cuesta dos multiplexores de 3 entradas por operando, los comparadores de la unidad y, sobre todo, tiempo: esos muxes están en el camino crítico entre las salidas de MEM y la entrada de la ALU. La alternativa más simple, sin forwarding, ahorra todo ese hardware y se paga con ciclos: cada dependencia a distancia 1 cuesta 2 burbujas y a distancia 2 cuesta 1. Con la opción "forwarding on/off" de esta web se puede medir cuánto aporta sobre el mismo programa (ver la última lección del recorrido). Los procesadores fuera de orden hacen algo equivalente con estaciones de reserva y buses de resultado comunes.</p>`,
      },
    ],
    watch: [
      { block: 'forward', title: 'La decisión: cuál fuente elige cada operando', html: `<p>En el ciclo en que el segundo <code>add</code> está en EX, la unidad de forwarding muestra dos decisiones independientes a la vez: el operando A viene de EX/MEM (código 10) y el B de MEM/WB (código 01). Fijate que cada operando tiene su propia decisión: no hay una única señal para toda la instrucción.</p>` },
      { block: 'fwdMuxA', title: 'El mux de operando A', html: `<p>Mirá el valor que llega a la ALU por este mux: en vez del que leyó el regfile en ID (que era el viejo), es el resultado recién calculado. Con el cable activo que sale de EX/MEM hacia el mux se ve la ruta "hacia atrás" que da nombre al forwarding.</p>` },
      { block: 'fwdMuxB', title: 'El mux de operando B', html: `<p>En el ejemplo del bypass, este mux toma el dato por MEM/WB cuando la dependencia es de distancia 2. Compará el cable activo con el caso de distancia 1: la fuente cambió de EX/MEM a MEM/WB porque el productor avanzó una etapa.</p>` },
      { block: 'regfile', title: 'El bypass interno', html: `<p>Cuando el consumidor está en ID y el productor en WB, el banco de registros entrega el dato nuevo directamente. Ese caso (distancia 3) no pasa por la unidad de forwarding: se resuelve dentro del propio regfile, en la etapa ID, y por eso aparece como un evento aparte.</p>` },
      { block: 'memwb', title: 'La fuente MEM/WB', html: `<p>El registro MEM/WB tiene dos destinos: el regfile (para escribir) y el mux de forwarding (para adelantar el mismo valor a EX). Ambos usan <code>wb_result</code>.</p>` },
    ],
    exampleId: 'forwarding-memwb-bypass',
    focus: 'forward',
    repo: [
      R('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v', 'Las tres condiciones y la prioridad EX/MEM sobre MEM/WB'),
      R('pipeline/riscv_pipeline.v', 'fwd_a_val', 'Los muxes de forwarding en riscv_pipeline.v', 'Dónde se aplican los códigos forward_a y forward_b'),
      R('pipeline/2_decode/regfile.v', 'rdata1', 'El bypass del regfile (rdata1)', 'La expresión (BYPASS && wr && waddr == raddr1)'),
      R('pipeline/flow/README.md', null, 'flow/README.md', 'Tabla de códigos y de prioridad'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'El testbench del pipeline: cualquier error de forwarding aparece como un registro con valor viejo'),
    ],
    next: 'load-use-hazard-unit',
  },
  {
    id: 'load-use-hazard-unit',
    title: 'Load-use, la hazard unit y el stall falso',
    level: 'Intermedio',
    track: 'entender',
    minutes: 20,
    intro: 'Hay un caso de dependencia de datos que esta implementación no resuelve con forwarding sino frenando un ciclo: un load seguido de una instrucción que usa su resultado. La hazard unit lo detecta, pero por comparar campos crudos de la instrucción también frena a veces sin necesidad. Esta lección explica ambas cosas y qué se podría mejorar.',
    sections: [
      {
        heading: 'El caso que el pipeline clásico no puede adelantar',
        html: `<pre>lw   x2, 20(x1)
and  x4, x2, x5</pre>
<p>El dato de un load existe recién al final de MEM (cuando la memoria responde). La instrucción siguiente, <code>and</code>, necesita ese dato al <i>comienzo</i> de su EX. En un pipeline clásico eso es el mismo ciclo: habría que mandar el dato hacia atrás en el tiempo, y un cable no puede hacerlo. La solución estándar es esperar un ciclo, insertando una <b>burbuja</b>.</p>
<pre>Ciclo        C1  C2  C3  C4         C5  C6  C7
lw x2        IF  ID  EX  MEM        WB
and x4           IF  ID  ID(stall)  EX  MEM WB
siguiente            IF  IF(stall)  ID  EX  MEM</pre>
<p>En C3 se detecta el riesgo: hay un load en EX cuyo <code>rd</code> coincide con un registro fuente de la instrucción en ID. Para insertar el stall hacen falta tres cosas, todas a la vez:</p>
<ol>
<li><b>Congelar el PC</b>, para que IF vuelva a buscar la misma instrucción.</li>
<li><b>Congelar el registro IF/ID</b>, para que ID repita su trabajo con la misma instrucción.</li>
<li><b>Insertar una burbuja en ID/EX</b>: una "instrucción" con el control en cero, que avanza como un NOP.</li>
</ol>
<p>En C5 el load ya está en WB y el dato le llega a la dependiente por forwarding MEM/WB, el mismo mecanismo de la distancia 2.</p>`,
      },
      {
        heading: 'La hazard unit de este diseño',
        html: `<p>${gh('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit')} es un bloque combinacional pequeño. Mira la instrucción en EX y los campos de la que está en ID:</p>
<pre>stall = ex_mem_read && (ex_rd != 0) && (ex_rd == id_rs1 || ex_rd == id_rs2)</pre>
<p>Cuando <code>stall</code> vale 1, en ${gh('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v')} pasan las tres cosas anteriores: el PC no avanza (<code>pc_en = en &amp; ~stall &amp; ~stop_fetch</code>), el registro IF/ID mantiene su valor (entrada <code>stall</code>) y <code>flush_id_ex</code> incluye al stall, de modo que ID/EX carga ceros. El <code>ex_rd != 0</code> es la misma excepción de x0 que en el forwarding.</p>
<p>Un detalle de interacción: un stall y un flush por salto <b>nunca coinciden</b> en este core. El stall exige un load en EX y el redirect exige un branch o jump en EX, y EX solo contiene una instrucción. En un diseño donde podrían coincidir habría que decidir cuál tiene prioridad (el flush debería ganar, porque la instrucción detenida podría ser del camino equivocado).</p>
<p>Y otro: mientras el CPU está pausado por la debug unit (<code>en = 0</code>), nada avanza y tanto el stall como el flush se ignoran: los registros mantienen su valor. Cuando se ejecuta un paso (<code>S</code>), ese único ciclo habilitado se comporta como cualquier otro, stall incluido.</p>`,
      },
      {
        heading: 'Cómo reducir el costo',
        html: `<p>La burbuja cuesta un ciclo por cada load-use. Hay varias formas de achicar ese costo y cada una está en un nivel distinto:</p>
<ul>
<li><b>En el software</b>: el compilador reordena y pone una instrucción independiente entre el load y su uso. La instrucción independiente ocupa el hueco y no se pierde nada. El procesador MIPS I exponía esto en la ISA como "load delay slot"; RISC-V no lo hace, así que el hardware tiene que detectarlo.</li>
<li><b>En la memoria</b>: con una memoria de menor latencia el dato se podría tener antes, pero entonces la memoria tiene que ser aún más rápida que el resto del ciclo.</li>
<li><b>En el forwarding</b>: ver la observación más abajo.</li>
</ul>
<p>En pipelines con más etapas de memoria (por ejemplo, si la dmem fuera una BRAM de lectura síncrona y hubiera dos etapas de acceso), el stall de load-use sería de 2 ciclos o más.</p>`,
      },
      {
        heading: 'Observación: ¿hace falta este stall en esta implementación?',
        html: `<p>Una pregunta interesante, y que se puede comprobar con el simulador de esta web. El argumento del libro ("el dato recién existe al final de MEM") supone que el valor sale tarde dentro del ciclo. Pero en este diseño la <b>memoria de datos es de lectura combinacional</b> y su salida entra al multiplexor <code>wb_sel</code> en MEM, y de ahí a <code>mem_result</code>, que es justamente la fuente de forwarding EX/MEM. En otras palabras: si el load estuviera en MEM y su dependiente en EX en el mismo ciclo, <code>forward_unit</code> elegiría <code>10</code> y la ALU recibiría el dato leído de dmem <i>en ese mismo ciclo</i>, encadenando la lectura de la memoria con la suma de la ALU.</p>
<p>Esa ruta (dmem → forwarding → ALU → branch → flush) ya existe en el hardware: es la que el README del top identifica como camino crítico del diseño. O sea que quitar el stall no agregaría hardware ni alargaría ese camino. Sin el stall, el resultado seguiría siendo correcto, y se ahorraría un ciclo por cada load-use. En un experimento con el código del simulador de esta web (quitando el efecto del stall), 300 programas aleatorios con loads seguidos de su uso (en rs1, en rs2 y como dato de un store) dieron los mismos resultados finales que el modelo de referencia en Python.</p>
<p>¿Por qué entonces existe el stall? Porque es el diseño estándar del libro, y es el correcto cuando la dmem es síncrona (BRAM), cuando el mux de resultado está en WB, o cuando se quiere cortar el camino crítico con un registro. Que sea "obligatorio" o "opcional" depende de la microarquitectura, no de la ISA. Esta variante <b>no existe en el RTL</b>: es una sugerencia de optimización que se puede probar quitando el efecto de <code>stall</code> en <code>hazard_unit.v</code> y corriendo el testbench del pipeline.</p>`,
      },
      {
        heading: 'El stall falso: comparar campos crudos',
        html: `<p>La hazard unit compara <code>id_rs1 = inst[19:15]</code> e <code>id_rs2 = inst[24:20]</code> siempre, sin mirar el formato de la instrucción que está en ID. Pero esos bits solo son registros fuente en algunos formatos. Cuando no lo son, pueden coincidir por casualidad con el <code>rd</code> del load y disparar un stall que no hacía falta: un <b>stall falso</b>.</p>
<pre>lw   x5, 0(x0)      # en EX, rd = x5
addi x1, x0, 5      # en ID: imm = 5, o sea inst[24:20] = 00101 = "x5" (!)</pre>
<p>En un <code>addi</code>, los bits 24:20 son parte del inmediato (no hay <code>rs2</code> en el formato I). Si ese inmediato vale 5, el campo coincide con <code>x5</code> y la unidad frena un ciclo, aunque el <code>addi</code> no use <code>x5</code> para nada. Lo mismo pasa en U y J, donde esos bits son parte de la constante, y en SYSTEM (<code>ecall</code>/<code>ebreak</code> tienen 0 y 1 en esos campos). Probalo en el ejemplo "El stall falso": cambiando el 5 por un 6 el stall desaparece.</p>
<p>No es un error de corrección: la unidad nunca omite un stall necesario, solo agrega alguno de más. Es una decisión de simplicidad: no hace falta saber el formato para decidir.</p>`,
      },
      {
        heading: 'Cómo se arreglaría',
        html: `<p>Hay que saber, desde el opcode, qué campos son realmente registros. Dos bits derivados del decodificador alcanzan:</p>
<ul>
<li><code>uses_rs1</code>: lo usan todas las instrucciones menos LUI, AUIPC, JAL y SYSTEM.</li>
<li><code>uses_rs2</code>: lo usan solo las de tipo R, S (stores) y B (branches).</li>
</ul>
<pre>stall = ex_mem_read && (ex_rd != 0) &&
        ((ex_rd == id_rs1 &amp;&amp; uses_rs1) || (ex_rd == id_rs2 &amp;&amp; uses_rs2))</pre>
<p>Cuesta unas pocas compuertas en el decodificador, y agrega una entrada más a un camino que ya es largo (control → hazard → stall → PC y flush). La ganancia depende del programa: solo ocurre cuando un load en EX tiene el <code>rd</code> igual a ciertos bits de la instrucción siguiente. En el programa de prueba del repo no aparece. La misma corrección serviría para <code>forward_unit</code>, donde el defecto no cuesta ciclos pero sí hace seleccionar fuentes que nadie usa.</p>`,
      },
    ],
    watch: [
      { block: 'hazard', title: 'El momento en que se detecta el stall', html: `<p>En el ciclo 4 del ejemplo, la hazard unit compara el destino del <code>lw</code> (que está en EX) con los campos de la instrucción que está en ID. Cuando coinciden se enciende la señal de stall. Es un evento de un solo ciclo: en el siguiente la comparación vuelve a hacerse, pero ahora EX contiene una burbuja y no hay nada que detectar.</p>` },
      { block: 'pc', title: 'El PC y IF/ID se congelan', html: `<p>Mientras dura el stall, el PC no avanza y la instrucción que IF acaba de buscar se vuelve a buscar. Se nota porque en el ciclo siguiente IF muestra la misma instrucción que en el anterior, y lo mismo con ID.</p>` },
      { block: 'idex', title: 'La burbuja en EX', html: `<p>En el ciclo 5 la etapa EX queda vacía: es la burbuja que entró por el flush forzado desde la hazard unit. La instrucción dependiente sigue en ID. Es el costo en rendimiento del hazard: un ciclo en el que EX no hace trabajo útil.</p>` },
      { block: 'forward', title: 'Después de la espera, el forwarding de siempre', html: `<p>En el ciclo 6 el <code>addi</code> llega a EX y el <code>lw</code> está en WB. La unidad de forwarding elige MEM/WB (código 01) y el dato 42 llega a la ALU. Sin el ciclo de espera, el mismo addi habría usado el valor viejo del registro.</p>` },
      { block: 'dmem', title: 'La lectura que provoca todo', html: `<p>En el ciclo 5 el load está en MEM y lee 42 de la memoria de datos. Ese dato recién se puede tener acá y es lo que obliga a esperar. Observá que el store anterior (<code>sw</code>) escribió el mismo valor un ciclo antes.</p>` },
    ],
    exampleId: 'load-use',
    focus: 'hazard',
    repo: [
      R('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v', 'La regla del stall: solo mira ex_mem_read, ex_rd, id_rs1 e id_rs2'),
      R('pipeline/riscv_pipeline.v', 'flush_id_ex', 'flush_id_ex en riscv_pipeline.v', 'Donde el stall se convierte en una burbuja en ID/EX'),
      R('pipeline/riscv_pipeline.v', 'pc_en', 'pc_en en riscv_pipeline.v', 'Donde el stall congela el PC'),
      R('pipeline/regs/pipe_reg.v', 'module:if_id_reg', 'if_id_reg', 'Donde el stall congela IF/ID'),
      R('pipeline/flow/README.md', null, 'flow/README.md', 'La regla del stall y su efecto'),
    ],
    next: 'control-flush',
  },
  {
    id: 'control-flush',
    title: 'Riesgos de control: saltos, flush de 2 burbujas y por qué se resuelven en EX',
    level: 'Intermedio',
    track: 'entender',
    minutes: 18,
    intro: 'Un branch decide cuál es la próxima instrucción recién cuando compara sus operandos, pero el pipeline ya trajo las que siguen en memoria. Esta lección explica qué se hace con esas instrucciones, cuánto cuesta y por qué este diseño resuelve todos los saltos en la etapa EX.',
    sections: [
      {
        heading: 'El problema: el PC no sabe adónde ir',
        html: `<p>La segunda "flecha hacia atrás" del pipeline es el cambio de PC por un salto. Un branch condicional necesita comparar dos registros para saber si salta; mientras tanto, IF sigue trayendo las instrucciones que están a continuación en memoria. Si el salto se toma, esas instrucciones <b>no debían ejecutarse</b>: son <i>especulativas</i>, buscadas antes de saber si correspondían.</p>
<p>Hay cuatro estrategias clásicas:</p>
<ul>
<li><b>Frenar hasta resolver</b>: detener IF cada vez que aparece un branch. Correcto pero lento, porque todos los branches (tomados o no) pagan el retraso.</li>
<li><b>Predecir "no tomado"</b>: seguir trayendo instrucciones en orden. Si el salto se toma, se descartan (flush) las mal traídas, convirtiéndolas en burbujas. Si no se toma, no se pierde nada. Es lo que hace este diseño.</li>
<li><b>Resolver antes, en ID</b>: mover el comparador y el sumador del destino a ID. La penalización baja a 1 ciclo, pero la comparación ahora necesita operandos listos en ID, y aparecen stalls y forwarding nuevos hacia ID.</li>
<li><b>Predicción dinámica</b>: tablas que recuerdan qué hizo cada branch (con buffers de destino). Puede llevar la penalización casi a cero, pero es mucho hardware; queda fuera de este diseño.</li>
</ul>
<p>Una aclaración: el MIPS clásico resolvía esto con <i>delay slots</i> (la instrucción posterior al branch se ejecuta siempre). RISC-V no los tiene. Agregarlos haría que el procesador deje de ser RISC-V, porque un programa escrito para la ISA daría otro resultado.</p>`,
      },
      {
        heading: 'Cuánto cuesta resolver en cada etapa',
        html: `<p>Con predicción "no tomado", la penalización por salto tomado es la cantidad de instrucciones que entraron al pipeline antes de saber el resultado:</p>
<ul>
<li><b>Resolver en EX</b>: hay que descartar 2 instrucciones (las que están en IF e ID). El hardware extra es nulo: se reutiliza la ALU para comparar.</li>
<li><b>Resolver en ID</b>: hay que descartar 1 (la que está en IF). Cuesta un comparador y un sumador dedicados en ID, forwarding hacia ID y stalls adicionales cuando el operando todavía no está listo.</li>
</ul>
<p>Este diseño eligió EX. La decisión conviene justificarla con datos: cuántos branches tienen los programas de prueba y qué fracción se toma. En el programa de prueba del repo hay 9 saltos tomados sobre 61 instrucciones; a 2 burbujas cada uno son 18 ciclos extra, que son la mayor parte del sobrecosto del CPI (1,38).</p>`,
      },
      {
        heading: 'El hardware de salto en EX',
        html: `<p>Todo ocurre en EX, con muy poco hardware propio:</p>
<ul>
<li>La <b>ALU</b> hace la comparación. Para BEQ/BNE resta (<code>OP_SUB</code>) y activa su bandera <code>zero</code>; para BLT/BGE usa <code>OP_SLT</code>. Además, la ALU calcula <b>siempre</b> las salidas <code>lt</code> (menor con signo) y <code>ltu</code> (menor sin signo), sin depender de la operación, para que BLTU y BGEU funcionen sin otra instrucción.</li>
<li>${gh('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit')} combina <code>funct3</code> con esas banderas: BEQ → <code>zero</code>, BNE → <code>~zero</code>, BLT → <code>lt</code>, BGE → <code>~lt</code>, BLTU → <code>ltu</code>, BGEU → <code>~ltu</code>. Y tiene un sumador propio que calcula <code>pc + imm</code>, el destino de los branches y de JAL.</li>
<li>La señal <code>redirect</code> vale 1 si es un branch cuya condición se cumple, o si es un salto incondicional (<code>branch_taken | ex_jump</code>). El destino es <code>pc + imm</code> para branches y JAL, y <code>(rs1 + imm) &amp; ~1</code> para JALR (lo calcula la ALU, con el bit 0 forzado a cero).</li>
<li>El PC siguiente es <code>redirect ? destino : pc + 4</code>.</li>
</ul>
<p>JAL y JALR no tienen por qué resolverse en la misma etapa que los branches: el destino de JAL no depende de ningún registro (se conoce apenas se decodifica) y podría resolverse en ID; el de JALR depende de <code>rs1</code>, así que combina un riesgo de control con uno de datos. Este diseño los trata a todos igual en EX para no duplicar hardware.</p>`,
      },
      {
        heading: 'El flush: anular lo que no debía ejecutarse',
        html: `<p>Cuando <code>redirect</code> vale 1, las dos instrucciones más jóvenes que el salto están en IF/ID (la que se acaba de buscar) y en la entrada de ID/EX (la que estaba en ID). ${gh('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit')} propaga <code>redirect</code> a <code>flush_if_id</code> y a <code>flush_id_ex</code>. En el flanco siguiente:</p>
<ul>
<li>IF/ID carga un NOP.</li>
<li>ID/EX carga ceros en todo el control (una burbuja).</li>
<li>El PC carga el destino.</li>
</ul>
<p>(El módulo es en realidad un simple "passthrough": dos asignaciones. Existe para dejar explícita la intención y tener un lugar donde agregar lógica si hiciera falta.)</p>
<p>¿Por qué alcanza con eso? Porque <b>ningún efecto arquitectónico ocurre antes de MEM</b> (stores) o WB (registros): lo único que modifica el estado visible está más adelante en el pipeline. Anular las dos instrucciones más jóvenes, que todavía no pasaron de ID, deshace todo su efecto sin necesidad de "deshacer" nada. Las instrucciones <i>anteriores</i> al salto, en MEM y WB, no se tocan.</p>
<p>La burbuja que sigue avanzando por el pipeline no hace nada pero ocupa su lugar en el diagrama: por eso un salto tomado cuesta exactamente 2 ciclos de CPI. Un branch no tomado cuesta 0, y un JAL o JALR (siempre tomados) cuestan 2 cada uno. Una llamada y su retorno juntos, 4.</p>`,
      },
      {
        heading: 'Interacciones con el resto del pipeline',
        html: `<ul>
<li><b>Con el forwarding</b>: los operandos del branch pasan por los mismos muxes de forwarding que cualquier instrucción de EX. Un branch que depende de la instrucción anterior no frena: recibe el dato por EX/MEM. Si depende de un load inmediato anterior, sí hay un stall de load-use antes (el branch está en ID cuando el load está en EX).</li>
<li><b>Con el halt</b>: un <code>ebreak</code> buscado de forma especulativa (en el camino equivocado de un salto) no puede detener el procesador. Como el halt se detecta en EX y el flush del salto anula esa instrucción cuando todavía está en ID, nunca llega a EX. Es un caso que merece su propio test.</li>
<li><b>Con el stall</b>: no coinciden, como se vio en la lección anterior.</li>
<li><b>Con la debug unit</b>: la señal <code>redirect</code> y los flags de flush se pueden ver en la palabra 13 del dump.</li>
</ul>
<p>Mejoras posibles, de menor a mayor costo: predicción estática ("hacia atrás tomado, hacia adelante no tomado", que acierta bien en los loops), resolver JAL en ID (penalidad 1 solo para las llamadas), y predictores dinámicos con buffer de destinos. Cuanto más profundo el pipeline, más caro es un error de predicción, y por eso los procesadores de alto rendimiento gastan tanto hardware en predecir bien.</p>`,
      },
    ],
    watch: [
      { block: 'branch', title: 'La decisión en EX', html: `<p>Cuando el <code>beq</code> llega a EX, branch_unit recibe las banderas de la ALU y decide. Mirá las banderas <code>zero</code>, <code>lt</code> y <code>ltu</code> en el panel: aunque sea un BEQ, la ALU calcula las tres; branch_unit solo mira la que le corresponde según el <code>funct3</code>. Si da "tomado" se enciende el cable hacia el PC.</p>` },
      { block: 'pc', title: 'El PC salta', html: `<p>En el ciclo siguiente a la decisión, el PC no vale <code>pc + 4</code> sino el destino calculado. En la animación se ve cómo IF empieza a traer la instrucción de la etiqueta, y no la que seguía en memoria.</p>` },
      { block: 'flush', title: 'Se anulan las dos instrucciones equivocadas', html: `<p>Al mismo tiempo que se redirige el PC, flush_unit manda su señal a IF/ID y a ID/EX. Vas a ver que las dos <code>addi</code> equivocadas se convierten en burbujas en el ciclo siguiente: nunca llegan a EX. Esas dos burbujas son todo el costo del salto.</p>` },
      { block: 'ifid', title: 'IF/ID recibe un NOP', html: `<p>En vez de la instrucción que había buscado el fetch, IF/ID carga el NOP. Es la mitad del flush; la otra mitad es la burbuja en ID/EX.</p>` },
      { block: 'idex', title: 'ID/EX recibe una burbuja', html: `<p>El registro ID/EX carga ceros en el control: la <code>addi</code> que estaba en ID desaparece. En los ciclos siguientes la burbuja avanzará por EX, MEM y WB sin hacer nada.</p>` },
    ],
    exampleId: 'branch-flush',
    focus: 'flush',
    repo: [
      R('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit.v', 'Condiciones por funct3 y sumador del destino'),
      R('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v', 'Dos asignaciones: redirect a flush_if_id y flush_id_ex'),
      R('pipeline/riscv_pipeline.v', 'redirect_target', 'redirect_target en riscv_pipeline.v', 'El destino: bu_target para branch/JAL, (alu_out & ~1) para JALR'),
      R('pipeline/riscv_pipeline.v', 'pc_next', 'pc_next en riscv_pipeline.v', 'El mux del PC siguiente'),
      R('pipeline/3_execute/alu.v', 'o_lt', 'o_lt / o_ltu en alu.v', 'Las comparaciones que la ALU calcula siempre'),
    ],
    next: 'memoria-de-datos',
  },
  {
    id: 'memoria-de-datos',
    title: 'Memoria de datos: byte lanes, loads y stores con signo',
    level: 'Avanzado',
    track: 'entender',
    minutes: 18,
    intro: 'La memoria es direccionable por byte, pero se organiza en palabras de 4 bytes. Cómo escribir uno o dos bytes sin tocar el resto, y cómo leer un byte o media palabra extendiéndolo con o sin signo, es el trabajo de la etapa MEM.',
    sections: [
      {
        heading: 'Direcciones de byte, palabras de 4 bytes',
        html: `<p>El procesador habla en direcciones de <b>byte</b>, pero la memoria es de palabras de 32 bits. Para pasar de una a otra se separan los bits de la dirección: <code>addr[1:0]</code> (los 2 bits bajos) dicen qué byte de la palabra se toca, y el resto, <code>addr[9:2]</code>, qué palabra. Una BRAM de palabras de 32 bits se indexa por palabra, así que la dirección de palabra sale de descartar los 2 bits bajos de la dirección de byte.</p>
<p>RISC-V es <b>little-endian</b>: el byte menos significativo va en la dirección más baja. Con eso, <code>addr[1:0]</code> también dice qué carril del dato corresponde a ese byte: la dirección terminada en <code>00</code> es el carril 0 (bits 7:0), la terminada en <code>01</code> el carril 1 (bits 15:8), y así.</p>
<p>La dmem de este diseño tiene <b>1 KB</b> (256 palabras) y se indexa con los 8 bits <code>addr[9:2]</code>. No hay ninguna comprobación de rango: las direcciones más altas simplemente dan la vuelta (la dirección <code>0x400</code> accede a la misma palabra que la <code>0x000</code>). Tampoco se borra con un reset del CPU: solo la inicialización de la FPGA la deja en cero.</p>`,
      },
      {
        heading: 'Escrituras parciales: los byte lanes',
        html: `<p>Un <code>sb</code> o un <code>sh</code> deben escribir 1 o 2 bytes <b>sin tocar el resto de la palabra</b>. El mecanismo es el de los <i>carriles de byte</i> (byte lanes): la memoria se organiza como cuatro bancos independientes de 8 bits (<code>lane0</code> a <code>lane3</code>), cada uno con su propia habilitación de escritura. En ${gh('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v')}:</p>
<ul>
<li>Los <b>byte-enables</b> <code>be[3:0]</code> salen de <code>funct3</code> y de los bits bajos de la dirección: SB → <code>0001 &lt;&lt; addr[1:0]</code> (un solo carril); SH → <code>0011</code> o <code>1100</code> según <code>addr[1]</code>; SW → <code>1111</code>.</li>
<li>El <b>dato se replica</b> en las entradas de los carriles para que cada byte llegue a su lugar: el byte bajo de <code>rs2</code> tiene que entrar al carril 1 si el <code>sb</code> es a la dirección <code>...01</code>, aunque en el registro esté en el byte 0. Es el desplazamiento de carril que mencionan los libros.</li>
<li>La escritura es <b>síncrona</b> (ocurre en el flanco de reloj) y solo si hay un store válido y habilitado (<code>we</code> viene de <code>mem_write &amp; en</code>): una instrucción descartada por un flush nunca llega a MEM con <code>mem_write</code> activo.</li>
</ul>
<p>¿Por qué cuatro bancos y no un arreglo de bytes? Porque Vivado mapea un arreglo plano de bytes con escrituras multibyte desalineadas a flip-flops (unos 8000 para 1 KB). Con carriles de 8 bits y una dirección de palabra, la herramienta lo infiere como <b>RAM distribuida</b> (LUTRAM), que es mucho más barata. Es una decisión de síntesis, no de arquitectura, y se nota en el código.</p>`,
      },
      {
        heading: 'Lecturas parciales: elegir y extender',
        html: `<p>La lectura recorre el camino inverso: se lee la palabra completa (<code>{lane3, lane2, lane1, lane0}</code>), se elige el byte o la mitad con <code>addr[1:0]</code> y se extiende a 32 bits. La extensión es la diferencia entre las instrucciones:</p>
<ul>
<li><b>LB</b>: byte con extensión de signo (<code>{{24{b[7]}}, b}</code>). <b>LBU</b>: byte con extensión de ceros (<code>{24'b0, b}</code>).</li>
<li><b>LH</b> y <b>LHU</b>: media palabra con signo / sin signo.</li>
<li><b>LW</b>: la palabra tal cual.</li>
</ul>
<p>Con el byte <code>0xFE</code> guardado, <code>lb</code> entrega <code>0xFFFFFFFE</code> (−2) y <code>lbu</code> entrega <code>0x000000FE</code> (254). Es el motivo por el que existen las dos variantes: enteros pequeños con signo, por un lado, y caracteres o bytes sin signo, por el otro. El resultado de la lectura, ya extendido, sale directamente hacia el mux <code>wb_sel</code>.</p>
<p>Esta decisión (extender dentro de dmem, en MEM) se podría tomar también en WB, después de registrar la palabra cruda. Tomarla en MEM evita agregar más datos a MEM/WB y permite adelantar por forwarding el dato ya extendido.</p>`,
      },
      {
        heading: 'Lectura combinacional: consecuencias',
        html: `<p>En esta implementación la lectura de dmem es <b>combinacional</b> (asincrónica): el dato aparece dentro del mismo ciclo en que se presenta la dirección. Eso es lo que permite que el dato de un load esté disponible en MEM, y por eso el pipeline tiene cinco etapas y no seis. Una <b>BRAM</b> en cambio tiene lectura <i>síncrona</i>: la dirección se registra en el flanco y el dato aparece un ciclo después (otro más si se activa el registro de salida opcional). Con una BRAM habría que absorber ese ciclo: por ejemplo, presentando la dirección un ciclo antes (la ALU calcula la dirección en EX, y la BRAM podría registrar esa dirección a la salida de EX) y sumando un ciclo a la penalidad de load-use. Como la dmem de este diseño es chica, se puede permitir el uso de LUTRAM.</p>
<p>Las BRAM también tienen <b>habilitación de escritura por byte</b> (cuatro señales en vez de una), que es exactamente lo que modelan los byte-enables, y modos de lectura durante la escritura de la misma dirección (<i>read-first</i> devuelve el dato viejo; <i>write-first</i>, el nuevo) que habría que tener en cuenta.</p>`,
      },
      {
        heading: 'Accesos desalineados',
        html: `<p>Un acceso está alineado si su dirección es múltiplo de su tamaño (4 para palabras, 2 para medias palabras). La especificación de RISC-V permite que el hardware soporte accesos desalineados o los trate como excepción. <b>Este diseño no hace ninguna de las dos cosas</b>: no hay traps, y los bits bajos de la dirección simplemente se usan como están. Un <code>lh</code> en una dirección impar o un <code>lw</code> en una dirección no múltiplo de 4 entrega un resultado sin sentido. Un diseño más robusto podría marcar el error en un registro visible por la debug unit, o descomponer el acceso en dos accesos alineados.</p>
<p>También conviene saber qué pasa con un load con un <code>funct3</code> inexistente: entrega 0. Y que los stores con <code>funct3</code> inválido (por ejemplo, <code>funct3 = 011</code>) no escriben.</p>`,
      },
      {
        heading: 'Un hallazgo: SB en el byte 3',
        html: `<p>La lógica de carriles tiene un caso por cada combinación de tamaño y desplazamiento, y es fácil que uno quede mal sin que se note con valores "lindos". Revisando el código se encuentra una asimetría. Los cuatro bytes que se presentan a los carriles son:</p>
<pre>d0 = wdata[7:0]
d1 = sb ? wdata[7:0]   : wdata[15:8]
d2 = sw ? wdata[23:16] : wdata[7:0]
d3 = sw ? wdata[31:24] : wdata[15:8]</pre>
<p>Los tres primeros están bien. Pero en <code>d3</code> falta el caso de SB: para <code>sb</code> a una dirección terminada en <code>11</code>, el carril 3 debería recibir <code>wdata[7:0]</code> (el byte bajo de <code>rs2</code>) y recibe <code>wdata[15:8]</code>. El resultado es que ese store guarda un byte equivocado. El programa de prueba del repo no lo detecta porque su único <code>sb</code> usa la dirección 5 (el carril 1). El simulador de esta web reproduce el RTL tal como está: ejecutá el programa de la categoría "Loads y stores parciales" para verlo (<code>sb</code> de <code>0x7AB</code> en la dirección 3 guarda <code>0x07</code> en lugar de <code>0xAB</code>). Una corrección posible: <code>d3 = sw ? wdata[31:24] : (sb ? wdata[7:0] : wdata[15:8])</code>.</p>
<p>Es una buena ilustración de por qué la verificación sistemática, con valores distintos en cada byte y probando cada desplazamiento, vale más que un único programa grande que "anda".</p>`,
      },
    ],
    watch: [
      { block: 'dmem', title: 'Máscara de bytes en un store', html: `<p>En el ejemplo de loads y stores, mirá el valor de los byte-enables en cada store. El <code>sw</code> enciende los cuatro carriles (<code>1111</code>); el primer <code>sb</code>, a la dirección 4, solo el 0 (<code>0001</code>); el segundo, a la dirección 6, solo el carril 2 (<code>0100</code>). La palabra va quedando armada byte a byte y el contenido de dmem lo muestra.</p>` },
      { block: 'dmem', title: 'Lectura con signo vs sin signo', html: `<p>El <code>lb</code> y el <code>lbu</code> leen el mismo byte <code>0xFE</code> de la misma dirección. Lo único que cambia es la extensión: el primero rellena con unos (resultado <code>0xFFFFFFFE</code>) y el segundo con ceros (<code>0x000000FE</code>). Fijate que en el segundo caso el valor leído cambia aunque la memoria no cambió en nada.</p>` },
      { block: 'alu', title: 'La ALU calcula la dirección', html: `<p>Antes de llegar a dmem, la dirección de cada load y store se calculó en EX sumando el registro base y el inmediato. Es la misma ALU que suma enteros: se usa para <code>rs1 + imm</code> con <code>alu_op = ADD</code>.</p>` },
      { block: 'wbMux', title: 'El resultado de la lectura entra al mux', html: `<p>En un load, el dato ya extendido sale de dmem hacia el mux de resultado, que lo selecciona con <code>wb_sel = 01</code>. Ese valor es lo que viaja por MEM/WB hasta el regfile y, si hace falta, lo que se reenvía a EX.</p>` },
    ],
    exampleId: 'loads-stores-byte-half',
    focus: 'dmem',
    repo: [
      R('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v', 'Cuatro carriles de bytes, byte-enables y lectura con extensión'),
      R('pipeline/4_memory/dmem.v', 'be', 'be (byte-enables) en dmem.v', 'La máscara de escritura según funct3 y addr[1:0]'),
      R('pipeline/4_memory/README.md', null, '4_memory/README.md', 'Organización interna y tabla de lecturas'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'Compara registros y memoria contra el modelo de referencia'),
      X(HOST + 'tests/rv32i_model.py', 'rv32i_model.py', 'El modelo de referencia: aquí está la semántica correcta de sb/sh/sw y lb/lh/lbu/lhu'),
    ],
    next: 'halt-enable',
  },
  {
    id: 'halt-enable',
    title: 'HALT con ebreak y por qué no se toca el reloj',
    level: 'Intermedio',
    track: 'entender',
    minutes: 16,
    intro: 'Detener un procesador segmentado es más sutil de lo que parece: hay que dejar terminar lo anterior, impedir lo posterior y no frenar nunca el reloj. Esta lección explica cómo lo resuelve este diseño con un enable síncrono, una bandera pegajosa y la instrucción ebreak.',
    sections: [
      {
        heading: 'Dos problemas distintos: parar y pausar',
        html: `<p>Conviene separar dos cosas que se parecen. <b>Pausar</b> el procesador (modo paso a paso, comando <code>P</code>) es congelar el estado actual para poder mirarlo y luego continuar. <b>Detenerse</b> (HALT) es el fin de un programa: nada posterior debe ejecutarse. En este diseño comparten mecanismo, la habilitación del CPU, pero tienen causas distintas: la pausa la ordena la debug unit; el halt lo provoca una instrucción.</p>`,
      },
      {
        heading: 'Por qué no se toca el reloj',
        html: `<p>La tentación para un modo paso a paso es "dejar pasar un solo pulso de reloj", por ejemplo con una compuerta AND entre el reloj y una señal de habilitación. Eso se llama <b>clock gating</b>, y en una FPGA trae varios problemas:</p>
<ul>
<li><b>Skew</b>: el reloj viaja por redes dedicadas (buffers globales) que llegan a todos los flip-flops casi al mismo tiempo. Si pasa por lógica común, llega a distintos flip-flops en instantes distintos.</li>
<li><b>Glitches</b>: si la habilitación cambia mientras el reloj está en alto, aparecen pulsos cortos que algunos flip-flops ven y otros no.</li>
<li><b>Análisis de timing roto</b>: la herramienta ya no puede garantizar que el diseño cumpla setup y hold.</li>
</ul>
<p>La alternativa es el <b>diseño sincrónico</b>: el reloj corre siempre y sin modificaciones, y lo que se controla es si cada flip-flop acepta o no el valor nuevo en cada flanco. Los flip-flops de las FPGA de Xilinx tienen una entrada dedicada para esto, el <i>clock enable</i> (CE): con CE en 0, el flip-flop conserva su valor aunque llegue el flanco. Es un <b>enable síncrono</b>, y es la herramienta correcta para frenar sin tocar el reloj.</p>`,
      },
      {
        heading: 'Cómo se implementa el enable en este CPU',
        html: `<p>El módulo ${gh('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline')} recibe <code>i_enable</code> de la debug unit y lo reparte a todos los elementos de estado:</p>
<ul>
<li>El <b>PC</b> avanza solo si <code>pc_en = en &amp; ~stall &amp; ~stop_fetch</code>.</li>
<li>Los cuatro <b>registros de pipeline</b> tienen una entrada <code>en</code>: si vale 0 mantienen su valor, y entonces se ignoran <code>flush</code> y <code>stall</code>.</li>
<li>El <b>banco de registros</b> escribe solo si <code>wb_reg_write &amp; en</code>.</li>
<li>La <b>memoria de datos</b> escribe solo si <code>mem_mem_write &amp; en</code>.</li>
<li>El flag <code>halting</code> solo se actualiza con <code>en</code>.</li>
</ul>
<p>Hay una excepción deliberada: la <b>memoria de instrucciones</b> y su puerto de escritura no dependen de <code>en</code>, porque la carga de un programa ocurre con el CPU en reset. Y el <b>reset</b> tiene prioridad sobre el enable: un CPU pausado igual se resetea con <code>X</code>. En el otro extremo, la UART y la debug unit <b>nunca se pausan</b>: tienen que seguir escuchando comandos mientras el CPU está congelado.</p>
<p>La pregunta de diseño es qué módulos obedecen la habilitación y cuáles tienen que seguir funcionando siempre: es una buena lista para armar antes de escribir una línea de Verilog.</p>`,
      },
      {
        heading: 'La instrucción de parada: ebreak',
        html: `<p>RV32I no define una instrucción de HALT, así que hay que elegir una codificación. Las opciones habituales son un opcode que no use ninguna instrucción implementada (simple de decodificar), <code>ebreak</code> (la instrucción que la ISA reserva para que un depurador tome el control, semánticamente la más cercana a "parar"), o la palabra <code>0x00000000</code> (ilegal por especificación, con el efecto lateral de detener el procesador si llega a memoria vacía).</p>
<p>Este diseño usa <code>ecall</code> / <code>ebreak</code>: en el control, <b>cualquier</b> opcode SYSTEM (<code>1110011</code>) activa la bandera <code>halt</code>. No hace falta distinguir entre ambos porque no hay CSRs ni traps. Todos los programas de ejemplo terminan con <code>ebreak</code>. Una ventaja de usar una instrucción estándar: el mismo programa se puede ensamblar con binutils y ejecutar en cualquier simulador.</p>`,
      },
      {
        heading: 'Detener bien: lo anterior se completa, lo posterior no tiene efecto',
        html: `<p>Cuando se detecta el HALT hay instrucciones <i>anteriores</i> en EX, MEM y WB que todavía no terminaron (deben completarse) e instrucciones <i>posteriores</i> ya traídas (no deben ejecutarse). La ejecución termina cuando todo lo anterior al HALT pasó por WB. Esto se llama <b>halt preciso</b>, y es lo que luego permite mirar un estado consistente.</p>
<p>El mecanismo en este diseño:</p>
<ol>
<li>La bandera <code>halt</code> viaja con la instrucción por ID/EX, EX/MEM y MEM/WB.</li>
<li>Cuando el ebreak llega a <b>EX</b>, <code>stop_fetch = ex_halt | halting</code> vale 1. En el flanco siguiente se anulan IF/ID e ID/EX (<code>flush_if_id</code> y <code>flush_id_ex</code> incluyen <code>stop_fetch</code>) y el PC deja de avanzar (<code>pc_en</code> incluye <code>~stop_fetch</code>). Lo posterior desaparece antes de ejecutarse.</li>
<li>El registro <code>halting_r</code> es <b>pegajoso</b>: queda en 1 desde ese momento hasta el reset, así que el PC no se mueve y el fetch sigue anulado mientras el ebreak termina su camino.</li>
<li>Cuando el ebreak llega a <b>WB</b>, <code>o_halt = wb_halt</code> sube a 1. Todo lo anterior ya se retiró.</li>
<li>La debug unit ve el nivel, deja de habilitar el CPU (<code>cpu_enable = 0</code>) y avisa al host con el byte <code>H</code>.</li>
</ol>
<p>Hay un caso sutil: si IF trae un HALT justo después de un branch que termina saltando, ese HALT no debía ejecutarse. Este diseño evita el problema porque detecta el halt en EX y no en ID: una instrucción del camino equivocado nunca llega a EX, porque el salto que la precede está en EX antes que ella y el flush la anula cuando todavía está en ID. Un test importante: un <code>ebreak</code> inmediatamente después de un branch tomado no debe detener nada.</p>`,
      },
      {
        heading: 'Qué pasa si no hay HALT',
        html: `<p>Si el programa no tiene ningún <code>ebreak</code>, nada lo detiene. Después de la última instrucción la memoria de instrucciones está llena de NOPs (la debug unit rellena lo que el programa no cubre), así que el PC sigue avanzando; como la imem se indexa con <code>addr[9:2]</code>, al llegar a 256 instrucciones da la vuelta y el programa se ejecuta de nuevo desde 0. En modo continuo el usuario no ve nada raro: el LED de habilitación queda encendido y no llega ningún <code>H</code>. Hay que pausarlo con el comando <code>P</code>. Un mecanismo de seguridad posible sería un límite de ciclos o la detección de un PC fuera de rango.</p>
<p>Y una pregunta práctica que se desprende: al reprogramar, ¿qué hay que vaciar? Memoria de instrucciones (el comando <code>L</code> rellena con NOPs lo que no cubre), registros (los borra el reset), latches del pipeline (reset) y PC (reset); la <b>memoria de datos no se borra</b>, así que un programa nuevo ve los valores del anterior salvo que los escriba.</p>`,
      },
    ],
    watch: [
      { block: 'control', title: 'Se detecta el opcode SYSTEM', html: `<p>Cuando el <code>ebreak</code> está en ID, el control activa <code>halt</code> y deja el resto de las banderas en cero. No pasa nada todavía: la instrucción solo lleva el bit de halt consigo, como cualquier otra señal de control.</p>` },
      { block: 'flush', title: 'Al llegar a EX se detiene el fetch', html: `<p>En el ciclo en que el ebreak está en EX, el bloque de flush se activa igual que en un salto: la <code>addi x3</code> que estaba en ID desaparece y el PC deja de avanzar. A diferencia de un salto, el PC no cambia a un destino nuevo: se queda quieto.</p>` },
      { block: 'pc', title: 'El PC queda congelado', html: `<p>En los ciclos siguientes el PC muestra siempre el mismo valor, aunque pasen ciclos de reloj. Mientras tanto las instrucciones anteriores al ebreak siguen su camino hacia WB: en ese momento, <code>addi x2</code> escribe su resultado.</p>` },
      { block: 'memwb', title: 'WB y la señal de halt', html: `<p>Cuando el ebreak llega a WB, se enciende la señal de halt hacia afuera del CPU. Todo lo anterior ya fue retirado. De ahí en adelante, la debug unit mantiene deshabilitado el CPU.</p>` },
      { block: 'debug', title: 'La debug unit informa al host', html: `<p>En la vista Debug, el LED de halt se enciende y, si el CPU corría en modo continuo, la consola recibe el byte <code>H</code> sin haberlo pedido: es la única respuesta espontánea del protocolo.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'control',
    repo: [
      R('pipeline/2_decode/control.v', 'SYS', 'SYS en control.v', 'Cualquier opcode SYSTEM pone halt = 1'),
      R('pipeline/riscv_pipeline.v', 'stop_fetch', 'stop_fetch en riscv_pipeline.v', 'La señal que anula IF/ID e ID/EX y congela el PC'),
      R('pipeline/riscv_pipeline.v', 'halting_r', 'halting_r en riscv_pipeline.v', 'La bandera pegajosa hasta el reset'),
      R('pipeline/riscv_pipeline.v', 'o_halt', 'o_halt', 'Nivel que sube cuando el ebreak llega a WB'),
      R('debug/debug_unit_fsm.v', 'o_cpu_enable', 'o_cpu_enable en debug_unit_fsm.v', 'cpu_enable = (run | step) & ~halt & ~dumping'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'Comprueba que nada posterior al ebreak se ejecutó y que la pausa congela el pipeline'),
    ],
    next: 'debug-unit',
  },
  {
    id: 'debug-unit',
    title: 'La debug unit: protocolo L/S/R/P/X/D, FSM y dump de 86 palabras',
    level: 'Avanzado',
    track: 'entender',
    minutes: 22,
    intro: 'La debug unit es una máquina de estados entre la UART y el procesador: recibe comandos de un byte, carga programas, controla la ejecución y devuelve el estado interno del CPU. Esta lección recorre el protocolo, los once estados de la FSM, cómo se serializa una palabra de 32 bits y el mapa del volcado.',
    sections: [
      {
        heading: 'Qué responsabilidades tiene',
        html: `<p>La unidad se ubica entre la UART y el procesador y tiene cuatro responsabilidades: <b>recibir y entender comandos</b> de la PC, <b>cargar el programa</b> en la memoria de instrucciones, <b>controlar la ejecución</b> (arrancar en modo continuo, avanzar un paso, detener, reiniciar) y <b>recolectar y enviar el estado</b>: los registros, las señales del pipeline y la memoria de datos. La UART no sabe nada del procesador y la debug unit no sabe nada de bits seriales: son módulos separados que se hablan en bytes.</p>`,
      },
      {
        heading: 'El protocolo',
        html: `<p>No existe un protocolo estándar para esto: se diseña, y es una de las decisiones que más conviene documentar. Este tiene que resolver cuatro cosas: la <b>codificación de comandos</b> (un byte ASCII por acción), la <b>delimitación</b> (cada comando tiene una longitud conocida: un byte, o cabecera con longitud), la <b>confirmación</b> (casi todos tienen respuesta, así la PC sabe si algo se perdió) y el <b>orden de bytes</b> (todas las palabras van en little-endian, igual que en RISC-V).</p>
<table>
<tr><th>Byte</th><th>Comando</th><th>Respuesta</th><th>Qué hace</th></tr>
<tr><td><code>L</code></td><td>load</td><td><code>K</code> o <code>E</code></td><td>sigue <code>n_lo n_hi</code> (cantidad de instrucciones, 16 bits little-endian) y luego 4·n bytes del programa; lo que no se cubre se rellena con NOP; <code>E</code> si el programa no entra en la memoria</td></tr>
<tr><td><code>S</code></td><td>step</td><td><code>K</code> o <code>H</code></td><td>avanza exactamente un ciclo de reloj; <code>H</code> si el CPU ya está detenido</td></tr>
<tr><td><code>R</code></td><td>run</td><td><code>K</code> o <code>H</code></td><td>ejecución continua; más adelante llega un <code>H</code> espontáneo cuando el CPU llega al halt</td></tr>
<tr><td><code>P</code></td><td>pause</td><td><code>K</code></td><td>detiene la ejecución continua</td></tr>
<tr><td><code>X</code></td><td>reset</td><td><code>K</code></td><td>reinicia el CPU: PC = 0, pipeline vacío, x1..x31 en 0. No toca las memorias</td></tr>
<tr><td><code>D</code></td><td>dump</td><td>—</td><td>manda <code>count_lo count_hi</code> y luego <code>count</code> palabras de 32 bits little-endian</td></tr>
<tr><td>otro</td><td>—</td><td><code>?</code></td><td>comando desconocido</td></tr>
</table>
<p>Por ejemplo, cargar el programa de dos instrucciones <code>addi x1,x0,5</code> + <code>ebreak</code> es la trama <code>4C 02 00 93 00 50 00 73 00 10 00</code>: 'L', n = 2 y cuatro bytes por instrucción en el orden de un archivo binario de RISC-V.</p>`,
      },
      {
        heading: 'La FSM: once estados',
        html: `<p>${gh('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'debug_unit_fsm.v')} implementa la lógica. Los estados son:</p>
<ul>
<li><code>IDLE</code>: espera un comando. Si el CPU corría en modo run y se detuvo, manda <code>H</code> por su cuenta.</li>
<li><code>LOAD_LEN_LO</code>, <code>LOAD_LEN_HI</code>: recibe los dos bytes de la cantidad.</li>
<li><code>LOAD_DATA</code>: recibe los bytes del programa y los escribe uno por uno en la imem.</li>
<li><code>LOAD_FILL</code>: rellena con NOP lo que el programa no cubre (el byte bajo del NOP es <code>0x13</code>, los otros tres <code>0x00</code>).</li>
<li><code>REPLY</code>: envía la respuesta guardada y vuelve a IDLE.</li>
<li><code>DUMP_CNT_LO</code>, <code>DUMP_CNT_HI</code>: envía la cantidad de palabras.</li>
<li><code>DUMP_ADDR</code>, <code>DUMP_LATCH</code>, <code>DUMP_BYTE</code>: para cada palabra, pide la dirección al bus de debug, la captura y manda sus 4 bytes.</li>
</ul>
<p>Las salidas de control hacia el CPU salen de combinaciones muy simples:</p>
<pre>cpu_enable = (run | step) &amp; ~cpu_halt &amp; ~dumping
cpu_reset  = reset_del_sistema | cpu_rst | loading</pre>
<p><code>run</code> es un modo que queda activo (hasta <code>P</code>, un halt o un reset). <code>step</code>, en cambio, es un <b>pulso de un ciclo</b>: el comando <code>S</code> lo pone en 1 y en el ciclo siguiente la FSM lo vuelve a 0, así que el CPU recibe exactamente un flanco habilitado. Esa es la respuesta a la pregunta de cómo se genera una habilitación que dure exactamente un ciclo a partir de un comando. Mientras se vuelca el estado (<code>dumping</code>), el CPU no avanza, y al terminar vuelve al modo en que estaba.</p>
<p>Un comando <code>L</code> pone el CPU en reset durante toda la carga (<code>loading</code> en la expresión de <code>cpu_reset</code>), por eso la imem se puede escribir sin proteger nada. Al terminar, el CPU queda detenido con PC = 0.</p>`,
      },
      {
        heading: 'Tres módulos por FSM: fsm, comb y regs',
        html: `<p>La debug unit (y también la UART) sigue un patrón de diseño: cada FSM se parte en tres módulos.</p>
<ul>
<li><b>${gh('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'fsm')}</b>: lógica de próximo estado y de las señales de control. Solo combinacional.</li>
<li><b>${gh('debug/debug_unit_comb.v', 'module:debug_unit_comb', 'comb')}</b>: el camino de datos combinacional: los próximos valores de los contadores, de la longitud, de la palabra que se está enviando, y las banderas que la FSM necesita (<code>len_zero</code>, <code>load_last</code>, <code>in_range</code>, <code>dbg_last</code>, <code>byte_last</code>).</li>
<li><b>${gh('debug/debug_unit_regs.v', 'module:debug_unit_regs', 'regs')}</b>: todos los flip-flops, con un único <code>always @(posedge clk)</code> y reset sincrónico a 0 (<code>IDLE = 0</code>).</li>
</ul>
<p>La separación hace que cada archivo sea chico, que el estado esté en un solo lugar y que la lógica combinacional se pueda razonar sin pensar en el reloj. Un diseño alternativo es la FSM de un solo bloque <code>always</code>, más corta pero más difícil de leer cuando crece.</p>`,
      },
      {
        heading: 'Serializar datos anchos: del bus de 32 bits a bytes',
        html: `<p>Los registros de pipeline suman cientos de bits y la UART manda de a 8. Hace falta un mecanismo que recorra ese vector de a un byte. Acá es un conjunto de contadores:</p>
<ol>
<li><code>DUMP_ADDR</code> deja estable la dirección <code>dbg_addr</code> durante un ciclo.</li>
<li><code>DUMP_LATCH</code> captura la palabra del bus (<code>dbg_word</code>) y pone en cero el contador de bytes.</li>
<li><code>DUMP_BYTE</code> envía el byte bajo (<code>dbg_word[7:0]</code>), desplaza la palabra 8 bits a la derecha (<code>{8'h00, dbg_word[31:8]}</code>) e incrementa el contador de byte. Después de 4 envíos pasa a la palabra siguiente.</li>
</ol>
<p>Si la FIFO de transmisión está llena, la FSM simplemente espera en el mismo estado: es la contrapresión natural. El bus de debug mantiene la dirección <b>un ciclo antes</b> de muestrear el dato, así sirve para fuentes combinacionales (el mapa del CPU) y para fuentes con un ciclo de latencia (una BRAM); ese es el motivo de <code>DUMP_ADDR</code> y <code>DUMP_LATCH</code>.</p>`,
      },
      {
        heading: 'El mapa del dump: 86 palabras',
        html: `<p>El CPU expone un bus de debug combinacional: se le da una dirección y devuelve una palabra. El volcado recorre las direcciones 0 a 85:</p>
<ul>
<li><b>0</b>: PC. <b>1-2</b>: IF/ID (pc, instrucción).</li>
<li><b>3-8</b>: ID/EX (palabra de control, campos rs1/rs2/rd/funct3, pc, rdata1, rdata2, inmediato).</li>
<li><b>9-13</b>: señales de EX: operando A y B (después del forwarding), resultado de la ALU, destino del salto y una palabra de flags (<code>stall</code>, flush, redirect, branch_taken, zero, overflow, halting, y los códigos de forwarding de A y B).</li>
<li><b>14-17</b>: EX/MEM (control, resultado, dato de store, campos). <b>18</b>: dato leído de dmem.</li>
<li><b>19-21</b>: MEM/WB (control, resultado, rd).</li>
<li><b>22-53</b>: x0..x31. <b>54-85</b>: las primeras 32 palabras de dmem.</li>
</ul>
<p>El mapa está documentado en el encabezado de ${gh('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v')}, y el host lo decodifica en <code>decode_dump()</code>. La regla es: si se agrega una palabra al mapa, va <b>siempre al final</b>, y hay que extender el decodificador del host. Es el mismo problema de mantener sincronizados hardware y software que aparece en cualquier protocolo propio.</p>
<p>Nótese qué <i>no</i> se vuelca: solo 32 de las 256 palabras de dmem. Es una decisión de tamaño del volcado (a 19200 baudios cada palabra cuesta 2 ms). Alternativas: volcar toda la memoria, un rango pedido por la PC, o llevar registro de qué direcciones se escribieron.</p>`,
      },
      {
        heading: 'Casos borde y comportamiento ante errores',
        html: `<ul>
<li>Un programa más largo que la imem: los bytes que no entran se consumen igual (para no desincronizar el protocolo), se escriben los que entran y la respuesta es <code>E</code>.</li>
<li>Un programa más corto que la longitud declarada, o <code>n = 0</code>: el resto queda en NOP.</li>
<li><code>S</code> o <code>R</code> con el CPU ya detenido: responden <code>H</code> en vez de <code>K</code>, y el CPU no avanza.</li>
<li>Un comando mientras corre el CPU: se atiende normalmente, porque la FSM vuelve a IDLE tras cada respuesta mientras el CPU sigue corriendo. Un <code>D</code> pausa el CPU durante el volcado.</li>
<li>Un byte desconocido: responde <code>?</code> y vuelve a IDLE.</li>
<li>Bytes que llegan mientras la FSM está ocupada: se acumulan en la FIFO de recepción (4 lugares). Si se llenara, los siguientes se pierden. El protocolo no tiene control de flujo, así que el host debe esperar la respuesta antes de mandar el próximo comando.</li>
</ul>`,
      },
    ],
    watch: [
      { block: 'debug', title: 'La FSM avanza estado por estado', html: `<p>En la vista Debug, el grafo de la máquina de estados resalta el estado actual. Mandá una <code>L</code> con un programa y vas a ver pasar <code>LOAD_LEN_LO</code>, <code>LOAD_LEN_HI</code>, <code>LOAD_DATA</code> y <code>LOAD_FILL</code> hasta <code>REPLY</code> y vuelta a <code>IDLE</code>, mientras el LED de reset del CPU permanece encendido toda la carga.</p>` },
      { block: 'debug', title: 'Los tres LEDs', html: `<p>El LED 0 (habilitado) se enciende con <code>R</code> o durante un paso; el LED 1 (reset) durante la carga y brevemente con <code>X</code>; el LED 2 (halt) cuando el <code>ebreak</code> llegó a WB. Son las únicas salidas visibles de la FSM sobre el CPU.</p>` },
      { block: 'uart', title: 'Los bytes que cruzan la línea', html: `<p>El panel de tráfico muestra cada byte enviado y recibido con su trama (start, 8 bits datos LSB primero, stop). En un volcado completo vas a ver los 346 bytes de respuesta con su duración en la línea serie (unos 180 ms).</p>` },
      { block: 'pc', title: 'El efecto del reset y del paso', html: `<p>Después de <code>X</code> el PC vuelve a 0 y el pipeline está vacío. Cada <code>S</code> hace avanzar exactamente un ciclo: se ve cómo una instrucción entra a IF, y las demás avanzan una etapa.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'debug',
    repo: [
      R('debug/debug_unit.v', 'module:debug_unit', 'debug_unit.v', 'La cabecera documenta el protocolo completo'),
      R('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'debug_unit_fsm.v', 'Los once estados, las banderas de control y cpu_enable/cpu_reset'),
      R('debug/debug_unit_comb.v', 'module:debug_unit_comb', 'debug_unit_comb.v', 'El camino de datos: contadores, palabra a enviar y banderas'),
      R('debug/debug_unit_regs.v', 'module:debug_unit_regs', 'debug_unit_regs.v', 'Los flip-flops con reset sincrónico'),
      R('pipeline/riscv_pipeline.v', 'o_dbg_data', 'El bus de debug en riscv_pipeline.v', 'El case que arma las 86 palabras'),
      X(HOST + 'debug_protocol.py', 'host/debug_protocol.py', 'El cliente del protocolo y decode_dump()'),
      X(TB + 'tb_top_riscv.v', 'tb_top_riscv.v', 'Maneja el sistema completo por la línea serie, como lo haría la PC'),
    ],
    next: 'uart',
  },
  {
    id: 'uart',
    title: 'UART: 8N1, sobremuestreo ×16, sincronizador 2FF y FIFOs',
    level: 'Avanzado',
    track: 'entender',
    minutes: 22,
    intro: 'La UART es el canal físico entre la PC y la FPGA: dos cables, sin reloj compartido. Para que funcione hay que acordar una velocidad, muestrear la línea en el momento correcto, sincronizar una señal que llega de afuera y desacoplar el ritmo del serial del ritmo del sistema.',
    sections: [
      {
        heading: 'El protocolo UART: tramas 8N1',
        html: `<p>Una UART es una comunicación serie <b>asincrónica</b>: emisor y receptor no comparten reloj. Solo acuerdan de antemano la velocidad (<i>baud rate</i>) y el formato de la trama. El formato más común es <b>8N1</b>: 8 bits de datos, sin paridad (<i>No parity</i>) y 1 bit de stop.</p>
<ul>
<li>En reposo la línea está en <b>1</b>.</li>
<li>Un bit de <b>start</b> en 0 marca el comienzo de la trama.</li>
<li>Siguen 8 bits de datos, del <b>menos significativo al más significativo</b>.</li>
<li>Un bit de <b>stop</b> en 1 cierra la trama y deja la línea lista para el siguiente start.</li>
</ul>
<p>Cada byte ocupa entonces 10 tiempos de bit. A <b>19200 baudios</b> (la velocidad de este diseño) un bit dura unos 52 µs y un byte unos 521 µs: unos 1,9 KB por segundo. Mandar los 32 registros (128 bytes) lleva del orden de 67 ms. Es una velocidad baja, elegida por robustez; a 115200 baudios sería 6 veces más rápida, y la única parte que cambia en el diseño es el cálculo del divisor.</p>`,
      },
      {
        heading: 'El generador de baud rate y el sobremuestreo',
        html: `<p>El receptor no muestrea la línea una vez por bit sino <b>16 veces</b>. Eso se llama sobremuestreo, y requiere un tick con una frecuencia 16 veces la del baud rate. ${gh('uart/baud_rate_gen.v', 'module:baud_rate_gen', 'baud_rate_gen')} es un contador módulo <code>MODULUS</code> que emite un pulso de un ciclo al llegar al final:</p>
<pre>MODULUS = CLK_FREQ / (BAUD_RATE × N_TICKS)</pre>
<p>El reloj del sistema en este diseño es de <b>50 MHz</b> (el MMCM divide los 100 MHz de la placa por 2), así que <code>MODULUS = 50 000 000 / (19 200 × 16) = 162,76</code>, que la división entera trunca a <b>162</b>. El baud rate real queda en <code>50e6 / (162 × 16) = 19 290</code> baudios: un error de +0,47 %. Es perfectamente tolerable: a lo largo de los 9,5 tiempos de bit hasta el centro del bit de stop, el desfase acumulado es de unos 0,045 de bit, muy lejos del medio bit que haría fallar el muestreo.</p>
<p><b>Atención con el README de la UART</b>: dice <code>MODULUS = 325</code>, que es el valor para 100 MHz. Como en la placa el sistema corre a 50 MHz, el valor real es 162. Cuando el RTL y un README no coinciden, vale el RTL. Y la lección general: <b>si se cambia la frecuencia del sistema, hay que recalcular el divisor</b>. El módulo top le pasa a la UART la frecuencia interna (<code>SYS_FREQ</code>), no la del oscilador, justamente para que esto se haga solo.</p>`,
      },
      {
        heading: 'El receptor: muestrear en el centro de cada bit',
        html: `<p>${gh('uart/uart_rx_fsm.v', 'module:uart_rx_fsm', 'uart_rx_fsm')} tiene cuatro estados y dos contadores: <code>s</code> cuenta ticks dentro de un bit (0 a 15) y <code>n</code> cuenta los bits de datos (0 a 7).</p>
<ol>
<li><code>IDLE</code>: espera un flanco descendente de la línea (<code>rx = 0</code>) y pasa a <code>START</code> poniendo <code>s</code> en 0.</li>
<li><code>START</code>: cuenta 8 ticks hasta la <b>mitad del bit de start</b> (<code>s == 7</code>), y pasa a <code>DATA</code>. En este punto una implementación más cuidadosa volvería a verificar que la línea siga en 0 para descartar ruido; esta no lo hace.</li>
<li><code>DATA</code>: cada 16 ticks, o sea siempre en el <b>centro</b> de un bit, muestrea la línea y la desplaza dentro del byte (el primer bit recibido es el menos significativo, por eso el registro se arma desplazando hacia la derecha: <code>{rx, byte[7:1]}</code>). Al octavo bit pasa a <code>STOP</code>.</li>
<li><code>STOP</code>: espera 16 ticks más, hasta el centro del bit de stop, y emite <code>rx_done</code> <b>solo si la línea vale 1</b>: un byte con el stop mal formado se descarta.</li>
</ol>
<p>Muestrear en el centro da margen para que los dos relojes difieran un poco sin perder datos: cada bit tiene 8 ticks de tolerancia a cada lado. Además el flanco descendente se detecta con una incertidumbre de hasta un tick (1/16 de bit), que es el motivo por el que se usa sobremuestreo en vez de un solo muestreo por bit.</p>`,
      },
      {
        heading: 'El transmisor y las FIFOs',
        html: `<p>El transmisor es más simple: no tiene que adivinar nada. Cuando hay un byte en su FIFO, carga el byte, baja la línea durante 16 ticks (start), muestra los 8 bits de datos de a 16 ticks cada uno (desplazando el byte a la derecha, así sale primero el bit menos significativo), sube la línea durante 16 ticks (stop) y emite un pulso <code>tx_done</code>.</p>
<p>Entre la debug unit y la UART hay <b>una FIFO por sentido</b> (${gh('uart/fifo.v', 'module:fifo', 'fifo.v')}), de 4 posiciones (<code>PTR_LEN = 2</code>). Una FIFO es una cola circular con un puntero de lectura y uno de escritura y dos banderas, <code>empty</code> y <code>full</code>. Sirven para desacoplar dos ritmos: el serial (un byte cada 521 µs) y el de la debug unit (un ciclo de reloj de 20 ns).</p>
<ul>
<li>La FIFO de <b>recepción</b> guarda bytes que llegaron mientras la debug unit estaba ocupada. Si la PC manda más rápido de lo que la unidad procesa, la FIFO ayuda; si se llena, los bytes nuevos <b>se pierden</b> (la escritura se ignora cuando está llena). No hay control de flujo, así que el host debe esperar la respuesta antes de mandar el próximo comando.</li>
<li>La FIFO de <b>transmisión</b> se vacía sola: cada <code>tx_done</code> hace un pop y la bandera <code>~empty</code> alimenta el pedido de transmitir, así que los bytes encolados salen uno detrás de otro sin huecos. Cuando está llena, la debug unit espera en su estado actual (por eso un volcado de 346 bytes avanza al ritmo de la línea).</li>
</ul>`,
      },
      {
        heading: 'Metaestabilidad y el sincronizador de dos flip-flops',
        html: `<p>La señal RX viene de afuera y cambia en cualquier instante respecto del reloj del sistema. Si un flip-flop la captura justo cuando cambia, viola su tiempo de setup o de hold y puede quedar en un estado intermedio, <b>metaestable</b>, durante un tiempo impredecible antes de resolverse a 0 o a 1. Si ese valor dudoso llegara a la lógica, distintas partes del diseño podrían leerlo de manera diferente.</p>
<p>La solución estándar es pasar la entrada por <b>dos flip-flops en cadena</b> antes de usarla (${gh('common/sync_2ff.v', 'module:sync_2ff', 'sync_2ff')}). El primero puede quedar metaestable; con un ciclo de reloj completo para resolverse, la probabilidad de que el segundo también lo sea es despreciable. Toda señal asincrónica que entre al diseño necesita esto: en este repo, la línea RX y el botón de reset. Detalles del código: el valor inicial es 1 (<code>INIT = 1</code>), porque la línea en reposo vale 1 y no debe verse un falso start al encender, y los flip-flops llevan el atributo <code>ASYNC_REG</code> para que Vivado los ubique juntos.</p>
<p>El costo es latencia: la señal llega 2 ciclos más tarde. A 50 MHz son 40 ns, una fracción mínima de un tiempo de bit.</p>`,
      },
      {
        heading: 'Cómo se verifica',
        html: `<p>En ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')} el testbench incluye un <b>receptor UART de la PC</b> que corre concurrentemente y guarda en una cola todo lo que llega, y comprueba que no haya errores de trama (<code>framing_errors</code>) en lo que transmite la FPGA. Para que la simulación termine rápido usa un baud rate muy alto (un bit = 128 ciclos de reloj). En hardware real la recomendación es probar primero un <b>loopback</b>: que la FPGA devuelva lo que recibe, y recién después el sistema completo. El simulador de esta web modela la UART bit a bit (<code>src/sim/uart.js</code>) con la misma estructura de FSM, y en la vista Debug se ven las tramas con sus tiempos.</p>`,
      },
    ],
    watch: [
      { block: 'uart', title: 'La trama de un byte', html: `<p>En la vista Debug, cada byte aparece como una trama: línea en 1 en reposo, un bit de start en 0, ocho bits de datos del menos al más significativo y un bit de stop en 1. Por ejemplo la <code>R</code> (0x52 = 01010010) se transmite como 0 (start), 0 1 0 0 1 0 1 0 (bits de datos, LSB primero) y 1 (stop).</p>` },
      { block: 'uart', title: 'Los contadores de ticks', html: `<p>El receptor cuenta de 0 a 15 dentro de cada bit; en cada centro (el tick 7 del bit de start y el 15 de los siguientes, contados desde su comienzo) toma una muestra. Mirá cómo el contador <code>s</code> reinicia en cada bit y el contador <code>n</code> avanza solo cuando se completa un bit de datos.</p>` },
      { block: 'debug', title: 'Los bytes de la UART son los comandos de la debug unit', html: `<p>Lo que sale de la FIFO de recepción es lo que consume la debug unit un byte a la vez, y lo que la debug unit escribe en la FIFO de transmisión es lo que sale al cable. La única conexión entre las dos piezas son esos bytes y las banderas <code>rx_empty</code> y <code>tx_full</code>.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'uart',
    repo: [
      R('uart/uart_core.v', 'module:uart_core', 'uart_core.v', 'Une el generador de baud, RX, TX y las dos FIFOs'),
      R('uart/baud_rate_gen.v', 'MODULUS', 'MODULUS en baud_rate_gen.v', 'CLK_FREQ / (BAUD_RATE × N_TICKS)'),
      R('uart/uart_rx_fsm.v', 'module:uart_rx_fsm', 'uart_rx_fsm.v', 'IDLE, START, DATA, STOP: muestreo en el centro de cada bit'),
      R('uart/uart_tx_fsm.v', 'module:uart_tx_fsm', 'uart_tx_fsm.v', 'El transmisor'),
      R('uart/fifo.v', 'module:fifo', 'fifo.v', 'Cola circular con banderas empty/full'),
      R('common/sync_2ff.v', 'module:sync_2ff', 'sync_2ff.v', 'Sincronizador de dos flip-flops con ASYNC_REG'),
      R('top/top_riscv.v', 'u_rx_sync', 'u_rx_sync en top_riscv.v', 'Donde la línea RX entra por el sincronizador'),
      X(TB + 'tb_top_riscv.v', 'tb_top_riscv.v', 'Receptor UART de la PC en el testbench y chequeo de errores de trama'),
    ],
    next: 'sin-forwarding-cpi',
  },
  {
    id: 'sin-forwarding-cpi',
    title: 'La alternativa sin forwarding y el CPI',
    level: 'Avanzado',
    track: 'entender',
    minutes: 16,
    intro: 'Para valorar el forwarding conviene medirlo. Esta lección define el CPI, explica el modo didáctico "sin forwarding" de la web (que no existe en el RTL), compara los ciclos de los ejemplos con y sin él y muestra que cada mejora de CPI tiene un costo en otra parte.',
    sections: [
      {
        heading: 'El CPI y la ecuación de rendimiento',
        html: `<p>El tiempo de ejecución de un programa es <code>T = N × CPI × T_clk</code>. Un diseño más rápido puede reducir cualquiera de los tres factores, y casi siempre mejorar uno empeora otro. El <b>CPI</b> (ciclos por instrucción) de un pipeline ideal vale 1; con hazards:</p>
<pre>CPI = 1 + (ciclos perdidos por burbujas) / (instrucciones retiradas)</pre>
<p>A eso se suma el llenado del pipeline: sin burbujas, N instrucciones en un pipeline de 5 etapas llevan <code>N + 4</code> ciclos. Para este diseño hay una fórmula exacta que se verifica con el simulador:</p>
<pre>ciclos = 4 + N + (stalls de load-use) + 2 × (saltos tomados y jumps)</pre>
<p>Es una buena herramienta de verificación: si un programa de 20 instrucciones tiene 3 stalls y ningún salto, tienen que ser 4 + 20 + 3 = 27 ciclos. Si la simulación da otro número, algo se está frenando (o se está saltando) de más. El <b>IPC</b> es la inversa del CPI.</p>`,
      },
      {
        heading: 'El modo "sin forwarding" de la web',
        html: `<p>La web puede ejecutar el mismo programa con el forwarding apagado. No existe en el RTL: es una alternativa didáctica. El pipeline resuelve las dependencias RAW como lo haría el diseño más simple posible, con un <b>interlock</b>: si la instrucción en ID necesita un registro que va a escribir alguna de las instrucciones que están en EX o en MEM, se la frena (el PC y IF/ID se congelan y se inserta una burbuja en EX) hasta que el productor llegue a WB y el bypass interno del regfile entregue el dato.</p>
<p>El costo depende de la distancia entre productor y consumidor:</p>
<ul>
<li><b>Distancia 1</b> (consumidor justo atrás del productor): 2 burbujas.</li>
<li><b>Distancia 2</b>: 1 burbuja.</li>
<li><b>Distancia 3 o más</b>: ninguna, porque el bypass interno del regfile entrega el dato. Si el regfile no tuviera bypass, la distancia 3 también costaría una burbuja.</li>
</ul>
<p>El hardware que se ahorra es considerable: desaparecen la unidad de forwarding, sus comparadores y los muxes de 3 entradas en la ALU. Se conserva solo la detección de dependencias, que es más sencilla que el forwarding en sí.</p>`,
      },
      {
        heading: 'Cuánto cuesta no tener forwarding: números del simulador',
        html: `<p>Medido con los ejemplos de esta web (ciclos totales hasta que el ebreak llega a WB, y CPI sobre las instrucciones retiradas):</p>
<ul>
<li><b>Forwarding EX/MEM</b> (4 instrucciones): 8 ciclos con forwarding (CPI 2,0, dominado por el llenado) y 12 sin él (CPI 3,0).</li>
<li><b>Load-use</b> (5 instrucciones): 10 ciclos con forwarding y 13 sin él.</li>
<li><b>MEM/WB y bypass</b> (6 instrucciones): 10 y 11 ciclos: casi no hay diferencia, porque las dependencias son a distancia 2 y 3.</li>
<li><b>LUI / AUIPC</b> (7 instrucciones): 11 y 15 ciclos.</li>
<li><b>Programa de prueba completo</b> (61 instrucciones): <b>84 ciclos con forwarding (CPI 1,38) y 129 sin él (CPI 2,11)</b>. Con forwarding, los 23 ciclos extra son los 4 de llenado, 18 por 9 saltos tomados y 1 stall de load-use; sin forwarding se suman 45 burbujas por dependencias.</li>
</ul>
<p>En los ejemplos de esta web, el CPI sin forwarding va de 1,4 a 3,0 según la densidad de dependencias de distancia 1 y 2. En un programa muy corto el CPI está dominado por el llenado del pipeline y no dice mucho. Y los saltos tomados cuestan lo mismo con y sin forwarding (<code>jal-jalr</code> da los mismos ciclos en ambos modos), porque el forwarding no tiene nada que ver con el hazard de control.</p>`,
      },
      {
        heading: 'Nada es gratis: el forwarding y el reloj',
        html: `<p>La ecuación de rendimiento también tiene el período del reloj. El forwarding agrega multiplexores y, sobre todo, <b>caminos combinacionales largos</b> entre las salidas de las etapas MEM y WB y la entrada de la ALU. En este diseño ese camino (dmem → forwarding → ALU → branch → flush) es el camino crítico, y es el que impidió que el sistema cerrara timing a 100 MHz (WNS cercano a −5 ns después del ruteo, es decir un período realista de unos 15 ns). Lo resolvió dividir el reloj por 2.</p>
<p>Un diseño sin forwarding, con camino crítico más corto, podría correr a mayor frecuencia. ¿Compensa? Hay que comparar el producto <code>CPI × T_clk</code>: sin forwarding el CPI de un programa típico sube 50 % o más, así que el reloj tendría que mejorar un 50 % para empatar. En este diseño el camino crítico incluye además la lectura de dmem y la decisión de salto, así que no es evidente cuánto reduciría el período quitar el forwarding. La respuesta real depende de medir, y por eso el reporte de timing de Vivado es parte del proceso de diseño.</p>
<p>Un punto medio muy común: forwardear solo resultados de la ALU (no el dato de memoria). Eso acorta el camino crítico a costa de requerir el stall de load-use, tal como lo implementa el libro (ver la observación de la lección de load-use sobre lo que pasa en este diseño).</p>`,
      },
      {
        heading: 'Cómo usar esto para verificar tu propio diseño',
        html: `<p>El CPI es también una herramienta de verificación de rendimiento (no de corrección). Un testbench que compara solo el estado final no ve un stall de más: el "stall falso" de esta implementación deja los registros perfectos y cuesta un ciclo. Para detectarlo hay que medir ciclos. Una buena práctica es que cada programa de prueba tenga, además de los valores esperados, la cantidad de ciclos que predice la fórmula, y que el testbench la compare.</p>`,
      },
    ],
    watch: [
      { block: 'hazard', title: 'Stalls en lugar de forwardings', html: `<p>Ejecutá el ejemplo de forwarding EX/MEM con el modo "sin forwarding": en el lugar donde antes se encendían los cables del forwarding, ahora la hazard unit congela el pipeline. Vas a ver burbujas en EX durante dos ciclos hasta que el productor llegue a WB.</p>` },
      { block: 'forward', title: 'La unidad de forwarding queda inactiva', html: `<p>Con el modo sin forwarding, esta unidad no interviene: los muxes de operando siempre toman el valor del regfile. Comparalo con el modo normal, donde se ven los códigos 10 y 01 según la distancia.</p>` },
      { block: 'regfile', title: 'El bypass es lo único que sobrevive', html: `<p>En ambos modos, el banco de registros entrega el dato que se está escribiendo en el mismo ciclo. Sin forwarding es lo que ahorra la tercera burbuja de cada dependencia.</p>` },
    ],
    exampleId: 'forwarding-exmem',
    focus: 'forward',
    repo: [
      R('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v', 'Lo que desaparece en el modo sin forwarding'),
      R('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v', 'Detecta load-use; la versión sin forwarding detectaría toda dependencia'),
      X(HOST + 'tests/pipeline_test.s', 'pipeline_test.s', 'El programa de 61 instrucciones usado en estas mediciones'),
      X(BASE + 'project_4.srcs/constrs_1/imports/Downloads/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc', 'La restricción de reloj de 100 MHz contra la que se mide el timing'),
    ],
    next: null,
  },

  // ============================================================ TRACK: CONSTRUIR
  {
    id: 'build-1-subconjunto',
    title: 'Paso 1. Elegir el subconjunto de RV32I y leer la especificación',
    level: 'Básico',
    track: 'construir',
    minutes: 15,
    intro: 'Antes de escribir una línea de Verilog hay que decidir qué instrucciones va a ejecutar tu procesador y tener tu propia tabla de codificación, armada desde la especificación oficial. Todo lo demás (decodificador, ALU, ensamblador, desensamblador) sale de esa tabla.',
    sections: [
      {
        heading: 'Qué construir en este paso',
        html: `<p>Un documento (no código) con tres tablas: <b>la tabla de codificación</b> (opcode, funct3 y funct7 de cada instrucción), <b>la tabla de armado del inmediato</b> para cada formato y <b>la tabla de señales de control</b> para cada instrucción. Y una decisión sobre el alcance: qué subconjunto de RV32I vas a implementar y qué casos borde vas a tratar.</p>
<p>Un orden razonable para no empantanarse: empezá por un subconjunto chico que ya permita programas útiles, y ampliá. Por ejemplo: <code>addi, add, sub, and, or, lw, sw, beq, jal, lui</code> y una instrucción de parada. Con eso se puede escribir un bucle, llamar a una función y probar memoria. Después se suman el resto de las operaciones aritméticas, los desplazamientos, las comparaciones, los demás branches y los loads/stores parciales. Este repo implementa todo RV32I de usuario (excepto <code>fence</code>, que ejecuta como NOP) más <code>ecall</code>/<code>ebreak</code> como halt.</p>`,
      },
      {
        heading: 'Preguntas de diseño que hay que responder antes de codificar',
        html: `<ul>
<li>¿Qué hace tu procesador con un <code>lw</code> desalineado? ¿Lo ignora, lo alinea, lo parte en dos accesos o lo marca como error visible? (Este repo no lo soporta ni lo marca.)</li>
<li>¿De qué tamaño son las memorias de instrucciones y de datos, y qué limita ese tamaño en tu placa? (1 KB cada una, por cabida en LUTRAM y por tamaño de carga por UART.)</li>
<li>¿Qué pasa si el PC apunta fuera de la memoria de instrucciones? (Acá da la vuelta.)</li>
<li>¿Cómo vas a detener el procesador? ¿Con qué instrucción? (<code>ecall</code>/<code>ebreak</code>.)</li>
<li>¿Vas a soportar excepciones? Si no, ¿qué hacés con un opcode ilegal? (Se ejecuta como NOP.)</li>
<li>¿La arquitectura es Harvard (dos memorias) o Von Neumann? Con un pipeline, separar las memorias elimina el riesgo estructural principal. (Harvard.)</li>
</ul>`,
      },
      {
        heading: 'Cómo leer la especificación',
        html: `<p>Tené a mano <i>The RISC-V Instruction Set Manual, Volume I: Unprivileged ISA</i> (el capítulo de RV32I). Cuando una diapositiva, un apunte o un tutorial no coincide con la especificación, manda la especificación: las fuentes secundarias tienen errores frecuentes (instrucciones que son de RV64 mezcladas con las de RV32, diagramas de branch con <code>rs1</code>/<code>rs2</code> invertidos, una descripción de <code>jal</code> que dice que salta a la dirección contenida en <code>rd</code> en lugar de a <code>PC + inmediato</code>). Hacer la tabla vos mismo, mirando los diagramas de codificación, es la mejor vacuna.</p>
<p>Detalles que la especificación dice y que suelen pasarse por alto:</p>
<ul>
<li><code>add</code> y <code>sub</code> comparten opcode y <code>funct3</code>; las distingue el bit 30. Lo mismo <code>srl</code>/<code>sra</code> y <code>srli</code>/<code>srai</code>. No existe "subi".</li>
<li>Todos los inmediatos de tipo I se <b>extienden en signo</b>, incluso en <code>andi</code>, <code>ori</code> y <code>xori</code>: <code>andi x1, x2, -1</code> es un AND con 32 unos.</li>
<li><code>slt</code> compara con signo y <code>sltu</code> sin signo; en <code>sltiu</code> el inmediato se extiende con signo y <i>después</i> se compara como sin signo.</li>
<li>Los desplazamientos por registro usan solo los 5 bits bajos de <code>rs2</code>. En <code>slli/srli/srai</code>, <code>shamt</code> son los bits [24:20].</li>
<li>El destino de un branch es <code>PC + inmediato</code> donde PC es la dirección <b>del propio branch</b>, no la de la siguiente.</li>
<li><code>jalr</code>: el destino es <code>(rs1 + inmediato)</code> con el bit 0 forzado a 0, y si <code>rd == rs1</code> se usa el valor viejo de <code>rs1</code>.</li>
<li><code>lui</code>: <code>rd = inmediato &lt;&lt; 12</code>; los 12 bits bajos quedan en cero.</li>
<li>Los stores no tienen <code>rd</code>: el inmediato ocupa ese lugar.</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>La tabla de codificación y de control es ${gh('pipeline/2_decode/control.v', 'module:control', 'control.v')}: un <code>case(opcode)</code> con valores seguros por defecto, y dentro de OP e OP-IMM un <code>case</code> secundario para elegir la operación de la ALU (en OP, con <code>{funct7[5], funct3}</code>). Los códigos de la ALU están en ${gh('pipeline/3_execute/alu_ops.vh', null, 'alu_ops.vh')}. La tabla de inmediatos es ${gh('pipeline/2_decode/immgen.v', 'module:immgen', 'immgen.v')}. En esta web, cada ficha de instrucción (clic en una línea del editor) es esa tabla: muestra los campos coloreados, el inmediato extendido y la fila de control.</p>
<p>El libro propone un decodificador en dos niveles (control principal por opcode y control de ALU por funct3/funct7). Acá se eligió uno solo con un <code>case</code> anidado, que alcanza para este conjunto.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>En esta etapa no hay nada que sintetizar, pero ya se puede verificar la tabla: escribí un <b>codificador y un decodificador</b> (la mitad de un ensamblador y de un desensamblador) a partir de las tablas y comprobá que de ida y vuelta devuelven lo mismo. El repo hace exactamente eso en ${ext(HOST + 'tests/test_protocol.py', 'test_protocol.py')}: <code>test_disasm_roundtrip</code> ensambla el programa de prueba con el mini-ensamblador del modelo de referencia, desensambla cada palabra con el desensamblador del host y compara texto contra texto. Después contrastá unas palabras contra la salida de <code>objdump</code> de binutils (ver el paso del ensamblador).</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Armar la tabla copiando del libro sin mirar la especificación y propagar un error a todo el sistema.</li>
<li>Confundir <code>funct7[5]</code> (bit 30 de la instrucción) con el bit 5 de un inmediato en las instrucciones I de desplazamiento.</li>
<li>Olvidar decidir qué hace el procesador ante lo que no soporta. "Se ejecuta como NOP" es una decisión válida pero debe ser consciente (y documentada).</li>
</ul>`,
      },
    ],
    watch: [
      { block: 'control', title: 'Una fila de la tabla de control, en vivo', html: `<p>Cada vez que una instrucción pasa por ID, el bloque de control muestra qué banderas enciende. Esa fila es exactamente una fila de tu tabla de señales de control. Recorré el ejemplo y fijate cómo cambia entre un <code>lui</code>, un <code>addi</code> y un <code>auipc</code>.</p>` },
      { block: 'immgen', title: 'Una fila de la tabla de inmediatos', html: `<p>El generador de inmediatos muestra qué formato eligió y el valor resultante ya extendido. Probá escribir instrucciones de distintos formatos en el editor y compará los bits de la ficha con la tabla que armaste.</p>` },
    ],
    exampleId: 'lui-auipc',
    focus: 'control',
    repo: [
      R('pipeline/2_decode/control.v', 'module:control', 'control.v', 'La tabla de control del repo'),
      R('pipeline/2_decode/immgen.v', 'module:immgen', 'immgen.v', 'La tabla de inmediatos del repo'),
      R('pipeline/3_execute/alu_ops.vh', null, 'alu_ops.vh', 'Los códigos de operación de la ALU'),
      X(HOST + 'tests/test_protocol.py', 'test_protocol.py', 'test_disasm_roundtrip: codificación y decodificación de ida y vuelta'),
    ],
    next: 'build-2-monociclo',
  },
  {
    id: 'build-2-monociclo',
    title: 'Paso 2. Un monociclo primero: datapath mínimo, control e immgen',
    level: 'Básico',
    track: 'construir',
    minutes: 18,
    intro: 'Construí primero un procesador monociclo: una instrucción por ciclo, sin pipeline. Es mucho más fácil de razonar y depurar, y te deja un modelo de referencia en hardware contra el cual comparar después tu versión segmentada.',
    sections: [
      {
        heading: 'Por qué empezar por un monociclo',
        html: `<p>Un monociclo ejecuta cada instrucción completa en un ciclo largo. No hay hazards, ni forwarding, ni stalls: lo único que puede estar mal es el datapath y el control. Eso lo convierte en un excelente primer paso, por tres razones: aísla los errores (si el monociclo anda y el pipeline no, el bug está en la segmentación), forma tu biblioteca de módulos probados (ALU, regfile, immgen, control, memorias, branch unit) y te da un segundo "modelo de referencia" para el pipeline. La pregunta del diseño es esta: ¿te conviene armar primero un monociclo simple, o ir directo al pipeline con un simulador en software como única referencia? Hacer las dos cosas es lo más seguro.</p>`,
      },
      {
        heading: 'Qué construir',
        html: `<p>Los módulos mínimos, en el orden en que conviene hacerlos y probarlos:</p>
<ol>
<li><b>ALU</b>: combinacional, con una entrada de operación. Operaciones de este repo: ADD, SUB, AND, OR, XOR, SLT, SLTU, SLL, SRL, SRA (más NOR sin uso). Calculá siempre las comparaciones <code>lt</code> y <code>ltu</code> y la bandera <code>zero</code>, para reutilizarlas en los branches.</li>
<li><b>Banco de registros</b>: 32 × 32 bits, dos puertos de lectura asincrónicos y uno de escritura síncrono, con <code>x0</code> fijo en 0.</li>
<li><b>Generador de inmediatos</b>: un mux de 5 vías con la tabla del paso 1.</li>
<li><b>Unidad de control</b>: el decodificador de la tabla de control.</li>
<li><b>Memorias</b> de instrucciones y de datos, con la lógica de byte-enables y de extensión en la de datos.</li>
<li><b>Unidad de branch</b>: elige la condición según <code>funct3</code> y calcula <code>PC + imm</code>.</li>
<li>El <b>PC</b> con su mux (<code>PC+4</code>, destino de branch o salto) y el mux de escritura (resultado de la ALU, dato de memoria, <code>PC+4</code> o inmediato).</li>
</ol>`,
      },
      {
        heading: 'Preguntas de diseño antes de codificar',
        html: `<ul>
<li>¿Cuántas operaciones distintas necesita tu ALU? Listalas. ¿Podés resolver <code>lui</code> sin agregar una operación nueva? (Este repo lo hace con un cuarto valor del mux de resultado, <code>wb_sel = 11</code>, que toma directamente el inmediato.)</li>
<li>¿Dónde se calcula <code>PC + 4</code> para <code>jal</code> y <code>jalr</code>, y cómo llega a la escritura del banco de registros? (Otra entrada del mux de resultado.)</li>
<li>¿Dónde resolvés la selección de byte y la extensión en los loads?</li>
<li>¿Cómo calculás el destino de <code>jalr</code>? (Se puede reusar la ALU: <code>rs1 + imm</code> con el bit 0 en cero.)</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>El repo conserva un monociclo completo, ${gh('riscv_core.v', 'module:riscv_core', 'riscv_core.v')} (de una etapa anterior del trabajo, hoy sin uso, pero útil para ver la idea en 130 líneas). Usa los mismos módulos que el pipeline: <code>control</code>, <code>immgen</code>, <code>regfile</code>, <code>alu_tp1</code>, <code>branch_unit</code>, <code>imem</code> y <code>dmem</code>. Lo interesante es lo que <i>no</i> puede reutilizar tal cual: el regfile del pipeline tiene un parámetro <code>BYPASS</code> que en el monociclo vale 0, porque ahí formaría un lazo combinacional (el dato que se escribe depende del que se lee). Y el PC del monociclo se actualiza con un reset asincrónico, mientras que en el pipeline todo es reset sincrónico.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Probá cada módulo <b>por separado</b> con un testbench, antes de integrar:</p>
<ul>
<li><b>ALU</b>: una tabla de vectores (a, b, operación, resultado esperado), con positivos, negativos y límites (<code>0x80000000</code>, <code>0x7FFFFFFF</code>, desplazamientos de 0, 31 y mayores a 31).</li>
<li><b>immgen</b>: para cada formato, una instrucción conocida; mejor aún, instrucciones aleatorias comparadas contra el resultado de un script que extrae el inmediato por otra vía.</li>
<li><b>Regfile</b>: escribir en todos los registros y leerlos; escribir en x0 y comprobar que sigue en 0; leer y escribir el mismo registro en el mismo ciclo.</li>
<li><b>Control</b>: para cada opcode, comprobar la fila de la tabla.</li>
</ul>
<p>Después, programas cortos en el monociclo (los de la web se pueden pegar tal cual: el simulador de esta página ejecuta los mismos programas), comparando el estado final de registros y memoria contra el modelo de referencia. Un testbench <b>autoverificable</b> compara cada resultado y reporta solo las diferencias; así podés correr cientos de casos después de cada cambio, en vez de mirar formas de onda.</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Olvidar la excepción de <code>x0</code>: tiene que valer 0 aunque se le escriba, y hay que implementarlo en el regfile (en la lectura y en la escritura).</li>
<li>Comparar con signo con operandos declarados sin signo en Verilog. Los operandos de la ALU de este repo están declarados <code>signed</code>, y <code>&gt;&gt;&gt;</code> es el desplazamiento aritmético.</li>
<li>Un <code>always</code> combinacional que no asigna todas las salidas en todos los casos infiere un latch. Poné valores por defecto al principio, como hace <code>control.v</code>.</li>
<li>Tomar el destino de un branch como <code>PC + 4 + imm</code>. Es <code>PC + imm</code>.</li>
</ul>`,
      },
    ],
    watch: [
      { block: 'alu', title: 'Una ALU que hace tres trabajos', html: `<p>En los ejemplos, fijate cómo la misma ALU suma enteros, calcula direcciones de loads y stores y compara para los branches. Un diseño propio puede separar estos trabajos con más hardware; compartirlos ahorra área pero obliga a que el control elija bien la operación.</p>` },
      { block: 'regfile', title: 'Dos lecturas y una escritura', html: `<p>El regfile lee dos registros a la vez y escribe uno. Cuando un ejemplo hace que la escritura y la lectura coincidan, el bypass interno entrega el dato nuevo. En un monociclo ese caso no existe, y por eso el parámetro vale 0.</p>` },
      { block: 'branch', title: 'La unidad de branch', html: `<p>Observá qué bandera de la ALU mira branch_unit para cada tipo de branch. En el monociclo es la misma unidad, solo que la decisión llega al PC en el mismo ciclo.</p>` },
    ],
    exampleId: 'datapath-etapas',
    focus: 'alu',
    repo: [
      R('riscv_core.v', 'module:riscv_core', 'riscv_core.v', 'Un monociclo completo con los mismos módulos que el pipeline (sin uso en el proyecto)'),
      R('pipeline/3_execute/alu.v', 'module:alu_tp1', 'alu.v', 'La ALU de referencia'),
      R('pipeline/2_decode/regfile.v', 'module:regfile', 'regfile.v', 'Regfile con el parámetro BYPASS'),
      R('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit.v', 'Condición y destino de los branches'),
      X(TB + 'tb_riscv_core.v', 'tb_riscv_core.v', 'El testbench del monociclo (resto de una etapa anterior)'),
    ],
    next: 'build-3-segmentar',
  },
  {
    id: 'build-3-segmentar',
    title: 'Paso 3. Segmentar: registros de pipeline y convenciones rst/en/flush/stall',
    level: 'Intermedio',
    track: 'construir',
    minutes: 18,
    intro: 'Con el monociclo funcionando, el siguiente paso es cortar el datapath en cinco etapas con registros entre ellas. No agregues todavía forwarding ni stalls: primero tiene que andar un pipeline que, con programas separados por NOPs, dé los mismos resultados que el monociclo.',
    sections: [
      {
        heading: 'Qué construir en este paso',
        html: `<p>Los cuatro registros de pipeline (IF/ID, ID/EX, EX/MEM, MEM/WB), con todo el control y los datos que cada instrucción necesita en las etapas siguientes, y las convenciones comunes de reset, habilitación, flush y stall. El objetivo de este paso es un pipeline <b>sin protección contra hazards</b>: funciona si el programa deja suficiente distancia entre instrucciones dependientes (el programador o el compilador inserta NOPs: <code>addi x0, x0, 0</code>). Es una excelente primera prueba, porque separa los bugs de segmentación de los bugs de hazards. Cuántos NOPs hacen falta depende del regfile: con el bypass interno (escritura visible en el mismo ciclo) alcanza con 2 NOPs entre una instrucción y la que usa su resultado; sin él, 3.</p>`,
      },
      {
        heading: 'Preguntas de diseño antes de codificar',
        html: `<ul>
<li>¿Qué viaja en cada registro, como mínimo? (Completá una tabla: IF/ID, ID/EX, EX/MEM, MEM/WB, con datos y control.) Cuando diseñes forwarding, saltos y loads parciales vas a descubrir qué más necesita viajar (por ejemplo, los <i>números</i> de <code>rs1</code>/<code>rs2</code>, no solo sus valores). Esos campos son exactamente lo que la debug unit va a tener que mandar a la PC.</li>
<li>¿Qué valor tienen los registros al arrancar y después de un reset? ¿Qué "instrucción" representa ese valor? (Una burbuja: control en cero.)</li>
<li>¿Cómo vas a identificar cada instrucción en los registros para que una interfaz pueda mostrar "en EX está la instrucción de la dirección 0x14"? (Hay que llevar el PC.)</li>
<li>¿Cómo convertís una instrucción en burbuja: poniendo a cero las señales de control, o con un bit de "válida" por etapa? ¿Qué te sirve más para saber, desde la debug unit, cuándo el pipeline quedó vacío?</li>
<li>¿Escribís el regfile en el flanco opuesto del reloj o hacés un bypass interno? (Pensá en qué le pasa al período disponible para cada mitad.)</li>
<li>¿Cómo vas a pausar el procesador sin tocar el reloj? Definí desde ahora una entrada <code>en</code> en todos los registros.</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>Los cuatro registros están juntos en ${gh('pipeline/regs/pipe_reg.v', 'module:if_id_reg', 'pipe_reg.v')} a propósito: comparten convenciones, y verlos en un archivo ayuda a ver qué viaja por cada frontera. Las convenciones, iguales en los cuatro:</p>
<ul>
<li><code>rst</code>: reset sincrónico que vacía la etapa.</li>
<li><code>en</code>: habilitación global; con 0 el registro mantiene su valor e ignora <code>flush</code> y <code>stall</code>.</li>
<li><code>flush</code> (solo IF/ID e ID/EX): reemplaza la instrucción por una burbuja.</li>
<li><code>stall</code> (solo IF/ID): mantiene el valor. El stall hacia ID/EX se hace con un flush forzado.</li>
</ul>
<p>El PC no es un módulo: es un <code>reg</code> dentro de ${gh('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v')}, que lo necesita junto con <code>stall</code>, <code>redirect</code> y <code>stop_fetch</code>. Las etapas no son módulos: son bloques de ese mismo archivo, alrededor de las instancias de <code>control</code>, <code>immgen</code>, <code>regfile</code>, <code>alu_tp1</code>, <code>branch_unit</code> y <code>dmem</code>.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Tres niveles, de menor a mayor:</p>
<ol>
<li><b>Una instrucción sola</b>, rodeada de NOPs. Seguila ciclo a ciclo en las formas de onda (o en esta web): tiene que aparecer en IF, ID, EX, MEM y WB en ciclos consecutivos.</li>
<li><b>Programas sin dependencias</b> (o con NOPs entre las dependientes), comparados contra el modelo de referencia o contra tu monociclo: el estado final debe ser idéntico.</li>
<li>Un <b>pipeline de N instrucciones sin stalls</b> lleva <code>N + 4</code> ciclos. Esa es una verificación barata de que no se está perdiendo ni ganando tiempo por error: si tu programa de 20 instrucciones tarda 24 ciclos, bien.</li>
</ol>
<p>El testbench del pipeline del repo, ${ext(TB + 'tb_pipeline.v', 'tb_pipeline.v')}, hace además dos verificaciones que conviene copiar: que <b>nada después del ebreak</b> se ejecutó (a través del archivo de valores esperados) y que la <b>pausa</b> (<code>i_enable = 0</code>) congela el pipeline: en el ciclo 20 baja <code>en</code>, espera 5 ciclos y comprueba que el PC no se movió.</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Escribir en WB usando el <code>rd</code> de IF/ID (en lugar del que viajó con la instrucción).</li>
<li>Olvidar propagar una señal de control hasta la etapa que la necesita (por ejemplo, <code>funct3</code> hasta MEM para el tamaño del acceso).</li>
<li>Generar el PC de la instrucción en el momento equivocado (por ejemplo, <code>PC+4</code> calculado con el PC que ya avanzó). Calculalo en ID con el PC que viaja en IF/ID.</li>
<li>Que el reset vacíe solo parte del pipeline: una instrucción residual puede escribir un registro después del reset.</li>
<li>Dejar el flush o el stall activos mientras el procesador está pausado: el estado cambia aunque nada avance.</li>
</ul>`,
      },
    ],
    watch: [
      { block: 'ifid', title: 'Un registro por frontera', html: `<p>Mirá cómo cada instrucción pasa de registro en registro, una etapa por ciclo. Si tu pipeline propio hace lo mismo con una instrucción rodeada de NOPs, la segmentación está bien.</p>` },
      { block: 'idex', title: 'El registro con más campos', html: `<p>ID/EX lleva casi todo: control, datos, números de registro e inmediato. Abrí su interior (clic dos veces) para ver el detalle de cada campo y por qué viaja.</p>` },
      { block: 'memwb', title: 'El último registro', html: `<p>MEM/WB solo guarda el resultado final, el destino y las banderas. Compará con ID/EX para ver cómo se va "consumiendo" el control a medida que la instrucción avanza.</p>` },
    ],
    exampleId: 'datapath-etapas',
    focus: 'ifid',
    repo: [
      R('pipeline/regs/pipe_reg.v', 'module:id_ex_reg', 'pipe_reg.v', 'Los cuatro registros con rst, en, flush y stall'),
      R('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v', 'Las cinco etapas en un solo módulo'),
      R('pipeline/regs/README.md', null, 'regs/README.md', 'Qué lleva cada registro y por qué'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'Testbench del pipeline: estado final, nada tras el ebreak y la prueba de pausa'),
    ],
    next: 'build-4-hazards-datos',
  },
  {
    id: 'build-4-hazards-datos',
    title: 'Paso 4. Hazards de datos: forwarding y hazard unit',
    level: 'Intermedio',
    track: 'construir',
    minutes: 20,
    intro: 'Con la segmentación andando, toca proteger al pipeline de las dependencias RAW. Se construye en dos partes: una unidad de forwarding que adelanta resultados a la ALU y una hazard unit que frena cuando adelantar no alcanza.',
    sections: [
      {
        heading: 'Qué construir',
        html: `<p>Tres piezas, en este orden: (1) el <b>bypass interno del regfile</b> (escritura visible en la lectura del mismo ciclo, distancia 3); (2) la <b>unidad de forwarding</b> con sus dos muxes de operando (distancias 1 y 2), con la prioridad EX/MEM sobre MEM/WB y las condiciones <code>reg_write</code> y <code>rd != 0</code>; (3) la <b>hazard unit</b> para load-use. Sin esto, tu pipeline solo anda con NOPs entre instrucciones dependientes.</p>`,
      },
      {
        heading: 'Preguntas de diseño antes de codificar',
        html: `<ul>
<li>Dibujá en papel la unidad de forwarding y la de detección de riesgos como bloques separados. ¿Qué entradas necesita cada una y de qué registros de pipeline salen? (Los <i>números</i> <code>rs1</code>/<code>rs2</code> tienen que viajar hasta EX.)</li>
<li>¿Qué valor adelantás desde MEM: solo el resultado de la ALU, o el valor ya seleccionado (incluyendo el dato de un load, PC+4 o el inmediato)? Esta decisión cambia si el load-use necesita stall y qué tan largo es tu camino crítico.</li>
<li>¿Cómo forwardeás el dato de un store, que no pasa por la ALU?</li>
<li>¿Qué pasa si un stall (load-use) y un flush (salto) coinciden? ¿Cuál tiene prioridad?</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>${gh('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v')} y ${gh('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v')} son combinacionales y chicos. Se adelanta <code>mem_result</code> (post-mux), el bypass es el parámetro <code>BYPASS</code> del regfile, y el stall se implementa congelando PC e IF/ID y forzando una burbuja en ID/EX. Todo el razonamiento está en las lecciones de forwarding y de load-use de la guía "Entender este chip", incluido el defecto de comparar campos crudos (stall falso) y la observación sobre si el stall hace falta con una dmem asíncrona.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Programas por categoría, cada uno con resultado esperado: dependencias a distancia 1, 2, 3 y 4; en <code>rs1</code>, en <code>rs2</code> y en el dato de un store; el mismo registro como fuente y destino; dos productores seguidos del mismo registro (debe ganar el más reciente); escrituras a <code>x0</code> seguidas de un uso (nunca debe haber forwarding); y load seguido del uso inmediato en <code>rs1</code>, en <code>rs2</code> y como dato de store, además de un load con una instrucción independiente en el medio (sin stall). Los programas listos están en la sección de pruebas de esta guía. Comprobá también la cuenta de ciclos: <code>4 + N + stalls</code>.</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Olvidar <code>rd != 0</code>: el valor "escrito" en x0 se cuela en la instrucción siguiente.</li>
<li>Olvidar <code>reg_write</code>: un store o un branch con el mismo número en <code>rd</code> (los bits del inmediato) generan forwardings falsos que sí dañan.</li>
<li>Probar solo el operando A: un bug del mux B no se ve.</li>
<li>Dar prioridad a MEM/WB sobre EX/MEM cuando ambos coinciden.</li>
<li>Comparar campos crudos en la hazard unit sin saber que cuesta ciclos (stall falso).</li>
</ul>`,
      },
      {
        heading: 'La observación: ¿hace falta el stall de load-use en ESTE diseño?',
        html: `<p>El libro presenta el stall de load-use como inevitable: el dato del load existe al final de MEM y la dependiente lo necesita al principio de EX. Eso es cierto cuando el valor sale tarde dentro del ciclo. En este diseño no lo es: la <b>dmem es de lectura asíncrona</b> y su salida entra al mux <code>wb_sel</code>, de ahí a <code>mem_result</code>, que es justamente lo que <code>forward_unit</code> adelanta con el código <code>10</code>. Si el load estuviera en MEM y su dependiente en EX en el mismo ciclo, la ALU recibiría el dato leído de dmem en ese mismo ciclo. El stall, entonces, es <b>funcionalmente redundante</b>: sin él los resultados siguen siendo correctos (en un experimento con el código del simulador de esta web, 300 programas aleatorios con load-use en rs1, rs2 y dato de store coincidieron con el modelo de referencia) y se ahorra un ciclo por cada load-use.</p>
<p>¿Por qué entonces lo tiene el repo? Porque es el diseño estándar y el único correcto si la dmem fuera una BRAM de lectura síncrona, si el mux de resultado estuviera en WB, o si se quisiera cortar el camino que sigue. El costo de sacarlo es de timing: la cadena <b>dmem → mux de resultado → mux de forwarding → ALU</b> (y después branch y flush) pasaría a ser un camino que se usa de verdad. Con el stall, esa cadena existe en el netlist (Vivado la mide, y es la que el README del top señala como crítica) pero nunca se ejercita funcionalmente, porque el stall impide que un load en MEM coincida con su dependiente en EX. Sin el stall, ya no hay forma de decir que es un camino falso: queda fijado como límite real de la frecuencia. Es el trade-off clásico: un ciclo menos de CPI contra un camino combinacional que hay que cumplir en serio. Esta variante no está en el RTL: es una opción de diseño para evaluar con el reporte de timing en la mano.</p>`,
      },
      {
        heading: 'Cómo se ve en el repo, paso a paso',
        html: `<p>Leé primero ${gh('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v')}: son dos bloques de <code>if</code>, el de EX/MEM (prioridad) y el de MEM/WB, ambos con <code>reg_write</code> y <code>rd != 0</code>. Después mirá cómo se aplican los códigos en ${gh('pipeline/riscv_pipeline.v', 'fwd_a_val', 'riscv_pipeline.v')}: un <code>case</code> por operando con <code>mem_result</code>, <code>wb_result</code> o el valor del regfile. Para el stall, ${gh('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v')} produce la señal y es el módulo principal el que la usa en tres lugares: <code>pc_en</code>, la entrada <code>stall</code> de IF/ID y <code>flush_id_ex</code>. Y el bypass del regfile está en las asignaciones de <code>rdata1</code>/<code>rdata2</code> de ${gh('pipeline/2_decode/regfile.v', 'rdata1', 'regfile.v')}.</p>
<p>Un detalle de diseño que conviene copiar: la comparación de la unidad de forwarding usa los números de registro que <b>viajan en ID/EX</b> (<code>ex_rs1</code>, <code>ex_rs2</code>), no los de la instrucción que está en ID. Si usaras los de ID, estarías comparando contra la instrucción equivocada.</p>`,
      },
      {
        heading: 'Cómo probarlo, con los tests del repo',
        html: `<p>El programa ${ext(HOST + 'tests/pipeline_test.s', 'pipeline_test.s')} ejercita todas las distancias (por ejemplo <code>add x3,x1,x2</code> seguido de <code>sub x4,x3,x1</code>, y el único load-use real, <code>lw x5</code> seguido de <code>add x6,x5,x5</code>). El modelo de referencia genera el estado final esperado y ${ext(TB + 'tb_pipeline.v', 'tb_pipeline.v')} compara los 32 registros y las primeras 16 palabras de dmem; un forwarding mal hecho se nota como un registro con un valor viejo. Agregá programas propios por categoría (los de la sección de pruebas de esta guía), con dos controles de rendimiento que el estado final no ve: que <code>stalls</code> sea exactamente la cantidad de load-use reales y que los ciclos totales coincidan con la fórmula <code>4 + N + stalls + 2·saltos</code>. Un stall falso o un stall que falta se detecta recién ahí.</p>`,
      },
    ],
    watch: [
      { block: 'forward', title: 'Tu unidad de forwarding, de referencia', html: `<p>Ejecutá el ejemplo de MEM/WB y bypass y comparás, ciclo a ciclo, qué código elige la unidad para cada operando. Tu diseño debería elegir lo mismo con el mismo programa.</p>` },
      { block: 'hazard', title: 'Tu hazard unit, de referencia', html: `<p>En el load-use se ve el único ciclo en que se enciende el stall y cómo se propaga a PC, IF/ID e ID/EX.</p>` },
    ],
    exampleId: 'forwarding-memwb-bypass',
    focus: 'forward',
    repo: [
      R('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v', 'Forwarding con prioridad'),
      R('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v', 'Detección de load-use'),
      R('pipeline/2_decode/regfile.v', 'module:regfile', 'regfile.v', 'Bypass interno'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'Comparación de estado final contra el modelo de referencia'),
    ],
    next: 'build-5-hazards-control',
  },
  {
    id: 'build-5-hazards-control',
    title: 'Paso 5. Hazards de control: flush',
    level: 'Intermedio',
    track: 'construir',
    minutes: 16,
    intro: 'Decidí en qué etapa resolvés los saltos, construí el camino de redirección del PC y la lógica que convierte en burbujas las instrucciones del camino equivocado.',
    sections: [
      {
        heading: 'Qué construir',
        html: `<p>(1) La <b>unidad de branch</b>: condición según <code>funct3</code> y destino; (2) el <b>mux del PC</b> con la señal de redirección; (3) el <b>flush</b> de los registros más jóvenes que el salto; (4) la política de qué pasa con JAL y JALR.</p>`,
      },
      {
        heading: 'Preguntas de diseño antes de codificar',
        html: `<ul>
<li>¿En qué etapa resolvés branches? Justificalo con la tabla de costos: en EX se descartan 2 instrucciones y no hay hardware extra; en ID se descarta 1 pero necesitás comparador, sumador y forwarding hacia ID, con stalls nuevos.</li>
<li>¿Y JAL? ¿Y JALR? No tienen por qué resolverse en la misma etapa que los branches: el destino de JAL no depende de registros; el de JALR sí.</li>
<li>¿Cómo convertís una instrucción en burbuja: control en cero o bit de válida?</li>
<li>¿Qué pasa con un HALT buscado de forma especulativa después de un branch tomado? No puede detener el procesador.</li>
<li>¿Agregás predicción? (Los delay slots quedan descartados: no son RISC-V.)</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>Todo en EX: ${gh('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit.v')} decide y suma, ${gh('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v')} propaga <code>redirect</code> a IF/ID e ID/EX, y el mux del PC está en ${gh('pipeline/riscv_pipeline.v', 'pc_next', 'riscv_pipeline.v')}. Predicción implícita "no tomado". Costo: 2 ciclos por salto tomado, 0 por no tomado.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Branch tomado y no tomado de los seis tipos (con y sin signo), <code>jal</code> con y sin guardar el retorno, <code>jalr</code> con <code>rd == rs1</code>, y siempre las dos preguntas: ¿se ejecutó algo del camino equivocado?, ¿se descartó algo que sí debía ejecutarse? Probá también un <code>ebreak</code> justo después de un branch tomado, y un branch cuyo operando viene de la instrucción inmediatamente anterior (forwarding hacia el comparador). Cuenta de ciclos: <code>4 + N + stalls + 2 × saltos tomados</code>.</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Destino calculado con <code>PC + 4</code> en lugar de <code>PC</code> del branch.</li>
<li>Flushear solo una de las dos etapas.</li>
<li>Que el flush no limpie el control (y la instrucción equivocada escriba un registro o memoria).</li>
<li>Olvidar el bit 0 forzado a cero en JALR.</li>
</ul>`,
      },
      {
        heading: 'La tabla de costos para justificar tu decisión',
        html: `<p>Con predicción "no tomado", la penalidad por salto tomado es la cantidad de instrucciones que entraron antes de conocer el resultado. Resolver en EX descarta 2 y no cuesta hardware; resolver en ID descarta 1 pero exige un comparador y un sumador de destino en ID, forwarding hacia ID (el branch puede depender de la instrucción anterior) y un stall extra cuando el operando todavía no existe, por ejemplo si viene de un load. La decisión se justifica con datos: cuántos branches tienen tus programas de prueba y cuántos se toman. En el programa del repo hay 9 saltos tomados sobre 61 instrucciones: 18 de los 23 ciclos extra de ese programa son burbujas de salto. Si tus programas son loops cerrados, la penalidad pesa más y vale la pena evaluar resolver antes o agregar predicción estática ("hacia atrás tomado").</p>
<p>Otra decisión: tratar igual a branches, JAL y JALR o no. El destino de JAL no depende de registros y podría resolverse en ID; el de JALR depende de <code>rs1</code>, así que combina un riesgo de control con uno de datos y necesita forwarding. Este repo los resuelve todos en EX, con el mismo flush.</p>`,
      },
      {
        heading: 'Cómo se ve en el repo, paso a paso',
        html: `<p>El orden de lectura recomendado: ${gh('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit.v')} (una tabla de condiciones por <code>funct3</code> y un sumador), después en ${gh('pipeline/riscv_pipeline.v', 'branch_taken', 'riscv_pipeline.v')} cómo se combinan <code>ex_branch</code> con la condición, cómo se arma <code>redirect</code> y el destino con el caso especial de JALR (<code>alu_out &amp; ~1</code>), y por último ${gh('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v')}. Fijate que la ALU calcula siempre <code>lt</code> y <code>ltu</code>: eso evita agregar operaciones para BLTU/BGEU. Y que control.v pone <code>alu_op = SUB</code> o <code>SLT</code> para los branches, aunque la decisión salga de las banderas y no del resultado.</p>
<p>Dos interacciones que el repo resuelve y que vas a tener que resolver: el halt (<code>stop_fetch</code>) usa los mismos puertos de flush, y el flush no necesita limpiar EX/MEM ni MEM/WB porque las burbujas ya llegan limpias desde ID/EX.</p>`,
      },
      {
        heading: 'Cómo probarlo y errores comunes',
        html: `<p>Armá programas que respondan a las dos preguntas: ¿se ejecutó algo del camino equivocado? (los registros de las instrucciones descartadas deben quedar en 0) y ¿se descartó algo que sí debía ejecutarse? (los de las instrucciones tras un branch no tomado deben tener su valor). El programa de la categoría "Saltos" de esta guía cubre beq/bne/blt/bltu, jal con y sin retorno y jalr con <code>rd == rs1</code>; el programa del repo suma un loop y un salto hacia adelante. Probá además un branch cuyo operando viene del forwarding, un salto a continuación de un load-use y un <code>ebreak</code> justo después de un branch tomado (no debe detener nada): tb_pipeline lo cubre indirectamente al comprobar que lo posterior al ebreak no se ejecutó. Contá ciclos con la fórmula.</p>
<p>Errores comunes: usar <code>PC + 4</code> en vez de <code>PC</code> para el destino; flushear una sola etapa; olvidar que JALR usa el valor viejo de <code>rs1</code> cuando <code>rd == rs1</code>; que el flush no ponga en cero <code>mem_write</code> o <code>reg_write</code>; y un halt especulativo.</p>`,
      },
    ],
    watch: [
      { block: 'flush', title: 'Las dos burbujas', html: `<p>En el ejemplo de branches se ve cómo, al tomarse el salto, las dos instrucciones siguientes se convierten en burbujas. Tu implementación debe dejar exactamente esos huecos en el diagrama de ciclos.</p>` },
      { block: 'branch', title: 'Decisión y destino', html: `<p>Compará las banderas de la ALU y el destino calculado con los de tu branch unit para el mismo programa.</p>` },
    ],
    exampleId: 'branch-flush',
    focus: 'branch',
    repo: [
      R('pipeline/3_execute/branch_unit.v', 'module:branch_unit', 'branch_unit.v', 'Condiciones y destino'),
      R('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v', 'Propagación del redirect'),
      R('pipeline/riscv_pipeline.v', 'redirect_target', 'redirect_target', 'Destino de branch/JAL/JALR'),
    ],
    next: 'build-6-memorias-fpga',
  },
  {
    id: 'build-6-memorias-fpga',
    title: 'Paso 6. Memorias en FPGA: BRAM, LUTRAM, lectura asíncrona vs síncrona e imem escribible',
    level: 'Intermedio',
    track: 'construir',
    minutes: 18,
    intro: 'Las memorias reales de una FPGA no responden en el mismo ciclo como las del libro. Elegir el recurso (flip-flops, LUTRAM o BRAM) condiciona el diseño de IF y MEM.',
    sections: [
      {
        heading: 'Tres formas de almacenar datos',
        html: `<ul>
<li><b>Flip-flops</b>: lectura inmediata, pocos bits. Para los registros de pipeline y el PC.</li>
<li><b>RAM distribuida (LUTRAM)</b>: lectura asíncrona, cientos a miles de bits. Para el banco de registros y memorias chicas.</li>
<li><b>Block RAM (BRAM)</b>: lectura <b>síncrona</b> (la dirección se registra en el flanco y el dato aparece un ciclo después, otro más con el registro de salida), bloques de 18/36 Kb. Para memorias grandes.</li>
</ul>
<p>Se obtienen por <b>IP core</b> (Block Memory Generator, con archivo de inicialización .coe) o por <b>inferencia</b> (escribir el arreglo en HDL según las plantillas de Vivado). La inferencia es más portable y simple de simular.</p>`,
      },
      {
        heading: 'Qué construir y preguntas de diseño',
        html: `<p>Una memoria de instrucciones que el procesador lee y que la debug unit escribe, y una de datos que el procesador lee y escribe y que la debug unit lee. Decidí: ¿cómo encaja una lectura síncrona en IF? ¿La BRAM puede hacer de parte del registro IF/ID? ¿Qué pasa cuando hay que congelar IF por un stall? ¿Y en MEM con los loads, llega el dato a tiempo a MEM/WB? ¿Qué tipo de puerto necesita cada memoria (single, simple dual, true dual)? ¿Dónde generás la máscara de bytes y el desplazamiento de carril? ¿Un tercer puerto de lectura del regfile para debug, o reusás uno mientras el CPU está detenido? Además: un reset no borra una BRAM, y borrar implica escribir cero en cada dirección.</p>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>Dos memorias de 1 KB de <b>lectura combinacional</b> (se infieren como RAM distribuida), así que IF y MEM no cambian respecto del libro: ${gh('pipeline/1_fetch/imem.v', 'module:imem', 'imem.v')} y ${gh('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v')}. La imem tiene un <b>puerto de escritura de un byte</b> (el orden little-endian de un .bin) no gateado por el enable, porque se carga con el CPU en reset; arranca llena de NOPs. La dmem se parte en cuatro carriles de 8 bits para que la herramienta no use flip-flops. El regfile tiene un puerto de lectura de debug aparte. Es una elección válida porque son chicas; con memorias mayores habría que pasar a BRAM y rediseñar IF/MEM.</p>`,
      },
      {
        heading: 'Cómo probarlo y trampas',
        html: `<p>Un testbench por memoria: escribir y leer cada byte, cada media palabra y cada palabra (incluyendo que un store parcial no pise el resto); cargar la imem byte a byte y comparar contra un modelo; verificar el relleno con NOP. La trampa más común es probar solo las palabras completas: ver el hallazgo de <code>sb</code> en el byte 3 en la lección de memoria de datos. Otra: el orden de bytes (el byte <i>k</i> del programa va en la dirección <i>k</i>).</p>`,
      },
      {
        heading: 'Lectura asíncrona o síncrona: qué cambia en IF y en MEM',
        html: `<p>Con lectura <b>asíncrona</b> (la de este repo), IF presenta el PC y recibe la instrucción en el mismo ciclo; el registro IF/ID captura lo que sale. Con una BRAM de lectura <b>síncrona</b>, la dirección se registra en el flanco y el dato aparece un ciclo después, así que hay que presentar la dirección un ciclo antes. La solución típica es usar el <b>puerto de la BRAM como parte del registro IF/ID</b>: la dirección es <code>pc_next</code> (el PC del próximo ciclo), la salida de la BRAM es directamente <code>id_inst</code>, y el PC "demorado" que viaja en IF/ID se obtiene registrando el PC un ciclo. Eso tiene dos consecuencias a resolver: ante un stall hay que congelar la BRAM (su propia habilitación) o recircular la instrucción, y ante un flush hay que anular la salida con un bit de "válida" en vez de cargar un NOP en el registro.</p>
<p>En MEM, el dato del load llega un ciclo después de presentar la dirección. O se agrega una etapa de memoria (el load-use pasa a costar 2 ciclos), o la dirección se presenta antes, calculándola un ciclo antes o con un sumador dedicado. Y una BRAM tiene modos <i>read-first</i> y <i>write-first</i> para el caso de leer y escribir la misma dirección en el mismo ciclo: tu pipeline decide cuál necesita (un load justo después de un store a la misma palabra debe ver el dato nuevo).</p>`,
      },
      {
        heading: 'Cómo se ve en el repo',
        html: `<p>${gh('pipeline/1_fetch/imem.v', 'module:imem', 'imem.v')} declara <code>reg [31:0] mem [0:DEPTH-1]</code>, la inicializa con NOPs en un <code>initial</code>, y tiene un puerto de escritura de un byte con un <code>case</code> sobre <code>wr_addr[1:0]</code>; la lectura es un simple <code>assign instr = mem[addr[ADDR_W-1:2]]</code>. La carga la hace la debug unit mientras el CPU está en reset, por eso el puerto no depende del enable. ${gh('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v')} usa cuatro arreglos de bytes con una dirección de palabra y el comentario del propio archivo explica el motivo: un arreglo plano con escrituras multibyte se sintetiza como unos 8000 flip-flops. El banco de registros (${gh('pipeline/2_decode/regfile.v', 'module:regfile', 'regfile.v')}) también es de lectura asíncrona, con un puerto adicional de lectura <code>dbg_addr</code> para la debug unit, así que el volcado no compite con el pipeline.</p>
<p>Observá también qué no hace: no hay chequeo de rango (el PC y las direcciones de datos dan la vuelta) ni reset de contenido (la dmem conserva los valores del programa anterior hasta que se escriban).</p>`,
      },
      {
        heading: 'Cómo probarlo y errores comunes',
        html: `<p>Un testbench por memoria: escribir y leer cada byte, media palabra y palabra en todas las posiciones, comprobando que los stores parciales no pisen el resto de la palabra (ahí es donde el repo tiene el bug de <code>sb</code> en el byte 3, descripto en la lección de memoria de datos; el programa de la categoría "Loads y stores parciales" de esta guía lo expone). Para la imem: cargar un programa y comparar palabra por palabra, comprobar el relleno con NOP y que escribir fuera de rango no corrompa nada. ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')} hace justamente eso con la función <code>check_imem</code> contra un modelo en el propio testbench, incluyendo el caso de un programa demasiado grande. Errores comunes: confundir la dirección de byte con la de palabra al indexar, el orden de bytes (el byte <i>k</i> del programa va en la dirección <i>k</i>), no inicializar la imem (las instrucciones desconocidas pueden ejecutarse) y olvidarse de que un reset no vacía una BRAM.</p>`,
      },
    ],
    watch: [
      { block: 'imem', title: 'Lectura combinacional', html: `<p>La instrucción aparece en el mismo ciclo en que el PC la pide. Con una BRAM llegaría un ciclo después y habría que absorberlo en IF.</p>` },
      { block: 'dmem', title: 'Carriles y máscara', html: `<p>Los byte-enables de cada store indican qué carriles cambian; la memoria queda armada byte a byte.</p>` },
    ],
    exampleId: 'loads-stores-byte-half',
    focus: 'dmem',
    repo: [
      R('pipeline/1_fetch/imem.v', 'module:imem', 'imem.v', 'Escritura de un byte y relleno con NOP'),
      R('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v', 'Cuatro carriles y lectura combinacional'),
    ],
    next: 'build-7-uart',
  },
  {
    id: 'build-7-uart',
    title: 'Paso 7. UART, sincronizadores y FIFO',
    level: 'Intermedio',
    track: 'construir',
    minutes: 18,
    intro: 'La UART es el cable entre tu PC y la FPGA. Se construye en módulos independientes (baud, receptor, transmisor, FIFOs) que no saben nada del procesador, y se prueba antes de conectarla a la debug unit.',
    sections: [
      {
        heading: 'Qué construir',
        html: `<p>(1) Un <b>generador de baud</b> con sobremuestreo: <code>divisor = f_clk / (16 × baud)</code>; (2) un <b>receptor</b> que detecta el flanco de start, espera medio bit y muestrea cada 16 ticks; (3) un <b>transmisor</b>; (4) <b>FIFOs</b> en ambos sentidos; (5) un <b>sincronizador de 2 flip-flops</b> para RX (y para el botón de reset).</p>`,
      },
      {
        heading: 'Preguntas de diseño',
        html: `<ul>
<li>¿Qué velocidad usás y cuánto tarda en transmitirse todo el estado en cada paso? Hacé la cuenta (10 bits por byte).</li>
<li>¿Necesitás una FIFO entre la UART y la debug unit? ¿Qué pasaría sin ella si la PC manda bytes más rápido de lo que se procesan?</li>
<li>Si cambiás la frecuencia del sistema, ¿qué recalculás? (El divisor.)</li>
<li>¿Cómo aislás la UART del procesador para poder probarla sola?</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>${gh('uart/uart_core.v', 'module:uart_core', 'uart_core.v')} une ${gh('uart/baud_rate_gen.v', 'module:baud_rate_gen', 'baud_rate_gen.v')}, RX, TX y dos ${gh('uart/fifo.v', 'module:fifo', 'FIFOs')} de 4 bytes. Cada FSM se parte en tres módulos (fsm, comb, regs). A 50 MHz y 19200 baudios, el divisor es 162. El sincronizador es ${gh('common/sync_2ff.v', 'module:sync_2ff', 'sync_2ff.v')}. Los detalles están en la lección de UART de "Entender este chip".</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Primero un <b>loopback</b>: la FPGA devuelve lo que recibe. Después el sistema completo. En simulación, un testbench con un receptor UART de la "PC" que guarde lo recibido y compruebe errores de trama (como hace ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')}), con un baud alto para que corra rápido. Casos: todos los valores de byte, bytes seguidos sin hueco, un stop mal formado (se descarta), la FIFO llena.</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>No sincronizar RX: funciona en simulación y falla de forma intermitente en la placa (metaestabilidad).</li>
<li>No recalcular el divisor al cambiar el reloj.</li>
<li>Valor inicial de RX en 0 en vez de 1: un falso start al encender.</li>
<li>Enviar el bit más significativo primero: la UART manda el menos significativo primero.</li>
</ul>`,
      },
      {
        heading: 'El receptor y el transmisor, estado por estado',
        html: `<p>El receptor tiene cuatro estados. <code>IDLE</code> espera el flanco descendente de la línea. <code>START</code> cuenta 8 ticks hasta la mitad del bit de start. <code>DATA</code> toma una muestra cada 16 ticks (siempre en el centro de cada bit) y la desplaza dentro del byte, el primer bit recibido es el menos significativo. <code>STOP</code> espera hasta el centro del bit de stop y recién ahí emite <code>rx_done</code>, y solo si la línea vale 1. Un buen receptor re-verifica al llegar a la mitad del start que la línea siga en 0 (para descartar ruido); el de este repo no lo hace, y es una mejora simple si tu línea es ruidosa.</p>
<p>El transmisor es más simple porque no adivina nada: carga el byte, baja la línea 16 ticks, saca cada bit durante 16 ticks desplazando a la derecha, sube la línea 16 ticks y emite un pulso de fin. Si sale por una FIFO, ese pulso es el que hace el pop y alimenta el siguiente byte.</p>
<p>Las FIFOs tienen un puntero de lectura y uno de escritura de <code>PTR_LEN</code> bits y banderas <code>empty</code> y <code>full</code>. Decisiones: profundidad (el repo usa 4), qué pasa al escribir con la cola llena (acá se descarta) y que el consumidor solo lea cuando no está vacía y solo escriba cuando no está llena.</p>`,
      },
      {
        heading: 'La cuenta del divisor y el sincronizador',
        html: `<p>Con el reloj del sistema a 50 MHz, <code>MODULUS = 50e6 / (19200 × 16) = 162,76</code>, que trunca a 162; el baud real es 19 290 (+0,47 %), tolerable porque el error acumulado en el último bit es una fracción mínima de un bit. El README de la UART dice 325 porque supone 100 MHz: cuando RTL y documentación no coinciden, vale el RTL, y si cambiás el reloj tenés que recalcular. Por eso <code>top_riscv</code> le pasa a la UART la frecuencia interna.</p>
<p>La línea RX viene de afuera, así que pasa por un ${gh('common/sync_2ff.v', 'module:sync_2ff', 'sincronizador de dos flip-flops')} con valor inicial 1 y el atributo <code>ASYNC_REG</code>. Sin él, el diseño funciona en simulación (donde no existe la metaestabilidad) y falla de forma intermitente en la placa, el tipo de bug más difícil de cazar. El botón de reset recibe el mismo tratamiento dentro de ${gh('common/reset_gen.v', 'module:reset_gen', 'reset_gen.v')}.</p>`,
      },
      {
        heading: 'Cómo probarlo y errores comunes',
        html: `<p>Probalo en capas. Primero los módulos solos con un testbench: el generador de baud emite un tick cada 162 ciclos; el receptor, alimentado con tramas que genera el testbench, devuelve todos los valores de byte; el transmisor, observado desde un receptor de referencia, produce tramas bien formadas. Después un <b>loopback</b>: un módulo que escribe en la FIFO de TX lo que sale de la FIFO de RX. Recién con eso en hardware conectás la debug unit. ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')} muestra un receptor de la "PC" que guarda todo en una cola y cuenta errores de trama (start distinto de 0 o stop distinto de 1); lo corre con un baud rate de simulación muy alto (un bit = 128 ciclos) para no esperar. Casos que no se pueden olvidar: bytes consecutivos sin hueco, la FIFO de TX llena, bytes mandados mientras el receptor está ocupado y un stop mal formado.</p>
<p>Errores comunes: sincronizar mal o no sincronizar RX, recalcular mal el divisor (típico al agregar un MMCM), poner el valor inicial de RX en 0 (falso start al encender), mandar primero el bit más significativo, y confiar en que la PC espera: sin control de flujo, si mandás más rápido de lo que la debug unit consume, la FIFO de RX descarta bytes.</p>`,
      },
    ],
    watch: [
      { block: 'uart', title: 'Tramas', html: `<p>La vista Debug muestra cada byte con start, 8 bits LSB primero y stop, y los contadores de ticks. Es la forma de onda que deberías ver en tu simulación.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'uart',
    repo: [
      R('uart/uart_core.v', 'module:uart_core', 'uart_core.v', 'La UART completa'),
      R('uart/uart_rx_fsm.v', 'module:uart_rx_fsm', 'uart_rx_fsm.v', 'Receptor'),
      R('uart/fifo.v', 'module:fifo', 'fifo.v', 'FIFO'),
      X(TB + 'tb_top_riscv.v', 'tb_top_riscv.v', 'Receptor de la PC dentro del testbench'),
    ],
    next: 'build-8-debug-unit',
  },
  {
    id: 'build-8-debug-unit',
    title: 'Paso 8. Diseñar el protocolo de la debug unit y su FSM',
    level: 'Avanzado',
    track: 'construir',
    minutes: 22,
    intro: 'Diseñá el protocolo en papel, dibujá el diagrama de estados y recién después escribí el código. Esta es la parte donde mejor se nota la diferencia entre un diseño pensado y uno improvisado.',
    sections: [
      {
        heading: 'Qué construir',
        html: `<p>Una FSM entre la UART y el CPU que: interpreta comandos, carga el programa en la imem, controla la ejecución (continua, paso a paso, pausa, reset) con <b>enables síncronos</b> sin tocar el reloj, recolecta el estado y lo serializa, y informa el halt.</p>`,
      },
      {
        heading: 'Preguntas de diseño',
        html: `<ul>
<li>Codificación de comandos (un byte ASCII), delimitación (longitud fija o con cabecera), confirmación (ACK/NAK) y orden de bytes.</li>
<li>¿Qué módulos obedecen la habilitación y cuáles siguen siempre activos?</li>
<li>¿Cómo generás una habilitación que dure exactamente un ciclo a partir de un comando? (Un registro que se apaga solo.)</li>
<li>¿Qué codificación de HALT elegís y en qué etapa la detectás?</li>
<li>¿Qué hay que vaciar al reprogramar? Estado: imem, dmem, regfile, latches, PC. ¿Qué pasa si no los vaciás?</li>
<li>¿Qué mecanismo de seguridad hay si no hay HALT?</li>
<li>¿Cuántos estados tiene la FSM? ¿Qué pasa con un comando desconocido?</li>
<li>¿Cómo leés los registros y la dmem: con el CPU corriendo o detenido? Eso define cuántos puertos necesitás.</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo',
        html: `<p>Protocolo L/S/R/P/X/D con respuestas K/E/H/? y el volcado de 86 palabras (ver la lección de la debug unit). La FSM está partida en tres módulos: ${gh('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'fsm')} (lógica de control, combinacional), ${gh('debug/debug_unit_comb.v', 'module:debug_unit_comb', 'comb')} (camino de datos combinacional) y ${gh('debug/debug_unit_regs.v', 'module:debug_unit_regs', 'regs')} (flip-flops). Ventajas: archivos chicos, estado en un solo lugar, lógica combinacional razonable sin pensar en el reloj. La <b>serialización</b> de palabras anchas usa un contador de byte y un desplazamiento de 8 bits, con relleno cuando un campo no es múltiplo de 8. El <b>bus de debug</b> mantiene la dirección un ciclo antes de muestrear para servir a fuentes combinacionales y síncronas. La descripción de qué bit es qué campo vive en el encabezado de riscv_pipeline.v y en <code>decode_dump()</code> del host: hay que mantenerlas sincronizadas; una regla útil es agregar siempre al final.</p>`,
      },
      {
        heading: 'Cómo probarlo',
        html: `<p>Un testbench de sistema que simule la PC mandando bytes (como ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')}): carga con comparación de la imem, step, run hasta el halt, dump con comparación de todos los registros y la dmem contra el esperado, pause en un lazo infinito, reset, recarga con relleno de NOP, programa demasiado grande (<code>E</code>) y comando desconocido (<code>?</code>). Del lado del host, probá la capa de protocolo contra un puerto serie falso, sin la FPGA (${ext(HOST + 'tests/test_protocol.py', 'test_protocol.py')}).</p>`,
      },
      {
        heading: 'Trampas frecuentes',
        html: `<ul>
<li>Cargar el programa con el CPU corriendo.</li>
<li>Habilitación de varios ciclos cuando se quería un paso.</li>
<li>Pausar la debug unit junto con el CPU: nadie recibirá el siguiente comando.</li>
<li>Cambiar el mapa de debug sin actualizar el host.</li>
<li>Responder distinto cuando el CPU está en halt: el host se desincroniza.</li>
</ul>`,
      },
      {
        heading: 'Serializar datos anchos y el bus de debug',
        html: `<p>Los registros de pipeline suman cientos de bits y la UART manda de a 8, así que hace falta un mecanismo que los recorra. La opción del repo: un <b>bus de debug</b> con una dirección de 16 bits hacia el CPU y una palabra de 32 bits de vuelta (más el número total de palabras), y una FSM que para cada palabra pide la dirección, la captura y la envía byte a byte. Dos detalles: los campos no siempre miden múltiplos de 8 bits (hay que rellenar con ceros, como las palabras de flags y de campos del repo), y el host tiene que saber exactamente qué bit es qué campo, esa descripción es parte del protocolo y debe mantenerse sincronizada entre hardware y software. La regla del repo: si se agrega una palabra, va siempre al final y se extiende <code>decode_dump()</code>.</p>
<p>El bus mantiene la dirección un ciclo antes de muestrear el dato, así sirve para fuentes combinacionales (el mapa del CPU) y para memorias con un ciclo de latencia; por eso hay un estado de "dirección estable" y otro de "captura". Y la pregunta que define el hardware: ¿se lee con el CPU corriendo o detenido? Acá el volcado pausa el CPU y vuelve al modo anterior, y el regfile y la dmem tienen un puerto de lectura de debug propio.</p>`,
      },
      {
        heading: 'Pausa, paso y reprogramación sin tocar el reloj',
        html: `<p>La salida <code>cpu_enable</code> es un simple <code>(run | step) &amp; ~halt &amp; ~dumping</code>. El modo <code>run</code> es un registro que queda activo hasta una pausa o un halt; <code>step</code> es un pulso de un ciclo, se apaga solo porque la FSM lo vuelve a poner en 0 en el ciclo siguiente. El reset del CPU es <code>reset_sistema | cpu_rst | loading</code>: mantener el CPU en reset durante la carga evita que el pipeline ejecute basura mientras se escribe la imem.</p>
<p>Para reprogramar sin resintetizar hay que decidir qué se vacía. Del programa anterior pueden quedar: instrucciones viejas después del final del nuevo (el comando <code>L</code> rellena con NOP), valores en la memoria de datos (este diseño no la borra: un programa nuevo los puede ver), valores finales en el banco de registros (el reset los borra), instrucciones a medio ejecutar (el reset vacía el pipeline) y el PC (el reset lo pone en 0). Distinguí el reset global (reinicia también la UART) del reset del procesador (solo el pipeline, lo maneja la debug unit): el segundo es el que permite un comando <code>X</code> sin cortar la comunicación.</p>`,
      },
      {
        heading: 'Cómo se ve en el repo, cómo probarlo y errores comunes',
        html: `<p>Leé ${gh('debug/debug_unit.v', 'module:debug_unit', 'debug_unit.v')} (la cabecera es la especificación del protocolo), después ${gh('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'debug_unit_fsm.v')} estado por estado y por último el camino de datos en ${gh('debug/debug_unit_comb.v', 'module:debug_unit_comb', 'debug_unit_comb.v')}: los contadores <code>byte_cnt</code> y <code>byte_idx</code>, la palabra que se desplaza y las banderas <code>in_range</code>, <code>load_last</code> y <code>dbg_last</code>.</p>
<p>${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')} recorre: carga con comparación de la imem, step y dump, run hasta el halt con aviso espontáneo, reset, pausa en un lazo infinito (<code>jal x0,0</code>), recarga con un programa más corto, un programa demasiado grande (<code>E</code>) y un comando desconocido (<code>?</code>). Del lado de la PC, ${ext(HOST + 'tests/test_protocol.py', 'test_protocol.py')} y ${ext(HOST + 'tests/test_gui.py', 'test_gui.py')} prueban la capa de protocolo y la interfaz contra un puerto serie falso, sin FPGA. Dibujá primero el diagrama de estados; la vista Debug de esta web es uno ya hecho para comparar.</p>
<p>Errores comunes: no esperar la respuesta antes del próximo comando (desincroniza), una habilitación que dura más de un ciclo en un paso, consumir bytes mientras la TX está llena, responder distinto en halt, y desincronizar el mapa de debug con el decodificador del host.</p>`,
      },
    ],
    watch: [
      { block: 'debug', title: 'La FSM de referencia', html: `<p>La vista Debug dibuja los estados y resalta el actual. Mandá cada comando y compará el recorrido con el diagrama que dibujaste.</p>` },
      { block: 'uart', title: 'Backpressure en el volcado', html: `<p>Durante un dump la FIFO de TX se llena y la FSM espera: el volcado avanza al ritmo de la línea.</p>` },
    ],
    exampleId: 'halt-ebreak',
    focus: 'debug',
    repo: [
      R('debug/debug_unit.v', 'module:debug_unit', 'debug_unit.v', 'Protocolo documentado en la cabecera'),
      R('debug/debug_unit_fsm.v', 'module:debug_unit_fsm', 'debug_unit_fsm.v', 'Estados'),
      X(TB + 'tb_top_riscv.v', 'tb_top_riscv.v', 'Prueba de sistema completa'),
      X(HOST + 'debug_protocol.py', 'debug_protocol.py', 'Cliente y decodificación del dump'),
    ],
    next: 'build-9-ensamblador-pc',
  },
  {
    id: 'build-9-ensamblador-pc',
    title: 'Paso 9. Ensamblador e interfaz en la PC',
    level: 'Intermedio',
    track: 'construir',
    minutes: 18,
    intro: 'Tu procesador necesita programas. Del lado de la PC hacen falta un traductor de ensamblador a palabras de 32 bits y una interfaz que hable el protocolo de la debug unit y muestre el estado.',
    sections: [
      {
        heading: 'Cómo funciona un ensamblador',
        html: `<p>Lee líneas como <code>loop: addi x1, x1, -1  # decrementa</code> y produce palabras de 32 bits. El problema central son las <b>referencias hacia adelante</b> (un <code>beq</code> a una etiqueta que todavía no apareció), por eso se trabaja en <b>dos pasadas</b>: la primera cuenta direcciones (4 bytes por instrucción) y arma la tabla de símbolos; la segunda codifica, y en branches y <code>jal</code> el desplazamiento es <i>dirección de la etiqueta − dirección de la instrucción</i>. Codificar es empaquetar campos con desplazamientos y máscaras, según las tablas del paso 1.</p>`,
      },
      {
        heading: 'Detalles que conviene contemplar',
        html: `<ul>
<li>Sintaxis de memoria: <code>lw rd, offset(rs1)</code> y <code>sw rs2, offset(rs1)</code>; cuidado con el orden de operandos del store.</li>
<li>Rangos: inmediatos de 12 bits (−2048..2047), branches ±4 KiB, <code>jal</code> ±1 MiB. Avisá con el número de línea cuando algo no entra.</li>
<li>Nombres de registros: aceptar <code>x5</code> y <code>t0</code>.</li>
<li>Pseudoinstrucciones: <code>nop, mv, li, j, ret, call, beqz...</code>. Cuidado con <code>li</code> de 32 bits: se arma con <code>lui + addi</code>, y como <code>addi</code> extiende el signo hay que corregir la parte alta (pensá <code>li x1, 0x800</code>).</li>
<li>Formato de salida y orden de bytes por la UART: little-endian.</li>
</ul>`,
      },
      {
        heading: 'Cómo lo resolvió este repo y cómo validarlo',
        html: `<p>En el host, ${ext(HOST + 'assemble.py', 'assemble.py')} es un envoltorio de <b>GNU binutils</b> (<code>as -march=rv32i</code>, <code>ld -Ttext=0</code>, <code>objcopy</code>): no hay ensamblador propio. El modelo de referencia tiene además un mini-ensamblador de unas 30 líneas. En esta web hay un ensamblador propio en JavaScript. Escribir uno enseña mucho; usar binutils es más rápido y es la <b>referencia confiable</b> para validar el tuyo: ensamblá el mismo programa con ambos (<code>objdump -d -M no-aliases,numeric</code>) y comparás palabra por palabra. RARS o Venus también muestran el código máquina. Es una decisión para documentar.</p>`,
      },
      {
        heading: 'La interfaz: tres capas y qué mostrar',
        html: `<p>Separala en <b>presentación</b> (CLI, TUI o GUI), <b>protocolo</b> (comandos y decodificación) y <b>comunicación serie</b>. Con esa separación probás el protocolo contra un puerto serie falso sin FPGA, como hace ${ext(HOST + 'tests/test_gui.py', 'test_gui.py')}. Para mostrar qué instrucción hay en cada etapa necesitás un desensamblador (el proceso inverso). Ideas de qué mostrar: registros en hex y decimal resaltando los que cambiaron, el pipeline con la instrucción de cada etapa, cuándo hubo forwarding, stall o flush y por qué, ciclos, instrucciones y CPI, y la memoria de datos resaltando lo escrito. Y decidí qué hace la interfaz si la FPGA no responde o manda menos bytes de lo esperado (el repo usa timeouts y levanta un error de protocolo). Archivos: ${ext(HOST + 'gui.py', 'gui.py')}, ${ext(HOST + 'debug_host.py', 'debug_host.py')}, ${ext(HOST + 'debug_protocol.py', 'debug_protocol.py')}.</p>`,
      },
      {
        heading: 'Dos pasadas, con un ejemplo',
        html: `<p>Tomá un programa mínimo con una referencia hacia adelante:</p>
<pre>        addi x1, x0, 3
loop:   addi x1, x1, -1
        bne  x1, x0, loop
        beq  x0, x0, fin
        addi x2, x0, 1
fin:    ebreak</pre>
<p>En la primera pasada se recorren las líneas contando 4 bytes por instrucción y se anota <code>loop = 4</code> y <code>fin = 20</code>. En la segunda se codifica cada instrucción; para <code>bne</code> el desplazamiento es <code>4 − 8 = −4</code> y para el <code>beq</code> es <code>20 − 12 = 8</code>. Luego el inmediato de B se reparte en sus campos desordenados (bits 12, 10:5, 4:1 y 11) según la tabla del paso 1. Las pseudoinstrucciones se expanden en la primera pasada, porque hay que saber cuántas palabras ocupan (<code>li</code> de 32 bits ocupa dos). Un buen ensamblador devuelve además la lista de errores con el número de línea (inmediato fuera de rango, registro desconocido, etiqueta indefinida).</p>`,
      },
      {
        heading: 'Cómo validar tu ensamblador',
        html: `<p>Necesitás una referencia confiable para comparar palabra por palabra. Con binutils: <code>riscv64-unknown-elf-as -march=rv32i</code>, <code>ld -Ttext=0</code> y <code>objcopy -O binary</code>, como hace ${ext(HOST + 'assemble.py', 'assemble.py')}; con <code>objdump -d -M no-aliases,numeric</code> ves la codificación. Una estrategia: generar muchos programas aleatorios (como los del modelo de referencia), ensamblarlos con ambos y comparar. Cubrí los casos delicados: <code>li</code> con valores como <code>0x800</code> y <code>0xDEADBEEF</code>, branches hacia atrás y hacia adelante, inmediatos extremos (−2048, 2047), <code>jal</code> a mucha distancia, desplazamientos con <code>shamt</code> 0 y 31 y el orden de operandos de los stores. El ensamblador de esta web se validó así contra el modelo en Python.</p>
<p>La decisión de ensamblador propio o toolchain existente conviene documentarla: escribirlo enseña mucho y lo vuelve más tuyo; usar binutils es más rápido y más confiable. El repo eligió binutils en el host y mantiene un mini-ensamblador solo para generar los archivos de prueba de los testbenches.</p>`,
      },
      {
        heading: 'La interfaz: qué mostrar y cómo estructurarla',
        html: `<p>Tres capas: presentación (CLI, TUI o GUI), protocolo (comandos y decodificación en estructuras con nombre: registros, campos de cada latch, memoria) y comunicación serie. Con esa separación se prueba el protocolo contra un simulador, y se puede cambiar la presentación sin tocar lo demás. Para mostrar qué instrucción hay en cada etapa hace falta un desensamblador, el inverso del ensamblador (en el repo, la función <code>disasm</code> de ${ext(HOST + 'debug_protocol.py', 'debug_protocol.py')}).</p>
<p>Ideas de lo que una buena interfaz muestra en cada paso: registros en hexadecimal y decimal resaltando los que cambiaron, el pipeline con la instrucción desensamblada de cada etapa, cuándo hubo forwarding, stall o flush y por qué, contador de ciclos, instrucciones completadas y CPI, y la memoria de datos resaltando lo escrito. Decidí también qué hace la interfaz si la FPGA no responde o manda menos bytes de lo esperado: el cliente del repo usa timeouts calculados a partir del tiempo de transmisión y levanta un error de protocolo explícito, en lugar de colgarse.</p>
<p>Errores comunes: confundir el orden de bytes al armar la trama (little-endian), no esperar el <code>K</code>/<code>E</code> de la carga, y asumir que la FPGA está en el estado que se mostró hace un rato (conviene refrescar con un volcado).</p>`,
      },
    ],
    watch: [
      { block: 'imem', title: 'Del texto a la palabra', html: `<p>Escribí en el editor y mirá la lista de palabras que se carga en la memoria de instrucciones: es la salida de un ensamblador. Hacé clic en una línea para ver los campos coloreados de su codificación.</p>` },
    ],
    exampleId: 'lui-auipc',
    focus: 'imem',
    repo: [
      X(HOST + 'assemble.py', 'assemble.py', 'Envoltorio de binutils'),
      X(HOST + 'debug_protocol.py', 'debug_protocol.py', 'Protocolo, decode_dump y desensamblador'),
      X(HOST + 'gui.py', 'gui.py', 'Interfaz gráfica'),
      X(HOST + 'tests/rv32i_model.py', 'rv32i_model.py', 'Mini-ensamblador y modelo de referencia'),
    ],
    next: 'build-10-timing',
  },
  {
    id: 'build-10-timing',
    title: 'Paso 10. Timing: camino crítico, slack, skew, restricciones y Clock Wizard',
    level: 'Avanzado',
    track: 'construir',
    minutes: 20,
    intro: 'La frecuencia máxima la fija el camino más lento entre dos flip-flops. Esta lección explica cómo lee Vivado el timing y por qué este diseño corre a 50 MHz.',
    sections: [
      {
        heading: 'Análisis estático de timing',
        html: `<p>Vivado no simula para verificar timing: analiza todos los caminos entre flip-flops. El dato sale de un flip-flop en un flanco, atraviesa lógica y ruteo y tiene que llegar al siguiente antes del próximo flanco:</p>
<pre>setup: T_clk ≥ t_clk→q + t_lógica + t_ruteo + t_setup − t_skew
hold:  t_clk→q + t_lógica,min ≥ t_hold + t_skew</pre>
<p>El <b>slack</b> es el margen (requerido − llegada): positivo cumple, negativo falla. <b>WNS</b> es el peor slack de setup, <b>TNS</b> la suma de los negativos, <b>WHS/THS</b> lo mismo para hold. Una estimación: <code>f_max ≈ 1 / (T_clk − WNS)</code>. Usá los números posteriores a la implementación (place and route): los de síntesis no incluyen el ruteo real.</p>`,
      },
      {
        heading: 'Camino crítico y skew',
        html: `<p>El <b>camino crítico</b> es el de peor slack; en una FPGA el ruteo pesa tanto como la lógica. Los caminos que salen de una etapa y vuelven a otra (forwarding hacia EX, decisión de salto hacia el PC) son candidatos típicos. El <b>skew</b> es la diferencia de llegada del mismo flanco a dos flip-flops: lo genera la distribución del reloj, no la lógica de datos. Es pequeño con buffers globales y crece si el reloj pasa por lógica (clock gating, relojes derivados con contadores): por eso no se toca el reloj. Mostrá el skew que reporta Vivado en tu camino crítico e interpretalo.</p>`,
      },
      {
        heading: 'Restricciones y Clock Wizard (MMCM)',
        html: `<p>Sin restricción de reloj Vivado no sabe qué verificar: se declara en el <code>.xdc</code> con <code>create_clock</code>. El repo lo hace en ${ext(BASE + 'project_4.srcs/constrs_1/imports/Downloads/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc')} (período de 10 ns). El <b>Clock Wizard</b> configura un MMCM o PLL que genera otra frecuencia por la red global; su señal <code>locked</code> indica cuándo es estable y el sistema no debe arrancar antes (acá <code>locked</code> se mete al reset).</p>`,
      },
      {
        heading: 'Por qué este diseño corre a 50 MHz',
        html: `<p>Según el comentario del top, el camino crítico (dmem → forwarding → ALU → branch → flush) no cierra a 100 MHz: WNS ≈ −5 ns después del ruteo, o sea un período realista de unos 15 ns (~66 MHz). Con <code>USE_MMCM=1</code> todo corre a 50 MHz, generado por un ${gh('top/top_riscv.v', 'inst:u_mmcm', 'MMCME2_BASE')}: VCO a 100 MHz × 10 = 1000 MHz y salida dividida por 20. Opciones ante un WNS negativo: bajar la frecuencia (lo más barato, lo que se hizo) o agregar un registro en ese camino (cuesta un ciclo más de latencia en el pipeline y rediseñar hazards). Y si cambiás la frecuencia, recalculá el divisor de la UART (pasa de 325 a 162): el top lo hace pasando la frecuencia interna.</p>
<p>Métricas a reportar: frecuencia elegida y WNS/WHS a esa frecuencia, camino crítico (origen, destino, retardo de lógica y de ruteo), utilización (LUTs, FFs, BRAM) y consumo.</p>`,
      },
      {
        heading: 'La relación con el stall de load-use y con el forwarding',
        html: `<p>El camino crítico que reporta el repo, <b>dmem → forwarding → ALU → branch → flush</b>, nace de una decisión de diseño que se puede leer en el código: <code>mem_result</code> se elige después de la lectura asíncrona de la dmem y alimenta el mux de forwarding. Es decir, existe una cadena combinacional que parte del registro EX/MEM (la dirección), atraviesa la lectura de la memoria, el mux <code>wb_sel</code>, el mux de forwarding, la ALU, la comparación del branch, el mux del PC y llega al registro PC (y a las entradas de flush de IF/ID e ID/EX).</p>
<p>Ahora, el stall de load-use. Con él, esa cadena nunca se ejercita funcionalmente con datos de un load: el stall impide que un load esté en MEM mientras su dependiente está en EX. La herramienta igual la mide (no sabe de la exclusión), y por eso el WNS la incluye. Sin el stall, el dato del load sí pasaría por esa cadena: sería un camino real, y la frecuencia máxima quedaría atada a ella. Las alternativas, en orden de costo: (1) dejar el stall (un ciclo por load-use y la cadena queda como camino lógicamente falso, que en teoría se podría excluir con una restricción, con el riesgo de que alguien lo rompa después); (2) forwardear solo resultados de la ALU y dejar el dato del load para MEM/WB, lo que acorta la cadena y exige el stall, como en el libro; (3) quitar el stall y aceptar el camino real, ganando CPI. La elección depende de medir en el reporte cuánto vale cada camino.</p>`,
      },
      {
        heading: 'Cómo se mide y cómo se escribe el informe',
        html: `<p>Pasos prácticos en Vivado: correr la implementación completa (no solo síntesis), abrir <i>Report Timing Summary</i> y anotar WNS, TNS, WHS y THS; abrir el camino peor con <i>Report Timing</i> y leer el origen, el destino, el retardo de lógica y el de ruteo por celda; mirar el skew del reloj en ese camino (con buffers globales es pequeño; si pasa por lógica, crece). Luego <i>Report Utilization</i> (LUTs, FFs, BRAM) y <i>Report Power</i>. Antes de mirar el reporte, anotá tu predicción del camino crítico y comparala después: es el mejor ejercicio para desarrollar intuición. Para el cálculo de la frecuencia máxima: <code>f_max ≈ 1 / (T_clk − WNS)</code>; con WNS ≈ −5 ns a 10 ns da unos 66 MHz, y el repo eligió 50 MHz porque sale limpio del MMCM (100 MHz ÷ 2).</p>`,
      },
      {
        heading: 'Cómo lo hizo el repo, cómo probarlo y errores comunes',
        html: `<p>El reloj lo genera ${gh('top/top_riscv.v', 'inst:u_mmcm', 'MMCME2_BASE')} con <code>CLKFBOUT_MULT_F = 10</code> y <code>CLKOUT0_DIVIDE_F = 20</code>, entre dos buffers globales; <code>locked</code> se suma al reset del sistema. La restricción de reloj y los pines están en ${ext(BASE + 'project_4.srcs/constrs_1/imports/Downloads/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc')}. El parámetro <code>USE_MMCM = 0</code> usa el reloj de la placa directo, y es lo que usan los testbenches (el MMCM es una primitiva de Xilinx y no se simula igual). Por eso <b>los testbenches no prueban el timing</b>: una simulación puede pasar y el hardware fallar. La verificación de timing es el reporte posterior a la implementación, y la del reloj real es un test en la placa (por ejemplo, un LED que parpadea a un ritmo calculado).</p>
<p>Errores comunes: confiar en los números de síntesis, olvidar la restricción de reloj (la herramienta no verifica nada), cambiar la frecuencia sin recalcular el divisor de la UART, tocar el reloj con lógica (skew y glitches) en vez de usar enables, y arrancar el sistema antes de que <code>locked</code> suba.</p>`,
      },
    ],
    watch: [
      { block: 'forward', title: 'Un tramo del camino crítico', html: `<p>Los muxes de forwarding están entre las salidas de MEM y la ALU. Seguí con la vista el cable desde dmem hasta el PC en el ejemplo de load-use: ese es el recorrido combinacional que Vivado mide.</p>` },
    ],
    exampleId: 'load-use',
    focus: 'alu',
    repo: [
      R('top/top_riscv.v', 'inst:u_mmcm', 'MMCM en top_riscv.v', 'Reloj del sistema a 50 MHz'),
      R('common/reset_gen.v', 'module:reset_gen', 'reset_gen.v', 'Reset de encendido y botón sincronizado'),
      X(BASE + 'project_4.srcs/constrs_1/imports/Downloads/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc', 'create_clock y pines'),
    ],
    next: 'build-11-verificacion',
  },
  {
    id: 'build-11-verificacion',
    title: 'Paso 11. Verificación: niveles de prueba, golden model y checklist',
    level: 'Intermedio',
    track: 'construir',
    minutes: 20,
    intro: 'Un pipeline con un error sutil puede pasar casi todas las pruebas y fallar con una secuencia particular. La única defensa es probar sistemáticamente, de lo chico a lo grande.',
    sections: [
      {
        heading: 'Cuatro niveles de prueba',
        html: `<ol>
<li><b>Unitario</b>: un testbench por módulo (ALU, immgen, regfile, control, UART), antes de integrar.</li>
<li><b>Pipeline</b>: programas cortos en simulación, comparando el estado final contra lo esperado (${ext(TB + 'tb_pipeline.v', 'tb_pipeline.v')}).</li>
<li><b>Sistema en simulación</b>: debug unit + UART + pipeline con un testbench que simula la PC (${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')}).</li>
<li><b>Hardware</b>: primero un loopback de la UART, después el sistema completo.</li>
</ol>`,
      },
      {
        heading: 'Testbenches que se verifican solos y golden model',
        html: `<p>Mirar formas de onda sirve para encontrar un error, no para confirmar que no hay. Un testbench <b>autoverificable</b> compara cada resultado y reporta PASS/FAIL. Para saber qué es "esperado" usá un <b>golden model</b>: un simulador simple de una instrucción por vez. En este repo es ${ext(HOST + 'tests/rv32i_model.py', 'host/tests/rv32i_model.py')}: ensambla el programa, lo ejecuta y escribe <code>pipeline_prog.hex</code> y <code>pipeline_exp.hex</code> (32 registros + 16 palabras de dmem), que los dos testbenches leen con <code>$readmemh</code>. Si cambia el CPU, se regeneran. Una técnica potente: generar miles de programas aleatorios y comparar el pipeline contra el modelo; en esta web se usó para validar el simulador y apareció el bug de <code>sb</code> en el byte 3, que el programa fijo no cubre.</p>`,
      },
      {
        heading: 'Programas de prueba por categoría',
        html: `<p>Instrucciones (con positivos, negativos y límites), forwarding (distancias 1, 2 y 3, ambos operandos, dato de store), load-use (en rs1 y rs2), x0, saltos (tomado y no tomado, jal, jalr con rd==rs1), loads y stores parciales (en cada desplazamiento), desplazamientos (negativos, 0 y 31) y HALT (normal, tras un branch tomado, programa sin HALT). Programas completos con resultados verificados, listos para pegar en el editor, están en la sección de pruebas de esta guía. Además medí ciclos: <code>4 + N + stalls + 2·saltos tomados</code>.</p>`,
      },
      {
        heading: 'Checklist antes de escribir la primera línea',
        html: `<p>La lista de decisiones (etapas y registros, tablas de codificación, inmediatos y control, datapath dibujado, etapa de resolución de saltos, memorias, pausa sin tocar el reloj, HALT, protocolo y FSM, plan de pruebas, modelo de referencia, placa y pines, camino crítico predicho, git) está en la sección <b>Checklist</b> de esta guía. Usá git desde el primer día: cuando algo que funcionaba se rompa, vas a querer saber qué cambió. Cuando tu diseño ande, lo que sigue es lo que hace este repo: comparar contra el modelo, medir el CPI y explicar con evidencia por qué funciona.</p>`,
      },
      {
        heading: 'Programas de prueba por categoría, con resultados verificados',
        html: `<p>La sección de pruebas de esta guía trae programas completos para cada categoría, listos para pegar en el editor, con su resultado esperado y las estadísticas (instrucciones, stalls, saltos, ciclos): instrucciones en los límites, forwarding a distancias 1 a 4, load-use, el registro x0, saltos y jalr con <code>rd == rs1</code>, stores y loads parciales, desplazamientos y los tres casos de HALT (normal, tras un branch tomado y sin HALT). Cada uno se verificó con el simulador y, salvo el caso de <code>sb</code> en el byte 3, contra el modelo de referencia. Usalos como punto de partida de tu propio banco de pruebas y agregá los tuyos cada vez que encuentres un bug: un bug que se arregló sin un test que lo capture vuelve.</p>
<p>Dos técnicas más: <b>pruebas aleatorias</b> (generar programas con registros elegidos de un conjunto chico para forzar hazards y comparar con el modelo; encontraron el bug de <code>sb</code>) y <b>cuenta de ciclos</b> (<code>4 + N + stalls + 2·saltos tomados</code>), que detecta stalls de más o de menos que el estado final no ve.</p>`,
      },
      {
        heading: 'Cómo lo hace el repo: de los programas a los testbenches',
        html: `<p>El flujo del repo es: escribir <code>host/tests/pipeline_test.s</code>; correr <code>python3 rv32i_model.py pipeline_test.s</code>, que escribe <code>pipeline_prog.hex</code> (el programa) y <code>pipeline_exp.hex</code> (32 registros más 16 palabras de dmem esperadas) y se copian a <code>sim_1/new/</code>; los testbenches los leen con <code>$readmemh</code>. ${ext(TB + 'tb_pipeline.v', 'tb_pipeline.v')} carga el programa en la imem, corre hasta <code>o_halt</code>, pausa a los 20 ciclos y comprueba que el PC se congela, y compara contra el esperado leyendo por el bus de debug (también verifica que el conteo sea 86). ${ext(TB + 'tb_top_riscv.v', 'tb_top_riscv.v')} hace lo mismo pero a través de la UART y la debug unit, y suma las pruebas de protocolo. Del lado de Python, <code>python3 -m unittest discover -s tests</code> corre los tests del protocolo y de la GUI sin hardware.</p>`,
      },
      {
        heading: 'Qué hacer en hardware y errores comunes',
        html: `<p>En la placa, el orden recomendado es: (1) un diseño mínimo que haga parpadear un LED, para validar reloj y pines; (2) loopback de la UART; (3) cargar un programa y leerlo de vuelta; (4) el programa de prueba con <code>R</code> y un volcado comparado con el esperado. Si algo falla en la placa y no en la simulación, sospechá en este orden: sincronizadores faltantes, reloj y restricciones, divisor de la UART, orden de bytes y reset.</p>
<p>Errores comunes de verificación: probar solo con programas "lindos" (valores chicos y positivos), comparar solo algunos registros, no regenerar los archivos esperados al cambiar el programa, confiar en las formas de onda para confirmar que no hay errores, y no versionar los resultados esperados junto con el código. Y una última disciplina: usá git desde el primer día, un commit por módulo que pasa su testbench.</p>`,
      },
    ],
    watch: [
      { block: 'memwb', title: 'El estado final es lo que se compara', html: `<p>Al terminar un ejemplo, la insignia de verificación compara registros y memoria contra el esperado: es el mismo principio que el testbench autoverificable.</p>` },
    ],
    exampleId: 'programa-completo',
    focus: 'memwb',
    repo: [
      X(HOST + 'tests/rv32i_model.py', 'rv32i_model.py', 'Golden model que genera pipeline_exp.hex'),
      X(TB + 'tb_pipeline.v', 'tb_pipeline.v', 'Testbench autoverificable del pipeline'),
      X(TB + 'tb_top_riscv.v', 'tb_top_riscv.v', 'Testbench del sistema completo'),
      X(TB + 'pipeline_exp.hex', 'pipeline_exp.hex', 'Estado esperado'),
      X(HOST + 'tests/test_protocol.py', 'test_protocol.py', 'Tests del host sin FPGA'),
    ],
    next: null,
  },
];
