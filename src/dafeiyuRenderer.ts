import idleUrl from './assets/dafeiyu/notail_idle.png';
import blinkUrl from './assets/dafeiyu/notail_blink.png';
import shyUrl from './assets/dafeiyu/notail_shy.png';
import happyUrl from './assets/dafeiyu/notail_happy2.png';
import curiousUrl from './assets/dafeiyu/notail_curious.png';
import sleepUrl from './assets/dafeiyu/notail_sleep.png';
import watchUrl from './assets/dafeiyu/notail_watch.png';
import angryUrl from './assets/dafeiyu/notail_angry.png';
import colaUrl from './assets/dafeiyu/prop_cola.png';
import popcornUrl from './assets/dafeiyu/prop_popcorn.png';
import panicUrl from './assets/dafeiyu/notail_panic.png';
import yawnUrl from './assets/dafeiyu/notail_yawn.png';
import readUrl from './assets/dafeiyu/notail_read.png';
import teaUrl from './assets/dafeiyu/notail_tea.png';
import tsunUrl from './assets/dafeiyu/notail_tsun.png';
import headsetUrl from './assets/dafeiyu/prop_headset.png';
import bookUrl from './assets/dafeiyu/prop_book.png';
import teacupUrl from './assets/dafeiyu/prop_teacup.png';

type DaFeiYuExpr =
  | 'idle'
  | 'blink'
  | 'shy'
  | 'happy'
  | 'curious'
  | 'sleep'
  | 'watch'
  | 'angry'
  | 'panic'
  | 'yawn'
  | 'read'
  | 'tea'
  | 'tsun';
/** Hand-held props, plus the headset overlay (a 224x278 layer drawn on top of any frame). */
type DaFeiYuProp = 'cola' | 'popcorn' | 'book' | 'teacup' | 'headset';

export interface DaFeiYuLayout {
  logicalW: number;
  kbCenterX: number;
  kbCenterY: number;
  kbWidth: number;
  kbHeight: number;
  kbTiltRad: number;
  mouseBtnX: number;
  mouseBtnY: number;
  cursor: { x: number; y: number } | null;
  mouseNX: number;
  mouseLeft: boolean;
  mouseRight: boolean;
  mouseActiveAt: number;
  mouseClickAt: number;
  petEnergy: number;
  privacyMode: boolean;
  privacyTypingAt: number;
  is108: boolean;
  /** True after a long system-wide idle period (or an agent 'sleep' action) until the next input. */
  asleep?: boolean;
  /** True while a fullscreen video / slideshow is in the foreground (3D glasses + snacks mode). */
  watching?: boolean;
  peekAmount?: number;
  /** True while the user is dragging the pet window around. */
  dragging?: boolean;
  /** Horizontal drag velocity (clamped to about +-2.8) while dragging. */
  dragVelX?: number;
  /** 0..1 ramp over the last ~45s before she falls asleep (nodding off). */
  drowsy?: number;
  /** Milliseconds since the last system-wide input (0 while asleep or watching). */
  idleMs?: number;
  /** Local time is late at night (yawns come more often). */
  lateNight?: boolean;
  /** Local afternoon tea window: she holds a teacup and sips from it while you are not typing. */
  teaTime?: boolean;
  /** A game is in the foreground: she wears a headset. */
  gaming?: boolean;
  /** performance.now() of the last real petting stroke over her (not agent/demo happiness). */
  pettingAt?: number;
}

type DaFeiYuAct = 'wave' | 'cheer' | 'thumbs' | 'stretch' | 'yawn';

interface ConfettiBit {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  w: number;
  h: number;
  color: string;
}

interface HandState {
  x: number;
  y: number;
  tx: number;
  ty: number;
  lastAt: number;
  squash: number;
  heldVks: Set<number>;
}

interface WaterRipple {
  x: number;
  y: number;
  r: number;
  life: number;
}

interface FloatingParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  kind: 'heart' | 'drop';
}

/**
 * BigFish (大肥鱼 / 鲸鱼娘) companion renderer for KuroCat.
 * Uses MIT-licensed `PC2005-cloud/dsh-pet` (via `QCYTSN/dsh-dafeiyu`) armless/tailless sprites
 * with Live2D-style eye gaze tracking toward mouse/keyboard, procedural pure-round chibi hands,
 * plump flared maid sleeves, animated ocean-blue whale tail slapping right-edge keys,
 * calm hysteresis-locked typing-speed cheek blush, 3-limb simultaneous mouse+keyboard+tail
 * support, and adorable hands-covering-eyes password privacy mode.
 */
export class DaFeiYuRenderer {
  private sprites: Record<DaFeiYuExpr, HTMLImageElement> | null = null;
  // Agent-companion curious state (sparkly-eyed frame + head tilt + floating '?')
  private curiousSince = -10000;
  // Immersive movie mode: annoyance from being disturbed, and the snack she is currently holding
  private annoy = 0;
  private angryUntil = -10000;
  private wasWatching = false;
  private propKind: DaFeiYuProp | null = null;
  private propUntil = -10000;
  private nextPropAt = 0;
  private props: Record<DaFeiYuProp, HTMLImageElement> | null = null;
  private curiousUntil = -10000;
  private hairBangsCanvas: HTMLCanvasElement | null = null;
  private hairBangsAttempted = false;

  private lastKeyAt = -10000;
  private lastKeyGazeAt = -10000;
  private lastKeyPtX = 214;
  private lastKeyPtY = 353;
  private lastMouseClickAt = -10000;
  private keyTimes: number[] = [];
  private typingHeat = 0;
  private blushLevel = 0;
  private moodTier: 0 | 1 | 2 = 0;
  private moodChangedAt = -10000;
  private nextBlinkAt = performance.now() + 3600 + Math.random() * 2600;
  private blinkUntil = 0;

  // Live2D eye gaze offset in native 224x278 sprite pixel coordinates
  private eyeGazeX = 0;
  private eyeGazeY = 0;

  private bodyShiftX = 0;
  private bodyShiftVel = 0;
  private bodyShiftTarget = 0;
  private bodyTilt = 0;
  private bodyTiltVel = 0;
  private bodyTiltTarget = 0;
  private bodyDiveY = 0;
  private bodyBob = 0;

  private leftHand: HandState = {
    x: 155,
    y: 312,
    tx: 155,
    ty: 312,
    lastAt: -10000,
    squash: 0,
    heldVks: new Set(),
  };
  private rightHand: HandState = {
    x: 235,
    y: 312,
    tx: 235,
    ty: 312,
    lastAt: -10000,
    squash: 0,
    heldVks: new Set(),
  };

  private tail = {
    relX: 84,
    relY: -36,
    activeWag: 0,
    wagPhaseX: 0,
    wagPhaseY: 0,
    slapAt: -10000,
    releaseAt: -10000,
    slapTargetX: 340,
    slapTargetY: 355,
    heldVks: new Set<number>(),
    squash: 0,
    phase: 0,
  };

  private ripples: WaterRipple[] = [];
  private particles: FloatingParticle[] = [];

  // --- Extra interactions (all code-driven, reusing the existing frames) ---
  // Agent is waiting for the user: raised waving hand + '!' mark
  private waitingSince = -10000;
  private waitingUntil = -10000;
  // Short one-shot gestures: greeting wave, done cheer, Ctrl+S thumbs-up, wake-up stretch
  private act: { kind: DaFeiYuAct; t0: number; dur: number } | null = null;
  private firstUpdateAt = -1;
  private greeted = false;
  private wasAsleep = false;
  private ctrlDownAt = -10000;
  private lastBodyClickAt = -10000;
  // Tail poke: flinch + startled glance at the tail
  private tailFlinchAt = -10000;
  private startleUntil = -10000;
  private glance: { x: number; y: number; until: number } | null = null;
  // Cursor resting on her face makes her shy
  private hoverSince = -1;
  private hoverX = 0;
  private hoverY = 0;
  private stareShy = false;
  // Being dragged: pendulum sway, slight lift, landing squash
  private dragSwing = 0;
  private dragSwingVel = 0;
  private dragLift = 0;
  private wasDragging = false;
  // Nodding off shortly before sleep
  private drowsyClosed = false;
  // Agent error: flustered panic face, hands on cheeks, sweat drops
  private panicSince = -10000;
  private panicUntil = -10000;
  // Idle pastimes: random yawns, reading a book, afternoon tea
  private nextIdleRollAt = 0;
  private nextYawnOkAt = 0;
  private reading = false;
  private readingSince = -10000;
  private nextReadOkAt = 0;
  private holdingTea = false;
  private teaSince = -10000;
  // Tsundere petting: looks away and pouts first, only warms up if you keep petting
  private lastPetAt = -10000;
  private tsunUntil = -10000;
  private confetti: ConfettiBit[] = [];
  private lastCenterX = 192;

  constructor() {
    // Sprites are lazy-loaded on first render so default cat skins never decode 4 PNGs into RAM.
  }

