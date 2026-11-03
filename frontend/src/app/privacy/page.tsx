import type { Metadata } from "next"
import Link from "next/link"

import { LegalPage } from "@/components/legal/LegalPage"
import { Localized } from "@/components/ui/Message"
import { CONTACT_EMAIL, mailtoLink } from "@/lib/contact"

export const metadata: Metadata = {
  title: "Privacy policy · Flood-Gentic",
  description: "What Flood-Gentic collects, why, who it is shared with, and how to ask for your data to be deleted.",
}

/**
 * The privacy policy, in English and Filipino (the Filipino text needs a native speaker's review, and a legal one). It describes what the app really does (see backend/ and docs/): keep it in step with the code when
 * something that touches personal data changes.
 */
export default function PrivacyPage() {
  return (
    <LegalPage title={{ en: "Privacy policy", fil: "Patakaran sa privacy" }} updated={{ en: "3 November 2026", fil: "3 Nobyembre 2026" }}>
      <Localized
        en={
          <>
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
          </>
        }
        fil={
          <>
      <p>
        Ang Flood-Gentic ay katulong na nagbibigay ng impormasyon tungkol sa baha sa Metro Manila, ginawa para sa Meta Global AI Hackathon 2026. Isa
        itong proyekto, hindi kumpanya o opisyal na serbisyo. Sinasabi ng pahinang ito kung ano ang kinokolekta nito, bakit, sino pa ang tumatanggap
        nito, at paano ipabubura ito. Para sa mga tanong o hiling, sumulat sa <a href={mailtoLink("Flood-Gentic privacy question")}>{CONTACT_EMAIL}</a>.
      </p>
      <p>
        <strong>Ang Flood-Gentic ay hindi opisyal na serbisyo ng babala.</strong> Para sa mga opisyal na babala, tingnan ang pagasa.dost.gov.ph at
        ndrrmc.gov.ph. Sa emergency, tumawag sa 911 at sa DRRMO ng lugar ninyo.
      </p>

      <h2>Ano ang magagamit nang walang account</h2>
      <p>
        Hindi kailangang mag-sign in para sa dashboard, antas ng baha, mga evacuation center, mga emergency contact at analytics. Sinasagot din nang
        walang sign-in ang mensaheng pang-emergency na itinype sa assistant. Kailangan lang mag-sign in para makipag-chat sa assistant, magpasuri ng
        larawan o gumamit ng boses, dahil may gastos ang mga ito.
      </p>

      <h2>Ano ang kinokolekta namin, at bakit</h2>
      <ul>
        <li>
          <strong>Detalye ng sign-in.</strong> Nagsa-sign in ka gamit ang Google o Facebook. Natatanggap namin ang pangalan mo, email address (maaaring
          wala nito ang Facebook account na ginawa gamit ang numero ng telepono) at account ID mula sa provider. Hindi namin nakikita ang password mo,
          hindi kami nagpo-post sa account mo, hindi namin binabasa ang mga kaibigan mo, at wala kaming hinihingi na higit sa basic profile at email mo.
          Ginagamit ito para makilala ang account mo at maipatupad ang mga limitasyon sa paggamit.
        </li>
        <li>
          <strong>Bilang ng paggamit.</strong> Para sa bawat account, binibilang namin ang mga mensahe, pagsusuri ng larawan, sesyon ng boses, dami ng
          tekstong pinroseso ng chat model, at mga hiling na pagsusuri ng larawan, bawat araw o buwan, para manatili ang serbisyo sa mga limitasyon at
          badyet nito.
        </li>
        <li>
          <strong>Mga mensahe.</strong> Ang itinype o sinabi mo sa assistant ay ipinapadala sa aming server at sa AI model na sumusulat ng sagot.
          Sine-save ang usapan sa aming database sa ilalim ng random na conversation ID para maalala ng assistant ang lugar at ang mga iminungkahi nito.
          Hindi naka-link ang ID na iyon sa account mo sa aming database.
        </li>
        <li>
          <strong>Mga larawan.</strong> Ang larawang ia-attach mo ay ipinapadala sa mga image at chat model ng Meta para suriin kung may tubig-baha, tao
          at sasakyan. Binubura ng aming server ang file pagkatapos maihanda ang sagot. Ang mga numero lang mula sa pagsusuri ang itinatago namin
          (hanggang 24 oras, para hindi na ulitin ang pagsusuri ng parehong larawan), hindi ang larawan.
        </li>
        <li>
          <strong>Boses.</strong> Ini-stream ang audio sa speech-to-text service ng Meta para gawing teksto. Hindi namin sine-save ang audio.
        </li>
        <li>
          <strong>Lokasyon.</strong> Kung pipindutin mo lang ang &quot;Gamitin ang lokasyon ko&quot; o magsusulat ka ng lugar. Ginagamit ito para mahanap ang
          lungsod mo at ang pinakamalapit na center. Ang lugar na itinype mo ay ipinapadala sa Nominatim search ng OpenStreetMap para mahanap ang posisyon
          nito; para sa mga ruta, ipinapadala ang mga coordinate sa OpenRouteService. Maaari ring ma-save ang lugar sa talaan ng usapan.
        </li>
        <li>
          <strong>Mga ulat ng baha at hiling ng tulong.</strong> Kung magsusumite ka ng isa, sine-save namin ang isinulat mo (lugar, detalye, at opsyonal na
          numero ng telepono) kasama ang oras. Ipinapakita ang mga ito bilang hindi pa na-verify na impormasyon mula sa komunidad. Huwag maglagay ng
          anumang ayaw mong maitago.
        </li>
        <li>
          <strong>Teknikal na datos.</strong> Nakikita ng aming mga hosting provider ang IP address mo at detalye ng request sa kanilang mga log. Ginagamit
          lang namin ang IP address para limitahan kung gaano kabilis makapagpadala ng request ang isang bisita.
        </li>
        <li>
          <strong>Sa browser mo.</strong> Ang sesyon ng sign-in, at mga napili sa display gaya ng laki ng teksto, tema, wika at kung ibabahagi ang lokasyon
          mo, ay nakatago sa local storage ng browser mo. Walang cookies para sa patalastas o analytics at walang tracker.
        </li>
      </ul>

      <h2>Sino ang tumatanggap ng datos mo</h2>
      <p>Hindi namin ibinebenta ang datos mo at hindi namin ito ginagamit para sa patalastas. Ginagamit namin ang mga serbisyong ito para patakbuhin ang app:</p>
      <ul>
        <li><strong>Supabase</strong>: sign-in at ang aming database (account, bilang ng paggamit, mga usapan, mga ulat).</li>
        <li><strong>Railway</strong> at <strong>Vercel</strong>: nagho-host ng server at ng website, at may panandaliang cache.</li>
        <li><strong>Meta Platforms</strong>: sinasagot ng mga Muse model nito ang mga mensahe, sinusuri ang mga larawan at isinasalin ang boses; opsyon din sa sign-in ang Facebook.</li>
        <li><strong>Google</strong>: opsyon sa sign-in.</li>
        <li><strong>OpenStreetMap (Nominatim)</strong> at <strong>OpenRouteService</strong>: paghahanap ng lugar at mga ruta, gaya ng inilarawan sa itaas.</li>
        <li><strong>Tomorrow.io</strong> at <strong>Open-Meteo</strong>: datos ng panahon at ilog. Ipinapadala namin sa kanila ang mga nakatakdang coordinate ng mga lungsod sa Metro Manila, hindi ang datos mo.</li>
      </ul>

      <h2>Gaano katagal namin itong itinatago</h2>
      <ul>
        <li>Detalye ng account mo at bilang ng paggamit: hanggang hilingin mong burahin namin ang mga ito.</li>
        <li>Mga usapan, ulat ng baha at hiling ng tulong: hindi pa namin awtomatikong binubura ang mga ito, kaya nananatili ang mga ito hanggang burahin namin kapag hiniling.</li>
        <li>Mga larawan: inaalis sa aming server pagkatapos ng sagot. Mga sukat ng larawan at datos ng panahon sa cache: nawawala sa loob ng 24 oras.</li>
        <li>Audio: hindi sine-save.</li>
      </ul>

      <h2>Mga pagpipilian mo</h2>
      <ul>
        <li>Magagamit mo ang mga pampublikong pahina nang hindi nagsa-sign in, at maaari mong tanggihang ibahagi ang lokasyon mo.</li>
        <li>Maaari kang mag-sign out anumang oras, at alisin ang Flood-Gentic sa mga konektadong app ng Google o Facebook mo.</li>
        <li>
          Maaari mong hilingin na makita, itama o burahin ang hawak namin tungkol sa iyo. Tingnan ang <Link href="/data-deletion">paano humiling ng pagbura</Link>.
        </li>
      </ul>

      <h2>Mga bata</h2>
      <p>Hindi para sa mga batang wala pang 13 taong gulang ang Flood-Gentic, at hindi kami sadyang nangongolekta ng datos nila.</p>

      <h2>Mga pagbabago</h2>
      <p>Kung magbabago ito, magbabago rin ang petsa sa itaas.</p>

      <h2>Makipag-ugnayan</h2>
      <p>
        <a href={mailtoLink("Flood-Gentic privacy question")}>{CONTACT_EMAIL}</a>
      </p>
          </>
        }
      />
    </LegalPage>
  )
}
