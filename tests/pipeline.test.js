import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { assemble, Pipeline, decodeDump, PIPELINE_TEST } from '../src/sim/index.js';

const SIM = '/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sim_1/new/';
const hexWords = (f) => fs.readFileSync(SIM + f, 'utf8').trim().split(/\s+/).map((h) => parseInt(h,16));
const PROG = hexWords('pipeline_prog.hex');
const EXP = hexWords('pipeline_exp.hex');

const runToHalt = (p, max = 2000) => { let n = 0; while (!p.halted && n < max) { p.step(); n++; } return n; };
const mk = (words, opts) => { const p = new Pipeline(opts); p.load(words); return p; };
const prog = (src) => { const r = assemble(src); expect(r.errors).toEqual([]); return r.words; };

describe('pipeline (modo RTL)', () => {
  it('corre hasta el halt; regs + dmem == pipeline_exp.hex; pc final 0xB8', () => {
    const p = mk(PROG);
    const n = runToHalt(p);
    expect(p.halted).toBe(true);
    expect(n).toBeLessThan(2000);
    const s = p.snapshot();
    expect(s.pc).toBe(0xb8);
    expect(Array.from(s.regs)).toEqual(EXP.slice(0, 32));
    expect(Array.from(s.dmem.slice(0, 16))).toEqual(EXP.slice(32, 48));
    expect(s.halted).toBe(true);
    expect(s.events.some((e) => e.type === 'halted')).toBe(true);
    // step no hace nada estando detenido
    const c = p.cycle; p.step(); expect(p.cycle).toBe(c);
  });

  it('tras reset: 1 step -> PC=4, 3 steps -> PC=0xC', () => {
    const p = mk(PROG);
    expect(p.snapshot().pc).toBe(0);
    p.step(); expect(p.snapshot().pc).toBe(4);
    p.step(); p.step(); expect(p.snapshot().pc).toBe(0xc);
  });

  it('detecta el load-use stall: lw en 0x14, add en 0x18', () => {
    const p = mk(PROG);
    let found = null;
    for (let i = 0; i < 40 && !found; i++) {
      const s = p.snapshot();
      if (s.signals.stall) found = s;
      p.step();
    }
    expect(found).not.toBeNull();
    expect(found.stages.EX.pc).toBe(0x14);
    expect(found.stages.ID.pc).toBe(0x18);
    expect(found.signals.falseStall).toBe(false);
    expect(found.events.some((e) => e.type === 'loadUseStall')).toBe(true);
    // el PC y el IF/ID se mantienen; entra una burbuja a EX
    const next = p.snapshot();
    expect(next.stages.ID.pc).toBe(0x18);
    expect(next.stages.EX.kind).toBe('bubble');
    expect(next.pc).toBe(found.pc);
    // luego forwarding MEM/WB del valor cargado
    expect(next.signals.stall).toBe(false);
  });

  it('flush de 2 burbujas tras el bne tomado en 0x24', () => {
    const p = mk(PROG);
    let s = p.snapshot();
    for (let i = 0; i < 60 && !(s.stages.EX.pc === 0x24 && s.signals.redirect); i++) { p.step(); s = p.snapshot(); }
    expect(s.stages.EX.pc).toBe(0x24);
    expect(s.signals.branchTaken).toBe(true);
    expect(s.signals.redirectTarget).toBe(0x2c);
    expect(s.signals.flushIfId && s.signals.flushIdEx).toBe(true);
    expect(s.events.some((e) => e.type === 'branchTaken')).toBe(true);
    const flushEv = s.events.find((e) => e.type === 'flush');
    expect(flushEv.data.killed.length).toBe(2);
    const wrong = [s.stages.ID.id, s.stages.IF.id];
    const n1 = p.step();
    expect(n1.pc).toBe(0x2c);
    expect(n1.stages.ID.kind).toBe('bubble');
    expect(n1.stages.EX.kind).toBe('bubble');
    expect(n1.stages.IF.pc).toBe(0x2c);
    expect(n1.stages.MEM.pc).toBe(0x24);
    // las instrucciones descartadas no vuelven a aparecer
    const seen = new Set();
    for (let i = 0; i < 40 && !p.halted; i++) {
      const sn = p.step();
      for (const k of ['IF', 'ID', 'EX', 'MEM', 'WB']) seen.add(sn.stages[k].id);
    }
    for (const id of wrong) expect(seen.has(id)).toBe(false);
  });

  it('ids dinámicos: stall mantiene el id, burbujas tienen id null', () => {
    const p = mk(PROG);
    const ids = [];
    for (let i = 0; i < 12; i++) { ids.push(p.snapshot().stages); p.step(); }
    expect(ids[0].IF.id).toBe(0);
    expect(ids[0].ID.kind).toBe('bubble');
    expect(ids[1].ID.id).toBe(0);
    expect(ids[4].WB.id).toBe(0);
  });

  it('falseStall: lw x5,0(x0) seguido de addi x1,x0,5 (rs2 crudo = 5)', () => {
    const p = mk(prog('lw x5, 0(x0)\naddi x1, x0, 5\nebreak'));
    let hit = null;
    for (let i = 0; i < 10 && !hit; i++) { const s = p.snapshot(); if (s.signals.stall) hit = s; p.step(); }
    expect(hit).not.toBeNull();
    expect(hit.signals.falseStall).toBe(true);
    expect(hit.events.some((e) => e.type === 'falseStall')).toBe(true);
    expect(hit.events.some((e) => e.type === 'loadUseStall')).toBe(false);
    // y un stall verdadero no lo marca
    const q = mk(prog('lw x5, 0(x0)\naddi x1, x5, 5\nebreak'));
    let hit2 = null;
    for (let i = 0; i < 10 && !hit2; i++) { const s = q.snapshot(); if (s.signals.stall) hit2 = s; q.step(); }
    expect(hit2.signals.falseStall).toBe(false);
  });

  it('forwarding: EX/MEM tiene prioridad sobre MEM/WB y se ven los eventos', () => {
    const p = mk(prog('addi x1, x0, 1\naddi x1, x1, 2\nadd x2, x1, x1\nebreak'));
    let sawMem = false;
    for (let i = 0; i < 12; i++) {
      const s = p.snapshot();
      if (s.stages.EX.pc === 8) {
        expect(s.signals.fwdA).toBe(2);
        expect(s.signals.fwdAVal).toBe(3);
        expect(s.events.some((e) => e.type === 'fwdExMem')).toBe(true);
        sawMem = true;
      }
      p.step();
    }
    expect(sawMem).toBe(true);
    expect(p.regs[2]).toBe(6);
  });

  it('memoria: SB/SH/SW, LB/LH/LBU/LHU, desalineados y wrap a 1KB', () => {
    const p = mk(prog(`
      li x1, -2
      sw x1, 0(x0)
      sb x0, 1(x0)
      sh x1, 6(x0)
      lw x2, 0(x0)
      lb x3, 0(x0)
      lbu x4, 0(x0)
      lh x5, 6(x0)
      lhu x6, 6(x0)
      lw x7, 2(x0)
      li x8, 1024
      lw x9, 0(x8)
      ebreak`));
    runToHalt(p);
    expect(p.regs[2]).toBe(0xffff00fe);
    expect(p.regs[3]).toBe(0xfffffffe);
    expect(p.regs[4]).toBe(0xfe);
    expect(p.regs[5]).toBe(0xfffffffe);
    expect(p.regs[6]).toBe(0xfffe);
    expect(p.regs[7]).toBe(0xffff00fe); // desalineado: se alinea
    expect(p.regs[9]).toBe(0xffff00fe); // 1024 == 0 (wrap)
    expect(p.dmem[1]).toBe(0xfffe0000);
  });

  it('jal / jalr / auipc / lui', () => {
    const p = mk(prog('jal x1, f\naddi x5, x0, 1\nf: auipc x2, 1\nli x3, 24\njalr x4, 0(x3)\naddi x5, x0, 2\nebreak\n'));
    runToHalt(p);
    expect(p.regs[1]).toBe(4);
    expect(p.regs[2]).toBe(0x1008);
    expect(p.regs[4]).toBe(0x14);
    expect(p.regs[5]).toBe(0);
  });

  it('reset conserva la dmem y limpia regs; stepBack restaura el estado', () => {
    const p = mk(PROG);
    runToHalt(p);
    p.reset();
    expect(p.regs[3]).toBe(0);
    expect(p.dmem[0]).toBe(0xf);
    expect(p.snapshot().pc).toBe(0);
    for (let i = 0; i < 10; i++) p.step();
    const s10 = p.snapshot();
    const snap9 = p.history[9];
    p.step(); p.step();
    p.stepBack(); p.stepBack();
    const again = p.snapshot();
    expect(again.cycle).toBe(10);
    expect(again.pc).toBe(s10.pc);
    expect(Array.from(again.regs)).toEqual(Array.from(s10.regs));
    p.stepBack();
    expect(p.snapshot().cycle).toBe(snap9.cycle);
    // stepBack hasta el principio no rompe
    for (let i = 0; i < 20; i++) p.stepBack();
    expect(p.snapshot().cycle).toBe(0);
  });

  it('dbgRead coincide con el snapshot en cada ciclo', () => {
    const p = mk(PROG);
    for (let c = 0; c < 90; c++) {
      const s = p.snapshot(), g = s.signals;
      const d = (a) => p.dbgRead(a);
      expect(d(0)).toBe(s.pc);
      expect(d(1)).toBe(s.latches.ifid.pc);
      expect(d(2)).toBe(s.latches.ifid.inst);
      expect(d(5)).toBe(s.latches.idex.pc);
      expect(d(8)).toBe(s.latches.idex.imm);
      expect(d(9)).toBe(g.aluA);
      expect(d(10)).toBe(g.aluB);
      expect(d(11)).toBe(g.aluOut);
      expect(d(12)).toBe(g.redirectTarget);
      const fl = d(13);
      expect(fl & 1).toBe(+g.stall);
      expect((fl >> 3) & 1).toBe(+g.redirect);
      expect((fl >> 4) & 1).toBe(+g.branchTaken);
      expect((fl >> 7) & 1).toBe(+s.halting);
      expect((fl >> 8) & 3).toBe(g.fwdA);
      expect((fl >> 10) & 3).toBe(g.fwdB);
      expect(d(15)).toBe(s.latches.exmem.alu_out);
      expect(d(18)).toBe(g.memRData);
      expect(d(20)).toBe(s.latches.memwb.result);
      expect(d(21)).toBe(s.latches.memwb.rd);
      for (let r = 0; r < 32; r++) expect(d(22 + r)).toBe(s.regs[r]);
      for (let m = 0; m < 32; m++) expect(d(54 + m)).toBe(s.dmem[m]);
      // bits de control de ID/EX
      const e = s.latches.idex;
      expect(d(3)).toBe(e.reg_write | e.mem_read << 1 | e.mem_write << 2 | e.branch << 3 | e.jump << 4 |
        e.is_jalr << 5 | e.is_auipc << 6 | e.halt << 7 | e.alu_src << 8 | e.wb_sel << 9 | e.alu_op << 11);
      if (p.halted) break;
      p.step();
    }
    const words = Array.from({ length: 86 }, (_, i) => p.dbgRead(i));
    const dd = decodeDump(words);
    expect(dd.pc).toBe(0xb8);
    expect(dd.regs[3]).toBe(15);
    expect(dd.mem_wb.halt).toBe(1);
    expect(dd.ex.halting).toBe(1);
  });

  it('el debug word 13 refleja stall/flush en el primer load-use', () => {
    const p = mk(PROG);
    for (let i = 0; i < 40; i++) {
      if (p.snapshot().signals.stall) {
        expect(p.dbgRead(13) & 0b111).toBe(0b101); // stall + flush_id_ex, sin flush_if_id
        return;
      }
      p.step();
    }
    throw new Error('sin stall');
  });
});

