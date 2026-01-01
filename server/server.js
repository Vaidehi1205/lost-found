require("dotenv").config({ path: "../server/.env" });

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const app = express();

/* -------------------- MIDDLEWARE -------------------- */
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

/* -------------------- DATABASE -------------------- */
if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => {
    console.error("❌ Mongo Error", err);
    process.exit(1);
  });

/* -------------------- MODELS -------------------- */
const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      fname: String,
      email: { type: String, unique: true },
      mobile_no: String,
      pass: String
    },
    { timestamps: true }
  )
);

const LostItem = mongoose.model(
  "LostItem",
  new mongoose.Schema(
    {
      owner_name: String,
      item_name: String,
      image: String,
      location: String,
      date_lost: Date,
      contact_no: String
    },
    { timestamps: true }
  )
);

const FoundItem = mongoose.model(
  "FoundItem",
  new mongoose.Schema(
    {
      finder_name: String,
      item_name: String,
      image: String,
      location: String,
      date_found: Date,
      contact_no: String
    },
    { timestamps: true }
  )
);

const Verification = mongoose.model(
  "Verification",
  new mongoose.Schema(
    {
      item_id: mongoose.Schema.Types.ObjectId,
      item_name: String,
      username: String,
      description: String,
      invoice_file: String,
      status: { type: String, default: "pending" }
    },
    { timestamps: true }
  )
);

const Notification = mongoose.model(
  "Notification",
  new mongoose.Schema(
    {
      user_email: String,
      type: String,
      message: String,
      is_read: { type: Boolean, default: false }
    },
    { timestamps: true }
  )
);

/* -------------------- FILE UPLOAD -------------------- */
const uploadPath = path.join(__dirname, "public/uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadPath,
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }
});

/* -------------------- AUTH (OPTIONAL / SIMPLE) -------------------- */
app.post("/register", async (req, res) => {
  try {
    const { fullname, email, phone, password } = req.body;

    if (!fullname || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hash = await bcrypt.hash(password, 10);

    await User.create({
      fname: fullname,
      email,
      mobile_no: phone,
      pass: hash
    });

    res.status(201).json({ message: "Registration successful" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});


app.post("/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });
  if (!user || !(await bcrypt.compare(req.body.password, user.pass)))
    return res.status(401).json({ message: "Invalid credentials" });

  res.json({ message: "Login successful", user });
});
/* -------------------- Users----------------- */
// Fetch all registered users
app.get("/api/user-details", async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch users" });
  }
});


/* -------------------- LOST ITEMS -------------------- */
app.post("/api/lost-items", upload.single("itemImage"), async (req, res) => {
  try {
    const image = req.file ? "/uploads/" + req.file.filename : null;
    await LostItem.create({ ...req.body, image });
    res.json({ message: "Lost item added" });
  } catch {
    res.status(500).json({ message: "Failed to add lost item" });
  }
});

app.get("/api/lost-items", async (_, res) => {
  res.json(await LostItem.find().sort({ createdAt: -1 }));
});

app.get("/api/lost-count", async (_, res) => {
  res.json({ count: await LostItem.countDocuments() });
});

/* -------------------- FOUND ITEMS -------------------- */
app.post("/api/found-items", upload.single("itemImage"), async (req, res) => {
  try {
    const image = req.file ? "/uploads/" + req.file.filename : null;
    await FoundItem.create({ ...req.body, image });
    res.json({ message: "Found item added" });
  } catch {
    res.status(500).json({ message: "Failed to add found item" });
  }
});

app.get("/api/found-items", async (_, res) => {
  res.json(await FoundItem.find().sort({ createdAt: -1 }));
});

app.get("/api/found-count", async (_, res) => {
  res.json({ count: await FoundItem.countDocuments() });
});

/* -------------------- VERIFICATION -------------------- */
app.post("/api/verification-request", upload.single("invoice"), async (req, res) => {
  try {
    const file = req.file ? "/uploads/" + req.file.filename : null;
    await Verification.create({ ...req.body, invoice_file: file });
    res.json({ message: "Verification submitted" });
  } catch {
    res.status(500).json({ message: "Verification failed" });
  }
});

app.get("/api/verification", async (_, res) => {
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

/* -------------------- NOTIFICATIONS -------------------- */
app.get("/api/notifications/:email", async (req, res) => {
  res.json(
    await Notification.find({ user_email: req.params.email }).sort({
      createdAt: -1
    })
  );
});

app.post("/api/notifications", async (req, res) => {
  await Notification.create(req.body);
  res.json({ message: "Notification created" });
});

/* -------------------- ANALYTICS -------------------- */
app.get("/api/analytics", async (req, res) => {
  const { month, year } = req.query;
  if (!month || !year)
    return res.status(400).json({ message: "Month & year required" });

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  res.json({
    lost: await LostItem.countDocuments({ date_lost: { $gte: start, $lt: end } }),
    found: await FoundItem.countDocuments({
      date_found: { $gte: start, $lt: end }
    }),
    accepted: await Verification.countDocuments({ status: "accepted" }),
    rejected: await Verification.countDocuments({ status: "rejected" })
  });
});

/* -------------------- SERVER -------------------- */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
