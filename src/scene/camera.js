import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DEFAULT_TARGET, BOARD } from './layout.js';

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']);

function typing(e) {
  const t = e.target;
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}

// OrbitControls + teclado (WASD mueve, Q/E rota) + tweens de foco.
export function createCameraRig(camera, domElement, { getBlockPos, invalidate, getHome }) {
  const controls = new OrbitControls(camera, domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 8;
  controls.maxDistance = 320;
  controls.zoomSpeed = 0.9;
  // arrastrar con clic izq. = mover (panear sobre el plano de la placa), clic der. = rotar, rueda = zoom
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.screenSpacePanning = false;
  controls.panSpeed = 1.1;
  controls.target.set(...DEFAULT_TARGET);
  controls.addEventListener('change', invalidate);
  domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  // espacio actual (placa o interior): objetivo por defecto, límites de paneo y proveedor de vista inicial
  let space = { target: new THREE.Vector3(...DEFAULT_TARGET), bounds: { cx: BOARD.cx, cz: BOARD.cz, hx: BOARD.w / 2 + 10, hz: BOARD.d / 2 + 10 }, getHome, minFit: 40 };
  function setSpace(s) { space = { ...space, ...s }; }
  // limita el objetivo a los límites y desplaza la cámara el mismo delta (no pelea con el damping)
  const dl = new THREE.Vector3();
  function clampTarget() {
    const b = space.bounds, t = controls.target;
    const nx = THREE.MathUtils.clamp(t.x, b.cx - b.hx, b.cx + b.hx), nz = THREE.MathUtils.clamp(t.z, b.cz - b.hz, b.cz + b.hz);
    if (nx === t.x && nz === t.z) return false;
    dl.set(nx - t.x, 0, nz - t.z);
    t.add(dl); camera.position.add(dl);
    return true;
  }

  const keys = new Set();
  const down = (e) => { if (KEYS.has(e.code) && !typing(e) && !e.ctrlKey && !e.metaKey && !e.altKey) { keys.add(e.code); invalidate(); e.preventDefault(); } };
  const up = (e) => { keys.delete(e.code); };
  const blur = () => keys.clear();
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  window.addEventListener('blur', blur);

  let tween = null;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3(), off = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let aspect = 1.6, fitDist = 64;

  function defaultPose() {
    const t = space.target.clone();
    const gh = space.getHome;
    const home = gh ? gh() : { dir: new THREE.Vector3(0, 0.79, 0.61), dist: fitDist };
    return { target: t, pos: t.clone().addScaledVector(home.dir, home.dist) };
  }
  // devuelve una Promise que se resuelve al terminar (o al cancelarse) el tween
  function tweenTo(target, pos, ms = 750, easeFn) {
    if (tween && tween.resolve) tween.resolve();
    const p = new Promise((resolve) => {
      tween = { t0: performance.now(), ms, t1: controls.target.clone(), p1: camera.position.clone(), t2: target, p2: pos, ease: easeFn, resolve };
    });
    invalidate();
    return p;
  }
  function cancelTween() { if (tween) { if (tween.resolve) tween.resolve(); tween = null; } }
  function setAspect(a) { aspect = a; }
  // Cambia la distancia de encuadre; con `rescale` conserva el ángulo/zoom relativo del usuario.
  function setFitDistance(d, rescale = false) {
    const nd = THREE.MathUtils.clamp(d, space.minFit, 320);
    if (rescale && fitDist > 0 && Math.abs(nd - fitDist) > 1e-3) {
      const k = nd / fitDist;
      off.copy(camera.position).sub(controls.target).multiplyScalar(k);
      camera.position.copy(controls.target).add(off);
      if (tween) { off.copy(tween.p2).sub(tween.t2).multiplyScalar(k); tween.p2.copy(tween.t2).add(off); }
    }
    fitDist = nd;
  }
  function resetView(immediate) {
    const { target, pos } = defaultPose();
    if (immediate) { cancelTween(); controls.target.copy(target); camera.position.copy(pos); controls.update(); invalidate(); }
    else return tweenTo(target, pos);
  }
  // Distancia moderada: acerca el bloque pero deja a la vista a sus vecinos.
  function focusBlock(id, dist) {
    const p = getBlockPos(id); if (!p) return;
    if (dist == null) dist = THREE.MathUtils.clamp(fitDist * 0.68, 38, 100);
    const target = new THREE.Vector3(p.x, 0.5, p.z);
    const dir = camera.position.clone().sub(controls.target);
    if (dir.y < dir.length() * 0.35) dir.y = dir.length() * 0.55; // evita ángulos rasantes
    dir.normalize();
    tweenTo(target, target.clone().addScaledVector(dir, dist), 900);
  }

  // devuelve true si hay que seguir renderizando
  function update(dt, nowMs) {
    let active = false;
    if (tween) {
      const t = Math.min(1, (nowMs - tween.t0) / tween.ms), e = (tween.ease || ease)(t);
      controls.target.lerpVectors(tween.t1, tween.t2, e);
      camera.position.lerpVectors(tween.p1, tween.p2, e);
      if (t >= 1) { const r = tween.resolve; tween = null; if (r) r(); }
      active = true;
    }
    if (keys.size) {
      active = true;
      cancelTween();
      off.copy(camera.position).sub(controls.target);
      const dist = off.length();
      fwd.copy(controls.target).sub(camera.position).setY(0);
      if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
      fwd.normalize();
      right.crossVectors(fwd, UP).normalize();
      const sp = Math.max(8, dist * 0.7) * dt;
      const mv = new THREE.Vector3();
      if (keys.has('KeyW')) mv.addScaledVector(fwd, sp);
      if (keys.has('KeyS')) mv.addScaledVector(fwd, -sp);
      if (keys.has('KeyD')) mv.addScaledVector(right, sp);
      if (keys.has('KeyA')) mv.addScaledVector(right, -sp);
      controls.target.add(mv); camera.position.add(mv);
      clampTarget();
      let rot = 0;
      if (keys.has('KeyQ')) rot += 1.4 * dt;
      if (keys.has('KeyE')) rot -= 1.4 * dt;
      if (rot) { off.copy(camera.position).sub(controls.target).applyAxisAngle(UP, rot); camera.position.copy(controls.target).add(off); }
    }
    const changed = controls.update();
    if (!tween && clampTarget()) { camera.lookAt(controls.target); active = true; }
    return active || changed;
  }

  function dispose() {
    window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
    controls.dispose();
  }
  return { controls, update, focusBlock, resetView, setAspect, setFitDistance, getFitDistance: () => fitDist, dispose, cancelTween, tweenTo, setSpace, isTweening: () => !!tween };
}
