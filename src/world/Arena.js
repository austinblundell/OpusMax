import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { COURT, COLORS } from '../config.js';

// The arena bowl: raked seating decks, a lively instanced crowd, courtside LED
// boards, a hanging jumbotron, and a truss ceiling. Built once, mostly static.
export class Arena {
  constructor(scene) {
    this.group = new THREE.Group();
    this.scene = scene;
    this._time = 0;

    this._buildBackground(scene);
    this._buildDecks();
    this._buildCrowd();
    this._buildLedBoards();
    this._buildJumbotron();
    this._buildCeiling();

    scene.add(this.group);
  }

  _buildBackground(scene) {
    scene.background = new THREE.Color(0x05070d);
    scene.fog = new THREE.Fog(0x05070d, 45, 120);
  }

  // Four sloped concrete decks surrounding the court.
  _buildDecks() {
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x161b28, roughness: 0.95 });
    const offset = 2.4;      // courtside gap
    const depth = 15.5;      // horizontal run of the deck
    const rise = 7.8;
    const rake = Math.atan2(rise, depth);
    const slope = Math.hypot(depth, rise);

    const mk = (lenX, lenZ, rotX, rotY, pos) => {
      const g = new THREE.BoxGeometry(lenX, 0.4, lenZ);
      const m = new THREE.Mesh(g, deckMat);
      m.rotation.set(rotX, rotY, 0);
      m.position.copy(pos);
      m.receiveShadow = true;
      this.group.add(m);
    };

    const longLen = COURT.LENGTH + 2 * (offset + depth);
    // +Z and -Z long sides
    for (const s of [1, -1]) {
      const nearZ = s * (COURT.HALF_WIDTH + offset);
      const cz = nearZ + s * Math.cos(rake) * slope / 2;
      const cy = Math.sin(rake) * slope / 2 + 0.2;
      mk(longLen, slope, -s * rake, 0, new THREE.Vector3(0, cy, cz));
    }
    // +X and -X end sides
    const endLen = COURT.WIDTH + 2 * (offset + depth);
    for (const s of [1, -1]) {
      const nearX = s * (COURT.HALF_LENGTH + offset);
      const cx = nearX + s * Math.cos(rake) * slope / 2;
      const cy = Math.sin(rake) * slope / 2 + 0.2;
      const g = new THREE.BoxGeometry(slope, 0.4, endLen);
      const m = new THREE.Mesh(g, deckMat);
      m.rotation.set(0, 0, s * rake);
      m.position.set(cx, cy, 0);
      m.receiveShadow = true;
      this.group.add(m);
    }

    // Facade wall behind the top row
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0f18, roughness: 1 });
    const wallH = 6;
    const ringX = COURT.HALF_LENGTH + offset + depth + 1;
    const ringZ = COURT.HALF_WIDTH + offset + depth + 1;
    const wallY = rise + wallH / 2;
    const addWall = (w, rotY, pos) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, 0.5), wallMat);
      m.rotation.y = rotY; m.position.copy(pos); this.group.add(m);
    };
    addWall(ringX * 2, 0, new THREE.Vector3(0, wallY, ringZ));
    addWall(ringX * 2, 0, new THREE.Vector3(0, wallY, -ringZ));
    addWall(ringZ * 2, Math.PI / 2, new THREE.Vector3(ringX, wallY, 0));
    addWall(ringZ * 2, Math.PI / 2, new THREE.Vector3(-ringX, wallY, 0));
  }

  // Thousands of spectators via a single InstancedMesh.
  _buildCrowd() {
    // Merge a torso + head into one low-poly spectator.
    const torso = new THREE.CylinderGeometry(0.17, 0.22, 0.55, 6);
    torso.translate(0, 0.27, 0);
    const head = new THREE.SphereGeometry(0.12, 8, 6);
    head.translate(0, 0.66, 0);
    const geo = mergeGeometries([torso, head]);

    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });

    const transforms = [];
    const colors = [];
    const dummy = new THREE.Object3D();
    const palette = COLORS.crowd;

    const offset = 2.4, rowDepth = 0.85, rowRise = 0.42, seatGap = 0.62, rows = 17;

    const placeRow = (side, axis) => {
      for (let r = 0; r < rows; r++) {
        const dep = offset + r * rowDepth + 0.5;
        const y = 0.4 + r * rowRise;
        if (axis === 'x') {
          const z = side * (COURT.HALF_WIDTH + dep);
          const span = COURT.LENGTH + 2 * (offset + r * rowDepth);
          const n = Math.floor(span / seatGap);
          for (let i = 0; i < n; i++) {
            if (Math.random() < 0.08) continue; // empty seats
            const x = -span / 2 + i * seatGap + (Math.random() - 0.5) * 0.12;
            addPerson(x, y, z + (Math.random() - 0.5) * 0.12, -side);
          }
        } else {
          const x = side * (COURT.HALF_LENGTH + dep);
          const span = COURT.WIDTH + 2 * (offset + r * rowDepth);
          const n = Math.floor(span / seatGap);
          for (let i = 0; i < n; i++) {
            if (Math.random() < 0.08) continue;
            const z = -span / 2 + i * seatGap + (Math.random() - 0.5) * 0.12;
            addPerson(x + (Math.random() - 0.5) * 0.12, y, z, 0, -side);
          }
        }
      }
    };

    function addPerson(x, y, z, faceZ = 0, faceX = 0) {
      dummy.position.set(x, y, z);
      dummy.rotation.y = Math.atan2(faceX, faceZ || 0.0001) + (Math.random() - 0.5) * 0.5;
      const sc = 0.9 + Math.random() * 0.35;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      transforms.push(dummy.matrix.clone());
      const c = new THREE.Color(palette[(Math.random() * palette.length) | 0]);
      // vary brightness a bit
      c.multiplyScalar(0.7 + Math.random() * 0.6);
      colors.push(c);
    }

    placeRow(1, 'x'); placeRow(-1, 'x');
    placeRow(1, 'z'); placeRow(-1, 'z');

    const count = transforms.length;
    this.crowd = new THREE.InstancedMesh(geo, mat, count);
    this.crowd.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      this.crowd.setMatrixAt(i, transforms[i]);
      this.crowd.setColorAt(i, colors[i]);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
    this.crowd.castShadow = false;
    this.crowd.receiveShadow = false;
    this.group.add(this.crowd);

    // store base transforms + phases for subtle idle sway
    this._crowdBase = transforms;
    this._crowdPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) this._crowdPhase[i] = Math.random() * Math.PI * 2;
    this._crowdCount = count;
    this._dummy = new THREE.Object3D();
    this._excite = 0;
  }

  _buildLedBoards() {
    // Emissive courtside advertising ring — picks up bloom nicely.
    const makeBoard = (text, color) => {
      const cv = document.createElement('canvas');
      cv.width = 1024; cv.height = 128;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#04060a'; ctx.fillRect(0, 0, 1024, 128);
      ctx.fillStyle = color;
      ctx.font = '900 74px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) ctx.fillText(text, 170 + i * 340, 64);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      return new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    };
    const texts = [['OPUSMAX', '#ff8a2a'], ['HOOPS 25', '#37c0ff'], ['COURTSIDE', '#ffd23a']];
    const h = 0.9;
    const y = 0.55;
    const zEdge = COURT.HALF_WIDTH + 1.0;
    const xEdge = COURT.HALF_LENGTH + 1.0;
    let ti = 0;
    const addLed = (w, rotY, pos) => {
      const [t, c] = texts[ti++ % texts.length];
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), makeBoard(t, c));
      m.rotation.y = rotY; m.position.copy(pos); this.group.add(m);
    };
    addLed(COURT.LENGTH, 0, new THREE.Vector3(0, y, zEdge));
    addLed(COURT.LENGTH, Math.PI, new THREE.Vector3(0, y, -zEdge));
    addLed(COURT.WIDTH, -Math.PI / 2, new THREE.Vector3(xEdge, y, 0));
    addLed(COURT.WIDTH, Math.PI / 2, new THREE.Vector3(-xEdge, y, 0));
  }

  _buildJumbotron() {
    const g = new THREE.Group();
    const y = 11.5;
    // support cables
    const cableMat = new THREE.LineBasicMaterial({ color: 0x222634 });
    // body
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 2.4, 4.2),
      new THREE.MeshStandardMaterial({ color: 0x0a0c12, roughness: 0.6, metalness: 0.3 })
    );
    body.position.set(0, y, 0);
    g.add(body);

    const cv = document.createElement('canvas');
    cv.width = 512; cv.height = 256;
    const ctx = cv.getContext('2d');
    const draw = () => {
      ctx.fillStyle = '#06111f'; ctx.fillRect(0, 0, 512, 256);
      ctx.fillStyle = '#ff8a2a'; ctx.font = '900 90px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('OPUSMAX', 256, 110);
      ctx.fillStyle = '#eaf3ff'; ctx.font = '900 60px Arial';
      ctx.fillText('HOOPS', 256, 180);
    };
    draw();
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.jumboTex = tex;
    this.jumboCtx = ctx; this.jumboCanvas = cv;
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    for (let i = 0; i < 4; i++) {
      const sc = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.0), screenMat);
      const a = (i / 4) * Math.PI * 2;
      sc.position.set(Math.sin(a) * 2.12, y, Math.cos(a) * 2.12);
      sc.rotation.y = a;
      g.add(sc);
    }
    // top rigging
    const rig = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 6, 6),
      new THREE.MeshStandardMaterial({ color: 0x181c26 })
    );
    rig.position.set(0, y + 4.5, 0);
    g.add(rig);
    this.group.add(g);
    this.jumbotron = g;
  }

  _buildCeiling() {
    // Dark ceiling plane high up with a simple truss grid for depth.
    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 90),
      new THREE.MeshStandardMaterial({ color: 0x03040a, roughness: 1, side: THREE.DoubleSide })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = 20;
    this.group.add(ceil);

    const trussMat = new THREE.MeshStandardMaterial({ color: 0x0a0d15, roughness: 0.8, metalness: 0.4 });
    const geos = [];
    for (let x = -40; x <= 40; x += 8) {
      const g = new THREE.BoxGeometry(0.2, 0.2, 60); g.translate(x, 19, 0); geos.push(g);
    }
    for (let z = -30; z <= 30; z += 8) {
      const g = new THREE.BoxGeometry(80, 0.2, 0.2); g.translate(0, 19, z); geos.push(g);
    }
    const truss = new THREE.Mesh(mergeGeometries(geos), trussMat);
    this.group.add(truss);
  }

  // Crowd reacts: pump excitement to make them jump/sway.
  react(strength = 1) { this._excite = Math.min(1.4, this._excite + strength); }

  update(dt) {
    this._time += dt;
    this._excite = Math.max(0, this._excite - dt * 0.7);
    // Subtle idle sway + excited bounce, updated on a subset each frame for perf.
    const t = this._time;
    const ex = this._excite;
    const d = this._dummy;
    const count = this._crowdCount;
    // update every instance but cheaply (position bob only)
    const stride = ex > 0.05 ? 1 : 3;           // sway everyone when excited
    const startFrame = Math.floor(t * 60) % stride;
    for (let i = startFrame; i < count; i += stride) {
      this._crowdBase[i].decompose(d.position, d.quaternion, d.scale);
      const ph = this._crowdPhase[i];
      const bob = Math.sin(t * 2 + ph) * 0.03 + Math.sin(t * 8 + ph) * 0.06 * ex;
      d.position.y += bob + ex * 0.12 * Math.max(0, Math.sin(t * 9 + ph));
      d.updateMatrix();
      this.crowd.setMatrixAt(i, d.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;

    if (this.jumbotron) this.jumbotron.rotation.y += dt * 0.15;
  }
}
