"use strict";

/* ==========================================================================
   DASHYCORE v5.1 — PRODUCTION JAVASCRIPT
   Built by Pratham Pandey

   Architecture:
   01. Firebase Configuration & Init
   02. Configuration & Constants
   03. State Management
   04. Model Definitions
   05. Utility Functions
   06. DOM Selectors
   07. Screen System
   08. Toast Notifications
   09. Modal System
   10. Firebase Authentication
   11. Username Setup
   12. Sidebar
   13. Chat Management
   14. File Attachments
   15. Message Rendering
   16. Markdown & Formatting
   17. Cloudflare Worker Integration
   18. Text Generation
   19. Image Generation (SpeedGen)
   20. Action Bar
   21. Feedback & Reports
   22. Voice Input
   23. Settings
   24. Theme System
   25. Model Dropdown
   26. Keyboard Shortcuts
   27. PWA Install
   28. App Boot
   ========================================================================== */


/* ==========================================================================
   01. FIREBASE CONFIGURATION & INIT
   ========================================================================== */

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBPk4AMBV8MVBUqQVHAcYJfIh1CAhg8WXY",
  authDomain:        "dashycore.firebaseapp.com",
  projectId:         "dashycore",
  storageBucket:     "dashycore.firebasestorage.app",
  messagingSenderId: "288311687386",
  appId:             "1:288311687386:web:7a74c8097f0541b1e48de3",
  measurementId:     "G-6KC8RXVWEV",
};

/** @type {firebase.app.App} */
let firebaseApp;
/** @type {firebase.auth.Auth} */
let firebaseAuth;
/** @type {firebase.auth.GoogleAuthProvider} */
let googleProvider;

/**
 * Initializes Firebase services.
 * Uses compat SDK loaded via <script> tags in index.html.
 */
function initFirebase() {
  try {
    if (typeof firebase === "undefined") {
      console.warn("[DashyCore] Firebase SDK not loaded — running in offline/demo mode.");
      return;
    }

    firebaseApp  = firebase.initializeApp(FIREBASE_CONFIG);
    firebaseAuth = firebase.auth();
    googleProvider = new firebase.auth.GoogleAuthProvider();
    googleProvider.addScope("email");
    googleProvider.addScope("profile");

    // Persistent sessions across tabs
    firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // Analytics (non-blocking)
    if (firebase.analytics) {
      firebase.analytics();
    }

    // Listen for auth state changes (auto-login on refresh)
    firebaseAuth.onAuthStateChanged(handleAuthStateChange);

    console.log("[DashyCore] Firebase initialized ✓");
  } catch (err) {
    console.error("[DashyCore] Firebase init error:", err);
  }
}

/**
 * Handles Firebase auth state changes.
 * Auto-logs user in if session exists.
 * @param {firebase.User | null} user
 */
function handleAuthStateChange(user) {
  if (user && !State.currentUser) {
    // User is signed in from a previous session
    handleUserLogin({
      email:        user.email || "user@dashy.ai",
      defaultName:  user.displayName || user.email?.split("@")[0] || "User",
      avatarLetter: (user.displayName || user.email || "U")[0].toUpperCase(),
      photoURL:     user.photoURL || null,
      uid:          user.uid,
    });
  }
}

/**
 * Returns whether Firebase Auth is available.
 * @returns {boolean}
 */
function isFirebaseReady() {
  return typeof firebase !== "undefined" && !!firebaseAuth;
}


/* ==========================================================================
   02. CONFIGURATION & CONSTANTS
   ========================================================================== */

/**
 * Cloudflare Worker endpoint.
 * The Worker proxies to OpenRouter / Groq — providers stay hidden.
 */
const WORKER_ENDPOINT = "https://dashy-flow-state.kamleshprathampandey.workers.dev";

/** Image generation (SpeedGen branding) */
const SPEEDGEN_ENDPOINT = "https://image.pollinations.ai/prompt/";

/** Limits */
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_HISTORY_TURNS   = 10;

/** Streaming */
const STREAM_CHUNK_SIZE = 6;
const STREAM_INTERVAL_MS = 12;

/** Toast */
const TOAST_DURATION_MS = 3600;

/** LocalStorage keys */
const LS = Object.freeze({
  USERNAME:   (email) => `dashy_username_${email}`,
  THEME:      "dashy_theme",
  MODEL:      "dashy_model",
  FONT_SIZE:  "dashy_font_size",
  FEEDBACK:   "dashy_feedback",
  REPORTS:    "dashy_reports",
  ENTER_SEND: "dashy_enter_send",
  AUTH_MODE:  "dashy_auth_mode",
});

/** Valid themes */
const VALID_THEMES = ["dark", "light", "midnight", "cyber", "nord", "glass"];

/** Theme → meta theme-color mapping */
const THEME_COLORS = {
  dark:     "#07090f",
  light:    "#f4f6f9",
  midnight: "#0d1117",
  cyber:    "#080818",
  nord:     "#2e3440",
  glass:    "#0b0b12",
};


/* ==========================================================================
   03. STATE MANAGEMENT
   ========================================================================== */

const State = {
  /** @type {{ name: string, email: string, avatar: string, uid?: string, photoURL?: string } | null} */
  currentUser: null,

  /** @type {string | null} */
  currentChatId: null,

  /** @type {Array<{id: string, title: string, messages: Array, pinned: boolean, createdAt: number}>} */
  chats: [],

  /** @type {string} */
  currentModel: "dash-allround",

  /** @type {string} */
  currentTheme: "dark",

  /** @type {boolean} */
  isResponding: false,

  /** @type {Array} */
  pendingAttachments: [],

  /** @type {string | null} */
  pendingReportMsgId: null,

  /** @type {boolean} */
  sidebarOpen: false,

  /** @type {boolean} */
  voiceActive: false,

  /** @type {SpeechRecognition | null} */
  recognition: null,

  /** @type {boolean} */
  installPromptAvailable: false,

  /** @type {Event | null} */
  installPrompt: null,

  /** @type {boolean} auth mode: true = sign up, false = sign in */
  isSignUpMode: false,

  /** @type {number | null} active stream interval ID for stop button */
  activeStreamInterval: null,

  /** @type {AbortController | null} */
  activeAbortController: null,

  /** @type {Array<string>} generated image URLs for gallery */
  generatedImages: [],
};


/* ==========================================================================
   04. MODEL DEFINITIONS
   ========================================================================== */

/**
 * Maps DashyCore model keys to backend config.
 * Provider names NEVER leak to the user.
 *
 * Worker routing:
 *   - "complexity" → OpenRouter (openai/gpt-oss-120b)
 *   - "allround"   → Groq (llama-3.3-70b-versatile) via direct Groq, OR OpenRouter fallback
 *   - "superfast"  → OpenRouter (openai/gpt-oss-20b)
 */
const DASH_MODELS = {
  "dash-complexity": {
    displayName:  "DASH-Complexity",
    label:        "DASH-Complexity",
    description:  "Best for reasoning, coding, and large context tasks.",
    icon:         "brain",
    // OpenRouter model identifier — used in Worker payload
    openRouterModel: "openai/gpt-oss-120b",
    systemPrompt: buildSystemPrompt("DASH-Complexity", [
      "You excel at complex reasoning, multi-step problem solving, and complete code generation.",
      "CRITICAL: Always produce COMPLETE, production-ready code. Never truncate.",
      "Include all imports, functions, and error handling.",
      "Use clear markdown formatting with proper code blocks and language tags.",
      "Add helpful inline comments to all code.",
    ]),
    temperature: 0.7,
    maxTokens:   65536,
  },

  "dash-allround": {
    displayName:  "DASH-AllRound",
    label:        "DASH-AllRound",
    description:  "Balanced general assistant for everyday tasks.",
    icon:         "zap",
    openRouterModel: "meta-llama/llama-3.3-70b-instruct",
    systemPrompt: buildSystemPrompt("DASH-AllRound", [
      "You are a balanced, helpful assistant for conversation, writing, coding, and analysis.",
      "Be friendly, clear, and concise. Use markdown when it improves readability.",
      "When generating code, always provide complete working examples.",
    ]),
    temperature: 0.8,
    maxTokens:   32768,
  },

  "dash-superfast": {
    displayName:  "DASH-SuperFast",
    label:        "DASH-SuperFast",
    description:  "Instant answers with the lowest latency.",
    icon:         "rocket",
    openRouterModel: "openai/gpt-oss-20b",
    systemPrompt: buildSystemPrompt("DASH-SuperFast", [
      "Optimize for speed. Give direct, concise answers without unnecessary preamble.",
      "Short sentences. Get straight to the point.",
      "Keep code snippets focused and minimal.",
    ]),
    temperature: 0.6,
    maxTokens:   8192,
  },
};

