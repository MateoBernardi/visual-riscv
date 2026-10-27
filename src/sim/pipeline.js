// pipeline.js - modelo ciclo a ciclo del pipeline RV32I de 5 etapas (riscv_pipeline.v).
//
// Modo por defecto (opts.forwarding = true): exacto al RTL.
// Modo didáctico (opts.forwarding = false): sin caminos de forwarding; la unidad de hazard
// frena ID mientras rs1/rs2 (campos crudos, no cero) coinciden con el rd de una instrucción
// con reg_write en EX o MEM (WB queda cubierto por el bypass WB->ID del regfile).
import {
  NOP, ALU_NAMES, WB_SEL, WB_SEL_NAMES, IMM, OPCODE, fields, immGen, decodeControl, usesSources,
  aluCompute, branchTaken, hex32,
} from './isa.js';
import { disasm } from './disasm.js';

export const IMEM_WORDS = 256;
export const DMEM_WORDS = 256;
export const DBG_COUNT = 86;
const DBG_REGS = 22;
const DBG_DMEM = 54;
const HISTORY_MAX = 5000; // se descartan los snapshots más viejos (history[0] deja de ser el reset)

const FWD_NONE = 0, FWD_WB = 1, FWD_MEM = 2;

// ---------------------------------------------------------------- dmem.v
function dmemBe(funct3, boff) {
  switch (funct3 & 3) {
    case 0: return 1 << boff;
    case 1: return (boff & 2) ? 0b1100 : 0b0011;
    default: return 0b1111;
  }
}
function dmemRead(dmem, addr, funct3) {
  const word = dmem[(addr >>> 2) & (DMEM_WORDS - 1)];
  const boff = addr & 3;
  const b = (word >>> (boff * 8)) & 0xff;
  const h = (boff & 2) ? (word >>> 16) : (word & 0xffff);
  switch (funct3) {
    case 0: return ((b << 24) >> 24) >>> 0;
    case 1: return ((h << 16) >> 16) >>> 0;
    case 2: return word >>> 0;
    case 4: return b;
    case 5: return h;
    default: return 0;
  }
}
function dmemWrite(dmem, addr, wdata, funct3) {
  if ((funct3 & 4) || (funct3 & 3) === 3) return;
  const idx = (addr >>> 2) & (DMEM_WORDS - 1);
  const boff = addr & 3;
  const be = dmemBe(funct3, boff);
  const sw = (funct3 & 3) === 2, sb = (funct3 & 3) === 0;
  const d0 = wdata & 0xff;
  const d1 = sb ? wdata & 0xff : (wdata >>> 8) & 0xff;
  const d2 = sw ? (wdata >>> 16) & 0xff : wdata & 0xff;
  const d3 = sw ? (wdata >>> 24) & 0xff : (wdata >>> 8) & 0xff;
  const d = [d0, d1, d2, d3];
  let w = dmem[idx];
  for (let k = 0; k < 4; k++) if (be & (1 << k)) w = (w & ~(0xff << (k * 8))) | (d[k] << (k * 8));
  dmem[idx] = w >>> 0;
}

// ---------------------------------------------------------------- estado
const bubbleIdEx = (cause) => ({
  reg_write: 0, alu_src: 0, mem_read: 0, mem_write: 0, branch: 0, jump: 0, is_jalr: 0, is_auipc: 0,
  halt: 0, wb_sel: 0, alu_op: 0, pc: 0, pc4: 0, rdata1: 0, rdata2: 0, imm: 0, rs1: 0, rs2: 0, rd: 0,
  funct3: 0, inst: NOP, tag: null, cause,
});
const bubbleExMem = () => ({
  reg_write: 0, mem_read: 0, mem_write: 0, halt: 0, wb_sel: 0, alu_out: 0, rdata2: 0, pc4: 0, imm: 0,
  rd: 0, funct3: 0, pc: 0, inst: NOP, tag: null,
});
const bubbleMemWb = () => ({ reg_write: 0, halt: 0, result: 0, rd: 0, pc: 0, inst: NOP, tag: null });

