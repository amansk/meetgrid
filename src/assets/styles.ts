export default `
*, *::before, *::after { box-sizing: border-box; }

:root {
  --bg: #f7f7f5;
  --surface: #fff;
  --surface-sunk: #fafaf9;
  --text: #17181b;
  --muted: #6b7280;
  --faint: #9ca3af;
  --border: #e4e4e1;
  --border-strong: #d1d1cc;
  --accent: #2f5fe0;
  --accent-hover: #2449b8;
  --accent-soft: #eef2fe;
  --yes: #15803d;
  --no: #b91c1c;
  --yes-bg: #e8f6ec;
  --no-bg: #fdeceb;
  --heat-0: #f2f2ef;
  --heat-1: #e2eafc;
  --heat-2: #bcd0f7;
  --heat-3: #7fa5ee;
  --heat-4: #2f5fe0;
  --radius: 8px;
  --radius-sm: 6px;
  --shadow: 0 1px 2px rgba(23, 24, 27, 0.05), 0 1px 3px rgba(23, 24, 27, 0.04);
  --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace;
}

html { font-size: 16px; -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  line-height: 1.55;
  min-height: 100dvh;
  -webkit-font-smoothing: antialiased;
}

.wrap {
  max-width: 42rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

@media (max-width: 480px) {
  .wrap { padding: 1.25rem 1rem 3rem; }
}

header {
  margin-bottom: 1.75rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

header h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 650;
  letter-spacing: -0.021em;
  line-height: 1.25;
}

header p {
  margin: 0.375rem 0 0;
  font-size: 0.9375rem;
  color: var(--muted);
}

/* ---------- forms ---------- */

label {
  display: block;
  font-size: 0.8125rem;
  font-weight: 550;
  margin-bottom: 0.375rem;
  color: var(--text);
}

input[type="text"],
input[type="date"],
input[type="time"],
input[type="number"],
select,
textarea {
  width: 100%;
  padding: 0.5625rem 0.75rem;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 0.9375rem;
  color: var(--text);
  background: var(--surface);
  margin-bottom: 1rem;
  transition: border-color 0.12s ease, box-shadow 0.12s ease;
}

input:hover, select:hover, textarea:hover { border-color: var(--faint); }

input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

input::placeholder, textarea::placeholder { color: var(--faint); }

textarea { min-height: 4.5rem; resize: vertical; }

.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.875rem;
}

@media (max-width: 480px) {
  .row { grid-template-columns: 1fr; gap: 0; }
}

fieldset {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.875rem 1rem 1rem;
  margin: 0 0 1rem;
  background: var(--surface);
}

fieldset legend {
  font-size: 0.8125rem;
  font-weight: 550;
  padding: 0 0.375rem;
  color: var(--muted);
}

.weekdays { display: flex; flex-wrap: wrap; gap: 0.625rem; }

.weekdays label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-weight: 400;
  font-size: 0.875rem;
  margin: 0;
  padding: 0.3125rem 0.625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-sunk);
  cursor: pointer;
  user-select: none;
}

.weekdays label:hover { border-color: var(--border-strong); }
.weekdays input { accent-color: var(--accent); margin: 0; }

/* ---------- buttons ---------- */

button, .btn {
  display: inline-block;
  padding: 0.625rem 1.125rem;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 550;
  cursor: pointer;
  text-decoration: none;
  text-align: center;
  transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
}

button:focus-visible, .btn:focus-visible, summary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

button.primary, .btn.primary {
  background: var(--accent);
  color: #fff;
  width: 100%;
  padding-block: 0.6875rem;
}

button.primary:hover, .btn.primary:hover { background: var(--accent-hover); }

button.secondary, .btn.secondary {
  background: var(--surface);
  border-color: var(--border-strong);
  color: var(--text);
}

button.secondary:hover, .btn.secondary:hover {
  background: var(--surface-sunk);
  border-color: var(--faint);
}

button:disabled { opacity: 0.5; cursor: not-allowed; }

/* ---------- alerts ---------- */

.alert {
  padding: 0.75rem 0.875rem;
  border-radius: var(--radius-sm);
  margin-bottom: 1rem;
  font-size: 0.9375rem;
  border: 1px solid transparent;
}

.alert.error { background: var(--no-bg); border-color: #f5c9c6; color: #8f1d1a; }
.alert.success { background: var(--yes-bg); border-color: #bfe3ca; color: #145c30; }
.alert.info { background: var(--accent-soft); border-color: #cfdbfa; color: #23408f; }
.alert .alert-text { margin: 0 0 0.625rem; }
.alert button { padding: 0.375rem 0.75rem; font-size: 0.875rem; }

.hidden { display: none !important; }

/* ---------- respond: vote list ---------- */

.slot-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.slot-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.6875rem 0.875rem;
  border-bottom: 1px solid var(--border);
}

.slot-item:last-child { border-bottom: none; }
.slot-item:hover { background: var(--surface-sunk); }

.slot-label {
  flex: 1;
  font-size: 0.9375rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
}

.vote-btns { display: flex; gap: 0.375rem; flex-shrink: 0; }

.vote-btns button {
  padding: 0.375rem 0.875rem;
  font-size: 0.875rem;
  font-weight: 550;
  min-width: 3.25rem;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--muted);
}

.vote-btns button:hover { border-color: var(--faint); color: var(--text); }

.vote-btns button.selected-yes {
  background: var(--yes-bg);
  border-color: var(--yes);
  color: var(--yes);
}

.vote-btns button.selected-no {
  background: var(--no-bg);
  border-color: var(--no);
  color: var(--no);
}

@media (max-width: 380px) {
  .slot-item { flex-wrap: wrap; }
  .vote-btns { width: 100%; }
  .vote-btns button { flex: 1; }
}

/* ---------- results: ranked list ---------- */

.rank-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.rank-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  border-bottom: 1px solid var(--border);
  border-left: 3px solid transparent;
  font-size: 0.9375rem;
}

.rank-item:last-child { border-bottom: none; }

.rank-when { font-variant-numeric: tabular-nums; line-height: 1.35; }

.rank-item.leader { border-left-color: var(--accent); background: var(--accent-soft); }
.rank-item.chosen { border-left-color: var(--yes); background: var(--yes-bg); }

.tally {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.tally-yes { font-weight: 600; color: var(--yes); }
.tally-no { font-size: 0.8125rem; color: var(--no); }

/* ---------- results: heatmap ---------- */

.table-scroll {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow-x: auto;
  box-shadow: var(--shadow);
  margin-bottom: 1.5rem;
}

.results-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 0.875rem;
}

.results-table th,
.results-table td {
  border-bottom: 1px solid var(--border);
  border-right: 1px solid var(--border);
  padding: 0.5rem 0.625rem;
  text-align: center;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.results-table tr:last-child th,
.results-table tr:last-child td { border-bottom: none; }
.results-table th:last-child,
.results-table td:last-child { border-right: none; }

.results-table thead th {
  background: var(--surface-sunk);
  font-weight: 550;
  font-size: 0.75rem;
  vertical-align: bottom;
  color: var(--muted);
}

.results-table th .col-date,
.results-table th .col-time { display: block; }

.col-date { color: var(--text); font-weight: 600; }
.col-time { font-weight: 450; }

.results-table th:first-child,
.results-table td:first-child {
  text-align: left;
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 2;
  font-weight: 500;
  border-right: 1px solid var(--border-strong);
}

.results-table thead th:first-child { background: var(--surface-sunk); z-index: 3; }

.mark-yes { color: var(--yes); font-weight: 600; }
.mark-no { color: var(--no); }
.mark-none { color: var(--faint); }

.results-table tr.totals td { background: var(--surface-sunk); }
.results-table tr.totals td:first-child { background: var(--surface); }

.cell-no {
  display: block;
  font-size: 0.6875rem;
  font-weight: 450;
  color: var(--no);
  opacity: 0.85;
}

.heat-0 { background: var(--heat-0) !important; }
.heat-1 { background: var(--heat-1) !important; }
.heat-2 { background: var(--heat-2) !important; }
.heat-3 { background: var(--heat-3) !important; color: #fff; }
.heat-4 { background: var(--heat-4) !important; color: #fff; }
.heat-3 .cell-no, .heat-4 .cell-no { color: #fff; opacity: 0.75; }

/* ---------- viewer timezone + calendar ---------- */

.tz-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  margin-bottom: 1.25rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-sunk);
  font-size: 0.875rem;
}

.tz-bar label {
  margin: 0;
  font-weight: 550;
  color: var(--muted);
  white-space: nowrap;
}

.tz-bar select {
  width: auto;
  min-width: 12rem;
  max-width: 100%;
  flex: 1 1 12rem;
  margin: 0;
  font-size: 0.875rem;
  padding: 0.375rem 0.625rem;
}

.tz-poll-note {
  flex: 1 1 100%;
  margin: 0;
}

.calendar-panel {
  margin-bottom: 1.25rem;
  padding: 0.875rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: var(--shadow);
}

#organizer-panel .calendar-panel {
  margin-top: 1rem;
  margin-bottom: 0;
  border-color: var(--accent);
}

.calendar-panel .section-title { margin-top: 0; }

.chosen-slot-when {
  margin: 0 0 0.75rem;
  font-size: 1rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.calendar-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.calendar-actions .btn,
.calendar-actions button { width: auto; margin: 0; }

/* ---------- misc ---------- */

.badge {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 550;
  padding: 0.1875rem 0.5rem;
  border-radius: 999px;
  background: #ececea;
  color: var(--muted);
  vertical-align: middle;
}

.badge.closed { background: #fdf0d5; color: #8a5a08; }
.badge.chosen { background: var(--yes-bg); color: var(--yes); }

.copy-row { display: flex; gap: 0.5rem; margin-bottom: 0.625rem; }

.copy-row input {
  margin: 0;
  flex: 1;
  font-family: var(--mono);
  font-size: 0.8125rem;
  background: var(--surface-sunk);
}

.copy-row button { width: auto; white-space: nowrap; }

.section-title {
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin: 1.75rem 0 0.625rem;
}

.actions { display: flex; flex-direction: column; gap: 0.625rem; margin-top: 1.25rem; }

.link-muted {
  color: var(--muted);
  font-size: 0.8125rem;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

a { color: var(--accent); text-underline-offset: 2px; }
a:hover { color: var(--accent-hover); }

/* ---------- create: slot builder ---------- */

.slot-builder-list {
  list-style: none;
  padding: 0;
  margin: 0 0 0.875rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.slot-builder-item {
  display: grid;
  grid-template-columns: 1fr 1fr 5.25rem auto;
  gap: 0.625rem;
  align-items: end;
  padding: 0.75rem 0.875rem 0.875rem;
  border-bottom: 1px solid var(--border);
}

.slot-builder-item:last-child { border-bottom: none; }

@media (max-width: 520px) {
  .slot-builder-item { grid-template-columns: 1fr 1fr; }
  .slot-builder-actions { grid-column: 1 / -1; justify-content: flex-end; }
}

.slot-builder-item input { margin-bottom: 0; }

.slot-builder-label {
  grid-column: 1 / -1;
  font-size: 0.875rem;
  font-weight: 550;
  color: var(--text);
  font-variant-numeric: tabular-nums;
  margin: 0 0 0.125rem;
}

.slot-builder-actions { display: flex; gap: 0.25rem; align-items: center; }

.btn-icon {
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1;
  width: auto;
  min-width: 2.125rem;
  color: var(--muted);
  background: var(--surface);
  border: 1px solid var(--border-strong);
}

.btn-icon:hover { background: var(--surface-sunk); color: var(--text); }

.btn-link {
  background: none;
  border: none;
  color: var(--accent);
  padding: 0.25rem 0;
  width: auto;
  font-size: 0.9375rem;
  font-weight: 550;
  text-align: left;
}

.btn-link:hover { color: var(--accent-hover); }

details.advanced {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem 0.875rem;
  margin-bottom: 1.25rem;
  background: var(--surface);
}

details.advanced summary {
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 550;
  color: var(--muted);
}

details.advanced summary:hover { color: var(--text); }
details.advanced[open] summary { margin-bottom: 1rem; }
`;
