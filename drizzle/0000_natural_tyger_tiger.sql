CREATE TABLE "arena_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sim_version" text NOT NULL,
	"seed" integer NOT NULL,
	"player_a" uuid NOT NULL,
	"player_b" uuid NOT NULL,
	"lineup_a" jsonb NOT NULL,
	"lineup_b" jsonb NOT NULL,
	"legs" jsonb NOT NULL,
	"winner" text NOT NULL,
	"mmr_a_before" integer NOT NULL,
	"mmr_a_after" integer NOT NULL,
	"mmr_b_before" integer NOT NULL,
	"mmr_b_after" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "arena_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text,
	"handle" text NOT NULL,
	"bot" boolean DEFAULT false NOT NULL,
	"bot_key" text,
	"mmr" integer DEFAULT 1000 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"lineup" jsonb,
	"lineup_updated_at" timestamp with time zone,
	"last_match_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "arena_players_token_unique" UNIQUE("token"),
	CONSTRAINT "arena_players_bot_key_unique" UNIQUE("bot_key")
);
--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_player_a_arena_players_id_fk" FOREIGN KEY ("player_a") REFERENCES "public"."arena_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "arena_matches" ADD CONSTRAINT "arena_matches_player_b_arena_players_id_fk" FOREIGN KEY ("player_b") REFERENCES "public"."arena_players"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "arena_matches_a_idx" ON "arena_matches" USING btree ("player_a","created_at");--> statement-breakpoint
CREATE INDEX "arena_matches_b_idx" ON "arena_matches" USING btree ("player_b","created_at");--> statement-breakpoint
CREATE INDEX "arena_players_mmr_idx" ON "arena_players" USING btree ("mmr");