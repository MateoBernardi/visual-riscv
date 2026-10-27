import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { LabelRenderer } from '../labelRenderer.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { layoutView } from './layout.js';
import { buildPart, mix, topFootprint } from './parts.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createDecalAtlas } from '../decals.js';
import { STAGE_COLORS, THEME, BLOCKS } from '../layout.js';

export { layoutView };

const NEUTRAL = '#4fa3a5';
const DIE = { light: { die: '#30425e', line: '#46608a' }, dark: { die: '#0f1730', line: '#27386a' } };
const el = (cls, text) => { const d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; };
const span = (cls, text) => { const s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };
const dec = (() => { const t = typeof document !== 'undefined' ? document.createElement('textarea') : null; return (x) => { if (x == null || !t) return x; t.innerHTML = String(x); return t.value; }; })();
const clip = (x, n) => (x && x.length > n ? x.slice(0, n - 1) + '…' : x);
const MAJOR = new Set(['submodule', 'regArray', 'mem', 'fsm', 'reg']);
const fmtW = (w) => (w > 1 ? `[${w - 1}:0]` : '');

function resolvePath(ctx, path) {
  if (!ctx || !path) return undefined;
  let v = ctx;
  for (const k of String(path).split('.')) { if (v == null) return undefined; v = v[k]; }
  return v;
}
export function formatLive(v, width) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (typeof v === 'string') return v;
  if (typeof v !== 'number') return String(v);
  if (width === 1) return String(v & 1);
  if (width && width <= 4) return '0b' + (v >>> 0).toString(2).padStart(width, '0');
  if (width && width <= 8) return String(v >>> 0);
  return '0x' + (v >>> 0).toString(16).padStart(Math.max(2, Math.ceil((width || 32) / 4)), '0');
}

function roundedPath(pts, y, r) {
  const P = pts.map(([x, z]) => new THREE.Vector3(x, y, z));
  const path = new THREE.CurvePath();
  let cur = P[0];
  for (let i = 1; i < P.length - 1; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1];
    const l1 = p0.distanceTo(p1), l2 = p1.distanceTo(p2);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = p1.clone().addScaledVector(p0.clone().sub(p1).normalize(), rr);
    const b = p1.clone().addScaledVector(p2.clone().sub(p1).normalize(), rr);
    if (cur.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(cur, a));
    path.add(new THREE.QuadraticBezierCurve3(a, p1, b));
    cur = b;
  }
  const last = P[P.length - 1];
  if (cur.distanceTo(last) > 1e-4) path.add(new THREE.LineCurve3(cur, last));
  return path;
}

