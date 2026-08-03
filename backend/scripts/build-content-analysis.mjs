/**
 * Bundles the content-analysis Lambda into a deployable zip.
 *
 * Builds backend/src/functions/content-analysis/handler.ts into a single
 * self-contained CommonJS bundle (deps inlined, AWS SDK as external for the
 * Node runtime), then zips it with a package.json for the Node 22 runtime.
 *
 * Output: backend/dist-function/content-analysis.zip
 */
import { build } from "esbuild";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, "..");
const outDir = join(backendDir, "dist-function");
const zipPath = join(outDir, "content-analysis.zip");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const entry = join(backendDir, "src/functions/content-analysis/handler.ts");

await build({
  entryPoints: [entry],
  outfile: join(outDir, "index.js"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  // AWS SDK v3 is available in the Lambda Node runtime; keep it external so
  // the bundle stays small and uses the runtime-managed SDK.
  external: [
    "@aws-sdk/client-bedrock-runtime",
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
  ],
  sourcemap: false,
  minify: false,
});

// package.json marking the handler entry (ESM-loaded via .mjs not needed; CJS).
writeFileSync(
  join(outDir, "index.json"),
  JSON.stringify({ entry: "index.js" }, null, 2),
);

// Source markers for reproducibility (not deployed).
writeFileSync(
  join(outDir, "contracts.json"),
  JSON.stringify({ handler: "handler.handler", builtAt: new Date().toISOString() }, null, 2),
);

execFileSync("zip", ["-r", zipPath, "index.js"], { cwd: outDir, stdio: "inherit" });
process.stdout.write(`Built ${zipPath}\n`);
