# Contrato interno de visual-riscv

Este documento es la referencia compartida entre los módulos `sim/`, `scene/`, `ui/` y `content/`. Todo el código va en JS ES modules, sin TypeScript, y todo el texto visible está en español.

Fuente de verdad del hardware: el RTL en
`/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sources_1/new/`
(cuando el RTL y un README no coinciden, vale el RTL).

## IDs de bloque (los usan la escena, el inspector, los pop-ups y las alternativas)
```
pc imem ifid control regfile immgen idex fwdMuxA fwdMuxB aluSrcMux alu branch
exmem dmem wbMux memwb hazard forward flush debug uart
```
- `wbMux` es el mux wb_sel. Está en la etapa MEM, porque en el RTL `mem_result` se calcula en MEM y MEM/WB guarda `wb_result` ya seleccionado.
- Etapas: `IF` (pc, imem), `ID` (ifid, control, regfile, immgen, hazard), `EX` (idex, fwdMuxA, fwdMuxB, aluSrcMux, alu, branch, forward, flush), `MEM` (exmem, dmem, wbMux), `WB` (memwb). Fuera del core: `debug` y `uart`.

## IDs de cable (los construye la escena; la integración los activa)
```
pc-imem        imem-ifid      pc-ifid        ifid-control   ifid-regfile   ifid-immgen
ifid-hazard    control-idex   regfile-idex   immgen-idex    idex-hazard    hazard-pc
hazard-ifid    hazard-idex    idex-fwdMuxA   idex-fwdMuxB   fwdMuxA-alu    fwdMuxB-aluSrcMux
idex-aluSrcMux aluSrcMux-alu  idex-branch    alu-branch     branch-pc      alu-exmem
fwdMuxB-exmem  idex-forward   forward-fwdMuxA forward-fwdMuxB exmem-forward memwb-forward
exmem-fwdMuxA  exmem-fwdMuxB  memwb-fwdMuxA  memwb-fwdMuxB  branch-flush   flush-ifid
flush-idex     exmem-dmem     exmem-wbMux    dmem-wbMux     wbMux-memwb    memwb-regfile
uart-debug     debug-uart     debug-imem     debug-pc
```
Convención: `a-b` es un cable que va de a hacia b, y los paquetes viajan en ese sentido.

## sim/pipeline.js
```js
export class Pipeline {
  constructor(opts = { forwarding: true })  // forwarding:false = alternativa didáctica (stall por RAW)
  load(words /* Uint32Array|number[] */)    // imem: palabras desde 0, resto NOP 0x13; aplica reset
  reset()                                    // equivale al 'X' de la debug unit: PC=0, latches flush, x1..x31=0; no toca memorias
  step()                                     // un flanco de clock; devuelve snapshot(); no hace nada si halted
  snapshot()                                 // estado combinacional DEL CICLO ACTUAL (antes del próximo flanco)
  history                                    // array de snapshots, history[0] = después de reset
  stepBack()                                 // restaura el snapshot anterior (guardar el estado completo)
  get halted()
  dbgRead(addr) // 0..85, mapa de debug del RTL
}
```

