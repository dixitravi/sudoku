
// app.js

// ---------- State ----------
const state = {
  name: "",
  mode: null, // "easy" | "medium" | "hard"
  size: null, // 4 | 6 | 9
  solvedGrid: null, // 2D array
  puzzleGrid: null, // 2D array with nulls for blanks
  notes: {}, // key "r-c" -> Set<number>
  isNotesMode: false,
  selectedCell: null,
  timerId: null,
  elapsedSeconds: 0,
  score: 0,
  gameActive: false,
  undoStack: [], // {r, c, prevValue, prevNotes: number[] | null}
  givens: new Set(), // keys "r-c" for pre-filled cells (non-editable)
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
const backBtn = document.getElementById('backBtn');
// Share button may be missing
const shareBtn = document.getElementById('shareBtn');

// Help modal refs
const helpBtn = document.getElementById('helpBtn');
const helpOverlay = document.getElementById('helpOverlay');
const helpCloseBtn = document.getElementById('helpCloseBtn');

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
    // ignore
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

// ---------- Mobile-first + Injected Styles ----------
document.addEventListener("DOMContentLoaded", () => {
  injectMobileAndBoardStyles();
  // Safe defaults so Start works even if pills don't have 9×9 yet
  if (!state.size) state.size = 9;
  if (!state.mode) state.mode = 'medium';
});
function injectMobileAndBoardStyles() {
  if (document.getElementById("mobileBoardStylesInjected")) return;
  const style = document.createElement('style');
  style.id = 'mobileBoardStylesInjected';
  style.textContent = `
:root {
  --cell-border: #e6e9ef;
  --box-divider: #111827;
  --text-main: #0f172a;
  --transition-fast: 160ms ease;
  --keypad-bg: #ffffff;
  --outer-radius: 12px;
}

/* Base cell visuals */
.sudoku-cell {
  position: relative;
  background: #ffffff;
  border-radius: 3px;
  min-width: 44px;
  min-height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--text-main);
  cursor: pointer;
  transition: background-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast), opacity 140ms ease;
  aspect-ratio: 1 / 1;
  border: 1px solid var(--cell-border);
  box-sizing: border-box;
  will-change: transform, background-color, opacity;
}

/* Remove grid gap to keep dividers crisp */
#board { display: grid; gap: 0; }

/* Thick block dividers */
.cell--div-top { border-top: 3px solid var(--box-divider) !important; }
.cell--div-left { border-left: 3px solid var(--box-divider) !important; }
.cell--div-right { border-right: 3px solid var(--box-divider) !important; }
.cell--div-bottom { border-bottom: 3px solid var(--box-divider) !important; }

/* Outer rounding on board corners */
.cell--outer-tl { border-top-left-radius: var(--outer-radius); }
.cell--outer-tr { border-top-right-radius: var(--outer-radius); }
.cell--outer-bl { border-bottom-left-radius: var(--outer-radius); }
.cell--outer-br { border-bottom-right-radius: var(--outer-radius); }

/* Selection & feedback */
.sudoku-cell--selected { box-shadow: inset 0 0 0 2px #3b82f6; }
.sudoku-cell--conflict { background: #fff0f0; pointer-events: auto; cursor: pointer; }
.sudoku-cell--shake { animation: cellShake 0.25s linear; }
@keyframes cellShake { 0%{transform:translateX(0)}25%{transform:translateX(-2px)}50%{transform:translateX(2px)}75%{transform:translateX(-2px)}100%{transform:translateX(0)} }
.sudoku-cell--correct { background: #effdf5; }
.cell-pop { animation: cellPop 140ms ease-out; }
.cell-fade-pop { animation: cellFadePop 160ms ease-out; }
@keyframes cellPop { 0%{transform:scale(0.9)}100%{transform:scale(1)} }
@keyframes cellFadePop { 0%{opacity:.5;transform:scale(.96)}100%{opacity:1;transform:scale(1)} }

/* Fixed (givens) */
.sudoku-cell--fixed { background: #f8fafc; color: #0f172a; font-weight: 700; cursor: default; }

/* Notes grid */
.sudoku-cell__notes {
  position: absolute; inset: 2px; display: grid;
  grid-template-columns: repeat(3, 1fr); grid-auto-rows: 1fr; gap: 0;
  align-items: center; justify-items: center; color: #64748b; font-size: .7rem; line-height: 1; pointer-events: none;
}
.sudoku-cell__notes > span { opacity: .9; }

/* Keypad base */
#keypad {
  display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px;
  position: sticky; bottom: 0; background: var(--keypad-bg);
  padding: 10px 8px 12px; border-top: 1px solid rgba(0,0,0,.08); z-index: 20;
}
.keypad__btn {
  background: #f4f6f8; border: 1px solid #d8dde4; color: #111;
  font-weight: 700; border-radius: 10px; padding: 12px 10px; min-height: 48px; touch-action: manipulation;
  font-size: 1.05rem;
}
.keypad__btn:disabled { opacity: .4; }
.keypad__btn--erase { background: #fff0f0; color: #8a0000; border-color: #ffc8c8; font-weight: 800; grid-column: span 2; }

/* GAME MODE COMPACT LAYOUT */
body.is-game-mode .site-header { display: none !important; } /* Hide header whenever in game mode */
body.is-game-mode .game-shell { height: 100dvh; display: flex; flex-direction: column; }
body.is-game-mode .game-body  { flex: 1; min-height: 0; overflow: auto; }
body.is-game-mode .game-header__meta { display: none !important; } /* hide meta pills in compact mode */
body.is-game-mode .card__subtitle { display: none !important; }     /* hide long subtitle */
body.is-game-mode .board-help { display: none !important; }         /* keep keypad tight with board */

/* Make keypad auto-fit and keep near board on small screens */
@media (max-width: 900px) {
  #keypad { grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); }
}

/* Smaller cells to fit 9×9 on very small phones */
@media (max-width: 480px) {
  .sudoku-cell {
    min-width: clamp(28px, 9vw, 40px);
    min-height: clamp(28px, 9vw, 40px);
    font-size: clamp(.9rem, 2.6vw, 1.05rem);
  }
}
`;
  document.head.appendChild(style);
}

// ---------- Utility ----------
function keyFor(r, c) { return `${r}-${c}`; }
function clampScore() { if (state.score < 0) state.score = 0; }
function toBlobAsync(canvas, type = 'image/png', quality) { return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality)); }
function computeGivensFromPuzzle(puzzle) {
  const set = new Set();
  const size = puzzle.length;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (puzzle[r][c] != null) set.add(keyFor(r, c));
  return set;
}
function isGridComplete(grid, size) {
  if (!Array.isArray(grid) || grid.length !== size) return false;
  for (const row of grid) {
    if (!Array.isArray(row) || row.length !== size) return false;
    if (row.some(v => v == null || v === 0)) return false;
  }
  return true;
}
function getBlockShape(size) {
  if (size === 4) return { rows: 2, cols: 2 };
  if (size === 6) return { rows: 2, cols: 3 };
  if (size === 9) return { rows: 3, cols: 3 };
  for (let r = Math.floor(Math.sqrt(size)); r >= 1; r--) if (size % r === 0) return { rows: r, cols: size / r };
  return { rows: 1, cols: size };
}
function getVisualDividers(size) {
  if (size === 9) return { rowIdx: [0, 3, 6], colIdx: [0, 3, 6] };
  const { rows, cols } = getBlockShape(size);
  const rowIdx = [], colIdx = [];
  for (let r = 0; r < size; r += rows) rowIdx.push(r);
  for (let c = 0; c < size; c += cols) colIdx.push(c);
  return { rowIdx, colIdx };
}
function violatesRules(r, c, val) {
  const size = state.size, grid = state.puzzleGrid;
  for (let i = 0; i < size; i++) {
    if (i !== c && grid[r][i] === val) return true;
    if (i !== r && grid[i][c] === val) return true;
  }
  const { rows: brH, cols: brW } = getBlockShape(size);
  const br = Math.floor(r / brH) * brH, bc = Math.floor(c / brW) * brW;
  for (let rr = 0; rr < brH; rr++) for (let cc = 0; cc < brW; cc++) {
    const R = br + rr, C = bc + cc;
    if (R === r && C === c) continue;
    if (grid[R][C] === val) return true;
  }
  return false;
}

