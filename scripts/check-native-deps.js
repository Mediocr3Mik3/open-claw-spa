#!/usr/bin/env node
/**
 * Postinstall checker for native addon dependencies.
 * Attempts to load keytar and better-sqlite3 and prints a helpful message
 * if either fails. Exits 0 regardless (non-fatal — don't block installs
 * for users who don't need the Electron app).
 *
 * Idempotent — safe to run at any time.
 */

const os = require("os");

const deps = [
  { name: "keytar", description: "OS keychain access (secure key storage)" },
  { name: "better-sqlite3", description: "SQLite database (audit log, spend tracking)" },
];

let allOk = true;

for (const dep of deps) {
  try {
    require(dep.name);
    console.log(`  \x1b[32m✔\x1b[0m ${dep.name} — loaded`);
  } catch (err) {
    allOk = false;
    console.log(`  \x1b[31m✘\x1b[0m ${dep.name} — ${dep.description}`);
    console.log(`    Native addon failed to load: ${err.message?.split("\n")[0] ?? err}`);
  }
}

if (!allOk) {
  console.log("");
  console.log("  \x1b[33m⚠  One or more native addons could not load.\x1b[0m");
  console.log("  This is expected after a fresh install — native addons must be");
  console.log("  compiled against Electron's Node.js version.\n");

  if (os.platform() === "win32") {
    console.log("  \x1b[36mWindows:\x1b[0m Run as Administrator:");
    console.log("    npm run setup:win\n");
  } else {
    console.log("  \x1b[36mmacOS / Linux:\x1b[0m");
    console.log("    npm run setup:unix\n");
  }

  console.log("  This will reinstall dependencies and rebuild native addons");
  console.log("  against the correct Electron Node.js ABI.\n");
}

// Always exit 0 — don't block installs for users who don't need Electron
process.exit(0);
