import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Flame, Calendar, TrendingUp, CheckCircle2, Circle, Trophy, Target, BarChart3, ChevronLeft, ChevronRight, Sun, Moon, Coffee, BookOpen, Info } from 'lucide-react';

const STORAGE_KEY = 'cat2026-tracker-v2';
const EXAM_DATE = '2026-11-29';
const HARD_FLOOR = '2026-06-20'; // Nothing exists or is navigable before this date

// Storage abstraction: works in both Claude artifacts (window.storage) and standalone web (localStorage).
// Same async interface either way, so the rest of the code doesn't need to know which environment it's in.
const storage = {
  async get(key) {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.get === 'function') {
      return await window.storage.get(key);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(key);
      return value !== null ? { key, value } : null;
    }
    return null;
  },
  async set(key, value) {
    if (typeof window !== 'undefined' && window.storage && typeof window.storage.set === 'function') {
      return await window.storage.set(key, value);
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return { key, value };
    }
    return null;
  },
};

// Workout routines per day of week. Saturday is abs-only; Wednesday is rest (no gym at all).
// dow: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const WORKOUT_ROUTINES = {
  1: {
    name: '🟥 Push 1 — Chest Focused',
    exercises: [
      'Flat Bench Press — 4 × 6–8',
      'Incline Dumbbell Press — 3 × 8–10',
      'Pec Fly Machine — 3 × 10–12',
      'High-to-Low Cable Fly — 3 × 12–15',
      'Rope Pushdown — 3 × 10–12',
      'Overhead Rope Extension — 3 × 10–12',
      'Cable Lateral Raise — 3 × 12–15',
    ],
  },
  2: {
    name: '🔵 Pull 1 — Back Focused',
    exercises: [
      'Wide-Grip Lat Pulldown — 4 × 8–12',
      'Barbell Row — 4 × 8–10',
      'One-Arm Dumbbell Row — 3 × 10–12',
      'Rear Delt Machine — 3 × 12–15',
      'Preacher Curl — 3 × 10–12',
      'Hammer Curl — 3 × 10–12',
      'Back Extensions — 3 × 15',
    ],
  },
  4: {
    name: '🟩 Legs — Quads + Hamstrings',
    exercises: [
      'Barbell Squat — 4 × 6–8',
      'Romanian Deadlift (RDL) — 4 × 8–10',
      'Leg Press — 3 × 10–12',
      'Leg Extension — 3 × 12–15',
      'Leg Curl — 3 × 12–15',
      'Standing Calf Raises — 4 × 15–20',
      'Hip Abductor Machine — 3 × 15–20',
    ],
  },
  5: {
    name: '🟨 Push 2 — Shoulder Focused',
    exercises: [
      'Shoulder Press Machine — 4 × 8–10',
      'Cable Lateral Raise — 4 × 12–15',
      'Rear Delt Machine — 3 × 12–15',
      'Flat Bench Press — 3 × 8–10',
      'Incline Dumbbell Press — 3 × 10–12',
      'Assisted Dips — 3 × 8–12',
      'Rope Pushdown — 3 × 10–12',
    ],
  },
  6: {
    name: '🔥 Abs (Saturday only)',
    exercises: [
      'Hanging Leg Raises — 3 × 12–15',
      'Cable Crunches — 3 × 15–20',
      'Plank — 3 × 60 sec',
    ],
  },
  0: {
    name: '🟣 Pull 2 — Bicep Focused',
    exercises: [
      'Close-Grip Lat Pulldown — 4 × 8–12',
      'Smith Machine Row — 3 × 8–10',
      'Rear Delt Machine — 3 × 12–15',
      'Preacher Hammer Curl — 3 × 10–12',
      'Incline Dumbbell Curl — 3 × 10–12',
      'Hammer Curl — 3 × 10–12',
      'Back Extensions — 3 × 15',
    ],
  },
};

const PROGRESSION_RULE = 'When you hit the top of the rep range on ALL sets: add 2.5 kg (upper body) or 5 kg (lower body) next week.';

// ═══════════════════════════════════════════════════════
// TIMETABLE LOGIC — derives "what should today look like"
// from your actual CAT 2026 plan (phases, mocks, rest days)
// ═══════════════════════════════════════════════════════

function toDate(s) { return new Date(s + 'T00:00:00'); }
function toStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function dayOfWeek(dateStr) { return toDate(dateStr).getDay(); } // 0=Sun, 6=Sat
function daysBetween(a, b) { return Math.round((toDate(b) - toDate(a)) / 86400000); }

const PLAN_START = '2026-06-21'; // fixed anchor for phase/topic rotation math — never changes

const PHASE_BOUNDS = {
  1: { end: '2026-07-18', name: 'Foundation', label: 'Arithmetic + RC Basics + DILR PYQs' },
  2: { end: '2026-08-22', name: 'Deep Practice', label: 'Algebra + Geometry' },
  3: { end: '2026-09-19', name: 'Syllabus Completion', label: 'Modern Maths + First Mock' },
  4: { end: '2026-11-14', name: 'Mock Intensive', label: '2 Mocks/Week (Sun + Wed) — 16 Mocks' },
  5: { end: '2026-11-29', name: 'Final Taper', label: 'Strategy Lock + 2-Week Rest' },
};

function getPhase(dateStr) {
  for (const p of [1, 2, 3, 4, 5]) {
    if (dateStr <= PHASE_BOUNDS[p].end) return p;
  }
  return 5;
}

const ARITHMETIC_TOPICS = ['Percentages + Profit/Loss', 'Ratio + Averages + Mixtures', 'TSD: Trains/Boats/Speed', 'Time & Work + SI/CI'];
const ALGEBRA_GEO_TOPICS = ['Quadratics + Polynomials', 'Inequalities + Logarithms', 'Surds/Indices + Functions', 'Triangles + Circles (draw everything)', 'Mensuration + Coordinate Geometry'];
const MODERN_TOPICS = ['Number System: Remainders/Factorials', 'P&C (logic-based)', 'Probability + Sequences + Set Theory'];

const DILR_P1 = ['Seating Arrangements (PYQ, no timer)', 'Scheduling + Matching (PYQ, no timer)', 'DI Tables + Bar Graphs (PYQ, no timer)', 'Games/Tournaments + Venn (PYQ, no timer)'];
const DILR_P2 = ['Caselets (PYQ, no timer)', 'Binary Logic + Truth/Lie (PYQ, no timer)', 'Quant-based LR (PYQ, no timer)', 'Data Arrangement + Spider Charts', 'Full PYQ sweep — fill gaps'];
const DILR_P3 = ['PYQ sets, no timer', 'PYQ + Spider Charts', 'First timed sections (40 min)'];

