import type { NextFunction, Request, Response } from "express";
import { verifyToken, type AuthClaims } from "../lib/auth.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = header.slice("Bearer ".length);

  try {
    req.auth = await verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
