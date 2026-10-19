export const DAY = 86400000;
export const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
export const endOfToday = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; };
export const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');