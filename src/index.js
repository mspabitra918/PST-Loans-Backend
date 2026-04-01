const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const leadRoutes = require("./routes/leadRoutes");
const authRoutes = require("./routes/authRoutes");

const app = express();

// Middleware
app.use(helmet());
// CORS — allow frontend
app.use(cors());
// app.use(
//   cors({
//     origin: [
//       "https://www.creeklend.com",
//       "https://creeklend.com",
//       "www.creeklend.com",
//       "creeklend.com",
//       process.env.FRONTEND_URL || "http://localhost:3000",
//     ],
//     credentials: true,
//   }),
// );
app.use(express.json());
app.use(morgan("dev"));

// Routes
app.use("/api/leads", leadRoutes);
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
