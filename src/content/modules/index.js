// Registro de vistas internas (zoom por la jerarquía del RTL). Ver CONTRACT.md v2.
const mods = import.meta.glob('./*.js', { eager: true });

export const VIEWS = {};
for (const [path, mod] of Object.entries(mods)) {
  if (path === './index.js' || !mod.default) continue;
  VIEWS[mod.default.id] = mod.default;
}

export function viewForBlock(blockId) {
  return Object.values(VIEWS).find((v) => v.blockIds && v.blockIds.includes(blockId)) || null;
}

// Cadena de ids desde la raíz hasta viewId: ['top_riscv', 'riscv_pipeline', 'alu_tp1']
export function breadcrumb(viewId) {
  const out = [];
  let v = VIEWS[viewId];
  while (v) {
    out.unshift(v.id);
    v = v.parent ? VIEWS[v.parent] : null;
  }
  return out;
}

export function childrenOf(viewId) {
  return Object.values(VIEWS).filter((v) => v.parent === viewId);
}
