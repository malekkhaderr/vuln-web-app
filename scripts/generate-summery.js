const fs = require('fs');
const path = require('path');

const REPORTS_DIR = path.join(__dirname, '../reports');
const BASELINE_FILE = path.join(__dirname, '../security-baseline.json');

// Helper to safely read JSON files
function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error(`Warning: Could not parse ${filePath}`);
  }
  return null;
}

// 1. Read Baseline Config
const baselineData = readJson(BASELINE_FILE) || { baselines: {} };
const gitleaksBase = baselineData.baselines?.gitleaks?.allowed_count || 0;
const depsBase = baselineData.baselines?.dependencies?.allowed_count || 0;
const semgrepBase = baselineData.baselines?.semgrep?.allowed_count || 0;

// 2. Parse Raw Scanner Reports
const gitleaksData = readJson(path.join(REPORTS_DIR, 'gitleaks.json'));
const depsData = readJson(path.join(REPORTS_DIR, 'dependency-audit.json'));
const semgrepData = readJson(path.join(REPORTS_DIR, 'semgrep.json'));

// 3. Extract Counts
const gitleaksCount = Array.isArray(gitleaksData) ? gitleaksData.length : 0;

let depsCount = 0;
if (depsData && depsData.vulnerabilities) {
  depsCount = Object.keys(depsData.vulnerabilities).length;
} else if (depsData && depsData.metadata && depsData.metadata.vulnerabilities) {
  depsCount = depsData.metadata.vulnerabilities.total || 0;
}

const semgrepCount =
  semgrepData && Array.isArray(semgrepData.results)
    ? semgrepData.results.length
    : 0;

// 4. Calculate Deltas
function getStatus(count, base) {
  if (count > base) {
    return `DELTA (+${count - base})`;
  }
  return 'OK';
}

const gStatus = getStatus(gitleaksCount, gitleaksBase);
const dStatus = getStatus(depsCount, depsBase);
const sStatus = getStatus(semgrepCount, semgrepBase);

// 5. Generate Markdown Summary (reports/summary.md)
const markdownContent = `# 🛡️ Security Scan Summary Report

**Status:** \`REPORT ONLY\` (Non-Blocking)
**Execution Time:** ${new Date().toISOString()}

## Scanner Results & Baseline Deltas

| Check Type | Tool | Findings | Baseline Limit | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Secrets** | Gitleaks | ${gitleaksCount} | ${gitleaksBase} | **${gStatus}** |
| **Dependencies** | npm audit | ${depsCount} | ${depsBase} | **${dStatus}** |
| **Static Analysis (SAST)** | Semgrep | ${semgrepCount} | ${semgrepBase} | **${sStatus}** |

---

> ℹ️ **Note:** This build stage is configured in **Report-Only Mode**. No pipelines will be blocked by these findings until baseline enforcement is formally enabled.
`;

fs.writeFileSync(path.join(REPORTS_DIR, 'summary.md'), markdownContent);

// 6. Print 30-Second Terminal Dashboard to stdout
console.log(
  '\n======================================================================'
);
console.log('  KEYPER SECURITY SCAN REPORT (REPORT-ONLY MODE)');
console.log(
  '======================================================================'
);
console.log('  Status: OBSERVATION MODE (Zero Blocking)');
console.log(
  '----------------------------------------------------------------------'
);
console.log(
  '  %-15s | %-10s | %-10s | %-10s',
  'SCANNER',
  'FINDINGS',
  'BASELINE',
  'STATUS'
);
console.log(
  '----------------------------------------------------------------------'
);
console.log(
  '  %-15s | %-10d | %-10d | %-10s',
  'Gitleaks',
  gitleaksCount,
  gitleaksBase,
  gStatus
);
console.log(
  '  %-15s | %-10d | %-10d | %-10s',
  'npm audit',
  depsCount,
  depsBase,
  dStatus
);
console.log(
  '  %-15s | %-10d | %-10d | %-10s',
  'Semgrep',
  semgrepCount,
  semgrepBase,
  sStatus
);
console.log(
  '----------------------------------------------------------------------'
);
console.log('  Report summary written to reports/summary.md');
console.log(
  '======================================================================\n'
);
