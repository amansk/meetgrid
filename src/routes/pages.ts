import { Hono } from 'hono';
import type { Context } from 'hono';
import styles from '../assets/styles';
import { parsePollId } from '../lib/validate';
import type { Env } from '../types';

type PageContext = Context<{ Bindings: Env }>;

const pages = new Hono<{ Bindings: Env }>();

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

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

function htmlPage(c: PageContext, body: string) {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    c.header(key, value);
  }
  return c.html(body);
}

pages.get('/', (c) => {
  const html = layout(
    'Create poll',
    `<div class="wrap">
  <header>
    <h1>Meetgrid</h1>
    <p>Pick individual times — share a link, collect Yes/No.</p>
  </header>

  <div id="alert" class="alert error hidden"></div>

  <form id="create-form">
    <label for="title">Poll title</label>
    <input type="text" id="title" name="title" required placeholder="Team sync">

    <label for="notes">Notes <span class="link-muted">(optional)</span></label>
    <textarea id="notes" name="notes" placeholder="Any context for respondents"></textarea>

    <label for="custom_slug">Custom link <span class="link-muted">(optional)</span></label>
    <input type="text" id="custom_slug" name="custom_slug" placeholder="team-sync" autocomplete="off" spellcheck="false">
    <p class="link-muted slug-preview" id="slug-preview">Leave blank for a random link like …/p/xK9mP2nQ4vLr</p>

    <label for="timezone">Timezone</label>
    <select id="timezone" name="timezone"></select>

    <div class="section-title">Proposed times</div>
    <p class="link-muted" style="margin:0 0 0.5rem">Add each option — date, start time, and length.</p>
    <ul class="slot-builder-list" id="slot-list"></ul>
    <button type="button" class="btn-link" id="add-slot">+ Add another time</button>

    <details class="advanced">
      <summary>Advanced: generate from date range</summary>
      <div class="row">
        <div>
          <label for="start_date">Start date</label>
          <input type="date" id="start_date" name="start_date">
        </div>
        <div>
          <label for="end_date">End date</label>
          <input type="date" id="end_date" name="end_date">
        </div>
      </div>
      <div class="row">
        <div>
          <label for="daily_start">Daily window start</label>
          <input type="time" id="daily_start" name="daily_start" value="09:00">
        </div>
        <div>
          <label for="daily_end">Daily window end</label>
          <input type="time" id="daily_end" name="daily_end" value="17:00">
        </div>
      </div>
      <label for="gen_duration">Slot duration (minutes)</label>
      <input type="number" id="gen_duration" value="30" min="15" max="480" step="15">
      <fieldset>
        <legend>Weekdays</legend>
        <div class="weekdays" id="weekdays">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
            .map(
              (d, i) =>
                `<label><input type="checkbox" name="weekday" value="${i + 1}" checked> ${d}</label>`
            )
            .join('')}
        </div>
      </fieldset>
      <button type="button" class="secondary" id="gen-add" style="width:100%">Add generated times to list</button>
    </details>

    <button type="submit" class="primary" id="submit-btn" style="margin-top:0.75rem">Create poll</button>
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

let slotCounter = 0;
const manualSlots = [];

function defaultSlot() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return { uid: 's' + (++slotCounter), date: fmt(d), start_time: '10:00', duration_minutes: 30 };
}

function formatSlotSummary(slot) {
  const [y, m, d] = slot.date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const datePart = dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const [hh, mm] = slot.start_time.split(':');
  const hour = Number(hh);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return datePart + ' · ' + h12 + ':' + mm + ' ' + ampm + ' · ' + slot.duration_minutes + ' min';
}

function renderSlotList() {
  const ul = document.getElementById('slot-list');
  if (!manualSlots.length) {
    ul.innerHTML = '<li class="link-muted" style="padding:0.5rem 0">No times yet — add one below.</li>';
    return;
  }
  ul.innerHTML = manualSlots.map((slot, idx) =>
    '<li class="slot-builder-item" data-uid="' + slot.uid + '">' +
      '<p class="slot-builder-label">' + (idx + 1) + '. ' + formatSlotSummary(slot) + '</p>' +
      '<div><label>Date</label><input type="date" data-field="date" value="' + slot.date + '" required></div>' +
      '<div><label>Start</label><input type="time" data-field="start_time" value="' + slot.start_time + '" required></div>' +
      '<div><label>Min</label><input type="number" data-field="duration_minutes" value="' + slot.duration_minutes + '" min="15" max="480" step="15" required></div>' +
      '<div class="slot-builder-actions">' +
        '<button type="button" class="btn-icon secondary" data-action="up" title="Move up"' + (idx === 0 ? ' disabled' : '') + '↑</button>' +
        '<button type="button" class="btn-icon secondary" data-action="down" title="Move down"' + (idx === manualSlots.length - 1 ? ' disabled' : '') + '↓</button>' +
        '<button type="button" class="btn-icon secondary" data-action="remove" title="Remove">×</button>' +
      '</div>' +
    '</li>'
  ).join('');

  ul.querySelectorAll('.slot-builder-item').forEach(li => {
    const uid = li.dataset.uid;
    li.querySelectorAll('input[data-field]').forEach(input => {
      input.addEventListener('change', () => {
        const slot = manualSlots.find(s => s.uid === uid);
        if (!slot) return;
        if (input.dataset.field === 'duration_minutes') slot.duration_minutes = Number(input.value);
        else slot[input.dataset.field] = input.value;
        li.querySelector('.slot-builder-label').textContent =
          (manualSlots.findIndex(s => s.uid === uid) + 1) + '. ' + formatSlotSummary(slot);
      });
    });
    li.querySelector('[data-action="remove"]').addEventListener('click', () => {
      const i = manualSlots.findIndex(s => s.uid === uid);
      if (i >= 0) manualSlots.splice(i, 1);
      renderSlotList();
    });
    li.querySelector('[data-action="up"]').addEventListener('click', () => {
      const i = manualSlots.findIndex(s => s.uid === uid);
      if (i > 0) { const tmp = manualSlots[i-1]; manualSlots[i-1] = manualSlots[i]; manualSlots[i] = tmp; renderSlotList(); }
    });
    li.querySelector('[data-action="down"]').addEventListener('click', () => {
      const i = manualSlots.findIndex(s => s.uid === uid);
      if (i >= 0 && i < manualSlots.length - 1) { const tmp = manualSlots[i+1]; manualSlots[i+1] = manualSlots[i]; manualSlots[i] = tmp; renderSlotList(); }
    });
  });
}

function showError(msg) {
  const el = document.getElementById('alert');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function updateSlugPreview() {
  const raw = document.getElementById('custom_slug').value.trim().toLowerCase();
  const el = document.getElementById('slug-preview');
  if (!raw) {
    el.textContent = 'Leave blank for a random link like …/p/xK9mP2nQ4vLr';
    return;
  }
  el.textContent = location.origin + '/p/' + raw.replace(/[^a-z0-9-]/g, '');
}

document.getElementById('custom_slug').addEventListener('input', updateSlugPreview);

document.getElementById('add-slot').addEventListener('click', () => {
  manualSlots.push(defaultSlot());
  renderSlotList();
});

document.getElementById('gen-add').addEventListener('click', async () => {
  document.getElementById('alert').classList.add('hidden');
  const weekdays = [...document.querySelectorAll('input[name=weekday]:checked')].map(el => Number(el.value));
  const body = {
    timezone: document.getElementById('timezone').value,
    duration_minutes: Number(document.getElementById('gen_duration').value),
    start_date: document.getElementById('start_date').value,
    end_date: document.getElementById('end_date').value,
    daily_start: document.getElementById('daily_start').value,
    daily_end: document.getElementById('daily_end').value,
    weekdays: weekdays.length === 7 ? undefined : weekdays,
  };
  try {
    const res = await fetch('/api/slots/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to generate');
    for (const s of data.slots) {
      manualSlots.push({ uid: 's' + (++slotCounter), date: s.date, start_time: s.start_time, duration_minutes: s.duration_minutes });
    }
    renderSlotList();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('create-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  document.getElementById('alert').classList.add('hidden');

  if (!manualSlots.length) {
    showError('Add at least one proposed time.');
    return;
  }

  const btn = document.getElementById('submit-btn');
  btn.disabled = true;
  btn.textContent = 'Creating…';

  const customSlug = document.getElementById('custom_slug').value.trim();
  const body = {
    title: document.getElementById('title').value,
    notes: document.getElementById('notes').value || undefined,
    slug: customSlug || undefined,
    timezone: document.getElementById('timezone').value,
    slots: manualSlots.map(s => ({ date: s.date, start_time: s.start_time, duration_minutes: s.duration_minutes })),
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

manualSlots.push(defaultSlot());
renderSlotList();
</script>`
  );
  return htmlPage(c, html);
});

