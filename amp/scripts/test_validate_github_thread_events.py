import copy
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("validate-github-thread-events.py")
SPEC = importlib.util.spec_from_file_location("validate_github_thread_events", SCRIPT)
validator = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(validator)
SOURCE = Path(__file__).resolve().parents[1] / "github-thread-events"


class GitHubThreadEventValidationTests(unittest.TestCase):
    def setUp(self):
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary_directory.name) / "github-thread-events"
        import shutil
        shutil.copytree(SOURCE, self.root)

    def tearDown(self):
        self.temporary_directory.cleanup()

    def write_json(self, relative_path, data):
        path = self.root / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2) + "\n")
        return path

    def read_json(self, relative_path):
        return json.loads((self.root / relative_path).read_text())

    def test_checked_in_configuration_is_valid(self):
        self.assertEqual([], validator.validate_tree(SOURCE))

    def test_checked_in_configuration_has_reviewed_targets_and_trusted_actors(self):
        config = self.read_json("config.json")
        self.assertEqual(
            {
                "lelouvincx/agent-skills": ["main"],
                "lelouvincx/second-brain-logseq": ["master"],
                "lelouvincx/dotfiles": ["main"],
            },
            {item["repository"]: item["baseBranches"] for item in config["repositories"]},
        )

        expected_actors = {"lelouvincx", "lelouvincx-bot", "chinh-dm-holistics"}
        policy_files = [
            "policies/global.json",
            "policies/projects/lelouvincx/agent-skills.json",
        ]
        for policy_file in policy_files:
            with self.subTest(policy_file=policy_file):
                for policy in self.read_json(policy_file)["policies"]:
                    self.assertEqual(expected_actors, set(policy["actorTrust"]["trustedActors"]))

        schema = self.read_json("config.schema.json")
        channel = schema["properties"]["staleNotification"]["properties"]["slackChannelID"]
        self.assertEqual("C0BKVJXBH98", channel["const"])
        self.assertIn("#chinh-amp-experiment", channel["description"])

    def test_project_policy_completely_replaces_global_policy(self):
        scope, policy = validator.resolve_policy(
            self.root, "lelouvincx/agent-skills", "github.pull-request.merged"
        )
        global_policy = self.read_json("policies/global.json")["policies"][1]
        self.assertEqual("project", scope)
        self.assertNotEqual(global_policy, policy)
        action = policy["fixedAction"]
        required_steps = [
            "Confirm the pull request is still merged and current.",
            "Sync Git and the local checkout to the merged default branch.",
            "Run ./sync-skills.sh.",
            "Reload the projected plugins and the system prompt.",
            "Archive the owning thread only after every required cleanup step succeeds.",
        ]
        positions = [action.index(step) for step in required_steps]
        self.assertEqual(sorted(positions), positions)
        self.assertIn("report it and do not archive", action)
        self.assertFalse(any(text in action.lower() for text in ("webhook body", "comment text", "log text")))

    def test_global_policy_is_fallback_for_missing_project_id(self):
        scope, policy = validator.resolve_policy(
            self.root, "lelouvincx/agent-skills", "github.workflow-run.failure"
        )
        self.assertEqual("global", scope)
        self.assertEqual("github.workflow-run.failure", policy["id"])

    def test_missing_policy_is_explicit(self):
        self.assertEqual(
            ("missing-event-policy", None),
            validator.resolve_policy(self.root, "lelouvincx/agent-skills", "github.issue.opened"),
        )

    def test_invalid_project_file_fails_closed_before_global_fallback(self):
        project = self.read_json("policies/projects/lelouvincx/agent-skills.json")
        project["unexpected"] = True
        self.write_json("policies/projects/lelouvincx/agent-skills.json", project)
        with self.assertRaises(validator.PolicyConfigurationError):
            validator.resolve_policy(
                self.root, "lelouvincx/agent-skills", "github.workflow-run.failure"
            )

    def test_invalid_global_file_fails_closed_when_fallback_is_needed(self):
        global_set = self.read_json("policies/global.json")
        global_set["policies"][0]["sourceCandidate"] = "github.other"
        self.write_json("policies/global.json", global_set)
        with self.assertRaises(validator.PolicyConfigurationError):
            validator.resolve_policy(
                self.root, "another/repository", "github.workflow-run.failure"
            )

    def test_schema_and_semantics_reject_unknown_duplicate_and_secret_fields(self):
        config = self.read_json("config.json")
        config["repositories"].append(copy.deepcopy(config["repositories"][0]))
        config["token"] = "not-allowed"
        self.write_json("config.json", config)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("duplicate repositories" in error for error in errors))
        self.assertTrue(any("Additional properties" in error for error in errors))
        self.assertTrue(any("forbidden secret" in error for error in errors))

    def test_invalid_top_level_instances_return_errors_instead_of_crashing(self):
        self.write_json("config.json", [])
        self.write_json("policies/global.json", [])
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("config.json" in error and "not of type 'object'" in error for error in errors))
        self.assertTrue(any("global.json" in error and "not of type 'object'" in error for error in errors))

    def test_invalid_schema_returns_an_error_instead_of_crashing(self):
        schema = self.read_json("config.schema.json")
        schema["type"] = "invalid-type"
        self.write_json("config.schema.json", schema)
        errors = validator.validate_tree(self.root)
        self.assertEqual(1, len(errors))
        self.assertIn("invalid Draft 2020-12 schema", errors[0])

    def test_policy_requires_minimum_source_pointers_for_its_preflight(self):
        global_set = self.read_json("policies/global.json")
        global_set["policies"][0]["sourcePointers"].remove("head-sha")
        global_set["policies"][2]["sourcePointers"].remove("actor")
        self.write_json("policies/global.json", global_set)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("missing required source pointers: head-sha" in error for error in errors))
        self.assertTrue(any("missing required source pointers: actor" in error for error in errors))

    def test_project_policy_path_and_repository_must_match_invariants(self):
        project = self.read_json("policies/projects/lelouvincx/agent-skills.json")
        self.write_json("policies/projects/Other/Repo.json", project)
        errors = validator.validate_tree(self.root)
        self.assertTrue(any("lowercase owner/repository.json" in error for error in errors))
        self.assertTrue(any("repository is not configured" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
