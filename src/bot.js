// src/bot.js — Conversation state machine powered by Kimi AI
const { kimiJson } = require('./kimi');
const { sendWhatsAppMessage } = require('./whatsapp');
const { orderQueries, convQueries, msgQueries, catalogQueries } = require('./db');

// ---------- Prompt templates (Darja / Arabic / French) ----------

const QUESTIONS = {
  name: {
    ar: 'مرحبا بيك! 👋 واش راك؟ راني هنا باش نسجّل طلبك.\nشحال اسمك الكامل؟',
    fr: 'Bonjour ! 👋 Bienvenue. Je suis là pour enregistrer votre commande.\nQuel est votre nom complet ?',
  },
  wilaya: {
    ar: 'تشرّفنا يا {name}! 😊 من ولاية؟',
    fr: 'Enchanté(e) {name} ! 😊 De quelle wilaya êtes-vous ?',
  },
  commune: {
    ar: 'ماشي مشكل، ومن بلدية؟',
    fr: 'Parfait ! Et de quelle commune ?',
  },
  product: {
    ar: 'هاك المنتجات المتوفرة:\n{list}\n\nشنو تحب تطلب؟ (اكتب رقم المنتج ولا اسمو)',
    fr: 'Voici nos produits disponibles:\n{list}\n\nQue souhaitez-vous commander ? (numéro ou nom)',
  },
  quantity: {
    ar: 'اختيار موفق! ✅ {product}\nشحال من وحدة تحب؟',
    fr: 'Excellent choix ! ✅ {product}\nCombien d\u0027unités voulez-vous ?',
  },
  confirm: {
    ar: '📋 *ملخص الطلب:*\n👤 الاسم: {name}\n📞 الهاتف: {phone}\n📍 الولاية: {wilaya}\n🏘 البلدية: {commune}\n🛍 المنتج: {product}\n🔢 الكمية: {quantity}\n💰 سعر الوحدة: {unit_price} دج\n🚚 التوصيل: {delivery_fee} دج\n━━━━━━━━━━━━━━\n💵 *المجموع: {total} دج*\n\n✅ باش تؤكد الطلب اكتب: *وافق* ولا *نعم*\n❌ باش تلغي اكتب: *لغي*',
    fr: '📋 *Récapitulatif de la commande:*\n👤 Nom: {name}\n📞 Téléphone: {phone}\n📍 Wilaya: {wilaya}\n🏘 Commune: {commune}\n🛍 Produit: {product}\n🔢 Quantité: {quantity}\n💰 Prix unitaire: {unit_price} DA\n🚚 Livraison: {delivery_fee} DA\n━━━━━━━━━━━━━━\n💵 *TOTAL: {total} DA*\n\n✅ Pour confirmer écrivez: *oui* ou *d\u0027accord*\n❌ Pour annuler écrivez: *annuler*',
  },
  confirm_again: {
    ar: 'ما فهمتش واش موافق ولا لا 😅\nاكتب *نعم* باش نأكد الطلب، ولا *لغي* باش نلغيه.',
    fr: 'Je n\u0027ai pas bien compris 😅\nÉcrivez *oui* pour confirmer, ou *annuler* pour annuler.',
  },
  confirmed: {
    ar: '✅ *تم تأكيد طلبك بنجاح!*\nرقم الطلب: #{id}\nالمجموع: {total} دج (مع التوصيل)\n\n📞 غادي يتصلو بيك للتأكيد من الرقم.\nشكرا على الثقة! 🙏\n\nإذا حبيت تطلب حاجة أخرى ابعث *طلب جديد*.',
    fr: '✅ *Votre commande est confirmée !*\nN° de commande: #{id}\nTotal: {total} DA (livraison incluse)\n\n📞 On vous appellera pour vérifier votre numéro.\nMerci de votre confiance ! 🙏\n\nPour une nouvelle commande écrivez *nouvelle commande*.',
  },
  cancelled: {
    ar: '❌ تم إلغاء الطلب. إذا تبدل رأيك ابعث *طلب جديد*.',
    fr: '❌ Commande annulée. Si vous changez d\u0027avis, écrivez *nouvelle commande*.',
  },
  fallback: {
    ar: 'سمحلي ما فهمتش 😅 {repeat}',
    fr: 'Désolé, je n\u0027ai pas bien compris 😅 {repeat}',
  },
  no_products: {
    ar: 'ماعندناش منتجات متوفرة حاليا. جرب معانا قريب! 🙏',
    fr: 'Aucun produit disponible pour le moment. Revenez bientôt ! 🙏',
  },
};

