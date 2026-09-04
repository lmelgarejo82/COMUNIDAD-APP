const fs = require('fs');
const path = require('path');

const UPLOAD_DIRECTORY = path.resolve(__dirname, '..', 'uploads');

function decodeUploadPath(rawPath) {
  let decoded = rawPath;
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }
  return decoded;
}

function resolveRequestedUpload(rawPath) {
  if (typeof rawPath !== 'string') return null;
  const decoded = decodeUploadPath(rawPath);
  if (!decoded) return null;

  const filename = decoded.startsWith('/') ? decoded.slice(1) : decoded;
  if (
    !filename
    || filename.includes('/')
    || filename.includes('\\')
    || filename.includes('\0')
    || filename.includes('%')
    || filename === '.'
    || filename === '..'
  ) {
    return null;
  }

  const absolutePath = path.resolve(UPLOAD_DIRECTORY, filename);
  const relativePath = path.relative(UPLOAD_DIRECTORY, absolutePath);
  if (
    relativePath !== filename
    || relativePath.startsWith(`..${path.sep}`)
    || path.isAbsolute(relativePath)
  ) {
    return null;
  }

  return {
    filename,
    fileUrl: `/uploads/${filename}`,
    absolutePath,
  };
}

function canonicalStoredUploadUrl(value) {
  if (typeof value !== 'string' || !value.startsWith('/uploads/')) return null;
  const resolved = resolveRequestedUpload(value.slice('/uploads'.length));
  return resolved && resolved.fileUrl === value ? resolved.fileUrl : null;
}

async function removeUploadedFile(file) {
  if (!file?.path) return false;
  const absolutePath = path.resolve(file.path);
  const relativePath = path.relative(UPLOAD_DIRECTORY, absolutePath);
  if (!relativePath || relativePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativePath)) {
    return false;
  }

  try {
    await fs.promises.unlink(absolutePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  UPLOAD_DIRECTORY,
  canonicalStoredUploadUrl,
  removeUploadedFile,
  resolveRequestedUpload,
};
