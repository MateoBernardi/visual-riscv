// alternatives.js - alternativas de diseño por bloque. Sin DOM.

const A = (name, summary, pros, cons, area, cycles, usedIn) => ({ name, summary, pros, cons, area, cycles, usedIn });

const pcAlt = {
  title: 'Contador de programa y predicción de saltos',
  current: '<p>El PC es un registro de 32 bits con <code>pc_next = redirect ? redirect_target : pc + 4</code>. No hay predictor: se asume implícitamente "no tomado" y los saltos se resuelven en EX, con 2 burbujas cuando se toman.</p>',
  options: [
    A('Predicción estática BTFN', 'Backward-Taken, Forward-Not-taken: los saltos hacia atrás (loops) se predicen tomados y los hacia adelante no. Requiere decodificar el signo del offset ya en IF/ID y un sumador de destino temprano.',
      ['Casi sin hardware extra', 'Acierta ~65-80% en código con loops'], ['Necesita calcular el destino en ID/IF', 'Sigue fallando en saltos hacia adelante tomados'],
      'bajo: un sumador y un bit de signo', 'Penalidad 0-1 si acierta; 2 si falla', 'SiFive E-series, muchos cores embebidos'),
    A('Bimodal de 2 bits', 'Tabla de contadores saturados de 2 bits indexada por bits del PC. Aprende el comportamiento reciente de cada salto.',
      ['Buena precisión (85-90%)', 'Hardware simple'], ['Necesita saber que la instrucción es un branch y su destino (BTB)', 'Aliasing entre saltos'],
      'medio: tabla de N entradas x 2 bits', 'Reduce la penalidad promedio a ~0,2-0,5 ciclos', 'Intel Pentium (tempranos), ARM Cortex-A5, Rocket'),
    A('gshare / predictores correlacionados', 'Indexa la tabla XOReando el PC con un historial global de resultados de saltos, capturando correlaciones entre branches.',
      ['Precisión superior al 93%', 'Ideal para pipelines profundos'], ['Más área y lógica', 'Recuperación más compleja ante fallos'],
      'medio-alto', 'Penalidad efectiva < 0,1 ciclos/salto', 'BOOM, Intel P6 y posteriores, ARM Cortex-A'),
    A('BTB + RAS', 'Branch Target Buffer: cachea destinos de saltos por PC para predecir ya en IF. La Return Address Stack predice los <code>ret</code>.',
      ['Predicción en la misma etapa IF: 0 burbujas si acierta', 'La RAS acierta casi siempre los retornos'], ['Mucha área (CAM/SRAM)', 'Muy complejo de verificar'],
      'alto', 'Penalidad 0 si acierta', 'VexRiscv (opcional), BOOM, Cortex-A, Intel/AMD'),
    A('Caché de instrucciones + prefetch buffer', 'En vez de leer una BRAM/LUTRAM directamente, se interpone una I-cache o una cola de prefetch que desacopla el fetch de la memoria.',
      ['Permite memorias externas lentas', 'Oculta latencias de fetch'], ['Aparece el miss de caché', 'Mayor complejidad'],
      'medio-alto', 'Hit: 0 ciclos; miss: decenas de ciclos', 'Cortex-A, SiFive U-series, VexRiscv con caché, Ibex (prefetch buffer)'),
    A('Salto retardado (delayed branch)', 'La instrucción siguiente al salto siempre se ejecuta (delay slot). El compilador intenta llenarla con trabajo útil.',
      ['Sin burbujas si el slot se llena', 'Hardware muy simple'], ['Expone la microarquitectura al ISA', 'Complica el código y la compatibilidad'],
      'bajo', 'Penalidad 0-1', 'MIPS R2000/R3000, SPARC, PA-RISC'),
  ],
};

