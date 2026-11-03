import { defineMessages } from "@/i18n/define"

/** Short texts of the legal page frame and of the dashboard disclaimer. The long legal pages carry both languages in their own files. */
export const legal = defineMessages(
  {
    "legal.lastUpdated": "Last updated {date}",
    "home.disclaimerTitle": "Disclaimer",
    "home.disclaimer":
      "The weather now and the forecast come from Tomorrow.io (fetched once a day). Rain, river flow and the risk level are from the latest recorded day, which is refreshed four times a day (today so far, until the day ends); the risk is a rule-based estimate from that day and does not use the forecast. PAGASA warnings are not included. Not an official flood warning: see pagasa.dost.gov.ph.",
    "ui.loading": "Loading",
  },
  {
    "legal.lastUpdated": "Huling na-update noong {date}",
    "home.disclaimerTitle": "Paalala",
    "home.disclaimer":
      "Ang panahon ngayon at ang hula ay galing sa Tomorrow.io (kinukuha minsan sa isang araw). Ang ulan, daloy ng ilog at antas ng panganib ay mula sa pinakahuling araw na naitala, na ina-update apat na beses sa isang araw (ang kasalukuyang araw, hanggang matapos ito); ang panganib ay pagtatantya batay sa mga patakaran mula sa araw na iyon at hindi gumagamit ng hula. Hindi kasama ang mga babala ng PAGASA. Hindi ito opisyal na babala sa baha: tingnan ang pagasa.dost.gov.ph.",
    "ui.loading": "Naglo-load",
  }
)
