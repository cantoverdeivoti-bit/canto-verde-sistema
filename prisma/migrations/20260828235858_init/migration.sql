-- CreateEnum
CREATE TYPE "AdvanceUnit" AS ENUM ('MINUTES', 'HOURS', 'DAYS', 'WEEKS', 'MONTHS');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL_AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "ReservationSource" AS ENUM ('PUBLIC', 'ADMIN');

-- CreateTable
CREATE TABLE "reservation_rules" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "selfService" BOOLEAN NOT NULL DEFAULT true,
    "maxAdvanceValue" INTEGER NOT NULL DEFAULT 2,
    "maxAdvanceUnit" "AdvanceUnit" NOT NULL DEFAULT 'MONTHS',
    "minAdvanceValue" INTEGER NOT NULL DEFAULT 2,
    "minAdvanceUnit" "AdvanceUnit" NOT NULL DEFAULT 'HOURS',
    "delayToleranceMinutes" INTEGER NOT NULL DEFAULT 15,
    "minPartySize" INTEGER NOT NULL DEFAULT 1,
    "maxPartySize" INTEGER NOT NULL DEFAULT 8,
    "autoApproveUpTo" INTEGER NOT NULL DEFAULT 6,
    "manualIfOverLimit" BOOLEAN NOT NULL DEFAULT true,
    "paymentRequired" BOOLEAN NOT NULL DEFAULT false,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacity_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "totalCapacity" INTEGER NOT NULL,
    "defaultDurationMinutes" INTEGER NOT NULL DEFAULT 90,
    "bufferMinutes" INTEGER NOT NULL DEFAULT 0,
    "slotIntervalMinutes" INTEGER NOT NULL DEFAULT 30,
    "minSlotsWarningThreshold" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "capacity_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_hours" (
    "id" SERIAL NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "shiftName" TEXT,
    "opensAt" TEXT NOT NULL,
    "closesAt" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_dates" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT true,
    "opensAt" TEXT,
    "closesAt" TEXT,
    "capacityOverride" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "special_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "restaurantEmail" TEXT NOT NULL,
    "notifyRestaurant" BOOLEAN NOT NULL DEFAULT true,
    "notifyCustomer" BOOLEAN NOT NULL DEFAULT true,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL_AUTO',
    "sendReminderHours" INTEGER DEFAULT 24,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "customerEmail" TEXT,
    "partySize" INTEGER NOT NULL,
    "serviceDate" DATE NOT NULL,
    "startTime" TIMESTAMPTZ(3) NOT NULL,
    "endTime" TIMESTAMPTZ(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "source" "ReservationSource" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "business_hours_dayOfWeek_idx" ON "business_hours"("dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "special_dates_date_key" ON "special_dates"("date");

-- CreateIndex
CREATE INDEX "special_dates_date_idx" ON "special_dates"("date");

-- CreateIndex
CREATE INDEX "reservations_startTime_endTime_idx" ON "reservations"("startTime", "endTime");

-- CreateIndex
CREATE INDEX "reservations_serviceDate_idx" ON "reservations"("serviceDate");

-- CreateIndex
CREATE INDEX "reservations_status_idx" ON "reservations"("status");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");
