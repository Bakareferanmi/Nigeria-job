"""Live job search, match scoring, Nigeria filtering and SQLite tracking."""
import csv
import html
import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote_plus

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
    "Frontend Engineering": ["frontend", "front end", "react developer", "web developer", "javascript developer"],
    "Software Engineering": ["software engineer", "software developer", "full stack", "fullstack", "backend", "python developer", "web developer", "qa engineer", "software tester"],
    "Product Management": ["product analyst", "product associate", "associate product manager", "product management", "product operations"],
    "Business Analysis": ["business analyst", "business intelligence", "business operations analyst", "process analyst"],
    "Operations": ["operations analyst", "operations associate", "operations assistant", "operations coordinator", "business operations"],
}
ENTRY = re.compile(r"\b(intern(ship)?|trainee|graduate|entry[- ]level|junior|associate|assistant|apprentice|nysc)\b", re.I)
SENIOR = re.compile(r"\b(senior|principal|staff engineer|lead engineer|director|head of|vice president|chief|manager|architect)\b", re.I)
YEARS = re.compile(r"\b([1-9]\d?)\s*(?:\+|plus)?\s*(?:years|yrs)\b", re.I)
NG_TERMS = ("nigeria", "lagos", "abuja", "ibadan", "ogun", "ikeja", "lekki", "port harcourt", "enugu")

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
        "remote": bool(remote), "eligibility": eligibility, "salary": clean(salary), "level": clean(level)
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
                any(x in geo for x in NG_TERMS)):
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
        if not any(x in geo for x in NG_TERMS + ("worldwide", "anywhere", "global")):
            continue
        eligible = "yes" if any(x in geo for x in NG_TERMS) else "likely"
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
                       remote="remote" in location.lower())
        if job: output.append(job)
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
    if job["remote"]:
        return region in ("Remote", "Nigeria + Remote") and job["eligibility"] != "no"
    if region == "Remote": return False
    loc = job["location"].lower()
    return ("lagos" in loc if region == "Lagos" else any(x in loc for x in NG_TERMS))

def connect_db():
    DB.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(DB))
    connection.execute("""CREATE TABLE IF NOT EXISTS jobs(
      id INTEGER PRIMARY KEY, url TEXT UNIQUE NOT NULL, title TEXT, company TEXT,
      location TEXT, source TEXT, published TEXT, remote INTEGER, eligibility TEXT,
      score INTEGER, tracks TEXT, skills TEXT, salary TEXT, first_seen TEXT,
      last_seen TEXT, status TEXT NOT NULL DEFAULT 'new')""")
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

def search(region="Nigeria + Remote", track="All"):
    sources = []
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
    for name, callback in sources:
        try:
            items = callback()
            found.extend(items)
            print(f"  {name}: {len(items)} fetched")
        except (requests.RequestException, ValueError, KeyError, TypeError) as exc:
            errors.append(f"{name}: {str(exc)[:140]}")
            print(f"  {name}: unavailable")
    matches = []
    for job in {j["url"].rstrip("/"): j for j in found}.values():
        if not location_ok(job, region): continue
        if SENIOR.search(job["title"]) and not ENTRY.search(job["title"]): continue
        tracks = role_tracks(job, track)
        if not tracks: continue
        job["tracks"] = tracks
        job["score"], job["skills"] = score(job, tracks)
        matches.append(job)
    matches.sort(key=lambda x: (x["score"], x["published"]), reverse=True)
    save_jobs(matches)
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
