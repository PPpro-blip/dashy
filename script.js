"use strict";

/* ==========================================================================
   DASHYCORE v5 — PRODUCTION JAVASCRIPT
   Built by Pratham Pandey
   
   Architecture:
   01. Configuration & Constants
   02. State Management
   03. Model Definitions
   04. Utility Functions
   05. Screen System
   06. Toast Notifications
   07. Modal System
   08. Authentication
   09. Sidebar
   10. Chat Management
   11. File Attachments
   12. Message Rendering
   13. Markdown & Formatting
   14. Text Generation
   15. Image Generation
   16. Action Bar
   17. Feedback & Reports
   18. Voice Input
   19. Settings
   20. Theme System
   21. Keyboard Shortcuts
   22. PWA Install
   23. App Boot
   ========================================================================== */


/* ==========================================================================
   01. CONFIGURATION & CONSTANTS
   ========================================================================== */

/**
 * ╔══════════════════════════════════════════════════╗
 * ║  CLOUDFLARE WORKER ENDPOINT                      ║
 * ║  Set this to your deployed Worker URL            ║
 * ║  The Worker proxies requests to Groq/OpenRouter  ║
 * ╚══════════════════════════════════════════════════╝
 */
const WORKER_ENDPOINT = "https://your-worker.your-subdomain.workers.dev";

/**
 * Image generation — Pollinations AI
 * Users never see "Pollinations" — it's branded as SpeedGen
 */
const SPEEDGEN_ENDPOINT = "https://image.pollinations.ai/prompt/";

/** Maximum file attachment size (20 MB) */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;

/** Maximum chat history turns sent to the API */
const MAX_HISTORY_TURNS = 10;

/** Streaming chunk size (characters per interval tick) */
const STREAM_CHUNK_SIZE = 6;

/** Streaming interval (ms) — lower = faster */
const STREAM_INTERVAL_MS = 12;

/** Toast auto-dismiss duration (ms) */
const TOAST_DURATION_MS = 3600;

/** Local storage keys */
const LS = {
  USERNAME:  (email) => `dashy_username_${email}`,
  THEME:     "dashy_theme",
  MODEL:     "dashy_model",
  FONT_SIZE: "dashy_font_size",
  FEEDBACK:  "dashy_feedback",
  REPORTS:   "dashy_reports",
  SETTINGS:  "dashy_settings",
};


/* ==========================================================================
   02. STATE MANAGEMENT
   ========================================================================== */

/** Central application state — treat as a single source of truth */
const State = {
  /** @type {{ name: string, email: string, avatar: string } | null} */
  currentUser: null,

  /** @type {string | null} Active chat ID */
  currentChatId: null,

  /** @type {Chat[]} All chats in memory */
  chats: [],

  /** @type {string} Active model key */
  currentModel: "dash-allround",

  /** @type {string} Active theme */
  currentTheme: "dark",

  /** @type {boolean} Whether AI is currently generating */
  isResponding: false,

  /** @type {Attachment[]} Files waiting to be sent */
  pendingAttachments: [],

  /** @type {string | null} Message ID pending report */
  pendingReportMsgId: null,

  /** @type {boolean} Sidebar open on mobile */
  sidebarOpen: false,

  /** @type {boolean} Voice input active */
  voiceActive: false,

  /** @type {SpeechRecognition | null} */
  recognition: null,

  /** @type {boolean} PWA install prompt available */
  installPromptAvailable: false,

  /** @type {BeforeInstallPromptEvent | null} */
  installPrompt: null,
};

/**
 * @typedef {{ id: string, title: string, messages: Message[], pinned?: boolean, createdAt: number }} Chat
 * @typedef {{ id: string, author: string, role: 'user'|'ai', text: string, avatar: string, attachments?: Attachment[], imageUrl?: string|null, imagePrompt?: string, imageLoading?: boolean, originalPrompt?: string, originalAttachments?: Attachment[], modelUsed?: string, feedback?: string|null, reported?: boolean, timestamp: number }} Message
 * @typedef {{ id: string, name: string, type: string, size: number, isImage: boolean, dataUrl: string, base64: string }} Attachment
 */


/* ==========================================================================
   03. MODEL DEFINITIONS
   ========================================================================== */

/**
 * DashyCore branded models.
 * Providers (Groq, OpenRouter) are NEVER exposed to users.
 * The backend Worker handles routing.
 */
const DASH_MODELS = {
  "dash-complexity": {
    displayName:   "DASH-Complexity",
    label:         "🧠 DASH-Complexity",
    description:   "Best for reasoning, coding, and large context tasks.",
    backendRoute:  "complexity",   // Worker uses this to select openai/gpt-oss-120b
    systemPrompt:  buildSystemPrompt("DASH-Complexity", [
      "You excel at complex reasoning, multi-step problem solving, and complete code generation.",
      "CRITICAL: Always produce COMPLETE, production-ready code. Never truncate. Include all imports, functions, and error handling.",
      "Use clear markdown formatting with proper code blocks and language tags.",
      "Add helpful inline comments to all code.",
    ]),
    temperature:   0.7,
    maxTokens:     65536,
  },

  "dash-allround": {
    displayName:   "DASH-AllRound",
    label:         "⚡ DASH-AllRound",
    description:   "Balanced general assistant for everyday tasks.",
    backendRoute:  "allround",     // Worker uses this to select llama-3.3-70b-versatile
    systemPrompt:  buildSystemPrompt("DASH-AllRound", [
      "You are a balanced, helpful assistant for conversation, writing, coding, and analysis.",
      "Be friendly, clear, and concise. Use markdown when it improves readability.",
      "When generating code, always provide complete working examples.",
    ]),
    temperature:   0.8,
    maxTokens:     32768,
  },

  "dash-superfast": {
    displayName:   "DASH-SuperFast",
    label:         "🚀 DASH-SuperFast",
    description:   "Instant answers with the lowest latency.",
    backendRoute:  "superfast",    // Worker uses this to select openai/gpt-oss-20b
    systemPrompt:  buildSystemPrompt("DASH-SuperFast", [
      "Optimize for speed. Give direct, concise answers without unnecessary preamble.",
      "Short sentences. Get straight to the point.",
      "Keep code snippets focused and minimal.",
    ]),
    temperature:   0.6,
    maxTokens:     8192,
  },
};

/**
 * Builds a consistent system prompt for all DASH models.
 * @param {string} modelName
 * @param {string[]} capabilities
 * @returns {string}
 */
function buildSystemPrompt(modelName, capabilities) {
  return [
    `You are ${modelName}, an AI model built into DashyCore — Your AI Operating System.`,
    `DashyCore was created by Pratham Pandey (age 12).`,
    `Your image generation engine is called SpeedGen (never mention the underlying provider).`,
    `Never mention or reveal any underlying AI providers, model names, or APIs.`,
    `Never say you are powered by any external company. You are simply ${modelName} by DashyCore.`,
    ``,
    ...capabilities,
  ].join("\n");
}

/**
 * Returns the model config for the given key.
 * Falls back to DASH-AllRound if key is unknown.
 * @param {string} key
 * @returns {typeof DASH_MODELS[keyof typeof DASH_MODELS]}
 */
function getModelConfig(key) {
  return DASH_MODELS[key] || DASH_MODELS["dash-allround"];
}


/* ==========================================================================
   04. UTILITY FUNCTIONS
   ========================================================================== */

/**
 * Generates a unique message ID.
 * @returns {string}
 */
function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Scrolls the messages area to the bottom.
 */
function scrollToBottom() {
  const area = Dom.messagesArea();
  if (area) {
    // requestAnimationFrame ensures DOM has painted
    requestAnimationFrame(() => {
      area.scrollTop = area.scrollHeight;
    });
  }
}

/**
 * Formats a timestamp as a relative time string.
 * @param {number} ts Unix timestamp in ms
 * @returns {string}
 */
function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const sec  = Math.floor(diff / 1000);
  const min  = Math.floor(sec / 60);
  const hr   = Math.floor(min / 60);
  const day  = Math.floor(hr / 24);

  if (sec  <  60) return "Just now";
  if (min  <  60) return `${min}m ago`;
  if (hr   <  24) return `${hr}h ago`;
  if (day  <   7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Formats a timestamp as HH:MM.
 * @param {number} ts
 * @returns {string}
 */
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Escapes HTML special characters.
 * @param {string} s
 * @returns {string}
 */
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#039;");
}

/**
 * Detects whether a prompt is an image generation request.
 * @param {string} text
 * @returns {boolean}
 */
function isImageRequest(text) {
  const lower = text.toLowerCase().trim();
  return (
    /\b(generate|create|draw|make|render|paint|design|produce)\b.*\b(image|picture|photo|art|illustration|drawing|artwork|painting|sketch)\b/i.test(lower) ||
    lower.startsWith("/imagine ") ||
    lower.startsWith("imagine ")
  );
}

