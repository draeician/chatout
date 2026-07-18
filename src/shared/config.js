(() => {
  const config = {
    ALLOWED_EXTERNAL_DOMAINS: Object.freeze([
      "chatgpt.com",
      "claude.ai",
      "gemini.google.com",
      "gemini.googleusercontent.com",
      "google.com",
      "poe.com",
      "grok.com",
      "aistudio.google.com",
      "chat.deepseek.com",
      "tongyi.aliyun.com",
      "yuanbao.tencent.com",
      "www.google.com",
      "www.google.com.hk",
      "www.google.co.uk"
    ]),
    ENDPOINTS: Object.freeze({
      WEB_APP_HOME: "https://example.com",
      HELP_CENTER: "https://example.com/help",
      DOCS: "https://example.com/docs",
      PDF_EXPORT_API: ""
    }),
    FEATURE_FLAGS: Object.freeze({
      EXTERNAL_HELP_LINKS_ENABLED: false,
      REMOTE_PDF_EXPORT_ENABLED: false,
      WEB_COOKIE_BRIDGE_ENABLED: false
    }),
    FALLBACK_TEXT: Object.freeze({
      EXTERNAL_LINKS_DISABLED: "External links are disabled in this build.",
      PDF_EXPORT_DISABLED: "PDF export is unavailable in this build."
    }),
    COOKIE: Object.freeze({
      PRIMARY_DOMAIN: "example.com",
      DOMAINS: Object.freeze(["example.com", "www.example.com"])
    })
  };

  globalThis.__AI_EXPORTER_CONFIG__ = Object.freeze(config);
})();