function cloneState(s) {
  return {
    ...s,
    ifid: { ...s.ifid }, idex: { ...s.idex }, exmem: { ...s.exmem }, memwb: { ...s.memwb },
    regs: Uint32Array.from(s.regs), dmem: Uint32Array.from(s.dmem),
  };
}

export class Pipeline {
  constructor(opts = { forwarding: true }) {
    this.opts = { forwarding: true, ...opts };
    this.imem = new Uint32Array(IMEM_WORDS).fill(NOP);
    this._dmem = new Uint32Array(DMEM_WORDS); // la dmem NO se borra con reset
    this.reset();
  }

  // ------------------------------------------------------------ control externo
  load(words) {
    this.imem.fill(NOP);
    const n = Math.min(words.length, IMEM_WORDS);
    for (let i = 0; i < n; i++) this.imem[i] = words[i] >>> 0;
    this.reset();
  }

  // Escritura de un byte en la imem (puerto de carga de la debug unit). addr = dirección de byte.
  imemWriteByte(addr, value) {
    const idx = (addr >>> 2) & (IMEM_WORDS - 1);
    const sh = (addr & 3) * 8;
    this.imem[idx] = (((this.imem[idx] & ~(0xff << sh)) | ((value & 0xff) << sh)) >>> 0);
    this._cache = null;
    if (this.history && this.history.length === 1) this.history[0] = this.snapshot();
  }

  reset() {
    if (this.s) this._dmem = this.s.dmem; // la dmem sobrevive al reset
    this.s = {
      cycle: 0, pc: 0, ifTag: 0, nextId: 1, halting: false,
      ifid: { pc: 0, inst: NOP, tag: null, cause: 'reset' },
      idex: bubbleIdEx('reset'), exmem: bubbleExMem(), memwb: bubbleMemWb(),
      regs: new Uint32Array(32), dmem: this._dmem,
    };
    this._cache = null;
    this._pristine = true;
    this.history = [this.snapshot()];
    this._states = [cloneState(this.s)];
    return this.history[0];
  }

  // Un flanco de clock con las señales de la debug unit (i_rst, i_enable).
  clock(rst, en) {
    if (rst) { if (!this._pristine) this.reset(); } else if (en) this.step();
  }

  get halted() { return !!this.s.memwb.halt; }
  get cycle() { return this.s.cycle; }
  get pc() { return this.s.pc; }
  get regs() { return this.s.regs; }
  get dmem() { return this.s.dmem; }

