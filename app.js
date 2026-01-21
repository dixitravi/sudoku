
// app.js

// ---------- State ----------

const state = {
  name: "",
  mode: null,           // "easy" | "medium" | "hard"
  size: null,           // 4 or 6
  solvedGrid: null,     // 2D array
  puzzleGrid: null,     // 2D array with nulls for blanks
  notes: {},            // key "r-c" -> Set<number>
  isNotesMode: false,
  selectedCell: null,
  timerId: null,
  elapsedSeconds: 0,
  score: 0,
  gameActive: false,
  undoStack: [],        // {r, c, prevValue, prevNotes: number[] | null}
  givens: new Set(),    // keys "r-c" for pre-filled cells (non-editable)
};

// ---------- DOM refs ----------

const landingSection = document.getElementById("landing-section");
const gameSection = document.getElementById("game-section");
const startGameBtn = document.getElementById("startGameBtn");
const playerNameInput = document.getElementById("playerName");
const playerNameDisplay = document.getElementById("playerNameDisplay");
const gameSubtitle = document.getElementById("gameSubtitle");

const modeButtons = Array.from(document.querySelectorAll(".mode-pill"));
const sizeButtons = Array.from(document.querySelectorAll(".size-pill"));
const modeDescription = document.getElementById("modeDescription");

const modeDisplay = document.getElementById("modeDisplay");
const sizeDisplay = document.getElementById("sizeDisplay");
const timerDisplay = document.getElementById("timerDisplay");
const scoreDisplay = document.getElementById("scoreDisplay");
const highScoreDisplay = document.getElementById("highScoreDisplay");

const boardEl = document.getElementById("board");
const keypadEl = document.getElementById("keypad");

const notesToggleBtn = document.getElementById("notesToggleBtn");
const checkBtn = document.getElementById("checkBtn");
const hintBtn = document.getElementById("hintBtn");
const newPuzzleBtn = document.getElementById("newPuzzleBtn");
const solutionBtn = document.getElementById("solutionBtn");

const statusMessageEl = document.getElementById("statusMessage");
const errorMessageEl = document.getElementById("errorMessage");

const completionOverlay = document.getElementById("completionOverlay");
const finalTimeEl = document.getElementById("finalTime");
const finalScoreEl = document.getElementById("finalScore");
const playAgainBtn = document.getElementById("playAgainBtn");
const changeSettingsBtn = document.getElementById("changeSettingsBtn");
const confettiLayer = document.getElementById("confettiLayer");

const undoBtn = document.getElementById('undoBtn');
const shareBtn = document.getElementById('shareBtn');
const backBtn = document.getElementById('backBtn');

// ---------- Audio / voice ----------

let audioCtx;

function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function playBlip({ freq = 660, duration = 0.12, type = "sine" } = {}) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    gain.gain.setValueAtTime(0.21, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio errors
  }
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 1.1;
  utter.pitch = 1.1;
  window.speechSynthesis.speak(utter);
}

function announceStatus(msg) {
  statusMessageEl.textContent = msg;
  speak(msg);
}

function announceError(msg) {
  errorMessageEl.textContent = msg;
  speak(msg);
}

// ---------- Utility ----------

function keyFor(r, c) {
  return `${r}-${c}`;
}

function clampScore() {
  if (state.score < 0) state.score = 0;
}

function toBlobAsync(canvas, type = 'image/png', quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function computeGivensFromPuzzle(puzzle) {
  const set = new Set();
  const size = puzzle.length;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (puzzle[r][c] != null) {
        set.add(keyFor(r, c));
      }
    }
  }
  return set;
}

// Check if placing `val` at (r,c) violates Sudoku rules in current grid
function violatesRules(r, c, val) {
  const size = state.size;
  const grid = state.puzzleGrid;

  // row / column
  for (let i = 0; i < size; i++) {
    if (i !== c && grid[r][i] === val) return true;
    if (i !== r && grid[i][c] === val) return true;
  }
  // block
  const blockRows = 2;
  const blockCols = (size === 4) ? 2 : 3;
  const br = Math.floor(r / blockRows) * blockRows;
  const bc = Math.floor(c / blockCols) * blockCols;
  for (let rr = 0; rr < blockRows; rr++) {
    for (let cc = 0; cc < blockCols; cc++) {
      const R = br + rr, C = bc + cc;
      if (R === r && C === c) continue;
      if (grid[R][C] === val) return true;
    }
  }
  return false;
}

