/** Nanocycle precision avoids Fraction.js's expensive floating-point approximation loop. */
export function rationalTime(value: number) {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) throw new Error('Invalid pattern time.');
  return { n: Math.round(value * 1_000_000_000), d: 1_000_000_000 };
}
const installed = Symbol.for('studio.precise-query-time');
export function installPreciseQueries(core: any) {
  const prototype = core.Pattern.prototype;
  if (prototype[installed]) return;
  const query = prototype.queryArc;
  prototype.queryArc = function(begin: any, end: any, ...controls: any[]) {
    return query.call(this, typeof begin === 'number' ? rationalTime(begin) : begin, typeof end === 'number' ? rationalTime(end) : end, ...controls);
  };
  prototype[installed] = true;
}
