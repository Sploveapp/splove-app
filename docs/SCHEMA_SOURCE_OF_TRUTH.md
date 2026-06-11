# Schéma Supabase — source de vérité

> Généré par `npm run schema:check` — ne pas éditer les sections « Inventaire » à la main.
> Dernière vérification : 2026-06-11

## Rôle

Référence unique **frontend ↔ Supabase** pour tables, colonnes, RPC et vues définies dans `supabase/migrations/`.
Le build échoue si le frontend référence une table/colonne/RPC absente (`npm run schema:check`).

## Migrations obligatoires

Appliquer **toutes** les migrations dans l'ordre lexicographic :

- `000_create_profiles.sql`
- `001_create_sports_and_profile_sports.sql`
- `002_splove_plus.sql`
- `003_splove_plus_complete.sql`
- `004_profiles_profile_completed.sql`
- `005_onboarding_columns_and_sports_seed.sql`
- `006_profiles_structured_bio.sql`
- `007_reports.sql`
- `0085_create_matches.sql`
- `008_profiles_photo_verification.sql`
- `009_matches_rls.sql`
- `010_feed_profiles.sql`
- `011_onboarding_profile_photos.sql`
- `012_profiles_on_signup.sql`
- `013_profiles_portrait_fullbody_urls.sql`
- `014_profiles_avatar_url.sql`
- `0155_profiles_backfill_auth_users.sql`
- `015_main_photo_url_canonical.sql`
- `0165_main_photo_from_portrait_trigger.sql`
- `016_likes_pair_constraints.sql`
- `017_profiles_created_at.sql`
- `018_conversation_windows.sql`
- `019_activity_proposals.sql`
- `020_premium_visibility_and_boost_policies.sql`
- `021_conversation_window_extension.sql`
- `022_activity_proposals_v2.sql`
- `023_activity_proposals_single_active.sql`
- `024_create_conversations.sql`
- `025_matches_initiator_user_and_create_like_rpc.sql`
- `026_create_like_rpc_real_schema_followup.sql`
- `027_create_like_rpc_conversations_real_schema.sql`
- `028_fix_create_like_rpc_real_schema.sql`
- `029_fix_reciprocal_like_match_real_schema.sql`
- `030_fix_live_create_like_rpc.sql`
- `031_conversation_messages.sql`
- `032_create_like_rpc_liker_id_only.sql`
- `033_conversations_rls_participants.sql`
- `034_sports_catalog_matching.sql`
- `035_blocks_feed_and_safety.sql`
- `036_blocks_conversations_triggers.sql`
- `037_profiles_min_age_guard.sql`
- `038_blocks_rls_select_involved.sql`
- `039_message_body_safety_trigger.sql`
- `040_conversation_windows_allowed_first_nullable.sql`
- `041_profiles_accessibility_preferences.sql`
- `042_sports_split_walk_fitness.sql`
- `043_profile_photo_validation_statuses.sql`
- `044_profiles_premier_moment.sql`
- `045_discover_match_scoring.sql`
- `046_profiles_reliability_signals.sql`
- `047_activity_outcome_boost.sql`
- `048_discover_schema_alignment.sql`
- `049_activity_proposals_update_rls_responder.sql`
- `050_activity_proposals_pending_flow.sql`
- `051_activity_proposals_rpc_flow.sql`
- `052_activity_cancel_typing_lineage.sql`
- `053_chat_messages_activity_proposal.sql`
- `054_messages_read_at_mark_read_rpc.sql`
- `055_profiles_discovery_geolocation.sql`
- `055_sync_activity_proposal_message_metadata.sql`
- `056_messages_payload_patch_rpc.sql`
- `057_profile_location_source_and_discover_distance_rpc.sql`
- `058_photo_moderation_system.sql`
- `059_photo_moderation_auth_users_fk_feed_gate.sql`
- `060_feed_profiles_include_last_active_at.sql`
- `061_activity_proposals_mvp_chat_flow.sql`
- `062_activity_proposals_mvp_shape.sql`
- `063_onboarding_completion_flags.sql`
- `064_profiles_practice_preferences.sql`
- `065_profiles_onboarding_sports_counters.sql`
- `066_profiles_account_flags.sql`
- `067_profiles_quick_prefs.sql`
- `068_profiles_planning_style.sql`
- `070_feed_profiles_profiles_star.sql`
- `071_likes_rls_select_delete_liker_liked.sql`
- `072_profile_saved_places_discover.sql`
- `073_profiles_is_seed_demo.sql`
- `074_meetup_proposals.sql`
- `075_splove_plus_active_reliability_slots.sql`
- `076_growth_referrals_rl_session_checkins.sql`
- `077_discover_swipe_history_rewind_crossings.sql`
- `078_discover_rewind_freemium_limits.sql`
- `079_second_chance_requests.sql`
- `080_features_entitlements_purchases.sql`
- `081_second_chance_use_user_has_feature.sql`
- `082_undo_swipe_return_feature.sql`
- `083_purchase_discover_rewind_credit.sql`
- `084_pass_profile_undo_last_pass.sql`
- `085_analytics_events.sql`
- `086_analytics_events_staff_select.sql`
- `087_profiles_onboarding_ab_variant.sql`
- `088_activate_beta_undo_swipe_return_rpc.sql`
- `089_complete_referral_rpc.sql`
- `090_in_app_notifications.sql`
- `091_activity_proposals_meetup_confirmation.sql`
- `092_splove_consumables_wallet.sql`
- `093_splove_activate_feature_duration_param.sql`
- `094_profiles_open_to_adapted_activities.sql`
- `096_discover_candidate_splove_ranking_flags.sql`
- `097_create_like_rpc_block_invalid_profiles.sql`
- `098_profiles_planning_style_both.sql`
- `099_profiles_height_cm.sql`
- `100_profiles_has_children.sql`
- `101_profiles_preferred_age_range.sql`
- `102_profiles_sport_match_preference.sql`
- `103_profiles_language.sql`
- `104_profiles_city_primary_locality.sql`
- `105_activity_proposals_respond_counter_rpc_fix.sql`
- `106_splove_social_notifications.sql`
- `107_notifications_phase1_no_chat.sql`
- `108_notifications_actor_avatar_payload.sql`
- `109_schema_drift_discover_feed.sql`
- `110_profiles_schema_frontend_alignment.sql`
- `111_device_tokens.sql`
- `112_profile_views.sql`
- `113_push_notifications.sql`
- `114_profiles_rls_conversation_windows_security.sql`
- `117_push_environment_security.sql`

