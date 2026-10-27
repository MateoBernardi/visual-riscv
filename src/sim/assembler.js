// assembler.js - ensamblador RV32I de dos pasadas (sintaxis GNU básica).
import { ABI_NAMES } from './isa.js';

const REGS = {};
for (let i = 0; i < 32; i++) { REGS[`x${i}`] = i; REGS[ABI_NAMES[i]] = i; }
REGS.fp = 8;

// Mnemónicos reales -> [formato, opcode, funct3, funct7]
const R_OPS = { add: [0, 0], sub: [0, 0x20], sll: [1, 0], slt: [2, 0], sltu: [3, 0], xor: [4, 0],
  srl: [5, 0], sra: [5, 0x20], or: [6, 0], and: [7, 0] };
const I_OPS = { addi: 0, slti: 2, sltiu: 3, xori: 4, ori: 6, andi: 7 };
const SH_OPS = { slli: [1, 0], srli: [5, 0], srai: [5, 0x20] };
const L_OPS = { lb: 0, lh: 1, lw: 2, lbu: 4, lhu: 5 };
const S_OPS = { sb: 0, sh: 1, sw: 2 };
const B_OPS = { beq: 0, bne: 1, blt: 4, bge: 5, bltu: 6, bgeu: 7 };

class AsmError extends Error {}

const signed12 = (v) => (v << 20) >> 20;