const regfileAlt = {
  title: 'Banco de registros',
  current: '<p>32 registros de 32 bits, 2 lecturas asincrónicas y 1 escritura sincrónica. <code>x0</code> vale 0. Tiene un bypass combinacional WB→ID (<code>BYPASS=1</code>) que resuelve la dependencia a distancia 3. Se infiere como LUTRAM / flip-flops en la FPGA.</p>',
  options: [
    A('Escritura en primera mitad / lectura en segunda', 'En el clásico MIPS, el regfile escribe en el flanco de subida y lee en el de bajada del mismo ciclo, resolviendo el hazard sin lógica de bypass.',
      ['Sin comparadores de bypass', 'Muy simple'], ['Acorta el tiempo útil de cada fase a medio ciclo', 'Complica el timing'], 'bajo', '0 ciclos extra', 'MIPS R2000, textbook Patterson-Hennessy'),
    A('LUTRAM vs flip-flops vs BRAM', 'En una FPGA, 32x32 bits caben en LUTRAM distribuida (lectura asincrónica). Una BRAM tiene lectura sincrónica: obliga a leer un ciclo antes o a bypasear.',
      ['LUTRAM: lectura inmediata, pocos recursos', 'BRAM: ahorra LUTs en regfiles grandes'], ['Flip-flops: gran consumo de área y mux', 'BRAM: latencia de lectura de 1 ciclo'], 'bajo-medio', 'BRAM puede añadir 1 etapa', 'PicoRV32 (opciones), VexRiscv, SERV (usa BRAM)'),
    A('Más puertos de lectura/escritura', 'Un core superescalar de ancho N necesita 2N lecturas y N escrituras por ciclo.',
      ['Permite emitir varias instrucciones por ciclo'], ['El área y el retardo crecen casi cuadráticamente'], 'muy alto', 'IPC > 1', 'BOOM, Intel/AMD, ARM Cortex-A7x'),
    A('Ventanas de registros', 'Cada llamada a función rota una "ventana" de registros, evitando guardar y restaurar al stack.',
      ['Llamadas muy rápidas'], ['Banco gigante, overflow/underflow traps', 'Cambio de contexto caro'], 'alto', 'Ahorra decenas de ciclos por llamada', 'SPARC, Berkeley RISC I/II, Intel i960'),
    A('Banco reducido (RV32E)', 'Solo 16 registros. Reduce el área a la mitad a cambio de más spills al stack.',
      ['Mitad de área', 'Ideal para microcontroladores'], ['No compatible con toda la ABI estándar', 'Más accesos a memoria'], 'bajo', 'Algo más de loads/stores', 'Ibex (RV32E), SERV, PicoRV32'),
  ],
};

const fwdAlt = {
  title: 'Forwarding y muxes de operandos',
  current: '<p>Dos muxes de 3 entradas (<code>fwd_a_val</code>, <code>fwd_b_val</code>) controlados por forward_unit: <code>00</code> regfile, <code>10</code> EX/MEM (<code>mem_result</code>, con prioridad), <code>01</code> MEM/WB (<code>wb_result</code>). Después, <code>alu_a</code> elige el PC para AUIPC y <code>alu_b</code> elige el inmediato con <code>alu_src</code>. Las comparaciones usan <code>inst[19:15]</code> e <code>inst[24:20]</code> sin mirar el formato.</p>',
  options: [
    A('Sin forwarding (solo stalls)', 'Si hay dependencia RAW, se detiene el pipeline hasta que el productor escriba el regfile. Es el modo alternativo de la GUI.',
      ['Hardware mínimo, camino crítico corto', 'Fácil de verificar'], ['Hasta 2 burbujas por dependencia', 'CPI mucho mayor en código real'], 'bajo', 'CPI ~1,3-1,6 típico', 'Cores mínimos, MIPS I teórico'),
    A('Red de bypass completa', 'Lo que hace este diseño, extendido: más fuentes de forwarding (desde la salida de la ALU en el mismo ciclo, desde otro pipe).',
      ['CPI cercano a 1', 'Estándar en pipelines clásicos'], ['Muxes anchos en el camino crítico', 'Crece cuadráticamente con el ancho de emisión'], 'medio', 'Casi 0 burbujas excepto load-use', 'MIPS R3000, Rocket, Cortex-A'),
    A('Scoreboard', 'Una tabla registra qué registro está pendiente de escribir y qué unidad funcional lo produce. Las instrucciones esperan y se emiten fuera de orden cuando se libera el operando.',
      ['Permite ejecución fuera de orden', 'Oculta latencias largas'], ['No renombra: sufre WAR y WAW', 'Lógica compleja'], 'alto', 'Reduce stalls por multiplicador/divisor', 'CDC 6600, ARM Cortex-A8 (parcial)'),
    A('Tomasulo / ROB y renombrado', 'Estaciones de reserva y renombrado de registros eliminan WAR/WAW; el ROB retira en orden.',
      ['Máximo IPC', 'Excepciones precisas'], ['Enorme área y consumo', 'Verificación muy costosa'], 'muy alto', 'IPC 2-6', 'IBM 360/91, Intel P6, BOOM, ARM Cortex-A7x'),
    A('Planificación por el compilador', 'El compilador inserta NOPs o reordena instrucciones para que no haya dependencias cercanas (sin hardware de hazards).',
      ['Hardware trivial'], ['Binarios atados a la microarquitectura', 'Aumenta el tamaño del código'], 'mínimo', 'Depende del compilador', 'MIPS I (load delay slot), DSPs VLIW'),
    A('Gating con uses_rs1/uses_rs2', 'Arreglo del quirk: decodificar desde el opcode si la instrucción realmente usa rs1/rs2 y condicionar los comparadores. Evita selecciones sin sentido en forward_unit y stalls falsos en hazard_unit.',
      ['Sin stalls falsos', 'Costo mínimo (unas pocas compuertas)'], ['Un poco más de lógica en ID'], 'bajo', 'Ahorra 1 ciclo por stall falso', 'Prácticamente todos los diseños maduros'),
  ],
};