function buildSystemPrompt(modelName, capabilities) {
  return [
    `You are ${modelName}, an AI model built into DashyCore — Your AI Operating System.`,
    `DashyCore was created by Pratham Pandey (age 12).`,
    `Your image generation engine is called SpeedGen.`,
    `Never mention or reveal any underlying AI providers, model names, or APIs.`,
    `Never say you are powered by any external company. You are ${modelName} by DashyCore.`,
    ``,
    ...capabilities,
  ].join("\n");
}

function getModelConfig(key) {
  return DASH_MODELS[key] || DASH_MODELS["dash-allround"];
}


/* ==========================================================================
   05. UTILITY FUNCTIONS
   ========================================================================== */

function generateId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function scrollToBottom() {
  const area = Dom.messagesArea();
  if (area) requestAnimationFrame(() => { area.scrollTop = area.scrollHeight; });
}

function formatRelativeTime(ts) {
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (sec < 60)  return "Just now";
  if (min < 60)  return `${min}m ago`;
  if (hr  < 24)  return `${hr}h ago`;
  if (day < 7)   return `${day}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function isImageRequest(text) {
  const lower = text.toLowerCase().trim();
  return (
    /\b(generate|create|draw|make|render|paint|design|produce)\b.*\b(image|picture|photo|art|illustration|drawing|artwork|painting|sketch)\b/i.test(lower) ||
    lower.startsWith("/imagine ") ||
    lower.startsWith("imagine ")
  );
}

function extractImagePrompt(text) {
  return text
    .replace(/^(\/imagine\s+|imagine\s+)/i, "")
    .replace(/^.*?\b(generate|create|draw|make|render|paint|design|produce)\b\s*(?:an?\s*)?(?:image|picture|photo|art|illustration|drawing|artwork|painting|sketch)\s*(?:of\s+)?/i, "")
    .trim() || text;
}

function buildGreeting(name) {
  const h = new Date().getHours();
  if (h < 5)  return `Up late, ${name}`;
  if (h < 12) return `Good morning, ${name}`;
  if (h < 17) return `Good afternoon, ${name}`;
  if (h < 21) return `Good evening, ${name}`;
  return `Good night, ${name}`;
}

function lsGet(key, fallback = null) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? JSON.parse(val) : fallback;
  } catch { return fallback; }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch (e) { console.warn("[DashyCore] localStorage write failed:", e); }
}

/** Re-initialize Lucide icons for dynamically added elements */
function refreshIcons() {
  if (typeof lucide !== "undefined") {
    try { lucide.createIcons(); } catch {}
  }
}


/* ==========================================================================
   06. DOM SELECTORS
   ========================================================================== */

const Dom = {
  screenTitle:       () => document.getElementById("screen-title"),
  screenLogin:       () => document.getElementById("screen-login"),
  screenUsername:     () => document.getElementById("screen-username"),
  screenChat:        () => document.getElementById("screen-chat"),

  authEmail:         () => document.getElementById("auth-email"),
  authPassword:      () => document.getElementById("auth-password"),
  authLoading:       () => document.getElementById("auth-loading"),
  authFormContainer: () => document.getElementById("auth-form-container"),
  authError:         () => document.getElementById("auth-error"),
  authErrorText:     () => document.getElementById("auth-error-text"),
  authModeToggle:    () => document.getElementById("auth-mode-toggle"),
  authEmailForm:     () => document.getElementById("auth-email-form"),
  btnEmailLogin:     () => document.getElementById("btn-email-login"),
  usernameInput:     () => document.getElementById("username-input"),

  sidebar:           () => document.getElementById("sidebar"),
  sidebarBackdrop:   () => document.getElementById("sidebar-backdrop"),
  sidebarSearch:     () => document.getElementById("sidebar-search"),
  sidebarChatList:   () => document.getElementById("sidebar-chat-list"),
  sidebarPinnedList: () => document.getElementById("sidebar-pinned-list"),
  sidebarPinnedSection: () => document.getElementById("sidebar-pinned-section"),
  sidebarEmpty:      () => document.getElementById("sidebar-empty"),
  sidebarCount:      () => document.getElementById("sidebar-chat-count"),
  sidebarAvatar:     () => document.getElementById("sidebar-avatar"),
  sidebarName:       () => document.getElementById("sidebar-user-name"),
  sidebarEmail:      () => document.getElementById("sidebar-user-email"),

  topbarTitle:       () => document.getElementById("chat-title"),
  messagesArea:      () => document.getElementById("messages-area"),
  chatEmptyState:    () => document.getElementById("chat-empty-state"),
  emptyGreeting:     () => document.getElementById("empty-greeting"),
  voiceToggle:       () => document.getElementById("voice-toggle"),
  voiceVisualizer:   () => document.getElementById("voice-visualizer"),

  chatInput:         () => document.getElementById("chat-input"),
  sendBtn:           () => document.getElementById("send-btn"),
  stopBtn:           () => document.getElementById("stop-btn"),
  fileInput:         () => document.getElementById("file-input"),
  attachmentPreview: () => document.getElementById("attachment-preview"),
  inputWrapper:      () => document.getElementById("input-wrapper"),

  modelBtn:          () => document.getElementById("model-btn"),
  modelBtnLabel:     () => document.getElementById("model-btn-label"),
  modelDropdown:     () => document.getElementById("model-dropdown"),
  inputModelLabel:   () => document.getElementById("input-model-label"),

  themeIconSun:      () => document.getElementById("theme-icon-sun"),
  themeIconMoon:     () => document.getElementById("theme-icon-moon"),

  modalOverlay:      () => document.getElementById("modal-overlay"),
  toastContainer:    () => document.getElementById("toast-container"),
  galleryGrid:       () => document.getElementById("gallery-grid"),
};


/* ==========================================================================
   07. SCREEN SYSTEM
   ========================================================================== */

function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active-screen"));
  const target = document.getElementById(id);
  if (target) target.classList.add("active-screen");
}

function goToTitle() { showScreen("screen-title"); }
function goToLogin() { showScreen("screen-login"); hideAuthError(); }


/* ==========================================================================
   08. TOAST NOTIFICATIONS
   ========================================================================== */

function showToast(message, type = "info", duration = TOAST_DURATION_MS) {
  const container = Dom.toastContainer();
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  toast.setAttribute("role", "alert");

  const iconMap = { success: "check-circle", error: "alert-triangle", info: "info", warning: "alert-circle" };
  toast.innerHTML = `
    <i data-lucide="${iconMap[type] ?? "info"}" class="toast__icon"></i>
    <span class="toast__text">${escapeHtml(message)}</span>
  `;

  container.appendChild(toast);
  refreshIcons();

  const dismiss = () => {
    toast.classList.add("toast--out");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  };

  const timer = setTimeout(dismiss, duration);
  toast.addEventListener("click", () => { clearTimeout(timer); dismiss(); });
}

const showSuccess = (msg) => showToast(msg, "success");
const showError   = (msg) => { console.warn("[DashyCore]", msg); showToast(msg, "error"); };
const showInfo    = (msg) => showToast(msg, "info");
const showWarning = (msg) => showToast(msg, "warning");


/* ==========================================================================
   09. MODAL SYSTEM
   ========================================================================== */

function openModal(id) {
  const overlay = Dom.modalOverlay();
  if (!overlay) return;
  overlay.querySelectorAll(".modal.is-active").forEach(m => m.classList.remove("is-active"));
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  const modal = document.getElementById(id);
  if (modal) {
    modal.classList.add("is-active");
    refreshIcons();
    requestAnimationFrame(() => {
      const focusable = modal.querySelector("button, input, select, textarea, [tabindex]");
      if (focusable) focusable.focus();
    });
  }
}

function closeModal(e) {
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

function switchSettingsTab(panelId, clickedTab) {
  const tabs = clickedTab.closest("[role='tablist']");
  if (tabs) {
    tabs.querySelectorAll(".settings__tab").forEach(t => {
      t.classList.remove("settings__tab--active");
      t.setAttribute("aria-selected", "false");
    });
    clickedTab.classList.add("settings__tab--active");
    clickedTab.setAttribute("aria-selected", "true");
  }
  document.querySelectorAll(".settings__panel").forEach(p => { p.style.display = "none"; });
  const target = document.getElementById(`settings-${panelId}`);
  if (target) target.style.display = "flex";
}


/* ==========================================================================
   10. FIREBASE AUTHENTICATION
   ========================================================================== */

/**
 * Shows loading state on auth card.
 */
function showAuthLoading() {
  const loading = Dom.authLoading();
  const form    = Dom.authFormContainer();
  if (loading) loading.style.display = "flex";
  if (form)    form.style.display    = "none";
  hideAuthError();
}

/**
 * Hides loading state.
 */
function hideAuthLoading() {
  const loading = Dom.authLoading();
  const form    = Dom.authFormContainer();
  if (loading) loading.style.display = "none";
  if (form)    form.style.display    = "";
}

/**
 * Shows an error on the auth card.
 * @param {string} message
 */
function showAuthError(message) {
  const el   = Dom.authError();
  const text = Dom.authErrorText();
  if (el && text) {
    text.textContent = message;
    el.style.display = "flex";
    refreshIcons();
  }
}

function hideAuthError() {
  const el = Dom.authError();
  if (el) el.style.display = "none";
}

/**
 * Translates Firebase error codes to user-friendly messages.
 * @param {Error} err
 * @returns {string}
 */
function getFirebaseErrorMessage(err) {
  const code = err?.code || "";
  const map = {
    "auth/user-not-found":            "No account found with this email.",
    "auth/wrong-password":            "Incorrect password. Please try again.",
    "auth/invalid-credential":        "Invalid credentials. Check your email and password.",
    "auth/email-already-in-use":      "This email is already registered. Try signing in.",
    "auth/weak-password":             "Password must be at least 6 characters.",
    "auth/invalid-email":             "Please enter a valid email address.",
    "auth/too-many-requests":         "Too many attempts. Please wait and try again.",
    "auth/popup-closed-by-user":      "Sign-in popup was closed. Please try again.",
    "auth/network-request-failed":    "Network error. Check your internet connection.",
    "auth/popup-blocked":             "Popup blocked by your browser. Allow popups for this site.",
    "auth/cancelled-popup-request":   "Another popup is already open.",
    "auth/account-exists-with-different-credential": "An account already exists with a different sign-in method.",
  };
  return map[code] || err?.message || "Authentication failed. Please try again.";
}

/**
 * Google OAuth Sign-In.
 */
async function loginWithGoogle() {
  if (!isFirebaseReady()) {
    // Demo fallback
    handleUserLogin({ email: "demo@gmail.com", defaultName: "Demo User", avatarLetter: "D" });
    return;
  }

  showAuthLoading();
  try {
    const result = await firebaseAuth.signInWithPopup(googleProvider);
    const user = result.user;
    handleUserLogin({
      email:        user.email || "user@dashy.ai",
      defaultName:  user.displayName || user.email?.split("@")[0] || "User",
      avatarLetter: (user.displayName || user.email || "U")[0].toUpperCase(),
      photoURL:     user.photoURL || null,
      uid:          user.uid,
    });
  } catch (err) {
    hideAuthLoading();
    const msg = getFirebaseErrorMessage(err);
    showAuthError(msg);
    console.error("[DashyCore] Google login error:", err);
  }
}

/**
 * Guest login — no Firebase, just local state.
 */
function loginAsGuest() {
  handleUserLogin({
    email:        "guest@dashy.ai",
    defaultName:  "Guest",
    avatarLetter: "G",
  });
}

/**
 * Email + Password Sign-In or Sign-Up.
 * @param {Event} event
 */
async function loginWithEmail(event) {
  if (event) event.preventDefault();

  const email = Dom.authEmail()?.value.trim() ?? "";
  const pass  = Dom.authPassword()?.value.trim() ?? "";

  if (!email) return showAuthError("Please enter your email address.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthError("Please enter a valid email address.");
  if (!pass || pass.length < 6) return showAuthError("Password must be at least 6 characters.");

  hideAuthError();

  if (!isFirebaseReady()) {
    // Demo fallback
    handleUserLogin({ email, defaultName: email.split("@")[0], avatarLetter: email[0].toUpperCase() });
    return;
  }

  showAuthLoading();
  try {
    let result;
    if (State.isSignUpMode) {
      result = await firebaseAuth.createUserWithEmailAndPassword(email, pass);
      // Update display name
      await result.user.updateProfile({ displayName: email.split("@")[0] });
    } else {
      result = await firebaseAuth.signInWithEmailAndPassword(email, pass);
    }

    const user = result.user;
    handleUserLogin({
      email:        user.email || email,
      defaultName:  user.displayName || email.split("@")[0],
      avatarLetter: (user.displayName || email)[0].toUpperCase(),
      uid:          user.uid,
    });
  } catch (err) {
    hideAuthLoading();
    showAuthError(getFirebaseErrorMessage(err));
    console.error("[DashyCore] Email auth error:", err);
  }
}

/**
 * Toggles between Sign In and Sign Up modes.
 */
function toggleAuthMode() {
  State.isSignUpMode = !State.isSignUpMode;
  hideAuthError();

  const toggle = Dom.authModeToggle();
  const btn    = Dom.btnEmailLogin();
  const footer = document.querySelector(".auth__footer");

  if (State.isSignUpMode) {
    if (toggle) toggle.textContent = "Sign in";
    if (btn) {
      btn.innerHTML = '<i data-lucide="user-plus" class="btn__icon"></i> Create Account';
    }
    if (footer) {
      footer.querySelector("p").firstChild.textContent = "Already have an account? ";
    }
  } else {
    if (toggle) toggle.textContent = "Sign up";
    if (btn) {
      btn.innerHTML = '<i data-lucide="log-in" class="btn__icon"></i> Sign In';
    }
    if (footer) {
      footer.querySelector("p").firstChild.textContent = "Don't have an account? ";
    }
  }
  refreshIcons();
}

/**
 * Toggles password field visibility.
 */
function togglePasswordVisibility() {
  const input = Dom.authPassword();
  const icon  = document.getElementById("auth-eye-icon");
  if (!input) return;

  if (input.type === "password") {
    input.type = "text";
    if (icon) icon.setAttribute("data-lucide", "eye-off");
  } else {
    input.type = "password";
    if (icon) icon.setAttribute("data-lucide", "eye");
  }
  refreshIcons();
}

/**
 * Handles successful login — routes to username setup or workspace.
 */
function handleUserLogin({ email, defaultName, avatarLetter, photoURL, uid }) {
  hideAuthLoading();

  const savedUsername = lsGet(LS.USERNAME(email));

  if (savedUsername) {
    State.currentUser = {
      name:   savedUsername,
      email,
      avatar: savedUsername[0].toUpperCase(),
      uid:    uid || null,
      photoURL: photoURL || null,
    };
    enterWorkspace();
  } else {
    State.currentUser = {
      name:   defaultName,
      email,
      avatar: avatarLetter,
      uid:    uid || null,
      photoURL: photoURL || null,
    };
    showScreen("screen-username");
    requestAnimationFrame(() => {
      const input = Dom.usernameInput();
      if (input) { input.value = defaultName; input.focus(); input.select(); }
    });
  }
}


/* ==========================================================================
   11. USERNAME SETUP
   ========================================================================== */

function saveUsername(event) {
  if (event) event.preventDefault();
  const input    = Dom.usernameInput();
  const username = input?.value.trim() ?? "";

  if (!username)            return showError("Please enter a username.");
  if (username.length < 2)  return showError("Username must be at least 2 characters.");
  if (username.length > 20) return showError("Username must be 20 characters or less.");
  if (!/^[a-zA-Z0-9\s_-]+$/.test(username)) return showError("Only letters, numbers, spaces, _ and - are allowed.");

  lsSet(LS.USERNAME(State.currentUser.email), username);
  State.currentUser.name   = username;
  State.currentUser.avatar = username[0].toUpperCase();
  enterWorkspace();
}

function resetUsername() {
  if (!State.currentUser) return;
  if (!confirm("Reset your username?")) return;
  localStorage.removeItem(LS.USERNAME(State.currentUser.email));
  showScreen("screen-username");
  requestAnimationFrame(() => {
    const input = Dom.usernameInput();
    if (input) { input.value = ""; input.focus(); }
  });
}

function logout() {
  if (!confirm("Sign out of DashyCore?")) return;
  if (isFirebaseReady()) {
    firebaseAuth.signOut().catch(err => console.warn("[DashyCore] Sign out error:", err));
  }
  State.currentUser        = null;
  State.chats              = [];
  State.currentChatId      = null;
  State.pendingAttachments = [];
  State.generatedImages    = [];
  showScreen("screen-login");
}

function enterWorkspace() {
  applyStoredPreferences();
  showScreen("screen-chat");
  renderSidebarUser();
  updateModelUI();
  populateVoiceOptions();
  startNewChat();
  refreshIcons();
}

function applyStoredPreferences() {
  const theme    = lsGet(LS.THEME, "dark");
  const model    = lsGet(LS.MODEL, "dash-allround");
  const fontSize = lsGet(LS.FONT_SIZE, "medium");

  changeTheme(theme);
  State.currentModel = DASH_MODELS[model] ? model : "dash-allround";

  const sizes = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.setProperty("--font-size-base", sizes[fontSize] ?? "16px");
}


/* ==========================================================================
   12. SIDEBAR
   ========================================================================== */

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

function renderSidebarUser() {
  const u = State.currentUser;
  if (!u) return;
  const name   = Dom.sidebarName();
  const email  = Dom.sidebarEmail();
  const avatar = Dom.sidebarAvatar();
  if (name)   name.textContent   = u.name;
  if (email)  email.textContent  = u.email;
  if (avatar) avatar.textContent = u.avatar;

  const greeting = Dom.emptyGreeting();
  if (greeting) greeting.textContent = buildGreeting(u.name);

  // Populate settings name field
  const settingsName = document.getElementById("settings-name");
  if (settingsName) settingsName.value = u.name;
}

function filterChats(query) {
  const lower = (query ?? "").toLowerCase().trim();
  Dom.sidebarChatList()?.querySelectorAll(".sidebar__chat-item").forEach(item => {
    const text = item.querySelector(".sidebar__chat-item-title")?.textContent.toLowerCase() ?? "";
    item.style.display = (!lower || text.includes(lower)) ? "" : "none";
  });
}

function clearAllChats() {
  if (!confirm("Delete all chats? This cannot be undone.")) return;
  State.chats = [];
  State.currentChatId = null;
  startNewChat();
}

function renderSidebarChatList() {
  const list       = Dom.sidebarChatList();
  const pinnedList = Dom.sidebarPinnedList();
  const pinnedSec  = Dom.sidebarPinnedSection();
  const empty      = Dom.sidebarEmpty();
  const count      = Dom.sidebarCount();
  if (!list) return;

  list.innerHTML = "";
  if (pinnedList) pinnedList.innerHTML = "";

  const pinned = State.chats.filter(c => c.pinned);
  const recent = State.chats.filter(c => !c.pinned);

  if (pinnedSec) pinnedSec.style.display = pinned.length ? "" : "none";
  if (count) count.textContent = State.chats.length;

  const hasContent = State.chats.some(c => c.messages.length > 0);
  if (empty) empty.classList.toggle("is-visible", !hasContent);

  pinned.forEach(chat => { if (pinnedList) pinnedList.appendChild(buildChatItem(chat)); });
  recent.forEach(chat => { list.appendChild(buildChatItem(chat)); });

  refreshIcons();
}

function buildChatItem(chat) {
  const item = document.createElement("div");
  item.className = `sidebar__chat-item${chat.id === State.currentChatId ? " is-active" : ""}`;
  item.setAttribute("role", "button");
  item.setAttribute("tabindex", "0");
  item.dataset.chatId = chat.id;

  const pinHtml = chat.pinned
    ? `<i data-lucide="pin" class="sidebar__pin-icon" style="width:11px;height:11px"></i>`
    : "";

  item.innerHTML = `
    <div class="sidebar__chat-item-body">
      <div class="sidebar__chat-item-title">${pinHtml}${escapeHtml(chat.title)}</div>
      <div class="sidebar__chat-item-meta"><span>${formatRelativeTime(chat.createdAt)}</span></div>
    </div>
    <div class="sidebar__chat-item-actions">
      <button class="sidebar__chat-action" title="${chat.pinned ? "Unpin" : "Pin"}" data-action="pin" aria-label="${chat.pinned ? "Unpin" : "Pin"} chat">
        <i data-lucide="pin" style="width:12px;height:12px"></i>
      </button>
      <button class="sidebar__chat-action sidebar__chat-action--danger" title="Delete" data-action="delete" aria-label="Delete chat">
        <i data-lucide="trash-2" style="width:12px;height:12px"></i>
      </button>
    </div>
  `;

  item.addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "pin")    { togglePinChat(chat.id); return; }
    if (action === "delete") { deleteChat(chat.id); return; }
    switchToChat(chat.id);
    if (window.innerWidth < 768) toggleSidebar();
  });

  item.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); switchToChat(chat.id); }
  });

  return item;
}

function togglePinChat(chatId) {
  const chat = State.chats.find(c => c.id === chatId);
  if (!chat) return;
  chat.pinned = !chat.pinned;
  renderSidebarChatList();
  showSuccess(chat.pinned ? "Chat pinned" : "Chat unpinned");
}

function deleteChat(chatId) {
  if (!confirm("Delete this chat?")) return;
  State.chats = State.chats.filter(c => c.id !== chatId);
  if (State.currentChatId === chatId) {
    State.chats.length > 0 ? switchToChat(State.chats[0].id) : startNewChat();
  } else {
    renderSidebarChatList();
  }
}


/* ==========================================================================
   13. CHAT MANAGEMENT
   ========================================================================== */

function startNewChat() {
  const chat = { id: generateId("chat"), title: "New Chat", messages: [], pinned: false, createdAt: Date.now() };
  State.chats.unshift(chat);
  State.currentChatId = chat.id;
  renderSidebarChatList();
  renderWorkspace();
}

function switchToChat(id) {
  State.currentChatId = id;
  renderSidebarChatList();
  renderWorkspace();
}

function getCurrentChat() {
  return State.chats.find(c => c.id === State.currentChatId);
}

function renderWorkspace() {
  const chat = getCurrentChat();
  const area = Dom.messagesArea();
  const title = Dom.topbarTitle();
  if (!area || !chat) return;

  if (title) title.textContent = chat.title;
  area.innerHTML = "";

  if (chat.messages.length === 0) {
    const emptyState = Dom.chatEmptyState();
    if (emptyState) { area.appendChild(emptyState); emptyState.style.display = ""; }
    renderSidebarUser();
  } else {
    chat.messages.forEach(msg => renderMessage(msg, false));
  }
  scrollToBottom();
  refreshIcons();
}

function generateChatTitle(chat, firstMessage) {
  chat.title = firstMessage.length > 36 ? firstMessage.slice(0, 36).trimEnd() + "…" : firstMessage || "New Chat";
  const title = Dom.topbarTitle();
  if (title) title.textContent = chat.title;
  renderSidebarChatList();
}

function useSuggestion(text) {
  const input = Dom.chatInput();
  if (!input) return;
  input.value = text;
  input.focus();
  autoResizeTextarea(input);
}

function autoResizeTextarea(el) {
  el.style.height = "auto";
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
}


/* ==========================================================================
   14. FILE ATTACHMENTS
   ========================================================================== */

function handleFileAttachment(event) {
  Array.from(event.target?.files ?? []).forEach(addAttachment);
  if (event.target) event.target.value = "";
}

function addAttachment(file) {
  if (file.size > MAX_FILE_SIZE_BYTES) return showError(`"${file.name}" exceeds the 20 MB limit.`);
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    State.pendingAttachments.push({
      id: generateId("att"), name: file.name, type: file.type, size: file.size,
      isImage: file.type.startsWith("image/"), dataUrl, base64: dataUrl.split(",")[1] ?? "",
    });
    renderAttachmentPreviews();
  };
  reader.onerror = () => showError(`Failed to read "${file.name}".`);
  reader.readAsDataURL(file);
}

function removeAttachment(id) {
  State.pendingAttachments = State.pendingAttachments.filter(a => a.id !== id);
  renderAttachmentPreviews();
}

function renderAttachmentPreviews() {
  const row = Dom.attachmentPreview();
  if (!row) return;
  row.innerHTML = "";
  State.pendingAttachments.forEach(att => {
    const chip = document.createElement("div");
    chip.className = "attach-chip";
    chip.innerHTML = att.isImage
      ? `<img class="attach-chip__thumb" src="${att.dataUrl}" alt="${escapeHtml(att.name)}">
         <span class="attach-chip__name">${escapeHtml(att.name)}</span>
         <button class="attach-chip__remove" onclick="removeAttachment('${att.id}')" aria-label="Remove">
           <i data-lucide="x" style="width:12px;height:12px"></i>
         </button>`
      : `<i data-lucide="file-text" class="attach-chip__icon"></i>
         <span class="attach-chip__name">${escapeHtml(att.name)}</span>
         <button class="attach-chip__remove" onclick="removeAttachment('${att.id}')" aria-label="Remove">
           <i data-lucide="x" style="width:12px;height:12px"></i>
         </button>`;
    row.appendChild(chip);
  });
  refreshIcons();
}

// Clipboard paste
window.addEventListener("paste", (e) => {
  if (!Dom.screenChat()?.classList.contains("active-screen")) return;
  const items = Array.from(e.clipboardData?.items ?? []);
  const img = items.find(item => item.type.startsWith("image/"));
  if (img) { const file = img.getAsFile(); if (file) addAttachment(file); }
});

// Drag-and-drop
window.addEventListener("dragover", e => e.preventDefault());
window.addEventListener("drop", (e) => {
  e.preventDefault();
  if (!Dom.screenChat()?.classList.contains("active-screen")) return;
  Array.from(e.dataTransfer?.files ?? []).forEach(addAttachment);
});


/* ==========================================================================
   15. MESSAGE RENDERING
   ========================================================================== */

function renderMessage(msg, doScroll = true) {
  const area = Dom.messagesArea();
  if (!area) return null;
  const bubble = buildMessageNode(msg);
  area.appendChild(bubble);
  if (doScroll) scrollToBottom();
  refreshIcons();
  return bubble;
}

function reRenderMessage(msg) {
  const area = Dom.messagesArea();
  if (!area || !msg.id) return;
  const existing = area.querySelector(`[data-msg-id="${msg.id}"]`);
  if (!existing) return;
  const fresh = buildMessageNode(msg);
  existing.replaceWith(fresh);
  refreshIcons();
}

function buildMessageNode(msg) {
  const isAi = msg.role === "ai";
  const bubble = document.createElement("div");
  bubble.className = "chat-message";
  bubble.dataset.msgId = msg.id;

  const avatar = document.createElement("div");
  avatar.className = `message__avatar message__avatar--${isAi ? "ai" : "user"}`;
  avatar.textContent = msg.avatar;
  avatar.setAttribute("aria-hidden", "true");

  const body = document.createElement("div");
  body.className = "message__body";

  // Header
  const header = document.createElement("div");
  header.className = "message__header";
  const authorEl = document.createElement("span");
  authorEl.className = "message__author";
  authorEl.textContent = msg.author;
  header.appendChild(authorEl);

  if (isAi && msg.modelUsed) {
    const badge = document.createElement("span");
    badge.className = "message__model-tag";
    badge.textContent = msg.modelUsed;
    header.appendChild(badge);
  }

  const ts = document.createElement("span");
  ts.className = "message__timestamp";
  ts.textContent = formatTime(msg.timestamp);
  header.appendChild(ts);
  body.appendChild(header);

  // Attachments
  if (msg.attachments?.length) {
    const attRow = document.createElement("div");
    attRow.className = "message-attachments";
    msg.attachments.forEach(att => {
      if (att.isImage) {
        const img = document.createElement("img");
        img.className = "message-attachment-thumb";
        img.src = att.dataUrl; img.alt = att.name;
        attRow.appendChild(img);
      } else {
        const file = document.createElement("div");
        file.className = "message-attachment-file";
        file.innerHTML = `<i data-lucide="file-text" class="message-attachment-file-icon"></i><span>${escapeHtml(att.name)}</span>`;
        attRow.appendChild(file);
      }
    });
    body.appendChild(attRow);
  }

  // Text
  const textEl = document.createElement("div");
  textEl.className = "message__text";
  textEl.innerHTML = formatMarkdown(msg.text);
  body.appendChild(textEl);

  // Image
  if (msg.imageLoading) body.appendChild(buildImageLoading(msg.imagePrompt));
  else if (msg.imageUrl) body.appendChild(buildImageOutput(msg));

  // Actions
  if (!msg.imageLoading) {
    const bar = buildActionBar(msg);
    if (bar) body.appendChild(bar);
  }

  bubble.appendChild(avatar);
  bubble.appendChild(body);
  return bubble;
}

function buildImageLoading(prompt) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  const loading = document.createElement("div");
  loading.className = "image-loading";
  loading.innerHTML = `
    <span class="image-loading__badge"><i data-lucide="zap" style="width:12px;height:12px;display:inline"></i> SpeedGen</span>
    <div class="image-loading__spinner"></div>
    <p class="image-loading__label">Rendering${prompt ? ` "${escapeHtml(prompt.slice(0, 40))}${prompt.length > 40 ? "…" : ""}"` : " your image"}…</p>
  `;
  wrap.appendChild(loading);
  return wrap;
}

function buildImageOutput(msg) {
  const wrap = document.createElement("div");
  wrap.className = "image-wrap";
  const img = document.createElement("img");
  img.src = msg.imageUrl; img.alt = msg.imagePrompt || "Generated image"; img.loading = "lazy";
  wrap.appendChild(img);

  const footer = document.createElement("div");
  footer.className = "image-footer";

  const dlBtn = document.createElement("button");
  dlBtn.className = "image-footer__btn";
  dlBtn.innerHTML = `<i data-lucide="download" style="width:14px;height:14px"></i> Download`;
  dlBtn.addEventListener("click", () => downloadImage(msg.imageUrl, msg.imagePrompt));

  const regenBtn = document.createElement("button");
  regenBtn.className = "image-footer__btn";
  regenBtn.innerHTML = `<i data-lucide="refresh-cw" style="width:14px;height:14px"></i> Regenerate`;
  regenBtn.addEventListener("click", () => regenerateResponse(msg));

  footer.appendChild(dlBtn);
  footer.appendChild(regenBtn);
  wrap.appendChild(footer);
  return wrap;
}

function downloadImage(url, prompt) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `dashy-${(prompt ?? "image").slice(0, 24).replace(/\s+/g, "-")}.jpg`;
  a.click();
}


/* ==========================================================================
   16. MARKDOWN & FORMATTING
   ========================================================================== */

function formatMarkdown(text) {
  if (!text) return "";

  const codeBlocks = [];
  let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const id = generateId("code");
    const label = lang || "code";
    const safe = code.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    codeBlocks.push({ id, label, safe });
    return `\x00CODEBLOCK_${codeBlocks.length - 1}\x00`;
  });

  processed = escapeHtml(processed);

  processed = processed.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_, i) => {
    const { id, label, safe } = codeBlocks[parseInt(i, 10)];
    return `<div class="code-block"><div class="code-block__header"><div class="code-block__dots"><span class="code-block__dot"></span><span class="code-block__dot"></span><span class="code-block__dot"></span></div><span class="code-block__lang">${label}</span><button class="code-block__copy" onclick="copyCode('${id}', this)" type="button"><i data-lucide="copy" style="width:12px;height:12px;display:inline"></i> Copy</button></div><pre class="code-block__body" id="${id}">${safe.trimEnd()}</pre></div>`;
  });

  processed = processed.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  processed = processed.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  processed = processed.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  processed = processed.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  processed = processed.replace(/^---$/gm, "<hr>");
  processed = processed.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  processed = processed.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
  processed = processed.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  processed = processed.replace(/_([^_\n]+)_/g, "<em>$1</em>");
  processed = processed.replace(/~~([^~]+)~~/g, "<s>$1</s>");
  processed = processed.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  processed = processed.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  processed = processed.replace(/(?<![">])(https?:\/\/[^\s<"]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  processed = processed.replace(/^\s*[-*+] (.+)$/gm, "<li>$1</li>");
  processed = processed.replace(/(<li>.*<\/li>(\n|$))+/g, m => `<ul>${m}</ul>`);
  processed = processed.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  processed = formatTables(processed);
  processed = processed.replace(/\n(?!<(?:ul|ol|h[1-3]|blockquote|hr|div|pre))/g, "<br>");
  processed = processed.split(/(<br>){2,}/).map(c => c.trim()).filter(Boolean).join("<br><br>");

  return processed;
}

function formatTables(text) {
  return text.replace(/((?:\|[^\n]+\|\n)+)/g, (tableBlock) => {
    const rows = tableBlock.trim().split("\n");
    if (rows.length < 2) return tableBlock;
    const headerCells = rows[0].split("|").filter(c => c.trim()).map(c => `<th>${c.trim()}</th>`).join("");
    const bodyRows = rows.slice(2).map(row => {
      const cells = row.split("|").filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join("");
      return `<tr>${cells}</tr>`;
    }).join("");
    return `<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });
}