/**
 * Extracts the image prompt from a generation request.
 * @param {string} text
 * @returns {string}
 */
function extractImagePrompt(text) {
  return text
    .replace(/^(\/imagine\s+|imagine\s+)/i, "")
    .replace(/^.*?\b(generate|create|draw|make|render|paint|design|produce)\b\s*(?:an?\s*)?(?:image|picture|photo|art|illustration|drawing|artwork|painting|sketch)\s*(?:of\s+)?/i, "")
    .trim() || text;
}

/**
 * Returns a greeting based on the current hour.
 * @param {string} name
 * @returns {string}
 */
function buildGreeting(name) {
  const hour = new Date().getHours();
  let prefix = "Hello";
  if (hour < 5)  prefix = "Up late,";
  else if (hour < 12) prefix = "Good morning,";
  else if (hour < 17) prefix = "Good afternoon,";
  else if (hour < 21) prefix = "Good evening,";
  else prefix = "Good night,";
  return `${prefix} ${name}`;
}

/**
 * Reads a localStorage value safely.
 * @param {string} key
 * @param {*} fallback
 * @returns {*}
 */
function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Writes a value to localStorage safely.
 * @param {string} key
 * @param {*} value
 */
function lsSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn("[DashyCore] localStorage write failed:", e);
  }
}


/* ==========================================================================
   DOM SELECTORS — Cached references
   ========================================================================== */

/**
 * Centralized DOM selectors.
 * Use these instead of raw getElementById throughout the codebase.
 */
const Dom = {
  // Screens
  screenTitle:    () => document.getElementById("screen-title"),
  screenLogin:    () => document.getElementById("screen-login"),
  screenUsername: () => document.getElementById("screen-username"),
  screenChat:     () => document.getElementById("screen-chat"),

  // Auth
  authEmail:      () => document.getElementById("auth-email"),
  authPassword:   () => document.getElementById("auth-password"),
  usernameInput:  () => document.getElementById("username-input"),

  // Sidebar
  sidebar:        () => document.getElementById("sidebar"),
  sidebarBackdrop:() => document.getElementById("sidebar-backdrop"),
  sidebarSearch:  () => document.getElementById("sidebar-search"),
  sidebarChatList:() => document.getElementById("sidebar-chat-list"),
  sidebarPinnedList:() => document.getElementById("sidebar-pinned-list"),
  sidebarPinnedSection:() => document.getElementById("sidebar-pinned-section"),
  sidebarEmpty:   () => document.getElementById("sidebar-empty"),
  sidebarCount:   () => document.getElementById("sidebar-chat-count"),
  sidebarAvatar:  () => document.getElementById("sidebar-avatar"),
  sidebarName:    () => document.getElementById("sidebar-user-name"),
  sidebarEmail:   () => document.getElementById("sidebar-user-email"),

  // Workspace
  topbarTitle:    () => document.getElementById("chat-title"),
  messagesArea:   () => document.getElementById("messages-area"),
  chatEmptyState: () => document.getElementById("chat-empty-state"),
  emptyGreeting:  () => document.getElementById("empty-greeting"),
  modelSelect:    () => document.getElementById("model-select"),
  themeSelect:    () => document.getElementById("theme-select"),
  voiceToggle:    () => document.getElementById("voice-toggle"),
  voiceVisualizer:() => document.getElementById("voice-visualizer"),

  // Input
  chatInput:       () => document.getElementById("chat-input"),
  sendBtn:         () => document.getElementById("send-btn"),
  fileInput:       () => document.getElementById("file-input"),
  attachmentPreview:() => document.getElementById("attachment-preview"),

  // Modals
  modalOverlay:    () => document.getElementById("modal-overlay"),

  // Toast
  toastContainer:  () => document.getElementById("toast-container"),
};


/* ==========================================================================
   05. SCREEN SYSTEM
   ========================================================================== */

/**
 * Activates a screen by ID, deactivating all others.
 * @param {string} id
 */
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.remove("active-screen");
  });
  const target = document.getElementById(id);
  if (target) {
    target.classList.add("active-screen");
  } else {
    console.error(`[DashyCore] Screen not found: ${id}`);
  }
}

function goToTitle() { showScreen("screen-title"); }
function goToLogin() { showScreen("screen-login"); }


/* ==========================================================================
   06. TOAST NOTIFICATIONS
   ========================================================================== */

/**
 * Shows a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 * @param {number} [duration]
 */
function showToast(message, type = "info", duration = TOAST_DURATION_MS) {
  const container = Dom.toastContainer();
  if (!container) return;

  const icons = {
    success: "✓",
    error:   "⚠",
    info:    "ℹ",
    warning: "⚡",
  };

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span class="toast__icon">${icons[type] ?? icons.info}</span>
    <span class="toast__text">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);

  // Auto dismiss
  const dismiss = () => {
    toast.classList.add("toast--out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, duration);

  // Click to dismiss early
  toast.addEventListener("click", () => {
    clearTimeout(timer);
    dismiss();
  });
}

/** Convenience wrappers */
const showSuccess = (msg) => showToast(msg, "success");
const showError   = (msg) => { console.warn("[DashyCore]", msg); showToast(msg, "error"); };
const showInfo    = (msg) => showToast(msg, "info");
const showWarning = (msg) => showToast(msg, "warning");


/* ==========================================================================
   07. MODAL SYSTEM
   ========================================================================== */

/**
 * Opens a modal by ID.
 * @param {string} id
 */
function openModal(id) {
  const overlay = Dom.modalOverlay();
  if (!overlay) return;

  // Deactivate any currently open modal
  overlay.querySelectorAll(".modal.is-active").forEach(m => m.classList.remove("is-active"));

  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");

  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("is-active");
    // Focus first focusable element
    requestAnimationFrame(() => {
      const focusable = modal.querySelector("button, input, select, textarea, [tabindex]");
      if (focusable) focusable.focus();
    });
  }
}

/**
 * Closes all modals. Called on overlay click or Escape.
 * @param {Event} [e]
 */
function closeModal(e) {
  // Only close if clicking directly on the overlay
  if (e && e.target !== Dom.modalOverlay()) return;
  closeAllModals();
}

function closeAllModals() {
  const overlay = Dom.modalOverlay();
  if (!overlay) return;
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  overlay.querySelectorAll(".modal.is-active").forEach(m => m.classList.remove("is-active"));
  State.pendingReportMsgId = null;
}

/**
 * Switches settings tabs.
 * @param {string} panelId Panel suffix (e.g. 'general')
 * @param {HTMLElement} clickedTab
 */
function switchSettingsTab(panelId, clickedTab) {
  // Update tab states
  const tabs = clickedTab.closest("[role='tablist']");
  if (tabs) {
    tabs.querySelectorAll(".settings__tab").forEach(t => {
      t.classList.remove("settings__tab--active");
      t.setAttribute("aria-selected", "false");
    });
    clickedTab.classList.add("settings__tab--active");
    clickedTab.setAttribute("aria-selected", "true");
  }

  // Show/hide panels
  document.querySelectorAll(".settings__panel").forEach(p => {
    p.style.display = "none";
  });

  const target = document.getElementById(`settings-${panelId}`);
  if (target) target.style.display = "flex";
}


/* ==========================================================================
   08. AUTHENTICATION
   ========================================================================== */

/**
 * Initiates Google OAuth login.
 * Calls Firebase Google Auth when integrated.
 */
function loginWithGoogle() {
  // Firebase integration point:
  // firebase.auth().signInWithPopup(new firebase.auth.GoogleAuthProvider())
  //   .then(result => handleUserLogin({
  //     email: result.user.email,
  //     defaultName: result.user.displayName || "User",
  //     avatarLetter: (result.user.displayName || "U")[0].toUpperCase(),
  //   }))
  //   .catch(err => showError(err.message));

  // Demo fallback:
  handleUserLogin({
    email:        "user@gmail.com",
    defaultName:  "Google User",
    avatarLetter: "G",
  });
}

/**
 * Continues as a guest (no account needed).
 */
function loginAsGuest() {
  handleUserLogin({
    email:        "guest@dashy.ai",
    defaultName:  "Guest",
    avatarLetter: "G",
  });
}

/**
 * Signs in with email + password.
 * @param {Event} event
 */
