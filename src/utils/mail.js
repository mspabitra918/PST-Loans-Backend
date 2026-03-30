const formData = require("form-data");
const Mailgun = require("mailgun.js");

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
  url: process.env.MAILGUN_API_URL || "https://api.mailgun.net",
});

const sendOTP = async (email, otp) => {
  const messageData = {
    from: process.env.MAILGUN_FROM,
    to: email,
    subject: "Your Verification Code",
    text: `Your verification code is: ${otp}. It will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333; text-align: center;">Verification Code</h2>
        <p style="font-size: 16px; color: #555;">Hello,</p>
        <p style="font-size: 16px; color: #555;">Your verification code for logging into PTS Loan is:</p>
        <div style="background-color: #f4f4f4; padding: 15px; border-radius: 4px; text-align: center; margin: 20px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #007bff;">${otp}</span>
        </div>
        <p style="font-size: 14px; color: #888; text-align: center;">This code will expire in 10 minutes. If you didn't request this code, please ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #aaa; text-align: center;">© 2026 PTS Loan. All rights reserved.</p>
      </div>
    `,
  };

  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log(`OTP sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending OTP via Mailgun:", error);
    return false;
  }
};

const brandHeader = `
  <div style="background-color: #003B5C; padding: 32px 24px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 28px; font-weight: 800; color: #ffffff;">PST<span style="color: #4CAF50;">Loans</span></h1>
  </div>
`;

const brandFooter = `
  <hr style="border: 0; border-top: 1px solid #eee; margin: 24px 0;">
  <p style="font-size: 12px; color: #aaa; text-align: center;">
    PST Loans &bull; 355 S Grand Ave, Office #20 W, Los Angeles, CA 90071<br>
    (747) 200-5228 &bull; support@pstloans.example
  </p>
  <p style="font-size: 11px; color: #ccc; text-align: center;">
    &copy; ${new Date().getFullYear()} PST Loans. All rights reserved.
  </p>
`;

const sendApprovalEmail = async (lead) => {
  const messageData = {
    from: process.env.MAILGUN_FROM,
    to: lead.email,
    subject: `Great news, ${lead.first_name}! Your loan has been approved`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${brandHeader}
        <div style="padding: 32px 24px;">
          <h2 style="color: #003B5C; margin-top: 0;">Congratulations, ${lead.first_name}!</h2>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Your loan application <strong>#${lead.unique_lead_id}</strong> for
            <strong>$${Number(lead.loan_amount).toLocaleString()}</strong> has been <span style="color: #4CAF50; font-weight: bold;">approved</span>.
          </p>
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 1px;">Next Step</p>
            <p style="margin: 0; font-size: 18px; font-weight: bold; color: #003B5C;">Review &amp; sign your loan agreement</p>
          </div>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            A DocuSign contract has been sent to <strong>${lead.email}</strong>. Please review and e-sign the agreement to proceed with funding.
          </p>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            Once signed, funds will be deposited into your account as early as the <strong>next business day</strong>.
          </p>
          <p style="font-size: 14px; color: #888; margin-top: 24px;">
            Questions? Call us at <strong>(747) 200-5228</strong> Mon&ndash;Fri, 8:30 AM &ndash; 6:30 PM PT.
          </p>
        </div>
        ${brandFooter}
      </div>
    `,
  };

  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log(`Approval email sent to ${lead.email}`);
    return true;
  } catch (error) {
    console.error("Error sending approval email:", error);
    return false;
  }
};

const sendDocumentRequestEmail = async (lead, uploadLink) => {
  const messageData = {
    from: process.env.MAILGUN_FROM,
    to: lead.email,
    subject: `Action required: Documents needed for application #${lead.unique_lead_id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${brandHeader}
        <div style="padding: 32px 24px;">
          <h2 style="color: #003B5C; margin-top: 0;">Hi ${lead.first_name},</h2>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We're almost there! To continue processing your loan application <strong>#${lead.unique_lead_id}</strong>, we need a few documents from you.
          </p>
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: bold; color: #003B5C;">Please upload the following:</p>
            <ul style="margin: 0; padding-left: 20px; color: #555; font-size: 14px; line-height: 2;">
              <li>Most recent <strong>pay stub</strong> (within 30 days)</li>
              <li><strong>Government-issued ID</strong> (driver's license or state ID)</li>
              <li>Recent <strong>bank statement</strong> (within 60 days)</li>
            </ul>
          </div>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${uploadLink}" style="display: inline-block; background-color: #003B5C; color: #ffffff; text-decoration: none; padding: 14px 36px; border-radius: 8px; font-weight: bold; font-size: 16px;">
              Upload Documents Securely
            </a>
          </div>
          <p style="font-size: 13px; color: #999; text-align: center;">
            This link is unique to your application and expires in 7 days.
          </p>
          <p style="font-size: 14px; color: #888; margin-top: 24px;">
            Need help? Call us at <strong>(747) 200-5228</strong> Mon&ndash;Fri, 8:30 AM &ndash; 6:30 PM PT.
          </p>
        </div>
        ${brandFooter}
      </div>
    `,
  };

  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log(`Document request email sent to ${lead.email}`);
    return true;
  } catch (error) {
    console.error("Error sending document request email:", error);
    return false;
  }
};

