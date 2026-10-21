"""Live job search, match scoring, Nigeria filtering and SQLite tracking."""
import csv
import html
import json
import os
import re
import sqlite3
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from html.parser import HTMLParser
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import quote_plus, urlparse, urljoin, unquote

import requests
from profile import PROFILE

ROOT = Path(__file__).resolve().parent
DB = Path(os.getenv("JOBHUNTER_DB", str(ROOT / "data" / "jobs.sqlite3")))
HTTP = requests.Session()
HTTP.headers.update({"User-Agent": "NigeriaJobHunter/1.0 (personal-use)", "Accept": "application/json"})
TRACK_WORDS = {
    "Electrical Engineering": ["electrical", "maintenance engineer", "field engineer", "solar engineer", "power engineer"],
    "Data Analysis": ["data analyst", "reporting analyst", "analytics analyst", "business intelligence", "bi analyst", "mis analyst"],
    "Data Science": ["data scientist", "data science", "machine learning", "ml engineer"],
    "Supply Chain": ["supply chain", "procurement", "logistics", "inventory", "warehouse", "purchasing", "sourcing", "demand planning"],
    "IT Support": ["it support", "technical support", "helpdesk", "help desk", "service desk", "it technician", "desktop support"],
    "Networking": ["network engineer", "network support", "network technician", "noc analyst", "noc engineer", "network operations"],
    "Telecommunications": ["telecom", "telecommunications", "rf engineer", "transmission engineer", "fiber optic", "fibre optic", "noc engineer"],
    "Frontend Engineering": ["frontend", "front end", "front-end", "react developer", "react engineer", "web developer", "javascript developer"],
    "Backend Engineering": ["backend", "back end", "back-end", "node.js developer", "nodejs developer", "python developer", "java developer", "php developer", "django developer"],
    "Full Stack Engineering": ["full stack", "fullstack", "full-stack"],
    "Software Engineering": ["software engineer", "software developer", "full stack", "fullstack", "full-stack", "backend", "back-end", "back end", "python developer", "web developer", "qa engineer", "software tester"],
    "Product Management": ["product analyst", "product associate", "associate product manager", "product management", "product operations"],
    "Business Analysis": ["business analyst", "business intelligence", "business operations analyst", "process analyst"],
    "Operations": ["operations analyst", "operations associate", "operations assistant", "operations coordinator", "business operations"],
}
ENTRY = re.compile(r"\b(intern(ship)?|trainee|graduate|entry[- ]level|junior|associate|assistant|apprentice|nysc)\b", re.I)
SENIOR = re.compile(r"\b(senior|principal|staff engineer|lead engineer|director|head of|vice president|chief|manager|architect)\b", re.I)
YEARS = re.compile(r"\b([1-9]\d?)\s*(?:\+|plus)?\s*(?:years|yrs)\b", re.I)
NG_TERMS = ("nigeria", "lagos", "abuja", "ibadan", "ogun", "ikeja", "lekki", "port harcourt", "enugu",
            "abia", "adamawa", "akwa ibom", "anambra", "bauchi", "bayelsa", "benue", "borno", "cross river",
            "delta", "ebonyi", "edo", "ekiti", "gombe", "imo", "jigawa", "kaduna", "kano", "katsina", "kebbi",
            "kogi", "kwara", "nasarawa", "nassarawa", "niger state", "ondo", "osun", "oyo", "plateau", "rivers",
            "sokoto", "taraba", "yobe", "zamfara", "fct")
LEVELS = ("Early career", "Junior", "Associate", "Internship", "Graduate", "Unspecified", "All")
WORK_MODES = ("All", "On-site", "Hybrid", "Remote", "Unspecified")
LOCAL_FEED = "https://www.myjobmag.com/feeds/ng/jobsxml_by_categories.xml"


