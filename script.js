<script>
/* =========================================================
   ACADEMEFORGE STUDENT APP - EDGE FUNCTION ONLY BUILD
   Architecture: Multiple Supabase Edge Functions
   Auth: Custom Email OTP via Resend-backed Edge Function
   Frontend: Plain HTML/CSS/JS compatible
   Supabase JS: v2
========================================================= */

"use strict";

/* =========================================================
   CONFIG
========================================================= */

const STUDENT_SUPABASE_URL = "https://afooyyydhlwngzssgqih.supabase.co";

const STUDENT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImFmb295eXlkaGx3bmd6c3NncWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NDQxMjgsImV4cCI6MjA5NDIyMDEyOH0.KG0XO0oP_2MpewHoIwTtbrKg5FkyOYRUtVzLH1MSJiE";

const AF_WEBSITE_LINK = "https://academeforge.in";

const AF_RAZORPAY_KEY_ID = "rzp_test_SpO0DdKfoz5wRu";

const AF_EDGE_FUNCTIONS = Object.freeze({
  SEND_OTP: "student-send-otp-af",
  VERIFY_OTP: "student-verify-otp-af",
  LOGOUT: "student-logout-af",
  SESSION_VERIFY: "student-session-verify-af",
  PROFILE: "student-profile-af",
  UPDATE_PROFILE: "student-update-profile-af",

  COURSES: "student-courses-af",
  CHAPTERS: "student-chapters-af",
  LECTURES: "student-lectures-af",
  NOTES: "student-notes-af",
  LECTURE_PROGRESS: "student-lecture-progress-af",

  COMMUNITY: "af-nexus-community-v2",

  TESTS_DASHBOARD: "student-tests-dashboard-af",
  TEST_START: "student-test-start-af",
  TEST_SAVE_DRAFT: "student-test-save-draft-af",
  TEST_SUBMIT: "student-test-submit-af",
  TEST_HISTORY: "student-test-history-af",
  TEST_RANKING: "student-test-ranking-af",

  CREATE_RAZORPAY_ORDER: "student-create-razorpay-order-af",
  VERIFY_PAYMENT: "student-verify-payment-af",
  ENROLLMENTS: "student-enrollments-af",

  NOTIFICATIONS: "student-notifications-af"
});

const AF_STORAGE_KEYS = Object.freeze({
  LOGGED_IN: "af_student_logged_in",
  STUDENT_UUID: "af_student_uuid",
  STUDENT_ID: "af_student_id",
  STUDENT_NAME: "af_student_name",
  STUDENT_EMAIL: "af_student_email",
  STUDENT_MOBILE: "af_student_mobile",
  SESSION_TOKEN: "af_student_session_token",
  SESSION_ID: "af_student_session_id",
  SESSION_EXPIRES_AT: "af_student_session_expires_at",
  DEVICE_ID: "af_student_device_id",
  LAST_LOGIN_AT: "af_student_last_login_at",
  LOGIN_TIME: "af_student_login_time",
  PROFILE_CACHE: "af_student_profile_cache_v1",
  COURSE_CACHE: "af_student_course_cache_v1",
  NOTIFICATION_SEEN_AT: "af_student_notification_seen_at_v1",
  COMMUNITY_CACHE: "af_nexus_posts_cache_v2",
  THEME_MODE: "academeThemeMode"
});

const AF_DEFAULT_TIMEOUT_MS = 20000;
const AF_READ_RETRY_COUNT = 1;
const AF_OTP_COOLDOWN_SECONDS = 45;
const AF_TEST_DRAFT_DEBOUNCE_MS = 1200;

/* =========================================================
   SUPABASE CLIENT
========================================================= */

let studentDb = null;

(function initSupabaseClientaf() {
  if (typeof supabase === "undefined" || !supabase || typeof supabase.createClient !== "function") {
    console.error("Supabase JS v2 is required before this script.");
    return;
  }

  studentDb = supabase.createClient(STUDENT_SUPABASE_URL, STUDENT_SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: {
      headers: {
        "x-af-client": "student-web",
        "x-af-version": "2026.05.19"
      }
    }
  });

  window.studentDb = studentDb;
})();

/* =========================================================
   GLOBAL STATE
========================================================= */

let afPendingAuth = {
  purpose: "",
  email: "",
  mobile: "",
  fullName: "",
  courseInterest: "",
  referralCode: "",
  otpRequestId: "",
  expiresInSeconds: 0,
  sentAt: 0
};

let afCurrentStudent = null;
let afEnrolledCourses = [];
let afSelectedCourse = null;
let afSelectedChapterId = null;
let afLearningMode = "lectures";

let afCommunityPostsCache = [];
let afCommunityCursor = null;
let afCommunityBusy = false;

let afSelectedBatch = null;
let afEnrolledCourseSlugs = [];

let afCurrentTest = null;
let afTestDraftTimer = null;
let afTestAnswers = Object.create(null);

const afBatchPrice = 499;
const afBatchOldPrice = 999;
const afBatchDiscount = Math.round(((afBatchOldPrice - afBatchPrice) / afBatchOldPrice) * 100);

const afCourseIdBySlug = Object.freeze({
  "ai-prompt-engineering": "0e6d4d11-0afc-4070-bbf2-23950cc71da0",
  "ai-coding": "ad0b6211-f5d1-4d31-982f-386f286778bf",
  "graphic-design": "483ed390-1923-4198-a003-0ff46ec8dba9",
  "freelancing": "7fd5fc14-1ce8-46f8-9cbb-5fab1abb5cd9",
  "video-editing": "4cdd5351-b370-4d07-8841-b4024a0bcb27"
});

const afBatches = [
  {
    id: "video-editing",
    courseSlug: "video-editing",
    courseId: afCourseIdBySlug["video-editing"],
    image: "Course 1.jpeg",
    category: "Target",
    language: "HINGLISH",
    title: "Video & Media Editing Mastery",
    subtitle: "Learn editing, storytelling, reels, shorts, and professional content creation.",
    status: "Beta Mode",
    startText: "Enroll Now",
    price: afBatchPrice,
    oldPrice: afBatchOldPrice,
    details: "A practical batch for learners who want to build strong video editing skills for reels, shorts, YouTube content, social media creatives, and professional digital projects.",
    learn: [
      "Timeline editing and clean workflow",
      "Reels, shorts, and social media video structure",
      "Transitions, captions, audio sync, and color correction",
      "Content planning and storytelling basics",
      "Project-based editing practice"
    ],
    facilities: [
      "Chapter-wise learning",
      "Lecture and notes support",
      "Practice-based tasks",
      "Future certificate support",
      "Batch access after successful purchase"
    ]
  },
  {
    id: "graphic-design",
    courseSlug: "graphic-design",
    courseId: afCourseIdBySlug["graphic-design"],
    image: "Course 2.jpeg",
    category: "Target",
    language: "HINGLISH",
    title: "Creative & Graphic Design Mastery",
    subtitle: "Design posters, thumbnails, banners, brand creatives, and visual content.",
    status: "Beta Mode",
    startText: "Enroll Now",
    price: afBatchPrice,
    oldPrice: afBatchOldPrice,
    details: "A creative batch focused on design fundamentals, social media creatives, thumbnails, posters, brand layouts, typography, and portfolio-ready visual design practice.",
    learn: [
      "Design principles and layout basics",
      "Poster, banner, and thumbnail design",
      "Typography, color balance, and spacing",
      "Brand-style social media creatives",
      "Portfolio-focused design practice"
    ],
    facilities: [
      "Design practice tasks",
      "Creative assignments",
      "Notes for quick revision",
      "Portfolio guidance",
      "Future project review"
    ]
  },
  {
    id: "ai-coding",
    courseSlug: "ai-coding",
    courseId: afCourseIdBySlug["ai-coding"],
    image: "Course 3.jpeg",
    category: "Target",
    language: "HINGLISH",
    title: "AI Coding & Logic Foundation",
    subtitle: "Build coding logic, AI basics, prompts, and beginner-friendly programming thinking.",
    status: "Beta Mode",
    startText: "Enroll Now",
    price: afBatchPrice,
    oldPrice: afBatchOldPrice,
    details: "A beginner-friendly batch designed to build programming thinking, logic, AI-assisted coding workflow, problem solving, and project structure from the ground level.",
    learn: [
      "Logic building and problem solving",
      "Programming basics for beginners",
      "AI-assisted coding workflow",
      "Prompt thinking for coding tasks",
      "Mini project planning and structure"
    ],
    facilities: [
      "Beginner-friendly explanations",
      "Practice questions",
      "Chapter-wise notes",
      "Mini project ideas",
      "Future coding dashboard support"
    ]
  },
  {
    id: "freelancing",
    courseSlug: "freelancing",
    courseId: afCourseIdBySlug["freelancing"],
    image: "Course 4.jpeg",
    category: "Target",
    language: "HINGLISH",
    title: "Freelancing & Monetization Roadmap",
    subtitle: "Understand digital earning, freelancing basics, client work, and skill monetization.",
    status: "Beta Mode",
    startText: "Enroll Now",
    price: afBatchPrice,
    oldPrice: afBatchOldPrice,
    details: "A practical batch for students who want to understand freelancing basics, profile building, client communication, service packaging, pricing, and online earning discipline.",
    learn: [
      "Freelancing basics and service selection",
      "Profile and portfolio building",
      "Client communication fundamentals",
      "Pricing and delivery discipline",
      "Online earning mindset and roadmap"
    ],
    facilities: [
      "Freelancing roadmap",
      "Profile guidance",
      "Notes and examples",
      "Practical task ideas",
      "Future mentorship support"
    ]
  },
  {
    id: "ai-prompt-engineering",
    courseSlug: "ai-prompt-engineering",
    courseId: afCourseIdBySlug["ai-prompt-engineering"],
    image: "Course 5.jpeg",
    category: "Target",
    language: "HINGLISH",
    title: "AI & Prompt Engineering",
    subtitle: "Master AI tools, prompt structure, productivity workflows, and practical automation thinking.",
    status: "Beta Mode",
    startText: "Enroll Now",
    price: afBatchPrice,
    oldPrice: afBatchOldPrice,
    details: "A modern AI-focused batch covering prompt engineering, AI tool usage, structured prompting, productivity workflows, content generation, research support, and practical AI implementation for students and creators.",
    learn: [
      "Prompt engineering fundamentals",
      "AI tools for study, content, and productivity",
      "Structured prompts for better output",
      "Research, writing, and automation workflows",
      "Practical AI use cases for real projects"
    ],
    facilities: [
      "Prompt templates and examples",
      "Practice-based AI tasks",
      "Chapter-wise notes",
      "Real workflow demonstrations",
      "Future AI project support"
    ]
  }
];

/* =========================================================
   SMALL UTILITIES
========================================================= */

function afEl(id) {
  return document.getElementById(id);
}

function afQ(selector, root) {
  return (root || document).querySelector(selector);
}

function afQA(selector, root) {
  return Array.prototype.slice.call((root || document).querySelectorAll(selector));
}

function afNowIso() {
  return new Date().toISOString();
}

function afSafeText(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback || "";
  return String(value);
}

function afTrim(value) {
  return String(value || "").trim();
}

function afLower(value) {
  return afTrim(value).toLowerCase();
}

function afEscapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function afSafeUrl(value) {
  const raw = afTrim(value);

  if (!raw) return "";

  try {
    const url = new URL(raw, window.location.origin);
    const allowed = ["http:", "https:", "blob:"];
    if (!allowed.includes(url.protocol)) return "";
    return url.href;
  } catch (err) {
    return "";
  }
}

function afSetText(id, text) {
  const el = afEl(id);
  if (el) el.textContent = afSafeText(text);
}

function afSetHtml(id, html) {
  const el = afEl(id);
  if (el) el.innerHTML = String(html || "");
}

function afShow(elOrId, display) {
  const el = typeof elOrId === "string" ? afEl(elOrId) : elOrId;
  if (!el) return;
  el.classList.remove("hidden-box");
  el.classList.remove("af-hidden");
  el.style.display = display || "block";
}

function afHide(elOrId) {
  const el = typeof elOrId === "string" ? afEl(elOrId) : elOrId;
  if (!el) return;
  el.classList.add("hidden-box");
  el.classList.add("af-hidden");
  el.style.display = "none";
}

