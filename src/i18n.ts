import type { NoticeCode, StartErrorCode } from './game/types';
import type { Lang } from './wiki/types';

export interface Strings {
  tagline: string;
  languageLabel: string;
  languageNames: Record<Lang, string>;
  randomTitle: string;
  randomDescription: string;
  shuffle: string;
  startRace: string;
  customTitle: string;
  customDescription: string;
  startLabel: string;
  targetLabel: string;
  searchPlaceholder: string;
  swap: string;
  disambiguationTag: string;
  noResults: string;
  searchFailed: string;
  pickBoth: string;
  sameArticle: string;
  sharedChallenge: string;
  sharedInvalid: string;
  howToPlay: string;
  rules: string[];
  statsTitle: string;
  gamesPlayed: string;
  gamesCompleted: string;
  bestMoves: string;
  bestTime: string;
  recentWins: string;
  noWins: string;
  statsNotSaved: string;
  resetStats: string;
  start: string;
  target: string;
  moves: string;
  time: string;
  back: string;
  restart: string;
  newChallenge: string;
  path: string;
  youAreHere: string;
  loadingArticle: (title: string) => string;
  preparingRace: string;
  notices: Record<NoticeCode, (title: string | null) => string>;
  startErrorTitle: string;
  startErrors: Record<StartErrorCode, (title: string | null) => string>;
  tryAgain: string;
  backToMenu: string;
  victoryTitle: string;
  victorySummary: (target: string, moves: number, time: string) => string;
  yourPath: string;
  backtrackNote: (moves: number, pathSteps: number) => string;
  playAgain: string;
  shareResult: string;
  copyLink: string;
  copied: string;
  copyFailed: string;
  shareText: (start: string, target: string, moves: number, time: string, path: string[], url: string) => string;
  disambiguationNotice: string;
  redirectedFrom: (title: string) => string;
  attribution: { before: string; license: string; history: string };
  footer: string;
  dismiss: string;
  movesCount: (moves: number) => string;
  challengePreview: (start: string, target: string) => string;
}

const en: Strings = {
  tagline: 'Race from one Wikipedia article to another using only the links inside the articles.',
  languageLabel: 'Wikipedia language',
  languageNames: { en: 'English', he: 'עברית' },
  randomTitle: 'Random challenge',
  randomDescription: 'Two well-known articles from a curated list.',
  shuffle: 'Shuffle',
  startRace: 'Start race',
  customTitle: 'Custom challenge',
  customDescription: 'Pick any two articles.',
  startLabel: 'Start article',
  targetLabel: 'Target article',
  searchPlaceholder: 'Search Wikipedia…',
  swap: 'Swap start and target',
  disambiguationTag: 'disambiguation',
  noResults: 'No matching articles',
  searchFailed: 'Search is unavailable right now',
  pickBoth: 'Choose both a start and a target article.',
  sameArticle: 'Start and target must be different articles.',
  sharedChallenge: 'You have been challenged',
  sharedInvalid: 'The challenge link is invalid. Pick a new challenge below.',
  howToPlay: 'How to play',
  rules: [
    'Begin on the start article and reach the target by clicking links inside the article text.',
    'Every link you follow counts as one move. Going back is free, but moves already made stay counted.',
    'External links, search and the address bar are off limits. Ctrl+F is allowed.',
  ],
  statsTitle: 'Your stats',
  gamesPlayed: 'Played',
  gamesCompleted: 'Completed',
  bestMoves: 'Fewest moves',
  bestTime: 'Best time',
  recentWins: 'Recent wins',
  noWins: 'No completed races yet.',
  statsNotSaved: 'This browser does not allow saving stats; they reset when the tab closes.',
  resetStats: 'Reset stats',
  start: 'Start',
  target: 'Target',
  moves: 'Moves',
  time: 'Time',
  back: 'Back',
  restart: 'Restart',
  newChallenge: 'New challenge',
  path: 'Path',
  youAreHere: 'current article',
  loadingArticle: (title) => `Loading “${title}”…`,
  preparingRace: 'Preparing your race…',
  notices: {
    'not-article': () => 'That link is not an article. Files, categories and special pages do not count.',
    redlink: (title) => `“${title ?? ''}” does not exist on Wikipedia yet.`,
    external: () => 'External links are disabled during a race.',
    unsupported: () => 'That link cannot be followed in WikiRace.',
    missing: (title) => `“${title ?? ''}” could not be found. No move was counted.`,
    invalid: () => 'That is not a valid article link.',
    network: () => 'Could not load the article. Check your connection; no move was counted.',
    api: () => 'Wikipedia returned an error. No move was counted.',
    'history-failed': (title) => `Could not reload “${title ?? ''}”.`,
  },
  startErrorTitle: 'This challenge cannot be started',
  startErrors: {
    missing: (title) => `“${title ?? ''}” does not exist on Wikipedia.`,
    invalid: (title) => `“${title ?? ''}” is not a valid article title.`,
    'not-article': (title) => `“${title ?? ''}” is not a regular article.`,
    'same-article': (title) => `Start and target lead to the same article (“${title ?? ''}”).`,
    'target-disambiguation': (title) =>
      `“${title ?? ''}” is a disambiguation page. Pick a specific article as the target.`,
    network: () => 'Could not reach Wikipedia. Check your connection and try again.',
    api: () => 'Wikipedia returned an error. Please try again.',
    aborted: () => 'The request was cancelled.',
  },
  tryAgain: 'Try again',
  backToMenu: 'Back to menu',
  victoryTitle: 'You made it!',
  victorySummary: (target, moves, time) =>
    `You reached “${target}” in ${moves === 1 ? '1 move' : `${moves} moves`} and ${time}.`,
  yourPath: 'Your path',
  backtrackNote: (moves, pathSteps) =>
    `${moves - pathSteps} of your ${moves} moves led to dead ends you backed out of.`,
  playAgain: 'Play again',
  shareResult: 'Share result',
  copyLink: 'Copy challenge link',
  copied: 'Copied to clipboard',
  copyFailed: 'Could not copy. Select and copy the link manually.',
  shareText: (start, target, moves, time, path, url) =>
    `WikiRace: ${start} → ${target}\n${moves === 1 ? '1 move' : `${moves} moves`} in ${time}\n${path.join(' → ')}\nCan you beat it? ${url}`,
  disambiguationNotice: 'This is a disambiguation page: pick the meaning you want to follow.',
  redirectedFrom: (title) => `Redirected from “${title}”`,
  attribution: {
    before: 'Content from the Wikipedia article',
    license: 'licensed under CC BY-SA 4.0',
    history: 'authors',
  },
  footer:
    'Article text and media come from Wikipedia and are available under CC BY-SA 4.0 and other licenses. WikiRace is not affiliated with the Wikimedia Foundation.',
  dismiss: 'Dismiss',
  movesCount: (moves) => (moves === 1 ? '1 move' : `${moves} moves`),
  challengePreview: (start, target) => `${start} → ${target}`,
};