def nigeria_location(location):
    return any(re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", location, re.I) for term in NG_TERMS)


def career_level(job):
    title = job["title"]
    if re.search(r"\b(senior|sr|principal|staff|lead|director|head|vice president|chief|architect)\b", title, re.I): return "Senior"
    if SENIOR.search(title) and not ENTRY.search(title): return "Senior"
    text = title + " " + job.get("level", "")
    for name, pattern in (("Internship", r"\b(intern(ship)?|nysc|siwes)\b"),
                          ("Graduate", r"\b(graduate|trainee|apprentice)\b"),
                          ("Junior", r"\b(junior|jr\.?|entry[- ]level|assistant)\b"),
                          ("Associate", r"\bassociate\b")):
        if re.search(pattern, text, re.I): return name
    if re.search(r"senior|mid[- ]?level|intermediate|expert|executive", job.get("level", ""), re.I): return "Senior"
    return "Unspecified"


def level_ok(job, selected="Early career"):
    level = career_level(job)
    if selected == "All": return True
    if level == "Senior": return False
    if selected != "Early career": return level == selected
    # Retain unlabelled 0–3-year roles, but exclude explicit high-experience requirements.
    years = [int(x) for x in YEARS.findall(job.get("description", "")[:3500])]
    return not years or min(years) < 4


def work_mode(text):
    text = clean(text)
    if re.search(r"\bhybrid\b", text, re.I): return "Hybrid"
    if re.search(r"\bremote(?:ly)?\b", text, re.I): return "Remote"
    if re.search(r"\bon[- ]?site\b|\bphysical (?:role|job|work)\b", text, re.I): return "On-site"
    return "Unspecified"


def parse_local_feed(content):
    root = ET.fromstring(content)
    output = []
    for item in root.findall(".//item"):
        def field(name): return item.findtext(name) or ""
        title, company = field("position"), field("company")
        if not title:
            title, _, fallback_company = field("title").partition(" at ")
            company = company or fallback_company
        expiry = field("expiryDate")
        if expiry:
            try:
                deadline = datetime.fromisoformat(expiry.replace("Z", "+00:00"))
            except ValueError:
                try: deadline = parsedate_to_datetime(expiry)
                except (ValueError, TypeError, OverflowError): deadline = None
            if deadline:
                if deadline.tzinfo is None: deadline = deadline.replace(tzinfo=timezone.utc)
                if deadline < datetime.now(timezone.utc): continue
        description = field("description")
        # Only explicit arrangement phrases, not a generic reference to remote work.
        arrangement = re.search(r"(?:job type|work (?:mode|arrangement)|working arrangement)\s*:?\s*(remote|hybrid|on[- ]?site)|\b(hybrid working|work remotely|fully remote|on[- ]site role)\b", clean(description), re.I)
        mode = work_mode(arrangement.group(0)) if arrangement else "Unspecified"
        job = make_job(title, company, field("link"), "MyJobMag", field("location"),
                       description, field("pubDate"), mode == "Remote", "yes")
        if job:
            job["work_mode"] = mode
            output.append(job)
    return output


def myjobmag():
    response = HTTP.get(LOCAL_FEED, timeout=25, headers={"Accept": "application/rss+xml, application/xml"})
    response.raise_for_status()
    if len(response.content) > 5_000_000: raise ValueError("Local feed exceeds size limit")
    return parse_local_feed(response.content)


def clean(value):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))).strip()

def read_json(url, params=None):
    response = HTTP.get(url, params=params, timeout=25)
    response.raise_for_status()
    return response.json()

def make_job(title, company, url, source, location="", description="", published="", remote=False, eligibility="unknown", salary="", level=""):
    if not title or not str(url or "").startswith("https://"):
        return None
    return {
        "title": clean(title), "company": clean(company) or "Unspecified",
        "url": str(url), "source": source, "location": clean(location),
        "description": clean(description)[:7000], "published": str(published or ""),
        "remote": bool(remote), "eligibility": eligibility, "salary": clean(salary), "level": clean(level),
        "work_mode": "Remote" if remote else work_mode(location),
        "contacts": extract_contacts(description, str(url))
    }