const sendDeclineEmail = async (lead) => {
  const messageData = {
    from: process.env.MAILGUN_FROM,
    to: lead.email,
    subject: `Update on your PST Loans application #${lead.unique_lead_id}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${brandHeader}
        <div style="padding: 32px 24px;">
          <h2 style="color: #003B5C; margin-top: 0;">Hi ${lead.first_name},</h2>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            Thank you for your interest in PST Loans and for taking the time to apply.
          </p>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            After careful review of your application <strong>#${lead.unique_lead_id}</strong>, we are unable to approve your loan request at this time.
          </p>
          <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 8px; font-size: 14px; font-weight: bold; color: #92400e;">What does this mean?</p>
            <p style="margin: 0; font-size: 14px; color: #555; line-height: 1.6;">
              This decision does not affect your credit score since we only performed a soft credit pull. You are welcome to re-apply after 90 days if your financial situation changes.
            </p>
          </div>
          <p style="font-size: 15px; color: #555; line-height: 1.6;">
            We encourage you to review your credit report and work on building your financial profile. We would love to help you in the future.
          </p>
          <p style="font-size: 14px; color: #888; margin-top: 24px;">
            If you have questions, reach us at <strong>(747) 200-5228</strong> Mon&ndash;Fri, 8:30 AM &ndash; 6:30 PM PT.
          </p>
        </div>
        ${brandFooter}
      </div>
    `,
  };

  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log(`Decline email sent to ${lead.email}`);
    return true;
  } catch (error) {
    console.error("Error sending decline email:", error);
    return false;
  }
};

const sendApplicationConfirmation = async ({
  firstName,
  email,
  uniqueLeadId,
  loanAmount,
}) => {
  const messageData = {
    from: process.env.MAILGUN_FROM,
    to: email,
    subject: `Your PST Loans Application (#PST-${uniqueLeadId})`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
        ${brandHeader}
        <div style="padding: 32px 24px;">
          <h2 style="color: #003B5C; margin-top: 0;">Hi ${firstName},</h2>
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We&rsquo;ve received your loan request for <strong>$${Number(loanAmount).toLocaleString()}</strong>. Our team is reviewing it now.
          </p>

          <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
            <p style="margin: 0 0 4px; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 2px;">Your Application ID</p>
            <p style="margin: 0; font-size: 32px; font-weight: 900; color: #003B5C; letter-spacing: 3px;">#PST-${uniqueLeadId}</p>
          </div>

          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin: 24px 0;">
            <p style="margin: 0 0 12px; font-size: 14px; font-weight: bold; color: #003B5C;">What happens next?</p>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 12px 8px 0; vertical-align: top; width: 24px;">
                  <div style="width: 24px; height: 24px; background: #003B5C; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: bold;">1</div>
                </td>
                <td style="padding: 8px 0; font-size: 14px; color: #555;">
                  <strong>Review</strong> &mdash; A loan officer will review your details
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 12px 8px 0; vertical-align: top;">
                  <div style="width: 24px; height: 24px; background: #003B5C; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: bold;">2</div>
                </td>
                <td style="padding: 8px 0; font-size: 14px; color: #555;">
                  <strong>Verification call</strong> &mdash; We may call you from <strong>(747) 200-5228</strong>
                </td>
              </tr>
              <tr>
                <td style="padding: 8px 12px 8px 0; vertical-align: top;">
                  <div style="width: 24px; height: 24px; background: #003B5C; color: white; border-radius: 50%; text-align: center; line-height: 24px; font-size: 12px; font-weight: bold;">3</div>
                </td>
                <td style="padding: 8px 0; font-size: 14px; color: #555;">
                  <strong>Decision</strong> &mdash; You&rsquo;ll receive an update via email
                </td>
              </tr>
            </table>
          </div>

          <div style="background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
            <p style="margin: 0; font-size: 14px; color: #92400e;">
              <strong>Important:</strong> Please keep your phone nearby. We will call from <strong>(747) 200-5228</strong> if we need further information.
            </p>
          </div>

          <p style="font-size: 14px; color: #888; margin-top: 24px; text-align: center;">
            Questions? Call <strong>(747) 200-5228</strong> or reply to this email.
          </p>
        </div>
        ${brandFooter}
      </div>
    `,
  };

  try {
    await mg.messages.create(process.env.MAILGUN_DOMAIN, messageData);
    console.log(`Confirmation email sent to ${email}`);
    return true;
  } catch (error) {
    console.error("Error sending confirmation email:", error);
    return false;
  }
};

module.exports = {
  sendOTP,
  sendApprovalEmail,
  sendDocumentRequestEmail,
  sendDeclineEmail,
  sendApplicationConfirmation,
};
