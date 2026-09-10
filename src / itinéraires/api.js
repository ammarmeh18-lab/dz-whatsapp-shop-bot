// src/routes/api.js — REST API for the dashboard
const express = require('express');
const { orderQueries, catalogQueries, msgQueries } = require('../db');

const router = express.Router();

router.get('/stats', (req, res) => {
  res.json(orderQueries.stats.get());
});

router.get('/orders', (req, res) => {
  const status = req.query.status && req.query.status !== 'all' ? req.query.status : null;
  res.json(orderQueries.list.all(status, status));
});

router.patch('/orders/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['new', 'confirming', 'confirmed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  orderQueries.setStatus.run(status, req.params.id);
  res.json(orderQueries.get.get(req.params.id));
});

router.delete('/orders/:id', (req, res) => {
  orderQueries.remove.run(req.params.id);
  res.json({ ok: true });
});

router.get('/products', (req, res) => res.json(catalogQueries.productsAll.all()));

router.post('/products', (req, res) => {
  const { name_ar, name_fr, price } = req.body || {};
  if (!name_ar || !(price > 0)) return res.status(400).json({ error: 'name_ar and price required' });
  const r = catalogQueries.addProduct.run(name_ar, name_fr || '', Math.round(price));
  res.json(catalogQueries.productsAll.all().find(p => p.id === r.lastInsertRowid));
});

router.put('/products/:id', (req, res) => {
  const { name_ar, name_fr, price, active } = req.body || {};
  catalogQueries.updateProduct.run(name_ar, name_fr || '', Math.round(price || 0), active ? 1 : 0, req.params.id);
  res.json(catalogQueries.productsAll.all().find(p => p.id === Number(req.params.id)));
});

router.delete('/products/:id', (req, res) => {
  catalogQueries.removeProduct.run(req.params.id);
  res.json({ ok: true });
});

router.get('/wilayas', (req, res) => res.json(catalogQueries.wilayas.all()));

router.put('/wilayas/:code/fee', (req, res) => {
  const fee = Math.round(Number((req.body || {}).fee));
  if (isNaN(fee) || fee < 0) return res.status(400).json({ error: 'Invalid fee' });
  catalogQueries.setFee.run(fee, req.params.code);
  res.json(catalogQueries.findWilaya.get(req.params.code));
});

// Conversation history with a customer (for support review)
router.get('/conversations/:phone', (req, res) => {
  res.json(msgQueries.list.all(req.params.phone).reverse());
});

module.exports = router;
