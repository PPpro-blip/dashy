"use strict";

/* ==========================================================================
   ╔════════════════════════════════════════════════════════════════════════╗
   ║   🔑  NO API KEY NEEDED! 100% GROQ AI! 🗿                            ║
   ║   Admin system, chat persistence, and more!                          ║
   ╚════════════════════════════════════════════════════════════════════════╝
   ========================================================================== */

// Your Cloudflare Worker URL
const GEMINI_ENDPOINT = "https://dashy-flow-state.kamleshprathampandey.workers.dev/";

/* ==========================================================================
   STATE
   ========================================================================== */
const State = {
  currentUser: null,
  currentChatId: null,
  chats: [],
  currentModel: "dash-allrounder",
  currentTheme: "dark",
  isResponding: false,
  pendingAttachments: [],
  pendingReportMsgId: null
};

const SPEEDGEN_ENDPOINT = "https://image.pollinations.ai/prompt/";

// 👑 ADMIN LIST — Unlimited messages!
const ADMINS = [
  "shubhampandey2012@gmail.com",
  "23maths20@gmail.com",
  "shristi.neoskillacademy@gmail.com",
  "yashrajskilldeveloper@gmail.com",
  "kamleshprathampandey@gmail.com",
  "pratham.neoskill@gmail.com",
  "neemapandey737@gmail.com",
  "kamlesh062984@gmail.com"
];

/* ==========================================================================
   CHAT PERSISTENCE — Save & Load Chats
   ========================================================================== */

function saveChatsToStorage() {
  try {
    const data = {
      chats: State.chats,
      currentChatId: State.currentChatId,
      currentModel: State.currentModel,
      currentTheme: State.currentTheme
    };
    localStorage.setItem('dashy_chats_data', JSON.stringify(data));
  } catch (e) {
    console.warn('Could not save chats:', e);
  }
}

function loadChatsFromStorage() {
  try {
    const stored = localStorage.getItem('dashy_chats_data');
    if (!stored) return false;
    
    const data = JSON.parse(stored);
    if (data.chats && data.chats.length > 0) {
      State.chats = data.chats;
      State.currentChatId = data.currentChatId || null;
      if (data.currentModel) State.currentModel = data.currentModel;
      if (data.currentTheme) State.currentTheme = data.currentTheme;
      return true;
    }
    return false;
  } catch (e) {
    console.warn('Could not load chats:', e);
    return false;
  }
}

// ============================================================
//  MESSAGE LIMITS — Per user type
// ============================================================

const MESSAGE_LIMITS = {
  "guest": 20,              // Guests get 20 messages
  "user@gmail.com": 20,     // Google demo users get 20 messages
  "default": 100,           // Real email users get 100 messages
};

function getUserLimit() {
  const user = State.currentUser;
  if (!user) return 5;

  // 👑 Admins = unlimited
  if (ADMINS.includes(user.email)) {
    return Infinity;
  }

  // Google demo user
  if (user.email === "user@gmail.com") {
    return MESSAGE_LIMITS["user@gmail.com"];
  }

  // Guest user
  if (user.email === "guest@dashy.ai") {
    return MESSAGE_LIMITS.guest;
  }

  // Everyone else = default
  return MESSAGE_LIMITS.default;
}

function getUserMessageCount() {
  const user = State.currentUser;
  if (!user) return 0;

  // Admins don't get counted
  if (ADMINS.includes(user.email)) {
    return 0;
  }

  const key = `dashy_messages_${user.email}`;
  const count = parseInt(localStorage.getItem(key) || "0");
  return count;
}

function incrementUserMessageCount() {
  const user = State.currentUser;
  if (!user) return;

  // Admins: skip counting
  if (ADMINS.includes(user.email)) {
    return;
  }

  const key = `dashy_messages_${user.email}`;
  const current = parseInt(localStorage.getItem(key) || "0");
  localStorage.setItem(key, String(current + 1));
}

function resetUserMessageCount() {
  const user = State.currentUser;
  if (!user) return;

  // Admins: no need to reset
  if (ADMINS.includes(user.email)) {
    return;
  }

  const key = `dashy_messages_${user.email}`;
  localStorage.removeItem(key);
}

function checkMessageLimit() {
  const user = State.currentUser;
  if (!user) return { allowed: true, remaining: Infinity, limit: Infinity };

  const used = getUserMessageCount();
  const limit = getUserLimit();
  const remaining = limit - used;

  if (remaining <= 0) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining, limit };
}


/* ==========================================================================
   🎵 MUSIC GENERATION — Suno AI (Card Version)
   ========================================================================== */

// Your Cloudflare Worker URL for Suno (Hides API Key!)
const SUNO_ENDPOINT = "https://dashy-suno-proxy.kamleshprathampandey.workers.dev";

let selectedGenre = "pop";
let selectedDuration = "30";

function selectGenre(genre) {
  selectedGenre = genre;
  
  document.querySelectorAll('.music-genre-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.genre === genre);
  });
  
  const genreNames = {
    'pop': 'Pop',
    'jazz': 'Jazz',
    'lo-fi': 'Lo-Fi',
    'rock': 'Rock',
    'classical': 'Classical',
    'hip-hop': 'Hip-Hop'
  };
  document.getElementById('music-selected-display').textContent = genreNames[genre] || genre;
}

function selectDuration(duration) {
  selectedDuration = duration;
  
  document.querySelectorAll('.music-duration-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.duration === duration);
  });
  
  document.getElementById('music-duration-display').textContent = duration;
}

function showMusicModal() {
  openModal('modal-music');
}

