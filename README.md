# 🚢 Ocean Fast Ferries Pro — V400

**Professional baggage fee calculator, booking system, route planner, weather overlay, multi-currency support, and live vessel tracking for Ocean Fast Ferries operations.**

---

## 🆕 V400 Pro — Major Upgrades from V301

### 🌤️ Real-Time Weather & Sea Conditions
- **Weather Card on Dashboard** — Live temperature, weather code, and wind speed from Open-Meteo API (no API key needed)
- **Sea Condition Assessment** — Automatic calm/moderate/rough advisory with color-coded indicators
- **Weather Overlay on Map** — Colored circles at each port showing real-time sea conditions with tooltips
- **Toggle Weather** — Show/hide weather overlay on the live map

### 💱 Multi-Currency Support (8 Currencies)
- **PHP, USD, EUR, JPY, GBP, AUD, KRW, CNY** — Built-in exchange rates with proper currency symbols
- **Currency Selector** on dashboard — Change display currency in one tap
- **Automatic Conversion** — All fare displays, calculator results, and analytics update instantly when currency changes
- **`fmtCurrency()` and `convertCurrency()` utilities** — Consistent formatting across the entire app

### 🎫 Booking & Reservation System
- **Full Booking Form** — Route, passenger name, class (Tourist/Business/Student/Minor), passenger count, trip selection, date
- **Trip Auto-Population** — Selecting a route auto-fills available trips from schedules
- **Booking Reference Numbers** — Unique `OFF` + timestamp-based refs for each booking
- **QR Code Sharing** — View/share booking details via QR code or native share API
- **Cancel Bookings** — Cancel with confirmation dialog
- **Bookings Stored in DB** — Persistent across sessions via safe localStorage

### 🧭 Advanced Route Planner
- **All 13 Ports** — Select origin and destination from any port in the network
- **Smart Route Finding** — Direct, connecting (1-hop), and multi-hop route discovery
- **Leg-by-Leg Breakdown** — Each leg shows travel time, fare (Tourist & Business), trip count
- **Route Type Badges** — Green/Yellow/Red badges for Direct/Connecting/Multi-Hop
- **Jump to Calculator** — "Use in Calculator" button on each leg for instant baggage fee calculation

### ⭐ Saved Favorites System
- **Save Calculator Presets** — Star button saves route, mode, class, and passenger count
- **Load Favorites** — One-tap loads saved preset into calculator
- **Remove Favorites** — Delete with confirmation
- **Persistent Storage** — Favorites survive page reloads

### 🧮 Multi-Item Baggage Calculator
- **Add Multiple Items** — Each item has description and individual weight
- **Auto-Total Weight** — Sum of all item weights auto-populates the calculator
- **Remove Individual Items** — Delete specific items with one tap
- **Description Field** — Label each baggage item (e.g., "Suitcase", "Box", "Carton")

### 📊 7-Day Revenue Sparkline
- **Visual Bar Chart** — Daily revenue for the past 7 days on dashboard
- **Currency-Aware** — Sparkline values update when you change display currency
- **Auto-Calculated** — Pulled from transaction history automatically

### 🔧 Admin Rate Editor
- **Inline Grid Editing** — Edit Normal/Fragile T1/T2/T3 rates for every route
- **Reverse Route Sync** — Changing a route auto-updates the reverse route
- **Save & Toast** — Confirmation on save with auto-refresh

### 🛡️ Safe localStorage with Error Recovery
- **`safeGetJSON()` / `safeSetJSON()`** — Wraps localStorage with try-catch, JSON parse recovery, and automatic old-key cleanup
- **Automatic Migration** — Old DB versions purged on load
- **Corruption Recovery** — Falls back to default DB structure if data is corrupted

### ♿ Accessibility Improvements
- **ARIA Labels** — All interactive elements have `role`, `aria-label`, and `tabindex`
- **`:focus-visible` Styles** — Cyan outline on keyboard focus for all interactive elements
- **`.sr-only` Class** — Screen reader-only utility class
- **Semantic HTML** — Views use `role="region"` and `role="main"`

---

## 📁 Project Structure

