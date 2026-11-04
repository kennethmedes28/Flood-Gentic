# How an answer is chosen

How a message is routed, where the data comes from and how locations are read. Part of the [Flood-Gentic README](../README.md).

# How an answer is chosen

Messages are routed by keywords (no model call), and an emergency always wins. A message with several requests
("report the flood, where is the nearest center, and how long will it last?") is cut into one question per topic, and
each topic is answered under its own heading. Before routing, the API checks the sign-in and the fair-use limits; an emergency skips both.

```mermaid
flowchart LR
    M[Message] --> S{Signed in and<br/>under the limits?}
    S -->|"no, but an emergency"| F[Fixed 911 reply + city hotlines]
    S -->|"no, anything else"| X["Sign-in prompt, or the limit and when it resets"]
    S -->|yes| R{Route by keywords}
    R -->|emergency| E[Fixed reply + hotlines, then the rest of the message]
    R -->|place outside Metro Manila| O[Not covered + national hotlines]
    R -->|evacuation, route, report, contacts, flood risk, how long| A[Rule-based agents]
    R -->|weather, preparedness| L[Agents with a chat model]
    R -->|photo| V[Flood media check]
    A --> D[(Supabase Postgres)]
    L --> D
```

**Where the data comes from, in order of trust:**

1. PAGASA bulletin. It counts as unreliable when it is empty, very short, a block page, or says it was issued more than 24 hours ago.
2. Backup sources, each read on its own: tide height, ground height, and the official sites (NDRRMC, Red Cross, DSWD).
3. A fixed safety answer, when too few readings are left to say anything responsible.

Locations are read from GPS coordinates, "Brgy. Name, City", or a place next to a city ("Okada, Parañaque").
If only the city is known, the answer says distances are from the city centre. A place that is a known barangay
(from the evacuation-center list) is saved as a barangay. A place outside Metro Manila (Cavite, Rizal, Bulacan, and so on)
gets the "not covered" reply.
