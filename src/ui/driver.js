// Traduce un snapshot del pipeline (ver CONTRACT.md) a estado de la escena 3D:
// ocupantes de etapa, cables activos, paquetes de datos y bloques resaltados.
import { colorForId } from '../scene/packets.js';
import { BLOCK_IDS } from '../scene/layout.js';

export const COLORS = { teal: '#1aa3a1', red: '#e5533d', grey: '#8a93a0', orange: '#f0a53a', purple: '#9b6ad6', blue: '#4a7bd0' };
const STAGE_C = { IF: '#1aa3a1', ID: '#4a7bd0', EX: '#f0a53a', MEM: '#9b6ad6', WB: '#e5533d' };
const STAGES = ['IF', 'ID', 'EX', 'MEM', 'WB'];
const hx = (n) => '0x' + ((n >>> 0).toString(16).toUpperCase().padStart(8, '0'));
const valid = (st) => !!st && st.kind !== 'bubble' && st.id != null;
const FWD_NAME = { 0: 'regfile', 1: 'MEM/WB', 2: 'EX/MEM' };
const WB_NAME = ['alu', 'mem', 'pc+4', 'imm'];

/**
 * applySnapshot(scene, snap, prevSnap, { animate = true, durationMs = 650 }) -> Promise (resuelve al terminar los paquetes)
 * `scene` es el objeto de createScene(). No modifica el snapshot.
 */
