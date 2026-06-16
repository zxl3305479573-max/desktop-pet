from app.providers.base import AIProvider
from app.providers.builtin import BuiltinProvider
from app.config import settings

_providers: dict[str, AIProvider] = {}


def get_provider(name: str = "builtin") -> AIProvider:
    if name not in _providers:
        if name == "builtin":
            _providers[name] = BuiltinProvider(api_key=settings.builtin_provider_key)
        else:
            raise ValueError(f"Unknown provider: {name}")
    return _providers[name]
