// src/db.js — SQLite database layer
const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'shop.db'));
db.pragma('journal_mode = WAL');

const WILAYAS = [
  [1,'أدرار','Adrar'],[2,'الشلف','Chlef'],[3,'الأغواط','Laghouat'],[4,'أم البواقي','Oum El Bouaghi'],
  [5,'باتنة','Batna'],[6,'بجاية','Béjaïa'],[7,'بسكرة','Biskra'],[8,'بشار','Béchar'],
  [9,'البليدة','Blida'],[10,'البويرة','Bouira'],[11,'تمنراست','Tamanrasset'],[12,'تبسة','Tébessa'],
  [13,'تلمسان','Tlemcen'],[14,'تيارت','Tiaret'],[15,'تيزي وزو','Tizi Ouzou'],[16,'الجزائر','Alger'],
  [17,'الجلفة','Djelfa'],[18,'جيجل','Jijel'],[19,'سطيف','Sétif'],[20,'سعيدة','Saïda'],
  [21,'سكيكدة','Skikda'],[22,'سيدي بلعباس','Sidi Bel Abbès'],[23,'عنابة','Annaba'],[24,'قالمة','Guelma'],
  [25,'قسنطينة','Constantine'],[26,'المدية','Médéa'],[27,'مستغانم','Mostaganem'],[28,'المسيلة','M\u0027Sila'],
  [29,'معسكر','Mascara'],[30,'ورقلة','Ouargla'],[31,'وهران','Oran'],[32,'البيض','El Bayadh'],
  [33,'إليزي','Illizi'],[34,'برج بوعريريج','Bordj Bou Arréridj'],[35,'بومرداس','Boumerdès'],[36,'الطارف','El Tarf'],
  [37,'تندوف','Tindouf'],[38,'تيسمسيلت','Tissemsilt'],[39,'الوادي','El Oued'],[40,'خنشلة','Khenchela'],
  [41,'سوق أهراس','Souk Ahras'],[42,'تيبازة','Tipaza'],[43,'ميلة','Mila'],[44,'عين الدفلى','Aïn Defla'],
  [45,'النعامة','Naâma'],[46,'عين تموشنت','Aïn Témouchent'],[47,'غرداية','Ghardaïa'],[48,'غليزان','Relizane'],
  [49,'تيميمون','Timimoun'],[50,'برج باجي مختار','Bordj Badji Mokhtar'],[51,'أولاد جلال','Ouled Djellal'],
  [52,'بني عباس','Béni Abbès'],[53,'عين صالح','In Salah'],[54,'عين قزام','In Guezzam'],[55,'تقرت','Touggourt'],
  [56,'جانت','Djanet'],[57,'المغير','El M\u0027Ghair'],[58,'المنيعة','El Meniaa'],
];

