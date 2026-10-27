import * as THREE from 'three';

// Atlas de títulos "decal": todos los rótulos de una vista se dibujan en UNA textura y se arman como UN solo mesh
// (una draw call). Quedan pegados a la cara superior del hardware: escalan con el zoom, nunca tapan nada y son nítidos.
const CW = 512, CH = 96, COLS = 4, ROWS = 40;

export function createDecalAtlas({ color = '#18213d' } = {}) {
  const items = [];
  const canvas = document.createElement('canvas');
  let ctx = null, tex = null, mat = null;

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
    items.forEach((it, i) => {
      const cx = (i % COLS) * CW + CW / 2, cy = Math.floor(i / COLS) * CH + CH / 2;
      let size = 66;
      ctx.font = `600 ${size}px "Barlow Semi Condensed", sans-serif`;
      const wd = ctx.measureText(it.text).width;
      if (wd > CW - 24) { size = Math.max(22, Math.floor(size * (CW - 24) / wd)); ctx.font = `600 ${size}px "Barlow Semi Condensed", sans-serif`; }
      ctx.fillText(it.text, cx, cy + 3);
    });
    tex.needsUpdate = true;
  }

  // x,z: centro del decal en mundo; y: altura; maxW/maxH: caja disponible sobre la cara superior
  const mctx = document.createElement('canvas').getContext('2d');
  const SIZE = 66;
  function add(text, x, z, y, maxW, maxH) {
    if (items.length >= COLS * ROWS || !text) return 0;
    mctx.font = `600 ${SIZE}px "Barlow Semi Condensed", sans-serif`;
    const tw = Math.min(CW - 24, mctx.measureText(text).width + 4);
    // escala (unidades de mundo por pixel del atlas): el texto llena el ancho disponible sin pasar el alto
    const k = Math.min(maxW / tw, maxH / (SIZE * 0.78));
    items.push({ text, x, z, y, w: CW * k, h: CH * k });
    return tw * k; // ancho real del texto en unidades de mundo
  }

  function build() {
    if (!items.length) return null;
    const n = items.length;
    canvas.width = CW * COLS; canvas.height = CH * Math.ceil(n / COLS);
    ctx = canvas.getContext('2d');
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const pos = new Float32Array(n * 12), uv = new Float32Array(n * 8), idx = new Uint32Array(n * 6);
    items.forEach((it, i) => {
      const x0 = it.x - it.w / 2, x1 = it.x + it.w / 2, z0 = it.z - it.h / 2, z1 = it.z + it.h / 2;
      pos.set([x0, it.y, z1, x1, it.y, z1, x1, it.y, z0, x0, it.y, z0], i * 12);
      const c = i % COLS, r = Math.floor(i / COLS);
      const u0 = (c * CW) / canvas.width, u1 = ((c + 1) * CW) / canvas.width, v1 = 1 - (r * CH) / canvas.height, v0 = 1 - ((r + 1) * CH) / canvas.height;
      uv.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mesh = new THREE.Mesh(g, mat); mesh.renderOrder = 2; mesh.frustumCulled = false;
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    return mesh;
  }
  return { add, build, dispose() { if (tex) tex.dispose(); if (mat) mat.dispose(); } };
}
