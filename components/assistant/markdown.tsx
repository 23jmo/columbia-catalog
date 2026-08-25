import Link from "next/link";

import { parseMarkdown, type Block, type Inline } from "@/lib/agent/markdown";
import { cx } from "@/utils/cx";

/**
 * Assistant prose, as markdown.
 *
 * The parser lives in `lib/agent/markdown.ts` so a test can pin the subset
 * without mounting React. This file is the BoardUI-token skin: no raw hex, no
 * `dark:` prefixes, no raw weights — a bold run is `text-headline-semibold`,
 * the composite, not `font-semibold` bolted onto whatever size it inherited.
 *
 * ── The ramp, and why the two code cases differ ────────────────────────────
 *
 * Prose sits at `headline` (16), one step up from `body`, matching the user's
 * own bubble in `conversation.tsx` — the two halves of a conversation reading
 * at different sizes is a hierarchy nobody asked for. Headings moved up with
 * it: at `headline` an h2 would have been the same 16px as the paragraph under
 * it, which is not a heading.
 *
 * Inline `code` tracks the prose at `body` (14). It sits inside a line of
 * text, so it has to share that line's metrics — at 13 inside 16 it drops off
 * the baseline and the line grows a visible step. A `pre` block is standalone
 * and stays at `body-2` (13), where compact is the right answer and there is
 * no line for it to break.
 */

export function AssistantMarkdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const blocks = parseMarkdown(source);
  if (blocks.length === 0) return null;

  return (
    <div className={cx("flex max-w-[88ch] flex-col gap-3 text-headline-regular text-text-primary", className)}>
      {blocks.map((block, index) => (
        <MarkdownBlock key={index} block={block} />
      ))}
    </div>
  );
}

function MarkdownBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "p":
      return (
        <p className="text-headline-regular text-text-primary">
          <InlineNodes nodes={block.children} />
        </p>
      );
    case "h":
      return (
        <p
          role="heading"
          aria-level={block.level}
          className={cx(
            "text-text-primary",
            block.level === 1 ? "text-title-2-semibold" : "text-title-3-semibold",
          )}
        >
          <InlineNodes nodes={block.children} />
        </p>
      );
    case "ul":
      return (
        <ul className="flex list-disc flex-col gap-1 ps-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineNodes nodes={item} />
            </li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="flex list-decimal flex-col gap-1 ps-5">
          {block.items.map((item, index) => (
            <li key={index}>
              <InlineNodes nodes={item} />
            </li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote className="border-s-2 border-border-table ps-3 text-text-secondary">
          <InlineNodes nodes={block.children} />
        </blockquote>
      );
    case "pre":
      return (
        <pre className="overflow-x-auto rounded-xl border border-border-table bg-background-secondary-default p-3 font-mono text-body-2-regular text-text-primary">
          {block.value}
        </pre>
      );
    case "hr":
      return <hr className="border-border-table" />;
  }
}

function InlineNodes({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <InlineNode key={index} node={node} />
      ))}
    </>
  );
}

function InlineNode({ node }: { node: Inline }) {
  switch (node.type) {
    case "text":
      return node.value;
    case "strong":
      return (
        <strong className="text-headline-semibold">
          <InlineNodes nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <InlineNodes nodes={node.children} />
        </em>
      );
    case "code":
      return (
        <code className="rounded-md bg-background-secondary-default px-1 py-0.5 font-mono text-body-regular">
          {node.value}
        </code>
      );
    case "link":
      if (node.href.startsWith("/")) {
        return (
          <Link href={node.href} className="underline decoration-border-table underline-offset-2 hover:text-text-secondary">
            <InlineNodes nodes={node.children} />
          </Link>
        );
      }
      return (
        <a
          href={node.href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-border-table underline-offset-2 hover:text-text-secondary"
        >
          <InlineNodes nodes={node.children} />
        </a>
      );
  }
}
