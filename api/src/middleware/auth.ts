import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/http.js";
import { verifyAccessToken } from "../services/tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    user?: { id: string; email: string };
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return next(new HttpError(401, "Missing or invalid authorization header"));
  }
  const token = header.slice("Bearer ".length).trim();
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch {
    return next(new HttpError(401, "Invalid or expired access token"));
  }
}
