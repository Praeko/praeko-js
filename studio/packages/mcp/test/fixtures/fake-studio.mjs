// A stand-in for the Studio CLI used by the job tests: behavior chosen by the episode name (argv[1]). Never touches the network.
const [cmd, slug] = process.argv.slice(2);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(`fake ${cmd} ${slug}`);
for (const f of ["--carousel", "--image", "--long"]) if (process.argv.includes(f)) console.log(`flag ${f}`);
if (slug === "slow") { console.log("working..."); await wait(60_000); }
else if (slug === "leaky") { console.log(`using key ${process.env.ELEVENLABS_API_KEY} and Bearer abcdefghijklmnop12345`); console.error(`also ${process.env.PRAEKO_KEY}`); }
else if (slug === "fails") { console.error("boom"); process.exit(3); }
else if (slug === "noisy") { for (let i = 0; i < 1000; i++) console.log("line " + i); }
else await wait(50);
