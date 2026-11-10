import type { Lang } from '../wiki/types';
import { titlesEqual } from '../wiki/titles';
import type { Challenge } from './types';

/**
 * Curated pools of well-linked, real Wikipedia articles (canonical titles,
 * verified against the live API by `src/__live__/wikipedia.live.test.ts`).
 * Random challenges pick two distinct articles from the same pool.
 */
export const CHALLENGE_POOLS: Readonly<Record<Lang, readonly string[]>> = {
  en: [
    'Germany', 'Volkswagen', 'Albert Einstein', 'The Beatles', 'Pizza', 'Mount Everest', 'Chess',
    'Ancient Egypt', 'Coffee', 'Moon', 'Banana', 'Napoleon', 'Tokyo', 'William Shakespeare',
    'Basketball', 'Leonardo da Vinci', 'Penguin', 'Jazz', 'Bicycle', 'Roman Empire', 'Chocolate',
    'Apollo 11', 'Volcano', 'Wolfgang Amadeus Mozart', 'Honey', 'Internet', 'Tea', 'Olympic Games',
    'Association football', 'Isaac Newton', 'Amazon rainforest', 'Great Wall of China', 'Dinosaur',
    'Electricity', 'Vincent van Gogh', 'Titanic', 'Photosynthesis', 'Mars', 'Samurai', 'Vikings',
    'Eiffel Tower', 'Shark', 'Printing press', 'Antarctica', 'Bread', 'Elephant', 'Rome', 'Jupiter',
    'Telephone', 'Charles Darwin', 'Video game', 'Guitar', 'Lion', 'Cheese', 'Mathematics', 'Oxygen',
    'Brazil', 'India', 'Australia',
  ],
  he: [
    'גרמניה', 'פולקסווגן', 'אלברט איינשטיין', 'הביטלס', 'פיצה', 'אוורסט', 'שחמט', 'מצרים העתיקה',
    'קפה', 'הירח', 'בננה', 'נפוליאון בונפרטה', 'טוקיו', 'ויליאם שייקספיר', 'כדורסל',
    "לאונרדו דה וינצ'י", 'פינגוויניים', "ג'אז", 'אופניים', 'האימפריה הרומית', 'שוקולד', 'אפולו 11',
    'הר געש', 'וולפגנג אמדאוס מוצרט', 'דבש', 'אינטרנט', 'תה', 'המשחקים האולימפיים', 'כדורגל',
    'אייזק ניוטון', 'ירושלים', 'תל אביב-יפו', 'ים המלח', 'החומה הגדולה של סין', 'דינוזאורים', 'חשמל',
    'וינסנט ואן גוך', 'טיטניק', 'פוטוסינתזה', 'מאדים', 'סמוראי', 'ויקינגים', 'מגדל אייפל',
    'דמויי כריש', 'דפוס', 'אנטארקטיקה', 'לחם', 'פיליים', 'רומא', 'צדק (כוכב לכת)', 'טלפון',
    "צ'ארלס דרווין", 'משחק וידאו', 'גיטרה', 'אריה', 'גבינה', 'מתמטיקה', 'חמצן', 'ברזיל', 'הודו',
    'אוסטרליה',
  ],
};

export type RandomFn = () => number;

function pickIndex(length: number, random: RandomFn): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

/**
 * Picks a random start/target pair from the curated pool. Avoids returning
 * the exact same pair as `previous` when possible.
 */
export function pickRandomChallenge(lang: Lang, random: RandomFn = Math.random, previous?: Challenge | null): Challenge {
  const pool = CHALLENGE_POOLS[lang];
  for (let attempt = 0; attempt < 20; attempt++) {
    const startIndex = pickIndex(pool.length, random);
    let targetIndex = pickIndex(pool.length - 1, random);
    if (targetIndex >= startIndex) targetIndex += 1;
    const candidate: Challenge = { lang, start: pool[startIndex], target: pool[targetIndex] };
    const isRepeat =
      previous?.lang === lang &&
      titlesEqual(previous.start, candidate.start) &&
      titlesEqual(previous.target, candidate.target);
    if (!isRepeat) return candidate;
  }
  return { lang, start: pool[0], target: pool[1] };
}