function loginWithEmail(event) {
  if (event) event.preventDefault();

  const email = Dom.authEmail()?.value.trim() ?? "";
  const pass  = Dom.authPassword()?.value.trim() ?? "";

  if (!email) return showError("Please enter your email address.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError("Please enter a valid email address.");
  if (!pass || pass.length < 4) return showError("Password must be at least 4 characters.");

  // Firebase integration point:
  // firebase.auth().signInWithEmailAndPassword(email, pass)
  //   .then(result => handleUserLogin({...}))
  //   .catch(err => showError(err.message));

  // Demo fallback:
  handleUserLogin({
    email,
    defaultName:  email.split("@")[0],
    avatarLetter: email[0].toUpperCase(),
  });
}

/**
 * Handles successful authentication — routes to username setup or main app.
 * @param {{ email: string, defaultName: string, avatarLetter: string }} user
 */
function handleUserLogin({ email, defaultName, avatarLetter }) {
  const savedUsername = lsGet(LS.USERNAME(email));

  if (savedUsername) {
    State.currentUser = {
      name:   savedUsername,
      email,
      avatar: savedUsername[0].toUpperCase(),
    };
    enterWorkspace();
  } else {
    State.currentUser = { name: defaultName, email, avatar: avatarLetter };
    showScreen("screen-username");
    requestAnimationFrame(() => {
      const input = Dom.usernameInput();
      if (input) {
        input.value = defaultName;
        input.focus();
        input.select();
      }
    });
  }
}

/**
 * Saves the chosen username and enters the workspace.
 * @param {Event} event
 */
function saveUsername(event) {
  if (event) event.preventDefault();

  const input    = Dom.usernameInput();
  const username = input?.value.trim() ?? "";

  if (!username)           return showError("Please enter a username.");
  if (username.length < 2) return showError("Username must be at least 2 characters.");
  if (username.length > 20)return showError("Username must be 20 characters or less.");
  if (!/^[a-zA-Z0-9\s_-]+$/.test(username)) {
    return showError("Only letters, numbers, spaces, _ and - are allowed.");
  }

  lsSet(LS.USERNAME(State.currentUser.email), username);
  State.currentUser.name   = username;
  State.currentUser.avatar = username[0].toUpperCase();
  enterWorkspace();
}

/**
 * Clears the saved username and returns to username setup screen.
 */
function resetUsername() {
  if (!State.currentUser) return;
  if (!confirm("Reset your username? You'll choose a new one.")) return;
  lsSet(LS.USERNAME(State.currentUser.email), null);
  localStorage.removeItem(LS.USERNAME(State.currentUser.email));
  showScreen("screen-username");
  requestAnimationFrame(() => {
    const input = Dom.usernameInput();
    if (input) { input.value = ""; input.focus(); }
  });
}

/**
 * Signs out the current user.
 */
function logout() {
  if (!confirm("Sign out of DashyCore?")) return;

  // Firebase integration point:
  // firebase.auth().signOut();

  State.currentUser     = null;
  State.chats           = [];
  State.currentChatId   = null;
  State.pendingAttachments = [];
  showScreen("screen-login");
}

/**
 * Placeholder — triggers sign-up flow.
 */
function showSignUp() {
  showInfo("Sign-up coming soon! Use Google or Guest for now.");
}

/**
 * Enters the main workspace after successful auth.
 */
function enterWorkspace() {
  applyStoredPreferences();
  showScreen("screen-chat");
  renderSidebarUser();
  populateModelSelect();
  populateVoiceOptions();
  startNewChat();
}

/**
 * Applies stored theme, model, and font size preferences.
 */
function applyStoredPreferences() {
  const theme    = lsGet(LS.THEME,     "dark");
  const model    = lsGet(LS.MODEL,     "dash-allround");
  const fontSize = lsGet(LS.FONT_SIZE, "medium");

  changeTheme(theme);
  State.currentModel = DASH_MODELS[model] ? model : "dash-allround";

  // Font size
  const sizes = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.setProperty("--font-size-base", sizes[fontSize] ?? "16px");
}


/* ==========================================================================
   09. SIDEBAR
   ========================================================================== */

/**
 * Toggles the sidebar open/closed.
 */
function toggleSidebar() {
  const sidebar  = Dom.sidebar();
  const backdrop = Dom.sidebarBackdrop();
  if (!sidebar) return;

  const isOpen = !sidebar.classList.contains("is-collapsed");

  if (isOpen) {
    sidebar.classList.add("is-collapsed");
    backdrop?.classList.remove("is-visible");
    State.sidebarOpen = false;
  } else {
    sidebar.classList.remove("is-collapsed");
    backdrop?.classList.add("is-visible");
    State.sidebarOpen = true;
  }
}

/**
 * Renders the user info in the sidebar footer.
 */
function renderSidebarUser() {
  const u = State.currentUser;
  if (!u) return;

  const name   = Dom.sidebarName();
  const email  = Dom.sidebarEmail();
  const avatar = Dom.sidebarAvatar();

  if (name)   name.textContent   = u.name;
  if (email)  email.textContent  = u.email;
  if (avatar) avatar.textContent = u.avatar;

  // Update greeting
  const greeting = Dom.emptyGreeting();
  if (greeting) greeting.textContent = buildGreeting(u.name);
}

/**
 * Filters sidebar chat items by search query.
 * @param {string} query
 */
function filterChats(query) {
  const lower = (query ?? "").toLowerCase().trim();
  Dom.sidebarChatList()?.querySelectorAll(".sidebar__chat-item").forEach(item => {
    const text = item.querySelector(".sidebar__chat-item-title")?.textContent.toLowerCase() ?? "";
    item.style.display = (!lower || text.includes(lower)) ? "" : "none";
  });
}

/**
 * Deletes all chats after confirmation.
 */
function clearAllChats() {
  if (!confirm("Delete all chats? This cannot be undone.")) return;
  State.chats         = [];
  State.currentChatId = null;
  startNewChat();
}

/**
 * Rebuilds the sidebar chat list from State.chats.
 */
function renderSidebarChatList() {
  const list        = Dom.sidebarChatList();
  const pinnedList  = Dom.sidebarPinnedList();
  const pinnedSec   = Dom.sidebarPinnedSection();
  const empty       = Dom.sidebarEmpty();
  const count       = Dom.sidebarCount();

  if (!list) return;

  list.innerHTML = "";
  if (pinnedList) pinnedList.innerHTML = "";

  // Separate pinned vs recent
  const pinned  = State.chats.filter(c => c.pinned);
  const recent  = State.chats.filter(c => !c.pinned);

  // Show/hide pinned section
  if (pinnedSec) pinnedSec.style.display = pinned.length ? "" : "none";

  // Update count badge
  if (count) count.textContent = State.chats.length;

  // Determine if all chats are empty (no messages)
  const hasContent = State.chats.some(c => c.messages.length > 0);
  if (empty) empty.classList.toggle("is-visible", !hasContent);

  // Render pinned
  pinned.forEach(chat => {
    if (pinnedList) pinnedList.appendChild(buildChatItem(chat));
  });

  // Render recent
  recent.forEach(chat => {
    list.appendChild(buildChatItem(chat));
  });
}

/**
 * Builds a sidebar chat item DOM node.
 * @param {Chat} chat
 * @returns {HTMLElement}
 */
function buildChatItem(chat) {
  const item = document.createElement("div");
  item.className = `sidebar__chat-item${chat.id === State.currentChatId ? " is-active" : ""}`;
  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.dataset.chatId = chat.id;

  // Pin icon
  const pinIcon = chat.pinned
    ? `<svg class="sidebar__pin-icon" viewBox="0 0 20 20" width="12" height="12" fill="currentColor">
         <path d="M9.828 3.172a4 4 0 015.656 5.656l-1.06 1.06-.707-.707 1.06-1.06a3 3 0 10-4.243-4.243l-1.06 1.06-.707-.707 1.06-1.06z"/>
       </svg>`
    : "";

  item.innerHTML = `
    <div class="sidebar__chat-item-body">
      <div class="sidebar__chat-item-title">${pinIcon}${escapeHtml(chat.title)}</div>
      <div class="sidebar__chat-item-meta">
        <span>${formatRelativeTime(chat.createdAt)}</span>
      </div>
    </div>
    <div class="sidebar__chat-item-actions">
      <button class="sidebar__chat-action" title="${chat.pinned ? "Unpin" : "Pin"}" data-action="pin" aria-label="Pin chat">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
          <path d="M9.828 3.172a4 4 0 015.656 5.656l-1.06 1.06-.707-.707 1.06-1.06a3 3 0 10-4.243-4.243l-1.06 1.06-.707-.707 1.06-1.06z"/>
        </svg>
      </button>
      <button class="sidebar__chat-action sidebar__chat-action--danger" title="Delete" data-action="delete" aria-label="Delete chat">
        <svg viewBox="0 0 20 20" width="13" height="13" fill="currentColor">
          <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9z" clip-rule="evenodd"/>
        </svg>
      </button>
    </div>
  `;

  // Click to open chat
  item.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "pin")    { togglePinChat(chat.id); return; }
    if (action === "delete") { deleteChat(chat.id); return; }
    switchToChat(chat.id);
    // Auto-close sidebar on mobile
    if (window.innerWidth < 768) toggleSidebar();
  });

  // Keyboard support
  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      switchToChat(chat.id);
    }
  });

  return item;
}

