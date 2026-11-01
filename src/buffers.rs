use crate::paths::FilePath;
use crate::*;
/// Buffer placement options. Example: `new BufferOptions(1024n, FilePath.fromText('.'))`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi]
#[derive(Clone)]
pub struct BufferOptions {
    pub(crate) inner: p::BufferOptions,
}
#[napi]
impl BufferOptions {
    #[napi(constructor)]
    pub fn new(threshold: BigInt, directory: &FilePath) -> Result<Self> {
        Ok(Self {
            inner: p::BufferOptions {
                memory_threshold: number(threshold)?,
                spill_directory: directory.inner.clone(),
            },
        })
    }
}
/// Owned UTF-8 spool. Example: `PortableBuffer.fromText('é', options).intoString()`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi]
pub struct PortableBuffer {
    pub(crate) inner: Option<p::PortableBuffer>,
}
#[napi]
impl PortableBuffer {
    #[napi(factory)]
    pub fn from_text(env: Env, text: String, options: &BufferOptions) -> Result<Self> {
        p::PortableBuffer::from_text(&text, options.inner.clone())
            .map(|v| Self { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi(factory)]
    pub fn from_file(env: Env, path: &FilePath, options: &BufferOptions) -> Result<Self> {
        p::PortableBuffer::from_file(&path.inner, options.inner.clone())
            .map(|v| Self { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi(factory)]
    pub fn from_reader(
        env: Env,
        callback: Function<BigInt, Buffer>,
        options: &BufferOptions,
    ) -> Result<Self> {
        let callback = callback.create_ref()?;
        let reader = move |maximum: u64| {
            callback
                .borrow_back(&env)
                .and_then(|f| f.call(maximum.into()))
                .map(|v| v.to_vec())
                .map_err(|e| e.reason)
        };
        p::PortableBuffer::from_reader(Box::new(reader), options.inner.clone())
            .map(|v| Self { inner: Some(v) })
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn len_bytes(&self) -> Result<BigInt> {
        Ok(live(&self.inner)?.len_bytes().into())
    }
    #[napi]
    pub fn is_empty(&self) -> Result<bool> {
        Ok(live(&self.inner)?.is_empty())
    }
    #[napi]
    pub fn is_spilled(&self) -> Result<bool> {
        Ok(live(&self.inner)?.is_spilled())
    }
    #[napi]
    pub fn spill(&mut self, env: Env) -> Result<()> {
        live_mut(&mut self.inner)?
            .spill()
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn read_at(&mut self, env: Env, offset: BigInt, maximum: BigInt) -> Result<Buffer> {
        live_mut(&mut self.inner)?
            .read_at(number(offset)?, number(maximum)?)
            .map(Buffer::from)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn copy_to(&mut self, env: Env, callback: Function<Buffer, BigInt>) -> Result<BigInt> {
        let callback = callback.create_ref()?;
        let writer = move |bytes: Vec<u8>| {
            callback
                .borrow_back(&env)
                .and_then(|f| f.call(Buffer::from(bytes)))
                .and_then(number)
                .map_err(|e| e.reason)
        };
        live_mut(&mut self.inner)?
            .copy_to(Box::new(writer))
            .map(BigInt::from)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn write_to_file(&mut self, env: Env, path: &FilePath) -> Result<BigInt> {
        live_mut(&mut self.inner)?
            .write_to_file(&path.inner)
            .map(BigInt::from)
            .map_err(|e| error(env, e))
    }
    #[napi(js_name = "intoString")]
    pub fn consume_string(&mut self, env: Env) -> Result<String> {
        take(&mut self.inner)?
            .into_string()
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn close(&mut self) {
        self.inner = None;
    }
    #[napi(getter)]
    pub fn closed(&self) -> bool {
        self.inner.is_none()
    }
}
