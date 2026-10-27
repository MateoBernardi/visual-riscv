// isa.js - constantes de RV32I y decodificación de control.
// Espeja control.v, immgen.v y alu_ops.vh del RTL.

export const OPCODE = {
  R: 0b0110011, I: 0b0010011, LOAD: 0b0000011, STORE: 0b0100011, BRANCH: 0b1100011,
  JAL: 0b1101111, JALR: 0b1100111, LUI: 0b0110111, AUIPC: 0b0010111, SYSTEM: 0b1110011,
};

// alu_ops.vh
export const ALU = {
  ADD: 0, SUB: 1, AND: 2, OR: 3, XOR: 4, SLT: 5, SLTU: 6, SLL: 7, SRL: 8, SRA: 9, NOR: 10,
};
export const ALU_NAMES = ['add', 'sub', 'and', 'or', 'xor', 'slt', 'sltu', 'sll', 'srl', 'sra', 'nor'];

export const WB_SEL = { ALU: 0, MEM: 1, PC4: 2, IMM: 3 };
export const WB_SEL_NAMES = ['alu', 'mem', 'pc+4', 'imm'];

// imm_sel de control.v
export const IMM = { I: 0, S: 1, B: 2, U: 3, J: 4 };

export const NOP = 0x00000013;

export const ABI_NAMES = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1',
  'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11',
  't3', 't4', 't5', 't6'];

// Campos "crudos" de una instrucción (el pipeline los usa sin importar el formato).
export function fields(w) {
  w = w >>> 0;
  return {
    opcode: w & 0x7f, rd: (w >>> 7) & 31, funct3: (w >>> 12) & 7,
    rs1: (w >>> 15) & 31, rs2: (w >>> 20) & 31, funct7: w >>> 25,
  };
}

export const sext = (v, bits) => ((v << (32 - bits)) >> (32 - bits));

// immgen.v
export function immGen(w, immSel) {
  w = w >>> 0;
  switch (immSel) {
    case IMM.I: return (w >> 20) >>> 0;
    case IMM.S: return (((w >> 25) << 5) | ((w >>> 7) & 31)) >>> 0;
    case IMM.B: return ((((w >> 31) << 12) | (((w >>> 7) & 1) << 11) | (((w >>> 25) & 63) << 5) |
      (((w >>> 8) & 15) << 1))) >>> 0;
    case IMM.U: return (w & 0xfffff000) >>> 0;
    case IMM.J: return ((((w >> 31) << 20) | (w & 0xff000) | (((w >>> 20) & 1) << 11) |
      (((w >>> 21) & 0x3ff) << 1))) >>> 0;
    default: return 0;
  }
}

