
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isPhone(value: string): boolean {
  return /^\+?[\d\s-]{10,}$/.test(value);
}

export function isUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}

export function minLength(value: string, min: number): boolean {
  return value.length >= min;
}

export function maxLength(value: string, max: number): boolean {
  return value.length <= max;
}

export function required(value: any): boolean {
  return value !== null && value !== undefined && value !== '';
}
