// Starts the real app in a throwaway copy of the repo, so tests never touch ./database in the
// working tree. node_modules and public/ are symlinked.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..", "..");
const skip = new Set([".git", "node_modules", "public", "test", "database"]);

exports.PASSWORD = "test-password-123";
exports.SECRET = "s".repeat(48);

function freePort() {
  return new Promise(function (resolve, reject) {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", function () {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function makeSandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "karma-test-"));
  for (const entry of fs.readdirSync(repoRoot)) {
    if (skip.has(entry) || entry.startsWith(".env")) continue;
    fs.cpSync(path.join(repoRoot, entry), path.join(dir, entry), { recursive: true });
  }
  fs.symlinkSync(path.join(repoRoot, "node_modules"), path.join(dir, "node_modules"), "dir");
  fs.symlinkSync(path.join(repoRoot, "public"), path.join(dir, "public"), "dir");
  return dir;
}

async function waitForPort(port, child, output) {
  const deadline = Date.now() + 15000;
  for (;;) {
    if (child.exitCode !== null)
      throw Error("App exited with code " + child.exitCode + ":\n" + output());
    try {
      await fetch("http://127.0.0.1:" + port + "/style.css");
      return;
    } catch {
      if (Date.now() > deadline) throw Error("App did not start:\n" + output());
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function launch(dir, env) {
  return spawn(process.execPath, ["app.js"], {
    cwd: dir,
    env: { PATH: process.env.PATH, SESSION_SECRET: exports.SECRET, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// Resolves once the server answers HTTP. `env` adds or overrides variables; `dir` reuses the
// sandbox (and its database) of an app that has been stopped with `keep`.
exports.start = async function (env = {}, { dir = makeSandbox() } = {}) {
  const port = await freePort();
  // cwd must be the (copied) repo root: express.static("public") and the views directory are
  // resolved against the working directory.
  const child = launch(dir, { PORT: String(port), ...env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  // app.js logs "Listening on port" right after calling listen(), so poll the port instead.
  await waitForPort(port, child, () => output);
  return {
    dir,
    baseUrl: "http://127.0.0.1:" + port,
    output: () => output,
    stop: async function ({ keep = false } = {}) {
      if (child.exitCode === null) {
        await new Promise(function (resolve) {
          child.once("exit", resolve);
          child.kill();
        });
      }
      if (!keep) fs.rmSync(dir, { recursive: true, force: true });
    },
  };
};

// Runs the app until it exits or `ms` passes; resolves to { code, output } (code null if it
// was still running).
exports.boot = async function (env, ms = 3000) {
  const dir = makeSandbox();
  const child = launch(dir, { PORT: String(await freePort()), ...env });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const code = await new Promise(function (resolve) {
    const timer = setTimeout(() => resolve(null), ms);
    child.once("exit", (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (child.exitCode === null) {
    await new Promise(function (resolve) {
      child.once("exit", resolve);
      child.kill();
    });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  return { code, output };
};

function decode(s) {
  return s
    .replace(/&#x27;/g, "'")
    .replace(/&#x3D;/g, "=")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

// What a rendered page shows: the error message, and for a signed-in user the profile and the
// user id the page script uses.
exports.page = function (text) {
  const read = (re) => {
    const m = text.match(re);
    return m ? decode(m[1]) : undefined;
  };
  return {
    error: read(/<p class="error-message">([^<]*)<\/p>/),
    name: read(/<p id="profile-name">([^<]*)<\/p>/),
    karma: read(/<p id="profile-karma">([^<]*)<\/p>/),
    userId: read(/let curUserId = "([^"]*)";/),
    signInForm: /<form action="\/users\/signin" method="POST">/.test(text),
  };
};

// A tiny browser stand-in: keeps cookies and reads the CSRF token from the forms' hidden field.
exports.Client = class Client {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cookies = {};
    this.csrfToken = null;
  }

  get cookieHeader() {
    return Object.entries(this.cookies)
      .map(([k, v]) => k + "=" + v)
      .join("; ");
  }

  async request(method, url, { form, headers = {} } = {}) {
    const init = {
      method,
      redirect: "manual",
      headers: { cookie: this.cookieHeader, ...headers },
    };
    if (form) {
      init.body = new URLSearchParams(form).toString();
      init.headers["content-type"] = "application/x-www-form-urlencoded";
    }
    const res = await fetch(this.baseUrl + url, init);
    for (const cookie of res.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const name = pair.slice(0, pair.indexOf("="));
      if (/expires=thu, 01 jan 1970/i.test(cookie)) delete this.cookies[name];
      else this.cookies[name] = pair.slice(pair.indexOf("=") + 1);
    }
    const text = await res.text();
    const token = text.match(/<input type="hidden" name="_csrf" value="([^"]+)"/);
    if (token) this.csrfToken = token[1];
    return {
      status: res.status,
      headers: res.headers,
      text,
      location: res.headers.get("location"),
    };
  }

  get(url) {
    return this.request("GET", url);
  }

  // Form POST with the page's CSRF token in the body, as the site's forms send it.
  post(url, fields = {}) {
    return this.request("POST", url, { form: { _csrf: this.csrfToken, ...fields } });
  }

  // Posts, then loads the redirect target and returns what it shows.
  async postAndFollow(url, fields) {
    const res = await this.post(url, fields);
    if (res.status !== 302) throw Error(`POST ${url}: expected a redirect, got ${res.status}`);
    const next = await this.get(res.location);
    return { location: res.location, ...exports.page(next.text) };
  }

  // Registers through the form on /register; any field can be overridden.
  async signUp(username, fields = {}) {
    await this.get("/register");
    return this.postAndFollow("/users/signup", {
      name: "User " + username,
      username,
      password: exports.PASSWORD,
      ...fields,
    });
  }

  async signIn(username, password = exports.PASSWORD) {
    await this.get("/");
    return this.postAndFollow("/users/signin", { username, password });
  }

  // The signed-in user's id as the home page gives it to the page script, or undefined.
  async userId() {
    return exports.page((await this.get("/")).text).userId;
  }
};
