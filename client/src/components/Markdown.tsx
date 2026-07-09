import { useState, type ReactNode } from 'react';

/** Minimal, dependency-free markdown renderer for chat messages. Builds React
 * elements directly (never dangerouslySetInnerHTML), so there's no HTML
 * injection risk even though this renders model output. Covers the subset
 * models actually produce in casual chat: headings, bold/italic, inline code,
 * fenced code blocks, links, and ordered/unordered lists. */

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard blocked — nothing else to do
    }
  }

  return (
    <div className="md-code-block-wrap">
      <button type="button" className="md-code-copy" onClick={handleCopy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre className="md-code-block">
        <code>{code}</code>
      </pre>
    </div>
  );
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let remaining = text;
  let key = 0;
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/;

  while (remaining.length) {
    const m = pattern.exec(remaining);
    if (!m) {
      nodes.push(remaining);
      break;
    }
    if (m.index > 0) nodes.push(remaining.slice(0, m.index));
    if (m[1]) nodes.push(<strong key={`${keyPrefix}-${key++}`}>{m[2]}</strong>);
    else if (m[3]) nodes.push(<em key={`${keyPrefix}-${key++}`}>{m[4]}</em>);
    else if (m[5]) (
      nodes.push(
        <code key={`${keyPrefix}-${key++}`} className="inline-code">
          {m[6]}
        </code>
      )
    );
    else if (m[7]) (
      nodes.push(
        <a key={`${keyPrefix}-${key++}`} href={m[9]} target="_blank" rel="noreferrer">
          {m[8]}
        </a>
      )
    );
    remaining = remaining.slice(m.index + m[0].length);
  }
  return nodes;
}

export function MarkdownText({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let listBuffer: { type: 'ul' | 'ol'; items: string[] } | null = null;
  let paraBuffer: string[] = [];
  let codeBuffer: string[] | null = null;
  let blockKey = 0;

  function flushPara() {
    if (paraBuffer.length === 0) return;
    const key = blockKey++;
    blocks.push(
      <p key={key}>
        {paraBuffer.map((ln, idx) => (
          <span key={idx}>
            {parseInline(ln, `p${key}-${idx}`)}
            {idx < paraBuffer.length - 1 && <br />}
          </span>
        ))}
      </p>
    );
    paraBuffer = [];
  }

  function flushList() {
    if (!listBuffer) return;
    const key = blockKey++;
    const items = listBuffer.items;
    blocks.push(
      listBuffer.type === 'ul' ? (
        <ul key={key}>
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it, `uli${key}-${idx}`)}</li>
          ))}
        </ul>
      ) : (
        <ol key={key}>
          {items.map((it, idx) => (
            <li key={idx}>{parseInline(it, `oli${key}-${idx}`)}</li>
          ))}
        </ol>
      )
    );
    listBuffer = null;
  }

  for (const line of lines) {
    if (codeBuffer !== null) {
      if (line.trim().startsWith('```')) {
        blocks.push(<CodeBlock key={blockKey++} code={codeBuffer.join('\n')} />);
        codeBuffer = null;
      } else {
        codeBuffer.push(line);
      }
      continue;
    }

    if (line.trim().startsWith('```')) {
      flushPara();
      flushList();
      codeBuffer = [];
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.*)$/.exec(line);
    if (headingMatch) {
      flushPara();
      flushList();
      const level = headingMatch[1].length;
      blocks.push(
        <p key={blockKey++} className={`md-heading md-h${level}`}>
          {parseInline(headingMatch[2], `h${blockKey}`)}
        </p>
      );
      continue;
    }

    const ulMatch = /^[-*]\s+(.*)$/.exec(line);
    const olMatch = /^\d+\.\s+(.*)$/.exec(line);

    if (ulMatch) {
      flushPara();
      if (!listBuffer || listBuffer.type !== 'ul') {
        flushList();
        listBuffer = { type: 'ul', items: [] };
      }
      listBuffer.items.push(ulMatch[1]);
      continue;
    }

    if (olMatch) {
      flushPara();
      if (!listBuffer || listBuffer.type !== 'ol') {
        flushList();
        listBuffer = { type: 'ol', items: [] };
      }
      listBuffer.items.push(olMatch[1]);
      continue;
    }

    if (line.trim() === '') {
      flushPara();
      flushList();
      continue;
    }

    flushList();
    paraBuffer.push(line);
  }

  flushPara();
  flushList();
  if (codeBuffer !== null && codeBuffer.length > 0) {
    blocks.push(<CodeBlock key={blockKey++} code={codeBuffer.join('\n')} />);
  }

  return <>{blocks}</>;
}