// control.v (incluye los valores por defecto) + is_jalr / is_auipc de riscv_pipeline.v
export function decodeControl(w) {
  const { opcode: op, funct3: f3, funct7: f7 } = fields(w);
  const c = {
    reg_write: 0, alu_src: 0, mem_read: 0, mem_write: 0, branch: 0, jump: 0, halt: 0,
    wb_sel: WB_SEL.ALU, alu_op: ALU.ADD, imm_sel: IMM.I, is_jalr: 0, is_auipc: 0,
  };
  const f7b5 = (f7 >> 5) & 1;
  switch (op) {
    case OPCODE.R: {
      c.reg_write = 1;
      const k = (f7b5 << 3) | f3;
      const m = { 0b0000: ALU.ADD, 0b1000: ALU.SUB, 0b0111: ALU.AND, 0b0110: ALU.OR, 0b0100: ALU.XOR,
        0b0010: ALU.SLT, 0b0011: ALU.SLTU, 0b0001: ALU.SLL, 0b0101: ALU.SRL, 0b1101: ALU.SRA };
      c.alu_op = k in m ? m[k] : ALU.ADD;
      break;
    }
    case OPCODE.I: {
      c.reg_write = 1; c.alu_src = 1;
      const m = [ALU.ADD, ALU.SLL, ALU.SLT, ALU.SLTU, ALU.XOR, f7b5 ? ALU.SRA : ALU.SRL, ALU.OR, ALU.AND];
      c.alu_op = m[f3];
      break;
    }
    case OPCODE.LOAD:
      c.reg_write = 1; c.alu_src = 1; c.mem_read = 1; c.wb_sel = WB_SEL.MEM; break;
    case OPCODE.STORE:
      c.alu_src = 1; c.mem_write = 1; c.imm_sel = IMM.S; break;
    case OPCODE.BRANCH:
      c.branch = 1; c.imm_sel = IMM.B;
      c.alu_op = (f3 === 4 || f3 === 5) ? ALU.SLT : ALU.SUB; break;
    case OPCODE.JAL:
      c.reg_write = 1; c.jump = 1; c.wb_sel = WB_SEL.PC4; c.imm_sel = IMM.J; break;
    case OPCODE.JALR:
      c.reg_write = 1; c.alu_src = 1; c.jump = 1; c.wb_sel = WB_SEL.PC4; break;
    case OPCODE.LUI:
      c.reg_write = 1; c.wb_sel = WB_SEL.IMM; c.imm_sel = IMM.U; break;
    case OPCODE.AUIPC:
      c.reg_write = 1; c.alu_src = 1; c.imm_sel = IMM.U; break;
    case OPCODE.SYSTEM:
      c.halt = 1; break;
    default: break;
  }
  c.is_jalr = op === OPCODE.JALR ? 1 : 0;
  c.is_auipc = op === OPCODE.AUIPC ? 1 : 0;
  return c;
}

// Qué campos rs1/rs2 son operandos reales según el formato (para detectar falsos stalls).
export function usesSources(w) {
  switch (fields(w).opcode) {
    case OPCODE.R: case OPCODE.STORE: case OPCODE.BRANCH: return { rs1: true, rs2: true };
    case OPCODE.I: case OPCODE.LOAD: case OPCODE.JALR: return { rs1: true, rs2: false };
    default: return { rs1: false, rs2: false };
  }
}

// ALU de alu.v. Devuelve { out, zero, ovf, lt, ltu } con valores sin signo de 32 bits.
export function aluCompute(a, b, op) {
  a >>>= 0; b >>>= 0;
  const sh = b & 31;
  let r = 0, ovf = 0;
  const sa = a >>> 31, sb = b >>> 31;
  switch (op) {
    case ALU.ADD: r = (a + b) >>> 0; ovf = (sa === sb && (r >>> 31) !== sa) ? 1 : 0; break;
    case ALU.SUB: r = (a - b) >>> 0; ovf = (sa !== sb && (r >>> 31) !== sa) ? 1 : 0; break;
    case ALU.AND: r = (a & b) >>> 0; break;
    case ALU.OR: r = (a | b) >>> 0; break;
    case ALU.XOR: r = (a ^ b) >>> 0; break;
    case ALU.SRA: r = ((a | 0) >> sh) >>> 0; break;
    case ALU.SRL: r = a >>> sh; break;
    case ALU.NOR: r = ~(a | b) >>> 0; break;
    case ALU.SLL: r = (a << sh) >>> 0; break;
    case ALU.SLT: r = (a | 0) < (b | 0) ? 1 : 0; break;
    case ALU.SLTU: r = a < b ? 1 : 0; break;
    default: r = 0;
  }
  return { out: r, zero: r === 0 ? 1 : 0, ovf, lt: (a | 0) < (b | 0) ? 1 : 0, ltu: a < b ? 1 : 0 };
}

// branch_unit.v
export function branchTaken(funct3, zero, lt, ltu) {
  switch (funct3) {
    case 0: return zero ? 1 : 0;
    case 1: return zero ? 0 : 1;
    case 4: return lt ? 1 : 0;
    case 5: return lt ? 0 : 1;
    case 6: return ltu ? 1 : 0;
    case 7: return ltu ? 0 : 1;
    default: return 0;
  }
}

export const hex32 = (v) => '0x' + (v >>> 0).toString(16).padStart(8, '0');
