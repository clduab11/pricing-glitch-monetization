-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerk_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "stripe_customer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "stripe_subscription_id" TEXT NOT NULL,
    "stripe_price_id" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "status" TEXT NOT NULL DEFAULT 'active',
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "retailers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "min_profit_margin" INTEGER NOT NULL DEFAULT 50,
    "min_price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "max_price" DECIMAL(10,2) NOT NULL DEFAULT 10000,
    "enable_discord" BOOLEAN NOT NULL DEFAULT true,
    "enable_email" BOOLEAN NOT NULL DEFAULT true,
    "enable_sms" BOOLEAN NOT NULL DEFAULT false,
    "discord_user_id" TEXT,
    "telegram_chat_id" TEXT,
    "webhook_url" TEXT,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "original_price" DECIMAL(10,2),
    "stock_status" TEXT NOT NULL DEFAULT 'unknown',
    "retailer" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "image_url" TEXT,
    "category" TEXT,
    "retailer_sku" TEXT,
    "description" TEXT,
    "last_checked" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "product_url" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomalies" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "anomaly_type" TEXT NOT NULL,
    "z_score" DECIMAL(10,2),
    "discount_percentage" DECIMAL(10,2) NOT NULL,
    "initial_confidence" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validated_glitches" (
    "id" TEXT NOT NULL,
    "anomaly_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "is_glitch" BOOLEAN NOT NULL,
    "confidence" INTEGER NOT NULL,
    "reasoning" TEXT NOT NULL,
    "glitch_type" TEXT NOT NULL,
    "profit_margin" DECIMAL(10,2) NOT NULL,
    "estimated_duration" TEXT,
    "validated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "validated_glitches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "glitch_id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_jobs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "job_type" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMP(3),
    "next_run_at" TIMESTAMP(3),
    "last_status" TEXT,
    "last_error" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration" INTEGER,
    "result" JSONB,
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "metadata" JSONB,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "window" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerk_id_key" ON "users"("clerk_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_stripe_customer_id_key" ON "users"("stripe_customer_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_created_at_idx" ON "users"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_user_id_key" ON "subscriptions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripe_subscription_id_key" ON "subscriptions"("stripe_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_tier_idx" ON "subscriptions"("tier");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_current_period_end_idx" ON "subscriptions"("current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_user_id_key" ON "user_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "products_url_key" ON "products"("url");

-- CreateIndex
CREATE INDEX "products_retailer_idx" ON "products"("retailer");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "products_last_checked_idx" ON "products"("last_checked");

-- CreateIndex
CREATE INDEX "products_retailer_category_idx" ON "products"("retailer", "category");

-- CreateIndex
CREATE INDEX "products_price_original_price_idx" ON "products"("price", "original_price");

-- CreateIndex
CREATE INDEX "price_history_product_id_idx" ON "price_history"("product_id");

-- CreateIndex
CREATE INDEX "price_history_product_url_idx" ON "price_history"("product_url");

-- CreateIndex
CREATE INDEX "price_history_checked_at_idx" ON "price_history"("checked_at");

-- CreateIndex
CREATE INDEX "price_history_product_id_checked_at_idx" ON "price_history"("product_id", "checked_at");

-- CreateIndex
CREATE INDEX "anomalies_status_idx" ON "anomalies"("status");

-- CreateIndex
CREATE INDEX "anomalies_detected_at_idx" ON "anomalies"("detected_at");

-- CreateIndex
CREATE INDEX "anomalies_product_id_idx" ON "anomalies"("product_id");

-- CreateIndex
CREATE INDEX "anomalies_status_detected_at_idx" ON "anomalies"("status", "detected_at");

-- CreateIndex
CREATE INDEX "anomalies_discount_percentage_idx" ON "anomalies"("discount_percentage");

-- CreateIndex
CREATE UNIQUE INDEX "validated_glitches_anomaly_id_key" ON "validated_glitches"("anomaly_id");

-- CreateIndex
CREATE INDEX "validated_glitches_is_glitch_idx" ON "validated_glitches"("is_glitch");

-- CreateIndex
CREATE INDEX "validated_glitches_validated_at_idx" ON "validated_glitches"("validated_at");

-- CreateIndex
CREATE INDEX "validated_glitches_product_id_idx" ON "validated_glitches"("product_id");

-- CreateIndex
CREATE INDEX "validated_glitches_glitch_type_idx" ON "validated_glitches"("glitch_type");

-- CreateIndex
CREATE INDEX "validated_glitches_profit_margin_idx" ON "validated_glitches"("profit_margin");

-- CreateIndex
CREATE INDEX "validated_glitches_is_glitch_validated_at_idx" ON "validated_glitches"("is_glitch", "validated_at");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_channel_idx" ON "notifications"("channel");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "notifications_glitch_id_idx" ON "notifications"("glitch_id");

-- CreateIndex
CREATE INDEX "notifications_status_channel_idx" ON "notifications"("status", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_jobs_name_key" ON "scheduled_jobs"("name");

-- CreateIndex
CREATE INDEX "scheduled_jobs_enabled_idx" ON "scheduled_jobs"("enabled");

-- CreateIndex
CREATE INDEX "scheduled_jobs_next_run_at_idx" ON "scheduled_jobs"("next_run_at");

-- CreateIndex
CREATE INDEX "scheduled_jobs_job_type_idx" ON "scheduled_jobs"("job_type");

-- CreateIndex
CREATE INDEX "job_runs_job_id_idx" ON "job_runs"("job_id");

-- CreateIndex
CREATE INDEX "job_runs_status_idx" ON "job_runs"("status");

-- CreateIndex
CREATE INDEX "job_runs_started_at_idx" ON "job_runs"("started_at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs"("entity");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "api_usage_user_id_idx" ON "api_usage"("user_id");

-- CreateIndex
CREATE INDEX "api_usage_window_idx" ON "api_usage"("window");

-- CreateIndex
CREATE UNIQUE INDEX "api_usage_user_id_endpoint_window_key" ON "api_usage"("user_id", "endpoint", "window");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomalies" ADD CONSTRAINT "anomalies_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validated_glitches" ADD CONSTRAINT "validated_glitches_anomaly_id_fkey" FOREIGN KEY ("anomaly_id") REFERENCES "anomalies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validated_glitches" ADD CONSTRAINT "validated_glitches_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_glitch_id_fkey" FOREIGN KEY ("glitch_id") REFERENCES "validated_glitches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "scheduled_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
