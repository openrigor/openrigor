import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { DiffRange } from "@/lib/diffing";

/**
 * TipTap extension that applies yellow inline decorations to AI-changed text.
 * Uses ProseMirror's decoration system so decorations survive DOM reconciliation.
 *
 * Update decorations by dispatching a transaction with meta key:
 *   editor.view.dispatch(
 *     editor.view.state.tr.setMeta(trackChangesPluginKey, { ranges })
 *   );
 */
export const trackChangesPluginKey = new PluginKey("trackChanges");

// Global state: ranges read by the plugin's decorations method
let _currentRanges: DiffRange[] = [];

export function setTrackChangesRanges(ranges: DiffRange[]) {
  _currentRanges = ranges;
}

export function clearTrackChangesRanges() {
  _currentRanges = [];
}

const TrackChangesExtension = Extension.create({
  name: "trackChanges",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: trackChangesPluginKey,
        props: {
          decorations(state) {
            const ranges = _currentRanges;
            if (!ranges || ranges.length === 0) return DecorationSet.empty;

            const decorations: Decoration[] = [];
            const doc = state.doc;

            for (const range of ranges) {
              const docSize = doc.content.size;
              // Map text offsets to ProseMirror positions
              // ProseMirror positions are 1-based and account for node boundaries
              let textOffset = 0;

              doc.descendants((node, pos) => {
                if (!node.isText) return true; // descend into children

                const nodeLen = node.text?.length || 0;
                const nodeStart = textOffset;
                const nodeEnd = textOffset + nodeLen;

                // Check overlap with the range
                if (nodeEnd > range.start && nodeStart < range.end) {
                  const overlapStart = Math.max(range.start - nodeStart, 0);
                  const overlapEnd = Math.min(range.end - nodeStart, nodeLen);

                  const from = pos + overlapStart;
                  const to = pos + overlapEnd;

                  if (from < docSize && to <= docSize && from < to) {
                    decorations.push(
                      Decoration.inline(from, to, {
                        class: "ai-edit-highlight",
                        style: "background-color: #F08080; border-radius: 2px;",
                        "data-testid": "ai-highlight",
                      })
                    );
                  }
                }

                textOffset += nodeLen;
                return false; // don't descend into text node children
              });
            }

            return DecorationSet.create(doc, decorations);
          },
        },
      }),
    ];
  },
});

export default TrackChangesExtension;