## Tables officielles (47)

| Table | Colonnes | Aperçu |
| --- | --- | --- |
| activity_availability | 7 | created_at, day_of_week, end_time, id, label, profile_id, start_time |
| activity_participant_outcomes | 6 | activity_done, activity_proposal_id, created_at, id, participant_id, sentiment |
| activity_proposals | 21 | boost_awarded, conversation_id, counter_of, created_at, expires_at, id, location, match_id… |
| analytics_events | 7 | created_at, event_name, id, metadata, test_name, user_id, variant |
| blocks | 4 | blocked_id, blocker_id, created_at, id |
| conversation_messages | 5 | body, conversation_id, created_at, id, sender_id |
| conversation_typing | 3 | conversation_id, updated_at, user_id |
| conversation_windows | 9 | allowed_first_sender_id, conversation_id, created_at, extended_by, extended_once, match_initiator_id, updated_at, window_expires_at… |
| conversations | 5 | created_at, id, last_reply_at, match_id, messages_count |
| credit_ledger | 9 | balance_after, created_at, credit_type, id, metadata, purchase_id, quantity_delta, reason… |
| device_tokens | 10 | active_conversation_id, active_route, created_at, id, platform, presence_updated_at, push_environment, token… |
| discover_profile_crossings | 6 | expires_at, first_seen_at, last_interaction_at, state, target_id, viewer_id |
| discover_rewind_ledger | 3 | created_at, id, user_id |
| discover_swipe_events | 7 | action, created_at, decision_time_ms, id, is_match, target_id, viewer_id |
| feature_activations | 7 | created_at, expires_at, feature_type, id, metadata, started_at, user_id |
| feature_purchases | 5 | created_at, feature_key, id, price_paid, user_id |
| features | 8 | category, created_at, description, id, is_active, key, label, updated_at |
| in_app_notification_jobs | 7 | anchor_at, created_at, id, job_type, processed_at, run_at, user_id |
| in_app_notifications | 10 | created_at, dedupe_key, exempt_daily_cap, id, kind, message, payload, read… |
| likes | 6 | created_at, from_user, id, liked_id, liker_id, to_user |
| matches | 7 | created_at, expires_at, id, initiator_user, status, user_a, user_b |
| meetup_proposals | 13 | created_at, expires_at, id, location, match_id, message, proposer_id, receiver_id… |
| messages | 10 | activity_proposal_id, body, conversation_id, created_at, id, message_type, metadata, payload… |
| moderation_staff | 1 | user_id |
| photo_moderation_results | 12 | created_at, decision_reason, id, photo_slot, provider, provider_labels, reviewed_at, reviewed_by… |
| photo_reports | 8 | comment, created_at, id, photo_slot, reason, reported_user_id, reporter_user_id, status |
| profile_boosts | 5 | created_at, ends_at, id, profile_id, starts_at |
| profile_passes | 4 | created_at, id, passed_profile_id, viewer_id |
| profile_saved_places | 3 | created_at, place_ref, profile_id |
| profile_sports | 5 | created_at, id, level, profile_id, sport_id |
| profile_verifications | 6 | created_at, id, profile_id, status, updated_at, verified_at |
| profile_views | 5 | action_taken, id, viewed_at, viewed_profile_id, viewer_id |
| profiles | 87 | accepted_privacy_at, accepted_terms_at, activity_photo_path, activity_proposals_count, available_now_until, avatar_url, beta_splove_plus_unlocked, birth_date… |
| purchases | 9 | created_at, id, metadata, platform, product_id, receipt_token, status, user_id… |
| push_send_audit_log | 15 | admin_user_id, body, created_at, errors, id, kind, payload, push_environment… |
| push_webhook_settings | 4 | functions_base_url, id, push_environment, webhook_secret |
| real_life_session_checkins | 12 | activity_proposal_id, attendance_user_a_at, attendance_user_b_at, created_at, feedback_user_a, feedback_user_b, partner_invite_dismissed_a, partner_invite_dismissed_b… |
| referral_conversions | 5 | created_at, id, referee_id, referral_code, referrer_id |
| referral_events | 5 | created_at, event_name, id, payload, user_id |
| reports | 6 | created_at, details, id, reason, reported_id, reporter_id |
| second_chance_requests | 10 | created_at, id, message, recipient_id, responded_at, result_conversation_id, result_match_id, sender_id… |
| sports | 12 | active, category, created_at, id, is_date_friendly, is_niche, is_quick_date, label… |
| subscriptions | 10 | created_at, ends_at, external_id, id, plan, profile_id, provider, started_at… |
| user_availability | 8 | created_at, day_of_week, end_time, id, label, start_time, updated_at, user_id |
| user_credits | 4 | credit_type, quantity, updated_at, user_id |
| user_engagement | 7 | created_at, proposal_accept_rate, reliability_label, reliability_score, response_rate, updated_at, user_id |
| user_entitlements | 8 | created_at, expires_at, feature_key, id, metadata, source, updated_at, user_id |