const hazardAlt = {
  title: 'Detección de hazards y stalls',
  current: '<p>hazard_unit levanta <code>stall</code> cuando <code>ex_mem_read</code> y <code>ex_rd</code> coincide con <code>id_rs1</code> o <code>id_rs2</code> (y no es x0). Congela el PC y IF/ID, e inserta una burbuja en ID/EX. Quirk: compara los campos crudos y puede detener sin necesidad (stall falso).</p>',
  options: [
    A('Gating con uses_rs1 / uses_rs2', 'Solo compara los campos que el formato realmente usa como fuente.', ['Elimina stalls falsos'], ['Una decodificación extra en ID'], 'bajo', 'Ahorra 1 ciclo por caso falso', 'PicoRV32, Ibex, Rocket'),
    A('Interlock completo por scoreboard', 'Se lleva la cuenta de registros pendientes; stalla toda instrucción cuyo operando no esté listo (sin forwarding o con unidades de latencia variable).',
      ['Maneja multiplicadores y divisores de latencia variable'], ['Más estado y lógica'], 'medio', 'Variable', 'CDC 6600, Cortex-A53'),
    A('Load delay slot (compilador)', 'El ISA define que el valor cargado no está disponible en la instrucción siguiente. El compilador llena el hueco.', ['Cero hardware de detección'], ['Código menos portable'], 'mínimo', 'Burbuja si el compilador no encuentra trabajo útil', 'MIPS I, MIPS R2000'),
    A('Memoria con latencia 0 (forward desde dmem)', 'Si el dato de memoria estuviera listo antes de terminar la etapa de EX, no habría load-use. Requiere memoria muy rápida o un ciclo más largo.', ['Elimina el único stall'], ['Alarga la ruta crítica'], 'medio', '0 burbujas', 'Cores de ciclo largo / sin caché'),
    A('Ejecución fuera de orden', 'Mientras el load espera, se ejecutan instrucciones independientes posteriores.', ['Oculta casi toda la latencia'], ['Área y complejidad muy altas'], 'muy alto', 'Stalls ocultos', 'BOOM, Intel P6, Cortex-A7x'),
  ],
};

