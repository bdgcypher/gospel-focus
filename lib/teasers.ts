/**
 * Short, public-domain snippets used purely as visual "fodder" while the
 * riffling animation runs (before the real passage is drawn). Once a volume has
 * been loaded its own verses are used instead — see lib/picker.ts.
 */
export const FALLBACK_TEASERS: string[] = [
  "In the beginning God created the heaven and the earth.",
  "Be still, and know that I am God.",
  "Trust in the Lord with all thine heart.",
  "I am the light of the world.",
  "Ask, and it shall be given you.",
  "The Lord is my shepherd; I shall not want.",
  "Behold, I am Jesus Christ, the Son of God.",
  "And it came to pass that I, Nephi, did cry unto the Lord.",
  "I will go and do the things which the Lord hath commanded.",
  "For God so loved the world.",
  "Ye shall know the truth, and the truth shall make you free.",
  "Come unto me, all ye that labour and are heavy laden.",
  "Faith is the substance of things hoped for.",
  "Whatever principle of intelligence we attain unto in this life will rise with us.",
  "The glory of God is intelligence.",
  "Men are, that they might have joy.",
  "Seek ye first the kingdom of God.",
  "Behold, the Lord requireth the heart and a willing mind.",
  "Let your light so shine before men.",
  "For with God nothing shall be impossible.",
  "And the Spirit of God moved upon the face of the waters.",
  "Charity never faileth.",
  "If any of you lack wisdom, let him ask of God.",
  "Peace I leave with you, my peace I give unto you.",
  "Then shalt thou delight thyself in the Lord.",
  "Rejoice in the Lord alway: and again I say, Rejoice.",
  "And Adam fell that men might be.",
  "This is my beloved Son, in whom I am well pleased.",
  "The Lord is my light and my salvation; whom shall I fear?",
  "Create in me a clean heart, O God.",
];

/** Pull a handful of short snippets out of a pool of real verse strings. */
export function buildTeasers(pool: string[] | null): string[] {
  if (!pool || pool.length < 8) return FALLBACK_TEASERS;
  const picks: string[] = [];
  for (let i = 0; i < 48; i++) {
    const s = pool[Math.floor(Math.random() * pool.length)];
    if (s && s.length >= 40 && s.length <= 220) picks.push(s);
  }
  return picks.length >= 8 ? picks : FALLBACK_TEASERS;
}