<details>
<summary>Colonnes complètes par table</summary>

### activity_availability

`created_at`, `day_of_week`, `end_time`, `id`, `label`, `profile_id`, `start_time`

### activity_participant_outcomes

`activity_done`, `activity_proposal_id`, `created_at`, `id`, `participant_id`, `sentiment`

### activity_proposals

`boost_awarded`, `conversation_id`, `counter_of`, `created_at`, `expires_at`, `id`, `location`, `match_id`, `meetup_confirmation`, `note`, `place`, `proposed_by`, `proposer_id`, `responded_at`, `responded_by`, `scheduled_at`, `sport`, `status`, `supersedes_proposal_id`, `time_slot`, `updated_at`

### analytics_events

`created_at`, `event_name`, `id`, `metadata`, `test_name`, `user_id`, `variant`

### blocks

`blocked_id`, `blocker_id`, `created_at`, `id`

### conversation_messages

`body`, `conversation_id`, `created_at`, `id`, `sender_id`

### conversation_typing

`conversation_id`, `updated_at`, `user_id`

### conversation_windows

`allowed_first_sender_id`, `conversation_id`, `created_at`, `extended_by`, `extended_once`, `match_initiator_id`, `updated_at`, `window_expires_at`, `window_opened_at`

### conversations

`created_at`, `id`, `last_reply_at`, `match_id`, `messages_count`

