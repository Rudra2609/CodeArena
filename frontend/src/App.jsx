/**
 * App.jsx  —  Online Code Judge frontend
 *
 * New in this version
 * ───────────────────
 * • Reads URL params injected by the Judge Bridge Chrome extension:
 *     ?stdin=<b64>  &expected=<b64>  &lang=python  &problem=<title>
 * • Python is the default language
 * • Shows a "from extension" banner when params are detected
 */

import { useState, useEffect, useRef } from "react";
import Editor from "@monaco-editor/react";
import Split from "react-split";
import VerdictBadge from "./components/VerdictBadge";
import { submitCode, pollSubmission, fetchProblems } from "./api/judgeApi";

// ── URL param helpers ─────────────────────────────────────────
function decodeParam(val) {
  try {
    return decodeURIComponent(escape(atob(val)));
  } catch {
    return val; // fallback: treat as plain text
  }
}

function readExtensionParams() {
  const p = new URLSearchParams(window.location.search);
  if (!p.has("stdin") && !p.has("expected") && !p.has("cases")) return null;
  
  let cases = [];
  if (p.has("cases")) {
    try {
      cases = JSON.parse(decodeParam(p.get("cases")));
    } catch(e) {}
  } else {
    cases = [{
      stdin: p.has("stdin") ? decodeParam(p.get("stdin")) : "",
      expected: p.has("expected") ? decodeParam(p.get("expected")) : ""
    }];
  }

  return {
    cases,
    lang:     p.get("lang")     || "python",
    problem:  p.get("problem")  || null,
    source:   p.get("source")   || null,
  };
}

// ── Starter snippets ──────────────────────────────────────────
const STARTERS = {
  python: `# Read input with input() or sys.stdin
import sys

data = sys.stdin.read().split()
# Write your solution here
print("Hello, Judge!")
`,
  cpp: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // Write your solution here
    cout << "Hello, Judge!" << endl;
    return 0;
}
`,
  cpp23: `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    // Write your solution here
    cout << "Hello, Judge!" << endl;
    return 0;
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        // Write your solution here
        System.out.println("Hello, Judge!");
    }
}
`,
  javascript: `const lines = require('fs')
  .readFileSync('/dev/stdin', 'utf8')
  .trim()
  .split('\\n');

