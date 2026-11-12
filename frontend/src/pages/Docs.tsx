import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Menu,
  Printer,
  Search,
  X,
} from 'lucide-react';
import { DOC_ENTRIES, DOC_GROUPS, DocEntry } from '../docs/manifest';

const RAW_DOCS = import.meta.glob('../../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CONTENT: Record<string, string> = {};
for (const [file, raw] of Object.entries(RAW_DOCS)) {
  const marker = '/docs/';
  const index = file.lastIndexOf(marker);
  const relative = index >= 0 ? file.slice(index + marker.length) : file.split('/').pop() || '';
  const path = relative.replace(/\.md$/, '').replace(/(^|\/)index$/, '');
  CONTENT[path ? `/docs/${path}` : '/docs'] = raw;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[`*_[\]()#:.,!?/\\]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function docHref(href: string | undefined, currentPath: string): string | undefined {
  if (!href) return href;
  if (/^(https?:|mailto:|tel:)/.test(href)) return href;
  if (href.startsWith('#')) return href;
  if (/^\/docs(\/|$)/.test(href)) {
    return href.replace(/\.md$/, '').replace(/\/index$/, '').replace(/\/$/, '') || '/docs';
  }
  if (href.endsWith('.md')) {
    const base = currentPath === '/docs' ? 'http://docs.local/docs/' : `http://docs.local${currentPath}/`;
    const url = new URL(href, base);
    return url.pathname.replace(/\.md$/, '').replace(/\/index$/, '') || '/docs';
  }
  return href;
}

const CodeBlock: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    const text = ref.current?.innerText || '';
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="group relative my-5">
      <pre ref={ref} className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80 p-4 text-[13px] leading-6 text-slate-200">
        {children}
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] text-slate-300 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
};

