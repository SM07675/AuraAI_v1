export function cleanTextForSpeech(text: string): string {
  if (!text) return "";
  let t = text;

  // 1. Remove code blocks and inline code
  t = t.replace(/```[\s\S]*?```/g, " ");
  t = t.replace(/`([^`]+)`/g, "$1");

  // 2. Convert markdown links [Text](url) -> Text
  t = t.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

  // 3. Strip headers (#, ##, ###)
  t = t.replace(/#{1,6}\s*/g, "");

  // 4. Strip bold / italics / strikethrough (**text**, *text*, ~~text~~, __text__)
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1");
  t = t.replace(/\*([^*]+)\*/g, "$1");
  t = t.replace(/__([^_]+)__/g, "$1");
  t = t.replace(/_([^_]+)_/g, "$1");
  t = t.replace(/~~([^~]+)~~/g, "$1");

  // 5. Clean list bullets & numbering
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+\.\s+/gm, "");

  // 6. Clean blockquotes
  t = t.replace(/^\s*>\s*/gm, "");

  // 7. Strip raw URLs
  t = t.replace(/https?:\/\/\S+/g, "");

  // 8. Strip emojis & symbols (Unicode emoji ranges)
  t = t.replace(
    /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2702}-\u{27B0}\u{24C2}-\u{1F251}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
    " "
  );

  // 9. Clean repeated punctuation & normalize Devanagari stops
  t = t.replace(/\.{4,}/g, "...");
  t = t.replace(/[-—_]{2,}/g, ", ");
  t = t.replace(/\s+([,.!?;:।|])/g, "$1");

  // 10. Normalize spaces
  return t.replace(/\s+/g, " ").trim();
}

/**
 * Fast Devanagari-to-Latin phonetic converter for acoustic/text echo matching.
 * Converts "नमस्ते, मैं समझ सकती हूँ" -> "namaste main samajh sakti hoon"
 */
export function devanagariToLatin(text: string): string {
  if (!text) return "";

  // Common high-frequency keywords
  const directMap: Record<string, string> = {
    "नमस्ते": "namaste",
    "नमस्कार": "namaskar",
    "धन्यवाद": "dhanyawad",
    "शुक्रिया": "shukriya",
    "हाँ": "haan",
    "हां": "haan",
    "नहीं": "nahi",
    "ना": "na",
    "अच्छा": "achha",
    "ठीक": "theek",
    "है": "hai",
    "हैं": "hain",
    "हूँ": "hoon",
    "था": "tha",
    "थी": "thi",
    "थे": "the",
    "क्या": "kya",
    "क्यों": "kyun",
    "कैसे": "kaise",
    "कैसा": "kaisa",
    "कैसी": "kaisi",
    "आप": "aap",
    "तुम": "tum",
    "मैं": "main",
    "मुझे": "mujhe",
    "मेरा": "mera",
    "मेरी": "meri",
    "मेरे": "mere",
    "डॉक्टर": "doctor",
    "साहब": "sahab",
    "साहिबा": "sahiba",
    "सुनो": "suno",
    "सुनिए": "suniye",
    "रुको": "ruko",
    "रुकिए": "rukiye",
    "बताओ": "batao",
    "बताइए": "bataiye",
    "समझ": "samajh",
    "सकती": "sakti",
    "सकता": "sakta",
    "सकते": "sakte",
    "काउंसलिंग": "counseling",
    "योजना": "yojana",
    "तनाव": "tanav",
    "परेशान": "pareshan",
    "परेशानी": "pareshani",
    "महसूस": "mehsoos",
    "कर": "kar",
    "रहे": "rahe",
    "रही": "rahi",
    "रहा": "raha",
  };

  let t = text;
  for (const [hi, lat] of Object.entries(directMap)) {
    t = t.replaceAll(hi, " " + lat + " ");
  }

  const consonants: Record<string, string> = {
    "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
    "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
    "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
    "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
    "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
    "य": "y", "र": "r", "ल": "l", "व": "v", "श": "sh",
    "ष": "sh", "स": "s", "ह": "h", "क्ष": "ksh", "त्र": "tr", "ज्ञ": "gy"
  };

  const vowels: Record<string, string> = {
    "अ": "a", "आ": "aa", "इ": "i", "ई": "ee", "उ": "u", "ऊ": "oo",
    "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "अं": "an", "अः": "ah"
  };

  const matras: Record<string, string> = {
    "ा": "aa", "ि": "i", "ी": "ee", "ु": "u", "ू": "oo",
    "ृ": "ri", "े": "e", "ै": "ai", "ो": "o", "ौ": "au",
    "ं": "n", "ँ": "n", "ः": "h", "्": ""
  };

  let out = "";
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (matras[ch] !== undefined) {
      out += matras[ch];
    } else if (vowels[ch] !== undefined) {
      out += vowels[ch];
    } else if (consonants[ch] !== undefined) {
      const next = t[i + 1];
      if (next && (matras[next] !== undefined || next === "्")) {
        out += consonants[ch];
      } else {
        out += consonants[ch] + "a";
      }
    } else {
      out += ch;
    }
  }

  return out.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
