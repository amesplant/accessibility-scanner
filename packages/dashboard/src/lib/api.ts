/**
 * Browser calls to the scanner API. `credentials: 'include'` sends the session cookie
 * on same-origin requests (Vite proxies /api and /auth to the Express server).
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const options: RequestInit = {
    credentials: 'include',
    ...init,
  };
  return fetch(input, options);
}

/** Like apiFetch, but throws with the server `error` message when status is not OK. */
export async function apiFetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    const text = await res.text();
    let message = text;
    try {
      const body = JSON.parse(text) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* keep raw text */
    }
    throw new Error(message.trim() || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}
