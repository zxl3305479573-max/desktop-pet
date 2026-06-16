from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.pet import Pet
from app.schemas.pet import PetResponse, PetDetailResponse, PetListResponse
from app.auth import get_current_user

router = APIRouter(prefix="/api/v1/pets", tags=["pets"])


@router.get("/", response_model=PetListResponse)
def list_pets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pets = db.query(Pet).filter(Pet.user_id == user.id).order_by(Pet.created_at.desc()).all()
    return PetListResponse(
        pets=[PetResponse.model_validate(p) for p in pets],
        total=len(pets),
    )


@router.get("/{pet_id}", response_model=PetDetailResponse)
def get_pet(pet_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")
    return PetDetailResponse.model_validate(pet)


@router.delete("/{pet_id}", status_code=204)
def delete_pet(pet_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet not found")

    from app.storage.local import storage
    storage.delete_pet_assets(pet_id)
    if pet.source_photo_path:
        storage.delete_upload(pet.source_photo_path)

    db.delete(pet)
    db.commit()
