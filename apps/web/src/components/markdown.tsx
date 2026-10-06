import type { ReactNode } from 'react';

/** Minimal Markdown renderer (headings, lists, code fences, bold, inline code). */
function inline(text: string, keyPrefix: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={`${keyPrefix}-${index}`}>{part.slice(2, -2)}</strong>;
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code
            key={`${keyPrefix}-${index}`}
            className="rounded bg-card-muted px-1 py-0.5 font-mono text-xs"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return <span key={`${keyPrefix}-${index}`}>{part}</span>;
    });
}

export function MarkdownPreview({ content }: { content: string }) {
  const nodes: ReactNode[] = [];
  let list: string[] = [];
  // Object holder defeats TS control-flow narrowing across the forEach closure.
  const state: { code: string[] | null } = { code: null };

  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul key={`list-${nodes.length}`} className="list-disc space-y-1 pl-5 text-sm">
        {list.map((item, index) => (
          <li key={index}>{inline(item, `li-${nodes.length}-${index}`)}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  content.split('\n').forEach((line, index) => {
    if (line.startsWith('```')) {
      if (state.code) {
        nodes.push(
          <pre
            key={`code-${index}`}
            className="overflow-x-auto rounded-control bg-card-muted p-3 font-mono text-xs"
          >
            {state.code.join('\n')}
          </pre>,
        );
        state.code = null;
      } else {
        flushList();
        state.code = [];
      }
      return;
    }
    if (state.code) {
      state.code.push(line);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      list.push(line.replace(/^[-*]\s+/, ''));
      return;
    }
    flushList();
    if (/^###\s/.test(line)) {
      nodes.push(
        <h3 key={`h3-${index}`} className="mt-3 text-sm font-semibold">
          {inline(line.slice(4), `h3-${index}`)}
        </h3>,
      );
    } else if (/^##\s/.test(line)) {
      nodes.push(
        <h2 key={`h2-${index}`} className="mt-3 text-title font-semibold">
          {inline(line.slice(3), `h2-${index}`)}
        </h2>,
      );
    } else if (/^#\s/.test(line)) {
      nodes.push(
        <h2 key={`h1-${index}`} className="mt-3 text-title font-semibold">
          {inline(line.slice(2), `h1-${index}`)}
        </h2>,
      );
    } else if (line.trim() === '') {
      nodes.push(<div key={`sp-${index}`} className="h-2" />);
    } else {
      nodes.push(
        <p key={`p-${index}`} className="text-sm">
          {inline(line, `p-${index}`)}
        </p>,
      );
    }
  });
  flushList();
  if (state.code) {
    nodes.push(
      <pre
        key="code-end"
        className="overflow-x-auto rounded-control bg-card-muted p-3 font-mono text-xs"
      >
        {state.code.join('\n')}
      </pre>,
    );
  }
  return <div className="space-y-1">{nodes}</div>;
}