### snapshot()
```js
{
  cycle,                       // ciclos transcurridos desde reset
  pc, halted, halting,
  stages: {                    // qué instrucción "ocupa" cada etapa en este ciclo
    IF:  { pc, inst, asm, id, kind },   // kind: 'instr' | 'nop' | 'bubble'
    ID:  {...}, EX: {...}, MEM: {...}, WB: {...}
  },                           // id = número de instrucción dinámica (contador de fetch), null si es burbuja
  latches: {
    ifid:  { pc, inst },
    idex:  { reg_write, alu_src, mem_read, mem_write, branch, jump, is_jalr, is_auipc, halt,
             wb_sel, alu_op, pc, pc4, rdata1, rdata2, imm, rs1, rs2, rd, funct3 },
    exmem: { reg_write, mem_read, mem_write, halt, wb_sel, alu_out, rdata2, pc4, imm, rd, funct3 },
    memwb: { reg_write, halt, result, rd },
  },
  signals: {                   // combinacional del ciclo actual
    // ID
    idRs1, idRs2, idRdata1, idRdata2, idImm, ctrl /* objeto de control.v */, bypassA, bypassB, // bypass WB->ID del regfile
    stall, falseStall,         // falseStall: stall cuyo rs coincidente no es un operando real del formato
    // EX
    fwdA, fwdB,                // 0 = regfile, 2 = EX/MEM ('10'), 1 = MEM/WB ('01')
    fwdAVal, fwdBVal, aluA, aluB, aluOp, aluOut, zero, lt, ltu,
    branchTaken, redirect, redirectTarget, flushIfId, flushIdEx,
    // MEM
    memRead, memWrite, memAddr, memWData, memRData, memBe, memResult, wbSel,
    // WB
    regWrite, wbRd, wbData,
  },
  events: [ { type, block, stage, text?, data } ],   // ver la lista de tipos de evento
  regs: Uint32Array(32),
  dmem: Uint32Array(256),
}
```

### Tipos de evento (`events[].type`)
Los genera `pipeline.js` a partir del snapshot; `content/theory.js` tiene una entrada para cada tipo.
```
fetch decode regRead immGen bypassWB fwdExMem fwdMemWb loadUseStall falseStall
rawStallNoFwd branchTaken branchNotTaken jump flush aluOp memRead memWrite writeback
haltDetected halted bubble
```
- `data` lleva los valores relevantes, por ejemplo `{operand:'A', reg:5, value}` o `{target}`.

## sim/assembler.js
```js
export function assemble(src) -> { words: Uint32Array, listing: [{addr, word, src, line}], labels: {}, errors: [{line, msg}] }
```
- Sintaxis GNU básica:
  - comentarios con `#` o `//`, labels `foo:`
  - registros `x0..x31` y nombres ABI
  - inmediatos decimales, hex (0x) o negativos; `offset(rs)`
  - directivas `.text`, `.globl` (se ignoran) y `.word`
- Instrucciones: todas las de RV32I del RTL, más `ecall` y `ebreak`.
- Pseudos: `nop li mv not neg j jr ret call(=jal ra) la beqz bnez bgt ble bgtu bleu seqz snez`.
- `li` con valor de 12 bits usa addi; si no, lui+addi con el ajuste de signo.

## sim/disasm.js
`disasm(word, pc?) -> string`, en formato tipo objdump: `addi x1, x0, 5`.

## sim/debugUnit.js
```js
export class DebugUnit {
  constructor(pipeline)
  rxByte(b)            // el host manda un byte
  tick(n=1)            // avanza n clocks del sistema (FSM + CPU si está enabled)
  onTx(cb)             // cb(byte), el byte sale hacia el host
  get state()          // nombre del estado de la FSM: 'IDLE', 'LOAD_LEN_LO', ...
  get leds()           // { halt, rst, en }
  get run()
}
export function decodeDump(bytes) // igual que debug_protocol.py decode_dump
```

## content/ (texto en español, sin DOM)
- `isa.js`
  - `INSTR`: mapa mnemónico → `{fmt, name, semantics, description, ctrl, day, related}`
  - `isaCard(word, pc)` → `{mnemonic, fmt, fields:[{name, hi, lo, bits, value, color}], semantics, description, ctrl, day, related}`
- `theory.js`
  - `EVENT_THEORY`: tipo de evento → `{title, block, what(ev, snap) -> html, why: html, rtl: string, cost: string, day}`
- `alternatives.js`
  - `ALTERNATIVES`: blockId → `{title, current: html, options:[{name, summary, pros:[], cons:[], area, cycles, usedIn}]}`
- `blocks.js`
  - `BLOCK_INFO`: blockId → `{title, stage, summary, rtlFile, signals:[{name, desc, path}]}`
  - `path` es una ruta dentro del snapshot, por ejemplo `'signals.aluOut'`
