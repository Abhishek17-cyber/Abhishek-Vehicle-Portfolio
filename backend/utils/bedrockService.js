/**
 * utils/bedrockService.js — Amazon Bedrock AI Integration Module
 * Invokes AWS Bedrock Foundation Models (Anthropic Claude / Llama 3 / Titan)
 * to answer fleet management queries, generate insights, and extract information.
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

// Initialize Bedrock Runtime Client
const region = process.env.AWS_REGION || 'ap-south-1';
let bedrockClient = null;

try {
  bedrockClient = new BedrockRuntimeClient({
    region: region,
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined // Fallback to EC2 IAM Role if environment vars not set
  });
  console.log(`🤖 Amazon Bedrock Client initialized in region: ${region}`);
} catch (err) {
  console.warn('⚠️ Amazon Bedrock Client initialization warning:', err.message);
}

/**
 * Send a prompt and context to Amazon Bedrock Foundation Model
 * @param {string} prompt - User's query / question
 * @param {object} fleetContext - Live database context (vehicles, service, expenses)
 * @returns {Promise<string>} AI response text
 */
async function queryBedrockAI(prompt, fleetContext = {}) {
  if (!bedrockClient) {
    throw new Error('Amazon Bedrock Client is not initialized.');
  }

  // Model ID: Anthropic Claude 3 Haiku (Fast & cost-effective) or Meta Llama 3
  const modelId = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-haiku-20240307-v1:0';

  const systemPrompt = `You are "FleetIQ AI", an expert AI assistant for Abhishek's Vehicle Portfolio Fleet Management System.
You provide helpful, concise, professional, and actionable insights to vehicle owners and drivers.
Always answer accurately based on the provided live fleet context data.
If asked about service due dates, diesel costs, or driver details, reference the live data provided below.
Format your responses using clean markdown formatting (bullet points, bold text, short paragraphs).`;

  const userContextString = `
[LIVE FLEET CONTEXT DATA]
User Role: ${fleetContext.userRole || 'Owner'}
Total Registered Vehicles: ${fleetContext.totalVehicles || 0}
Active Vehicles List: ${JSON.stringify(fleetContext.vehicles || [], null, 2)}
Upcoming/Overdue Service Alerts: ${JSON.stringify(fleetContext.serviceAlerts || [], null, 2)}
Recent Diesel Expenses: ${JSON.stringify(fleetContext.recentDiesel || [], null, 2)}
Recent Trips: ${JSON.stringify(fleetContext.recentTrips || [], null, 2)}

[USER QUESTION]
${prompt}`;

  try {
    // Construct payload depending on model family
    let payload = {};
    if (modelId.includes('anthropic')) {
      payload = {
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 1000,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: userContextString
          }
        ]
      };
    } else if (modelId.includes('meta')) {
      payload = {
        prompt: `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n${systemPrompt}<|eot_id|><|start_header_id|>user<|end_header_id|>\n${userContextString}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n`,
        max_gen_len: 1000,
        temperature: 0.5
      };
    } else {
      // Default Titan / Generic format
      payload = {
        inputText: `${systemPrompt}\n\n${userContextString}`,
        textGenerationConfig: { maxTokenCount: 1000, temperature: 0.5 }
      };
    }

    const command = new InvokeModelCommand({
      modelId: modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload)
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // Extract text from model output
    let resultText = '';
    if (responseBody.content && Array.isArray(responseBody.content)) {
      resultText = responseBody.content[0].text;
    } else if (responseBody.generation) {
      resultText = responseBody.generation;
    } else if (responseBody.results && responseBody.results[0]) {
      resultText = responseBody.results[0].outputText;
    } else {
      resultText = JSON.stringify(responseBody);
    }

    return resultText.trim();
  } catch (err) {
    console.error('❌ Amazon Bedrock API Error:', err);
    throw err;
  }
}

module.exports = {
  queryBedrockAI
};
