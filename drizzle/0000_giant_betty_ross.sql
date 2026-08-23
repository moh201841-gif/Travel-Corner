CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`nameEn` varchar(180) NOT NULL,
	`nameAr` varchar(180) NOT NULL,
	`heroImageUrl` text,
	`promoArtworkUrl` text,
	`summaryEn` text,
	`summaryAr` text,
	`startsAt` timestamp,
	`endsAt` timestamp,
	`isActive` boolean NOT NULL DEFAULT false,
	`seoTitleEn` varchar(180),
	`seoTitleAr` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`),
	CONSTRAINT `campaigns_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `enquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`kind` enum('hotel_offer','umrah','custom_trip','callback') NOT NULL,
	`offerId` int,
	`umrahProgramId` int,
	`sourcePath` varchar(255),
	`preferredContact` enum('whatsapp','phone','email') NOT NULL DEFAULT 'whatsapp',
	`name` varchar(160),
	`phone` varchar(40),
	`email` varchar(320),
	`travelDate` timestamp,
	`travellerNotes` text,
	`status` enum('new','contacted','qualified','closed') NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `enquiries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `offerRatePeriods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`offerId` int NOT NULL,
	`labelEn` varchar(140),
	`labelAr` varchar(140),
	`occupancy` varchar(80) NOT NULL DEFAULT 'per_person',
	`price` decimal(12,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'EGP',
	`childPrice` decimal(12,2),
	`infantPrice` decimal(12,2),
	`singleSupplement` decimal(12,2),
	`extraNightPrice` decimal(12,2),
	`validFrom` timestamp,
	`validUntil` timestamp,
	`notesEn` text,
	`notesAr` text,
	`lastUpdatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `offerRatePeriods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `siteSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`primaryPhone` varchar(40),
	`secondaryPhone` varchar(40),
	`whatsappNumber` varchar(40),
	`email` varchar(320),
	`officeAddressEn` text,
	`officeAddressAr` text,
	`googleMapsUrl` text,
	`facebookUrl` text,
	`instagramUrl` text,
	`tiktokUrl` text,
	`businessHoursEn` text,
	`businessHoursAr` text,
	`supportPhone` varchar(40),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `siteSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `travelOffers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`slug` varchar(160) NOT NULL,
	`destinationEn` varchar(120) NOT NULL,
	`destinationAr` varchar(120) NOT NULL,
	`hotelNameEn` varchar(180) NOT NULL,
	`hotelNameAr` varchar(180) NOT NULL,
	`areaEn` varchar(180),
	`areaAr` varchar(180),
	`hotelCategory` varchar(60),
	`days` int NOT NULL,
	`nights` int NOT NULL,
	`mealPlanEn` varchar(120) NOT NULL,
	`mealPlanAr` varchar(120) NOT NULL,
	`transportationIncluded` boolean NOT NULL DEFAULT false,
	`transportDetailsEn` text,
	`transportDetailsAr` text,
	`hotelTags` json,
	`adultsOnly` boolean NOT NULL DEFAULT false,
	`familyFriendly` boolean NOT NULL DEFAULT false,
	`availability` enum('available','limited','on_request','sold_out','expired','hidden') NOT NULL DEFAULT 'on_request',
	`isActive` boolean NOT NULL DEFAULT false,
	`imageUrl` text,
	`posterArtworkUrl` text,
	`summaryEn` text,
	`summaryAr` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `travelOffers_id` PRIMARY KEY(`id`),
	CONSTRAINT `travelOffers_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `umrahPrograms` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int,
	`slug` varchar(160) NOT NULL,
	`programCode` varchar(80),
	`titleEn` varchar(180) NOT NULL,
	`titleAr` varchar(180) NOT NULL,
	`departureAt` timestamp,
	`returnAt` timestamp,
	`durationDays` int,
	`airline` varchar(160),
	`departureAirport` varchar(160),
	`arrivalAirport` varchar(160),
	`flightNotesEn` text,
	`flightNotesAr` text,
	`makkahHotelEn` varchar(180),
	`makkahHotelAr` varchar(180),
	`makkahNotesEn` text,
	`makkahNotesAr` text,
	`madinahHotelEn` varchar(180),
	`madinahHotelAr` varchar(180),
	`madinahNotesEn` text,
	`madinahNotesAr` text,
	`includedItems` json,
	`verifiedInformationEn` text,
	`verifiedInformationAr` text,
	`availability` enum('available','limited','on_request','sold_out','expired','hidden') NOT NULL DEFAULT 'on_request',
	`isActive` boolean NOT NULL DEFAULT false,
	`imageUrl` text,
	`posterArtworkUrl` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `umrahPrograms_id` PRIMARY KEY(`id`),
	CONSTRAINT `umrahPrograms_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `umrahRateRows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`programId` int NOT NULL,
	`roomType` varchar(60) NOT NULL,
	`price` decimal(12,2) NOT NULL,
	`currency` varchar(10) NOT NULL DEFAULT 'EGP',
	`notesEn` text,
	`notesAr` text,
	CONSTRAINT `umrahRateRows_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_offerId_travelOffers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `travelOffers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `enquiries` ADD CONSTRAINT `enquiries_umrahProgramId_umrahPrograms_id_fk` FOREIGN KEY (`umrahProgramId`) REFERENCES `umrahPrograms`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `offerRatePeriods` ADD CONSTRAINT `offerRatePeriods_offerId_travelOffers_id_fk` FOREIGN KEY (`offerId`) REFERENCES `travelOffers`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `travelOffers` ADD CONSTRAINT `travelOffers_campaignId_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `umrahPrograms` ADD CONSTRAINT `umrahPrograms_campaignId_campaigns_id_fk` FOREIGN KEY (`campaignId`) REFERENCES `campaigns`(`id`) ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `umrahRateRows` ADD CONSTRAINT `umrahRateRows_programId_umrahPrograms_id_fk` FOREIGN KEY (`programId`) REFERENCES `umrahPrograms`(`id`) ON DELETE no action ON UPDATE no action;