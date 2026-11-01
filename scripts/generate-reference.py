"""Capture outputs from the real public Rust builder for Node.js parity tests.

Sample calls come from the pinned Rust builder's own doctests. Additional logical
cases cover variable normalization, iteration, blocks and conditional callbacks.
No portable mnemonic mapping is used to compute expected outputs.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "tests/fixtures/builder_reference.json"
EXAMPLE = ROOT / "examples/builder_reference.rs"


def cases() -> list[dict[str, Any]]:
    """Read simple public-builder doctests and supply explicit logical cases."""
    api = (ROOT / "vendor/textforge/src/api/mod.rs").read_text(encoding="utf-8")
    trait = api.split("pub trait TextForgeConditionalMethods")[0]
    pattern = r"(?ms)^    fn (\w+)\(([^;]*?)\) -> Result<&mut Self, TextForgeError> \{\n(.*?)^    }"
    result = []
    for match in re.finditer(pattern, trait):
        name = match[1]
        explicit = {
            "normalize_unicode": ("Ａﬁ²", ["nfkc"]),
            "define_replace_map": ("cat", ["animals", "cat", "dog"]),
            "execute_replace_map": ("cat", ["animals"]),
        }
        if name in explicit:
            input_text, arguments = explicit[name]
            steps = [[name, arguments]]
            if name == "execute_replace_map":
                steps.insert(0, ["define_replace_map", ["animals", "cat", "dog"]])
            result.append({"name": name, "input": input_text, "steps": steps})
            continue
        if name in {"val", "var", "mut_var", "eval", "iter", "end", "remove_pattern"}:
            continue
        docs_match = re.search(r"((?:    ///[^\n]*\n|[ \t]*\n)*)$", trait[: match.start()])
        docs = re.sub(r"(?m)^    /// ?", "", docs_match[0]) if docs_match else ""
        call = re.search(r"\." + name + r"\(([^)]*)\)\s*\.unwrap", docs)
        input = re.search(r'let input = ("(?:[^"\\]|\\.)*");', docs)
        if call is None or input is None:
            raise ValueError(f"No supported Rust example for {name}")
        result.append(
            {
                "name": name,
                "input": json.loads(input[1]),
                "steps": [[name, json.loads("[" + call[1] + "]")]],
            }
        )
    for name in ("val", "var"):
        result.append(
            {
                "name": name,
                "input": "é",
                "steps": [[name, ["n", 2]], ["repeat", [{"variable": "n"}]]],
            }
        )
    result.extend(
        [
            {
                "name": "mut_var",
                "input": "é",
                "steps": [
                    ["var", ["n", 1]],
                    ["mut_var", ["n", 2]],
                    ["repeat", [{"variable": "n"}]],
                ],
            },
            {
                "name": "eval",
                "input": "é",
                "steps": [["eval", ["2 + 3", "n"]], ["repeat", [{"variable": "n"}]]],
            },
            {
                "name": "iter",
                "input": "é",
                "steps": [["iter", [2, {"instruction": ["add_to_beginning", ["🍌"]]}]]],
            },
            {"name": "remove_pattern", "input": "bánáná🍌", "steps": [["remove_pattern", ["á"]]]},
            {"name": "end", "input": "é", "steps": [["end", []]]},
            {
                "name": "block_assoc",
                "input": "é",
                "steps": [
                    ["block_assoc", ["suffix", {"body": [["add_to_end", ["!"]]]}]],
                    ["call_block", ["suffix"]],
                ],
            },
            {
                "name": "call_block",
                "input": "é",
                "steps": [
                    ["block_assoc", ["suffix", {"body": [["add_to_end", ["!"]]]}]],
                    ["call_block", ["suffix"]],
                    ["call_block", ["suffix"]],
                ],
            },
            {
                "name": "if_do_contains_each",
                "input": "x",
                "steps": [
                    [
                        "if_do_contains_each",
                        ["x", {"body": [["remove_pattern", ["x"]], ["add_to_end", ["skipped"]]]}],
                    ]
                ],
            },
        ]
    )
    return result


def rust_argument(value: object) -> str:
    """Render a literal or an explicit public Rust reference/group argument."""
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, int):
        return f"{value}_usize"
    if not isinstance(value, dict):
        raise TypeError(f"Unsupported fixture argument: {value!r}")
    if "variable" in value:
        return f"get_var({rust_argument(value['variable'])})"
    if "body" in value:
        return "|body| { " + rust_chain(value["body"], "body") + "; Ok(()) }"
    if "instruction" in value:
        if value["instruction"] != ["add_to_beginning", ["🍌"]]:
            raise ValueError("Unsupported nested Rust fixture; extend its explicit template")
        return """ValType::Literal(TextForgeParamTypes::Token(TokenWrapper::new(
            Box::new(textforge::tokens::transforms::atb::Atb::default()),
            Some(vec!["🍌".into()]),
        )))"""
    raise ValueError(f"Unsupported fixture value: {value!r}")


def rust_chain(steps: list[list[Any]], root: str) -> str:
    """Render calls to named Rust builder methods, in their declared argument order."""
    return root + "".join(
        f".{name}({', '.join(rust_argument(arg) for arg in args)})?" for name, args in steps
    )


def program(data: list[dict[str, Any]]) -> str:
    """Produce a standalone executable oracle using only existing Rust dependencies."""
    result = """//! Reference outputs from the public Rust builder for Node.js integration tests.
