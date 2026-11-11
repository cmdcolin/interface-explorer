import unittest

from isoforms import band_runs, segments


class Segments(unittest.TestCase):
    def test_unchanged_isoform_is_one_segment(self):
        self.assertEqual(segments([1, 2, 3, 4]), [[1, 1, 4]])

    def test_deletion_splits_into_isoform_and_canonical_starts(self):
        self.assertEqual(segments([1, 2, 6, 7, 8]), [[1, 1, 2], [3, 6, 3]])

    def test_replaced_residues_are_left_out(self):
        self.assertEqual(segments([1, 2, 3, None, None, None, 6, 7, 8]), [[1, 1, 3], [7, 6, 3]])

    def test_entirely_new_sequence(self):
        self.assertEqual(segments([None, None]), [])


class BandRuns(unittest.TestCase):
    def test_consecutive_residues_in_one_confidence_band_share_a_run(self):
        self.assertEqual(band_runs([95, 90, 89, 70, 69, 50, 49, 0, 91]), [[90, 2], [70, 2], [50, 2], [0, 2], [90, 1]])

    def test_run_lengths_cover_every_residue(self):
        scores = [12, 55, 55, 71, 99, 99, 99]
        self.assertEqual(sum(length for _, length in band_runs(scores)), len(scores))

    def test_empty(self):
        self.assertEqual(band_runs([]), [])


if __name__ == "__main__":
    unittest.main()
