import { MODES } from '../config.js';

// Pure game-logic state: score, clocks, streaks, possession. Emits lightweight
// events the Game layer turns into audio / UI / flow changes.
export class GameState {
  constructor() {
    this.reset('freestyle');
  }

  reset(modeKey) {
    this.modeKey = modeKey;
    this.mode = MODES[modeKey];
    this.scoreYou = 0;
    this.scoreCpu = 0;
    this.gameClock = this.mode.clock;          // seconds or null
    this.shotClock = this.mode.shotClock ? 24 : null;
    this.possession = 'you';
    this.streak = 0;
    this.bestStreak = 0;
    this.makes = 0;
    this.attempts = 0;
    this.threes = 0;
    this.running = false;
    this.gameOver = false;
    this.elapsed = 0;
  }

  start() { this.running = true; this.gameOver = false; }

  resetShotClock(v = 24) { if (this.shotClock !== null) this.shotClock = v; }

  // Record a shot attempt outcome. points=0 means a miss.
  registerShot(points, who = 'you') {
    if (who === 'you') {
      this.attempts++;
      if (points > 0) {
        this.makes++;
        this.scoreYou += points;
        this.streak++;
        this.bestStreak = Math.max(this.bestStreak, this.streak);
        if (points === 3) this.threes++;
      } else {
        this.streak = 0;
      }
    } else {
      if (points > 0) this.scoreCpu += points;
    }
    this.resetShotClock();
  }

  get fgPct() { return this.attempts ? Math.round((this.makes / this.attempts) * 100) : 0; }

  update(dt) {
    const events = [];
    if (!this.running || this.gameOver) return events;
    this.elapsed += dt;

    if (this.gameClock !== null) {
      const prev = this.gameClock;
      this.gameClock = Math.max(0, this.gameClock - dt);
      if (prev > 10 && this.gameClock <= 10) events.push({ type: 'final10' });
      if (this.gameClock === 0) {
        this.gameOver = true;
        this.running = false;
        events.push({ type: 'timeup' });
      }
    }

    if (this.shotClock !== null && this.running) {
      const prev = this.shotClock;
      this.shotClock = Math.max(0, this.shotClock - dt);
      if (prev > 0 && this.shotClock === 0) events.push({ type: 'shotclock' });
    }

    // Win condition for target-score modes (1v1)
    if (this.mode.target) {
      if (this.scoreYou >= this.mode.target) {
        this.gameOver = true; this.running = false; events.push({ type: 'win', who: 'you' });
      } else if (this.scoreCpu >= this.mode.target) {
        this.gameOver = true; this.running = false; events.push({ type: 'win', who: 'cpu' });
      }
    }
    return events;
  }

  formatClock() {
    if (this.gameClock === null) return '--:--';
    const m = Math.floor(this.gameClock / 60);
    const s = Math.floor(this.gameClock % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
