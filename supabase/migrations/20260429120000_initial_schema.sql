-- Initial product schema
-- PostgreSQL-compatible migration intended to stay portable across managed providers.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    external_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    full_name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_customer_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    customer_id UUID NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_customer_access_user_customer_unique UNIQUE (user_id, customer_id),
    CONSTRAINT user_customer_access_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT user_customer_access_user_fk FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE CASCADE
);

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT devices_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID NOT NULL,
    device_id UUID,
    status TEXT NOT NULL DEFAULT 'open',
    severity TEXT NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    description TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT alerts_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    CONSTRAINT alerts_device_fk FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id UUID,
    user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    payload JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT audit_log_customer_fk FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    CONSTRAINT audit_log_user_fk FOREIGN KEY (user_id) REFERENCES profiles(user_id) ON DELETE SET NULL
);

-- Query-oriented indexes
CREATE INDEX idx_user_customer_access_customer_id ON user_customer_access (customer_id);
CREATE INDEX idx_devices_customer_id ON devices (customer_id);
CREATE INDEX idx_devices_status ON devices (status);
CREATE INDEX idx_alerts_customer_id ON alerts (customer_id);
CREATE INDEX idx_alerts_status ON alerts (status);
CREATE INDEX idx_alerts_severity ON alerts (severity);
CREATE INDEX idx_alerts_occurred_at ON alerts (occurred_at);
CREATE INDEX idx_audit_log_customer_id ON audit_log (customer_id);
CREATE INDEX idx_audit_log_occurred_at ON audit_log (occurred_at);
