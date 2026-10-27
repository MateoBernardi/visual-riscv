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

// Cadena de ids desde la raíz (la Vista general es la única raíz; cada vista de primer nivel tiene parent null) hasta viewId: ['uart_core', 'uart_rx', 'uart_rx_fsm']
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

// Ruta en la jerarquía REAL del RTL (top_riscv › u_cpu › u_alu), a partir de `within` / `instancePath` de la vista raíz de la cadena
// y de la instancia de cada nivel hijo. Sirve para decir dónde vive cada módulo sin tener vistas de top_riscv / riscv_pipeline.
export function rtlPath(viewId) {
  const chain = breadcrumb(viewId).map((id) => VIEWS[id]);
  if (!chain.length) return [];
  const root = chain[0];
  const out = ['top_riscv'];
  if (root.instancePath) out.push(...root.instancePath.split('.'));
  for (const v of chain.slice(1)) {
    if (v.instancePath) { out.length = 1; out.push(...v.instancePath.split('.')); } // vista hija que vive en otro módulo (p. ej. flow_ctrl en riscv_pipeline)
    else if (v.instance) out.push(v.instance);
  }
  return out;
}
