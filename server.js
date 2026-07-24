const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Путь к файлу данных
const DATA_FILE = path.join(__dirname, 'data.json');

// ===== Инициализация данных =====
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Ошибка загрузки данных:', e);
  }
  // Если файла нет или ошибка, создаём дефолтные данные
  return {
    clients: [],
    fleet: [],
    payments: [],
    credits: [],
    nextId: { client: 1, fleet: 1, payment: 1, credit: 1 }
  };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Загружаем данные в память
let db = loadData();

// ===== Вспомогательная функция для получения следующего ID =====
function getNextId(type) {
  const id = db.nextId[type] || 1;
  db.nextId[type] = id + 1;
  saveData(db);
  return id;
}

// ===== API РОУТЫ =====

// --- Клиенты ---
app.get('/api/clients', (req, res) => {
  res.json(db.clients);
});

app.post('/api/clients', (req, res) => {
  const { name, phone, type, tg } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Имя и телефон обязательны' });
  }
  const newClient = {
    id: getNextId('client'),
    name: name.trim(),
    phone: phone.trim(),
    type: type || 'buyer',
    tg: tg ? tg.trim() : '',
    createdAt: new Date().toISOString()
  };
  db.clients.push(newClient);
  saveData(db);
  res.status(201).json(newClient);
});

app.put('/api/clients/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { name, phone, type, tg } = req.body;
  const client = db.clients.find(c => c.id === id);
  if (!client) {
    return res.status(404).json({ error: 'Клиент не найден' });
  }
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
  // Также удаляем связанные платежи и кредиты
  db.payments = db.payments.filter(p => p.clientId !== id);
  db.credits = db.credits.filter(c => c.clientId !== id);
  saveData(db);
  res.json({ success: true });
});

// --- Машины ---
app.get('/api/fleet', (req, res) => {
  res.json(db.fleet);
});

app.post('/api/fleet', (req, res) => {
  const { model, plate, purchasePrice, purchaseDate } = req.body;
  if (!model || !plate || purchasePrice === undefined) {
    return res.status(400).json({ error: 'Модель, номер и цена обязательны' });
  }
  const newCar = {
    id: getNextId('fleet'),
    model: model.trim(),
    plate: plate.trim(),
    purchasePrice: parseFloat(purchasePrice) || 0,
    purchaseDate: purchaseDate || new Date().toISOString().slice(0,10),
    sold: false,
    salePrice: 0,
    saleDate: null
  };
  db.fleet.push(newCar);
  saveData(db);
  res.status(201).json(newCar);
});

app.put('/api/fleet/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const car = db.fleet.find(c => c.id === id);
  if (!car) {
    return res.status(404).json({ error: 'Машина не найдена' });
  }
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

// --- Платежи ---
app.get('/api/payments', (req, res) => {
  res.json(db.payments);
});

app.post('/api/payments', (req, res) => {
  const { creditId, amount, type, description, date, clientId } = req.body;
  if (!creditId || amount === undefined) {
    return res.status(400).json({ error: 'creditId и amount обязательны' });
  }
  // Найдём кредит, чтобы взять clientId, если не передан
  const credit = db.credits.find(c => c.id === parseInt(creditId));
  if (!credit) {
    return res.status(404).json({ error: 'Кредит не найден' });
  }
  const newPayment = {
    id: getNextId('payment'),
    creditId: parseInt(creditId),
    clientId: clientId || credit.clientId,
    amount: parseFloat(amount) || 0,
    type: type || 'cash',
    description: description ? description.trim() : `Платёж по договору #${creditId}`,
    date: date || new Date().toISOString().slice(0,10),
    scheduleItemDate: null // будет заполнено на клиенте
  };
  db.payments.push(newPayment);
  saveData(db);
  res.status(201).json(newPayment);
});

app.delete('/api/payments/:id', (req, res) => {
  const id = parseInt(req.params.id);
  db.payments = db.payments.filter(p => p.id !== id);
  saveData(db);
  res.json({ success: true });
});

// --- Кредиты ---
app.get('/api/credits', (req, res) => {
  res.json(db.credits);
});

app.post('/api/credits', (req, res) => {
  const { clientId, carId, amount, term, monthly, schedule } = req.body;
  if (!clientId || !carId || !amount || !term) {
    return res.status(400).json({ error: 'clientId, carId, amount, term обязательны' });
  }
  const newCredit = {
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
  db.credits.push(newCredit);
  saveData(db);
  res.status(201).json(newCredit);
});

app.put('/api/credits/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const credit = db.credits.find(c => c.id === id);
  if (!credit) {
    return res.status(404).json({ error: 'Кредит не найден' });
  }
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

// ===== Отдача статики =====
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных запросов отдаём index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== Запуск сервера =====
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📁 Данные хранятся в ${DATA_FILE}`);
});