export function createInterior({ camera, getSize }) {
  const scene = new THREE.Scene();
  const hemi = new THREE.HemisphereLight(0xfff4dd, 0x7c8a7a, 1); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-24, 46, 30); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0004; sun.shadow.radius = 3; scene.add(sun); scene.add(sun.target);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.85; ground.receiveShadow = true; scene.add(ground);

  const labelRenderer = new LabelRenderer();
  labelRenderer.domElement.className = 'label-layer iv-layer';
  labelRenderer.domElement.style.display = 'none';

  let theme = 'light', root = null, schema = null, L = null, stageColor = NEUTRAL;
  let netColor = null, netEm = null, shimTex = null, shimMat = null, decalAtlas = null, items = new Map(), pickables = [], hover = null, hl = null, floorMat = null, floorTex = null, lastVals = new Map(), liveInit = false;
  const nets = [], parts = [], ports = [], fsmParts = [];
  const key = (type, id) => `${type}:${id}`;

  function setTheme(t) {
    theme = t;
    const th = THEME[t] || THEME.light;
    scene.background = new THREE.Color(th.bg);
    hemi.color.set(th.hemiSky); hemi.groundColor.set(th.hemiGround); hemi.intensity = th.hemiI; sun.intensity = th.dirI;
    if (floorMat) paintFloor();
    if (shimMat) shimMat.opacity = t === 'dark' ? 0.06 : 0.07;
  }
  function paintFloor() {
    const c = DIE[theme] || DIE.light;
    const cv = floorTex.image, x = cv.getContext('2d');
    x.fillStyle = c.die; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = c.line; x.globalAlpha = 0.55; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, 0); x.lineTo(64, 0); x.moveTo(0, 0); x.lineTo(0, 64); x.stroke();
    x.globalAlpha = 0.18; x.lineWidth = 1;
    for (const q of [16, 32, 48]) { x.beginPath(); x.moveTo(q, 0); x.lineTo(q, 64); x.moveTo(0, q); x.lineTo(64, q); x.stroke(); }
    x.globalAlpha = 1; floorTex.needsUpdate = true;
    floorMat.color.set('#ffffff');
  }

  function clear() {
    if (!root) return;
    netColor = netEm = null;
    root.traverse((o) => {
      if (o.isCSS2DObject) o.element.remove();
      if (o.geometry) o.geometry.dispose();
    });
    if (decalAtlas) { decalAtlas.dispose(); decalAtlas = null; }
    scene.remove(root); root = null;
    items = new Map(); pickables = []; nets.length = parts.length = ports.length = fsmParts.length = 0;
    hover = null; hl = null; lastVals = new Map(); liveInit = false;
  }

  function mkLabel(cls, parent, pos) {
    const e = el(cls); const o = new CSS2DObject(e); o.position.copy(pos); parent.add(o); return { e, o };
  }

  function build(sch) {
    clear();
    schema = sch; L = layoutView(sch);
    stageColor = (sch.stage && STAGE_COLORS[sch.stage]) || NEUTRAL;
    root = new THREE.Group(); scene.add(root);
    const { die } = L;

    // ---- piso: pastilla de silicio ----
    const plate = new THREE.Mesh(new RoundedBoxGeometry(die.w, 0.8, die.d, 3, 0.35), new THREE.MeshStandardMaterial({ color: DIE[theme].die, roughness: 0.7 }));
    plate.position.set((die.x0 + die.x1) / 2, -0.4, (die.z0 + die.z1) / 2); plate.receiveShadow = true; plate.castShadow = true; root.add(plate);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    floorTex = new THREE.CanvasTexture(cv); floorTex.colorSpace = THREE.SRGBColorSpace; floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(die.w / 6, die.d / 6); floorTex.offset.set(-L.grid.offL / 6, -L.grid.offB / 6); floorTex.anisotropy = 4;
    floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 });
    const top = new THREE.Mesh(new THREE.PlaneGeometry(die.w - 0.3, die.d - 0.3), floorMat);
    top.rotation.x = -Math.PI / 2; top.position.set((die.x0 + die.x1) / 2, 0.005, (die.z0 + die.z1) / 2); top.receiveShadow = true; root.add(top);
    paintFloor();
    // brillo de silicio: una banda diagonal suave que barre la pastilla (solo mueve el offset de la textura)
    {
      const sc = document.createElement('canvas'); sc.width = 256; sc.height = 4;
      const sx = sc.getContext('2d'); const gr = sx.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      sx.fillStyle = gr; sx.fillRect(0, 0, 256, 4);
      shimTex = new THREE.CanvasTexture(sc); shimTex.wrapS = shimTex.wrapT = THREE.RepeatWrapping; shimTex.repeat.set(0.45, 1); shimTex.center.set(0.5, 0.5); shimTex.rotation = 0.6;
      const shim = new THREE.Mesh(new THREE.PlaneGeometry(die.w - 0.3, die.d - 0.3), new THREE.MeshBasicMaterial({ map: shimTex, transparent: true, opacity: theme === 'dark' ? 0.06 : 0.07, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffffff' }));
      shim.rotation.x = -Math.PI / 2; shim.position.set(top.position.x, 0.012, top.position.z); shim.renderOrder = 1; root.add(shim); shimMat = shim.material;
    }
    // borde de color de etapa
    const rim = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(die.w - 0.3, die.d - 0.3)), new THREE.LineBasicMaterial({ color: stageColor }));
    rim.rotation.x = -Math.PI / 2; rim.position.set(top.position.x, 0.02, top.position.z); root.add(rim);

    // placa de título
    const tl = mkLabel('ip-title', root, new THREE.Vector3(die.x0, 0.4, die.z0 - 5.2));
    tl.e.style.translate = '50% -50%'; tl.e.style.setProperty('--c', stageColor);
    tl.e.append(el('ip-t1', `${sch.module}${sch.instance ? ' · ' + sch.instance : ''}`), el('ip-t2', sch.file || ''));

    // sombra y luz acotadas al dado
    const R = Math.max(die.w, die.d) * 0.75 + 10;
    Object.assign(sun.shadow.camera, { left: -R, right: R, top: R, bottom: -R, near: 5, far: 200 });
    sun.shadow.camera.updateProjectionMatrix();

    // ---- partes ----
    const decals = createDecalAtlas();
    for (const lp of Object.values(L.parts)) {
      const def = lp.def;
      const b = buildPart(lp, stageColor, sch);
      b.group.position.set(lp.x, 0, lp.z); root.add(b.group);
      const lab = mkLabel('ip-label', b.group, new THREE.Vector3(0, 0.25, lp.d / 2 + 0.3));
      lab.e.style.setProperty('--c', stageColor);
      lab.e.dataset.t = MAJOR.has(def.kind) ? '1' : def.live ? '2' : '3'; lab.e.style.translate = '0 55%';
      const t = el('ip-t', dec(def.label || def.id)); lab.e.append(t);
      { const fp = topFootprint({ ...def, ...lp }); const adder = def.kind === 'adder' || def.kind === 'cmp';
        lab.o.userData.decalW = decals.add(dec(def.label || def.id), lp.x, lp.z + fp.d * (adder ? -0.3 : 0.3), lp.h + 0.1, fp.w * 0.9, fp.d * 0.3); }
      const m = el('ip-m'); const wEl = span('ip-w', [def.kind === 'regArray' || def.kind === 'mem' ? `${def.depth || '?'}×${def.width || '?'}` : fmtW(def.width)].filter(Boolean).join('')); const vEl = span('ip-v', '');
      m.append(wEl, vEl); lab.e.append(m);
      if (!wEl.textContent) wEl.style.display = 'none';
      if (def.drill) { lab.e.classList.add('drill'); const en = span('ip-enter', ''); en.append(span('ip-en', 'entrar '), document.createTextNode('⤵')); t.append(' ', en); }
      const it = { type: 'part', id: def.id, def, lp, mats: b.mats, labelEl: lab.e, vEl, ring: b.ring, kind: def.kind, group: b.group, last: '' };
      items.set(key('part', def.id), it); parts.push(it); b.bodies.forEach((x) => pickables.push(x));
      if (def.kind === 'fsm' && sch.fsm) fsmParts.push(it);
    }

    { const dm = decals.build(); if (dm) { dm.name = 'decals'; root.add(dm); } decalAtlas = decals; }

    // ---- puertos ----
    for (const q of Object.values(L.ports)) {
      const inn = q.def.dir === 'in';
      const pad = new THREE.Mesh(new RoundedBoxGeometry(q.side === 'l' || q.side === 'r' ? 1.8 : 1.2, 0.45, q.side === 'l' || q.side === 'r' ? 1.2 : 1.8, 2, 0.15),
        new THREE.MeshStandardMaterial({ color: inn ? '#1aa3a1' : '#f0a53a', roughness: 0.4, metalness: 0.2, emissive: '#000', emissiveIntensity: 0 }));
      pad.position.set(q.x, 0.22, q.z); pad.castShadow = true; pad.userData = { type: 'port', id: q.name }; root.add(pad); pickables.push(pad);
      const extFull = dec(BLOCKS[q.def.ext]?.title || q.def.ext || 'ext'), ext = clip(extFull, 26);
      const out = new THREE.Vector3(-q.dir.x, 0, -q.dir.z);
      const lab = mkLabel('ip-port', root, new THREE.Vector3(q.x + out.x * 1.3, 0.4, q.z + out.z * 1.3));
      lab.e.dataset.t = '1'; lab.e.classList.add(inn ? 'in' : 'out'); lab.e.title = `${q.name} · ${extFull}${q.def.desc ? ' — ' + dec(q.def.desc).replace(/<[^>]+>/g, '') : ''}`;
      const w = fmtW(q.def.width);
      lab.e.append(...(inn ? [span('ip-arr', '← '), span('ip-ext', ext), span('ip-sep', ' · '), span('ip-nm', q.name), span('ip-w', w ? ' ' + w : ''), span('ip-v', '')]
        : [span('ip-nm', q.name), span('ip-w', w ? ' ' + w : ''), span('ip-v', ''), span('ip-arr', ' → '), span('ip-ext', ext)]));
      lab.e.style.translate = q.side === 'l' ? '-50% 0' : q.side === 'r' ? '50% 0' : q.side === 't' ? '0 -50%' : '0 50%';
      const it = { type: 'port', id: q.name, def: q.def, mats: [pad.material], labelEl: lab.e, vEl: lab.e.querySelector('.ip-v'), live: q.def.live };
      items.set(key('port', q.name), it); ports.push(it);
    }

    // ---- redes (todas fusionadas en un único mesh: color y brillo por vértice, ver paintNet) ----
    const seen = new Set(), netGeos = [];
    let vCursor = 0;
    for (const n of L.nets) {
      const bus = n.width > 1;
      const base = bus ? mix(stageColor, '#ffffff', 0.2) : new THREE.Color('#f3e3bd');
      const r = bus ? 0.26 : 0.12;
      const pts = n.points.map((p) => p.slice());
      // acorta el final para dejar lugar a la punta de flecha
      const pl = pts.length;
      let adx = 0, adz = 0;
      if (pl >= 2) {
        const [x1, z1] = pts[pl - 1], [x0, z0] = pts[pl - 2], len = Math.hypot(x1 - x0, z1 - z0);
        adx = (x1 - x0) / (len || 1); adz = (z1 - z0) / (len || 1);
        if (len > 1.6) { pts[pl - 1] = [x1 - adx * 0.8, z1 - adz * 0.8]; }
      }
      const path = roundedPath(pts, 0.45, 1.0);
      const segs = Math.max(5, Math.ceil(path.getLength() / 1.5));
      const tubeG = new THREE.TubeGeometry(path, segs, r, bus ? 6 : 4, false);
      const [lx, lz] = n.points[n.points.length - 1];
      const coneG = new THREE.ConeGeometry(bus ? 0.55 : 0.34, 0.9, 6);
      coneG.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(adx, 0, adz)));
      coneG.translate(lx - adx * 0.45, 0.45, lz - adz * 0.45);
      const ng = mergeGeometries([tubeG, coneG]) || tubeG;
      tubeG.dispose(); coneG.dispose();
      const vc = ng.attributes.position.count;
      const col = new Float32Array(vc * 3), em = new Float32Array(vc * 3);
      for (let k = 0; k < vc; k++) { col.set([base.r, base.g, base.b], k * 3); em.set([base.r * 0.18, base.g * 0.18, base.b * 0.18], k * 3); }
      ng.setAttribute('color', new THREE.BufferAttribute(col, 3)); ng.setAttribute('aEm', new THREE.BufferAttribute(em, 3));
      netGeos.push(ng);
      const vStart = vCursor; vCursor += vc;
      const pick = new THREE.Mesh(new THREE.TubeGeometry(path, Math.max(3, segs >> 2), 0.8, 3, false), new THREE.MeshBasicMaterial({ visible: false }));
      pick.userData = { type: 'net', id: n.id }; root.add(pick); pickables.push(pick);
      // etiqueta: una sola por (origen, nombre)
      const dk = `${n.from}|${n.def.name}`;
      let labEl = null, vEl = null;
      if (n.def.name && !seen.has(dk)) {
        seen.add(dk);
        const lab = mkLabel('in-label', root, new THREE.Vector3(n.label[0], 0.9, n.label[1]));
        lab.e.dataset.t = '3'; lab.e.append(span('in-n', dec(n.def.name)), span('in-v', '')); labEl = lab.e; vEl = lab.e.querySelector('.in-v');
      }
      const it = { type: 'net', id: n.id, def: n.def, mats: [], vStart, vCount: vc, base: base.clone(), baseI: 0.18, labelEl: labEl, vEl, width: n.width, pulse: 0, live: n.def.live };
      items.set(key('net', n.id), it); nets.push(it);
    }
    if (netGeos.length) {
      const big = mergeGeometries(netGeos);
      netGeos.forEach((g) => g.dispose());
      netColor = big.attributes.color; netEm = big.attributes.aEm; netColor.setUsage(THREE.DynamicDrawUsage); netEm.setUsage(THREE.DynamicDrawUsage);
      const nm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.1 });
      nm.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aEm; varying vec3 vEm;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEm = aEm;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vEm;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vEm;');
      };
      root.add(new THREE.Mesh(big, nm));
    }
    return {
      fitBox: L.fitBox, die, layout: L,
      partCenter: (id) => { const p = L.parts[id]; return p ? new THREE.Vector3(p.x, 1, p.z) : null; },
    };
  }

  // ---- estado visual ----
  const WHITE = new THREE.Color('#ffffff');
  const tmpC = new THREE.Color(), tmpE = new THREE.Color();
  // pinta una red: color difuso + brillo (emisión) por vértice
  function paintNet(it, c, e, intensity) {
    if (!netColor) return;
    tmpE.copy(e).multiplyScalar(intensity);
    const a = netColor.array, b = netEm.array;
    for (let k = it.vStart, end = it.vStart + it.vCount; k < end; k++) {
      a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b;
      b[k * 3] = tmpE.r; b[k * 3 + 1] = tmpE.g; b[k * 3 + 2] = tmpE.b;
    }
    netColor.needsUpdate = true; netEm.needsUpdate = true;
  }
  function applyState(it) {
    const k = key(it.type, it.id);
    const isH = hover === k, isL = hl === k, hot = isH || isL;
    if (it.type === 'net') {
      const c = hot ? tmpC.copy(it.base).lerp(WHITE, 0.55) : it.base;
      paintNet(it, c, c, hot ? 0.95 : it.baseI);
    } else if (it.type === 'part') {
      for (const m of it.mats) {
        if (isL) { m.emissive.set('#ffd24a'); m.emissiveIntensity = 0.5; } else if (isH) { m.emissive.copy(WHITE); m.emissiveIntensity = 0.22; } else m.emissiveIntensity = 0;
      }
    } else if (it.type === 'port') {
      const m = it.mats[0]; m.emissive.set(isL ? '#ffd24a' : '#ffffff'); m.emissiveIntensity = isL ? 0.7 : isH ? 0.35 : 0;
    }
    if (it.labelEl) { it.labelEl.classList.toggle('hover', isH); it.labelEl.classList.toggle('hl', isL); }
  }
  function setHover(type, id) {
    const k = type ? key(type, id) : null;
    if (k === hover) return false;
    const prev = hover; hover = k;
    if (prev && items.get(prev)) applyState(items.get(prev));
    if (k && items.get(k)) applyState(items.get(k));
    return true;
  }
  function setHighlight(id) {
    let k = null;
    if (id != null) {
      if (typeof id === 'string' && id.startsWith('port:')) k = key('port', id.slice(5));
      else k = items.has(key('part', id)) ? key('part', id) : items.has(key('net', id)) ? key('net', id) : items.has(key('port', id)) ? key('port', id) : null;
    }
    const prev = hl; hl = k;
    if (prev && items.get(prev)) applyState(items.get(prev));
    if (k && items.get(k)) applyState(items.get(k));
  }

  // ---- valores en vivo ----
  function setLive(ctx, now = performance.now()) {
    if (!schema) return;
    const seenAny = liveInit;
    const upd = (it, path, width) => {
      const raw = resolvePath(ctx, path);
      const txt = formatLive(raw, width);
      const vk = key(it.type, it.id);
      const prev = lastVals.get(vk);
      const sig = raw === undefined ? undefined : typeof raw === 'object' ? JSON.stringify(raw) : raw;
      lastVals.set(vk, sig);
      if (it.vEl && it.vEl.textContent !== txt) { it.vEl.textContent = txt; }
      if (it.labelEl) it.labelEl.classList.toggle('has-v', !!txt);
      if (seenAny && prev !== undefined && sig !== prev && it.type === 'net') it.pulse = now;
      if (seenAny && prev !== undefined && sig !== prev && it.type === 'part') it.flash = now;
      return raw;
    };
    for (const it of parts) if (it.def.live) upd(it, it.def.live, it.def.width);
    for (const it of nets) if (it.live) upd(it, it.live, it.width);
    for (const it of ports) if (it.live) upd(it, it.live, it.def.width);
    for (const it of fsmParts) {
      const raw = resolvePath(ctx, schema.fsm.live);
      const sts = schema.fsm.states || [];
      let idx = typeof raw === 'string' ? sts.findIndex((s) => s.name === raw) : sts.findIndex((s) => s.code === raw);
      if (idx < 0 && typeof raw === 'number') idx = raw;
      const name = idx >= 0 && sts[idx] ? sts[idx].name : raw != null ? String(raw) : '';
      it.vEl.textContent = name; it.labelEl.classList.toggle('has-v', !!name);
      const prev = it.stateIdx; it.stateIdx = idx;
      if (it.ring) it.ring.dots.forEach((d, i) => { d.mat.emissiveIntensity = i === idx ? 1.6 : 0; d.mat.color.set(i === idx ? stageColor : '#8a93a8'); d.mesh.scale.setScalar(i === idx ? 1.5 : 1); });
      if (prev !== idx && prev !== undefined) it.flash = now;
    }
    liveInit = true;
  }

  const bobT = new THREE.Vector3();
  let ambient = false;
  function update(now) {
    ambient = false;
    if (!root) return false;
    if (shimTex) { shimTex.offset.x = (now / 7000) % 1; ambient = true; }
    let active = false;
    for (const it of nets) {
      if (!it.pulse) continue;
      const k = 1 - (now - it.pulse) / 700;
      const hot = (hover === key('net', it.id) || hl === key('net', it.id));
      if (k <= 0) { it.pulse = 0; if (!hot) applyState(it); continue; }
      tmpC.copy(it.base).lerp(WHITE, k * 0.6);
      paintNet(it, it.base, tmpC, Math.max(hot ? 0.95 : 0, it.baseI + k * 1.5));
      active = true;
    }
    for (const it of parts) {
      if (it.flash) {
        const k = 1 - (now - it.flash) / 600;
        if (k <= 0) { it.flash = 0; applyState(it); } else {
          if (hover !== key('part', it.id) && hl !== key('part', it.id)) for (const m of it.mats) { m.emissive.set(stageColor); m.emissiveIntensity = 0.55 * Math.sin(k * Math.PI); }
          active = true;
        }
      }
      if (it.ring && it.ring.arrow) { it.ring.arrow.position.y = it.lp.h + 1.1 + Math.sin(now / 320) * 0.18; ambient = true; }
    }
    return active;
  }

  function pick(ray) {
    const hit = ray.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData : null;
  }
  const getItem = (type, id) => items.get(key(type, id));

  return {
    scene, labelRenderer, build, clear, update, pick, setHover, setHighlight, setLive, setTheme,
    getItem, partCenter: (id) => { const q = L && L.parts[id]; return q ? new THREE.Vector3(q.x, 1, q.z) : null; },
    get schema() { return schema; }, get layout() { return L; }, get stageColor() { return stageColor; },
    get hover() { return hover; }, get ambient() { return ambient; },
  };
}
