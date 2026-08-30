import React, {
  Suspense,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import rehypeKatex from "rehype-katex";
import { unified } from "unified";
import { Components } from "react-markdown";

import "katex/dist/katex.min.css";
import { normalizeMermaidSource } from "./mermaid-source";

interface PrintViewProps {
  markdown: string;
  onReady?: () => void;
}

interface MdastNode {
  type: string;
  lang?: string | null;
  children?: MdastNode[];
}

function countMermaidInTree(node: MdastNode): number {
  let count =
    node.type === "code" && node.lang?.toLowerCase() === "mermaid" ? 1 : 0;
  const children = node.children;
  if (!children) return count;
  for (const child of children) {
    count += countMermaidInTree(child);
  }
  return count;
}

function countMermaidCodeBlocks(markdown: string): number {
  const processor = unified().use(remarkParse).use(remarkMath).use(remarkGfm);
  const tree = processor.runSync(processor.parse(markdown)) as MdastNode;
  return countMermaidInTree(tree);
}

// Lazy load beautiful-mermaid to keep initial bundle small
const MermaidCodeRenderer = React.lazy(async () => {
  const { renderMermaidSVG } = await import("beautiful-mermaid");

  return {
    default: function MermaidCodeBlock({
      code,
      onReady,
    }: {
      code: string;
      onReady: (id: string) => void;
    }) {
      const mermaidId = useId();
      const svg = useMemo(() => {
        try {
          return renderMermaidSVG(normalizeMermaidSource(code), {
            bg: "white",
            fg: "black",
            accent: "#3b82f6",
            muted: "#6b7280",
            border: "#e5e7eb",
            transparent: false,
          });
        } catch (error) {
          console.error("Mermaid render error:", error);
          return null;
        }
      }, [code]);

      useEffect(() => {
        onReady(mermaidId);
      }, [mermaidId, onReady]);

      if (!svg) {
        return (
          <pre
            className="bg-gray-50 p-4 rounded border overflow-x-auto"
            data-print-mermaid="true"
            data-print-ready="true"
          >
            <code>{code}</code>
          </pre>
        );
      }

      return (
        <div
          className="mermaid-svg-container my-4 text-center"
          data-print-mermaid="true"
          data-print-ready="true"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    },
  };
});

function createMarkdownComponents(onMermaidReady: (id: string) => void) {
  return {
    code({ inline, className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const language = match ? match[1] : null;
      const isMermaid = language?.toLowerCase() === "mermaid";

      if (!inline && isMermaid) {
        const code = String(children).replace(/\n$/, "");
        return (
          <Suspense
            fallback={
              <div className="p-4 text-gray-500" data-print-ready="false">
                Loading diagram...
              </div>
            }
          >
            <MermaidCodeRenderer code={code} onReady={onMermaidReady} />
          </Suspense>
        );
      }

      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    // Ensure proper print styling for other elements
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold mb-4 text-black">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-bold mb-3 text-black">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-lg font-bold mb-2 text-black">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-base font-bold mb-2 text-black">{children}</h4>
    ),
    p: ({ children }) => (
      <p className="mb-3 text-black leading-relaxed">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
    ),
    li: ({ children }) => <li className="text-black ml-2">{children}</li>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-gray-300 pl-4 py-2 mb-3 bg-gray-50">
        {children}
      </blockquote>
    ),
    table: ({ children }) => (
      <table className="border-collapse border border-gray-300 w-full mb-4">
        {children}
      </table>
    ),
    th: ({ children }) => (
      <th className="border border-gray-300 px-4 py-2 text-left font-bold text-black bg-gray-100">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="border border-gray-300 px-4 py-2 text-black">
        {children}
      </td>
    ),
  } satisfies Components;
}

export function PrintView({ markdown, onReady }: PrintViewProps) {
  // Fix malformed tables: remove empty header rows so the real content
  // row becomes the table header (styled with bg-gray-100 by th component).
  // Markdown source has: | empty | empty | \n | --- | --- | \n | content | content |
  // We transform to:      | content | content | \n | --- | --- |
  const fixedMarkdown = useMemo(() => {
    return markdown.replace(
      /^(\|(?:\s*\|)+)\s*\n(\|(?:\s*[-:]+\s*\|)+)\s*\n(\|[^\n]+)\n/gm,
      (_match, _emptyRow, _separator, contentRow: string) => {
        const numCols = contentRow.split("|").length - 2;
        const sep = "|" + Array(numCols).fill(" --- ").join("|") + "|";
        return contentRow + "\n" + sep + "\n";
      }
    );
  }, [markdown]);

  const mermaidCount = useMemo(
    () => countMermaidCodeBlocks(fixedMarkdown),
    [fixedMarkdown]
  );
  const [readyMermaidIds, setReadyMermaidIds] = useState<Set<string>>(
    () => new Set()
  );
  const handleMermaidReady = useCallback((id: string) => {
    setReadyMermaidIds((readyIds) => {
      if (readyIds.has(id)) return readyIds;
      const nextReadyIds = new Set(readyIds);
      nextReadyIds.add(id);
      return nextReadyIds;
    });
  }, []);
  const isReady = readyMermaidIds.size >= mermaidCount;
  const markdownComponents = useMemo(
    () => createMarkdownComponents(handleMermaidReady),
    [handleMermaidReady]
  );

  useEffect(() => {
    if (isReady) onReady?.();
  }, [isReady, onReady]);

  return (
    <>
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            color-adjust: exact !important;
          }
          
          body * {
            visibility: hidden;
          }
          
          #print-root,
          #print-root * {
            visibility: visible;
          }
          
          #print-root {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
          }
          
          .no-print {
            display: none !important;
          }
          
          /* Ensure Mermaid SVGs print correctly */
          .mermaid-svg-container svg {
            max-width: 100% !important;
            height: auto !important;
            page-break-inside: avoid;
          }
          
          /* KaTeX math styling for print */
          .katex {
            font-size: 1em !important;
            color: black !important;
          }
          
          .katex-display {
            margin: 1em 0 !important;
            text-align: center !important;
          }
          
          /* Page break controls */
          h1, h2, h3 {
            page-break-after: avoid;
          }
          
          p, li {
            page-break-inside: avoid;
          }
          
          table {
            page-break-inside: avoid;
          }
          
          /* Print margins with page numbers (Chrome 131+) */
          @page {
            margin: 0.75in;
            @bottom-center {
              content: "Page " counter(page);
              font-family: Arial, sans-serif;
              font-size: 10pt;
              color: #666;
            }
          }
        }
      `}</style>
      <div
        id="print-root"
        className="print-view max-w-none mx-auto p-6 bg-white text-black"
        data-print-ready={isReady ? "true" : "false"}
      >
        <div className="prose prose-lg max-w-none">
          <ReactMarkdown
            components={markdownComponents}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {fixedMarkdown}
          </ReactMarkdown>
        </div>
      </div>
    </>
  );
}
