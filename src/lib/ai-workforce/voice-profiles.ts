import type { AgentId } from "@/lib/ai-workforce/types";

export interface VoiceLike {
  name: string;
  lang: string;
}

export interface AgentVoiceSpec {
  agentId: AgentId;
  gender: "male" | "female";
  preferredPatterns: RegExp[];
  rate: number;
  pitch: number;
}

export const AGENT_VOICE_SPECS: Record<AgentId, AgentVoiceSpec> = {
  operations_manager: {
    agentId: "operations_manager",
    gender: "male",
    preferredPatterns: [
      /abeo/i,
      /guy.*natural/i,
      /ryan.*natural/i,
      /google uk english male/i,
      /daniel/i,
      /george/i,
      /mark/i,
      /david/i,
    ],
    rate: 0.96,
    pitch: 0.95,
  },
  sales_ai: {
    agentId: "sales_ai",
    gender: "female",
    preferredPatterns: [
      /ezinne/i,
      /aria.*natural/i,
      /sonia.*natural/i,
      /google uk english female/i,
      /ava.*natural/i,
      /emma.*natural/i,
      /samantha/i,
      /zira/i,
    ],
    rate: 1.03,
    pitch: 1.05,
  },
  customer_support_ai: {
    agentId: "customer_support_ai",
    gender: "female",
    preferredPatterns: [
      /jenny.*natural/i,
      /libby.*natural/i,
      /michelle.*natural/i,
      /clara.*natural/i,
      /google us english/i,
      /hazel/i,
      /susan/i,
      /victoria/i,
      /zira/i,
    ],
    rate: 0.96,
    pitch: 1.01,
  },
  research_ai: {
    agentId: "research_ai",
    gender: "male",
    preferredPatterns: [
      /andrew.*natural/i,
      /brian.*natural/i,
      /christopher.*natural/i,
      /liam.*natural/i,
      /arthur/i,
      /oliver/i,
      /alex/i,
      /mark/i,
    ],
    rate: 1.01,
    pitch: 1.0,
  },
  engineering_ai: {
    agentId: "engineering_ai",
    gender: "male",
    preferredPatterns: [
      /steffan.*natural/i,
      /eric.*natural/i,
      /roger.*natural/i,
      /mitchell.*natural/i,
      /william.*natural/i,
      /rishi/i,
      /fred/i,
      /david/i,
    ],
    rate: 0.97,
    pitch: 0.92,
  },
};

const FEMALE_HINT_RX =
  /(female|ezinne|aria|jenny|sonia|libby|michelle|clara|ava|emma|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|kate)/i;
const MALE_HINT_RX =
  /(male|abeo|guy|ryan|andrew|brian|christopher|steffan|eric|roger|mitchell|william|liam|daniel|george|david|mark|arthur|oliver|alex|rishi)/i;
const NATURAL_HINT_RX = /(natural|neural|online|google)/i;

function scoreVoiceQuality(voice: VoiceLike): number {
  let score = 0;
  if (/^en[-_]?ng/i.test(voice.lang)) score += 40;
  else if (/^en/i.test(voice.lang)) score += 20;
  if (NATURAL_HINT_RX.test(voice.name)) score += 30;
  return score;
}

function matchesGender(voice: VoiceLike, gender: "male" | "female"): boolean {
  if (gender === "female") return FEMALE_HINT_RX.test(voice.name);
  return MALE_HINT_RX.test(voice.name) && !FEMALE_HINT_RX.test(voice.name);
}

/**
 * Assigns a distinct voice to each of the 5 AI agents whenever enough voices exist,
 * prioritizing Natural/Neural/Online voices and matching each agent's gender & cadence.
 */
export function assignAgentVoices<T extends VoiceLike>(
  voices: T[]
): Record<AgentId, { voice: T | null; rate: number; pitch: number }> {
  const englishVoices = voices
    .filter((v) => /^en/i.test(v.lang))
    .sort((a, b) => scoreVoiceQuality(b) - scoreVoiceQuality(a));
  const pool = englishVoices.length > 0 ? englishVoices : voices;

  const used = new Set<string>();
  const order: AgentId[] = [
    "operations_manager",
    "sales_ai",
    "customer_support_ai",
    "research_ai",
    "engineering_ai",
  ];

  const result = {} as Record<AgentId, { voice: T | null; rate: number; pitch: number }>;

  for (const agentId of order) {
    const spec = AGENT_VOICE_SPECS[agentId];
    let picked: T | undefined;

    // 1. Try preferred persona patterns that haven't been used yet
    for (const rx of spec.preferredPatterns) {
      picked = pool.find((v) => !used.has(v.name) && rx.test(v.name));
      if (picked) break;
    }

    // 2. Otherwise pick highest-quality unused voice matching gender
    if (!picked) {
      picked = pool.find((v) => !used.has(v.name) && matchesGender(v, spec.gender));
    }

    // 3. Otherwise any unused voice from pool
    if (!picked) {
      picked = pool.find((v) => !used.has(v.name));
    }

    // 4. Only if fewer than 5 voices exist on the device, allow reuse with distinct pitch/rate
    if (!picked && pool.length > 0) {
      picked =
        pool.find((v) => matchesGender(v, spec.gender)) ||
        pool[order.indexOf(agentId) % pool.length];
    }

    if (picked) used.add(picked.name);
    result[agentId] = {
      voice: picked ?? null,
      rate: spec.rate,
      pitch: spec.pitch,
    };
  }

  return result;
}

