/**
 * Database types for the Supabase client.
 *
 * Hand-maintained to match supabase/migrations, with the CHECK-constrained
 * text columns (category, visibility, status, interests…) narrowed to string
 * unions so the UI gets exhaustive typing. When a migration changes the
 * schema, compare with
 *   npx supabase gen types typescript --local
 * and update this file by hand (don't overwrite it: the generator widens those
 * columns to plain `string`).
 */
import type { Interest, TravelStyle } from "@/lib/onboarding";

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type GoalCategory =
  | "travel"
  | "adventure"
  | "nature"
  | "learning"
  | "creative"
  | "food"
  | "giving_back"
  | "personal_growth"
  | "culture"
  | "sport"
  | "social"
  | "other";
export type GoalRegion =
  | "africa"
  | "asia"
  | "europe"
  | "middle_east"
  | "north_america"
  | "central_america_caribbean"
  | "south_america"
  | "oceania"
  | "antarctica";
export type Season = "dec_feb" | "mar_may" | "jun_aug" | "sep_nov";
export type ExploreSort = "popular" | "trending" | "near";
export type BucketVisibility = "public" | "buddies" | "private";
export type BucketStatus = "dreaming" | "planning" | "done";
export type BucketTimeframe = "this_year" | "one_to_three_years" | "someday";
export type BucketFlexibility = "fixed" | "flexible" | "very_flexible";
/** Rough budget in US dollars. */
export type BucketBudget = "under_500" | "500_2000" | "2000_5000" | "over_5000";
export type GoalStatus = "pending" | "active" | "merged" | "rejected";
/** How add_bucket_item() linked the item to a goal. */
export type GoalMatch = "chosen" | "exact" | "fuzzy" | "new";
export type MatchRequestStatus = "pending" | "accepted" | "declined" | "cancelled";
export type GroupStatus = "forming" | "planning" | "confirmed" | "completed";
export type GroupJoinPolicy = "open" | "request";
export type ChecklistCategory = "visa" | "gear" | "booking" | "other";
export type ReportReason = "spam" | "harassment" | "hate" | "inappropriate" | "scam" | "safety" | "underage" | "other";
export type ReportTargetType = "user" | "message" | "story" | "comment" | "group";
export type ReportStatus = "open" | "actioned" | "dismissed";
export type ModerationAction = "dismiss" | "warn" | "remove" | "suspend" | "unsuspend";
export type LocationPrecision = "standard" | "approximate";
export type ReactionKind = "love" | "fire" | "inspired" | "congrats";
export type FeedReason = "follow" | "group" | "on_list" | "new_group" | "trending";
export type BadgeSlug =
  | "first_dream"
  | "big_dreamer"
  | "doer"
  | "unstoppable"
  | "first_group"
  | "team_player"
  | "storyteller"
  | "globetrotter"
  | "polyglot";

export const REACTION_KINDS: readonly ReactionKind[] = ["love", "fire", "inspired", "congrats"];

export const GROUP_STATUSES: readonly GroupStatus[] = ["forming", "planning", "confirmed", "completed"];
export const CHECKLIST_CATEGORIES: readonly ChecklistCategory[] = ["visa", "gear", "booking", "other"];
export const REPORT_REASONS: readonly ReportReason[] = ["spam", "scam", "harassment", "hate", "inappropriate", "safety", "underage", "other"];
export const REPORT_TARGET_TYPES: readonly ReportTargetType[] = ["user", "message", "story", "comment", "group"];

