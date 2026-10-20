// Italian versions of every message the API can send to a client (ADR-020). Unknown messages stay in English.
// messages-it.test.ts fails when an exception message in the source has no entry here.

const EXACT: Readonly<Record<string, string>> = {
  // auth & accounts
  'Invalid email or password.': 'Email o password non corretti.',
  'Session expired. Please sign in again.': 'Sessione scaduta. Accedi di nuovo.',
  'This link is invalid or has expired. Request a new one.': 'Il link non è valido o è scaduto. Richiedine uno nuovo.',
  'This account is suspended. Contact Flower Man support.': "Questo account è sospeso. Contatta l'assistenza Flower Man.",
  'An account with this email already exists. Sign in instead.': 'Esiste già un account con questa email. Accedi.',
  'No active Flower Man account with this email.': 'Nessun account Flower Man attivo con questa email.',
  'Sign in required.': 'Devi accedere.',
  'Invalid or expired access token.': 'Accesso non valido o scaduto.',
  'Session is no longer valid. Please sign in again.': 'La sessione non è più valida. Accedi di nuovo.',
  'You do not have permission to do this.': 'Non hai i permessi per questa operazione.',
  'Too many attempts. Please wait and try again.': 'Troppi tentativi. Attendi e riprova.',
  'Enter a valid email address.': 'Inserisci un indirizzo email valido.',
  'Enter your full name.': 'Inserisci nome e cognome.',
  'Enter the phone number in international format, e.g. +393331234567.': 'Inserisci il numero in formato internazionale, ad es. +393331234567.',
  'Use international format, e.g. +393331234567.': 'Usa il formato internazionale, ad es. +393331234567.',
  'Please verify your email address before placing an order.': 'Conferma il tuo indirizzo email prima di ordinare.',
  'A deletion request is already pending.': "C'è già una richiesta di cancellazione in corso.",
  'Expected an Expo push token.': 'Token di notifica non valido.',
  // generic
  'Invalid identifier.': 'Identificativo non valido.',
  'Invalid reference.': 'Riferimento non valido.',
  'Unknown status.': 'Stato sconosciuto.',
  'User not found.': 'Utente non trovato.',
  'Unauthorized': 'Devi accedere.',
  'Forbidden': 'Accesso negato.',
  'Forbidden resource': 'Accesso negato.',
  'Not Found': 'Non trovato.',
  'Bad Request': 'Richiesta non valida.',
  'Internal server error.': 'Errore interno del server.',
  'request entity too large': 'Contenuto troppo grande.',
  // zones & location
  'Flower Man does not deliver to this location yet.': 'Flower Man non consegna ancora in questa zona.',
  'lat and lng query parameters are required (decimal degrees).': 'Servono i parametri lat e lng (gradi decimali).',
  'A zone with this code already exists.': 'Esiste già una zona con questo codice.',
  'Zone not found.': 'Zona non trovata.',
  'Invalid zone area: expected a GeoJSON Polygon or MultiPolygon.': 'Area della zona non valida: serve un Polygon o MultiPolygon GeoJSON.',
  // partners
  'Partner account not found.': 'Account partner non trovato.',
  'An approved courier account is required.': 'Serve un account corriere approvato.',
  'An approved shop or freelance seller account is required.': 'Serve un account negozio o venditore indipendente approvato.',
  'Legal details of a submitted account cannot be changed. Contact support.': "I dati legali di un account inviato non si possono modificare. Contatta l'assistenza.",
  'Only shop owners can add staff.': 'Solo il titolare del negozio può aggiungere personale.',
  'Only the owner can edit the partner profile.': 'Solo il titolare può modificare il profilo.',
  'Only the owner can see earnings.': 'Solo il titolare può vedere i guadagni.',
  'Only the owner can submit the application.': 'Solo il titolare può inviare la richiesta.',
  'Seller not found.': 'Venditore non trovato.',
  'This partner has no positive unsettled balance.': 'Questo partner non ha un saldo positivo da liquidare.',
  // catalogue
  'Product not found.': 'Prodotto non trovato.',
  'This product is not available.': 'Questo prodotto non è disponibile.',
  'Photo not found.': 'Foto non trovata.',
  'Photo too large (max 5 MB).': 'Foto troppo grande (max 5 MB).',
  'Photo too large (max 8 MB).': 'Foto troppo grande (max 8 MB).',
  'The photo must be a JPEG, PNG or WebP image.': "La foto deve essere un'immagine JPEG, PNG o WebP.",
  'Send the photo as the request body (Content-Type image/jpeg, image/png or image/webp).': 'Invia la foto come corpo della richiesta (Content-Type image/jpeg, image/png o image/webp).',
  // cart, orders, payments
  'Your cart is empty.': 'Il carrello è vuoto.',
  'The florist is closed at that time. Choose another slot.': "A quell'ora il fiorista è chiuso. Scegli un'altra fascia.",
  'Use HH:MM-HH:MM or closed.': 'Usa HH:MM-HH:MM oppure closed.',
  'Opening must be before closing.': "L'apertura deve essere prima della chiusura.",
  'This code is not valid.': 'Questo codice non è valido.',
  'You have already used this code.': 'Hai già usato questo codice.',
  'This code has reached its limit.': 'Questo codice ha raggiunto il limite di utilizzi.',
  'This code is for first orders only.': 'Questo codice vale solo per il primo ordine.',
  'This code gives no discount on this order.': 'Questo codice non dà sconti su questo ordine.',
  'A code with this name already exists.': 'Esiste già un codice con questo nome.',
  'Check the dates and amounts of the code.': 'Controlla date e importi del codice.',
  'Code not found.': 'Codice non trovato.',
  'Use 3–32 letters, digits or dashes.': 'Usa da 3 a 32 lettere, cifre o trattini.',
  'A percentage must be between 1 and 100.': 'La percentuale deve essere tra 1 e 100.',
  'Custom bouquets cannot be ordered again. Send a new request instead.': 'I mazzi su misura non si possono riordinare. Invia una nuova richiesta.',
  'None of these flowers are available any more.': 'Nessuno di questi fiori è più disponibile.',
  'Your cart has flowers from another seller. Check out or empty it first.': "Il carrello contiene fiori di un altro venditore. Completa l'ordine o svuotalo prima.",
  'This seller does not deliver to that address.': 'Questo venditore non consegna a questo indirizzo.',
  'This seller is not accepting orders right now.': 'Questo venditore al momento non accetta ordini.',
  'Order not found.': 'Ordine non trovato.',
  'This order does not need payment.': 'Questo ordine non deve essere pagato.',
  'Payment not found.': 'Pagamento non trovato.',
  'Simulated payments are disabled.': 'I pagamenti di prova sono disattivati.',
  'outcome must be succeed or fail.': 'outcome deve essere succeed o fail.',
  'This order has no captured payment to refund.': 'Questo ordine non ha un pagamento da rimborsare.',
  'Invalid webhook signature.': 'Firma del webhook non valida.',
  'Missing signature or body.': 'Firma o contenuto mancante.',
  // custom requests
  'Request not found.': 'Richiesta non trovata.',
  'Only open requests can be cancelled.': 'Si possono annullare solo le richieste aperte.',
  'An offer has already been selected, or the request is closed.': "È già stata scelta un'offerta, oppure la richiesta è chiusa.",
  'This offer is no longer available.': 'Questa offerta non è più disponibile.',
  'There is no submitted offer to withdraw.': 'Non ci sono offerte inviate da ritirare.',
  'Your offer can no longer be changed.': 'La tua offerta non può più essere modificata.',
  'This request is not open in your area.': 'Questa richiesta non è aperta nella tua zona.',
  'availableFrom must not be in the past.': 'La disponibilità non può essere nel passato.',
  'deliveryWindowEnd must be after deliveryWindowStart': "La fine della fascia di consegna deve essere dopo l'inizio.",
  // delivery
  'Delivery not found.': 'Consegna non trovata.',
  'This job is no longer available.': 'Questa consegna non è più disponibile.',
  'Location sharing is only accepted during an active delivery.': 'La posizione si condivide solo durante una consegna attiva.',
  'recordedAt must be within the last 24 hours.': 'La posizione deve essere delle ultime 24 ore.',
  'You can only mark arrival while the delivery is in transit.': "Puoi segnare l'arrivo solo durante il trasporto.",
  'Proof can only be captured while the delivery is in transit.': 'La prova di consegna si scatta solo durante il trasporto.',
  'Capture the delivery proof photo before completing.': 'Scatta la foto di consegna prima di completare.',
  'The proof must be a JPEG, PNG or WebP image.': "La prova deve essere un'immagine JPEG, PNG o WebP.",
  'No proof for this delivery.': 'Nessuna prova per questa consegna.',
  'No delivery photo for this order yet.': 'Ancora nessuna foto di consegna per questo ordine.',
  // reviews
  'You can review an order once it has been delivered.': 'Puoi recensire un ordine dopo la consegna.',
  'This order had no courier to rate.': 'Questo ordine non aveva un corriere da valutare.',
  'This order has already been reviewed.': 'Hai già recensito questo ordine.',
  'Review not found.': 'Recensione non trovata.',
  // admin
  'Settlement not found.': 'Liquidazione non trovata.',
  'externalReference (bank transfer / provider reference) is required to mark a settlement paid.':
    'Serve il riferimento del bonifico per segnare la liquidazione come pagata.',
  'No pending deletion request with this id.': 'Nessuna richiesta di cancellazione in corso con questo id.',
  'Only the platform owner can change an administrator.': 'Solo il titolare della piattaforma può modificare un amministratore.',
  'Only the platform owner can change platform roles.': 'Solo il titolare della piattaforma può modificare i ruoli.',
  'Platform owners cannot be suspended through the API.': "I titolari della piattaforma non si possono sospendere tramite l'API.",
  'Remove platform roles before deleting this account.': "Rimuovi i ruoli di piattaforma prima di eliminare l'account.",
  'You cannot change your own status.': 'Non puoi cambiare il tuo stato.',
  'You cannot remove your own platform role.': 'Non puoi rimuovere il tuo ruolo di piattaforma.',
};