### credit_ledger

`balance_after`, `created_at`, `credit_type`, `id`, `metadata`, `purchase_id`, `quantity_delta`, `reason`, `user_id`

### device_tokens

`active_conversation_id`, `active_route`, `created_at`, `id`, `platform`, `presence_updated_at`, `push_environment`, `token`, `updated_at`, `user_id`

### discover_profile_crossings

`expires_at`, `first_seen_at`, `last_interaction_at`, `state`, `target_id`, `viewer_id`

### discover_rewind_ledger

`created_at`, `id`, `user_id`

### discover_swipe_events

`action`, `created_at`, `decision_time_ms`, `id`, `is_match`, `target_id`, `viewer_id`

### feature_activations

`created_at`, `expires_at`, `feature_type`, `id`, `metadata`, `started_at`, `user_id`

### feature_purchases

`created_at`, `feature_key`, `id`, `price_paid`, `user_id`

### features

`category`, `created_at`, `description`, `id`, `is_active`, `key`, `label`, `updated_at`

### in_app_notification_jobs

`anchor_at`, `created_at`, `id`, `job_type`, `processed_at`, `run_at`, `user_id`

### in_app_notifications

`created_at`, `dedupe_key`, `exempt_daily_cap`, `id`, `kind`, `message`, `payload`, `read`, `title`, `user_id`

### likes

`created_at`, `from_user`, `id`, `liked_id`, `liker_id`, `to_user`

### matches

`created_at`, `expires_at`, `id`, `initiator_user`, `status`, `user_a`, `user_b`

### meetup_proposals

`created_at`, `expires_at`, `id`, `location`, `match_id`, `message`, `proposer_id`, `receiver_id`, `responded_at`, `scheduled_at`, `sport`, `status`, `updated_at`

### messages

`activity_proposal_id`, `body`, `conversation_id`, `created_at`, `id`, `message_type`, `metadata`, `payload`, `read_at`, `sender_id`

### moderation_staff

`user_id`

### photo_moderation_results

`created_at`, `decision_reason`, `id`, `photo_slot`, `provider`, `provider_labels`, `reviewed_at`, `reviewed_by`, `risk_score`, `status`, `storage_path`, `user_id`

### photo_reports

`comment`, `created_at`, `id`, `photo_slot`, `reason`, `reported_user_id`, `reporter_user_id`, `status`

### profile_boosts

`created_at`, `ends_at`, `id`, `profile_id`, `starts_at`

### profile_passes

`created_at`, `id`, `passed_profile_id`, `viewer_id`

### profile_saved_places

`created_at`, `place_ref`, `profile_id`

### profile_sports

`created_at`, `id`, `level`, `profile_id`, `sport_id`

### profile_verifications

`created_at`, `id`, `profile_id`, `status`, `updated_at`, `verified_at`

### profile_views

`action_taken`, `id`, `viewed_at`, `viewed_profile_id`, `viewer_id`

### profiles

