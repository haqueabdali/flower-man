# Flower Man as local economic infrastructure — strategy for Italian public institutions

Prepared 23 November 2026. Companion files:
- `07-impact-model.xlsx`: public revenue model;
- `08-proposta-istituzionale-it.md`: institutional proposal and Milan pilot, in Italian;
- `09-one-pager-e-email-it.md`: one-page brief for municipalities and outreach emails;
- `10-presentazione-istituzionale.pptx`: presentation for institutions.

**How to read this:**
- **[Measured]** = official statistic with source.
- **[Estimate]** = my calculation from stated assumptions.
- **[Proposal]** = something Flower Man would build or offer; it does not exist yet.
- **[Verify]** = confirm with the official source, an accountant or a lawyer before using it externally.

Nothing here implies that any institution is interested or has committed. That has to be earned through the steps in §8.

---

## 0. The short version

1. **The best entry point is neighbourhood shops, not "informal sellers".** Italian municipalities and Regione Lombardia are already spending to keep local shops alive:
   - Lombardy put **€63 million** into its *Distretti del Commercio* (shopping-district) programme in 2026;
   - Milan's **€4 million** *Negozi e Botteghe di Quartiere* grant (neighbourhood shops and workshops) is open until March 2027.

   Flower Man already gives a local shop online sales, payments and same-day delivery. That matches a policy goal that already has budgets.
2. **Formalisation is a real but secondary pillar, and it must be voluntary.** It is not a crackdown.
   - [Measured] ISTAT counts 3.13 million irregular full-time-equivalent work units in 2023, with a **15.0%** irregularity rate in trade, transport, accommodation and food services.
   - We have no data on how many flower sellers are unregistered, and many independent sellers are legitimately registered or legally exempt (see §2).
   - The platform can make registering easier and worthwhile. It must never become a tool that penalises vulnerable people.
3. **Delivery work is your biggest risk and your strongest public argument.** The decree transposing EU Directive 2024/2831 on platform work extends to all platform workers the presumption that they are employees, from **2 December 2026** [Verify decree number and text]. Flower Man's current courier model (self-employed couriers paid per delivery) must be redesigned before launch. A compliant-by-design local courier model is exactly what the Ministry of Labour wants to see.
4. **Honest numbers.** [Estimate] A 12-month pilot in one Milan *Municipio* (borough) would generate about **€48k** of additional public revenue in year one and about **€42k a year** afterwards, if registrations and jobs persist. That pays back the public share (€96k) in two to three years. At regional scale (8 cities by 2031) the estimate is about **€1.2M a year** (§3). These are modest, defensible numbers. Inflated claims would damage credibility with public officials.

---

## 1. Phase 1 — What the platform is (from the codebase)

**What exists:**
- Customer app, partner app (shops, independent sellers, couriers) and admin panel. Details in `00-funding-strategy.md` §1.
- Partner onboarding with document review and admin approval (*verifica*); shops declare legal name and VAT number.
- Server-calculated prices; card payments confirmed by Stripe; a ledger recording each euro to florist, courier and platform; monthly partner statements; payouts with bank references.
- Geographic service zones (a city or district can be switched on without code changes); delivery tracking and proof photos.
- Audit log, GDPR data export and deletion, Italian/English.

**Commercial model:** 15% commission on flowers (configurable per zone); delivery fee and tips to couriers; featured placement.

**What makes it useful to the public sector:** every transaction is traceable, paid digitally and attributed to an identified, verified seller. Platforms already have to report sellers' income to the Agenzia delle Entrate under DAC7 (D.Lgs. 32/2023) above 30 sales or €2,000 a year. Flower Man's ledger makes that reporting automatic and accurate.

**Features to add for public partners** [Proposal]:

