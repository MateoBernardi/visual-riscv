// Helpers mínimos de DOM (sin framework).
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; } }
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}
function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}
export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

export const hex32 = (n) => '0x' + ((n >>> 0).toString(16).toUpperCase().padStart(8, '0'));
export const hex8 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
export const sdec = (n) => String(n | 0);
export const STAGE_COLORS = { IF: '#1aa3a1', ID: '#4a7bd0', EX: '#f0a53a', MEM: '#9b6ad6', WB: '#e5533d' };
export const ABI = ['zero', 'ra', 'sp', 'gp', 'tp', 't0', 't1', 't2', 's0', 's1', 'a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9', 's10', 's11', 't3', 't4', 't5', 't6'];

export function getPath(obj, path) {
  if (!path) return undefined;
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
export function fmtValue(v) {
  if (v === undefined) return '—';
  if (v === null) return '—';
  if (typeof v === 'boolean') return v ? '1 (sí)' : '0 (no)';
  if (typeof v === 'number') return Number.isInteger(v) ? (v >= 0 && v <= 1 ? String(v) : v >= 0 && v < 256 ? `${v}  (0x${v.toString(16).toUpperCase()})` : `${hex32(v)}  (${sdec(v)})`) : String(v);
  if (typeof v === 'string') return v;
  if (ArrayBuffer.isView(v) || Array.isArray(v)) return `[${Array.from(v).slice(0, 8).map((x) => (typeof x === 'number' ? hex32(x) : x)).join(', ')}${v.length > 8 ? ', …' : ''}]`;
  if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k}=${typeof x === 'number' ? (x > 255 || x < 0 ? hex32(x) : x) : x}`).join(' ');
  return String(v);
}
export function safeStorage() {
  return {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignorado */ } },
  };
}
export function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
export const LEVEL_CLASS = { 'Básico': 'lvl-basic', 'Basico': 'lvl-basic', 'Intermedio': 'lvl-mid', 'Avanzado': 'lvl-adv' };
export function levelChip(level) { return h('span', { class: 'chip level ' + (LEVEL_CLASS[level] || 'lvl-basic') }, level); }
