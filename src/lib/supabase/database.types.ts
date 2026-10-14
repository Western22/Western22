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
      are_buddies: { Args: { a: string; b: string }; Returns: boolean };
      goal_title: { Args: { p_goal_id: string; p_locale: string }; Returns: string };
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
