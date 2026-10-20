# Bareezah Solutions website

Static, dependency-free website for Bareezah Solutions, built from clause 4
("ব্যবসার প্রকৃতি ও উদ্দেশ্য") of the memorandum: all 13 business objects are listed as services.
There is no build step: the folder is the website.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Home page (Bangla is the default text) with SEO, social and structured-data tags |
| `styles.css` | Design tokens, light/dark themes, responsive layout |
| `app.js` | `CONFIG` (contact details, form delivery), services data, English text, all interactions |
| `assistant.js`, `assistant.css` | Bareezah Assistant: floating mascot and virtual assistant |
| `assets/mascot/` | 18 mascot expressions (9 moods, 9 gaze directions), transparent WebP |
| `privacy.html` | Privacy policy (Bangla and English) |
| `404.html` | "Page not found" page |
| `assets/` | Favicons, app icons, social share image (`og-image.png`, 1200×630) |
| `site.webmanifest` | Install-to-home-screen metadata |
| `robots.txt`, `sitemap.xml` | Search engine files |
| `_headers` | Security and cache headers (Netlify and Cloudflare Pages) |

## Launch checklist

1. **Contact details.** In `app.js`, edit `CONFIG`: `phone`, `whatsapp` (digits only, e.g. `8801712345678`),
   `email`, `address`, `hours`. The WhatsApp button stays hidden until a number is set.
2. **Form delivery** (so requests land in your inbox). Pick one, both have free plans:
   - Web3Forms: get an access key at https://web3forms.com with your email, then set
     `form: { endpoint: "https://api.web3forms.com/submit", accessKey: "<your key>" }`.
   - Formspree: create a form at https://formspree.io, then set
     `form: { endpoint: "https://formspree.io/f/<form id>", accessKey: "" }`.

   Without an endpoint the form still works: it prepares a message to copy or send on WhatsApp.
   If online sending ever fails, visitors get the same fallback automatically.
3. **Domain.** The site assumes `https://bareezahsolutions.com`. If yours differs, replace that
   domain everywhere: `grep -rl bareezahsolutions.com . | xargs sed -i 's/bareezahsolutions\.com/yourdomain.com/g'`
   (this also changes the email address, so set `CONFIG.email` afterwards if needed).
4. **Content.** Review the service descriptions, FAQ answers and office hours.
5. **After going live.** Submit `https://<domain>/sitemap.xml` in Google Search Console, and
   create a Google Business Profile pointing to the site.

## Hosting

Any static host works. Recommended options:

- **Cloudflare Pages or Netlify** (free, HTTPS, custom domain, applies `_headers`):
  drag and drop this folder, or connect the repository with the output/publish directory
  set to `sites/bareezah-solutions` and no build command.
- **GitHub Pages**: the workflow `.github/workflows/bareezah-site.yml` deploys this folder on every
  push to `main` that changes it. One-time setup: repository Settings → Pages → Source: "GitHub Actions",
  then add your custom domain there. Use a custom domain: without one the site lives under
  `/flower-man/` and the 404 page's links point to the domain root.
- **cPanel / shared hosting**: upload the folder's contents to `public_html`.

## Features

- Bangla / English toggle and light / dark / system theme (both remembered per browser)
- Service catalogue with category filters and search (Bangla or English keywords)
- Detail sheet per service with what is included and any licence or approval required
- Contact form: validation (Bangladeshi mobile numbers in Bangla or Latin digits, email),
  spam trap, online delivery, draft saving and a copy/WhatsApp fallback
- Search engine and social sharing: meta description, canonical URL, Open Graph image,
  schema.org `ProfessionalService` data, sitemap, robots.txt
- Works without JavaScript for the core content (services list shown via `<noscript>`)
- Accessible: keyboard focus styles, skip link, labelled controls, reduced-motion support

## Bareezah Assistant

A floating mascot sits in the bottom-right corner of every visit:

- **Follows the visitor:** its head turns towards the mouse pointer in 9 directions, it smiles on hover,
  and it dozes off (zzz) after 45 seconds without activity.
- **Quick response:** a few seconds after the first page load it greets the visitor with one-tap topics
  (services, fees, licences). Shown once per browser session.
- **Virtual assistant:** a chat panel that answers in Bangla or English (it replies in the script the visitor
  types in) about each of the 13 services, fees and quotations, licences and registrations, the work process,
  contact details, privacy, and handing over to a person. Each answer shows a matching mascot expression.
- **Actions:** open a service's detail sheet, jump to the contact form with that service already ticked,
  copy the phone number or email, or message on WhatsApp.
- It runs entirely in the browser from the site's own data (no API keys, no running costs). Answers come from
  `SERVICES` and `CONFIG` in `app.js` and the texts and keywords in `assistant.js` (`S`, `INTENTS`, `SVC_WORDS`):
  edit those to change what it says or understands.

## Run locally

`python3 -m http.server` inside this folder, then open http://localhost:8000.
