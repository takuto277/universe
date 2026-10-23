#!/usr/bin/env python3
"""test_skills.py : check_skills.py の契約検査を検証する"""

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import check_skills  # noqa: E402


class SkillsTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.skills = self.root / ".opencode" / "skills"

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, name, front="name: one\ndescription: test", body="# x", registry=None,
              extra_skill=None):
        directory = self.skills / name
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "SKILL.md").write_text("---\n%s\n---\n\n%s\n" % (front, body),
                                            encoding="utf-8")
        if extra_skill:
            other = self.skills / extra_skill
            other.mkdir(parents=True, exist_ok=True)
            (other / "SKILL.md").write_text("---\nname: %s\ndescription: x\n---\n" % extra_skill,
                                            encoding="utf-8")
        entries = registry if registry is not None else [
            {"name": "one", "version": 1, "path": "one"}]
        (self.skills / "registry.json").write_text(
            json.dumps({"skills": entries}), encoding="utf-8")

    def test_valid(self):
        self.write("one")
        self.assertEqual([], check_skills.validate(self.root))

    def test_missing_description(self):
        self.write("one", front="name: one")
        errors = check_skills.validate(self.root)
        self.assertTrue(any("description" in error for error in errors))

    def test_unregistered_skill(self):
        self.write("one", extra_skill="two")
        errors = check_skills.validate(self.root)
        self.assertTrue(any("未登録のスキル" in error for error in errors))

    def test_name_mismatch(self):
        self.write("one", front="name: two\ndescription: x")
        errors = check_skills.validate(self.root)
        self.assertTrue(any("違います" in error for error in errors))

    def test_home_absolute_path(self):
        self.write("one", body="see /Users/someone/secret")
        errors = check_skills.validate(self.root)
        self.assertTrue(any("ホームディレクトリ" in error for error in errors))

    def test_missing_link(self):
        self.write("one", body="[x](missing.md)")
        errors = check_skills.validate(self.root)
        self.assertTrue(any("リンク先がありません" in error for error in errors))

    def test_link_fragment_and_query_are_ignored(self):
        directory = self.skills / "one"
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "doc.md").write_text("doc", encoding="utf-8")
        self.write("one", body="[x](doc.md#section) [y](doc.md?raw=1)")
        self.assertEqual([], check_skills.validate(self.root))

    def test_bad_version(self):
        self.write("one", registry=[{"name": "one", "version": 0, "path": "one"}])
        errors = check_skills.validate(self.root)
        self.assertTrue(any("version" in error for error in errors))


if __name__ == "__main__":
    unittest.main(verbosity=2)
