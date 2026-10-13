const API_BASE = '/api/v1';

export class ApiError extends Error {
  code?: string;
  details?: unknown;

  constructor(message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('relixor_auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const headers = {
    ...getAuthHeader(),
    ...(options.headers || {}),
  } as Record<string, string>;

  // Don't set Content-Type if sending FormData (browser sets boundary)
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If unauthorized, clear token and redirect to login if not already there
    if (!window.location.pathname.includes('/login')) {
      localStorage.removeItem('relixor_auth_token');
      localStorage.removeItem('relixor_user');
      window.location.href = '/login';
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error?.message || `Request failed with status ${response.status}`;
    throw new ApiError(errorMsg, data?.error?.code, data?.error?.details);
  }

  return (data?.data ?? data) as T;
}

export async function downloadFile(url: string, filename: string): Promise<void> {
  const token = localStorage.getItem('relixor_auth_token');
  const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

  const response = await fetch(fullUrl, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const blob = await response.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
