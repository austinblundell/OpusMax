import * as THREE from 'three';
import { PLAYER, COURT } from '../config.js';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// A CPU defender for 1-on-1: holds position between the handler and the rim,
// contests shots (feeding a contest factor to the human controller) and can
// snag putbacks off misses.
export class Defender {
  constructor(player, hoop) {
    this.player = player;
    this.hoop = hoop;
    this.vel = new THREE.Vector3();
    this.facing = 0;
    this.reach = 0;
    this._target = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this.active = false;
  }

  reset() {
    this.player.setPosition(this.hoop.rimCenter.x - 3, 0);
    this.vel.set(0, 0, 0);
  }

  // handler: the human Player; controller: PlayerController (for contest + phase)
  update(dt, handler, controller) {
    const hp = handler.position;
    const dp = this.player.position;
    const rim = this.hoop.rimCenter;

    // Desired spot: between handler and rim, ~1.7m off the handler.
    this._tmp.set(rim.x - hp.x, 0, rim.z - hp.z);
    const toRim = this._tmp.length() || 1;
    this._tmp.multiplyScalar(1 / toRim);
    const standoff = 1.7;
    this._target.set(hp.x + this._tmp.x * standoff, 0, hp.z + this._tmp.z * standoff);

    // Add slight lateral jitter so it can be beaten off the dribble.
    const charging = controller.phase === 'charge' || controller.phase === 'shoot';
    const maxSpeed = charging ? PLAYER.RUN_SPEED * 0.5 : PLAYER.RUN_SPEED * 0.86;

    const dvx = this._target.x - dp.x;
    const dvz = this._target.z - dp.z;
    const dd = Math.hypot(dvx, dvz);
    let desiredX = 0, desiredZ = 0;
    if (dd > 0.05) {
      desiredX = (dvx / dd) * Math.min(maxSpeed, dd * 4);
      desiredZ = (dvz / dd) * Math.min(maxSpeed, dd * 4);
    }
    this.vel.x = damp(this.vel.x, desiredX, 8, dt);
    this.vel.z = damp(this.vel.z, desiredZ, 8, dt);
    dp.x = clamp(dp.x + this.vel.x * dt, -COURT.HALF_LENGTH, COURT.HALF_LENGTH);
    dp.z = clamp(dp.z + this.vel.z * dt, -COURT.HALF_WIDTH, COURT.HALF_WIDTH);

    // Face the handler.
    const faceTarget = Math.atan2(hp.x - dp.x, hp.z - dp.z);
    this.facing = this._dampAngle(this.facing, faceTarget, 10, dt);

    // Contest: closer + handler shooting => stronger contest.
    const distToHandler = Math.hypot(hp.x - dp.x, hp.z - dp.z);
    const contest = charging ? clamp(1 - (distToHandler - 0.4) / 2.0, 0, 1) : 0;
    controller.setContest(contest);
    this.reach = damp(this.reach, charging ? contest : 0, 12, dt);

    const speedN = clamp(Math.hypot(this.vel.x, this.vel.z) / PLAYER.RUN_SPEED, 0, 1);
    const state = charging ? 'defense' : (speedN > 0.15 ? 'run' : 'defense');
    this.player.update(dt, {
      state,
      speed: speedN,
      facing: this.facing,
      defendReach: this.reach,
    });
  }

  // On a human miss, decide whether the CPU grabs the board and scores.
  tryPutback(ball) {
    const dp = this.player.position;
    const dist = Math.hypot(ball.pos.x - dp.x, ball.pos.z - dp.z);
    const close = dist < 3.2;
    if (close && Math.random() < 0.5) {
      // got the rebound; putback goes in ~55%
      return Math.random() < 0.55 ? 2 : 0;
    }
    return -1; // did not secure the board
  }

  _dampAngle(a, b, l, dt) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * (1 - Math.exp(-l * dt));
  }
}
