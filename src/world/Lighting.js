import * as THREE from 'three';
import { COURT, HOOP } from '../config.js';

// Arena lighting: soft ambient fill + a main shadow-casting key light and a
// couple of warm spotlights to rake the hardwood.
export class Lighting {
  constructor(scene) {
    this.group = new THREE.Group();

    // Ambient / sky fill
    const hemi = new THREE.HemisphereLight(0xbcd0ff, 0x30281f, 0.55);
    scene.add(hemi);

    const amb = new THREE.AmbientLight(0xffffff, 0.18);
    scene.add(amb);

    // Main key light (shadow caster) high above center, angled.
    const key = new THREE.DirectionalLight(0xfff2df, 1.3);
    key.position.set(6, 24, 10);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const d = 18;
    key.shadow.camera.left = -d;
    key.shadow.camera.right = d;
    key.shadow.camera.top = d;
    key.shadow.camera.bottom = -d;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 70;
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    key.shadow.radius = 3;
    scene.add(key);
    scene.add(key.target);
    this.key = key;

    // Fill from opposite side (no shadow)
    const fill = new THREE.DirectionalLight(0xdfe8ff, 0.5);
    fill.position.set(-10, 16, -8);
    scene.add(fill);

    // Warm spotlights over each end (arena catwalk feel)
    for (const s of [1, -1]) {
      const spot = new THREE.SpotLight(0xfff0d8, 90, 42, Math.PI / 5, 0.55, 1.5);
      spot.position.set(s * COURT.HALF_LENGTH * 0.5, 15, s * 4);
      spot.target.position.set(s * HOOP.RIM_X, 0, 0);
      scene.add(spot); scene.add(spot.target);
    }

    // Cool rim light low from the crowd side for shape separation
    const rim = new THREE.DirectionalLight(0x6f9bff, 0.35);
    rim.position.set(0, 6, -18);
    scene.add(rim);
  }
}