// Mobile viewport helper
function isMobileViewport() {
  return window.matchMedia('(max-width: 767px)').matches;
}

// ---------- Generators ----------
function generateSolved4x4() {
  const base = [
    [1,2,3,4],
    [3,4,1,2],
    [2,1,4,3],
    [4,3,2,1],
  ];
  const g = base.map(r => r.slice());
  const swapRows = (a,b)=>([g[a], g[b]] = [g[b], g[a]]);
  const swapCols = (a,b)=>{ for (let r=0;r<4;r++) [g[r][a], g[r][b]] = [g[r][b], g[r][a]]; };
  if (Math.random()>0.5) swapRows(0,1);
  if (Math.random()>0.5) swapRows(2,3);
  if (Math.random()>0.5) swapCols(0,1);
  if (Math.random()>0.5) swapCols(2,3);
  return g;
}
function generateSolved6x6() {
  const size = 6;
  const grid = Array.from({length:size},()=>Array(size).fill(0));
  function isSafe(r,c,n){
    for(let i=0;i<size;i++){ if(grid[r][i]===n || grid[i][c]===n) return false; }
    const br=Math.floor(r/2)*2, bc=Math.floor(c/3)*3;
    for(let rr=0;rr<2;rr++) for(let cc=0;cc<3;cc++) if(grid[br+rr][bc+cc]===n) return false;
    return true;
  }
  function fill(idx){
    if(idx===size*size) return true;
    const r=Math.floor(idx/size), c=idx%size;
    const nums=[1,2,3,4,5,6];
    for(let i=nums.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [nums[i],nums[j]]=[nums[j],nums[i]]; }
    for(const n of nums){ if(isSafe(r,c,n)){ grid[r][c]=n; if(fill(idx+1)) return true; grid[r][c]=0; } }
    return false;
  }
  for(let a=0;a<50;a++){ for(let r=0;r<size;r++) grid[r].fill(0); if(fill(0)) return grid; }
  throw new Error("6x6 generation failed after retries.");
}
/* 9×9 Latin pattern + shuffles (fast) */
function generateSolved9x9() {
  const size = 9;
  const base = Array.from({ length: size }, (_, r) =>
    Array.from({ length: size }, (_, c) => 1 + ((r * 3 + Math.floor(r / 3) + c) % 9))
  );
  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  const bandOrder = shuffle([0,1,2]);
  const rowsOrder = bandOrder.flatMap(b => shuffle([0,1,2]).map(i => b * 3 + i));
  const stackOrder = shuffle([0,1,2]);
  const colsOrder = stackOrder.flatMap(s => shuffle([0,1,2]).map(i => s * 3 + i));
  const symPerm = shuffle([1,2,3,4,5,6,7,8,9]);
  const remap = (v) => symPerm[v - 1];
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      grid[r][c] = remap(base[rowsOrder[r]][colsOrder[c]]);
    }
  }
  return grid;
}
function makePuzzle(grid, difficulty) {
  const size = grid.length;
  const puzzle = grid.map(row => row.slice());
  const removeMap = {
    4: { easy: 4,  medium: 6,  hard: 8 },
    6: { easy: 8,  medium: 12, hard: 16 },
    9: { easy: 30, medium: 40, hard: 50 },
  };
  const bySize = removeMap[size] || removeMap[6];
  const toRemove = bySize[difficulty] ?? bySize.medium;
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
    if (removed >= toRemove) break;
    puzzle[pos.r][pos.c] = null;
    removed++;
  }
  return puzzle;
}

