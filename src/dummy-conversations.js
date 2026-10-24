/*
 * Dummy conversations for trying the panel. Used by mock mode
 * (MOCK_DATA=true) and by `npm run seed`, which posts them to the real
 * customer context service.
 *
 * `minutesAgo` is when the customer's message arrived, relative to now, so
 * the data always looks recent (the service deletes messages after 7 days).
 */
module.exports = [
  {
    customerId: "919876543210",
    customerName: "Riya",
    exchanges: [
      {
        minutesAgo: 60 * 26,
        message: "Hi! Do you have party dresses for girls?",
        response: "Hi Riya! 👋 Yes, we have a lovely party collection for girls aged 1–10. Which age are you shopping for?",
        metadata: { intent: "greeting" }
      },
      {
        minutesAgo: 60 * 26 - 2,
        message: "show me something in red for my 4 year old",
        response: "Here are my favourite red picks for a 4-year-old 🌹\n\n1. Ruby Ruffle Frock – ₹1,299\n2. Cherry Bow Party Dress – ₹1,549\n3. Scarlet Tulle Gown – ₹1,899",
        metadata: { intent: "product_search", color: "red", age: 4 }
      },
      {
        minutesAgo: 60 * 26 - 5,
        message: "is the first one cotton?",
        response: "Yes — the Ruby Ruffle Frock is pure cotton, lined for comfort. Perfect for long parties!",
        metadata: { intent: "product_question" }
      },
      {
        minutesAgo: 45,
        message: "Do you deliver to Pune?",
        response: "Yes! We deliver across India 🚚 Pune orders usually arrive in 3–4 working days. Shipping is free above ₹999.",
        metadata: { intent: "faq_shipping" }
      }
    ]
  },
  {
    customerId: "919812345678",
    customerName: "Arjun Mehta",
    exchanges: [
      {
        minutesAgo: 60 * 5,
        message: "Where is my order? Order no LB10234",
        response: "Hi Arjun, your order LB10234 was shipped yesterday via Delhivery 📦 Tracking: DLV88213490. Expected delivery: tomorrow.",
        metadata: { intent: "order_status", orderId: "LB10234" }
      },
      {
        minutesAgo: 60 * 5 - 3,
        message: "Thanks. Can I change the size of the kurta to 6-7Y?",
        response: "Since the order has already shipped, we can't change it now — but exchanges are free within 15 days of delivery. Just reply EXCHANGE once it arrives 😊",
        metadata: { intent: "exchange" }
      },
      {
        minutesAgo: 12,
        message: "EXCHANGE",
        response: "Got it! I've started an exchange for the kurta (size 6-7Y). Our pickup partner will contact you within 48 hours.",
        metadata: { intent: "exchange" }
      }
    ]
  },
  {
    customerId: "917001122334",
    customerName: "Sneha",
    exchanges: [
      {
        minutesAgo: 60 * 30,
        message: "What's your return policy?",
        response: "We offer free returns within 15 days of delivery, as long as the tags are intact. Refunds reach your original payment method in 5–7 days.",
        metadata: { intent: "faq_returns" }
      },
      {
        minutesAgo: 60 * 30 - 1,
        message: "ok and COD available?",
        response: "Yes, Cash on Delivery is available on orders up to ₹5,000 💵",
        metadata: { intent: "faq_payment" }
      }
    ]
  },
  {
    customerId: "919988776655",
    customerName: "Karan",
    exchanges: [
      {
        minutesAgo: 60 * 2,
        message: "need a sherwani for my son's first birthday",
        response: "How lovely! 🎉 Here are our sherwanis for 12–18 months:\n\n1. Royal Ivory Sherwani Set – ₹2,499\n2. Peacock Blue Sherwani – ₹2,799\n3. Maroon Brocade Set – ₹2,299",
        metadata: { intent: "product_search", age: 1, occasion: "birthday" }
      },
      {
        minutesAgo: 60 * 2 - 4,
        message: "peacock blue one looks nice. what fabric?",
        response: "The Peacock Blue Sherwani is art silk with a soft cotton lining, so it's gentle on baby skin. Comes with matching pants and a dupatta.",
        metadata: { intent: "product_question" }
      },
      {
        minutesAgo: 60 * 2 - 6,
        message: "Can I talk to a person?",
        response: "Sure! I've asked our team to reach out — someone will message you here within 30 minutes (10am–8pm).",
        metadata: { intent: "human_handoff" }
      }
    ]
  },
  {
    customerId: "918123456789",
    customerName: null,
    exchanges: [
      {
        minutesAgo: 60 * 50,
        message: "hello",
        response: "Hi there! 👋 Welcome to Little Bansi. I can help you find outfits, track orders, or answer questions. What are you looking for today?",
        metadata: { intent: "greeting" }
      }
    ]
  },
  {
    customerId: "919090909090",
    customerName: "Priya S",
    exchanges: [
      {
        minutesAgo: 60 * 72,
        message: "Any discount going on?",
        response: "Yes! 🎁 Use code FESTIVE15 for 15% off on orders above ₹1,999. Valid till the end of this month.",
        metadata: { intent: "faq_offers" }
      },
      {
        minutesAgo: 60 * 72 - 2,
        message: "show twin outfits for 2 girls age 3 and 6",
        response: "Matching outfits are our speciality 👯\n\n1. Sunflower Twin Frocks – ₹1,099 each\n2. Pastel Lehenga Duo – ₹1,799 each\n3. Polka Dot Co-ord Sets – ₹899 each\n\nAll available in ages 2–10.",
        metadata: { intent: "product_search", ages: [3, 6] }
      },
      {
        minutesAgo: 60 * 72 - 8,
        message: "Sending a pic of what I want",
        response: "",
        metadata: { intent: "image", type: "image" }
      }
    ]
  }
];
