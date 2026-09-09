// Extract upstream documentation from the installed editor bundle; no network or code evaluation.
// Strudel's AGPL-3.0 documentation remains attributed to its installed package/version.
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { parse } from 'acorn';
const root = new URL('../', import.meta.url);
const bundle = await readFile(new URL('node_modules/@strudel/codemirror/dist/index.mjs', root), 'utf8');
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(n => walk(n, visit));
    else if (value && typeof value === 'object') walk(value, visit);
  }
}
let docs;
walk(parse(bundle, { ecmaVersion: 'latest', sourceType: 'module' }), node => {
  if (node.type !== 'CallExpression' || node.callee?.object?.name !== 'JSON' || node.callee?.property?.name !== 'parse') return;
  const arg = node.arguments[0];
  const value = arg.type === 'Literal' ? arg.value : arg.type === 'TemplateLiteral' && !arg.expressions.length ? arg.quasis[0].value.cooked : undefined;
  if (typeof value !== 'string') return;
  try { const result = JSON.parse(value); if (Array.isArray(result) && result.some(d => d.name === 's' && d.params)) docs = result; } catch { /* Other bundled JSON. */ }
});
if (!docs) throw new Error('The installed Strudel editor does not contain its documentation catalog.');
const plain = text => (text ?? '').replace(/<\/(p|li|div|h\d)>/g, '\n').replace(/<br\s*\/?\s*>/g, '\n').replace(/<\/?(?:p|li|ul|ol|div|span|code|pre|strong|em|b|i|a|h[1-6])(?:\s[^>]*)?>/g, '').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').trim();
const catalog = {};
for (const doc of docs) {
  const name = doc.name || doc.longname;
  if (!/^[A-Za-z]\w*$/.test(name) || doc.kind === 'package') continue;
  const entry = {
    name, description: plain(doc.description),
    params: (doc.params ?? []).map(p => ({ name: p.name, type: p.type?.names?.join(' | ') ?? '', description: plain(p.description), ...(p.optional ? { optional: true } : {}), ...(p.defaultvalue !== undefined ? { default: String(p.defaultvalue) } : {}) })),
    examples: (doc.examples ?? []).map(plain),
    aliases: doc.synonyms ?? [],
    ...(doc.returns?.length ? { returns: doc.returns.map(r => [r.type?.names?.join(' | '), plain(r.description)].filter(Boolean).join(' — ')).join('\n') } : {}),
  };
  if (!catalog[name] || entry.description.length > catalog[name].description.length) catalog[name] = entry;
  for (const alias of entry.aliases) if (/^[A-Za-z]\w*$/.test(alias)) catalog[alias] = { ...entry, name: alias, aliases: [name, ...entry.aliases.filter(a => a !== alias)] };
}
// Source signatures fill documentation gaps without guessing parameter meaning.
const sources = {};
const packages = ['core', 'mini', 'tonal', 'webaudio', 'draw', 'soundfonts'];
for (const pkg of packages) {
  const directory = new URL(`node_modules/@strudel/${pkg}/`, root);
  for (const file of await readdir(directory)) {
    if (!file.endsWith('.mjs')) continue;
    const source = await readFile(new URL(file, directory), 'utf8');
    let ast; try { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' }); } catch { continue; }
    const add = (name, fn, method = false) => {
      if (!name || !fn?.params) return;
      const params = fn.params.map(p => source.slice(p.start, p.end));
      if (method && ['pat', 'pattern'].includes(params.at(-1))) params.pop();
      const entry = { params, source: `@strudel/${pkg}/${file}`, implementation: source.slice(fn.start, Math.min(fn.end, fn.start + 2200)) };
      if (!sources[name] || method) sources[name] = entry;
    };
    walk(ast, node => {
      if (node.type === 'FunctionDeclaration') add(node.id?.name, node);
      if (node.type === 'VariableDeclarator') {
        if (node.id.type === 'Identifier') add(node.id.name, node.init);
        const init = node.init;
        if (init?.type === 'CallExpression' && init.callee?.name === 'register') {
          const names = init.arguments[0]?.type === 'ArrayExpression' ? init.arguments[0].elements.map(n => n.value) : [init.arguments[0]?.value];
          for (const name of names) add(name, init.arguments[1], true);
        }
      }
      if (node.type === 'MethodDefinition') add(node.key.name, node.value);
      if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') add(node.left.property.name, node.right);
    });
  }
}
for (const [name, entry] of Object.entries(catalog)) {
  const source = sources[name] ?? entry.aliases.map(a => sources[a]).find(Boolean);
  if (source) Object.assign(entry, { signature: source.params, source: source.source });
}
for (const [name, source] of Object.entries(sources)) if (/^[A-Za-z]\w*$/.test(name) && !catalog[name]) catalog[name] = { name, description: '', params: [], examples: [], aliases: [], signature: source.params, source: source.source };
const version = JSON.parse(await readFile(new URL('node_modules/@strudel/codemirror/package.json', root))).version;
const output = { attribution: `Strudel contributors, AGPL-3.0-or-later. Documentation bundled with @strudel/codemirror ${version}; signatures from installed Strudel packages.`, entries: Object.fromEntries(Object.entries(catalog).sort(([a], [b]) => a.localeCompare(b))) };
await writeFile(new URL('studio/client/strudel-docs.json', root), JSON.stringify(output, null, 2) + '\n');
console.log(`Generated ${Object.keys(catalog).length} Strudel documentation entries.`);
