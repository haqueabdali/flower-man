# Flower Man — Italian funding and launch strategy

Prepared 23 November 2026 from the Flower Man codebase and public sources. Facts marked *(verify)* come from secondary sources and must be confirmed on the official page before you apply. Nothing here is legal or tax advice: confirm the company set-up with a *commercialista* (accountant) and a notary.

**Your situation (from your answers):** two or more founders resident in Lombardy, no company and no VAT number yet, little personal capital, looking for an investor.

---

## 1. What you actually have (Phase 1)

**The product.** Flower Man is a marketplace that lets customers in a city order from local florists and get the flowers delivered the same day by couriers. It has three apps on one API:

| App | Built and tested | Not yet done |
|---|---|---|
| Customer app (Expo, Android/iOS) | shop by location, product photos, cart, delivery slots, tips, discount codes, Stripe payment, live order status, delivery photo, reviews, custom bouquet requests with competing florist offers, favourites, occasion reminders, support tickets, Italian/English | not yet run on a real device |
| Partner app (florists, shops, couriers) | onboarding and verification, orders, products and stock, opening hours, offers on custom requests, courier jobs with background GPS during delivery, proof photo, earnings, monthly statements | not yet run on a real device |
| Admin panel (web) | sales dashboard, partner verification, orders and refunds, deliveries, reviews, discount codes, featured florists, payouts, zones, support inbox, audit log, GDPR requests | production hosting |

The API has 150 unit tests and 72 integration tests, and CI is green. About 18,800 lines of TypeScript and SQL.

**Stage:** technically ready for a pilot. Commercially at zero: no florists signed, no customers, no company, no live payments, no hosting. That gap matters more than any feature.

**Business model in the code.** The platform keeps a commission on the flowers (default 15%, configurable per zone). The delivery fee (default €5.90) and tips are passed in full to the courier. Discount codes are paid by the platform. Featured florist placement exists and could be sold.

**What is genuinely differentiating:**
- Florists keep their own catalogue and prices and get paid out by the platform. Relay networks like Interflora route orders between florists instead.
- Custom bouquet requests where several local florists compete with offers (with photos). I have not seen this in the Italian competitors I checked.
- Same-day delivery by the platform's own courier network, with live status, notifications and a doorstep photo.
- Built for compliance from day one: server-computed prices, Stripe webhooks, audit log, GDPR export and deletion.

**Honest weaknesses an evaluator will spot:**
1. **"Is it innovative?"** A delivery marketplace is a known business model. The technology is solid but not research-grade. This is the biggest risk for innovative-startup status and for Smart&Start, which scores technological innovation.
2. **Thin unit economics.** At a 15% commission on a €45 bouquet the platform earns about €6.75 per order before card fees, discounts and support. The model only reaches break-even at large volume (see §5).
3. **No traction yet.** Investors and Invitalia both weigh validation heavily.
4. **Founder profiles unknown.** Smart&Start and investors look closely at the team's skills and full-time commitment.
5. **Copyright ownership of the code.** The software was written with an AI coding assistant. Italian law (Legge 132/2025 on AI) protects AI-assisted works when they result from human creative work, so document the founders' design decisions and authorship before registering the software.

**Does it qualify as a *startup innovativa*?** It can, if you set it up deliberately. The rules (DL 179/2012 art. 25 as amended by Legge 193/2024) require all of these:
- a new *società di capitali* (SRL qualifies), not listed on a stock exchange, with its seat in Italy (or the EU with an Italian branch);
- an EU SME (*PMI*) under the 2025 rules;
- production value up to €5M from the second year, and no profit distribution;
- as its **exclusive or prevalent business purpose**, developing and selling innovative products or services with high technological value.

On top of that, **at least one** of three alternative requirements:

