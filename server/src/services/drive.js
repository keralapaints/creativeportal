// Google Drive link checks. Without GOOGLE_API_KEY only the link format is checked.
const DRIVE_HOST = /^https:\/\/(drive|docs)\.google\.com\//i;

export function driveFileId(url) {
  const m = url.match(/\/d\/([\w-]{10,})/) || url.match(/[?&]id=([\w-]{10,})/) || url.match(/\/folders\/([\w-]{10,})/);
  return m ? m[1] : null;
}

export async function checkDriveLink(raw) {
  const url = (raw || '').trim();
  if (!url) return { valid: false, message: 'Add the Google Drive link for the finished work.' };
  if (!DRIVE_HOST.test(url)) return { valid: false, message: 'Use a Google Drive or Google Docs link (https://drive.google.com/…).' };
  const id = driveFileId(url);
  if (!id) return { valid: false, message: 'This link does not point to a Drive file or folder. Copy it from "Share > Copy link".' };

  const key = process.env.GOOGLE_API_KEY;
  if (!key) return { valid: true, checked: false, url };
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?fields=id,name,mimeType&supportsAllDrives=true&key=${key}`);
    if (r.ok) {
      const d = await r.json();
      return { valid: true, checked: true, accessible: true, name: d.name, url };
    }
    if (r.status === 404 || r.status === 403) {
      return { valid: true, checked: true, accessible: false, url, message: 'The link works, but the file is not shared. Set sharing to "Anyone with the link".' };
    }
    return { valid: true, checked: false, url };
  } catch {
    return { valid: true, checked: false, url };
  }
}