`accepted_privacy_at`, `accepted_terms_at`, `activity_photo_path`, `activity_proposals_count`, `available_now_until`, `avatar_url`, `beta_splove_plus_unlocked`, `birth_date`, `body_photo_status`, `body_rejection_code`, `boost_credits`, `boost_score`, `city`, `created_at`, `discovery_radius_km`, `first_name`, `fullbody_path`, `fullbody_url`, `gender`, `has_children`, `height_cm`, `id`, `identity_verified`, `intent`, `is_active`, `is_active_mode`, `is_paused`, `is_photo_verified`, `is_seed_demo`, `is_under_review`, `language`, `last_active_at`, `last_reply_at`, `latitude`, `location_source`, `location_updated_at`, `longitude`, `looking_for`, `main_photo_url`, `meet_pref`, `meet_vibe`, `messages_count`, `moderation_strikes_count`, `needs_adapted_activities`, `onboarding_completed`, `onboarding_done`, `onboarding_sports_count`, `onboarding_sports_with_level_count`, `onboarding_variant`, `open_to_adapted_activities`, `passport_city`, `photo1_status`, `photo2_path`, `photo2_status`, `photo_moderation_overall`, `photo_status`, `photo_verification_provider`, `photo_verification_session_id`, `photo_verification_status`, `photo_verification_updated_at`, `planning_style`, `portrait_path`, `portrait_photo_status`, `portrait_rejection_code`, `portrait_url`, `practice_preferences`, `pref_open_to_adapted_activity`, `pref_open_to_standard_activity`, `preferred_age_max`, `preferred_age_min`, `premier_moment`, `profile_completed`, `referral_code`, `referral_plus_until`, `referred_by_user_id`, `rewind_credits`, `second_chance_credits`, `sport_feeling`, `sport_intensity`, `sport_match_preference`, `sport_motivation`, `sport_phrase`, `sport_practice_type`, `sport_time`, `undo_swipe_credits`, `updated_at`, `veriff_status`

### purchases

`created_at`, `id`, `metadata`, `platform`, `product_id`, `receipt_token`, `status`, `user_id`, `verified_at`

### push_send_audit_log

`admin_user_id`, `body`, `created_at`, `errors`, `id`, `kind`, `payload`, `push_environment`, `recipient_count`, `recipient_user_id`, `route`, `sent_count`, `skipped_count`, `title`, `trigger_source`

### push_webhook_settings

`functions_base_url`, `id`, `push_environment`, `webhook_secret`

### real_life_session_checkins

`activity_proposal_id`, `attendance_user_a_at`, `attendance_user_b_at`, `created_at`, `feedback_user_a`, `feedback_user_b`, `partner_invite_dismissed_a`, `partner_invite_dismissed_b`, `session_completed_at`, `session_reported_by_user_a_at`, `session_reported_by_user_b_at`, `updated_at`

### referral_conversions

`created_at`, `id`, `referee_id`, `referral_code`, `referrer_id`

### referral_events

`created_at`, `event_name`, `id`, `payload`, `user_id`

### reports

`created_at`, `details`, `id`, `reason`, `reported_id`, `reporter_id`

### second_chance_requests

`created_at`, `id`, `message`, `recipient_id`, `responded_at`, `result_conversation_id`, `result_match_id`, `sender_id`, `status`, `updated_at`

### sports

`active`, `category`, `created_at`, `id`, `is_date_friendly`, `is_niche`, `is_quick_date`, `label`, `name`, `requires_equipment`, `requires_specific_location`, `slug`

### subscriptions

`created_at`, `ends_at`, `external_id`, `id`, `plan`, `profile_id`, `provider`, `started_at`, `status`, `updated_at`

### user_availability

`created_at`, `day_of_week`, `end_time`, `id`, `label`, `start_time`, `updated_at`, `user_id`

### user_credits

`credit_type`, `quantity`, `updated_at`, `user_id`

### user_engagement

`created_at`, `proposal_accept_rate`, `reliability_label`, `reliability_score`, `response_rate`, `updated_at`, `user_id`

### user_entitlements

`created_at`, `expires_at`, `feature_key`, `id`, `metadata`, `source`, `updated_at`, `user_id`


</details>

## Vues officielles (3)

