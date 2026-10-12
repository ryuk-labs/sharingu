# A doc that names what does not exist (tools/check-docs-selftest.py runs the check on it and wants exit 1)

Run `sh tools/no-such-script.sh`, read `src/no-such-module.js`, call `GET /no-such-route`, and ask your AI for
`no_such_tool`. It lands after `migrate-998` (commit `fedcba987`); see [the guide](no-such-doc.md).

```
node tools/no-such-tool.mjs --flag
```
