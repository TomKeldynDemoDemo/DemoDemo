import { Request, Response, Router } from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_secret_key';

function currentUserId(req: Request): string | null {
  const sessionUser = req.user as { id?: string } | undefined;
  if (sessionUser?.id) return sessionUser.id;

  const guest = req.cookies?.guest;
  if (!guest) return null;
  try {
    const decoded = jwt.verify(guest, JWT_SECRET) as { userId?: string };
    return decoded.userId ?? null;
  } catch {
    return null;
  }
}

router.delete('/me', async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Not signed in' });
    return;
  }

  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || user.deletedAt) {
    res.status(404).json({ message: 'Account not found' });
    return;
  }

  const backup = await db.$transaction(async (tx) => {
    const existing = await tx.accountBackup.findUnique({ where: { userId } });
    const saved =
      existing ??
      (await tx.accountBackup.create({
        data: {
          userId,
          name: user.name,
          email: user.email,
          provider: user.provider,
        },
      }));

    await tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        name: null,
        username: null,
        email: `deleted-${userId}@players.invalid`,
      },
    });

    return saved;
  });

  res.json({
    backupId: backup.id,
    message: 'Account deleted. You can undo this with the backup id.',
  });
});

router.post('/me/undo-delete', async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) {
    res.status(401).json({ message: 'Not signed in' });
    return;
  }

  const backupId = req.body?.backupId as string | undefined;
  if (!backupId) {
    res.status(400).json({ message: 'backupId is required' });
    return;
  }

  const backup = await db.accountBackup.findUnique({ where: { id: backupId } });
  if (!backup || backup.userId !== userId) {
    res.status(404).json({ message: 'Backup not found' });
    return;
  }

  const taken = await db.user.findFirst({
    where: { email: backup.email, NOT: { id: userId } },
  });
  if (taken) {
    res.status(409).json({ message: 'That email is already in use' });
    return;
  }

  const user = await db.$transaction(async (tx) => {
    const restored = await tx.user.update({
      where: { id: userId },
      data: {
        name: backup.name,
        email: backup.email,
        deletedAt: null,
      },
    });
    await tx.accountBackup.delete({ where: { id: backup.id } });
    return restored;
  });

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    provider: user.provider,
  });
});

export default router;
