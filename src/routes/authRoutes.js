const express = require("express");
const router = express.Router();
const {
  register,
  login,
  verifyOTP,
  admin,
} = require("../controllers/authController");

router.post("/register", register);
router.post("/login", login);
router.post("/verify-otp", verifyOTP);
router.post("/admin", admin);

module.exports = router;
