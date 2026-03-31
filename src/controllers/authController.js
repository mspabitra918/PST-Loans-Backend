const db = require("../config/db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const { sendOTP } = require("../utils/mail");

const register = async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const existingUser = await db("users").where({ email }).first();
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const id = uuidv4();

    await db("users").insert({
      id,
      name,
      email,
      password: hashedPassword,
    });

    res
      .status(201)
      .json({ success: true, message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error registering user" });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await db("users").where({ email }).first();
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid credentials" });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otp_expires_at = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

    // Update user with OTP
    await db("users").where({ id: user.id }).update({
      otp,
      otp_expires_at,
    });

    // Send OTP via Mailgun
    const sent = await sendOTP(user.email, otp);

    if (!sent) {
      return res
        .status(500)
        .json({ success: false, message: "Error sending verification code" });
    }

    res.json({
      success: true,
      message: "Verification code sent to your email",
      mfa_required: true,
      email: user.email, // Send back email to use in next step
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error logging in" });
  }
};

const verifyOTP = async (req, res) => {
  const { email, otp } = req.body;
  try {
    const user = await db("users").where({ email }).first();
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found" });
    }

    if (!user.otp || !user.otp_expires_at) {
      return res
        .status(400)
        .json({ success: false, message: "No verification code requested" });
    }

    const now = new Date();
    if (new Date(user.otp_expires_at) < now) {
      return res
        .status(400)
        .json({ success: false, message: "Verification code expired" });
    }

    if (user.otp !== otp) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid verification code" });
    }

    // Clear OTP after successful verification
    await db("users").where({ id: user.id }).update({
      otp: null,
      otp_expires_at: null,
    });

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET || "secret_key",
      { expiresIn: "1d" },
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error verifying code" });
  }
};

const admin = async (req, res) => {
  const { email } = req.body;

  const adminUser = await db("users").where({ email }).first();
  return res.json({ success: true, adminUser });
};

const getMe = async (req, res) => {
  try {
    const user = await db("users")
      .where({ id: req.user.id })
      .select("id", "name", "email", "role", "created_at")
      .first();
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching user" });
  }
};

module.exports = { register, login, verifyOTP, admin, getMe };
