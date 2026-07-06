#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAINNET_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const DEVNET_USDC_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const KNOWN_DEVNET_PROGRAM_IDS = new Set([
  "Fp8b6p287TL5oPMwLVdwGys5phHNLcmTKNvVoGdCJS6g",
]);
const KNOWN_DEVNET_SQUADS = new Set([
  "HEzTX4LNQ7cjrXTt1vKXyEZGtc94TKRUc9kWNFexJSGz",
]);
const PRODUCTION_DOMAINS = new Set(["bunkercash.com", "www.bunkercash.com"]);
const VALID_ENVS = new Set(["dev", "staging", "production"]);
const VALID_CLUSTERS = new Set(["devnet", "testnet", "mainnet-beta"]);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--app") out.app = argv[++i];
    else if (arg === "--env") out.env = argv[++i];
  }
  return out;
}

function stripJsonComments(source) {
  let out = "";
  let inString = false;
  let quote = "";
  let escaped = false;

  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1];

    if (inString) {
      out += char;
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = "";
      }
      continue;
    }

    if (char === "\"" || char === "'") {
      inString = true;
      quote = char;
      out += char;
      continue;
    }

    if (char === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      out += "\n";
      continue;
    }

    if (char === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        i += 1;
      }
      i += 1;
      continue;
    }

    out += char;
  }

  return out;
}

function parseJsonc(filePath) {
  const withoutComments = stripJsonComments(readFileSync(filePath, "utf8"));
  return JSON.parse(withoutComments.replace(/,\s*([}\]])/g, "$1"));
}

function die(message) {
  console.error(`deploy preflight failed: ${message}`);
  process.exit(1);
}

function isPlaceholder(value) {
  return !value || /REPLACE|TODO|YOUR_/i.test(value);
}

function routePatterns(config) {
  return (config.routes ?? []).map((route) =>
    typeof route === "string" ? route : route.pattern,
  );
}

function collectBindingIds(config, bindingName) {
  return (config[bindingName] ?? [])
    .flatMap((entry) => [entry.id, entry.preview_id, entry.database_id])
    .filter(Boolean);
}

function assertPublicKeyLike(value, label) {
  if (isPlaceholder(value) || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    die(`${label} must be a real base58 public key`);
  }
}

function assertUuidLike(value, label) {
  if (
    isPlaceholder(value) ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  ) {
    die(`${label} must be a real UUID`);
  }
}

function assertNoProductionRoutes(config, envName) {
  const forbidden = routePatterns(config).filter((pattern) =>
    PRODUCTION_DOMAINS.has(pattern),
  );
  if (forbidden.length > 0) {
    die(`${envName} config must not route production domains: ${forbidden.join(", ")}`);
  }
}

function assertProductionConfig(config, allEnvs, appName) {
  const vars = config.vars ?? {};
  const cluster = vars.NEXT_PUBLIC_SOLANA_CLUSTER ?? vars.NEXT_PUBLIC_CLUSTER;
  const rpc = vars.NEXT_PUBLIC_SOLANA_RPC_URL ?? "";
  const usdcMint = vars.NEXT_PUBLIC_USDC_MINT ?? "";
  const programId = vars.NEXT_PUBLIC_BUNKERCASH_PROGRAM_ID ?? "";
  const squadsMultisig = vars.NEXT_PUBLIC_SQUADS_MULTISIG_PUBKEY ?? "";

  if (vars.NEXT_PUBLIC_DEPLOY_ENV !== "production") {
    die("production config must set NEXT_PUBLIC_DEPLOY_ENV=production");
  }
  if (cluster !== "mainnet-beta" || vars.NEXT_PUBLIC_CLUSTER !== "mainnet-beta") {
    die("production config must set both cluster vars to mainnet-beta");
  }
  if (!rpc || /devnet|testnet|localhost|127\.0\.0\.1/i.test(rpc)) {
    die("production RPC must be a mainnet endpoint, not devnet/testnet/local");
  }
  if (usdcMint !== MAINNET_USDC_MINT) {
    die(`production USDC mint must be canonical mainnet USDC ${MAINNET_USDC_MINT}`);
  }
  assertPublicKeyLike(programId, "production program id");
  if (KNOWN_DEVNET_PROGRAM_IDS.has(programId)) {
    die("production program id is the known devnet program id");
  }
  assertPublicKeyLike(squadsMultisig, "production Squads multisig");
  if (KNOWN_DEVNET_SQUADS.has(squadsMultisig)) {
    die("production Squads multisig is the known devnet multisig");
  }

  if (appName === "web") {
    const productionRoutes = new Set(routePatterns(config));
    for (const domain of PRODUCTION_DOMAINS) {
      if (!productionRoutes.has(domain)) {
        die(`production web config must include ${domain}`);
      }
    }
  }

  const prodKvIds = collectBindingIds(config, "kv_namespaces");
  const prodD1Ids = collectBindingIds(config, "d1_databases");
  for (const id of prodKvIds) assertUuidLike(id, "production KV id");
  for (const id of prodD1Ids) assertUuidLike(id, "production D1 id");

  const nonProdIds = new Set();
  for (const [name, envConfig] of Object.entries(allEnvs)) {
    if (name === "production") continue;
    collectBindingIds(envConfig, "kv_namespaces").forEach((id) => nonProdIds.add(id));
    collectBindingIds(envConfig, "d1_databases").forEach((id) => nonProdIds.add(id));
  }
  for (const id of [...prodKvIds, ...prodD1Ids]) {
    if (nonProdIds.has(id)) {
      die(`production binding id ${id} is reused by a non-production environment`);
    }
  }
}

function assertNonProductionConfig(config, envName) {
  const vars = config.vars ?? {};
  const cluster = vars.NEXT_PUBLIC_SOLANA_CLUSTER ?? vars.NEXT_PUBLIC_CLUSTER;

  assertNoProductionRoutes(config, envName);
  if (vars.NEXT_PUBLIC_DEPLOY_ENV !== envName) {
    die(`${envName} config must set NEXT_PUBLIC_DEPLOY_ENV=${envName}`);
  }
  if (!VALID_CLUSTERS.has(cluster)) {
    die(`${envName} config has missing or invalid Solana cluster`);
  }
  if (envName !== "production" && cluster === "mainnet-beta") {
    die(`${envName} config must not point at mainnet-beta`);
  }
  if (vars.NEXT_PUBLIC_USDC_MINT === MAINNET_USDC_MINT) {
    die(`${envName} config must not use canonical mainnet USDC`);
  }
  if (envName === "dev" && vars.NEXT_PUBLIC_USDC_MINT !== DEVNET_USDC_MINT) {
    die("dev config must use the canonical devnet USDC mint");
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.app || !["web", "admin"].includes(args.app)) {
  die("--app must be web or admin");
}
if (!args.env || !VALID_ENVS.has(args.env)) {
  die("--env must be dev, staging, or production");
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "apps", args.app, "wrangler.jsonc");
const config = parseJsonc(wranglerPath);
const envConfig = config.env?.[args.env];
if (!envConfig) {
  die(`${args.app} wrangler config is missing env.${args.env}`);
}

assertNoProductionRoutes(config, "top-level");
if (args.env === "production") {
  assertProductionConfig(envConfig, config.env ?? {}, args.app);
} else {
  assertNonProductionConfig(envConfig, args.env);
}

console.log(`deploy preflight passed: ${args.app}/${args.env}`);
