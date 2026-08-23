import { PrismAsyncLight } from "react-syntax-highlighter";

import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";

import { coldarkDark } from "react-syntax-highlighter/dist/esm/styles/prism";

// register languages you want to support
PrismAsyncLight.registerLanguage("js", tsx);
PrismAsyncLight.registerLanguage("jsx", tsx);
PrismAsyncLight.registerLanguage("ts", tsx);
PrismAsyncLight.registerLanguage("tsx", tsx);
PrismAsyncLight.registerLanguage("python", python);

const style = coldarkDark;
const customStyle = {
  margin: 0,
  width: "100%",
  background: "transparent",
  padding: "1.5rem 1rem",
};

/**
 * Drop-in replacement for @assistant-ui/react-syntax-highlighter's makePrismAsyncLightSyntaxHighlighter.
 * Uses PrismAsyncLight directly to avoid importing all highlighter variants (saves ~2.5MB).
 */
export function SyntaxHighlighter({
  components: { Pre, Code },
  language,
  code,
}: {
  components: { Pre: React.ElementType; Code: React.ElementType };
  language: string;
  code: string;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Highlighter = PrismAsyncLight as any;
  return (
    <Highlighter
      PreTag={Pre}
      CodeTag={Code}
      style={style}
      customStyle={customStyle}
      language={language}
    >
      {code}
    </Highlighter>
  );
}
