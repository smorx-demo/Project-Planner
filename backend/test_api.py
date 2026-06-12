"""
API test script — prints PASS/FAIL for 10 endpoint tests.
Run from backend directory:  python test_api.py
Requires: pip install requests
"""

import sys
import json
import requests

BASE = "http://localhost:8000/api/v1"
EMAIL = "admin@ingenious.com"
PASSWORD = "Admin@123"

PASS = "\033[92mPASS\033[0m"
FAIL = "\033[91mFAIL\033[0m"

results = []


def check(label: str, cond: bool, detail: str = ""):
    tag = PASS if cond else FAIL
    msg = f"  {tag}  {label}"
    if not cond and detail:
        msg += f"\n       {detail}"
    print(msg)
    results.append(cond)


# ── 1. Login ──────────────────────────────────────────────────────────────────
print("\n[1] POST /auth/login")
r = requests.post(f"{BASE}/auth/login", json={"email": EMAIL, "password": PASSWORD})
ok_login = r.status_code == 200 and r.json().get("success") is True
check("status 200 + success=true", ok_login, f"status={r.status_code} body={r.text[:200]}")
token = r.json().get("data", {}).get("access_token", "") if ok_login else ""
check("access_token present", bool(token))

if not token:
    print("\nCannot continue without a token. Is the server running?")
    sys.exit(1)

HEADERS = {"Authorization": f"Bearer {token}"}

# ── 2. GET /me ────────────────────────────────────────────────────────────────
print("\n[2] GET /auth/me")
r = requests.get(f"{BASE}/auth/me", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
me = r.json().get("data", {})
check("returns user name", bool(me.get("name")), str(me))

# ── 3. List projects ──────────────────────────────────────────────────────────
print("\n[3] GET /projects/")
r = requests.get(f"{BASE}/projects/", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
projects = r.json().get("data", [])
check("at least 1 project", len(projects) >= 1, f"got {len(projects)}")

project_id = projects[0]["id"] if projects else None

# ── 4. Project detail ─────────────────────────────────────────────────────────
print("\n[4] GET /projects/{id}")
r = requests.get(f"{BASE}/projects/{project_id}", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
project = r.json().get("data", {})
check("project has name", bool(project.get("name")), str(project))

# ── 5. Activity list with computed_status ─────────────────────────────────────
print("\n[5] GET /activities/project/{id} — with computed_status")
r = requests.get(f"{BASE}/activities/project/{project_id}", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
activities = r.json().get("data", [])
check("14 activities seeded", len(activities) == 14, f"got {len(activities)}")
check(
    "computed_status in each activity",
    all("computed_status" in a for a in activities),
    str(activities[0]) if activities else "",
)

activity_id = activities[0]["id"] if activities else None

# ── 6. Project status summary ─────────────────────────────────────────────────
print("\n[6] GET /projects/{id}/status")
r = requests.get(f"{BASE}/projects/{project_id}/status", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
summary_resp = r.json().get("data", {})
summary = summary_resp.get("summary", {})
check("summary.total == 14", summary.get("total") == 14, f"summary={summary}")
check("overall_status present", bool(summary.get("overall_status")), str(summary))

# ── 7. Persons list ───────────────────────────────────────────────────────────
print("\n[7] GET /persons/")
r = requests.get(f"{BASE}/persons/", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
persons = r.json().get("data", [])
check("at least 10 persons seeded", len(persons) >= 10, f"got {len(persons)}")

person_id = persons[0]["id"] if persons else None

# ── 8. Person activities ──────────────────────────────────────────────────────
print("\n[8] GET /persons/{id}/activities")
r = requests.get(f"{BASE}/persons/{person_id}/activities", headers=HEADERS)
check("status 200", r.status_code == 200, r.text[:200])
p_activities = r.json().get("data", [])
check("returns list (possibly empty)", isinstance(p_activities, list), r.text[:200])

# ── 9. Update activity actual_end_col ─────────────────────────────────────────
print("\n[9] PATCH /activities/{id} — update actual_end_col")
r = requests.patch(
    f"{BASE}/activities/{activity_id}",
    headers=HEADERS,
    json={"actual_end_col": 12},
)
check("status 200", r.status_code == 200, r.text[:200])
updated = r.json().get("data", {})
check("actual_end_col == 12", updated.get("actual_end_col") == 12, str(updated))
check("computed_status recomputed", "computed_status" in updated, str(updated))

# ── 10. POST assignment with conflict check ───────────────────────────────────
print("\n[10] POST /assignments/ — conflict check")

# Find a person NOT already assigned to activity 0
assigned_person_ids = {a["person_id"] for a in activities[0].get("assignments", [])}
free_person = next((p for p in persons if p["id"] not in assigned_person_ids), None)

if free_person:
    r = requests.post(
        f"{BASE}/assignments/",
        headers=HEADERS,
        json={
            "activity_id": activity_id,
            "person_id": free_person["id"],
            "role": "MEMBER",
        },
    )
    check("status 201", r.status_code == 201, r.text[:200])
    assign_data = r.json().get("data", {})
    check("assignment id returned", bool(assign_data.get("id")), str(assign_data))

    # Duplicate should 400
    r2 = requests.post(
        f"{BASE}/assignments/",
        headers=HEADERS,
        json={
            "activity_id": activity_id,
            "person_id": free_person["id"],
            "role": "MEMBER",
        },
    )
    check("duplicate returns 400", r2.status_code == 400, f"got {r2.status_code}: {r2.text[:200]}")
else:
    check("found free person for assignment test", False, "all persons already assigned")
    check("duplicate returns 400", False, "skipped")

# ── Summary ───────────────────────────────────────────────────────────────────
total = len(results)
passed = sum(results)
print(f"\n{'-'*50}")
print(f"Results: {passed}/{total} passed")
if passed == total:
    print(f"\033[92mAll tests passed!\033[0m")
else:
    print(f"\033[91m{total - passed} test(s) failed.\033[0m")
    sys.exit(1)
