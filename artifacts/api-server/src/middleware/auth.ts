import type { Request, Response, NextFunction } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

/**
 * Decodes the opaque Bearer token (base64 of "userId:timestamp") and attaches
 * `req.userId` when a valid token is present.  Non-blocking — routes that need
 * auth should check for `req.userId` themselves.
 */
export function extractUser(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const token = header.slice(7);
      const decoded = Buffer.from(token, "base64").toString("utf8");
      const id = parseInt(decoded.split(":")[0], 10);
      if (!isNaN(id) && id > 0) req.userId = id;
    } catch {
      /* malformed token — ignore */
    }
  }
  next();
}

/**
 * Express middleware that rejects requests without a valid user token.
 * Mount after `extractUser`.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.userId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
