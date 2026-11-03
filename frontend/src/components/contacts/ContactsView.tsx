"use client"

import { useState } from "react"

import { GlassPanel } from "@/components/ui/GlassPanel"
import { useCurrentCity } from "@/context/CurrentCityContext"
import { EMERGENCY_CONTACTS, type Contact } from "@/data/emergency-contacts"
import { NCR_CITIES } from "@/data/evacuation-centers"
import { useSupabaseList } from "@/hooks/useSupabaseList"
import { fetchContacts } from "@/lib/places-api"
import { matchCity } from "@/lib/ncr-city-match"
import { telHref } from "@/lib/phone"

const MUTED = { color: "var(--glass-text-muted)" }

const NATIONAL_EMERGENCY = "National Emergency Hotline"

/** The local hotline groups, in the order they are shown, with the heading of each. */
const LOCAL_GROUPS = [
  { category: "Local - City Rescue", title: "Rescue and disaster office" },
  { category: "Local - Fire", title: "Fire station" },
]

/** The most useful national hotlines in a flood come first. Anything not listed goes last. */
const NATIONAL_ORDER = ["Disaster", "Weather", "Medical / Disaster", "Roads / Rescue", "Fire", "Police", "Maritime", "Women and Children (VAWC)"]

type AgencyGroup = { agency: string; category: string; contacts: Contact[] }

/** Put the contacts of one agency together, in the order the agencies first appear. */
function groupByAgency(contacts: Contact[]): AgencyGroup[] {
  const groups = new Map<string, AgencyGroup>()
  for (const contact of contacts) {
    const group = groups.get(contact.agency) ?? { agency: contact.agency, category: contact.category, contacts: [] }
    group.contacts.push(contact)
    groups.set(contact.agency, group)
  }
  return [...groups.values()]
}

/** One number with what it is for. A plain number is a tap-to-call link; anything else is shown exactly as written. */
function NumberLine({ contact }: { contact: Contact }) {
  const href = telHref(contact.number)
  const description = [contact.type, contact.notes].filter(Boolean).join(" · ")

  return (
    <li className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <span className="text-sm" style={MUTED}>
        {description}
      </span>
      {href ? (
        <a href={href} className="inline-flex min-h-11 items-center rounded-full border border-current px-4 text-base font-semibold tabular-nums">
          <span className="sr-only">Call </span>
          {contact.number}
        </a>
      ) : (
        <span className="inline-flex min-h-11 flex-col justify-center text-base font-semibold tabular-nums">
          {contact.number}
          <span className="text-xs font-normal" style={MUTED}>
            Shown as written. Not tap-to-call.
          </span>
        </span>
      )}
    </li>
  )
}

/** A card for one agency and all of its numbers. */
function AgencyCard({ group, showCategory = true }: { group: AgencyGroup; showCategory?: boolean }) {
  return (
    <GlassPanel className="p-4">
      <h3 className="text-base font-semibold">{group.agency}</h3>
      {showCategory && (
        <p className="text-sm" style={MUTED}>
          {group.category}
        </p>
      )}
      <ul className="mt-2 flex flex-col">
        {group.contacts.map((contact) => (
          <NumberLine key={`${contact.type}-${contact.number}`} contact={contact} />
        ))}
      </ul>
    </GlassPanel>
  )
}

/**
 * Emergency contacts: 911 first, then the hotlines for one city, then national agencies and hospitals.
 * The numbers come from Supabase (GET /places/contacts), copied from corpus/ph_emergency_contacts.csv. If the backend
 * cannot be reached, the built-in copy of that list is shown (see scripts/export_frontend_data.py).
 * They are shown exactly as written; only a plain number is made tap-to-call.
 */