function afDisableButton(buttonOrId, disabled, text) {
  const button = typeof buttonOrId === "string" ? afEl(buttonOrId) : buttonOrId;
  if (!button) return;

  button.disabled = !!disabled;

  if (typeof text === "string") {
    if (!button.dataset.afOriginalText) {
      button.dataset.afOriginalText = button.textContent || "";
    }

    button.textContent = text;
  } else if (!disabled && button.dataset.afOriginalText) {
    button.textContent = button.dataset.afOriginalText;
  }
}

function afRandomId(prefix) {
  const cryptoObj = window.crypto || window.msCrypto;

  if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
    const arr = new Uint32Array(4);
    cryptoObj.getRandomValues(arr);
    return String(prefix || "af") + "_" + Array.prototype.map.call(arr, function (n) {
      return n.toString(36);
    }).join("");
  }

  return String(prefix || "af") + "_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
}

function afSleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

function afJsonParse(raw, fallback) {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function afJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch (err) {
    return "";
  }
}

function afSetStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (err) {}
}

function afGetStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (err) {
    return null;
  }
}

function afRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch (err) {}
}

function afGetOrCreateDeviceId() {
  let id = afGetStorage(AF_STORAGE_KEYS.DEVICE_ID);

  if (!id) {
    id = afRandomId("af_device");
    afSetStorage(AF_STORAGE_KEYS.DEVICE_ID, id);
  }

  return id;
}

function afGetDeviceInfo() {
  return {
    deviceId: afGetOrCreateDeviceId(),
    userAgent: navigator.userAgent || "",
    platform: navigator.platform || "",
    language: navigator.language || "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata",
    screen: {
      width: window.screen && window.screen.width ? window.screen.width : 0,
      height: window.screen && window.screen.height ? window.screen.height : 0,
      pixelRatio: window.devicePixelRatio || 1
    }
  };
}

function afIsOnline() {
  return navigator.onLine !== false;
}

/* =========================================================
   TOAST / MESSAGE
========================================================= */

function showToast(title, message) {
  const toast = afEl("toast");

  if (!toast) {
    console.log(String(title || ""), String(message || ""));
    return;
  }

  const strong = toast.querySelector("strong");
  const p = toast.querySelector("p");

  if (strong) strong.textContent = afSafeText(title);
  if (p) p.textContent = afSafeText(message);

  toast.classList.add("show");

  window.clearTimeout(showToast._timer);
  showToast._timer = window.setTimeout(function () {
    toast.classList.remove("show");
  }, 3000);
}

function showStudentMessageaf(type, text) {
  const box = afEl("studentMessageaf");

  if (!box) {
    if (type === "err") {
      showToast("Network Error", text || "Please try again.");
    } else {
      showToast("Status", text || "");
    }
    return;
  }

  box.className = "student-messageaf " + (type === "ok" ? "ok" : "err");
  box.textContent = afSafeText(text);
}

function afPublicErrorMessage(result, fallback) {
  if (!result) return fallback || "Network error. Please try again.";

  const code = result && result.error && result.error.code ? String(result.error.code) : "";
  const message = result && result.error && result.error.message ? String(result.error.message) : "";
  const directMessage = result && result.message ? String(result.message) : "";

  if (code === "UNAUTHORIZED" || code === "SESSION_EXPIRED" || code === "AUTH_REQUIRED") {
    return "Session expired. Please login again.";
  }

  if (code === "INVALID_OTP") {
    return "Invalid OTP. Please check and try again.";
  }

  if (code === "OTP_EXPIRED") {
    return "OTP expired. Please request a new OTP.";
  }

  if (code === "RATE_LIMITED") {
    return "Too many attempts. Please try again later.";
  }

  if (code === "VALIDATION_ERROR") {
    return message || directMessage || "Please check your details and try again.";
  }

  if (message) return message;
  if (directMessage) return directMessage;

  return fallback || "Network error. Please try again.";
}

/* =========================================================
   VALIDATION
========================================================= */

function cleanPhoneaf(value) {
  return String(value || "").trim().replace(/\D/g, "");
}

function afIsValidEmail(email) {
  const value = afLower(email);
  if (!value || value.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function afValidateFullName(name) {
  const value = afTrim(name).replace(/\s+/g, " ");

  if (!value) {
    return {
      ok: false,
      value: "",
      message: "Please enter your full name."
    };
  }

  if (value.length < 3) {
    return {
      ok: false,
      value: "",
      message: "Full name must be at least 3 characters."
    };
  }

  if (value.length > 80) {
    return {
      ok: false,
      value: "",
      message: "Full name is too long."
    };
  }

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ\s.'-]+$/.test(value)) {
    return {
      ok: false,
      value: "",
      message: "Please enter a valid full name."
    };
  }

  return {
    ok: true,
    value: value,
    message: ""
  };
}

function afValidateIndianMobile(value, required) {
  const mobile = cleanPhoneaf(value);

  if (!mobile && required === false) {
    return {
      ok: true,
      value: "",
      message: ""
    };
  }

  if (!mobile) {
    return {
      ok: false,
      value: "",
      message: "Please enter your 10-digit mobile number."
    };
  }

  if (!/^\d+$/.test(mobile)) {
    return {
      ok: false,
      value: "",
      message: "Mobile number should contain digits only."
    };
  }

  if (mobile.length !== 10) {
    return {
      ok: false,
      value: "",
      message: "Enter a valid 10-digit Indian mobile number."
    };
  }

  if (!/^[6-9]\d{9}$/.test(mobile)) {
    return {
      ok: false,
      value: "",
      message: "Indian mobile number must start with 6, 7, 8, or 9."
    };
  }

  if (/^(\d)\1{9}$/.test(mobile)) {
    return {
      ok: false,
      value: "",
      message: "Please enter a real mobile number, not repeated digits."
    };
  }

  const blocked = new Set([
    "1234567890",
    "9876543210",
    "0123456789",
    "9999999999",
    "8888888888",
    "7777777777",
    "6666666666",
    "5555555555",
    "4444444444",
    "3333333333",
    "2222222222",
    "1111111111",
    "0000000000"
  ]);

  if (blocked.has(mobile)) {
    return {
      ok: false,
      value: "",
      message: "Please enter a real mobile number."
    };
  }

  let ascending = true;
  let descending = true;

  for (let i = 1; i < mobile.length; i += 1) {
    const prev = Number(mobile[i - 1]);
    const curr = Number(mobile[i]);

    if (curr !== (prev + 1) % 10) ascending = false;
    if (curr !== (prev + 9) % 10) descending = false;
  }

  if (ascending || descending) {
    return {
      ok: false,
      value: "",
      message: "Please enter a real mobile number."
    };
  }

  return {
    ok: true,
    value: mobile,
    message: ""
  };
}

function afValidateOtp(value) {
  const otp = String(value || "").trim().replace(/\D/g, "");

  if (!/^\d{6}$/.test(otp)) {
    return {
      ok: false,
      value: "",
      message: "Enter valid 6 digit OTP."
    };
  }

  if (/^(\d)\1{5}$/.test(otp)) {
    return {
      ok: false,
      value: "",
      message: "Enter valid 6 digit OTP."
    };
  }

  return {
    ok: true,
    value: otp,
    message: ""
  };
}

function afValidateReferralCode(value) {
  const code = afTrim(value).toUpperCase();

  if (!code) {
    return {
      ok: true,
      value: "",
      message: ""
    };
  }

  if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
    return {
      ok: false,
      value: "",
      message: "Referral code is not valid."
    };
  }

  return {
    ok: true,
    value: code,
    message: ""
  };
}

/* =========================================================
   EDGE FUNCTION CLIENT
========================================================= */

function afNormalizeEdgeData(data) {
  if (!data) {
    return {
      ok: false,
      data: null,
      error: {
        code: "EMPTY_RESPONSE",
        message: "Network error. Please try again.",
        details: {}
      },
      meta: {
        requestId: "",
        serverTime: afNowIso()
      }
    };
  }

  if (typeof data.ok === "boolean") {
    return {
      ok: data.ok,
      data: data.data === undefined ? null : data.data,
      error: data.error === undefined ? null : data.error,
      meta: data.meta || {
        requestId: "",
        serverTime: afNowIso()
      },
      message: data.message || ""
    };
  }

  return {
    ok: true,
    data: data,
    error: null,
    meta: {
      requestId: "",
      serverTime: afNowIso()
    }
  };
}

async function afEdgeCall(functionName, payload, options) {
  const opts = options || {};
  const timeoutMs = Number(opts.timeoutMs || AF_DEFAULT_TIMEOUT_MS);
  const retryCount = Number(opts.retryCount || 0);
  const safeRead = opts.safeRead === true;

  if (!studentDb || !studentDb.functions || typeof studentDb.functions.invoke !== "function") {
    return {
      ok: false,
      data: null,
      error: {
        code: "BACKEND_NOT_CONNECTED",
        message: "Network error. Please try again.",
        details: {}
      },
      meta: {
        requestId: "",
        serverTime: afNowIso()
      }
    };
  }

  if (!afIsOnline()) {
    return {
      ok: false,
      data: null,
      error: {
        code: "OFFLINE",
        message: "Network error. Please check your internet connection.",
        details: {}
      },
      meta: {
        requestId: "",
        serverTime: afNowIso()
      }
    };
  }

  const finalPayload = Object.assign({}, payload || {}, {
    client: {
      app: "academe-forge-student-web",
      version: "2026.05.19",
      device: afGetDeviceInfo()
    }
  });

  let attempt = 0;
  let lastResult = null;

  while (attempt <= retryCount) {
    attempt += 1;

    try {
      const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller ? window.setTimeout(function () {
        controller.abort();
      }, timeoutMs) : null;

      const invokeOptions = {
        body: finalPayload
      };

      if (controller) {
        invokeOptions.signal = controller.signal;
      }

      const response = await studentDb.functions.invoke(functionName, invokeOptions);

      if (timer) window.clearTimeout(timer);

      if (response && response.error) {
        console.error("AF Edge error:", functionName, response.error);

        lastResult = {
          ok: false,
          data: null,
          error: {
            code: response.error.context && response.error.context.status === 401 ? "UNAUTHORIZED" : "EDGE_ERROR",
            message: "Network error. Please try again.",
            details: {}
          },
          meta: {
            requestId: "",
            serverTime: afNowIso()
          }
        };
      } else {
        lastResult = afNormalizeEdgeData(response ? response.data : null);
      }

      if (lastResult.ok) return lastResult;

      const code = lastResult.error && lastResult.error.code ? String(lastResult.error.code) : "";

      if (code === "UNAUTHORIZED" || code === "SESSION_EXPIRED" || code === "AUTH_REQUIRED") {
        return lastResult;
      }

      if (!safeRead) return lastResult;

    } catch (err) {
      console.error("AF Edge catch:", functionName, err);

      lastResult = {
        ok: false,
        data: null,
        error: {
          code: err && err.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR",
          message: "Network error. Please try again.",
          details: {}
        },
        meta: {
          requestId: "",
          serverTime: afNowIso()
        }
      };

      if (!safeRead) return lastResult;
    }

    if (attempt <= retryCount) {
      await afSleep(350 * attempt);
    }
  }

  return lastResult || {
    ok: false,
    data: null,
    error: {
      code: "UNKNOWN",
      message: "Network error. Please try again.",
      details: {}
    },
    meta: {
      requestId: "",
      serverTime: afNowIso()
    }
  };
}

function afAuthPayload(extra) {
  return Object.assign({}, extra || {}, {
    student_id: afGetStorage(AF_STORAGE_KEYS.STUDENT_UUID) || "",
    session_token: afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN) || "",
    session_id: afGetStorage(AF_STORAGE_KEYS.SESSION_ID) || "",
    device_id: afGetOrCreateDeviceId()
  });
}

function afExtractList(result, key) {
  if (!result || !result.ok) return [];

  if (result.data && Array.isArray(result.data[key])) return result.data[key];
  if (Array.isArray(result[key])) return result[key];

  return [];
}

function afExtractObject(result, key) {
  if (!result || !result.ok) return null;

  if (result.data && result.data[key] && typeof result.data[key] === "object") return result.data[key];
  if (result[key] && typeof result[key] === "object") return result[key];

  return null;
}

/* =========================================================
   SESSION
========================================================= */

