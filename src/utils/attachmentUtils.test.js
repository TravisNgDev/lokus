import { describe, it, expect } from 'vitest';
import {
  getAttachmentFolderPath,
  generateAttachmentFilename,
  resolveNoteRelativePath,
  computeRelativePath,
} from './attachmentUtils.js';

describe('getAttachmentFolderPath', () => {
  it('returns attachments subfolder for a workspace path', () => {
    expect(getAttachmentFolderPath('/workspace')).toBe('/workspace/attachments');
  });

  it('strips a trailing slash before appending', () => {
    expect(getAttachmentFolderPath('/workspace/')).toBe('/workspace/attachments');
  });

  it('strips a trailing backslash before appending', () => {
    expect(getAttachmentFolderPath('/workspace\\')).toBe('/workspace/attachments');
  });

  it('returns empty string when workspacePath is empty', () => {
    expect(getAttachmentFolderPath('')).toBe('');
  });

  it('returns empty string when workspacePath is undefined', () => {
    expect(getAttachmentFolderPath(undefined)).toBe('');
  });
});

describe('generateAttachmentFilename', () => {
  it('generates a filename matching the expected pattern for png', () => {
    const name = generateAttachmentFilename('image/png');
    expect(name).toMatch(/^paste-\d{8}-\d{6}-[a-z0-9]{4}\.png$/);
  });

  it('uses jpg extension for image/jpeg', () => {
    const name = generateAttachmentFilename('image/jpeg');
    expect(name).toMatch(/\.jpg$/);
  });

  it('uses jpg extension for image/jpg', () => {
    const name = generateAttachmentFilename('image/jpg');
    expect(name).toMatch(/\.jpg$/);
  });

  it('uses gif extension for image/gif', () => {
    const name = generateAttachmentFilename('image/gif');
    expect(name).toMatch(/\.gif$/);
  });

  it('uses webp extension for image/webp', () => {
    const name = generateAttachmentFilename('image/webp');
    expect(name).toMatch(/\.webp$/);
  });

  it('uses svg extension for image/svg+xml', () => {
    const name = generateAttachmentFilename('image/svg+xml');
    expect(name).toMatch(/\.svg$/);
  });

  it('uses bmp extension for image/bmp', () => {
    const name = generateAttachmentFilename('image/bmp');
    expect(name).toMatch(/\.bmp$/);
  });

  it('falls back to png for unknown mime types', () => {
    const name = generateAttachmentFilename('image/avif');
    expect(name).toMatch(/\.png$/);
  });

  it('falls back to png for empty mime type', () => {
    const name = generateAttachmentFilename('');
    expect(name).toMatch(/\.png$/);
  });

  it('falls back to png for null mime type', () => {
    const name = generateAttachmentFilename(null);
    expect(name).toMatch(/\.png$/);
  });

  it('generates unique filenames when called multiple times', () => {
    const name1 = generateAttachmentFilename('image/png');
    const name2 = generateAttachmentFilename('image/png');
    expect(name1).not.toBe(name2);
  });
});

describe('resolveNoteRelativePath', () => {
  it('resolves a relative path in the same directory', () => {
    expect(
      resolveNoteRelativePath('attachments/img.png', '/workspace/notes/idea.md', '/workspace')
    ).toBe('/workspace/notes/attachments/img.png');
  });

  it('resolves a path with parent directory traversal', () => {
    expect(
      resolveNoteRelativePath('../attachments/img.png', '/workspace/notes/idea.md', '/workspace')
    ).toBe('/workspace/attachments/img.png');
  });

  it('resolves a path with multiple parent directory traversals', () => {
    expect(
      resolveNoteRelativePath('../../attachments/img.png', '/workspace/notes/deep/idea.md', '/workspace')
    ).toBe('/workspace/attachments/img.png');
  });

  it('passes through http URLs unchanged', () => {
    expect(
      resolveNoteRelativePath('https://example.com/img.png', '/workspace/notes/idea.md', '/workspace')
    ).toBe('https://example.com/img.png');
  });

  it('passes through data URIs unchanged', () => {
    expect(
      resolveNoteRelativePath('data:image/png;base64,abc', '/workspace/notes/idea.md', '/workspace')
    ).toBe('data:image/png;base64,abc');
  });

  it('returns empty string for empty relativeSrc', () => {
    expect(resolveNoteRelativePath('', '/workspace/notes/idea.md', '/workspace')).toBe('');
  });

  it('returns relativeSrc unchanged when notePath is missing', () => {
    expect(resolveNoteRelativePath('attachments/img.png', '', '/workspace')).toBe('attachments/img.png');
  });
});

describe('computeRelativePath', () => {
  it('computes path to a sibling directory', () => {
    expect(
      computeRelativePath('/workspace/attachments/img.png', '/workspace/notes/idea.md')
    ).toBe('../attachments/img.png');
  });

  it('computes path in the same directory', () => {
    expect(
      computeRelativePath('/workspace/notes/img.png', '/workspace/notes/idea.md')
    ).toBe('img.png');
  });

  it('computes path from a deeply nested note', () => {
    expect(
      computeRelativePath('/workspace/attachments/img.png', '/workspace/notes/deep/idea.md')
    ).toBe('../../attachments/img.png');
  });

  it('computes path to an ancestor directory', () => {
    expect(
      computeRelativePath('/workspace/img.png', '/workspace/notes/deep/idea.md')
    ).toBe('../../img.png');
  });

  it('returns empty string when absoluteTarget is missing', () => {
    expect(computeRelativePath('', '/workspace/notes/idea.md')).toBe('');
  });

  it('returns absoluteTarget when sourceFilePath is missing', () => {
    expect(computeRelativePath('/workspace/attachments/img.png', '')).toBe('/workspace/attachments/img.png');
  });
});
