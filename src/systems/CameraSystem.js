import * as THREE from 'three';
import { CAMERA, COURT } from '../config.js';

const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// Manages a single perspective camera across three cinematic modes and smooths
// all motion so the action always reads clearly.
export class CameraSystem {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.FOV, window.innerWidth / window.innerHeight, CAMERA.NEAR, CAMERA.FAR
    );
    this.mode = 'broadcast';
    this.pos = new THREE.Vector3(0, 9, -18);
    this.target = new THREE.Vector3(0, 1.5, 0);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.target);

    this.yawOffset = 0;
    this.pitchOffset = 0;
    this.shake = 0;
    this._desiredPos = this.pos.clone();
    this._desiredTarget = this.target.clone();
    this._tmp = new THREE.Vector3();
  }

  setMode(mode) {
    this.mode = mode;
    this.yawOffset = 0;
    this.pitchOffset = 0;
  }
  cycle() {
    const i = CAMERA.MODES.indexOf(this.mode);
    this.setMode(CAMERA.MODES[(i + 1) % CAMERA.MODES.length]);
    return this.mode;
  }

  addShake(v) { this.shake = Math.min(1, this.shake + v); }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  applyMouse(mouse) {
    if (this.mode === 'broadcast') return;
    this.yawOffset = THREE.MathUtils.clamp(this.yawOffset - mouse.dx * 0.0022, -1.1, 1.1);
    this.pitchOffset = THREE.MathUtils.clamp(this.pitchOffset - mouse.dy * 0.0018, -0.5, 0.7);
  }

  update(dt, { player, ball, hoop, aiming }) {
    const pp = player.position;
    const facing = player.facing;
    const fwd = this._tmp.set(Math.sin(facing), 0, Math.cos(facing));

    if (this.mode === 'broadcast') {
      // Sideline, elevated; tracks the midpoint of player and hoop.
      const midX = (pp.x + hoop.rimCenter.x * 0.4) * 0.7;
      const focusX = (pp.x * 0.6 + hoop.rimCenter.x * 0.4);
      this._desiredPos.set(
        THREE.MathUtils.clamp(midX, -10, 10),
        8.6,
        -(COURT.HALF_WIDTH + 9.5)
      );
      this._desiredTarget.set(focusX, 1.7, pp.z * 0.35);
    } else if (this.mode === 'follow') {
      // Over-the-shoulder behind the player.
      const yaw = facing + Math.PI + this.yawOffset;
      const pitch = 0.14 + this.pitchOffset;
      const dist = aiming ? 4.7 : 5.3;
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      this._desiredPos.copy(pp).addScaledVector(dir, dist);
      this._desiredPos.y += 1.15;
      this._desiredTarget.copy(pp).addScaledVector(fwd, aiming ? 4.2 : 2.6);
      this._desiredTarget.y += 1.55;
    } else { // action
      const yaw = facing + Math.PI * 0.82 + this.yawOffset;
      const pitch = 0.16 + this.pitchOffset;
      const dir = new THREE.Vector3(
        Math.sin(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.cos(yaw) * Math.cos(pitch)
      );
      this._desiredPos.copy(pp).addScaledVector(dir, 3.4);
      this._desiredPos.y += 1.5;
      this._desiredTarget.copy(pp).addScaledVector(fwd, 2.6);
      this._desiredTarget.y += 1.3;
    }

    const posL = this.mode === 'broadcast' ? 3.5 : 9;
    const tgtL = this.mode === 'broadcast' ? 4 : 11;
    this.pos.x = damp(this.pos.x, this._desiredPos.x, posL, dt);
    this.pos.y = damp(this.pos.y, this._desiredPos.y, posL, dt);
    this.pos.z = damp(this.pos.z, this._desiredPos.z, posL, dt);
    this.target.x = damp(this.target.x, this._desiredTarget.x, tgtL, dt);
    this.target.y = damp(this.target.y, this._desiredTarget.y, tgtL, dt);
    this.target.z = damp(this.target.z, this._desiredTarget.z, tgtL, dt);

    // camera shake decay
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const sh = this.shake * this.shake;
    const ox = (Math.random() - 0.5) * sh * 0.5;
    const oy = (Math.random() - 0.5) * sh * 0.5;

    this.camera.position.set(this.pos.x + ox, this.pos.y + oy, this.pos.z);
    this.camera.lookAt(this.target);
  }
}
