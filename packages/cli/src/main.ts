#!/usr/bin/env node
// `praeko <command>`: the service (posts, queue, channels, keys…). `praeko studio <command>` hands over to Praeko Studio (@praeko/studio), installed separately (src/studio.ts).
import { runCli } from "./cli.ts";
import { delegateToStudio } from "./studio.ts";

const args = process.argv.slice(2);
if (args[0] === "studio") process.exit(delegateToStudio(args.slice(1)));
process.exit(await runCli(args));
