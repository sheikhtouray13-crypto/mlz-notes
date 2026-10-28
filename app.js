/* =========================================================
   ملاحظاتي — تطبيق الملاحظات المحلي
   لا خوادم · localStorage · تشفير لكل حساب
   ========================================================= */
(function () {
  "use strict";

  var C = window.MNotesCrypto;
  var USERS_KEY = "mn_users_v1";
  var NOTES_PREFIX = "mn_notes_v1_";
  var SESSION_KEY = "mn_session_v1";
  var THEME_KEY = "mn_theme_v1";
  var LAST_EMAIL_KEY = "mn_last_email_v1";

  var FILTERS = {
    all: { title: "كل الملاحظات", subtitle: "كل ما دوّنته، في مكان واحد." },
    pinned: { title: "الملاحظات المثبّتة", subtitle: "أفكارك المهمة في المقدمة دائماً." },
    favorites: { title: "الملاحظات المفضّلة", subtitle: "الملاحظات التي تعود إليها كثيراً." },
    trash: { title: "المهملات", subtitle: "ملاحظات محذوفة يمكنك استعادتها قبل حذفها نهائياً." }
  };

  var TAG_COLORS = ["#3155e7", "#0f9f6e", "#c47a0a", "#d62d55", "#7141d8", "#087db8"];
  var AVATAR_GRADIENTS = [
    ["#3155e7", "#6d5efc"],
    ["#0f9f6e", "#22c7a0"],
    ["#c47a0a", "#f5a524"],
    ["#d62d55", "#ff7a90"],
    ["#087db8", "#38bdf8"],
    ["#7141d8", "#a78bfa"]
  ];

  var state = {
    user: null,
    vaultKey: null,
    notes: [],
    filter: "all",
    tag: null,
    query: "",
    sort: "updated",
    editorId: null,
    editorIsNew: false,
    editorCloseTimer: null,
    saveTimer: null,
    saveVersion: 0,
    saveChain: Promise.resolve(),
    emptyMode: "all",
    modalResolve: null,
    modalOptions: null,
    modalBusy: false,
    storageAvailable: true,
    booted: false
  };

  function $(id) { return document.getElementById(id); }
  function $$(selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); }

  var el = {
    authView: $("authView"),
    appView: $("appView"),
    bootOverlay: $("bootOverlay"),
    authTabs: $("authTabs"),
    authEyebrow: $("authEyebrow"),
    authTitle: $("authTitle"),
    authSubtitle: $("authSubtitle"),
    loginForm: $("loginForm"),
    registerForm: $("registerForm"),
    loginEmail: $("loginEmail"),
    loginPassword: $("loginPassword"),
    loginMessage: $("loginMessage"),
    loginSubmit: $("loginSubmit"),
    registerName: $("registerName"),
    registerEmail: $("registerEmail"),
    registerPassword: $("registerPassword"),
    registerMessage: $("registerMessage"),
    registerSubmit: $("registerSubmit"),
    passwordStrength: $("passwordStrength"),
    strengthLabel: $("strengthLabel"),
    forgotBtn: $("forgotBtn"),
    searchInput: $("searchInput"),
    searchClear: $("searchClear"),
    themeToggle: $("themeToggle"),
    userMenu: $("userMenu"),
    userMenuBtn: $("userMenuBtn"),
    userDropdown: $("userDropdown"),
    topUserName: $("topUserName"),
    userAvatar: $("userAvatar"),
    dropdownAvatar: $("dropdownAvatar"),
    dropdownName: $("dropdownName"),
    dropdownEmail: $("dropdownEmail"),
    sideAvatar: $("sideAvatar"),
    sideUserName: $("sideUserName"),
    sideUserEmail: $("sideUserEmail"),
    sidebar: $("sidebar"),
    sidebarToggle: $("sidebarToggle"),
    sidebarBackdrop: $("sidebarBackdrop"),
    notesGrid: $("notesGrid"),
    emptyState: $("emptyState"),
    emptyTitle: $("emptyTitle"),
    emptyText: $("emptyText"),
    emptyCta: $("emptyCta"),
    emptyCtaText: $("emptyCtaText"),
    viewTitle: $("viewTitle"),
    viewCount: $("viewCount"),
    viewSubtitle: $("viewSubtitle"),
    breadcrumbCurrent: $("breadcrumbCurrent"),
    sortSelect: $("sortSelect"),
    sidebarTags: $("sidebarTags"),
    tagTotal: $("tagTotal"),
    activeFilterBar: $("activeFilterBar"),
    activeFilterLabel: $("activeFilterLabel"),
    activeFilterChip: $("activeFilterChip"),
    mainArea: $("mainArea"),
    newNoteBtn: $("newNoteBtn"),
    fabNew: $("fabNew"),
    editorLayer: $("editorLayer"),
    editorPanel: $("editorPanel"),
    editorHeading: $("editorHeading"),
    editorScroll: $("editorScroll"),
    closeEditorBtn: $("closeEditorBtn"),
    noteTitle: $("noteTitle"),
    noteMeta: $("noteMeta"),
    noteBody: $("noteBody"),
    noteTags: $("noteTags"),
    tagInput: $("tagInput"),
    editorToolbar: $("editorToolbar"),
    editorPinBtn: $("editorPinBtn"),
    editorFavBtn: $("editorFavBtn"),
    editorDeleteBtn: $("editorDeleteBtn"),
    editorColors: $("editorColors"),
    wordCount: $("wordCount"),
    charCount: $("charCount"),
    saveState: $("saveState"),
    saveStateText: $("saveStateText"),
    modalLayer: $("modalLayer"),
    modalCard: $("modalCard"),
    modalIcon: $("modalIcon"),
    modalTitle: $("modalTitle"),
    modalBody: $("modalBody"),
    modalField: $("modalField"),
    modalInput: $("modalInput"),
    modalError: $("modalError"),
    modalCancel: $("modalCancel"),
    modalConfirm: $("modalConfirm"),
    toastRegion: $("toastRegion"),
    exportBtn: $("exportBtn"),
    securityBtn: $("securityBtn"),
    sideSecurityBtn: $("sideSecurityBtn"),
    logoutBtn: $("logoutBtn"),
    deleteAccountBtn: $("deleteAccountBtn"),
    year: $("year")
  };

  el.editorPanel.setAttribute("tabindex", "-1");

  /* =========================================================
     Helpers
     ========================================================= */
  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function now() { return Date.now(); }

  function normalizeEmail(value) { return String(value || "").trim().toLowerCase(); }

  function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(value)); }

  function normalizeSearch(value) {
    return String(value || "")
      .toLocaleLowerCase("ar")
      .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/ة/g, "ه")
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي");
  }

  function initials(name) {
    var parts = String(name || "").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "م";
    var first = Array.from(parts[0])[0] || "م";
    if (parts.length === 1) return first;
    var last = Array.from(parts[parts.length - 1])[0] || "";
    return first + last;
  }

  function hashString(value) {
    var hash = 0;
    var str = String(value || "");
    for (var i = 0; i < str.length; i += 1) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
    return hash;
  }

  function avatarGradient(value) {
    var pair = AVATAR_GRADIENTS[hashString(value) % AVATAR_GRADIENTS.length];
    return "linear-gradient(140deg, " + pair[0] + ", " + pair[1] + ")";
  }

  function tagColor(value) {
    return TAG_COLORS[hashString(normalizeSearch(value)) % TAG_COLORS.length];
  }

  function paintAvatar(node, user) {
    if (!node) return;
    node.textContent = initials(user.name);
    node.style.background = avatarGradient(user.email);
    node.style.backgroundImage = avatarGradient(user.email);
  }

  function plural(n, one, two, few, many) {
    if (n === 1) return one;
    if (n === 2) return two;
    if (n >= 3 && n <= 10) return n + " " + few;
    return n + " " + many;
  }

  function relativeTime(timestamp) {
    var ts = Number(timestamp) || now();
    var diff = Math.max(0, now() - ts);
    if (diff < 60000) return "الآن";
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return "قبل " + plural(mins, "دقيقة", "دقيقتين", "دقائق", "دقيقة");
    var hours = Math.floor(mins / 60);
    if (hours < 24) return "قبل " + plural(hours, "ساعة", "ساعتين", "ساعات", "ساعة");
    var days = Math.floor(hours / 24);
    if (days < 7) return "قبل " + plural(days, "يوم", "يومين", "أيام", "يوماً");
    return formatShortDate(ts);
  }

  function formatShortDate(timestamp) {
    try {
      var options = { day: "numeric", month: "short" };
      if (new Date(timestamp).getFullYear() !== new Date().getFullYear()) options.year = "numeric";
      return new Intl.DateTimeFormat("ar-EG", options).format(new Date(timestamp));
    } catch (e) {
      return new Date(timestamp).toLocaleDateString();
    }
  }

  function formatFullDate(timestamp) {
    try {
      return new Intl.DateTimeFormat("ar-EG", { day: "numeric", month: "long", year: "numeric" }).format(new Date(timestamp));
    } catch (e) {
      return new Date(timestamp).toLocaleDateString();
    }
  }

  function countWords(text) {
    var clean = String(text || "").trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
  }

  function truncate(text, max) {
    var value = String(text || "");
    if (value.length <= max) return value;
    return value.slice(0, Math.max(0, max - 1)).trimEnd() + "…";
  }

  /* =========================================================
     HTML sanitisation
     ========================================================= */
  var ALLOWED_TAGS = {
    P: [], DIV: [], BR: [], B: [], STRONG: [], I: [], EM: [], U: [], S: [],
    UL: [], OL: [], LI: [], H2: [], H3: [], BLOCKQUOTE: [], A: ["href"], SPAN: []
  };
  var DANGEROUS_TAGS = { SCRIPT: true, STYLE: true, IFRAME: true, OBJECT: true, EMBED: true, LINK: true, META: true, FORM: true, INPUT: true, TEXTAREA: true };

  function sanitizeHtml(html) {
    if (!html) return "";
    var doc = new DOMParser().parseFromString('<div id="mn-sanitize-root">' + html + "</div>", "text/html");
    var root = doc.getElementById("mn-sanitize-root");
    if (!root) return "";
    cleanNode(root);
    return root.innerHTML;
  }

  function cleanNode(node) {
    Array.prototype.slice.call(node.children).forEach(function (child) {
      var tag = child.tagName;
      if (!ALLOWED_TAGS[tag]) {
        if (DANGEROUS_TAGS[tag] || !child.textContent) {
          child.remove();
          return;
        }
        var text = document.createTextNode(child.textContent);
        node.replaceChild(text, child);
        return;
      }
      Array.prototype.slice.call(child.attributes).forEach(function (attr) {
        if (ALLOWED_TAGS[tag].indexOf(attr.name) === -1) child.removeAttribute(attr.name);
      });
      if (tag === "A") {
        var href = child.getAttribute("href") || "";
        if (!/^(https?:|mailto:)/i.test(href)) {
          child.removeAttribute("href");
        } else {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener noreferrer");
        }
      }
      cleanNode(child);
    });
  }

  function htmlToText(html) {
    if (!html) return "";
    var spaced = sanitizeHtml(html)
      .replace(/<\/(p|div|h2|h3|li|blockquote)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n");
    var tmp = document.createElement("div");
    tmp.innerHTML = spaced;
    return (tmp.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* =========================================================
     Storage
     ========================================================= */
  function checkStorage() {
    try {
      var key = "__mn_storage_test__";
      localStorage.setItem(key, "1");
      localStorage.removeItem(key);
      return true;
    } catch (e) {
      return false;
    }
  }

  function readUsers() {
    try {
      var raw = localStorage.getItem(USERS_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function findLocalUser(email) {
    var normalized = normalizeEmail(email);
    return readUsers().find(function (user) { return normalizeEmail(user.email) === normalized; }) || null;
  }

  function findUserById(id) {
    return readUsers().find(function (user) { return user.id === id; }) || null;
  }

  function notesKey(userId) { return NOTES_PREFIX + userId; }

  function readEncryptedNotes(userId) {
    try {
      var raw = localStorage.getItem(notesKey(userId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeSession(user, vaultKey) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ userId: user.id, key: vaultKey, at: now() }));
    } catch (e) { /* Session restore is a convenience, not a requirement. */ }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* noop */ }
  }

  function readSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /* =========================================================
     Theme + toasts
     ========================================================= */
  function setTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", theme === "dark" ? "#080d1a" : "#f5f7fb");
    if (persist) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* noop */ }
    }
  }

  function currentTheme() {
    return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  var TOAST_ICONS = { success: "i-check-circle", error: "i-alert", info: "i-info" };

  function toast(message, type, icon) {
    var node = document.createElement("div");
    node.className = "toast" + (type === "error" ? " is-error" : type === "info" ? " is-info" : "");
    node.innerHTML = '<svg class="icon"><use href="#' + (icon || TOAST_ICONS[type] || "i-check-circle") + '"></use></svg><span></span>';
    node.querySelector("span").textContent = message;
    el.toastRegion.appendChild(node);
    setTimeout(function () {
      node.classList.add("is-leaving");
      setTimeout(function () { node.remove(); }, 240);
    }, 3400);
  }

  /* =========================================================
     Form helpers
     ========================================================= */
  function showMessage(node, message) {
    node.textContent = message;
    node.hidden = false;
  }

  function clearMessage(node) {
    node.textContent = "";
    node.hidden = true;
  }

  function markInvalid(input, invalid) {
    var field = input.closest(".field");
    if (field) field.classList.toggle("has-error", !!invalid);
  }

  function clearInvalid(form) {
    $$(".field.has-error", form).forEach(function (field) { field.classList.remove("has-error"); });
  }

  function setBusy(button, busy, label) {
    var span = button.querySelector("span");
    if (busy) {
      if (!button.dataset.idleLabel && span) button.dataset.idleLabel = span.textContent;
      button.disabled = true;
      button.classList.add("is-loading");
      if (span && label) span.textContent = label;
    } else {
      button.disabled = false;
      button.classList.remove("is-loading");
      if (span && button.dataset.idleLabel) span.textContent = button.dataset.idleLabel;
    }
  }

  function passwordScore(password) {
    var value = String(password || "");
    var score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[A-Za-z\u0600-\u06FF]/.test(value) && /[0-9]/.test(value)) score += 1;
    if (/[^A-Za-z0-9\u0600-\u06FF]/.test(value) || (/[a-z]/.test(value) && /[A-Z]/.test(value))) score += 1;
    if (value.length < 8) score = Math.min(score, 1);
    return score;
  }

  function updateStrength() {
    var score = passwordScore(el.registerPassword.value);
    el.passwordStrength.setAttribute("data-score", String(score));
    var labels = [
      "استخدم 8 أحرف أو أكثر مع حروف وأرقام.",
      "كلمة مرور ضعيفة — أضف المزيد من الأحرف.",
      "كلمة مرور متوسطة — أضف أرقاماً أو رموزاً.",
      "كلمة مرور جيدة.",
      "كلمة مرور قوية جداً — أحسنت."
    ];
    el.strengthLabel.textContent = labels[score] || labels[0];
  }

  /* =========================================================
     Auth view
     ========================================================= */
  function setAuthTab(tab) {
    var register = tab === "register";
    el.authTabs.classList.toggle("is-register", register);
    $$(".auth-tab", el.authTabs).forEach(function (button) {
      var active = button.getAttribute("data-auth-tab") === tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    el.loginForm.hidden = register;
    el.registerForm.hidden = !register;
    el.authEyebrow.textContent = register ? "خطوة واحدة تفصلك" : "أهلاً بعودتك";
    el.authTitle.textContent = register ? "أنشئ مساحتك الخاصة" : "سجّل الدخول إلى مساحتك";
    el.authSubtitle.textContent = register
      ? "حساب واحد لكل بريد إلكتروني، ومساحة لا يراها غيرك."
      : "ملاحظاتك محفوظة ومشفّرة على هذا الجهاز.";
    clearMessage(el.loginMessage);
    clearMessage(el.registerMessage);
    clearInvalid(el.loginForm);
    clearInvalid(el.registerForm);
    if (register && el.loginEmail.value && !el.registerEmail.value) el.registerEmail.value = el.loginEmail.value;
    if (!register && el.registerEmail.value && !el.loginEmail.value) el.loginEmail.value = el.registerEmail.value;
  }

  async function handleLogin(event) {
    event.preventDefault();
    clearMessage(el.loginMessage);
    clearInvalid(el.loginForm);

    var email = normalizeEmail(el.loginEmail.value);
    var password = el.loginPassword.value;
    var valid = true;

    if (!isValidEmail(email)) {
      markInvalid(el.loginEmail, true);
      valid = false;
    }
    if (!password) {
      markInvalid(el.loginPassword, true);
      valid = false;
    }
    if (!valid) {
      showMessage(el.loginMessage, "يرجى إدخال بريد إلكتروني صحيح وكلمة المرور.");
      return;
    }
    if (!state.storageAvailable) {
      showMessage(el.loginMessage, "متصفحك يمنع التخزين المحلي. فعّل ملفات تعريف الارتباط أو استخدم متصفحاً آخر.");
      return;
    }

    setBusy(el.loginSubmit, true, "جارٍ التحقق…");
    try {
      var user = findLocalUser(email);
      if (!user) throw new Error("EMAIL_NOT_FOUND");

      var verifier = await C.createVerifier(password, user.salt);
      if (!C.constantTimeEqual(verifier, user.verifier)) throw new Error("WRONG_PASSWORD");

      var vaultKey;
      try {
        vaultKey = await C.unwrapVaultKey(user.vault, password, user.salt);
      } catch (error) {
        throw new Error("CORRUPT_VAULT");
      }

      var notes = [];
      var blob = readEncryptedNotes(user.id);
      if (blob) {
        try {
          notes = await C.decryptJSON(blob, vaultKey);
        } catch (error) {
          throw new Error("CORRUPT_NOTES");
        }
      }
      if (!Array.isArray(notes)) notes = [];

      try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch (e) { /* noop */ }
      writeSession(user, vaultKey);
      enterApp(user, vaultKey, notes, false);
      toast("مرحباً بعودتك، " + (user.name.split(/\s+/)[0] || "صديقنا") + " 👋", "success", "i-sparkles");
    } catch (error) {
      var message = "تعذّر تسجيل الدخول. حاول مرة أخرى.";
      if (error.message === "EMAIL_NOT_FOUND") message = "لا يوجد حساب مسجّل بهذا البريد الإلكتروني على هذا الجهاز.";
      if (error.message === "WRONG_PASSWORD") message = "كلمة المرور غير صحيحة. تحقق منها وحاول مجدداً.";
      if (error.message === "CORRUPT_VAULT") message = "تعذّر فتح خزانة الملاحظات. قد تكون البيانات الخاصة بهذا الحساب تالفة.";
      if (error.message === "CORRUPT_NOTES") message = "تعذّر فك تشفير الملاحظات. قد تكون البيانات تالفة أو تم تعديلها.";
      showMessage(el.loginMessage, message);
      el.loginPassword.value = "";
      el.loginPassword.focus();
    } finally {
      setBusy(el.loginSubmit, false);
    }
  }

  function makeWelcomeNote() {
    var stamp = now();
    return {
      id: C.randomId(),
      title: "مرحباً بك في ملاحظاتي",
      content:
        "<p>هذه مساحتك الخاصة لتدوين الأفكار وترتيبها. كل ما تكتبه هنا <strong>مشفّر</strong> ولا يغادر جهازك.</p>" +
        "<h2>ثلاث خطوات سريعة</h2>" +
        "<ul><li>أنشئ ملاحظة جديدة من الزر أعلى الصفحة أو بمفتاح <strong>Ctrl + Alt + N</strong>.</li>" +
        "<li>أضف وسوماً لتجميع ملاحظاتك، وثبّت الأهم منها ليظهر أولاً.</li>" +
        "<li>ابحث فورياً من شريط البحث أو بمفتاح <strong>Ctrl + K</strong>.</li></ul>" +
        "<blockquote>ملاحظة: لا يمكن استعادة كلمة المرور، لأن مفتاح التشفير مشتق منها ولا نحتفظ به.</blockquote>",
      tags: ["ابدأ هنا"],
      color: "sky",
      pinned: true,
      favorite: false,
      deletedAt: null,
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  async function handleRegister(event) {
    event.preventDefault();
    clearMessage(el.registerMessage);
    clearInvalid(el.registerForm);

    var name = el.registerName.value.trim().replace(/\s+/g, " ");
    var email = normalizeEmail(el.registerEmail.value);
    var password = el.registerPassword.value;
    var valid = true;

    if (name.length < 2) { markInvalid(el.registerName, true); valid = false; }
    if (!isValidEmail(email)) { markInvalid(el.registerEmail, true); valid = false; }
    if (password.length < 8 || !/[A-Za-z\u0600-\u06FF]/.test(password) || !/[0-9]/.test(password)) {
      markInvalid(el.registerPassword, true);
      valid = false;
    }
    if (!valid) {
      showMessage(el.registerMessage, "أكمل البيانات بشكل صحيح: الاسم، بريد صالح، وكلمة مرور من 8 أحرف تتضمن حروفاً وأرقاماً.");
      return;
    }
    if (!state.storageAvailable) {
      showMessage(el.registerMessage, "متصفحك يمنع التخزين المحلي. لن نتمكن من حفظ حسابك.");
      return;
    }
    if (findLocalUser(email)) {
      markInvalid(el.registerEmail, true);
      showMessage(el.registerMessage, "يوجد حساب بهذا البريد الإلكتروني بالفعل. سجّل الدخول بدلاً من ذلك.");
      return;
    }

    setBusy(el.registerSubmit, true, "جارٍ إنشاء مساحتك…");
    try {
      var salt = await C.createSalt();
      var verifier = await C.createVerifier(password, salt);
      var vaultKey = await C.createVaultKey();
      var wrapped = await C.wrapVaultKey(vaultKey, password, salt);
      var notes = [makeWelcomeNote()];
      var encrypted = await C.encryptJSON(notes, vaultKey);

      var user = {
        id: C.randomId(),
        name: name,
        email: email,
        salt: salt,
        verifier: verifier,
        vault: wrapped,
        createdAt: now()
      };

      var users = readUsers();
      users.push(user);
      writeUsers(users);
      localStorage.setItem(notesKey(user.id), JSON.stringify(encrypted));
      try { localStorage.setItem(LAST_EMAIL_KEY, email); } catch (e) { /* noop */ }
      writeSession(user, vaultKey);
      enterApp(user, vaultKey, notes, false);
      toast("تم إنشاء مساحتك بنجاح. أهلاً بك في ملاحظاتي!", "success", "i-sparkles");
    } catch (error) {
      console.error(error);
      var message = "تعذّر إنشاء الحساب. قد تكون مساحة التخزين ممتلئة.";
      if (error && error.name === "QuotaExceededError") message = "مساحة التخزين في المتصفح ممتلئة. احذف بعض البيانات ثم حاول مجدداً.";
      showMessage(el.registerMessage, message);
    } finally {
      setBusy(el.registerSubmit, false);
    }
  }

  function showForgotModal() {
    openModal({
      tone: "info",
      icon: "key",
      title: "لا يمكن استعادة كلمة المرور",
      html:
        "<p>لحماية خصوصيتك، لا نحتفظ بكلمة المرور ولا بأي نسخة من مفتاح التشفير. المفتاح يُشتق من كلمة مرورك عند تسجيل الدخول.</p>" +
        "<p>إذا نسيت كلمة المرور، فلن يمكن فتح الملاحظات المشفّرة. يمكنك حذف بيانات الموقع من إعدادات المتصفح والبدء من جديد.</p>",
      confirmText: "فهمت",
      hideCancel: true
    });
  }

  /* =========================================================
     App view
     ========================================================= */
  function enterApp(user, vaultKey, notes, restored) {
    state.user = user;
    state.vaultKey = vaultKey;
    state.notes = Array.isArray(notes) ? notes : [];
    state.filter = "all";
    state.tag = null;
    state.query = "";
    state.sort = "updated";
    state.storageAvailable = true;

    el.authView.hidden = true;
    el.appView.hidden = false;
    document.body.classList.add("app-open");
    document.title = "مساحتك — ملاحظاتي";
    el.bootOverlay.classList.add("is-ready");

    paintAvatar(el.userAvatar, user);
    paintAvatar(el.dropdownAvatar, user);
    paintAvatar(el.sideAvatar, user);
    el.topUserName.textContent = user.name;
    el.dropdownName.textContent = user.name;
    el.dropdownEmail.textContent = user.email;
    el.sideUserName.textContent = user.name;
    el.sideUserEmail.textContent = user.email;
    el.sortSelect.value = state.sort;
    el.searchInput.value = "";

    renderAll();
    closeSidebar();
    closeUserMenu();

    if (!restored) {
      setTimeout(function () {
        el.mainArea.scrollTop = 0;
        el.mainArea.focus({ preventScroll: true });
      }, 30);
    }
  }

  function showAuthView() {
    closeEditor(true);
    closeModal({ confirmed: false }, true);
    closeSidebar();
    closeUserMenu();

    state.user = null;
    state.vaultKey = null;
    state.notes = [];
    state.filter = "all";
    state.tag = null;
    state.query = "";
    state.sort = "updated";
    state.editorId = null;
    state.editorIsNew = false;
    state.saveVersion += 1;
    if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
    state.saveChain = Promise.resolve();

    el.appView.hidden = true;
    el.authView.hidden = false;
    document.body.classList.remove("app-open");
    document.title = "ملاحظاتي — مساحة أفكارك الخاصة";
    el.searchInput.value = "";
    el.loginPassword.value = "";
    el.registerPassword.value = "";
    el.loginEmail.value = "";
    el.registerEmail.value = "";
    el.registerName.value = "";
    updateStrength();
    clearMessage(el.loginMessage);
    clearMessage(el.registerMessage);
    clearInvalid(el.loginForm);
    clearInvalid(el.registerForm);
    setAuthTab("login");

    try {
      var lastEmail = localStorage.getItem(LAST_EMAIL_KEY);
      if (lastEmail) el.loginEmail.value = lastEmail;
    } catch (e) { /* noop */ }

    if (!state.storageAvailable) {
      showMessage(el.loginMessage, "متصفحك يمنع التخزين المحلي، ولن يتمكن الموقع من حفظ الملاحظات. فعّل التخزين ثم أعد التحميل.");
    }
  }

  function renderAll() {
    if (!state.user) return;
    var visible = getVisibleNotes();
    renderSidebarCounts();
    renderSidebarTags();
    renderHeader(visible.length);
    renderNotes(visible);
    renderActiveFilter();
  }

  function getVisibleNotes() {
    var query = normalizeSearch(state.query);
    var tag = state.tag ? normalizeSearch(state.tag) : "";
    var isTrash = state.filter === "trash";

    var list = state.notes.filter(function (note) {
      if (isTrash) {
        if (!note.deletedAt) return false;
      } else {
        if (note.deletedAt) return false;
        if (state.filter === "pinned" && !note.pinned) return false;
        if (state.filter === "favorites" && !note.favorite) return false;
      }
      if (tag && !(note.tags || []).some(function (item) { return normalizeSearch(item) === tag; })) return false;
      if (query) {
        var haystack = normalizeSearch((note.title || "") + " " + htmlToText(note.content) + " " + (note.tags || []).join(" "));
        if (haystack.indexOf(query) === -1) return false;
      }
      return true;
    });

    list.sort(function (a, b) {
      if (!isTrash && !!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
      if (state.sort === "title") return String(a.title || "").localeCompare(String(b.title || ""), "ar");
      if (state.sort === "created") return (b.createdAt || 0) - (a.createdAt || 0);
      return (b.updatedAt || 0) - (a.updatedAt || 0);
    });
    return list;
  }

  function renderSidebarCounts() {
    var active = state.notes.filter(function (note) { return !note.deletedAt; });
    var counts = {
      all: active.length,
      pinned: active.filter(function (note) { return note.pinned; }).length,
      favorites: active.filter(function (note) { return note.favorite; }).length,
      trash: state.notes.filter(function (note) { return !!note.deletedAt; }).length
    };
    $$("[data-count]").forEach(function (node) {
      node.textContent = String(counts[node.getAttribute("data-count")] || 0);
    });
    $$(".nav-item", el.sidebar).forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-filter") === state.filter);
    });
  }

  function renderSidebarTags() {
    var counts = {};
    state.notes.forEach(function (note) {
      if (note.deletedAt) return;
      (note.tags || []).forEach(function (tag) {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    var tags = Object.keys(counts).sort(function (a, b) { return a.localeCompare(b, "ar"); });
    el.tagTotal.textContent = String(tags.length);
    if (!tags.length) {
      el.sidebarTags.innerHTML = '<p class="tags-empty">ستظهر وسومك هنا بعد إضافتها إلى الملاحظات.</p>';
      return;
    }
    el.sidebarTags.innerHTML = tags.map(function (tag) {
      var active = state.tag && normalizeSearch(state.tag) === normalizeSearch(tag);
      return '<button type="button" class="sidebar-tag' + (active ? " active" : "") + '" data-tag="' + escapeHtml(tag) + '" style="--tag-color:' + tagColor(tag) + '">' +
        '<i></i><span>' + escapeHtml(tag) + '</span><b>' + counts[tag] + "</b></button>";
    }).join("");
  }

  function renderHeader(count) {
    var title = FILTERS[state.filter].title;
    var subtitle = FILTERS[state.filter].subtitle;

    if (state.query) {
      title = "نتائج البحث";
      subtitle = count
        ? "عثرنا على " + plural(count, "نتيجة واحدة", "نتيجتين", "نتائج", "نتيجة") + ' عن «' + state.query + "»."
        : 'لا توجد نتائج مطابقة لـ «' + state.query + "».";
    } else if (state.tag) {
      title = "#" + state.tag;
      subtitle = count
        ? "كل الملاحظات الموسومة بهذا الوسم."
        : "لا توجد ملاحظات بهذا الوسم بعد.";
    }

    el.viewTitle.textContent = title;
    el.viewSubtitle.textContent = subtitle;
    el.viewCount.textContent = String(count);
    el.breadcrumbCurrent.textContent = title;
  }

  function renderNotes(notes) {
    if (!notes.length) {
      el.notesGrid.innerHTML = "";
      setEmptyState();
      return;
    }
    el.emptyState.hidden = true;
    el.notesGrid.innerHTML = notes.map(function (note, index) { return cardHtml(note, index); }).join("");
  }

  function cardHtml(note, index) {
    var deleted = !!note.deletedAt;
    var title = String(note.title || "").trim();
    var text = htmlToText(note.content);
    var tags = (note.tags || []).slice(0, 3);
    var extraTags = Math.max(0, (note.tags || []).length - 3);
    var words = countWords(text);
    var stamp = deleted ? note.deletedAt : note.updatedAt;
    var color = ["default", "sand", "rose", "mint", "sky", "violet"].indexOf(note.color) >= 0 ? note.color : "default";

    var status = "";
    if (!deleted && note.pinned) status += '<svg class="icon" aria-label="مثبتة"><use href="#i-pin"></use></svg>';
    if (!deleted && note.favorite) status += '<svg class="icon fav" aria-label="مفضلة"><use href="#i-star"></use></svg>';
    if (deleted) status += '<svg class="icon" aria-label="محذوفة"><use href="#i-trash"></use></svg>';

    var actions;
    if (deleted) {
      actions =
        '<button type="button" class="card-action" data-action="restore" data-id="' + note.id + '" title="استعادة" aria-label="استعادة الملاحظة"><svg class="icon"><use href="#i-restore"></use></svg></button>' +
        '<button type="button" class="card-action danger" data-action="delete-forever" data-id="' + note.id + '" title="حذف نهائي" aria-label="حذف نهائي"><svg class="icon"><use href="#i-trash"></use></svg></button>';
    } else {
      actions =
        '<button type="button" class="card-action' + (note.pinned ? " is-active" : "") + '" data-action="pin" data-id="' + note.id + '" title="تثبيت" aria-label="تثبيت الملاحظة" aria-pressed="' + (!!note.pinned) + '"><svg class="icon"><use href="#i-pin"></use></svg></button>' +
        '<button type="button" class="card-action fav' + (note.favorite ? " is-active" : "") + '" data-action="favorite" data-id="' + note.id + '" title="المفضلة" aria-label="إضافة إلى المفضلة" aria-pressed="' + (!!note.favorite) + '"><svg class="icon"><use href="#i-star"></use></svg></button>' +
        '<button type="button" class="card-action danger" data-action="trash" data-id="' + note.id + '" title="نقل إلى المهملات" aria-label="نقل إلى المهملات"><svg class="icon"><use href="#i-trash"></use></svg></button>';
    }

    var tagsHtml = tags.map(function (tag) {
      return '<span class="note-tag-chip" title="' + escapeHtml(tag) + '">' + escapeHtml(tag) + "</span>";
    }).join("");
    if (extraTags) tagsHtml += '<span class="note-tag-chip">+' + extraTags + "</span>";

    return '<article class="note-card' + (deleted ? " is-trash" : "") + '" data-id="' + note.id + '" data-color="' + color + '" tabindex="0" role="button" aria-label="' + escapeHtml(title || "بدون عنوان") + '" style="--i:' + Math.min(index, 12) + '">' +
      '<div class="note-card-top">' +
        '<span class="card-status">' + status + "</span>" +
        '<div class="card-actions' + (deleted ? " trash-actions" : "") + '">' + actions + "</div>" +
      "</div>" +
      '<h3 class="note-card-title' + (title ? "" : " is-untitled") + '">' + escapeHtml(title || "بدون عنوان") + "</h3>" +
      '<p class="note-card-snippet' + (text ? "" : " is-empty") + '">' + escapeHtml(truncate(text, 210) || "لا يوجد محتوى بعد — ابدأ الكتابة.") + "</p>" +
      (tagsHtml ? '<div class="note-card-tags">' + tagsHtml + "</div>" : "") +
      '<div class="note-card-foot">' +
        '<span class="note-date"><svg class="icon"><use href="#i-note"></use></svg>' + (deleted ? "حُذفت " : "") + relativeTime(stamp) + "</span>" +
        '<span class="note-words">' + (words ? plural(words, "كلمة واحدة", "كلمتان", "كلمات", "كلمة") : "فارغة") + "</span>" +
      "</div>" +
    "</article>";
  }

  function setEmptyState() {
    var mode = "all";
    var title = "مساحتك جاهزة لأول فكرة";
    var text = "ابدأ بملاحظة صغيرة. ستُحفظ هنا، مشفّرة، ولا يراها أحد غيرك.";
    var cta = "أنشئ ملاحظتك الأولى";
    var showCta = true;

    if (state.query) {
      mode = "search";
      title = "لا نتائج مطابقة";
      text = "جرّب كلمة أخرى، أو امسح البحث للعودة إلى كل ملاحظاتك.";
      cta = "مسح البحث";
    } else if (state.tag) {
      mode = "tag";
      title = "لا ملاحظات بهذا الوسم";
      text = "أضف هذا الوسم إلى ملاحظة، أو اعرض كل ملاحظاتك من جديد.";
      cta = "عرض كل الملاحظات";
    } else if (state.filter === "trash") {
      mode = "trash";
      title = "المهملات فارغة";
      text = "لن تجد هنا إلا الملاحظات التي حذفتها. يمكنك استعادتها في أي وقت قبل حذفها نهائياً.";
      showCta = false;
    } else if (state.filter === "pinned") {
      mode = "pinned";
      title = "لا ملاحظات مثبّتة";
      text = "ثبّت الملاحظات المهمة من بطاقة الملاحظة أو من المحرر لتظهر هنا أولاً.";
      cta = "أنشئ ملاحظة جديدة";
    } else if (state.filter === "favorites") {
      mode = "favorites";
      title = "لا ملاحظات مفضّلة";
      text = "أضف نجمة إلى الملاحظات التي تعود إليها كثيراً لتجدها بسرعة هنا.";
      cta = "أنشئ ملاحظة جديدة";
    }

    state.emptyMode = mode;
    el.emptyTitle.textContent = title;
    el.emptyText.textContent = text;
    el.emptyCtaText.textContent = cta;
    el.emptyCta.hidden = !showCta;
    el.emptyState.hidden = false;
  }

  function renderActiveFilter() {
    var label = state.tag ? "وسم: " + state.tag : state.query ? "بحث: " + state.query : "";
    if (!label) {
      el.activeFilterBar.hidden = true;
      return;
    }
    el.activeFilterLabel.textContent = label;
    el.activeFilterBar.hidden = false;
  }

  function clearFilters() {
    state.tag = null;
    state.query = "";
    el.searchInput.value = "";
    el.searchClear.hidden = true;
    el.mainArea.scrollTop = 0;
    renderAll();
  }

  /* =========================================================
     Editor
     ========================================================= */
  function currentNote() {
    if (!state.editorId) return null;
    return state.notes.find(function (note) { return note.id === state.editorId; }) || null;
  }

  function makeNote() {
    var stamp = now();
    return {
      id: C.randomId(),
      title: "",
      content: "",
      tags: [],
      color: "default",
      pinned: false,
      favorite: false,
      deletedAt: null,
      createdAt: stamp,
      updatedAt: stamp
    };
  }

  function createNote() {
    if (!state.user) return;
    var note = makeNote();
    state.notes.unshift(note);
    openEditor(note.id, true);
  }

  function openEditor(id, isNew) {
    var note = state.notes.find(function (item) { return item.id === id && !item.deletedAt; });
    if (!note) return;

    state.editorId = id;
    state.editorIsNew = !!isNew;
    if (state.editorCloseTimer) { clearTimeout(state.editorCloseTimer); state.editorCloseTimer = null; }

    el.editorHeading.textContent = isNew ? "ملاحظة جديدة" : "تحرير الملاحظة";
    el.noteTitle.value = note.title || "";
    el.noteBody.innerHTML = sanitizeHtml(note.content || "");
    updateBodyEmptyState();
    renderEditorTags();
    renderEditorButtons(note);
    updateEditorMeta(note);
    updateEditorCounts();
    setSaveState("saved");

    el.editorLayer.hidden = false;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        el.editorLayer.classList.add("is-open");
        el.editorPanel.focus({ preventScroll: true });
        el.editorScroll.scrollTop = 0;
      });
    });

    if (isNew) {
      setTimeout(function () { el.noteTitle.focus({ preventScroll: true }); }, 360);
    }
  }

  function updateEditorMeta(note) {
    el.noteMeta.textContent = "أُنشئت " + formatFullDate(note.createdAt) + " · آخر تعديل " + relativeTime(note.updatedAt);
  }

  function renderEditorButtons(note) {
    el.editorPinBtn.classList.toggle("is-active", !!note.pinned);
    el.editorPinBtn.setAttribute("aria-pressed", String(!!note.pinned));
    el.editorPinBtn.title = note.pinned ? "إلغاء التثبيت" : "تثبيت الملاحظة";
    el.editorFavBtn.classList.toggle("is-favorite", !!note.favorite);
    el.editorFavBtn.setAttribute("aria-pressed", String(!!note.favorite));
    el.editorFavBtn.title = note.favorite ? "إزالة من المفضلة" : "إضافة إلى المفضلة";
    $$(".color-swatch", el.editorColors).forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-color") === (note.color || "default"));
    });
  }

  function renderEditorTags() {
    var note = currentNote();
    if (!note) return;
    var tags = note.tags || [];
    el.noteTags.innerHTML = tags.map(function (tag) {
      return '<span class="editor-tag">#' + escapeHtml(tag) +
        '<button type="button" data-remove-tag="' + escapeHtml(tag) + '" aria-label="إزالة الوسم ' + escapeHtml(tag) + '"><svg class="icon"><use href="#i-x"></use></svg></button></span>';
    }).join("");
  }

  function updateBodyEmptyState() {
    var hasText = String(el.noteBody.textContent || "").trim().length > 0;
    var hasBlocks = el.noteBody.querySelector("ul, ol, blockquote, h2, h3");
    el.noteBody.classList.toggle("is-empty", !hasText && !hasBlocks);
  }

  function updateEditorCounts() {
    var text = el.noteBody.innerText || el.noteBody.textContent || "";
    el.wordCount.textContent = plural(countWords(text), "كلمة واحدة", "كلمتان", "كلمات", "كلمة");
    el.charCount.textContent = plural(text.replace(/\s/g, "").length, "حرف واحد", "حرفان", "أحرف", "حرفاً");
  }

  function setSaveState(kind) {
    el.saveState.classList.toggle("is-saving", kind === "saving");
    el.saveState.classList.toggle("is-error", kind === "error");
    el.saveStateText.textContent = kind === "saving" ? "جارٍ الحفظ…" : kind === "error" ? "تعذّر الحفظ" : "محفوظة";
  }

  function scheduleSave() {
    state.saveVersion += 1;
    setSaveState("saving");
    if (state.saveTimer) clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(function () {
      state.saveTimer = null;
      saveNotes(state.saveVersion);
    }, 600);
  }

  function noteSnapshot() {
    return state.notes.map(function (note) {
      return {
        id: note.id,
        title: String(note.title || "").trim(),
        content: sanitizeHtml(note.content || ""),
        tags: Array.isArray(note.tags) ? note.tags.slice(0, 5) : [],
        color: note.color || "default",
        pinned: !!note.pinned,
        favorite: !!note.favorite,
        deletedAt: note.deletedAt || null,
        createdAt: note.createdAt || now(),
        updatedAt: note.updatedAt || now()
      };
    });
  }

  function saveNotes(version) {
    if (!state.user || !state.vaultKey) return Promise.resolve();
    var userId = state.user.id;
    var vaultKey = state.vaultKey;
    var payload = noteSnapshot();

    var run = async function () {
      try {
        var encrypted = await C.encryptJSON(payload, vaultKey);
        localStorage.setItem(notesKey(userId), JSON.stringify(encrypted));
        if (state.user && state.user.id === userId) {
          if (version == null || version === state.saveVersion) setSaveState("saved");
        }
      } catch (error) {
        console.error(error);
        setSaveState("error");
        toast("تعذّر حفظ الملاحظات. تحقق من مساحة التخزين في المتصفح.", "error");
        throw error;
      }
    };

    state.saveChain = state.saveChain.catch(function () { /* keep the queue alive */ }).then(run);
    return state.saveChain.catch(function () { /* surfaced above */ });
  }

  async function flushSave() {
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }
    if (state.user) await saveNotes();
  }

  function closeEditor(immediate) {
    if (el.editorLayer.hidden) return;
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
      state.saveTimer = null;
    }

    var note = currentNote();
    if (state.editorIsNew && note) {
      var empty = !String(note.title || "").trim() && !htmlToText(note.content);
      if (empty) {
        state.notes = state.notes.filter(function (item) { return item.id !== note.id; });
      }
    }

    if (state.user) saveNotes();
    el.editorLayer.classList.remove("is-open");
    state.editorId = null;
    state.editorIsNew = false;

    if (immediate) {
      el.editorLayer.hidden = true;
      if (state.editorCloseTimer) clearTimeout(state.editorCloseTimer);
      state.editorCloseTimer = null;
    } else {
      if (state.editorCloseTimer) clearTimeout(state.editorCloseTimer);
      state.editorCloseTimer = setTimeout(function () {
        el.editorLayer.hidden = true;
        state.editorCloseTimer = null;
      }, 380);
    }
    renderAll();
  }

  function handleEditorInput() {
    var note = currentNote();
    if (!note) return;
    note.title = el.noteTitle.value;
    note.content = el.noteBody.innerHTML;
    note.updatedAt = now();
    updateBodyEmptyState();
    updateEditorCounts();
    updateEditorMeta(note);
    scheduleSave();
  }

  function togglePinned(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    note.pinned = !note.pinned;
    renderEditorButtons(note);
    renderAll();
    setSaveState("saving");
    saveNotes();
  }

  function toggleFavorite(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    note.favorite = !note.favorite;
    renderEditorButtons(note);
    renderAll();
    setSaveState("saving");
    saveNotes();
  }

  function addTag(raw) {
    var note = currentNote();
    if (!note) return;
    var tag = String(raw || "").replace(/^#+/, "").replace(/\s+/g, " ").trim();
    if (!tag) return;
    if (Array.from(tag).length > 24) { toast("الوسم طويل جداً. استخدم 24 حرفاً كحد أقصى.", "info"); return; }
    if (note.tags.length >= 5) { toast("يمكنك إضافة 5 وسوم كحد أقصى لكل ملاحظة.", "info"); return; }
    var exists = note.tags.some(function (item) { return normalizeSearch(item) === normalizeSearch(tag); });
    if (exists) { el.tagInput.value = ""; return; }
    note.tags.push(tag);
    note.updatedAt = now();
    el.tagInput.value = "";
    renderEditorTags();
    scheduleSave();
  }

  function removeTag(tag) {
    var note = currentNote();
    if (!note) return;
    note.tags = note.tags.filter(function (item) { return item !== tag; });
    note.updatedAt = now();
    renderEditorTags();
    scheduleSave();
  }

  function moveToTrash(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    note.deletedAt = now();
    note.updatedAt = now();
    note.pinned = false;
    note.favorite = false;
    saveNotes();
    renderAll();
    toast("نُقلت الملاحظة إلى المهملات. يمكنك استعادتها لاحقاً.", "info", "i-trash");
  }

  function restoreNote(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    note.deletedAt = null;
    note.updatedAt = now();
    saveNotes();
    renderAll();
    toast("تمت استعادة الملاحظة بنجاح.", "success", "i-restore");
  }

  function deleteForever(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    state.notes = state.notes.filter(function (item) { return item.id !== id; });
    saveNotes();
    renderAll();
    toast("تم حذف الملاحظة نهائياً.", "info", "i-trash");
  }

  async function confirmTrashFromEditor(id) {
    var result = await openModal({
      tone: "danger",
      icon: "trash",
      title: "نقل الملاحظة إلى المهملات؟",
      message: "لن تُحذف نهائياً. يمكنك استعادتها من قسم المهملات في أي وقت.",
      confirmText: "نقل إلى المهملات",
      cancelText: "إلغاء"
    });
    if (!result.confirmed) return;
    moveToTrash(id);
    closeEditor();
  }

  async function previewTrashNote(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    var text = htmlToText(note.content) || "لا يوجد محتوى في هذه الملاحظة.";
    var tags = (note.tags || []).map(function (tag) { return "<span>#" + escapeHtml(tag) + "</span>"; }).join("");
    var result = await openModal({
      tone: "info",
      icon: "restore",
      title: String(note.title || "").trim() || "بدون عنوان",
      html:
        '<div class="modal-preview"><div class="preview-content">' + escapeHtml(text) + "</div>" +
        (tags ? '<div class="preview-tags">' + tags + "</div>" : "") + "</div>" +
        '<p style="margin-top:12px;font-size:10px;color:var(--muted-2)">حُذفت ' + relativeTime(note.deletedAt) + "</p>",
      confirmText: "استعادة الملاحظة",
      cancelText: "إغلاق"
    });
    if (result.confirmed) restoreNote(id);
  }

  async function confirmDeleteForever(id) {
    var note = state.notes.find(function (item) { return item.id === id; });
    if (!note) return;
    var result = await openModal({
      tone: "danger",
      icon: "trash",
      title: "حذف الملاحظة نهائياً؟",
      message: "سيتم حذف هذه الملاحظة من هذا الجهاز نهائياً. لا يمكن التراجع عن هذا الإجراء.",
      confirmText: "حذف نهائياً",
      cancelText: "إلغاء"
    });
    if (result.confirmed) deleteForever(id);
  }

  /* =========================================================
     Profile / account
     ========================================================= */
  function closeUserMenu() {
    el.userDropdown.hidden = true;
    el.userMenu.classList.remove("is-open");
    el.userMenuBtn.setAttribute("aria-expanded", "false");
  }

  function toggleUserMenu() {
    var open = el.userDropdown.hidden;
    el.userDropdown.hidden = !open;
    el.userMenu.classList.toggle("is-open", open);
    el.userMenuBtn.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function openSidebar() {
    el.sidebar.classList.add("is-open");
    el.sidebarBackdrop.classList.add("is-open");
    el.sidebarToggle.setAttribute("aria-expanded", "true");
  }

  function closeSidebar() {
    el.sidebar.classList.remove("is-open");
    el.sidebarBackdrop.classList.remove("is-open");
    el.sidebarToggle.setAttribute("aria-expanded", "false");
  }

  async function handleLogout() {
    closeUserMenu();
    await flushSave();
    clearSession();
    showAuthView();
    toast("تم تسجيل الخروج بأمان. ملاحظاتك بقيت مشفّرة على جهازك.", "info", "i-lock");
  }

  async function handleDeleteAccount() {
    closeUserMenu();
    var result = await openModal({
      tone: "danger",
      icon: "delete",
      title: "حذف الحساب نهائياً؟",
      html:
        "<p>سيتم حذف حساب <strong>" + escapeHtml(state.user.email) + "</strong> وكل ملاحظاته من هذا المتصفح نهائياً.</p>" +
        "<p>لا يمكن التراجع عن هذا الإجراء.</p>",
      confirmText: "حذف الحساب",
      cancelText: "إلغاء",
      requirePassword: true,
      onConfirm: async function (password) {
        var user = findUserById(state.user.id);
        if (!user) throw new Error("الحساب غير موجود.");
        var verifier = await C.createVerifier(password, user.salt);
        if (!C.constantTimeEqual(verifier, user.verifier)) throw new Error("كلمة المرور غير صحيحة.");
      }
    });
    if (!result.confirmed) return;
    await deleteAccountNow();
  }

  async function deleteAccountNow() {
    var user = state.user;
    if (!user) return;
    if (state.saveTimer) { clearTimeout(state.saveTimer); state.saveTimer = null; }
    state.saveVersion += 1;
    await state.saveChain.catch(function () { /* wait for any running write */ });
    try { localStorage.removeItem(notesKey(user.id)); } catch (e) { /* noop */ }
    try {
      var users = readUsers().filter(function (item) { return item.id !== user.id; });
      writeUsers(users);
    } catch (e) { /* noop */ }
    try {
      if (localStorage.getItem(LAST_EMAIL_KEY) === user.email) localStorage.removeItem(LAST_EMAIL_KEY);
    } catch (e) { /* noop */ }
    clearSession();
    showAuthView();
    toast("تم حذف الحساب وكل ملاحظاته نهائياً.", "info", "i-trash");
  }

  function exportNotes() {
    var active = state.notes.filter(function (note) { return !note.deletedAt; });
    if (!active.length) {
      toast("لا توجد ملاحظات لتصديرها بعد.", "info", "i-download");
      return;
    }
    active.sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); });
    var lines = [
      "# ملاحظاتي",
      "",
      "> تصدير بتاريخ " + formatFullDate(now()),
      "> عدد الملاحظات: " + active.length,
      "",
      "---",
      ""
    ];
    active.forEach(function (note) {
      var title = String(note.title || "").trim() || "بدون عنوان";
      var text = htmlToText(note.content);
      lines.push("## " + title);
      if (note.tags && note.tags.length) lines.push("**الوسوم:** " + note.tags.map(function (tag) { return "#" + tag; }).join(" · "));
      lines.push("**آخر تعديل:** " + formatFullDate(note.updatedAt));
      lines.push("");
      lines.push(text || "_لا يوجد محتوى._");
      lines.push("");
      lines.push("---");
      lines.push("");
    });

    var blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    var date = new Date();
    link.href = url;
    link.download = "ملاحظاتي-" + date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0") + ".md";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast("تم تصدير " + plural(active.length, "ملاحظة واحدة", "ملاحظتين", "ملاحظات", "ملاحظة") + " بصيغة Markdown.", "success", "i-download");
  }

  function showSecurityModal() {
    openModal({
      tone: "info",
      icon: "shield",
      title: "الخصوصية والتشفير",
      html:
        '<ul class="info-list">' +
          '<li><svg class="icon"><use href="#i-lock"></use></svg><div><b>تشفير AES-256-GCM</b><span>كل ملاحظاتك تُشفَّر قبل حفظها في localStorage، بما في ذلك في سلة المهملات.</span></div></li>' +
          '<li><svg class="icon"><use href="#i-key"></use></svg><div><b>مفتاح من كلمة مرورك</b><span>يُشتق المفتاح عبر PBKDF2-SHA256 بـ310,000 دورة. لا نخزّن كلمة المرور أو المفتاح على القرص.</span></div></li>' +
          '<li><svg class="icon"><use href="#i-user"></use></svg><div><b>عزل كامل بين الحسابات</b><span>لكل بريد إلكتروني خزانة مستقلة ومفتاح مستقل. لا يمكن لحساب فتح ملاحظات حساب آخر.</span></div></li>' +
          '<li><svg class="icon"><use href="#i-cloud-off"></use></svg><div><b>لا خوادم ولا تتبّع</b><span>لا تُرسل أي بيانات إلى أي خادم. كل شيء يبقى داخل متصفحك.</span></div></li>' +
          '<li><svg class="icon"><use href="#i-alert"></use></svg><div><b>تنبيه مهم</b><span>من يملك وصولاً كاملاً إلى جهازك أثناء جلستك المفتوحة قد يصل إلى ملاحظاتك. سجّل الخروج بعد الاستخدام على الأجهزة المشتركة.</span></div></li>' +
        "</ul>",
      confirmText: "فهمت",
      hideCancel: true
    });
  }

  /* =========================================================
     Modal
     ========================================================= */
  function openModal(options) {
    return new Promise(function (resolve) {
      state.modalResolve = resolve;
      state.modalOptions = options;
      state.modalBusy = false;

      el.modalTitle.textContent = options.title || "تأكيد";
      if (options.html) {
        el.modalBody.innerHTML = options.html;
      } else {
        el.modalBody.textContent = options.message || "";
      }
      var iconName = options.icon === "delete" ? "trash" : options.icon || "alert";
      el.modalIcon.innerHTML = '<svg class="icon"><use href="#i-' + iconName + '"></use></svg>';
      el.modalIcon.classList.toggle("is-info", options.tone === "info");
      el.modalCancel.hidden = !!options.hideCancel;
      el.modalCancel.textContent = options.cancelText || "إلغاء";
      el.modalConfirm.textContent = options.confirmText || "تأكيد";
      el.modalConfirm.className = "btn " + (options.tone === "danger" ? "btn-danger" : "btn-primary");
      el.modalConfirm.disabled = false;
      el.modalField.hidden = !options.requirePassword;
      el.modalInput.value = "";
      el.modalError.hidden = true;
      el.modalError.textContent = "";

      el.modalLayer.hidden = false;
      document.body.classList.add("modal-open");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          el.modalLayer.classList.add("is-open");
          if (options.requirePassword) {
            setTimeout(function () { el.modalInput.focus(); }, 60);
          } else {
            setTimeout(function () { el.modalConfirm.focus(); }, 60);
          }
        });
      });
    });
  }

  function closeModal(result, immediate) {
    if (el.modalLayer.hidden) return;
    el.modalLayer.classList.remove("is-open");
    document.body.classList.remove("modal-open");
    var resolve = state.modalResolve;
    state.modalResolve = null;
    state.modalOptions = null;
    state.modalBusy = false;
    if (immediate) {
      el.modalLayer.hidden = true;
    } else {
      setTimeout(function () { el.modalLayer.hidden = true; }, 260);
    }
    if (resolve) resolve(result || { confirmed: false });
  }

  function showModalError(message) {
    el.modalError.textContent = message;
    el.modalError.hidden = false;
  }

  async function handleModalConfirm() {
    if (!state.modalOptions || state.modalBusy) return;
    var options = state.modalOptions;
    var value = el.modalInput.value;

    if (options.requirePassword && !value) {
      showModalError("يرجى إدخال كلمة المرور للمتابعة.");
      el.modalInput.focus();
      return;
    }
    if (options.onConfirm) {
      state.modalBusy = true;
      el.modalConfirm.disabled = true;
      var previousLabel = el.modalConfirm.textContent;
      el.modalConfirm.textContent = "جارٍ التحقق…";
      try {
        var passed = await options.onConfirm(value);
        if (passed === false) return;
      } catch (error) {
        showModalError(error && error.message ? error.message : "تعذّر إتمام العملية. حاول مجدداً.");
        return;
      } finally {
        state.modalBusy = false;
        el.modalConfirm.disabled = false;
        el.modalConfirm.textContent = previousLabel;
      }
    }
    closeModal({ confirmed: true, value: value });
  }

  /* =========================================================
     Events
     ========================================================= */
  function bindAuthEvents() {
    $$(".auth-tab", el.authTabs).forEach(function (button) {
      button.addEventListener("click", function () { setAuthTab(button.getAttribute("data-auth-tab")); });
    });

    $$("[data-toggle-password]").forEach(function (button) {
      button.addEventListener("click", function () {
        var input = $(button.getAttribute("data-toggle-password"));
        if (!input) return;
        var visible = input.type === "text";
        input.type = visible ? "password" : "text";
        button.setAttribute("aria-label", visible ? "إظهار كلمة المرور" : "إخفاء كلمة المرور");
        button.innerHTML = '<svg class="icon"><use href="#' + (visible ? "i-eye" : "i-eye-off") + '"></use></svg>';
      });
    });

    el.loginForm.addEventListener("submit", handleLogin);
    el.registerForm.addEventListener("submit", handleRegister);
    el.registerPassword.addEventListener("input", updateStrength);
    el.forgotBtn.addEventListener("click", showForgotModal);

    [el.loginEmail, el.loginPassword].forEach(function (input) {
      input.addEventListener("input", function () {
        markInvalid(input, false);
        clearMessage(el.loginMessage);
      });
    });
    [el.registerName, el.registerEmail, el.registerPassword].forEach(function (input) {
      input.addEventListener("input", function () {
        markInvalid(input, false);
        clearMessage(el.registerMessage);
      });
    });
  }

  function bindAppEvents() {
    el.themeToggle.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      setTheme(next, true);
    });

    el.userMenuBtn.addEventListener("click", function (event) {
      event.stopPropagation();
      toggleUserMenu();
    });
    el.logoutBtn.addEventListener("click", handleLogout);
    el.deleteAccountBtn.addEventListener("click", handleDeleteAccount);
    el.exportBtn.addEventListener("click", function () { closeUserMenu(); exportNotes(); });
    el.securityBtn.addEventListener("click", function () { closeUserMenu(); showSecurityModal(); });
    el.sideSecurityBtn.addEventListener("click", showSecurityModal);

    document.addEventListener("click", function (event) {
      if (!el.userMenu.contains(event.target)) closeUserMenu();
    });

    el.sidebarToggle.addEventListener("click", function () {
      if (el.sidebar.classList.contains("is-open")) closeSidebar(); else openSidebar();
    });
    el.sidebarBackdrop.addEventListener("click", closeSidebar);

    $$(".nav-item", el.sidebar).forEach(function (button) {
      button.addEventListener("click", function () {
        state.filter = button.getAttribute("data-filter");
        state.tag = null;
        state.query = "";
        el.searchInput.value = "";
        el.searchClear.hidden = true;
        el.mainArea.scrollTop = 0;
        closeSidebar();
        renderAll();
      });
    });

    el.sidebarTags.addEventListener("click", function (event) {
      var button = event.target.closest("[data-tag]");
      if (!button) return;
      state.tag = button.getAttribute("data-tag");
      state.filter = "all";
      state.query = "";
      el.searchInput.value = "";
      el.searchClear.hidden = true;
      el.mainArea.scrollTop = 0;
      closeSidebar();
      renderAll();
    });

    var searchTimer = null;
    el.searchInput.addEventListener("input", function () {
      var value = el.searchInput.value;
      el.searchClear.hidden = !value;
      if (searchTimer) clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.query = value.trim();
        el.mainArea.scrollTop = 0;
        renderAll();
      }, 110);
    });
    el.searchInput.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        el.searchInput.value = "";
        el.searchClear.hidden = true;
        state.query = "";
        renderAll();
        el.searchInput.blur();
      }
    });
    el.searchClear.addEventListener("click", function () {
      el.searchInput.value = "";
      el.searchClear.hidden = true;
      state.query = "";
      renderAll();
      el.searchInput.focus();
    });

    el.sortSelect.addEventListener("change", function () {
      state.sort = el.sortSelect.value;
      renderAll();
    });

    el.activeFilterChip.addEventListener("click", clearFilters);

    [el.newNoteBtn, el.fabNew].forEach(function (button) {
      button.addEventListener("click", createNote);
    });

    el.emptyCta.addEventListener("click", function () {
      if (state.emptyMode === "search" || state.emptyMode === "tag") clearFilters();
      else if (state.emptyMode === "trash") { state.filter = "all"; renderAll(); }
      else createNote();
    });

    el.notesGrid.addEventListener("click", function (event) {
      var action = event.target.closest("[data-action]");
      var card = event.target.closest(".note-card");
      if (!card) return;
      var id = card.getAttribute("data-id");
      if (action) {
        event.stopPropagation();
        var name = action.getAttribute("data-action");
        if (name === "pin") togglePinned(id);
        if (name === "favorite") toggleFavorite(id);
        if (name === "trash") moveToTrash(id);
        if (name === "restore") restoreNote(id);
        if (name === "delete-forever") confirmDeleteForever(id);
        return;
      }
      var note = state.notes.find(function (item) { return item.id === id; });
      if (!note) return;
      if (note.deletedAt) previewTrashNote(id); else openEditor(id, false);
    });

    el.notesGrid.addEventListener("keydown", function (event) {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("button")) return;
      var card = event.target.closest(".note-card");
      if (!card) return;
      event.preventDefault();
      var note = state.notes.find(function (item) { return item.id === card.getAttribute("data-id"); });
      if (!note) return;
      if (note.deletedAt) previewTrashNote(note.id); else openEditor(note.id, false);
    });

    bindEditorEvents();
    bindModalEvents();

    document.addEventListener("keydown", function (event) {
      var isTyping = /^(INPUT|TEXTAREA|SELECT)$/.test((event.target.tagName || "").toUpperCase()) || event.target.isContentEditable;

      if (event.key === "Escape") {
        if (!el.modalLayer.hidden) { closeModal({ confirmed: false }); return; }
        if (!el.editorLayer.hidden) { closeEditor(); return; }
        if (el.sidebar.classList.contains("is-open")) { closeSidebar(); return; }
        closeUserMenu();
      }

      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k" && state.user) {
        event.preventDefault();
        el.searchInput.focus();
        el.searchInput.select();
      }

      if ((event.ctrlKey || event.metaKey) && event.altKey && event.key.toLowerCase() === "n" && state.user) {
        event.preventDefault();
        createNote();
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s" && state.user && !el.editorLayer.hidden) {
        event.preventDefault();
        flushSave();
      }

      if (event.key === "Escape" && !el.editorLayer.hidden && !isTyping) closeEditor();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && state.user && state.saveTimer) {
        clearTimeout(state.saveTimer);
        state.saveTimer = null;
        saveNotes();
      }
    });

    window.addEventListener("beforeunload", function () {
      if (state.user && state.saveTimer) {
        clearTimeout(state.saveTimer);
        saveNotes();
      }
    });
  }

  function bindEditorEvents() {
    el.closeEditorBtn.addEventListener("click", function () { closeEditor(); });
    $$("[data-close-editor]", el.editorLayer).forEach(function (node) {
      node.addEventListener("click", function () { closeEditor(); });
    });

    el.noteTitle.addEventListener("input", handleEditorInput);
    el.noteBody.addEventListener("input", handleEditorInput);

    el.noteBody.addEventListener("paste", function (event) {
      event.preventDefault();
      var text = (event.clipboardData || window.clipboardData).getData("text/plain");
      if (!text) return;
      document.execCommand("insertText", false, text);
    });
    el.noteBody.addEventListener("drop", function (event) {
      event.preventDefault();
      var text = (event.dataTransfer || {}).getData ? event.dataTransfer.getData("text/plain") : "";
      if (text) {
        el.noteBody.focus();
        document.execCommand("insertText", false, text);
      }
    });

    el.editorToolbar.addEventListener("mousedown", function (event) {
      if (event.target.closest(".tool-btn")) event.preventDefault();
    });
    el.editorToolbar.addEventListener("click", function (event) {
      var button = event.target.closest(".tool-btn");
      if (!button) return;
      var command = button.getAttribute("data-cmd");
      var value = button.getAttribute("data-value") || null;
      el.noteBody.focus();
      try {
        document.execCommand("styleWithCSS", false, false);
        if (command === "formatBlock" && value) {
          var currentBlock = String(document.queryCommandValue("formatBlock") || "").toLowerCase().replace(/[<>]/g, "");
          document.execCommand("formatBlock", false, currentBlock === value ? "p" : value);
        } else {
          document.execCommand(command, false, null);
        }
      } catch (error) { /* execCommand is best-effort */ }
      handleEditorInput();
      updateToolbarState();
    });
    document.addEventListener("selectionchange", function () {
      if (!el.editorLayer.hidden && document.activeElement === el.noteBody) updateToolbarState();
    });

    el.editorPinBtn.addEventListener("click", function () {
      if (state.editorId) togglePinned(state.editorId);
    });
    el.editorFavBtn.addEventListener("click", function () {
      if (state.editorId) toggleFavorite(state.editorId);
    });
    el.editorDeleteBtn.addEventListener("click", function () {
      if (!state.editorId) return;
      var note = currentNote();
      if (!note) return;
      var emptyNew = state.editorIsNew && !String(note.title || "").trim() && !htmlToText(note.content);
      if (emptyNew) { closeEditor(); return; }
      confirmTrashFromEditor(state.editorId);
    });

    el.noteTags.addEventListener("click", function (event) {
      var button = event.target.closest("[data-remove-tag]");
      if (!button) return;
      removeTag(button.getAttribute("data-remove-tag"));
    });

    el.tagInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === "," || event.key === "،") {
        event.preventDefault();
        addTag(el.tagInput.value);
      } else if (event.key === "Backspace" && !el.tagInput.value) {
        var note = currentNote();
        if (note && note.tags.length) removeTag(note.tags[note.tags.length - 1]);
      }
    });
    el.tagInput.addEventListener("blur", function () {
      if (el.tagInput.value.trim()) addTag(el.tagInput.value);
    });

    el.editorColors.addEventListener("click", function (event) {
      var button = event.target.closest("[data-color]");
      if (!button) return;
      var note = currentNote();
      if (!note) return;
      note.color = button.getAttribute("data-color");
      note.updatedAt = now();
      renderEditorButtons(note);
      scheduleSave();
    });
  }

  function updateToolbarState() {
    $$(".tool-btn", el.editorToolbar).forEach(function (button) {
      var command = button.getAttribute("data-cmd");
      var value = button.getAttribute("data-value");
      var active = false;
      try {
        if (command === "formatBlock" && value) {
          var block = document.queryCommandValue("formatBlock");
          active = block && block.toLowerCase().replace(/[<>]/g, "") === value;
        } else if (command !== "removeFormat") {
          active = document.queryCommandState(command);
        }
      } catch (error) { active = false; }
      button.classList.toggle("is-active", !!active);
    });
  }

  function bindModalEvents() {
    el.modalCancel.addEventListener("click", function () { closeModal({ confirmed: false }); });
    el.modalConfirm.addEventListener("click", handleModalConfirm);
    $$("[data-close-modal]", el.modalLayer).forEach(function (node) {
      node.addEventListener("click", function () { closeModal({ confirmed: false }); });
    });
    el.modalInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") { event.preventDefault(); handleModalConfirm(); }
    });
    el.modalInput.addEventListener("input", function () {
      el.modalError.hidden = true;
      el.modalError.textContent = "";
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  async function boot() {
    state.storageAvailable = checkStorage();
    setTheme(currentTheme(), false);

    if (!state.storageAvailable) {
      el.bootOverlay.classList.add("is-ready");
      if (el.loginMessage) {
        showMessage(el.loginMessage, "متصفحك يمنع التخزين المحلي، ولن يتمكن الموقع من حفظ الملاحظات. فعّل التخزين ثم أعد التحميل.");
      }
      state.booted = true;
      return;
    }

    var session = readSession();
    if (session && session.userId && session.key) {
      try {
        var user = findUserById(session.userId);
        if (!user) throw new Error("SESSION_USER_MISSING");
        var notes = [];
        var blob = readEncryptedNotes(user.id);
        if (blob) notes = await C.decryptJSON(blob, session.key);
        if (!Array.isArray(notes)) notes = [];
        state.booted = true;
        enterApp(user, session.key, notes, true);
      } catch (error) {
        console.warn("Session restore failed", error);
        clearSession();
        el.authView.hidden = false;
        el.bootOverlay.classList.add("is-ready");
        state.booted = true;
        var lastEmail = "";
        try { lastEmail = localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch (e) { /* noop */ }
        if (lastEmail) el.loginEmail.value = lastEmail;
      }
    } else {
      el.authView.hidden = false;
      el.bootOverlay.classList.add("is-ready");
      state.booted = true;
      var savedEmail = "";
      try { savedEmail = localStorage.getItem(LAST_EMAIL_KEY) || ""; } catch (e) { /* noop */ }
      if (savedEmail) el.loginEmail.value = savedEmail;
    }
  }

  bindAuthEvents();
  bindAppEvents();
  setAuthTab("login");
  el.year.textContent = String(new Date().getFullYear());
  boot();
})();
