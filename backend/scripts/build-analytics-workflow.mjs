/**
 * Bundles the analytics Step Functions callback Lambda.
 *
 * Output: backend/dist-function/analytics-workflow.zip
 */
import { build } from "esbuild";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = join(scriptDir, "..");
const outDir = join(backendDir, "dist-function", "analytics-workflow");
const zipPath = join(backendDir, "dist-function", "analytics-workflow.zip");

rmSync(outDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(outDir, { recursive: true });

await build({
  entryPoints: [join(backendDir, "src/functions/analytics-workflow/handler.ts")],
  outfile: join(outDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  external: ["@aws-sdk/client-athena", "@aws-sdk/client-secrets-manager"],
  sourcemap: false,
  minify: false,
});

execFileSync("zip", ["-j", zipPath, join(outDir, "index.js")], { stdio: "inherit" });
process.stdout.write(`Built ${zipPath}\n`);
