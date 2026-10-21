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

See `PROJECT_NOTES.md` for the approved webapp direction and the current CLI priorities. The CLI configuration changes in this update do not alter the separately hosted webapp.
