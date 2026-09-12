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

  const COMMON_ZONES = [
    'America/Los_Angeles',
    'America/Denver',
    'America/Chicago',
    'America/New_York',
    'Europe/London',
    'Europe/Paris',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Singapore',
    'Asia/Tokyo',
    'Australia/Sydney',
    'Pacific/Auckland',
    'UTC',
  ];

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

  // "America/Los_Angeles" reads as machinery and "Pacific Daylight Time" puts a
  // season on a poll that may straddle a clock change, so show "Pacific Time".
  // Falls back to the city when a zone has no descriptive name (Intl gives those
  // a bare GMT offset).
  function formatTzName(tz) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'long' })
        .formatToParts(new Date());
      const found = parts.filter(function (p) { return p.type === 'timeZoneName'; })[0];
      const name = found ? found.value : '';
      if (!name || /^GMT/.test(name)) {
        return String(tz).split('/').pop().replace(/_/g, ' ') + ' time';
      }
      return name.replace(/(Standard|Daylight|Summer) /g, '');
    } catch (_) {
      return String(tz).replace(/_/g, ' ');
    }
  }

  // Several zones share a friendly name — three of them are "Central Time" — so
  // the picker keeps the IANA id alongside it.
  function zoneOptionLabel(tz) {
    const friendly = formatTzName(tz);
    const iana = String(tz).replace(/_/g, ' ');
    return friendly === iana ? friendly : friendly + ' \u2014 ' + iana;
  }

  /**
   * A zone this viewer picked for this poll, or the fallback zone — which callers pass
   * as the poll's own zone. Deliberately NOT the viewer's local zone: everyone
   * talking about the poll should be looking at the same times until they ask not
   * to. Returns null before the poll has loaded, and the server's labels are
   * already in the poll's zone, so nothing has to be guessed for the first paint.
   */
  function getViewerTimezone(pollId, fallbackTz) {
    const perPoll = localStorage.getItem('meetgrid_viewer_tz_' + pollId);
    if (perPoll) {
      if (isValidViewerTimezone(perPoll)) return perPoll;
      localStorage.removeItem('meetgrid_viewer_tz_' + pollId);
    }
    if (fallbackTz && isValidViewerTimezone(fallbackTz)) return fallbackTz;
    return fallbackTz === undefined ? null : detectViewerTimezone();
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
    if (!viewerTz) return slots;
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

    let viewerTz = getViewerTimezone(pollId, pollTimezone);
    if (!isValidViewerTimezone(viewerTz)) viewerTz = pollTimezone;
    // The full IANA list, alphabetical, but with the handful anyone is likely to
    // want in a group on top: the poll's zone, the viewer's own, then the common
    // ones. A native select gives type-ahead and a usable mobile picker for free,
    // so no search box of our own is needed.
    const seen = {};
    const common = [];
    [pollTimezone, viewerTz, detectViewerTimezone()].concat(COMMON_ZONES).forEach(function (tz) {
      if (tz && !seen[tz] && isValidViewerTimezone(tz)) {
        seen[tz] = true;
        common.push(tz);
      }
    });

    function addOption(parent, tz) {
      const opt = document.createElement('option');
      opt.value = tz;
      opt.textContent = zoneOptionLabel(tz);
      if (tz === viewerTz) opt.selected = true;
      parent.appendChild(opt);
    }

    const commonGroup = document.createElement('optgroup');
    commonGroup.label = 'Common';
    common.forEach(function (tz) { addOption(commonGroup, tz); });
    select.appendChild(commonGroup);

    const rest = TIMEZONES.slice().sort().filter(function (tz) { return !seen[tz]; });
    if (rest.length) {
      const allGroup = document.createElement('optgroup');
      allGroup.label = 'All time zones';
      rest.forEach(function (tz) { addOption(allGroup, tz); });
      select.appendChild(allGroup);
    }

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
    zoneOptionLabel,
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
