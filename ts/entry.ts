/** Both module formats use the same implementation and class identities. */
export {
  BatchPool, BufferOptions, CompiledPipeline, FilePath, Instruction, Observers,
  Pipeline, PortableBuffer, Processor, TextForgeError, Variable,
  coreVersion, features, getVar, version,
} from './index.js';
export type {
  Argument, BufferTask, ErrorStage, Features, FileTask, InstructionArgument,
  Integer, NumberArgument, Observation, Observer, Path, PipelineBody,
  PipelineSource, StreamReader, StreamWriter, TextArgument, ValueArgument,
} from './index.js';
