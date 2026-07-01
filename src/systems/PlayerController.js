import * as THREE from 'three';
import { PLAYER, BALL, SHOT, COURT } from '../config.js';

const clamp = THREE.MathUtils.clamp;
const damp = (a, b, l, dt) => a + (b - a) * (1 - Math.exp(-l * dt));

// Drives the human-controlled player: camera-relative movement, dribbling, and
// the charge→release shot flow. Owns possession of the ball while dribbling.
export class PlayerController {
  constructor({ player, ball, camera, shot, hoop, audio, state, hud, callbacks }) {
    this.player = player;
    this.ball = ball;
    this.camera = camera;
    this.shot = shot;
    this.hoop = hoop;
    this.audio = audio;
    this.state = state;
    this.hud = hud;
    this.cb = callbacks || {};

    this.vel = new THREE.Vector3();
    this.hasBall = true;
    this.phase = 'dribble';       // dribble | charge | shoot | chase
    this.meter = 0;
    this.shootT = -1;
    this.launched = false;
    this.power = 0;
    this.shotPending = false;
    this.shotPoints = 2;
    this.dribblePhase = 0;
    this.dribbleSide = 1;
    this.facing = 0;
    this.deadTimer = 0;
    this.resetTimer = 0;
    this.contest = 0;

    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._move = new THREE.Vector3();
    this._hold = new THREE.Vector3();
    this._rel = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  giveBall() {
    this.hasBall = true;
    this.phase = 'dribble';
    this.ball.held = true;
    this.ball.inFlight = false;
    this.meter = 0;
    this.shootT = -1;
    this.launched = false;
  }

  // Called by Game when the ball scores while a shot is pending.
  onScored() {
    if (this.shotPending) {
      this.state.registerShot(this.shotPoints, 'you');
      this.shotPending = false;
      if (this.cb.onShotResolved) this.cb.onShotResolved(true, this.shotPoints);
    }
    this.resetTimer = 1.2;        // give the ball back shortly
  }

  _resolveMiss() {
    if (this.shotPending) {
      this.state.registerShot(0, 'you');
      this.shotPending = false;
      if (this.cb.onShotResolved) this.cb.onShotResolved(false, 0);
    }
  }

  setContest(c) { this.contest = c; }

  update(dt, input) {
    this._camBasis();
    const axis = input.moveAxis();
    const wantMag = Math.hypot(axis.x, axis.y);

    // ---- Movement ----
    const charging = this.phase === 'charge' || this.phase === 'shoot';
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    let maxSpeed = sprint ? PLAYER.RUN_SPEED : PLAYER.WALK_SPEED;
    if (charging) maxSpeed *= 0.28;

    this._move.copy(this._right).multiplyScalar(axis.x)
      .addScaledVector(this._fwd, axis.y);
    if (this._move.lengthSq() > 1) this._move.normalize();

    const desired = this._move.multiplyScalar(maxSpeed);
    this.vel.x = damp(this.vel.x, desired.x, wantMag > 0.01 ? PLAYER.ACCEL / 8 : PLAYER.FRICTION, dt);
    this.vel.z = damp(this.vel.z, desired.z, wantMag > 0.01 ? PLAYER.ACCEL / 8 : PLAYER.FRICTION, dt);

    const p = this.player.position;
    p.x += this.vel.x * dt;
    p.z += this.vel.z * dt;
    // keep on/near the court
    p.x = clamp(p.x, -COURT.HALF_LENGTH - 0.5, COURT.HALF_LENGTH + 0.5);
    p.z = clamp(p.z, -COURT.HALF_WIDTH - 0.5, COURT.HALF_WIDTH + 0.5);

    const speed = Math.hypot(this.vel.x, this.vel.z);
    const speedN = clamp(speed / PLAYER.RUN_SPEED, 0, 1);

    // ---- Facing ----
    let faceTarget = this.facing;
    if (charging) {
      faceTarget = Math.atan2(this.hoop.rimCenter.x - p.x, this.hoop.rimCenter.z - p.z);
    } else if (speed > 0.4) {
      faceTarget = Math.atan2(this.vel.x, this.vel.z);
    }
    this.facing = this._dampAngle(this.facing, faceTarget, PLAYER.TURN_RATE, dt);
    this.player.facing = this.facing;

    // shoe squeak on sharp direction change at speed
    if (speed > 4 && Math.random() < dt * 1.2 && wantMag > 0.5) this.audio.squeak();

    // ---- Ball handling per phase ----
    if (this.hasBall) {
      this._handleShootInput(dt, input, speedN);
      this._updateHeldBall(dt, speedN);
    } else {
      // Let a shot's follow-through finish, then animate normally while chasing.
      if (this.phase === 'shoot') {
        this.shootT += dt / 0.30;
        if (this.shootT >= 1) { this.shootT = -1; this.phase = 'chase'; }
      }
      this._chase(dt);
    }

    // Give ball back after a made basket / dead ball.
    if (this.resetTimer > 0) {
      this.resetTimer -= dt;
      if (this.resetTimer <= 0 && !this.hasBall) this.giveBall();
    }

    // ---- Animate player ----
    let animState = 'dribble';
    if (this.phase === 'shoot' || this.phase === 'charge') animState = 'dribble';
    else if (!this.hasBall) animState = speedN > 0.15 ? 'run' : 'idle';
    else animState = speedN > 0.05 ? 'dribble' : 'dribble';

    this.player.update(dt, {
      state: animState,
      speed: speedN,
      moveMag: wantMag,
      facing: this.facing,
      shootT: this.shootT,
      dribblePhase: this.dribblePhase,
    });

    return { speed: speedN };
  }

  _handleShootInput(dt, input, speedN) {
    if (this.phase === 'dribble') {
      if (input.down('Space')) {
        this.phase = 'charge';
        this.meter = 0;
      }
    }

    if (this.phase === 'charge') {
      this.meter = clamp(this.meter + dt / SHOT.MAX_CHARGE, 0, 1);
      this.shootT = this.meter * 0.5;             // rise into the shot
      this.hud.showMeter(this.meter);
      if (!input.down('Space')) {
        // released
        if (this.meter < 0.12) {
          this.phase = 'dribble';                 // fake / cancel
          this.shootT = -1;
          this.hud.hideMeter();
        } else {
          this.power = this.meter;
          this.phase = 'shoot';
          this.launched = false;
          this.hud.hideMeter();
        }
      }
    }

    if (this.phase === 'shoot') {
      this.shootT += dt / 0.30;
      if (!this.launched && this.shootT >= 0.55) {
        this._launch(speedN);
      }
      if (this.shootT >= 1) {
        this.shootT = -1;
        if (this.hasBall) this.phase = 'dribble';
        else this.phase = 'chase';
      }
    }
  }

  _launch(speedN) {
    const rel = this.player.getReleasePoint(this._rel);
    this.ball.pos.copy(rel);
    const res = this.shot.computeLaunch(rel, this.hoop, this.power, {
      contest: this.contest,
      moving: speedN,
    });
    this.ball.vel.copy(res.velocity);
    this.ball.spin.copy(res.spin);
    this.ball.held = false;
    this.ball.inFlight = true;
    this.hasBall = false;
    this.launched = true;

    // classify 2 vs 3 from release location
    this.shotPoints = this._isThree(this.player.position) ? 3 : 2;
    this.shotPending = true;
    this.deadTimer = 0;

    if (this.cb.onShoot) this.cb.onShoot(res, this.shotPoints);
  }

  _isThree(pos) {
    const dx = pos.x - this.hoop.rimCenter.x;
    const dz = pos.z - this.hoop.rimCenter.z;
    const d = Math.hypot(dx, dz);
    const threshold = Math.abs(dz) >= COURT.THREE_SIDE_Z ? COURT.THREE_CORNER : COURT.THREE_RADIUS;
    return d >= threshold - 0.15;
  }

  _updateHeldBall(dt, speedN) {
    if (this.phase === 'charge' || this.phase === 'shoot') {
      // ball rides from the hold point up to the release point as shootT rises
      const t = clamp(this.shootT / 0.55, 0, 1);
      this.player.getHoldPoint(this._hold);
      this.player.getReleasePoint(this._rel);
      this.ball.pos.lerpVectors(this._hold, this._rel, t);
      this.ball.spin.multiplyScalar(0.9);
    } else {
      // dribble: bounce the ball beside/in front of the player
      const freq = 1.35 + speedN * 0.9;
      const prevPh = this.dribblePhase;
      this.dribblePhase += dt * freq * Math.PI * 2;
      const ph = (this.dribblePhase % (Math.PI * 2)) / (Math.PI * 2); // 0..1
      const u = 2 * ph - 1;
      const h = BALL.RADIUS + (PLAYER.DRIBBLE_HEIGHT - BALL.RADIUS) * (1 - u * u);
      this.player.getDribblePoint(this._tmp, this.dribbleSide);
      this.ball.pos.set(this._tmp.x, h, this._tmp.z);
      this.ball.spin.set(0, 6, 0);
      // bounce sound near the floor
      const crossed = Math.floor(this.dribblePhase / Math.PI) !== Math.floor(prevPh / Math.PI);
      if (crossed && Math.sin(this.dribblePhase) < 0) this.audio.bounce(3 + speedN * 3);
      // occasional crossover
    }
  }

  crossover() {
    if (this.hasBall && this.phase === 'dribble') {
      this.dribbleSide *= -1;
      this.audio.bounce(6);
      this.audio.squeak();
    }
  }

  _chase(dt) {
    // Ball is live. Allow rebound pickup when close and reachable.
    this.deadTimer += dt;
    const b = this.ball;
    const d = this._tmp.copy(b.pos).sub(this.player.position);
    d.y = 0;
    const dist = d.length();
    const reachable = b.pos.y < 1.7 && b.vel.length() < 9;
    if (dist < 1.15 && reachable && this.deadTimer > 0.35) {
      // rebound / regain
      this._resolveMiss();
      this.giveBall();
      if (this.cb.onRebound) this.cb.onRebound();
      return;
    }
    // out of bounds or settled → resolve and give back after a beat
    const oob = Math.abs(b.pos.x) > COURT.HALF_LENGTH + 1.6 ||
                Math.abs(b.pos.z) > COURT.HALF_WIDTH + 1.6;
    const settled = b.vel.length() < 0.5 && b.pos.y < BALL.RADIUS + 0.05;
    if ((oob || settled) && this.resetTimer <= 0) {
      this._resolveMiss();
      this.resetTimer = oob ? 0.6 : 1.4;
    }
  }

  _camBasis() {
    const cam = this.camera.camera;
    this._fwd.set(0, 0, 0);
    cam.getWorldDirection(this._fwd);
    this._fwd.y = 0;
    if (this._fwd.lengthSq() < 1e-4) this._fwd.set(0, 0, 1);
    this._fwd.normalize();
    this._right.set(this._fwd.z, 0, -this._fwd.x);
  }

  _dampAngle(a, b, l, dt) {
    let diff = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * (1 - Math.exp(-l * dt));
  }
}