async function generateMusicFromModal() {
  const customPrompt = document.getElementById('music-prompt').value.trim();
  const resultDiv = document.getElementById('music-result');
  const btn = document.getElementById('music-generate-btn');
  
  // Build prompt from genre or custom
  let prompt = customPrompt;
  
  if (!prompt) {
    const genrePrompts = {
      'pop': 'A catchy, upbeat pop song with vocals and energetic instruments',
      'jazz': 'A smooth, improvisational jazz piece with piano and saxophone',
      'lo-fi': 'A chill, nostalgic lo-fi beat with soft melodies and vinyl crackle',
      'rock': 'An energetic rock song with electric guitar, drums, and powerful vocals',
      'classical': 'An elegant orchestral classical piece with strings and piano',
      'hip-hop': 'A rhythmic hip-hop beat with groovy bass, drums, and expressive vocals'
    };
    prompt = genrePrompts[selectedGenre] || selectedGenre;
  }
  
  // Add duration hint
  const durationMap = {
    '15': 'a short 15-second',
    '30': 'a 30-second',
    '60': 'a 1-minute'
  };
  prompt = `Generate ${durationMap[selectedDuration]} ${prompt}`;
  
  resultDiv.innerHTML = `<p>⏳ Generating your ${selectedDuration}s song... This takes 1-2 minutes.</p>`;
  btn.disabled = true;
  btn.textContent = "⏳ Generating...";
  
  try {
    const data = await generateMusicAPI(prompt);
    
    btn.disabled = false;
    btn.textContent = "🎵 Generate Music";
    
    if (data && data.success && data.data && data.data.length > 0) {
      const song = data.data[0];
      resultDiv.innerHTML = `
        <div style="padding: 12px; background: var(--bg-card); border-radius: var(--radius-md);">
          <p><strong>🎵 ${song.title || "Untitled"}</strong></p>
          <p style="font-size: 0.8rem; color: var(--text-muted);">
            ${song.lyric ? song.lyric.substring(0, 150) + (song.lyric.length > 150 ? "..." : "") : "🎶 Instrumental"}
          </p>
          <audio controls style="width: 100%; margin-top: 10px;">
            <source src="${song.audio_url}" type="audio/mpeg">
            Your browser doesn't support audio.
          </audio>
          <div style="display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap;">
            <button class="download-btn" onclick="window.open('${song.audio_url}')">
              📥 Download MP3
            </button>
            <button class="report-btn-cancel" onclick="document.querySelector('#music-result audio').play()">
              ▶️ Play
            </button>
          </div>
        </div>
      `;
    } else {
      resultDiv.innerHTML = `<p style="color: var(--accent-danger);">❌ Failed: ${data?.message || "Unknown error"}</p>`;
    }
  } catch (error) {
    resultDiv.innerHTML = `<p style="color: var(--accent-danger);">❌ Error: ${error.message}</p>`;
    btn.disabled = false;
    btn.textContent = "🎵 Generate Music";
  }
}

async function generateMusicAPI(prompt) {
  try {
    const response = await fetch(SUNO_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "generate",
        prompt: prompt,
        model: "chirp-v3"
      })
    });
    return await response.json();
  } catch (error) {
    console.error("Music generation failed:", error);
    throw error;
  }
}

// ============================================================
//  VOICE + PAUSE + EXPORT SETTINGS
// ============================================================

let isPaused = false;
let selectedVoice = "default";
let isVoiceMode = false;

/* ==========================================================================
   DASH MODEL CONFIGS — 3 Models!
   ========================================================================== */
const DASH_MODELS = {
  "dash-complexity": {
    displayName: "🧠 DASH-Complexity",
    backendModel: "dash-complexity",
    systemInstruction: "You are DASH-Complexity. You excel at complex reasoning, deep technical problems, and sophisticated code generation. Provide thorough, well-structured responses with complete examples. You were built by Pratham Pandey. Your image generation engine is called SpeedGen."
  },
  "dash-allrounder": {
    displayName: "⚡ DASH-AllRounder",
    backendModel: "dash-allrounder",
    systemInstruction: "You are DASH-AllRounder. You're friendly, helpful, and versatile. Help users with conversations, coding, writing, analysis, and creative tasks. Be clear and engaging. You were built by Pratham Pandey. Your image generation engine is called SpeedGen."
  },
  "dash-superfast": {
    displayName: "🔥 DASH-SuperFast",
    backendModel: "dash-superfast",
    systemInstruction: "You are DASH-SuperFast. Optimize for speed and brevity. Give direct, concise answers. Get straight to the point. Use short sentences. Keep code snippets focused and minimal. You were built by Pratham Pandey. Your image generation engine is called SpeedGen."
  }
};

function getDashConfig(modelKey) {
  return DASH_MODELS[modelKey] || DASH_MODELS["dash-allrounder"];
}

function isApiKeyConfigured() {
  return true;
}

/* ==========================================================================
   UTILITIES
   ========================================================================== */
function scrollToBottom() {
  const area = document.getElementById("chat-messages-area");
  if (area) area.scrollTop = area.scrollHeight;
}

function generateMsgId() {
  return "msg_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6);
}

function useSuggestion(text) {
  const input = document.getElementById("chat-text-input");
  if (input) {
    input.value = text;
    input.focus();
    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

/* ==========================================================================
   SCREEN & MODAL
   ========================================================================== */
function showScreen(id) {
  document.querySelectorAll(".screen-container").forEach(s => s.classList.remove("active-screen"));
  const el = document.getElementById(id);
  if (el) el.classList.add("active-screen");
}
function goToLogin() { showScreen("screen-login"); }

function openModal(id) {
  document.getElementById("modal-overlay").classList.add("show");
  document.querySelectorAll(".modal-card").forEach(m => m.classList.remove("active"));
  const m = document.getElementById(id);
  if (m) m.classList.add("active");
}
function closeModal(e) {
  if (e && e.target && !e.target.classList.contains("modal-overlay")) return;
  closeAllModals();
}
function closeAllModals() {
  document.getElementById("modal-overlay").classList.remove("show");
  document.querySelectorAll(".modal-card").forEach(m => m.classList.remove("active"));
  State.pendingReportMsgId = null;
}

/* ==========================================================================
   APP BOOT
   ========================================================================== */
function initApp() {
  try {
    // 🔥 CHECK FOR SAVED SESSION FIRST!
    const session = localStorage.getItem('dashy_user_session');
    if (session) {
      try {
        const user = JSON.parse(session);
        // Auto-login the user
        handleUserLogin({
          email: user.email,
          defaultName: user.defaultName,
          avatarLetter: user.avatarLetter || user.defaultName[0].toUpperCase()
        });
        return; // ✅ Exit early, no need to show login
      } catch (e) {
        console.warn("Session parse error:", e);
        localStorage.removeItem('dashy_user_session');
      }
    }

    // If no session, show age verification
    const verified = localStorage.getItem("dashy_age_verified");
    if (!verified) {
      showScreen("screen-age");
    } else {
      showScreen("screen-title");
      setTimeout(() => {
        if (document.getElementById("screen-title").classList.contains("active-screen")) {
          goToLogin();
        }
      }, 2500);
    }
  } catch (err) {
    showError("Init failed: " + err.message);
  }
}

window.addEventListener("DOMContentLoaded", initApp);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAllModals(); });

/* ==========================================================================
   AGE VERIFICATION
   ========================================================================== */