/**
 * Toggles pin state for a chat.
 * @param {string} chatId
 */
function togglePinChat(chatId) {
  const chat = State.chats.find(c => c.id === chatId);
  if (!chat) return;
  chat.pinned = !chat.pinned;
  renderSidebarChatList();
  showSuccess(chat.pinned ? "Chat pinned 📌" : "Chat unpinned");
}

/**
 * Deletes a specific chat.
 * @param {string} chatId
 */
function deleteChat(chatId) {
  if (!confirm("Delete this chat?")) return;
  State.chats = State.chats.filter(c => c.id !== chatId);

  if (State.currentChatId === chatId) {
    if (State.chats.length > 0) {
      switchToChat(State.chats[0].id);
    } else {
      startNewChat();
    }
  } else {
    renderSidebarChatList();
  }
}

/**
 * Populates the model selector dropdown.
 */
function populateModelSelect() {
  const select = Dom.modelSelect();
  if (!select) return;

  select.innerHTML = "";
  Object.entries(DASH_MODELS).forEach(([key, model]) => {
    const opt = document.createElement("option");
    opt.value       = key;
    opt.textContent = model.label;
    opt.selected    = key === State.currentModel;
    select.appendChild(opt);
  });
}


/* ==========================================================================
   10. CHAT MANAGEMENT
   ========================================================================== */

/**
 * Creates a new chat and activates it.
 */
function startNewChat() {
  const chat = {
    id:        generateId("chat"),
    title:     "New Chat",
    messages:  [],
    pinned:    false,
    createdAt: Date.now(),
  };
  State.chats.unshift(chat);
  State.currentChatId = chat.id;
  renderSidebarChatList();
  renderWorkspace();
}

/**
 * Switches the active chat.
 * @param {string} id
 */
function switchToChat(id) {
  State.currentChatId = id;
  renderSidebarChatList();
  renderWorkspace();
}

/**
 * Returns the currently active Chat object.
 * @returns {Chat | undefined}
 */
function getCurrentChat() {
  return State.chats.find(c => c.id === State.currentChatId);
}

/**
 * Re-renders the entire workspace for the active chat.
 */
function renderWorkspace() {
  const chat = getCurrentChat();
  const area  = Dom.messagesArea();
  const title = Dom.topbarTitle();

  if (!area || !chat) return;

  if (title) title.textContent = chat.title;

  // Clear messages area
  area.innerHTML = "";

  if (chat.messages.length === 0) {
    // Show empty state
    const emptyState = Dom.chatEmptyState();
    if (emptyState) {
      area.appendChild(emptyState);
      emptyState.style.display = "";
    }
    renderSidebarUser();
  } else {
    // Render all messages
    chat.messages.forEach(msg => renderMessage(msg, false));
  }

  scrollToBottom();
}

/**
 * Auto-generates a chat title from the first user message.
 * @param {Chat} chat
 * @param {string} firstMessage
 */
function generateChatTitle(chat, firstMessage) {
  chat.title = firstMessage.length > 36
    ? firstMessage.slice(0, 36).trimEnd() + "…"
    : firstMessage || "New Chat";

  const title = Dom.topbarTitle();
  if (title) title.textContent = chat.title;
  renderSidebarChatList();
}

/**
 * Fills the chat input with a suggestion text.
 * @param {string} text
 */
function useSuggestion(text) {
  const input = Dom.chatInput();
  if (!input) return;
  input.value = text;
  input.focus();
  autoResizeTextarea(input);
}

/**
 * Auto-resizes a textarea to fit its content.
 * @param {HTMLTextAreaElement} el
 */
function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}


/* ==========================================================================
   11. FILE ATTACHMENTS
   ========================================================================== */

/**
 * Handles file input change event.
 * @param {Event} event
 */
function handleFileAttachment(event) {
  const files = Array.from(event.target?.files ?? []);
  files.forEach(addAttachment);
  if (event.target) event.target.value = "";
}

/**
 * Reads a File and adds it to pendingAttachments.
 * @param {File} file
 */
function addAttachment(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return showError(`"${file.name}" exceeds the 20 MB limit.`);
  }

  const reader   = new FileReader();
  reader.onload  = (e) => {
    const dataUrl = e.target.result;
    /** @type {Attachment} */
    const attachment = {
      id:      generateId("att"),
      name:    file.name,
      type:    file.type,
      size:    file.size,
      isImage: file.type.startsWith("image/"),
      dataUrl,
      base64:  dataUrl.split(",")[1] ?? "",
    };
    State.pendingAttachments.push(attachment);
    renderAttachmentPreviews();
  };
  reader.onerror = () => showError(`Failed to read "${file.name}".`);
  reader.readAsDataURL(file);
}

/**
 * Removes an attachment by ID.
 * @param {string} id
 */
function removeAttachment(id) {
  State.pendingAttachments = State.pendingAttachments.filter(a => a.id !== id);
  renderAttachmentPreviews();
}

/**
 * Rebuilds the attachment preview strip.
 */
function renderAttachmentPreviews() {
  const row = Dom.attachmentPreview();
  if (!row) return;
  row.innerHTML = "";

  State.pendingAttachments.forEach(att => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";

    if (att.isImage) {
      chip.innerHTML = `
        <img class="attach-chip__thumb" src="${att.dataUrl}" alt="${escapeHtml(att.name)}">
        <span class="attach-chip__name">${escapeHtml(att.name)}</span>
        <button class="attach-chip__remove" onclick="removeAttachment('${att.id}')" aria-label="Remove attachment">✕</button>
      `;
    } else {
      chip.innerHTML = `
        <span class="attach-chip__icon">📄</span>
        <span class="attach-chip__name">${escapeHtml(att.name)}</span>
        <button class="attach-chip__remove" onclick="removeAttachment('${att.id}')" aria-label="Remove attachment">✕</button>
      `;
    }

    row.appendChild(chip);
  });
}

// Paste image from clipboard
window.addEventListener("paste", (e) => {
  const chat = Dom.screenChat();
  if (!chat?.classList.contains("active-screen")) return;

  const items = Array.from(e.clipboardData?.items ?? []);
  const imageItem = items.find(item => item.type.startsWith("image/"));
  if (imageItem) {
    const file = imageItem.getAsFile();
    if (file) addAttachment(file);
  }
});

// Drag-and-drop files
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  const chat = Dom.screenChat();
  if (!chat?.classList.contains("active-screen")) return;
  Array.from(e.dataTransfer?.files ?? []).forEach(addAttachment);
});


/* ==========================================================================
   12. MESSAGE RENDERING
   ========================================================================== */

/**
 * Renders a message bubble and appends it to the messages area.
 * @param {Message} msg
 * @param {boolean} [doScroll=true]
 * @returns {HTMLElement | null}
 */
function renderMessage(msg, doScroll = true) {
  const area = Dom.messagesArea();
  if (!area) return null;

  const bubble = buildMessageNode(msg);
  area.appendChild(bubble);
  if (doScroll) scrollToBottom();
  return bubble;
}

/**
 * Replaces an existing rendered message with a freshly built one.
 * Used after streaming finishes or image loads.
 * @param {Message} msg
 */
function reRenderMessage(msg) {
  const area = Dom.messagesArea();
  if (!area || !msg.id) return;

  const existing = area.querySelector(`[data-msg-id="${msg.id}"]`);
  if (!existing) return;

  const fresh = buildMessageNode(msg);
  existing.replaceWith(fresh);
}

/**
 * Builds a complete message bubble DOM node.
 * @param {Message} msg
 * @returns {HTMLElement}
 */
