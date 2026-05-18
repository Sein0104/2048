(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const nextCanvas = document.getElementById("nextCanvas");
  const nextCtx = nextCanvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const bestScoreEl = document.getElementById("bestScore");
  const restartButton = document.getElementById("restartButton");
  const pauseButton = document.getElementById("pauseButton");
  const muteButton = document.getElementById("muteButton");
  const overlay = document.getElementById("gameOverlay");
  const overlayKicker = document.getElementById("overlayKicker");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayRestart = document.getElementById("overlayRestart");

  const BOARD_WIDTH = 420;
  const BOARD_HEIGHT = 640;
  const WALL_THICKNESS = 44;
  const DROP_Y = 72;
  const LOSE_LINE_Y = 92;
  const DROP_COOLDOWN = 420;
  const PHYSICS_STEP = 1000 / 60;
  const STORAGE_KEY = "watermelon-game-best";

  const FRUITS = [
    {
      name: "체리",
      radius: 16,
      score: 1,
      fill: "#d93947",
      dark: "#a9142b",
      light: "#ff8b8c",
      seed: "#6f0f1c",
    },
    {
      name: "딸기",
      radius: 22,
      score: 3,
      fill: "#f05259",
      dark: "#bf2436",
      light: "#ffb4a6",
      seed: "#ffe6a8",
    },
    {
      name: "포도",
      radius: 28,
      score: 6,
      fill: "#7b5bc7",
      dark: "#49328f",
      light: "#bca9ff",
      seed: "#3b2675",
    },
    {
      name: "귤",
      radius: 35,
      score: 10,
      fill: "#f59c30",
      dark: "#ca6723",
      light: "#ffd277",
      seed: "#e27b27",
    },
    {
      name: "사과",
      radius: 43,
      score: 15,
      fill: "#e8423d",
      dark: "#a7252f",
      light: "#ff9783",
      seed: "#8f1d24",
    },
    {
      name: "배",
      radius: 52,
      score: 21,
      fill: "#e0d65d",
      dark: "#a99c33",
      light: "#fff3a2",
      seed: "#9a8334",
    },
    {
      name: "복숭아",
      radius: 62,
      score: 28,
      fill: "#ffb06d",
      dark: "#dc7056",
      light: "#ffd3a3",
      seed: "#cc5f62",
    },
    {
      name: "파인애플",
      radius: 73,
      score: 36,
      fill: "#efc83f",
      dark: "#b98524",
      light: "#fff18c",
      seed: "#9a6e1d",
    },
    {
      name: "멜론",
      radius: 84,
      score: 45,
      fill: "#89c966",
      dark: "#4f943f",
      light: "#ccf2a4",
      seed: "#3f7e35",
    },
    {
      name: "수박",
      radius: 98,
      score: 55,
      fill: "#3bb35f",
      dark: "#176d3c",
      light: "#8ee28b",
      seed: "#183322",
    },
  ];

  const state = {
    engine: null,
    runnerFrame: 0,
    fruits: [],
    score: 0,
    best: Number(localStorage.getItem(STORAGE_KEY) || 0),
    aimX: BOARD_WIDTH / 2,
    currentLevel: 0,
    nextLevel: 0,
    lastDropAt: 0,
    isGameOver: false,
    isPaused: false,
    isMuted: false,
    dangerStartedAt: 0,
    mergeSerial: 0,
    audio: null,
  };

  if (!window.Matter) {
    showOverlay("불러오기 실패", "Matter.js를 불러오지 못했어요");
    return;
  }

  const {
    Bodies,
    Body,
    Composite,
    Engine,
    Events,
    World,
  } = window.Matter;

  bestScoreEl.textContent = state.best.toString();

  function createEngine() {
    const engine = Engine.create({
      gravity: { x: 0, y: 1.04 },
      positionIterations: 10,
      velocityIterations: 8,
    });

    const floor = Bodies.rectangle(
      BOARD_WIDTH / 2,
      BOARD_HEIGHT + WALL_THICKNESS / 2,
      BOARD_WIDTH + WALL_THICKNESS * 2,
      WALL_THICKNESS,
      {
        isStatic: true,
        label: "floor",
        render: { visible: false },
      },
    );
    const leftWall = Bodies.rectangle(
      -WALL_THICKNESS / 2,
      BOARD_HEIGHT / 2,
      WALL_THICKNESS,
      BOARD_HEIGHT * 2,
      {
        isStatic: true,
        label: "wall",
        render: { visible: false },
      },
    );
    const rightWall = Bodies.rectangle(
      BOARD_WIDTH + WALL_THICKNESS / 2,
      BOARD_HEIGHT / 2,
      WALL_THICKNESS,
      BOARD_HEIGHT * 2,
      {
        isStatic: true,
        label: "wall",
        render: { visible: false },
      },
    );

    World.add(engine.world, [floor, leftWall, rightWall]);
    Events.on(engine, "collisionStart", handleCollisions);
    return engine;
  }

  function resetGame() {
    if (state.runnerFrame) {
      cancelAnimationFrame(state.runnerFrame);
    }

    state.engine = createEngine();
    state.fruits = [];
    state.score = 0;
    state.aimX = BOARD_WIDTH / 2;
    state.currentLevel = randomSpawnLevel();
    state.nextLevel = randomSpawnLevel();
    state.lastDropAt = 0;
    state.isGameOver = false;
    state.isPaused = false;
    state.dangerStartedAt = 0;
    pauseButton.classList.remove("is-active");
    pauseButton.setAttribute("aria-label", "일시정지");
    pauseButton.title = "일시정지";
    hideOverlay();
    updateScore(0);
    drawNextFruit();
    runLoop();
  }

  function runLoop() {
    let lastTime = performance.now();
    let accumulator = 0;

    const tick = (time) => {
      const delta = Math.min(time - lastTime, 100);
      lastTime = time;

      if (!state.isPaused && !state.isGameOver) {
        accumulator += delta;
        while (accumulator >= PHYSICS_STEP) {
          Engine.update(state.engine, PHYSICS_STEP);
          accumulator -= PHYSICS_STEP;
        }
        checkGameOver(time);
      }

      drawGame(time);
      state.runnerFrame = requestAnimationFrame(tick);
    };

    state.runnerFrame = requestAnimationFrame(tick);
  }

  function randomSpawnLevel() {
    const roll = Math.random();
    if (roll < 0.42) return 0;
    if (roll < 0.72) return 1;
    if (roll < 0.9) return 2;
    return 3;
  }

  function createFruit(level, x, y) {
    const fruit = FRUITS[level];
    const body = Bodies.circle(x, y, fruit.radius, {
      label: "fruit",
      restitution: 0.13,
      friction: 0.32,
      frictionStatic: 0.7,
      density: 0.0014 + level * 0.00009,
      slop: 0.02,
    });

    body.plugin.fruitLevel = level;
    body.plugin.birthTime = performance.now();
    body.plugin.mergeLock = false;
    body.plugin.spin = (Math.random() - 0.5) * 0.03;
    Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.06);
    return body;
  }

  function dropFruit() {
    if (state.isGameOver || state.isPaused) return;

    const now = performance.now();
    if (now - state.lastDropAt < DROP_COOLDOWN) return;

    const level = state.currentLevel;
    const radius = FRUITS[level].radius;
    const x = clamp(state.aimX, radius + 4, BOARD_WIDTH - radius - 4);
    const body = createFruit(level, x, DROP_Y);

    state.fruits.push(body);
    World.add(state.engine.world, body);
    state.currentLevel = state.nextLevel;
    state.nextLevel = randomSpawnLevel();
    state.lastDropAt = now;
    playTone(230 + level * 28, 0.045, "triangle", 0.07);
    drawNextFruit();
  }

  function handleCollisions(event) {
    for (const pair of event.pairs) {
      const { bodyA, bodyB } = pair;
      if (!isMergeCandidate(bodyA, bodyB)) continue;

      const level = bodyA.plugin.fruitLevel;
      if (level >= FRUITS.length - 1) continue;

      bodyA.plugin.mergeLock = true;
      bodyB.plugin.mergeLock = true;
      const mergeId = ++state.mergeSerial;

      requestAnimationFrame(() => {
        mergeFruits(bodyA, bodyB, level + 1, mergeId);
      });
    }
  }

  function isMergeCandidate(bodyA, bodyB) {
    return (
      bodyA.label === "fruit" &&
      bodyB.label === "fruit" &&
      !bodyA.plugin.mergeLock &&
      !bodyB.plugin.mergeLock &&
      bodyA.plugin.fruitLevel === bodyB.plugin.fruitLevel
    );
  }

  function mergeFruits(bodyA, bodyB, nextLevel) {
    if (!Composite.get(state.engine.world, bodyA.id, "body")) return;
    if (!Composite.get(state.engine.world, bodyB.id, "body")) return;

    const x = (bodyA.position.x + bodyB.position.x) / 2;
    const y = (bodyA.position.y + bodyB.position.y) / 2;
    const velocity = {
      x: (bodyA.velocity.x + bodyB.velocity.x) / 2,
      y: (bodyA.velocity.y + bodyB.velocity.y) / 2 - 1.4,
    };

    World.remove(state.engine.world, [bodyA, bodyB]);
    state.fruits = state.fruits.filter((body) => body !== bodyA && body !== bodyB);

    const merged = createFruit(nextLevel, x, y);
    Body.setVelocity(merged, velocity);
    state.fruits.push(merged);
    World.add(state.engine.world, merged);
    updateScore(FRUITS[nextLevel].score);
    playTone(300 + nextLevel * 38, 0.07, "sine", 0.1);
  }

  function updateScore(amount) {
    state.score += amount;
    scoreEl.textContent = state.score.toString();

    if (state.score > state.best) {
      state.best = state.score;
      localStorage.setItem(STORAGE_KEY, state.best.toString());
      bestScoreEl.textContent = state.best.toString();
    }
  }

  function checkGameOver(time) {
    if (state.fruits.length < 2) return;

    const inDanger = state.fruits.some((body) => {
      const level = body.plugin.fruitLevel;
      const radius = FRUITS[level].radius;
      const hasSettled = performance.now() - body.plugin.birthTime > 950;
      return hasSettled && body.position.y - radius < LOSE_LINE_Y && Math.abs(body.velocity.y) < 0.45;
    });

    if (!inDanger) {
      state.dangerStartedAt = 0;
      return;
    }

    if (!state.dangerStartedAt) {
      state.dangerStartedAt = time;
      return;
    }

    if (time - state.dangerStartedAt > 1450) {
      endGame();
    }
  }

  function endGame() {
    state.isGameOver = true;
    showOverlay("게임 오버", `점수 ${state.score}점`);
    playTone(160, 0.14, "sawtooth", 0.055);
  }

  function togglePause() {
    if (state.isGameOver) return;

    state.isPaused = !state.isPaused;
    pauseButton.classList.toggle("is-active", state.isPaused);
    pauseButton.setAttribute("aria-label", state.isPaused ? "계속하기" : "일시정지");
    pauseButton.title = state.isPaused ? "계속하기" : "일시정지";

    if (state.isPaused) {
      showOverlay("일시정지", "잠깐 쉬는 중");
    } else {
      hideOverlay();
    }
  }

  function showOverlay(kicker, title) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlay.classList.remove("is-hidden");
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function drawGame(time) {
    ctx.clearRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);
    drawBoard();
    drawAim();

    const bodies = [...state.fruits].sort((a, b) => a.position.y - b.position.y);
    for (const body of bodies) {
      drawFruit(ctx, body.plugin.fruitLevel, body.position.x, body.position.y, body.angle, 1);
    }

    drawHeldFruit(time);
  }

  function drawBoard() {
    const boardGradient = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
    boardGradient.addColorStop(0, "#ffe8b7");
    boardGradient.addColorStop(1, "#f6c986");
    ctx.fillStyle = boardGradient;
    ctx.fillRect(0, 0, BOARD_WIDTH, BOARD_HEIGHT);

    ctx.fillStyle = "rgba(139, 86, 45, 0.09)";
    for (let y = 0; y < BOARD_HEIGHT; y += 28) {
      ctx.fillRect(0, y, BOARD_WIDTH, 1);
    }

    ctx.save();
    ctx.setLineDash([8, 9]);
    ctx.strokeStyle = "rgba(190, 62, 56, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(18, LOSE_LINE_Y);
    ctx.lineTo(BOARD_WIDTH - 18, LOSE_LINE_Y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "rgba(97, 58, 35, 0.18)";
    ctx.fillRect(0, BOARD_HEIGHT - 10, BOARD_WIDTH, 10);
  }

  function drawAim() {
    if (state.isGameOver || state.isPaused) return;

    const radius = FRUITS[state.currentLevel].radius;
    const x = clamp(state.aimX, radius + 4, BOARD_WIDTH - radius - 4);
    ctx.save();
    ctx.strokeStyle = "rgba(50, 38, 28, 0.27)";
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 8]);
    ctx.beginPath();
    ctx.moveTo(x, 18);
    ctx.lineTo(x, BOARD_HEIGHT - 12);
    ctx.stroke();
    ctx.restore();
  }

  function drawHeldFruit(time) {
    if (state.isGameOver || state.isPaused) return;

    const radius = FRUITS[state.currentLevel].radius;
    const x = clamp(state.aimX, radius + 4, BOARD_WIDTH - radius - 4);
    const bob = Math.sin(time / 180) * 2.5;
    ctx.save();
    ctx.globalAlpha = 0.86;
    drawFruit(ctx, state.currentLevel, x, DROP_Y + bob, 0, 1);
    ctx.restore();
  }

  function drawNextFruit() {
    nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextCtx.fillStyle = "#fff7df";
    nextCtx.beginPath();
    nextCtx.arc(60, 60, 54, 0, Math.PI * 2);
    nextCtx.fill();
    const fruit = FRUITS[state.nextLevel];
    const scale = Math.min(1.12, 45 / fruit.radius);
    drawFruit(nextCtx, state.nextLevel, 60, 62, -0.15, scale);
  }

  function drawFruit(targetCtx, level, x, y, angle, scale) {
    const fruit = FRUITS[level];
    const radius = fruit.radius * scale;

    targetCtx.save();
    targetCtx.translate(x, y);
    targetCtx.rotate(angle);

    const gradient = targetCtx.createRadialGradient(
      -radius * 0.38,
      -radius * 0.45,
      radius * 0.12,
      0,
      0,
      radius,
    );
    gradient.addColorStop(0, fruit.light);
    gradient.addColorStop(0.62, fruit.fill);
    gradient.addColorStop(1, fruit.dark);

    targetCtx.fillStyle = "rgba(75, 47, 28, 0.18)";
    targetCtx.beginPath();
    targetCtx.ellipse(radius * 0.1, radius * 0.22, radius * 0.88, radius * 0.76, 0, 0, Math.PI * 2);
    targetCtx.fill();

    targetCtx.fillStyle = gradient;
    targetCtx.beginPath();
    targetCtx.arc(0, 0, radius, 0, Math.PI * 2);
    targetCtx.fill();

    targetCtx.strokeStyle = "rgba(255, 255, 255, 0.36)";
    targetCtx.lineWidth = Math.max(1.4, radius * 0.045);
    targetCtx.beginPath();
    targetCtx.arc(-radius * 0.1, -radius * 0.07, radius * 0.74, Math.PI * 1.13, Math.PI * 1.78);
    targetCtx.stroke();

    drawFruitDetails(targetCtx, fruit, level, radius);
    drawStem(targetCtx, radius);

    targetCtx.restore();
  }

  function drawStem(targetCtx, radius) {
    targetCtx.save();
    targetCtx.strokeStyle = "#6b4a27";
    targetCtx.lineWidth = Math.max(2, radius * 0.08);
    targetCtx.lineCap = "round";
    targetCtx.beginPath();
    targetCtx.moveTo(-radius * 0.06, -radius * 0.9);
    targetCtx.quadraticCurveTo(radius * 0.08, -radius * 1.17, radius * 0.28, -radius * 1.05);
    targetCtx.stroke();

    targetCtx.fillStyle = "#5da95a";
    targetCtx.beginPath();
    targetCtx.ellipse(radius * 0.36, -radius * 0.98, radius * 0.18, radius * 0.09, -0.45, 0, Math.PI * 2);
    targetCtx.fill();
    targetCtx.restore();
  }

  function drawFruitDetails(targetCtx, fruit, level, radius) {
    if (level === 7 || level === 8 || level === 9) {
      targetCtx.save();
      targetCtx.strokeStyle = level === 9 ? "#174f2f" : "rgba(115, 91, 31, 0.32)";
      targetCtx.lineWidth = Math.max(1.2, radius * 0.035);
      for (let offset = -0.55; offset <= 0.55; offset += 0.28) {
        targetCtx.beginPath();
        targetCtx.ellipse(offset * radius, 0, radius * 0.16, radius * 0.94, 0.08, 0, Math.PI * 2);
        targetCtx.stroke();
      }
      targetCtx.restore();
    }

    if (level === 1 || level === 9) {
      targetCtx.fillStyle = level === 9 ? "#23221b" : fruit.seed;
      const seedCount = level === 9 ? 10 : 13;
      for (let index = 0; index < seedCount; index += 1) {
        const ring = index % 2 === 0 ? 0.46 : 0.22;
        const theta = (index / seedCount) * Math.PI * 2 + 0.4;
        const sx = Math.cos(theta) * radius * ring;
        const sy = Math.sin(theta) * radius * ring;
        targetCtx.beginPath();
        targetCtx.ellipse(sx, sy, radius * 0.045, radius * 0.085, theta, 0, Math.PI * 2);
        targetCtx.fill();
      }
    }

    if (level === 2) {
      targetCtx.fillStyle = "rgba(255, 255, 255, 0.2)";
      for (let index = 0; index < 5; index += 1) {
        const theta = (index / 5) * Math.PI * 2;
        targetCtx.beginPath();
        targetCtx.arc(Math.cos(theta) * radius * 0.38, Math.sin(theta) * radius * 0.35, radius * 0.2, 0, Math.PI * 2);
        targetCtx.fill();
      }
    }

    if (level === 3) {
      targetCtx.strokeStyle = "rgba(255, 255, 255, 0.24)";
      targetCtx.lineWidth = Math.max(1, radius * 0.04);
      for (let index = -2; index <= 2; index += 1) {
        targetCtx.beginPath();
        targetCtx.arc(index * radius * 0.16, 0, radius * 0.58, -0.4, 0.4);
        targetCtx.stroke();
      }
    }
  }

  function updateAimFromClientX(clientX) {
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * BOARD_WIDTH;
    const radius = FRUITS[state.currentLevel].radius;
    state.aimX = clamp(x, radius + 4, BOARD_WIDTH - radius - 4);
  }

  function playTone(frequency, duration, type, gain) {
    if (state.isMuted) return;

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    if (!state.audio) {
      state.audio = new AudioContext();
    }

    const now = state.audio.currentTime;
    const osc = state.audio.createOscillator();
    const amp = state.audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(state.audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  canvas.addEventListener("pointermove", (event) => {
    updateAimFromClientX(event.clientX);
  });

  canvas.addEventListener("pointerdown", (event) => {
    updateAimFromClientX(event.clientX);
    dropFruit();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "a") {
      state.aimX -= 18;
      event.preventDefault();
    }

    if (event.key === "ArrowRight" || event.key === "d") {
      state.aimX += 18;
      event.preventDefault();
    }

    const radius = FRUITS[state.currentLevel].radius;
    state.aimX = clamp(state.aimX, radius + 4, BOARD_WIDTH - radius - 4);

    if (event.key === " " || event.key === "Enter") {
      dropFruit();
      event.preventDefault();
    }

    if (event.key.toLowerCase() === "p") {
      togglePause();
    }

    if (event.key.toLowerCase() === "r") {
      resetGame();
    }
  });

  restartButton.addEventListener("click", resetGame);
  overlayRestart.addEventListener("click", resetGame);
  pauseButton.addEventListener("click", togglePause);
  muteButton.addEventListener("click", () => {
    state.isMuted = !state.isMuted;
    muteButton.classList.toggle("is-active", state.isMuted);
    muteButton.setAttribute("aria-label", state.isMuted ? "소리 켜기" : "소리 끄기");
    muteButton.title = state.isMuted ? "소리 켜기" : "소리 끄기";
  });

  resetGame();
})();