/** Browsable categories, in display order ("other" holds unreviewed goals). */
export const GOAL_CATEGORIES: readonly GoalCategory[] = [
  "travel",
  "adventure",
  "nature",
  "learning",
  "creative",
  "food",
  "giving_back",
  "personal_growth",
  "culture",
  "sport",
  "social",
];
export const GOAL_REGIONS: readonly GoalRegion[] = [
  "africa",
  "asia",
  "europe",
  "middle_east",
  "north_america",
  "central_america_caribbean",
  "south_america",
  "oceania",
  "antarctica",
];
export const SEASONS: readonly Season[] = ["dec_feb", "mar_may", "jun_aug", "sep_nov"];
export const EXPLORE_SORTS: readonly ExploreSort[] = ["popular", "trending", "near"];
export const BUCKET_VISIBILITIES: readonly BucketVisibility[] = ["public", "buddies", "private"];
export const BUCKET_STATUSES: readonly BucketStatus[] = ["dreaming", "planning", "done"];
export const BUCKET_TIMEFRAMES: readonly BucketTimeframe[] = ["this_year", "one_to_three_years", "someday"];
export const BUCKET_FLEXIBILITIES: readonly BucketFlexibility[] = ["fixed", "flexible", "very_flexible"];
export const BUCKET_BUDGETS: readonly BucketBudget[] = ["under_500", "500_2000", "2000_5000", "over_5000"];

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  home_city: string | null;
  home_country: string | null;
  locale: string;
  languages: string[];
  interests: Interest[];
  travel_styles: TravelStyle[];
  /** Set only by the confirm_adult() RPC. */
  adult_confirmed_at: string | null;
  /** Set only by the complete_onboarding() RPC. */
  onboarded_at: string | null;
  /** Mirrors Supabase Auth's phone confirmation (migration 0009). The number itself stays in auth. */
  phone_verified_at: string | null;
  /** Set only by the ID verification provider hook (service role). */
  id_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Columns clients may write (the rest are RPC-only; see migration 0003). */
type ProfileWritable = Partial<
  Pick<
    ProfileRow,
    | "username"
    | "display_name"
    | "bio"
    | "avatar_url"
    | "home_city"
    | "home_country"
    | "locale"
    | "languages"
    | "interests"
    | "travel_styles"
  >
>;