function buildMessageNode(msg) {
  const isAi   = msg.role === "ai";
  const bubble = document.createElement("div");
  bubble.className = "chat-message";
  bubble.dataset.msgId = msg.id;

  // Avatar
  const avatar = document.createElement("div");
  avatar.className = `message__avatar message__avatar--${isAi ? "ai" : "user"}`;
  avatar.textContent = msg.avatar;
  avatar.setAttribute("aria-hidden", "true");

  // Body
  const body = document.createElement("div");
  body.className = "message__body";

  // Header row
  const header = document.createElement("div");
  header.className = "message__header";

  const authorEl = document.createElement("span");
  authorEl.className = "message__author";
  authorEl.textContent = msg.author;
  header.appendChild(authorEl);

  // Model badge (AI only)
  if (isAi && msg.modelUsed) {
    const badge = document.createElement("span");
    badge.className = "message__model-tag";
    badge.textContent = msg.modelUsed;
    header.appendChild(badge);
  }

  // Timestamp
  const ts = document.createElement("span");
  ts.className = "message__timestamp";
  ts.textContent = formatTime(msg.timestamp);
  header.appendChild(ts);

  body.appendChild(header);

  // Attachments (user messages)
  if (msg.attachments?.length) {
    const attRow = document.createElement("div");
    attRow.className = "message-attachments";
    msg.attachments.forEach(att => {
      if (att.isImage) {
        const img = document.createElement("img");
        img.className = "message-attachment-thumb";
        img.src = att.dataUrl;
        img.alt = att.name;
        attRow.appendChild(img);
      } else {
        const file = document.createElement("div");
        file.className = "message-attachment-file";
        file.innerHTML = `<span class="message-attachment-file-icon">📄</span><span>${escapeHtml(att.name)}</span>`;
        attRow.appendChild(file);
      }
    });
    body.appendChild(attRow);
  }

  // Message text
  const textEl = document.createElement("div");
  textEl.className = "message__text";
  textEl.innerHTML = formatMarkdown(msg.text);
  body.appendChild(textEl);

  // Image output
  if (msg.imageLoading) {
    body.appendChild(buildImageLoading(msg.imagePrompt));
  } else if (msg.imageUrl) {
    body.appendChild(buildImageOutput(msg));
  }

  // Action bar
  if (!msg.imageLoading) {
    const bar = buildActionBar(msg);
    if (bar) body.appendChild(bar);
  }

  bubble.appendChild(avatar);
  bubble.appendChild(body);
  return bubble;
}

/**
 * Builds the image loading skeleton.
 * @param {string} [prompt]
 * @returns {HTMLElement}
 */
function buildImageLoading(prompt) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";

  const loading = document.createElement("div");
  loading.className = "image-loading";
  loading.innerHTML = `
    <span class="image-loading__badge">⚡ SpeedGen</span>
    <div class="image-loading__spinner"></div>
    <p class="image-loading__label">Rendering${prompt ? ` "${escapeHtml(prompt.slice(0, 40))}${prompt.length > 40 ? "…" : ""}"` : " your image"}…</p>
  `;

  wrap.appendChild(loading);
  return wrap;
}

/**
 * Builds the image output with footer actions.
 * @param {Message} msg
 * @returns {HTMLElement}
 */
function buildImageOutput(msg) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";

  const img = document.createElement("img");
  img.src  = msg.imageUrl;
  img.alt  = msg.imagePrompt || "Generated image";
  img.loading = "lazy";
  wrap.appendChild(img);

  // Footer actions
  const footer = document.createElement("div");
  footer.className = "image-footer";

  const dlBtn = document.createElement("button");
  dlBtn.className = "image-footer__btn";
  dlBtn.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd"/></svg> Download`;
  dlBtn.addEventListener("click", () => downloadImage(msg.imageUrl, msg.imagePrompt));

  const regenBtn = document.createElement("button");
  regenBtn.className = "image-footer__btn";
  regenBtn.innerHTML = `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg> Regenerate`;
  regenBtn.addEventListener("click", () => regenerateResponse(msg));

  footer.appendChild(dlBtn);
  footer.appendChild(regenBtn);
  wrap.appendChild(footer);

  return wrap;
}

/**
 * Downloads an image from a URL.
 * @param {string} url
 * @param {string} [prompt]
 */
function downloadImage(url, prompt) {
  const a = document.createElement("a");
  a.href     = url;
  a.download = `dashy-${(prompt ?? "image").slice(0, 24).replace(/\s+/g, "-")}.jpg`;
  a.click();
}


/* ==========================================================================
   13. MARKDOWN & FORMATTING
   ========================================================================== */

/**
 * Converts markdown text to safe HTML.
 * Processes: code blocks, inline code, bold, italic, links, lists, headings, tables, blockquotes.
 * @param {string} text
 * @returns {string}
 */
