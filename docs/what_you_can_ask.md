# What you can ask

Real prompts the agents answer today, with what you get back. Part of the [Flood-Gentic README](../README.md).

# What you can ask

Ask in English, Filipino or a mix. Name a place (a city, a barangay, a subdivision, or share your pin) and the answer
is built for it. These are real prompts the agents answer today.

## Find safety and shelter

| Ask | You get |
|---|---|
| `Where is the nearest evacuation center to Brgy. Nangka, Marikina?` | The 3 nearest centers that are not in a flooded area, with distance, direction and capacity |
| `Saan ang pinakamalapit na evacuation center sa Marikina?` | It asks once for your barangay, subdivision or pin so the distances are exact; reply with `Brgy. Nangka, Marikina` to get the list |
| `Hotline ng Pasig?` | National numbers plus your city's rescue and fire lines, copied exactly from the contacts file |

## Know what is coming

| Ask | You get |
|---|---|
| `Babaha ba sa Marikina ngayong gabi?` | A risk level (low, watch, high, critical) with the reasons: rain, river flow, soaked ground, PAGASA warnings |
| `How long will the flood last in Marikina?` | A plain statement that nobody can predict it, plus the next 24 hours of rain and any high tide |
| `Uulan ba bukas sa Quezon City?` | PAGASA bulletins and the Open-Meteo forecast, in a short answer |
| `Mag forecast ka ng 7 days` | A 7-day outlook |

## Prepare and understand the rules

| Ask | You get |
|---|---|
| `Ano ang dapat ihanda bago bumaha?` | Steps and checklists from the preparedness manual, with the sources listed under the answer |
| `What should I pack in a go-bag?` | What the manual lists, with its sources, plus a short list of general guidance clearly labelled as not from the official documents |
| `What is the process of relief goods?` | What the documents say, which documents they came from, and what they do not cover |

## Ask about a photo

Attach a photo (hover the round button beside the message box and choose **Photo**, or drag and drop one) and **ask anything about it**.

- **Find objects (segmentation).** Name what to look for, as in Meta's SAM playground: "human, child, car", "how many trees?", "find the dog", "ilan ang tao?". Each name is sent to SAM 3.1
  as its own request, and the answer says how many were found, where (left, middle, right) and how sure SAM is. Common Filipino names (tao, bata, kotse, bahay...) are put in English for SAM.
  Up to 5 names per message.
- **Any other question** ("What does the sign say?", "What is in this picture?") is answered by a model that looks at the picture. The answer comes from a model that looks at the picture. If your question is about flooding ("Can a car pass here?", "Hanggang saan ang baha?"), the answer is
followed by the automatic measurements: how much of the picture is covered by flood water and, if you tick the option, how many people and vehicles are in the water. A photo sent with no question gets
the flood check by default. It needs a sign-in, it is automatic and unverified, it never says a road is safe, and it does not identify people or read licence plates.

## Report and share

| Ask | You get |
|---|---|
| `I want to report a flooded street in Brgy. Nangka, Marikina` | Saved as an unverified community report; routes avoid the spot for a few hours (once the `reports` table exists) |

## In an emergency

`Water is up to my waist`, `Hanggang hita na ang baha`, `Trapped kami sa bubong`, `Tulong, nalulunod kami`.
The reply starts with the **911** text and local hotlines, with no model and no waiting. If the same message also asks
for something, it is answered right after:

> `Nasa Divisoria, Manila ako. Gusto kong mag-report ng baha hanggang baywang. Saan ako pwedeng pumunta na evacuation center at gaano katagal ang baha?`
>
> 911 and the Manila hotlines, then the report, the 3 nearest centers, and the "how long" answer, each under its own heading.

If no place is given, it asks for one right after the safety steps, and your next message (just `Marikina`) finishes the answer.

## Several questions in one message

`Mag forecast ka ng 7 days at kung bumaha hanggang tuhod, ano ang gagawin ko at saan ang evacuation center?` is cut into
a forecast, a preparedness answer and an evacuation-center question, each under its own heading. The forecast and the
preparedness answer come at once; if it does not know where you are, it asks, and your next message (`Brgy. Nangka, Marikina`)
finishes the centers.

## Outside Metro Manila

`Nasa Tanza, Cavite ako. May data ka ba ng baha?` gets a clear "not covered" reply with the national hotlines and
what to do, instead of a guess.

Most answers use fixed rules and no model, so they are fast, free per question, and the same every time.
Weather, preparedness and photo questions use a chat model; flood checks of photos also use the SAM vision model. While the assistant works,
the page shows what it is doing ("Checking rain, river flow and PAGASA for flood risk").
