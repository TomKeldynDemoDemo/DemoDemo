import { Request, Response, Router } from 'express';
import passport from 'passport';
import jwt from 'jsonwebtoken';
import { db } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { cookieFlags, required } from '../privacy/env';
import { parseProfileEdit } from '@repo/db/gdpr';

const router = Router();

const CLIENT_URL = process.env.AUTH_REDIRECT_URL ?? 'http://localhost:5173/game/random';

interface userJwtClaims {
  userId: string;
  isGuest?: boolean;
}

interface UserDetails {
  id: string;
  token?: string;
  name: string;
  isGuest?: boolean;
}

function signToken(claims: userJwtClaims) {
  return jwt.sign(claims, required('JWT_SECRET'));
}

router.post('/guest', async (req: Request, res: Response) => {
  const bodyData = req.body;
  const guestUUID = 'guest-' + uuidv4();
  const submitted = typeof bodyData.name === 'string' ? bodyData.name : '';
  const parsed = parseProfileEdit({ name: submitted || guestUUID });
  const name = parsed.ok && parsed.name ? parsed.name : guestUUID;

  const user = await db.user.create({
    data: {
      username: guestUUID,
      name,
      provider: 'GUEST',
      lastLogin: new Date(),
    },
  });

  const token = signToken({ userId: user.id, isGuest: true });
  const details: UserDetails = {
    id: user.id,
    name: user.name ?? name,
    token,
    isGuest: true,
  };
  res.cookie('guest', token, cookieFlags());
  res.json(details);
});

router.get('/refresh', async (req: Request, res: Response) => {
  if (req.user) {
    const sessionUser = req.user as { id: string };
    const userDb = await db.user.findFirst({
      where: { id: sessionUser.id },
    });
    if (!userDb || userDb.deletedAt) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
    await db.user.update({
      where: { id: userDb.id },
      data: { lastLogin: new Date() },
    });
    const token = signToken({ userId: userDb.id, isGuest: false });
    res.json({
      token,
      id: userDb.id,
      name: userDb.name,
    });
    return;
  }

  if (req.cookies && req.cookies.guest) {
    try {
      const decoded = jwt.verify(req.cookies.guest, required('JWT_SECRET')) as userJwtClaims;
      const userDb = await db.user.findFirst({
        where: { id: decoded.userId },
      });
      if (!userDb || userDb.deletedAt) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }
      await db.user.update({
        where: { id: userDb.id },
        data: { lastLogin: new Date() },
      });
      const token = signToken({
        userId: userDb.id,
        isGuest: userDb.provider === 'GUEST',
      });
      const details: UserDetails = {
        id: userDb.id,
        name: userDb.name ?? '',
        token,
        isGuest: userDb.provider === 'GUEST',
      };
      res.cookie('guest', token, cookieFlags());
      res.json(details);
      return;
    } catch {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }
  }

  res.status(401).json({ success: false, message: 'Unauthorized' });
});

router.get('/login/failed', (_req: Request, res: Response) => {
  res.status(401).json({ success: false, message: 'failure' });
});

router.get('/logout', (req: Request, res: Response) => {
  res.clearCookie('guest');
  req.logout((err) => {
    if (err) {
      console.error('Error logging out:', err);
      res.status(500).json({ error: 'Failed to log out' });
    } else {
      res.clearCookie('jwt');
      res.redirect('http://localhost:5173/');
    }
  });
});

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', {
    successRedirect: CLIENT_URL,
    failureRedirect: '/login/failed',
  })
);

router.get('/github', passport.authenticate('github', { scope: ['read:user', 'user:email'] }));

router.get(
  '/github/callback',
  passport.authenticate('github', {
    successRedirect: CLIENT_URL,
    failureRedirect: '/login/failed',
  })
);

export default router;
