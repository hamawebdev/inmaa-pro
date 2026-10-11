---
title: "Inmaa system: software scan and build notes"
subtitle: For the developer, not for the client
date: 10 October 2026
lang: en
toc-title: Contents
---

## Bottom line {#bottom-line}

No existing product fits Inmaa well enough to replace a custom build. Three findings decide it:

- **Payment:** USD-billed SaaS is impractical for an Algerian company. Service imports need bank domiciliation, and payments to foreign providers carry 30% withholding.
- **Data:** storing client and worker data abroad, including worker locations, needs ANPDP authorisation, which points to hosting in Algeria.
- **Localisation:** only Odoo handles Arabic, French, DZD and the Algerian chart of accounts. It needs Enterprise licences, Studio and a local partner, and its field app is view-only offline.

If you would rather configure than build, Odoo is the only candidate. Budget for licences, a partner, a stamp-duty add-on, and a custom offline field app anyway.

The custom build borrows proven patterns:

- Swept and Otuvy: geofenced attendance, site inspections, automatic corrective tasks.
- Jobber and ServiceM8: quote follow-ups and recurring visits.
- MaidCentral and Swept: budgeted vs actual hours per contract.
- Janitorial Manager: QR checkpoints in buildings.

Two stopgaps if the client wants something running before the build:

- **Facturili:** Algerian, billed in DZD, hosted in Algeria; issues compliant invoices.
- **Connecteam's free plan (up to 10 users):** clock-in and checklists. It stores worker locations abroad, so settle the ANPDP question first.

For your cost estimate: UpGrowth in Algiers advertises custom management software from 1,000,000 DA excluding VAT for a first module.

## Products compared {#products}

None of the 25 products in five groups fits well. I judged fit against three needs: Arabic and French with Algerian invoicing and payment methods; contract and building workflows (inspections, recurring visits, proof of presence); and a cost that suits 5–10 workers. Prices are list prices seen on 10 October 2026. Capterra, G2 and GetApp blocked automated access, so the independent signals are App Store ratings.

### Cleaning-specific software