function copyCode(id, btn) {
  const pre = document.getElementById(id);
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;display:inline"></i> Copied`;
    btn.classList.add("code-block__copy--copied");
    refreshIcons();
    setTimeout(() => {
      btn.innerHTML = `<i data-lucide="copy" style="width:12px;height:12px;display:inline"></i> Copy`;
      btn.classList.remove("code-block__copy--copied");
      refreshIcons();
    }, 2000);
  }).catch(() => showError("Could not copy to clipboard."));
}


/* ==========================================================================
   17. CLOUDFLARE WORKER INTEGRATION
   ========================================================================== */

/**
 * Sends a chat completion request through the Cloudflare Worker.
 * The Worker proxies to OpenRouter using the model specified.
 *
 * Worker expects: POST /openrouter with OpenRouter-compatible body.
 *
 * @param {string} prompt
 * @param {object} chat
 * @param {Array} attachments
 * @param {object} config Model config from DASH_MODELS
 * @returns {Promise<string>}
 */
async function fetchFromWorker(prompt, chat, attachments, config) {
  // Build conversation history
  const history = chat.messages
    .slice(0, -1)
    .slice(-MAX_HISTORY_TURNS * 2)
    .filter(m => m.text?.trim())
    .map(m => ({
      role:    m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));

  // Build user message
  const userParts = [];
  let textContent = prompt || "Describe this.";

  // Append file metadata for non-image attachments
  attachments.forEach(att => {
    if (att.isImage && att.base64) {
      userParts.push({
        type: "image_url",
        image_url: { url: `data:${att.type};base64,${att.base64}` },
      });
    } else {
      textContent += `\n\n[Attached file: ${att.name} (${att.type})]`;
    }
  });

  userParts.unshift({ type: "text", text: textContent });

  // The Worker's /openrouter endpoint expects an OpenRouter-compatible payload
  const body = {
    model:    config.openRouterModel,
    messages: [
      { role: "system", content: config.systemPrompt },
      ...history,
      { role: "user", content: userParts.length === 1 ? textContent : userParts },
    ],
    temperature:  config.temperature,
    max_tokens:   config.maxTokens,
  };

  // Create AbortController for stop button
  State.activeAbortController = new AbortController();

  const res = await fetch(`${WORKER_ENDPOINT}/openrouter`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
    signal:  State.activeAbortController.signal,
  });

  State.activeAbortController = null;

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `Request failed (${res.status})`);
  }

  const data = await res.json();

  // OpenRouter returns: { choices: [{ message: { content: "..." } }] }
  const text = data?.choices?.[0]?.message?.content
            ?? data?.text
            ?? data?.content
            ?? data?.message;

  if (!text) throw new Error("Empty response from DashyCore. Try again.");
  return text;
}


