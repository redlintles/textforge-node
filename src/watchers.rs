use crate::paths::FilePath;
use crate::*;
/// Owned observation snapshot. Example callback: `o => String(o.current.length)`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct Observation {
    pub current: String,
    pub before: String,
    pub after: Option<String>,
    pub instruction: String,
}
impl From<p::Observation> for Observation {
    fn from(o: p::Observation) -> Self {
        Self {
            current: o.current,
            before: o.before,
            after: o.after,
            instruction: o.instruction,
        }
    }
}
impl From<Observation> for p::Observation {
    fn from(o: Observation) -> Self {
        Self {
            current: o.current,
            before: o.before,
            after: o.after,
            instruction: o.instruction,
        }
    }
}
/// Thread-confined synchronous watchers. Example: `observers.setBuiltin('size','current_len_chars')`.
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
pub struct Observers {
    pub(crate) inner: Option<p::Observers>,
}
#[napi]
impl Observers {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self {
            inner: Some(p::Observers::new()),
        }
    }
    #[napi]
    pub fn set(
        &mut self,
        env: Env,
        name: String,
        callback: Function<Observation, String>,
    ) -> Result<()> {
        let callback = callback.create_ref()?;
        live_mut(&mut self.inner)?.set(
            name,
            Box::new(move |o: p::Observation| {
                callback
                    .borrow_back(&env)
                    .and_then(|f| f.call(o.into()))
                    .map_err(|e| e.reason)
            }),
        );
        Ok(())
    }
    #[napi]
    pub fn set_builtin(&mut self, env: Env, name: String, metric: String) -> Result<()> {
        live_mut(&mut self.inner)?
            .set_builtin(name, &metric)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn builtin_names() -> Vec<String> {
        p::Observers::builtin_names()
    }
    #[napi]
    pub fn schedule_all(&mut self, env: Env, name: String) -> Result<()> {
        live_mut(&mut self.inner)?
            .schedule_all(&name)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn reset(&mut self) -> Result<()> {
        live_mut(&mut self.inner)?.reset();
        Ok(())
    }
    #[napi]
    pub fn run(&mut self, env: Env, observation: Observation) -> Result<()> {
        live_mut(&mut self.inner)?
            .run(observation.into())
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn write_report(&self, env: Env, path: &FilePath) -> Result<()> {
        live(&self.inner)?
            .write_report(&path.inner)
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
