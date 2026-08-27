/**
 * Bundles the analytics Lambda functions into deployable zips.
 *
 * Builds each handler.ts under src/functions/analytics/ into a self-contained
 * CommonJS bundle (deps inlined, AWS SDK as external for the Node runtime).
 *
 * Output:
 *   backend/dist-function/analytics-dump-rds.zip
 *   backend/dist-function/analytics-start-emr.zip
 *   backend/dist-function/analytics-load-results.zip
 */
import { build } from "esbuild";
import { mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const outDir = join(backendDir, "dist-function");

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const functions = [
  { name: "analytics-dump-rds", entry: "src/functions/analytics/dump-rds/handler.ts" },
  { name: "analytics-start-emr", entry: "src/functions/analytics/start-emr/handler.ts" },
  { name: "analytics-load-results", entry: "src/functions/analytics/load-results/handler.ts" },
];

// AWS SDK v3 packages used by the analytics Lambdas
const sdkExternals = [
  "@aws-sdk/client-emr",
  "@aws-sdk/client-s3",
  "@aws-sdk/client-lambda",
];

for (const fn of functions) {
  const entry = join(backendDir, fn.entry);
  const outfile = join(outDir, `${fn.name}.js`);
  const zipPath = join(outDir, `${fn.name}.zip`);

  process.stdout.write(`Building ${fn.name}...\n`);

  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: "node",
    target: "node22",
    format: "cjs",
    external: sdkExternals,
    sourcemap: false,
    minify: false,
  });

  execFileSync("zip", ["-r", zipPath, `${fn.name}.js`], { cwd: outDir, stdio: "inherit" });
  process.stdout.write(`Built ${zipPath}\n`);
}

process.stdout.write("All analytics Lambda functions built.\n");