require("dotenv").config();

const placeholderSecret = "replace-with-a-random-string-min-32-chars";

if (
  !process.env.SESSION_SECRET ||
  process.env.SESSION_SECRET.length < 32 ||
  process.env.SESSION_SECRET === placeholderSecret
) {
  console.error("FATAL: SESSION_SECRET must be set in .env (min 32 chars)");
  process.exit(1);
}

exports.PORT = process.env.PORT || 5000;
exports.TIME_FORMAT = "dd mmm HH:MM:ss";
exports.SECRET = process.env.SESSION_SECRET;
exports.HASH_ROUNDS = 10;