function formatMarkdown(text) {
  if (!text) return "";

  // Preserve code blocks before escaping
  const codeBlocks = [];
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id    = generateId("code");
    const label = lang || "code";
    const safe  = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    codeBlocks.push({ id, label, safe });
    return `\x00CODEBLOCK_${codeBlocks.length - 1}\x00`;
  });

  // Escape everything else
  processed = escapeHtml(processed);

  // Restore code blocks as rendered HTML
  processed = processed.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_, i) => {
    const { id, label, safe } = codeBlocks[parseInt(i, 10)];
    return `
      <div class="code-block">
        <div class="code-block__header">
          <div class="code-block__dots">
            <span class="code-block__dot"></span>
            <span class="code-block__dot"></span>
            <span class="code-block__dot"></span>
          </div>
          <span class="code-block__lang">${label}</span>
          <button class="code-block__copy" onclick="copyCode('${id}', this)" type="button">Copy</button>
        </div>
        <pre class="code-block__body" id="${id}">${safe.trimEnd()}</pre>
      </div>`;
  });

  // Headings (before bold to avoid conflicts)
  processed = processed.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  processed = processed.replace(/^## (.+)$/gm,  "<h2>$1</h2>");
  processed = processed.replace(/^# (.+)$/gm,   "<h1>$1</h1>");

  // Blockquotes
  processed = processed.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // Horizontal rule
  processed = processed.replace(/^---$/gm, "<hr>");

  // Bold + italic
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g,  "<strong><em>$1</em></strong>");
  processed = processed.replace(/\*\*([^*\n]+)\*\*/g,    "<strong>$1</strong>");
  processed = processed.replace(/\*([^*\n]+)\*/g,        "<em>$1</em>");
  processed = processed.replace(/_([^_\n]+)_/g,          "<em>$1</em>");

  // Strikethrough
  processed = processed.replace(/~~([^~]+)~~/g, "<s>$1</s>");

  // Inline code
  processed = processed.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  // Links (markdown style)
  processed = processed.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Bare URLs
  processed = processed.replace(
    /(?<![">])(https?:\/\/[^\s<"]+)/g,
    '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  // Unordered lists
  processed = processed.replace(/^\s*[-*+] (.+)$/gm, "<li>$1</li>");
  processed = processed.replace(/(<li>.*<\/li>(\n|$))+/g, m => `<ul>${m}</ul>`);

  // Ordered lists
  processed = processed.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

  // Tables (simple: | col | col |)
  processed = formatTables(processed);

  // Line breaks — convert \n to <br> but not inside block elements
  processed = processed.replace(/\n(?!<(?:ul|ol|h[1-3]|blockquote|hr|div|pre))/g, "<br>");

  // Paragraphs — wrap consecutive text lines
  processed = processed
    .split(/(<br>){2,}/)
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .join("<br><br>");

  return processed;
}

/**
 * Converts a markdown table to an HTML table.
 * @param {string} text
 * @returns {string}
 */
function formatTables(text) {
  return text.replace(/((?:\|[^\n]+\|\n)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split("\n");
    if (rows.length < 2) return tableBlock;

    const headerCells = rows[0].split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const bodyRows    = rows.slice(2)
      .map(row => {
        const cells = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");

    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });
}

/**
 * Copies a code block's content to the clipboard.
 * @param {string} id - Element ID of the <pre>
 * @param {HTMLElement} btn
 */
function copyCode(id, btn) {
  const pre = document.getElementById(id);
  if (!pre) return;

  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.textContent = "✓ Copied";
    btn.classList.add("code-block__copy--copied");
    setTimeout(() => {
      btn.textContent = "Copy";
      btn.classList.remove("code-block__copy--copied");
    }, 2000);
  }).catch(() => showError("Could not copy to clipboard."));
}


/* ==========================================================================
   14. TEXT GENERATION
   ========================================================================== */

/**
 * Handles sending a message — routes to image or text generation.
 * @param {Event} event
 */
function sendMessage(event) {
  if (event) event.preventDefault();
  if (State.isResponding) return;

  const input   = Dom.chatInput();
  const rawText = input?.value.trim() ?? "";

  if (!rawText && State.pendingAttachments.length === 0) return;

  const chat = getCurrentChat();
  if (!chat) return showError("No active chat. Start a new one.");

  // Hide empty state
  const emptyState = Dom.chatEmptyState();
  if (emptyState) emptyState.style.display = "none";

  // Snapshot attachments and clear pending
  const attachments = [...State.pendingAttachments];
  State.pendingAttachments = [];
  renderAttachmentPreviews();

  // Build user message
  /** @type {Message} */
  const userMsg = {
    id:          generateId("msg"),
    author:      State.currentUser.name,
    role:        "user",
    text:        rawText,
    avatar:      State.currentUser.avatar,
    attachments,
    timestamp:   Date.now(),
  };

  chat.messages.push(userMsg);
  renderMessage(userMsg);

  // Auto-title the chat on first message
  if (chat.messages.length === 1) {
    generateChatTitle(chat, rawText || (attachments[0]?.name ?? "New Chat"));
  }

  // Clear and reset input
  if (input) {
    input.value = "";
    autoResizeTextarea(input);
    input.focus();
  }

  // Route to correct handler
  if (isImageRequest(rawText)) {
    handleImageGeneration(rawText, chat);
  } else {
    handleTextGeneration(rawText, chat, attachments);
  }
}

/**
 * Calls the Cloudflare Worker and streams the response.
 * @param {string} prompt
 * @param {Chat} chat
 * @param {Attachment[]} attachments
 */
async function handleTextGeneration(prompt, chat, attachments) {
  setResponding(true);

  const config = getModelConfig(State.currentModel);

  /** @type {Message} */
  const aiMsg = {
    id:                  generateId("msg"),
    author:              "DashyCore",
    role:                "ai",
    text:                "",
    avatar:              "D",
    originalPrompt:      prompt,
    originalAttachments: attachments,
    modelUsed:           config.displayName,
    timestamp:           Date.now(),
  };

  chat.messages.push(aiMsg);
  const bubble = renderMessage(aiMsg);
  const textEl = bubble?.querySelector(".message__text");
  if (textEl) textEl.classList.add("message__text--typing");

  try {
    const responseText = await fetchFromWorker(prompt, chat, attachments, config);
    await streamResponseText(responseText, aiMsg, textEl);
    aiMsg.text = responseText;
  } catch (err) {
    aiMsg.text = buildErrorMessage(err);
    if (textEl) textEl.innerHTML = formatMarkdown(aiMsg.text);
  } finally {
    if (textEl) textEl.classList.remove("message__text--typing");
    reRenderMessage(aiMsg);
    setResponding(false);
  }
}

/**
 * Makes a request to the Cloudflare Worker proxy.
 * The Worker handles provider selection based on backendRoute.
 * @param {string} prompt
 * @param {Chat} chat
 * @param {Attachment[]} attachments
 * @param {object} config
 * @returns {Promise<string>}
 */
async function fetchFromWorker(prompt, chat, attachments, config) {
  // Build conversation history (exclude the just-added AI message placeholder)
  const history = chat.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS * 2)
    .filter(m => m.text?.trim())
    .map(m => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

  // Build current user message content
  const userContent = [{ type: "text", text: prompt || "Describe this." }];

  // Attach images if any
  attachments.forEach(att => {
    if (att.isImage && att.base64) {
      userContent.push({
        type:       "image_url",
        image_url:  { url: `data:${att.type};base64,${att.base64}` },
      });
    } else {
      userContent[0].text += `\n\n[Attached: ${att.name} (${att.type})]`;
    }
  });

  const payload = {
    route:        config.backendRoute,
    systemPrompt: config.systemPrompt,
    history,
    message:      userContent,
    temperature:  config.temperature,
    maxTokens:    config.maxTokens,
  };

  const res = await fetch(WORKER_ENDPOINT, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }

  const data = await res.json();
  const text = data?.text ?? data?.content ?? data?.message;
  if (!text) throw new Error("Empty response from DashyCore.");
  return text;
}

/**
 * Simulates a streaming typewriter effect for the AI response.
 * @param {string} fullText
 * @param {Message} aiMsg
 * @param {HTMLElement | null} textEl
 * @returns {Promise<void>}
 */
function streamResponseText(fullText, aiMsg, textEl) {
  return new Promise(resolve => {
    let i = 0;

    const tick = setInterval(() => {
      i = Math.min(i + STREAM_CHUNK_SIZE, fullText.length);
      aiMsg.text = fullText.slice(0, i);
      if (textEl) {
        textEl.innerHTML = formatMarkdown(aiMsg.text);
        scrollToBottom();
      }
      if (i >= fullText.length) {
        clearInterval(tick);
        resolve();
      }
    }, STREAM_INTERVAL_MS);
  });
}

/**
 * Builds a user-friendly error message.
 * @param {Error} err
 * @returns {string}
 */
function buildErrorMessage(err) {
  const base = err?.message ?? "Unknown error";
  return [
    `**Something went wrong:** ${base}`,
    "",
    "**Try:**",
    "- Check your internet connection",
    "- Try a different DASH model",
    "- Start a new chat",
  ].join("\n");
}

/**
 * Sets the responding state and updates UI accordingly.
 * @param {boolean} value
 */
function setResponding(value) {
  State.isResponding = value;
  const btn = Dom.sendBtn();
  if (btn) btn.disabled = value;
}

/**
 * Regenerates an AI response.
 * @param {Message} msg
 */
async function regenerateResponse(msg) {
  if (State.isResponding) return showError("Wait for the current response to finish.");

  const chat = getCurrentChat();
  if (!chat) return;

  // Remove the old AI message
  const idx = chat.messages.findIndex(m => m.id === msg.id);
  if (idx === -1) return;
  chat.messages.splice(idx, 1);

  const bubble = Dom.messagesArea()?.querySelector(`[data-msg-id="${msg.id}"]`);
  bubble?.remove();

  if (msg.imagePrompt || isImageRequest(msg.originalPrompt ?? "")) {
    handleImageGeneration(msg.originalPrompt ?? msg.imagePrompt ?? "", chat);
  } else {
    handleTextGeneration(msg.originalPrompt ?? "", chat, msg.originalAttachments ?? []);
  }
}


/* ==========================================================================
   15. IMAGE GENERATION
   ========================================================================== */

/**
 * Generates an image via SpeedGen (Pollinations).
 * @param {string} prompt Raw user prompt
 * @param {Chat} chat
 */
function handleImageGeneration(prompt, chat) {
  setResponding(true);

  const cleanPrompt = extractImagePrompt(prompt);
  const isHighQuality = State.currentModel === "dash-complexity";
  const dimension = isHighQuality ? 768 : 512;
  const seed = Math.floor(Math.random() * 1_000_000);

  const finalPrompt = isHighQuality
    ? `${cleanPrompt}, ultra detailed, masterpiece, professional, cinematic lighting, 8k`
    : cleanPrompt;

  const url = `${SPEEDGEN_ENDPOINT}${encodeURIComponent(finalPrompt)}?width=${dimension}&height=${dimension}&seed=${seed}&nologo=true&model=flux`;

  /** @type {Message} */
  const aiMsg = {
    id:           generateId("msg"),
    author:       "DashyCore",
    role:         "ai",
    text:         `Generating: *"${cleanPrompt}"*`,
    avatar:       "D",
    imageUrl:     null,
    imagePrompt:  cleanPrompt,
    imageLoading: true,
    originalPrompt: prompt,
    modelUsed:    getModelConfig(State.currentModel).displayName,
    timestamp:    Date.now(),
  };

  chat.messages.push(aiMsg);
  renderMessage(aiMsg);

  fetch(url)
    .then(res => {
      if (!res.ok) throw new Error(`SpeedGen returned ${res.status}`);
      return res.blob();
    })
    .then(blob => {
      aiMsg.imageUrl     = URL.createObjectURL(blob);
      aiMsg.imageLoading = false;
      aiMsg.text         = `Here's your image of *"${cleanPrompt}"*:`;
      reRenderMessage(aiMsg);
      scrollToBottom();
    })
    .catch(err => {
      aiMsg.imageLoading = false;
      aiMsg.text         = `**SpeedGen couldn't render this image:** ${err.message}\n\nTry a different prompt.`;
      reRenderMessage(aiMsg);
      scrollToBottom();
    })
    .finally(() => setResponding(false));
}


/* ==========================================================================
   16. ACTION BAR
   ========================================================================== */

/**
 * Builds the action bar below a message bubble.
 * @param {Message} msg
 * @returns {HTMLElement | null}
 */
function buildActionBar(msg) {
  if (msg.imageLoading) return null;

  const bar = document.createElement("div");
  bar.className = "message__actions";

  if (msg.role === "user") {
    bar.appendChild(makeActionButton("copy",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>`,
      "Copy prompt",
      () => copyToClipboard(msg.text, "Prompt copied!")
    ));
  } else {
    // Copy
    bar.appendChild(makeActionButton("copy",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"/><path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z"/></svg>`,
      "Copy response",
      () => copyToClipboard(msg.text, "Response copied!")
    ));

    // Divider
    bar.appendChild(buildDivider());

    // Like
    const likeBtn = makeActionButton(
      "like",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z"/></svg>`,
      "Helpful",
      (btn) => handleFeedback(msg, "like", btn, bar)
    );
    if (msg.feedback === "like") likeBtn.classList.add("msg-btn--liked");
    bar.appendChild(likeBtn);

    // Dislike
    const dislikeBtn = makeActionButton(
      "dislike",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z"/></svg>`,
      "Not helpful",
      (btn) => handleFeedback(msg, "dislike", btn, bar)
    );
    if (msg.feedback === "dislike") dislikeBtn.classList.add("msg-btn--disliked");
    bar.appendChild(dislikeBtn);

    // Report
    const reportBtn = makeActionButton(
      "report",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M3 6a3 3 0 013-3h10a1 1 0 01.8 1.6L14.25 8l2.55 3.4A1 1 0 0116 13H6a1 1 0 00-1 1v3a1 1 0 11-2 0V6z" clip-rule="evenodd"/></svg>`,
      "Report",
      () => openReportModal(msg.id)
    );
    if (msg.reported) reportBtn.classList.add("msg-btn--reported");
    bar.appendChild(reportBtn);

    // Divider
    bar.appendChild(buildDivider());

    // Regenerate
    bar.appendChild(makeActionButton(
      "regen",
      `<svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor"><path fill-rule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clip-rule="evenodd"/></svg>`,
      "Regenerate",
      () => regenerateResponse(msg)
    ));
  }

  return bar;
}

/**
 * Creates an action button.
 * @param {string} name
 * @param {string} iconSvg
 * @param {string} tooltip
 * @param {(btn: HTMLElement) => void} onClick
 * @returns {HTMLElement}
 */
function makeActionButton(name, iconSvg, tooltip, onClick) {
  const btn = document.createElement("button");
  btn.className = "msg-btn";
  btn.setAttribute("data-tooltip", tooltip);
  btn.setAttribute("aria-label", tooltip);
  btn.setAttribute("type", "button");
  btn.innerHTML = iconSvg;
  btn.addEventListener("click", () => onClick(btn));
  return btn;
}

/**
 * Builds an action bar divider.
 * @returns {HTMLElement}
 */
function buildDivider() {
  const d = document.createElement("div");
  d.className = "msg-divider";
  d.setAttribute("aria-hidden", "true");
  return d;
}

/**
 * Handles thumbs up/down feedback.
 * @param {Message} msg
 * @param {'like'|'dislike'} type
 * @param {HTMLElement} clickedBtn
 * @param {HTMLElement} bar
 */
function handleFeedback(msg, type, clickedBtn, bar) {
  const wasActive = msg.feedback === type;

  // Reset all feedback buttons in this bar
  bar.querySelectorAll(".msg-btn--liked, .msg-btn--disliked").forEach(b => {
    b.classList.remove("msg-btn--liked", "msg-btn--disliked");
  });

  if (wasActive) {
    msg.feedback = null;
  } else {
    msg.feedback = type;
    clickedBtn.classList.add(type === "like" ? "msg-btn--liked" : "msg-btn--disliked");
    saveFeedback(msg, type);
    showSuccess(type === "like" ? "Thanks for the feedback! 👍" : "Got it — we'll keep improving 👎");
  }
}

/**
 * Copies text to clipboard and shows a success toast.
 * @param {string} text
 * @param {string} successMsg
 */
function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text ?? "")
    .then(() => showSuccess(successMsg))
    .catch(() => showError("Could not copy to clipboard."));
}


