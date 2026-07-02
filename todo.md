# Ocean Ferries Pro — V500 Ultra Upgrade Tasks

## Planning
- [x] Review current V400 codebase (all 8 files)
- [x] Identify upgrade opportunities
- [ ] Implement V500 upgrades across all files

## New Features for V500
1. **👥 Group Booking Calculator** — Multi-passenger group booking with per-person breakdown + group total + group discount (5% off 5+ pax, 10% off 10+ pax)
2. **📋 Trip Checklist** — Pre-departure checklist per port (documents, ID requirements, terminal info, boarding tips) with localStorage save
3. **🔔 Smart Departure Alerts** — Auto-check schedule for booked routes, notify 30min/1hr before departure
4. **📱 Share/Export Booking** — Generate shareable booking link (text summary) + WhatsApp share button
5. **💸 Expense Tracker** — Track all travel expenses (tickets, baggage, food, transport) per trip with totals & category breakdown
6. **⏱️ Travel Time Estimator** — Show total travel time including connection wait for connecting/multi-hop routes
7. **🌙 Tide & Sea Info Card** — Show tide status at departure port (sunrise/sunset times, moon phase, tide estimate)
8. **📊 Dashboard Quick Stats Redesign** — Revamped dashboard with animated counters, mini route popularity chart, and recent activity feed
9. **🔄 Auto Currency Update** — Fetch live exchange rates from free API on startup (fallback to hardcoded rates)
10. **🗂️ Multi-Profile Support** — Cashier/supervisor can have named profiles with separate transaction histories

## Implementation
- [ ] Upgrade data.js — Add V500 data (group discount tiers, checklists, expense categories, tide data, profile schema, DB_VERSION 17)
- [ ] Upgrade utils.js — Add group discount calc, travel time estimator, tide/sun calculator, expense tracker helpers, live currency fetch
- [ ] Upgrade app.js — Add all new views, integrate new features into dashboard/calculator/bookings, smart alerts
- [ ] Upgrade styles.css — Add styles for all new V500 components
- [ ] Upgrade index.html — Add new view containers, update version to V500, add new nav items
- [ ] Upgrade map.js — Add tide markers, travel time tooltips
- [ ] Upgrade sw.js — V500 cache name
- [ ] Upgrade manifest.json — V500 naming
- [ ] Upgrade README.md — Document V500 features

## Deployment
- [ ] Commit all V500 changes
- [ ] Push to GitHub
- [ ] Verify deployment
