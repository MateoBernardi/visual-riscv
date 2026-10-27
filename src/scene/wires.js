import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCKS, BASE_Y, WIRE_Y, THEME } from './layout.js';

// from/to: IDs de bloque; fs/ts: lado del puerto (l r f k t); arc: altura del arco; via: puntos [x,z] intermedios
const W = (from, fs, to, ts, o = {}) => ({ from, fs, to, ts, ...o });
export const WIRE_DEFS = {
  'pc-imem': W('pc', 'r', 'imem', 'l'),
  'imem-ifid': W('imem', 'r', 'ifid', 'l'),
  'pc-ifid': W('pc', 't', 'ifid', 't', { arc: 3.2 }),
  'ifid-control': W('ifid', 'r', 'control', 'l'),
  'ifid-regfile': W('ifid', 'r', 'regfile', 'l'),
  'ifid-immgen': W('ifid', 'r', 'immgen', 'l'),
  'ifid-hazard': W('ifid', 'r', 'hazard', 'l'),
  'control-idex': W('control', 'r', 'idex', 'l'),
  'regfile-idex': W('regfile', 'r', 'idex', 'l'),
  'immgen-idex': W('immgen', 'r', 'idex', 'l'),
  'idex-hazard': W('idex', 'l', 'hazard', 'r'),
  'hazard-pc': W('hazard', 't', 'pc', 't', { arc: 5.4 }),
  'hazard-ifid': W('hazard', 'l', 'ifid', 'r'),
  'hazard-idex': W('hazard', 'r', 'idex', 'l'),
  'idex-fwdMuxA': W('idex', 'r', 'fwdMuxA', 'l'),
  'idex-fwdMuxB': W('idex', 'r', 'fwdMuxB', 'l'),
  'fwdMuxA-alu': W('fwdMuxA', 'r', 'alu', 'l'),
  'fwdMuxB-aluSrcMux': W('fwdMuxB', 'r', 'aluSrcMux', 'l'),
  'idex-aluSrcMux': W('idex', 'r', 'aluSrcMux', 'l'),
  'aluSrcMux-alu': W('aluSrcMux', 'r', 'alu', 'l'),
  'idex-branch': W('idex', 'r', 'branch', 'l'),
  'alu-branch': W('alu', 'k', 'branch', 'f'),
  'branch-pc': W('branch', 't', 'pc', 't', { arc: 7 }),
  'alu-exmem': W('alu', 'r', 'exmem', 'l'),
  'fwdMuxB-exmem': W('fwdMuxB', 'r', 'exmem', 'l', { via: [[9.6, 3]] }),
  'idex-forward': W('idex', 'r', 'forward', 'l'),
  'forward-fwdMuxA': W('forward', 'f', 'fwdMuxA', 'k'),
  'forward-fwdMuxB': W('forward', 't', 'fwdMuxB', 't', { arc: 2.4 }),
  'exmem-forward': W('exmem', 't', 'forward', 't', { arc: 2.6 }),
  'memwb-forward': W('memwb', 't', 'forward', 't', { arc: 3.4 }),
  'exmem-fwdMuxA': W('exmem', 't', 'fwdMuxA', 't', { arc: 4.2 }),
  'exmem-fwdMuxB': W('exmem', 't', 'fwdMuxB', 't', { arc: 4.8 }),
  'memwb-fwdMuxA': W('memwb', 't', 'fwdMuxA', 't', { arc: 5.6 }),
  'memwb-fwdMuxB': W('memwb', 't', 'fwdMuxB', 't', { arc: 6.2 }),
  'branch-flush': W('branch', 'k', 'flush', 'r', { via: [[6.5, -12]] }),
  'flush-ifid': W('flush', 't', 'ifid', 't', { arc: 3.8 }),
  'flush-idex': W('flush', 't', 'idex', 't', { arc: 2.2 }),
  'exmem-dmem': W('exmem', 'r', 'dmem', 'l'),
  'exmem-wbMux': W('exmem', 'r', 'wbMux', 'k', { via: [[21, -4.6]] }),
  'dmem-wbMux': W('dmem', 'r', 'wbMux', 'l'),
  'wbMux-memwb': W('wbMux', 'r', 'memwb', 'l'),
  'memwb-regfile': W('memwb', 't', 'regfile', 't', { arc: 8 }),
  'uart-debug': W('uart', 'r', 'debug', 'l'),
  'debug-uart': W('debug', 'l', 'uart', 'r'),
  'clkrst-debug': W('clkrst', 'l', 'debug', 'r'),
  'debug-imem': W('debug', 'k', 'imem', 'f'),
  'debug-pc': W('debug', 'k', 'pc', 'f'),
};
export const WIRE_IDS = Object.keys(WIRE_DEFS);

const SIDE_DIR = { l: 'x', r: 'x', f: 'z', k: 'z', t: 'x' };

// Puntos de puerto con separación automática entre cables que comparten lado.
function buildPorts() {
  const lists = {};
  for (const [wid, d] of Object.entries(WIRE_DEFS)) {
    for (const end of ['from', 'to']) {
      const key = d[end] + ':' + d[end === 'from' ? 'fs' : 'ts'];
      (lists[key] ||= []).push(wid + ':' + end);
    }
  }
  return lists;
}
const PORT_LISTS = buildPorts();

