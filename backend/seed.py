"""
Database seeder for manufacturing-planner.
Run: python seed.py
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.person import Person
from app.models.project import Project, ProjectStatus
from app.models.activity import Activity, ActivityStatusOverride
from app.models.assignment import Assignment, AssignmentRole
from app.services.auth_service import hash_password


async def seed() -> None:
    async with AsyncSessionLocal() as db:

        # ── 1. Users ──────────────────────────────────────────────────────────
        admin = User(
            name="Admin User",
            email="admin@ingenious.com",
            password_hash=hash_password("Admin@123"),
            role=UserRole.ADMIN,
        )
        ravi_user = User(
            name="Ravi Kumar",
            email="ravi@ingenious.com",
            password_hash=hash_password("Pass@123"),
            role=UserRole.MANAGER,
        )
        priya_user = User(
            name="Priya Sharma",
            email="priya@ingenious.com",
            password_hash=hash_password("Pass@123"),
            role=UserRole.OPERATOR,
        )
        suresh_user = User(
            name="Suresh Menon",
            email="suresh@ingenious.com",
            password_hash=hash_password("Pass@123"),
            role=UserRole.VIEWER,
        )
        for u in (admin, ravi_user, priya_user, suresh_user):
            db.add(u)
        await db.flush()

        # ── 2. Persons (shop-floor workers) ───────────────────────────────────
        persons_data = [
            ("EMP001", "Ravi Kumar",    "Engineering",       "Senior Engineer",       ["AutoCAD", "BOM", "DXF"]),
            ("EMP002", "Priya Sharma",  "QC",                "QC Lead",               ["Inspection", "PPAP", "FMEA"]),
            ("EMP003", "Amit Desai",    "Production",        "Production Supervisor", ["Planning", "Lean", "5S"]),
            ("EMP004", "Suresh Menon",  "Welding",           "Senior Welder",         ["MIG", "TIG", "Arc"]),
            ("EMP005", "Nila Rajan",    "Production",        "Operator",              ["Cutting", "Bending", "Punching"]),
            ("EMP006", "Kiran Babu",    "Machining",         "Machinist",             ["CNC", "VMC", "Turning"]),
            ("EMP007", "Meena Tiwari",  "QC",                "QC Inspector",          ["CMM", "Gauging", "Visual"]),
            ("EMP008", "Arjun Pillai",  "Procurement",       "Procurement Officer",   ["Sourcing", "Vendor", "Logistics"]),
            ("EMP009", "Divya Nair",    "Surface Treatment", "Painter",               ["Blasting", "Painting", "Powder Coat"]),
            ("EMP010", "Raj Patel",     "Dispatch",          "Logistics Coordinator", ["Packing", "Dispatch", "Documentation"]),
        ]
        persons: dict[str, Person] = {}
        for emp_id, name, dept, role, skills in persons_data:
            p = Person(
                employee_id=emp_id,
                name=name,
                department=dept,
                role=role,
                skills=skills,
            )
            db.add(p)
            persons[emp_id] = p
        await db.flush()

        # ── 3. Project ────────────────────────────────────────────────────────
        project = Project(
            name="Front Transportation Support Assembly LH",
            po_number="5100068763",
            part_number="109300009030",
            customer_name="TASL",
            product_description="Front Transportation Support Assembly LH",
            scope_of_supply="Blasted, Painted, Assembled, Packed",
            status=ProjectStatus.ACTIVE,
            created_by_id=admin.id,
        )
        db.add(project)
        await db.flush()

        # ── 4. Activities ─────────────────────────────────────────────────────
        # Columns: seq, name, group, ps, pe, actual_start, actual_end, status_override, remarks
        activities_data = [
            (1,  "Drawing Review, BOM, DXF & Process Sheet", "Engineering", 0,  10, 0,    10,   ActivityStatusOverride.DONE, "RM Cleared on 26/05/2026"),
            (2,  "Raw Material Procurement",                  "Procurement", 6,  20, 6,    26,   ActivityStatusOverride.DONE, None),
            (3,  "Raw Material Inspection & Testing",         "QC",          18, 26, 24,   31,   ActivityStatusOverride.DONE, "RM Cleared on 26/05/2026"),
            (4,  "Laser / Plasma Cutting + Operations",       "Production",  26, 29, 31,   None, None,                        None),
            (5,  "Inspection",                                "QC",          25, 29, 33,   None, None,                        None),
            (6,  "Templates & Min. Fixturing for Tackweld",   "Production",  24, 31, 32,   None, None,                        None),
            (7,  "Tack Welding & Inspection",                 "Welding",     30, 37, 35,   None, None,                        None),
            (8,  "Full Welding & Inspection",                 "Welding",     37, 43, None, None, None,                        None),
            (9,  "Dressing & Inspection",                     "Production",  41, 48, None, None, None,                        None),
            (10, "Machining & Inspection",                    "Machining",   45, 51, None, None, None,                        None),
            (11, "Final Customer Inspection",                 "QC",          50, 55, None, None, None,                        None),
            (12, "Sand Blasting, Painting & Inspection",      "Surface",     54, 58, None, None, None,                        None),
            (13, "Packing",                                   "Dispatch",    57, 61, None, None, None,                        None),
            (14, "Dispatch",                                  "Dispatch",    60, 63, None, None, None,                        None),
        ]
        activities: dict[int, Activity] = {}
        for seq, name, group, ps, pe, act_start, act_end, status_ov, remarks in activities_data:
            a = Activity(
                project_id=project.id,
                sequence_no=seq,
                name=name,
                group_type=group,
                plan_start_col=ps,
                plan_end_col=pe,
                actual_start_col=act_start,
                actual_end_col=act_end,
                status_override=status_ov,
                remarks=remarks,
            )
            db.add(a)
            activities[seq] = a
        await db.flush()

        # ── 5. Assignments ────────────────────────────────────────────────────
        assignments_spec = [
            (1,  [("EMP001", AssignmentRole.LEAD), ("EMP002", AssignmentRole.MEMBER)]),
            (2,  [("EMP008", AssignmentRole.LEAD)]),
            (3,  [("EMP002", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (4,  [("EMP003", AssignmentRole.LEAD), ("EMP005", AssignmentRole.MEMBER)]),
            (5,  [("EMP002", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (6,  [("EMP003", AssignmentRole.LEAD), ("EMP006", AssignmentRole.MEMBER)]),
            (7,  [("EMP004", AssignmentRole.LEAD), ("EMP002", AssignmentRole.MEMBER)]),
            (8,  [("EMP004", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (9,  [("EMP003", AssignmentRole.LEAD), ("EMP002", AssignmentRole.MEMBER)]),
            (10, [("EMP006", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (11, [("EMP002", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (12, [("EMP009", AssignmentRole.LEAD), ("EMP007", AssignmentRole.MEMBER)]),
            (13, [("EMP010", AssignmentRole.LEAD), ("EMP005", AssignmentRole.MEMBER)]),
            (14, [("EMP010", AssignmentRole.LEAD)]),
        ]
        total_assignments = 0
        for act_seq, person_roles in assignments_spec:
            for emp_id, role in person_roles:
                db.add(Assignment(
                    activity_id=activities[act_seq].id,
                    person_id=persons[emp_id].id,
                    role=role,
                ))
                total_assignments += 1

        await db.commit()

    print("Seeding complete.")
    print(f"  Users       : 4  (admin@ingenious.com / Admin@123)")
    print(f"  Persons     : {len(persons_data)}")
    print(f"  Projects    : 1  ({project.name})")
    print(f"  Activities  : {len(activities_data)}")
    print(f"  Assignments : {total_assignments}")


if __name__ == "__main__":
    asyncio.run(seed())