| Feature | Why it matters to institutions | Effort |
|---|---|---|
| **"Mettiti in regola" guided path** for independent sellers: questions → explains the options (occasional activity limits, opening a VAT number, *regime forfettario*, SCIA via the SUAP/*impresainungiorno* portal, agricultural direct sales) → links to the Camera di Commercio help desk | voluntary formalisation without penalties | 1–2 months |
| **"Registered business" badge** and priority listing for verified VAT-registered sellers | rewards compliance in the market | small |
| **DAC7 export** and e-invoicing of commissions (SDI) | accurate tax reporting by design | 1 month |
| **Aggregated, anonymised impact dashboard** for a municipality or district: active shops, sales, orders, delivery jobs, new registrations | measurable KPIs for public partners, GDPR-safe (no personal data shared) | 1–2 months |
| **District storefront** ("Il distretto online"): all shops of a *Distretto del Commercio* under one local brand, beyond flowers | fits district programmes | 2–3 months |
| **Compliant courier module:** shifts, hours, contract type, safety training records | compliance with the 2026 platform-work decree | 2 months |

## 2. Phase 2 — What the law actually says about selling flowers

| Seller type | Legal route | Formalisation angle |
|---|---|---|
| Florist shop | SCIA to the Comune (via SUAP), VAT number, Registro Imprese; no specific licence for flowers. ATECO 47.76.1 | already formal → **digitalisation** pillar |
| Grower (*florovivaista*, farmer) | Agricultural direct sale under D.Lgs. 228/2001, art. 4. **Online sales can start as soon as the communication is sent to the Comune** (para. 4-bis). Products must be mainly their own | already allowed → **new channel for local growers** |
| Street or market vendor | Needs a permit for selling on public land (D.Lgs. 114/1998; Lombardy regional rules) | out of scope: the platform does not handle street sales |
| Home or event florist selling regularly (social media, word of mouth) | Habitual trade needs a VAT number and registration, usually *regime forfettario* | **the formalisation target**: help them register |
| Occasional, sporadic sellers | genuinely occasional sales are not a business | must not be pressured |

**Important reality check:** some flower sellers seen in streets and restaurants are vulnerable people, sometimes without residence permits. A marketplace cannot "formalise" them, and Flower Man should not present itself as doing so. That is a matter for social services and immigration law. Our formalisation pillar targets people who could register but find it confusing or not worth it.

**The barrier that matters most** [Measured + Estimate]:
- INPS 2026 rules: a registered trader pays at least **€4,611.64 a year** in contributions, or about €3,000 with the 35% *forfettario* reduction, even on small incomes.
- For a seller turning over €20,000, that is about **15% of turnover**.
- This explains why small sellers stay informal, and why "help them register" only works if the platform also brings them enough extra sales to justify it.
- It is also a legitimate policy conversation (contribution ramps for micro-sellers), but **not** something to lobby for in a funding application.

## 3. Phase 3 — Public benefit, calculated honestly

Method (full detail in `07-impact-model.xlsx`, sheet *Read me*):
- count only **additional** activity;
- net out deadweight;
- count VAT only on the small share of spending that is genuinely new;
- add no multipliers.

**One newly registered seller** (turnover €20k, *forfettario*, start-up rate) [Estimate]:
- contributions about €2,998 (with the 35% reduction);
- substitute tax about €250;
- no VAT (*forfettari* do not charge it);
- **total about €3,250 a year**, most of it building the seller's own pension.

**12-month pilot in one Municipio** [Estimate]:

| Input | Value |
|---|---|
| Shops | 40 |
| Independent sellers | 20, of which 8 newly registered |
| Couriers on compliant part-time contracts | 8, with 50% deadweight |
| Orders | 4,000 at €45 |
| Share of shop sales that is genuinely new | 30% |
| Share of consumer spending that is genuinely new (for VAT) | 20% |

| Result | € |
|---|---|
| Flowers sold through the platform | 180,000 |
| Genuinely additional legal sales for local shops | 54,000 |
| Revenue: newly registered sellers | 25,982 |
| Revenue: courier contracts (net) | 16,000 |
| Revenue: VAT on new consumption | 3,273 |
| Revenue: tax on shops' extra margin | 3,240 |
| **Additional public revenue, year 1** | **≈ 48,500** |
| Recurring per year afterwards (sellers + jobs) | ≈ 42,000 |
| Public share of pilot cost | 96,000 |

**Regional scenario** (hypothetical; drivers in the spreadsheet):

| Year | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|---|---|---|---|---|
| Additional public revenue | €37k | €134k | €374k | €723k | **€1.22M** |

The biggest driver is the number of sellers who register: 250 by 2031 is an assumption the pilot must test.

What we will **not** claim: that all platform sales are new, that all couriers are new jobs, or any multiplier effect.

## 4. Phase 4 — Which sectors, ranked

Scored 1 (low) to 5 (high).

| Sector | How widespread | Public interest and budget | Fit with current product | Regulatory complexity (5 = simple) | Funding access | Company revenue | **Rank** |
|---|---|---|---|---|---|---|---|
| Neighbourhood shops: flowers first, then other local retail | 5 | **5** (Distretti, Milan grant) | 5 | 4 | 4 | 4 | **1** |
| Compliant local delivery work | 4 | 4 (Ministry of Labour, FSE+) | 4 | **2** | 3 | 3 | **2** |
| Independent and home sellers who could register (florists, then artisans) | 3 (no hard data) | 3 | 3 (needs guided path) | 3 | 2 | 3 | **3** |
| Local growers' direct online sales (florovivaismo, then km0 food) | 3 | 3 (agriculture, farmers' organisations) | 4 | 4 (art. 4 c.4-bis) | 3 | 2 | **4** |
| Artisans, second-hand and circular economy | 4 | 3 | 2 (new categories) | 3 | 3 | 3 | **5** |

Food (restaurants, prepared food) is excluded for now: hygiene rules and very strong competitors.

## 5. Phase 5 — Which institutions can actually do something

| Institution | What it controls | Realistic role for Flower Man |
|---|---|---|
| **Comune** (Milan, Bergamo) — commerce department, Municipi, SUAP | local commerce policy; shopping districts; small purchases (direct award under €140k for services, D.Lgs. 36/2023 art. 50 [Verify]) | **pilot partner**; promotes the platform to shops; may buy onboarding/district services; brings district funds |
| **Regione Lombardia** — economic development; labour (FSE+) | Distretti del Commercio calls (via Comuni); ERDF and ESF+ programmes; Nuova Impresa | co-funding through Comuni and calls; employment measures |
| **Camera di Commercio** (Bergamo; Milano Monza Brianza Lodi) | business registration help desks; co-manages the Milan shops grant | **formalisation partner**: help desk for sellers using the guided path |
| **Invitalia / MIMIT** | Smart&Start, ON, Autoimpiego | company funding (`00-funding-strategy.md`) |
| **Ministero del Lavoro**, INPS, labour inspectorate | platform-work rules, contributions | compliance dialogue; showcase of a compliant model; no direct funding |
| **Agenzia delle Entrate** | DAC7, tax compliance | we comply and report; no partnership or funding to expect |
| **MEF** | fiscal policy | no direct role at this stage |
| **Trade associations** (Confcommercio, Federfiori, Confesercenti, farmers' organisations) | reach to shops and growers | onboarding partners; credibility |

**Instruments explained:**
- **Public grant** (*contributo*): money for your project, usually after a competitive call. Example: Smart&Start, Nuova Impresa.
- **Procurement** (*appalto*): a public body buys a service from you. Small amounts can be awarded directly; larger ones need a tender.
- **Public-private partnership (PPP):** a private party proposes a project of public interest; the body checks the interest, publishes it for 60 days for competing proposals, then tenders it. It suits infrastructure, and is too heavy for a pilot.
- **Partnership for innovation / pre-commercial procurement** (*appalti pre-commerciali*): a public body funds R&D for something the market does not offer. A delivery marketplace already exists on the market, so this is a poor fit.
- **Pilot / sperimentazione:** an agreement (*protocollo d'intesa*) where the Comune supports and promotes a trial, often without money at first. **This is your best first step.**
- **Institutional cooperation:** endorsement and communication by a Comune or Chamber; costs them little and gives you credibility.
- **Innovation challenges:** competitions run by Comuni, Regions or corporates; watch for them.
- **Regional development programmes / EU funds** (ERDF, ESF+): reach you through regional calls or through partners (Comuni, training bodies).
- **Private investment:** angels and VC, still needed (`00-funding-strategy.md`).

**Strongest approach: a no-cost *protocollo d'intesa* (pilot agreement) with one Comune and its Camera di Commercio, using company funds plus Smart&Start money for the pilot. Then use the measured results to win district funding and small service contracts.**

## 6. Phase 8 — Making it profitable without depending on government

| Revenue line | Who pays | Notes |
|---|---|---|
| Commission on sales (15% → 18–20%) | sellers, on actual sales | core; aligned with sellers (no sale, no fee) |
| "Pro" subscription for shops: analytics, stock forecasting, promotions, priority placement | shops | [Proposal] |
| Featured placement / local advertising | shops | exists in product |
| Delivery services for shops' own orders (phone/in-store orders delivered by Flower Man couriers) | shops | [Proposal]; helps courier utilisation |
| District storefront and onboarding service | Comuni / districts | [Proposal]; **cap at ≤ 20–25% of revenue** |
| Optional compliance support (guided path free; premium accountant partnership) | sellers, via partner accountants | referral fee only; never mandatory |

Rule: public money funds **set-up and measurement**, never the running cost of the marketplace. A Comune can stop at any time without breaking the business.

## 7. Phase 9 — Funding for this public-value angle

| Program | Type | Fit | Status (23 Nov 2026) |
|---|---|---|---|
| Smart&Start Italia | zero-interest loan 80–90% | company and pilot build | open |
| Nuova Impresa 2026 (Lombardy) | 50% grant, max €10k | company start | open to 29 Jan 2027 |
| **Milan *Negozi e Botteghe di Quartiere*** (Comune di Milano + Camera di Commercio) | grant to **shops** up to 75% (reported up to €30k + €10k rent) | shops outside the outer ring road could fund their own modernisation; check whether digital/online sales costs are eligible [Verify] | open until March 2027, first come first served |
| **Lombardy *Bando Distretti del Commercio*** | 50% grant to **Comuni/districts**, projects ≥ €300k | Flower Man as technology partner in a district project | 2026 window closed 31 Jul 2026; watch for the next |
| Lombardy FSE+ (e.g. ZeroNEET) | employment/training funds through accredited operators | courier training and job placement through a partner | check current calls |
| Voucher Cloud & Cybersecurity (MIMIT/Invitalia) | voucher for SMEs buying cloud/cyber services | maybe for shops; eligibility of a marketplace subscription unverified | open 10 Nov 2026 – 20 Jan 2027 [Verify] |
| ERDF Lombardy startup grant | 80% grant | — | closed 25 Nov 2026; watch for the next |
| Digital Europe (EDIH network) | services to SMEs, not cash to startups | possible partner for shop digitalisation training | check Lombardy EDIHs |
| Horizon Europe / EIC Accelerator | R&D grants | **not a fit**; not worth the effort | — |

## 8. Phase 11 — The five strongest opportunities

| # | Opportunity | Economic problem | Why Italy should care | How Flower Man solves it | Public benefit | Company revenue | Institution | Funding | Difficulty | Time to launch |
|---|---|---|---|---|---|---|---|---|---|---|
| **1** | **Digital shopping district for neighbourhood shops** (flowers first) | shops losing customers to big platforms; empty shop fronts (*desertificazione commerciale*) | explicit regional and municipal priority with budgets | online shop, payments, same-day delivery, district storefront | additional legal sales; tax on extra margin; kept jobs and shop fronts | commissions + subscriptions + small district fees | Comune, Regione (Distretti), Camera di Commercio | Distretti calls via Comuni; Milan shops grant (for shops); Smart&Start | low–medium | 3–6 months |
| 2 | Compliant local delivery jobs | precarious, often undeclared delivery work | new platform-work decree; Ministry of Labour priority | employment or compliant contracts, safety training, fair pay transparency | contributions, fewer irregular jobs | delivery margin, delivery-as-a-service for shops | Ministero del Lavoro, Regione (FSE+), Comune | FSE+ via partners | **high** (labour cost) | 6–9 months |
| 3 | Voluntary formalisation path for independent sellers | habitual sellers outside the system | €217bn non-observed economy; 15% irregularity in trade | guided path + Camera di Commercio help desk + a reason to register (sales) | ≈ €3,250/yr per registered seller | commission on their sales | Camera di Commercio, associations | Chamber programmes; part of district projects | medium | 3–6 months after #1 |
| 4 | Growers selling direct online | small producers lack digital channels | farm income, local supply chains | growers as sellers under art. 4 c.4-bis | farm sales, local sourcing | commission | Regione (agriculture), farmers' organisations | regional/agricultural measures | medium | 6–12 months |
| 5 | Artisans and circular economy | craft and repair businesses lack reach | Made in Italy, circular economy goals | new categories on the same marketplace | sales, registration | commission | Camera di Commercio, Regione | ERDF calls | medium–high | 12+ months |

**Best starting point: #1, the digital shopping district, with #3 built in as a voluntary module.**
- **Government interest is proven by money already allocated:** €63M for Lombardy shopping districts in 2026 and Milan's €4M neighbourhood-shop grant. A Milan council motion is reported to call for support for shops' online sales and delivery [Verify].
- **It uses what is already built**, so a pilot can start in months, not years.
- **The commercial model stays private**: shops pay commission on real sales, and public money only covers set-up and measurement.
- **It is safe:** no one is penalised, and formalisation is an opportunity offered, not imposed.

**Conditions before approaching any institution:**
1. Incorporate the company.
2. Redesign the courier model for the 2026 platform-work decree (labour lawyer).
3. Run the first commercial weeks in Bergamo, so you arrive with real data.
4. Prepare the GDPR impact assessment (DPIA) for the dashboard.

## 9. Sources

- [ISTAT — Economia non osservata, anno 2023 (Oct 2025)](https://www.istat.it/wp-content/uploads/2025/10/Report-ECONOMIA-NON-OSSERVATA-NEI-CONTI-NAZIONALI_ANNO2023.pdf) · [ISTAT press release 2021–2024](https://www.istat.it/en/press-release/non-observed-economy-in-national-accounts-years-2021-2024/)
- [INPS — artigiani e commercianti, contributi 2026](https://www.inps.it/it/it/inps-comunica/notizie/dettaglio-news-page.news.2026.02.gestioni-artigiani-e-commercianti-i-contributi-per-il-2026.html) · [partitaiva.it — 35% reduction](https://www.partitaiva.it/contributi-inps-artigiani-commercianti-2026/)
- [Agenzia Entrate — DAC7](https://www.agenziaentrate.gov.it/portale/scambio-automatico-di-informazioni-comunicate-dai-gestori-di-piattaforme-dac7/infogen-scambio-automatico-di-informazioni-comunicate-dai-gestori-di-piattaforme-dac7-imprese) · [DAC7 FAQ](https://www.agenziaentrate.gov.it/portale/faq-gestori-di-piattaforme-imprese)
- [D.Lgs. 228/2001 art. 4 (Brocardi)](https://www.brocardi.it/testo-unico-agricoltura/capo-i/art4.html) · [MIMIT model communication](https://www.mimit.gov.it/images/stories/impresa/consumatori/284489imprendagricoli.pdf)
- VAT on flowers: [Agenzia Entrate ruling 523/2022 summary](https://www.studiocerbone.com/?p=469463) · [Tabella A text](https://www.fiscoetasse.com/index.php/files/4798/dpr-633-1972-tabella-a.pdf)
- Opening a flower shop (SCIA): [SumUp guide](https://www.sumup.com/it-it/aprire-attivita/aprire-negozio-fiori/) (secondary)
- [Lombardy — Bando Distretti del Commercio 2026](https://www.bandi.regione.lombardia.it/servizi/servizio/bandi/dettaglio/attivita-produttive-commercio/sostegno-attivita-imprenditoriali/bando-favore-distretti-commercio-2026-RLO12026052348) · [ANCI Lombardia](https://anci.lombardia.it/dettaglio-circolari/20263201454-regione-lombardia-al-via-il-bando-2026-per-i-distretti-del-commercio-stanziati-63-milioni-di-euro/) · [Finlombarda](https://www.finlombarda.it/prodotti-e-servizi/prodotti-servizi/177/bando-distretti-del-commercio-2026)
- [Milan — Negozi e Botteghe di Quartiere (CCIAA MiMBL)](https://www.milomb.camcom.it/negozi-e-botteghe-di-quartiere) · [MiTomorrow](https://www.mitomorrow.it/cambiamilano/bando-negozi-e-botteghe-di-milano-2026/) · [MilanoToday](https://www.milanotoday.it/economia/negozi-quartiere-iniziative-valorizzazione.html)
- Platform-work decree: [money.it](https://www.money.it/decreto-piattaforme-digitali-2026-presunzione-subordinazione-rider) · [PMI.it](https://www.pmi.it/economia/lavoro/475800/lavoro-piattaforme-digitali-decreto-recepimento.html) · [Bollettino ADAPT](https://www.bollettinoadapt.it/lavoro-mediante-piattaforma-digitale-uno-schema-di-decreto-carente-sul-ruolo-della-contrattazione-collettiva/)
- PPP and innovation procurement: [Studio Moscarini — PPP in D.Lgs. 36/2023](https://www.studiomoscarini.it/2026/06/12/partenariato-pubblico-privato-ppp-dlgs-36-2023/) · [Altalex — pre-commercial procurement](https://www.altalex.com/documents/news/2026/03/25/appalti-pre-commerciali-partenariato-innovazione)
- [PR Lombardia FSE+ 2021-2027](https://fse.regione.lombardia.it/it/pc2127/prlombardiafse2021-2027) · [Assolombarda — NEET 2025](https://www.assolombarda.it/centro-studi/i-giovani-neet-tra-i-15-e-i-29-anni)
- [Deepelse — Lombardy digitalisation calls 2026 (Voucher Cloud & Cybersecurity)](https://www.deepelse.com/blog/bandi-digitalizzazione-ai-lombardia-2026)
