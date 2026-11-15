const limaDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
});

export function worklogToday(now = new Date()) {
  return limaDay.format(now);
}

const dateLabel = new Intl.DateTimeFormat("es-PE", {
  timeZone: "UTC", day: "numeric", month: "long", year: "numeric",
});

export function worklogDateLabel(day: string) {
  const instant = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(instant.getTime()) ? dateLabel.format(instant) : day;
}