function t(lang, key, vars = {}) {
  const tpl = (QUESTIONS[key] && (QUESTIONS[key][lang] || QUESTIONS[key].ar)) || '';
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : ''));
}

function guessLang(text) {
  if (/[a-zA-Z]{3,}/.test(text) && !/[\u0600-\u06FF]/.test(text)) return 'fr';
  return 'ar'; // Arabic, Darja, numbers, mixed → default Arabic thread (Kimi answers in customer style)
}

function productList(lang) {
  const products = catalogQueries.products.all();
  if (products.length === 0) return null;
  return products.map((p, i) => `${i + 1}) ${lang === 'fr' && p.name_fr ? p.name_fr : p.name_ar} — ${p.price} دج`).join('\n');
}

// ---------- Kimi extraction ----------

async function extractWithKimi(text, stage, lang, products, wilayas) {
  const productDesc = products.map((p, i) => `${i + 1}. ${p.name_ar}${p.name_fr ? ' / ' + p.name_fr : ''} (${p.price} DA)`).join('\n');
  const wilayaDesc = wilayas.map(w => `${w.code}. ${w.name_ar} / ${w.name_fr}`).join('\n');

  const messages = [
    {
      role: 'system',
      content: `You are an order-taking AI for an e-commerce shop in Algeria. Customers write in Algerian Darja, Arabic or French.
Extract information from the customer message. Return ONLY a JSON object:
{
  "lang": "ar" or "fr",                  // the language the customer writes in
  "name": string | null,                 // customer's full name if mentioned
  "wilaya": string | null,               // wilaya name or code if mentioned
  "commune": string | null,              // commune (municipality) if mentioned
  "product": string | null,              // product name or number from the list if mentioned
  "quantity": number | null,             // integer quantity if mentioned
  "confirmed": boolean,                  // TRUE only if customer CLEARLY agrees to confirm the order (e.g. "نعم","وافق","موافق","أكد","oui","d'accord","ok" for confirmation). Greetings like "واش راك" or questions are NOT confirmation.
  "cancelled": boolean,                  // TRUE if customer clearly cancels/refuses (e.g. "لغي","ما عجبنيش","annuler")
  "new_order": boolean,                  // TRUE if customer asks to start a new order (e.g. "طلب جديد","nouvelle commande")
  "answer": string | null                // short friendly response in the customer's language, or null
}
Current conversation stage: ${stage}
Products:
${productDesc}
Wilayas (code. name):
${wilayaDesc}`,
    },
    { role: 'user', content: text },
  ];

  return kimiJson(messages, { temperature: 0.1 });
}

// ---------- Local matchers (fast, no AI needed) ----------

function matchWilaya(text, wilayas) {
  const norm = (s) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();
  const t = norm(text);
  const asNum = parseInt(t.replace(/[^\d]/g, ''), 10);
  if (!isNaN(asNum)) {
    const hit = wilayas.find(w => w.code === asNum);
    if (hit) return hit;
  }
  for (const w of wilayas) {
    const names = [w.name_ar, w.name_fr].filter(Boolean).map(norm);
    if (names.some(n => n.length > 3 && t.includes(n))) return w;
    if (names.some(n => n.length > 3 && n.includes(t) && t.length > 3)) return w;
  }
  return null;
}

function matchProduct(text, products) {
  const norm = (s) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').trim();
  const t = norm(text);
  const asNum = parseInt(t.replace(/[^\d]/g, ''), 10);
  if (!isNaN(asNum) && asNum >= 1 && asNum <= products.length) return products[asNum - 1];
  for (const p of products) {
    const names = [p.name_ar, p.name_fr].filter(Boolean).map(norm);
    if (names.some(n => n.length > 3 && t.includes(n))) return p;
  }
  return null;
}

function matchQuantity(text) {
  const m = text.match(/(\d+)/);
  if (m) {
    const q = parseInt(m[1], 10);
    if (q >= 1 && q <= 500) return q;
  }
  const words = { 'وحده': 1, 'واحد': 1, 'وحدة': 1, 'جوج': 2, 'ثنين': 2, 'اثنين': 2, 'ثلاثه': 3, 'ثلاثة': 3, 'ثلاث': 3, 'ربعه': 4, 'اربعه': 4, 'خمسه': 5, 'خمسة': 5 };
  const t = text.toLowerCase();
  for (const [w, v] of Object.entries(words)) if (t.includes(w)) return v;
  return null;
}

