-- Badges are awarded when a denormalized counter on `users` crosses criteria_value.
-- TOTAL_SOLVED and XP compare against the live counters; STREAK compares against
-- longest_streak, so a badge once earned is never revoked when a streak breaks.

INSERT INTO badges (id, code, name, description, icon, criteria_type, criteria_value) VALUES
  (1,  'FIRST_BLOOD',   'First Blood',    'Solve your first problem.',           '🩸', 'TOTAL_SOLVED', 1),
  (2,  'TEN_DOWN',      'Ten Down',       'Solve 10 problems.',                  '🔟', 'TOTAL_SOLVED', 10),
  (3,  'HALF_CENTURY',  'Half Century',   'Solve 50 problems.',                  '⚔️', 'TOTAL_SOLVED', 50),
  (4,  'CENTURION',     'Centurion',      'Solve 100 problems.',                 '💯', 'TOTAL_SOLVED', 100),
  (5,  'HALFWAY',       'Halfway There',  'Solve half of the A2Z sheet.',        '🌗', 'TOTAL_SOLVED', 237),
  (6,  'COMPLETIONIST', 'Completionist',  'Solve every problem in the sheet.',   '🏆', 'TOTAL_SOLVED', 474),
  (7,  'STREAK_3',      'Warming Up',     'Keep a 3-day streak.',                '🔥', 'STREAK',       3),
  (8,  'STREAK_7',      'Week Warrior',   'Keep a 7-day streak.',                '🗓️', 'STREAK',       7),
  (9,  'STREAK_30',     'Unstoppable',    'Keep a 30-day streak.',               '🚀', 'STREAK',       30),
  (10, 'STREAK_100',    'Zero Excuses',   'Keep a 100-day streak.',              '⚡', 'STREAK',       100),
  (11, 'XP_500',        'Apprentice',     'Earn 500 XP.',                        '🌱', 'XP',           500),
  (12, 'XP_2500',       'Journeyman',     'Earn 2500 XP.',                       '🌿', 'XP',           2500),
  (13, 'XP_10000',      'Grandmaster',    'Earn 10000 XP.',                      '🌳', 'XP',           10000);

SELECT setval(pg_get_serial_sequence('badges', 'id'), (SELECT MAX(id) FROM badges));
