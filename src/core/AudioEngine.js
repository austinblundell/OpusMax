// Procedural audio via the Web Audio API — no external files.
// Synthesizes bounces, rim/backboard hits, swish, whistle, buzzer, crowd bed.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.crowdGain = null;
    this.enabled = true;
    this.started = false;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    // Reverb-ish: a short feedback delay to fake arena space.
    this.reverb = this.ctx.createConvolver();
    this.reverb.buffer = this._makeImpulse(1.6, 2.4);
    const revGain = this.ctx.createGain();
    revGain.gain.value = 0.18;
    this.reverb.connect(revGain);
    revGain.connect(this.master);
    this.revSend = this.reverb;

    this._buildCrowd();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    this.started = true;
  }

  _makeImpulse(dur, decay) {
    const rate = 44100;
    const len = rate * dur;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  _noiseBuffer(dur = 0.4) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * dur);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  _env(gain, t0, peak, attack, release) {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + release);
  }

  // ---- Crowd ambience bed ----
  _buildCrowd() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(2.5);
    src.loop = true;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 620;
    bp.Q.value = 0.6;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    this.crowdGain = this.ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    src.connect(bp); bp.connect(lp); lp.connect(this.crowdGain);
    this.crowdGain.connect(this.master);
    src.start();
    this.crowdBase = 0.05;
  }

  setCrowdIntensity(v) {
    if (!this.crowdGain) return;
    const t = this.ctx.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.linearRampToValueAtTime(0.03 + v * 0.09, t + 0.4);
  }

  crowdCheer(strength = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(1.6);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.5;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * strength, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    src.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.revSend);
    src.start(t); src.stop(t + 1.6);
  }

  // ---- One-shots ----
  bounce(velocity = 4) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, velocity / 9);
    // low thump
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const f0 = 150 + v * 90;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    const g = this.ctx.createGain();
    this._env(g, t, 0.05 + v * 0.28, 0.004, 0.12);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.2);
    // rubber slap (short noise)
    const n = this.ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.05);
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1200;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.02 + v * 0.08, 0.002, 0.04);
    n.connect(hp); hp.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.08);
  }

  rim(velocity = 3) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, velocity / 6);
    const freqs = [523, 784, 1046, 1318];
    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = f * (0.98 + Math.random() * 0.04);
      const g = this.ctx.createGain();
      const peak = (0.05 + v * 0.09) / (i + 1);
      this._env(g, t, peak, 0.002, 0.18 + i * 0.05);
      osc.connect(g); g.connect(this.master); g.connect(this.revSend);
      osc.start(t); osc.stop(t + 0.4);
    });
  }

  backboard(velocity = 3) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, velocity / 6);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    const g = this.ctx.createGain();
    this._env(g, t, 0.06 + v * 0.14, 0.003, 0.16);
    const n = this.ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.12);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 420;
    const ng = this.ctx.createGain();
    this._env(ng, t, 0.04 + v * 0.08, 0.002, 0.1);
    osc.connect(g); g.connect(this.master);
    n.connect(bp); bp.connect(ng); ng.connect(this.master);
    osc.start(t); osc.stop(t + 0.3); n.start(t); n.stop(t + 0.2);
  }

  swish() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource();
    n.buffer = this._noiseBuffer(0.4);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(3800, t);
    bp.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    this._env(g, t, 0.14, 0.01, 0.28);
    n.connect(bp); bp.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.4);
  }

  whistle() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2300, t);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 22;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 90;
    lfo.connect(lfoG); lfoG.connect(osc.frequency);
    const g = this.ctx.createGain();
    this._env(g, t, 0.14, 0.01, 0.35);
    osc.connect(g); g.connect(this.master);
    osc.start(t); lfo.start(t); osc.stop(t + 0.4); lfo.stop(t + 0.4);
  }

  buzzer() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
    g.gain.setValueAtTime(0.18, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 1.4);
  }

  squeak() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200 + Math.random() * 500, t);
    osc.frequency.exponentialRampToValueAtTime(2400, t + 0.08);
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 4;
    const g = this.ctx.createGain();
    this._env(g, t, 0.05, 0.005, 0.09);
    osc.connect(bp); bp.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.14);
  }

  click() {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square'; osc.frequency.value = 660;
    const g = this.ctx.createGain();
    this._env(g, t, 0.05, 0.002, 0.05);
    osc.connect(g); g.connect(this.master);
    osc.start(t); osc.stop(t + 0.08);
  }
}
