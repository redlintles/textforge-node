//! Node-API adapter for TextForge's owned portable API.
//!
//! ```
//! use textforge::api::portable::{PipelinePlan, InstructionSpec};
//! let mut plan = PipelinePlan::new();
//! plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
//! assert_eq!(plan.compile()?.process(" é ")?, "é");
//! # Ok::<(), textforge::api::portable::BindingError>(())
//! ```
mod buffers;
pub mod paths;
mod processor;
mod watchers;
use napi::bindgen_prelude::*;
use napi_derive::napi;
use textforge::api::portable as p;

fn error(env: Env, e: p::BindingError) -> napi::Error {
    let decorated = (|| -> Result<napi::Error> {
        let mut object = env.create_error(napi::Error::from_reason(e.message.clone()))?;
        object.set_named_property("name", "TextForgeError")?;
        object.set_named_property("stage", format!("{:?}", e.stage).to_lowercase())?;
        object.set_named_property("code", u32::from(e.code))?;
        object.set_named_property("instruction", e.instruction.clone())?;
        object.set_named_property("input", e.input.clone())?;
        Ok(napi::Error::from(object.into_unknown(&env)?))
    })();
    match decorated {
        Ok(e) => e,
        Err(e) => e,
    }
}
fn number(value: BigInt) -> Result<u64> {
    let (negative, value, lossless) = value.get_u64();
    if negative || !lossless {
        return Err(napi::Error::from_reason(
            "expected an unsigned 64-bit integer",
        ));
    }
    Ok(value)
}
fn live<T>(value: &Option<T>) -> Result<&T> {
    value
        .as_ref()
        .ok_or_else(|| napi::Error::from_reason("resource is closed or consumed"))
}
fn live_mut<T>(value: &mut Option<T>) -> Result<&mut T> {
    value
        .as_mut()
        .ok_or_else(|| napi::Error::from_reason("resource is closed or consumed"))
}
fn take<T>(value: &mut Option<T>) -> Result<T> {
    value
        .take()
        .ok_or_else(|| napi::Error::from_reason("resource is closed or consumed"))
}

/// Internal typed argument transport. Public users construct `Instruction` in TypeScript.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct NativeArgument {
    pub kind: String,
    pub text: Option<String>,
    pub number: Option<BigInt>,
    pub instruction: Option<Reference<Instruction>>,
}

fn argument(arg: NativeArgument) -> Result<p::Argument> {
    Ok(match arg.kind.as_str() {
        "text" => p::Argument::Text(
            arg.text
                .ok_or_else(|| napi::Error::from_reason("missing text"))?,
        ),
        "variable" => p::Argument::Variable(
            arg.text
                .ok_or_else(|| napi::Error::from_reason("missing variable"))?,
        ),
        "number" => p::Argument::Number(number(
            arg.number
                .ok_or_else(|| napi::Error::from_reason("missing number"))?,
        )?),
        "instruction" => p::Argument::Instruction(Box::new(
            arg.instruction
                .ok_or_else(|| napi::Error::from_reason("missing instruction"))?
                .spec
                .clone(),
        )),
        _ => return Err(napi::Error::from_reason("unknown argument kind")),
    })
}

/// Owned instruction handle. Example: `new Instruction('atb', [{kind:'text',text:'!'}])`.
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
pub struct Instruction {
    spec: p::InstructionSpec,
}
#[napi]
impl Instruction {
    #[napi(constructor)]
    pub fn new(name: String, arguments: Vec<NativeArgument>) -> Result<Self> {
        let args = arguments
            .into_iter()
            .map(argument)
            .collect::<Result<Vec<_>>>()?;
        Ok(Self {
            spec: p::InstructionSpec::new(name, args),
        })
    }
    #[napi(getter)]
    pub fn name(&self) -> String {
        self.spec.name.clone()
    }
    #[napi]
    pub fn arguments(&self, env: Env) -> Result<Vec<NativeArgument>> {
        self.spec
            .arguments
            .iter()
            .map(|arg| {
                Ok(match arg {
                    p::Argument::Text(v) => NativeArgument {
                        kind: "text".into(),
                        text: Some(v.clone()),
                        number: None,
                        instruction: None,
                    },
                    p::Argument::Variable(v) => NativeArgument {
                        kind: "variable".into(),
                        text: Some(v.clone()),
                        number: None,
                        instruction: None,
                    },
                    p::Argument::Number(v) => NativeArgument {
                        kind: "number".into(),
                        text: None,
                        number: Some((*v).into()),
                        instruction: None,
                    },
                    p::Argument::Instruction(v) => NativeArgument {
                        kind: "instruction".into(),
                        text: None,
                        number: None,
                        instruction: Some(
                            Instruction {
                                spec: (**v).clone(),
                            }
                            .into_reference(env)?,
                        ),
                    },
                    _ => return Err(napi::Error::from_reason("unsupported portable argument")),
                })
            })
            .collect()
    }
}
/// Owned regex/replacement pair used only by the adapter's map transport.
///
/// ```
/// use textforge::api::portable::{Argument, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.define_replace_map(Argument::Text("m".into()), vec![(Argument::Text("a".into()), Argument::Text("b".into()))])?;
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi(object)]
pub struct NativeReplaceRule {
    pub pattern: NativeArgument,
    pub replacement: NativeArgument,
}

/// Temporary lowering plan. Public API: `new Pipeline().trimBothSides().compile()`.
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
pub struct Plan {
    inner: p::PipelinePlan,
}
#[napi]
impl Plan {
    #[napi(constructor)]
    pub fn new() -> Self {
        Self::default()
    }
    #[napi]
    pub fn add(&mut self, env: Env, instruction: &Instruction) -> Result<()> {
        self.inner
            .add(instruction.spec.clone())
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn define_replace_map(
        &mut self,
        env: Env,
        name: NativeArgument,
        rules: Vec<NativeReplaceRule>,
    ) -> Result<()> {
        let rules = rules
            .into_iter()
            .map(|rule| Ok((argument(rule.pattern)?, argument(rule.replacement)?)))
            .collect::<Result<Vec<_>>>()?;
        self.inner
            .define_replace_map(argument(name)?, rules)
            .map_err(|e| error(env, e))
    }
    #[napi]
    pub fn block(&mut self, name: String, body: &mut Plan) {
        self.inner.block(name, std::mem::take(&mut body.inner));
    }
    #[napi]
    pub fn contains_each(&mut self, pattern: String, body: &mut Plan) {
        self.inner
            .contains_each(pattern, std::mem::take(&mut body.inner));
    }
    #[napi]
    pub fn compile(&self, env: Env) -> Result<CompiledPipeline> {
        self.inner
            .compile()
            .map(|inner| CompiledPipeline { inner })
            .map_err(|e| error(env, e))
    }
}
/// Independent immutable executable. Example: `plan.compile().process('é')`.
///
/// ```
/// use textforge::api::portable::{InstructionSpec, PipelinePlan};
/// let mut plan = PipelinePlan::new();
/// plan.add(InstructionSpec::new("tbs".into(), vec![]))?;
/// assert_eq!(plan.compile()?.process(" é ")?, "é");
/// # Ok::<(), textforge::api::portable::BindingError>(())
/// ```
#[napi]
pub struct CompiledPipeline {
    inner: p::CompiledPipeline,
}
#[napi]
impl CompiledPipeline {
    #[napi]
    pub fn process(&self, env: Env, input: String) -> Result<String> {
        self.inner.process(&input).map_err(|e| error(env, e))
    }
}