function verifyAge() {
  const input = document.getElementById("dob-input");
  if (!input) return;
  const dob = new Date(input.value);
  if (isNaN(dob.getTime())) return showError("Please enter a valid date of birth.");

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;

  if (age >= 16) {
    localStorage.setItem("dashy_age_verified", "full");
    showScreen("screen-title");
    setTimeout(() => {
      if (document.getElementById("screen-title").classList.contains("active-screen")) {
        goToLogin();
      }
    }, 2500);
  } else {
    localStorage.setItem("dashy_age_verified", "guest");
    showError("You must be 16+ to use DashyCore. You'll continue as a guest with limited features.");
    setTimeout(() => {
      handleUserLogin({ email: "guest@dashy.ai", defaultName: "Guest", avatarLetter: "G" });
    }, 1500);
  }
}

/* ==========================================================================
   LOGIN
   ========================================================================== */

function loginWithGoogle() {
  // Show a funny warning
  showToast(
    "⚠️ This is a demo login! You'll get a fake ID like 'user@gmail.com'.\n" +
    "The creator is 12 years old and is NOT paying for Google OAuth... YET! 😭\n\n" +
    "You get 20 messages. Make them count! 🗿",
    "warning"
  );
  
  // Set a timeout so they can read the message
  setTimeout(() => {
    handleUserLogin({ 
      email: "user@gmail.com", 
      defaultName: "Google User", 
      avatarLetter: "G" 
    });
  }, 3000);
}

function loginAsGuest() {
  showToast(
    "👋 You're a guest! You get 20 messages.\n" +
    "If you like it, tell the creator to add real auth! 🗿",
    "warning"
  );
  
  setTimeout(() => {
    handleUserLogin({ 
      email: "guest@dashy.ai", 
      defaultName: "Guest", 
      avatarLetter: "G" 
    });
  }, 2500);
}

function loginWithEmail() {
  try {
    const email = document.getElementById("login-email-input").value.trim();
    const pass = document.getElementById("login-password-input").value.trim();
    if (!email) return showError("Please enter your email.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Invalid email format.");
    if (!pass || pass.length < 4) return showError("Password must be at least 4 characters.");
    handleUserLogin({ email, defaultName: email.split("@")[0], avatarLetter: email[0].toUpperCase() });
  } catch (err) { showError("Login failed: " + err.message); }
}

function handleUserLogin({ email, defaultName, avatarLetter }) {
  // 🔥 SAVE SESSION!
  localStorage.setItem('dashy_user_session', JSON.stringify({ 
    email, 
    defaultName, 
    avatarLetter: avatarLetter || defaultName[0].toUpperCase() 
  }));

  const savedUsername = localStorage.getItem("dashy_username_" + email);
  if (savedUsername) {
    State.currentUser = { name: savedUsername, email, avatar: savedUsername[0].toUpperCase() };
  } else {
    State.currentUser = { name: defaultName, email, avatar: avatarLetter };
  }
  
  // 🔥 ALWAYS call enterChatApp after setting State.currentUser
  enterChatApp();
}

function saveUsername() {
  const input = document.getElementById("username-setup-input");
  if (!input) return;
  const username = input.value.trim();
  if (!username) return showError("Please enter a username.");
  if (username.length < 2) return showError("Username must be at least 2 characters.");
  if (username.length > 20) return showError("Username must be 20 characters or less.");
  if (!/^[a-zA-Z0-9\s_-]+$/.test(username)) return showError("Username can only contain letters, numbers, spaces, _ and -");

  // 🔥 UPDATE SESSION WITH USERNAME!
  const session = JSON.parse(localStorage.getItem('dashy_user_session') || '{}');
  session.defaultName = username;
  localStorage.setItem('dashy_user_session', JSON.stringify(session));

  localStorage.setItem("dashy_username_" + State.currentUser.email, username);
  State.currentUser.name = username;
  State.currentUser.avatar = username[0].toUpperCase();
  enterChatApp();
}

function resetUsername() {
  if (!State.currentUser) return;
  if (!confirm("Reset your username? You'll be asked to set a new one.")) return;
  localStorage.removeItem("dashy_username_" + State.currentUser.email);
  showScreen("screen-username");
  setTimeout(() => {
    const input = document.getElementById("username-setup-input");
    if (input) { input.value = ""; input.focus(); }
  }, 100);
}

function enterChatApp() {
  showScreen("screen-chat");
  renderUserInSidebar();
  
  // 🔥 Load saved chats!
  const hasSavedChats = loadChatsFromStorage();
  
  if (hasSavedChats && State.chats.length > 0) {
    renderSidebarChatList();
    renderActiveChat();
    updateMessageDisplay();
  } else {
    startNewChat();
  }
}

function renderUserInSidebar() {
  const u = State.currentUser;
  if (!u) return;
  
  const nameEl = document.getElementById("sidebar-user-name");
  const emailEl = document.getElementById("sidebar-user-email");
  const avatarEl = document.getElementById("sidebar-user-avatar");
  
  if (nameEl) {
    // 👑 Check if EMAIL is admin!
    if (ADMINS.includes(u.email)) {
      nameEl.textContent = `${u.name} 👑`;
      nameEl.style.color = "#fbbf24";
    } else {
      nameEl.textContent = u.name;
      nameEl.style.color = "";
    }
  }
  
  if (emailEl) emailEl.textContent = u.email;
  if (avatarEl) avatarEl.textContent = u.avatar;

  const greet = document.getElementById("empty-state-greeting");
  if (greet) {
    const h = new Date().getHours();
    let s = "Hello";
    if (h < 12) s = "Good morning";
    else if (h < 18) s = "Good afternoon";
    else s = "Good evening";
    greet.textContent = `${s}, ${u.name}`;
  }
}

function logout() {
  if (!confirm("Log out?")) return;
  State.currentUser = null;
  State.chats = [];
  State.currentChatId = null;
  showScreen("screen-login");
}

/* ==========================================================================
   SIDEBAR
   ========================================================================== */
function toggleSidebar() {
  const sidebar = document.getElementById("chat-sidebar");
  if (sidebar) sidebar.classList.toggle("collapsed");
}

function filterChats(query) {
  const lower = (query || "").toLowerCase().trim();
  const list = document.getElementById("sidebar-chat-list");
  if (!list) return;
  list.querySelectorAll(".sidebar-chat-item").forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = (lower === "" || text.includes(lower)) ? "" : "none";
  });
}

function clearAllChats() {
  if (!confirm("Delete all chats? This cannot be undone.")) return;
  State.chats = [];
  State.currentChatId = null;
  localStorage.removeItem('dashy_chats_data');
  startNewChat();
}

/* ==========================================================================
   CHAT MANAGEMENT
   ========================================================================== */