const he: Strings = {
  tagline: 'מרוץ מערך אחד בוויקיפדיה לערך אחר, רק באמצעות הקישורים שבתוך הערכים.',
  languageLabel: 'שפת ויקיפדיה',
  languageNames: { en: 'English', he: 'עברית' },
  randomTitle: 'אתגר אקראי',
  randomDescription: 'שני ערכים מוכרים מתוך רשימה נבחרת.',
  shuffle: 'אתגר אחר',
  startRace: 'התחלת מרוץ',
  customTitle: 'אתגר מותאם אישית',
  customDescription: 'בחרו כל שני ערכים שתרצו.',
  startLabel: 'ערך התחלה',
  targetLabel: 'ערך יעד',
  searchPlaceholder: 'חיפוש בוויקיפדיה…',
  swap: 'החלפת התחלה ויעד',
  disambiguationTag: 'פירושונים',
  noResults: 'לא נמצאו ערכים תואמים',
  searchFailed: 'החיפוש אינו זמין כרגע',
  pickBoth: 'יש לבחור ערך התחלה וערך יעד.',
  sameArticle: 'ערך ההתחלה וערך היעד חייבים להיות שונים.',
  sharedChallenge: 'קיבלתם אתגר',
  sharedInvalid: 'קישור האתגר אינו תקין. בחרו אתגר חדש למטה.',
  howToPlay: 'איך משחקים',
  rules: [
    'מתחילים בערך ההתחלה ומגיעים לערך היעד בלחיצה על קישורים בתוך טקסט הערך.',
    'כל קישור שנלחץ נחשב לצעד אחד. חזרה אחורה אינה עולה צעדים, אבל צעדים שכבר נעשו נשארים.',
    'אסור להשתמש בקישורים חיצוניים, בחיפוש או בשורת הכתובת. מותר להשתמש ב־Ctrl+F.',
  ],
  statsTitle: 'הסטטיסטיקה שלך',
  gamesPlayed: 'משחקים',
  gamesCompleted: 'הושלמו',
  bestMoves: 'מינימום צעדים',
  bestTime: 'זמן שיא',
  recentWins: 'ניצחונות אחרונים',
  noWins: 'עדיין לא הושלמו מרוצים.',
  statsNotSaved: 'הדפדפן אינו מאפשר שמירת סטטיסטיקה; היא תתאפס עם סגירת הלשונית.',
  resetStats: 'איפוס סטטיסטיקה',
  start: 'התחלה',
  target: 'יעד',
  moves: 'צעדים',
  time: 'זמן',
  back: 'חזרה',
  restart: 'מההתחלה',
  newChallenge: 'אתגר חדש',
  path: 'מסלול',
  youAreHere: 'הערך הנוכחי',
  loadingArticle: (title) => `טוען את „${title}”…`,
  preparingRace: 'מכינים את המרוץ…',
  notices: {
    'not-article': () => 'הקישור אינו מוביל לערך. קבצים, קטגוריות ודפים מיוחדים אינם נחשבים.',
    redlink: (title) => `הערך „${title ?? ''}” עדיין לא קיים בוויקיפדיה.`,
    external: () => 'קישורים חיצוניים מושבתים במהלך המרוץ.',
    unsupported: () => 'לא ניתן לעקוב אחר הקישור הזה במשחק.',
    missing: (title) => `הערך „${title ?? ''}” לא נמצא. הצעד לא נספר.`,
    invalid: () => 'זה אינו קישור תקין לערך.',
    network: () => 'לא ניתן לטעון את הערך. בדקו את החיבור; הצעד לא נספר.',
    api: () => 'ויקיפדיה החזירה שגיאה. הצעד לא נספר.',
    'history-failed': (title) => `לא ניתן לטעון מחדש את „${title ?? ''}”.`,
  },
  startErrorTitle: 'לא ניתן להתחיל את האתגר',
  startErrors: {
    missing: (title) => `הערך „${title ?? ''}” אינו קיים בוויקיפדיה.`,
    invalid: (title) => `„${title ?? ''}” אינו שם ערך תקין.`,
    'not-article': (title) => `„${title ?? ''}” אינו ערך רגיל.`,
    'same-article': (title) => `ערך ההתחלה וערך היעד מובילים לאותו ערך („${title ?? ''}”).`,
    'target-disambiguation': (title) => `„${title ?? ''}” הוא דף פירושונים. בחרו ערך מסוים כיעד.`,
    network: () => 'לא ניתן להתחבר לוויקיפדיה. בדקו את החיבור ונסו שוב.',
    api: () => 'ויקיפדיה החזירה שגיאה. נסו שוב.',
    aborted: () => 'הבקשה בוטלה.',
  },
  tryAgain: 'ניסיון נוסף',
  backToMenu: 'חזרה לתפריט',
  victoryTitle: 'הגעתם!',
  victorySummary: (target, moves, time) =>
    `הגעתם אל „${target}” ${moves === 1 ? 'בצעד אחד' : `ב־${moves} צעדים`} תוך ${time}.`,
  yourPath: 'המסלול שלכם',
  backtrackNote: (moves, pathSteps) => `${moves - pathSteps} מתוך ${moves} הצעדים הובילו למבוי סתום וחזרתם מהם.`,
  playAgain: 'שחקו שוב',
  shareResult: 'שיתוף התוצאה',
  copyLink: 'העתקת קישור לאתגר',
  copied: 'הועתק ללוח',
  copyFailed: 'ההעתקה נכשלה. סמנו והעתיקו את הקישור ידנית.',
  shareText: (start, target, moves, time, path, url) =>
    `WikiRace: ${start} ← ${target}\n${moves === 1 ? 'צעד אחד' : `${moves} צעדים`} תוך ${time}\n${path.join(' ← ')}\nתצליחו לנצח? ${url}`,
  disambiguationNotice: 'זהו דף פירושונים: בחרו את המשמעות שברצונכם להמשיך אליה.',
  redirectedFrom: (title) => `הופניתם מהדף „${title}”`,
  attribution: {
    before: 'התוכן מתוך הערך בוויקיפדיה',
    license: 'מופץ ברישיון CC BY-SA 4.0',
    history: 'כותבים',
  },
  footer:
    'טקסט הערכים והמדיה לקוחים מוויקיפדיה וזמינים ברישיון CC BY-SA 4.0 ורישיונות נוספים. WikiRace אינו קשור לקרן ויקימדיה.',
  dismiss: 'סגירה',
  movesCount: (moves) => (moves === 1 ? 'צעד אחד' : `${moves} צעדים`),
  challengePreview: (start, target) => `${start} ← ${target}`,
};

const STRINGS: Record<Lang, Strings> = { en, he };

export function getStrings(lang: Lang): Strings {
  return STRINGS[lang];
}