/* ==========================================================================
   17. FEEDBACK & REPORTS
   ========================================================================== */

/**
 * Persists feedback to localStorage.
 * @param {Message} msg
 * @param {'like'|'dislike'} type
 */
function saveFeedback(msg, type) {
  try {
    const stored = lsGet(LS.FEEDBACK, []);
    stored.push({
      msgId:     msg.id,
      type,
      model:     State.currentModel,
      prompt:    msg.originalPrompt?.slice(0, 300) ?? "",
      response:  msg.text?.slice(0, 500) ?? "",
      user:      State.currentUser?.email ?? "anonymous",
      timestamp: Date.now(),
    });
    // Cap at 500 entries
    lsSet(LS.FEEDBACK, stored.slice(-500));
  } catch (e) {
    console.warn("[DashyCore] Could not save feedback:", e);
  }
}

/**
 * Opens the report modal for a specific message.
 * @param {string} msgId
 */
function openReportModal(msgId) {
  State.pendingReportMsgId = msgId;
  // Reset form
  document.querySelectorAll("input[name='report-reason']").forEach(r => { r.checked = false; });
  const details = document.getElementById("report-details");
  if (details) details.value = "";
  openModal("modal-report");
}

/**
 * Submits the report form.
 */
function submitReport() {
  const selected = document.querySelector("input[name='report-reason']:checked");
  if (!selected) return showError("Please select a reason for reporting.");

  const details = document.getElementById("report-details")?.value.trim() ?? "";
  const chat    = getCurrentChat();

  if (!chat || !State.pendingReportMsgId) {
    closeAllModals();
    return showError("Could not find the message to report.");
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

/**
 * Persists a report to localStorage.
 * @param {Message} msg
 * @param {string} reason
 * @param {string} details
 */
function saveReport(msg, reason, details) {
  try {
    const stored = lsGet(LS.REPORTS, []);
    stored.push({
      msgId:     msg.id,
      reason,
      details:   details.slice(0, 1000),
      model:     State.currentModel,
      prompt:    msg.originalPrompt?.slice(0, 300) ?? "",
      response:  msg.text?.slice(0, 500) ?? "",
      user:      State.currentUser?.email ?? "anonymous",
      timestamp: Date.now(),
    });
    lsSet(LS.REPORTS, stored.slice(-200));
  } catch (e) {
    console.warn("[DashyCore] Could not save report:", e);
  }
}


/* ==========================================================================
   18. VOICE INPUT
   ========================================================================== */

/**
 * Toggles voice input on/off.
 */
function toggleVoiceInput() {
  if (State.voiceActive) {
    stopVoiceInput();
  } else {
    startVoiceInput();
  }
}

/**
 * Starts speech recognition.
 */
function startVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    return showError("Voice input is not supported in this browser. Try Chrome or Edge.");
  }

  const rec = new SpeechRecognition();
  rec.continuous      = false;
  rec.interimResults  = true;
  rec.lang            = "en-US";

  rec.onstart = () => {
    State.voiceActive = true;
    State.recognition = rec;
    Dom.voiceToggle()?.classList.add("is-active");
    showVoiceVisualizer(true);
  };

  rec.onresult = (e) => {
    const transcript = Array.from(e.results)
      .map(r => r[0].transcript)
      .join("");
    const input = Dom.chatInput();
    if (input) {
      input.value = transcript;
      autoResizeTextarea(input);
    }
  };

  rec.onerror = (e) => {
    console.warn("[DashyCore] Voice error:", e.error);
    stopVoiceInput();
    if (e.error === "not-allowed") {
      showError("Microphone permission denied. Enable it in browser settings.");
    } else {
      showError(`Voice error: ${e.error}`);
    }
  };

  rec.onend = () => stopVoiceInput();

  try {
    rec.start();
  } catch (e) {
    showError("Could not start voice input: " + e.message);
  }
}

/**
 * Stops speech recognition.
 */
function stopVoiceInput() {
  State.recognition?.stop();
  State.recognition = null;
  State.voiceActive = false;
  Dom.voiceToggle()?.classList.remove("is-active");
  showVoiceVisualizer(false);
}

/**
 * Shows or hides the voice visualizer.
 * @param {boolean} show
 */
function showVoiceVisualizer(show) {
  const vis = Dom.voiceVisualizer();
  if (vis) vis.style.display = show ? "flex" : "none";
}

/**
 * Populates TTS voice options in settings.
 */
function populateVoiceOptions() {
  const select = document.getElementById("settings-tts-voice");
  if (!select || !window.speechSynthesis) return;

  const populate = () => {
    const voices = window.speechSynthesis.getVoices();
    select.innerHTML = '<option value="default">System Default</option>';
    voices.forEach((voice, i) => {
      const opt = document.createElement("option");
      opt.value       = i;
      opt.textContent = `${voice.name} (${voice.lang})`;
      select.appendChild(opt);
    });
  };

  window.speechSynthesis.onvoiceschanged = populate;
  populate();
}

/**
 * Reads text aloud using TTS.
 * @param {string} text
 */
function speakText(text) {
  const enabled = document.getElementById("settings-tts-enabled")?.checked;
  if (!enabled || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, "").slice(0, 1000));
  const rateEl = document.getElementById("settings-speech-rate");
  utt.rate  = parseFloat(rateEl?.value ?? "1");

  const voiceEl = document.getElementById("settings-tts-voice");
  const voiceIdx = parseInt(voiceEl?.value ?? "default", 10);
  if (!isNaN(voiceIdx)) {
    utt.voice = window.speechSynthesis.getVoices()[voiceIdx] ?? null;
  }

  window.speechSynthesis.speak(utt);
}


