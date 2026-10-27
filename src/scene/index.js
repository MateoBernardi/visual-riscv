import * as THREE from 'three';
import { LabelRenderer } from './labelRenderer.js';
import { createBoard } from './board.js';
import { createBlocks } from './blocks.js';
import { createWires } from './wires.js';
import { createPackets, colorForId } from './packets.js';
import { createCameraRig } from './camera.js';
import { BOARD, BLOCKS, THEME, DEFAULT_TARGET, STAGE_COLORS, BASE_Y } from './layout.js';
import { createInterior } from './interior/index.js';
import { createEffects } from './effects.js';
import { createAmbient } from './ambient.js';

const BASE_FOV = 32;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export { colorForId };
export { BLOCKS, STAGE_COLORS } from './layout.js';
export { WIRE_IDS } from './wires.js';
export { layoutView } from './interior/index.js';

export function createScene(container, { theme = 'light' } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1.6, 0.5, 700);
  camera.position.set(-1, 60, 80);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false; // la geometría que da sombra es estática: se recalcula solo cuando cambia la escena
  let shadowDirty = true;
  renderer.domElement.className = 'gl-canvas';
  container.appendChild(renderer.domElement);

  // modo captura (?shot): copia el canvas WebGL a un <img> para poder sacar screenshots en navegadores headless
  let shotImg = null;
  if (/[?&]shot/.test(location.search)) {
    shotImg = document.createElement('img');
    shotImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
    container.appendChild(shotImg);
  }
  const labelRenderer = new LabelRenderer();
  labelRenderer.domElement.className = 'label-layer';
  container.appendChild(labelRenderer.domElement);

  // luces
  const hemi = new THREE.HemisphereLight(0xfff4dd, 0x7c8a7a, 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-24, 46, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 36, bottom: -36, near: 5, far: 140 });
  sun.shadow.bias = -0.0004; sun.shadow.radius = 3;
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.16 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.62; ground.receiveShadow = true;
  scene.add(ground);

  const board = createBoard(); scene.add(board.group);
  const blocks = createBlocks(); scene.add(blocks.root);
  const wires = createWires(); scene.add(wires.root);
  const packets = createPackets((id) => wires.getCurve(id)); scene.add(packets.root);
  const effects = createEffects({ blocks, wires, packets }); scene.add(effects.root);
  const ambientFx = createAmbient(scene);

  let lastAmb = 0, dirty = true, raf = 0, last = performance.now(), disposed = false;
  const invalidate = () => { dirty = true; };
  const frameCbs = new Set();

  const rig = createCameraRig(camera, renderer.domElement, {
    invalidate,
    getHome: () => homePose(),
    getBlockPos: (id) => (BLOCKS[id] ? { x: BLOCKS[id].x, z: BLOCKS[id].z } : null),
  });
  rig.controls.addEventListener('start', () => { if (!transitioning) rig.cancelTween(); });
  const interior = createInterior({ camera, getSize: () => ({ w: container.clientWidth || 1, h: container.clientHeight || 1 }) });
  container.appendChild(interior.labelRenderer.domElement);
  const fade = document.createElement('div'); fade.className = 'iv-fade'; container.appendChild(fade);
  let view = null; // esquema de la vista interior actual
  // nivel de detalle de las etiquetas según el zoom relativo al encuadre (1 = lejos: solo títulos, 2 = medio, 3 = cerca: todo)
  const lodOf = () => {
    const r = camera.position.distanceTo(rig.controls.target) / Math.max(1, rig.getFitDistance());
    return view ? (r > 0.62 ? 1 : r > 0.32 ? 2 : 3) : (r > 1.2 ? 1 : r > 0.42 ? 2 : 3);
  };
  // el ancho de cada etiqueta de ocupante se limita al ancho (en pantalla) de su franja de etapa
  const sv = new THREE.Vector3();
  function fitStrips() {
    const w = container.clientWidth || 1;
    for (const s of blocks.strips) {
      sv.set(s.x0, s.y, s.z).project(camera); const xa = (sv.x * 0.5 + 0.5) * w;
      sv.set(s.x1, s.y, s.z).project(camera); const xb = (sv.x * 0.5 + 0.5) * w;
      const key = Math.round(Math.max(64, Math.abs(xb - xa) - 6));
      if (s.key !== key) { s.key = key; s.el.style.maxWidth = key + 'px'; if (s.el._lr) s.el._lr.dirty = true; }
    }
  }

  function setTheme(t) {
    shadowDirty = true;
    interior.setTheme(t);
    const th = THEME[t] || THEME.light;
    scene.background = new THREE.Color(th.bg);
    scene.fog = new THREE.Fog(th.bg, 120, 320);
    hemi.color.set(th.hemiSky); hemi.groundColor.set(th.hemiGround); hemi.intensity = th.hemiI;
    sun.intensity = th.dirI;
    wires.setTheme(t); if (typeof ambientFx !== 'undefined') ambientFx.setTheme(t);
    invalidate();
  }
  setTheme(theme);

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%';
    labelRenderer.setSize(w, h); interior.labelRenderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    rig.setAspect(w / h);
    invalidate();
  }
  // Zona libre de la escena (los paneles flotan encima): centra y encuadra el tablero completo en ella.
  // Se proyectan las esquinas del tablero con la cámara de la vista inicial, se ajusta la distancia hasta que
  // entran en la zona libre y se desplaza la vista (lens shift) para centrarlas.
  const fitCam = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.5, 700);
  // zonas libres casi cuadradas (p. ej. Debug con la consola abierta) usan una vista más cenital para aprovechar el alto
  const dirFor = (aspect) => {
    const e = THREE.MathUtils.degToRad(view ? THREE.MathUtils.clamp(66 + (2.1 - aspect) * 24, 66, 80) : THREE.MathUtils.clamp(52 + (2.1 - aspect) * 24, 52, 70));
    return new THREE.Vector3(0, Math.sin(e), Math.cos(e));
  };
  const boardCorners = [];
  for (const x of [BOARD.cx - BOARD.w / 2, BOARD.cx + BOARD.w / 2]) for (const z of [-BOARD.d / 2, BOARD.d / 2]) for (const y of [-0.6, 4]) boardCorners.push(new THREE.Vector3(x, y, z));
  let corners = boardCorners, minFitD = 40;
  const tgt = new THREE.Vector3(...DEFAULT_TARGET), pv = new THREE.Vector3();
  const BOARD_BOUNDS = { cx: BOARD.cx, cz: BOARD.cz, hx: BOARD.w / 2 + 10, hz: BOARD.d / 2 + 10 };
  function useBoardSpace() {
    corners = boardCorners; minFitD = 40; tgt.set(...DEFAULT_TARGET);
    rig.setSpace({ target: new THREE.Vector3(...DEFAULT_TARGET), bounds: BOARD_BOUNDS, getHome: () => homePose(), minFit: 40 });
    rig.controls.minDistance = 8;
  }
  function useInteriorSpace(info) {
    const b = info.fitBox; corners = [];
    for (const x of [b.x0, b.x1]) for (const z of [b.z0, b.z1]) for (const y of [-0.8, 3.6]) corners.push(new THREE.Vector3(x, y, z));
    minFitD = 12; tgt.set(0, 0, 0);
    rig.setSpace({ target: new THREE.Vector3(0, 0, 0), bounds: { cx: 0, cz: 0, hx: info.die.w / 2 + 4, hz: info.die.d / 2 + 4 }, getHome: () => homePose(), minFit: 12 });
    rig.controls.minDistance = 5;
  }
  function boardBox(D, W, H, dir) {
    fitCam.position.copy(tgt).addScaledVector(dir, D); fitCam.lookAt(tgt);
    fitCam.updateMatrixWorld(); fitCam.updateProjectionMatrix();
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of corners) {
      pv.copy(c).project(fitCam);
      const px = (pv.x * 0.5 + 0.5) * W, py = (-pv.y * 0.5 + 0.5) * H;
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    return { x0, x1, y0, y1 };
  }
  function computeFit(W, H, fw, fh, dir) {
    fitCam.fov = BASE_FOV; fitCam.aspect = W / H;
    let D = 100;
    for (let i = 0; i < 10; i++) {
      const b = boardBox(D, W, H, dir);
      const k = Math.max((b.x1 - b.x0) / (fw * 0.97), (b.y1 - b.y0) / (fh * 0.97));
      D *= k;
      if (Math.abs(k - 1) < 0.002) break;
    }
    D = THREE.MathUtils.clamp(D, minFitD, 320);
    const b = boardBox(D, W, H, dir);
    return { D, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 };
  }
  let insets = { top: 0, right: 0, bottom: 0, left: 0 }, curIns = { ...insets }, insAnim = false;
  const freeOf = (i) => { const W = container.clientWidth || 1, H = container.clientHeight || 1; return { W, H, fw: Math.max(120, W - i.left - i.right), fh: Math.max(120, H - i.top - i.bottom) }; };
  // vista inicial: dirección y distancia que encuadran todo el tablero en la zona libre (usa los márgenes finales)
  function homePose() {
    const { W, H, fw, fh } = freeOf(insets);
    const dir = dirFor(fw / fh);
    return { dir, dist: computeFit(W, H, fw, fh, dir).D };
  }
  function applyInsets(resetCam, rescale = !resetCam) {
    const { W, H, fw, fh } = freeOf(curIns);
    let dir = dirFor(fw / fh);
    if (!resetCam) { dir = camera.position.clone().sub(rig.controls.target); if (dir.lengthSq() < 1e-6) dir = dirFor(fw / fh); dir.normalize(); }
    const f = computeFit(W, H, fw, fh, dir);
    const sx = curIns.left + fw / 2 - f.cx, sy = curIns.top + fh / 2 - f.cy;
    if (Math.abs(sx) < 0.5 && Math.abs(sy) < 0.5) camera.clearViewOffset(); else camera.setViewOffset(W, H, -sx, -sy, W, H);
    rig.setFitDistance(f.D, rescale);
    if (!view && scene.fog) { scene.fog.near = f.D * 1.6; scene.fog.far = f.D * 4.2; }
    if (resetCam) rig.resetView(resetCam === 'now');
    invalidate();
  }
  // reset: salta al encuadre final (vista nueva); sin reset: anima suavemente los márgenes
  function setViewInsets(i, { reset = false } = {}) {
    insets = { top: 0, right: 0, bottom: 0, left: 0, ...i };
    if (reset) { curIns = { ...insets }; insAnim = false; applyInsets(reset); } else { insAnim = true; invalidate(); }
  }
  function stepInsets(dt) {
    if (!insAnim) return false;
    const k = 1 - Math.exp(-dt * 12);
    let done = true;
    for (const key of ['top', 'right', 'bottom', 'left']) {
      const d = insets[key] - curIns[key];
      if (Math.abs(d) < 0.5) curIns[key] = insets[key]; else { curIns[key] += d * k; done = false; }
    }
    if (done) insAnim = false;
    applyInsets(false);
    return true;
  }
  const ro = new ResizeObserver(() => { resize(); curIns = { ...insets }; insAnim = false; applyInsets(false); }); ro.observe(container);
  resize();
  useBoardSpace();
  rig.resetView(true);

  // ---- interacción: hover y click sobre bloques (placa) o partes/redes/puertos (interior) ----
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hovered = null, hoveredLed = null, pointerPos = null, down = null, clickCb = null, hoverCb = null, ledCb = null, iClickCb = null, iHoverCb = null;
  const ptrs = new Set();
  let lastPart = null;
  const dom = renderer.domElement;
  dom.style.cursor = 'grab';
  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  function setRay(ev) {
    const r = dom.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
  }
  function pick(ev) {
    setRay(ev);
    const hit = ray.intersectObjects([...blocks.pickables, ...board.ledHits], false)[0];
    if (!hit) return null;
    return hit.object.userData.led ? { led: hit.object.userData.led } : { block: hit.object.userData.blockId };
  }
  const onMove = (ev) => {
    pointerPos = ev;
    if (down && !down.moved && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) >= 5) { down.moved = true; dom.style.cursor = 'grabbing'; }
  };
  const onDown = (ev) => {
    ptrs.add(ev.pointerId);
    if (ptrs.size > 1) { if (down) down.multi = true; return; }
    down = { x: ev.clientX, y: ev.clientY, moved: false, multi: false };
  };
  const onUp = (ev) => {
    ptrs.delete(ev.pointerId);
    if (down && !down.moved && !down.multi && ev.button === 0 && !transitioning) {
      if (view) {
        setRay(ev); const h = interior.pick(ray);
        if (h) { if (h.type === 'part') lastPart = h.id; if (iClickCb) iClickCb({ type: h.type, id: h.id, schema: view }); }
      } else {
        const h = pick(ev); if (h && h.block && clickCb) clickCb(h.block);
      }
    }
    if (!ptrs.size) { down = null; refreshCursor(); }
  };
  const onLeave = () => { pointerPos = null; setHover(null); setLedHover(null); if (view) { interior.setHover(null); if (iHoverCb) iHoverCb(null); invalidate(); } };
  dom.addEventListener('pointermove', onMove);
  dom.addEventListener('pointerdown', onDown);
  dom.addEventListener('pointerup', onUp);
  dom.addEventListener('pointercancel', onUp);
  dom.addEventListener('pointerleave', onLeave);
  function refreshCursor() { dom.style.cursor = down && down.moved ? 'grabbing' : (hovered || hoveredLed || (view && interior.hover)) ? 'pointer' : 'grab'; }
  function setHover(id) {
    if (id === hovered) return;
    if (hovered) blocks.blocks.get(hovered).setHover(false);
    hovered = id;
    if (id) blocks.blocks.get(id).setHover(true);
    refreshCursor();
    if (hoverCb) hoverCb(id);
    invalidate();
  }
  const ledV = new THREE.Vector3();
  function setLedHover(led) {
    if (led === hoveredLed) return;
    hoveredLed = led; refreshCursor();
    if (!ledCb) return;
    if (!led) { ledCb(null); return; }
    const p = board.ledPos(led); ledV.copy(p).project(camera);
    const r = dom.getBoundingClientRect();
    const x = r.left + (ledV.x * 0.5 + 0.5) * r.width, y = r.top + (-ledV.y * 0.5 + 0.5) * r.height;
    ledCb({ led, rect: { left: x - 12, top: y - 12, right: x + 12, bottom: y + 12, width: 24, height: 24, x: x - 12, y: y - 12 } });
  }
  let lastClock = 0;

  // ---- inmersión: transiciones placa <-> interior ----
  let transitioning = false, boardPose = null, entryBlock = null, chain = Promise.resolve();
  const fadeTo = (col, on, ms = 300) => {
    fade.style.setProperty('--fc', col); fade.style.transitionDuration = ms + 'ms';
    fade.classList.toggle('on', on);
  };
  const fovFx = (ms, f0, f1) => new Promise((res) => {
    const t0 = performance.now();
    const step = () => { const k = Math.min(1, (performance.now() - t0) / ms); camera.fov = f0 + (f1 - f0) * easeIO(k); camera.updateProjectionMatrix(); invalidate(); if (k < 1) requestAnimationFrame(step); else res(); };
    step();
  });
  const closePose = (target, distFactor, dist) => {
    const dir = camera.position.clone().sub(rig.controls.target);
    if (dir.y < dir.length() * 0.5) dir.y = dir.length() * 0.8;
    dir.normalize();
    return target.clone().addScaledVector(dir, dist ?? distFactor);
  };
  async function doEnter(schema, { fromBlockId, fromPartId, animate = true } = {}) {
    transitioning = true; rig.controls.enabled = false; rig.cancelTween();
    const col = (schema.stage && STAGE_COLORS[schema.stage]) || '#4fa3a5';
    const was = !!view;
    if (!was) { boardPose = { target: rig.controls.target.clone(), pos: camera.position.clone() }; entryBlock = fromBlockId || entryBlock; }
    if (animate) {
      let target = null, ms = was ? 420 : 700, pos;
      if (!was) { const b = BLOCKS[fromBlockId]; if (b) { target = new THREE.Vector3(b.x, BASE_Y + b.h / 2, b.z); pos = closePose(target, 0, 11); } }
      else { const c = interior.partCenter(fromPartId || lastPart); if (c) { target = c; pos = closePose(c, 0, camera.position.distanceTo(rig.controls.target) * 0.3); } }
      if (target) {
        setTimeout(() => fadeTo(col, true, ms * 0.5), ms * 0.5);
        fovFx(ms, BASE_FOV, 52);
        await rig.tweenTo(target, pos, ms);
        await sleep(160);
      }
    }
    // intercambio de escena
    const info = interior.build(schema); shadowDirty = true;
    view = schema;
    labelRenderer.domElement.style.display = 'none'; interior.labelRenderer.domElement.style.display = '';
    setHover(null); setLedHover(null); interior.setHover(null, null);
    useInteriorSpace(info);
    camera.fov = BASE_FOV; camera.updateProjectionMatrix();
    applyInsets('now');
    const home = rig.controls.target.clone();
    const homePos = camera.position.clone();
    if (animate) {
      camera.position.copy(home).addScaledVector(homePos.clone().sub(home), 0.45);
      rig.controls.update();
      fadeTo(col, false, 520);
      fovFx(900, 26, BASE_FOV);
      invalidate();
      await rig.resetView(false);
    } else fadeTo(col, false, 1);
    rig.controls.enabled = true; transitioning = false; refreshCursor(); invalidate();
  }
  async function doExit({ animate = true } = {}) {
    if (!view) return;
    transitioning = true; rig.controls.enabled = false; rig.cancelTween();
    const col = (view.stage && STAGE_COLORS[view.stage]) || '#4fa3a5';
    if (animate) {
      const t = rig.controls.target.clone();
      setTimeout(() => fadeTo(col, true, 220), 170);
      fovFx(380, BASE_FOV, 48);
      await rig.tweenTo(t, closePose(t, 0, camera.position.distanceTo(t) * 0.45), 380);
      await sleep(100);
    }
    view = null; interior.clear(); shadowDirty = true;
    interior.labelRenderer.domElement.style.display = 'none'; labelRenderer.domElement.style.display = '';
    useBoardSpace();
    camera.fov = BASE_FOV; camera.updateProjectionMatrix();
    applyInsets(false, false);
    const pose = boardPose || { target: new THREE.Vector3(...DEFAULT_TARGET), pos: homePose().dir.multiplyScalar(homePose().dist) };
    if (animate) {
      const b = BLOCKS[entryBlock];
      const tb = b ? new THREE.Vector3(b.x, BASE_Y + b.h / 2, b.z) : pose.target.clone();
      const dir = pose.pos.clone().sub(pose.target).normalize();
      rig.controls.target.copy(tb); camera.position.copy(tb).addScaledVector(dir, 11); rig.controls.update();
      fadeTo(col, false, 520);
      fovFx(800, 30, BASE_FOV);
      await rig.tweenTo(pose.target, pose.pos, 850);
    } else {
      rig.controls.target.copy(pose.target); camera.position.copy(pose.pos); rig.controls.update(); fadeTo(col, false, 1);
    }
    rig.controls.enabled = true; transitioning = false; refreshCursor(); invalidate();
  }
  const queue = (fn) => { chain = chain.then(fn, fn); return chain; };

  // ---- panel de rendimiento (?perf): fps reales (cuadros renderizados), ms de CPU por cuadro, draw calls y triángulos ----
  let perfBox = null, perfN = 0, perfT = performance.now(), perfCpu = 0, perfStat = { fps: 0, cpu: 0 };
  if (/[?&]perf/.test(location.search)) {
    perfBox = document.createElement('pre'); perfBox.className = 'perf-box'; container.appendChild(perfBox);
  }
  const triOf = (o) => { let n = 0, m = 0; o.traverse((c) => { if (c.isMesh && c.visible) { const g = c.geometry, t = (g.index ? g.index.count : g.attributes.position.count) / 3; n += t * (c.isInstancedMesh ? c.count : 1); m++; } }); return { meshes: m, tris: Math.round(n) }; };
  const breakdown = () => { const o = {}; for (const [k, r] of Object.entries({ board: board.group, blocks: blocks.root, wires: wires.root, packets: packets.root, effects: effects.root, interior: interior.scene })) o[k] = triOf(r); return o; };
  const perfDetail = () => { const o = {}; (view ? interior.scene : scene).traverse((c) => { if (c.isMesh && c.visible && c.material.visible !== false) { const g = c.geometry, k = g.type + (c.isInstancedMesh ? '*' : ''); const e = o[k] || (o[k] = { n: 0, tris: 0 }); e.n++; e.tris += Math.round((g.index ? g.index.count : g.attributes.position.count) / 3); } }); return o; };
  const perfInfo = () => { const i = renderer.info; return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs ? i.programs.length : 0, fps: perfStat.fps, cpuMs: +perfStat.cpu.toFixed(2), parts: breakdown() }; };

  // ---- intro (Inicio): la cámara recorre suavemente la placa hasta que el usuario toca la escena ----
  let intro = false, introT0 = 0;
  const introDir = new THREE.Vector3(), introOff = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0);
  function setIntro(on) {
    if (on === intro || view) return;
    intro = on;
    if (on) { introT0 = performance.now(); rig.cancelTween(); rig.controls.enabled = false; }
    else { rig.controls.enabled = true; rig.resetView(false); }
  }
  function stepIntro(now) {
    const hp = homePose(), t = (now - introT0) / 1000;
    const k = Math.min(1, t / 2.5), e = 1 - Math.pow(1 - k, 3); // entrada suave desde una vista más cercana y rotada
    const yaw = (0.45 * (1 - e) + 0.1 * Math.sin(t * 0.22)), zoom = 1.12 - 0.12 * e + 0.02 * Math.sin(t * 0.17);
    introDir.copy(hp.dir).applyAxisAngle(Y, yaw);
    introOff.copy(introDir).multiplyScalar(hp.dist * zoom);
    rig.controls.target.set(...DEFAULT_TARGET);
    camera.position.copy(rig.controls.target).add(introOff);
    camera.lookAt(rig.controls.target);
  }
  dom.addEventListener('pointerdown', () => { if (intro) setIntro(false); });

  // ---- bucle de render bajo demanda ----
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (document.hidden || disposed) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const pnow = performance.now();
    if (intro && !view) stepIntro(pnow);
    let active = rig.update(dt, pnow);
    if (stepInsets(dt)) active = true;
    if (packets.update(pnow)) active = true;
    let amb = false; // animaciones ambientales (brillo de cables, hazards, flechas): alcanza con 30 fps
    if (wires.update(pnow)) amb = true;
    if (effects.update(pnow)) amb = true;
    if (ambientFx.update(pnow, view)) amb = true;
    if (intro && !view) amb = true;
    if (view) {
      if (interior.update(pnow)) active = true;
      if (interior.ambient) amb = true;
      if (pointerPos && !down && !transitioning) {
        setRay(pointerPos); const h = interior.pick(ray); pointerPos = null;
        if (interior.setHover(h && h.type, h && h.id)) { refreshCursor(); if (iHoverCb) iHoverCb(h ? { type: h.type, id: h.id, schema: view } : null); invalidate(); }
      }
    } else if (pointerPos && !down) {
      const h = pick(pointerPos); pointerPos = null;
      setHover(h && h.block ? h.block : null); setLedHover(h && h.led ? h.led : null);
    }
    if (dirty || active || (amb && pnow - lastAmb >= 32)) {
      dirty = false; lastAmb = pnow;
      if (shadowDirty) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
      if (view) {
        renderer.render(interior.scene, camera);
        if (shotImg) shotImg.src = renderer.domElement.toDataURL('image/png');
        interior.labelRenderer.setLod(lodOf());
        interior.labelRenderer.render(interior.scene, camera);
      } else {
        renderer.render(scene, camera);
        if (shotImg) shotImg.src = renderer.domElement.toDataURL('image/png');
        labelRenderer.setLod(lodOf()); fitStrips();
        labelRenderer.render(scene, camera);
      }
      frameCbs.forEach((cb) => cb());
      perfN++; perfCpu += performance.now() - pnow;
    }
    if (perfBox && pnow - perfT > 500) {
      perfStat = { fps: Math.round((perfN * 1000) / (pnow - perfT)), cpu: perfN ? perfCpu / perfN : 0 };
      const i = perfInfo();
      perfBox.textContent = `${view ? 'interior' : 'placa'}  ${i.fps} fps (render)  cpu ${i.cpuMs} ms\ncalls ${i.calls}  tris ${i.triangles}\ngeom ${i.geometries}  tex ${i.textures}  prog ${i.programs}`;
      perfN = 0; perfCpu = 0; perfT = pnow;
    }
  }
  raf = requestAnimationFrame(frame);

  // ---- proyección de anclas a pantalla (para pop-ups) ----
  const tmp = new THREE.Vector3();
  function projectAnchor(id) {
    const b = blocks.blocks.get(id); if (!b) return null;
    b.anchor.getWorldPosition(tmp);
    tmp.project(camera);
    const w = container.clientWidth, h = container.clientHeight;
    return { x: (tmp.x * 0.5 + 0.5) * w, y: (-tmp.y * 0.5 + 0.5) * h, visible: tmp.z < 1 && tmp.z > -1 };
  }

  const api = {
    highlightBlock(id, color) { blocks.blocks.get(id)?.setHighlight(color); invalidate(); },
    clearHighlights() { blocks.blocks.forEach((b) => b.setHighlight(null)); invalidate(); },
    setBlockValue(id, text) { blocks.blocks.get(id)?.setValue(text); invalidate(); },
    setWire(id, st) { wires.setWire(id, st); invalidate(); },
    clearWires() { wires.clearWires(); invalidate(); },
    sendPacket(wireId, opts) { invalidate(); return packets.send(wireId, opts); },
    clearPackets() { packets.clear(); },
    setLeds(s) { board.setLeds(s); invalidate(); },
    setStageOccupant(stage, o) {
      blocks.setStageOccupant(stage, o);
      const n = performance.now(); if (n - lastClock > 300 && !view) { lastClock = n; effects.clockPulse(); }
      invalidate();
    },
    pulseClock() { effects.clockPulse(); invalidate(); },
    setBlockStatus(id, st) { blocks.blocks.get(id)?.setStatus(st); invalidate(); },
    markHazard(o) { effects.markHazard(o); invalidate(); },
    showResolver(o) { effects.showResolver(o); invalidate(); },
    clearHazards() { effects.clearHazards(); invalidate(); },
    onLedHover(cb) { ledCb = cb; },
    enterView(schema, opts) { return queue(() => doEnter(schema, opts)); },
    exitView(opts) { return queue(() => doExit(opts)); },
    get currentView() { return view; },
    setInteriorLive(ctx) { interior.setLive(ctx); invalidate(); },
    highlightInterior(id) { interior.setHighlight(id); invalidate(); },
    onInteriorClick(cb) { iClickCb = cb; },
    onInteriorHover(cb) { iHoverCb = cb; },
    focusBlock(id, dist) { if (!view) rig.focusBlock(id, dist); },
    setSelectedBlock(id) { blocks.blocks.forEach((b, k) => b.setSelected(k === id)); invalidate(); },
    resetView(immediate = false) { rig.resetView(immediate); },
    // depuración / capturas: acerca la cámara (f < 1) y opcionalmente centra en (x, z)
    zoomTo(f, x, z) {
      const t = rig.controls.target, off = camera.position.clone().sub(t).multiplyScalar(f);
      if (x != null) t.set(x, 0, z);
      camera.position.copy(t).add(off); rig.controls.update(); invalidate();
    },
    setViewInsets, setIntro,
    debugInfo() { return { cam: camera.position.toArray().map((v) => +v.toFixed(1)), target: rig.controls.target.toArray().map((v) => +v.toFixed(1)), insets, size: [container.clientWidth, container.clientHeight], view: camera.view && { ...camera.view } }; },
    onBlockClick(cb) { clickCb = cb; },
    onBlockHover(cb) { hoverCb = cb; },
    getAnchor(id) { return blocks.blocks.get(id)?.anchor; },
    projectAnchor,
    onFrame(cb) { frameCbs.add(cb); return () => frameCbs.delete(cb); },
    invalidate,
    perfInfo, perfDetail,
    setTheme,
    dispose() {
      disposed = true; cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener('pointermove', onMove); dom.removeEventListener('pointerdown', onDown);
      dom.removeEventListener('pointerup', onUp); dom.removeEventListener('pointercancel', onUp); dom.removeEventListener('pointerleave', onLeave);
      rig.dispose(); packets.clear(); renderer.dispose();
      renderer.domElement.remove(); labelRenderer.domElement.remove(); interior.labelRenderer.domElement.remove(); fade.remove();
    },
  };
  return api;
}
