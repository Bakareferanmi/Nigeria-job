# JobHunter: Nigeria + remote jobs

Browser dashboard and Python CLI for discovering and tracking engineering, data, supply chain, IT, networking, telecoms, software, product, and operations opportunities.

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

Nigerian vacancies: configured employer Greenhouse and Lever read-only public job board APIs. Add verified employer board tokens to `boards.json`:

```json
{"greenhouse": [], "lever": []}
```

Only add tokens confirmed from real employer career pages (e.g. `boards.greenhouse.io/<token>` or `jobs.lever.co/<token>`). Without configured boards, Nigerian results are **search-page discovery links**, not verified individual vacancies. Jobberman and LinkedIn are not scraped.

## How matching works

Role families are inferred from job **titles**. Entry-level signals, seniority, experience requirements, location and skills add or subtract heuristic scoring points. The 0–100 value is not a probability of selection. High-seniority titles are excluded. Some legitimate adjacent roles may be missed.

Remote country eligibility is checked conservatively when sources supply location restrictions. "Likely" does not mean guaranteed. Verify candidate country requirements before applying.

Search results are stored locally in `data/jobs.sqlite3`; previous application statuses are preserved during future searches. Export the CSV to back up your job list. Data and Python cache files are ignored by Git.

## Limits

- Public sources can be stale, geographically ambiguous, rate-limited, or temporarily unavailable. Failures are shown without discarding existing stored jobs.
- Local coverage requires configuring actual employers' public ATS feeds.
- Recheck employer applications and location rules before submitting. The CLI never submits applications.
- Search manually once or twice daily, not continuously.
- Update `profile.py` to reflect skills you can demonstrate.

Documentation: [Himalayas](https://himalayas.app/api), [Jobicy](https://github.com/Jobicy/remote-jobs-api), [Remotive](https://remotive.com/remote-jobs/api), [Greenhouse](https://developers.greenhouse.io/job-board.html), [Lever](https://github.com/lever/postings-api).


## Web application

The `web/` folder adds a responsive browser dashboard while preserving the Python CLI.

- Search live remote sources with profile-based matching, Nigeria eligibility checks, and visible source failures.
- Filter by keyword, career track and Nigeria/Lagos/Remote; sort by match, date or company.
- Shortlist jobs, track applications and interviews, save notes, and add manually discovered vacancies.
- Download CSV reports and JSON backups; restore merges missing jobs without overwriting existing records.
- Tracking is saved **only in this browser on this device**. Clearing site data removes it; JSON backups transfer it between devices. The web tracker and CLI SQLite database do not synchronize.
- Local employer feeds remain empty until verified ATS board tokens are added. Local board links are search pages, not verified vacancies.

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
