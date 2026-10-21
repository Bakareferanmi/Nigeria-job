# JobHunter: Nigeria + remote jobs

Python CLI for discovering and tracking engineering, data, supply chain, IT, networking, telecoms, software, product, and operations opportunities.

## Termux quick start

```bash
pkg install python git
git clone https://github.com/Bakareferanmi/Nigeria-job.git
cd Nigeria-job
python -m pip install -r requirements.txt
python main.py
```

If you already cloned this repository, use `git pull` after updating your branch.

## Commands

```bash
python main.py
python main.py search
python main.py search --region Remote --track "Data Analysis" --limit 25
python main.py search --region Lagos --track "Supply Chain"
python main.py list
python main.py status 12 applied
python main.py export --file applications.csv
```

## Live sources

Remote APIs: Himalayas, Jobicy, Remotive. **Remote OK is excluded**. Original application URLs and source labels are retained. Remotive results may be delayed.

Nigerian vacancies: MyJobMag's [published detailed RSS feed](https://www.myjobmag.com/feeds/ng/jobsxml_by_categories.xml), linked from its [sitemap](https://www.myjobmag.com/sitemap), plus Greenhouse and Lever public employer boards. The RSS feed provides the latest **100 entries across all fields**, not a historical or exhaustive search. It includes Nigerian local roles; remote-only searches use the remote APIs and configured employer boards instead.