function weekIndexInPhase(dateStr, phase) {
  const phaseStartMap = { 1: PLAN_START, 2: '2026-07-19', 3: '2026-08-23', 4: '2026-09-20', 5: '2026-11-15' };
  return Math.max(0, Math.floor(daysBetween(phaseStartMap[phase], dateStr) / 7));
}

function getQuantTopic(dateStr, phase) {
  if (phase === 1) return ARITHMETIC_TOPICS[weekIndexInPhase(dateStr, 1) % ARITHMETIC_TOPICS.length];
  if (phase === 2) return ALGEBRA_GEO_TOPICS[weekIndexInPhase(dateStr, 2) % ALGEBRA_GEO_TOPICS.length];
  if (phase === 3) return MODERN_TOPICS[weekIndexInPhase(dateStr, 3) % MODERN_TOPICS.length];
  if (phase === 4) return 'Error-log driven: top 3 weak chapters';
  return 'Personal formula sheet review only';
}

function getDilrFocus(dateStr, phase) {
  if (phase === 1) return DILR_P1[weekIndexInPhase(dateStr, 1) % DILR_P1.length];
  if (phase === 2) return DILR_P2[weekIndexInPhase(dateStr, 2) % DILR_P2.length];
  if (phase === 3) return DILR_P3[weekIndexInPhase(dateStr, 3) % DILR_P3.length];
  if (phase === 4) return 'Weakest set type — timed 20 min/set';
  return 'Light PYQ review, confidence sets only';
}

// Block-level metadata: how many weeks does THIS topic block span, which week of it is "today",
// and what's the overall date range of the block. This is the "Arithmetic = 4 weeks" context.
const QUANT_BLOCKS = {
  1: { name: 'Arithmetic', topics: ARITHMETIC_TOPICS, phase: 1 },
  2: { name: 'Algebra + Geometry', topics: ALGEBRA_GEO_TOPICS, phase: 2 },
  3: { name: 'Modern Maths', topics: MODERN_TOPICS, phase: 3 },
};
const DILR_BLOCKS = {
  1: { name: 'PYQ Foundation Sets', topics: DILR_P1, phase: 1 },
  2: { name: 'PYQ Deep Practice', topics: DILR_P2, phase: 2 },
  3: { name: 'PYQ + Timed Transition', topics: DILR_P3, phase: 3 },
};

function getBlockInfo(dateStr, phase, blockMap) {
  const block = blockMap[phase];
  if (!block) return null; // Phase 4/5 don't have a fixed topic block
  const phaseStartMap = { 1: PLAN_START, 2: '2026-07-19', 3: '2026-08-23' };
  const blockStart = phaseStartMap[phase];
  const blockEndDate = PHASE_BOUNDS[phase].end;
  const totalWeeks = block.topics.length;
  const weekInBlock = Math.min(weekIndexInPhase(dateStr, phase), totalWeeks - 1) + 1; // 1-indexed, clamped
  // Date range for THIS week within the block
  const wkStart = new Date(toDate(blockStart).getTime() + (weekInBlock - 1) * 7 * 86400000);
  const wkEnd = new Date(wkStart.getTime() + 6 * 86400000);
  return {
    blockName: block.name,
    weekInBlock,
    totalWeeks,
    blockStartLabel: formatDateShort(blockStart),
    blockEndLabel: formatDateShort(blockEndDate),
    thisWeekStartLabel: formatDateShort(toStr(wkStart)),
    thisWeekEndLabel: formatDateShort(toStr(wkEnd)),
  };
}

function getQuantBlockInfo(dateStr, phase) { return getBlockInfo(dateStr, phase, QUANT_BLOCKS); }
function getDilrBlockInfo(dateStr, phase) { return getBlockInfo(dateStr, phase, DILR_BLOCKS); }

// Mock calendar: Phase 4 (Sep 20 - Nov 14), alternates Sunday / Wednesday — 16 mocks total
function isMockDay(dateStr) {
  if (dateStr < '2026-09-20' || dateStr > '2026-11-14') return false;
  const dow = dayOfWeek(dateStr);
  return dow === 0 || dow === 3; // Sun=0, Wed=3
}

function isSaturdayOff(dateStr) {
  return dayOfWeek(dateStr) === 6;
}

function isGymDay(dateStr) {
  const dow = dayOfWeek(dateStr);
  return [0, 1, 2, 4, 5].includes(dow) === false ? false : [1, 2, 4, 5, 0].includes(dow);
  // Mon=1,Tue=2,Thu=4,Fri=5,Sun=0 -> gym. Wed=3,Sat=6 -> no gym
}

function getDayType(dateStr) {
  const dow = dayOfWeek(dateStr);
  if (dow === 6) return 'saturday-light'; // gym-only (abs), no studying
  if (dow === 0) return 'sunday';
  if (dow === 3) return 'wednesday';
  return 'weekday'; // Mon Tue Thu Fri
}

