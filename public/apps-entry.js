(function () {
  const launchButton = document.getElementById('appsEntryButton');
  if (!launchButton) return;

  const modal = document.createElement('div');
  modal.className = 'apps-modal hidden';
  modal.innerHTML = `
    <div class="apps-modal__backdrop" data-close="true"></div>
    <div class="apps-modal__panel" role="dialog" aria-modal="true" aria-labelledby="appsModalTitle">
      <button class="apps-modal__close" type="button" aria-label="Close" data-close="true">&times;</button>
      <p class="apps-modal__eyebrow">Protected apps</p>
      <h2 id="appsModalTitle">Enter app password</h2>
      <p class="apps-modal__copy">If the password is correct, you'll be taken to the private app launcher.</p>
      <form id="appsEntryForm" class="apps-modal__form">
        <label class="apps-modal__label" for="appsPasswordInput">Password</label>
        <input id="appsPasswordInput" class="apps-modal__input" type="password" autocomplete="current-password" required />
        <p id="appsEntryError" class="apps-modal__error hidden" aria-live="polite"></p>
        <button id="appsEntrySubmit" class="apps-modal__submit" type="submit">Open apps</button>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const form = modal.querySelector('#appsEntryForm');
  const input = modal.querySelector('#appsPasswordInput');
  const error = modal.querySelector('#appsEntryError');
  const submit = modal.querySelector('#appsEntrySubmit');

  function openModal() {
    modal.classList.remove('hidden');
    document.body.classList.add('apps-modal-open');
    error.classList.add('hidden');
    error.textContent = '';
    form.reset();
    setTimeout(() => input.focus(), 0);
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.classList.remove('apps-modal-open');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    submit.disabled = true;
    submit.textContent = 'Checking...';
    error.classList.add('hidden');

    try {
      const response = await fetch('/api/apps/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value })
      });

      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Incorrect password.');
      }

      window.location.href = data.redirectTo || '/apps';
    } catch (err) {
      error.textContent = err.message || 'Unable to open apps right now.';
      error.classList.remove('hidden');
      submit.disabled = false;
      submit.textContent = 'Open apps';
    }
  }

  launchButton.addEventListener('click', openModal);
  modal.addEventListener('click', (event) => {
    if (event.target.dataset.close === 'true') {
      closeModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !modal.classList.contains('hidden')) {
      closeModal();
    }
  });
  form.addEventListener('submit', handleSubmit);
})();
