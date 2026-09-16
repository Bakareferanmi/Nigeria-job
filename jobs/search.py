SEARCH_TERMS = {

    "Electrical Engineering": [
        "Electrical Engineer",
        "Electrical Engineering Graduate",
        "Graduate Electrical Engineer",
        "Junior Electrical Engineer",
        "Electrical Engineering Intern",
        "Maintenance Engineer",
        "Electrical Maintenance Engineer",
        "Field Engineer",
        "Project Engineer",
        "Engineering Technician"
    ],

    "Data Analysis": [
        "Data Analyst",
        "Junior Data Analyst",
        "Data Analyst Intern",
        "Data Associate",
        "Reporting Analyst",
        "Business Intelligence Analyst",
        "BI Analyst",
        "MIS Analyst",
        "Data Operations Analyst",
        "Data Assistant",
        "Reporting Assistant"
    ],

    "Data Science": [
        "Junior Data Scientist",
        "Data Science Intern",
        "Data Science Graduate",
        "Junior Data Analyst",
        "Machine Learning Intern",
        "Data Associate"
    ],

    "Supply Chain": [
        "Supply Chain Analyst",
        "Junior Supply Chain Analyst",
        "Supply Chain Assistant",
        "Supply Chain Intern",
        "Procurement Assistant",
        "Procurement Analyst",
        "Procurement Officer",
        "Logistics Coordinator",
        "Logistics Assistant",
        "Inventory Analyst",
        "Inventory Assistant",
        "Operations Analyst",
        "Demand Planning Assistant",
        "Warehouse Analyst"
    ],

    "IT Support": [
        "IT Support",
        "IT Support Specialist",
        "IT Support Technician",
        "IT Technician",
        "Technical Support",
        "Technical Support Specialist",
        "Help Desk Technician",
        "Help Desk Support",
        "IT Administrator",
        "IT Support Intern",
        "IT Support Graduate"
    ],

    "Networking": [
        "Network Engineer",
        "Junior Network Engineer",
        "Network Support Engineer",
        "Network Technician",
        "NOC Analyst",
        "NOC Engineer",
        "Network Support",
        "Network Administrator",
        "Network Engineer Intern"
    ],

    "Telecommunications": [
        "Telecommunications Engineer",
        "Telecom Engineer",
        "Telecoms Engineer",
        "Telecom Engineer Intern",
        "RF Engineer",
        "Transmission Engineer",
        "NOC Engineer",
        "Field Engineer",
        "Telecom Technician",
        "Network Engineer"
    ],

    "Frontend Engineering": [
        "Frontend Developer",
        "Frontend Engineer",
        "Junior Frontend Developer",
        "Junior Frontend Engineer",
        "Frontend Developer Intern",
        "React Developer",
        "Junior React Developer",
        "Web Developer",
        "Junior Web Developer",
        "JavaScript Developer"
    ],

    "Software Engineering": [
        "Software Engineer",
        "Junior Software Engineer",
        "Software Developer",
        "Junior Software Developer",
        "Software Engineer Intern",
        "Graduate Software Engineer",
        "Web Developer",
        "Full Stack Developer",
        "Junior Full Stack Developer",
        "Backend Developer"
    ],

    "Product Management": [
        "Product Analyst",
        "Product Associate",
        "Associate Product Manager",
        "Junior Product Manager",
        "Product Management Intern",
        "Technical Product Manager",
        "Product Operations Analyst"
    ],

    "Business Analysis": [
        "Business Analyst",
        "Junior Business Analyst",
        "Business Analyst Intern",
        "Business Intelligence Analyst",
        "Business Operations Analyst",
        "Technical Business Analyst"
    ],

    "Operations": [
        "Operations Analyst",
        "Operations Associate",
        "Operations Assistant",
        "Operations Intern",
        "Business Operations Analyst",
        "Technical Operations",
        "Operations Coordinator"
    ]
}


def get_search_terms(track):
    return SEARCH_TERMS.get(track, [])


def get_all_search_terms():
    terms = []

    for track_terms in SEARCH_TERMS.values():
        terms.extend(track_terms)

    return sorted(set(terms))
