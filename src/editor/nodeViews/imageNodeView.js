import { convertFileSrc } from '@tauri-apps/api/core'
import { resolveNoteRelativePath } from '../../utils/attachmentUtils.js'

/**
 * ProseMirror NodeView factory for the `image` node.
 *
 * Renders an <img> element. When the image src is a relative local path
 * (not an external URL or data URI), it resolves the path against the
 * current note's directory and rewrites the src to a Tauri asset URL
 * so the WebView can load the file.
 *
 * This keeps the persisted markdown portable (relative paths) while
 * allowing the editor to display local images.
 *
 * @param {import('prosemirror-model').Node} node
 * @returns {import('prosemirror-view').NodeView}
 */
export function imageNodeView(node) {
  const { src, alt, title } = node.attrs

  // Create the img element
  const dom = document.createElement('img')
  dom.setAttribute('alt', alt || '')
  if (title) dom.setAttribute('title', title)
  dom.classList.add('editor-image')

  // Resolve src for rendering
  let resolvedSrc = src

  if (
    src &&
    !src.startsWith('http://') &&
    !src.startsWith('https://') &&
    !src.startsWith('data:')
  ) {
    // Local relative path — resolve against the current note
    const activeFile = globalThis.__LOKUS_ACTIVE_FILE__
    const workspacePath = globalThis.__LOKUS_WORKSPACE_PATH__

    if (activeFile && workspacePath) {
      const absolutePath = resolveNoteRelativePath(src, activeFile, workspacePath)
      resolvedSrc = convertFileSrc(absolutePath)
    }
  }

  dom.setAttribute('src', resolvedSrc)

  return {
    dom,

    /**
     * Called when the node is updated (e.g., undo/redo, attribute change).
     * Returns true if the update was handled in-place.
     */
    update(updatedNode) {
      if (updatedNode.type.name !== 'image') return false

      const newSrc = updatedNode.attrs.src
      let newResolvedSrc = newSrc

      if (
        newSrc &&
        !newSrc.startsWith('http://') &&
        !newSrc.startsWith('https://') &&
        !newSrc.startsWith('data:')
      ) {
        const activeFile = globalThis.__LOKUS_ACTIVE_FILE__
        const workspacePath = globalThis.__LOKUS_WORKSPACE_PATH__

        if (activeFile && workspacePath) {
          const absolutePath = resolveNoteRelativePath(newSrc, activeFile, workspacePath)
          newResolvedSrc = convertFileSrc(absolutePath)
        }
      }

      dom.setAttribute('src', newResolvedSrc)
      dom.setAttribute('alt', updatedNode.attrs.alt || '')
      if (updatedNode.attrs.title) {
        dom.setAttribute('title', updatedNode.attrs.title)
      } else {
        dom.removeAttribute('title')
      }

      return true
    },

    destroy() {
      // No special cleanup needed for a plain DOM element
    },
  }
}

export default imageNodeView
