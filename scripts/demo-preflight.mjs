import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiBase = process.env.VITE_API_BASE_URL || "http://localhost:4173";

function check(label, condition, detailIfFail) {
  if (condition) {
    console.log(`PASS  ${label}`);
    return true;
  }

  console.error(`FAIL  ${label}${detailIfFail ? ` - ${detailIfFail}` : ""}`);
  return false;
}

const checks = [];

checks.push(
  check("README present", existsSync(path.join(root, "README.md")), "README.md is missing"),
);
checks.push(
  check("SPEC present", existsSync(path.join(root, "SPEC.md")), "SPEC.md is missing"),
);
checks.push(
  check(
    "Submission draft present",
    existsSync(path.join(root, "SUBMISSION_DRAFT.md")),
    "SUBMISSION_DRAFT.md is missing",
  ),
);
checks.push(
  check(
    "Demo script present",
    existsSync(path.join(root, "DEMO_SCRIPT.md")),
    "DEMO_SCRIPT.md is missing",
  ),
);
checks.push(
  check(
    "Demo checklist present",
    existsSync(path.join(root, "DEMO_CHECKLIST.md")),
    "DEMO_CHECKLIST.md is missing",
  ),
);
checks.push(
  check(
    "Demo storyboard present",
    existsSync(path.join(root, "DEMO_STORYBOARD.md")),
    "DEMO_STORYBOARD.md is missing",
  ),
);

const readme = existsSync(path.join(root, "README.md"))
  ? readFileSync(path.join(root, "README.md"), "utf8")
  : "";
const submission = existsSync(path.join(root, "SUBMISSION_DRAFT.md"))
  ? readFileSync(path.join(root, "SUBMISSION_DRAFT.md"), "utf8")
  : "";
const spec = existsSync(path.join(root, "SPEC.md"))
  ? readFileSync(path.join(root, "SPEC.md"), "utf8")
  : "";
const demoScript = existsSync(path.join(root, "DEMO_SCRIPT.md"))
  ? readFileSync(path.join(root, "DEMO_SCRIPT.md"), "utf8")
  : "";

checks.push(
  check(
    "README describes live-only review flow",
    readme.includes("live-only"),
    "README should mention the default live-only review flow",
  ),
);
checks.push(
  check(
    "Submission draft mentions internal demo fallback",
    submission.includes("internal demo fallback"),
    "SUBMISSION_DRAFT.md should explain the sample backdoor honestly",
  ),
);
checks.push(
  check(
    "Spec documents demo sample query",
    spec.includes("demo=sample"),
    "SPEC.md should include the explicit demo sample query",
  ),
);
checks.push(
  check(
    "Demo script includes backup path",
    demoScript.includes("Backup Demo Path"),
    "DEMO_SCRIPT.md should include the internal backup flow",
  ),
);

checks.push(
  check(
    "Review signing helper present",
    existsSync(path.join(root, "src", "lib", "review-signing.ts")),
    "src/lib/review-signing.ts is missing",
  ),
);
checks.push(
  check(
    "Wallet connect component present",
    existsSync(path.join(root, "src", "components", "wallet-connect-button.tsx")),
    "src/components/wallet-connect-button.tsx is missing",
  ),
);

checks.push(
  check(
    "Review ledger path exists or can be created",
    existsSync(path.join(root, "server", "state")) || existsSync(path.join(root, "server")),
    "server/state path is unavailable",
  ),
);

async function checkApiBase() {
  try {
    const response = await fetch(`${apiBase}/api/config`);
    return check(
      "API base responds to /api/config",
      response.ok,
      `Expected Creator Token Risk Copilot API at ${apiBase}, got HTTP ${response.status}`,
    );
  } catch (error) {
    return check(
      "API base responds to /api/config",
      false,
      `Expected Creator Token Risk Copilot API at ${apiBase}, got ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

checks.push(await checkApiBase());

if (checks.every(Boolean)) {
  console.log("Demo preflight passed.");
  process.exit(0);
}

console.error("Demo preflight failed.");
process.exit(1);
