use crate::*;
/// Owned native path; public example: `FilePath.fromText('input.txt')`.
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
pub struct FilePath {
    pub(crate) inner: p::FilePath,
}
#[napi]
impl FilePath {
    #[napi(factory)]
    pub fn from_text(text: String) -> Self {
        Self {
            inner: p::FilePath::from_text(text),
        }
    }
    #[napi(factory)]
    pub fn from_native_bytes(env: Env, bytes: Buffer) -> Result<Self> {
        p::FilePath::from_native_bytes(bytes.to_vec())
            .map(|inner| Self { inner })
            .map_err(|e| error(env, e))
    }
    #[napi(factory)]
    pub fn from_windows_wide(env: Env, wide: Uint16Array) -> Result<Self> {
        p::FilePath::from_windows_wide(wide.to_vec())
            .map(|inner| Self { inner })
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn to_text(&self) -> Option<String> {
        self.inner.to_text()
    }
    #[napi]
    pub fn to_native_bytes(&self, env: Env) -> Result<Buffer> {
        self.inner
            .to_native_bytes()
            .map(Buffer::from)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn to_windows_wide(&self, env: Env) -> Result<Uint16Array> {
        self.inner
            .to_windows_wide()
            .map(Uint16Array::new)
            .map_err(|e| error(env, e))
    }
}
/// Enabled production capabilities. Example: `features().buffered`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct Features {
    pub bytecode: bool,
    pub watchers: bool,
    pub buffered: bool,
}
#[napi]
pub fn features() -> Features {
    let f = p::features();
    Features {
        bytecode: f.bytecode,
        watchers: f.watchers,
        buffered: f.buffered,
    }
}
/// Reusable worker pool. Example: `const pool = new BatchPool(2n); pool.close()`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi]
pub struct BatchPool {
    pub(crate) inner: Option<p::BatchPool>,
}
#[napi]
impl BatchPool {
    #[napi(constructor)]
    pub fn new(env: Env, threads: BigInt) -> Result<Self> {
        p::BatchPool::new(number(threads)?)
            .map(|v| Self { inner: Some(v) })
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