| Vue | Type | Colonnes |
| --- | --- | --- |
| feed_profiles | view | id, passport_city, available_now_until, profile_completed, birth_date, gender, looking_for, intent, needs_adapted_activities, sport_time, sport_motivation, sport_phrase, is_photo_verified, photo_verification_status, photo_verification_provider, photo_verification_session_id, photo_verification_updated_at, main_photo_url, fullbody_url, portrait_url, avatar_url, created_at, pref_open_to_standard_activity, pref_open_to_adapted_activity, portrait_photo_status, body_photo_status, portrait_rejection_code, body_rejection_code, premier_moment, last_active_at, activity_proposals_count, last_reply_at, messages_count, boost_score, city, latitude, longitude, discovery_radius_km, location_updated_at, location_source, photo1_status, photo2_status, photo_moderation_overall, is_under_review, moderation_strikes_count, onboarding_completed, onboarding_done, practice_preferences, onboarding_sports_count, onboarding_sports_with_level_count, is_paused, is_active, sport_intensity, meet_vibe, planning_style, is_seed_demo, is_active_mode, referral_code, referred_by_user_id, rewind_credits, referral_plus_until, second_chance_credits, undo_swipe_credits, onboarding_variant, boost_credits, beta_splove_plus_unlocked, open_to_adapted_activities, height_cm, has_children, preferred_age_min, preferred_age_max, sport_match_preference, language, activity_photo_path, first_name, updated_at, sport_practice_type, meet_pref, sport_feeling, accepted_terms_at, accepted_privacy_at, photo2_path, portrait_path, fullbody_path, identity_verified, veriff_status, photo_status |
| feed_profiles_ranked | view | id, passport_city, available_now_until, profile_completed, birth_date, gender, looking_for, intent, needs_adapted_activities, sport_time, sport_motivation, sport_phrase, is_photo_verified, photo_verification_status, photo_verification_provider, photo_verification_session_id, photo_verification_updated_at, main_photo_url, fullbody_url, portrait_url, avatar_url, created_at, pref_open_to_standard_activity, pref_open_to_adapted_activity, portrait_photo_status, body_photo_status, portrait_rejection_code, body_rejection_code, premier_moment, last_active_at, activity_proposals_count, last_reply_at, messages_count, boost_score, city, latitude, longitude, discovery_radius_km, location_updated_at, location_source, photo1_status, photo2_status, photo_moderation_overall, is_under_review, moderation_strikes_count, onboarding_completed, onboarding_done, practice_preferences, onboarding_sports_count, onboarding_sports_with_level_count, is_paused, is_active, sport_intensity, meet_vibe, planning_style, is_seed_demo, is_active_mode, referral_code, referred_by_user_id, rewind_credits, referral_plus_until, second_chance_credits, undo_swipe_credits, onboarding_variant, boost_credits, beta_splove_plus_unlocked, open_to_adapted_activities, height_cm, has_children, preferred_age_min, preferred_age_max, sport_match_preference, language, activity_photo_path, first_name, updated_at, sport_practice_type, meet_pref, sport_feeling, accepted_terms_at, accepted_privacy_at, photo2_path, portrait_path, fullbody_path, identity_verified, veriff_status, photo_status |
| my_meetups | view | profiles.* |

## RPC officielles (81)

