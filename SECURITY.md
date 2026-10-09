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
