import { Response } from 'express';

/**
 * Maps service-layer errors to HTTP replies (LOGIC §6: rejectStart / rejectPush / access denied,
 * plus 400 for invalid input and 404 for missing entities).
 */
export function sendError(res: Response, err: any) {
  if (err?.type === 'rejectStart') {
    return res.status(409).json({ error: 'rejectStart', reason: err.reason });
  }
  if (err?.type === 'rejectPush') {
    return res.status(403).json({ error: 'rejectPush', reason: err.reason });
  }
  if (err?.message === 'access denied') {
    return res.status(403).json({ error: 'access denied' });
  }
  if (typeof err?.message === 'string' && / not found$/.test(err.message)) {
    return res.status(404).json({ error: err.message });
  }
  return res.status(400).json({ error: err?.message || 'Request failed' });
}
