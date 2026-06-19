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
import { useAuth } from "./context/AuthContext";
import { useTheme } from "./context/ThemeContext";
import AuthModals from "./components/AuthModals";
import Sidebar from "./components/Sidebar";
import SettingsModal from "./components/SettingsModal";
import FilesModal from "./components/FilesModal";
import { saveCodeFile, updateCodeFile } from "./api/judgeApi";

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

  // Auth & Theme state
  const { user, logout } = useAuth();
  const { theme } = useTheme();
  const [authModal, setAuthModal] = useState(null); // 'login' | 'register' | 'verify' | null
  const [showSettings, setShowSettings] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);

  const createTab = (id, title, lang, c, cs, fileId, problemTitle, problemSource) => ({
    id, title, language: lang, code: c, cases: cs, fileId, problemTitle, problemSource
  });

  const [tabs, setTabs] = useState(() => {
    let savedTabs = [];
    try {
      const stored = localStorage.getItem("codearena_tabs");
      if (stored) savedTabs = JSON.parse(stored);
    } catch(e) {}

    if (extParams) {
      // Check if problem already exists
      const existingTab = savedTabs.find(t => t.problemSource === extParams.source && extParams.source);
      if (existingTab) {
        // If it exists, don't create a new tab. We will just activate it below.
        return savedTabs;
      }

      const initLang = extParams.lang || "python";
      const initCode = STARTERS[initLang];
      const initCases = extParams.cases || [{stdin: "", expected: ""}];
      const title = extParams.problem || "Solution";
      const extTab = createTab("tab-" + Date.now(), title, initLang, initCode, initCases, null, extParams.problem, extParams.source);
      
      if (savedTabs.length > 0) {
        return [...savedTabs, extTab];
      }
      return [extTab];
    }

    if (savedTabs.length > 0) return savedTabs;

    return [createTab("tab-" + Date.now(), "Solution", "python", STARTERS["python"], [{stdin: "", expected: ""}], null, null, null)];
  });

  const [activeTabId, setActiveTabId] = useState(() => {
    if (extParams) {
      // Check if problem already existed and was kept
      const existingTab = tabs.find(t => t.problemSource === extParams.source && extParams.source);
      if (existingTab) {
        return existingTab.id;
      }
      return tabs[tabs.length - 1].id;
    }
    const savedActive = localStorage.getItem("codearena_active_tab");
    if (savedActive && tabs.find(t => t.id === savedActive)) return savedActive;
    return tabs[0].id;
  });

  useEffect(() => {
    localStorage.setItem("codearena_tabs", JSON.stringify(tabs));
    localStorage.setItem("codearena_active_tab", activeTabId);
  }, [tabs, activeTabId]);

  // Derived state from active tab
  const activeEditorTab = tabs.find(t => t.id === activeTabId) || tabs[0];
  const code = activeEditorTab.code;
  const language = activeEditorTab.language;
  const cases = activeEditorTab.cases;
  const currentFile = activeEditorTab.fileId ? { id: activeEditorTab.fileId, title: activeEditorTab.title } : null;
  const problemTitle = activeEditorTab.problemTitle;
  const problemSource = activeEditorTab.problemSource;

  // Handlers to update active tab
  const updateActiveTab = (updates) => {
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, ...updates } : t));
  };
  const setCode = (newCode) => updateActiveTab({ code: typeof newCode === 'function' ? newCode(code) : newCode });
  const setLanguage = (newLang) => updateActiveTab({ language: typeof newLang === 'function' ? newLang(language) : newLang });
  const setCases = (newCases) => updateActiveTab({ cases: typeof newCases === 'function' ? newCases(cases) : newCases });
  const setCurrentFile = (fileObj) => {
    if (fileObj) {
      updateActiveTab({ fileId: fileObj.id, title: fileObj.title });
    } else {
      updateActiveTab({ fileId: null, title: "Solution" });
    }
  };
  const handleCloseTab = (e, tabId) => {
    e.stopPropagation();
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== tabId);
      if (newTabs.length === 0) {
        const newPad = createTab("tab-" + Date.now(), "Solution", "python", STARTERS["python"], [{stdin: "", expected: ""}], null, null, null);
        setActiveTabId(newPad.id);
        return [newPad];
      }
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.id === tabId);
        setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
      }
      return newTabs;
    });
  };

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
  async function handleSubmit(caseIndex = null) {
    setLoading(true);
    clearInterval(pollRef.current);
    setActiveTab("results");

    setSubmissions(prev => {
      let next = [...prev];
      if (next.length !== cases.length) {
        next = cases.map(() => ({ status: "IDLE" }));
      }
      if (caseIndex !== null) {
        next[caseIndex] = { status: "PENDING" };
      } else {
        next = cases.map(() => ({ status: "PENDING" }));
      }
      return next;
    });

    let casesToRun = caseIndex !== null 
      ? [{ c: cases[caseIndex], i: caseIndex }]
      : cases.map((c, i) => ({ c, i }));

    try {
      const pendings = await Promise.all(
        casesToRun.map(item => submitCode({
          language,
          source_code:     code,
          stdin:           item.c.stdin || "",
          expected_output: item.c.expected || "",
          problem_id:      selectedProblem?.id || null,
        }).then(res => ({ res, i: item.i })))
      );

      setSubmissions(prev => {
        const next = [...prev];
        pendings.forEach(item => { next[item.i] = item.res; });
        return next;
      });

      pollRef.current = setInterval(async () => {
        const updated = await Promise.all(
          pendings.map(item => pollSubmission(item.res.id).then(res => ({ res, i: item.i })))
        );
        
        setSubmissions(prev => {
           const nextSubs = [...prev];
           updated.forEach(item => { nextSubs[item.i] = item.res; });
           return nextSubs;
        });

        const allDone = updated.every(item => !["PENDING", "RUNNING"].includes(item.res.status));
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

  const handleEditorWillMount = (monaco) => {
    monaco.editor.defineTheme('dracula', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#282a36' }
    });
    monaco.editor.defineTheme('github-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#0d1117' }
    });
  };

  // Download code as file
  function handleDownload() {
    const ext = FILE_EXT[language] || "txt";
    let name = problemTitle || selectedProblem?.id || "solution";
    name = name.replace(/[^a-z0-9_-]/gi, '_'); // Sanitize filename
    
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  }
  // Save code as file in backend
  async function handleSaveFile() {
    if (!user) {
      alert("Please log in to save files.");
      return;
    }
    try {
      if (currentFile) {
        // Update existing file
        const res = await updateCodeFile(currentFile.id, {
          source_code: code,
          language: language
        });
        setCurrentFile(res);
        alert("File updated successfully!");
      } else {
        // Create new file
        let title = window.prompt("Enter a name for this file:", problemTitle || selectedProblem?.id || "solution");
        if (!title) return; // user cancelled
        
        const res = await saveCodeFile({
          title,
          language,
          source_code: code
        });
        setCurrentFile(res);
        alert("File saved successfully!");
      }
    } catch (err) {
      alert("Failed to save file: " + err.message);
    }
  }


  // ── Render ──────────────────────────────────────────────────
  return (
    <div className="app-container">
      <Sidebar onSettingsClick={() => setShowSettings(true)} onFilesClick={() => setShowFilesModal(true)} />
      
      <div className="app">
        {/* ── Extension banner ──────────────────────────── */}
        {problemTitle && problemSource && (
          <div className="ext-banner">
            <span className="ext-badge">⚡ CodeArena</span>
            <span className="ext-problem">{problemTitle}</span>
            <a
              href={problemSource}
              target="_blank"
              rel="noreferrer"
              className="ext-link"
            >
              View problem →
            </a>
          </div>
        )}

        {/* ── Top bar ───────────────────────────────────── */}
        <header className="topbar">
          <div className="topbar-left">
            <h1 className="brand">⚔️ CodeArena</h1>
          </div>

          <div className="topbar-right">
            {!user && (
              <div className="auth-buttons" style={{ marginRight: '15px' }}>
                <button onClick={() => setAuthModal('login')} className="btn outline-btn" style={{ marginRight: '10px' }}>Log In</button>
                <button onClick={() => setAuthModal('register')} className="btn primary-btn">Sign Up</button>
              </div>
            )}

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
            onClick={handleSaveFile}
            title="Save code to your account"
          >
            💾 Save
          </button>

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
                problemUrl: problemSource
              }, "*");
            }}
            title="Submit directly to platform"
            disabled={!problemSource}
          >
            🚀 Submit
          </button>

          <button
            className={`btn-run ${loading ? "loading" : ""}`}
            onClick={loading ? handleStop : () => handleSubmit(null)}
            style={loading ? { background: "#dc3545", color: "white" } : {}}
          >
            {loading ? "⏹ Stop" : "▶ Run all"}
          </button>
        </div>
      </header>

      {/* ── Main layout ───────────────────────────────── */}
      {!user && (
        <div className="login-overlay">
          <div className="login-overlay-content">
            <h2>Welcome to CodeArena</h2>
            <p style={{ color: "var(--text-muted)", marginBottom: "20px" }}>Please log in to start coding and testing your solutions.</p>
            <div className="auth-buttons" style={{ display: "flex", gap: "15px", justifyContent: "center" }}>
              <button onClick={() => setAuthModal('login')} className="btn outline-btn">Log In</button>
              <button onClick={() => setAuthModal('register')} className="btn primary-btn">Sign Up</button>
            </div>
          </div>
        </div>
      )}
      <Split 
        className="workspace split"
        style={{ pointerEvents: !user ? "none" : "auto" }}
        sizes={[65, 35]}
        minSize={isMobile ? 250 : 350}
        direction={isMobile ? 'vertical' : 'horizontal'}
        gutterSize={8}
      >
        {/* Left: Monaco editor */}
        <section className="editor-pane">
          <div className="editor-tabs-bar">
            {tabs.map(tab => (
              <div 
                key={tab.id} 
                className={`editor-tab ${activeTabId === tab.id ? "active" : ""}`}
                onClick={() => setActiveTabId(tab.id)}
              >
                <span className={`tab-icon lang-${tab.language}`}>
                  {tab.language === "javascript" ? "JS" :
                   tab.language === "python" ? "PY" :
                   tab.language.startsWith("cpp") ? "C++" :
                   tab.language === "java" ? "☕" : "📄"}
                </span>
                <span className="tab-title">{tab.title}</span>
                <button 
                  className="tab-close" 
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  title="Close tab"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <Editor
            height="100%"
            language={MONACO_LANG[language]}
            value={code}
            onChange={(v) => setCode(v || "")}
            theme={theme === 'dark' ? 'vs-dark' : theme}
            beforeMount={handleEditorWillMount}
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
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", alignItems: "center" }}>
                    <strong>Case {i + 1}</strong>
                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                      <button 
                        className="btn-run-sm" 
                        onClick={() => handleSubmit(i)}
                        disabled={loading}
                        title={`Run Case ${i + 1}`}
                      >
                        ▶ Run
                      </button>
                      {cases.length > 1 && (
                         <button className="btn-delete" onClick={() => setCases(cases.filter((_, idx) => idx !== i))}>✕</button>
                      )}
                    </div>
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
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                      <strong style={{ color: "#fff" }}>Case {i + 1}</strong>
                      <button 
                        className="btn-run-sm" 
                        onClick={() => handleSubmit(i)}
                        disabled={loading}
                        title={`Run Case ${i + 1}`}
                      >
                        ▶ Run
                      </button>
                    </div>
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

      {/* ── Modals ────────────────────────────────────── */}
      {authModal && (
        <AuthModals 
          mode={authModal} 
          onClose={() => setAuthModal(null)} 
          onSwitchMode={setAuthModal} 
        />
      )}

      {showSettings && (
        <SettingsModal onClose={() => setShowSettings(false)} />
      )}

      {showFilesModal && (
        <FilesModal 
          onClose={() => setShowFilesModal(false)}
          onLoadFile={(file) => {
            // Check if already open
            const existingTab = tabs.find(t => t.fileId === file.id);
            if (existingTab) {
              setActiveTabId(existingTab.id);
            } else {
              const newTab = createTab("tab-" + Date.now(), file.title, file.language, file.source_code, [{stdin: "", expected: ""}], file.id, null, null);
              setTabs(prev => [...prev, newTab]);
              setActiveTabId(newTab.id);
            }
            setShowFilesModal(false);
          }}
        />
      )}
      </div>
    </div>
  );
}
