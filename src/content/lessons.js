// lessons.js - lecciones guiadas. Sin DOM.
//
// Cada lección explica un problema de diseño, las opciones y cómo elegir; el CPU de ejemplo (project_4) cierra cada una. El detalle bit a bit vive en
// el repo (READMEs y RTL) y en el inspector de cada módulo; acá se enlaza en vez de repetirse.
//   { id, title, level, track: 'entender'|'construir', minutes, intro,
//     sections: [{ heading, html }], watch: [{ block, title, html }], exampleId, focus, repo: [{label, href, note}], next }
// Bloques 3D: pc imem ifid control regfile immgen idex fwdMuxA fwdMuxB aluSrcMux alu branch exmem dmem wbMux memwb
// hazard forward flush illegal trap debug uart clkrst (ver CONTRACT.md).
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
    title: 'Cómo funciona un CPU segmentado',
    blurb: 'Los problemas que aparecen al construir un CPU de 5 etapas, las formas de resolverlos y cómo elegir entre ellas. Cada lección cierra con lo que se eligió en el CPU de ejemplo y lo que costó.',
  },
  construir: {
    id: 'construir',
    title: 'Construí tu propio RISC-V',
    blurb: 'Los pasos para llegar a un RV32I propio, verificado y corriendo en una FPGA, en el orden en que conviene darlos.',
  },
};

// Nota "en el CPU de ejemplo": el caso concreto, después de la idea general.
const ej = (html) => `<p class="ej-note"><b>En el CPU de ejemplo:</b> ${html}</p>`;