```
ocean-ferries-pro/
├── index.html      — Main SPA shell (V400: 3 new views, 5-item bottom nav, accessibility)
├── styles.css      — Full mobile-first futuristic UI (V400: weather, sparkline, bookings, planner, etc.)
├── app.js          — Core application logic (V400: ~1400 lines, all new features)
├── data.js         — Configuration, schedules, fares, currency, weather regions (V400)
├── utils.js        — Utility functions, currency, route planning, safe DB (V400)
├── map.js          — Live map with weather overlay (V400)
├── sw.js           — Service Worker for offline caching (V400)
├── manifest.json   — PWA manifest (V400)
└── README.md       — This file (V400)
```

---

## 🌐 External Dependencies (CDN)

| Library | Purpose | Size |
|---------|---------|------|
| [Leaflet.js](https://leafletjs.com/) | Interactive vessel map | ~40KB |
| [Chart.js](https://www.chartjs.org/) | Analytics charts | ~65KB |
| [QRCode.js](https://github.com/davidshimjs/qrcodejs) | Receipt QR codes | ~10KB |
| [Open-Meteo API](https://open-meteo.com/) | Real-time weather data | Free, no key |

---

## 🚀 Features Overview

### Core Operations
- **Baggage Fee Calculator** — 3-tier slab system (Normal/Fragile × T1/T2/T3), multi-item support
- **Passenger Fare Tables** — TC/OA, BC, ST, MI fare display with currency conversion
- **Live Vessel Tracking Map** — Schedule-based position estimation with weather overlay
- **Tally Counter** — Passenger counting overlay with +/−/reset
- **Shift Timer** — Track work shift duration with start/stop
- **Change Calculator** — Compute change from payment amount
- **PDF Receipt Generation** — Hand-built PDF with QR code
- **CSV Export** — Export transaction and vessel manifest data

### Smart Features
- **AI Chat (Gemini)** — Ask about fares, schedules, baggage rules, tourist tips
- **Voice Commands** — Web Speech API for hands-free operation
- **Departure Alerts** — Push-style notification for upcoming departures
- **Notification Center** — In-app notification queue with badges

### Admin Tools
- **Admin Login** — Protected with username/password
- **Rate Editor** — Edit all route baggage and fare rates
- **System Health** — DB size, version, transaction count
- **Manual Delay Override** — Adjust vessel departure delays on the map
- **Fare Lookup Panel** — Quick-search all route fares

### PWA & Offline
- **Service Worker** — Network-first for app assets, stale-while-revalidate for CDN
- **Offline Badge** — Visual indicator when offline
- **Cache Busting** — Automatic cache clear on version upgrade
- **Installable** — Add to home screen with manifest.json

---

## 🏝️ Supported Routes & Ports

### Ports (13)
Cebu, Tagbilaran, Getafe, Ormoc, Palompon, Maasin, Surigao, Siquijor, Dumaguete, Bacolod, Iloilo, Calapan, Batangas

### Routes
- Cebu ↔ Tagbilaran ↔ Dumaguete
- Cebu ↔ Tagbilaran ↔ Siquijor
- Cebu ↔ Maasin ↔ Surigao
- Getafe ↔ Ormoc ↔ Palompon
- Connecting routes via hub ports

---

## 🔑 Environment

- **No build step required** — Vanilla HTML/CSS/JS
- **No server required** — Runs on any static host (GitHub Pages, Netlify, etc.)
- **localStorage persistence** — All data stored locally in the browser
- **Responsive design** — Mobile-first with desktop support
- **Dark/Light mode** — Toggle with theme persistence

---

## 📜 Version History

| Version | Date | Changes |
|---------|------|---------|
| V400 Pro | 2025-07 | Weather overlay, bookings, route planner, favorites, multi-currency, multi-item baggage, sparkline, rate editor, accessibility, safe DB |
| V301 | 2025-06 | Fare panel, shift timer, AI chat, voice commands, admin modal, live ticker |
| V300 | 2025-05 | Initial baggage pro calculator, map, schedules, analytics |
| V126 | 2025-04 | Live map module with schedule-based tracking |

---

## 📄 License

Private project for Ocean Fast Ferries operations. All rights reserved.

---

*Ocean Fast Ferries Pro V400 — Safe. Fast. Reliable. Smart.*