`boards.json` now includes `moniepoint` (Greenhouse) and `Yassir` (Lever). Sources: [Moniepoint board](https://boards.greenhouse.io/moniepoint), [Moniepoint careers](https://moniepoint.com/careers), and [Yassir board](https://jobs.lever.co/Yassir). These are source configurations, not a claim that a suitable vacancy is always open. Add other verified public board tokens as needed. LinkedIn and Jobberman remain discovery links and are not scraped.

Sources are fetched concurrently with at most four workers. Partial source failures do not remove previously saved jobs.

## How matching works

Role families are inferred from job **titles**. Entry-level signals, seniority, experience requirements, location and skills add or subtract heuristic scoring points. The 0–100 value is not a probability of selection. The default `Early career` filter excludes senior/lead/head roles and descriptions with no detected experience requirement below four years. It includes junior, associate, internship, graduate, trainee, and unlabelled roles. Unlabelled roles are shown as `Unspecified`, not certified as junior. Exact level filters use title/provider labels; `--level All` explicitly disables the seniority filter. Some legitimate adjacent roles may be missed.

Remote country eligibility is checked conservatively when sources supply location restrictions. "Likely" does not mean guaranteed. Verify candidate country requirements before applying.

Search results are stored locally in `data/jobs.sqlite3`; previous application statuses are preserved during future searches. Export the CSV to back up your job list. Data and Python cache files are ignored by Git.

## Limits

- Public sources can be stale, geographically ambiguous, rate-limited, or temporarily unavailable. Failures are shown without discarding existing stored jobs.
- Local coverage is bounded by the latest RSS entries and configured employers. A zero-result search does not mean there are no vacancies in Nigeria.
- Recheck employer applications and location rules before submitting. The CLI never submits applications.
- Search manually once or twice daily, not continuously.
- Update `profile.py` to reflect skills you can demonstrate.

Documentation: [Himalayas](https://himalayas.app/api), [Jobicy](https://github.com/Jobicy/remote-jobs-api), [Remotive](https://remotive.com/remote-jobs/api), [Greenhouse](https://developers.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api).


## Career level, work arrangement, and contacts

Separate tracks include Frontend Engineering, Backend Engineering, Full Stack Engineering, Software Engineering, Data Science, and Data Analysis, alongside the existing tracks.

```bash
python main.py search --region "Nigeria + Remote"
python main.py search --region Lagos --track "Frontend Engineering" --level Junior
python main.py search --region Nigeria --track "Backend Engineering" --level Associate
python main.py search --region Nigeria --track "Full Stack Engineering" --work-mode On-site
python main.py search --track "Data Science" --level Internship
python main.py search --track "Data Analysis" --work-mode Hybrid
python main.py contacts 12
python main.py contacts 12 --fetch
```

`Nigeria` and `Lagos` select local roles; `Remote` selects remote opportunities open or potentially open to Nigerian candidates. Work arrangements are `On-site`, `Hybrid`, `Remote`, or `Unspecified`. The feed often omits an arrangement; local location alone does not prove physical attendance. Use the default `--work-mode All` to retain these unlabelled local roles. `On-site` and `Hybrid` filters return explicitly identified arrangements only.

The `contacts` command uses the saved ID printed beside a result. Without `--fetch`, it shows contacts already found in the listing description. With `--fetch`, it reads a supported public job-board listing and its public redirects, checks the page title against the saved job title and company, then stores any published application emails with their source URL, excerpt, and discovery time. Requests are bounded and do not follow redirects to arbitrary hosts. A title/company mismatch blocks attaching contacts, since feeds or redirects can point to changed listings.

Contact details are **published application contacts**, not verified personal recruiter identities or verified deliverable email addresses. Addresses are never guessed; unrelated support/privacy emails and job-board publisher emails are excluded. Some listings only provide an application form, omit email addresses, or hide them from automated access. The command reports when no email was found. It sends no email and submits no application. JSON contact metadata is included in CSV exports.

Existing SQLite databases receive additive columns for descriptions, levels, arrangements, and contacts. Existing statuses and previously fetched contact details survive refreshed results. Copy `data/jobs.sqlite3` while the CLI is closed for a complete database backup; CSV is an export, not a built-in restore format.

## Project preferences

See `PROJECT_NOTES.md` for the approved webapp direction and the current CLI priorities. The website now includes matching local-job, career-level, work-arrangement, and public application-email features.


## Web application

The `web/` folder adds a responsive browser dashboard while preserving the Python CLI. The approved green-and-cream design is retained.

- Search MyJobMag, Moniepoint and Yassir local/employer feeds alongside Himalayas, Jobicy and Remotive, with profile-based matching, Nigeria eligibility checks and visible source failures.
- Filter by keyword, career track, career level, work arrangement and Nigeria/Lagos/Remote; sort by match, date or company.
- Open a job and click **Check listing for email** to fetch published application contacts with source evidence. Only supported public job-board hosts are fetched, redirects are checked, and title/company mismatches block contact attachment. Some listings provide only application forms.
- Shortlist jobs, track applications and interviews, save notes, and add manually discovered vacancies.
- Download CSV reports and JSON backups; restore merges missing jobs without overwriting existing records.
- Tracking is saved **only in this browser on this device**. Clearing site data removes it; JSON backups transfer it between devices. The web tracker and CLI SQLite database do not synchronize.
- MyJobMag covers its latest 100 entries across all fields. Employer feeds vary. Additional local-board links remain search pages, not verified vacancies.

### Run locally (Node.js 22+)

```bash
node web/build.mjs
node web/dev.mjs
```

Open http://localhost:4173. No npm install is required for building or running locally.

### Checks

```bash
node --test web/tests/*.test.mjs
```

### Deploy on your own Cloudflare account

```bash
cd web
node build.mjs
npx wrangler deploy
```

Wrangler uses `web/wrangler.jsonc`. The app needs no API keys or database bindings. Restrict access with Cloudflare Access if you want a private deployment. The ChatGPT-hosted edition is private to its owner.

### Update matching settings

Edit `web/config.json` to change career-track keywords, demonstrable skills, or verified Greenhouse/Lever board tokens. This is the web deployment's configuration snapshot; changes to Python `profile.py` or root `boards.json` are not automatically synchronized. Rebuild and redeploy after changes.

The web runtime implements the CLI's matching approach in JavaScript for Cloudflare Workers. Results are fetched server-side with 12-second per-source timeouts and an approximately five-minute in-memory cache per isolate. Cached feed availability can vary. Listings are not guaranteed to remain open, and remote eligibility still requires checking the original employer listing. Public sources can rate-limit or fail; stored tracking data is retained.


### Host the website from GitHub on Cloudflare Workers

Use **Workers**, since live jobs and contact lookup require server-side code. This is not a static-only Pages or Netlify upload.

Connect `Bakareferanmi/Nigeria-job` in Cloudflare Workers & Pages, choose **Create application → Import a repository**, and use:

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Root directory | `web` |
| Build command | `node build.mjs` |
| Deploy command | `npx wrangler deploy` |
| Wrangler configuration | `web/wrangler.jsonc` |
| API keys / database bindings | None required |

Cloudflare may ask you to choose a unique Worker name; change `name` in `web/wrangler.jsonc` if needed. For command-line deployment, open a terminal in `web`, run `node build.mjs`, then `npx wrangler deploy` and complete Cloudflare's sign-in flow.

Source: [Cloudflare Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/).

The independently hosted version uses the access rules you configure in your Cloudflare account. Tracking stays in each visitor's browser; it does not sync across devices or with the Python SQLite database. Use JSON backups to move website tracking data. The website's API reads public job listings and does not send applications or emails.


## Website, product and EdTech support roles; industry focus

New career tracks:
- **Website Administration**: Website Administrator, Webmaster, CMS Assistant, Web Content Officer, WordPress Administrator and related titles.
- **Product Support**: Product Support Associate, Application Support, Software Support, Platform Support and related titles.
- **EdTech Support**: EdTech Support Assistant, LMS Administrator, Learning Platform Support, CBT Support and related titles. Loan-management LMS roles are not treated as education roles merely because they use the same abbreviation.

The website and CLI now offer nine industry focuses: Education & EdTech; Healthcare & HealthTech; Logistics & Supply Chain; Manufacturing & Industrial Services; Energy & Utilities; Agriculture & Food Processing; Property & Facilities; Insurance & Pensions; Nonprofit & Development.

Industry focuses are keyword clues from the source industry field, job title, company and the first 1,800 description characters. They are **not verified employer classifications**, can overlap, and can miss employers described differently. Common insurance/pension benefit and qualification phrases are excluded from description matching. `All` retains unclassified jobs. Existing source coverage remains bounded; adding a focus does not add a new employer feed or establish that a vacancy is open. Board discovery links combine role and sector terms to broaden manual searches.

Use the website's **Career track**, **Industry focus**, **Location** and **Work arrangement** controls together. Keep Location at `Nigeria + Remote` to cover both, or choose `Nigeria`/`Lagos` for local roles. On-site/Hybrid filters require an explicit arrangement; many local listings are Unspecified.

```bash
python main.py search --track "Website Administration" --industry "Healthcare & HealthTech"
python main.py search --track "Product Support" --region Remote --industry "Logistics & Supply Chain"
python main.py search --track "EdTech Support" --region Nigeria --industry "Education & EdTech"
```

CLI searches store industry clues in additive SQLite fields and include them in CSV exports. Website backups/CSV preserve industry information, and older browser records receive keyword clues when configuration loads. Edit `industry_focus.json` for CLI sector keywords and keep the `industries` snapshot in `web/config.json` aligned when changing them.