// Write your solution here
console.log("Hello, Judge!");
`,
};

const MONACO_LANG = {
  python:     "python",
  cpp:        "cpp",
  cpp23:      "cpp",
  java:       "java",
  javascript: "javascript",
};

const FILE_EXT = {
  python:     "py",
  cpp:        "cpp",
  cpp23:      "cpp",
  java:       "java",
  javascript: "js",
};

// ── Component ──────────────────────────────────────────────────
export default function App() {
  const extParams = useRef(readExtensionParams()).current;

  const [language, setLanguage]       = useState(extParams?.lang || "python");
  const [code, setCode]               = useState(STARTERS[extParams?.lang || "python"]);
  const [cases, setCases]             = useState(extParams?.cases || [{stdin: "", expected: ""}]);
  const [problems, setProblems]       = useState([]);
  const [selectedProblem, setProblem] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [activeTab, setActiveTab]     = useState("editor"); // editor | results
  const [isMobile, setIsMobile]       = useState(window.innerWidth <= 768);
  const pollRef = useRef(null);

  // Responsive split tracking
  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Load problem list on mount
  useEffect(() => {
    fetchProblems().then(setProblems).catch(console.error);
  }, []);

  // If extension params include a problem source, show it
  useEffect(() => {
    if (!extParams) return;
    // Clean the URL so the params don't persist on refresh
    window.history.replaceState({}, "", "/");
  }, []);

  // Language change → update starter code (unless already edited)
  function handleLangChange(lang) {
    setLanguage(lang);
    setCode(STARTERS[lang]);
  }

  // Load a seeded problem
  function handleProblemSelect(problem) {
    setProblem(problem);
    setCases([{
      stdin: problem.stdin_example || "",
      expected: problem.expected_output || ""
    }]);
  }

  // Submit
  async function handleSubmit() {
    setLoading(true);
    setSubmissions(cases.map(() => ({ status: "PENDING" })));
    clearInterval(pollRef.current);
    setActiveTab("results");

    try {
      const pendings = await Promise.all(
        cases.map(c => submitCode({
          language,
          source_code:     code,
          stdin:           c.stdin || "",
          expected_output: c.expected || "",
          problem_id:      selectedProblem?.id || null,
        }))
      );

      setSubmissions(pendings);

      pollRef.current = setInterval(async () => {
        const updated = await Promise.all(
          pendings.map(p => pollSubmission(p.id))
        );
        setSubmissions(updated);
        
        const allDone = updated.every(u => !["PENDING", "RUNNING"].includes(u.status));
        if (allDone) {
          clearInterval(pollRef.current);
          setLoading(false);
        }
      }, 200);
    } catch (err) {
      console.error(err);
      setLoading(false);
    }
  }

  // Stop running testcases (frontend-only cancellation)
  function handleStop() {
    clearInterval(pollRef.current);
    setLoading(false);
    setSubmissions(prev => prev.map(sub => 
      ["PENDING", "RUNNING"].includes(sub.status) ? { ...sub, status: "CANCELLED" } : sub
    ));
  }

  // Download code as file
  function handleDownload() {
    const ext = FILE_EXT[language] || "txt";
    let name = extParams?.problem || selectedProblem?.id || "solution";
    name = name.replace(/[^a-z0-9_-]/gi, '_'); // Sanitize filename
    
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="app">
      {/* ── Extension banner ──────────────────────────── */}
      {extParams && (
        <div className="ext-banner">
          <span className="ext-badge">⚡ CodeArena</span>
          {extParams.problem && (
            <span className="ext-problem">{extParams.problem}</span>
          )}
          {extParams.source && (
            <a
              href={extParams.source}
              target="_blank"
              rel="noreferrer"
              className="ext-link"
            >
              View problem →
            </a>
          )}
        </div>
      )}

      {/* ── Top bar ───────────────────────────────────── */}
      <header className="topbar">
        <div className="topbar-left">
          <h1 className="brand">⚔️ CodeArena</h1>

          {/* Problem picker removed as requested */}
        </div>

        <div className="topbar-right">
          {/* Language selector */}
          <select
            className="lang-select"
            value={language}
            onChange={(e) => handleLangChange(e.target.value)}
          >
            <option value="python">Python 3</option>
            <option value="cpp">C++ 17</option>
            <option value="cpp23">C++ 23</option>
            <option value="java">Java 21</option>
            <option value="javascript">Node.js 20</option>
          </select>

          <button
            className="btn-run"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text)", border: "1px solid var(--glass-border)", marginRight: "10px", boxShadow: "none" }}
            onClick={handleDownload}
            title="Download code file"
          >
            💾 Download
          </button>

          <button
            className="btn-run"
            style={{ background: "#10a37f", marginRight: "10px" }}
            onClick={() => {
              window.postMessage({
                action: "submitToPlatform",
                language,
                code,
                problemUrl: extParams?.source
              }, "*");
            }}
            title="Submit directly to platform"
            disabled={!extParams?.source}
          >
            🚀 Submit
          </button>

          <button
            className={`btn-run ${loading ? "loading" : ""}`}
            onClick={loading ? handleStop : handleSubmit}
            style={loading ? { background: "#dc3545", color: "white" } : {}}
          >
            {loading ? "⏹ Stop" : "▶ Run"}
          </button>
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────── */}
      <Split 
        className="workspace split"
        sizes={[65, 35]}
        minSize={isMobile ? 250 : 350}
        direction={isMobile ? 'vertical' : 'horizontal'}
        gutterSize={8}
      >
        {/* Left: Monaco editor */}
        <section className="editor-pane">
          <Editor
            height="100%"
            language={MONACO_LANG[language]}
            value={code}
            onChange={(v) => setCode(v || "")}
            theme="vs-dark"
            options={{
              fontSize:          14,
              fontFamily:        "'JetBrains Mono', 'Fira Code', monospace",
              fontLigatures:     true,
              minimap:           { enabled: false },
              lineNumbers:       "on",
              scrollBeyondLastLine: false,
              tabSize:           4,
              wordWrap:          "off",
              padding:           { top: 16 },
            }}
          />
        </section>

        {/* Right: IO + results */}
        <aside className="io-pane">
          {/* Tab bar */}
          <div className="io-tabs">
            <button
              className={`io-tab ${activeTab === "editor" ? "active" : ""}`}
              onClick={() => setActiveTab("editor")}
            >
              Input / Output
            </button>
            <button
              className={`io-tab ${activeTab === "results" ? "active" : ""}`}
              onClick={() => setActiveTab("results")}
            >
              Results
            </button>
          </div>

          {activeTab === "editor" && (
            <div className="io-body">
              {cases.map((c, i) => (
                <div key={i} className="testcase-card">
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <strong style={{ color: "#fff" }}>Case {i + 1}</strong>
                    {cases.length > 1 && (
                       <button className="btn-delete" onClick={() => setCases(cases.filter((_, idx) => idx !== i))}>✕</button>
                    )}
                  </div>
                  <div className="io-section">
                    <label className="io-label">Stdin</label>
                    <textarea
                      className="io-textarea"
                      value={c.stdin || ""}
                      onChange={(e) => {
                        const newCases = [...cases];
                        newCases[i].stdin = e.target.value;
                        setCases(newCases);
                      }}
                      placeholder="Paste input here…"
                      spellCheck={false}
                    />
                  </div>
                  <div className="io-section">
                    <label className="io-label">Expected Output</label>
                    <textarea
                      className="io-textarea"
                      value={c.expected || ""}
                      onChange={(e) => {
                        const newCases = [...cases];
                        newCases[i].expected = e.target.value;
                        setCases(newCases);
                      }}
                      placeholder="Paste expected output for verdict comparison…"
                      spellCheck={false}
                    />
                  </div>
                </div>
              ))}
              <button 
                className="btn-ghost" 
                onClick={() => setCases([...cases, {stdin: "", expected: ""}])}
              >
                + Add Testcase
              </button>
            </div>
          )}

          {activeTab === "results" && (
            <div className="results-body">
              {submissions.length === 0 && !loading && (
                <div className="results-empty">
                  <p>Press ▶ Run to execute your code</p>
                </div>
              )}

              {submissions.map((sub, i) => (
                <div key={i} className="testcase-card">
                  <div className="result-header">
                    <strong style={{ color: "#fff" }}>Case {i + 1}</strong>
                    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
                      <VerdictBadge verdict={sub.verdict || sub.status} />
                      {sub.time_ms != null && (
                        <span className="time-tag">{sub.time_ms} ms</span>
                      )}
                    </div>
                  </div>

                  {sub.output && (
                    <div className="result-section">
                      <label className="io-label">Output</label>
                      <pre className="result-pre" style={{ whiteSpace: "pre-wrap" }}>{sub.output}</pre>
                    </div>
                  )}

                  {["PENDING", "RUNNING"].includes(sub.status) && (
                    <div className="result-running">
                      <div className="running-text">
                        {sub.status}…
                      </div>
                      <div className="sweep-loader" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </aside>
      </Split>
    </div>
  );
}
