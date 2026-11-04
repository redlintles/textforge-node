/** Typed, owned Node.js interface to TextForge 0.2.0. */
import native from './loader.cjs';
import type {NativeArgument} from './native-types.js';
import type {BuiltinWatcherMetric, NormalizationMode} from './options.js';
export type {BuiltinWatcherMetric, NormalizationMode} from './options.js';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export type Integer = number | bigint;
/** Convert without truncation or implicit numeric coercion. */
function integer(value: Integer): bigint {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new RangeError('expected a safe integer or bigint');
    value = BigInt(value);
  }
  if (typeof value !== 'bigint') throw new TypeError('expected number or bigint');
  if (value < 0n || value > 0xffffffffffffffffn) throw new RangeError('expected an unsigned 64-bit integer');
  return value;
}
/** Reject unpaired UTF-16 surrogates instead of silently replacing them at N-API. */
function text(value: string): string {
  if (typeof value !== 'string') throw new TypeError('expected string');
  if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value))
    throw new TypeError('unpaired UTF-16 surrogate; use FilePath.fromWindowsWide for native paths');
  return value;
}
export type ErrorStage = 'conversion' | 'validation' | 'execution' | 'persistence' | 'callback';
/** Portable diagnostic fields are preserved verbatim. */
export class TextForgeError extends Error {
  readonly stage: ErrorStage;
  readonly code: number;
  readonly instruction: string;
  readonly input: string;
  constructor(data: {stage: string; code: number; message: string; instruction: string; input: string}) {
    super(data.message); this.name = 'TextForgeError'; this.stage = data.stage as ErrorStage;
    this.code = data.code; this.instruction = data.instruction; this.input = data.input;
  }
  static [Symbol.hasInstance](value: unknown): boolean {
    return value instanceof Error && value.name === 'TextForgeError' && 'stage' in value && 'code' in value;
  }
}
/** Explicit execution-context variable reference, resolved by the engine. */
export class Variable {
  readonly name: string;
  constructor(name: string) { this.name = text(name); Object.freeze(this); }
}
export function getVar(name: string): Variable { return new Variable(name); }
export type TextArgument = string | Variable;
export type NumberArgument = Integer | Variable;
export type ValueArgument = TextArgument | Integer;
export type InstructionArgument = Instruction | Pipeline | Variable;
export type Argument = ValueArgument | Instruction;

/** Owned instruction description. Arguments exclude DSL literals such as `do`. */
export class Instruction {
  readonly name: string;
  readonly arguments: readonly Argument[];
  readonly depth: number;
  constructor(name: string, ...args: Argument[]) {
    this.name = text(name);
    this.arguments = Object.freeze(args.map(value => {
      if (typeof value === 'string') return text(value);
      if (typeof value === 'number' || typeof value === 'bigint') { integer(value); return value; }
      if (value instanceof Variable || value instanceof Instruction) return value;
      throw new TypeError('expected string, integer, Variable or Instruction');
    }));
    this.depth = Math.max(0, ...args.map(a => a instanceof Instruction ? a.depth + 1 : 0));
    // This bounds adapter recursion; the core applies the actual domain depth rules.
    if (this.depth > 32) throw new RangeError('instruction nesting exceeds adapter limit 32');
    Object.freeze(this);
  }
  /** @internal */
  toNative(): InstanceType<typeof native.Instruction> {
    return new native.Instruction(this.name, this.arguments.map(nativeArgument));
  }
  /** @internal */
  static fromNative(value: InstanceType<typeof native.Instruction>): Instruction {
    return new Instruction(value.name, ...value.arguments().map((arg): Argument => {
      switch (arg.kind) {
        case 'text': return arg.text!;
        case 'number': return arg.number!;
        case 'variable': return new Variable(arg.text!);
        case 'instruction': return Instruction.fromNative(arg.instruction!);
        default: throw new TypeError('unsupported portable argument');
      }
    }));
  }
}
function nativeArgument(value: Argument): NativeArgument {
  if (typeof value === 'string') return {kind:'text', text:value};
  if (typeof value === 'number' || typeof value === 'bigint') return {kind:'number', number:integer(value)};
  if (value instanceof Variable) return {kind:'variable', text:value.name};
  return {kind:'instruction', instruction:value.toNative()};
}

