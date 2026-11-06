export const doctor = {
  name: 'Dr. Sachin Naik',
  specialty: 'Nephrology',
  location: 'Mumbai',
};

export const patients = [
  { id: 'rahul-sharma', name: 'Rahul Sharma', age: 52, gender: 'Male', tags: ['CKD Stage 3', 'Hypertension'], lastVisit: '2 days ago', status: 'Follow-up', phone: '+91 98765 43210' },
  { id: 'priya-patil', name: 'Priya Patil', age: 46, gender: 'Female', tags: ['Diabetes', 'CKD'], lastVisit: '5 days ago', status: 'Active', phone: '+91 98221 51234' },
  { id: 'suresh-kale', name: 'Suresh Kale', age: 62, gender: 'Male', tags: ['Hypertension'], lastVisit: '1 week ago', status: 'Active', phone: '+91 98901 20117' },
  { id: 'meera-joshi', name: 'Meera Joshi', age: 58, gender: 'Female', tags: ['CKD Stage 4'], lastVisit: '10 days ago', status: 'Follow-up', phone: '+91 97654 48122' },
  { id: 'vikram-shah', name: 'Vikram Shah', age: 60, gender: 'Male', tags: ['Post Transplant'], lastVisit: '2 weeks ago', status: 'Active', phone: '+91 98192 30054' },
  { id: 'anita-deshmukh', name: 'Anita Deshmukh', age: 48, gender: 'Female', tags: ['Diabetes', 'CKD'], lastVisit: '18 days ago', status: 'Follow-up', phone: '+91 99205 81122' },
];

export const workspaceRows = [
  { time: '09:00', patient: 'Rahul Sharma', place: 'Kharghar Clinic', kind: 'OPD', status: 'Checked in', note: 'Follow-up • CKD' },
  { time: '09:40', patient: 'Priya Patil', place: 'Kharghar Clinic', kind: 'OPD', status: 'Waiting', note: 'New consultation' },
  { time: '11:30', patient: 'Meera Joshi', place: 'Apollo Hospital', kind: 'IPD', status: 'Round due', note: 'Ward 5B • Bed 12' },
  { time: '13:15', patient: 'Suresh Kale', place: 'Fortis Hospital', kind: 'IPD', status: 'Note pending', note: 'Ward 2A • Bed 04' },
  { time: '16:00', patient: 'Vikram Shah', place: 'Kharghar Clinic', kind: 'OPD', status: 'Scheduled', note: 'Post-transplant review' },
];

export const reports = [
  { name: 'Serum Creatinine', value: '2.1 mg/dL', previous: '1.6 mg/dL', trend: 'Higher', state: 'High' },
  { name: 'eGFR', value: '38 mL/min/1.73m²', previous: '52', trend: 'Lower', state: 'Low' },
  { name: 'Potassium', value: '5.2 mmol/L', previous: '4.8', trend: 'Higher', state: 'Review' },
  { name: 'Hemoglobin', value: '10.8 g/dL', previous: '11.2', trend: 'Lower', state: 'Review' },
  { name: 'Urine ACR', value: '820 mg/g', previous: '760', trend: 'Higher', state: 'High' },
];

export const educationModules = [
  { title: 'Understanding CKD', language: 'English • Hindi • Marathi', type: 'Video + Article', duration: '8 min' },
  { title: 'Low Salt Diet', language: 'English • Hindi • Marathi', type: 'Video', duration: '5 min' },
  { title: 'Dialysis Preparation', language: 'English • Hindi', type: 'Module', duration: '12 min' },
  { title: 'Post-Transplant Medicines', language: 'English • Hindi', type: 'Article + Quiz', duration: '7 min' },
];

export const updates = [
  { level: 'urgent', title: 'Critical potassium result', patient: 'Rahul Sharma', detail: 'K 6.3 mmol/L • uploaded 18 min ago', state: 'Doctor review required' },
  { level: 'review', title: 'Medicine question needs review', patient: 'Meera Joshi', detail: '“Can I stop the evening tablet?”', state: 'AI draft ready' },
  { level: 'review', title: 'New report uploaded', patient: 'Suresh Kale', detail: 'Renal function panel from hospital', state: 'Verify values' },
  { level: 'handled', title: 'Education question handled', patient: 'Priya Patil', detail: 'Approved CKD education source used', state: 'AI handled' },
];