export function stripAudioTags(text: string): string {
  return text
    .replace(/\[[^\]]{1,30}\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanTextForSpeech(
  text: string,
  options: { keepAudioTags?: boolean } = {}
): string {
  const base = text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, " ");
  const cleaned = options.keepAudioTags ? base : stripAudioTags(base);
  return cleaned.replace(/\s+/g, " ").trim();
}

/**
 * 5 distinct conversational ElevenLabs voices (3 male, 2 female), with optional env overrides.
 */
export const ELEVENLABS_VOICE_IDS: Record<AgentId, string> = {
  operations_manager: "s3TPKV1kjDlVtZbl4Ksh", // Adam (calm, conversational male)
  sales_ai: "YWmufCrZ2agGoSoVL8je", // Valory B (warm, conversational female)
  customer_support_ai: "b5RPB35vTODb3BEmR3Fc", // Serein (gentle, empathetic female)
  research_ai: "9uJH3xa9p4Sl1DQFGvnJ", // Mark2 (crisp, conversational male)
  engineering_ai: "hIreuBly94QFepU63yel", // Scotty (steady, conversational male)
};

/**
 * Built-in ElevenLabs pre-made voices that work on the Free tier via API
 * if a Voice Library voice returns 402 payment_required.
 */
export const FREE_TIER_ELEVENLABS_VOICE_IDS: Record<AgentId, string> = {
  operations_manager: "CwhRBWXzGAHq8TQ4Fs17", // Roger - Laid-Back, Casual, Resonant (Male)
  sales_ai: "EXAVITQu4vr4xnSDxMaL", // Sarah - Mature, Reassuring, Confident (Female)
  customer_support_ai: "FGY2WhTYpPnrIDTdsKH5", // Laura - Enthusiast, Quirky Attitude (Female)
  research_ai: "IKne3meq5aSn9XLyUdCD", // Charlie - Deep, Confident, Energetic (Male)
  engineering_ai: "JBFqnCBsd6RMkjVDRZzb", // George - Warm, Captivating Storyteller (Male)
};

export function getElevenLabsVoiceId(
  agentId: AgentId,
  env: Record<string, string | undefined> = process.env
): string {
  const overrideMap: Record<AgentId, string | undefined> = {
    operations_manager: env.ELEVENLABS_VOICE_SADIQ,
    sales_ai: env.ELEVENLABS_VOICE_AMINA,
    customer_support_ai: env.ELEVENLABS_VOICE_ZAINAB,
    research_ai: env.ELEVENLABS_VOICE_FARUK,
    engineering_ai: env.ELEVENLABS_VOICE_BASHIR,
  };
  return overrideMap[agentId]?.trim() || ELEVENLABS_VOICE_IDS[agentId] || ELEVENLABS_VOICE_IDS.operations_manager;
}

/**
 * 5 distinct Deepgram Aura-2 conversational voices (3 male, 2 female).
 */
export const DEEPGRAM_AURA2_VOICES: Record<AgentId, string> = {
  operations_manager: "aura-2-apollo-en", // Sadiq (confident, calm male)
  sales_ai: "aura-2-thalia-en", // Amina (warm, engaging female)
  customer_support_ai: "aura-2-helena-en", // Zainab (gentle, empathetic female)
  research_ai: "aura-2-orion-en", // Faruk (crisp, analytical male)
  engineering_ai: "aura-2-arcas-en", // Bashir (steady, thoughtful male)
};

export function getDeepgramVoiceModel(
  agentId: AgentId,
  env: Record<string, string | undefined> = process.env
): string {
  const overrideMap: Record<AgentId, string | undefined> = {
    operations_manager: env.DEEPGRAM_VOICE_SADIQ,
    sales_ai: env.DEEPGRAM_VOICE_AMINA,
    customer_support_ai: env.DEEPGRAM_VOICE_ZAINAB,
    research_ai: env.DEEPGRAM_VOICE_FARUK,
    engineering_ai: env.DEEPGRAM_VOICE_BASHIR,
  };
  return overrideMap[agentId]?.trim() || DEEPGRAM_AURA2_VOICES[agentId] || DEEPGRAM_AURA2_VOICES.operations_manager;
}
