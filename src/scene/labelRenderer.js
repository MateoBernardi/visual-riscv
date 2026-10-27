import * as THREE from 'three';

// Render de etiquetas DOM (reemplaza a CSS2DRenderer + la pasada de anti-solapamiento) pensado para no tildar la escena:
//  - solo escribe en el DOM cuando algo cambia (transform redondeado, display, atributo de ocultamiento);
//  - no lee layout en el bucle: el tamaño de cada etiqueta se mide una vez y se vuelve a medir solo si cambió su contenido o clase;
//  - descarta etiquetas fuera de pantalla y aplica un nivel de detalle (LOD 1 lejos, 2 medio, 3 cerca) según `data-t` de cada una;
//  - anti-solapamiento greedy por prioridad en espacio de pantalla, con histéresis para que no parpadeen al hacer zoom.
// Cada etiqueta es un CSS2DObject (three) cuyo elemento puede llevar `data-t` = nivel mínimo de LOD en que se muestra (0 = siempre).

// Prioridad: bloque bajo el cursor > resaltado > ocupante de etapa > título de bloque > paquete > cable.
function priority(c) {
  if (c.contains('hover')) return 5000;
  if (c.contains('hl')) return 4500;
  if (c.contains('sel')) return 3500;
  if (c.contains('blk-label')) return 1000;
  if (c.contains('ip-title')) return 6000;
  if (c.contains('ip-label')) return 1500;
  if (c.contains('ip-port')) return 1200;
  if (c.contains('in-label')) return 200;
  if (c.contains('hz-badge')) return 5500;
  if (c.contains('rs-label')) return 4000;
  if (c.contains('occ')) return 3000;
  if (c.contains('stage-label')) return 2000;
  if (c.contains('packet-label')) return 600;
  if (c.contains('wire-label')) return 300;
  return 100;
}
const HOT = 3500;

