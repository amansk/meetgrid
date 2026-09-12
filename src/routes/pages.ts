import { Hono } from 'hono';
import styles from '../assets/styles';
import type { Env } from '../types';

const pages = new Hono<{ Bindings: Env }>();

function layout(title: string, body: string, extraScript = ''): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Meetgrid</title>
  <style>${styles}</style>
</head>
<body>
  ${body}
  ${extraScript}
</body>
</html>`;
}

pages.get('/', (c) => {
  const html = layout(
    'Create poll',
    `<div class="wrap">
  <header>
    <h1>Meetgrid</h1>
    <p>Create a scheduling poll — no account needed.</p>
  </header>

  <div id="alert" class="alert error hidden"></div>

  <form id="create-form">
    <label for="title">Poll title</label>
    <input type="text" id="title" name="title" required placeholder="Team sync">

    <label for="notes">Notes <span class="link-muted">(optional)</span></label>
    <textarea id="notes" name="notes" placeholder="Any context for respondents"></textarea>

    <label for="timezone">Timezone</label>
    <select id="timezone" name="timezone"></select>

    <div class="row">
      <div>
        <label for="start_date">Start date</label>
        <input type="date" id="start_date" name="start_date" required>
      </div>
      <div>
        <label for="end_date">End date</label>
        <input type="date" id="end_date" name="end_date" required>
      </div>
    </div>

    <div class="row">
      <div>
        <label for="daily_start">Daily window start</label>
        <input type="time" id="daily_start" name="daily_start" value="09:00" required>
      </div>
      <div>
        <label for="daily_end">Daily window end</label>
        <input type="time" id="daily_end" name="daily_end" value="17:00" required>
      </div>
    </div>

    <label for="duration_minutes">Meeting duration (minutes)</label>
    <input type="number" id="duration_minutes" name="duration_minutes" value="30" min="15" max="480" step="15" required>

    <fieldset>
      <legend>Weekdays <span class="link-muted">(leave all checked for every day)</span></legend>
      <div class="weekdays" id="weekdays">
        ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
          .map(
            (d, i) =>
              `<label><input type="checkbox" name="weekday" value="${i + 1}" checked> ${d}</label>`
          )
          .join('')}
      </div>
    </fieldset>

    <button type="submit" class="primary" id="submit-btn">Create poll</button>
  </form>

  <div id="success" class="hidden">
    <div class="alert success">Poll created! Share the link below.</div>
    <div class="section-title">Share with respondents</div>
    <div class="copy-row">
      <input type="text" id="poll-url" readonly>
      <button type="button" class="secondary" data-copy="poll-url">Copy</button>
    </div>
    <div class="section-title">Organizer links <span class="link-muted">(save these — shown once)</span></div>
    <div class="copy-row">
      <input type="text" id="organizer-url" readonly>
      <button type="button" class="secondary" data-copy="organizer-url">Copy</button>
    </div>
    <div class="copy-row">
      <input type="text" id="organizer-secret" readonly>
      <button type="button" class="secondary" data-copy="organizer-secret">Copy secret</button>
    </div>
    <div class="actions">
      <a class="btn primary" id="go-respond" href="#">Open poll</a>
      <a class="btn secondary" id="go-results" href="#">View results</a>
    </div>
  </div>
</div>
<script>
const TIMEZONES = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['America/Los_Angeles','America/New_York','America/Chicago','Europe/London','Europe/Paris','Asia/Tokyo','UTC'];

const tzSelect = document.getElementById('timezone');
TIMEZONES.sort().forEach(tz => {
  const opt = document.createElement('option');
  opt.value = tz;
  opt.textContent = tz.replace(/_/g, ' ');
  if (tz === 'America/Los_Angeles') opt.selected = true;
  tzSelect.appendChild(opt);
});

const today = new Date();
const pad = n => String(n).padStart(2, '0');
const fmt = d => d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
document.getElementById('start_date').value = fmt(today);
const end = new Date(today); end.setDate(end.getDate() + 6);
document.getElementById('end_date').value = fmt(end);

