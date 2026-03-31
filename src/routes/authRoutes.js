const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verifyOTP,
  admin,
  getMe,
} = require("../controllers/authController");
const { protect } = require("../middleware/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.post("/admin", admin);
router.get("/me", protect, getMe);

module.exports = router;
