import { useState } from 'react';

const MCP_URL = 'https://motion.justwhyus.com/api/mcp';

export function McpConnect() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(MCP_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard blocked — user can select manually
    }
  }

  return (
    <section className="mcp-card">
      <div className="mcp-header">
        <span className="mcp-badge">MCP</span>
        <h2>Connect from ChatGPT &amp; Claude</h2>
      </div>
      <p className="mcp-sub">
        Nanoni is also a <strong>Model Context Protocol</strong> server. Add this URL as a
        connector and generate videos straight from your AI assistant.
      </p>

      <div className="mcp-url-row">
        <code className="mcp-url">{MCP_URL}</code>
        <button className="mcp-copy" onClick={copy}>
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>

      <ol className="mcp-steps">
        <li>
          Open your assistant's <strong>Connectors</strong> settings (ChatGPT: Settings →
          Connectors → Developer mode; Claude: Settings → Connectors).
        </li>
        <li>
          Choose <strong>Add custom connector</strong> and paste the URL above.
        </li>
        <li>
          Ask it to <em>“generate a video of …”</em> — it calls the{' '}
          <code>generate_video</code> tool on your site.
        </li>
      </ol>

      <a
        className="mcp-guide-link"
        href="https://github.com/goufrout80-star/motion-justwhyus-/blob/main/MCP-GUIDE.md"
        target="_blank"
        rel="noreferrer"
      >
        Read the full connection guide →
      </a>
    </section>
  );
}