// ---------- Generate puzzle ----------
function generatePuzzle() {
  const size = state.size || 9;
  const mode = state.mode || "easy";
  try {
    const solved =
      size === 4 ? generateSolved4x4() :
      size === 6 ? generateSolved6x6() :
      size === 9 ? generateSolved9x9() :
      null;
    if (!solved || !isGridComplete(solved, size)) {
      console.error('[gen] solved grid invalid for size', size, solved);
      announceError(`Couldn’t generate a ${size}×${size} solution right now.`);
      return false;
    }
    const puzzle = makePuzzle(solved, mode);
    if (!Array.isArray(puzzle) || puzzle.length !== size) {
      console.error('[gen] puzzle invalid shape', size, puzzle);
      announceError(`Couldn’t create a ${size}×${size} puzzle.`);
      return false;
    }
    state.solvedGrid = solved;
    state.puzzleGrid = puzzle;
    state.givens = computeGivensFromPuzzle(puzzle);
    return true;
  } catch (err) {
    console.error('[gen] exception:', err);
    announceError(`Couldn’t generate a puzzle. Please try again.`);
    return false;
  }
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
  for (const k in (notesObj || {})) {
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
  try { localStorage.setItem('kidoSudokuSave', JSON.stringify(save)); } catch {}
}
function loadGame() {
  try {
    const raw = localStorage.getItem('kidoSudokuSave');
    if (!raw) return null;
    const data = JSON.parse(raw);
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
  } catch { return null; }
}
function updateHighScore() {
  const key = `highScore_${state.mode}_${state.size}`;
  const high = Math.max(parseInt(localStorage.getItem(key) || '0', 10), state.score);
  localStorage.setItem(key, high.toString());
  highScoreDisplay.textContent = high;
}

// ---------- Setup & wiring ----------
function init() {
  // Defaults so Start button works
  if (!state.size) state.size = 9;
  if (!state.mode) state.mode = 'medium';

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

  playerNameInput.addEventListener("input", () => validateStartReady());
  startGameBtn.addEventListener("click", handleStartGame);

  notesToggleBtn.addEventListener("click", () => {
    state.isNotesMode = !state.isNotesMode;
    notesToggleBtn.setAttribute("aria-pressed", String(state.isNotesMode));
    notesToggleBtn.classList.toggle("btn--primary", state.isNotesMode);
  });

  checkBtn.addEventListener("click", handleCheck);
  hintBtn.addEventListener("click", handleHint);
  newPuzzleBtn.addEventListener("click", () => {
    if (!state.mode) state.mode = 'medium';
    if (!state.size) state.size = 9;
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
    // show header again when returning to setup
    document.body.classList.remove('is-game-mode');
  });

  undoBtn.addEventListener('click', handleUndo);

  if (shareBtn) {
    shareBtn.addEventListener('click', handleShare);
    shareBtn.disabled = true;
  }

  if (backBtn) backBtn.addEventListener('click', goToLanding);

  // Icons and layout helpers
  applyActionIcons();
  moveBackButtonToBottom();
  positionKeypadForViewport();
  window.addEventListener('resize', positionKeypadForViewport);

  // Help modal
  if (helpBtn && helpOverlay) helpBtn.addEventListener('click', openHelp);
  if (helpCloseBtn) helpCloseBtn.addEventListener('click', closeHelp);
  if (helpOverlay) {
    helpOverlay.addEventListener('click', (e) => {
      if (e.target && e.target.hasAttribute('data-close-help')) closeHelp();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !helpOverlay.classList.contains('overlay--hidden')) closeHelp();
    });
  }

  undoBtn.disabled = true;
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
  saveGame();
  stopTimer();
  state.gameActive = false;
  gameSection.classList.add("section--hidden");
  gameSection.hidden = true;
  landingSection.classList.remove("section--hidden");
  landingSection.hidden = false;
  // show header again
  document.body.classList.remove('is-game-mode');
  syncLandingSelections();
}
function syncLandingSelections() {
  playerNameInput.value = state.name || "";
  modeButtons.forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
  sizeButtons.forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.size) === state.size)));
  validateStartReady();
}

