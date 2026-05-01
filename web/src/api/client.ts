const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:4000";

const ACCESS_KEY = "powerpost_access_token";
const REFRESH_KEY = "powerpost_refresh_token";

export const tokens = {
  access(): string | null {
    return localStorage.getItem(ACCESS_KEY);
  },
  refresh(): string | null {
    return localStorage.getItem(REFRESH_KEY);
  },
  set(access: string, refresh: string): void {
    localStorage.setItem(ACCESS_KEY, access);
    localStorage.setItem(REFRESH_KEY, refresh);
  },
  clear(): void {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: { auth?: boolean; retried?: boolean } = { auth: true },
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (opts.auth !== false) {
    const token = tokens.access();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && opts.auth !== false && !opts.retried) {
    const refreshed = await tryRefresh();
    if (refreshed) return request<T>(method, path, body, { ...opts, retried: true });
    tokens.clear();
  }

  const text = await res.text();
  const json = text ? safeJson(text) : null;
  if (!res.ok) {
    const message = (json && (json as { error?: string }).error) || res.statusText;
    throw new ApiError(res.status, message, json);
  }
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function tryRefresh(): Promise<boolean> {
  const refresh = tokens.refresh();
  if (!refresh) return false;
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!res.ok) return false;
    const json = (await res.json()) as { access_token: string; refresh_token: string };
    tokens.set(json.access_token, json.refresh_token);
    return true;
  } catch {
    return false;
  }
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
  unauth: {
    post: <T>(path: string, body?: unknown) => request<T>("POST", path, body, { auth: false }),
  },
};
