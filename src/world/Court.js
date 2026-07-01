import * as THREE from 'three';
import { COURT, HOOP, COLORS } from '../config.js';

// Builds the hardwood floor as a single high-resolution baked texture:
// wood planks + all regulation NBA line markings, both ends symmetric.
export class Court {
  constructor() {
    this.group = new THREE.Group();
    const tex = this._bakeTexture();

    const mat = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: 0.42,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.28,
      reflectivity: 0.35,
    });
    const geo = new THREE.PlaneGeometry(COURT.LENGTH, COURT.WIDTH);
    const floor = new THREE.Mesh(geo, mat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    floor.position.y = 0;
    this.group.add(floor);

    // Slightly larger apron / out-of-bounds hardwood ring so the court isn't a
    // floating rectangle.
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x6b451f, roughness: 0.6 });
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(COURT.LENGTH + 5.2, COURT.WIDTH + 4.4),
      apronMat
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.01;
    apron.receiveShadow = true;
    this.group.add(apron);
  }

  _bakeTexture() {
    const PPM = 2048 / COURT.LENGTH;             // pixels per meter
    const W = 2048;
    const H = Math.round(COURT.WIDTH * PPM);
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');

    const c2p = (x, z) => [(x + COURT.HALF_LENGTH) * PPM, (z + COURT.HALF_WIDTH) * PPM];
    const px = (m) => m * PPM;

    // ---- Hardwood base with planks running along the length ----
    ctx.fillStyle = '#a9722f';
    ctx.fillRect(0, 0, W, H);
    const plankH = px(0.15);
    for (let y = 0; y < H; y += plankH) {
      const shade = 0.86 + Math.random() * 0.22;
      const r = Math.floor(175 * shade), g = Math.floor(118 * shade), b = Math.floor(58 * shade);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, y, W, plankH - 1);
      // grain streaks
      ctx.strokeStyle = `rgba(90,55,20,${0.05 + Math.random() * 0.06})`;
      ctx.lineWidth = 1;
      for (let s = 0; s < 5; s++) {
        ctx.beginPath();
        const yy = y + Math.random() * plankH;
        ctx.moveTo(0, yy);
        ctx.bezierCurveTo(W * 0.3, yy + (Math.random() - 0.5) * 4, W * 0.6, yy + (Math.random() - 0.5) * 4, W, yy);
        ctx.stroke();
      }
    }
    // plank seams (vertical breaks)
    ctx.strokeStyle = 'rgba(60,38,14,0.35)';
    ctx.lineWidth = 1.5;
    for (let y = 0; y < H; y += plankH) {
      let x = Math.random() * px(2);
      while (x < W) {
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + plankH); ctx.stroke();
        x += px(1.6) + Math.random() * px(1.4);
      }
    }
    // soft center-court glow / vignette on the wood
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, W * 0.6);
    grad.addColorStop(0, 'rgba(255,225,180,0.10)');
    grad.addColorStop(1, 'rgba(20,10,0,0.28)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // ---- Line drawing helpers (court space) ----
    const LW = Math.max(3, px(COURT.LINE_W));
    const line = (col = '#f4efe6') => { ctx.strokeStyle = col; ctx.lineWidth = LW; ctx.lineCap = 'round'; };
    const seg = (x0, z0, x1, z1) => {
      const a = c2p(x0, z0), b = c2p(x1, z1);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    };
    const arc = (cx, cz, r, a0, a1, steps = 96) => {
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const t = a0 + (a1 - a0) * (i / steps);
        const p = c2p(cx + r * Math.cos(t), cz + r * Math.sin(t));
        if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.stroke();
    };
    const circle = (cx, cz, r) => arc(cx, cz, r, 0, Math.PI * 2);

    line();
    // Boundary
    seg(-COURT.HALF_LENGTH, -COURT.HALF_WIDTH, COURT.HALF_LENGTH, -COURT.HALF_WIDTH);
    seg(-COURT.HALF_LENGTH, COURT.HALF_WIDTH, COURT.HALF_LENGTH, COURT.HALF_WIDTH);
    seg(-COURT.HALF_LENGTH, -COURT.HALF_WIDTH, -COURT.HALF_LENGTH, COURT.HALF_WIDTH);
    seg(COURT.HALF_LENGTH, -COURT.HALF_WIDTH, COURT.HALF_LENGTH, COURT.HALF_WIDTH);
    // Half-court line + center circles
    seg(0, -COURT.HALF_WIDTH, 0, COURT.HALF_WIDTH);
    circle(0, 0, COURT.CENTER_R);
    circle(0, 0, COURT.CENTER_R * 0.32);

    // Center court logo text
    ctx.save();
    ctx.translate(...c2p(0, 0));
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(244,239,230,0.20)';
    ctx.font = `900 ${px(1.1)}px Arial`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OPUSMAX', 0, -px(0.2));
    ctx.font = `900 ${px(0.55)}px Arial`;
    ctx.fillText('HOOPS', 0, px(0.7));
    ctx.restore();

    // Both ends
    for (const s of [1, -1]) {
      const baseX = s * COURT.HALF_LENGTH;
      const rimX = s * HOOP.RIM_X;
      const ftX = s * (COURT.HALF_LENGTH - COURT.FT_LINE_FROM_BASE);
      const kw = COURT.KEY_WIDTH / 2;

      // Painted key fill
      ctx.save();
      const a = c2p(baseX, -kw), b = c2p(ftX, kw);
      ctx.fillStyle = 'rgba(180,60,40,0.55)';
      ctx.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      ctx.restore();

      line();
      // Key rectangle
      seg(baseX, -kw, ftX, -kw);
      seg(baseX, kw, ftX, kw);
      seg(ftX, -kw, ftX, kw);
      // Free-throw circle (solid top, dashed bottom toward baseline)
      arc(ftX, 0, COURT.FT_CIRCLE_R, Math.PI / 2 * s + (s > 0 ? 0 : 0), Math.PI / 2 * s + Math.PI * s);
      // Simpler: full circle, then overlay handled visually
      circle(ftX, 0, COURT.FT_CIRCLE_R);
      // Restricted-area arc under basket
      arc(rimX, 0, COURT.RESTRICTED_R, s > 0 ? Math.PI / 2 : -Math.PI / 2, s > 0 ? Math.PI * 1.5 : Math.PI * 0.5);

      // Three-point line: straight corners + arc
      const R3 = COURT.THREE_RADIUS;
      const zc = COURT.THREE_SIDE_Z;
      // intersection x offset from basket
      const dx = Math.sqrt(Math.max(0, R3 * R3 - zc * zc));
      const interX = rimX - s * dx;
      // corner straight segments from baseline to intersection
      seg(baseX, zc, interX, zc);
      seg(baseX, -zc, interX, -zc);
      // arc between the two intersection points, bulging toward center
      const ang = Math.atan2(zc, -s * dx); // angle to top intersection rel basket
      if (s > 0) arc(rimX, 0, R3, ang, Math.PI * 2 - ang);
      else arc(rimX, 0, R3, -ang, -(Math.PI * 2 - ang));

      // Backboard tick / hash marks along the lane
      for (let i = 1; i <= 3; i++) {
        const hx = baseX - s * (COURT.FT_LINE_FROM_BASE * 0.32 + i * 0.55);
        seg(hx, kw, hx, kw + 0.2);
        seg(hx, -kw, hx, -kw - 0.2);
      }
    }

    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  }
}