type BucketItemRow = {
  id: string;
  owner_id: string;
  goal_id: string;
  title: string;
  description: string | null;
  visibility: BucketVisibility;
  status: BucketStatus;
  timeframe: BucketTimeframe;
  flexibility: BucketFlexibility;
  budget: BucketBudget | null;
  place_name: string | null;
  place_country: string | null;
  target_date: string | null;
  locale: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** The story that inspired this item ("Add to my bucket list" on a story). */
  source_story_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileWritable & { id: string };
        Update: ProfileWritable;
        Relationships: [];
      };
      profile_locations: {
        // `location` is an approximate PostGIS point; it is never selected by the app.
        Row: { user_id: string; location: unknown; updated_at: string };
        Insert: { user_id: string; location: unknown };
        Update: { location?: unknown };
        Relationships: [];
      };
      bucket_items: {
        Row: BucketItemRow;
        // Items are created only through the add_bucket_item() RPC.
        Insert: never;
        Update: Partial<
          Pick<
            BucketItemRow,
            | "title"
            | "description"
            | "visibility"
            | "status"
            | "place_name"
            | "place_country"
            | "target_date"
            | "timeframe"
            | "flexibility"
            | "budget"
          >
        >;
        Relationships: [
          {
            foreignKeyName: "bucket_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bucket_items_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
        ];
      };
      goals: {
        Row: {
          id: string;
          slug: string;
          category_slug: GoalCategory;
          default_locale: string;
          status: GoalStatus;
          merged_into_id: string | null;
          place_name: string | null;
          place_country: string | null;
          region: GoalRegion | null;
          best_months: number[] | null;
          photo_url: string | null;
          photo_credit: string | null;
          featured_rank: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      follows: {
        Row: { follower_id: string; followee_id: string; created_at: string };
        Insert: { follower_id: string; followee_id: string };
        Update: never;
        Relationships: [];
      };
      // Writes go through block_user / unblock_user; you can only read your own blocks.
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Writes go through create_group / update_group / set_group_status.
      groups: {
        Row: {
          id: string;
          goal_id: string;
          owner_id: string;
          name: string;
          description: string | null;
          max_size: number;
          join_policy: GroupJoinPolicy;
          status: GroupStatus;
          member_count: number;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [
          { foreignKeyName: "groups_goal_id_fkey"; columns: ["goal_id"]; isOneToOne: false; referencedRelation: "goals"; referencedColumns: ["id"] },
          { foreignKeyName: "groups_owner_id_fkey"; columns: ["owner_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ];
      };
      // Writes go through join_group / leave_group / mark_group_read and friends.
      group_members: {
        Row: {
          group_id: string;
          user_id: string;
          role: "owner" | "member";
          joined_at: string;
          last_read_at: string;
          story_prompt: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: "group_members_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      group_join_requests: {
        Row: {
          id: string;
          group_id: string;
          user_id: string;
          note: string | null;
          status: MatchRequestStatus;
          created_at: string;
          responded_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: "group_join_requests_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      group_plans: {
        Row: {
          group_id: string;
          location_text: string | null;
          budget_amount: number | null;
          budget_currency: string;
          notes: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      group_date_options: {
        Row: { id: string; group_id: string; proposed_by: string; starts_on: string; ends_on: string; created_at: string };
        Insert: { group_id: string; starts_on: string; ends_on: string };
        Update: never;
        Relationships: [{ foreignKeyName: "group_date_options_proposed_by_fkey"; columns: ["proposed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      group_date_votes: {
        Row: { option_id: string; user_id: string; created_at: string };
        Insert: { option_id: string };
        Update: never;
        Relationships: [{ foreignKeyName: "group_date_votes_option_id_fkey"; columns: ["option_id"]; isOneToOne: false; referencedRelation: "group_date_options"; referencedColumns: ["id"] }, { foreignKeyName: "group_date_votes_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      group_checklist_items: {
        Row: {
          id: string;
          group_id: string;
          title: string;
          category: ChecklistCategory;
          done: boolean;
          done_by: string | null;
          done_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: { group_id: string; title: string; category?: ChecklistCategory };
        // done_by / done_at are stamped by a trigger.
        Update: { title?: string; category?: ChecklistCategory; done?: boolean };
        Relationships: [];
      };
      group_messages: {
        Row: {
          id: string;
          group_id: string;
          sender_id: string;
          body: string | null;
          image_path: string | null;
          created_at: string;
          hidden_at: string | null;
        };
        Insert: { group_id: string; body?: string | null; image_path?: string | null };
        Update: never;
        Relationships: [{ foreignKeyName: "group_messages_sender_id_fkey"; columns: ["sender_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      // Written through create_story().
      stories: {
        Row: {
          id: string;
          author_id: string;
          goal_id: string;
          group_id: string | null;
          body: string;
          place: string | null;
          photo_urls: string[];
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [{ foreignKeyName: "stories_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      story_tags: {
        Row: { story_id: string; user_id: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      story_reactions: {
        Row: { story_id: string; user_id: string; kind: ReactionKind; created_at: string };
        Insert: { story_id: string; kind: ReactionKind };
        Update: never;
        Relationships: [];
      };
      story_comments: {
        Row: { id: string; story_id: string; author_id: string; body: string; created_at: string };
        Insert: { story_id: string; body: string };
        Update: never;
        Relationships: [{ foreignKeyName: "story_comments_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }];
      };
      user_badges: {
        Row: { user_id: string; badge: BadgeSlug; seen_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Owner-only. Writes go through update_privacy_settings / acknowledge_safety_tips.
      profile_settings: {
        Row: { user_id: string; hide_from_matching: boolean; location_precision: LocationPrecision; safety_tips_seen_at: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      account_status: {
        Row: { user_id: string; suspended_until: string | null; reason: string | null; updated_at: string };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      user_warnings: {
        Row: { id: string; user_id: string; moderator_id: string | null; message: string; created_at: string; acknowledged_at: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Reporters see their own; moderators see all. Writes go through report_content.
      reports: {
        Row: {
          id: string;
          reporter_id: string | null;
          target_type: ReportTargetType;
          target_id: string;
          target_user_id: string | null;
          reason: ReportReason | "auto";
          details: string | null;
          status: ReportStatus;
          created_at: string;
          resolved_at: string | null;
          resolved_by: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: string;
          moderator_id: string | null;
          action: ModerationAction;
          target_type: ReportTargetType;
          target_id: string;
          target_user_id: string | null;
          note: string | null;
          snapshot: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      plan_shares: {
        Row: { id: string; group_id: string; user_id: string; contact_name: string; created_at: string; expires_at: string; revoked_at: string | null };
        Insert: never;
        Update: never;
        Relationships: [];
      };
      // Writes go through send_match_request / respond_match_request.
      match_requests: {
        Row: {
          id: string;
          goal_id: string;
          sender_id: string;
          recipient_id: string;
          sender_item_id: string | null;
          recipient_item_id: string | null;
          note: string | null;
          status: MatchRequestStatus;
          created_at: string;
          responded_at: string | null;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_my_location: { Args: { lat: number; lng: number }; Returns: undefined };
      has_my_location: { Args: Record<string, never>; Returns: boolean };
      confirm_adult: { Args: Record<string, never>; Returns: undefined };
      complete_onboarding: { Args: Record<string, never>; Returns: undefined };
      add_bucket_item: {
        Args: {
          p_title: string;
          p_goal_id?: string | null;
          p_visibility?: BucketVisibility;
          p_locale?: string;
          p_timeframe?: BucketTimeframe;
          p_flexibility?: BucketFlexibility;
          p_budget?: BucketBudget | null;
        };
        Returns: { item_id: string; goal_id: string; match: GoalMatch }[];
      };
      search_goals: {
        Args: { p_query?: string; p_locale?: string; p_limit?: number };
        Returns: { goal_id: string; slug: string; title: string; category_slug: GoalCategory; wanted_count: number }[];
      };
      explore_goals: {
        Args: {
          p_locale?: string;
          p_category?: GoalCategory | null;
          p_region?: GoalRegion | null;
          p_season?: Season | null;
          p_sort?: ExploreSort;
          p_limit?: number;
          p_offset?: number;
          p_radius_km?: number;
        };
        Returns: {
          goal_id: string;
          slug: string;
          title: string;
          category_slug: GoalCategory;
          region: GoalRegion | null;
          place_name: string | null;
          place_country: string | null;
          photo_url: string | null;
          wanted_count: number;
          done_count: number;
          recent_count: number;
          distance_km: number | null;
        }[];
      };
      goal_details: {
        Args: { p_slug: string; p_locale?: string };
        Returns: {
          goal_id: string;
          slug: string;
          status: GoalStatus;
          merged_into_slug: string | null;
          title: string;
          description: string | null;
          category_slug: GoalCategory;
          region: GoalRegion | null;
          place_name: string | null;
          place_country: string | null;
          best_months: number[] | null;
          photo_url: string | null;
          photo_credit: string | null;
          wanted_count: number;
          done_count: number;
          my_item_id: string | null;
        }[];
      };
      goal_counts: {
        Args: { p_goal_id: string };
        Returns: { wanted_count: number; done_count: number; recent_count: number }[];
      };
      find_matches: {
        Args: { p_item_id: string; p_config?: Json; p_limit?: number };
        Returns: {
          profile_id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          home_city: string | null;
          home_country: string | null;
          their_item_id: string;
          their_timeframe: BucketTimeframe;
          their_budget: BucketBudget | null;
          score: number;
          timeframe_score: number;
          distance_score: number;
          language_score: number;
          style_score: number;
          budget_score: number;
          recency_score: number;
          /** Rounded; 25 means "under 25 km". Null when either person has no location. */
          distance_km: number | null;
          is_worldwide: boolean;
          shared_languages: string[];
          shared_styles: string[];
          active_within: "week" | "month" | "older";
          request_id: string | null;
          request_status: MatchRequestStatus | null;
          request_direction: "sent" | "received" | null;
        }[];
      };
      send_match_request: {
        Args: { p_my_item_id: string; p_their_item_id: string; p_note?: string | null };
        Returns: string;
      };
      respond_match_request: { Args: { p_request_id: string; p_accept: boolean }; Returns: undefined };
      my_match_requests: {
        Args: { p_locale?: string };
        Returns: {
          id: string;
          direction: "sent" | "received";
          status: MatchRequestStatus;
          note: string | null;
          created_at: string;
          goal_slug: string;
          goal_title: string;
          other_id: string;
          other_username: string | null;
          other_display_name: string | null;
          other_avatar_url: string | null;
        }[];
      };
      block_user: { Args: { p_user_id: string }; Returns: undefined };
      unblock_user: { Args: { p_user_id: string }; Returns: undefined };
      create_group: {
        Args: { p_goal_id: string; p_name: string; p_description?: string | null; p_max_size?: number; p_join_policy?: GroupJoinPolicy };
        Returns: string;
      };
      join_group: { Args: { p_group_id: string; p_note?: string | null }; Returns: "joined" | "requested" };
      cancel_join_request: { Args: { p_group_id: string }; Returns: undefined };
      respond_join_request: { Args: { p_request_id: string; p_accept: boolean }; Returns: undefined };
      leave_group: { Args: { p_group_id: string }; Returns: undefined };
      remove_group_member: { Args: { p_group_id: string; p_user_id: string }; Returns: undefined };
      update_group: {
        Args: { p_group_id: string; p_name: string; p_description: string | null; p_max_size: number; p_join_policy: GroupJoinPolicy };
        Returns: undefined;
      };
      update_group_plan: {
        Args: { p_group_id: string; p_location: string | null; p_budget_amount: number | null; p_budget_currency: string; p_notes?: string | null };
        Returns: undefined;
      };
      set_group_status: { Args: { p_group_id: string; p_status: GroupStatus }; Returns: undefined };
      dismiss_story_prompt: { Args: { p_group_id: string }; Returns: undefined };
      mark_group_read: { Args: { p_group_id: string }; Returns: undefined };
      is_group_member: { Args: { p_group_id: string }; Returns: boolean };
      goal_groups: {
        Args: { p_goal_id: string };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          status: GroupStatus;
          join_policy: GroupJoinPolicy;
          member_count: number;
          max_size: number;
          owner_display_name: string | null;
          owner_username: string | null;
          is_member: boolean;
          request_pending: boolean;
        }[];
      };
      my_groups: {
        Args: { p_locale?: string };
        Returns: {
          id: string;
          name: string;
          status: GroupStatus;
          member_count: number;
          max_size: number;
          goal_slug: string;
          goal_title: string;
          unread_count: number;
          story_prompt: boolean;
          pending_requests: number;
        }[];
      };
      follow_counts: {
        Args: { p_profile_id: string };
        Returns: { followers: number; following: number; i_follow: boolean }[];
      };
      add_goal_from_story: { Args: { p_story_id: string }; Returns: string };
      create_story: {
        Args: {
          p_goal_id: string;
          p_body: string;
          p_group_id?: string | null;
          p_place?: string | null;
          p_photo_urls?: string[];
          p_tagged?: string[];
        };
        Returns: string;
      };
      story_cards: {
        Args: { p_ids: string[]; p_locale?: string };
        Returns: {
          id: string;
          body: string;
          place: string | null;
          photo_urls: string[];
          created_at: string;
          author_id: string;
          author_username: string | null;
          author_display_name: string | null;
          author_avatar_url: string | null;
          goal_id: string;
          goal_slug: string;
          goal_title: string;
          group_id: string | null;
          group_name: string | null;
          tagged: { username: string | null; name: string | null }[];
          reactions: Partial<Record<ReactionKind, number>>;
          my_reactions: ReactionKind[];
          comment_count: number;
          inspired_count: number;
          on_my_list: boolean;
        }[];
      };
      home_feed: {
        Args: { p_config?: Json; p_limit?: number };
        Returns: {
          kind: "story" | "new_group" | "trending_goal";
          score: number;
          reason: FeedReason;
          reason_label: string | null;
          story_id: string | null;
          group_id: string | null;
          goal_id: string | null;
          trending_count: number | null;
        }[];
      };
      badges_for: { Args: { p_profile_id: string }; Returns: { badge: BadgeSlug }[] };
      new_badges: { Args: Record<string, never>; Returns: { badge: BadgeSlug }[] };
      mark_badges_seen: { Args: Record<string, never>; Returns: undefined };
      are_buddies: { Args: { a: string; b: string }; Returns: boolean };
      goal_title: { Args: { p_goal_id: string; p_locale: string }; Returns: string };
      update_privacy_settings: { Args: { p_hide_from_matching: boolean; p_approximate_location: boolean }; Returns: undefined };
      is_moderator: { Args: Record<string, never>; Returns: boolean };
      acknowledge_safety_tips: { Args: Record<string, never>; Returns: undefined };
      acknowledge_warning: { Args: { p_warning_id: string }; Returns: undefined };
      my_account_notices: {
        Args: Record<string, never>;
        Returns: { suspended_until: string | null; warning_id: string | null; warning: string | null; warned_at: string | null }[];
      };
      report_content: {
        Args: { p_target_type: ReportTargetType; p_target_id: string; p_reason: ReportReason; p_details?: string | null };
        Returns: undefined;
      };
      flag_my_content: { Args: { p_target_type: ReportTargetType; p_target_id: string; p_categories: string[] }; Returns: undefined };
      moderation_queue: {
        Args: { p_status?: ReportStatus; p_limit?: number };
        Returns: {
          target_type: ReportTargetType;
          target_id: string;
          target_user_id: string | null;
          target_username: string | null;
          target_display_name: string | null;
          preview: string | null;
          content_exists: boolean;
          report_count: number;
          reasons: (ReportReason | "auto")[];
          details: string[];
          auto_flagged: boolean;
          first_reported_at: string;
          last_reported_at: string;
          suspended_until: string | null;
          warning_count: number;
        }[];
      };
      moderate: {
        Args: { p_target_type: ReportTargetType; p_target_id: string; p_action: ModerationAction; p_note?: string | null; p_suspend_days?: number | null };
        Returns: string | null;
      };
      create_plan_share: { Args: { p_group_id: string; p_contact_name: string; p_days?: number }; Returns: string };
      revoke_plan_share: { Args: { p_share_id: string }; Returns: undefined };
      shared_plan: {
        Args: { p_share_id: string; p_locale?: string };
        Returns: {
          sharer_name: string;
          goal_title: string;
          group_name: string;
          status: GroupStatus;
          location: string | null;
          dates: { starts_on: string; ends_on: string; votes: number }[];
          members: string[];
          expires_at: string;
          updated_at: string;
        }[];
      };
      export_my_data: { Args: Record<string, never>; Returns: Json };
      prepare_account_deletion: { Args: Record<string, never>; Returns: { bucket_id: string; name: string }[] };
      profile_stats: {
        Args: { p_profile_id: string };
        Returns: { completed_count: number; active_count: number }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = ProfileRow;
export type BucketItem = BucketItemRow;
export type GoalSuggestion = Database["public"]["Functions"]["search_goals"]["Returns"][number];
export type ExploreGoal = Database["public"]["Functions"]["explore_goals"]["Returns"][number];
export type GoalDetails = Database["public"]["Functions"]["goal_details"]["Returns"][number];
export type Match = Database["public"]["Functions"]["find_matches"]["Returns"][number];
export type MatchRequest = Database["public"]["Functions"]["my_match_requests"]["Returns"][number];
export type GoalGroup = Database["public"]["Functions"]["goal_groups"]["Returns"][number];
export type MyGroup = Database["public"]["Functions"]["my_groups"]["Returns"][number];
export type GroupMessage = Database["public"]["Tables"]["group_messages"]["Row"];
export type StoryCard = Database["public"]["Functions"]["story_cards"]["Returns"][number];
export type FeedItem = Database["public"]["Functions"]["home_feed"]["Returns"][number];
