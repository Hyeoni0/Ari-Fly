const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const scoreEl = document.querySelector("#score");
const bestEl = document.querySelector("#best");
const overlay = document.querySelector("#overlay");
const stateEl = document.querySelector("#state");
const hintEl = document.querySelector("#hint");
const startButton = document.querySelector("#startButton");

const storeKey = "touch-fly-best";
let best = Number(localStorage.getItem(storeKey) || 0);
bestEl.textContent = best;

const spriteFramePaths = [
  "assets/iren-source.png",
  "assets/iren-idle.png",
  "assets/iren-flap-up.png",
  "assets/iren-flap-down.png",
];
const spriteFrames = spriteFramePaths.map((src) => {
  const image = new Image();
  image.src = src;
  return { image, loaded: false };
});
for (const frame of spriteFrames) {
  frame.image.addEventListener("load", () => {
    frame.loaded = true;
  });
  frame.image.addEventListener("error", () => {
    frame.loaded = false;
  });
}

const game = {
  state: "ready",
  width: 0,
  height: 0,
  dpr: 1,
  time: 0,
  lastTime: 0,
  score: 0,
  speed: 265,
  spawnTimer: 0,
  inputDown: false,
  shake: 0,
  bird: {
    x: 0,
    y: 0,
    vy: 0,
    radius: 18,
    tilt: 0,
  },
  obstacles: [],
  particles: [],
};

function difficultyScale() {
  if (game.width < 520) return 0.72;
  if (game.width < 760) return 0.84;
  return 1;
}

function resize() {
  const rect = canvas.getBoundingClientRect();
  game.dpr = Math.min(window.devicePixelRatio || 1, 2);
  game.width = Math.max(320, rect.width);
  game.height = Math.max(360, rect.height);
  canvas.width = Math.floor(game.width * game.dpr);
  canvas.height = Math.floor(game.height * game.dpr);
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  if (game.state === "ready") resetRun();
}

function resetRun() {
  game.time = 0;
  game.lastTime = performance.now();
  game.score = 0;
  game.speed = 265 * difficultyScale();
  game.spawnTimer = 0;
  game.shake = 0;
  game.obstacles = [];
  game.particles = [];
  game.bird.x = Math.max(86, game.width * 0.2);
  game.bird.y = game.height * 0.45;
  game.bird.vy = 0;
  game.bird.radius = Math.max(18, Math.min(26, game.width * 0.032));
  scoreEl.textContent = 0;
}

function startGame() {
  resetRun();
  game.state = "playing";
  overlay.classList.add("hidden");
}

function endGame(reason) {
  if (game.state !== "playing") return;
  game.state = "dead";
  game.shake = 16;
  best = Math.max(best, game.score);
  localStorage.setItem(storeKey, String(best));
  bestEl.textContent = best;
  stateEl.textContent = "충돌";
  hintEl.textContent =
    reason === "floor"
      ? "바닥에 닿았습니다. 다시 누르면 재시작합니다."
      : "장애물에 닿았습니다. 다시 누르면 재시작합니다.";
  startButton.textContent = "다시";
  overlay.classList.remove("hidden");
}

function setInput(isDown) {
  if (isDown && !game.inputDown && game.state === "playing") {
    game.bird.vy = Math.min(game.bird.vy, -250);
  }
  game.inputDown = isDown;
  if (isDown && game.state !== "playing") startGame();
}

function spawnObstacle() {
  const scale = difficultyScale();
  const margin = game.height * 0.16;
  const gapRatio = scale < 1 ? 0.36 : 0.29;
  const gap = Math.max(136, game.height * gapRatio - Math.min(game.score, 18) * 3);
  const center = margin + Math.random() * (game.height - margin * 2);
  const top = Math.max(52, center - gap / 2);
  const bottom = Math.min(game.height - 54, center + gap / 2);
  game.obstacles.push({
    x: game.width + 36,
    w: Math.max(48, game.width * (scale < 1 ? 0.06 : 0.07)),
    top,
    bottom,
    passed: false,
    hue: Math.random() > 0.5 ? "cyan" : "green",
  });
}

