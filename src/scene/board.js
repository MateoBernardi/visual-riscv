import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOARD, BASE_Y, STAGES, STAGE_COLORS, STAGE_RANGE, STRIP_Z, BLOCKS } from './layout.js';
import { textPlane } from './textures.js';

// materiales compartidos por (color, opciones): así la decoración estática se puede fusionar por material
const MATS = new Map();
const std = (color, o = {}) => {
  const k = color + JSON.stringify(o);
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color, roughness: 0.65, metalness: 0.05, ...o }); MATS.set(k, m); }
  return m;
};
const RB = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, r < 0.13 ? 1 : 2, r);
// fusiona las mallas estáticas del grupo que comparten material y sombras (una draw call por material)
function mergeStatics(group) {
  const buckets = new Map();
  for (const m of [...group.children]) {
    if (!m.isMesh || m.userData.keep || m.isInstancedMesh || !m.geometry.index) continue;
    const k = m.material.uuid + (m.castShadow ? 'c' : '') + (m.receiveShadow ? 'r' : '');
    (buckets.get(k) || buckets.set(k, []).get(k)).push(m);
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    const geos = list.map((m) => { m.updateMatrix(); const g = m.geometry.clone(); g.applyMatrix4(m.matrix); return g; });
    const merged = mergeGeometries(geos);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, list[0].material);
    mesh.castShadow = list[0].castShadow; mesh.receiveShadow = list[0].receiveShadow;
    group.add(mesh);
    list.forEach((m) => { group.remove(m); m.geometry.dispose(); });
  }
}