let applyToken = 0;
export function applySnapshot(scene, snap, prevSnap, opts = {}) {
  const { animate = true, durationMs = 650 } = opts;
  if (!snap) return Promise.resolve();
  const S = snap.stages || {}, sg = snap.signals || {}, L = snap.latches || {};
  const idex = L.idex || {}, exmem = L.exmem || {};
  const wires = {};
  const on = (id, color, label, packet) => { wires[id] = { color, label, packet: !!packet }; };

  const vIF = valid(S.IF), vID = valid(S.ID), vEX = valid(S.EX), vMEM = valid(S.MEM), vWB = valid(S.WB);
  const cIF = colorForId(S.IF?.id), cID = colorForId(S.ID?.id), cEX = colorForId(S.EX?.id), cMEM = colorForId(S.MEM?.id), cWB = colorForId(S.WB?.id);
  const stall = !!sg.stall, redirect = !!sg.redirect;

  // --- IF ---
  if (S.IF) {
    on('pc-imem', cIF, hx(snap.pc), true);
    on('imem-ifid', cIF, hx(S.IF.inst), true);
    on('pc-ifid', cIF, hx(snap.pc));
  }
  // --- ID ---
  if (vID) {
    on('ifid-control', cID, 'opcode');
    on('ifid-regfile', cID, `x${sg.idRs1 ?? '?'}, x${sg.idRs2 ?? '?'}`);
    on('ifid-immgen', cID, hx(L.ifid?.inst ?? S.ID.inst));
    on('ifid-hazard', cID, 'rs1/rs2');
    if (!stall) {
      on('control-idex', cID, 'ctrl');
      on('regfile-idex', cID, hx(sg.idRdata1), true);
      on('immgen-idex', cID, hx(sg.idImm), true);
    }
  }
  if (stall) {
    const sl = sg.falseStall ? 'stall falso' : 'stall';
    on('hazard-pc', COLORS.red, sl); on('hazard-ifid', COLORS.red, sl); on('hazard-idex', COLORS.red, 'burbuja');
    on('idex-hazard', COLORS.red, `rd=x${idex.rd ?? '?'}`);
  }
  // --- EX ---
  if (vEX) {
    on('idex-fwdMuxA', cEX, hx(idex.rdata1)); on('idex-fwdMuxB', cEX, hx(idex.rdata2));
    on('fwdMuxA-alu', sg.fwdA ? COLORS.teal : cEX, hx(sg.fwdAVal ?? sg.aluA), true);
    on('fwdMuxB-aluSrcMux', sg.fwdB ? COLORS.teal : cEX, hx(sg.fwdBVal));
    if (idex.alu_src) on('idex-aluSrcMux', cEX, hx(idex.imm));
    on('aluSrcMux-alu', cEX, hx(sg.aluB), true);
    on('alu-exmem', cEX, hx(sg.aluOut), true);
    if (idex.mem_write) on('fwdMuxB-exmem', sg.fwdB ? COLORS.teal : cEX, hx(sg.fwdBVal));
    if (idex.branch || idex.jump) { on('idex-branch', cEX, 'branch'); on('alu-branch', cEX, sg.zero ? 'zero=1' : 'zero=0'); }
    if (sg.fwdA || sg.fwdB) on('idex-forward', COLORS.teal, `rs1=x${idex.rs1} rs2=x${idex.rs2}`);
    for (const [side, sel, val] of [['A', sg.fwdA, sg.fwdAVal], ['B', sg.fwdB, sg.fwdBVal]]) {
      if (!sel) continue;
      on(`forward-fwdMux${side}`, COLORS.teal, sel === 2 ? 'sel=EX/MEM' : 'sel=MEM/WB');
      const src = sel === 2 ? 'exmem' : 'memwb';
      on(`${src}-forward`, COLORS.teal, `rd=x${sel === 2 ? exmem.rd : L.memwb?.rd}`);
      on(`${src}-fwdMux${side}`, COLORS.teal, hx(val), true);
    }
  }
  if (redirect) {
    on('branch-pc', COLORS.orange, hx(sg.redirectTarget), true);
    on('branch-flush', COLORS.grey, 'flush');
    on('flush-ifid', COLORS.grey, 'flush'); on('flush-idex', COLORS.grey, 'flush');
    on('idex-branch', cEX, 'branch'); on('alu-branch', cEX, 'taken');
  }
  // --- MEM ---
  if (vMEM) {
    on('exmem-wbMux', cMEM, hx(exmem.alu_out));
    if (sg.memRead || sg.memWrite) on('exmem-dmem', cMEM, sg.memWrite ? `[${short(sg.memAddr)}] ← ${short(sg.memWData)}` : `lee [${short(sg.memAddr)}]`, true);
    if (sg.memRead) on('dmem-wbMux', cMEM, hx(sg.memRData), true);
    on('wbMux-memwb', cMEM, hx(sg.memResult), true);
  }
  // --- WB ---
  const bypass = !!(sg.bypassA || sg.bypassB);
  if (vWB && sg.regWrite && sg.wbRd) on('memwb-regfile', bypass ? COLORS.teal : cWB, `${bypass ? 'bypass ' : ''}x${sg.wbRd} ← ${hx(sg.wbData)}`, true);

  // ---- aplicar a la escena ----
  const token = ++applyToken;
  const special = (c) => c === COLORS.teal || c === COLORS.red || c === COLORS.grey || c === COLORS.orange;
  scene.clearWires();
  for (const [id, w] of Object.entries(wires)) {
    // los valores de los cables con paquete aparecen cuando el paquete llega; los demás solo si son eventos (forward/stall/flush)
    const label = w.packet ? (animate ? null : w.label) : (special(w.color) ? w.label : null);
    scene.setWire(id, { active: true, color: w.color, label });
  }

  for (const id of BLOCK_IDS) scene.highlightBlock(id, null);
  if (stall) scene.highlightBlock('hazard', COLORS.red);
  if (sg.fwdA || sg.fwdB) { scene.highlightBlock('forward', COLORS.teal); if (sg.fwdA) scene.highlightBlock('fwdMuxA', COLORS.teal); if (sg.fwdB) scene.highlightBlock('fwdMuxB', COLORS.teal); }
  if (bypass) scene.highlightBlock('regfile', COLORS.teal);
  if (redirect) { scene.highlightBlock('flush', COLORS.grey); scene.highlightBlock('branch', COLORS.orange); }

  // valores en vivo bajo cada bloque
  const bv = (id, t) => scene.setBlockValue(id, t);
  bv('pc', hx(snap.pc));
  bv('imem', S.IF?.asm || '');
  bv('ifid', vID ? S.ID.asm : 'burbuja');
  bv('control', vID ? (L.idex && sg.ctrl ? ctrlSummary(sg.ctrl) : '') : '');
  bv('regfile', vID ? `x${sg.idRs1}=${short(sg.idRdata1)} x${sg.idRs2}=${short(sg.idRdata2)}` : '');
  bv('immgen', vID ? short(sg.idImm) : '');
  bv('idex', vEX ? S.EX.asm : 'burbuja');
  bv('fwdMuxA', vEX ? FWD_NAME[sg.fwdA ?? 0] : '');
  bv('fwdMuxB', vEX ? FWD_NAME[sg.fwdB ?? 0] : '');
  bv('aluSrcMux', vEX ? (idex.alu_src ? 'imm' : 'reg') : '');
  bv('alu', vEX ? short(sg.aluOut) : '');
  bv('exmem', vMEM ? S.MEM.asm : 'burbuja');
  bv('dmem', sg.memRead ? `→ ${short(sg.memRData)}` : sg.memWrite ? `← ${short(sg.memWData)}` : '');
  bv('wbMux', vMEM ? (WB_NAME[sg.wbSel ?? 0] || '') : '');
  bv('memwb', vWB ? S.WB.asm : 'burbuja');

  // ocupantes de etapa
  for (const st of STAGES) {
    const o = S[st];
    if (!o || o.kind === 'bubble' || o.id == null) { scene.setStageOccupant(st, { label: 'burbuja', kind: 'bubble' }); continue; }
    let kind = o.kind === 'nop' ? 'nop' : 'instr';
    if (stall && (st === 'IF' || st === 'ID')) kind = 'stall';
    if (redirect && (st === 'IF' || st === 'ID')) kind = 'flush';
    const tag = kind === 'stall' ? (sg.falseStall ? ' · stall falso' : ' · stall') : '';
    scene.setStageOccupant(st, { label: (o.asm || '?') + tag, color: kind === 'stall' ? COLORS.red : kind === 'flush' ? COLORS.grey : colorForId(o.id), kind });
  }
  if (!opts.keepLeds) scene.setLeds({ halt: !!snap.halted, en: !snap.halted });
  applyStatuses(scene, snap);

  if (scene.clearPackets) scene.clearPackets();
  if (!animate) return Promise.resolve();
  const ps = [];
  for (const [id, w] of Object.entries(wires)) if (w.packet) ps.push(scene.sendPacket(id, { color: w.color, label: w.label, durationMs }));
  return Promise.all(ps).then(() => {
    if (token !== applyToken) return;
    for (const [id, w] of Object.entries(wires)) if (w.packet) scene.setWire(id, { active: true, color: w.color, label: w.label });
  });
}

