const db = require("../config/db");
const { v4: uuidv4 } = require("uuid");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const cloudinary = require("cloudinary").v2;
const { encrypt, decrypt, hashSSN } = require("../utils/encryption");
const {
  sendApprovalEmail,
  sendDocumentRequestEmail,
  sendDeclineEmail,
  sendApplicationConfirmation,
} = require("../utils/mail");

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer for memory storage (for Cloudinary upload)
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|pdf/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase(),
    );
    if (mimetype && extname) return cb(null, true);
    cb(new Error("Only images and PDFs are allowed"));
  },
});

// Helper for Meta CAPI (Mock)
const fireCAPIEvent = async (eventName, leadData, customData = {}) => {
  console.log(`[CAPI] Firing ${eventName} for ${leadData.email}`, customData);
  // In production, this would call Meta Graph API
};

const submitLead = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    zip,
    loanAmount,
    incomeSource,
    monthlyNet,
    payFrequency,
    bankType,
    bankName,
    routingNumber,
    accountNumber,
    ssnLast4,
    fbp,
    fbc,
  } = req.body;

  try {
    const ssnHash = hashSSN(ssnLast4);
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const existingLead = await db("leads")
      .where("ssn_last4_hash", ssnHash)
      .andWhere("created_at", ">", ninetyDaysAgo)
      .first();

    if (existingLead) {
      return res.status(409).json({
        success: false,
        message:
          "It looks like you have a recent application on file. Please call (747) 200-5228 to check your status.",
        redirect: true,
      });
    }

    const encryptedRouting = encrypt(routingNumber);
    const encryptedAccount = encrypt(accountNumber);

    const leadId = uuidv4();
    const uniqueLeadId = Math.floor(100000 + Math.random() * 900000).toString();

    await db("leads").insert({
      id: leadId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      zip,
      loan_amount: loanAmount,
      income_source: incomeSource,
      monthly_net: monthlyNet,
      pay_frequency: payFrequency,
      bank_type: bankType,
      bank_name: bankName,
      routing_number: encryptedRouting,
      account_number: encryptedAccount,
      ssn_last4_hash: ssnHash,
      status: "New",
      fbp,
      fbc,
      unique_lead_id: uniqueLeadId,
    });

    // Fire Lead event to Meta CAPI
    await fireCAPIEvent(
      "Lead",
      { email, phone },
      { unique_lead_id: uniqueLeadId, fbp, fbc },
    );

    // Send confirmation email (non-blocking — don't fail the request if email fails)
    sendApplicationConfirmation({
      firstName,
      email,
      uniqueLeadId,
      loanAmount,
    }).catch((err) => console.error("Confirmation email failed:", err));

    res.status(201).json({
      success: true,
      message: "Application received successfully!",
      unique_lead_id: uniqueLeadId,
    });
  } catch (error) {
    console.error("Error submitting lead:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application. Please try again later.",
    });
  }
};

const getLeads = async (req, res) => {
  try {
    const leads = await db("leads").orderBy("created_at", "desc");
    res.json({ success: true, leads });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error fetching leads" });
  }
};

const getLeadById = async (req, res) => {
  try {
    const lead = await db("leads").where({ id: req.params.id }).first();

    const documents = await db("documents").where({ lead_id: lead.id });
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    lead.routing_number = decrypt(lead.routing_number);
    lead.account_number = decrypt(lead.account_number);

    res.json({ success: true, lead, documents });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching lead details" });
  }
};

const updateLeadStatus = async (req, res) => {
  const { status } = req.body;
  const { id } = req.params;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    await db("leads").where({ id }).update({ status });

    // Meta CAPI Feedback Loop
    if (status === "Approved") {
      await fireCAPIEvent("ApprovedLead", lead);
    } else if (status === "Declined") {
      await fireCAPIEvent("Disqualified", lead);
    }

    res.json({ success: true, message: `Status updated to ${status}` });
  } catch (error) {
    res.status(500).json({ success: false, message: "Error updating status" });
  }
};

const approveLead = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    await db("leads").where({ id }).update({ status: "Approved" });
    await fireCAPIEvent("ApprovedLead", lead);

    const emailSent = await sendApprovalEmail(lead);

    res.json({
      success: true,
      message: `Lead approved${emailSent ? " and contract email sent" : ", but email failed to send"}`,
      emailSent,
    });
  } catch (error) {
    console.error("Error approving lead:", error);
    res.status(500).json({ success: false, message: "Error approving lead" });
  }
};