export class LabelRenderer {
  constructor({ pad = 3 } = {}) {
    this.domElement = document.createElement('div');
    this.domElement.style.overflow = 'hidden';
    this.width = 1; this.height = 1;
    this.pad = pad;
    this.lod = 3;
    this._vp = new THREE.Matrix4();
    this._v = new THREE.Vector3();
    this._shown = new Set();
    this._list = [];
    this._all = true;
    this._dirty = new Set();
    this._mo = typeof MutationObserver !== 'undefined' ? new MutationObserver((recs) => {
      for (const r of recs) {
        let n = r.target;
        while (n && n.parentNode !== this.domElement) n = n.parentNode;
        if (n && n._lr) n._lr.dirty = true;
      }
    }) : null;
    if (this._mo) this._mo.observe(this.domElement, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-t'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => this.invalidateSizes());
  }
  setSize(w, h) { this.width = w; this.height = h; this.domElement.style.width = w + 'px'; this.domElement.style.height = h + 'px'; }
  invalidateSizes() { this._all = true; }
  setLod(l) { if (l !== this.lod) { this.lod = l; this.domElement.dataset.lod = l; this._all = true; } }
  dispose() { if (this._mo) this._mo.disconnect(); }

  render(scene, camera) {
    scene.updateMatrixWorld();
    const W = this.width, H = this.height, v = this._v, lod = this.lod, list = this._list, dom = this.domElement;
    this._vp.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    list.length = 0;
    const now = new Set();
    scene.traverseVisible((o) => {
      if (!o.isCSS2DObject) return;
      const el = o.element;
      let st = el._lr;
      if (!st) { st = el._lr = { dirty: true, w: 0, h: 0, cn: '', prio: 100, key: '', disp: null, hid: false, z: '', tr: '', tx: 0, ty: 0, tier: 0 }; }
      v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(this._vp);
      const on = v.z >= -1 && v.z <= 1 && Math.abs(v.x) <= 1.12 && Math.abs(v.y) <= 1.12 && o.layers.test(camera.layers);
      if (!on) return;
      now.add(o);
      if (el.className !== st.cn) { st.cn = el.className; st.prio = priority(el.classList); }
      const t = el.dataset.t; st.tier = t === undefined ? 0 : +t;
      if (st.tier > lod && st.prio < HOT) return; // oculta por nivel de detalle (no entra a la pasada de colisión)
      // el título "decal" pegado a la parte ya se lee cuando su texto mide >= ~64 px: entonces la etiqueta DOM no repite el título
      const dw = o.userData.decalW;
      if (dw) {
        v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(camera.matrixWorldInverse);
        const nt = (dw * H * 0.5 * camera.projectionMatrix.elements[5]) / Math.max(0.01, -v.z) > 64;
        if (nt !== !!st.nt) { st.nt = nt; el.toggleAttribute('data-nt', nt); st.dirty = true; }
        if (nt && lod < 2 && st.prio < HOT) return;
        v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(this._vp);
      }
      const tr = el.style.translate;
      if (tr !== st.tr) { st.tr = tr; const m = tr ? tr.split(/\s+/) : []; st.tx = m[0] ? parseFloat(m[0]) / 100 : 0; st.ty = m[1] ? parseFloat(m[1]) / 100 : 0; if (isNaN(st.tx)) st.tx = 0; if (isNaN(st.ty)) st.ty = 0; }
      st.o = o; st.sx = (v.x * 0.5 + 0.5) * W; st.sy = (-v.y * 0.5 + 0.5) * H; st.depth = v.z; st.el = el;
      list.push(st);
    });

    // 1) mostrar los que faltan y medir los sucios (una sola lectura de layout, solo si hace falta)
    let needMeasure = false;
    for (const st of list) {
      if (st.disp !== true) { st.el.style.display = ''; st.disp = true; st.dirty = true; if (st.el.parentNode !== dom) dom.appendChild(st.el); }
      if (this._all) st.dirty = true;
      if (st.dirty) needMeasure = true;
    }
    if (needMeasure) for (const st of list) if (st.dirty) { st.w = st.el.offsetWidth; st.h = st.el.offsetHeight; st.dirty = false; }
    this._all = false;

    // 2) anti-solapamiento: mayor prioridad primero; los ya visibles ganan un poco de prioridad (histéresis)
    list.sort((a, b) => (b.prio + (b.hid ? 0 : 40)) - (a.prio + (a.hid ? 0 : 40)));
    const placed = [], pad = this.pad;
    for (const st of list) {
      const x0 = st.sx - st.w / 2 + st.tx * st.w, y0 = st.sy - st.h / 2 + st.ty * st.h;
      const x1 = x0 + st.w, y1 = y0 + st.h;
      let hide = false;
      if (st.prio < 5000) {
        for (let k = 0; k < placed.length; k++) {
          const q = placed[k];
          if (x0 < q[2] + pad && x1 + pad > q[0] && y0 < q[3] + pad && y1 + pad > q[1]) { hide = true; break; }
        }
      }
      if (!hide) placed.push([x0, y0, x1, y1]);
      if (hide !== st.hid) { st.hid = hide; st.el.toggleAttribute('data-h', hide); }
      // 3) escribir solo lo que cambió
      const key = `${Math.round(st.sx * 2)},${Math.round(st.sy * 2)}`;
      if (key !== st.key) { st.key = key; st.el.style.transform = `translate(-50%,-50%) translate(${(Math.round(st.sx * 2) / 2)}px,${(Math.round(st.sy * 2) / 2)}px)`; }
      const z = String(Math.max(1, 100000 - Math.round(st.depth * 50000)) + (st.prio >= HOT ? 100000 : 0));
      if (z !== st.z) { st.z = z; st.el.style.zIndex = z; }
    }

    // 4) ocultar lo que dejó de verse (fuera de pantalla, object.visible=false, o nivel de detalle)
    const inList = new Set(); for (const st of list) inList.add(st.o);
    for (const o of this._shown) {
      if (inList.has(o)) continue;
      const st = o.element._lr; if (st && st.disp !== false) { o.element.style.display = 'none'; st.disp = false; st.key = ''; }
    }
    this._shown = inList;
    // elementos que ya no están en la escena (clear) se quitan con el evento 'removed' de CSS2DObject
  }
}
