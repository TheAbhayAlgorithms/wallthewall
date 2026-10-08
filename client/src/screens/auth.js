import { api } from '../api.js';
import { setUser, setToken } from '../state.js';
import { createInput } from '../ui/components.js';

export function renderAuth(container, onSuccess) {
  container.innerHTML = '';

  const screen = document.createElement('div');
  screen.className = 'screen auth-screen';
  screen.innerHTML = `
    <div class="auth-hero">
      <div class="auth-logo">
        <span class="logo-ember">EMBER</span>
        <span class="logo-pong">PONG</span>
      </div>
      <p class="auth-tagline">Ready to rally? 🏓</p>
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

  let currentTab = 'login';

  function renderLoginForm() {
    formContainer.innerHTML = '';
    const { wrapper: uWrapper, input: uInput, error: uError } = createInput({
      id: 'login-username', label: 'Username', placeholder: 'Your username',
    });
    const { wrapper: pWrapper, input: pInput, error: pError } = createInput({
      id: 'login-password', label: 'Password', type: 'password', placeholder: '••••••••',
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-full';
    submitBtn.id = 'btn-login';
    submitBtn.textContent = 'Let\'s Play!';

    const globalError = document.createElement('p');
    globalError.className = 'form-error';

    formContainer.appendChild(uWrapper);
    formContainer.appendChild(pWrapper);
    formContainer.appendChild(globalError);
    formContainer.appendChild(submitBtn);

    async function handleLogin() {
      globalError.textContent = '';
      uError.textContent = '';
      const username = uInput.value.trim();
      const password = pInput.value;

      if (!username) { uError.textContent = 'Username required'; return; }
      if (!password) { pError.textContent = 'Password required'; return; }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        const data = await api.auth.login(username, password);
        setToken(data.token);
        setUser(data.user);
        onSuccess(data.user, data.token);
      } catch (err) {
        globalError.textContent = err.error || 'Login failed. Try again.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Let\'s Play!';
      }
    }

    submitBtn.addEventListener('click', handleLogin);
    pInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
  }

  function renderRegisterForm() {
    formContainer.innerHTML = '';
    const { wrapper: uWrapper, input: uInput, error: uError } = createInput({
      id: 'reg-username', label: 'Username', placeholder: 'Choose a username (3-16 chars)',
    });
    const { wrapper: pWrapper, input: pInput, error: pError } = createInput({
      id: 'reg-password', label: 'Password', type: 'password', placeholder: 'Min 8 characters',
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'btn btn-primary btn-full';
    submitBtn.id = 'btn-register';
    submitBtn.textContent = 'Create Account';

    const globalError = document.createElement('p');
    globalError.className = 'form-error';

    formContainer.appendChild(uWrapper);
    formContainer.appendChild(pWrapper);
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
        onSuccess(data.user, data.token);
      } catch (err) {
        if (err.field === 'username') uError.textContent = err.error;
        else if (err.field === 'password') pError.textContent = err.error;
        else globalError.textContent = err.error || 'Registration failed.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    }

    submitBtn.addEventListener('click', handleRegister);
    pInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') handleRegister(); });
  }

  loginTab.addEventListener('click', () => {
    currentTab = 'login';
    loginTab.classList.add('tab-active');
    registerTab.classList.remove('tab-active');
    renderLoginForm();
  });

  registerTab.addEventListener('click', () => {
    currentTab = 'register';
    registerTab.classList.add('tab-active');
    loginTab.classList.remove('tab-active');
    renderRegisterForm();
  });

  renderLoginForm();
}
