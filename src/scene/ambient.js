import * as THREE from 'three';
import { BOARD } from './layout.js';

// Polvo ambiental sobre la placa: unas pocas partículas que flotan despacio (1 draw call, se actualiza solo en cuadros ambientales).
export function createAmbient(scene) {
  const N = 90;
  const pos = new Float32Array(N * 3), seed = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry();
  for (let i = 0; i < N; i++) {
    seed[i * 3] = Math.random(); seed[i * 3 + 1] = Math.random(); seed[i * 3 + 2] = Math.random();
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.PointsMaterial({ map: tex, size: 0.9, sizeAttenuation: true, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, color: '#fff2cf', fog: false });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 3;
  scene.add(pts);
  const W = BOARD.w + 6, D = BOARD.d + 6;
  function update(now, hidden) {
    pts.visible = !hidden;
    if (hidden) return false;
    const t = now / 1000;
    for (let i = 0; i < N; i++) {
      const a = seed[i * 3], b = seed[i * 3 + 1], s = seed[i * 3 + 2];
      pos[i * 3] = BOARD.cx + ((a + t * (0.004 + s * 0.006)) % 1 - 0.5) * W;
      pos[i * 3 + 1] = 1.5 + b * 13 + Math.sin(t * 0.4 + s * 20) * 0.6;
      pos[i * 3 + 2] = ((s + t * 0.003 * (b - 0.4)) % 1 + 1) % 1 * D - D / 2;
    }
    g.attributes.position.needsUpdate = true;
    return true;
  }
  function setTheme(t) { mat.color.set(t === 'dark' ? '#9fc0ff' : '#fff2cf'); mat.opacity = t === 'dark' ? 0.55 : 0.4; }
  return { update, setTheme };
}
