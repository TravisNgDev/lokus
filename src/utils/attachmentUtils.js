/**
 * Attachment utility functions for clipboard image paste
 *
 * Provides helpers to resolve attachment folder paths, generate filenames,
 * and compute relative paths between notes and their attached images.
 */

/**
 * Return the absolute path to the attachments folder for a given workspace.
 *
 * The attachments folder is always a direct child of the workspace root:
 *   {workspacePath}/attachments
 *
 * Forward slashes are used consistently so the same code works on all
 * platforms (Tauri normalises separators for native file I/O).
 *
 * @param {string} workspacePath - Absolute path to the workspace root.
 * @returns {string} Absolute path to the attachments folder.
 */
export function getAttachmentFolderPath(workspacePath) {
  if (!workspacePath) return '';
  // Strip any trailing slash or backslash, then append /attachments
  const cleaned = workspacePath.replace(/[/\\]+$/, '');
  return `${cleaned}/attachments`;
}

/**
 * Map a MIME type to a file extension.
 *
 * @param {string} mimeType - e.g. 'image/png'.
 * @returns {string} File extension without the leading dot.
 */
function mimeTypeToExtension(mimeType) {
  if (!mimeType) return 'png';
  const type = mimeType.toLowerCase().trim();
  switch (type) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    case 'image/bmp':
      return 'bmp';
    default:
      return 'png';
  }
}

/**
 * Generate a unique filename for a pasted image attachment.
 *
 * Format: paste-{YYYYMMDD}-{HHMMSS}-{4-char-random}.{ext}
 * Example: paste-20250521-143022-a3f7.png
 *
 * @param {string} mimeType - The MIME type of the image (e.g. 'image/png').
 * @returns {string} A unique filename for the attachment.
 */
export function generateAttachmentFilename(mimeType) {
  const ext = mimeTypeToExtension(mimeType);

  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');

  // 4-character random suffix (a-z, 0-9)
  const randomSuffix = Math.random()
    .toString(36)
    .slice(2, 6);

  return `paste-${y}${m}${d}-${h}${min}${s}-${randomSuffix}.${ext}`;
}

/**
 * Resolve a relative image source path to an absolute path.
 *
 * If the source is an external URL (http://, https://, data:) it is
 * returned unchanged. Otherwise it is resolved against the directory
 * that contains the current note.
 *
 * @param {string} relativeSrc - The src attribute from the image node.
 * @param {string} notePath - Absolute path to the current note file.
 * @param {string} workspacePath - Absolute path to the workspace root (unused here, kept for API symmetry).
 * @returns {string} Absolute file path or the original URL.
 */
export function resolveNoteRelativePath(relativeSrc, notePath, workspacePath) {
  if (!relativeSrc) return '';

  // Pass-through for external URLs and data URIs
  if (
    relativeSrc.startsWith('http://') ||
    relativeSrc.startsWith('https://') ||
    relativeSrc.startsWith('data:')
  ) {
    return relativeSrc;
  }

  if (!notePath) return relativeSrc;

  // Get the note's containing directory
  const noteDir = notePath.substring(0, Math.max(notePath.lastIndexOf('/'), notePath.lastIndexOf('\\')));

  // Split and resolve path segments manually (works on all platforms)
  const baseSegments = noteDir.split(/[/\\]/).filter(Boolean);
  const relSegments = relativeSrc.split(/[/\\]/).filter(Boolean);

  for (const segment of relSegments) {
    if (segment === '..') {
      baseSegments.pop();
    } else if (segment !== '.') {
      baseSegments.push(segment);
    }
  }

  // Rebuild as absolute path with forward slashes
  return '/' + baseSegments.join('/');
}

/**
 * Compute the relative path from a source file to a target file.
 *
 * Given the absolute paths of a source note and a target attachment,
 * returns the relative path that can be stored in the note's markdown
 * so the attachment is still found if the workspace is moved.
 *
 * @param {string} absoluteTarget - Absolute path to the target file.
 * @param {string} sourceFilePath - Absolute path to the source note file.
 * @returns {string} Relative path from the source file to the target.
 *
 * @example
 * computeRelativePath('/workspace/attachments/img.png', '/workspace/notes/idea.md')
 * // => '../attachments/img.png'
 */
export function computeRelativePath(absoluteTarget, sourceFilePath) {
  if (!absoluteTarget || !sourceFilePath) return absoluteTarget || '';

  // Extract source directory (drop the filename)
  const sourceDir = sourceFilePath.substring(
    0,
    Math.max(sourceFilePath.lastIndexOf('/'), sourceFilePath.lastIndexOf('\\'))
  );

  // Split both paths into segments, normalising separators
  const targetSegments = absoluteTarget.split(/[/\\]/).filter(Boolean);
  const sourceSegments = sourceDir.split(/[/\\]/).filter(Boolean);

  // Find the length of the common prefix
  let commonLength = 0;
  const maxCommon = Math.min(targetSegments.length, sourceSegments.length);
  while (
    commonLength < maxCommon &&
    targetSegments[commonLength] === sourceSegments[commonLength]
  ) {
    commonLength++;
  }

  // Build the relative path
  const upCount = sourceSegments.length - commonLength;
  const remainingTarget = targetSegments.slice(commonLength);

  const parts = [
    ...Array(upCount).fill('..'),
    ...remainingTarget,
  ];

  return parts.join('/');
}