/* ==========================================================================
   18. TEXT GENERATION
   ========================================================================== */

function sendMessage(event) {
  if (event) event.preventDefault();
  if (State.isResponding) return;

  const input   = Dom.chatInput();
  const rawText = input?.value.trim() ?? "";

  if (!rawText && State.pendingAttachments.length === 0) return;

  const chat = getCurrentChat();
  if (!chat) return showError("No active chat.");

  const emptyState = Dom.chatEmptyState();
  if (emptyState) emptyState.style.display = "none";

  const attachments = [...State.pendingAttachments];
  State.pendingAttachments = [];
  renderAttachmentPreviews();

  const userMsg = {
    id: generateId("msg"), author: State.currentUser.name, role: "user",
    text: rawText, avatar: State.currentUser.avatar, attachments, timestamp: Date.now(),
  };

  chat.messages.push(userMsg);
  renderMessage(userMsg);

  if (chat.messages.length === 1) {
    generateChatTitle(chat, rawText || (attachments[0]?.name ?? "New Chat"));
  }

  if (input) { input.value = ""; autoResizeTextarea(input); input.focus(); }

  if (isImageRequest(rawText)) {
    handleImageGeneration(rawText, chat);
  } else {
    handleTextGeneration(rawText, chat, attachments);
  }
}

