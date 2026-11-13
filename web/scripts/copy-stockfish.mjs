// Copies the single-threaded lite Stockfish build into /public so it can run as a Web Worker.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = dirname(require.resolve("stockfish/package.json"));
const out = join(process.cwd(), "public", "stockfish");
mkdirSync(out, { recursive: true });
for (const f of ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"]) {
  const src = join(pkgDir, "bin", f);
  if (!existsSync(src)) throw new Error(`Missing ${src}`);
  copyFileSync(src, join(out, f));
}
