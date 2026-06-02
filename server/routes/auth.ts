import { Router, Request, Response } from 'express';
import { getDb } from '../db.js';

const router = Router();

router.post('/login', (req: Request, res: Response) => {
  const { pin } = req.body;

  if (!pin || typeof pin !== 'string' || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    res.status(400).json({ error: 'A valid 4-digit PIN is required' });
    return;
  }

  const db = getDb();
  const user = db.prepare(
    'SELECT pin, created_at, condition_order, current_study_day FROM users WHERE pin = ? AND is_active = 1'
  ).get(pin);

  if (!user) {
    res.status(401).json({ error: 'Invalid PIN. Please contact the study administrator.' });
    return;
  }

  res.json({ success: true, user });
});

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ success: true });
});

export default router;
