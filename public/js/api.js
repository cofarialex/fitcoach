// Kis fetch-burkoló: JSON küldés/fogadás, egységes hibakezelés
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (form) {
    opts.body = form; // FormData (képfeltöltés) — a böngésző állítja be a fejlécet
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new ApiError(0, 'Nincs kapcsolat a szerverrel');
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* nem JSON válasz */
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, (data && data.error) || `Hiba (${res.status})`);
  }
  return data;
}

export const get = (p) => api(p);
export const post = (p, body) => api(p, { method: 'POST', body: body || {} });
export const put = (p, body) => api(p, { method: 'PUT', body: body || {} });
export const del = (p, body) => api(p, { method: 'DELETE', body });