// Strict confirmation check (whitelist) — used as a second guard on top of Kimi
const CONFIRM_WORDS = ['وافق', 'موافق', 'نعم', 'صحيح', 'أكد', 'اكد', 'تاكد', 'confirme', 'oui', 'd\u0027accord', 'daccord', 'ok', 'yes'];
const CANCEL_WORDS = ['لغي', 'الغي', 'ما عجبنيش', 'باطل', 'annule', 'annuler', 'non merci'];

function clearConfirm(text) {
  const t = text.toLowerCase().trim();
  if (CANCEL_WORDS.some(w => t.includes(w))) return 'cancel';
  // single short affirmative is strong confirmation; inside longer text require exact-ish match
  const hasConfirm = CONFIRM_WORDS.some(w => t === w || t.includes(w));
  if (hasConfirm && t.length <= 40) return 'confirm';
  return null;
}

// ---------- Order helpers ----------

function computeTotal(order) {
  const unit = order.unit_price || 0;
  const qty = order.quantity || 1;
  const fee = order.delivery_fee || 0;
  return unit * qty + fee;
}

function buildSummary(order, lang, phone) {
  return t(lang, 'confirm', {
    name: order.customer_name || '—',
    phone,
    wilaya: order.wilaya || '—',
    commune: order.commune || '—',
    product: order.product_name || '—',
    quantity: order.quantity || 1,
    unit_price: order.unit_price || 0,
    delivery_fee: order.delivery_fee || 0,
    total: computeTotal(order),
  });
}

async function reply(phone, text) {
  msgQueries.log.run(phone, 'out', text);
  await sendWhatsAppMessage(phone, text);
}

// ---------- Main entry: process one incoming WhatsApp message ----------

