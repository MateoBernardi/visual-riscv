import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export const ID_PALETTE = ['#1aa3a1', '#4a7bd0', '#f0a53a', '#9b6ad6', '#e5533d', '#2fa86b', '#d9578f', '#0f8ec7', '#c2651a', '#7a8f1f'];
export function colorForId(id) {
  if (id == null) return '#8a93a0';
  return ID_PALETTE[((id % ID_PALETTE.length) + ID_PALETTE.length) % ID_PALETTE.length];
}

const UP = new THREE.Vector3(0, 1, 0);
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

// Paquetes brillantes que viajan por el recorrido de un cable.
export function createPackets(getCurve) {
  const root = new THREE.Group();
  root.name = 'packets';
  const active = new Set();
  const geo = new THREE.CapsuleGeometry(0.24, 0.5, 4, 10);
  const trailGeo = new THREE.SphereGeometry(0.2, 8, 6);

  function send(wireId, { color, label, durationMs = 700, instrId } = {}) {
    const curve = getCurve(wireId);
    if (!curve) return Promise.resolve();
    const c = color || colorForId(instrId);
    const mat = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 1.8, roughness: 0.3 });
    const mesh = new THREE.Mesh(geo, mat);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 10), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    mesh.add(glow);
    let lab = null, labObj = null;
    if (label) {
      lab = document.createElement('div'); lab.className = 'packet-label'; lab.dataset.t = '2'; lab.textContent = label; lab.style.setProperty('--c', c);
      labObj = new CSS2DObject(lab); labObj.position.set(0, 0.9, 0); mesh.add(labObj);
    }
    root.add(mesh);
    return new Promise((resolve) => {
      const trail = [];
      for (let i = 0; i < 7; i++) {
        const tm = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        tm.visible = false; root.add(tm); trail.push(tm);
      }
      const p = { mesh, curve, start: performance.now(), dur: Math.max(60, durationMs), resolve, labObj, mat, glow, trail };
      active.add(p);
      place(p, 0);
    });
  }
  function place(p, t) {
    const e = ease(Math.min(1, Math.max(0, t)));
    p.curve.getPointAt(e, p.mesh.position);
    const tan = p.curve.getTangentAt(Math.min(0.999, Math.max(0.001, e)));
    p.mesh.quaternion.setFromUnitVectors(UP, tan);
    // la etiqueta no debe rotar con la cápsula: compensar con posición en espacio mundo
    // estela de partículas
    const pos = new THREE.Vector3();
    p.trail.forEach((tm, i) => {
      const te = ease(Math.min(1, Math.max(0, t - (i + 1) * 0.022)));
      if (te <= 0 || t >= 1) { tm.visible = false; return; }
      p.curve.getPointAt(te, pos);
      tm.position.copy(pos); tm.position.y += Math.sin((p.start + i * 91) * 0.01) * 0.12;
      const k = 1 - (i + 1) / (p.trail.length + 1);
      tm.scale.setScalar(0.3 + k * 0.9); tm.material.opacity = k * 0.55; tm.visible = true;
    });
    if (p.labObj) p.labObj.position.copy(UP).applyQuaternion(p.mesh.quaternion.clone().invert()).multiplyScalar(0.95);
  }
  function finish(p) {
    p.trail.forEach((tm) => { root.remove(tm); tm.material.dispose(); });
    root.remove(p.mesh); p.mat.dispose(); p.glow.material.dispose(); p.glow.geometry.dispose();
    if (p.labObj && p.labObj.element.parentNode) p.labObj.element.remove();
    active.delete(p); p.resolve();
  }
  // devuelve true mientras haya paquetes en vuelo
  function update(now) {
    for (const p of [...active]) {
      const t = (now - p.start) / p.dur;
      if (t >= 1) finish(p); else place(p, t);
    }
    return active.size > 0;
  }
  function clear() { for (const p of [...active]) finish(p); }
  return { root, send, update, clear, get count() { return active.size; } };
}
