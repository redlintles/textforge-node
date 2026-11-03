//! Persistence regressions exercised through the production portable API.
use std::{fs, path::PathBuf};
use textforge::api::portable::{Argument, FilePath, InstructionSpec, PortableProcessor};

/// Isolated filesystem fixture, removed even if a test fails.
struct Directory(PathBuf);
impl Directory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "textforge-node-write-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }
    fn path(&self, name: &str) -> FilePath {
        FilePath::from_text(self.0.join(name).to_str().unwrap().to_owned())
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn registered() -> (PortableProcessor, String) {
    let mut processor = PortableProcessor::new();
    let id = processor
        .add_transform(vec![InstructionSpec::new(
            "ate".into(),
            vec![Argument::Text("🍌".into())],
        )])
        .unwrap();
    (processor, id)
}

#[test]
fn text_and_bytecode_exports_create_new_files_and_parent_directories() {
    let directory = Directory::new();
    let (mut processor, id) = registered();
    for extension in ["textforge", "tft", "textforgebc", "tfb"] {
        let filename = format!("nested/{extension}/pipeline.{extension}");
        let path = directory.path(&filename);
        assert!(!directory.0.join(&filename).exists());
        let restored = if matches!(extension, "textforge" | "tft") {
            processor.write_pipeline_to_file(&id, &path).unwrap();
            processor.get_pipeline_from_file(&path).unwrap()
        } else {
            processor.write_to_bytecode_file(&id, &path).unwrap();
            processor.read_from_bytecode_file(&path).unwrap()
        };
        assert_eq!(processor.process_all(&restored, "é").unwrap(), "é🍌");
    }
}

#[test]
fn invalid_outputs_do_not_create_files_or_destroy_existing_content() {
    let directory = Directory::new();
    let (mut processor, id) = registered();
    let path = directory.path("missing/pipeline.txt");
    assert!(processor.write_pipeline_to_file(&id, &path).is_err());
    assert!(!directory.0.join("missing").exists());
    let file = directory.0.join("pipeline.textforge");
    fs::write(&file, "keep me").unwrap();
    assert!(
        processor
            .write_pipeline_to_file("missing", &directory.path("pipeline.textforge"))
            .is_err()
    );
    assert_eq!(fs::read_to_string(&file).unwrap(), "keep me");
    let blocker = directory.0.join("file");
    fs::write(&blocker, "not a directory").unwrap();
    let error = processor
        .write_pipeline_to_file(&id, &directory.path("file/pipeline.textforge"))
        .unwrap_err();
    assert_eq!(format!("{:?}", error.stage), "Persistence");
    assert_ne!(error.instruction, "canonicalize");
    assert_eq!(fs::read_to_string(blocker).unwrap(), "not a directory");
}

#[test]
fn a_serialization_failure_preserves_destination_and_creates_no_placeholder() {
    let directory = Directory::new();
    let mut processor = PortableProcessor::new();
    let id = processor
        .add_transform(vec![InstructionSpec::new(
            "atb".into(),
            vec![Argument::Text("a\nb".into())],
        )])
        .unwrap();
    let existing = directory.0.join("pipeline.textforge");
    fs::write(&existing, "original").unwrap();
    assert!(
        processor
            .write_pipeline_to_file(&id, &directory.path("pipeline.textforge"))
            .is_err()
    );
    assert_eq!(fs::read_to_string(existing).unwrap(), "original");
    assert!(
        processor
            .write_pipeline_to_file(&id, &directory.path("new/pipeline.textforge"))
            .is_err()
    );
    assert!(!directory.0.join("new").exists());
}

#[test]
fn bytecode_uses_the_registered_opcode_for_each_replace_mode_and_null() {
    let directory = Directory::new();
    let mut processor = PortableProcessor::new();
    for (name, opcode, expected) in [
        ("raw", 0x0c_u32, "bxnxnx"),
        ("rfw", 0x0b, "bxnana"),
        ("null", 0x38, "banana"),
    ] {
        let parameters = if name == "null" {
            vec![]
        } else {
            vec![Argument::Text("a".into()), Argument::Text("x".into())]
        };
        let id = processor
            .add_transform(vec![InstructionSpec::new(name.into(), parameters)])
            .unwrap();
        let file = directory.0.join(format!("{name}.tfb"));
        processor
            .write_to_bytecode_file(&id, &directory.path(&format!("{name}.tfb")))
            .unwrap();
        // Header = 20 bytes; instruction length = 8 bytes; opcode = 4 bytes, BE.
        let encoded = fs::read(file).unwrap();
        assert_eq!(&encoded[28..32], &opcode.to_be_bytes());
        let restored = processor
            .read_from_bytecode_file(&directory.path(&format!("{name}.tfb")))
            .unwrap();
        assert_eq!(
            processor.get_transform_vec(&restored).unwrap()[0].name,
            name
        );
        assert_eq!(
            processor.process_all(&restored, "banana").unwrap(),
            expected
        );
    }
}
