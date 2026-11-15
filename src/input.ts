/* ============================================================
   ARENA BRAWLER — Input híbrido PC + Mobile à prova de falhas
   (Pointer Events + setPointerCapture para múltiplos dedos)
   ============================================================ */

import type { Vec2 } from './types';
import { TAP_MAX_DIST, TAP_MAX_TIME, clamp, normalize } from './constants';

/** Estado de um joystick virtual (coordenadas de tela). */
export interface StickState {
  active: boolean;
  ox: number;
  oy: number;
  kx: number;
  ky: number;
}

interface PointerRecord {
  role: 'MOVE' | 'AIM';
  startX: number;
  startY: number;
  startTime: number;
  moved: number;
}

export interface FireRequest {
  queued: boolean;
  autoAim: boolean;
}

export interface SuperRequest {
  queued: boolean;
  autoAim: boolean;
  aim: Vec2;
}

export class InputManager {
  /** Vetor de movimento normalizado (magnitude 0..1). */
  moveVec: Vec2 = { x: 0, y: 0 };
  /** Direção de mira atual (normalizada). */
  aimVec: Vec2 = { x: 1, y: 0 };
  /** O jogador está mirando ativamente (arrasto/teclado/mouse)? */
  aiming = false;
  /** Já houve interação por toque? */
  touchMode = false;
  /** Mouse sobre o canvas (PC). */
  mouse = { x: 0, y: 0, active: false };

  moveStick: StickState = { active: false, ox: 0, oy: 0, kx: 0, ky: 0 };
  aimStick: StickState = { active: false, ox: 0, oy: 0, kx: 0, ky: 0 };

  private keys = new Set<string>();
  private pointers = new Map<number, PointerRecord>();
  private movePointerId = -1;
  private aimPointerId = -1;

  private fireQueued = false;
  private fireAutoAim = false;
  private superQueued = false;
  private superAutoAim = false;
  private superAimVec: Vec2 = { x: 1, y: 0 };
  private superPointerId = -1;
  private superStartX = 0;
  private superStartY = 0;
  private superStartTime = 0;
  private superMoved = 0;

  private canvas: HTMLCanvasElement;
  private superButton: HTMLElement;
  private stickBaseX = 0;
  private stickBaseY = 0;
  private stickRadius = 72;

  constructor(canvas: HTMLCanvasElement, superButton: HTMLElement) {
    this.canvas = canvas;
    this.superButton = superButton;
    this.recomputeStickBase();
    this.attach();
  }

  private attach(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', this.onPointerDown);
    c.addEventListener('pointermove', this.onPointerMove);
    c.addEventListener('pointerup', this.onPointerUp);
    c.addEventListener('pointercancel', this.onPointerCancel);
    c.addEventListener('contextmenu', this.preventCtx);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    this.superButton.addEventListener('pointerdown', this.onSuperDown);
    this.superButton.addEventListener('pointermove', this.onSuperMove);
    this.superButton.addEventListener('pointerup', this.onSuperUp);
    this.superButton.addEventListener('pointercancel', this.onSuperCancel);
    this.superButton.addEventListener('contextmenu', this.preventCtx);
  }

