import { Router } from 'express';
import { protect } from '../middleware/auth.js';
import { checkDriveLink } from '../services/drive.js';

const router = Router();
router.use(protect);

// Lets the form check a link before submitting
router.post('/validate', async (req, res) => {
  res.json(await checkDriveLink(req.body.url));
});

export default router;