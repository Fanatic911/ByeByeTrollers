const BROWSER_SIGNATURES = [
  { name: "Edge", pattern: /Edg\// },
  { name: "Opera", pattern: /OPR\/|Opera\// },
  { name: "Vivaldi", pattern: /Vivaldi\// },
  { name: "Samsung Internet", pattern: /SamsungBrowser\// },
  { name: "UC Browser", pattern: /UCBrowser\// },
  { name: "Brave", pattern: /Brave\// },
  { name: "Discord", pattern: /Discord/i },
  { name: "Firefox", pattern: /Firefox\// },
  { name: "Chrome", pattern: /Chrome\// },
  { name: "Safari", pattern: /Version\/.*Safari\// },
];

function detectBrowser(userAgent) {
  if (!userAgent || typeof userAgent !== "string") return "Unknown";
  for (const { name, pattern } of BROWSER_SIGNATURES) {
    if (pattern.test(userAgent)) return name;
  }
  return "Unknown";
}

function isBrowserAuthorised(userAgent, authorisedList) {
  const detected = detectBrowser(userAgent);
  if (detected === "Unknown") return false;
  const normalizedList = (authorisedList || []).map((b) => b.toLowerCase());
  return normalizedList.includes(detected.toLowerCase());
}

module.exports = { detectBrowser, isBrowserAuthorised, BROWSER_SIGNATURES };