function saveStudentSessionaf(authData) {
  const data = authData || {};
  const student = data.student || data.profile || data;
  const session = data.session || {};

  const studentUuid = afSafeText(student.id || student.uuid || student.student_uuid || "");
  const studentId = afSafeText(student.student_id || student.studentId || "");
  const name = afSafeText(student.name || student.full_name || student.fullName || "Student");
  const email = afLower(student.email || "");
  const mobile = cleanPhoneaf(student.mobile || student.phone || "");
  const token = afSafeText(session.token || data.token || data.session_token || "");
  const sessionId = afSafeText(session.sessionId || session.session_id || data.session_id || "");
  const expiresAt = afSafeText(session.expiresAt || session.expires_at || data.expires_at || "");

  if (!studentUuid) {
    return false;
  }

  afSetStorage(AF_STORAGE_KEYS.LOGGED_IN, "true");
  afSetStorage(AF_STORAGE_KEYS.STUDENT_UUID, studentUuid);
  afSetStorage(AF_STORAGE_KEYS.STUDENT_ID, studentId);
  afSetStorage(AF_STORAGE_KEYS.STUDENT_NAME, name);
  afSetStorage(AF_STORAGE_KEYS.STUDENT_EMAIL, email);
  afSetStorage(AF_STORAGE_KEYS.STUDENT_MOBILE, mobile);
  afSetStorage(AF_STORAGE_KEYS.SESSION_TOKEN, token);
  afSetStorage(AF_STORAGE_KEYS.SESSION_ID, sessionId);
  afSetStorage(AF_STORAGE_KEYS.SESSION_EXPIRES_AT, expiresAt);
  afSetStorage(AF_STORAGE_KEYS.LOGIN_TIME, afNowIso());

  if (student.last_login_at || data.last_login_at) {
    afSetStorage(AF_STORAGE_KEYS.LAST_LOGIN_AT, student.last_login_at || data.last_login_at);
  }

  afSetStorage(AF_STORAGE_KEYS.PROFILE_CACHE, afJsonStringify({
    id: studentUuid,
    student_id: studentId,
    name: name,
    email: email,
    mobile: mobile,
    status: student.status || "active",
    last_login_at: student.last_login_at || data.last_login_at || afNowIso()
  }));

  afCurrentStudent = getCurrentStudentaf();

  return true;
}

function getCurrentStudentaf() {
  const cached = afJsonParse(afGetStorage(AF_STORAGE_KEYS.PROFILE_CACHE), null);

  return {
    id: afGetStorage(AF_STORAGE_KEYS.STUDENT_UUID) || (cached && cached.id) || "",
    student_id: afGetStorage(AF_STORAGE_KEYS.STUDENT_ID) || (cached && cached.student_id) || "",
    mobile: afGetStorage(AF_STORAGE_KEYS.STUDENT_MOBILE) || (cached && cached.mobile) || "",
    name: afGetStorage(AF_STORAGE_KEYS.STUDENT_NAME) || (cached && cached.name) || "Student",
    email: afGetStorage(AF_STORAGE_KEYS.STUDENT_EMAIL) || (cached && cached.email) || "",
    session_token: afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN) || "",
    session_id: afGetStorage(AF_STORAGE_KEYS.SESSION_ID) || "",
    expires_at: afGetStorage(AF_STORAGE_KEYS.SESSION_EXPIRES_AT) || ""
  };
}

function afIsLoggedIn() {
  const loggedIn = afGetStorage(AF_STORAGE_KEYS.LOGGED_IN) === "true";
  const studentId = afGetStorage(AF_STORAGE_KEYS.STUDENT_UUID);
  const token = afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN);

  return !!(loggedIn && studentId && token);
}

function clearStudentSessionaf() {
  Object.keys(AF_STORAGE_KEYS).forEach(function (key) {
    const storageKey = AF_STORAGE_KEYS[key];

    if (
      storageKey === AF_STORAGE_KEYS.DEVICE_ID ||
      storageKey === AF_STORAGE_KEYS.THEME_MODE ||
      storageKey === AF_STORAGE_KEYS.NOTIFICATION_SEEN_AT
    ) {
      return;
    }

    afRemoveStorage(storageKey);
  });

  afCurrentStudent = null;
  afEnrolledCourses = [];
  afSelectedCourse = null;
  afSelectedChapterId = null;
  afLearningMode = "lectures";
  afCommunityPostsCache = [];
  afCommunityCursor = null;
  afCurrentTest = null;
  afTestAnswers = Object.create(null);
}

async function verifyStudentSessionaf() {
  if (!afIsLoggedIn()) {
    return false;
  }

  const result = await afEdgeCall(
    AF_EDGE_FUNCTIONS.SESSION_VERIFY,
    afAuthPayload({}),
    {
      safeRead: true,
      retryCount: AF_READ_RETRY_COUNT
    }
  );

  if (!result.ok) {
    const code = result.error && result.error.code ? String(result.error.code) : "";

    if (code === "UNAUTHORIZED" || code === "SESSION_EXPIRED" || code === "AUTH_REQUIRED") {
      forceLogoutStudentaf("Session expired. Please login again.");
      return false;
    }

    return true;
  }

  const student = afExtractObject(result, "student");
  const session = afExtractObject(result, "session");

  if (student) {
    saveStudentSessionaf({
      student: student,
      session: session || {
        token: afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN),
        sessionId: afGetStorage(AF_STORAGE_KEYS.SESSION_ID),
        expiresAt: afGetStorage(AF_STORAGE_KEYS.SESSION_EXPIRES_AT)
      }
    });
  }

  return true;
}

async function logoutStudentaf() {
  const payload = afAuthPayload({});

  await afEdgeCall(AF_EDGE_FUNCTIONS.LOGOUT, payload, {
    timeoutMs: 10000,
    safeRead: false
  });

  clearStudentSessionaf();
  showStudentPanelaf("studentAuthCardaf");

  if (typeof switchStudentModeaf === "function") {
    switchStudentModeaf("login");
  }

  showStudentMessageaf("ok", "Logged out successfully.");

  try {
    if (window.afSessionChannel) {
      window.afSessionChannel.postMessage({
        type: "logout",
        reason: "manual"
      });
    }
  } catch (err) {}
}

function logoutStudent() {
  logoutStudentaf();
}

function forceLogoutStudentaf(message) {
  clearStudentSessionaf();
  showStudentPanelaf("studentAuthCardaf");

  if (typeof switchStudentModeaf === "function") {
    switchStudentModeaf("login");
  }

  showStudentMessageaf("err", message || "Session expired. Please login again.");
}

/* =========================================================
   SECTION / PANEL NAVIGATION
========================================================= */

function showSection(sectionId) {
  const sections = document.querySelectorAll(".section");

  sections.forEach(function (section) {
    section.classList.remove("active");
  });

  const targetSection = afEl(sectionId);

  if (targetSection) {
    targetSection.classList.add("active");
  }

  const navButtons = document.querySelectorAll(".nav-btn");

  navButtons.forEach(function (button) {
    button.classList.remove("active");
  });

  const activeButton = document.querySelector('.nav-btn[data-section="' + CSS.escape(sectionId) + '"]');

  if (activeButton) {
    activeButton.classList.add("active");
  }

  if (sectionId === "notifications") {
    loadAppNotifications();
  }

  if (sectionId === "community") {
    initAfNexusV2();
  }

  if (sectionId === "studentaf" || sectionId === "student") {
    refreshStudentAuthUiAf();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

function hideStudentPanelsaf() {
  [
    "studentAuthCardaf",
    "courseSelectBox",
    "noCourseBoxaf",
    "courseDetailsBoxaf",
    "learningBoxaf",
    "chapterBoxaf",
    "contentBoxaf",
    "studentProfileBoxaf",
    "studentEnrollmentBoxaf"
  ].forEach(function (id) {
    const el = afEl(id);
    if (!el) return;

    if (id === "studentAuthCardaf") {
      el.style.display = "none";
    } else {
      el.classList.add("hidden-box");
      el.classList.add("af-hidden");
      el.style.display = "none";
    }
  });
}

function showStudentPanelaf(id) {
  hideStudentPanelsaf();

  const el = afEl(id);
  if (!el) return;

  if (id === "studentAuthCardaf") {
    el.style.display = "block";
  } else {
    el.classList.remove("hidden-box");
    el.classList.remove("af-hidden");
    el.style.display = "block";
  }
}

function refreshStudentAuthUiAf() {
  if (afIsLoggedIn()) {
    openCourseSectionAfterLoginaf(getCurrentStudentaf());
  } else {
    showStudentPanelaf("studentAuthCardaf");

    if (typeof switchStudentModeaf === "function") {
      switchStudentModeaf("login");
    }
  }
}

/* =========================================================
   AUTH UI MODE
========================================================= */

function switchStudentModeaf(mode) {
  const normalized = mode === "signup" || mode === "create" ? "signup" : "login";

  const loginBox = afEl("studentLoginFormaf");
  const signupBox = afEl("studentSignupFormaf");
  const otpBox = afEl("studentOtpFormaf");

  if (loginBox) loginBox.style.display = normalized === "login" ? "block" : "none";
  if (signupBox) signupBox.style.display = normalized === "signup" ? "block" : "none";
  if (otpBox) otpBox.style.display = "none";

  const loginTab = afEl("studentLoginTabaf");
  const signupTab = afEl("studentSignupTabaf");

  if (loginTab) loginTab.classList.toggle("active", normalized === "login");
  if (signupTab) signupTab.classList.toggle("active", normalized === "signup");

  showStudentMessageaf("ok", "");
}

function showOtpPanelaf() {
  const loginBox = afEl("studentLoginFormaf");
  const signupBox = afEl("studentSignupFormaf");
  const otpBox = afEl("studentOtpFormaf");

  if (loginBox) loginBox.style.display = "none";
  if (signupBox) signupBox.style.display = "none";
  if (otpBox) otpBox.style.display = "block";

  const emailText = afEl("studentOtpEmailTextaf");
  if (emailText) {
    emailText.textContent = afPendingAuth.email ? "OTP sent to " + afPendingAuth.email : "Enter OTP sent to your email.";
  }
}

/* =========================================================
   AUTH: SEND OTP
========================================================= */

function afReadInput(ids) {
  for (let i = 0; i < ids.length; i += 1) {
    const el = afEl(ids[i]);
    if (el) return el.value || "";
  }

  return "";
}

async function sendSignupOtpaf() {
  const fullNameRaw = afReadInput(["studentSignupNameaf", "studentFullNameaf", "signupFullNameaf"]);
  const emailRaw = afReadInput(["studentSignupEmailaf", "signupEmailaf", "studentEmailSignupaf"]);
  const mobileRaw = afReadInput(["studentSignupMobileaf", "signupMobileaf", "studentMobileSignupaf"]);
  const courseInterestRaw = afReadInput(["studentCourseInterestaf", "signupCourseInterestaf"]);
  const referralRaw = afReadInput(["studentReferralCodeaf", "signupReferralCodeaf"]);

  const fullName = afValidateFullName(fullNameRaw);

  if (!fullName.ok) {
    showStudentMessageaf("err", fullName.message);
    return;
  }

  const email = afLower(emailRaw);

  if (!afIsValidEmail(email)) {
    showStudentMessageaf("err", "Please enter a valid email address.");
    return;
  }

  const mobile = afValidateIndianMobile(mobileRaw, true);

  if (!mobile.ok) {
    showStudentMessageaf("err", mobile.message);
    return;
  }

  const referral = afValidateReferralCode(referralRaw);

  if (!referral.ok) {
    showStudentMessageaf("err", referral.message);
    return;
  }

  await sendStudentOtpaf({
    purpose: "signup",
    email: email,
    mobile: mobile.value,
    full_name: fullName.value,
    course_interest: afTrim(courseInterestRaw),
    referral_code: referral.value
  });
}

async function sendLoginOtpaf() {
  const emailRaw = afReadInput(["studentLoginEmailaf", "loginEmailaf", "studentEmailLoginaf"]);
  const mobileRaw = afReadInput(["studentLoginMobileaf", "loginMobileaf", "studentMobileLoginaf"]);

  const email = afLower(emailRaw);

  if (!afIsValidEmail(email)) {
    showStudentMessageaf("err", "Please enter a valid email address.");
    return;
  }

  let mobile = {
    ok: true,
    value: "",
    message: ""
  };

  if (afTrim(mobileRaw)) {
    mobile = afValidateIndianMobile(mobileRaw, false);

    if (!mobile.ok) {
      showStudentMessageaf("err", mobile.message);
      return;
    }
  }

  await sendStudentOtpaf({
    purpose: "login",
    email: email,
    mobile: mobile.value
  });
}

async function sendStudentOtpaf(payload) {
  const now = Date.now();

  if (afPendingAuth.sentAt && now - afPendingAuth.sentAt < AF_OTP_COOLDOWN_SECONDS * 1000) {
    const left = Math.ceil((AF_OTP_COOLDOWN_SECONDS * 1000 - (now - afPendingAuth.sentAt)) / 1000);
    showStudentMessageaf("err", "Please wait " + left + " seconds before requesting another OTP.");
    return;
  }

  const sendBtn = payload.purpose === "signup"
    ? afEl("studentSignupOtpBtnaf") || afEl("signupOtpBtnaf")
    : afEl("studentLoginOtpBtnaf") || afEl("loginOtpBtnaf");

  afDisableButton(sendBtn, true, "Sending OTP...");
  showStudentMessageaf("ok", "Sending OTP...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.SEND_OTP, payload, {
    timeoutMs: AF_DEFAULT_TIMEOUT_MS,
    safeRead: false
  });

  afDisableButton(sendBtn, false);

  if (!result.ok) {
    showStudentMessageaf("err", afPublicErrorMessage(result, "Network error. Please try again."));
    return;
  }

  const data = result.data || {};

  afPendingAuth = {
    purpose: payload.purpose,
    email: payload.email,
    mobile: payload.mobile || "",
    fullName: payload.full_name || "",
    courseInterest: payload.course_interest || "",
    referralCode: payload.referral_code || "",
    otpRequestId: data.otpRequestId || data.otp_request_id || result.otpRequestId || result.otp_request_id || "",
    expiresInSeconds: Number(data.expiresInSeconds || data.expires_in_seconds || 300),
    sentAt: Date.now()
  };

  showOtpPanelaf();
  startOtpCooldownaf();
  showStudentMessageaf("ok", "OTP sent. Please check your email.");
}

function startOtpCooldownaf() {
  const resendBtn = afEl("studentResendOtpBtnaf") || afEl("resendOtpBtnaf");

  if (!resendBtn) return;

  let remaining = AF_OTP_COOLDOWN_SECONDS;

  resendBtn.disabled = true;
  resendBtn.textContent = "Resend OTP in " + remaining + "s";

  window.clearInterval(startOtpCooldownaf._timer);

  startOtpCooldownaf._timer = window.setInterval(function () {
    remaining -= 1;

    if (remaining <= 0) {
      window.clearInterval(startOtpCooldownaf._timer);
      resendBtn.disabled = false;
      resendBtn.textContent = "Resend OTP";
      return;
    }

    resendBtn.textContent = "Resend OTP in " + remaining + "s";
  }, 1000);
}

async function resendStudentOtpaf() {
  if (!afPendingAuth || !afPendingAuth.email || !afPendingAuth.purpose) {
    showStudentMessageaf("err", "Please start login again.");
    return;
  }

  await sendStudentOtpaf({
    purpose: afPendingAuth.purpose,
    email: afPendingAuth.email,
    mobile: afPendingAuth.mobile,
    full_name: afPendingAuth.fullName,
    course_interest: afPendingAuth.courseInterest,
    referral_code: afPendingAuth.referralCode
  });
}

/* =========================================================
   AUTH: VERIFY OTP
========================================================= */

async function verifyStudentOtpaf() {
  const otpRaw = afReadInput(["studentOtpInputaf", "studentOtpaf", "otpInputaf"]);
  const otp = afValidateOtp(otpRaw);

  if (!otp.ok) {
    showStudentMessageaf("err", otp.message);
    return;
  }

  if (!afPendingAuth.email || !afPendingAuth.purpose) {
    showStudentMessageaf("err", "Please request OTP again.");
    return;
  }

  const verifyBtn = afEl("studentVerifyOtpBtnaf") || afEl("verifyOtpBtnaf");

  afDisableButton(verifyBtn, true, "Verifying...");
  showStudentMessageaf("ok", "Verifying OTP...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.VERIFY_OTP, {
    purpose: afPendingAuth.purpose,
    email: afPendingAuth.email,
    mobile: afPendingAuth.mobile,
    full_name: afPendingAuth.fullName,
    course_interest: afPendingAuth.courseInterest,
    referral_code: afPendingAuth.referralCode,
    otp: otp.value,
    otpRequestId: afPendingAuth.otpRequestId,
    otp_request_id: afPendingAuth.otpRequestId,
    device: afGetDeviceInfo()
  }, {
    timeoutMs: AF_DEFAULT_TIMEOUT_MS,
    safeRead: false
  });

  afDisableButton(verifyBtn, false);

  if (!result.ok) {
    showStudentMessageaf("err", afPublicErrorMessage(result, "Invalid OTP. Please try again."));
    return;
  }

  const data = result.data || result;

  const saved = saveStudentSessionaf(data);

  if (!saved) {
    showStudentMessageaf("err", "Login failed. Please try again.");
    return;
  }

  afPendingAuth = {
    purpose: "",
    email: "",
    mobile: "",
    fullName: "",
    courseInterest: "",
    referralCode: "",
    otpRequestId: "",
    expiresInSeconds: 0,
    sentAt: 0
  };

  showStudentMessageaf("ok", "Login successful.");
  openCourseSectionAfterLoginaf(getCurrentStudentaf());
}

