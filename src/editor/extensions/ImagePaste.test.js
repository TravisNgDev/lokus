import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createImagePastePlugin } from './ImagePaste.js';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../platform/index.js', () => ({
  isDesktop: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

import { isDesktop } from '../../platform/index.js';
import { invoke } from '@tauri-apps/api/core';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeView() {
  const mockImageNode = { type: { name: 'image' }, attrs: {} };

  const mockTr = {
    replaceSelectionWith: vi.fn().mockReturnThis(),
  };

  const state = {
    selection: {
      $from: { parent: { type: { name: 'paragraph' } } },
    },
    schema: {
      nodes: {
        image: {
          create: vi.fn(() => mockImageNode),
        },
      },
    },
    tr: mockTr,
  };

  return { state, dispatch: vi.fn(), _mockTr: mockTr, _mockImageNode: mockImageNode };
}

function makeClipboardEvent({ items = null, files = null } = {}) {
  return {
    clipboardData: {
      items: items ? items.map((type) => ({
        type,
        getAsFile: () => ({
          type,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        }),
      })) : null,
      files: files ? files.map((type) => {
        const fileLike = {
          type,
          arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
        };
        // getAsFile is checked first in the plugin, so add it to file mocks
        // so the fallback path works in tests
        fileLike.getAsFile = () => fileLike;
        return fileLike;
      }) : null,
    },
    preventDefault: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ImagePaste Plugin (ProseMirror)', () => {
  let plugin;
  let handlePaste;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    plugin = createImagePastePlugin();
    handlePaste = plugin.props.handlePaste;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete globalThis.__LOKUS_WORKSPACE_PATH__;
    delete globalThis.__LOKUS_ACTIVE_FILE__;
  });

  // ── Plugin shape ───────────────────────────────────────────────────────────

  describe('Plugin shape', () => {
    it('returns an object with a props.handlePaste function', () => {
      expect(plugin).toBeDefined();
      expect(plugin.props).toBeDefined();
      expect(typeof plugin.props.handlePaste).toBe('function');
    });
  });

  // ── Platform gating ──────────────────────────────────────────────────────

  describe('Platform gating', () => {
    it('returns false on non-desktop platforms', () => {
      isDesktop.mockReturnValue(false);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      const result = handlePaste(view, event);

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('proceeds on desktop platforms', () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      // Set up workspace globals so the async block doesn't bail early
      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';

      const result = handlePaste(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  // ── Clipboard detection ────────────────────────────────────────────────────

  describe('Clipboard detection', () => {
    it('returns false when clipboardData is null', () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = { clipboardData: null, preventDefault: vi.fn() };

      const result = handlePaste(view, event);

      expect(result).toBe(false);
    });

    it('returns false when no image items are present', () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['text/plain'] });

      const result = handlePaste(view, event);

      expect(result).toBe(false);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('detects image in clipboardData.items', () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';

      const result = handlePaste(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });

    it('falls back to clipboardData.files when items has no images', () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({
        items: ['text/plain'],
        files: ['image/png'],
      });

      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';

      const result = handlePaste(view, event);

      expect(result).toBe(true);
      expect(event.preventDefault).toHaveBeenCalled();
    });
  });

  // ── Async save & insert ──────────────────────────────────────────────────

  describe('Async save and insert', () => {
    it('calls create_directory, write_binary_file, and dispatches a transaction', async () => {
      isDesktop.mockReturnValue(true);
      invoke.mockResolvedValue(undefined);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';

      handlePaste(view, event);

      // Wait for the async IIFE to complete
      await vi.runAllTimersAsync();

      expect(invoke).toHaveBeenCalledWith('create_directory', {
        path: '/workspace/attachments',
        recursive: true,
      });

      expect(invoke).toHaveBeenCalledWith('write_binary_file', expect.objectContaining({
        path: expect.stringMatching(/\/workspace\/attachments\/paste-\d{8}-\d{6}-[a-z0-9]{4}\.png/),
        content: expect.any(Array),
      }));

      expect(view.state.schema.nodes.image.create).toHaveBeenCalledWith(expect.objectContaining({
        src: expect.stringMatching(/^\.\.\/attachments\/paste-/),
        alt: expect.stringMatching(/^paste-/),
        title: null,
      }));

      expect(view._mockTr.replaceSelectionWith).toHaveBeenCalledWith(view._mockImageNode);
      expect(view.dispatch).toHaveBeenCalledWith(view._mockTr);
    });
  });

  // ── Error handling ───────────────────────────────────────────────────────

  describe('Error handling', () => {
    it('logs an error and does not crash when invoke fails', async () => {
      isDesktop.mockReturnValue(true);
      invoke.mockRejectedValue(new Error('Disk full'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';

      handlePaste(view, event);
      await vi.runAllTimersAsync();

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ImagePaste] Failed to save pasted image:',
        expect.any(Error)
      );
      expect(view.dispatch).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('bails early when workspace path is missing', async () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      // Only activeFile is set, workspace path is missing
      globalThis.__LOKUS_ACTIVE_FILE__ = '/workspace/notes/idea.md';
      // __LOKUS_WORKSPACE_PATH__ is undefined

      handlePaste(view, event);
      await vi.runAllTimersAsync();

      expect(invoke).not.toHaveBeenCalled();
      expect(view.dispatch).not.toHaveBeenCalled();
    });

    it('bails early when active file is missing', async () => {
      isDesktop.mockReturnValue(true);

      const view = makeView();
      const event = makeClipboardEvent({ items: ['image/png'] });

      globalThis.__LOKUS_WORKSPACE_PATH__ = '/workspace';
      // __LOKUS_ACTIVE_FILE__ is undefined

      handlePaste(view, event);
      await vi.runAllTimersAsync();

      expect(invoke).not.toHaveBeenCalled();
      expect(view.dispatch).not.toHaveBeenCalled();
    });
  });
});
