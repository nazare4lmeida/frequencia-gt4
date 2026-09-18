---
name: testing-frequencia-feedback
description: Run local attendance and later-feedback browser tests for frequencia-gt4, preserving the real Express routes.
---

# Local runtime setup

- Export `PATH="$HOME/.nvm/versions/node/v24.19.0/bin:$PATH"` if npm is missing.
- Install backend dependencies with `npm ci` in `backend/`; frontend with
  `npm ci` in `frontend/` if missing.
- Run `node index.js` from `backend/` with Supabase/JWT environment variables.
  Express listens on 3001. Run `npm run dev -- --host 0.0.0.0` in `frontend/`.
- Browse **http://localhost:5173**, not 127.0.0.1: `Constants.js` only points
  hostname localhost to port 3001; other hosts use same-origin `/api`.
- Login takes registered email and birth date DD/MM/YYYY, not a conventional
  password. Professor login is determined by the `professores` table.
- Student home shows feedback for the most recent record with check_in in the
  feedback window. Professor home is Meu ponto; principal presence button
  records attendance without requiring an evaluation.
- Use separate normal/incognito windows to keep student and professor sessions.

# Isolated data and limitations

Prefer a test Supabase project. Do not change production data to satisfy test
conditions. If credentials are unavailable, get explicit permission before
substituting any backend/storage layer. To verify route logic without a database,
substitute only Supabase REST storage and retain the real Express server and
Supabase JS client, using environment variables rather than production edits.
Label recordings and findings as using synthetic storage; this does not prove SQL,
RLS, database constraints, or real deployment integration.

Seed a synthetic turma with today's calendar entry and an open check-in window.
Do not rely solely on MODO_TESTE: the student frontend checks actual calendar and
time windows in the returned cronograma. Online synthetic turmas avoid GPS setup.
Keep fixtures, stub scripts and logs outside the checkout.

# Proving partial updates

UI preloads existing fields and resends them, so editing only a star through UI
does not prove that a truly omitted field is preserved server-side. Pair UI edits
and full reloads with controlled PATCH calls in the authenticated browser context,
omitting the other properties, then inspect GET state and reload the visible UI.
Do not extract session cookies into shell requests.

Check empty input, out-of-range numeric values including fractions above five,
wrong role, and unauthorized turma. For double-click checks, count network PATCH
calls during a real UI double click; explicitly label any injected response delay.

## Devin Secrets Needed

- `SUPABASE_URL`: isolated test project URL.
- `SUPABASE_KEY`: key with access required by the backend.
- `JWT_SECRET`: isolated local signing secret.
- Test student/professor emails and birth dates must exist in their respective
  test tables. A Vercel preview may additionally require deployment access.