function update(dt) {
  if (game.state !== "playing") return;

  game.time += dt;
  const scale = difficultyScale();
  game.speed = (265 + Math.min(120, game.score * 4)) * scale;
  game.spawnTimer -= dt;
  if (game.spawnTimer <= 0) {
    spawnObstacle();
    game.spawnTimer = Math.max(0.95, 1.55 - game.score * 0.018) / scale;
  }

  const gravity = 1120;
  const lift = game.inputDown ? -2180 : 0;
  game.bird.vy += (gravity + lift) * dt;
  game.bird.vy = Math.max(-520, Math.min(620, game.bird.vy));
  game.bird.y += game.bird.vy * dt;
  game.bird.tilt += ((game.inputDown ? -0.16 : 0.28) - game.bird.tilt) * 7 * dt;

  if (game.inputDown && Math.random() > 0.52) {
    game.particles.push({
      x: game.bird.x - game.bird.radius * 0.7,
      y: game.bird.y + game.bird.radius * 0.5,
      vx: -80 - Math.random() * 70,
      vy: 40 + Math.random() * 30,
      life: 0.45,
    });
  }

  for (const obstacle of game.obstacles) {
    obstacle.x -= game.speed * dt;
    if (!obstacle.passed && obstacle.x + obstacle.w < game.bird.x) {
      obstacle.passed = true;
      game.score += 1;
      scoreEl.textContent = game.score;
    }
  }

  game.obstacles = game.obstacles.filter((obstacle) => obstacle.x + obstacle.w > -40);
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);

  checkCollisions();
}

function checkCollisions() {
  const b = game.bird;
  if (b.y + b.radius >= game.height - 22) {
    endGame("floor");
    return;
  }

  if (b.y - b.radius <= 0) {
    b.y = b.radius;
    b.vy = 80;
  }

  for (const obstacle of game.obstacles) {
    const withinX = b.x + b.radius > obstacle.x && b.x - b.radius < obstacle.x + obstacle.w;
    const inGap = b.y - b.radius > obstacle.top && b.y + b.radius < obstacle.bottom;
    if (withinX && !inGap) {
      endGame("obstacle");
      return;
    }
  }
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, game.height);
  sky.addColorStop(0, "#8fd6ff");
  sky.addColorStop(0.62, "#c9f1ff");
  sky.addColorStop(1, "#f7f7d7");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, game.width, game.height);

  const cloudOffset = (game.time * 20) % (game.width + 220);
  drawCloud(game.width * 0.18 - cloudOffset, game.height * 0.17, 1.1);
  drawCloud(game.width * 0.62 - cloudOffset * 0.72, game.height * 0.31, 0.82);
  drawCloud(game.width * 0.95 - cloudOffset * 0.58, game.height * 0.12, 0.72);
  drawCloud(game.width * 0.18 - cloudOffset + game.width + 220, game.height * 0.17, 1.1);
  drawCloud(game.width * 0.62 - cloudOffset * 0.72 + game.width + 220, game.height * 0.31, 0.82);

  ctx.strokeStyle = "rgba(82, 135, 160, 0.13)";
  ctx.lineWidth = 2;
  const offset = (game.time * 28) % 56;
  for (let x = -offset; x < game.width + 56; x += 56) {
    ctx.beginPath();
    ctx.moveTo(x, game.height);
    ctx.quadraticCurveTo(x + 24, game.height * 0.72, x + 8, game.height * 0.42);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(255, 216, 93, 0.96)";
  ctx.beginPath();
  ctx.arc(game.width * 0.86, game.height * 0.14, 30, 0, Math.PI * 2);
  ctx.fill();
}

function drawCloud(x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.fillStyle = "rgba(255, 255, 255, 0.72)";
  ctx.beginPath();
  ctx.arc(0, 10, 22, Math.PI * 0.82, Math.PI * 1.88);
  ctx.arc(25, 0, 26, Math.PI, Math.PI * 2);
  ctx.arc(56, 11, 21, Math.PI * 1.12, Math.PI * 0.1);
  ctx.roundRect(-8, 8, 78, 25, 12);
  ctx.fill();
  ctx.restore();
}

function drawObstacles() {
  for (const obstacle of game.obstacles) {
    const color = obstacle.hue === "cyan" ? "#63d8df" : "#8dd867";
    drawColumn(obstacle.x, 0, obstacle.w, obstacle.top, color, true);
    drawColumn(obstacle.x, obstacle.bottom, obstacle.w, game.height - obstacle.bottom - 22, color, false);
  }
}

function drawColumn(x, y, w, h, color, top) {
  ctx.fillStyle = "rgba(76, 112, 82, 0.22)";
  ctx.fillRect(x + 8, y + 8, w, h);
  const grad = ctx.createLinearGradient(x, y, x + w, y);
  grad.addColorStop(0, color);
  grad.addColorStop(0.58, "#f0ffb0");
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "rgba(79, 134, 86, 0.4)";
  const capY = top ? y + h - 18 : y;
  ctx.fillRect(x - 8, capY, w + 16, 18);
}

function drawBird() {
  if (spriteFrames.some((frame) => frame.loaded)) {
    drawBirdSprite();
    return;
  }

  drawBirdFallback();
}

