export function taipeiDate(value = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function displayDate(localDate: string): string {
  const [year, month, day] = localDate.split("-");
  return `${year}/${month}/${day}`;
}

function parts(localDate: string): [number, number, number] {
  const [year, month, day] = localDate.split("-").map(Number);
  return [year, month, day];
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function comparableDay(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function birthdayDayFor(birthMonth: number, birthDay: number, targetYear: number): number {
  return comparableDay(targetYear, birthMonth, Math.min(birthDay, daysInMonth(targetYear, birthMonth)));
}

export function ageOnDate(birthDate: string, onDate = taipeiDate()): number | null {
  if (!birthDate || birthDate > onDate) return null;
  const [birthYear, birthMonth, birthDay] = parts(birthDate);
  const [year, month, day] = parts(onDate);
  const todayDay = comparableDay(year, month, day);
  const birthdayThisYear = birthdayDayFor(birthMonth, birthDay, year);
  return Math.max(year - birthYear - (todayDay < birthdayThisYear ? 1 : 0), 0);
}

export function daysUntilNextBirthday(birthDate: string, onDate = taipeiDate()): number | null {
  if (!birthDate || birthDate > onDate) return null;
  const [, birthMonth, birthDay] = parts(birthDate);
  const [year, month, day] = parts(onDate);
  const todayDay = comparableDay(year, month, day);
  let next = birthdayDayFor(birthMonth, birthDay, year);
  if (next < todayDay) next = birthdayDayFor(birthMonth, birthDay, year + 1);
  return Math.round(next - todayDay);
}

export function shiftMonths(localDate: string, months: number): string {
  const [year, month, day] = parts(localDate);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth() + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

export function shiftDays(localDate: string, days: number): string {
  const [year, month, day] = parts(localDate);
  const target = new Date(Date.UTC(year, month - 1, day + days));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, "0")}-${String(target.getUTCDate()).padStart(2, "0")}`;
}

export function localDateTimestamp(localDate: string): number {
  const [year, month, day] = parts(localDate);
  return Date.UTC(year, month - 1, day);
}

export interface BirthdayMonthTick {
  date: string;
  label: string;
  progress: number;
}

export interface BirthdayYearProgress {
  previousBirthday: string;
  nextBirthday: string;
  currentAge: number;
  nextAge: number;
  progress: number;
  monthTicks: BirthdayMonthTick[];
}

export function birthdayYearProgress(birthDate: string, onDate = taipeiDate()): BirthdayYearProgress | null {
  const currentAge = ageOnDate(birthDate, onDate);
  if (currentAge === null) return null;

  const previousBirthday = shiftMonths(birthDate, currentAge * 12);
  const nextBirthday = shiftMonths(birthDate, (currentAge + 1) * 12);
  const start = localDateTimestamp(previousBirthday);
  const end = localDateTimestamp(nextBirthday);
  const now = localDateTimestamp(onDate);
  const span = Math.max(end - start, 1);
  const progress = Math.max(0, Math.min(1, (now - start) / span));

  const [startYear, startMonth] = previousBirthday.split("-").map(Number);
  let cursor = shiftMonths(`${startYear}-${String(startMonth).padStart(2, "0")}-01`, 1);
  const monthTicks: BirthdayMonthTick[] = [];
  while (cursor < nextBirthday) {
    const timestamp = localDateTimestamp(cursor);
    const month = Number(cursor.slice(5, 7));
    monthTicks.push({
      date: cursor,
      label: `${month}月`,
      progress: Math.max(0, Math.min(1, (timestamp - start) / span)),
    });
    cursor = shiftMonths(cursor, 1);
  }

  return {
    previousBirthday,
    nextBirthday,
    currentAge,
    nextAge: currentAge + 1,
    progress,
    monthTicks,
  };
}
