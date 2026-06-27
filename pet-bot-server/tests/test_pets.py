def test_list_pets_empty(client):
    resp = client.get("/api/v1/pets/")
    assert resp.status_code == 200
    assert resp.json() == {"pets": [], "total": 0}