// Build the actual task list for a given date based on the timetable
function getTasksForDate(dateStr) {
  if (dateStr > EXAM_DATE) return [];
  const phase = getPhase(dateStr);
  const dayType = getDayType(dateStr);
  const mock = isMockDay(dateStr);
  const quantTopic = getQuantTopic(dateStr, phase);
  const dilrFocus = getDilrFocus(dateStr, phase);
  const quantBlock = getQuantBlockInfo(dateStr, phase);
  const dilrBlock = getDilrBlockInfo(dateStr, phase);

  // Build a "X of Y weeks" context string for use in task info text
  const quantBlockLine = quantBlock
    ? `${quantBlock.blockName} block: ${quantBlock.totalWeeks} weeks total (${quantBlock.blockStartLabel} – ${quantBlock.blockEndLabel}). This is week ${quantBlock.weekInBlock} of ${quantBlock.totalWeeks} (${quantBlock.thisWeekStartLabel} – ${quantBlock.thisWeekEndLabel}).`
    : '';
  const dilrBlockLine = dilrBlock
    ? `${dilrBlock.blockName}: ${dilrBlock.totalWeeks} weeks total (${dilrBlock.blockStartLabel} – ${dilrBlock.blockEndLabel}). This is week ${dilrBlock.weekInBlock} of ${dilrBlock.totalWeeks} (${dilrBlock.thisWeekStartLabel} – ${dilrBlock.thisWeekEndLabel}).`
    : '';

  if (dayType === 'saturday-light') {
    const routine = WORKOUT_ROUTINES[6];
    const routineLines = routine.exercises.map((e, i) => `${i + 1}. ${e}`).join('\n');
    return [
      { id: 'gym', label: routine.name, icon: '🏋️', color: '#2dd4bf', detail: 'Quick abs session — no other studying today.', hours: 0.5, info: `Saturday is a light gym-only day. Just the abs routine — no VARC/DILR/Quant work, no error log, nothing else CAT-related. This is what makes the rest of the week sustainable.\n\nToday's routine:\n${routineLines}\n\n${PROGRESSION_RULE}` },
    ];
  }

  const tasks = [];

  // Gym (Mon/Tue/Thu/Fri/Sun — Wednesday is rest)
  if (dayType !== 'wednesday') {
    const dow = dayOfWeek(dateStr);
    const routine = WORKOUT_ROUTINES[dow];
    const routineLines = routine
      ? routine.exercises.map((e, i) => `${i + 1}. ${e}`).join('\n')
      : '';
    const gymInfo = routine
      ? `Today's split: ${routine.name}\n\n${routineLines}\n\n${PROGRESSION_RULE}`
      : 'Standard strength/cardio session.';
    tasks.push({ id: 'gym', label: `Gym — ${routine ? routine.name.replace(/^[^A-Za-z]+/, '') : 'Workout'}`, icon: '🏋️', color: '#2dd4bf', detail: dayType === 'sunday' ? '6:00–8:00 AM' : '6:00–7:30 AM', hours: dayType === 'sunday' ? 2 : 1.5, info: gymInfo });
  }

  if (dayType === 'weekday') {
    tasks.push({ id: 'varc', label: 'VARC — 2 RCs + 8-10 VA', icon: '📖', color: '#60a5fa', detail: '6:30–7:30 PM. Analyse every wrong answer.', hours: 1, info: '2 Reading Comprehension passages + 8-10 Verbal Ability questions (Para Jumbles, Para Summary, Odd One Out, Para Completion — rotate type by week). For every wrong answer: write down WHY the correct option is right and why your option was wrong. This analysis habit matters more than volume.' });
    tasks.push({ id: 'dilr', label: `DILR — ${dilrFocus}`, icon: '🧩', color: '#a78bfa', detail: '7:30–8:30 PM. Find opening constraint first.', hours: 1, info: `${dilrBlockLine} Before drawing any diagram, read the full set and identify the ONE clue that unlocks it (the opening constraint) — write it down before you start solving. No timer in Phase 1/2 — understanding beats speed right now.` });
    tasks.push({ id: 'quant', label: `Quant — ${quantTopic}`, icon: '🔢', color: '#fb923c', detail: '8:30–9:15 PM, 12-15 questions.', hours: 0.75, info: `${quantBlockLine} Do 12-15 questions. For every question — even ones you get right — pause and check if there was a faster method. Build/update your formula sheet entry for this topic.` });
    tasks.push({ id: 'errorlog', label: 'Error Log Entry', icon: '📝', color: '#f87171', detail: '9:15–9:30 PM', hours: 0.25, info: 'Quick 15-min entry: what went wrong today across VARC/DILR/Quant, which topic, what the correct approach was. This is the single highest-leverage 15 minutes of your day — it compounds over the full 5 months.' });
  } else if (dayType === 'wednesday') {
    if (mock) {
      tasks.push({ id: 'mock', label: '🔴 FULL MOCK (3 hrs)', icon: '🎯', color: '#ff5050', detail: '6:30–9:30 PM. Exact CAT conditions.', hours: 3, info: 'Full 3-hour CAT mock, no breaks, no phone, no interruptions. Treat it exactly like exam day — this is rehearsal, not practice. Don\'t panic about the score; it\'s data for tomorrow\'s analysis, not a verdict on you.' });
      tasks.push({ id: 'analysis', label: 'Mock Analysis (Part 1)', icon: '🔍', color: '#f4a261', detail: '9:30–10:00 PM. Continue tomorrow AM.', hours: 0.5, info: 'Start with DILR: map which sets you attempted vs which you should have. Note set-selection efficiency. You\'ll continue the rest of the analysis (VARC + Quant) before work tomorrow morning — don\'t rush this tonight.' });
    } else {
      tasks.push({ id: 'sectional', label: 'Sectional Test (40 min)', icon: '⏱️', color: '#70d070', detail: '6:30–7:10 PM', hours: 0.67, info: 'One section only (rotate VARC/DILR/Quant week to week), timed 40 min, exam-style conditions. Jun–Aug focus is accuracy, not speed — don\'t rush just because the clock is running.' });
      tasks.push({ id: 'analysis', label: 'Sectional Analysis', icon: '🔍', color: '#f4a261', detail: '7:10–7:50 PM', hours: 0.67, info: 'Go through every wrong answer from the sectional. Which question type keeps tripping you up? Log it in your error log so the weekend deep-practice can target it specifically.' });
      tasks.push({ id: 'quant', label: `Quant — ${quantTopic}`, icon: '🔢', color: '#fb923c', detail: '7:50–9:00 PM', hours: 1.17, info: `${quantBlockLine} Slightly longer session than weekday evenings since there's no gym today.` });
      tasks.push({ id: 'dilr', label: `DILR — ${dilrFocus}`, icon: '🧩', color: '#a78bfa', detail: '9:00–10:00 PM', hours: 1, info: `${dilrBlockLine} Same opening-constraint-first rule applies. No gym tonight means you have a full hour here instead of the usual 60 min squeeze.` });
    }
  } else if (dayType === 'sunday') {
    if (mock) {
      tasks.push({ id: 'mock', label: '🔴 FULL MOCK (9 AM–12 PM)', icon: '🎯', color: '#ff5050', detail: 'Exact CAT conditions, 3 hrs.', hours: 3, info: 'Full 3-hour mock under exact CAT conditions, right after gym. This is your most realistic rehearsal slot since you have the whole day after it for proper analysis — unlike the Wednesday evening mocks.' });
      tasks.push({ id: 'analysis', label: 'Deep Analysis (2× time)', icon: '🔍', color: '#f4a261', detail: '1:00–4:30 PM. What went wrong? Selection poor? Correctly skipped?', hours: 3.5, info: 'The core rule: spend 2× the mock duration analysing it. For every wrong answer ask: (1) What went wrong — concept, calculation, or time pressure? (2) For DILR — was the set selection itself poor? (3) What did you correctly skip, and what should you have skipped but didn\'t? This is where the actual score improvement happens, not in taking more mocks.' });
      tasks.push({ id: 'targeted', label: 'Weak-Area Sprint', icon: '🎯', color: '#fb923c', detail: '4:30–6:30 PM', hours: 2, info: 'Pick the single weakest area exposed by today\'s mock analysis and drill it hard for 2 hours — don\'t spread thin across multiple topics. Fix the biggest leak first.' });
      tasks.push({ id: 'errorlog', label: 'Error Log + Strategy Update', icon: '📝', color: '#f87171', detail: '6:30–7:30 PM', hours: 1, info: 'Log today\'s mock findings. If a pattern is emerging across multiple mocks (same mistake type, same section running over time), update your exam-day strategy notes now while it\'s fresh.' });
    } else {
      tasks.push({ id: 'varc', label: 'VARC Deep Block', icon: '📖', color: '#60a5fa', detail: '8:30–11:00 AM', hours: 2.5, info: 'Longer, deeper VARC session than weekdays allow. Mix RC practice with dedicated VA drilling on whichever sub-type (Para Jumbles, Summary, Odd One Out, Completion) has been weakest this week.' });
      tasks.push({ id: 'quant', label: `Quant — ${quantTopic}`, icon: '🔢', color: '#fb923c', detail: '11:00 AM–1:30 PM', hours: 2.5, info: `${quantBlockLine} This 2.5-hour block lets you build full conceptual clarity rather than just grinding reps. Read concept, derive formulas yourself, then practice.` });
      tasks.push({ id: 'dilr', label: `DILR — ${dilrFocus}`, icon: '🧩', color: '#a78bfa', detail: '2:30–5:30 PM', hours: 3, info: `${dilrBlockLine} This 3-hour block is where you actually work through full CAT PYQ sets from 2020-2025 — non-negotiable, every set gets covered eventually. Opening constraint first, every time.` });
      tasks.push({ id: 'errorlog', label: 'Revision + Error Log', icon: '📝', color: '#f87171', detail: '5:30–7:00 PM', hours: 1.5, info: 'Review the week\'s error log entries together — look for repeating patterns rather than treating each mistake as isolated. Update your formula sheet and DILR approach notes.' });
      tasks.push({ id: 'reading', label: 'Reading (Aeon/Smithsonian)', icon: '🌐', color: '#4ade80', detail: '7:00–8:00 PM', hours: 1, info: 'Read 1-2 long-form articles for pleasure, not analysis. This is what builds raw reading speed and comfort with dense prose over months — the payoff shows up in mock RC scores later, not immediately.' });
    }
  }

  return tasks;
}

