/** Shared inline script for Respond + Results: viewer TZ + calendar helpers. */
export default `
(function () {
  const TIMEZONES = typeof Intl.supportedValuesOf === 'function'
    ? Intl.supportedValuesOf('timeZone')
    : ['America/Los_Angeles','America/New_York','America/Chicago','Europe/London','Europe/Paris','Asia/Tokyo','UTC'];

  function detectViewerTimezone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch (_) {
      return 'UTC';
    }
  }

  function formatTzName(tz) {
    return String(tz).replace(/_/g, ' ');
  }

  function getViewerTimezone(pollId) {
    const perPoll = localStorage.getItem('meetgrid_viewer_tz_' + pollId);
    if (perPoll) return perPoll;
    const global = localStorage.getItem('meetgrid_viewer_tz');
    if (global) return global;
    return detectViewerTimezone();
  }

  function setViewerTimezone(pollId, tz, persistGlobal) {
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

  function utcToIcsDate(iso) {
    return String(iso).replace(/[-:]/g, '').replace(/\\.\\d{3}/, '');
  }

  function escapeIcs(text) {
    return String(text)
      .replace(/\\\\/g, '\\\\\\\\')
      .replace(/;/g, '\\\\;')
      .replace(/,/g, '\\\\,')
      .replace(/\\n/g, '\\\\n');
  }

  function googleCalendarUrl(opts) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: opts.title,
      dates: utcToIcsDate(opts.startUtc) + '/' + utcToIcsDate(opts.endUtc),
      details: opts.details || '',
      ctz: opts.ctz || 'UTC',
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  function buildIcs(opts) {
    const uid = opts.uid || ('meetgrid-' + opts.startUtc + '@meetgrid.app');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Meetgrid//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      'UID:' + uid,
      'DTSTAMP:' + utcToIcsDate(new Date().toISOString()),
      'DTSTART:' + utcToIcsDate(opts.startUtc),
      'DTEND:' + utcToIcsDate(opts.endUtc),
      'SUMMARY:' + escapeIcs(opts.title),
      opts.description ? 'DESCRIPTION:' + escapeIcs(opts.description) : null,
      opts.url ? 'URL:' + opts.url : null,
      'END:VEVENT',
      'END:VCALENDAR',
    ].filter(Boolean).join('\\r\\n');
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
      ctz: poll.timezone,
      pollUrl,
    };
  }

  function mountTimezoneBar(pollId, pollTimezone, onChange) {
    const bar = document.getElementById('viewer-tz-bar');
    const select = document.getElementById('viewer-tz');
    const note = document.getElementById('poll-tz-note');
    if (!bar || !select) return getViewerTimezone(pollId);

    let viewerTz = getViewerTimezone(pollId);
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

  function renderCalendarActions(container, poll, slot, compact) {
    if (!container || !slot) return;
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
    const safeName = String(poll.title).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'event';

    if (compact) {
      container.innerHTML =
        '<a class="cal-link" href="' + gcalHref + '" target="_blank" rel="noopener">GCal</a>' +
        '<button type="button" class="cal-link ics-btn">.ics</button>';
      container.querySelector('.ics-btn').addEventListener('click', function () {
        downloadIcs(ics, safeName + '.ics');
      });
      return;
    }

    container.innerHTML =
      '<div class="calendar-actions">' +
        '<a class="btn primary" href="' + gcalHref + '" target="_blank" rel="noopener">Google Calendar</a>' +
        '<button type="button" class="secondary ics-btn">Download .ics</button>' +
      '</div>';
    container.querySelector('.ics-btn').addEventListener('click', function () {
      downloadIcs(ics, safeName + '.ics');
    });
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