const aluAlt = {
  title: 'Unidad aritmético-lógica',
  current: '<p>ALU de 32 bits descripta con operadores de Verilog (<code>+</code>, <code>-</code>, <code>&lt;&lt;</code>, <code>&gt;&gt;&gt;</code>), de modo que la herramienta de síntesis elige la estructura. Calcula <code>zero</code>, <code>lt</code>, <code>ltu</code> y overflow siempre; solo se usan 5 bits para los shifts. En una Artix-7 el sumador usa la cadena de carry dedicada (CARRY4).</p>',
  options: [
    A('Sumador ripple-carry', 'Cadena de 32 full adders, el acarreo se propaga bit a bit.', ['Mínima área'], ['Retardo O(n), ruta crítica larga'], 'mínimo', 'Ciclo más largo', 'Primeros micros, SERV (bit-serial)'),
    A('Carry-lookahead / carry-select', 'Calculan generate/propagate por grupos para saltarse la propagación bit a bit.', ['Retardo O(log n) o O(√n)'], ['Más compuertas'], 'medio', 'Ciclo más corto', 'Muchos cores ASIC'),
    A('Kogge-Stone (prefix adder)', 'Sumador de prefijos paralelo con retardo logarítmico y fan-out mínimo.', ['El más rápido'], ['Mucha área y cableado'], 'alto', 'Ciclo mínimo', 'Procesadores de alto rendimiento'),
    A('Barrel shifter vs shifter serial', 'Un barrel shifter desplaza cualquier cantidad en un ciclo con log2(32) niveles de mux. Un shifter serial desplaza 1 bit por ciclo.', ['Barrel: 1 ciclo', 'Serial: área mínima'], ['Barrel: muchos muxes', 'Serial: hasta 31 ciclos'], 'barrel medio / serial mínimo', 'Serial: instrucción multiciclo', 'Barrel: Rocket, Ibex; serial: SERV, PicoRV32 (opción)'),
    A('Extensión M (multiplicar/dividir)', 'Un multiplicador combinacional usa los DSP48 de la Artix-7; un divisor suele ser iterativo (1 bit por ciclo).', ['Acelera aritmética por mucho'], ['Multiplicador en la ruta crítica o multiciclo', 'Divisor muy lento'], 'medio (DSP48) / bajo (iterativo)', 'MUL: 1-4 ciclos; DIV: ~32 ciclos', 'Ibex (fast mult opcional), PicoRV32M, VexRiscv, Rocket'),
  ],
};

const branchAlt = {
  title: 'Resolución de saltos',
  current: '<p>branch_unit decide en EX a partir de <code>zero</code>, <code>alu_lt</code> y <code>alu_ltu</code> (funct3) y calcula <code>pc + imm</code> con su propio sumador. JALR usa la salida de la ALU enmascarada con <code>~1</code>. Penalidad fija: 2 burbujas por salto tomado o jump.</p>',
  options: [
    A('Resolver en ID con comparador temprano', 'Un comparador dedicado en ID reduce la penalidad a 1 ciclo, a costa de necesitar forwarding adicional hacia ID.', ['Penalidad de 1 ciclo'], ['Más forwarding hacia ID', 'Stall extra si el operando viene de un load'], 'medio', 'Penalidad 1 en vez de 2', 'MIPS R3000, Cortex-M0+'),
    A('Salto retardado (delay slot)', 'La instrucción siguiente siempre se ejecuta.', ['Cero hardware de flush'], ['Complica el ISA'], 'bajo', 'Penalidad 0-1', 'MIPS, SPARC'),
    A('Branch-likely', 'El delay slot solo se ejecuta si el salto se toma; si no, se anula.', ['El compilador llena el slot con instrucciones del destino'], ['Instrucciones obsoletas con el tiempo'], 'bajo', 'Menos slots vacíos', 'MIPS II+'),
    A('Predicción y ejecución especulativa', 'Se predice el salto en IF y se verifica en EX con recuperación al fallar.', ['Penalidad promedio mínima'], ['Hardware de recuperación'], 'medio-alto', '0 si acierta; N si falla', 'BOOM, Cortex-A, VexRiscv'),
    A('Ejecución predicada', 'Se eliminan los branches cortos convirtiéndolos en instrucciones condicionadas.', ['Sin riesgo de misprediction'], ['Ejecuta trabajo inútil'], 'bajo-medio', 'Sin penalidad de salto', 'ARM clásico, Itanium, extensión Zicond'),
  ],
};

