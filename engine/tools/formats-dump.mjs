// tools/formats-dump.mjs — prints every answer of the `formats` read (src/formats.js formatsAll: the list, every kind and
// every shape, generated from the two registries) as one JSON object on stdout. tools/make-door-contract.py runs it, so the
// contract's `formats` section is generated from the same registries the door validates with: never typed by hand.
//   node tools/formats-dump.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
const ENGINE = dirname(dirname(fileURLToPath(import.meta.url)));
const { formatsAll } = await import(pathToFileURL(join(ENGINE, "src", "formats.js")).href);
process.stdout.write(JSON.stringify(formatsAll()));