  // ------------------------------------------------------------ combinacional
  _comb() {
    if (this._cache) return this._cache;
    const s = this.s, fwdOn = this.opts.forwarding;
    const g = {};
    // ---- IF
    g.ifInst = this.imem[(s.pc >>> 2) & (IMEM_WORDS - 1)];
    // ---- ID
    const inst = s.ifid.inst;
    const f = fields(inst);
    const ctrl = decodeControl(inst);
    g.idRs1 = f.rs1; g.idRs2 = f.rs2;
    g.ctrl = ctrl;
    g.idImm = immGen(inst, ctrl.imm_sel);
    const mw = s.memwb;
    const wr = mw.reg_write && mw.rd !== 0;
    g.bypassA = !!(f.rs1 !== 0 && wr && mw.rd === f.rs1);
    g.bypassB = !!(f.rs2 !== 0 && wr && mw.rd === f.rs2);
    g.idRdata1 = f.rs1 === 0 ? 0 : g.bypassA ? mw.result : s.regs[f.rs1];
    g.idRdata2 = f.rs2 === 0 ? 0 : g.bypassB ? mw.result : s.regs[f.rs2];
    // ---- EX
    const e = s.idex, m = s.exmem;
    let fa = FWD_NONE, fb = FWD_NONE;
    if (fwdOn) { // forward_unit.v
      if (m.reg_write && m.rd !== 0) {
        if (m.rd === e.rs1) fa = FWD_MEM;
        if (m.rd === e.rs2) fb = FWD_MEM;
      }
      if (mw.reg_write && mw.rd !== 0) {
        if (mw.rd === e.rs1 && !(m.reg_write && m.rd === e.rs1)) fa = FWD_WB;
        if (mw.rd === e.rs2 && !(m.reg_write && m.rd === e.rs2)) fb = FWD_WB;
      }
    }
    g.fwdA = fa; g.fwdB = fb;
    // mem_result (se calcula en MEM, abajo) -> necesario aquí
    const memRData = dmemRead(s.dmem, m.alu_out, m.funct3);
    let memResult;
    switch (m.wb_sel) {
      case WB_SEL.ALU: memResult = m.alu_out; break;
      case WB_SEL.MEM: memResult = memRData; break;
      case WB_SEL.PC4: memResult = m.pc4; break;
      default: memResult = m.imm;
    }
    g.fwdAVal = fa === FWD_MEM ? memResult : fa === FWD_WB ? mw.result : e.rdata1;
    g.fwdBVal = fb === FWD_MEM ? memResult : fb === FWD_WB ? mw.result : e.rdata2;
    g.aluA = e.is_auipc ? e.pc : g.fwdAVal;
    g.aluB = e.alu_src ? e.imm : g.fwdBVal;
    const alu = aluCompute(g.aluA, g.aluB, e.alu_op);
    g.aluOp = e.alu_op; g.aluOut = alu.out; g.zero = alu.zero; g.ovf = alu.ovf; g.lt = alu.lt; g.ltu = alu.ltu;
    g.branchTarget = (e.pc + e.imm) >>> 0;
    g.branchCond = branchTaken(e.funct3, alu.zero, alu.lt, alu.ltu);
    g.branchTaken = !!(e.branch && g.branchCond);
    g.redirect = !!(g.branchTaken || e.jump);
    g.redirectTarget = e.is_jalr ? (alu.out & ~1) >>> 0 : g.branchTarget;
    // ---- hazard unit (ID)
    let ha, hb;
    if (fwdOn) { // hazard_unit.v: load-use
      const ld = e.mem_read && e.rd !== 0;
      ha = !!(ld && e.rd === f.rs1); hb = !!(ld && e.rd === f.rs2);
    } else { // didáctico: RAW contra EX y MEM
      const hit = (r) => r !== 0 && ((e.reg_write && e.rd === r) || (m.reg_write && m.rd === r));
      ha = !!hit(f.rs1); hb = !!hit(f.rs2);
    }
    g.stallRaw = ha || hb;
    // en modo didáctico un redirect tiene prioridad (si no, se perdería el salto)
    g.stall = g.stallRaw && !(g.redirect && !fwdOn);
    const uses = usesSources(inst);
    g.falseStall = g.stall && !((ha && uses.rs1) || (hb && uses.rs2));
    g.hazardA = ha; g.hazardB = hb;
    g.stopFetch = !!(e.halt || s.halting);
    g.flushIfId = g.redirect || g.stopFetch;
    g.flushIdEx = g.redirect || g.stopFetch || g.stall;
    g.pcEn = !g.stall && !g.stopFetch;
    g.pcNext = g.redirect ? g.redirectTarget : (s.pc + 4) >>> 0;
    // ---- MEM
    g.memRead = !!m.mem_read; g.memWrite = !!m.mem_write;
    g.memAddr = m.alu_out; g.memWData = m.rdata2; g.memRData = memRData;
    g.memBe = dmemBe(m.funct3, m.alu_out & 3);
    g.memResult = memResult; g.wbSel = m.wb_sel;
    // ---- WB
    g.regWrite = !!mw.reg_write; g.wbRd = mw.rd; g.wbData = mw.result;
    this._cache = { g };
    return this._cache;
  }

