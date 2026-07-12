import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-plugin-docs.py")
SPEC = importlib.util.spec_from_file_location("validate_plugin_docs", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)


class ArtifactValidationTests(unittest.TestCase):
    def data(self, artifact_type, surface, invocation, api, discriminator=None):
        contract = {
            "input_kind": "none", "output_kind": "text", "trigger": invocation,
            "allowed_tools": [], "event": None, "command_id": None, "agent_mode_key": None,
        }
        if discriminator:
            contract[discriminator] = "value"
        return {
            "doc_schema": "amp-artifact/v2", "title": "Test: quoted", "slug": "test",
            "status": "active", "summary": "Test artifact.",
            "artifact": {"id": "test", "type": artifact_type, "surface": surface,
                         "invocation": invocation, "api_stability": "stable"},
            "source": {"kind": "plugin", "file": "plugins/test.ts", "scope": "system",
                       "install_source": "local", "registration_api": api, "metadata_comments": []},
            "amp": {"docs_sources": {"api_docs": "amp plugins show-docs", "agent_options": None},
                    "last_verified": "2026-07-12"},
            "contract": contract,
            "runtime": {key: [] for key in ("uses", "dependencies", "env", "reads", "writes", "network", "logs")},
            "safety": {"permission_level": "read-only", "user_gate": "manual", "constraints": [], "risks": []},
            "related": [], "tags": ["quoted: value"],
        }

    def validate(self, data):
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as file:
            file.write("\n".join(f"## {heading}" for heading in validator.REQUIRED_H2S))
            path = Path(file.name)
        errors = []
        validator.validate_schema_contract(path, data, errors)
        path.unlink()
        return errors

    def test_valid_plugin_invariants(self):
        cases = [
            ("agent_tool", "agent", "tool_call", "amp.registerTool", None),
            ("command", "command_palette", "command_palette", "amp.registerCommand", "command_id"),
            ("event_handler", "plugin_event_pipeline", "plugin_event", "amp.on", "event"),
            ("agent_mode", "mode_picker", "new_thread_mode", "amp.experimental.registerAgentMode", "agent_mode_key"),
        ]
        for case in cases:
            self.assertEqual([], self.validate(self.data(*case)), case[0])

    def test_rejects_mismatch_and_unrelated_discriminator(self):
        data = self.data("command", "agent", "tool_call", "amp.registerTool", "command_id")
        data["contract"]["trigger"] = "tool_call"
        data["contract"]["event"] = "agent.end"
        errors = self.validate(data)
        self.assertTrue(any("command must use" in error for error in errors))
        self.assertTrue(any("requires contract.trigger 'command_palette'" in error for error in errors))
        self.assertTrue(any("contract.event to be null" in error for error in errors))

    def test_rejects_unknown_fields(self):
        data = self.data("agent_tool", "agent", "tool_call", "amp.registerTool")
        data["contract"]["future_field"] = True
        self.assertTrue(any("unknown frontmatter field contract.future_field" in error for error in self.validate(data)))

    def test_safe_load_handles_yaml_quoting_lists_and_date(self):
        data = validator.parse_frontmatter('title: "A: B"\ntags: ["one: two", three]\nlast: 2026-07-12\n')
        self.assertEqual("A: B", data["title"])
        self.assertEqual(["one: two", "three"], data["tags"])
        self.assertEqual("2026-07-12", str(data["last"]))


if __name__ == "__main__":
    unittest.main()
