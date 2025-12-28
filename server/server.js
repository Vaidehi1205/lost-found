require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const bodyParser = require("body-parser");
const { jsPDF } = require("jspdf");

const app = express();

// ---------------- Middleware ----------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json({ limit: "10mb" }));

// ---------------- MongoDB Atlas ----------------
const MONGO_URI = process.env.MONGO_URI || 
"mongodb+srv://user_name:user_passwordloq@cluster0.ire5o4d.mongodb.net/?appName=Cluster0";

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Atlas Connected"))
  .catch(err => console.error("❌ MongoDB Error:", err));

// ---------------- Models ----------------
const User = mongoose.model("User", new mongoose.Schema({
  fname: String,
  email: { type: String, unique: true },
  mobile_no: String,
  pass: String
}, { timestamps: true }));

const LostItem = mongoose.model("LostItem", new mongoose.Schema({
  owner_name: String,
  item_name: String,
  image: String,
  location: String,
  date_lost: Date,
  contact_no: String
}, { timestamps: true }));

const FoundItem = mongoose.model("FoundItem", new mongoose.Schema({
  finder_name: String,
  item_name: String,
  image: String,
  location: String,
  date_found: Date,
  contact_no: String
}, { timestamps: true }));

const Verification = mongoose.model("Verification", new mongoose.Schema({
  item_id: mongoose.Schema.Types.ObjectId,
  item_name: String,
  username: String,
  description: String,
  invoice_file: String,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Notification = mongoose.model("Notification", new mongoose.Schema({
  user_email: String,
  type: String,
  message: String,
  is_read: { type: Boolean, default: false }
}, { timestamps: true }));

// ---------------- Upload Setup ----------------
const uploadPath = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({ storage });

// ---------------- AUTH ----------------
app.post("/register", async (req, res) => {
  const { fullname, email, phone, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  await User.create({ fname: fullname, email, mobile_no: phone, pass: hash });
  res.json({ message: "Registration successful" });
});

app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.pass)))
    return res.status(401).json({ message: "Invalid credentials" });
  res.json({ message: "Login successful", user });
});

// ---------------- Lost Items ----------------
app.post("/api/lost-items", upload.single("itemImage"), async (req, res) => {
  const image = req.file ? "/uploads/" + req.file.filename : null;
  await LostItem.create({ ...req.body, image });
  res.json({ message: "Lost item added" });
});

app.get("/api/lost-items", async (req, res) => {
  res.json(await LostItem.find().sort({ date_lost: -1 }));
});

app.get("/api/lost-count", async (req, res) => {
  res.json({ count: await LostItem.countDocuments() });
});

// ---------------- Found Items ----------------
app.post("/api/found-items", upload.single("itemImage"), async (req, res) => {
  const image = req.file ? "/uploads/" + req.file.filename : null;
  await FoundItem.create({ ...req.body, image });
  res.json({ message: "Found item added" });
});

app.get("/api/found-items", async (req, res) => {
  res.json(await FoundItem.find().sort({ date_found: -1 }));
});

app.get("/api/found-count", async (req, res) => {
  res.json({ count: await FoundItem.countDocuments() });
});

// ---------------- Verification ----------------
app.post("/api/verification-request", upload.single("invoice"), async (req, res) => {
  const file = req.file ? "/uploads/" + req.file.filename : null;
  await Verification.create({ ...req.body, invoice_file: file });
  res.json({ message: "Verification submitted" });
});

app.get("/api/verification", async (req, res) => {
  res.json(await Verification.find().sort({ createdAt: -1 }));
});

app.post("/api/verification/:id/accept", async (req, res) => {
  await Verification.findByIdAndUpdate(req.params.id, { status: "accepted" });
  res.json({ message: "Accepted" });
});

app.post("/api/verification/:id/reject", async (req, res) => {
  await Verification.findByIdAndUpdate(req.params.id, { status: "rejected" });
  res.json({ message: "Rejected" });
});

// ---------------- Notifications ----------------
app.get("/api/notifications/:email", async (req, res) => {
  res.json(await Notification.find({ user_email: req.params.email }).sort({ createdAt: -1 }));
});

app.post("/api/notifications/:id/read", async (req, res) => {
  await Notification.findByIdAndUpdate(req.params.id, { is_read: true });
  res.json({ message: "Marked as read" });
});

// ---------------- Analytics ----------------
app.get("/api/analytics", async (req, res) => {
  const { month, year } = req.query;
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  res.json({
    lost: await LostItem.countDocuments({ date_lost: { $gte: start, $lt: end } }),
    found: await FoundItem.countDocuments({ date_found: { $gte: start, $lt: end } }),
    accepted: await Verification.countDocuments({ status: "accepted" }),
    rejected: await Verification.countDocuments({ status: "rejected" })
  });
});

// ---------------- Server ----------------
app.listen(3000, () => console.log("🚀 Server running on http://localhost:3000"));
