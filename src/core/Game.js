import * as THREE from 'three';
import { Renderer } from './Renderer.js';
import { Input } from './Input.js';
import { AudioEngine } from './AudioEngine.js';
import { Court } from '../world/Court.js';
import { Hoop } from '../world/Hoop.js';
import { Arena } from '../world/Arena.js';
import { Lighting } from '../world/Lighting.js';
import { Ball } from '../entities/Ball.js';
import { Player } from '../entities/Player.js';
import { Defender } from '../entities/Defender.js';
import { Physics } from '../systems/Physics.js';
import { ShotSystem } from '../systems/ShotSystem.js';
import { CameraSystem } from '../systems/CameraSystem.js';
import { GameState } from '../systems/GameState.js';
import { PlayerController } from '../systems/PlayerController.js';
import { HUD } from '../ui/HUD.js';
import { COLORS, COURT, MODES } from '../config.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.renderer = new Renderer(canvas);
    this.camera = new CameraSystem();
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.state = new GameState();
    this.shot = new ShotSystem();
    this.physics = new Physics();

    this.mode = 'menu';       // menu | playing | over
    this._clock = 0;
    this._menuAngle = 0;
    this._last = 0;
  }

  async init(onProgress = () => {}) {
    onProgress(0.1, 'Building court…');
    const court = new Court();
    this.scene.add(court.group);

    onProgress(0.3, 'Raising the rims…');
    this.hoopA = new Hoop(1);    // scoring hoop (+X)
    this.hoopB = new Hoop(-1);
    this.scene.add(this.hoopA.group);
    this.scene.add(this.hoopB.group);
    this.physics.setHoops([this.hoopA, this.hoopB], this.hoopA);

    onProgress(0.5, 'Filling the seats…');
    this.arena = new Arena(this.scene);

    onProgress(0.7, 'Setting the lights…');
    this.lighting = new Lighting(this.scene);

    onProgress(0.82, 'Inflating the ball…');
    this.ball = new Ball();
    this.ball.addToScene(this.scene);

    this.player = new Player({
      jersey: COLORS.jerseyHome, shorts: 0x10306a, accent: 0xffd23a, number: 8,
    });
    this.player.addToScene(this.scene);

    this.defenderPlayer = new Player({
      jersey: COLORS.jerseyAway, shorts: 0x5a1414, accent: 0x101010, skin: 0x6f4429, number: 3,
    });
    this.defenderPlayer.addToScene(this.scene);
    this.defenderPlayer.root.visible = false;
    this.defender = new Defender(this.defenderPlayer, this.hoopA);

    this.controller = new PlayerController({
      player: this.player, ball: this.ball, camera: this.camera, shot: this.shot,
      hoop: this.hoopA, audio: this.audio, state: this.state, hud: this.hud,
      callbacks: {
        onShoot: (res, pts) => this._onShoot(res, pts),
        onShotResolved: (made, pts) => this._onShotResolved(made, pts),
        onRebound: () => {},
      },
    });

    onProgress(0.95, 'Final polish…');
    this.renderer.setupPost(this.scene, this.camera.camera);

    // Resize handling
    window.addEventListener('resize', () => {
      this.renderer.resize();
      this.camera.resize();
    });

    // Camera / crossover keys + pointer lock
    this.canvas.addEventListener('click', () => {
      if (this.mode === 'playing' && this.camera.mode !== 'broadcast') this.input.requestLook();
    });

    // Park everything in a nice spot for the menu backdrop.
    this._placeForMenu();
    onProgress(1.0, 'Ready');
  }

  _placeForMenu() {
    this.player.setPosition(6, 2);
    this.player.facing = Math.atan2(this.hoopA.rimCenter.x - 6, this.hoopA.rimCenter.z - 2);
    this.ball.held = true;
    this.controller.giveBall();
    this.controller.facing = this.player.facing;
  }

  start(modeKey) {
    this.audio.init();
    this.audio.resume();
    this.state.reset(modeKey);
    this.state.start();
    this.mode = 'playing';

    const isDef = MODES[modeKey].defender;
    this.defenderPlayer.root.visible = isDef;
    if (isDef) this.defender.reset();

    // Reset positions
    this.player.setPosition(6, 0);
    this.player.facing = Math.atan2(this.hoopA.rimCenter.x - 6, this.hoopA.rimCenter.z - 0);
    this.controller.facing = this.player.facing;
    this.controller.vel.set(0, 0, 0);
    this.controller.giveBall();
    this.controller.shotPending = false;
    this.controller.resetTimer = 0;

    this.camera.setMode('broadcast');
    this.hud.hideResults();
    this.hud.show();
    this.hud.setScore(0, 0);
    this.hud.setStreak(0);
    this.hud.setHint('Hold <kbd>SPACE</kbd> to shoot • <kbd>E</kbd> crossover • <kbd>C</kbd> camera');
    this.audio.setCrowdIntensity(0.4);
    this.audio.whistle();
  }

  toMenu() {
    this.mode = 'menu';
    this.hud.hide();
    this.input.exitLook();
    this.defenderPlayer.root.visible = false;
    this._placeForMenu();
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this._last) / 1000 || 0);
    this._last = now;
    this._clock += dt;

    if (this.mode === 'playing') this._updatePlaying(dt);
    else this._updateMenu(dt);

    // Always-on world ambience
    this.arena.update(dt);
    this.hoopA.update(dt);
    this.hoopB.update(dt);
    this.ball.syncMesh(dt);

    this.renderer.render(this.scene, this.camera.camera);
    this.input.endFrame();
  }

  _updateMenu(dt) {
    // Slow cinematic orbit around center court.
    this._menuAngle += dt * 0.12;
    const r = 20;
    this.camera.camera.position.set(
      Math.sin(this._menuAngle) * r,
      7 + Math.sin(this._menuAngle * 0.5) * 1.5,
      Math.cos(this._menuAngle) * r
    );
    this.camera.camera.lookAt(0, 2.5, 0);
    // idle-animate the player holding the ball
    this.player.update(dt, { state: 'idle', speed: 0, facing: this.player.facing });
    this.controller.player.getHoldPoint(this.ball.pos);
  }

  _updatePlaying(dt) {
    const input = this.input;

    // Global keys
    if (input.justPressed('KeyC')) {
      const m = this.camera.cycle();
      this.audio.click();
      this.hud.announce(m.toUpperCase() + ' CAM', '#37c0ff');
      if (m !== 'broadcast') this.input.requestLook(); else this.input.exitLook();
    }
    if (input.justPressed('KeyE')) this.controller.crossover();
    this.camera.applyMouse(input.mouse);

    // Systems
    const info = this.controller.update(dt, input);

    if (this.state.mode.defender && this.defenderPlayer.root.visible) {
      this.defender.update(dt, this.player, this.controller);
    }

    // Ball physics + events
    const events = this.physics.update(this.ball, dt);
    for (const e of events) this._handlePhysicsEvent(e);

    // Game clocks
    const gevents = this.state.update(dt);
    for (const e of gevents) this._handleGameEvent(e);

    // Camera
    this.camera.update(dt, {
      player: this.player, ball: this.ball, hoop: this.hoopA,
      aiming: this.controller.phase === 'charge' || this.controller.phase === 'shoot',
    });

    // HUD refresh
    this.hud.setScore(this.state.scoreYou, this.state.scoreCpu);
    this.hud.setClock(this.state.formatClock());
    this.hud.setShotClock(this.state.shotClock);
  }

  _handlePhysicsEvent(e) {
    switch (e.type) {
      case 'floor': this.audio.bounce(e.speed); break;
      case 'rim': this.audio.rim(e.speed); this.camera.addShake(0.06); break;
      case 'backboard': this.audio.backboard(e.speed); break;
      case 'score': this._onMade(e); break;
    }
  }

  _onShoot(res, pts) {
    // release feedback
    this.camera.addShake(0.05);
    if (res.quality === 'perfect') this.hud.announce('PURE', '#37d67a');
  }

  _onMade(e) {
    this.controller.onScored();
    this.audio.swish();
    this.audio.crowdCheer(e.clean ? 1.1 : 0.85);
    this.arena.react(1.2);
    this.camera.addShake(0.14);
    this.audio.setCrowdIntensity(0.8);

    const pts = this.controller.shotPoints;
    const streak = this.state.streak;
    let text = e.clean ? 'SWISH!' : 'BUCKET!';
    let color = '#ffd23a';
    if (pts === 3) { text = e.clean ? 'SPLASH! 3' : 'THREE!'; color = '#37c0ff'; }
    if (streak >= 5) { text = 'ON FIRE! 🔥'; color = '#ff7a18'; }
    this.hud.announce(text, color);
    this.hud.setStreak(streak);
  }

  _onShotResolved(made, pts) {
    if (!made) {
      this.hud.setStreak(this.state.streak);
      // CPU putback chance in 1v1
      if (this.state.mode.defender && this.defenderPlayer.root.visible) {
        const r = this.defender.tryPutback(this.ball);
        if (r > 0) {
          this.state.registerShot(r, 'cpu');
          this.hud.announce('CPU PUTBACK', '#ff5252');
          this.audio.crowdCheer(0.5);
        }
      }
    }
    this.audio.setCrowdIntensity(0.45);
  }

  _handleGameEvent(e) {
    switch (e.type) {
      case 'final10':
        this.audio.setCrowdIntensity(0.9);
        this.hud.announce('FINAL 10!', '#ff7a18');
        break;
      case 'shotclock':
        this.audio.whistle();
        this.hud.announce('SHOT CLOCK', '#ff5252');
        this.controller._resolveMiss();
        this.controller.giveBall();
        this.state.resetShotClock();
        break;
      case 'timeup': this._endGame(); break;
      case 'win': this._endGame(e.who); break;
    }
  }

  _endGame(who) {
    this.mode = 'over';
    this.audio.buzzer();
    this.input.exitLook();
    let title = 'TIME!';
    if (who === 'you') { title = 'YOU WIN! 🏆'; this.audio.crowdCheer(1.4); }
    else if (who === 'cpu') title = 'CPU WINS';

    const stats = [
      ['Points', this.state.scoreYou],
      ['Made / Attempts', `${this.state.makes} / ${this.state.attempts}`],
      ['Field Goal %', `${this.state.fgPct}%`],
      ['Threes', this.state.threes],
      ['Best Streak', this.state.bestStreak],
    ];
    if (this.state.mode.defender) stats.unshift(['Final', `You ${this.state.scoreYou} — ${this.state.scoreCpu} CPU`]);
    setTimeout(() => this.hud.showResults(title, stats), 700);
  }
}