function useDocPath(): [string, (next: string) => void] {
  const normalise = () => {
    const path = window.location.pathname.replace(/\/$/, '');
    return path || '/docs';
  };
  const [path, setPath] = useState(normalise);
  useEffect(() => {
    const onPop = () => setPath(normalise());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const navigate = (next: string) => {
    if (next === path) return;
    window.history.pushState({}, '', next);
    setPath(next.replace(/\/$/, '') || '/docs');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return [path, navigate];
}

export const Docs: React.FC = () => {
  const [path, navigate] = useDocPath();
  const [query, setQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const entry: DocEntry = DOC_ENTRIES.find((doc) => doc.path === path) || DOC_ENTRIES[0];
  const content = CONTENT[path] || CONTENT['/docs'] || '# Documentation unavailable\n\nThe documentation bundle was not found.';
  const index = DOC_ENTRIES.findIndex((doc) => doc.path === entry.path);
  const previous = index > 0 ? DOC_ENTRIES[index - 1] : undefined;
  const next = index >= 0 && index < DOC_ENTRIES.length - 1 ? DOC_ENTRIES[index + 1] : undefined;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return DOC_ENTRIES.filter((doc) => {
      const body = CONTENT[doc.path] || '';
      return (
        doc.title.toLowerCase().includes(q) ||
        doc.description.toLowerCase().includes(q) ||
        doc.group.toLowerCase().includes(q) ||
        body.toLowerCase().includes(q)
      );
    }).slice(0, 10);
  }, [query]);

  const toc = useMemo(() => {
    const headings: { level: number; text: string; id: string }[] = [];
    const seen = new Map<string, number>();
    let inFence = false;
    for (const line of content.split('\n')) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      const match = /^(#{2,3})\s+(.+?)\s*#*\s*$/.exec(line);
      if (!match) continue;
      const text = match[2].replace(/`/g, '');
      let id = slugify(text);
      const count = seen.get(id) || 0;
      seen.set(id, count + 1);
      if (count > 0) id = `${id}-${count}`;
      headings.push({ level: match[1].length, text, id });
    }
    return headings;
  }, [content]);

  const slugCounts = useMemo(() => new Map<string, number>(), [content]);

  useEffect(() => {
    document.title = `${entry.title} · Relixor Docs`;
    setSidebarOpen(false);
  }, [entry.title]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.getElementById('docs-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => {
    navigate(href);
  };

  const heading = (level: 2 | 3 | 4) => {
    const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
    return ({ children }: any) => {
      const text = String(Array.isArray(children) ? children.join('') : children ?? '');
      let id = slugify(text);
      const count = slugCounts.get(id) || 0;
      slugCounts.set(id, count + 1);
      if (count > 0) id = `${id}-${count}`;
      const classes =
        level === 2
          ? 'mt-10 mb-3 border-b border-slate-800 pb-2 text-2xl font-bold text-white scroll-mt-24'
          : level === 3
          ? 'mt-7 mb-2 text-lg font-semibold text-slate-100 scroll-mt-24'
          : 'mt-5 mb-2 text-base font-semibold text-slate-200 scroll-mt-24';
      return (
        <Tag id={id} className={classes}>
          {children}
        </Tag>
      );
    };
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-950/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="rounded-lg border border-slate-800 p-2 text-slate-300 lg:hidden"
            aria-label="Toggle documentation navigation"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <a href="/docs" onClick={(e) => { e.preventDefault(); go('/docs'); }} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white">
              <BookOpen className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-bold text-white">Relixor Docs</span>
              <span className="block text-[11px] text-slate-500">v1.0 · self-hosted APK platform</span>
            </span>
          </a>
          <div className="relative ml-auto hidden w-full max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              id="docs-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documentation…  (Ctrl/Cmd+K)"
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-indigo-500"
            />
            {query && (
              <div className="absolute mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                {results.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-slate-500">No matching pages.</p>
                ) : (
                  results.map((doc) => (
                    <button
                      key={doc.path}
                      type="button"
                      onClick={() => { go(doc.path); setQuery(''); }}
                      className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-800"
                    >
                      <span className="block text-sm font-medium text-slate-100">{doc.title}</span>
                      <span className="block text-xs text-slate-500">{doc.group} · {doc.description}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="hidden items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-900 sm:inline-flex"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-300 hover:bg-slate-900"
            >
              Open app <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px]">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 z-30 bg-slate-950/70 lg:hidden"
          />
        )}
        <aside
          className={`fixed inset-y-0 left-0 z-30 mt-16 w-80 overflow-y-auto border-r border-slate-800 bg-slate-950 p-4 transition-transform lg:sticky lg:top-16 lg:z-0 lg:mt-0 lg:h-[calc(100vh-4rem)] lg:translate-x-0 print:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="relative mb-4 md:hidden">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search docs…"
              className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
            />
          </div>
          {DOC_GROUPS.map((group) => (
            <div key={group.title} className="mb-6">
              <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{group.title}</p>
              <ul className="space-y-0.5">
                {group.entries.map((doc) => {
                  const active = doc.path === entry.path;
                  return (
                    <li key={doc.path}>
                      <a
                        href={doc.path}
                        onClick={(e) => { e.preventDefault(); go(doc.path); }}
                        className={`flex items-start gap-2 rounded-lg px-2.5 py-2 text-[13px] leading-5 ${
                          active ? 'bg-indigo-600/15 font-medium text-indigo-300' : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                        }`}
                      >
                        <FileText className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${active ? 'text-indigo-400' : 'text-slate-600'}`} />
                        {doc.title}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          <p className="px-2 pb-6 text-[11px] text-slate-600">Relixor documentation · updated 12 Nov 2026</p>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-8 sm:px-8 lg:px-12 print:px-0">
          <div className="mx-auto max-w-4xl">
            <nav className="mb-5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 print:hidden">
              <a href="/docs" onClick={(e) => { e.preventDefault(); go('/docs'); }} className="hover:text-slate-300">Docs</a>
              <ChevronRight className="h-3 w-3" />
              <span>{entry.group}</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-slate-300">{entry.title}</span>
            </nav>

            <div className="mb-8 border-b border-slate-800 pb-6">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-indigo-400">{entry.group}</p>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">{entry.title}</h1>
              <p className="mt-3 text-base text-slate-400">{entry.description}</p>
              <p className="mt-3 text-xs text-slate-600">Last updated {entry.updated} · Relixor v1.0</p>
            </div>

            <div className="flex gap-10">
              <article className="docs-prose min-w-0 flex-1">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // The document title is rendered by the portal header; avoid a duplicate H1.
                    h1: () => null,
                    h2: heading(2),
                    h3: heading(3),
                    h4: heading(4),
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    code: ({ className, children }) => {
                      const isBlock = Boolean(className);
                      return isBlock ? (
                        <code className={className}>{children}</code>
                      ) : (
                        <code className="rounded bg-slate-800 px-1.5 py-0.5 text-[0.85em] text-indigo-200">{children}</code>
                      );
                    },
                    a: ({ href, children }) => {
                      const resolved = docHref(href, entry.path);
                      if (resolved && /^\/docs(\/|$)/.test(resolved)) {
                        return (
                          <a
                            href={resolved}
                            onClick={(e) => { e.preventDefault(); go(resolved); }}
                            className="font-medium text-indigo-400 underline decoration-indigo-500/30 underline-offset-2 hover:text-indigo-300"
                          >
                            {children}
                          </a>
                        );
                      }
                      return (
                        <a href={resolved} target={resolved?.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="font-medium text-indigo-400 underline decoration-indigo-500/30 underline-offset-2 hover:text-indigo-300">
                          {children}
                        </a>
                      );
                    },
                    table: ({ children }) => (
                      <div className="my-5 overflow-x-auto rounded-xl border border-slate-800">
                        <table className="w-full border-collapse text-sm">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-slate-900 text-slate-200">{children}</thead>,
                    th: ({ children }) => <th className="border-b border-slate-800 px-3 py-2 text-left font-semibold">{children}</th>,
                    td: ({ children }) => <td className="border-b border-slate-800/60 px-3 py-2 align-top text-slate-400">{children}</td>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-5 rounded-r-xl border-l-4 border-indigo-500 bg-indigo-500/5 px-4 py-3 text-slate-300">{children}</blockquote>
                    ),
                    ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6">{children}</ul>,
                    ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6">{children}</ol>,
                    li: ({ children }) => <li className="leading-7">{children}</li>,
                    p: ({ children }) => <p className="my-4 leading-7 text-slate-400">{children}</p>,
                    hr: () => <hr className="my-8 border-slate-800" />,
                    img: ({ src, alt }) => <img src={src} alt={alt || ''} className="my-5 max-w-full rounded-xl border border-slate-800" />,
                  }}
                >
                  {content}
                </ReactMarkdown>
              </article>

              {toc.length > 0 && (
                <aside className="hidden w-56 shrink-0 xl:block print:hidden">
                  <div className="sticky top-24">
                    <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">On this page</p>
                    <ul className="space-y-1.5 border-l border-slate-800">
                      {toc.map((item) => (
                        <li key={item.id} className={item.level === 3 ? 'pl-5' : 'pl-3'}>
                          <a href={`#${item.id}`} className="block text-[12px] leading-5 text-slate-500 hover:text-slate-200">
                            {item.text}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </aside>
              )}
            </div>

            <div className="mt-12 grid gap-3 border-t border-slate-800 pt-6 sm:grid-cols-2 print:hidden">
              {previous ? (
                <a href={previous.path} onClick={(e) => { e.preventDefault(); go(previous.path); }} className="rounded-xl border border-slate-800 p-4 hover:border-slate-700 hover:bg-slate-900/60">
                  <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-500"><ChevronLeft className="h-3 w-3" /> Previous</span>
                  <span className="mt-1 block text-sm font-medium text-slate-200">{previous.title}</span>
                </a>
              ) : <span />}
              {next && (
                <a href={next.path} onClick={(e) => { e.preventDefault(); go(next.path); }} className="rounded-xl border border-slate-800 p-4 text-right hover:border-slate-700 hover:bg-slate-900/60">
                  <span className="flex items-center justify-end gap-1 text-[11px] uppercase tracking-wide text-slate-500">Next <ChevronRight className="h-3 w-3" /></span>
                  <span className="mt-1 block text-sm font-medium text-slate-200">{next.title}</span>
                </a>
              )}
            </div>

            <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
              <span>Relixor v1.0 documentation · self-hosted deployment</span>
              <span>Report a docs issue via your repository maintainer.</span>
            </footer>
          </div>
        </main>
      </div>
    </div>
  );
};
