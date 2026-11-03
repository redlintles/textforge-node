/** Compile-only contract tests: this function is intentionally never executed. */
import {Pipeline, Observers, getVar} from '../index.js';
import type {BuiltinWatcherMetric, NormalizationMode} from '../index.js';

export function checkLiteralOptionTypes(mode: NormalizationMode, metric: BuiltinWatcherMetric, arbitrary: string): void {
  const pipeline = new Pipeline();
  for (const value of ['nfc', 'nfd', 'nfkc', 'nfkd'] as const) pipeline.normalizeUnicode(value);
  pipeline.normalizeUnicode(mode);
  pipeline.normalizeUnicode(getVar('normalization'));
  pipeline.addToBeginning(arbitrary); // Free-form text retains its original type.

  // @ts-expect-error Invalid normalization mode must not widen to string.
  pipeline.normalizeUnicode('invalid');
  // @ts-expect-error Mode names are case-sensitive.
  pipeline.normalizeUnicode('NFC');
  // @ts-expect-error Arbitrary strings must be narrowed to a supported mode.
  pipeline.normalizeUnicode(arbitrary);

  const observers = new Observers();
  observers.setBuiltin('words', 'word_count');
  observers.setBuiltin('chosen metric', metric);
  const metrics: BuiltinWatcherMetric[] = Observers.builtinNames();
  for (const value of metrics) observers.setBuiltin(value, value);
  // @ts-expect-error Unknown built-in metrics must be rejected by TypeScript.
  observers.setBuiltin('wrong metric', 'wordCount');
  // @ts-expect-error A built-in metric is a registry option, not a context reference.
  observers.setBuiltin('variable', getVar('metric'));
  // @ts-expect-error Arbitrary strings are not known metrics.
  observers.setBuiltin('dynamic', arbitrary);
  observers.close();
}
