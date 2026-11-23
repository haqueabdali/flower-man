# Flower Man — Project description, executive summary and technical overview

## Descrizione del progetto (Italiano)

**Flower Man** è un marketplace digitale che collega i clienti con i fioristi indipendenti della propria città e consegna i fiori in giornata tramite una rete di corrieri, gestita dalla piattaforma.

La piattaforma è composta da tre applicazioni integrate:
- un'app clienti per Android e iOS;
- un'app partner per negozi di fiori, fioristi indipendenti e corrieri;
- un pannello di amministrazione web.

Le tre app si basano su un'unica API con database geografico (PostgreSQL/PostGIS).

**Per il cliente:**
- ricerca dei fioristi vicini;
- scelta della fascia oraria di consegna;
- pagamento sicuro (carta, Apple Pay, Google Pay);
- stato dell'ordine in tempo reale e foto della consegna;
- recensioni;
- promemoria per compleanni e anniversari;
- "mazzi su misura": il cliente descrive l'idea e il budget, e più fioristi della zona inviano un'offerta.

**Per il fiorista:** vetrina e gestione ordini senza costi di attivazione, con catalogo e prezzi propri, notifiche push, avvisi di scorte basse, orari di apertura, incassi e rendiconti mensili.

**Per il corriere:** consegne vicine con compenso e mancia visibili prima di accettare, navigazione, posizione condivisa solo durante la consegna, foto di consegna.

**Stato:** il software è completo e collaudato (150 test unitari e 72 test di integrazione). Il lancio è previsto a **Bergamo nel 2027**, poi Brescia, Milano e altre città lombarde.

**Modello di ricavo:** commissione sul valore dei fiori (15% al lancio, poi 18–20%) e posizionamento in evidenza per i fioristi. La tariffa di consegna e le mance vanno interamente ai corrieri.

**Innovazione:** sistema integrato di zone geografiche, dispatch e tracciamento delle consegne, pagamenti con prezzi calcolati dal server e conferma via webhook, registro contabile delle ripartizioni, gare di offerte tra fioristi.

Il progetto di R&S previsto riguarda:
- la previsione della domanda per i fioristi, per ridurre lo spreco di fiori invenduti;
- l'ottimizzazione dell'assegnazione delle consegne ai corrieri.

**Impatto:** porta online i fioristi di quartiere, crea lavoro flessibile per i corrieri, riduce lo spreco di fiori.

## Project description (English)

**Flower Man** is a digital marketplace that connects customers with the independent florists of their city and delivers flowers the same day through a courier network run by the platform.

It consists of three integrated applications on one API with a geographic database (PostgreSQL/PostGIS):
- a customer app for Android and iOS;
- a partner app for flower shops, independent florists and couriers;
- a web admin panel.

**Customers can:**
- find nearby florists;
- choose a delivery slot and pay securely (card, Apple Pay, Google Pay);
- follow the order in real time and receive a delivery photo;
- leave reviews;
- set reminders for birthdays and anniversaries;
- post a custom bouquet request, to which several local florists respond with offers.

**Florists** get a free shop window and order desk with their own catalogue and prices, push notifications, low-stock alerts, opening hours, payouts and monthly statements.

**Couriers** see nearby jobs with the fee and tip before accepting, navigate, share their location only during an active delivery, and take a delivery photo.

**Status:** the software is complete and tested (150 unit tests, 72 integration tests). Launch is planned in **Bergamo in 2027**, followed by Brescia, Milan and other Lombard cities.

**Revenue:** commission on the flowers (15% at launch, then 18–20%) plus paid featured placement. Delivery fees and tips go entirely to couriers.

**Innovation:** an integrated system of geographic zones, dispatch and delivery tracking, server-side pricing with webhook-confirmed payments, a split-payment ledger, and competitive offers between florists.

The planned R&D covers:
- demand forecasting for florists, to reduce unsold-flower waste;
- optimising how deliveries are assigned to couriers.

## Executive summary (one page, for emails and applications)

- **What:** same-day local-florist marketplace with its own courier network (customer app, partner app, admin panel — built).
- **Where:** Bergamo first (2027), then Lombardy.
- **Why now:** local florists lack online sales and delivery; customers want same-day, tracked gifting.
- **Model:** commission on flowers (15% → 20%) and featured placement; delivery fee and tips to couriers.
- **Numbers (estimates):** €20k revenue in 2027 rising to €1.54M in 2031; EBITDA positive in 2031.
- **Ask:** €50k angel round, combined with a €240k Smart&Start loan and a €10k Lombardy grant.

## Technical overview

| Layer | Technology | Notes |
|---|---|---|
| Mobile apps | React Native with Expo SDK 57, TypeScript | two apps (customer, partner); push notifications; background location only during active deliveries; camera for proof photos; Stripe Payment Sheet |
| Admin | Next.js 16 (backend-for-frontend with httpOnly cookies) | analytics, verification, refunds, payouts, audit |
| API | NestJS 12, Node 24, strict TypeScript | REST under `/api/v1`; validation with Zod; rate limiting shared via PostgreSQL; Italian/English errors |
| Data | PostgreSQL 17 + PostGIS | 24 versioned SQL migrations; geographic zones and distance search |
| Payments | Stripe | totals computed by the server; payment confirmed only by signed webhook; refunds; ledger for commission, florist revenue, delivery fees, tips and payouts |
| Storage | S3-compatible (SigV4) | public product photos; private offer and proof photos |
| Security | scrypt password hashing, short-lived access tokens, audit log, GDPR export and deletion | no plaintext secrets in code |
| Quality | 150 unit + 72 integration tests; GitHub Actions CI; Docker images for API and admin | |
