ALTER TABLE `snap_spines` ADD `title` text;--> statement-breakpoint
ALTER TABLE `snap_spines` ADD `author` text;--> statement-breakpoint
ALTER TABLE `snap_spines` ADD `catalogue_failed` integer DEFAULT false NOT NULL;