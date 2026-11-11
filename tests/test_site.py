import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location("atlas_site", Path(__file__).resolve().parent.parent / "site.py")
atlas_site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(atlas_site)


class Runs(unittest.TestCase):
    def test_collapses_consecutive_residues(self):
        self.assertEqual(atlas_site.runs([5, 1, 2, 3, 7, 8, 10]), "1–3, 5, 7–8, 10")

    def test_repeated_residues(self):
        self.assertEqual(atlas_site.runs([1, 1, 2]), "1–2")

    def test_empty(self):
        self.assertEqual(atlas_site.runs([]), "")


if __name__ == "__main__":
    unittest.main()
