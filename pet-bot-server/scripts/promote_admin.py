"""将指定邮箱的用户提升为管理员。"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.database import SessionLocal
from app.models.user import User


def promote(email: str):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            print(f"错误: 用户 {email} 不存在")
            return
        user.role = "admin"
        db.commit()
        print(f"✅ {email} 已提升为管理员")
    finally:
        db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("用法: python scripts/promote_admin.py <邮箱>")
        sys.exit(1)
    promote(sys.argv[1])