| Fonction | Frontend | Fichiers |
| --- | --- | --- |
| _splove_credit_apply_delta | — |  |
| activate_beta_undo_swipe_return | — |  |
| apply_mutual_positive_boost | — |  |
| bump_profile_activity_proposals_count | — |  |
| cancel_activity_proposal | oui | src/lib/messages/activityProposalMutations.ts |
| claim_referral_invite | — |  |
| complete_referral | oui | src/services/referral.service.ts |
| conversation_match_blocked | — |  |
| create_activity_proposal | oui | src/lib/messages/activityProposalMutations.ts, src/pages/Match.tsx |
| create_like_and_get_result | oui | src/pages/Discover.tsx, src/pages/LikesYou.tsx |
| create_second_chance_request | oui | src/services/secondChance.service.ts |
| discover_candidate_splove_ranking_flags | oui | src/pages/Discover.tsx |
| discover_shared_place_flags | oui | src/pages/Discover.tsx |
| discover_user_has_splove_plus | — |  |
| enforce_conversations_match_not_blocked | — |  |
| enforce_likes_no_block_legacy | — |  |
| enforce_likes_no_block_liker | — |  |
| enforce_matches_no_block | — |  |
| enforce_meetup_proposals_integrity | — |  |
| enforce_message_body_safety | — |  |
| enforce_messages_no_active_block | — |  |
| ensure_profile_referral_code | — |  |
| generate_referral_code_raw | — |  |
| get_discover_feed_alive | oui | src/lib/discoverFeedFetch.ts |
| get_discover_rewind_status | — |  |
| handle_new_user | — |  |
| in_app_try_insert_notification | — |  |
| is_blocked_with | oui | src/services/blocks.service.ts |
| is_conversation_participant | — |  |
| list_user_ids_blocked_with_me | oui | src/services/blocks.service.ts |
| mark_all_in_app_notifications_read | oui | src/services/inAppNotifications.service.ts |
| mark_conversation_messages_read | oui | src/pages/Chat.tsx |
| match_has_blocked_pair | — |  |
| matches_fill_initiator_user | — |  |
| moderation_resolve_photo_result | oui | src/services/photoModerationAdmin.service.ts |
| pass_profile | oui | src/pages/Discover.tsx |
| patch_activity_proposal_source_message_payload | oui | src/lib/messages/activityProposalMutations.ts |
| process_in_app_notification_jobs_for | — |  |
| profile_distances_from_viewer | — |  |
| profile_pair_is_blocked | — |  |


_… et 41 autres fonctions (triggers, internes)._

## Colonnes deprecated / legacy

| Table | Colonne | Note |
| --- | --- | --- |
| activity_proposals | slot_label | DROP COLUMN migration |
| matches | conversation_id | frontend legacy — ne pas ajouter en SQL |
| feed_profiles_ranked | profile_id | frontend legacy — ne pas ajouter en SQL |
| feed_profiles | profile_id | frontend legacy — ne pas ajouter en SQL |
| profiles | photo_status | frontend legacy — ne pas ajouter en SQL |
| activity_proposals | reminder_6h_sent | frontend legacy — ne pas ajouter en SQL |
| activity_proposals | reminder_18h_sent | frontend legacy — ne pas ajouter en SQL |
| activity_proposals | expired_notified | frontend legacy — ne pas ajouter en SQL |
| activity_proposals | match_id | frontend legacy — ne pas ajouter en SQL |
| sports | is_featured | frontend legacy — ne pas ajouter en SQL |
| messages | response | frontend legacy — ne pas ajouter en SQL |
| matches | conversation_id | absent — utiliser conversations.match_id |

## Frontend consumers (extrait)

