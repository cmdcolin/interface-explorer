import unittest

from tracks import bed12, merge


class Merge(unittest.TestCase):
    def test_joins_consecutive_positions_into_half_open_blocks(self):
        self.assertEqual(merge([5, 3, 4, 10, 11, 20]), [[3, 6], [10, 12], [20, 21]])

    def test_reverse_strand_order_is_sorted(self):
        self.assertEqual(merge([102, 101, 100, 52, 51, 50]), [[50, 53], [100, 103]])

    def test_empty(self):
        self.assertEqual(merge([]), [])


class Bed12(unittest.TestCase):
    def test_block_sizes_and_starts_are_relative_to_the_feature(self):
        line = bed12("chr1", "-", [[100, 103], [200, 206]], "A–B", 600, "40,110,200")
        self.assertEqual(line.split("\t"), ["chr1", "100", "206", "A–B", "600", "-", "100", "206", "40,110,200", "2", "3,6", "0,100"])

    def test_single_block(self):
        self.assertEqual(bed12("chrX", "+", [[7, 10]], "n", 1000, "0,0,0"), "chrX\t7\t10\tn\t1000\t+\t7\t10\t0,0,0\t1\t3\t0")


if __name__ == "__main__":
    unittest.main()
