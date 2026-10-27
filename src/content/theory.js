// theory.js - teoría por tipo de evento + glosario. Sin DOM.
//
// Forma de cada entrada de EVENT_THEORY:
//   {
//     title, block,
//     what(ev, snap) -> html   qué pasó en ESTE ciclo (usa los datos del evento)
//     why: html                por qué existe este mecanismo (primeros principios + qué hace esta implementación)
//     rtl: string              fragmento de Verilog representativo
//     cost: string             cuánto cuesta en ciclos
//     hazard?: { kind: 'raw'|'loadUse'|'control'|'falseStall', stage }       solo eventos que representan un hazard
//     resolver?: { blocks: [blockIds], wires: [wireIds de CONTRACT v1], title, html }
//                              qué hardware lo resuelve y "por qué funciona" (2-4 oraciones); la animación
//                              resalta esos bloques/cables y muestra el texto.
//   }
// Todas las explicaciones hablan de ESTA implementación: otros pipelines tienen más o menos etapas,
// resuelven los saltos en ID, usan predictores, etc. Cuando hace falta se aclara con "en esta implementación".

const hx = (v) => (typeof v === 'number' ? '0x' + (v >>> 0).toString(16) : '?');
const hx8 = (v) => (typeof v === 'number' ? '0x' + (v >>> 0).toString(16).padStart(8, '0') : '?');
const xr = (r) => (typeof r === 'number' ? 'x' + r : 'un registro');
const dat = (ev) => (ev && ev.data) || {};
const sig = (snap) => (snap && snap.signals) || {};
const pick = (o, ...ks) => { for (const k of ks) if (o && o[k] !== undefined && o[k] !== null) return o[k]; return undefined; };
const asmOf = (ev, snap, stage) => {
  const d = dat(ev);
  return pick(d, 'asm') || (snap && snap.stages && snap.stages[stage || ev.stage] && snap.stages[stage || ev.stage].asm) || null;
};
const code = (s) => `<code>${s}</code>`;
const opName = (d) => (d.operand ? `el operando <b>${d.operand}</b>` : 'un operando');