def himalayas():
    # Broad country search avoids dozens of requests for role synonyms.
    results = []
    for page in (1, 2):
        data = read_json("https://himalayas.app/jobs/api/search",
                         {"country": "NG", "sort": "recent", "page": page})
        items = data.get("jobs", []) if isinstance(data, dict) else []
        if not items:
            break
        for item in items:
            loc = item.get("locationRestrictions") or []
            tz = item.get("timezoneRestrictions") or []
            countries = [str(x.get("alpha2") or x.get("code") or x.get("name") or "") if isinstance(x, dict) else str(x) for x in loc]
            country_ok = not countries or any(c.lower() in ("ng", "nigeria") for c in countries)
            # Nigeria is on UTC+01:00 year-round. Unknown formats are excluded rather than falsely cleared.
            timezone_ok = not tz or any(str(x).strip().lower() in
                ("1", "+1", "utc+1", "utc+01", "utc+01:00", "+01:00", "gmt+1") for x in tz)
            if not country_ok or not timezone_ok:
                continue
            salary = (f"{item.get('currency') or ''} {item.get('minSalary') or ''}-{item.get('maxSalary') or ''}"
                      if item.get("minSalary") or item.get("maxSalary") else "")
            job = make_job(item.get("title"), item.get("companyName"), item.get("applicationLink"),
                           "Himalayas", ", ".join(countries) or "Worldwide",
                           item.get("description") or item.get("excerpt"), item.get("pubDate"),
                           True, "yes", salary)
            if job: results.append(job)
    return results

def jobicy():
    data = read_json("https://jobicy.com/api/v2/remote-jobs", {"count": 200})
    results = []
    for item in data.get("jobs", []):
        geo = clean(item.get("jobGeo")).lower()
        if not (geo in ("anywhere", "worldwide", "global", "international") or
                nigeria_location(geo)):
            continue
        salary = (f"{item.get('salaryCurrency') or ''} {item.get('salaryMin') or ''}-{item.get('salaryMax') or ''}"
                  if item.get("salaryMin") or item.get("salaryMax") else "")
        job = make_job(item.get("jobTitle"), item.get("companyName"), item.get("url"), "Jobicy",
                       item.get("jobGeo"), item.get("jobDescription") or item.get("jobExcerpt"),
                       item.get("pubDate"), True, "likely" if geo in
                       ("anywhere", "worldwide", "global", "international") else "yes",
                       salary, item.get("jobLevel"))
        if job: results.append(job)
    return results

def remotive():
    data = read_json("https://remotive.com/api/remote-jobs")
    results = []
    for item in data.get("jobs", []):
        geo = clean(item.get("candidate_required_location")).lower()
        if not (nigeria_location(geo) or re.search(r"\b(worldwide|anywhere|global)\b", geo)):
            continue
        eligible = "yes" if nigeria_location(geo) else "likely"
        job = make_job(item.get("title"), item.get("company_name"), item.get("url"), "Remotive",
                       geo, item.get("description"), item.get("publication_date"), True,
                       eligible, item.get("salary"))
        if job: results.append(job)
    return results

def boards():
    path = ROOT / "boards.json"
    data = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    return {kind: [x for x in data.get(kind, []) if isinstance(x, str) and re.fullmatch(r"[\w-]+", x)]
            for kind in ("greenhouse", "lever")}

def greenhouse(token):
    data = read_json(f"https://boards-api.greenhouse.io/v1/boards/{token}/jobs", {"content": "true"})
    output = []
    for item in data.get("jobs", []):
        location = (item.get("location") or {}).get("name", "")
        job = make_job(item.get("title"), token.replace("-", " ").title(),
                       item.get("absolute_url"), f"Greenhouse:{token}", location,
                       item.get("content"), item.get("updated_at"), "remote" in location.lower())
        if job: output.append(job)
    return output

def lever(token):
    data = read_json(f"https://api.lever.co/v0/postings/{token}", {"mode": "json"})
    output = []
    for item in data if isinstance(data, list) else []:
        location = (item.get("categories") or {}).get("location") or ""
        job = make_job(item.get("text"), token.replace("-", " ").title(),
                       item.get("hostedUrl") or item.get("applyUrl"), f"Lever:{token}",
                       location, item.get("descriptionPlain") or item.get("description"),
                       remote=item.get("workplaceType") == "remote" or "remote" in location.lower())
        if job:
            job["work_mode"] = "Remote" if job["remote"] else work_mode(item.get("workplaceType") or location)
            output.append(job)
    return output

