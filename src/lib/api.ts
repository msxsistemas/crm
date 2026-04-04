const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';

// CSRF double-submit cookie: read csrf_token cookie set by server
function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

let isRefreshing = false;

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  options?: { signal?: AbortSignal }
): Promise<T> {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // CSRF token for cookie-authenticated mutating requests
  if (!SAFE_METHODS.has(method)) {
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include', // send httpOnly cookies automatically
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: options?.signal,
  });

  if (res.status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      // Silent refresh via httpOnly refresh_token cookie
      const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (refreshRes.ok) {
        // Retry original request with fresh cookie
        const retryRes = await fetch(`${BASE_URL}${path}`, {
          method,
          headers,
          credentials: 'include',
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!retryRes.ok) {
          const err = await retryRes.json().catch(() => ({ error: retryRes.statusText }));
          throw Object.assign(new Error(err.error || 'Request failed'), { status: retryRes.status, data: err });
        }
        return retryRes.json() as T;
      }
    } finally {
      isRefreshing = false;
    }
    // Avoid redirect loop: if already on a login page, just throw so the form shows normally
    const onLoginPage = ['/login', '/admin/login', '/revenda/login'].some(p => window.location.pathname.startsWith(p));
    if (!onLoginPage) window.location.href = '/login';
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
  // Upload multipart/form-data (let browser set Content-Type with boundary)
  upload: async <T = unknown>(path: string, formData: FormData): Promise<T> => {
    const headers: Record<string, string> = {};
    const csrfToken = getCsrfToken();
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw Object.assign(new Error(err.error || 'Upload failed'), { status: res.status, data: err });
    }
    const text = await res.text();
    return text ? JSON.parse(text) as T : undefined as T;
  },
};

export default api;
