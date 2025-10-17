const express = require("express");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

require('dotenv').config({ path: __dirname + '/.env' });

console.log("TWILIO_FROM =", process.env.TWILIO_FROM);
console.log("TWILIO_ACCOUNT_SID =", process.env.TWILIO_ACCOUNT_SID);
console.log("TWILIO_AUTH_TOKEN =", process.env.TWILIO_AUTH_TOKEN);


const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// Ensure uploads folder exists
const uploadPath = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true });

// MySQL connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Vaidehi@12",
  database: "claimconnect",
});

db.connect((err) => {
  if (err) throw err;
  console.log("✅ MySQL Connected...");
});

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") cb(null, true);
  else cb(new Error("Only JPEG images are allowed!"), false);
};

const upload = multer({ storage, fileFilter });

// --------------------- REGISTER ---------------------
app.post("/register", async (req, res) => {
  try {
    const { fullname, email, phone, password } = req.body;

    if (!fullname || !email || !phone || !password)
      return res.status(400).json({ message: "All fields are required" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO register (fname, email, mobile_no, pass) VALUES (?, ?, ?, ?)";
    db.query(sql, [fullname, email, phone, hashedPassword], (err, result) => {
      if (err) {
        console.error("❌ DB Error:", err);
        return res.status(500).json({ message: "Database error" });
      }
      res.json({ message: "Registration successful!" });
    });
  } catch (error) {
    console.error("❌ Server Error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- LOGIN ---------------------
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

  const sql = "SELECT * FROM register WHERE email = ?";
  db.query(sql, [email], async (err, results) => {
    if (err) {
      console.error("❌ DB Error:", err);
      return res.status(500).json({ message: "Database error" });
    }

    if (results.length === 0) return res.status(401).json({ message: "Invalid email or password" });

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.pass);

    if (!isMatch) return res.status(401).json({ message: "Invalid email or password" });

    return res.status(200).json({
      message: "Login successful!",
      user: { id: user.RegId, name: user.fname, email: user.email, phone: user.mobile_no },
    });
  });
});


// --------------------- Reset Password ---------------------
app.post("/api/reset-password", async (req, res) => {
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({ message: "Email and password required" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const query = "UPDATE register SET pass = ? WHERE email = ?";
    db.query(query, [hashedPassword, email], (err, result) => {
      if(err) return res.status(500).json({ message: "Database error" });

      if(result.affectedRows === 0) {
        return res.status(404).json({ message: "Email not found" });
      }

      res.json({ message: "Password updated successfully" });
    });

  } catch(err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- TOTAL USERS ---------------------
app.get("/api/user-count", (req, res) => {
  const sql = "SELECT COUNT(*) AS total FROM register";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ count: result[0].total });
  });
});

// --------------------- FETCH USER DETAILS ---------------------
app.get("/api/user-details", (req, res) => {
  const sql = "SELECT * FROM register ORDER BY RegId DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    if (results.length === 0) return res.status(404).json({ message: "No users found" });
    res.json(results);
  });
});

// --------------------- LOST ITEMS ---------------------
app.post("/api/lost-items", upload.single("itemImage"), (req, res) => {
  const { NameofOwner, itemName, location, dateLost, contactNumber } = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : null;

  if (!NameofOwner || !itemName || !location || !dateLost || !contactNumber)
    return res.status(400).json({ message: "All fields are required" });

  const sql =
    "INSERT INTO lost_items (owner_name, item_name, image, location, date_lost, contact_no) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(sql, [NameofOwner, itemName, image, location, dateLost, contactNumber], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json({ message: "Lost item reported successfully!" });
  });
});

app.get("/api/lost-items", (req, res) => {
  const sql = "SELECT * FROM lost_items ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

app.get("/api/lost-count", (req, res) => {
  const sql = "SELECT COUNT(*) AS total FROM lost_items";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ count: result[0].total });
  });
});

// --------------------- FOUND ITEMS ---------------------
app.post("/api/found-items", upload.single("itemImage"), (req, res) => {
  const { finderName, itemName, foundLocation, foundDate, contactNo } = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : null;

  if (!finderName || !itemName || !foundLocation || !foundDate || !contactNo)
    return res.status(400).json({ message: "All fields are required" });

  const sql =
    "INSERT INTO found_items (finder_name, item_name, image, location, date_found, contact_no) VALUES (?, ?, ?, ?, ?, ?)";
  db.query(sql, [finderName, itemName, image, foundLocation, foundDate, contactNo], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json({ message: "Found item reported successfully!" });
  });
});

