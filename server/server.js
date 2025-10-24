const express = require("express");
const mysql = require("mysql");
const bcrypt = require("bcrypt");
const path = require("path");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const PDFDocument = require("pdfkit");
const { jsPDF } = require("jspdf");
const pdf = require("html-pdf");
const bodyParser = require("body-parser");
const { Parser } = require("json2csv");
const atob = require("atob");

/* 
require('dotenv').config({ path: __dirname + '/.env' });

console.log("TWILIO_FROM =", process.env.TWILIO_FROM);
console.log("TWILIO_ACCOUNT_SID =", process.env.TWILIO_ACCOUNT_SID);
console.log("TWILIO_AUTH_TOKEN =", process.env.TWILIO_AUTH_TOKEN);


const twilio = require("twilio");
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
*/

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.use(bodyParser.json({ limit: '10mb' })); 


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

// Fetch lost items
app.get("/api/lost-items", (req, res) => {
  const sql = "SELECT * FROM lost_items ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

// --------------------- LOST COUNT ---------------------
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

// Fetch found items
app.get("/api/found-items", (req, res) => {
  const sql = "SELECT * FROM found_items ORDER BY id DESC";
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

// --------------------- FOUND COUNT ---------------------
app.get("/api/found-count", (req, res) => {
  const sql = "SELECT COUNT(*) AS total FROM found_items";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: "Database error" });
    res.json({ count: result[0].total });
  });
});

