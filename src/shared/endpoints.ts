export const ALLOWED_EXTERNAL_DOMAINS = [
  "chatgpt.com",
  "claude.ai",
  "gemini.google.com",
  "poe.com",
  "grok.com",
  "aistudio.google.com",
  "chat.deepseek.com",
  "tongyi.aliyun.com",
  "yuanbao.tencent.com",
  "www.google.com",
  "www.google.com.hk",
  "www.google.co.uk"
] as const;

export const ENDPOINTS = {
  WEB_APP_HOME: "https://example.com",
  HELP_CENTER: "https://example.com/help",
  DOCS: "https://example.com/docs",
  PDF_EXPORT_API: ""
} as const;

export const FEATURE_FLAGS = {
  EXTERNAL_HELP_LINKS_ENABLED: false,
  REMOTE_PDF_EXPORT_ENABLED: false,
  WEB_COOKIE_BRIDGE_ENABLED: false
} as const;

export const FALLBACK_TEXT = {
  EXTERNAL_LINKS_DISABLED: "External links are disabled in this build.",
  PDF_EXPORT_DISABLED: "PDF export is unavailable in this build."
} as const;

export const COOKIE_CONFIG = {
  PRIMARY_DOMAIN: "example.com",
  DOMAINS: ["example.com", "www.example.com"] as const
} as const;
