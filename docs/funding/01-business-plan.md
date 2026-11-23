# Flower Man — Business plan (draft v1, November 2026)

Prepared for Invitalia (Smart&Start Italia), Regione Lombardia and private investors. Financial figures come from `04-financial-model.xlsx`: they are **estimates and assumptions**, not results. Market figures marked *(verify)* must be checked against the original source before submission. Items in [brackets] need founder input.

---

## 1. Executive summary

Flower Man is a mobile marketplace that connects people with the independent florists of their city and delivers the bouquet the same day through its own courier network.
- **For customers:** browse local florists by distance, order with a delivery slot, follow the courier live, receive a photo at the door, review.
- **For florists:** a free shop window and order desk; they set their own catalogue and prices, receive orders by push notification, and get paid out by the platform.
- **For couriers:** nearby delivery jobs with the fee and tip shown up front.

The software is complete and tested:
- a customer app and a partner app for Android and iOS;
- a web admin panel;
- an API with 150 unit tests and 72 integration tests.

We will launch in **Bergamo in 2027**, then expand to Brescia, Milan and other Lombard cities.

We are seeking **≈ €300,000** for 24 months:
- €50,000 equity from business angels;
- €10,000 Nuova Impresa grant (Regione Lombardia);
- a €240,000 zero-interest Smart&Start loan.

This funds the Bergamo launch, the second city and an R&D work package on demand forecasting for florists. Based on our assumptions, the company reaches positive EBITDA in year 5.

## 2. Problem and market opportunity