// --------------------- RECENT ITEMS ---------------------
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
const verificationStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const verificationFileFilter = (req, file, cb) => {
  const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
  if (allowedTypes.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Only PDF or image files are allowed!"), false);
};

const uploadVerification = multer({
  storage: verificationStorage,
  fileFilter: verificationFileFilter,
});

app.post("/api/verification-request", uploadVerification.single("invoice"), (req, res) => {
  try {
    const { description, item_id, item_name, username } = req.body;
    const invoicePath = req.file ? "/uploads/" + req.file.filename : null;

    if (!description || !item_id || !item_name || !username)
      return res.status(400).json({ message: "All fields are required" });

    const sql = `
      INSERT INTO verification_requests (item_id, item_name, username, description, invoice_file)
      VALUES (?, ?, ?, ?, ?)
    `;
    db.query(sql, [item_id, item_name, username, description, invoicePath], (err, result) => {
      if (err) {
        console.error("DB Error:", err);
        return res.status(500).json({ message: "Database error" });
      }

      res.json({
        message: "Verification request submitted successfully!",
        requestId: result.insertId,
        file: invoicePath,
      });
    });
  } catch (err) {
    console.error("Server Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// --------------------- GET VERIFICATION REQUESTS ---------------------
app.get("/api/verification", (req, res) => {
  const sql = `
    SELECT 
      v.id AS verification_id,
      f.id AS found_id,
      f.item_name,
      f.finder_name,
      f.location,
      f.date_found,
      f.contact_no,
      f.image,
      v.username,
      v.description,
      v.invoice_file,   -- 👈 Include uploaded invoice/bill
      v.request_date
    FROM found_items f
    RIGHT JOIN verification_requests v ON f.id = v.item_id
    ORDER BY v.id DESC
  `;
  
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ message: "Database error" });
    res.json(results);
  });
});

// --------------------- ACCEPT VERIFICATION REQUEST ---------------------
app.post("/api/verification/:id/accept", (req, res) => {
  const verificationId = req.params.id;

  const selectSql = "SELECT * FROM verification_requests WHERE id = ?";
  db.query(selectSql, [verificationId], (err, rows) => {
    if (err) return res.status(500).json({ message: "Database error (select)" });
    if (rows.length === 0) return res.status(404).json({ message: "Verification not found" });

    const verification = rows[0];

    // Insert into accepted_verifications table
    const insertSql = `
      INSERT INTO accepted_verifications 
      (verification_id, item_id, item_name, username, description, invoice_file)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(
      insertSql,
      [
        verification.id,
        verification.item_id,
        verification.item_name,
        verification.username,
        verification.description,
        verification.invoice_file,
      ],
      (insertErr) => {
        if (insertErr) return res.status(500).json({ message: "Database error (insert)" });

        // Delete from verification_requests
        const deleteSql = "DELETE FROM verification_requests WHERE id = ?";
        db.query(deleteSql, [verificationId], (deleteErr) => {
          if (deleteErr) return res.status(500).json({ message: "Database error (delete)" });

          // Insert notification
          const message = `Your verification request for item "${verification.item_name}" has been accepted.`;
          const insertNotifSql = "INSERT INTO notifications (user_email, type, message) VALUES (?, 'accept', ?)";
          db.query(insertNotifSql, [verification.username, message], (notifErr) => {
            if (notifErr) console.error("Notification insert error:", notifErr);
            res.json({ message: "Verification request accepted successfully." });
          });
        });
      }
    );
  });
});

// --------------------- REJECT VERIFICATION REQUEST ---------------------
app.post("/api/verification/:id/reject", (req, res) => {
  const verificationId = req.params.id;

  const selectSql = "SELECT * FROM verification_requests WHERE id = ?";
  db.query(selectSql, [verificationId], (err, rows) => {
    if (err) return res.status(500).json({ message: "Database error (select)" });
    if (rows.length === 0) return res.status(404).json({ message: "Verification not found" });

    const verification = rows[0];

    // Insert into rejected_verifications table
    const insertSql = `
      INSERT INTO rejected_verifications 
      (verification_id, item_id, item_name, username, description, invoice_file)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    db.query(
      insertSql,
      [
        verification.id,
        verification.item_id,
        verification.item_name,
        verification.username,
        verification.description,
        verification.invoice_file,
      ],
      (insertErr) => {
        if (insertErr) return res.status(500).json({ message: "Database error (insert)" });

        // Delete from verification_requests
        const deleteSql = "DELETE FROM verification_requests WHERE id = ?";
        db.query(deleteSql, [verificationId], (deleteErr) => {
          if (deleteErr) return res.status(500).json({ message: "Database error (delete)" });

          // Insert notification
          const message = `Your verification request for item "${verification.item_name}" has been rejected.`;
          const insertNotifSql = "INSERT INTO notifications (user_email, type, message) VALUES (?, 'reject', ?)";
          db.query(insertNotifSql, [verification.username, message], (notifErr) => {
            if (notifErr) console.error("Notification insert error:", notifErr);
            res.json({ message: "Verification request rejected successfully." });
          });
        });
      }
    );
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

// --------------------- ANALYTICS API (lost, found, accepted, rejected) ---------------------
app.get("/api/analytics", (req, res) => {
  const { month, year } = req.query;

  const queries = {
    lost: "SELECT COUNT(*) AS count FROM lost_items WHERE MONTH(date_lost)=? AND YEAR(date_lost)=?",
    found: "SELECT COUNT(*) AS count FROM found_items WHERE MONTH(date_found)=? AND YEAR(date_found)=?",
    accepted: "SELECT COUNT(*) AS count FROM accepted_verifications WHERE MONTH(accepted_date)=? AND YEAR(accepted_date)=?",
    rejected: "SELECT COUNT(*) AS count FROM rejected_verifications WHERE MONTH(rejected_date)=? AND YEAR(rejected_date)=?"
  };

  db.query(queries.lost, [month, year], (err, lost) => {
    if (err) return res.status(500).json({ error: err });
    db.query(queries.found, [month, year], (err, found) => {
      if (err) return res.status(500).json({ error: err });
      db.query(queries.accepted, [month, year], (err, accepted) => {
        if (err) return res.status(500).json({ error: err });
        db.query(queries.rejected, [month, year], (err, rejected) => {
          if (err) return res.status(500).json({ error: err });
          res.json({
            lost: lost[0].count,
            found: found[0].count,
            accepted: accepted[0].count,
            rejected: rejected[0].count
          });
        });
      });
    });
  });
});
// --------------------- GENERATE ANALYTICS REPORT PDF ---------------------

app.post("/api/analytics-report", (req, res) => {
  const { chartImage, month, year } = req.body;
  if (!chartImage) return res.status(400).send("Chart image required");

  const doc = new jsPDF("p", "mm", "a4");
  doc.setFontSize(20);
  doc.text(`ClaimConnect Analytics Report`, 20, 20);
  doc.setFontSize(12);
  doc.text(`Month: ${month}, Year: ${year}`, 20, 30);

  // Remove prefix and add image
  const base64Data = chartImage.replace(/^data:image\/png;base64,/, "");
  doc.addImage(base64Data, "PNG", 15, 40, 180, 100); 

  const pdfData = doc.output("arraybuffer");
  res.setHeader("Content-Type", "application/pdf");
  res.send(Buffer.from(pdfData));
});

// --------------------- START SERVER ---------------------
app.listen(process.env.PORT || 3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});
