"""JobHunter: interactive and scriptable Nigeria / remote job search."""
import argparse
from profile import PROFILE
from hunter import search, saved, set_status, export_csv, discovery, STATUSES, LEVELS, WORK_MODES, job_contacts

REGIONS = ("Nigeria", "Lagos", "Remote", "Nigeria + Remote")
TRACKS = PROFILE["career_tracks"]

def display(jobs, limit=30):
    if not jobs:
        print("No matching vacancies. Try another track, or configure company boards in boards.json.")
        return
    for i, job in enumerate(jobs[:limit], 1):
        identity = f" [ID {job['id']}]" if job.get("id") else ""
        print(f"\n{i}. {job['title']} | {job['company']}{identity}")
        print(f"   Score: {job['score']}/100 (heuristic) | {job['source']} | {job['location'] or 'Location unknown'}")
        if job.get("published"): print(f"   Date: {job['published']}")
        if job.get("salary"): print(f"   Salary: {job['salary']}")
        print(f"   Level: {job.get('level') or 'Unspecified'} | Work mode: {job.get('work_mode','Unspecified')}")
        eligibility = job.get('eligibility','unknown') if job['remote'] else 'Not a remote listing'
        print(f"   Remote eligibility: {eligibility} | Status: {job.get('status','new')}")
        print(f"   Apply: {job['url']}")
        contacts = job.get("contacts", [])
        if isinstance(contacts, str):
            import json
            contacts = json.loads(contacts)
        for contact in contacts:
            print(f"   Published application email: {contact['email']}")
            print(f"   Contact source: {contact['source_url']}")
        if not contacts and job.get("id"):
            print(f"   Check listing for contacts: python main.py contacts {job['id']} --fetch")
    print(f"\nShowing {min(len(jobs),limit)} of {len(jobs)} matches. Score is only a sorting estimate.")

def select(title, choices, default=1):
    print("\n" + title)
    for i, choice in enumerate(choices,1): print(f"{i}. {choice}")
    answer = input(f"Choose [{default}]: ").strip()
    if not answer: return choices[default-1]
    if answer.isdecimal() and 1 <= int(answer) <= len(choices):
        return choices[int(answer)-1]
    print("Invalid choice.")
    return None

def run_search(region,track,limit,level="Early career",mode="All"):
    print(f"\nSearching {region} / {track}")
    matches, errors = search(region,track,level,mode)
    print(f"\nMatched vacancies: {len(matches)}")
    for error in errors: print(f"Source warning: {error}")
    display(matches,limit)
    if region in ("Nigeria","Lagos","Nigeria + Remote"):
        print("\nExtra Nigerian discovery links (search pages, NOT verified job vacancies):")
        for source,url in discovery(track): print(f"  {source}: {url}")
        print("Nigerian vacancies: MyJobMag latest 100 feed entries + configured employer boards.")

def interactive():
    print("\n" + "="*48 + "\n     JOBHUNTER | Nigeria + Remote\n" + "="*48)
    while True:
        print("\n1. Search jobs  2. View saved jobs  3. Change application status")
        print("4. Export CSV   5. My career tracks  6. My profile  7. Exit  8. Published application contacts")
        cmd = input("Choose: ").strip()
        if cmd == "1":
            region = select("Location",REGIONS,4)
            track = select("Career track",["All"]+TRACKS)
            level = select("Career level",list(LEVELS))
            mode = select("Work arrangement",list(WORK_MODES))
            if region and track and level and mode: run_search(region,track,30,level,mode)
        elif cmd == "2": display(saved(),100)
        elif cmd == "3":
            try:
                job_id=int(input("Saved job ID: "))
                status=select("Status",list(STATUSES))
                if status: print("Updated." if set_status(job_id,status) else "Job ID not found.")
            except ValueError: print("Enter a numeric job ID.")
        elif cmd == "4": print(f"Export: {export_csv('jobhunter_export.csv') or 'No stored jobs'}")
        elif cmd == "5":
            for t in TRACKS: print(" - "+t)
        elif cmd == "6":
            for k,v in PROFILE.items(): print(f"{k}: {', '.join(v) if isinstance(v,list) else v}")
        elif cmd == "8":
            try:
                job_id = int(input("Saved job ID: "))
                fetch = input("Fetch the public listing for application emails? [y/N]: ").strip().lower() == "y"
                show_contacts(job_id,fetch)
            except ValueError as exc: print(str(exc))
        elif cmd == "7": break
        else: print("Choose 1-8.")

def show_contacts(job_id,fetch=False):
    import requests
    try:
        contacts = job_contacts(job_id,fetch)
    except (ValueError, requests.RequestException) as exc:
        print(f"Contact lookup failed: {exc}")
        return
    if not contacts:
        print("No published application email found. Use the original application link; no address has been guessed.")
    for contact in contacts:
        print(f"Email: {contact['email']}\nType: {contact['kind']}\nSource: {contact['source_url']}\nEvidence: {contact['evidence']}\n")


def main():
    parser = argparse.ArgumentParser(description="Personal job discovery and application tracker")
    sub = parser.add_subparsers(dest="command")
    s = sub.add_parser("search",help="Fetch live jobs")
    s.add_argument("--region",choices=REGIONS,default="Nigeria + Remote")
    s.add_argument("--track",choices=["All"]+TRACKS,default="All")
    s.add_argument("--limit",type=int,default=30)
    s.add_argument("--level",choices=LEVELS,default="Early career")
    s.add_argument("--work-mode",choices=WORK_MODES,default="All")
    contacts = sub.add_parser("contacts",help="Show published application emails for a saved job")
    contacts.add_argument("id",type=int)
    contacts.add_argument("--fetch",action="store_true",help="Read supported public listing for contact details")
    sub.add_parser("list",help="Show saved jobs with IDs")
    st = sub.add_parser("status",help="Update the application state of a saved job")
    st.add_argument("id",type=int)
    st.add_argument("value",choices=STATUSES)
    ex = sub.add_parser("export",help="Export tracked jobs")
    ex.add_argument("--file",default="jobhunter_export.csv")
    args=parser.parse_args()
    if args.command=="search": run_search(args.region,args.track,max(1,args.limit),args.level,args.work_mode)
    elif args.command=="contacts": show_contacts(args.id,args.fetch)
    elif args.command=="list": display(saved(),100)
    elif args.command=="status": print("Updated." if set_status(args.id,args.value) else "Job ID not found.")
    elif args.command=="export": print(export_csv(args.file) or "No stored jobs.")
    else: interactive()

if __name__=="__main__": main()
