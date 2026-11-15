CREATE TABLE `bingo_squares` (
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`square` integer NOT NULL,
	`work_id` text NOT NULL,
	PRIMARY KEY(`challenge_id`, `user_id`, `square`),
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`work_id`) REFERENCES `works`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bingo_squares_book_idx` ON `bingo_squares` (`challenge_id`,`user_id`,`work_id`);--> statement-breakpoint
CREATE TABLE `challenge_members` (
	`challenge_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`challenge_id`, `user_id`),
	FOREIGN KEY (`challenge_id`) REFERENCES `challenges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `challenge_members_user_idx` ON `challenge_members` (`user_id`);--> statement-breakpoint
CREATE TABLE `challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`owner_id` text,
	`starts_on` text NOT NULL,
	`ends_on` text NOT NULL,
	`target` integer,
	`card` text,
	`theme` text,
	`join_code` text NOT NULL,
	`featured_slug` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_join_code_unique` ON `challenges` (`join_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `challenges_featured_slug_unique` ON `challenges` (`featured_slug`);