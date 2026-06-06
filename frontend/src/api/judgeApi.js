/**
 * judgeApi.js — Frontend API client
 *
 * All requests go through Nginx at the same origin (/api/*)
 * so no CORS config needed for the browser.
 */

const BASE = "/api";

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body:    body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  return res.json();
}

// ── Submissions ──────────────────────────────────────────────

export async function submitCode(payload) {
  return request("POST", "/submit", payload);
}

export async function pollSubmission(id) {
  return request("GET", `/submissions/${id}`);
}

export async function listSubmissions() {
  return request("GET", "/submissions");
}

// ── Problems ─────────────────────────────────────────────────

export async function fetchProblems() {
  return request("GET", "/problems");
}

export async function fetchProblem(id) {
  return request("GET", `/problems/${id}`);
}
