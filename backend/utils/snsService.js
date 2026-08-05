/**
 * utils/snsService.js — AWS SNS Direct SMS Service
 * Abhishek's Vehicle Portfolio — Fleet Management System
 */

const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

// Configure AWS SNS Client
// Uses environment variables or IAM Role on EC2 automatically
const region = process.env.AWS_REGION || 'ap-south-1';
const clientConfig = { region };

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID.trim() !== '' &&
    process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SECRET_ACCESS_KEY.trim() !== '') {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim()
  };
}

const snsClient = new SNSClient(clientConfig);

/**
 * Format phone number to E.164 standard (+[country_code][number])
 * Default country code: +91 (India)
 */
function formatE164(phone) {
  if (!phone) return null;
  const cleaned = phone.trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  const defaultCode = process.env.DEFAULT_COUNTRY_CODE || '+91';
  // Strip leading 0 if present (e.g. 09876543210)
  const number = cleaned.replace(/^0+/, '');
  return `${defaultCode}${number}`;
}

/**
 * Send Direct SMS to a single phone number via AWS SNS
 * @param {string} phone - Recipient phone number
 * @param {string} message - Message text
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendDirectSMS(phone, message) {
  const formattedPhone = formatE164(phone);
  if (!formattedPhone) {
    return { success: false, error: 'Invalid or missing phone number' };
  }

  try {
    const params = {
      Message: message,
      PhoneNumber: formattedPhone,
      MessageAttributes: {
        'AWS.SNS.SMS.SMSType': {
          DataType: 'String',
          StringValue: 'Transactional' // Higher delivery priority for alerts
        }
      }
    };

    const command = new PublishCommand(params);
    const response = await snsClient.send(command);
    console.log(`[AWS SNS] SMS sent to ${formattedPhone}. MessageId: ${response.MessageId}`);
    return { success: true, messageId: response.MessageId, recipient: formattedPhone };
  } catch (err) {
    console.error(`[AWS SNS] Error sending SMS to ${formattedPhone}:`, err.message);
    return { success: false, error: err.message, recipient: formattedPhone };
  }
}

module.exports = {
  formatE164,
  sendDirectSMS
};
