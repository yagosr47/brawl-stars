import type { InputState, Vector2 } from './types.js';

const JOYSTICK_RADIUS = 75;
const TAP_MAX_TIME = 120;
const TAP_MAX_DIST = 10;
const SUPER_BTN_RADIUS = 36;

interface PointerInfo {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startTime: number;
  active: boolean;
  side: 'LEFT' | 'RIGHT';
  role: 'MOVE' | 'AIM' | 'SUPER' | 'NONE';
}

interface KeyState {
  [key: string]: boolean;
}

export class Input {
  readonly state: InputState;
  private canvas: HTMLCanvasElement;
  private pointers = new Map<number, PointerInfo>();
  private keys: KeyState = {};
  private moveJoystickCenter = { x: 105, y: 0 };
  private aimJoystick: { center: Vector2; active: boolean } = { center: { x: 0, y: 0 }, active: false };
  private aimReticle = { pos: { x: 0, y: 0 }, visible: false };
  private autoAimTarget: Vector2 | null = null;
  private animationFrame: number | null = null;
  private onSuperTap: (() => void) | null = null;

  private readonly onPointerDownBound: (e: PointerEvent) => void;
  private readonly onPointerMoveBound: (e: PointerEvent) => void;
  private readonly onPointerUpBound: (e: PointerEvent) => void;
  private readonly onPointerCancelBound: (e: PointerEvent) => void;
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onResizeBound: () => void;
  private readonly onContextMenuBound: (e: Event) => void;
  private readonly onMouseDownBound: (e: MouseEvent) => void;
  private readonly onMouseUpBound: (e: MouseEvent) => void;
  private readonly onMouseMoveBound: (e: MouseEvent) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.state = {
      move: { x: 0, y: 0 },
      aim: { x: 0, y: 0 },
      shoot: false,
      shootJustPressed: false,
      super: false,
      superJustPressed: false,
      fullscreen: false,
      fullscreenJustPressed: false,
    };

    this.onPointerDownBound = (e) => this.onPointerDown(e);
    this.onPointerMoveBound = (e) => this.onPointerMove(e);
    this.onPointerUpBound = (e) => this.onPointerUp(e);
    this.onPointerCancelBound = (e) => this.onPointerCancel(e);
    this.onKeyDownBound = (e) => this.onKeyDown(e);
    this.onKeyUpBound = (e) => this.onKeyUp(e);
    this.onResizeBound = () => this.updateLayout();
    this.onContextMenuBound = (e) => e.preventDefault();
    this.onMouseDownBound = (e) => this.onMouseDown(e);
    this.onMouseUpBound = (e) => this.onMouseUp(e);
    this.onMouseMoveBound = (e) => this.onMouseMove(e);

    this.canvas.addEventListener('pointerdown', this.onPointerDownBound, { passive: false });
    this.canvas.addEventListener('pointermove', this.onPointerMoveBound, { passive: false });
    this.canvas.addEventListener('pointerup', this.onPointerUpBound);
    this.canvas.addEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.addEventListener('pointerleave', this.onPointerCancelBound);
    this.canvas.addEventListener('contextmenu', this.onContextMenuBound);
    this.canvas.addEventListener('mousedown', this.onMouseDownBound);
    this.canvas.addEventListener('mouseup', this.onMouseUpBound);
    this.canvas.addEventListener('mousemove', this.onMouseMoveBound);

    window.addEventListener('keydown', this.onKeyDownBound);
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('resize', this.onResizeBound);

    this.updateLayout();
    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  setSuperHandler(onTap: () => void): void {
    this.onSuperTap = onTap;
  }

  public updateLayout(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.moveJoystickCenter = { x: rect.left + 105, y: rect.bottom - 105 };
    if (!this.aimJoystick.active) {
      this.aimJoystick.center = { x: rect.right - 105, y: rect.bottom - 105 };
    }
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    this.state.aim = { x: cx, y: cy };
  }