const flushAlt = {
  title: 'Flush del pipeline',
  current: '<p>flush_unit simplemente replica <code>redirect</code> hacia <code>flush_if_id</code> y <code>flush_id_ex</code>. Se anulan las 2 instrucciones más jóvenes que el salto; EX/MEM y MEM/WB no se tocan. El halt también usa estos flushes (<code>stop_fetch</code>).</p>',
  options: [
    A('Predicción + recuperación de checkpoint', 'Con predicción, al fallar se restaura un checkpoint (mapa de registros) y se descartan instrucciones por etiqueta.', ['Permite especulación profunda'], ['Mucho estado extra'], 'alto', 'Penalidad depende de la profundidad', 'BOOM, Intel P6'),
    A('Predicación', 'No hay flush: las instrucciones se anulan por condición.', ['Sin vaciado'], ['Siempre ocupa slots'], 'bajo', '0 de flush', 'ARM, Itanium'),
    A('Flush selectivo por bit de validez', 'Cada etapa tiene un bit <code>valid</code> y no se pone todo a 0, solo se invalida.', ['Menos fan-out en las señales de control'], ['Hay que propagar el bit'], 'bajo', 'Igual', 'Ibex, Rocket'),
    A('Vaciar solo bubbles de control', 'En lugar de anular también datos, solo se ponen en 0 las señales con efectos (reg_write, mem_write, branch, jump, halt).', ['Menos lógica de reset'], ['Datos basura visibles al depurar'], 'bajo', 'Igual', 'Diseños académicos'),
  ],
};

const memAlt = {
  title: 'Memorias de instrucciones y datos',
  current: '<p>Dos memorias separadas (Harvard), 1 KB cada una (256 palabras). imem lee combinacionalmente y se carga por bytes desde la debug unit. dmem tiene 4 carriles de bytes con lectura asincrónica y escritura síncrona con byte-enables. Sin cachés ni MMIO: la UART la maneja la debug unit.</p>',
  options: [
    A('Von Neumann (memoria unificada)', 'Una sola memoria para código y datos; IF y MEM compiten por el único puerto.', ['Flexibilidad, un solo espacio'], ['Hazard estructural entre IF y MEM'], 'bajo', 'Stall cuando IF y MEM coinciden', 'Mayoría de los sistemas con un bus (Ibex con un puerto, PicoRV32)'),
    A('BRAM síncrona', 'La BRAM de FPGA tiene lectura registrada: el dato llega un ciclo después de presentar la dirección.', ['Mucha capacidad por área'], ['Latencia de 1 ciclo: otra etapa de pipeline o dirección adelantada'], 'bajo', '+1 ciclo de latencia de memoria (load-use de 2)', 'VexRiscv, Rocket, la mayoría de soft-cores sobre BRAM'),
    A('Cachés L1 + memoria externa', 'Se interpone una caché para ocultar la latencia de DDR/SRAM externa.', ['Permite GBs de memoria'], ['Miss, coherencia, complejidad'], 'alto', 'Hit 0-1; miss decenas', 'Cortex-A, SiFive U74, BOOM'),
    A('MMIO + TCM', 'Un decodificador de direcciones reparte accesos entre RAM, periféricos y memorias acopladas (Tightly Coupled Memory) de latencia fija.', ['Latencia determinista (tiempo real)', 'Periféricos accesibles desde el software'], ['Decoder y arbitraje'], 'bajo-medio', 'Fija', 'Cortex-M, SiFive E31, Ibex'),
    A('Acceso desalineado y traps', 'Soportar accesos desalineados por hardware (dos accesos) o generar una excepción.', ['Compatibilidad con código C real'], ['Lógica de merge o trap handler'], 'medio', '+1 ciclo si cruza palabras', 'Cortex-A, Rocket (trap), Ibex (opcional)'),
  ],
};

const pipeRegAlt = {
  title: 'Registros de pipeline y profundidad',
  current: '<p>Cuatro registros de pipeline (IF/ID, ID/EX, EX/MEM, MEM/WB) con <code>en</code> (congela todo, usado por la debug unit), <code>flush</code> y <code>stall</code> según el caso. 5 etapas.</p>',
  options: [
    A('Menos etapas (2-3)', 'Fusiona etapas, por ejemplo IF e ID, y EX con MEM.', ['Menos hazards y registros', 'Menor área'], ['Ciclo más largo'], 'bajo', 'CPI ~1, f menor', 'Ibex (2-3 etapas), Cortex-M0+ (2 etapas), PicoRV32'),
    A('Más etapas (superpipelining)', 'Divide cada etapa en varias para subir la frecuencia.', ['Frecuencia más alta'], ['Más hazards, penalidad de saltos mayor'], 'medio', 'Penalidad crece con la profundidad', 'Pentium 4 (20-31 etapas), BOOM'),
    A('Pipeline desacoplado con colas', 'Colas entre etapas absorben variaciones.', ['Tolera latencias variables'], ['Más área'], 'medio', '—', 'Cortex-A, Intel'),
    A('Wave pipelining', 'Se envían datos sin registros intermedios aprovechando los retardos del cableado.', ['Elimina el overhead de flops'], ['Extremadamente difícil de diseñar y verificar'], 'bajo', 'Mayor throughput teórico', 'Investigación, algunos DSPs'),
    A('Pipeline con bit de validez', 'Cada etapa lleva un bit valid en vez de usar NOPs.', ['Burbujas explícitas y fáciles de depurar'], ['Un bit extra por etapa'], 'bajo', 'Igual', 'Rocket, Ibex'),
  ],
};

