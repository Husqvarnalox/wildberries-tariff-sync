# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.2.x | Yes |
| < 0.2 | No |

## Reporting a vulnerability

Use GitHub private vulnerability reporting: Security tab, then "Report a vulnerability". Do not open a public issue for exploitable problems.

Response targets: acknowledgement within 3 business days, an assessment within 10 business days, and a fix or mitigation plan communicated after that, depending on severity.

## Secret handling

- Never commit `.env`, Wildberries tokens or Google service-account keys.
- The Wildberries token is provided through the environment only (`WBTOKEN`).
- Mount the Google credentials file read-only; do not bake it into an image.
- The container runs as a non-root numeric user.
- Logs must not contain tokens; report any leak as a vulnerability.

## Dependencies

Dependabot proposes weekly updates for npm packages, GitHub Actions and Docker base images. Security updates should be merged promptly.

## Supply-chain hardening

The repository is protected against the "A10 / Contagious Interview" pattern, in which a stolen credential is used to force-push a forged commit that keeps the real tree and adds a loader. Controls:

- `main` and `v*` tags are governed by rulesets with no bypass actors: no force pushes, no deletion, pull requests only, required status checks (CI and `a10-guard`), signed commits.
- The `a10-guard` workflow (`.github/workflows/a10-guard.yml`, `.github/scripts/a10-guard.sh`) runs on every push and pull request. It never executes repository code and fails on: `.vscode/tasks.json` with `"runOn": "folderOpen"` or a task running `node` on a non-source path; font files (`*.woff`, `*.woff2`, `*.eot`, `*.ttf`, `*.otf`) without a real font signature, or any `fa-solid-*` font; `*.config.{js,mjs,cjs,ts}` larger than 4 KB or containing known indicators, `eth_call` with a public Ethereum RPC, `child_process` with `eval`/`new Function`, or base64/hex blobs longer than 2000 characters; npm lifecycle scripts (`preinstall`, `install`, `postinstall`, `prepare`) that run `node` on a local file or use `curl`/`wget`; commits whose author and committer time zones differ while the epochs are identical, or whose message contains CP437 mojibake.
- The default `GITHUB_TOKEN` is read-only; workflows run from fork pull requests require approval; `pull_request_target` is not used.
- Secret scanning with push protection, Dependabot alerts and security updates are enabled.

### Editor safety

Never auto-run tasks from a checkout you have not reviewed. Keep the VS Code user setting `"task.allowAutomaticTasks": "off"`, and treat any `.vscode/tasks.json` that appears in a pull request as suspicious: this repository does not ship one (`.vscode/` is git-ignored).

### Indicators of compromise

If any of the following appears in the repository, in a dependency, or in build output, treat the checkout as compromised and report it:

| Type | Indicator |
| --- | --- |
| Ethereum dead-drop wallet | `0xa322E5f3D311D3080e6f0121063e9aDC2490Ef1a` |
| Public RPC endpoints used for the dead-drop | `publicnode`, `drpc.org`, `blockscout`, `1rpc.io`; environment variable `INDEXER_URL` |
| C2 server | `193.247.144.38`, port 443 over plain HTTP, paths `/0x/cls` and `/0x/ls` |
| Payload carriers | `public/fonts/fa-solid-{400,500,600,700,900}.{woff,woff2,eot,ttf,otf}` that are JavaScript, launched by `.vscode/tasks.json` (`"runOn": "folderOpen"`, `"hide": true`, `"reveal": "never"`, for example `node ./public/fonts/fa-solid-600.eot`) |
| Padded config loaders | `postcss.config.mjs`, `vite.config.mjs`, Next, Tailwind, webpack or ESLint configs of roughly 13 to 35 KB with an obfuscated loader, executed on `next build` or `vite build`/`vite dev` |
| Forged commits | Author time zone `+0300` with committer time zone `-0700` and identical epoch, unsigned, message mangled by repeated UTF-8 to CP437 re-decoding (`Γ ╬ ╠ ╢ ╤ ╦ ╨ ╚ ║`) |

Do not run `npm install`, `npm run`, `node <file>` or a build on a suspect checkout; the payload executes at install or build time. Inspect with `git show`, `git grep`, `cat` and `xxd` only.

