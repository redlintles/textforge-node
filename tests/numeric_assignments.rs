//! Contract the TypeScript adapter relies on for `val`, `var` and `mutv`.
//!
//! The public Rust builder stores a literal number given to these methods as its
//! decimal text. The portable layer of TextForge 0.4.0 accepts only text (or a
//! variable) in that slot, so `ts/index.ts` (`valueArg`) sends the decimal text,
//! exactly as the builder does. The engine itself is not patched.
use textforge::api::portable::{
    Argument, ErrorStage, InstructionSpec, PipelinePlan, PortableProcessor,
};

#[test]
fn decimal_text_assignments_match_the_native_builder() {
    for initial in ["val", "var"] {
        let mut plan = PipelinePlan::new();
        plan.add(InstructionSpec::new(
            initial.into(),
            vec![Argument::Text("n".into()), Argument::Text("2".into())],
        ))
        .unwrap();
        plan.add(InstructionSpec::new(
            "rpt".into(),
            vec![Argument::Variable("n".into())],
        ))
        .unwrap();
        assert_eq!(plan.compile().unwrap().process("é").unwrap(), "éé");
    }
    let mut processor = PortableProcessor::new();
    let id = processor
        .add_transform(vec![
            InstructionSpec::new(
                "var".into(),
                vec![Argument::Text("n".into()), Argument::Text("1".into())],
            ),
            InstructionSpec::new(
                "mutv".into(),
                vec![Argument::Text("n".into()), Argument::Text("2".into())],
            ),
            InstructionSpec::new("rpt".into(), vec![Argument::Variable("n".into())]),
        ])
        .unwrap();
    assert_eq!(processor.process_all(&id, "é").unwrap(), "éé");
    assert_eq!(
        processor.get_transform_vec(&id).unwrap()[1].arguments[1],
        Argument::Text("2".into())
    );
}

#[test]
fn portable_numbers_are_rejected_in_text_slots() {
    for name in ["val", "var", "mutv", "atb"] {
        let mut plan = PipelinePlan::new();
        let arguments = if name == "atb" {
            vec![Argument::Number(2)]
        } else {
            vec![Argument::Text("n".into()), Argument::Number(2)]
        };
        let result = plan
            .add(InstructionSpec::new(name.into(), arguments))
            .and_then(|_| plan.compile().map(|_| ()));
        let error = result.unwrap_err();
        assert_eq!(error.stage, ErrorStage::Validation, "{name}");
        assert_eq!(error.code, 23, "{name}");
    }
}
