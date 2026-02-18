# 🛍️ PREMAM SILKS — Handover Documentation

> **Last Updated:** February 17, 2026  
> **Site:** [https://premamsilks-ae138.web.app](https://premamsilks-ae138.web.app)  
> **Domain:** premamsilks.com (DNS pending)

---

## 📋 Quick Links

| Service | URL |
|---------|-----|
| **Live Site** | https://premamsilks-ae138.web.app |
| **Admin Dashboard** | https://premamsilks-ae138.web.app/admin/ |
| **Firebase Console** | https://console.firebase.google.com/project/premamsilks-ae138 |
| **Razorpay Dashboard** | https://dashboard.razorpay.com |

---

## 🔑 Credentials & API Keys

### Firebase Project
- **Project ID:** `premamsilks-ae138`
- **Owner Email:** premamsilks@gmail.com
- **Collaborator:** nith.dpk@gmail.com
- **Region:** Mumbai (asia-south1)

### Razorpay (Test Mode)
- **Key ID:** `rzp_test_SH7h25wJ8JNUWJ`
- **Key Secret:** `SJSU2KlSdMd7yiQcFNLSwPwY` *(stored only in rzp-key.csv on Desktop)*

> ⚠️ **IMPORTANT:** These are TEST keys. Before going live:
> 1. Go to [Razorpay Dashboard](https://dashboard.razorpay.com) → Settings → API Keys
> 2. Switch to **Live Mode** and generate new live keys
> 3. Update `js/firebase-config.js` line 32 with the new live Key ID

### Admin Access
- **Login method:** Google Sign-In
- **Authorized email:** premamsilks@gmail.com
- To add more admin emails, edit `firestore.rules` line 48

---

## 🏗️ Architecture

```
premamsilks.com
├── index.html          → Homepage (hero, featured products, categories)
├── shop.html           → Product catalog (filters, sort, pagination)
├── product.html        → Individual product detail page
├── checkout.html       → Cart → Shipping → Razorpay payment
├── order-confirmation  → Post-payment success page
├── about.html          → About Premam Silks
├── contact.html        → Contact form
├── admin/
│   └── index.html      → Admin dashboard (login → manage products/orders)
├── js/
│   ├── firebase-config.js  → Firebase + Razorpay configuration
│   ├── cart.js             → Shopping cart (localStorage)
│   └── checkout.js         → Payment processing
├── css/                → Stylesheets
└── images/             → Static assets
```

### Tech Stack
| Layer | Service | Purpose |
|-------|---------|---------|
| Database | Firestore | Products, orders, categories |
| Auth | Firebase Auth (Google) | Admin login |
| Payments | Razorpay | UPI, cards, net banking, wallets |
| Hosting | Firebase Hosting | CDN-delivered website |
| Images | Cloudinary *(to be set up)* | Product image hosting |

---

## 📦 Common Operations

### Adding a New Product
1. Go to `admin/` → Sign in with Google
2. Click **Products** tab → **+ Add Product**
3. Fill in name, price, category, description, etc.
4. Click **Save Product**

### Managing Orders
1. Go to `admin/` → **Orders** tab
2. View order details (customer info, items, payment status)
3. Update order status: Pending → Packed → Shipped → Delivered

### Updating Prices
1. Go to `admin/` → **Products** tab
2. Click the edit ✏️ icon on any product
3. Update price/original price → **Save**

---

## 🚀 Deploying Updates

### Quick Deploy (Files Changed)
```bash
cd /Users/nith/Desktop/PremamSilks
firebase deploy --only hosting
```

### Deploy Security Rules
```bash
firebase deploy --only firestore:rules
```

### Deploy Everything
```bash
firebase deploy
```

---

## 🌐 Connecting premamsilks.com Domain

### Step 1: Add Domain in Firebase
```bash
firebase hosting:channel:deploy live
```
Or via Firebase Console → Hosting → **Add custom domain** → Enter `premamsilks.com`

### Step 2: Update GoDaddy DNS
Firebase will provide DNS records. In GoDaddy:
1. Go to **DNS Management** for premamsilks.com
2. Add/update **A Records** and **TXT Records** as shown by Firebase
3. Wait 24-48 hours for propagation

---

## 🔒 Security

### Firestore Rules Summary
- **Products:** Anyone can read, only admin can write
- **Categories:** Anyone can read, only admin can write  
- **Orders:** Anyone can create (checkout), only admin can read/update
- **Settings:** Anyone can read, only admin can write
- **Admin:** Restricted to `premamsilks@gmail.com`

### To Add Another Admin Email
Edit `firestore.rules`, line 48:
```javascript
request.auth.token.email in [
    'premamsilks@gmail.com',
    'newemail@gmail.com'    // Add new admin here
]
```
Then deploy: `firebase deploy --only firestore:rules`

---

## 💳 Going Live with Razorpay

1. **Complete KYC** on Razorpay Dashboard (PAN, GST, bank details)
2. **Activate live mode** in Razorpay Dashboard
3. **Generate live API keys** → Settings → API Keys
4. **Update** `js/firebase-config.js` line 32:
   ```javascript
   keyId: "rzp_live_XXXXXXXXXXXXXX",
   ```
5. **Redeploy:** `firebase deploy --only hosting`

### GST Configuration
- Current GST rate in code: **5%** (line 58 in `firebase-config.js`)
- For sarees above ₹1,000, consider updating to **12%** (HSN 5007)
- Update `js/firebase-config.js` line 58: `gst: 12`

---

## 🛠️ Troubleshooting

| Issue | Solution |
|-------|----------|
| Products not loading | Check Firestore rules allow public read |
| Admin login fails | Verify email is in `firestore.rules` admin list |
| Payment fails | Check Razorpay key is correct in `firebase-config.js` |
| Deploy fails | Run `firebase login` and ensure correct account |
| Images not showing | Check Cloudinary URLs in product data |

---

## 📱 Contact

For technical issues: Check Firebase Console logs and Razorpay Dashboard for payment issues.

**Firebase Support:** https://firebase.google.com/support  
**Razorpay Support:** https://razorpay.com/support/
