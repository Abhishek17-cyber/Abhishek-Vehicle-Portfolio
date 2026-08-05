/**
 * ai-assistant.js — FleetIQ Direct Smart AI Floating Assistant Widget
 * Renders a floating bot button on all pages that opens an interactive AI Chat drawer.
 * Powered by direct real-time backend fleet database analytics.
 */

document.addEventListener('DOMContentLoaded', () => {
  initAiAssistantWidget();
});

function initAiAssistantWidget() {
  if (document.getElementById('fleetAiWidget')) return;

  // Insert HTML for Floating Widget
  const widgetContainer = document.createElement('div');
  widgetContainer.id = 'fleetAiWidget';
  widgetContainer.innerHTML = `
    <!-- Floating Launcher Button -->
    <button id="aiLauncherBtn" onclick="toggleAiDrawer()" title="Ask FleetIQ Direct AI Assistant" style="
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #FF9900, #FF6600);
      color: white;
      border: none;
      box-shadow: 0 8px 24px rgba(255, 102, 0, 0.4);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    ">
      <i class="bi bi-robot fs-3"></i>
      <span class="position-absolute top-0 start-100 translate-middle badge rounded-pill bg-danger border border-light" style="font-size: 10px; margin-left: -12px;">AI</span>
    </button>

    <!-- AI Chat Drawer Box -->
    <div id="aiChatDrawer" style="
      position: fixed;
      bottom: 96px;
      right: 24px;
      z-index: 9999;
      width: 390px;
      max-width: calc(100vw - 32px);
      height: 540px;
      max-height: calc(100vh - 120px);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 12px 36px rgba(0,0,0,0.25);
      border: 1px solid rgba(255,153,0,0.3);
      display: none;
      flex-direction: column;
      overflow: hidden;
      font-family: system-ui, -apple-system, sans-serif;
    ">
      <!-- Drawer Header -->
      <div style="background: linear-gradient(135deg, #232F3E, #131921); color: white; padding: 14px 16px; display: flex; align-items: center; justify-content: space-between;">
        <div class="d-flex align-items-center gap-2">
          <div style="width: 34px; height: 34px; background: linear-gradient(135deg, #FF9900, #FF6600); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <i class="bi bi-cpu text-white fs-6"></i>
          </div>
          <div>
            <div class="fw-bold" style="font-size: 14px; line-height: 1.2;">FleetIQ AI Assistant</div>
            <div style="font-size: 11px; color: #10B981;">⚡ FleetIQ Direct Smart AI</div>
          </div>
        </div>
        <button onclick="toggleAiDrawer()" style="background: transparent; border: none; color: #8795A1; font-size: 18px; cursor: pointer;"><i class="bi bi-x-lg"></i></button>
      </div>

      <!-- Quick Action Pills -->
      <div style="background: #F8F9FA; padding: 8px 12px; border-bottom: 1px solid #E9ECEF; display: flex; gap: 6px; overflow-x: auto; white-space: nowrap;">
        <button onclick="sendAiQuickPrompt('Which vehicles are due for service?')" class="btn btn-sm btn-outline-dark rounded-pill py-0 px-2" style="font-size: 11px;">🔧 Service Due</button>
        <button onclick="sendAiQuickPrompt('What are my recent diesel costs?')" class="btn btn-sm btn-outline-dark rounded-pill py-0 px-2" style="font-size: 11px;">⛽ Fuel Costs</button>
        <button onclick="sendAiQuickPrompt('List all my active vehicles')" class="btn btn-sm btn-outline-dark rounded-pill py-0 px-2" style="font-size: 11px;">🚛 My Vehicles</button>
        <button onclick="sendAiQuickPrompt('Show complete fleet overview')" class="btn btn-sm btn-outline-dark rounded-pill py-0 px-2" style="font-size: 11px;">📊 Fleet Summary</button>
      </div>

      <!-- Chat Messages Container -->
      <div id="aiChatMessages" style="flex: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; background: #FAFAFA;">
        <div style="background: #EBF8FF; border: 1px solid #BEE3F8; border-radius: 12px; padding: 12px; font-size: 13px; color: #2B6CB0;">
          👋 <strong>Hello! I am FleetIQ AI Assistant.</strong><br>
          I can directly analyze your fleet data, track service dates, diesel expenses, trip revenues, and document compliance in real time!
        </div>
      </div>

      <!-- Chat Input Field -->
      <div style="padding: 10px; background: #ffffff; border-top: 1px solid #E2E8F0; display: flex; gap: 8px; align-items: center;">
        <input type="text" id="aiUserInput" placeholder="Ask AI anything about your fleet..." onkeydown="if(event.key==='Enter') sendAiMessage()" style="
          flex: 1;
          border: 1px solid #CBD5E0;
          border-radius: 20px;
          padding: 8px 14px;
          font-size: 13px;
          outline: none;
        ">
        <button onclick="sendAiMessage()" id="aiSendBtn" style="
          background: linear-gradient(135deg, #FF9900, #FF6600);
          color: white;
          border: none;
          border-radius: 50%;
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        "><i class="bi bi-send-fill fs-6"></i></button>
      </div>
    </div>
  `;
  document.body.appendChild(widgetContainer);
}