function showError(msg) {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.classList.remove('hidden');
}

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('alert').classList.add('hidden');
  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const weekdays = [...document.querySelectorAll('input[name=weekday]:checked')].map(el => Number(el.value));
  const body = {
    title: document.getElementById('title').value,
    notes: document.getElementById('notes').value || undefined,
    timezone: document.getElementById('timezone').value,
    duration_minutes: Number(document.getElementById('duration_minutes').value),
    start_date: document.getElementById('start_date').value,
    end_date: document.getElementById('end_date').value,
    daily_start: document.getElementById('daily_start').value,
    daily_end: document.getElementById('daily_end').value,
    weekdays: weekdays.length === 7 ? undefined : weekdays,
  };

  try {
    const res = await fetch('/api/polls', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create poll');
    document.getElementById('create-form').classList.add('hidden');
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('poll-url').value = data.poll_url;
    document.getElementById('organizer-url').value = data.organizer_url;
    document.getElementById('organizer-secret').value = data.organizer_secret;
    document.getElementById('go-respond').href = data.poll_url;
    document.getElementById('go-results').href = data.organizer_url;
    localStorage.setItem('meetgrid_secret_' + data.poll_id, data.organizer_secret);
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
    btn.textContent = 'Create poll';
  }
});

document.querySelectorAll('[data-copy]').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.copy);
    input.select();
    navigator.clipboard.writeText(input.value);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = btn.dataset.copy === 'organizer-secret' ? 'Copy secret' : 'Copy'; }, 1500);
  });
});
</script>`
  );
  return c.html(html);
});

pages.get('/p/:id', (c) => {
  const pollId = c.req.param('id');
  const html = layout(
    'Respond',
    `<div class="wrap">
  <header>
    <h1 id="poll-title">Loading…</h1>
    <p id="poll-notes"></p>
  </header>

  <div id="alert" class="alert error hidden"></div>
  <div id="closed-notice" class="alert info hidden">This poll is closed.</div>

  <form id="respond-form">
    <label for="name">Your name</label>
    <input type="text" id="name" name="name" required placeholder="Alex">

    <div class="section-title">Mark your availability</div>
    <ul class="slot-list" id="slots"></ul>

    <button type="submit" class="primary" id="submit-btn">Submit responses</button>
  </form>

  <div id="success" class="hidden">
    <div class="alert success">Responses saved!</div>
    <p class="link-muted">Save your edit link to change answers later:</p>
    <div class="copy-row">
      <input type="text" id="edit-link" readonly>
      <button type="button" class="secondary" id="copy-edit">Copy</button>
    </div>
    <div class="actions">
      <a class="btn secondary" id="view-results" href="/p/${pollId}/results">View results</a>
    </div>
  </div>
</div>
<script>
const POLL_ID = ${JSON.stringify(pollId)};
const votes = {};
let editToken = null;

function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setCookie(name, value) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax';
}