const ALU_OPS = ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'nor'];
const mnemonic = (asm) => String(asm || '').trim().split(/\s+/)[0];
/**
 * Chips de estado bajo cada bloque: solo cuando hay algo que decir en este ciclo (nada de "ok"/"–").
 * Los bloques que maneja la vista Debug (uart, debug, imem) no se tocan.
 */
export const STATUS_IDS = ['pc', 'control', 'regfile', 'hazard', 'forward', 'flush', 'alu', 'branch', 'dmem'];
export function computeStatuses(snap) {
  const out = {};
  const S = snap.stages || {}, sg = snap.signals || {}, L = snap.latches || {};
  const idex = L.idex || {};
  const vID = valid(S.ID), vEX = valid(S.EX);
  const ev = (t) => (snap.events || []).find((e) => e.type === t);
  if (sg.stall) {
    out.pc = { text: 'congelado', tone: 'warn' };
    if (sg.falseStall) out.hazard = { text: 'stall falso', tone: 'warn' };
    else if (ev('rawStallNoFwd')) out.hazard = { text: 'stall (RAW)', tone: 'danger' };
    else out.hazard = { text: 'stall (load-use)', tone: 'danger' };
  }
  if (sg.fwdA || sg.fwdB) {
    const f = (c) => (c === 2 ? 'EX/MEM' : 'MEM/WB');
    out.forward = { text: [sg.fwdA ? `A←${f(sg.fwdA)}` : null, sg.fwdB ? `B←${f(sg.fwdB)}` : null].filter(Boolean).join(' '), tone: 'info' };
  }
  if (sg.redirect) out.flush = { text: 'vaciando IF/ID + ID/EX', tone: 'warn' };
  if (vID) {
    out.control = { text: mnemonic(S.ID.asm), tone: 'info' };
    const rr = ev('regRead');
    const parts = [];
    if (rr) {
      const regs = [rr.data.usesRs1 ? 'x' + rr.data.rs1 : null, rr.data.usesRs2 ? 'x' + rr.data.rs2 : null].filter(Boolean);
      if (regs.length) parts.push('lee ' + regs.join(','));
    }
    if (sg.regWrite && sg.wbRd) parts.push('escribe x' + sg.wbRd);
    if (parts.length) out.regfile = { text: parts.join(' · '), tone: 'info' };
  } else if (sg.regWrite && sg.wbRd) out.regfile = { text: 'escribe x' + sg.wbRd, tone: 'info' };
  if (vEX) {
    const name = ev('aluOp') && ev('aluOp').data.name;
    out.alu = { text: name || ALU_OPS[sg.aluOp] || mnemonic(S.EX.asm), tone: 'info' };
    if (idex.branch || idex.jump) out.branch = { text: sg.redirect ? 'tomado → ' + short(sg.redirectTarget) : 'no tomado', tone: sg.redirect ? 'warn' : 'info' };
  }
  if (sg.memRead) out.dmem = { text: 'lee [' + short(sg.memAddr) + ']', tone: 'info' };
  else if (sg.memWrite) out.dmem = { text: 'escribe [' + short(sg.memAddr) + ']', tone: 'info' };
  return out;
}
function applyStatuses(scene, snap) {
  const st = computeStatuses(snap);
  for (const id of STATUS_IDS) scene.setBlockStatus(id, st[id] || null);
}

