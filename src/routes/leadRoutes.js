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
  docusignWebhook,
  getContractStatus,
  uploadMiddleware,
} = require("../controllers/leadController");
const { protect, adminOnly } = require("../middleware/auth");

router.post("/submit", submitLead);
router.get("/", protect, adminOnly, getLeads);
router.get("/:id", protect, adminOnly, getLeadById);
router.get("/:id/documents", protect, adminOnly, getLeadDocuments);
router.put("/:id/status", protect, adminOnly, updateLeadStatus);

// Public upload routes
router.get("/public/:uniqueId", getLeadByUniqueId);
router.post("/public/:uniqueId/upload", uploadMiddleware, uploadDocument);
router.post("/public/:uniqueId/complete", completeUpload);

// Action endpoints (update status + send email/contract)
router.post("/:id/approve", protect, adminOnly, approveLead);
router.post("/:id/request-documents", protect, adminOnly, requestDocuments);
router.post("/:id/decline", protect, adminOnly, declineLead);
router.get("/:id/contract-status", protect, adminOnly, getContractStatus);

// DocuSign webhook (no auth — DocuSign calls this directly)
router.post("/webhook/docusign", docusignWebhook);

module.exports = router;
