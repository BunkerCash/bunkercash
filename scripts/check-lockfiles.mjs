import { existsSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();

const policy = [
  {
    workspace: "ts",
    required: ["bun.lock"],
    forbidden: ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"],
  },
  {
    workspace: "rs",
    required: ["package-lock.json"],
    forbidden: ["bun.lock", "yarn.lock", "pnpm-lock.yaml"],
  },
];

const failures = [];

for (const entry of policy) {
  for (const file of entry.required) {
    if (!existsSync(join(root, entry.workspace, file))) {
      failures.push(`${entry.workspace}: missing required lockfile ${file}`);
    }
  }

  for (const file of entry.forbidden) {
    if (existsSync(join(root, entry.workspace, file))) {
      failures.push(`${entry.workspace}: forbidden lockfile present: ${file}`);
    }
  }
}

if (failures.length > 0) {
  console.error("Lockfile policy failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Lockfile policy passed.");

