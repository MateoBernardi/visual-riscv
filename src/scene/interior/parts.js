import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { textPlane } from '../textures.js';
import { MUX_NARROW } from './layout.js';

export const mix = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);
const RB = (w, h, d, r = 0.25) => new RoundedBoxGeometry(w, h, d, r < 0.12 ? 1 : 2, Math.max(0.02, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01)));
const INK = '#18213d';

function muxGeometry(w, d, h) {
  const s = new THREE.Shape();
  const n = d * MUX_NARROW / 2;
  s.moveTo(-w / 2, -d / 2); s.lineTo(w / 2, -n); s.lineTo(w / 2, n); s.lineTo(-w / 2, d / 2); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2, curveSegments: 2 });
  g.rotateX(-Math.PI / 2); g.translate(0, 0.08, 0);
  return g;
}

const TEX_CACHE = new Map();
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const topPlane = (tex, w, d, y) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = y; return m;
};

function guessGlyph(p) {
  if (p.glyph) return p.glyph;
  const t = `${p.label || ''} ${p.symbol || ''}`;
  if (/<=|>=/.test(t)) return t.match(/<=|>=/)[0];
  if (/u\b|ltu|sin signo/i.test(t) && /<|lt/i.test(t)) return '<u';
  if (/<|\blt\b/i.test(t)) return '<';
  if (/!=/.test(t)) return '!=';
  return '==';
}

