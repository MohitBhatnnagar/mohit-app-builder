// npm packages. Apps share Mohit's node_modules, so a package installed
// once is available to every app. Each app's package.json records what it uses.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, projectDir } from "./projects.ts";

/** Pre-installed for every app, beyond react, react-dom, express and vite. */
export const BUILTIN_PACKAGES: Record<string, string> = {
  "react-router": "client-side routing (BrowserRouter, Routes, Route, Link, useNavigate)",
  recharts: "charts (LineChart, BarChart, PieChart, AreaChart, ResponsiveContainer)",
  "lucide-react": "icons (import { Plus, Trash2 } from 'lucide-react')",
  "date-fns": "date formatting and maths (format, addDays, formatDistanceToNow)",
  zod: "validation schemas, also used by aiJson",
  clsx: "conditional class names",
  marked: "Markdown to HTML",
};

const NAME_RE = /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const VERSION_RE = /^[0-9a-z.^~<>=*|\s-]+$/i;

function npm(args: string[]): string {
  // Run npm's JS entry with this Node, avoiding Windows .cmd shims.
  const cli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  const [cmd, full] = fs.existsSync(cli) ? [process.execPath, [cli, ...args]] : ["npm", args];
  return execFileSync(cmd, full, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
    shell: cmd === "npm" && process.platform === "win32",
    timeout: 180_000,
  }).trim();
}

export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  firstPublished: string;
}

export function addPackage(slug: string, spec: string): PackageInfo {
  const dir = projectDir(slug);
  const at = spec.lastIndexOf("@");
  const [name, range] = at > 0 ? [spec.slice(0, at), spec.slice(at + 1)] : [spec, ""];
  if (!NAME_RE.test(name)) throw new Error(`"${name}" is not a valid npm package name.`);
  if (range && !VERSION_RE.test(range)) throw new Error(`"${range}" is not a valid version range.`);

  let info: { name: string; version: string; description?: string; time?: Record<string, string> };
  try {
    info = JSON.parse(npm(["view", range ? `${name}@${range}` : name, "name", "version", "description", "time.created", "--json"]));
    if (Array.isArray(info)) info = info[info.length - 1];
  } catch {
    throw new Error(`Package "${spec}" was not found on npm. Check the spelling.`);
  }

  // --ignore-scripts: never run a package's install scripts on the user's PC.
  npm(["install", `${info.name}@${range || info.version}`, "--save", "--ignore-scripts", "--no-audit", "--no-fund"]);

  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies = { ...(pkg.dependencies ?? {}), [info.name]: `^${info.version}` };
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  const created = (info as { "time.created"?: string })["time.created"];
  return {
    name: info.name,
    version: info.version,
    description: info.description ?? "",
    firstPublished: created ? created.slice(0, 10) : "unknown",
  };
}
