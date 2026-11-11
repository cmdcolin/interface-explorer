import unittest

from sequences import apply_edits, replaced_positions, shared_ends


class SharedEnds(unittest.TestCase):
    def test_counts_matching_prefix_and_suffix(self):
        self.assertEqual(shared_ends("ABCDE", "ABXDE"), (2, 2))

    def test_identical_sequences_are_all_prefix(self):
        self.assertEqual(shared_ends("ABC", "ABC"), (3, 0))

    def test_suffix_does_not_overlap_prefix(self):
        self.assertEqual(shared_ends("AAA", "AA"), (2, 0))

    def test_nothing_shared(self):
        self.assertEqual(shared_ends("ABC", "XYZW"), (0, 0))


class ReplacedPositions(unittest.TestCase):
    def test_deletion_keeps_no_positions(self):
        self.assertEqual(replaced_positions("MABCDEF", 3, 5, ""), [])

    def test_same_length_replacement_keeps_unchanged_residues(self):
        self.assertEqual(replaced_positions("MABCDEF", 3, 5, "BXD"), [3, None, 5])

    def test_different_length_replacement_keeps_shared_ends(self):
        self.assertEqual(replaced_positions("MABCDEFG", 3, 6, "BXYZE"), [3, None, None, None, 6])


class ApplyEdits(unittest.TestCase):
    def test_no_edits_returns_the_canonical_sequence(self):
        self.assertEqual(apply_edits("MAB", []), ("MAB", [1, 2, 3]))

    def test_deletion(self):
        self.assertEqual(apply_edits("MABCDEFG", [(3, 5, "")]), ("MAEFG", [1, 2, 6, 7, 8]))

    def test_same_length_replacement(self):
        self.assertEqual(apply_edits("MABCDEFG", [(3, 5, "BXD")]), ("MABXDEFG", [1, 2, 3, None, 5, 6, 7, 8]))

    def test_different_length_replacement_with_shared_ends(self):
        self.assertEqual(apply_edits("MABCDEFG", [(3, 6, "BXYZE")]), ("MABXYZEFG", [1, 2, 3, None, None, None, 6, 7, 8]))

    def test_several_edits_keep_canonical_coordinates(self):
        self.assertEqual(apply_edits("MABCDEFG", [(2, 2, "Q"), (6, 8, "")]), ("MQBCD", [1, None, 3, 4, 5]))


if __name__ == "__main__":
    unittest.main()