function drawBirdSprite() {
  const b = game.bird;
  const loadedFrames = spriteFrames.filter((frame) => frame.loaded);
  const hasSingleSource = spriteFrames[0].loaded;
  const flapSpeed = game.inputDown ? 18 : 9;
  const phase = Math.floor(game.time * flapSpeed) % 3;
  const frame = hasSingleSource
    ? spriteFrames[0].image
    : loadedFrames[Math.floor(game.time * flapSpeed) % loadedFrames.length].image;
  const size = b.radius * 3.85;
  const squash = hasSingleSource ? [1, 0.92, 1.08][phase] : 1;
  const stretch = hasSingleSource ? [1, 1.08, 0.92][phase] : 1;
  const bob = hasSingleSource ? [0, -b.radius * 0.12, b.radius * 0.1][phase] : 0;

  ctx.save();
  ctx.translate(b.x, b.y + bob);
  ctx.rotate((b.tilt + (hasSingleSource ? [0, -0.05, 0.04][phase] : 0)) * 0.55);
  ctx.scale(squash, stretch);
  ctx.drawImage(frame, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawBirdFallback() {
  const b = game.bird;
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(b.tilt * 0.38);

  const r = b.radius;
  const flap = Math.sin(game.time * (game.inputDown ? 24 : 12)) * (game.inputDown ? 0.26 : 0.12);

  ctx.fillStyle = "rgba(52, 79, 91, 0.16)";
  ctx.beginPath();
  ctx.ellipse(2, r * 0.92, r * 1.08, r * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.fillStyle = "#ffe86a";
  ctx.save();
  ctx.translate(-r * 0.82, r * 0.28);
  ctx.rotate(-0.3 - flap * 0.62);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.15, r * 0.42, -0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(r * 0.82, r * 0.28);
  ctx.rotate(0.3 + flap * 0.62);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.15, r * 0.42, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "#ffe86a";
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, -r * 1.08);
  ctx.bezierCurveTo(-r * 0.68, -r * 0.98, -r * 1.08, -r * 0.34, -r * 1.02, r * 0.34);
  ctx.bezierCurveTo(-r * 0.94, r * 0.96, -r * 0.42, r * 1.24, r * 0.16, r * 1.14);
  ctx.bezierCurveTo(r * 0.84, r * 1.02, r * 1.08, r * 0.46, r * 1.0, -r * 0.1);
  ctx.bezierCurveTo(r * 0.9, -r * 0.76, r * 0.46, -r * 1.08, -r * 0.1, -r * 1.08);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#ffe86a";
  ctx.beginPath();
  ctx.moveTo(-r * 0.18, -r * 1.02);
  ctx.lineTo(r * 0.02, -r * 1.34);
  ctx.lineTo(r * 0.04, -r * 1.02);
  ctx.lineTo(r * 0.34, -r * 1.28);
  ctx.lineTo(r * 0.22, -r * 0.92);
  ctx.lineTo(r * 0.54, -r * 1.1);
  ctx.lineTo(r * 0.34, -r * 0.76);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#050505";
  ctx.beginPath();
  ctx.arc(-r * 0.34, -r * 0.2, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 0.38, -r * 0.2, r * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#050505";
  ctx.lineWidth = Math.max(2, r * 0.1);
  ctx.fillStyle = "#ffe86a";
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.02);
  ctx.lineTo(r * 0.16, r * 0.14);
  ctx.lineTo(0, r * 0.3);
  ctx.lineTo(-r * 0.16, r * 0.14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life / 0.45);
    ctx.fillStyle = "#63d8df";
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawGround() {
  ctx.fillStyle = "#8ed46a";
  ctx.fillRect(0, game.height - 22, game.width, 22);
  ctx.fillStyle = "#fff5a6";
  const offset = (game.time * game.speed) % 34;
  for (let x = -offset; x < game.width + 34; x += 34) {
    ctx.fillRect(x, game.height - 22, 17, 4);
  }
}

function draw() {
  ctx.save();
  if (game.shake > 0) {
    game.shake *= 0.88;
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground();
  drawParticles();
  drawObstacles();
  drawBird();
  drawGround();
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.033, (now - game.lastTime) / 1000 || 0);
  game.lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  setInput(true);
});
canvas.addEventListener("pointerup", () => setInput(false));
canvas.addEventListener("pointercancel", () => setInput(false));
startButton.addEventListener("click", startGame);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space") {
    event.preventDefault();
    setInput(true);
  }
  if (event.key.toLowerCase() === "r") startGame();
});
window.addEventListener("keyup", (event) => {
  if (event.code === "Space") setInput(false);
});

resize();
requestAnimationFrame(frame);