/* ==========================================================================
   19. SETTINGS
   ========================================================================== */

/**
 * Updates the display name from settings.
 */
function updateDisplayName() {
  const input    = document.getElementById("settings-name");
  const username = input?.value.trim() ?? "";
  if (!username || username.length < 2) return showError("Name must be at least 2 characters.");

  State.currentUser.name   = username;
  State.currentUser.avatar = username[0].toUpperCase();
  lsSet(LS.USERNAME(State.currentUser.email), username);
  renderSidebarUser();
  showSuccess("Display name updated!");
}

/**
 * Sets the default model preference.
 * @param {string} value
 */
function setDefaultModel(value) {
  if (DASH_MODELS[value]) {
    State.currentModel = value;
    lsSet(LS.MODEL, value);
    // Sync main model select
    const sel = Dom.modelSelect();
    if (sel) sel.value = value;
  }
}

/**
 * Changes the UI font size.
 * @param {string} size 'small'|'medium'|'large'
 */
function changeFontSize(size) {
  const map = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.setProperty("--font-size-base", map[size] ?? "16px");
  lsSet(LS.FONT_SIZE, size);
}

/**
 * Updates speech rate display value.
 */
function updateSpeechRateDisplay() {
  const slider = document.getElementById("settings-speech-rate");
  const label  = document.getElementById("speech-rate-value");
  if (slider && label) label.textContent = `${parseFloat(slider.value).toFixed(1)}x`;
}

/**
 * Exports all user data as a JSON file download.
 */
function exportAllData() {
  const data = {
    version:   "5.0",
    exportedAt: new Date().toISOString(),
    user:       State.currentUser,
    chats:      State.chats,
    settings: {
      model:    State.currentModel,
      theme:    State.currentTheme,
      fontSize: lsGet(LS.FONT_SIZE, "medium"),
    },
    feedback: lsGet(LS.FEEDBACK, []),
    reports:  lsGet(LS.REPORTS, []),
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `dashycore-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showSuccess("Data exported successfully!");
}

/**
 * Deletes all local data after confirmation.
 */
function deleteAllData() {
  if (!confirm("Delete ALL data permanently? This cannot be undone.")) return;

  try {
    [LS.FEEDBACK, LS.REPORTS, LS.SETTINGS, LS.THEME, LS.MODEL, LS.FONT_SIZE].forEach(k => {
      localStorage.removeItem(k);
    });
    if (State.currentUser) {
      localStorage.removeItem(LS.USERNAME(State.currentUser.email));
    }
  } catch (e) {
    console.warn("[DashyCore] Could not clear storage:", e);
  }

  State.chats  = [];
  State.currentChatId = null;
  closeAllModals();
  showSuccess("All data deleted.");
  setTimeout(() => logout(), 800);
}


/* ==========================================================================
   20. THEME SYSTEM
   ========================================================================== */

/**
 * Applies a theme by setting data-theme on <html>.
 * CSS handles the rest via [data-theme="x"] selectors.
 * @param {string} theme
 */
function changeTheme(theme) {
  const valid = ["dark", "light", "midnight", "cyber", "nord", "glass"];
  const chosen = valid.includes(theme) ? theme : "dark";

  document.documentElement.setAttribute("data-theme", chosen);
  State.currentTheme = chosen;
  lsSet(LS.THEME, chosen);

  // Sync theme selects
  const topbarSel   = Dom.themeSelect();
  const settingsSel = document.getElementById("settings-default-theme");
  if (topbarSel)   topbarSel.value   = chosen;
  if (settingsSel) settingsSel.value = chosen;

  // Highlight active theme card in settings
  document.querySelectorAll(".settings__theme-card").forEach(card => {
    card.classList.toggle("is-active", card.dataset.theme === chosen);
  });

  // PWA theme-color meta
  const meta = document.querySelector("meta[name='theme-color']");
  const colors = {
    dark:     "#07090f",
    light:    "#f5f7fa",
    midnight: "#0d1117",
    cyber:    "#080818",
    nord:     "#2e3440",
    glass:    "#0c0c14",
  };
  if (meta) meta.content = colors[chosen] ?? "#07090f";
}

/**
 * Handles model change from topbar select.
 * @param {string} value
 */
function changeModel(value) {
  if (DASH_MODELS[value]) {
    State.currentModel = value;
    lsSet(LS.MODEL, value);
  }
}


/* ==========================================================================
   21. KEYBOARD SHORTCUTS
   ========================================================================== */

/**
 * Registers all global keyboard shortcuts.
 */
function initKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    // Escape — close modals / stop voice
    if (e.key === "Escape") {
      closeAllModals();
      if (State.voiceActive) stopVoiceInput();
      return;
    }

    // ⌘K — focus search
    if (mod && e.key === "k") {
      e.preventDefault();
      const search = Dom.sidebarSearch();
      if (search) {
        if (Dom.sidebar()?.classList.contains("is-collapsed")) toggleSidebar();
        search.focus();
        search.select();
      }
      return;
    }

    // ⌘B — toggle sidebar
    if (mod && e.key === "b") {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // ⌘Shift+O — new chat
    if (mod && e.shiftKey && e.key === "O") {
      e.preventDefault();
      startNewChat();
      Dom.chatInput()?.focus();
      return;
    }

    // ⌘, — open settings
    if (mod && e.key === ",") {
      e.preventDefault();
      openModal("modal-settings");
      return;
    }

    // ⌘Shift+V — voice input
    if (mod && e.shiftKey && e.key === "V") {
      e.preventDefault();
      toggleVoiceInput();
      return;
    }

    // Enter in chat input — send (Shift+Enter = new line)
    if (e.key === "Enter" && !e.shiftKey) {
      const activeEl = document.activeElement;
      const input    = Dom.chatInput();
      const enterSend = document.getElementById("settings-enter-send")?.checked ?? true;

      if (activeEl === input && enterSend) {
        e.preventDefault();
        sendMessage(null);
      }
    }
  });
}

/**
 * Auto-resize textarea on input.
 */
function initTextareaAutoResize() {
  const input = Dom.chatInput();
  if (!input) return;
  input.addEventListener("input", () => autoResizeTextarea(input));
}


/* ==========================================================================
   22. PWA INSTALL
   ========================================================================== */

/**
 * Captures the beforeinstallprompt event for later use.
 */
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  State.installPrompt          = e;
  State.installPromptAvailable = true;
});

/**
 * Triggers the PWA install prompt.
 */
function triggerPwaInstall() {
  if (!State.installPrompt) {
    return showInfo("DashyCore is already installed or your browser doesn't support install.");
  }
  State.installPrompt.prompt();
  State.installPrompt.userChoice.then(result => {
    if (result.outcome === "accepted") {
      showSuccess("DashyCore installed! 🎉");
      State.installPrompt = null;
    }
  });
}

/**
 * Registers the Service Worker for offline support.
 */
function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js")
    .then(reg => console.log("[SW] Registered:", reg.scope))
    .catch(err => console.warn("[SW] Registration failed:", err));
}


/* ==========================================================================
   23. APP BOOT
   ========================================================================== */

/**
 * Entry point — called on DOMContentLoaded.
 */
function initApp() {
  try {
    // Show title screen
    showScreen("screen-title");

    // Auto-advance to login after loading animation
    setTimeout(() => {
      if (Dom.screenTitle()?.classList.contains("active-screen")) {
        goToLogin();
      }
    }, 2600);

    // Wire up dynamic form events
    initTextareaAutoResize();
    initKeyboardShortcuts();

    // Speech rate display
    document.getElementById("settings-speech-rate")?.addEventListener("input", updateSpeechRateDisplay);

    // Settings: Enter-to-send persistence
    document.getElementById("settings-enter-send")?.addEventListener("change", (e) => {
      lsSet("dashy_enter_send", e.target.checked);
    });

    // Register service worker
    registerServiceWorker();

    console.log("[DashyCore] v5.0 initialized ✓");
  } catch (err) {
    console.error("[DashyCore] Boot error:", err);
    showError("DashyCore failed to initialize. Please refresh.");
  }
}

// Global error handler
window.addEventListener("error", (e) => {
  console.error("[DashyCore] Uncaught error:", e.error);
  showError("An unexpected error occurred.");
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[DashyCore] Unhandled promise rejection:", e.reason);
  showError("An unexpected error occurred.");
});

// Boot
document.addEventListener("DOMContentLoaded", initApp);