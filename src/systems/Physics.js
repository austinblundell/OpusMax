import * as THREE from 'three';
import { BALL, PHYSICS, HOOP, COURT } from '../config.js';

// Custom, tuned ball physics: gravity + drag, plus analytic collisions with the
// floor, both rims, and both backboards. Detects clean makes through the rim.
export class Physics {
  constructor() {
    this.hoops = [];
    this.scoringHoop = null;
    this._acc = 0;
    this._lastY = 0;
    this._scoredCooldown = 0;
    this._tmp = new THREE.Vector3();
    this._tmp2 = new THREE.Vector3();
  }

  setHoops(hoops, scoringHoop) {
    this.hoops = hoops;
    this.scoringHoop = scoringHoop;
  }

  // Advance the ball. Returns an array of physics events for this frame.
  update(ball, dt) {
    const events = [];
    if (ball.held) { this._lastY = ball.pos.y; return events; }
    this._scoredCooldown = Math.max(0, this._scoredCooldown - dt);

    this._acc += Math.min(dt, 0.05);
    const h = PHYSICS.FIXED_DT;
    let steps = 0;
    while (this._acc >= h && steps < PHYSICS.MAX_SUBSTEPS + 4) {
      this._substep(ball, h, events);
      this._acc -= h;
      steps++;
    }
    return events;
  }

  _substep(ball, dt, events) {
    const p = ball.pos, v = ball.vel;
    const prevY = p.y;

    // ---- Forces ----
    v.y += PHYSICS.GRAVITY * dt;
    // quadratic-ish air drag
    const speed = v.length();
    if (speed > 0.001) {
      const drag = BALL.AIR_DRAG * speed;
      this._tmp.copy(v).multiplyScalar(-drag * dt);
      v.add(this._tmp);
    }
    // Magnus-lite: backspin lifts slightly (visual sweetener)
    // (kept subtle so shots stay tunable)

    // integrate
    p.addScaledVector(v, dt);

    // ---- Floor ----
    if (p.y - ball.radius < 0) {
      p.y = ball.radius;
      if (v.y < 0) {
        const impact = -v.y;
        v.y = -v.y * BALL.RESTITUTION;
        // rolling friction on horizontal
        v.x *= (1 - BALL.ROLL_FRICTION * dt * 4);
        v.z *= (1 - BALL.ROLL_FRICTION * dt * 4);
        // spin from horizontal motion (roll)
        ball.spin.set(v.z * 8, ball.spin.y * 0.9, -v.x * 8);
        if (impact > 0.6) events.push({ type: 'floor', speed: impact });
        if (Math.abs(v.y) < 0.35) v.y = 0;
      }
      // settle
      if (Math.abs(v.y) < 0.05) {
        v.x *= (1 - BALL.ROLL_FRICTION * dt * 2.5);
        v.z *= (1 - BALL.ROLL_FRICTION * dt * 2.5);
      }
    }

    // ---- Hoops (rim + backboard) ----
    for (const hoop of this.hoops) {
      this._collideBackboard(ball, hoop, events);
      this._collideRim(ball, hoop, events);
    }

    // ---- Scoring ----
    const sh = this.scoringHoop;
    if (sh && this._scoredCooldown === 0) {
      const c = sh.rimCenter;
      const crossedDown = prevY > c.y + 0.02 && p.y <= c.y + 0.02;
      if (crossedDown && v.y < 0) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const horiz = Math.hypot(dx, dz);
        if (horiz < sh.rimRadius - ball.radius * 0.25) {
          this._scoredCooldown = 0.8;
          const clean = horiz < sh.rimRadius * 0.5;
          events.push({ type: 'score', clean, pos: p.clone() });
          sh.swish(clean ? 1.1 : 0.7, p.clone());
        }
      }
    }

    // spin decay in air
    ball.spin.multiplyScalar(1 - 0.4 * dt);

    this._lastY = p.y;
  }

  _collideRim(ball, hoop, events) {
    const c = hoop.rimCenter;
    const p = ball.pos;
    // nearest point on the rim circle (horizontal ring at c.y)
    this._tmp.set(p.x - c.x, 0, p.z - c.z);
    const horiz = this._tmp.length();
    if (horiz < 1e-4) return;
    this._tmp.multiplyScalar(hoop.rimRadius / horiz);
    const nearest = this._tmp2.set(c.x + this._tmp.x, c.y, c.z + this._tmp.z);
    const d = this._tmp.copy(p).sub(nearest);
    const dist = d.length();
    const minDist = ball.radius + HOOP.RIM_TUBE;
    if (dist < minDist && dist > 1e-5) {
      const n = d.multiplyScalar(1 / dist);
      // push out
      p.copy(nearest).addScaledVector(n, minDist);
      const vn = ball.vel.dot(n);
      if (vn < 0) {
        ball.vel.addScaledVector(n, -(1 + BALL.RIM_RESTITUTION) * vn);
        // tangential damping — rim grabs a bit
        ball.vel.multiplyScalar(0.86);
        const sp = Math.min(6, Math.abs(vn));
        if (sp > 0.4) events.push({ type: 'rim', speed: sp });
        hoop.swish(0.35, p.clone());
      }
    }
  }

  _collideBackboard(ball, hoop, events) {
    const p = ball.pos, v = ball.vel;
    const s = hoop.side;
    const bx = hoop.backboardX;
    const by = hoop.backboardY !== undefined ? hoop.backboardY : HOOP.RIM_HEIGHT + HOOP.BACKBOARD_H / 2 - 0.15;
    const halfW = HOOP.BACKBOARD_W / 2;
    const halfH = HOOP.BACKBOARD_H / 2;
    // board face is on the court side of bx (court side is toward origin => sign -s)
    const faceX = bx - s * 0.03;
    const withinZ = Math.abs(p.z) < halfW + ball.radius;
    const withinY = Math.abs(p.y - by) < halfH + ball.radius;
    if (!withinZ || !withinY) return;
    // penetration test: ball crossing the face from the court side
    const rel = (p.x - faceX) * s;   // >0 means behind the board (toward baseline)
    if (rel > -ball.radius && rel < ball.radius) {
      if (v.x * s > 0) {  // moving toward/into the board
        p.x = faceX - s * ball.radius;
        v.x = -v.x * BALL.BACKBOARD_RESTITUTION;
        v.y *= 0.92; v.z *= 0.92;
        const sp = Math.min(6, Math.abs(v.x) + 1);
        events.push({ type: 'backboard', speed: sp });
      }
    }
  }
}
