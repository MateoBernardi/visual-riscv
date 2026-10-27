// Layout puro (sin three.js) de una vista interior: posiciones de partes, puertos y rutas de las redes.
// Todo se calcula sobre una retícula entera de paso STEP (unidades mundo); 1 celda de grilla = CELL_S pasos.
// Las redes se rutean con A* ortogonal (penaliza giros, cercanía a partes y solapamiento con otras redes),
// de modo que viajan por los canales entre celdas y se reparten en carriles paralelos.
export const CELL = 6;
export const STEP = 0.6;
const CELL_S = 10;   // celda en pasos
const INSET_S = 2;   // margen parte-celda (pasos): canal de 2*INSET entre partes vecinas
const TURN = 4;
const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N  (z crece hacia el frente)
const FACE_DIR = { E: 0, S: 1, W: 2, N: 3 };

export const KIND_HEIGHT = { reg: 1.6, ff: 1.2, regArray: 2.2, mem: 2.2, mux: 1.4, adder: 1.6, cmp: 1.5, logic: 1.4, decoder: 1.5, fsm: 1.8, submodule: 2.0, const: 0.6 };
export const MUX_NARROW = 0.5; // el lado angosto del mux mide la mitad que el ancho

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v; let i = k.length; k.push(key); v.push(val);
    while (i > 0) { const p = (i - 1) >> 1; if (k[p] <= key) break; k[i] = k[p]; v[i] = v[p]; i = p; }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v, rk = k[0], rv = v[0], lk = k.pop(), lv = v.pop(), n = k.length;
    if (n) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1; if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return [rk, rv];
  }
}

