
export function buildQueryString(params: Record<string, any>): string {
  return Object.entries(params)
    .filter(([_, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

export function parseQueryString(qs: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(qs));
}

export function joinUrl(...parts: string[]): string {
  return parts.map(p => p.replace(/^\/|\/$/g, '')).join('/');
}

export async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
