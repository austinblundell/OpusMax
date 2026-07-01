// Keyboard + pointer input with edge detection and mouse-look deltas.
export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.keys = new Set();
    this.pressed = new Set();   // edge: became down this frame
    this.released = new Set();  // edge: became up this frame
    this.mouse = { dx: 0, dy: 0, x: 0, y: 0, down: false, wheel: 0 };
    this.locked = false;
    this.enabled = true;

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      const k = e.code;
      if (!this.keys.has(k)) this.pressed.add(k);
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      const k = e.code;
      this.keys.delete(k);
      this.released.add(k);
    };
    this._onMouseMove = (e) => {
      if (this.locked) {
        this.mouse.dx += e.movementX || 0;
        this.mouse.dy += e.movementY || 0;
      }
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    this._onMouseDown = () => { this.mouse.down = true; };
    this._onMouseUp = () => { this.mouse.down = false; };
    this._onWheel = (e) => { this.mouse.wheel += Math.sign(e.deltaY); };
    this._onBlur = () => { this.keys.clear(); };
    this._onLockChange = () => {
      this.locked = document.pointerLockElement === this.dom;
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    window.addEventListener('blur', this._onBlur);
    document.addEventListener('pointerlockchange', this._onLockChange);
  }

  requestLook() {
    if (this.dom.requestPointerLock) this.dom.requestPointerLock();
  }
  exitLook() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  justPressed(code) { return this.pressed.has(code); }
  justReleased(code) { return this.released.has(code); }

  // Directional axis from WASD / arrows. Returns {x, y} in [-1,1].
  moveAxis() {
    let x = 0, y = 0;
    if (this.down('KeyW') || this.down('ArrowUp')) y += 1;
    if (this.down('KeyS') || this.down('ArrowDown')) y -= 1;
    if (this.down('KeyA') || this.down('ArrowLeft')) x -= 1;
    if (this.down('KeyD') || this.down('ArrowRight')) x += 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  // Consume per-frame edge state. Call at end of each frame.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
}
