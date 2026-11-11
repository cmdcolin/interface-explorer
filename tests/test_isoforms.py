import unittest

from isoforms import segments


class Segments(unittest.TestCase):
    def test_unchanged_isoform_is_one_segment(self):
        self.assertEqual(segments([1, 2, 3, 4]), [[1, 1, 4]])

    def test_deletion_splits_into_isoform_and_canonical_starts(self):
        self.assertEqual(segments([1, 2, 6, 7, 8]), [[1, 1, 2], [3, 6, 3]])

    def test_replaced_residues_are_left_out(self):
        self.assertEqual(segments([1, 2, 3, None, None, None, 6, 7, 8]), [[1, 1, 3], [7, 6, 3]])

    def test_entirely_new_sequence(self):
        self.assertEqual(segments([None, None]), [])


if __name__ == "__main__":
    unittest.main()
