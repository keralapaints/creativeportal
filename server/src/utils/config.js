// Single source of truth for roles, departments, statuses. The client reads it through GET /api/meta.
// Requirement categories (Campaign Creative, Daily Poster…) live in the database so the admin can add more.

export const ROLES = { director: 'Director', admin: 'Admin', coordinator: 'Coordinator', staff: 'Staff', vendor: 'External Vendor' };
// Directors (CEOs) have exactly the same powers as admins
export const ADMIN_ROLES = ['admin', 'director'];
export const MANAGER_ROLES = [...ADMIN_ROLES, 'coordinator'];

export const DEPARTMENTS = {
  marketing: { label: 'Marketing Team', raises: true, works: false },
  tech: { label: 'Tech/Dev Team', raises: true, works: false },
  outlet: { label: 'Outlet Coordinator', raises: true, works: false },
  production: { label: 'Production Department', raises: true, works: true },
  creative: { label: 'Creative Department', raises: false, works: true },
};
export const WORK_DEPARTMENTS = Object.keys(DEPARTMENTS).filter((d) => DEPARTMENTS[d].works);

// Creative format (what is being made)
export const REQUIREMENT_TYPES = {
  poster: 'Poster', banner: 'Banner', logo: 'Logo', video: 'Video', reel: 'Reel / short video',
  social: 'Social media post', brochure: 'Brochure / flyer', photoshoot: 'Photoshoot', other: 'Other',
};

// Requirement categories seeded on first start (admin can add/rename/hide in Settings)
export const DEFAULT_CATEGORIES = [
  { key: 'campaign', label: 'Campaign Creative', hint: 'For product or brand campaigns' },
  { key: 'daily_poster', label: 'Daily Poster', hint: 'For daily social media or communication' },
  { key: 'printing', label: 'For Printing', hint: 'Posters, banners, brochures, etc.' },
  { key: 'outlet_handover', label: 'For Outlet Handover', hint: 'Materials for new/existing outlets' },
  { key: 'events', label: 'Event Creative', hint: 'For events, exhibitions, etc.' },
  { key: 'digital', label: 'Digital Assets', hint: 'Website, app, email, etc.' },
  { key: 'others', label: 'Others (Custom)', hint: 'Any other requirement' },
];

export const PRIORITIES = ['high', 'medium', 'low'];
export const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };

// Requirement life cycle (flags: yellow ongoing · green fulfilled · orange update needed · blue completed)
export const REQUIREMENT_STATUS = {
  new: 'New',
  approved: 'Approved',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  fulfilled: 'Fulfilled',
  update_needed: 'Update Needed',
  task_completed: 'Completed',
  cancelled: 'Cancelled',
};
export const REQUIREMENT_FLOW = ['new', 'approved', 'assigned', 'in_progress', 'fulfilled', 'update_needed', 'task_completed'];
export const OPEN_REQUIREMENT = ['new', 'approved', 'assigned', 'in_progress', 'update_needed'];
export const FULFILLED_REQUIREMENT = ['fulfilled'];

export const TASK_STATUS = {
  open: 'Not assigned',
  assigned: 'Assigned',
  in_progress: 'In progress',
  paused: 'Paused',
  completed: 'Fulfilled – awaiting review',
  closed: 'Closed',
  cancelled: 'Cancelled',
};
// Same statuses, as shown for outsourced projects
export const OUTSOURCE_STATUS = {
  open: 'Pending', assigned: 'Pending', in_progress: 'Ongoing', paused: 'Paused',
  completed: 'Fulfilled', closed: 'Closed', cancelled: 'Cancelled',
};
export const ACTIVE_TASK = ['open', 'assigned', 'in_progress', 'paused'];

export const PERFORMANCE = { high: 'High Performing', medium: 'Medium', low: 'Low Performing', rejected: 'Rejected' };