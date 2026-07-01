import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Subtle cinematic grade: vignette + slight contrast/saturation lift.
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    vignette: { value: 1.05 },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // saturation
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      // contrast around mid grey
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      // vignette
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, vignette * 0.35, dot(d, d) * 2.3);
      c.rgb *= mix(0.62, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

export class Renderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.composer = null;
    this._grade = null;
    this._bloom = null;
  }

  setupPost(scene, camera) {
    const size = this.renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this._bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.3,    // strength
      0.7,    // radius
      0.95    // threshold — only the brightest highlights bloom
    );
    this.composer.addPass(this._bloom);

    this._grade = new ShaderPass(GradeShader);
    this.composer.addPass(this._grade);

    const smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(smaa);

    this.composer.addPass(new OutputPass());
    this.resize();
  }

  setCamera(camera) {
    // Update the render pass camera when the active camera object changes.
    if (this.composer && this.composer.passes[0]) {
      this.composer.passes[0].camera = camera;
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  render(scene, camera) {
    if (this.composer) this.composer.render();
    else this.renderer.render(scene, camera);
  }
}