const requestDocuments = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    await db("leads").where({ id }).update({ status: "Documents Requested" });

    // Generate a secure upload link (placeholder — replace with real secure upload URL)
    const uploadLink = `${process.env.FRONTEND_URL || "https://pstloans.example"}/upload/${lead.unique_lead_id}`;

    const emailSent = await sendDocumentRequestEmail(lead, uploadLink);

    res.json({
      success: true,
      message: `Document request${emailSent ? " email sent" : " failed to send"}`,
      emailSent,
    });
  } catch (error) {
    console.error("Error requesting documents:", error);
    res
      .status(500)
      .json({ success: false, message: "Error requesting documents" });
  }
};

const declineLead = async (req, res) => {
  documents;
  const { id } = req.params;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    await db("leads").where({ id }).update({ status: "Declined" });
    await fireCAPIEvent("Disqualified", lead);

    const emailSent = await sendDeclineEmail(lead);

    res.json({
      success: true,
      message: `Lead declined${emailSent ? " and notification sent" : ", but email failed to send"}`,
      emailSent,
    });
  } catch (error) {
    console.error("Error declining lead:", error);
    res.status(500).json({ success: false, message: "Error declining lead" });
  }
};

const getLeadByUniqueId = async (req, res) => {
  const { uniqueId } = req.params;
  try {
    const lead = await db("leads").where({ unique_lead_id: uniqueId }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Invalid or expired upload link" });

    // Only return minimal info needed for the upload page
    res.json({
      success: true,
      lead: {
        firstName: lead.first_name,
        lastName: lead.last_name,
        uniqueId: lead.unique_lead_id,
        status: lead.status,
      },
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error validating application link" });
  }
};

const uploadDocument = async (req, res) => {
  const { uniqueId } = req.params;
  const { docType } = req.body;

  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "No file uploaded" });
  }

  try {
    const lead = await db("leads").where({ unique_lead_id: uniqueId }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: "pst_loans_documents",
          public_id: `${uniqueId}_${docType}_${Date.now()}`,
          resource_type: "auto",
          access_mode: "public", // Explicitly set to public
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        },
      );
      stream.end(req.file.buffer);
    });

    // Check if document of this type already exists for this lead
    const existingDoc = await db("documents")
      .where({ lead_id: lead.id, doc_type: docType })
      .first();

    if (existingDoc) {
      // Update existing document
      await db("documents").where({ id: existingDoc.id }).update({
        file_name: req.file.originalname,
        file_path: result.secure_url,
        uploaded_at: db.fn.now(),
      });
    } else {
      // Insert new document
      await db("documents").insert({
        id: uuidv4(),
        lead_id: lead.id,
        lead_unique_id: uniqueId,
        file_name: req.file.originalname,
        file_path: result.secure_url, // Store Cloudinary URL
        doc_type: docType,
      });
    }

    res.json({ success: true, message: "Document uploaded successfully" });
  } catch (error) {
    console.error("Error uploading document:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to upload document" });
  }
};

const completeUpload = async (req, res) => {
  const { uniqueId } = req.params;

  try {
    const lead = await db("leads").where({ unique_lead_id: uniqueId }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    await db("leads")
      .where({ unique_lead_id: uniqueId })
      .update({ status: "Documents Uploaded" });

    res.json({
      success: true,
      message: "All documents submitted successfully",
    });
  } catch (error) {
    console.error("Error completing upload:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to complete submission" });
  }
};

const getLeadDocuments = async (req, res) => {
  const { id } = req.params;
  try {
    const documents = await db("documents")
      .where({ lead_id: id })
      .orderBy("uploaded_at", "desc");

    // Generate signed URLs for Cloudinary resources if they're private
    const documentsWithSignedUrls = documents.map((doc) => {
      if (doc.file_path.includes("cloudinary")) {
        try {
          // Extract public_id from Cloudinary URL
          // URL format: https://res.cloudinary.com/{cloud_name}/image/upload/v{version}/{folder}/{filename}
          const urlParts = doc.file_path.split("/");
          const folderIndex = urlParts.findIndex(
            (part) => part === "pst_loans_documents",
          );
          if (folderIndex !== -1 && folderIndex < urlParts.length - 1) {
            // Get folder and filename (without extension)
            const folder = urlParts[folderIndex];
            const filenameWithExt = urlParts[folderIndex + 1];
            const filename = filenameWithExt.split(".")[0];
            const publicId = `${folder}/${filename}`;

            // Generate signed URL with expiration (24 hours)
            const signedUrl = cloudinary.url(publicId, {
              sign_url: true,
              expires_at: Math.floor(Date.now() / 1000) + 86400, // 24 hours
            });

            return {
              ...doc,
              signed_url: signedUrl,
            };
          }
        } catch (error) {
          console.error("Error generating signed URL:", error);
        }
      }
      return doc;
    });

    res.json({ success: true, documents: documentsWithSignedUrls });
  } catch (error) {
    console.error("Error fetching documents:", error);
    res
      .status(500)
      .json({ success: false, message: "Error fetching documents" });
  }
};

module.exports = {
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
  uploadMiddleware: upload.single("file"),
};
