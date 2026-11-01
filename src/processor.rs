/// Structured portable failure used in ordered batch results.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct ErrorData {
    pub stage: String,
    pub code: u32,
    pub message: String,
    pub instruction: String,
    pub input: String,
}
use crate::buffers::{BufferOptions, PortableBuffer};
use crate::paths::{BatchPool, FilePath};
use crate::watchers::Observers;
use crate::*;
/// File batch request. Example: `{input, pipelineId: id, output}`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct FileTask {
    pub input: Reference<FilePath>,
    pub pipeline_id: String,
    pub output: Reference<FilePath>,
}
/// Buffered file request. Example: `{pipelineId: id, input}`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct BufferTask {
    pub pipeline_id: String,
    pub input: Reference<FilePath>,
}
/// Ordered batch result, retaining structured errors without aborting other tasks.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct BatchResult {
    pub error: Option<ErrorData>,
    pub buffer: Option<Reference<PortableBuffer>>,
}
fn batch_result(
    env: Env,
    value: std::result::Result<Option<p::PortableBuffer>, p::BindingError>,
) -> Result<BatchResult> {
    match value {
        Ok(value) => Ok(BatchResult {
            error: None,
            buffer: value
                .map(|v| PortableBuffer { inner: Some(v) }.into_reference(env))
                .transpose()?,
        }),
        Err(e) => {
            let object = ErrorData {
                stage: format!("{:?}", e.stage).to_lowercase(),
                code: u32::from(e.code),
                message: e.message,
                instruction: e.instruction,
                input: e.input,
            };
            Ok(BatchResult {
                error: Some(object),
                buffer: None,
            })
        }
    }
}
fn tasks(values: Vec<FileTask>) -> Vec<p::FileTask> {
    values
        .into_iter()
        .map(|t| p::FileTask {
            input: t.input.inner.clone(),
            pipeline_id: t.pipeline_id,
            output: t.output.inner.clone(),
        })
        .collect()
}
/// Full portable processor. Example: `processor.register(plan)`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi]
#[derive(Default)]
pub struct Processor {
    inner: p::PortableProcessor,
}
#[napi]
impl Processor {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::default()
    }
    #[napi]
    pub fn register(&mut self, env: Env, plan: &Plan) -> Result<String> {
        self.inner.register(&plan.inner).map_err(|e| error(env, e))
    }
    #[napi]
    pub fn add_transform(
        &mut self,
        env: Env,
        instructions: Vec<Reference<Instruction>>,
    ) -> Result<String> {
        self.inner
            .add_transform(instructions.iter().map(|i| i.spec.clone()).collect())
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn get_transform_vec(&self, env: Env, id: String) -> Result<Vec<Instruction>> {
        self.inner
            .get_transform_vec(&id)
            .map(|v| v.into_iter().map(|spec| Instruction { spec }).collect())
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn remove_transform(&mut self, env: Env, id: String) -> Result<()> {
        self.inner.remove_transform(&id).map_err(|e| error(env, e))
    }
    #[napi]
    pub fn clone_pipeline(&mut self, env: Env, id: String) -> Result<String> {
        self.inner.clone_pipeline(&id).map_err(|e| error(env, e))
    }
    #[napi]
    pub fn get_text_transform_vec(&mut self, env: Env, id: String) -> Result<Vec<String>> {
        self.inner
            .get_text_transform_vec(&id)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn get_pipeline_from_file(&mut self, env: Env, path: &FilePath) -> Result<String> {
        self.inner
            .get_pipeline_from_file(&path.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn read_from_bytecode_file(&mut self, env: Env, path: &FilePath) -> Result<String> {
        self.inner
            .read_from_bytecode_file(&path.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn write_pipeline_to_file(&mut self, env: Env, id: String, path: &FilePath) -> Result<()> {
        self.inner
            .write_pipeline_to_file(&id, &path.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn write_to_bytecode_file(&mut self, env: Env, id: String, path: &FilePath) -> Result<()> {
        self.inner
            .write_to_bytecode_file(&id, &path.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_file(
        &mut self,
        env: Env,
        id: String,
        input: &FilePath,
        output: &FilePath,
    ) -> Result<()> {
        self.inner
            .process_file(&id, &input.inner, &output.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn run_transform(&mut self, env: Env, id: String, input: String) -> Result<String> {
        self.inner
            .run_transform(&id, &input)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_all(&mut self, env: Env, id: String, input: String) -> Result<String> {
        self.inner
            .process_all(&id, &input)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_all_with_debug(
        &mut self,
        env: Env,
        id: String,
        input: String,
    ) -> Result<String> {
        self.inner
            .process_all_with_debug(&id, &input)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_single(
        &mut self,
        env: Env,
        instruction: &Instruction,
        input: String,
    ) -> Result<String> {
        self.inner
            .process_single(instruction.spec.clone(), &input)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_single_with_debug(
        &mut self,
        env: Env,
        instruction: &Instruction,
        input: String,
    ) -> Result<String> {
        self.inner
            .process_single_with_debug(instruction.spec.clone(), &input)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn transform_exists(&self, id: String) -> bool {
        self.inner.transform_exists(&id)
    }
    #[napi]
    pub fn list_transforms(&self) -> Vec<String> {
        self.inner.list_transforms()
    }
    #[napi]
    pub fn show_transforms(&self) {
        self.inner.show_transforms();
    }
    #[napi]
    pub fn process_batch(&self, env: Env, requests: Vec<FileTask>) -> Result<Vec<BatchResult>> {
        self.inner
            .process_batch(tasks(requests))
            .into_iter()
            .map(|r| batch_result(env, r.map(|_| None)))
            .collect()
    }
    #[napi]
    pub fn process_batch_in_pool(
        &self,
        env: Env,
        pool: &BatchPool,
        requests: Vec<FileTask>,
    ) -> Result<Vec<BatchResult>> {
        self.inner
            .process_batch_in_pool(live(&pool.inner)?, tasks(requests))
            .into_iter()
            .map(|r| batch_result(env, r.map(|_| None)))
            .collect()
    }
    #[napi]
    pub fn process_all_with_watchers(
        &mut self,
        env: Env,
        id: String,
        input: String,
        observers: &mut Observers,
        report: &FilePath,
    ) -> Result<String> {
        self.inner
            .process_all_with_watchers(&id, &input, live_mut(&mut observers.inner)?, &report.inner)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_all_buffered(
        &mut self,
        env: Env,
        id: String,
        input: &mut PortableBuffer,
    ) -> Result<PortableBuffer> {
        self.inner
            .process_all_buffered(&id, take(&mut input.inner)?)
            .map(|v| PortableBuffer { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_single_buffered(
        &mut self,
        env: Env,
        instruction: String,
        input: &mut PortableBuffer,
    ) -> Result<PortableBuffer> {
        self.inner
            .process_single_buffered(&instruction, take(&mut input.inner)?)
            .map(|v| PortableBuffer { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_file_buffered(
        &mut self,
        env: Env,
        id: String,
        input: &FilePath,
        options: &BufferOptions,
    ) -> Result<PortableBuffer> {
        self.inner
            .process_file_buffered(&id, &input.inner, options.inner.clone())
            .map(|v| PortableBuffer { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn process_batch_buffered(
        &self,
        env: Env,
        requests: Vec<BufferTask>,
        options: &BufferOptions,
    ) -> Result<Vec<BatchResult>> {
        self.inner
            .process_batch_buffered(
                requests
                    .into_iter()
                    .map(|t| p::BufferTask {
                        pipeline_id: t.pipeline_id,
                        input: t.input.inner.clone(),
                    })
                    .collect(),
                options.inner.clone(),
            )
            .into_iter()
            .map(|r| batch_result(env, r.map(Some)))
            .collect()
    }
}