function textArg(value: TextArgument): TextArgument {
  if (value instanceof Variable) return value;
  return text(value);
}
function numberArg(value: NumberArgument): NumberArgument {
  if (value instanceof Variable) return value;
  integer(value); return value;
}
function valueArg(value: ValueArgument): ValueArgument {
  return typeof value === 'number' || typeof value === 'bigint' ? numberArg(value) : textArg(value);
}
function instructionArg(value: InstructionArgument): Instruction | Variable {
  if (value instanceof Pipeline) return value.asInstruction();
  if (value instanceof Instruction || value instanceof Variable) return value;
  throw new TypeError('expected a single-instruction Pipeline, Instruction or Variable');
}
type ReplaceRule = readonly [TextArgument, TextArgument];
type ReplaceMapDefinition = Readonly<{kind:'replaceMap'; name:TextArgument; rules:readonly ReplaceRule[]}>;
/** Scoped map configuration. addReplace mutates this builder; end closes it. */
export class ReplaceMapBuilder {
  #rules: ReplaceRule[] = [];
  #ended = false;
  #active = true;
  private constructor() {}
  addReplace(pattern: TextArgument, replacement: TextArgument): this {
    if (!this.#active || this.#ended) throw new TypeError('replace map configuration is closed');
    this.#rules.push(Object.freeze([textArg(pattern),textArg(replacement)]));
    return this;
  }
  end(): undefined {
    if (!this.#active || this.#ended) throw new TypeError('replace map configuration is closed');
    this.#ended = true;
    return undefined;
  }
  /** @internal Run a construction callback and detach its immutable description. */
  static configure(configure: ReplaceMapBody): readonly ReplaceRule[] {
    const map = new ReplaceMapBuilder();
    try {
      const result: unknown = configure(map);
      if (result !== undefined) {
        if (result instanceof Promise) void result.catch(() => {});
        throw new TypeError('replace map callbacks must be synchronous and return end() or nothing');
      }
      if (!map.#ended) throw new TypeError('replace map configuration must finish with end()');
      return Object.freeze([...map.#rules]);
    } finally { map.#active = false; }
  }
}
export type ReplaceMapBody = (map: ReplaceMapBuilder) => undefined;

type Group = Readonly<{kind:'block'|'containsEach'; value:string; body:Pipeline}>;
export type PipelineBody = Pipeline | ((plan: Pipeline) => Pipeline);
function body(value: PipelineBody): Pipeline {
  const result = typeof value === 'function' ? value(new Pipeline()) : value;
  if (!(result instanceof Pipeline)) throw new TypeError('body must return a Pipeline');
  return result;
}
/** Immutable plan: every fluent edit returns a new plan; compile creates an independent executable. */
export class Pipeline {
  #nodes: readonly (Instruction | Group | ReplaceMapDefinition)[];
  #processor?: Processor;
  #depth: number;
  constructor(...instructions: Instruction[]) {
    if (instructions.some(i => !(i instanceof Instruction))) throw new TypeError('expected Instruction objects');
    this.#nodes = Object.freeze([...instructions]); this.#depth = 0;
  }
  private static create(nodes: readonly (Instruction | Group | ReplaceMapDefinition)[], processor?: Processor): Pipeline {
    const plan = new Pipeline();
    plan.#nodes = Object.freeze([...nodes]);
    plan.#processor = processor;
    plan.#depth = Math.max(0, ...nodes.map(n => n instanceof Instruction || n.kind === 'replaceMap' ? 0 : n.body.#depth + 1));
    if (plan.#depth > 32) throw new RangeError('group nesting exceeds adapter limit 32');
    return plan;
  }
  /** @internal */
  static forProcessor(processor: Processor): Pipeline { return Pipeline.create([],processor); }
  private append(node: Instruction | Group | ReplaceMapDefinition): Pipeline {
    return Pipeline.create([...this.#nodes, node], this.#processor);
  }
  add(name: string, ...args: Argument[]): Pipeline { return this.append(new Instruction(name, ...args)); }
  pushToken(instruction: Instruction): Pipeline {
    if (!(instruction instanceof Instruction)) throw new TypeError('expected Instruction');
    return this.append(instruction);
  }
  block(name: string, value: PipelineBody): Pipeline {
    return this.append(Object.freeze({kind:'block', value:text(name), body:body(value)}));
  }
  containsEach(pattern: string, value: PipelineBody): Pipeline {
    return this.append(Object.freeze({kind:'containsEach', value:text(pattern), body:body(value)}));
  }
  blockAssoc(name: string, value: PipelineBody): Pipeline { return this.block(name,value); }
  ifDoContainsEach(pattern: string, value: PipelineBody): Pipeline { return this.containsEach(pattern,value); }
  callBlock(name: string): Pipeline { return this.add('cblk',text(name)); }
  /** @internal */
  asInstruction(): Instruction {
    if (this.#nodes.length !== 1 || !(this.#nodes[0] instanceof Instruction)) throw new TypeError('expected exactly one instruction');
    return this.#nodes[0];
  }
  /** @internal */
  lower(): InstanceType<typeof native.Plan> {
    const plan = new native.Plan();
    for (const node of this.#nodes) {
      if (node instanceof Instruction) plan.add(node.toNative());
      else if (node.kind === 'replaceMap') plan.defineReplaceMap(nativeArgument(node.name),node.rules.map(([pattern,replacement]) => ({pattern:nativeArgument(pattern),replacement:nativeArgument(replacement)})));
      else if (node.kind === 'block') plan.block(node.value,node.body.lower());
      else plan.containsEach(node.value,node.body.lower());
    }
    return plan;
  }
  private detached(): Pipeline {
    return Pipeline.create(this.#nodes.map(node => node instanceof Instruction || node.kind === 'replaceMap'
      ? node
      : Object.freeze({...node, body:node.body.detached()})));
  }
  compile(): CompiledPipeline { return new CompiledPipeline(this.lower().compile(), this.detached()); }
  build(processor: Processor | undefined = this.#processor): string {
    if (!(processor instanceof Processor)) throw new TypeError('build requires a Processor; pass one or use processor.createPipeline()');
    return processor.register(this);
  }
  /** Configure ordered rules with map.addReplace(...).end(). */
  defineReplaceMap(name: TextArgument, configure: ReplaceMapBody): Pipeline;
  /** @deprecated Use defineReplaceMap(name, map => map.addReplace(pattern, replacement).end()). */
  defineReplaceMap(name: TextArgument, pattern: TextArgument, replacement: TextArgument): Pipeline;
  defineReplaceMap(name: TextArgument, configure: ReplaceMapBody | TextArgument, replacement?: TextArgument): Pipeline {
    name = textArg(name);
    if (typeof configure !== 'function') {
      if (replacement === undefined) throw new TypeError('defineReplaceMap requires a configuration callback or pattern and replacement');
      return this.addReplaceRule(name,configure,replacement);
    }
    if (replacement !== undefined) throw new TypeError('a replace map callback does not accept a third argument');
    return this.append(Object.freeze({kind:'replaceMap',name,rules:ReplaceMapBuilder.configure(configure as ReplaceMapBody)}));
  }
  // BEGIN GENERATED BUILDER METHODS
  /** Mirrors Rust `TextForgeBuilderMethods::normalize_unicode` through `unorm`. */
  normalizeUnicode(mode: NormalizationMode | Variable): Pipeline { return this.add('unorm', textArg(mode)); }
  /** Mirrors Rust `TextForgeBuilderMethods::add_replace_rule` through `rmapd`. */
  addReplaceRule(name: TextArgument, pattern: TextArgument, replacement: TextArgument): Pipeline { return this.add('rmapd', textArg(name), textArg(pattern), textArg(replacement)); }
  /** Mirrors Rust `TextForgeBuilderMethods::execute_replace_map` through `rmape`. */
  executeReplaceMap(name: TextArgument): Pipeline { return this.add('rmape', textArg(name)); }
  /** Mirrors Rust `TextForgeBuilderMethods::append_line` through `apl`. */
  appendLine(text: TextArgument): Pipeline { return this.add('apl', textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_line` through `dln`. */
  deleteLine(line: NumberArgument): Pipeline { return this.add('dln', numberArg(line)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_lines_after` through `dlna`. */
  deleteLinesAfter(line: NumberArgument): Pipeline { return this.add('dlna', numberArg(line)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_lines_before` through `dlnb`. */
  deleteLinesBefore(line: NumberArgument): Pipeline { return this.add('dlnb', numberArg(line)); }
  /** Mirrors Rust `TextForgeBuilderMethods::select_lines` through `slnc`. */
  selectLines(startLine: NumberArgument, endLine: NumberArgument): Pipeline { return this.add('slnc', numberArg(startLine), numberArg(endLine)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_lines_interval` through `dlni`. */
  deleteLinesInterval(startLine: NumberArgument, endLine: NumberArgument): Pipeline { return this.add('dlni', numberArg(startLine), numberArg(endLine)); }
  /** Mirrors Rust `TextForgeBuilderMethods::insert_line` through `inl`. */
  insertLine(line: NumberArgument, text: TextArgument): Pipeline { return this.add('inl', numberArg(line), textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::remove_line_breaks` through `nln`. */
  removeLineBreaks(): Pipeline { return this.add('nln'); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_line` through `rln`. */
  replaceLine(line: NumberArgument, text: TextArgument): Pipeline { return this.add('rln', numberArg(line), textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::prepend_line` through `pln`. */
  prependLine(text: TextArgument): Pipeline { return this.add('pln', textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_empty_lines` through `dle`. */
  deleteEmptyLines(): Pipeline { return this.add('dle'); }
  /** Mirrors Rust `TextForgeBuilderMethods::keep_lines_matching` through `klm`. */
  keepLinesMatching(pattern: TextArgument): Pipeline { return this.add('klm', textArg(pattern)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_lines_matching` through `dlm`. */
  deleteLinesMatching(pattern: TextArgument): Pipeline { return this.add('dlm', textArg(pattern)); }
  /** Mirrors Rust `TextForgeBuilderMethods::reverse_lines` through `revln`. */
  reverseLines(): Pipeline { return this.add('revln'); }
  /** Mirrors Rust `TextForgeBuilderMethods::unique_lines` through `uniqln`. */
  uniqueLines(): Pipeline { return this.add('uniqln'); }
  /** Mirrors Rust `TextForgeBuilderMethods::join_lines` through `joinln`. */
  joinLines(separator: TextArgument): Pipeline { return this.add('joinln', textArg(separator)); }
  /** Mirrors Rust `TextForgeBuilderMethods::trim_both_sides` through `tbs`. */
  trimBothSides(): Pipeline { return this.add('tbs'); }
  /** Mirrors Rust `TextForgeBuilderMethods::trim_left_side` through `tls`. */
  trimLeftSide(): Pipeline { return this.add('tls'); }
  /** Mirrors Rust `TextForgeBuilderMethods::trim_right_side` through `trs`. */
  trimRightSide(): Pipeline { return this.add('trs'); }
  /** Mirrors Rust `TextForgeBuilderMethods::add_to_end` through `ate`. */
  addToEnd(text: TextArgument): Pipeline { return this.add('ate', textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::add_to_beginning` through `atb`. */
  addToBeginning(text: TextArgument): Pipeline { return this.add('atb', textArg(text)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_first` through `dlf`. */
  deleteFirst(): Pipeline { return this.add('dlf'); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_last` through `dll`. */
  deleteLast(): Pipeline { return this.add('dll'); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_after` through `dla`. */
  deleteAfter(index: NumberArgument): Pipeline { return this.add('dla', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_before` through `dlb`. */
  deleteBefore(index: NumberArgument): Pipeline { return this.add('dlb', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_chunk` through `dlc`. */
  deleteChunk(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('dlc', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_all_with` through `raw`. */
  replaceAllWith(pattern: TextArgument, textToReplace: TextArgument): Pipeline { return this.add('raw', textArg(pattern), textArg(textToReplace)); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_first_with` through `rfw`. */
  replaceFirstWith(pattern: TextArgument, textToReplace: TextArgument): Pipeline { return this.add('rfw', textArg(pattern), textArg(textToReplace)); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_last_with` through `rlw`. */
  replaceLastWith(pattern: TextArgument, textToReplace: TextArgument): Pipeline { return this.add('rlw', textArg(pattern), textArg(textToReplace)); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_nth_with` through `rnw`. */
  replaceNthWith(pattern: TextArgument, textToReplace: TextArgument, index: NumberArgument): Pipeline { return this.add('rnw', textArg(pattern), textArg(textToReplace), numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::replace_count_with` through `rcw`. */
  replaceCountWith(pattern: TextArgument, textToReplace: TextArgument, count: NumberArgument): Pipeline { return this.add('rcw', textArg(pattern), textArg(textToReplace), numberArg(count)); }
  /** Mirrors Rust `TextForgeBuilderMethods::rotate_left` through `rtl`. */
  rotateLeft(times: NumberArgument): Pipeline { return this.add('rtl', numberArg(times)); }
  /** Mirrors Rust `TextForgeBuilderMethods::rotate_right` through `rtr`. */
  rotateRight(times: NumberArgument): Pipeline { return this.add('rtr', numberArg(times)); }
  /** Mirrors Rust `TextForgeBuilderMethods::repeat` through `rpt`. */
  repeat(times: NumberArgument): Pipeline { return this.add('rpt', numberArg(times)); }
  /** Mirrors Rust `TextForgeBuilderMethods::select` through `slt`. */
  select(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('slt', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_uppercase_all` through `tua`. */
  toUppercaseAll(): Pipeline { return this.add('tua'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_lowercase_all` through `tla`. */
  toLowercaseAll(): Pipeline { return this.add('tla'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_uppercase_single` through `tucs`. */
  toUppercaseSingle(index: NumberArgument): Pipeline { return this.add('tucs', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_lowercase_single` through `tlcs`. */
  toLowercaseSingle(index: NumberArgument): Pipeline { return this.add('tlcs', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_uppercase_chunk` through `tucc`. */
  toUppercaseChunk(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('tucc', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_lowercase_chunk` through `tlcc`. */
  toLowercaseChunk(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('tlcc', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::capitalize_first_word` through `cfw`. */
  capitalizeFirstWord(): Pipeline { return this.add('cfw'); }
  /** Mirrors Rust `TextForgeBuilderMethods::capitalize_last_word` through `clw`. */
  capitalizeLastWord(): Pipeline { return this.add('clw'); }
  /** Mirrors Rust `TextForgeBuilderMethods::split_select` through `sslt`. */
  splitSelect(pattern: TextArgument, index: NumberArgument): Pipeline { return this.add('sslt', textArg(pattern), numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::capitalize_chunk` through `ctc`. */
  capitalizeChunk(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('ctc', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::capitalize_range` through `ctr`. */
  capitalizeRange(startIndex: NumberArgument, endIndex: NumberArgument): Pipeline { return this.add('ctr', numberArg(startIndex), numberArg(endIndex)); }
  /** Mirrors Rust `TextForgeBuilderMethods::capitalize_single_word` through `cts`. */
  capitalizeSingleWord(index: NumberArgument): Pipeline { return this.add('cts', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_url_encoded` through `urle`. */
  toUrlEncoded(): Pipeline { return this.add('urle'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_url_decoded` through `urld`. */
  toUrlDecoded(): Pipeline { return this.add('urld'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_reverse` through `rev`. */
  toReverse(): Pipeline { return this.add('rev'); }
  /** Mirrors Rust `TextForgeBuilderMethods::split_characters` through `splc`. */
  splitCharacters(): Pipeline { return this.add('splc'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_html_escaped` through `htmle`. */
  toHtmlEscaped(): Pipeline { return this.add('htmle'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_html_unescaped` through `htmlu`. */
  toHtmlUnescaped(): Pipeline { return this.add('htmlu'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_json_escaped` through `jsone`. */
  toJsonEscaped(): Pipeline { return this.add('jsone'); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_json_unescaped` through `jsonu`. */
  toJsonUnescaped(): Pipeline { return this.add('jsonu'); }
  /** Mirrors Rust `TextForgeBuilderMethods::insert` through `ins`. */
  insert(index: NumberArgument, textToInsert: TextArgument): Pipeline { return this.add('ins', numberArg(index), textArg(textToInsert)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_lowercase_word` through `tlcw`. */
  toLowercaseWord(index: NumberArgument): Pipeline { return this.add('tlcw', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::to_uppercase_word` through `tucw`. */
  toUppercaseWord(index: NumberArgument): Pipeline { return this.add('tucw', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::join_to_kebab_case` through `jkbc`. */
  joinToKebabCase(): Pipeline { return this.add('jkbc'); }
  /** Mirrors Rust `TextForgeBuilderMethods::join_to_snake_case` through `jsnc`. */
  joinToSnakeCase(): Pipeline { return this.add('jsnc'); }
  /** Mirrors Rust `TextForgeBuilderMethods::join_to_camel_case` through `jcmc`. */
  joinToCamelCase(): Pipeline { return this.add('jcmc'); }
  /** Mirrors Rust `TextForgeBuilderMethods::join_to_pascal_case` through `jpsc`. */
  joinToPascalCase(): Pipeline { return this.add('jpsc'); }
  /** Mirrors Rust `TextForgeBuilderMethods::pad_left` through `padl`. */
  padLeft(text: TextArgument, times: NumberArgument): Pipeline { return this.add('padl', textArg(text), numberArg(times)); }
  /** Mirrors Rust `TextForgeBuilderMethods::pad_right` through `padr`. */
  padRight(text: TextArgument, times: NumberArgument): Pipeline { return this.add('padr', textArg(text), numberArg(times)); }
  /** Mirrors Rust `TextForgeBuilderMethods::remove_whitespace` through `rmws`. */
  removeWhitespace(): Pipeline { return this.add('rmws'); }
  /** Mirrors Rust `TextForgeBuilderMethods::delete_single` through `dls`. */
  deleteSingle(index: NumberArgument): Pipeline { return this.add('dls', numberArg(index)); }
  /** Mirrors Rust `TextForgeBuilderMethods::extract_matches_joined` through `emj`. */
  extractMatchesJoined(pattern: TextArgument, separator: TextArgument): Pipeline { return this.add('emj', textArg(pattern), textArg(separator)); }
  /** Mirrors Rust `TextForgeBuilderMethods::val` through `val`. */
  val(varName: TextArgument, varValue: ValueArgument): Pipeline { return this.add('val', textArg(varName), valueArg(varValue)); }
  /** Mirrors Rust `TextForgeBuilderMethods::var` through `var`. */
  var(varName: TextArgument, varValue: ValueArgument): Pipeline { return this.add('var', textArg(varName), valueArg(varValue)); }
  /** Mirrors Rust `TextForgeBuilderMethods::mut_var` through `mutv`. */
  mutVar(varName: TextArgument, varValue: ValueArgument): Pipeline { return this.add('mutv', textArg(varName), valueArg(varValue)); }
  /** Mirrors Rust `TextForgeBuilderMethods::eval` through `eval`. */
  eval(expr: TextArgument, varName: TextArgument): Pipeline { return this.add('eval', textArg(expr), textArg(varName)); }
  /** Mirrors Rust `TextForgeBuilderMethods::iter` through `iter`. */
  iter(times: NumberArgument, inner: InstructionArgument): Pipeline { return this.add('iter', numberArg(times), instructionArg(inner)); }
  /** Mirrors Rust `TextForgeBuilderMethods::remove_pattern` through `rmp`. */
  removePattern(pattern: TextArgument): Pipeline { return this.add('rmp', textArg(pattern)); }
  /** Mirrors Rust `TextForgeBuilderMethods::end` through `end`. */
  end(): Pipeline { return this.add('end'); }
  // END GENERATED BUILDER METHODS
}
/** Reusable immutable executable; each process call creates a fresh engine context. */
export class CompiledPipeline {
  /** @internal */
  constructor(
    private readonly inner: InstanceType<typeof native.CompiledPipeline>,
    private readonly source: Pipeline,
  ) {}
  /** @internal Register a fresh snapshot without consuming this executable. */
  lower(): InstanceType<typeof native.Plan> { return this.source.lower(); }
  process(input: string): string { return this.inner.process(text(input)); }
}
/** Lossless OS path. Unix bytes and Windows wide paths use the portable constructors. */
export class FilePath {
  /** @internal */
  constructor(readonly inner: InstanceType<typeof native.FilePath>) {}
  static fromText(value: string): FilePath { return new FilePath(native.FilePath.fromText(text(value))); }
  static fromNativeBytes(value: Uint8Array): FilePath {
    if (!(value instanceof Uint8Array)) throw new TypeError('FilePath.fromNativeBytes requires Uint8Array or Buffer');
    return new FilePath(native.FilePath.fromNativeBytes(Buffer.from(value)));
  }
  static fromWindowsWide(value: Uint16Array): FilePath {
    if (!(value instanceof Uint16Array)) throw new TypeError('FilePath.fromWindowsWide requires Uint16Array');
    return new FilePath(native.FilePath.fromWindowsWide(value));
  }
  toText(): string | null { return this.inner.toText() ?? null; }
  toNativeBytes(): Buffer { return this.inner.toNativeBytes(); }
  toWindowsWide(): Uint16Array { return this.inner.toWindowsWide(); }
}
export type Path = string | FilePath | Uint8Array | URL;
function path(value: Path): FilePath {
  if (value instanceof FilePath) return value;
  if (value instanceof URL) return FilePath.fromText(fileURLToPath(value));
  if (value instanceof Uint8Array) return FilePath.fromNativeBytes(value);
  return FilePath.fromText(value);
}
export interface Features { bytecode:boolean; watchers:boolean; buffered:boolean }
export function features(): Features { return native.features(); }
/** Placement threshold is not a hard memory limit. */
export class BufferOptions {
  readonly memoryThreshold: bigint;
  readonly spillDirectory: FilePath;
  /** @internal */
  readonly inner: InstanceType<typeof native.BufferOptions>;
  constructor(memoryThreshold: Integer = 8 * 1024 * 1024, spillDirectory: Path = tmpdir()) {
    this.memoryThreshold = integer(memoryThreshold); this.spillDirectory = path(spillDirectory);
    this.inner = new native.BufferOptions(this.memoryThreshold,this.spillDirectory.inner);
  }
}
function bufferOptions(value: BufferOptions): InstanceType<typeof native.BufferOptions> {
  if (!(value instanceof BufferOptions)) throw new TypeError('expected BufferOptions');
  return value.inner;
}
/** Synchronous byte reader. Empty data marks EOF; maximum must be respected. */
export type StreamReader = (maximum: bigint) => Uint8Array;
/** Synchronous writer. Return the accepted byte count; partial writes are retried. */
export type StreamWriter = (bytes: Buffer) => Integer;
/** Owned UTF-8 spool. Consuming methods invalidate input even if execution fails. */
export class PortableBuffer {
  /** @internal */
  constructor(readonly inner: InstanceType<typeof native.PortableBuffer>) {}
  static fromText(value: string, options = new BufferOptions()): PortableBuffer {
    return new PortableBuffer(native.PortableBuffer.fromText(text(value),bufferOptions(options)));
  }
  static fromFile(value: Path, options = new BufferOptions()): PortableBuffer {
    return new PortableBuffer(native.PortableBuffer.fromFile(path(value).inner,bufferOptions(options)));
  }
  static fromReader(reader: StreamReader, options = new BufferOptions()): PortableBuffer {
    if (typeof reader !== 'function') throw new TypeError('PortableBuffer.fromReader requires a synchronous reader callback');
    return new PortableBuffer(native.PortableBuffer.fromReader(max => {
      const result = reader(max);
      if (!(result instanceof Uint8Array)) throw new TypeError('reader must return Uint8Array synchronously');
      return Buffer.from(result);
    },bufferOptions(options)));
  }
  lenBytes(): bigint { return this.inner.lenBytes(); }
  isEmpty(): boolean { return this.inner.isEmpty(); }
  isSpilled(): boolean { return this.inner.isSpilled(); }
  spill(): void { this.inner.spill(); }
  readAt(offset: Integer, maximum: Integer): Buffer { return this.inner.readAt(integer(offset),integer(maximum)); }
  copyTo(writer: StreamWriter): bigint {
    if (typeof writer !== 'function') throw new TypeError('PortableBuffer.copyTo requires a synchronous writer callback');
    return this.inner.copyTo(bytes => integer(writer(bytes)));
  }
  writeToFile(value: Path): bigint { return this.inner.writeToFile(path(value).inner); }
  intoString(): string { return this.inner.intoString(); }
  close(): void { this.inner.close(); }
  get closed(): boolean { return this.inner.closed; }
}
export interface Observation { current:string; before:string; after?:string | null; instruction:string }
export type Observer = (observation: Observation) => string;
/** Watchers retain callbacks until replacement, close, or garbage collection. */
export class Observers {
  /** @internal */
  readonly inner = new native.Observers();
  set(name: string, callback: Observer): void {
    if (typeof callback !== 'function') throw new TypeError('Observers.set requires a synchronous observer callback');
    this.inner.set(text(name), value => text(callback(Object.freeze({...value}))));
  }
  setBuiltin(name: string, metric: BuiltinWatcherMetric): void { this.inner.setBuiltin(text(name),text(metric)); }
  static builtinNames(): BuiltinWatcherMetric[] { return native.Observers.builtinNames() as BuiltinWatcherMetric[]; }
  scheduleAll(name: string): void { this.inner.scheduleAll(text(name)); }
  reset(): void { this.inner.reset(); }
  close(): void { this.inner.close(); }
  get closed(): boolean { return this.inner.closed; }
  run(value: Observation): void {
    if (typeof value !== 'object' || value === null) throw new TypeError('Observers.run requires an Observation object');
    this.inner.run({current:text(value.current),before:text(value.before),after:value.after == null ? undefined : text(value.after),instruction:text(value.instruction)});
  }
  writeReport(value: Path): void { this.inner.writeReport(path(value).inner); }
}
/** Reusable Rayon workers, released explicitly by close() or garbage collection. */
export class BatchPool {
  /** @internal */
  readonly inner: InstanceType<typeof native.BatchPool>;
  constructor(threads: Integer = 0) { this.inner = new native.BatchPool(integer(threads)); }
  close(): void { this.inner.close(); }
  get closed(): boolean { return this.inner.closed; }
}
export interface FileTask { input:Path; pipelineId:string; output:Path }
export interface BufferTask { input:Path; pipelineId:string }
function fileTasks(tasks: readonly FileTask[]) {
  if (!Array.isArray(tasks)) throw new TypeError('file tasks must be an array of {input, pipelineId, output}');
  return Array.from(tasks, task => {
    if (typeof task !== 'object' || task === null) throw new TypeError('each file task must contain input, pipelineId and output');
    return {input:path(task.input).inner,pipelineId:text(task.pipelineId),output:path(task.output).inner};
  });
}
/** Pipeline inputs accepted by both register() and addTransform(). */
export type PipelineSource = Pipeline | CompiledPipeline | readonly Instruction[];

function instructions(values: readonly Instruction[]): InstanceType<typeof native.Instruction>[] {
  return Array.from(values, value => {
    if (!(value instanceof Instruction)) throw new TypeError('pipeline instruction arrays must contain Instruction objects');
    return value.toNative();
  });
}
function singleInstruction(value: Instruction | Pipeline): InstanceType<typeof native.Instruction> {
  if (value instanceof Pipeline) value = value.asInstruction();
  if (!(value instanceof Instruction)) throw new TypeError('expected an Instruction or a single-instruction Pipeline');
  return value.toNative();
}
/** Complete processor facade. All calls execute synchronously on the calling Node thread. */
export class Processor {
  private readonly inner = new native.Processor();
  createPipeline(): Pipeline { return Pipeline.forProcessor(this); }
  /** Validate and register an independent pipeline snapshot, returning its ID. */
  register(source: PipelineSource): string {
    if (Array.isArray(source)) return this.inner.addTransform(instructions(source));
    if (source instanceof Pipeline || source instanceof CompiledPipeline) return this.inner.register(source.lower());
    throw new TypeError('register expects a Pipeline, CompiledPipeline, or array of Instruction objects; build() returns an ID that is already registered');
  }
  /** Register an externally constructed pipeline or an array of instructions. */
  addTransform(source: PipelineSource): string { return this.register(source); }
  removeTransform(id: string): void { this.inner.removeTransform(text(id)); }
  transformExists(id: string): boolean { return this.inner.transformExists(text(id)); }
  listTransforms(): string[] { return this.inner.listTransforms(); }
  showTransforms(): void { this.inner.showTransforms(); }
  clonePipeline(id: string): string { return this.inner.clonePipeline(text(id)); }
  getTransformVec(id: string): Instruction[] { return this.inner.getTransformVec(text(id)).map(i => Instruction.fromNative(i)); }
  getTextTransformVec(id: string): string[] { return this.inner.getTextTransformVec(text(id)); }
  getPipelineFromFile(value: Path): string { return this.inner.getPipelineFromFile(path(value).inner); }
  writePipelineToFile(id: string, value: Path): void { this.inner.writePipelineToFile(text(id),path(value).inner); }
  readFromBytecodeFile(value: Path): string { return this.inner.readFromBytecodeFile(path(value).inner); }
  writeToBytecodeFile(id: string, value: Path): void { this.inner.writeToBytecodeFile(text(id),path(value).inner); }
  runTransform(id: string, input: string): string { return this.inner.runTransform(text(id),text(input)); }
  processAll(id: string, input: string): string { return this.inner.processAll(text(id),text(input)); }
  processSingle(instruction: Instruction | Pipeline, input: string): string { return this.inner.processSingle(singleInstruction(instruction),text(input)); }
  processAllWithDebug(id: string, input: string): string { return this.inner.processAllWithDebug(text(id),text(input)); }
  processSingleWithDebug(instruction: Instruction | Pipeline, input: string): string { return this.inner.processSingleWithDebug(singleInstruction(instruction),text(input)); }
  processFile(id: string, input: Path, output: Path): void { this.inner.processFile(text(id),path(input).inner,path(output).inner); }
  processBatch(tasks: readonly FileTask[]): (TextForgeError | null)[] {
    return this.inner.processBatch(fileTasks(tasks)).map(r => r.error ? new TextForgeError(r.error) : null);
  }
  processBatchInPool(pool: BatchPool, tasks: readonly FileTask[]): (TextForgeError | null)[] {
    if (!(pool instanceof BatchPool)) throw new TypeError('processBatchInPool requires a BatchPool');
    return this.inner.processBatchInPool(pool.inner,fileTasks(tasks)).map(r => r.error ? new TextForgeError(r.error) : null);
  }
  processAllWithWatchers(id: string, input: string, observers: Observers, report: Path): string {
    if (!(observers instanceof Observers)) throw new TypeError('processAllWithWatchers requires an Observers instance');
    return this.inner.processAllWithWatchers(text(id),text(input),observers.inner,path(report).inner);
  }
  processAllBuffered(id: string, input: PortableBuffer): PortableBuffer {
    if (!(input instanceof PortableBuffer)) throw new TypeError('processAllBuffered requires a PortableBuffer');
    return new PortableBuffer(this.inner.processAllBuffered(text(id),input.inner));
  }
  processSingleBuffered(instruction: string, input: PortableBuffer): PortableBuffer {
    if (!(input instanceof PortableBuffer)) throw new TypeError('processSingleBuffered requires a PortableBuffer');
    return new PortableBuffer(this.inner.processSingleBuffered(text(instruction),input.inner));
  }
  processFileBuffered(id: string, input: Path, options = new BufferOptions()): PortableBuffer {
    return new PortableBuffer(this.inner.processFileBuffered(text(id),path(input).inner,bufferOptions(options)));
  }
  processBatchBuffered(tasks: readonly BufferTask[], options = new BufferOptions()): (PortableBuffer | TextForgeError)[] {
    if (!Array.isArray(tasks)) throw new TypeError('buffer tasks must be an array of {input, pipelineId}');
    const requests = Array.from(tasks, task => {
      if (typeof task !== 'object' || task === null) throw new TypeError('each buffer task must contain input and pipelineId');
      return {pipelineId:text(task.pipelineId),input:path(task.input).inner};
    });
    return this.inner.processBatchBuffered(requests,bufferOptions(options))
      .map(r => r.error ? new TextForgeError(r.error) : new PortableBuffer(r.buffer!));
  }
}
export const version = '0.1.0';
export const coreVersion = '0.2.0';