// ---------- Generators: 4x4 & 6x6 ----------

function generateSolved4x4() {
  const base = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1],
  ];
  const grid = base.map(row => row.slice());

  const swapRows = (r1, r2) => {
    [grid[r1], grid[r2]] = [grid[r2], grid[r1]];
  };
  const swapCols = (c1, c2) => {
    for (let r = 0; r < 4; r++) {
      [grid[r][c1], grid[r][c2]] = [grid[r][c2], grid[r][c1]];
    }
  };

  if (Math.random() > 0.5) swapRows(0, 1);
  if (Math.random() > 0.5) swapRows(2, 3);
  if (Math.random() > 0.5) swapCols(0, 1);
  if (Math.random() > 0.5) swapCols(2, 3);

  return grid;
}

// 6x6 with 3x2 blocks
function generateSolved6x6() {
  const size = 6;
  const grid = Array.from({ length: size }, () => Array(size).fill(0));

  function isSafe(r, c, n) {
    for (let i = 0; i < size; i++) {
      if (grid[r][i] === n || grid[i][c] === n) return false;
    }
    const blockRow = Math.floor(r / 2) * 2;
    const blockCol = Math.floor(c / 3) * 3;
    for (let rr = 0; rr < 2; rr++) {
      for (let cc = 0; cc < 3; cc++) {
        if (grid[blockRow + rr][blockCol + cc] === n) return false;
      }
    }
    return true;
  }

  function fillCell(index) {
    if (index === size * size) return true;
    const r = Math.floor(index / size);
    const c = index % size;

    const nums = [1, 2, 3, 4, 5, 6];
    for (let i = nums.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [nums[i], nums[j]] = [nums[j], nums[i]];
    }

    for (const n of nums) {
      if (isSafe(r, c, n)) {
        grid[r][c] = n;
        if (fillCell(index + 1)) return true;
        grid[r][c] = 0;
      }
    }
    return false;
  }

  fillCell(0);
  return grid;
}

function makePuzzle(grid, difficulty) {
  const size = grid.length;
  const puzzle = grid.map(row => row.slice());

  let removeCount;
  if (difficulty === "easy") {
    removeCount = size === 4 ? 4 : 8;
  } else if (difficulty === "medium") {
    removeCount = size === 4 ? 6 : 12;
  } else {
    removeCount = size === 4 ? 8 : 16;
  }

  const positions = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      positions.push({ r, c });
    }
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }

  let removed = 0;
  for (const pos of positions) {
    if (removed >= removeCount) break;
    puzzle[pos.r][pos.c] = null;
    removed++;
  }

  return puzzle;
}

// ---------- Generate puzzle (single source of truth) ----------

function generatePuzzle() {
  const size = state.size;
  const mode = state.mode || "easy";
  state.solvedGrid = size === 4 ? generateSolved4x4() : generateSolved6x6();
  state.puzzleGrid = makePuzzle(state.solvedGrid, mode);
  state.givens = computeGivensFromPuzzle(state.puzzleGrid);
}

// ---------- Save / Load / High Score ----------

function serializeNotes(notesObj) {
  const out = {};
  for (const k in notesObj) {
    const v = notesObj[k];
    if (v instanceof Set) out[k] = Array.from(v);
    else if (Array.isArray(v)) out[k] = v.slice();
  }
  return out;
}

function deserializeNotes(notesObj) {
  const out = {};
  for (const k in notesObj || {}) {
    const v = notesObj[k];
    if (Array.isArray(v)) out[k] = new Set(v);
  }
  return out;
}

function saveGame() {
  const save = {
    puzzleGrid: state.puzzleGrid,
    solvedGrid: state.solvedGrid,
    notes: serializeNotes(state.notes),
    elapsedSeconds: state.elapsedSeconds,
    score: state.score,
    mode: state.mode,
    size: state.size,
    name: state.name,
    undoStack: state.undoStack.slice(-10),
    givens: Array.from(state.givens),
  };
  try {
    localStorage.setItem('kidoSudokuSave', JSON.stringify(save));
  } catch {
    // ignore storage errors
  }
}

