ALTER TABLE "recurring_rules" ADD COLUMN "template_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "notice_lead_days" integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD COLUMN "publish_time" time DEFAULT '20:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_rules" ADD CONSTRAINT "recurring_rules_template_id_post_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."post_templates"("id") ON DELETE set null ON UPDATE no action;