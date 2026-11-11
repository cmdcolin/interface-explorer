import unittest

from pages import runs


class Runs(unittest.TestCase):
    def test_collapses_consecutive_residues(self):
        self.assertEqual(runs([5, 1, 2, 3, 7, 8, 10]), "1–3, 5, 7–8, 10")

    def test_repeated_residues(self):
        self.assertEqual(runs([1, 1, 2]), "1–2")

    def test_empty(self):
        self.assertEqual(runs([]), "")


if __name__ == "__main__":
    unittest.main()
