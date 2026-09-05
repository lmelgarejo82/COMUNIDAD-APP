import api from './api.js';

function canonicalUploadPath(fileUrl) {
  if (typeof fileUrl !== 'string' || !fileUrl.startsWith('/uploads/')) return null;
  if (fileUrl.includes('?') || fileUrl.includes('#') || fileUrl.includes('%')) return null;

  const filename = fileUrl.slice('/uploads/'.length);
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(filename)) return null;
  return fileUrl;
}

function safeDownloadName(fileName) {
  if (typeof fileName !== 'string') return null;
  const trimmed = fileName.trim();
  if (!trimmed || trimmed.length > 180 || trimmed === '.' || trimmed === '..') return null;
  if (/[\\/\u0000-\u001f\u007f]/.test(trimmed) || trimmed.includes('..')) return null;
  return trimmed;
}

export async function downloadProtectedUpload(
  fileUrl,
  fileName,
  { client = api, browser = window } = {}
) {
  const protectedPath = canonicalUploadPath(fileUrl);
  if (!protectedPath) throw new Error('La dirección del archivo protegido no es válida.');

  const downloadName = safeDownloadName(fileName);
  if (!downloadName) throw new Error('El nombre de descarga no es válido.');

  const { data } = await client.get(protectedPath, { baseURL: '', responseType: 'blob' });
  const objectUrl = browser.URL.createObjectURL(data);
  let link;
  try {
    link = browser.document.createElement('a');
    link.href = objectUrl;
    link.download = downloadName;
    link.click();
  } finally {
    try {
      link?.remove();
    } finally {
      browser.setTimeout(() => browser.URL.revokeObjectURL(objectUrl), 0);
    }
  }
}
