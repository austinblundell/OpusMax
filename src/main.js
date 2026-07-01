import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const loading = document.getElementById('loading');
const loaderFill = document.getElementById('loader-fill');
const loaderStatus = document.getElementById('loader-status');
const menu = document.getElementById('menu');
const results = document.getElementById('results');

const game = new Game(canvas);
// Expose for debugging / automated testing in the console.
window.OPUSMAX = game;

let selectedMode = 'freestyle';

function wireMenu() {
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      selectedMode = btn.dataset.mode;
      game.audio.init();
      game.audio.resume();
      game.audio.click();
    });
  });

  document.getElementById('play-btn').addEventListener('click', () => {
    menu.classList.add('fade-out');
    setTimeout(() => {
      menu.classList.add('hidden');
      menu.classList.remove('fade-out');
    }, 400);
    game.start(selectedMode);
  });

  document.getElementById('again-btn').addEventListener('click', () => {
    results.classList.add('hidden');
    game.toMenu();
    menu.classList.remove('hidden');
    menu.classList.remove('fade-out');
  });
}

async function boot() {
  wireMenu();
  await game.init((p, msg) => {
    loaderFill.style.width = Math.round(p * 100) + '%';
    if (msg) loaderStatus.textContent = msg;
  });

  // Reveal the menu over the live 3D backdrop.
  loading.classList.add('fade-out');
  setTimeout(() => loading.classList.add('hidden'), 500);
  menu.classList.remove('hidden');

  // Kick off the render loop.
  const frame = (now) => {
    game.loop(now);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((err) => {
  console.error(err);
  loaderStatus.textContent = 'Error: ' + err.message;
});