function startNewChat() {
  const chat = { id: "chat_" + Date.now(), title: "New Chat", messages: [] };
  State.chats.unshift(chat);
  State.currentChatId = chat.id;
  renderSidebarChatList();
  renderActiveChat();
  saveChatsToStorage();
}

function renderSidebarChatList() {
  const list = document.getElementById("sidebar-chat-list");
  const count = document.getElementById("sidebar-chat-count");
  const empty = document.getElementById("sidebar-empty-state");
  if (!list) return;
  list.innerHTML = "";
  if (count) count.textContent = State.chats.length;
  if (empty) {
    const allEmpty = State.chats.length === 0 ||
      (State.chats.length === 1 && State.chats[0].messages.length === 0);
    empty.classList.toggle("show", allEmpty);
  }
  State.chats.forEach(c => {
    const item = document.createElement("div");
    item.className = "sidebar-chat-item" + (c.id === State.currentChatId ? " active" : "");
    const title = document.createElement("div");
    title.className = "sidebar-chat-item-title";
    title.textContent = c.title;
    const time = document.createElement("div");
    time.className = "sidebar-chat-item-time";
    const ts = parseInt(c.id.replace("chat_", ""), 10) || Date.now();
    time.textContent = formatRelativeTime(ts);
    item.appendChild(title);
    item.appendChild(time);
    item.addEventListener("click", () => switchToChat(c.id));
    list.appendChild(item);
  });
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60) return "Just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString();
}

function switchToChat(id) {
  State.currentChatId = id;
  renderSidebarChatList();
  renderActiveChat();
  saveChatsToStorage();
}

function getCurrentChat() {
  return State.chats.find(c => c.id === State.currentChatId);
}

function renderActiveChat() {
  const chat = getCurrentChat();
  const area = document.getElementById("chat-messages-area");
  const empty = document.getElementById("chat-empty-state");
  const title = document.getElementById("chat-current-title");
  if (!area || !chat) return;
  if (title) title.textContent = chat.title;
  area.innerHTML = "";
  if (chat.messages.length === 0) {
    if (empty) { area.appendChild(empty); empty.style.display = "flex"; }
    renderUserInSidebar();
  } else {
    chat.messages.forEach(m => renderMessageBubble(m));
  }
}

/* ==========================================================================
   ATTACHMENTS
   ========================================================================== */
function handleFileAttachment(event) {
  const files = Array.from(event.target.files || []);
  files.forEach(f => addAttachment(f));
  event.target.value = "";
}

function addAttachment(file) {
  if (file.size > 20 * 1024 * 1024) return showError(`File "${file.name}" exceeds 20MB limit.`);
  const reader = new FileReader();
  reader.onload = (e) => {
    const attachment = {
      id: "att_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      name: file.name, type: file.type, size: file.size,
      isImage: file.type.startsWith("image/"),
      dataUrl: e.target.result,
      base64: e.target.result.split(",")[1] || ""
    };
    State.pendingAttachments.push(attachment);
    renderAttachmentPreviews();
  };
  reader.onerror = () => showError("Failed to read file: " + file.name);
  reader.readAsDataURL(file);
}

function renderAttachmentPreviews() {
  const row = document.getElementById("attachment-preview-row");
  if (!row) return;
  row.innerHTML = "";
  State.pendingAttachments.forEach(a => {
    const chip = document.createElement("div");
    chip.className = "attachment-preview-chip";
    chip.innerHTML = a.isImage
      ? `<img class="attachment-preview-thumb" src="${a.dataUrl}" alt="">
         <span class="attachment-preview-name">${escapeHtml(a.name)}</span>
         <button class="attachment-preview-remove" onclick="removeAttachment('${a.id}')">✕</button>`
      : `<span style="font-size:1.1rem;">📄</span>
         <span class="attachment-preview-name">${escapeHtml(a.name)}</span>
         <button class="attachment-preview-remove" onclick="removeAttachment('${a.id}')">✕</button>`;
    row.appendChild(chip);
  });
}

function removeAttachment(id) {
  State.pendingAttachments = State.pendingAttachments.filter(a => a.id !== id);
  renderAttachmentPreviews();
}

window.addEventListener("paste", (e) => {
  if (!document.getElementById("screen-chat").classList.contains("active-screen")) return;
  const items = (e.clipboardData || {}).items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) addAttachment(file);
    }
  }
});

window.addEventListener("dragover", (e) => { e.preventDefault(); });
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!document.getElementById("screen-chat").classList.contains("active-screen")) return;
  const files = Array.from(e.dataTransfer.files || []);
  files.forEach(f => addAttachment(f));
});

// ============================================================
//  SEND MESSAGE — With Shift+Enter support!
// ============================================================

document.addEventListener('DOMContentLoaded', function() {
  const input = document.getElementById('chat-text-input');
  if (input) {
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage(e);
      }
      // Shift+Enter = new line (default behavior — we do nothing!)
    });
  }
});

function sendMessage(event) {
  if (event) event.preventDefault();
  try {
    if (isPaused) {
      showError('⏸️ Responses are paused. Click "▶️ Resume" to continue.');
      return;
    }
    if (State.isResponding) return;
    const inputEl = document.getElementById("chat-text-input");
    const text = inputEl.value;
    if (!text.trim() && State.pendingAttachments.length === 0) return;

    const chat = getCurrentChat();
    if (!chat) return showError("No active chat.");

    const empty = document.getElementById("chat-empty-state");
    if (empty) empty.style.display = "none";

    const attachments = [...State.pendingAttachments];

    const userMsg = {
      id: generateMsgId(),
      author: State.currentUser.name,
      role: "user",
      text: text,
      avatar: State.currentUser.avatar,
      attachments
    };
    chat.messages.push(userMsg);
    renderMessageBubble(userMsg);
    saveChatsToStorage(); 
    if (chat.messages.length === 1) {
      chat.title = text.length > 0
        ? (text.length > 30 ? text.substring(0, 30) + "..." : text)
        : "Image chat";
      renderSidebarChatList();
      document.getElementById("chat-current-title").textContent = chat.title;
    }

    inputEl.value = "";
    State.pendingAttachments = [];
    renderAttachmentPreviews();

    const lower = text.toLowerCase();
    const isImageRequest = /\b(generate|create|draw|make|render)\b.*\b(image|picture|photo|art|illustration|drawing)\b/i.test(lower)
      || lower.startsWith("/imagine ")
      || lower.startsWith("imagine ");

    if (isImageRequest) {
      handleImageGeneration(text, chat);
    } else {
      handleTextGeneration(text, chat, attachments);
    }
  } catch (err) {
    showError("Send failed: " + err.message);
  }
}

