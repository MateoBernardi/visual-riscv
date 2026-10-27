// Resolución de símbolos del RTL -> líneas -> links de GitHub. Ver CONTRACT.md v2.
// Nunca se escriben números de línea a mano: se referencia por símbolo y rtl-index.json resuelve.
import INDEX from './rtl-index.json';

export const REPO = {
  owner: 'MateoBernardi',
  repo: 'arquitectura-de-computadoras',
  prefix: INDEX.prefix,
  ref: INDEX.commit || 'tp3-RISCV',
};
export const RTL_INDEX = INDEX;

export function fileEntry(file) { return INDEX.files[file] || null; }
export function modulesOf(file) { const f = fileEntry(file); return f ? f.modules : []; }

export function moduleInfo(file, moduleName) {
  return modulesOf(file).find((m) => m.name === moduleName) || null;
}

const one = (l) => (l == null ? null : { start: l, end: l });

// Busca `name` en una lista de módulos según la categoría, devolviendo { start, end } o null.
function inModules(mods, cat, name, moduleName) {
  for (const m of mods) {
    if (moduleName && m.name !== moduleName) continue;
    switch (cat) {
      case 'module': if (m.name === name) return { start: m.start, end: m.end }; break;
      case 'inst': { const x = m.instances.find((i) => i.name === name); if (x) return { start: x.line, end: x.end || x.line }; break; }
      case 'port': { const x = m.ports.find((i) => i.name === name); if (x) return one(x.line); break; }
      case 'reg': { const x = m.regs.find((i) => i.name === name); if (x) return one(x.line); break; }
      case 'wire': { const x = m.wires.find((i) => i.name === name); if (x) return one(x.line); break; }
      case 'assign': { const x = m.assigns.find((i) => i.lhs === name); if (x) return one(x.line); break; }
      case 'param': { const x = m.params.find((i) => i.name === name) || m.localparams.find((i) => i.name === name); if (x) return one(x.line); break; }
      case 'state': { const x = m.localparams.find((i) => i.name === name); if (x) return one(x.line); break; }
      case 'case': { const x = m.cases.find((i) => i.label === name); if (x) return one(x.line); break; }
      default: break;
    }
  }
  return null;
}

const ORDER = ['assign', 'reg', 'wire', 'port', 'state', 'inst', 'param'];
const PREFIXES = { module: 'module', inst: 'inst', port: 'port', reg: 'reg', wire: 'wire', assign: 'assign', param: 'param', state: 'state', case: 'case' };

/**
 * sym: number | [a, b] | 'module:NAME' | 'inst:NAME' | 'port:NAME' | 'reg:NAME' | 'wire:NAME'
 *      | 'assign:NAME' | 'param:NAME' | 'state:NAME' | 'case:LABEL' | 'NAME'
 * Opcionalmente 'categoria:NOMBRE@modulo' restringe la búsqueda a ese módulo del archivo.
 */
export function resolveSymbol(file, sym) {
  const f = fileEntry(file);
  if (!f) return null;
  if (typeof sym === 'number') return { start: sym, end: sym };
  if (Array.isArray(sym)) return { start: sym[0], end: sym[1] ?? sym[0] };
  if (typeof sym !== 'string' || !sym) return null;
  let cat = null, name = sym, moduleName = null;
  const at = name.lastIndexOf('@');
  if (at > 0) { moduleName = name.slice(at + 1); name = name.slice(0, at); }
  const c = name.indexOf(':');
  if (c > 0 && PREFIXES[name.slice(0, c)] && !/^\d/.test(name)) { cat = PREFIXES[name.slice(0, c)]; name = name.slice(c + 1); }
  if (cat) return inModules(f.modules, cat, name, moduleName);
  for (const k of ORDER) {
    const r = inModules(f.modules, k, name, moduleName);
    if (r) return r;
  }
  return null;
}

export function hasSymbol(file, sym) { return resolveSymbol(file, sym) != null; }

export function fileUrl(file) {
  return `https://github.com/${REPO.owner}/${REPO.repo}/blob/${REPO.ref}/${REPO.prefix}${file}`;
}

export function githubUrl(file, sym) {
  const base = fileUrl(file);
  if (sym == null) return base;
  const r = resolveSymbol(file, sym);
  if (!r) return base;
  return r.end > r.start ? `${base}#L${r.start}-L${r.end}` : `${base}#L${r.start}`;
}
