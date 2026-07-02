import { Router } from 'express';
import { isValidVideoId, resolveVideoUrl } from '../videoStore.js';

export const videosRouter = Router();

videosRouter.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!isValidVideoId(id)) {
    res.status(400).json({ error: true, message: 'Invalid video id.' });
    return;
  }

  const url = await resolveVideoUrl(id);
  if (!url) {
    res.status(404).json({
      error: true,
      message: 'Video not found. It may have expired, been deleted, or the id is wrong.',
    });
    return;
  }

  res.redirect(302, url);
});
