import { Request, Response, Router } from 'express';
import { requirePlayer } from '../privacy/requirePlayer';
import {
  PrivacyError,
  access,
  erase,
  exportPortable,
  notice,
  objectTo,
  rectify,
  restrict,
  setConsent,
} from '../privacy/service';

const router = Router();

function fail(res: Response, error: unknown) {
  if (error instanceof PrivacyError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Request failed' });
}

router.get('/notice', (_req: Request, res: Response) => {
  res.json(notice());
});

router.get('/me', requirePlayer, async (_req: Request, res: Response) => {
  try {
    res.json(await access(res.locals.playerId as string));
  } catch (error) {
    fail(res, error);
  }
});

router.get('/export', requirePlayer, async (_req: Request, res: Response) => {
  try {
    const body = await exportPortable(res.locals.playerId as string);
    res.setHeader('Content-Disposition', 'attachment; filename="chess-export.json"');
    res.json(body);
  } catch (error) {
    fail(res, error);
  }
});

router.patch('/me', requirePlayer, async (req: Request, res: Response) => {
  try {
    res.json(await rectify(res.locals.playerId as string, req.body));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/consent', requirePlayer, async (req: Request, res: Response) => {
  try {
    const granted = req.body?.granted;
    const policyVersion = req.body?.policyVersion;
    if (typeof granted !== 'boolean' || typeof policyVersion !== 'string') {
      res.status(400).json({ error: 'granted and policyVersion are required' });
      return;
    }
    res.json(await setConsent(res.locals.playerId as string, granted, policyVersion));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/restrict', requirePlayer, async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.restricted !== 'boolean') {
      res.status(400).json({ error: 'restricted must be a boolean' });
      return;
    }
    res.json(await restrict(res.locals.playerId as string, req.body.restricted));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/object', requirePlayer, async (req: Request, res: Response) => {
  try {
    if (typeof req.body?.purpose !== 'string') {
      res.status(400).json({ error: 'purpose is required' });
      return;
    }
    res.json(await objectTo(res.locals.playerId as string, req.body.purpose));
  } catch (error) {
    fail(res, error);
  }
});

router.post('/erase', requirePlayer, async (req: Request, res: Response) => {
  try {
    if (req.body?.confirm !== 'DELETE') {
      res.status(400).json({ error: 'confirm must be DELETE' });
      return;
    }
    await erase(res.locals.playerId as string);
    res.clearCookie('guest');
    res.clearCookie('jwt');
    res.clearCookie('connect.sid');
    req.logout(() => {
      res.json({ erased: true });
    });
  } catch (error) {
    fail(res, error);
  }
});

export default router;