function loadGame() {
  try {
    const save = localStorage.getItem('kidoSudokuSave');
    if (!save) return null;
    const data = JSON.parse(save);
    return {
      puzzleGrid: data.puzzleGrid,
      solvedGrid: data.solvedGrid,
      notes: deserializeNotes(data.notes),
      elapsedSeconds: Number(data.elapsedSeconds || 0),
      score: Number(data.score || 0),
      mode: data.mode,
      size: data.size,
      name: data.name || "",
      undoStack: Array.isArray(data.undoStack) ? data.undoStack : [],
      givens: new Set(Array.isArray(data.givens) ? data.givens : []),
    };
  } catch {
    return null;
  }
}

function updateHighScore() {
  const key = `highScore_${state.mode}_${state.size}`;
  const high = Math.max(parseInt(localStorage.getItem(key) || '0', 10), state.score);
  localStorage.setItem(key, high.toString());
  highScoreDisplay.textContent = high;
}

// ---------- Setup & wiring ----------

function init() {
  // Mode selection
  modeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      state.mode = mode;
      modeButtons.forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      updateModeDescription();
      validateStartReady();
    });
  });

  // Size selection
  sizeButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const size = Number(btn.dataset.size);
      state.size = size;
      sizeButtons.forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
      validateStartReady();
    });
  });

  playerNameInput.addEventListener("input", () => {
    validateStartReady();
  });

  startGameBtn.addEventListener("click", handleStartGame);

  notesToggleBtn.addEventListener("click", () => {
    state.isNotesMode = !state.isNotesMode;
    notesToggleBtn.setAttribute("aria-pressed", String(state.isNotesMode));
    notesToggleBtn.classList.toggle("btn--primary", state.isNotesMode);
  });

  checkBtn.addEventListener("click", handleCheck);
  hintBtn.addEventListener("click", handleHint);
  newPuzzleBtn.addEventListener("click", () => {
    if (!state.size || !state.mode) return;
    startNewPuzzleSameSettings();
  });
  solutionBtn.addEventListener("click", showSolution);

  playAgainBtn.addEventListener("click", () => {
    hideCompletionOverlay();
    startNewPuzzleSameSettings();
  });

  changeSettingsBtn.addEventListener("click", () => {
    hideCompletionOverlay();
    stopTimer();
    state.gameActive = false;
    gameSection.classList.add("section--hidden");
    gameSection.hidden = true;
    landingSection.classList.remove("section--hidden");
    landingSection.hidden = false;
  });

  undoBtn.addEventListener('click', handleUndo);
  shareBtn.addEventListener('click', handleShare);

  if (backBtn) {
    backBtn.addEventListener('click', goToLanding);
  }

  undoBtn.disabled = true;
  shareBtn.disabled = true;
}

function updateModeDescription() {
  const textMap = {
    easy: "Clue Hunter: Lots of numbers are already filled in. Great for learning!",
    medium: "Code Breaker: Some clues, some thinking. Perfect for a little challenge!",
    hard: "Master Mind: Very few clues. Only for brave puzzle heroes!",
  };
  modeDescription.innerHTML = `<p>${textMap[state.mode] ?? "Tap a mode to see what it means."}</p>`;
}

function validateStartReady() {
  const nameOk = playerNameInput.value.trim().length > 0;
  const modeOk = !!state.mode;
  const sizeOk = !!state.size;
  startGameBtn.disabled = !(nameOk && modeOk && sizeOk);
}

// ---------- Navigation (Back) ----------

function goToLanding() {
  // Save before leaving
  saveGame();

  stopTimer();
  state.gameActive = false;

  gameSection.classList.add("section--hidden");
  gameSection.hidden = true;
  landingSection.classList.remove("section--hidden");
  landingSection.hidden = false;

  syncLandingSelections();
}

function syncLandingSelections() {
  playerNameInput.value = state.name || "";
  modeButtons.forEach(b => {
    const isSelected = b.dataset.mode === state.mode;
    b.setAttribute("aria-pressed", String(isSelected));
  });
  sizeButtons.forEach(b => {
    const isSelected = Number(b.dataset.size) === state.size;
    b.setAttribute("aria-pressed", String(isSelected));
  });
  validateStartReady();
}

// ---------- Game lifecycle ----------