// Default delivery fee tiers (DA) — edit freely from the dashboard
function defaultFee(code) {
  const south = [11, 33, 37, 49, 50, 52, 53, 54, 56];
  const farSouth = [30, 39, 47, 51, 55, 57, 58];
  if (code === 16) return 300;                 // Alger
  if ([9, 35, 42, 6, 15, 5, 19, 25, 31].includes(code)) return 450;
  if (south.includes(code)) return 1100;
  if (farSouth.includes(code)) return 900;
  if ([1, 8, 32, 45].includes(code)) return 800;
  return 500;
}

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL,
      name_fr TEXT DEFAULT '',
      price INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS wilayas (
      code INTEGER PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_fr TEXT DEFAULT '',
      delivery_fee INTEGER NOT NULL DEFAULT 500
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      customer_name TEXT,
      wilaya TEXT,
      wilaya_code INTEGER,
      commune TEXT,
      product_id INTEGER,
      product_name TEXT,
      quantity INTEGER DEFAULT 1,
      unit_price INTEGER DEFAULT 0,
      delivery_fee INTEGER DEFAULT 0,
      total INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','confirming','confirmed','cancelled')),
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS conversations (
      phone TEXT PRIMARY KEY,
      stage TEXT NOT NULL DEFAULT 'name',
      data TEXT NOT NULL DEFAULT '{}',
      lang TEXT DEFAULT 'ar',
      order_id INTEGER,
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT,
      direction TEXT CHECK(direction IN ('in','out')),
      body TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone);
  `);

  const countW = db.prepare('SELECT COUNT(*) c FROM wilayas').get().c;
  if (countW === 0) {
    const ins = db.prepare('INSERT INTO wilayas (code, name_ar, name_fr, delivery_fee) VALUES (?,?,?,?)');
    const tx = db.transaction(() => {
      for (const [code, ar, fr] of WILAYAS) ins.run(code, ar, fr, defaultFee(code));
    });
    tx();
  }

  const countP = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  if (countP === 0) {
    const ins = db.prepare('INSERT INTO products (name_ar, name_fr, price) VALUES (?,?,?)');
    ins.run('سيروم فيتامين C', 'Sérum Vitamine C', 2500);
    ins.run('كريم مرطب بالصبار', 'Crème hydratante à l\u0027aloe vera', 1800);
    ins.run('مكمل غذائي للطاقة', 'Complément énergie', 3500);
  }
}

// ---------- Orders ----------
const orderQueries = {
  create: db.prepare(`INSERT INTO orders (phone, customer_name, status) VALUES (?,?,'new')`),
  get: db.prepare('SELECT * FROM orders WHERE id = ?'),
  byPhone: db.prepare(`SELECT * FROM orders WHERE phone = ? AND status IN ('new','confirming') ORDER BY id DESC LIMIT 1`),
  list: db.prepare('SELECT * FROM orders WHERE (? IS NULL OR status = ?) ORDER BY id DESC LIMIT 300'),
  setStatus: db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`),
  updateInfo: db.prepare(`UPDATE orders SET customer_name=?, wilaya=?, wilaya_code=?, commune=?,
      product_id=?, product_name=?, quantity=?, unit_price=?, delivery_fee=?, total=?,
      status=?, updated_at = datetime('now') WHERE id = ?`),
  remove: db.prepare('DELETE FROM orders WHERE id = ?'),
  stats: db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM orders WHERE date(created_at) = date('now')) AS today,
      (SELECT COUNT(*) FROM orders WHERE status = 'confirmed') AS confirmed,
      (SELECT COALESCE(SUM(total),0) FROM orders WHERE status = 'confirmed') AS revenue
  `),
};

// ---------- Conversations ----------
const convQueries = {
  get: db.prepare('SELECT * FROM conversations WHERE phone = ?'),
  upsert: db.prepare(`INSERT INTO conversations (phone, stage, data, lang, order_id, updated_at)
      VALUES (?,?,?,?,?, datetime('now'))
      ON CONFLICT(phone) DO UPDATE SET stage=excluded.stage, data=excluded.data,
      lang=excluded.lang, order_id=excluded.order_id, updated_at=excluded.updated_at`),
  remove: db.prepare('DELETE FROM conversations WHERE phone = ?'),
};

// ---------- Messages log ----------
const msgQueries = {
  log: db.prepare('INSERT INTO messages (phone, direction, body) VALUES (?,?,?)'),
  list: db.prepare('SELECT * FROM messages WHERE phone = ? ORDER BY id DESC LIMIT 50'),
};

// ---------- Products / Wilayas ----------
const catalogQueries = {
  products: db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY id'),
  productsAll: db.prepare('SELECT * FROM products ORDER BY id'),
  addProduct: db.prepare('INSERT INTO products (name_ar, name_fr, price) VALUES (?,?,?)'),
  updateProduct: db.prepare('UPDATE products SET name_ar=?, name_fr=?, price=?, active=? WHERE id=?'),
  removeProduct: db.prepare('DELETE FROM products WHERE id=?'),
  wilayas: db.prepare('SELECT * FROM wilayas ORDER BY code'),
  setFee: db.prepare('UPDATE wilayas SET delivery_fee = ? WHERE code = ?'),
  findWilaya: db.prepare('SELECT * FROM wilayas WHERE code = ?'),
};

module.exports = {
  db, initDb,
  orderQueries, convQueries, msgQueries, catalogQueries,
};