// ---------- Game lifecycle ----------
function handleStartGame() {
  const chosenName = playerNameInput.value.trim();
  const chosenMode = state.mode || 'medium';
  const chosenSize = state.size || 9;
  state.name = chosenName;
  playerNameDisplay.textContent = state.name || "Player";

  landingSection.classList.add("section--hidden");
  landingSection.hidden = true;
  gameSection.classList.remove("section--hidden");
  gameSection.hidden = false;

  // Enter game mode (hide header on all screens)
  document.body.classList.add('is-game-mode');

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
    if (shareBtn) shareBtn.disabled = false;
    announceStatus("Resumed your last game.");
  } else {
    state.mode = chosenMode;
    state.size = chosenSize;
    startNewPuzzleSameSettings();
  }
}
function startNewPuzzleSameSettings() {
  resetGameState();
  const ok = generatePuzzle();
  if (!ok || !state.puzzleGrid || !state.solvedGrid) {
    console.error("[start] generation failed; aborting render");
    errorMessageEl.textContent = `We couldn’t create a ${state.size || 9}×${state.size || 9} puzzle right now. Tap “New Puzzle”.`;
    return;
  }
  renderBoard();
  renderKeypad();
  updateMeta();
  startTimer();
  if (shareBtn) shareBtn.disabled = false;
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
  const modeNames = { easy: "Clue Hunter", medium: "Code Breaker", hard: "Master Mind" };
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
function stopTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }
function updateTimerDisplay() {
  const m = String(Math.floor(state.elapsedSeconds / 60)).padStart(2,"0");
  const s = String(state.elapsedSeconds % 60).padStart(2,"0");
  timerDisplay.textContent = `${m}:${s}`;
}
function updateScoreDisplay() { scoreDisplay.textContent = String(state.score); }
function clearMessages() { statusMessageEl.textContent = ""; errorMessageEl.textContent = ""; }