function handleStartGame() {
  const chosenName = playerNameInput.value.trim();
  const chosenMode = state.mode;
  const chosenSize = state.size;

  // Move to game screen
  state.name = chosenName;
  playerNameDisplay.textContent = state.name || "Player";
  landingSection.classList.add("section--hidden");
  landingSection.hidden = true;
  gameSection.classList.remove("section--hidden");
  gameSection.hidden = false;

  // Attempt resume
  const saved = loadGame();
  const matches =
    saved &&
    saved.name === chosenName &&
    saved.mode === chosenMode &&
    saved.size === chosenSize &&
    saved.puzzleGrid &&
    saved.solvedGrid;

  if (matches) {
    Object.assign(state, {
      name: saved.name,
      mode: saved.mode,
      size: saved.size,
      puzzleGrid: saved.puzzleGrid,
      solvedGrid: saved.solvedGrid,
      notes: saved.notes,
      elapsedSeconds: saved.elapsedSeconds,
      score: saved.score,
      undoStack: saved.undoStack.slice(-10),
      givens: saved.givens,
      isNotesMode: false,
      gameActive: true,
      selectedCell: null,
    });
    renderBoard();
    renderKeypad();
    updateMeta();
    updateTimerDisplay();
    updateScoreDisplay();
    startTimer();
    shareBtn.disabled = false;
    announceStatus("Resumed your last game.");
  } else {
    // Start new
    state.mode = chosenMode;
    state.size = chosenSize;
    state.name = chosenName;
    startNewPuzzleSameSettings();
  }
}

function startNewPuzzleSameSettings() {
  resetGameState();
  generatePuzzle(); // single source of truth: solved -> puzzle -> givens
  renderBoard();
  renderKeypad();
  updateMeta();
  startTimer();
  shareBtn.disabled = false;
  saveGame();
  announceStatus("New puzzle ready. Use the arrows to move around the board.");
}

function resetGameState() {
  state.notes = {};
  state.selectedCell = null;
  state.elapsedSeconds = 0;
  state.score = 0;
  state.gameActive = true;
  state.undoStack = [];
  stopTimer();
  updateTimerDisplay();
  updateScoreDisplay();
  clearMessages();
  undoBtn.disabled = true;
}

function updateMeta() {
  const modeNames = {
    easy: "Clue Hunter",
    medium: "Code Breaker",
    hard: "Master Mind",
  };

  modeDisplay.textContent = modeNames[state.mode] || "—";
  sizeDisplay.textContent = state.size ? `${state.size} × ${state.size}` : "—";
  gameSubtitle.style.display = "none";

  const key = `highScore_${state.mode}_${state.size}`;
  const high = parseInt(localStorage.getItem(key) || '0', 10);
  highScoreDisplay.textContent = high ? high : '-';
}

// ---------- Timer & score ----------

