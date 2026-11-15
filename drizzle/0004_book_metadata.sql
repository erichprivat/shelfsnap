ALTER TABLE `snap_sessions` ADD `catalogue_error` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `snap_spines` ADD `title` text;--> statement-breakpoint
ALTER TABLE `snap_spines` ADD `author` text;--> statement-breakpoint
ALTER TABLE `works` ADD `description` text;--> statement-breakpoint
ALTER TABLE `works` ADD `description_source` text;--> statement-breakpoint
ALTER TABLE `works` ADD `enriched_at` integer;