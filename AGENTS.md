# Repository Guidelines

## Project Structure & Module Organization

- `frontend/`: Static SPA (vanilla `index.html`, `style.css`, `app.js`). By default it calls the same-origin API at `/api`.
- `apps/server/`: Node.js + Express API, also serves `frontend/` as static assets and exposes chapter/question endpoints plus Markdown upload.
- `apps/importer/`: Python offline importer (Markdown/JSON ↔ Supabase). Entry point: `python -m apps.importer.cli`.
- `md/`: Source question-bank Markdown files (recommended naming: `第05章-信息系统工程.md`).
- `json_exports/`: Generated JSON exports / intermediate artifacts.
- `.env.example` / `.env`: Local configuration (used by server/importer only).

## Build, Test, and Development Commands

- Create local env: `cp .env.example .env` (PowerShell: `Copy-Item .env.example .env`), then set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, optional `API_PORT`.
- Run API + frontend: `cd apps/server && npm install && npm run dev` (prod-like: `npm start`). Default: `http://localhost:3000/`.
- Run importer: `pip install supabase python-dotenv beautifulsoup4`, then from repo root: `python -m apps.importer.cli`.
- Frontend-only (no server): open `frontend/index.html` and ensure `API_BASE` points to a running API if needed.

## Coding Style & Naming Conventions

- JavaScript (`apps/server/`, `frontend/`): 4-space indentation, single quotes, keep semicolons. Keep routes thin (`apps/server/routes/`), put business logic in `services/`, and data access in `repositories/`.
- Python (`apps/importer/`): 4-space indentation, prefer type hints and clear function prefixes like `parse_*`, `normalize_*`, `import_*`.
- Data naming: chapter files should match `第NN章-*.md` / `第NN章-*.json` so the tools can derive `code=chNN`.

## Testing Guidelines

No automated test suite is configured yet. Before opening a PR, do a quick smoke check:
- Start the server and verify `GET /api/health` and `GET /api/chapters`.
- If you touched parsing/upsert logic, validate with a small chapter Markdown via importer or `POST /api/upload/markdown`, then fetch questions via `GET /api/questions?chapter=chNN`.

## Commit & Pull Request Guidelines

- Git history is minimal; the existing message uses Chinese descriptive text with a colon. Keep messages short and scoped, e.g. `server: 修复上传解析` / `frontend: 优化错题模式`.
- PRs should include: what changed, how to verify (commands/endpoints), affected area (frontend/server/importer), and screenshots for UI changes. Call out any schema or Supabase configuration expectations explicitly.

## Security & Configuration Tips

- Never commit `.env`, Service Role keys, or project secrets; update `.env.example` instead.
- Service Role keys must stay on the server/importer side. If the frontend ever needs direct Supabase access, use an anon key and enforce RLS.
