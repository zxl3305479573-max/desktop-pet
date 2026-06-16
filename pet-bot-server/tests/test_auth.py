def test_register_success(client):
    resp = client.post("/auth/register", json={"email": "new@test.com", "password": "pass1234"})
    assert resp.status_code == 201
    data = resp.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_register_duplicate(client):
    client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    resp = client.post("/auth/register", json={"email": "dup@test.com", "password": "pass1234"})
    assert resp.status_code == 409


def test_login_success(client, test_user):
    resp = client.post("/auth/login", json={"email": "test@petbot.io", "password": "secret123"})
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_login_wrong_password(client, test_user):
    resp = client.post("/auth/login", json={"email": "test@petbot.io", "password": "wrong"})
    assert resp.status_code == 401