/* =========================================================
   LOGIN SUCCESS / COURSE AREA
========================================================= */

function openCourseSectionAfterLoginaf(studentData) {
  if (studentData) {
    saveStudentSessionaf({
      student: studentData,
      session: {
        token: studentData.session_token || afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN),
        sessionId: studentData.session_id || afGetStorage(AF_STORAGE_KEYS.SESSION_ID),
        expiresAt: studentData.expires_at || afGetStorage(AF_STORAGE_KEYS.SESSION_EXPIRES_AT)
      }
    });
  }

  const current = getCurrentStudentaf();

  afSetText("studentWelcomeTextaf", "Welcome " + afSafeText(current.name, "Student"));
  afSetText("studentProfileNameaf", afSafeText(current.name, "Student"));
  afSetText("studentProfileEmailaf", afSafeText(current.email, ""));
  afSetText("studentProfileMobileaf", afSafeText(current.mobile, ""));
  afSetText("studentProfileIdaf", afSafeText(current.student_id, ""));

  showStudentPanelaf("courseSelectBox");
  loadStudentCoursesaf();
}

/* =========================================================
   COURSES
========================================================= */

async function loadStudentCoursesaf() {
  const student = getCurrentStudentaf();

  afSetText("studentWelcomeTextaf", "Welcome " + afSafeText(student.name, "Student"));

  if (!student.id || !student.session_token) {
    showNoCourseMessageaf("Session expired. Please login again.");
    return;
  }

  const courseCards = afEl("courseCards") || afEl("courseCardsaf");

  if (courseCards) {
    courseCards.innerHTML = '<p class="loading-textaf">Loading your courses...</p>';
  }

  const cached = afJsonParse(afGetStorage(AF_STORAGE_KEYS.COURSE_CACHE), null);

  if (cached && Array.isArray(cached.courses) && cached.courses.length && courseCards) {
    renderStudentCoursesaf(cached.courses);
  }

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.COURSES, afAuthPayload({}), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to load courses right now.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    if (!cached || !Array.isArray(cached.courses) || !cached.courses.length) {
      showNoCourseMessageaf(message);
    }

    return;
  }

  const courses = afExtractList(result, "courses");

  afEnrolledCourses = courses;
  afEnrolledCourseSlugs = courses.map(function (course) {
    return String(course.slug || course.courseSlug || "").trim();
  }).filter(Boolean);

  afSetStorage(AF_STORAGE_KEYS.COURSE_CACHE, afJsonStringify({
    courses: courses,
    savedAt: Date.now()
  }));

  renderStudentCoursesaf(courses);
}

function renderStudentCoursesaf(courses) {
  const courseCards = afEl("courseCards") || afEl("courseCardsaf");

  if (!courseCards) return;

  courseCards.innerHTML = "";

  if (!Array.isArray(courses) || !courses.length) {
    showNoCourseMessageaf("No course assigned yet. Please enroll in a batch.");
    return;
  }

  showStudentPanelaf("courseSelectBox");

  courses.forEach(function (course) {
    if (!course) return;

    const card = document.createElement("button");
    card.type = "button";
    card.className = "course-select-card";
    card.onclick = function () {
      openCourseDetailsaf(course);
    };

    const icon = afEscapeHtml(course.icon || "📚");
    const title = afEscapeHtml(course.title || "Course");
    const subtitle = afEscapeHtml(course.subtitle || course.short_description || course.description || "Course details available inside.");
    const progress = Number(course.progressPercent || course.progress_percent || 0);
    const locked = course.isLocked === true || course.is_locked === true;

    card.innerHTML =
      '<span>' + icon + '</span>' +
      '<h3>' + title + '</h3>' +
      '<p>' + subtitle + '</p>' +
      '<small>' + (locked ? "Locked" : "Enrolled") + (Number.isFinite(progress) && progress > 0 ? " · " + Math.max(0, Math.min(100, Math.round(progress))) + "% complete" : "") + '</small>';

    courseCards.appendChild(card);
  });
}

function showNoCourseMessageaf(message) {
  const box = afEl("noCourseBoxaf");
  const text = afEl("noCourseTextaf");

  if (text) {
    text.textContent = afSafeText(message, "No course assigned yet.");
  }

  if (box) {
    showStudentPanelaf("noCourseBoxaf");
    return;
  }

  const courseCards = afEl("courseCards") || afEl("courseCardsaf");

  if (courseCards) {
    courseCards.innerHTML =
      '<div class="login-note">' +
      afEscapeHtml(message || "No course assigned yet. Please contact AcademeForge team.") +
      '</div>';
  }
}

function openCourseDetailsaf(course) {
  afSelectedCourse = course || null;

  if (!afSelectedCourse) {
    showNoCourseMessageaf("Course details not available.");
    return;
  }

  afSetText("courseTitleaf", (afSelectedCourse.icon || "📚") + " " + afSafeText(afSelectedCourse.title, "Course"));
  afSetText("courseTitle", (afSelectedCourse.icon || "📚") + " " + afSafeText(afSelectedCourse.title, "Course"));

  afSetText("courseIntroaf", afSelectedCourse.subtitle || afSelectedCourse.short_description || afSelectedCourse.description || "Course overview");
  afSetText("courseIntro", afSelectedCourse.subtitle || afSelectedCourse.short_description || afSelectedCourse.description || "Course overview");

  afSetText("courseDetailsaf", afSelectedCourse.details || afSelectedCourse.description || "Course details will be updated soon.");
  afSetText("courseDetails", afSelectedCourse.details || afSelectedCourse.description || "Course details will be updated soon.");

  const facilities = Array.isArray(afSelectedCourse.facilities) ? afSelectedCourse.facilities : [];
  const facilitiesBox = afEl("courseFacilitiesaf") || afEl("courseFacilities");

  if (facilitiesBox) {
    facilitiesBox.innerHTML = facilities.length
      ? facilities.map(function (item) {
          return "<li>" + afEscapeHtml(item) + "</li>";
        }).join("")
      : "<li>Facilities will be updated soon.</li>";
  }

  const metaBox = afEl("courseMetaaf");

  if (metaBox) {
    const language = afSelectedCourse.language ? "<span>" + afEscapeHtml(afSelectedCourse.language) + "</span>" : "";
    const level = afSelectedCourse.level ? "<span>" + afEscapeHtml(afSelectedCourse.level) + "</span>" : "";
    const chapters = afSelectedCourse.totalChapters || afSelectedCourse.total_chapters
      ? "<span>" + afEscapeHtml(afSelectedCourse.totalChapters || afSelectedCourse.total_chapters) + " Chapters</span>"
      : "";
    const lectures = afSelectedCourse.totalLectures || afSelectedCourse.total_lectures
      ? "<span>" + afEscapeHtml(afSelectedCourse.totalLectures || afSelectedCourse.total_lectures) + " Lectures</span>"
      : "";

    metaBox.innerHTML = [language, level, chapters, lectures].filter(Boolean).join("");
  }

  showStudentPanelaf("courseDetailsBoxaf");
}