async function handleIncomingMessage(phone, text, profileName) {
  msgQueries.log.run(phone, 'in', text);
  const lang = guessLang(text);
  const wilayas = catalogQueries.wilayas.all();
  const products = catalogQueries.products.all();

  let conv = convQueries.get.get(phone);
  const lower = text.toLowerCase();
  const wantsNew = ['طلب جديد', 'new order', 'nouvelle commande'].some(k => lower.includes(k));

  // Start or restart a conversation
  if (!conv || conv.stage === 'done' || wantsNew) {
    const order = orderQueries.create.run(phone, profileName || null);
    conv = { phone, stage: 'name', data: '{}', lang, order_id: order.lastInsertRowid };
    convQueries.upsert.run(phone, 'name', '{}', lang, conv.order_id);
    const list = productList(lang);
    await reply(phone, t(lang, 'name') + (list ? '' : '\n\n' + t(lang, 'no_products')));
    return;
  }

  let data = JSON.parse(conv.data || '{}');
  const order = orderQueries.get.get(conv.order_id);
  if (!order) {
    convQueries.remove.run(phone);
    return;
  }

  // Ask Kimi to understand the message (Darja/Arabic/French)
  let ex = {};
  try {
    ex = await extractWithKimi(text, conv.stage, conv.lang || lang, products, wilayas);
  } catch (e) {
    console.error('[bot] Kimi extraction failed:', e.message);
  }
  const detectedLang = (ex.lang === 'fr') ? 'fr' : (conv.lang || lang);
  convQueries.upsert.run(phone, conv.stage, JSON.stringify(data), detectedLang, conv.order_id);

  // Global intents
  if (ex.new_order || wantsNew) {
    orderQueries.setStatus.run('cancelled', order.id); // close the old dangling order
    const fresh = orderQueries.create.run(phone, null);
    convQueries.upsert.run(phone, 'name', '{}', detectedLang, fresh.lastInsertRowid);
    await reply(phone, t(detectedLang, 'name'));
    return;
  }
  if (ex.cancelled || conv.stage === 'confirm' && clearConfirm(text) === 'cancel') {
    orderQueries.setStatus.run('cancelled', order.id);
    convQueries.upsert.run(phone, 'done', '{}', detectedLang, order.id);
    await reply(phone, t(detectedLang, 'cancelled'));
    return;
  }

  // Stage machine
  switch (conv.stage) {
    case 'name': {
      const name = ex.name || (text.trim().length >= 3 && text.trim().length <= 60 && !matchWilaya(text, wilayas) ? text.trim() : null);
      if (name) {
        data.name = name;
        convQueries.upsert.run(phone, 'wilaya', JSON.stringify(data), detectedLang, order.id);
        orderQueries.setStatus.run('confirming', order.id);
        await reply(phone, t(detectedLang, 'wilaya', { name }));
      } else {
        await reply(phone, t(detectedLang, 'fallback', { repeat: t(detectedLang, 'name') }));
      }
      break;
    }

    case 'wilaya': {
      const w = matchWilaya(text, wilayas) || (ex.wilaya ? matchWilaya(String(ex.wilaya), wilayas) : null);
      if (w) {
        data.wilaya = w.name_ar;
        data.wilaya_code = w.code;
        data.delivery_fee = w.delivery_fee;
        convQueries.upsert.run(phone, 'commune', JSON.stringify(data), detectedLang, order.id);
        await reply(phone, t(detectedLang, 'commune'));
      } else {
        await reply(phone, t(detectedLang, 'fallback', { repeat: t(detectedLang, 'wilaya', { name: data.name || '' }) }));
      }
      break;
    }

    case 'commune': {
      const commune = ex.commune || (text.trim().length >= 2 && text.trim().length <= 60 ? text.trim() : null);
      if (commune) {
        data.commune = commune;
        convQueries.upsert.run(phone, 'product', JSON.stringify(data), detectedLang, order.id);
        const list = productList(detectedLang);
        if (!list) { await reply(phone, t(detectedLang, 'no_products')); break; }
        await reply(phone, t(detectedLang, 'product', { list }));
      } else {
        await reply(phone, t(detectedLang, 'fallback', { repeat: t(detectedLang, 'commune') }));
      }
      break;
    }

    case 'product': {
      const p = matchProduct(text, products) || (ex.product ? matchProduct(String(ex.product), products) : null);
      if (p) {
        data.product_id = p.id;
        data.product_name = detectedLang === 'fr' && p.name_fr ? p.name_fr : p.name_ar;
        data.unit_price = p.price;
        // If quantity already given in same message, jump straight to summary
        const q = ex.quantity || matchQuantity(text);
        if (q) {
          data.quantity = q;
          await finishAndAskConfirm(phone, data, order, detectedLang);
        } else {
          convQueries.upsert.run(phone, 'quantity', JSON.stringify(data), detectedLang, order.id);
          await reply(phone, t(detectedLang, 'quantity', { product: data.product_name }));
        }
      } else {
        const list = productList(detectedLang);
        await reply(phone, t(detectedLang, 'fallback', { repeat: list ? t(detectedLang, 'product', { list }) : '' }));
      }
      break;
    }

    case 'quantity': {
      const q = ex.quantity || matchQuantity(text);
      if (q) {
        data.quantity = q;
        await finishAndAskConfirm(phone, data, order, detectedLang);
      } else {
        await reply(phone, t(detectedLang, 'fallback', { repeat: t(detectedLang, 'quantity', { product: data.product_name || '' }) }));
      }
      break;
    }

    case 'confirm': {
      // STRICT rule: only clear agreement confirms the order
      const strict = clearConfirm(text);
      const confirmed = (strict === 'confirm') || (!strict && ex.confirmed === true && !ex.cancelled);
      if (confirmed) {
        const total = computeTotal(data);
        orderQueries.updateInfo.run(
          data.name, data.wilaya, data.wilaya_code || null, data.commune,
          data.product_id || null, data.product_name, data.quantity || 1,
          data.unit_price || 0, data.delivery_fee || 0, total,
          'confirmed', order.id
        );
        convQueries.upsert.run(phone, 'done', '{}', detectedLang, order.id);
        await reply(phone, t(detectedLang, 'confirmed', { id: order.id, total }));

        // Notify admin
        const admin = process.env.ADMIN_PHONE;
        if (admin) {
          const note = [
            '🛎 *طلب جديد مؤكد!*',
            `رقم الطلب: #${order.id}`,
            `👤 الاسم: ${data.name}`,
            `📞 الهاتف: ${phone}`,
            `📍 الولاية: ${data.wilaya} (${data.commune})`,
            `🛍 المنتج: ${data.product_name} × ${data.quantity}`,
            `💵 المجموع: ${total} دج`,
            `📅 ${new Date().toLocaleString('fr-DZ')}`,
          ].join('\n');
          try { await sendWhatsAppMessage(admin, note); } catch (e) { console.error('[bot] admin notify failed:', e.message); }
        }
      } else {
        await reply(phone, t(detectedLang, 'confirm_again'));
      }
      break;
    }

    default:
      convQueries.remove.run(phone);
  }
}

async function finishAndAskConfirm(phone, data, order, lang) {
  convQueries.upsert.run(phone, 'confirm', JSON.stringify(data), lang, order.id);
  await reply(phone, buildSummary(data, lang, phone));
}

module.exports = { handleIncomingMessage };