function parseInt32(tok) {
  const t = tok.trim().replace(/_/g, '');
  let m;
  if ((m = /^([+-]?)0x([0-9a-f]+)$/i.exec(t))) { const v = parseInt(m[2], 16); return m[1] === '-' ? -v : v; }
  if ((m = /^([+-]?)0b([01]+)$/i.exec(t))) { const v = parseInt(m[2], 2); return m[1] === '-' ? -v : v; }
  if (/^[+-]?\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

const enc = {
  r: (f7, rs2, rs1, f3, rd, op) => ((f7 << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0,
  i: (imm, rs1, f3, rd, op) => (((imm & 0xfff) << 20) | (rs1 << 15) | (f3 << 12) | (rd << 7) | op) >>> 0,
  s: (imm, rs2, rs1, f3, op) => ((((imm >> 5) & 0x7f) << 25) | (rs2 << 20) | (rs1 << 15) | (f3 << 12) |
    ((imm & 31) << 7) | op) >>> 0,
  b: (imm, rs2, rs1, f3, op) => ((((imm >> 12) & 1) << 31) | (((imm >> 5) & 0x3f) << 25) | (rs2 << 20) |
    (rs1 << 15) | (f3 << 12) | (((imm >> 1) & 0xf) << 8) | (((imm >> 11) & 1) << 7) | op) >>> 0,
  u: (imm20, rd, op) => (((imm20 & 0xfffff) << 12) | (rd << 7) | op) >>> 0,
  j: (imm, rd, op) => ((((imm >> 20) & 1) << 31) | (((imm >> 1) & 0x3ff) << 21) | (((imm >> 11) & 1) << 20) |
    (((imm >> 12) & 0xff) << 12) | (rd << 7) | op) >>> 0,
};

// Expande pseudo-instrucciones a instrucciones reales (la cantidad de palabras debe poder
// conocerse en la 1a pasada). Cada elemento: [mnemonic, ...operandos].
function expand(mn, ops) {
  const need = (n) => { if (ops.length !== n) throw new AsmError(`'${mn}' espera ${n} operando(s)`); };
  switch (mn) {
    case 'nop': need(0); return [['addi', 'x0', 'x0', '0']];
    case 'mv': need(2); return [['addi', ops[0], ops[1], '0']];
    case 'not': need(2); return [['xori', ops[0], ops[1], '-1']];
    case 'neg': need(2); return [['sub', ops[0], 'x0', ops[1]]];
    case 'seqz': need(2); return [['sltiu', ops[0], ops[1], '1']];
    case 'snez': need(2); return [['sltu', ops[0], 'x0', ops[1]]];
    case 'sltz': need(2); return [['slt', ops[0], ops[1], 'x0']];
    case 'sgtz': need(2); return [['slt', ops[0], 'x0', ops[1]]];
    case 'j': need(1); return [['jal', 'x0', ops[0]]];
    case 'jr': need(1); return [['jalr', 'x0', `0(${ops[0]})`]];
    case 'ret': need(0); return [['jalr', 'x0', '0(ra)']];
    case 'call': need(1); return [['jal', 'ra', ops[0]]];
    case 'beqz': need(2); return [['beq', ops[0], 'x0', ops[1]]];
    case 'bnez': need(2); return [['bne', ops[0], 'x0', ops[1]]];
    case 'bltz': need(2); return [['blt', ops[0], 'x0', ops[1]]];
    case 'bgez': need(2); return [['bge', ops[0], 'x0', ops[1]]];
    case 'blez': need(2); return [['bge', 'x0', ops[0], ops[1]]];
    case 'bgtz': need(2); return [['blt', 'x0', ops[0], ops[1]]];
    case 'bgt': need(3); return [['blt', ops[1], ops[0], ops[2]]];
    case 'ble': need(3); return [['bge', ops[1], ops[0], ops[2]]];
    case 'bgtu': need(3); return [['bltu', ops[1], ops[0], ops[2]]];
    case 'bleu': need(3); return [['bgeu', ops[1], ops[0], ops[2]]];
    case 'li': {
      need(2);
      const v = parseInt32(ops[1]);
      if (v === null) throw new AsmError(`'li' necesita un inmediato numérico, no '${ops[1]}'`);
      if (v < -2147483648 || v > 4294967295) throw new AsmError(`inmediato fuera de 32 bits: ${v}`);
      if (v >= -2048 && v <= 2047) return [['addi', ops[0], 'x0', String(v)]];
      const u = v >>> 0;
      const lo = signed12(u & 0xfff);
      const hi = ((u + 0x800) >>> 12) & 0xfffff;
      const out = [['lui', ops[0], String(hi)]];
      if (lo !== 0) out.push(['addi', ops[0], ops[0], String(lo)]);
      return out;
    }
    case 'la': need(2); return [['auipc', ops[0], '%pcrel_hi:' + ops[1]], ['addi', ops[0], ops[0], '%pcrel_lo:' + ops[1]]];
    case 'jal': if (ops.length === 1) return [['jal', 'ra', ops[0]]]; return [[mn, ...ops]];
    case 'jalr': if (ops.length === 1) return [['jalr', 'ra', `0(${ops[0]})`]]; return [[mn, ...ops]];
    default: return [[mn, ...ops]];
  }
}

export function assemble(src) {
  const errors = [];
  const labels = {};
  const items = []; // { addr, line, src, mn, ops, pair } | { addr, line, src, word }
  let addr = 0;
  const lines = src.split(/\r?\n/);

  // ---- 1a pasada: labels, directivas y expansión de pseudos
  lines.forEach((raw, idx) => {
    const line = idx + 1;
    let text = raw.replace(/(#|\/\/).*$/, '').trim();
    let m;
    while ((m = /^([A-Za-z_.$][\w.$]*)\s*:\s*(.*)$/.exec(text))) {
      if (m[1] in labels) errors.push({ line, msg: `label duplicado '${m[1]}'` });
      labels[m[1]] = addr;
      text = m[2].trim();
    }
    if (!text) return;
    const sp = text.search(/\s/);
    const mn = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : text.slice(sp + 1).trim();
    const ops = rest ? rest.split(',').map((s) => s.trim()) : [];
    try {
      if (mn.startsWith('.')) {
        if (mn === '.word') {
          for (const o of ops) {
            const v = parseInt32(o);
            items.push({ addr, line, src: text, word: v === null ? null : v >>> 0, label: v === null ? o : null });
            addr += 4;
          }
        } else if (['.text', '.globl', '.global', '.data', '.align', '.section', '.type', '.size', '.option'].includes(mn)) {
          // directivas ignoradas
        } else throw new AsmError(`directiva desconocida '${mn}'`);
        return;
      }
      const exp = expand(mn, ops);
      exp.forEach((e, k) => {
        items.push({ addr, line, src: text, mn: e[0], ops: e.slice(1), part: k });
        addr += 4;
      });
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      errors.push({ line, msg: e.message });
    }
  });

  // ---- 2a pasada: codificación
  const reg = (t) => {
    const r = REGS[String(t).trim().toLowerCase()];
    if (r === undefined) throw new AsmError(`registro desconocido '${t}'`);
    return r;
  };
  const imm = (t, lo, hi) => {
    const v = parseInt32(t);
    if (v === null) throw new AsmError(`inmediato inválido '${t}'`);
    if (v < lo || v > hi) throw new AsmError(`inmediato ${v} fuera de rango [${lo}, ${hi}]`);
    return v;
  };
  const rel = (t, from, bits) => {
    let off;
    if (t in labels) off = labels[t] - from;
    else { off = parseInt32(t); if (off === null) throw new AsmError(`label desconocido '${t}'`); }
    const lim = 2 ** (bits - 1);
    if (off % 2 !== 0) throw new AsmError('destino no alineado');
    if (off < -lim || off >= lim) throw new AsmError(`salto fuera de rango (${off})`);
    return off;
  };
  const memop = (t) => {
    const m = /^(.*)\((.+)\)$/.exec(t.trim());
    if (!m) throw new AsmError(`se esperaba offset(reg), no '${t}'`);
    return [m[1].trim() === '' ? 0 : imm(m[1], -2048, 2047), reg(m[2])];
  };
  const argc = (ops, n, mn) => { if (ops.length !== n) throw new AsmError(`'${mn}' espera ${n} operandos`); };

  const words = [];
  const listing = [];
  for (const it of items) {
    let word = 0;
    try {
      if (it.word !== undefined) {
        word = it.word;
        if (it.label !== null) {
          if (!(it.label in labels)) throw new AsmError(`label desconocido '${it.label}'`);
          word = labels[it.label];
        }
      } else {
        const { mn, ops } = it;
        if (mn in R_OPS) { argc(ops, 3, mn); word = enc.r(R_OPS[mn][1], reg(ops[2]), reg(ops[1]), R_OPS[mn][0], reg(ops[0]), 0x33); }
        else if (mn in I_OPS) {
          argc(ops, 3, mn);
          if (/^%pcrel_lo:/.test(ops[2])) {
            // segunda mitad de 'la': relativo a la dirección del auipc anterior
            const lab = ops[2].slice(10);
            if (!(lab in labels)) throw new AsmError(`label desconocido '${lab}'`);
            word = enc.i(signed12(labels[lab] - (it.addr - 4)), reg(ops[1]), 0, reg(ops[0]), 0x13);
          } else word = enc.i(imm(ops[2], -2048, 2047), reg(ops[1]), I_OPS[mn], reg(ops[0]), 0x13);
        }
        else if (mn in SH_OPS) {
          argc(ops, 3, mn);
          word = enc.r(SH_OPS[mn][1], imm(ops[2], 0, 31), reg(ops[1]), SH_OPS[mn][0], reg(ops[0]), 0x13);
        } else if (mn in L_OPS) { argc(ops, 2, mn); const [o, b] = memop(ops[1]); word = enc.i(o, b, L_OPS[mn], reg(ops[0]), 0x03); }
        else if (mn in S_OPS) { argc(ops, 2, mn); const [o, b] = memop(ops[1]); word = enc.s(o, reg(ops[0]), b, S_OPS[mn], 0x23); }
        else if (mn in B_OPS) { argc(ops, 3, mn); word = enc.b(rel(ops[2], it.addr, 13), reg(ops[1]), reg(ops[0]), B_OPS[mn], 0x63); }
        else if (mn === 'lui') { argc(ops, 2, mn); word = enc.u(imm(ops[1], -524288, 1048575), reg(ops[0]), 0x37); }
        else if (mn === 'auipc') {
          argc(ops, 2, mn);
          let v;
          const mm = /^%pcrel_(hi|lo):(.+)$/.exec(ops[1]);
          if (mm) {
            if (!(mm[2] in labels)) throw new AsmError(`label desconocido '${mm[2]}'`);
            v = ((labels[mm[2]] - it.addr + 0x800) >> 12) & 0xfffff;
          } else v = imm(ops[1], -524288, 1048575);
          word = enc.u(v, reg(ops[0]), 0x17);
        } else if (mn === 'jal') { argc(ops, 2, mn); word = enc.j(rel(ops[1], it.addr, 21), reg(ops[0]), 0x6f); }
        else if (mn === 'jalr') {
          if (ops.length === 2) { const [o, b] = memop(ops[1]); word = enc.i(o, b, 0, reg(ops[0]), 0x67); }
          else { argc(ops, 3, mn); word = enc.i(imm(ops[2], -2048, 2047), reg(ops[1]), 0, reg(ops[0]), 0x67); }
        } else if (mn === 'ecall') { word = 0x00000073; }
        else if (mn === 'ebreak') { word = 0x00100073; }
        else throw new AsmError(`instrucción desconocida '${mn}'`);
      }
    } catch (e) {
      if (!(e instanceof AsmError)) throw e;
      errors.push({ line: it.line, msg: e.message });
    }
    words.push(word >>> 0);
    listing.push({ addr: it.addr, word: word >>> 0, src: it.src, line: it.line });
  }
  return { words: Uint32Array.from(words), listing, labels, errors };
}