  // ------------------------------------------------------------ un flanco de clock
  step() {
    if (this.halted) return this.snapshot();
    const { g } = this._comb();
    const s = this.s;
    const e = s.idex, m = s.exmem, mw = s.memwb;
    const n = cloneState(s);
    n.cycle = s.cycle + 1;
    n.nextId = s.nextId;
    // regfile y dmem (escrituras en el flanco)
    if (mw.reg_write && mw.rd !== 0) n.regs[mw.rd] = mw.result;
    if (m.mem_write) dmemWrite(n.dmem, m.alu_out, m.rdata2, m.funct3);
    // MEM/WB, EX/MEM
    n.memwb = {
      reg_write: m.reg_write, halt: m.halt, result: g.memResult, rd: m.rd, pc: m.pc, inst: m.inst, tag: m.tag,
    };
    n.exmem = {
      reg_write: e.reg_write, mem_read: e.mem_read, mem_write: e.mem_write, halt: e.halt, wb_sel: e.wb_sel,
      alu_out: g.aluOut, rdata2: g.fwdBVal, pc4: e.pc4, imm: e.imm, rd: e.rd, funct3: e.funct3,
      pc: e.pc, inst: e.inst, tag: e.tag,
    };
    // ID/EX
    if (g.flushIdEx) {
      n.idex = bubbleIdEx(g.redirect ? 'redirect' : g.stopFetch ? 'halt' : 'stall');
    } else {
      const c = g.ctrl, i = s.ifid, f = fields(i.inst);
      n.idex = {
        reg_write: c.reg_write, alu_src: c.alu_src, mem_read: c.mem_read, mem_write: c.mem_write,
        branch: c.branch, jump: c.jump, is_jalr: c.is_jalr, is_auipc: c.is_auipc, halt: c.halt,
        wb_sel: c.wb_sel, alu_op: c.alu_op, pc: i.pc, pc4: (i.pc + 4) >>> 0, rdata1: g.idRdata1,
        rdata2: g.idRdata2, imm: g.idImm, rs1: f.rs1, rs2: f.rs2, rd: f.rd, funct3: f.funct3,
        inst: i.inst, tag: i.tag, cause: null,
      };
    }
    // IF/ID
    if (g.flushIfId) n.ifid = { pc: 0, inst: NOP, tag: null, cause: g.redirect ? 'redirect' : 'halt' };
    else if (!g.stall) n.ifid = { pc: s.pc, inst: g.ifInst, tag: s.ifTag, cause: null };
    // PC (cada vez que avanza, la instrucción del nuevo fetch recibe un id nuevo)
    if (g.pcEn) { n.pc = g.pcNext; n.ifTag = n.nextId++; }
    if (e.halt) n.halting = true;
    this.s = n;
    this._cache = null;
    this._pristine = false;
    const snap = this.snapshot();
    this.history.push(snap);
    this._states.push(cloneState(n));
    if (this.history.length > HISTORY_MAX) { this.history.shift(); this._states.shift(); }
    return snap;
  }

  stepBack() {
    if (this.history.length <= 1) return this.snapshot();
    this.history.pop(); this._states.pop();
    this.s = cloneState(this._states[this._states.length - 1]);
    this._dmem = this.s.dmem;
    this._cache = null;
    this._pristine = this.history.length === 1;
    return this.snapshot();
  }

