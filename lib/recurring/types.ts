import type { Database } from "@/lib/supabase/database.types";

export type StreamInsert = Database["public"]["Tables"]["recurring_streams"]["Insert"];
