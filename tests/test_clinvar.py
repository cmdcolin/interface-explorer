import unittest

from clinvar import AMINO_ACIDS, MISSENSE, on_sequence, to_canonical


class Missense(unittest.TestCase):
    def test_parses_transcript_and_protein_change(self):
        match = MISSENSE.match("NM_000516.7(GNAS):c.1024C>T (p.Arg342Trp)")
        self.assertEqual(match.groups(), ("NM_000516", "Arg", "342", "Trp"))

    def test_rejects_synonymous_and_frameshift(self):
        self.assertIsNone(MISSENSE.match("NM_000516.7(GNAS):c.1026G>A (p.Arg342=)"))
        self.assertIsNone(MISSENSE.match("NM_000516.7(GNAS):c.1024del (p.Arg342fs)"))

    def test_nonsense_is_left_to_the_amino_acid_filter(self):
        match = MISSENSE.match("NM_000516.7(GNAS):c.1024C>T (p.Arg342Ter)")
        self.assertNotIn(match.group(4), AMINO_ACIDS)


class OnSequence(unittest.TestCase):
    def test_wild_type_matches(self):
        self.assertTrue(on_sequence({"position": 3, "change": "C3Y"}, "MAC"))

    def test_wrong_wild_type(self):
        self.assertFalse(on_sequence({"position": 3, "change": "D3Y"}, "MAC"))

    def test_beyond_the_sequence(self):
        self.assertFalse(on_sequence({"position": 4, "change": "C4Y"}, "MAC"))


class ToCanonical(unittest.TestCase):
    isoform = ("MABXYZEFG", [1, 2, 3, None, None, None, 6, 7, 8])

    def test_maps_isoform_position_to_canonical(self):
        variant = {"position": 8, "change": "F8L", "label": "pathogenic"}
        self.assertEqual(to_canonical(variant, *self.isoform), {"position": 7, "change": "F7L", "label": "pathogenic"})

    def test_residue_absent_from_canonical(self):
        self.assertIsNone(to_canonical({"position": 4, "change": "X4L"}, *self.isoform))

    def test_wrong_wild_type(self):
        self.assertIsNone(to_canonical({"position": 8, "change": "A8L"}, *self.isoform))

    def test_beyond_the_isoform(self):
        self.assertIsNone(to_canonical({"position": 10, "change": "G10L"}, *self.isoform))


if __name__ == "__main__":
    unittest.main()
