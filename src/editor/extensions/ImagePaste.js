import { Plugin } from 'prosemirror-state'
import { isDesktop } from '../../platform/index.js'
import { invoke } from '@tauri-apps/api/core'
import {
  getAttachmentFolderPath,
  generateAttachmentFilename,
  computeRelativePath,
} from '../../utils/attachmentUtils.js'

/**
 * Creates the ImagePaste ProseMirror plugin.
 *
 * Intercepts paste events on desktop, detects image data in the clipboard,
 * saves the image to the workspace's attachments folder, and inserts an
 * `image` node with a relative path so the markdown stays portable.
 *
 * @returns {Plugin}
 */
export function createImagePastePlugin() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        // 2.1.1 Desktop-only gate
        if (!isDesktop()) return false

        const clipboardData = event.clipboardData
        if (!clipboardData) return false

        // 2.1.2 Detect image in clipboard items
        let imageItem = null
        let imageMimeType = null

        // Try clipboardData.items first
        if (clipboardData.items) {
          for (let i = 0; i < clipboardData.items.length; i++) {
            if (clipboardData.items[i].type.startsWith('image/')) {
              imageItem = clipboardData.items[i]
              imageMimeType = clipboardData.items[i].type
              break
            }
          }
        }

        // Fallback: check clipboardData.files
        if (!imageItem && clipboardData.files) {
          for (let i = 0; i < clipboardData.files.length; i++) {
            if (clipboardData.files[i].type.startsWith('image/')) {
              imageItem = clipboardData.files[i]
              imageMimeType = clipboardData.files[i].type
              break
            }
          }
        }

        if (!imageItem) return false // Let other plugins handle it

        // 2.1.3 Extract blob from clipboard
        let blob = null
        if (typeof imageItem.getAsFile === 'function') {
          blob = imageItem.getAsFile()
        } else if (imageItem instanceof File) {
          blob = imageItem
        }

        if (!blob) return false

        // 2.1.4 Prevent default paste behaviour immediately
        event.preventDefault()

        // 2.1.5–2.1.9 Perform the save and insert asynchronously
        ;(async () => {
          try {
            const workspacePath = globalThis.__LOKUS_WORKSPACE_PATH__
            const activeFile = globalThis.__LOKUS_ACTIVE_FILE__
            if (!workspacePath || !activeFile) return

            // 2.1.5 Convert blob to ArrayBuffer
            const buffer = await blob.arrayBuffer()

            // 2.1.6 Ensure attachments folder exists
            const attachmentFolder = getAttachmentFolderPath(workspacePath)
            await invoke('create_directory', {
              path: attachmentFolder,
              recursive: true,
            })

            // 2.1.7 Generate filename and write file
            const fileName = generateAttachmentFilename(imageMimeType)
            const absoluteFilePath = `${attachmentFolder}/${fileName}`
            const uint8Array = new Uint8Array(buffer)
            await invoke('write_binary_file', {
              path: absoluteFilePath,
              content: Array.from(uint8Array),
            })

            // 2.1.8 Compute relative path from current note to the image
            const relativeSrc = computeRelativePath(absoluteFilePath, activeFile)

            // 2.1.9 Insert image node into ProseMirror document
            const { state } = view
            const imageNode = state.schema.nodes.image.create({
              src: relativeSrc,
              alt: fileName,
              title: null,
            })

            const tr = state.tr.replaceSelectionWith(imageNode)
            view.dispatch(tr)
          } catch (err) {
            console.error('[ImagePaste] Failed to save pasted image:', err)
          }
        })()

        return true
      },
    },
  })
}

export default createImagePastePlugin
