(function () {
  "use strict";

  // Bareezah Assistant: floating mascot launcher plus a rule-based, bilingual virtual assistant.
  // It answers from the site's own data (window.Bareezah, set by app.js) and runs fully in the browser.
  var B = window.Bareezah;
  if (!B) return;

  var MASCOT_BASE = "assets/mascot/";
  var FACES = ["smile", "love", "sparkle", "wow", "starstruck", "blush", "sleep", "dizzy", "laugh",
    "look-ul", "look-u", "look-ur", "look-l", "look-c", "look-r", "look-dl", "look-d", "look-dr"];
  function faceSrc(name) { return (window.BZ_MASCOT && window.BZ_MASCOT[name]) || MASCOT_BASE + name + ".webp"; }
  FACES.forEach(function (f) { var i = new Image(); i.src = faceSrc(f); });

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var S = {
    bn: {
      name: "বারিজাহ সহকারী", status: "স্বয়ংক্রিয় সহকারী · সাথে সাথে উত্তর", open: "সহকারীর সাথে কথা বলুন", close: "বন্ধ করুন",
      restart: "নতুন করে শুরু", placeholder: "আপনার প্রশ্ন লিখুন…", send: "পাঠান", typing: "লিখছে…",
      foot: "এটি একটি স্বয়ংক্রিয় সহকারী। চূড়ান্ত পরামর্শের জন্য আমাদের দলের সাথে কথা বলুন।",
      teaser: "আসসালামু আলাইকুম! কোনো সেবা খুঁজছেন? আমি সাহায্য করতে পারি।", dismiss: "বাদ দিন",
      greet: "আসসালামু আলাইকুম! আমি বারিজাহ সহকারী। সেবা, ফি, প্রয়োজনীয় লাইসেন্স বা যোগাযোগ নিয়ে যেকোনো প্রশ্ন করুন।",
      menu: "মূল মেনু", cServices: "আমাদের সেবাসমূহ", cFees: "ফি ও কোটেশন", cLicence: "লাইসেন্স ও অনুমোদন", cContact: "যোগাযোগ",
      cHuman: "মানুষের সাথে কথা", cProcess: "কাজের ধাপ",
      services: "আমাদের {n}টি সেবা খাত চারটি ভাগে সাজানো। একটি ভাগ বেছে নিন:",
      category: "{cat} বিভাগের সেবা:",
      included: "যা অন্তর্ভুক্ত:", licence: "প্রয়োজনীয় অনুমোদন:", details: "বিস্তারিত দেখুন", request: "এই সেবার জন্য অনুরোধ পাঠান",
      fees: "ফি নির্ভর করে কাজের পরিধি ও লেনদেনের পরিমাণের উপর। প্রাথমিক আলোচনার পর আমরা লিখিত কোটেশন দিই।",
      feesFor: "{svc}: ফি নির্ভর করে কাজের পরিধির উপর। আপনার প্রয়োজন জানালে আমরা লিখিত কোটেশন পাঠাব।",
      quote: "কোটেশনের অনুরোধ করুন", whichQuote: "কোন সেবার কোটেশন চান?",
      licenceText: "নির্দিষ্ট লাইসেন্স, নিবন্ধন বা অনুমোদন প্রয়োজন হলে তা গ্রহণের পরই আমরা সংশ্লিষ্ট কাজ শুরু করি। ব্যবসায় প্রায়ই যা লাগে:",
      regs: ["ট্রেড লাইসেন্স (সিটি কর্পোরেশন / পৌরসভা)", "e-TIN (করদাতা শনাক্তকরণ নম্বর)", "BIN (ভ্যাট নিবন্ধন)", "IRC / ERC (আমদানি / রপ্তানি সনদ)", "RJSC (কোম্পানি নিবন্ধন)", "ঠিকাদারি তালিকাভুক্তি"],
      licenceAsk: "কোনটি আপনার আছে আর কোনটি লাগবে, আমরা যাচাই করে দিতে পারি।",
      process: "আমাদের কাজের ধাপ:",
      steps: ["প্রাথমিক আলোচনা", "প্রয়োজন ও নথি যাচাই", "লাইসেন্স ও অনুমোদন যাচাই", "প্রস্তাব ও চুক্তি", "বাস্তবায়ন ও নিয়মিত সহায়তা"],
      contact: "আমাদের সাথে যোগাযোগ:", phone: "ফোন", email: "ইমেইল", hours: "অফিস সময়", address: "ঠিকানা",
      copyPhone: "নম্বর কপি", copyEmail: "ইমেইল কপি", form: "যোগাযোগ ফর্ম খুলুন", wa: "হোয়াটসঅ্যাপে লিখুন",
      human: "অবশ্যই। আমাদের দলের কারো সাথে সরাসরি কথা বলতে ফোন বা হোয়াটসঅ্যাপ করুন, অথবা ফর্মে অনুরোধ পাঠান। আমরা কর্মদিবসের মধ্যে যোগাযোগ করি।",
      privacy: "ক্লায়েন্টের সব নথি ও তথ্য গোপনীয়ভাবে রাখা হয় এবং শুধু নির্ধারিত কাজে ব্যবহৃত হয়।", privacyLink: "গোপনীয়তা নীতি পড়ুন",
      thanks: "আপনাকেও ধন্যবাদ! আর কিছু জানতে চাইলে লিখুন।",
      bye: "ভালো থাকবেন! প্রয়োজন হলে আবার ডাকবেন।",
      langDone: "ঠিক আছে, এখন থেকে বাংলায় কথা বলছি।",
      fallback: "দুঃখিত, প্রশ্নটি ঠিক বুঝতে পারিনি। নিচের বিষয়গুলো থেকে বেছে নিন, অথবা সরাসরি আমাদের জিজ্ঞেস করুন।",
      greetBack: "ওয়ালাইকুম আসসালাম! বলুন, কীভাবে সাহায্য করতে পারি?"
    },
    en: {
      name: "Bareezah Assistant", status: "Automated assistant · instant replies", open: "Chat with the assistant", close: "Close",
      restart: "Start over", placeholder: "Type your question…", send: "Send", typing: "typing…",
      foot: "This is an automated assistant. For final advice, talk to our team.",
      teaser: "Hello! Looking for a service? I can help.", dismiss: "Dismiss",
      greet: "Hello! I'm the Bareezah Assistant. Ask me anything about our services, fees, required licences or how to reach us.",
      menu: "Main menu", cServices: "Our services", cFees: "Fees and quotes", cLicence: "Licences and approvals", cContact: "Contact",
      cHuman: "Talk to a person", cProcess: "How we work",
      services: "Our {n} service lines are grouped into four areas. Pick one:",
      category: "Services in {cat}:",
      included: "What is included:", licence: "Approval required:", details: "See details", request: "Request this service",
      fees: "Fees depend on the scope of work and your transaction volume. After a first conversation we send a written quotation.",
      feesFor: "{svc}: the fee depends on the scope. Tell us what you need and we will send a written quotation.",
      quote: "Request a quotation", whichQuote: "Which service would you like a quote for?",
      licenceText: "Where a specific licence, registration or approval is required, we start that work only after it is obtained. Businesses often need:",
      regs: ["Trade licence (city corporation / municipality)", "e-TIN (taxpayer identification number)", "BIN (VAT registration)", "IRC / ERC (import / export certificate)", "RJSC (company registration)", "Contractor enlistment"],
      licenceAsk: "We can check which ones you already have and which are missing.",
      process: "How we work:",
      steps: ["First conversation", "Needs and documents review", "Licence and approval check", "Proposal and agreement", "Delivery and ongoing support"],
      contact: "How to reach us:", phone: "Phone", email: "Email", hours: "Office hours", address: "Address",
      copyPhone: "Copy number", copyEmail: "Copy email", form: "Open the contact form", wa: "Message on WhatsApp",
      human: "Of course. To speak with someone on our team, call or message us on WhatsApp, or send a request through the form. We reply within working days.",
      privacy: "All client documents and data are kept confidential and used only for the agreed work.", privacyLink: "Read the privacy policy",
      thanks: "You're welcome! Ask me anything else any time.",
      bye: "Take care! Call me again whenever you need.",
      langDone: "Sure, I'll reply in English from now on.",
      fallback: "Sorry, I didn't quite understand that. Pick a topic below, or ask our team directly.",
      greetBack: "Hello! How can I help you today?"
    }
  };

  // Keywords. Latin keywords match at word starts (3 letters or fewer: whole word only); Bangla ones match anywhere.
  var INTENTS = {
    langEn: ["english", "in english", "ইংরেজি", "ইংলিশ"],
    langBn: ["bangla", "bengali", "বাংলা"],
    thanks: ["thank", "thx", "ধন্যবাদ", "শুকরিয়া", "জাজাকাল্লাহ"],
    bye: ["bye", "goodbye", "see you", "আল্লাহ হাফেজ", "খোদা হাফেজ", "বিদায়"],
    human: ["human", "person", "agent", "representative", "someone", "call me", "মানুষ", "প্রতিনিধি", "কারো সাথে", "কথা বলতে চাই", "কল দিন", "ফোন করুন"],
    fees: ["price", "pricing", "fee", "cost", "charge", "quote", "quotation", "how much", "rate", "package", "budget for", "দাম", "ফি", "খরচ", "চার্জ", "কত টাকা", "টাকা", "কোটেশন", "প্যাকেজ", "মূল্য"],
    contact: ["contact", "phone", "number", "whatsapp", "email", "mail", "address", "office hours", "location", "where are", "reach", "যোগাযোগ", "ফোন", "নম্বর", "হোয়াটসঅ্যাপ", "ইমেইল", "ঠিকানা", "অফিস সময়", "কোথায়", "কখন খোলা"],
    licence: ["licence", "license", "registration", "register", "permit", "approval", "লাইসেন্স", "নিবন্ধন", "অনুমোদন", "অনুমতি", "রেজিস্ট্রেশন", "সনদ"],
    process: ["process", "how do you work", "how it works", "steps", "procedure", "get started", "কীভাবে কাজ", "কিভাবে কাজ", "ধাপ", "প্রক্রিয়া", "কীভাবে শুরু", "কিভাবে শুরু"],
    privacy: ["privacy", "confidential", "secure", "data safe", "গোপনীয়", "তথ্য সুরক্ষা", "নিরাপদ"],
    services: ["service", "what do you do", "what do you offer", "offer", "help with", "সেবা", "সার্ভিস", "কী কী", "কি কি", "কী করেন", "কি করেন"],
    greet: ["hello", "hi", "hey", "salam", "assalam", "good morning", "good evening", "আসসালাম", "সালাম", "হ্যালো", "হাই", "নমস্কার", "শুভ সকাল"]
  };
  var SVC_WORDS = {
    "accounting": ["account", "bookkeep", "book keeping", "ledger", "audit", "financial statement", "balance sheet", "payroll", "হিসাব", "বুককিপিং", "অ্যাকাউন্টিং", "লেজার", "আর্থিক প্রতিবেদন", "ব্যালান্স শিট"],
    "vat-tax": ["vat", "tax", "mushak", "bin", "tin", "e-tin", "tds", "vds", "withholding", "ভ্যাট", "মূসক", "ট্যাক্স", "আয়কর", "করদাতা", "উৎসে কর", "কর রিটার্ন"],
    "compliance": ["compliance", "trade licence", "trade license", "rjsc", "document", "paperwork", "agreement", "deed", "কমপ্লায়েন্স", "ট্রেড লাইসেন্স", "ডকুমেন্ট", "নথি", "চুক্তিপত্র", "কাগজপত্র"],
    "advisory": ["advice", "advisory", "management", "business plan", "loan", "margin", "পরামর্শ", "ব্যবস্থাপনা", "ব্যবসায়িক পরিকল্পনা", "বাজেট", "ঋণ", "লোন"],
    "training": ["train", "workshop", "course", "excel", "skill", "প্রশিক্ষণ", "ট্রেনিং", "কর্মশালা", "কোর্স", "দক্ষতা"],
    "import-export": ["import", "export", "lc", "l/c", "letter of credit", "shipment", "shipping", "customs", "sourcing", "irc", "erc", "আমদানি", "রপ্তানি", "ইমপোর্ট", "এক্সপোর্ট", "এলসি", "শিপমেন্ট", "কাস্টমস"],
    "contracting": ["contractor", "contracting", "tender", "project", "construction", "enlistment", "ঠিকাদারি", "টেন্ডার", "দরপত্র", "প্রকল্প", "প্রজেক্ট", "এনলিস্টমেন্ট"],
    "garments": ["garment", "accessor", "label", "hang tag", "hangtag", "zipper", "button", "trims", "carton", "poly bag", "polybag", "গার্মেন্টস", "এক্সেসরিজ", "লেবেল", "জিপার", "বাটন", "কার্টন", "পলিব্যাগ"],
    "software": ["software", "website", "web app", "app", "pos", "erp", "inventory", "it support", "digital", "automation", "সফটওয়্যার", "ওয়েবসাইট", "অ্যাপ", "আইটি", "ডিজিটাল", "ইনভেন্টরি"],
    "admin": ["data entry", "admin", "administrative", "hr", "office support", "filing", "outsourc", "back office", "ডেটা এন্ট্রি", "প্রশাসন", "প্রশাসনিক", "এইচআর", "ফাইলিং", "অফিস সহায়তা"],
    "consultancy": ["consult", "feasibility", "startup", "start-up", "start a business", "new business", "restructur", "কনসালটেন্সি", "কনসালট্যান্ট", "নতুন ব্যবসা", "ফিজিবিলিটি"],
    "trading": ["trading", "distribution", "distributor", "wholesale", "supply", "supplier", "dealer", "ট্রেডিং", "ডিস্ট্রিবিউশন", "পাইকারি", "সরবরাহ", "ডিলার"],
    "other": ["other business", "something else", "অন্যান্য ব্যবসা", "অন্য ব্যবসা"]
  };

  function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&"); }
  function hit(text, kw) {
    if (/^[\x00-\x7f]+$/.test(kw)) {
      var re = kw.length <= 3 ? new RegExp("(^|[^a-z0-9])" + escRe(kw) + "($|[^a-z0-9])") : new RegExp("(^|[^a-z0-9])" + escRe(kw));
      return re.test(text);
    }
    return text.indexOf(kw) > -1;
  }
  function score(text, words) {
    var s = 0;
    words.forEach(function (w) { if (hit(text, w)) s += w.length; });
    return s;
  }
  function has(text, intent) { return score(text, INTENTS[intent]) > 0; }
  function bestService(text) {
    var best = null, top = 0;
    B.SERVICES.forEach(function (svc) {
      var s = score(text, SVC_WORDS[svc.id] || []);
      if (svc.bn.t && text.indexOf(svc.bn.t) > -1) s += 50;
      if (text.indexOf(svc.en.t.toLowerCase()) > -1) s += 50;
      if (s > top) { top = s; best = svc; }
    });
    return best;
  }

  // ---- State ----
  var lang = B.getLang();
  var L = function () { return S[lang]; };
  var log = [];
  try { log = JSON.parse(sessionStorage.getItem("bz.chat") || "[]") || []; } catch (e) { log = []; }
  function saveLog() { try { sessionStorage.setItem("bz.chat", JSON.stringify(log.slice(-60))); } catch (e) { /* storage unavailable */ } }

  // ---- DOM ----
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  var root = el("div", "bot");
  root.innerHTML =
    '<div class="bot-teaser" hidden>' +
      '<button class="bot-x" type="button" data-act="dismiss"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '<p class="bot-teaser-text"></p><div class="bot-chips bot-teaser-chips"></div>' +
    '</div>' +
    '<section class="bot-panel" role="dialog" aria-modal="false" hidden>' +
      '<header class="bot-head">' +
        '<span class="bot-avatar"><img alt="" width="44" height="44"></span>' +
        '<span class="bot-id"><b class="bot-name"></b><span class="bot-status"></span></span>' +
        '<button class="bot-icon" type="button" data-act="restart"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/></svg></button>' +
        '<button class="bot-icon" type="button" data-act="close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button>' +
      '</header>' +
      '<div class="bot-log" role="log" aria-live="polite"></div>' +
      '<form class="bot-form" autocomplete="off">' +
        '<label class="bot-sr" for="botInput"></label>' +
        '<input id="botInput" class="bot-input" type="text" maxlength="300">' +
        '<button class="bot-send" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/></svg></button>' +
      '</form>' +
      '<p class="bot-foot"></p>' +
    '</section>' +
    '<button class="bot-launcher" type="button" aria-expanded="false">' +
      '<span class="bot-disc"><img class="bot-face" alt="" width="64" height="64"></span>' +
      '<span class="bot-badge" hidden>1</span>' +
    '</button>';
  document.body.appendChild(root);

  function q(sel) { return root.querySelector(sel); }
  var launcher = q(".bot-launcher"), face = q(".bot-face"), panel = q(".bot-panel"), logEl = q(".bot-log");
  var avatar = q(".bot-avatar img"), input = q(".bot-input"), teaser = q(".bot-teaser"), badge = q(".bot-badge");

  function setFace(img, name) {
    var src = faceSrc(name);
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  }

  function applyStrings() {
    var s = L();
    root.setAttribute("lang", lang);
    panel.setAttribute("aria-label", s.name);
    q(".bot-name").textContent = s.name;
    q(".bot-status").textContent = s.status;
    q(".bot-foot").textContent = s.foot;
    q('[data-act="restart"]').setAttribute("aria-label", s.restart);
    q('[data-act="restart"]').title = s.restart;
    q('[data-act="close"]').setAttribute("aria-label", s.close);
    q('[data-act="dismiss"]').setAttribute("aria-label", s.dismiss);
    q(".bot-sr").textContent = s.placeholder;
    input.placeholder = s.placeholder;
    q(".bot-send").setAttribute("aria-label", s.send);
    launcher.setAttribute("aria-label", panel.hidden ? s.open : s.close);
    q(".bot-teaser-text").textContent = s.teaser;
    renderChips(q(".bot-teaser-chips"), menuChips().slice(0, 3));
  }

  // ---- Launcher face: follows the pointer, dozes off when idle ----
  var mood = null, moodTimer = null, sleepTimer = null, lastLook = "look-ul";
  function showMood(name, ms) {
    mood = name;
    setFace(face, name);
    clearTimeout(moodTimer);
    if (ms) moodTimer = setTimeout(function () { mood = null; setFace(face, lastLook); }, ms);
  }
  function resetSleep() {
    clearTimeout(sleepTimer);
    sleepTimer = setTimeout(function () { if (panel.hidden) showMood("sleep"); }, 45000);
  }
  var pending = null;
  function look(x, y) {
    var r = launcher.getBoundingClientRect();
    var dx = x - (r.left + r.width / 2), dy = y - (r.top + r.height / 2);
    var d = Math.sqrt(dx * dx + dy * dy);
    var name = "look-c";
    if (d > r.width * 0.75) {
      var h = dx / d, v = dy / d;
      var dir = (v < -0.38 ? "u" : v > 0.38 ? "d" : "") + (h < -0.38 ? "l" : h > 0.38 ? "r" : "");
      name = "look-" + (dir || "c");
    }
    lastLook = name;
    if (!mood) setFace(face, name);
  }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    if (mood === "sleep") showMood("wow", 900);
    resetSleep();
    if (pending) return;
    pending = requestAnimationFrame(function () { pending = null; look(e.clientX, e.clientY); });
  }, { passive: true });
  launcher.addEventListener("pointerenter", function () { if (mood !== "sleep") showMood("smile"); });
  launcher.addEventListener("pointerleave", function () { if (mood === "smile") { mood = null; setFace(face, lastLook); } });
  window.addEventListener("scroll", function () { if (mood === "sleep") showMood("wow", 900); resetSleep(); }, { passive: true });
  setFace(face, "look-ul");
  resetSleep();

  // ---- Rendering ----
  function renderChips(box, chips) {
    box.textContent = "";
    chips.forEach(function (c) {
      var b = el("button", "bot-chip", c.label);
      b.type = "button";
      b.addEventListener("click", function () { userSays(c.label, c.q); });
      box.appendChild(b);
    });
  }
  function scrollLog() { logEl.scrollTop = logEl.scrollHeight; }

  function renderMsg(m) {
    var row = el("div", "bot-row bot-row-" + m.who);
    var bubble = el("div", "bot-msg bot-msg-" + m.who);
    (m.text || []).forEach(function (t) { bubble.appendChild(el("p", null, t)); });
    if (m.title) bubble.insertBefore(el("p", "bot-msg-title", m.title), bubble.firstChild);
    if (m.list && m.list.length) {
      var ul = el(m.ordered ? "ol" : "ul", "bot-list");
      m.list.forEach(function (t) { ul.appendChild(el("li", null, t)); });
      bubble.appendChild(ul);
    }
    (m.after || []).forEach(function (t) { bubble.appendChild(el("p", null, t)); });
    if (m.info && m.info.length) {
      var dl = el("dl", "bot-info");
      m.info.forEach(function (pair) {
        var d = el("div");
        d.appendChild(el("dt", null, pair[0]));
        d.appendChild(el("dd", null, pair[1]));
        dl.appendChild(d);
      });
      bubble.appendChild(dl);
    }
    if (m.actions && m.actions.length) {
      var acts = el("div", "bot-actions");
      m.actions.forEach(function (a) {
        var b = el("button", "bot-action", a.label);
        b.type = "button";
        b.addEventListener("click", function () { runAction(a.act); });
        acts.appendChild(b);
      });
      bubble.appendChild(acts);
    }
    if (m.who === "bot") {
      var av = el("img", "bot-mini");
      av.alt = "";
      av.src = faceSrc(m.face || "smile");
      row.appendChild(av);
    }
    row.appendChild(bubble);
    logEl.appendChild(row);
    if (m.chips && m.chips.length) {
      var chips = el("div", "bot-chips bot-chips-log");
      renderChips(chips, m.chips);
      logEl.appendChild(chips);
    }
  }
  function renderLog() {
    logEl.textContent = "";
    log.forEach(renderMsg);
    // Only the latest set of quick replies stays clickable
    var sets = logEl.querySelectorAll(".bot-chips-log");
    for (var i = 0; i < sets.length - 1; i++) sets[i].remove();
    scrollLog();
  }

  // ---- Conversation ----
  function menuChips() {
    var s = L();
    return [
      { label: s.cServices, q: "#services" }, { label: s.cFees, q: "#fees" }, { label: s.cLicence, q: "#licence" },
      { label: s.cContact, q: "#contact" }, { label: s.cProcess, q: "#process" }, { label: s.cHuman, q: "#human" }
    ];
  }
  function menuChip() { return { label: L().menu, q: "#menu" }; }
  function contactInfo() {
    var s = L(), c = B.CONFIG;
    return [[s.phone, c.phone], [s.email, c.email], [s.hours, c.hours[lang]], [s.address, c.address[lang]]];
  }
  function contactActions(serviceId) {
    var s = L();
    var acts = [{ label: s.form, act: "ask:" + (serviceId || "") }];
    if (B.CONFIG.whatsapp) acts.push({ label: s.wa, act: "wa" });
    acts.push({ label: s.copyPhone, act: "copy:phone" }, { label: s.copyEmail, act: "copy:email" });
    return acts;
  }
  function catName(id) {
    var c = B.CATEGORIES.filter(function (x) { return x.id === id; })[0];
    return c ? c[lang] : "";
  }
  function serviceReply(svc) {
    var s = L(), t = svc[lang];
    var related = B.SERVICES.filter(function (x) { return x.cat === svc.cat && x !== svc; }).slice(0, 2)
      .map(function (x) { return { label: x[lang].t, q: "#svc:" + x.id }; });
    return {
      face: "starstruck", title: t.t, text: [t.d, s.included], list: t.inc,
      after: t.lic ? [s.licence + " " + t.lic] : [],
      actions: [{ label: s.details, act: "open:" + svc.id }, { label: s.request, act: "ask:" + svc.id }],
      chips: related.concat([{ label: s.cFees, q: "#fees:" + svc.id }, menuChip()])
    };
  }

  function answer(token, text) {
    var s = L();
    if (token === "#menu") return { face: "smile", text: [s.greet], chips: menuChips() };
    if (token === "#services") {
      return {
        face: "sparkle", text: [s.services.replace("{n}", B.num(B.SERVICES.length, lang))],
        chips: B.CATEGORIES.filter(function (c) { return c.id !== "all"; }).map(function (c) {
          var n = B.SERVICES.filter(function (x) { return x.cat === c.id; }).length;
          return { label: c[lang] + " (" + B.num(n, lang) + ")", q: "#cat:" + c.id };
        }).concat([menuChip()])
      };
    }
    if (token.indexOf("#cat:") === 0) {
      var cat = token.slice(5);
      return {
        face: "smile", text: [s.category.replace("{cat}", catName(cat))],
        chips: B.SERVICES.filter(function (x) { return x.cat === cat; }).map(function (x) { return { label: x[lang].t, q: "#svc:" + x.id }; }).concat([menuChip()])
      };
    }
    if (token.indexOf("#svc:") === 0) {
      var svc = B.SERVICES.filter(function (x) { return x.id === token.slice(5); })[0];
      if (svc) return serviceReply(svc);
    }
    if (token.indexOf("#fees") === 0) {
      var fsvc = B.SERVICES.filter(function (x) { return x.id === token.slice(6); })[0];
      if (fsvc) return { face: "smile", text: [s.feesFor.replace("{svc}", fsvc[lang].t)], actions: [{ label: s.quote, act: "ask:" + fsvc.id }], chips: [menuChip()] };
      return {
        face: "smile", text: [s.fees, s.whichQuote], actions: [{ label: s.quote, act: "ask:" }],
        chips: ["accounting", "vat-tax", "import-export", "training"].map(function (id) {
          var x = B.SERVICES.filter(function (y) { return y.id === id; })[0];
          return { label: x[lang].t, q: "#fees:" + id };
        }).concat([menuChip()])
      };
    }
    if (token === "#licence") {
      return { face: "wow", text: [s.licenceText], list: s.regs, after: [s.licenceAsk], actions: [{ label: s.form, act: "ask:compliance" }],
        chips: [{ label: B.SERVICES[5][lang].t, q: "#svc:import-export" }, { label: B.SERVICES[2][lang].t, q: "#svc:compliance" }, menuChip()] };
    }
    if (token === "#process") return { face: "smile", text: [s.process], list: s.steps, ordered: true, actions: [{ label: s.form, act: "ask:" }], chips: [{ label: s.cServices, q: "#services" }, menuChip()] };
    if (token === "#contact") return { face: "laugh", text: [s.contact], info: contactInfo(), actions: contactActions(), chips: [menuChip()] };
    if (token === "#human") return { face: "blush", text: [s.human], info: contactInfo().slice(0, 2), actions: contactActions(), chips: [menuChip()] };
    if (token === "#privacy") return { face: "smile", text: [s.privacy], actions: [{ label: s.privacyLink, act: "privacy" }], chips: [menuChip()] };
    if (token === "#thanks") return { face: "love", text: [s.thanks], chips: menuChips().slice(0, 3) };
    if (token === "#bye") return { face: "laugh", text: [s.bye] };
    if (token === "#greet") return { face: "love", text: [s.greetBack], chips: menuChips() };
    if (token === "#lang") return { face: "sparkle", text: [s.langDone], chips: menuChips() };

    // Free text
    var t = (text || "").toLowerCase().trim();
    if (has(t, "langEn") && lang !== "en") { switchLang("en"); return answer("#lang"); }
    if (has(t, "langBn") && lang !== "bn") { switchLang("bn"); return answer("#lang"); }
    var svcMatch = bestService(t);
    if (has(t, "human")) return answer("#human");
    if (has(t, "fees")) return answer("#fees" + (svcMatch ? ":" + svcMatch.id : ""));
    if (has(t, "contact")) return answer("#contact");
    if (svcMatch) return serviceReply(svcMatch);
    if (has(t, "licence")) return answer("#licence");
    if (has(t, "process")) return answer("#process");
    if (has(t, "privacy")) return answer("#privacy");
    if (has(t, "services")) return answer("#services");
    if (has(t, "thanks")) return answer("#thanks");
    if (has(t, "bye")) return answer("#bye");
    if (has(t, "greet")) return answer("#greet");
    return { face: "dizzy", text: [s.fallback], actions: contactActions().slice(0, 1), chips: menuChips() };
  }

  var typingRow = null, busy = false;
  function botSays(reply) {
    busy = true;
    setFace(avatar, "look-ur");
    typingRow = el("div", "bot-row bot-row-bot bot-typing-row");
    var mini = el("img", "bot-mini");
    mini.alt = "";
    mini.src = faceSrc("look-ur");
    var dots = el("div", "bot-msg bot-msg-bot bot-typing");
    dots.setAttribute("aria-label", L().typing);
    dots.innerHTML = "<span></span><span></span><span></span>";
    typingRow.appendChild(mini);
    typingRow.appendChild(dots);
    logEl.appendChild(typingRow);
    scrollLog();
    var words = (reply.text || []).join(" ").length + (reply.list || []).join(" ").length;
    var delay = reduceMotion ? 150 : Math.min(1300, 450 + words * 4);
    setTimeout(function () {
      if (typingRow) typingRow.remove();
      typingRow = null;
      reply.who = "bot";
      log.push(reply);
      saveLog();
      renderLog();
      setFace(avatar, reply.face || "smile");
      if (panel.hidden) { showMood(reply.face || "smile", 2500); badge.hidden = false; }
      busy = false;
    }, delay);
  }
  function userSays(label, token) {
    if (busy) return;
    if (panel.hidden) openPanel(true);
    log.push({ who: "user", text: [label] });
    saveLog();
    renderLog();
    if (token) { botSays(answer(token, label)); return; }
    var lower = label.toLowerCase();
    if (has(lower, "langEn") || has(lower, "langBn")) {
      var want = has(lower, "langEn") ? "en" : "bn";
      if (want !== lang) switchLang(want);
      botSays(answer("#lang"));
      return;
    }
    // Typed messages are answered in the script they were written in, without changing the site language
    var siteLang = lang;
    var bangla = /[ঀ-৿]/.test(label), latin = (label.match(/[a-z]/gi) || []).length >= 3;
    if (bangla && lang === "en") lang = "bn";
    else if (!bangla && latin && lang === "bn") lang = "en";
    var reply = answer("", label);
    if (lang !== siteLang && B.getLang() === siteLang) lang = siteLang;
    botSays(reply);
  }

  function switchLang(next) {
    lang = next;
    B.setLang(next);
  }
  window.addEventListener("bz:lang", function (e) {
    lang = e.detail;
    applyStrings();
  });

  function runAction(act) {
    var parts = act.split(":"), kind = parts[0], arg = parts.slice(1).join(":");
    if (kind === "open") { B.openService(arg); }
    else if (kind === "ask") { closePanel(); B.askAbout(arg); }
    else if (kind === "wa") { window.open("https://wa.me/" + B.CONFIG.whatsapp, "_blank", "noopener"); }
    else if (kind === "copy") { B.copy(arg === "phone" ? B.CONFIG.phone : B.CONFIG.email); }
    else if (kind === "privacy") { location.href = "privacy.html"; }
  }

  // ---- Open / close ----
  function openPanel(silent) {
    teaser.hidden = true;
    badge.hidden = true;
    panel.hidden = false;
    root.classList.add("bot-open");
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", L().close);
    clearTimeout(moodTimer);
    showMood("smile");
    if (!log.length && !silent) {
      log.push({ who: "bot", face: "love", text: [L().greet], chips: menuChips() });
      saveLog();
    }
    renderLog();
    setFace(avatar, log.length ? (log[log.length - 1].face || "smile") : "smile");
    if (window.matchMedia("(min-width: 561px)").matches) input.focus({ preventScroll: true });
  }
  function closePanel() {
    panel.hidden = true;
    root.classList.remove("bot-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", L().open);
    mood = null;
    setFace(face, lastLook);
    resetSleep();
  }
  launcher.addEventListener("click", function () {
    if (panel.hidden) openPanel(); else { closePanel(); launcher.focus(); }
  });
  root.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act");
    if (act === "close") { closePanel(); launcher.focus(); }
    if (act === "dismiss") { teaser.hidden = true; badge.hidden = true; setFace(face, lastLook); }
    if (act === "restart") { log = []; saveLog(); openPanel(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden && !document.querySelector("dialog[open]")) { closePanel(); launcher.focus(); }
  });
  q(".bot-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var v = input.value.trim();
    if (!v || busy) return;
    input.value = "";
    userSays(v, "");
  });

  // Quick-response teaser: once per visit, a few seconds after load
  var teased = false;
  try { teased = sessionStorage.getItem("bz.teased") === "1"; } catch (e) { teased = false; }
  if (!teased && !log.length) {
    setTimeout(function () {
      if (!panel.hidden) return;
      teaser.hidden = false;
      badge.hidden = false;
      showMood("love", 2600);
      try { sessionStorage.setItem("bz.teased", "1"); } catch (e) { /* storage unavailable */ }
    }, 4500);
  }

  applyStrings();
})();
