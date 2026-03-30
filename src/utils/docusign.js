const docusign = require("docusign-esign");
const path = require("path");
const fs = require("fs");

// DocuSign configuration from environment variables
const DOCUSIGN_INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY;
const DOCUSIGN_USER_ID = process.env.DOCUSIGN_USER_ID;
const DOCUSIGN_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;
const DOCUSIGN_BASE_PATH =
  process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi";
const DOCUSIGN_OAUTH_BASE =
  process.env.DOCUSIGN_OAUTH_BASE || "account-d.docusign.com";
const DOCUSIGN_PRIVATE_KEY_PATH =
  process.env.DOCUSIGN_PRIVATE_KEY_PATH ||
  path.join(__dirname, "../../docusign-private.pem");
const DOCUSIGN_TEMPLATE_ID = process.env.DOCUSIGN_TEMPLATE_ID;
const DOCUSIGN_WEBHOOK_URL = process.env.DOCUSIGN_WEBHOOK_URL;

/**
 * Get a DocuSign API client authenticated via JWT Grant.
 */
async function getDocuSignClient() {
  const apiClient = new docusign.ApiClient();
  apiClient.setBasePath(DOCUSIGN_BASE_PATH);
  apiClient.setOAuthBasePath(DOCUSIGN_OAUTH_BASE);

  const privateKey = fs.readFileSync(DOCUSIGN_PRIVATE_KEY_PATH);

  const results = await apiClient.requestJWTUserToken(
    DOCUSIGN_INTEGRATION_KEY,
    DOCUSIGN_USER_ID,
    ["signature", "impersonation"],
    privateKey,
    3600, // token expires in 1 hour
  );

  apiClient.addDefaultHeader(
    "Authorization",
    `Bearer ${results.body.access_token}`,
  );

  return apiClient;
}

/**
 * Create and send a DocuSign envelope using a template, auto-filled with lead data.
 *
 * @param {object} lead - The lead record from the database
 * @returns {object} - { envelopeId, status }
 */
async function sendContract(lead) {
  const apiClient = await getDocuSignClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  // Build the envelope definition from the template
  const envelopeDefinition = new docusign.EnvelopeDefinition();
  envelopeDefinition.templateId = DOCUSIGN_TEMPLATE_ID;
  envelopeDefinition.status = "sent"; // Send immediately

  // Map the lead as the signer (roleName must match the template's role)
  const signer = docusign.TemplateRole.constructFromObject({
    email: lead.email,
    name: `${lead.first_name} ${lead.last_name}`,
    roleName: "Borrower", // Must match the role name in your DocuSign template
    tabs: {
      textTabs: [
        {
          tabLabel: "borrowerName",
          value: `${lead.first_name} ${lead.last_name}`,
        },
        { tabLabel: "borrowerEmail", value: lead.email },
        { tabLabel: "borrowerPhone", value: lead.phone },
        { tabLabel: "borrowerZip", value: lead.zip },
        {
          tabLabel: "loanAmount",
          value: `$${Number(lead.loan_amount).toLocaleString()}`,
        },
        { tabLabel: "applicationId", value: lead.unique_lead_id },
        {
          tabLabel: "monthlyIncome",
          value: `$${Number(lead.monthly_net).toLocaleString()}`,
        },
        { tabLabel: "payFrequency", value: lead.pay_frequency },
        { tabLabel: "incomeSource", value: lead.income_source },
        { tabLabel: "bankName", value: lead.bank_name },
      ],
    },
  });

  envelopeDefinition.templateRoles = [signer];

  // Set up webhook (Connect) event notification for this envelope
  if (DOCUSIGN_WEBHOOK_URL) {
    envelopeDefinition.eventNotification =
      docusign.EventNotification.constructFromObject({
        url: DOCUSIGN_WEBHOOK_URL,
        loggingEnabled: true,
        requireAcknowledgment: true,
        envelopeEvents: [
          { envelopeEventStatusCode: "completed" },
          { envelopeEventStatusCode: "declined" },
          { envelopeEventStatusCode: "voided" },
          { envelopeEventStatusCode: "delivered" },
        ],
        recipientEvents: [
          { recipientEventStatusCode: "Completed" },
          { recipientEventStatusCode: "Declined" },
        ],
      });
  }

  const result = await envelopesApi.createEnvelope(DOCUSIGN_ACCOUNT_ID, {
    envelopeDefinition,
  });

  return {
    envelopeId: result.envelopeId,
    status: result.status,
  };
}

/**
 * Get the current status of a DocuSign envelope.
 *
 * @param {string} envelopeId
 * @returns {object} - envelope status details
 */
async function getEnvelopeStatus(envelopeId) {
  const apiClient = await getDocuSignClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);

  const envelope = await envelopesApi.getEnvelope(
    DOCUSIGN_ACCOUNT_ID,
    envelopeId,
  );

  return {
    status: envelope.status,
    sentDateTime: envelope.sentDateTime,
    completedDateTime: envelope.completedDateTime,
    declinedDateTime: envelope.declinedDateTime,
    voidedDateTime: envelope.voidedDateTime,
  };
}

module.exports = {
  sendContract,
  getEnvelopeStatus,
};
