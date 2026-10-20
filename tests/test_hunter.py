"""Offline unit tests; run: python -m unittest discover -s tests -v"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import hunter

class JobHunterTests(unittest.TestCase):
    def test_normalize(self):
        job = hunter.make_job("Junior <b>Data Analyst</b>", "Example", "https://example.com/job",
                              "Test", "Lagos", "Excel")
        self.assertEqual(job["title"], "Junior Data Analyst")
        self.assertIsNone(hunter.make_job("Unknown", "Example", "http://example.com", "Test"))

    def test_role_and_seniority(self):
        job = hunter.make_job("Junior Procurement Assistant", "Employer", "https://example.com/job",
                              "Test", "Lagos, Nigeria")
        tracks = hunter.role_tracks(job, "Supply Chain")
        self.assertEqual(tracks, ["Supply Chain"])
        value, skills = hunter.score(job, tracks)
        self.assertGreater(value, 50)
        self.assertTrue(hunter.location_ok(job, "Lagos"))
        self.assertFalse(hunter.location_ok(job, "Remote"))

    def test_remote_location(self):
        job = hunter.make_job("Junior Frontend Developer", "Employer", "https://example.com/job",
                              "Test", "Worldwide", remote=True, eligibility="likely")
        self.assertTrue(hunter.location_ok(job, "Remote"))
        self.assertFalse(hunter.location_ok(job, "Nigeria"))

    def test_sqlite_tracking(self):
        with tempfile.TemporaryDirectory() as root:
            with patch.object(hunter, "DB", Path(root) / "jobs.sqlite3"):
                job = hunter.make_job("Junior Network Engineer", "Employer",
                                      "https://example.com/network", "Test", "Lagos")
                job["tracks"] = ["Networking"]
                job["score"], job["skills"] = hunter.score(job, job["tracks"])
                hunter.save_jobs([job])
                rows = hunter.saved()
                self.assertEqual(len(rows), 1)
                self.assertTrue(hunter.set_status(rows[0]["id"], "applied"))
                hunter.save_jobs([job])
                self.assertEqual(hunter.saved()[0]["status"], "applied")

if __name__ == "__main__":
    unittest.main()
