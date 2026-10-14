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

export type BucketCategory =
  | "adventure"
  | "travel"
  | "learning"
  | "creative"
  | "sport"
  | "food"
  | "nature"
  | "culture"
  | "social"
  | "other";
export type BucketVisibility = "public" | "private";
export type BucketStatus = "dreaming" | "planning" | "done";
export type GoalStatus = "pending" | "active" | "merged" | "rejected";

export const BUCKET_CATEGORIES: readonly BucketCategory[] = [
  "adventure",
  "travel",
  "learning",
  "creative",
  "sport",
  "food",
  "nature",
  "culture",
  "social",
  "other",
];
export const BUCKET_VISIBILITIES: readonly BucketVisibility[] = ["public", "private"];
export const BUCKET_STATUSES: readonly BucketStatus[] = ["dreaming", "planning", "done"];

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
  /** Deprecated copy of the goal's category; will be dropped. */
  category: BucketCategory;
  visibility: BucketVisibility;
  status: BucketStatus;
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
            "title" | "description" | "visibility" | "status" | "place_name" | "place_country" | "target_date"
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
          category_slug: BucketCategory;
          default_locale: string;
          status: GoalStatus;
          merged_into_id: string | null;
          place_name: string | null;
          place_country: string | null;
          featured_rank: number | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
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
        Args: { p_title: string; p_goal_id?: string | null; p_visibility?: BucketVisibility; p_locale?: string };
        Returns: string;
      };
      search_goals: {
        Args: { p_query?: string; p_locale?: string; p_limit?: number };
        Returns: { goal_id: string; title: string; category_slug: BucketCategory; wanted_count: number }[];
      };
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
