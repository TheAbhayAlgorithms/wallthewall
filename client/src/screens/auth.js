import { api } from '../api.js';
import { setUser, setToken } from '../state.js';
import { createInput } from '../ui/components.js';
import { showToast } from '../ui/toast.js';

export function renderAuth(container, onSuccess) {
  container.innerHTML = '';

  const screen = document.createElement('div');
  screen.className = 'screen auth-screen';
  screen.innerHTML = `
    <div class="auth-hero">
      <div class="auth-logo">
        <span class="logo-wall">WALL</span>
        <span class="logo-middle">THE</span>
        <span class="logo-wall">WALL</span>
      </div>
      <p class="auth-tagline">Bounce. Smash. Dominate. 🧱⚡</p>
    </div>
    <div class="auth-card card">
      <div class="tab-bar">
        <button id="tab-login" class="tab-btn tab-active">Login</button>
        <button id="tab-register" class="tab-btn">Register</button>
      </div>
      <div id="auth-form-container"></div>
    </div>
  `;

  container.appendChild(screen);

  const loginTab = screen.querySelector('#tab-login');
  const registerTab = screen.querySelector('#tab-register');
  const formContainer = screen.querySelector('#auth-form-container');

  function renderLoginForm() {
    formContainer.innerHTML = '';
    const { wrapper: uWrapper, input: uInput, error: uError } = createInput({
      id: 'login-username',
      label: 'Username or User ID (#)',
      placeholder: 'e.g. striker or #42',
    });
    const { wrapper: pWrapper, input: pInput, error: pError } = createInput({
      id: 'login-password',
      label: 'Password',
      type: 'password',
      placeholder: '••••••••',
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-full';
    submitBtn.id = 'btn-login';
    submitBtn.textContent = 'Enter Arena ⚔️';

    const globalError = document.createElement('p');
    globalError.className = 'form-error';

    formContainer.appendChild(uWrapper);
    formContainer.appendChild(pWrapper);
    formContainer.appendChild(globalError);
    formContainer.appendChild(submitBtn);

    async function handleLogin() {
      globalError.textContent = '';
      uError.textContent = '';
      const identifier = uInput.value.trim();
      const password = pInput.value;

      if (!identifier) { uError.textContent = 'Username or User ID required'; return; }
      if (!password) { pError.textContent = 'Password required'; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Authenticating...';

      try {
        const data = await api.auth.login(identifier, password);
        setToken(data.token);
        setUser(data.user);
        showToast({ message: `Welcome back, ${data.user.username}! (ID: #${data.user.id})`, type: 'success' });
        onSuccess(data.user, data.token);
      } catch (err) {
        globalError.textContent = err.error || 'Login failed. Try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enter Arena ⚔️';
      }
    }

    submitBtn.addEventListener('click', handleLogin);
    pInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  }

  function renderRegisterForm() {
    formContainer.innerHTML = '';
    const { wrapper: uWrapper, input: uInput, error: uError } = createInput({
      id: 'reg-username',
      label: 'Choose Username',
      placeholder: '3-16 characters (letters, numbers, _)',
    });
    const { wrapper: pWrapper, input: pInput, error: pError } = createInput({
      id: 'reg-password',
      label: 'Password',
      type: 'password',
      placeholder: 'Min 8 characters',
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-full';
    submitBtn.id = 'btn-register';
    submitBtn.textContent = 'Create Fighter Account 🧱';

    const globalError = document.createElement('p');
    globalError.className = 'form-error';

    const tip = document.createElement('p');
    tip.className = 'muted';
    tip.style.fontSize = '0.8rem';
    tip.style.textAlign = 'center';
    tip.style.marginBottom = '12px';
    tip.textContent = '💡 You will receive a unique User ID to log in anytime!';

    formContainer.appendChild(uWrapper);
    formContainer.appendChild(pWrapper);
    formContainer.appendChild(tip);
    formContainer.appendChild(globalError);
    formContainer.appendChild(submitBtn);

    // Client-side validation
    uInput.addEventListener('input', () => {
      const v = uInput.value.trim();
      if (v.length > 0 && v.length < 3) uError.textContent = 'Too short (min 3)';
      else if (v.length > 16) uError.textContent = 'Too long (max 16)';
      else if (v && !/^[a-zA-Z0-9_]+$/.test(v)) uError.textContent = 'Letters, numbers, underscore only';
      else uError.textContent = '';
    });

    pInput.addEventListener('input', () => {
      pError.textContent = pInput.value.length > 0 && pInput.value.length < 8 ? 'Min 8 characters' : '';
    });

    async function handleRegister() {
      globalError.textContent = '';
      const username = uInput.value.trim();
      const password = pInput.value;

      if (!username || username.length < 3 || username.length > 16 || !/^[a-zA-Z0-9_]+$/.test(username)) {
        uError.textContent = uError.textContent || 'Invalid username';
        return;
      }
      if (!password || password.length < 8) {
        pError.textContent = 'Min 8 characters';
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const data = await api.auth.register(username, password);
        setToken(data.token);
        setUser(data.user);
        showToast({
          message: `Account created! Your permanent ID is #${data.user.id}`,
          type: 'success',
          duration: 6000,
        });
        onSuccess(data.user, data.token);
      } catch (err) {
        if (err.field === 'username') uError.textContent = err.error;
        else if (err.field === 'password') pError.textContent = err.error;
        else globalError.textContent = err.error || 'Registration failed.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Fighter Account 🧱';
      }
    }

    submitBtn.addEventListener('click', handleRegister);
    pInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });
  }

  loginTab.addEventListener('click', () => {
    loginTab.classList.add('tab-active');
    registerTab.classList.remove('tab-active');
    renderLoginForm();
  });

  registerTab.addEventListener('click', () => {
    registerTab.classList.add('tab-active');
    loginTab.classList.remove('tab-active');
    renderRegisterForm();
  });

  renderLoginForm();
}