/* ==========================================================================
   SPEEDGEN — IMAGE GENERATION
   ========================================================================== */
function handleImageGeneration(prompt, chat) {
  State.isResponding = true;
  const sendBtn = document.getElementById("chat-send-btn");
  if (sendBtn) sendBtn.disabled = true;

  let cleanPrompt = prompt
    .replace(/^(\/imagine\s+|imagine\s+)/i, "")
    .replace(/^.*?(generate|create|draw|make|render)(\s+an?\s+|\s+)(image|picture|photo|art|illustration|drawing)(\s+of\s+|\s+)?/i, "")
    .trim();

  if (!cleanPrompt) cleanPrompt = prompt;

  const isHQ = State.currentModel === "dash-complexity";
  const dimension = isHQ ? 768 : 512;
  const seed = Math.floor(Math.random() * 1000000);

  const finalPrompt = isHQ
    ? `${cleanPrompt}, ultra detailed, masterpiece, professional, cinematic lighting, sharp focus, high quality`
    : cleanPrompt;

  const url = `${SPEEDGEN_ENDPOINT}${encodeURIComponent(finalPrompt)}?width=${dimension}&height=${dimension}&seed=${seed}&nologo=true&model=flux`;

  const aiMsg = {
    id: generateMsgId(),
    author: "DashyCore",
    role: "ai",
    text: `Generating image through SpeedGen: "${cleanPrompt}"`,
    avatar: "D",
    imageUrl: null,
    imagePrompt: cleanPrompt,
    imageLoading: true,
    originalPrompt: prompt,
    modelUsed: getDashConfig(State.currentModel).displayName
  };
  chat.messages.push(aiMsg);
  const bubble = renderMessageBubble(aiMsg);

  fetch(url)
    .then(response => {
      if (!response.ok) throw new Error("SpeedGen returned " + response.status);
      return response.blob();
    })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      aiMsg.imageUrl = objectUrl;
      aiMsg.imageLoading = false;
      aiMsg.text = `Here's your ${isHQ ? "HQ " : ""}image of "${cleanPrompt}":`;
      reRenderMessage(aiMsg);
      speakResponse(aiMsg.text);
      scrollToBottom();
    })
    .catch(err => {
      aiMsg.imageLoading = false;
      aiMsg.text = `⚠️ SpeedGen couldn't generate this image: ${err.message}. Try again with a different prompt.`;
      reRenderMessage(aiMsg);
    })
    .finally(() => {
      State.isResponding = false;
      if (sendBtn) sendBtn.disabled = false;
    });
}

/* ==========================================================================
   TEXT GENERATION
   ========================================================================== */
async function handleTextGeneration(prompt, chat, attachments) {
  State.isResponding = true;
  const sendBtn = document.getElementById("chat-send-btn");
  if (sendBtn) sendBtn.disabled = true;

  const aiMsg = {
    id: generateMsgId(),
    author: "DashyCore",
    role: "ai",
    text: "",
    avatar: "D",
    originalPrompt: prompt,
    originalAttachments: attachments,
    modelUsed: getDashConfig(State.currentModel).displayName
  };
  chat.messages.push(aiMsg);
  const bubble = renderMessageBubble(aiMsg);
  const textEl = bubble.querySelector(".message-text");
  textEl.classList.add("ai-typing");

  try {
    let responseText = await callGroqAPI(prompt, chat, attachments);
    await streamText(responseText, aiMsg, textEl);
    aiMsg.text = responseText;
    reRenderMessage(aiMsg);
    speakResponse(responseText);
    saveChatsToStorage();
  } catch (err) {
    aiMsg.text = `⚠️ Error: ${err.message}`;
    textEl.innerHTML = formatMessageContent(aiMsg.text);
    reRenderMessage(aiMsg);
  } finally {
    textEl.classList.remove("ai-typing");
    State.isResponding = false;
    if (sendBtn) sendBtn.disabled = false;
  }
}

/* ==========================================================================
   GROQ API CALLER
   ========================================================================== */
async function callGroqAPI(prompt, chat, attachments) {
  const config = getDashConfig(State.currentModel);
  
  const history = chat.messages.slice(-11, -1).map(m => ({
    role: m.role === "user" ? "user" : "assistant",
    text: m.text || ""
  }));

  const body = {
    model: config.backendModel,
    messages: [...history, { role: "user", text: prompt }],
    systemInstruction: config.systemInstruction
  };

  if (attachments && attachments.length > 0) {
    body.attachments = attachments.map(a => ({
      name: a.name,
      type: a.type,
      isImage: a.isImage,
      data: a.base64 || a.dataUrl
    }));
  }

  const url = GEMINI_ENDPOINT;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errorData = await res.text();
    throw new Error(`API error: ${res.status} - ${errorData}`);
  }

  const data = await res.json();
  
  if (data.loading) {
    throw new Error("⏳ Model is loading. Please wait 10-15 seconds and try again.");
  }
  
  if (!data.success) {
    throw new Error(data.error || "Unknown error from AI service.");
  }

  return data.text || "No response received.";
}

/* ==========================================================================
   STREAMING + FORMATTING
   ========================================================================== */
function streamText(fullText, aiMsg, textEl) {
  return new Promise(resolve => {
    let i = 0;
    const chunkSize = 4;
    const interval = setInterval(() => {
      if (i < fullText.length) {
        i = Math.min(i + chunkSize, fullText.length);
        aiMsg.text = fullText.substring(0, i);
        textEl.innerHTML = formatMessageContent(aiMsg.text);
        scrollToBottom();
        saveChatsToStorage();
      } else {
        clearInterval(interval);
        textEl.innerHTML = formatMessageContent(fullText);
        resolve();
      }
    }, 14);
  });
}

function formatMessageContent(text) {
  if (!text) return "";
  let html = escapeHtml(text);

  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (m, lang, code) => {
    const language = lang || "code";
    const escapedCode = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const codeId = "code_" + Math.random().toString(36).substr(2, 9);
    return `<div class="code-block-wrapper">
      <div class="code-block-header">
        <span class="code-block-lang">${language}</span>
        <button class="code-block-copy" onclick="copyCodeBlock('${codeId}', this)">Copy</button>
      </div>
      <pre class="code-block-content" id="${codeId}">${escapedCode}</pre>
    </div>`;
  });

  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  html = html.replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  html = html.replace(/\n/g, "<br>");

  return html;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyCodeBlock(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  
  let text = el.textContent;
  text = text.split('\n').map(line => line.trim()).join('\n');
  text = text.replace(/\n{3,}/g, '\n\n');
  
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = "✓ Copied";
    btn.classList.add("copied");
    setTimeout(() => { 
      btn.textContent = "Copy"; 
      btn.classList.remove("copied"); 
    }, 1800);
  }).catch(() => showError("Could not copy to clipboard."));
}