export function ContactsView() {
  const { city: dashboardCity } = useCurrentCity()
  // Starts on the city the dashboard is about (Manila City unless the user shares a location); the user can pick another.
  const [chosenCity, setChosenCity] = useState<string | null>(null)
  const city = chosenCity ?? matchCity(dashboardCity.name) ?? NCR_CITIES[0]

  const contacts = useSupabaseList(EMERGENCY_CONTACTS, fetchContacts) // from Supabase, the built-in list until it arrives

  const emergency = contacts.find((contact) => contact.agency === NATIONAL_EMERGENCY)
  const emergencyHref = emergency ? telHref(emergency.number) : null

  const localHere = contacts.filter((contact) => contact.cities.includes(city))
  const hospitals = groupByAgency(contacts.filter((contact) => contact.category === "Local - Hospital"))
  const national = groupByAgency(
    contacts.filter(
      (contact) => contact.cities.length === 0 && contact.category !== "Local - Hospital" && contact.agency !== NATIONAL_EMERGENCY
    )
  ).sort((a, b) => {
    const rank = (group: AgencyGroup) => (NATIONAL_ORDER.includes(group.category) ? NATIONAL_ORDER.indexOf(group.category) : NATIONAL_ORDER.length)
    return rank(a) - rank(b)
  })

  return (
    <div className="flex flex-col gap-4">
      <GlassPanel className="p-5">
        <h1 className="text-xl font-semibold">Emergency contacts</h1>
        <p className="text-base" style={MUTED}>
          Hotlines for floods and other emergencies in Metro Manila. Tap a number to call.
        </p>
      </GlassPanel>

      {/* 911 comes first and is the largest thing on the page. */}
      {emergency && (
        <section aria-labelledby="call-911" className="rounded-[22px] bg-[#b91c1c] p-5 text-white shadow-lg [text-shadow:none]">
          <h2 id="call-911" className="text-xl font-semibold">
            In danger? Call {emergency.number}
          </h2>
          <p className="mt-1 text-base">
            {emergency.agency}: {emergency.notes || "one number for police, fire and medical help"}.
          </p>
          {emergencyHref && (
            <a
              href={emergencyHref}
              className="mt-3 inline-flex min-h-14 items-center justify-center rounded-full bg-white px-8 text-xl font-bold text-[#b91c1c] [text-shadow:none]"
            >
              <span className="sr-only">Call </span>
              {emergency.number}
            </a>
          )}
        </section>
      )}

      {/* Local numbers for one city. */}
      <GlassPanel className="p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Local numbers</h2>
            <p className="text-sm" style={MUTED}>
              The rescue office and fire station of a city.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            City
            <select
              value={city}
              onChange={(event) => setChosenCity(event.target.value)}
              className="min-h-11 rounded-full border border-current bg-transparent px-4 text-base [&>option]:bg-white [&>option]:text-slate-900"
            >
              {NCR_CITIES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {localHere.length === 0 ? (
          <p className="mt-4 text-base">
            No local numbers are listed for {city}. Use the national numbers below, or call 911.
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {LOCAL_GROUPS.map(({ category, title }) => {
              const groups = groupByAgency(localHere.filter((contact) => contact.category === category))
              if (groups.length === 0) return null
              return (
                <section key={category} aria-label={`${title}, ${city}`} className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide" style={MUTED}>
                    {title}
                  </h3>
                  {groups.map((group) => (
                    <AgencyCard key={group.agency} group={group} showCategory={false} />
                  ))}
                </section>
              )
            })}
          </div>
        )}
      </GlassPanel>

      <section aria-labelledby="national-numbers">
        <h2 id="national-numbers" className="mb-3 px-1 text-lg font-semibold">
          National agencies
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {national.map((group) => (
            <AgencyCard key={group.agency} group={group} />
          ))}
        </div>
      </section>

      <section aria-labelledby="hospital-numbers">
        <h2 id="hospital-numbers" className="mb-1 px-1 text-lg font-semibold">
          Hospitals
        </h2>
        <p className="mb-3 px-1 text-sm" style={MUTED}>
          Major hospitals in Metro Manila. The list does not say which city each one is in.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {hospitals.map((group) => (
            <AgencyCard key={group.agency} group={group} showCategory={false} />
          ))}
        </div>
      </section>

      <GlassPanel className="p-5 text-sm">
        <p className="font-semibold">About these numbers</p>
        <p className="mt-1" style={MUTED}>
          They are copied exactly from the project&apos;s hotline list, and the list has no &quot;last checked&quot; date, so a number may
          have changed. A number shown without a call button is a range or an instruction (for example &quot;8882-4151 to 77&quot;), so it
          is shown as written. In an emergency, call 911 first.
        </p>
      </GlassPanel>
    </div>
  )
}
