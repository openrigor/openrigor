import { ArtifactCodeV3 } from "@opencanvas/shared/types";
import React, { MutableRefObject, useEffect, useState } from "react";
import CodeMirror, { EditorView } from "@uiw/react-codemirror";
import styles from "./CodeRenderer.module.css";
import { cleanContent } from "@/lib/normalize_string";
import { cn } from "@/lib/utils";
import { CopyText } from "./components/CopyText";
import { getArtifactContent } from "@opencanvas/shared/utils/artifacts";
import { useGraphContext } from "@/contexts/GraphContext";

export interface CodeRendererProps {
  editorRef: MutableRefObject<EditorView | null>;
  isHovering: boolean;
}

const getLanguageExtension = async (language: string) => {
  switch (language) {
    case "javascript":
      return (await import("@codemirror/lang-javascript")).javascript({
        jsx: true,
        typescript: false,
      });
    case "typescript":
      return (await import("@codemirror/lang-javascript")).javascript({
        jsx: true,
        typescript: true,
      });
    case "cpp":
      return (await import("@codemirror/lang-cpp")).cpp();
    case "java":
      return (await import("@codemirror/lang-java")).java();
    case "php":
      return (await import("@codemirror/lang-php")).php();
    case "python":
      return (await import("@codemirror/lang-python")).python();
    case "html":
      return (await import("@codemirror/lang-html")).html();
    case "sql":
      return (await import("@codemirror/lang-sql")).sql();
    case "json":
      return (await import("@codemirror/lang-json")).json();
    case "rust":
      return (await import("@codemirror/lang-rust")).rust();
    case "xml":
      return (await import("@codemirror/lang-xml")).xml();
    case "clojure":
      return (await import("@nextjournal/lang-clojure")).clojure();
    case "csharp":
      return (await import("@replit/codemirror-lang-csharp")).csharp();
    default:
      return [];
  }
};

export function CodeRendererComponent(props: Readonly<CodeRendererProps>) {
  const { graphData } = useGraphContext();
  const {
    artifact,
    isStreaming,
    updateRenderedArtifactRequired,
    setArtifactContent,
    setUpdateRenderedArtifactRequired,
  } = graphData;

  const [languageExtension, setLanguageExtension] = useState<any>([]);

  useEffect(() => {
    if (updateRenderedArtifactRequired) {
      setUpdateRenderedArtifactRequired(false);
    }
  }, [updateRenderedArtifactRequired]);

  useEffect(() => {
    if (!artifact) {
      return;
    }
    const artifactContent = getArtifactContent(artifact) as ArtifactCodeV3;

    getLanguageExtension(artifactContent.language).then(setLanguageExtension);
  }, [artifact]);

  if (!artifact) {
    return null;
  }

  const artifactContent = getArtifactContent(artifact) as ArtifactCodeV3;
  const extensions = [languageExtension];

  if (!artifactContent.code) {
    return null;
  }

  const isEditable = !isStreaming;

  return (
    <div className="relative">
      {props.isHovering && (
        <div className="absolute top-0 right-4 z-10">
          <CopyText currentArtifactContent={artifactContent} />
        </div>
      )}
      <CodeMirror
        editable={isEditable}
        className={cn("w-full min-h-full", styles.codeMirrorCustom)}
        value={cleanContent(artifactContent.code)}
        height="800px"
        extensions={extensions}
        onChange={(c) => setArtifactContent(artifactContent.index, c)}
        onCreateEditor={(view) => {
          props.editorRef.current = view;
        }}
        data-tracking-id="canvas-editor"
      />
    </div>
  );
}

export const CodeRenderer = React.memo(CodeRendererComponent);
