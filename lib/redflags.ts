/**
 * Emergency screening for patient free text.
 *
 * This runs BEFORE the model is ever called. A safety rail that depends on the
 * model behaving is not a safety rail.
 *
 * Deliberately pattern-based, not AI: it has to be deterministic, auditable and
 * testable. It never answers, diagnoses or advises — a hit only means "show the
 * emergency message and tell the doctor now".
 *
 * Tuning bias: false positives are cheap (the doctor sees one extra flagged
 * question); false negatives are not. When in doubt, add the pattern.
 *
 * Ported from the prototype, where every pattern below is covered by a test in
 * English, Devanagari and romanised Hindi — because patients type all three.
 */

type Rule = { label: string; pattern: RegExp };

export const RED_FLAGS: Rule[] = [
  { label: 'chest pain', pattern: /chest\s*pain|seene?\s*(me[ni]?n?)?\s*dard|छाती\s*में\s*दर्द|सीने\s*में\s*दर्द/i },
  { label: 'breathlessness', pattern: /breathless|short(ness)?\s*of\s*breath|can(no|')?t\s*breath|difficulty\s*breathing|saans\s*(nahi|nhi|phool|ukhad)|दम\s*घुट|साँस|सांस\s*(लेने|फूल)/i },
  { label: 'anuria', pattern: /no\s*urine|not\s*passing\s*urine|urine\s*(has\s*)?stopped|peshab\s*(nahi|nhi|band)|पेशाब\s*(नहीं|बंद)/i },
  // "blood in my vomit" — the possessive in the middle is why this is a loose
  // \bblood\s+(in|from)\b rather than a tidy enumerated list.
  { label: 'bleeding', pattern: /bleeding|blood\s+(in|from)\b|vomit(ing)?\s*blood|blood\s+vomit|black\s*stool|khoon|खून|रक्तस्राव/i },
  { label: 'collapse', pattern: /faint(ed|ing)?|unconscious|collaps|black(ed)?\s*out|behosh|बेहोश|चक्कर\s*आकर\s*गिर/i },
  { label: 'fistula failure', pattern: /(no|lost|stopped|absent)\s*(thrill|buzz|vibration)|fistula\s*(not|nahi|stopped|blocked|cold|hard)|फिस्टुला\s*(काम\s*नहीं|बंद)/i },
  // Matches "cloudy bag" and "the bag fluid is cloudy" alike — word order varies,
  // and on peritoneal dialysis a patient saying "cloudy" at all is worth a look.
  { label: 'pd peritonitis', pattern: /\bcloudy\b|dhundhla|धुंधला/i },
  { label: 'seizure', pattern: /seizure|convulsion|fits?\b|jhatke|दौरा|मिर्गी|झटके/i },
  { label: 'altered sensorium', pattern: /confus(ed|ion)|drowsy|not\s*responding|very\s*sleepy|behoshi|अचेत|सुस्त/i },
  { label: 'severe swelling', pattern: /(sudden|severe)\s*swell|swelling\s*(all\s*over|of\s*face)|whole\s*body\s*swollen|poore\s*sharir\s*sujan|पूरे\s*शरीर\s*में\s*सूजन/i },
  { label: 'hyperkalaemia', pattern: /palpitation|heart\s*racing|irregular\s*heart|muscle\s*weakness\s*(sudden|severe)|dil\s*tez|धड़कन\s*तेज/i },
  { label: 'hypertensive crisis', pattern: /bp\s*(is\s*)?(2\d\d|1[89]\d)\s*\/?|blood\s*pressure\s*(2\d\d|1[89]\d)/i },
  { label: 'severe pain', pattern: /(severe|unbearable|very\s*bad)\s*(pain|abdominal\s*pain|stomach\s*pain)|pet\s*me[ni]?n?\s*tez\s*dard|पेट\s*में\s*तेज\s*दर्द/i },
  { label: 'self harm', pattern: /kill\s*myself|suicid|end\s*my\s*life|jaan\s*de\s*d|आत्महत्या/i },
];

/**
 * Questions the doctor is always told about, whatever the bot replied.
 *
 * These do NOT block the model — the patient still gets the explanation from
 * their material, which for "should I stop my BP tablet?" is genuinely useful.
 * But a patient asking that at all is a patient at risk of stopping it, and
 * that is worth the doctor knowing regardless of how good the answer was.
 *
 * This exists because the model, told to escalate such questions, reasonably
 * preferred to reassure from the material instead. Rather than fight that, the
 * answer stands and the filing is made deterministic here.
 */
const MED = '(tablet|tablets|medicine|medication|drug|pill|dose|dosage|dawa|goli|दवा|दवाई|गोली|खुराक)';

export const ALWAYS_TELL_DOCTOR: Rule[] = [
  { label: 'stopping a medicine', pattern: new RegExp(
      `(stop|stopping|discontinue|band\\s+kar|बंद|छोड़|रोक)\\W+(\\w+\\W+){0,3}${MED}` +
      `|${MED}\\W+(\\w+\\W+){0,3}(stop|band\\s+kar|बंद|छोड़|रोक)`, 'i') },
  { label: 'asking about a dose', pattern: new RegExp(
      `\\b(dose|dosage)\\b|how\\s+many\\s+${MED}|खुराक|कितनी\\s+गोली`, 'i') },
  { label: 'starting a medicine', pattern: new RegExp(
      `(should\\s+i\\s+start|can\\s+i\\s+start|शुरू\\s+कर)\\W+(\\w+\\W+){0,3}${MED}`, 'i') },
];

const normalise = (text: string) => text.trim().replace(/\s+/g, ' ');

/** Labels of every emergency pattern present. Empty means clear. */
export function screen(text: string): string[] {
  if (!text) return [];
  const t = normalise(text);
  return RED_FLAGS.filter((r) => r.pattern.test(t)).map((r) => r.label);
}

export const isRedFlag = (text: string) => screen(text).length > 0;

/** Topics the doctor must hear about, answered or not. */
export function needsDoctor(text: string): string[] {
  if (!text) return [];
  const t = normalise(text);
  return ALWAYS_TELL_DOCTOR.filter((r) => r.pattern.test(t)).map((r) => r.label);
}

/**
 * Shown verbatim when a flag fires. Gives no clinical advice — it only routes
 * the person to care.
 */
const EMERGENCY: Record<string, string> = {
  en: 'This does not sound like something to wait on. This service cannot help in an '
    + 'emergency. Please contact your doctor right now, or go to the nearest emergency '
    + 'department. Your doctor has been notified.',
  hi: 'यह इंतज़ार करने वाली बात नहीं लगती। यह सेवा आपातकाल में मदद नहीं कर सकती। '
    + 'कृपया अभी अपने डॉक्टर से संपर्क करें, या नज़दीकी अस्पताल के आपातकालीन विभाग में जाएँ। '
    + 'आपके डॉक्टर को सूचित कर दिया गया है।',
};

export const emergencyMessage = (language: string) => EMERGENCY[language] ?? EMERGENCY.en;
