// disasm.js - desensamblador RV32I en formato tipo objdump: `addi x1, x0, 5`.
import { fields, immGen, IMM, NOP } from './isa.js';

const R_NAMES = { '0,0': 'add', '0,32': 'sub', '1,0': 'sll', '2,0': 'slt', '3,0': 'sltu', '4,0': 'xor',
  '5,0': 'srl', '5,32': 'sra', '6,0': 'or', '7,0': 'and' };
const I_NAMES = { 0: 'addi', 2: 'slti', 3: 'sltiu', 4: 'xori', 6: 'ori', 7: 'andi' };
const L_NAMES = { 0: 'lb', 1: 'lh', 2: 'lw', 4: 'lbu', 5: 'lhu' };
const S_NAMES = { 0: 'sb', 1: 'sh', 2: 'sw' };
const B_NAMES = { 0: 'beq', 1: 'bne', 4: 'blt', 5: 'bge', 6: 'bltu', 7: 'bgeu' };

// pc opcional: con pc, los saltos muestran la dirección absoluta (0x..); sin pc, el offset con signo.
export function disasm(word, pc) {
  const w = word >>> 0;
  if (w === NOP) return 'nop';
  const { opcode: op, rd, funct3: f3, rs1, rs2, funct7: f7 } = fields(w);
  const x = (r) => `x${r}`;
  const bad = `illegal (0x${w.toString(16).padStart(8, '0')})`;
  const target = (imm) => {
    const s = imm | 0;
    return pc === undefined ? (s >= 0 ? `+${s}` : `${s}`) : '0x' + ((pc + s) >>> 0).toString(16);
  };
  switch (op) {
    case 0x33: {
      const n = R_NAMES[`${f3},${f7}`];
      return n ? `${n} ${x(rd)}, ${x(rs1)}, ${x(rs2)}` : bad;
    }
    case 0x13: {
      if (f3 === 1) return f7 === 0 ? `slli ${x(rd)}, ${x(rs1)}, ${rs2}` : bad;
      if (f3 === 5) return (f7 === 0 || f7 === 32) ? `${f7 ? 'srai' : 'srli'} ${x(rd)}, ${x(rs1)}, ${rs2}` : bad;
      return `${I_NAMES[f3]} ${x(rd)}, ${x(rs1)}, ${immGen(w, IMM.I) | 0}`;
    }
    case 0x03: return L_NAMES[f3] ? `${L_NAMES[f3]} ${x(rd)}, ${immGen(w, IMM.I) | 0}(${x(rs1)})` : bad;
    case 0x23: return S_NAMES[f3] ? `${S_NAMES[f3]} ${x(rs2)}, ${immGen(w, IMM.S) | 0}(${x(rs1)})` : bad;
    case 0x63: return B_NAMES[f3] ? `${B_NAMES[f3]} ${x(rs1)}, ${x(rs2)}, ${target(immGen(w, IMM.B))}` : bad;
    case 0x37: return `lui ${x(rd)}, 0x${(w >>> 12).toString(16)}`;
    case 0x17: return `auipc ${x(rd)}, 0x${(w >>> 12).toString(16)}`;
    case 0x6f: return `jal ${x(rd)}, ${target(immGen(w, IMM.J))}`;
    case 0x67: return `jalr ${x(rd)}, ${immGen(w, IMM.I) | 0}(${x(rs1)})`;
    case 0x73: return (w >>> 20) & 1 ? 'ebreak' : 'ecall';
    default: return bad;
  }
}
