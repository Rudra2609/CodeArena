/**
 * content.js — Judge Bridge content script  v2.0
 *
 * Injected into supported competitive-programming pages.
 * Listens for { action: "extractTestCases" } from the popup,
 * scrapes sample I/O from the page DOM, and replies.
 *
 * Supported platforms
 * ───────────────────
 *  • Codeforces  codeforces.com/problemset/problem/<id>/<letter>
 *                codeforces.com/contest/<id>/problem/<letter>
 *                codeforces.com/gym/<id>/problem/<letter>
 *  • HackerRank  hackerrank.com/challenges/<slug>
 *  • AtCoder     atcoder.jp/contests/<id>/tasks/<slug>
 *  • CSES        cses.fi/problemset/task/<id>
 *  • CodeChef    codechef.com/problems/<slug>
 *                codechef.com/<id>/problems/<slug>
 */

(function () {
  "use strict";

  const { hostname, href } = window.location;

  // ── Platform detection ──────────────────────────────────────
  const platform =
    hostname.includes("codeforces.com")  ? "codeforces"  :
    hostname.includes("hackerrank.com")  ? "hackerrank"  :
    hostname.includes("atcoder.jp")      ? "atcoder"     :
    hostname.includes("cses.fi")         ? "cses"        :
    hostname.includes("codechef.com")    ? "codechef"    :
    null;

  // ── Message listener ────────────────────────────────────────
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action !== "extractTestCases") return false;

    if (!platform) {
      sendResponse({ error: `Unsupported platform: ${hostname}`, examples: [] });
      return false;
    }

    try {
      sendResponse(EXTRACTORS[platform]());
    } catch (err) {
      sendResponse({
        error:    `Extraction failed: ${err.message}`,
        examples: [],
        platform,
        url:      href,
      });
    }
    return false;
  });

  // ── Helpers ─────────────────────────────────────────────────

  /** Walk siblings until we hit a <pre> or <code> block. */
  function nextPre(el) {
    let node = el?.nextElementSibling;
    while (node && !["PRE", "CODE"].includes(node.tagName)) {
      const inner = node.querySelector("pre, code");
      if (inner) return inner;
      node = node.nextElementSibling;
    }
    return node;
  }

  // ── Extractors ──────────────────────────────────────────────
  const EXTRACTORS = {

    // ── Codeforces ──────────────────────────────────────────
    codeforces() {
      const title =
        document.querySelector(".problem-statement .title")?.innerText?.trim() ||
        document.title.replace(/- Codeforces.*/, "").trim();

      const inputEls  = document.querySelectorAll(".sample-tests .input  pre");
      const outputEls = document.querySelectorAll(".sample-tests .output pre");

      const examples = Array.from(inputEls).map((el, i) => ({
        id:       i + 1,
        stdin:    el.innerText.trim(),
        expected: outputEls[i]?.innerText?.trim() || "",
      }));

      return { platform: "Codeforces", title, url: href, examples };
    },

    // ── HackerRank ──────────────────────────────────────────
    hackerrank() {
      const title =
        document.querySelector(".challenge-name")?.innerText?.trim() ||
        document.querySelector("h1.hr-page-heading")?.innerText?.trim() ||
        document.title.replace(/\s*\|.*/, "").trim();

      const pres    = Array.from(
        document.querySelectorAll(".challenge-body-html pre, .problem-statement pre")
      );
      const examples = [];
      for (let i = 0; i + 1 < pres.length; i += 2) {
        examples.push({
          id:       examples.length + 1,
          stdin:    pres[i].innerText.trim(),
          expected: pres[i + 1].innerText.trim(),
        });
      }

      return { platform: "HackerRank", title, url: href, examples };
    },

    // ── AtCoder ─────────────────────────────────────────────
    // Works for: ABC, ARC, AGC, AHC, Beginner/Regular/Grand,
    // and most third-party contests that follow the standard template.
    // Also handles Japanese contest pages (入力例 / 出力例).
    atcoder() {
      // Title
      const title =
        document.querySelector("#task-title h2")?.innerText?.trim() ||
        document.querySelector(".h2")?.innerText?.trim() ||
        document.querySelector("#task-statement h1")?.innerText?.trim() ||
        document.title.replace(/\s*-\s*AtCoder.*/, "").trim();

      const inputMap  = new Map();
      const outputMap = new Map();

      // Primary strategy: sections inside #task-statement with numbered h3 headers
      // Covers English ("Sample Input 1") & Japanese ("入力例 1") labels
      document.querySelectorAll("#task-statement section").forEach(section => {
        const h3  = section.querySelector("h3");
        const pre = section.querySelector("pre");
        if (!h3 || !pre) return;

        const header = h3.innerText.trim();
        const num    = header.match(/\d+/)?.[0];
        if (!num) return;

        if (/sample\s*input|入力例/i.test(header)) {
          inputMap.set(num, pre.innerText.trim());
        } else if (/sample\s*output|出力例/i.test(header)) {
          outputMap.set(num, pre.innerText.trim());
        }
      });

      // Fallback: newer AtCoder format uses .io-style wrapper
      if (inputMap.size === 0) {
        const allH3 = Array.from(document.querySelectorAll("#task-statement h3"));
        allH3.forEach(h3 => {
          const header = h3.innerText.trim();
          const num    = header.match(/\d+/)?.[0];
          if (!num) return;

          const pre = h3.closest("section")?.querySelector("pre") ||
                      h3.nextElementSibling;
          if (!pre) return;

          if (/sample\s*input|入力例/i.test(header)) {
            inputMap.set(num, pre.innerText.trim());
          } else if (/sample\s*output|出力例/i.test(header)) {
            outputMap.set(num, pre.innerText.trim());
          }
        });
      }

      const examples = [...inputMap.keys()]
        .sort((a, b) => +a - +b)
        .map(k => ({
          id:       +k,
          stdin:    inputMap.get(k)  || "",
          expected: outputMap.get(k) || "",
        }));

      return { platform: "AtCoder", title, url: href, examples };
    },

    // ── CSES ────────────────────────────────────────────────
    // cses.fi renders examples in a two-column table (Input | Output)
    // with possible multiple example rows.
    cses() {
      const title =
        document.querySelector(".title-block h1")?.innerText?.trim() ||
        document.querySelector("h1")?.innerText?.trim() ||
        document.title.replace(/\s*[-–|].*/, "").trim();

      const examples = [];

      // Strategy 1: <table> with th "Input" / "Output" columns (standard CSES)
      document.querySelectorAll(".content table, .task-content table").forEach(table => {
        const ths = Array.from(table.querySelectorAll("th"));
        if (!ths.some(th => /input/i.test(th.innerText))) return;

        // Each data row = one test case
        table.querySelectorAll("tbody tr").forEach(row => {
          const tds = row.querySelectorAll("td");
          if (tds.length < 2) return;
          examples.push({
            id:       examples.length + 1,
            stdin:    tds[0].innerText.trim(),
            expected: tds[1].innerText.trim(),
          });
        });
      });

      // Strategy 2: labeled <pre> pairs (older CSES layout)
      if (examples.length === 0) {
        const content = document.querySelector(".content, .task-content");
        if (content) {
          const allPres = Array.from(content.querySelectorAll("pre"));
          // Find pairs preceded by "Input:" / "Output:" sibling text
          for (let i = 0; i + 1 < allPres.length; i += 2) {
            examples.push({
              id:       examples.length + 1,
              stdin:    allPres[i].innerText.trim(),
              expected: allPres[i + 1].innerText.trim(),
            });
          }
        }
      }

      // Strategy 3: scan raw text for "Example" blocks
      if (examples.length === 0) {
        const raw = document.querySelector(".content")?.innerText || "";
        const blocks = raw.split(/example\s*\d*\s*:/i).slice(1);
        blocks.forEach(block => {
          const inM  = block.match(/Input\s*:\s*([\s\S]*?)(?=Output\s*:|$)/i);
          const outM = block.match(/Output\s*:\s*([\s\S]*?)(?=Input\s*:|Example\s|$)/i);
          if (inM || outM) {
            examples.push({
              id:       examples.length + 1,
              stdin:    (inM?.[1]  || "").trim(),
              expected: (outM?.[1] || "").trim(),
            });
          }
        });
      }

      return { platform: "CSES", title, url: href, examples };
    },

    // ── CodeChef ────────────────────────────────────────────
    // CodeChef has had multiple redesigns; we cover all known layouts.
    codechef() {
      const title =
        document.querySelector("h1.problem-name")?.innerText?.trim() ||
        document.querySelector(".problem-name")?.innerText?.trim() ||
        document.querySelector('[class*="ProblemPage"] h1')?.innerText?.trim() ||
        document.querySelector("h1")?.innerText?.trim() ||
        document.title.replace(/\s*[-–|].*/, "").trim();

      const examples = [];

      // Strategy 1: explicit id="sample-input-N" / id="sample-output-N"
      let idx = 1;
      while (true) {
        const inEl  = document.querySelector(
          `[id="sample-input-${idx}"], [id="sample_input_${idx}"]`
        );
        const outEl = document.querySelector(
          `[id="sample-output-${idx}"], [id="sample_output_${idx}"]`
        );
        if (!inEl && !outEl) break;
        examples.push({
          id:       idx,
          stdin:    inEl?.innerText?.trim()  || "",
          expected: outEl?.innerText?.trim() || "",
        });
        idx++;
      }

      // Strategy 2: single #sample-input / #sample-output (older layout)
      if (examples.length === 0) {
        const inEl  = document.querySelector("#sample-input,  #sample-inp");
        const outEl = document.querySelector("#sample-output, #sample-out");
        if (inEl || outEl) {
          examples.push({
            id:       1,
            stdin:    inEl?.innerText?.trim()  || "",
            expected: outEl?.innerText?.trim() || "",
          });
        }
      }

      // Strategy 3: "Example Input" / "Example Output" bold/heading labels
      if (examples.length === 0) {
        const labels = Array.from(
          document.querySelectorAll("h2, h3, h4, strong, b, p")
        );
        const inHeaders  = labels.filter(el =>
          /example\s*(input|\d)/i.test(el.innerText.trim())
        );
        const outHeaders = labels.filter(el =>
          /example\s*output/i.test(el.innerText.trim())
        );

        inHeaders.forEach((header, i) => {
          const inPre  = nextPre(header);
          const outPre = nextPre(outHeaders[i]);
          examples.push({
            id:       i + 1,
            stdin:    inPre?.innerText?.trim()  || "",
            expected: outPre?.innerText?.trim() || "",
          });
        });
      }

      // Strategy 4: React/Next.js rendered layout — find pre blocks inside
      // the problem statement section and pair them up
      if (examples.length === 0) {
        const containers = document.querySelectorAll(
          '[class*="problem"] pre, [class*="Problem"] pre, .content pre, section pre'
        );
        const pres = Array.from(containers);
        for (let i = 0; i + 1 < pres.length; i += 2) {
          examples.push({
            id:       examples.length + 1,
            stdin:    pres[i].innerText.trim(),
            expected: pres[i + 1].innerText.trim(),
          });
        }
      }

      return { platform: "CodeChef", title, url: href, examples };
    },
  };
})();
