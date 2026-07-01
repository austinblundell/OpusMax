import * as THREE from 'three';
import { SHOT, PHYSICS, BALL } from '../config.js';

// Turns a charged shot into a launch velocity. A ballistic solve aims the ball
// at the rim; release timing, distance, movement and defender contest perturb
// the aim point so the custom physics decides swish / rim-in / brick.
export class ShotSystem {
  constructor() {
    this._up = new THREE.Vector3(0, 1, 0);
    this._dir = new THREE.Vector3();
    this._perp = new THREE.Vector3();
    this._target = new THREE.Vector3();
  }

  // Meter center of the "green" release window.
  get perfectCenter() { return (SHOT.PERFECT_LO + SHOT.PERFECT_HI) / 2; }

  // power: 0..1 release value. Returns {velocity, spin, quality, distance}.
  computeLaunch(fromPos, hoop, power, opts = {}) {
    const contest = opts.contest || 0;
    const moving = opts.moving || 0;
    const T0 = hoop.rimCenter;

    this._dir.set(T0.x - fromPos.x, 0, T0.z - fromPos.z);
    const dist = this._dir.length() || 0.001;
    this._dir.multiplyScalar(1 / dist);
    this._perp.crossVectors(this._up, this._dir).normalize();

    const center = this.perfectCenter;
    const dev = power - center;                 // <0 short, >0 long
    const inGreen = Math.abs(dev) <= (SHOT.PERFECT_HI - SHOT.PERFECT_LO) / 2;

    // How far past comfortable range (adds unavoidable spread)
    const rangeFactor = Math.max(0, dist - SHOT.MAX_RANGE) * 0.25 +
                        Math.max(0, dist - 6.5) * 0.03;

    // Depth error (short/long) driven mostly by release timing.
    let depthErr = dev * (1.8 + dist * 0.18);
    // Lateral error grows with mistiming, contest, movement, and long range.
    const spread = (inGreen ? 0.0 : (Math.abs(dev) - 0.06) * (1.6 + dist * 0.12)) +
                   contest * (0.35 + dist * 0.05) +
                   moving * 0.18 +
                   rangeFactor;
    const lateralErr = this._rand() * spread;
    depthErr += this._rand() * spread * 0.6;

    // Small favorable bias: perfect release from range still centers the rim.
    if (inGreen) depthErr += -0.02;             // aim a hair deep = soft swish

    // Build perturbed target
    this._target.copy(T0)
      .addScaledVector(this._dir, depthErr)
      .addScaledVector(this._perp, lateralErr);

    const velocity = this._solveArc(fromPos, this._target, dist);

    // Backspin for realism (top of ball rolls back toward shooter)
    const spin = this._perp.clone().multiplyScalar(-26 - dist * 1.2);

    let quality = 'brick';
    const err = Math.hypot(depthErr, lateralErr);
    if (inGreen && err < 0.14) quality = 'perfect';
    else if (err < 0.28) quality = 'good';

    return { velocity, spin, quality, distance: dist, inGreen };
  }

  _rand() { return (Math.random() * 2 - 1); }

  // Solve launch velocity from R to target with a distance-scaled arc.
  _solveArc(R, T, dist) {
    const dirx = T.x - R.x, dirz = T.z - R.z;
    const horiz = Math.hypot(dirx, dirz) || 0.001;
    const dy = T.y - R.y;
    const g = -PHYSICS.GRAVITY;

    // Higher arc as distance grows; clamp to sane range.
    let theta = THREE.MathUtils.degToRad(
      THREE.MathUtils.clamp(49 + (dist - 2) * 1.0, 46, 60)
    );

    // Ensure a real solution (denominator positive); raise arc if needed.
    let v2, tries = 0;
    do {
      const c = Math.cos(theta), t = Math.tan(theta);
      const denom = 2 * c * c * (horiz * t - dy);
      v2 = denom > 0.0001 ? (g * horiz * horiz) / denom : -1;
      if (v2 <= 0) theta += THREE.MathUtils.degToRad(2);
      tries++;
    } while (v2 <= 0 && tries < 12);

    // Compensate for the small residual air drag the ballistic solve ignores,
    // so a well-timed shot actually reaches the rim instead of falling short.
    const comp = 1 + 0.007 * horiz;
    const v = Math.sqrt(Math.max(v2, 1)) * comp;
    const c = Math.cos(theta), s = Math.sin(theta);
    const nx = dirx / horiz, nz = dirz / horiz;
    return new THREE.Vector3(nx * v * c, v * s, nz * v * c);
  }
}
