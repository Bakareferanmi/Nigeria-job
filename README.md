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
