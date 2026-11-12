import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'docs');
const manifestFile = path.join(root, 'frontend/src/docs/manifest.ts');

const errors = [];
const warnings = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(docsDir).filter((file) => file.endsWith('.md'));
const routes = new Set(['/docs']);

for (const file of files) {
  const rel = path.relative(docsDir, file).replace(/\\/g, '/');
  const route = `/docs/${rel.replace(/\.md$/, '').replace(/(^|\/)index$/, '')}`.replace(/\/$/, '');
  routes.add(route || '/docs');
}

const manifest = fs.readFileSync(manifestFile, 'utf8');
const manifestPaths = [...manifest.matchAll(/entry\('([^']+)'/g)].map((m) => m[1]);
const manifestSet = new Set(manifestPaths);

if (manifestPaths.length === 0) errors.push('manifest: no entries parsed');
for (const route of manifestPaths) {
  if (!routes.has(route)) errors.push(`manifest route has no Markdown file: ${route}`);
}
for (const route of routes) {
  if (route !== '/docs' && !manifestSet.has(route)) warnings.push(`doc not in navigation manifest: ${route}`);
}

function resolveDocLink(raw, fromFile) {
  const href = raw.trim();
  if (!href || href.startsWith('#') || /^(https?:|mailto:|tel:)/.test(href)) return null;
  const clean = href.split('#')[0];
  if (!clean) return null;
  if (/^\/docs(\/|$)/.test(clean)) {
    return clean.replace(/\/index$/, '').replace(/\/$/, '') || '/docs';
  }
  if (clean.startsWith('/')) return null; // asset/app route, not docs content
  const target = path.resolve(path.dirname(fromFile), clean);
  if (!target.startsWith(docsDir)) return null;
  if (fs.existsSync(target)) return null;
  return `unresolved relative link: ${href}`;
}

const linkPattern = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const allMarkdown = [...files, path.join(root, 'README.md'), path.join(root, 'CONTRIBUTING.md'), path.join(root, 'SECURITY.md')];

for (const file of allMarkdown) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(linkPattern)) {
    const href = match[1];
    const docRoute = href.split('#')[0];
    if (/^\/docs(\/|$)/.test(docRoute)) {
      const normalised = docRoute.replace(/\/index$/, '').replace(/\/$/, '') || '/docs';
      if (!routes.has(normalised)) errors.push(`${path.relative(root, file)}: missing docs target ${href}`);
      continue;
    }
    const issue = resolveDocLink(href, file);
    if (issue) errors.push(`${path.relative(root, file)}: ${issue}`);
  }
}

// Relative links from README to files outside docs/.
for (const file of allMarkdown) {
  const text = fs.readFileSync(file, 'utf8');
  for (const match of text.matchAll(linkPattern)) {
    const href = match[1].split('#')[0];
    if (!href || href.startsWith('/') || /^(https?:|mailto:|tel:)/.test(href)) continue;
    const target = path.resolve(path.dirname(file), href);
    if (!fs.existsSync(target)) errors.push(`${path.relative(root, file)}: broken file link ${href}`);
  }
}

const secretPatterns = [
  /postgres(?:ql)?:\/\/[^\s:]+:[^@\s]+@/i,
  /relixor_live_[A-Za-z0-9_-]{12,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];

for (const file of allMarkdown) {
  const text = fs.readFileSync(file, 'utf8');
  for (const pattern of secretPatterns) {
    const match = text.match(pattern);
    if (match && !/replace|example|devpassword|relixor_test_pw|pass@|<|\$\{|\*\*\*|\.\.\.|your_/i.test(match[0])) errors.push(`${path.relative(root, file)}: possible secret pattern ${pattern}`);
  }
}

const unregistered = [...routes].filter((r) => r !== '/docs' && !manifestSet.has(r));
console.log(`Docs files: ${files.length}`);
console.log(`Routes: ${routes.size}; manifest entries: ${manifestPaths.length}`);
if (unregistered.length) console.log(`Not in manifest (${unregistered.length}): ${unregistered.join(', ')}`);
if (warnings.length) console.log(`Warnings: ${warnings.length}`);
if (errors.length) {
  console.error(`\nFAIL (${errors.length})`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('PASS: documentation links, manifest coverage and secret scan');
