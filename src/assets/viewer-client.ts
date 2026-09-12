/** Shared inline script for Respond + Results: viewer TZ + calendar helpers. */
import {
  buildIcs,
  googleCalendarUrl,
  icsFilenameStem,
  utcToIcsDate,
  escapeIcs,
} from '../lib/calendar';

// Injected into the page so calendar logic stays single-sourced with src/lib/calendar.ts.
const calendarSource = [utcToIcsDate, escapeIcs, googleCalendarUrl, buildIcs, icsFilenameStem]
  .map((fn) => fn.toString())
  .join('\n\n');

export default `
(function () {
  ${calendarSource}

  const TIMEZONES = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['America/Los_Angeles','America/New_York','America/Chicago','Europe/London','Europe/Paris','Asia/Tokyo','UTC'];

  function isValidViewerTimezone(tz) {
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
      return true;
    } catch (_) {
      return false;
    }
  }

  function detectViewerTimezone() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      return isValidViewerTimezone(tz) ? tz : 'UTC';
    } catch (_) {
      return 'UTC';
    }
  }

  function formatTzName(tz) {
    return String(tz).replace(/_/g, ' ');
  }

  function getViewerTimezone(pollId) {
    const perPoll = localStorage.getItem('meetgrid_viewer_tz_' + pollId);
    if (perPoll) {
      if (isValidViewerTimezone(perPoll)) return perPoll;
      localStorage.removeItem('meetgrid_viewer_tz_' + pollId);
    }
    const global = localStorage.getItem('meetgrid_viewer_tz');
    if (global) {
      if (isValidViewerTimezone(global)) return global;
      localStorage.removeItem('meetgrid_viewer_tz');
    }
    return detectViewerTimezone();
  }

  function setViewerTimezone(pollId, tz, persistGlobal) {
    if (!isValidViewerTimezone(tz)) return;
    localStorage.setItem('meetgrid_viewer_tz_' + pollId, tz);
    if (persistGlobal) localStorage.setItem('meetgrid_viewer_tz', tz);
  }

  function formatSlotLabelInZone(startUtc, endUtc, timeZone) {
    const start = new Date(startUtc);
    const end = new Date(endUtc);
    const dateFmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timeFmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return dateFmt.format(start) + ' · ' + timeFmt.format(start) + ' – ' + timeFmt.format(end);
  }

  function relabelSlots(slots, viewerTz) {
    return slots.map(function (s) {
      return Object.assign({}, s, {
        label: formatSlotLabelInZone(s.start_utc, s.end_utc, viewerTz),
      });
    });
  }

  function calendarEventMeta(poll, slot) {
    const pollUrl = location.origin + '/p/' + poll.id;
    const lines = [];
    if (poll.notes) lines.push(poll.notes);
    lines.push('Poll: ' + pollUrl);
    return {
      title: poll.title,
      startUtc: slot.start_utc,
      endUtc: slot.end_utc,
      details: lines.join('\\n\\n'),
      pollUrl,
    };
  }

  function downloadIcs(ics, filename) {
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function mountTimezoneBar(pollId, pollTimezone, onChange) {
    const bar = document.getElementById('viewer-tz-bar');
    const select = document.getElementById('viewer-tz');
    const note = document.getElementById('poll-tz-note');
    if (!bar || !select) return getViewerTimezone(pollId);

    let viewerTz = getViewerTimezone(pollId);
    if (!isValidViewerTimezone(viewerTz)) viewerTz = detectViewerTimezone();
    TIMEZONES.sort().forEach(function (tz) {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = formatTzName(tz);
      if (tz === viewerTz) opt.selected = true;
      select.appendChild(opt);
    });

    function syncNote() {
      if (!note) return;
      if (viewerTz !== pollTimezone) {
        note.textContent = 'Poll timezone: ' + formatTzName(pollTimezone);
        note.hidden = false;
      } else {
        note.hidden = true;
      }
    }

    syncNote();
    select.addEventListener('change', function () {
      viewerTz = select.value;
      setViewerTimezone(pollId, viewerTz, false);
      syncNote();
      onChange(viewerTz);
    });

    return viewerTz;
  }

  function renderCalendarActions(container, poll, slot) {
    if (!container || !slot) return;
    container.replaceChildren();
    const meta = calendarEventMeta(poll, slot);
    const gcalHref = googleCalendarUrl(meta);
    const ics = buildIcs({
      title: meta.title,
      startUtc: meta.startUtc,
      endUtc: meta.endUtc,
      description: meta.details,
      url: meta.pollUrl,
      uid: 'meetgrid-' + poll.id + '-' + slot.id + '@meetgrid.app',
    });
    const safeName = icsFilenameStem(poll.title);

    const wrap = document.createElement('div');
    wrap.className = 'calendar-actions';
    const gcal = document.createElement('a');
    gcal.className = 'btn primary';
    gcal.href = gcalHref;
    gcal.target = '_blank';
    gcal.rel = 'noopener';
    gcal.textContent = 'Google Calendar';
    const icsBtn = document.createElement('button');
    icsBtn.type = 'button';
    icsBtn.className = 'secondary ics-btn';
    icsBtn.textContent = 'Download .ics';
    icsBtn.addEventListener('click', function () {
      downloadIcs(ics, safeName + '.ics');
    });
    wrap.appendChild(gcal);
    wrap.appendChild(icsBtn);
    container.appendChild(wrap);
  }

  window.MeetgridViewer = {
    TIMEZONES,
    detectViewerTimezone,
    formatTzName,
    getViewerTimezone,
    setViewerTimezone,
    formatSlotLabelInZone,
    relabelSlots,
    googleCalendarUrl,
    buildIcs,
    downloadIcs,
    calendarEventMeta,
    mountTimezoneBar,
    renderCalendarActions,
  };
})();
`;
