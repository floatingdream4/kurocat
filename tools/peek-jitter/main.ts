// Edge-peek jitter check: drives the real engine in peek mode with typing / mouse input and logs
// head-position jitter (hfX/hfY = mean |second difference| per frame). Build with
// `npx vite build --config tools/peek-jitter/vite.config.ts`, serve dist/, open in a 420x440 headless page
// and read window.__done.
import { KuroCatEngine as CatEngine } from '../../src/catEngine';
let fake = 100000;
performance.now = () => fake;
const cv = document.getElementById('c') as HTMLCanvasElement;
async function run(name: string, edge: 'left'|'right', drive: (e: any, t: number, k: number) => void, frames = 600, dtMs: any = 1000/60) {
  const e = new CatEngine(cv) as any;
  e.setCatAppearance('dafeiyu');
  e.resize();
  e.dafeiyu.greeted = true;
  e.setPeekEdge(edge);
  // settle
  for (let k = 0; k < 240; k++) { fake += 16.7; e.update(0.0167, fake); }
  const xs: number[] = [], ys: number[] = [], rs: number[] = [];
  const t0 = fake; let swaps = 0; let prevImg = '';
  for (let k = 0; k < frames; k++) {
    const dd = typeof dtMs === 'function' ? (dtMs as any)(k) : dtMs; fake += dd; drive(e, fake - t0, k); e.update(dd/1000, fake);
    lastImg = ''; e.render();
    if (lastImg !== prevImg) { swaps++; prevImg = lastImg; }
    const L = e.buildDaFeiYuLayout();
    const d = e.dafeiyu; const g = d.computeGeom(fake, L);
    const p = g.spritePointToWorld(0.5, 0.35);
    const { tx, ty, rot, pivotX, pivotY } = e.peekTransform;
    const dx = p.x - pivotX, dy = p.y - pivotY;
    xs.push(pivotX + tx + dx*Math.cos(rot) - dy*Math.sin(rot));
    ys.push(pivotY + ty + dx*Math.sin(rot) + dy*Math.cos(rot));
    rs.push(rot + d.bodyTilt + d.dragSwing);
  }
  // high-frequency jitter: mean |second difference| (px/frame^2) and range
  const hf = (a: number[]) => { let s = 0; for (let i = 2; i < a.length; i++) s += Math.abs(a[i] - 2*a[i-1] + a[i-2]); return (s/(a.length-2)).toFixed(3); };
  const rng = (a: number[]) => (Math.max(...a) - Math.min(...a)).toFixed(2);
  const line = `${name}: hfX=${hf(xs)} hfY=${hf(ys)} rangeX=${rng(xs)} rangeY=${rng(ys)} rangeRot=${rng(rs)} peekAmt=${e.peekAmount.toFixed(3)} hover=${e.peekHover.toFixed(2)} exprSwaps=${swaps}`;
  console.log(line); out.push(line); traces[name] = xs.map((x, i) => Math.hypot(x - xs[0], ys[i] - ys[0]));
}
const out: string[] = []; const traces: Record<string, number[]> = {};
let lastImg = '';
const od = CanvasRenderingContext2D.prototype.drawImage;
(CanvasRenderingContext2D.prototype as any).drawImage = function (img: any, ...a: any[]) { if (img && img.src && /notail_/.test(img.src) && !lastImg) lastImg = img.src.split('/').pop(); return (od as any).call(this, img, ...a); };
(async () => {
  for (const edge of ['right','left'] as const) {
  await run(`${edge} idle`, edge, () => {});
  await run(`${edge} agent working`, edge, (e, t, k) => { if (k === 0) e.setAgentCurious(true); });
  await run(`${edge} user typing`, edge, (e, t, k) => { if (k % 6 === 0) e.onKeyDown(0x41 + (k/6)%20, false); if (k % 6 === 3) e.onKeyUp(0x41 + ((k-3)/6)%20); });
  await run(`${edge} mouse move (global)`, edge, (e, t, k) => { e.onGlobalMouseMove(0.5 + 0.3*Math.sin(k/20), 0.5 + 0.2*Math.cos(k/27)); });
  await run(`${edge} mouse click`, edge, (e, t, k) => { if (k % 30 === 0) e.onMouseDown('left'); if (k % 30 === 5) e.onMouseUp('left'); });
  await run(`${edge} cursor sweeping in window`, edge, (e, t, k) => { const x = edge==='right' ? 0.75 + 0.25*Math.sin(k/15) : 0.25 + 0.25*Math.sin(k/15); e.onWindowCursor(x, 0.5 + 0.1*Math.cos(k/11), false); });
  await run(`${edge} working + mouse move`, edge, (e, t, k) => { if (k === 0) e.setAgentCurious(true); e.onGlobalMouseMove(0.5 + 0.3*Math.sin(k/20), 0.5 + 0.2*Math.cos(k/27)); });
  }
  await run('right cursor slow over head', 'right', (e, t, k) => { e.onWindowCursor(0.70 + 0.3*(k/600), 0.40 + 0.05*Math.sin(k/9), false); });
  await run('right cursor jiggle near head', 'right', (e, t, k) => { e.onWindowCursor(0.80 + 0.02*Math.sin(k/2), 0.45 + 0.02*Math.cos(k/3), false); });
  await run('right wheel', 'right', (e, t, k) => { if (k % 4 === 0) e.onMouseWheel(); });
  await run('right idle 66ms', 'right', () => {}, 200, 66);
  await run('right typing 66ms', 'right', (e, t, k) => { if (k % 2 === 0) e.onKeyDown(0x41 + (k/2)%20, false); else e.onKeyUp(0x41 + ((k-1)/2)%20); }, 200, 66);
  await run('right mixed dt idle', 'right', () => {}, 400, (k: number) => (k % 7 < 3 ? 16.7 : 44));
  await run('right mixed dt + mouse', 'right', (e, t, k) => { e.onGlobalMouseMove(0.5 + 0.3*Math.sin(k/20), 0.5 + 0.2*Math.cos(k/27)); }, 400, (k: number) => (k % 7 < 3 ? 16.7 : 44));
  await run('right typing no-bob', 'right', (e, t, k) => { e.dafeiyu.bodyBob = 0; if (k % 6 === 0) e.onKeyDown(0x41 + (k/6)%20, false); if (k % 6 === 3) e.onKeyUp(0x41 + ((k-3)/6)%20); e.dafeiyu.bodyBob = 0; });
  (window as any).__traces = traces; (window as any).__done = out;
})();
