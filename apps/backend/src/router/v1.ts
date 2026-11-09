import { Request, Response, Router } from 'express';
import { publicProfile } from '../privacy/service';

const v1Router = Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const hits = new Map<string, { count: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  const current = hits.get(ip);
  if (!current || now > current.reset) {
    hits.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

v1Router.get('/', (_req, res) => {
  res.send('Hello, World!');
});

v1Router.get('/users/:id/profile', async (req: Request, res: Response) => {
  const ip = req.ip || 'unknown';
  if (limited(ip)) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  if (!UUID.test(req.params.id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const profile = await publicProfile(req.params.id);
    if (!profile) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json(profile);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Request failed' });
  }
});

export default v1Router;
