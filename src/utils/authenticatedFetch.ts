export const SESSION_TOKEN_KEY = 'kayan_session_token';
export const SESSION_USER_KEY = 'kayan_user';
export const COMPANY_SCOPE_KEY = 'kayan_company_scope';
export const BRANCH_SCOPE_KEY = 'kayan_branch_scope';

export function readSessionToken(): string {
  try {
    return typeof localStorage === 'undefined'
      ? ''
      : localStorage.getItem(SESSION_TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function saveSession(token: string, user: unknown): void {
  localStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_USER_KEY);
    localStorage.removeItem(COMPANY_SCOPE_KEY);
    localStorage.removeItem(BRANCH_SCOPE_KEY);
  } catch {
    // The next request will still be rejected by the server if storage is unavailable.
  }
}

export function installAuthenticatedFetch(): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/api/')) {
      return originalFetch(request);
    }

    const isPublicRequest =
      (request.method === 'POST' && url.pathname === '/api/auth/login') ||
      (request.method === 'GET' && url.pathname === '/api/health') ||
      (request.method === 'GET' && /^\/api\/company\/logo\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(url.pathname));
    const headers = new Headers(request.headers);
    if (!isPublicRequest) {
      const token = readSessionToken();
      if (token) headers.set('Authorization', `Bearer ${token}`);

      try {
        const companyId = localStorage.getItem(COMPANY_SCOPE_KEY);
        const branchId = localStorage.getItem(BRANCH_SCOPE_KEY);
        if (companyId) headers.set('x-kayan-company-id', companyId);
        if (branchId) headers.set('x-kayan-branch-id', branchId);
      } catch {
        // Server authorization remains authoritative when browser storage is unavailable.
      }
    }

    const response = await originalFetch(new Request(request, { headers }));
    if (!isPublicRequest && response.status === 401 && readSessionToken()) {
      clearSession();
      window.dispatchEvent(new Event('kayan:session-expired'));
    } else if (!isPublicRequest && response.status === 403) {
      window.dispatchEvent(new Event('kayan:permission-denied'));
    }
    return response;
  };
}
