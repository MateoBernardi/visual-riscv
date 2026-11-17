// lessons.js - lecciones guiadas. Sin DOM.
//
// Cada lección es corta y explica el POR QUÉ de una decisión de este CPU (project_4). El detalle bit a bit vive en
// el repo (READMEs y RTL) y en el inspector de cada módulo; acá se enlaza en vez de repetirse.
//   { id, title, level, track: 'entender'|'construir', minutes, intro,
//     sections: [{ heading, html }], watch: [{ block, title, html }], exampleId, focus, repo: [{label, href, note}], next }
// Bloques 3D: pc imem ifid control regfile immgen idex fwdMuxA fwdMuxB aluSrcMux alu branch exmem dmem wbMux memwb
// hazard forward flush debug uart clkrst (ver CONTRACT.md).
import { githubUrl, REPO } from './repo.js';

const P4 = `https://github.com/${REPO.owner}/${REPO.repo}/blob/${REPO.ref}/project_4/`;
// Link a un archivo/símbolo del RTL (ruta relativa a project_4/rtl/).
const R = (file, sym, label, note) => ({ label, href: githubUrl(file, sym), note });
// Link a cualquier archivo de project_4/.
const X = (path, label, note) => ({ label, href: P4 + path, note });
const gh = (file, sym, text) => `<a href="${githubUrl(file, sym)}" target="_blank" rel="noopener">${text}</a>`;
const p4 = (path, text) => `<a href="${P4 + path}" target="_blank" rel="noopener">${text}</a>`;
const verif = (text) => `<a href="#/verificacion" data-nav="verificacion">${text}</a>`;

export const TRACKS = {
  entender: {
    id: 'entender',
    title: 'Entender este chip',
    blurb: 'Por qué el CPU de este repo está hecho como está: cada lección toma una decisión de diseño, la alternativa y lo que costó.',
  },
  construir: {
    id: 'construir',
    title: 'Construí tu propio RISC-V',
    blurb: 'Los pasos para llegar a un RV32I propio, verificado y corriendo en una FPGA, en el orden en que conviene darlos.',
  },
};

