/**
 * Test panels and what a report is expected to contain.
 *
 * Two things make extraction from Indian lab reports work at all:
 *
 * - **Aliases.** No two labs print an analyte the same way. "S. Creatinine",
 *   "Serum Creatinine", "CREATININE (SERUM)" and "Creat" are one thing. Knowing
 *   what to look for is most of the accuracy.
 * - **Expected units.** The same analyte arrives in different units by lab, so a
 *   value without its unit is meaningless and one with an unexpected unit is a
 *   conversion, not a reading.
 *
 * Two kinds of threshold, because they answer different questions. `normalLow`
 * and `normalHigh` are the reference range, for display. `criticalLow` and
 * `criticalHigh` mean this should reach the doctor today rather than at the next
 * visit.
 *
 * For creatinine and eGFR in a CKD patient, absolute thresholds are close to
 * useless — a creatinine of 3.0 is alarming in one patient and their baseline in
 * another. Those escalate on change from the patient's own previous value
 * instead, via `deltaPct`.
 *
 * CLINICAL REVIEW GATE: these are the usual adult values and have not been
 * reviewed by a nephrologist. They must be before any real report is judged
 * against them, and a clinic should be able to override them.
 */

export type Analyte = {
  key: string;
  name: string;
  hindiName?: string;
  unit: string;
  aliases: string[];
  /** Other units this can arrive in, and the factor to reach `unit`. */
  altUnits?: Record<string, number>;
  normalLow?: number;
  normalHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
  /** Escalate when it moves this much from the patient's own last value. */
  deltaPct?: number;
  note?: string;
};

const A = {
  creatinine: {
    key: 'creatinine', name: 'Creatinine', hindiName: 'क्रिएटिनिन', unit: 'mg/dL',
    aliases: ['s. creatinine', 'serum creatinine', 'creatinine serum', 'creat', 'sr. creatinine'],
    altUnits: { 'umol/L': 0.0113, 'µmol/L': 0.0113 },
    normalLow: 0.6, normalHigh: 1.3, deltaPct: 25,
    note: 'In CKD the baseline is the reference. A 25% rise is the signal, not an absolute number.',
  },
  egfr: {
    key: 'egfr', name: 'eGFR', hindiName: 'eGFR', unit: 'mL/min/1.73m2',
    aliases: ['egfr', 'e-gfr', 'estimated gfr', 'gfr estimated', 'ckd-epi'],
    normalLow: 90, deltaPct: 20,
    note: 'A fall of 20% or more between reports is worth seeing before the next visit.',
  },
  potassium: {
    key: 'potassium', name: 'Potassium', hindiName: 'पोटैशियम', unit: 'mmol/L',
    aliases: ['potassium', 's. potassium', 'serum potassium', 'k+', 'k +', 'serum k'],
    altUnits: { 'mEq/L': 1 },
    normalLow: 3.5, normalHigh: 5.1, criticalLow: 3.0, criticalHigh: 5.5,
    note: 'The one that kills quietly. Above 5.5 in CKD reaches the doctor the same day.',
  },
  sodium: {
    key: 'sodium', name: 'Sodium', hindiName: 'सोडियम', unit: 'mmol/L',
    aliases: ['sodium', 's. sodium', 'serum sodium', 'na+', 'na +'],
    altUnits: { 'mEq/L': 1 },
    normalLow: 135, normalHigh: 145, criticalLow: 125, criticalHigh: 155,
  },
  urea: {
    key: 'urea', name: 'Urea', hindiName: 'यूरिया', unit: 'mg/dL',
    aliases: ['urea', 'blood urea', 's. urea', 'bun', 'blood urea nitrogen'],
    normalLow: 15, normalHigh: 40,
  },
  calcium: {
    key: 'calcium', name: 'Calcium', hindiName: 'कैल्शियम', unit: 'mg/dL',
    aliases: ['calcium', 's. calcium', 'serum calcium', 'total calcium'],
    normalLow: 8.5, normalHigh: 10.5, criticalLow: 7.0, criticalHigh: 12.0,
  },
  phosphorus: {
    key: 'phosphorus', name: 'Phosphorus', hindiName: 'फ़ॉस्फ़ोरस', unit: 'mg/dL',
    aliases: ['phosphorus', 'phosphate', 's. phosphorus', 'inorganic phosphorus', 'po4'],
    normalLow: 2.5, normalHigh: 4.5, criticalHigh: 7.0,
  },
  albumin: {
    key: 'albumin', name: 'Albumin', hindiName: 'एल्ब्यूमिन', unit: 'g/dL',
    aliases: ['albumin', 's. albumin', 'serum albumin'],
    normalLow: 3.5, normalHigh: 5.2, criticalLow: 2.5,
  },
  bicarbonate: {
    key: 'bicarbonate', name: 'Bicarbonate', hindiName: 'बाइकार्बोनेट', unit: 'mmol/L',
    aliases: ['bicarbonate', 'hco3', 'co2', 'serum bicarbonate'],
    normalLow: 22, normalHigh: 29, criticalLow: 15,
  },
  haemoglobin: {
    key: 'haemoglobin', name: 'Haemoglobin', hindiName: 'हीमोग्लोबिन', unit: 'g/dL',
    aliases: ['haemoglobin', 'hemoglobin', 'hb', 'hgb'],
    normalLow: 11.0, normalHigh: 16.0, criticalLow: 7.0,
    note: 'Anaemia of CKD. Below 7 usually means transfusion is on the table.',
  },
  platelets: {
    key: 'platelets', name: 'Platelets', hindiName: 'प्लेटलेट्स', unit: '10^3/uL',
    aliases: ['platelet count', 'platelets', 'plt'],
    normalLow: 150, normalHigh: 410, criticalLow: 50,
  },
  tlc: {
    key: 'tlc', name: 'Total leucocyte count', hindiName: 'श्वेत रक्त कोशिकाएँ', unit: '10^3/uL',
    aliases: ['total leucocyte count', 'total leukocyte count', 'tlc', 'wbc', 'white blood cell'],
    normalLow: 4.0, normalHigh: 11.0, criticalLow: 2.0, criticalHigh: 20.0,
  },
  hba1c: {
    key: 'hba1c', name: 'HbA1c', hindiName: 'HbA1c', unit: '%',
    aliases: ['hba1c', 'hb a1c', 'glycated haemoglobin', 'glycosylated hemoglobin'],
    normalLow: 4.0, normalHigh: 5.6,
  },
  uacr: {
    key: 'uacr', name: 'Urine albumin-creatinine ratio', hindiName: 'यूरिन ACR', unit: 'mg/g',
    aliases: ['acr', 'albumin creatinine ratio', 'urine acr', 'uacr', 'microalbumin creatinine ratio'],
    normalHigh: 30,
    note: 'The earliest marker of kidney damage, and the one most often left off a KFT.',
  },
  ipth: {
    key: 'ipth', name: 'Parathyroid hormone (iPTH)', hindiName: 'PTH', unit: 'pg/mL',
    aliases: ['ipth', 'pth', 'parathyroid hormone', 'intact pth'],
    normalLow: 15, normalHigh: 65,
  },
} satisfies Record<string, Analyte>;

