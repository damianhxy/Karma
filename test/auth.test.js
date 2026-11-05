const assert = require("node:assert/strict");
const { describe, test, before, after } = require("node:test");
const { start, Client, page, PASSWORD } = require("./helpers/app.js");

// The sign-in and sign-up POSTs share one rate limit of 20 per 15 minutes per client, so each
// block below starts its own app and stays under it.

describe("sign-up", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("the home page shows the sign-in form to signed-out visitors", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.get("/");
    assert.equal(res.status, 200);
    const shown = page(res.text);
    assert.ok(shown.signInForm);
    assert.equal(shown.userId, undefined);
    assert.ok(client.csrfToken, "the form carries a CSRF token");
    assert.match(res.text, /href="\/register"/);
  });

  test("the register page shows the sign-up form", async () => {
    const client = new Client(app.baseUrl);
    const res = await client.get("/register");
    assert.equal(res.status, 200);
    assert.match(res.text, /<form action="\/users\/signup" method="POST">/);
    assert.ok(client.csrfToken);
  });

  test("signing up signs the new user in, with their name and 0 karma", async () => {
    const client = new Client(app.baseUrl);
    const shown = await client.signUp("alice", { name: "Alice Tan" });
    assert.equal(shown.location, "/");
    assert.equal(shown.name, "Alice Tan");
    assert.equal(shown.karma, "0 Karma");
    assert.match(shown.userId, /^[0-9a-f]{24}$/);
    assert.equal(shown.signInForm, false);
  });

  test("the sign-up form rejects invalid fields with a message", async () => {
    const cases = [
      [{ username: "ab" }, "Username must be 3-30 characters"],
      [{ username: "bad name" }, "Username must contain only letters and numbers"],
      [{ username: "shortpw", password: "1234567" }, "Password must be at least 8 characters"],
      [{ username: "noname", name: "" }, "Name is required (max 100 chars)"],
    ];
    for (const [fields, message] of cases) {
      const client = new Client(app.baseUrl);
      const shown = await client.signUp(fields.username, fields);
      assert.equal(shown.location, "/register", JSON.stringify(fields));
      assert.equal(shown.error, message);
      assert.equal(await client.userId(), undefined);
    }
  });

  test("a taken username is refused", async () => {
    await new Client(app.baseUrl).signUp("bob");
    const client = new Client(app.baseUrl);
    const shown = await client.signUp("bob", { password: "another-password" });
    assert.equal(shown.location, "/register");
    assert.equal(shown.error, "User already exists");
    assert.equal(await client.userId(), undefined);
  });
});

describe("sign-in and sign-out", () => {
  let app;
  let carolId;
  before(async () => {
    app = await start();
    carolId = (await new Client(app.baseUrl).signUp("carol")).userId;
  });
  after(() => app.stop());

  test("the right password signs the user in", async () => {
    const client = new Client(app.baseUrl);
    const shown = await client.signIn("carol");
    assert.equal(shown.location, "/");
    assert.equal(shown.userId, carolId);
    assert.equal(shown.name, "User carol");
  });

  test("a wrong password or an unknown user is refused with a message", async () => {
    for (const [username, password] of [
      ["carol", "wrong-password"],
      ["nobody", PASSWORD],
    ]) {
      const client = new Client(app.baseUrl);
      const shown = await client.signIn(username, password);
      assert.equal(shown.location, "/");
      assert.ok(shown.error, `${username}: an error is shown`);
      assert.equal(shown.userId, undefined);
    }
  });

  test.todo(
    "3.9 generic sign-in failure message: an unknown user and a wrong password get the same message",
  );

  test("empty fields are refused with a message", async () => {
    const client = new Client(app.baseUrl);
    const shown = await client.signIn("", "");
    assert.equal(shown.error, "Username is required, Password is required");
    assert.equal(shown.userId, undefined);
  });

  test("the error is shown once, then cleared", async () => {
    const client = new Client(app.baseUrl);
    assert.ok((await client.signIn("carol", "wrong-password")).error);
    assert.equal(page((await client.get("/")).text).error, undefined);
  });

  test("usernames are trimmed at sign-in", async () => {
    const client = new Client(app.baseUrl);
    assert.equal((await client.signIn("  carol  ")).userId, carolId);
  });

  test("GET /users/signout signs the user out", async () => {
    const client = new Client(app.baseUrl);
    await client.signIn("carol");
    const res = await client.get("/users/signout");
    assert.equal(res.status, 302);
    assert.equal(res.location, "/");
    assert.equal(await client.userId(), undefined);
  });

  test.todo(
    "3.6 POST sign-out + destroy: GET /users/signout is 404; POST with a token destroys the session and disconnects the user's sockets",
  );
});

describe("sessions", () => {
  test("a signed-in session survives a restart (SQLite session store)", async () => {
    let app = await start();
    const client = new Client(app.baseUrl);
    const { userId } = await client.signUp("dave");
    await app.stop({ keep: true });
    app = await start({}, { dir: app.dir });
    try {
      client.baseUrl = app.baseUrl;
      assert.equal(await client.userId(), userId);
    } finally {
      await app.stop();
    }
  });
});

describe("GET /clear", () => {
  let app;
  before(async () => (app = await start()));
  after(() => app.stop());

  test("signed-out visitors cannot clear the database", async () => {
    const client = new Client(app.baseUrl);
    await client.signUp("erin");
    const res = await new Client(app.baseUrl).get("/clear");
    assert.notEqual(res.status, 200);
    assert.ok((await new Client(app.baseUrl).signIn("erin")).userId);
  });

  test.todo(
    "3.9 no state-changing GET routes: GET /clear lets any signed-in user delete every user and question",
  );
});