async function handleTextGeneration(prompt, chat, attachments) {
  setResponding(true);
  const config = getModelConfig(State.currentModel);

  const aiMsg = {
    id: generateId("msg"), author: "DashyCore", role: "ai", text: "", avatar: "D",
    originalPrompt: prompt, originalAttachments: attachments,
    modelUsed: config.displayName, timestamp: Date.now(),
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
    if (err.name === "AbortError") {
      aiMsg.text = "*Generation stopped by user.*";
    } else {
      aiMsg.text = buildErrorMessage(err);
    }
    if (textEl) textEl.innerHTML = formatMarkdown(aiMsg.text);
  } finally {
    if (textEl) textEl.classList.remove("message__text--typing");
    reRenderMessage(aiMsg);
    setResponding(false);
  }
}

function streamResponseText(fullText, aiMsg, textEl) {
  return new Promise(resolve => {
    let i = 0;
    const doStream = document.getElementById("settings-streaming")?.checked ?? true;

    if (!doStream) {
      aiMsg.text = fullText;
      if (textEl) textEl.innerHTML = formatMarkdown(fullText);
      scrollToBottom();
      refreshIcons();
      resolve();
      return;
    }

    const tick = setInterval(() => {
      i = Math.min(i + STREAM_CHUNK_SIZE, fullText.length);
      aiMsg.text = fullText.slice(0, i);
      if (textEl) { textEl.innerHTML = formatMarkdown(aiMsg.text); scrollToBottom(); }
      if (i >= fullText.length) { clearInterval(tick); State.activeStreamInterval = null; refreshIcons(); resolve(); }
    }, STREAM_INTERVAL_MS);

    State.activeStreamInterval = tick;
  });
}