export type Panel = { key: string; name: string; aliases: string[]; analytes: Analyte[] };

export const PANELS: Record<string, Panel> = {
  kft: {
    key: 'kft', name: 'Kidney function test (KFT)',
    aliases: ['kft', 'rft', 'renal function test', 'kidney function'],
    analytes: [A.creatinine, A.egfr, A.urea, A.sodium, A.potassium, A.calcium,
               A.phosphorus, A.albumin, A.bicarbonate, A.uacr],
  },
  cbc: {
    key: 'cbc', name: 'Complete blood count (CBC)',
    aliases: ['cbc', 'complete blood count', 'haemogram', 'hemogram'],
    analytes: [A.haemoglobin, A.tlc, A.platelets],
  },
  electrolytes: {
    key: 'electrolytes', name: 'Serum electrolytes',
    aliases: ['electrolytes', 'serum electrolytes', 'na k cl'],
    analytes: [A.sodium, A.potassium, A.bicarbonate],
  },
  hba1c: {
    key: 'hba1c', name: 'HbA1c', aliases: ['hba1c', 'glycated haemoglobin'],
    analytes: [A.hba1c],
  },
  bone: {
    key: 'bone', name: 'CKD bone profile',
    aliases: ['bone profile', 'ckd mbd', 'mineral bone'],
    analytes: [A.calcium, A.phosphorus, A.ipth, A.albumin],
  },
};

export const ALL_ANALYTES: Record<string, Analyte> = Object.fromEntries(
  Object.values(PANELS).flatMap((p) => p.analytes.map((a) => [a.key, a])),
);

/** The analytes an extraction should look for, deduplicated across panels. */
export function analytesFor(panelKeys: string[]): Analyte[] {
  const seen = new Map<string, Analyte>();
  for (const key of panelKeys) {
    for (const analyte of PANELS[key]?.analytes ?? []) {
      if (!seen.has(analyte.key)) seen.set(analyte.key, analyte);
    }
  }
  return [...seen.values()];
}

/**
 * Convert into the analyte's canonical unit, or refuse.
 *
 * An unrecognised unit is never assumed to be the expected one — that assumption
 * is how a µmol/L creatinine becomes a catastrophic mg/dL reading.
 */
export function normalise(analyte: Analyte, value: number, unit?: string | null):
  { value: number; unit: string } | null {
  if (!unit) return { value, unit: analyte.unit };
  const given = unit.trim().toLowerCase();
  if (given === analyte.unit.toLowerCase()) return { value, unit: analyte.unit };
  for (const [alt, factor] of Object.entries(analyte.altUnits ?? {})) {
    if (given === alt.toLowerCase()) {
      return { value: Math.round(value * factor * 10000) / 10000, unit: analyte.unit };
    }
  }
  return null;
}

export type Flag = 'critical' | 'delta' | 'out_of_range' | null;

/** Why this value should reach the doctor, if it should. */
export function flagFor(analyte: Analyte, value: number, previous?: number | null): Flag {
  if (analyte.criticalLow != null && value <= analyte.criticalLow) return 'critical';
  if (analyte.criticalHigh != null && value >= analyte.criticalHigh) return 'critical';

  if (analyte.deltaPct != null && previous) {
    if (Math.abs(value - previous) / previous * 100 >= analyte.deltaPct) return 'delta';
  }

  if (analyte.normalLow != null && value < analyte.normalLow) return 'out_of_range';
  if (analyte.normalHigh != null && value > analyte.normalHigh) return 'out_of_range';
  return null;
}
