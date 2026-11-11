import math
import unittest

import numpy as np

from analyze import mantel_haenszel


class MantelHaenszel(unittest.TestCase):
    def test_single_table_is_the_odds_ratio(self):
        self.assertEqual(mantel_haenszel(np.array([[10, 5, 4, 8]], dtype=float)), 4.0)

    def test_pools_tables_weighted_by_size(self):
        rows = np.array([[10, 5, 4, 8], [3, 7, 2, 9]], dtype=float)
        numerator = 10 * 8 / 27 + 3 * 9 / 21
        denominator = 5 * 4 / 27 + 7 * 2 / 21
        self.assertAlmostEqual(mantel_haenszel(rows), numerator / denominator)
        self.assertAlmostEqual(mantel_haenszel(rows), 803 / 266)

    def test_no_tables_is_nan(self):
        self.assertTrue(math.isnan(mantel_haenszel(np.array([], dtype=float))))
        self.assertTrue(math.isnan(mantel_haenszel(np.empty((0, 4)))))

    def test_no_discordant_benign_is_infinite(self):
        self.assertEqual(mantel_haenszel(np.array([[3, 0, 0, 4]], dtype=float)), float("inf"))


if __name__ == "__main__":
    unittest.main()
