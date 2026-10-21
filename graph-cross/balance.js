/* balance.js : 難易度・強化上限・ステージ進行の数値を1か所に集約 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GraphBalance = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  return {
    BASE_SPEED: 220,
    MAX_SPEED: 380,
    SPEED_RAMP: 2.2,
    RAMP_TIME: 50,
    PLAYER_HALF: 12,
    HIT_DIST: 15,
    COMBO_WINDOW: 2.6,
    HEAL_COMBO: 5,
    MAX_DT: 0.05,
    MAX_EVENTS: 120,
    MAX_HP: 3,
    MAX_PLAYER_VY: 1600,
    WAVE_AMPLITUDE: 68,

    STAGE_TARGET_BASE: 6,
    STAGE_TARGET_PER_STAGE: 2,
    BOSS_BASE_HP: 7,
    BOSS_HP_PER_STAGE: 3,
    BOSS_MIN_HP: 4,
    STAGE_CLEAR_SCORE: 1000,

    UPGRADE_MAX_LIFE: 5,
    UPGRADE_MAX_HIT_BONUS: 6,
    UPGRADE_HIT_STEP: 2,
    UPGRADE_MAX_COMBO_WINDOW: 4.6,
    UPGRADE_COMBO_STEP: 0.8,
    UPGRADE_MAX_SCORE_MULT: 2,
    UPGRADE_SCORE_STEP: 0.2,
    UPGRADE_MAX_BOSS_REDUCTION: 12,
    UPGRADE_BOSS_STEP: 3,
    UPGRADE_BONUS_SCORE: 3000,

    MULTI_WINDOW: 0.55,
    MULTI_MAX: 5,
    MULTI_STEP: 0.35,

    ITEM_FIRST_DELAY: 4.5,
    ITEM_INTERVAL_MIN: 5,
    ITEM_INTERVAL_MAX: 8,
    ITEM_RADIUS: 12,
    ITEM_SCORE: 500,

    ALLY_LIFESPAN: 9,
    ALLY_MAX: 2,
    ALLY_HIT_DIST: 12,
    ALLY_BOSS_COOLDOWN: 0.8,
    ALLY_SCORE: 80
  };
});