function portOffset(blockId, side, wid, end) {
  const def = BLOCKS[blockId];
  if (def.kind === 'slab') return 0;
  const list = PORT_LISTS[blockId + ':' + side];
  const n = list.length; if (n < 2) return 0;
  const i = list.indexOf(wid + ':' + end);
  const extent = side === 'l' || side === 'r' ? def.d : def.w;
  const step = Math.min(0.7, (extent - 0.8) / (n - 1));
  return (i - (n - 1) / 2) * step;
}

function portPoint(blockId, side, other, wid, end) {
  const d = BLOCKS[blockId];
  const off = portOffset(blockId, side, wid, end);
  const slab = d.kind === 'slab';
  const hz = d.d / 2, hx = d.w / 2;
  const y = side === 't' ? BASE_Y + d.h + 0.02 : BASE_Y + (WIRE_Y - BASE_Y);
  switch (side) {
    case 'r': return new THREE.Vector3(d.x + hx, y, slab ? other.z : d.z + off);
    case 'l': return new THREE.Vector3(d.x - hx, y, slab ? other.z : d.z + off);
    case 'f': return new THREE.Vector3(d.x + off, y, d.z + hz);
    case 'k': return new THREE.Vector3(d.x + off, y, d.z - hz);
    default: return new THREE.Vector3(slab ? d.x : d.x + off, y, slab ? other.z : d.z);
  }
}

function connect(a, b, sd, ed) {
  const dx = Math.abs(a.x - b.x), dz = Math.abs(a.z - b.z);
  if (dx < 0.01 || dz < 0.01) return [];
  const y = WIRE_Y;
  if (sd === 'x' && ed === 'x') { const mx = (a.x + b.x) / 2; return [new THREE.Vector3(mx, y, a.z), new THREE.Vector3(mx, y, b.z)]; }
  if (sd === 'z' && ed === 'z') { const mz = (a.z + b.z) / 2; return [new THREE.Vector3(a.x, y, mz), new THREE.Vector3(b.x, y, mz)]; }
  if (sd === 'x') return [new THREE.Vector3(b.x, y, a.z)];
  return [new THREE.Vector3(a.x, y, b.z)];
}

function roundedPath(pts, r = 0.5) {
  const path = new THREE.CurvePath();
  let cur = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], pr = pts[i - 1], nx = pts[i + 1];
    const dIn = p.clone().sub(pr), dOut = nx.clone().sub(p);
    const lIn = dIn.length(), lOut = dOut.length();
    if (lIn < 1e-4 || lOut < 1e-4) continue;
    dIn.normalize(); dOut.normalize();
    const rr = Math.min(r, lIn / 2, lOut / 2);
    const s = p.clone().addScaledVector(dIn, -rr), e = p.clone().addScaledVector(dOut, rr);
    if (cur.distanceTo(s) > 1e-4) path.add(new THREE.LineCurve3(cur.clone(), s));
    if (Math.abs(dIn.dot(dOut)) < 0.999) path.add(new THREE.QuadraticBezierCurve3(s, p.clone(), e));
    else path.add(new THREE.LineCurve3(s, e));
    cur = e;
  }
  const last = pts[pts.length - 1];
  if (cur.distanceTo(last) > 1e-4) path.add(new THREE.LineCurve3(cur.clone(), last.clone()));
  return path;
}

function buildCurve(wid, d) {
  const via = (d.via || []).map(([x, z]) => new THREE.Vector3(x, WIRE_Y, z));
  const fc = new THREE.Vector3(BLOCKS[d.from].x, WIRE_Y, BLOCKS[d.from].z);
  const tc = new THREE.Vector3(BLOCKS[d.to].x, WIRE_Y, BLOCKS[d.to].z);
  const p0 = portPoint(d.from, d.fs, via[0] || tc, wid, 'from');
  const p1 = portPoint(d.to, d.ts, via[via.length - 1] || fc, wid, 'to');
  if (d.arc) {
    const pts = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const p = p0.clone().lerp(p1, t);
      p.y += d.arc * (1 - Math.pow(2 * t - 1, 4));
      pts.push(p);
    }
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  }
  const chain = [p0, ...via, p1];
  const pts = [chain[0]];
  for (let i = 0; i < chain.length - 1; i++) {
    const sd = i === 0 ? SIDE_DIR[d.fs] : 'x';
    const ed = i === chain.length - 2 ? SIDE_DIR[d.ts] : 'x';
    pts.push(...connect(chain[i], chain[i + 1], sd, ed), chain[i + 1]);
  }
  return roundedPath(pts, 0.55);
}

