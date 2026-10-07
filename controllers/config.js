const settings = require("./settings.js");
const morgan = require("morgan");
const passport = require("passport");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const session = require("express-session");
const exphbs = require("express-handlebars");
const LocalStrategy = require("passport-local");
const dateFormat = require("dateformat");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { csrfSync } = require("csrf-sync");
const SQLiteStore = require("better-sqlite3-session-store")(session);

const user = require("../models/user.js");
const db = require("../utils/db");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many authentication attempts, please try again later.",
});

const { csrfSynchronisedProtection, generateToken } = csrfSync({
  getTokenFromRequest: (req) => {
    return (
      (req.body && req.body._csrf) || req.headers["x-csrftoken"] || req.headers["x-csrf-token"]
    );
  },
});

module.exports = function (app, express) {
  require("console-stamp")(console, {
    pattern: settings.TIME_FORMAT,
    colors: { stamp: "cyan", label: "magenta" },
  });

  morgan.token("time", () => dateFormat(new Date(), settings.TIME_FORMAT));

  // Security
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", "wss:", "ws:"],
        },
      },
    }),
  );
  app.disable("x-powered-by");
  app.enable("case sensitive routing");
  app.enable("strict routing");

  // Middleware
  app.use(compression());
  app.use(express.static("public"));
  app.use(morgan("[:time] :method :url :status :response-time ms"));
  app.use(cookieParser(settings.SECRET));
  app.use(express.urlencoded({ extended: false }));
  const sessionMiddleware = session({
    secret: settings.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
    store: new SQLiteStore({
      client: db,
      expired: {
        clear: true,
        intervalMs: 900000,
      },
    }),
  });
  app.use(sessionMiddleware);

  // Rate limit auth routes (must come before CSRF)
  app.use("/users/signin", authLimiter);
  app.use("/users/signup", authLimiter);

  // CSRF protection
  app.use(csrfSynchronisedProtection);

  // Make CSRF token available to all templates
  app.use(function (req, res, next) {
    if (req.session) {
      res.locals.csrfToken = generateToken(req);
    }
    next();
  });

  // Passport
  app.use(passport.initialize());
  app.use(passport.session());

  // Strategies
  passport.use(
    "local-signin",
    new LocalStrategy({ passReqToCallback: true }, async function (req, username, password, done) {
      try {
        const foundUser = await user.authenticate(username, password);
        console.log("Signed in", foundUser.username);
        done(null, foundUser);
      } catch (err) {
        console.error("Sign-in failed:", err.message);
        req.session.error = err.message;
        done(null, false);
      }
    }),
  );

  passport.use(
    "local-signup",
    new LocalStrategy({ passReqToCallback: true }, async function (req, username, password, done) {
      try {
        const created = await user.add(req, username, password);
        console.log("Signed up", created.username);
        done(null, created);
      } catch (err) {
        console.error("Sign-up failed:", err.message);
        req.session.error = err.message;
        done(null, false);
      }
    }),
  );

  // Serialization
  passport.serializeUser(function (user, done) {
    done(null, user._id);
  });

  passport.deserializeUser(function (id, done) {
    const foundUser = user.get(id);
    done(null, foundUser);
  });

  // View engine
  const hbs = exphbs.create({ defaultLayout: "default" });
  app.engine("handlebars", hbs.engine);
  app.set("view engine", "handlebars");

  return { sessionMiddleware };
};
