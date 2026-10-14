/**
 * Database types for the Supabase client.
 *
 * Hand-maintained to match supabase/migrations, with the CHECK-constrained
 * text columns (category, visibility, status) narrowed to string unions so the
 * UI gets exhaustive typing. When a migration changes the schema, compare with
 *   npx supabase gen types typescript --local
 * and update this file by hand (don't overwrite it: the generator widens those
 * columns to plain `string`).
 */
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

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          bio: string | null;
          avatar_url: string | null;
          home_city: string | null;
          home_country: string | null;
          locale: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          bio?: string | null;
          avatar_url?: string | null;
          home_city?: string | null;
          home_country?: string | null;
          locale?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      profile_locations: {
        // `location` is a PostGIS geography; it is never selected by the app.
        Row: { user_id: string; location: unknown; updated_at: string };
        Insert: { user_id: string; location: unknown };
        Update: { location?: unknown };
        Relationships: [];
      };
      bucket_items: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          category: BucketCategory;
          visibility: BucketVisibility;
          status: BucketStatus;
          place_name: string | null;
          place_country: string | null;
          target_date: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          title: string;
          description?: string | null;
          category?: BucketCategory;
          visibility?: BucketVisibility;
          status?: BucketStatus;
          place_name?: string | null;
          place_country?: string | null;
          target_date?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["bucket_items"]["Insert"], "owner_id">>;
        Relationships: [
          {
            foreignKeyName: "bucket_items_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      set_my_location: { Args: { lat: number; lng: number }; Returns: undefined };
      has_my_location: { Args: Record<string, never>; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type BucketItem = Database["public"]["Tables"]["bucket_items"]["Row"];