function showError(msg) {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function renderSlots(slots) {
  const ul = document.getElementById('slots');
  ul.innerHTML = slots.map(s => {
    const v = votes[s.id];
    const yesCls = v === true ? 'selected-yes' : '';
    const noCls = v === false ? 'selected-no' : '';
    return '<li class="slot-item" data-slot="' + s.id + '">' +
      '<span class="slot-label">' + escapeHtml(s.label) + '</span>' +
      '<div class="vote-btns">' +
        '<button type="button" class="yes-btn ' + yesCls + '" data-v="1">Yes</button>' +
        '<button type="button" class="no-btn ' + noCls + '" data-v="0">No</button>' +
      '</div></li>';
  }).join('');

  ul.querySelectorAll('.yes-btn, .no-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const li = btn.closest('.slot-item');
      const slotId = li.dataset.slot;
      const isYes = btn.classList.contains('yes-btn');
      votes[slotId] = isYes;
      li.querySelector('.yes-btn').classList.toggle('selected-yes', isYes);
      li.querySelector('.no-btn').classList.toggle('selected-no', !isYes);
    });
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function loadPoll() {
  const res = await fetch('/api/polls/' + POLL_ID);
  const poll = await res.json();
  if (!res.ok) throw new Error(poll.error || 'Poll not found');

  document.getElementById('poll-title').textContent = poll.title;
  document.getElementById('poll-notes').textContent = poll.notes || '';

  if (poll.status === 'closed') {
    document.getElementById('closed-notice').classList.remove('hidden');
    document.getElementById('respond-form').classList.add('hidden');
  }

  poll.slots.forEach(s => { if (!(s.id in votes)) votes[s.id] = null; });
  renderSlots(poll.slots);

  editToken = editToken || getCookie('meetgrid_edit_' + POLL_ID);
  if (editToken) {
    try {
      const meRes = await fetch('/api/polls/' + POLL_ID + '/my-response?edit_token=' + encodeURIComponent(editToken));
      if (meRes.ok) {
        const me = await meRes.json();
        document.getElementById('name').value = me.name;
        Object.entries(me.votes).forEach(([slotId, yes]) => { votes[slotId] = yes; });
        renderSlots(poll.slots);
      }
    } catch (_) {}
  } else {
    const storedName = localStorage.getItem('meetgrid_name_' + POLL_ID);
    if (storedName) document.getElementById('name').value = storedName;
  }
  return poll;
}

document.getElementById('respond-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('alert').classList.add('hidden');

  const slotVotes = Object.entries(votes)
    .filter(([, v]) => v !== null)
    .map(([slot_id, yes]) => ({ slot_id, yes }));

  if (!slotVotes.length) {
    showError('Please answer at least one slot.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;

  const body = {
    name: document.getElementById('name').value.trim(),
    edit_token: editToken || undefined,
    votes: slotVotes,
  };

  try {
    const res = await fetch('/api/polls/' + POLL_ID + '/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to submit');

    editToken = data.edit_token;
    setCookie('meetgrid_edit_' + POLL_ID, editToken);
    localStorage.setItem('meetgrid_name_' + POLL_ID, body.name);

    const editLink = location.origin + '/p/' + POLL_ID + '?edit=' + encodeURIComponent(editToken);
    document.getElementById('respond-form').classList.add('hidden');
    document.getElementById('success').classList.remove('hidden');
    document.getElementById('edit-link').value = editLink;

    if (data.poll?.responses) {
      const mine = data.poll.responses.find(r => r.id === data.respondent_id);
      if (mine) {
        Object.assign(votes, mine.votes);
      }
    }
  } catch (err) {
    showError(err.message);
    btn.disabled = false;
  }
});

document.getElementById('copy-edit').addEventListener('click', () => {
  const input = document.getElementById('edit-link');
  input.select();
  navigator.clipboard.writeText(input.value);
});

// Pre-fill from URL edit token
const params = new URLSearchParams(location.search);
const urlEdit = params.get('edit');
if (urlEdit) {
  editToken = urlEdit;
  setCookie('meetgrid_edit_' + POLL_ID, urlEdit);
}

loadPoll().catch(err => showError(err.message));
</script>`
  );
  return c.html(html);
});

pages.get('/p/:id/results', (c) => {
  const pollId = c.req.param('id');
  const html = layout(
    'Results',
    `<div class="wrap">
  <header>
    <h1 id="poll-title">Loading…</h1>
    <p id="poll-meta"></p>
  </header>

  <div id="alert" class="alert error hidden"></div>

  <div id="organizer-panel" class="hidden">
    <div class="alert info">Organizer mode — you can pick a final slot and close the poll.</div>
  </div>

  <div class="section-title">Best times <span class="link-muted">(by yes count)</span></div>
  <ol class="rank-list" id="ranked"></ol>

  <div class="section-title">Heatmap</div>
  <div style="overflow-x:auto" id="heatmap-wrap"></div>

  <div id="organizer-actions" class="hidden">
    <div class="section-title">Pick final time</div>
    <select id="chosen-slot"></select>
    <div class="actions">
      <button type="button" class="primary" id="set-decision">Mark as chosen</button>
      <button type="button" class="secondary" id="close-poll">Close poll</button>
    </div>
  </div>

  <div class="actions" style="margin-top:2rem">
    <a class="btn secondary" href="/p/${pollId}">Respond to poll</a>
    <a class="btn secondary" href="/">Create new poll</a>
  </div>
</div>
<script>
const POLL_ID = ${JSON.stringify(pollId)};
let organizerSecret = new URLSearchParams(location.search).get('secret')
  || localStorage.getItem('meetgrid_secret_' + POLL_ID);
let pollData = null;

function showError(msg) {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function heatClass(count, max) {
  if (!max || !count) return 'heat-0';
  const ratio = count / max;
  if (ratio >= 0.75) return 'heat-4';
  if (ratio >= 0.5) return 'heat-3';
  if (ratio >= 0.33) return 'heat-2';
  if (ratio >= 0.15) return 'heat-1';
  return 'heat-0';
}

function escapeHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderResults(poll) {
  pollData = poll;
  document.getElementById('poll-title').textContent = poll.title;
  const badges = [];
  if (poll.status === 'closed') badges.push('<span class="badge closed">Closed</span>');
  if (poll.chosen_slot_id) badges.push('<span class="badge chosen">Time chosen</span>');
  document.getElementById('poll-meta').innerHTML = poll.timezone.replace(/_/g,' ') + ' · ' + poll.slots.length + ' slots ' + badges.join(' ');

  const slotMap = Object.fromEntries(poll.slots.map(s => [s.id, s]));
  const maxYes = Math.max(0, ...poll.slots.map(s => s.yes_count));

  const ranked = document.getElementById('ranked');
  ranked.innerHTML = poll.ranked_slot_ids.map(id => {
    const s = slotMap[id];
    const chosen = poll.chosen_slot_id === id ? ' chosen' : '';
    return '<li class="rank-item' + chosen + '"><span>' + escapeHtml(s.label) + '</span><strong>' + s.yes_count + ' yes</strong></li>';
  }).join('');

  let table = '<table class="results-table"><thead><tr><th>Person</th>';
  poll.slots.forEach(s => { table += '<th>' + escapeHtml(s.label.split(' · ')[1] || s.label) + '</th>'; });
  table += '</tr></thead><tbody>';
  poll.responses.forEach(r => {
    table += '<tr><td>' + escapeHtml(r.name) + '</td>';
    poll.slots.forEach(s => {
      const v = r.votes[s.id];
      const cell = v === true ? '✓' : v === false ? '✗' : '–';
      table += '<td>' + cell + '</td>';
    });
    table += '</tr>';
  });
  table += '<tr><td><strong>Yes total</strong></td>';
  poll.slots.forEach(s => {
    table += '<td class="' + heatClass(s.yes_count, maxYes) + '"><strong>' + s.yes_count + '</strong></td>';
  });
  table += '</tr></tbody></table>';
  document.getElementById('heatmap-wrap').innerHTML = table;

  if (organizerSecret) {
    document.getElementById('organizer-panel').classList.remove('hidden');
    document.getElementById('organizer-actions').classList.remove('hidden');
    const sel = document.getElementById('chosen-slot');
    sel.innerHTML = poll.slots.map(s =>
      '<option value="' + s.id + '"' + (poll.chosen_slot_id === s.id ? ' selected' : '') + '>' + escapeHtml(s.label) + ' (' + s.yes_count + ' yes)</option>'
    ).join('');
  }
}

async function loadPoll() {
  const res = await fetch('/api/polls/' + POLL_ID);
  const poll = await res.json();
  if (!res.ok) throw new Error(poll.error || 'Poll not found');
  renderResults(poll);
}

document.getElementById('set-decision')?.addEventListener('click', async () => {
  if (!organizerSecret) return;
  const slot_id = document.getElementById('chosen-slot').value;
  const res = await fetch('/api/polls/' + POLL_ID + '/decision', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizer_secret: organizerSecret, slot_id }),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Failed');
  renderResults(data.poll);
});

document.getElementById('close-poll')?.addEventListener('click', async () => {
  if (!organizerSecret || !confirm('Close this poll? No more responses will be accepted.')) return;
  const res = await fetch('/api/polls/' + POLL_ID + '/close', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organizer_secret: organizerSecret }),
  });
  const data = await res.json();
  if (!res.ok) return showError(data.error || 'Failed');
  renderResults(data.poll);
});

loadPoll().catch(err => showError(err.message));
</script>`
  );
  return c.html(html);
});

export default pages;
