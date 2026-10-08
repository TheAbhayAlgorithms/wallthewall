// Client-side game input handler
const keys = { ArrowUp: false, ArrowDown: false, w: false, s: false, W: false, S: false };
let currentDir = 0;
let onInputChange = null;
let seq = 0;
let touchStartY = null;
let touchCurrentDir = 0;

export function initInput(callback) {
  onInputChange = callback;
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('touchstart', handleTouchStart, { passive: true });
  window.addEventListener('touchmove', handleTouchMove, { passive: false });
  window.addEventListener('touchend', handleTouchEnd, { passive: true });
}

export function destroyInput() {
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
  window.removeEventListener('touchstart', handleTouchStart);
  window.removeEventListener('touchmove', handleTouchMove);
  window.removeEventListener('touchend', handleTouchEnd);
  onInputChange = null;
  currentDir = 0;
  touchCurrentDir = 0;
}

function handleKeyDown(e) {
  if (!(e.key in keys)) return;
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  keys[e.key] = true;
  updateDir();
}

function handleKeyUp(e) {
  if (!(e.key in keys)) return;
  keys[e.key] = false;
  updateDir();
}

function updateDir() {
  const up = keys.ArrowUp || keys.w || keys.W;
  const down = keys.ArrowDown || keys.s || keys.S;
  const newDir = up ? -1 : down ? 1 : 0;
  if (newDir !== currentDir) {
    currentDir = newDir;
    seq++;
    if (onInputChange) onInputChange({ dir: currentDir, seq });
  }
}

function handleTouchStart(e) {
  if (e.touches.length > 0) {
    touchStartY = e.touches[0].clientY;
  }
}

function handleTouchMove(e) {
  if (!touchStartY || !e.touches.length) return;
  e.preventDefault();
  const dy = e.touches[0].clientY - touchStartY;
  const newDir = dy < -10 ? -1 : dy > 10 ? 1 : 0;
  if (newDir !== touchCurrentDir) {
    touchCurrentDir = newDir;
    seq++;
    if (onInputChange) onInputChange({ dir: touchCurrentDir, seq });
  }
}

function handleTouchEnd() {
  touchStartY = null;
  if (touchCurrentDir !== 0) {
    touchCurrentDir = 0;
    seq++;
    if (onInputChange) onInputChange({ dir: 0, seq });
  }
}
