// Simple client-side router
const routes = {};
let currentScreen = null;

export function addRoute(name, renderFn) {
  routes[name] = renderFn;
}

export function navigate(name, props = {}) {
  const render = routes[name];
  if (!render) return console.warn('No route:', name);

  const appEl = document.getElementById('app');
  if (!appEl) return;

  // Fade out
  const old = appEl.querySelector('.screen');
  if (old) {
    old.classList.add('screen-exit');
    old.addEventListener('animationend', () => old.remove(), { once: true });
    setTimeout(() => old.remove(), 300);
  }

  // Clear and render
  setTimeout(() => {
    appEl.innerHTML = '';
    currentScreen = name;
    render(appEl, props);

    // Fade in
    const newScreen = appEl.querySelector('.screen');
    if (newScreen) {
      newScreen.classList.add('screen-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => newScreen.classList.remove('screen-enter'));
      });
    }
  }, old ? 250 : 0);
}

export function getCurrentScreen() {
  return currentScreen;
}
