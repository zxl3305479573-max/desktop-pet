from app.providers.base import AIProvider

_providers: dict[str, AIProvider] = {}


def get_provider(name: str = "builtin") -> AIProvider:
    if name not in _providers:
        if name == "builtin":
            from app.providers.builtin import BuiltinProvider

            _providers[name] = BuiltinProvider()
        else:
            raise ValueError(f"Unknown provider: {name}")
    return _providers[name]


def invalidate_provider_cache() -> None:
    """Clear cached providers so the next ``get_provider()`` picks up new config."""
    _providers.clear()
