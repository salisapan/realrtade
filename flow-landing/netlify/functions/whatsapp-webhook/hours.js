// Human handoff window: Sunday–Thursday, 10:00–17:00 Asia/Jerusalem.
// The bot itself may reply at any hour. Outside this window a handoff
// tells the user we will return on the next business day.
const DEFAULT_TZ = 'Asia/Jerusalem';

function partsInZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => {
    const p = parts.find((x) => x.type === type);
    return p ? p.value : '';
  };
  return {
    weekday: get('weekday'),
    hour: Number(get('hour')),
    minute: Number(get('minute')),
  };
}

// 10:00 inclusive, 17:00 exclusive. Friday and Saturday are always outside.
function isHandoffHours(now, timeZone) {
  const tz = timeZone || DEFAULT_TZ;
  const { weekday, hour, minute } = partsInZone(now, tz);
  const workdays = { Sun: true, Mon: true, Tue: true, Wed: true, Thu: true };
  if (!workdays[weekday]) return false;
  const minutes = hour * 60 + minute;
  return minutes >= 10 * 60 && minutes < 17 * 60;
}

module.exports = { isHandoffHours, DEFAULT_TZ, partsInZone };
