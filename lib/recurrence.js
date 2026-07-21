export function normalizeDays(days) {
  if (!Array.isArray(days)) return [];
  return [...new Set(days.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatLocalDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function getNextRecurrenceDate(dateTime, rule) {
  const current = new Date(dateTime);
  if (Number.isNaN(current.getTime())) return null;

  if (rule.recurrence === 'daily') return formatLocalDateTime(addDays(current, 1));

  if (rule.recurrence === 'weekly' || rule.recurrence === 'biweekly') {
    const selectedDays = normalizeDays(rule.weeklyDays);
    const currentWeekday = current.getDay();
    const laterDay = selectedDays.find((day) => day > currentWeekday);
    if (laterDay !== undefined) return formatLocalDateTime(addDays(current, laterDay - currentWeekday));

    const weeks = rule.recurrence === 'biweekly' ? 2 : 1;
    if (selectedDays.length === 0) return formatLocalDateTime(addDays(current, weeks * 7));
    const offset = (selectedDays[0] - currentWeekday + 7) % 7;
    const days = offset === 0 ? weeks * 7 : offset + (weeks - 1) * 7;
    return formatLocalDateTime(addDays(current, days));
  }

  if (rule.recurrence === 'monthly') {
    const requestedDay = Number(rule.monthlyDay) || current.getDate();
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const next = new Date(current);
    next.setFullYear(year, month, Math.min(requestedDay, daysInMonth));
    return formatLocalDateTime(next);
  }

  return null;
}

// A recurrence is triggered when the currently materialized operation starts.
// At that moment this returns the future operations that must be materialized.
export function getDueOccurrenceDates(nextRun, rule, now = new Date()) {
  const dates = [];
  let trigger = nextRun;
  const delayHours = Number.isFinite(Number(rule.creationDelayHours)) ? Number(rule.creationDelayHours) : 6;
  while (trigger && new Date(trigger).getTime() + delayHours * 60 * 60 * 1000 <= now.getTime()) {
    const occurrence = getNextRecurrenceDate(trigger, rule);
    if (!occurrence) return { dates, nextRun: null };
    if (rule.repeatUntil && new Date(rule.repeatUntil) < new Date(occurrence)) {
      return { dates, nextRun: null };
    }
    dates.push(occurrence);
    trigger = occurrence;
  }
  return { dates, nextRun: trigger };
}

export function buildRecurringOperation(recurrence, occurrence, { id = null, createdAt = new Date().toISOString() } = {}) {
  const [date, time] = occurrence.split('T');
  return {
    id,
    name: recurrence.name,
    templateId: recurrence.templateId,
    date,
    time: time.slice(0, 5),
    createdAt,
    recurrenceId: recurrence.id,
    absentUserIds: [...(recurrence.absentUserIds || recurrence.rule?.absentUserIds || [])],
    serverName: recurrence.serverName || '',
    modlist: recurrence.modlist || '',
    modlistPlayer: recurrence.modlistPlayer || '',
    modlistServer: recurrence.modlistServer || '',
    tsAddress: recurrence.tsAddress || '',
    campaignId: recurrence.campaignId ?? null,
    squads: structuredClone(recurrence.squads || [])
  };
}
