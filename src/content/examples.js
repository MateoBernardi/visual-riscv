// examples.js - programas de ejemplo guiados. Sin DOM.
//
// Forma de cada ejemplo:
//   { id, title, level, summary, code, steps: [{ cycle, focus: blockId, note: html }], explainVerification: html, expect }
// - `steps[].note` se muestra dentro del pop-up de explicación en ese ciclo: explica qué se ve y por qué pasa.
// - `explainVerification` explica qué demuestran los valores finales de `expect` sobre el hardware (pestaña "Verificación").
// - Convención de `expect`: regs = valor final (sin signo) del registro; mem = índice de PALABRA de dmem -> valor.
// - Temporización (sin hazards): la instrucción dinámica k está en IF en el ciclo k, en ID en k+1, EX k+2, MEM k+3, WB k+4.
//   "Ciclo n" es el estado que se ve después de n flancos de reloj desde el reset.
// - Todos los ejemplos describen ESTA implementación (5 etapas, saltos resueltos en EX, imem y dmem de lectura combinacional).

export const EXAMPLES = [
  {
    id: 'datapath-etapas',
    title: 'Datapath y etapas',
    level: 'Básico',
    summary: 'Una secuencia de instrucciones independientes: se ve cómo cada una avanza una etapa por ciclo y cómo el pipeline se llena.',
    code: `# Ejemplo 1: instrucciones independientes (sin hazards)
addi x1, x0, 5      # x1 = 5
addi x2, x0, 7      # x2 = 7
addi x3, x0, 10     # x3 = 10
addi x4, x0, 36     # x4 = 36
addi x6, x0, 96     # x6 = 96 (relleno: separa las dependencias)
add  x5, x1, x2     # x5 = 5 + 7 = 12 (x1 y x2 ya están escritos en el regfile)
sub  x7, x3, x1     # x7 = 10 - 5 = 5
or   x8, x2, x4     # x8 = 7 | 36 = 39
ebreak              # detiene el CPU
`,
    steps: [
      { cycle: 0, focus: 'pc', note: '<p>Es el primer ciclo después del reset: el PC vale 0 y la memoria de instrucciones entrega <code>addi x1, x0, 5</code>. Las otras cuatro etapas contienen burbujas porque todavía no entró nada. Cada instrucción de RV32I ocupa 4 bytes, por eso el PC avanzará de a 4.</p>' },
      { cycle: 1, focus: 'regfile', note: '<p>La primera instrucción pasó a ID. Ahí pasan tres cosas a la vez: control la decodifica, el banco de registros lee <code>x0</code> (que vale 0 por hardware) y immgen arma el inmediato 5 a partir de los bits 31:20. Mientras tanto IF ya está buscando la segunda instrucción: esa superposición es todo el sentido del pipeline.</p>' },
      { cycle: 2, focus: 'alu', note: '<p>En EX la ALU suma <code>0 + 5</code>. El mux <code>aluSrcMux</code> eligió el inmediato como operando B porque <code>alu_src=1</code> (las instrucciones tipo I usan constante en vez de <code>rs2</code>). Los dos muxes de forwarding dejan pasar el valor del regfile: no hay ninguna dependencia todavía.</p>' },
      { cycle: 3, focus: 'wbMux', note: '<p>En MEM esta instrucción no accede a memoria, pero igual pasa por el mux de resultado: con <code>wb_sel=00</code> elige la salida de la ALU. En esta implementación la selección ocurre acá (y no en WB) para que ese mismo valor ya elegido pueda adelantarse por forwarding a la instrucción siguiente.</p>' },
      { cycle: 4, focus: 'memwb', note: '<p>WB escribe 5 en <code>x1</code> (el registro cambia en el flanco siguiente). Ahora hay cinco instrucciones distintas en vuelo, una por etapa: el pipeline está lleno. A partir de acá, y mientras no haya hazards, se retira una instrucción por ciclo. Las primeras 4 instrucciones no tienen dependencias entre sí, así que no pasa nada especial.</p>' },
      { cycle: 7, focus: 'alu', note: '<p><code>add x5, x1, x2</code> está en EX con operandos que vienen del regfile (los forwardings valen 00). Sus productores, <code>addi x1</code> y <code>addi x2</code>, están a distancia 5 y 4: ya escribieron hace rato. El <code>addi x6</code> intercalado sirve justamente para separar las dependencias en este primer ejemplo.</p>' },
      { cycle: 12, focus: 'memwb', note: '<p>El <code>ebreak</code> llega a WB y el CPU se detiene. Son 9 instrucciones en 13 ciclos: 4 ciclos de llenado más 9 instrucciones (fórmula <code>k + N − 1</code> con k = 5 etapas) y ninguna burbuja por hazards. Fijate que las instrucciones que siguen al <code>ebreak</code> en la memoria (NOPs) no llegaron a ejecutarse.</p>' },
    ],
    explainVerification: '<p>Los valores finales coinciden con los que daría un monociclo (o una cuenta a mano): <code>x5 = 12</code>, <code>x7 = 5</code>, <code>x8 = 39</code>. Eso prueba que, en ausencia de hazards, el camino de datos completo funciona: la decodificación de formatos R e I, la selección del inmediato, las operaciones de la ALU (suma, resta, OR), el mux de resultado y la escritura en el regfile en el momento correcto.</p><p>Es el caso base de toda la verificación: si este ejemplo falla, no tiene sentido probar forwarding. Lo que el pipeline cambia es <i>cuándo</i> ocurre cada cosa, nunca el resultado.</p>',
    expect: { regs: { x1: 5, x2: 7, x3: 10, x4: 36, x5: 12, x6: 96, x7: 5, x8: 39 }, mem: {} },
  },
  {
    id: 'forwarding-exmem',
    title: 'Forwarding EX/MEM',
    level: 'Básico',
    summary: 'Una instrucción necesita el resultado de la inmediatamente anterior: el dato se adelanta desde EX/MEM sin perder ciclos.',
    code: `# Ejemplo 2: forwarding desde EX/MEM
addi x1, x0, 5      # x1 = 5
add  x2, x1, x1     # usa x1 recién calculado (distancia 1): forward 10 en A y B -> x2 = 10
add  x3, x2, x1     # x2 distancia 1 (forward 10 en A) y x1 distancia 2 (forward 01 en B) -> x3 = 15
ebreak
`,
    steps: [
      { cycle: 2, focus: 'regfile', note: '<p>El primer <code>add</code> está en ID y lee <code>x1</code> del regfile, pero ese valor todavía es el viejo (0): el <code>addi</code> que lo calcula recién está en EX y la escritura ocurrirá dos ciclos más tarde. Este es un hazard RAW a distancia 1. Lo que se lea acá es basura para este add, y no importa, porque se va a corregir en EX.</p>' },
      { cycle: 3, focus: 'forward', note: '<p>El <code>add</code> pasa a EX mientras el <code>addi</code> está en MEM. La unidad de forwarding compara los registros fuente de la instrucción en EX (<code>rs1 = rs2 = x1</code>) con el destino de la que está en MEM (<code>x1</code>), y como coinciden y esa instrucción escribe un registro, elige la fuente <code>10</code> (EX/MEM) para los dos operandos.</p>' },
      { cycle: 3, focus: 'fwdMuxA', note: '<p>Los dos muxes de operando dejan de mirar lo que leyó el regfile y toman <code>mem_result = 5</code>: el resultado que la instrucción anterior acaba de calcular. El add suma 5 + 5 = 10 sin haber perdido un solo ciclo. Sin forwarding habría que esperar a que el addi llegue a WB (2 burbujas).</p>' },
      { cycle: 4, focus: 'forward', note: '<p>El segundo <code>add</code> combina dos casos en la misma instrucción: su operando A (<code>x2</code>) lo produjo la instrucción de justo adelante y llega por EX/MEM (código 10); su operando B (<code>x1</code>) lo produjo el addi, que ahora está en WB, y llega por MEM/WB (código 01). Cada operando tiene su propio mux y su propia decisión.</p>' },
      { cycle: 6, focus: 'memwb', note: '<p>El resultado <code>x3 = 15</code> se escribe en WB. En todo el programa no hubo ni stalls ni burbujas: 4 instrucciones en 8 ciclos (el mínimo posible es 4 + 4 de llenado y vaciado). Notá que el ebreak llega a WB un ciclo después.</p>' },
    ],
    explainVerification: '<p><code>x2 = 10</code> y <code>x3 = 15</code> solo pueden salir bien si los dos tipos de forwarding funcionaron: sin forwarding, el primer add habría leído <code>x1 = 0</code> y dado 0, y el segundo habría usado un <code>x2</code> viejo. Que el resultado sea 15 y no, por ejemplo, 5 o 10, prueba además la prioridad: cuando varias fuentes podrían servir, se eligió siempre la más reciente.</p><p>En el testbench del repo este tipo de comprobación se hace comparando todos los registros contra un modelo de referencia: un error de forwarding casi siempre aparece como un registro con un valor viejo.</p>',
    expect: { regs: { x1: 5, x2: 10, x3: 15 }, mem: {} },
  },
  {
    id: 'forwarding-memwb-bypass',
    title: 'Forwarding MEM/WB y bypass del regfile',
    level: 'Intermedio',
    summary: 'Dependencias a distancia 2 (forward 01) y a distancia 3 (bypass interno del regfile).',
    code: `# Ejemplo 3: dependencias a distancia 2 y 3
addi x1, x0, 3      # x1 = 3
addi x2, x0, 4      # x2 = 4
addi x5, x0, 9      # x5 = 9 (instrucción independiente)
add  x3, x1, x2     # x1: distancia 3 -> bypass del regfile; x2: distancia 2 -> forward 01. x3 = 7
add  x4, x2, x5     # x2: distancia 3 -> bypass; x5: distancia 2 -> forward 01. x4 = 13
ebreak
`,
    steps: [
      { cycle: 4, focus: 'regfile', note: '<p>El primer <code>add</code> está en ID mientras <code>addi x1</code> está en WB, escribiendo <code>x1</code> justo ahora. La escritura del banco de registros es síncrona (se completa en el próximo flanco) pero la lectura es combinacional, así que sin ayuda este add leería el valor viejo. El regfile resuelve el conflicto internamente: si la dirección de escritura coincide con la de lectura, entrega directamente el dato que se está escribiendo (bypass, <code>bypassA</code>).</p>' },
      { cycle: 5, focus: 'forward', note: '<p>El primer <code>add</code> está en EX y necesita <code>x2</code>, producido dos instrucciones antes: el <code>addi x2</code> está ahora en WB. Ya no está en EX/MEM (esa posición la ocupa otra instrucción), así que la unidad de forwarding elige <code>01</code> y el operando B viaja desde <code>wb_result</code>. Es la dependencia a distancia 2.</p>' },
      { cycle: 5, focus: 'regfile', note: '<p>Al mismo tiempo, el segundo <code>add</code> está en ID leyendo <code>x2</code> mientras el <code>addi x2</code> lo escribe: otro bypass del regfile. Dos mecanismos distintos (forwarding en EX y bypass en ID) están resolviendo dos dependencias en el mismo ciclo, cada uno en la etapa que le toca.</p>' },
      { cycle: 6, focus: 'fwdMuxB', note: '<p>El segundo <code>add</code> toma <code>x5</code> por MEM/WB (forward 01), porque el <code>addi x5</code> está en WB. Compará con el ejemplo anterior: allí el operando venía de EX/MEM porque la distancia era 1. La regla en esta implementación es: distancia 1 → EX/MEM, distancia 2 → MEM/WB, distancia 3 → bypass del regfile, distancia 4 o más → lectura normal.</p>' },
      { cycle: 8, focus: 'memwb', note: '<p>Se escribe <code>x4 = 13</code> en WB. No hubo ninguna burbuja: los tres mecanismos de datos (EX/MEM, MEM/WB y bypass) cubren todas las distancias en las que el dato existe pero todavía no está en el regfile.</p>' },
    ],
    explainVerification: '<p>Los resultados <code>x3 = 7</code> y <code>x4 = 13</code> demuestran que ambas distancias se resolvieron bien. Si el bypass del regfile faltara, el operando de distancia 3 habría salido 0 (el valor previo); si faltara el forwarding MEM/WB, el de distancia 2 también. Es un buen test porque cada instrucción mezcla las dos distancias, y un error en una sola sale como una suma incorrecta.</p><p>Para depurar un diseño propio, conviene probar distancias 1, 2, 3 y 4 por separado y con ambos operandos (rs1 y rs2).</p>',
    expect: { regs: { x1: 3, x2: 4, x5: 9, x3: 7, x4: 13 }, mem: {} },
  },
  {
    id: 'load-use',
    title: 'Load-use stall',
    level: 'Intermedio',
    summary: 'Un lw seguido de una instrucción que usa su resultado: el pipeline necesita una burbuja.',
    code: `# Ejemplo 4: load-use
addi x1, x0, 42     # x1 = 42
sw   x1, 0(x0)      # mem[0] = 42 (x1 llega por forward 10 como dato del store)
lw   x2, 0(x0)      # x2 = mem[0] = 42
addi x3, x2, 1      # usa x2 inmediatamente: STALL de 1 ciclo. x3 = 43
ebreak
`,
    steps: [
      { cycle: 3, focus: 'fwdMuxB', note: '<p>El <code>sw</code> está en EX y el dato que debe guardar (<code>rs2 = x1</code>) todavía no está en el regfile: el <code>addi</code> está en MEM. El forwarding también sirve para los stores: el mux de <code>rs2</code> está antes de la ALU, así que el valor adelantado (42) viaja a EX/MEM como dato de escritura. La dirección sí pasa por la ALU (<code>x0 + 0</code>).</p>' },
      { cycle: 4, focus: 'dmem', note: '<p>El <code>sw</code> está en MEM y escribe 42 en dmem (byte-enables <code>1111</code>, es una palabra completa). La escritura es síncrona: el dato queda guardado en el flanco que cierra este ciclo. Mientras tanto el <code>lw</code> ya está en EX calculando la misma dirección.</p>' },
      { cycle: 4, focus: 'hazard', note: '<p>Este es el hazard que la hazard unit resuelve con un stall. El <code>addi x3, x2, 1</code> está en ID y el <code>lw</code> (destino <code>x2</code>) está en EX. El dato del load recién existirá al final de MEM, el ciclo siguiente, pero el addi lo necesitaría ahora, al principio de su EX. hazard_unit compara el destino del load con los campos <code>rs1</code>/<code>rs2</code> del addi, detecta la coincidencia y levanta <code>stall</code>: se congelan el PC y el registro IF/ID, y se inserta una burbuja en ID/EX.</p>' },
      { cycle: 5, focus: 'idex', note: '<p>La burbuja (control en cero) ocupa EX: es el costo del hazard, un ciclo en el que EX no hace trabajo útil. El <code>lw</code> avanzó a MEM y lee 42 de dmem. El addi sigue en ID: repite su lectura de registros, y esta vez no hay stall porque el load ya no está en EX.</p>' },
      { cycle: 6, focus: 'forward', note: '<p>El addi llega a EX y el load está en WB: ahora el dato viaja por el camino de siempre. forward_unit elige <code>01</code> (MEM/WB) y el operando A recibe 42. Sin el stall, el addi habría usado el valor viejo de <code>x2</code>. La burbuja convirtió un problema imposible (viajar hacia atrás en el tiempo) en uno resuelto con el mismo forwarding de la distancia 2.</p>' },
      { cycle: 9, focus: 'memwb', note: '<p>El <code>ebreak</code> retira en el ciclo 9: son 10 ciclos para 5 instrucciones, uno más que sin el stall. Si el compilador hubiese puesto una instrucción independiente entre el <code>lw</code> y el <code>addi</code>, esa instrucción habría ocupado el hueco y no se habría perdido nada.</p>' },
    ],
    explainVerification: '<p><code>x3 = 43</code> prueba el stall: si no se hubiese frenado, el addi habría sumado 1 al valor viejo de <code>x2</code> (0) y daría 1. <code>mem[0] = 42</code> (palabra 0 de dmem) prueba además que el store recibió el dato correcto por forwarding desde la instrucción anterior, y que el load leyó lo que el store acababa de escribir (la escritura de MEM es visible para la lectura del ciclo siguiente).</p><p>En un test propio de load-use conviene variar si el consumidor usa el dato del load en <code>rs1</code>, en <code>rs2</code> o en el dato de un store, y probar también el load seguido de una instrucción independiente (no debe haber stall).</p>',
    expect: { regs: { x1: 42, x2: 42, x3: 43 }, mem: { 0: 42 } },
  },
  {
    id: 'branch-flush',
    title: 'Branch tomado y no tomado',
    level: 'Intermedio',
    summary: 'Un beq que se toma descarta 2 instrucciones; un bne que no se toma no cuesta nada.',
    code: `# Ejemplo 5: branches
addi x1, x0, 3      # x1 = 3
addi x2, x0, 3      # x2 = 3
beq  x1, x2, taken  # iguales: SE TOMA, salta a 'taken' y descarta las 2 siguientes
addi x5, x0, 111    # camino equivocado: nunca debe escribir x5
addi x6, x0, 222    # camino equivocado: nunca debe escribir x6
taken:
bne  x1, x2, skip   # iguales: NO se toma, el pipeline sigue sin pérdida
addi x7, x0, 7      # se ejecuta (x7 = 7)
skip:
addi x8, x0, 8      # x8 = 8
ebreak
`,
    steps: [
      { cycle: 3, focus: 'pc', note: '<p>Mientras el <code>beq</code> está en ID, el PC no sabe qué va a pasar con él, así que sigue buscando secuencialmente: ya está entrando <code>addi x5</code> (que es del camino equivocado si el salto se toma). En esta implementación esto equivale a una predicción implícita de "no tomado", sin hardware extra.</p>' },
      { cycle: 4, focus: 'branch', note: '<p>El <code>beq</code> llega a EX con sus operandos adelantados por forwarding (A por MEM/WB, B por EX/MEM). La ALU resta, <code>zero=1</code>, y branch_unit combina eso con <code>funct3=000</code> (BEQ) para decidir que el salto se toma. El destino <code>pc + imm = 0x14</code> sale de un sumador propio. Recién acá, tres etapas después de buscarlo, se sabe que el beq salta.</p>' },
      { cycle: 4, focus: 'flush', note: '<p>flush_unit anula los registros IF/ID e ID/EX: las dos <code>addi</code> equivocadas (<code>x5</code> y <code>x6</code>) se convierten en burbujas antes de poder escribir nada. El PC carga el destino del salto. Costo: 2 ciclos perdidos. Un diseño que resuelva el salto en ID perdería solo 1, a costa de un comparador extra y más forwarding.</p>' },
      { cycle: 5, focus: 'pc', note: '<p>El destino del salto (<code>bne</code>) entra por fin a IF. Atrás suyo hay dos burbujas en ID y EX: son las dos "instrucciones fantasma" que el flush dejó. Ningún efecto arquitectónico: <code>x5</code> y <code>x6</code> se quedarán en 0.</p>' },
      { cycle: 7, focus: 'branch', note: '<p>El <code>bne</code> llega a EX: la ALU resta, <code>zero=1</code>, pero BNE salta con <code>~zero</code>, así que no se toma. No hay redirect ni flush: las instrucciones siguientes ya estaban en camino y siguen su curso. Los branches no tomados son gratis en esta implementación.</p>' },
      { cycle: 12, focus: 'memwb', note: '<p>Retira el <code>ebreak</code>. El camino equivocado nunca dejó rastro (<code>x5 = x6 = 0</code>) y el camino correcto se ejecutó completo (<code>x7 = 7</code>, <code>x8 = 8</code>).</p>' },
    ],
    explainVerification: '<p><code>x5 = 0</code> y <code>x6 = 0</code> son la prueba central de este ejemplo: demuestran que las instrucciones del camino equivocado, aunque ya habían entrado al pipeline, no escribieron nada. Es la propiedad que define a un flush correcto. <code>x7 = 7</code> y <code>x8 = 8</code> demuestran lo contrario: que un branch no tomado no descartó instrucciones que sí debían ejecutarse.</p><p>Los tests de control deben cubrir ambos sentidos (tomado y no tomado) y los dos tipos de error posibles: ejecutar de más (efectos del camino equivocado) o descartar de más.</p>',
    expect: { regs: { x1: 3, x2: 3, x5: 0, x6: 0, x7: 7, x8: 8 }, mem: {} },
  },
  {
    id: 'jal-jalr',
    title: 'JAL / JALR: llamada y retorno',
    level: 'Intermedio',
    summary: 'Una llamada a función con jal y su retorno con ret (jalr): dos saltos, 2 burbujas cada uno.',
    code: `# Ejemplo 6: llamada a función
addi x10, x0, 6     # a0 = 6 (argumento)
jal  ra, double     # ra = PC+4 = 8; salta a double
addi x11, x10, 1    # al volver: a1 = a0 + 1 = 13
ebreak
double:
add  x10, x10, x10  # a0 = 6 + 6 = 12
ret                 # jalr x0, 0(ra): vuelve a la dirección 8
`,
    steps: [
      { cycle: 3, focus: 'branch', note: '<p><code>jal</code> en EX. A diferencia de un branch, el salto es incondicional (<code>jump=1</code>), así que no hace falta evaluar ninguna condición: el destino <code>pc + imm = 16</code> sale del sumador de branch_unit y <code>redirect</code> se activa siempre. Aunque el destino se conocía desde ID (no depende de ningún registro), esta implementación igual lo resuelve en EX.</p>' },
      { cycle: 3, focus: 'flush', note: '<p>Se descartan la <code>addi x11</code> (en ID) y el <code>ebreak</code> (en IF). Fijate lo importante: el <code>ebreak</code> ya estaba en el pipeline y, si no se hubiera descartado, habría detenido el programa antes de tiempo. Por eso el halt se detecta recién en EX, cuando ya se sabe que la instrucción no es del camino equivocado.</p>' },
      { cycle: 5, focus: 'wbMux', note: '<p>El <code>jal</code> llega a WB con <code>wb_sel=10</code>: lo que se escribe en <code>rd</code> no es el resultado de la ALU sino <code>pc + 4 = 8</code>, la dirección de retorno. Ese valor viajó por el registro de pipeline (<code>pc4</code>) desde ID, donde se calculó. Así <code>ra = x1 = 8</code>.</p>' },
      { cycle: 7, focus: 'alu', note: '<p>El <code>ret</code> es un <code>jalr x0, 0(ra)</code>. En EX la ALU suma <code>ra + 0 = 8</code> (a diferencia de JAL, el destino sí depende de un registro, que puede llegar por forwarding) y <code>redirect_target = alu_out &amp; ~1</code> fuerza el bit 0 a cero. Como <code>rd = x0</code>, la dirección de retorno que se "guarda" se descarta.</p>' },
      { cycle: 8, focus: 'pc', note: '<p>Después de otro flush de 2 instrucciones, el PC vuelve a 8: se ejecuta la <code>addi x11, x10, 1</code> que estaba justo después de la llamada. La función tardó, entre ida y vuelta, 4 burbujas (2 por cada salto).</p>' },
      { cycle: 13, focus: 'memwb', note: '<p>El <code>ebreak</code> retira. Quedan <code>a0 = 12</code> (el doble del argumento), <code>a1 = 13</code> y <code>ra = 8</code>.</p>' },
    ],
    explainVerification: '<p><code>x1 = 8</code> prueba que JAL guardó <code>PC + 4</code> (la dirección de la instrucción siguiente, no la del propio jal). <code>x10 = 12</code> prueba que la función se ejecutó, y <code>x11 = 13</code> que el retorno volvió exactamente a la instrucción correcta (la dirección 8) y que ésta vio el valor de <code>a0</code> actualizado.</p><p>Si el retorno hubiera ido a otra dirección, <code>x11</code> no se habría calculado (o el programa se habría detenido por un ebreak equivocado). Para probar JALR a fondo también hay que cubrir el caso <code>rd == rs1</code>, donde el destino debe calcularse con el valor viejo del registro.</p>',
    expect: { regs: { x1: 8, x10: 12, x11: 13 }, mem: {} },
  },
  {
    id: 'lui-auipc',
    title: 'LUI / AUIPC: constantes de 32 bits',
    level: 'Intermedio',
    summary: 'Cómo se arma una constante grande con lui + addi y cómo auipc suma el PC.',
    code: `# Ejemplo 7: constantes y direcciones relativas
lui   x1, 0x12345     # x1 = 0x12345000
addi  x1, x1, 0x678   # x1 = 0x12345678 (el lui llega por forward 10, con wb_sel=11)
auipc x2, 1           # x2 = PC (8) + 0x1000 = 0x1008
lui   x3, 0xFFFFF     # x3 = 0xFFFFF000
li    x4, 0xDEADBEEF  # pseudo: lui x4, 0xDEADC ; addi x4, x4, -273 (corrige el signo del addi)
ebreak
`,
    steps: [
      { cycle: 1, focus: 'immgen', note: '<p>En ID el <code>lui</code> usa <code>imm_sel=011</code> (formato U): el inmediato es <code>{instr[31:12], 12\'b0}</code>, es decir los 20 bits altos de la instrucción copiados sin reordenar y con 12 ceros abajo. Es el único formato donde el inmediato ocupa la parte alta del registro destino.</p>' },
      { cycle: 3, focus: 'wbMux', note: '<p>El <code>lui</code> está en MEM con <code>wb_sel=11</code>: el mux entrega <code>mem_imm</code>, el inmediato que viajó por el pipeline. La ALU no participó del resultado (no hace falta una operación "pasar B"). Como ese mismo valor ya está seleccionado en MEM, también se forwardea al <code>addi</code> que está en EX: por eso el addi puede sumar 0x678 sobre 0x12345000 sin esperar.</p>' },
      { cycle: 4, focus: 'aluSrcMux', note: '<p>El <code>auipc</code> está en EX con <code>is_auipc=1</code>: el operando A de la ALU deja de ser <code>rs1</code> y pasa a ser el PC de <b>esta</b> instrucción (8, porque es la tercera). La ALU suma 8 + 0x1000 = 0x1008. Sirve para formar direcciones relativas a donde está el código.</p>' },
      { cycle: 6, focus: 'alu', note: '<p>El <code>li x4, 0xDEADBEEF</code> es una pseudoinstrucción que el ensamblador expandió a <code>lui</code> + <code>addi</code>. Truco: como el <code>addi</code> extiende su inmediato en signo y 0xEEF tiene el bit 11 en 1 (es negativo, −273), el ensamblador suma 1 a la parte alta: el lui carga 0xDEADC en vez de 0xDEADB, y el addi resta 0x111 para compensar.</p>' },
      { cycle: 10, focus: 'memwb', note: '<p>Retira el <code>ebreak</code> con todas las constantes listas. Vale la pena abrir el panel de registros para ver cómo cada una quedó armada en 32 bits.</p>' },
    ],
    explainVerification: '<p><code>x4 = 0xDEADBEEF</code> es el valor más revelador: solo sale bien si el ensamblador corrigió el signo del <code>addi</code> y, a la vez, el hardware extendió ese inmediato en signo como corresponde. Si cualquiera de los dos falla, el resultado sale 0xDEADCEEF o 0xDEADBFEF... Es un test que valida la pareja ensamblador/CPU.</p><p><code>x1 = 0x12345678</code> prueba además el forwarding de un resultado de LUI (que no viene de la ALU) y <code>x2 = 0x1008</code> prueba que AUIPC suma el PC de su propia dirección. <code>x3 = 0xFFFFF000</code> verifica el límite: el bit de signo de una constante tipo U.</p>',
    expect: { regs: { x1: 0x12345678, x2: 0x1008, x3: 0xfffff000, x4: 0xdeadbeef }, mem: {} },
  },
  {
    id: 'loads-stores-byte-half',
    title: 'Loads y stores de byte y media palabra',
    level: 'Avanzado',
    summary: 'Byte-enables en los stores y extensión de signo vs ceros en los loads.',
    code: `# Ejemplo 8: acceso por bytes y medias palabras
addi x1, x0, -2     # x1 = 0xFFFFFFFE
sw   x1, 0(x0)      # mem[0] = 0xFFFFFFFE
addi x2, x0, 0x55   # x2 = 0x55
sb   x2, 4(x0)      # byte 0 de la palabra 1 = 0x55 (be = 0001)
sb   x2, 6(x0)      # byte 2 de la palabra 1 = 0x55 (be = 0100) -> 0x00550055
sh   x1, 8(x0)      # media palabra baja de la palabra 2 = 0xFFFE (be = 0011)
sh   x1, 10(x0)     # media palabra alta de la palabra 2 = 0xFFFE (be = 1100) -> 0xFFFEFFFE
lb   x3, 0(x0)      # byte 0xFE con extensión de signo -> 0xFFFFFFFE
lbu  x4, 0(x0)      # byte 0xFE sin signo -> 0xFE
lh   x5, 8(x0)      # 0xFFFE con signo -> 0xFFFFFFFE
lhu  x6, 8(x0)      # 0xFFFE sin signo -> 0xFFFE
lw   x7, 4(x0)      # palabra completa -> 0x00550055
lb   x8, 6(x0)      # byte 2 -> 0x55
ebreak
`,
    steps: [
      { cycle: 4, focus: 'dmem', note: '<p>El primer <code>sw</code> está en MEM y escribe los cuatro carriles de la palabra 0 (<code>memBe = 1111</code>). dmem está organizada como cuatro bancos de 8 bits (lane0..lane3) y cada uno tiene su propia habilitación de escritura: así se puede escribir un byte sin tocar los otros tres.</p>' },
      { cycle: 6, focus: 'dmem', note: '<p>El primer <code>sb</code> está en MEM: la dirección es 4, <code>addr[1:0] = 0</code>, entonces la máscara es <code>be = 0001</code> y solo cambia el carril 0 de la palabra 1. Los otros tres carriles conservan su valor (0). El dato se replica en los cuatro carriles de entrada, y la máscara decide cuál lo recibe.</p>' },
      { cycle: 7, focus: 'dmem', note: '<p>El segundo <code>sb</code> usa la dirección 6: <code>addr[1:0] = 2</code>, entonces <code>be = 0001 &lt;&lt; 2 = 0100</code>. Se actualiza el carril 2 y la palabra 1 queda en 0x00550055. La dirección de byte se divide en dos partes: <code>addr[9:2]</code> elige la palabra y <code>addr[1:0]</code> elige el carril.</p>' },
      { cycle: 9, focus: 'dmem', note: '<p>El segundo <code>sh</code> (dirección 10) usa <code>addr[1] = 1</code> y habilita los carriles altos (<code>be = 1100</code>); el primero, en la dirección 8, había habilitado los bajos (<code>0011</code>). Dos medias palabras completan la palabra 2 = 0xFFFEFFFE.</p>' },
      { cycle: 10, focus: 'dmem', note: '<p><code>lb</code> lee el byte 0 de la palabra 0 (0xFE) y lo extiende en signo: se copia el bit 7 en los 24 bits altos y queda 0xFFFFFFFE. Esa extensión se hace dentro de dmem, antes de que el dato salga hacia el mux de resultado.</p>' },
      { cycle: 11, focus: 'wbMux', note: '<p>Con <code>lbu</code> el mismo byte 0xFE se extiende con ceros: 0x000000FE. La diferencia entre <code>lb</code> y <code>lbu</code> es exactamente esa, y es la razón por la que existen las dos variantes (caracteres sin signo vs. enteros pequeños con signo). En ambos casos el dato aparece en MEM, y no hay stall porque nadie lo usa a continuación.</p>' },
      { cycle: 16, focus: 'memwb', note: '<p>Retira el último load; el <code>ebreak</code> detiene el CPU un ciclo después. Abrí el panel de memoria para ver las palabras 0, 1 y 2 tal como las armaron los stores parciales.</p>' },
    ],
    explainVerification: '<p>Este ejemplo recorre todas las combinaciones de tamaño y signo y comprueba el estado de memoria y de registros. <code>mem[1] = 0x00550055</code> demuestra que los dos <code>sb</code> escribieron sus bytes sin pisar el resto de la palabra; <code>mem[2] = 0xFFFEFFFE</code>, lo mismo con las medias palabras.</p><p>Del lado de los loads, el par <code>x3 = 0xFFFFFFFE</code> / <code>x4 = 0xFE</code> prueba la diferencia entre extender con signo y con ceros sobre el <i>mismo byte</i> de memoria, y <code>x5</code> / <code>x6</code> lo mismo para media palabra. <code>x8 = 0x55</code> prueba que la selección de carril funciona también para un byte que no está en el carril 0.</p>',
    expect: {
      regs: { x1: 0xfffffffe, x2: 0x55, x3: 0xfffffffe, x4: 0xfe, x5: 0xfffffffe, x6: 0xfffe, x7: 0x00550055, x8: 0x55 },
      mem: { 0: 0xfffffffe, 1: 0x00550055, 2: 0xfffefffe },
    },
  },
  {
    id: 'halt-ebreak',
    title: 'Halt con ebreak',
    level: 'Básico',
    summary: 'Qué pasa cuando una instrucción SYSTEM entra al pipeline: lo anterior termina, lo posterior no se ejecuta.',
    code: `# Ejemplo 9: halt preciso
addi x1, x0, 1      # se ejecuta
addi x2, x0, 2      # se ejecuta
ebreak              # SYSTEM: halt = 1
addi x3, x0, 3      # NUNCA se ejecuta (queda x3 = 0)
addi x4, x0, 4      # NUNCA se ejecuta (queda x4 = 0)
`,
    steps: [
      { cycle: 3, focus: 'control', note: '<p>El <code>ebreak</code> está en ID y control pone <code>halt=1</code> (en esta implementación cualquier opcode SYSTEM lo activa) y todo lo demás en 0: no escribe registros, no accede a memoria. La instrucción viaja por los registros de pipeline con su bit de halt, igual que cualquier otra señal de control.</p>' },
      { cycle: 4, focus: 'flush', note: '<p>El <code>ebreak</code> llega a EX. Ahí se activa <code>stop_fetch = ex_halt | halting</code>: en el flanco que cierra este ciclo se anulan IF/ID e ID/EX y se congela el PC. La <code>addi x3</code> que estaba en ID desaparece antes de ejecutarse. Se detecta en EX y no antes a propósito: un ebreak en ID podría ser del camino equivocado de un branch; en EX ya es seguro que se ejecuta.</p>' },
      { cycle: 5, focus: 'pc', note: '<p>El flag <code>halting</code> quedó pegado en 1 y el PC ya no avanza. Las instrucciones anteriores al ebreak (<code>addi x1</code> y <code>addi x2</code>) siguen su camino con normalidad: en este momento el <code>addi x2</code> está en WB escribiendo. Es un halt <b>preciso</b>: lo anterior se completa, lo posterior no tiene efecto.</p>' },
      { cycle: 6, focus: 'memwb', note: '<p>El <code>ebreak</code> llega a WB: sube <code>o_halt</code>. En el sistema real, la debug unit ve ese nivel, deja de habilitar al CPU (<code>cpu_enable = 0</code>) y avisa al host con el byte <code>H</code>. El reloj nunca se detuvo: se frenó con la señal de enable de los registros.</p>' },
    ],
    explainVerification: '<p><code>x1 = 1</code> y <code>x2 = 2</code> prueban que lo anterior al halt se completó, aunque el halt ya hubiera sido detectado antes de que esas instrucciones terminaran. <code>x3 = 0</code> y <code>x4 = 0</code> prueban lo contrario: las dos instrucciones posteriores, que ya habían sido buscadas (una incluso decodificada), no tuvieron ningún efecto.</p><p>Ambas mitades son necesarias para llamar "preciso" al halt. Un test adicional importante es un <code>ebreak</code> justo después de un branch tomado: el ebreak del camino equivocado no debe detener el procesador.</p>',
    expect: { regs: { x1: 1, x2: 2, x3: 0, x4: 0 }, mem: {} },
  },
  {
    id: 'stall-falso',
    title: 'El stall falso (quirk del diseño)',
    level: 'Avanzado',
    summary: 'hazard_unit compara campos crudos de la instrucción: un addi cuyo inmediato coincide con el destino del load provoca una burbuja inútil.',
    code: `# Ejemplo 10: stall falso
addi x6, x0, 99     # x6 = 99
sw   x6, 0(x0)      # mem[0] = 99
lw   x5, 0(x0)      # x5 = 99
addi x1, x0, 5      # NO usa x5, pero su imm = 5 -> inst[24:20] = 5 = rd del lw: STALL FALSO
add  x2, x5, x1     # uso real de x5 (llega por bypass del regfile). x2 = 104
ebreak
# Prueba: cambiá "addi x1, x0, 5" por "addi x1, x0, 6" y el stall desaparece.
`,
    steps: [
      { cycle: 4, focus: 'regfile', note: '<p>El <code>addi x1, x0, 5</code> se codifica con inmediato 5, o sea <code>inst[24:20] = 00101</code>. Pero esos mismos bits son, en el formato R, el campo <code>rs2</code>. El hardware no sabe el formato hasta decodificar, así que siempre extrae <code>inst[24:20]</code> como si fuera un registro: acá "lee" <code>x5</code> aunque el addi no tiene segundo registro fuente.</p>' },
      { cycle: 4, focus: 'hazard', note: '<p>El <code>lw</code> (destino <code>x5</code>) está en EX y el <code>addi</code> en ID. hazard_unit compara <code>ex_rd == id_rs2</code> (5 == 5) y levanta <code>stall</code>, aunque el addi no use <code>x5</code> para nada: es un <b>stall falso</b>. Es seguro (nunca omite un stall necesario) pero cuesta un ciclo. La hazard unit solo mira números de registro, no si esos bits significan realmente un registro.</p>' },
      { cycle: 5, focus: 'idex', note: '<p>Se pierde un ciclo: hay una burbuja en EX y el addi repite ID. Nada se corrompe, solo se pierde rendimiento. Probá cambiar el 5 por un 6 en el código: el stall desaparece y el programa tarda un ciclo menos con el mismo resultado.</p>' },
      { cycle: 6, focus: 'regfile', note: '<p>Ahora el <code>add x2, x5, x1</code> está en ID mientras el <code>lw</code> escribe <code>x5</code> en WB: lo resuelve el bypass del regfile (<code>bypassA</code>). Fijate también que en EX el <code>addi x1</code> muestra un forwarding MEM/WB de su operando B: es el mismo defecto de campos crudos en forward_unit, pero ahí es inofensivo, porque el mux elige un valor que la ALU no usa (el operando B del addi es el inmediato).</p>' },
      { cycle: 7, focus: 'forward', note: '<p>En EX el add toma <code>x1</code> por forwarding EX/MEM (el addi está en MEM) y <code>x5</code> ya llegó por el regfile. <b>Cómo se corrige:</b> decodificar desde el opcode dos bits, <code>uses_rs1</code> y <code>uses_rs2</code> (rs2 lo usan solo R, S y B), y exigir su valor en la comparación. Con eso el stall falso desaparece sin tocar el resto.</p>' },
    ],
    explainVerification: '<p>Los valores finales (<code>x2 = 104</code>, <code>x5 = 99</code>) son <i>correctos</i>: ese es el punto. El stall falso no cambia el resultado, solo el tiempo: el programa tarda 11 ciclos en vez de 10. Por eso un testbench que solo compara estados finales (como los del repo) no lo detecta; hay que medir ciclos o inspeccionar los flags del pipeline en el dump (la palabra 13 trae <code>stall</code> y los códigos de forwarding).</p><p>Es un buen recordatorio de qué prueba cada tipo de test: la corrección funcional se verifica con el estado final, el rendimiento con el CPI.</p>',
    expect: { regs: { x1: 5, x2: 104, x5: 99, x6: 99 }, mem: { 0: 99 } },
  },
  {
    id: 'programa-completo',
    title: 'Programa de prueba completo',
    level: 'Avanzado',
    summary: 'El programa de prueba del repo (host/tests/pipeline_test.s): mezcla aritmética, memoria, forwarding, un load-use, saltos y un loop.',
    code: '__PIPELINE_TEST__',
    steps: [
      { cycle: 0, focus: 'pc', note: '<p>Este es el mismo programa con el que los testbenches del repo comprueban el procesador (<code>pipeline_prog.hex</code>, generado por el modelo de referencia en Python). Recorre todas las categorías de las lecciones: aritmética, dependencias a distintas distancias, un load-use, branches tomados y no tomados, JAL, JALR, loads/stores parciales, shifts con negativos y un loop. Ejecutalo paso a paso y mirá qué evento aparece en cada ciclo.</p>' },
      { cycle: 5, focus: 'forward', note: '<p>Con la secuencia <code>add x3, x1, x2</code> → <code>sub x4, x3, x1</code> aparece una dependencia a distancia 1: el <code>sub</code> toma <code>x3</code> por EX/MEM mientras el add está en MEM. Un ciclo antes, el propio add había combinado dos fuentes: <code>x2</code> por EX/MEM (distancia 1) y <code>x1</code> por MEM/WB (distancia 2).</p>' },
      { cycle: 7, focus: 'hazard', note: '<p>El único load-use real del programa: <code>lw x5, 0(x0)</code> seguido de <code>add x6, x5, x5</code>. hazard_unit frena un ciclo y en el ciclo 9 el add toma <code>x5</code> por MEM/WB en los dos operandos.</p>' },
      { cycle: 12, focus: 'branch', note: '<p>El <code>bne x6, x3, L1</code> sí se toma (x6 = 30, x3 = 15) y descarta la <code>addi x7, x0, 99</code>: por eso <code>x7</code> termina en 3 (1 + 2) y no en 101. El <code>beq</code> anterior (ciclo 10) no se tomó.</p>' },
      { cycle: 18, focus: 'flush', note: '<p><code>jal x9, F</code> salta sobre una <code>addi x10, x0, 77</code> que nunca debe ejecutarse (x10 queda en 0), y deja en x9 la dirección de retorno 0x3C. Más adelante el <code>jalr x13, 0(x12)</code> salta a la dirección 80 en forma absoluta, salteando la <code>addi x14</code>.</p>' },
      { cycle: 45, focus: 'branch', note: '<p>Empieza el loop: <code>blt x29, x0, loop</code> se toma varias veces (cada vez, 2 burbujas). El loop suma 1+2+...+6 en <code>x27 = 21</code>. Contá los redirects totales en el cronograma: son 9 en este programa, 18 burbujas, más 1 stall.</p>' },
      { cycle: 83, focus: 'memwb', note: '<p>El <code>ebreak</code> retira: 61 instrucciones en 84 ciclos, CPI ≈ 1,38. Los 23 ciclos extra son los 4 de llenado, las 18 burbujas de los 9 saltos tomados y el único stall. Nada después del ebreak (<code>addi x31</code>, <code>sw x31</code>) se ejecutó.</p>' },
    ],
    explainVerification: '<p>Los 26 valores distintos de cero de los registros y las 4 palabras de memoria que quedan escritas son los mismos que calcula un simulador de una instrucción por vez (el modelo de referencia en Python del repo). Que coincidan para un programa que mezcla casi todas las instrucciones, hazards y saltos es una evidencia fuerte, aunque no una prueba, de que el pipeline es equivalente a un monociclo.</p><p>Los ceros también cuentan: <code>x10 = 0</code> y <code>x14 = 0</code> (saltadas por JAL y JALR), <code>x31 = 0</code> y <code>mem[5] = 0</code> (después del ebreak). Un testbench autoverificable compara todo contra el esperado y reporta solo las diferencias.</p>',
    expect: {
      regs: {
        x1: 5, x2: 10, x3: 15, x4: 10, x5: 15, x6: 30, x7: 3, x8: 0x12345678, x9: 0x3c, x10: 0, x11: 0x40, x12: 0x50, x13: 0x4c,
        x14: 0, x15: 0, x16: 1, x17: 0x140, x18: 10, x19: 0xfffffff8, x20: 0xffffffff, x21: 0xfffffffc, x22: 0xffffff07,
        x23: 0xfffffff8, x24: 0xf8, x25: 0x5678, x26: 0x5678, x27: 21, x28: 7, x29: 0, x30: 42, x31: 0,
      },
      mem: { 0: 0xf, 1: 0xf800, 2: 0x5678, 3: 0, 4: 0x2a, 5: 0 },
    },
  },
];
