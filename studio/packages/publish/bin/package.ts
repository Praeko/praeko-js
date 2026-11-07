#!/usr/bin/env node
// Usage (inside a project): node package.ts episodes/<slug> [--brand brand.json] [--output file.md]
// Reads <folder>/publication.json and writes texts.md (or --output). Exits with code 1 if the check finds an ERROR.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildPackage, validate } from "../src/index.ts";
import type { Brand, Publication } from "../src/index.ts";

const a = process.argv.slice(2), folder = a[0];
const opt = (k: string, d: string): string => { const i = a.indexOf("--" + k); return i >= 0 ? a[i + 1] ?? d : d; };
if (!folder) { console.error("usage: package.ts <episode-folder> [--brand brand.json] [--output file]"); process.exit(2); }
const brand: Brand = JSON.parse(readFileSync(opt("brand", "brand.json"), "utf8"));
const publication: Publication = JSON.parse(readFileSync(join(folder, "publication.json"), "utf8"));
const output = opt("output", join(folder, "texts.md"));
writeFileSync(output, buildPackage({ brand, publication }));
const v = validate({ brand, publication });
console.log(`wrote ${output}; ${v.errors.length} error(s), ${v.warnings.length} warning(s)`);
v.errors.forEach((e) => console.log("  ERROR:", e));
v.warnings.forEach((e) => console.log("  warning:", e));
process.exit(v.errors.length ? 1 : 0);