app.get("/api/found-items", (req, res) => {
  const sql = "SELECT * FROM found_items ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

app.get("/api/found-count", (req, res) => {
  const sql = "SELECT COUNT(*) AS total FROM found_items";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ count: result[0].total });
  });
});

app.get("/api/recent-items", (req, res) => {
  const sqlLost = "SELECT id, item_name, image, location, date_lost AS date, 'lost' AS type FROM lost_items ORDER BY date_lost DESC LIMIT 2";
  const sqlFound = "SELECT id, item_name, location, date_found AS date, 'found' AS type FROM found_items ORDER BY date_found DESC LIMIT 2"; // no image

  db.query(sqlLost, (err, lostItems) => {
    if (err) return res.status(500).json({ message: "Database error" });
    db.query(sqlFound, (err2, foundItems) => {
      if (err2) return res.status(500).json({ message: "Database error" });
      const combined = [...lostItems, ...foundItems].sort((a,b) => new Date(b.date) - new Date(a.date));
      res.json(combined);
    });
  });
});


// --------------------- VERIFICATION REQUEST ---------------------
app.post("/api/verification-request", (req, res) => {
  const { description, item_id, item_name, username } = req.body;
  if (!description || !item_id || !item_name || !username)
    return res.status(400).json({ message: "All fields are required" });

  const sql = "INSERT INTO verification_requests (item_id, item_name, username, description) VALUES (?, ?, ?, ?)";
  db.query(sql, [item_id, item_name, username, description], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json({ message: "Verification request submitted successfully!", requestId: result.insertId });
  });
});

app.get("/api/verification", (req, res) => {
  const sql = `
    SELECT 
      v.id AS verification_id,   -- Add this!
      f.id AS found_id, 
      f.item_name, f.finder_name, f.location,
      f.date_found, f.contact_no, f.image,
      v.username, v.description, v.request_date
    FROM found_items f
    RIGHT JOIN verification_requests v ON f.id = v.item_id
    ORDER BY v.id DESC
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});


// --------------------- Reject Verification ---------------------
app.post("/api/verification/:id/reject", (req, res) => {
  const requestId = req.params.id;

  db.query("SELECT username AS user_email, item_name FROM verification_requests WHERE id = ?", [requestId], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    if (!results || results.length === 0) return res.status(404).json({ message: "Verification request not found" });

    const { user_email, item_name } = results[0];
    const message = `❌ Your request to claim "${item_name}" has been rejected. Please review your information and try again.`;

    // Insert notification
    const insertSql = "INSERT INTO notifications (user_email, type, message) VALUES (?, 'reject', ?)";
    db.query(insertSql, [user_email, message], (insertErr) => {
      if (insertErr) return res.status(500).json({ message: "Failed to save notification", error: insertErr });
      res.json({ message: "Request rejected and notification saved." });
    });
  });
});

// --------------------- Get Notifications ---------------------
app.get("/api/notifications/:email", (req, res) => {
  const userEmail = req.params.email;

  const sql = "SELECT * FROM notifications WHERE user_email = ? ORDER BY created_at DESC";
  db.query(sql, [userEmail], (err, results) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    res.json(results);
  });
});

// --------------------- Mark Notification as Read ---------------------
app.post("/api/notifications/:id/read", (req, res) => {
  const notifId = req.params.id;

  const sql = "UPDATE notifications SET is_read = TRUE WHERE id = ?";
  db.query(sql, [notifId], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    res.json({ message: "Notification marked as read" });
  });
});

// --------------------- Unread Count ---------------------
app.get("/api/notifications/:email/unread-count", (req, res) => {
  const userEmail = req.params.email;

  const sql = "SELECT COUNT(*) AS unread_count FROM notifications WHERE user_email = ? AND is_read = FALSE";
  db.query(sql, [userEmail], (err, result) => {
    if (err) return res.status(500).json({ message: "Database error", error: err });
    res.json({ unread: result[0].unread_count });
  });
});

// --------------------- START SERVER ---------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