const wbAlt = {
  title: 'Selección de resultado y write-back',
  current: '<p>El mux <code>wb_sel</code> se resuelve en MEM: 00 salida de ALU, 01 dato de dmem, 10 PC+4 (JAL/JALR), 11 inmediato (LUI). MEM/WB guarda el resultado ya elegido y el forwarding EX/MEM toma exactamente ese mismo valor.</p>',
  options: [
    A('Mux en WB', 'MEM/WB guarda por separado ALU y dato de memoria y la selección se hace en WB.', ['Registros EX/MEM más simples'], ['El forwarding desde MEM necesita su propio mux'], 'bajo', '0', 'Diseños de libro de texto (Patterson-Hennessy)'),
    A('LUI vía ALU', 'LUI se hace pasando el inmediato por la ALU (A=0, B=imm) y se elimina la entrada 11.', ['Mux de 3 entradas'], ['Hay que ajustar la entrada A'], 'bajo', '0', 'Rocket, Ibex'),
    A('Dos puertos de escritura', 'Escritura de ALU y de loads en puertos separados, evitando conflictos con loads de latencia variable.', ['Libera conflictos de escritura'], ['Regfile con más puertos'], 'alto', 'Mayor IPC', 'Cores superescalares'),
    A('Retiro con ROB', 'La escritura al registro arquitectónico se difiere hasta que la instrucción se retira en orden.', ['Excepciones precisas con ejecución fuera de orden'], ['ROB grande'], 'muy alto', '—', 'BOOM, Intel P6'),
  ],
};

const debugAlt = {
  title: 'Depuración del core',
  current: '<p>debug_unit es una FSM que habla UART con el host (comandos L/S/R/P/X/D). Puede cargar el programa en imem, avanzar un ciclo, correr, pausar, resetear y volcar 86 palabras de estado interno. Controla <code>i_enable</code> (clock lógico) e <code>i_rst</code> del core.</p>',
  options: [
    A('RISC-V External Debug + JTAG', 'Debug Module estándar con registros abstractos, halt/resume y breakpoints por hardware, accesible por JTAG (OpenOCD + GDB).', ['Estándar, usable con GDB', 'Soporta breakpoints y acceso a CSR'], ['Mucho más hardware', 'Requiere un debug module'], 'medio-alto', '—', 'SiFive, Rocket, Ibex, VexRiscv'),
    A('ILA de Vivado (analizador lógico interno)', 'Se insertan sondas en la FPGA para capturar señales internas con trigger.', ['Ve todas las señales en tiempo real', 'Sin escribir hardware'], ['Consume BRAM', 'Solo con herramienta propietaria'], 'medio (BRAM)', '—', 'Cualquier diseño en FPGA Xilinx'),
    A('Debug por Ethernet / PCIe', 'Mayor ancho de banda para volcar estados grandes.', ['Muchísimo más rápido'], ['Pila de protocolo compleja'], 'alto', '—', 'Aceleradores, SoCs grandes'),
    A('UART más rápida / FT2232 en modo FIFO', 'Subir el baud rate a 1-3 Mbps o usar el FIFO síncrono del FT2232H.', ['Dump casi instantáneo'], ['Requiere buen timing'], 'bajo', '—', 'Placas de desarrollo FPGA'),
    A('Simulación + testbench', 'Verificar en simulación con ondas.', ['Visibilidad total'], ['No ejercita el hardware real'], 'nulo', '—', 'Todo el flujo de diseño'),
  ],
};