| Table | Colonne | Fichiers |
| --- | --- | --- |
| activity_participant_outcomes | activity_done | src/pages/Chat.tsx |
| activity_participant_outcomes | activity_proposal_id | src/pages/Chat.tsx |
| activity_participant_outcomes | participant_id | src/pages/Chat.tsx |
| activity_participant_outcomes | sentiment | src/pages/Chat.tsx |
| activity_proposals | conversation_id | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | counter_of | src/lib/messages/activityProposalMutations.ts |
| activity_proposals | created_at | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | expired_notified | src/lib/activityProposalsQuery.ts |
| activity_proposals | expires_at | src/lib/activityProposalsQuery.ts |
| activity_proposals | id | src/lib/activityProposalPendingAction.ts; src/lib/messages/activityProposalMutations.ts; src/pages/Match.tsx |
| activity_proposals | location | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | match_id | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | meetup_confirmation | src/services/meetupConfirmation.service.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | note | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | place | src/lib/messages/activityProposalMutations.ts |
| activity_proposals | proposer_id | src/lib/activityProposalPendingAction.ts; src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | reminder_18h_sent | src/lib/activityProposalsQuery.ts |
| activity_proposals | reminder_6h_sent | src/lib/activityProposalsQuery.ts |
| activity_proposals | responded_at | src/services/activityProposals.service.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | scheduled_at | src/lib/messages/activityProposalMutations.ts |
| activity_proposals | sport | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | status | src/lib/activityProposalPendingAction.ts; src/lib/messages/activityProposalMutations.ts; src/services/activityProposals.service.ts |
| activity_proposals | supersedes_proposal_id | src/lib/messages/activityProposalMutations.ts |
| activity_proposals | time_slot | src/lib/messages/activityProposalMutations.ts; src/lib/activityProposalsQuery.ts |
| activity_proposals | updated_at | src/lib/activityProposalsQuery.ts |
| analytics_events | created_at | src/pages/Analytics.tsx |
| analytics_events | event_name | src/lib/analytics.ts; src/pages/Analytics.tsx |
| analytics_events | id | src/pages/Analytics.tsx |
| analytics_events | metadata | src/pages/Analytics.tsx |
| analytics_events | test_name | src/lib/analytics.ts; src/pages/Analytics.tsx |
| analytics_events | user_id | src/lib/analytics.ts; src/pages/Analytics.tsx |
| analytics_events | variant | src/lib/analytics.ts; src/pages/Analytics.tsx |
| blocks | blocked_id | src/pages/Discover.tsx; src/services/blocks.service.ts |
| blocks | blocker_id | src/pages/Discover.tsx; src/services/blocks.service.ts |
| conversation_typing | conversation_id | src/pages/Chat.tsx |
| conversation_typing | updated_at | src/pages/Chat.tsx |
| conversation_typing | user_id | src/pages/Chat.tsx |
| conversation_windows | allowed_first_sender_id | src/lib/ensureConversationWindow.ts |
| conversation_windows | conversation_id | src/lib/ensureConversationWindow.ts |
| conversation_windows | match_initiator_id | src/lib/ensureConversationWindow.ts |
| conversation_windows | window_expires_at | src/lib/ensureConversationWindow.ts; src/pages/Chat.tsx |
| conversations | created_at | src/pages/Messages.tsx |
| conversations | id | src/components/AppLayout.tsx; src/lib/matchConversationId.ts; src/pages/Chat.tsx |
| conversations | match_id | src/lib/ensureConversationWindow.ts; src/lib/matchPairPracticeTypes.ts; src/pages/Chat.tsx |
| device_tokens | active_conversation_id | src/services/deviceTokens.service.ts |
| device_tokens | active_route | src/services/deviceTokens.service.ts |
| device_tokens | id | src/services/deviceTokens.service.ts |
| device_tokens | presence_updated_at | src/services/deviceTokens.service.ts |
| device_tokens | push_environment | src/services/deviceTokens.service.ts |
| device_tokens | token | src/services/deviceTokens.service.ts |
| device_tokens | updated_at | src/services/deviceTokens.service.ts |
| device_tokens | user_id | src/services/deviceTokens.service.ts |
| discover_profile_crossings | expires_at | src/services/discoverSwipes.service.ts |
| discover_profile_crossings | last_interaction_at | src/services/discoverSwipes.service.ts |
| discover_profile_crossings | state | src/services/discoverSwipes.service.ts |
| discover_profile_crossings | target_id | src/services/discoverSwipes.service.ts |
| feature_activations | expires_at | src/components/splovePlus/SplovePlusScreen.tsx |
| feature_activations | feature_type | src/components/splovePlus/SplovePlusScreen.tsx |
| feature_purchases | created_at | src/services/features.service.ts |
| feature_purchases | feature_key | src/services/features.service.ts |


_… et 183 autres accès._

## Allowlists (exceptions documentées)

| Type | Nom | Raison |
|------|-----|--------|
| colonne | matches.conversation_id | Résolu via `conversations.match_id` |
| RPC | touch_profile_activity | Optionnel Discover ; peut être hors repo |

## Drift actuel

_Aucun drift détecté lors de la dernière génération._

## Commandes

```bash
npm run schema:check   # régénère ce doc + fail si drift
npm run build          # inclut schema:check avant tsc
```
