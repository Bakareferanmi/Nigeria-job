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


class LocalJobsAndContactsTests(unittest.TestCase):
    def setUp(self):
        self.jobs = hunter.parse_local_feed((Path(__file__).parent / 'fixtures/local_jobs.xml').read_bytes())

    def test_published_feed_shapes_modes_and_expiry(self):
        self.assertEqual(len(self.jobs), 4)
        self.assertEqual([j['work_mode'] for j in self.jobs], ['On-site','Hybrid','Remote','Unspecified'])
        self.assertTrue(self.jobs[2]['remote'])
        self.assertFalse(self.jobs[3]['remote'])
        self.assertEqual(self.jobs[0]['contacts'][0]['email'], 'careers@example.test')

    def test_requested_tracks_and_levels(self):
        for title, track, level in [('Junior Front-End Developer','Frontend Engineering','Junior'),
                                     ('Associate Back-End Engineer','Backend Engineering','Associate'),
                                     ('Full-Stack Intern','Full Stack Engineering','Internship'),
                                     ('Data Science Intern','Data Science','Internship'),
                                     ('Graduate Data Analyst','Data Analysis','Graduate')]:
            j = {**self.jobs[0], 'title':title}
            self.assertIn(track,hunter.role_tracks(j,'All'))
            self.assertEqual(hunter.career_level(j),level)
            self.assertTrue(hunter.level_ok(j,level))
        self.assertEqual(hunter.career_level({**self.jobs[0],'title':'Associate Product Manager'}),'Associate')
        self.assertFalse(hunter.level_ok({**self.jobs[0],'title':'Senior Associate Software Engineer'}))
        self.assertFalse(hunter.level_ok({**self.jobs[0],'title':'Head, Energy Sourcing & Regulatory Relations'}))
        self.assertFalse(hunter.level_ok({**self.jobs[0],'title':'Sr. Software Engineer'}))
        self.assertFalse(hunter.level_ok({**self.jobs[0],'description':'Minimum 5 years required.'}))
        self.assertTrue(hunter.level_ok({**self.jobs[0],'title':'Software Engineer'}))
        self.assertFalse(hunter.level_ok({**self.jobs[0],'title':'Software Engineer'},'Junior'))

    def test_nigeria_boundaries_and_remote_country(self):
        self.assertTrue(hunter.nigeria_location('Akwa Ibom'))
        self.assertFalse(hunter.nigeria_location('Delaware, USA'))
        self.assertFalse(hunter.location_ok({**self.jobs[0],'remote':True,'location':'Remote, Spain','eligibility':'unknown'},'Remote'))
        self.assertTrue(hunter.location_ok(self.jobs[2],'Remote'))
        self.assertFalse(hunter.location_ok(self.jobs[2],'Nigeria'))

    def test_contacts_are_public_application_evidence_only(self):
        raw = '<script>apply to fake@example.test</script><p>Support: support@example.test</p><h2>Method of Application</h2><p>Send CV to <a href="mailto:careers%40example.test?subject=CV">our team</a></p><h2>Related Jobs</h2>other@example.test'
        c=hunter.extract_contacts(raw,'https://www.myjobmag.com/job/example')
        self.assertEqual([v['email'] for v in c],['careers@example.test'])
        self.assertIn('unverified',c[0]['kind'])
        self.assertEqual(hunter.extract_contacts('Sales: sales@example.test','https://example.test'),[])
        self.assertIn('source_url',c[0])

    def test_contact_fetch_blocks_private_host_and_redirect(self):
        import requests
        with patch.object(hunter.HTTP,'get') as get:
            with self.assertRaises(ValueError): hunter.fetch_listing_contacts('https://127.0.0.1/')
            get.assert_not_called()
            response=requests.Response();response._content_consumed=True;response.status_code=302;response.headers['Location']='https://127.0.0.1/private'
            get.return_value=response
            with self.assertRaises(ValueError): hunter.fetch_listing_contacts('https://www.myjobmag.com/job/example')
            self.assertEqual(get.call_count,1)

    def test_contact_identity_is_checked_before_attaching_email(self):
        from unittest.mock import Mock
        raw = '<title>Junior Frontend Developer at Changed Company</title><h2>How to apply</h2>Send CV to jobs@example.test'
        response=Mock(status_code=200,headers={'Content-Type':'text/html'},encoding='utf-8')
        response.iter_content.return_value=[raw.encode()]
        with patch.object(hunter.HTTP,'get',return_value=response):
            with self.assertRaisesRegex(ValueError,'title/company'):
                hunter.fetch_listing_contacts('https://www.myjobmag.com/job/example','Junior Frontend Developer','Original Company')
        response.iter_content.return_value=[raw.encode()]
        with patch.object(hunter.HTTP,'get',return_value=response):
            contacts=hunter.fetch_listing_contacts('https://www.myjobmag.com/job/example','Junior Frontend Developer','Changed Company')
            self.assertEqual(contacts[0]['email'],'jobs@example.test')

    def test_legacy_database_migration_and_contact_preservation(self):
        import sqlite3
        with tempfile.TemporaryDirectory() as root, patch.object(hunter,'DB',Path(root)/'old.sqlite3'):
            with sqlite3.connect(hunter.DB) as db:
                db.execute("CREATE TABLE jobs(id INTEGER PRIMARY KEY,url TEXT UNIQUE NOT NULL,title TEXT,company TEXT,location TEXT,source TEXT,published TEXT,remote INTEGER,eligibility TEXT,score INTEGER,tracks TEXT,skills TEXT,salary TEXT,first_seen TEXT,last_seen TEXT,status TEXT NOT NULL DEFAULT 'new')")
            job=self.jobs[0];job['tracks']=hunter.role_tracks(job,'All');job['score'],job['skills']=hunter.score(job,job['tracks'])
            hunter.save_jobs([job]);row=hunter.saved()[0];hunter.set_status(row['id'],'interview')
            hunter.save_jobs([{**job,'contacts':[]}])
            self.assertEqual(hunter.saved()[0]['status'],'interview')
            self.assertEqual(hunter.job_contacts(row['id'])[0]['email'],'careers@example.test')
            self.assertEqual(hunter.saved()[0]['description'],job['description'])

    def test_local_search_uses_feed_filters_and_preserves_ids(self):
        with tempfile.TemporaryDirectory() as root, patch.object(hunter,'DB',Path(root)/'jobs.sqlite3'), patch.object(hunter,'myjobmag',return_value=self.jobs), patch.object(hunter,'boards',return_value={'greenhouse':[],'lever':[]}):
            matches,errors=hunter.search('Lagos','Frontend Engineering',level='Junior',mode='On-site')
            self.assertFalse(errors);self.assertEqual(len(matches),1)
            self.assertIsInstance(matches[0]['id'],int)
            self.assertEqual(matches[0]['status'],'new')

