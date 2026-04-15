const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const leadRoutes = require("./routes/leadRoutes");
const authRoutes = require("./routes/authRoutes");
const xmlRoutes = require("./routes/xmlRoutes");

const app = express();

// Middleware
const rawFrontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
const frontendUrl = String(rawFrontendUrl).trim().replace(/\/+$/, "");

const allowedOrigins = new Set([
  "https://pstloans.com",
  "https://www.pstloans.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  frontendUrl,
]);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow non-browser requests and same-origin calls (e.g., server-to-server)
    if (!origin) return callback(null, true);

    const safeOrigin = String(origin).trim().replace(/\/+$/, "");
    if (allowedOrigins.has(safeOrigin)) {
      return callback(null, true);
    }
    console.error(`CORS blocked origin: ${origin}`);
    return callback(new Error(`CORS policy blocked origin: ${origin}`), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

// CORS must come before helmet so preflight responses aren't blocked
app.use(cors(corsOptions));
app.options("/{*splat}", cors(corsOptions));

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/leads", leadRoutes);
app.use("/api/leads/export", xmlRoutes);
app.use("/api/auth", authRoutes);

// Basic Route
app.get("/", (req, res) => {
  res.send("PST Loans API");
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

const PORT = process.env.PORT || 5001;

// For local development
if (process.env.NODE_ENV !== "production") {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// For Vercel serverless deployment
module.exports = app;
