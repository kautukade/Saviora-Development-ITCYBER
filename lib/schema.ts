/**
 * Every table, one file.
 *
 * The column that shapes the product is `ownerDoctorId` on `content` and
 * `documents`: NULL means Saviora authored it and every doctor sees it; a
 * doctor id means it belongs to that doctor alone. One rule —
 * `ownerDoctorId IS NULL OR ownerDoctorId = me` — governs both.
 *
 * Progress is an append-only event log rather than a stored percentage, so how
 * far a patient actually got can never drift from what we show the doctor.
 */

import { relations } from 'drizzle-orm';
import {
  boolean, doublePrecision, index, integer, jsonb, pgTable,
  text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull();

/* ------------------------------------------------------------------ people */

export const doctors = pgTable('doctors', {
  id: id(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  specialty: text('specialty'),
  clinicName: text('clinic_name'),
  // Reachable when a red flag fires outside working hours.
  coveringContact: text('covering_contact'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: createdAt(),
});

export const patients = pgTable('patients', {
  id: id(),
  doctorId: text('doctor_id').notNull().references(() => doctors.id),
  name: text('name').notNull(),
  // E.164 without the plus, matching what the Cloud API returns.
  phone: text('phone'),
  language: text('language').default('hi').notNull(),
  mrn: text('mrn'),
  notes: text('notes'),
  createdAt: createdAt(),
}, (t) => [index('patients_doctor_idx').on(t.doctorId)]);

/* ----------------------------------------------------------------- content */

export const content = pgTable('content', {
  id: id(),
  /** NULL = Saviora's, visible to every doctor. */
  ownerDoctorId: text('owner_doctor_id').references(() => doctors.id),
  kind: text('kind').notNull(),              // 'video' | 'text'
  slug: text('slug').notNull(),
  topic: text('topic'),
  condition: text('condition').default('ckd').notNull(),
  estMinutes: integer('est_minutes').default(4).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  published: boolean('published').default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('content_owner_slug_idx').on(t.ownerDoctorId, t.slug),
  index('content_owner_idx').on(t.ownerDoctorId),
]);

/** One piece of content in one language. Adding a language is a row. */
export const contentVersions = pgTable('content_versions', {
  id: id(),
  contentId: text('content_id').notNull().references(() => content.id, { onDelete: 'cascade' }),
  language: text('language').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  /** YouTube id, for kind='video' hosted there. */
  videoId: text('video_id'),
  /**
   * A video the doctor uploaded, stored as a blob and played directly.
   *
   * The alternative was insisting everything goes through YouTube, which asks a
   * nephrologist to open a Google account, upload, set unlisted and come back
   * with a link before he can send a thirty-second clip he already has on his
   * phone. Exactly one of videoId and videoUrl is set.
   */
  videoUrl: text('video_url'),
  /** Markdown, for kind='text'. */
  bodyMd: text('body_md'),
  /** The narration, which is also what a question can be answered against. */
  caption: text('caption'),
  /** Real length, per language — the Hindi and English cuts differ. Telling a
   *  patient "4 min" for a 27-second video is the difference between tapping
   *  it and leaving it. */
  durationSeconds: integer('duration_seconds'),
  createdAt: createdAt(),
}, (t) => [uniqueIndex('content_version_lang_idx').on(t.contentId, t.language)]);

/* ------------------------------------------------------------- assignments */

export const assignments = pgTable('assignments', {
  id: id(),
  doctorId: text('doctor_id').notNull().references(() => doctors.id),
  patientId: text('patient_id').notNull().references(() => patients.id),
  contentId: text('content_id').notNull().references(() => content.id),
  language: text('language').notNull(),
  note: text('note'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('assignments_patient_idx').on(t.patientId),
  uniqueIndex('assignments_patient_content_idx').on(t.patientId, t.contentId),
]);

/**
 * Append-only. `opened` when the page loads, `progress` as the video plays,
 * `completed` at the end. Percentage is derived from the furthest point
 * reached, never stored.
 */
export const progressEvents = pgTable('progress_events', {
  id: id(),
  assignmentId: text('assignment_id').notNull()
    .references(() => assignments.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),              // 'opened' | 'progress' | 'completed'
  positionSeconds: doublePrecision('position_seconds'),
  percent: integer('percent'),
  at: createdAt(),
}, (t) => [index('progress_assignment_idx').on(t.assignmentId)]);

/* --------------------------------------------------- documents the bot uses */

export const documents = pgTable('documents', {
  id: id(),
  /** NULL = Saviora's, available to every doctor's bot. */
  ownerDoctorId: text('owner_doctor_id').references(() => doctors.id),
  title: text('title').notNull(),
  /** Our own copy of the file. Null when blob storage is not configured — the
   *  document still answers questions, because that lives in the Files API. */
  blobUrl: text('blob_url'),
  mime: text('mime').notNull(),
  sizeBytes: integer('size_bytes'),
  /** Files API id, so a document is uploaded to Claude once. */
  fileId: text('file_id'),
  status: text('status').default('processing').notNull(),  // processing | ready | failed
  pageCount: integer('page_count'),
  published: boolean('published').default(true).notNull(),
  createdAt: createdAt(),
}, (t) => [index('documents_owner_idx').on(t.ownerDoctorId)]);

/* ------------------------------------------------------- the patient's link */

export const patientLinks = pgTable('patient_links', {
  id: id(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  /** Only the hash is stored — a database dump opens nothing. */
  tokenHash: text('token_hash').notNull().unique(),
  tokenPrefix: text('token_prefix').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [index('patient_links_patient_idx').on(t.patientId)]);

/* -------------------------------------------------------------- desk chats */

/**
 * The doctor's conversations with the assistant on his home screen.
 *
 * Separate from `conversations`, which is a patient on WhatsApp. This is one
 * doctor talking to Saviora about his own practice, and it is kept so he can
 * go back to what he asked last Tuesday rather than asking it again.
 */
export const deskChats = pgTable('desk_chats', {
  id: id(),
  doctorId: text('doctor_id').notNull().references(() => doctors.id),
  /** Taken from the first question, and renameable. */
  title: text('title').notNull(),
  /** Ordering is by last activity, not creation — a chat returned to is recent. */
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  createdAt: createdAt(),
}, (t) => [index('desk_chats_doctor_idx').on(t.doctorId, t.updatedAt)]);

export const deskMessages = pgTable('desk_messages', {
  id: id(),
  chatId: text('chat_id').notNull().references(() => deskChats.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  text: text('text').notNull(),
  /** Where the assistant sent him, if it did. Replayed as a link, not a jump. */
  navigate: text('navigate'),
  createdAt: createdAt(),
}, (t) => [index('desk_messages_chat_idx').on(t.chatId, t.createdAt)]);

/* ------------------------------------------------------------ conversations */

export const conversations = pgTable('conversations', {
  id: id(),
  patientId: text('patient_id').references(() => patients.id),
  channel: text('channel').default('whatsapp').notNull(),  // whatsapp | console
  /** E.164 digits, or a console handle. */
  address: text('address').notNull(),
  optInState: text('opt_in_state').default('pending').notNull(), // pending|opted_in|stopped|blocked
  /** WhatsApp's 24-hour rule. Free-form is only allowed while this is ahead. */
  windowExpiresAt: timestamp('window_expires_at', { withTimezone: true }),
  lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
  displayName: text('display_name'),
  createdAt: createdAt(),
}, (t) => [
  uniqueIndex('conversations_channel_address_idx').on(t.channel, t.address),
  index('conversations_patient_idx').on(t.patientId),
]);

export const messages = pgTable('messages', {
  id: id(),
  conversationId: text('conversation_id').notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  direction: text('direction').notNull(),    // 'in' | 'out'
  kind: text('kind').default('text').notNull(),
  text: text('text'),
  mediaUrl: text('media_url'),
  mediaMime: text('media_mime'),
  templateName: text('template_name'),
  providerMessageId: text('provider_message_id'),
  status: text('status').default('received').notNull(),
  /** Citations, model, token usage, red flags — whatever an audit later needs. */
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}).notNull(),
  createdAt: createdAt(),
}, (t) => [
  index('messages_conversation_idx').on(t.conversationId),
  index('messages_provider_idx').on(t.providerMessageId),
]);

/* ------------------------------------------------------------------- labs */

export const testOrders = pgTable('test_orders', {
  id: id(),
  doctorId: text('doctor_id').notNull().references(() => doctors.id),
  patientId: text('patient_id').notNull().references(() => patients.id),
  /** Keys from lib/panels.ts — what the report is expected to contain. */
  panelKeys: jsonb('panel_keys').$type<string[]>().default([]).notNull(),
  dueAt: timestamp('due_at', { withTimezone: true }),
  status: text('status').default('ordered').notNull(),
  note: text('note'),
  createdAt: createdAt(),
}, (t) => [index('test_orders_patient_idx').on(t.patientId)]);

/**
 * pending → extracted → confirmed → verified, or ↘ unreadable / rejected.
 *
 * The distinction is the point: a machine reading a number off a photograph,
 * the patient agreeing it was transcribed right, and a doctor having actually
 * looked, are three different facts.
 */
export const testResults = pgTable('test_results', {
  id: id(),
  orderId: text('order_id').references(() => testOrders.id),
  patientId: text('patient_id').notNull().references(() => patients.id),
  /** Null when blob storage is not configured; the extraction still stands. */
  blobUrl: text('blob_url'),
  mime: text('mime').notNull(),
  status: text('status').default('pending').notNull(),
  attempt: integer('attempt').default(1).notNull(),
  labName: text('lab_name'),
  /** Kept verbatim so a disputed value traces to what the model actually said. */
  extraction: jsonb('extraction').$type<Record<string, unknown>>().default({}).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  verifiedBy: text('verified_by').references(() => doctors.id),
  createdAt: createdAt(),
}, (t) => [index('test_results_patient_idx').on(t.patientId)]);

/** Written only once the patient has confirmed the read-back. */
export const resultValues = pgTable('result_values', {
  id: id(),
  resultId: text('result_id').notNull()
    .references(() => testResults.id, { onDelete: 'cascade' }),
  patientId: text('patient_id').notNull().references(() => patients.id),
  analyte: text('analyte').notNull(),
  value: doublePrecision('value').notNull(),
  unit: text('unit').notNull(),
  /** The result cell exactly as printed, before any conversion. */
  rawText: text('raw_text'),
  flag: text('flag'),                        // critical | delta | out_of_range
  escalated: boolean('escalated').default(false).notNull(),
  createdAt: createdAt(),
}, (t) => [index('result_values_patient_analyte_idx').on(t.patientId, t.analyte)]);

/* ------------------------------------------------------------ escalations */

export const escalations = pgTable('escalations', {
  id: id(),
  patientId: text('patient_id').notNull().references(() => patients.id),
  kind: text('kind').notNull(),              // red_flag | out_of_scope | medicine | result | unreadable
  text: text('text').notNull(),
  redFlag: boolean('red_flag').default(false).notNull(),
  status: text('status').default('new').notNull(),   // new | seen | answered
  reply: text('reply'),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  createdAt: createdAt(),
}, (t) => [
  index('escalations_patient_idx').on(t.patientId),
  index('escalations_status_idx').on(t.status),
]);

/* ---------------------------------------------------------------- relations */

export const doctorRelations = relations(doctors, ({ many }) => ({
  patients: many(patients),
  content: many(content),
  documents: many(documents),
}));

export const patientRelations = relations(patients, ({ one, many }) => ({
  doctor: one(doctors, { fields: [patients.doctorId], references: [doctors.id] }),
  assignments: many(assignments),
  links: many(patientLinks),
  escalations: many(escalations),
}));

export const contentRelations = relations(content, ({ one, many }) => ({
  owner: one(doctors, { fields: [content.ownerDoctorId], references: [doctors.id] }),
  versions: many(contentVersions),
}));

export const contentVersionRelations = relations(contentVersions, ({ one }) => ({
  content: one(content, { fields: [contentVersions.contentId], references: [content.id] }),
}));

export const assignmentRelations = relations(assignments, ({ one, many }) => ({
  patient: one(patients, { fields: [assignments.patientId], references: [patients.id] }),
  content: one(content, { fields: [assignments.contentId], references: [content.id] }),
  events: many(progressEvents),
}));

export const deskChatRelations = relations(deskChats, ({ one, many }) => ({
  doctor: one(doctors, { fields: [deskChats.doctorId], references: [doctors.id] }),
  messages: many(deskMessages),
}));

export const deskMessageRelations = relations(deskMessages, ({ one }) => ({
  chat: one(deskChats, { fields: [deskMessages.chatId], references: [deskChats.id] }),
}));
