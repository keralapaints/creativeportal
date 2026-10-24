import { Router } from 'express';
import Category from '../models/Category.js';
import { protect, allowAdmin } from '../middleware/auth.js';

const router = Router();
router.use(protect);

const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);

router.get('/', async (_req, res) => {
  res.json(await Category.find().sort({ order: 1, label: 1 }));
});

// Requirement categories are customizable by the admin
router.post('/', allowAdmin, async (req, res) => {
  const label = req.body.label?.trim();
  if (!label) return res.status(400).json({ message: 'Give the category a name.' });
  const key = slug(req.body.key || label);
  if (!key) return res.status(400).json({ message: 'Use letters or numbers in the name.' });
  if (await Category.findOne({ key })) return res.status(400).json({ message: 'A category with this name already exists.' });
  const last = await Category.findOne().sort({ order: -1 });
  res.status(201).json(await Category.create({ key, label, hint: req.body.hint, order: (last?.order ?? -1) + 1 }));
});

router.patch('/:id', allowAdmin, async (req, res) => {
  const c = await Category.findById(req.params.id);
  if (!c) return res.status(404).json({ message: 'Category not found.' });
  ['label', 'hint', 'active', 'order'].forEach((f) => { if (req.body[f] !== undefined) c[f] = req.body[f]; });
  await c.save();
  res.json(c);
});

export default router;