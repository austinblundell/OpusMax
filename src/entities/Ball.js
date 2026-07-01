import * as THREE from 'three';
import { BALL, COLORS } from '../config.js';

// The basketball: textured sphere plus kinematic state (position, velocity,
// spin). Physics integration lives in systems/Physics.js; this owns rendering
// and visual spin.
export class Ball {
  constructor() {
    this.pos = new THREE.Vector3(0, BALL.RADIUS, 0);
    this.vel = new THREE.Vector3();
    this.spin = new THREE.Vector3(); // angular velocity (rad/s) for visuals
    this.radius = BALL.RADIUS;
    this.held = true;                // attached to a player's hand
    this.inFlight = false;
    this.lastShot = null;            // metadata about the current shot

    const tex = this._bakeTexture();
    const bump = this._bakeBump();
    const mat = new THREE.MeshStandardMaterial({
      map: tex,
      bumpMap: bump,
      bumpScale: 0.006,
      roughness: 0.78,
      metalness: 0.02,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL.RADIUS, 48, 32), mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = false;

    // Contact shadow blob under the ball (cheap, always readable).
    const shadowTex = this._blobTexture();
    this.blob = new THREE.Mesh(
      new THREE.PlaneGeometry(BALL.RADIUS * 4, BALL.RADIUS * 4),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
    );
    this.blob.rotation.x = -Math.PI / 2;

    this._q = new THREE.Quaternion();
    this._axis = new THREE.Vector3();
  }

  _bakeTexture() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 512;
    const ctx = cv.getContext('2d');
    // base orange gradient for a little shading
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#e0742f');
    g.addColorStop(0.5, '#cf5f27');
    g.addColorStop(1, '#b94e1f');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);

    // pebbling speckle
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 1024, y = Math.random() * 512;
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '90,45,15' : '230,150,90'},0.05)`;
      ctx.fillRect(x, y, 2, 2);
    }

    // seams (black). U = longitude, V = latitude.
    ctx.strokeStyle = '#140b05';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    // equator
    ctx.beginPath(); ctx.moveTo(0, 256); ctx.lineTo(1024, 256); ctx.stroke();
    // two vertical meridians
    for (const u of [256, 768]) {
      ctx.beginPath(); ctx.moveTo(u, 0); ctx.lineTo(u, 512); ctx.stroke();
    }
    // two bowed curves for the classic look
    for (const dir of [1, -1]) {
      ctx.beginPath();
      for (let x = 0; x <= 1024; x += 8) {
        const y = 256 + dir * Math.sin((x / 1024) * Math.PI * 2) * 150;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  _bakeBump() {
    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 16000; i++) {
      const v = 128 + (Math.random() - 0.5) * 120;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 1.5, 1.5);
    }
    const tex = new THREE.CanvasTexture(cv);
    return tex;
  }

  _blobTexture() {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(cv);
  }

  addToScene(scene) {
    scene.add(this.mesh);
    scene.add(this.blob);
  }

  // Apply spin to the mesh orientation and sync transform.
  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    const s = this.spin.length();
    if (s > 0.0001) {
      this._axis.copy(this.spin).normalize();
      this._q.setFromAxisAngle(this._axis, s * dt);
      this.mesh.quaternion.premultiply(this._q);
    }
    // contact shadow follows, fading with height
    this.blob.position.set(this.pos.x, 0.012, this.pos.z);
    const h = Math.max(0, this.pos.y - this.radius);
    const k = THREE.MathUtils.clamp(1 - h / 4, 0.08, 1);
    this.blob.material.opacity = 0.5 * k;
    const sc = 1 + h * 0.35;
    this.blob.scale.set(sc, sc, sc);
  }
}
