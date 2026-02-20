# Premam Silks

Premium silk saree e-commerce store built with vanilla HTML/CSS/JS and Firebase.

**Live:** [premamsilks.com](https://premamsilks.com) | [premamsilks-ae138.web.app](https://premamsilks-ae138.web.app)

## Features

- **Product Catalog** — Dynamic product pages with filtering by category (Banarasi, Kanjivaram, Paithani, etc.)
- **Shopping Cart & Wishlist** — Persistent cart sidebar and wishlist using localStorage
- **Checkout** — Order placement with WhatsApp enquiry integration (Razorpay payments coming soon)
- **Admin Dashboard** — Add/edit/delete products, manage orders, Cloudinary image uploads
- **Cloud Functions** — Secure server-side order creation, contact form, newsletter subscription
- **Responsive Design** — Mobile-first with glassmorphism UI
- **Silk Mark Certified** — Verified authentic silk products

## Tech Stack

- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Backend:** Firebase Cloud Functions (Node.js)
- **Database:** Firebase Firestore
- **Hosting:** Firebase Hosting
- **Images:** Cloudinary (with auto-compression)
- **Auth:** Firebase Authentication (admin)

## Project Structure

```
PremamSilks/
├── public/                  # Website files
│   ├── admin/               # Admin dashboard
│   ├── css/                 # Stylesheets
│   ├── images/              # Static images & logo
│   ├── js/                  # JavaScript modules
│   │   ├── firebase-config.js
│   │   ├── script.js
│   │   ├── shop-dynamic.js
│   │   ├── cart.js
│   │   ├── wishlist.js
│   │   └── checkout.js
│   ├── utils/               # Utilities
│   ├── index.html           # Homepage
│   ├── shop.html            # Product listing
│   ├── product.html         # Product detail
│   ├── checkout.html        # Checkout page
│   ├── about.html           # About us
│   ├── contact.html         # Contact page
│   └── ...                  # Policy pages, 404, etc.
├── functions/               # Firebase Cloud Functions
│   ├── index.js
│   └── package.json
├── firebase.json            # Firebase config
├── firestore.rules          # Firestore security rules
├── firestore.indexes.json   # Firestore indexes
└── .gitignore
```

## Setup

1. Clone the repo:
   ```bash
   git clone https://github.com/Dee-Nith/Premamsilks.git
   cd Premamsilks
   ```

2. Install Cloud Functions dependencies:
   ```bash
   cd functions && npm install && cd ..
   ```

3. Serve locally:
   ```bash
   firebase serve
   ```

## Deployment

```bash
firebase deploy
```

Deploy only hosting:
```bash
firebase deploy --only hosting
```

Deploy only functions:
```bash
firebase deploy --only functions
```

## Environment Variables

- **Firebase Config** — `public/js/firebase-config.js` (public safe)
- **Cloudinary** — Configured in `public/admin/admin.js` (unsigned preset)
- **Razorpay Secret** — `functions/.env` (not committed)

## License

MIT
