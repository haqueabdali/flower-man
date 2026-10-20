(function () {
  "use strict";

  // Contact details shown on the site. Replace the placeholders with the real ones.
  // whatsapp: international format, digits only (e.g. "8801712345678"); leave "" to hide the WhatsApp button.
  // form: where contact requests are delivered. Without an endpoint the form only prepares a message to copy.
  //   Web3Forms: endpoint "https://api.web3forms.com/submit" and accessKey from web3forms.com
  //   Formspree: endpoint "https://formspree.io/f/<form id>" and accessKey ""
  var CONFIG = {
    phone: "+880 1XXX-XXXXXX",
    whatsapp: "",
    email: "info@bareezahsolutions.com",
    form: { endpoint: "", accessKey: "" },
    address: { bn: "ঠিকানা এখানে যুক্ত করুন, বাংলাদেশ", en: "Add your office address, Bangladesh" },
    hours: { bn: "শনি থেকে বৃহস্পতিবার, সকাল ১০টা থেকে সন্ধ্যা ৬টা", en: "Saturday to Thursday, 10 am to 6 pm" }
  };

  var CATEGORIES = [
    { id: "all", bn: "সব সেবা", en: "All services" },
    { id: "finance", bn: "হিসাব ও কমপ্লায়েন্স", en: "Finance & Compliance" },
    { id: "advisory", bn: "পরামর্শ ও প্রশিক্ষণ", en: "Advisory & Training" },
    { id: "trade", bn: "বাণিজ্য ও সরবরাহ", en: "Trade & Supply" },
    { id: "tech", bn: "প্রযুক্তি ও অপারেশন", en: "Technology & Operations" }
  ];

  // The 13 objects listed in clause 4 of the memorandum, in their original order.
  var SERVICES = [
    { id: "accounting", cat: "finance",
      bn: { t: "হিসাবরক্ষণ ও বুককিপিং সেবা", d: "দৈনন্দিন লেনদেন থেকে মাসিক আর্থিক প্রতিবেদন পর্যন্ত, পরিষ্কার ও নিরীক্ষাযোগ্য হিসাব।",
        inc: ["দৈনিক লেনদেন ও লেজার হালনাগাদ", "ব্যাংক রিকনসিলিয়েশন", "মাসিক লাভ-ক্ষতি ও ব্যালান্স শিট", "বেতন ও খরচের রেকর্ড"] },
      en: { t: "Accounting & Bookkeeping", d: "Clean, audit-ready books, from daily entries to monthly financial statements.",
        inc: ["Daily entries and ledger upkeep", "Bank reconciliation", "Monthly P&L and balance sheet", "Payroll and expense records"] } },
    { id: "vat-tax", cat: "finance", tags: "vat tax bin tin mushak ভ্যাট ট্যাক্স কর",
      bn: { t: "ভ্যাট ও ট্যাক্স সহায়তা ও পরামর্শ", d: "BIN নিবন্ধন, মাসিক ভ্যাট রিটার্ন ও আয়কর বিষয়ে সময়মতো সহায়তা।",
        inc: ["BIN (ভ্যাট) নিবন্ধন সহায়তা", "মাসিক ভ্যাট রিটার্ন (মূসক-৯.১) প্রস্তুতি", "e-TIN ও আয়কর রিটার্ন সহায়তা", "উৎসে কর (TDS/VDS) হিসাব"],
        lic: "নির্দিষ্ট পেশাগত লাইসেন্স প্রয়োজন এমন কাজ সংশ্লিষ্ট লাইসেন্স গ্রহণের পরই করা হয়।" },
      en: { t: "VAT & Tax Support and Advisory", d: "Timely help with BIN registration, monthly VAT returns and income tax.",
        inc: ["BIN (VAT) registration support", "Monthly VAT return (Mushak-9.1) preparation", "e-TIN and income tax return support", "Withholding tax (TDS/VDS) calculation"],
        lic: "Work that needs a specific professional licence is carried out only after that licence is obtained." } },
    { id: "compliance", cat: "finance", tags: "rjsc trade licence ট্রেড লাইসেন্স",
      bn: { t: "ব্যবসায়িক ডকুমেন্টেশন ও কমপ্লায়েন্স সেবা", d: "ট্রেড লাইসেন্স নবায়ন থেকে RJSC রিটার্ন পর্যন্ত, নথি ও সময়সীমা গুছিয়ে রাখা।",
        inc: ["ট্রেড লাইসেন্স আবেদন ও নবায়ন", "RJSC বার্ষিক রিটার্ন ও নথি", "চুক্তিপত্র ও ব্যবসায়িক নথির খসড়া", "কমপ্লায়েন্স ক্যালেন্ডার ও রিমাইন্ডার"] },
      en: { t: "Business Documentation & Compliance", d: "Documents and deadlines kept in order, from trade licence renewal to RJSC returns.",
        inc: ["Trade licence application and renewal", "RJSC annual returns and filings", "Drafting contracts and business documents", "Compliance calendar and reminders"] } },
    { id: "advisory", cat: "advisory",
      bn: { t: "ব্যবসায়িক পরামর্শ ও ব্যবস্থাপনা সহায়তা", d: "পরিকল্পনা, বাজেট ও সিদ্ধান্ত গ্রহণে বাস্তবভিত্তিক পরামর্শ।",
        inc: ["ব্যবসায়িক পরিকল্পনা ও বাজেট", "খরচ নিয়ন্ত্রণ ও মুনাফা বিশ্লেষণ", "ব্যবস্থাপনা কাঠামো ও নীতিমালা", "ব্যাংক ঋণের জন্য প্রস্তাবনা প্রস্তুতি"] },
      en: { t: "Business Advisory & Management Support", d: "Practical advice on planning, budgets and decisions.",
        inc: ["Business plans and budgets", "Cost control and margin analysis", "Management structure and policies", "Loan proposal preparation"] } },
    { id: "training", cat: "advisory",
      bn: { t: "পেশাগত ও কর্পোরেট প্রশিক্ষণ", d: "আপনার দলের জন্য হিসাব, ভ্যাট, অফিস ব্যবস্থাপনা ও সফট স্কিল প্রশিক্ষণ।",
        inc: ["হিসাব ও ভ্যাট বিষয়ক কর্মশালা", "অফিস সফটওয়্যার ও এক্সেল দক্ষতা", "কর্পোরেট আচরণ ও যোগাযোগ দক্ষতা", "প্রতিষ্ঠানভিত্তিক কাস্টম প্রশিক্ষণ"] },
      en: { t: "Professional & Corporate Training", d: "Accounting, VAT, office and soft-skill training for your team.",
        inc: ["Accounting and VAT workshops", "Office software and Excel skills", "Workplace conduct and communication", "Custom in-house programmes"] } },
    { id: "import-export", cat: "trade", tags: "lc irc erc customs এলসি",
      bn: { t: "আমদানি ও রপ্তানি", d: "পণ্য সংগ্রহ, এলসি সংক্রান্ত নথি ও শিপমেন্ট সমন্বয়।",
        inc: ["পণ্য সোর্সিং ও সরবরাহকারী যাচাই", "এলসি ও শিপিং নথি প্রস্তুতি", "সিঅ্যান্ডএফ ও কাস্টমস সমন্বয়", "রপ্তানি অর্ডার ব্যবস্থাপনা"],
        lic: "IRC (আমদানি নিবন্ধন সনদ) / ERC (রপ্তানি নিবন্ধন সনদ)" },
      en: { t: "Import & Export", d: "Sourcing, LC documents and shipment coordination.",
        inc: ["Product sourcing and supplier checks", "LC and shipping documents", "C&F and customs coordination", "Export order management"],
        lic: "IRC (import registration certificate) / ERC (export registration certificate)" } },
    { id: "contracting", cat: "trade", tags: "tender দরপত্র টেন্ডার",
      bn: { t: "ঠিকাদারি ও প্রকল্পভিত্তিক ব্যবসা", d: "সরবরাহ, সেবা ও প্রকল্পভিত্তিক চুক্তি, পরিকল্পনা থেকে হস্তান্তর পর্যন্ত।",
        inc: ["টেন্ডার ও দরপত্র নথি প্রস্তুতি", "প্রকল্প পরিকল্পনা ও বাজেট", "সরবরাহ ও কাজের তদারকি", "বিল ও হস্তান্তর নথি"],
        lic: "সংশ্লিষ্ট দপ্তরে ঠিকাদারি তালিকাভুক্তি (এনলিস্টমেন্ট)" },
      en: { t: "Contracting & Project-based Business", d: "Supply, service and project contracts, from planning to handover.",
        inc: ["Tender document preparation", "Project planning and budgeting", "Supply and works supervision", "Billing and handover documents"],
        lic: "Contractor enlistment with the relevant authority" } },
    { id: "garments", cat: "trade", tags: "label zipper button trims",
      bn: { t: "গার্মেন্টস এক্সেসরিজ ব্যবসা", d: "লেবেল, ট্যাগ, বাটন, জিপার, পলিব্যাগ ও কার্টনসহ কারখানার এক্সেসরিজ সরবরাহ।",
        inc: ["লেবেল, হ্যাংট্যাগ ও স্টিকার", "বাটন, জিপার ও ট্রিমস", "পলিব্যাগ ও কার্টন প্যাকেজিং", "বায়ারের স্পেসিফিকেশন অনুযায়ী নমুনা"] },
      en: { t: "Garments Accessories", d: "Labels, tags, buttons, zippers, poly bags and cartons for factories.",
        inc: ["Labels, hang tags and stickers", "Buttons, zippers and trims", "Poly bag and carton packaging", "Samples to buyer specification"] } },
    { id: "software", cat: "tech", tags: "website erp pos it",
      bn: { t: "সফটওয়্যার ও ব্যবসায়িক প্রযুক্তি সেবা", d: "ওয়েবসাইট, হিসাব ও ইনভেন্টরি সফটওয়্যার এবং ডিজিটাল কাজের ধারা।",
        inc: ["ব্যবসায়িক ওয়েবসাইট ও ওয়েব অ্যাপ", "হিসাব, ইনভেন্টরি ও POS সফটওয়্যার সেটআপ", "অফিস অটোমেশন ও রিপোর্টিং", "আইটি সাপোর্ট ও রক্ষণাবেক্ষণ"] },
      en: { t: "Software & Business Technology", d: "Websites, accounting and inventory software, and digital workflows.",
        inc: ["Business websites and web apps", "Accounting, inventory and POS setup", "Office automation and reporting", "IT support and maintenance"] } },
    { id: "admin", cat: "tech", tags: "data entry hr bpo",
      bn: { t: "ব্যবসায়িক প্রক্রিয়া ও প্রশাসনিক সহায়তা", d: "ডেটা এন্ট্রি, নথি ব্যবস্থাপনা ও দৈনন্দিন অফিস কাজ আমাদের হাতে দিন।",
        inc: ["ডেটা এন্ট্রি ও রেকর্ড ব্যবস্থাপনা", "নথি স্ক্যান, সংরক্ষণ ও ফাইলিং", "ক্রয় ও বিক্রয় প্রক্রিয়া সহায়তা", "এইচআর ও অফিস প্রশাসন"] },
      en: { t: "Business Process & Administrative Support", d: "Hand over data entry, document management and routine office work.",
        inc: ["Data entry and record keeping", "Scanning, archiving and filing", "Purchase and sales process support", "HR and office administration"] } },
    { id: "consultancy", cat: "advisory", tags: "feasibility startup",
      bn: { t: "কনসালটেন্সি ও পেশাগত সেবা", d: "নতুন ব্যবসা শুরু, সম্প্রসারণ বা পুনর্গঠনে বিশেষজ্ঞ পরামর্শ।",
        inc: ["নতুন ব্যবসা শুরুর রোডম্যাপ", "ফিজিবিলিটি ও বাজার যাচাই", "প্রক্রিয়া পর্যালোচনা ও উন্নয়ন", "চলমান রিটেইনার পরামর্শ"],
        lic: "পেশাগত অনুমতিপত্র প্রয়োজন এমন বিষয়ে সংশ্লিষ্ট অনুমোদন গ্রহণের পর।" },
      en: { t: "Consultancy & Professional Services", d: "Expert advice for starting, growing or restructuring a business.",
        inc: ["Start-up roadmap", "Feasibility and market checks", "Process review and improvement", "Ongoing retainer advice"],
        lic: "Where a professional permit is required, only after it is obtained." } },
    { id: "trading", cat: "trade", tags: "wholesale supply distribution",
      bn: { t: "ট্রেডিং ও ডিস্ট্রিবিউশন কার্যক্রম", d: "পাইকারি ক্রয়-বিক্রয়, প্রাতিষ্ঠানিক সরবরাহ ও বিতরণ।",
        inc: ["পাইকারি ক্রয় ও বিক্রয়", "প্রাতিষ্ঠানিক সরবরাহ (কর্পোরেট সাপ্লাই)", "গুদাম ও স্টক ব্যবস্থাপনা", "ডিলার ও বিতরণ সমন্বয়"] },
      en: { t: "Trading & Distribution", d: "Wholesale buying and selling, institutional supply and distribution.",
        inc: ["Wholesale purchase and sale", "Corporate and institutional supply", "Warehouse and stock management", "Dealer and distribution coordination"] } },
    { id: "other", cat: "trade",
      bn: { t: "আইনানুগ অন্যান্য ব্যবসা", d: "বাংলাদেশের প্রচলিত আইনে অনুমোদিত অন্যান্য বৈধ ব্যবসায়িক কার্যক্রম।",
        inc: ["আপনার প্রয়োজন জানান, আমরা সম্ভাব্যতা যাচাই করব", "প্রয়োজনীয় অনুমোদনের তালিকা ও পরিকল্পনা", "অনুমোদনের পর কার্যক্রম শুরু"],
        lic: "কার্যক্রমের ধরন অনুযায়ী সংশ্লিষ্ট লাইসেন্স, নিবন্ধন বা অনুমোদন।" },
      en: { t: "Other Lawful Business", d: "Other legitimate activities permitted under the laws of Bangladesh.",
        inc: ["Tell us the need and we assess feasibility", "List of required approvals and a plan", "Work begins once approvals are in place"],
        lic: "The licence, registration or approval that the activity requires." } }
  ];

  // English strings. Bangla is the default and lives in the HTML itself.
  var EN = {
    "skip": "Skip to content",
    "nav.services": "Services", "nav.process": "How we work", "nav.compliance": "Law & approvals", "nav.faq": "FAQ", "nav.contact": "Contact",
    "cta.consult": "Talk to us", "cta.services": "See all services",
    "hero.eyebrow": "Bangladesh · Multi-service business firm",
    "hero.title": "From the ledger to the shipment, one firm.",
    "hero.lede": "Bareezah Solutions provides accounting, VAT and tax, compliance, training, import and export, contracting and technology services, in line with the laws of Bangladesh.",
    "fact.lines": "service lines", "fact.law.k": "Lawful", "fact.law": "Run under the laws in force", "fact.lic.k": "Licensed", "fact.lic": "Work starts after approval",
    "memo.tag": "Memorandum · Clause 4", "memo.title": "Nature and objects of business", "memo.foot": "Tap any item to see the details.",
    "aud.label": "Who we work with", "aud.1": "New founders", "aud.2": "Small and mid-sized firms", "aud.3": "Importers and exporters", "aud.4": "Garment factories", "aud.5": "Corporates",
    "svc.eyebrow": "Services", "svc.title": "Find what your business needs", "svc.search": "Search, e.g. VAT",
    "svc.empty": "No service matches that search. Try another word or ask us directly.",
    "proc.eyebrow": "How we work", "proc.title": "From the first call to ongoing support",
    "proc.1.t": "First conversation", "proc.1.d": "We learn about your business, the problem and the goal.",
    "proc.2.t": "Needs and documents", "proc.2.d": "We review your current books, registrations and papers.",
    "proc.3.t": "Licence and approval check", "proc.3.d": "We confirm which approvals each piece of work needs.",
    "proc.4.t": "Proposal and agreement", "proc.4.d": "Scope, timeline and fee, in writing.",
    "proc.5.t": "Delivery and support", "proc.5.d": "We do the work and stay on for monthly support if you need it.",
    "comp.eyebrow": "Law & approvals", "comp.title": "Approval first, then the work",
    "comp.quote": "Where any business activity requires a specific licence, registration, approval or professional permit, that activity will be carried out only after the relevant approval has been obtained.",
    "comp.cite": "Memorandum, Clause 4", "comp.list": "Registrations businesses often need",
    "reg.trade": "Trade licence, city corporation or municipality", "reg.tin": "Taxpayer identification number, NBR", "reg.bin": "VAT registration, NBR",
    "reg.irc": "Import and export registration certificates", "reg.rjsc": "Company registration and annual returns", "reg.enl": "Contractor enlistment",
    "faq.eyebrow": "FAQ", "faq.title": "Common questions", "faq.note": "If your question is not here, ask us directly.",
    "faq.1.q": "Can we take bookkeeping and VAT returns together?", "faq.1.a": "Yes. Bookkeeping, VAT returns and compliance can run as one monthly package, so your books and returns always agree.",
    "faq.2.q": "How are fees set?", "faq.2.a": "By the scope of work and your transaction volume. After the first conversation we send a written quotation.",
    "faq.3.q": "What do we need for import or export?", "faq.3.a": "Usually a trade licence, e-TIN, BIN and an IRC (import) or ERC (export) certificate. We check what you have and what is missing.",
    "faq.4.q": "Can training take place at our office?", "faq.4.a": "Yes. Workshops are arranged at your office or online, shaped to your team.",
    "faq.5.q": "Will our financial data stay confidential?", "faq.5.a": "All client documents and data are kept confidential and used only for the agreed work.",
    "ct.eyebrow": "Contact", "ct.title": "Tell us what you need", "ct.lede": "Fill in the form. We will prepare a message you can send on WhatsApp or copy.",
    "ct.phone": "Phone / WhatsApp", "ct.email": "Email", "ct.address": "Address", "ct.hours": "Office hours", "copy": "Copy",
    "f.name": "Your name *", "f.org": "Organisation", "f.phone": "Mobile number", "f.email": "Email", "f.services": "Which services do you need? *",
    "f.msg": "Short details", "f.msg.ph": "e.g. We need monthly VAT returns and bookkeeping, about 200 transactions a month.", "f.submit": "Prepare message",
    "r.title": "Your message is ready", "r.copy": "Copy message", "r.wa": "Open in WhatsApp", "r.note": "Once you send it, we reply within working days.",
    "f.consent": "By submitting this form you agree to our", "f.privacy": "Privacy policy", "f.consent2": ".", "f.send": "Send request",
    "s.title": "Thank you, your request has arrived.", "s.body": "We will contact you on the number or email you gave, within working days.", "s.again": "Send another request",
    "r.failed": "The request could not be sent online. Copy the message below and send it by email or WhatsApp.",
    "sh.inc": "What is included", "sh.lic": "Approval required", "sh.ask": "Ask about this service",
    "ft.line": "A multi-service business firm run under the laws in force in Bangladesh.", "ft.rights": "All rights reserved."
  };

  var MSG = {
    bn: { needName: "আপনার নাম লিখুন।", needContact: "মোবাইল নম্বর অথবা ইমেইল, অন্তত একটি দিন।", badEmail: "ইমেইল ঠিকানাটি সঠিক নয়।",
      badPhone: "মোবাইল নম্বরটি সঠিক নয়, যেমন 01712345678।", needSvc: "অন্তত একটি সেবা বেছে নিন।", copied: "কপি হয়েছে", sending: "পাঠানো হচ্ছে…", subject: "ওয়েবসাইট থেকে নতুন অনুরোধ", copyFail: "কপি করা যায়নি, লেখাটি সিলেক্ট করে কপি করুন",
      themes: { system: "থিম: সিস্টেম", light: "থিম: লাইট", dark: "থিম: ডার্ক" }, details: "বিস্তারিত দেখুন", needsLic: "অনুমোদন সাপেক্ষ",
      hello: "আসসালামু আলাইকুম, বারিজাহ সলিউশনস।", lName: "নাম", lOrg: "প্রতিষ্ঠান", lPhone: "মোবাইল", lEmail: "ইমেইল", lSvc: "প্রয়োজনীয় সেবা", lMsg: "বিস্তারিত", item: "আইটেম" },
    en: { needName: "Please enter your name.", needContact: "Give a mobile number or an email, at least one.", badEmail: "That email address does not look right.",
      badPhone: "That mobile number does not look right, e.g. 01712345678.", needSvc: "Choose at least one service.", copied: "Copied", sending: "Sending…", subject: "New request from the website", copyFail: "Could not copy. Select the text and copy it.",
      themes: { system: "Theme: system", light: "Theme: light", dark: "Theme: dark" }, details: "See details", needsLic: "Needs approval",
      hello: "Hello Bareezah Solutions,", lName: "Name", lOrg: "Organisation", lPhone: "Mobile", lEmail: "Email", lSvc: "Services needed", lMsg: "Details", item: "Item" }
  };

  var BN_DIGITS = "০১২৩৪৫৬৭৮৯";
  function num(n, lang) {
    var s = String(n);
    return lang === "bn" ? s.replace(/\d/g, function (d) { return BN_DIGITS[d]; }) : s;
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { e.setAttribute(k, attrs[k]); });
    if (text != null) e.textContent = text;
    return e;
  }
  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value);
    } catch (e) { return null; }
  }

  var ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  var TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>';

  var state = { lang: store("bz.lang") === "en" ? "en" : "bn", cat: "all", q: "", current: null };
  var BN = {};

  // ---- Language ----
  function captureBangla() {
    $$("[data-i18n]").forEach(function (n) { BN[n.getAttribute("data-i18n")] = n.textContent; });
    $$("[data-i18n-ph]").forEach(function (n) { BN[n.getAttribute("data-i18n-ph")] = n.getAttribute("placeholder"); });
    BN["f.send"] = "অনুরোধ পাঠান";
  }
  function latinDigits(s) { return s.replace(/[০-৯]/g, function (d) { return BN_DIGITS.indexOf(d); }); }
  function t(key) { return (state.lang === "en" ? EN : BN)[key] || BN[key] || key; }

  function applyLang() {
    var lang = state.lang;
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    $$("[data-i18n-ph]").forEach(function (n) { n.setAttribute("placeholder", t(n.getAttribute("data-i18n-ph"))); });
    $("#langLabel").textContent = lang === "bn" ? "EN" : "বাং";
    $("#langBtn").setAttribute("aria-label", lang === "bn" ? "Switch to English" : "বাংলায় দেখুন");
    $("#factCount").textContent = num(SERVICES.length, lang);
    $$(".step-n").forEach(function (n) { n.setAttribute("data-label", num(n.getAttribute("data-n"), lang)); });
    $("#cAddress").textContent = CONFIG.address[lang];
    $("#cHours").textContent = CONFIG.hours[lang];
    $("#year").textContent = num(new Date().getFullYear(), lang);
    if (CONFIG.form.endpoint) $("#submitBtn").textContent = t("f.send");
    updateThemeLabel();
    renderMemo();
    renderChips();
    renderGrid();
    renderPick();
    if (state.current) fillSheet(state.current);
    if (!$("#result").hidden) buildMessage();
    window.dispatchEvent(new CustomEvent("bz:lang", { detail: lang }));
  }
  function setLang(lang) {
    if (lang === state.lang) return;
    state.lang = lang;
    store("bz.lang", lang);
    applyLang();
  }

  // ---- Theme ----
  var THEMES = ["system", "light", "dark"];
  var ICONS = {
    system: "M12 3a9 9 0 1 0 0 18V3z M12 3a9 9 0 0 1 0 18",
    light: "M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4",
    dark: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"
  };
  var theme = THEMES.indexOf(store("bz.theme")) > -1 ? store("bz.theme") : "system";
  function applyTheme() {
    if (theme === "system") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", theme);
    $("#themeIcon").setAttribute("d", ICONS[theme]);
    updateThemeLabel();
  }
  function updateThemeLabel() {
    var label = MSG[state.lang].themes[theme];
    $("#themeBtn").setAttribute("aria-label", label);
    $("#themeBtn").title = label;
  }

  // ---- Memorandum list ----
  function renderMemo() {
    var list = $("#memoList");
    list.textContent = "";
    SERVICES.forEach(function (s, i) {
      var li = el("li");
      var b = el("button", { type: "button", "aria-label": s[state.lang].t });
      b.style.setProperty("--i", i);
      b.appendChild(el("span", { "class": "memo-n" }, num(i + 1, state.lang) + "."));
      b.appendChild(el("span", { "class": "memo-t" }, s[state.lang].t));
      var tick = el("span", { "class": "tick", "aria-hidden": "true" });
      tick.innerHTML = TICK;
      b.appendChild(tick);
      b.addEventListener("click", function () { openSheet(s); });
      li.appendChild(b);
      list.appendChild(li);
    });
  }

  // ---- Filters and grid ----
  function matches(s) {
    if (state.cat !== "all" && s.cat !== state.cat) return false;
    if (!state.q) return true;
    var hay = [s.bn.t, s.bn.d, s.en.t, s.en.d, s.tags || ""].concat(s.bn.inc, s.en.inc).join(" ").toLowerCase();
    return state.q.toLowerCase().split(/\s+/).every(function (w) { return hay.indexOf(w) > -1; });
  }
  function catName(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i][state.lang];
    return "";
  }
  function renderChips() {
    var wrap = $("#chips");
    wrap.textContent = "";
    CATEGORIES.forEach(function (c) {
      var count = c.id === "all" ? SERVICES.length : SERVICES.filter(function (s) { return s.cat === c.id; }).length;
      var b = el("button", { type: "button", "class": "chip", "aria-pressed": String(state.cat === c.id) });
      b.appendChild(document.createTextNode(c[state.lang]));
      b.appendChild(el("span", { "class": "chip-count" }, num(count, state.lang)));
      b.addEventListener("click", function () {
        state.cat = c.id;
        renderChips();
        renderGrid();
      });
      wrap.appendChild(b);
    });
  }
  function renderGrid() {
    var grid = $("#svcGrid");
    grid.textContent = "";
    var shown = 0;
    SERVICES.forEach(function (s, i) {
      if (!matches(s)) return;
      shown++;
      var L = s[state.lang];
      var card = el("button", { type: "button", "class": "card" });
      var top = el("div", { "class": "card-top" });
      top.appendChild(el("span", { "class": "card-n" }, (state.lang === "bn" ? "৪." : "4.") + num(i + 1, state.lang)));
      top.appendChild(el("span", { "class": "card-cat" }, catName(s.cat)));
      card.appendChild(top);
      card.appendChild(el("h3", null, L.t));
      card.appendChild(el("p", null, L.d));
      var foot = el("div", { "class": "card-top" });
      var more = el("span", { "class": "card-more" }, MSG[state.lang].details + " ");
      more.insertAdjacentHTML("beforeend", ARROW);
      foot.appendChild(more);
      if (L.lic) foot.appendChild(el("span", { "class": "card-lic" }, MSG[state.lang].needsLic));
      card.appendChild(foot);
      card.addEventListener("click", function () { openSheet(s); });
      grid.appendChild(card);
    });
    $("#svcEmpty").hidden = shown > 0;
  }

  // ---- Service sheet ----
  var sheet = $("#sheet");
  function fillSheet(s) {
    var L = s[state.lang];
    var i = SERVICES.indexOf(s);
    $("#sheetMeta").textContent = MSG[state.lang].item + " " + num(i + 1, state.lang) + " · " + catName(s.cat);
    $("#sheetTitle").textContent = L.t;
    $("#sheetDesc").textContent = L.d;
    var ul = $("#sheetInc");
    ul.textContent = "";
    L.inc.forEach(function (x) { ul.appendChild(el("li", null, x)); });
    $("#sheetLic").hidden = !L.lic;
    $("#sheetLicText").textContent = L.lic || "";
  }
  function openSheet(s) {
    state.current = s;
    fillSheet(s);
    if (typeof sheet.showModal === "function") sheet.showModal(); else sheet.setAttribute("open", "");
  }
  function closeSheet() {
    state.current = null;
    if (typeof sheet.close === "function") sheet.close(); else sheet.removeAttribute("open");
  }
  $("#sheetClose").addEventListener("click", closeSheet);
  sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener("close", function () { state.current = null; });
  function askAbout(id) {
    var box = id && $('#pick input[value="' + id + '"]');
    if (box && !box.checked) { box.checked = true; saveDraft(); }
    $("#contact").scrollIntoView();
    setTimeout(function () { $("#fName").focus({ preventScroll: true }); }, 400);
  }
  $("#sheetAsk").addEventListener("click", function () {
    var s = state.current;
    closeSheet();
    askAbout(s.id);
  });

  // ---- Contact form ----
  function renderPick() {
    var wrap = $("#pick");
    var checked = $$("input:checked", wrap).map(function (x) { return x.value; });
    if (!wrap.children.length) {
      var draft = readDraft();
      if (draft) checked = draft.services || [];
    }
    wrap.textContent = "";
    SERVICES.forEach(function (s) {
      var id = "svc-" + s.id;
      var lab = el("label", { "for": id });
      var input = el("input", { type: "checkbox", id: id, name: "services", value: s.id });
      if (checked.indexOf(s.id) > -1) input.checked = true;
      lab.appendChild(input);
      lab.appendChild(el("span", null, s[state.lang].t));
      wrap.appendChild(lab);
    });
  }
  function fieldVals() {
    return {
      name: $("#fName").value.trim(), org: $("#fOrg").value.trim(), phone: $("#fPhone").value.trim(),
      email: $("#fEmail").value.trim(), msg: $("#fMsg").value.trim(),
      services: $$("#pick input:checked").map(function (x) { return x.value; })
    };
  }
  function readDraft() {
    try { return JSON.parse(store("bz.draft") || "null"); } catch (e) { return null; }
  }
  function saveDraft() { store("bz.draft", JSON.stringify(fieldVals())); }
  function restoreDraft() {
    var d = readDraft();
    if (!d) return;
    $("#fName").value = d.name || ""; $("#fOrg").value = d.org || ""; $("#fPhone").value = d.phone || "";
    $("#fEmail").value = d.email || ""; $("#fMsg").value = d.msg || "";
  }

  function setErr(id, inputs, text) {
    $(id).textContent = text || "";
    inputs.forEach(function (i) { if (text) i.setAttribute("aria-invalid", "true"); else i.removeAttribute("aria-invalid"); });
    return !text;
  }
  function validate() {
    var v = fieldVals(), m = MSG[state.lang];
    var phoneDigits = latinDigits(v.phone).replace(/[^\d]/g, "");
    var ok = setErr("#eName", [$("#fName")], v.name ? "" : m.needName);
    var contactErr = "";
    if (!v.phone && !v.email) contactErr = m.needContact;
    else if (v.phone && !/^(?:\+?88)?01[3-9]\d{8}$/.test(phoneDigits.length > 11 ? "+" + phoneDigits : phoneDigits)) contactErr = m.badPhone;
    else if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) contactErr = m.badEmail;
    ok = setErr("#eContact", [$("#fPhone"), $("#fEmail")], contactErr) && ok;
    ok = setErr("#eServices", [], v.services.length ? "" : m.needSvc) && ok;
    return ok;
  }
  function buildMessage() {
    var v = fieldVals(), m = MSG[state.lang];
    var lines = [m.hello, ""];
    lines.push(m.lName + ": " + v.name);
    if (v.org) lines.push(m.lOrg + ": " + v.org);
    if (v.phone) lines.push(m.lPhone + ": " + v.phone);
    if (v.email) lines.push(m.lEmail + ": " + v.email);
    lines.push("", m.lSvc + ":");
    v.services.forEach(function (id) {
      var s = SERVICES.filter(function (x) { return x.id === id; })[0];
      if (s) lines.push("• " + s[state.lang].t);
    });
    if (v.msg) lines.push("", m.lMsg + ":", v.msg);
    var text = lines.join("\n");
    $("#resultText").textContent = text;
    var wa = $("#waLink");
    wa.hidden = !CONFIG.whatsapp;
    if (CONFIG.whatsapp) wa.href = "https://wa.me/" + CONFIG.whatsapp + "?text=" + encodeURIComponent(text);
    return text;
  }

  function showResult(failed) {
    buildMessage();
    $("#sendError").hidden = !failed;
    $("#result").hidden = false;
    $("#result").scrollIntoView({ block: "nearest" });
  }
  function showSent() {
    $("#contactForm").reset();
    store("bz.draft", null);
    $("#result").hidden = true;
    $("#sent").hidden = false;
    $("#sent").scrollIntoView({ block: "nearest" });
  }
  function send() {
    var v = fieldVals(), m = MSG[state.lang];
    var names = v.services.map(function (id) {
      var s = SERVICES.filter(function (x) { return x.id === id; })[0];
      return s ? s.en.t : id;
    });
    var payload = {
      subject: m.subject + " | " + v.name, from_name: "Bareezah Solutions website",
      name: v.name, organisation: v.org, phone: latinDigits(v.phone), email: v.email,
      services: names.join(", "), message: v.msg, language: state.lang, page: location.href
    };
    if (v.email) payload.replyto = v.email;
    if (CONFIG.form.accessKey) payload.access_key = CONFIG.form.accessKey;
    return fetch(CONFIG.form.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json().catch(function () { return {}; });
    }).then(function (body) {
      if (body && body.success === false) throw new Error(body.message || "rejected");
    });
  }

  var sending = false;
  $("#contactForm").addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    $("#sent").hidden = true;
    if (!validate()) {
      var first = $('[aria-invalid="true"]') || $("#pick input");
      if (first) first.focus();
      return;
    }
    // Bots fill the hidden field; humans never see it.
    if ($("#fWebsite").value) { showSent(); return; }
    if (!CONFIG.form.endpoint) { showResult(false); return; }

    var btn = $("#submitBtn");
    sending = true;
    btn.disabled = true;
    btn.textContent = MSG[state.lang].sending;
    send().then(showSent, function () { showResult(true); }).then(function () {
      sending = false;
      btn.disabled = false;
      btn.textContent = t("f.send");
    });
  });
  $("#sendAnother").addEventListener("click", function () {
    $("#sent").hidden = true;
    $("#fName").focus();
  });
  $("#contactForm").addEventListener("input", function () {
    saveDraft();
    if (!$("#result").hidden) buildMessage();
  });

  // ---- Copy helpers ----
  var toastTimer;
  function toast(text) {
    var tEl = $("#toast");
    tEl.textContent = text;
    tEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { tEl.hidden = true; }, 2200);
  }
  function selectText(node) {
    var r = document.createRange();
    r.selectNodeContents(node);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(r);
  }
  function copy(text, node) {
    var fail = function () { if (node) selectText(node); toast(MSG[state.lang].copyFail); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast(MSG[state.lang].copied); }, fail);
    } else fail();
  }
  $("#copyMsg").addEventListener("click", function () { copy($("#resultText").textContent, $("#resultText")); });
  $$("[data-copy]").forEach(function (b) {
    b.addEventListener("click", function () {
      var node = b.getAttribute("data-copy") === "phone" ? $("#cPhone") : $("#cEmail");
      copy(node.textContent, node);
    });
  });

  // ---- Header, menu, active section ----
  var header = $(".site-header");
  window.addEventListener("scroll", function () { header.classList.toggle("scrolled", window.scrollY > 8); }, { passive: true });

  var nav = $("#nav"), menuBtn = $("#menuBtn");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
  }
  menuBtn.addEventListener("click", function () { setMenu(!nav.classList.contains("open")); });
  $$("a", nav).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });

  if ("IntersectionObserver" in window) {
    var links = $$("a", nav);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        links.forEach(function (a) { a.classList.toggle("active", a.getAttribute("href") === "#" + en.target.id); });
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["services", "process", "compliance", "faq", "contact"].forEach(function (id) { io.observe(document.getElementById(id)); });
  }

  // ---- Boot ----
  $("#svcSearch").addEventListener("input", function (e) { state.q = e.target.value.trim(); renderGrid(); });
  $("#langBtn").addEventListener("click", function () { setLang(state.lang === "bn" ? "en" : "bn"); });
  $("#themeBtn").addEventListener("click", function () {
    theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    store("bz.theme", theme === "system" ? null : theme);
    applyTheme();
  });

  $("#cPhone").textContent = CONFIG.phone;
  $("#cEmail").textContent = CONFIG.email;
  // Read-only data and actions for the virtual assistant (assistant.js).
  window.Bareezah = {
    CONFIG: CONFIG, SERVICES: SERVICES, CATEGORIES: CATEGORIES,
    num: num, toast: toast, copy: copy,
    getLang: function () { return state.lang; },
    setLang: setLang,
    openService: function (id) {
      var s = SERVICES.filter(function (x) { return x.id === id; })[0];
      if (s) openSheet(s);
    },
    askAbout: askAbout
  };

  captureBangla();
  restoreDraft();
  applyTheme();
  applyLang();
  requestAnimationFrame(function () { $(".memo").classList.add("animate"); });
})();