- `examples.js`
  - `EXAMPLES`: `[{id, title, level, summary, code, steps:[{cycle, focus:blockId, note}], expect}]`
- `lessons.js`
  - `LESSONS`: `[{id, title, level, tabs:{resumen, senales, ejemplo, teoria}, exampleId, focus}]`

## Paleta y tipografía
- Light:
  - fondo `#f6edde`, paneles `#fbf6ed` y `#fffaf0`
  - texto `#18213d` y `#24304a`, texto suave `#5c6066`
  - teal `#1aa3a1` y `#157f7d`, naranja `#f0a53a`, rojo `#e5533d`
  - bordes `#bfae97` y `#d6c7b3`
- Dark: fondo `#18213d`, paneles `#24304a` y `#26324d`, texto `#f6edde`; los acentos son los mismos.
- Colores de etapa:
  - IF `#1aa3a1`
  - ID `#4a7bd0`
  - EX `#f0a53a`
  - MEM `#9b6ad6`
  - WB `#e5533d`
- Fuentes (`@fontsource`):
  - Barlow (sans, 400/500/600)
  - Barlow Semi Condensed (títulos y labels, 500/600)
  - JetBrains Mono (valores)

---

# v2: Zoom interno, inspector first-principles, FSMs y links a GitHub

## Repo del RTL
- GitHub: `MateoBernardi/arquitectura-de-computadoras`, rama `tp3-RISCV`, prefijo `project_4/project_4.srcs/sources_1/new/`.
- Ruta local (`RTL_ROOT` por defecto): `/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sources_1/new`.
- En todo el contenido, las rutas `file` son relativas a ese prefijo, por ejemplo `pipeline/3_execute/alu.v`.
- **Nunca escribir números de línea a mano en el contenido.** Se referencia siempre por símbolo, y el índice resuelve la línea.

## src/content/rtl-index.json (lo genera scripts/rtl-index.mjs, va commiteado)
```js
{ commit: '<sha HEAD del repo RTL>', prefix: 'project_4/project_4.srcs/sources_1/new/', generatedFrom: RTL_ROOT,
  files: { '<file>': { lines: N, modules: [{
     name, start, end,
     params:      [{ name, value, line }],
     localparams: [{ name, value, line }],          // value numérico si se puede parsear (4'd3, 2'b10, 8'h4C...)
     ports:       [{ name, dir: 'input'|'output'|'inout', width, line }],  // width numérico si se puede, si no el string ('IMEM_ADDR_W')
     instances:   [{ name, module, line }],
     regs:        [{ name, width, array: null | depth, line }],
     wires:       [{ name, width, line }],
     assigns:     [{ lhs, line }],
     always:      [{ line, kind: 'ff'|'comb' }],
     cases:       [{ label, line }],                 // etiquetas de case: 'IDLE:', 'CMD_L:', 4'b0000:', etc.
  }] } } }
```

## src/content/repo.js
```js
export const REPO = { owner: 'MateoBernardi', repo: 'arquitectura-de-computadoras', prefix, ref /* = index.commit por defecto */ };
export function resolveSymbol(file, sym) -> { start, end } | null
//  sym: number | [a, b] | 'module:NAME' | 'inst:NAME' | 'port:NAME' | 'reg:NAME' | 'wire:NAME'
//       | 'assign:NAME' | 'param:NAME' | 'state:NAME' (localparam) | 'case:LABEL'
//       | 'NAME' (busca en este orden: assign, reg, wire, port, localparam, instance)
export function githubUrl(file, sym?) -> string      // https://github.com/<owner>/<repo>/blob/<ref>/<prefix><file>#L<a>-L<b>
export function fileUrl(file) -> string
```

