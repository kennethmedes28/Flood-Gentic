import type { Metadata } from "next"
import Link from "next/link"

import { LegalPage } from "@/components/legal/LegalPage"
import { CONTACT_EMAIL, mailtoLink } from "@/lib/contact"

export const metadata: Metadata = {
  title: "Privacy policy · Flood-Gentic",
  description: "What Flood-Gentic collects, why, who it is shared with, and how to ask for your data to be deleted.",
}

/**
 * The privacy policy. It describes what the app really does (see backend/ and docs/): keep it in step with the code when
 * something that touches personal data changes.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="3 November 2026">
      <p>
        Flood-Gentic is a flood information assistant for Metro Manila, made for the Meta Global AI Hackathon 2026. It is a project, not
        a company or an official service. This page says what it collects, why, who else receives it, and how to have it deleted. For
        questions or requests, write to <a href={mailtoLink("Flood-Gentic privacy question")}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        <strong>Flood-Gentic is not an official warning service.</strong> For official warnings see pagasa.dost.gov.ph and ndrrmc.gov.ph.
        In an emergency, call 911 and your local DRRMO.
      </p>

      <h2>What you can use without an account</h2>
      <p>
        The dashboard, flood level, evacuation centers, emergency contacts and analytics pages need no sign-in. An emergency message typed
        into the assistant is answered without signing in too. Signing in is only required to chat with the assistant, check a photo or use
        voice, because those cost money to run.
      </p>

      <h2>What we collect, and why</h2>
      <ul>
        <li>
          <strong>Sign-in details.</strong> You sign in with Google or Facebook. We receive your name, your email address (a Facebook account made
          with a phone number may have none) and an account ID from the provider. We never see your password, and we do not post to your account,
          read your friends or ask for anything beyond your basic profile and email. This identifies your account and lets us apply usage limits.
        </li>
        <li>
          <strong>Usage counts.</strong> For each account we count messages, photo checks, voice sessions, the amount of text the chat model
          processed, and image-analysis requests, per day or month, to keep the service within its limits and budget.
        </li>
        <li>
          <strong>Messages.</strong> What you type or say to the assistant is sent to our server and to the AI model that writes the answer. The
          conversation is saved in our database under a random conversation ID so the assistant can remember the place and what it suggested. That ID is
          not linked to your account in our database.
        </li>
        <li>
          <strong>Photos.</strong> A photo you attach is sent to Meta&apos;s image and chat models to check for flood water, people and vehicles. Our server
          deletes the file as soon as the answer is ready. We keep only the numbers from the check (for up to 24 hours, so the same photo is not analysed twice),
          never the photo.
        </li>
        <li>
          <strong>Voice.</strong> Audio is streamed to Meta&apos;s speech-to-text service to turn it into text. We do not store the audio.
        </li>
        <li>
          <strong>Location.</strong> Only if you tap &quot;Use my location&quot; or write a place. It is used to find your city and the nearest centers. A
          place you type is sent to OpenStreetMap&apos;s Nominatim search to find its position; for routes, coordinates are sent to OpenRouteService. The
          place can also be saved inside the conversation record.
        </li>
        <li>
          <strong>Flood reports and help requests.</strong> If you submit one, we store what you write (place, details, an optional phone number) with the time.
          These are shown as unverified community information. Do not include anything you would not want kept.
        </li>
        <li>
          <strong>Technical data.</strong> Our hosting providers see your IP address and request details in their logs. We use the IP address only to limit how fast
          one visitor can send requests.
        </li>
        <li>
          <strong>In your browser.</strong> The sign-in session, and display choices such as text size, theme and whether to share your location, are kept in your
          browser&apos;s local storage. There are no advertising or analytics cookies and no trackers.
        </li>
      </ul>

      <h2>Who receives your data</h2>
      <p>We do not sell your data and do not use it for advertising. We use these services to run the app:</p>
      <ul>
        <li><strong>Supabase</strong>: sign-in and our database (account, usage counts, conversations, reports).</li>
        <li><strong>Railway</strong> and <strong>Vercel</strong>: they host the server and the website, and keep a short-lived cache.</li>
        <li><strong>Meta Platforms</strong>: its Muse models answer messages, check photos and transcribe voice; Facebook is also a sign-in option.</li>
        <li><strong>Google</strong>: a sign-in option.</li>
        <li><strong>OpenStreetMap (Nominatim)</strong> and <strong>OpenRouteService</strong>: place search and routes, as described above.</li>
        <li><strong>Tomorrow.io</strong> and <strong>Open-Meteo</strong>: weather and river data. We send them the fixed coordinates of Metro Manila cities, not your data.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li>Your account details and usage counts: until you ask us to delete them.</li>
        <li>Conversations, flood reports and help requests: we do not delete them automatically yet, so they stay until we delete them on request.</li>
        <li>Photos: removed from our server right after the answer. Photo measurements and weather data in the cache: expire within 24 hours.</li>
        <li>Audio: not stored.</li>
      </ul>

      <h2>Your choices</h2>
      <ul>
        <li>You can use the public pages without signing in, and you can decline to share your location.</li>
        <li>You can sign out at any time, and remove Flood-Gentic from your Google or Facebook connected apps.</li>
        <li>
          You can ask to see, correct or delete what we hold about you. See <Link href="/data-deletion">how to request deletion</Link>.
        </li>
      </ul>

      <h2>Children</h2>
      <p>Flood-Gentic is not meant for children under 13, and we do not knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If this changes, the date at the top changes too.</p>

      <h2>Contact</h2>
      <p>
        <a href={mailtoLink("Flood-Gentic privacy question")}>{CONTACT_EMAIL}</a>
      </p>
    </LegalPage>
  )
}
