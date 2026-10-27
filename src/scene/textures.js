import * as THREE from 'three';

const registry = [];
let hooked = false;
function hook() {
  if (hooked || typeof document === 'undefined' || !document.fonts) return;
  hooked = true;
  document.fonts.ready.then(() => registry.forEach((r) => r.draw()));
}

// Textura de texto serigrafiado (canvas). Se redibuja cuando las fuentes terminan de cargar.
export function makeTextTexture(text, { width = 512, height = 96, color = '#e8f3ea', font = '600 54px "Barlow Semi Condensed", sans-serif', align = 'center' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    ctx.clearRect(0, 0, width, height);
    ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle';
    ctx.textAlign = align;
    ctx.fillText(text, align === 'center' ? width / 2 : align === 'left' ? 8 : width - 8, height / 2 + 2);
    tex.needsUpdate = true;
  };
  draw();
  registry.push({ draw }); hook();
  return tex;
}

export function makeGridTexture(color = '#2b3a4a', line = '#5fb8b5') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = line; x.globalAlpha = 0.55; x.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function textPlane(text, w, h, opts = {}) {
  const ratio = w / h;
  const tex = makeTextTexture(text, { width: 512, height: Math.round(512 / ratio), ...opts });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