## Vistas de módulo: src/content/modules/<id>.js (export default schema)
`src/content/modules/index.js` (ya existe) las junta con `import.meta.glob`. Exporta `VIEWS`, `viewForBlock(blockId)`, `breadcrumb(viewId)` y `childrenOf(viewId)`.
```js
export default {
  id: 'alu_tp1',                 // único; para módulos reales es el nombre del módulo; las pseudo-vistas usan if_pc, fwd_mux, alu_operands, wb_mux, flow_ctrl
  module: 'alu_tp1',             // módulo Verilog (para una pseudo-vista, el módulo que la contiene: 'riscv_pipeline')
  file: 'pipeline/3_execute/alu.v',
  instance: 'u_alu',             // nombre de la instancia en el módulo que la contiene
  parent: null,                  // id de la vista padre; null = cuelga directo de la Vista general (la placa 3D es la única raíz)
  within: 'riscv_pipeline',      // solo con parent null: módulo real del RTL donde vive ('top_riscv' | 'riscv_pipeline')
  instancePath: 'u_cpu.u_alu',   // solo con parent null: cadena de instancias desde top_riscv (se valida contra rtl-index.json)
  blockIds: ['alu'],             // bloques 3D (CONTRACT v1) que entran a esta vista al hacer click
  title: 'ALU', stage: 'EX' | 'IF' | 'ID' | 'MEM' | 'WB' | null,
  kind: 'comb' | 'seq' | 'struct' | 'fsm' | 'mixed',
  explain: {                     // html: <p><b><code><ul><li><br>, y links <a href="${githubUrl(...)}" target="_blank" rel="noopener">
    firstPrinciples,             // qué problema existe y por qué hace falta este hardware, partiendo de cero
    inThisProject,               // cómo lo resuelve ESTE RTL, citando señales reales
    whyThisChoice,               // por qué esta elección (trade-offs) frente a las ALTERNATIVES del bloque
  },
  refs: [{ label, sym }],        // símbolos destacados para chips "Ver en GitHub" (los resuelve repo.js)
  grid: [cols, rows],            // tamaño de la grilla interior
  ports: [{ name, dir: 'in'|'out', width, side: 'l'|'r'|'t'|'b', ext: '<blockId | texto>', desc }],
  parts: [{
    id, kind: 'reg'|'regArray'|'mem'|'mux'|'adder'|'cmp'|'logic'|'decoder'|'fsm'|'submodule'|'const'|'ff',
    label, width,                // width: número de bits (para regArray/mem, el del elemento)
    depth,                       // regArray/mem
    symbol,                      // nombre EXACTO en el .v (reg/wire/assign/instancia/localparam); se valida contra el índice
    at: [col, row], size: [w, h],// en celdas de grilla; col crece hacia la derecha y row hacia el frente
    desc,                        // html: qué es y POR QUÉ existe
    drill,                       // id de la vista hija (solo para submódulos con vista propia)
    live,                        // ruta de valor en vivo (ver "Rutas live")
  }],
  nets: [{
    id, from: 'partId' | 'port:<name>', to: 'partId' | 'port:<name>',
    name,                        // señal Verilog exacta (se valida: debe existir como wire/reg/port/assign en el archivo, o en el padre si cruza la instancia)
    width, desc,                 // html: de dónde viene, a dónde va y POR QUÉ
    live,
  }],
  fsm: {                         // opcional
    stateSymbol: 'o_state',      // reg de estado
    file,                        // archivo donde están los localparam y el case (si no es `file`)
    states: [{ name, code, desc, outputs: ['rx_read=1', ...] }],   // name = localparam exacto, code = su valor
    transitions: [{ from, to, cond, actions, caseLabel }],          // from/to = nombres de estado; cond en sintaxis verilog-ish
    explain,                     // html
    live,                        // ruta live del estado actual (nombre o código)
  },
}
```

### Rutas `live`
Se resuelven contra el objeto de contexto `ctx = { snap, dbg, uart }`:
- `snap.*` = `Pipeline.snapshot()` (CONTRACT v1), por ejemplo `snap.signals.aluOut` o `snap.latches.idex.rd`.
- `dbg.*` = `{ state /* nombre */, stateCode, run, step, loading, dumping, cpuEnable, cpuReset, leds:{halt,rst,en} }` (de DebugUnit).
- `uart.*` = `{ rx: { state, s, n, byte }, tx: { state, s, n, byte, tx } }` (de sim/uart.js; puede no estar).

