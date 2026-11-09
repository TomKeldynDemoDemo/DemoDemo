import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { required } from './env';

interface GuestClaims {
  userId: string;
}

export async function requirePlayer(req: Request, res: Response, next: NextFunction) {
  const sessionUser = req.user as { id?: string } | undefined;
  const sessionId = sessionUser?.id;
  const guestToken = req.cookies && typeof req.cookies.guest === 'string' ? req.cookies.guest : undefined;

  let userId = sessionId;
  if (!userId && guestToken) {
    try {
      const decoded = jwt.verify(guestToken, required('JWT_SECRET')) as GuestClaims;
      userId = decoded.userId;
    } catch {
      userId = undefined;
    }
  }

  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, deletedAt: true },
  });
  if (!user || user.deletedAt) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.locals.playerId = user.id;
  next();
}