const uartAlt = {
  title: 'Canal de comunicación (UART)',
  current: '<p>UART 8N1 a 19200 baudios con baud_rate_gen, FIFOs de RX y TX y FSM de transmisor/receptor separadas en lógica combinacional y registros. La debug unit lee y escribe bytes mediante las señales de las FIFOs.</p>',
  options: [
    A('Baud rate mayor', 'Subir de 19200 a 115200 o 1 Mbaud acelera un dump de 344 bytes de ~180 ms a ~30 ms o menos.', ['Mucho más rápido'], ['Más sensible al ruido y al error de baud'], 'igual', '—', 'Casi cualquier placa'),
    A('UART con oversampling 16x', 'Muestrea cada bit 16 veces y vota en el centro.', ['Más robusta'], ['Más lógica'], 'bajo', '—', 'UART 16550'),
    A('SPI / I2C', 'Buses sincrónicos con reloj compartido.', ['Más velocidad sin oversampling'], ['Necesita maestro en el host'], 'bajo', '—', 'Microcontroladores'),
    A('JTAG / USB', 'Interfaz estándar de depuración.', ['Compartida con herramientas del fabricante'], ['Más hardware'], 'medio', '—', 'Prácticamente todos los SoCs'),
    A('UART mapeada en memoria (MMIO)', 'La UART se accede con lw/sw a una dirección fija para que el software imprima.', ['El programa se comunica por sí mismo'], ['Requiere decodificador de direcciones'], 'bajo', 'Costo de un store/load', 'Zynq, SiFive E, PicoRV32 SoC'),
  ],
};

const decodeAlt = {
  title: 'Unidad de control e inmediatos',
  current: '<p>control.v es un <code>case(opcode)</code> combinacional que genera las banderas, <code>wb_sel</code>, <code>alu_op</code> e <code>imm_sel</code>. immgen es un mux de 5 formatos con extensión de signo. SYSTEM (cualquier opcode 1110011) pone <code>halt</code>.</p>',
  options: [
    A('Control microprogramado (ROM)', 'La palabra de control sale de una ROM indexada por el opcode.', ['Fácil de cambiar'], ['Más lento y más grande'], 'medio', '+0-1 ciclo', 'Intel 8086, 68000'),
    A('Decodificación en dos niveles', 'Primero un decodificador principal, luego un control de ALU local (ALUOp).', ['Menos lógica'], ['Dos niveles de retardo'], 'bajo', '0', 'Patterson-Hennessy, MIPS'),
    A('Decodificar uses_rs1 / uses_rs2', 'Agregar dos bits de control que indiquen operandos reales.', ['Corrige stalls falsos'], ['Dos salidas más'], 'bajo', 'Ahorra ciclos', 'Rocket, Ibex'),
    A('Soporte de CSRs y traps', 'Ecall/ebreak generan excepciones con mepc, mcause y mtvec en lugar de detener la CPU.', ['Permite SO y manejo de interrupciones'], ['Máquina de estados y registros CSR'], 'medio', 'Penalidad de trap', 'Todos los RISC-V con modo M'),
    A('Decodificar instrucciones comprimidas (C)', 'Expandir instrucciones de 16 bits a 32 antes del decode.', ['Código ~25-30% más chico'], ['Fetch desalineado'], 'medio', 'Complica el fetch', 'Ibex, Rocket, Cortex-M'),
  ],
};

const idexAlt = pipeRegAlt;

export const ALTERNATIVES = {
  pc: { ...pcAlt, title: 'PC y predicción de saltos' },
  imem: { ...memAlt, title: 'Memoria de instrucciones' },
  ifid: { ...pipeRegAlt, title: 'Registro IF/ID' },
  control: { ...decodeAlt },
  regfile: regfileAlt,
  immgen: { ...decodeAlt, title: 'Generador de inmediatos' },
  idex: { ...idexAlt, title: 'Registro ID/EX' },
  fwdMuxA: fwdAlt,
  fwdMuxB: fwdAlt,
  aluSrcMux: fwdAlt,
  alu: aluAlt,
  branch: branchAlt,
  exmem: { ...pipeRegAlt, title: 'Registro EX/MEM' },
  dmem: { ...memAlt, title: 'Memoria de datos' },
  wbMux: wbAlt,
  memwb: { ...wbAlt, title: 'Registro MEM/WB' },
  hazard: hazardAlt,
  forward: fwdAlt,
  flush: flushAlt,
  debug: debugAlt,
  uart: uartAlt,
};
