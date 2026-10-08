// Modal system
let activeModal = null;

export function showModal({ title, content, buttons = [], onClose, id }) {
  closeModal();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = id || 'modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'modal-title');

  let html = '';
  if (title) html += `<h2 class="modal-title" id="modal-title">${title}</h2>`;
  if (typeof content === 'string') {
    html += `<div class="modal-content">${content}</div>`;
  }
  modal.innerHTML = html;

  if (content instanceof Element) {
    modal.appendChild(content);
  }

  if (buttons.length > 0) {
    const btnRow = document.createElement('div');
    btnRow.className = 'modal-buttons';
    for (const { text, variant = 'primary', onClick } of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn btn-${variant}`;
      btn.textContent = text;
      btn.addEventListener('click', () => {
        if (onClick) onClick();
        closeModal();
      });
      btnRow.appendChild(btn);
    }
    modal.appendChild(btnRow);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('modal-show'));

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (onClose) onClose();
      closeModal();
    }
  });

  activeModal = { overlay, onClose };
  return { overlay, modal, close: closeModal };
}

export function closeModal() {
  if (!activeModal) return;
  const { overlay, onClose } = activeModal;
  overlay.classList.remove('modal-show');
  overlay.classList.add('modal-hide');
  overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
  activeModal = null;
}

export function showInviteModal({ fromUsername, fromId, expiresIn, onAccept, onDecline }) {
  const content = document.createElement('div');
  content.className = 'invite-modal-content';

  const timeoutSec = Math.ceil(expiresIn / 1000);
  content.innerHTML = `
    <div class="invite-avatar-row">
      <div class="invite-avatar">${fromUsername.charAt(0).toUpperCase()}</div>
      <div>
        <p class="invite-username">${fromUsername}</p>
        <p class="invite-subtext">challenges you to a battle!</p>
      </div>
    </div>
    <div class="invite-countdown-ring">
      <svg viewBox="0 0 60 60" class="ring-svg">
        <circle cx="30" cy="30" r="26" class="ring-track"/>
        <circle cx="30" cy="30" r="26" class="ring-progress" id="invite-ring"/>
      </svg>
      <span class="ring-seconds" id="invite-seconds">${timeoutSec}</span>
    </div>
  `;

  const { overlay, close } = showModal({
    title: '⚔️ Battle Invite!',
    content,
    buttons: [
      { text: 'Accept ✓', variant: 'primary', onClick: () => { onAccept(); } },
      { text: 'Decline ✗', variant: 'secondary', onClick: () => { onDecline(); } },
    ],
    id: 'invite-modal',
  });

  // Countdown ring animation
  const ring = document.getElementById('invite-ring');
  const secondsEl = document.getElementById('invite-seconds');
  const circumference = 2 * Math.PI * 26;
  if (ring) {
    ring.style.strokeDasharray = circumference;
    ring.style.strokeDashoffset = '0';
  }

  let remaining = timeoutSec;
  const timer = setInterval(() => {
    remaining--;
    if (secondsEl) secondsEl.textContent = remaining;
    if (ring) {
      const progress = 1 - (remaining / timeoutSec);
      ring.style.strokeDashoffset = circumference * progress;
    }
    if (remaining <= 0) {
      clearInterval(timer);
      close();
    }
  }, 1000);

  return { close: () => { clearInterval(timer); close(); } };
}
