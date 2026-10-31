const mongoose = require('mongoose');
const { Schema, model } = mongoose;

const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['Receiver', 'Restaurant', 'NGO', 'Admin'], default: 'Receiver' },
  verified: { type: Boolean, default: false },
}, { timestamps: true }));

const Partner = model('Partner', new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  name: String, owner: String, email: String, phone: String, address: String,
  fssai: String, documentPath: String,
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
}, { timestamps: true }));

const Food = model('Food', new Schema({
  restaurant: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  restaurantName: String,
  quantity: String,
  location: String,
  preparedAt: Date,
  pickupDeadline: Date,
  category: { type: String, enum: ['Meals', 'Rice', 'Snacks', 'Breakfast', 'Fruits', 'Other'], default: 'Meals' },
  imageUrl: String,
  status: { type: String, enum: ['Available', 'Limited', 'Claimed', 'Expired'], default: 'Available' },
}, { timestamps: true }));

const MealRequest = model('MealRequest', new Schema({
  food: { type: Schema.Types.ObjectId, ref: 'Food', required: true },
  requester: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
}, { timestamps: true }));

const Review = model('Review', new Schema({
  name: String,
  rating: { type: Number, min: 1, max: 5, required: true },
  text: { type: String, required: true, maxlength: 1000 },
}, { timestamps: true }));

const Contact = model('Contact', new Schema({
  name: String, email: String, phone: String, subject: String, message: String,
}, { timestamps: true }));

module.exports = { User, Partner, Food, MealRequest, Review, Contact };