def role_tracks(job, selected):
    title = job["title"].lower()
    choices = TRACK_WORDS if selected == "All" else {selected: TRACK_WORDS.get(selected, [])}
    return [name for name, words in choices.items() if any(word in title for word in words)]

def score(job, tracks):
    title = job["title"]
    text = (title + " " + job.get("description", "")).lower()
    value = 35 + min(15, len(tracks) * 5)
    if ENTRY.search(title): value += 22
    if SENIOR.search(title): value -= 35
    years = [int(x) for x in YEARS.findall(job.get("description", "")[:3500])]
    if years and min(years) >= 4: value -= 20
    elif years and min(years) <= 2: value += 8
    skills = [s for s in PROFILE.get("skills", [])
              if len(s) >= 3 and re.search(r"(?<!\w)" + re.escape(s.lower()) + r"(?!\w)", text)]
    value += min(15, len(skills) * 3)
    if job["eligibility"] == "yes": value += 8
    if "lagos" in job["location"].lower(): value += 5
    return max(0, min(100, value)), skills

def location_ok(job, region):
    loc = job["location"].lower()
    if job["remote"]:
        if region not in ("Remote", "Nigeria + Remote") or job["eligibility"] == "no": return False
        return job["eligibility"] in ("yes", "likely") or nigeria_location(loc) or bool(re.search(r"\b(worldwide|anywhere|global)\b", loc))
    if region == "Remote": return False
    return bool(re.search(r"\blagos\b", loc)) if region == "Lagos" else nigeria_location(loc)

def connect_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB))
    connection.execute("""CREATE TABLE IF NOT EXISTS jobs(
      id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, title TEXT, company TEXT,
      location TEXT, source TEXT, published TEXT, remote INTEGER, eligibility TEXT,
      score INTEGER, tracks TEXT, skills TEXT, salary TEXT, first_seen TEXT,
      last_seen TEXT, status TEXT NOT NULL DEFAULT 'new')""")
    existing = {row[1] for row in connection.execute("PRAGMA table_info(jobs)")}
    for name, definition in (("description", "TEXT NOT NULL DEFAULT ''"), ("level", "TEXT NOT NULL DEFAULT ''"),
                             ("work_mode", "TEXT NOT NULL DEFAULT 'Unspecified'"), ("contacts", "TEXT NOT NULL DEFAULT '[]'")):
        if name not in existing: connection.execute(f"ALTER TABLE jobs ADD COLUMN {name} {definition}")
    connection.commit()
    return connection

def save_jobs(jobs):
    timestamp = datetime.now(timezone.utc).isoformat()
    with connect_db() as connection:
        for job in jobs:
            connection.execute("""INSERT INTO jobs
            (url,title,company,location,source,published,remote,eligibility,score,
             tracks,skills,salary,first_seen,last_seen)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
            ON CONFLICT(url) DO UPDATE SET
            title=excluded.title,company=excluded.company,location=excluded.location,
            source=excluded.source,published=excluded.published,remote=excluded.remote,
            eligibility=excluded.eligibility,score=excluded.score,tracks=excluded.tracks,
            skills=excluded.skills,salary=excluded.salary,last_seen=excluded.last_seen""",
            (job["url"],job["title"],job["company"],job["location"],job["source"],
             job["published"],int(job["remote"]),job["eligibility"],job["score"],
             ", ".join(job["tracks"]),", ".join(job["skills"]),job["salary"],
             timestamp,timestamp))
            connection.execute("UPDATE jobs SET description=?,level=?,work_mode=? WHERE url=?",
                               (job.get("description", ""), career_level(job), job.get("work_mode", "Unspecified"), job["url"]))
            # Preserve previously fetched contacts when the feed contains no application section.
            if job.get("contacts"):
                connection.execute("UPDATE jobs SET contacts=? WHERE url=?", (json.dumps(job["contacts"]), job["url"]))

