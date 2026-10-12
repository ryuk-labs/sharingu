# Contributing

The product is `engine/` (the worker: pages, API, MCP door). How a change is built is in [`AGENTS.md`](AGENTS.md)
§"How we build": one sprint branch, vertical slices, a smoke per slice, one review and the full suites at sprint end.

- Run the local app: `npm install`, then `sh tools/dev-local.sh up` from `engine/`.
- Prove a slice: `sh tools/smoke.sh` from `engine/`.
- Change the door's contract: [`contracts/README.md`](contracts/README.md).

Installing, joining an org, or standing one up: [`docs/INSTALL.md`](docs/INSTALL.md).
Security reports: [`SECURITY.md`](SECURITY.md). License: MIT ([`LICENSE`](LICENSE)).
