// Type-check an app with TypeScript (no emit). Node strips types without checking them, so a wrong
// import or a typo only shows up when that code runs; tsc finds it before anyone opens the page.
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { projectDir } from "./projects.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface TsError {
  file: string;
  line: number;
  code: string;
  message: string;
}

/** Codes that break the app at runtime, not just its types: missing exports/modules, unknown names. */
const RUNTIME = new Set(["TS2305", "TS2307", "TS2304", "TS2552", "TS2724", "TS2614", "TS2339", "TS2551", "TS2554", "TS2349"]);

export async function typecheck(slug: string): Promise<{ ok: boolean; report: string }> {
  const dir = projectDir(slug);
  const tsc = path.join(root, "node_modules", "typescript", "bin", "tsc");
  if (!fs.existsSync(tsc)) throw new Error("TypeScript is not installed next to Mohit. Run npm install in the Mohit folder.");
  if (!fs.existsSync(path.join(dir, "tsconfig.json"))) throw new Error("This app has no tsconfig.json.");
  const started = Date.now();
  const output = await new Promise<string>((resolve, reject) =>
    execFile(
      process.execPath,
      [tsc, "--noEmit", "--pretty", "false", "-p", dir],
      { cwd: dir, timeout: 180_000, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      (err, stdout, stderr) => {
        if (err && (err as NodeJS.ErrnoException & { killed?: boolean }).killed) reject(new Error("Type check took longer than 3 minutes and was stopped."));
        else resolve(`${stdout}${stderr}`);
      },
    ),
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  const errors: TsError[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^(.+?)\((\d+),\d+\): error (TS\d+): (.*)$/.exec(line);
    if (m) {
      const file = path.relative(dir, path.resolve(dir, m[1])).replaceAll("\\", "/");
      errors.push({ file, line: Number(m[2]), code: m[3], message: m[4] });
    } else if (/^\s+\S/.test(line) && errors.length && errors.at(-1)!.message.length < 400) {
      errors.at(-1)!.message += ` ${line.trim()}`; // continuation of the previous message
    }
  }
  // Platform files are Mohit's; their errors are not the app author's to fix.
  const own = errors.filter((e) => !e.file.startsWith("server/platform/"));
  if (!own.length) return { ok: true, report: `No type errors in src/ and server/ (${seconds}s).` };

  const runtime = own.filter((e) => RUNTIME.has(e.code));
  const rank = (e: TsError) => (RUNTIME.has(e.code) ? 0 : 2) + (e.file.startsWith("src/") ? 0 : 1);
  const shown = [...own].sort((a, b) => rank(a) - rank(b)).slice(0, 40);
  const byArea = (p: string) => own.filter((e) => e.file.startsWith(p)).length;
  const lines = shown.map((e) => `${e.file}:${e.line}  ${e.code}  ${e.message.length > 300 ? e.message.slice(0, 300) + "…" : e.message}`);
  return {
    ok: false,
    report:
      `${own.length} type error${own.length === 1 ? "" : "s"} (${byArea("src/")} in src/, ${byArea("server/")} in server/) in ${seconds}s.` +
      (runtime.length ? ` ${runtime.length} will break at runtime (missing exports, unknown names, wrong calls): fix those first.` : "") +
      `\n${lines.join("\n")}${own.length > shown.length ? `\n…and ${own.length - shown.length} more.` : ""}`,
  };
}
