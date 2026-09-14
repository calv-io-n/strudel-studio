import { parser } from '@lezer/javascript';

// Editors, slider discovery, and tempo normalization inspect the same code.
// Reuse immutable syntax trees with a bounded cache, including large MIDI takes.
const trees = new Map<string, ReturnType<typeof parser.parse>>();
const capacity = 2_000_000;
let characters = 0;
export function parseCode(code: string) {
  const cached = trees.get(code);
  if (cached) { trees.delete(code); trees.set(code, cached); return cached; }
  const tree = parser.parse(code);
  if (code.length > capacity) return tree;
  while (trees.size && (trees.size >= 16 || characters + code.length > capacity)) {
    const oldest = trees.keys().next().value!;
    characters -= oldest.length; trees.delete(oldest);
  }
  trees.set(code, tree); characters += code.length;
  return tree;
}
