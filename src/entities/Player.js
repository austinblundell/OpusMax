import * as THREE from 'three';

const lerp = THREE.MathUtils.lerp;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

// An articulated basketball player built from capsule primitives on a joint
// hierarchy, animated procedurally (idle / run / dribble / shoot / defend).
export class Player {
  constructor({ jersey = 0x1666c4, shorts = 0x0f2f6b, accent = 0xffffff, skin = 0x8d5a3b, number = 24 } = {}) {
    this.root = new THREE.Group();
    this.facing = 0;              // yaw, radians
    this.number = number;

    this.mats = {
      skin: new THREE.MeshStandardMaterial({ color: skin, roughness: 0.7 }),
      jersey: new THREE.MeshStandardMaterial({ color: jersey, roughness: 0.6 }),
      shorts: new THREE.MeshStandardMaterial({ color: shorts, roughness: 0.6 }),
      shoe: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4 }),
      accent: new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5 }),
      hair: new THREE.MeshStandardMaterial({ color: 0x120d0a, roughness: 0.8 }),
    };

    this.j = {};                 // joint pivots
    this._targets = {};          // target euler per joint
    this._cur = {};              // current smoothed euler
    this._build();

    this.state = 'idle';
    this.runPhase = 0;
    this.dribblePhase = 0;
    this.idlePhase = Math.random() * 10;
    this.shootT = -1;            // -1 = not shooting; 0..1 progress
    this.bob = 0;
    this._v = new THREE.Vector3();
  }

  _limb(parent, radius, length, mat, pivotPos) {
    const grp = new THREE.Group();
    grp.position.set(...pivotPos);
    const geo = new THREE.CapsuleGeometry(radius, Math.max(0.001, length - radius * 1.2), 4, 10);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = -length / 2;
    mesh.castShadow = true;
    grp.add(mesh);
    parent.add(grp);
    return grp;
  }

  _build() {
    const S = 1.0;
    // Root -> hips
    const hips = new THREE.Group();
    hips.position.y = 0.92 * S;
    this.root.add(hips);
    this.j.hips = hips;

    // Pelvis / shorts
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.16, 4, 10), this.mats.shorts);
    pelvis.scale.set(1.25, 1, 0.8);
    pelvis.castShadow = true;
    hips.add(pelvis);

    // Spine (leans) with torso mesh
    const spine = new THREE.Group();
    hips.add(spine);
    this.j.spine = spine;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.34, 4, 12), this.mats.jersey);
    torso.scale.set(1.15, 1, 0.75);
    torso.position.y = 0.3;
    torso.castShadow = true;
    spine.add(torso);
    // jersey number panel
    const num = this._numberTexture(this.number);
    const numMat = new THREE.MeshStandardMaterial({ map: num, transparent: true, roughness: 0.6 });
    const numPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), numMat);
    numPlane.position.set(0, 0.34, -0.16);
    numPlane.rotation.y = Math.PI;
    spine.add(numPlane);

    // Chest anchor (top of torso)
    const chest = new THREE.Group();
    chest.position.y = 0.5;
    spine.add(chest);
    this.j.chest = chest;

    // Neck + head
    const neck = new THREE.Group();
    neck.position.y = 0.04;
    chest.add(neck);
    this.j.neck = neck;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.mats.skin);
    head.scale.set(0.92, 1.05, 0.95);
    head.position.y = 0.16;
    head.castShadow = true;
    neck.add(head);
    // hair cap
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.135, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), this.mats.hair);
    hair.position.y = 0.17;
    neck.add(hair);
    // headband accent
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.02, 8, 20), this.mats.accent);
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.13;
    neck.add(band);

    // Arms
    const armR = 0.05;
    this.j.shoulderL = this._limb(chest, armR, 0.30, this.mats.skin, [0.24, 0.02, 0]);
    this.j.elbowL = this._limb(this.j.shoulderL, armR * 0.92, 0.28, this.mats.skin, [0, -0.30, 0]);
    this.j.handL = this._makeHand(this.j.elbowL, [0, -0.28, 0]);

    this.j.shoulderR = this._limb(chest, armR, 0.30, this.mats.skin, [-0.24, 0.02, 0]);
    this.j.elbowR = this._limb(this.j.shoulderR, armR * 0.92, 0.28, this.mats.skin, [0, -0.30, 0]);
    this.j.handR = this._makeHand(this.j.elbowR, [0, -0.28, 0]);

    // Legs
    const legR = 0.075;
    this.j.thighL = this._limb(hips, legR, 0.48, this.mats.skin, [0.11, -0.05, 0]);
    this.j.kneeL = this._limb(this.j.thighL, legR * 0.85, 0.45, this.mats.skin, [0, -0.48, 0]);
    this.j.footL = this._makeFoot(this.j.kneeL, [0, -0.45, 0]);
    // shorts overlay on thighs
    const shortL = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.16, 4, 10), this.mats.shorts);
    shortL.position.y = -0.14; this.j.thighL.add(shortL);

    this.j.thighR = this._limb(hips, legR, 0.48, this.mats.skin, [-0.11, -0.05, 0]);
    this.j.kneeR = this._limb(this.j.thighR, legR * 0.85, 0.45, this.mats.skin, [0, -0.48, 0]);
    this.j.footR = this._makeFoot(this.j.kneeR, [0, -0.45, 0]);
    const shortR = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.16, 4, 10), this.mats.shorts);
    shortR.position.y = -0.14; this.j.thighR.add(shortR);

    // init smoothing stores
    for (const k of Object.keys(this.j)) {
      this._cur[k] = new THREE.Vector3(0, 0, 0);
      this._targets[k] = new THREE.Vector3(0, 0, 0);
    }
  }

  _makeHand(parent, pos) {
    const grp = new THREE.Group();
    grp.position.set(...pos);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), this.mats.skin);
    hand.scale.set(1, 0.8, 1.2);
    hand.castShadow = true;
    grp.add(hand);
    parent.add(grp);
    return grp;
  }

  _makeFoot(parent, pos) {
    const grp = new THREE.Group();
    grp.position.set(...pos);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.12, 4, 8), this.mats.shoe);
    shoe.rotation.z = Math.PI / 2;
    shoe.position.set(0, -0.03, 0.06);
    shoe.scale.set(1, 1, 1.5);
    shoe.castShadow = true;
    grp.add(shoe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.03, 0.24), this.mats.accent);
    sole.position.set(0, -0.07, 0.06);
    grp.add(sole);
    parent.add(grp);
    return grp;
  }

  _numberTexture(n) {
    const cv = document.createElement('canvas');
    cv.width = 128; cv.height = 128;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 84px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 64, 68);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  addToScene(scene) { scene.add(this.root); }

  setPosition(x, z) { this.root.position.x = x; this.root.position.z = z; }
  get position() { return this.root.position; }

  // World position of the shooting hand's release point (above head, forward).
  getReleasePoint(out = new THREE.Vector3()) {
    out.set(0, 2.15, 0.28);
    out.applyEuler(new THREE.Euler(0, this.facing, 0));
    return out.add(this.root.position);
  }
  getHoldPoint(out = new THREE.Vector3()) {
    out.set(0.12, 1.4, 0.22);
    out.applyEuler(new THREE.Euler(0, this.facing, 0));
    return out.add(this.root.position);
  }
  getDribblePoint(out = new THREE.Vector3(), side = 1) {
    out.set(0.34 * side, 0, 0.34);
    out.applyEuler(new THREE.Euler(0, this.facing, 0));
    return out.add(this.root.position);
  }

  // ---- Pose computation ----
  _setTarget(joint, x = 0, y = 0, z = 0) {
    const t = this._targets[joint];
    if (t) t.set(x, y, z);
  }

  update(dt, params = {}) {
    const { state = 'idle', speed = 0, moveMag = 0, shootT = -1, defendReach = 0 } = params;
    this.state = state;
    this.facing = params.facing !== undefined ? params.facing : this.facing;
    this.root.rotation.y = this.facing;

    // advance clocks
    this.runPhase += dt * lerp(7, 13, speed);
    this.idlePhase += dt;
    this.dribblePhase = params.dribblePhase !== undefined ? params.dribblePhase : this.dribblePhase + dt * 8;

    // default relaxed pose
    this._setTarget('spine', 0.02, 0, 0);
    this._setTarget('chest', 0, 0, 0);
    this._setTarget('neck', 0, 0, 0);
    this._setTarget('shoulderL', 0.1, 0, 0.16);
    this._setTarget('elbowL', 0.25, 0, 0);
    this._setTarget('shoulderR', 0.1, 0, -0.16);
    this._setTarget('elbowR', 0.25, 0, 0);
    this._setTarget('thighL', 0, 0, 0);
    this._setTarget('kneeL', 0.05, 0, 0);
    this._setTarget('thighR', 0, 0, 0);
    this._setTarget('kneeR', 0.05, 0, 0);
    this._setTarget('footL', 0, 0, 0);
    this._setTarget('footR', 0, 0, 0);

    let targetBob = 0;

    if (shootT >= 0) {
      this._poseShoot(shootT);
      targetBob = 0.02;
    } else if (state === 'run') {
      targetBob = this._poseRun(speed);
    } else if (state === 'dribble') {
      targetBob = this._poseDribble(speed);
    } else if (state === 'defense') {
      this._poseDefense(defendReach);
    } else {
      this._poseIdle();
    }

    // smooth bob
    this.bob = damp(this.bob, targetBob, 14, dt);
    this.root.position.y = this.bob;

    // smooth all joints toward targets and apply
    const rate = 16;
    for (const k of Object.keys(this.j)) {
      const cur = this._cur[k], tgt = this._targets[k];
      cur.x = damp(cur.x, tgt.x, rate, dt);
      cur.y = damp(cur.y, tgt.y, rate, dt);
      cur.z = damp(cur.z, tgt.z, rate, dt);
      this.j[k].rotation.set(cur.x, cur.y, cur.z);
    }
  }

  _poseIdle() {
    const s = Math.sin(this.idlePhase * 1.4);
    this._setTarget('spine', 0.04 + s * 0.01, Math.sin(this.idlePhase * 0.6) * 0.03, 0);
    this._setTarget('shoulderL', 0.12 + s * 0.03, 0, 0.15);
    this._setTarget('shoulderR', 0.12 - s * 0.03, 0, -0.15);
    this._setTarget('neck', s * 0.02, Math.sin(this.idlePhase * 0.5) * 0.1, 0);
  }

  _poseRun(speed) {
    const p = this.runPhase;
    const sw = lerp(0.4, 1.15, speed);       // stride amplitude
    const legL = Math.sin(p), legR = Math.sin(p + Math.PI);
    this._setTarget('thighL', legL * sw, 0, 0);
    this._setTarget('kneeL', Math.max(0.05, -legL * 0.9 + 0.5), 0, 0);
    this._setTarget('thighR', legR * sw, 0, 0);
    this._setTarget('kneeR', Math.max(0.05, -legR * 0.9 + 0.5), 0, 0);
    this._setTarget('footL', legL * 0.3, 0, 0);
    this._setTarget('footR', legR * 0.3, 0, 0);
    // arms opposite
    this._setTarget('shoulderL', -legL * sw * 0.7, 0, 0.12);
    this._setTarget('elbowL', 0.7, 0, 0);
    this._setTarget('shoulderR', -legR * sw * 0.7, 0, -0.12);
    this._setTarget('elbowR', 0.7, 0, 0);
    // forward lean + counter-rotation
    this._setTarget('spine', lerp(0.06, 0.28, speed), 0, 0);
    this._setTarget('chest', 0, Math.sin(p) * 0.12, 0);
    return Math.abs(Math.sin(p * 2)) * lerp(0.02, 0.09, speed);
  }

  _poseDribble(speed) {
    // run-ish legs but the right arm pumps a dribble
    const bob = this._poseRun(Math.max(0.25, speed));
    const d = Math.sin(this.dribblePhase);
    // right arm reaches down-forward to push ball
    this._setTarget('shoulderR', 0.55 + d * 0.35, 0.2, -0.1);
    this._setTarget('elbowR', 0.5 + d * 0.4, 0, 0);
    // left arm guards
    this._setTarget('shoulderL', 0.35, 0, 0.5);
    this._setTarget('elbowL', 1.0, 0, 0);
    this._setTarget('spine', 0.16, 0, 0.05);
    return bob * 0.7;
  }

  _poseDefense(reach) {
    this._setTarget('spine', 0.18, 0, 0);
    this._setTarget('thighL', 0.5, 0, 0.18);
    this._setTarget('kneeL', 0.8, 0, 0);
    this._setTarget('thighR', 0.5, 0, -0.18);
    this._setTarget('kneeR', 0.8, 0, 0);
    const a = 0.4 + reach * 0.6;
    this._setTarget('shoulderL', -0.2, 0, 1.15 * a);
    this._setTarget('elbowL', 0.2, 0, 0);
    this._setTarget('shoulderR', -0.2, 0, -1.15 * a);
    this._setTarget('elbowR', 0.2, 0, 0);
    const sway = Math.sin(this.idlePhase * 3) * 0.05;
    this._setTarget('chest', 0, sway, 0);
  }

  // shotT: 0 (gather) -> ~0.6 (release) -> 1 (follow-through)
  _poseShoot(t) {
    if (t < 0.55) {
      // gather + rise
      const k = t / 0.55;
      const crouch = Math.sin(k * Math.PI) * 0.5;   // dip then extend
      this._setTarget('thighL', 0.2 + crouch, 0, 0.05);
      this._setTarget('kneeL', 0.3 + crouch * 1.2, 0, 0);
      this._setTarget('thighR', 0.2 + crouch, 0, -0.05);
      this._setTarget('kneeR', 0.3 + crouch * 1.2, 0, 0);
      // bring ball up on the right
      const raise = lerp(0.4, -2.4, k);
      this._setTarget('shoulderR', raise, 0, -0.1);
      this._setTarget('elbowR', lerp(1.4, 0.35, k), 0, 0);
      this._setTarget('shoulderL', lerp(0.3, -1.6, k), 0, 0.5);
      this._setTarget('elbowL', lerp(1.0, 0.6, k), 0, 0.3);
      this._setTarget('spine', lerp(0.18, 0.0, k), 0, 0);
    } else {
      // release + follow-through
      const k = (t - 0.55) / 0.45;
      this._setTarget('thighL', lerp(0.2, -0.05, k), 0, 0.05);
      this._setTarget('kneeL', lerp(0.5, 0.05, k), 0, 0);
      this._setTarget('thighR', lerp(0.2, -0.05, k), 0, -0.05);
      this._setTarget('kneeR', lerp(0.5, 0.05, k), 0, 0);
      // snap wrist / extend arm fully up and slightly forward
      this._setTarget('shoulderR', lerp(-2.4, -2.7, k), 0, -0.05);
      this._setTarget('elbowR', lerp(0.35, 0.05, k), 0, 0);
      this._setTarget('shoulderL', lerp(-1.6, -1.0, k), 0, 0.4);
      this._setTarget('elbowL', 0.5, 0, 0.3);
      this._setTarget('spine', lerp(0, -0.05, k), 0, 0);
    }
  }
}