  // ------------------------------------------------------------ snapshot
  snapshot() {
    const { g } = this._comb();
    const s = this.s;
    const stage = (pc, inst, tag) => {
      if (tag === null) return { pc: null, inst, asm: 'bubble', id: null, kind: 'bubble' };
      return { pc, inst, asm: disasm(inst, pc), id: tag, kind: inst === NOP ? 'nop' : 'instr' };
    };
    const stages = {
      IF: stage(s.pc, g.ifInst, s.ifTag),
      ID: stage(s.ifid.pc, s.ifid.inst, s.ifid.tag),
      EX: stage(s.idex.pc, s.idex.inst, s.idex.tag),
      MEM: stage(s.exmem.pc, s.exmem.inst, s.exmem.tag),
      WB: stage(s.memwb.pc, s.memwb.inst, s.memwb.tag),
    };
    const e = s.idex, m = s.exmem, mw = s.memwb;
    const pick = (o, keys) => { const r = {}; for (const k of keys) r[k] = o[k]; return r; };
    const latches = {
      ifid: { pc: s.ifid.pc, inst: s.ifid.inst },
      idex: pick(e, ['reg_write', 'alu_src', 'mem_read', 'mem_write', 'branch', 'jump', 'is_jalr', 'is_auipc',
        'halt', 'wb_sel', 'alu_op', 'pc', 'pc4', 'rdata1', 'rdata2', 'imm', 'rs1', 'rs2', 'rd', 'funct3']),
      exmem: pick(m, ['reg_write', 'mem_read', 'mem_write', 'halt', 'wb_sel', 'alu_out', 'rdata2', 'pc4', 'imm',
        'rd', 'funct3']),
      memwb: pick(mw, ['reg_write', 'halt', 'result', 'rd']),
    };
    const signals = {
      idRs1: g.idRs1, idRs2: g.idRs2, idRdata1: g.idRdata1, idRdata2: g.idRdata2, idImm: g.idImm,
      ctrl: g.ctrl, bypassA: g.bypassA, bypassB: g.bypassB, stall: g.stall, falseStall: g.falseStall,
      fwdA: g.fwdA, fwdB: g.fwdB, fwdAVal: g.fwdAVal, fwdBVal: g.fwdBVal, aluA: g.aluA, aluB: g.aluB,
      aluOp: g.aluOp, aluOut: g.aluOut, zero: !!g.zero, lt: !!g.lt, ltu: !!g.ltu,
      branchTaken: g.branchTaken, redirect: g.redirect, redirectTarget: g.redirectTarget,
      // flush tal como en el RTL (incluye stop_fetch); flushIdEx también incluye el bubble por stall
      flushIfId: g.flushIfId, flushIdEx: g.flushIdEx,
      memRead: g.memRead, memWrite: g.memWrite, memAddr: g.memAddr, memWData: g.memWData,
      memRData: g.memRData, memBe: g.memBe, memResult: g.memResult, wbSel: g.wbSel,
      regWrite: g.regWrite, wbRd: g.wbRd, wbData: g.wbData,
      // extras (no están en el contrato)
      stopFetch: g.stopFetch, overflow: !!g.ovf, branchTarget: g.branchTarget, ifInst: g.ifInst,
    };
    const snap = {
      cycle: s.cycle, pc: s.pc, halted: this.halted, halting: s.halting, stages, latches, signals,
      events: [], regs: Uint32Array.from(s.regs), dmem: Uint32Array.from(s.dmem),
      forwarding: this.opts.forwarding,
    };
    snap.events = buildEvents(snap, s, g, this.opts.forwarding);
    return snap;
  }

  // ------------------------------------------------------------ bus de debug (riscv_pipeline.v)
  dbgRead(addr) {
    const { g } = this._comb();
    const s = this.s, e = s.idex, m = s.exmem, mw = s.memwb;
    const b = (v) => (v ? 1 : 0);
    switch (addr) {
      case 0: return s.pc >>> 0;
      case 1: return s.ifid.pc >>> 0;
      case 2: return s.ifid.inst >>> 0;
      case 3:
        return (b(e.reg_write) | b(e.mem_read) << 1 | b(e.mem_write) << 2 | b(e.branch) << 3 | b(e.jump) << 4 |
          b(e.is_jalr) << 5 | b(e.is_auipc) << 6 | b(e.halt) << 7 | b(e.alu_src) << 8 | e.wb_sel << 9 |
          e.alu_op << 11) >>> 0;
      case 4: return (e.rs1 | e.rs2 << 5 | e.rd << 10 | e.funct3 << 15) >>> 0;
      case 5: return e.pc >>> 0;
      case 6: return e.rdata1 >>> 0;
      case 7: return e.rdata2 >>> 0;
      case 8: return e.imm >>> 0;
      case 9: return g.aluA >>> 0;
      case 10: return g.aluB >>> 0;
      case 11: return g.aluOut >>> 0;
      case 12: return g.redirectTarget >>> 0;
      case 13:
        return (b(g.stall) | b(g.flushIfId) << 1 | b(g.flushIdEx) << 2 | b(g.redirect) << 3 |
          b(g.branchTaken) << 4 | b(g.zero) << 5 | b(g.ovf) << 6 | b(s.halting) << 7 | g.fwdA << 8 |
          g.fwdB << 10) >>> 0;
      case 14:
        return (b(m.reg_write) | b(m.mem_read) << 1 | b(m.mem_write) << 2 | b(m.halt) << 3 | m.wb_sel << 4) >>> 0;
      case 15: return m.alu_out >>> 0;
      case 16: return m.rdata2 >>> 0;
      case 17: return (m.rd | m.funct3 << 5) >>> 0;
      case 18: return g.memRData >>> 0;
      case 19: return (b(mw.reg_write) | b(mw.halt) << 1) >>> 0;
      case 20: return mw.result >>> 0;
      case 21: return mw.rd >>> 0;
      default:
        if (addr >= DBG_REGS && addr < DBG_DMEM) return addr - DBG_REGS === 0 ? 0 : s.regs[addr - DBG_REGS];
        if (addr >= DBG_DMEM && addr < DBG_COUNT) return s.dmem[addr - DBG_DMEM];
        return 0;
    }
  }
  get dbgCount() { return DBG_COUNT; }
}

