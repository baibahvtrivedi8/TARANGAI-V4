import 'dotenv/config';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { db } from '../db/database.js';
import { User, ApiKey } from '../../src/types.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: User;
      apiKey?: ApiKey;
      authMethod?: 'session' | 'api_key';
    }
  }
}

export function getJwtSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error('SESSION_SECRET environment variable is required');
  }
  return secret;
}

/**
 * Creates an HMAC signed stateless session token
 */
export function createSessionToken(user: User): string {
  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60, // 7 days
  };

  const secret = getJwtSecret();
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');
  return `trg_ses_${payloadB64}.${signature}`;
}

/**
 * Verifies and decodes a stateless session token
 */
export function verifySessionToken(token: string): User | null {
  if (!token.startsWith('trg_ses_')) return null;

  const raw = token.replace('trg_ses_', '');
  const parts = raw.split('.');
  if (parts.length !== 2) return null;

  const [payloadB64, signature] = parts;
  const secret = getJwtSecret();
  const expectedSig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return db.getUserById(payload.sub);
  } catch (_) {
    return null;
  }
}

/**
 * Authenticates request using either Session Token or API Key
 */
export async function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (!token) {
    res.status(401).json({ error: 'Authentication required. Provide Authorization Bearer token or X-API-Key header.' });
    return;
  }

  // 1. Check if it's an API Key (starts with trg_live_)
  if (token.startsWith('trg_live_')) {
    const keyValidation = await db.validateApiKey(token);
    if (!keyValidation.valid) {
      res.status(401).json({ error: keyValidation.error || 'Invalid or revoked API Key' });
      return;
    }

    req.user = keyValidation.user;
    req.authMethod = 'api_key';
    next();
    return;
  }

  // 2. Check if it's a Session Token
  const user = verifySessionToken(token);
  if (!user) {
    res.status(401).json({ error: 'Invalid or expired session token. Please sign in again.' });
    return;
  }

  req.user = user;
  req.authMethod = 'session';
  next();
}

/**
 * Optional authentication middleware: parses user if token is present, but doesn't block request if missing
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization || '';
  const apiKeyHeader = req.headers['x-api-key'] as string;

  let token = '';
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (apiKeyHeader) {
    token = apiKeyHeader.trim();
  }

  if (token) {
    if (token.startsWith('trg_live_')) {
      const keyValidation = await db.validateApiKey(token);
      if (keyValidation.valid) {
        req.user = keyValidation.user;
        req.authMethod = 'api_key';
      }
    } else {
      const user = verifySessionToken(token);
      if (user) {
        req.user = user;
        req.authMethod = 'session';
      }
    }
  }

  next();
}
