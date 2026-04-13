#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

function getTrackedFiles() {
  const stdout = execFileSync("git", ["ls-files", "-z"], {
    encoding: "utf8",
  });

  return stdout.split("\0").filter(Boolean);
}

function isByte(value) {
  return Number.isInteger(value) && value >= 0 && value <= 255;
}

function looksLikeSolanaSecretKey(parsed) {
  if (Array.isArray(parsed)) {
    return (parsed.length === 32 || parsed.length === 64) && parsed.every(isByte);
  }

  if (parsed && typeof parsed === "object" && Array.isArray(parsed.secretKey)) {
    const { secretKey } = parsed;
    return (secretKey.length === 32 || secretKey.length === 64) && secretKey.every(isByte);
  }

  return false;
}

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).trim();

process.chdir(repoRoot);

const dangerousPathPattern =
  /(^|\/)(id\.json|.*keypair.*\.json|.*wallet.*\.json|keypairs\/.*\.json|wallets\/.*\.json|secrets\/.*\.json)$/i;

const findings = [];

for (const file of getTrackedFiles()) {
  if (!file.endsWith(".json")) {
    continue;
  }

  const normalizedPath = file.replaceAll(path.sep, "/");
  let reason = dangerousPathPattern.test(normalizedPath) ? "dangerous filename/path" : null;

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (looksLikeSolanaSecretKey(parsed)) {
      reason = reason ?? "JSON content looks like a Solana secret key";
    }
  } catch {
    continue;
  }

  if (reason) {
    findings.push({ file, reason });
  }
}

if (findings.length > 0) {
  console.error("Tracked keypair-like JSON files detected:");
  for (const finding of findings) {
    console.error(`- ${finding.file}: ${finding.reason}`);
  }
  console.error("");
  console.error("Move live wallets outside the repository and rotate any exposed keys.");
  process.exit(1);
}

console.log("No tracked keypair-like JSON files found.");
