"""JobHunter: interactive and scriptable Nigeria / remote job search."""
import argparse
from profile import PROFILE
from hunter import search, saved, set_status, export_csv, discovery, STATUSES

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
        print(f"   Remote eligibility: {job.get('eligibility','unknown')} | Status: {job.get('status','new')}")
        print(f"   Apply: {job['url']}")
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

def run_search(region,track,limit):
    print(f"\nSearching {region} / {track}")
    matches, errors = search(region,track)
    print(f"\nMatched vacancies: {len(matches)}")
    for error in errors: print(f"Source warning: {error}")
    display(matches,limit)
    if region in ("Nigeria","Lagos","Nigeria + Remote"):
        print("\nExtra Nigerian discovery links (search pages, NOT verified job vacancies):")
        for source,url in discovery(track): print(f"  {source}: {url}")
        print("For direct Nigerian listings, add verified company ATS tokens in boards.json.")

def interactive():
    print("\n" + "="*48 + "\n     JOBHUNTER | Nigeria + Remote\n" + "="*48)
    while True:
        print("\n1. Search jobs  2. View saved jobs  3. Change application status")
        print("4. Export CSV   5. My career tracks  6. My profile  7. Exit")
        cmd = input("Choose: ").strip()
        if cmd == "1":
            region = select("Location",REGIONS,4)
            track = select("Career track",["All"]+TRACKS)
            if region and track: run_search(region,track,30)
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
        elif cmd == "7": break
        else: print("Choose 1-7.")

def main():
    parser = argparse.ArgumentParser(description="Personal job discovery and application tracker")
    sub = parser.add_subparsers(dest="command")
    s = sub.add_parser("search",help="Fetch live jobs")
    s.add_argument("--region",choices=REGIONS,default="Nigeria + Remote")
    s.add_argument("--track",choices=["All"]+TRACKS,default="All")
    s.add_argument("--limit",type=int,default=30)
    sub.add_parser("list",help="Show saved jobs with IDs")
    st = sub.add_parser("status",help="Update the application state of a saved job")
    st.add_argument("id",type=int)
    st.add_argument("value",choices=STATUSES)
    ex = sub.add_parser("export",help="Export tracked jobs")
    ex.add_argument("--file",default="jobhunter_export.csv")
    args=parser.parse_args()
    if args.command=="search": run_search(args.region,args.track,max(1,args.limit))
    elif args.command=="list": display(saved(),100)
    elif args.command=="status": print("Updated." if set_status(args.id,args.value) else "Job ID not found.")
    elif args.command=="export": print(export_csv(args.file) or "No stored jobs.")
    else: interactive()

if __name__=="__main__": main()
