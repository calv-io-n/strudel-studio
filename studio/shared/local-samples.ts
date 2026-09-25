/** Resolve URLs emitted by older Studio insertions without intercepting external sample URLs. */
export function localSampleId(value: unknown, origin: string): string | undefined {
  if (typeof value !== 'string') return;
  const prefix = `${origin}/api/samples/`;
  if (!value.startsWith(prefix)) return;
  return value.slice(prefix.length).match(/^([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\/audio$/i)?.[1];
}
