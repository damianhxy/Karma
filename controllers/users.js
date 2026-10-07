const express = require("express");
const passport = require("passport");
const { body, validationResult } = require("express-validator");
const router = express.Router();
const auth = require("../middlewares/auth.js");

const signupValidation = [
  body("name")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Name is required (max 100 chars)"),
  body("username")
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage("Username must be 3-30 characters")
    .isAlphanumeric()
    .withMessage("Username must contain only letters and numbers"),
  body("password")
    .isLength({ min: 8, max: 100 })
    .withMessage("Password must be at least 8 characters"),
];

const signinValidation = [
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
];

router.post("/signin", signinValidation, function (req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.error = errors
      .array()
      .map((e) => e.msg)
      .join(", ");
    return res.redirect("/");
  }
  passport.authenticate("local-signin", {
    successRedirect: "/",
    failureRedirect: "/",
  })(req, res, next);
});

router.post("/signup", signupValidation, function (req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    req.session.error = errors
      .array()
      .map((e) => e.msg)
      .join(", ");
    return res.redirect("/register");
  }
  passport.authenticate("local-signup", {
    successRedirect: "/",
    failureRedirect: "/register",
  })(req, res, next);
});

router.post("/signout", auth, function (req, res, next) {
  const userId = req.user._id;
  req.logout(function (err) {
    if (err) return next(err);
    req.session.destroy(function (destroyErr) {
      if (destroyErr) return next(destroyErr);
      req.app.get("io").in(`user:${userId}`).disconnectSockets(true);
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
});

module.exports = router;
