
export function parseISO(dateStr: string): Date {
  return new Date(dateStr);
}

export function format(date: Date, pattern: string): string {
  const map: Record<string, string> = {
    'yyyy': date.getFullYear().toString(),
    'MM': (date.getMonth() + 1).toString().padStart(2, '0'),
    'dd': date.getDate().toString().padStart(2, '0'),
    'HH': date.getHours().toString().padStart(2, '0'),
    'mm': date.getMinutes().toString().padStart(2, '0'),
  };
  return pattern.replace(/yyyy|MM|dd|HH|mm/g, m => map[m]);
}

export function formatDistance(date: Date, base: Date, opts?: { addSuffix?: boolean }): string {
  const diff = Math.abs(base.getTime() - date.getTime());
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const suffix = opts?.addSuffix ? (date < base ? ' ago' : ' from now') : '';
  if (days === 0) return 'today';
  if (days === 1) return '1 day' + suffix;
  return days + ' days' + suffix;
}
