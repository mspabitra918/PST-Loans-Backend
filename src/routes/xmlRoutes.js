const express = require("express");
const ExcelJS = require("exceljs");
const db = require("../config/db");
const { protect, adminOnly } = require("../middleware/auth");

const router = express.Router();

router.get("/download", protect, adminOnly, async (req, res) => {
  try {
    const { date } = req.query;

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      return res
        .status(400)
        .json({ success: false, message: "Valid date (YYYY-MM-DD) is required" });
    }

    const leads = await db("leads")
      .whereRaw("DATE(created_at) = ?", [date])
      .orderBy("created_at", "desc");

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Leads");

    worksheet.columns = [
      { header: "Lead ID", key: "unique_lead_id", width: 18 },
      { header: "First Name", key: "first_name", width: 18 },
      { header: "Last Name", key: "last_name", width: 18 },
      { header: "Email", key: "email", width: 28 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Zip", key: "zip", width: 10 },
      { header: "Loan Amount", key: "loan_amount", width: 14 },
      { header: "Income Source", key: "income_source", width: 18 },
      { header: "Monthly Net", key: "monthly_net", width: 14 },
      { header: "Pay Frequency", key: "pay_frequency", width: 16 },
      { header: "Bank Type", key: "bank_type", width: 14 },
      { header: "Bank Name", key: "bank_name", width: 20 },
      { header: "Status", key: "status", width: 14 },
      { header: "Created At", key: "created_at", width: 24 },
    ];
    worksheet.getRow(1).font = { bold: true };

    leads.forEach((lead) => {
      worksheet.addRow({
        unique_lead_id: lead.unique_lead_id || "",
        first_name: lead.first_name || "",
        last_name: lead.last_name || "",
        email: lead.email || "",
        phone: lead.phone || "",
        zip: lead.zip || "",
        loan_amount: lead.loan_amount || "",
        income_source: lead.income_source || "",
        monthly_net: lead.monthly_net || "",
        pay_frequency: lead.pay_frequency || "",
        bank_type: lead.bank_type || "",
        bank_name: lead.bank_name || "",
        status: lead.status || "",
        created_at: lead.created_at
          ? new Date(lead.created_at).toLocaleString()
          : "",
      });
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="leads-${date}.xlsx"`,
    );

    const buffer = await workbook.xlsx.writeBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Error generating leads file:", error);
    res.status(500).json({ success: false, message: "Error generating file" });
  }
});

module.exports = router;
