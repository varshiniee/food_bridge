require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { User, Partner, Food, MealRequest, Review, Contact } = require('./models');

const app = express();
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_ORIGIN }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

/* ---------- helpers ---------- */
const sign = (u) => jwt.sign({ id: u._id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

const auth = (roles = []) => (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    if (roles.length && !roles.includes(p.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = p; next();
  } catch { res.status(401).json({ error: 'Please log in' }); }
};

// Document uploads: pdf/jpg/png only, 5 MB, random file names
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, 'uploads'),
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, ['application/pdf', 'image/jpeg', 'image/png'].includes(file.mimetype)),
});

/* ---------- auth ---------- */
app.post('/api/auth/register', authLimiter, wrap(async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password || password.length < 6) return res.status(400).json({ error: 'Invalid details' });
  if (await User.findOne({ email: email.toLowerCase() })) return res.status(409).json({ error: 'Email already registered' });
  const safeRole = ['Receiver', 'Restaurant', 'NGO'].includes(role) ? role : 'Receiver'; // never allow Admin signup
  const u = await User.create({ name, email, role: safeRole, password: await bcrypt.hash(password, 12) });
  res.status(201).json({ token: sign(u), user: { id: u._id, name: u.name, role: u.role } });
}));

app.post('/api/auth/login', authLimiter, wrap(async (req, res) => {
  const u = await User.findOne({ email: String(req.body.email || '').toLowerCase() });
  if (!u || !(await bcrypt.compare(String(req.body.password || ''), u.password))) return res.status(401).json({ error: 'Invalid email or password' });
  res.json({ token: sign(u), user: { id: u._id, name: u.name, role: u.role } });
}));

/* ---------- food listings ---------- */
app.get('/api/foods', wrap(async (req, res) => {
  const { q, category } = req.query;
  const filter = { status: { $in: ['Available', 'Limited'] }, pickupDeadline: { $gt: new Date() } };
  if (category && category !== 'All') filter.category = String(category);
  if (q) { const rx = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'); filter.$or = [{ name: rx }, { restaurantName: rx }, { location: rx }]; }
  res.json(await Food.find(filter).sort('-createdAt').limit(100));
}));

app.post('/api/foods', auth(['Restaurant']), wrap(async (req, res) => {
  const me = await User.findById(req.user.id);
  if (!me.verified) return res.status(403).json({ error: 'Your restaurant is not verified yet' });
  const { name, quantity, location, preparedAt, pickupDeadline, category, imageUrl } = req.body;
  res.status(201).json(await Food.create({ restaurant: me._id, restaurantName: me.name, name, quantity, location, preparedAt, pickupDeadline, category, imageUrl }));
}));

/* ---------- meal requests & approvals ---------- */
app.post('/api/requests', auth(['Receiver', 'NGO']), wrap(async (req, res) => {
  const food = await Food.findById(req.body.foodId);
  if (!food || food.status === 'Claimed') return res.status(404).json({ error: 'Food not available' });
  res.status(201).json(await MealRequest.create({ food: food._id, requester: req.user.id }));
}));

app.get('/api/requests/mine', auth(), wrap(async (req, res) => {
  res.json(await MealRequest.find({ requester: req.user.id }).populate('food'));
}));

app.get('/api/requests/incoming', auth(['Restaurant']), wrap(async (req, res) => {
  const foods = await Food.find({ restaurant: req.user.id }).select('_id');
  res.json(await MealRequest.find({ food: { $in: foods } }).populate('food requester', 'name role email'));
}));

app.patch('/api/requests/:id', auth(['Restaurant']), wrap(async (req, res) => {
  const r = await MealRequest.findById(req.params.id).populate('food');
  if (!r || String(r.food.restaurant) !== req.user.id) return res.status(404).json({ error: 'Not found' });
  if (!['Approved', 'Rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Bad status' });
  r.status = req.body.status; await r.save();
  if (r.status === 'Approved') { r.food.status = 'Claimed'; await r.food.save(); }
  res.json(r);
}));

/* ---------- partner registration ---------- */
app.post('/api/partners', upload.single('document'), wrap(async (req, res) => {
  const { name, owner, email, phone, address, fssai } = req.body;
  if (!req.file) return res.status(400).json({ error: 'Verification document (pdf/jpg/png, max 5 MB) required' });
  res.status(201).json(await Partner.create({ name, owner, email, phone, address, fssai, documentPath: req.file.filename }));
}));

/* ---------- reviews & contact ---------- */
app.get('/api/reviews', wrap(async (req, res) => res.json(await Review.find().sort('-createdAt').limit(50))));
app.post('/api/reviews', wrap(async (req, res) => {
  const { name, rating, text } = req.body;
  res.status(201).json(await Review.create({ name, rating: Number(rating), text }));
}));
app.post('/api/contact', wrap(async (req, res) => {
  const { name, email, phone, subject, message } = req.body;
  await Contact.create({ name, email, phone, subject, message });
  res.status(201).json({ ok: true });
}));

/* ---------- admin: verify restaurants & NGOs ---------- */
app.get('/api/admin/partners', auth(['Admin']), wrap(async (req, res) => res.json(await Partner.find().sort('-createdAt'))));
app.patch('/api/admin/partners/:id', auth(['Admin']), wrap(async (req, res) => {
  if (!['Approved', 'Rejected'].includes(req.body.status)) return res.status(400).json({ error: 'Bad status' });
  const p = await Partner.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (p && p.user && req.body.status === 'Approved') await User.findByIdAndUpdate(p.user, { verified: true });
  res.json(p);
}));
app.patch('/api/admin/users/:id/verify', auth(['Admin']), wrap(async (req, res) => {
  res.json(await User.findByIdAndUpdate(req.params.id, { verified: true }, { new: true }).select('-password'));
}));
app.get('/api/admin/stats', auth(['Admin']), wrap(async (req, res) => {
  const [users, foods, requests, partners] = await Promise.all([User.countDocuments(), Food.countDocuments(), MealRequest.countDocuments(), Partner.countDocuments()]);
  res.json({ users, foods, requests, partners });
}));

/* ---------- errors & start ---------- */
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Something went wrong' }); });

mongoose.connect(process.env.MONGO_URI)
  .then(() => app.listen(process.env.PORT || 5000, () => console.log('Food Bridge API running')))
  .catch((e) => { console.error('MongoDB connection failed', e.message); process.exit(1); });
