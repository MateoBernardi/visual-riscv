import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BLOCKS, BASE_Y, STAGE_RANGE, STRIP_Z } from './layout.js';

const HZ_COLORS = { raw: '#f0a53a', loadUse: '#e5533d', control: '#d9378f', falseStall: '#c9a227' };
const RESOLVER = '#2fd0a0';
const add = (c, o = 0.5) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const SLABS = ['ifid', 'idex', 'exmem', 'memwb'];

// Efectos de escena: peligros (hazards), resolutores, pulso de reloj en los registros de pipeline.
export function createEffects({ blocks, wires, packets }) {
  const root = new THREE.Group(); root.name = 'effects';
  const hazards = [];   // { obj, el, floor, color, t0 }
  const resolvers = []; // { meshes, label, wireIds, nextPkt }
  const clk = [];       // { mesh, t0 }

  function mkBadge(kind, label, color) {
    const e = document.createElement('div');
    e.className = `hz-badge hz-${kind}`; e.style.setProperty('--hz', color);
    e.innerHTML = '<span class="hz-tri"><svg viewBox="0 0 32 28"><path d="M16 2 30 26H2Z" fill="currentColor" stroke="#18213d" stroke-width="2" stroke-linejoin="round"/><path d="M16 10v8M16 21.5v1" stroke="#18213d" stroke-width="3" stroke-linecap="round"/></svg></span>';
    if (label) { const t = document.createElement('span'); t.className = 'hz-t'; t.textContent = label; e.append(t); }
    return e;
  }

  function markHazard({ stage, kind = 'raw', label = '', block } = {}) {
    const color = HZ_COLORS[kind] || HZ_COLORS.raw;
    let x, z, w, d;
    if (block && BLOCKS[block]) { x = BLOCKS[block].x; z = BLOCKS[block].z; w = BLOCKS[block].w + 3; d = BLOCKS[block].d + 3; }
    else if (STAGE_RANGE[stage]) { const [a, b] = STAGE_RANGE[stage]; x = (a + b) / 2; z = (STRIP_Z[0] + STRIP_Z[1]) / 2; w = b - a - 0.6; d = STRIP_Z[1] - STRIP_Z[0]; }
    else return;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), add(color, 0.0));
    floor.rotation.x = -Math.PI / 2; floor.position.set(x, BASE_Y + 0.05, z); root.add(floor);
    const el = mkBadge(kind, label, color);
    const obj = new CSS2DObject(el); obj.position.set(x, BASE_Y + (block ? BLOCKS[block].h + 2.8 : 6.5), block ? z : STRIP_Z[0] - 1); root.add(obj);
    hazards.push({ obj, el, floor, color, t0: performance.now() });
  }

  function showResolver({ blocks: ids = [], wires: wids = [], kind = 'raw', label = '' } = {}) {
    const meshes = [];
    for (const id of ids) {
      const b = BLOCKS[id]; if (!b) continue;
      const g = new THREE.Group(); g.position.set(b.x, BASE_Y, b.z);
      const aura = new THREE.Mesh(new RoundedBoxGeometry(b.w + 1.2, b.h + 0.8, b.d + 1.2, 2, 0.4), add(RESOLVER, 0.22));
      aura.position.y = b.h / 2; g.add(aura);
      const rings = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), add(RESOLVER, 0.7)); r.rotation.x = -Math.PI / 2; r.position.y = 0.06; g.add(r); return r; });
      root.add(g); meshes.push({ g, aura, rings, b });
    }
    const tubes = [];
    for (const wid of wids) {
      const c = wires.getCurve(wid); if (!c) continue;
      const t = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 0.22, 8, false), add(RESOLVER, 0.5)); root.add(t); tubes.push({ t, wid });
    }
    let lab = null;
    if (label || ids.length) {
      const e = document.createElement('div'); e.className = 'rs-label'; e.innerHTML = `<span class="rs-ok">✓</span>${label ? `<span>${label.replace(/</g, '&lt;')}</span>` : ''}`;
      lab = new CSS2DObject(e);
      const first = BLOCKS[ids[0]] || { x: 0, z: 0, h: 1 };
      lab.position.set(first.x, BASE_Y + (first.h || 1) + 2.4, first.z); root.add(lab);
    }
    resolvers.push({ meshes, tubes, lab, t0: performance.now(), nextPkt: 0 });
  }

  function dispose(o) { o.traverse((c) => { if (c.geometry) c.geometry.dispose(); if (c.material) c.material.dispose(); if (c.isCSS2DObject) c.element.remove(); }); root.remove(o); }
  function clearHazards() {
    for (const h of hazards) { dispose(h.floor); dispose(h.obj); }
    hazards.length = 0;
    for (const r of resolvers) { r.meshes.forEach((m) => dispose(m.g)); r.tubes.forEach((t) => dispose(t.t)); if (r.lab) dispose(r.lab); }
    resolvers.length = 0;
  }

  // pulso de reloj: barrido ordenado por los registros de pipeline
  const clkMeshes = new Map();
  function clockPulse() {
    const now = performance.now();
    SLABS.forEach((id, i) => {
      const b = blocks.blocks.get(id); if (!b) return;
      let m = clkMeshes.get(id);
      if (!m) {
        const d = BLOCKS[id];
        m = new THREE.Mesh(new RoundedBoxGeometry(d.w + 0.7, d.h + 0.5, d.d + 0.7, 2, 0.3), add('#bff7f0', 0));
        m.position.y = d.h / 2; b.group.add(m); clkMeshes.set(id, m);
      }
      clk.push({ mesh: m, t0: now + i * 110 });
    });
  }

  function update(now) {
    let active = false;
    for (const h of hazards) {
      const k = (Math.sin((now - h.t0) / 230) + 1) / 2;
      h.floor.material.opacity = 0.1 + k * 0.28;
      h.el.style.setProperty('--k', k.toFixed(2)); active = true;
    }
    for (const r of resolvers) {
      const t = (now - r.t0) / 1000;
      for (const m of r.meshes) {
        m.aura.material.opacity = 0.14 + 0.1 * Math.sin(t * 5);
        m.rings.forEach((ring, i) => {
          const ph = ((t * 0.9 + i * 0.5) % 1), s = Math.min(7, Math.max(m.b.w, m.b.d)) * 0.6 * (0.8 + ph * 1.8);
          ring.scale.setScalar(s); ring.material.opacity = 0.75 * (1 - ph);
        });
      }
      for (const w of r.tubes) w.t.material.opacity = 0.3 + 0.25 * Math.sin(t * 6);
      if (r.tubes.length && now > r.nextPkt) { r.nextPkt = now + 1000; r.tubes.forEach((w) => packets.send(w.wid, { color: RESOLVER, durationMs: 800 })); }
      active = true;
    }
    for (let i = clk.length - 1; i >= 0; i--) {
      const c = clk[i], t = (now - c.t0) / 520;
      if (t < 0) { active = true; continue; }
      if (t >= 1) { c.mesh.material.opacity = 0; clk.splice(i, 1); continue; }
      c.mesh.material.opacity = 0.55 * (1 - t) * (1 - t); active = true;
    }
    return active;
  }

  return { root, markHazard, showResolver, clearHazards, clockPulse, update };
}
