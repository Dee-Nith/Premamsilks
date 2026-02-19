const functions = require("firebase-functions");
const admin = require("firebase-admin");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const cors = require("cors");
const nodemailer = require("nodemailer");

admin.initializeApp();
const db = admin.firestore();

const corsHandler = cors({ origin: true });

// Razorpay instance (keys from .env file)
let razorpay;
function getRazorpay() {
  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }
  return razorpay;
}

// ============================================================
// 1. CREATE RAZORPAY ORDER (server-side verified amount)
// ============================================================
exports.createOrder = functions
  .region("asia-south1")
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      try {
        const { items, customer, shippingAddress, notes } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
          return res.status(400).json({ error: "Cart items are required" });
        }
        if (!customer?.name || !customer?.email || !customer?.phone) {
          return res.status(400).json({ error: "Customer details are required" });
        }
        if (!shippingAddress?.address || !shippingAddress?.city || !shippingAddress?.pincode) {
          return res.status(400).json({ error: "Shipping address is required" });
        }

        // Fetch actual prices from Firestore (prevent client-side manipulation)
        const productIds = items.map((i) => i.productId);
        const productsSnap = await db.getAll(
          ...productIds.map((id) => db.collection("products").doc(id))
        );

        let subtotal = 0;
        const verifiedItems = [];

        for (let i = 0; i < items.length; i++) {
          const doc = productsSnap[i];
          if (!doc.exists) {
            return res.status(400).json({ error: `Product not found: ${items[i].productId}` });
          }

          const product = doc.data();

          // Stock check
          if (product.stock !== undefined && product.stock < items[i].quantity) {
            return res.status(400).json({
              error: `"${product.name}" is out of stock. Only ${product.stock} left.`,
            });
          }

          const itemTotal = product.price * items[i].quantity;
          subtotal += itemTotal;

          verifiedItems.push({
            productId: items[i].productId,
            name: product.name,
            price: product.price,
            quantity: items[i].quantity,
            image: product.image || product.images?.[0] || "",
          });
        }

        // Load store settings for shipping/GST
        const settingsDoc = await db.collection("settings").doc("store").get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const freeShippingThreshold = settings.freeShippingThreshold || 25000;
        const shippingCost = settings.shippingCost || 500;
        const gstRate = settings.gst || 5;

        const shipping = subtotal >= freeShippingThreshold ? 0 : shippingCost;
        const gst = Math.round(subtotal * (gstRate / 100));
        const totalAmount = subtotal + shipping + gst;

        // Create Razorpay order
        const rzpOrder = await getRazorpay().orders.create({
          amount: totalAmount * 100, // paise
          currency: "INR",
          receipt: `order_${Date.now()}`,
          notes: { source: "premam_silks_website" },
        });

        // Create Firestore order
        const orderRef = await db.collection("orders").add({
          customer: {
            name: customer.name.trim(),
            email: customer.email.trim().toLowerCase(),
            phone: customer.phone.replace(/\s/g, ""),
          },
          shippingAddress: {
            address: shippingAddress.address.trim(),
            city: shippingAddress.city.trim(),
            state: (shippingAddress.state || "").trim(),
            pincode: shippingAddress.pincode.trim(),
            country: "India",
          },
          items: verifiedItems,
          itemCount: verifiedItems.reduce((sum, i) => sum + i.quantity, 0),
          subtotal,
          shipping,
          gst,
          totalAmount,
          notes: (notes || "").trim(),
          razorpayOrderId: rzpOrder.id,
          paymentMethod: "razorpay",
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).json({
          orderId: orderRef.id,
          razorpayOrderId: rzpOrder.id,
          amount: totalAmount,
          currency: "INR",
        });
      } catch (error) {
        console.error("createOrder error:", error);
        return res.status(500).json({ error: "Failed to create order. Please try again." });
      }
    });
  });

