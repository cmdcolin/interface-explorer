import unittest

from gpcr import SWITCH, category_rows, chain_sequence, residue_map, segment_path, window_identity, with_sources


class ResidueMap(unittest.TestCase):
    def test_identical_sequences_map_position_to_position(self):
        pairs, identity = residue_map("MKTAYIAKQR", "MKTAYIAKQR")
        self.assertEqual(pairs, {k: k for k in range(1, 11)})
        self.assertEqual(identity, 1)

    def test_a_fragment_keeps_the_numbering_of_the_full_sequence(self):
        full = "MKTAYIAKQRQISFVKSHFSRQLEERLGLIEVQ"
        pairs, identity = residue_map(full[10:25], full)
        self.assertEqual(pairs, {k: k + 10 for k in range(1, 16)})
        self.assertAlmostEqual(identity, 15 / len(full))

    def test_a_substitution_is_still_paired(self):
        pairs, identity = residue_map("MKTAYIAKQR", "MKTAWIAKQR")
        self.assertEqual(pairs[5], 5)
        self.assertAlmostEqual(identity, 0.9)


class CategoryRows(unittest.TestCase):
    def test_zips_the_columns_of_one_category(self):
        cif = {"_entity.id": ["1", "2"], "_entity.pdbx_description": ["Histamine H1 receptor", "miniGsq"], "_atom_site.id": ["1"]}
        self.assertEqual(category_rows(cif, "entity"), [{"id": "1", "pdbx_description": "Histamine H1 receptor"}, {"id": "2", "pdbx_description": "miniGsq"}])

    def test_a_missing_category_has_no_rows(self):
        self.assertEqual(category_rows({"_entity.id": ["1"]}, "atom_site"), [])


class ChainSequence(unittest.TestCase):
    ATOMS = [{"seq": 12, "comp": "GLY"}, {"seq": 10, "comp": "MET"}, {"seq": 10, "comp": "MET"}, {"seq": 11, "comp": "MSE"}]

    def test_one_letter_per_residue_in_sequence_order(self):
        self.assertEqual(chain_sequence(self.ATOMS), ([10, 11, 12], "MXG"))

    def test_sources_are_set_per_residue_and_cleared_elsewhere(self):
        mapped = with_sources(self.ATOMS, {10: ("P1", 1)})
        self.assertEqual([a["source"] for a in mapped], [None, ("P1", 1), ("P1", 1), None])


class SegmentPath(unittest.TestCase):
    def test_follows_the_better_matching_sequence_on_each_side_of_a_junction(self):
        scaffold = [1] * 20 + [0] * 12
        tail = [0] * 20 + [1] * 12
        self.assertEqual(segment_path([scaffold, tail]), [0] * 20 + [1] * 12)

    def test_a_short_better_stretch_does_not_pay_for_two_switches(self):
        scaffold = [1] * 10 + [0] * SWITCH + [1] * 10
        other = [0] * 10 + [1] * SWITCH + [0] * 10
        self.assertEqual(segment_path([scaffold, other]), [0] * len(scaffold))

    def test_ties_go_to_the_first_sequence(self):
        self.assertEqual(segment_path([[1, 1, 1], [1, 1, 1]]), [0, 0, 0])


class WindowIdentity(unittest.TestCase):
    def test_share_of_matches_around_a_residue(self):
        matches = [True] * 6 + [False] * 6
        self.assertEqual(window_identity(matches, 0), 1)
        self.assertAlmostEqual(window_identity(matches, 5), 6 / 11)
        self.assertEqual(window_identity(matches, 11), 0)


if __name__ == "__main__":
    unittest.main()