function formatDateLabel(dateStr) {
  return toDate(dateStr).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}
function formatDateShort(dateStr) {
  return toDate(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}
function todayStr() { return toStr(new Date()); }
function getLastNDays(n) {
  const days = [];
  const today = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(toStr(d));
  }
  return days;
}

const WEEKLY_TEMPLATE = [
  { day: 'Sunday', type: 'Gym + Mega Day', color: '#60a5fa', items: ['Gym 6–8 AM', 'VARC deep block 8:30–11 AM', 'Quant 11 AM–1:30 PM', 'Lunch', 'DILR 2:30–5:30 PM', 'Error log 5:30–7 PM', 'Reading 7–8 PM', 'From Sep: Mock replaces 9AM-12PM slot'] },
  { day: 'Monday', type: 'Gym Day', color: '#fb923c', items: ['Gym 6–7:30 AM', 'Office 9 AM–6 PM', 'VARC 6:30–7:30 PM', 'DILR 7:30–8:30 PM', 'Quant 8:30–9:15 PM', 'Error log 9:15–9:30 PM'] },
  { day: 'Tuesday', type: 'Gym Day', color: '#fb923c', items: ['Gym 6–7:30 AM', 'Office 9 AM–6 PM', 'VARC 6:30–7:30 PM', 'DILR 7:30–8:30 PM', 'Quant 8:30–9:15 PM', 'Error log 9:15–9:30 PM'] },
  { day: 'Wednesday', type: 'No Gym — Sectional/Mock', color: '#70d070', items: ['Office 9 AM–6 PM', 'Jun–Aug: Sectional 40min + analysis + practice', 'Sep–Nov: Full Mock 6:30–9:30 PM + analysis till 10 PM'] },
  { day: 'Thursday', type: 'Gym Day', color: '#fb923c', items: ['Gym 6–7:30 AM (shorter if Wed was a mock)', 'Office 9 AM–6 PM', 'VARC 6:30–7:30 PM', 'DILR 7:30–8:30 PM', 'Quant 8:30–9:15 PM', 'Error log 9:15–9:30 PM'] },
  { day: 'Friday', type: 'Gym Day', color: '#fb923c', items: ['Gym 6–7:30 AM', 'Office 9 AM–6 PM', 'VARC 6:30–7:30 PM', 'DILR 7:30–8:30 PM', 'Quant 8:30–9:15 PM', 'Error log 9:15–9:30 PM'] },
  { day: 'Saturday', type: 'FULL OFF', color: '#ff7070', items: ['Zero structured study', 'No mocks, no sectionals, no error log', 'Casual reading allowed if desired', 'This is what makes the other 6 days sustainable'] },
];

