import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { assemble, disasm, PIPELINE_TEST } from '../src/sim/index.js';

const SIM = '/home/mateo/facu/arquitectura-de-computadoras/project_4/project_4.srcs/sim_1/new/';
const SRC = '/home/mateo/facu/arquitectura-de-computadoras/project_4/host/tests/pipeline_test.s';
const hexWords = (f) => fs.readFileSync(SIM + f, 'utf8').trim().split(/\s+/).map((h) => parseInt(h, 16));

describe('assembler', () => {
  it('pipeline_test.s coincide exactamente con pipeline_prog.hex', () => {
    const r = assemble(fs.readFileSync(SRC, 'utf8'));
    expect(r.errors).toEqual([]);
    expect(Array.from(r.words)).toEqual(hexWords('pipeline_prog.hex'));
    expect(r.listing.length).toBe(47);
    expect(r.labels.L1).toBe(0x2c);
  });

  it('la copia embebida en programs/ es idéntica al original', () => {
    expect(PIPELINE_TEST.trim()).toBe(fs.readFileSync(SRC, 'utf8').trim());
  });

  it('pseudo-instrucciones', () => {
    const r = assemble('li t0, 5\nli t1, 0x12345fff\nli t2, -1\nmv a0, a1\nnot a2, a3\nneg a4, a5\nj end\nret\nend: nop\nbeqz a0, end\nbgt a0, a1, end\nseqz a0, a1\nsnez a0, a1\ncall end\njr ra');
    expect(r.errors).toEqual([]);
    const asm = Array.from(r.words).map((w, i) => disasm(w, i * 4));
    expect(asm.slice(0, 4)).toEqual(['addi x5, x0, 5', 'lui x6, 0x12346', 'addi x6, x6, -1', 'addi x7, x0, -1']);
    expect(asm).toContain('xori x12, x13, -1');
    expect(asm).toContain('sub x14, x0, x15');
    expect(asm).toContain('jalr x0, 0(x1)');
    expect(asm).toContain('sltiu x10, x11, 1');
    expect(asm).toContain('sltu x10, x0, x11');
  });

  it('.word, comentarios y errores', () => {
    const r = assemble('.text\n.globl main\nmain: # c\n  .word 0xdeadbeef, 7 // x\n  foo x1\n  addi x1, x2, 5000\n  addi x40, x0, 1');
    expect(r.words[0]).toBe(0xdeadbeef);
    expect(r.words[1]).toBe(7);
    expect(r.errors.map((e) => e.line)).toEqual([5, 6, 7]);
  });

  it('disasm de todas las formas', () => {
    const r = assemble('sw x3, 4(x2)\nlw x5, -4(x2)\nbeq x1, x2, t\nt: jal x1, t\nsrai x1, x2, 3\nauipc x3, 0x10\necall\nebreak');
    const asm = Array.from(r.words).map((w, i) => disasm(w, i * 4));
    expect(asm).toEqual(['sw x3, 4(x2)', 'lw x5, -4(x2)', 'beq x1, x2, 0xc', 'jal x1, 0xc', 'srai x1, x2, 3',
      'auipc x3, 0x10', 'ecall', 'ebreak']);
  });
});