function startTimer() {
  stopTimer();
  timerDisplay.textContent = "00:00";
  if (!Number.isFinite(state.elapsedSeconds)) state.elapsedSeconds = 0;
  state.timerId = setInterval(() => {
    state.elapsedSeconds++;
    updateTimerDisplay();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function updateTimerDisplay() {
  const m = Math.floor(state.elapsedSeconds / 60).toString().padStart(2, "0");
  const s = (state.elapsedSeconds % 60).toString().padStart(2, "0");
  timerDisplay.textContent = `${m}:${s}`;
}

function updateScoreDisplay() {
  scoreDisplay.textContent = state.score.toString();
}

function clearMessages() {
  statusMessageEl.textContent = "";
  errorMessageEl.textContent = "";
}

// ---------- Board rendering ----------

function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.toggle("sudoku-board--4x4", state.size === 4);
  boardEl.classList.toggle("sudoku-board--6x6", state.size === 6);

  const size = state.size;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cellVal = state.puzzleGrid[r][c];
      const key = keyFor(r, c);
      const isFixed = state.givens.has(key); // ONLY givens are fixed

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      if (isFixed) cell.classList.add("sudoku-cell--fixed");

      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}, ${cellVal ?? "empty"}`);
      cell.setAttribute("tabindex", "-1");

      if (cellVal != null) {
        cell.textContent = cellVal;
      } else {
        renderNotes(cell, r, c);
      }

      cell.addEventListener("click", () => selectCell(cell));
      cell.addEventListener("keydown", handleCellKeyDown);

      boardEl.appendChild(cell);
    }
  }

  // Focus first cell
  const firstCell = boardEl.querySelector(".sudoku-cell");
  if (firstCell) {
    firstCell.tabIndex = 0;
    selectCell(firstCell);
  }
}

function selectCell(cell) {
  if (!cell) return;
  if (state.selectedCell) {
    state.selectedCell.classList.remove("sudoku-cell--selected");
    state.selectedCell.tabIndex = -1;
  }
  state.selectedCell = cell;
  cell.classList.add("sudoku-cell--selected");
  cell.tabIndex = 0;
  cell.focus();
}

function handleCellKeyDown(e) {
  const cell = e.currentTarget;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const size = state.size;

  switch (e.key) {
    case "ArrowUp":
      e.preventDefault(); moveFocus(row - 1, col); break;
    case "ArrowDown":
      e.preventDefault(); moveFocus(row + 1, col); break;
    case "ArrowLeft":
      e.preventDefault(); moveFocus(row, col - 1); break;
    case "ArrowRight":
      e.preventDefault(); moveFocus(row, col + 1); break;
    default: {
      // Digit keys -> place / note (respects Notes mode). Ignore for fixed cells.
      const d = Number(e.key);
      if (Number.isInteger(d) && d >= 1 && d <= size) {
        e.preventDefault();
        const selected = state.selectedCell;
        if (!selected) return;
        const sr = Number(selected.dataset.row);
        const sc = Number(selected.dataset.col);
        const isFixed = state.givens.has(keyFor(sr, sc));
        if (isFixed) return;

        if (state.isNotesMode) {
          toggleNote(sr, sc, d);
          renderNotes(selected, sr, sc);
          saveGame();
        } else {
          handleDigitPress(d);
        }
      }
      break;
    }
  }
}

function moveFocus(r, c) {
  const size = state.size;
  if (r < 0 || r >= size || c < 0 || c >= size) return;
  const next = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
  if (next) selectCell(next);
}

// ---------- Keypad & placing values ----------

function renderKeypad() {
  keypadEl.innerHTML = "";
  const size = state.size;

  for (let d = 1; d <= size; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "keypad__btn";
    btn.textContent = d;
    btn.dataset.value = d;
    btn.addEventListener("click", () => handleDigitPress(d));
    keypadEl.appendChild(btn);
  }

  updateKeypadEnabled();
}

function handleDigitPress(value) {
  const cell = state.selectedCell;
  if (!cell) return;

  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);

  // Block edits on givens
  if (state.givens.has(keyFor(r, c))) return;

  if (state.isNotesMode) {
    toggleNote(r, c, value);
    renderNotes(cell, r, c);
    saveGame();
    return;
  }

  placeValue(r, c, value, cell);
}

function toggleNote(r, c, value) {
  const key = keyFor(r, c);
  if (!state.notes[key]) {
    state.notes[key] = new Set();
  }
  const set = state.notes[key];
  if (set.has(value)) {
    set.delete(value);
  } else {
    set.add(value);
  }
}

function renderNotes(cell, r, c) {
  const key = keyFor(r, c);
  const set = state.notes[key];

  cell.textContent = "";
  const existingNotes = cell.querySelector(".sudoku-cell__notes");
  if (existingNotes) existingNotes.remove();

  if (!set || set.size === 0) return;

  const wrap = document.createElement("div");
  wrap.className = "sudoku-cell__notes";

  const size = state.size;
  for (let d = 1; d <= size; d++) {
    const span = document.createElement("span");
    span.textContent = set.has(d) ? d : "";
    wrap.appendChild(span);
  }
  cell.appendChild(wrap);
}

function pushUndo(r, c) {
  const key = keyFor(r, c);
  const prevNotes = state.notes[key] ? Array.from(state.notes[key]) : null;
  state.undoStack.push({
    r, c,
    prevValue: state.puzzleGrid[r][c] ?? null,
    prevNotes
  });
  if (state.undoStack.length > 20) state.undoStack.shift();
  undoBtn.disabled = state.undoStack.length === 0;
}

function placeValue(r, c, value, cell) {
  pushUndo(r, c);

  // Remove notes first
  const key = keyFor(r, c);
  delete state.notes[key];

  // Update puzzle grid with the new value (so rule-check sees it)
  state.puzzleGrid[r][c] = value;

  // Evaluate rule validity
  const isClash = violatesRules(r, c, value);
  const isSolutionMatch = state.solvedGrid[r][c] === value;

  // Update cell UI
  cell.innerHTML = "";
  cell.textContent = value;

  // Feedback & scoring
  if (isClash) {
    state.score -= 1;
    clampScore();
    cell.classList.add("sudoku-cell--conflict", "sudoku-cell--shake");
    playBlip({ freq: 220, type: "sawtooth", duration: 0.18 });
    announceError("That number clashes. Try another one.");
    setTimeout(() => {
      cell.classList.remove("sudoku-cell--conflict", "sudoku-cell--shake");
    }, 350);
  } else if (isSolutionMatch) {
    state.score += 5;
    playBlip({ freq: 880, type: "triangle" });
    cell.classList.add("sudoku-cell--correct");
    setTimeout(() => cell.classList.remove("sudoku-cell--correct"), 820);
    announceStatus("Nice move!");
  } else {
    // Rule-valid but not necessarily the final solution value.
    announceStatus("Looks good so far. Keep going!");
  }

  clampScore();
  updateScoreDisplay();

  highlightConflicts();
  updateKeypadEnabled();
  finishIfNeeded();
  saveGame();
}

function highlightConflicts() {
  const size = state.size;
  const cells = boardEl.querySelectorAll(".sudoku-cell");
  cells.forEach(c => c.classList.remove("sudoku-cell--conflict"));

  const grid = state.puzzleGrid;

  // Rows
  for (let r = 0; r < size; r++) {
    const seen = {};
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (!v) continue;
      if (seen[v]) {
        markConflict(r, c);
        markConflict(r, seen[v] - 1);
      } else {
        seen[v] = c + 1;
      }
    }
  }

  // Columns
  for (let c = 0; c < size; c++) {
    const seen = {};
    for (let r = 0; r < size; r++) {
      const v = grid[r][c];
      if (!v) continue;
      if (seen[v]) {
        markConflict(r, c);
        markConflict(seen[v] - 1, c);
      } else {
        seen[v] = r + 1;
      }
    }
  }

  // Blocks: 2x2 for 4x4, 3x2 for 6x6
  const blockRows = 2;
  const blockCols = (size === 4) ? 2 : 3;

  for (let br = 0; br < size; br += blockRows) {
    for (let bc = 0; bc < size; bc += blockCols) {
      const seen = {};
      for (let r = 0; r < blockRows; r++) {
        for (let c = 0; c < blockCols; c++) {
          const rr = br + r;
          const cc = bc + c;
          const v = grid[rr][cc];
          if (!v) continue;
          const idx = r * blockCols + c + 1;
          if (seen[v]) {
            const first = seen[v];
            const fr = br + Math.floor((first - 1) / blockCols);
            const fc = bc + ((first - 1) % blockCols);
            markConflict(rr, cc);
            markConflict(fr, fc);
          } else {
            seen[v] = idx;
          }
        }
      }
    }
  }

  function markConflict(r, c) {
    const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
    if (cell) cell.classList.add("sudoku-cell--conflict");
  }
}

// Disable digits that cannot go anywhere (based on empty cells whose solved value equals the digit)
function updateKeypadEnabled() {
  const size = state.size;

  const emptiesByDigit = {};
  for (let d = 1; d <= size; d++) emptiesByDigit[d] = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!state.puzzleGrid[r][c]) {
        const solvedVal = state.solvedGrid[r][c];
        emptiesByDigit[solvedVal]++;
      }
    }
  }

  const buttons = keypadEl.querySelectorAll(".keypad__btn");
  buttons.forEach(btn => {
    const d = Number(btn.dataset.value);
    btn.disabled = emptiesByDigit[d] === 0 || !state.gameActive;
  });
}

// ---------- Check / hints / completion ----------

function handleCheck() {
  highlightConflicts();
  const anyConflict = boardEl.querySelector(".sudoku-cell--conflict");
  if (anyConflict) {
    announceError("Some numbers are still clashing.");
  } else {
    announceStatus("So far so good!");
  }
}

function handleHint() {
  if (!state.gameActive) return;
  const size = state.size;

  let candidateCell = null;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.puzzleGrid[r][c]) continue;
      const solvedVal = state.solvedGrid[r][c];
      candidateCell = { r, c, value: solvedVal };
      break;
    }
    if (candidateCell) break;
  }

  if (!candidateCell) {
    announceStatus("No hint available. Maybe you are almost done!");
    return;
  }

  const { r, c, value } = candidateCell;
  const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);

  const penaltyByMode = { easy: 3, medium: 4, hard: 5 };
  const penalty = penaltyByMode[state.mode] ?? 3;

  state.score -= penalty;
  clampScore();
  updateScoreDisplay();

  placeHintValue(r, c, value, cell);
  announceStatus("Here is a helpful number.");
  playBlip({ freq: 720, type: "sine" });
}

function placeHintValue(r, c, value, cell) {
  pushUndo(r, c);
  delete state.notes[keyFor(r, c)];
  state.puzzleGrid[r][c] = value;
  cell.innerHTML = "";
  cell.textContent = value;
  highlightConflicts();
  updateKeypadEnabled();
  finishIfNeeded();
  saveGame();
}

function finishIfNeeded() {
  const size = state.size;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (state.puzzleGrid[r][c] !== state.solvedGrid[r][c]) return;
    }
  }
  finishGame();
}

function finishGame() {
  if (!state.gameActive) return;
  state.gameActive = false;
  stopTimer();

  state.score += 40;
  clampScore();
  updateScoreDisplay();

  updateHighScore();
  saveGame();

  lockBoardAndKeypad();
  showCompletionOverlay();
  launchConfetti();
  announceStatus("Puzzle complete. Awesome job!");
}

function lockBoardAndKeypad() {
  const cells = boardEl.querySelectorAll(".sudoku-cell");
  cells.forEach(cell => (cell.disabled = true));

  const buttons = keypadEl.querySelectorAll(".keypad__btn");
  buttons.forEach(btn => (btn.disabled = true));
}

function showCompletionOverlay() {
  finalTimeEl.textContent = timerDisplay.textContent;
  finalScoreEl.textContent = scoreDisplay.textContent;

  completionOverlay.classList.remove("overlay--hidden");
  completionOverlay.hidden = false;
}

function hideCompletionOverlay() {
  completionOverlay.classList.add("overlay--hidden");
  completionOverlay.hidden = true;
}

// ---------- Confetti ----------

function launchConfetti() {
  confettiLayer.innerHTML = "";
  const colors = ["#f97316", "#22c55e", "#3b82f6", "#ec4899", "#eab308"];

  for (let i = 0; i < 40; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti-piece";
    piece.style.left = Math.random() * 100 + "%";
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = (Math.random() * 0.4) + "s";
    confettiLayer.appendChild(piece);
  }

  playBlip({ freq: 1040, duration: 0.22, type: "square" });
}

// ---------- Show solution (skip givens) ----------

function showSolution() {
  const size = state.size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = keyFor(r, c);
      if (state.givens.has(k)) continue; // don't touch givens
      const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
      if (!cell) continue;
      const value = state.solvedGrid[r][c];
      state.puzzleGrid[r][c] = value;
      cell.innerHTML = "";
      cell.textContent = value;
    }
  }
  highlightConflicts();
  updateKeypadEnabled();
  announceStatus("Showing the full solution.");
  saveGame();
}

// ---------- Share (html2canvas) ----------

async function handleShare() {
  const node = document.querySelector('.game-shell');
  if (!node) return;

  shareBtn.disabled = true;
  try {
    const canvas = await html2canvas(node, { backgroundColor: null, scale: 2 });
    const blob = await toBlobAsync(canvas, 'image/png');
    if (!blob) {
      announceError("Could not create image.");
      return;
    }

    const file = new File([blob], 'kido-sudoku.png', { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        title: 'Kido Sudoku',
        text: `I scored ${state.score} in ${timerDisplay.textContent} on ${state.size}×${state.size} (${state.mode}).`,
        files: [file]
      });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'kido-sudoku.png';
      a.click();
      URL.revokeObjectURL(url);
      announceStatus("Image downloaded.");
    }
  } catch {
    // user canceled share or error
  } finally {
    shareBtn.disabled = false;
  }
}

// ---------- Undo ----------

function handleUndo() {
  const last = state.undoStack.pop();
  if (!last) return;
  const { r, c, prevValue, prevNotes } = last;

  const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);

  state.puzzleGrid[r][c] = prevValue;

  // restore notes / content
  if (prevNotes && prevNotes.length) {
    state.notes[keyFor(r, c)] = new Set(prevNotes);
    cell.innerHTML = "";
    renderNotes(cell, r, c);
  } else {
    delete state.notes[keyFor(r, c)];
    cell.innerHTML = "";
    if (prevValue != null) cell.textContent = prevValue;
  }

  highlightConflicts();
  updateKeypadEnabled();
  undoBtn.disabled = state.undoStack.length === 0;
  saveGame();
}

// ---------- Init on DOM ready ----------

document.addEventListener("DOMContentLoaded", init);
