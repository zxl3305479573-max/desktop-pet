import shutil
from pathlib import Path
from app.config import settings


class LocalStorage:
    def save_upload(self, file_bytes: bytes, filename: str) -> str:
        dest_dir = Path(settings.upload_dir)
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / filename
        dest.write_bytes(file_bytes)
        return str(dest).replace("\\", "/")

    def save_asset(self, file_bytes: bytes, pet_id: str, name: str) -> str:
        asset_dir = Path(settings.asset_dir) / pet_id
        asset_dir.mkdir(parents=True, exist_ok=True)
        dest = asset_dir / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(file_bytes)
        return str(dest).replace("\\", "/")

    def read(self, path_str: str) -> bytes:
        return Path(path_str).read_bytes()

    def delete_pet_assets(self, pet_id: str):
        asset_dir = Path(settings.asset_dir) / pet_id
        if asset_dir.exists():
            shutil.rmtree(asset_dir)

    def get_asset_path(self, pet_id: str, name: str) -> str:
        """Return full path for a pet asset."""
        asset_dir = Path(settings.asset_dir) / pet_id
        return str(asset_dir / name)

    def delete_upload(self, path_str: str):
        p = Path(path_str)
        if p.exists():
            p.unlink()


storage = LocalStorage()
