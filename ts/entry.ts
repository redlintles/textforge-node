/** Both module formats use the same implementation and class identities. */
export {
  BatchPool, BufferOptions, CompiledPipeline, ExecutionProfile, FilePath, Instruction, Observers,
  Pipeline, PortableBuffer, Processor, ReplaceMapBuilder, TextForgeError, Variable,
  coreVersion, features, getVar, version,
} from './index.js';
export type {
  Argument, BufferTask, BuiltinWatcherMetric, ErrorParameter, ErrorStage, ExecutionProfileName,
  ExecutionProfileSettings, Features, FileTask, InstructionArgument,
  Integer, NormalizationMode, NumberArgument, Observation, Observer, Path, PipelineBody,
  PipelineSource, ReplaceMapBody, StreamReader, StreamWriter, TextArgument, TextForgeErrorData,
  TraceFrame, ValueArgument,
} from './index.js';
