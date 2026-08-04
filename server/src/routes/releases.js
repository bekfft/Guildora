import { Router } from 'express';
import { getLatestRelease } from '../services/releaseService.js';

const router = Router();

router.get('/releases/latest', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store');
    res.json(await getLatestRelease());
  } catch (error) {
    next(error);
  }
});

router.get('/download/windows', async (req, res, next) => {
  try {
    const release = await getLatestRelease();
    res.redirect(302, release.windows.url);
  } catch (error) {
    next(error);
  }
});

export default router;