const STATUS_IT: Readonly<Record<string, string>> = {
  PENDING_PAYMENT: 'in attesa di pagamento', PAID: 'pagato', CONFIRMED: 'confermato', PREPARING: 'in preparazione',
  READY_FOR_PICKUP: 'pronto per il ritiro', COURIER_ASSIGNED: 'corriere assegnato', PICKED_UP: 'ritirato', IN_TRANSIT: 'in consegna',
  DELIVERED: 'consegnato', CANCELLED: 'annullato', REFUNDED: 'rimborsato', OFFERED: 'offerta', ASSIGNED: 'assegnata',
};
const status = (value: string) => STATUS_IT[value] ?? value.replaceAll('_', ' ').toLowerCase();

/** Messages built with values: matched by shape. */
const PATTERNS: ReadonlyArray<readonly [RegExp, (...groups: string[]) => string]> = [
  [/^Only (\d+) left in stock\.$/, (n) => `Ne restano solo ${n}.`],
  [/^Only (\d+) of "(.+)" left\.$/, (n, name) => `Di "${name}" ne restano solo ${n}.`],
  [/^"(.+)" is no longer available\. Remove it from your cart\.$/, (name) => `"${name}" non è più disponibile. Toglilo dal carrello.`],
  [/^Prices changed: the total is now €([\d.]+)\. Please review your cart\.$/, (total) => `I prezzi sono cambiati: il totale ora è ${total.replace('.', ',')} €. Controlla il carrello.`],
  [/^Requested delivery time must be between (\d+) minutes and (\d+) days from now\.$/, (min, days) => `L'orario di consegna deve essere tra ${min} minuti e ${days} giorni da adesso.`],
  [/^Reviews are possible for (\d+) days after delivery\.$/, (days) => `Puoi recensire fino a ${days} giorni dopo la consegna.`],
  [/^You already have a (\w+) partner account\.$/, () => 'Hai già un account partner di questo tipo.'],
  [/^Complete your profile before submitting: (.+)\.$/, (missing) => `Completa il profilo prima di inviarlo: ${missing}.`],
  [/^You manage several seller accounts: send the (.+) header\.$/, (header) => `Gestisci più account venditore: invia l'intestazione ${header}.`],
  [/^An order in status (\w+) cannot be refunded\.$/, (s) => `Un ordine nello stato "${status(s)}" non può essere rimborsato.`],
  [/^Refund amount must be between 1 and (\d+) cents\.$/, (max) => `L'importo del rimborso deve essere tra 1 e ${max} centesimi.`],
  [/^category must be one of (.+)\.$/, (list) => `La categoria deve essere una tra: ${list}.`],
  [/^This code needs a minimum order of €([\d.]+)\.$/, (amount) => `Questo codice richiede un ordine minimo di ${amount.replace('.', ',')} €.`],
  [/^days must be one of (.+)\.$/, (list) => `Il periodo deve essere uno tra: ${list} giorni.`],
  // Domain state machine (TransitionError).
  [/^(\w+) cannot go from (\w+) to (\w+) \(requested by \w+\)\.$/, (_name, from, to) => `Operazione non possibile: da "${status(from)}" a "${status(to)}".`],
];

export function translateToItalian(message: string): string {
  const exact = EXACT[message];
  if (exact) return exact;
  for (const [pattern, render] of PATTERNS) {
    const match = pattern.exec(message);
    if (match) return render(...match.slice(1));
  }
  return message;
}

export const ITALIAN_MESSAGES: ReadonlySet<string> = new Set(Object.keys(EXACT));
