/**
 * API utility functions for the test frontend.
 * All API calls go through this module.
 */

const API_BASE = '';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('access_token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(API_BASE + path, { ...options, headers });
  const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    if (data?.error?.message) {
      msg = data.error.message;
    } else if (Array.isArray(data?.detail)) {
      msg = data.detail.map(d => `${d.loc.slice(1).join('.')} - ${d.msg}`).join(', ');
    } else if (typeof data?.detail === 'string') {
      msg = data.detail;
    } else if (typeof data?.error === 'string') {
      msg = data.error;
    }
    throw new Error(msg);
  }
  return data;
}
