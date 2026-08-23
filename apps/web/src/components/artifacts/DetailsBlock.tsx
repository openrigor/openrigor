import { createReactBlockSpec } from "@blocknote/react";

const detailsPropSchema = {
  summary: {
    default: "Details",
  },
  open: {
    default: false,
  },
} as const;

function DetailsBlockRender({ block, editor }: any) {
  const open = block.props.open === true;

  return (
    <details
      className="bn-details-block"
      open={open}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        if (nextOpen !== open) {
          editor.updateBlock(block, { props: { open: nextOpen } });
        }
      }}
    >
      <summary className="bn-details-summary">{block.props.summary}</summary>
    </details>
  );
}

function DetailsToExternalHTML({ block }: any) {
  return (
    <details open={block.props.open === true}>
      <summary>{block.props.summary}</summary>
    </details>
  );
}

/**
 * A compact BlockNote 0.18 custom block backed by a Tiptap node. BlockNote
 * stores nested content in the block's children, while the native details
 * element owns the summary. The accompanying global selector hides those
 * children whenever this block is closed.
 */
export const DetailsBlock = createReactBlockSpec(
  {
    type: "details",
    propSchema: detailsPropSchema,
    content: "none",
  },
  {
    render: DetailsBlockRender,
    toExternalHTML: DetailsToExternalHTML,
  }
);
