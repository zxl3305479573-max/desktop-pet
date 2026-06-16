def test_list_pets_empty(client, auth_headers):
    resp = client.get("/api/v1/pets/", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"pets": [], "total": 0}


def test_list_pets_requires_auth(client):
    resp = client.get("/api/v1/pets/")
    assert resp.status_code in (401, 403)