  private clientToCanvas(x: number, y: number): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  }

  private pointerSide(clientX: number, clientY: number): 'LEFT' | 'RIGHT' {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'LEFT' : 'RIGHT') : (dy < 0 ? 'LEFT' : 'RIGHT');
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    const info: PointerInfo = {
      id: e.pointerId,
      startX: x,
      startY: y,
      lastX: x,
      lastY: y,
      startTime: performance.now(),
      active: true,
      side: this.pointerSide(e.clientX, e.clientY),
      role: 'NONE',
    };
    this.pointers.set(e.pointerId, info);
    try { this.canvas.setPointerCapture(e.pointerId); } catch {}

    if (this.isSuperButton(x, y)) {
      info.role = 'SUPER';
      return;
    }

    const distToMove = Math.hypot(x - this.moveJoystickCenter.x, y - this.moveJoystickCenter.y);
    if (distToMove < JOYSTICK_RADIUS + 60 && info.side === 'LEFT') {
      info.role = 'MOVE';
      return;
    }

    if (info.side === 'RIGHT') {
      info.role = 'AIM';
      this.aimJoystick.active = true;
      this.aimJoystick.center = { x, y };
      this.state.aim = { x, y };
      this.aimReticle.visible = true;
      this.aimReticle.pos = { x, y };
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const info = this.pointers.get(e.pointerId);
    if (!info || !info.active) return;
    e.preventDefault();

    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    info.lastX = x;
    info.lastY = y;

    if (info.role === 'MOVE') {
      const dx = x - this.moveJoystickCenter.x;
      const dy = y - this.moveJoystickCenter.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(dist, JOYSTICK_RADIUS);
      const angle = Math.atan2(dy, dx);
      this.state.move = {
        x: (Math.cos(angle) * clamped) / JOYSTICK_RADIUS,
        y: (Math.sin(angle) * clamped) / JOYSTICK_RADIUS,
      };
      return;
    }

    if (info.role === 'AIM') {
      const cx = this.aimJoystick.center.x;
      const cy = this.aimJoystick.center.y;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const knobDist = Math.min(dist, JOYSTICK_RADIUS);
      this.state.aim = { x: cx + Math.cos(angle) * knobDist, y: cy + Math.sin(angle) * knobDist };
      this.aimReticle.visible = true;
      this.aimReticle.pos = { x: this.state.aim.x, y: this.state.aim.y };
      this.state.shoot = true;
      return;
    }

    if (info.role === 'NONE' && info.side === 'RIGHT') {
      const dx = x - info.startX;
      const dy = y - info.startY;
      if (Math.hypot(dx, dy) > 12) {
        info.role = 'AIM';
        this.aimJoystick.active = true;
        this.aimJoystick.center = { x: info.startX, y: info.startY };
        this.state.aim = { x, y };
        this.aimReticle.visible = true;
        this.aimReticle.pos = { x: this.state.aim.x, y: this.state.aim.y };
        this.state.shoot = true;
      }
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const info = this.pointers.get(e.pointerId);
    if (!info) return;
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    const duration = performance.now() - info.startTime;
    const moved = Math.hypot(x - info.startX, y - info.startY);

    try { this.canvas.releasePointerCapture(e.pointerId); } catch {}

    if (info.role === 'MOVE') {
      this.state.move = { x: 0, y: 0 };
    } else if (info.role === 'AIM') {
      this.aimJoystick.active = false;
      this.state.shoot = false;
      if (duration < TAP_MAX_TIME && moved < TAP_MAX_DIST && this.autoAimTarget) {
        this.state.aim = { ...this.autoAimTarget };
        this.state.shootJustPressed = true;
      } else {
        this.state.shootJustPressed = true;
      }
    } else if (info.role === 'SUPER') {
      if (this.onSuperTap) this.onSuperTap();
    }

    this.pointers.delete(e.pointerId);
  }

  private onPointerCancel(e: PointerEvent): void {
    if (e.pointerType === 'mouse') return;
    const info = this.pointers.get(e.pointerId);
    if (!info) return;
    if (info.role === 'MOVE') this.state.move = { x: 0, y: 0 };
    if (info.role === 'AIM') {
      this.aimJoystick.active = false;
      this.state.shoot = false;
    }
    this.pointers.delete(e.pointerId);
  }

  private isSuperButton(x: number, y: number): boolean {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.right - 150;
    const cy = rect.bottom - 105;
    return Math.hypot(x - cx, y - cy) < SUPER_BTN_RADIUS + 24;
  }

  private onMouseDown(e: MouseEvent): void {
    if (e.button === 0) {
      this.state.shoot = true;
      this.state.shootJustPressed = true;
      const rect = this.canvas.getBoundingClientRect();
      this.state.aim = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    if (e.button === 2) {
      this.state.super = true;
      this.state.superJustPressed = true;
      if (this.onSuperTap) this.onSuperTap();
    }
  }

  private onMouseUp(e: MouseEvent): void {
    if (e.button === 0) this.state.shoot = false;
    if (e.button === 2) this.state.super = false;
  }

  private onMouseMove(e: MouseEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    this.state.aim = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onKeyDown(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.keys[k] = true;
    this.updateMoveFromKeys();
    if (k === ' ') {
      this.state.super = true;
      this.state.superJustPressed = true;
      if (this.onSuperTap) this.onSuperTap();
    }
    if (k === 'f') {
      this.state.fullscreen = true;
      this.state.fullscreenJustPressed = true;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.keys[k] = false;
    this.updateMoveFromKeys();
    if (k === ' ') this.state.super = false;
    if (k === 'f') this.state.fullscreen = false;
  }

  private updateMoveFromKeys(): void {
    let mx = 0;
    let my = 0;
    if (this.keys['w'] || this.keys['arrowup']) my = -1;
    if (this.keys['s'] || this.keys['arrowdown']) my = 1;
    if (this.keys['a'] || this.keys['arrowleft']) mx = -1;
    if (this.keys['d'] || this.keys['arrowright']) mx = 1;
    const len = Math.hypot(mx, my);
    this.state.move = len === 0 ? { x: 0, y: 0 } : { x: mx / len, y: my / len };
  }

  private loop(): void {
    this.state.shootJustPressed = false;
    this.state.superJustPressed = false;
    this.state.fullscreenJustPressed = false;
    const hasTouch = this.pointers.size > 0;
    const hasKeys = this.keys['w'] || this.keys['s'] || this.keys['a'] || this.keys['d'];
    if (!hasTouch && !hasKeys && !this.aimJoystick.active) {
      this.state.move = { x: 0, y: 0 };
    }
    this.animationFrame = requestAnimationFrame(() => this.loop());
  }

  setAutoAimTarget(target: Vector2 | null): void {
    this.autoAimTarget = target;
  }

  getAimWorldPos(camera: Vector2): Vector2 {
    const rect = this.canvas.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const wx = this.aimJoystick.active ? this.state.aim.x : cx;
    const wy = this.aimJoystick.active ? this.state.aim.y : cy;
    return { x: wx + camera.x, y: wy + camera.y };
  }

  getMoveDir(): Vector2 {
    const m = this.state.move;
    const len = Math.hypot(m.x, m.y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: m.x / len, y: m.y / len };
  }

  destroy(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.canvas.removeEventListener('pointerdown', this.onPointerDownBound);
    this.canvas.removeEventListener('pointermove', this.onPointerMoveBound);
    this.canvas.removeEventListener('pointerup', this.onPointerUpBound);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancelBound);
    this.canvas.removeEventListener('pointerleave', this.onPointerCancelBound);
    this.canvas.removeEventListener('contextmenu', this.onContextMenuBound);
    this.canvas.removeEventListener('mousedown', this.onMouseDownBound);
    this.canvas.removeEventListener('mouseup', this.onMouseUpBound);
    this.canvas.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('resize', this.onResizeBound);
  }
}
