import React, { Suspense, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import type { Components } from "react-markdown";

import "katex/dist/katex.min.css";

interface PrintViewProps {
  markdown: string;
}

const MermaidCodeRenderer = React.lazy(async () => {
  const { renderMermaidSVG } = await import("beautiful-mermaid");

  return {
    default: function MermaidCodeBlock({ code }: { code: string }) {
      const svg = useMemo(() => {
        try {
          return renderMermaidSVG(code, {
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

      if (!svg) {
        return (
          <pre className="overflow-x-auto rounded border bg-gray-50 p-4">
            <code>{code}</code>
          </pre>
        );
      }

      return (
        <div
          className="mermaid-svg-container my-4 text-center"
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      );
    },
  };
});

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || "");
    const language = match ? match[1] : null;
    const isInline = !match;

    if (!isInline && language === "mermaid") {
      const code = String(children).replace(/\n$/, "");
      return (
        <Suspense
          fallback={<div className="p-4 text-gray-500">Loading diagram...</div>}
        >
          <MermaidCodeRenderer code={code} />
        </Suspense>
      );
    }

    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  h1: ({ children }) => (
    <h1 className="mb-4 text-2xl font-bold text-black">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-3 text-xl font-bold text-black">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 text-lg font-bold text-black">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-2 text-base font-bold text-black">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-3 leading-relaxed text-black">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="mb-3 list-disc space-y-1 pl-6">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-6">{children}</ol>
  ),
  li: ({ children }) => <li className="ml-2 text-black">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-3 border-l-4 border-gray-300 bg-gray-50 py-2 pl-4">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <table className="mb-4 w-full border-collapse border border-gray-300">
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th className="border border-gray-300 bg-gray-100 px-4 py-2 text-left font-bold text-black">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-gray-300 px-4 py-2 text-black">{children}</td>
  ),
};

export function PrintView({ markdown }: PrintViewProps) {
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

  return (
    <>
      <style>{`
        @media print {
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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

          .mermaid-svg-container svg {
            max-width: 100% !important;
            height: auto !important;
            page-break-inside: avoid;
          }

          .katex {
            font-size: 1em !important;
            color: black !important;
          }

          .katex-display {
            margin: 1em 0 !important;
            text-align: center !important;
          }

          h1, h2, h3 {
            page-break-after: avoid;
          }

          p, li {
            page-break-inside: avoid;
          }

          table {
            page-break-inside: avoid;
          }

          @page {
            margin: 0.75in;
          }
        }
      `}</style>
      <div
        id="print-root"
        className="print-view mx-auto max-w-none bg-white p-6 text-black"
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
