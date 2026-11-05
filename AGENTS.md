# Karma

Express 5 + Handlebars + Socket.IO "real-time peer-to-peer tutoring platform", submitted to the
SkillsFuture Singapore Hackathon 2018 (release `final-2018`). A student signs in, photographs a
question with the camera and asks for a live tutor; signed-in tutors see the pending questions,
pick one, and the two chat until the question is resolved. Sign-up, sign-in and the home page
are HTTP forms; the tutoring flow is Socket.IO events from `public/script.js`. Users, questions
and sessions are in SQLite (better-sqlite3) at `database/karma.db` (or `DB_PATH`). The site is
not deployed.

## Run and check

- Node: the version in `.node-version` (also the `engines` floor in `package.json`).
  `npm ci` may build better-sqlite3 with node-gyp, so it needs Python and `make` (slim Docker
  images lack them). On Docker use a Debian trixie image: bookworm's glibc is too old for
  better-sqlite3's prebuilt binary.
- `npm ci --engine-strict`, then copy `.env.example` to `.env` and set `SESSION_SECRET`
  (32+ random characters). Run `npm start` (or `npm run dev`) **from the repo root**.
- **Gate** (what CI runs; all must pass before a PR is ready):

  ```sh
  npm ci --engine-strict && npm run lint && npm run format:check && npm test && npm audit --omit=dev
  ```

- `npm test` boots the real `node app.js` in a temporary copy of the repo (your `database/` is
  never touched). `test/helpers/app.js` drives it over HTTP with a cookie-jar client that reads
  the CSRF token from the forms' hidden `_csrf` field; `test/helpers/socket.js` wraps
  socket.io-client (a dev dependency; keep it on the server's socket.io version) and sends the
  session cookie, and the tests send the same payloads as `public/script.js`. No network is needed. Sign-in and sign-up POSTs
  share a limit of 20 per 15 minutes, so a test file starts a new app per `describe` block
  rather than signing up more users on one.

## Where things live

- `app.js`: startup, the home, register and `/clear` routes, and every Socket.IO handler
  (`init`, `create`, `answer`, `message`, `resolve`).
- `controllers/settings.js`: env (port, secret check). `controllers/config.js`: middleware
  (helmet and its CSP, sessions in SQLite, the auth rate limiter, CSRF via csrf-sync, passport
  strategies, Handlebars). `controllers/users.js`: sign-in, sign-up, sign-out.
- `models/user.js`, `models/question.js`: SQLite queries. `utils/db.js`: the connection and the
  schema.
- `views/index.handlebars` (sign-in form, or the camera/tutoring page when signed in),
  `views/register.handlebars`. `public/script.js`: the page script (camera, question list, chat).
  `public/scroller/` is vendored.
- `test/`: `node:test` suites; `test/helpers/` holds the harness.
- `.github/workflows/ci.yml`: checks `test (floor)`, `test (lts)` and `audit` on every PR and
  push to `master`, weekly on Mondays; a failing scheduled run opens a "Scheduled CI failed"
  issue. `dependabot.yml`: monthly grouped updates. `dependabot-auto-merge.yml`: patch and minor
  Dependabot PRs merge themselves once the required checks pass.

## Conventions

- Damian merges. Agents work on branches and open or update PRs; they never merge, close PRs,
  push to `master` or change repository settings.
- One problem per commit, one theme per PR. Imperative, sentence-case subjects with no prefix,
  except dependency commits: `fix(deps): update <pkg> <old> -> <new> (GHSA-…)`.
- Commit bodies say what was wrong (citing the commit that caused it), the fix, and how it was
  verified: the result before and after. A behavioural fix adds a test that fails before it.
- Don't force-push a pushed branch; add commits, and merge the base in to update it.
- Stacked PRs say so in the description and give the merge order.
- Known gaps are `test.todo` entries named after the item they miss. Fixing one means dropping
  `.todo` in the same PR.
- The CSRF form field is `_csrf`; scripts send the token in `X-CSRF-Token`.
- Escape on output. In `public/script.js`, everything inserted with `innerHTML` goes through
  `escapeHtml`.

## Decided against (don't re-propose)

- npm's audit "fix" for the dev-only eslint/minimatch advisory.
- Migrating old NeDB data into SQLite. There is no data worth migrating.
- Changing the Content-Security-Policy as a side effect of another fix (it allows
  `'unsafe-inline'` for the inline script that sets the user id).

## Known issues (don't re-investigate)

- Socket.IO trusts the `userid`/`askee` in each payload and accepts sockets with no session, so
  anyone can ask, answer, chat or resolve as anyone. Every update is broadcast to every socket,
  there are no state or participant rules (answer your own question, resolve someone else's),
  and payloads are not validated (open PR #1).
- `getRelatedQuestions` has no server handler, so the suggestions under the photo never load;
  the chat listens for `resolve` while the server emits `resolved`, and the rating screen never
  resolves the question (open PR #1).
- `GET /clear` lets any signed-in user delete every user and question (a state-changing GET;
  open PR #1 removes it).
- `user.clearSocketID` is dead code: it matches the user `_id` column against a socket id, so it
  never clears anything. Nothing reads `socket_id`.
- Sign-out is `GET /users/signout`, nothing links to it, and it neither destroys the stored
  session nor disconnects the user's sockets (open PR #1).
- A CSRF token in the query string (`?_csrf=`) is accepted, and a CSRF failure reaches
  Express's default handler, which shows a stack trace outside production (open PR #1).
- The `.env.example` placeholder secret passes the length check, so the app boots with it
  (open PR #1).
- `escapeHtml` in `public/script.js` doesn't escape quotes, but its output goes into
  double-quoted attributes: a crafted photo can inject attributes (open PR #4).
- With `NODE_ENV=production` the session cookie is `Secure` but `trust proxy` is never set, so
  behind an HTTPS proxy no cookie is issued (every form then fails CSRF), and the rate limiter
  keys everyone behind the proxy as one client.
- The auth rate limiter is mounted with `app.use("/users/signin")`, so it counts GETs as well
  as POSTs.
- Sign-in says "User does not exist" or "Wrong password", revealing which usernames exist.
- `public/` and `views/` are resolved against the working directory, so the app only starts
  from the repo root.
- `app.js` logs "Listening on port" right after calling `listen()`, before the port is bound.
- `res.status(401).redirect("/")` in `middlewares/auth.js` sends 302 (redirect overrides the
  status). Don't add more.