| Alternative requirement | Realistic for you? |
|---|---|
| R&D spending ≥ 15% of the greater of costs and production value | Possible: development salaries and R&D projects count, but this must be tracked |
| Qualified team: ⅓ PhDs/researchers or ⅔ with a master's degree | Depends on the founders (please tell me) |
| Owner of a patent or of **original registered software** (Registro pubblico speciale per i programmi per elaboratore, kept by SIAE) | **Yes**: register Flower Man's software in the company's name. This is the most direct route |

Status lasts **3 years**, extendable to 5 if extra conditions are met, and up to 9 in total with further 2-year extensions (Legge 193/2024). Investor tax deductions only apply in the first 3 years. Sources: [MIMIT startup innovative](https://www.mimit.gov.it/it/impresa/competitivita-e-nuove-imprese/start-up-innovative), [MIMIT circular 2025](https://www.mimit.gov.it/images/stories/images/Circolare-startup-innovative-2025_nf.pdf), [Registro Imprese guide](https://startup.registroimprese.it/isin/static/startup/index.html), [Legge 193/2024 text](https://www.gazzettaufficiale.it/atto/serie_generale/caricaArticolo?art.versione=1&art.idGruppo=9&art.flagTipoArticolo=0&art.codiceRedazionale=24G00215&art.idArticolo=31&art.idSottoArticolo=1&art.idSottoArticolo1=10&art.dataPubblicazioneGazzetta=2024-12-17&art.progressivo=0).

**How to strengthen the innovation case (without inventing features):** write the business purpose around the technology (geolocated marketplace, real-time dispatch and tracking, fraud-resistant payments), register the software, and define a genuine R&D work package for the funded plan. Examples:
- demand forecasting for florists, to cut unsold-flower waste (a sustainability angle Lombardy calls favour);
- smarter courier assignment and batching;
- recommendation of bouquets from occasion reminders.

These are roadmap items, not existing features; present them as such.

---

## 2. Funding opportunities, checked (Phase 2)

Status as of 23 November 2026. "Grant" means *contributo a fondo perduto* (non-repayable). "Soft loan" means *finanziamento agevolato* (repayable, at zero or low interest).

### Fits you now or soon

| Program | What you get | Key conditions | Status | Fit |
|---|---|---|---|---|
| **Smart&Start Italia** (Invitalia / MIMIT) | **Zero-interest loan, no guarantees**, covering 80% of a €100k–€1.5M business plan. 90% if the team is entirely women and/or under 36, or includes a PhD working abroad. Grant share (30%) **only in southern regions**, not Lombardy | Must be a *startup innovativa* (micro/small, ≤ 60 months old). **A team of natural persons can apply before forming the company** and incorporate within 30 days of approval. Marketing capped at 20% of the plan, working capital capped at 20%. Requires digital identity (SPID/CIE), digital signature and PEC (certified email) | **Open**, first come first served while funds last; rules updated by DM 13 July 2026 to align with Legge 193/2024 | **Best main instrument** |
| **Nuova Impresa 2026** (Regione Lombardia + Unioncamere Lombardia) | **Grant of 50%** of eligible spending, **max €10,000**, minimum spend €3,000 | New company (registered office and operating site) opened in Lombardy **between 1 Jun 2025 and 31 Dec 2026**. Also open to sole traders with a VAT number. Apply on the Restart (Infocamere) platform | **Open until 12:00, 29 Jan 2027**, or earlier if funds run out (budget raised to about €11.8M in Sept 2026 *(verify)*) | **Quick win**, but only if you incorporate **by 31 December 2026** |
| **Investor tax incentive** for innovative startups | Individual investors deduct **65%** of their investment from IRPEF (income tax), up to €100,000 per year, holding the shares at least 3 years. Companies get an IRES deduction | Only in the startup's first 3 years in the special register. Excludes stakes above 25% and investors who are also suppliers. Falls under *de minimis* state-aid limits | In force since 1 Jan 2025 | **Your best argument with angels**: €10,000 invested costs them €3,500 net |

Sources: [Invitalia Smart&Start FAQ](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia/faq), [Agevolazioni](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia/agevolazioni), [Chi si rivolge](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia/chi-si-rivolge), [Cosa finanzia](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia/cosa-finanzia), [MIMIT Smart&Start page](https://www.mimit.gov.it/it/incentivi/sostegno-alle-startup-innovative-smart-start-italia), [Manuale domanda Nov 2025](https://www.invitalia.it/sites/invitalia.it/files/2025-11/SmartStart%20Italia%20-%20Manuale%20per%20Presentare%20la%20domanda%20-%20Nov2025.pdf), [Nuova Impresa 2026 — Bandi e Servizi](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-imprese/start-up-impresa/nuova-impresa-2026-UC2025051184), [Nuova Impresa — Unioncamere Lombardia](https://www.unioncamerelombardia.it/bandi-e-incentivi-alle-imprese/dettaglio-bando/bando-nuova-impresa-2026), [MIMIT de minimis incentives](https://www.mimit.gov.it/it/impresa/competitivita-e-nuove-imprese/start-up-innovative/incentivi-de-minimis), [Agenzia Entrate ruling 137/2026](https://www.agenziaentrate.gov.it/portale/documents/20143/10196933/Risposta+n.+137_2026/8300b59a-1ff7-45af-f7b8-72d34700db03).

### Depends on facts I don't have yet

| Program | What you get | Key conditions | Status |
|---|---|---|---|
| **Autoimpiego Centro-Nord** (Invitalia) | Grant voucher reported at up to €30,000, rising to €40,000, or 65% of investment programmes up to €120,000 *(verify)* | Founders **18–34**, unemployed, inactive or "working poor"; must hold the majority of the shares and of the board; activity not yet started (at most one month before applying); mandatory tutoring | Reported open until funds run out *(verify on invitalia.it)* |
| **ON – Oltre Nuove imprese a tasso zero** (Invitalia) | Since **1 July 2026, soft loan only** (zero interest, up to 90% of costs, up to 10 years). The grant part is exhausted | Company majority-owned by people aged 18–35 or by women; micro/small; ≤ 60 months old; projects up to €1.5M | Open, chronological order |

ON is a fallback if you cannot get innovative-startup status; otherwise Smart&Start fits better. Autoimpiego is potentially your **largest non-repayable grant**, so tell me your ages and employment status. Sources: [ON — Invitalia news 1 July 2026](https://www.invitalia.it/news-media/news/oltre-nuove-imprese-tasso-zero-dal-1deg-luglio-2026-disponibile-solo-il-finanziamento-agevolato), [ON — cos'è](https://www.invitalia.it/incentivi-e-strumenti/nuove-imprese-tasso-zero/cose); Autoimpiego details from secondary sources only, e.g. [incentivimpresa.it](https://www.incentivimpresa.it/autoimpiego-centro-nord/).

### Big, but not available to you right now

| Program | Why not now |
|---|---|
| **Regione Lombardia — Misura per lo sviluppo tecnologico delle startup innovative** (PR FESR 2021–27): grant of **80%** of eligible costs, up to €1M (€1.5M in assisted areas), about €15.6M budget | Applications **close at 15:00 on 25 November 2026**, and you must already be a registered innovative startup. Watch for the next edition; there is no guarantee one will open. If it does, it is worth more than everything else combined |
| **EU: EIC Accelerator, Horizon Europe** | Built for deep-tech and breakthrough innovation. A florist marketplace would not be competitive. EU regional funds (ERDF/FESR) reach you through Lombardy calls like the one above |
| **Smart Money** (MIMIT) | Conflicting reports and no official confirmation of a 2026 window. Not counted |
| **CDP Venture Capital — Fondo Acceleratori II** (announced 19 Oct 2026) | No direct application: it invests through accelerator programmes. Watch their *Rete Nazionale Acceleratori* calls |

Sources: [Lombardia — sviluppo tecnologico startup innovative](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-imprese/start-up-impresa/misura-sviluppo-tecnologico-startup-innovative-RLO12026055303), [Regione Lombardia page](https://www.regione.lombardia.it/attivita-produttive-imprese/start-up-e-avvio-di-impresa/sviluppo-tecnologico-delle-startup-innovative), [Open Innovation Lombardia news](https://www.openinnovation.regione.lombardia.it/it/news/news/9476/al-via-il-bando-di-regione-da-15-milioni-per-startup-innovative-early), [CDP Venture Capital — Fondo Acceleratori II](https://www.cdpventurecapital.it/it/news.page?contentId=COM52718).

---

## 3. Legal structure (Phase 3)

| | **SRL ordinaria** registered as *startup innovativa* | SRLS (*semplificata*) | Sole trader with VAT |
|---|---|---|---|
| Minimum capital | €1 (€10,000 is customary; low capital weakens credibility with banks and Invitalia) | €1 to €9,999.99 | none |
| Set-up | notary required, roughly €1,500–€2,500 all-in *(estimate)* | notary fee waived, but taxes and stamp duties still due; **standard articles that cannot be changed** | cheapest |
| Investors | **custom articles**: share categories, vesting, drag/tag-along; innovative-startup SRLs can even offer shares through equity crowdfunding | rigid articles make an angel round awkward; you would convert to SRL anyway | **impossible** |
| Smart&Start / innovative-startup status | yes | yes, but the rigid articles limit you | no |
| Ongoing cost | accountant roughly €2,500–€4,000/year *(estimate)*; innovative startups are **exempt from chamber of commerce annual fees and stamp duties** | similar | lower |
| Tax | IRES 24% + IRAP ~3.9% on profit (losses carry forward) | same | IRPEF on personal income |

**Recommendation: an SRL ordinaria registered in the special section as a *startup innovativa*, incorporated in Bergamo before 31 December 2026.**
- **Why before 31 December:** Nuova Impresa needs the company opened in 2026.
- **Why innovative status:** it unlocks Smart&Start and the 65% investor deduction.
- **Articles:** have the notary include investor-ready clauses now (share categories, pre-emption rights, a vesting/good-leaver mechanism between founders).
- **Business purpose:** write it around developing and operating the technology platform, so it passes the "high technological value" test.
- **Notary is required:** the old notary-free online incorporation for startups was struck down by the Consiglio di Stato in 2021, so budget for one.

Requirements to keep the status:
- update the information on the register every 6 months;
- confirm the requirements every year (within 30 days of the accounts being approved);
- no profit distribution;
- keep at least one alternative requirement met (registered software is the simplest).

**Option to weigh:** if the founders qualify for Autoimpiego (unemployed, under 35), check its timing rules before incorporating. It requires the activity to start no more than a month before applying.

---

## 4. Three funding strategies (Phase 4)

| | **A. Maximum grants** | **B. Public + private** (recommended) | **C. Bootstrap first** |
|---|---|---|---|
| Realistic target, 12–18 months | **€10k** (Nuova Impresa); **+€30–40k** if Autoimpiego applies; **up to 80% of a project** only if Lombardy reopens its startup grant | **≈ €300k**: €50k angels + €10k Nuova Impresa + **€240k Smart&Start loan** (on a €300k plan) | **≈ €25k** of own/friends money, then B with traction |
| Sources | Nuova Impresa, Autoimpiego, next Lombardy edition | the above + angels (65% deduction) + Bergamo/Milan incubators | founders, friends & family, revenue |
| Prep time | 2–6 weeks per application | 8–12 weeks for Smart&Start (business plan + 2-year financial plan) | immediate |
| Main risks | grants reimburse spending **after** you pay: you still need cash. Only small amounts available now | Smart&Start is a **loan**: about €24k/year to repay over 10 years. Invitalia may judge the innovation weak | slow; competitors move; no salaries |
| Your obstacle | little own cash for the 50% co-pay | the 20% own share (≈ €60k on €300k) **must come from investors** | founders need another income |

**I recommend Strategy B, with A's quick wins inside it.**
- Grants alone cannot fund a marketplace launch.
- Smart&Start is the only instrument that turns a modest angel round (€50k) into roughly €300k of runway.
- The 65% IRPEF deduction makes that angel round far easier to close in Italy.

Sequence:
1. Incorporate before 31 December 2026.
2. Apply to Nuova Impresa in January.
3. Run a 6–8 week Bergamo pilot with 10–15 florists to get real numbers.
4. Close a €50k angel round on the strength of the pilot and the 65% deduction.
5. Apply to Smart&Start with the angel money as your own contribution.
6. Prepare an R&D project in case Lombardy reopens its 80% startup grant.

---

## 5. What the numbers say (summary of the financial model)

Full model, with editable assumptions: `04-financial-model.xlsx`. All figures are **estimates** to validate in the pilot.

| € | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|---|---|---|---|---|
| Cities | 1 | 2 | 3 | 5 | 8 |
| Orders | 3,000 | 12,000 | 40,000 | 85,000 | 150,000 |
| Flowers GMV | 135k | 552k | 1.88M | 4.08M | 7.35M |
| Net revenue (commission + featured) | 20k | 105k | 394k | 858k | 1.54M |
| EBITDA | −67k | −155k | −167k | −56k | **+219k** |
| Cumulative EBITDA | −67k | −222k | −389k | **−445k** | −226k |

Key assumptions:
- commission 15% at launch, then 18–20% (configurable per zone already);
- average flowers basket €45–49;
- platform-funded discounts 5% of GMV falling to 2%;
- card fees about 1.5% + €0.25 on everything charged;
- marketing €10–12 per new customer;
- staff growing from 1 to 10 FTE.

What this means:
- **Break-even in year 5**, after about **€450–500k** of cumulative losses.
- The Strategy B package (≈ €300k) funds 2027–2028; a **seed round of about €250–400k** is needed in 2028–2029.
- The biggest levers are commission rate, repeat orders (lower marketing per order) and basket size. Prove those in the pilot.

---

## 6. Organisations to approach (Phase 7)

Only organisations whose existence I could confirm from search results are listed. I could not open their websites from this environment, so **check each one's current programmes before contacting them**.

| Who | Why | Where |
|---|---|---|
| **Invitalia** — Smart&Start | main loan | [invitalia.it Smart&Start](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia) — apply through the Invitalia online area |
| **Unioncamere Lombardia / Regione Lombardia** — Nuova Impresa 2026 | €10k grant | [Bandi e Servizi](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-imprese/start-up-impresa/nuova-impresa-2026-UC2025051184), [Unioncamere Lombardia](https://www.unioncamerelombardia.it/bandi-e-incentivi-alle-imprese/dettaglio-bando/bando-nuova-impresa-2026) |
| **Camera di Commercio di Bergamo** | incorporation, innovative-startup registration, free start-up desk (*sportello nuova impresa*) | [bg.camcom.it](https://www.bg.camcom.it) |
| **Regione Lombardia / Finlombarda** | watch for the next startup-innovation grant | [Start up e avvio di impresa — Bandi e Servizi](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/start-up-impresa), [finlombarda.it](https://www.finlombarda.it) |
| **Kilometro Rosso / POINT Dalmine (Bergamo)** | local innovation hubs; leading the B.R.I.D.g.E. innovation-zone bid, which includes startup acceleration (mechatronics focus, so ask about consumer startups) | [kilometrorosso.com](https://www.kilometrorosso.com), [Bergamonews article](https://www.bergamonews.it/2026/09/09/zone-di-innovazione-e-sviluppo-sono-sei-le-candidature-bergamo-punta-sulla-meccatronica/921104/) |
| **PoliHub** (Politecnico di Milano) | incubation; no company needed to apply; fee-based paths of 6–12 months; does not take equity or IP | [polihub.it — candida la tua startup](https://polihub.it/candida-la-tua-startup/) |
| **Italian Angels for Growth (IAG)** | Italy's largest angel network (300+ members); pre-seed/seed | [italianangels.net](https://www.italianangels.net/en/home/) |
| **CDP Venture Capital — Rete Nazionale Acceleratori** | accelerator calls with pre-seed investment (e.g. €150k at Frontech) | [cdpventurecapital.it](https://www.cdpventurecapital.it/it/news.page?contentId=COM52718) |
| **Università degli Studi di Bergamo** | entrepreneurship/technology-transfer office; useful for a qualified-team member or R&D partnership | [unibg.it](https://www.unibg.it) *(check the current contact)* |

Not verified from here, but worth checking: B4i (Bocconi for Innovation), IBAN (Italian business angels network), Club degli Investitori, Cariplo Factory, and Italian seed funds investing in consumer and marketplace startups (e.g. LVenture Group, Italian Founders Fund).

---

## 7. Final answers

1. **Three best opportunities:**
   - **Smart&Start Italia**: zero-interest loan, 80–90% of a €100k–€1.5M plan.
   - **Nuova Impresa 2026**: 50% grant up to €10k, apply by 29 Jan 2027.
   - **Angel investment backed by the 65% IRPEF deduction** for innovative startups.

   Strong fourth if eligible: **Autoimpiego Centro-Nord** (grant). Watch for the **next Lombardy innovative-startup grant** (80%, up to €1M).
2. **Legal structure:** SRL ordinaria registered as a *startup innovativa*, with investor-ready articles and a technology-focused business purpose; software registered in the company's name.
3. **Initial capital requirement:**
   - lean launch in Bergamo: about **€24k** for 12 months, founders unpaid;
   - funded plan with 2 paid people: about **€153k** for 12 months;
   - cumulative need to break-even: about **€450–500k** over 4 years.

   See `04-financial-model.xlsx`.
4. **Application to prioritise:** **Smart&Start Italia**, prepared over the next 8–12 weeks. File **Nuova Impresa 2026** in January as the immediate quick win.
5. **Documents to prepare:** see the checklist in `05-application-kit.md`:
   - business plan;
   - 24-month financial plan (sources and uses);
   - founder CVs;
   - innovation statement and software registration;
   - pitch deck;
   - incorporation deed and articles;
   - quotes for planned spending;
   - pilot results;
   - digital identity, digital signature and PEC.
6. **First five actions:**
   1. Answer the open questions below (ages, employment status, degrees, who will work full-time).
   2. Book a free appointment with the Camera di Commercio di Bergamo start-up desk and get 2–3 quotes from *commercialisti* who handle innovative startups.
   3. Agree a founders' agreement (shares, roles, vesting) and incorporate the SRL **before 31 December 2026**.
   4. Register the software with SIAE in the company's name and register as a *startup innovativa*.
   5. Sign 10–15 Bergamo florists for a pilot and start conversations with 5–10 potential angels.
7. **Official links to start:**
   - [Smart&Start Italia (Invitalia)](https://www.invitalia.it/incentivi-e-strumenti/smartstart-italia)
   - [Nuova Impresa 2026 (Regione Lombardia)](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-imprese/start-up-impresa/nuova-impresa-2026-UC2025051184)
   - [Startup innovative (MIMIT)](https://www.mimit.gov.it/it/impresa/competitivita-e-nuove-imprese/start-up-innovative)
   - [Registro Imprese — innovative startups](https://startup.registroimprese.it/isin/static/startup/index.html)
   - [ON (Invitalia)](https://www.invitalia.it/incentivi-e-strumenti/nuove-imprese-tasso-zero/cose)

## 8. Open questions (answers change the plan)

1. Ages of each founder, and whether all are under 36 and/or women: this decides 80% vs 90% under Smart&Start, and eligibility for ON.
2. Current employment status of each founder: Autoimpiego needs unemployed, inactive or low-income founders aged 18–34.
3. Degrees and research experience: ⅔ with a master's degree is an alternative innovative-startup requirement.
4. Who will work full-time on Flower Man, and from when.
5. Who wrote and owns the code today, and whether all founders agree it moves into the company.
6. Any existing relationship with Bergamo florists, couriers or potential investors.
