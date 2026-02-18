# Premam Silks — E-Commerce Website

A premium e-commerce website for Premam Silks, featuring a dynamic product catalog, admin dashboard, and wishlist functionality.

## 🚀 Features

- **Dynamic Product Catalog**: Products fetched from Firebase Firestore.
- **Admin Dashboard**:
    - Add/Edit/Delete products.
    - Cloudinary image uploads (drag & drop).
    - Manage categories and stock.
- **Wishlist**: Persistent wishlist with local storage.
- **Cart & Checkout**: Functional cart with WhatsApp enquiry integration.
- **Responsive Design**: Mobile-friendly UI with glassmorphism effects.

## 📂 Project Structure

```
PremamSilks/
├── public/             # All website files (HTML, CSS, JS, Images)
├── firebase.json       # Firebase Hosting config
├── firestore.rules     # Database security rules
└── README.md           # This file
```

## 🛠️ Setup & Development

1.  **Clone the repository**.
2.  **Serve locally**:
    ```bash
    npx http-server public -c-1
    ```
3.  **Open in browser**: `http://localhost:8080`

## 📦 Deployment

The project is configured for **Firebase Hosting**.

```bash
firebase deploy
```

## 🔑 Environment Variables

- **Firebase Config**: Located in `js/firebase-config.js` (publicly safe).
- **Cloudinary**: Configured in `admin/admin.js` (unsigned preset).

> **Note**: Sensitive keys (Razorpay, etc.) are excluded from this repo via `.gitignore`.