### Mapeo bloque 3D → vista
| Bloques 3D | Vista |
|---|---|
| `pc` | `if_pc` |
| `imem` | `imem` |
| `ifid` | `if_id_reg` |
| `control` | `control` |
| `regfile` | `regfile` |
| `immgen` | `immgen` |
| `idex` | `id_ex_reg` |
| `fwdMuxA`, `fwdMuxB` | `fwd_mux` |
| `aluSrcMux` | `alu_operands` |
| `alu` | `alu_tp1` |
| `branch` | `branch_unit` |
| `exmem` | `ex_mem_reg` |
| `dmem` | `dmem` |
| `wbMux` | `wb_mux` |
| `memwb` | `mem_wb_reg` |
| `hazard` | `hazard_unit` |
| `forward` | `forward_unit` |
| `flush` | `flush_unit` (los detalles de `stop_fetch` y `redirect` van en la vista `flow_ctrl`, hija de `flush_unit`) |
| `debug` | `debug_unit` |
| `uart` | `uart_core` |
| `clkrst` | `reset_gen` (el MMCM del top se muestra como parte sin drill; `sync_2ff` es hija, instancia `u_btn_sync`) |

Bloque 3D nuevo `clkrst` ("CLK/RST", conector, x=-3, z=15.5) y cable `clkrst-debug` (sys_reset hacia la debug unit; la UART recibe el mismo reset).

- La **Vista general** (placa 3D) es la única raíz. No existen vistas interiores de `top_riscv` ni de `riscv_pipeline`: los módulos de primer nivel (pipeline, `debug_unit`, `uart_core`, `reset_gen`) tienen `parent: null` y declaran `within` + `instancePath` para mostrar "en el RTL: top_riscv › u_cpu › u_alu" en migas e inspector (`rtlPath(viewId)` en `modules/index.js`).
- La explicación de `top_riscv` y `riscv_pipeline` está en `src/content/overview.js` y se muestra en el inspector de la Vista general cuando no hay bloque seleccionado ("¿Qué es esta vista?").
- `flow_ctrl` (pseudo-vista de `riscv_pipeline.v`) cuelga de `flush_unit` (parte con drill).

## Escena interior (src/scene/interior/)
API agregada a `createScene()`:
```js
enterView(schema, { fromBlockId, animate = true }) -> Promise   // inmersión: tween hacia el bloque, fade, se muestra el interior
exitView({ animate = true }) -> Promise                          // vuelve a la placa (o la integración llama enterView(padre))
get currentView()                                                // schema actual o null
setInteriorLive(ctx)                                             // refresca valores live del interior
highlightInterior(id | null)                                     // parte o red
onInteriorClick(cb({ type: 'part'|'net'|'port', id, schema }))
onInteriorHover(cb(...))
```

## Inspector v2 (src/ui/inspector.js) y grafo FSM (src/ui/fsmGraph.js)
```js
createInspector(root, { onAlternatives(blockId), onEnter(viewId), onDrill(viewId), onClose(), onFsmSelect(stateName) })
  .update({ blockId, view /* schema */, info /* BLOCK_INFO[blockId] o null */, alt /* ALTERNATIVES[blockId] o null */, ctx, focus /* {type,id} parte/red clickeada */ })
createFsmGraph(el, fsm, { onSelect({ type: 'state'|'transition', ... }) }) -> { setState(nameOrCode), highlightTransition(from, to), dispose() }
```

## sim/uart.js (modelo bit a bit de uart_rx/uart_tx con ticks ×16, fiel a uart_rx_fsm/uart_tx_fsm y su comb/regs)
```js
export class UartRx { reset(); tick(rxLevel, baudTick) -> { done, byte }; get state(); get s(); get n(); get byte() }
export class UartTx { reset(); tick(baudTick, txReady, din) -> { done }; get tx(); get state(); ... }
export function frameBits(byte) -> number[]   // start, 8 bits LSB primero, stop
```
