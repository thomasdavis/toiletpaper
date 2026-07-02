const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function validDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatUtcDate(value: string | Date) {
  const date = validDate(value);
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export function formatUtcDateTime(value: string | Date) {
  const date = validDate(value);
  if (!date) return "";
  return `${date.toISOString().slice(0, 19).replace("T", " ")} UTC`;
}

export function formatUtcMonthDay(value: string | Date) {
  const date = validDate(value);
  if (!date) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}
