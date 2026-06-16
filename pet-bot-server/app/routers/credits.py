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


def _require_admin(user: User):
    if user.role != "admin":
        raise HTTPException(403, "管理员权限不足")


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


# ── Admin endpoints ──

@router.get("/admin/users")
def admin_list_users(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(user)
    users = db.query(User).order_by(User.created_at.desc()).all()
    return {
        "users": [
            {
                "id": u.id,
                "email": u.email,
                "credits": u.credits,
                "role": u.role,
                "created_at": u.created_at.isoformat(),
            }
            for u in users
        ]
    }


@router.post("/admin/promote/{target_email}")
def promote_to_admin(
    target_email: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _require_admin(user)
    target = db.query(User).filter(User.email == target_email).first()
    if not target:
        raise HTTPException(404, "用户不存在")
    target.role = "admin"
    db.commit()
    return {"email": target.email, "role": target.role, "message": "已提升为管理员"}


class AdjustRequest(BaseModel):
    email: str
    amount: int = Field(ge=0)


@router.post("/admin/adjust-credits")
def admin_adjust_credits(
    body: AdjustRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Admin can set any user's credits to a specific amount."""
    _require_admin(user)
    target = db.query(User).filter(User.email == body.email).first()
    if not target:
        raise HTTPException(404, "用户不存在")

    delta = body.amount - target.credits
    if delta > 0:
        add_credits(target.id, delta, db, description=f"管理员充值 +{delta}")
    elif delta < 0:
        target.credits = body.amount
        db.commit()

    return {"email": target.email, "credits": target.credits, "message": f"积分已调整为 {body.amount}"}
