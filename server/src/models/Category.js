import mongoose from 'mongoose';
import { DEFAULT_CATEGORIES } from '../utils/config.js';

// Requirement categories (Campaign Creative, Daily Poster, …). Admin can add more.
const categorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true },
    hint: { type: String, trim: true },
    order: { type: Number, default: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
const Category = mongoose.model('Category', categorySchema);

export async function ensureCategories() {
  if (await Category.estimatedDocumentCount()) return;
  await Category.insertMany(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, order: i })));
}

// { key: { label, hint, active } } in display order
export async function categoryMap() {
  const list = await Category.find().sort({ order: 1, label: 1 }).lean();
  return Object.fromEntries(list.map((c) => [c.key, { label: c.label, hint: c.hint, active: c.active, order: c.order }]));
}

export default Category;