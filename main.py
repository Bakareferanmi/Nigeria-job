from profile import PROFILE
from jobs.search import get_search_terms


def show_banner():
    print()
    print("=" * 50)
    print("                 JOBHUNTER")
    print("          Nigerian + Remote Jobs")
    print("=" * 50)
    print()


def show_menu():
    print("1. Search jobs")
    print("2. My career tracks")
    print("3. My skills")
    print("4. My profile")
    print("5. Exit")
    print()


def show_career_tracks():
    print("\nYOUR CAREER TRACKS")
    print("-" * 30)

    for number, track in enumerate(PROFILE["career_tracks"], 1):
        print(f"{number}. {track}")

    print()


def show_skills():
    print("\nYOUR SKILLS")
    print("-" * 30)

    for skill in PROFILE["skills"]:
        print(f"• {skill}")

    print()


def show_profile():
    print("\nYOUR PROFILE")
    print("-" * 30)

    print(f"Name: {PROFILE['name']}")
    print(f"Education: {PROFILE['education'][0]}")

    print("\nExperience level:")

    for level in PROFILE["experience_level"]:
        print(f"• {level}")

    print("\nLocations:")

    for location in PROFILE["locations"]:
        print(f"• {location}")

    print()


def choose_location():
    print("\nWHERE DO YOU WANT TO SEARCH?")
    print("-" * 35)
    print("1. Nigeria")
    print("2. Lagos")
    print("3. Remote")
    print("4. Nigeria + Remote")

    choice = input("\nChoose an option: ").strip()

    locations = {
        "1": "Nigeria",
        "2": "Lagos",
        "3": "Remote",
        "4": "Nigeria + Remote"
    }

    return locations.get(choice)


def choose_career_track():
    print("\nSELECT CAREER TRACK")
    print("-" * 30)

    print("0. All career tracks")

    for number, track in enumerate(PROFILE["career_tracks"], 1):
        print(f"{number}. {track}")

    choice = input("\nChoose an option: ").strip()

    if choice == "0":
        return "All"

    try:
        number = int(choice)

        if 1 <= number <= len(PROFILE["career_tracks"]):
            return PROFILE["career_tracks"][number - 1]

    except ValueError:
        pass

    return None


def search_jobs():
    location = choose_location()

    if not location:
        print("\nInvalid location.")
        return

    track = choose_career_track()

    if not track:
        print("\nInvalid career track.")
        return

    print("\n" + "=" * 50)
    print("SEARCH CONFIGURATION")
    print("=" * 50)

    print(f"Location: {location}")
    print(f"Career track: {track}")

    if track == "All":
        print("\nSearch terms:")

        all_terms = []

        for career in PROFILE["career_tracks"]:
            all_terms.extend(get_search_terms(career))

        for term in sorted(set(all_terms)):
            print(f"• {term}")

        print(f"\nTotal search terms: {len(set(all_terms))}")

    else:
        terms = get_search_terms(track)

        print("\nSearch terms:")

        for term in terms:
            print(f"• {term}")

        print(f"\nTotal search terms: {len(terms)}")

    print("\nLive job searching will be connected next.")


def main():
    show_banner()

    while True:
        show_menu()

        choice = input("Choose an option: ").strip()

        if choice == "1":
            search_jobs()

        elif choice == "2":
            show_career_tracks()

        elif choice == "3":
            show_skills()

        elif choice == "4":
            show_profile()

        elif choice == "5":
            print("\nGoodbye.")
            break

        else:
            print("\nInvalid option. Choose 1-5.\n")


if __name__ == "__main__":
    main()