function backToCoursesaf() {
  showStudentPanelaf("courseSelectBox");
}

function startLearningaf() {
  if (!afSelectedCourse) {
    showToast("Course Required", "Please select a course first.");
    return;
  }

  afSetText("learningTitleaf", (afSelectedCourse.icon || "📘") + " " + afSafeText(afSelectedCourse.title, "Course"));
  showStudentPanelaf("learningBoxaf");
}

function backToCourseDetailsaf() {
  showStudentPanelaf("courseDetailsBoxaf");
}

async function openLearningModeaf(mode) {
  afLearningMode = mode === "notes" ? "notes" : "lectures";

  afSetText("chapterModeTitleaf", afLearningMode === "lectures" ? "🎥 Lectures" : "📝 Notes");

  await loadChaptersaf();
  showStudentPanelaf("chapterBoxaf");
}

function backToLearningaf() {
  showStudentPanelaf("learningBoxaf");
}

/* =========================================================
   CHAPTERS / LECTURES / NOTES
========================================================= */

async function loadChaptersaf() {
  const list = afEl("chapterListaf") || afEl("chapterList");

  if (!list) return;

  if (!afSelectedCourse || !afSelectedCourse.id) {
    list.innerHTML = '<p class="error-textaf">Course not selected.</p>';
    return;
  }

  list.innerHTML = '<p class="loading-textaf">Loading chapters...</p>';

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.CHAPTERS, afAuthPayload({
    course_id: afSelectedCourse.id,
    course_slug: afSelectedCourse.slug || ""
  }), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to load chapters.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(message) + '</p>';
    return;
  }

  const chapters = afExtractList(result, "chapters");

  if (!chapters.length) {
    list.innerHTML = '<p class="empty-textaf">No chapters available yet.</p>';
    return;
  }

  list.innerHTML = chapters.map(function (chapter) {
    const locked = chapter.is_locked === true || chapter.isLocked === true;
    const icon = locked ? "🔒" : "🔓";
    const status = locked ? "Locked" : "Unlocked";
    const progress = Number(chapter.progressPercent || chapter.progress_percent || 0);
    const progressText = Number.isFinite(progress) && progress > 0 ? " · " + Math.round(progress) + "% complete" : "";

    return (
      '<button class="chapter-itemaf ' + (locked ? "lockedaf" : "unlockedaf") + '" type="button" onclick="openChapterContentaf(\'' +
      afEscapeHtml(String(chapter.id || "")) +
      "', " +
      (locked ? "true" : "false") +
      ')">' +
      '<div class="chapter-mainaf">' +
      '<strong>' + icon + " Chapter " + afEscapeHtml(chapter.chapter_number || chapter.chapterNumber || "") + ": " + afEscapeHtml(chapter.title || "Chapter") + '</strong>' +
      '<small>' + afEscapeHtml(chapter.description || "Chapter details will be available soon.") + progressText + '</small>' +
      '</div>' +
      '<span class="chapter-statusaf">' + status + '</span>' +
      '</button>'
    );
  }).join("");
}

async function openChapterContentaf(chapterId, isLocked) {
  afSelectedChapterId = chapterId;

  if (isLocked === true) {
    afSetText("contentTitleaf", "🔒 Chapter Locked");
    afSetText("contentSubtitleaf", "This chapter will unlock after content upload.");

    const list = afEl("contentListaf") || afEl("contentList");

    if (list) {
      list.innerHTML = '<p class="error-textaf">This chapter is currently locked.</p>';
    }

    showStudentPanelaf("contentBoxaf");
    return;
  }

  if (afLearningMode === "notes") {
    await loadNotesaf(chapterId);
  } else {
    await loadLecturesaf(chapterId);
  }

  showStudentPanelaf("contentBoxaf");
}

function backToChaptersaf() {
  showStudentPanelaf("chapterBoxaf");
}

async function loadLecturesaf(chapterId) {
  const list = afEl("contentListaf") || afEl("contentList");

  if (!list) return;

  afSetText("contentTitleaf", "🎥 Lectures");
  afSetText("contentSubtitleaf", "Watch lectures when they are unlocked.");

  list.innerHTML = '<p class="loading-textaf">Loading lectures...</p>';

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.LECTURES, afAuthPayload({
    chapter_id: chapterId
  }), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to load lectures.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(message) + '</p>';
    return;
  }

  const lectures = afExtractList(result, "lectures");

  if (!lectures.length) {
    list.innerHTML = '<p class="empty-textaf">No lectures available yet.</p>';
    return;
  }

  list.innerHTML = lectures.map(function (lecture) {
    const url = afSafeUrl(lecture.video_url || lecture.videoUrl || "");
    const locked = lecture.is_locked === true || lecture.isLocked === true || !url;
    const icon = locked ? "🔒" : "▶️";
    const completed = lecture.isCompleted === true || lecture.is_completed === true;

    return (
      '<div class="content-itemaf ' + (locked ? "lockedaf" : "unlockedaf") + '">' +
      '<div class="content-mainaf">' +
      '<strong>' + icon + " Lecture " + afEscapeHtml(lecture.lecture_number || lecture.lectureNumber || "") + ": " + afEscapeHtml(lecture.title || "Lecture") + '</strong>' +
      '<small>' + afEscapeHtml(lecture.description || "Lecture details will be available soon.") + '</small>' +
      '<span class="durationaf">⏱ ' + afEscapeHtml(lecture.duration || "10-15 min") + (completed ? " · Completed" : "") + '</span>' +
      '</div>' +
      (locked
        ? '<button class="content-actionaf locked-btnaf" type="button" disabled>Locked</button>'
        : '<button class="content-actionaf" type="button" onclick="openVideoaf(\'' + afEscapeHtml(url) + "', '" + afEscapeHtml(String(lecture.id || "")) + '\')">Watch</button>') +
      '</div>'
    );
  }).join("");
}

async function loadNotesaf(chapterId) {
  const list = afEl("contentListaf") || afEl("contentList");

  if (!list) return;

  afSetText("contentTitleaf", "📝 Notes");
  afSetText("contentSubtitleaf", "Open notes when they are unlocked.");

  list.innerHTML = '<p class="loading-textaf">Loading notes...</p>';

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.NOTES, afAuthPayload({
    chapter_id: chapterId
  }), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to load notes.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(message) + '</p>';
    return;
  }

  const notes = afExtractList(result, "notes");

  if (!notes.length) {
    list.innerHTML = '<p class="empty-textaf">No notes available yet.</p>';
    return;
  }

  list.innerHTML = notes.map(function (note) {
    const url = afSafeUrl(note.pdf_url || note.pdfUrl || note.file_url || "");
    const locked = note.is_locked === true || note.isLocked === true || !url;
    const icon = locked ? "🔒" : "📄";

    return (
      '<div class="content-itemaf ' + (locked ? "lockedaf" : "unlockedaf") + '">' +
      '<div class="content-mainaf">' +
      '<strong>' + icon + " Lecture " + afEscapeHtml(note.note_number || note.noteNumber || "") + " Notes</strong>" +
      '<small>' + afEscapeHtml(note.title || "Notes will be available soon.") + '</small>' +
      '</div>' +
      (locked
        ? '<button class="content-actionaf locked-btnaf" type="button" disabled>Locked</button>'
        : '<button class="content-actionaf" type="button" onclick="openPdfaf(\'' + afEscapeHtml(url) + '\')">Open PDF</button>') +
      '</div>'
    );
  }).join("");
}

async function markLectureProgressaf(lectureId, progress) {
  if (!lectureId) return;

  await afEdgeCall(AF_EDGE_FUNCTIONS.LECTURE_PROGRESS, afAuthPayload({
    lecture_id: lectureId,
    progress: progress || {
      status: "opened",
      opened_at: afNowIso()
    }
  }), {
    timeoutMs: 10000,
    safeRead: false
  });
}

function openVideoaf(url, lectureId) {
  const safe = afSafeUrl(url);

  if (!safe) {
    showToast("Video Unavailable", "Video is not available yet.");
    return;
  }

  if (lectureId) {
    markLectureProgressaf(lectureId, {
      status: "opened",
      opened_at: afNowIso()
    });
  }

  window.open(safe, "_blank", "noopener,noreferrer");
}

function openPdfaf(url) {
  const safe = afSafeUrl(url);

  if (!safe) {
    showToast("PDF Unavailable", "PDF is not available yet.");
    return;
  }

  window.open(safe, "_blank", "noopener,noreferrer");
}

/* =========================================================
   PROFILE
========================================================= */

async function openStudentProfileaf() {
  if (!afIsLoggedIn()) {
    forceLogoutStudentaf("Session expired. Please login again.");
    return;
  }

  showStudentPanelaf("studentProfileBoxaf");

  const student = getCurrentStudentaf();

  afSetText("studentProfileNameaf", student.name);
  afSetText("studentProfileEmailaf", student.email);
  afSetText("studentProfileMobileaf", student.mobile);
  afSetText("studentProfileIdaf", student.student_id);

  const nameInput = afEl("studentProfileNameInputaf");
  const emailInput = afEl("studentProfileEmailInputaf");
  const mobileInput = afEl("studentProfileMobileInputaf");

  if (nameInput) nameInput.value = student.name;
  if (emailInput) emailInput.value = student.email;
  if (mobileInput) mobileInput.value = student.mobile;

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.PROFILE, afAuthPayload({}), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
    }

    return;
  }

  const profile = afExtractObject(result, "student") || afExtractObject(result, "profile");

  if (profile) {
    saveStudentSessionaf({
      student: profile,
      session: {
        token: student.session_token,
        sessionId: student.session_id,
        expiresAt: student.expires_at
      }
    });

    const updated = getCurrentStudentaf();

    afSetText("studentProfileNameaf", updated.name);
    afSetText("studentProfileEmailaf", updated.email);
    afSetText("studentProfileMobileaf", updated.mobile);
    afSetText("studentProfileIdaf", updated.student_id);

    if (nameInput) nameInput.value = updated.name;
    if (emailInput) emailInput.value = updated.email;
    if (mobileInput) mobileInput.value = updated.mobile;
  }
}

async function updateStudentProfileaf() {
  const nameRaw = afReadInput(["studentProfileNameInputaf"]);
  const emailRaw = afReadInput(["studentProfileEmailInputaf"]);
  const mobileRaw = afReadInput(["studentProfileMobileInputaf"]);

  const name = afValidateFullName(nameRaw);

  if (!name.ok) {
    showStudentMessageaf("err", name.message);
    return;
  }

  const email = afLower(emailRaw);

  if (!afIsValidEmail(email)) {
    showStudentMessageaf("err", "Please enter a valid email address.");
    return;
  }

  const mobile = afValidateIndianMobile(mobileRaw, true);

  if (!mobile.ok) {
    showStudentMessageaf("err", mobile.message);
    return;
  }

  const button = afEl("studentProfileSaveBtnaf");

  afDisableButton(button, true, "Saving...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.UPDATE_PROFILE, afAuthPayload({
    full_name: name.value,
    name: name.value,
    email: email,
    mobile: mobile.value
  }), {
    safeRead: false
  });

  afDisableButton(button, false);

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to update profile.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    showStudentMessageaf("err", message);
    return;
  }

  const profile = afExtractObject(result, "student") || afExtractObject(result, "profile") || {
    id: afGetStorage(AF_STORAGE_KEYS.STUDENT_UUID),
    student_id: afGetStorage(AF_STORAGE_KEYS.STUDENT_ID),
    name: name.value,
    email: email,
    mobile: mobile.value
  };

  saveStudentSessionaf({
    student: profile,
    session: {
      token: afGetStorage(AF_STORAGE_KEYS.SESSION_TOKEN),
      sessionId: afGetStorage(AF_STORAGE_KEYS.SESSION_ID),
      expiresAt: afGetStorage(AF_STORAGE_KEYS.SESSION_EXPIRES_AT)
    }
  });

  showStudentMessageaf("ok", "Profile updated successfully.");
  openCourseSectionAfterLoginaf(getCurrentStudentaf());
}

/* =========================================================
   BATCHES / ENROLLMENT / RAZORPAY
========================================================= */

function isBatchEnrolledaf(courseSlug) {
  return afEnrolledCourseSlugs.includes(courseSlug);
}

