const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");

require("dotenv").config({
  path: path.resolve(__dirname, "../.env"),
});

const leadRoutes = require("./routes/leadRoutes");
const authRoutes = require("./routes/authRoutes");
const xmlRoutes = require("./routes/xmlRoutes");

const {
  getApplicationData,
  submitBankVerification,
} = require("./controllers/leadController");

const app = express();

/**
 * =========================
 * CORS CONFIG
 * =========================
 */
const allowedOrigins = [
  "https://pstloans.com",
  "https://www.pstloans.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://31.220.58.248:3004",
  process.env.FRONTEND_URL
    ? String(process.env.FRONTEND_URL).trim().replace(/\/+$/, "")
    : null,
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow curl/Postman/server-to-server
      if (!origin) {
        return callback(null, true);
      }

      const cleanOrigin = origin.replace(/\/+$/, "");

      if (allowedOrigins.includes(cleanOrigin)) {
        return callback(null, true);
      }

      console.log("❌ Blocked CORS origin:", origin);

      return callback(new Error("Not allowed by CORS"));
    },

    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  }),
);

/**
 * =========================
 * SECURITY
 * =========================
 */
app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: "cross-origin",
    },
  }),
);

/**
 * =========================
 * MIDDLEWARE
 * =========================
 */
app.use(express.json());
app.use(morgan("dev"));

/**
 * =========================
 * RATE LIMIT
 * =========================
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
});

app.use(limiter);

/**
 * =========================
 * ROUTES
 * =========================
 */
app.use("/api/leads", leadRoutes);
app.use("/api/leads/export", xmlRoutes);
app.use("/api/auth", authRoutes);

/**
 * =========================
 * BANK VERIFICATION
 * =========================
 */
app.get("/bank-verification/lookup", getApplicationData);

app.post("/api/bank-verification", submitBankVerification);

/**
 * =========================
 * HEALTH CHECK
 * =========================
 */
app.get("/", (req, res) => {
  res.send("PST Loans API Running 🚀");
});

/**
 * =========================
 * ERROR HANDLER
 * =========================
 */
app.use((err, req, res, next) => {
  console.error("🔥 Error:", err);

  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

/**
 * =========================
 * START SERVER
 * =========================
 */
const PORT = process.env.PORT || 6001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;
