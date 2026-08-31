import bcrypt from "bcryptjs";
import { Router } from "express";
import * as Sentry from "@sentry/node";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";

const GENERIC_INVALID_CREDENTIALS = { error: "Invalid credentials" };

// Valid-format bcrypt hash (cost 12) of an unrelated dummy value — used only to
// run a real, full-cost comparison on the "user not found" path so that path
// takes the same time as a genuine wrong-password check. Must be a real,
// correctly-shaped 60-char bcrypt hash: a malformed placeholder here makes
// bcryptjs short-circuit instead of doing the actual comparison work, which
// reopens the exact timing side-channel this is meant to close (an attacker
// could tell "no such email" from "wrong password" by response time even
// with identical response bodies).
const DUMMY_HASH_FOR_TIMING_SAFETY =
  "$2b$12$OZuDUlsvTLmq02IlYSrm/uP8/4A2qg6y3U5gvPA0opFlaGTVAr5e6";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Try again later." },
});

export const authRouter = Router();

authRouter.post("/login", loginLimiter, async (req, res) => {
  const { email: rawEmail, password } = req.body ?? {};

  if (typeof rawEmail !== "string" || typeof password !== "string") {
    res.status(401).json(GENERIC_INVALID_CREDENTIALS);
    return;
  }

  const email = rawEmail.trim().toLowerCase();

  try {
    const user = await prisma.user.findFirst({ where: { email, deletedAt: null } });

    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : await bcrypt.compare(password, DUMMY_HASH_FOR_TIMING_SAFETY);

    if (!user || !passwordMatches) {
      console.log(
        JSON.stringify({
          event: "login_failed",
          email,
          ip: req.ip,
          at: new Date().toISOString(),
        })
      );
      res.status(401).json(GENERIC_INVALID_CREDENTIALS);
      return;
    }

    const token = await signToken({ userId: user.id, hotelId: user.hotelId, role: user.role });
    res.status(200).json({ token });
  } catch (err) {
    console.error("Login error:", err instanceof Error ? err.message : err);
    Sentry.captureException(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