function stopGeneration() {
  // Abort fetch
  if (State.activeAbortController) {
    State.activeAbortController.abort();
    State.activeAbortController = null;
  }
  // Stop stream
  if (State.activeStreamInterval) {
    clearInterval(State.activeStreamInterval);
    State.activeStreamInterval = null;
  }
  setResponding(false);
  showInfo("Generation stopped.");
}

function buildErrorMessage(err) {
  const base = err?.message ?? "Unknown error";
  return `**Something went wrong:** ${base}\n\n**Try:**\n- Check your internet connection\n- Try a different DASH model\n- Start a new chat`;
}

function setResponding(value) {
  State.isResponding = value;
  const sendBtn = Dom.sendBtn();
  const stopBtn = Dom.stopBtn();
  if (sendBtn) sendBtn.style.display = value ? "none" : "";
  if (stopBtn) stopBtn.style.display = value ? "" : "none";
}

async function regenerateResponse(msg) {
  if (State.isResponding) return showError("Wait for the current response.");
  const chat = getCurrentChat();
  if (!chat) return;
  const idx = chat.messages.findIndex(m => m.id === msg.id);
  if (idx === -1) return;
  chat.messages.splice(idx, 1);
  Dom.messagesArea()?.querySelector(`[data-msg-id="${msg.id}"]`)?.remove();

  if (msg.imagePrompt || isImageRequest(msg.originalPrompt ?? "")) {
    handleImageGeneration(msg.originalPrompt ?? msg.imagePrompt ?? "", chat);
  } else {
    handleTextGeneration(msg.originalPrompt ?? "", chat, msg.originalAttachments ?? []);
  }
}


/* ==========================================================================
   19. IMAGE GENERATION (SpeedGen)
   ========================================================================== */

function handleImageGeneration(prompt, chat) {
  setResponding(true);
  const cleanPrompt = extractImagePrompt(prompt);
  const isHQ = State.currentModel === "dash-complexity";
  const dimension = isHQ ? 768 : 512;
  const seed = Math.floor(Math.random() * 1_000_000);
  const finalPrompt = isHQ ? `${cleanPrompt}, ultra detailed, masterpiece, professional, cinematic lighting, 8k` : cleanPrompt;
  const url = `${SPEEDGEN_ENDPOINT}${encodeURIComponent(finalPrompt)}?width=${dimension}&height=${dimension}&seed=${seed}&nologo=true&model=flux`;

  const aiMsg = {
    id: generateId("msg"), author: "DashyCore", role: "ai",
    text: `Generating: *"${cleanPrompt}"*`, avatar: "D",
    imageUrl: null, imagePrompt: cleanPrompt, imageLoading: true,
    originalPrompt: prompt, modelUsed: getModelConfig(State.currentModel).displayName,
    timestamp: Date.now(),
  };

  chat.messages.push(aiMsg);
  renderMessage(aiMsg);

  fetch(url)
    .then(res => { if (!res.ok) throw new Error(`SpeedGen returned ${res.status}`); return res.blob(); })
    .then(blob => {
      const objectUrl = URL.createObjectURL(blob);
      aiMsg.imageUrl = objectUrl;
      aiMsg.imageLoading = false;
      aiMsg.text = `Here's your image of *"${cleanPrompt}"*:`;
      State.generatedImages.push({ url: objectUrl, prompt: cleanPrompt, timestamp: Date.now() });
      reRenderMessage(aiMsg);
      scrollToBottom();
      renderGallery();
    })
    .catch(err => {
      aiMsg.imageLoading = false;
      aiMsg.text = `**SpeedGen couldn't render this image:** ${err.message}\n\nTry a different prompt.`;
      reRenderMessage(aiMsg);
      scrollToBottom();
    })
    .finally(() => setResponding(false));
}

