from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.models.credit_transaction import CreditTransaction
from app.auth import get_current_user
from app.services.pipeline import add_credits
from app.config import settings

router = APIRouter(prefix="/api/v1/credits", tags=["credits"])


class RechargeRequest(BaseModel):
    amount: int = Field(ge=1, le=10000)


class CreditInfo(BaseModel):
    balance: int
    cost_per_generation: int
    transactions: list[dict]

    model_config = {"from_attributes": True}


@router.get("/me")
def get_credits(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txns = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(20)
        .all()
    )
    return {
        "balance": user.credits,
        "cost_per_generation": settings.credit_cost_per_generation,
        "transactions": [
            {
                "id": t.id,
                "type": t.type.value,
                "amount": t.amount,
                "balance_after": t.balance_after,
                "description": t.description,
                "created_at": t.created_at.isoformat(),
            }
            for t in txns
        ],
    }


@router.post("/recharge")
def recharge(
    body: RechargeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mock recharge — in production, integrate with payment gateway."""
    new_balance = add_credits(
        user.id, body.amount, db,
        description=f"Recharge: +{body.amount} credits",
    )
    return {"balance": new_balance, "recharged": body.amount}