def search(region="Nigeria + Remote", track="All", level="Early career", mode="All"):
    if level not in LEVELS or mode not in WORK_MODES: raise ValueError("Invalid search filter")
    sources = [("MyJobMag", myjobmag)] if region != "Remote" else []
    if region in ("Remote", "Nigeria + Remote"):
        sources.extend([("Himalayas",himalayas), ("Jobicy",jobicy), ("Remotive",remotive)])
    config = boards()
    for token in config["greenhouse"]:
        sources.append((f"Greenhouse:{token}", lambda t=token: greenhouse(t)))
    for token in config["lever"]:
        sources.append((f"Lever:{token}", lambda t=token: lever(t)))
    found, errors = [], []
    if not sources:
        print("No live Nigerian employer feeds configured. Add board tokens to boards.json.")
    with ThreadPoolExecutor(max_workers=4) as executor:
        pending = {executor.submit(callback): name for name, callback in sources}
        for future in as_completed(pending):
            name = pending[future]
            try:
                items = future.result()
                found.extend(items)
                print(f"  {name}: {len(items)} fetched")
            except (requests.RequestException, ValueError, KeyError, TypeError, ET.ParseError) as exc:
                errors.append(f"{name}: {str(exc)[:140]}")
                print(f"  {name}: unavailable")
    matches = []
    for job in {j["url"].rstrip("/"): j for j in found}.values():
        if not location_ok(job, region): continue
        if not level_ok(job, level): continue
        if mode != "All" and job.get("work_mode", "Unspecified") != mode: continue
        tracks = role_tracks(job, track)
        if not tracks: continue
        job["tracks"] = tracks
        job["score"], job["skills"] = score(job, tracks)
        matches.append(job)
    matches.sort(key=lambda x: (x["score"], x["published"]), reverse=True)
    save_jobs(matches)
    with connect_db() as connection:
        connection.row_factory = sqlite3.Row
        for job in matches:
            row = connection.execute("SELECT id,status,contacts FROM jobs WHERE url=?", (job["url"],)).fetchone()
            job.update(id=row["id"], status=row["status"], contacts=json.loads(row["contacts"]), level=career_level(job))
    return matches, errors

def saved(status=None, limit=100):
    with connect_db() as connection:
        connection.row_factory = sqlite3.Row
        if status:
            rows = connection.execute(
                "SELECT * FROM jobs WHERE status=? ORDER BY score DESC,last_seen DESC LIMIT ?",
                (status,limit)).fetchall()
        else:
            rows = connection.execute(
                "SELECT * FROM jobs ORDER BY score DESC,last_seen DESC LIMIT ?",
                (limit,)).fetchall()
        return [dict(row) for row in rows]

STATUSES = ("new","interested","applied","interview","rejected","offer","archived")

def set_status(job_id, status):
    if status not in STATUSES: return False
    with connect_db() as connection:
        cursor = connection.execute("UPDATE jobs SET status=? WHERE id=?", (status,job_id))
        return cursor.rowcount > 0

