(() => {
  "use strict";

  const boardEl = document.getElementById("board");
  const scoreEl = document.getElementById("score");
  const bestScoreEl = document.getElementById("bestScore");
  const newGameButton = document.getElementById("newGameButton");
  const overlayNewButton = document.getElementById("overlayNewButton");
  const keepGoingButton = document.getElementById("keepGoingButton");
  const undoButton = document.getElementById("undoButton");
  const soundButton = document.getElementById("soundButton");
  const overlay = document.getElementById("overlay");
  const overlayKicker = document.getElementById("overlayKicker");
  const overlayTitle = document.getElementById("overlayTitle");
  const targetTileEl = document.getElementById("targetTile");

  const SIZE = 4;
  const WIN_TILE = 2048;
  const BEST_KEY = "number-2048-best";

  const state = {
    grid: createEmptyGrid(),
    score: 0,
    best: Number(localStorage.getItem(BEST_KEY) || 0),
    previous: null,
    tileId: 1,
    won: false,
    gameOver: false,
    keepGoing: false,
    muted: false,
    touchStart: null,
    blockedTimer: 0,
    audio: null,
  };

  bestScoreEl.textContent = state.best.toString();

  function createEmptyGrid() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(null));
  }

  function cloneGrid(grid) {
    return grid.map((row) => row.map((tile) => (tile ? { ...tile } : null)));
  }

  function startGame() {
    state.grid = createEmptyGrid();
    state.score = 0;
    state.previous = null;
    state.won = false;
    state.gameOver = false;
    state.keepGoing = false;
    state.tileId += 1;
    hideOverlay();
    addRandomTile();
    addRandomTile();
    render();
    boardEl.focus({ preventScroll: true });
  }

  function savePrevious() {
    state.previous = {
      grid: cloneGrid(state.grid),
      score: state.score,
      won: state.won,
      gameOver: state.gameOver,
      keepGoing: state.keepGoing,
    };
  }

  function undo() {
    if (!state.previous) return;

    state.grid = cloneGrid(state.previous.grid);
    state.score = state.previous.score;
    state.won = state.previous.won;
    state.gameOver = state.previous.gameOver;
    state.keepGoing = state.previous.keepGoing;
    state.previous = null;
    hideOverlay();
    render();
  }

  function addRandomTile() {
    const empties = [];

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if (!state.grid[row][col]) {
          empties.push({ row, col });
        }
      }
    }

    if (!empties.length) return false;

    const target = empties[Math.floor(Math.random() * empties.length)];
    state.grid[target.row][target.col] = {
      id: state.tileId,
      value: Math.random() < 0.9 ? 2 : 4,
      merged: false,
      fresh: true,
    };
    state.tileId += 1;
    return true;
  }

  function move(direction) {
    if (state.gameOver) return;

    savePrevious();
    clearTileFlags();

    const result =
      direction === "left" || direction === "right"
        ? moveRows(direction)
        : moveColumns(direction);

    if (!result.changed) {
      state.previous = null;
      render();
      showBlockedMove();
      return;
    }

    state.score += result.gained;
    updateBest();
    addRandomTile();
    playTone(220 + Math.min(result.gained, 900) / 4, 0.055, "triangle", 0.05);
    evaluateGameState();
    render();
  }

  function moveRows(direction) {
    let changed = false;
    let gained = 0;
    const nextGrid = createEmptyGrid();

    for (let row = 0; row < SIZE; row += 1) {
      const line = state.grid[row].filter(Boolean);
      const ordered = direction === "right" ? line.reverse() : line;
      const merged = mergeLine(ordered);
      gained += merged.gained;
      const tiles = direction === "right" ? merged.tiles.reverse() : merged.tiles;
      const startCol = direction === "right" ? SIZE - tiles.length : 0;

      for (let index = 0; index < tiles.length; index += 1) {
        nextGrid[row][startCol + index] = tiles[index];
      }
    }

    changed = !sameGrid(state.grid, nextGrid);
    state.grid = nextGrid;
    return { changed, gained };
  }

  function moveColumns(direction) {
    let changed = false;
    let gained = 0;
    const nextGrid = createEmptyGrid();

    for (let col = 0; col < SIZE; col += 1) {
      const line = [];
      for (let row = 0; row < SIZE; row += 1) {
        if (state.grid[row][col]) line.push(state.grid[row][col]);
      }

      const ordered = direction === "down" ? line.reverse() : line;
      const merged = mergeLine(ordered);
      gained += merged.gained;
      const tiles = direction === "down" ? merged.tiles.reverse() : merged.tiles;
      const startRow = direction === "down" ? SIZE - tiles.length : 0;

      for (let index = 0; index < tiles.length; index += 1) {
        nextGrid[startRow + index][col] = tiles[index];
      }
    }

    changed = !sameGrid(state.grid, nextGrid);
    state.grid = nextGrid;
    return { changed, gained };
  }

  function mergeLine(tiles) {
    const result = [];
    let gained = 0;

    for (let index = 0; index < tiles.length; index += 1) {
      const current = tiles[index];
      const next = tiles[index + 1];

      if (next && current.value === next.value) {
        const value = current.value * 2;
        result.push({
          id: state.tileId,
          value,
          merged: true,
          fresh: false,
        });
        state.tileId += 1;
        gained += value;
        index += 1;
      } else {
        result.push({
          ...current,
          merged: false,
          fresh: false,
        });
      }
    }

    return { tiles: result, gained };
  }

  function sameGrid(a, b) {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        if ((a[row][col]?.value || 0) !== (b[row][col]?.value || 0)) {
          return false;
        }
      }
    }
    return true;
  }

  function clearTileFlags() {
    for (const row of state.grid) {
      for (const tile of row) {
        if (tile) {
          tile.fresh = false;
          tile.merged = false;
        }
      }
    }
  }

  function updateBest() {
    if (state.score <= state.best) return;

    state.best = state.score;
    localStorage.setItem(BEST_KEY, state.best.toString());
  }

  function evaluateGameState() {
    const maxTile = Math.max(...state.grid.flat().map((tile) => tile?.value || 0));

    if (maxTile >= WIN_TILE && !state.won) {
      state.won = true;
      state.keepGoing = true;
      playTone(560, 0.13, "sine", 0.06);
    }

    if (!canMove()) {
      state.gameOver = true;
      showOverlay("게임 오버", `${state.score}점`);
      playTone(145, 0.16, "sawtooth", 0.035);
    }
  }

  function canMove() {
    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const tile = state.grid[row][col];
        if (!tile) return true;
        if (col < SIZE - 1 && state.grid[row][col + 1]?.value === tile.value) return true;
        if (row < SIZE - 1 && state.grid[row + 1][col]?.value === tile.value) return true;
      }
    }

    return false;
  }

  function render() {
    boardEl.querySelectorAll(".tile").forEach((tile) => tile.remove());
    scoreEl.textContent = state.score.toString();
    bestScoreEl.textContent = state.best.toString();
    undoButton.disabled = !state.previous;
    targetTileEl.textContent = getTargetTile().toString();

    const boardRect = boardEl.getBoundingClientRect();
    const styles = window.getComputedStyle(boardEl);
    const gap = Number.parseFloat(styles.gap);
    const padding = Number.parseFloat(styles.paddingLeft);
    const tileSize = (boardRect.width - padding * 2 - gap * (SIZE - 1)) / SIZE;

    for (let row = 0; row < SIZE; row += 1) {
      for (let col = 0; col < SIZE; col += 1) {
        const tile = state.grid[row][col];
        if (!tile) continue;

        const tileEl = document.createElement("div");
        tileEl.className = getTileClass(tile);
        tileEl.textContent = tile.value.toString();
        tileEl.style.width = `${tileSize}px`;
        tileEl.style.height = `${tileSize}px`;
        tileEl.style.left = `${padding + col * (tileSize + gap)}px`;
        tileEl.style.top = `${padding + row * (tileSize + gap)}px`;
        tileEl.style.fontSize = `${getFontSize(tile.value, tileSize)}px`;
        boardEl.append(tileEl);
      }
    }
  }

  function showBlockedMove() {
    window.clearTimeout(state.blockedTimer);
    boardEl.classList.remove("is-blocked");
    void boardEl.offsetWidth;
    boardEl.classList.add("is-blocked");
    state.blockedTimer = window.setTimeout(() => {
      boardEl.classList.remove("is-blocked");
    }, 180);
    playTone(120, 0.035, "square", 0.025);
  }

  function getTileClass(tile) {
    const classes = ["tile"];
    classes.push(tile.value <= WIN_TILE ? `tile-${tile.value}` : "tile-super");
    if (tile.fresh) classes.push("tile-new");
    if (tile.merged) classes.push("tile-merged");
    return classes.join(" ");
  }

  function getFontSize(value, tileSize) {
    const digits = value.toString().length;
    if (digits <= 2) return tileSize * 0.42;
    if (digits === 3) return tileSize * 0.34;
    return tileSize * 0.27;
  }

  function getTargetTile() {
    const maxTile = Math.max(...state.grid.flat().map((tile) => tile?.value || 0));
    if (maxTile < WIN_TILE) return WIN_TILE;
    return maxTile * 2;
  }

  function showOverlay(kicker, title) {
    overlayKicker.textContent = kicker;
    overlayTitle.textContent = title;
    overlay.classList.remove("is-hidden");
    keepGoingButton.hidden = state.gameOver;
  }

  function hideOverlay() {
    overlay.classList.add("is-hidden");
  }

  function continueAfterWin() {
    state.keepGoing = true;
    hideOverlay();
    render();
    boardEl.focus({ preventScroll: true });
  }

  function directionFromKey(key) {
    if (key === "ArrowLeft" || key.toLowerCase() === "a") return "left";
    if (key === "ArrowRight" || key.toLowerCase() === "d") return "right";
    if (key === "ArrowUp" || key.toLowerCase() === "w") return "up";
    if (key === "ArrowDown" || key.toLowerCase() === "s") return "down";
    return "";
  }

  function playTone(frequency, duration, type, gain) {
    if (state.muted) return;

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

  window.addEventListener("keydown", (event) => {
    const direction = directionFromKey(event.key);
    if (direction) {
      event.preventDefault();
      move(direction);
    }

    if (event.key.toLowerCase() === "r") {
      startGame();
    }

    if (event.key.toLowerCase() === "u") {
      undo();
    }
  });

  boardEl.addEventListener("pointerdown", (event) => {
    state.touchStart = {
      x: event.clientX,
      y: event.clientY,
    };
  });

  boardEl.addEventListener("pointerup", (event) => {
    if (!state.touchStart) return;

    const dx = event.clientX - state.touchStart.x;
    const dy = event.clientY - state.touchStart.y;
    state.touchStart = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;

    const direction =
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up";
    move(direction);
  });

  window.addEventListener("resize", render);
  newGameButton.addEventListener("click", startGame);
  overlayNewButton.addEventListener("click", startGame);
  keepGoingButton.addEventListener("click", continueAfterWin);
  undoButton.addEventListener("click", undo);
  document.querySelectorAll("[data-direction]").forEach((button) => {
    button.addEventListener("click", () => {
      move(button.dataset.direction);
      boardEl.focus({ preventScroll: true });
    });
  });
  soundButton.addEventListener("click", () => {
    state.muted = !state.muted;
    soundButton.classList.toggle("is-active", state.muted);
    soundButton.setAttribute("aria-label", state.muted ? "소리 켜기" : "소리 끄기");
    soundButton.title = state.muted ? "소리 켜기" : "소리 끄기";
  });

  startGame();
})();
