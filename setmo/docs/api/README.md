# SetMo Partner API docs (Mintlify)

This folder is the Mintlify site for the Partner API (Team Care and future integration partners).

| Path | What it is |
|---|---|
| `docs.json` | Site settings and navigation |
| `index.mdx`, `quickstart.mdx`, `guides/` | The guides |
| `openapi.yaml` | The API reference, which Mintlify renders, plus the session webhook |
| `api-reference/session-event.mdx` | The webhook page, generated from `openapi.yaml` |

## Preview locally

```bash
cd setmo/docs/api
npx mint dev            # http://localhost:3000
npx mint validate       # strict build + rules
npx mint broken-links
```

## Publish

In the Mintlify dashboard:
1. Connect this GitHub repo.
2. Under Git Settings, turn on **docs.json is in a subdirectory** and enter `/setmo/docs/api`.
3. Add the custom domain (for example `docs.setmo.growdental.ai`), then add the DNS records it shows.

Every push to `main` that changes this folder redeploys the site.

## Keep it true

When the API changes, update `openapi.yaml` and the guide that covers that change in the same commit. The code lives in:
- `src/app/api/v1`
- `src/lib/partner-*.ts`
- `src/components/embed`

The site is set to `noindex`; partners get the link directly.
