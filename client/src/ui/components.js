// Reusable UI components

/**
 * Generate avatar color from username hash
 */
export function usernameToColor(username) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    '#FF6B35', '#3DFFB5', '#FF3D9A', '#FFB830', '#7B61FF',
    '#00D4FF', '#FF4B6E', '#36D986', '#FF8C42', '#A855F7',
  ];
  return colors[Math.abs(hash) % colors.length];
}

/**
 * Create avatar element (colored circle with initial)
 */
export function createAvatar(username, size = 40) {
  const color = usernameToColor(username);
  const div = document.createElement('div');
  div.className = 'avatar';
  div.style.cssText = `
    width: ${size}px; height: ${size}px;
    background: ${color};
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-family: 'Fredoka', sans-serif;
    font-size: ${size * 0.4}px; font-weight: 600;
    color: #121014;
    flex-shrink: 0;
    user-select: none;
  `;
  div.textContent = username.charAt(0).toUpperCase();
  div.title = username;
  return div;
}

/**
 * Create status dot element
 */
export function createStatusDot(status) {
  const dot = document.createElement('span');
  dot.className = `status-dot status-${status}`;
  dot.setAttribute('aria-label', status);
  return dot;
}

/**
 * Create button
 */
export function createButton(text, variant = 'primary', onClick) {
  const btn = document.createElement('button');
  btn.className = `btn btn-${variant}`;
  btn.textContent = text;
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/**
 * Create card
 */
export function createCard(content) {
  const card = document.createElement('div');
  card.className = 'card';
  if (typeof content === 'string') card.innerHTML = content;
  else if (content instanceof Element) card.appendChild(content);
  return card;
}

/**
 * Create input with label
 */
export function createInput({ id, label, type = 'text', placeholder, value = '' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'input-group';

  const lbl = document.createElement('label');
  lbl.htmlFor = id;
  lbl.textContent = label;

  const input = document.createElement('input');
  input.id = id;
  input.type = type;
  input.placeholder = placeholder || '';
  input.value = value;
  input.className = 'input';

  const error = document.createElement('span');
  error.className = 'input-error';
  error.id = `${id}-error`;

  wrapper.appendChild(lbl);
  wrapper.appendChild(input);
  wrapper.appendChild(error);

  return { wrapper, input, error };
}