export const LESSONS = [
  // ============================================================ ENTENDER
  {
    id: 'isa',
    title: 'El contrato: ISA y microarquitectura',
    level: 'Básico', track: 'entender', minutes: 5,
    intro: 'Antes de diseñar hardware hay que separar dos cosas: qué promete el CPU (la ISA) y cómo lo cumple (la microarquitectura).',
    sections: [
      { heading: 'Qué fija la ISA y qué elegís vos', html: `<p>La <b>ISA</b> dice qué hace cada instrucción. La <b>microarquitectura</b> decide cómo: monociclo, multiciclo o pipeline, con o sin predictor. Un programa tiene que dar el mismo resultado en cualquiera de ellas.</p>
<p>De ahí sale la regla que guía todo el diseño y la verificación: <b>la microarquitectura puede cambiar cuándo pasan las cosas, nunca qué resultado dan</b>.</p>` },
      { heading: 'Elegí un subconjunto, y definí qué pasa con el resto', html: `<p>RV32I sin CSRs es un buen comienzo: unas 40 instrucciones, sin interrupciones ni modos de privilegio. Lo que quede afuera tiene que tener un comportamiento definido, no "lo que salga". Sin CSRs no hay manejador al que saltar, así que una excepción puede ser un <b>fatal trap</b>: el CPU se detiene e informa la causa. La spec lo permite.</p>
${ej('RV32I sin arquitectura privilegiada. Una instrucción ilegal, un acceso desalineado o fuera de memoria detienen el CPU, y la debug unit informa la causa.')}` },
      { heading: 'Aprovechá que los campos no se mueven', html: `<p><code>rs1</code>, <code>rs2</code> y <code>rd</code> ocupan los mismos bits en todos los formatos, así que podés leer el banco de registros <i>antes</i> de saber qué instrucción es. Tené en cuenta el costo: en formatos sin rs2 esos bits son parte del inmediato, y una lógica que los compare sin mirar el formato ve dependencias que no existen.</p>` },
    ],
    watch: [{ block: 'control', title: 'Control', html: 'decodifica el opcode y arma las señales que viajan con la instrucción.' }],
    exampleId: 'lui-auipc', focus: 'control',
    repo: [X('README.md', 'README del CPU de ejemplo', 'el CPU, la placa y cómo correrlo'), R('pipeline/2_decode/control.v', 'module:control', 'control.v', 'una tabla de decodificación completa')],
    next: 'sistema',
  },
  {
    id: 'sistema',
    title: 'Alrededor del CPU: reloj, memoria y un canal a la PC',
    level: 'Básico', track: 'entender', minutes: 5,
    intro: 'Un CPU solo no sirve: necesita un reloj, memorias y una forma de cargarle programas y mirar qué hizo.',
    sections: [
      { heading: 'Separá en capas', html: `<p>Lo mínimo es: PC → puerto serie (UART) → un módulo que interpreta comandos (debug unit) → CPU. Que cada bloque sepa una sola cosa (la UART no entiende comandos, el CPU no sabe que hay una PC) es lo que te permite probar cada parte sola y después el sistema entero.</p>` },
      { heading: 'La frecuencia la decide el camino crítico', html: `<p>No uses el oscilador de la placa porque sí: generá el reloj con un MMCM/PLL y buscá la frecuencia más alta que cierra timing en el peor caso, implementando en pasos (50, 60, 70… MHz). Dejá todo parametrizado por la frecuencia (por ejemplo, el divisor de la UART), así cambiarla es tocar un número.</p>
${ej('70 MHz a partir de los 100 MHz de la placa. A 80 MHz el camino forwarding → ALU → decisión del salto ya no entra en el período.')}` },
      { heading: 'Memorias: ¿el dato llega en el mismo ciclo o en el siguiente?', html: `<p>Una memoria de lectura asíncrona (LUTRAM en una FPGA) responde en el mismo ciclo y mantiene IF y MEM en una etapa cada una, pero gasta LUTs y es chica. Una BRAM es grande y gratis, pero el dato llega un ciclo después: hay que adelantar la dirección o sumar una etapa. Decidilo antes de diseñar IF y MEM.</p>
${ej('imem y dmem de 1 KB en LUTRAM; alcanza para programas didácticos.')}` },
    ],
    watch: [
      { block: 'uart', title: 'UART', html: 'convierte bytes en la señal serie del cable.' },
      { block: 'debug', title: 'Debug unit', html: 'carga, corre, pausa y vuelca el CPU.' },
      { block: 'clkrst', title: 'CLK/RST', html: 'el reloj y el reset de todo el sistema.' },
    ],
    exampleId: 'halt-ebreak', focus: 'debug',
    repo: [R('top/top_riscv.v', 'module:top_riscv', 'top_riscv.v', 'un sistema completo en la placa'), X('rtl/top/README.md', 'README de top/', 'reloj, LEDs y display')],
    next: 'pipeline',
  },
  {
    id: 'pipeline',
    title: 'Cinco etapas: por qué segmentar',
    level: 'Básico', track: 'entender', minutes: 6,
    intro: 'Segmentar no hace más rápida a una instrucción: hace que terminen más instrucciones por segundo.',
    sections: [
      { heading: 'La idea', html: `<p>Un monociclo necesita un ciclo tan largo como la instrucción más lenta. Partiendo el trabajo en 5 etapas (IF, ID, EX, MEM, WB) con registros entre ellas, el ciclo se acorta a la etapa más lenta y hay hasta 5 instrucciones en vuelo a la vez. El ideal es una instrucción por ciclo (CPI = 1); lo que te aleja de eso son los hazards de las próximas lecciones.</p>
${ej('CPI entre 1,34 y 1,62 medido en la placa.')}` },
      { heading: 'Todo viaja con la instrucción', html: `<p>Los registros de pipeline llevan la instrucción con todo lo ya calculado: control, operandos, registro destino. Cuando WB escribe <code>rd</code>, tiene que usar el <code>rd</code> que viajó con <i>esa</i> instrucción, no el de la que está ahora en ID. Es el error más común al segmentar un monociclo.</p>` },
      { heading: 'Evitá los hazards estructurales desde el diseño', html: `<p>Si IF y MEM comparten una memoria, o el banco de registros no puede leer y escribir en el mismo ciclo, dos etapas se pelean por un recurso. Con memorias separadas (Harvard) y un banco de 2 lecturas + 1 escritura con bypass, ese tipo de hazard no existe y solo quedan los de datos y de control.</p>` },
    ],
    watch: [{ block: 'ifid', title: 'IF/ID', html: 'el primer registro de pipeline: la instrucción recién leída.' }, { block: 'memwb', title: 'MEM/WB', html: 'el último: el resultado listo para escribirse.' }],
    exampleId: 'datapath-etapas', focus: 'pc',
    repo: [X('rtl/pipeline/README.md', 'README de pipeline/', 'las etapas y los riesgos'), R('pipeline/riscv_pipeline.v', 'module:riscv_pipeline', 'riscv_pipeline.v', 'el pipeline completo')],
    next: 'forwarding',
  },
  {
    id: 'forwarding',
    title: 'Forwarding: usar un resultado antes de escribirlo',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'El resultado de una instrucción existe ciclos antes de llegar al banco de registros. El forwarding lo toma de donde está.',
    sections: [
      { heading: 'El problema', html: `<p><code>add x1,…</code> seguido de <code>sub …,x1</code>: cuando <code>sub</code> lee x1 en ID, <code>add</code> todavía está en EX. Frenar hasta que <code>add</code> escriba costaría 2 o 3 ciclos por dependencia, y en código real la mayoría de las instrucciones dependen de una anterior.</p>` },
      { heading: 'La solución, en tres distancias', html: `<ul><li><b>Distancia 1</b>: el dato está en EX/MEM; un mux lo lleva a la ALU.</li>
<li><b>Distancia 2</b>: está en MEM/WB; mismo mecanismo.</li>
<li><b>Distancia 3</b>: se está escribiendo en el banco en este ciclo; el regfile lo devuelve directo (bypass).</li></ul>
<p>Si las dos fuentes tienen el mismo registro, gana EX/MEM: es la escritura más reciente. No olvides excluir x0 y las instrucciones que no escriben.</p>` },
      { heading: 'Lo que cuesta', html: `<p>0 ciclos, pero comparadores y un mux justo antes de la ALU, que suele ser el camino crítico. Cada fuente que agregues a ese mux puede bajar la frecuencia: mirá el timing antes de sumar una.</p>
${ej('el mux de forwarding está en el camino crítico, y por eso el dato de un load no se adelanta desde MEM (próxima lección).')}` },
    ],
    watch: [{ block: 'forward', title: 'Forward unit', html: 'compara los registros fuente de EX con los destinos de MEM y WB.' }, { block: 'fwdMuxA', title: 'Mux A', html: 'elige entre el regfile, EX/MEM y MEM/WB.' }],
    exampleId: 'forwarding-memwb-bypass', focus: 'forward',
    repo: [R('pipeline/flow/forward_unit.v', 'module:forward_unit', 'forward_unit.v'), X('verif/formal/forward_unit/README.md', 'Cómo se prueba formalmente', 'el operando de EX es siempre el valor más reciente')],
    next: 'load-use',
  },
  {
    id: 'load-use',
    title: 'Load-use: frenar o adelantar',
    level: 'Intermedio', track: 'entender', minutes: 7,
    intro: 'El dato de un load aparece al final de MEM. Si la instrucción siguiente lo necesita en EX, alguien tiene que esperar.',
    sections: [
      { heading: 'Las opciones', html: `<ul><li><b>Stall de un ciclo</b>: si la instrucción en EX es un load y su destino coincide con un fuente de la de ID, congelás PC e IF/ID y metés una burbuja en ID/EX. Lo estándar.</li>
<li><b>Adelantar desde MEM</b>: si la memoria se lee en el mismo ciclo, el dato está al final de MEM y se puede llevar a EX sin frenar. Ahorra ciclos, pero mete la lectura de memoria en el camino crítico.</li>
<li><b>Dejarlo al compilador</b> (load delay slot del MIPS I): RISC-V no lo permite.</li></ul>` },
      { heading: 'Cómo decidir: ciclos y frecuencia a la vez', html: `<p>El tiempo de ejecución es instrucciones × CPI ÷ frecuencia. Bajar el CPI no sirve si baja más la frecuencia. Implementá las dos variantes y medí las dos variables; para eso te sirve una ${verif('capa de rendimiento')} que compare variantes con el mismo programa.</p>
${ej('sin stall, 60 MHz; con stall y el load adelantado solo desde WB, 70 MHz. El stall cuesta como mucho 8 % de ciclos y el reloj es 17 % más rápido: ganó en todos los programas.')}` },
      { heading: 'Detección precisa o barata', html: `<p>Comparar los campos crudos <code>rs1</code>/<code>rs2</code> es barato, pero frena aunque la instrucción no use ese campo (un <code>addi</code> cuyo inmediato coincide con el destino del load). Mirar si la instrucción usa cada fuente lo arregla. Antes de complicar la lógica, medí cuántos stalls falsos hay.</p>
${ej('la detección precisa ahorraba 0,2 % de ciclos en la suite oficial y nada en los programas. No se adoptó.')}` },
    ],
    watch: [{ block: 'hazard', title: 'Hazard unit', html: 'detecta load-use en ID.' }, { block: 'idex', title: 'ID/EX', html: 'recibe la burbuja.' }],
    exampleId: 'load-use', focus: 'hazard',
    repo: [R('pipeline/flow/hazard_unit.v', 'module:hazard_unit', 'hazard_unit.v'), X('verif/README.md', 'La evaluación de las dos opciones', 'tablas de fmax y MIPS')],
    next: 'saltos',
  },
  {
    id: 'saltos',
    title: 'Saltos: dónde resolverlos',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'Cuando el CPU se entera de que un salto se toma, ya buscó instrucciones que no tenía que ejecutar. Cuántas depende de dónde lo resuelvas.',
    sections: [
      { heading: 'Las opciones', html: `<ul><li><b>En EX</b>: usás la ALU y el forwarding que ya existen. Cuesta 2 ciclos por salto tomado.</li>
<li><b>En ID</b>: 1 ciclo, pero necesitás un comparador propio, forwarding hacia ID y frenar si el operando viene de un load. Alarga ID.</li>
<li><b>Predecir</b> (BTFN, bimodal, BTB): 0 ciclos si acierta, a cambio de tablas y lógica de recuperación.</li></ul>
<p>Mientras el salto no se resuelve, seguir en secuencia equivale a predecir "no tomado": un salto no tomado no cuesta nada.</p>` },
      { heading: 'El flush', html: `<p>Si el salto se toma, los registros de pipeline que recibieron instrucciones del camino equivocado se convierten en burbujas y el PC carga el destino. Como esas instrucciones todavía no escribieron nada, descartarlas no deja rastro. RISC-V no tiene delay slots, así que el descarte es obligatorio.</p>` },
      { heading: 'Cómo decidir', html: `<p>Medí qué fracción de los ciclos perdidos se va en saltos. Si domina, es la próxima mejora que conviene, pero comprobá cuánto baja la frecuencia antes de adoptarla.</p>
${ej('resolución en EX. Los saltos son entre el 70 y el 98 % de los ciclos perdidos; en la criba, pasar a 1 ciclo bajaría el CPI de 1,42 a 1,22.')}` },
    ],
    watch: [{ block: 'branch', title: 'Branch', html: 'decide si se toma y calcula el destino.' }, { block: 'flush', title: 'Flush', html: 'vacía IF/ID e ID/EX.' }],
    exampleId: 'branch-flush', focus: 'flush',
    repo: [R('pipeline/flow/flush_unit.v', 'module:flush_unit', 'flush_unit.v'), X('RESULTADOS.md', 'De dónde salen los ciclos perdidos', 'desglose del CPI por causa')],
    next: 'traps',
  },
  {
    id: 'traps',
    title: 'Excepciones: detenerse sin dejar rastro',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'Una instrucción ilegal, un acceso desalineado o un ebreak tienen que detener el CPU en el lugar justo.',
    sections: [
      { heading: 'Qué significa detenerse bien', html: `<p>Una excepción es <b>precisa</b> si todo lo anterior termina, la instrucción que falla <b>no escribe nada</b> y nada posterior se ejecuta. Así el estado que se lee después es exactamente el que dice la spec.</p>` },
      { heading: 'Dónde detectar y dónde actuar', html: `<p>Detectá cada causa donde tengas la información (ilegal en ID, una dirección inválida en EX), pero actuá en una sola etapa. Una instrucción que falla puede estar en el camino equivocado de un salto: si la descarta el flush, no tiene que haber trap.</p>
<p>Un salto a una dirección desalineada es un trap <b>del salto</b>: el PC nunca llega a quedar desalineado.</p>` },
      { heading: 'Si no lo definís, es un bug', html: `<p>Lo que el diseño no contempla termina haciendo algo. Una herramienta formal lo encuentra porque prueba entradas que no se te ocurrieron.</p>
${ej('la primera versión no tenía traps. riscv-formal encontró que un load desalineado escribía <code>rd</code> y que las codificaciones inválidas se ejecutaban: 8 de 44 chequeos fallaban. Con los traps, 45/45.')}` },
      { heading: 'Pausar sin tocar el reloj', html: `<p>Para pausar el CPU desde afuera usá un enable que llegue a cada registro, nunca una compuerta sobre el reloj. Cortar el reloj con lógica genera glitches y skew; el enable las FPGAs lo implementan gratis en cada flip-flop.</p>` },
    ],
    watch: [{ block: 'illegal', title: 'Illegal', html: 'marca en ID las codificaciones que no son RV32I.' }, { block: 'trap', title: 'Trap', html: 'detecta en EX saltos y accesos desalineados o fuera de memoria.' }],
    exampleId: 'trap-desalineado', focus: 'trap',
    repo: [R('pipeline/flow/trap_unit.v', 'module:trap_unit', 'trap_unit.v'), R('pipeline/2_decode/illegal_check.v', 'module:illegal_check', 'illegal_check.v'), X('rtl/pipeline/README.md', 'Las causas', 'códigos de mcause y dónde se detecta cada una')],
    next: 'debug-uart',
  },
  {
    id: 'debug-uart',
    title: 'Un canal de debug: cargar y observar',
    level: 'Intermedio', track: 'entender', minutes: 6,
    intro: 'Sin una forma de cargar programas y leer el estado interno, el CPU en la FPGA es una caja negra.',
    sections: [
      { heading: 'Un protocolo mínimo', html: `<p>Pocos comandos de un byte (cargar, un ciclo, correr, pausar, reset, volcar) y una respuesta por comando hacen trivial la máquina de estados y el programa de la PC. Volcá el estado como una lista de palabras con el CPU congelado: siempre recibís una foto coherente, y leer el estado es <b>observar</b> el hardware, no simularlo.</p>
${ej('seis comandos; el volcado trae 90 palabras: pipeline, registros, dmem, causa del trap y versión del hardware.')}` },
      { heading: 'Elegir el baud rate', html: `<p>El divisor del baud rate es entero, así que el error depende de cuánto se trunca. Con un divisor grande el error es chico a cualquier frecuencia; a velocidades altas se acerca a lo que tolera una UART (alrededor del 2-3 %). Calculalo para tu reloj.</p>
${ej('19200 baudios: divisor 227 a 70 MHz y 0,38 % de error. A 115200 llegaría al 3,7 %.')}` },
      { heading: 'Colas y sincronizador', html: `<p>Un byte por la línea tarda decenas de miles de ciclos: una cola chica desacopla los dos ritmos. Y la línea RX no tiene relación con tu reloj: pasala por dos flip-flops en cadena antes de usarla, para que la metaestabilidad no llegue a la lógica.</p>` },
    ],
    watch: [{ block: 'debug', title: 'Debug unit', html: 'la FSM que interpreta los comandos.' }, { block: 'uart', title: 'UART', html: 'sobremuestreo ×16 para leer cada bit en su centro.' }],
    exampleId: 'halt-ebreak', focus: 'debug',
    repo: [X('rtl/debug/README.md', 'README de debug/', 'un protocolo completo'), X('rtl/uart/README.md', 'README de uart/'), X('host/README.md', 'El programa de la PC', 'GUI y línea de comandos')],
    next: 'rendimiento',
  },
  {
    id: 'rendimiento',
    title: 'Medir: CPI, frecuencia y recursos',
    level: 'Avanzado', track: 'entender', minutes: 5,
    intro: 'Cada decisión de las lecciones anteriores mueve alguno de estos números. Medilos en la placa, no los supongas.',
    sections: [
      { heading: 'Tiempo = instrucciones × CPI ÷ frecuencia', html: `<p>Separá el CPI por causa (saltos, load-use, memoria) para saber dónde se pierden ciclos, y mirá siempre la frecuencia al lado: una mejora de CPI que baja el reloj puede ser una pérdida neta.</p>
${ej('a 70 MHz el ideal son 70 MIPS; en la placa se miden 43 a 52 MIPS (CPI 1,34 a 1,62). La pérdida es casi toda de saltos tomados.')}` },
      { heading: 'Recursos y potencia', html: `<p>Un RV32I segmentado entra holgado en cualquier FPGA de laboratorio. Lo que conviene revisar es <i>cómo</i> se implementó cada memoria (flip-flops, LUTRAM o BRAM), porque eso define latencias y si el reset puede borrarla en un ciclo.</p>
${ej('3222 LUT (5 %) y 1863 FF (1,5 %) del Artix-7, sin BRAM ni DSP, y unos 0,025 W de potencia dinámica.')}` },
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
      { heading: 'Decidí el alcance', html: `<p>RV32I sin CSRs es un buen punto de partida: unas 40 instrucciones y ninguna interrupción. Lo que quede afuera tiene que tener un comportamiento definido (por ejemplo, un trap de instrucción ilegal), no "lo que salga".</p>` },
      { heading: 'Armá tus tablas', html: `<p>Una tabla de codificación (opcode, funct3, funct7) y una de inmediatos por formato, hechas por vos desde la spec. Te sirven tres veces: decodificador, ensamblador y desensamblador.</p>` },
      { heading: 'Elegí cómo vas a verificar desde el día uno', html: `<p>Si vas a usar riscv-formal, el CPU necesita la interfaz RVFI; es más fácil agregarla mientras lo escribís que después. Mirá ${verif('cómo verificar')} antes de empezar.</p>` },
    ],
    watch: [], exampleId: 'lui-auipc', focus: 'control',
    repo: [{ label: 'Especificación de RISC-V (unprivileged)', href: 'https://github.com/riscv/riscv-isa-manual', note: 'el capítulo de RV32I' }, R('pipeline/2_decode/illegal_check.v', 'module:illegal_check', 'illegal_check.v', 'qué es ilegal en el CPU de ejemplo')],
    next: 'build-monociclo',
  },
  {
    id: 'build-monociclo',
    title: 'Paso 2. Monociclo primero, después segmentar',
    level: 'Intermedio', track: 'construir', minutes: 6,
    intro: 'Un monociclo que funciona es la mejor referencia para el pipeline que todavía no funciona.',
    sections: [
      { heading: 'Por qué empezar simple', html: `<p>Con un monociclo probás decodificación, inmediatos, ALU y memoria sin pensar en hazards. Cuando segmentes, cualquier diferencia de resultado es culpa del pipeline, no de la ALU.</p>` },
      { heading: 'Segmentar con reglas fijas', html: `<p>Todos los registros de pipeline siguen las mismas reglas: <b>reset</b> los vacía, <b>enable = 0</b> congela todo, <b>flush</b> mete una burbuja y <b>stall</b> mantiene el valor. Escribilas una vez (un solo módulo de registro de pipeline) y usalas en las cuatro fronteras.</p>
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
      { heading: 'Medí antes de optimizar', html: `<p>Cualquier mejora de hazards cambia ciclos <i>y</i> frecuencia. En el CPU de ejemplo, eliminar el stall de load-use bajaba el CPI pero también el reloj, y el resultado neto era peor. Una capa de rendimiento que compare variantes te ahorra discusiones.</p>` },
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
      { heading: 'BRAM o LUTRAM', html: `<p>Una <b>BRAM</b> es grande y gratis, pero entrega el dato un ciclo después: hay que adelantar la dirección o agregar una etapa. Una <b>LUTRAM</b> responde en el mismo ciclo y gasta LUTs. En el CPU de ejemplo, dos memorias de 1 KB en LUTRAM cuestan unas 600 LUT y el pipeline queda de 5 etapas limpias.</p>` },
      { heading: 'Stores parciales', html: `<p><code>sb</code> y <code>sh</code> escriben solo algunos bytes de la palabra: la memoria necesita habilitación por byte. Y los loads de byte y media palabra extienden el signo o con ceros según la instrucción. Definí qué pasa con un acceso desalineado (soportarlo o generar un trap).</p>` },
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
      { heading: 'Buscá la frecuencia, no la adivines', html: `<p>Implementá a 50, 60, 70… MHz hasta que falle. La estimación por el margen (1 / (período − WNS)) no alcanza: cada frecuencia produce otra ubicación y otro ruteo. En el CPU de ejemplo, el 77 % del retardo del camino crítico es ruteo.</p>` },
      { heading: 'Mirá qué hay en el camino crítico', html: `<p>Te dice qué decisión de microarquitectura está costando. En el CPU de ejemplo el camino era dmem → forwarding → ALU; sacar la dmem del forwarding subió el reloj de 50 a 70 MHz sin cambiar un ciclo.</p>` },
    ],
    watch: [{ block: 'clkrst', title: 'CLK/RST', html: 'el MMCM que genera el reloj.' }],
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
<p>Las capas, las herramientas y sus repos están en ${verif('Cómo verificar un CPU')}.</p>` },
    ],
    watch: [], exampleId: 'programa-completo', focus: 'memwb',
    repo: [X('verif/README.md', 'README de verif/', 'las 12 capas'), X('verif/run.sh', 'run.sh', 'el punto de entrada')],
    next: null,
  },
];
