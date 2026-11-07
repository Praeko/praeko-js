// Single source of truth for the PUBLIC repository of the client code (SDK + CLI + Studio). Renaming the repository = change ONLY this line and run
// `node scripts/export-public.mjs --sync-package-json` (rewrites repository/bugs in the package.json files); the export test checks that they match.
export const PUBLIC_REPO = "Praeko/praeko-js";   // PROPOSED name: confirm before creating the repository on GitHub
export const REPO_URL = `git+https://github.com/${PUBLIC_REPO}.git`;
export const ISSUES_URL = "https://praeko.app/docs"; // `bugs.url` field: GitHub issues are off (support by e-mail and through the docs), so it does not point to /issues
export const HOME_URL = "https://praeko.app/docs";
