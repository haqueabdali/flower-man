# Bareezah Solutions website

Static, dependency-free marketing site for Bareezah Solutions, built from clause 4
("ব্যবসার প্রকৃতি ও উদ্দেশ্য") of the memorandum: all 13 business objects are listed as services.

## Files

- `index.html` – page markup (Bangla is the default text)
- `styles.css` – design tokens, light/dark themes, responsive layout
- `app.js` – services data, English translations, filters, search, service details, contact form

## Features

- Bangla / English toggle (remembered per browser)
- Light / dark / system theme toggle
- Service catalogue with category filters and search (Bangla or English keywords)
- Detail sheet per service with what is included and any licence or approval required
- Contact form with validation (Bangladeshi mobile numbers, email) that prepares a ready-to-send
  message to copy or open in WhatsApp; unsent drafts are kept in the browser
- Compliance section quoting the licence/approval clause

## Before going live

Edit `CONFIG` at the top of `app.js`: phone, WhatsApp number (digits only, e.g. `8801712345678`),
email, office address and hours. The WhatsApp button stays hidden until a number is set.

## Run locally / deploy

Open `index.html` in a browser, or serve the folder with any static host
(GitHub Pages, Netlify, Cloudflare Pages, cPanel hosting). There is no build step.
