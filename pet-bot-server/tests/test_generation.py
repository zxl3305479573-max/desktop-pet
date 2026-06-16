import io


def test_upload_photo_requires_auth(client):
    resp = client.post("/api/v1/upload")
    assert resp.status_code in (401, 403)


def test_upload_photo_success(client, auth_headers, db_session, test_user):
    # Give test user enough credits
    from app.services.pipeline import add_credits
    add_credits(test_user.id, 100, db_session)

    fake_img = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"\x00" * 200)
    resp = client.post(
        "/api/v1/upload",
        files={"file": ("test.png", fake_img, "image/png")},
        data={"name": "Test Pet"},
        headers=auth_headers,
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "pet_id" in data
    assert "job_id" in data
    assert data["status"] == "queued"


def test_upload_bad_type(client, auth_headers):
    resp = client.post(
        "/api/v1/upload",
        files={"file": ("test.txt", io.BytesIO(b"text"), "text/plain")},
        headers=auth_headers,
    )
    assert resp.status_code == 400