export default function App() {
  const [data, setData] = useState({});
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState('today');
  const [toast, setToast] = useState('');
  const [expandedTask, setExpandedTask] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const result = await storage.get(STORAGE_KEY);
        if (mounted && result && result.value) {
          const parsed = JSON.parse(result.value);
          // Cleanup: strip any entries before HARD_FLOOR (June 20).
          // Nothing existed before that date in this plan.
          const cleaned = {};
          let hadStaleData = false;
          for (const [dateKey, dayData] of Object.entries(parsed)) {
            if (dateKey >= HARD_FLOOR) {
              cleaned[dateKey] = dayData;
            } else {
              hadStaleData = true;
            }
          }
          setData(cleaned);
          if (hadStaleData) {
            // persist the cleaned version back so it doesn't reappear next load
            storage.set(STORAGE_KEY, JSON.stringify(cleaned)).catch(() => {});
          }
        }
      } catch (e) { /* no data yet */ }
      finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, []);

  // Belt-and-suspenders: explicitly force today's date on mount, independent of
  // the useState lazy initializer, in case of any stale-render edge cases.
  useEffect(() => {
    setSelectedDate(todayStr());
  }, []);

  const persist = useCallback(async (newData) => {
    setSaving(true);
    try { await storage.set(STORAGE_KEY, JSON.stringify(newData)); }
    catch (e) { console.error(e); }
    finally { setSaving(false); }
  }, []);

  const toggleTask = (dateStr, taskId) => {
    setData(prev => {
      const dayData = { ...(prev[dateStr] || {}) };
      dayData[taskId] = !dayData[taskId];
      const newData = { ...prev, [dateStr]: dayData };
      persist(newData);
      return newData;
    });
  };

  const tasksForSelected = useMemo(() => getTasksForDate(selectedDate), [selectedDate]);

  // Generate full timetable: one summary row per week from PLAN_START to EXAM_DATE
  const allWeeks = useMemo(() => {
    const weeks = [];
    let cursor = toDate(PLAN_START);
    // Align to the Sunday of the start week
    while (cursor.getDay() !== 0) cursor.setDate(cursor.getDate() - 1);
    let weekNum = 1;
    while (toStr(cursor) <= EXAM_DATE) {
      const sunDate = toStr(cursor);
      const satDate = toStr(new Date(cursor.getTime() + 6 * 86400000));
      const midWeekDate = toStr(new Date(cursor.getTime() + 3 * 86400000)); // Wednesday, for topic lookup
      const phase = getPhase(sunDate > PLAN_START ? sunDate : PLAN_START);
      const quantTopic = getQuantTopic(midWeekDate, phase);
      const dilrFocus = getDilrFocus(midWeekDate, phase);
      const hasMockSun = isMockDay(sunDate);
      const hasMockWed = isMockDay(midWeekDate);
      weeks.push({
        weekNum, sunDate, satDate, phase,
        quantTopic, dilrFocus,
        hasMockSun, hasMockWed,
        isPastWeek: satDate < todayStr(),
        isCurrentWeek: sunDate <= todayStr() && satDate >= todayStr(),
      });
      cursor.setDate(cursor.getDate() + 7);
      weekNum++;
    }
    return weeks;
  }, []);

  const dayCompletion = (dateStr) => {
    const tasks = getTasksForDate(dateStr);
    const required = tasks.filter(t => !t.optional);
    if (required.length === 0) {
      // Saturday off day — completion is N/A, treat as neutral (not counted against streak)
      return { done: 0, total: 0, pct: -1 };
    }
    const dayData = data[dateStr] || {};
    const done = required.filter(t => dayData[t.id]).length;
    return { done, total: required.length, pct: Math.round((done / required.length) * 100) };
  };

  const dayHours = (dateStr) => {
    const tasks = getTasksForDate(dateStr).filter(t => !t.optional);
    const planned = tasks.reduce((sum, t) => sum + (t.hours || 0), 0);
    const dayData = data[dateStr] || {};
    const completed = tasks.filter(t => dayData[t.id]).reduce((sum, t) => sum + (t.hours || 0), 0);
    return { planned: Math.round(planned * 10) / 10, completed: Math.round(completed * 10) / 10 };
  };

  // Total planned + completed hours for every phase, computed once across the whole plan
  const phaseHoursTotal = useMemo(() => {
    const totals = { 1: { planned: 0, completed: 0 }, 2: { planned: 0, completed: 0 }, 3: { planned: 0, completed: 0 }, 4: { planned: 0, completed: 0 }, 5: { planned: 0, completed: 0 } };
    let cursor = toDate(PLAN_START);
    const end = toDate(EXAM_DATE);
    while (cursor <= end) {
      const ds = toStr(cursor);
      const p = getPhase(ds);
      const h = dayHours(ds);
      totals[p].planned += h.planned;
      totals[p].completed += h.completed;
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const p of [1, 2, 3, 4, 5]) {
      totals[p].planned = Math.round(totals[p].planned * 10) / 10;
      totals[p].completed = Math.round(totals[p].completed * 10) / 10;
    }
    return totals;
  }, [data]);

  const isFullDay = (dateStr) => {
    const { pct } = dayCompletion(dateStr);
    return pct === 100 || pct === -1; // Saturday off counts as "not breaking streak"
  };

  const calcStreak = () => {
    let streak = 0;
    let d = new Date();
    while (true) {
      const ds = toStr(d);
      if (ds < HARD_FLOOR) break;
      if (isFullDay(ds)) {
        const { pct } = dayCompletion(ds);
        if (pct !== -1) streak++; // don't increment on off-days, but don't break either
        d.setDate(d.getDate() - 1);
      } else break;
    }
    return streak;
  };

  const calcLongestStreak = () => {
    const allDates = Object.keys(data).sort();
    if (allDates.length === 0) return 0;
    let longest = 0, current = 0, prevDate = null;
    for (const ds of allDates) {
      const { pct } = dayCompletion(ds);
      if (pct === -1) continue; // skip off days in counting but don't reset
      if (pct !== 100) { current = 0; prevDate = null; continue; }
      if (prevDate) {
        const diff = daysBetween(prevDate, ds);
        current = diff <= 2 ? current + 1 : 1; // allow 1 off-day gap
      } else current = 1;
      longest = Math.max(longest, current);
      prevDate = ds;
    }
    return longest;
  };

  const last30 = getLastNDays(30).filter(d => d >= HARD_FLOOR);
  const last7 = getLastNDays(7).filter(d => d >= HARD_FLOOR);
  const weekCompletionAvg = () => {
    const vals = last7.map(d => dayCompletion(d).pct).filter(p => p !== -1);
    if (vals.length === 0) return 0;
    return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  };

  const totalDaysTracked = Object.keys(data).filter(d => Object.values(data[d]).some(v => v)).length;
  const currentStreak = calcStreak();
  const longestStreak = calcLongestStreak();
  const phase = getPhase(selectedDate);
  const dayType = getDayType(selectedDate);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2200); };

  const handleToggle = (dateStr, taskId) => {
    const wasOn = !!(data[dateStr]?.[taskId]);
    toggleTask(dateStr, taskId);
    if (!wasOn) {
      const tasks = getTasksForDate(dateStr).filter(t => !t.optional);
      const dayData = data[dateStr] || {};
      const doneAfter = tasks.filter(t => t.id === taskId ? true : dayData[t.id]).length;
      if (doneAfter === tasks.length && tasks.length > 0) showToast('🔥 Full day complete!');
    }
  };

  const navigateDate = (delta) => {
    const d = toDate(selectedDate);
    d.setDate(d.getDate() + delta);
    const ds = toStr(d);
    if (ds >= HARD_FLOOR && ds <= EXAM_DATE) {
      setSelectedDate(ds);
      setExpandedTask(null);
    }
  };

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#888', fontFamily: 'system-ui' }}>Loading your tracker...</div>;
  }

  const selectedCompletion = dayCompletion(selectedDate);
  const selectedHours = dayHours(selectedDate);
  const selectedDayData = data[selectedDate] || {};
  const isOffDay = selectedCompletion.pct === -1;
  const isMock = isMockDay(selectedDate);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      background: '#0a0a12', color: '#e0e0f0', minHeight: '100%',
      maxWidth: 480, margin: '0 auto', borderRadius: 16, overflow: 'hidden',
      border: '1px solid #1e1e32',
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #12122a, #1a1a35)', padding: '18px 20px', borderBottom: '2px solid #8b1a1a' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ fontSize: 16, fontWeight: 800, color: '#fff', margin: 0 }}>CAT 2026 Tracker</h1>
            <p style={{ fontSize: 11, color: '#7070a0', margin: '2px 0 0' }}>
              {saving ? 'Saving...' : `Phase ${phase}: ${PHASE_BOUNDS[phase].name} · Today: ${formatDateShort(todayStr())}`}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a0808', padding: '6px 12px', borderRadius: 20, border: '1px solid #5a1010' }}>
            <Flame size={16} color="#ff7070" fill={currentStreak > 0 ? '#ff7070' : 'none'} />
            <span style={{ fontSize: 14, fontWeight: 800, color: '#ff9090' }}>{currentStreak}</span>
          </div>
        </div>

        {/* Daily nutrition targets — Fight Club physique plan */}
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 9,
          background: '#0c1820', border: '1px solid #1a3a4a',
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
            🎯 Daily Body Targets · 74 kg → Fight Club Aesthetic
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            <div style={nutCellStyle}>
              <div style={nutValueStyle('#fb923c')}>1,900–2,300</div>
              <div style={nutLabelStyle}>kcal/day</div>
            </div>
            <div style={nutCellStyle}>
              <div style={nutValueStyle('#f87171')}>120–150g</div>
              <div style={nutLabelStyle}>protein</div>
            </div>
            <div style={nutCellStyle}>
              <div style={nutValueStyle('#2dd4bf')}>300–500</div>
              <div style={nutLabelStyle}>cal deficit</div>
            </div>
            <div style={nutCellStyle}>
              <div style={nutValueStyle('#a78bfa')}>8k–12k</div>
              <div style={nutLabelStyle}>steps/day</div>
            </div>
          </div>
          <div style={{ fontSize: 9.5, color: '#5878a0', marginTop: 7, lineHeight: 1.45 }}>
            Timeline at this rate: ~15% BF by Sep · ~12% BF by Oct · 10–11% (Fight Club) by Nov
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #1e1e30', background: '#0c0c1c' }}>
        {[
          { id: 'today', label: 'Checklist', icon: <CheckCircle2 size={13} /> },
          { id: 'week', label: 'Weekly Plan', icon: <Calendar size={13} /> },
          { id: 'progress', label: 'Progress', icon: <BarChart3 size={13} /> },
          { id: 'full', label: 'Full Timetable', icon: <BookOpen size={13} /> },
        ].map(tab => (
          <button key={tab.id} onClick={() => setView(tab.id)} style={{
            flex: 1, padding: '10px 0', fontSize: 9.5, fontWeight: 700, border: 'none',
            background: view === tab.id ? '#14142a' : 'transparent',
            color: view === tab.id ? '#fff' : '#505070',
            borderBottom: view === tab.id ? '2px solid #8b1a1a' : '2px solid transparent',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}>
            {tab.icon} <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─────────── CHECKLIST VIEW ─────────── */}
      {view === 'today' && (
        <div style={{ padding: 18 }}>
          {(() => {
            const isToday = selectedDate === todayStr();
            const isFutureDate = selectedDate > todayStr();
            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14,
                padding: isToday ? '0' : '8px 10px',
                borderRadius: 12,
                background: isToday ? 'transparent' : (isFutureDate ? '#1a140820' : '#1a080820'),
                border: isToday ? 'none' : `1px solid ${isFutureDate ? '#5a3a0850' : '#5a101050'}`,
              }}>
                <button onClick={() => navigateDate(-1)} disabled={selectedDate <= HARD_FLOOR}
                  style={{ ...navBtnStyle, opacity: selectedDate <= HARD_FLOOR ? 0.3 : 1 }}>
                  <ChevronLeft size={16} />
                </button>
                <div style={{ textAlign: 'center', flex: 1 }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    fontSize: 14, fontWeight: 800, color: isToday ? '#fff' : (isFutureDate ? '#f4a261' : '#ff8080'),
                  }}>
                    {!isToday && <span style={{ fontSize: 10 }}>{isFutureDate ? '⏭️' : '⏮️'}</span>}
                    {isToday ? 'Today' : formatDateShort(selectedDate)}
                  </div>
                  <div style={{ fontSize: 10, color: isToday ? '#6060a0' : (isFutureDate ? '#c89060' : '#c06060'), marginTop: 1 }}>
                    {isToday ? formatDateLabel(selectedDate) : (isFutureDate ? 'Upcoming — preview only' : 'Viewing a past day')}
                  </div>
                  {!isToday && (
                    <button
                      onClick={() => { setSelectedDate(todayStr()); setExpandedTask(null); }}
                      style={{
                        marginTop: 6, fontSize: 10, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
                        background: isFutureDate ? '#f4a26122' : '#ff707022',
                        border: `1px solid ${isFutureDate ? '#f4a26160' : '#ff707060'}`,
                        color: isFutureDate ? '#f4a261' : '#ff8080', cursor: 'pointer',
                      }}
                    >
                      ↩ Jump to Today
                    </button>
                  )}
                </div>
                <button onClick={() => navigateDate(1)} disabled={selectedDate >= EXAM_DATE}
                  style={{ ...navBtnStyle, opacity: selectedDate >= EXAM_DATE ? 0.3 : 1 }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            );
          })()}

          {/* Day-type badge */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            <span style={badgeStyle(dayType === 'saturday-light' ? '#f4a261' : '#60a5fa')}>
              {dayType === 'saturday-light' ? '🔥 Abs Day' : dayType === 'sunday' ? '☀️ Mega Day' : dayType === 'wednesday' ? '🌙 No-Gym Day' : '💪 Gym Day'}
            </span>
            {isMock && <span style={badgeStyle('#ff5050')}>🎯 MOCK DAY</span>}
            <span style={badgeStyle('#7b5ea7')}>Phase {phase}</span>
          </div>

          {!isOffDay && (
            <div style={{ background: '#13131e', borderRadius: 12, padding: 14, marginBottom: 16, border: '1px solid #222238' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#9090c0' }}>Today's Progress</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: selectedCompletion.pct === 100 ? '#60d060' : '#f4a261' }}>
                  {selectedCompletion.done}/{selectedCompletion.total}
                </span>
              </div>
              <div style={{ height: 8, background: '#0a0a14', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%', width: `${Math.max(0, selectedCompletion.pct)}%`,
                  background: selectedCompletion.pct === 100 ? 'linear-gradient(90deg, #2dd4bf, #60d060)' : 'linear-gradient(90deg, #8b1a1a, #f4a261)',
                  transition: 'width 0.3s ease',
                }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingTop: 8, borderTop: '1px solid #1e1e30' }}>
                <span style={{ fontSize: 14 }}>⏱️</span>
                <span style={{ fontSize: 12, color: '#9090c0' }}>
                  {selectedDate <= todayStr() ? 'Studied: ' : 'Planned: '}
                  <strong style={{ color: selectedHours.completed >= selectedHours.planned ? '#60d060' : '#f4a261' }}>
                    {selectedDate <= todayStr() ? selectedHours.completed : selectedHours.planned} hrs
                  </strong>
                  {selectedDate <= todayStr() && <span style={{ color: '#5858a0' }}> / {selectedHours.planned} hrs planned</span>}
                </span>
              </div>
            </div>
          )}

          <div style={{ fontSize: 10, color: '#5050a0', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
            {isOffDay ? "Saturday — your rule, your rest" : selectedDate > todayStr() ? "Preview only — can't check off future days" : 'Tap whichever you completed — any order, any time of day'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {tasksForSelected.map(task => {
              const done = !!selectedDayData[task.id];
              const isFuture = selectedDate > todayStr();
              const isExpanded = expandedTask === task.id;
              return (
                <div key={task.id} style={{
                  borderRadius: 10, overflow: 'hidden',
                  background: done ? `${task.color}18` : '#13131e',
                  border: `1px solid ${done ? task.color + '60' : '#222238'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '13px 14px' }}>
                    {/* Main clickable zone — toggles done */}
                    <div
                      onClick={() => !task.optional && !isFuture && handleToggle(selectedDate, task.id)}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 12, flex: 1, cursor: task.optional || isFuture ? 'default' : 'pointer', opacity: isFuture ? 0.6 : 1 }}
                    >
                      <span style={{ fontSize: 18, marginTop: 1 }}>{task.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: done ? '#fff' : '#a0a0c0' }}>{task.label}</div>
                        {task.detail && <div style={{ fontSize: 10, color: '#5858a0', marginTop: 2 }}>{task.detail}</div>}
                      </div>
                    </div>

                    {/* Info button — independent click zone, doesn't toggle done */}
                    {task.info && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setExpandedTask(isExpanded ? null : task.id); }}
                        style={{
                          width: 26, height: 26, borderRadius: 7, flexShrink: 0, marginTop: 1,
                          border: `1px solid ${isExpanded ? task.color + '80' : '#2a2a45'}`,
                          background: isExpanded ? `${task.color}25` : '#0e0e1a',
                          color: isExpanded ? task.color : '#6868a0',
                          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="What am I doing here?"
                      >
                        <Info size={14} />
                      </button>
                    )}

                    {!task.optional && !isFuture && (
                      <div onClick={() => handleToggle(selectedDate, task.id)} style={{ cursor: 'pointer', marginTop: 1 }}>
                        {done
                          ? <CheckCircle2 size={20} color={task.color} fill={task.color} fillOpacity={0.2} />
                          : <Circle size={20} color="#3a3a55" />}
                      </div>
                    )}
                  </div>

                  {/* Expandable info panel */}
                  {isExpanded && task.info && (
                    <div style={{
                      padding: '0 14px 13px 44px', fontSize: 11.5, color: '#b0b0d0', lineHeight: 1.6,
                      borderTop: `1px solid ${task.color}25`, marginTop: -2, paddingTop: 10,
                    }}>
                      {task.info}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {selectedCompletion.pct === 100 && (
            <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'linear-gradient(90deg, #0a2a1a, #0a2a25)', border: '1px solid #1a5a40', textAlign: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#60e0a0' }}>🔥 Full day complete — streak alive</span>
            </div>
          )}
        </div>
      )}

      {/* ─────────── WEEKLY PLAN VIEW ─────────── */}
      {view === 'week' && (
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: '#7070a0', marginBottom: 14, lineHeight: 1.5 }}>
            Your reusable weekly shape. Topics rotate by phase (see Checklist for today's exact content) — but this daily time structure stays constant from Jun 21 to Nov 29.
          </div>
          {WEEKLY_TEMPLATE.map(d => (
            <div key={d.day} style={{ background: '#13131e', borderRadius: 10, marginBottom: 10, border: '1px solid #222238', overflow: 'hidden' }}>
              <div style={{ padding: '9px 14px', background: `${d.color}15`, borderBottom: `1px solid ${d.color}30`, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{d.day}</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: d.color }}>{d.type}</span>
              </div>
              <div style={{ padding: '10px 14px' }}>
                {d.items.map((item, i) => (
                  <div key={i} style={{ fontSize: 11, color: '#9090b8', padding: '3px 0', display: 'flex', gap: 6 }}>
                    <span style={{ color: d.color }}>›</span> {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────── PROGRESS VIEW ─────────── */}
      {view === 'progress' && (
        <div style={{ padding: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <StatCard icon={<Flame size={16} color="#ff7070" />} value={currentStreak} label="Current Streak" color="#ff7070" />
            <StatCard icon={<Trophy size={16} color="#f4a261" />} value={longestStreak} label="Longest Streak" color="#f4a261" />
            <StatCard icon={<Target size={16} color="#60a5fa" />} value={`${weekCompletionAvg()}%`} label="This Week Avg" color="#60a5fa" />
            <StatCard icon={<Calendar size={16} color="#a78bfa" />} value={totalDaysTracked} label="Days Active" color="#a78bfa" />
          </div>

          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#9090c0', textTransform: 'uppercase', letterSpacing: 0.5 }}>Last 30 Days</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)', gap: 5, marginBottom: 8, background: '#13131e', padding: 12, borderRadius: 10, border: '1px solid #222238' }}>
            {last30.map(ds => {
              const { pct } = dayCompletion(ds);
              const intensity = pct === -1 ? '#1a1428' : pct === 0 ? '#1a1a28' : pct < 40 ? '#3a1a1a' : pct < 80 ? '#5a3a1a' : pct < 100 ? '#3a5a2a' : '#1a6040';
              const isToday = ds === todayStr();
              return (
                <div key={ds} onClick={() => { setSelectedDate(ds); setExpandedTask(null); setView('today'); }}
                  title={`${formatDateShort(ds)}: ${pct === -1 ? 'Rest day' : pct + '%'}`}
                  style={{ aspectRatio: '1', borderRadius: 4, background: intensity, border: isToday ? '1.5px solid #fff' : '1px solid transparent', cursor: 'pointer' }} />
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 18, fontSize: 9, color: '#6060a0' }}>
            <span>Less</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a1a28' }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#3a1a1a' }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#5a3a1a' }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#3a5a2a' }} />
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a6040' }} />
            <span>Full</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#1a1428', marginLeft: 6 }} />
            <span>Rest day</span>
          </div>

          <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 700, color: '#9090c0', textTransform: 'uppercase', letterSpacing: 0.5 }}>This Week — By Category</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['gym', 'varc', 'dilr', 'quant', 'errorlog', 'mock'].map(cat => {
              const doneCount = last7.filter(d => data[d]?.[cat]).length;
              const possibleCount = last7.filter(d => getTasksForDate(d).some(t => t.id === cat)).length;
              if (possibleCount === 0) return null;
              const pct = Math.round((doneCount / possibleCount) * 100);
              const meta = { gym: ['🏋️ Gym', '#2dd4bf'], varc: ['📖 VARC', '#60a5fa'], dilr: ['🧩 DILR', '#a78bfa'], quant: ['🔢 Quant', '#fb923c'], errorlog: ['📝 Error Log', '#f87171'], mock: ['🎯 Mocks', '#ff5050'] }[cat];
              return (
                <div key={cat} style={{ background: '#13131e', borderRadius: 8, padding: '9px 12px', border: '1px solid #222238' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#c0c0e0' }}>{meta[0]}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: meta[1] }}>{doneCount}/{possibleCount}</span>
                  </div>
                  <div style={{ height: 5, background: '#0a0a14', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: meta[1] }} />
                  </div>
                </div>
              );
            })}
          </div>

          {currentStreak === 0 && totalDaysTracked > 0 && (
            <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: 10, background: '#1a1408', border: '1px solid #5a3a08', textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: '#f4a261', fontWeight: 600 }}>Streak reset — that's fine. Today's a fresh start.</span>
            </div>
          )}
        </div>
      )}

      {/* ─────────── FULL TIMETABLE VIEW ─────────── */}
      {view === 'full' && (
        <div style={{ padding: 18 }}>
          <div style={{ fontSize: 11, color: '#7070a0', marginBottom: 16, lineHeight: 1.5 }}>
            Every week from Jun 21 to Nov 29, grouped by phase. Tap any week to jump to its Sunday in the Checklist tab.
          </div>

          {[1, 2, 3, 4, 5].map(phaseNum => {
            const weeksInPhase = allWeeks.filter(w => w.phase === phaseNum);
            if (weeksInPhase.length === 0) return null;
            const ph = PHASE_BOUNDS[phaseNum];
            const phaseColors = { 1: '#2dd4bf', 2: '#60a5fa', 3: '#f4a261', 4: '#ff5050', 5: '#c084fc' };
            const color = phaseColors[phaseNum];
            return (
              <div key={phaseNum} style={{ marginBottom: 20 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
                  borderLeft: `4px solid ${color}`, paddingLeft: 10,
                }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color, background: `${color}20`, padding: '2px 8px', borderRadius: 8 }}>
                    PHASE {phaseNum}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{ph.name}</div>
                    <div style={{ fontSize: 9.5, color: '#6060a0' }}>{ph.label}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color }}>
                      {phaseHoursTotal[phaseNum].completed} / {phaseHoursTotal[phaseNum].planned}
                    </div>
                    <div style={{ fontSize: 8.5, color: '#5858a0' }}>hrs studied</div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {weeksInPhase.map(w => (
                    <div
                      key={w.weekNum}
                      onClick={() => { setSelectedDate(w.sunDate > todayStr() ? w.sunDate : (w.satDate >= todayStr() && w.sunDate <= todayStr() ? todayStr() : w.sunDate)); setExpandedTask(null); setView('today'); }}
                      style={{
                        background: w.isCurrentWeek ? `${color}12` : '#13131e',
                        border: `1px solid ${w.isCurrentWeek ? color + '50' : '#222238'}`,
                        borderRadius: 9, padding: '10px 12px', cursor: 'pointer',
                        opacity: w.isPastWeek ? 0.55 : 1,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: w.isCurrentWeek ? '#fff' : '#a0a0c0' }}>
                          Wk {w.weekNum} · {formatDateShort(w.sunDate)} – {formatDateShort(w.satDate).split(',')[0]}
                        </span>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {w.isCurrentWeek && <span style={{ fontSize: 8, fontWeight: 800, color: '#60d060', background: '#0a2a1a', padding: '2px 6px', borderRadius: 6 }}>NOW</span>}
                          {(w.hasMockSun || w.hasMockWed) && <span style={{ fontSize: 8, fontWeight: 800, color: '#ff8080', background: '#2a0a0a', padding: '2px 6px', borderRadius: 6 }}>🎯 MOCK</span>}
                        </div>
                      </div>
                      <div style={{ fontSize: 10, color: '#7070a0', lineHeight: 1.5 }}>
                        <span style={{ color: '#fb923c' }}>Quant:</span> {w.quantTopic}<br />
                        <span style={{ color: '#a78bfa' }}>DILR:</span> {w.dilrFocus}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div style={{ marginTop: 8, padding: '12px 14px', borderRadius: 10, background: '#1a0808', border: '1px solid #5a1010', textAlign: 'center' }}>
            <span style={{ fontSize: 11, color: '#ff9090', fontWeight: 700 }}>🎯 CAT 2026 — Sunday, Nov 29</span>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', background: '#1a6040', color: '#fff', padding: '10px 20px', borderRadius: 20, fontSize: 13, fontWeight: 700, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', zIndex: 1000 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

const navBtnStyle = { width: 32, height: 32, borderRadius: 8, border: '1px solid #222238', background: '#13131e', color: '#9090c0', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const badgeStyle = (color) => ({ fontSize: 10, fontWeight: 700, padding: '3px 9px', borderRadius: 12, background: `${color}20`, color, border: `1px solid ${color}40` });
const nutCellStyle = { background: '#0a1218', border: '1px solid #1a2a35', borderRadius: 7, padding: '6px 4px', textAlign: 'center' };
const nutValueStyle = (color) => ({ fontSize: 11, fontWeight: 800, color, lineHeight: 1.2 });
const nutLabelStyle = { fontSize: 9, color: '#5060a0', marginTop: 2 };

function StatCard({ icon, value, label, color }) {
  return (
    <div style={{ background: '#13131e', borderRadius: 10, padding: 12, border: '1px solid #222238', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 9.5, color: '#6060a0', marginTop: 2 }}>{label}</div>
    </div>
  );
}