::: {.fit}
| Product | What it does well | Fit | Why, for Inmaa | Price |
|----------|--------------------|----|------------------|----------|
| [ZenMaid](https://get.zenmaid.com/pricing) | Recurring home-cleaning schedules; embeddable instant-booking form; automated SMS/email reminders and "on my way" texts; GPS clock-in, before/after photos, checklists (Pro). | Poor | Homes only: no contracts, inspections or building workflow. English only; card payments through Stripe or Square, neither of which serves Algeria. | $19 / $39 / $49 a month per account (Starter capped at 40 appointments); SMS extra |
| [MaidCentral](https://www.maidcentral.com/pricing) | Master schedule by skills and zones; customer scorecards scored 0–100; payroll and performance-pay reports; batch invoicing; customer portal; multi-location KPIs. | Poor | Residential only, US payment processor, no inspections or contracts; per-job pricing grows with every recurring visit. | $1.50 per completed job (vendor example: $450 a month for 300 jobs) + onboarding fee |
| [BookingKoala](https://www.bookingkoala.com/pricing) and [Automaid](https://automaidsoftware.com/pricing) (formerly Launch27) | Booking forms with instant prices by rooms, hours or package; live availability; recurring bookings; customer accounts to rebook and rate; referrals and gift cards. | Poor | A booking front-end, not an operations system. Arabic and French only on BookingKoala Premium through Google Translate, RTL undocumented; DZD unconfirmed; card processors unavailable in Algeria. | BookingKoala $27 / $57 / $197 a month (5 / 15 / 50 providers); Automaid $75 / $150 / $299 |
| [Swept](https://www.sweptworks.com/pricing) | Geofenced clock-in with late and no-show alerts; per-site instructions and access notes; inspections with timestamped photos, offline sync and PDF/link reports; auto-translated checklists; supply requests; client portal; profit and travel-time reports. | Partial | Closest operational match for offices and buildings. But no quotes, invoices, payments or CRM; app in English, Spanish and Portuguese only; inspections need the $150 plan; app rated 2.7★ with crash complaints. | From $30 / $150 / $225 a month by number of sites (entry band up to 15); 20% off yearly |
| [Janitorial Manager](https://www.janitorialmanager.com/plans-pricing/) | Scan4Clean QR codes (tasks for staff, "last cleaned" and a survey for occupants); work loading and bidding; job costing per customer; free client portal; equipment tracking; geofenced clock-in, kiosk, offline NFC. | Poor | Sold to North America (its quote form lists only US states and Canadian provinces), no Arabic, no invoicing of its own, and the entry price is far above a 10-worker budget. | From $1,000 a month |
| [WinTeam](https://teamsoftware.com/winteam) (Team Software, owned by WorkWave) | Janitorial ERP: payroll, receivables and payables, job profitability; GPS, biometric and kiosk time clock; staff and client portals (eHub); Lighthouse QR/NFC/beacon checkpoints and inspections with signature. | Poor | Enterprise system for large North-American contractors, with North-American payroll; quote-only pricing and a steep learning curve. | Not published (SelectHub estimate: from $100–500) |
| [Otuvy](https://www.otuvy.com/pricing) (formerly CleanTelligent; not a Team Software product) | Inspections with custom scales, weighting, photos and e-signature; failed items create work orders automatically; branded client reports and portal; QR forms; frontline task lists with photo proof. | Poor | A quality add-on only, in English; useful as the pattern for plan feature 17, not as a system. | QM Inspect $150 a month (5 users), QM Pro $250; Frontline $50 + $7 per user |
:::

### General field-service software

::: {.fit}
| Product | What it does well | Fit | Why, for Inmaa | Price |
|----------|--------------------|----|------------------|----------|
| [Jobber](https://www.getjobber.com/pricing/) | Request, quote, job, invoice in one flow; automated quote follow-ups; optional line items and deposits; recurring visits; batch invoicing and reminders; client hub; online booking; route optimisation; checklists with photos; review requests. | Poor | The best quote-to-cash flow in the scan, built for North America: English (Spanish for staff), no Arabic or French, currency falls back to $, and card payments, SMS and tips work only in the US, Canada and UK. | Core $29–49, Connect $99–399, Grow $149–499, Plus $399–699 a month; extra users $29 |
| [Housecall Pro](https://www.housecallpro.com/pricing/) | Online booking around the clock; customer portal; recurring cleans; photo reports; checklists; signatures before and after the job, printed on the invoice; price book. | Poor | North American, English and Spanish only; route optimisation and service plans only in the top plan; phone features US and Canada only. | Basic $59, Essentials $149, Max $299 a month (annual), + $35 per extra user |
| [ServiceM8](https://www.servicem8.com/pricing) | Online booking with instant quote and deposit; up to five follow-ups on quotes and invoices; recurring jobs; automatic check-in on arrival; GPS shift history; mandatory job forms output as PDF; works offline on synced jobs. | Poor | English only. Pricing caps jobs per month, so daily contract visits get expensive: about 900 visits a month needs the $349 plan. | Free (30 jobs), $29 (50), $79 (150), $149 (500), $349 (1,500+) a month; unlimited users |
| [Zoho FSM](https://www.zoho.com/fsm/pricing.html) | Request, estimate, work order, appointment; maintenance plans for periodic visits; dispatch Gantt with live location; assignment by skills, availability and distance; service reports with client signature; WhatsApp notifications. | Partial | Arabic and French interface (RTL undocumented, statuses stay in English). Per-appointment pricing punishes daily visits; offline is mostly read-only; no client portal; DZD unconfirmed. | Free (30 appointments); $30 / $45 / $55 a month for 60 appointments; $290–590 at 1,000 |
| [Odoo](https://www.odoo.com/pricing) Field Service, Planning, Timesheets, Subscriptions | Sale creates the field task; Gantt and map planning; worksheets signed on the phone; timesheets feed the invoice; stock per worker; customer portal; leave-aware planning with planned vs actual hours; recurring contract invoices. Arabic (RTL), French and DZD are built in; [Algerian chart of accounts](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_dz/__manifest__.py) with VAT 19/9/0%; [8 partners in Algeria](https://www.odoo.com/partners/country/algeria-61). | Partial | The only off-the-shelf candidate. Catches: Field Service, Planning, Subscriptions, Studio and the mobile app are Enterprise-only; worksheet templates need Studio, which forces the Custom plan; offline is view-only; stamp duty needs a third-party app; a partner is needed to configure it. | Per user a month: Standard $8.95, Custom $16.40 (yearly, with first-year discounts); light field users $2.90. 3 office + 20 field users ≈ $98–107 a month before implementation |
| [ServiceTitan](https://www.servicetitan.com/pricing) | Enterprise platform for HVAC, plumbing and electrical trades. | Poor | No cleaning focus, US-centric; listed only as the upper bound. | Quote only |
:::

### Staff scheduling and attendance apps

::: {.fit}
| Product | What it does well | Fit | Why, for Inmaa | Price |
|----------|--------------------|----|------------------|----------|
| [Connecteam](https://connecteam.com/pricing/) | Geofenced clock-in, GPS trail and live map; recurring and open shifts; checklists with required before/after photos and GPS-stamped reports; chat; documents for e-signature; kiosk. | Partial | Free for up to 10 users, which matches launch size, and Arabic is listed (RTL unverified). But clock-in needs a connection, and it has no quotes, invoices, contracts or stock; billed in USD; geofencing from the Advanced plan. Could bridge the field side while the build is under way. | Free up to 10 users; $29 / $49 / $99 per hub a month for 30 users (yearly); extra users $0.5–5 |
| [Deputy](https://www.deputy.com/pricing) | Fills shifts by availability; replacement alerts; shift swaps; GPS clock-in with geofence; tablet kiosk with face check that works offline for 24 hours. | Poor | No Arabic; no photo proof or client reports; per-user price adds up (about $650 a month at 100 staff). | Lite $5, Core $6.50, Pro $9 per user a month |
:::

### Arabic and Algerian business software

::: {.fit}
| Product | What it does well | Fit | Why, for Inmaa | Price |
|----------|--------------------|----|------------------|----------|
| [Daftra](https://www.daftra.com/en/plans) | Arabic-first cloud ERP with a cleaning-company page: contract file per client, visit appointments with SMS/email reminders, client portal and self-booking, work orders with profit summary, attendance by location radius or selfie, payroll, low-stock alerts. | Partial | Arabic and English only (no French invoices); no Algerian tax or payroll setup; weak field execution (no checklists, photos or signatures on work orders). | $30 / $55 / $70 a month (Basic / Advanced / Premium) + $7–9.33 per extra user |
| [Facturili](https://facturili.com/tarifs) (Algeria) | Invoicing and SCF accounting hosted in Algeria; invoices per Decree 05-468; VAT 0/9/19%; stamp duty; pre-filled G50; recurring invoices; CIB, Edahabia and BaridiMob collection; French and Arabic with RTL. | Partial | No field operations. A candidate back-end for invoicing (plan feature 31) or export target (48), especially if certified billing software becomes mandatory. | 2,900 / 5,900 / 11,900 DZD a month |
| [Ratib RH](https://www.ratib-rh.com/) and [Talenteo](https://talenteo.com/en/conformite-rh-et-paie-algerie-2026-guide-complet/) (Algeria) | Payroll and HR under Algerian rules: IRG, CNAS, DAS/ATS/G29; leave and loans; fingerprint terminals; French and Arabic. | Partial | A payroll target for the hours export (feature 21) instead of building payroll (38). | Ratib: 15,000 / 40,000 / 99,000 DZD a year (up to 10 / 50 / 200 staff); Talenteo has a free tier |
| [Almawarid](https://almawarid.app/tarifs/) (Oran) | Payroll (CNAS/IRG), HR, bilingual contracts, invoicing and stock; offline on Android and desktop; accepts CIB, Edahabia, CCP and BaridiMob. | Partial | Broad back office, but no field-service workflow; its hosting claims contradict each other (Algeria vs "EU" storage). | On request (annual) |
| [PC Compta / PC Paie](https://dlg-net.com/tarifs.php) (DLG) | Desktop accounting and payroll that many Algerian accountants know. | Partial | Probably what an external accountant uses: an export format to match, not a system to adopt. | From 97,500 DA each; support 13,900 DA a year |
:::

### Consumer cleaning apps (what clients now expect)

::: {.fit}
| Product | What it does well | Fit | Why, for Inmaa | Price |
|----------|--------------------|----|------------------|----------|
| [Justlife](https://www.justlife.com/) (UAE, KSA), [Matic](https://www.propertyfinder.ae/blog/cleaning-app-dubai/) (UAE), [Darhna](https://apps.apple.com/mx/app/darhna/id6758579154) (Algeria) | Price shown before booking; booking in under a minute; pick a slot or same day; cash or card; cleaner ratings; the same cleaner each time; subscriptions; free rescheduling up to 24 hours ahead. | Benchmark only | Benchmarks for the online booking form (plan feature 45). Darhna is an early Algerian home-services marketplace: a possible channel or competitor for the homes division. | Matic from AED 29 an hour |
:::

## What the client's documents miss {#gaps}

The scan surfaced 27 capabilities the documents lack or only hint at. Nine became launch additions (plan features 25–33), three became mechanisms inside existing features, eleven sit in the "later" list, and four were left out on purpose. Feature numbers refer to the Arabic plan.

| Capability | Seen in | Where it landed |
|------------------|--------------------|----------|
| Worker file: availability, skills, documents, leave booked ahead | Deputy, Connecteam, Swept, MaidCentral, Odoo Planning, Daftra | Launch 25 (addition) |
| Location check at clock-in, late/no-show alert, SOS for lone workers | Swept, Jobber, ServiceM8, Connecteam, Deputy, Lighthouse; SOS in ZenMaid | Launch 27 (addition) |
| Field app that works offline and syncs later | Swept, ServiceM8, WinTeam, Janitorial Manager (NFC), Almawarid | Launch 28 (addition) |
| Map pin per site | ZenMaid, MaidCentral, Odoo | Launch 26 (addition) |
| Automatic follow-up on unanswered quotes | Jobber, ServiceM8 | Launch 29 (addition) |
| Budgeted vs actual hours and margin per contract | Swept, Janitorial Manager, WinTeam, MaidCentral, Daftra, Jobber, ServiceM8, Zoho FSM, Odoo | Launch 30 (addition) |
| Legally complete invoices: Decree 05-468 fields, VAT or IFU, stamp duty on cash | Facturili, Odoo Algerian localisation plus add-ons, PC Compta | Launch 31 (addition); Q16 |
| Receipts for cash taken in the field, reconciled daily | None of the foreign tools; reflects Algerian cash use | Launch 32 (addition, depends on Q18) |
| Access and change log; invoices voided, never deleted, kept for the legal retention period | Required by Law 25-11 and Decree 05-468 rather than seen in a product | Launch 33 (addition) |
| Clock-in from a shared device at the site | Deputy, WinTeam, Janitorial Manager, Connecteam | Mechanism inside launch 12 |
| Failed inspection creates a corrective task | Otuvy (automatic), Janitorial Manager, Swept, WinTeam | Mechanism inside launch 17 |
| Monthly contract invoices generated in one batch, with payment reminders | Jobber, Zoho FSM, Odoo Subscriptions, Facturili, Daftra | Mechanism inside launch 19–20 |
| Client portal | Jobber, Housecall Pro, ServiceM8, Odoo, Swept, Janitorial Manager, Otuvy, WinTeam eHub, Daftra, MaidCentral | Later 44 (addition); Q22 |
| Online booking with instant price | ZenMaid, BookingKoala, Automaid, Jobber, Housecall Pro, ServiceM8, Odoo; Justlife and Matic | Later 45 (addition) |
| Automated messages: reminders, "on my way", review requests | ZenMaid, BookingKoala, Jobber, Housecall Pro, ServiceM8, Zoho FSM (WhatsApp) | One-click at launch (16); automated later (42) |
| QR or NFC checkpoints per floor, plus feedback codes for occupants | Janitorial Manager, Team Lighthouse, Otuvy | Later 49 (addition) |
| Route optimisation and map dispatch | Jobber, Housecall Pro, ServiceM8, Zoho FSM, Odoo, Swept | Later 46 |
| Supply requests per site and equipment tracking | Swept, Janitorial Manager, WinTeam | Later 34–35 (stock itself is in the docs) |
| Payroll under Algerian rules (CNAS, IRG) | Ratib RH, PC Paie, Almawarid, Talenteo | Later 38; launch exports hours (21) |
| Recruiting and onboarding | BookingKoala Premium, Connecteam, Team Software | Later 37 |
| Accounting integration | Facturili, PC Compta, Odoo (the US tools use QuickBooks) | Later 48 |
| Several branches or wilayas | MaidCentral, Odoo | Later 47 (addition) |
| Card and QR payment (CIB, Edahabia, Baridi Pay) | Facturili, Almawarid; none of the foreign tools | Later 43; Q19 |
| Team chat | Connecteam, Deputy, Swept, Almawarid | Left out: WhatsApp already does this |
| Tips, gift cards, referral programmes | ZenMaid, BookingKoala, MaidCentral, Jobber | Left out; review requests folded into 42 |
| Auto-translated checklists | Swept, BookingKoala, Otuvy | Left out; interface language is Q21 |
| Fingerprint or face clock-in | Deputy, WinTeam, Daftra, Ratib RH | Left out: needs prior ANPDP authorisation |

## Algeria constraints that shape the build {#algeria}

Two of these rule out most foreign SaaS: paying for it as a company, and storing personal data abroad. The other four set hard requirements for the custom build. Confidence is the research's own rating of the primary text. Nothing here is legal advice; the client's accountant or lawyer should confirm before go-live.

| Constraint | Finding | Impact on the build | Confidence |
|--------|--------------------------|------------------|-------|
| Paying for foreign SaaS | A company pays foreign services only through bank domiciliation, with contract or invoice plus a certificate that the service was performed (Regulation 07-01, restated by the Bank of Algeria on 28 Jul 2026). No text lets companies pay subscriptions by card. Payments to foreign providers without a local establishment carry 30% withholding (Direct Taxes Code arts. 150, 156). The €750 travel allowance may not be used for subscriptions. | Every USD-billed product in the comparison is impractical for Inmaa as a company. Prefer services billed in DZD: hosting, SMS, payments. | High for the texts; medium for how they apply to SaaS |
| Personal data (Law 18-07 as amended by Law 25-11 of 24 Jul 2025) | Declare each processing to the ANPDP before starting (online; receipt within 48 hours). Appoint a data-protection officer, keep a register of processing and an automated log of operations (collection, consultation, change, disclosure, erasure) with reason, date, time and, where possible, who. Transfers abroad need ANPDP authorisation and an adequate destination; penalty 1–5 years and 500,000–1,000,000 DA. Biometric attendance needs prior authorisation (deliberation of 6 May 2026). | Host in Algeria unless the client obtains transfer authorisation. Build feature 33's log to the fields of art. 41 bis 3. No fingerprint or face clock-in. Record location only at check-in and check-out, never continuous tracking. Retention and deletion follow the declaration. | High for the texts; "storage abroad counts as a transfer" is an inference (medium) |
| Invoicing | Decree 05-468 sets mandatory fields: both parties' RC and NIS, payment method and due date, a sequential number, totals before and after tax, the total in words. Stamp and signature unless electronic; cancelled invoices stay, marked. Clients deducting VAT need your NIF, NIN and RC. Cleaning VAT is 19%; IFU businesses (natural persons up to 8M DA turnover; 12% on services) may not show VAT. Cash payment carries stamp duty: 1 DA per 100 DA from 300 to 30,000 DA, 1.5 DA up to 100,000, 2 DA above, minimum 5 DA. No e-invoicing mandate found. **Unverified:** the research read a 2027 rule in the turnover-tax code (art. 51 bis): software that records non-invoiced sales needs its publisher's commitment on tamper-proofing and archiving, with 6-year retention. A second check found no Algerian source, and the wording matches France's 2026 till-software rules. The Commercial Code (art. 12) is usually cited at 10 years for books and records. | Invoice template driven by Q16. Total in words in Arabic and French. Stamp-duty calculation on cash. Immutable sequential numbering; void, never delete. Design for tamper evidence (append-only ledger or hash chain) and 10-year retention anyway: cheap insurance whichever rule is right. Q16 now asks the accountant whether certified software is required. Also ask whether stamp duty is banded or applies to the whole amount. | High for Decree 05-468, VAT and stamp duty; the 19% rate for cleaning is an inference (medium–high); the 2027 rule and the retention period are unverified |
| Working time (Ordinance 97-03, Law 90-11) | 40 hours a week over at least 5 days; a working day spans at most 12 hours. Overtime is exceptional, at most 20% (about 8 hours a week), paid at least 50% extra. Weekly rest is normally Friday and can rotate; working it earns rest plus the premium. Night is 21:00–05:00, and women may not work nights without a labour-inspector derogation. Part-time is at least half of legal hours; leave is 2.5 days a month. | Capacity defaults: 40 hours, warn on overtime up to 48. Flag women scheduled between 21:00 and 05:00 (Q10). Rotate rest days for daily building contracts. Leave accrual matters only if payroll comes in-house (38). | High for the original texts; later amendments not checked |
| Online sales and card payments | Law 18-05: selling online requires an RC and a site hosted in Algeria under .com.dz; e-payments only through bank or Algérie Poste platforms. Payment providers need Bank of Algeria approval and must host in Algeria (Regulation 25-02). Chargily Pay: free up to 300 transactions or 300,000 DZD, then 1.5% (min 15, max 1,500 DZD) or higher tiers. Slick Pay 1.4–2%. Baridi Pay QR (since June 2025) needs a commercial CCP account. The 2026 Finance Law lets firms deduct e-payment fees from taxable profit until 31 Dec 2026. | Online booking (45) and card payment (43) need a .com.dz domain and Algerian hosting. Use a licensed aggregator, after checking that Chargily or Slick Pay holds the approval. A Baridi Pay QR on invoices is the cheapest option for households. | High for the laws; medium for provider fees; licence status unverified |
| Automated messages | WhatsApp Cloud API prices Algeria as "Rest of Africa": about $0.004 per utility template and $0.0225 per marketing template, plus reseller fees; replies inside the 24-hour window are free. Billing is in foreign currency. Twilio SMS costs $0.273 per segment; a named sender ID needs about 2 weeks of pre-registration, with no numeric sender and no two-way SMS. Local DZD SMS prices were not found. | Keep launch reminders as one-click WhatsApp links with prefilled text, which cost nothing (feature 16). Automate (42) only through a DZD-billed local SMS provider or once foreign billing is solved. | High for Meta and Twilio pages; Algerian eligibility for WhatsApp API unverified |

## Question to build decision {#questions}

Each of the 26 client questions settles at least one build decision, so a complete set of answers is enough to start building. Seven resolve contradictions between his documents, rather than me choosing. Feature numbers refer to the Arabic plan.

::: {.kind}
| Q | Kind | What the answer settles in the build | Features |
|--|------|---------------------------|-----|
| Q1 | Left open | Which division's registration, inspection and checklist templates ship first; the data model supports all three regardless. | 1, 3, 13 |
| Q2 | Left open | Where the launch/later line falls (supervisor dashboards, stock) and expected data volume; the study's phase 3 size is blank. Reserve model: fixed reserves (2 per 10 in the study) or one substitute per zone. | 9, 34, 36 |
| Q3 | Left open | Zone list and whether scheduling and replacement suggestions filter by zone from day one. | 8, 9 |
| Q4 | Missing from docs | Whether a spreadsheet import is in scope before go-live. | — |
| Q5 | Left open | Roles and the permission matrix; the study proposes five roles for a team that may be two or three people. | 23 |
| Q6 | Left open | Quote approval rule: always, above a discount or amount, or never; and the threshold. | 5 |
| Q7 | Left open | Worker app vs printed orders with proxy entry by supervisor or office; offline needs; icon-first UI if literacy is low. | 11–14, 27, 28 |
| Q8 | Left open | Mission orders and attendance per worker or per team; a team-leader role. | 11, 12 |
| Q9 | Left open | Travel time in scheduling, transport cost in pricing, vehicles as a resource later. | 4, 8, 46 |
| Q10 | Contradiction | Business calendar: Sat–Thu with Friday off (study) vs Fridays offered (organisations and buildings forms); fixed slots (the study gives 09:00–12:00 / 13:30–16:00 and elsewhere 08:00–12:00, afternoons from 14:00) vs free times; night-work flag for women. | 7, 8 |
| Q11 | Contradiction | Pay basis (monthly, daily, hourly, per task) and period (weekly or monthly, both in the study); weekly capacity (40–45 vs 40–48 h in the study), daily maximum (8 h "for example"), overtime threshold. | 8, 21, 38 |
| Q12 | Left open | Assignment constraints: same worker per contract, women only in homes, skills or machines. | 8, 9, 25 |
| Q13 | Contradiction | Package catalogue with fixed prices (study: building and office packages by visits and services, home packages by service type) vs four undefined levels (building inspection form) vs per-quote pricing only. | 4, 5 |
| Q14 | Contradiction | Pricing formula per division: direct cost plus margin (inspection forms) vs adding overhead, taxes and insurance (study) vs per visit, entrance, floor or m² (building form); phone quick-price rates. | 4, 30 |
| Q15 | Left open | Billing frequency (per service, weekly, monthly: all offered by the forms); monthly contracts fixed and prepaid (study) vs per actual visit; rules for missed visits and late client cancellations. | 6, 19 |
| Q16 | Missing from docs | Invoice tax logic (19% VAT vs IFU with no VAT) and whether certified invoicing or sales software is required (the unverified 2027 rule, asked of his accountant). | 31, 33 |
| Q17 | Left open | Extra documents for public and large clients (monthly service attestation, stamped acceptance) and long payment terms. | 19, 20 |
| Q18 | Left open | Cash taken in the field, receipts and daily reconciliation; deposits before large one-off jobs. | 20, 32 |
| Q19 | Left open | Card or QR payment integration at launch or later. | 43 |
| Q20 | Left open | On-device signature vs printed, stamped paper, for registration, quote acceptance and service sign-off. | 2, 5, 15 |
| Q21 | Missing from docs | Interface and document languages: Arabic, French or both (RTL and LTR, bilingual PDFs). | All |
| Q22 | Missing from docs | Client-facing pages at launch (confirm, rate, view invoices) vs office-only. | 15, 16, 44 |
| Q23 | Contradiction | Numbering prefixes (CL/CUS/CL-H, VIS/INS, QT/Q, CT/CTR/CON, W/EMP): a proposed default to confirm. One file pipeline and one job-status list for all divisions (the study's five colours vs the homes inspection form's list). | 2, 10, 24 |
| Q24 | Contradiction | What client class A–D means; letters vs names; one difficulty scale (4, 3 or 5 levels in the forms); one cleanliness scale (3 to 5 levels with different labels across forms). | 2, 3, 7 |
| Q25 | Contradiction | Inspection scoring (/100 with action below 80 vs five grades); supervisor visit frequency (weekly vs monthly in the study); complaint response target (2 h "for example"); client rating criteria (4 vs 5 plus "would you recommend"). | 15, 17, 18 |
| Q26 | Scope | Final launch scope: stock, in-house payroll, expenses and monthly profit. | 34, 38, 39 |
:::

## Coverage check {#coverage}

All nine client documents map to the plan, with nothing left unmapped. The Arabic appendix has 80 rows, each pointing to a launch feature, a later feature, a question or an out-of-scope row. A second, independent pass checked every form section against the plan. Its fixes are applied: requested service and frequency in feature 2; daily, weekly and monthly task lists in 13; a statement of visits with contract invoices in 19; worker role and gender in 25; additions inside document-sourced rows marked; and wider questions on price basis, billing frequency, reserves, signatures and inspection frequency. The documents are the study (1.md), the homes client file (2.md), and registration and inspection forms for homes (3.md, 4.md), organisations (5.md, 6.md) and buildings (7.md, 8.md), plus the buildings worker card (9.md).

- **Out of scope:** eight items from the documents: training content; uniforms, kit and PPE; chemical safety and work at height; marketing; bookkeeping and tax or social filings; contract and liability wording; financial projections; organisation design. The plan adds one legal step the documents never mention: the ANPDP declaration and data-protection officer.
- **Gaps in the documents themselves:**
    - There is no worker form at all, which is why addition 25 exists.
    - There is no mission order or checklist for the organisations division, and no formal quote, contract or invoice template for organisations or buildings. The plan uses shared templates per division (features 5, 6, 11, 13, 19).
    - The study's contents list has three headings with no section of their own: "mistakes to avoid", "forms and documents" (the forms came as separate files) and "accounts, wages and profitability" (wages are never detailed). Recruitment is also undescribed; features 25 and 37 cover it.
- **Truncations and leftovers:**
    - The study leaves its phase 3 headcount blank, and its final sentence is cut off mid-phrase.
    - The forms carry ChatGPT leftovers ("Écriture" headers, a stray "WOW Support Services +1" citation in 4.md). Nothing to build from them.
- **Data-model hints worth keeping:**
    - One client has many sites (CL plus SITE or BLD).
    - A building has entrances, and each entrance has floors; the worker card ticks floors off one by one.
    - A contract can be an initial deep clean followed by a recurring service.
    - Jobs can span several days (4.md) and have several workers with a team leader (9.md).
    - Contacts per site carry roles: who opens up, who signs, who receives invoices.
    - The homes file warns against storing alarm codes or passwords in access notes.
- **Wording in the Arabic plan:**
    - Features are «خاصية / خصائص», not «وظيفة», which reads as "job" in a staffing plan.
    - Scheduling is «الجدولة», not «البرمجة».
    - The client's company is «المركز», because «المؤسسات» is also the name of a division.
    - Keep these terms when you add the cost and timeline section.

## Files {#files}

- `plan/inmaa-system-plan-ar.pdf`: the Arabic plan for the client.
- `plan/software-scan-notes-en.pdf`: these notes.
- `plan/questions-form.gs`: a Google Apps Script that builds the 26 questions as a Google Form (79 answerable items on 8 pages, same س codes as the plan). Paste it into a new project at script.google.com, run `createQuestionsForm`, and take the links from the execution log.
- `plan/src/`: the sources. Edit `plan-ar.md` or `notes-en.md`, then run `./build.sh` (needs pandoc and Google Chrome). A comment in `plan-ar.md`, after the "later" section, marks where a cost and timeline section fits.

## Sources {#sources}

The research opened these pages on 10 October 2026. Capterra, G2, GetApp, Software Advice and TrustRadius refused automated access (HTTP 403), so none are cited.

::: {.sources}
**Products**

- Cleaning-specific: [ZenMaid pricing](https://get.zenmaid.com/pricing) · [MaidCentral pricing](https://www.maidcentral.com/pricing) · [BookingKoala pricing](https://www.bookingkoala.com/pricing) · [BookingKoala languages](https://help.bookingkoala.com/help/how-to-add-languages-and-translations) · [Automaid pricing](https://automaidsoftware.com/pricing) · [Swept pricing](https://www.sweptworks.com/pricing) · [Swept features](https://sweptworks.com/features) · [Janitorial Manager plans](https://www.janitorialmanager.com/plans-pricing/) · [WinTeam](https://teamsoftware.com/winteam) · [WorkWave acquires Team Software](https://teamsoftware.com/newsroom/workwave-acquires-team-software) · [SelectHub on WinTeam](https://www.selecthub.com/p/erp-software/winteam/) · [Otuvy pricing](https://www.otuvy.com/pricing)
- Field service: [Jobber pricing](https://www.getjobber.com/pricing/) · [Jobber features](https://www.getjobber.com/features/) · [Housecall Pro pricing](https://www.housecallpro.com/pricing/) · [ServiceM8 pricing](https://www.servicem8.com/pricing) · [ServiceM8 languages](https://support.servicem8.com/help-center/tips-trick-more/more/which-languages-are-supported) · [Zoho FSM pricing](https://www.zoho.com/fsm/pricing.html) · [Zoho FSM languages](https://help.zoho.com/portal/en/kb/fsm/getting-started/articles/languages-supported) · [Odoo pricing](https://www.odoo.com/pricing) · [Odoo editions](https://www.odoo.com/page/editions) · [Odoo Algeria localisation](https://raw.githubusercontent.com/odoo/odoo/18.0/addons/l10n_dz/__manifest__.py) · [Odoo partners in Algeria](https://www.odoo.com/partners/country/algeria-61) · [Odoo offline mode](https://www.odoo.com/documentation/saas-19.1/applications/general/offline_mode.html) · [ServiceTitan pricing](https://www.servicetitan.com/pricing)
- Staff apps: [Connecteam pricing](https://connecteam.com/pricing/) · [Connecteam offline clock](https://help.connecteam.com/en/articles/16287971-does-the-time-clock-support-offline-mode) · [Deputy pricing](https://www.deputy.com/pricing)
- Arabic and Algerian: [Daftra plans](https://www.daftra.com/en/plans) · [Facturili pricing](https://facturili.com/tarifs) · [Ratib RH](https://www.ratib-rh.com/) · [Talenteo payroll guide 2026](https://talenteo.com/en/conformite-rh-et-paie-algerie-2026-guide-complet/) · [Almawarid pricing](https://almawarid.app/tarifs/) · [DLG pricing](https://dlg-net.com/tarifs.php) · [UpGrowth custom software](https://www.upgrowth.dz/logiciel-gestion-entreprise-algerie)
- Consumer apps: [Justlife](https://www.justlife.com/) · [Matic, via Property Finder](https://www.propertyfinder.ae/blog/cleaning-app-dubai/) · [Darhna on the App Store](https://apps.apple.com/mx/app/darhna/id6758579154)

**Algerian law, tax and payments**

- Foreign currency: [Instruction 07-2026](https://www.bank-of-algeria.dz/stoodroa/2026/07/Instruction-N%C2%B007-2026-droit-de-change-du-13-07-2026.pdf) · [Regulation 07-01](https://www.bank-of-algeria.dz/stoodroa/2023/01/reglement200701.pdf) · [Bank of Algeria note, 28 Jul 2026](https://www.bank-of-algeria.dz/stoodroa/2026/07/Note-aux-banques-FR-du-28-07-2026.pdf) · [Direct Taxes Code 2026](https://www.mfdgi.gov.dz/files/803/2026/3726/CodedesImpotsDirectsetTaxesAssimilees2026fr)
- Personal data: [Law 18-07, consolidated by the ANPDP](https://anpdp.dz/ar/storage/2025/08/18-07-Edited.pdf) · [Law 25-11, Official Journal no. 48 of 2025](https://www.joradp.dz/FTP/jo-francais/2025/F2025048.pdf) · [Gide note, July 2026](https://www.gide.com/en/news-insights/protection-of-personal-data-focus-on-algerian-regulations/) · [ANPDP biometric attendance deliberation](https://digitalpolicyalert.org/event/41149-data-protection-authority-adopted-deliberation-on-biometric-fingerprint-attendance-systems)
- Invoicing and tax: [Executive Decree 05-468](https://www.commerce.gov.dz/fr/telecharger/reglementation/283/article) · [VAT guide](https://www.mfdgi.gov.dz/fr/professionnels/services-pro/regime-reel/la-taxe-sur-la-valeur-ajoutee) · [Turnover Taxes Code 2026](https://www.mfdgi.gov.dz/files/803/2026/3725/CodedesTaxessurle-Chiffred-Affaires2026fr) · [IFU regime](https://www.mfdgi.gov.dz/fr/professionnels/services-pro/regime-forfaitaire-unique/ifu) · [Finance Law 2026 summary](https://www.mfdgi.gov.dz/files/658/Communiques-de-loi-de-finances/3378/Communique-general-de-la-loi-de-finances-2026) · [Stamp Code 2026](https://www.mfdgi.gov.dz/files/803/2026/3724/CodedeTimbre2026fr)
- Working time: [Ordinance 97-03](https://www.joradp.dz/FTP/jo-francais/1997/F1997003.pdf) · [Law 90-11](https://www.joradp.dz/FTP/jo-francais/1990/F1990017.pdf)
- Online sales and payments: [Law 18-05](https://www.joradp.dz/FTP/jo-francais/2018/F2018028.pdf) · [Regulation 25-02](https://www.bank-of-algeria.dz/stoodroa/2025/05/Reglement-25-02-FR.pdf) · [Chargily fees](https://dev.chargily.com/pay-v2/fees) · [Slick Pay](https://www.slick-pay.com/) · [Baridi Pay launch](https://www.algerie360.com/algerie-poste-lance-baridi-pay-une-nouvelle-solution-paiement-mobile-par-qr-code/)
- Messaging: [WhatsApp Business pricing](https://developers.facebook.com/docs/whatsapp/pricing) · [Twilio SMS pricing, Algeria](https://www.twilio.com/en-us/sms/pricing/dz) · [Twilio SMS rules, Algeria](https://www.twilio.com/en-us/guidelines/dz/sms)
:::