def export_csv(filename):
    rows = saved(limit=100000)
    if not rows: return None
    with open(filename, "w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    return filename

def discovery(track):
    """Links to search pages, NOT evidence of individual open vacancies."""
    words = TRACK_WORDS.get(track) or ["graduate trainee","data analyst","it support","procurement"]
    out = []
    for word in words[:3]:
        out.append(("Jobberman",f"https://www.jobberman.com/jobs?search={quote_plus(word)}"))
        out.append(("LinkedIn Jobs",f"https://www.linkedin.com/jobs/search/?keywords={quote_plus(word)}&location=Nigeria"))
    return out


class ListingText(HTMLParser):
    """Keep public visible text and mailto addresses; omit script/style contents."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.hidden = [], 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"): self.hidden += 1
        if self.hidden: return
        if tag in ("p", "div", "li", "br", "h2", "h3", "h4"): self.parts.append("\n")
        if tag == "a":
            href = dict(attrs).get("href", "")
            if href.lower().startswith("mailto:"): self.parts.append(" " + unquote(href[7:].split("?")[0]) + " ")

    def handle_endtag(self, tag):
        if tag in ("script", "style") and self.hidden: self.hidden -= 1
        if not self.hidden and tag in ("p", "div", "li", "h2", "h3", "h4"): self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden: self.parts.append(data)


def extract_contacts(raw, source_url):
    parser = ListingText()
    parser.feed(str(raw or ""))
    text = html.unescape(" ".join(parser.parts))
    section = re.search(r"method of application|how to apply|application instructions|application process", text, re.I)
    if section:
        text = text[section.end():section.end() + 6000]
        text = re.split(r"related jobs|similar jobs|jobs you might|subscribe to|build your cv|share this job", text, flags=re.I)[0]
    output, seen = [], set()
    for match in re.finditer(r"[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}", text, re.I):
        email = match.group(0).rstrip(".").lower()
        context = clean(text[max(0, match.start()-180):match.end()+180])
        if email in seen or email.endswith(("@myjobmag.com", "@remotive.com", "@jobicy.com", "@himalayas.app")): continue
        if re.match(r"(?:no-?reply|privacy|support|legal|abuse|info)@", email): continue
        if not section and not re.search(r"apply|send.{0,40}(cv|resume)|recruit|hiring|talent acquisition", context, re.I): continue
        seen.add(email)
        output.append({"email": email, "kind": "Published application contact; recruiter identity unverified",
                       "source_url": source_url, "evidence": context[:360],
                       "found_at": datetime.now(timezone.utc).isoformat()})
    return output


CONTACT_HOSTS = ("myjobmag.com", "boards.greenhouse.io", "job-boards.greenhouse.io", "job-boards.eu.greenhouse.io", "boards.eu.greenhouse.io", "jobs.lever.co",
                 "himalayas.app", "jobicy.com", "remotive.com")


def fetch_listing_contacts(url, expected_title="", expected_company=""):
    """Fetch only supported public job hosts, checking every redirect before following it."""
    for _ in range(4):
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443) or not any(
                parsed.hostname == h or parsed.hostname == "www." + h for h in CONTACT_HOSTS):
            raise ValueError("Contact fetching supports public job-board listings only. Check the original employer link manually.")
        response = HTTP.get(url, timeout=20, allow_redirects=False, stream=True,
                            headers={"Accept": "text/html"})
        try:
            if response.status_code in (301, 302, 303, 307, 308):
                url = urljoin(url, response.headers.get("Location", ""))
                continue
            response.raise_for_status()
            if "text/html" not in response.headers.get("Content-Type", "").lower():
                raise ValueError("Listing did not return HTML")
            chunks, size = [], 0
            for chunk in response.iter_content(65536):
                size += len(chunk)
                if size > 2_000_000: raise ValueError("Listing exceeds size limit")
                chunks.append(chunk)
            raw = b"".join(chunks).decode(response.encoding or "utf-8", errors="replace")
            if expected_title or expected_company:
                headline = re.search(r"<title[^>]*>([\s\S]*?)</title>", raw, re.I)
                normalize_identity = lambda value: re.sub(r"[^a-z0-9]+", " ", clean(value).lower()).strip()
                identity = normalize_identity(headline.group(1)) if headline else ""
                if not identity or any(normalize_identity(value) not in identity for value in
                                       (expected_title, expected_company) if value):
                    raise ValueError("Listing title/company could not be matched to this saved job. Check the source manually; no contacts were attached.")
            return extract_contacts(raw, url)
        finally:
            response.close()
    raise ValueError("Too many listing redirects")


def job_contacts(job_id, fetch=False):
    with connect_db() as connection:
        connection.row_factory = sqlite3.Row
        row = connection.execute("SELECT url,title,company,contacts FROM jobs WHERE id=?", (job_id,)).fetchone()
        if row is None: raise ValueError("Saved job ID not found")
    contacts = json.loads(row["contacts"])
    if fetch:
        found = fetch_listing_contacts(row["url"], row["title"], row["company"])
        by_email = {c["email"]: c for c in contacts}
        by_email.update({c["email"]: c for c in found})
        contacts = list(by_email.values())
        with connect_db() as connection:
            connection.execute("UPDATE jobs SET contacts=? WHERE id=?", (json.dumps(contacts), job_id))
    return contacts
