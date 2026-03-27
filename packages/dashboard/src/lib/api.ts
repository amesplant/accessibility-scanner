export async function apiFetch(input: RequestInfo, init?: RequestInit) {
  const options: RequestInit = {
    credentials: 'include',
    ...init,
  };
  return fetch(input, options);
}
