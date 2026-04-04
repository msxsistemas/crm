const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (res.status === 401) {
    // Try to refresh
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshRes.ok) {
        const data = await refreshRes.json();
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('refresh_token', data.refreshToken);
        // Retry original request
        const retryRes = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: { ...headers, Authorization: `Bearer ${data.token}` },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) {
          const err = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
          throw Object.assign(new Error(err.error || 'Request failed'), { status: retryRes.status, data: err });
        }
        return retryRes.json() as T;
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, data: err });
  }

  const text = await res.text();
  return text ? JSON.parse(text) as T : undefined as T;
}

export const api = {
  get: <T = unknown>(path: string, options?: { signal?: AbortSignal }) =>
    request<T>('GET', path, undefined, options),
  post: <T = unknown>(path: string, body?: unknown) =>
    request<T>('POST', path, body),
  patch: <T = unknown>(path: string, body?: unknown) =>
    request<T>('PATCH', path, body),
  put: <T = unknown>(path: string, body?: unknown) =>
    request<T>('PUT', path, body),
  delete: <T = unknown>(path: string) =>
    request<T>('DELETE', path),
};

export default api;