function renderBatchesaf() {
  const grid = afEl("batchGridaf") || afEl("afBatchGrid");

  if (!grid) return;

  grid.innerHTML = afBatches.map(function (batch) {
    const enrolled = isBatchEnrolledaf(batch.courseSlug);

    return (
      '<article class="batch-cardaf">' +
      '<img src="' + afEscapeHtml(batch.image) + '" alt="' + afEscapeHtml(batch.title) + '" loading="lazy">' +
      '<div class="batch-card-bodyaf">' +
      '<span class="batch-categoryaf">' + afEscapeHtml(batch.category) + '</span>' +
      '<h3>' + afEscapeHtml(batch.title) + '</h3>' +
      '<p>' + afEscapeHtml(batch.subtitle) + '</p>' +
      '<div class="batch-price-rowaf">' +
      '<strong>₹' + afEscapeHtml(batch.price) + '</strong>' +
      '<del>₹' + afEscapeHtml(batch.oldPrice) + '</del>' +
      '<span>' + afEscapeHtml(afBatchDiscount) + '% OFF</span>' +
      '</div>' +
      '<button type="button" onclick="openBatchDetailsaf(\'' + afEscapeHtml(batch.id) + '\')">' +
      (enrolled ? "View Course" : afEscapeHtml(batch.startText)) +
      '</button>' +
      '</div>' +
      '</article>'
    );
  }).join("");
}

function openBatchDetailsaf(batchId) {
  const batch = afBatches.find(function (item) {
    return item.id === batchId;
  });

  if (!batch) {
    showToast("Unavailable", "Batch details are not available.");
    return;
  }

  afSelectedBatch = batch;

  afSetText("batchDetailCategoryaf", batch.category);
  afSetText("batchDetailTitleaf", batch.title);
  afSetText("batchDetailLanguageaf", batch.language);
  afSetText("batchDetailDescaf", batch.subtitle);
  afSetText("batchDetailPriceaf", "₹" + batch.price);
  afSetText("batchDetailOldPriceaf", "₹" + batch.oldPrice);
  afSetText("batchDetailOffaf", afBatchDiscount + "% OFF");
  afSetText("batchFullDetailsaf", batch.details);

  const image = afEl("batchDetailImageaf");
  if (image) {
    image.src = batch.image;
    image.alt = batch.title;
  }

  const learnList = afEl("batchLearnListaf");

  if (learnList) {
    learnList.innerHTML = batch.learn.map(function (item) {
      return "<li>" + afEscapeHtml(item) + "</li>";
    }).join("");
  }

  const facilityList = afEl("batchFacilityListaf");

  if (facilityList) {
    facilityList.innerHTML = batch.facilities.map(function (item) {
      return "<li>" + afEscapeHtml(item) + "</li>";
    }).join("");
  }

  const buyBtn = afEl("batchDetailBuyBtnaf");

  if (buyBtn) {
    buyBtn.textContent = isBatchEnrolledaf(batch.courseSlug) ? "Already Enrolled" : "Enroll Now";
    buyBtn.disabled = isBatchEnrolledaf(batch.courseSlug);
  }

  const detailBox = afEl("batchDetailBoxaf");

  if (detailBox) {
    afShow(detailBox, "block");
    detailBox.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
}

async function buySelectedBatchaf() {
  if (!afSelectedBatch) {
    showToast("Batch Required", "Please select a batch first.");
    return;
  }

  if (!afIsLoggedIn()) {
    showToast("Login Required", "Please login before enrollment.");
    showSection("studentaf");
    return;
  }

  if (isBatchEnrolledaf(afSelectedBatch.courseSlug)) {
    showToast("Already Enrolled", "You already have access to this course.");
    return;
  }

  if (typeof Razorpay === "undefined") {
    showToast("Network Error", "Payment system is not available right now.");
    return;
  }

  const button = afEl("batchDetailBuyBtnaf");

  afDisableButton(button, true, "Creating order...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.CREATE_RAZORPAY_ORDER, afAuthPayload({
    course_id: afSelectedBatch.courseId,
    course_slug: afSelectedBatch.courseSlug,
    batch_id: afSelectedBatch.id,
    amount: afSelectedBatch.price,
    currency: "INR"
  }), {
    safeRead: false,
    timeoutMs: AF_DEFAULT_TIMEOUT_MS
  });

  afDisableButton(button, false);

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to start payment.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    showToast("Network Error", message);
    return;
  }

  const data = result.data || {};
  const order = data.order || data;

  if (!order || !order.id) {
    showToast("Network Error", "Payment order could not be created.");
    return;
  }

  const student = getCurrentStudentaf();

  const options = {
    key: data.key_id || AF_RAZORPAY_KEY_ID,
    amount: order.amount,
    currency: order.currency || "INR",
    name: "AcademeForge",
    description: afSelectedBatch.title,
    order_id: order.id,
    prefill: {
      name: student.name,
      email: student.email,
      contact: student.mobile
    },
    notes: {
      student_id: student.id,
      course_id: afSelectedBatch.courseId,
      course_slug: afSelectedBatch.courseSlug
    },
    theme: {
      color: "#111827"
    },
    handler: async function (response) {
      await verifyBatchPaymentaf(response, order);
    },
    modal: {
      ondismiss: function () {
        showToast("Payment Cancelled", "Payment was not completed.");
      }
    }
  };

  const razorpay = new Razorpay(options);

  razorpay.on("payment.failed", function () {
    showToast("Payment Failed", "Payment could not be completed.");
  });

  razorpay.open();
}

async function verifyBatchPaymentaf(paymentResponse, order) {
  if (!afSelectedBatch) return;

  const button = afEl("batchDetailBuyBtnaf");

  afDisableButton(button, true, "Verifying payment...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.VERIFY_PAYMENT, afAuthPayload({
    course_id: afSelectedBatch.courseId,
    course_slug: afSelectedBatch.courseSlug,
    batch_id: afSelectedBatch.id,
    order_id: order.id,
    razorpay_order_id: paymentResponse.razorpay_order_id,
    razorpay_payment_id: paymentResponse.razorpay_payment_id,
    razorpay_signature: paymentResponse.razorpay_signature
  }), {
    safeRead: false,
    timeoutMs: AF_DEFAULT_TIMEOUT_MS
  });

  afDisableButton(button, false);

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Payment verification failed.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    showToast("Network Error", message);
    return;
  }

  showToast("Enrollment Successful", "Your course access is now active.");
  await loadStudentCoursesaf();
  renderBatchesaf();

  if (button) {
    button.textContent = "Already Enrolled";
    button.disabled = true;
  }
}

async function loadStudentEnrollmentsaf() {
  if (!afIsLoggedIn()) return;

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.ENROLLMENTS, afAuthPayload({}), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) return;

  const enrollments = afExtractList(result, "enrollments");

  afEnrolledCourseSlugs = enrollments.map(function (item) {
    return String(item.course_slug || item.slug || item.courseSlug || "").trim();
  }).filter(Boolean);

  renderBatchesaf();
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

async function loadAppNotifications() {
  const list = afEl("notificationsList");

  if (!list) return;

  list.innerHTML = '<div class="notification-empty">Loading notifications...</div>';

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.NOTIFICATIONS, afAuthPayload({
    limit: 30
  }), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    list.innerHTML = '<div class="notification-empty">Unable to load notifications right now.</div>';
    return;
  }

  const notifications = afExtractList(result, "notifications");

  if (!notifications.length) {
    list.innerHTML = '<div class="notification-empty">No notifications yet.</div>';
    return;
  }

  let latestTime = "";

  list.innerHTML = notifications.map(function (item) {
    const createdAt = item.created_at || item.createdAt || "";
    if (!latestTime || String(createdAt) > latestTime) latestTime = String(createdAt);

    return (
      '<article class="notification-item" data-time="' + afEscapeHtml(createdAt) + '">' +
      '<strong>' + afEscapeHtml(item.title || "Notification") + '</strong>' +
      '<p>' + afEscapeHtml(item.message || item.body || "") + '</p>' +
      '<small>' + afEscapeHtml(createdAt ? new Date(createdAt).toLocaleString() : "") + '</small>' +
      '</article>'
    );
  }).join("");

  window.latestNotificationTime = latestTime;

  if (latestTime) {
    setSeenNotificationTime(latestTime);
    updateNotifyBadge([]);
  }
}

function setSeenNotificationTime(value) {
  afSetStorage(AF_STORAGE_KEYS.NOTIFICATION_SEEN_AT, value || afNowIso());
}

function updateNotifyBadge(notifications) {
  const badge = afEl("notifyBadge") || afEl("notificationBadge");

  if (!badge) return;

  const list = Array.isArray(notifications) ? notifications : [];
  const seenAt = afGetStorage(AF_STORAGE_KEYS.NOTIFICATION_SEEN_AT) || "";
  const unread = list.filter(function (item) {
    return String(item.created_at || item.createdAt || "") > seenAt;
  }).length;

  if (unread > 0) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.style.display = "inline-flex";
  } else {
    badge.textContent = "";
    badge.style.display = "none";
  }
}

/* =========================================================
   COMMUNITY - AF NEXUS V2
========================================================= */

function afNexusStudentKeyV2() {
  return afGetStorage(AF_STORAGE_KEYS.STUDENT_UUID) || "";
}

function afNexusStudentNameV2() {
  return afGetStorage(AF_STORAGE_KEYS.STUDENT_NAME) || "Student";
}

function afNexusIsLoggedInV2() {
  return !!afNexusStudentKeyV2();
}

function afNexusSaveCacheV2(posts) {
  afSetStorage(AF_STORAGE_KEYS.COMMUNITY_CACHE, afJsonStringify({
    data: posts || [],
    savedAt: Date.now()
  }));
}

function afNexusLoadCacheV2() {
  const parsed = afJsonParse(afGetStorage(AF_STORAGE_KEYS.COMMUNITY_CACHE), null);
  return parsed && Array.isArray(parsed.data) ? parsed.data : [];
}

async function afNexusEdgeCallV2(payload) {
  return await afEdgeCall(AF_EDGE_FUNCTIONS.COMMUNITY, afAuthPayload(Object.assign({}, payload || {}, {
    student_key: afNexusStudentKeyV2(),
    student_name: afNexusStudentNameV2()
  })), {
    safeRead: payload && (payload.action === "feed" || payload.action === "my_posts" || payload.action === "comments"),
    retryCount: payload && (payload.action === "feed" || payload.action === "my_posts" || payload.action === "comments") ? AF_READ_RETRY_COUNT : 0
  });
}

function refreshAfNexusLockStateV2() {
  const locked = afEl("afNexusLockedV2");
  const main = afEl("afNexusMainV2");
  const writeBtn = afEl("afNexusWriteBtnV2");

  if (afNexusIsLoggedInV2()) {
    if (locked) afHide(locked);
    if (main) afShow(main, "block");
    if (writeBtn) writeBtn.disabled = false;
  } else {
    if (locked) afShow(locked, "block");
    if (main) afHide(main);
    if (writeBtn) writeBtn.disabled = true;
  }
}

async function initAfNexusV2() {
  refreshAfNexusLockStateV2();

  if (!afNexusIsLoggedInV2()) return;

  const cached = afNexusLoadCacheV2();

  if (cached.length) {
    afCommunityPostsCache = cached;
    renderAfNexusPostsV2(cached, "afNexusPostsListV2");
  }

  await loadAfNexusFeedV2(true);
}

async function loadAfNexusFeedV2(reset) {
  if (afCommunityBusy) return;
  if (!afNexusIsLoggedInV2()) {
    refreshAfNexusLockStateV2();
    return;
  }

  afCommunityBusy = true;

  const list = afEl("afNexusPostsListV2");

  if (list && reset) {
    list.innerHTML = '<p class="loading-textaf">Loading community...</p>';
  }

  const result = await afNexusEdgeCallV2({
    action: "feed",
    cursor: reset ? null : afCommunityCursor,
    limit: 20
  });

  afCommunityBusy = false;

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to load community.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    if (list) list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(message) + '</p>';
    return;
  }

  const posts = afExtractList(result, "posts");
  const data = result.data || {};

  afCommunityCursor = data.nextCursor || data.next_cursor || result.nextCursor || result.next_cursor || null;

  if (reset) {
    afCommunityPostsCache = posts;
  } else {
    afCommunityPostsCache = afCommunityPostsCache.concat(posts);
  }

  afNexusSaveCacheV2(afCommunityPostsCache);
  renderAfNexusPostsV2(afCommunityPostsCache, "afNexusPostsListV2");
}

