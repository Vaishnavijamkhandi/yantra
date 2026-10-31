from app.main import health, health_check


def test_health():
    res = health()
    assert res["status"] == "ok"


def test_root():
    res = health_check()
    assert res["status"] == "running"
    assert res["version"] == "3.0.0"