function renderGallery() {
  const grid = Dom.galleryGrid();
  if (!grid) return;

  if (State.generatedImages.length === 0) {
    grid.innerHTML = `<div class="gallery__empty">
      <i data-lucide="image-off" style="width:40px;height:40px;opacity:0.15"></i>
      <p>No generated images yet.</p>
      <p class="gallery__empty-hint">Try "Generate an image of…" in chat.</p>
    </div>`;
    refreshIcons();
    return;
  }

  grid.innerHTML = "";
  State.generatedImages.forEach((img, i) => {
    const item = document.createElement("div");
    item.className = "gallery__item";
    item.innerHTML = `
      <img src="${img.url}" alt="${escapeHtml(img.prompt)}" loading="lazy">
      <div class="gallery__item-overlay">
        <button class="btn btn--small btn--ghost" onclick="downloadImage('${img.url}', '${escapeHtml(img.prompt).replace(/'/g, "")}')" type="button">
          <i data-lucide="download" class="btn__icon"></i>
        </button>
      </div>
    `;
    grid.appendChild(item);
  });
  refreshIcons();
}


/* ==========================================================================
   20. ACTION BAR
   ========================================================================== */

function buildActionBar(msg) {
  if (msg.imageLoading) return null;
  const bar = document.createElement("div");
  bar.className = "message__actions";

  if (msg.role === "user") {
    bar.appendChild(makeActionButton("copy", "clipboard", "Copy prompt", () => copyToClipboard(msg.text, "Prompt copied!")));
  } else {
    bar.appendChild(makeActionButton("copy", "clipboard", "Copy response", () => copyToClipboard(msg.text, "Response copied!")));
    bar.appendChild(buildDivider());

    const likeBtn = makeActionButton("like", "thumbs-up", "Helpful", (btn) => handleFeedback(msg, "like", btn, bar));
    if (msg.feedback === "like") likeBtn.classList.add("msg-btn--liked");
    bar.appendChild(likeBtn);

    const dislikeBtn = makeActionButton("dislike", "thumbs-down", "Not helpful", (btn) => handleFeedback(msg, "dislike", btn, bar));
    if (msg.feedback === "dislike") dislikeBtn.classList.add("msg-btn--disliked");
    bar.appendChild(dislikeBtn);

    const reportBtn = makeActionButton("report", "flag", "Report", () => openReportModal(msg.id));
    if (msg.reported) reportBtn.classList.add("msg-btn--reported");
    bar.appendChild(reportBtn);

    bar.appendChild(buildDivider());
    bar.appendChild(makeActionButton("regen", "refresh-cw", "Regenerate", () => regenerateResponse(msg)));
  }
  return bar;
}

function makeActionButton(name, lucideIcon, tooltip, onClick) {
  const btn = document.createElement("button");
  btn.className = "msg-btn";
  btn.setAttribute("data-tooltip", tooltip);
  btn.setAttribute("aria-label", tooltip);
  btn.setAttribute("type", "button");
  btn.innerHTML = `<i data-lucide="${lucideIcon}"></i>`;
  btn.addEventListener("click", () => onClick(btn));
  return btn;
}

function buildDivider() {
  const d = document.createElement("div");
  d.className = "msg-divider";
  d.setAttribute("aria-hidden", "true");
  return d;
}

function handleFeedback(msg, type, clickedBtn, bar) {
  const wasActive = msg.feedback === type;
  bar.querySelectorAll(".msg-btn--liked, .msg-btn--disliked").forEach(b => b.classList.remove("msg-btn--liked", "msg-btn--disliked"));
  if (wasActive) { msg.feedback = null; }
  else {
    msg.feedback = type;
    clickedBtn.classList.add(type === "like" ? "msg-btn--liked" : "msg-btn--disliked");
    saveFeedback(msg, type);
    showSuccess(type === "like" ? "Thanks for the feedback!" : "Got it — we'll improve");
  }
}

function copyToClipboard(text, successMsg) {
  navigator.clipboard.writeText(text ?? "")
    .then(() => showSuccess(successMsg))
    .catch(() => showError("Could not copy."));
}


/* ==========================================================================
   21. FEEDBACK & REPORTS
   ========================================================================== */

function saveFeedback(msg, type) {
  try {
    const stored = lsGet(LS.FEEDBACK, []);
    stored.push({ msgId: msg.id, type, model: State.currentModel, prompt: msg.originalPrompt?.slice(0, 300) ?? "", response: msg.text?.slice(0, 500) ?? "", user: State.currentUser?.email ?? "anonymous", timestamp: Date.now() });
    lsSet(LS.FEEDBACK, stored.slice(-500));
  } catch {}
}

function openReportModal(msgId) {
  State.pendingReportMsgId = msgId;
  document.querySelectorAll("input[name='report-reason']").forEach(r => { r.checked = false; });
  const details = document.getElementById("report-details");
  if (details) details.value = "";
  openModal("modal-report");
}

function submitReport() {
  const selected = document.querySelector("input[name='report-reason']:checked");
  if (!selected) return showError("Please select a reason.");
  const details = document.getElementById("report-details")?.value.trim() ?? "";
  const chat = getCurrentChat();
  if (!chat || !State.pendingReportMsgId) { closeAllModals(); return; }
  const msg = chat.messages.find(m => m.id === State.pendingReportMsgId);
  if (msg) {
    saveReport(msg, selected.value, details);
    msg.reported = true;
    reRenderMessage(msg);
  }
  closeAllModals();
  showSuccess("Report submitted. Thank you!");
}

function saveReport(msg, reason, details) {
  try {
    const stored = lsGet(LS.REPORTS, []);
    stored.push({ msgId: msg.id, reason, details: details.slice(0, 1000), model: State.currentModel, prompt: msg.originalPrompt?.slice(0, 300) ?? "", response: msg.text?.slice(0, 500) ?? "", user: State.currentUser?.email ?? "anonymous", timestamp: Date.now() });
    lsSet(LS.REPORTS, stored.slice(-200));
  } catch {}
}


/* ==========================================================================
   22. VOICE INPUT
   ========================================================================== */

function toggleVoiceInput() {
  State.voiceActive ? stopVoiceInput() : startVoiceInput();
}

function startVoiceInput() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return showError("Voice input not supported. Try Chrome or Edge.");

  const rec = new SR();
  rec.continuous = false; rec.interimResults = true; rec.lang = "en-US";

  rec.onstart = () => {
    State.voiceActive = true; State.recognition = rec;
    Dom.voiceToggle()?.classList.add("is-active");
    showVoiceVisualizer(true);
  };

  rec.onresult = (e) => {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
    const input = Dom.chatInput();
    if (input) { input.value = transcript; autoResizeTextarea(input); }
  };

  rec.onerror = (e) => {
    stopVoiceInput();
    showError(e.error === "not-allowed" ? "Microphone permission denied." : `Voice error: ${e.error}`);
  };

  rec.onend = () => stopVoiceInput();
  try { rec.start(); } catch (e) { showError("Could not start voice: " + e.message); }
}

function stopVoiceInput() {
  State.recognition?.stop();
  State.recognition = null; State.voiceActive = false;
  Dom.voiceToggle()?.classList.remove("is-active");
  showVoiceVisualizer(false);
}

function showVoiceVisualizer(show) {
  const vis = Dom.voiceVisualizer();
  if (vis) vis.style.display = show ? "flex" : "none";
}

function populateVoiceOptions() {
  const select = document.getElementById("settings-tts-voice");
  if (!select || !window.speechSynthesis) return;
  const populate = () => {
    const voices = window.speechSynthesis.getVoices();
    select.innerHTML = '<option value="default">System Default</option>';
    voices.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = i; opt.textContent = `${v.name} (${v.lang})`;
      select.appendChild(opt);
    });
  };
  window.speechSynthesis.onvoiceschanged = populate;
  populate();
}