//! Generated by scripts/generate-reference.py; not a second engine.
use textforge::{
    api::{get_var, processor::{TextForgeProcessor, TextForgeProcessorMethods},
        TextForgeBuilderMethods, TextForgeBlockMethods, TextForgeConditionalMethods},
    parser::{params::TextForgeParamTypes, resolve_var::{TokenWrapper, ValType}},
    utils::errors::TextForgeError,
};

fn record(name: &str, result: Result<String, TextForgeError>) {
    match result {
        Ok(text) => {
            let encoded: String = text.as_bytes().iter()
                .map(|byte| format!("{byte:02x}")).collect();
            println!("{name}\\tok\\t{encoded}");
        }
        Err(error) => println!("{name}\\terror\\t{}", error.error_code.get_error_code()),
    }
}

fn main() {
"""
    for case in data:
        expression = rust_chain(case["steps"], "processor.create_pipeline()")
        result += f'''    record("{case["name"]}", (|| {{
        let mut processor = TextForgeProcessor::new();
        let id = {expression}.build()?;
        processor.process_all(&id, {rust_argument(case["input"])})
    }})());
'''
    return result + "}\n"


def main() -> None:
    """Regenerate fixtures, or verify the saved outputs against real Rust execution."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    data = cases()
    formatted = subprocess.check_output(
        ["rustfmt", "--edition", "2024", "--emit", "stdout"], input=program(data), text=True
    )
    if args.check:
        if EXAMPLE.read_text(encoding="utf-8") != formatted:
            raise SystemExit("Rust reference is stale: run scripts/generate-reference.py")
    else:
        EXAMPLE.write_text(formatted, encoding="utf-8")
    output = subprocess.check_output(
        [
            "cargo",
            "run",
            "--quiet",
            "--locked",
            "--manifest-path",
            str(ROOT / "scripts/upstream/Cargo.toml"),
            "--example",
            "builder_reference",
        ],
        cwd=ROOT,
        text=True,
    )
    rows = {parts[0]: parts[1:] for line in output.splitlines() if (parts := line.split("\t"))}
    for case in data:
        status, payload = rows[case["name"]]
        case["result"] = (
            {"ok": bytes.fromhex(payload).decode("utf-8")}
            if status == "ok"
            else {"error": int(payload)}
        )
    fixture = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if FIXTURE.read_text(encoding="utf-8") != fixture:
            raise SystemExit("Rust fixture outputs changed; review and regenerate the reference")
    else:
        FIXTURE.write_text(fixture, encoding="utf-8")
    print(f"Verified {len(data)} public Rust builder reference cases")


if __name__ == "__main__":
    main()