export function layoutView(schema) {
  const warnings = [];
  const [cols, rows] = schema.grid || [8, 6];
  const ports = schema.ports || [];
  const sidePorts = { l: [], r: [], t: [], b: [] };
  ports.forEach((p) => (sidePorts[p.side] || sidePorts.l).push(p));

  // dado (en pasos): margen de la pastilla
  const ML = sidePorts.l.length ? 12 : 5, MR = sidePorts.r.length ? 12 : 5;
  const MT = sidePorts.t.length ? 14 : 5, MB = sidePorts.b.length ? 14 : 5;
  const dieS = { x0: -ML, x1: cols * CELL_S + MR, z0: -MT, z1: rows * CELL_S + MB };
  const nx = dieS.x1 - dieS.x0 + 1, nz = dieS.z1 - dieS.z0 + 1;
  const idx = (x, z) => (z - dieS.z0) * nx + (x - dieS.x0);
  const inDie = (x, z) => x >= dieS.x0 && x <= dieS.x1 && z >= dieS.z0 && z <= dieS.z1;

  // ---- partes ----
  const parts = {};
  const blocked = new Uint8Array(nx * nz);
  for (const p of schema.parts || []) {
    const at = p.at || [0, 0], sz = p.size || [1, 1];
    const r = { x0: at[0] * CELL_S + INSET_S, x1: (at[0] + sz[0]) * CELL_S - INSET_S, z0: at[1] * CELL_S + INSET_S, z1: (at[1] + sz[1]) * CELL_S - INSET_S };
    parts[p.id] = { id: p.id, kind: p.kind, def: p, rs: r, faces: {} };
    for (let z = r.z0; z <= r.z1; z++) for (let x = r.x0; x <= r.x1; x++) if (inDie(x, z)) blocked[idx(x, z)] = 1;
  }
  const prox = new Uint8Array(nx * nz);
  for (let z = dieS.z0; z <= dieS.z1; z++) for (let x = dieS.x0; x <= dieS.x1; x++) {
    if (blocked[idx(x, z)]) continue;
    for (const [dx, dz] of DIRS) { const a = x + dx, b = z + dz; if (inDie(a, b) && blocked[idx(a, b)]) { prox[idx(x, z)] = 1; break; } }
  }

  // ---- puertos: pads sobre el borde, repartidos por orden ----
  const portPos = {};
  for (const side of ['l', 'r', 't', 'b']) {
    const list = sidePorts[side], n = list.length;
    list.forEach((p, i) => {
      const span = side === 'l' || side === 'r' ? rows * CELL_S : cols * CELL_S;
      const t = Math.round(((i + 1) / (n + 1)) * span);
      const pos = side === 'l' ? { x: dieS.x0, z: t, dir: 0 } : side === 'r' ? { x: dieS.x1, z: t, dir: 2 }
        : side === 't' ? { x: t, z: dieS.z0, dir: 1 } : { x: t, z: dieS.z1, dir: 3 };
      portPos[p.name] = { ...pos, side, def: p };
    });
  }

  // ---- extremos de las redes ----
  const nets = (schema.nets || []).map((n, i) => ({ def: n, id: n.id || `net${i}`, i }));
  const endpointOf = (ref) => {
    if (typeof ref === 'string' && ref.startsWith('port:')) { const q = portPos[ref.slice(5)]; return q ? { kind: 'port', ref: q, name: ref.slice(5) } : null; }
    const q = parts[ref]; return q ? { kind: 'part', ref: q } : null;
  };
  const center = (e) => (e.kind === 'part' ? { x: (e.ref.rs.x0 + e.ref.rs.x1) / 2, z: (e.ref.rs.z0 + e.ref.rs.z1) / 2 } : { x: e.ref.x, z: e.ref.z });
  const ok = [];
  for (const n of nets) {
    n.a = endpointOf(n.def.from); n.b = endpointOf(n.def.to);
    if (!n.a || !n.b) { warnings.push(`red ${n.id}: extremo desconocido (${!n.a ? n.def.from : n.def.to})`); continue; }
    ok.push(n);
  }
  const pickFace = (rs, o) => {
    const dx = o.x - (rs.x0 + rs.x1) / 2, dz = o.z - (rs.z0 + rs.z1) / 2;
    if (Math.abs(dx) >= Math.abs(dz) * 0.9) return dx >= 0 ? 'E' : 'W';
    return dz >= 0 ? 'S' : 'N';
  };
  // slots por (parte, cara): las redes que salen de una misma parte por una misma cara comparten ancla
  const slots = new Map();
  const ends = [];
  for (const n of ok) {
    for (const role of ['a', 'b']) {
      const e = n[role], other = center(n[role === 'a' ? 'b' : 'a']);
      const end = { net: n, role, e };
      if (e.kind === 'part') {
        end.face = pickFace(e.ref.rs, other);
        const key = `${e.ref.id}:${end.face}:${role === 'a' ? 'out' : 'in' + n.i}`;
        end.slot = slots.get(key) || { key, part: e.ref, face: end.face, members: [], others: [] };
        slots.set(key, end.slot);
        end.slot.members.push(end); end.slot.others.push(other);
      }
      n[role + 'End'] = end; ends.push(end);
    }
  }
  const byFace = new Map();
  for (const s of slots.values()) { const k = `${s.part.id}:${s.face}`; if (!byFace.has(k)) byFace.set(k, []); byFace.get(k).push(s); }
  for (const list of byFace.values()) {
    const { part, face } = list[0], rs = part.rs;
    const horiz = face === 'E' || face === 'W'; // la cara es vertical: se reparte a lo largo de z
    let lo = (horiz ? rs.z0 : rs.x0) + 1, hi = (horiz ? rs.z1 : rs.x1) - 1;
    if (part.kind === 'mux' && horiz && face === 'E') { const q = Math.round((rs.z1 - rs.z0) * (1 - MUX_NARROW) / 2); lo += q; hi -= q; }
    list.forEach((s) => { s.avg = s.others.reduce((a, o) => a + (horiz ? o.z : o.x), 0) / s.others.length; });
    list.sort((a, b) => a.avg - b.avg || a.key.localeCompare(b.key));
    list.forEach((s, i) => { s.pos = lo + Math.round(((i + 1) * (hi - lo)) / (list.length + 1)); });
  }
  const anchorOf = (end) => {
    if (end.e.kind === 'port') { const q = end.e.ref, d = DIRS[q.dir]; return { A: { x: q.x, z: q.z }, A1: { x: q.x + d[0] * INSET_S, z: q.z + d[1] * INSET_S }, dir: q.dir }; }
    const s = end.slot, rs = s.part.rs, dir = FACE_DIR[s.face], d = DIRS[dir];
    let A;
    if (s.face === 'E') A = { x: rs.x1, z: s.pos }; else if (s.face === 'W') A = { x: rs.x0, z: s.pos };
    else if (s.face === 'N') A = { x: s.pos, z: rs.z0 }; else A = { x: s.pos, z: rs.z1 };
    const A1 = { x: A.x + d[0] * INSET_S, z: A.z + d[1] * INSET_S };
    if (s.part.kind === 'mux' && (s.face === 'N' || s.face === 'S')) {
      // el lado superior/inferior del mux es oblicuo: el ancla sigue el borde real
      const u = (s.pos - rs.x0) / Math.max(1, rs.x1 - rs.x0), shrink = u * (rs.z1 - rs.z0) * (1 - MUX_NARROW) / 2;
      A = { x: A.x, z: s.face === 'N' ? rs.z0 + shrink : rs.z1 - shrink };
    }
    return { A, A1, dir };
  };

  // ---- ruteo ----
  const occ = new Float32Array(nx * nz);
  const occSrc = new Map();
  const gScore = new Float32Array(nx * nz * 4), parent = new Int32Array(nx * nz * 4);
  function stamp(arr, path) {
    const add = (x, z, v) => { if (inDie(x, z)) arr[idx(x, z)] += v; };
    for (const [x, z] of path) {
      add(x, z, 5);
      for (const [dx, dz] of DIRS) { add(x + dx, z + dz, 2); add(x + 2 * dx, z + 2 * dz, 0.6); }
    }
  }
  function astar(s, g, dir0, srcOcc) {
    gScore.fill(Infinity);
    const heap = new Heap();
    const sn = idx(s.x, s.z), gn = idx(g.x, g.z);
    const h = (x, z) => Math.abs(x - g.x) + Math.abs(z - g.z);
    const st0 = sn * 4 + dir0;
    gScore[st0] = 0; parent[st0] = -1; heap.push(h(s.x, s.z), st0);
    while (heap.size) {
      const [, st] = heap.pop();
      const n = st >> 2, d = st & 3;
      if (n === gn) {
        const path = []; let c = st;
        while (c !== -1) { const nn = c >> 2; path.push([(nn % nx) + dieS.x0, ((nn / nx) | 0) + dieS.z0]); c = parent[c]; }
        return path.reverse();
      }
      const x = (n % nx) + dieS.x0, z = ((n / nx) | 0) + dieS.z0, gc = gScore[st];
      for (const nd of [d, (d + 1) & 3, (d + 3) & 3]) {
        const X = x + DIRS[nd][0], Z = z + DIRS[nd][1];
        if (!inDie(X, Z)) continue;
        const m = idx(X, Z);
        if (blocked[m] && m !== gn) continue;
        const o = occ[m] - (srcOcc ? srcOcc[m] : 0);
        const cost = gc + 1 + prox[m] * 1.5 + (o > 0 ? o : 0) + (nd !== d ? TURN : 0);
        const ns = m * 4 + nd;
        if (cost < gScore[ns]) { gScore[ns] = cost; parent[ns] = st; heap.push(cost + h(X, Z), ns); }
      }
    }
    return null;
  }
  const simplify = (pts) => {
    const out = [];
    for (const p of pts) {
      if (out.length && out[out.length - 1][0] === p[0] && out[out.length - 1][1] === p[1]) continue;
      out.push(p);
      while (out.length >= 3) {
        const [a, b, c] = out.slice(-3);
        if ((a[0] === b[0] && b[0] === c[0]) || (a[1] === b[1] && b[1] === c[1])) { out.splice(out.length - 2, 1); } else break;
      }
    }
    return out;
  };

  const order = ok.slice().sort((p, q) => {
    const d = (n) => { const a = anchorOf(n.aEnd).A1, b = anchorOf(n.bEnd).A1; return Math.abs(a.x - b.x) + Math.abs(a.z - b.z); };
    return d(p) - d(q) || p.i - q.i;
  });
  const fanout = new Map();
  for (const n of ok) { const k = n.def.from; fanout.set(k, (fanout.get(k) || 0) + 1); }
  for (const n of order) {
    const a = anchorOf(n.aEnd), b = anchorOf(n.bEnd);
    const srcKey = n.def.from, shared = fanout.get(srcKey) > 1;
    if (shared && !occSrc.has(srcKey)) occSrc.set(srcKey, new Float32Array(nx * nz));
    const srcOcc = shared ? occSrc.get(srcKey) : null;
    let path = astar(a.A1, b.A1, a.dir, srcOcc);
    let fallback = false;
    if (!path) {
      fallback = true; warnings.push(`red ${n.id}: sin ruta, se usa un trazo en L`);
      path = [[a.A1.x, a.A1.z], [a.A1.x, b.A1.z], [b.A1.x, b.A1.z]];
    }
    stamp(occ, path); if (srcOcc) stamp(srcOcc, path);
    const pts = simplify([[a.A.x, a.A.z], ...path, [b.A.x, b.A.z]]);
    n.pts = pts; n.fallback = fallback; n.endDir = b.dir; n.startDir = a.dir;
  }

  // ---- a coordenadas mundo (centradas) ----
  const cxS = (dieS.x0 + dieS.x1) / 2, czS = (dieS.z0 + dieS.z1) / 2;
  const W = (x, z) => [(x - cxS) * STEP, (z - czS) * STEP];
  const outParts = {};
  for (const [id, p] of Object.entries(parts)) {
    const r = p.rs, [x0, z0] = W(r.x0, r.z0), [x1, z1] = W(r.x1, r.z1);
    outParts[id] = { id, kind: p.kind, def: p.def, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0, rect: { x0, x1, z0, z1 }, h: KIND_HEIGHT[p.kind] || 1.4 };
  }
  const outPorts = {};
  for (const [name, q] of Object.entries(portPos)) { const [x, z] = W(q.x, q.z); outPorts[name] = { name, x, z, side: q.side, dir: { x: DIRS[q.dir][0], z: DIRS[q.dir][1] }, def: q.def }; }
  const outNets = ok.map((n) => {
    const pts = n.pts.map(([x, z]) => W(x, z));
    // etiqueta en el punto medio del tramo más largo
    let best = 0, bi = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.abs(pts[i + 1][0] - pts[i][0]) + Math.abs(pts[i + 1][1] - pts[i][1]); if (l > best) { best = l; bi = i; } }
    const label = pts.length > 1 ? [(pts[bi][0] + pts[bi + 1][0]) / 2, (pts[bi][1] + pts[bi + 1][1]) / 2] : pts[0];
    const last = pts[pts.length - 1], prev = pts[pts.length - 2] || last;
    return { id: n.id, def: n.def, from: n.def.from, to: n.def.to, width: n.def.width || 1, points: pts, label, fallback: n.fallback, arrowDir: [Math.sign(last[0] - prev[0]), Math.sign(last[1] - prev[1])] };
  });
  const die = { x0: (dieS.x0 - cxS) * STEP, x1: (dieS.x1 - cxS) * STEP, z0: (dieS.z0 - czS) * STEP, z1: (dieS.z1 - czS) * STEP };
  die.w = die.x1 - die.x0; die.d = die.z1 - die.z0;
  // grilla (para texturas): desplazamientos del borde a la primera línea de la grilla
  const grid = { cols, rows, offL: ML * STEP, offT: MT * STEP, offB: MB * STEP };
  // caja de encuadre: la pastilla más espacio para las etiquetas externas de los puertos y la placa de título
  const sideW = (list) => (list.length ? Math.min(36, Math.max(12, Math.max(...list.map((q) => q.name.length + Math.min(26, String(q.ext || '').length) + 14)) * 0.7 + 3)) : 1);
  const fitBox = { x0: die.x0 - sideW(sidePorts.l), x1: die.x1 + sideW(sidePorts.r), z0: die.z0 - (sidePorts.t.length ? 13 : 9), z1: die.z1 + (sidePorts.b.length ? 4 : 1) };
  return { cell: CELL, step: STEP, die, grid, fitBox, parts: outParts, ports: outPorts, nets: outNets, warnings };
}