describe('pipeline sin forwarding (alternativa didáctica)', () => {
  it('mismos registros finales, más ciclos', () => {
    const a = mk(PROG); const na = runToHalt(a);
    const b = mk(PROG, { forwarding: false }); const nb = runToHalt(b);
    expect(Array.from(b.regs)).toEqual(Array.from(a.regs));
    expect(Array.from(b.dmem.slice(0, 16))).toEqual(EXP.slice(32, 48));
    expect(Array.from(b.regs)).toEqual(EXP.slice(0, 32));
    expect(nb).toBeGreaterThan(na);
    expect(b.snapshot().pc).toBe(0xb8);
  });

  it('nunca forwardea y emite rawStallNoFwd', () => {
    const p = mk(prog('addi x1, x0, 1\naddi x2, x1, 1\nebreak'), { forwarding: false });
    let raw = false;
    for (let i = 0; i < 12; i++) {
      const s = p.snapshot();
      expect(s.signals.fwdA).toBe(0);
      expect(s.signals.fwdB).toBe(0);
      if (s.events.some((e) => e.type === 'rawStallNoFwd')) raw = true;
      p.step();
    }
    expect(raw).toBe(true);
    expect(p.regs[2]).toBe(2);
  });

  it('un salto con RAW pendiente no pierde el redirect', () => {
    const p = mk(prog('addi x1, x0, 16\njalr x2, 0(x1)\naddi x3, x0, 1\naddi x3, x0, 2\naddi x4, x0, 7\nebreak'), { forwarding: false });
    runToHalt(p);
    // jalr salta a 16: se saltean las dos instrucciones que escriben x3
    expect(p.regs[3]).toBe(0);
    expect(p.regs[4]).toBe(7);
  });
});

describe('dmem: stores parciales en cada desplazamiento', () => {
  it('sb en los 4 bytes y sh en las 2 mitades guardan el byte/media palabra baja de rs2', () => {
    const p = mk(prog(`
li   x1, 0x11223344
li   x2, 0xA7AB
sw   x1, 0(x0)
sw   x1, 4(x0)
sw   x1, 8(x0)
sw   x1, 12(x0)
sb   x2, 0(x0)
sb   x2, 5(x0)
sb   x2, 10(x0)
sb   x2, 15(x0)
sw   x1, 16(x0)
sw   x1, 20(x0)
sh   x2, 16(x0)
sh   x2, 22(x0)
ebreak
`));
    runToHalt(p);
    expect(Array.from(p.snapshot().dmem.slice(0, 6))).toEqual(
      [0x112233ab, 0x1122ab44, 0x11ab3344, 0xab223344, 0x1122a7ab, 0xa7ab3344]);
  });
});
