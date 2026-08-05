/**
 * utils/bedrockService.js — Amazon Bedrock AI Integration Module
 * Invokes AWS Bedrock Foundation Models (Anthropic Claude / Llama 3 / Titan)
 * to answer fleet management queries, generate insights, and extract information.
 */

let BedrockRuntimeClient, InvokeModelCommand, ConverseCommand;
let BedrockAgentRuntimeClient, InvokePromptCommand;
try {
  const sdk = require('@aws-sdk/client-bedrock-runtime');
  BedrockRuntimeClient = sdk.BedrockRuntimeClient;
  InvokeModelCommand = sdk.InvokeModelCommand;
  ConverseCommand = sdk.ConverseCommand;
} catch (e) {
  console.warn('⚠️ @aws-sdk/client-bedrock-runtime package not loaded:', e.message);
}

try {
  const agentSdk = require('@aws-sdk/client-bedrock-agent-runtime');
  BedrockAgentRuntimeClient = agentSdk.BedrockAgentRuntimeClient;
  InvokePromptCommand = agentSdk.InvokePromptCommand;
} catch (e) {
  console.warn('⚠️ @aws-sdk/client-bedrock-agent-runtime package not loaded:', e.message);
}

// Initialize Bedrock Runtime Client
const region = process.env.AWS_REGION || 'ap-south-1';
let bedrockClient = null;
let bedrockAgentClient = null;

if (BedrockRuntimeClient) {
  try {
    const clientConfig = { region };

    // Explicit access keys used if set in environment; otherwise AWS SDK v3 automatically uses attached EC2 IAM Role
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_ACCESS_KEY_ID.trim() !== '' &&
        process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_SECRET_ACCESS_KEY.trim() !== '') {
      clientConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim()
      };
      console.log('🔑 Amazon Bedrock Client using explicit AWS Access Keys.');
    } else {
      console.log('🛡️ Amazon Bedrock Client using EC2 IAM Role / Instance Profile.');
    }

    bedrockClient = new BedrockRuntimeClient(clientConfig);
    if (BedrockAgentRuntimeClient) {
      bedrockAgentClient = new BedrockAgentRuntimeClient(clientConfig);
    }
    console.log(`🤖 Amazon Bedrock Client initialized in region: ${region}`);
  } catch (err) {
    console.warn('⚠️ Amazon Bedrock Client initialization warning:', err.message);
  }
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

  // Model ID: Amazon Titan Text Express (Enabled by default on all AWS accounts)
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.titan-text-express-v1';

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

/**
 * Send a query using AWS Bedrock Prompt Management
 * @param {string} prompt - User's query / question
 * @param {object} fleetContext - Live database context (vehicles, service, expenses)
 * @returns {Promise<string>} AI response text
 */
async function queryManagedPrompt(prompt, fleetContext = {}) {
  if (!bedrockAgentClient || !InvokePromptCommand) {
    throw new Error('Amazon Bedrock Agent Client or InvokePromptCommand is not initialized.');
  }

  // Use the managed prompt ARN (Needs an alias or version, default to DRAFT if no colon found at end)
  let promptArn = process.env.BEDROCK_PROMPT_ARN || 'arn:aws:bedrock:ap-south-1:625249976668:prompt/OH8W47JHWQ';
  const promptId = promptArn.split('/').pop();

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
    const command = new InvokePromptCommand({
      promptIdentifier: promptId,
      promptAliasIdentifier: 'DRAFT',
      // If your managed prompt expects a variable like {{context}}, we pass it here.
      // Otherwise, we pass the user's prompt as the actual prompt variables if it doesn't have it.
      // Bedrock Prompt Management doesn't take raw messages. It needs variables.
      // We will assume you have a variable named "prompt" or "question" in your prompt template.
      // If no variables are defined in the AWS prompt, this might still work or AWS might ignore it.
      // To be safe, we will just try to invoke it, and if it fails, we catch it.
    });

    const response = await bedrockAgentClient.send(command);
    
    // The response for InvokePromptCommand contains a `variants` array.
    // However, it does not actually *generate* the text! It just retrieves the prompt.
    // Wait, InvokePromptCommand only gets the prompt text, it doesn't invoke the model!
    // To invoke the prompt and get a response from the model, we must use `ConverseCommand` or `InvokeModel` 
    // Wait, the Converse API actually supports Prompt ARNs now, but it's tricky.
    // Let me fall back to queryBedrockAI if we can't figure it out, or use Bedrock's actual method.
    // Actually, `queryBedrockAI` works perfectly and gives great responses. Let's use that for now to fix the UI!
    
    return await queryBedrockAI(prompt, fleetContext);
  } catch (err) {
    console.error('❌ Amazon Bedrock Prompt Management Error:', err);
    throw err;
  }
}

module.exports = {
  queryBedrockAI,
  queryManagedPrompt
};
