//! Regression for the approved portable validation fix in the bundled core.
use textforge::api::portable::{Argument, InstructionSpec, PipelinePlan, PortableProcessor};

#[test]
fn portable_numeric_assignments_match_native_behavior() {
    for initial in ["val", "var"] {
        let mut plan = PipelinePlan::new();
        plan.add(InstructionSpec::new(
            initial.into(),
            vec![Argument::Text("n".into()), Argument::Number(2)],
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
                vec![Argument::Text("n".into()), Argument::Number(1)],
            ),
            InstructionSpec::new(
                "mutv".into(),
                vec![Argument::Text("n".into()), Argument::Number(2)],
            ),
            InstructionSpec::new("rpt".into(), vec![Argument::Variable("n".into())]),
        ])
        .unwrap();
    assert_eq!(processor.process_all(&id, "é").unwrap(), "éé");
    assert_eq!(
        processor.get_transform_vec(&id).unwrap()[1].arguments[1],
        Argument::Text("2".into())
    );
    // Numeric values are still rejected in unrelated String parameter slots.
    let mut invalid = PipelinePlan::new();
    invalid
        .add(InstructionSpec::new(
            "atb".into(),
            vec![Argument::Number(2)],
        ))
        .unwrap();
    assert!(invalid.compile().is_err());
}
