"""Evacuation centers and emergency contacts for the frontend pages, read from Supabase.

The rows are returned in the same shape the frontend's built-in lists use (``frontend/src/data/``), so the pages can
swap the built-in list for this answer without any other change.
"""

CENTERS_SQL = """
    SELECT city, barangay, name, type, status_in_source AS status, source,
           latitude AS lat, longitude AS lng, notes
    FROM evacuation_centers
    ORDER BY city, barangay, name
"""

CONTACTS_SQL = """
    SELECT agency, category, contact_type AS type, number, notes, cities
    FROM emergency_contacts
    ORDER BY position
"""


def read_evacuation_centers(conn) -> list[dict]:
    """All evacuation centers. ``id`` is city, barangay and name together, which the table keeps unique."""
    centers = []
    for row in conn.execute(CENTERS_SQL).fetchall():
        centers.append(
            {
                "id": f"{row['city']}|{row['barangay']}|{row['name']}",
                "city": row["city"],
                "barangay": row["barangay"],
                "name": row["name"],
                "type": row["type"] or "",
                "status": row["status"] or "",
                "source": row["source"] or "",
                "lat": row["lat"],
                "lng": row["lng"],
                "notes": row["notes"] or "",
            }
        )
    return centers


def read_emergency_contacts(conn) -> list[dict]:
    """All emergency contacts in the order of the list."""
    return [
        {
            "agency": row["agency"],
            "category": row["category"],
            "type": row["type"],
            "number": row["number"],
            "notes": row["notes"] or "",
            "cities": list(row["cities"] or []),
        }
        for row in conn.execute(CONTACTS_SQL).fetchall()
    ]
