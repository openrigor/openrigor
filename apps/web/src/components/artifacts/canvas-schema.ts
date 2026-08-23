import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";

import { DetailsBlock } from "./DetailsBlock";
import { MermaidBlock } from "./MermaidBlock";

export const canvasSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    details: DetailsBlock,
    mermaid: MermaidBlock,
  },
});