// Placa tipo Nexys4 DDR estilizada: PCB, chip FPGA, conector USB-UART, LEDs y componentes decorativos.
export function createBoard() {
  const group = new THREE.Group();
  group.name = 'board';

  // PCB
  const pcb = new THREE.Mesh(RB(BOARD.w, 0.6, BOARD.d, 0.25), std('#0f5f55', { roughness: 0.5 }));
  pcb.position.set(BOARD.cx, -0.3, BOARD.cz);
  pcb.receiveShadow = true; pcb.castShadow = true;
  group.add(pcb);

  // Trazas decorativas (serigrafía de cobre)
  const trace = std('#1d7a6c', { roughness: 0.4 });
  for (let i = 0; i < 14; i++) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(6 + (i % 4) * 3, 0.02, 0.12), trace);
    t.position.set(-30 + i * 4.4, 0.01, 17 + (i % 5) * 0.6 - 0.5);
    group.add(t);
  }

  // Chip FPGA
  const chip = new THREE.Mesh(RB(62, BASE_Y, 28, 0.2), std('#27323f', { roughness: 0.4, metalness: 0.2 }));
  chip.position.set(-1, BASE_Y / 2, -2);
  chip.receiveShadow = true; chip.castShadow = true;
  group.add(chip);
  const pinMat = std('#c9c2ae', { metalness: 0.7, roughness: 0.3 });
  const pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 0.12, 0.5), pinMat, 2 * 60);
  const m4 = new THREE.Matrix4(); let n = 0;
  for (let i = 0; i < 60; i++) for (const zz of [-16.3, 12.3]) {
    m4.makeTranslation(-31 + i * 1.03, 0.1, zz); pins.setMatrixAt(n++, m4);
  }
  group.add(pins);
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), std('#e8f3ea'));
  dot.rotation.x = -Math.PI / 2; dot.position.set(-30, BASE_Y + 0.01, 11.2);
  group.add(dot);
  const chipLabel = textPlane('ARTIX-7 · XC7A100T · RV32I', 18, 1.6, { color: '#9fb2c4', font: '600 44px "Barlow Semi Condensed", sans-serif', align: 'right' });
  chipLabel.position.set(28, BASE_Y + 0.012, 11.1);
  chipLabel.rotation.z = 0;
  group.add(chipLabel);

  // Franjas por etapa
  for (const s of STAGES) {
    const [x0, x1] = STAGE_RANGE[s];
    const w = x1 - x0, d = STRIP_Z[1] - STRIP_Z[0];
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, d), new THREE.MeshStandardMaterial({ color: STAGE_COLORS[s], transparent: true, opacity: 0.32, roughness: 0.9 }));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set((x0 + x1) / 2, BASE_Y + 0.015, (STRIP_Z[0] + STRIP_Z[1]) / 2);
    strip.receiveShadow = true;
    group.add(strip);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w - 0.2, 0.08, 0.28), new THREE.MeshStandardMaterial({ color: STAGE_COLORS[s], roughness: 0.6 }));
    edge.position.set((x0 + x1) / 2, BASE_Y + 0.04, STRIP_Z[1]);
    group.add(edge);
  }

  // Silkscreen
  const title = textPlane('NEXYS4 DDR · RV32I', 22, 2.2, { color: '#d7efe6', font: '600 60px "Barlow Semi Condensed", sans-serif', align: 'left' });
  title.position.set(14, 0.012, 17.2);
  group.add(title);
  const sub = textPlane('visual·RISCV  ·  pipeline de 5 etapas', 20, 1.2, { color: '#8fc6b8', font: '500 40px "Barlow", sans-serif', align: 'left' });
  sub.position.set(13.5, 0.012, 19.2);
  group.add(sub);

  // Conector USB-UART en el borde izquierdo
  const usb = new THREE.Mesh(RB(5, 2, 3.6, 0.2), std('#b9c0c8', { metalness: 0.75, roughness: 0.3 }));
  usb.position.set(BOARD.cx - BOARD.w / 2 + 2.4, 1, 15.5); usb.castShadow = true;
  group.add(usb);
  const usbHole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 2.2), std('#10161c'));
  usbHole.position.set(BOARD.cx - BOARD.w / 2 + 0.0, 1, 15.5);
  group.add(usbHole);
  const usbTxt = textPlane('USB-UART', 7, 1.2, { color: '#d7efe6', font: '600 44px "Barlow Semi Condensed", sans-serif' });
  usbTxt.position.set(BOARD.cx - BOARD.w / 2 + 4.5, 0.012, 18.2);
  group.add(usbTxt);
  const cable = new THREE.Mesh(new THREE.BoxGeometry(BLOCKS.uart.x - (BOARD.cx - BOARD.w / 2 + 4.9) - 2, 0.05, 0.3), std('#d8b46e', { metalness: 0.6, roughness: 0.4 }));
  cable.position.set(((BLOCKS.uart.x - 2) + (BOARD.cx - BOARD.w / 2 + 4.9)) / 2, 0.04, 15.5);
  group.add(cable);

  // Conector Ethernet / jack de alimentación (decorativos)
  const eth = new THREE.Mesh(RB(5, 3, 4.5, 0.2), std('#aeb6bf', { metalness: 0.75, roughness: 0.35 }));
  eth.position.set(BOARD.cx + BOARD.w / 2 - 2.8, 1.5, 12); eth.castShadow = true;
  group.add(eth);
  const jack = new THREE.Mesh(RB(3.2, 2.2, 3.6, 0.2), std('#20262e'));
  jack.position.set(BOARD.cx + BOARD.w / 2 - 2, 1.1, 5); jack.castShadow = true;
  group.add(jack);

  // DDR2 y flash (negros), cristal
  const ddr = new THREE.Mesh(RB(9, 0.5, 5, 0.15), std('#14181d', { roughness: 0.35 }));
  ddr.position.set(22, 0.25, 16.8); ddr.castShadow = true; group.add(ddr);
  const flash = new THREE.Mesh(RB(4, 0.4, 3, 0.12), std('#1a1f26'));
  flash.position.set(31, 0.2, 16.5); group.add(flash);
  const xtal = new THREE.Mesh(RB(2.2, 0.7, 1.2, 0.15), std('#c9ced4', { metalness: 0.8, roughness: 0.3 }));
  xtal.position.set(-33, 0.35, -17); group.add(xtal);

  // Switches y display de 7 segmentos
  const swMat = std('#e6e2d6');
  for (let i = 0; i < 16; i++) {
    const sw = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 1.4), swMat);
    sw.position.set(-31 + i * 1.7, 0.3, -19.2); group.add(sw);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.6), std(i % 3 === 0 ? '#e5533d' : '#3a4350'));
    knob.position.set(-31 + i * 1.7, 0.7, -19.0 + (i % 2) * 0.3); group.add(knob);
  }
  const seg = new THREE.Mesh(RB(13, 0.5, 3, 0.15), std('#0b0f13'));
  seg.position.set(18, 0.25, -19); group.add(seg);
  const segMat = new THREE.MeshStandardMaterial({ color: '#7b1d12', emissive: '#e5533d', emissiveIntensity: 0.6 });
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 1.8), segMat);
    s.position.set(13 + i * 1.45, 0.55, -19); group.add(s);
  }
  // Pmod headers
  const hdr = std('#14181d');
  for (let k = 0; k < 3; k++) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.2), hdr);
    h.position.set(31, 0.45, -8 + k * 3.2); group.add(h);
  }
  // Capacitores y resistencias
  const capMat = std('#d9a441', { roughness: 0.5 }), resMat = std('#3b3126');
  for (let i = 0; i < 26; i++) {
    const x = -33 + (i * 2.53) % 66, z = 18.8 - ((i * 7) % 3) * 0.1;
    if (i % 2) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.7, 12), capMat); c.position.set(x, 0.35, z - 2 - (i % 3)); c.castShadow = true; group.add(c); }
    else { const r = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.25, 0.5), resMat); r.position.set(x, 0.12, z - 2.5); group.add(r); }
  }

  // LEDs HALT / RST / EN
  const ledDefs = { halt: { color: '#e5533d', label: 'HALT', x: -15 }, rst: { color: '#f0a53a', label: 'RST', x: -11.5 }, en: { color: '#2fd18a', label: 'EN', x: -8 } };
  const leds = {}; const ledHits = [];
  for (const [k, d] of Object.entries(ledDefs)) {
    const mat = new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0, roughness: 0.3 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.45, 20), mat);
    body.position.set(d.x, 0.22, 15.5); body.castShadow = true;
    group.add(body);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.85, 24), new THREE.MeshBasicMaterial({ color: '#d7efe6' }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.015, 15.5); group.add(ring);
    const lbl = textPlane(d.label, 3.2, 1, { color: '#d7efe6', font: '600 48px "Barlow Semi Condensed", sans-serif', width: 256, height: 80 });
    lbl.position.set(d.x, 0.012, 17.2); group.add(lbl);
    // halo aditivo en lugar de una PointLight (cada luz extra encarece el shader de TODOS los materiales de la escena)
    const glow = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: d.color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.set(d.x, 0.06, 15.5); glow.visible = false; glow.userData.keep = true; group.add(glow);
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 1.2, 12), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(d.x, 0.4, 15.5); hit.userData.led = k; group.add(hit); ledHits.push(hit);
    leds[k] = { mat, glow, color: d.color, x: d.x };
  }

  function setLeds(s = {}) {
    for (const k of Object.keys(leds)) {
      if (s[k] === undefined) continue;
      leds[k].mat.emissiveIntensity = s[k] ? 2.2 : 0;
      leds[k].mat.color.set(s[k] ? leds[k].color : '#3a2a28');
      leds[k].glow.visible = !!s[k];
    }
  }
  setLeds({ halt: false, rst: false, en: false });
  mergeStatics(group);

  return { group, setLeds, ledHits, ledPos: (k) => (leds[k] ? new THREE.Vector3(leds[k].x, 0.4, 15.5) : null) };
}
