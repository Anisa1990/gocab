const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

const DATA_FILE = path.join(__dirname, 'data.json');

// ===== Загрузка / сохранение данных =====
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Ошибка загрузки данных:', e);
  }
  return { clients: [], fleet: [], payments: [], credits: [], nextId: { client: 1, fleet: 1, payment: 1, credit: 1 } };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let db = loadData();

function getNextId(type) {
  const id = db.nextId[type] || 1;
  db.nextId[type] = id + 1;
  saveData(db);
  return id;
}

// ===== API =====

// Клиенты
app.get('/api/clients', (req, res) => res.json(db.clients));
app.post('/api/clients', (req, res) => {
  const { name, phone, type, tg } = req.body;
  if (!name || !phone) return res.status(400).json({ error: 'Имя и телефон обязательны' });
  const client = { id: getNextId('client'), name: name.trim(), phone: phone.trim(), type: type || 'buyer', tg: tg ? tg.trim() : '', createdAt: new Date().toISOString() };
  db.clients.push(client);
  saveData(db);
  res.status(201).json(client);
});
app.put('/api/clients/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const client = db.clients.find(c => c.id === id);
  if (!client) return res.status(404).json({ error: 'Клиент не найден' });
  const { name, phone, type, tg } = req.body;
  if (name) client.name = name.trim();
  if (phone) client.phone = phone.trim();
  if (type) client.type = type;
  if (tg !== undefined) client.tg = tg.trim();
  saveData(db);
  res.json(client);
});
app.delete('/api/clients/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.clients = db.clients.filter(c => c.id !== id);
  db.payments = db.payments.filter(p => p.clientId !== id);
  db.credits = db.credits.filter(c => c.clientId !== id);
  saveData(db);
  res.json({ success: true });
});

// Автопарк
app.get('/api/fleet', (req, res) => res.json(db.fleet));
app.post('/api/fleet', (req, res) => {
  const { model, plate, purchasePrice, purchaseDate } = req.body;
  if (!model || !plate || purchasePrice === undefined) return res.status(400).json({ error: 'Модель, номер и цена обязательны' });
  const car = { id: getNextId('fleet'), model: model.trim(), plate: plate.trim(), purchasePrice: parseFloat(purchasePrice) || 0, purchaseDate: purchaseDate || new Date().toISOString().slice(0,10), sold: false, salePrice: 0, saleDate: null };
  db.fleet.push(car);
  saveData(db);
  res.status(201).json(car);
});
app.put('/api/fleet/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const car = db.fleet.find(c => c.id === id);
  if (!car) return res.status(404).json({ error: 'Машина не найдена' });
  const { model, plate, purchasePrice, purchaseDate, sold, salePrice, saleDate } = req.body;
  if (model) car.model = model.trim();
  if (plate) car.plate = plate.trim();
  if (purchasePrice !== undefined) car.purchasePrice = parseFloat(purchasePrice) || 0;
  if (purchaseDate) car.purchaseDate = purchaseDate;
  if (sold !== undefined) car.sold = sold;
  if (salePrice !== undefined) car.salePrice = parseFloat(salePrice) || 0;
  if (saleDate) car.saleDate = saleDate;
  saveData(db);
  res.json(car);
});
app.delete('/api/fleet/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.fleet = db.fleet.filter(c => c.id !== id);
  saveData(db);
  res.json({ success: true });
});

// Платежи
app.get('/api/payments', (req, res) => res.json(db.payments));
app.post('/api/payments', (req, res) => {
  const { creditId, clientId, amount, type, description, date, scheduleItemDate } = req.body;
  if (!creditId || amount === undefined) return res.status(400).json({ error: 'creditId и amount обязательны' });
  const credit = db.credits.find(c => c.id === parseInt(creditId));
  if (!credit) return res.status(404).json({ error: 'Кредит не найден' });
  const payment = {
    id: getNextId('payment'),
    creditId: parseInt(creditId),
    clientId: clientId || credit.clientId,
    amount: parseFloat(amount) || 0,
    type: type || 'cash',
    description: description ? description.trim() : `Платёж по договору #${creditId}`,
    date: date || new Date().toISOString().slice(0,10),
    scheduleItemDate: scheduleItemDate || null
  };
  db.payments.push(payment);
  saveData(db);
  res.status(201).json(payment);
});
app.delete('/api/payments/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.payments = db.payments.filter(p => p.id !== id);
  saveData(db);
  res.json({ success: true });
});

// Кредиты
app.get('/api/credits', (req, res) => res.json(db.credits));
app.post('/api/credits', (req, res) => {
  const { clientId, carId, amount, term, monthly, schedule } = req.body;
  if (!clientId || !carId || !amount || !term) return res.status(400).json({ error: 'clientId, carId, amount, term обязательны' });
  const credit = {
    id: getNextId('credit'),
    clientId: parseInt(clientId),
    carId: parseInt(carId),
    amount: parseFloat(amount) || 0,
    term: parseInt(term) || 0,
    monthly: parseFloat(monthly) || Math.round(amount / term),
    paid: 0,
    status: 'active',
    schedule: schedule || [],
    createdAt: new Date().toISOString()
  };
  db.credits.push(credit);
  saveData(db);
  res.status(201).json(credit);
});
app.put('/api/credits/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const credit = db.credits.find(c => c.id === id);
  if (!credit) return res.status(404).json({ error: 'Кредит не найден' });
  const { paid, status, schedule } = req.body;
  if (paid !== undefined) credit.paid = parseFloat(paid) || 0;
  if (status) credit.status = status;
  if (schedule) credit.schedule = schedule;
  saveData(db);
  res.json(credit);
});
app.delete('/api/credits/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.credits = db.credits.filter(c => c.id !== id);
  db.payments = db.payments.filter(p => p.creditId !== id);
  saveData(db);
  res.json({ success: true });
});

// Статика
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные хранятся в ${DATA_FILE}`);
});