function toggleAiDrawer() {
  const drawer = document.getElementById('aiChatDrawer');
  if (!drawer) return;
  if (drawer.style.display === 'none' || !drawer.style.display) {
    drawer.style.display = 'flex';
    document.getElementById('aiUserInput').focus();
  } else {
    drawer.style.display = 'none';
  }
}

function sendAiQuickPrompt(text) {
  const input = document.getElementById('aiUserInput');
  if (input) {
    input.value = text;
    sendAiMessage();
  }
}

async function sendAiMessage() {
  const input = document.getElementById('aiUserInput');
  const messagesDiv = document.getElementById('aiChatMessages');
  const sendBtn = document.getElementById('aiSendBtn');
  if (!input || !messagesDiv) return;

  const prompt = input.value.trim();
  if (!prompt) return;

  // Append User message
  const userMsg = document.createElement('div');
  userMsg.style.cssText = 'align-self: flex-end; background: #3182CE; color: white; border-radius: 14px 14px 2px 14px; padding: 10px 14px; max-width: 82%; font-size: 13px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);';
  userMsg.textContent = prompt;
  messagesDiv.appendChild(userMsg);

  input.value = '';
  sendBtn.disabled = true;
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  // Append AI Thinking Indicator
  const botThinking = document.createElement('div');
  botThinking.id = 'aiThinkingIndicator';
  botThinking.style.cssText = 'align-self: flex-start; background: #EDF2F7; color: #4A5568; border-radius: 14px 14px 14px 2px; padding: 10px 14px; max-width: 85%; font-size: 13px; display: flex; align-items: center; gap: 8px;';
  botThinking.innerHTML = `<span class="spinner-border spinner-border-sm text-warning" role="status"></span> <span style="font-size:12px;">FleetIQ AI analyzing fleet data...</span>`;
  messagesDiv.appendChild(botThinking);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  try {
    const token = typeof getToken === 'function' ? getToken() : localStorage.getItem('token');
    const res = await fetch(`${API_BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ prompt })
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || `Server returned ${res.status}`);
    }

    const data = await res.json();
    botThinking.remove();

    const botMsg = document.createElement('div');
    botMsg.style.cssText = 'align-self: flex-start; background: #ffffff; color: #1A202C; border: 1px solid #E2E8F0; border-radius: 14px 14px 14px 2px; padding: 12px 14px; max-width: 88%; font-size: 13px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); white-space: pre-wrap; line-height: 1.5;';
    
    const formattedAnswer = (data.answer || 'No response returned.').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    botMsg.innerHTML = `
      <div style="font-size: 10px; color: #10B981; font-weight: bold; margin-bottom: 4px;">⚡ ${data.source || 'FleetIQ Direct AI Engine'}</div>
      ${formattedAnswer}
    `;
    messagesDiv.appendChild(botMsg);
  } catch (err) {
    botThinking.remove();
    const errMsg = document.createElement('div');
    errMsg.style.cssText = 'align-self: flex-start; background: #FFF5F5; color: #C53030; border: 1px solid #FEB2B2; border-radius: 12px; padding: 10px 14px; max-width: 85%; font-size: 12px;';
    errMsg.textContent = `❌ AI Assistant Error: ${err.message || 'Connection failed. Please check backend connection.'}`;
    messagesDiv.appendChild(errMsg);
  } finally {
    sendBtn.disabled = false;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}
