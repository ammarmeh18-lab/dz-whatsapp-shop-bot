/* public/app.js — Dashboard logic */
const $ = (s) => document.querySelector(s);
const api = (url, opts) => fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts }).then(r => r.json());

const STATUS_LABELS = { new: 'جديد', confirming: 'قيد التأكيد', confirmed: 'مؤكد', cancelled: 'ملغى' };
let currentStatus = 'all';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2200);
}

/* ---------- Views ---------- */
document.querySelectorAll('.tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    $(`#view-${btn.dataset.view}`).classList.remove('hidden');
    if (btn.dataset.view === 'products') loadProducts();
    if (btn.dataset.view === 'wilayas') loadWilayas();
  });
});

/* ---------- Stats ---------- */
async function loadStats() {
  const s = await api('/api/stats');
  $('#st-today').textContent = s.today;
  $('#st-confirmed').textContent = s.confirmed;
  $('#st-revenue').textContent = Number(s.revenue).toLocaleString('fr-DZ');
}

/* ---------- Orders ---------- */
document.querySelectorAll('#status-filters .chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('#status-filters .chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    currentStatus = chip.dataset.status;
    loadOrders();
  });
});

async function loadOrders() {
  const orders = await api('/api/orders?status=' + currentStatus);
  const tbody = $('#orders-body');
  tbody.innerHTML = '';
  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:#6b7280;padding:24px">لا توجد طلبات 🎈</td></tr>';
    return;
  }
  for (const o of orders) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${o.id}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td dir="ltr">${esc(o.phone)}</td>
      <td>${esc(o.wilaya || '—')}</td>
      <td>${esc(o.commune || '—')}</td>
      <td>${esc(o.product_name || '—')}</td>
      <td>${o.quantity || '—'}</td>
      <td>${o.delivery_fee ? Number(o.delivery_fee).toLocaleString('fr-DZ') : '—'}</td>
      <td><strong>${o.total ? Number(o.total).toLocaleString('fr-DZ') : '—'}</strong></td>
      <td><span class="badge ${o.status}">${STATUS_LABELS[o.status]}</span></td>
      <td style="font-size:.78rem;color:#6b7280">${o.created_at}</td>
      <td>
        <select class="status-select" data-id="${o.id}">
          ${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === o.status ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </td>`;
    tr.querySelector('.status-select').addEventListener('change', async (e) => {
      await api('/api/orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
      toast('تم تحديث الحالة ✔');
      loadOrders(); loadStats();
    });
    tbody.appendChild(tr);
  }
}

/* ---------- Products ---------- */
async function loadProducts() {
  const products = await api('/api/products');
  const tbody = $('#products-body');
  tbody.innerHTML = '';
  for (const p of products) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>#${p.id}</td>
      <td><input class="cell-input" value="${esc(p.name_ar)}" data-f="name_ar"></td>
      <td><input class="cell-input" value="${esc(p.name_fr || '')}" data-f="name_fr"></td>
      <td><input class="cell-input" type="number" min="1" value="${p.price}" data-f="price" style="width:90px"></td>
      <td><input type="checkbox" ${p.active ? 'checked' : ''} data-f="active"></td>
      <td>
        <button class="btn-save">💾 حفظ</button>
        <button class="btn-del">🗑</button>
      </td>`;
    tr.querySelector('.btn-save').addEventListener('click', async () => {
      const body = {
        name_ar: tr.querySelector('[data-f=name_ar]').value.trim(),
        name_fr: tr.querySelector('[data-f=name_fr]').value.trim(),
        price: Number(tr.querySelector('[data-f=price]').value),
        active: tr.querySelector('[data-f=active]').checked ? 1 : 0,
      };
      await api('/api/products/' + p.id, { method: 'PUT', body: JSON.stringify(body) });
      toast('تم الحفظ ✔'); loadProducts();
    });
    tr.querySelector('.btn-del').addEventListener('click', async () => {
      if (!confirm('حذف المنتج "' + p.name_ar + '"؟')) return;
      await api('/api/products/' + p.id, { method: 'DELETE' });
      loadProducts();
    });
    tbody.appendChild(tr);
  }
}

$('#product-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await api('/api/products', {
    method: 'POST',
    body: JSON.stringify({
      name_ar: $('#p-name-ar').value.trim(),
      name_fr: $('#p-name-fr').value.trim(),
      price: Number($('#p-price').value),
    }),
  });
  e.target.reset();
  toast('تمت الإضافة ✔');
  loadProducts();
});

/* ---------- Wilayas ---------- */
async function loadWilayas() {
  const wilayas = await api('/api/wilayas');
  const tbody = $('#wilayas-body');
  tbody.innerHTML = '';
  for (const w of wilayas) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${w.code}</td>
      <td>${esc(w.name_ar)}</td>
      <td>${esc(w.name_fr)}</td>
      <td><input class="fee-input" type="number" min="0" value="${w.delivery_fee}"></td>
      <td><button class="btn-save">💾 حفظ</button></td>`;
    tr.querySelector('.btn-save').addEventListener('click', async () => {
      const fee = Number(tr.querySelector('.fee-input').value);
      await api(`/api/wilayas/${w.code}/fee`, { method: 'PUT', body: JSON.stringify({ fee }) });
      toast(`تم تحديث ${w.name_ar} ✔`);
    });
    tbody.appendChild(tr);
  }
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Init + auto refresh ---------- */
loadStats(); loadOrders();
setInterval(() => { loadStats(); loadOrders(); }, 15000);
