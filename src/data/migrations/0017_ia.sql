CREATE TABLE `ai_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`purpose` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`rubric_version` integer,
	`output` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_material_permissions` (
	`material_id` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`decided_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ai_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	`purpose` text NOT NULL,
	`cache_key` text NOT NULL,
	`material_id` text NOT NULL,
	`material_title` text NOT NULL,
	`fragment` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`waiting` text DEFAULT 'sending' NOT NULL,
	`outcome` text,
	`finished_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_queue_status_idx` ON `ai_queue` (`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `ai_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`purpose` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt_version` integer NOT NULL,
	`rubric_version` integer,
	`price_version` text NOT NULL,
	`fragments` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`cache_read_tokens` integer DEFAULT 0 NOT NULL,
	`cache_write_tokens` integer DEFAULT 0 NOT NULL,
	`usd_micros` integer NOT NULL,
	`status` text NOT NULL,
	`queue_item_id` text
);
--> statement-breakpoint
CREATE INDEX `ai_requests_at_idx` ON `ai_requests` (`at`);--> statement-breakpoint
CREATE TABLE `ai_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`at` text NOT NULL,
	`queue_item_id` text NOT NULL,
	`event` text NOT NULL,
	`error_kind` text,
	`http_status` integer,
	`latency_ms` integer,
	`attempt` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_traces_at_idx` ON `ai_traces` (`at`);