export function createWires() {
  const root = new THREE.Group();
  root.name = 'wires';
  const wires = new Map();
  let theme = THEME.light;
  const tubeGeos = [], glowGeos = [];
  let vTube = 0, vGlow = 0;
  const tmp = new THREE.Color(), tmpE = new THREE.Color();

  for (const [wid, d] of Object.entries(WIRE_DEFS)) {
    const curve = buildCurve(wid, d);
    const len = curve.getLength();
    const seg = Math.max(8, Math.ceil(len * 0.9));
    const tg = new THREE.TubeGeometry(curve, seg, 0.1, 5, false);
    const gg = new THREE.TubeGeometry(curve, seg, 0.26, 4, false);
    const nt = tg.attributes.position.count, ng = gg.attributes.position.count;
    tg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(nt * 4), 4));
    tg.setAttribute('aEm', new THREE.BufferAttribute(new Float32Array(nt * 3), 3));
    gg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(ng * 4), 4));
    tubeGeos.push(tg); glowGeos.push(gg);

    const lab = document.createElement('div'); lab.className = 'wire-label'; lab.dataset.t = '2'; lab.style.display = 'none';
    const labelObj = new CSS2DObject(lab);
    labelObj.visible = false;
    labelObj.position.copy(curve.getPointAt(0.5)).add(new THREE.Vector3(0, 0.7, 0));
    root.add(labelObj);

    wires.set(wid, { id: wid, def: d, curve, length: len, t0: vTube, tn: nt, g0: vGlow, gn: ng, lab, labelObj, active: false, color: '#1aa3a1', phase: Math.random() * 6 });
    vTube += nt; vGlow += ng;
  }
  // todos los cables en UN mesh (color + alfa + brillo por vértice) y todos los halos en otro: 2 draw calls en lugar de ~66
  const tubeBig = mergeGeometries(tubeGeos), glowBig = mergeGeometries(glowGeos);
  tubeGeos.forEach((g) => g.dispose()); glowGeos.forEach((g) => g.dispose());
  const tubeCol = tubeBig.attributes.color, tubeEm = tubeBig.attributes.aEm, glowCol = glowBig.attributes.color;
  tubeCol.setUsage(THREE.DynamicDrawUsage); tubeEm.setUsage(THREE.DynamicDrawUsage); glowCol.setUsage(THREE.DynamicDrawUsage);
  const tubeMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, roughness: 0.5 });
  tubeMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aEm; varying vec3 vEm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEm;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;');
  };
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const tubeMesh = new THREE.Mesh(tubeBig, tubeMat), glowMesh = new THREE.Mesh(glowBig, glowMat);
  tubeMesh.frustumCulled = glowMesh.frustumCulled = false;
  root.add(tubeMesh, glowMesh);

  function fill(attr, from, n, r, g, b, a) {
    const arr = attr.array, k = attr.itemSize;
    for (let i = from; i < from + n; i++) { arr[i * k] = r; arr[i * k + 1] = g; arr[i * k + 2] = b; if (k === 4) arr[i * k + 3] = a; }
    attr.needsUpdate = true;
  }
  function paint(w) {
    if (w.active) {
      tmp.set(w.color); tmpE.copy(tmp).multiplyScalar(1.3);
      fill(tubeCol, w.t0, w.tn, tmp.r, tmp.g, tmp.b, 1); fill(tubeEm, w.t0, w.tn, tmpE.r, tmpE.g, tmpE.b);
      fill(glowCol, w.g0, w.gn, tmp.r, tmp.g, tmp.b, 0.25);
    } else {
      tmp.set(theme.wireIdle);
      fill(tubeCol, w.t0, w.tn, tmp.r, tmp.g, tmp.b, theme.wireIdleOpacity); fill(tubeEm, w.t0, w.tn, 0, 0, 0);
      fill(glowCol, w.g0, w.gn, 0, 0, 0, 0);
    }
  }
  for (const w of wires.values()) paint(w);

  function setWire(id, { active = false, color = '#1aa3a1', label = null } = {}) {
    const w = wires.get(id); if (!w) return;
    const changed = w.active !== !!active || w.color !== color;
    w.active = !!active; w.color = color;
    if (changed) paint(w);
    // CSS2DRenderer controla el display según object.visible: hay que ocultar el objeto, no solo el elemento
    if (active && label) { if (w.lab.textContent !== label) w.lab.textContent = label; w.lab.style.setProperty('--c', color); w.labelObj.visible = true; }
    else { if (w.lab.textContent) w.lab.textContent = ''; w.labelObj.visible = false; }
  }
  function clearWires() { for (const id of wires.keys()) setWire(id, { active: false }); }
  function setTheme(t) {
    theme = THEME[t] || THEME.light;
    for (const w of wires.values()) if (!w.active) paint(w);
  }
  // Pulso del brillo del halo; devuelve true si hay cables activos (animación ambiental).
  function update(nowMs) {
    let any = false;
    for (const w of wires.values()) if (w.active) {
      any = true;
      const a = 0.22 + 0.1 * Math.sin(nowMs / 260 + w.phase), arr = glowCol.array;
      for (let i = w.g0; i < w.g0 + w.gn; i++) arr[i * 4 + 3] = a;
    }
    if (any) glowCol.needsUpdate = true;
    return any;
  }
  return { root, wires, setWire, clearWires, setTheme, update, getCurve: (id) => wires.get(id)?.curve };
}
