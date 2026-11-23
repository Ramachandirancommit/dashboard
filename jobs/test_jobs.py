import unittest
from datetime import datetime

from classify import suggest
from reminders import next_occurrence


class ReminderTests(unittest.TestCase):
    def test_monthly_reminders_keep_the_original_day(self):
        anchor = datetime(2026, 1, 31, 10)
        february = datetime(2026, 2, 28, 10)
        self.assertEqual(next_occurrence(anchor, "monthly", anchor), february)
        self.assertEqual(next_occurrence(anchor, "monthly", february), datetime(2026, 3, 31, 10))

    def test_yearly_leap_day_reminder_recovers_after_short_year(self):
        anchor = datetime(2024, 2, 29, 10)
        self.assertEqual(next_occurrence(anchor, "yearly", anchor), datetime(2025, 2, 28, 10))
        self.assertEqual(next_occurrence(anchor, "yearly", datetime(2027, 4, 1)), datetime(2028, 2, 29, 10))

    def test_weekly_skips_missed_occurrences(self):
        anchor = datetime(2026, 1, 1, 10)
        self.assertEqual(next_occurrence(anchor, "weekly", datetime(2026, 1, 15, 10)), datetime(2026, 1, 22, 10))
        self.assertIsNone(next_occurrence(anchor, "none", anchor))


class ClassifierTests(unittest.TestCase):
    def test_suggests_modules_from_catalog(self):
        self.assertEqual(suggest("EMI subscription renewal", [])["suggestions"][0]["module"], "reminders")

    def test_learns_from_saved_titles(self):
        self.assertEqual(suggest("photowalk", [])["suggestions"], [])
        results = suggest("photowalk", [{"module": "entertainment", "title": "Weekend photowalk"}])
        self.assertEqual(results["suggestions"][0]["module"], "entertainment")
