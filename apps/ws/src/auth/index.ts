import jwt from 'jsonwebtoken';
import { User } from '../SocketManager';
import { WebSocket } from 'ws';
import { db } from '../db';

export interface userJwtClaims {
  userId: string;
  name?: string;
  isGuest?: boolean;
}

export const extractAuthUser = async (token: string, ws: WebSocket): Promise<User | null> => {
  const secret = process.env.JWT_SECRET;
  if (!secret) return null;
  const decoded = jwt.verify(token, secret) as userJwtClaims;
  const row = await db.user.findUnique({
    where: { id: decoded.userId },
    select: {
      id: true,
      name: true,
      provider: true,
      deletedAt: true,
      processingRestricted: true,
    },
  });
  if (!row || row.deletedAt || row.processingRestricted) return null;
  return new User(ws, {
    userId: row.id,
    name: row.name ?? 'Player',
    isGuest: row.provider === 'GUEST',
  });
};
