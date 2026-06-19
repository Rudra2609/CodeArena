/**
 * judgeApi.js — Frontend API client
 *
 * All requests go through Nginx at the same origin (/api/*)
 * so no CORS config needed for the browser.
 */

const BASE = "/api";

async function request(method, path, body) {
  const token = localStorage.getItem('access_token');
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    if (res.status === 204) return null; // DELETE returns 204 No Content
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }

  // Handle 204 No Content
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

// ── Code Files ────────────────────────────────────────────────

export async function fetchCodeFiles() {
  return request("GET", "/files");
}

export async function saveCodeFile(payload) {
  return request("POST", "/files", payload);
}

export async function getCodeFile(id) {
  return request("GET", `/files/${id}`);
}

export async function updateCodeFile(id, payload) {
  return request("PUT", `/files/${id}`, payload);
}

export async function deleteCodeFile(id) {
  return request("DELETE", `/files/${id}`);
}
