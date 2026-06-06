# Judge Bridge — Chrome Extension  v2.0

Extracts sample test cases from competitive programming platforms
and loads them into your local code judge with one click.

## Supported Platforms

| Platform     | URL Pattern                                          |
|--------------|------------------------------------------------------|
| Codeforces   | `codeforces.com/problemset/problem/*/*`              |
|              | `codeforces.com/contest/*/problem/*`                 |
|              | `codeforces.com/gym/*/problem/*`                     |
| HackerRank   | `hackerrank.com/challenges/*`                        |
| AtCoder      | `atcoder.jp/contests/*/tasks/*`                      |
| CSES         | `cses.fi/problemset/task/*`                          |
| CodeChef     | `codechef.com/problems/*`                            |
|              | `codechef.com/*/problems/*`                          |

## How It Works

```
Codeforces / AtCoder / CSES / CodeChef / HackerRank problem page
       │
       │  content.js scrapes the DOM (multiple fallback strategies)
       ▼
  Popup shows all sample test cases in tabs
       │
       │  Click "🚀 Open in Judge"
       ▼
  background.js encodes test data as base64 URL params and opens:
  http://localhost/?stdin=<b64>&expected=<b64>&lang=python&problem=<title>
       │
       ▼
  App.jsx decodes params → stdin + expected output pre-filled → Run!
```

No API calls from the extension. Zero CORS issues.

## Installation

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `chrome-extension/` folder
4. The ⚡ icon appears in the toolbar (pin it for easy access)

## Usage

1. Run the judge: `make up` (starts on `http://localhost`)
2. Open any problem on a supported platform
3. Click ⚡ → select test case tab → choose language → **🚀 Open in Judge**

## DOM Extraction Strategies

Each platform has multiple fallback strategies in `content.js`:

| Platform   | Primary selector                              | Fallback                        |
|------------|-----------------------------------------------|---------------------------------|
| Codeforces | `.sample-tests .input/output pre`             | —                               |
| AtCoder    | `#task-statement section h3 + pre`            | All h3 in task-statement        |
| CSES       | `.content table th[Input] → tbody td pairs`   | Paired `pre` blocks             |
| CodeChef   | `#sample-input-N / #sample-output-N`          | `Example Input/Output` labels → `pre` pairs |
| HackerRank | `.challenge-body-html pre` pairs              | `.problem-statement pre` pairs  |

## Adding a New Platform

1. Add URL pattern to `manifest.json` under `content_scripts[].matches` and `host_permissions`
2. Add extractor to `EXTRACTORS` object in `content.js`:
```js
EXTRACTORS.newsite = function () {
  const title = document.querySelector('h1')?.innerText?.trim();
  const inputs  = [...document.querySelectorAll('.input pre')].map(el => el.innerText.trim());
  const outputs = [...document.querySelectorAll('.output pre')].map(el => el.innerText.trim());
  const examples = inputs.map((stdin, i) => ({ id: i+1, stdin, expected: outputs[i]||'' }));
  return { platform: 'NewSite', title, url: href, examples };
};
```
3. Add `isSupportedUrl()` check in `popup.js`
4. Add a badge colour in `popup.css`

## CV Talking Points

- "Chrome Extension (Manifest V3) with a content script that uses layered
  DOM-scraping strategies to handle multiple competitive-programming platforms
  (AtCoder supports both English and Japanese 入力例/出力例 labels)"
- "Communicates across extension contexts (content → popup → background service worker)
  via the Chrome message bus"
- "Avoids CORS entirely by encoding test-case data as base64 URL params;
  React frontend decodes them with URLSearchParams on load and cleans the URL"
- "Persists preferred language across sessions with chrome.storage.local"