export const EVENT_THEORY = {
  fetch: {
    title: 'Fetch (IF)',
    block: 'imem',
    what(ev, snap) {
      const d = dat(ev);
      const pc = pick(d, 'pc') ?? (snap && snap.pc);
      const a = asmOf(ev, snap, 'IF');
      return `<p>La etapa IF presenta <code>pc = ${hx(pc)}</code> a la memoria de instrucciones y recibe la palabra ${hx8(pick(d, 'inst'))}${a ? ` (${code(a)})` : ''}. En el mismo flanco de reloj el PC pasa a <code>pc + 4</code>, salvo que haya un stall, un halt o una redirección desde EX.</p>`;
    },
    why: '<p>Cada ciclo se inicia una instrucción nueva: eso es lo que permite al pipeline terminar, idealmente, una instrucción por ciclo. En esta implementación la imem es combinacional (la instrucción aparece en el mismo ciclo en que se presenta la dirección) y se indexa con <code>addr[9:2]</code>: las direcciones son de byte pero cada instrucción mide 4 bytes, así que se descartan los 2 bits bajos.</p><p>Si la memoria fuera una BRAM de lectura síncrona, la instrucción llegaría un ciclo después de presentar el PC y habría que rediseñar IF (por ejemplo, usando la propia BRAM como parte del registro IF/ID).</p>',
    rtl: "assign instr = mem[addr[ADDR_W-1:2]];\n...\nassign pc_next = redirect ? redirect_target : (pc + 32'd4);",
    cost: '0 ciclos extra (1 instrucción por ciclo)',
  },
  decode: {
    title: 'Decode (ID)',
    block: 'control',
    what(ev, snap) {
      const d = dat(ev);
      const a = asmOf(ev, snap, 'ID');
      const c = pick(d, 'ctrl') || sig(snap).ctrl;
      let extra = '';
      if (c) {
        const on = ['reg_write', 'alu_src', 'mem_read', 'mem_write', 'branch', 'jump', 'halt'].filter((k) => c[k]).join(', ');
        extra = ` Banderas de control activas: <code>${on || 'ninguna'}</code>; el mux de escritura queda en <code>wb_sel=${c.wb_sel ?? '?'}</code> y la ALU recibe el código <code>alu_op=${c.alu_op ?? '?'}</code>.`;
      }
      return `<p>La unidad de control decodifica ${a ? code(a) : 'la instrucción de IF/ID'} mirando <code>opcode</code>, <code>funct3</code> y <code>funct7</code>.${extra}</p>`;
    },
    why: '<p>La instrucción es solo un número de 32 bits; alguien tiene que traducirlo a "qué hardware se enciende". En esta implementación esa traducción es <code>control.v</code>: un <code>case(opcode)</code> puramente combinacional, con valores seguros por defecto (un opcode desconocido se comporta como NOP). Las señales no se usan todas en ID: viajan por los registros de pipeline junto a la instrucción y se consumen en la etapa que las necesita (el control "acompaña" al dato).</p><p>Hay diseños que separan un control principal (por opcode) de un control de ALU (por funct3/funct7); acá todo está en un solo decodificador porque el conjunto es chico.</p>',
    rtl: "case (opcode)\n  R:    begin reg_write=1; alu_src=0; ... end\n  LOAD: begin reg_write=1; alu_src=1; mem_read=1; wb_sel=2'b01; end\n  SYS:  halt=1;\nendcase",
    cost: '0 ciclos',
  },
  regRead: {
    title: 'Lectura de registros',
    block: 'regfile',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const r1 = pick(d, 'rs1', 'idRs1') ?? s.idRs1, r2 = pick(d, 'rs2', 'idRs2') ?? s.idRs2;
      const v1 = pick(d, 'rdata1', 'value1') ?? s.idRdata1, v2 = pick(d, 'rdata2', 'value2') ?? s.idRdata2;
      return `<p>El banco de registros lee en paralelo <code>${xr(r1)} = ${hx(v1)}</code> y <code>${xr(r2)} = ${hx(v2)}</code>. La lectura es asincrónica (combinacional), así que los valores están disponibles dentro del mismo ciclo. <code>x0</code> siempre devuelve 0 por hardware.</p>`;
    },
    why: '<p>Los campos <code>rs1</code> (bits 19:15) y <code>rs2</code> (bits 24:20) están siempre en las mismas posiciones de la instrucción, así que se pueden leer <b>antes</b> de saber de qué formato es. Si la instrucción no usa esos registros (un <code>lui</code>, un <code>jal</code>) simplemente se ignora lo leído. Es más barato leer de más que decidir antes de leer.</p><p>Consecuencia que importa más adelante: como la lectura es "ciega", los comparadores de hazards también miran esos bits aunque no sean registros (ver el stall falso).</p>',
    rtl: "assign rdata1 = (raddr1 == 5'd0) ? 32'd0\n              : (BYPASS && wr && waddr == raddr1) ? wdata : regs[raddr1];",
    cost: '0 ciclos',
  },
  immGen: {
    title: 'Generación de inmediato',
    block: 'immgen',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const imm = pick(d, 'imm', 'value') ?? s.idImm;
      const sel = pick(d, 'immSel', 'imm_sel') ?? (s.ctrl && s.ctrl.imm_sel);
      const fmt = ['I', 'S', 'B', 'U', 'J'][sel];
      return `<p>immgen reordena los bits de la instrucción según <code>imm_sel=${sel ?? '?'}</code>${fmt ? ` (formato ${fmt})` : ''} y extiende el signo, produciendo <code>imm = ${hx8(imm)}</code>${typeof imm === 'number' ? ` (${imm | 0} con signo)` : ''}.</p>`;
    },
    why: '<p>Los cinco formatos con inmediato guardan la constante en lugares distintos, y no en orden. Esa aparente desprolijidad es deliberada: mantiene el bit de signo siempre en <code>inst[31]</code> (la extensión de signo empieza en paralelo con la decodificación) y hace que cada bit del inmediato venga de la menor cantidad posible de posiciones, lo que reduce el tamaño del mux de immgen. En B y J el bit 0 no se guarda porque los destinos son pares.</p>',
    rtl: "3'b001: imm = {{20{instr[31]}}, instr[31:25], instr[11:7]}; // S\n3'b010: imm = {{19{instr[31]}}, instr[31], instr[7], instr[30:25], instr[11:8], 1'b0}; // B",
    cost: '0 ciclos',
  },
  bypassWB: {
    title: 'Bypass WB → ID del regfile',
    block: 'regfile',
    hazard: { kind: 'raw', stage: 'ID' },
    resolver: {
      blocks: ['regfile', 'memwb'],
      wires: ['memwb-regfile'],
      title: 'Write-through dentro del banco de registros',
      html: '<p>El regfile compara la dirección que se escribe (<code>waddr</code>) con la que se lee (<code>raddr</code>) y, si coinciden en el mismo ciclo, entrega <code>wdata</code> directamente. Funciona porque el dato que WB está escribiendo ya está estable en el registro MEM/WB desde el comienzo del ciclo, así que puede pasar al lector por un camino puramente combinacional.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>En este mismo ciclo la instrucción en WB escribe ${code(xr(pick(d, 'reg', 'rd')))} con <code>${hx(pick(d, 'value'))}</code> y la instrucción en ID lo está leyendo${d.operand ? ` (operando ${d.operand})` : ''}. El regfile entrega el dato nuevo directamente (write-through) en vez del viejo que todavía guarda.</p>`;
    },
    why: '<p>La escritura ocurre recién en el flanco del reloj, pero la lectura es combinacional: sin ayuda, ID vería el valor anterior. Es la dependencia a distancia 3 (el productor está en WB cuando el consumidor está en ID). El libro clásico lo resuelve escribiendo en la primera mitad del ciclo y leyendo en la segunda; en una FPGA se prefiere un mux dentro del propio regfile (parámetro <code>BYPASS=1</code>) o escribir en el flanco opuesto.</p><p>Con este bypass y el forwarding hacia EX quedan cubiertas las distancias 1, 2 y 3; desde la 4 el dato ya está en el regfile.</p>',
    rtl: "(BYPASS && wr && waddr == raddr1) ? wdata : regs[raddr1]",
    cost: '0 ciclos',
  },
  fwdExMem: {
    title: 'Forwarding EX/MEM → EX',
    block: 'fwdMuxA',
    hazard: { kind: 'raw', stage: 'EX' },
    resolver: {
      blocks: ['forward', 'exmem', 'fwdMuxA', 'fwdMuxB'],
      wires: ['idex-forward', 'exmem-forward', 'forward-fwdMuxA', 'forward-fwdMuxB', 'exmem-fwdMuxA', 'exmem-fwdMuxB'],
      title: 'La unidad de forwarding cambia la fuente del operando',
      html: '<p>forward_unit compara los registros fuente de la instrucción en EX contra el destino de la que está en MEM y, si coinciden (y esa escribe y no es x0), manda <code>10</code> al mux del operando. Funciona porque el resultado de la instrucción anterior ya existe como <code>mem_result</code> a la salida de MEM, un camino combinacional que se puede llevar hacia atrás a la entrada de la ALU dentro del mismo ciclo.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>La instrucción de EX necesita ${code(xr(pick(d, 'reg', 'rs')))} (${opName(d)}), que la instrucción inmediatamente anterior (hoy en MEM) todavía no escribió en el regfile. forward_unit pone <code>forward = 2'b10</code> y el mux toma <code>mem_result = ${hx(pick(d, 'value'))}</code>, el valor que ya salió del mux wb_sel.</p>`;
    },
    why: '<p>El dato ya existe aunque no esté en el regfile. En lugar de esperar 2 ciclos hasta que la instrucción productora llegue a WB, se lo manda "hacia atrás" por un cable. Si dos instrucciones seguidas escriben el mismo registro, EX/MEM tiene prioridad sobre MEM/WB porque contiene el valor más reciente.</p><p>En esta implementación lo que se adelanta es <code>mem_result</code> (después del mux wb_sel), no solo la salida de la ALU: por eso también sirven LUI, JAL (PC+4) y el dato de un load. Con un load a distancia 1 no alcanza, porque el dato de memoria recién se conoce al final de MEM: ver load-use.</p>',
    rtl: "if (mem_reg_write && (mem_rd != 5'b0)) begin\n  if (mem_rd == ex_rs1) forward_a = 2'b10;\n  if (mem_rd == ex_rs2) forward_b = 2'b10;\nend",
    cost: '0 ciclos (se evita una burbuja de 2 ciclos)',
  },
  fwdMemWb: {
    title: 'Forwarding MEM/WB → EX',
    block: 'fwdMuxA',
    hazard: { kind: 'raw', stage: 'EX' },
    resolver: {
      blocks: ['forward', 'memwb', 'fwdMuxA', 'fwdMuxB'],
      wires: ['idex-forward', 'memwb-forward', 'forward-fwdMuxA', 'forward-fwdMuxB', 'memwb-fwdMuxA', 'memwb-fwdMuxB'],
      title: 'Segunda fuente del forwarding: el registro MEM/WB',
      html: '<p>Cuando el productor está dos instrucciones adelante, su resultado ya viajó a MEM/WB como <code>wb_result</code>. forward_unit elige <code>01</code> solo si EX/MEM no coincide con el mismo registro, y el mux lleva ese valor a la ALU. Funciona porque <code>wb_result</code> es una salida de flip-flops, estable desde el inicio del ciclo.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>${code(xr(pick(d, 'reg', 'rs')))} (${opName(d)}) lo produjo una instrucción que está dos posiciones adelante y que ahora está en WB. forward_unit selecciona <code>2'b01</code> y el mux toma <code>wb_result = ${hx(pick(d, 'value'))}</code>.</p>`;
    },
    why: '<p>Cubre la dependencia a distancia 2. Solo se usa si EX/MEM no coincide con el mismo registro: el RTL lo verifica con <code>!(mem_reg_write &amp;&amp; mem_rd == ex_rs1)</code> para respetar la prioridad del dato más reciente.</p><p>También es el camino que usa un consumidor después de un stall de load-use: tras la burbuja, el load ya está en WB y su dato llega por acá.</p>',
    rtl: "if (wb_reg_write && (wb_rd != 5'b0)) begin\n  if (wb_rd == ex_rs1 && !(mem_reg_write && mem_rd == ex_rs1))\n    forward_a = 2'b01;\nend",
    cost: '0 ciclos (se evita una burbuja de 1 ciclo)',
  },
  loadUseStall: {
    title: 'Load-use stall',
    block: 'hazard',
    hazard: { kind: 'loadUse', stage: 'ID' },
    resolver: {
      blocks: ['hazard', 'pc', 'ifid', 'idex'],
      wires: ['ifid-hazard', 'idex-hazard', 'hazard-pc', 'hazard-ifid', 'hazard-idex'],
      title: 'La hazard unit congela IF/ID y mete una burbuja en EX',
      html: '<p>hazard_unit ve un load en EX y a la instrucción dependiente en ID: congela el PC y el registro IF/ID (así IF e ID repiten su trabajo) y fuerza una burbuja en ID/EX. Funciona porque un ciclo de espera hace que el load avance a WB y su dato pueda llegar a la dependiente por forwarding MEM/WB, es decir, "hacia adelante" en el tiempo.</p>',
    },
    what(ev, snap) {
      const d = dat(ev);
      const opd = d.operand || (d.matchRs1 && d.matchRs2 ? 'A y B' : d.matchRs1 ? 'A' : d.matchRs2 ? 'B' : '');
      return `<p>Hay un load en EX que escribe ${code(xr(pick(d, 'reg', 'ex_rd')))} y la instrucción en ID lo lee${opd ? ` (operando ${opd})` : ''}. El dato recién se obtiene al final de MEM, así que este diseño espera un ciclo. hazard_unit levanta <code>stall</code>: el PC y IF/ID se congelan y se inserta una burbuja en ID/EX.</p>`;
    },
    why: '<p>En un pipeline clásico es el único RAW que el forwarding no resuelve: el valor sale de dmem al final de MEM, pero el consumidor lo necesita al principio de EX en ese mismo ciclo, y un cable no puede viajar hacia atrás en el tiempo. Una burbuja basta: al ciclo siguiente el load está en WB y el consumidor toma el dato por forwarding MEM/WB.</p><p>Observación: en esta implementación la dmem es de lectura combinacional y su salida ya entra a <code>mem_result</code>, así que el stall es conservador (una variante sin stall sería funcional, a costa de encadenar dmem y ALU en un ciclo). Ver la lección de load-use.</p><p>El costo se puede reducir por software (el compilador pone una instrucción independiente entre el load y su uso; MIPS I lo exponía como "load delay slot") o por hardware (una memoria de menor latencia). En otros pipelines con más etapas de memoria el stall es de 2 ciclos o más.</p>',
    rtl: "if (ex_mem_read && (ex_rd != 5'd0))\n  if ((ex_rd == id_rs1) || (ex_rd == id_rs2))\n    stall = 1'b1;",
    cost: '1 burbuja',
  },
  falseStall: {
    title: 'Stall falso (quirk de diseño)',
    block: 'hazard',
    hazard: { kind: 'falseStall', stage: 'ID' },
    resolver: {
      blocks: ['hazard', 'pc', 'ifid', 'idex'],
      wires: ['ifid-hazard', 'idex-hazard', 'hazard-pc', 'hazard-ifid', 'hazard-idex'],
      title: 'El mismo mecanismo de stall, pero disparado sin necesidad',
      html: '<p>Es la misma maquinaria del load-use: congela PC e IF/ID y mete una burbuja. Es correcta porque nunca omite un stall necesario (solo agrega uno de más); el costo es un ciclo perdido. Se evitaría con dos bits, <code>uses_rs1</code> y <code>uses_rs2</code>, derivados del opcode.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>hazard_unit detectó coincidencia entre el destino del load (${code(xr(pick(d, 'reg', 'ex_rd')))}) y el campo <code>${(d.operand === 'B' || d.field === 'rs2') ? 'inst[24:20]' : 'inst[19:15]'}</code> de la instrucción en ID. Pero esa instrucción <b>no usa</b> ese campo como registro fuente (por ejemplo, en un <code>addi</code> esos bits son parte del inmediato y en <code>lui</code>/<code>jal</code> son parte de la constante). Resultado: una burbuja que no hacía falta.</p>`;
    },
    why: '<p>La unidad compara <code>id_rs1 = inst[19:15]</code> e <code>id_rs2 = inst[24:20]</code> siempre, sin mirar el formato (lo mismo hace el banco de registros al leer). Es correcto pero conservador. <b>Cómo se arreglaría:</b> decodificar <code>uses_rs1</code> y <code>uses_rs2</code> desde el opcode (rs1 lo usan todos menos LUI, AUIPC, JAL y SYSTEM; rs2 lo usan R, S y B) y exigir <code>(ex_rd == id_rs1 &amp;&amp; uses_rs1) || (ex_rd == id_rs2 &amp;&amp; uses_rs2)</code>.</p><p>El forward_unit tiene el mismo defecto, pero allí no cuesta ciclos: solo hace selecciones del mux que nadie usa.</p>',
    rtl: "// hazard_unit.v: no mira uses_rs1 / uses_rs2\nif ((ex_rd == id_rs1) || (ex_rd == id_rs2)) stall = 1'b1;",
    cost: '1 burbuja evitable',
  },
  rawStallNoFwd: {
    title: 'Stall por RAW (sin forwarding)',
    block: 'hazard',
    hazard: { kind: 'raw', stage: 'ID' },
    resolver: {
      blocks: ['hazard', 'pc', 'ifid', 'idex'],
      wires: ['ifid-hazard', 'idex-hazard', 'hazard-pc', 'hazard-ifid', 'hazard-idex'],
      title: 'Interlock: esperar a que el dato llegue al regfile',
      html: '<p>Sin forwarding la única fuente válida es el banco de registros. La hazard unit congela IF/ID y mete burbujas hasta que el productor llega a WB, donde el bypass interno del regfile entrega el dato. Funciona porque, una vez escrito el registro, la lectura ya devuelve el valor correcto; a cambio se pierden hasta 2 ciclos por dependencia.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>Modo didáctico sin forwarding (no existe en el RTL): la instrucción en ID depende de ${code(xr(pick(d, 'reg', 'rd')))}, que todavía no se escribió en el regfile (el productor está en EX o MEM). El pipeline detiene IF/ID hasta que el productor llegue a WB y el bypass interno del regfile entregue el dato.</p>`;
    },
    why: '<p>Es la alternativa más simple: hardware mínimo (solo detección), pero cada dependencia cuesta hasta 2 burbujas (3 si el regfile no tuviera su bypass). Sirve para medir cuánto aporta el forwarding comparando el CPI de ambos modos sobre el mismo programa.</p>',
    rtl: '// no está en el RTL: modo didáctico de la GUI\n// stall = (ex_rd == id_rs1 || mem_rd == id_rs1 ...) con reg_write',
    cost: 'Hasta 2 burbujas por dependencia',
  },
  branchTaken: {
    title: 'Branch tomado',
    block: 'branch',
    hazard: { kind: 'control', stage: 'EX' },
    resolver: {
      blocks: ['branch', 'alu', 'flush', 'pc', 'ifid', 'idex'],
      wires: ['idex-branch', 'alu-branch', 'branch-pc', 'branch-flush', 'flush-ifid', 'flush-idex'],
      title: 'Redirección del PC y descarte de lo que se buscó de más',
      html: '<p>branch_unit combina las banderas de la ALU con <code>funct3</code> para decidir; si se toma, el PC carga el destino y flush_unit convierte en burbujas las dos instrucciones más jóvenes. Funciona porque ninguna instrucción modifica registros ni memoria antes de MEM/WB, así que anularlas con ceros en el control deshace todo su efecto.</p>',
    },
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const t = pick(d, 'target') ?? s.redirectTarget;
      return `<p>En EX la ALU comparó los operandos (<code>zero=${s.zero ? 1 : 0}, lt=${s.lt ? 1 : 0}, ltu=${s.ltu ? 1 : 0}</code>) y branch_unit decidió <b>tomar</b> el salto hacia <code>${hx(t)}</code>. Se activa <code>redirect</code>: el PC toma ese destino y las dos instrucciones más jóvenes (las que estaban en ID e IF) se descartan.</p>`;
    },
    why: '<p>Este pipeline predice implícitamente "no tomado": sigue buscando <code>PC+4</code> sin hardware adicional. Cuando el salto se toma, recién se descubre en EX, tres etapas después del fetch, y por eso hay 2 instrucciones equivocadas en vuelo. El destino <code>pc + imm</code> lo calcula un sumador propio dentro de branch_unit.</p><p>Otras opciones: resolver en ID (penalidad 1, pero hace falta un comparador y forwarding hacia ID), predicción estática "hacia atrás tomado" o predictores dinámicos con una tabla de historia. Los delay slots de MIPS no existen en RISC-V.</p>',
    rtl: "wire branch_taken = ex_branch & bu_taken;\nassign redirect = branch_taken | ex_jump;\nassign pc_next  = redirect ? redirect_target : (pc + 32'd4);",
    cost: '2 burbujas (penalidad de salto)',
  },
  branchNotTaken: {
    title: 'Branch no tomado',
    block: 'branch',
    what(ev, snap) {
      const s = sig(snap);
      return `<p>branch_unit evaluó la condición con <code>zero=${s.zero ? 1 : 0}, lt=${s.lt ? 1 : 0}, ltu=${s.ltu ? 1 : 0}</code> y el salto <b>no</b> se toma. La predicción implícita "no tomado" era correcta y el pipeline continúa con las instrucciones que ya estaban en IF/ID.</p>`;
    },
    why: '<p>Es el caso feliz de esta microarquitectura: como siempre se asume "no tomado", acertar no cuesta nada. Por eso conviene que el compilador deje el caso más frecuente como "caer de largo", o que el hardware use una predicción mejor (ver alternativas del bloque).</p>',
    rtl: "3'b000: branch_taken =  zero;   // BEQ\n3'b001: branch_taken = ~zero;  // BNE\n3'b100: branch_taken =  alu_lt; // BLT",
    cost: '0 ciclos',
  },
  jump: {
    title: 'Salto incondicional (JAL / JALR)',
    block: 'branch',
    hazard: { kind: 'control', stage: 'EX' },
    resolver: {
      blocks: ['branch', 'alu', 'flush', 'pc', 'ifid', 'idex'],
      wires: ['idex-branch', 'alu-branch', 'branch-pc', 'branch-flush', 'flush-ifid', 'flush-idex'],
      title: 'Siempre se redirige: el destino viene de branch_unit o de la ALU',
      html: '<p>Para JAL el destino <code>pc + imm</code> sale del sumador de branch_unit; para JALR sale de la ALU (<code>rs1 + imm</code> con el bit 0 en cero). En ambos casos <code>redirect</code> carga el PC y flush_unit descarta las dos instrucciones siguientes. Funciona por la misma razón que el branch tomado: lo descartado todavía no tuvo ningún efecto visible.</p>',
    },
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const t = pick(d, 'target') ?? s.redirectTarget;
      const jalr = pick(d, 'is_jalr', 'jalr');
      return `<p>${jalr ? 'JALR' : 'JAL'} llega a EX y siempre redirige al PC hacia <code>${hx(t)}</code>${jalr ? ' (lo calcula la ALU como <code>(rs1+imm) &amp; ~1</code>)' : ' (lo calcula branch_unit como <code>pc+imm</code>)'}. La dirección de retorno <code>PC+4</code> viaja por <code>wb_sel=10</code> y se escribe en <code>rd</code> al llegar a WB.</p>`;
    },
    why: '<p>Un salto incondicional se sabe que se toma ya en ID, y el destino de JAL no depende de ningún registro; pero esta implementación no lo aprovecha: lo resuelve en EX igual que un branch, para no duplicar hardware. Otros diseños resuelven JAL en ID y pierden 1 ciclo en vez de 2.</p><p>JALR es inherentemente más lento: necesita el valor de un registro (que puede venir por forwarding) antes de conocer el destino. Los procesadores de alto rendimiento usan una pila de direcciones de retorno para predecirlo.</p>',
    rtl: "wire [31:0] redirect_target = ex_is_jalr ? (alu_out & ~32'h1) : bu_target;\nassign redirect = branch_taken | ex_jump;",
    cost: '2 burbujas',
  },
  flush: {
    title: 'Flush del pipeline',
    block: 'flush',
    hazard: { kind: 'control', stage: 'EX' },
    resolver: {
      blocks: ['flush', 'ifid', 'idex', 'pc'],
      wires: ['branch-flush', 'flush-ifid', 'flush-idex', 'branch-pc'],
      title: 'flush_unit anula los registros más jóvenes que el salto',
      html: '<p>flush_unit reenvía <code>redirect</code> a IF/ID (que carga un NOP) y a ID/EX (que carga ceros en todo el control). Funciona porque una instrucción con el control en cero no escribe registros, no escribe memoria ni redirige el PC: es una burbuja inofensiva que avanza hasta salir del pipeline.</p>',
    },
    what(ev) {
      const d = dat(ev);
      return `<p>flush_unit propaga <code>redirect</code> a <code>flush_if_id</code> y <code>flush_id_ex</code>: las dos instrucciones del camino equivocado${d.killed ? ` (${d.killed})` : ''} se convierten en burbujas (NOP con todas las señales de control en 0). No llegan a modificar registros ni memoria.</p>`;
    },
    why: '<p>Como todo efecto arquitectónico ocurre en MEM (stores) o WB (registros), basta con anular los registros de pipeline más jóvenes que el salto: no hace falta deshacer nada. Anular significa convertir la instrucción en un NOP, o poner a cero sus señales de control, o marcarla con un bit de "válida" (esta implementación usa lo primero).</p><p>Un flush nunca coincide con un stall de load-use en este core: el stall exige un load en EX y el redirect exige un branch/jump en EX, y EX solo tiene una instrucción. En diseños donde pueden coincidir, hay que decidir cuál tiene prioridad (el flush debería ganar).</p>',
    rtl: "assign flush_if_id = redirect;\nassign flush_id_ex = redirect;",
    cost: '2 burbujas',
  },
  aluOp: {
    title: 'Operación de la ALU',
    block: 'alu',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const op = pick(d, 'name', 'op', 'alu_op') ?? s.aluOp;
      const a = pick(d, 'a') ?? s.aluA, b = pick(d, 'b') ?? s.aluB, out = pick(d, 'out', 'result') ?? s.aluOut;
      return `<p>La ALU ejecuta <code>${op ?? '?'}</code> con A=<code>${hx(a)}</code> y B=<code>${hx(b)}</code>, obteniendo <code>${hx(out)}</code>. Además calcula siempre <code>zero</code>, <code>lt</code> y <code>ltu</code>, que branch_unit usa si la instrucción es un branch.</p>`;
    },
    why: '<p>La misma ALU resuelve tres trabajos: aritmética y lógica de las instrucciones R e I, cálculo de dirección en loads/stores (<code>rs1 + imm</code>) y comparación en branches. En los shifts solo cuentan los 5 bits bajos de B (porque en SRAI los bits altos del inmediato valen <code>0100000</code> y contaminarían la cantidad).</p>',
    rtl: "OP_ADD: alu_result = i_data_a + i_data_b;\nOP_SLL: alu_result = i_data_a << shamt;\nassign o_lt  = (i_data_a < i_data_b);",
    cost: '0 ciclos (1 ciclo de EX)',
  },
  memRead: {
    title: 'Lectura de memoria de datos',
    block: 'dmem',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const addr = pick(d, 'addr') ?? s.memAddr, val = pick(d, 'value', 'data') ?? s.memRData;
      return `<p>El load lee la palabra en <code>addr = ${hx(addr)}</code> (índice de palabra <code>addr[9:2]</code>, byte dentro de la palabra <code>addr[1:0]</code>). dmem selecciona el byte o la media palabra según <code>funct3</code> y extiende con signo (LB, LH) o con ceros (LBU, LHU) para entregar <code>${hx(val)}</code>.</p>`;
    },
    why: '<p>En esta implementación la lectura de dmem es combinacional (se infiere como RAM distribuida o LUTRAM en la FPGA). Por eso el dato aparece dentro de MEM, y para loads el mux wb_sel lo toma de allí. Si la memoria fuese una BRAM síncrona, el dato llegaría un ciclo después, y habría que absorber esa latencia (por ejemplo, una etapa más o un stall más largo en load-use).</p>',
    rtl: "3'b000: rdata = {{24{b[7]}}, b};   // LB\n3'b010: rdata = word;            // LW\n3'b100: rdata = {24'b0, b};      // LBU",
    cost: '0 ciclos (pero genera load-use stall si se usa de inmediato)',
  },
  memWrite: {
    title: 'Escritura en memoria de datos',
    block: 'dmem',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const addr = pick(d, 'addr') ?? s.memAddr, val = pick(d, 'value', 'data') ?? s.memWData, be = pick(d, 'be') ?? s.memBe;
      return `<p>El store escribe <code>${hx(val)}</code> en <code>addr = ${hx(addr)}</code> con byte-enables <code>${typeof be === 'number' ? be.toString(2).padStart(4, '0') : '?'}</code>. Solo los carriles habilitados cambian; el resto de la palabra queda intacto.</p>`;
    },
    why: '<p>dmem está formada por 4 carriles de bytes (lane0..lane3). SB, SH y SW generan distintos <code>be</code> y el dato se replica en los carriles para que cada byte llegue a su lugar. La escritura es síncrona (en el flanco de reloj) y sucede en MEM, nunca de manera especulativa: ninguna instrucción descartada por un flush llega a MEM con <code>mem_write</code> activo.</p>',
    rtl: "2'b00: be = 4'b0001 << boff;  // SB\n2'b01: be = boff[1] ? 4'b1100 : 4'b0011; // SH\ndefault: be = 4'b1111;  // SW",
    cost: '0 ciclos',
  },
  writeback: {
    title: 'Write-back',
    block: 'memwb',
    what(ev, snap) {
      const d = dat(ev); const s = sig(snap);
      const rd = pick(d, 'rd', 'reg') ?? s.wbRd, v = pick(d, 'value', 'data') ?? s.wbData;
      return `<p>En WB se escribe <code>${hx(v)}</code> en ${code(xr(rd))} en el próximo flanco del reloj. El valor ya fue seleccionado en MEM por el mux <code>wb_sel</code> y viaja por MEM/WB como <code>wb_result</code>. Escribir en <code>x0</code> no tiene efecto.</p>`;
    },
    why: '<p>En esta implementación la etapa WB es solo un registro y el cable de vuelta al regfile: el trabajo de elegir entre ALU, dmem, PC+4 e inmediato se adelantó a MEM para poder hacer forwarding con ese mismo valor ya seleccionado. Es una decisión de este diseño; en el libro clásico el mux está en WB.</p>',
    rtl: "else if (we && waddr != 5'd0) regs[waddr] <= wdata;",
    cost: '0 ciclos',
  },
  haltDetected: {
    title: 'Halt detectado (ECALL/EBREAK)',
    block: 'control',
    what() {
      return '<p>La unidad de control decodificó un opcode SYSTEM. Desde que la instrucción llega a EX se activa <code>halting</code> (una bandera pegajosa), que anula el fetch y las instrucciones más jóvenes: nada posterior a la instrucción de halt se ejecuta.</p>';
    },
    why: '<p>Se logra una parada precisa: las instrucciones anteriores terminan normalmente y las posteriores no tienen efecto. Se detecta en EX y no en ID a propósito: una instrucción en ID todavía podría ser del camino equivocado de un branch, pero cuando una instrucción llega a EX ya se sabe que no será descartada, así que no hay halt especulativo.</p><p>El reloj no se toca: la parada se implementa con la señal de enable de los flip-flops (ver la lección de HALT).</p>',
    rtl: "SYS: halt=1;\nwire stop_fetch = ex_halt | halting;\nassign flush_if_id = flush_if_id_r | stop_fetch;",
    cost: '0 ciclos (el pipeline se vacía)',
  },
  halted: {
    title: 'CPU detenido',
    block: 'debug',
    what() {
      return '<p>El halt llegó a WB: todas las instrucciones anteriores se retiraron y <code>o_halt</code> sube a 1. La debug unit lo informa al host con el byte <code>H</code> (si estaba en modo run) y el LED de halt se enciende.</p>';
    },
    why: '<p>Desde el halt el host puede pedir un dump <code>D</code> de 86 palabras y ver el PC, los registros de pipeline, los 32 registros y 32 palabras de dmem. Un reset <code>X</code> deja el CPU listo para volver a ejecutar el mismo programa (la imem se conserva y la dmem tampoco se borra).</p>',
    rtl: "assign o_halt = wb_halt;",
    cost: 'Fin del programa',
  },
  bubble: {
    title: 'Burbuja',
    block: 'idex',
    what(ev) {
      const d = dat(ev);
      return `<p>La etapa ${ev && ev.stage ? '<b>' + ev.stage + '</b> ' : ''}contiene una burbuja${d.cause ? ` (causa: ${d.cause})` : ''}: una "instrucción" con todas las señales de control en 0, que no escribe registros, ni memoria, ni redirige el PC.</p>`;
    },
    why: '<p>Las burbujas son el precio de los hazards. Cada una es un ciclo en el que una etapa no hace trabajo útil, y se refleja directamente en el CPI: <code>CPI = 1 + burbujas / instrucciones</code>. En esta implementación se fabrican poniendo a cero el control en ID/EX (por stall o flush) o cargando un NOP en IF/ID.</p>',
    rtl: "// flush: los registros de control se ponen en 0\nif (flush) begin reg_write <= 0; mem_read <= 0; ... end",
    cost: '1 ciclo de una etapa sin trabajo útil',
  },
};

