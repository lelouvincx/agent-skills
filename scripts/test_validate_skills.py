import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-skills.py")
SPEC = importlib.util.spec_from_file_location("validate_skills", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)


class SkillValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def write(self, relative_path, content):
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_accepts_local_skill_and_remote_overlay(self):
        self.write(
            "remote-skills.yaml",
            "skills:\n"
            "  - name: remote-skill\n"
            "    files: [references/guide.md]\n"
            "  - name: generated-later\n",
        )
        self.write(
            "skills/local-skill/SKILL.md",
            "---\nname: local-skill\ndescription: Use this local skill for tests.\n---\n"
            "See [the guide](references/guide.md).\n"
            "```markdown\n[example](missing.md)\n```\n",
        )
        self.write("skills/local-skill/references/guide.md", "# Guide\n")
        self.write("skills/remote-skill/PERSONAL.md", "# Overlay\n")
        self.write("skills/remote-skill/SKILL.md", "generated remote payload\n")

        errors, local_count, remote_count = validator.validate_repository(
            self.root,
            [
                Path("skills/local-skill/SKILL.md"),
                Path("skills/remote-skill/PERSONAL.md"),
                Path("skills/remote-skill/SKILL.md"),
            ],
        )

        self.assertEqual([], errors)
        self.assertEqual((1, 2), (local_count, remote_count))

    def test_rejects_unclosed_and_invalid_frontmatter(self):
        errors = []
        validator.validate_local_skill(
            self.write("skills/unclosed/SKILL.md", "---\nname: unclosed\n"), errors
        )
        validator.validate_local_skill(
            self.write("skills/invalid/SKILL.md", "---\nname: [invalid\n---\n"), errors
        )

        self.assertTrue(any("not closed" in error for error in errors))
        self.assertTrue(any("cannot parse frontmatter" in error for error in errors))

    def test_rejects_metadata_constraints_and_missing_reference(self):
        errors = []
        validator.validate_local_skill(
            self.write(
                "skills/right-directory/SKILL.md",
                "---\nname: wrong-directory\ndescription: '   '\n---\n"
                "[missing](references/nope.md)\n",
            ),
            errors,
        )
        validator.validate_local_skill(
            self.write(
                "skills/invalid-name/SKILL.md",
                "---\nname: Wrong--Name\ndescription: Invalid name.\n---\n",
            ),
            errors,
        )

        self.assertTrue(any("name must follow" in error for error in errors))
        self.assertTrue(any("must match directory" in error for error in errors))
        self.assertTrue(any("description must be" in error for error in errors))
        self.assertTrue(any("reference does not exist" in error for error in errors))

    def test_rejects_unsafe_duplicate_and_unmatched_remote_metadata(self):
        self.write(
            "remote-skills.yaml",
            "skills:\n"
            "  - name: remote-skill\n"
            "    files: [../shared.md]\n"
            "  - name: remote-skill\n",
        )
        self.write("skills/orphan/PERSONAL.md", "# Overlay\n")

        errors, _, _ = validator.validate_repository(
            self.root, [Path("skills/orphan/PERSONAL.md")]
        )

        self.assertTrue(any("must stay within" in error for error in errors))
        self.assertTrue(any("duplicate name" in error for error in errors))
        self.assertTrue(any("no matching registry entry" in error for error in errors))

    def test_allows_only_develop_amql_shared_reference_escape(self):
        self.write(
            "remote-skills.yaml",
            "skills:\n"
            "  - name: develop-amql\n"
            "    files:\n"
            "      - ../../references/aml.md\n"
            "      - ../../CHANGELOG.md\n"
            "  - name: other-skill\n"
            "    files: [../../references/aml.md]\n",
        )

        errors, _, _ = validator.validate_repository(self.root, [])

        self.assertTrue(
            validator.safe_companion_path("develop-amql", "../../references/aml.md")
        )
        self.assertEqual(2, len(errors))
        self.assertTrue(any("../../CHANGELOG.md" in error for error in errors))
        self.assertTrue(
            any("other-skill" in error and "../../references/aml.md" in error for error in errors)
        )


if __name__ == "__main__":
    unittest.main()
