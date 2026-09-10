# DZ WhatsApp Shop — بوت طلبات واتساب للتجارة الإلكترونية في الجزائر

نظام حقيقي كامل: بوت واتساب يستقبل الطلبات بالدارجة الجزائرية / العربية / الفرنسية باستعمال **Kimi API**، يحفظها في قاعدة بيانات SQLite، ويرسلها إلى لوحة تحكم عربية متجاوبة.

## المعمارية

```
┌──────────┐   Webhook    ┌─────────────────┐   Kimi API    ┌────────────┐
│ WhatsApp │ ───────────▶ │ Node.js/Express │ ────────────▶ │  Kimi AI   │
│  Cloud   │ ◀─────────── │  + SQLite (bot) │ ◀──────────── │ (فهم الدارجة)│
└──────────┘  send message└───────┬─────────┘               └────────────┘
                                  │
                    ┌─────────────┴──────────────┐
                    ▼                            ▼
            ┌──────────────┐            ┌──────────────────┐
            │  SQLite DB   │            │ لوحة تحكم (Dashboard)│
            │ orders etc.  │            │  public/index.html  │
            └──────────────┘            └──────────────────┘
```

- **src/index.js** — نقطة الدخول، Express، webhook verification/reception.
- **src/whatsapp.js** — إرسال الرسائل عبر WhatsApp Cloud API.
- **src/kimi.js** — عميل Kimi API (يفهم الدارجة ويستخرج المعلومات JSON).
- **src/bot.js** — آلة حالة المحادثة: اسم ← ولاية ← بلدية ← منتج ← كمية ← تأكيد.
- **src/db.js** — SQLite: المنتجات، الولايات وأسعار التوصيل، الطلبات، المحادثات.
- **src/routes/api.js** — REST API للوحة التحكم.
- **public/** — لوحة تحكم عربية RTL متجاوبة.

## التشغيل محليًا

```bash
cd dz-whatsapp-shop
npm install
cp .env.example .env   # ثم عدّل المفاتيح
npm start
```

افتح لوحة التحكم: `http://localhost:3000`

## ربط واتساب خطوة بخطوة

### 1) أنشئ تطبيق Meta Developer
1. اذهب إلى https://developers.facebook.com و أنشئ حسابًا ثم **Create App** ← اختر **Business** (نوع التطبيق).
2. من لوحة التطبيق أضف منتج **WhatsApp** ← **Set up**.

### 2) احصل على بيانات API
3. في **WhatsApp ← API setup** ستجد:
   - **Temporary access token** (صلاحيته 24 ساعة — للإنتاج اصنع System User token دائم من Business Settings ← System Users ← Add ← Admin، واضبط الصلاحيات على WhatsApp Business App).
   - **Phone number ID** — انسخه إلى `WHATSAPP_PHONE_NUMBER_ID`.
4. أضف `WHATSAPP_TOKEN` في ملف `.env`.

### 3) أضف رقمًا حقيقيًا (اختياري للاختبار تجاوزه)
- للاختبار Meta يعطيك رقمًا تجريبيًا يمكنه مراسلة 5 أرقام فقط (أضفها في **To** field).
- للإنتاج: WhatsApp ← Configuration ← Add phone number ← فعّل الرقم برمز التحقق.

### 4) اربط الـ Webhook
5. نفّذ ngrok ليكشف خادمك: `ngrok http 3000` ← خذ الرابط `https://xxxx.ngrok-free.app`.
6. في Meta Console ← WhatsApp ← Configuration ← Webhook:
   - **Callback URL**: `https://xxxx.ngrok-free.app/webhook`
   - **Verify Token**: نفس قيمة `VERIFY_TOKEN` في `.env`
   - اضغط Verify and Save، ثم Subscribe الحقل **messages**.

### 5) أضف مفتاح Kimi
7. أنشئ حسابًا في https://platform.moonshot.ai ← API Keys ← انسخ المفتاح إلى `KIMI_API_KEY`.

### 6) اختبر
أرسل رسالة للرقم من واتساب: "واش راك، حاب نطلب" — يجب أن يبدأ البوت بالسؤال عن الاسم.

## استعمال لوحة التحكم

- **الطلبات**: تبويبات (جديد / قيد التأكيد / مؤكد / ملغى) + تغيير الحالة من القائمة.
- **المنتجات**: إضافة / تعديل / حذف المنتجات والأسعار (الاسم بالعربية والفرنسية).
- **التوصيل**: جدول 58 ولاية — عدّل سعر التوصيل واضغط حفظ.
- الإحصائيات تظهر أعلى الصفحة (الطلبات اليوم، المؤكدة، الإيرادات).

## ملاحظات مهمة

- **الطلب لا يُحفظ كمؤكد إلا برضا صريح** — البوت يسأل "واش تؤكد؟" ولا يعتبر إلا "نعم/وافق/oui/d'accord..." تأكيدًا (كلمات التحية وحدها لا تكفي).
- كل رسالة واردة تُسجَّل في جدول `messages` للمراجعة.
- في `.env` لا ترفع الملف أبدًا لـ Git (مدمج في .gitignore).
- لتحديث أسعار التوصيل حسب ولايتك عدّلها من لوحة التحكم مباشرة.

## تعديلات إنتاجية مقترحة

- وضع الخادم خلف HTTPS حقيقي (nginx) بدل ngrok.
- Webhook signature verification (X-Hub-Signature-256) باستعمال `WHATSAPP_APP_SECRET`.
- Webhook queue (Redis/BullMQ) لو عندك حجم كبير.
