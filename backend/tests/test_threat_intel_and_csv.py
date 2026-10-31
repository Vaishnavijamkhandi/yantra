import pytest
from app.services.threat_intel import generate_consequences, generate_remedy, generate_what_if_not_cured
from app.routes.assets import COLUMN_ALIASES

def test_banking_consequences():
    consequences = generate_consequences(
        department="Fintech & Payments",
        asset_type="Server",
        asset_name="payments-api-cluster",
        cvss_score=9.8,
    )
    assert consequences["domain_category"] == "Banking & Financial Services"
    assert "PCI-DSS" in consequences["legal_regulatory"]
    assert "reconciliation" in consequences["operational_impact"].lower() or "payment" in consequences["operational_impact"].lower()

def test_ecommerce_consequences():
    consequences = generate_consequences(
        department="E-Commerce & Orders",
        asset_type="Server",
        asset_name="order-processing-svc",
        cvss_score=8.5,
    )
    assert consequences["domain_category"] == "E-Commerce & Digital Commerce"
    assert "GDPR" in consequences["legal_regulatory"] or "CCPA" in consequences["legal_regulatory"]
    assert "downtime" in consequences["financial_cost"].lower()

def test_manufacturing_consequences():
    consequences = generate_consequences(
        department="Manufacturing Operations",
        asset_type="IoT",
        asset_name="factory-scada-controller",
        cvss_score=9.1,
    )
    assert consequences["domain_category"] == "Manufacturing & Industrial Automation"
    assert "OSHA" in consequences["legal_regulatory"]

def test_healthcare_consequences():
    consequences = generate_consequences(
        department="ICU Ward",
        asset_type="Medical Device",
        asset_name="infusion-pump-controller",
        cvss_score=8.0,
    )
    assert consequences["domain_category"] == "Healthcare & Clinical Systems"
    assert "HIPAA" in consequences["legal_regulatory"]

def test_corporate_default_consequences():
    consequences = generate_consequences(
        department="Marketing & PR",
        asset_type="Workstation",
        asset_name="designer-macbook",
        cvss_score=6.0,
    )
    assert consequences["domain_category"] == "Corporate Enterprise Operations"

def test_column_aliases_coverage():
    assert "asset_name" in COLUMN_ALIASES
    assert "hostname" in COLUMN_ALIASES["asset_name"]
    assert "device_type" in COLUMN_ALIASES["asset_type"]
    assert "business_unit" in COLUMN_ALIASES["department"]
    assert "priority" in COLUMN_ALIASES["criticality"]
    assert "network_exposure" in COLUMN_ALIASES["exposure"]
