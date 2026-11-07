// Fonte única do repositório PÚBLICO do código-cliente (SDK + CLI). Renomear o repositório = mudar SÓ esta linha e rodar
// `node scripts/exportar-publico.mjs --sincronizar-package-json` (reescreve repository/bugs dos dois package.json); o teste de exportação confere que bate.
export const REPO_PUBLICO = "Praeko/praeko-js";   // PROPOSTA de nome: confirme antes de criar o repositório no GitHub
export const URL_REPO = `git+https://github.com/${REPO_PUBLICO}.git`;
export const URL_ISSUES = `https://github.com/${REPO_PUBLICO}/issues`;
export const URL_HOME = "https://praeko.app/docs";