function speakText(text) {
  const enabled = document.getElementById("settings-tts-enabled")?.checked;
  if (!enabled || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text.replace(/[*#`]/g, "").slice(0, 1000));
  utt.rate = parseFloat(document.getElementById("settings-speech-rate")?.value ?? "1");
  const vi = parseInt(document.getElementById("settings-tts-voice")?.value ?? "default", 10);
  if (!isNaN(vi)) utt.voice = window.speechSynthesis.getVoices()[vi] ?? null;
  window.speechSynthesis.speak(utt);
}


/* ==========================================================================
   23. SETTINGS
   ========================================================================== */

function updateDisplayName() {
  const input = document.getElementById("settings-name");
  const username = input?.value.trim() ?? "";
  if (!username || username.length < 2) return showError("Name must be at least 2 characters.");
  State.currentUser.name = username;
  State.currentUser.avatar = username[0].toUpperCase();
  lsSet(LS.USERNAME(State.currentUser.email), username);
  renderSidebarUser();
  showSuccess("Name updated!");
}

function setDefaultModel(value) {
  if (DASH_MODELS[value]) {
    State.currentModel = value;
    lsSet(LS.MODEL, value);
    updateModelUI();
  }
}

function changeFontSize(size) {
  const map = { small: "14px", medium: "16px", large: "18px" };
  document.documentElement.style.setProperty("--font-size-base", map[size] ?? "16px");
  lsSet(LS.FONT_SIZE, size);
}

function updateSpeechRateDisplay() {
  const slider = document.getElementById("settings-speech-rate");
  const label = document.getElementById("speech-rate-value");
  if (slider && label) label.textContent = `${parseFloat(slider.value).toFixed(1)}x`;
}

function exportAllData() {
  const data = {
    version: "5.1", exportedAt: new Date().toISOString(),
    user: State.currentUser, chats: State.chats,
    settings: { model: State.currentModel, theme: State.currentTheme, fontSize: lsGet(LS.FONT_SIZE, "medium") },
    feedback: lsGet(LS.FEEDBACK, []), reports: lsGet(LS.REPORTS, []),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `dashycore-export-${Date.now()}.json`; a.click();
  URL.revokeObjectURL(url);
  showSuccess("Data exported!");
}

function deleteAllData() {
  if (!confirm("Delete ALL data? This cannot be undone.")) return;
  try {
    [LS.FEEDBACK, LS.REPORTS, LS.THEME, LS.MODEL, LS.FONT_SIZE, LS.ENTER_SEND].forEach(k => localStorage.removeItem(k));
    if (State.currentUser) localStorage.removeItem(LS.USERNAME(State.currentUser.email));
  } catch {}
  State.chats = []; State.currentChatId = null; State.generatedImages = [];
  closeAllModals();
  showSuccess("All data deleted.");
  setTimeout(() => logout(), 800);
}


/* ==========================================================================
   24. THEME SYSTEM
   ========================================================================== */

function changeTheme(theme) {
  const chosen = VALID_THEMES.includes(theme) ? theme : "dark";
  document.documentElement.setAttribute("data-theme", chosen);
  State.currentTheme = chosen;
  lsSet(LS.THEME, chosen);

  // Sync theme cards in settings
  document.querySelectorAll(".settings__theme-card").forEach(card => {
    card.classList.toggle("is-active", card.dataset.theme === chosen);
  });

  // Sync sun/moon icons
  const sun  = Dom.themeIconSun();
  const moon = Dom.themeIconMoon();
  if (sun && moon) {
    sun.style.display  = chosen === "light" ? "" : "none";
    moon.style.display = chosen === "light" ? "none" : "";
  }

  // PWA theme-color meta
  const meta = document.querySelector("meta[name='theme-color']");
  if (meta) meta.content = THEME_COLORS[chosen] ?? THEME_COLORS.dark;
}

/**
 * Cycles between dark ↔ light on the topbar toggle button.
 */
function cycleTheme() {
  changeTheme(State.currentTheme === "light" ? "dark" : "light");
}

function changeModel(value) {
  if (DASH_MODELS[value]) {
    State.currentModel = value;
    lsSet(LS.MODEL, value);
    updateModelUI();
  }
}


/* ==========================================================================
   25. MODEL DROPDOWN
   ========================================================================== */

function toggleModelDropdown() {
  const dd = Dom.modelDropdown();
  if (!dd) return;
  const isOpen = dd.style.display !== "none";
  dd.style.display = isOpen ? "none" : "block";
  Dom.modelBtn()?.setAttribute("aria-expanded", String(!isOpen));

  if (!isOpen) {
    // Close on outside click
    const close = (e) => {
      if (!dd.contains(e.target) && e.target !== Dom.modelBtn() && !Dom.modelBtn()?.contains(e.target)
          && e.target !== document.querySelector(".input-area__model-pill")) {
        dd.style.display = "none";
        Dom.modelBtn()?.setAttribute("aria-expanded", "false");
        document.removeEventListener("click", close);
      }
    };
    setTimeout(() => document.addEventListener("click", close), 0);
  }
}

function selectModel(key) {
  if (!DASH_MODELS[key]) return;
  State.currentModel = key;
  lsSet(LS.MODEL, key);
  updateModelUI();
  toggleModelDropdown();
  showSuccess(`Switched to ${DASH_MODELS[key].displayName}`);
}

function updateModelUI() {
  const config = getModelConfig(State.currentModel);

  // Topbar button label
  const label = Dom.modelBtnLabel();
  if (label) label.textContent = config.displayName;

  // Input footer pill
  const inputLabel = Dom.inputModelLabel();
  if (inputLabel) inputLabel.textContent = config.displayName;

  // Dropdown active states
  document.querySelectorAll(".topbar__model-option").forEach(opt => {
    opt.classList.toggle("topbar__model-option--active", opt.dataset.model === State.currentModel);
  });

  // Settings default model select
  const settingsSel = document.getElementById("settings-default-model");
  if (settingsSel) settingsSel.value = State.currentModel;
}


/* ==========================================================================
   26. KEYBOARD SHORTCUTS
   ========================================================================== */

function initKeyboardShortcuts() {
  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;

    if (e.key === "Escape") {
      closeAllModals();
      if (State.voiceActive) stopVoiceInput();
      const dd = Dom.modelDropdown();
      if (dd) dd.style.display = "none";
      return;
    }

    // Only handle shortcuts on the chat screen
    if (!Dom.screenChat()?.classList.contains("active-screen")) return;

    if (mod && e.key === "k") {
      e.preventDefault();
      const search = Dom.sidebarSearch();
      if (search) {
        if (Dom.sidebar()?.classList.contains("is-collapsed")) toggleSidebar();
        search.focus(); search.select();
      }
      return;
    }

    if (mod && e.key === "b") { e.preventDefault(); toggleSidebar(); return; }

    if (mod && e.shiftKey && (e.key === "O" || e.key === "o")) {
      e.preventDefault(); startNewChat(); Dom.chatInput()?.focus(); return;
    }

    if (mod && e.key === ",") { e.preventDefault(); openModal("modal-settings"); return; }

    if (mod && e.shiftKey && (e.key === "V" || e.key === "v")) {
      e.preventDefault(); toggleVoiceInput(); return;
    }

    // / to focus input (when not already focused on an input)
    if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)) {
      e.preventDefault();
      Dom.chatInput()?.focus();
      return;
    }

    // Enter to send
    if (e.key === "Enter" && !e.shiftKey) {
      const activeEl = document.activeElement;
      const input = Dom.chatInput();
      const enterSend = document.getElementById("settings-enter-send")?.checked ?? true;
      if (activeEl === input && enterSend) { e.preventDefault(); sendMessage(null); }
    }
  });
}

function initTextareaAutoResize() {
  const input = Dom.chatInput();
  if (!input) return;
  input.addEventListener("input", () => autoResizeTextarea(input));
}


/* ==========================================================================
   27. PWA INSTALL
   ========================================================================== */

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  State.installPrompt = e;
  State.installPromptAvailable = true;
});

function triggerPwaInstall() {
  if (!State.installPrompt) return showInfo("Already installed or not available.");
  State.installPrompt.prompt();
  State.installPrompt.userChoice.then(result => {
    if (result.outcome === "accepted") {
      showSuccess("DashyCore installed!");
      State.installPrompt = null;
    }
  });
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js")
    .then(reg => console.log("[SW] Registered:", reg.scope))
    .catch(err => console.warn("[SW] Failed:", err));
}


/* ==========================================================================
   28. APP BOOT
   ========================================================================== */

function initApp() {
  try {
    // Init Firebase first
    initFirebase();

    // Show title screen
    showScreen("screen-title");

    // Auto-advance to login (unless Firebase auto-logs in first)
    setTimeout(() => {
      if (Dom.screenTitle()?.classList.contains("active-screen") && !State.currentUser) {
        goToLogin();
      }
    }, 2600);

    // Wire up events
    initTextareaAutoResize();
    initKeyboardShortcuts();

    // Settings listeners
    document.getElementById("settings-speech-rate")?.addEventListener("input", updateSpeechRateDisplay);
    document.getElementById("settings-enter-send")?.addEventListener("change", (e) => {
      lsSet(LS.ENTER_SEND, e.target.checked);
    });

    // Register SW
    registerServiceWorker();

    console.log("[DashyCore] v5.1 initialized ✓");
  } catch (err) {
    console.error("[DashyCore] Boot error:", err);
    showError("DashyCore failed to initialize. Please refresh.");
  }
}

// Global error handlers
window.addEventListener("error", (e) => {
  console.error("[DashyCore] Error:", e.error);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("[DashyCore] Unhandled:", e.reason);
});

// Boot
document.addEventListener("DOMContentLoaded", initApp);