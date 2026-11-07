#!/usr/bin/env node
// `praeko <comando>`: o serviço (posts, fila, canais, chaves…). `praeko studio <comando>` entrega ao Praeko Studio (@praeko/studio), instalado à parte (src/studio.ts).
import { executarCli } from "./cli.ts";
import { delegarStudio } from "./studio.ts";

const args = process.argv.slice(2);
if (args[0] === "studio") process.exit(delegarStudio(args.slice(1)));
process.exit(await executarCli(args));
