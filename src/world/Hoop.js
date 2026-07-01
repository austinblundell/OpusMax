import * as THREE from 'three';
import { HOOP, COURT, COLORS } from '../config.js';

// A full basket assembly: padded stanchion, arm, glass backboard with target
// square, breakaway rim, and a procedurally animated net.
export class Hoop {
  constructor(side = 1) {
    this.side = side;
    this.group = new THREE.Group();
    this.rimCenter = new THREE.Vector3(side * HOOP.RIM_X, HOOP.RIM_HEIGHT, 0);
    this.rimRadius = HOOP.RIM_RADIUS;
    this.backboardX = side * HOOP.BACKBOARD_X;

    this._build();
    this._buildNet();

    this.netTime = 0;
    this.netStrength = 0;
  }

  _build() {
    const s = this.side;
    const boardX = s * HOOP.BACKBOARD_X;

    // ---- Backboard glass ----
    const boardGeo = new THREE.BoxGeometry(0.05, HOOP.BACKBOARD_H, HOOP.BACKBOARD_W);
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xbfe0ff,
      transparent: true,
      opacity: 0.22,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.7,
      thickness: 0.05,
      clearcoat: 1,
    });
    const board = new THREE.Mesh(boardGeo, glassMat);
    const boardY = HOOP.RIM_HEIGHT + HOOP.BACKBOARD_H / 2 - 0.15;
    board.position.set(boardX, boardY, 0);
    board.castShadow = true;
    this.group.add(board);
    this.backboardY = boardY;

    // Backboard frame (white border)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.6 });
    const frameT = 0.06;
    const mkBar = (w, h, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), frameMat);
      m.position.set(boardX - s * 0.005, y, z);
      m.castShadow = true; this.group.add(m);
    };
    mkBar(HOOP.BACKBOARD_W, frameT, boardY + HOOP.BACKBOARD_H / 2, 0);
    mkBar(HOOP.BACKBOARD_W, frameT, boardY - HOOP.BACKBOARD_H / 2, 0);
    // vertical bars
    const vbarL = new THREE.Mesh(new THREE.BoxGeometry(0.06, HOOP.BACKBOARD_H, frameT), frameMat);
    vbarL.position.set(boardX - s * 0.005, boardY, HOOP.BACKBOARD_W / 2); this.group.add(vbarL);
    const vbarR = vbarL.clone(); vbarR.position.z = -HOOP.BACKBOARD_W / 2; this.group.add(vbarR);

    // Target square (orange) just above rim
    const sqMat = new THREE.MeshStandardMaterial({ color: 0xd9662e, roughness: 0.5 });
    const sqW = 0.59, sqH = 0.45;
    const sqY = HOOP.RIM_HEIGHT + 0.30;
    const mkSq = (w, h, y, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.052, h, w), sqMat);
      m.position.set(boardX - s * 0.03, y, z); this.group.add(m);
    };
    mkSq(sqW, 0.05, sqY + sqH / 2, 0);
    mkSq(sqW, 0.05, sqY - sqH / 2, 0);
    const sv = new THREE.Mesh(new THREE.BoxGeometry(0.052, sqH, 0.05), sqMat);
    sv.position.set(boardX - s * 0.03, sqY, sqW / 2); this.group.add(sv);
    const sv2 = sv.clone(); sv2.position.z = -sqW / 2; this.group.add(sv2);

    // ---- Rim ----
    const rimMat = new THREE.MeshStandardMaterial({
      color: COLORS.rim, roughness: 0.35, metalness: 0.8, emissive: 0x3a1400, emissiveIntensity: 0.25,
    });
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(HOOP.RIM_RADIUS, HOOP.RIM_TUBE, 16, 40),
      rimMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.copy(this.rimCenter);
    rim.castShadow = true;
    this.group.add(rim);

    // Connector plate from rim to board
    const conn = new THREE.Mesh(
      new THREE.BoxGeometry(HOOP.RIM_FROM_BACKBOARD, 0.05, 0.14),
      rimMat
    );
    conn.position.set(boardX - s * (HOOP.RIM_FROM_BACKBOARD / 2 + 0.02), HOOP.RIM_HEIGHT, 0);
    this.group.add(conn);

    // ---- Stanchion (pole + arm + padded base) ----
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.5, metalness: 0.6 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0x111318, roughness: 0.9 });
    const poleX = s * (COURT.HALF_LENGTH + 1.1);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, HOOP.RIM_HEIGHT + 1.2, 16), poleMat);
    pole.position.set(poleX, (HOOP.RIM_HEIGHT + 1.2) / 2, 0);
    pole.castShadow = true; this.group.add(pole);
    // padded base
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.9), padMat);
    base.position.set(poleX + s * 0.1, 0.25, 0);
    base.castShadow = true; this.group.add(base);
    // arm from pole to top of backboard
    const armLen = Math.abs(poleX - boardX);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.13, 0.13), poleMat);
    arm.position.set((poleX + boardX) / 2, boardY + HOOP.BACKBOARD_H / 2 - 0.1, 0);
    this.group.add(arm);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(armLen * 0.8, 0.1, 0.1), poleMat);
    arm2.position.set((poleX + boardX) / 2 + s * 0.1, boardY - 0.2, 0);
    arm2.rotation.z = s * 0.18; this.group.add(arm2);

    // Shot-clock box on top
    const scBox = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.4, 0.2),
      new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.7 })
    );
    scBox.position.set(boardX, boardY + HOOP.BACKBOARD_H / 2 + 0.28, 0);
    this.group.add(scBox);
    const scFace = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xff2200 })
    );
    scFace.position.set(boardX - s * 0.11, boardY + HOOP.BACKBOARD_H / 2 + 0.28, 0);
    scFace.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.group.add(scFace);
  }

  _buildNet() {
    const N = HOOP.NET_SEGMENTS;         // strands
    const rings = 5;                     // vertical resolution
    const topR = HOOP.RIM_RADIUS * 0.95;
    const botR = HOOP.RIM_RADIUS * 0.42;
    const len = HOOP.NET_LENGTH;

    this.netNodes = [];   // [ring][strand] = {base:Vec3, pos:Vec3, vel:Vec3}
    for (let r = 0; r < rings; r++) {
      const row = [];
      const t = r / (rings - 1);
      const radius = topR + (botR - topR) * t;
      const y = this.rimCenter.y - len * t;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        const base = new THREE.Vector3(
          this.rimCenter.x + Math.cos(a) * radius,
          y,
          this.rimCenter.z + Math.sin(a) * radius
        );
        row.push({ base, pos: base.clone(), vel: new THREE.Vector3(), t });
      }
      this.netNodes.push(row);
    }

    // Build line segments: verticals + diagonals for a mesh look
    const positions = [];
    this._netPairs = [];
    for (let r = 0; r < rings - 1; r++) {
      for (let i = 0; i < N; i++) {
        // vertical
        this._netPairs.push([[r, i], [r + 1, i]]);
        // diagonal
        this._netPairs.push([[r, i], [r + 1, (i + 1) % N]]);
      }
    }
    for (let k = 0; k < this._netPairs.length; k++) { positions.push(0, 0, 0, 0, 0, 0); }

    const geo = new THREE.BufferGeometry();
    this._netAttr = new THREE.Float32BufferAttribute(positions, 3);
    this._netAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this._netAttr);
    const mat = new THREE.LineBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0.85 });
    this.netMesh = new THREE.LineSegments(geo, mat);
    this.group.add(this.netMesh);
    this._writeNet();
  }

  _writeNet() {
    const arr = this._netAttr.array;
    let o = 0;
    for (const [a, b] of this._netPairs) {
      const pa = this.netNodes[a[0]][a[1]].pos;
      const pb = this.netNodes[b[0]][b[1]].pos;
      arr[o++] = pa.x; arr[o++] = pa.y; arr[o++] = pa.z;
      arr[o++] = pb.x; arr[o++] = pb.y; arr[o++] = pb.z;
    }
    this._netAttr.needsUpdate = true;
  }

  // Perturb the net (call when the ball drops through).
  swish(strength = 1, ballPos = null) {
    for (let r = 1; r < this.netNodes.length; r++) {
      for (const node of this.netNodes[r]) {
        const push = strength * node.t * (0.6 + Math.random() * 0.5);
        node.vel.x += (Math.random() - 0.5) * push;
        node.vel.z += (Math.random() - 0.5) * push;
        node.vel.y -= push * 0.4;
        if (ballPos) {
          const d = node.pos.clone().sub(ballPos);
          d.y = 0;
          const dist = d.length();
          if (dist < HOOP.RIM_RADIUS) {
            d.normalize().multiplyScalar((HOOP.RIM_RADIUS - dist) * 6 * node.t);
            node.vel.add(d);
          }
        }
      }
    }
  }

  update(dt) {
    // Spring the net nodes back to base with damping.
    let moved = false;
    for (let r = 1; r < this.netNodes.length; r++) {
      for (const node of this.netNodes[r]) {
        const toBase = node.base.clone().sub(node.pos);
        node.vel.addScaledVector(toBase, 60 * dt);
        node.vel.multiplyScalar(Math.max(0, 1 - 9 * dt));
        node.pos.addScaledVector(node.vel, dt);
        if (node.vel.lengthSq() > 1e-5) moved = true;
      }
    }
    if (moved) this._writeNet();
  }
}