export const LESSONS = [
  // ============================================================ ENTENDER
  {
    id: 'isa',
    title: 'El contrato: ISA y microarquitectura',
    level: 'Básico', track: 'entender', minutes: 5,
    intro: 'Todo lo que ves en el tablero es una forma de cumplir un contrato que no cambia: la ISA RV32I.',
    sections: [
      { heading: 'Qué promete la ISA y qué elige el diseñador', html: `<p>La <b>ISA</b> dice qué hace cada instrucción. La <b>microarquitectura</b> decide cómo: monociclo, multiciclo o, como acá, un pipeline de 5 etapas en orden. Un programa tiene que dar el mismo resultado en cualquiera de ellas.</p>
<p>De ahí sale la regla que guía toda la verificación: <b>el pipeline puede cambiar cuándo pasan las cosas, nunca qué resultado dan</b>. Si el estado final difiere del de la especificación, hay un bug.</p>` },
      { heading: 'Qué implementa este CPU', html: `<p>RV32I completo, <b>sin la arquitectura privilegiada</b> (no hay CSRs ni interrupciones). Es lo mínimo para correr programas reales, y deja el diseño chico y verificable.</p>
<p>Sin CSRs no hay dónde saltar ante una excepción, así que toda excepción es un <b>fatal trap</b>: el CPU se detiene y la debug unit informa la causa. La spec no privilegiada lo permite expresamente.</p>` },
      { heading: 'Por qué los campos están siempre en el mismo lugar', html: `<p><code>rs1</code>, <code>rs2</code> y <code>rd</code> ocupan los mismos bits en todos los formatos. Eso permite leer el banco de registros en ID <i>antes</i> de saber qué instrucción es. El costo aparece más adelante: la hazard unit también compara esos bits cuando no son registros (el "stall falso").</p>` },
    ],
    watch: [{ block: 'control', title: 'Control', html: 'decodifica el opcode y arma las señales que viajan con la instrucción.' }],
    exampleId: 'lui-auipc', focus: 'control',
    repo: [X('README.md', 'README de project_4', 'el CPU, la placa y cómo correrlo'), R('pipeline/2_decode/control.v', 'module:control', 'control.v', 'la tabla de decodificación')],
    next: 'sistema',
  },
  {
    id: 'sistema',
    title: 'El sistema: de la PC al pipeline',
    level: 'Básico', track: 'entender', minutes: 5,
    intro: 'El CPU no tiene periféricos: todo lo que entra y sale pasa por la UART y la debug unit.',
    sections: [
      { heading: 'La cadena', html: `<p>PC → cable USB → <b>uart_core</b> (bytes, 19200 baudios) → <b>debug_unit</b> (comandos) → <b>riscv_pipeline</b> (el CPU). Cada bloque sabe una sola cosa: la UART no entiende comandos, la debug unit no sabe de bits en la línea y el CPU no sabe que existe una PC.</p>
<p>Esa separación es lo que permite probar cada parte sola y después el sistema entero.</p>` },
      { heading: 'Por qué 70 MHz y no los 100 de la placa', html: `<p>Un MMCM genera 70 MHz a partir del oscilador de 100 MHz. Es la frecuencia más alta, en pasos de 10 MHz, a la que el diseño cierra timing en el peor caso. A 80 MHz el camino crítico (un salto que depende de la instrucción anterior) ya no entra en el período.</p>
<p>Cambiar la frecuencia toca dos parámetros: la UART recalcula su divisor sola y Vivado deriva la restricción del reloj.</p>` },
      { heading: 'Por qué memorias de 1 KB, en LUTs', html: `<p>imem y dmem se leen en el mismo ciclo (lectura asíncrona). Eso evita etapas de espera en IF y MEM, pero solo se puede hacer con RAM distribuida (LUTRAM), no con BRAM. Para programas didácticos 1 KB alcanza.</p>` },
    ],
    watch: [
      { block: 'uart', title: 'UART', html: 'convierte bytes en la señal serie del cable.' },
      { block: 'debug', title: 'Debug unit', html: 'carga, corre, pausa y vuelca el CPU.' },
      { block: 'clkrst', title: 'CLK/RST', html: 'el MMCM de 70 MHz y el reset.' },
    ],
    exampleId: 'halt-ebreak', focus: 'debug',
    repo: [R('top/top_riscv.v', 'module:top_riscv', 'top_riscv.v', 'el sistema en la placa'), X('rtl/top/README.md', 'README de top/', 'el reloj, los LEDs y el display')],
    next: 'pipeline',
  },
  {
    id: 'pipeline',
    title: 'Cinco etapas: por qué segmentar',
    level: 'Básico', track: 'entender', minutes: 6,
    intro: 'Segmentar no hace más rápida a una instrucción: hace que terminen más instrucciones por segundo.',
    sections: [
      { heading: 'La idea', html: `<p>Un monociclo necesita un ciclo tan largo como la instrucción más lenta. Partiendo el trabajo en 5 etapas (IF, ID, EX, MEM, WB) con registros entre ellas, el ciclo se acorta a la etapa más lenta y hay hasta 5 instrucciones en vuelo a la vez.</p>
<p>El ideal es una instrucción por ciclo (CPI = 1). Este CPU mide entre 1,34 y 1,62 en la placa: la diferencia la explican los hazards de las próximas lecciones.</p>` },
      { heading: 'Todo viaja con la instrucción', html: `<p>Los registros de pipeline (IF/ID, ID/EX, EX/MEM, MEM/WB) llevan la instrucción con todo lo ya calculado: señales de control, operandos, el registro destino. Cuando WB escribe <code>rd</code>, usa el <code>rd</code> que viajó con <i>esa</i> instrucción, no el de la que está ahora en ID.</p>` },
      { heading: 'Por qué no hay hazards estructurales', html: `<p>Hay memorias separadas para instrucciones y datos, y el banco de registros escribe y lee en el mismo ciclo (con bypass). Ningún recurso se pelea entre dos etapas.</p>` },
    ],
    watch: [{ block: 'ifid', title: 'IF/ID', html: 'el primer registro de pipeline: la instrucción recién leída.' }, { block: 'memwb', title: 'MEM/WB', html: 'el último: el resultado listo para escribirse.' }],
    exampleId: 'datapath-etapas', focus: 'pc',
    repo: [X('rtl/pipeline/README.md', 'README de pipeline/', 'las etapas y los riesgos'), R('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v', 'el CPU')],
    next: 'forwarding',
  },
  {
    id: 'forwarding',
    title: 'Forwarding: usar un resultado antes de escribirlo',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'El resultado de una instrucción existe ciclos antes de llegar al banco de registros. El forwarding lo toma de donde está.',
    sections: [
      { heading: 'El problema', html: `<p><code>add x1,…</code> seguido de <code>sub …,x1</code>: cuando <code>sub</code> lee x1 en ID, <code>add</code> todavía está en EX. Sin hacer nada, <code>sub</code> usaría un valor viejo. Frenar hasta que <code>add</code> escriba costaría 2 o 3 ciclos por cada dependencia, que en código real son la mayoría.</p>` },
      { heading: 'La solución, en tres distancias', html: `<ul><li><b>A distancia 1</b>: el dato está en EX/MEM y un mux lo lleva a la ALU.</li>
<li><b>A distancia 2</b>: está en MEM/WB, mismo mecanismo.</li>
<li><b>A distancia 3</b>: se está escribiendo en el banco en este ciclo; el regfile lo devuelve directo (bypass WB→ID).</li></ul>
<p>Si las dos fuentes tienen el mismo registro gana EX/MEM, porque es la escritura más reciente. Costo: 0 ciclos, a cambio de dos muxes y comparadores en el camino de la ALU.</p>` },
      { heading: 'Lo que cuesta en frecuencia', html: `<p>Ese mux está en el camino crítico del diseño: comparar destinos, elegir el operando, restar, decidir el salto. Es la razón por la que el CPU no pasa de 70 MHz, y por la que el dato de un load <b>no</b> se adelanta desde MEM (próxima lección).</p>` },
    ],
    watch: [{ block: 'forward', title: 'Forward unit', html: 'compara los registros fuente de EX con los destinos de MEM y WB.' }, { block: 'fwdMuxA', title: 'Mux A', html: 'elige entre el regfile, EX/MEM y MEM/WB.' }],
    exampleId: 'forwarding-memwb-bypass', focus: 'forward',
    repo: [R('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v'), X('verif/formal/forward_unit/README.md', 'Su prueba formal', 'el operando de EX es siempre el valor más reciente')],
    next: 'load-use',
  },
  {
    id: 'load-use',
    title: 'Load-use: el único stall, y por qué se dejó',
    level: 'Intermedio', track: 'entender', minutes: 7,
    intro: 'El dato de un load aparece al final de MEM. Si la instrucción siguiente lo necesita en EX, hay que esperar un ciclo.',
    sections: [
      { heading: 'Qué hace la hazard unit', html: `<p>Si la instrucción en EX es un load y su destino coincide con un registro fuente de la de ID, congela PC e IF/ID un ciclo y mete una burbuja en ID/EX. Un ciclo después el load está en WB y su dato llega por forwarding.</p>` },
      { heading: 'La decisión: frenar o adelantar desde MEM', html: `<p>Como la dmem se lee en el mismo ciclo, se podría adelantar el dato del load desde MEM y no frenar nunca. Se probaron las dos opciones con la ${verif('verificación')}:</p>
<ul><li><b>Sin stall</b>: menos ciclos, pero la lectura de la dmem queda en el camino crítico: <b>60 MHz</b>.</li>
<li><b>Stall + load desde WB</b>: un ciclo más por load-use, sin la dmem en el camino crítico: <b>70 MHz</b>.</li></ul>
<p>Ganó la segunda en todos los programas: el stall cuesta como mucho 8 % de ciclos y el reloj es 17 % más rápido.</p>` },
      { heading: 'El stall falso', html: `<p>La hazard unit compara los campos crudos <code>rs1</code>/<code>rs2</code> sin mirar si la instrucción los usa. Un <code>addi</code> cuyo inmediato coincide con el destino del load frena sin necesidad. Arreglarlo (la variante <code>hazard_unit_precise</code>) ahorra 0,2 % de ciclos en la suite oficial y 0 % en los programas: no valió la pena.</p>` },
    ],
    watch: [{ block: 'hazard', title: 'Hazard unit', html: 'detecta load-use en ID.' }, { block: 'idex', title: 'ID/EX', html: 'recibe la burbuja.' }],
    exampleId: 'load-use', focus: 'hazard',
    repo: [R('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v'), X('verif/README.md', 'La evaluación de las dos opciones', 'tablas de fmax y MIPS')],
    next: 'saltos',
  },
  {
    id: 'saltos',
    title: 'Saltos: resolver en EX y pagar 2 ciclos',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'Cuando el CPU se entera de que un salto se toma, ya buscó dos instrucciones que no tenía que ejecutar.',
    sections: [
      { heading: 'Por qué en EX', html: `<p>La comparación del branch usa la ALU que ya existe en EX, con los operandos que ya trae el forwarding. Resolver en ID costaría 1 ciclo en vez de 2, pero necesita un comparador propio y forwarding hacia ID, y alargaría el camino de ID.</p>
<p>Mientras tanto el CPU sigue en secuencia: es lo mismo que predecir siempre "no tomado". Un branch no tomado cuesta 0.</p>` },
      { heading: 'El flush', html: `<p>Si el salto se toma, IF/ID e ID/EX se vacían (se convierten en burbujas) y el PC carga el destino. Como esas instrucciones todavía no escribieron nada, descartarlas no deja rastro.</p>` },
      { heading: 'Lo que más cuesta', html: `<p>En la placa, los saltos son entre el 70 y el 98 % de los ciclos perdidos. En la criba, si el salto costara 1 ciclo el CPI pasaría de 1,42 a 1,22. Queda como trabajo futuro, midiendo cuánto baja la frecuencia.</p>` },
    ],
    watch: [{ block: 'branch', title: 'Branch', html: 'decide si se toma y calcula el destino.' }, { block: 'flush', title: 'Flush', html: 'vacía IF/ID e ID/EX.' }],
    exampleId: 'branch-flush', focus: 'flush',
    repo: [R('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v'), X('RESULTADOS.md', 'De dónde salen los ciclos perdidos', 'desglose del CPI por causa')],
    next: 'traps',
  },
  {
    id: 'traps',
    title: 'Excepciones y halt: detenerse sin dejar rastro',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'ebreak, ecall o una excepción detienen el CPU. Lo importante es dónde se detiene.',
    sections: [
      { heading: 'Detenerse bien', html: `<p>Todo lo anterior termina, la instrucción que detiene <b>no escribe nada</b> y nada posterior se ejecuta. Así el estado que se lee después es exactamente el de la spec.</p>` },
      { heading: 'Por qué se decide en EX', html: `<p>Una instrucción ilegal se detecta en ID, pero recién actúa en EX. Si estaba en el camino equivocado detrás de un salto tomado, el flush la descarta y no hay trap. Los accesos desalineados o fuera de memoria y los saltos a direcciones no múltiplo de 4 se detectan en EX, donde se conoce la dirección.</p>
<p>El salto desalineado es un trap <b>del salto</b>: el PC nunca llega a quedar desalineado.</p>` },
      { heading: 'Por qué existen', html: `<p>La primera versión no los tenía. riscv-formal encontró que un load desalineado escribía <code>rd</code> y que las codificaciones inválidas se ejecutaban: 8 de 44 chequeos fallaban. Con los traps, 45/45.</p>` },
      { heading: 'Pausar sin tocar el reloj', html: `<p>La debug unit pausa el CPU con un enable que llega a cada registro, nunca cortando el reloj. Cortar el reloj con lógica genera glitches y skew; el enable es lo que las FPGAs implementan gratis en cada flip-flop.</p>` },
    ],
    watch: [{ block: 'control', title: 'Control', html: 'marca ebreak, ecall e ilegales en ID.' }, { block: 'branch', title: 'EX', html: 'trap_unit detecta saltos y accesos inválidos.' }],
    exampleId: 'trap-desalineado', focus: 'branch',
    repo: [R('pipeline/flow/trap_unit.v', 'module:trap_unit', 'trap_unit.v'), R('pipeline/2_decode/illegal_check.v', 'module:illegal_check', 'illegal_check.v'), X('rtl/pipeline/README.md', 'Las causas', 'códigos de mcause y dónde se detecta cada una')],
    next: 'debug-uart',
  },
  {
    id: 'debug-uart',
    title: 'Debug unit y UART: hablar con la placa',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'Con seis comandos de un byte la PC carga, corre y lee todo el estado interno del CPU real.',
    sections: [
      { heading: 'Un protocolo mínimo', html: `<p><code>L</code> carga, <code>S</code> un ciclo, <code>R</code> corre, <code>P</code> pausa, <code>X</code> resetea, <code>D</code> vuelca el estado (90 palabras: pipeline, registros, dmem, causa del trap y versión del hardware). Un byte por comando hace trivial la máquina de estados y el host.</p>
<p>Leer el estado es <b>observar</b>, no simular: los registros de pipeline del dump son los del silicio, ciclo a ciclo.</p>` },
      { heading: 'Por qué 19200 baudios', html: `<p>El divisor del baud rate es entero. A 19200 es grande (unos 228 a 70 MHz) y el error queda por debajo del 0,62 % a cualquier frecuencia. A 115200 el error llegaría al 3,7 %, cerca de lo que tolera una UART.</p>` },
      { heading: 'Por qué colas y un sincronizador', html: `<p>Un byte por la línea tarda unos 36 000 ciclos: las colas de 4 bytes desacoplan los dos ritmos. La línea RX no tiene relación con el reloj del sistema, así que pasa por dos flip-flops en cadena para que la metaestabilidad no llegue a la lógica.</p>` },
    ],
    watch: [{ block: 'debug', title: 'Debug unit', html: 'la FSM que interpreta los comandos.' }, { block: 'uart', title: 'UART', html: 'sobremuestreo ×16 para leer cada bit en su centro.' }],
    exampleId: 'halt-ebreak', focus: 'debug',
    repo: [X('rtl/debug/README.md', 'README de debug/', 'el protocolo completo'), X('rtl/uart/README.md', 'README de uart/'), X('host/README.md', 'El host', 'GUI y línea de comandos')],
    next: 'rendimiento',
  },
  {
    id: 'rendimiento',
    title: 'Rendimiento real: CPI, frecuencia y recursos',
    level: 'Avanzado', track: 'entender', minutes: 5,
    intro: 'Los números de la placa, y qué decisión explica cada uno.',
    sections: [
      { heading: 'Tiempo = instrucciones × CPI ÷ frecuencia', html: `<p>A 70 MHz el ideal son 70 MIPS. En la placa se miden <b>43 a 52 MIPS</b> (CPI 1,34 a 1,62). La pérdida es casi toda de saltos tomados; el load-use pesa poco y la memoria nada, porque responde en el mismo ciclo.</p>
<p>Por eso la decisión del load-use se tomó mirando las dos variables a la vez: bajar el CPI a costa de la frecuencia habría sido peor.</p>` },
      { heading: 'Recursos y potencia', html: `<p>3222 LUT (5 %) y 1863 FF (1,5 %) del Artix-7, sin BRAM ni DSP. El banco de registros está en flip-flops porque el reset borra los 32 registros en un ciclo, y una RAM no puede. El diseño consume ~0,025 W; casi todo el resto es el MMCM y la fuga del chip.</p>` },
    ],
    watch: [{ block: 'alu', title: 'ALU', html: 'la resta de 32 bits es el tramo más largo del camino crítico.' }],
    exampleId: 'programa-completo', focus: 'alu',
    repo: [X('RESULTADOS.md', 'RESULTADOS.md', 'STA, CPI por causa, recursos por módulo y potencia')],
    next: null,
  },

  // ============================================================ CONSTRUIR
  {
    id: 'build-isa',
    title: 'Paso 1. Elegir qué implementar',
    level: 'Básico', track: 'construir', minutes: 5,
    intro: 'Antes del Verilog: qué parte de la ISA, qué pasa con lo que no implementás y cómo vas a saber que está bien.',
    sections: [
      { heading: 'Decidí el alcance', html: `<p>RV32I sin CSRs es un buen punto de partida: unas 40 instrucciones y ninguna interrupción. Lo que quede afuera tiene que tener un comportamiento definido (en este repo: trap de instrucción ilegal), no "lo que salga".</p>` },
      { heading: 'Armá tus tablas', html: `<p>Una tabla de codificación (opcode, funct3, funct7) y una de inmediatos por formato, hechas por vos desde la spec. Te sirven tres veces: decodificador, ensamblador y desensamblador.</p>` },
      { heading: 'Elegí cómo vas a verificar desde el día uno', html: `<p>Si vas a usar riscv-formal, el CPU necesita la interfaz RVFI; es más fácil agregarla mientras lo escribís que después. Mirá la ${verif('verificación de este repo')} antes de empezar.</p>` },
    ],
    watch: [], exampleId: 'lui-auipc', focus: 'control',
    repo: [{ label: 'Especificación de RISC-V (unprivileged)', href: 'https://github.com/riscv/riscv-isa-manual', note: 'el capítulo de RV32I' }, R('pipeline/2_decode/illegal_check.v', 'module:illegal_check', 'illegal_check.v', 'qué es ilegal en este CPU')],
    next: 'build-monociclo',
  },
  {
    id: 'build-monociclo',
    title: 'Paso 2. Monociclo primero, después segmentar',
    level: 'Intermedio', track: 'construir', minutes: 6,
    intro: 'Un monociclo que funciona es la mejor referencia para el pipeline que todavía no funciona.',
    sections: [
      { heading: 'Por qué empezar simple', html: `<p>Con un monociclo probás decodificación, inmediatos, ALU y memoria sin pensar en hazards. Cuando segmentes, cualquier diferencia de resultado es culpa del pipeline, no de la ALU.</p>` },
      { heading: 'Segmentar con reglas fijas', html: `<p>Todos los registros de pipeline siguen las mismas reglas: <b>reset</b> los vacía, <b>enable = 0</b> congela todo, <b>flush</b> mete una burbuja y <b>stall</b> mantiene el valor. Escribilas una vez (acá, un solo <code>pipe_reg</code>) y usalas en las cuatro fronteras.</p>
<p>Una burbuja tiene que tener apagadas todas las señales que escriben (registro, memoria, halt). Con eso basta; el resto de los campos no importa.</p>` },
    ],
    watch: [{ block: 'idex', title: 'ID/EX', html: 'el registro más ancho: todo lo que EX necesita.' }],
    exampleId: 'datapath-etapas', focus: 'ifid',
    repo: [R('pipeline/regs/pipe_reg.v', 'module:pipe_reg', 'pipe_reg.v', 'las reglas comunes'), X('rtl/pipeline/regs/README.md', 'README de regs/')],
    next: 'build-hazards',
  },
  {
    id: 'build-hazards',
    title: 'Paso 3. Hazards de datos y de control',
    level: 'Intermedio', track: 'construir', minutes: 7,
    intro: 'Forwarding, el stall de load-use y el flush de saltos, escritos como unidades separadas y probadas por separado.',
    sections: [
      { heading: 'Separá decisión y datapath', html: `<p>forward_unit, hazard_unit y flush_unit son combinacionales y chicas: solo deciden. Los muxes y los registros están en el datapath. Así cada unidad tiene una especificación de una línea que se puede probar formalmente en segundos.</p>` },
      { heading: 'Errores típicos', html: `<ul><li>Olvidar <code>x0</code>: escribir en x0 no produce un valor, no hay que adelantarlo.</li>
<li>Olvidar <code>reg_write</code>: un store o un branch tienen "rd" (son bits del inmediato) y no escriben.</li>
<li>Prioridad al revés: si EX/MEM y MEM/WB escriben el mismo registro, gana el más reciente (EX/MEM).</li></ul>` },
      { heading: 'Medí antes de optimizar', html: `<p>Cualquier mejora de hazards cambia ciclos <i>y</i> frecuencia. En este repo, eliminar el stall de load-use bajaba el CPI pero también el reloj, y el resultado neto era peor. Una capa de rendimiento que compare variantes te ahorra discusiones.</p>` },
    ],
    watch: [{ block: 'hazard', title: 'Hazard', html: 'load-use.' }, { block: 'forward', title: 'Forward', html: 'las dos fuentes y su prioridad.' }, { block: 'flush', title: 'Flush', html: 'los saltos.' }],
    exampleId: 'forwarding-memwb-bypass', focus: 'forward',
    repo: [X('rtl/pipeline/flow/README.md', 'README de flow/', 'las tres unidades'), X('verif/variants/hazard_unit_precise.v', 'Una variante', 'cómo probar una idea sin tocar el RTL')],
    next: 'build-memorias',
  },
  {
    id: 'build-memorias',
    title: 'Paso 4. Memorias en la FPGA',
    level: 'Intermedio', track: 'construir', minutes: 5,
    intro: 'Si la memoria responde en el mismo ciclo o en el siguiente cambia el diseño de IF y de MEM.',
    sections: [
      { heading: 'BRAM o LUTRAM', html: `<p>Una <b>BRAM</b> es grande y gratis, pero entrega el dato un ciclo después: hay que adelantar la dirección o agregar una etapa. Una <b>LUTRAM</b> responde en el mismo ciclo y gasta LUTs. Este repo usa LUTRAM: las dos memorias de 1 KB cuestan unas 600 LUT y el pipeline queda de 5 etapas limpias.</p>` },
      { heading: 'Stores parciales', html: `<p><code>sb</code> y <code>sh</code> escriben solo algunos bytes de la palabra: la memoria necesita habilitación por byte. Y los loads de byte y media palabra extienden el signo o con ceros según la instrucción. Definí qué pasa con un acceso desalineado (acá: trap).</p>` },
    ],
    watch: [{ block: 'dmem', title: 'dmem', html: 'lectura asíncrona y escritura por byte.' }],
    exampleId: 'loads-stores-byte-half', focus: 'dmem',
    repo: [R('pipeline/4_memory/dmem.v', 'module:dmem', 'dmem.v'), X('rtl/pipeline/4_memory/README.md', 'README de 4_memory/')],
    next: 'build-debug',
  },
  {
    id: 'build-debug',
    title: 'Paso 5. Hablar con la placa',
    level: 'Intermedio', track: 'construir', minutes: 6,
    intro: 'Sin una forma de cargar programas y leer el estado, el CPU en la FPGA es una caja negra.',
    sections: [
      { heading: 'Diseñá el protocolo antes que la FSM', html: `<p>Pocos comandos, de un byte, y respuestas que confirmen cada uno (<code>K</code> listo, <code>H</code> detenido, <code>E</code> error, <code>?</code> desconocido). Pensá los casos borde: un programa más grande que la imem, un comando en medio de una carga, pedir un dump mientras corre.</p>` },
      { heading: 'El estado como un mapa de palabras', html: `<p>Un bus de debug "dirección → palabra" deja que la debug unit lea cualquier cosa del CPU sin conocer su estructura. Agregá siempre al final: el host depende del orden. Incluí una palabra de versión del hardware para saber qué bitstream tiene la placa.</p>` },
      { heading: 'El host en tres capas', html: `<p>Presentación (GUI o CLI), protocolo y puerto serie separados. Así el protocolo se prueba contra un simulador sin placa.</p>` },
    ],
    watch: [{ block: 'debug', title: 'Debug unit', html: 'probala con un testbench que hable por la UART.' }],
    exampleId: 'halt-ebreak', focus: 'debug',
    repo: [X('rtl/debug/README.md', 'README de debug/'), X('host/lib/debug_protocol.py', 'debug_protocol.py', 'el protocolo del lado de la PC'), X('verif/system/README.md', 'El testbench del sistema')],
    next: 'build-timing',
  },
  {
    id: 'build-timing',
    title: 'Paso 6. Cerrar timing',
    level: 'Avanzado', track: 'construir', minutes: 6,
    intro: 'Que la simulación dé bien no dice nada de si el circuito llega a tiempo a la frecuencia que elegiste.',
    sections: [
      { heading: 'Primero, que todo esté restringido', html: `<p>El STA solo analiza caminos con restricción. Un camino sin restricción "pasa" sin haberse mirado. Exigí que <code>check_timing</code> no encuentre nada sin restringir, y excluí los puertos asíncronos (UART, botones, LEDs) a propósito y con el motivo escrito.</p>` },
      { heading: 'Buscá la frecuencia, no la adivines', html: `<p>Implementá a 50, 60, 70… MHz hasta que falle. La estimación por el margen (1 / (período − WNS)) no alcanza: cada frecuencia produce otra ubicación y otro ruteo. Acá el 77 % del retardo del camino crítico es ruteo.</p>` },
      { heading: 'Mirá qué hay en el camino crítico', html: `<p>Te dice qué decisión de microarquitectura está costando. En este repo el camino era dmem → forwarding → ALU; sacar la dmem del forwarding subió el reloj de 50 a 70 MHz sin cambiar un ciclo.</p>` },
    ],
    watch: [{ block: 'clkrst', title: 'CLK/RST', html: 'el MMCM que genera los 70 MHz.' }],
    exampleId: 'load-use', focus: 'alu',
    repo: [X('verif/fpga/README.md', 'README de verif/fpga/', 'chequeos de síntesis e implementación, y fmax'), X('constraints/nexys4ddr_top.xdc', 'nexys4ddr_top.xdc', 'las restricciones')],
    next: 'build-verif',
  },
  {
    id: 'build-verif',
    title: 'Paso 7. Verificar por capas',
    level: 'Avanzado', track: 'construir', minutes: 6,
    intro: 'Cada capa responde una pregunta distinta. Corrélas en el orden del flujo y con un solo comando.',
    sections: [
      { heading: 'De lo más barato a lo más real', html: `<p>Propiedades formales por módulo (segundos), el CPU contra la ISA con riscv-formal (minutos), la suite oficial en simulación, el sistema por la UART, síntesis, timing y por último la placa comparada contra la simulación.</p>` },
      { heading: 'Compará contra algo independiente', html: `<p>Valores esperados escritos a mano repiten tus errores. Usá la especificación (riscv-formal), el modelo oficial (Sail, vía riscv-arch-test) o la simulación del propio RTL cuando lo que probás es la placa.</p>` },
      { heading: 'Probá que tus pruebas sirven', html: `<p>Inyectá errores a propósito (mutantes) y exigí que fallen. Y no aceptes "no corrió" como "pasó".</p>
<p>Las capas, las herramientas y sus repos están en la sección ${verif('Verificación')}.</p>` },
    ],
    watch: [], exampleId: 'programa-completo', focus: 'memwb',
    repo: [X('verif/README.md', 'README de verif/', 'las 12 capas'), X('verif/run.sh', 'run.sh', 'el punto de entrada')],
    next: null,
  },
];