  private ensureSprites(): Record<DaFeiYuExpr, HTMLImageElement> {
    if (!this.sprites) {
      const mk = (src: string) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        return img;
      };
      this.sprites = {
        idle: mk(idleUrl),
        blink: mk(blinkUrl),
        shy: mk(shyUrl),
        happy: mk(happyUrl),
        curious: mk(curiousUrl),
        sleep: mk(sleepUrl),
        watch: mk(watchUrl),
        angry: mk(angryUrl),
        panic: mk(panicUrl),
        yawn: mk(yawnUrl),
        read: mk(readUrl),
        tea: mk(teaUrl),
        tsun: mk(tsunUrl),
      };
    }
    return this.sprites;
  }

  private ensureProps(): Record<DaFeiYuProp, HTMLImageElement> {
    if (!this.props) {
      const mk = (src: string) => {
        const img = new Image();
        img.decoding = 'async';
        img.src = src;
        return img;
      };
      this.props = {
        cola: mk(colaUrl),
        popcorn: mk(popcornUrl),
        book: mk(bookUrl),
        teacup: mk(teacupUrl),
        headset: mk(headsetUrl),
      };
    }
    return this.props;
  }

  /** Being poked or typed at while she is watching a movie builds annoyance; enough of it makes her angry for a few seconds. */
  public disturb(amount: number, now: number): void {
    this.annoy = Math.min(1, this.annoy + amount);
    if (this.annoy >= 0.62 && now >= this.angryUntil) {
      this.angryUntil = now + 3400;
      this.annoy = 0.25;
      this.bodyBob = Math.min(1.1, this.bodyBob + 0.9);
    }
  }

  public releaseSprites(): void {
    if (this.props) {
      for (const img of Object.values(this.props)) {
        img.src = '';
      }
      this.props = null;
    }
    if (this.sprites) {
      for (const img of Object.values(this.sprites)) {
        img.src = '';
      }
      this.sprites = null;
    }
    if (this.hairBangsCanvas) {
      this.hairBangsCanvas.width = 0;
      this.hairBangsCanvas.height = 0;
      this.hairBangsCanvas = null;
    }
    this.hairBangsAttempted = false;
  }

  public onPrivacyModeChanged(active: boolean): void {
    if (active) {
      this.leftHand.heldVks.clear();
      this.rightHand.heldVks.clear();
      this.tail.heldVks.clear();
      this.ripples.length = 0;
    }
  }

  /** Show the curious expression until `untilMs` (performance.now() clock). */
  public setCurious(untilMs: number): void {
    const now = performance.now();
    if (now >= this.curiousUntil) this.curiousSince = now;
    this.curiousUntil = untilMs;
  }

  public clearCurious(): void {
    this.curiousUntil = -10000;
  }

  /** True while an agent keeps her attentive (curious or waiting), which also keeps her awake. */
  public isCurious(now: number): boolean {
    return now < this.curiousUntil || now < this.waitingUntil;
  }

  /** Agent needs the user: wave a raised hand with a '!' until `untilMs` (performance.now() clock). */
  public setWaiting(untilMs: number): void {
    const now = performance.now();
    if (now >= this.waitingUntil) this.waitingSince = now;
    this.waitingUntil = untilMs;
  }

  public clearWaiting(): void {
    this.waitingUntil = -10000;
  }

  /** Agent hit an error: panic face with hands on her cheeks and sweat drops until `untilMs`. */
  public setPanic(untilMs: number): void {
    const now = performance.now();
    if (now >= this.panicUntil) {
      this.panicSince = now;
      this.bodyBob = Math.min(1.2, this.bodyBob + 0.9);
    }
    this.panicUntil = untilMs;
  }

  public clearPanic(): void {
    this.panicUntil = -10000;
  }

  private startAct(kind: DaFeiYuAct, now: number, dur: number): void {
    this.act = { kind, t0: now, dur };
  }

  /** Agent finished: both arms up and a burst of confetti. */
  public celebrate(now: number): void {
    this.startAct('cheer', now, 2600);
    const colors = ['#ff9a52', '#ffd37a', '#fff4e1', '#f2a25a', '#ff7a6b', '#8fd3a8'];
    for (let i = 0; i < 30; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.1;
      const sp = 150 + Math.random() * 190;
      this.confetti.push({
        x: this.lastCenterX + (Math.random() - 0.5) * 70,
        y: 150 + (Math.random() - 0.5) * 30,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 14,
        life: 1,
        w: 4 + Math.random() * 4,
        h: 2.5 + Math.random() * 3,
        color: colors[i % colors.length],
      });
    }
  }

  /** Left click somewhere in the pet window: poke the tail, or double-click her to get a wave. */
  public onPointerDown(now: number, layout: DaFeiYuLayout): void {
    if (layout.privacyMode || layout.asleep || !layout.cursor) return;
    const g = this.computeGeom(now, layout);
    const c = layout.cursor;
    const tailRoot = g.spritePointToWorld(0.56, 0.785);
    const tipX = tailRoot.x + this.tail.relX;
    const tipY = tailRoot.y + this.tail.relY;
    const midX = tailRoot.x + this.tail.relX * 0.6;
    const midY = tailRoot.y + this.tail.relY * 0.6 - 10;
    const nearTail =
      this.tail.phase < 0.2 &&
      (Math.hypot(c.x - tipX, c.y - tipY) < 30 || Math.hypot(c.x - midX, c.y - midY) < 20);
    if (nearTail) {
      this.tailFlinchAt = now;
      this.startleUntil = now + 750;
      this.glance = { x: tipX, y: tipY, until: now + 1100 };
      this.bodyBob = Math.min(1.1, this.bodyBob + 0.7);
      this.spawnParticles(tipX, tipY - 6, 2, true);
      return;
    }
    const body = g.spritePointToWorld(0.5, 0.55);
    if (Math.abs(c.x - body.x) < g.drawW * 0.36 && Math.abs(c.y - body.y) < g.drawH * 0.42) {
      if (now - this.lastBodyClickAt < 420 && !layout.watching) {
        this.startAct('wave', now, 2000);
        this.lastBodyClickAt = -10000;
      } else {
        this.lastBodyClickAt = now;
      }
    }
  }

  public onPrivacyTyping(): void {
    this.bodyBob = Math.min(0.65, this.bodyBob + 0.42);
  }

  public resetLeftHandForMouse(): void {
    this.leftHand.lastAt = -10000;
  }

  public onMouseAction(now: number = performance.now()): void {
    this.lastMouseClickAt = now;
  }

  public getHandBusyState(now: number): { leftHeld: number; rightHeld: number; rightBusy: boolean } {
    const leftHeld = this.leftHand.heldVks.size;
    const rightHeld = this.rightHand.heldVks.size;
    const rightBusy = rightHeld > 0 || now - this.rightHand.lastAt < 135;
    return { leftHeld, rightHeld, rightBusy };
  }

  public triggerTailPreview(pt: { x: number; y: number }, layout: DaFeiYuLayout): void {
    if (layout.privacyMode || layout.asleep) return;
    const now = performance.now();
    this.lastKeyGazeAt = now;
    this.lastKeyPtX = pt.x;
    this.lastKeyPtY = pt.y;
    this.tail.slapAt = now;
    this.tail.releaseAt = now + 220;
    this.tail.slapTargetX = pt.x;
    this.tail.slapTargetY = pt.y;
    this.tail.squash = 1;
    this.bodyBob = Math.min(1.0, this.bodyBob + 0.55);
    const normX = Math.max(-1, Math.min(1, (pt.x - layout.kbCenterX) / (layout.kbWidth * 0.46)));
    this.bodyTiltTarget = normX * 0.065;
    this.bodyShiftTarget = normX * 8;
    this.ripples.push({ x: pt.x, y: pt.y, r: 6, life: 1 });
    this.ripples.push({ x: pt.x, y: pt.y, r: 2, life: 0.85 });
    this.spawnParticles(pt.x, pt.y - 8, 3, true);
  }

  public onKeyDown(
    vk: number,
    pt: { x: number; y: number },
    layout: DaFeiYuLayout,
    repeat: boolean,
    useTail: boolean,
  ): void {
    if (vk === 0x11 || vk === 0xa2 || vk === 0xa3) this.ctrlDownAt = performance.now();
    // Asleep: she sleeps through typing (only a click on her wakes her up)
    if (layout.privacyMode || repeat || layout.asleep) return;
    const now = performance.now();
    // Ctrl+S: a quick thumbs-up for saving
    if (vk === 0x53 && now - this.ctrlDownAt < 6000 && !layout.asleep && !layout.watching) {
      this.startAct('thumbs', now, 1500);
    }
    this.lastKeyAt = now;
    this.lastKeyGazeAt = now;
    this.lastKeyPtX = pt.x;
    this.lastKeyPtY = pt.y;
    this.keyTimes.push(now);
    this.bodyBob = Math.min(1.1, this.bodyBob + 0.72);

    const charX = layout.is108 ? 268 : 192;
    const normX = Math.max(-1, Math.min(1, (pt.x - layout.kbCenterX) / (layout.kbWidth * 0.46)));
    const mouseBusy = layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900;
    const isLeftSide = pt.x < layout.kbCenterX - 2;

    if (useTail) {
      // Animated ocean-blue whale tail slap onto any configured/smart key!
      this.tail.slapAt = now;
      this.tail.releaseAt = -10000;
      this.tail.heldVks.add(vk);
      this.tail.slapTargetX = pt.x;
      this.tail.slapTargetY = pt.y;
      this.tail.squash = 1;
      if (!mouseBusy) {
        this.bodyTiltTarget = normX >= 0 ? -0.075 : 0.055;
        this.bodyShiftTarget = normX >= 0 ? -7 : 8;
      }
      this.ripples.push({ x: pt.x, y: pt.y, r: 6, life: 1 });
      this.ripples.push({ x: pt.x, y: pt.y, r: 2, life: 0.85 });
      this.spawnParticles(pt.x, pt.y - 8, 3, true);
    } else if (mouseBusy) {
      // Simultaneous mouse + keyboard: left hand stays glued on mouse, right hand taps main keyboard!
      const shiftBase = layout.is108 ? -88 : -38;
      const curCharX = charX + shiftBase;
      const comfortX = Math.max(curCharX - 10, Math.min(curCharX + 92, pt.x));
      const comfortY = Math.min(layout.kbCenterY + 6, pt.y);
      this.rightHand.tx = comfortX;
      this.rightHand.ty = comfortY;
      this.rightHand.lastAt = now;
      this.rightHand.squash = 1;
      this.rightHand.heldVks.add(vk);
    } else {
      // Cozy two-handed typing with gentle micro-sway (±5.5°)
      this.bodyTiltTarget = normX * 0.095;
      this.bodyShiftTarget = normX * (layout.is108 ? 22 : 13);
      const comfortX =
        charX +
        this.bodyShiftTarget +
        Math.max(-76, Math.min(76, (pt.x - charX) * 0.78));
      const comfortY = Math.min(layout.kbCenterY + 10, pt.y);
      if (isLeftSide) {
        this.leftHand.tx = comfortX;
        this.leftHand.ty = comfortY;
        this.leftHand.lastAt = now;
        this.leftHand.squash = 1;
        this.leftHand.heldVks.add(vk);
      } else {
        this.rightHand.tx = comfortX;
        this.rightHand.ty = comfortY;
        this.rightHand.lastAt = now;
        this.rightHand.squash = 1;
        this.rightHand.heldVks.add(vk);
      }
    }
  }

  public onKeyUp(vk: number): void {
    const now = performance.now();
    if (vk === 0x11 || vk === 0xa2 || vk === 0xa3) this.ctrlDownAt = -10000;
    this.leftHand.heldVks.delete(vk);
    this.rightHand.heldVks.delete(vk);
    if (this.tail.heldVks.has(vk)) {
      this.tail.heldVks.delete(vk);
      if (this.tail.heldVks.size === 0) {
        this.tail.releaseAt = now;
      }
    }
  }

  private spawnParticles(x: number, y: number, count: number, onlyDrop: boolean): void {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * (onlyDrop ? 28 : 48),
        y: y + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * (onlyDrop ? 2.2 : 0.8),
        vy: -1.1 - Math.random() * 1.2,
        life: 1,
        kind: onlyDrop ? 'drop' : Math.random() > 0.45 ? 'heart' : 'drop',
      });
    }
  }

  public update(dt: number, now: number, layout: DaFeiYuLayout): void {
    this.bodyBob *= Math.exp(-12 * dt);

    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const isTyping =
      !layout.privacyMode &&
      (now - this.lastKeyAt < 550 ||
        this.tail.heldVks.size > 0 ||
        this.leftHand.heldVks.size > 0 ||
        this.rightHand.heldVks.size > 0);
    const mouseMode =
      !layout.privacyMode &&
      !isHappy &&
      !layout.dragging &&
      !layout.asleep &&
      (layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900);

    // 0) Immersive movie mode: annoyance decay + the snack she is holding
    const watching = !layout.privacyMode && !layout.asleep && Boolean(layout.watching);
    this.annoy = Math.max(0, this.annoy - 0.14 * dt);
    if (watching) {
      // She pulls a snack out 2s after the movie starts and keeps one in hand the whole time,
      // swapping between cola and popcorn roughly every 30s (it is only tucked away while angry).
      if (!this.wasWatching) {
        this.propKind = null;
        this.nextPropAt = now + 2000;
      }
      if (!this.propKind && now >= this.nextPropAt) {
        this.propKind = Math.random() < 0.5 ? 'cola' : 'popcorn';
        this.propUntil = now + 26000 + Math.random() * 8000;
      } else if (this.propKind && now >= this.propUntil) {
        this.propKind = this.propKind === 'cola' ? 'popcorn' : 'cola';
        this.propUntil = now + 26000 + Math.random() * 8000;
      }
    } else {
      this.propKind = null;
      this.angryUntil = -10000;
      this.annoy = 0;
    }
    this.wasWatching = watching;

    // 0b) Extra interactions: greeting, wake-up stretch, drag sway, hover shyness, nodding off
    const quiet = !layout.privacyMode && !layout.asleep && !watching;
    if (this.firstUpdateAt < 0) this.firstUpdateAt = now;
    if (!this.greeted && now - this.firstUpdateAt > 900) {
      this.greeted = true;
      if (quiet) this.startAct('wave', now, 2000);
    }
    if (this.wasAsleep && !layout.asleep && !layout.privacyMode && !watching) {
      this.startAct('stretch', now, 1500);
    }
    this.wasAsleep = Boolean(layout.asleep);
    if (this.act && (now - this.act.t0 > this.act.dur || (!quiet && this.act.kind !== 'cheer'))) {
      this.act = null;
    }

    const dragging = !layout.privacyMode && Boolean(layout.dragging);
    if (dragging && !this.wasDragging) {
      this.dragSwingVel += (Math.random() < 0.5 ? -1 : 1) * 1.5;
      this.act = null;
    } else if (!dragging && this.wasDragging) {
      this.bodyBob = Math.min(1.3, this.bodyBob + 1.1);
    }
    this.wasDragging = dragging;
    const swingTarget = dragging
      ? Math.max(-0.2, Math.min(0.2, -(layout.dragVelX ?? 0) * 0.08))
      : 0;
    const swingAcc = (swingTarget - this.dragSwing) * 58 - this.dragSwingVel * 5.2;
    this.dragSwingVel += swingAcc * dt;
    this.dragSwing += this.dragSwingVel * dt;
    this.dragLift += ((dragging ? 1 : 0) - this.dragLift) * (1 - Math.exp(-10 * dt));

    // A cursor resting on her face for a couple of seconds makes her shy
    let hovering = false;
    if (quiet && !isHappy && !isTyping && !dragging && layout.cursor && !layout.mouseLeft && !layout.mouseRight) {
      const face = this.computeGeom(now, layout).spritePointToWorld(0.5, 0.5);
      // While the mouse moves she leans ~38px toward the desk mouse, so the cursor is aimed at the
      // leaned face; once it stops she straightens up and slides away from it. Enter within 46px,
      // but keep the hover (and its timer) until the cursor is more than 90px from her face.
      const radius = this.hoverSince >= 0 ? 90 : 46;
      hovering = Math.hypot(layout.cursor.x - face.x, layout.cursor.y - face.y) < radius;
    }
    if (hovering && layout.cursor) {
      if (
        this.hoverSince < 0 ||
        Math.hypot(layout.cursor.x - this.hoverX, layout.cursor.y - this.hoverY) > 14
      ) {
        this.hoverSince = now;
        this.hoverX = layout.cursor.x;
        this.hoverY = layout.cursor.y;
      }
      this.stareShy = now - this.hoverSince > 2200;
    } else {
      this.hoverSince = -1;
      this.stareShy = false;
    }

    // Nodding off: slow eyelid droops and a head dip in the last moments before sleep
    const attentive = now < this.curiousUntil || now < this.waitingUntil;
    const drowsy =
      quiet && !isHappy && !isTyping && !dragging && !this.act && !attentive ? (layout.drowsy ?? 0) : 0;
    const wasDrowsyClosed = this.drowsyClosed;
    if (drowsy > 0.02) {
      const nod = (now % 3600) / 3600;
      this.drowsyClosed = nod > 0.3 && nod < 0.86;
      if (wasDrowsyClosed && !this.drowsyClosed) this.bodyBob = Math.min(1.0, this.bodyBob + 0.45);
    } else {
      this.drowsyClosed = false;
    }

    // Agent error: a few sweat drops fly off while she panics
    const panicking = quiet && now < this.panicUntil;
    if (panicking && Math.random() < 3.2 * dt) {
      const head = this.computeGeom(now, layout).spritePointToWorld(Math.random() < 0.5 ? 0.24 : 0.76, 0.36);
      this.spawnParticles(head.x, head.y, 1, true);
    }

    // Tsundere petting: every new petting session starts with ~1.7s of looking away and pouting
    const pettingNow = now - (layout.pettingAt ?? -10000) < 400;
    if (pettingNow) {
      if (now - this.lastPetAt > 4000) this.tsunUntil = now + 1700;
      this.lastPetAt = now;
    }
    const tsun = isHappy && quiet && now < this.tsunUntil && (!this.act || this.act.kind !== 'cheer');

    // Idle pastimes (only while she is left alone): random yawns, reading a book, afternoon tea
    const idleMs = layout.idleMs ?? 0;
    const alone =
      quiet && !isHappy && !isTyping && !dragging && !mouseMode && !attentive && !panicking && !layout.gaming;
    if (this.reading && (!alone || idleMs < 1000 || drowsy > 0.02 || layout.teaTime)) {
      this.reading = false;
      this.nextReadOkAt = now + 60000;
    }
    if (alone && !this.act && now >= this.nextIdleRollAt) {
      this.nextIdleRollAt = now + 1000;
      const beforeDrowsy = idleMs < 250_000;
      if (beforeDrowsy && idleMs > 20_000 && now >= this.nextYawnOkAt && !this.reading) {
        // About once every 3 minutes of idling by day, every 45 seconds late at night
        if (Math.random() < (layout.lateNight ? 1 / 45 : 1 / 180)) {
          this.startAct('yawn', now, 2600);
          this.nextYawnOkAt = now + 40000;
        }
      }
      if (
        !this.act &&
        !this.reading &&
        !layout.teaTime &&
        beforeDrowsy &&
        idleMs > 60_000 &&
        now >= this.nextReadOkAt &&
        Math.random() < 1 / 25
      ) {
        this.reading = true;
        this.readingSince = now;
      }
    }
    const teaNow = Boolean(layout.teaTime) && alone && now - this.lastKeyAt > 2500 && !this.act;
    if (teaNow && !this.holdingTea) this.teaSince = now;
    this.holdingTea = teaNow;

    // 1) Calm 2.8s typing-speed window + hysteresis-locked blush mood (min 2.2s dwell, zero flicker!)
    while (this.keyTimes.length && now - this.keyTimes[0] > 2800) {
      this.keyTimes.shift();
    }
    const typingCPS = this.keyTimes.length / 2.8;
    const heatTarget = layout.privacyMode
      ? 0
      : Math.min(1, Math.max(0, (typingCPS - 2.4) / 5.4));
    if (heatTarget > this.typingHeat) {
      this.typingHeat += (heatTarget - this.typingHeat) * (1 - Math.exp(-2.2 * dt));
    } else {
      this.typingHeat += (heatTarget - this.typingHeat) * (1 - Math.exp(-0.65 * dt));
    }

    const dwell = now - this.moodChangedAt;
    if (this.moodTier === 0) {
      if (this.typingHeat >= 0.40 && dwell >= 1400) {
        this.moodTier = 1;
        this.moodChangedAt = now;
      }
    } else if (this.moodTier === 1) {
      if (this.typingHeat >= 0.78 && dwell >= 1800) {
        this.moodTier = 2;
        this.moodChangedAt = now;
      } else if (this.typingHeat < 0.22 && dwell >= 2200) {
        this.moodTier = 0;
        this.moodChangedAt = now;
      }
    } else if (this.moodTier === 2) {
      if (this.typingHeat < 0.55 && dwell >= 2200) {
        this.moodTier = 1;
        this.moodChangedAt = now;
      }
    }

    const targetBlush = Math.max(
      this.typingHeat * 0.92,
      isHappy ? 0.45 : 0,
      layout.privacyMode ? 0.46 : 0,
      this.moodTier === 1 ? 0.55 : this.moodTier === 2 ? 0.85 : 0,
      this.stareShy ? 0.72 : 0,
    );
    this.blushLevel += (targetBlush - this.blushLevel) * (1 - Math.exp(-3.2 * dt));

    // Natural calm blinking every 4.5 - 7.2s
    if (now >= this.nextBlinkAt) {
      this.blinkUntil = now + 135;
      this.nextBlinkAt = now + 4500 + Math.random() * 2700;
    }

    const charX = layout.is108 ? 268 : 192;
    if (isHappy && !tsun && Math.random() < 0.06) {
      this.spawnParticles(charX + this.bodyShiftX, 120, 1, false);
    } else if (!layout.privacyMode && this.moodTier === 2 && Math.random() < 0.025) {
      this.spawnParticles(charX + this.bodyShiftX, 124, 1, false);
    }

    const peekAmt = Math.max(0, Math.min(1, layout.peekAmount ?? 0));
    const isPeeking = peekAmt > 0.08;

    // 2) Body spring physics
    if (isPeeking) {
      // Keep head cleanly anchored on the peek pivot (no off-center mouse-lean shift or typing dive)
      this.bodyShiftTarget = 0;
      this.bodyTiltTarget = Math.sin(now * 0.0026) * 0.025;
      this.bodyDiveY *= Math.exp(-10 * dt);
    } else if (layout.privacyMode) {
      this.bodyShiftTarget = 0;
      const shySway =
        Math.sin(now * 0.0042) * 0.032 +
        (now - layout.privacyTypingAt < 240 ? Math.sin(now * 0.04) * 0.024 : 0);
      this.bodyTiltTarget = shySway;
      this.bodyDiveY *= Math.exp(-9 * dt);
    } else if (mouseMode) {
      const baseShift = layout.is108 ? -125 : -38;
      this.bodyShiftTarget = baseShift + (layout.mouseNX - 0.5) * 12;
      this.bodyTiltTarget = -0.10;
      this.bodyDiveY += (8 - this.bodyDiveY) * (1 - Math.exp(-10 * dt));
    } else if (!isTyping) {
      this.bodyShiftTarget = 0;
      this.bodyTiltTarget = layout.asleep
        ? 0.055
        : watching && now < this.angryUntil
          ? Math.sin(now * 0.045) * 0.035
          : tsun
            ? -0.085
          : panicking
            ? Math.sin(now * 0.05) * 0.03
          : this.drowsyClosed
            ? 0.06
            : this.stareShy
              ? -0.045
              : !isHappy && !watching && now >= this.waitingUntil && now < this.curiousUntil
                ? 0.07
                : 0;
      if (this.drowsyClosed) {
        this.bodyDiveY += (7 - this.bodyDiveY) * (1 - Math.exp(-2.4 * dt));
      } else if (this.reading) {
        this.bodyDiveY += (4 - this.bodyDiveY) * (1 - Math.exp(-3 * dt));
      } else {
        this.bodyDiveY *= Math.exp(-9 * dt);
      }
    } else {
      this.bodyDiveY *= Math.exp(-9 * dt);
    }

    const shiftAcc = (this.bodyShiftTarget - this.bodyShiftX) * 160 - this.bodyShiftVel * 18;
    this.bodyShiftVel += shiftAcc * dt;
    this.bodyShiftX += this.bodyShiftVel * dt;

    const tiltAcc = (this.bodyTiltTarget - this.bodyTilt) * 180 - this.bodyTiltVel * 17;
    this.bodyTiltVel += tiltAcc * dt;
    this.bodyTilt += this.bodyTiltVel * dt;

    // 2a) Follow the pointer between glances at keys and tail slap targets.
    const lastClickTs = Math.max(this.lastMouseClickAt, layout.mouseClickAt || -10000);
    const activeMouseClick =
      !layout.privacyMode &&
      !isHappy &&
      !isPeeking &&
      (layout.mouseLeft || layout.mouseRight || now - lastClickTs < 950);
    const activeKeyGaze =
      !layout.privacyMode &&
      !isHappy &&
      !isPeeking &&
      (now - this.lastKeyGazeAt < 950 ||
        this.leftHand.heldVks.size > 0 ||
        this.rightHand.heldVks.size > 0 ||
        this.tail.heldVks.size > 0);

    let gazeTarget = !layout.privacyMode && !isHappy ? layout.cursor : null;
    if (activeKeyGaze && (!activeMouseClick || this.lastKeyGazeAt > lastClickTs)) {
      gazeTarget = { x: this.lastKeyPtX, y: this.lastKeyPtY };
    } else if (!gazeTarget && !isPeeking && (activeMouseClick || mouseMode)) {
      gazeTarget = { x: layout.mouseBtnX, y: layout.mouseBtnY };
    }

    if (this.glance) {
      if (now >= this.glance.until) this.glance = null;
      else if (!layout.privacyMode && !isHappy) gazeTarget = this.glance;
    }

    let gazeTx = 0;
    let gazeTy = 0;
    if (gazeTarget) {
      const g = this.computeGeom(now, layout);
      const eyeWorld = g.spritePointToWorld(0.49, 0.495);
      const wdx = gazeTarget.x - eyeWorld.x;
      const wdy = gazeTarget.y - eyeWorld.y;
      const c = Math.cos(-this.bodyTilt - this.dragSwing);
      const s = Math.sin(-this.bodyTilt - this.dragSwing);
      const localDx = wdx * c - wdy * s;
      const localDy = wdx * s + wdy * c;
      gazeTx = Math.max(-4.6, Math.min(4.6, localDx / 21));
      gazeTy = Math.max(-4.3, Math.min(4.3, localDy / 29));
    }

    const gazeRate = gazeTarget ? 24 : 8.5;
    const gazeLerp = 1 - Math.exp(-gazeRate * dt);
    this.eyeGazeX += (gazeTx - this.eyeGazeX) * gazeLerp;
    this.eyeGazeY += (gazeTy - this.eyeGazeY) * gazeLerp;

    // 2b) Whale tail physics (relative to waist anchor so rapid body shifts NEVER detach the tail!)
    const gTail = this.computeGeom(now, layout);
    const tailRoot = gTail.spritePointToWorld(0.56, 0.785);
    const wagSpeed = isHappy
      ? 0.015
      : this.typingHeat > 0.45
        ? 0.014
        : isTyping
          ? 0.0082
          : 0.0042;
    const wagRate = wagSpeed * 1000;
    this.tail.wagPhaseX = (this.tail.wagPhaseX + dt * wagRate) % (Math.PI * 2);
    this.tail.wagPhaseY = (this.tail.wagPhaseY + dt * wagRate * 1.15) % (Math.PI * 2);
    const idleWag = Math.sin(this.tail.wagPhaseX) * (isHappy ? 0.34 : 0.16 + this.typingHeat * 0.16);
    const maxIdleOffX = Math.max(54, Math.min(86, layout.logicalW - 26 - tailRoot.x));
    const idleOffX = maxIdleOffX + Math.sin(this.tail.wagPhaseX) * 9;
    const idleOffY = -36 + Math.cos(this.tail.wagPhaseY) * 7;

    const tailAge = Math.max(0, now - this.tail.slapAt);
    const holdingSlap =
      !layout.privacyMode &&
      (this.tail.heldVks.size > 0 || (this.tail.slapAt > 0 && tailAge < 260));
    let targetPhase = 0;
    if (holdingSlap) {
      targetPhase = Math.min(1, tailAge / 65);
    } else if (!layout.privacyMode && this.tail.slapAt > 0) {
      const holdEnd = Math.max(this.tail.slapAt + 260, this.tail.releaseAt);
      const retElapsed = Math.max(0, now - holdEnd);
      targetPhase = Math.max(0, 1 - retElapsed / 220);
    }
    this.tail.phase += (targetPhase - this.tail.phase) * (1 - Math.exp(-34 * dt));
    if (this.tail.phase < 0.002 && targetPhase === 0) this.tail.phase = 0;

    const slapOffX = this.tail.slapTargetX - tailRoot.x;
    const slapOffY = this.tail.slapTargetY - tailRoot.y;
    // Tail poke: the tail curls in toward her body for a moment and quivers
    const flinch = Math.max(0, 1 - (now - this.tailFlinchAt) / 650);
    const targetRelX = (idleOffX + (slapOffX - idleOffX) * this.tail.phase) * (1 - 0.45 * flinch);
    const targetRelY = idleOffY + (slapOffY - idleOffY) * this.tail.phase + 14 * flinch;
    const tLerp = 1 - Math.exp(-36 * dt);
    this.tail.relX += (targetRelX - this.tail.relX) * tLerp;
    this.tail.relY += (targetRelY - this.tail.relY) * tLerp;
    this.tail.squash *= Math.exp(-11 * dt);
    this.tail.activeWag =
      idleWag * (1 - this.tail.phase) + -0.08 * this.tail.phase + Math.sin(now * 0.055) * 0.5 * flinch;

    // 3) Ripples & particles
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const rp = this.ripples[i];
      rp.r += 58 * dt;
      rp.life -= 2.2 * dt;
      if (rp.life <= 0) this.ripples.splice(i, 1);
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.022 * (dt * 60);
      if (p.life <= 0) this.particles.splice(i, 1);
    }
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const cf = this.confetti[i];
      cf.vy += 300 * dt;
      cf.vx *= Math.exp(-1.4 * dt);
      cf.x += cf.vx * dt;
      cf.y += cf.vy * dt;
      cf.rot += cf.vr * dt;
      cf.life -= dt / 1.9;
      if (cf.life <= 0) this.confetti.splice(i, 1);
    }
    this.lastCenterX = (layout.is108 ? 268 : 192) + this.bodyShiftX;
  }

  private computeGeom(now: number, layout: DaFeiYuLayout) {
    const charX = layout.is108 ? 268 : 192;
    const baseCharY = layout.is108 ? 366 : 364;
    // Slower, deeper breathing while asleep
    const breathWave = layout.asleep ? Math.sin(now * 0.0016) * 3.2 : Math.sin(now * 0.0034) * 2.2;
    const breath = breathWave + this.bodyBob * 3.8 + this.bodyDiveY - this.dragLift * 8;
    const charCenterX = charX + this.bodyShiftX;
    const charBaseY = baseCharY + breath;
    const drawW = layout.is108 ? 268 : 262;
    const drawH = drawW * (278 / 224);
    const pivotOff = 48;
    const pivotY = charBaseY - pivotOff;

    const spritePointToWorld = (normX: number, normY: number) => {
      const lx = (normX - 0.5) * drawW;
      const ly = normY * drawH - drawH + pivotOff;
      const c = Math.cos(this.bodyTilt + this.dragSwing);
      const s = Math.sin(this.bodyTilt + this.dragSwing);
      return {
        x: charCenterX + lx * c - ly * s,
        y: pivotY + lx * s + ly * c,
      };
    };

    return {
      charCenterX,
      charBaseY,
      drawW,
      drawH,
      pivotOff,
      pivotY,
      spritePointToWorld,
    };
  }

  private ensureHairBangsCanvas(img: HTMLImageElement): HTMLCanvasElement | null {
    if (this.hairBangsAttempted) return this.hairBangsCanvas;
    if (!img.complete || img.naturalWidth <= 0) return null;
    this.hairBangsAttempted = true;
    try {
      const cropX = 60;
      const cropY = 105;
      const cropW = 102;
      const cropH = 42;
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = 224;
      srcCanvas.height = 278;
      const sctx = srcCanvas.getContext('2d', { willReadFrequently: true });
      if (!sctx) return null;
      sctx.drawImage(img, 0, 0, 224, 278);
      const idata = sctx.getImageData(cropX, cropY, cropW, cropH);
      const d = idata.data;
      for (let ly = 0; ly < cropH; ly++) {
        const y = cropY + ly;
        for (let lx = 0; lx < cropW; lx++) {
          const x = cropX + lx;
          const idx = (ly * cropW + lx) * 4;
          const r = d[idx];
          const g = d[idx + 1];
          const b = d[idx + 2];
          const a = d[idx + 3];
          const inCenterBangs =
            (x >= 96 && x <= 122 && y <= 137) || (x >= 100 && x <= 118 && y <= 141);
          const inOuterHair = (x <= 69 || x >= 149) && y <= 145;
          const isHairPixel =
            a > 90 && (r - b > 70 || (r < 125 && g < 120 && b < 165));
          if (!((inCenterBangs || inOuterHair) && isHairPixel)) {
            d[idx + 3] = 0;
          }
        }
      }
      const out = document.createElement('canvas');
      out.width = cropW;
      out.height = cropH;
      const octx = out.getContext('2d');
      if (!octx) return null;
      octx.putImageData(idata, 0, 0);
      this.hairBangsCanvas = out;
      return out;
    } catch {
      return null;
    }
  }

  private traceClosedSpline(
    ctx: CanvasRenderingContext2D,
    pts: ReadonlyArray<readonly [number, number]>,
  ): void {
    const n = pts.length;
    if (n < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n];
      const p1 = pts[i];
      const p2 = pts[(i + 1) % n];
      const p3 = pts[(i + 2) % n];
      const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
      const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
      const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
      const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2[0], p2[1]);
    }
    ctx.closePath();
  }

  /**
   * Draws Live2D-style moving sapphire eyes in native 224x278 sprite space when looking toward mouse/keyboard.
   * Smoothly crossfades to 100% original untouched sprite pixels when looking straight ahead at rest.
   */
  private renderLiveEyes(
    ctx: CanvasRenderingContext2D,
    gazeX: number,
    gazeY: number,
    idleImg: HTMLImageElement,
  ): void {
    const gazeMag = Math.hypot(gazeX, gazeY);
    const alpha = Math.min(1, gazeMag / 0.55);
    if (alpha <= 0.02) return;

    const eyes: Array<{
      side: -1 | 1;
      ix: number;
      iy: number;
      irx: number;
      iry: number;
      pts: ReadonlyArray<readonly [number, number]>;
    }> = [
      {
        side: -1,
        ix: 84.5,
        iy: 137.4,
        irx: 9.7,
        iry: 10.2,
        pts: [
          [69.8, 132.8],
          [76.0, 128.0],
          [85.0, 127.4],
          [93.5, 129.4],
          [97.2, 134.5],
          [95.5, 143.5],
          [89.0, 147.2],
          [80.0, 147.2],
          [72.5, 143.8],
          [69.8, 138.0],
        ],
      },
      {
        side: 1,
        ix: 133.5,
        iy: 137.2,
        irx: 9.8,
        iry: 10.2,
        pts: [
          [120.8, 134.5],
          [124.5, 129.2],
          [133.5, 127.2],
          [142.5, 128.0],
          [148.2, 132.8],
          [148.2, 138.0],
          [145.5, 143.8],
          [138.0, 147.2],
          [129.0, 147.2],
          [122.5, 143.5],
        ],
      },
    ];

    ctx.save();
    ctx.globalAlpha = alpha;

    for (const e of eyes) {
      ctx.save();
      this.traceClosedSpline(ctx, e.pts);
      ctx.clip();

      // 1) Warm anime sclera + cool-lavender upper-lash cast shadow
      const scleraGrad = ctx.createLinearGradient(0, 127, 0, 146);
      scleraGrad.addColorStop(0.0, '#c0b4c8');
      scleraGrad.addColorStop(0.28, '#e8dce2');
      scleraGrad.addColorStop(0.58, '#f6ecf0');
      scleraGrad.addColorStop(1.0, '#faf3f5');
      ctx.fillStyle = scleraGrad;
      ctx.fillRect(e.ix - 18, 125, 36, 25);

      // 2) Moving ocean-sapphire iris (matched 1:1 to notail_idle.png)
      const icx = e.ix + gazeX;
      const icy = e.iy + gazeY;
      const irx = e.irx;
      const iry = e.iry;

      ctx.fillStyle = '#46240f';
      ctx.beginPath();
      ctx.ellipse(icx, icy, irx, iry, 0, 0, Math.PI * 2);
      ctx.fill();

      const irisGrad = ctx.createLinearGradient(icx, icy - iry * 0.92, icx, icy + iry * 0.92);
      irisGrad.addColorStop(0.0, '#542a10');
      irisGrad.addColorStop(0.36, '#8a4416');
      irisGrad.addColorStop(0.66, '#e08a3c');
      irisGrad.addColorStop(0.88, '#ffd9a0');
      irisGrad.addColorStop(1.0, '#e0b080');
      ctx.fillStyle = irisGrad;
      ctx.beginPath();
      ctx.ellipse(icx, icy, irx * 0.91, iry * 0.91, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 214, 150, 0.62)';
      ctx.beginPath();
      ctx.ellipse(icx, icy + iry * 0.44, irx * 0.62, iry * 0.30, 0, 0, Math.PI * 2);
      ctx.fill();

      // Deep central pupil with subtle gaze parallax
      const pcx = icx + gazeX * 0.22;
      const pcy = icy + gazeY * 0.22 - 0.4;
      const prx = irx * 0.42;
      const pry = iry * 0.46;
      ctx.fillStyle = 'rgba(70, 30, 8, 0.92)';
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, prx, pry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(46, 18, 4, 0.96)';
      ctx.beginPath();
      ctx.ellipse(pcx, pcy, prx * 0.52, pry * 0.52, 0, 0, Math.PI * 2);
      ctx.fill();

      // Soft upper-lash shadow across top of iris
      ctx.fillStyle = 'rgba(64, 28, 14, 0.40)';
      ctx.beginPath();
      ctx.ellipse(icx, icy - iry * 0.72, irx * 0.95, iry * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      // Glossy starlight catchlights
      const hlX = icx + (e.side === -1 ? 0.6 : -0.3);
      const hlY = icy - iry * 0.50;
      ctx.fillStyle = 'rgba(244, 250, 255, 0.97)';
      ctx.beginPath();
      ctx.arc(hlX, hlY, 2.1, 0, Math.PI * 2);
      ctx.fill();

      const hl2X = icx + (e.side === -1 ? -3.4 : 3.4);
      const hl2Y = icy + iry * 0.30;
      ctx.fillStyle = 'rgba(235, 250, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(hl2X, hl2Y, 0.85, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // Re-composite exact center bangs & outer side hair ON TOP of eye sockets!
    const bangs = this.ensureHairBangsCanvas(idleImg);
    if (bangs) {
      ctx.drawImage(bangs, 60, 105);
    }

    ctx.restore();
  }

  /** Layer 1 (drawn BEFORE keyboard & mouse): waist-anchored whale tail + BigFish sprite + Live2D eyes + soft blush. */
  public renderBody(
    ctx: CanvasRenderingContext2D,
    now: number,
    layout: DaFeiYuLayout,
    peekAmount = 0,
  ): void {
    const g = this.computeGeom(now, layout);
    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const isBlinking = now < this.blinkUntil;
    const peekP = Math.max(0, Math.min(1, peekAmount));

    // Draw whale tail behind body sprite & keyboard so its root emerges naturally from her waist
    // and NEVER floats on top of the keyboard or detaches when shifting left for mouseMode (Fixes #11).
    // Fade and hide smoothly while peeking from the screen edge so only her whale-hooded head shows.
    if (peekP <= 0.35) {
      const tailRoot = g.spritePointToWorld(0.56, 0.785);
      const tipX = tailRoot.x + this.tail.relX;
      const tipY = tailRoot.y + this.tail.relY;
      ctx.save();
      if (peekP > 0.05) {
        ctx.globalAlpha *= Math.max(0, 1 - (peekP - 0.05) / 0.30);
      }
      this.drawWhaleTail(
        ctx,
        tailRoot.x,
        tailRoot.y,
        tipX,
        tipY,
        this.tail.phase,
        this.tail.activeWag,
        layout.logicalW,
        'back',
      );
      ctx.restore();
    }

    const isAsleep = !layout.privacyMode && !isHappy && Boolean(layout.asleep);
    const isWatching = !layout.privacyMode && !layout.asleep && Boolean(layout.watching);
    const isCurious =
      !layout.privacyMode && !isHappy && !isAsleep && !isWatching && now < this.curiousUntil;
    const isWaiting = !layout.privacyMode && !isAsleep && !isWatching && now < this.waitingUntil;
    const actKind = this.act ? this.act.kind : null;
    const isPanic = !layout.privacyMode && !isAsleep && !isWatching && now < this.panicUntil;
    const isTsun = isHappy && !isAsleep && !isWatching && now < this.tsunUntil && actKind !== 'cheer';
    const yawnP = actKind === 'yawn' && this.act ? (now - this.act.t0) / this.act.dur : -1;
    let exprKey: DaFeiYuExpr = 'idle';
    if (layout.privacyMode) exprKey = 'blink';
    else if (isAsleep) exprKey = 'sleep';
    else if (isWatching) exprKey = now < this.angryUntil ? 'angry' : 'watch';
    else if (layout.dragging) exprKey = 'curious';
    else if (isTsun) exprKey = 'tsun';
    else if (isHappy || actKind === 'cheer' || actKind === 'wave') exprKey = 'happy';
    else if (actKind === 'thumbs' || actKind === 'stretch') exprKey = 'shy';
    else if (actKind === 'yawn') exprKey = yawnP > 0.12 && yawnP < 0.86 ? 'yawn' : 'blink';
    else if (now < this.startleUntil) exprKey = 'curious';
    else if (isPanic) exprKey = 'panic';
    else if (isWaiting) exprKey = isBlinking ? 'blink' : 'idle';
    else if (isCurious) exprKey = 'curious';
    else if (this.stareShy) exprKey = 'shy';
    else if (this.teaSip(now) > 0.35) exprKey = 'tea';
    else if (this.reading) exprKey = 'read';
    else if (this.moodTier === 2) exprKey = 'happy';
    else if (this.moodTier === 1) exprKey = 'shy';
    else if (this.drowsyClosed || isBlinking) exprKey = 'blink';

    const sprites = this.ensureSprites();
    const img = sprites[exprKey] || sprites.idle;
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      if (peekP < 0.05) {
        ctx.beginPath();
        ctx.rect(0, 0, layout.logicalW, layout.kbCenterY - layout.kbHeight * 0.36);
        ctx.clip();
      }
      ctx.translate(g.charCenterX, g.pivotY);
      ctx.rotate(this.bodyTilt + this.dragSwing);
      // Wake-up stretch: a slow tall reach, on top of the usual key-press squash
      const stretchS =
        this.act && this.act.kind === 'stretch'
          ? Math.sin(Math.PI * Math.min(1, (now - this.act.t0) / this.act.dur))
          : 0;
      ctx.scale(
        (1 + this.bodyBob * 0.022) * (1 - stretchS * 0.03),
        (1 - this.bodyBob * 0.018) * (1 + stretchS * 0.045),
      );
      ctx.drawImage(img, -g.drawW * 0.5, -g.drawH + g.pivotOff, g.drawW, g.drawH);

      // Live2D eye gaze toward mouse/keyboard when eyes are open
      if (exprKey === 'idle') {
        ctx.save();
        ctx.translate(-g.drawW * 0.5, -g.drawH + g.pivotOff);
        ctx.scale(g.drawW / 224, g.drawH / 278);
        this.renderLiveEyes(ctx, this.eyeGazeX, this.eyeGazeY, sprites.idle);
        ctx.restore();
      }

      // Soft natural watercolor cheek blush strictly BELOW her eyes
      if (this.blushLevel > 0.08) {
        const cheeks = [
          { x: (0.372 - 0.5) * g.drawW, y: 0.562 * g.drawH - g.drawH + g.pivotOff },
          { x: (0.616 - 0.5) * g.drawW, y: 0.562 * g.drawH - g.drawH + g.pivotOff },
        ];
        for (const ch of cheeks) {
          const rX = 11.5 + this.blushLevel * 4.5;
          const rY = 6.2 + this.blushLevel * 2.2;
          const grad = ctx.createRadialGradient(ch.x, ch.y, 1, ch.x, ch.y, rX);
          grad.addColorStop(0, `rgba(255, 110, 148, ${(this.blushLevel * 0.46).toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(255, 138, 170, ${(this.blushLevel * 0.22).toFixed(3)})`);
          grad.addColorStop(1, 'rgba(255, 140, 170, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(ch.x, ch.y, rX, rY, 0, 0, Math.PI * 2);
          ctx.fill();

          if (this.blushLevel > 0.52) {
            const lineA = Math.min(1, (this.blushLevel - 0.52) / 0.40) * 0.36;
            ctx.strokeStyle = `rgba(235, 88, 132, ${lineA.toFixed(3)})`;
            ctx.lineWidth = 1.05;
            ctx.lineCap = 'round';
            ctx.beginPath();
            for (const ox of [-3.4, 0, 3.4]) {
              ctx.moveTo(ch.x + ox - 0.9, ch.y + 1.8);
              ctx.lineTo(ch.x + ox + 1.0, ch.y - 1.5);
            }
            ctx.stroke();
          }
        }
      }

      // Gaming headset: a 224x278 overlay aligned with every frame
      if (layout.gaming && !layout.privacyMode) {
        const headset = this.ensureProps().headset;
        if (headset.complete && headset.naturalWidth > 0) {
          ctx.drawImage(headset, -g.drawW * 0.5, -g.drawH + g.pivotOff, g.drawW, g.drawH);
        }
      }
      ctx.restore();
    }
  }

  /** 0..1 while she lifts the teacup to her lips (one sip every 9s during tea time). */
  private teaSip(now: number): number {
    if (!this.holdingTea) return 0;
    const ph = ((now - this.teaSince) % 9000) / 9000;
    if (ph < 0.62 || ph > 0.92) return 0;
    return Math.sin(Math.PI * ((ph - 0.62) / 0.3));
  }

  /** Layer 2 (drawn AFTER keyboard & mouse): water ripples, animated whale tail, plump round hands, particles. */
  public renderForeground(
    ctx: CanvasRenderingContext2D,
    dt: number,
    now: number,
    layout: DaFeiYuLayout,
  ): void {
    const g = this.computeGeom(now, layout);
    const shL = g.spritePointToWorld(0.39, 0.653);
    const shR = g.spritePointToWorld(0.61, 0.653);
    const tailRoot = g.spritePointToWorld(0.56, 0.785);

    const isHappy = !layout.privacyMode && layout.petEnergy > 0.25;
    const watching = !layout.privacyMode && !layout.asleep && Boolean(layout.watching);
    const dragging = !layout.privacyMode && Boolean(layout.dragging);
    const isWaiting = !layout.privacyMode && !layout.asleep && !watching && now < this.waitingUntil;
    const actKind = this.act ? this.act.kind : null;
    const actT = this.act ? Math.min(1, (now - this.act.t0) / this.act.dur) : 0;

    // 0) Floating '?' beside her head while curious (agent working / thinking / waiting)
    if (!layout.privacyMode && !isHappy && layout.asleep) {
      // Floating 'z z Z' drifting up from her head while asleep
      const zp = g.spritePointToWorld(0.82, 0.2);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = (now / 2600 + i / 3) % 1;
        const size = 13 + ph * 13;
        ctx.globalAlpha = Math.max(0, Math.min(1, ph * 5) * (1 - ph) * 1.15);
        ctx.font = `900 ${size.toFixed(1)}px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif`;
        const zx = zp.x + ph * 26 + Math.sin(ph * 6.2 + i) * 4;
        const zy = zp.y - ph * 46;
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#3a2418';
        ctx.strokeText('z', zx, zy);
        ctx.fillStyle = '#fff4e1';
        ctx.fillText('z', zx, zy);
      }
      ctx.restore();
    } else if (watching && now < this.angryUntil) {
      // Pulsing comic anger mark beside her head
      const ap = g.spritePointToWorld(0.2, 0.2);
      const pulse = 1 + Math.sin(now * 0.02) * 0.12;
      ctx.save();
      ctx.globalAlpha = Math.min(1, (this.angryUntil - now) / 300);
      ctx.translate(ap.x, ap.y);
      ctx.scale(pulse, pulse);
      ctx.lineCap = 'round';
      for (const [width, color] of [
        [6.2, '#3a2418'],
        [3.2, '#ff5a4f'],
      ] as const) {
        ctx.lineWidth = width;
        ctx.strokeStyle = color;
        for (let i = 0; i < 4; i++) {
          ctx.save();
          ctx.rotate((i * Math.PI) / 2);
          ctx.beginPath();
          ctx.moveTo(3.5, 10);
          ctx.quadraticCurveTo(3.5, 3.5, 10, 3.5);
          ctx.stroke();
          ctx.restore();
        }
      }
      ctx.restore();
    } else if (isWaiting && !isHappy && !dragging) {
      // Bouncing '!' while an agent waits for the user
      const fadeIn = Math.min(1, (now - this.waitingSince) / 220);
      const fadeOut = Math.min(1, (this.waitingUntil - now) / 320);
      const ep = g.spritePointToWorld(0.16, 0.17);
      const hop = Math.abs(Math.sin(now * 0.0065)) * 7;
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(fadeIn, fadeOut));
      ctx.translate(ep.x, ep.y - hop);
      ctx.rotate(-0.16);
      ctx.scale(0.7 + 0.3 * fadeIn, 0.7 + 0.3 * fadeIn);
      ctx.font = '900 32px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3a2418';
      ctx.strokeText('!', 0, 0);
      ctx.fillStyle = '#ff7a45';
      ctx.fillText('!', 0, 0);
      ctx.restore();
    } else if (
      !layout.privacyMode &&
      !isHappy &&
      !watching &&
      !dragging &&
      !this.act &&
      now >= this.startleUntil &&
      now < this.curiousUntil
    ) {
      const fadeIn = Math.min(1, (now - this.curiousSince) / 260);
      const fadeOut = Math.min(1, (this.curiousUntil - now) / 320);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const pop = 0.7 + 0.3 * fadeIn;
      const qp = g.spritePointToWorld(0.86, 0.15);
      const bob = Math.sin(now * 0.0052) * 3.2;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(qp.x, qp.y + bob);
      ctx.rotate(0.2 + Math.sin(now * 0.0031) * 0.08);
      ctx.scale(pop, pop);
      ctx.font = '900 30px "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#3a2418';
      ctx.strokeText('?', 0, 0);
      ctx.fillStyle = '#ffb866';
      ctx.fillText('?', 0, 0);
      ctx.restore();
    }
    const mouseMode =
      !layout.privacyMode &&
      !isHappy &&
      !layout.dragging &&
      !layout.asleep &&
      (layout.mouseLeft || layout.mouseRight || now - layout.mouseActiveAt < 900);

    // 1) Water slap ripples on keyboard
    for (const rp of this.ripples) {
      ctx.save();
      ctx.globalAlpha = rp.life * 0.82;
      ctx.strokeStyle = '#ffb866';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(rp.x, rp.y, rp.r, rp.r * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // 2) Only draw the arching front half & fluke of the whale tail in foreground while slapping a key,
    // keeping the waist root strictly behind her body & keyboard bezel!
    if (this.tail.phase > 0.12) {
      const tipX = tailRoot.x + this.tail.relX;
      const tipY = tailRoot.y + this.tail.relY;
      this.drawWhaleTail(
        ctx,
        tailRoot.x,
        tailRoot.y,
        tipX,
        tipY,
        this.tail.phase,
        this.tail.activeWag,
        layout.logicalW,
        'front',
      );
    }

    // 3) Pure round chibi hands (covering closed eyes in privacyMode!)
    const leftTyping =
      !layout.privacyMode &&
      !mouseMode &&
      (now - this.leftHand.lastAt < 380 || this.leftHand.heldVks.size > 0);
    const rightTyping =
      !layout.privacyMode &&
      (now - this.rightHand.lastAt < 380 || this.rightHand.heldVks.size > 0);

    let lTargetX: number;
    let lTargetY: number;
    let rTargetX: number;
    let rTargetY: number;
    let heldProp: DaFeiYuProp | null = null;
    const isPanic = !layout.privacyMode && !layout.asleep && !watching && now < this.panicUntil;
    const isTsun = isHappy && !layout.asleep && !watching && now < this.tsunUntil && actKind !== 'cheer';
    const sip = this.teaSip(now);
    const book = this.reading ? g.spritePointToWorld(0.5, 0.735) : null;
    if (layout.privacyMode) {
      const eyeL = g.spritePointToWorld(0.390, 0.476);
      const eyeR = g.spritePointToWorld(0.598, 0.476);
      const shyBob = Math.sin(now * 0.008) * 1.4;
      lTargetX = eyeL.x;
      lTargetY = eyeL.y + shyBob;
      rTargetX = eyeR.x;
      rTargetY = eyeR.y - shyBob;
    } else if (isTsun) {
      // Arms folded in front of her chest while she pretends not to enjoy it
      const chest = g.spritePointToWorld(0.5, 0.7);
      lTargetX = chest.x + 12;
      lTargetY = chest.y + 2;
      rTargetX = chest.x - 12;
      rTargetY = chest.y + 6;
    } else if (isHappy || actKind === 'cheer') {
      // Agent-done cheer throws both arms high; ordinary petting keeps the small happy bob
      const big = actKind === 'cheer';
      const cheer = Math.sin(now * 0.016) * (big ? 9 : 5.0);
      lTargetX = shL.x - (big ? 26 : 14);
      lTargetY = shL.y + (big ? -36 : 4) + cheer;
      rTargetX = shR.x + (big ? 26 : 14);
      rTargetY = shR.y + (big ? -36 : 4) - cheer;
    } else {
      if (mouseMode) {
        const pressOff = layout.mouseLeft || layout.mouseRight ? 2.5 : 0;
        lTargetX = layout.mouseBtnX;
        lTargetY = layout.mouseBtnY + pressOff;
      } else if (leftTyping) {
        lTargetX = this.leftHand.tx;
        lTargetY = this.leftHand.ty;
      } else if (actKind === 'stretch') {
        const up = Math.sin(Math.PI * actT);
        lTargetX = shL.x - 15 - up * 9;
        lTargetY = shL.y + 34 - up * 92;
      } else if (dragging) {
        lTargetX = shL.x - 13 - this.dragSwing * 70;
        lTargetY = shL.y + 40;
      } else if (isPanic) {
        const cheek = g.spritePointToWorld(0.3, 0.585);
        lTargetX = cheek.x + Math.sin(now * 0.055) * 1.6;
        lTargetY = cheek.y;
      } else if (book) {
        lTargetX = book.x - 22;
        lTargetY = book.y + 6;
      } else {
        lTargetX = shL.x - 15;
        lTargetY = shL.y + 34;
      }
      if (rightTyping) {
        rTargetX = this.rightHand.tx;
        rTargetY = this.rightHand.ty;
      } else if (actKind === 'stretch') {
        const up = Math.sin(Math.PI * actT);
        rTargetX = shR.x + 15 + up * 9;
        rTargetY = shR.y + 34 - up * 92;
      } else if (actKind === 'wave') {
        const w = now * 0.019;
        rTargetX = shR.x + 34 + Math.sin(w) * 13;
        rTargetY = shR.y - 44 - Math.abs(Math.cos(w)) * 4;
      } else if (actKind === 'thumbs') {
        rTargetX = shR.x + 30;
        rTargetY = shR.y - 26;
      } else if (dragging) {
        rTargetX = shR.x + 13 - this.dragSwing * 70;
        rTargetY = shR.y + 40;
      } else if (actKind === 'yawn') {
        // Covers her mouth for the big middle part of the yawn
        const cover = Math.sin(Math.PI * Math.max(0, Math.min(1, (actT - 0.08) / 0.84)));
        const mouth = g.spritePointToWorld(0.56, 0.61);
        rTargetX = shR.x + 15 + (mouth.x - shR.x - 15) * cover;
        rTargetY = shR.y + 34 + (mouth.y - shR.y - 34) * cover;
      } else if (isPanic) {
        const cheek = g.spritePointToWorld(0.7, 0.585);
        rTargetX = cheek.x - Math.sin(now * 0.055) * 1.6;
        rTargetY = cheek.y;
      } else if (isWaiting) {
        // Beckoning wave while an agent waits for the user
        const w = now * 0.012;
        rTargetX = shR.x + 32 + Math.sin(w) * 9;
        rTargetY = shR.y - 42 + Math.cos(w * 2) * 3;
      } else if (watching && this.propKind && now >= this.angryUntil) {
        // Holding a snack: hand rests at chest height and lifts toward her mouth now and then
        const sip = Math.max(0, Math.sin(now * 0.0021)) ** 2;
        rTargetX = shR.x + 26;
        rTargetY = shR.y + 14 - sip * 12;
        heldProp = this.propKind;
      } else if (book) {
        rTargetX = book.x + 22;
        rTargetY = book.y + 6;
      } else if (this.holdingTea) {
        // Afternoon tea: cup held at chest height, lifted to her lips for a sip every 9s
        const lips = g.spritePointToWorld(0.57, 0.62);
        const restX = shR.x + 22;
        const restY = shR.y + 16;
        rTargetX = restX + (lips.x - restX) * sip;
        rTargetY = restY + (lips.y + 14 - restY) * sip;
        heldProp = 'teacup';
      } else {
        rTargetX = shR.x + 15;
        rTargetY = shR.y + 34;
      }
    }

    const hLerp = 1 - Math.exp(-26 * dt);
    this.leftHand.x += (lTargetX - this.leftHand.x) * hLerp;
    this.leftHand.y += (lTargetY - this.leftHand.y) * hLerp;
    this.rightHand.x += (rTargetX - this.rightHand.x) * hLerp;
    this.rightHand.y += (rTargetY - this.rightHand.y) * hLerp;
    this.leftHand.squash *= Math.exp(-14 * dt);
    this.rightHand.squash *= Math.exp(-14 * dt);

    if (book) {
      // The book sits between her hands, so it goes under the arms
      const img = this.ensureProps().book;
      if (img.complete && img.naturalWidth > 0) {
        const fade = Math.min(1, (now - this.readingSince) / 300);
        const bh = 46;
        const bw = (bh * img.naturalWidth) / img.naturalHeight;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.drawImage(img, book.x - bw * 0.5, book.y - bh * 0.55 + (1 - fade) * 10, bw, bh);
        ctx.restore();
      }
    }

    const maxMouseReach = layout.is108 ? 96 : 88;
    this.drawChubbyArm(
      ctx,
      shL.x,
      shL.y,
      this.leftHand.x,
      this.leftHand.y,
      'left',
      this.leftHand.squash,
      mouseMode ? maxMouseReach : 72,
    );
    this.drawChubbyArm(
      ctx,
      shR.x,
      shR.y,
      this.rightHand.x,
      this.rightHand.y,
      'right',
      this.rightHand.squash,
      mouseMode ? 86 : 72,
    );

    if (heldProp) {
      const img = this.ensureProps()[heldProp];
      if (img.complete && img.naturalWidth > 0) {
        const ph = heldProp === 'teacup' ? 30 : 50;
        const pw = (ph * img.naturalWidth) / img.naturalHeight;
        ctx.drawImage(img, this.rightHand.x - pw * 0.5 + 3, this.rightHand.y - ph + 12, pw, ph);
      }
    }

    // 4) Water droplets & hearts
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.font = '14px sans-serif';
      ctx.fillText(p.kind === 'heart' ? '🧡' : '💧', p.x, p.y);
      ctx.restore();
    }

    // 5) Thumbs-up popping beside her raised hand (Ctrl+S)
    if (actKind === 'thumbs' && !layout.privacyMode && !rightTyping) {
      const pop = Math.min(1, actT / 0.16);
      const fade = Math.min(1, (1 - actT) / 0.2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, fade);
      ctx.translate(this.rightHand.x + 4, this.rightHand.y - 26 - actT * 6);
      ctx.scale(0.5 + 0.6 * pop, 0.5 + 0.6 * pop);
      ctx.font = '22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('👍', 0, 0);
      ctx.restore();
    }

    // 6) Confetti burst (agent finished)
    for (const cf of this.confetti) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, cf.life * 2.2));
      ctx.translate(cf.x, cf.y);
      ctx.rotate(cf.rot);
      ctx.fillStyle = cf.color;
      ctx.fillRect(-cf.w / 2, -cf.h / 2, cf.w, cf.h);
      ctx.restore();
    }
  }

  private drawWhaleTail(
    ctx: CanvasRenderingContext2D,
    rootX: number,
    rootY: number,
    tipX: number,
    tipY: number,
    slapPhase: number,
    wagAngle: number,
    logicalW: number,
    layer: 'back' | 'front',
  ): void {
    const idleCtrlX = rootX + 52;
    const idleCtrlY = rootY - 6;
    // Smoothly wrap around the right hip and sweep over the keyboard deck when slapping far-left keys
    // so the whale tail never cuts across her torso or face!
    const crossLeft = Math.max(0, Math.min(1, (rootX + 24 - tipX) / 145));
    const nearSlapCtrlX = Math.min(logicalW - 18, Math.max(rootX + 94, tipX + 42));
    const nearSlapCtrlY = Math.min(rootY - 42, (rootY + tipY) * 0.5 - 64);
    const farSlapCtrlX = Math.min(logicalW - 16, rootX + 104);
    const farSlapCtrlY = Math.max(rootY + 28, tipY - 14);
    const slapCtrlX = nearSlapCtrlX + (farSlapCtrlX - nearSlapCtrlX) * crossLeft;
    const slapCtrlY = nearSlapCtrlY + (farSlapCtrlY - nearSlapCtrlY) * crossLeft;

    const ctrlX = idleCtrlX + (slapCtrlX - idleCtrlX) * slapPhase;
    const ctrlY = idleCtrlY + (slapCtrlY - idleCtrlY) * slapPhase;

    const steps = 14;
    const pts: Array<{ x: number; y: number; nx: number; ny: number; r: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 0.90;
      const omt = 1 - t;
      const x = omt * omt * rootX + 2 * omt * t * ctrlX + t * t * tipX;
      const y = omt * omt * rootY + 2 * omt * t * ctrlY + t * t * tipY;
      const tx = 2 * omt * (ctrlX - rootX) + 2 * t * (tipX - ctrlX);
      const ty = 2 * omt * (ctrlY - rootY) + 2 * t * (tipY - ctrlY);
      const len = Math.max(0.001, Math.hypot(tx, ty));
      const nx = -ty / len;
      const ny = tx / len;
      const r = t < 0.14 ? 7.2 + (t / 0.14) * 2.8 : 10.0 * (1 - ((t - 0.14) / 0.86) * 0.56);
      pts.push({ x, y, nx, ny, r });
    }

    const startIdx = layer === 'front' ? Math.floor(steps * 0.42) : 0;
    const drawFluke = layer === 'front' ? true : slapPhase <= 0.12;
    const tipAng = Math.atan2(tipY - ctrlY, tipX - ctrlX) + wagAngle;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (layer === 'front' && slapPhase > 0.25) {
      ctx.save();
      ctx.fillStyle = 'rgba(88, 40, 16, 0.22)';
      ctx.beginPath();
      ctx.ellipse(tipX, tipY + 6, 22, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const stemGrad = ctx.createLinearGradient(rootX, rootY, tipX, tipY);
    stemGrad.addColorStop(0, 'rgba(70, 34, 16, 0.92)');
    stemGrad.addColorStop(0.18, '#7a3a12');
    stemGrad.addColorStop(0.55, '#c9642a');
    stemGrad.addColorStop(1, '#f2a25a');

    ctx.beginPath();
    ctx.moveTo(
      pts[startIdx].x + pts[startIdx].nx * pts[startIdx].r,
      pts[startIdx].y + pts[startIdx].ny * pts[startIdx].r,
    );
    for (let i = startIdx + 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x + pts[i].nx * pts[i].r, pts[i].y + pts[i].ny * pts[i].r);
    }
    for (let i = pts.length - 1; i >= startIdx; i--) {
      ctx.lineTo(pts[i].x - pts[i].nx * pts[i].r, pts[i].y - pts[i].ny * pts[i].r);
    }
    ctx.closePath();
    ctx.fillStyle = stemGrad;
    ctx.fill();

    const edgeStart = Math.max(1, startIdx);
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    for (let i = edgeStart; i < pts.length; i++) {
      const px = pts[i].x + pts[i].nx * pts[i].r;
      const py = pts[i].y + pts[i].ny * pts[i].r;
      if (i === edgeStart) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.beginPath();
    for (let i = edgeStart; i < pts.length; i++) {
      const px = pts[i].x - pts[i].nx * pts[i].r;
      const py = pts[i].y - pts[i].ny * pts[i].r;
      if (i === edgeStart) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    const hlStart = Math.max(2, startIdx);
    ctx.strokeStyle = 'rgba(255, 226, 180, 0.48)';
    ctx.lineWidth = 3.0;
    ctx.beginPath();
    for (let i = hlStart; i < pts.length; i++) {
      const hx = pts[i].x + pts[i].nx * (pts[i].r * 0.35);
      const hy = pts[i].y + pts[i].ny * (pts[i].r * 0.35);
      if (i === hlStart) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.stroke();

    if (!drawFluke) {
      ctx.restore();
      return;
    }

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(tipAng);
    const sq = this.tail.squash;
    const scaleMult = 1.05 + slapPhase * 0.10;
    ctx.scale(scaleMult * (1 + sq * 0.16), scaleMult * (1 - sq * 0.10));

    const flukeGrad = ctx.createRadialGradient(-6, 0, 2, 4, 0, 28);
    flukeGrad.addColorStop(0, '#ffe0b0');
    flukeGrad.addColorStop(0.38, '#f2a25a');
    flukeGrad.addColorStop(0.78, '#c9642a');
    flukeGrad.addColorStop(1, '#7a3a12');

    ctx.fillStyle = flukeGrad;
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-13, -4);
    ctx.bezierCurveTo(-8, -19, 8, -30, 19, -23);
    ctx.bezierCurveTo(22, -14, 14, -4, 3, 0);
    ctx.bezierCurveTo(14, 4, 22, 14, 19, 23);
    ctx.bezierCurveTo(8, 30, -8, 19, -13, 4);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 240, 215, 0.65)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-8, -2);
    ctx.quadraticCurveTo(2, -11, 13, -17);
    ctx.moveTo(-8, 2);
    ctx.quadraticCurveTo(2, 11, 13, 17);
    ctx.moveTo(-6, -1);
    ctx.quadraticCurveTo(1, -6, 8, -9);
    ctx.moveTo(-6, 1);
    ctx.quadraticCurveTo(1, 6, 8, 9);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 244, 225, 0.55)';
    ctx.beginPath();
    ctx.ellipse(-4, -7, 4.2, 2.2, -0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  private drawChubbyArm(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    targetX: number,
    targetY: number,
    side: 'left' | 'right',
    squash: number,
    maxLen: number,
  ): void {
    const dx = targetX - sx;
    const dy = targetY - sy;
    const rawLen = Math.max(1, Math.hypot(dx, dy));
    const len = Math.min(rawLen, maxLen);
    const ux = dx / rawLen;
    const uy = dy / rawLen;
    const px = sx + ux * len;
    const py = sy + uy * len;
    const nx = -uy;
    const ny = ux;
    const ang = Math.atan2(dy, dx);
    const sgn = side === 'left' ? -1 : 1;

    const wristDist = Math.max(14, len - 9);
    const wx = sx + ux * wristDist;
    const wy = sy + uy * wristDist;
    const rSh = 9.2;
    const rCuff = 12.0;
    const midX = (sx + wx) * 0.5 + nx * (sgn * 2.5);
    const midY = (sy + wy) * 0.5 + ny * (sgn * 2.5);

    ctx.save();
    const grad = ctx.createLinearGradient(sx, sy, wx, wy);
    grad.addColorStop(0, '#1c1a1a');
    grad.addColorStop(0.65, '#262220');
    grad.addColorStop(1, '#332c28');

    ctx.beginPath();
    ctx.moveTo(sx + nx * rSh, sy + ny * rSh);
    ctx.quadraticCurveTo(midX + nx * 11.0, midY + ny * 11.0, wx + nx * rCuff, wy + ny * rCuff);
    ctx.lineTo(wx - nx * rCuff, wy - ny * rCuff);
    ctx.quadraticCurveTo(midX - nx * 11.0, midY - ny * 11.0, sx - nx * rSh, sy - ny * rSh);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(sx, sy, rSh, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#141211';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx + nx * rSh, sy + ny * rSh);
    ctx.quadraticCurveTo(midX + nx * 11.0, midY + ny * 11.0, wx + nx * rCuff, wy + ny * rCuff);
    ctx.moveTo(sx - nx * rSh, sy - ny * rSh);
    ctx.quadraticCurveTo(midX - nx * 11.0, midY - ny * 11.0, wx - nx * rCuff, wy - ny * rCuff);
    ctx.stroke();

    const trimDist = Math.max(8, wristDist - 5.5);
    ctx.save();
    ctx.translate(sx + ux * trimDist, sy + uy * trimDist);
    ctx.rotate(ang + Math.PI / 2);
    ctx.strokeStyle = 'rgba(205, 212, 232, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-rCuff + 2, 0);
    ctx.lineTo(rCuff - 2, 0);
    ctx.stroke();
    ctx.fillStyle = '#e7c67b';
    ctx.beginPath();
    ctx.arc(0, 0, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#f8f9fe';
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 1.8;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 4.4, 0, 4.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.ellipse(0, -0.5, 10.2, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Pure round chibi hand (zero thumb!)
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = '#fde7df';
    ctx.strokeStyle = '#3d2c35';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.ellipse(0, 0, 8.4 * (1 + squash * 0.14), 8.2 * (1 - squash * 0.10), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(-2.2, -2.2, 2.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /**
   * Draws two adorable 大肥鱼 chibi sailor hands wrapping flush around the vertical left/right
   * screen edge cleanly above & below her peeking head (midY ± 72) so they never overlap her face.
   */
  public renderEdgePeekHands(
    ctx: CanvasRenderingContext2D,
    edgeX: number,
    midY: number,
    isLeft: boolean,
    peekP: number,
    now: number,
  ): void {
    const alpha = Math.max(0, Math.min(1, (peekP - 0.22) / 0.38));
    if (alpha <= 0.001) return;

    const dir = isLeft ? 1 : -1;
    const slide = (1 - Math.min(1, peekP)) * 24;

    ctx.save();
    ctx.globalAlpha *= alpha;

    for (const side of [-1, 1] as const) {
      const bob = Math.sin(now * 0.0032 + (side < 0 ? 0 : Math.PI)) * 1.4;
      const py = midY + side * 72 + bob;
      const anchorX = edgeX - dir * slide;

      ctx.save();
      ctx.translate(anchorX, py);
      ctx.scale(dir, 1);

      // Subtle soft shadow behind the gripping chibi hand & cuff
      ctx.fillStyle = 'rgba(26, 22, 20, 0.14)';
      ctx.beginPath();
      ctx.ellipse(12.8, 2.2, 10.6, 8.2, 0, 0, Math.PI * 2);
      ctx.fill();

      // 1) Navy sailor sleeve stub emerging from behind the vertical screen border (x = -18 .. +5.2)
      const sleeveGrad = ctx.createLinearGradient(-18, 0, 5.2, 0);
      sleeveGrad.addColorStop(0, '#1c1a1a');
      sleeveGrad.addColorStop(0.55, '#262220');
      sleeveGrad.addColorStop(1, '#332c28');

      ctx.fillStyle = sleeveGrad;
      ctx.beginPath();
      ctx.moveTo(-18, -9.4);
      ctx.quadraticCurveTo(-4, -10.2, 5.2, -11.4);
      ctx.lineTo(5.2, 11.4);
      ctx.quadraticCurveTo(-4, 10.2, -18, 9.4);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = '#141211';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(-18, -9.4);
      ctx.quadraticCurveTo(-4, -10.2, 5.2, -11.4);
      ctx.moveTo(-18, 9.4);
      ctx.quadraticCurveTo(-4, 10.2, 5.2, 11.4);
      ctx.stroke();

      // Subtle silver sailor cuff trim + tiny gold button right inside the border edge
      ctx.strokeStyle = 'rgba(205, 212, 232, 0.85)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(2.0, -9.4);
      ctx.lineTo(2.0, 9.4);
      ctx.stroke();
      ctx.fillStyle = '#e7c67b';
      ctx.beginPath();
      ctx.arc(2.0, 0, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 2) Scalloped white ruffled lace cuff flush along the border edge
      ctx.fillStyle = '#f8f9fe';
      ctx.strokeStyle = '#2a2420';
      ctx.lineWidth = 1.8;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(6.6, i * 4.2, 4.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.ellipse(6.1, 0, 3.2, 9.4, 0, 0, Math.PI * 2);
      ctx.fill();

      // 3) Plump round peach chibi hand gripping inward onto the screen (x ≈ +6 .. +22)
      ctx.fillStyle = '#fde7df';
      ctx.strokeStyle = '#3d2c35';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.ellipse(14.0, 0, 8.2, 7.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Soft warm blush shade on the lower curve of the plump hand
      ctx.fillStyle = 'rgba(235, 168, 158, 0.24)';
      ctx.beginPath();
      ctx.ellipse(14.8, 3.0, 5.2, 2.4, 0.12, 0, Math.PI * 2);
      ctx.fill();

      // Glossy white highlight dot
      ctx.fillStyle = 'rgba(255, 255, 255, 0.78)';
      ctx.beginPath();
      ctx.arc(12.0, -2.3, 2.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    ctx.restore();
  }
}