// ============================================================
// 2. VERIFY PAYMENT (server-side signature verification)
// ============================================================
exports.verifyPayment = functions
  .region("asia-south1")
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      try {
        const {
          orderId,
          razorpayOrderId,
          razorpayPaymentId,
          razorpaySignature,
        } = req.body;

        if (!orderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return res.status(400).json({ error: "Missing payment verification data" });
        }

        // Verify signature
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        const expectedSignature = crypto
          .createHmac("sha256", keySecret)
          .update(`${razorpayOrderId}|${razorpayPaymentId}`)
          .digest("hex");

        if (expectedSignature !== razorpaySignature) {
          console.error("Payment signature mismatch:", { orderId, razorpayPaymentId });
          return res.status(400).json({ error: "Payment verification failed" });
        }

        // Update order as paid
        const orderRef = db.collection("orders").doc(orderId);
        const orderDoc = await orderRef.get();

        if (!orderDoc.exists) {
          return res.status(404).json({ error: "Order not found" });
        }

        const orderData = orderDoc.data();

        // Decrement stock for each item
        const batch = db.batch();
        for (const item of orderData.items) {
          const productRef = db.collection("products").doc(item.productId);
          batch.update(productRef, {
            stock: admin.firestore.FieldValue.increment(-item.quantity),
          });
        }

        // Update order status
        batch.update(orderRef, {
          status: "paid",
          razorpayPaymentId,
          razorpayOrderId,
          razorpaySignature,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        await batch.commit();

        return res.status(200).json({
          success: true,
          orderId,
          message: "Payment verified and order confirmed",
        });
      } catch (error) {
        console.error("verifyPayment error:", error);
        return res.status(500).json({ error: "Payment verification failed. Please contact support." });
      }
    });
  });

// ============================================================
// 3. SUBMIT CONTACT FORM
// ============================================================
exports.submitContact = functions
  .region("asia-south1")
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      try {
        const { name, email, phone, subject, message } = req.body;

        if (!name || !email || !message) {
          return res.status(400).json({ error: "Name, email, and message are required" });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: "Invalid email address" });
        }

        const contactData = {
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: (phone || "").trim(),
          subject: (subject || "General Enquiry").trim(),
          message: message.trim(),
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        await db.collection("contactMessages").add(contactData);

        // Send email notification
        try {
          const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
              user: process.env.GMAIL_USER,
              pass: process.env.GMAIL_APP_PASSWORD,
            },
          });

          await transporter.sendMail({
            from: `"Premam Silks Website" <${process.env.GMAIL_USER}>`,
            to: process.env.GMAIL_USER,
            replyTo: contactData.email,
            subject: `New Contact: ${contactData.subject} — from ${contactData.name}`,
            html: `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                <h2 style="color:#8B1A2B;border-bottom:2px solid #8B1A2B;padding-bottom:10px;">New Contact Form Message</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Name:</td><td style="padding:8px 0;">${contactData.name}</td></tr>
                  <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Email:</td><td style="padding:8px 0;"><a href="mailto:${contactData.email}">${contactData.email}</a></td></tr>
                  <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Phone:</td><td style="padding:8px 0;">${contactData.phone || "Not provided"}</td></tr>
                  <tr><td style="padding:8px 0;font-weight:bold;color:#555;">Subject:</td><td style="padding:8px 0;">${contactData.subject}</td></tr>
                </table>
                <div style="background:#f9f6f0;padding:16px;border-radius:8px;margin-top:16px;">
                  <p style="font-weight:bold;color:#555;margin:0 0 8px;">Message:</p>
                  <p style="margin:0;color:#333;white-space:pre-wrap;">${contactData.message}</p>
                </div>
                <p style="color:#aaa;font-size:12px;margin-top:24px;">Sent from Premam Silks website contact form</p>
              </div>
            `,
          });
        } catch (emailErr) {
          console.error("Email notification failed:", emailErr.message);
          // Don't fail the request if email fails — message is saved in Firestore
        }

        return res.status(200).json({ success: true, message: "Message sent successfully" });
      } catch (error) {
        console.error("submitContact error:", error);
        return res.status(500).json({ error: "Failed to send message. Please try again." });
      }
    });
  });

// ============================================================
// 4. SUBSCRIBE TO NEWSLETTER
// ============================================================
exports.subscribeNewsletter = functions
  .region("asia-south1")
  .https.onRequest((req, res) => {
    corsHandler(req, res, async () => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
      }

      try {
        const { email } = req.body;

        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return res.status(400).json({ error: "Valid email is required" });
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Check for duplicates
        const existing = await db
          .collection("newsletter")
          .where("email", "==", normalizedEmail)
          .limit(1)
          .get();

        if (!existing.empty) {
          return res.status(200).json({ success: true, message: "You're already subscribed!" });
        }

        await db.collection("newsletter").add({
          email: normalizedEmail,
          subscribedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        return res.status(200).json({ success: true, message: "Subscribed successfully!" });
      } catch (error) {
        console.error("subscribeNewsletter error:", error);
        return res.status(500).json({ error: "Subscription failed. Please try again." });
      }
    });
  });
