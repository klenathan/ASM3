/**
 * Bundles the analytics Step Functions callback Lambda.
 *
 * Output: backend/dist-function/analytics-workflow.zip
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const backendDir = join(scriptDir, "..");
const outDir = join(backendDir, "dist-function", "analytics-workflow");
const zipPath = join(backendDir, "dist-function", "analytics-workflow.zip");
const rdsCaBundleUrl = process.env.RDS_CA_BUNDLE_URL
  ?? "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem";

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

const rdsCaResponse = await fetch(rdsCaBundleUrl);
if (!rdsCaResponse.ok) {
  throw new Error(`failed to download RDS CA bundle: ${rdsCaResponse.status} ${rdsCaResponse.statusText}`);
}
const rdsCaBundle = Buffer.from(await rdsCaResponse.arrayBuffer());
if (!rdsCaBundle.toString("utf8").includes("BEGIN CERTIFICATE")) {
  throw new Error("downloaded RDS CA bundle is not a PEM certificate bundle");
}
writeFileSync(join(outDir, "rds-global-bundle.pem"), rdsCaBundle);

execFileSync(
  "zip",
  ["-j", zipPath, join(outDir, "index.js"), join(outDir, "rds-global-bundle.pem")],
  { stdio: "inherit" },
);
process.stdout.write(`Built ${zipPath}\n`);