  destroy(): void {
    const c = this.canvas;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerCancel);
    c.removeEventListener('contextmenu', this.preventCtx);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    this.superButton.removeEventListener('pointerdown', this.onSuperDown);
    this.superButton.removeEventListener('pointermove', this.onSuperMove);
    this.superButton.removeEventListener('pointerup', this.onSuperUp);
    this.superButton.removeEventListener('pointercancel', this.onSuperCancel);
    this.superButton.removeEventListener('contextmenu', this.preventCtx);
  }

  private preventCtx = (e: Event): void => {
    e.preventDefault();
  };

  private onResize = (): void => {
    this.recomputeStickBase();
  };

  private recomputeStickBase(): void {
    this.stickBaseX = window.innerWidth * 0.17;
    this.stickBaseY = window.innerHeight * 0.72;
    this.stickRadius = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.12, 48, 86);
    if (!this.moveStick.active) {
      this.moveStick.ox = this.stickBaseX;
      this.moveStick.oy = this.stickBaseY;
      this.moveStick.kx = this.stickBaseX;
      this.moveStick.ky = this.stickBaseY;
    }
  }

  /* ---------------- Ponteiros (canvas) ---------------- */

  private onPointerDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchMode = true;

    if (e.pointerType === 'mouse') {
      if (e.button === 0) {
        this.fireQueued = true;
        this.fireAutoAim = false;
      } else if (e.button === 2) {
        this.superQueued = true;
        this.superAutoAim = false;
        this.superAimVec = { x: 0, y: 0 };
      }
      return;
    }

    // Touch/pen: isola cada dedo com setPointerCapture.
    this.canvas.setPointerCapture(e.pointerId);
    const isLeft = e.clientX < window.innerWidth * 0.5;
    if (isLeft && this.movePointerId === -1) {
      this.movePointerId = e.pointerId;
      this.pointers.set(e.pointerId, {
        role: 'MOVE',
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        moved: 0,
      });
      this.moveStick.active = true;
      this.updateMoveStick(e.clientX, e.clientY);
    } else if (!isLeft && this.aimPointerId === -1) {
      this.aimPointerId = e.pointerId;
      this.pointers.set(e.pointerId, {
        role: 'AIM',
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        moved: 0,
      });
      this.aimStick.active = true;
      this.aimStick.ox = e.clientX;
      this.aimStick.oy = e.clientY;
      this.aimStick.kx = e.clientX;
      this.aimStick.ky = e.clientY;
    }
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.active = true;
      return;
    }
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    const dx = e.clientX - rec.startX;
    const dy = e.clientY - rec.startY;
    rec.moved = Math.max(rec.moved, Math.hypot(dx, dy));
    if (rec.role === 'MOVE') {
      this.updateMoveStick(e.clientX, e.clientY);
    } else {
      this.aimStick.kx = e.clientX;
      this.aimStick.ky = e.clientY;
      const len = Math.hypot(dx, dy);
      if (len > 4) {
        const n = normalize(dx, dy);
        this.aimVec = n;
        this.aiming = len > 8;
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse') return;
    const rec = this.pointers.get(e.pointerId);
    if (!rec) return;
    e.preventDefault();
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    if (rec.role === 'MOVE' && e.pointerId === this.movePointerId) {
      this.movePointerId = -1;
      this.moveStick.active = false;
      this.moveStick.kx = this.stickBaseX;
      this.moveStick.ky = this.stickBaseY;
      this.moveVec = { x: 0, y: 0 };
    } else if (rec.role === 'AIM' && e.pointerId === this.aimPointerId) {
      this.aimPointerId = -1;
      this.aimStick.active = false;
      this.aiming = false;
      const dtMs = performance.now() - rec.startTime;
      const isTap = dtMs < TAP_MAX_TIME * 1000 && rec.moved < TAP_MAX_DIST;
      this.fireQueued = true;
      this.fireAutoAim = isTap;
    }
  };

  private onPointerCancel = (e: PointerEvent): void => {
    const rec = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!rec) return;
    if (rec.role === 'MOVE' && e.pointerId === this.movePointerId) {
      this.movePointerId = -1;
      this.moveStick.active = false;
      this.moveVec = { x: 0, y: 0 };
    } else if (rec.role === 'AIM' && e.pointerId === this.aimPointerId) {
      this.aimPointerId = -1;
      this.aimStick.active = false;
      this.aiming = false;
    }
    if (this.superPointerId === e.pointerId) {
      this.superPointerId = -1;
    }
  };

  private updateMoveStick(x: number, y: number): void {
    const dx = x - this.stickBaseX;
    const dy = y - this.stickBaseY;
    const len = Math.hypot(dx, dy);
    const clamped = Math.min(len, this.stickRadius);
    const n = len > 1e-6 ? normalize(dx, dy) : { x: 0, y: 0 };
    this.moveStick.kx = this.stickBaseX + n.x * clamped;
    this.moveStick.ky = this.stickBaseY + n.y * clamped;
    const mag = clamp(len / this.stickRadius, 0, 1);
    this.moveVec = { x: n.x * mag, y: n.y * mag };
  }

  /* ---------------- Botão SUPER ---------------- */

  private onSuperDown = (e: PointerEvent): void => {
    e.preventDefault();
    e.stopPropagation();
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touchMode = true;
    this.superButton.setPointerCapture(e.pointerId);
    this.superPointerId = e.pointerId;
    this.superStartX = e.clientX;
    this.superStartY = e.clientY;
    this.superStartTime = performance.now();
    this.superMoved = 0;
  };

  private onSuperMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.superPointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const dx = e.clientX - this.superStartX;
    const dy = e.clientY - this.superStartY;
    this.superMoved = Math.max(this.superMoved, Math.hypot(dx, dy));
    if (Math.hypot(dx, dy) > 8) {
      this.superAimVec = normalize(dx, dy);
    }
  };

  private onSuperUp = (e: PointerEvent): void => {
    if (e.pointerId !== this.superPointerId) return;
    e.preventDefault();
    e.stopPropagation();
    if (this.superButton.hasPointerCapture(e.pointerId)) {
      this.superButton.releasePointerCapture(e.pointerId);
    }
    this.superPointerId = -1;
    const dtMs = performance.now() - this.superStartTime;
    const isTap = dtMs < TAP_MAX_TIME * 1000 && this.superMoved < TAP_MAX_DIST;
    this.superQueued = true;
    this.superAutoAim = isTap;
  };

  private onSuperCancel = (e: PointerEvent): void => {
    if (e.pointerId === this.superPointerId) this.superPointerId = -1;
  };

  /* ---------------- Teclado ---------------- */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (e.code === 'Space') {
      e.preventDefault();
      this.superQueued = true;
      this.superAutoAim = false;
      this.superAimVec = { x: 0, y: 0 };
    } else if (e.code === 'KeyF') {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      // reservado para pausa futura
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  /** Vetor de movimento do teclado (WASD / setas). */
  private keyboardMove(): Vec2 {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y += 1;
    return normalize(x, y);
  }

  /** Atualiza vetores por frame. */
  poll(): void {
    if (!this.moveStick.active) {
      this.moveVec = this.keyboardMove();
    }
  }

  /* ---------------- Consumo de ações ---------------- */

  takeFire(): FireRequest {
    const req: FireRequest = { queued: this.fireQueued, autoAim: this.fireAutoAim };
    this.fireQueued = false;
    this.fireAutoAim = false;
    return req;
  }

  takeSuper(): SuperRequest {
    const req: SuperRequest = {
      queued: this.superQueued,
      autoAim: this.superAutoAim,
      aim: this.superAimVec,
    };
    this.superQueued = false;
    this.superAutoAim = false;
    return req;
  }
}

/** Alterna tela cheia (tecla F ou botão). */
export function toggleFullscreen(): void {
  const anyDoc = document as unknown as {
    fullscreenElement?: Element | null;
    webkitFullscreenElement?: Element | null;
    exitFullscreen?: () => Promise<void>;
    webkitExitFullscreen?: () => Promise<void>;
  };
  const anyEl = document.documentElement as unknown as {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  const isFs = anyDoc.fullscreenElement ?? anyDoc.webkitFullscreenElement;
  if (!isFs) {
    const req = anyEl.requestFullscreen ?? anyEl.webkitRequestFullscreen;
    if (req) void req.call(document.documentElement).catch(() => undefined);
  } else {
    const exit = anyDoc.exitFullscreen ?? anyDoc.webkitExitFullscreen;
    if (exit) void exit.call(document).catch(() => undefined);
  }
}