pages.get('/p/:id', (c) => {
  const pollId = parsePollId(c.req.param('id'));
  if (!pollId) return c.text('Not found', 404);
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
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + maxAge + '; SameSite=Lax' + secure;
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

async function submitResponse(allowDuplicateName) {
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
    allow_duplicate_name: allowDuplicateName || undefined,
  };

  try {
    const res = await fetch('/api/polls/' + POLL_ID + '/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === 'duplicate_name') {
        showDuplicateName(data.error);
        btn.disabled = false;
        return;
      }
      throw new Error(data.error || 'Failed to submit');
    }

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
}

function showDuplicateName(message) {
  const el = document.getElementById('alert');
  el.textContent = '';
  const p = document.createElement('p');
  p.className = 'alert-text';
  p.textContent = message;
  const again = document.createElement('button');
  again.type = 'button';
  again.className = 'secondary';
  again.textContent = 'Add me anyway as a separate person';
  again.addEventListener('click', () => {
    el.classList.add('hidden');
    submitResponse(true);
  });
  el.appendChild(p);
  el.appendChild(again);
  el.classList.remove('hidden');
}

document.getElementById('respond-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitResponse(false);
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
  params.delete('edit');
  const qs = params.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}

loadPoll().catch(err => showError(err.message));
</script>`
  );
  return htmlPage(c, html);
});

pages.get('/p/:id/results', (c) => {
  const pollId = parsePollId(c.req.param('id'));
  if (!pollId) return c.text('Not found', 404);
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
  <div class="table-scroll" id="heatmap-wrap"></div>

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
const urlParams = new URLSearchParams(location.search);
const urlSecret = urlParams.get('secret');
let organizerSecret = urlSecret || localStorage.getItem('meetgrid_secret_' + POLL_ID);
if (urlSecret) {
  localStorage.setItem('meetgrid_secret_' + POLL_ID, urlSecret);
  urlParams.delete('secret');
  const qs = urlParams.toString();
  history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
}
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

// Column headers keep the date: several slots share a time of day, and a bare
// "6:00 PM – 8:00 PM" repeated across a week names no column at all.
function slotHeader(label) {
  const parts = String(label).split(' \u00b7 ');
  if (parts.length < 2) return '<span class="col-when">' + escapeHtml(label) + '</span>';
  return '<span class="col-date">' + escapeHtml(parts[0]) + '</span>' +
    '<span class="col-time">' + escapeHtml(parts.slice(1).join(' \u00b7 ')) + '</span>';
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
  ranked.innerHTML = poll.ranked_slot_ids.map((id, i) => {
    const s = slotMap[id];
    const chosen = poll.chosen_slot_id === id ? ' chosen' : '';
    const lead = i === 0 && !poll.chosen_slot_id && s.yes_count > 0 ? ' leader' : '';
    return '<li class="rank-item' + chosen + lead + '">' +
      '<span class="rank-when">' + escapeHtml(s.label) + '</span>' +
      '<span class="tally">' +
        '<span class="tally-yes">' + s.yes_count + ' yes</span>' +
        (s.no_count ? '<span class="tally-no">' + s.no_count + ' no</span>' : '') +
      '</span></li>';
  }).join('');

  let table = '<table class="results-table"><thead><tr><th>Person</th>';
  poll.slots.forEach(s => { table += '<th>' + slotHeader(s.label) + '</th>'; });
  table += '</tr></thead><tbody>';
  poll.responses.forEach(r => {
    table += '<tr><td>' + escapeHtml(r.name) + '</td>';
    poll.slots.forEach(s => {
      const v = r.votes[s.id];
      const cell = v === true
        ? '<span class="mark-yes">\u2713</span>'
        : v === false ? '<span class="mark-no">\u2717</span>' : '<span class="mark-none">\u2013</span>';
      table += '<td>' + cell + '</td>';
    });
    table += '</tr>';
  });
  table += '<tr class="totals"><td><strong>Yes total</strong></td>';
  poll.slots.forEach(s => {
    table += '<td class="' + heatClass(s.yes_count, maxYes) + '"><strong>' + s.yes_count + '</strong>' +
      (s.no_count ? '<span class="cell-no">' + s.no_count + ' no</span>' : '') + '</td>';
  });
  table += '</tr></tbody></table>';
  document.getElementById('heatmap-wrap').innerHTML = table;

  if (organizerSecret) {
    document.getElementById('organizer-panel').classList.remove('hidden');
    document.getElementById('organizer-actions').classList.remove('hidden');
    const sel = document.getElementById('chosen-slot');
    // Offer slots best-first, so the default selection is the slot the poll
    // actually favours rather than whichever one happens to be earliest.
    sel.innerHTML = poll.ranked_slot_ids.map((id, i) => {
      const s = slotMap[id];
      const selected = poll.chosen_slot_id ? poll.chosen_slot_id === s.id : i === 0;
      return '<option value="' + s.id + '"' + (selected ? ' selected' : '') + '>' +
        escapeHtml(s.label) + ' — ' + s.yes_count + ' yes' + (s.no_count ? ', ' + s.no_count + ' no' : '') +
        '</option>';
    }).join('');
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
  return htmlPage(c, html);
});

export default pages;
