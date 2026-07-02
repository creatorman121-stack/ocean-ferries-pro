# ⛴️ Ocean Fast Ferries Pro Ultra — V500

> Professional ferry operations platform with baggage fee calculator, live vessel tracking, weather overlay, smart bookings, route planner, expense tracker, trip checklists, group discounts, multi-currency, tide & sea info, operator profiles, and more.

## 🚀 Version History

| Version | Codename | Key Features |
|---------|----------|-------------|
| V126 | Live Map | Original baggage calculator + live map |
| V300 | Pro | Enhanced calculator, schedules, fares |
| V301 | Pro | Bug fixes, improved UI |
| V400 | Pro | Weather overlay, bookings, route planner, multi-currency, favorites, multi-item baggage, enhanced analytics, admin rate editor, accessibility |
| **V500** | **Ultra** | **Group discounts, expense tracker, trip checklists, smart departure alerts, booking sharing (WhatsApp), travel time estimator, tide & sun info, animated dashboard, live currency API, multi-profile support** |

## 📦 Project Structure

```
ocean-ferries-pro/
├── index.html        — SPA shell with 13 views
├── styles.css        — Mobile-first futuristic dark/light theme
├── app.js            — Main application logic (~2200 lines)
├── data.js           — Configuration, schedules, fares, checklists, expenses
├── utils.js          — Utility functions, currency, route planning, tides
├── map.js            — Live Leaflet map with weather overlay
├── sw.js             — Service Worker (V500 cache)
├── manifest.json     — PWA manifest
└── README.md         — This file
```

## 🆕 V500 Ultra Features

### 💸 Expense Tracker
Track all travel expenses by trip and category. Categories include Ferry Ticket, Baggage Fee, Food & Drinks, Local Transport, Accommodation, Activities/Tours, Shopping, and Other. Visual category breakdown with progress bars. Export expenses to CSV.

### 👥 Group Booking Discounts
Automatic group discounts applied to bookings: 5% off for 5–9 passengers, 10% off for 10+ passengers. Group discount badge and savings shown on booking cards.

### 📋 Trip Checklist
Pre-departure checklists for all 13 ports with required documents, terminal information, travel tips, and available connections. Checklists save state to localStorage. Share checklists via native share API or download as text.

### 🔔 Smart Departure Alerts
Auto-checks booked routes every 2 minutes and sends notifications 60 minutes before departure. Never miss your ferry again.

### 📤 Booking Sharing
Share booking confirmations via WhatsApp or native share API. Includes route, passenger info, vessel, departure/arrival times, and fare details.

### ⏱️ Travel Time Estimator
Shows estimated total travel time including connection waits for connecting and multi-hop routes. Displays leg-by-leg breakdown.

### 🌙 Tide & Sun Info
Displays moon phase, illumination percentage, tide type (Spring/Neap/Normal), tide range estimates, sunrise/sunset times, and daylight hours for any port. Includes sailing advisory based on tide conditions.

### 📊 Enhanced Dashboard
Animated stat counters, popular routes mini bar chart, and recent activity feed added to the dashboard.

### 🔄 Live Currency Updates
Fetches live exchange rates from open.er-api.com on startup. Falls back to cached or hardcoded rates when offline. Supports PHP, USD, EUR, JPY, GBP, AUD, KRW, CNY.

### 🗂️ Multi-Profile Support
Create named operator profiles (Cashier, Supervisor, Manager) with separate transaction tracking. Switch profiles easily from the Profiles view.

## 🔧 Supported Routes & Ports

**Direct Routes:** Cebu↔Tagbilaran, Cebu↔Ormoc, Cebu↔Getafe, Cebu↔Palompon, Cebu↔Maasin, Tagbilaran↔Dumaguete, Tagbilaran↔Siquijor, Dumaguete↔Siquijor, Maasin↔Surigao, Bacolod↔Iloilo, Calapan↔Batangas

**Connecting Routes:** Cebu→Dumaguete (via Tagbilaran), Cebu→Siquijor (via Tagbilaran), Cebu→Surigao (via Maasin)

**13 Ports:** Cebu, Tagbilaran, Ormoc, Dumaguete, Siquijor, Maasin, Surigao, Palompon, Getafe, Iloilo, Bacolod, Calapan, Batangas

## 🔑 External Dependencies (CDN)

- **Leaflet.js** — Interactive map with vessel tracking
- **Chart.js** — Analytics charts
- **QRCode.js** — Receipt QR codes
- **Open-Meteo API** — Free weather data (no key required)
- **Open ER API** — Free exchange rate data (no key required)
- **Gemini AI API** — Chat assistant (user-provided key)

## 📱 PWA Support

- Installable as standalone app
- Offline-capable via Service Worker
- Network-first for app assets, stale-while-revalidate for CDN

## 🔐 Admin Access

Default credentials:
- Cashier: `cashier` / `cashier`
- Supervisor: `demo` / `demo`

## 📊 Data Storage

All data persists in localStorage with safe wrappers (`safeGetJSON`/`safeSetJSON`) that include error recovery and automatic old-key cleanup. Database version: 17.

---

*Ocean Fast Ferries Pro Ultra · V500 · Built with ⛴️*