// ---------- Board rendering ----------
function renderBoard() {
  boardEl.innerHTML = "";
  boardEl.classList.toggle("sudoku-board--4x4", state.size === 4);
  boardEl.classList.toggle("sudoku-board--6x6", state.size === 6);
  boardEl.classList.toggle("sudoku-board--9x9", state.size === 9);

  const size = state.size;
  const { rowIdx, colIdx } = getVisualDividers(size);
  boardEl.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
  boardEl.style.gap = "0";

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const cellVal = state.puzzleGrid[r][c];
      const k = keyFor(r, c);
      const isFixed = state.givens.has(k);

      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "sudoku-cell";
      if (isFixed) cell.classList.add("sudoku-cell--fixed");

      // thick band dividers
      if (rowIdx.includes(r)) cell.classList.add('cell--div-top');
      if (colIdx.includes(c)) cell.classList.add('cell--div-left');
      if (r === size - 1 || rowIdx.includes(r + 1)) cell.classList.add('cell--div-bottom');
      if (c === size - 1 || colIdx.includes(c + 1)) cell.classList.add('cell--div-right');

      // board corner rounding
      if (r === 0 && c === 0) cell.classList.add('cell--outer-tl');
      if (r === 0 && c === size - 1) cell.classList.add('cell--outer-tr');
      if (r === size - 1 && c === 0) cell.classList.add('cell--outer-bl');
      if (r === size - 1 && c === size - 1) cell.classList.add('cell--outer-br');

      cell.dataset.row = r;
      cell.dataset.col = c;
      cell.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1}, ${cellVal ?? "empty"}`);
      cell.setAttribute("tabindex", "-1");

      if (cellVal != null) cell.textContent = cellVal;
      else renderNotes(cell, r, c);

      // Selectable for both editable and givens (read‑only)
      cell.addEventListener("click", () => selectCell(cell));
      cell.addEventListener("keydown", handleCellKeyDown);

      boardEl.appendChild(cell);
    }
  }

  // Focus first non-given cell
  const firstEditable = boardEl.querySelector(".sudoku-cell:not(.sudoku-cell--fixed)");
  const focusTarget = firstEditable || boardEl.querySelector(".sudoku-cell");
  if (focusTarget) {
    focusTarget.tabIndex = 0;
    selectCell(focusTarget); // triggers same-number highlight
  } else {
    state.selectedCell = null;
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

  // Update highlights & keypad
  updateSelectionHighlights();
  updateKeypadEnabled();
}

function clearCellValue(r, c, cell) {
  // Prevent editing givens
  if (state.givens.has(keyFor(r, c))) return;

  pushUndo(r, c);
  delete state.notes[keyFor(r, c)];
  state.puzzleGrid[r][c] = null;

  cell.classList.remove("sudoku-cell--conflict", "sudoku-cell--shake", "sudoku-cell--correct");
  cell.innerHTML = "";
  renderNotes(cell, r, c);

  cell.classList.add("cell-fade-pop");
  cell.addEventListener("animationend", () => cell.classList.remove("cell-fade-pop"), { once: true });

  highlightConflicts();
  updateKeypadEnabled();
  saveGame();

  updateSelectionHighlights();
}
function eraseSelected() {
  if (!state.selectedCell) return;
  const r = Number(state.selectedCell.dataset.row);
  const c = Number(state.selectedCell.dataset.col);
  clearCellValue(r, c, state.selectedCell);
}
function handleCellKeyDown(e) {
  const cell = e.currentTarget;
  const row = Number(cell.dataset.row);
  const col = Number(cell.dataset.col);
  const size = state.size;

  switch (e.key) {
    case "ArrowUp":    e.preventDefault(); moveFocus(row, col, -1, 0); break;
    case "ArrowDown":  e.preventDefault(); moveFocus(row, col,  1, 0); break;
    case "ArrowLeft":  e.preventDefault(); moveFocus(row, col,  0,-1); break;
    case "ArrowRight": e.preventDefault(); moveFocus(row, col,  0, 1); break;
    case "Backspace":
    case "Delete": {
      e.preventDefault();
      if (!state.givens.has(keyFor(row, col))) clearCellValue(row, col, cell);
      break;
    }
    default: {
      const d = Number(e.key);
      if (Number.isInteger(d) && d >= 1 && d <= size) {
        e.preventDefault();
        const selected = state.selectedCell;
        if (!selected) return;
        const sr = Number(selected.dataset.row);
        const sc = Number(selected.dataset.col);
        if (state.givens.has(keyFor(sr, sc))) return; // prevent editing givens
        if (state.isNotesMode) {
          toggleNote(sr, sc, d);
          renderNotes(selected, sr, sc);
          saveGame();
          updateSelectionHighlights();
        } else {
          handleDigitPress(d);
        }
      }
    }
  }
}
function moveFocus(r, c, dr, dc) {
  const size = state.size;
  let nr = r, nc = c;
  while (true) {
    nr += dr;
    nc += dc;
    if (nr < 0 || nr >= size || nc < 0 || nc >= size) return;
    const next = boardEl.querySelector(`.sudoku-cell[data-row="${nr}"][data-col="${nc}"]`);
    if (next) { selectCell(next); return; }
  }
}

// ---------- Keypad & placing values ----------
function renderKeypad() {
  keypadEl.innerHTML = "";
  const size = state.size;

  // Digits 1..size
  for (let d = 1; d <= size; d++) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "keypad__btn";
    btn.textContent = d; // numeric label is fine here
    btn.dataset.value = d.toString();
    btn.setAttribute('aria-label', `Place ${d}`);
    btn.title = `Place ${d}`;
    btn.addEventListener("click", () => handleDigitPress(d));
    keypadEl.appendChild(btn);
  }

  // Erase (trash SVG)
  const eraseBtn = document.createElement("button");
  eraseBtn.type = "button";
  eraseBtn.className = "keypad__btn keypad__btn--erase";
  eraseBtn.setAttribute("aria-label", "Erase the selected cell");
  eraseBtn.title = "Erase";
  eraseBtn.innerHTML = `<svg class="icon" width="18" height="18" aria-hidden="true"><use href="#icon-trash"></use></svg>`;
  eraseBtn.addEventListener("click", eraseSelected);
  keypadEl.appendChild(eraseBtn);

  updateKeypadEnabled();
}
function handleDigitPress(value) {
  const cell = state.selectedCell;
  if (!cell) return;

  const r = Number(cell.dataset.row);
  const c = Number(cell.dataset.col);
  if (state.givens.has(keyFor(r, c))) return; // prevent editing givens

  if (state.isNotesMode) {
    toggleNote(r, c, value);
    renderNotes(cell, r, c);
    saveGame();
    updateSelectionHighlights();
    return;
  }
  placeValue(r, c, value, cell);
}
function toggleNote(r, c, value) {
  const key = keyFor(r, c);
  if (!state.notes[key]) state.notes[key] = new Set();
  const set = state.notes[key];
  if (set.has(value)) set.delete(value);
  else set.add(value);
}
function renderNotes(cell, r, c) {
  const key = keyFor(r, c);
  const set = state.notes[key];
  cell.textContent = "";
  const existing = cell.querySelector(".sudoku-cell__notes");
  if (existing) existing.remove();
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

  // Remove notes for that cell
  const key = keyFor(r, c);
  delete state.notes[key];

  // Set grid value
  state.puzzleGrid[r][c] = value;

  // Validate
  const isClash = violatesRules(r, c, value);
  const isSolutionMatch = state.solvedGrid[r][c] === value;

  // Update UI
  cell.innerHTML = "";
  cell.textContent = value;

  // Tiny pop feedback
  cell.classList.add("cell-pop");
  cell.addEventListener("animationend", () => cell.classList.remove("cell-pop"), { once: true });

  if (isClash) {
    state.score -= 1;
    clampScore();
    cell.classList.add("sudoku-cell--conflict", "sudoku-cell--shake");
    playBlip({ freq: 220, type: "sawtooth", duration: 0.18 });
    announceError("That number clashes. Try another one.");
    setTimeout(() => cell.classList.remove("sudoku-cell--shake"), 350);
  } else if (isSolutionMatch) {
    state.score += 5;
    playBlip({ freq: 880, type: "triangle" });
    cell.classList.add("sudoku-cell--correct");
    setTimeout(() => cell.classList.remove("sudoku-cell--correct"), 820);
    announceStatus("Nice move!");
    cell.classList.remove("sudoku-cell--conflict");
  } else {
    announceStatus("Looks good so far. Keep going!");
    cell.classList.remove("sudoku-cell--conflict");
  }

  updateScoreDisplay();
  highlightConflicts();
  updateKeypadEnabled();
  finishIfNeeded();
  saveGame();

  updateSelectionHighlights();
}

// ---------- Same-number highlighting ONLY ----------
function clearSameValueHighlights() {
  boardEl.querySelectorAll('.sudoku-cell--same-value')
    .forEach(el => el.classList.remove('sudoku-cell--same-value'));
}
function highlightSameValueCellsFrom(cell) {
  clearSameValueHighlights();
  if (!cell) return;
  const val = cell.textContent && cell.textContent.trim();
  if (!val) return; // only when selected cell shows a number
  const all = boardEl.querySelectorAll('.sudoku-cell');
  all.forEach(el => {
    if (el.textContent && el.textContent.trim() === val) {
      el.classList.add('sudoku-cell--same-value');
    }
  });
}
function updateSelectionHighlights() {
  // Only same-number highlighting (no row/col)
  highlightSameValueCellsFrom(state.selectedCell);
}

// ---------- Conflict highlighting ----------
function highlightConflicts() {
  const size = state.size;
  const grid = state.puzzleGrid;

  // Reset all
  boardEl.querySelectorAll(".sudoku-cell").forEach(c => c.classList.remove("sudoku-cell--conflict"));

  // Rows
  for (let r = 0; r < size; r++) {
    const seen = {};
    for (let c = 0; c < size; c++) {
      const v = grid[r][c];
      if (!v) continue;
      if (seen[v] != null) {
        markConflict(r, c);
        markConflict(r, seen[v]);
      } else {
        seen[v] = c;
      }
    }
  }
  // Columns
  for (let c = 0; c < size; c++) {
    const seen = {};
    for (let r = 0; r < size; r++) {
      const v = grid[r][c];
      if (!v) continue;
      if (seen[v] != null) {
        markConflict(r, c);
        markConflict(seen[v], c);
      } else {
        seen[v] = r;
      }
    }
  }
  // Blocks
  const { rows: brH, cols: brW } = getBlockShape(size);
  for (let br = 0; br < size; br += brH) {
    for (let bc = 0; bc < size; bc += brW) {
      const seen = {};
      for (let r = 0; r < brH; r++) {
        for (let c = 0; c < brW; c++) {
          const rr = br + r;
          const cc = bc + c;
          const v = grid[rr][cc];
          if (!v) continue;
          if (seen[v]) {
            const [fr, fc] = seen[v];
            markConflict(rr, cc);
            markConflict(fr, fc);
          } else {
            seen[v] = [rr, cc];
          }
        }
      }
    }
  }
  function markConflict(r, c) {
    const el = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
    if (el) el.classList.add("sudoku-cell--conflict");
  }
}

// Keep digits enabled if any cell needs them (empty OR wrong)
function updateKeypadEnabled() {
  const size = state.size;
  const targetsByDigit = {};
  for (let d = 1; d <= size; d++) targetsByDigit[d] = 0;

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const solvedVal = state.solvedGrid[r][c];
      const curVal = state.puzzleGrid[r][c];
      if (curVal == null || curVal !== solvedVal) {
        targetsByDigit[solvedVal]++;
      }
    }
  }
  const buttons = keypadEl.querySelectorAll(".keypad__btn");
  buttons.forEach(btn => {
    if (btn.classList.contains("keypad__btn--erase")) return;
    const d = Number(btn.dataset.value);
    btn.disabled = !state.gameActive || targetsByDigit[d] === 0;
  });

  // Erase button availability
  const eraseBtn = keypadEl.querySelector(".keypad__btn--erase");
  if (eraseBtn) {
    if (!state.selectedCell) {
      eraseBtn.disabled = true;
    } else {
      const r = Number(state.selectedCell.dataset.row);
      const c = Number(state.selectedCell.dataset.col);
      const isGiven = state.givens.has(keyFor(r, c));
      const hasSomething =
        state.puzzleGrid[r][c] != null ||
        (state.notes[keyFor(r, c)] && state.notes[keyFor(r, c)].size > 0);
      eraseBtn.disabled = !state.gameActive || isGiven || !hasSomething;
    }
  }
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
  // pick first empty cell
  let pick = null;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!state.puzzleGrid[r][c]) {
        pick = { r, c, value: state.solvedGrid[r][c] };
        break;
      }
    }
    if (pick) break;
  }
  if (!pick) {
    announceStatus("No hint available. Maybe you are almost done!");
    return;
  }
  const { r, c, value } = pick;
  const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
  const penalty = ({ easy: 3, medium: 4, hard: 5 })[state.mode] ?? 3;
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
  cell.classList.add("cell-pop");
  cell.addEventListener("animationend", () => cell.classList.remove("cell-pop"), { once: true });

  highlightConflicts();
  updateKeypadEnabled();
  finishIfNeeded();
  saveGame();

  updateSelectionHighlights();
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
  boardEl.querySelectorAll(".sudoku-cell").forEach(cell => (cell.disabled = true));
  keypadEl.querySelectorAll(".keypad__btn").forEach(btn => (btn.disabled = true));
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

// ---------- Show solution ----------
function showSolution() {
  const size = state.size;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const k = keyFor(r, c);
      if (state.givens.has(k)) continue;
      const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
      if (!cell) continue;
      const value = state.solvedGrid[r][c];
      state.puzzleGrid[r][c] = value;
      cell.innerHTML = "";
      cell.textContent = value;
      cell.classList.add("cell-pop");
      cell.addEventListener("animationend", () => cell.classList.remove("cell-pop"), { once: true });
    }
  }
  highlightConflicts();
  updateKeypadEnabled();
  announceStatus("Showing the full solution.");
  saveGame();

  updateSelectionHighlights();
}

// ---------- Share (html2canvas) ----------
async function handleShare() {
  const node = document.querySelector('.game-shell');
  if (!node) return;
  if (shareBtn) shareBtn.disabled = true;
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
    // user canceled or share not available—silently ignore
  } finally {
    if (shareBtn) shareBtn.disabled = false;
  }
}

// ---------- Undo ----------
function handleUndo() {
  const last = state.undoStack.pop();
  if (!last) return;
  const { r, c, prevValue, prevNotes } = last;
  const cell = boardEl.querySelector(`.sudoku-cell[data-row="${r}"][data-col="${c}"]`);
  state.puzzleGrid[r][c] = prevValue;
  if (prevNotes && prevNotes.length) {
    state.notes[keyFor(r, c)] = new Set(prevNotes);
    cell.innerHTML = "";
    renderNotes(cell, r, c);
  } else {
    delete state.notes[keyFor(r, c)];
    cell.innerHTML = "";
    if (prevValue != null) cell.textContent = prevValue;
  }
  cell.classList.add("cell-fade-pop");
  cell.addEventListener("animationend", () => cell.classList.remove("cell-fade-pop"), { once: true });

  highlightConflicts();
  updateKeypadEnabled();
  undoBtn.disabled = state.undoStack.length === 0;
  saveGame();

  updateSelectionHighlights();
}

// ---------- UI helpers: icons & keypad placement ----------
function setIcon(btn, symbolId, label) {
  if (!btn) return;
  btn.innerHTML = `<svg class="icon" width="20" height="20" aria-hidden="true"><use href="#${symbolId}"></use></svg>`;
  btn.setAttribute('aria-label', label);
  btn.title = label;
}
function applyActionIcons() {
  setIcon(checkBtn, "icon-check", "Check");
  setIcon(hintBtn,  "icon-help",  "Hint");
  setIcon(newPuzzleBtn, "icon-plus", "New puzzle");
  setIcon(undoBtn, "icon-undo", "Undo");
  setIcon(solutionBtn, "icon-eye", "Show solution");
  setIcon(backBtn, "icon-back", "Back to setup");
}
function moveBackButtonToBottom() {
  if (!backBtn) return;
  const bottomRow =
    (checkBtn && checkBtn.closest('.controls-row')) ||
    (newPuzzleBtn && newPuzzleBtn.closest('.controls-row')) ||
    (solutionBtn && solutionBtn.closest('.controls-row'));
  if (bottomRow && backBtn.parentElement !== bottomRow) {
    backBtn.classList.remove('btn--small');
    bottomRow.appendChild(backBtn);
  }
}
function positionKeypadForViewport() {
  const isSmall = window.matchMedia('(max-width: 900px)').matches;
  const controlsPanel = document.querySelector('.game-panel--controls');
  const boardPanel = document.querySelector('.game-panel--board');
  const notesRow = notesToggleBtn ? notesToggleBtn.closest('.controls-row') : null;

  if (isSmall && boardPanel) {
    if (keypadEl.parentElement !== boardPanel) {
      boardEl.insertAdjacentElement('afterend', keypadEl);
    }
    if (notesRow && notesRow.parentElement !== boardPanel) {
      keypadEl.insertAdjacentElement('afterend', notesRow);
    }
  } else if (controlsPanel) {
    if (keypadEl.parentElement !== controlsPanel) {
      controlsPanel.appendChild(keypadEl);
    }
    if (notesRow && notesRow.parentElement !== controlsPanel) {
      controlsPanel.insertBefore(notesRow, controlsPanel.firstChild);
    }
  }
}

// ---------- Help modal helpers ----------
function openHelp() {
  helpOverlay.classList.remove("overlay--hidden");
  helpOverlay.hidden = false;
}
function closeHelp() {
  helpOverlay.classList.add("overlay--hidden");
  helpOverlay.hidden = true;
}

// ---------- Init on DOM ready ----------
document.addEventListener("DOMContentLoaded", init);
