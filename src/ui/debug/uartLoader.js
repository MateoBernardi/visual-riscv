// uartLoader.js - "Cargar como en el hardware": manda un programa a la IMEM por el protocolo L de la debug unit,
// con la animación de la carga (PC → UART → FIFO → FSM → IMEM) y, opcionalmente, el panel explicativo.
//
// API
//   loadProgramViaUart({ scene, debugUnit, pipeline, words, explain, panel, mode, onProgress, onLine, listing, onDone })
//     -> Promise<{ ok, pipeline, debugUnit, trace, reply }>
//   - scene        la escena 3D (createScene). Se usan sendPacket, setBlockStatus, highlightBlock y setLeds.
//   - debugUnit    DebugUnit ya creado, o bien
//   - pipeline     Pipeline: se le crea un DebugUnit (si vienen los dos, vale debugUnit).
//   - words        Uint32Array | number[]  (salida de assemble().words)
//   - explain      true (default): anima los primeros bytes con calma y el resto en avance rápido;
//                  false: carga sin animación (igual escribe la IMEM por el protocolo L real).
//   - mode         'animada' (default) | 'todo' | 'manual' | 'instantanea'   (ignorado si explain=false)
//   - panel        opcional: un panel de createExplainPanel() para mostrar "Qué pasa". Sin panel solo hay animación 3D.
//   - onProgress   (bytesEnviados, bytesTotales, rapido:boolean) => void
//   - onLine       (índiceDePalabra|null) => void   palabra de la IMEM que se está escribiendo (para resaltar el editor)
//   - listing      assemble().listing (opcional; con onLine permite mapear palabra → línea)
//   - onDone       () => void   al terminar de reproducir
//   Devuelve el Pipeline cargado y en reset (PC=0, igual que tras un L real) listo para pasarle al simulador:
//     const { pipeline } = await loadProgramViaUart({ scene, pipeline: pipe, words: program.words });
//   skipUartLoad() salta la animación en curso y deja el resultado final.
import { DebugUnit, encodeLoad } from '../../sim/debugUnit.js';
import { runTrace } from './trace.js';
import { createPlayer } from './player.js';

const COLORS = { teal: '#1aa3a1', red: '#e5533d', grey: '#8a93a0', orange: '#f0a53a', purple: '#9b6ad6', blue: '#4a7bd0' };
const noopPanel = { set() {}, flush() {}, reset() {} };
let activePlayer = null;

export function skipUartLoad() { if (activePlayer) activePlayer.skip(); }

export async function loadProgramViaUart({ scene, debugUnit, pipeline, words, explain = true, panel = null, mode = 'animada', onProgress, onLine, listing, onDone } = {}) {
  if (!debugUnit && !pipeline) throw new Error('loadProgramViaUart: falta debugUnit o pipeline');
  const dbg = debugUnit || new DebugUnit(pipeline);
  const pipe = dbg.pipe;
  const frame = encodeLoad(words);
  const trace = runTrace(dbg, frame);
  const reply = trace.tx[0];
  const ok = reply === 0x4b;
  if (explain && scene) {
    const player = createPlayer({ scene, panel: panel || noopPanel, getMode: () => mode, colors: COLORS });
    activePlayer = player;
    await player.play(trace, {
      cmd: { key: 'L', title: 'Cargar programa' },
      listing,
      onProgress,
      onLine: onLine ? (i) => onLine(i) : undefined,
      finalize: () => { scene.setLeds && scene.setLeds(dbg.leds); },
    });
    activePlayer = null;
  } else if (onProgress) onProgress(frame.length, frame.length, false);
  if (onDone) onDone();
  return { ok, pipeline: pipe, debugUnit: dbg, trace, reply };
}
export { COLORS as UART_COLORS };