// ---------------------------------------------------------------- eventos
function buildEvents(snap, s, g, fwdOn) {
  const ev = [];
  const st = snap.stages;
  const push = (type, block, stage, text, data) => ev.push({ type, block, stage, text, data });
  const fmtOp = (a, v) => `x${a}=${hex32(v)}`;

  // IF
  push('fetch', 'imem', 'IF', `Se busca ${st.IF.asm} en pc=${hex32(s.pc)}.`,
    { pc: s.pc, inst: g.ifInst, asm: st.IF.asm, id: st.IF.id, willBeFlushed: g.flushIfId });

  // ID
  if (st.ID.kind !== 'bubble') {
    const c = g.ctrl, f = fields(s.ifid.inst);
    push('decode', 'control', 'ID', `Control decodifica ${st.ID.asm}.`,
      { inst: s.ifid.inst, asm: st.ID.asm, ctrl: c, id: st.ID.id });
    const u = usesSources(s.ifid.inst);
    if (u.rs1 || u.rs2) {
      push('regRead', 'regfile', 'ID',
        `Se leen ${u.rs1 ? 'x' + f.rs1 + '=' + hex32(g.idRdata1) : ''}${u.rs1 && u.rs2 ? ' y ' : ''}${u.rs2 ? 'x' + f.rs2 + '=' + hex32(g.idRdata2) : ''}.`,
        { rs1: f.rs1, rs2: f.rs2, value1: g.idRdata1, value2: g.idRdata2, usesRs1: u.rs1, usesRs2: u.rs2 });
    }
    if (f.opcode !== OPCODE.R && f.opcode !== OPCODE.SYSTEM) {
      push('immGen', 'immgen', 'ID', `Immgen extrae el inmediato ${g.idImm | 0} (${hex32(g.idImm)}).`,
        { imm: g.idImm, immSel: c.imm_sel });
    }
    if (c.halt) push('haltDetected', 'control', 'ID', 'Se detecta ECALL/EBREAK: el CPU se va a detener.', { id: st.ID.id });
    for (const [flag, reg, val, op] of [[g.bypassA, g.idRs1, g.idRdata1, 'A'], [g.bypassB, g.idRs2, g.idRdata2, 'B']]) {
      if (flag) push('bypassWB', 'regfile', 'ID', `Bypass WB->ID: x${reg} se toma directo de lo que se está escribiendo (${hex32(val)}).`,
        { operand: op, reg, value: val });
    }
  }
  // hazard
  if (g.stall) {
    const base = { ex_rd: s.idex.rd, rs1: g.idRs1, rs2: g.idRs2, matchRs1: g.hazardA, matchRs2: g.hazardB };
    if (!fwdOn) {
      push('rawStallNoFwd', 'hazard', 'ID',
        `Sin forwarding: ${st.ID.asm} espera a que su operando llegue a WB (stall por RAW).`, base);
    } else if (!g.falseStall) {
      push('loadUseStall', 'hazard', 'ID',
        `Load-use: ${st.ID.asm} necesita x${s.idex.rd}, que todavía está siendo cargado por ${st.EX.asm}. Se frena un ciclo.`, base);
    }
    if (g.falseStall) {
      const which = g.hazardA && !g.hazardB ? 'rs1' : g.hazardB && !g.hazardA ? 'rs2' : 'rs1/rs2';
      push('falseStall', 'hazard', 'ID',
        `Falso stall: el campo ${which} de ${st.ID.asm} coincide con rd=x${s.idex.rd} del load, pero esa instrucción no usa ese campo como operando.`,
        { ...base, field: which });
    }
  }
  // EX
  if (st.EX.kind !== 'bubble') {
    const e = s.idex;
    for (const [code, reg, val, op] of [[g.fwdA, e.rs1, g.fwdAVal, 'A'], [g.fwdB, e.rs2, g.fwdBVal, 'B']]) {
      if (code === FWD_MEM) push('fwdExMem', 'forward', 'EX', `Forwarding EX/MEM -> ALU (${op}): x${reg}=${hex32(val)}.`, { operand: op, reg, value: val });
      if (code === FWD_WB) push('fwdMemWb', 'forward', 'EX', `Forwarding MEM/WB -> ALU (${op}): x${reg}=${hex32(val)}.`, { operand: op, reg, value: val });
    }
    push('aluOp', 'alu', 'EX', `ALU ${ALU_NAMES[g.aluOp] ?? '?'}: ${hex32(g.aluA)}, ${hex32(g.aluB)} = ${hex32(g.aluOut)}.`,
      { op: g.aluOp, name: ALU_NAMES[g.aluOp], a: g.aluA, b: g.aluB, out: g.aluOut, zero: g.zero });
    if (e.branch) {
      if (g.branchTaken) push('branchTaken', 'branch', 'EX', `Branch tomado: salta a ${hex32(g.redirectTarget)}.`, { target: g.redirectTarget });
      else push('branchNotTaken', 'branch', 'EX', 'Branch no tomado: el programa sigue en secuencia.', { target: g.branchTarget });
    }
    if (e.jump) {
      push('jump', 'branch', 'EX', `${e.is_jalr ? 'JALR' : 'JAL'}: salta a ${hex32(g.redirectTarget)} y guarda pc+4=${hex32(e.pc4)}.`,
        { target: g.redirectTarget, link: e.pc4, jalr: !!e.is_jalr });
    }
  } else {
    push('bubble', 'idex', 'EX', 'Burbuja en EX: no hay instrucción real en esta etapa.', { cause: s.idex.cause });
  }
  if (g.redirect) {
    push('flush', 'flush', 'EX', 'Redirect: se descartan las 2 instrucciones que seguían al salto (IF/ID e ID/EX).',
      { target: g.redirectTarget, killed: [st.ID.id, st.IF.id].filter((x) => x !== null) });
  }
  // MEM
  if (g.memRead) push('memRead', 'dmem', 'MEM', `Lectura de dmem[${hex32(g.memAddr)}] = ${hex32(g.memRData)}.`, { addr: g.memAddr, value: g.memRData, funct3: s.exmem.funct3 });
  if (g.memWrite) push('memWrite', 'dmem', 'MEM', `Escritura de ${hex32(g.memWData)} en dmem[${hex32(g.memAddr)}].`, { addr: g.memAddr, value: g.memWData, funct3: s.exmem.funct3, be: g.memBe });
  // WB
  if (g.regWrite && g.wbRd !== 0) push('writeback', 'memwb', 'WB', `Se escribe ${hex32(g.wbData)} en x${g.wbRd}.`, { rd: g.wbRd, value: g.wbData });
  if (snap.halted) push('halted', 'memwb', 'WB', 'El ECALL/EBREAK llegó a WB: el CPU está detenido.', {});
  return ev;
}
