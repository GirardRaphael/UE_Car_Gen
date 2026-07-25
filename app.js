const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const messages = $('#messages');
const promptInput = $('#promptInput');
const toast = $('#toast');

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

function scrollMessages() {
  messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
}

function addUserMessage(text) {
  const article = document.createElement('article');
  article.className = 'message user-message';
  article.innerHTML = `<div class="avatar user-avatar">AR</div><div class="message-body"><div class="message-meta"><b>You</b><time>Just now</time></div><p>${escapeHtml(text)}</p></div>`;
  messages.append(article);
}

function addAssistantRun(text) {
  const article = document.createElement('article');
  article.className = 'message assistant-message';
  article.innerHTML = `<div class="avatar ai-avatar">✦</div><div class="message-body"><div class="message-meta"><b>Forge AI</b><span class="model-pill">GPT-5</span><time>Just now</time></div><p>I’ll translate that into a non-destructive Unreal scene update and preserve the current lighting setup.</p><div class="tool-card running"><div><span class="tool-icon">⌁</span><span><b>update_vehicle_scene</b><small>MCP · Unreal Engine</small></span></div><span class="tool-status">Running…</span></div></div>`;
  messages.append(article);
  scrollMessages();
  window.setTimeout(() => {
    const card = $('.tool-card', article);
    card.classList.remove('running');
    card.classList.add('complete');
    $('.tool-status', card).textContent = '✓ Complete';
    $('.message-body', article).insertAdjacentHTML('beforeend', `<p class="result-copy">Done — ${escapeHtml(text.charAt(0).toLowerCase() + text.slice(1))}. The scene has been synced and is ready to review in the viewport.</p><div class="message-actions"><button>◫ Copy</button><button>↻ Regenerate</button><button>♧</button><button>♤</button></div>`);
    scrollMessages();
  }, 1500);
}

$('#chatForm').addEventListener('submit', event => {
  event.preventDefault();
  const text = promptInput.value.trim();
  if (!text) return;
  addUserMessage(text);
  promptInput.value = '';
  promptInput.style.height = 'auto';
  window.setTimeout(() => addAssistantRun(text), 450);
});

promptInput.addEventListener('input', () => {
  promptInput.style.height = 'auto';
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 100)}px`;
});

promptInput.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') $('#chatForm').requestSubmit();
});

$$('.suggestions button').forEach(button => button.addEventListener('click', () => {
  promptInput.value = button.dataset.prompt;
  promptInput.focus();
}));

$$('.inspector-tabs button').forEach(button => button.addEventListener('click', () => {
  $$('.inspector-tabs button').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  $$('.properties').forEach(panel => panel.classList.add('hidden'));
  $(`#${button.dataset.panel}`).classList.remove('hidden');
}));

$('#rideHeight').addEventListener('input', event => {
  $('#rideOutput').textContent = `${event.target.value < 0 ? '−' : '+'}${Math.abs(event.target.value)} mm`;
});

function showToast(title = 'Scene export started', detail = 'Sending assets to Unreal Engine…') {
  $('b', toast).textContent = title;
  $('small', toast).textContent = detail;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 3200);
}

$('#exportBtn').addEventListener('click', () => showToast());
$('#playBtn').addEventListener('click', event => {
  event.currentTarget.querySelector('span').textContent = event.currentTarget.dataset.playing ? '▶' : 'Ⅱ';
  event.currentTarget.dataset.playing = event.currentTarget.dataset.playing ? '' : 'true';
  showToast('Cinematic preview', event.currentTarget.dataset.playing ? 'Playing level sequence at 60 FPS' : 'Preview paused');
});

const renderDialog = $('#renderDialog');
const fullRender = $('#fullRender');
const renderCanvas = $('#renderCanvas');
function openRender(src, title = 'Apex GT · Cinematic 01') {
  fullRender.src = src; $('#openOriginal').href = src; $('#renderTitle').textContent = title;
  renderCanvas.classList.remove('zoomed'); $('#zoomBtn').textContent = '＋ Zoom'; renderDialog.showModal();
}
$('#mainRender').addEventListener('click', event => openRender(event.currentTarget.src));
$('#mainRender').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRender(event.currentTarget.src); } });
$$('.render-activity').forEach(item => item.addEventListener('click', () => openRender(item.dataset.render)));
$('#viewRendersBtn').addEventListener('click', () => openRender('assets/apex-gt-cinematic.png'));
$('#closeRender').addEventListener('click', () => renderDialog.close());
$('#zoomBtn').addEventListener('click', () => { renderCanvas.classList.toggle('zoomed'); $('#zoomBtn').textContent = renderCanvas.classList.contains('zoomed') ? '− Fit image' : '＋ Zoom'; });
fullRender.addEventListener('click', () => { if (renderCanvas.classList.contains('zoomed')) $('#zoomBtn').click(); });
renderDialog.addEventListener('click', event => { if (event.target === renderDialog) renderDialog.close(); });

const settingsDialog = $('#settingsDialog');
$('#settingsBtn').addEventListener('click', () => settingsDialog.showModal());
$('#revealKey').addEventListener('click', event => {
  const input = $('#apiKey');
  input.type = input.type === 'password' ? 'text' : 'password';
  event.currentTarget.textContent = input.type === 'password' ? 'Show' : 'Hide';
});
$('#testConnection').addEventListener('click', event => {
  event.currentTarget.textContent = 'Testing…';
  window.setTimeout(() => {
    event.currentTarget.textContent = 'Connected';
    const indicator = $('.connection-test>span>i');
    indicator.style.background = 'var(--green)';
    indicator.style.boxShadow = '0 0 7px rgba(97,196,147,.55)';
    $('.connection-test small').textContent = 'Local bridge responded in 28 ms';
  }, 900);
});
$('#saveSettings').addEventListener('click', () => {
  localStorage.setItem('forge-provider', $('#provider').value);
  localStorage.setItem('forge-mcp-url', $('#mcpUrl').value);
  if ($('#apiKey').value) localStorage.setItem('forge-api-key', $('#apiKey').value);
  showToast('Connections saved', 'Your local prototype settings were updated');
});

window.addEventListener('DOMContentLoaded', () => {
  $('#provider').value = localStorage.getItem('forge-provider') || 'OpenAI';
  $('#mcpUrl').value = localStorage.getItem('forge-mcp-url') || 'http://localhost:8080/mcp';
  $('#apiKey').value = localStorage.getItem('forge-api-key') || '';
});

$('#newProjectBtn').addEventListener('click', () => {
  promptInput.value = 'Create a new cinematic vehicle concept: ';
  promptInput.focus();
});
