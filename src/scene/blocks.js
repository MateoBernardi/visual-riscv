import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BLOCKS, BASE_Y, STAGES, STAGE_COLORS, STAGE_NAMES, STAGE_RANGE, STRIP_Z } from './layout.js';
import { makeGridTexture } from './textures.js';

const OCC_Z = STRIP_Z[0] - 4.2; // fila fija en el borde trasero de las franjas de etapa
function el(cls, text) { const d = document.createElement('div'); d.className = cls; if (text != null) d.textContent = text; return d; }

function shapeGeometry(points, h) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 2 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0.08, 0);
  return g;
}
function muxPoints(w, d) { return [[-w / 2, -d / 2], [w / 2, -d / 4], [w / 2, d / 4], [-w / 2, d / 2]]; }
function aluPoints(w, d) { return [[-w / 2, -d / 2], [w / 2, -d / 6], [w / 2, d / 6], [-w / 2, d / 2], [-w / 2 + w * 0.3, 0]]; }

function mix(hex, hex2, t) { return new THREE.Color(hex).lerp(new THREE.Color(hex2), t); }

export function createBlocks() {
  const root = new THREE.Group();
  root.name = 'blocks';
  const blocks = new Map();
  const pickables = [];
  const hoverColor = new THREE.Color('#ffffff');

  for (const [id, def] of Object.entries(BLOCKS)) {
    const stageColor = def.stage ? STAGE_COLORS[def.stage] : '#6c7a89';
    const group = new THREE.Group();
    group.position.set(def.x, BASE_Y, def.z);
    group.name = id;
    const bodyColor = def.kind === 'slab' ? mix('#fbf6ed', stageColor, 0.55)
      : def.kind === 'conn' ? mix('#e9eef2', '#6c7a89', 0.25)
      : mix('#fffaf0', stageColor, def.kind === 'mem' ? 0.22 : 0.16);
    const mats = [];
    const mkMat = (c, o = {}) => { const m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: 0.03, emissive: '#000000', emissiveIntensity: 0, ...o }); mats.push(m); return m; };
    const bodyMat = mkMat(bodyColor);
    const parts = []; // mallas que reciben hover/outline
    const addPart = (geo, mat, y) => {
      const m = new THREE.Mesh(geo, mat); m.position.y = y; m.castShadow = true; m.receiveShadow = true;
      m.userData.blockId = id; group.add(m); parts.push(m); pickables.push(m); return m;
    };
    const rbr = (w, h, d) => Math.max(0.05, Math.min(0.3, Math.min(w, h, d) / 2 - 0.03));

    if (def.kind === 'mux') {
      addPart(shapeGeometry(muxPoints(def.w, def.d), def.h), bodyMat, 0);
    } else if (def.kind === 'alu') {
      addPart(shapeGeometry(aluPoints(def.w, def.d), def.h), bodyMat, 0);
    } else if (def.kind === 'regfile') {
      const n = 4, lh = def.h / n;
      for (let i = 0; i < n; i++) {
        const m = mkMat(mix(bodyColor, '#ffffff', i % 2 ? 0.25 : 0));
        const w = def.w - (i % 2) * 0.3;
        addPart(new RoundedBoxGeometry(w, lh - 0.06, def.d - (i % 2) * 0.3, 1, 0.12), m, lh * i + lh / 2);
      }
    } else {
      addPart(new RoundedBoxGeometry(def.w, def.h, def.d, 2, rbr(def.w, def.h, def.d)), bodyMat, def.h / 2);
    }

    // detalles de cara superior
    if (def.kind === 'mem') {
      const tex = makeGridTexture('#22303f', STAGE_COLORS[def.stage]);
      tex.repeat.set(def.w / 1.2, def.d / 1.2);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(def.w - 0.8, def.d - 0.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
      top.rotation.x = -Math.PI / 2; top.position.y = def.h + 0.012; group.add(top);
    } else if (def.kind !== 'slab') {
      const capMat = new THREE.MeshStandardMaterial({ color: stageColor, roughness: 0.5 });
      const hh = def.kind === 'regfile' ? def.h : def.h;
      let cap;
      if (def.kind === 'mux') cap = new THREE.Mesh(shapeGeometry(muxPoints(def.w * 0.45, def.d * 0.45), 0.05), capMat);
      else if (def.kind === 'alu') cap = new THREE.Mesh(shapeGeometry(aluPoints(def.w * 0.5, def.d * 0.5), 0.05), capMat);
      else cap = new THREE.Mesh(new RoundedBoxGeometry(def.w * 0.7, 0.08, def.d * 0.28, 1, 0.03), capMat);
      cap.position.y = hh + (def.kind === 'mux' || def.kind === 'alu' ? 0.1 : 0.0);
      cap.position.y = def.kind === 'mux' || def.kind === 'alu' ? def.h + 0.1 : def.h + 0.02;
      group.add(cap);
    } else {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(def.w + 0.04, 0.1, def.d - 1.2, 1, 0.03), new THREE.MeshStandardMaterial({ color: STAGE_COLORS[def.stage], roughness: 0.5 }));
      stripe.position.y = def.h + 0.02; group.add(stripe);
    }

    // contorno (hover / destacado)
    const outlines = parts.map((p) => {
      const o = new THREE.Mesh(p.geometry, new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 0.9 }));
      o.position.copy(p.position);
      const sx = (def.w + 0.5) / def.w, sy = (def.h + 0.4) / def.h, sz = (def.d + 0.5) / def.d;
      o.scale.set(def.kind === 'slab' ? 2.2 : sx, sy, def.kind === 'slab' ? (def.d + 0.4) / def.d : sz);
      o.visible = false; group.add(o); return o;
    });

    // ancla y etiqueta
    const anchor = new THREE.Object3D();
    anchor.position.set(0, def.h + 0.6, 0);
    group.add(anchor);
    const lab = el('blk-label'); lab.dataset.t = '1';
    const t = el('blk-t', def.title); const v = el('blk-v', '');
    const stEl = el('blk-status'); stEl.style.display = 'none';
    lab.append(t, v, stEl);
    if (def.stage) lab.style.setProperty('--c', STAGE_COLORS[def.stage]);
    const label = new CSS2DObject(lab);
    // las etiquetas se anclan al borde frontal del bloque (no encima del cuerpo) para no taparlo; las losas van sobre su tope
    if (def.kind === 'slab') label.position.set(0, def.h + 0.9, def.d / 2 - 1.5); else { label.position.set(0, 0.25, def.d / 2 + 0.3); lab.style.translate = '0 55%'; } // cuelga del borde frontal: no tapa el bloque
    group.add(label);

    const state = { highlight: null, hover: false };
    const apply = () => {
      const col = state.highlight || (state.hover ? '#ffffff' : null);
      outlines.forEach((o) => { o.visible = !!col; if (col) o.material.color.set(col); });
      mats.forEach((m) => {
        if (state.highlight) { m.emissive.set(state.highlight); m.emissiveIntensity = 0.45; }
        else if (state.hover) { m.emissive.copy(hoverColor); m.emissiveIntensity = 0.18; }
        else m.emissiveIntensity = 0;
      });
      lab.classList.toggle('hl', !!state.highlight); lab.classList.toggle('hover', state.hover);
      if (state.highlight) lab.style.setProperty('--hl', state.highlight);
    };

    blocks.set(id, {
      id, def, group, anchor, label, valueEl: v, labelEl: lab,
      setHighlight(c) { state.highlight = c || null; apply(); },
      setSelected(b) { lab.classList.toggle('sel', !!b); },
      setHover(b) { if (state.hover !== b) { state.hover = b; apply(); } },
      setStatus(st) {
        if (!st || !st.text) { stEl.style.display = 'none'; stEl.textContent = ''; lab.classList.remove('has-st'); return; }
        stEl.textContent = st.text; stEl.className = 'blk-status tone-' + (st.tone || 'info'); stEl.style.display = ''; lab.classList.add('has-st');
      },
      setValue(text) { const s = text == null ? '' : String(text); if (v.textContent !== s) v.textContent = s; lab.classList.toggle('has-v', !!s); },
    });
    root.add(group);
  }

  // etiquetas de etapa (piso) + etiquetas de ocupante (flotantes)
  const occupants = {};
  const strips = [];
  for (const s of STAGES) {
    const [x0, x1] = STAGE_RANGE[s];
    const cx = (x0 + x1) / 2;
    const sl = el('stage-label'); sl.style.setProperty('--c', STAGE_COLORS[s]);
    sl.append(el('s-code', s), el('s-name', STAGE_NAMES[s]));
    const so = new CSS2DObject(sl); so.position.set(cx, BASE_Y + 0.2, STRIP_Z[1] + 1.2);
    root.add(so);

    const occ = el('occ'); occ.style.setProperty('--c', STAGE_COLORS[s]);
    const oc = el('occ-code', s); const ot = el('occ-text', '—');
    occ.append(oc, ot);
    const oo = new CSS2DObject(occ); oo.position.set(cx, BASE_Y + 0.9, OCC_Z);
    root.add(oo);
    occupants[s] = { occ, ot };
    strips.push({ stage: s, el: occ, x0, x1, y: BASE_Y + 0.9, z: OCC_Z });
  }

  function setStageOccupant(stage, o = {}) {
    const rec = occupants[stage]; if (!rec) return;
    const kind = o.kind || 'instr';
    rec.occ.className = 'occ occ-' + kind;
    rec.occ.style.setProperty('--ic', o.color || STAGE_COLORS[stage]);
    rec.ot.textContent = kind === 'bubble' ? 'burbuja' : (o.label ?? '—');
    rec.occ.title = rec.ot.textContent;
  }

  return { root, blocks, pickables, strips, setStageOccupant };
}
