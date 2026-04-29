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
const { sendContract, getEnvelopeStatus } = require("../utils/docusign");

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
  const { search, date } = req.query;
  try {
    let query = db("leads");

    if (search) {
      const term = `%${search}%`;
      query = query.where((builder) => {
        builder
          .whereRaw("CONCAT(first_name, ' ', last_name) ILIKE ?", [term])
          .orWhere("email", "ilike", term)
          .orWhere("unique_lead_id", "ilike", term);
      });
    }

    if (date) {
      query = query.whereRaw("DATE(created_at) = ?", [date]);
    }

    const leads = await query.orderBy("created_at", "desc");
    res.json({ success: true, leads });
  } catch (error) {
    console.error("Error fetching leads:", error);
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
    console.error("Error fetching lead details:", error);
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

const updateLeadDetails = async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // If updating bank info, re-encrypt the sensitive fields.
    // Accept either camelCase (routingNumber) or snake_case (routing_number).
    const rawRouting = updateData.routingNumber ?? updateData.routing_number;
    if (rawRouting) {
      updateData.routing_number = encrypt(rawRouting);
      delete updateData.routingNumber;
    }
    const rawAccount = updateData.accountNumber ?? updateData.account_number;
    if (rawAccount) {
      updateData.account_number = encrypt(rawAccount);
      delete updateData.accountNumber;
    }

    const ssnLast4 = updateData.ssnLast4 ?? updateData.ssn_last4;
    if (ssnLast4) {
      updateData.ssn_last4_hash = hashSSN(ssnLast4);
      delete updateData.ssnLast4;
      delete updateData.ssn_last4;
    }

    await db("leads").where({ id }).update(updateData);
    res.json({ success: true, message: "Lead details updated successfully" });
  } catch (error) {
    console.error("Error updating lead details:", error);
    res
      .status(500)
      .json({ success: false, message: "Error updating lead details" });
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

    // Send the contract via DocuSign
    let envelopeId = null;
    let contractSent = false;
    try {
      const docuSignResult = await sendContract(lead);
      envelopeId = docuSignResult.envelopeId;
      contractSent = true;
      console.log(`DocuSign envelope ${envelopeId} sent to ${lead.email}`);
    } catch (docuSignError) {
      console.error("DocuSign contract send failed:", docuSignError);
    }

    // Update lead status and store envelope info
    await db("leads")
      .where({ id })
      .update({
        status: "Approved",
        docusign_envelope_id: envelopeId,
        contract_status: contractSent ? "sent" : "none",
        contract_sent_at: contractSent ? db.fn.now() : null,
      });

    await fireCAPIEvent("ApprovedLead", lead);

    // Send the approval notification email
    const emailSent = await sendApprovalEmail(lead);

    res.json({
      success: true,
      message: contractSent
        ? `Lead approved and DocuSign contract sent to ${lead.email}`
        : `Lead approved${emailSent ? " and notification email sent (DocuSign failed)" : ", but all notifications failed"}`,
      emailSent,
      contractSent,
      envelopeId,
    });
  } catch (error) {
    console.error("Error approving lead:", error);
    res.status(500).json({ success: false, message: "Error approving lead" });
  }
};

const docusignWebhook = async (req, res) => {
  try {
    const body = req.body;

    // DocuSign Connect sends XML by default, but can be configured for JSON.
    // With JSON payload, the envelope status is in the body directly.
    const envelopeId = body.envelopeId || body.EnvelopeStatus?.EnvelopeID;
    const status = body.status || body.EnvelopeStatus?.Status;

    if (!envelopeId) {
      console.warn("DocuSign webhook received without envelopeId");
      return res.status(200).send("ok");
    }

    console.log(`DocuSign webhook: envelope ${envelopeId} status=${status}`);

    const statusMap = {
      completed: "signed",
      declined: "declined",
      voided: "voided",
      delivered: "delivered",
      sent: "sent",
    };

    const contractStatus =
      statusMap[status?.toLowerCase()] || status?.toLowerCase();
    const updateData = { contract_status: contractStatus };

    if (contractStatus === "signed") {
      updateData.contract_signed_at = db.fn.now();
    }

    await db("leads")
      .where({ docusign_envelope_id: envelopeId })
      .update(updateData);

    res.status(200).send("ok");
  } catch (error) {
    console.error("DocuSign webhook error:", error);
    res.status(200).send("ok"); // Always return 200 so DocuSign doesn't retry
  }
};

const getContractStatus = async (req, res) => {
  const { id } = req.params;

  try {
    const lead = await db("leads").where({ id }).first();
    if (!lead)
      return res
        .status(404)
        .json({ success: false, message: "Lead not found" });

    // If we have an envelope ID, optionally fetch live status from DocuSign
    let liveStatus = null;
    if (lead.docusign_envelope_id) {
      try {
        liveStatus = await getEnvelopeStatus(lead.docusign_envelope_id);
      } catch (err) {
        console.error("Failed to fetch live DocuSign status:", err);
      }
    }

    res.json({
      success: true,
      contractStatus: lead.contract_status,
      envelopeId: lead.docusign_envelope_id,
      contractSentAt: lead.contract_sent_at,
      contractSignedAt: lead.contract_signed_at,
      liveStatus,
    });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: "Error fetching contract status" });
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
  docusignWebhook,
  getContractStatus,
  updateLeadDetails,
  uploadMiddleware: upload.single("file"),
};
