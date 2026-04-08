/** Browser calls to the scanner API (proxied to Express via Vite in development). */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const options: RequestInit = {
    credentials: 'include',
    ...init,
  };
  return fetch(input, options);
}

export async function readApiError(res: Response, fallback: string): Promise<Error> {
  const text = await res.text();
  let message = text;
  try {
    const body = JSON.parse(text) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    /* keep raw text */
  }

  return new Error(message.trim() || `${fallback} (${res.status})`);
}

export function toApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError && err.message === 'Failed to fetch') {
    return 'Scanner API unavailable. Start the dev server and try again.';
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return fallback;
}

/** Like apiFetch, but throws with the server `error` message when status is not OK. */
export async function apiFetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await apiFetch(input, init);
  if (!res.ok) {
    throw await readApiError(res, 'Request failed');
  }
  return res.json() as Promise<T>;
}