// Construye la malla de una parte. Devuelve { group, bodies (pickables), mats, top (altura) , ring }
export function buildPart(lp, stageColor, schema) {
  const p = { ...lp.def, ...lp };
  const { w, d, h } = p;
  const kind = p.kind;
  const g = new THREE.Group();
  const mats = [];
  const bodies = [];
  const mk = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.03, emissive: '#000000', emissiveIntensity: 0, ...o }); mats.push(m); return m; };
  const plain = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o }); m.userData.merge = true; return m; };
  const mixK = { reg: 0.35, ff: 0.4, mux: 0.28, adder: 0.3, cmp: 0.22, logic: 0.12, decoder: 0.2, fsm: 0.3, submodule: 0.05, regArray: 0.22, mem: 0.22, const: 0 }[kind] ?? 0.15;
  const bodyColor = kind === 'const' ? new THREE.Color('#f0d98a') : mix('#fffaf0', stageColor, mixK);
  const body = (geo, y, m) => { const mesh = new THREE.Mesh(geo, m || mk(bodyColor)); mesh.position.y = y; mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { type: 'part', id: p.id }; g.add(mesh); bodies.push(mesh); return mesh; };
  const cap = (cw, cd, x = 0, z = 0, y = h + 0.03) => { const m = new THREE.Mesh(RB(cw, 0.1, cd, 0.04), plain(stageColor)); m.position.set(x, y, z); g.add(m); return m; };
  let ring = null;

  switch (kind) {
    case 'reg': {
      body(RB(w, h, d, 0.3), h / 2);
      cap(w * 0.92, d * 0.2, 0, -d * 0.3);
      const n = Math.min(Math.max(2, p.width || 8), 16), sw = Math.min(0.5, (w * 0.8) / n * 0.7);
      const studGeos = [];
      for (let i = 0; i < n; i++) { const sg = new THREE.BoxGeometry(sw, 0.28, sw); sg.translate(-w * 0.4 + (i + 0.5) * (w * 0.8 / n), h + 0.14, -d * 0.1); studGeos.push(sg); }
      g.add(new THREE.Mesh(mergeGeometries(studGeos), plain(INK))); studGeos.forEach((x) => x.dispose());
      if (p.width > 1) { const chip = textPlane(`${p.width}b`, Math.min(2.2, w * 0.4), 0.8, { color: INK, font: '700 52px "JetBrains Mono", monospace', width: 256, height: 92 }); chip.position.set(w / 2 - Math.min(1.4, w * 0.25), h + 0.06, -d * 0.02); g.add(chip); }
      break;
    }
    case 'ff': {
      const s = Math.min(w, d, 2.8);
      body(RB(s, h, s, 0.3), h / 2);
      cap(s * 0.7, s * 0.7, 0, 0, h + 0.03);
      const tri = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.25, 3), plain(INK)); tri.rotation.x = Math.PI / 2; tri.position.set(0, h + 0.2, 0); g.add(tri);
      break;
    }
    case 'regArray': case 'mem': {
      body(RB(w, h, d, 0.3), h / 2);
      const rows = Math.min(Math.max(2, p.depth || 8), 16), cols = Math.min(Math.max(2, p.width || 8), 32);
      const tkey = `${rows}x${cols}${stageColor}`;
      const tex = TEX_CACHE.get(tkey) || canvasTex(256, 256, (x, W, H) => {
        x.fillStyle = '#1d2a3c'; x.fillRect(0, 0, W, H);
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
          x.fillStyle = (r + c) % 2 ? '#2f4764' : '#3a5a7c';
          if ((r * 7 + c * 3) % 11 === 0) x.fillStyle = stageColor;
          x.fillRect(c * W / cols + 1, r * H / rows + 1, W / cols - 2, H / rows - 2);
        }
      });
      TEX_CACHE.set(tkey, tex);
      const t = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.9, d - 0.9), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      t.rotation.x = -Math.PI / 2; t.position.y = h + 0.012; g.add(t);
      break;
    }
    case 'mux': {
      body(muxGeometry(w, d, h), 0);
      const c = new THREE.Mesh(muxGeometry(w * 0.45, d * 0.4, 0.06), plain(stageColor)); c.position.set(-w * 0.1, h + 0.08, 0); g.add(c);
      break;
    }
    case 'adder': case 'cmp': {
      body(RB(w, h, d, 0.4), h / 2);
      const gl = kind === 'adder' ? (p.glyph || '+') : guessGlyph(p);
      const s = Math.min(w, d) * 0.62;
      const gp = textPlane(gl, s * (gl.length > 1 ? 1.5 : 1), s, { color: INK, font: `700 ${gl.length > 1 ? 150 : 230}px "Barlow Semi Condensed", sans-serif`, width: 256, height: 170 });
      gp.position.y = h + 0.02; g.add(gp);
      cap(w * 0.9, 0.35, 0, d * 0.4);
      break;
    }
    case 'decoder': {
      body(RB(w, h, d, 0.3), h / 2);
      const n = Math.min(8, Math.max(3, Math.round(d / 1.1)));
      const tex = canvasTex(256, 128, (x, W, H) => {
        x.strokeStyle = INK; x.lineWidth = 6; x.lineCap = 'round';
        x.beginPath(); x.moveTo(14, H / 2); x.lineTo(W * 0.3, H / 2); x.stroke();
        for (let i = 0; i < n; i++) { const y = H * (0.14 + 0.72 * i / (n - 1)); x.beginPath(); x.moveTo(W * 0.3, H / 2); x.lineTo(W * 0.62, y); x.lineTo(W - 14, y); x.stroke(); x.fillStyle = stageColor; x.beginPath(); x.arc(W - 14, y, 8, 0, 7); x.fill(); }
      });
      g.add(topPlane(tex, w * 0.86, d * 0.8, h + 0.02));
      break;
    }
    case 'fsm': {
      body(RB(w, h, d, 0.5), h / 2);
      const r = Math.min(w, d) * 0.34;
      const torus = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 8, 48), plain(INK)); torus.rotation.x = Math.PI / 2; torus.position.y = h + 0.1; g.add(torus);
      const n = Math.max(3, schema?.fsm?.states?.length || 6);
      const dots = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2;
        const m = new THREE.MeshStandardMaterial({ color: '#8a93a8', emissive: stageColor, emissiveIntensity: 0, roughness: 0.4 });
        const s = new THREE.Mesh(new THREE.SphereGeometry(Math.min(0.5, r * 0.2), 12, 8), m); s.position.set(Math.cos(a) * r, h + 0.2, Math.sin(a) * r); g.add(s); dots.push({ mesh: s, mat: m });
      }
      ring = { dots };
      break;
    }
    case 'submodule': {
      const geo = RB(w, h, d, 0.4);
      body(geo, h / 2, mk(bodyColor));
      const dash = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineDashedMaterial({ color: mix(stageColor, '#18213d', 0.35), dashSize: 0.5, gapSize: 0.3 }));
      dash.computeLineDistances(); dash.position.y = h / 2; g.add(dash);
      const fr = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w * 0.82, d * 0.7)), new THREE.LineDashedMaterial({ color: mix(stageColor, '#18213d', 0.35), dashSize: 0.4, gapSize: 0.3 }));
      fr.computeLineDistances(); fr.rotation.x = -Math.PI / 2; fr.position.y = h + 0.02; g.add(fr);
      cap(w * 0.5, 0.3, 0, -d * 0.36);
      if (p.drill) {
        const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 12), plain(stageColor, { emissive: stageColor, emissiveIntensity: 0.5 }));
        arrow.rotation.x = Math.PI; arrow.position.set(w / 2 - 1.1, h + 1.1, d / 2 - 1); arrow.userData.bob = true; arrow.userData.nomerge = true; g.add(arrow);
        ring = { arrow };
      }
      break;
    }
    case 'const': {
      const cw = Math.min(w, 3.4), cd = Math.min(d, 2);
      body(RB(cw, h, cd, 0.2), h / 2);
      break;
    }
    default: {
      body(RB(w, h, d, 0.35), h / 2);
      cap(w * 0.8, d * 0.18, 0, -d * 0.3);
    }
  }
  consolidate();
  return { group: g, bodies, mats, height: h, ring };

  // cuerpo + tapa + detalles estáticos (sin textura) → UNA malla con color por vértice: una draw call por parte
  function consolidate() {
    const list = g.children.filter((c) => c.isMesh && !c.userData.nomerge && c.material && !c.material.map && (mats.includes(c.material) || c.material.userData.merge));
    if (list.length < 2) return;
    let geos = list.map((c) => {
      c.updateMatrix();
      const geo = c.geometry.clone(); geo.applyMatrix4(c.matrix);
      const n = geo.attributes.position.count, col = new Float32Array(n * 3), cc = c.material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      return geo;
    });
    if (geos.some((x) => !x.index)) geos = geos.map((x) => (x.index ? x.toNonIndexed() : x));
    const merged = mergeGeometries(geos);
    geos.forEach((x) => x.dispose());
    if (!merged) return;
    list.forEach((c) => { g.remove(c); c.geometry.dispose(); });
    mats.length = 0; bodies.length = 0;
    const mesh = new THREE.Mesh(merged, mk('#ffffff', { vertexColors: true }));
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData = { type: 'part', id: p.id };
    g.add(mesh); bodies.push(mesh);
  }
}

// huella real de la tapa de una parte (para ubicar el título decal)
export function topFootprint(p) {
  if (p.kind === 'ff') { const s = Math.min(p.w, p.d, 2.8); return { w: s, d: s }; }
  if (p.kind === 'const') return { w: Math.min(p.w, 3.4), d: Math.min(p.d, 2) };
  return { w: p.w, d: p.d };
}
