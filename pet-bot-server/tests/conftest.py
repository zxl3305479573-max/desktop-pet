import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base, get_db
from app.main import app
from app.auth import hash_password
from app.models.user import User

TEST_DB_URL = "sqlite:///./test.db"


@pytest.fixture
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def client(db_session):
    def override_get_db():
        yield db_session
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def test_user(db_session) -> User:
    user = User(id="test-user-1", email="test@petbot.io", password_hash=hash_password("secret123"))
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def auth_headers(test_user) -> dict:
    from app.auth import create_token
    token = create_token(test_user.id)
    return {"Authorization": f"Bearer {token}"}
