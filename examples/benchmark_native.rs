//! Native baseline for `scripts/benchmark.mjs`: the same scenarios through the
//! public Rust API of the bundled core, without the Node.js adapter.
//!
//! Run through the benchmark script (`npm run benchmark`), which builds this
//! example in release mode and compares its numbers with the binding's. Each
//! output line is `BENCH\t<scenario>\t<operations>\t<median nanoseconds>`.
use std::{
    hint::black_box,
    path::{Path, PathBuf},
    time::Instant,
};
use textforge::{
    api::{
        TextBuffer, TextBufferOptions, TextForgeBuilderMethods,
        processor::{TextForgeProcessor, TextForgeProcessorMethods},
    },
    tokens::{
        InstructionMethods,
        transforms::{dls::Dls, tua::Tua},
    },
    utils::errors::TextForgeError,
};

type Result<T> = std::result::Result<T, Box<dyn std::error::Error>>;

/// Median of `repeats` timings of `run`, which performs `operations` operations.
fn measure(
    name: &str,
    operations: u64,
    repeats: usize,
    mut run: impl FnMut() -> Result<()>,
) -> Result<()> {
    run()?; // Warm-up, as in the Node.js script.
    let mut timings = Vec::with_capacity(repeats);
    for _ in 0..repeats {
        let start = Instant::now();
        run()?;
        timings.push(start.elapsed().as_nanos());
    }
    timings.sort_unstable();
    println!(
        "BENCH\t{name}\t{operations}\t{}",
        timings[timings.len() / 2]
    );
    Ok(())
}

/// Deterministic multi-line text of about `bytes` bytes (same generator as the script).
fn text(bytes: usize) -> String {
    let mut result = String::with_capacity(bytes + 64);
    let mut line = 0;
    while result.len() < bytes {
        result.push_str(&format!("  Line {line}: The Quick Brown Fox é🍌  \n"));
        if line % 10 == 9 {
            result.push('\n');
        }
        line += 1;
    }
    result
}

fn cleanup(processor: &mut TextForgeProcessor) -> std::result::Result<String, TextForgeError> {
    processor
        .create_pipeline()
        .trim_both_sides()?
        .to_lowercase_all()?
        .replace_all_with("[aeiou]", "*")?
        .delete_empty_lines()?
        .add_to_end("!")?
        .build()
}

fn main() -> Result<()> {
    let mut arguments = std::env::args().skip(1);
    let directory = PathBuf::from(arguments.next().ok_or("expected a temporary directory")?);
    let quick = arguments.next().as_deref() == Some("--quick");
    let scale = if quick { 1 } else { 4 };
    let repeats = if quick { 3 } else { 7 };
    let small = "  Hello World é🍌  ";

    let mut processor = TextForgeProcessor::new();
    let id = cleanup(&mut processor)?;
    let calls = 5_000 * scale;
    measure("call_small", calls, repeats, || {
        for _ in 0..calls {
            black_box(processor.process_all(&id, small)?);
        }
        Ok(())
    })?;
    let builds = 1_000 * scale;
    measure("build_plan", builds, repeats, || {
        for _ in 0..builds {
            let id = cleanup(&mut processor)?;
            processor.remove_transform(&id)?;
        }
        Ok(())
    })?;
    for (name, bytes) in [("throughput_1mib", 1 << 20), ("throughput_16mib", 16 << 20)] {
        let input = text(bytes);
        measure(name, input.len() as u64, repeats, || {
            black_box(processor.process_all(&id, &input)?);
            Ok(())
        })?;
    }

    let lines = text(4 << 20);
    let middle = lines.lines().count() / 2;
    let sections = processor
        .create_pipeline()
        .on_line(
            middle,
            Box::new(Tua::default()) as Box<dyn InstructionMethods>,
        )?
        .delete_line("[[__LINES__ - 1]]")?
        .build()?;
    measure("sections_4mib", lines.len() as u64, repeats, || {
        black_box(processor.process_all(&sections, &lines)?);
        Ok(())
    })?;

    let plain = processor.create_pipeline().delete_single(0)?.build()?;
    let ignored_ok = processor
        .create_pipeline()
        .try_ignore(Box::new(Dls::new(0)) as Box<dyn InstructionMethods>)?
        .build()?;
    let ignored_fail = processor
        .create_pipeline()
        .try_ignore(Box::new(Dls::new(999)) as Box<dyn InstructionMethods>)?
        .build()?;
    let failing = processor.create_pipeline().delete_single(999)?.build()?;
    let short = calls;
    for (name, pipeline) in [
        ("plain_instruction", &plain),
        ("try_ignore_ok", &ignored_ok),
        ("try_ignore_fail", &ignored_fail),
    ] {
        measure(name, short, repeats, || {
            for _ in 0..short {
                black_box(processor.process_all(pipeline, small)?);
            }
            Ok(())
        })?;
    }
    let errors = 2_000 * scale;
    measure("error_details", errors, repeats, || {
        for _ in 0..errors {
            let error = processor
                .process_all(&failing, small)
                .err()
                .ok_or("expected an error")?;
            black_box((
                error.error_code.name(),
                error.parameters().len(),
                error.report().color(false).to_string(),
            ));
        }
        Ok(())
    })?;

    let large = text(16 << 20);
    measure("buffered_16mib", large.len() as u64, repeats, || {
        let input = TextBuffer::from_text(&large, TextBufferOptions::new(1, &directory))?;
        black_box(processor.process_all_buffered(&id, input)?.into_string()?);
        Ok(())
    })?;

    let files = 16 * scale as usize;
    let chunk = text(256 << 10);
    let tasks: Vec<(PathBuf, PathBuf)> = (0..files)
        .map(|index| {
            let input = directory.join(format!("in-{index}.txt"));
            std::fs::write(&input, &chunk)
                .map(|()| (input, directory.join(format!("out-{index}.txt"))))
        })
        .collect::<std::io::Result<_>>()?;
    measure("batch_files", (files * chunk.len()) as u64, repeats, || {
        let requests: Vec<(&Path, &str, &Path)> = tasks
            .iter()
            .map(|(input, output)| (input.as_path(), id.as_str(), output.as_path()))
            .collect();
        for result in processor.process_batch(requests) {
            result?;
        }
        Ok(())
    })?;
    Ok(())
}
