import { parse } from 'acorn';
export type SoundBinding = { id: string; label: string; sound: string; from: number; to: number; references: { from: number; to: number }[] };
/** Conservative static bindings: top-level constants and literal sound calls only. */
export function soundBindings(code: string): SoundBinding[] {
  try {
    const ast = parse(code, { ecmaVersion: 2022 }) as any;
    const result: SoundBinding[] = [], named = new Map<string, SoundBinding>();
    const literal = (node: any) => node?.type === 'CallExpression' && node.arguments.length === 1 && (node.callee.type === 'Identifier' ? ['s','sound'].includes(node.callee.name) : node.callee.type === 'MemberExpression' && !node.callee.computed && ['s','sound'].includes(node.callee.property.name)) && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string' && /^[\w-]+$/.test(node.arguments[0].value) && !code.slice(node.arguments[0].start,node.arguments[0].end).includes('\\') ? node.arguments[0] : undefined;
    const walk = (node: any, visit: (node: any, parent?: any) => void, parent?: any) => {
      if (!node || typeof node !== 'object') return;
      if (/Function|Class/.test(node.type ?? '') || node.type === 'BlockStatement') return;
      visit(node,parent);
      for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(child=>walk(child,visit,node)); else if(value && typeof value==='object')walk(value,visit,node);
    };
    const names = new Map<any,string>();
    for(const statement of ast.body) if(statement.type==='VariableDeclaration' && statement.kind==='const') for(const d of statement.declarations) {
      if(d.id.type!=='Identifier')continue;
      let node=d.init;while(node?.type==='CallExpression' && node.callee.type==='MemberExpression' && !literal(node))node=node.callee.object;
      const token=literal(node);if(token)names.set(token,d.id.name);
    }
    walk(ast,node=>{const token=literal(node);if(!token)return;const name=names.get(token);const binding={id:name?`const:${name}`:`literal:${result.length}`,label:name?name[0].toUpperCase()+name.slice(1):`Sound ${result.length+1}`,sound:token.value,from:token.start+1,to:token.end-1,references:[{from:token.start+1,to:token.end-1}]};result.push(binding);if(name)named.set(name,binding);});
    walk(ast,(node,parent)=>{if(node.type!=='Identifier'||!named.has(node.name))return;if(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)return;if(parent?.type==='Property'&&parent.key===node&&!parent.computed&&!parent.shorthand)return;const binding=named.get(node.name)!;binding.references.push({from:node.start,to:node.end});});
    return result;
  } catch { return []; }
}
export function bindingAt(code:string,pos:number) { return soundBindings(code).find(binding=>binding.references.some(r=>pos>=r.from&&pos<r.to)); }
export function replaceBinding(code:string,id:string,previous:string,next:string) {
  if(!/^[\w-]+$/.test(next))throw new Error('Choose one sound.');
  const binding=soundBindings(code).find(b=>b.id===id && b.sound===previous);
  if(!binding)throw new Error('The sound destination changed. Select the chop again.');
  return {from:binding.from,to:binding.to,insert:next};
}