function short(n) { return n == null ? '—' : '0x' + ((n >>> 0).toString(16).toUpperCase()); }
function ctrlSummary(c) {
  if (typeof c !== 'object') return '';
  const t = [];
  if (c.reg_write) t.push('RegW'); if (c.mem_read) t.push('MemR'); if (c.mem_write) t.push('MemW');
  if (c.branch) t.push('Br'); if (c.jump) t.push('Jmp'); if (c.alu_src) t.push('Imm');
  return t.join(' ') || 'nop';
}

/** Elige el evento "más interesante" de un snapshot para explicarlo (stall > flush > forwarding > resto). */
export const NOTABLE = ['loadUseStall', 'rawStallNoFwd', 'falseStall', 'flush', 'branchTaken', 'jump', 'fwdExMem', 'fwdMemWb', 'bypassWB', 'haltDetected', 'memWrite', 'memRead', 'branchNotTaken', 'halted'];
const ROUTINE = ['aluOp', 'writeback', 'regRead', 'immGen', 'decode', 'fetch', 'bubble'];
/** Elige el evento "más interesante": los notables (stall > flush > salto > forwarding > memoria > halt); con `routine` cae en los rutinarios. */
export function pickEvent(events = [], { routine = true } = {}) {
  for (const t of routine ? [...NOTABLE, ...ROUTINE] : NOTABLE) { const e = events.find((x) => x.type === t); if (e) return e; }
  return null;
}
export const isNotable = (ev) => !!ev && NOTABLE.includes(ev.type);
