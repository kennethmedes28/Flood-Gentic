# Why Flood-Gentic matters

The problem in Metro Manila, why AI assistance helps, and who it is for. Part of the [Flood-Gentic README](../README.md).

# Why this matters

The Philippines has topped the [World Risk Index](https://abs-cbn.com/news/2024/9/12/philippines-is-world-s-riskiest-country-for-3rd-straight-year-1758)
for several years running, including the [latest 2026 report](https://tribune.net.ph/2026/09/24/philippines-again-tops-global-disaster-risk-ranking).
[PAGASA](https://www.pagasa.dost.gov.ph/climate/tropical-cyclone-information) counts about 20 tropical cyclones
entering the Philippine Area of Responsibility each year, and 8 or 9 of them cross the country, mostly from July to October.

Metro Manila is where this risk is most concentrated: a dense, low-lying city of millions beside Manila Bay and several
rivers. In 2009, Typhoon Ondoy (Ketsana) dropped about 455 mm of rain in 24 hours on Quezon City
([see the account](https://www.gmanetwork.com/news/topstories/nation/709435/looking-back-at-ondoy-s-onslaught-10-years-later/story/))
and flooded a large part of the metropolis. Heavy rain from storms is expected to become more intense as the climate warms,
and sea levels are rising, so the flood risk for a city like this is likely to grow, not shrink.

## Why AI assistance helps

During a flood the problem is rarely a lack of information. It is that the information is scattered, long, and hard
to use under stress: PAGASA bulletins, NDRRMC manuals, evacuation lists and hotlines sit on different sites and in
different formats. An assistant can:

- **Find the right answer fast.** It reads the bulletins and documents for the person and answers in a few lines, in English or Filipino.
- **Use their location.** It combines where they are with live rain, river flow, tide and the evacuation-center list, instead of giving generic advice.
- **Be there at any hour and for many people at once,** when hotlines are busy and officials are stretched.
- **Understand how people really write and speak.** Messages are short, mixed Tagalog and English, and urgent. Voice and flood photos are supported too.
- **Take routine questions off responders,** so their time goes to rescue and coordination.
- **Turn community reports into something usable,** such as a flooded street that routes then avoid.

AI does not stop a flood, and it is not an official warning system. Here it is a way to put official information in
front of people sooner and in plain words. That is why the design is cautious: most answers come from fixed rules
and verified sources, emergencies get a fixed 911 reply, and when the data is missing it says so instead of guessing.
A person, such as a barangay or DRRMO, makes the real decisions.

## Who it is for

| Who | How it helps | Status |
|---|---|---|
| A resident in a flooded area | Nearest safe evacuation center, hotlines, safety steps, and a route that avoids floodwater | Built |
| A family preparing before a storm | Flood risk for their area, the weather now and the forecast, river flow, and checklists from the preparedness manuals | Built |
| A neighbour who sees a flooded street | Report it, so routes avoid it | Built |
| Someone with a photo of flooding | Attach it in the assistant: it checks the picture for flood water, and can count people and vehicles | Built |
| Barangay and DRRMO staff | A live list of reports and supply requests, with verify, reject and assign | API built (`/staff`, shared key) |