function renderAfNexusPostsV2(posts, containerId) {
  const list = afEl(containerId);

  if (!list) return;

  if (!Array.isArray(posts) || !posts.length) {
    list.innerHTML = '<p class="empty-textaf">No community posts yet.</p>';
    return;
  }

  list.innerHTML = posts.map(function (post) {
    const id = String(post.id || "");
    const mine = String(post.student_key || post.student_id || "") === String(afNexusStudentKeyV2());
    const liked = post.liked_by_me === true || post.is_liked === true;
    const likes = Number(post.like_count || post.likes || 0);
    const comments = Number(post.comment_count || post.comments_count || 0);

    return (
      '<article class="af-nexus-post-v2" data-post-id="' + afEscapeHtml(id) + '">' +
      '<div class="af-nexus-post-head-v2">' +
      '<strong>' + afEscapeHtml(post.student_name || post.name || "Student") + '</strong>' +
      '<small>' + afEscapeHtml(post.created_at ? new Date(post.created_at).toLocaleString() : "") + '</small>' +
      '</div>' +
      '<p>' + afEscapeHtml(post.content || post.body || "") + '</p>' +
      '<div class="af-nexus-post-actions-v2">' +
      '<button type="button" onclick="toggleAfNexusLikeV2(\'' + afEscapeHtml(id) + '\')">' + (liked ? "♥" : "♡") + " " + likes + '</button>' +
      '<button type="button" onclick="openAfNexusCommentsV2(\'' + afEscapeHtml(id) + '\')">💬 ' + comments + '</button>' +
      (mine ? '<button type="button" onclick="deleteAfNexusPostV2(\'' + afEscapeHtml(id) + '\')">Delete</button>' : "") +
      '</div>' +
      '</article>'
    );
  }).join("");
}

function openAfNexusComposerV2() {
  if (!afNexusIsLoggedInV2()) {
    showToast("Login Required", "Please login to post.");
    return;
  }

  const box = afEl("afNexusComposerV2");

  if (box) {
    afShow(box, "block");
  }
}

function closeAfNexusComposerV2() {
  const box = afEl("afNexusComposerV2");

  if (box) {
    afHide(box);
  }
}

async function createAfNexusPostV2() {
  const input = afEl("afNexusPostInputV2") || afEl("afNexusPostTextV2");
  const content = afTrim(input ? input.value : "");

  if (!content || content.length < 2) {
    showToast("Post Required", "Please write something before posting.");
    return;
  }

  if (content.length > 1000) {
    showToast("Too Long", "Post should be under 1000 characters.");
    return;
  }

  const button = afEl("afNexusPostSubmitV2");

  afDisableButton(button, true, "Posting...");

  const result = await afNexusEdgeCallV2({
    action: "create_post",
    content: content
  });

  afDisableButton(button, false);

  if (!result.ok) {
    const message = afPublicErrorMessage(result, "Unable to create post.");

    if (message === "Session expired. Please login again.") {
      forceLogoutStudentaf(message);
      return;
    }

    showToast("Network Error", message);
    return;
  }

  if (input) input.value = "";

  closeAfNexusComposerV2();
  await loadAfNexusFeedV2(true);
}

async function toggleAfNexusLikeV2(postId) {
  if (!postId || !afNexusIsLoggedInV2()) return;

  const oldPosts = afCommunityPostsCache.map(function (post) {
    return Object.assign({}, post);
  });

  afCommunityPostsCache = afCommunityPostsCache.map(function (post) {
    if (String(post.id) !== String(postId)) return post;

    const liked = post.liked_by_me === true || post.is_liked === true;
    const count = Number(post.like_count || post.likes || 0);

    return Object.assign({}, post, {
      liked_by_me: !liked,
      is_liked: !liked,
      like_count: Math.max(0, count + (liked ? -1 : 1)),
      likes: Math.max(0, count + (liked ? -1 : 1))
    });
  });

  renderAfNexusPostsV2(afCommunityPostsCache, "afNexusPostsListV2");

  const result = await afNexusEdgeCallV2({
    action: "toggle_like",
    post_id: postId
  });

  if (!result.ok) {
    afCommunityPostsCache = oldPosts;
    renderAfNexusPostsV2(afCommunityPostsCache, "afNexusPostsListV2");
    showToast("Network Error", afPublicErrorMessage(result, "Unable to update like."));
  }
}

async function openAfNexusCommentsV2(postId) {
  const box = afEl("afNexusCommentsBoxV2");
  const list = afEl("afNexusCommentsListV2");

  if (!box || !list) return;

  box.dataset.postId = postId;
  afShow(box, "block");
  list.innerHTML = '<p class="loading-textaf">Loading comments...</p>';

  const result = await afNexusEdgeCallV2({
    action: "comments",
    post_id: postId
  });

  if (!result.ok) {
    list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(afPublicErrorMessage(result, "Unable to load comments.")) + '</p>';
    return;
  }

  const comments = afExtractList(result, "comments");

  if (!comments.length) {
    list.innerHTML = '<p class="empty-textaf">No comments yet.</p>';
    return;
  }

  list.innerHTML = comments.map(function (comment) {
    const mine = String(comment.student_key || comment.student_id || "") === String(afNexusStudentKeyV2());

    return (
      '<div class="af-nexus-comment-v2">' +
      '<strong>' + afEscapeHtml(comment.student_name || "Student") + '</strong>' +
      '<p>' + afEscapeHtml(comment.content || comment.body || "") + '</p>' +
      (mine ? '<button type="button" onclick="deleteAfNexusCommentV2(\'' + afEscapeHtml(comment.id || "") + '\')">Delete</button>' : "") +
      '</div>'
    );
  }).join("");
}

function closeAfNexusCommentsV2() {
  const box = afEl("afNexusCommentsBoxV2");

  if (box) {
    afHide(box);
  }
}

async function createAfNexusCommentV2() {
  const box = afEl("afNexusCommentsBoxV2");
  const input = afEl("afNexusCommentInputV2");
  const postId = box ? box.dataset.postId : "";
  const content = afTrim(input ? input.value : "");

  if (!postId) return;

  if (!content || content.length < 1) {
    showToast("Comment Required", "Please write a comment.");
    return;
  }

  if (content.length > 500) {
    showToast("Too Long", "Comment should be under 500 characters.");
    return;
  }

  const result = await afNexusEdgeCallV2({
    action: "create_comment",
    post_id: postId,
    content: content
  });

  if (!result.ok) {
    showToast("Network Error", afPublicErrorMessage(result, "Unable to add comment."));
    return;
  }

  if (input) input.value = "";

  await openAfNexusCommentsV2(postId);
  await loadAfNexusFeedV2(true);
}

async function deleteAfNexusPostV2(postId) {
  if (!postId) return;

  const result = await afNexusEdgeCallV2({
    action: "delete_post",
    post_id: postId
  });

  if (!result.ok) {
    showToast("Network Error", afPublicErrorMessage(result, "Unable to delete post."));
    return;
  }

  afCommunityPostsCache = afCommunityPostsCache.filter(function (post) {
    return String(post.id) !== String(postId);
  });

  afNexusSaveCacheV2(afCommunityPostsCache);
  renderAfNexusPostsV2(afCommunityPostsCache, "afNexusPostsListV2");
}

async function deleteAfNexusCommentV2(commentId) {
  if (!commentId) return;

  const box = afEl("afNexusCommentsBoxV2");
  const postId = box ? box.dataset.postId : "";

  const result = await afNexusEdgeCallV2({
    action: "delete_comment",
    comment_id: commentId,
    post_id: postId
  });

  if (!result.ok) {
    showToast("Network Error", afPublicErrorMessage(result, "Unable to delete comment."));
    return;
  }

  if (postId) {
    await openAfNexusCommentsV2(postId);
    await loadAfNexusFeedV2(true);
  }
}

/* =========================================================
   TESTS
========================================================= */

async function initAFTestHubV1() {
  const locked = afEl("afTestLockedV1");
  const main = afEl("afTestMainV1");

  if (!afIsLoggedIn()) {
    if (locked) afShow(locked, "block");
    if (main) afHide(main);
    return;
  }

  if (locked) afHide(locked);
  if (main) afShow(main, "block");

  await loadAFTestDashboardV1();
}

async function loadAFTestDashboardV1() {
  const container = afEl("afTestDashboardCardsV1");

  if (container) {
    container.innerHTML = '<p class="loading-textaf">Loading test dashboard...</p>';
  }

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.TESTS_DASHBOARD, afAuthPayload({}), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    if (container) {
      container.innerHTML = '<p class="error-textaf">' + afEscapeHtml(afPublicErrorMessage(result, "Unable to load dashboard.")) + '</p>';
    }
    return;
  }

  const data = result.data || {};
  const stats = data.stats || {};
  const tests = Array.isArray(data.tests) ? data.tests : afExtractList(result, "tests");

  if (container) {
    container.innerHTML =
      '<div class="af-test-mini-card-v1"><span>Latest Rank</span><strong>' + afEscapeHtml(stats.latestRank || stats.latest_rank || "-") + '</strong></div>' +
      '<div class="af-test-mini-card-v1"><span>Best Score</span><strong>' + afEscapeHtml(stats.bestScore || stats.best_score || "-") + '</strong></div>' +
      '<div class="af-test-mini-card-v1"><span>Attempts</span><strong>' + afEscapeHtml(stats.attempts || 0) + '</strong></div>';
  }

  renderAFAvailableTestsV1(tests);
}

function renderAFAvailableTestsV1(tests) {
  const list = afEl("afAvailableTestsListV1");

  if (!list) return;

  if (!Array.isArray(tests) || !tests.length) {
    list.innerHTML = '<p class="empty-textaf">No tests available yet.</p>';
    return;
  }

  list.innerHTML = tests.map(function (test) {
    return (
      '<article class="af-test-card-v1">' +
      '<h3>' + afEscapeHtml(test.title || "Assessment") + '</h3>' +
      '<p>' + afEscapeHtml(test.description || "Assessment details will be updated soon.") + '</p>' +
      '<small>' + afEscapeHtml(test.total_questions || test.totalQuestions || 0) + ' Questions · ' + afEscapeHtml(test.duration_minutes || test.durationMinutes || 0) + ' min</small>' +
      '<button type="button" onclick="startAFTestV1(\'' + afEscapeHtml(test.id || "") + '\')">Start Test</button>' +
      '</article>'
    );
  }).join("");
}

async function startAFTestV1(testId) {
  if (!testId) return;

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.TEST_START, afAuthPayload({
    test_id: testId
  }), {
    safeRead: false
  });

  if (!result.ok) {
    showToast("Network Error", afPublicErrorMessage(result, "Unable to start test."));
    return;
  }

  const data = result.data || {};
  afCurrentTest = data.test || data;
  afTestAnswers = Object.create(null);

  renderAFTestAttemptV1(afCurrentTest);
}

function renderAFTestAttemptV1(test) {
  const box = afEl("afTestAttemptBoxV1");
  const list = afEl("afTestQuestionListV1");

  if (!box || !list || !test) return;

  afShow(box, "block");

  afSetText("afTestAttemptTitleV1", test.title || "Assessment");

  const questions = Array.isArray(test.questions) ? test.questions : [];

  if (!questions.length) {
    list.innerHTML = '<p class="empty-textaf">No questions available.</p>';
    return;
  }

  list.innerHTML = questions.map(function (q, index) {
    const qid = String(q.id || index);

    const options = Array.isArray(q.options) ? q.options : [];

    return (
      '<article class="af-test-question-v1" data-question-id="' + afEscapeHtml(qid) + '">' +
      '<h3>Q' + (index + 1) + '. ' + afEscapeHtml(q.question || q.title || "") + '</h3>' +
      '<div class="af-test-options-v1">' +
      options.map(function (option, optionIndex) {
        const value = String(option.id || option.value || optionIndex);

        return (
          '<label>' +
          '<input type="radio" name="af_q_' + afEscapeHtml(qid) + '" value="' + afEscapeHtml(value) + '" onchange="setAFTestAnswerV1(\'' + afEscapeHtml(qid) + "', '" + afEscapeHtml(value) + '\')">' +
          '<span>' + afEscapeHtml(option.text || option.label || option.value || option) + '</span>' +
          '</label>'
        );
      }).join("") +
      '</div>' +
      '</article>'
    );
  }).join("");
}