/* ==========================================================================
   RENDER MESSAGE BUBBLE
   ========================================================================== */
function renderMessageBubble(msg) {
  const area = document.getElementById("chat-messages-area");
  if (!area) return null;
  const bubble = buildMessageBubbleNode(msg);
  area.appendChild(bubble);
  scrollToBottom();
  return bubble;
}

function reRenderMessage(msg) {
  const area = document.getElementById("chat-messages-area");
  if (!area || !msg.id) return;
  const oldBubble = area.querySelector(`[data-msg-id="${msg.id}"]`);
  if (!oldBubble) return;
  const newBubble = buildMessageBubbleNode(msg);
  oldBubble.replaceWith(newBubble);
}

function buildMessageBubbleNode(msg) {
  const bubble = document.createElement("div");
  bubble.className = "chat-message";
  bubble.dataset.msgId = msg.id;

  const avatar = document.createElement("div");
  avatar.className = "message-avatar " + (msg.role === "user" ? "user-avatar" : "ai-avatar");
  avatar.textContent = msg.avatar;

  const content = document.createElement("div");
  content.className = "message-content";

  const authorRow = document.createElement("div");
  authorRow.className = "message-author-row";
  const author = document.createElement("div");
  author.className = "message-author";
  author.textContent = msg.author;
  authorRow.appendChild(author);
  if (msg.role === "ai" && msg.modelUsed) {
    const badge = document.createElement("span");
    badge.className = "message-model-badge";
    badge.textContent = msg.modelUsed;
    authorRow.appendChild(badge);
  }
  content.appendChild(authorRow);

  if (msg.attachments && msg.attachments.length > 0) {
    const attRow = document.createElement("div");
    attRow.className = "message-attachments";
    msg.attachments.forEach(a => {
      if (a.isImage) {
        const img = document.createElement("img");
        img.className = "message-attachment-thumb";
        img.src = a.dataUrl; img.alt = a.name;
        attRow.appendChild(img);
      } else {
        const file = document.createElement("div");
        file.className = "message-attachment-file";
        file.innerHTML = `<span class="message-attachment-file-icon">📄</span><span>${escapeHtml(a.name)}</span>`;
        attRow.appendChild(file);
      }
    });
    content.appendChild(attRow);
  }

  const textEl = document.createElement("div");
  textEl.className = "message-text";
  textEl.innerHTML = formatMessageContent(msg.text);
  content.appendChild(textEl);

  if (msg.imageUrl && !msg.imageLoading) {
    const wrap = document.createElement("div");
    wrap.className = "generated-image-wrap";
    const img = document.createElement("img");
    img.src = msg.imageUrl;
    img.alt = msg.imagePrompt || "Generated image";
    wrap.appendChild(img);
    content.appendChild(wrap);
  } else if (msg.imageLoading) {
    const wrap = document.createElement("div");
    wrap.className = "generated-image-wrap";
    const overlay = document.createElement("div");
    overlay.className = "generated-image-loading-overlay";
    overlay.innerHTML = `
      <div class="speedgen-badge">⚡ SpeedGen</div>
      <span class="image-spinner"></span>
      <span class="speedgen-loading-text">Rendering your image...</span>
    `;
    wrap.appendChild(overlay);
    content.appendChild(wrap);
  }

  const actionBar = buildActionBar(msg);
  if (actionBar) content.appendChild(actionBar);

  bubble.appendChild(avatar);
  bubble.appendChild(content);
  return bubble;
}

/* ==========================================================================
   ACTION BAR
   ========================================================================== */
function buildActionBar(msg) {
  if (msg.imageLoading) return null;
  if (msg.role === "ai" && (!msg.text || msg.text.length === 0)) return null;

  const bar = document.createElement("div");
  bar.className = "message-action-bar";

  if (msg.role === "user") {
    bar.appendChild(makeActionBtn("📋", "Copy prompt", () => {
      navigator.clipboard.writeText(msg.text || "").then(() => {
        showSuccess("Prompt copied!");
      }).catch(() => showError("Couldn't copy."));
    }));
  } else {
    bar.appendChild(makeActionBtn("📋", "Copy response", () => {
      navigator.clipboard.writeText(msg.text || "").then(() => {
        showSuccess("Response copied!");
      }).catch(() => showError("Couldn't copy."));
    }));

    const d1 = document.createElement("div");
    d1.className = "msg-action-divider";
    bar.appendChild(d1);

    bar.appendChild(makeActionBtn("👍", "Helpful", (btn) => {
      const wasActive = btn.classList.contains("active-like");
      bar.querySelectorAll(".msg-action-btn").forEach(b => {
        b.classList.remove("active-like", "active-dislike");
      });
      if (!wasActive) {
        btn.classList.add("active-like");
        msg.feedback = "like";
        saveFeedback(msg, "like");
        showSuccess("Thanks for your feedback! 👍");
      } else {
        msg.feedback = null;
      }
    }, msg.feedback === "like" ? "active-like" : ""));

    bar.appendChild(makeActionBtn("👎", "Not helpful", (btn) => {
      const wasActive = btn.classList.contains("active-dislike");
      bar.querySelectorAll(".msg-action-btn").forEach(b => {
        b.classList.remove("active-like", "active-dislike");
      });
      if (!wasActive) {
        btn.classList.add("active-dislike");
        msg.feedback = "dislike";
        saveFeedback(msg, "dislike");
        showSuccess("Got it — we'll keep improving 👎");
      } else {
        msg.feedback = null;
      }
    }, msg.feedback === "dislike" ? "active-dislike" : ""));

    bar.appendChild(makeActionBtn("🚩", "Report", () => {
      openReportModal(msg.id);
    }, msg.reported ? "active-report" : ""));

    const d2 = document.createElement("div");
    d2.className = "msg-action-divider";
    bar.appendChild(d2);

    bar.appendChild(makeActionBtn("🔄", "Regenerate", () => {
      regenerateResponse(msg);
    }));
  }

  return bar;
}

function makeActionBtn(iconText, tooltip, onClick, extraClass = "") {
  const btn = document.createElement("button");
  btn.className = "msg-action-btn msg-action-tooltip " + extraClass;
  btn.setAttribute("data-tooltip", tooltip);
  btn.innerHTML = `<span>${iconText}</span>`;
  btn.addEventListener("click", () => onClick(btn));
  return btn;
}

/* ==========================================================================
   FEEDBACK STORAGE
   ========================================================================== */
