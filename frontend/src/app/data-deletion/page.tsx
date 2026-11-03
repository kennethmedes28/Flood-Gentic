import type { Metadata } from "next"
import Link from "next/link"

import { LegalPage } from "@/components/legal/LegalPage"
import { ACCESS_REQUEST_SUBJECT, CONTACT_EMAIL, DELETION_REQUEST_SUBJECT, mailtoLink } from "@/lib/contact"

export const metadata: Metadata = {
  title: "Data deletion · Flood-Gentic",
  description: "How to ask Flood-Gentic to delete your data, and how to ask for access.",
}

/** How to have data deleted, which Facebook and Google ask for before an app can be public. */
export default function DataDeletionPage() {
  return (
    <LegalPage title="Data deletion and access requests" updated="3 November 2026">
      <p>
        This page explains how to have your Flood-Gentic data deleted. What we hold about you and why is in the{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Ask us to delete your data</h2>
      <ol className="flex list-decimal flex-col gap-1.5 pl-5">
        <li>
          Send an email to <a href={mailtoLink(DELETION_REQUEST_SUBJECT)}>{CONTACT_EMAIL}</a> with the subject &quot;{DELETION_REQUEST_SUBJECT}&quot;.
        </li>
        <li>
          Write from the email address of the Google or Facebook account you signed in with, and say which one it was. If your Facebook account has no email,
          tell us the name on the account. We use this to be sure the request is yours; we may reply with a question.
        </li>
        <li>We delete your account and confirm by email, within 30 days.</li>
      </ol>

      <h2>What gets deleted</h2>
      <ul>
        <li>Your account: name, email and the provider account ID, and so your ability to sign in.</li>
        <li>Your usage counts.</li>
      </ul>

      <h2>What needs a little more from you</h2>
      <ul>
        <li>
          <strong>Conversations.</strong> They are saved under a random conversation ID that is not linked to your account, so we cannot find yours by
          your name. If you want specific messages removed, send us the text and roughly when you wrote it, and we will delete the conversation.
        </li>
        <li>
          <strong>Flood reports and help requests.</strong> They are not tied to an account either. Tell us the place, the details and roughly when you sent it, and
          we will delete it.
        </li>
      </ul>

      <h2>Stop sign-in access yourself</h2>
      <p>
        You can also remove Flood-Gentic from your account&apos;s connected apps: in Facebook under Settings, Apps and Websites, and in Google under
        Security, Third-party access. This stops sign-in but does not delete what we already hold, so please also send us the request above.
      </p>

      <h2>Request access</h2>
      <p>
        To be allowed to sign in with Google or Facebook while the sign-in apps are still limited to approved accounts, or to ask for access to the project&apos;s
        Supabase data or dashboard, write to <a href={mailtoLink(ACCESS_REQUEST_SUBJECT)}>{CONTACT_EMAIL}</a> with the subject &quot;{ACCESS_REQUEST_SUBJECT}&quot;, the
        sign-in provider and the email on that account, and what you need access for.
      </p>
    </LegalPage>
  )
}
