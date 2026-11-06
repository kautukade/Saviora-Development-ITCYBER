CREATE TABLE "assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"content_id" text NOT NULL,
	"language" text NOT NULL,
	"note" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_doctor_id" text,
	"kind" text NOT NULL,
	"slug" text NOT NULL,
	"topic" text,
	"condition" text DEFAULT 'ckd' NOT NULL,
	"est_minutes" integer DEFAULT 4 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"content_id" text NOT NULL,
	"language" text NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"video_id" text,
	"body_md" text,
	"caption" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text,
	"channel" text DEFAULT 'whatsapp' NOT NULL,
	"address" text NOT NULL,
	"opt_in_state" text DEFAULT 'pending' NOT NULL,
	"window_expires_at" timestamp with time zone,
	"last_inbound_at" timestamp with time zone,
	"display_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doctors" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"specialty" text,
	"clinic_name" text,
	"covering_contact" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "doctors_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_doctor_id" text,
	"title" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime" text NOT NULL,
	"file_id" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"page_count" integer,
	"published" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "escalations" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"red_flag" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reply" text,
	"replied_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"direction" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"text" text,
	"media_url" text,
	"media_mime" text,
	"template_name" text,
	"provider_message_id" text,
	"status" text DEFAULT 'received' NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "patient_links" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "patient_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"language" text DEFAULT 'hi' NOT NULL,
	"mrn" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "progress_events" (
	"id" text PRIMARY KEY NOT NULL,
	"assignment_id" text NOT NULL,
	"type" text NOT NULL,
	"position_seconds" double precision,
	"percent" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_values" (
	"id" text PRIMARY KEY NOT NULL,
	"result_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"analyte" text NOT NULL,
	"value" double precision NOT NULL,
	"unit" text NOT NULL,
	"raw_text" text,
	"flag" text,
	"escalated" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"doctor_id" text NOT NULL,
	"patient_id" text NOT NULL,
	"panel_keys" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"due_at" timestamp with time zone,
	"status" text DEFAULT 'ordered' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text,
	"patient_id" text NOT NULL,
	"blob_url" text NOT NULL,
	"mime" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"lab_name" text,
	"extraction" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confirmed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content" ADD CONSTRAINT "content_owner_doctor_id_doctors_id_fk" FOREIGN KEY ("owner_doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_versions" ADD CONSTRAINT "content_versions_content_id_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_owner_doctor_id_doctors_id_fk" FOREIGN KEY ("owner_doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escalations" ADD CONSTRAINT "escalations_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patient_links" ADD CONSTRAINT "patient_links_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_assignment_id_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_result_id_test_results_id_fk" FOREIGN KEY ("result_id") REFERENCES "public"."test_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_values" ADD CONSTRAINT "result_values_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_orders" ADD CONSTRAINT "test_orders_doctor_id_doctors_id_fk" FOREIGN KEY ("doctor_id") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_orders" ADD CONSTRAINT "test_orders_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_order_id_test_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."test_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_verified_by_doctors_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."doctors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignments_patient_idx" ON "assignments" USING btree ("patient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assignments_patient_content_idx" ON "assignments" USING btree ("patient_id","content_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_owner_slug_idx" ON "content" USING btree ("owner_doctor_id","slug");--> statement-breakpoint
CREATE INDEX "content_owner_idx" ON "content" USING btree ("owner_doctor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "content_version_lang_idx" ON "content_versions" USING btree ("content_id","language");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_channel_address_idx" ON "conversations" USING btree ("channel","address");--> statement-breakpoint
CREATE INDEX "conversations_patient_idx" ON "conversations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "documents_owner_idx" ON "documents" USING btree ("owner_doctor_id");--> statement-breakpoint
CREATE INDEX "escalations_patient_idx" ON "escalations" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "escalations_status_idx" ON "escalations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_provider_idx" ON "messages" USING btree ("provider_message_id");--> statement-breakpoint
CREATE INDEX "patient_links_patient_idx" ON "patient_links" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "patients_doctor_idx" ON "patients" USING btree ("doctor_id");--> statement-breakpoint
CREATE INDEX "progress_assignment_idx" ON "progress_events" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "result_values_patient_analyte_idx" ON "result_values" USING btree ("patient_id","analyte");--> statement-breakpoint
CREATE INDEX "test_orders_patient_idx" ON "test_orders" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "test_results_patient_idx" ON "test_results" USING btree ("patient_id");