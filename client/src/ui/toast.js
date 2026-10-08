// Toast notification system
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
toastContainer.setAttribute('aria-live', 'polite');
document.body.appendChild(toastContainer);

const queue = [];
let visible = 0;
const MAX_VISIBLE = 3;

export function showToast({ message, type = 'info', duration = 4000, onClick }) {
  queue.push({ message, type, duration, onClick });
  processQueue();
}

function processQueue() {
  while (visible < MAX_VISIBLE && queue.length > 0) {
    const toastData = queue.shift();
    renderToast(toastData);
  }
}

function renderToast({ message, type, duration, onClick }) {
  visible++;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = { info: 'ℹ️', success: '✅', error: '❌', invite: '⚔️', friend: '🤝' }[type] || 'ℹ️';
  toast.innerHTML = `<span class="toast-icon">${icon}</span><span class="toast-msg">${message}</span><button class="toast-close" aria-label="Close">×</button>`;

  if (onClick) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', (e) => {
      if (!e.target.closest('.toast-close')) {
        onClick();
        dismiss(toast);
      }
    });
  }

  toast.querySelector('.toast-close').addEventListener('click', () => dismiss(toast));

  toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-show'));

  const timer = setTimeout(() => dismiss(toast), duration);
  toast._timer = timer;
}

function dismiss(toast) {
  clearTimeout(toast._timer);
  toast.classList.remove('toast-show');
  toast.classList.add('toast-hide');
  toast.addEventListener('transitionend', () => {
    toast.remove();
    visible--;
    processQueue();
  }, { once: true });
}
