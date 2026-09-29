// Minimal, safe Markdown -> HTML for agent/skill files and task output.
// Everything is escaped first; only a small set of constructs is rendered.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(src: string): string {
  const out: string[] = [];
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  let i = 0;
  const fm = /^---\n([\s\S]*?)\n---\n?/.exec(src.replace(/\r\n/g, '\n'));
  if (fm) {
    out.push(`<pre class="md-frontmatter">${esc(fm[1])}</pre>`);
    i = fm[0].split('\n').length - 1;
  }
  let list: 'ul' | 'ol' | null = null;
  let para: string[] = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (; i < lines.length; i++) {
    const line = lines[i];
    const fence = /^\s*(```|~~~)(.*)$/.exec(line);
    if (fence) {
      flushPara();
      closeList();
      const buf: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) buf.push(lines[i]);
      out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      flushPara();
      closeList();
      const lvl = Math.min(6, h[1].length + 1);
      out.push(`<h${lvl}>${inline(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flushPara();
      closeList();
      const buf: string[] = [];
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) buf.push(lines[i]);
      i--;
      const cells = (row: string) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const isSep = (row: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(row);
      const [head, ...rest] = buf;
      const body = rest.filter((r) => !isSep(r));
      out.push(
        `<div class="md-table"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      );
      continue;
    }
    const li = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (li) {
      flushPara();
      const kind = /\d/.test(li[1]) ? 'ol' : 'ul';
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline(li[2])}</li>`);
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      closeList();
      out.push(`<blockquote>${inline(line.replace(/^\s*>\s?/, ''))}</blockquote>`);
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      flushPara();
      closeList();
      out.push('<hr>');
      continue;
    }
    if (!line.trim()) {
      flushPara();
      closeList();
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return out.join('\n');
}