function setAFTestAnswerV1(questionId, answer) {
  afTestAnswers[String(questionId)] = String(answer);
  scheduleAFTestDraftSaveV1();
}

function scheduleAFTestDraftSaveV1() {
  window.clearTimeout(afTestDraftTimer);

  afTestDraftTimer = window.setTimeout(function () {
    saveAFTestDraftV1();
  }, AF_TEST_DRAFT_DEBOUNCE_MS);
}

async function saveAFTestDraftV1() {
  if (!afCurrentTest || !afCurrentTest.id) return;

  await afEdgeCall(AF_EDGE_FUNCTIONS.TEST_SAVE_DRAFT, afAuthPayload({
    test_id: afCurrentTest.id,
    answers: afTestAnswers,
    saved_at: afNowIso()
  }), {
    safeRead: false,
    timeoutMs: 10000
  });
}

async function submitAFTestV1() {
  if (!afCurrentTest || !afCurrentTest.id) {
    showToast("Test Required", "No active test found.");
    return;
  }

  const button = afEl("afTestSubmitBtnV1");

  afDisableButton(button, true, "Submitting...");

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.TEST_SUBMIT, afAuthPayload({
    test_id: afCurrentTest.id,
    answers: afTestAnswers,
    submitted_at: afNowIso()
  }), {
    safeRead: false,
    timeoutMs: AF_DEFAULT_TIMEOUT_MS
  });

  afDisableButton(button, false);

  if (!result.ok) {
    showToast("Network Error", afPublicErrorMessage(result, "Unable to submit test."));
    return;
  }

  showToast("Submitted", "Your test has been submitted.");
  afCurrentTest = null;
  afTestAnswers = Object.create(null);

  const box = afEl("afTestAttemptBoxV1");
  if (box) afHide(box);

  await loadAFTestDashboardV1();
}

async function openAFTestDashboardPageV1() {
  await initAFTestHubV1();
}

async function openAFTestRankingPageV1() {
  const list = afEl("afTestRankingListV1");

  if (list) {
    list.innerHTML = '<p class="loading-textaf">Loading ranking...</p>';
  }

  const result = await afEdgeCall(AF_EDGE_FUNCTIONS.TEST_RANKING, afAuthPayload({}), {
    safeRead: true,
    retryCount: AF_READ_RETRY_COUNT
  });

  if (!result.ok) {
    if (list) {
      list.innerHTML = '<p class="error-textaf">' + afEscapeHtml(afPublicErrorMessage(result, "Unable to load ranking.")) + '</p>';
    }
    return;
  }

  const rankings = afExtractList(result, "rankings");

  if (!list) return;

  if (!rankings.length) {
    list.innerHTML = '<p class="empty-textaf">No ranking data yet.</p>';
    return;
  }

  list.innerHTML = rankings.map(function (row, index) {
    return (
      '<div class="af-ranking-row-v1">' +
      '<strong>#' + afEscapeHtml(row.rank || index + 1) + '</strong>' +
      '<span>' + afEscapeHtml(row.name || row.student_name || "Student") + '</span>' +
      '<b>' + afEscapeHtml(row.score || row.best_score || 0) + '</b>' +
      '</div>'
    );
  }).join("");
}

/* =========================================================
   BASIC APP FUNCTIONS
========================================================= */

function calculate() {
  const input = afEl("calcInput");
  const result = afEl("calcResult");

  if (!input || !result) return;

  const expression = input.value.trim();

  if (expression === "") {
    result.textContent = "0";
    return;
  }

  const safeExpression = /^[0-9+\-*/().%\s]+$/;

  if (!safeExpression.test(expression)) {
    result.textContent = "Error";
    showToast("Invalid Input", "Use only numbers and basic symbols like +, -, *, /, %, and brackets.");
    return;
  }

  try {
    const answer = Function('"use strict"; return (' + expression + ")")();

    if (Number.isFinite(answer)) {
      result.textContent = String(answer);
    } else {
      result.textContent = "Error";
    }
  } catch (error) {
    result.textContent = "Error";
  }
}

function demoLogin(type) {
  showToast(
    afSafeText(type, "Demo") + " Login Preview",
    afSafeText(type, "This") + " login is currently under development. Try E-mail OTP."
  );
}

function openWebsite() {
  window.open(AF_WEBSITE_LINK, "_blank", "noopener,noreferrer");
}

function copyWebsite() {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    navigator.clipboard.writeText(AF_WEBSITE_LINK)
      .then(function () {
        showToast("Copied", "Website link copied to clipboard.");
      })
      .catch(function () {
        fallbackCopyWebsite();
      });
  } else {
    fallbackCopyWebsite();
  }
}

function fallbackCopyWebsite() {
  const tempInput = document.createElement("input");
  tempInput.value = AF_WEBSITE_LINK;
  document.body.appendChild(tempInput);
  tempInput.select();

  try {
    document.execCommand("copy");
    showToast("Copied", "Website link copied to clipboard.");
  } catch (err) {
    showToast("Copy Failed", "Please copy the website link manually.");
  }

  document.body.removeChild(tempInput);
}

/* =========================================================
   THEME
========================================================= */

function applyThemeMode(mode) {
  const finalMode = mode === "dark-mode" ? "dark-mode" : "light-mode";

  document.body.classList.remove("light-mode", "dark-mode");
  document.body.classList.add(finalMode);

  afSetStorage(AF_STORAGE_KEYS.THEME_MODE, finalMode);
}

function toggleThemeMode() {
  const isDark = document.body.classList.contains("dark-mode");
  applyThemeMode(isDark ? "light-mode" : "dark-mode");
}

/* =========================================================
   BANNER SLIDER
========================================================= */

let currentBannerSlide = 0;
let bannerSlideTimer = null;

function showBannerSlide(index) {
  const slides = document.querySelectorAll(".banner-slide");
  const dots = document.querySelectorAll(".banner-dot");

  if (!slides.length) return;

  currentBannerSlide = (index + slides.length) % slides.length;

  slides.forEach(function (slide, i) {
    slide.classList.toggle("active", i === currentBannerSlide);
  });

  dots.forEach(function (dot, i) {
    dot.classList.toggle("active", i === currentBannerSlide);
  });
}

function nextBannerSlide() {
  showBannerSlide(currentBannerSlide + 1);
}

function goToBannerSlide(index) {
  showBannerSlide(index);
  startBannerSlider();
}

function startBannerSlider() {
  if (bannerSlideTimer) clearInterval(bannerSlideTimer);
  bannerSlideTimer = setInterval(nextBannerSlide, 4500);
}

/* =========================================================
   SESSION SYNC
========================================================= */

function initSessionBroadcastaf() {
  try {
    if (typeof BroadcastChannel === "undefined") return;

    window.afSessionChannel = new BroadcastChannel("af_student_session_channel");

    window.afSessionChannel.onmessage = function (event) {
      const data = event.data || {};

      if (data.type === "logout") {
        clearStudentSessionaf();
        showStudentPanelaf("studentAuthCardaf");

        if (typeof switchStudentModeaf === "function") {
          switchStudentModeaf("login");
        }

        showStudentMessageaf("err", "Session expired. Please login again.");
      }
    };
  } catch (err) {}
}

/* =========================================================
   INIT
========================================================= */

async function initAcademeForgeStudentAppaf() {
  afGetOrCreateDeviceId();

  const savedMode = afGetStorage(AF_STORAGE_KEYS.THEME_MODE) || "light-mode";
  applyThemeMode(savedMode);

  showBannerSlide(0);
  startBannerSlider();

  initSessionBroadcastaf();

  renderBatchesaf();

  if (afIsLoggedIn()) {
    const ok = await verifyStudentSessionaf();

    if (ok && afIsLoggedIn()) {
      openCourseSectionAfterLoginaf(getCurrentStudentaf());
      loadStudentEnrollmentsaf();
    }
  } else {
    if (afEl("studentAuthCardaf")) {
      showStudentPanelaf("studentAuthCardaf");
    }

    if (typeof switchStudentModeaf === "function") {
      switchStudentModeaf("login");
    }
  }

  window.addEventListener("online", function () {
    showToast("Back Online", "Internet connection restored.");

    if (afIsLoggedIn()) {
      loadStudentCoursesaf();
    }
  });

  window.addEventListener("offline", function () {
    showToast("Network Error", "No internet connection.");
  });

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && afIsLoggedIn()) {
      verifyStudentSessionaf();
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initAcademeForgeStudentAppaf();
});

/* =========================================================
   GLOBAL EXPORTS FOR INLINE HTML onclick SUPPORT
========================================================= */

window.showSection = showSection;
window.showToast = showToast;
window.calculate = calculate;
window.demoLogin = demoLogin;
window.openWebsite = openWebsite;
window.copyWebsite = copyWebsite;
window.toggleThemeMode = toggleThemeMode;
window.applyThemeMode = applyThemeMode;
window.goToBannerSlide = goToBannerSlide;

window.switchStudentModeaf = switchStudentModeaf;
window.sendSignupOtpaf = sendSignupOtpaf;
window.sendLoginOtpaf = sendLoginOtpaf;
window.resendStudentOtpaf = resendStudentOtpaf;
window.verifyStudentOtpaf = verifyStudentOtpaf;
window.logoutStudentaf = logoutStudentaf;
window.logoutStudent = logoutStudent;

window.openCourseSectionAfterLoginaf = openCourseSectionAfterLoginaf;
window.loadStudentCoursesaf = loadStudentCoursesaf;
window.openCourseDetailsaf = openCourseDetailsaf;
window.backToCoursesaf = backToCoursesaf;
window.startLearningaf = startLearningaf;
window.backToCourseDetailsaf = backToCourseDetailsaf;
window.openLearningModeaf = openLearningModeaf;
window.backToLearningaf = backToLearningaf;
window.loadChaptersaf = loadChaptersaf;
window.openChapterContentaf = openChapterContentaf;
window.backToChaptersaf = backToChaptersaf;
window.loadLecturesaf = loadLecturesaf;
window.loadNotesaf = loadNotesaf;
window.openVideoaf = openVideoaf;
window.openPdfaf = openPdfaf;

window.openStudentProfileaf = openStudentProfileaf;
window.updateStudentProfileaf = updateStudentProfileaf;

window.renderBatchesaf = renderBatchesaf;
window.openBatchDetailsaf = openBatchDetailsaf;
window.buySelectedBatchaf = buySelectedBatchaf;
window.loadStudentEnrollmentsaf = loadStudentEnrollmentsaf;

window.loadAppNotifications = loadAppNotifications;
window.setSeenNotificationTime = setSeenNotificationTime;
window.updateNotifyBadge = updateNotifyBadge;

window.initAfNexusV2 = initAfNexusV2;
window.refreshAfNexusLockStateV2 = refreshAfNexusLockStateV2;
window.loadAfNexusFeedV2 = loadAfNexusFeedV2;
window.openAfNexusComposerV2 = openAfNexusComposerV2;
window.closeAfNexusComposerV2 = closeAfNexusComposerV2;
window.createAfNexusPostV2 = createAfNexusPostV2;
window.toggleAfNexusLikeV2 = toggleAfNexusLikeV2;
window.openAfNexusCommentsV2 = openAfNexusCommentsV2;
window.closeAfNexusCommentsV2 = closeAfNexusCommentsV2;
window.createAfNexusCommentV2 = createAfNexusCommentV2;
window.deleteAfNexusPostV2 = deleteAfNexusPostV2;
window.deleteAfNexusCommentV2 = deleteAfNexusCommentV2;

window.initAFTestHubV1 = initAFTestHubV1;
window.loadAFTestDashboardV1 = loadAFTestDashboardV1;
window.startAFTestV1 = startAFTestV1;
window.setAFTestAnswerV1 = setAFTestAnswerV1;
window.saveAFTestDraftV1 = saveAFTestDraftV1;
window.submitAFTestV1 = submitAFTestV1;
window.openAFTestDashboardPageV1 = openAFTestDashboardPageV1;
window.openAFTestRankingPageV1 = openAFTestRankingPageV1;

window.afEdgeCall = afEdgeCall;
window.afAuthPayload = afAuthPayload;
window.getCurrentStudentaf = getCurrentStudentaf;
window.afIsLoggedIn = afIsLoggedIn;
</script>
