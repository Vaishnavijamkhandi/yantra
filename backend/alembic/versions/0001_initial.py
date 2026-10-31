from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "assets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_name", sa.String(160), nullable=False),
        sa.Column("asset_type", sa.String(80), nullable=False),
        sa.Column("ip_address", sa.String(64)),
        sa.Column("operating_system", sa.String(160)),
        sa.Column("criticality", sa.Enum("low", "medium", "high", "critical", name="criticality"), nullable=False),
        sa.Column("exposure", sa.Enum("isolated", "internal", "partner", "internet_facing", name="exposure"), nullable=False),
        sa.Column("department", sa.String(120)),
        sa.Column("environment", sa.String(40), nullable=False),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_assets_asset_name", "assets", ["asset_name"])
    op.create_index("ix_assets_asset_type", "assets", ["asset_type"])
    op.create_table(
        "asset_software",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vendor", sa.String(160)),
        sa.Column("software_name", sa.String(180), nullable=False),
        sa.Column("software_version", sa.String(100)),
        sa.Column("cpe_name", sa.String(500)),
        sa.UniqueConstraint("asset_id", "software_name", "software_version", name="uq_asset_software"),
    )
    op.create_index("ix_asset_software_asset_id", "asset_software", ["asset_id"])
    op.create_index("ix_asset_software_software_name", "asset_software", ["software_name"])
    op.create_table(
        "vulnerabilities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cve_id", sa.String(32), nullable=False, unique=True),
        sa.Column("description", sa.Text()),
        sa.Column("cvss_version", sa.String(16)),
        sa.Column("cvss_score", sa.Float()),
        sa.Column("severity", sa.String(20)),
        sa.Column("exploitability_score", sa.Float()),
        sa.Column("published_at", sa.DateTime(timezone=True)),
        sa.Column("last_modified_at", sa.DateTime(timezone=True)),
        sa.Column("source_url", sa.String(500)),
        sa.Column("raw_data", sa.JSON()),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_vulnerabilities_cve_id", "vulnerabilities", ["cve_id"])
    op.create_table(
        "asset_vulnerabilities",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("vulnerability_id", sa.String(36), sa.ForeignKey("vulnerabilities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("match_status", sa.String(32), nullable=False),
        sa.Column("evidence", sa.Text()),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("asset_id", "vulnerability_id", name="uq_asset_vulnerability"),
    )
    op.create_index("ix_asset_vulnerabilities_asset_id", "asset_vulnerabilities", ["asset_id"])
    op.create_index("ix_asset_vulnerabilities_vulnerability_id", "asset_vulnerabilities", ["vulnerability_id"])
    op.create_table(
        "risk_assessments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("asset_id", sa.String(36), sa.ForeignKey("assets.id", ondelete="CASCADE"), nullable=False),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("risk_level", sa.String(20), nullable=False),
        sa.Column("factors", sa.JSON(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("evidence_coverage", sa.String(32), nullable=False),
        sa.Column("assessed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_risk_assessments_asset_id", "risk_assessments", ["asset_id"])
    op.create_index("ix_risk_assessments_risk_level", "risk_assessments", ["risk_level"])


def downgrade():
    op.drop_table("risk_assessments")
    op.drop_table("asset_vulnerabilities")
    op.drop_table("vulnerabilities")
    op.drop_table("asset_software")
    op.drop_table("assets")
