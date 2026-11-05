const assert = require("node:assert/strict");
const { describe, test, before, after } = require("node:test");
const { start, boot, Client, PASSWORD } = require("./helpers/app.js");

describe("CSRF", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  async function visitor() {
    const client = new Client(app.baseUrl);
    await client.get("/");
    return client;
  }

  test("a form POST without a token is refused with 403", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { username: "x", password: "y" },
    });
    assert.equal(res.status, 403);
  });

  test("a wrong token is refused with 403", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { _csrf: "not-the-token", username: "x", password: "y" },
    });
    assert.equal(res.status, 403);
  });

  test.todo("3.5 no query-string CSRF token: a token in ?_csrf= is refused with 403");
  test.todo(
    "3.7 app-level 4-arg error handler: a CSRF failure shows a short message, no stack trace",
  );

  test("the token in the X-CSRF-Token header is accepted", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      form: { username: "x", password: "y" },
      headers: { "x-csrf-token": client.csrfToken },
    });
    assert.equal(res.status, 302);
  });

  test("a bodyless POST with the header token is neither 403 nor 500", async () => {
    const client = await visitor();
    const res = await client.request("POST", "/users/signin", {
      headers: { "x-csrf-token": client.csrfToken },
    });
    assert.equal(res.status, 302);
  });
});

describe("session secret", () => {
  for (const [label, secret] of [
    ["empty", ""],
    ["short", "too-short"],
  ]) {
    test(`an ${label} SESSION_SECRET stops startup with exit 1`, async () => {
      const { code, output } = await boot({ SESSION_SECRET: secret });
      assert.equal(code, 1);
      assert.match(output, /FATAL: SESSION_SECRET/);
    });
  }

  test.todo("3.3 placeholder secret refused: the .env.example value stops startup with exit 1");
});

describe("rate limits", () => {
  test("the 21st sign-in attempt within 15 minutes gets 429", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      await client.get("/");
      for (let i = 1; i <= 20; i++) {
        const res = await client.post("/users/signin", { username: "x", password: PASSWORD });
        assert.equal(res.status, 302, `attempt ${i}`);
      }
      const res = await client.post("/users/signin", { username: "x", password: PASSWORD });
      assert.equal(res.status, 429);
    } finally {
      await app.stop();
    }
  });

  test("25 loads of the sign-in page are not rate-limited", async () => {
    const app = await start();
    try {
      const client = new Client(app.baseUrl);
      for (let i = 1; i <= 25; i++) assert.equal((await client.get("/")).status, 200, `load ${i}`);
    } finally {
      await app.stop();
    }
  });

  test.todo(
    "3.4 auth limiter POST-only: GET requests to /users/signin and /users/signup count towards the limit",
  );
  test.todo(
    "3.4 TRUST_PROXY: 21 failed sign-ins from forwarded client A do not rate-limit client B",
  );
});

describe("production and proxy settings", () => {
  for (const value of ["true", "false", "1", "loopback"]) {
    test(`TRUST_PROXY=${value} boots`, async () => {
      const app = await start({ TRUST_PROXY: value });
      try {
        assert.equal((await fetch(app.baseUrl + "/")).status, 200);
      } finally {
        await app.stop();
      }
    });
  }

  test("NODE_ENV=production boots and serves the home page", async () => {
    const app = await start({ NODE_ENV: "production" });
    try {
      assert.equal((await fetch(app.baseUrl + "/")).status, 200);
    } finally {
      await app.stop();
    }
  });

  test.todo(
    "3.4 TRUST_PROXY for the Secure cookie: with NODE_ENV=production behind an HTTPS proxy the session cookie is issued, Secure",
  );
});

describe("responses", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("an unknown path is 404", async () => {
    assert.equal((await fetch(app.baseUrl + "/no-such-page")).status, 404);
  });

  test("pages carry helmet's security headers", async () => {
    const res = await fetch(app.baseUrl + "/");
    assert.match(res.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff");
    assert.equal(res.headers.get("x-powered-by"), null);
  });

  test("the session cookie is HttpOnly and SameSite=Lax", async () => {
    const res = await fetch(app.baseUrl + "/");
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith("connect.sid="));
    assert.ok(cookie);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Lax/);
  });
});
