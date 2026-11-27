import { DaFeiYuRenderer, type DaFeiYuLayout } from '../../src/dafeiyuRenderer';

const W = 420, H = 440, COLS = 5;
type Sc = { name: string; stopAt: number; setup?: (r: any, t0: number) => void; tick?: (r: any, L: DaFeiYuLayout, t: number, now: number) => void; done?: boolean; frozen?: boolean };
const base = (): DaFeiYuLayout => ({
  logicalW: W, kbCenterX: 234, kbCenterY: 353, kbWidth: 266, kbHeight: 74, kbTiltRad: (3.4 * Math.PI) / 180,
  mouseBtnX: 72, mouseBtnY: 312, cursor: null, mouseNX: 0.5, mouseLeft: false, mouseRight: false,
  mouseActiveAt: -10000, mouseClickAt: -10000, petEnergy: 0, privacyMode: false, privacyTypingAt: -10000, is108: false,
});
const noGreet = (r: any) => { r.greeted = true; };
const scs: Sc[] = [
  { name: '1 idle', stopAt: 1200, setup: noGreet },
  { name: '2 greeting wave (startup / double-click)', stopAt: 1750 },
  { name: '3 agent waiting', stopAt: 1500, setup: (r) => { noGreet(r); r.setWaiting(performance.now() + 60000); } },
  { name: '4 agent done: cheer + confetti', stopAt: 900, setup: noGreet,
    tick: (r, L, t, now) => { if (t > 300 && !r._c) { r._c = 1; r.celebrate(now); } L.petEnergy = t > 300 ? 0.8 : 0; } },
  { name: '5 dragged', stopAt: 1300, setup: noGreet, tick: (r, L, t) => { L.dragging = t > 300; L.dragVelX = t > 300 ? 2.2 : 0; L.mouseLeft = t > 300; } },
  { name: '6 tail poke', stopAt: 1150, setup: noGreet,
    tick: (r, L, t, now) => { if (t > 900 && !r._p) { r._p = 1; const g = r.computeGeom(now, L); const root = g.spritePointToWorld(0.56, 0.785);
      L.cursor = { x: root.x + r.tail.relX, y: root.y + r.tail.relY }; r.onPointerDown(now, L); } } },
  { name: '7 nodding off (pre-sleep)', stopAt: 99999, setup: noGreet,
    tick: (r, L, t, now) => { L.drowsy = 1; if (r.drowsyClosed) { r._d = r._d || now; if (now - r._d > 1100) (r as any)._stop = true; } else r._d = 0; } },
  { name: '8 wake-up stretch', stopAt: 1150, setup: noGreet, tick: (r, L, t) => { L.asleep = t < 400; } },
  { name: '9 Ctrl+S thumbs-up', stopAt: 1400, setup: noGreet,
    tick: (r, L, t) => { if (t > 800 && !r._k) { r._k = 1; r.onKeyDown(0xa2, { x: 120, y: 372 }, L, false, false); r.onKeyDown(0x53, { x: 170, y: 352 }, L, false, false); r.onKeyUp(0x53); r.onKeyUp(0xa2); } } },
  // Realistic: the cursor glides in (she leans toward the desk mouse), stops on her face as drawn, then rests
  { name: '10 stared at (cursor resting on face)', stopAt: 4400, setup: noGreet,
    tick: (r, L, t, now) => { if (t < 1000) { const f = r.computeGeom(now, L).spritePointToWorld(0.5, 0.5); const k = t / 1000;
      L.cursor = { x: 380 + (f.x + 6 - 380) * k, y: 120 + (f.y + 4 - 120) * k }; L.mouseActiveAt = now; } r._cur = L.cursor; } },
  { name: '11 agent working (curious) - regression', stopAt: 1200, setup: (r) => { noGreet(r); r.setCurious(performance.now() + 60000); } },
  { name: '12 asleep - regression', stopAt: 1500, setup: noGreet, tick: (r, L) => { L.asleep = true; } },
  { name: '13 movie mode + snack - regression', stopAt: 3200, setup: noGreet, tick: (r, L) => { L.watching = true; } },
  { name: '14 movie mode disturbed - regression', stopAt: 1500, setup: noGreet,
    tick: (r, L, t, now) => { L.watching = true; if (t > 900 && !r._a) { r._a = 1; r.disturb(0.4, now); r.disturb(0.4, now); } } },
  { name: '15 typing - regression', stopAt: 1300, setup: noGreet,
    tick: (r, L, t) => { const n = Math.floor(t / 110); if (n !== r._n) { r._n = n; const right = n % 2; r.onKeyDown(0x41 + (n % 20), { x: right ? 280 : 170, y: 350 }, L, false, false); r.onKeyUp(0x41 + (n % 20)); } } },
];
const ROWS = Math.ceil(scs.length / COLS);
const cv = document.getElementById('c') as HTMLCanvasElement;
cv.width = W * COLS; cv.height = H * ROWS;
const ctx = cv.getContext('2d')!;
// Deterministic fake clock so every scenario is simulated frame by frame, independent of real time
let fake = 100000;
performance.now = () => fake;
function drawScene(i: number, r: any, L: DaFeiYuLayout, dt: number, now: number, name: string) {
  const ox = (i % COLS) * W, oy = Math.floor(i / COLS) * H;
  ctx.save(); ctx.beginPath(); ctx.rect(ox, oy, W, H); ctx.clip(); ctx.translate(ox, oy);
  ctx.fillStyle = i % 2 ? '#464254' : '#3f3b4c'; ctx.fillRect(0, 0, W, H);
  r.renderBody(ctx, now, L, 0);
  ctx.save(); ctx.translate(L.kbCenterX, L.kbCenterY); ctx.rotate(L.kbTiltRad);
  ctx.fillStyle = '#26242c'; ctx.beginPath(); (ctx as any).roundRect(-L.kbWidth / 2, -L.kbHeight / 2, L.kbWidth, L.kbHeight, 9); ctx.fill();
  ctx.fillStyle = '#efe9dd';
  for (let ry = 0; ry < 4; ry++) for (let cx = 0; cx < 13; cx++) { ctx.beginPath(); (ctx as any).roundRect(-L.kbWidth / 2 + 8 + cx * 19.4, -L.kbHeight / 2 + 7 + ry * 16, 16.4, 12.5, 3); ctx.fill(); }
  ctx.restore();
  r.renderForeground(ctx, dt, now, L);
  if (r._cur) { ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.beginPath(); ctx.moveTo(r._cur.x, r._cur.y); ctx.lineTo(r._cur.x + 9, r._cur.y + 12); ctx.lineTo(r._cur.x + 2, r._cur.y + 12); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = '600 15px sans-serif'; ctx.fillText(name, 10, 22);
  ctx.restore();
}
async function main() {
  // Preload every sprite and prop first
  const warm = new DaFeiYuRenderer() as any;
  const imgs: HTMLImageElement[] = [...Object.values(warm.ensureSprites()), ...Object.values(warm.ensureProps())] as any;
  await Promise.all(imgs.map((im) => im.decode().catch(() => undefined)));
  const scratch = document.createElement('canvas').getContext('2d')!;
  scs.forEach((s, i) => {
    fake = 100000 + i * 50000;
    const t0 = fake; const r = new DaFeiYuRenderer() as any; const L = base();
    // Blink timing is random per instance; pin it so snapshots are comparable
    r.nextBlinkAt = t0 + 60000;
    r.ensureSprites(); r.ensureProps();
    s.setup?.(r, t0);
    const dt = 1 / 60;
    for (let k = 0; k < 900; k++) {
      fake = t0 + k * (1000 / 60); const t = fake - t0;
      s.tick?.(r, L, t, fake);
      r.update(dt, fake, L);
      // hands and particles advance inside renderForeground, so render every simulated frame off-screen
      r.renderForeground(scratch, dt, fake, L);
      if (t >= s.stopAt || r._stop) break;
    }
    drawScene(i, r, L, 0, fake, s.name);
  });
  document.title = 'done';
}
main();
