import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { normalizeHtmlTablesForMarkdown } from "@/lib/markdownHtmlTables.mjs";

const components: any = {
  h1: ({ children, ...props }: any) => <h1 className="text-xl font-bold mt-5 mb-2 border-b pb-0.5" {...props}>{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 className="text-lg font-bold mt-4 mb-1.5 border-b pb-0.5" {...props}>{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 className="text-base font-semibold mt-3 mb-1" {...props}>{children}</h3>,
  h4: ({ children, ...props }: any) => <h4 className="text-sm font-semibold mt-2 mb-1" {...props}>{children}</h4>,
  h5: ({ children, ...props }: any) => <h5 className="text-xs font-semibold mt-2 mb-0.5" {...props}>{children}</h5>,
  h6: ({ children, ...props }: any) => <h6 className="text-[11px] font-semibold mt-2 mb-0.5 uppercase tracking-wide" {...props}>{children}</h6>,
  img: ({ src, alt, ...props }: any) => (
    <span className="my-3 mx-auto block w-[calc(100%-0.5rem)] max-w-[calc(100%-0.5rem)] text-center">
      <img {...props} src={src} alt={alt} className="inline-block h-auto max-h-[50vh] w-auto max-w-full rounded-lg object-contain align-middle" />
    </span>
  ),
  table: ({ children, ...props }: any) => (
    <div className="my-3 mx-auto block w-[calc(100%-0.5rem)] min-w-0 max-w-[calc(100%-0.5rem)] rounded-md border font-sans">
      <table {...props} className="w-full max-w-full table-fixed border-collapse text-sm">{children}</table>
    </div>
  ),
  thead: ({ children, ...props }: any) => <thead className="bg-muted/70" {...props}>{children}</thead>,
  tr: ({ children, ...props }: any) => <tr className="border-b last:border-b-0" {...props}>{children}</tr>,
  th: ({ children, ...props }: any) => <th className="border-r px-3 py-2 text-left align-top font-semibold [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</th>,
  td: ({ children, ...props }: any) => <td className="border-r px-3 py-2 align-top [overflow-wrap:anywhere] break-words whitespace-normal last:border-r-0" {...props}>{children}</td>,
};

function ChatMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
      components={components}
    >
      {normalizeHtmlTablesForMarkdown(String(children || ""))}
    </ReactMarkdown>
  );
}

export default memo(ChatMarkdown);