function saveFeedback(msg, type) {
  try {
    const stored = JSON.parse(localStorage.getItem("dashy_feedback") || "[]");
    stored.push({
      msgId: msg.id,
      type: type,
      model: State.currentModel,
      prompt: msg.originalPrompt || "",
      response: (msg.text || "").substring(0, 500),
      user: State.currentUser?.email || "anonymous",
      timestamp: Date.now()
    });
    if (stored.length > 500) stored.splice(0, stored.length - 500);
    localStorage.setItem("dashy_feedback", JSON.stringify(stored));
    sendFeedbackToSheets(type, msg.text || "", State.currentUser?.email || "anonymous");
  } catch (e) {
    console.warn("Couldn't save feedback:", e);
  }
}

function saveReport(msg, reason, details) {
  try {
    const stored = JSON.parse(localStorage.getItem("dashy_reports") || "[]");
    stored.push({
      msgId: msg.id,
      reason: reason,
      details: details || "",
      model: State.currentModel,
      prompt: msg.originalPrompt || "",
      response: (msg.text || "").substring(0, 1000),
      user: State.currentUser?.email || "anonymous",
      timestamp: Date.now()
    });
    if (stored.length > 200) stored.splice(0, stored.length - 200);
    localStorage.setItem("dashy_reports", JSON.stringify(stored));
    sendFeedbackToSheets("report", `Reason: ${reason}\nDetails: ${details || "N/A"}\nResponse: ${(msg.text || "").substring(0, 300)}`, State.currentUser?.email || "anonymous");
  } catch (e) {
    console.warn("Couldn't save report:", e);
  }
}

/* ==========================================================================
   GOOGLE SHEETS FEEDBACK
   ========================================================================== */
async function sendFeedbackToSheets(type, message, user) {
  try {
    await fetch("https://script.google.com/macros/s/AKfycbxIurZwk3xLvmmIQJpvXxm5_hnMdYyd_p57eTja5ittPCgeNr_i99FoZ_gE7EI_ztNbbw/exec", {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, message, user })
    });
  } catch (e) {
    console.warn("Couldn't send feedback to Sheets:", e);
  }
}

/* ==========================================================================
   REPORT
   ========================================================================== */
function openReportModal(msgId) {
  State.pendingReportMsgId = msgId;
  const radios = document.querySelectorAll("input[name='report-reason']");
  radios.forEach(r => r.checked = false);
  const details = document.getElementById("report-details");
  if (details) details.value = "";
  openModal("modal-report");
}

function submitReport() {
  const selected = document.querySelector("input[name='report-reason']:checked");
  if (!selected) return showError("Please select a reason.");

  const detailsEl = document.getElementById("report-details");
  const details = detailsEl ? detailsEl.value.trim() : "";

  const chat = getCurrentChat();
  if (!chat || !State.pendingReportMsgId) {
    closeAllModals();
    return showError("Couldn't submit report.");
  }
  const msg = chat.messages.find(m => m.id === State.pendingReportMsgId);
  if (msg) {
    saveReport(msg, selected.value, details);
    msg.reported = true;
    reRenderMessage(msg);
  }
  closeAllModals();
  showSuccess("Report submitted. Thank you for helping improve DashyCore 🚩");
}

/* ==========================================================================
   REGENERATE
   ========================================================================== */
async function regenerateResponse(msg) {
  if (State.isResponding) return showError("Wait for current response to finish.");
  const chat = getCurrentChat();
  if (!chat) return;
  if (!msg.originalPrompt && !msg.imagePrompt) return showError("Can't regenerate this response.");

  const msgIndex = chat.messages.findIndex(m => m.id === msg.id);
  if (msgIndex === -1) return;
  chat.messages.splice(msgIndex, 1);

  const bubble = document.querySelector(`[data-msg-id="${msg.id}"]`);
  if (bubble) bubble.remove();

  if (msg.imagePrompt) {
    handleImageGeneration(msg.originalPrompt || msg.imagePrompt, chat);
  } else {
    handleTextGeneration(msg.originalPrompt, chat, msg.originalAttachments || []);
  }
}

/* ==========================================================================
   MODEL / THEME
   ========================================================================== */
function changeModel(v) { State.currentModel = v; }
function changeTheme(v) {
  State.currentTheme = v;
  const r = document.documentElement;
  if (v === "cyan") {
    r.style.setProperty("--accent-primary", "#00ffcc");
    r.style.setProperty("--accent-secondary", "#00d2ff");
    r.style.setProperty("--bg-base", "#040d14");
  } else if (v === "amber") {
    r.style.setProperty("--accent-primary", "#fbbf24");
    r.style.setProperty("--accent-secondary", "#f59e0b");
    r.style.setProperty("--bg-base", "#0a0805");
  } else {
    r.style.setProperty("--accent-primary", "#00d2ff");
    r.style.setProperty("--accent-secondary", "#a476bb");
    r.style.setProperty("--bg-base", "#07090f");
  }
}

/* ==========================================================================
   EXPORT CHAT
   ========================================================================== */

function exportChat() {
  const chat = getCurrentChat();
  if (!chat || chat.messages.length === 0) {
    return showError("No messages to export.");
  }
  
  let text = `═══════════════════════════════════════════════════════\n`;
  text += `         🗿 DASHYCORE — CHAT EXPORT\n`;
  text += `═══════════════════════════════════════════════════════\n\n`;
  text += `📅 Exported: ${new Date().toLocaleString()}\n`;
  text += `🤖 Model: ${State.currentModel}\n`;
  text += `👤 User: ${State.currentUser?.name || "Anonymous"}\n`;
  text += `📨 Total Messages: ${chat.messages.length}\n\n`;
  text += `───────────────────────────────────────────────────────\n\n`;
  
  chat.messages.forEach((m, index) => {
    const role = m.role === "user" ? "👤 You" : "🤖 DashyCore";
    text += `${role}:\n${m.text}\n\n`;
    if (index < chat.messages.length - 1) {
      text += `───────────────────────────────────────────────────────\n\n`;
    }
  });
  
  text += `\n═══════════════════════════════════════════════════════\n`;
  text += `         🗿 Export complete — DashyCore AI\n`;
  text += `═══════════════════════════════════════════════════════\n`;
  
  // FIX: Use Blob with proper encoding for mobile
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  
  // FIX: For mobile, use FileSaver or create a download link properly
  if (navigator.share) {
    // Use Web Share API on mobile
    const file = new File([text], `DashyCore_Chat_${new Date().toISOString().slice(0,10)}.txt`, { type: 'text/plain' });
    navigator.share({
      title: 'DashyCore Chat Export',
      files: [file]
    }).then(() => {
      showSuccess("📤 Chat shared!");
    }).catch(() => {
      // Fallback to download
      downloadFile(text);
    });
  } else {
    downloadFile(text);
  }
}