- **Customers:** ordering flowers online in Italy usually means a national network or a "farm-direct" brand, with fixed catalogues and next-day or cut-off-bound delivery. Supporting the local florist round the corner means phoning or visiting.
- **Independent florists:** most cannot afford their own e-commerce, delivery staff or marketing. Relay networks route orders between florists for a fee, and generic food-delivery apps are not built around flowers (custom compositions, gift messages, delivery photos, occasions).
- **Couriers:** flower deliveries are concentrated around the same dates (Valentine's Day, Mother's Day, Women's Day on 8 March, graduations, funerals), which local shops cannot staff for.

**Opportunity:** Italian households spend on the order of **€1.9 billion a year on flowers and plants** (ISMEA consumer panel; year to be confirmed) *(verify)*, and the floriculture sector is put at about **€3.3 billion** (Myplant 1st Florovivaismo Report 2025; definition to be confirmed) *(verify)*. Online penetration of flower purchases is still small, and local florists are underrepresented online.

## 3. Product and technology

What exists today (TypeScript monorepo):

| Component | Capabilities |
|---|---|
| Customer app (React Native / Expo) | shop by location and category; product photos; favourites; cart with one florist per order; two-hour delivery slots within opening hours; tips; discount codes; Stripe payment (card, Apple Pay, Google Pay); live order status and arrival estimate; delivery photo; ratings for florist and courier; custom bouquet requests with competing offers; occasion reminders; help desk; Italian and English |
| Partner app (React Native / Expo) | onboarding and verification for shops, independent florists and couriers; order workflow (accept → prepare → ready); products, stock and low-stock alerts; opening hours; offers on custom requests (with photo); courier jobs, navigation, background GPS during delivery only, proof-of-delivery photo; earnings, payouts, monthly statements |
| Admin panel (Next.js) | sales analytics, partner verification, orders and refunds, deliveries, reviews, discount codes, featured florists, payouts, service zones, support inbox, audit log, GDPR requests |
| API (NestJS, PostgreSQL + PostGIS) | geographic service zones; server-side pricing (client totals never trusted); payments confirmed only by Stripe webhooks; double-entry-style ledger; rate limiting; S3-compatible private storage; Italian-language errors and notifications |

The technical moat is not one algorithm. It is the fully integrated, compliant system:
- geolocation and zones;
- dispatch;
- tracking;
- payments with payouts;
- auditing.

A florist or a new competitor would need 12–18 months to replicate it. **R&D roadmap (funded plan):** see section 10.

## 4. Unique selling proposition

> *Your city's best florists, delivered today, with live tracking and a photo at the door.*

- **Local and independent:** each florist sets its own catalogue and prices; the customer chooses the shop.
- **Custom bouquets by competition:** describe the idea and budget, receive offers from several florists.
- **Same-day, tracked, proven:** courier network, live status, delivery photo.
- **Fair to partners:** florists keep 85% at launch; couriers keep 100% of the delivery fee and tips.

## 5. Target customers

1. **Gift senders aged 25–45 in Lombard cities**, ordering for birthdays, anniversaries, 8 March, Mother's Day and thank-yous. Mobile-first, value speed and reliability.
2. **Remote senders:** people outside Bergamo sending flowers to family in the city.
3. **Small businesses:** offices, restaurants and hotels ordering recurring or event flowers (later phase).
4. **Florists** (supply side): independent shops and home-based florists in each city.
5. **Couriers** (supply side): bike and scooter couriers wanting flexible work.

## 6. Market analysis

- **Launch area:** Bergamo city and province (about 1.1 million inhabitants), then Brescia, Milan, Monza, Como.
- **Demand drivers:** gifting occasions concentrated on peak dates; growing acceptance of app-based local delivery since 2020.
- **Supply:** [number of florists in Bergamo province — to obtain from Camera di Commercio di Bergamo / Infocamere; ATECO 47.76.10].
- **Sizing method for the application:** households × flower spend × share bought for delivery × share captured.

Bottom-up target: 3,000 orders in year 1 is about 250 orders a month in Bergamo by December 2027.

## 7. Competitor analysis

| Competitor | Model | Strength | Weakness vs Flower Man |
|---|---|---|---|
| Interflora Italia (MyFlower group) | national relay network of member florists; same-day for orders by 17:30 (Sunday 12:30), delivery from €7.99 | brand, national coverage | central catalogue; customer can't choose the shop; network fees for florists |
| Italian Flora and similar networks | relay network, 2,000+ florists claimed | coverage | same as above |
| Colvin, Bebloom and farm-direct brands | own sourcing, shipped bouquets; express delivery only in a few big cities | price, brand | no local florists; limited same-day |
| Quick-commerce / food-delivery apps | general marketplaces adding florists | huge user base | not built for flowers (custom requests, gift notes, occasions, proof photo) |
| Florists' own websites / phone orders | direct | loyalty | no delivery capacity, no discovery |

Competitor facts from public sites and press as of 2026 *(verify each before submission)*.

## 8. Business and revenue model

| Revenue line | How it works | Status in product |
|---|---|---|
| Commission on flowers | 15% at launch, moving to 18–20% (configurable per zone) | exists |
| Featured placement for florists | monthly fee for top placement | placement exists; pricing is a business decision |
| Later: business accounts, florist software subscription | to be validated | not built |

Delivery fees (€5.90 default) and tips are collected and paid in full to couriers, so they are not revenue. Discount codes are funded by the platform.

**Unit economics (year 3, estimate):** about €7.0 contribution per order after card fees, discounts and support, on a €47 basket at a 20% commission.

## 9. Marketing and customer acquisition

- **Supply first:** sign 10–15 florists in Bergamo before launch (in-person visits, zero set-up cost, co-branded window stickers and QR codes).
- **Demand:**
  - florists promote "order on Flower Man" to their own customers;
  - local social ads timed to peak dates;
  - welcome code (BENVENUTO10 exists);
  - partnerships with companies for employee gifting;
  - occasion reminders for retention.
- **Peaks:** 14 Feb, 8 March, Mother's Day, Christmas, graduation season.
- **Metrics:** cost per new customer (target ≤ €12), repeat rate at 90 days, orders per florist per week, on-time delivery rate, rating.

## 10. Technology development roadmap

| When | Work |
|---|---|
| Q1 2027 | production hosting, live Stripe payments, Android/iOS store release, device testing; pilot in Bergamo |
| Q2–Q3 2027 | florist tools from pilot feedback; courier batching; payout automation; accessibility; marketing site |
| Q4 2027–2028 (R&D) | **demand forecasting for florists** (cut unsold-flower waste); **dispatch optimisation** (courier assignment and batching); recommendations from occasion reminders. Measurable goals: waste reduction for partner florists, on-time rate, delivery cost per order |
| 2028+ | business accounts; multi-city operations tooling |

## 11. Operational plan

- **Florist onboarding:** application in the partner app → verification by admin → catalogue and opening hours → go live.
- **Courier model:** from 2 December 2026, Italy's decree transposing EU Directive 2024/2831 on platform work presumes platform workers are employees [verify decree reference]. The current model (self-employed couriers paid per delivery) must be redesigned before launch with a labour consultant: employment (part-time contracts), a licensed delivery partner, or genuinely autonomous contracts that rebut the presumption. Accident insurance required. Higher courier costs are not yet in the financial model.
- **Customer service:** in-app help desk with an admin inbox; refunds handled in the admin panel.
- **Payments:** Stripe; payouts to partners by bank transfer with monthly statements.
- **Compliance:**
  - GDPR: privacy policy, data export and deletion already implemented; appoint a DPO if required;
  - consumer law;
  - food/plant rules not applicable;
  - e-invoicing via SDI for commissions [accountant].

## 12. Management and hiring plan

| Role | Who | When |
|---|---|---|
| CEO / partnerships | [Founder 1] | now |
| CTO / product | [Founder 2] | now |
| Operations & florist success | hire | 2027 |
| Customer support (part-time) | hire / outsource | 2027 |
| City launch managers | hire | 2028+ |

Advisors to recruit: a florist-industry advisor, a logistics advisor, an accountant experienced with innovative startups.

## 13. Financial projections (estimates)

| € | 2027 | 2028 | 2029 | 2030 | 2031 |
|---|---|---|---|---|---|
| Orders | 3,000 | 12,000 | 40,000 | 85,000 | 150,000 |
| Flowers GMV | 135,000 | 552,000 | 1,880,000 | 4,080,000 | 7,350,000 |
| Net revenue | 20,250 | 105,240 | 393,640 | 858,480 | 1,540,800 |
| Contribution margin | 9,016 | 64,969 | 279,566 | 632,380 | 1,178,880 |
| Fixed and growth costs | 75,600 | 220,000 | 447,000 | 688,000 | 960,000 |
| **EBITDA** | **−66,584** | **−155,031** | **−167,434** | **−55,620** | **+218,880** |

All assumptions are listed in the spreadsheet's *Assumptions* sheet.

## 14. Funding requirements

About **€300,000 for 2027–2028**. The model's peak cumulative need is about **€445,000** by the end of 2030, so a **seed round of €250–400k** is planned for 2028–2029.

## 15. Allocation of investment (Smart&Start plan, €300k over 24 months)

| Use | € | Note |
|---|---|---|
| Product & R&D | 90,000 | releases, florist tools, forecasting and dispatch R&D |
| Team (operations, support) | 80,000 | |
| Marketing & market entry | 60,000 | Smart&Start cap: 20% of plan |
| Hosting, security, compliance, insurance | 30,000 | |
| Working capital | 40,000 | Smart&Start cap: 20% of plan |

## 16. Revenue and break-even

- **Break-even:** EBITDA turns positive in **2031**, at about 150,000 orders a year across 8 cities.
- **Sensitivity:** every +1 point of commission adds about €73k of revenue in 2031. Higher repeat rates cut marketing per order the most.

## 17. Risks and mitigation

| Risk | Mitigation |
|---|---|
| Not enough florists join | free to join; florist sets prices; pilot with 10–15 shops before launch |
| Weak demand / high acquisition cost | florists co-promote; peak-date campaigns; reminders for repeat orders |
| Courier supply at peaks | flexible pool; peak bonuses; requested-time slots spread demand |
| Courier employment rules (platform-work decree, from 2 Dec 2026) | redesign the courier model with a labour consultant before launch; update the financial model with employment costs; insurance |
| Thin margins | commission step-up per zone; featured placement; basket growth |
| Innovation status challenged | registered software; technology-focused business purpose; documented R&D |
| Competitors copy | speed of local supply acquisition; partner loyalty |
| Loan repayment (Smart&Start) | plan repayments from 2029 into the model; seed round |

## 18. Growth and expansion

- **Lombardy:** Bergamo → Brescia → Milan → Monza, Como, other cities. The service-zone engine supports new cities without code changes.
- **Rest of Italy:** cities with a strong florist base (Verona, Turin, Bologna).
- **International:** the apps already run in Italian and English; the model fits other EU countries with independent-florist markets.
