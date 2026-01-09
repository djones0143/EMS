// Kentucky EMS Medication Reference Database
// Based on Kentucky Statewide EMS Protocols

const medications = [
    {
        id: 1,
        name: "Epinephrine 1:1,000",
        genericName: "epinephrine",
        category: "cardiac",
        indications: [
            "Anaphylaxis",
            "Severe asthma/bronchospasm unresponsive to beta agonists",
            "Cardiac arrest (1:10,000 concentration)"
        ],
        contraindications: [
            "None in life-threatening situations",
            "Use with caution in elderly patients",
            "Use with caution in patients with known coronary artery disease"
        ],
        dose: {
            adult: "0.3-0.5 mg IM (1:1,000) for anaphylaxis; 1 mg IV/IO (1:10,000) every 3-5 minutes for cardiac arrest",
            pediatric: "0.01 mg/kg IM (1:1,000) max 0.3 mg for anaphylaxis; 0.01 mg/kg IV/IO (1:10,000) every 3-5 minutes for cardiac arrest"
        },
        route: "IM (1:1,000), IV/IO (1:10,000)",
        onset: "3-5 minutes IM, immediate IV",
        precautions: [
            "May cause tachycardia, hypertension, anxiety",
            "Correct concentration must be used for route of administration",
            "Monitor vital signs closely"
        ]
    },
    {
        id: 2,
        name: "Nitroglycerin",
        genericName: "nitroglycerin",
        category: "cardiac",
        indications: [
            "Chest pain of suspected cardiac origin",
            "Acute pulmonary edema",
            "Hypertensive emergency"
        ],
        contraindications: [
            "Systolic BP < 90 mmHg",
            "Heart rate < 50 or > 100 bpm",
            "Right ventricular infarction",
            "Use of phosphodiesterase inhibitors (Viagra, Cialis) within 24-48 hours",
            "Severe aortic stenosis",
            "Increased intracranial pressure"
        ],
        dose: {
            adult: "0.4 mg sublingual, may repeat every 3-5 minutes up to 3 doses. Spray: 1 spray (0.4 mg) sublingual",
            pediatric: "Not typically administered in pediatric patients"
        },
        route: "Sublingual tablet or spray",
        onset: "1-3 minutes",
        precautions: [
            "Monitor blood pressure before each dose",
            "May cause headache, dizziness, hypotension",
            "Patient should be sitting or lying down"
        ]
    },
    {
        id: 3,
        name: "Aspirin",
        genericName: "acetylsalicylic acid",
        category: "cardiac",
        indications: [
            "Chest pain of suspected cardiac origin",
            "Acute coronary syndrome"
        ],
        contraindications: [
            "Known allergy to aspirin",
            "Active GI bleeding",
            "Bleeding disorders",
            "Recent stroke (within 3 hours of potential fibrinolytic therapy)"
        ],
        dose: {
            adult: "160-325 mg PO (chewed)",
            pediatric: "Not typically administered for cardiac indications in pediatric patients"
        },
        route: "Oral (chewed)",
        onset: "15-30 minutes",
        precautions: [
            "Have patient chew tablet for faster absorption",
            "Assess for aspirin allergy before administration"
        ]
    },
    {
        id: 4,
        name: "Albuterol",
        genericName: "albuterol sulfate",
        category: "respiratory",
        indications: [
            "Bronchospasm",
            "Asthma",
            "COPD exacerbation",
            "Anaphylaxis with respiratory involvement"
        ],
        contraindications: [
            "Known hypersensitivity (rare)"
        ],
        dose: {
            adult: "2.5 mg in 3 mL NS via nebulizer, may repeat every 5-20 minutes",
            pediatric: "2.5 mg (< 20 kg) or 5 mg (> 20 kg) in 3 mL NS via nebulizer"
        },
        route: "Inhalation via nebulizer or MDI",
        onset: "5-15 minutes",
        precautions: [
            "May cause tachycardia, tremors, anxiety",
            "Use with caution in cardiac patients",
            "Monitor oxygen saturation and vital signs"
        ]
    },
    {
        id: 5,
        name: "Narcan (Naloxone)",
        genericName: "naloxone hydrochloride",
        category: "antidotes",
        indications: [
            "Opioid overdose",
            "Respiratory depression secondary to opioid use",
            "Altered mental status with suspected opioid involvement"
        ],
        contraindications: [
            "None in emergency situations"
        ],
        dose: {
            adult: "0.4-2 mg IN/IM/IV, may repeat every 2-3 minutes. Intranasal: 2-4 mg (1-2 sprays)",
            pediatric: "0.1 mg/kg IV/IO/IM up to 2 mg, or 2 mg IN if < 1 year or weight unknown"
        },
        route: "IV, IM, Intranasal, IO",
        onset: "2-5 minutes (IV), 5-10 minutes (IN/IM)",
        precautions: [
            "May precipitate withdrawal in opioid-dependent patients",
            "Short duration of action - patient may re-sedate",
            "Repeat doses may be necessary",
            "Be prepared for aggressive behavior upon awakening"
        ]
    },
    {
        id: 6,
        name: "Dextrose 10% (D10)",
        genericName: "dextrose",
        category: "other",
        indications: [
            "Hypoglycemia (blood glucose < 60 mg/dL with symptoms)"
        ],
        contraindications: [
            "Intracranial hemorrhage (relative)",
            "Stroke (relative - check glucose first)"
        ],
        dose: {
            adult: "D10: 10-25 grams (100-250 mL) IV. D50: 12.5-25 grams (25-50 mL) IV",
            pediatric: "D10: 0.5-1 g/kg (5-10 mL/kg) IV - preferred concentration for pediatrics"
        },
        route: "IV, IO",
        onset: "1-2 minutes",
        precautions: [
            "Confirm hypoglycemia before administration",
            "Extravasation can cause tissue damage",
            "May worsen cerebral edema",
            "Recheck glucose after administration"
        ]
    },
    {
        id: 7,
        name: "Fentanyl",
        genericName: "fentanyl citrate",
        category: "analgesia",
        indications: [
            "Moderate to severe pain",
            "Traumatic injuries",
            "Burns",
            "Renal colic"
        ],
        contraindications: [
            "Hypersensitivity to fentanyl",
            "Respiratory depression",
            "Hypotension",
            "Altered mental status of unknown origin"
        ],
        dose: {
            adult: "1 mcg/kg IV/IO/IM (max 100 mcg initial dose), may repeat 0.5 mcg/kg every 5-10 minutes. Intranasal: 1-2 mcg/kg (max 100 mcg per nostril)",
            pediatric: "1 mcg/kg IV/IO/IM/IN (max 50 mcg), may repeat with medical control"
        },
        route: "IV, IO, IM, Intranasal",
        onset: "2-3 minutes (IV), 5-10 minutes (IM/IN)",
        precautions: [
            "Respiratory depression possible",
            "Monitor vital signs continuously",
            "Have naloxone available",
            "Reduce dose in elderly patients",
            "May cause chest wall rigidity in high doses"
        ]
    },
    {
        id: 8,
        name: "Morphine Sulfate",
        genericName: "morphine",
        category: "analgesia",
        indications: [
            "Moderate to severe pain",
            "Acute coronary syndrome",
            "Acute pulmonary edema"
        ],
        contraindications: [
            "Hypersensitivity",
            "Respiratory depression",
            "Hypotension (SBP < 90 mmHg)",
            "Altered mental status",
            "Head injury with decreased LOC"
        ],
        dose: {
            adult: "2-4 mg IV slow push, may repeat every 5-10 minutes (max 10 mg)",
            pediatric: "0.1 mg/kg IV/IO (max 5 mg), may repeat with medical control"
        },
        route: "IV, IO, IM",
        onset: "5-10 minutes (IV)",
        precautions: [
            "May cause respiratory depression, hypotension, nausea",
            "Monitor vital signs closely",
            "Have naloxone available",
            "Use with caution in elderly"
        ]
    },
    {
        id: 9,
        name: "Diphenhydramine (Benadryl)",
        genericName: "diphenhydramine",
        category: "other",
        indications: [
            "Allergic reactions",
            "Anaphylaxis (adjunct to epinephrine)",
            "Dystonic reactions"
        ],
        contraindications: [
            "Hypersensitivity",
            "Use with caution in elderly patients"
        ],
        dose: {
            adult: "25-50 mg IV/IM",
            pediatric: "1 mg/kg IV/IM (max 50 mg)"
        },
        route: "IV, IM, PO",
        onset: "15-30 minutes",
        precautions: [
            "May cause drowsiness",
            "Anticholinergic effects",
            "Not a substitute for epinephrine in anaphylaxis"
        ]
    },
    {
        id: 10,
        name: "Ondansetron (Zofran)",
        genericName: "ondansetron",
        category: "gi",
        indications: [
            "Nausea and vomiting",
            "Motion sickness"
        ],
        contraindications: [
            "Known hypersensitivity",
            "Prolonged QT interval (relative)"
        ],
        dose: {
            adult: "4 mg IV/IO/ODT, may repeat once after 10 minutes (max 8 mg)",
            pediatric: "0.1 mg/kg IV/IO/ODT (max 4 mg)"
        },
        route: "IV, IO, ODT (orally dissolving tablet)",
        onset: "5-10 minutes (IV), 30 minutes (ODT)",
        precautions: [
            "May prolong QT interval",
            "Headache, dizziness common",
            "Does not treat underlying cause"
        ]
    },
    {
        id: 11,
        name: "Adenosine",
        genericName: "adenosine",
        category: "cardiac",
        indications: [
            "Stable supraventricular tachycardia (SVT)",
            "Narrow complex regular tachycardia"
        ],
        contraindications: [
            "Second or third-degree AV block",
            "Sick sinus syndrome",
            "Known hypersensitivity",
            "Asthma (relative)",
            "Irregular rhythms"
        ],
        dose: {
            adult: "6 mg rapid IV push followed by 20 mL saline flush, may give 12 mg if no response after 1-2 minutes, may repeat 12 mg once",
            pediatric: "0.1 mg/kg rapid IV push (max 6 mg), may give 0.2 mg/kg (max 12 mg) if no response"
        },
        route: "IV (must be rapid push via large proximal vein)",
        onset: "Seconds",
        precautions: [
            "Very short half-life (< 10 seconds)",
            "Must be given rapid IV push with immediate flush",
            "Patient will experience brief chest discomfort, flushing, dyspnea",
            "Continuous cardiac monitoring required",
            "May cause brief asystole"
        ]
    },
    {
        id: 12,
        name: "Amiodarone",
        genericName: "amiodarone",
        category: "cardiac",
        indications: [
            "Ventricular fibrillation/pulseless VT (cardiac arrest)",
            "Stable ventricular tachycardia",
            "Atrial fibrillation with rapid ventricular response"
        ],
        contraindications: [
            "Cardiogenic shock",
            "Severe sinus node dysfunction",
            "Second or third-degree AV block (without pacemaker)",
            "Known hypersensitivity"
        ],
        dose: {
            adult: "Cardiac arrest: 300 mg IV/IO push, may give second dose of 150 mg. Stable VT: 150 mg IV over 10 minutes, may repeat once",
            pediatric: "5 mg/kg IV/IO push for cardiac arrest, may repeat up to 15 mg/kg"
        },
        route: "IV, IO",
        onset: "Minutes to hours",
        precautions: [
            "May cause hypotension - slow infusion rate",
            "Bradycardia possible",
            "Prolongs QT interval",
            "Incompatible with saline - flush line before/after"
        ]
    },
    {
        id: 13,
        name: "Atropine",
        genericName: "atropine sulfate",
        category: "cardiac",
        indications: [
            "Symptomatic bradycardia",
            "Organophosphate poisoning",
            "Nerve agent exposure"
        ],
        contraindications: [
            "None in emergency situations",
            "Use with caution in acute coronary syndrome"
        ],
        dose: {
            adult: "0.5 mg IV/IO every 3-5 minutes (max 3 mg). Organophosphate: 2-5 mg IV/IM, may repeat",
            pediatric: "0.02 mg/kg IV/IO (minimum 0.1 mg, max single dose 0.5 mg), may repeat. Organophosphate: 0.05 mg/kg IV/IM"
        },
        route: "IV, IO, IM",
        onset: "1-2 minutes",
        precautions: [
            "May cause tachycardia, urinary retention, mydriasis",
            "Ineffective in heart transplant patients",
            "Doses < 0.5 mg may cause paradoxical bradycardia"
        ]
    },
    {
        id: 14,
        name: "Calcium Chloride",
        genericName: "calcium chloride",
        category: "cardiac",
        indications: [
            "Hyperkalemia",
            "Hypocalcemia",
            "Calcium channel blocker overdose",
            "Hypermagnesemia"
        ],
        contraindications: [
            "Hypercalcemia",
            "Ventricular fibrillation",
            "Digoxin toxicity"
        ],
        dose: {
            adult: "500 mg - 1 gram (5-10 mL of 10%) IV slow push over 5-10 minutes",
            pediatric: "20 mg/kg (0.2 mL/kg of 10%) IV slow push (max 1 gram)"
        },
        route: "IV (central line preferred), IO",
        onset: "1-5 minutes",
        precautions: [
            "Severe tissue necrosis if extravasated",
            "Give slowly to avoid bradycardia or cardiac arrest",
            "Use central line if available",
            "Do not mix with sodium bicarbonate"
        ]
    },
    {
        id: 15,
        name: "Dopamine",
        genericName: "dopamine",
        category: "cardiac",
        indications: [
            "Hypotension",
            "Bradycardia unresponsive to atropine",
            "Cardiogenic shock"
        ],
        contraindications: [
            "Pheochromocytoma",
            "Uncorrected tachyarrhythmias",
            "Ventricular fibrillation"
        ],
        dose: {
            adult: "2-20 mcg/kg/min IV infusion, titrate to effect",
            pediatric: "2-20 mcg/kg/min IV infusion, titrate to effect"
        },
        route: "IV infusion",
        onset: "2-5 minutes",
        precautions: [
            "Extravasation causes tissue necrosis",
            "May cause tachycardia, arrhythmias",
            "Requires continuous monitoring",
            "Correct hypovolemia first"
        ]
    },
    {
        id: 16,
        name: "Midazolam (Versed)",
        genericName: "midazolam",
        category: "sedation",
        indications: [
            "Seizures",
            "Procedural sedation",
            "Agitation",
            "Facilitated intubation"
        ],
        contraindications: [
            "Known hypersensitivity",
            "Acute narrow-angle glaucoma",
            "Shock or coma"
        ],
        dose: {
            adult: "Seizures: 5-10 mg IM/IN, 2-5 mg IV. Sedation: 1-2 mg IV titrated",
            pediatric: "Seizures: 0.1-0.2 mg/kg IM/IN/IV (max 10 mg). Sedation: 0.05-0.1 mg/kg IV"
        },
        route: "IV, IO, IM, Intranasal",
        onset: "1-3 minutes (IV), 5-10 minutes (IM/IN)",
        precautions: [
            "Respiratory depression possible",
            "May cause hypotension",
            "Have airway equipment ready",
            "Paradoxical agitation may occur",
            "Reduce dose in elderly"
        ]
    },
    {
        id: 17,
        name: "Ketamine",
        genericName: "ketamine",
        category: "sedation",
        indications: [
            "Procedural sedation",
            "Pain management",
            "Facilitated intubation",
            "Severe agitation"
        ],
        contraindications: [
            "Severe hypertension",
            "Known hypersensitivity",
            "Increased intracranial pressure (relative)",
            "Globe injury (relative)"
        ],
        dose: {
            adult: "Sedation: 1-2 mg/kg IV, 4-5 mg/kg IM. Analgesia: 0.1-0.3 mg/kg IV",
            pediatric: "Sedation: 1-2 mg/kg IV, 4-5 mg/kg IM. Analgesia: 0.25-0.5 mg/kg IV"
        },
        route: "IV, IO, IM",
        onset: "1-2 minutes (IV), 5-10 minutes (IM)",
        precautions: [
            "May cause emergence reactions",
            "Increased salivation - consider antisialagogue",
            "Maintain airway patency",
            "Monitor blood pressure",
            "Do not use alone for intubation"
        ]
    },
    {
        id: 18,
        name: "Magnesium Sulfate",
        genericName: "magnesium sulfate",
        category: "other",
        indications: [
            "Torsades de pointes",
            "Severe asthma unresponsive to other therapies",
            "Eclampsia/pre-eclampsia",
            "Hypomagnesemia"
        ],
        contraindications: [
            "Heart block",
            "Renal failure (relative)",
            "Hypotension"
        ],
        dose: {
            adult: "Cardiac arrest/Torsades: 1-2 grams IV/IO over 5-20 minutes. Asthma: 2 grams IV over 20 minutes. Eclampsia: 4 grams IV/IO over 10-15 minutes",
            pediatric: "25-50 mg/kg IV/IO (max 2 grams) over 10-20 minutes"
        },
        route: "IV, IO",
        onset: "Immediate (IV)",
        precautions: [
            "May cause hypotension, bradycardia, respiratory depression",
            "Give slowly",
            "Monitor vital signs closely",
            "Have calcium available"
        ]
    },
    {
        id: 19,
        name: "Sodium Bicarbonate",
        genericName: "sodium bicarbonate",
        category: "other",
        indications: [
            "Tricyclic antidepressant overdose",
            "Hyperkalemia",
            "Metabolic acidosis (specific situations)",
            "Known pre-existing acidosis in cardiac arrest"
        ],
        contraindications: [
            "Metabolic or respiratory alkalosis",
            "Hypocalcemia",
            "Hypernatremia"
        ],
        dose: {
            adult: "1 mEq/kg IV push, may repeat 0.5 mEq/kg every 10 minutes",
            pediatric: "1 mEq/kg IV/IO push, may repeat 0.5 mEq/kg"
        },
        route: "IV, IO",
        onset: "Minutes",
        precautions: [
            "May cause hypernatremia, hyperosmolality",
            "Incompatible with many drugs",
            "Flush line before and after",
            "May worsen intracellular acidosis"
        ]
    },
    {
        id: 20,
        name: "Activated Charcoal",
        genericName: "activated charcoal",
        category: "antidotes",
        indications: [
            "Oral poisoning/overdose (within 1-2 hours of ingestion)"
        ],
        contraindications: [
            "Altered mental status without protected airway",
            "Caustic ingestion",
            "Hydrocarbon ingestion",
            "GI obstruction or perforation"
        ],
        dose: {
            adult: "25-50 grams PO or NG",
            pediatric: "1 gram/kg PO or NG (max 50 grams)"
        },
        route: "PO or NG tube",
        onset: "Immediate binding in GI tract",
        precautions: [
            "Risk of aspiration",
            "Contraindicated for alcohols, acids, alkalis, iron, lithium",
            "May cause constipation, black stools",
            "Have suction ready"
        ]
    },
    {
        id: 21,
        name: "Glucagon",
        genericName: "glucagon",
        category: "other",
        indications: [
            "Hypoglycemia when IV access unavailable",
            "Beta-blocker overdose",
            "Calcium channel blocker overdose"
        ],
        contraindications: [
            "Pheochromocytoma",
            "Known hypersensitivity"
        ],
        dose: {
            adult: "Hypoglycemia: 1 mg IM/IN. Beta-blocker/CCB overdose: 2-5 mg IV bolus, then infusion",
            pediatric: "0.5 mg (< 20 kg) or 1 mg (> 20 kg) IM"
        },
        route: "IM, IV, Intranasal",
        onset: "5-20 minutes (IM)",
        precautions: [
            "May cause nausea and vomiting",
            "Patient must have adequate glycogen stores",
            "Give carbohydrates once patient awake",
            "Ineffective in chronic malnutrition or alcohol abuse"
        ]
    },
    {
        id: 22,
        name: "Normal Saline (0.9% NaCl)",
        genericName: "sodium chloride",
        category: "other",
        indications: [
            "Hypovolemia",
            "Dehydration",
            "Hypotension",
            "IV medication administration",
            "Burns"
        ],
        contraindications: [
            "Fluid overload",
            "Congestive heart failure (relative)",
            "Pulmonary edema"
        ],
        dose: {
            adult: "Bolus: 250-500 mL IV, repeat as needed. Maintenance: 50-125 mL/hr",
            pediatric: "20 mL/kg IV/IO bolus, may repeat"
        },
        route: "IV, IO",
        onset: "Immediate",
        precautions: [
            "Monitor for fluid overload",
            "May worsen CHF or pulmonary edema",
            "Large volumes may cause hyperchloremic acidosis",
            "Reassess frequently"
        ]
    },
    {
        id: 23,
        name: "Ipratropium Bromide (Atrovent)",
        genericName: "ipratropium",
        category: "respiratory",
        indications: [
            "Bronchospasm",
            "COPD exacerbation",
            "Asthma (adjunct to albuterol)"
        ],
        contraindications: [
            "Known hypersensitivity to atropine"
        ],
        dose: {
            adult: "0.5 mg (500 mcg) via nebulizer with albuterol",
            pediatric: "0.25-0.5 mg via nebulizer with albuterol"
        },
        route: "Inhalation via nebulizer",
        onset: "15-30 minutes",
        precautions: [
            "Often combined with albuterol",
            "Avoid eye contact",
            "Use with caution in narrow-angle glaucoma",
            "Minimal systemic effects"
        ]
    },
    {
        id: 24,
        name: "Tranexamic Acid (TXA)",
        genericName: "tranexamic acid",
        category: "other",
        indications: [
            "Hemorrhagic shock from trauma",
            "Significant bleeding (within 3 hours of injury)"
        ],
        contraindications: [
            "Known hypersensitivity",
            "Active thromboembolic disease (relative)",
            "Seizure disorder (relative)"
        ],
        dose: {
            adult: "1 gram IV over 10 minutes, followed by 1 gram IV over 8 hours",
            pediatric: "15 mg/kg IV over 10 minutes (max 1 gram)"
        },
        route: "IV",
        onset: "Minutes to hours",
        precautions: [
            "Most effective if given within 3 hours of injury",
            "May increase seizure risk",
            "Continue second dose at receiving facility",
            "Does not replace hemorrhage control"
        ]
    }
];

// Make medications available globally
window.medications = medications;