function downloadFile(text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `DashyCore_Chat_${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showSuccess("📥 Chat exported successfully!");
}

/* ==========================================================================
   PAUSE RESPONSE TOGGLE
   ========================================================================== */

function togglePause() {
  isPaused = !isPaused;
  const btn = document.getElementById('pause-toggle-btn');
  if (isPaused) {
    btn.innerHTML = '<span class="util-icon">▶️</span> Resume Responses';
    btn.style.color = '#fbbf24';
    btn.style.background = 'rgba(251, 191, 36, 0.12)';
    btn.classList.add('active');
    showSuccess('⏸️ Responses PAUSED');
  } else {
    btn.innerHTML = '<span class="util-icon">⏸️</span> Pause Responses';
    btn.style.color = '';
    btn.style.background = '';
    btn.classList.remove('active');
    showSuccess('▶️ Responses RESUMED');
  }
}

/* ==========================================================================
   TEXT-TO-SPEECH — 15 VOICES! (FIXED)
   ========================================================================== */
let availableVoices = [];

// Load voices when they're available
window.speechSynthesis.onvoiceschanged = () => {
  availableVoices = window.speechSynthesis.getVoices();
  console.log('🔊 Voices loaded:', availableVoices.length);
};

// Preload voices
setTimeout(() => {
  availableVoices = window.speechSynthesis.getVoices();
  console.log('🔊 Voices loaded (timeout):', availableVoices.length);
}, 1000);

function changeVoice(voiceName) {
  selectedVoice = voiceName;
  showSuccess(`🔊 Voice changed to: ${voiceName}`);
}

function toggleVoice() {
  isVoiceMode = !isVoiceMode;
  const btn = document.getElementById('voice-toggle-btn');
  if (isVoiceMode) {
    btn.style.color = '#00ffcc';
    btn.style.background = 'rgba(0, 255, 204, 0.15)';
    btn.classList.add('active');
    showSuccess('🔊 Voice mode ON — AI will speak responses!');
  } else {
    btn.style.color = '';
    btn.style.background = '';
    btn.classList.remove('active');
    showSuccess('🔇 Voice mode OFF');
  }
}

function speakResponse(text) {
  if (!isVoiceMode) return;
  
  if (!('speechSynthesis' in window)) {
    return showError("Text-to-speech not supported in this browser.");
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.9;
  utterance.pitch = 1;

  // Get the latest voices
  const voices = window.speechSynthesis.getVoices();
  
  if (selectedVoice !== "default") {
    // Try to find the exact voice by name
    const matchedVoice = voices.find(v => v.name === selectedVoice);
    if (matchedVoice) {
      utterance.voice = matchedVoice;
    } else {
      // Try partial match
      const fallback = voices.find(v => 
        v.name.toLowerCase().includes(selectedVoice.toLowerCase()) || 
        selectedVoice.toLowerCase().includes(v.name.toLowerCase())
      );
      if (fallback) utterance.voice = fallback;
    }
  }
  
  // If still no voice, use the first available
  if (!utterance.voice && voices.length > 0) {
    utterance.voice = voices[0];
  }

  utterance.onerror = (e) => {
    console.error('🔊 Speech error:', e);
  };

  window.speechSynthesis.speak(utterance);
}

// Preload voices
window.speechSynthesis.onvoiceschanged = () => {
  console.log('🔊 Voices loaded:', window.speechSynthesis.getVoices().length);
};

setTimeout(() => {
  window.speechSynthesis.getVoices();
}, 1000);

/* ==========================================================================
   TOASTS
   ========================================================================== */
function showError(msg) {
  console.log("[Dashy ERROR]", msg);
  showToast(msg, "error");
}
function showSuccess(msg) {
  console.log("[Dashy]", msg);
  showToast(msg, "success");
}
function showToast(msg, type = "error") {
  const existing = document.querySelector(".error-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.className = "error-toast" + (type === "success" ? " success" : "");
  const iconColor = type === "success" ? "var(--accent-success)" : "var(--accent-danger)";
  const icon = type === "success" ? "✓" : "⚠";
  t.innerHTML = `<span style="color: ${iconColor};">${icon}</span><span>${escapeHtml(msg)}</span>`;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.transition = "opacity 0.3s, transform 0.3s";
    t.style.opacity = "0";
    t.style.transform = "translateX(-50%) translateY(10px)";
    setTimeout(() => t.remove(), 320);
  }, 3500);
}

window.addEventListener("error", e => showError("Error: " + (e.message || "Unknown")));

/* ==========================================================================
   USERNAME SYSTEM — Unique usernames!
   ========================================================================== */

function isUsernameTaken(username) {
  // Get all registered usernames from localStorage
  const users = JSON.parse(localStorage.getItem('dashy_users') || '[]');
  return users.includes(username);
}

function registerUsername(username) {
  const users = JSON.parse(localStorage.getItem('dashy_users') || '[]');
  users.push(username);
  localStorage.setItem('dashy_users', JSON.stringify(users));
}

/* ==========================================================================
   MESSAGE LIMIT DISPLAY
   ========================================================================== */

function updateMessageDisplay() {
  const user = State.currentUser;
  if (!user) return;
  
  const used = getUserMessageCount();
  const limit = getUserLimit();
  const remaining = limit - used;
  
  let display = document.getElementById("message-limit-display");
  if (!display) {
    display = document.createElement("div");
    display.id = "message-limit-display";
    display.className = "sidebar-message-limit";
    
    const footer = document.querySelector(".sidebar-footer");
    if (footer) {
      footer.insertBefore(display, footer.firstChild);
    }
  }
  
  // 👑 ADMIN BADGE!
  if (ADMINS.includes(user.email)) {
    display.innerHTML = `👑 <span style="color: #fbbf24; font-weight: 700;">ADMIN — Unlimited Messages!</span>`;
    display.style.borderColor = "#fbbf24";
    display.style.background = "rgba(251, 191, 36, 0.1)";
    return;
  }
  
  // Normal users
  if (remaining <= 0) {
    display.innerHTML = `🚫 <span style="color: var(--accent-danger)">No messages left!</span>`;
    display.style.color = "var(--accent-danger)";
  } else if (remaining <= 5) {
    display.innerHTML = `📨 <span style="color: var(--accent-warning)">${remaining} messages left</span>`;
  } else {
    display.innerHTML = `📨 ${remaining} messages left`;
  }
}
