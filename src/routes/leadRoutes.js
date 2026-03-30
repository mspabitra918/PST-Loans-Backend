const express = require("express");
const router = express.Router();
const {
  submitLead,
  getLeads,
  getLeadById,
  getLeadByUniqueId,
  updateLeadStatus,
  approveLead,
  requestDocuments,
  declineLead,
  uploadDocument,
  completeUpload,
  getLeadDocuments,
  uploadMiddleware,
} = require("../controllers/leadController");
const { protect } = require("../middleware/auth");

router.post("/submit", submitLead);
router.get("/", protect, getLeads);
router.get("/:id", protect, getLeadById);
router.get("/:id/documents", protect, getLeadDocuments);
router.put("/:id/status", protect, updateLeadStatus);

// Public upload routes
router.get("/public/:uniqueId", getLeadByUniqueId);
router.post("/public/:uniqueId/upload", uploadMiddleware, uploadDocument);
router.post("/public/:uniqueId/complete", completeUpload);

// Action endpoints (update status + send email)
router.post("/:id/approve", protect, approveLead);
router.post("/:id/request-documents", protect, requestDocuments);
router.post("/:id/decline", protect, declineLead);

module.exports = router;
