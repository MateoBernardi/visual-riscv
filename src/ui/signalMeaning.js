// Significado legible de las señales del RTL: nombre humano en español + interpretación del valor actual.
// Se busca por el nombre RTL normalizado (sin prefijos i_/o_/ex_/id_/mem_/wb_, sin guiones bajos, en minúsculas).
import { hex32, ABI } from './dom.js';

const norm = (n) => String(n).toLowerCase().replace(/^(i|o|ex|id|mem|wb|if)_/, '').replace(/[_\s]/g, '');
const bool = (v) => v === true || v === 1 || v === '1';
const num = (v) => (typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : v);
const reg = (v) => (Number.isInteger(v) && v >= 0 && v < 32 ? `x${v} (${ABI[v]})` : String(v));
const FWD = { 0: 'valor leído del banco de registros (sin adelantar)', 2: 'valor de EX/MEM (resultado de la instrucción anterior)', 1: 'valor de MEM/WB (resultado de dos instrucciones atrás)' };
const WBSEL = { 0: 'resultado de la ALU', 1: 'dato leído de memoria', 2: 'PC + 4 (dirección de retorno)', 3: 'inmediato (LUI)' };
const flag = (si, no) => (v) => (bool(v) ? si : no);

// human: nombre en español; mean(v): texto con el significado del valor; fmt(v): texto del valor (por defecto fmtValue)
export const SIGNALS = {
  forwarda: { human: 'Adelantamiento del operando A', mean: (v) => FWD[num(v)] },
  forwardb: { human: 'Adelantamiento del operando B', mean: (v) => FWD[num(v)] },
  fwda: { human: 'Adelantamiento del operando A', mean: (v) => FWD[num(v)] },
  fwdb: { human: 'Adelantamiento del operando B', mean: (v) => FWD[num(v)] },
  fwdaval: { human: 'Operando A tras adelantar' },
  fwdbval: { human: 'Operando B tras adelantar' },
  stall: { human: 'Detener el pipeline (stall)', mean: flag('PC e IF/ID congelados; entra una burbuja en ID/EX', 'el pipeline avanza normal') },
  falsestall: { human: 'Stall innecesario', mean: flag('hubo stall aunque el registro coincidente no es un operando real', 'no') },
  flushifid: { human: 'Anular la instrucción en IF/ID', mean: flag('IF/ID se carga con un NOP', 'IF/ID se conserva') },
  flushidex: { human: 'Anular la instrucción en ID/EX', mean: flag('ID/EX se carga con una burbuja', 'ID/EX se conserva') },
  redirect: { human: 'Cambiar el PC (salto)', mean: flag('el PC salta a redirect_target y se descartan las instrucciones de IF e ID', 'el PC sigue en PC + 4') },
  redirecttarget: { human: 'Destino del salto' },
  branchtaken: { human: 'Branch tomado', mean: flag('la condición se cumple: el salto se toma', 'la condición no se cumple: sigue la secuencia') },
  zero: { human: 'Resultado cero', mean: flag('la ALU dio 0 (A == B en una resta)', 'el resultado es distinto de 0') },
  lt: { human: 'A menor que B (con signo)', mean: flag('A < B', 'A >= B') },
  ltu: { human: 'A menor que B (sin signo)', mean: flag('A < B', 'A >= B') },
  wbsel: { human: 'Qué dato se escribe en el registro destino', mean: (v) => WBSEL[num(v)] },
  alusrc: { human: 'Origen del operando B', mean: flag('el inmediato de la instrucción', 'el registro rs2') },
  regwrite: { human: 'Escribir un registro', mean: flag('la instrucción escribe rd en el banco de registros', 'no escribe registros') },
  memread: { human: 'Leer memoria de datos', mean: flag('es un load: se lee la memoria', 'no lee memoria') },
  memwrite: { human: 'Escribir memoria de datos', mean: flag('es un store: se escribe la memoria', 'no escribe memoria') },
  branch: { human: 'Es un branch', mean: flag('instrucción de salto condicional', 'no es un branch') },
  jump: { human: 'Es un jump', mean: flag('JAL o JALR: salto incondicional', 'no es un jump') },
  isjalr: { human: 'Es JALR', mean: flag('el destino es rs1 + imm', 'no') },
  isauipc: { human: 'Es AUIPC', mean: flag('el operando A es el PC', 'no') },
  halt: { human: 'Instrucción de parada', mean: flag('ECALL/EBREAK: detiene la ejecución', 'no') },
  halting: { human: 'Parada en curso', mean: flag('hay un halt en EX o más adelante: se detiene el fetch', 'no') },
  pcen: { human: 'Habilitar el PC', mean: flag('el PC puede cargar un nuevo valor', 'el PC se mantiene') },
  enable: { human: 'Habilitación del core', mean: flag('el core corre', 'el core está congelado') },
  rst: { human: 'Reset', mean: flag('se reinicia el estado', 'sin reset') },
  reset: { human: 'Reset', mean: flag('se reinicia el estado', 'sin reset') },
  aluop: { human: 'Operación de la ALU' },
  aluout: { human: 'Resultado de la ALU' },
  alua: { human: 'Operando A de la ALU' },
  alub: { human: 'Operando B de la ALU' },
  pc: { human: 'Dirección de la instrucción (PC)' },
  pc4: { human: 'PC + 4' },
  inst: { human: 'Instrucción (32 bits)' },
  instr: { human: 'Instrucción (32 bits)' },
  imm: { human: 'Inmediato' },
  rs1: { human: 'Registro fuente 1', fmt: reg },
  rs2: { human: 'Registro fuente 2', fmt: reg },
  rd: { human: 'Registro destino', fmt: reg },
  funct3: { human: 'funct3' },
  rdata1: { human: 'Valor de rs1' },
  rdata2: { human: 'Valor de rs2' },
  memaddr: { human: 'Dirección de memoria' },
  memrdata: { human: 'Dato leído de memoria' },
  memwdata: { human: 'Dato a escribir en memoria' },
  memresult: { human: 'Resultado elegido en MEM' },
  wbresult: { human: 'Dato que se escribe en el registro' },
  wbdata: { human: 'Dato que se escribe en el registro' },
};

const full = (n) => String(n).toLowerCase().replace(/[_\s]/g, '');
export function meaningOf(rtlName) { return SIGNALS[full(rtlName)] || SIGNALS[norm(rtlName)] || null; }

const CONTROL_RE = /stall|flush|redirect(?!target)|sel$|forward|^fwd[ab]$|enable|^en$|we$|write|read$|halt|rst|reset|aluop|taken|alusrc|branch$|jump|jalr|auipc|pcen/;
export function isControlName(name) { return CONTROL_RE.test(norm(name)); }

// Devuelve { num, mean }: num = valor formateado, mean = significado (puede ser null)
export function describeValue(rtlName, v, fallbackFmt) {
  if (v === undefined || v === null) return { num: '—', mean: null, empty: true };
  const m = meaningOf(rtlName);
  let numText;
  if (m && m.fmt) numText = m.fmt(v);
  else if (typeof v === 'number' && !m?.mean && (v > 255 || v < 0)) numText = `${hex32(v)}  (${v | 0})`;
  else numText = fallbackFmt ? fallbackFmt(v) : String(v);
  let mean = null;
  if (m && m.mean) { try { mean = m.mean(v) || null; } catch { mean = null; } }
  if (typeof v === 'boolean') numText = v ? '1' : '0';
  return { num: numText, mean };
}
