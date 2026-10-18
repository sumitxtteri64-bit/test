'use strict';
const $ = id => document.getElementById(id);
let guilds = [];
let noticeTimer;
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  if (response.status === 401) { location.href = '/login'; throw new Error('Please sign in again.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
function notify(message, error = false) {
  const notice = $('notice'); notice.textContent = message; notice.classList.toggle('error', error); notice.classList.remove('hidden');
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.classList.add('hidden'), 3500);
}
function updateOverview() {
  const total = guilds.length, anti = guilds.filter(g => g.antinuke).length, automod = guilds.filter(g => g.automod).length;
  const protectedCount = guilds.filter(g => g.antinuke || g.automod).length;
  $('stat-servers').textContent = total.toLocaleString(); $('stat-antinuke').textContent = anti.toLocaleString();
  $('stat-automod').textContent = automod.toLocaleString(); $('stat-coverage').textContent = `${total ? Math.round(protectedCount / total * 100) : 0}%`;
  $('nav-server-count').textContent = total.toLocaleString();
}
function renderServers() {
  updateOverview();
  const query = $('server-search').value.trim().toLowerCase();
  const visible = guilds.filter(g => `${g.name} ${g.id}`.toLowerCase().includes(query));
  $('server-count').textContent = `${visible.length} of ${guilds.length} server${guilds.length === 1 ? '' : 's'}`;
  if (!guilds.length) { $('servers').innerHTML = '<div class="empty">No servers found. Check that the bot is online and connected.</div>'; return; }
  if (!visible.length) { $('servers').innerHTML = '<div class="empty">No servers match that search. Try another name or server ID.</div>'; return; }
  $('servers').innerHTML = visible.map(g => `<article class="server-card"><div class="server-head">${g.icon ? `<img class="server-icon" src="${escapeHtml(g.icon)}" alt="" loading="lazy">` : `<div class="server-icon">${escapeHtml(String(g.name || '?').slice(0,1).toUpperCase())}</div>`}<div><h3>${escapeHtml(g.name)}</h3><p>${Number(g.memberCount || 0).toLocaleString()} members · ${escapeHtml(g.id)}</p></div></div><div class="tags"><span class="tag ${g.antinuke?'on':''}">Antinuke ${g.antinuke?'On':'Off'}</span><span class="tag ${g.automod?'on':''}">Automod ${g.automod?'On':'Off'}</span></div><button class="primary" data-edit="${escapeHtml(g.id)}">Configure server <span>→</span></button></article>`).join('');
  document.querySelectorAll('[data-edit]').forEach(button => button.addEventListener('click', () => openSettings(button.dataset.edit)));
}
async function loadServers(showNotice = false) {
  const refresh = $('refresh'); if (refresh) { refresh.disabled = true; refresh.textContent = '↻ Loading…'; }
  try { const data = await api('/api/guilds'); guilds = Array.isArray(data.guilds) ? data.guilds : []; renderServers(); if (showNotice) notify('Dashboard overview refreshed.'); }
  catch (error) { notify(error.message, true); }
  finally { if (refresh) { refresh.disabled = false; refresh.textContent = '↻ Refresh'; } }
}
async function openSettings(id) {
  try {
    const { guild } = await api(`/api/guilds/${encodeURIComponent(id)}`);
    $('guild-id').value = guild.id; $('guild-title').textContent = guild.name; $('prefix').value = guild.prefix || ';';
    $('antinuke').checked = Boolean(guild.antinuke); $('automod').checked = Boolean(guild.automod); $('settings-dialog').showModal();
  } catch (error) { notify(error.message, true); }
}
async function init() {
  try {
    const me = await api('/api/me'); const username = me.user?.username || 'Authorized user';
    $('username').textContent = username; $('user-avatar').textContent = username.slice(0,1).toUpperCase();
    await loadServers();
  } catch (error) { notify(error.message, true); }
}
$('server-search').addEventListener('input', renderServers);
$('refresh').addEventListener('click', () => loadServers(true));
$('runtime-refresh').addEventListener('click', () => loadServers(true));
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const id = $('guild-id').value;
  try {
    await api(`/api/guilds/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ prefix: $('prefix').value, antinuke: $('antinuke').checked, automod: $('automod').checked }) });
    $('settings-dialog').close(); notify('Server settings saved successfully.'); await loadServers();
  } catch (error) { notify(error.message, true); }
});
function closeSettings() { $('settings-dialog').close(); }
$('cancel').addEventListener('click', closeSettings); $('close-dialog').addEventListener('click', closeSettings);
$('settings-dialog').addEventListener('click', event => { if (event.target === $('settings-dialog')) closeSettings(); });
$('logout').addEventListener('click', async () => { try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } finally { location.href = '/login'; } });
init();
