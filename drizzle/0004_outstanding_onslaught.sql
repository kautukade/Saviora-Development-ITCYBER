CREATE TABLE "desk_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"title" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "desk_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"chat_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"navigate" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "desk_chats" ADD CONSTRAINT "desk_chats_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "desk_messages" ADD CONSTRAINT "desk_messages_chat_id_desk_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."desk_chats"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "desk_chats_doctor_idx" ON "desk_chats" USING btree ("doctor_id","updated_at");--> statement-breakpoint
CREATE INDEX "desk_messages_chat_idx" ON "desk_messages" USING btree ("chat_id","created_at");