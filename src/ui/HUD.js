import { SHOT } from '../config.js';

// Thin controller over the DOM overlays (scoreboard, shot meter, announcements).
export class HUD {
  constructor() {
    this.el = {
      hud: document.getElementById('hud'),
      scoreYou: document.getElementById('score-you'),
      scoreCpu: document.getElementById('score-cpu'),
      clock: document.getElementById('game-clock'),
      shotClock: document.getElementById('shot-clock'),
      announce: document.getElementById('announce'),
      streak: document.getElementById('streak'),
      meter: document.getElementById('shot-meter'),
      meterFill: document.getElementById('meter-fill'),
      meterPerfect: document.getElementById('meter-perfect'),
      meterMarker: document.getElementById('meter-marker'),
      hint: document.getElementById('hud-hint'),
      results: document.getElementById('results'),
      resultsTitle: document.getElementById('results-title'),
      resultsStats: document.getElementById('results-stats'),
    };
    // Place the green "perfect" window on the meter once.
    const lo = SHOT.PERFECT_LO * 100, hi = SHOT.PERFECT_HI * 100;
    this.el.meterPerfect.style.left = lo + '%';
    this.el.meterPerfect.style.width = (hi - lo) + '%';
    this._announceTimer = null;
  }

  show() { this.el.hud.classList.remove('hidden'); }
  hide() { this.el.hud.classList.add('hidden'); }

  setScore(you, cpu) {
    this.el.scoreYou.textContent = you;
    this.el.scoreCpu.textContent = cpu;
  }
  setClock(str) { this.el.clock.textContent = str; }
  setShotClock(n) {
    if (n === null || n === undefined) { this.el.shotClock.textContent = '—'; return; }
    this.el.shotClock.textContent = Math.ceil(n);
    this.el.shotClock.parentElement.style.color = n <= 5 ? '#ff4b4b' : '';
  }

  showMeter(power) {
    this.el.meter.classList.remove('hidden');
    const pct = Math.min(100, power * 100);
    this.el.meterFill.style.width = pct + '%';
    this.el.meterMarker.style.left = pct + '%';
  }
  hideMeter() { this.el.meter.classList.add('hidden'); }

  announce(text, color = '#ffffff') {
    const a = this.el.announce;
    a.textContent = text;
    a.style.color = color;
    a.classList.remove('show');
    // force reflow to restart the animation
    void a.offsetWidth;
    a.classList.add('show');
  }

  setStreak(n) {
    const s = this.el.streak;
    if (n >= 2) {
      s.classList.remove('hidden');
      let label = `${n} IN A ROW`;
      if (n >= 7) label = `🔥 UNCONSCIOUS ×${n}`;
      else if (n >= 5) label = `🔥 HEATING UP ×${n}`;
      else if (n >= 3) label = `ON FIRE ×${n}`;
      s.textContent = label;
    } else {
      s.classList.add('hidden');
    }
  }

  setHint(text) { this.el.hint.innerHTML = text; }

  showResults(title, statLines) {
    this.el.resultsTitle.textContent = title;
    this.el.resultsStats.innerHTML = statLines.map(([k, v]) => `${k}: <b>${v}</b>`).join('<br>');
    this.el.results.classList.remove('hidden');
    this.el.results.classList.remove('fade-out');
  }
  hideResults() { this.el.results.classList.add('hidden'); }
}
