
export function getItem<T>(key: string): T | null {
  const item = localStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

export function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function removeItem(key: string): void {
  localStorage.removeItem(key);
}

export function clear(): void {
  localStorage.clear();
}

export function getSessionItem<T>(key: string): T | null {
  const item = sessionStorage.getItem(key);
  return item ? JSON.parse(item) : null;
}

export function setSessionItem<T>(key: string, value: T): void {
  sessionStorage.setItem(key, JSON.stringify(value));
}
