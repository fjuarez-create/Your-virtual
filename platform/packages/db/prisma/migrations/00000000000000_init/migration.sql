-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "auth_realm" AS ENUM ('INVESTOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('ACTIVE', 'LOCKED', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "mfa_type" AS ENUM ('TOTP', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "id_document_type" AS ENUM ('DNI', 'NIE', 'PASSPORT');

-- CreateEnum
CREATE TYPE "investor_account_type" AS ENUM ('NATURAL', 'LEGAL');

-- CreateEnum
CREATE TYPE "investor_classification" AS ENUM ('NON_SOPHISTICATED', 'SOPHISTICATED');

-- CreateEnum
CREATE TYPE "onboarding_status" AS ENUM ('REGISTERED', 'IDENTITY_PENDING', 'IDENTITY_IN_REVIEW', 'SUITABILITY_PENDING', 'READY_TO_INVEST', 'BLOCKED');

-- CreateEnum
CREATE TYPE "beneficial_owner_control_type" AS ENUM ('OWNERSHIP', 'VOTING_RIGHTS', 'OTHER_CONTROL', 'SENIOR_MANAGEMENT');

-- CreateEnum
CREATE TYPE "membership_role" AS ENUM ('OWNER', 'REPRESENTATIVE', 'VIEWER');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "admin_role" AS ENUM ('SUPER_ADMIN', 'COMPLIANCE_OFFICER', 'KYC_REVIEWER', 'PROJECT_MANAGER', 'ACCOUNTING_READONLY');

-- CreateEnum
CREATE TYPE "token_purpose" AS ENUM ('PASSWORD_RESET', 'EMAIL_VERIFICATION');

-- CreateEnum
CREATE TYPE "kyc_subject_type" AS ENUM ('INVESTOR_USER', 'INVESTOR_ACCOUNT');

-- CreateEnum
CREATE TYPE "kyc_status" AS ENUM ('NOT_STARTED', 'PENDING_DOCUMENTS', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "risk_rating" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "kyc_check_type" AS ENUM ('IDENTITY_DOCUMENT', 'LIVENESS', 'ADDRESS', 'PEP_SANCTIONS', 'ADVERSE_MEDIA', 'SOURCE_OF_FUNDS', 'COMPANY_REGISTRY', 'BENEFICIAL_OWNERSHIP');

-- CreateEnum
CREATE TYPE "kyc_check_status" AS ENUM ('REQUESTED', 'PENDING', 'PASSED', 'FAILED', 'NEEDS_REVIEW', 'ERROR');

-- CreateEnum
CREATE TYPE "screening_disposition" AS ENUM ('PENDING', 'TRUE_POSITIVE', 'FALSE_POSITIVE');

-- CreateEnum
CREATE TYPE "kyc_document_type" AS ENUM ('ID_FRONT', 'ID_BACK', 'SELFIE', 'PROOF_OF_ADDRESS', 'SOURCE_OF_FUNDS_EVIDENCE', 'CORPORATE_DEED', 'POWERS_OF_ATTORNEY', 'BENEFICIAL_OWNERSHIP_DECLARATION', 'OTHER');

-- CreateEnum
CREATE TYPE "knowledge_outcome" AS ENUM ('PASS', 'FAIL');

-- CreateEnum
CREATE TYPE "suitability_outcome" AS ENUM ('PASSED', 'FAILED_WARNING_ACKNOWLEDGED', 'NOT_REQUIRED_SOPHISTICATED');

-- CreateEnum
CREATE TYPE "sophistication_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('DRAFT', 'PUBLISHED', 'FUNDING_OPEN', 'FUNDING_CLOSED', 'FULLY_FUNDED', 'FUNDING_FAILED', 'IN_EXECUTION', 'EXITED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "asset_class" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED', 'LAND');

-- CreateEnum
CREATE TYPE "return_type" AS ENUM ('TIR', 'MULTIPLE', 'FIXED_COUPON');

-- CreateEnum
CREATE TYPE "project_asset_type" AS ENUM ('RESIDENTIAL_BUILDING', 'COMMERCIAL_PLOT', 'COMMERCIAL_UNIT', 'PARKING', 'LAND_PLOT');

-- CreateEnum
CREATE TYPE "project_document_type" AS ENUM ('MEMORIA', 'KIIS', 'ACCOUNTS', 'APPRAISAL', 'LICENSE', 'CONTRACT_TEMPLATE', 'OTHER');

-- CreateEnum
CREATE TYPE "document_visibility" AS ENUM ('PUBLIC', 'AUTHENTICATED', 'INVESTORS_ONLY');

-- CreateEnum
CREATE TYPE "milestone_status" AS ENUM ('PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DELAYED');

-- CreateEnum
CREATE TYPE "funding_round_status" AS ENUM ('DRAFT', 'OPEN', 'CLOSED_SUCCESS', 'CLOSED_FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "investment_status" AS ENUM ('DRAFT', 'PENDING_KIIS', 'PENDING_SIGNATURE', 'COOLING_OFF', 'PENDING_PAYMENT', 'FUNDS_RECEIVED', 'CONFIRMED', 'WITHDRAWN', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "signature_status" AS ENUM ('CREATED', 'SENT', 'SIGNED', 'DECLINED', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "payment_method" AS ENUM ('CARD', 'SEPA_CREDIT_TRANSFER', 'SEPA_DIRECT_DEBIT');

-- CreateEnum
CREATE TYPE "payment_status" AS ENUM ('INITIATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "refund_status" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "refund_reason" AS ENUM ('INVESTOR_WITHDRAWAL', 'ROUND_FAILED', 'OVERPAYMENT', 'COMPLIANCE_REJECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "distribution_type" AS ENUM ('INTEREST', 'PRINCIPAL', 'PROFIT_SHARE');

-- CreateEnum
CREATE TYPE "ledger_account_type" AS ENUM ('ESCROW', 'INVESTOR', 'PLATFORM_FEES', 'BANK', 'SUSPENSE');

-- CreateEnum
CREATE TYPE "legal_document_kind" AS ENUM ('TERMS_OF_USE', 'PRIVACY_POLICY', 'COOKIES_POLICY', 'INVESTMENT_CONTRACT', 'RISK_WARNINGS', 'SUITABILITY_QUESTIONNAIRE', 'OTHER');

-- CreateEnum
CREATE TYPE "acceptance_context" AS ENUM ('REGISTRATION', 'INVESTMENT', 'KYC', 'PROFILE_UPDATE', 'ACCOUNT_CREATION');

-- CreateEnum
CREATE TYPE "actor_type" AS ENUM ('INVESTOR', 'ADMIN', 'SYSTEM', 'PROVIDER');

-- CreateEnum
CREATE TYPE "setting_value_type" AS ENUM ('INTEGER', 'DECIMAL', 'BOOLEAN', 'STRING', 'JSON');

-- CreateEnum
CREATE TYPE "data_subject_request_type" AS ENUM ('ACCESS', 'RECTIFICATION', 'ERASURE', 'PORTABILITY', 'OBJECTION', 'RESTRICTION');

-- CreateEnum
CREATE TYPE "data_subject_request_status" AS ENUM ('RECEIVED', 'IN_PROGRESS', 'COMPLETED', 'PARTIALLY_COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "communication_channel" AS ENUM ('EMAIL', 'SMS', 'IN_APP');

-- CreateEnum
CREATE TYPE "communication_status" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateTable
CREATE TABLE "investor_user" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "locale" VARCHAR(10) NOT NULL DEFAULT 'es-ES',
    "last_login_at" TIMESTAMPTZ(6),
    "first_name" TEXT,
    "last_name" TEXT,
    "birth_date" DATE,
    "nationality" CHAR(2),
    "id_document_type" "id_document_type",
    "id_document_number_encrypted" BYTEA,
    "encryption_key_version" INTEGER,
    "phone" TEXT,
    "address_line" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "province" TEXT,
    "country" CHAR(2),
    "marketing_consent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investor_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_account" (
    "id" UUID NOT NULL,
    "type" "investor_account_type" NOT NULL,
    "display_name" TEXT NOT NULL,
    "tax_residence_country" CHAR(2),
    "iban_encrypted" BYTEA,
    "encryption_key_version" INTEGER,
    "classification" "investor_classification" NOT NULL DEFAULT 'NON_SOPHISTICATED',
    "classification_valid_until" TIMESTAMPTZ(6),
    "onboarding_status" "onboarding_status" NOT NULL DEFAULT 'REGISTERED',
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investor_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_entity_details" (
    "id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "legal_form" TEXT,
    "incorporated_at" DATE,
    "registered_address" TEXT,
    "registry_data" TEXT,
    "cnae" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "legal_entity_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficial_owner" (
    "id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "birth_date" DATE,
    "nationality" CHAR(2),
    "id_document_type" "id_document_type",
    "id_document_number_encrypted" BYTEA,
    "encryption_key_version" INTEGER,
    "ownership_pct" DECIMAL(5,2),
    "control_type" "beneficial_owner_control_type" NOT NULL,
    "screened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "beneficial_owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_membership" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "role" "membership_role" NOT NULL,
    "status" "membership_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "powers_document_id" UUID,
    "valid_until" TIMESTAMPTZ(6),
    "approved_by_admin_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "account_membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_session" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "active_account_id" UUID,
    "mfa_satisfied_at" TIMESTAMPTZ(6),
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investor_mfa_factor" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "type" "mfa_type" NOT NULL,
    "secret_encrypted" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "label" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investor_mfa_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_user" (
    "id" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role" "admin_role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enrolled_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "status" "user_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "admin_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_session" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "mfa_satisfied_at" TIMESTAMPTZ(6),
    "ip_address" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_mfa_factor" (
    "id" UUID NOT NULL,
    "admin_user_id" UUID NOT NULL,
    "type" "mfa_type" NOT NULL,
    "secret_encrypted" BYTEA NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "label" TEXT,
    "confirmed_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_mfa_factor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_recovery_code" (
    "id" UUID NOT NULL,
    "realm" "auth_realm" NOT NULL,
    "subject_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_recovery_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_attempt" (
    "id" UUID NOT NULL,
    "realm" "auth_realm" NOT NULL,
    "email" CITEXT,
    "ip_address" INET,
    "successful" BOOLEAN NOT NULL,
    "failure_reason" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_token" (
    "id" UUID NOT NULL,
    "realm" "auth_realm" NOT NULL,
    "subject_id" UUID NOT NULL,
    "purpose" "token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_profile" (
    "id" UUID NOT NULL,
    "subject_type" "kyc_subject_type" NOT NULL,
    "investor_user_id" UUID,
    "investor_account_id" UUID,
    "level_reached" SMALLINT NOT NULL DEFAULT 0,
    "status" "kyc_status" NOT NULL DEFAULT 'NOT_STARTED',
    "rejection_reason_code" TEXT,
    "rejection_reason_text" TEXT,
    "risk_rating" "risk_rating",
    "approved_at" TIMESTAMPTZ(6),
    "approved_by_admin_id" UUID,
    "expires_at" TIMESTAMPTZ(6),
    "last_screened_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "kyc_profile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_check" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "beneficial_owner_id" UUID,
    "check_type" "kyc_check_type" NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "status" "kyc_check_status" NOT NULL DEFAULT 'REQUESTED',
    "result_payload_ref" TEXT,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "reviewed_by_admin_id" UUID,

    CONSTRAINT "kyc_check_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screening_match" (
    "id" UUID NOT NULL,
    "kyc_check_id" UUID NOT NULL,
    "match_type" TEXT NOT NULL,
    "matched_name" TEXT NOT NULL,
    "list_source" TEXT,
    "score_from_provider" DECIMAL(6,3),
    "raw_match" JSONB,
    "disposition" "screening_disposition" NOT NULL DEFAULT 'PENDING',
    "disposition_reason" TEXT,
    "disposition_by_admin_id" UUID,
    "disposition_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "screening_match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_document" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "document_type" "kyc_document_type" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "encryption_key_version" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retention_until" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "kyc_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_review" (
    "id" UUID NOT NULL,
    "kyc_profile_id" UUID NOT NULL,
    "reviewer_admin_id" UUID NOT NULL,
    "decision" "kyc_status" NOT NULL,
    "reason_code" TEXT,
    "notes" TEXT,
    "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suitability_assessment" (
    "id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "completed_by_user_id" UUID,
    "questionnaire_version" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "knowledge_outcome" "knowledge_outcome" NOT NULL,
    "declared_net_worth_cents" BIGINT,
    "declared_annual_income_cents" BIGINT,
    "loss_bearing_capacity_cents" BIGINT,
    "outcome" "suitability_outcome" NOT NULL,
    "warning_acknowledged_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "suitability_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sophistication_request" (
    "id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "self_certified_at" TIMESTAMPTZ(6) NOT NULL,
    "criteria_claimed" JSONB NOT NULL,
    "evidence_document_ids" UUID[],
    "status" "sophistication_status" NOT NULL DEFAULT 'PENDING',
    "decided_by_admin_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_notes" TEXT,
    "valid_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sophistication_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'DRAFT',
    "asset_class" "asset_class" NOT NULL,
    "address_line" TEXT,
    "city" TEXT,
    "province" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'ES',
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "description_md" TEXT,
    "target_return_pct" DECIMAL(6,3),
    "return_type" "return_type",
    "term_months" INTEGER,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMPTZ(6),
    "showroom_url" TEXT,
    "spv_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spv" (
    "id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "tax_id" TEXT NOT NULL,
    "registry_data" TEXT,
    "registered_address" TEXT,
    "incorporated_at" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "spv_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_asset" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "asset_type" "project_asset_type" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "units_count" INTEGER,
    "built_surface_m2" DECIMAL(10,2),
    "plot_surface_m2" DECIMAL(10,2),
    "cadastral_reference" TEXT,
    "intended_use" TEXT,
    "estimated_value_cents" BIGINT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "project_asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_document" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "document_type" "project_document_type" NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "content_sha256" CHAR(64) NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "visibility" "document_visibility" NOT NULL DEFAULT 'PUBLIC',
    "effective_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "superseded_by_id" UUID,
    "published_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_media" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "caption" TEXT,
    "is_hero" BOOLEAN NOT NULL DEFAULT false,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_milestone" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "expected_at" DATE,
    "completed_at" DATE,
    "status" "milestone_status" NOT NULL DEFAULT 'PLANNED',
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_milestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_update" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "visibility" "document_visibility" NOT NULL DEFAULT 'INVESTORS_ONLY',
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_update_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_stack_item" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "seniority" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "provider_name" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_stack_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_relation" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "related_project_id" UUID NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "project_relation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funding_round" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "status" "funding_round_status" NOT NULL DEFAULT 'DRAFT',
    "target_amount_cents" BIGINT NOT NULL,
    "minimum_amount_cents" BIGINT NOT NULL,
    "min_ticket_cents" BIGINT NOT NULL,
    "max_ticket_per_investor_cents" BIGINT,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "opens_at" TIMESTAMPTZ(6),
    "closes_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "kiis_document_id" UUID,
    "contract_template_document_id" UUID,
    "platform_fee_pct" DECIMAL(6,3),
    "success_fee_pct" DECIMAL(6,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "funding_round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_tier" (
    "id" UUID NOT NULL,
    "funding_round_id" UUID NOT NULL,
    "tier_order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "hurdle_pct" DECIMAL(6,3),
    "split_investors_pct" DECIMAL(6,3) NOT NULL,
    "split_sponsor_pct" DECIMAL(6,3) NOT NULL,

    CONSTRAINT "return_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment" (
    "id" UUID NOT NULL,
    "investor_account_id" UUID NOT NULL,
    "placed_by_investor_user_id" UUID NOT NULL,
    "funding_round_id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "investment_status" NOT NULL DEFAULT 'DRAFT',
    "reference" TEXT NOT NULL,
    "reserved_at" TIMESTAMPTZ(6),
    "kiis_presented_at" TIMESTAMPTZ(6),
    "kiis_acknowledged_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "cooling_off_ends_at" TIMESTAMPTZ(6),
    "funds_received_at" TIMESTAMPTZ(6),
    "confirmed_at" TIMESTAMPTZ(6),
    "withdrawn_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "suitability_assessment_id" UUID,
    "kyc_level_at_commitment" SMALLINT,
    "classification_at_commitment" "investor_classification",
    "warning_shown" BOOLEAN NOT NULL DEFAULT false,
    "warning_acknowledged_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investment_transition" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "from_status" "investment_status",
    "to_status" "investment_status" NOT NULL,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "reason" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "investment_transition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_request" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_envelope_id" TEXT,
    "status" "signature_status" NOT NULL DEFAULT 'CREATED',
    "signed_document_storage_key" TEXT,
    "signed_document_sha256" CHAR(64),
    "evidence_package_key" TEXT,
    "signer_ip" INET,
    "signer_user_agent" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "signature_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "method" "payment_method" NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "status" "payment_status" NOT NULL DEFAULT 'INITIATED',
    "paid_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,
    "reconciled_at" TIMESTAMPTZ(6),
    "reconciled_by_admin_id" UUID,
    "bank_transaction_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bank_transaction" (
    "id" UUID NOT NULL,
    "value_date" DATE NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "counterparty_name" TEXT,
    "counterparty_iban" TEXT,
    "concept" TEXT,
    "bank_reference" TEXT NOT NULL,
    "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matched_by_admin_id" UUID,
    "matched_at" TIMESTAMPTZ(6),

    CONSTRAINT "bank_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund" (
    "id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "amount_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "reason" "refund_reason" NOT NULL,
    "status" "refund_status" NOT NULL DEFAULT 'PENDING',
    "destination_iban_encrypted" BYTEA,
    "encryption_key_version" INTEGER,
    "provider_reference" TEXT,
    "authorized_by_admin_id" UUID,
    "authorized_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution" (
    "id" UUID NOT NULL,
    "funding_round_id" UUID NOT NULL,
    "type" "distribution_type" NOT NULL,
    "description" TEXT,
    "total_gross_cents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "declared_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "distribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "distribution_allocation" (
    "id" UUID NOT NULL,
    "distribution_id" UUID NOT NULL,
    "investment_id" UUID NOT NULL,
    "gross_cents" BIGINT NOT NULL,
    "withholding_cents" BIGINT NOT NULL DEFAULT 0,
    "net_cents" BIGINT NOT NULL,
    "paid_at" TIMESTAMPTZ(6),

    CONSTRAINT "distribution_allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_account" (
    "id" UUID NOT NULL,
    "type" "ledger_account_type" NOT NULL,
    "code" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "investor_account_id" UUID,
    "funding_round_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_transaction" (
    "id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "source_id" UUID,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entry" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "debit_cents" BIGINT NOT NULL DEFAULT 0,
    "credit_cents" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',

    CONSTRAINT "ledger_entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "legal_document_kind" NOT NULL,
    "name" TEXT NOT NULL,
    "requires_acceptance" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_version" (
    "id" UUID NOT NULL,
    "legal_document_id" UUID NOT NULL,
    "version_label" TEXT NOT NULL,
    "locale" VARCHAR(10) NOT NULL DEFAULT 'es-ES',
    "content_md" TEXT,
    "storage_key" TEXT,
    "content_sha256" CHAR(64) NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "published_by_admin_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_document_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_document_acceptance" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "legal_document_version_id" UUID NOT NULL,
    "accepted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" INET,
    "user_agent" TEXT,
    "context" "acceptance_context" NOT NULL,
    "context_id" UUID,
    "content_sha256_at_acceptance" CHAR(64) NOT NULL,

    CONSTRAINT "legal_document_acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_type" "actor_type" NOT NULL,
    "actor_id" UUID,
    "actor_ip" INET,
    "request_id" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "prev_hash" CHAR(64),
    "hash" CHAR(64) NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_setting" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "value_type" "setting_value_type" NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "is_locked" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "compliance_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_setting_change" (
    "id" UUID NOT NULL,
    "compliance_setting_id" UUID NOT NULL,
    "previous_value" TEXT,
    "new_value" TEXT NOT NULL,
    "reason" TEXT,
    "changed_by_admin_id" UUID,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_setting_change_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_subject_request" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "type" "data_subject_request_type" NOT NULL,
    "status" "data_subject_request_status" NOT NULL DEFAULT 'RECEIVED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "handled_by_admin_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_notes" TEXT,
    "retained_under_legal_basis" TEXT,
    "export_storage_key" TEXT,

    CONSTRAINT "data_subject_request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_log" (
    "id" UUID NOT NULL,
    "investor_user_id" UUID NOT NULL,
    "channel" "communication_channel" NOT NULL,
    "template" TEXT NOT NULL,
    "template_version" TEXT NOT NULL,
    "subject" TEXT,
    "recipient" TEXT NOT NULL,
    "status" "communication_status" NOT NULL DEFAULT 'QUEUED',
    "provider_message_id" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "communication_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_event" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" TEXT,
    "signature_verified" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMPTZ(6),
    "processing_error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "webhook_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "investor_user_email_key" ON "investor_user"("email");

-- CreateIndex
CREATE INDEX "investor_user_status_idx" ON "investor_user"("status");

-- CreateIndex
CREATE INDEX "investor_account_type_status_idx" ON "investor_account"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entity_details_investor_account_id_key" ON "legal_entity_details"("investor_account_id");

-- CreateIndex
CREATE INDEX "beneficial_owner_investor_account_id_idx" ON "beneficial_owner"("investor_account_id");

-- CreateIndex
CREATE INDEX "account_membership_investor_account_id_status_idx" ON "account_membership"("investor_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "account_membership_investor_user_id_investor_account_id_key" ON "account_membership"("investor_user_id", "investor_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "investor_session_token_hash_key" ON "investor_session"("token_hash");

-- CreateIndex
CREATE INDEX "investor_session_investor_user_id_idx" ON "investor_session"("investor_user_id");

-- CreateIndex
CREATE INDEX "investor_session_expires_at_idx" ON "investor_session"("expires_at");

-- CreateIndex
CREATE INDEX "investor_mfa_factor_investor_user_id_idx" ON "investor_mfa_factor"("investor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "admin_user_email_key" ON "admin_user"("email");

-- CreateIndex
CREATE INDEX "admin_user_role_is_active_idx" ON "admin_user"("role", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "admin_session_token_hash_key" ON "admin_session"("token_hash");

-- CreateIndex
CREATE INDEX "admin_session_admin_user_id_idx" ON "admin_session"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_session_expires_at_idx" ON "admin_session"("expires_at");

-- CreateIndex
CREATE INDEX "admin_mfa_factor_admin_user_id_idx" ON "admin_mfa_factor"("admin_user_id");

-- CreateIndex
CREATE INDEX "mfa_recovery_code_realm_subject_id_idx" ON "mfa_recovery_code"("realm", "subject_id");

-- CreateIndex
CREATE INDEX "auth_attempt_realm_email_attempted_at_idx" ON "auth_attempt"("realm", "email", "attempted_at");

-- CreateIndex
CREATE INDEX "auth_attempt_ip_address_attempted_at_idx" ON "auth_attempt"("ip_address", "attempted_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_token_token_hash_key" ON "auth_token"("token_hash");

-- CreateIndex
CREATE INDEX "auth_token_realm_subject_id_purpose_idx" ON "auth_token"("realm", "subject_id", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_profile_investor_user_id_key" ON "kyc_profile"("investor_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_profile_investor_account_id_key" ON "kyc_profile"("investor_account_id");

-- CreateIndex
CREATE INDEX "kyc_profile_status_level_reached_idx" ON "kyc_profile"("status", "level_reached");

-- CreateIndex
CREATE INDEX "kyc_profile_expires_at_idx" ON "kyc_profile"("expires_at");

-- CreateIndex
CREATE INDEX "kyc_check_kyc_profile_id_check_type_idx" ON "kyc_check"("kyc_profile_id", "check_type");

-- CreateIndex
CREATE INDEX "kyc_check_status_idx" ON "kyc_check"("status");

-- CreateIndex
CREATE INDEX "kyc_check_provider_idx" ON "kyc_check"("provider");

-- CreateIndex
CREATE INDEX "screening_match_kyc_check_id_idx" ON "screening_match"("kyc_check_id");

-- CreateIndex
CREATE INDEX "screening_match_disposition_idx" ON "screening_match"("disposition");

-- CreateIndex
CREATE INDEX "kyc_document_kyc_profile_id_document_type_idx" ON "kyc_document"("kyc_profile_id", "document_type");

-- CreateIndex
CREATE INDEX "kyc_document_retention_until_idx" ON "kyc_document"("retention_until");

-- CreateIndex
CREATE INDEX "kyc_review_kyc_profile_id_idx" ON "kyc_review"("kyc_profile_id");

-- CreateIndex
CREATE INDEX "suitability_assessment_investor_account_id_valid_until_idx" ON "suitability_assessment"("investor_account_id", "valid_until");

-- CreateIndex
CREATE INDEX "sophistication_request_investor_account_id_status_idx" ON "sophistication_request"("investor_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "project_slug_key" ON "project"("slug");

-- CreateIndex
CREATE INDEX "project_status_is_featured_idx" ON "project"("status", "is_featured");

-- CreateIndex
CREATE INDEX "project_display_order_idx" ON "project"("display_order");

-- CreateIndex
CREATE UNIQUE INDEX "spv_tax_id_key" ON "spv"("tax_id");

-- CreateIndex
CREATE INDEX "project_asset_project_id_display_order_idx" ON "project_asset"("project_id", "display_order");

-- CreateIndex
CREATE UNIQUE INDEX "project_document_superseded_by_id_key" ON "project_document"("superseded_by_id");

-- CreateIndex
CREATE INDEX "project_document_project_id_document_type_idx" ON "project_document"("project_id", "document_type");

-- CreateIndex
CREATE UNIQUE INDEX "project_document_project_id_document_type_version_key" ON "project_document"("project_id", "document_type", "version");

-- CreateIndex
CREATE INDEX "project_media_project_id_display_order_idx" ON "project_media"("project_id", "display_order");

-- CreateIndex
CREATE INDEX "project_milestone_project_id_display_order_idx" ON "project_milestone"("project_id", "display_order");

-- CreateIndex
CREATE INDEX "project_update_project_id_published_at_idx" ON "project_update"("project_id", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "capital_stack_item_project_id_seniority_key" ON "capital_stack_item"("project_id", "seniority");

-- CreateIndex
CREATE UNIQUE INDEX "project_relation_project_id_related_project_id_key" ON "project_relation"("project_id", "related_project_id");

-- CreateIndex
CREATE INDEX "funding_round_status_closes_at_idx" ON "funding_round"("status", "closes_at");

-- CreateIndex
CREATE UNIQUE INDEX "funding_round_project_id_round_number_key" ON "funding_round"("project_id", "round_number");

-- CreateIndex
CREATE UNIQUE INDEX "return_tier_funding_round_id_tier_order_key" ON "return_tier"("funding_round_id", "tier_order");

-- CreateIndex
CREATE UNIQUE INDEX "investment_reference_key" ON "investment"("reference");

-- CreateIndex
CREATE INDEX "investment_investor_account_id_status_idx" ON "investment"("investor_account_id", "status");

-- CreateIndex
CREATE INDEX "investment_funding_round_id_status_idx" ON "investment"("funding_round_id", "status");

-- CreateIndex
CREATE INDEX "investment_project_id_idx" ON "investment"("project_id");

-- CreateIndex
CREATE INDEX "investment_status_expires_at_idx" ON "investment"("status", "expires_at");

-- CreateIndex
CREATE INDEX "investment_transition_investment_id_occurred_at_idx" ON "investment_transition"("investment_id", "occurred_at");

-- CreateIndex
CREATE INDEX "signature_request_investment_id_idx" ON "signature_request"("investment_id");

-- CreateIndex
CREATE INDEX "signature_request_provider_provider_envelope_id_idx" ON "signature_request"("provider", "provider_envelope_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_bank_transaction_id_key" ON "payment"("bank_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_idempotency_key_key" ON "payment"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_investment_id_idx" ON "payment"("investment_id");

-- CreateIndex
CREATE INDEX "payment_status_idx" ON "payment"("status");

-- CreateIndex
CREATE INDEX "payment_provider_provider_reference_idx" ON "payment"("provider", "provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "bank_transaction_bank_reference_key" ON "bank_transaction"("bank_reference");

-- CreateIndex
CREATE INDEX "bank_transaction_value_date_idx" ON "bank_transaction"("value_date");

-- CreateIndex
CREATE INDEX "refund_investment_id_idx" ON "refund"("investment_id");

-- CreateIndex
CREATE INDEX "refund_status_idx" ON "refund"("status");

-- CreateIndex
CREATE INDEX "distribution_funding_round_id_idx" ON "distribution"("funding_round_id");

-- CreateIndex
CREATE INDEX "distribution_allocation_investment_id_idx" ON "distribution_allocation"("investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "distribution_allocation_distribution_id_investment_id_key" ON "distribution_allocation"("distribution_id", "investment_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_account_code_key" ON "ledger_account"("code");

-- CreateIndex
CREATE INDEX "ledger_account_type_idx" ON "ledger_account"("type");

-- CreateIndex
CREATE INDEX "ledger_transaction_source_type_source_id_idx" ON "ledger_transaction"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "ledger_entry_account_id_idx" ON "ledger_entry"("account_id");

-- CreateIndex
CREATE INDEX "ledger_entry_transaction_id_idx" ON "ledger_entry"("transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_slug_key" ON "legal_document"("slug");

-- CreateIndex
CREATE INDEX "legal_document_version_effective_from_idx" ON "legal_document_version"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_version_legal_document_id_version_label_loca_key" ON "legal_document_version"("legal_document_id", "version_label", "locale");

-- CreateIndex
CREATE INDEX "legal_document_acceptance_investor_user_id_idx" ON "legal_document_acceptance"("investor_user_id");

-- CreateIndex
CREATE INDEX "legal_document_acceptance_legal_document_version_id_idx" ON "legal_document_acceptance"("legal_document_version_id");

-- CreateIndex
CREATE INDEX "legal_document_acceptance_context_context_id_idx" ON "legal_document_acceptance"("context", "context_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_log_seq_key" ON "audit_log"("seq");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_occurred_at_idx" ON "audit_log"("entity_type", "entity_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_actor_type_actor_id_occurred_at_idx" ON "audit_log"("actor_type", "actor_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_log_action_occurred_at_idx" ON "audit_log"("action", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_setting_key_key" ON "compliance_setting"("key");

-- CreateIndex
CREATE INDEX "compliance_setting_change_compliance_setting_id_changed_at_idx" ON "compliance_setting_change"("compliance_setting_id", "changed_at");

-- CreateIndex
CREATE INDEX "data_subject_request_status_due_at_idx" ON "data_subject_request"("status", "due_at");

-- CreateIndex
CREATE INDEX "communication_log_investor_user_id_created_at_idx" ON "communication_log"("investor_user_id", "created_at");

-- CreateIndex
CREATE INDEX "webhook_event_processed_at_idx" ON "webhook_event"("processed_at");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_event_provider_event_id_key" ON "webhook_event"("provider", "event_id");

-- AddForeignKey
ALTER TABLE "legal_entity_details" ADD CONSTRAINT "legal_entity_details_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficial_owner" ADD CONSTRAINT "beneficial_owner_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_membership" ADD CONSTRAINT "account_membership_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_membership" ADD CONSTRAINT "account_membership_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_membership" ADD CONSTRAINT "account_membership_powers_document_id_fkey" FOREIGN KEY ("powers_document_id") REFERENCES "kyc_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_membership" ADD CONSTRAINT "account_membership_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_session" ADD CONSTRAINT "investor_session_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investor_mfa_factor" ADD CONSTRAINT "investor_mfa_factor_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_session" ADD CONSTRAINT "admin_session_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_mfa_factor" ADD CONSTRAINT "admin_mfa_factor_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profile" ADD CONSTRAINT "kyc_profile_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profile" ADD CONSTRAINT "kyc_profile_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_profile" ADD CONSTRAINT "kyc_profile_approved_by_admin_id_fkey" FOREIGN KEY ("approved_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_check" ADD CONSTRAINT "kyc_check_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_check" ADD CONSTRAINT "kyc_check_beneficial_owner_id_fkey" FOREIGN KEY ("beneficial_owner_id") REFERENCES "beneficial_owner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_check" ADD CONSTRAINT "kyc_check_reviewed_by_admin_id_fkey" FOREIGN KEY ("reviewed_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_match" ADD CONSTRAINT "screening_match_kyc_check_id_fkey" FOREIGN KEY ("kyc_check_id") REFERENCES "kyc_check"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "screening_match" ADD CONSTRAINT "screening_match_disposition_by_admin_id_fkey" FOREIGN KEY ("disposition_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_document" ADD CONSTRAINT "kyc_document_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review" ADD CONSTRAINT "kyc_review_kyc_profile_id_fkey" FOREIGN KEY ("kyc_profile_id") REFERENCES "kyc_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_review" ADD CONSTRAINT "kyc_review_reviewer_admin_id_fkey" FOREIGN KEY ("reviewer_admin_id") REFERENCES "admin_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suitability_assessment" ADD CONSTRAINT "suitability_assessment_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suitability_assessment" ADD CONSTRAINT "suitability_assessment_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "investor_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sophistication_request" ADD CONSTRAINT "sophistication_request_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sophistication_request" ADD CONSTRAINT "sophistication_request_decided_by_admin_id_fkey" FOREIGN KEY ("decided_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_spv_id_fkey" FOREIGN KEY ("spv_id") REFERENCES "spv"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_asset" ADD CONSTRAINT "project_asset_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_document" ADD CONSTRAINT "project_document_published_by_admin_id_fkey" FOREIGN KEY ("published_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_milestone" ADD CONSTRAINT "project_milestone_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_update" ADD CONSTRAINT "project_update_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "capital_stack_item" ADD CONSTRAINT "capital_stack_item_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_relation" ADD CONSTRAINT "project_relation_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_relation" ADD CONSTRAINT "project_relation_related_project_id_fkey" FOREIGN KEY ("related_project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_round" ADD CONSTRAINT "funding_round_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_round" ADD CONSTRAINT "funding_round_kiis_document_id_fkey" FOREIGN KEY ("kiis_document_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funding_round" ADD CONSTRAINT "funding_round_contract_template_document_id_fkey" FOREIGN KEY ("contract_template_document_id") REFERENCES "project_document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_tier" ADD CONSTRAINT "return_tier_funding_round_id_fkey" FOREIGN KEY ("funding_round_id") REFERENCES "funding_round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_placed_by_investor_user_id_fkey" FOREIGN KEY ("placed_by_investor_user_id") REFERENCES "investor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_funding_round_id_fkey" FOREIGN KEY ("funding_round_id") REFERENCES "funding_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment" ADD CONSTRAINT "investment_suitability_assessment_id_fkey" FOREIGN KEY ("suitability_assessment_id") REFERENCES "suitability_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investment_transition" ADD CONSTRAINT "investment_transition_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signature_request" ADD CONSTRAINT "signature_request_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_reconciled_by_admin_id_fkey" FOREIGN KEY ("reconciled_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES "bank_transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_transaction" ADD CONSTRAINT "bank_transaction_matched_by_admin_id_fkey" FOREIGN KEY ("matched_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund" ADD CONSTRAINT "refund_authorized_by_admin_id_fkey" FOREIGN KEY ("authorized_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_funding_round_id_fkey" FOREIGN KEY ("funding_round_id") REFERENCES "funding_round"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_allocation" ADD CONSTRAINT "distribution_allocation_distribution_id_fkey" FOREIGN KEY ("distribution_id") REFERENCES "distribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution_allocation" ADD CONSTRAINT "distribution_allocation_investment_id_fkey" FOREIGN KEY ("investment_id") REFERENCES "investment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_account" ADD CONSTRAINT "ledger_account_investor_account_id_fkey" FOREIGN KEY ("investor_account_id") REFERENCES "investor_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "ledger_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_legal_document_id_fkey" FOREIGN KEY ("legal_document_id") REFERENCES "legal_document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_version" ADD CONSTRAINT "legal_document_version_published_by_admin_id_fkey" FOREIGN KEY ("published_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_acceptance" ADD CONSTRAINT "legal_document_acceptance_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_document_acceptance" ADD CONSTRAINT "legal_document_acceptance_legal_document_version_id_fkey" FOREIGN KEY ("legal_document_version_id") REFERENCES "legal_document_version"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_setting_change" ADD CONSTRAINT "compliance_setting_change_compliance_setting_id_fkey" FOREIGN KEY ("compliance_setting_id") REFERENCES "compliance_setting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_setting_change" ADD CONSTRAINT "compliance_setting_change_changed_by_admin_id_fkey" FOREIGN KEY ("changed_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_subject_request" ADD CONSTRAINT "data_subject_request_handled_by_admin_id_fkey" FOREIGN KEY ("handled_by_admin_id") REFERENCES "admin_user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_investor_user_id_fkey" FOREIGN KEY ("investor_user_id") REFERENCES "investor_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