export const GLOSSARY = {
  'ISA': '<p>Arquitectura del conjunto de instrucciones: el <b>contrato</b> entre software y hardware. Define qué instrucciones existen, cómo se codifican, cuántos registros hay y qué efecto tiene cada una. RISC-V es una ISA; un programa escrito para ella debe dar el mismo resultado en cualquier implementación.</p>',
  'Microarquitectura': '<p>La forma concreta de cumplir el contrato de la ISA: monociclo, multiciclo, segmentada, con o sin predictores. Cambia <i>cuándo</i> pasan las cosas, nunca <i>qué resultado</i> dan. Este repo implementa RV32I con un pipeline in-order de 5 etapas.</p>',
  'RV32I': '<p>Conjunto base de instrucciones enteras de 32 bits de RISC-V: 32 registros de 32 bits, aritmética, lógica, loads/stores, branches y saltos. No incluye multiplicación (extensión M) ni CSRs/excepciones. Esta implementación cubre las instrucciones de usuario más ecall/ebreak como halt.</p>',
  'Pipeline': '<p>Técnica que solapa la ejecución de varias instrucciones dividiéndolas en etapas (IF, ID, EX, MEM, WB en esta implementación; otros diseños usan más o menos). Como en una línea de montaje, cada etapa trabaja en una instrucción distinta en cada ciclo.</p>',
  'Hazard': '<p>Situación que impide que la siguiente instrucción se ejecute en el ciclo previsto sin dar un resultado incorrecto. Hay tres tipos: estructurales, de datos y de control.</p>',
  'Hazard RAW': '<p>Read After Write: una instrucción lee un registro que una anterior todavía no escribió. Es el hazard de datos que ocurre en un pipeline in-order. WAR y WAW no pasan acá porque todos leen en ID, escriben en WB y siempre en orden de programa.</p>',
  'Hazard estructural': '<p>Dos instrucciones necesitan el mismo recurso hardware en el mismo ciclo. Esta implementación lo evita con memorias separadas de instrucciones y de datos (Harvard) y un regfile con 2 lecturas y 1 escritura.</p>',
  'Hazard de control': '<p>El PC siguiente depende del resultado de un salto que todavía no se resolvió. En esta implementación se resuelve en EX, con 2 instrucciones equivocadas ya en vuelo.</p>',
  'Burbuja': '<p>Una instrucción vacía (NOP, o control en 0) insertada para ganar tiempo o para anular algo. No hace daño pero tampoco trabajo útil: es un ciclo desperdiciado.</p>',
  'Stall': '<p>Congelar las etapas anteriores (PC e IF/ID) mientras se inserta una burbuja en las siguientes. En esta implementación lo causa el load-use y, en el modo didáctico sin forwarding, cualquier dependencia RAW.</p>',
  'Flush': '<p>Descartar instrucciones que entraron al pipeline por un camino equivocado, convirtiéndolas en burbujas. Ocurre con branches tomados, saltos y al detectar un halt.</p>',
  'Forwarding': '<p>También llamado bypass. Lleva el resultado de una instrucción directamente desde un registro de pipeline (EX/MEM o MEM/WB) a la entrada de la ALU, sin esperar a que se escriba en el regfile.</p>',
  'Bypass del regfile': '<p>Write-through: si en el mismo ciclo se escribe y se lee el mismo registro, la lectura devuelve el dato nuevo. Evita el hazard de distancia 3 sin pasar por forward_unit.</p>',
  'Load-use': '<p>Dependencia entre un load y la instrucción siguiente que usa su resultado. En este pipeline es el único caso donde el forwarding no basta y se necesita 1 burbuja.</p>',
  'CPI': '<p>Ciclos por instrucción. En un pipeline ideal vale 1. Con hazards: <code>CPI = 1 + (burbujas totales) / (instrucciones retiradas)</code>. Junto con el período del reloj y la cantidad de instrucciones fija el tiempo de ejecución: <code>T = N × CPI × T_clk</code>.</p>',
  'IPC': '<p>Instrucciones por ciclo, la inversa del CPI. Los procesadores superescalares superan 1.</p>',
  'Latencia vs throughput': '<p>Latencia: cuánto tarda una instrucción individual de punta a punta (5 ciclos acá). Throughput: cuántas instrucciones terminan por ciclo (hasta 1). El pipeline mejora el throughput, no la latencia (incluso la empeora un poco por el overhead de los registros).</p>',
  'Camino crítico': '<p>El camino combinacional más largo entre dos registros (incluyendo ruteo en una FPGA). Define el período mínimo del reloj. En esta implementación, tras el ruteo, no cierra a 100 MHz: dmem → forwarding → ALU → branch → flush.</p>',
  'Ruta crítica': '<p>Sinónimo de camino crítico: el camino combinacional más largo entre dos registros, que define el período mínimo del reloj.</p>',
  'Slack': '<p>Margen de tiempo de un camino: tiempo requerido menos tiempo de llegada. Positivo = cumple; negativo = falla. El peor slack de setup se llama WNS; con él se estima <code>f_max ≈ 1 / (T_clk − WNS)</code>.</p>',
  'Skew': '<p>Diferencia en el instante en que el mismo flanco de reloj llega a dos flip-flops distintos. Lo genera la distribución del reloj, no la lógica de datos; es pequeño con redes globales (BUFG) y grande si el reloj pasa por lógica común.</p>',
  'Setup y hold': '<p>Setup: el dato debe estar estable un tiempo <i>antes</i> del flanco. Hold: debe seguir estable un tiempo <i>después</i>. El análisis estático de timing verifica ambos para todos los caminos entre flip-flops.</p>',
  'Registro de pipeline': '<p>Banco de flip-flops entre dos etapas (IF/ID, ID/EX, EX/MEM, MEM/WB) que guarda los datos y las señales de control de la instrucción que avanza. Todo lo que una instrucción necesita más adelante tiene que viajar con ella.</p>',
  'Predicción de saltos': '<p>Adivinar el resultado de un branch antes de resolverlo para no perder ciclos. Esta implementación predice "no tomado" de forma implícita, sin hardware extra.</p>',
  'Penalidad de salto': '<p>Ciclos perdidos cuando la predicción falla. En esta implementación son 2, porque el salto se resuelve en EX.</p>',
  'Extensión de signo': '<p>Replicar el bit más significativo de un valor corto para obtener su equivalente en más bits conservando el valor con signo (−1 de 12 bits sigue siendo −1 de 32). La extensión con ceros, en cambio, la usan lbu y lhu.</p>',
  'Little-endian': '<p>El byte menos significativo se guarda en la dirección más baja. Es el orden de RISC-V y también el de las palabras en el protocolo UART de la debug unit.</p>',
  'Byte lanes': '<p>La dmem se organiza como cuatro bancos de 8 bits (carriles), cada uno con su habilitación de escritura. Permite SB/SH/SW con un solo puerto de escritura y sin tocar los demás bytes de la palabra.</p>',
  'Alineación': '<p>Un acceso de N bytes está alineado si su dirección es múltiplo de N. En esta implementación un acceso desalineado no genera trap: se comporta según los bits bajos de la dirección. Otros diseños lo soportan partiéndolo en dos accesos o lo tratan como excepción.</p>',
  'Halt preciso': '<p>Al detenerse, todas las instrucciones anteriores completaron y ninguna posterior produjo efectos. Facilita la depuración y es la base de las excepciones precisas.</p>',
  'Enable síncrono': '<p>Entrada de clock enable de un flip-flop: si vale 0, el flip-flop conserva su valor aunque llegue el flanco. Es la forma correcta de "pausar" un diseño sin tocar el reloj; los flip-flops de las FPGA Xilinx tienen un pin CE dedicado.</p>',
  'Clock gating': '<p>Bloquear el reloj con lógica (por ejemplo, un AND con una habilitación). En una FPGA genera skew, glitches y rompe el análisis de timing, por eso este repo pausa el CPU con enables síncronos.</p>',
  'MMCM': '<p>Mixed-Mode Clock Manager: bloque de la FPGA que genera relojes de otras frecuencias a partir del oscilador de la placa. Acá divide 100 MHz por 2 (VCO a 1000 MHz, salida dividida por 20) y expone una señal <code>locked</code> que indica cuándo el reloj nuevo es estable.</p>',
  'UART 8N1': '<p>Comunicación serie asincrónica con 8 bits de datos, sin paridad y 1 bit de stop (más un bit de start): 10 tiempos de bit por byte. La debug unit usa 19200 baudios.</p>',
  'Baud rate': '<p>Velocidad de la línea serie en símbolos (bits) por segundo. A 19200 baudios un bit dura unos 52 µs y un byte (10 bits) unos 521 µs. Emisor y receptor deben acordarla de antemano, porque no comparten reloj.</p>',
  'Sobremuestreo': '<p>Muestrear la línea serie 16 veces por bit para encontrar el centro de cada bit y tolerar pequeñas diferencias de reloj. El generador de baud produce un tick cada <code>CLK/(16·baud)</code> ciclos (162 a 50 MHz y 19200).</p>',
  'Metaestabilidad': '<p>Estado indefinido de un flip-flop que captura una señal justo cuando cambia. Puede tardar un tiempo impredecible en resolverse a 0 o a 1. Se mitiga pasando toda señal asincrónica por dos flip-flops en cadena (sincronizador 2FF).</p>',
  'Sincronizador 2FF': '<p>Dos flip-flops en cadena que reciben una señal asincrónica. El primero puede quedar metaestable; con un ciclo completo para resolverse, el segundo entrega un valor limpio. En este repo lo usan la línea RX y el botón de reset.</p>',
  'FIFO': '<p>Cola primero-en-entrar-primero-en-salir. La UART usa una FIFO de 4 bytes en RX y otra en TX para desacoplar la velocidad del serial de la de la debug unit; si la de TX se llena, la FSM espera.</p>',
  'FSM': '<p>Máquina de estados finitos. La debug unit es una FSM de 11 estados (IDLE, LOAD_*, DUMP_*, REPLY); en este repo cada FSM se parte en tres módulos: la lógica del próximo estado, el camino de datos combinacional y los registros.</p>',
  'Debug unit': '<p>Bloque de hardware dentro de la FPGA que interpreta comandos de la PC por UART, carga el programa en la imem, controla la ejecución (paso, corrida, pausa, reset) y devuelve el estado del CPU. Es el "depurador" del sistema.</p>',
  'Dump': '<p>Volcado del estado del CPU hacia la PC: en este repo son 86 palabras de 32 bits (PC, registros de pipeline, señales de EX, los 32 registros y 32 palabras de dmem), precedidas por su cantidad.</p>',
  'Memoria mapeada (MMIO)': '<p>Periféricos accesibles con loads y stores a direcciones reservadas. En este repo la UART no está mapeada: la debug unit la maneja por hardware, no el programa.</p>',
  'Harvard': '<p>Arquitectura con memoria de instrucciones y de datos separadas. Esta implementación la usa para que IF y MEM accedan a memoria en el mismo ciclo, evitando el hazard estructural.</p>',
  'BRAM': '<p>Block RAM: bloque dedicado de memoria de la FPGA (18/36 Kb). Tiene lectura <b>síncrona</b> (el dato aparece un ciclo después de presentar la dirección). Es ideal para memorias grandes, pero obliga a rediseñar IF/MEM si el pipeline espera lectura inmediata.</p>',
  'LUTRAM': '<p>RAM distribuida: memoria armada con las LUTs de la FPGA. Tiene lectura <b>asíncrona</b> y sirve para memorias chicas, como el regfile y la dmem de este repo (1 KB).</p>',
  'Testbench autoverificable': '<p>Módulo de simulación que genera estímulos, compara cada resultado contra el valor esperado y reporta solo las diferencias (PASS/FAIL). Permite correr muchos casos después de cada cambio sin mirar formas de onda.</p>',
  'Golden model': '<p>Implementación de referencia, simple y obviamente correcta (por ejemplo, un simulador en Python que ejecuta una instrucción por vez), contra la que se compara el estado final del diseño. Acá: <code>host/tests/rv32i_model.py</code>.</p>',
  'Pseudoinstrucción': '<p>Instrucción que el ensamblador acepta pero traduce a una real: <code>nop</code>, <code>mv</code>, <code>li</code>, <code>j</code>, <code>ret</code>... No existe en el hardware.</p>',
  'Ensamblador de dos pasadas': '<p>Primera pasada: recorrer el programa contando direcciones y armar la tabla de símbolos (etiqueta → dirección). Segunda: codificar cada instrucción; en branches y jal el desplazamiento es dirección de la etiqueta menos dirección de la instrucción. Resuelve las referencias hacia adelante.</p>',
  'Superescalar': '<p>Procesador que emite varias instrucciones por ciclo. Necesita más puertos de regfile, más ALUs y lógica de hazards mucho más compleja.</p>',
  'Ejecución fuera de orden': '<p>El hardware reordena instrucciones para ocultar latencias (Tomasulo, scoreboard, ROB). Este core es in-order.</p>',
};