class SupportTracksAndIndustriesTests(unittest.TestCase):
    def test_three_support_tracks_and_lms_ambiguity(self):
        for title,track in [('Junior Website Administrator','Website Administration'),('CMS Assistant','Website Administration'),('Product Support Associate','Product Support'),('Software Support Intern','Product Support'),('EdTech Support Assistant','EdTech Support'),('Learning Platform Administrator','EdTech Support')]:
            self.assertIn(track,hunter.role_tracks({'title':title},'All'))
        self.assertNotIn('EdTech Support',hunter.role_tracks({'title':'LMS Support Associate','description':'Support our loan management platform'},'All'))

    def test_industry_clues_and_benefits_not_confused_with_sector(self):
        self.assertIn('Healthcare & HealthTech',hunter.industry_tags({'title':'Website Administrator','description':'Maintain our clinic website'}))
        self.assertIn('Manufacturing & Industrial Services',hunter.industry_tags({'industry':'Manufacturing','title':'Product Support','description':''}))
        self.assertEqual(hunter.industry_tags({'title':'Product Support Associate','description':'Benefits: health insurance, pension scheme. University degree required.'}),[])

    def test_search_applies_industry_filter_and_persists_clues(self):
        job=hunter.make_job('Junior Website Administrator','Example','https://example.test/job','Test','Lagos','Maintain clinic websites.')
        with tempfile.TemporaryDirectory() as root,patch.object(hunter,'DB',Path(root)/'jobs.sqlite3'),patch.object(hunter,'myjobmag',return_value=[job]),patch.object(hunter,'boards',return_value={'greenhouse':[],'lever':[]}):
            jobs,errors=hunter.search('Nigeria','Website Administration',industry='Healthcare & HealthTech')
            self.assertEqual(len(jobs),1);self.assertFalse(errors)
            self.assertIn('Healthcare & HealthTech',hunter.saved()[0]['industry_tags'])
            jobs,_=hunter.search('Nigeria','Website Administration',industry='Energy & Utilities')
            self.assertEqual(jobs,[])
        self.assertIn('healthcare',hunter.discovery('Website Administration','Healthcare & HealthTech')[0][1])

if __name__ == "__main__":
    unittest.main()
